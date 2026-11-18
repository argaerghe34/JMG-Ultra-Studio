# Live preview (development only)

The panel in a web browser, without Premiere or Resolve: every tab, with the latest code, a pretend editor and a
sample project. Never shipped – `dev/build.sh`, `node dev/win/build.js` and `node dev/resolve/build.js` leave out `dev/`.

## Open it

- In the Claude desktop app: ask Claude to open **ultra-studio-preview** (`.claude/launch.json`), or
- in a terminal: `node dev/preview/server.js`, then open http://localhost:8790/

Options: `--root <checkout>` (which copy of the panel to show; default the main checkout
`~/Downloads/WhatsApp Chat with Tab/JMG Ultra Studio`, so it shows the latest `main` whichever branch the server runs
from) and `--port <n>` (default 8790). `US_PREVIEW_ROOT` works too.

## What you get

- **Top bar:** show it as **Premiere** or **Resolve** (`US.app.is('resolve')`), the panel's width, Reload, Reset
  sample project, Start fresh (also forgets the preview's settings and Story work), a red count of errors in the panel
  (click it for details), and the live-reload light.
- **Live reload:** editing `index.html`, `css/`, `js/` (or `resolve/host/`, `dev/preview/`) in that checkout reloads
  the panel.
- **The pretend editor:** the real `resolve/host/*.js` commands, run by the server against the stand-in Resolve from
  the unit tests (`dev/tests/resolve-fake.js`) – the same commands and results as Premiere's `jsx/`, so both modes use
  it. The sample project "JMG Ultra Studio Test": bins Interviews, Concert, B-roll/Selects, Music, Graphics (the test
  media in `dev/test-media`); timelines Main Cut (with markers), Concert Highlights, Social – vertical. Story starts with
  the three test transcripts from `dev/test-media/transcripts`. A Premiere-only command the stand-in doesn't have says
  so plainly.

## Safe by design

- **Nothing written outside a temp folder.** The panel's `fs` goes through the server: reads from the checkout or the
  sandbox, writes only in the sandbox (`$TMPDIR/jmg-ultra-studio-preview`, which is also the panel's home folder). The
  real settings in `~/Library/Application Support/JMG Ultra Studio` are never read or written; the test media is linked
  in, never written through.
- **Nothing goes online:** `http`, `https` and `fetch` to other sites refuse – so no AI (there are no keys anyway),
  Memory Box, update checks or downloads.
- **Nothing runs:** `child_process` refuses (no ffmpeg, installers, Finder). Refusals show in the browser console as
  `[preview] refused: …`.

## How it works

`server.js` serves `index.html` with `shim.js` in front of the panel's scripts, at the checkout's own path (so
`US.host.extensionDir()` is the real folder). `shim.js` gives the panel what CEP / Electron would: `require()` for
`fs`, `path`, `os`, `crypto`, `child_process`, `http(s)`, `url`, `util`, `events`, `zlib`, `electron`; `Buffer`,
`process`; `__adobe_cep__` / `window.cep` in Premiere mode, `__ULTRA_RESOLVE__` and Resolve's IPC in Resolve mode.
`frame.html` is the top bar around the panel.

Limits: no real pictures or sound analysis (no ffmpeg), no AI, file pickers choose nothing.
