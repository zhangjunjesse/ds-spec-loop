/**
 * dsh-spec-loop host half.
 *
 * Owns the per-session "pin the ds-spec-loop skill" state.
 *
 * Injection (`injectAs`, default `user-message`)
 * ----------------------------------------------
 * `user-message` — the skill text enters the conversation as a plugin-sourced
 * USER message through the `agent/pre-step` waterfall, wrapped in
 * `<spec-loop>` tags. Same seam and message shape the shipped
 * `dsh-time-context` plugin uses, so the text is visible in the transcript and
 * lands in the durable log (`dsh-agent-loop` appends every message a pre-step
 * `enter` decision returns).
 *
 * A durable message costs its tokens once and then sinks into history, so
 * injection is NOT repeated per turn (the skill is ~5k tokens; per-turn would
 * add that to the log every turn). It is re-injected only when it stopped
 * being effective: absent from the session surface (never injected, or dropped
 * by compaction) or superseded by an edit. One live copy at all times, without
 * unbounded growth.
 *
 * `system-prompt` — the previous behaviour, kept for rollback: one GLOBAL
 * systemPrompt section whose text renders only for toggled-on sessions.
 *
 * Editing
 * -------
 * The injected text is editable. Effective text = the override file when
 * present, otherwise the skill body. Edits go to the override and never touch
 * SKILL.md, so `reset` restores the shipped skill verbatim.
 *
 * Loopback-fenced JSON API the client calls:
 *   POST /spec-loop/api {sessionId}             -> read state
 *   POST /spec-loop/api {sessionId, enabled}    -> toggle
 *   POST /spec-loop/api {sessionId, text}       -> save the override
 *   POST /spec-loop/api {sessionId, reset:true} -> drop the override
 * Every shape answers {ok, enabled, text, isOverride, skillText, injectAs}.
 */
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { createUserMessage } from '@deepseek-ai/dsh-llm'

export const name = 'dsh-spec-loop'
export const inject = ['agents', 'systemPrompt', 'webServer']

const DSH_HOME = process.env.DSH_HOME ?? join(homedir(), '.dsh')
const SKILL_DIR = join(DSH_HOME, 'skills', 'ds-spec-loop')
const SKILL_PATH = join(SKILL_DIR, 'SKILL.md')
/** User edits live here; SKILL.md stays pristine so `reset` is lossless. */
const OVERRIDE_PATH = join(DSH_HOME, 'storages', 'spec-loop-prompt.md')

/** Tag pair wrapped around the injected text so the model can delimit it. */
const OPEN_TAG = '<spec-loop>'
const CLOSE_TAG = '</spec-loop>'

/** Strip YAML front matter so the injected text starts at the skill body. */
function stripFrontMatter(raw) {
  if (!raw.startsWith('---')) return raw
  const end = raw.indexOf('\n---', 3)
  return end === -1 ? raw : raw.slice(end + 4)
}

/**
 * Preamble for the DEFAULT body. The "pinned by the user / follow this" framing
 * lives in {@link wrapText}, so this only carries what is specific to the
 * shipped skill: its identity and where its reference files are.
 */
function preamble() {
  return [
    '# Pinned skill: ds-spec-loop',
    '',
    'Apply this skill to all applicable (non-mechanical) work in this session.',
    'The reference files it mentions live at: ' + SKILL_DIR.replaceAll('\\', '/') + '/references/ — read them with the read tool exactly when the skill instructs.',
  ].join('\n')
}

/** The shipped default text: preamble + skill body. */
async function loadSkillText() {
  const raw = await readFile(SKILL_PATH, 'utf8')
  return preamble() + '\n\n' + stripFrontMatter(raw).trim()
}

/** The user's edited text, or undefined when no override is saved. */
async function loadOverrideText() {
  try {
    return await readFile(OVERRIDE_PATH, 'utf8')
  } catch (error) {
    if (error && error.code === 'ENOENT') return undefined
    throw error
  }
}

/**
 * The text actually injected: the override when present, else the skill body.
 * Read from disk each time, so editing either file applies to the next
 * injection without a restart.
 */
async function effectiveText() {
  const override = await loadOverrideText()
  if (override !== undefined) return { text: override, isOverride: true }
  return { text: await loadSkillText(), isOverride: false }
}

/**
 * Wrap the editable body in the delimiting tags actually sent to the model.
 *
 * The supersede notice lives in the WRAPPER, not in the editable body, for two
 * reasons: an edit cannot accidentally delete it, and it is what makes the
 * append-only update strategy correct. Editing the constraints appends a fresh
 * block at the tail and deliberately leaves the previous one in history —
 * rewriting or removing the old event would change the cached prefix, which is
 * exactly the prompt-cache invalidation this injection site exists to avoid.
 * So the newest block must state that it replaces the older ones.
 */
export function wrapText(text) {
  return [
    OPEN_TAG,
    'Constraints the user pinned for this session. Follow them for all applicable work.',
    'This block REPLACES every earlier <spec-loop> block in this conversation: where they differ, the earlier ones are stale — follow this one.',
    '',
    String(text).trim(),
    CLOSE_TAG,
  ].join('\n')
}

