# pi-recap

![pi-recap banner](https://fcskjxapefiqdclrvbtw.supabase.co/storage/v1/object/public/assets/pi-packages/pi-recap-banner.jpg)

**Never scroll back to remember what you were doing.**

An always-visible session recap panel for [pi coding agent](https://github.com/badlogic/pi-mono) showing the current goal and last few conversation turns with live streaming updates.

![pi-recap demo](assets/demo.gif)

*Banner and screenshot images created with [pi-banana](https://github.com/fornace/pi-banana).*

## Features

- **Auto-derived session goal** — the title updates automatically after the first turn using a fast LLM
- **Turn history** — last 4 recaps with timestamps, speaker tags (`you` / `pi`), and fade-to-dim for older entries
- **Live streaming** — breathing dot while thinking, caret blink during token arrival, 180ms settle animation on completion
- **Keyboard and mouse navigation** — `Ctrl+Shift+R` or a click to focus, `↑↓` or the wheel to scroll older entries, `Esc` or a second click to release
- **Panel position** — keep the panel above the input box (default) or pin it to the top of a fullscreen window, so it never moves while the chat scrolls. Switch it any time with `/recap` → **position**; the choice is saved to `state/config.json`.
- **Slash commands** — `/goal` to override the title, `/recap-model` to pick the summarization model, `/recap-blacklist` to manage the model skip-list
- **Theme-agnostic text colors** — recap headline and body use hardcoded high-contrast colors that work on any theme (light or dark)
- **Cheap summarization** — auto-selects the fastest/cheapest available model (flash/mini/haiku/turbo) to keep costs near zero. Curated chain and blacklist seed come from a vendored copy of [pi-bench](https://github.com/fornace/pi-bench) data (`vendor/pi-bench/`, MIT), so there is no global install and no CSV read at startup.

## Installation

This fork (`yuzhi535/pi-recap`) carries the four upstream pull requests listed under
[Fork changes](#fork-changes) plus a request-options fix for gateway models. There is nothing to
install besides the source: benchmark data is vendored in `vendor/pi-bench/`, and Pi loads the
TypeScript directly through jiti.

Pi auto-discovers extensions from `~/.pi/agent/extensions/`. Clone the fork there:

```bash
git clone https://github.com/yuzhi535/pi-recap.git ~/.pi/agent/extensions/pi-recap
```

Restart pi. The recap panel appears above the editor after your first message.

Alternatively install it as a Pi package: `pi install git:github.com/yuzhi535/pi-recap`. Pi then
keeps its own copy of the files, while the panel's state stays at
`~/.pi/agent/extensions/pi-recap/state/` (set `PI_RECAP_HOME` to move the state root).

## Usage

The panel is passive — it just shows the last few turns. No configuration needed.

| Input | Action |
|---|---|
| `Ctrl+Shift+R` or click a row | Focus the recap panel |
| `↑` / `↓` or wheel over the panel | Navigate older entries |
| `Esc`, `Ctrl+Shift+R`, or click the selected row | Release focus |
| any other key while focused | Releases focus and types the key into the editor |

The mouse works without any keybinding, which covers terminals and multiplexers that never deliver `Ctrl+Shift+R`.

### Slash commands

Type `/recap` for the interactive menu. No arguments needed — everything is selection-based.

| Menu path | Description |
|---|---|
| `/recap` → **goal: ...** | Set/override the session goal (text input) |
| `/recap` → **clear goal** | Remove override, return to auto-derivation |
| `/recap` → **model: ...** | Pick from available fast models (select list) |
| `/recap` → **clear model** | Remove model override |
| `/recap` → **position: ...** | Choose **Above the editor (default)** or **Top of screen (pinned)**. Saved globally, applied immediately |
| `/recap` → **blacklist: N entries** → **view / add / remove / reset / re-seed** | Manage the model skip-list |

### Panel position

`/recap` → **position** offers two placements:

- **Above the editor (default)** — the panel sits just above the input box, in the chat column. This is the layout every earlier version used, and what you get if `position` is absent from the config file.
- **Top of screen (pinned)** — in a fullscreen window the panel is mounted as the window's first row. It takes its own height at the top, the conversation scrolls underneath it, and it stays put. In a regular (non-fullscreen) terminal there is no window root to pin to, so the panel simply stays above the editor.

The setting is global and lives next to the model override in `~/.pi/agent/extensions/pi-recap/state/config.json`:

```json
{
	"modelOverride": "<model-id>",
	"position": "top"
}
```

Writing one setting never rewrites the other away. Editing the file by hand works too — unknown or missing values fall back to `aboveEditor`.

## Architecture

```
pi-recap/
├── index.ts           # Extension entry point (hooks, slash commands, state management)
├── state/
│   ├── state.ts       # HistoryEntry type, speaker enum
│   ├── store.ts       # In-memory state + persistence (session branch entries)
│   ├── replay.ts      # Restore state from session entries on restart
│   └── blacklist.ts   # Persistent model skip-list
├── subagent/
│   ├── recap.ts       # User & agent recap generation (streams from cheap model)
│   ├── goal.ts        # Session goal derivation (streams from cheap model)
│   └── picker.ts      # Model selection chain: override → cache → curated → ctx.model
├── ui/
│   ├── status-widget.ts  # TUI component (rendered above editor)
│   └── anim.ts        # Animation primitives (streaming dot, settle sweep, color utilities)
├── util/
│   ├── date.ts        # Timestamp formatting ("now", "14m", "14:30")
│   └── log.ts         # Best-effort debug logging
└── vendor/
    └── pi-bench/      # Vendored pi-bench data and benchmark UI (MIT)
```

### Model picker chain

The summarization model is selected through a 4-layer chain (top wins):

1. **User override** — set via `/recap-model <id>`
2. **Cached winner** — 24h TTL from last successful run
3. **Curated chain** — fast/cheap models from the vendored [pi-bench](https://github.com/fornace/pi-bench) data, ordered by bench rank
4. **Session model** — pi's configured model (sacred fallback, never blacklisted)

## Development

```bash
cd ~/.pi/agent/extensions/pi-recap
npm install        # types + typescript
npx tsc            # type-check (no emit, jiti loads .ts directly)
```

Pi loads `.ts` files via jiti — no build step needed during development. Compiled `.js` mirrors
are deliberately not committed on this fork, and `tsc` output is gitignored, so a stale build can
never shadow the sources.

### Testing

```bash
npx tsx test-recap.ts            # test recap/goal generation with mock registry
npx tsx test-recap-models.ts     # test model picker chain against real registry
```

## License

MIT

## From the same author

By [Francesco Frapporti](https://fornace.it) at [Fornace](https://fornace.it).

- **[pi-bench](https://github.com/fornace/pi-bench)** — LLM benchmark toolkit for pi. Probes every model to find the fastest and cheapest. This extension uses pi-bench data to pick summarization models.
- **[pi-banana](https://github.com/fornace/pi-banana)** — Generate and edit images inside pi using Google Nano Banana. The banner and screenshot images above were created with pi-banana.
- **[pi-alibaba-models](https://github.com/fornace/pi-alibaba-models)** — Complete Alibaba provider for pi: Qwen, DeepSeek, Kimi, GLM, MiniMax with native thinking levels.
- **[pi-notte-theme](https://github.com/fornace/pi-notte-theme)** — Notte: a true-dark pi theme where darkness has color and text glows like terminal phosphor.

## Fork changes

`yuzhi535/pi-recap` tracks upstream 0.8.22 and adds:

- **Mouse support** — click a row to focus, wheel to walk older entries, click the selected row or
  press `Esc` to release (upstream #15).
- **Panel position** — `/recap` → *position* pins the panel to the top row of a fullscreen window
  (upstream #16).
- **Session-generation guard** — background summarization that returns after the host switched
  sessions discards its result instead of writing through a stale context (upstream #18).
- **One request-option builder** — thinking switched off where the protocol accepts it, the lowest
  accepted reasoning effort for GLM models, `temperature` omitted on the Responses API
  (upstream #17 covers the OpenAI-compatible half).
- **Vendored pi-bench** — `vendor/pi-bench/` holds pi-bench 0.2.5 (MIT) so the extension loads
  without a global npm dependency.

The benchmark action (`/bench`) needs host exports that Pi 1.5.0 no longer provides; the extension
checks first and reports "Benchmark unavailable" instead of failing. Everything else runs.

## Changelog

### 0.9.0 (fork)

- Merged the four pull-request branches above onto upstream 0.8.22.
- Replaced `thinkingOffOpts` with `recapRequestOptions`, shared by the recap and title calls, so a
  model that would spend its tiny output budget on reasoning returns text instead.
- Vendored pi-bench data and UI; the runtime `pi-bench` dependency is gone.
- Fixed a broken import (`../vendor/pi-bench/ui.ts` → `./vendor/pi-bench/ui.ts`) that made the
  extension fail to evaluate, which silently disabled the panel.
- Removed committed `.js` mirrors and `package-lock.json` so the tree has one source of truth.

### 0.8.16

- Fixed double-render of the recap panel during pi-tui startup. The widget now registers on first user input (`before_agent_start`) instead of `session_start`, preventing the panel from appearing twice when pi first launches.
- Added raw Enter keypress listener via `onTerminalInput` to bump the decoy row at the earliest possible moment, before pi processes the submit. This gives maximum time for the decoy to clear orphaned border fragments in scrollback. The listener skips when the recap widget has focus and never consumes the keypress.
