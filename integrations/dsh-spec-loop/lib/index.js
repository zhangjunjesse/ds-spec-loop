/**
 * dsh-spec-loop host half.
 *
 * Owns the per-session "pin the ds-spec-loop skill" state:
 * - one GLOBAL systemPrompt section whose text is a function of the
 *   assembly context; it renders the skill text only for sessions the
 *   user toggled on (empty sections disappear from the prompt);
 * - a loopback-fenced JSON API the client toggle calls:
 *   POST /spec-loop/api  body {sessionId, enabled?}  ->  {enabled}
 *   (omit `enabled` to read the current state).
 *
 * The skill text is re-read from disk on every enable, so edits to
 * SKILL.md apply on the next off->on toggle without a restart.
 */
import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

export const name = 'dsh-spec-loop'
export const inject = ['systemPrompt', 'webServer']

const SKILL_DIR = join(process.env.DSH_HOME ?? join(homedir(), '.dsh'), 'skills', 'ds-spec-loop')
const SKILL_PATH = join(SKILL_DIR, 'SKILL.md')

/** Strip YAML front matter and prepend the pinned-skill preamble. */
async function loadSkillText() {
  const raw = await readFile(SKILL_PATH, 'utf8')
  let body = raw
  if (body.startsWith('---')) {
    const end = body.indexOf('\n---', 3)
    if (end !== -1) body = body.slice(end + 4)
  }
  const header = [
    '# Pinned skill: ds-spec-loop',
    '',
    'The user manually pinned the "ds-spec-loop" skill via the composer toggle. While this section is present, follow this skill for all applicable (non-mechanical) work in this session.',
    'The reference files it mentions live at: ' + SKILL_DIR.replaceAll('\\', '/') + '/references/ — read them with the read tool exactly when the skill instructs.',
  ].join('\n')
  return header + '\n\n' + body.trim()
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
    if (size > 64 * 1024) throw new Error('body too large')
    chunks.push(chunk)
  }
  const text = Buffer.concat(chunks).toString('utf8')
  return text === '' ? {} : JSON.parse(text)
}

export function apply(ctx) {
  /** Session ids with the skill pinned. Process-local by design. */
  const enabled = new Set()
  /** The skill text currently pinned (refreshed on each enable). */
  let pinnedText = ''

  // One global section; per-session behaviour comes from the text function.
  // Empty text ⇒ the section disappears for that assembly.
  ctx.effect(() => ctx.systemPrompt.section({
    name: 'ds-spec-loop',
    order: 100,
    text: (context) => {
      const id = context?.agent?.id
      return id !== undefined && enabled.has(id) ? pinnedText : ''
    },
  }), 'dsh-spec-loop: prompt section')

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
        if (payload.enabled === true) {
          pinnedText = await loadSkillText()
          enabled.add(sessionId)
        } else if (payload.enabled === false) {
          enabled.delete(sessionId)
        }
        writeJson(res, 200, { ok: true, enabled: enabled.has(sessionId) })
      } catch (error) {
        writeJson(res, 500, { ok: false, error: String(error && error.message || error) })
      }
    },
  }), 'dsh-spec-loop: /spec-loop/api route')
}
