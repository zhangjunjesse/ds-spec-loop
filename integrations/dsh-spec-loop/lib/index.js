/**
 * dsh-spec-loop host half.
 *
 * Owns a LIBRARY of injection items and the per-session selection over it.
 *
 * Library (`~/.dsh/storages/spec-loop/items.json`)
 * -----------------------------------------------
 * Each item pairs a human-facing Chinese source with the English product that
 * is actually injected:
 *
 *   { id, title, zh, en, translatedFrom, builtin, defaultSelected, order }
 *
 * `en` is the ONLY text ever sent to the model. `zh` never leaves this process.
 * `title` is a UI label and is not injected either — injecting it would put
 * Chinese into an English payload and create a third surface needing
 * translation.
 *
 * `translatedFrom` holds the `zh` value at the last translation, so staleness is
 * derived (`zh !== translatedFrom`) rather than tracked as a separate flag that
 * could fall out of sync.
 *
 * The shipped `ds-spec-loop` skill is one BUILTIN item. Empty `zh`/`en` mean
 * "not customised": `en` is synthesised from `SKILL.md` at read time. Saving
 * writes the fields, `resetItem` clears them, and `SKILL.md` is never written —
 * so reset stays lossless, the property the old override file provided.
 *
 * Injection (`injectAs`, default `user-message`)
 * ----------------------------------------------
 * `user-message` — the selected items' `en` bodies are merged, in `order`, into
 * ONE `<spec-loop>`-tagged USER message pushed through the `agent/pre-step`
 * waterfall. Same seam and message shape the shipped `dsh-time-context` plugin
 * uses, so the text is visible in the transcript and lands in the durable log.
 *
 * A durable message costs its tokens once and then sinks into history, so
 * injection is NOT repeated per turn. It is re-injected only when it stopped
 * being effective: absent from the session surface (never injected, or dropped
 * by compaction) or superseded by an edit or a selection change. One live copy
 * at all times, without unbounded growth.
 *
 * ONE merged block rather than one block per item: the supersede notice in the
 * wrapper is what makes append-only editing correct without invalidating the
 * prompt cache. Per-item blocks would need per-name replacement semantics, and
 * unchecking an item mid-conversation would leave nothing to tell the model to
 * stop following it. A single block always states the complete current truth.
 *
 * `system-prompt` — the previous behaviour, kept for rollback: one GLOBAL
 * systemPrompt section whose text renders only for sessions with a selection.
 *
 * Selection
 * ---------
 * Per session and process-local, because "谨慎模式 on for this conversation" is
 * already a session-scoped idea. `defaultSelected` persists the user's last
 * selection so a NEW session's first pill click reproduces their intent; the
 * live session state still governs the live session.
 *
 * Translation
 * -----------
 * The block is read by the model, so its language is a tuning knob. The editor
 * round-trips a draft through the session's own model route, which keeps the
 * feature credential-free. It only ever returns a candidate — saving stays an
 * explicit, separate step, which is why a bad translation is recoverable.
 *
 * Loopback-fenced JSON API the client calls:
 *   POST /spec-loop/api {sessionId}                  -> read state
 *   POST /spec-loop/api {sessionId, enabled}         -> pill on/off
 *   POST /spec-loop/api {sessionId, selected:[id]}   -> set the selection
 *   POST /spec-loop/api {sessionId, upsert:{...}}    -> create/update one item
 *   POST /spec-loop/api {sessionId, remove:id}       -> delete one item
 *   POST /spec-loop/api {sessionId, resetItem:id}    -> clear a builtin's edits
 * Those shapes answer {ok, enabled, items, selected, injectAs, warning?}.
 *   POST /spec-loop/api {sessionId, translate:{text, target}}
 *                                                    -> {ok, translated}
 */
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { BlockAssembler, createUserMessage } from '@deepseek-ai/dsh-llm'

export const name = 'dsh-spec-loop'
export const inject = ['agents', 'systemPrompt', 'webServer']

