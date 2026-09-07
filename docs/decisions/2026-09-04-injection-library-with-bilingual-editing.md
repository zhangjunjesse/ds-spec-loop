# Decision: An injection library with paired bilingual editing

Status: accepted

## Problem

`dsh-spec-loop` pinned exactly one body of text. `effectiveText()` resolved a
single override file (`~/.dsh/storages/spec-loop-prompt.md`) or fell back to the
shipped `SKILL.md`, and the editor was a single `<textarea>`. Two distinct needs
were unmet.

**One text, one purpose.** Constraints are not monolithic. A session may need the
strict Spec loop, plus a house style rule, plus a "this repository is Windows-only"
note — and the next session needs a different two of those three. The only way to
vary the set was to hand-edit one blob and lose whatever it replaced. There was no
way to keep a constraint around while not using it, and no way to compose.

**Translation destroyed its own source.** The injected block is read by the model,
so English is the right language for it; the person maintaining it thinks in
Chinese. The editor acknowledged this — it offered 译成中文 / 译成英文 — but
`translate()` called `setDraft(data.translated)`, replacing the buffer in place.
Once a Chinese draft was translated to English and saved, the Chinese was gone.
Editing it again meant translating English back to Chinese (lossy), editing, then
translating forward again (lossy). Every edit cycle cost two model round-trips and
accumulated drift, so in practice the Chinese authoring path was used once and
abandoned; the user was left maintaining English they could not comfortably review.

The single-text model and the destructive translation were one problem: there was
no durable place to keep the human-facing source *alongside* the model-facing
product.

## Decision

The plugin owns a **library of injection items**, each holding a paired Chinese
source and English product.

### Data

One canonical file, `~/.dsh/storages/spec-loop/items.json`, written atomically
(temp file + rename) so a crashed write cannot truncate the library. Each record is
`{id, title, zh, en, translatedFrom, builtin, defaultSelected, order}`.

- `en` is the **only** text ever injected. It is the product.
- `zh` is the human-facing **source**. It never leaves the host process.
- `title` is a UI label only. It is not injected.
- `translatedFrom` holds the `zh` value at the last translation. Staleness is
  **derived** (`zh !== translatedFrom`), not stored, so it cannot fall out of sync.
- `builtin` marks the shipped preset. Empty `zh`/`en` mean "not customised": `en`
  is synthesised from `SKILL.md` at read time by the existing `loadSkillText()`.
  Saving writes the fields; `resetItem` clears them. `SKILL.md` is never written,
  so reset is lossless — the property the old override file provided.

A plain read writes nothing: with no `items.json` the bootstrap is recomputed each
time. A library that has lost its builtin to a hand edit gets one back, so the
shipped skill never becomes unreachable. An unparseable file is renamed to
`items.json.broken` and reported to the panel rather than silently overwritten.

### Injection

Selected items merge into **one** `<spec-loop>` block: `wrapText` accepts an array,
drops blank bodies, and joins the rest in `order` with a blank line. The wrapper —
the pinned-by-user framing and the supersede notice — is unchanged.

`liveInjectionText()` is unchanged. It already compares the entire wrapped string,
so editing an item, reordering, checking one on, or unchecking one all produce a
different string and re-inject correctly. The compaction-recovery and prompt-cache
reasoning carries over intact. A selection that resolves to no non-empty body
injects nothing rather than an empty block.

### Selection

Selection is **per session and process-local**, because "谨慎模式 on for this
conversation" is already a session-scoped idea. Each session holds `selected` plus
`last`: the pill turning off stashes the selection into `last`, and turning it on
restores it, so toggling is not destructive. Ids the library no longer has are
dropped from both, so a delete cannot strand a selection that would inject nothing.

`defaultSelected` seeds a session that has no history yet. It is **persisted as the
user's last selection** rather than being a static flag: whenever the selection
changes, the library records which items were chosen, so a new session's first pill
click reproduces the user's actual intent instead of always resurrecting the
builtin.

### Editor

The `✎` modal is a manager: a checkbox list rail on the left, and a two-pane editor
for the item under edit.

- **Left pane = English**, labelled 最终注入内容, with an approximate token count.
- **Right pane = 中文**, labelled 中文原稿, marked as not sent to the model.
- Both are editable — hand-fixing a word of English must not require a round-trip.
- Between them, **← 译到左侧** runs `zh → en`; **回译 →** runs `en → zh`, which is
  how an existing English item (including the shipped preset) gets a Chinese source
  the first time. 译到左侧 confirms before overwriting English that was hand-written
  rather than produced by an earlier translation of the same source.
- Translation **never auto-saves**. It returns a candidate; 保存 is a separate
  click. This is why a bad translation is recoverable.
- A stale item is badged 待翻译 on its list row, in the panel header, and on the
  composer pill. It still injects its old `en`: blocking it would silently drop a
  constraint, which is worse than injecting a known-old one visibly.
- Saving an untouched builtin sends `en: ''` when the English pane still equals the
  synthesised text, so the item keeps tracking `SKILL.md` instead of freezing a copy.
- Reordering uses ↑/↓ buttons rather than drag-and-drop: a drag surface inside a
  host-app modal is fragile and could not be verified here, while the buttons drive
  the same `order` API.

