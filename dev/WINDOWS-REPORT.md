# Windows report – JMG Ultra Studio 1.3.1 → 1.3.2

**Date:** 27–28 Oct 2026 · **By:** Claude on the PC, following `dev/WINDOWS-TESTING.md`
**PC:** Windows 11 Pro 10.0.26200 · Premiere Pro **26.5.2** (same as the Mac) · Media Encoder 2026 · 2 screens, **100 %** scaling (96 dpi)
**Tested:** `main` @ `c2ddc14` (1.3.1), the `v1.3.1` release zip, then branch `windows-fixes` (1.3.2).
**Issues:** #1–#11 (labels `windows` + `from-pc`).

## Phase 0 – set up
- **Git 2.56, GitHub CLI 2.103, Node 24.22 LTS:** installed via winget. The user asked for this before going away overnight.
- **GitHub login:** passed (`gh auth login --web`, `gh auth setup-git`).
- **Clone:** passed on the second try. The first clone, into the ~190-character session folder, silently left out 356 files because of Windows' 260-character path limit. A short folder worked → #7, and the docs are updated.
- **`dev` npm install:** passed.

## Phase A – without Premiere
- **`node dev/tests/run.js`:** passed after test fixes. Before: 230 passed, 1 failed (`colour-ui` picked a real LUT installed on the PC) → #1. Now **243 passed, 0 failed** (13 new: Windows fixes, render ranges, Story clip copies).
- **Test isolation:** failed, now fixed. The tests wrote into the user's real `%APPDATA%\JMG Ultra Studio`, because only `HOME` was redirected → #1. After the fix the real profile stays untouched.
- **`node dev/tests/ui-smoke.js`, `colour-ui.js`, `check-jsx.js`:** passed.
- **Panel boot in jsdom with a mocked `__adobe_cep__`, Windows paths:** passed. Boots to Home, all 15 tools and their actions register, and every tool screen opens.
- **Windows code review** (paths, file locks, CRLF, Mac-only assumptions): 6 problems fixed (#1–#6) and 4 left open (#8–#11).

## Phase B – install like the user
- **`Install on Windows.bat`, fresh 1.3.0:** passed. Exit code 0, all 58 files identical (hash check).
- **`Install on Windows.bat`, 1.3.1 over 1.3.0:** passed. Exit code 0, all 59 files identical, version reads 1.3.1.
- **Check my setup in real Premiere:** **8 of 8 passed** (“All 89 Premiere commands loaded”, sound analysis ~480× real time, picture analysis 2/2, export presets found). Screenshot: `dev/screenshots/windows-check-my-setup.png`.

## Phase C – automated Premiere tests
- **`dev/win/link-dev.ps1`, `unlink-dev.ps1`, `restart-premiere.ps1`:** work. link-dev now only checks PlayerDebugMode (the installer turns it on) instead of writing the registry.
- **Windows test project:** `dev/test-project-win/UltraStudioTest-win.prproj` (made with `app.newProject`).
- **`node dev/e2e/run.js` (35 tests):** first run 25 of 34. **Final full run on 1.3.2: 35 of 35 passed, none needing a retry.** Selects A analysed 110 s of footage at 8.9× real time; Overnight did all 4 steps.

What failed on Windows, and what it was:
- **Mac-only test tools** (22b, 22i, 22j: `textutil`/`unzip` to read Word files; 33: a Mac-only file URL): test bugs. Fixed with a Node reader (`T.docxText`) and `T.fileUrl`.
- **32c:** a gitignored fixture missing on a fresh clone. The test now makes it.
- **34-colour:** a test bug on both systems. Its select helper used `Array.indexOf`, which ExtendScript doesn't have, so it threw and the selection never changed. It only passed on the Mac because the right clip happened to be selected. Fixed.
- **22i, 22j, 22l:** the test project has the interview in three bins (Audio, Story, E2E). Story linked the transcript to another copy of the same file. The tests now accept any copy, and Story now **stays with the clip a transcript already belongs to** instead of switching between copies (app fix).
- **10-selects:** imported `C006_whip_pan_prores.mov`, which isn't in the repository (over 100 MB). **Importing a missing file stopped Premiere answering scripts** until it was restarted (2.4 hours of timeouts). App fix: `importFiles` now leaves out files that aren't on disk. The test uses the clips that are there.
- **01, 10, 10b (Selects):** after a busy spell, **the panel's browser stopped loading paused videos** after their index, first for Media Encoder's analysis copies and later for every clip. Seeking didn't help, so Selects found "nothing could be read" or fell back to slow copies. A muted `play()` always loads them. App fix: Selects starts a muted play when the first frame doesn't come and pauses as soon as it's there.
- **10-selects part A (sometimes):** the whip pan or C010's bad stretch landed in the wrong place. Selects' fast playback mode delivered only **12–17 of ~30 frames** per clip on this PC (RTX 3070), so a short whip pan could fall between samples. App fix: when playback gives under 80 % of the frames, the clip is read again by seeking (exact frames). After two such clips in a session, Selects only seeks.
- **Flaky on the first try, passed on retry:** 20-silence and 22-songs (`placeClips: Illegal Parameter type`), 21-beats, 10b. All passed in the last full run.

## Phase D – most likely to differ on Windows
"Code" means checked by reading the code, not by running it in Premiere.
- **Media Encoder analysis copies:** passed in Premiere after the frame fix above. The rename retries if the file is held → #5.
- **Overnight keeps the PC awake:** code (hidden PowerShell `SetThreadExecutionState`). Overnight itself passed in Premiere.
- **Documents in OneDrive:** code. Long paths there → #9.
- **File names with spaces or non-English letters:** code. An accented *user folder* may break QE frame export → #8.
- **LUT folders:** passed (unit test).
- **Premiere's transcripts read from a saved project:** passed in Premiere (22b) after #4.
- **Story travelling with the project (Mac ↔ PC):** passed in Premiere (22l). Not tried with a project made on the Mac.
- **125 % / 150 % scaling, light theme, uninstalling:** not tried.

## New in 1.3.2: Render ranges (Deliver) – the user's request
Adjustment layers on a **Renders** track above the edit; each is rendered by Media Encoder under its own name, one after another, with the chosen preset.
- **Unit tests** (fake Premiere): placing, the Renders track (any case), only that track counts (a grading layer or Story's theme layers on the top track are never exported), file names (switched-off/empty left out, duplicates numbered, Premiere's default layer names in several languages), In/Out put back (both, none, only an Out), presets found in Media Encoder's and Premiere's folders.
- **In Premiere (33b):** passed with a real adjustment layer and with the invisible-clip fallback. Two ranges → `E2E Range Hook.mp4` 2.03 s and `E2E Range Teaser.mp4` 4.03 s (across a cut), 1920×1080. Media Encoder takes each range when it's queued, so changing In/Out between jobs works. The editor's In/Out (0.5–7 s) came back exactly.
- **The tab** lists the ranges, finds the user's own Media Encoder presets, and has *Start rendering straight away* and *Replace earlier renders*. Screenshot: `dev/screenshots/windows-render-ranges.png`.
- **Not tried in Premiere:** *Start rendering straight away* off (queue only), *Replace earlier renders* on, a custom `.epr` that writes `.mov`.
- **Independent review:** 5 findings, all fixed (grading layers exported, a lone In or Out, restoring In/Out, duplicate file names, the Renders track added twice).

## Mac compatibility of 1.3.2
Built on Windows with `dev/win/build.js` (same steps and checks as `dev/build.sh`). The zip has the same 59 files as the Mac-built 1.3.1, `Install on Mac.command` / `Uninstall on Mac.command` keep their executable bit (Unix mode 755) and LF line endings, and every entry's checksum is right. **Not run on a Mac.** Run the Mac e2e suite before relying on it there.

## Still open
1. #8–#11 (accented user folders, long OneDrive paths, ANSI/UTF-16BE transcripts, corporate HTTPS).
2. Hand checks: 125 %/150 % scaling, light theme, uninstalling.
3. A full e2e run on the Mac with 1.3.2.
