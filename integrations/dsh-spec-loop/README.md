# dsh-spec-loop — DeepSeek Harness (DSH) composer toggle

A DSH host+client plugin that adds a **"Spec Loop" pill toggle** to the
composer tool row (left of the input, beside the access-mode / plan
controls), plus an **✎ edit button** that opens a viewer/editor for the
injected text. Toggling it on pins the `ds-spec-loop` skill into the
conversation **for that session only**; toggling it off stops further
injection. Each session has its own independent switch.

## How the text is injected

Since **0.2.0** the default is `user-message`: the text enters the
conversation as a plugin-sourced **user message** through the
`agent/pre-step` waterfall, wrapped in `<spec-loop>` tags — the same seam
and message shape the shipped `dsh-time-context` plugin uses. Consequences:

- it is **visible in the transcript** (rendered as a context node) and
  lands in the durable session log;
- it costs its tokens **once**, not on every request.

Because a durable message sinks into history, the plugin does **not**
re-inject per turn (the skill is ~5k tokens; per-turn would add that to the
log every turn). It re-injects only when the text stopped being effective:

| situation | behaviour |
|---|---|
| never injected in this session | inject |
| a copy is still on the session surface | skip |
| compaction pruned the copy off the surface | **re-inject (self-healing)** |
| the text was edited since the live copy | re-inject the new text |

Set `injectAs: system-prompt` in the plugin row config to restore the
pre-0.2.0 behaviour (one global `systemPrompt` section rendered only for
toggled-on sessions).

### Why not the system prompt — prompt cache

This is the main reason the default moved off `systemPrompt`.

Prompt caching is a **prefix** cache: the request is
`[system prompt][message 1]…[message N]`, and a provider reuses the longest
common prefix. Constraints are meant to be **edited over time**, and where
you put them decides what an edit costs:

| constraints live in | editing them invalidates |
|---|---|
| the system prompt | the very first tokens → **the whole cache, for every session** |
| a message at the tail | nothing before it → **the cached prefix survives** |

So an edit here is applied by **appending a fresh block at the tail**. The
previous block is deliberately left in history: rewriting or deleting that
event would change the cached prefix — the exact invalidation this design
avoids. What makes that correct is the supersede line `wrapText()` puts in
the wrapper (never in the editable body, so an edit cannot drop it):

```
<spec-loop>
Constraints the user pinned for this session. Follow them for all applicable work.
This block REPLACES every earlier <spec-loop> block in this conversation: where they differ, the earlier ones are stale — follow this one.

…your constraints…
</spec-loop>
```

Per-request token cost is roughly the same either way — one copy rides along
in the history just as a system section would. What the tail placement buys
is that **changing the rules is cheap**, and what the surface check buys is
that a compaction cannot silently drop them.

## Viewing and editing

The ✎ button opens a panel showing the exact text that gets injected.

- **Effective text** = the override file when present, otherwise the skill
  body (`SKILL.md` with its YAML front matter stripped, plus a short
  preamble).
- **Saving** writes `<DSH_HOME>/storages/spec-loop-prompt.md`. `SKILL.md`
  is never modified, so **恢复默认 (reset)** restores the shipped skill
  verbatim by deleting the override.
- Both files are read from disk at injection time, so an edit applies to
  the next injection without a restart.

## Halves

- **Host** (`lib/index.js`): the `agent/pre-step` listener (or the legacy
  `systemPrompt` section), and a loopback-fenced JSON API
  `POST /spec-loop/api`:

  | body | effect |
  |---|---|
  | `{sessionId}` | read state |
  | `{sessionId, enabled}` | toggle the session |
  | `{sessionId, text}` | save the override |
  | `{sessionId, reset:true}` | drop the override |

  Every shape answers `{ok, enabled, text, isOverride, skillText, injectAs}`.
- **Client** (`lib/client.js`): a hand-authored DSH client module
  (`window.__ModuleLoader__` factory format) registering the pill, the edit
  button and the editor panel into the `conversation.input.left` slot.

## Install

1. Install the skill itself (this repo) into your user skill root:

   ```
   <DSH_HOME>/skills/ds-spec-loop/   # copy of skills/ds-spec-loop from this repo
   ```

   (`DSH_HOME` defaults to `~/.dsh`. The plugin reads
   `$DSH_HOME/skills/ds-spec-loop/SKILL.md`.)

2. Copy this directory into your DSH profiles' shared `node_modules`:

   ```
   <DSH_HOME>/profiles/node_modules/dsh-spec-loop/
   ├── package.json
   └── lib/{index.js, client.js}
   ```

3. Mount it in each profile's patch layer
   (`<DSH_HOME>/profiles/<profile>/cordis.patch.yml`):

   ```yaml
   - insert:
       - id: spec-loop
         name: dsh-spec-loop
         # config:
         #   injectAs: user-message   # default; or `system-prompt` for the old behaviour
   ```

4. Fully restart DSH.

## Tests

```
node test-inject.mjs
```

Pure unit tests (no network, no DSH): tag wrapping, the surface-aware
injection decision (including the compaction self-heal), message shape and
per-session isolation, and the override save/reset round trip. Run it from
a location where `@deepseek-ai/dsh-llm` resolves (e.g. the installed copy
under `profiles/<name>/node_modules/dsh-spec-loop`).

## Notes

- Toggle state is process-local by design: after a DSH restart every
  session starts with the toggle off. The **override text** is a file, so
  it does survive restarts.
- The HTTP endpoint accepts loopback (`127.0.0.1` / `localhost` / `::1`)
  requests only.
- The host half imports `createUserMessage` from `@deepseek-ai/dsh-llm`,
  which resolves from the DSH installation closure.
