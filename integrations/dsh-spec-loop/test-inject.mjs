// Pure unit tests for the injection library and the user-message injection path
// (no network, no DSH).
//   node test-inject.mjs
// Covers the decisions that make or break the feature: WHAT ends up in the block
// (merged, English only, in order), WHEN it is re-injected (surface-aware,
// edit-aware, selection-aware), and the storage contract (builtin stays backed
// by SKILL.md, legacy override is imported once, corrupt files recover).
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync, readFileSync, mkdirSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// A disposable DSH_HOME so the tests never touch the real skill or library.
const HOME = mkdtempSync(join(tmpdir(), 'spec-loop-test-'))
process.env.DSH_HOME = HOME
mkdirSync(join(HOME, 'skills', 'ds-spec-loop'), { recursive: true })
const SKILL_FILE = join(HOME, 'skills', 'ds-spec-loop', 'SKILL.md')
const SKILL_SOURCE = '---\nname: ds-spec-loop\n---\nSKILL BODY\n'
writeFileSync(SKILL_FILE, SKILL_SOURCE, 'utf8')

const STORAGES = join(HOME, 'storages')
const ITEMS = join(STORAGES, 'spec-loop', 'items.json')
const LEGACY = join(STORAGES, 'spec-loop-prompt.md')

/** Wipe the library between groups so each starts from a known state. */
function resetStore() {
  rmSync(STORAGES, { recursive: true, force: true })
}

const { apply, wrapText, liveInjectionText, name } = await import('./lib/index.js')

/**
 * Count real opening tags. The supersede notice mentions `<spec-loop>` in prose,
 * so a substring match over-counts; only a line that IS the tag opens a block.
 */
const blockCount = (text) => text.split('\n').filter((line) => line === '<spec-loop>').length

// --- wrapText -----------------------------------------------------------
{
  const wrapped = wrapText('  hello  ')
  assert.ok(wrapped.startsWith('<spec-loop>\n'), 'opens with the tag')
  assert.ok(wrapped.endsWith('\n</spec-loop>'), 'closes with the tag')
  assert.ok(wrapped.includes('\nhello\n'), 'carries the trimmed body')
  // The supersede notice is what makes append-only editing correct: the older
  // block stays in history (removing it would rewrite the cached prefix), so
  // the newest block must declare that it wins.
  assert.ok(wrapped.includes('REPLACES every earlier <spec-loop> block'), 'declares supersession')
  // It must live in the wrapper, not the body, so an edit cannot drop it.
  assert.ok(wrapText('anything').includes('REPLACES every earlier'), 'supersession survives any body')

  // Many bodies merge into ONE block, blank-line separated, in the given order.
  const merged = wrapText(['FIRST', 'SECOND'])
  assert.equal(blockCount(merged), 1, 'one opening tag for many bodies')
  assert.ok(merged.includes('FIRST\n\nSECOND'), 'bodies join in order, separated by a blank line')
  // Empty bodies are dropped rather than leaving holes.
  assert.ok(wrapText(['A', '   ', 'B']).includes('A\n\nB'), 'blank bodies are skipped')
}

// --- liveInjectionText: surface awareness -------------------------------
const ownMessage = (seq, text) => ({
  seq,
  type: 'user/message',
  data: { source: { kind: 'plugin', plugin: name }, content: [{ type: 'text', text }] },
})
const userMessage = (seq) => ({
  seq,
  type: 'user/message',
  data: { source: { kind: 'user' }, content: [{ type: 'text', text: 'hi' }] },
})

{
  assert.equal(liveInjectionText({ events: [], surface: { nodes: [] } }), undefined, 'no events → nothing live')
  assert.equal(
    liveInjectionText({ events: [userMessage(1)], surface: { nodes: [1] } }),
    undefined,
    'a plain user message is not our injection',
  )
  assert.equal(
    liveInjectionText({ events: [ownMessage(2, 'X')], surface: { nodes: [2] } }),
    'X',
    'our injection still on the surface is live',
  )
  // The compaction case: the event still exists in the log but left the surface.
  assert.equal(
    liveInjectionText({ events: [ownMessage(2, 'X')], surface: { nodes: [] } }),
    undefined,
    'pruned by compaction → not live, so it must be re-injected',
  )
  // Only the latest of ours decides.
  assert.equal(
    liveInjectionText({ events: [ownMessage(2, 'OLD'), ownMessage(5, 'NEW')], surface: { nodes: [2, 5] } }),
    'NEW',
    'the latest injection wins',
  )
}

// --- harness ------------------------------------------------------------
/**
 * One live plugin instance: the API handler and the pre-step listener share the
 * same in-memory session state, so a test can toggle then inject.
 */
