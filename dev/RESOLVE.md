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
  timelines, seconds ↔ frames, `clipInfo` (end frame exclusive for timelines – see "Measured" below), `itemTimes`, markers (Ultra Studio's ids live in a
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
| Render a clip's sound for analysis | A temporary audio-only render ("Audio Only" preset, 48 kHz, turned into a WAV) of a scratch timeline, deleted afterwards; the panel resamples to 16 kHz. |
| Subclips | `MediaStorage.AddItemListToMediaPool([{media, startFrame, endFrame}])`. |
| Ripple-extract ranges (Silence Cut) | Rebuild on the copy: the kept parts re-laid with record frames, never razor edits. Grades/effects on rebuilt parts aren't carried; titles, generators or speed changes after the first cut are refused plainly. |
| Clip volume / ducking (Sound) | Not settable by script (Resolve 21). Sound measures and says the manual step (Normalize Audio Levels); ducking makes a copy with the speech marked in blue. |
| Adjustment layers (Story highlights, theme names, Render ranges, Song Splitter layers) | Adjustment clips can't be created by script: highlights and theme names are range markers, timeline clips get the theme colours, render ranges are range markers. Premiere's layer tracks become groups of range markers (customData `us-range-…` = Renders, `us-lyr-<group>~…` = e.g. Songs); a range's colour is its marker colour (Premiere label → `LABEL_MARKER`, and back), read directly – Premiere 26 can't read a timeline clip's colour, so the panel remembers the colours it gave there. |
| Auto Reframe | `TimelineItem.SmartReframe()` (Studio). |
| Deliver: “New track on top for render ranges” (1.3.5) | Not offered: Resolve's ranges are groups of range markers, so a new group needs nothing made (`addRangeTrack` only finds a free name). |
| Story highlights: markers on the clips (1.3.5) | Not offered: Resolve's highlights are range markers already. |
| Ask › My interviews: group names in the timeline (1.3.5) | Markers or range markers (no name layer). |
| Premiere transcripts | Resolve's own transcripts can't be read by script, so Story has Resolve make subtitles of each clip on a scratch timeline and reads those (per phrase: no word timings or speaker names). Transcript files work as in Premiere. |
| Captions (Story) | The SRT is written and imported into the Captions bin; the person drags it to the timeline (placing a subtitle by script crashes Resolve 21.1). |
| Selects: faces / close-ups | The panel's browser in Resolve has no face detector, so shot sizes don't use faces. |
| MC Selects (1.3.6): which camera each multicam cut shows | Not readable by script in Resolve (Premiere's comes from the saved project file), so MC Selects is Premiere only (`apps: ['premiere']` on the tool). |
| Subclip Maker (1.3.6) | Each clip's `GetMarkInOut()` (out inclusive), made with `createSubclips`; Replace moves earlier ones with `MoveClips`. 1.3.7.1: from the timeline, each item's `GetSourceStartFrame()` (else `GetLeftOffset()`) and length. |
| Ask › Edit (1.3.8) | `editRead` / `editApply` / `editSelection` (resolve/host/edit.js): Inspector values (`SetProperty` ZoomX/ZoomY/Pan/Tilt/RotationAngle/Opacity; Premiere's 0–1 position becomes Pan/Tilt pixels from the centre), `SetClipColor`, `SetClipEnabled`, `DeleteClips` (ripple), `AddMarker`. Transitions, effects, speed, keyframes, text, razor and renaming timeline clips can't be done by script – those steps come back `unsupported` and the AI isn't offered them. No timeline selection API: `GetCurrentVideoItem()` (under the playhead) stands in. |
| Render ranges as text layers (1.3.7.1) | Premiere: text layers (`isMGT()` / a Text component) on the range track; **Add a render range** imports Premiere's own *Basic Title.mogrt* (`importMGT`) and sets its text. Resolve: Text / Text+ titles (no media pool item) on a video track named like the group; the name is Text+'s `StyledText` when the clip has its default name. Resolve can't place, rename or move titles by script, so there a new range is still a marker and titles are renamed/moved in the Timeline (colour and delete work). Hiding the text while rendering: `setMute` on the track in Premiere, `SetTrackEnable` in Resolve (left off with queue-only, as Resolve renders later). |
| Project file path (Story travels with the project) | Resolve projects live in a database, not a file: see `storyProjectFile` in `resolve/host/story.js`. |

## Measured in real Resolve Studio 21.1.2 (28 Oct 2026) – the API reference doesn't say these
- **Crashes:** laying a subtitle item (an imported .srt) on a timeline by script aborts the whole app (assertion in
  `GetMediaFrameExtentsWithFrameRate`); one named "….srt" also did when asked for its clip properties. Resolve often
  shows an imported .srt **without** its extension, so `R.isSubtitle` also goes by `GetClipProperty()['Type'] ===
  'Subtitle'` (that all-properties call was safe on one), and `itemInfo` gives such an item `kind: 'subtitle'` – it
  is never footage, never laid, never rendered. Story's captions are imported for the person to drag. Treat any odd
  value sent to the API (undefined/NaN in a dict) as a crash risk.
- **Transcription runs in the background:** `Timeline.CreateSubtitlesFromAudio` returns at once (and throws
  "GetArgument – Unknown object type" for a settings dict such as `{}`, though it starts anyway); the subtitles arrive
  all together later (~25 s for a 90 s clip). Deleting the timeline before then **crashes Resolve**. `storyTranscribe`
  calls it with no settings, waits for the subtitles to arrive and settle, and leaves a timeline that may still be in
  use in the .scratch bin (cleared an hour later). Resolve writes "[MUSIC]" when it hears no words; the panel drops
  such sound tags.
- **No face detection in the panel:** Resolve's Electron 36 (Chromium 136) has no `FaceDetector`, even with
  experimental features on, so Selects finds no faces (no close-up bins from faces) in Resolve.
- **Clip colours:** Resolve has fewer than Premiere's 16 labels, so some share a colour (magenta 11 and rose 6 are both
  Pink) and read back as the first.
- **Errors are thrown**, not returned as false ("Execute: …: Error response (errorStr:…)").
- **Ranges:** `AppendToTimeline`'s `endFrame` is exclusive (50–99 is 49 frames); subclips
  (`AddItemListToMediaPool`) count it inclusive (125–175 is 51 frames). Render `MarkIn`/`MarkOut` are absolute and
  inclusive (90000–90024 is 1 s at 25 fps).
- **Stills** are always laid for 5 s, whatever is asked; landing on an item, a new one keeps its end and starts where
  the space begins (guides are laid in pieces, the last one ending with the edit).
- **Markers:** `GetMarkers()` reports each marker one frame early (added at 25, shown at 01:00:01:00, read back as
  24); `DeleteMarkerAtFrame` takes the real frame. Read through `R.markers()`, delete by `customData`.
- **Names:** a timeline or bin name with `: / \ ? * < > |` is refused – `R.safeName` uses look-alikes (9∶16).
- **Busy:** `SetCurrentTimeline` is refused for a moment after Smart Reframe – `R.restoreTimeline` retries.
- **Render marks:** a render job's Mark In/Out also moves the timeline's own In/Out – put back after.
- **Sound:** the Wave format can't be chosen by script and 16 kHz is refused: WAV = the "Audio Only" preset (PCM in a
  .mov, sometimes a real WAV) turned into a WAV on this computer (`movPcmToWav`, same samples).
- **After `DeleteClips`** the deleted items' objects are dead ("Unable to find proxy object").
- **Constants** such as `EXPORT_EDL` or `SUBTITLE_*` aren't on the JavaScript `resolve` object.
- **Connecting twice** from one window hangs (with or without `CleanUp` first): the connection lives in the plugin's
  main process (`resolve/plugin/main.js`), which outlives page reloads; the page asks over IPC. Resolve only accepts the
  plugin when it's opened from its own menu (Workspace › Workflow Integrations), not when started by hand.
- **Scripting from outside** (Python/`fusionscript`) is off unless Preferences › System › General › External scripting
  is set – the tests don't change it; a person opens the test project and the panel, and the rest is driven over
  the panel's DevTools port.

## Building and installing
- `node dev/resolve/build.js` → `dist/JMG Ultra Studio for Resolve <version>/` and
  `dist/JMG-Ultra-Studio-Resolve-<version>.zip` (installers for Mac and Windows inside).
- Installed at `/Library/Application Support/Blackmagic Design/DaVinci Resolve/Workflow Integration Plugins/com.jmgphotography.ultrastudio/`
  (Windows: `%PROGRAMDATA%\Blackmagic Design\DaVinci Resolve\Support\Workflow Integration Plugins\…`).
- Development: `dev/resolve/link-dev.sh` (Mac) points Resolve at this folder, with the debug port on.
- The same version number as the Premiere release; releases attach both zips.
- **Ask before driving Resolve**, and only use the test project **"JMG Ultra Studio Test"** (never the user's own
  projects, which live in Resolve's database).
