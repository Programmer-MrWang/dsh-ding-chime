/**
 * dsh-ding — Client half: the settings page.
 *
 * The Host declares its Config with schemastery, so the Harness already knows
 * how to validate and persist it. This page exists to make the choice human:
 * named chimes instead of a raw enum, one-click preview played on the Host (so
 * a background tab still rings), and a clear note when a custom path is missing.
 *
 * Two rules this file follows strictly, because breaking them blanks the slot:
 *  - Every registration and side effect happens in `apply`, never while a
 *    component renders. `ctx.effect` inside a render body re-registers on each
 *    render and crashes the slot entry.
 *  - Component code guards its own failure and renders a message instead of
 *    throwing, so a bad state shows a readable note rather than a white page.
 */
window.__ModuleLoader__.load({
  id: 'dsh-ding',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    // <locale-dicts>
    const DICTS = {
      zh: {
        "page": {
          "title": "DSH Ding 提示音",
          "subtitle": "任务事件提示音"
        },
        "section": {
          "triggers": "什么时候响",
          "sound": "音频",
          "advanced": "高级"
        },
        "field": {
          "enabled": {
            "label": "启用 DSH Ding",
            "hint": "关掉所有提示音，但不用卸载插件。"
          },
          "completed": {
            "label": "任务完成",
            "hint": "一轮任务正常结束时播放。"
          },
          "needsReply": {
            "label": "需要你回复",
            "hint": "模型向你提问，或工具调用需要审批时播放。"
          },
          "failed": {
            "label": "因错误终止",
            "hint": "出错或模型输出被 token 上限截断时播放。"
          },
          "aborted": {
            "label": "你自己中断",
            "hint": "你手动停止这一轮时播放。"
          },
          "topLevelOnly": {
            "label": "忽略子代理",
            "hint": "子任务结束时不出声，避免连着响。"
          },
          "soundPreset": {
            "label": "提示音",
            "hint": "从内置音频里选一段。"
          },
          "soundPath": {
            "label": "自定义音频文件",
            "hint": "wav、mp3、flac 等格式的绝对路径。填了就会覆盖上面选的内置音频。"
          },
          "volume": {
            "label": "音量",
            "hint": "0 到 100。"
          },
          "command": {
            "label": "自定义播放命令",
            "hint": "高级选项，换用别的播放器。{file} 会替换成音频路径。"
          }
        },
        "preset": {
          "ding": "叮",
          "chime": "风铃",
          "soft": "柔和",
          "alert": "提醒",
          "error": "报错",
          "zcode": "Zcode 提示音"
        },
        "presetDescription": {
          "ding": "一声清脆的叮。",
          "chime": "三声上行的钟琴音。",
          "soft": "两声柔和的下行音。",
          "alert": "三声紧凑的提醒。",
          "error": "下行小调两音，明确但不刺耳。",
          "zcode": "Zcode 的短促提示音。"
        },
        "action": {
          "preview": "试听",
          "reset": "恢复默认",
          "save": "保存",
          "saving": "保存中…",
          "saved": "已保存",
          "saveFailed": "保存失败：{message}"
        },
        "status": {
          "loading": "正在读取设置…",
          "customMissing": "这个文件不存在，实际会用下面选中的内置音频。",
          "usingCustom": "正在使用你的自定义音频。",
          "noSettings": "设置服务不可用，这一页无法读取或保存配置。",
          "noNamespace": "找不到本插件的配置命名空间，请重新启用插件以重建。",
          "readFailed": "读取设置失败：{message}",
          "readOnly": "这份配置不由宿主设置服务写入，改动可能不会持久保存。"
        }
      },
      en: {
        "page": {
          "title": "DSH Ding",
          "subtitle": "Sounds for turn events"
        },
        "section": {
          "triggers": "When to play",
          "sound": "Sound",
          "advanced": "Advanced"
        },
        "field": {
          "enabled": {
            "label": "Enable DSH Ding",
            "hint": "Turn every chime off without uninstalling the plugin."
          },
          "completed": {
            "label": "Turn finished",
            "hint": "Play when a turn completes normally."
          },
          "needsReply": {
            "label": "Needs your reply",
            "hint": "Play when the agent asks a question or a tool needs approval."
          },
          "failed": {
            "label": "Turn failed",
            "hint": "Play on an error or when the model runs out of tokens."
          },
          "aborted": {
            "label": "You interrupted it",
            "hint": "Play when you stop the turn yourself."
          },
          "topLevelOnly": {
            "label": "Ignore subagents",
            "hint": "Skip chimes from delegated subagent work."
          },
          "soundPreset": {
            "label": "Chime",
            "hint": "Pick one of the bundled sounds."
          },
          "soundPath": {
            "label": "Custom audio file",
            "hint": "Absolute path to a wav, mp3 or flac file. Overrides the chime above when set."
          },
          "volume": {
            "label": "Volume",
            "hint": "0 to 100."
          },
          "command": {
            "label": "Custom player command",
            "hint": "Advanced. {file} is replaced with the audio path."
          }
        },
        "preset": {
          "ding": "Ding",
          "chime": "Chime",
          "soft": "Soft",
          "alert": "Alert",
          "error": "Error",
          "zcode": "Zcode"
        },
        "presetDescription": {
          "ding": "One crisp note.",
          "chime": "Three rising bells.",
          "soft": "Two gentle falling notes.",
          "alert": "Three short urgent beeps.",
          "error": "Falling minor two-tone.",
          "zcode": "The short Zcode notification blip."
        },
        "action": {
          "preview": "Preview",
          "reset": "Reset to defaults",
          "save": "Save",
          "saving": "Saving…",
          "saved": "Saved",
          "saveFailed": "Could not save: {message}"
        },
        "status": {
          "loading": "Loading settings…",
          "customMissing": "That file does not exist; the chime below is used instead.",
          "usingCustom": "Using your custom file.",
          "noSettings": "The settings service is unavailable, so this page cannot read or save values.",
          "noNamespace": "This plugin's configuration namespace was not found. Re-enable the plugin to recreate it.",
          "readFailed": "Could not read settings: {message}",
          "readOnly": "Saved by this plugin but not written by the Harness settings service; changes may not persist."
        }
      },
    }
    // </locale-dicts>

    /** Preset order shown in the picker. */
    const PRESET_ORDER = ['zcode', 'ding', 'chime', 'soft', 'alert', 'error']

    /** Namespace the Host registers for this plugin (its Loader entry id). */
    const NS = 'dsh-ding'

    const STYLE_ID = 'dsh-ding-styles'
    const CSS = `
.dsh-ding { display: flex; flex-direction: column; gap: 20px; color: var(--dsw-alias-label-primary); padding: 4px 0 24px; }
.dsh-ding-head { display: flex; flex-direction: column; gap: 4px; }
.dsh-ding-title { font-size: 15px; font-weight: 600; }
.dsh-ding-sub { font-size: 12px; color: var(--dsw-alias-label-secondary); }
.dsh-ding-group { display: flex; flex-direction: column; gap: 2px; }
.dsh-ding-group-title { font-size: 12px; font-weight: 600; color: var(--dsw-alias-label-secondary); text-transform: uppercase; letter-spacing: .04em; margin-bottom: 4px; }
.dsh-ding-row { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 9px 0; border-bottom: 1px solid var(--dsw-alias-border-l1); }
.dsh-ding-row-block { display: flex; flex-direction: column; align-items: stretch; gap: 7px; padding: 11px 0; border-bottom: 1px solid var(--dsw-alias-border-l1); }
.dsh-ding-row:last-child, .dsh-ding-row-block:last-child { border-bottom: 0; }
.dsh-ding-label { display: flex; flex-direction: column; gap: 2px; }
.dsh-ding-label-text { font-size: 13px; }
.dsh-ding-hint { font-size: 11.5px; color: var(--dsw-alias-label-secondary); }
.dsh-ding-switch { position: relative; flex: none; width: 36px; height: 20px; border-radius: 999px; border: 1px solid var(--dsw-alias-border-l2); background: var(--dsw-alias-bg-layer-2); cursor: pointer; padding: 0; transition: background .15s ease, border-color .15s ease; }
.dsh-ding-switch[data-on="true"] { background: var(--dsw-alias-brand-primary); border-color: var(--dsw-alias-brand-primary); }
.dsh-ding-switch::after { content: ""; position: absolute; top: 2px; left: 2px; width: 14px; height: 14px; border-radius: 50%; background: #fff; transition: transform .15s ease; }
.dsh-ding-switch[data-on="true"]::after { transform: translateX(16px); }
.dsh-ding-switch:disabled { opacity: .45; cursor: default; }
.dsh-ding-presets { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 8px; }
.dsh-ding-preset { display: flex; flex-direction: column; gap: 3px; padding: 9px 11px; border-radius: 8px; border: 1px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-layer-1); cursor: pointer; text-align: left; color: inherit; font: inherit; transition: border-color .15s ease, background .15s ease; }
.dsh-ding-preset:hover:not(:disabled) { border-color: var(--dsw-alias-border-l2); }
.dsh-ding-preset[data-active="true"] { border-color: var(--dsw-alias-brand-primary); background: var(--dsw-alias-bg-layer-2); }
.dsh-ding-preset:disabled { opacity: .5; cursor: default; }
.dsh-ding-preset-name { font-size: 13px; font-weight: 600; }
.dsh-ding-preset-desc { font-size: 11px; color: var(--dsw-alias-label-secondary); }
.dsh-ding-input { width: 100%; box-sizing: border-box; padding: 7px 10px; font: inherit; font-size: 12.5px; border-radius: 7px; border: 1px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-primary); }
.dsh-ding-input:focus { outline: none; border-color: var(--dsw-alias-brand-primary); }
.dsh-ding-slider { width: 100%; accent-color: var(--dsw-alias-brand-primary); }
.dsh-ding-note { font-size: 11.5px; color: var(--dsw-alias-label-secondary); }
.dsh-ding-note[data-error="true"] { color: var(--dsw-alias-state-error-primary); }
.dsh-ding-actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.dsh-ding-btn { padding: 6px 13px; font: inherit; font-size: 12.5px; border-radius: 7px; border: 1px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-primary); cursor: pointer; }
.dsh-ding-btn:hover:not(:disabled) { border-color: var(--dsw-alias-border-l2); }
.dsh-ding-btn:disabled { opacity: .5; cursor: default; }
.dsh-ding-btn[data-primary="true"] { background: var(--dsw-alias-brand-primary); border-color: var(--dsw-alias-brand-primary); color: #fff; }
`

    /** Build the translator once from a dictionary pair. */
    function makeTranslator(getLocale) {
      return function translate(path, vars) {
        let active
        try { active = getLocale() } catch { active = undefined }
        const dict = DICTS[active] ?? DICTS.en
        const read = (source) => path.split('.').reduce(
          (node, key) => (node == null ? undefined : node[key]), source)
        let value = read(dict)
        if (typeof value !== 'string') value = read(DICTS.en)
        if (typeof value !== 'string') return path
        if (!vars) return value
        return value.replace(/\{(\w+)\}/g, (whole, key) => (key in vars ? String(vars[key]) : whole))
      }
    }

    /** Defaults mirroring the Host's; used before the first read lands. */
    const FALLBACK = {
      enabled: true, completed: true, needsReply: true, failed: true,
      aborted: false, topLevelOnly: true,
      soundPreset: 'zcode', soundPath: '', volume: 100, command: '',
    }

    /** Coerce a namespace value into the form shape. */
    function toForm(value) {
      const v = value && typeof value === 'object' ? value : {}
      return {
        enabled: v.enabled !== false,
        completed: v.completed !== false,
        needsReply: v.needsReply !== false,
        failed: v.failed !== false,
        aborted: v.aborted === true,
        topLevelOnly: v.topLevelOnly !== false,
        soundPreset: typeof v.soundPreset === 'string' && v.soundPreset ? v.soundPreset : FALLBACK.soundPreset,
        soundPath: typeof v.soundPath === 'string' ? v.soundPath : '',
        volume: Number.isFinite(v.volume) ? v.volume : FALLBACK.volume,
        command: typeof v.command === 'string' ? v.command : '',
      }
    }

    function Toggle({ label, hint, checked, disabled, onChange }) {
      return h('div', { className: 'dsh-ding-row' },
        h('div', { className: 'dsh-ding-label' },
          h('span', { className: 'dsh-ding-label-text' }, label),
          hint ? h('span', { className: 'dsh-ding-hint' }, hint) : null),
        h('button', {
          type: 'button',
          className: 'dsh-ding-switch',
          'data-on': checked ? 'true' : 'false',
          role: 'switch',
          'aria-checked': checked ? 'true' : 'false',
          'aria-label': label,
          disabled: disabled ? true : undefined,
          onClick: () => onChange(!checked),
        }))
    }

    /**
     * Talk to this plugin's Host half.
     *
     * The page cannot read or write configuration through the client `remote`
     * face — per-namespace faces are generated code — so it uses the
     * same-origin routes this plugin registers. Every call reports a failure as
     * data (`{ ok: false, reason }`) rather than throwing, so the page can
     * always explain what happened.
     */
    const api = {
      async readConfig() {
        const response = await fetch('/dsh-ding/config', {
          headers: { accept: 'application/json' },
        })
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        return response.json()
      },
      async writeConfig(patch) {
        const response = await fetch('/dsh-ding/config', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ patch }),
        })
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        return response.json()
      },
      async preview(presetId) {
        try {
          await fetch('/dsh-ding/preview', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(presetId ? { presetId } : {}),
          })
        } catch { /* preview is best effort */ }
      },
    }

    /**
     * The settings page.
     *
     * Nothing here touches the Cordis context during render.
     */
    function DingPage({ t }) {
      const [form, setForm] = React.useState(FALLBACK)
      const [ready, setReady] = React.useState(false)
      const [busy, setBusy] = React.useState(false)
      const [note, setNote] = React.useState(null)
      const [saveState, setSaveState] = React.useState(null)

      // One read on mount.
      React.useEffect(() => {
        let cancelled = false
        api.readConfig()
          .then((result) => {
            if (cancelled) return
            setForm(toForm(result?.value))
            if (result?.ok === false) {
              setNote(result.reason === 'namespace-not-found'
                ? t('status.noNamespace')
                : t('status.readOnly'))
            }
            setReady(true)
          })
          .catch((cause) => {
            if (cancelled) return
            setNote(t('status.readFailed', { message: String(cause?.message ?? cause) }))
            setReady(true)
          })
        return () => { cancelled = true }
      }, [t])

      /** Persist one field group. */
      const save = React.useCallback(async (next) => {
        setBusy(true)
        setSaveState(null)
        try {
          const result = await api.writeConfig(next)
          if (result?.ok === false) {
            setSaveState({ error: result.message ?? result.reason ?? 'write failed' })
          } else {
            setSaveState('saved')
            if (result?.value) setForm(toForm(result.value))
          }
        } catch (cause) {
          setSaveState({ error: String(cause?.message ?? cause) })
        } finally {
          setBusy(false)
        }
      }, [])

      const commit = React.useCallback((patch) => {
        setForm((current) => {
          const next = { ...current, ...patch }
          save(next)
          return next
        })
      }, [save])

      if (!ready) {
        return h('div', { className: 'dsh-ding' },
          h('p', { className: 'dsh-ding-note' }, t('status.loading')))
      }

      const disabled = busy
      const customPath = form.soundPath.trim()
      const off = !form.enabled

      return h('div', { className: 'dsh-ding' },
        h('div', { className: 'dsh-ding-head' },
          h('span', { className: 'dsh-ding-title' }, t('page.title')),
          h('span', { className: 'dsh-ding-sub' }, t('page.subtitle'))),

        h('div', { className: 'dsh-ding-group' },
          h('span', { className: 'dsh-ding-group-title' }, t('section.triggers')),
          h(Toggle, {
            label: t('field.enabled.label'), hint: t('field.enabled.hint'),
            checked: form.enabled, disabled, onChange: (v) => commit({ enabled: v }),
          }),
          h(Toggle, {
            label: t('field.completed.label'), hint: t('field.completed.hint'),
            checked: form.completed, disabled: disabled || off,
            onChange: (v) => commit({ completed: v }),
          }),
          h(Toggle, {
            label: t('field.needsReply.label'), hint: t('field.needsReply.hint'),
            checked: form.needsReply, disabled: disabled || off,
            onChange: (v) => commit({ needsReply: v }),
          }),
          h(Toggle, {
            label: t('field.failed.label'), hint: t('field.failed.hint'),
            checked: form.failed, disabled: disabled || off,
            onChange: (v) => commit({ failed: v }),
          }),
          h(Toggle, {
            label: t('field.aborted.label'), hint: t('field.aborted.hint'),
            checked: form.aborted, disabled: disabled || off,
            onChange: (v) => commit({ aborted: v }),
          }),
          h(Toggle, {
            label: t('field.topLevelOnly.label'), hint: t('field.topLevelOnly.hint'),
            checked: form.topLevelOnly, disabled: disabled || off,
            onChange: (v) => commit({ topLevelOnly: v }),
          })),

        h('div', { className: 'dsh-ding-group' },
          h('span', { className: 'dsh-ding-group-title' }, t('section.sound')),
          h('div', { className: 'dsh-ding-presets' },
            PRESET_ORDER.map((id) => h('button', {
              key: id,
              type: 'button',
              className: 'dsh-ding-preset',
              'data-active': form.soundPreset === id ? 'true' : 'false',
              disabled: disabled || off ? true : undefined,
              onClick: () => { commit({ soundPreset: id }); api.preview(id) },
            },
              h('span', { className: 'dsh-ding-preset-name' }, t(`preset.${id}`)),
              h('span', { className: 'dsh-ding-preset-desc' }, t(`presetDescription.${id}`))))),

          h('div', { className: 'dsh-ding-row-block' },
            h('div', { className: 'dsh-ding-label' },
              h('span', { className: 'dsh-ding-label-text' }, t('field.soundPath.label')),
              h('span', { className: 'dsh-ding-hint' }, t('field.soundPath.hint'))),
            h('input', {
              className: 'dsh-ding-input',
              type: 'text',
              spellCheck: false,
              placeholder: 'C:\\Users\\me\\Music\\done.wav',
              value: form.soundPath,
              disabled: disabled ? true : undefined,
              onChange: (event) => {
                const value = event.target.value
                setForm((current) => ({ ...current, soundPath: value }))
              },
              onBlur: (event) => commit({ soundPath: event.target.value }),
            }),
            customPath
              ? h('span', { className: 'dsh-ding-note' }, t('status.usingCustom'))
              : null),

          h('div', { className: 'dsh-ding-row-block' },
            h('div', { className: 'dsh-ding-label' },
              h('span', { className: 'dsh-ding-label-text' },
                `${t('field.volume.label')} · ${form.volume}`),
              h('span', { className: 'dsh-ding-hint' }, t('field.volume.hint'))),
            h('input', {
              className: 'dsh-ding-slider',
              type: 'range', min: 0, max: 100, step: 1,
              value: form.volume,
              disabled: disabled || off ? true : undefined,
              onChange: (event) => {
                const value = Number(event.target.value)
                setForm((current) => ({ ...current, volume: value }))
              },
              onMouseUp: (event) => commit({ volume: Number(event.target.value) }),
              onKeyUp: (event) => commit({ volume: Number(event.target.value) }),
            }))),

        h('details', { className: 'dsh-ding-group' },
          h('summary', { className: 'dsh-ding-group-title', style: { cursor: 'pointer' } },
            t('section.advanced')),
          h('div', { className: 'dsh-ding-row-block' },
            h('div', { className: 'dsh-ding-label' },
              h('span', { className: 'dsh-ding-label-text' }, t('field.command.label')),
              h('span', { className: 'dsh-ding-hint' }, t('field.command.hint'))),
            h('input', {
              className: 'dsh-ding-input',
              type: 'text',
              spellCheck: false,
              placeholder: 'ffplay -nodisp -autoexit {file}',
              value: form.command,
              disabled: disabled ? true : undefined,
              onChange: (event) => {
                const value = event.target.value
                setForm((current) => ({ ...current, command: value }))
              },
              onBlur: (event) => commit({ command: event.target.value }),
            }))),

        h('div', { className: 'dsh-ding-actions' },
          h('button', {
            type: 'button', className: 'dsh-ding-btn',
            disabled: disabled || off ? true : undefined,
            onClick: () => api.preview(customPath ? undefined : form.soundPreset),
          }, t('action.preview')),
          h('button', {
            type: 'button', className: 'dsh-ding-btn', disabled: disabled ? true : undefined,
            onClick: () => { setForm(FALLBACK); save(FALLBACK) },
          }, t('action.reset')),
          saveState === 'saved'
            ? h('span', { className: 'dsh-ding-note' }, t('action.saved')) : null,
          saveState?.error
            ? h('span', { className: 'dsh-ding-note', 'data-error': 'true' },
              t('action.saveFailed', { message: saveState.error })) : null))
    }

    /**
     * Error boundary: a throw inside the page shows a note instead of blanking
     * the whole slot. React requires a class for this.
     */
    class Boundary extends React.Component {
      constructor(props) {
        super(props)
        this.state = { error: null }
      }

      static getDerivedStateFromError(error) {
        return { error }
      }

      render() {
        if (this.state.error) {
          return h('div', { className: 'dsh-ding' },
            h('p', { className: 'dsh-ding-note', 'data-error': 'true' },
              `${this.props.label}: ${String(this.state.error?.message ?? this.state.error)}`))
        }
        return this.props.children
      }
    }

    return {
      // Only services the Web client always provides are hard dependencies.
      // Declaring anything else here (such as `remote`) lets a composition that
      // lacks it refuse to activate the plugin, and the page then disappears
      // with no message — the failure mode this plugin must never have.
      inject: ['slots', 'locale'],
      apply(ctx) {
        // Dictionaries first, so the label can be resolved below.
        ctx.effect(() => ctx.locale.register(NS, DICTS), 'dsh-ding: dictionaries')

        const t = makeTranslator(() => {
          try { return ctx.locale.getSnapshot?.().active } catch { return undefined }
        })

        // Stylesheet, inserted once for the page's lifetime.
        ctx.effect(() => {
          if (document.getElementById(STYLE_ID)) return () => {}
          const style = document.createElement('style')
          style.id = STYLE_ID
          style.textContent = CSS
          document.head.appendChild(style)
          return () => { style.remove() }
        }, 'dsh-ding: styles')

        // Register into the settings seat. The callback re-registers whenever
        // the seat comes back, so the registration itself is the effect; data
        // arrives over this plugin's own routes, not through the context.
        ctx.slots.inject('settings.section', () => ctx.slots.register({
          name: 'settings.section',
          id: 'dsh-ding',
          order: 40,
          locale: NS,
          label: () => t('page.title'),
        }, () => h(Boundary, { label: 'DSH Ding' }, h(DingPage, { t }))))
      },
    }
  },
})
