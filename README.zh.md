# dsh-ding-chime

DeepSeek Harness 提示音插件：一轮任务结束、需要你回复、或因错误终止时响一声，你可以放心离开屏幕。

[English](README.md)

## 为什么是插件而不是 skill

skill 是给模型看的说明书，只在模型**正在跑**且主动加载时才生效。而你要响铃的三个时刻，恰好都是模型**没在跑**的时候——这一轮已经结束了、卡在等你回复、或者这一轮已经挂了。插件订阅的是 Harness 的权威事件，不依赖模型行为，也不依赖浏览器页面是否在前台。

## 什么时候响

| 时机 | 触发事件 |
|---|---|
| 一轮任务完成 | `session/event` → `turn/end`，`reason.kind === 'completed'` |
| 需要你回复 | `user-questions/request`（提问和 plan review）、`approval/request`（工具审批） |
| 因错误终止 | `turn/end` 的 `error` / `max-tokens`，外加 `agent/error` |

每一项都能单独关掉。子代理默认不响，所以并行派发五个任务不会连响五声。

## 安装

```bash
dsh plugin add dsh-ding-chime
```

或在 Web UI 里：**设置 → 插件 → 发现**，搜索 `dsh-ding-chime`。

## 设置页

插件会在**设置**里加一页（排在「费用」后面）。所有选项都能在页面上改，直接写进 profile 的 `cordis.patch.yml`，升级不会丢：

- **什么时候响** —— 四个独立开关：任务完成、需要你回复、因错误终止、你自己中断（默认关）。
- **忽略子代理** —— 默认开。
- **提示音** —— 六段内置音频任选。点一下就立刻试听。
- **自定义音频文件** —— 任意 wav / mp3 / flac 的绝对路径，填了就覆盖内置音频。文件不存在时会退回内置音频，不会静默失声。
- **音量** —— 0 到 100。
- **自定义播放命令** —— 高级选项：`{file}` 会替换成音频路径，可以接 `mpv`、`afplay`、`aplay` 等你手边的播放器。

### 内置提示音

| 名称 | 听感 |
|---|---|
| **Zcode 提示音** | Zcode 的短促提示音 |
| **叮** | 一声清脆的叮 |
| **风铃** | 三声上行的钟琴音 |
| **柔和** | 两声柔和的下行音 |
| **提醒** | 三声紧凑的提醒 |
| **报错** | 下行小调两音，明确但不刺耳 |

六段全部为原创合成（`scripts/generate-sounds.py`，正弦/三角波加指数衰减包络），不含任何第三方采样，所以 MIT 许可覆盖整个包。每个文件都是 16-bit PCM 单声道 WAV，这也意味着 Windows 的 `SoundPlayer` 兜底一定能播。

## 设置页怎么和 Host 通信

设置页是插件自己提供的普通 JavaScript，通过 Host 注册的三条同源路由交换数据：

| 路由 | 用途 |
|---|---|
| `GET /dsh-ding/config` | 读取当前配置，以及 profile 是否允许写入 |
| `POST /dsh-ding/config` | 把改动合并进已保存的配置 |
| `POST /dsh-ding/preview` | 在跑 Harness 的那台机器上播放提示音 |

写入走 Harness 自带的 `configEditor`，所以值会落到 profile 的 `cordis.patch.yml`，重启和升级都不会丢。试听是在 Host 端播放而不是浏览器里播，所以标签页在后台时照样能响。

这样绕开生成的 Remote 绑定，浏览器端不需要 codegen，换 Harness 版本也不会失效。

## 播放方式

不用你额外装运行时，闲置时也不占任何资源：

1. **你的自定义命令**（如果配了）
2. **`ffplay`** —— 从 `PATH` 或常见 ffmpeg 安装位置自动探测，支持所有格式和音量控制
3. **Windows `SoundPlayer`** —— 内置兜底，光靠内置 WAV 就能响

每次响铃只拉起一个短命播放器进程，播完自己退出。没有常驻进程、不轮询、没有定时器，两次响铃之间零开销。播放失败会被吞掉，绝不影响任务本身。

有意的取舍：开机后第一次响约 1.4 秒（系统拉起播放器的开销），之后约 50 毫秒。提示音本身不到 1 秒，这个延迟可以接受。

## 配置

设置页会帮你写，也可以直接在 profile 的 `cordis.patch.yml` 里写：

```yaml
- id: dsh-ding
  name: dsh-ding-chime
  config:
    enabled: true
    completed: true
    needsReply: true
    failed: true
    aborted: false
    topLevelOnly: true
    soundPreset: zcode      # zcode | ding | chime | soft | alert | error
    soundPath: ''           # 绝对路径，填了覆盖 soundPreset
    volume: 100
    command: ''             # 高级选项，{file} 会被替换
```

## 环境要求

- 带 Web UI 的 DeepSeek Harness。
- Node.js 20 或更新。
- 可选：ffmpeg（换其他音频格式、以及音量控制需要）。没装也能用——内置提示音走 Windows 兜底照样响。

## 开发

```bash
npm test                 # 27 项测试，不需要启动 Harness
node scripts/build-client.mjs         # 把 locale JSON 内联进 lib/client.js
node scripts/build-client.mjs --check # CI 用：该区块过期就报错
npm run gen:sounds       # 从头重新生成 assets/sounds
```

`lib/client.js` 把语言字典内联在模块里，因为浏览器端是单个自包含模块。`locale/*.json` 仍是唯一事实来源（插件管理器也从那里读 `meta`），改完 JSON 重跑构建脚本即可。

## 许可

MIT，见 [LICENSE](LICENSE)。