const DSH_HOME = process.env.DSH_HOME ?? join(homedir(), '.dsh')
const SKILL_DIR = join(DSH_HOME, 'skills', 'ds-spec-loop')
const SKILL_PATH = join(SKILL_DIR, 'SKILL.md')
/** The library. Written atomically so a crashed write cannot truncate it. */
const STORE_DIR = join(DSH_HOME, 'storages', 'spec-loop')
const ITEMS_PATH = join(STORE_DIR, 'items.json')
/** Pre-library single-text override, imported once and then left alone. */
const LEGACY_OVERRIDE_PATH = join(DSH_HOME, 'storages', 'spec-loop-prompt.md')

/** Stable id and marker for the one item backed by the shipped skill. */
const BUILTIN_ID = 'spec-loop'
const BUILTIN_KIND = 'ds-spec-loop'

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
 * Preamble for the BUILTIN body. The "pinned by the user / follow this" framing
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

// ---------------------------------------------------------------------------
// The library
// ---------------------------------------------------------------------------

function builtinItem(en = '') {
  return {
    id: BUILTIN_ID,
    title: '严格 Spec 流程',
    zh: '',
    en,
    translatedFrom: null,
    builtin: BUILTIN_KIND,
    defaultSelected: true,
    order: 0,
  }
}

/** Coerce one stored record into the full shape, tolerating hand edits. */
function normaliseItem(raw, index) {
  const text = (value) => (typeof value === 'string' ? value : '')
  return {
    id: typeof raw?.id === 'string' && raw.id !== '' ? raw.id : randomUUID(),
    title: text(raw?.title),
    zh: text(raw?.zh),
    en: text(raw?.en),
    translatedFrom: typeof raw?.translatedFrom === 'string' ? raw.translatedFrom : null,
    builtin: raw?.builtin === BUILTIN_KIND ? BUILTIN_KIND : null,
    defaultSelected: raw?.defaultSelected === true,
    order: Number.isFinite(raw?.order) ? Number(raw.order) : index,
  }
}

/**
 * The library's first state: the builtin, carrying the legacy override's text
 * when one exists so an upgrading user's injected text is unchanged byte for
 * byte. The legacy file is read, never written or deleted.
 */
async function bootstrapItems() {
  const legacy = await readFile(LEGACY_OVERRIDE_PATH, 'utf8').catch(() => undefined)
  return [builtinItem(legacy === undefined ? '' : legacy)]
}

/**
 * Read the library from disk.
 *
 * Nothing is written on a plain read: with no `items.json` the bootstrap is
 * recomputed each time, which is idempotent and keeps the legacy import
 * one-way. A corrupt file is moved aside rather than silently overwritten, and
 * the failure is surfaced to the panel instead of being swallowed.
 * @returns `{items, warning}` — `warning` is set only after a recovery.
 */
async function readLibrary() {
  let raw
  try {
    raw = await readFile(ITEMS_PATH, 'utf8')
  } catch (error) {
    if (!error || error.code !== 'ENOENT') throw error
    return { items: await bootstrapItems(), warning: undefined }
  }
  let parsed
  try {
    parsed = JSON.parse(raw)
    if (parsed === null || typeof parsed !== 'object' || !Array.isArray(parsed.items)) {
      throw new Error('no items[] array')
    }
  } catch (error) {
    const aside = ITEMS_PATH + '.broken'
    await rename(ITEMS_PATH, aside).catch(() => {})
    return {
      items: await bootstrapItems(),
      warning: `注入库文件无法解析（${String((error && error.message) || error)}），已移到 ${aside}，当前回退到内置预设`,
    }
  }
  const items = parsed.items.map(normaliseItem)
  // A hand-edited file that dropped the builtin still gets one back, so the
  // shipped skill never becomes unreachable.
  if (!items.some((item) => item.builtin === BUILTIN_KIND)) items.unshift(builtinItem())
  items.sort((left, right) => left.order - right.order)
  return { items, warning: undefined }
}

