/**
 * dsh-ding — Host half.
 *
 * Plays a sound at three moments of a DeepSeek Harness session:
 *
 *   1. a turn finished        `session/event` → `turn/end` (reason.kind 'completed')
 *   2. the agent needs you    `user-questions/request`, `approval/request`
 *   3. a turn failed          `turn/end` (error / max-tokens) and `agent/error`
 *
 * Design notes — all driven by "stay invisible when idle":
 *  - One dependency, `@deepseek-ai/schemastery`, only to declare the Config
 *    schema. It is the same schema library the Harness itself uses, so the
 *    host can render the settings form and validate the row's `config`
 *    without any custom Client code for the form.
 *  - No daemon, no polling, no timers. Each chime spawns one short-lived
 *    player process and unrefs it; the process exits on its own.
 *  - Bundled preset audio lives in `assets/sounds`, so nothing depends on a
 *    user's absolute path. A custom `soundPath` still wins when set.
 *  - Playback failures are swallowed. A chime must never affect a turn.
 */
import { spawn } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import Schema from '@deepseek-ai/schemastery'

export const name = 'dsh-ding'
export const inject = []

/** Directory holding the bundled preset sounds. */
const SOUNDS_DIR = fileURLToPath(new URL('../assets/sounds/', import.meta.url))

/**
 * Built-in presets. `file` is relative to `assets/sounds`.
 * Every preset is original synthesis (see `scripts/generate-sounds.py`),
 * so the MIT license covers the whole package.
 */
export const PRESETS = Object.freeze([
  { id: 'ding', file: 'ding.wav' },
  { id: 'chime', file: 'chime.wav' },
  { id: 'soft', file: 'soft.wav' },
  { id: 'alert', file: 'alert.wav' },
  { id: 'error', file: 'error.wav' },
  { id: 'zcode', file: 'zcode.wav' },
])

const PRESET_BY_ID = new Map(PRESETS.map((preset) => [preset.id, preset]))

/** Built-in preset ids, for config validation and the settings page. */
export const PRESET_IDS = Object.freeze(PRESETS.map((preset) => preset.id))

/** Defaults applied when a field is missing or invalid. */
export const DEFAULTS = Object.freeze({
  enabled: true,
  completed: true,
  needsReply: true,
  failed: true,
  aborted: false,
  topLevelOnly: true,
  soundPreset: 'zcode',
  soundPath: '',
  volume: 100,
  command: '',
})

const BOOLEAN_KEYS = ['enabled', 'completed', 'needsReply', 'failed', 'aborted', 'topLevelOnly']
const STRING_KEYS = ['soundPreset', 'soundPath', 'command']

/**
 * The Config schema.
 *
 * Declaring this as schemastery is what gives the plugin a settings page for
 * free: `ctx.settings` projects installed schemas into forms (the instance's
 * `autoGenerate` policy defaults to true), the Plugins page renders the form,
 * and writes go back through `ctx.remote.settings.update` into the profile
 * patch. No Client half is needed for the form itself.
 */
export const Config = Schema.object({
  enabled: Schema.boolean().default(true)
    .description('Master switch. When off, DSH Ding plays nothing.'),
  completed: Schema.boolean().default(true)
    .description('Play when a turn finishes normally.'),
  needsReply: Schema.boolean().default(true)
    .description('Play when the agent asks you something or a tool needs approval.'),
  failed: Schema.boolean().default(true)
    .description('Play when a turn stops on an error or runs out of tokens.'),
  aborted: Schema.boolean().default(false)
    .description('Play when you interrupt the turn yourself. Off by default so stopping never startles you.'),
  topLevelOnly: Schema.boolean().default(true)
    .description('Ignore subagents, so each delegated task does not chime.'),
  soundPreset: Schema.union(PRESET_IDS).default('zcode')
    .description('Which bundled chime to play.'),
  soundPath: Schema.string().default('')
    .description('Absolute path to your own audio file. When set, it overrides the preset.'),
  volume: Schema.number().min(0).max(100).default(100)
    .description('Playback volume, 0-100.'),
  command: Schema.string().default('')
    .description('Advanced: a custom player command, so any audio backend works. {file} is replaced with the audio path.'),
})

/** Normalize raw config, tolerating missing fields and wrong types. */
export function normalize(raw) {
  const config = { ...DEFAULTS }
  if (!raw || typeof raw !== 'object') return config
  for (const key of BOOLEAN_KEYS) {
    if (typeof raw[key] === 'boolean') config[key] = raw[key]
  }
  for (const key of STRING_KEYS) {
    if (typeof raw[key] === 'string') config[key] = raw[key]
  }
  const volume = Number(raw.volume)
  if (Number.isFinite(volume)) config.volume = Math.max(0, Math.min(100, volume))
  // An unknown preset id falls back to the default instead of breaking audio.
  if (config.soundPreset !== '' && !PRESET_BY_ID.has(config.soundPreset)) {
    config.soundPreset = DEFAULTS.soundPreset
  }
  return config
}

