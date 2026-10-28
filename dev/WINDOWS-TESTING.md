# Testing JMG Ultra Studio on Windows – instructions for Claude Code on the PC

**For the user:** on the PC, open this project in the Claude desktop app (Code) and say:
> *Read dev/WINDOWS-TESTING.md and follow it.*

**For Claude on the PC:** you are testing JMG Ultra Studio, a Premiere Pro panel built and tested so far only on a Mac
(by Claude on the user's Mac). Your job: find out what works and what doesn't on Windows, fix small, clear problems,
and report everything back through GitHub so the Mac side can pick it up. Read `CLAUDE.md` and `dev/CONVENTIONS.md`
first. Work through the phases in order and keep the user posted in plain words.

## Rules (always)
- **Never open or save the user's real Premiere projects.** Use only a test project made for this (Phase C).
- **Ask before using Premiere** – the user may be working in it. Quit Premiere only by its exact process id
  (`Stop-Process -Id <pid>`), never by name, and only after the user says their work is saved.
- **Footage stays on the computer.** Never upload video, frames, stills or audio anywhere (issues included).
  AI features only ever send text.
- **Never commit or paste API keys**, `dist/`, `node_modules`, or the user's own files.
- The development panel shares settings with the installed copy (`%APPDATA%\JMG Ultra Studio\settings.json`):
  leave them as you found them.

## Phase 0 – set up (once)
1. Check what's installed: `git --version`, `node --version` (Node 18 or later), `gh --version`. If something is
   missing, tell the user what to install (Git for Windows, Node.js LTS, GitHub CLI – all from their official sites)
   and wait; don't install software without asking.
2. GitHub login: `gh auth status`. If not logged in, run `gh auth login --web` (the user approves a one-time code in
   the browser), then `gh auth setup-git`.
3. Get the latest: `git pull`. The repository is https://github.com/argaerghe34/JMG-Ultra-Studio (private).
   Clone it into a **short** folder (e.g. `%TEMP%\jmgu` or `C:\src\JMG-Ultra-Studio`): a Claude session folder is
   ~190 characters deep, which pushes some files past Windows' 260-character limit and the clone silently comes out
   with hundreds of files missing (`git status` shows them as deleted). Or first: `git config --global core.longpaths true`.
4. `cd dev && npm install && cd ..` (development tools only).

## Phase A – without Premiere
- `node dev/tests/run.js` – all unit tests should pass (216 on the Mac at 1.3.0).
- `node dev/tests/ui-smoke.js` and `node dev/tests/colour-ui.js` – headless screen checks.
- Note anything that fails only on Windows (paths, line endings, case-sensitivity, `\` vs `/`).

## Phase B – install it the way the user will
1. `gh release download --repo argaerghe34/JMG-Ultra-Studio --pattern "*.zip" --dir %TEMP%\jmg-release` (latest).
2. Extract it and run **Install on Windows.bat** (ask the user to click through SmartScreen if it appears).
3. Ask the user to open Premiere, then **Window › Extensions › JMG Ultra Studio**, then **Home › Check my setup**,
   and to tell you (or screenshot) every row. Note the Premiere version, Windows version and display scaling.
4. Ask the user to try, on a **test project of their choosing (not a real one)**: Story › 1 Interviews › Read
   Premiere's transcripts; Selects on a few clips; Colour previews (rest the playhead on a shot); Sound Check;
   Safe Zones. Record what happens. The activity log (☰ in the panel) has details of any error.

## Phase C – the automated Premiere tests (needs Premiere to itself, ~10 minutes)
The Mac's development scripts (`dev/link-dev.sh`, `dev/restart-premiere.sh`, `dev/monday.sh`) are Mac-only. Write
Windows versions in `dev/win/` (PowerShell), modelled on the Mac ones:
- `dev/win/link-dev.ps1` – park the installed copy outside the extensions folder (two copies with the same id stop
  the panel opening), then make **junctions** (`New-Item -ItemType Junction`, no admin needed):
  `%APPDATA%\Adobe\CEP\extensions\JMGUltraStudio` → the repository, and `…\JMGUltraStudioDevHelper` → `dev\helper`.
  Set `HKCU\Software\Adobe\CSXS.<9–14>\PlayerDebugMode = 1` (the installer already does this).
- `dev/win/restart-premiere.ps1` – save the **test** project and quit Premiere (via the helper on port 8891, as the
  Mac script does; else `Stop-Process -Id` the exact pid), wait for ports 8890/8891 to free, start Premiere with the
  test project (find `Adobe Premiere Pro.exe` under `C:\Program Files\Adobe\Adobe Premiere Pro <year>\`), wait for
  port 8891, then open the panel (`node dev\cep.js 8891 js` with `return window.openPanel();`).
- A Windows test project: the Mac's `dev/test-project/UltraStudioTest.prproj` points at Mac file paths, so make a
  fresh one once – e.g. `dev/test-project-win/UltraStudioTest-win.prproj` (create it from Premiere, or via the helper:
  `app.newProject(path)`), and import `dev/test-media` into it as the tests need.
- `dev/with-premiere.sh` works in Git Bash (it's only a lock); or write `with-premiere.ps1`.
- Then run `node dev/e2e/run.js` (`set E2E_RETRY=1` first). Expected gaps: two large clips aren't in the repository
  (`dev/test-media/real/P1003525.MOV`, `dev/test-media/unreadable/C006_whip_pan_prores.mov`), so the Selects tests
  that use them may fail – say so rather than treating it as a Windows bug.
- Afterwards: quit Premiere, remove the junctions, put the parked installed copy back (or run the installer again),
  and check the user's settings are as they were.

## Phase D – things most likely to differ on Windows (check each)
Media Encoder analysis copies (Selects on HEVC/ProRes/10-bit), Overnight prep keeping the PC awake (PowerShell),
saving to Documents when it's in OneDrive, file names with spaces and non-English letters, Open / Show in Explorer
buttons, Stills export, LUT folders (`%APPDATA%\Adobe\Common\LUTs`), Premiere's transcripts read from a saved project,
installing over an older version and uninstalling, **Story travelling with the project** (open a project the Mac has used Story on – from the same drive or a copy of its folder – and check Home shows its interviews and themes; then press Read Premiere's transcripts and check the themes keep their lines), the panel at 125% / 150% display scaling, and dark/light themes.

## Phase E – DaVinci Resolve Studio on Windows (if the PC has Resolve Studio 19.1 or later)
The same panel runs in Resolve as a Workflow Integration plugin (`dev/RESOLVE.md`). The free DaVinci Resolve can't
run plugins – if that's what the PC has, note it and skip this phase.
- **Ask before using Resolve**, and use **only a test project called "JMG Ultra Studio Test"** (create it in Resolve's
  Project Manager, import `dev\test-media` into it). Never open or change the user's own Resolve projects – they all
  live in Resolve's database.
1. `node dev\resolve\build.js` – checks, unit tests and `dist\JMG-Ultra-Studio-Resolve-<version>.zip`.
2. Install it the way the user will: unzip, quit Resolve, run **Install on Windows.bat** (Windows asks for permission:
   Resolve's plugin folder is in `%PROGRAMDATA%`). Expected: the plugin in
   `%PROGRAMDATA%\Blackmagic Design\DaVinci Resolve\Support\Workflow Integration Plugins\com.jmgphotography.ultrastudio`,
   with `WorkflowIntegration.node` copied in from Resolve's Developer folder.
3. Ask the user to open Resolve, then **Workspace › Workflow Integrations › JMG Ultra Studio**, then **Home › Check my
   setup**, and to read you every row (Resolve version, plugin version, "All … Resolve commands loaded" or the tools
   with missing commands).
4. Automated tests: quit Resolve, `powershell -ExecutionPolicy Bypass -File dev\win\link-dev-resolve.ps1` (run
   PowerShell as administrator if it says the folder can't be written; it parks the installed copy and turns on the
   DevTools port 8892), start Resolve with the test project, open the panel, then `node dev\cep.js resolve call listFns`
   and `node dev\e2e\run.js --resolve` (it refuses to run in any other project). Afterwards quit Resolve and run
   `dev\win\unlink-dev-resolve.ps1` (puts the installed copy back).
5. Check what is most likely to differ on Windows: file dialogs (Choose file…), Open / Show in Explorer, renders through
   Resolve's render queue to paths with spaces, sound analysis (a short audio render), installing over an older version,
   **Uninstall on Windows.bat**, and the panel window at 125% / 150% display scaling.
- Report Resolve problems the same way (issues labelled `windows`, `from-pc` and `resolve`), and give them their own
  section in `dev/WINDOWS-REPORT.md`.

## Reporting back (this is how the Mac side hears about it)
1. **A report file:** write `dev/WINDOWS-REPORT.md` – date, Windows + Premiere versions, display scaling, and for
   every check above: passed / failed / not tried, with one plain line each.
2. **One GitHub issue per problem:**
   `gh issue create --repo argaerghe34/JMG-Ultra-Studio --label windows --label from-pc --title "<short, plain>" --body "<steps · expected · what happened · error text from the activity log · Windows/Premiere version>"`
   No screenshots of the user's footage; panel screenshots are fine.
3. **Fixes:** small, clear fixes go on a branch, not `main`, so the Mac can test them before they're merged:
   `git switch -c windows-fixes` → commit (plain message, ending with the Co-Authored-By line from CLAUDE.md) →
   `git push -u origin windows-fixes` → `gh pr create --fill --label windows --label from-pc`. Mention the issue
   numbers it fixes (`Fixes #12`). The new `dev/win/` scripts and `dev/WINDOWS-REPORT.md` go in the same pull request.
4. **If Remote Control is on for both sessions** (the user's Mac and PC Claude sessions), also send the Mac session a
   short message with the issue and pull request numbers (list sessions, then message the one in the
   *JMG Ultra Studio* project on the Mac). GitHub stays the record either way.
5. Tell the user in plain words what works, what doesn't, and what you fixed – and that the Mac side will test and
   merge the fixes.
