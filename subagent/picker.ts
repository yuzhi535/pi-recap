/**
 * Pure model-picker logic for recap streams (v6, 4-layer chain).
 *
 * Lives in its own file (no pi-ai runtime imports, only types) so the probe
 * harness can exercise the ranking deterministically without hauling in the
 * provider stack at module-load time.
 *
 * The chain (top-to-bottom, every layer skips blacklisted ids):
 *   1. user-locked override (modelOverride / preferredId)        -- never blacklisted
 *   2. cached winner with 24h TTL (cachedWinner.id)              -- skipped if expired or blacklisted
 *   3. CURATED_CHAIN (imported from pi-bench)                    -- skipped if blacklisted
 *   4. ctx.model (the user's session model) -- never blacklisted, last
 *      resort, even if it's a reasoning flagship. thinkingOffOpts disables
 *      reasoning for the recap call.
 *
 * v6 removes the regex+sort discovery layer (old layer 4). pi-bench is the
 * source of truth — if a model isn't benched, the session model is a safer
 * fallback than guessing from naming patterns and version numbers.
 *
 * Public surface:
 *   - thinkingOffOpts(model): per-provider knob to disable extended thinking
 *   - findFastModelChain(...): the 4-layer ordered chain
 *   - CURATED_CHAIN: editable -- one named const, no scattered literals.
 */

import type { Api, Model } from "@earendil-works/pi-ai";
import { type CachedModel, isCachedModelFresh } from "../state/state.ts";
import { isBlacklisted } from "../state/blacklist.ts";
import { CURATED_CHAIN } from "../vendor/pi-bench/data.ts";

/**
 * Rewrite the outgoing provider payload, adding one field.
 *
 * pi's OpenAI-compatible adapter invokes `onPayload` after it builds the
 * request body, and a non-undefined return value replaces that body. The
 * recap budgets are tiny (64 tokens for the goal, 256 for a recap), so a
 * model that spends its first tokens on reasoning returns empty text. This
 * hook is what keeps that budget for the answer itself.
 */
function injectPayloadField(field: string, value: unknown) {
	return {
		onPayload: (payload: unknown) => {
			if (!payload || typeof payload !== "object") return undefined;
			return { ...(payload as Record<string, unknown>), [field]: value };
		},
	};
}

/**
 * Remove one field from the final request body.
 *
 * Used where the provider rejects a field the adapter would otherwise send.
 * Deleting it here is the last step before the request leaves, so a model
 * config that carries its own sampling parameters cannot reintroduce it.
 */
function dropPayloadField(field: string) {
	return {
		onPayload: (payload: unknown) => {
			if (!payload || typeof payload !== "object") return undefined;
			if (!(field in (payload as Record<string, unknown>))) return undefined;
			const next = { ...(payload as Record<string, unknown>) };
			delete next[field];
			return next;
		},
	};
}

/**
 * Per-provider switch that keeps a reasoning model from spending the recap
 * budget before it writes an answer.
 *
 * This is a per-family workaround for the endpoints we actually call, not a
 * statement that every model behind a protocol supports the same knob.
 *
 *   - anthropic-messages: the adapter's own thinking switch, off.
 *   - google: the adapter's own thinking switch, off.
 *   - openai-completions: the adapter only emits a thinking field for endpoint
 *     flavours it recognises (a DeepSeek base URL, a native provider). A
 *     generic gateway is not recognised, so nothing is sent and the server
 *     keeps thinking on by default. We inject the switch for recap calls only,
 *     leaving the user's normal sessions untouched:
 *       * DeepSeek served that way accepts a real off switch, so send it.
 *       * GLM served that way rejects every explicit off switch and only
 *         accepts a reasoning effort level, so send its lowest accepted level.
 *         On the gateway we use, that level was measured to leave the answer
 *         intact under a 256-token budget; it is not a claim that every GLM
 *         deployment behaves the same way.
 *   - openai-responses: reasoning models take `reasoning.effort`, which the
 *     adapter writes when `reasoningEffort` is set. The same models reject
 *     `temperature`, so the request builder below never sends it and the
 *     payload hook removes it if anything else added it.
 */
export function thinkingOffOpts(model: Model<Api>): Record<string, unknown> {
	switch (model.api) {
		case "anthropic-messages":
			return { thinkingEnabled: false };
		case "google-generative-ai":
		case "google-vertex":
			return { thinking: { enabled: false } };
		case "openai-completions": {
			if (!model.reasoning) return {};

			if (/deepseek/i.test(model.id)) {
				return injectPayloadField("thinking", { type: "disabled" });
			}

			if (/glm/i.test(model.id)) {
				return injectPayloadField("reasoning_effort", "low");
			}

			return {};
		}
		case "openai-responses": {
			if (!model.reasoning) return {};
			return { reasoningEffort: "low", ...dropPayloadField("temperature") };
		}
		default:
			return {};
	}
}