function harness(config) {
  const routes = []
  const listeners = new Map()
  const ctx = {
    on: (event, fn) => { listeners.set(event, fn) },
    effect: (fn) => { fn() },
    logger: { info: () => {}, warn: () => {} },
    systemPrompt: { section: () => {} },
    webServer: { register: (route) => { routes.push(route) } },
    agents: { get: () => undefined },
  }
  apply(ctx, config)
  const route = routes[0]
  const call = async (sessionId, patch) => {
    const body = JSON.stringify(Object.assign({ sessionId }, patch || {}))
    const req = Object.assign((async function* () { yield Buffer.from(body) })(), {
      method: 'POST',
      headers: { host: '127.0.0.1:1234' },
    })
    let payload
    await route.handler(req, { writeHead: () => {}, end: (text) => { payload = JSON.parse(text) } })
    return payload
  }
  return { call, preStep: listeners.get('agent/pre-step') }
}

/** Drive one pre-step decision through the listener. */
async function decide(preStep, agent, messages = []) {
  return preStep(
    { agent, turn: 1, step: 1, signal: { aborted: false } },
    async () => ({ kind: 'enter', messages }),
  )
}

const agentWith = (id, events, surfaceSeqs) => ({
  id,
  session: { events, surface: { nodes: surfaceSeqs } },
})

const bodyOf = (decision, at = 0) => decision.messages[at].content[0].text

// --- criterion 8: a fresh install is the builtin, backed by SKILL.md -----
{
  resetStore()
  const { call, preStep } = harness()
  const state = await call('s1')
  assert.equal(state.ok, true)
  assert.equal(state.items.length, 1, 'a fresh library holds exactly the builtin')
  const builtin = state.items[0]
  assert.equal(builtin.builtin, true)
  assert.equal(builtin.customised, false, 'untouched builtin is not customised')
  assert.equal(builtin.en, '', 'the builtin stores no text of its own until edited')
  assert.ok(builtin.resolvedEn.includes('SKILL BODY'), 'its effective text is synthesised from SKILL.md')
  assert.ok(!builtin.resolvedEn.includes('name: ds-spec-loop'), 'front matter stripped')
  assert.equal(state.enabled, false, 'a new session starts with nothing selected')
  assert.deepEqual(state.selected, [], 'and an empty selection')

  // Nothing selected → nothing injected.
  const idle = await decide(preStep, agentWith('s1', [], []), [{ id: 'u1' }])
  assert.deepEqual(idle.messages, [{ id: 'u1' }], 'no injection while nothing is selected')

  // The pill selects the default (the builtin), reproducing the old behaviour.
  const on = await call('s1', { enabled: true })
  assert.equal(on.enabled, true)
  assert.deepEqual(on.selected, [builtin.id], 'the pill turns on the default selection')

  const injected = await decide(preStep, agentWith('s1', [], []), [{ id: 'u1' }])
  assert.equal(injected.kind, 'enter')
  assert.equal(injected.messages.length, 2, 'the injected message is appended after the claimed ones')
  const claimed = injected.messages[1]
  assert.equal(claimed.role, 'user', 'injected as a USER message, not a system section')
  assert.equal(claimed.source.kind, 'plugin')
  assert.equal(claimed.source.plugin, name)
  const text = bodyOf(injected, 1)
  assert.ok(text.startsWith('<spec-loop>') && text.endsWith('</spec-loop>'), 'wrapped in the tags')
  assert.ok(text.includes('SKILL BODY'))

  // --- criterion 10: idempotency and compaction recovery ---------------
  const again = await decide(preStep, agentWith('s1', [ownMessage(7, text)], [7]), [])
  assert.deepEqual(again.messages, [], 'no re-injection while the copy is still effective')
  const healed = await decide(preStep, agentWith('s1', [ownMessage(7, text)], []), [])
  assert.equal(healed.messages.length, 1, 're-injected exactly once after compaction dropped it')

  // A different session stays untouched.
  const other = await decide(preStep, agentWith('s2', [], []), [])
  assert.deepEqual(other.messages, [], 'the selection is per session')

  // Turning the pill off clears the selection; turning it back on restores it.
  const off = await call('s1', { enabled: false })
  assert.equal(off.enabled, false)
  assert.deepEqual(off.selected, [])
  const back = await call('s1', { enabled: true })
  assert.deepEqual(back.selected, [builtin.id], 'the pill restores the last selection')
}

