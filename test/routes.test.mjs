/**
 * Route tests: the settings page's data contract.
 *
 * `lib/index.js` serves `/dsh-ding/config` and `/dsh-ding/preview` from the
 * Host. These tests drive those handlers directly with fake request/response
 * objects and a fake Loader, so the contract the page depends on — read shape,
 * write-through, and the failure answers — is pinned without a running Harness.
 *
 * Run with: node --test test/routes.test.mjs
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { apply, normalize, PRESET_IDS } from '../lib/index.js'

/** A response object that records what the handler wrote. */
function makeResponse() {
  const state = { status: 0, headers: {}, body: '', ended: false }
  return {
    state,
    writeHead(status, headers) {
      state.status = status
      state.headers = { ...headers }
    },
    end(body) {
      state.ended = true
      // Keep Buffers intact so binary responses can be inspected as bytes.
      state.body = body === undefined ? '' : (Buffer.isBuffer(body) ? body : String(body))
    },
  }
}

/** A request carrying an optional JSON body. */
function makeRequest(method, url, body) {
  const chunks = body === undefined ? [] : [Buffer.from(JSON.stringify(body), 'utf8')]
  return {
    method,
    url,
    async *[Symbol.asyncIterator]() {
      for (const chunk of chunks) yield chunk
    },
  }
}

/**
 * Build a context with a web server and a fake Loader.
 *
 * `rows` is the editable list; a write through `configEditor.edit` mutates it,
 * which is how the real service behaves.
 */
function makeCtx({ rows = [], writable = true } = {}) {
  let handler
  const writes = []
  const ctx = {
    on() { return () => {} },
    effect(callback) { const d = callback(); return () => {} },
    get(name) {
      if (name === 'webServer') {
        return {
          register(route) { handler = route.handler; return () => { handler = undefined } },
        }
      }
      if (name === 'configEditor') {
        return {
          entries() { return rows },
          configuration() { return rows.map((entry) => ({ entry, override: entry?.options?.config })) },
          async edit(entry, change) {
            if (!writable) throw new Error('profile is read-only')
            const current = entry?.options?.config ?? {}
            const next = change(current)
            entry.options.config = next
            writes.push(next)
            return next
          },
        }
      }
      return undefined
    },
  }
  return { ctx, getHandler: () => handler, writes }
}

/** A row as the Loader exposes it. */
function makeRow(config) {
  // The row id is this plugin's own key (`dsh-ding`); the specifier is the npm
  // package name (`dsh-ding-chime`).
  return { options: { id: 'dsh-ding', name: 'dsh-ding-chime', config } }
}

const BASE = 'http://127.0.0.1:1234'

test('GET /dsh-ding/config reports the live value', async () => {
  const row = makeRow({ enabled: true, soundPreset: 'chime', volume: 40 })
  const { ctx, getHandler } = makeCtx({ rows: [row] })
  apply(ctx, normalize({}))

  const res = makeResponse()
  await getHandler()(makeRequest('GET', `${BASE}/dsh-ding/config`), res)

  assert.equal(res.state.status, 200)
  const payload = JSON.parse(res.state.body)
  assert.equal(payload.ok, true)
  assert.equal(payload.value.soundPreset, 'chime')
  assert.equal(payload.value.volume, 40)
})

test('POST /dsh-ding/config writes through to the Loader', async () => {
  const row = makeRow({ enabled: true })
  const { ctx, getHandler, writes } = makeCtx({ rows: [row] })
  apply(ctx, normalize({}))

  const res = makeResponse()
  await getHandler()(
    makeRequest('POST', `${BASE}/dsh-ding/config`, { patch: { soundPreset: 'soft', volume: 25 } }),
    res,
  )

  const payload = JSON.parse(res.state.body)
  assert.equal(payload.ok, true, 'the write is reported as successful')
  assert.equal(payload.value.soundPreset, 'soft')
  assert.equal(payload.value.volume, 25)
  assert.equal(writes.length, 1, 'the editor received exactly one edit')
  assert.equal(row.options.config.soundPreset, 'soft', 'the stored row changed')
})

