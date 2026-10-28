# Windows report – JMG Ultra Studio 1.3.1

**Date:** 27–28 Oct 2026 · **By:** Claude on the PC, following `dev/WINDOWS-TESTING.md`
**PC:** Windows 11 Pro 10.0.26200 · Premiere Pro **26.5.2** (same as the Mac) · Media Encoder 2026 · 2 screens, **100 %** scaling (96 dpi)
**Tested:** `main` @ `c2ddc14` (1.3.1) and the `v1.3.1` release zip. Fixes: branch `windows-fixes`.
**Issues:** #1–#11 (labels `windows` + `from-pc`).

## Phase 0 – set up
- **Git 2.56, GitHub CLI 2.103, Node 24.22 LTS:** installed via winget. The user asked for this before going away overnight.
- **GitHub login:** passed (`gh auth login --web`, `gh auth setup-git`).
- **Clone:** passed on the second try. The first clone, into the ~190-character session folder, silently left out 356 files because of Windows' 260-character path limit. A short folder worked → #7, and the docs are updated.
- **`dev` npm install:** passed.

## Phase A – without Premiere
- **`node dev/tests/run.js`:** passed after test fixes. Before: 230 passed, 1 failed (`colour-ui` picked a real LUT installed on the PC) → #1. After: **234 passed, 0 failed**, including 3 new tests.
- **Test isolation:** failed, now fixed. The tests wrote into the user's real `%APPDATA%\JMG Ultra Studio`, because only `HOME` was redirected → #1. After the fix the real profile stays untouched.
- **`node dev/tests/ui-smoke.js`:** passed.
- **`node dev/tests/colour-ui.js`:** passed after the fix → #1.
- **`node dev/check-jsx.js`:** passed ("All scripts parse").
- **Panel boot in jsdom with a mocked `__adobe_cep__`, Windows paths:** passed (1.3.0). Boots to Home, all 15 tools and 37 actions register, and every tool screen opens.
- **Windows code review** (paths, file locks, CRLF, Mac-only assumptions): 6 problems fixed (#1–#6) and 4 left open to check (#8–#11). Nothing throws at load time.

## Phase B – install like the user
- **`Install on Windows.bat`, fresh 1.3.0:** passed. Exit code 0, all 58 files identical (hash check), no `.previous` left behind.
- **`Install on Windows.bat`, 1.3.1 over 1.3.0** (from `gh release download`): passed. Exit code 0, all 59 files identical, and the version now reads 1.3.1. SmartScreen didn't appear (run from a script).
- **Window › Extensions › JMG Ultra Studio, then Check my setup:** **not tried.** The user was away, and I can't click in Premiere.
- **Story, Selects, Colour previews, Sound Check and Safe Zones by hand:** **not tried** (same reason).

## Phase C – automated Premiere tests
- **`dev/win/link-dev.ps1`, `unlink-dev.ps1`, `restart-premiere.ps1`:** written, **not yet run**. Running link-dev was blocked by Claude's safety check, because it rewrites the CSXS `PlayerDebugMode` registry switch and was run with `-ExecutionPolicy Bypass`. The user needs to run it, or allow it.
- **Windows test project (`dev/test-project-win/`):** **not made yet**. It needs Premiere.
- **`node dev/e2e/run.js`:** **not tried.**

## Phase D – most likely to differ on Windows
"Code" means checked by reading the code, not by running it in Premiere.
- **Media Encoder analysis copies:** code. The rename now retries if the file is held → #5.
- **Overnight keeps the PC awake:** code. A hidden PowerShell calls `SetThreadExecutionState`; looks right.
- **Documents in OneDrive:** code. The Documents folder comes from `Folder.myDocuments.fsName`; looks right. Long paths there → #9.
- **File names with spaces or non-English letters:** code. Names are cleaned of `\/:*?"<>|`. An accented *user folder* may break QE frame export → #8.
- **Open / Show in Explorer buttons:** code. They use `explorer` / `start ""` with quoted paths; looks right.
- **Stills export:** code → #5 and #8.
- **LUT folders:** passed in a unit test. `%APPDATA%\Adobe\Common\LUTs` and `C:\Program Files\Adobe\Common\LUTs` are both read; this PC has LUTs in the second.
- **Premiere's transcripts read from a saved project:** code → #4 (path case and slashes).
- **Installing over an older version:** passed (see Phase B). **Uninstalling:** not tried.
- **Story travelling with the project (Mac ↔ PC):** passed in unit tests (`story-sync`). With Premiere: **not tried**, because there's no Mac-used project on this PC yet.
- **125 % / 150 % display scaling:** not tried (this PC runs at 100 %).
- **Dark and light themes:** not tried.

## Fixed on `windows-fixes`
- **#1:** tests redirect `APPDATA` and `LOCALAPPDATA`. `colour-ui` writes its LUTs to the Windows folder and counts only its own.
- **#2:** cache and temp go in `%LOCALAPPDATA%\JMG Ultra Studio`. Settings, logs and projects stay in `%APPDATA%`.
- **#3:** Safe Zones names include `shadeNN`, and an existing guide PNG is never rewritten.
- **#4:** `US.pathKey` in the panel and `pathKey` in `story.jsx` match paths ignoring case and `/` vs `\` on Windows.
- **#5:** `US.fsx.renameRetry` is used by `writeJSON`, analysis copies and Selects stills.
- **#6:** setlist CSV has a BOM and CRLF, and long names keep their `.csv` / `.txt` extension.
- **#7:** `WINDOWS-TESTING.md` now says to clone into a short folder.

## Still to do on the PC (needs the user or Premiere)
1. Run `dev\win\link-dev.ps1`, then `dev\win\restart-premiere.ps1`. Make `dev/test-project-win/UltraStudioTest-win.prproj` and run `node dev/e2e/run.js` with `E2E_RETRY=1`. Then run `dev\win\unlink-dev.ps1`.
2. Check my setup, and the hand checks from Phase B.
3. #8–#11.