/**
 * This plugin's own injection that is still EFFECTIVE for a session, if any.
 *
 * Effective means the event is still on the session surface: compaction drops
 * pruned events from it, which is exactly when the skill must be re-injected.
 * @param session - the agent's session.
 * @returns the wrapped text of the live injection, or undefined when none is.
 */
export function liveInjectionText(session) {
  const events = session?.events
  if (!Array.isArray(events)) return undefined
  let surface
  try {
    surface = new Set(session.surface?.nodes ?? [])
  } catch {
    return undefined
  }
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index]
    if (event?.type !== 'user/message') continue
    const source = event.data?.source
    if (source?.kind !== 'plugin' || source.plugin !== name) continue
    if (!surface.has(event.seq)) return undefined
    const block = (event.data.content ?? []).find((entry) => entry?.type === 'text')
    return typeof block?.text === 'string' ? block.text : undefined
  }
  return undefined
}

/** Accept only same-machine browsers (loopback Host header). */
function isLoopback(req) {
  const host = req.headers.host
  if (typeof host !== 'string') return false
  try {
    const hostname = new URL('http://' + host).hostname
    return hostname === '127.0.0.1' || hostname === 'localhost' || hostname === '::1' || hostname === '[::1]'
  } catch {
    return false
  }
}

function writeJson(res, status, value) {
  const body = JSON.stringify(value)
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
  res.end(body)
}

async function readJsonBody(req) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > 512 * 1024) throw new Error('body too large')
    chunks.push(chunk)
  }
  const text = Buffer.concat(chunks).toString('utf8')
  return text === '' ? {} : JSON.parse(text)
}

export function apply(ctx, config) {
  const injectAs = config?.injectAs === 'system-prompt' ? 'system-prompt' : 'user-message'
  /** Session ids with the skill pinned. Process-local by design. */
  const enabled = new Set()
  /** Legacy mode only: refresh the cached section text after an edit/enable. */
  let refreshSystemPrompt

  if (injectAs === 'system-prompt') {
    // Legacy path: one global section whose text is empty for sessions that did
    // not toggle it on (an empty section disappears from the assembly).
    let pinnedText = ''
    refreshSystemPrompt = async () => {
      const { text } = await effectiveText()
      pinnedText = wrapText(text)
    }
    ctx.effect(() => ctx.systemPrompt.section({
      name: 'ds-spec-loop',
      order: 100,
      text: (context) => {
        const id = context?.agent?.id
        return id !== undefined && enabled.has(id) ? pinnedText : ''
      },
    }), 'dsh-spec-loop: prompt section')
  } else {
    // Inject as a plugin-sourced user message, mirroring dsh-time-context.
    ctx.on('agent/pre-step', async ({ agent, signal }, next) => {
      const decision = await next()
      if (decision.kind === 'reject' || signal.aborted) return decision
      if (!enabled.has(agent.id)) return decision
      let wrapped
      try {
        const { text } = await effectiveText()
        wrapped = wrapText(text)
      } catch (error) {
        ctx.logger?.warn?.('dsh-spec-loop: failed to read the pinned text; skipping injection', error)
        return decision
      }
      // Skip while an identical copy is still effective. A compaction that
      // pruned it, or an edit that changed it, falls through and re-injects.
      if (liveInjectionText(agent.session) === wrapped) return decision
      return {
        kind: 'enter',
        messages: [...decision.messages, createUserMessage({
          content: [{ type: 'text', text: wrapped }],
          source: {
            kind: 'plugin',
            plugin: name,
            form: 'snapshot',
            sections: [{ name, text: wrapped }],
          },
        })],
      }
    })
  }

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/spec-loop/api',
    handler: async (req, res) => {
      if (!isLoopback(req)) {
        writeJson(res, 403, { ok: false, error: 'forbidden' })
        return
      }
      if (req.method !== 'POST') {
        writeJson(res, 405, { ok: false, error: 'method not allowed' })
        return
      }
      try {
        const payload = await readJsonBody(req)
        const sessionId = payload.sessionId
        if (typeof sessionId !== 'string' || sessionId === '') {
          writeJson(res, 400, { ok: false, error: 'sessionId required' })
          return
        }
        if (payload.reset === true) {
          await rm(OVERRIDE_PATH, { force: true })
        } else if (typeof payload.text === 'string') {
          await mkdir(dirname(OVERRIDE_PATH), { recursive: true })
          await writeFile(OVERRIDE_PATH, payload.text, 'utf8')
        }
        if (payload.enabled === true) enabled.add(sessionId)
        else if (payload.enabled === false) enabled.delete(sessionId)
        const [effective, skillText] = await Promise.all([
          effectiveText(),
          loadSkillText().catch(() => ''),
        ])
        if (refreshSystemPrompt !== undefined) await refreshSystemPrompt()
        writeJson(res, 200, {
          ok: true,
          enabled: enabled.has(sessionId),
          text: effective.text,
          isOverride: effective.isOverride,
          skillText,
          injectAs,
        })
      } catch (error) {
        writeJson(res, 500, { ok: false, error: String((error && error.message) || error) })
      }
    },
  }), 'dsh-spec-loop: /spec-loop/api route')
}
