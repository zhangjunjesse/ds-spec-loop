// Unit tests for the translation pass (no network: the llm service is mocked).
// Run from a location where @deepseek-ai/dsh-llm resolves, e.g. the installed
// plugin under a dsh profile:
//   node test-translate.mjs
import assert from 'node:assert/strict'
import { resolveTranslateRoute, translateSystemPrompt, translateText } from './lib/index.js'

/** Chunk script for one plain-text answer, in the standard stream protocol. */
function textStream(text, finish = { kind: 'stop' }) {
  return (async function* () {
    yield { type: 'block-start', index: 0, blockType: 'text' }
    yield { type: 'text-delta', index: 0, text }
    yield { type: 'block-end', index: 0, block: { type: 'text', text } }
    yield { type: 'finish', reason: finish }
  })()
}

/** ctx whose `llm.stream` records the options it was called with. */
function mockCtx(streamFactory, calls = []) {
  return {
    calls,
    get: (key) =>
      key === 'llm'
        ? {
            stream: (options) => {
              calls.push(options)
              return streamFactory(options)
            },
          }
        : undefined,
  }
}

const agentWithRoute = (provider, model) => ({
  session: { requestContext: () => ({ provider, model, contextWindow: 200000 }) },
})

// --- system prompt ----------------------------------------------------------
{
  const prompt = translateSystemPrompt('English')
  assert.ok(prompt.includes('English'), 'target language named')
  assert.ok(/INSTRUCTIONAL FORCE/.test(prompt), 'preserves imperative force')
  assert.ok(prompt.includes('<spec-loop>'), 'tags are called out as untranslatable')
  assert.ok(/Return ONLY/.test(prompt), 'no preface allowed')
}

// --- route resolution -------------------------------------------------------
{
  // Explicit config wins over the session route.
  assert.deepEqual(
    resolveTranslateRoute({ translateProvider: 'p', translateModel: 'm' }, agentWithRoute('sess', 'sm')),
    { provider: 'p', model: 'm' },
  )
  // Default: whatever the session is already talking to.
  assert.deepEqual(resolveTranslateRoute({}, agentWithRoute('claude-code', 'fable')), {
    provider: 'claude-code',
    model: 'fable',
  })
  // A half-configured override is ignored rather than sent as a broken route.
  assert.deepEqual(resolveTranslateRoute({ translateProvider: 'p' }, agentWithRoute('claude-code', 'fable')), {
    provider: 'claude-code',
    model: 'fable',
  })
  // Nothing to go on: a named, actionable failure.
  assert.throws(() => resolveTranslateRoute({}, undefined), /no model route/)
  assert.throws(() => resolveTranslateRoute({}, { session: { requestContext: () => undefined } }), /no model route/)
  // A throwing session must not crash the resolution.
  assert.throws(
    () => resolveTranslateRoute({}, { session: { requestContext: () => { throw new Error('boom') } } }),
    /no model route/,
  )
}

// --- happy path + the call it actually makes --------------------------------
{
  const calls = []
  const ctx = mockCtx(() => textStream('Always run the tests.'), calls)
  const out = await translateText(ctx, {}, agentWithRoute('claude-code', 'fable'), '务必先跑测试。', 'English')
  assert.equal(out, 'Always run the tests.')

  assert.equal(calls.length, 1)
  const options = calls[0]
  assert.equal(options.provider, 'claude-code')
  assert.equal(options.model, 'fable')
  assert.equal(options.purpose, 'spec-loop-translate')
  assert.ok(options.system.includes('English'))
  assert.equal(options.messages.length, 1)
  assert.equal(options.messages[0].role, 'user')
  assert.equal(options.messages[0].content[0].text, '务必先跑测试。')
  assert.equal(options.messages[0].source.plugin, 'dsh-spec-loop')
  assert.ok(typeof options.maxTokens === 'number' && options.maxTokens > 0)
  assert.ok(options.signal !== undefined, 'a cancellation signal is supplied')

  // THE invariant: an auxiliary call must not carry sessionId. dsh-claude-driver
  // keys its Claude Code resume chain on it for any non-internal purpose, so
  // passing it would hand the session's live CLI conversation to a translation.
  assert.equal('sessionId' in options, false, 'sessionId is never sent on a translation call')
}

// --- target language is forwarded -------------------------------------------
{
  const calls = []
  const ctx = mockCtx(() => textStream('务必先跑测试。'), calls)
  const out = await translateText(ctx, {}, agentWithRoute('p', 'm'), 'Always run the tests.', 'Simplified Chinese')
  assert.equal(out, '务必先跑测试。')
  assert.ok(calls[0].system.includes('Simplified Chinese'))
}

// --- input guards -----------------------------------------------------------
{
  const ctx = mockCtx(() => textStream('x'))
  await assert.rejects(translateText(ctx, {}, agentWithRoute('p', 'm'), '   ', 'English'), /nothing to translate/)
  await assert.rejects(
    translateText(ctx, {}, agentWithRoute('p', 'm'), 'x'.repeat(24001), 'English'),
    /over the 24000 limit/,
  )
  // No llm service at all: a clear message, not a TypeError.
  await assert.rejects(
    translateText({ get: () => undefined }, {}, agentWithRoute('p', 'm'), 'hi', 'English'),
    /llm service is unavailable/,
  )
}

// --- terminal finish reasons ------------------------------------------------
{
  const failing = mockCtx(() => textStream('partial', { kind: 'error', failure: { message: 'route exploded' } }))
  await assert.rejects(translateText(failing, {}, agentWithRoute('p', 'm'), 'hi', 'English'), /route exploded/)

  const truncated = mockCtx(() => textStream('half a transl', { kind: 'max-tokens' }))
  await assert.rejects(translateText(truncated, {}, agentWithRoute('p', 'm'), 'hi', 'English'), /output limit/)

  const empty = mockCtx(() => textStream('   '))
  await assert.rejects(translateText(empty, {}, agentWithRoute('p', 'm'), 'hi', 'English'), /no text/)
}

console.log('test-translate: all assertions passed')
