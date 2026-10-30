# Moving the Premiere version to UXP – plan (written 1 Nov 2026)

Adobe's timeline (Adobe Developer Blog, September 2026):
- **December 2027:** no new CEP panels accepted on the Marketplace for Premiere.
- **December 2028:** CEP switched off by default.
- **From December 2029:** CEP removed from the apps.

Existing CEP panels keep working and can be updated until then. UXP is GA in Premiere 2026 (25.6+), with C++ hybrid plugins from 26.2. ExtendScript itself is "not affected".

There is no emergency. But Ultra Studio's Premiere version is a CEP panel calling ExtendScript (`jsx/`), so it needs a UXP build before December 2028 – and before December 2027 if it is ever sold on the Marketplace.

## How the panel is built today

The architecture already separates the parts:
- **The shared panel** (`js/`, `css/`, `index.html`) talks to its editor only through `US.host.call(name, args)`.
- **Premiere** answers through `jsx/` (CEP + ExtendScript): 109 commands in `host.jsx` and 12 tool files.
- **Resolve** answers through `resolve/host/*.js` (the Workflow Integration plugin's Node.js): the same command names, arguments and results.

So a UXP version is a **third host adapter**. The panel code stays as it is; the commands are written again against the UXP API (`premierepro` module), in JavaScript inside the UXP runtime.

## Which commands port how (from the UXP changelog up to 26.5; the full API reference must be checked first)

| Group | Commands | UXP |
|---|---|---|
| Reading the project | `ping`, `context`, `listBins`, `listSequences`, `binList`, `binItems`, `itemInfo(s)`, `selection*`, `sequenceInfo`, `clipRanges`, `audioClipRange`, `sampleItems`, `storyClips`, `storyTiming`, `storySequenceTiming`, `editRead`, `editSelection`, `mcRead`, `subRead` | Expected – project items, sequences, tracks, clips, metadata. `Media.getDuration/getStart` became sync in 26.5. |
| Bins, names, labels | `ensureBin`, `moveItems`, `setLabels`, `renameItem`, `revealItem`, `tidyMove` | Expected, as Actions inside `project.lockedAccess()` (26.3). |
| Markers | `add/remove/clipMarkers`, `addSequenceMarkers`, `removeSequenceMarkers` | Yes – Marker `guid` added in 26.3. |
| Subclips | `createSubclips`, `subMake` | Yes – `ClipProjectItem.createSubClipAction` (26.3). |
| Building sequences | `newSequence`, `placeClips`, `storyPlace`, `mcBuild`, `selectsPlaceWhole`, `brollPlace`, `cloneSequence` | Probably – insert/overwrite Actions and `createSequenceWithPresetPath` (26.3). Clone and nest to check. |
| Cutting | `extractRanges` (ripple delete), `podSwitch` (razor per track), `editApply` razor | **Unconfirmed** – razor/extract aren't in the changelog. Today these use QE. |
| Clip settings | `setClipsDisabled`, `editApply` enable / opacity / motion / volume, `soundGain` | Likely through `ComponentParam` – set-value to confirm. |
| Keyframes | `editApply` zoom, `soundDuck`, `camerasPunch` | **Thin** – only a `getValueAtTime` fix is listed. |
| Transitions, effects | `editApply` transition / effect, `colourClips` (Lumetri), `storyThemeLayers` (adjustment layers) | **Not listed** – today QE (`addTransition`, `addVideoEffect`). This is the biggest gap. |
| Text | `addRenderRange` as text, `editApply` text, `storyCaptions` | MOGRT import to check; captions via the Captions API to check. |
| Export | `renderAudio` (incl. `soloAudio`), `exportFrame`, `queueExport`, `queueItemExport`, `queueRangeExport`, `startEncoderBatch`, `encoderListen`, `presets` | Yes – `EncoderManager` (26.3); events to check. |
| Reframe | `autoReframe`, `fitToSize` | To check. |
| Transcripts | `storyProjectFile` (reads the saved `.prproj`) | Better in UXP – `Transcript` queries and `transcribeClipProjectItem` (26.5). |
| Project file | `saveProject`, `storyProjectFile`, MC Selects reading `.prproj` | Save expected. The `.prproj` parsing stays in the panel's own JavaScript. |

## The spike (first half of 2027, about two weeks)

1. **Read the full UXP reference** for razor/extract, `ComponentParam.setValue` and keyframes, transitions, effects, MOGRT import, `Sequence.clone`, `autoReframe`, events and file access. Fill in the "Unconfirmed" rows above.
2. **Build a minimal UXP plugin** (manifest v5, `premierepro` module) with a host adapter that answers `US.host.call` for the reading and marker groups. Load the shared `js/` UI in a UXP panel. UXP's HTML/CSS support is narrower than Chromium's, so check the panel's CSS (grid, `:has`, custom properties).
3. **Run the existing end-to-end suite** (`dev/e2e`) against it with a third target, `--uxp`.
4. **Decide per gap:** for transitions, effects and keyframes, either keep a CEP build alongside UXP until Adobe fills them, or use a C++ hybrid plugin if the SDK exposes them. Write the decision into `dev/CONVENTIONS.md`.
5. **Decide distribution** (Marketplace or own installer) before December 2027.

The spike passes if Story, Selects, Silence Cut, Deliver and Ask › Edit (labels, markers, enable) run end to end in UXP. It also needs a written list of what still needs CEP.

## Reading the editor's own transcript (both editors)

Premiere's on-device transcription is the most-complained-about AI area in Adobe's forums, and Resolve 21.1 reportedly gives scripts transcription with speakers and timing. So one "read the host's transcript" layer is feasible:
- **Premiere (UXP):** `Transcript.hasTranscript`, then read it; `transcribeClipProjectItem` to start one (26.5).
- **Premiere (CEP, today):** read the saved `.prproj`, as `story.read` does.
- **Resolve 21.1 Studio:** the transcription API (verify against the installed scripting README – the 21.1 list comes from one trade article). Until then, `storyTranscribe` makes subtitles on a temporary timeline.

The Names and terms glossary (1.3.8.2) already corrects whatever comes in, whichever source.

## Not planned

- **An Ultra Studio MCP server.** Resolve 21.1 ships its own, and the value would go to the chat client, not the panel. See the proposal.
- **Local visual logging and search.** Parked with the B-roll tab, by the owner's choice. Selects already drops duplicate takes. Apple Vision's aesthetics score would need a small native helper; there is no Windows equivalent.