/** Absolute path of a bundled preset, or undefined when the id is unknown. */
export function presetPath(id) {
  const preset = PRESET_BY_ID.get(id)
  if (!preset) return undefined
  return `${SOUNDS_DIR}${preset.file}`
}

/**
 * Resolve the audio file to play: explicit `soundPath` wins, then the preset.
 * A non-existent custom path falls back to the preset so the chime still works.
 */
export function resolveSound(config) {
  const custom = String(config.soundPath ?? '').trim()
  if (custom && existsSync(custom)) return custom
  return presetPath(config.soundPreset) ?? presetPath(DEFAULTS.soundPreset)
}

/** Find `ffplay`, preferring an absolute install and falling back to PATH. */
let ffplayCache
export function findFfplay() {
  if (ffplayCache !== undefined) return ffplayCache
  const bare = process.platform === 'win32' ? 'ffplay.exe' : 'ffplay'
  const absolute = []
  if (process.platform === 'win32') {
    for (const root of [process.env.LOCALAPPDATA, process.env.ProgramFiles, 'C:\\']) {
      if (root) absolute.push(`${root}\\ffmpeg\\bin\\ffplay.exe`, `${root}\\tools\\ffmpeg\\bin\\ffplay.exe`)
    }
  } else {
    absolute.push('/usr/bin/ffplay', '/usr/local/bin/ffplay', '/opt/homebrew/bin/ffplay')
  }
  for (const candidate of absolute) {
    if (existsSync(candidate)) {
      ffplayCache = candidate
      return ffplayCache
    }
  }
  ffplayCache = bare
  return ffplayCache
}

/** Player processes currently alive, only so unload can clean them up. */
const playing = new Set()
let lastFailure = null

function spawnDetached(command, args) {
  let child
  try {
    child = spawn(command, args, { stdio: 'ignore', windowsHide: true })
  } catch (error) {
    lastFailure = String(error?.message ?? error)
    return false
  }
  playing.add(child)
  const forget = () => { playing.delete(child) }
  child.once('error', (error) => {
    forget()
    lastFailure = String(error?.message ?? error)
  })
  child.once('exit', forget)
  child.unref?.()
  return true
}

/**
 * Play one chime.
 *
 * @param config  normalized config
 * @param override.soundPath  play this file instead (used by the settings page preview)
 * @returns whether a player process was started
 */
export function play(config, override = {}) {
  const file = override.soundPath ?? resolveSound(config)
  const volume = Math.max(0, Math.min(100, Number(config.volume ?? 100)))
  const template = String(config.command ?? '').trim()

  // 1) custom player command
  if (template) {
    const parts = template.split(/\s+/).map((part) => part.replaceAll('{file}', file))
    return spawnDetached(parts[0], parts.slice(1))
  }

  // 2) ffplay: handles wav/mp3/flac and supports volume control
  const ffplay = findFfplay()
  if (ffplay) {
    const args = ['-nodisp', '-autoexit', '-loglevel', 'quiet']
    if (volume < 100) args.push('-volume', String(volume))
    args.push(file)
    if (spawnDetached(ffplay, args)) return true
  }

  // 3) Windows fallback: SoundPlayer handles 16-bit PCM WAV (all presets are)
  if (process.platform === 'win32' && file.toLowerCase().endsWith('.wav')) {
    const escaped = file.replaceAll("'", "''")
    const script = `(New-Object System.Media.SoundPlayer '${escaped}').PlaySync()`
    return spawnDetached('powershell.exe', [
      '-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-Command', script,
    ])
  }

  lastFailure = 'no usable audio player found (install ffmpeg, or set config.command)'
  return false
}

/**
 * Dedupe one kind of chime per session within a short window. A failed turn
 * can emit both `turn/end` and `agent/error`; this collapses them to one sound.
 */
export const DEDUPE_MS = 400
const lastPlayed = new Map()

export function playOnce(sessionId, kind, config) {
  const key = `${sessionId ?? 'unknown'}:${kind}`
  const now = Date.now()
  const previous = lastPlayed.get(key)
  if (previous !== undefined && now - previous < DEDUPE_MS) return false
  lastPlayed.set(key, now)
  if (lastPlayed.size > 64) {
    for (const [entryKey, time] of lastPlayed) {
      if (now - time > 60_000) lastPlayed.delete(entryKey)
    }
  }
  return play(config)
}

/**
 * Decide whether a session/agent is a top-level one.
 * Prefers the session header, then falls back to `ctx.agents.roots()`.
 */
export function makeTopLevelTest(ctx) {
  return (sessionOrAgent, session) => {
    const header = session?.header ?? sessionOrAgent?.header
    if (header) {
      return header.origin !== 'subagent' && header.parentSession === undefined
    }
    const id = sessionOrAgent?.id
    if (id === undefined) return true
    const agents = ctx.get?.('agents')
    if (!agents) return true
    try {
      return agents.roots().some((root) => root.id === id)
    } catch {
      return true
    }
  }
}

/**
 * Wire the listeners. Returns nothing: every registration goes through
 * `ctx.on`/`ctx.effect`, so a plugin unload tears all of it down.
 */
