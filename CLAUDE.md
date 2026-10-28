# JMG Ultra Studio – notes for Claude

A panel for Premiere Pro (CEP) and DaVinci Resolve Studio (Workflow Integration plugin), on Mac and Windows. How the code fits together and the house rules: `dev/CONVENTIONS.md`. The Resolve version: `dev/RESOLVE.md`. History and decisions: `dev/WEEKEND.md`.

## All versions move together (the user asked for this, 28 Oct 2026)
Every change lands in **all versions at once**: Premiere on Mac and Windows, and Resolve on Mac and Windows. One
panel (`index.html`, `js/`, `css/`), one version number (`CSXS/manifest.xml`), two packages per release
(`dev/build.sh` or `node dev/win/build.js` for Premiere, `node dev/resolve/build.js` for Resolve), and the GitHub
Release attaches both zips. A change to a Premiere command (`jsx/`) needs the same change in `resolve/host/`, and the
other way round; Home › Check my setup lists any tool whose commands are missing.

## GitHub is the shared copy – keep it in step (the user asked for this)
The repository is private on GitHub and the user works on both a Mac and a PC.
- **Before starting work:** get the latest – `git pull --rebase` (or tell the user to Fetch/Pull in GitHub Desktop if there are no command-line credentials).
- **After every change you make:** commit with a plain message and push, so the other computer can pull it. Don't leave work only on one computer.
- **When a version is built and installed** (`dev/monday.sh` on the Mac): commit, tag it `v<version>`, push the tag, and publish a GitHub Release with `dist/JMG-Ultra-Studio-<version>.zip` and `dist/JMG-Ultra-Studio-Resolve-<version>.zip` attached.
- Repository: https://github.com/argaerghe34/JMG-Ultra-Studio (private). On the Mac the GitHub CLI is at `~/.local/bin/gh` (not on PATH by default), logged in as argaerghe34; git uses it for credentials. On the PC, install Git and the GitHub CLI and log in once (`gh auth login --web`, then `gh auth setup-git`).
- **Mac and PC talk through GitHub.** On the PC, testing follows `dev/WINDOWS-TESTING.md`: problems become issues
  labelled `windows` + `from-pc`, fixes come as a pull request from a branch (not straight to `main`), and the results
  go in `dev/WINDOWS-REPORT.md`. On the Mac, at the start of work check `gh issue list --label from-pc` and
  `gh pr list`, test any PC pull request here before merging, and answer on the issue. Issues found on the Mac that
  need checking on Windows get `windows` + `from-mac`.
- Never commit API keys, `dist/`, `node_modules`, the test project's generated files, or the large test clips listed in `.gitignore`.

## Rules that always apply
- Never open or save the user's real Premiere projects – only the test project in `dev/test-project`, or temporary copies. In Resolve, only the project "JMG Ultra Studio Test".
- Footage stays on the computer: AI features only ever receive text (transcript lines, requests) – never frames, stills, video or audio.
- Don't drive Premiere while the user is using it; ask first. Quit Premiere and Media Encoder by exact process id, never by name pattern.
- The development panel shares settings with the user's installed copy: leave them as you found them.

## Resolve: developing and testing
- **Ask before driving Resolve** (opening, quitting or controlling it) – the user may be working in it. Never quit it
  by name; the installers only ask the person to quit.
- **Only the test project "JMG Ultra Studio Test".** Resolve keeps every project in its database, so never open, change
  or save the user's own Resolve projects. `node dev/e2e/run.js --resolve` refuses to run in any other project.
- Where things are: the shared panel in `js/`; Resolve's commands in `resolve/host/*.js` (same names and results as
  `jsx/`); the Electron shell in `resolve/plugin/`; packaging in `dev/resolve/` (`build.js`, `installer/`,
  `link-dev.sh` / `unlink-dev.sh`; Windows: `dev/win/link-dev-resolve.ps1` / `unlink-dev-resolve.ps1`).
  Unit tests against a stand-in Resolve: `dev/tests/resolve-*.test.js` with `dev/tests/resolve-fake.js`.
- The dev link (`dev/resolve/link-dev.sh`) turns on the DevTools port **8892**: `node dev/cep.js resolve js <file>`,
  `node dev/cep.js resolve call listFns`, `node dev/e2e/run.js --resolve [filter]`. Restart Resolve after linking.
- Installed plugin: `/Library/Application Support/Blackmagic Design/DaVinci Resolve/Workflow Integration Plugins/com.jmgphotography.ultrastudio`
  (Windows: `%PROGRAMDATA%\Blackmagic Design\DaVinci Resolve\Support\Workflow Integration Plugins\…`). Resolve's
  `WorkflowIntegration.node` is copied in by the installer from Resolve's Developer folder; it is never committed or
  shipped.
