# dsh-spec-loop — DeepSeek Harness (DSH) composer toggle

A DSH host+client plugin that adds a **"Spec Loop" pill toggle** to the
composer tool row (left of the input, beside the access-mode / plan
controls), plus an **✎ button** that opens a manager for the injected
content. Toggling it on pins the selected constraints into the conversation
**for that session only**; toggling it off stops further injection. Each
session has its own independent switch.

Since **0.3.0** the plugin owns a **library of injection items** rather than
one blob of text. Each item pairs a Chinese source with the English product,
any number can be selected at once, and the selected ones merge into a single
`<spec-loop>` block. The shipped `ds-spec-loop` skill is one built-in item.

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
| an item's text was edited since the live copy | re-inject the new text |
| an item was checked or unchecked | re-inject the new merged text |

All selected items merge into **one** block rather than one block each. The
supersede line below is what makes append-only editing correct, and it works
because the newest block always states the *complete* current truth: with one
block per item, unchecking an item would leave nothing in the conversation to
tell the model to stop following it.

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

## Managing injection items

The ✎ button opens a manager: a checkbox list of items on the left, and a
two-pane editor for the selected item.

- **Left pane — 最终注入内容 (English).** The product. This is the *only*
  text ever sent to the model.
- **Right pane — 中文原稿.** The human-facing source. It never leaves the
  process, and it is not injected in any state.
- **← 译到左侧** translates the Chinese into the English pane; **回译 →**
  goes the other way, which is how an existing English item (including the
  built-in one) gets a Chinese source the first time.
- Translation **only fills the editor**. Saving is a separate click, which
  is what makes a bad translation recoverable. It overwrites hand-written
  English only after a confirmation.
- An item whose Chinese moved on since its last translation is flagged
  **待翻译** on the list row and on the pill. It still injects its old
  English — blocking it would silently drop a constraint.
- **Titles are UI labels and are not injected.** They are written in
  Chinese, so injecting them would put Chinese into an English payload.

### Storage

The library is `<DSH_HOME>/storages/spec-loop/items.json`, written
atomically. Each record is
`{id, title, zh, en, translatedFrom, builtin, defaultSelected, order}`;
staleness is *derived* (`zh !== translatedFrom`) rather than stored, so it
cannot fall out of sync.

- For the **built-in** item, empty `zh`/`en` mean "not customised": `en` is
  synthesised from `SKILL.md` (front matter stripped, plus a short preamble)
  at read time. `SKILL.md` is never written, so **恢复默认** restores the
  shipped skill verbatim by clearing the fields.
- The library is read from disk at injection time, so an edit applies to the
  next injection without a restart.
- A pre-0.3.0 `storages/spec-loop-prompt.md` is **imported once** as the
  built-in item's English, reproducing the previous injected text byte for
  byte. The legacy file is read, never written or deleted.
- An unparseable `items.json` is moved aside to `items.json.broken`, the
  library falls back to the built-in item, and the panel reports it rather
  than swallowing the failure.

## Halves

- **Host** (`lib/index.js`): the `agent/pre-step` listener (or the legacy
  `systemPrompt` section), and a loopback-fenced JSON API
  `POST /spec-loop/api`:

  | body | effect |
  |---|---|
  | `{sessionId}` | read state |
  | `{sessionId, enabled}` | pill on/off (on restores the last selection) |
  | `{sessionId, selected:[id]}` | set this session's selection |
  | `{sessionId, upsert:{id?, title?, zh?, en?, translatedFrom?}}` | create or update one item |
  | `{sessionId, order:[id]}` | reorder the library |
  | `{sessionId, remove:id}` | delete one non-built-in item |
  | `{sessionId, resetItem:id}` | clear the built-in item's edits |

  Those shapes answer
  `{ok, enabled, selected, items, injectAs, warning?}`, where each item
  carries `resolvedEn` (what would actually be injected), `customised` and
  `stale`.

  `{sessionId, translate:{text, target}}` answers `{ok, translated}`. It is a
  pure query — it reads no storage and writes none.
- **Client** (`lib/client.js`): a hand-authored DSH client module
  (`window.__ModuleLoader__` factory format) registering the pill, the ✎
  button and the manager panel into the `conversation.input.left` slot.

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
node test-translate.mjs
```

Pure unit tests (no network, no DSH; the `llm` service is mocked). They cover
tag wrapping and multi-item merging, the surface-aware injection decision
(including the compaction self-heal and re-injection on a selection change),
message shape and per-session isolation, the guarantee that no Chinese source
or title is ever injected, staleness, built-in reset leaving `SKILL.md`
untouched, the one-way legacy import, and corrupt-library recovery.

Run them from a location where `@deepseek-ai/dsh-llm` resolves. On a desktop
install that package lives in the app closure rather than in a profile, so the
simplest rig is a scratch directory holding `lib/`, the test files, and
`node_modules/@deepseek-ai/dsh-llm` symlinked (or junctioned) to
`…/resources/app.asar.unpacked/node_modules/@deepseek-ai/dsh-llm`.

## Notes

- The **selection** is per session and process-local by design: after a DSH
  restart every session starts with the pill off. The **library** is a file,
  so items survive restarts, and `defaultSelected` records the last selection
  you made — that is what a new session's first pill click restores.
- The HTTP endpoint accepts loopback (`127.0.0.1` / `localhost` / `::1`)
  requests only.
- The host half imports `createUserMessage` from `@deepseek-ai/dsh-llm`,
  which resolves from the DSH installation closure.