test('a write keeps fields the patch does not mention', async () => {
  const row = makeRow({ enabled: false, failed: false, soundPreset: 'ding' })
  const { ctx, getHandler } = makeCtx({ rows: [row] })
  apply(ctx, normalize({}))

  const res = makeResponse()
  await getHandler()(
    makeRequest('POST', `${BASE}/dsh-ding/config`, { patch: { volume: 60 } }),
    res,
  )

  assert.equal(row.options.config.enabled, false, 'unmentioned field survived')
  assert.equal(row.options.config.failed, false, 'unmentioned field survived')
  assert.equal(row.options.config.soundPreset, 'ding', 'unmentioned field survived')
  assert.equal(row.options.config.volume, 60)
})

test('a rejected write is reported as data, not a thrown error', async () => {
  const row = makeRow({})
  const { ctx, getHandler } = makeCtx({ rows: [row], writable: false })
  apply(ctx, normalize({}))

  const res = makeResponse()
  await getHandler()(
    makeRequest('POST', `${BASE}/dsh-ding/config`, { patch: { volume: 30 } }),
    res,
  )

  const payload = JSON.parse(res.state.body)
  assert.equal(payload.ok, false)
  assert.equal(payload.reason, 'write-failed')
  assert.match(payload.message, /read-only/)
})

test('a malformed patch is rejected with 400', async () => {
  const { ctx, getHandler } = makeCtx({ rows: [makeRow({})] })
  apply(ctx, normalize({}))

  const res = makeResponse()
  await getHandler()(makeRequest('POST', `${BASE}/dsh-ding/config`, { nope: true }), res)

  assert.equal(res.state.status, 400)
  assert.equal(JSON.parse(res.state.body).ok, false)
})

test('POST /dsh-ding/preview accepts every bundled preset', async () => {
  const { ctx, getHandler } = makeCtx({ rows: [makeRow({})] })
  // A stand-in player keeps the suite silent.
  apply(ctx, normalize({ command: 'node -e process.exit(0) {file}' }))
  const handler = getHandler()

  for (const presetId of PRESET_IDS) {
    const res = makeResponse()
    await handler(makeRequest('POST', `${BASE}/dsh-ding/preview`, { presetId }), res)
    assert.equal(res.state.status, 200, `preview for ${presetId}`)
    assert.equal(res.state.body, 'ok')
  }
})

test('POST /dsh-ding/preview rejects an unknown preset', async () => {
  const { ctx, getHandler } = makeCtx({ rows: [makeRow({})] })
  apply(ctx, normalize({}))

  const res = makeResponse()
  await getHandler()(makeRequest('POST', `${BASE}/dsh-ding/preview`, { presetId: 'nope' }), res)
  assert.equal(res.state.status, 400)
})

test('preset audio is served as WAV bytes', async () => {
  const { ctx, getHandler } = makeCtx({ rows: [makeRow({})] })
  apply(ctx, normalize({}))

  const res = makeResponse()
  await getHandler()(makeRequest('GET', `${BASE}/dsh-ding/preset/zcode.wav`), res)

  assert.equal(res.state.status, 200)
  assert.equal(res.state.headers['content-type'], 'audio/wav')
  assert.equal(res.state.body.subarray(0, 4).toString('ascii'), 'RIFF')
})

test('an unknown path answers 404', async () => {
  const { ctx, getHandler } = makeCtx({ rows: [makeRow({})] })
  apply(ctx, normalize({}))

  const res = makeResponse()
  await getHandler()(makeRequest('GET', `${BASE}/dsh-ding/nope`), res)
  assert.equal(res.state.status, 404)
})

test('routes stay available when the plugin is switched off', async () => {
  const row = makeRow({ enabled: false })
  const { ctx, getHandler } = makeCtx({ rows: [row] })
  apply(ctx, normalize({ enabled: false }))

  // The page must still be able to turn the plugin back on.
  const res = makeResponse()
  await getHandler()(makeRequest('GET', `${BASE}/dsh-ding/config`), res)
  assert.equal(res.state.status, 200)
  assert.equal(JSON.parse(res.state.body).ok, true)
})
