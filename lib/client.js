/**
 * dsh-ding — Client half: the settings page.
 *
 * The Host declares its Config with schemastery, so the Harness already has a
 * generated form for it. This page exists to make the choice human: named
 * chimes instead of a hardcoded enum, one-click preview through the Host's
 * own player, and a clear fallback note when a custom path is missing.
 *
 * Everything reads and writes through `ctx.remote.settings`, the same public
 * namespace the shipped settings pages use, so values land in the profile's
 * `cordis.patch.yml` and survive upgrades.
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
          "usingCustom": "正在使用你的自定义音频。"
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
          "usingCustom": "Using your custom file."
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
.dsh-ding { display: flex; flex-direction: column; gap: 20px; color: var(--dsw-alias-label-primary); }
.dsh-ding-head { display: flex; flex-direction: column; gap: 4px; }
.dsh-ding-title { font-size: 15px; font-weight: 600; }
.dsh-ding-sub { font-size: 12px; color: var(--dsw-alias-label-secondary); }
.dsh-ding-group { display: flex; flex-direction: column; gap: 10px; }
.dsh-ding-group-title { font-size: 12px; font-weight: 600; color: var(--dsw-alias-label-secondary); text-transform: uppercase; letter-spacing: .04em; }
.dsh-ding-row { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 8px 0; border-bottom: 1px solid var(--dsw-alias-border-l1); }
.dsh-ding-row:last-child { border-bottom: 0; }
.dsh-ding-label { display: flex; flex-direction: column; gap: 2px; }
.dsh-ding-label-text { font-size: 13px; }
.dsh-ding-hint { font-size: 11.5px; color: var(--dsw-alias-label-secondary); }
.dsh-ding-switch { position: relative; flex: none; width: 36px; height: 20px; border-radius: 999px; border: 1px solid var(--dsw-alias-border-l2); background: var(--dsw-alias-bg-layer-2); cursor: pointer; transition: background .15s ease, border-color .15s ease; }
.dsh-ding-switch[data-on="true"] { background: var(--dsw-alias-brand-primary); border-color: var(--dsw-alias-brand-primary); }
.dsh-ding-switch::after { content: ""; position: absolute; top: 2px; left: 2px; width: 14px; height: 14px; border-radius: 50%; background: #fff; transition: transform .15s ease; }
.dsh-ding-switch[data-on="true"]::after { transform: translateX(16px); }
.dsh-ding-switch:disabled { opacity: .5; cursor: default; }
.dsh-ding-presets { display: grid; grid-template-columns: repeat(auto-fill, minmax(148px, 1fr)); gap: 8px; }
.dsh-ding-preset { display: flex; flex-direction: column; gap: 3px; padding: 9px 11px; border-radius: 8px; border: 1px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-layer-1); cursor: pointer; text-align: left; color: inherit; font: inherit; transition: border-color .15s ease, background .15s ease; }
.dsh-ding-preset:hover { border-color: var(--dsw-alias-border-l2); }
.dsh-ding-preset[data-active="true"] { border-color: var(--dsw-alias-brand-primary); background: var(--dsw-alias-bg-layer-2); }
.dsh-ding-preset-name { font-size: 13px; font-weight: 600; }
.dsh-ding-preset-desc { font-size: 11px; color: var(--dsw-alias-label-secondary); }
.dsh-ding-input { width: 100%; box-sizing: border-box; padding: 7px 10px; font: inherit; font-size: 12.5px; border-radius: 7px; border: 1px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-primary); }
.dsh-ding-input:focus { outline: none; border-color: var(--dsw-alias-brand-primary); }
.dsh-ding-slider { width: 100%; accent-color: var(--dsw-alias-brand-primary); }
.dsh-ding-note { font-size: 11.5px; color: var(--dsw-alias-state-warn-primary); }
.dsh-ding-note[data-tone="ok"] { color: var(--dsw-alias-label-secondary); }
.dsh-ding-actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.dsh-ding-btn { padding: 6px 13px; font: inherit; font-size: 12.5px; border-radius: 7px; border: 1px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-primary); cursor: pointer; }
.dsh-ding-btn:hover:not(:disabled) { border-color: var(--dsw-alias-border-l2); }
.dsh-ding-btn:disabled { opacity: .5; cursor: default; }
.dsh-ding-btn[data-primary="true"] { background: var(--dsw-alias-brand-primary); border-color: var(--dsw-alias-brand-primary); color: #fff; }
.dsh-ding-btn[data-primary="true"]:hover:not(:disabled) { border-color: var(--dsw-alias-brand-primary); }
.dsh-ding-save-state { font-size: 12px; color: var(--dsw-alias-label-secondary); }
.dsh-ding-save-state[data-error="true"] { color: var(--dsw-alias-state-error-primary); }
`

    /** Insert the stylesheet once per page load, cleaned up with the run. */
    function useStyles(ctx) {
      ctx.effect(() => {
        if (document.getElementById(STYLE_ID)) return () => {}
        const style = document.createElement('style')
        style.id = STYLE_ID
        style.textContent = CSS
        document.head.appendChild(style)
        return () => { style.remove() }
      }, 'dsh-ding: styles')
    }

    /** A toggle that matches the host's row pattern. */
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
          'aria-checked': checked,
          'aria-label': label,
          disabled,
          onClick: () => onChange(!checked),
        }))
    }

    /** The settings page proper. */
    function DingPage(props) {
      const { t, ctx } = props
      const [form, setForm] = React.useState(null)
      const [loadError, setLoadError] = React.useState(null)
      const [saveState, setSaveState] = React.useState(null)
      const [busy, setBusy] = React.useState(false)
      const [previewing, setPreviewing] = React.useState(false)

      const remote = ctx.get('remote')
      const settings = remote?.settings

      /** Read this plugin's namespace once. */
      const load = React.useCallback(async () => {
        if (!settings?.describe) {
          setLoadError(t('action.saveFailed', { message: 'settings unavailable' }))
          return
        }
        try {
          const described = await settings.describe()
          const entry = (described?.namespaces ?? []).find((row) => row.ns === NS)
          if (!entry) {
            setLoadError(t('action.saveFailed', { message: `namespace ${NS} not found` }))
            return
          }
          const value = entry.value ?? {}
          setForm({
            enabled: value.enabled !== false,
            completed: value.completed !== false,
            needsReply: value.needsReply !== false,
            failed: value.failed !== false,
            aborted: value.aborted === true,
            topLevelOnly: value.topLevelOnly !== false,
            soundPreset: typeof value.soundPreset === 'string' && value.soundPreset ? value.soundPreset : 'zcode',
            soundPath: typeof value.soundPath === 'string' ? value.soundPath : '',
            volume: Number.isFinite(value.volume) ? value.volume : 100,
            command: typeof value.command === 'string' ? value.command : '',
          })
          setRevision(entry.revision)
          setLoadError(null)
        } catch (error) {
          setLoadError(t('action.saveFailed', { message: String(error?.message ?? error) }))
        }
      }, [settings, t])

      const [revision, setRevision] = React.useState(undefined)

      ctx.effect(() => {
        load()
        return () => {}
      }, 'dsh-ding: initial load')

      /** Write the whole form back through the public settings namespace. */
      const save = React.useCallback(async (next) => {
        if (!settings?.update) return
        setBusy(true)
        try {
          await settings.update(NS, next, revision)
          setSaveState({ kind: 'ok' })
          // Refresh the revision so the next save does not conflict.
          try {
            const described = await settings.describe()
            const entry = (described?.namespaces ?? []).find((row) => row.ns === NS)
            if (entry) setRevision(entry.revision)
          } catch { /* keep the old revision */ }
        } catch (error) {
          setSaveState({ kind: 'error', message: String(error?.message ?? error) })
        } finally {
          setBusy(false)
        }
      }, [settings, revision])

      /** Apply a local change and persist it. */
      const commit = React.useCallback((patch) => {
        setForm((current) => {
          if (!current) return current
          const next = { ...current, ...patch }
          save(next)
          return next
        })
      }, [save])

      /** Play a chime now, on the Host, so a background tab still rings. */
      const preview = React.useCallback(async (presetId) => {
        setPreviewing(true)
        try {
          await fetch('/dsh-ding/preview', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(presetId ? { presetId } : {}),
          })
        } catch { /* preview is best effort */ }
        finally {
          setTimeout(() => setPreviewing(false), 400)
        }
      }, [])

      if (loadError) {
        return h('div', { className: 'dsh-ding' }, h('p', { className: 'dsh-ding-note' }, loadError))
      }
      if (!form) {
        return h('div', { className: 'dsh-ding' }, h('p', { className: 'dsh-ding-hint' }, t('status.loading')))
      }

      const disabled = busy
      const customPath = form.soundPath.trim()

      return h('div', { className: 'dsh-ding' },
        h('div', { className: 'dsh-ding-head' },
          h('span', { className: 'dsh-ding-title' }, t('page.title')),
          h('span', { className: 'dsh-ding-sub' }, t('page.subtitle'))),

        // ---- when to play ----
        h('div', { className: 'dsh-ding-group' },
          h('span', { className: 'dsh-ding-group-title' }, t('section.triggers')),
          h(Toggle, {
            label: t('field.enabled.label'), hint: t('field.enabled.hint'),
            checked: form.enabled, disabled, onChange: (v) => commit({ enabled: v }),
          }),
          h(Toggle, {
            label: t('field.completed.label'), hint: t('field.completed.hint'),
            checked: form.completed, disabled: !form.enabled || disabled,
            onChange: (v) => commit({ completed: v }),
          }),
          h(Toggle, {
            label: t('field.needsReply.label'), hint: t('field.needsReply.hint'),
            checked: form.needsReply, disabled: !form.enabled || disabled,
            onChange: (v) => commit({ needsReply: v }),
          }),
          h(Toggle, {
            label: t('field.failed.label'), hint: t('field.failed.hint'),
            checked: form.failed, disabled: !form.enabled || disabled,
            onChange: (v) => commit({ failed: v }),
          }),
          h(Toggle, {
            label: t('field.aborted.label'), hint: t('field.aborted.hint'),
            checked: form.aborted, disabled: !form.enabled || disabled,
            onChange: (v) => commit({ aborted: v }),
          }),
          h(Toggle, {
            label: t('field.topLevelOnly.label'), hint: t('field.topLevelOnly.hint'),
            checked: form.topLevelOnly, disabled: !form.enabled || disabled,
            onChange: (v) => commit({ topLevelOnly: v }),
          })),

        // ---- sound ----
        h('div', { className: 'dsh-ding-group' },
          h('span', { className: 'dsh-ding-group-title' }, t('section.sound')),
          h('div', { className: 'dsh-ding-presets' },
            PRESET_ORDER.map((id) => h('button', {
              key: id,
              type: 'button',
              className: 'dsh-ding-preset',
              'data-active': form.soundPreset === id ? 'true' : 'false',
              disabled: disabled || !form.enabled,
              onClick: () => {
                commit({ soundPreset: id })
                preview(id)
              },
              onDoubleClick: () => preview(id),
            },
              h('span', { className: 'dsh-ding-preset-name' }, t(`preset.${id}`)),
              h('span', { className: 'dsh-ding-preset-desc' }, t(`presetDescription.${id}`))))),

          h('div', { className: 'dsh-ding-row', style: { flexDirection: 'column', alignItems: 'stretch', gap: '6px' } },
            h('div', { className: 'dsh-ding-label' },
              h('span', { className: 'dsh-ding-label-text' }, t('field.soundPath.label')),
              h('span', { className: 'dsh-ding-hint' }, t('field.soundPath.hint'))),
            h('input', {
              className: 'dsh-ding-input',
              type: 'text',
              spellCheck: false,
              placeholder: 'C:\\Users\\me\\Music\\done.wav',
              value: form.soundPath,
              disabled: disabled,
              onChange: (event) => setForm((current) => current ? { ...current, soundPath: event.target.value } : current),
              onBlur: (event) => commit({ soundPath: event.target.value }),
            }),
            customPath
              ? h('span', { className: 'dsh-ding-note', 'data-tone': 'ok' }, t('status.usingCustom'))
              : null),

          h('div', { className: 'dsh-ding-row', style: { flexDirection: 'column', alignItems: 'stretch', gap: '6px' } },
            h('div', { className: 'dsh-ding-label' },
              h('span', { className: 'dsh-ding-label-text' }, `${t('field.volume.label')} · ${form.volume}`),
              h('span', { className: 'dsh-ding-hint' }, t('field.volume.hint'))),
            h('input', {
              className: 'dsh-ding-slider',
              type: 'range', min: 0, max: 100, step: 1,
              value: form.volume,
              disabled: disabled || !form.enabled,
              onChange: (event) => setForm((current) => current ? { ...current, volume: Number(event.target.value) } : current),
              onMouseUp: (event) => commit({ volume: Number(event.target.value) }),
              onKeyUp: (event) => commit({ volume: Number(event.target.value) }),
            }))),

        // ---- advanced ----
        h('details', { className: 'dsh-ding-group' },
          h('summary', { className: 'dsh-ding-group-title', style: { cursor: 'pointer' } }, t('section.advanced')),
          h('div', { className: 'dsh-ding-row', style: { flexDirection: 'column', alignItems: 'stretch', gap: '6px', borderBottom: 0 } },
            h('div', { className: 'dsh-ding-label' },
              h('span', { className: 'dsh-ding-label-text' }, t('field.command.label')),
              h('span', { className: 'dsh-ding-hint' }, t('field.command.hint'))),
            h('input', {
              className: 'dsh-ding-input',
              type: 'text',
              spellCheck: false,
              placeholder: 'ffplay -nodisp -autoexit {file}',
              value: form.command,
              disabled,
              onChange: (event) => setForm((current) => current ? { ...current, command: event.target.value } : current),
              onBlur: (event) => commit({ command: event.target.value }),
            }))),

        // ---- actions ----
        h('div', { className: 'dsh-ding-actions' },
          h('button', {
            type: 'button', className: 'dsh-ding-btn', disabled: busy || previewing || !form.enabled,
            onClick: () => preview(customPath ? undefined : form.soundPreset),
          }, t('action.preview')),
          h('button', {
            type: 'button', className: 'dsh-ding-btn', disabled: busy,
            onClick: () => {
              const defaults = {
                enabled: true, completed: true, needsReply: true, failed: true,
                aborted: false, topLevelOnly: true,
                soundPreset: 'zcode', soundPath: '', volume: 100, command: '',
              }
              setForm(defaults)
              save(defaults)
            },
          }, t('action.reset')),
          saveState?.kind === 'ok'
            ? h('span', { className: 'dsh-ding-save-state' }, t('action.saved'))
            : null,
          saveState?.kind === 'error'
            ? h('span', { className: 'dsh-ding-save-state', 'data-error': 'true' },
              t('action.saveFailed', { message: saveState.message }))
            : null))
    }

    return {
      inject: ['slots', 'locale', 'remote'],
      apply(ctx) {
        // Register the dictionaries, then bind. `t()` walks the path itself so
        // the page does not depend on how the host interpolates a bound NS.
        ctx.effect(() => ctx.locale.register(NS, DICTS), 'dsh-ding: dictionaries')

        const translate = (path, vars) => {
          const active = (() => {
            try { return ctx.locale.getSnapshot?.().active } catch { return undefined }
          })()
          const dict = DICTS[active] ?? DICTS.en
          let value = path.split('.').reduce((node, key) => (node == null ? undefined : node[key]), dict)
          if (typeof value !== 'string') {
            // Fall back through English, then show the path (never a blank label).
            value = path.split('.').reduce((node, key) => (node == null ? undefined : node[key]), DICTS.en)
          }
          if (typeof value !== 'string') return path
          if (!vars) return value
          return value.replace(/\{(\w+)\}/g, (whole, key) => (key in vars ? String(vars[key]) : whole))
        }

        // Re-register the page on locale change so its label follows the user.
        ctx.effect(() => {
          const off = ctx.locale.subscribe?.(() => {})
          return () => { if (typeof off === 'function') off() }
        }, 'dsh-ding: locale subscription')

        ctx.effect(() => ctx.slots.inject('settings.section', () => ctx.slots.register({
          name: 'settings.section',
          id: 'dsh-ding',
          order: 40,
          locale: NS,
          label: () => translate('page.title'),
        }, (ownerProps) => h(DingPage, { ...ownerProps, t: translate, ctx }))), 'dsh-ding: settings page')
      },
    }
  },
})
