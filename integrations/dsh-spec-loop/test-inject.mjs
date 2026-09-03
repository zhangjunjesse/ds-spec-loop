// Pure unit tests for the user-message injection path (no network, no DSH).
//   node test-inject.mjs
// Covers the two decisions that make or break the feature: WHEN to inject
// (surface-aware, edit-aware) and WHAT shape the injected message has.
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// A disposable DSH_HOME so the tests never touch the real skill or override.
const HOME = mkdtempSync(join(tmpdir(), 'spec-loop-test-'))
process.env.DSH_HOME = HOME
mkdirSync(join(HOME, 'skills', 'ds-spec-loop'), { recursive: true })
writeFileSync(
  join(HOME, 'skills', 'ds-spec-loop', 'SKILL.md'),
  '---\nname: ds-spec-loop\n---\nSKILL BODY\n',
  'utf8',
)
const OVERRIDE = join(HOME, 'storages', 'spec-loop-prompt.md')

const { apply, wrapText, liveInjectionText, name } = await import('./lib/index.js')

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

// --- the pre-step listener ---------------------------------------------
/** Minimal ctx capturing the agent/pre-step listener apply() registers. */
function harness(config) {
  const listeners = new Map()
  const ctx = {
    on: (event, fn) => { listeners.set(event, fn) },
    effect: () => {},
    logger: { info: () => {}, warn: () => {} },
    systemPrompt: { section: () => {} },
    webServer: { register: () => {} },
  }
  apply(ctx, config)
  return { ctx, preStep: listeners.get('agent/pre-step'), webServer: ctx.webServer }
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

{
  const { preStep } = harness()
  assert.equal(typeof preStep, 'function', 'user-message mode registers agent/pre-step')

  // Disabled session: untouched.
  const untouched = await decide(preStep, agentWith('s1', [], []))
  assert.deepEqual(untouched, { kind: 'enter', messages: [] }, 'no injection while the session is off')

  // A rejected step is passed straight through.
  const rejected = await preStep(
    { agent: agentWith('s1', [], []), turn: 1, step: 1, signal: { aborted: false } },
    async () => ({ kind: 'reject' }),
  )
  assert.deepEqual(rejected, { kind: 'reject' }, 'a rejected step is never overridden')
}

// Enable through the API handler, then assert the injection.
async function enableSession(sessionId, patch) {
  const routes = []
  const listeners = new Map()
  const ctx = {
    on: (event, fn) => { listeners.set(event, fn) },
    effect: (fn) => { fn() },
    logger: { info: () => {}, warn: () => {} },
    systemPrompt: { section: () => {} },
    webServer: { register: (route) => { routes.push(route) } },
  }
  apply(ctx, undefined)
  const route = routes[0]
  const body = JSON.stringify(Object.assign({ sessionId }, patch || {}))
  const req = Object.assign((async function* () { yield Buffer.from(body) })(), {
    method: 'POST',
    headers: { host: '127.0.0.1:1234' },
  })
  let payload
  const res = {
    writeHead: () => {},
    end: (text) => { payload = JSON.parse(text) },
  }
  await route.handler(req, res)
  return { payload, preStep: listeners.get('agent/pre-step') }
}

{
  const { payload, preStep } = await enableSession('s1', { enabled: true })
  assert.equal(payload.ok, true)
  assert.equal(payload.enabled, true, 'API enables the session')
  assert.equal(payload.isOverride, false, 'no override yet')
  assert.ok(payload.text.includes('SKILL BODY'), 'effective text is the skill body')
  assert.ok(!payload.text.includes('name: ds-spec-loop'), 'front matter stripped')

  // First step for that session injects one wrapped message.
  const injected = await decide(preStep, agentWith('s1', [], []), [{ id: 'u1' }])
  assert.equal(injected.kind, 'enter')
  assert.equal(injected.messages.length, 2, 'the injected message is appended after the claimed ones')
  const message = injected.messages[1]
  assert.equal(message.role, 'user', 'injected as a USER message, not a system section')
  assert.equal(message.source.kind, 'plugin')
  assert.equal(message.source.plugin, name)
  const text = message.content[0].text
  assert.ok(text.startsWith('<spec-loop>') && text.endsWith('</spec-loop>'), 'wrapped in the tags')
  assert.ok(text.includes('SKILL BODY'))

  // Same text already live on the surface → no second copy.
  const again = await decide(preStep, agentWith('s1', [ownMessage(7, text)], [7]), [])
  assert.deepEqual(again.messages, [], 'no re-injection while the copy is still effective')

  // Compaction pruned it → re-inject.
  const healed = await decide(preStep, agentWith('s1', [ownMessage(7, text)], []), [])
  assert.equal(healed.messages.length, 1, 're-injected after compaction dropped it')

  // A different session stays untouched.
  const other = await decide(preStep, agentWith('s2', [], []), [])
  assert.deepEqual(other.messages, [], 'the toggle is per session')
}

// --- editing: override wins, reset restores -----------------------------
{
  const saved = await enableSession('s1', { enabled: true, text: 'MY CUSTOM RULES' })
  assert.equal(saved.payload.isOverride, true, 'saving text creates an override')
  assert.equal(saved.payload.text, 'MY CUSTOM RULES')
  assert.ok(saved.payload.skillText.includes('SKILL BODY'), 'skillText still reports the pristine skill')

  const injected = await decide(saved.preStep, agentWith('s1', [], []), [])
  assert.ok(injected.messages[0].content[0].text.includes('MY CUSTOM RULES'), 'override is injected')

  // An edit supersedes a live copy of the OLD text.
  const stale = ownMessage(9, wrapText('OLD RULES'))
  const resupplied = await decide(saved.preStep, agentWith('s1', [stale], [9]), [])
  assert.equal(resupplied.messages.length, 1, 'an edit re-injects even though a copy is live')

  // Prompt-cache invariant: an edit only APPENDS. The listener never rewrites
  // or drops the messages already in the step, so the cached prefix survives.
  const claimed = [{ id: 'u1' }, { id: 'u2' }]
  const appended = await decide(saved.preStep, agentWith('s1', [stale], [9]), claimed)
  assert.deepEqual(appended.messages.slice(0, 2), claimed, 'prior messages pass through untouched')
  assert.equal(appended.messages.length, 3, 'exactly one message is appended at the tail')

  const reset = await enableSession('s1', { reset: true })
  assert.equal(reset.payload.isOverride, false, 'reset drops the override')
  assert.ok(reset.payload.text.includes('SKILL BODY'), 'reset restores the skill body')
}

// --- legacy system-prompt mode still available --------------------------
{
  const { preStep } = harness({ injectAs: 'system-prompt' })
  assert.equal(preStep, undefined, 'system-prompt mode registers no pre-step listener')
}

rmSync(HOME, { recursive: true, force: true })
console.log('test-inject: all assertions passed')