The API keeps its POST-only, loopback-fenced, 512 KB-capped shape and adds
`selected`, `upsert`, `order`, `remove` and `resetItem`; the responses carry each
item's `resolvedEn`, `customised` and `stale`. `{translate:{text, target}}` is
**unchanged** — it already was a pure `text → text` query touching no storage, so it
serves the paired editor as-is, including `resolveTranslateRoute`, the deliberate
`sessionId` omission that keeps the auxiliary call out of the driver's resume chain,
and the input/output/timeout caps.

### Migration

When `items.json` is absent and the legacy `spec-loop-prompt.md` exists, its
contents become the builtin item's `en`, reproducing the user's injected text byte
for byte. The legacy file is read, never written or deleted, and no file is created
until the user's first edit — so the import stays one-way and non-destructive.

## Alternatives considered

**One `<spec-loop name="…">` block per selected item.** Rejected. The supersede
notice — "this block REPLACES every earlier `<spec-loop>` block" — is what makes the
append-only strategy correct without invalidating the prompt cache. Per-item blocks
need per-name replacement semantics and a rewritten `liveInjectionText`, and give the
model an ambiguous situation when an item is unchecked mid-conversation: no new block
mentions it, so nothing tells the model to stop following it. A single merged block
that always states the complete current truth has no such gap.

**Store only English; translate to Chinese for preview when the panel opens.**
Rejected. It costs a model call on every open, makes the panel slow and non-free, and
breaks the edit loop: the Chinese you edit is a fresh translation, not the Chinese you
wrote last time, so your own phrasing never survives.

**One Markdown file per item in a folder.** Rejected. Title, order, selection default
and `translatedFrom` still need a sidecar, which splits one fact across two files.
JSON keeps one canonical home. Direct file editing was not a supported path before
either — the override file was already an implementation detail.

**Inject `## <title>` headings to separate merged items.** Rejected. Titles are
written in Chinese by a Chinese-speaking user, so injecting them puts Chinese into the
English payload and creates a third surface needing translation. A user who wants a
heading in the model-facing text can write one into the body.

**Block injection of a stale item until it is retranslated.** Rejected. Silently
dropping a constraint the user believes is active is a worse failure than injecting a
visibly-old one; the badge makes the staleness legible instead.

**Persist selection across restarts.** Rejected as a separate, independently
revisitable decision. Persisting `defaultSelected` meets the concrete need without
changing what "this session" means.

## Consequences

- The composer pill keeps its previous semantics: a new session starts off, and one
  click pins constraints. What it pins is now the user's last selection rather than
  a fixed text.
- Checking several items multiplies the injected block. The panel shows a per-item
  and a total approximate token count so the cost is visible before the click.
- A user who hand-edits English and later clicks 译到左侧 is warned before the pane
  is overwritten, but the two panes can still disagree if they edit only the left —
  the model follows the left, which is the documented contract.
- The legacy `spec-loop-prompt.md` becomes read-only history. It is imported once
  and thereafter ignored; a user with both it and an `items.json` gets only the
  latter.
- `injectAs: system-prompt` remains as a rollback path and now keys its cached text
  per session. Like before, it refreshes only when that session calls the API, which
  is acceptable for a path kept only for rollback.
- The plugin package moves to `0.3.0`.

## Verification

- `node test-inject.mjs` — passed. Rewritten against the library API and covering:
  merged multi-item wrapping and blank-body skipping; a fresh install resolving to
  the builtin backed by `SKILL.md` with front matter stripped; the pill selecting
  the default, then restoring the stashed selection after an off/on cycle; one
  injected message regardless of item count; bodies merged in library order;
  re-injection after unchecking, rechecking and reordering; no `zh` text and no
  title ever appearing in an injected block; saving `zh` alone producing no
  re-injection while raising the stale flag, and a retranslation clearing it and
  superseding the live block; an item with empty `zh` never reported stale;
  `resetItem` restoring the synthesised text with `SKILL.md` byte-identical
  afterwards; deletion of the builtin refused; the legacy override imported byte for
  byte with the legacy file untouched and no `items.json` written by a read; a
  corrupt `items.json` moved to `items.json.broken` with a warning and a builtin
  fallback; a hand-edited library missing the builtin getting exactly one back;
  surface-aware skip and compaction self-heal; per-session isolation; append-only
  step construction; and `reject` pass-through.
- `node test-translate.mjs` — passed unchanged, confirming the translation path,
  its route resolution, caps, terminal finish reasons, and the `sessionId` omission
  were not disturbed by this change.
- Both suites were run in a scratch directory with
  `node_modules/@deepseek-ai/dsh-llm` junctioned to the desktop app closure, because
  that package is not present in a DSH profile's `node_modules`. Profile
  directories were not modified and no package manager was run.
- `node --check lib/index.js` and `node --check lib/client.js` — passed.
- One assertion initially failed (`blockCount`) because the supersede notice
  mentions `<spec-loop>` in prose, so a substring match over-counted opening tags.
  The test now counts lines that *are* the tag. The production wrapper was correct.
- Not observed: the manager panel rendered in the live Web GUI. `lib/client.js` is a
  hand-bundled `window.__ModuleLoader__` module with no build step or DOM test rig
  in this repository, and the installed copies under `~/.dsh/profiles/*` were
  deliberately left at the previous version, so no running session was altered.
  Installing and exercising the panel is a user-authorized operation.