/** Persist the library atomically; `order` is renumbered from array position. */
async function writeLibrary(items) {
  await mkdir(STORE_DIR, { recursive: true })
  const ordered = items.map((item, index) => ({ ...item, order: index }))
  const temporary = join(STORE_DIR, `.items.${randomUUID()}.tmp`)
  await writeFile(temporary, JSON.stringify({ version: 1, items: ordered }, null, 2), 'utf8')
  await rename(temporary, ITEMS_PATH)
  return ordered
}

/**
 * Add the derived fields the panel and the injector need.
 *
 * `resolvedEn` is what would actually be injected — for an uncustomised builtin
 * that is the synthesised skill text, so the editor shows the real body rather
 * than an empty box.
 */
async function resolveItems(items) {
  let skill
  const out = []
  for (const item of items) {
    let resolvedEn = item.en
    let customised = true
    if (item.builtin === BUILTIN_KIND) {
      customised = item.zh.trim() !== '' || item.en.trim() !== ''
      if (item.en.trim() === '') {
        if (skill === undefined) skill = await loadSkillText().catch(() => '')
        resolvedEn = skill
      }
    }
    out.push({
      ...item,
      resolvedEn,
      customised,
      // Nothing to translate yet is not "stale"; a zh that has moved on since
      // the last translation is.
      stale: item.zh.trim() !== '' && item.zh !== item.translatedFrom,
    })
  }
  return out
}

/**
 * Wrap the selected bodies in the delimiting tags actually sent to the model.
 *
 * The supersede notice lives in the WRAPPER, not in an editable body, for two
 * reasons: an edit cannot accidentally delete it, and it is what makes the
 * append-only update strategy correct. Editing the constraints appends a fresh
 * block at the tail and deliberately leaves the previous one in history —
 * rewriting or removing the old event would change the cached prefix, which is
 * exactly the prompt-cache invalidation this injection site exists to avoid.
 * So the newest block must state that it replaces the older ones.
 * @param bodies - one body, or the selected bodies in injection order.
 */
export function wrapText(bodies) {
  const list = (Array.isArray(bodies) ? bodies : [bodies])
    .map((body) => String(body ?? '').trim())
    .filter((body) => body !== '')
  return [
    OPEN_TAG,
    'Constraints the user pinned for this session. Follow them for all applicable work.',
    'This block REPLACES every earlier <spec-loop> block in this conversation: where they differ, the earlier ones are stale — follow this one.',
    '',
    list.join('\n\n'),
    CLOSE_TAG,
  ].join('\n')
}

/**
 * This plugin's own injection that is still EFFECTIVE for a session, if any.
 *
 * Effective means the event is still on the session surface: compaction drops
 * pruned events from it, which is exactly when the text must be re-injected.
 * Comparing the whole wrapped string means an edit, a reorder, or a selection
 * change all re-inject with no extra bookkeeping.
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

// ---------------------------------------------------------------------------
// Translation
//
// The injected block is read by the MODEL, so its wording is a tuning knob:
// people think in one language and models often follow instructions best in
// another. Rather than force a choice, the editor keeps both and round-trips
// the draft through the session's own model.
//
// This is an AUXILIARY call: it borrows the route the session is already using
// (so it needs no separate credential or catalog entry) but must not join that
// session's conversation state — see the deliberate `sessionId` omission below.
// ---------------------------------------------------------------------------

/** Cap the input so one click cannot ship an unbounded prompt. */
const TRANSLATE_MAX_INPUT_CHARS = 24000
/** Headroom for the reply: translations run longer than their source. */
const TRANSLATE_MAX_OUTPUT_TOKENS = 16000
/** Cap the wait so a stuck route cannot hang the editor panel. */
const TRANSLATE_TIMEOUT_MS = 180000

/**
 * Instruction for the translation pass. The text being translated is itself a
 * set of instructions for an agent, so the two failure modes that matter are
 * losing imperative force and breaking structure — both are called out.
 */