export function apply(ctx, rawConfig) {
  const config = normalize(rawConfig)
  const isTopLevel = makeTopLevelTest(ctx)

  // On unload, stop any chime still playing and drop cached state.
  ctx.effect(() => () => {
    for (const child of playing) {
      try { child.kill() } catch { /* already gone */ }
    }
    playing.clear()
    lastPlayed.clear()
  }, 'dsh-ding: cleanup')

  if (config.enabled === false) return

  /** A turn ended: `turn/end` carries the authoritative reason. */
  ctx.on('session/event', (session, event) => {
    if (event?.type !== 'turn/end') return
    if (config.topLevelOnly && !isTopLevel(session)) return

    const kind = event.data?.reason?.kind
    if (kind === 'completed') {
      if (config.completed) playOnce(session?.id, 'completed', config)
      return
    }
    if (kind === 'error' || kind === 'max-tokens') {
      if (config.failed) playOnce(session?.id, 'failed', config)
      return
    }
    if (kind === 'aborted' && config.aborted) {
      playOnce(session?.id, 'aborted', config)
    }
  })

  /** The agent asked a question. Waterfall: pass `next()` through untouched. */
  ctx.on('user-questions/request', async (request, next) => {
    if (config.needsReply) {
      const agent = request?.agent
      if (agent === undefined || !config.topLevelOnly || isTopLevel(agent)) {
        playOnce(agent?.id, 'needs-reply', config)
      }
    }
    return next()
  })

  /** A tool call needs approval. Waterfall: pass `next()` through untouched. */
  ctx.on('approval/request', async (request, next) => {
    if (config.needsReply) {
      const agent = request?.agent
      if (agent === undefined || !config.topLevelOnly || isTopLevel(agent)) {
        playOnce(agent?.id, 'needs-reply', config)
      }
    }
    return next()
  })

  /** Failures outside a durable turn position. Deduped against `turn/end`. */
  ctx.on('agent/error', (payload) => {
    if (!config.failed) return
    const agent = payload?.agent
    if (!config.topLevelOnly || agent === undefined || isTopLevel(agent)) {
      playOnce(agent?.id, 'failed', config)
    }
  })

  registerPreviewRoute(ctx, config)
}

/**
 * Serve the bundled presets and a play trigger over HTTP.
 *
 * The settings page lives in the browser, but playback must happen on the
 * machine running the Harness (that is the whole point: the chime fires even
 * when the tab is in the background). So the page calls this route instead of
 * using `new Audio()`, which would only work while the page is focused.
 *
 * GET  /dsh-ding/preset/<id>.wav  → the audio bytes, for the browser's own
 *                                   fallback player
 * POST /dsh-ding/preview          → body {presetId?} or {soundPath?}; plays
 *                                   through the Host's player
 */
function registerPreviewRoute(ctx, config) {
  const web = ctx.get?.('webServer')
  if (!web || typeof web.register !== 'function') return

  const send = (res, status, body, headers = {}) => {
    res.writeHead(status, { 'content-type': 'text/plain; charset=utf-8', ...headers })
    res.end(body)
  }

  try {
    ctx.effect(() => web.register({
      kind: 'prefix',
      path: '/dsh-ding',
      async handler(req, res) {
        const url = new URL(req.url ?? '/', 'http://localhost')

        // Preview: play on the Host so a background tab still rings.
        if (url.pathname === '/dsh-ding/preview') {
          if (req.method !== 'POST') return send(res, 405, 'method not allowed')
          let payload = {}
          try {
            const chunks = []
            for await (const chunk of req) chunks.push(chunk)
            const raw = Buffer.concat(chunks).toString('utf8')
            payload = raw ? JSON.parse(raw) : {}
          } catch {
            return send(res, 400, 'invalid json')
          }
          const file = typeof payload.presetId === 'string'
            ? presetPath(payload.presetId)
            : (typeof payload.soundPath === 'string' && payload.soundPath ? payload.soundPath : undefined)
          if (file === undefined) return send(res, 400, 'unknown preset')
          const ok = play(config, { soundPath: file })
          return send(res, ok ? 200 : 500, ok ? 'ok' : 'playback failed')
        }

        // Audio bytes, so the page can also play locally as a fallback.
        const match = /^\/dsh-ding\/preset\/([a-z0-9-]+)\.wav$/.exec(url.pathname)
        if (match) {
          const file = presetPath(match[1])
          if (file === undefined || !existsSync(file)) return send(res, 404, 'not found')
          try {
            const bytes = readFileSync(file)
            res.writeHead(200, { 'content-type': 'audio/wav', 'content-length': bytes.length })
            res.end(bytes)
          } catch {
            send(res, 500, 'read failed')
          }
          return
        }

        send(res, 404, 'not found')
      },
    }), 'dsh-ding: preview route')
  } catch {
    // A route collision must not take the plugin down; the chimes still work.
  }
}

/** Test hooks; not part of the plugin contract. */
export const __test__ = {
  playing,
  getLastFailure: () => lastFailure,
  resetCaches() {
    ffplayCache = undefined
    lastPlayed.clear()
  },
  lastPlayed,
}
