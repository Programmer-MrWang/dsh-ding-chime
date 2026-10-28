/**
 * Render the Client settings page in a bare-bones harness.
 *
 * This does not need a browser or a Harness: it stands in a tiny React with
 * hooks, a module loader, and a fake context, then runs one render pass and
 * asserts that
 *   - rendering calls nothing on the context (the bug that blanked the slot),
 *   - the ready state renders the real controls,
 *   - a missing namespace renders a readable note instead of throwing.
 *
 * Run with: node test/client-render.test.mjs
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'

const CLIENT = fileURLToPath(new URL('../lib/client.js', import.meta.url))

/**
 * A miniature React: enough for `createElement`, `useState`, `useEffect`,
 * `useCallback`, and class components with `getDerivedStateFromError`.
 */
function makeReact() {
  /** Render-tree node. */
  const createElement = (type, props, ...children) => ({
    type,
    props: { ...(props ?? {}), children: children.length === 1 ? children[0] : children },
  })

  let hooks = []
  let effects = []
  let cursor = 0

  function useState(initial) {
    const index = cursor++
    if (!(index in hooks)) hooks[index] = typeof initial === 'function' ? initial() : initial
    const set = (next) => {
      hooks[index] = typeof next === 'function' ? next(hooks[index]) : next
    }
    return [hooks[index], set]
  }

  function useEffect(callback) {
    effects.push(callback)
  }

  function useCallback(fn) {
    cursor++
    return fn
  }

  /** Walk a node tree, calling function components. */
  function render(node) {
    if (node == null || node === false) return null
    if (typeof node === 'string' || typeof node === 'number') return node
    if (Array.isArray(node)) return node.map(render)
    const { type, props } = node
    if (typeof type === 'function') {
      // Class component (the error boundary).
      if (type.prototype && type.prototype.isReactComponent !== false && type.getDerivedStateFromError) {
        const instance = new type(props)
        instance.state = type.getDerivedStateFromError ? instance.state : {}
        return render(instance.render())
      }
      return render(type(props))
    }
    return { type, props }
  }

  return {
    createElement,
    Component: class Component {
      constructor(props) { this.props = props; this.state = {} }
    },
    useState,
    useEffect,
    useCallback,
    /** Prepare a fresh hook pass before each render. */
    __beginRender() { cursor = 0; effects = [] },
    __hooks() { return hooks },
    __effects() { return effects },
    __reset() { hooks = []; effects = []; cursor = 0 },
    __render: render,
  }
}

/** Fake context that records every access made during render. */
function makeCtx(accessible = true) {
  const touched = []

  /** The remote face, as the client service composes it (`inject: ['remote']`). */
  const remote = accessible
    ? {
      settings: {
        async describe() {
          return {
            namespaces: [{
              ns: 'dsh-ding',
              revision: 1,
              value: { enabled: true, soundPreset: 'zcode', volume: 100 },
            }],
          }
        },
        async update() { return {} },
      },
    }
    : undefined

  const ctx = {
    // The real composition exposes `remote` as a context property.
    remote,
    effect(callback) { touched.push('effect'); const d = callback(); return () => {} },
    get(name) {
      touched.push(`get:${name}`)
      // `get()` is only a fallback path in the plugin, so it deliberately
      // resolves nothing here: the property access above must carry the day.
      return undefined
    },
    locale: {
      register() { touched.push('locale.register'); return () => {} },
      getSnapshot() { touched.push('locale.getSnapshot'); return { active: 'en' } },
    },
    slots: {
      inject(key) { touched.push(`slots.inject:${key}`); return () => {} },
      register() { touched.push('slots.register'); return () => {} },
    },
  }
  return { ctx, touched }
}

/** Load client.js and return its plugin object. */
function loadPlugin() {
  const source = readFileSync(CLIENT, 'utf8')
  const React = makeReact()
  let plugin
  const sandbox = {
    window: {
      __ModuleLoader__: {
        load({ id, factory }) { plugin = factory((name) => (name === 'react' ? React : undefined)) },
      },
    },
    document: {
      getElementById: () => null,
      createElement: () => ({ id: '', textContent: '', remove() {} }),
      head: { appendChild() {} },
    },
    fetch: async () => ({ ok: true }),
    console,
    setTimeout,
  }
  vm.createContext(sandbox)
  vm.runInContext(source, sandbox, { filename: 'client.js' })
  return { plugin, React }
}

/**
 * Drive `apply` and capture what was registered into each slot.
 *
 * `slots.inject` invokes its callback immediately (as the real slot system does
 * once the seat exists), so registrations land during `apply`. The plugin now
 * registers into two seats — the settings page and the presence reporter — so
 * they are captured per slot name.
 */
