/**
 * dsh-ding tests. Run with `node --test test/plugin.test.mjs`.
 *
 * These cover the pure decision logic (config normalization, sound resolution,
 * event → chime mapping) without needing a running Harness. Playback paths are
 * exercised with a stand-in command so the suite stays silent and fast.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import {
  apply,
  normalize,
  presetPath,
  resolveSound,
  findFfplay,
  play,
  playOnce,
  PRESETS,
  PRESET_IDS,
  DEFAULTS,
  Config,
  __test__,
} from '../lib/index.js'

const SOUNDS_DIR = fileURLToPath(new URL('../assets/sounds/', import.meta.url))
const { playing, resetCaches } = __test__

/** Wait until no stand-in player process is still tracked. */
async function drainPlayers(timeoutMs = 3000) {
  const deadline = Date.now() + timeoutMs
  while (playing.size > 0 && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
}

/** A silent stand-in player, so tests never make noise. */
const SILENT = { command: 'node -e process.exit(0) {file}' }

// ---------------------------------------------------------------- presets

test('every preset ships an audio file', () => {
  assert.ok(PRESETS.length >= 5, 'should bundle several chimes')
  for (const preset of PRESETS) {
    const path = presetPath(preset.id)
    assert.ok(path, `preset ${preset.id} resolves`)
    assert.equal(existsSync(path), true, `preset ${preset.id} file exists`)
  }
})

test('the Zcode chime is one of the presets', () => {
  assert.ok(PRESET_IDS.includes('zcode'))
  assert.ok(existsSync(presetPath('zcode')))
})

test('an unknown preset id resolves to undefined', () => {
  assert.equal(presetPath('does-not-exist'), undefined)
})

test('bundled presets are 16-bit PCM WAV (SoundPlayer fallback compatible)', async () => {
  const { readFileSync } = await import('node:fs')
  for (const preset of PRESETS) {
    const bytes = readFileSync(presetPath(preset.id))
    assert.equal(bytes.subarray(0, 4).toString('ascii'), 'RIFF', `${preset.id} is RIFF`)
    assert.equal(bytes.subarray(8, 12).toString('ascii'), 'WAVE', `${preset.id} is WAVE`)
    // fmt chunk: audioFormat at offset 20, bitsPerSample at 34
    assert.equal(bytes.readUInt16LE(20), 1, `${preset.id} is PCM`)
    assert.equal(bytes.readUInt16LE(34), 16, `${preset.id} is 16-bit`)
  }
})

// ---------------------------------------------------------------- config

test('defaults enable the three requested moments', () => {
  const config = normalize(undefined)
  assert.equal(config.enabled, true)
  assert.equal(config.completed, true)
  assert.equal(config.needsReply, true)
  assert.equal(config.failed, true)
  // Stopping by hand should not startle the user.
  assert.equal(config.aborted, false)
  assert.equal(config.topLevelOnly, true)
  assert.equal(config.soundPreset, DEFAULTS.soundPreset)
})

test('bad config is tolerated instead of crashing the plugin', () => {
  const config = normalize({
    enabled: 'yes',        // wrong type, keep default
    completed: false,      // valid
    volume: 999,           // clamp
    soundPath: 42,         // wrong type, ignore
    soundPreset: 'nope',   // unknown, fall back
  })
  assert.equal(config.enabled, true)
  assert.equal(config.completed, false)
  assert.equal(config.volume, 100)
  assert.equal(config.soundPath, '')
  assert.equal(config.soundPreset, DEFAULTS.soundPreset)
})

test('volume is clamped to 0-100', () => {
  assert.equal(normalize({ volume: -20 }).volume, 0)
  assert.equal(normalize({ volume: 55 }).volume, 55)
  assert.equal(normalize({ volume: 'x' }).volume, 100)
})

test('the Config schema accepts an empty object and applies defaults', () => {
  const parsed = Config({})
  assert.equal(parsed.enabled, true)
  assert.equal(parsed.soundPreset, DEFAULTS.soundPreset)
  assert.equal(parsed.volume, 100)
})

test('the Config schema rejects an unknown preset', () => {
  assert.throws(() => Config({ soundPreset: 'not-a-preset' }))
})

test('the Config schema rejects out-of-range volume', () => {
  assert.throws(() => Config({ volume: 500 }))
})

// ---------------------------------------------------------------- resolution

test('no custom path means the selected preset is used', () => {
  assert.equal(resolveSound(normalize({ soundPreset: 'ding' })), presetPath('ding'))
})

test('an existing custom path wins over the preset', () => {
  const existing = presetPath('ding')
  const config = normalize({ soundPreset: 'chime', soundPath: existing })
  assert.equal(resolveSound(config), existing)
})

test('a missing custom path falls back so the chime still rings', () => {
  const config = normalize({ soundPreset: 'soft', soundPath: 'Z:\\nope\\missing.wav' })
  assert.equal(resolveSound(config), presetPath('soft'))
})

// ---------------------------------------------------------------- playing

test('findFfplay returns a usable executable name', () => {
  resetCaches()
  const found = findFfplay()
  assert.equal(typeof found, 'string')
  assert.ok(found.length > 0)
})

test('play starts a player without throwing', async () => {
  resetCaches()
  await drainPlayers()
  // A stand-in command keeps the suite silent while proving the spawn path.
  const ok = play(normalize({ ...SILENT, soundPreset: 'ding' }))
  assert.equal(ok, true)
  await drainPlayers()
  assert.equal(playing.size, 0, 'no player process is left behind')
})

test('play swallows a missing player instead of throwing', () => {
  resetCaches()
  assert.doesNotThrow(() => play(normalize({ command: 'definitely-not-a-player {file}' })))
})

test('playOnce dedupes the same session and kind', async () => {
  resetCaches()
  await drainPlayers()
  const config = normalize(SILENT)
  playOnce('session-a', 'completed', config)
  const first = playing.size
  playOnce('session-a', 'completed', config)
  assert.equal(playing.size, first, 'a second identical chime inside the window is dropped')
  await drainPlayers()
})

test('playOnce keeps different sessions and kinds apart', async () => {
  resetCaches()
  await drainPlayers()
  const config = normalize(SILENT)
  playOnce('session-a', 'completed', config)
  const first = playing.size
  playOnce('session-b', 'completed', config)
  playOnce('session-a', 'failed', config)
  assert.ok(playing.size > first, 'different keys each play')
  await drainPlayers()
})

// ---------------------------------------------------------------- events

/** Minimal Cordis-like context for driving `apply`. */
function makeCtx({ roots = [] } = {}) {
  const listeners = new Map()
  const disposers = []
  const ctx = {
    on(name, handler) {
      if (!listeners.has(name)) listeners.set(name, [])
      listeners.get(name).push(handler)
      return () => {}
    },
    effect(callback) {
      const dispose = callback()
      if (typeof dispose === 'function') disposers.push(dispose)
      return () => {}
    },
    get(name) {
      if (name === 'agents') return { roots: () => roots }
      return undefined
    },
  }
  return {
    ctx,
    listeners,
    emit(name, ...args) { return (listeners.get(name) ?? []).map((fn) => fn(...args)) },
    disposeAll() { for (const dispose of disposers.reverse()) dispose() },
  }
}

const header = (extra = {}) => ({ id: 'session-1', createdAt: 0, isSeeded: false, ...extra })

test('turn/end registers a listener', () => {
  const { ctx, listeners } = makeCtx()
  apply(ctx, { command: 'node -e process.exit(0) {file}' })
  assert.equal(listeners.get('session/event')?.length, 1)
})

test('subagent turns are filtered out when topLevelOnly is on', async () => {
  resetCaches()
  await drainPlayers()
  const { ctx, listeners } = makeCtx()
  apply(ctx, { topLevelOnly: true, ...SILENT })
  const handler = listeners.get('session/event')[0]
  // A subagent header must not produce a chime.
  handler(
    { id: 'child', header: header({ origin: 'subagent', parentSession: 'parent' }) },
    { type: 'turn/end', seq: 1, time: 0, data: { turn: 1, reason: { kind: 'completed' } } },
  )
  assert.equal(playing.size, 0, 'no player started for a subagent')
})

test('turn/end with reason completed plays for a top-level session', async () => {
  resetCaches()
  await drainPlayers()
  const { ctx, listeners } = makeCtx()
  apply(ctx, SILENT)
  listeners.get('session/event')[0](
    { id: 'top', header: header() },
    { type: 'turn/end', seq: 1, time: 0, data: { turn: 1, reason: { kind: 'completed' } } },
  )
  assert.ok(playing.size > 0, 'a chime was started')
  await drainPlayers()
})

test('a max-tokens end counts as a failure', async () => {
  resetCaches()
  await drainPlayers()
  const { ctx, listeners } = makeCtx()
  apply(ctx, SILENT)
  listeners.get('session/event')[0](
    { id: 'top', header: header() },
    { type: 'turn/end', seq: 1, time: 0, data: { turn: 1, reason: { kind: 'max-tokens' } } },
  )
  assert.ok(playing.size > 0)
  await drainPlayers()
})

test('an aborted end stays silent by default', async () => {
  resetCaches()
  await drainPlayers()
  const { ctx, listeners } = makeCtx()
  apply(ctx, SILENT)
  listeners.get('session/event')[0](
    { id: 'top', header: header() },
    { type: 'turn/end', seq: 1, time: 0, data: { turn: 1, reason: { kind: 'aborted', reason: { kind: 'user' } } } },
  )
  assert.equal(playing.size, 0)
})

test('user-questions/request passes next() through and plays', async () => {
  resetCaches()
  const { ctx, listeners } = makeCtx()
  apply(ctx, { command: 'node -e process.exit(0) {file}' })
  const handler = listeners.get('user-questions/request')[0]
  let called = false
  const result = await handler(
    { questions: [{ id: 'q1', question: 'go on?' }], agent: { id: 'top' } },
    async () => { called = true; return { answers: [] } },
  )
  assert.equal(called, true, 'the waterfall must be passed through')
  assert.deepEqual(result, { answers: [] }, 'the downstream answer is returned unchanged')
})

test('approval/request passes next() through intact', async () => {
  const { ctx, listeners } = makeCtx()
  apply(ctx, { command: 'node -e process.exit(0) {file}' })
  const handler = listeners.get('approval/request')[0]
  let called = false
  const result = await handler(
    { agent: { id: 'top' }, toolName: 'bash' },
    async () => { called = true; return 'allowed-once' },
  )
  assert.equal(called, true)
  assert.equal(result, 'allowed-once')
})

test('disabled config registers no event listeners', () => {
  const { ctx, listeners } = makeCtx()
  apply(ctx, { enabled: false })
  assert.equal(listeners.get('session/event'), undefined)
  assert.equal(listeners.get('user-questions/request'), undefined)
  assert.equal(listeners.get('approval/request'), undefined)
  assert.equal(listeners.get('agent/error'), undefined)
})

test('unloading cleans up without throwing', () => {
  const { ctx, disposeAll } = makeCtx()
  apply(ctx, { command: 'node -e process.exit(0) {file}' })
  assert.doesNotThrow(() => disposeAll())
})
