/**
 * Presence route tests.
 *
 * The settings page and the presence reporter are the only callers of these
 * routes, so their contract is what keeps quiet-on-viewing correct: the Host
 * must accept a report, replace it on the next one, and forget it when asked.
 *
 * Run with: node --test test/presence.test.mjs
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { apply, normalize, presence, isBeingViewed, PRESENCE_TTL_MS } from '../lib/index.js'

/** A response object that records what the handler wrote. */
function makeResponse() {
  const state = { status: 0, headers: {}, body: '', ended: false }
  return {
    state,
    writeHead(status, headers) { state.status = status; state.headers = { ...headers } },
    end(body) { state.ended = true; state.body = body === undefined ? '' : (Buffer.isBuffer(body) ? body : String(body)) },
  }
}

/** A request carrying an optional JSON body. */
function makeRequest(method, url, body) {
  const chunks = body === undefined ? [] : [Buffer.from(JSON.stringify(body), 'utf8')]
  return {
    method,
    url,
    async *[Symbol.asyncIterator]() { for (const chunk of chunks) yield chunk },
  }
}

/** Minimal context exposing a web server and an editor. */
function makeCtx() {
  let handler
  const ctx = {
    on() { return () => {} },
    effect(callback) { const d = callback(); return () => {} },
    get(name) {
      if (name === 'webServer') {
        return { register(route) { handler = route.handler; return () => { handler = undefined } } }
      }
      if (name === 'configEditor') {
        return {
          entries() { return [] },
          configuration() { return [] },
          async edit() { return {} },
        }
      }
      return undefined
    },
  }
  return { ctx, getHandler: () => handler }
}

const BASE = 'http://127.0.0.1:1234'

/** Reset shared presence state between tests. */
function reset() {
  presence.sessionId = undefined
  presence.focused = false
  presence.at = 0
}

test('a focused report marks that session as being viewed', async () => {
  reset()
  const { ctx, getHandler } = makeCtx()
  apply(ctx, normalize({}))

  const res = makeResponse()
  await getHandler()(makeRequest('POST', `${BASE}/dsh-ding/presence`, { sessionId: 's1', focused: true }), res)

  assert.equal(res.state.status, 200)
  assert.equal(isBeingViewed('s1', normalize({})), true)
  assert.equal(isBeingViewed('s2', normalize({})), false)
  reset()
})

test('an unfocused report clears the viewed session', async () => {
  reset()
  const { ctx, getHandler } = makeCtx()
  apply(ctx, normalize({}))
  const handler = getHandler()

  await handler(makeRequest('POST', `${BASE}/dsh-ding/presence`, { sessionId: 's1', focused: true }), makeResponse())
  assert.equal(isBeingViewed('s1', normalize({})), true)

  await handler(makeRequest('POST', `${BASE}/dsh-ding/presence`, { sessionId: 's1', focused: false }), makeResponse())
  assert.equal(isBeingViewed('s1', normalize({})), false, 'blurring the window re-enables chimes')
  reset()
})

test('switching to another session replaces the viewed one', async () => {
  reset()
  const { ctx, getHandler } = makeCtx()
  apply(ctx, normalize({}))
  const handler = getHandler()

  await handler(makeRequest('POST', `${BASE}/dsh-ding/presence`, { sessionId: 's1', focused: true }), makeResponse())
  await handler(makeRequest('POST', `${BASE}/dsh-ding/presence`, { sessionId: 's2', focused: true }), makeResponse())

  assert.equal(isBeingViewed('s1', normalize({})), false)
  assert.equal(isBeingViewed('s2', normalize({})), true)
  reset()
})

test('/presence/close forgets what was being viewed', async () => {
  reset()
  const { ctx, getHandler } = makeCtx()
  apply(ctx, normalize({}))
  const handler = getHandler()

  await handler(makeRequest('POST', `${BASE}/dsh-ding/presence`, { sessionId: 's1', focused: true }), makeResponse())
  await handler(makeRequest('POST', `${BASE}/dsh-ding/presence/close`), makeResponse())
  assert.equal(isBeingViewed('s1', normalize({})), false)
  reset()
})

test('a report without a session id still records focus', async () => {
  reset()
  const { ctx, getHandler } = makeCtx()
  apply(ctx, normalize({}))
  const handler = getHandler()

  await handler(makeRequest('POST', `${BASE}/dsh-ding/presence`, { focused: true }), makeResponse())
  assert.equal(isBeingViewed('anything', normalize({})), false, 'no session means nothing is viewed')
  reset()
})

test('presence is ignored once it is stale', async () => {
  reset()
  const { ctx, getHandler } = makeCtx()
  apply(ctx, normalize({}))
  const handler = getHandler()

  await handler(makeRequest('POST', `${BASE}/dsh-ding/presence`, { sessionId: 's1', focused: true }), makeResponse())
  presence.at = Date.now() - PRESENCE_TTL_MS - 1
  assert.equal(isBeingViewed('s1', normalize({})), false, 'a suspended tab cannot silence the plugin')
  reset()
})

test('presence requires POST', async () => {
  reset()
  const { ctx, getHandler } = makeCtx()
  apply(ctx, normalize({}))

  const res = makeResponse()
  await getHandler()(makeRequest('GET', `${BASE}/dsh-ding/presence`), res)
  assert.equal(res.state.status, 405)
  reset()
})