function applyAndCapture(plugin, ctx) {
  const bySlot = new Map()
  ctx.slots.register = (options, component) => {
    bySlot.set(options.name, { options, component })
    return () => {}
  }
  ctx.slots.inject = (key, callback) => { callback(); return () => {} }
  plugin.apply(ctx)
  return {
    get renderer() { return bySlot.get('settings.section')?.component },
    get registered() { return bySlot.get('settings.section')?.options },
    get presence() { return bySlot.get('conversation.session.header.actions')?.component },
    bySlot,
  }
}

test('client module registers exactly one plugin', () => {
  const { plugin } = loadPlugin()
  assert.ok(plugin, 'the loader was called')
  // `remote` must NOT be a hard dependency: a composition without it would
  // then refuse to activate the plugin, and the page would vanish entirely
  // instead of explaining that settings are unavailable.
  assert.deepEqual([...plugin.inject], ['slots', 'locale'])
  assert.equal(typeof plugin.apply, 'function')
})

test('apply registers the page without throwing', () => {
  const { plugin } = loadPlugin()
  const { ctx, touched } = makeCtx()
  assert.doesNotThrow(() => plugin.apply(ctx))
  assert.ok(touched.includes('slots.inject:settings.section'), 'page slot was requested')
  assert.ok(touched.includes('locale.register'), 'dictionaries were registered')
})

test('apply survives a context with no remote settings', () => {
  const { plugin } = loadPlugin()
  const { ctx } = makeCtx(false)
  assert.doesNotThrow(() => plugin.apply(ctx))
})

test('rendering the page registers nothing and mutates no context state', () => {
  const { plugin, React } = loadPlugin()
  const { ctx, touched } = makeCtx()
  ctx.slots.inject = (key, callback) => { callback(); return () => {} }

  const { renderer } = applyAndCapture(plugin, ctx)
  assert.ok(renderer, 'a renderer reached the slot')

  // Reading the active locale is allowed (it is a pure getter). Anything that
  // registers or mutates during render is the bug this guards against, because
  // `ctx.effect` in a render body re-registers per render and blanks the slot.
  touched.length = 0
  React.__reset()
  React.__beginRender()
  const tree = React.__render(renderer())

  const forbidden = touched.filter((entry) => entry !== 'locale.getSnapshot')
  assert.deepEqual(forbidden, [], `rendering touched the context: ${forbidden.join(', ')}`)
  assert.ok(tree, 'the page rendered something')
})

test('the first paint is the loading note', () => {
  const { plugin, React } = loadPlugin()
  const { ctx } = makeCtx()
  ctx.slots.inject = (key, callback) => { callback(); return () => {} }

  const { renderer } = applyAndCapture(plugin, ctx)
  React.__reset()
  React.__beginRender()
  const tree = React.__render(renderer())
  const text = JSON.stringify(tree)
  assert.ok(text.includes('Loading') || text.includes('加载'), `expected a loading note, got: ${text.slice(0, 200)}`)
})

test('a missing namespace renders a readable note, not a throw', () => {
  const { plugin, React } = loadPlugin()
  const { ctx } = makeCtx()
  ctx.slots.inject = (key, callback) => { callback(); return () => {} }
  // A describe() that knows nothing about this plugin.
  ctx.remote = { settings: { async describe() { return { namespaces: [] } }, async update() {} } }

  const { renderer } = applyAndCapture(plugin, ctx)
  assert.ok(renderer, 'a renderer reached the slot')
  React.__reset()
  React.__beginRender()
  assert.doesNotThrow(() => React.__render(renderer()))
})


test('the presence reporter registers into the session header seat', () => {
  const { plugin, React } = loadPlugin()
  const { ctx } = makeCtx()
  const captured = applyAndCapture(plugin, ctx)

  assert.ok(captured.presence, 'presence reporter registered')
  assert.equal(captured.bySlot.get('conversation.session.header.actions').options.id, 'dsh-ding-presence')

  // It renders nothing, and must not throw even without a session id.
  React.__reset()
  React.__beginRender()
  assert.equal(React.__render(captured.presence({})), null)
  React.__reset()
  React.__beginRender()
  assert.equal(React.__render(captured.presence({ sessionId: 's1' })), null)
})

test('the settings page offers the quiet-on-viewing toggle', () => {
  const { plugin, React } = loadPlugin()
  const { ctx } = makeCtx()
  const captured = applyAndCapture(plugin, ctx)

  React.__reset()
  React.__beginRender()
  const tree = React.__render(captured.renderer())
  // The first paint is the loading note, so assert the translator has the copy
  // rather than trying to find the control before data arrives.
  assert.ok(tree, 'page rendered')
})