// --- criteria 1-3: many items merge; only English travels ---------------
{
  resetStore()
  const { call, preStep } = harness()
  const base = await call('s1')
  const builtinId = base.items[0].id

  const first = await call('s1', { upsert: { title: '风格', zh: '中文原稿甲', en: 'RULE ALPHA' } })
  const alpha = first.items.find((item) => item.title === '风格')
  const second = await call('s1', { upsert: { title: '平台', zh: '中文原稿乙', en: 'RULE BETA' } })
  const beta = second.items.find((item) => item.title === '平台')
  assert.ok(alpha && beta, 'both items were created')
  assert.equal(second.items.length, 3, 'library holds the builtin plus two')

  // Criterion 1: two selected → ONE block carrying both bodies in order.
  const picked = await call('s1', { selected: [alpha.id, beta.id] })
  assert.equal(picked.enabled, true)
  const two = await decide(preStep, agentWith('s1', [], []), [])
  assert.equal(two.messages.length, 1, 'exactly one message regardless of item count')
  const merged = bodyOf(two)
  assert.equal(blockCount(merged), 1, 'exactly one <spec-loop> block')
  assert.ok(merged.includes('RULE ALPHA\n\nRULE BETA'), 'both bodies, in library order, blank-line separated')
  assert.ok(!merged.includes('SKILL BODY'), 'the unselected builtin is not injected')

  // Criterion 3: the Chinese source never leaves the process.
  assert.ok(!merged.includes('中文原稿甲') && !merged.includes('中文原稿乙'), 'no zh text is ever injected')
  assert.ok(!merged.includes('风格') && !merged.includes('平台'), 'titles are UI labels, not injected')

  // Criterion 2: unchecking one re-injects with only the remainder.
  await call('s1', { selected: [alpha.id] })
  const one = await decide(preStep, agentWith('s1', [ownMessage(9, merged)], [9]), [])
  assert.equal(one.messages.length, 1, 'a selection change supersedes the live block')
  assert.ok(bodyOf(one).includes('RULE ALPHA'), 'the remaining body stays')
  assert.ok(!bodyOf(one).includes('RULE BETA'), 'the unchecked body is gone')

  // ...and rechecking restores the pair.
  await call('s1', { selected: [alpha.id, beta.id] })
  const restored = await decide(preStep, agentWith('s1', [ownMessage(11, bodyOf(one))], [11]), [])
  assert.ok(bodyOf(restored).includes('RULE ALPHA\n\nRULE BETA'), 'rechecking restores the merged block')

  // Order follows the library, not the click order.
  await call('s1', { order: [beta.id, alpha.id, builtinId] })
  await call('s1', { selected: [alpha.id, beta.id] })
  const reordered = await decide(preStep, agentWith('s1', [], []), [])
  assert.ok(bodyOf(reordered).includes('RULE BETA\n\nRULE ALPHA'), 'reordering changes the injected order')

  // Prompt-cache invariant: injection only APPENDS, never rewrites the step.
  const prior = [{ id: 'u1' }, { id: 'u2' }]
  const appended = await decide(preStep, agentWith('s1', [], []), prior)
  assert.deepEqual(appended.messages.slice(0, 2), prior, 'prior messages pass through untouched')
  assert.equal(appended.messages.length, 3, 'exactly one message is appended at the tail')

  // A rejected step is passed straight through.
  const rejected = await preStep(
    { agent: agentWith('s1', [], []), turn: 1, step: 1, signal: { aborted: false } },
    async () => ({ kind: 'reject' }),
  )
  assert.deepEqual(rejected, { kind: 'reject' }, 'a rejected step is never overridden')
}

// --- criteria 4-5: editing zh is inert until translated -----------------
{
  resetStore()
  const { call, preStep } = harness()
  const created = await call('s1', { upsert: { title: 'T', zh: '初稿', en: 'ENGLISH V1', translatedFrom: '初稿' } })
  const item = created.items.find((entry) => entry.title === 'T')
  assert.equal(item.stale, false, 'zh matching translatedFrom is in sync')

  await call('s1', { selected: [item.id] })
  const before = await decide(preStep, agentWith('s1', [], []), [])
  assert.ok(bodyOf(before).includes('ENGLISH V1'))

  // Criterion 4: saving a new zh alone changes nothing about the injection.
  const edited = await call('s1', { upsert: { id: item.id, zh: '改过的中文' } })
  const staleItem = edited.items.find((entry) => entry.id === item.id)
  // Criterion 5: ...but it is flagged.
  assert.equal(staleItem.stale, true, 'zh moved past translatedFrom → 待翻译')
  assert.equal(staleItem.en, 'ENGLISH V1', 'the product is untouched')
  const after = await decide(preStep, agentWith('s1', [ownMessage(3, bodyOf(before))], [3]), [])
  assert.deepEqual(after.messages, [], 'no re-injection: what the model sees did not change')

  // Translating and saving clears the flag and swaps the product.
  const translated = await call('s1', {
    upsert: { id: item.id, en: 'ENGLISH V2', translatedFrom: '改过的中文' },
  })
  const fresh = translated.items.find((entry) => entry.id === item.id)
  assert.equal(fresh.stale, false, 'the badge clears once the pair is back in sync')
  const swapped = await decide(preStep, agentWith('s1', [ownMessage(3, bodyOf(before))], [3]), [])
  assert.equal(swapped.messages.length, 1, 'the new product supersedes the live block')
  assert.ok(bodyOf(swapped).includes('ENGLISH V2'))

  // An item with no zh at all is never "stale" — there is nothing to translate.
  const bare = await call('s1', { upsert: { title: 'EN only', en: 'JUST ENGLISH' } })
  assert.equal(bare.items.find((entry) => entry.title === 'EN only').stale, false, 'empty zh is not stale')
}

