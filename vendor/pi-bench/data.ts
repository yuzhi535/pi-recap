/**
 * Vendored pi-bench data (upstream pi-bench 0.2.5, MIT).
 *
 * This file is split out of bench.mts so pi-recap can import the curated
 * chain and the blacklist seed WITHOUT evaluating the benchmark runner
 * module (which pulls the pi SDK, child-process and CSV code at load time).
 * The arrays are byte-for-byte the upstream values; bench.mts re-exports
 * them, so the /bench CLI still sees the same public surface.
 *
 * Local change (2026-11-11): extraction only. Order and contents unchanged.
 */

// CURATED_CHAIN: hand-picked ordered list of fast/cheap recap candidates.
// Top-to-bottom: fastest + cheapest first per the latest bench.
// Some entries are stubs for OTHER users (different provider keys); they
// only resolve if registry.getAvailable() returns them.

export const CURATED_CHAIN: ReadonlyArray<string> = [
	"gemini-2.5-flash-lite",                // google-vertex (bench rank 1, 460ms)
	"MiniMaxAI/MiniMax-M2.5",               // huggingface (bench rank 2, 720ms)
	"gemini-2.5-flash",                     // google-vertex (bench rank 3, 775ms)
	"claude-haiku-4.5",                     // anthropic
	"gpt-5-mini",                           // openai
	"kimi-for-coding",                      // kimi-coding (bench rank 6, 1623ms)
	"moonshotai/Kimi-K2-Instruct",          // huggingface (bench rank 9, 1858ms)
];

// BLACKLIST_SEED: known-bad models discovered during benching.
// Bootstrapped once into pi-recap's blacklist.json on first load.

export const BLACKLIST_SEED: ReadonlyArray<{ id: string; reason: string }> = [
	{ id: "gemini-1.5-flash", reason: "404 endpoint retired" },
	{ id: "gemini-1.5-flash-8b", reason: "404 endpoint retired" },
	{ id: "gemini-2.0-flash", reason: "404 endpoint retired" },
	{ id: "gemini-2.0-flash-lite", reason: "404 endpoint retired" },
	{ id: "gemini-2.5-flash-lite-preview-09-2025", reason: "404 preview decommissioned" },
	{ id: "moonshotai/Kimi-K2-Thinking", reason: "empty + reasoning" },
	{ id: "zai-org/GLM-4.7-Flash", reason: "empty + reasoning" },
	{ id: "moonshotai/Kimi-K2.6", reason: "empty + reasoning" },
	{ id: "moonshotai/Kimi-K2-Instruct-0905", reason: "empty + reasoning" },
	{ id: "zai-org/GLM-4.7", reason: "400 status code" },
	{ id: "zai-org/GLM-5.1", reason: "empty + reasoning" },
	{ id: "nvidia/nemotron-nano-9b-v2:free", reason: "empty + reasoning" },
	{ id: "nvidia/nemotron-nano-12b-v2-vl:free", reason: "empty + reasoning" },
	{ id: "deepseek-ai/DeepSeek-V3.2", reason: "empty + reasoning" },
];