/** Output budget for the turn recap. Unchanged from the upstream build. */
export const RECAP_MAX_TOKENS = 256;

/** Output budget for the auto-derived session title. Unchanged upstream. */
export const GOAL_MAX_TOKENS = 64;

/**
 * The one options object both summary call sites hand to `stream()`.
 *
 * Recap budgets are tiny (64 tokens for the title, 256 for a recap) and a
 * reasoning model that burns them before answering produces empty text, so
 * every call goes through here: fixed budget, deterministic sampling, and the
 * thinking switch above.
 *
 * `temperature` is sent as 0 for every protocol that accepts it. OpenAI
 * Responses reasoning models reject it, so it is omitted there entirely -- not
 * set to undefined and hoped away -- and the payload hook enforces that.
 */
export function recapRequestOptions(model: Model<Api>, maxTokens: number): Record<string, unknown> {
	const base: Record<string, unknown> = { maxTokens };
	const stripsTemperature = model.api === "openai-responses" && model.reasoning;
	if (!stripsTemperature) base.temperature = 0;
	return { ...base, ...thinkingOffOpts(model) };
}

// ── CURATED CHAIN ──────────────────────────────────────────────────────
//
// Vendored pi-bench data (see vendor/pi-bench/data.ts). Re-exported so the
// rest of the extension keeps one import site for the chain.

export { CURATED_CHAIN };

/**
 * Build the v6 ordered fallback chain.
 *
 * Layer order:
 *   1. preferredId (override) -- ALWAYS placed first if it resolves; sacred,
 *      never blacklist-skipped here (the user explicitly asked for it).
 *   2. cached winner if non-null AND fresh (within TTL) AND not blacklisted.
 *   3. CURATED_CHAIN ids that are available + not blacklisted.
 *   4. sessionModel (ctx.model) at the very end. Never blacklisted; sacred.
 *
 * Filters duplicates by model.id so the same handle isn't tried twice.
 */
export function findFastModelChain(
	registry: { getAvailable(): Model<Api>[] },
	preferredId: string | undefined,
	sessionModel: Model<Api> | undefined,
	cachedWinner?: CachedModel | undefined,
	now: number = Date.now(),
): Model<Api>[] {
	const available = registry.getAvailable();
	const byId = new Map<string, Model<Api>>();
	for (const m of available) byId.set(m.id, m);

	const seen = new Set<string>();
	const chain: Model<Api>[] = [];

	const push = (m: Model<Api> | undefined): void => {
		if (!m) return;
		if (seen.has(m.id)) return;
		seen.add(m.id);
		chain.push(m);
	};

	// Layer 1: user override. Never blacklist-checked here -- sacred.
	if (preferredId) {
		const target = byId.get(preferredId);
		if (target) push(target);
		else {
			// Fallback: resolve bench CSV bare handle (e.g. "claude-haiku-4.5")
			// to pi-ai registry ID (e.g. "anthropic.claude-haiku-4-5-20251001-v1:0").
			// Handles dot→dash normalization and provider-prefix suffix matching.
			const normalized = preferredId.replace(/\./g, "-");
			const resolved = available.find(
				(m) =>
					m.id === normalized ||
					m.id.endsWith("." + normalized) ||
					m.id.endsWith("." + preferredId) ||
					m.id.endsWith("-" + preferredId),
			);
			if (resolved) push(resolved);
		}
	}

	// Layer 2: cached winner with 24h TTL. Skip if expired or blacklisted.
	if (isCachedModelFresh(cachedWinner, now) && cachedWinner) {
		if (!isBlacklisted(cachedWinner.id)) {
			const cached = byId.get(cachedWinner.id);
			if (cached) push(cached);
		}
	}

	// Layer 3: curated chain. Skip blacklisted.
	for (const id of CURATED_CHAIN) {
		if (isBlacklisted(id)) continue;
		const m = byId.get(id);
		if (m) push(m);
		else {
			// Fallback: resolve bare handle to registry ID.
			const normalized = id.replace(/\./g, "-");
			const resolved = available.find(
				(a) =>
					a.id === normalized ||
					a.id.endsWith("." + normalized) ||
					a.id.endsWith("." + id) ||
					a.id.endsWith("-" + id),
			);
			if (resolved && !isBlacklisted(resolved.id)) push(resolved);
		}
	}

	// Layer 4: sessionModel. Never blacklisted; sacred.
	if (sessionModel) push(sessionModel);

	return chain;
}
