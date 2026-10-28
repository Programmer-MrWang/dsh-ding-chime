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

export const name = 'dsh-ding-chime'
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
 * Declaring a schemastery Config is what lets the Plugins page render a
 * generated form for this row and validate the stored `config`. The library is
 * a real dependency (not a peer) so the package loads for a user who only ran
 * `npm install`; if it were ever absent the plugin still activates, just with
 * the generated form unavailable.
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

  // Routes are registered before the master switch is consulted: the settings
  // page must stay reachable to turn the plugin back on.
  registerRoutes(ctx, config)

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
}

/**
 * Serve the settings page's data and the bundled presets over HTTP.
 *
 * Why HTTP rather than a generated Remote namespace: the browser half must be
 * plain JavaScript that runs on any Harness version, and the client-side
 * `remote` face does not expose `settings` directly (`ClientRemote` carries
 * only `$stream` and `$host`; per-namespace faces are generated code). A
 * same-origin route is version-independent and reaches the Host, which is the
 * only side that can both play audio and write configuration.
 *
 * GET  /dsh-ding/config           → { value, revision, writable }
 * POST /dsh-ding/config           → body { patch }; merges into the stored config
 * GET  /dsh-ding/preset/<id>.wav  → the audio bytes
 * POST /dsh-ding/preview          → body { presetId? } or { soundPath? }; plays
 */
function registerRoutes(ctx, config) {
  const web = ctx.get?.('webServer')
  if (!web || typeof web.register !== 'function') return

  const NS = 'dsh-ding'

  const send = (res, status, body, headers = {}) => {
    res.writeHead(status, { 'content-type': 'text/plain; charset=utf-8', ...headers })
    res.end(body)
  }

  const sendJson = (res, status, value) => {
    const body = JSON.stringify(value)
    res.writeHead(status, {
      'content-type': 'application/json; charset=utf-8',
      'content-length': Buffer.byteLength(body),
      'cache-control': 'no-store',
    })
    res.end(body)
  }

  /** Read the body as JSON, with a size guard. */
  const readJson = async (req) => {
    const chunks = []
    let total = 0
    for await (const chunk of req) {
      total += chunk.length
      if (total > 64 * 1024) throw new Error('payload too large')
      chunks.push(chunk)
    }
    const raw = Buffer.concat(chunks).toString('utf8')
    return raw ? JSON.parse(raw) : {}
  }

  /**
   * Find this plugin's row in the Loader.
   *
   * `configEditor.entries()` is the authoritative list of addressable rows; the
   * `dsh-ding` row is located by id or package name.
   */
  const findEditorEntry = (editor) => {
    if (!editor || typeof editor.entries !== 'function') return undefined
    const entries = editor.entries() ?? []
    return entries.find((entry) => {
      const id = String(entry?.options?.id ?? entry?.id ?? '')
      const name = String(entry?.options?.name ?? entry?.name ?? '')
      return id === NS || id.endsWith(':dsh-ding') || name === NS
    })
  }

  /**
   * The live config the Loader resolved for this row, if it can be read.
   *
   * The `config` argument handed to `apply` is the resolved value, which is
   * already the best answer; this exists to notice a row that carries its own
   * `config` object (for example an edited profile patch).
   */
  const readRowConfig = () => {
    try {
      const editor = ctx.get?.('configEditor')
      if (!editor || typeof editor.configuration !== 'function') return undefined
      const rows = editor.configuration() ?? []
      const mine = rows.find((row) => {
        const id = String(row?.entry?.options?.id ?? row?.entry?.id ?? '')
        return id === NS || id.endsWith(':dsh-ding')
      })
      const override = mine?.override
      if (!override || typeof override !== 'object') return undefined
      return override
    } catch {
      return undefined
    }
  }

  /** Whether this deployment can persist a configuration change. */
  const canWrite = () => {
    try {
      const editor = ctx.get?.('configEditor')
      return Boolean(editor && typeof editor.edit === 'function')
    } catch {
      return false
    }
  }

  try {
    ctx.effect(() => web.register({
      kind: 'prefix',
      path: '/dsh-ding',
      async handler(req, res) {
        const url = new URL(req.url ?? '/', 'http://localhost')

        // ---- configuration read ----
        if (url.pathname === '/dsh-ding/config' && req.method === 'GET') {
          // Preferred: the row the plugin actually runs with. The `config` slot
          // object the Loader passes to `apply` is the authoritative live value,
          // and it needs no extra service.
          const fromRow = readRowConfig()
          return sendJson(res, 200, {
            ok: true,
            value: normalize(fromRow ?? config),
            writable: canWrite(),
            source: fromRow === undefined ? 'live' : 'row',
          })
        }

        // ---- configuration write ----
        if (url.pathname === '/dsh-ding/config' && req.method === 'POST') {
          let payload
          try {
            payload = await readJson(req)
          } catch (error) {
            return sendJson(res, 400, { ok: false, message: String(error?.message ?? error) })
          }
          const patch = payload?.patch
          if (!patch || typeof patch !== 'object') {
            return sendJson(res, 400, { ok: false, message: 'patch must be an object' })
          }
          const editor = ctx.get?.('configEditor')
          if (!editor || typeof editor.edit !== 'function') {
            // No persistence available: keep the value for this process so the
            // page still behaves, and say plainly that it will not survive.
            Object.assign(config, normalize({ ...config, ...patch }))
            return sendJson(res, 200, {
              ok: false,
              reason: 'no-config-editor',
              value: normalize(config),
            })
          }
          try {
            const entry = findEditorEntry(editor)
            if (!entry) {
              return sendJson(res, 200, { ok: false, reason: 'entry-not-found', value: normalize(config) })
            }
            await editor.edit(entry, (current) => ({ ...(current ?? {}), ...patch }))
            Object.assign(config, normalize({ ...config, ...patch }))
            return sendJson(res, 200, { ok: true, value: normalize(config) })
          } catch (error) {
            return sendJson(res, 200, {
              ok: false,
              reason: 'write-failed',
              message: String(error?.message ?? error),
              value: normalize(config),
            })
          }
        }

        // ---- preview: play on the Host so a background tab still rings ----
        if (url.pathname === '/dsh-ding/preview') {
          if (req.method !== 'POST') return send(res, 405, 'method not allowed')
          let payload = {}
          try {
            payload = await readJson(req)
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

        // ---- audio bytes, for the browser's own player ----
        const match = /^\/dsh-ding\/preset\/([a-z0-9-]+)\.wav$/.exec(url.pathname)
        if (match) {
          const file = presetPath(match[1])
          if (file === undefined || !existsSync(file)) return send(res, 404, 'not found')
          try {
            const bytes = readFileSync(file)
            res.writeHead(200, {
              'content-type': 'audio/wav',
              'content-length': bytes.length,
              'cache-control': 'public, max-age=86400',
            })
            res.end(bytes)
          } catch {
            send(res, 500, 'read failed')
          }
          return
        }

        send(res, 404, 'not found')
      },
    }), 'dsh-ding: routes')
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
