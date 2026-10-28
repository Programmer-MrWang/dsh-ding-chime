# Changelog

Notable changes to this plugin. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] — 2026-10-28

First public release.

### Added

- Chimes for three Harness moments, each switchable on its own: a turn
  finished, the agent needs your reply (questions and tool approvals), and a
  turn stopped on an error or ran out of tokens. Interrupting a turn yourself
  can chime too, and is off by default.
- Six bundled chimes — Zcode, Ding, Chime, Soft, Alert, Error — all original
  synthesis, so the MIT license covers the whole package. No third-party
  samples are shipped.
- A settings page under **Settings**, with per-trigger switches, a chime picker
  that previews on click, a custom audio path that overrides the picker,
  volume, and a custom-player command for any audio backend.
- Subagent turns are ignored by default, so delegating several tasks does not
  produce a burst of chimes.
- Playback falls back from `ffplay` to the Windows `SoundPlayer`, so the
  bundled chimes work with no external player installed.
- Preview plays on the machine running the Harness rather than in the browser,
  so a chime still rings while the tab is in the background.

### Notes

- The npm package is `dsh-ding-chime`; the name `dsh-ding` was already taken by
  an unrelated plugin.
- Idle cost is zero: no daemon, no polling, no timers. Each chime starts one
  short-lived player process and lets it exit.
