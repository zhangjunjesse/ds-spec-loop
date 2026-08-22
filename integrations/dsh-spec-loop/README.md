# dsh-spec-loop — DeepSeek Harness (DSH) composer toggle

A DSH host+client plugin that adds a **"Spec Loop" pill toggle** to the
composer tool row (left of the input, beside the access-mode / plan
controls). Toggling it on pins the full `ds-spec-loop` SKILL.md into the
system prompt **for that session only**; toggling it off removes it
immediately. Each session has its own independent switch.

- **Host half** (`lib/index.js`): registers one global `systemPrompt`
  section whose text is a function of the assembly context — it renders
  the skill text only for sessions the user toggled on (empty sections
  disappear from the prompt). Also registers a loopback-fenced JSON API
  `POST /spec-loop/api` (`{sessionId, enabled?}` → `{enabled}`) that the
  client toggle calls.
- **Client half** (`lib/client.js`): a hand-authored DSH client module
  (`window.__ModuleLoader__` factory format) registering the toggle into
  the `conversation.input.left` slot.

The skill text is re-read from disk on every enable, so edits to
SKILL.md apply on the next off→on toggle without a restart.

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
   ```

4. Fully restart DSH.

## Notes

- Toggle state is process-local by design: after a DSH restart every
  session starts with the toggle off.
- The HTTP endpoint accepts loopback (`127.0.0.1` / `localhost` / `::1`)
  requests only.
