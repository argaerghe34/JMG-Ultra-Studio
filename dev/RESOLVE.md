# JMG Ultra Studio for DaVinci Resolve – how it works

Started 28 Oct 2026. The user asked for "a complete version for DaVinci Resolve with feature parity, on GitHub", and
that **every change from now on lands in all versions at once** (Premiere on Mac and Windows, and Resolve).
Colour and Camera Switch are paused in every version (`US.PAUSED_TOOLS` in `js/core/app.js`): their Premiere code
stays, and they get no Resolve layer until they come back.

## One panel, two editors
- **Resolve Studio (paid) only.** Its *Workflow Integration* plugins are Electron windows running HTML/JS, opened from
  **Workspace › Workflow Integrations › JMG Ultra Studio**. The free Resolve has no plugins. This Mac has Resolve
  Studio 20.3.1. The API reference is in
  `/Library/Application Support/Blackmagic Design/DaVinci Resolve/Developer/Scripting/README.txt` (Windows:
  `%PROGRAMDATA%\Blackmagic Design\DaVinci Resolve\Support\Developer\Scripting\README.txt`).
- **The panel is shared:** `index.html`, `js/`, `css/` and `assets/` are the same files in both editors. What differs:
  - `js/core/platform.js` → `US.app` (`id`, `name`, `full`, `is()`, `pickFiles()`, `openUrl()`, `reveal()`) and
    `US.say(text)`, which puts on-screen text in Resolve's words ("sequence" reads "timeline", "Premiere" reads
    "Resolve", "Project panel" reads "Media Pool"…). `US.h`, the status bar, errors and pickers pass text through it, so
    tools write one sentence. Write **new** text the Premiere way; when an instruction really differs (menus,
    "right-click › Proxy"), write `US.app.is('resolve') ? '…' : '…'`.
  - `js/core/host.js` → `US.host.call(name, args)` runs the ExtendScript command (`jsx/`) in Premiere, or the Resolve
    command (`resolve/host/`) in Resolve. **Same names, same arguments, same results.**
- **The Resolve layer:** `resolve/host/index.js` connects (via Resolve's `WorkflowIntegration.node`, copied next to
  the plugin by the installer) and gathers every `resolve/host/*.js`. Each module is
  `module.exports = (R) => ({ commandName(args) { … } })`, may be `async`, and runs one at a time.
  `resolve/host/base.js` (`R`) has the shared helpers: Media Pool index and ids, `itemInfo` (Premiere-shaped), bins,
  timelines, seconds ↔ frames, `clipInfo` (inclusive end frame), `itemTimes`, markers (Ultra Studio's ids live in a
  marker's `customData`; Resolve allows one marker per frame), colour maps, and `R.err(CODE, detail, title, action)`.
- **Plugin shell:** `resolve/plugin/` (manifest.xml, package.json, main.js, preload.js). `main.js` opens the window
  with Node in the page (Blackmagic's "compatibility mode") and answers file dialogs over IPC. A file called `debug`
  next to it opens the DevTools port **8892**, so `dev/cep.js 8892 js …` and the e2e runner work as with Premiere.

## Conventions for Resolve commands
- Times are **seconds**: media time for clips (from the media's first frame), and from the timeline's start for
  timelines (`R.tlSec` / `R.tlFrame`; Resolve timelines usually start at 01:00:00:00 = frame 86400 at 24/25 fps).
- Ids: `GetUniqueId()` of Media Pool items, folders, timelines and timeline items.
- `addSequenceMarkers({seqId, markers, where})` honours **Settings › Markers** (`'sequence' | 'clips' | 'both'`) as
  in Premiere: a clip marker's id is `clip:<item id>:<guid>`, and `removeSequenceMarkers` removes both kinds.
- AppendToTimeline works on the **current** timeline: `R.open(tl)` first. Tools that change a timeline work on a
  copy (`DuplicateTimeline`) or build a new one, exactly as in Premiere.
- Never leave Resolve on a different page or Media Pool folder than you found it, unless the tool's job is to show
  something.
- Plain errors only (`R.err('NO_SEQUENCE')`, etc.). Raw Resolve failures go in `detail`.
- Unit tests: `dev/tests/resolve-*.test.js` against `dev/tests/resolve-fake.js`, a small in-memory stand-in for
  Resolve's API. The fake follows the README; what it can't prove is checked by the e2e tests in real Resolve.

## Where Resolve's API differs, and what we do (keep this list honest)
| Premiere feature | Resolve |
|---|---|
| Source Monitor cue/play (Story "play this line") | No API to drive the Source Viewer. The panel plays the line itself (in-panel player); the clip is selected in the Media Pool. |
| Media Encoder queue | Resolve's Render Queue (`AddRenderJob`, `StartRendering`, `GetRenderJobStatus`); Deliver presets are Resolve render presets. |
| Render a clip's sound for analysis | A temporary audio-only render (WAV, 16 kHz where Resolve allows) of a scratch timeline, deleted afterwards. |
| Subclips | `MediaStorage.AddItemListToMediaPool([{media, startFrame, endFrame}])`. |
| Ripple-extract ranges (Silence Cut) | Rebuild: a new timeline made of the kept parts (`AppendToTimeline` with record frames), never razor edits. |
| Clip volume / ducking (Sound) | Not settable by script in Resolve 20 – to confirm in real Resolve; until then Sound reports this plainly. |
| Adjustment layers (Story highlights, Render ranges) | Adjustment clips can't be created by script reliably; highlights use clip colours + markers, render ranges use marked ranges. |
| Auto Reframe | `TimelineItem.SmartReframe()` (Studio). |
| Premiere transcripts | Resolve's own transcripts can't be read by script, so Story has Resolve make subtitles of each clip on a scratch timeline and reads those (per phrase: no word timings or speaker names). Transcript files work as in Premiere. |
| Project file path (Story travels with the project) | Resolve projects live in a database, not a file: see `storyProjectFile` in `resolve/host/story.js`. |

## Building and installing
- `node dev/resolve/build.js` → `dist/JMG Ultra Studio for Resolve <version>/` and
  `dist/JMG-Ultra-Studio-Resolve-<version>.zip` (installers for Mac and Windows inside).
- Installed at `/Library/Application Support/Blackmagic Design/DaVinci Resolve/Workflow Integration Plugins/com.jmgphotography.ultrastudio/`
  (Windows: `%PROGRAMDATA%\Blackmagic Design\DaVinci Resolve\Support\Workflow Integration Plugins\…`).
- Development: `dev/resolve/link-dev.sh` (Mac) points Resolve at this folder, with the debug port on.
- The same version number as the Premiere release; releases attach both zips.
- **Ask before driving Resolve**, and only use the test project **"JMG Ultra Studio Test"** (never the user's own
  projects, which live in Resolve's database).