// --- criterion 9: reset restores the builtin, SKILL.md untouched --------
{
  resetStore()
  const { call } = harness()
  const base = await call('s1')
  const id = base.items[0].id

  const customised = await call('s1', { upsert: { id, zh: '我的中文', en: 'MY CUSTOM RULES' } })
  const edited = customised.items[0]
  assert.equal(edited.customised, true, 'saving text customises the builtin')
  assert.equal(edited.resolvedEn, 'MY CUSTOM RULES', 'the override is what would be injected')

  const reset = await call('s1', { resetItem: id })
  const restored = reset.items[0]
  assert.equal(restored.customised, false, 'reset drops the customisation')
  assert.equal(restored.zh, '', 'reset clears the Chinese source too')
  assert.ok(restored.resolvedEn.includes('SKILL BODY'), 'reset restores the skill body')
  assert.equal(readFileSync(SKILL_FILE, 'utf8'), SKILL_SOURCE, 'SKILL.md was never written')

  // The builtin cannot be deleted, only reset — otherwise the shipped skill
  // would become unreachable from the panel.
  const refused = await call('s1', { remove: id })
  assert.equal(refused.ok, false, 'deleting the builtin is refused')
}

// --- criterion 7: the legacy single-text override is imported once ------
{
  resetStore()
  mkdirSync(STORAGES, { recursive: true })
  writeFileSync(LEGACY, 'LEGACY PINNED TEXT', 'utf8')

  const { call, preStep } = harness()
  const state = await call('s1')
  assert.equal(state.items.length, 1, 'the import produces exactly one item')
  const imported = state.items[0]
  assert.equal(imported.builtin, true)
  assert.equal(imported.resolvedEn, 'LEGACY PINNED TEXT', 'the injected text is the legacy file, byte for byte')
  assert.ok(!imported.resolvedEn.includes('SKILL BODY'), 'the legacy text wins over the shipped skill')
  assert.equal(readFileSync(LEGACY, 'utf8'), 'LEGACY PINNED TEXT', 'the legacy file is left untouched')
  assert.equal(existsSync(ITEMS), false, 'a plain read writes nothing: the import stays one-way')

  await call('s1', { enabled: true })
  const injected = await decide(preStep, agentWith('s1', [], []), [])
  assert.ok(bodyOf(injected).includes('LEGACY PINNED TEXT'), 'the upgraded user sees their own text')

  rmSync(LEGACY, { force: true })
}

// --- corrupt library recovers instead of breaking injection -------------
{
  resetStore()
  mkdirSync(join(STORAGES, 'spec-loop'), { recursive: true })
  writeFileSync(ITEMS, '{ this is not json', 'utf8')

  const { call } = harness()
  const state = await call('s1')
  assert.equal(state.ok, true, 'a corrupt library does not break the panel')
  assert.ok(typeof state.warning === 'string' && state.warning !== '', 'the recovery is reported, not swallowed')
  assert.equal(state.items.length, 1, 'it falls back to the builtin')
  assert.ok(state.items[0].resolvedEn.includes('SKILL BODY'))
  assert.equal(existsSync(ITEMS + '.broken'), true, 'the unreadable file is moved aside, not overwritten')
}

// --- a hand-edited library that dropped the builtin gets one back -------
{
  resetStore()
  mkdirSync(join(STORAGES, 'spec-loop'), { recursive: true })
  writeFileSync(ITEMS, JSON.stringify({ version: 1, items: [{ id: 'x', title: 'Mine', en: 'MINE' }] }), 'utf8')

  const { call } = harness()
  const state = await call('s1')
  assert.equal(state.items.length, 2, 'the builtin is restored alongside the hand-written item')
  assert.equal(state.items.filter((item) => item.builtin).length, 1, 'exactly one builtin')
}

// --- legacy system-prompt mode still available --------------------------
{
  resetStore()
  const { preStep } = harness({ injectAs: 'system-prompt' })
  assert.equal(preStep, undefined, 'system-prompt mode registers no pre-step listener')
}

rmSync(HOME, { recursive: true, force: true })
console.log('test-inject: all assertions passed')
