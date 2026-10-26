# JMG Ultra Studio – how the code fits together

A CEP panel for Premiere Pro (tested on 26.5.2, CEP 12: Chromium 99 + Node 17.7, `--mixed-context`, so `require()` works in the page).
No build step, no third-party libraries, no server. Folder = extension.

## Layout
- `index.html` – loads `js/core/{util,store,host,jobs,ui,app}.js`, then the optional engines `js/core/{time,audio,dsp,vision,transcript,ai}.js` (if present), then every `js/tools/*.js` in name order, then `US.boot()`.
- `jsx/host.jsx` – Premiere side (ExtendScript, **ES3**). `jsx/tools/*.jsx` are loaded after it (same engine) and add `UStudio.fn.<name> = function (a) {...}`.
- Everything in the panel hangs off `window.US`.

## Rules (the user asked for these explicitly)
1. **Same look everywhere.** Build screens only from `US.ui` (`toolView`, `card`, `field`, `slider`, `toggle`, `segmented`, `select`, `sourcePicker`, `timeline`, `list`, `stats`, `note`, `empty`, `actionButton`, `button`). No new colours: use the CSS variables in `css/app.css`. Add CSS only if a component truly doesn't exist, in a clearly labelled block at the end of app.css.
2. **Always show what's happening.** Anything over ~1 s runs in `US.jobs.run({title, tool}, async job => …)`. Call `job.set({who:'premiere'|'computer'|'ai', msg})`, `job.progress(fraction, 'Analysing clip 3 of 12 · C003.mp4')` and `job.check()` (honours Stop) inside loops. Return `{summary: 'short plain result'}`.
3. **Plain errors only.** Throw `new US.UserError(CODE, {title, action, detail})`. `title` = what went wrong in plain words, `action` = the one thing to do next, `detail` = techy stuff (hidden behind "Details"). Codes are in `js/core/host.js` (`CATALOG`). Never show raw exception text.
4. **Never wreck the user's work.** Tools that change a sequence make a copy first (`cloneSequence`) or build a new one (`newSequence` + `placeClips`). New bins go under `JMG Ultra Studio/…`. Source clips' in/out points are restored by `placeClips`.
5. **Simple names.** Tool names are plain ("Selects", "Silence Cut"); only the product is "JMG Ultra Studio". UI text is short, friendly British English ("colour", "analyse").
6. **Not overly complex.** Each tool: a "Works on" picker, a few settings (presets first, advanced settings in a closed `ui.section`), one big primary button, then results with follow-up buttons.

## Registering a tool
```js
US.tools.register({
  id: 'silence', name: 'Silence Cut', short: 'Silence', icon: 'silence', group: 'cut', order: 20,
  blurb: 'Removes pauses from interviews. Works on a copy.',
  hostFns: ['myHostFn'],            // checked by Home › Check my setup
  create() { const v = US.ui.toolView({...}); …; return { el: v.el, onShow() {}, onHide() {} }; }
});
```
Groups: `find` (Find the good bits), `cut` (Cut faster), `finish` (Finish & deliver). Icons: see `US.icon` in util.js (add a path there if needed).

## Actions (for the Assistant)
Register what the tool can do with `US.actions.register({ id:'silence.cut', tool:'silence', title, describe, params:{…}, examples:[…], match(text){…}, changes:true, run: async (params, job) => ({summary}) })`. The tool's own button should call the same code. `match(text)` is the offline parser: return params if the sentence is clearly for this action, else null.

## Premiere side (ExtendScript)
- ES3 only: `var`, no arrow functions, no `let/const`, no `Array.prototype.forEach/map/indexOf`, **never** a reserved word as an object key or after a dot (`{in: 1}` breaks everything – write `{'in': 1}`). Native `JSON` exists. Run `node dev/check-jsx.js` after every change.
- Use helpers exported by `UStudio` (`needItem`, `needSeq`, `ensureBin`, `walk`, `itemInfo`, `secToTicks`, `ticksToSec`, `framesToTC`, `secToFrames`, `openAndQE`, `err`).
- Verified in Premiere 26.5: `createNewSequenceFromClips`, `track.overwriteClip(item, seconds)` (brings linked audio), `projectItem.setInPoint/setOutPoint(sec, 4)`, `markers.createMarker(sec)` + `.end/.name/.comments/.setColorByIndex`, `qeSeq.extract(tcIn, tcOut)` (ripple-removes across all tracks; timecode strings), `seq.exportAsMediaDirect(path, epr, 0)` (may throw even on success – check the file), `qeSeq.exportFramePNG(tc, pathWithoutExt)` (~120 ms), `getProjectColumnsMetadata()` (duration in ticks, `VideoInfo` "W x H (par)", `AudioInfo`). `qe.project.getSequenceAt()` throws – open the sequence and use `getActiveSequence()`.
- Marker colours 0–7: green, red, purple, orange, yellow, white, blue, cyan. Label colours 0–15: see `US.ui.LABELS`.

## Panel side facts
- `<video>` decodes H.264/AAC MP4 (and H.264 MOV usually); **not** HEVC or ProRes. Seeking a 1080p H.264 file: 4–110 ms. `FaceDetector` exists only with `--enable-experimental-web-platform-features` (in our manifest) – feature-detect it.
- `OfflineAudioContext.decodeAudioData` can't decode MP4/AAC here – use `US.audio.forItem()` (Premiere renders a 16 kHz mono WAV, ~0.4 s per minute of sound) or `US.audio.readWav()` for WAV files.
- Cache per-media analysis with `US.cache.cached(kind, mediaPath, version, compute)`.

## Testing
- `dev/link-dev.sh` points Premiere at this folder and installs the dev helper (undo with `dev/unlink-dev.sh`). Restart Premiere after linking.
- `dev/build.sh` checks syntax, runs the unit tests and builds `dist/` (installer zip). `node dev/e2e/run.js` runs the end-to-end tests in real Premiere (needs the dev link).
- `dev/cep.js <port> jsx|js|shot|reload <file>`: port 8890 = the panel, 8891 = dev helper. `js` runs page JavaScript (awaited; `return` a JSON-able value). `jsx` runs ExtendScript in the panel's engine.
- `dev/restart-premiere.sh $PWD/dev/cep.js` restarts Premiere on the test project and opens the panel (only needed after manifest changes).
- Test media with ground truth: `dev/test-media/` (see its README.md). Test project: `dev/test-project/UltraStudioTest.prproj`.
- Pure logic (DSP, parsers, scoring) gets Node unit tests in `dev/tests/*.test.js` (run with `node dev/tests/run.js`); load panel modules with `dev/tests/harness.js`, which fakes `window`/`US`.
