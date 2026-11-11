# pi-recap — fork build notes

Fork: `yuzhi535/pi-recap`, based on upstream `Fornace/pi-recap` at **v0.8.22** (commit `730ae61`,
MIT — see `LICENSE`). Author, licence and attribution are unchanged.

This fork exists because four upstream pull requests plus a request-options fix were needed in
daily use against an OpenAI-compatible gateway. It is not a publish of upstream's npm package; it
is installed from git.

## What this build adds over 0.8.22

1. **Mouse support** — click a recap row to focus the panel, wheel to walk older entries, click the
   selected row (or press `Esc`) to release. Works without any keybinding, which covers terminals
   that never deliver `Ctrl+Shift+R`. Upstream PR #15.
2. **Panel position switch** — `/recap` → *position* pins the panel to the top row of a fullscreen
   window or leaves it above the editor. Stored as `position` in the state file; unknown or missing
   values fall back to `aboveEditor`. Upstream PR #16.
3. **Session-generation crash guard** — a counter is bumped on session start and shutdown. A
   background summarization that returns after the host switched sessions discards its result
   instead of writing through a stale context, and the state writer logs failures instead of
   throwing. Upstream PR #18.
4. **Request options for reasoning models** — one builder (`subagent/picker.ts`,
   `recapRequestOptions`) is used by both the recap and the title call. It keeps the upstream output
   budgets (256 / 64 tokens) and picks the switch each protocol actually accepts:
   - OpenAI-compatible gateway models: an explicit off switch for the DeepSeek family; the lowest
     accepted reasoning effort for the GLM family, because those models reject every off switch.
     This is a per-family workaround, not a claim about all models.
   - OpenAI Responses: `reasoning.effort` at its lowest named level, and `temperature` is never
     sent — the request builder omits it and a payload hook removes it if anything else added it.
   - Anthropic and Google keep the adapter's own thinking switch, off.
5. **Vendored pi-bench** — `vendor/pi-bench/` holds pi-bench 0.2.5 (MIT) source, so the extension
   loads without a global npm install and without reading a benchmark CSV from an installed
   package. The two curated arrays were moved verbatim into `vendor/pi-bench/data.ts` so the picker
   imports data only, without evaluating the benchmark runner at startup; `bench.mts` re-exports
   them, so its public surface is unchanged.

## Deliberate departures from upstream packaging

- **No compiled `.js` mirrors.** Upstream commits an `index.js` and a `.js` next to every `.ts`.
  Here they are deleted and gitignored, because they were stale copies of the pre-fork code and a
  file that nobody loads but everybody reads is a trap. Pi's loader (jiti) runs the `.ts` files
  directly, and `npx tsc` still type-checks them.
- **No `package-lock.json`.** With the runtime dependency removed there is nothing to lock; rerun
  `npm install` if you want the dev dependencies.
- **Import specifiers use `.ts`.** Pi's loader resolves them, and `bun`/`tsx` do too. Upstream's
  `.js` specifiers remain valid if this tree is ever merged back.

## The benchmark action

`/bench` spawns `vendor/pi-bench/bench.mts`, which imports host exports (`AuthStorage`,
`ModelRegistry`, `discoverAndLoadExtensions`) that Pi 1.5.0 no longer provides. The extension checks
for them first and reports "Benchmark unavailable — this Pi build does not export …" instead of
crashing. Recap summarization never touches that path.

## State and logs

- `state/config.json` — the user's `modelOverride` and `position`. Machine state, gitignored.
- `state/blacklist.json` — models skipped after repeated failures. Machine state, gitignored.
- `_tmp/recap.log` — best-effort debug log. Gitignored.

Default location is `~/.pi/agent/extensions/pi-recap/`; `PI_RECAP_HOME` overrides the root. A
package install (`pi install git:…`) keeps the code elsewhere while this state root stays the same.

## Verification performed for 0.9.0

Run on macOS with Pi 1.5.0 (jiti loader), Bun 1.3.14 and Node 24:

```bash
# 1. the module evaluates, and the exported factory registers its hooks and command
bun -e 'const m = await import("./index.ts"); await m.default(piRecorder)'
#    -> module evaluated; 8 handlers (session_start, session_compact, session_tree,
#       session_shutdown, input, before_agent_start, message_start, agent_end);
#       commands: recap; one shortcut registered

# 2. Pi's own loader discovers the entry (throwaway cwd + agent dir)
bun -e 'discoverAndLoadExtensions(["."], tmpCwd, tmpAgentDir)'
#    -> entries: 1, errors: [], commands: recap, handlers: 8

# 3. a real pi process with only this extension loaded
PI_RECAP_HOME=$tmp pi -p -ne -e ./index.ts --offline --mode json \
  --session-dir "$tmp/sessions" --model <cheap-model> "say hi in three words"
#    -> no extension errors, no stderr output, answer returned;
#       the extension seeded its blacklist (14 entries) in $tmp/state
```

`-ne` (no extension discovery) plus `-e` is what keeps the check from loading the machine's other
extensions, so a failure points at this tree only.

Known gaps, stated so nobody assumes more than was tested:

- Mouse click, wheel, hover and the pinned-row layout were verified by reading the code and by the
  author's daily use; there is no automated UI test, and this build was not exercised in every
  terminal or multiplexer.
- The benchmark button is verified only to degrade gracefully on Pi 1.5.0; it cannot run there.
- Model-specific request options were exercised against this machine's gateway with DeepSeek and
  GLM models. Other providers keep the adapter's own defaults and were not re-tested.