export function translateSystemPrompt(target) {
  return [
    `Translate the user's text into ${target}.`,
    '',
    'The text is an instruction block for an AI coding agent, so preserve its INSTRUCTIONAL FORCE exactly: every requirement, prohibition, and condition must remain as binding as in the original. Never soften, drop, merge, summarise, or add one.',
    'Preserve the Markdown structure verbatim: headings, list markers, numbering, tables, blockquotes, emphasis, and the position of every blank line.',
    'Do NOT translate: fenced and inline code, file paths, URLs, tool names, command names, identifiers, and anything inside angle-bracket tags such as <spec-loop>.',
    'Keep any text that is already in the target language unchanged.',
    '',
    'Return ONLY the translated text — no preface, no notes, and no code fence wrapped around the whole answer.',
  ].join('\n')
}

/**
 * Which model performs the translation.
 *
 * Default is the route the session is already talking to (`request/context`,
 * folded by dsh-session), so the feature works with whatever the user has
 * configured and needs no credential of its own. `translateProvider` +
 * `translateModel` override it when a deployment prefers a cheap side model.
 * @param config - the plugin's loader config.
 * @param agent - the live agent for the calling session, when there is one.
 * @returns the provider/model pair to call.
 */
export function resolveTranslateRoute(config, agent) {
  const provider = config?.translateProvider
  const model = config?.translateModel
  if (typeof provider === 'string' && provider !== '' && typeof model === 'string' && model !== '') {
    return { provider, model }
  }
  let route
  try {
    route = agent?.session?.requestContext?.()
  } catch {
    route = undefined
  }
  if (typeof route?.provider === 'string' && route.provider !== '' && typeof route?.model === 'string' && route.model !== '') {
    return { provider: route.provider, model: route.model }
  }
  throw new Error(
    'no model route for this session yet — send one message first, or set translateProvider/translateModel in the plugin config',
  )
}

/** Terminal finish reasons that must surface as a failed translation. */
function translateFinishError(finish) {
  switch (finish?.kind) {
    case 'stop':
    case undefined:
      return undefined
    case 'error':
    case 'aborted':
      return new Error(finish.failure?.message ? String(finish.failure.message) : 'translation call did not finish')
    case 'max-tokens':
      return new Error('the translation hit the output limit and would be truncated — translate a shorter section')
    case 'tool-calls':
      return new Error('the translation model tried to call a tool')
    default:
      return new Error(`unsupported finish reason "${String(finish.kind)}"`)
  }
}

/**
 * Translate one draft through the resolved route.
 * @param ctx - plugin context (the `llm` service is read optionally).
 * @param config - the plugin's loader config.
 * @param agent - the live agent for the calling session, when there is one.
 * @param text - the draft to translate.
 * @param target - target language, as a natural-language name.
 * @returns the translated text.
 */
export async function translateText(ctx, config, agent, text, target) {
  const llm = ctx?.get?.('llm')
  if (llm === undefined || typeof llm.stream !== 'function') {
    throw new Error('the llm service is unavailable; cannot translate')
  }
  const body = String(text ?? '')
  if (body.trim() === '') throw new Error('nothing to translate')
  if (body.length > TRANSLATE_MAX_INPUT_CHARS) {
    throw new Error(`the text is ${body.length} characters, over the ${TRANSLATE_MAX_INPUT_CHARS} limit — translate it in parts`)
  }
  const route = resolveTranslateRoute(config, agent)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TRANSLATE_TIMEOUT_MS)
  try {
    const assembler = new BlockAssembler()
    for await (const chunk of llm.stream({
      provider: route.provider,
      model: route.model,
      system: translateSystemPrompt(target),
      messages: [createUserMessage({
        content: [{ type: 'text', text: body }],
        source: { kind: 'plugin', plugin: name },
      })],
      maxTokens: TRANSLATE_MAX_OUTPUT_TOKENS,
      purpose: 'spec-loop-translate',
      // `sessionId` is deliberately NOT passed. It is optional on the call, and
      // omitting it keeps this auxiliary request out of any provider-side
      // per-session state: dsh-claude-driver keys its Claude Code resume chain
      // on sessionId for every purpose outside its own internal set, so passing
      // it here would hand the session's live CLI conversation to a translation.
      signal: controller.signal,
    })) {
      assembler.push(chunk)
    }
    const failure = translateFinishError(assembler.finish)
    if (failure !== undefined) throw failure
    const translated = assembler
      .blocks()
      .filter((block) => block?.type === 'text')
      .map((block) => block.text)
      .join('')
      .trim()
    if (translated === '') throw new Error('the model returned no text')
    return translated
  } finally {
    clearTimeout(timer)
  }
}

export function apply(ctx, config) {
  const injectAs = config?.injectAs === 'system-prompt' ? 'system-prompt' : 'user-message'
  /**
   * Live selection per session. Process-local by design.
   * `selected` is what injects now; `last` is what the pill restores when it is
   * switched back on, so toggling off and on is not a destructive act.
   */
  const sessions = new Map()
  /** Legacy mode only: refresh the cached section text after a change. */
  let refreshSystemPrompt

  function sessionEntry(sessionId, resolved) {
    let entry = sessions.get(sessionId)
    if (entry === undefined) {
      entry = {
        selected: new Set(),
        last: new Set(resolved.filter((item) => item.defaultSelected).map((item) => item.id)),
      }
      sessions.set(sessionId, entry)
    }
    // Forget ids the library no longer has, so a delete cannot strand a
    // selection that would silently inject nothing.
    const live = new Set(resolved.map((item) => item.id))
    for (const id of [...entry.selected]) if (!live.has(id)) entry.selected.delete(id)
    for (const id of [...entry.last]) if (!live.has(id)) entry.last.delete(id)
    return entry
  }

  /** The bodies to inject for one session, in library order. */
  async function selectedBodies(sessionId) {
    const { items } = await readLibrary()
    const resolved = await resolveItems(items)
    const entry = sessions.get(sessionId)
    if (entry === undefined || entry.selected.size === 0) return []
    return resolved
      .filter((item) => entry.selected.has(item.id))
      .map((item) => item.resolvedEn)
      .filter((body) => String(body ?? '').trim() !== '')
  }

  if (injectAs === 'system-prompt') {
    // Legacy path: one global section whose text is empty for sessions with no
    // selection (an empty section disappears from the assembly).
    const pinned = new Map()
    refreshSystemPrompt = async (sessionId) => {
      const bodies = await selectedBodies(sessionId)
      if (bodies.length === 0) pinned.delete(sessionId)
      else pinned.set(sessionId, wrapText(bodies))
    }
    ctx.effect(() => ctx.systemPrompt.section({
      name: 'ds-spec-loop',
      order: 100,
      text: (context) => {
        const id = context?.agent?.id
        return (id !== undefined && pinned.get(id)) || ''
      },
    }), 'dsh-spec-loop: prompt section')
  } else {
    // Inject as a plugin-sourced user message, mirroring dsh-time-context.
    ctx.on('agent/pre-step', async ({ agent, signal }, next) => {
      const decision = await next()
      if (decision.kind === 'reject' || signal.aborted) return decision
      let bodies
      try {
        bodies = await selectedBodies(agent.id)
      } catch (error) {
        ctx.logger?.warn?.('dsh-spec-loop: failed to read the injection library; skipping injection', error)
        return decision
      }
      // Nothing selected, or everything selected is empty: inject nothing
      // rather than an empty block.
      if (bodies.length === 0) return decision
      const wrapped = wrapText(bodies)
      // Skip while an identical copy is still effective. A compaction that
      // pruned it, or any change to the selection or its text, falls through.
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

        // Translation is a pure query: it returns a candidate for the editor to
        // show and never writes the library. The user reviews, then saves.
        if (payload.translate !== undefined && payload.translate !== null) {
          const target = typeof payload.translate.target === 'string' && payload.translate.target.trim() !== ''
            ? payload.translate.target.trim()
            : 'English'
          const translated = await translateText(
            ctx,
            config,
            ctx.agents.get(sessionId),
            payload.translate.text,
            target,
          )
          writeJson(res, 200, { ok: true, translated })
          return
        }

        // --- library mutations, before the selection is resolved ------------
        let { items, warning } = await readLibrary()

        if (payload.upsert !== undefined && payload.upsert !== null) {
          const patch = payload.upsert
          const index = typeof patch.id === 'string' ? items.findIndex((item) => item.id === patch.id) : -1
          if (index === -1) {
            const created = normaliseItem(
              { title: patch.title, zh: patch.zh, en: patch.en, translatedFrom: patch.translatedFrom },
              items.length,
            )
            items = [...items, created]
          } else {
            const current = items[index]
            const next = { ...current }
            if (typeof patch.title === 'string') next.title = patch.title
            if (typeof patch.zh === 'string') next.zh = patch.zh
            if (typeof patch.en === 'string') next.en = patch.en
            // Omitted means "leave as is"; null means "never translated".
            if (patch.translatedFrom === null || typeof patch.translatedFrom === 'string') {
              next.translatedFrom = patch.translatedFrom
            }
            items = items.map((item, at) => (at === index ? next : item))
          }
          items = await writeLibrary(items)
        } else if (typeof payload.remove === 'string') {
          const target = items.find((item) => item.id === payload.remove)
          if (target === undefined) throw new Error('no such item')
          if (target.builtin === BUILTIN_KIND) throw new Error('内置条目不能删除，请用「恢复默认」')
          items = await writeLibrary(items.filter((item) => item.id !== payload.remove))
        } else if (typeof payload.resetItem === 'string') {
          const target = items.find((item) => item.id === payload.resetItem)
          if (target === undefined) throw new Error('no such item')
          if (target.builtin !== BUILTIN_KIND) throw new Error('只有内置条目可以恢复默认')
          // Clearing the fields is the reset: `resolveItems` then synthesises
          // `en` from SKILL.md again, which was never written.
          items = await writeLibrary(items.map((item) => (
            item.id === payload.resetItem ? { ...item, zh: '', en: '', translatedFrom: null } : item
          )))
        } else if (Array.isArray(payload.order)) {
          const rank = new Map(payload.order.map((id, at) => [id, at]))
          items = await writeLibrary(
            [...items].sort((left, right) => (rank.get(left.id) ?? Infinity) - (rank.get(right.id) ?? Infinity)),
          )
        }

        const resolved = await resolveItems(items)
        const entry = sessionEntry(sessionId, resolved)

        // --- selection ------------------------------------------------------
        if (Array.isArray(payload.selected)) {
          const live = new Set(resolved.map((item) => item.id))
          entry.selected = new Set(payload.selected.filter((id) => live.has(id)))
          if (entry.selected.size > 0) entry.last = new Set(entry.selected)
          // Remember the intent for the NEXT session's first pill click.
          const wanted = new Set(entry.selected)
          if (resolved.some((item) => item.defaultSelected !== wanted.has(item.id))) {
            items = await writeLibrary(items.map((item) => ({ ...item, defaultSelected: wanted.has(item.id) })))
          }
        } else if (payload.enabled === true) {
          if (entry.selected.size === 0) {
            const restored = [...entry.last]
            entry.selected = new Set(
              restored.length > 0
                ? restored
                : resolved.filter((item) => item.defaultSelected).map((item) => item.id),
            )
          }
        } else if (payload.enabled === false) {
          if (entry.selected.size > 0) entry.last = new Set(entry.selected)
          entry.selected = new Set()
        }

        const finalItems = await resolveItems(items)
        if (refreshSystemPrompt !== undefined) await refreshSystemPrompt(sessionId)
        writeJson(res, 200, {
          ok: true,
          enabled: entry.selected.size > 0,
          selected: [...entry.selected],
          items: finalItems.map((item) => ({
            id: item.id,
            title: item.title,
            zh: item.zh,
            en: item.en,
            resolvedEn: item.resolvedEn,
            translatedFrom: item.translatedFrom,
            builtin: item.builtin !== null,
            customised: item.customised,
            stale: item.stale,
            order: item.order,
          })),
          injectAs,
          warning,
        })
      } catch (error) {
        writeJson(res, 500, { ok: false, error: String((error && error.message) || error) })
      }
    },
  }), 'dsh-spec-loop: /spec-loop/api route')
}
