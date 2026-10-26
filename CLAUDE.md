# JMG Ultra Studio – notes for Claude

A Premiere Pro CEP panel (Mac and Windows). How the code fits together and the house rules: `dev/CONVENTIONS.md`. History and decisions: `dev/WEEKEND.md`.

## GitHub is the shared copy – keep it in step (the user asked for this)
The repository is private on GitHub and the user works on both a Mac and a PC.
- **Before starting work:** get the latest – `git pull --rebase` (or tell the user to Fetch/Pull in GitHub Desktop if there are no command-line credentials).
- **After every change you make:** commit with a plain message and push, so the other computer can pull it. Don't leave work only on one computer.
- **When a version is built and installed** (`dev/monday.sh` on the Mac): commit, tag it `v<version>`, push the tag, and publish a GitHub Release with `dist/JMG-Ultra-Studio-<version>.zip` attached.
- Repository: https://github.com/argaerghe34/JMG-Ultra-Studio (private). On the Mac the GitHub CLI is at `~/.local/bin/gh` (not on PATH by default), logged in as argaerghe34; git uses it for credentials. On the PC, install Git and the GitHub CLI and log in once (`gh auth login --web`, then `gh auth setup-git`).
- **Mac and PC talk through GitHub.** On the PC, testing follows `dev/WINDOWS-TESTING.md`: problems become issues
  labelled `windows` + `from-pc`, fixes come as a pull request from a branch (not straight to `main`), and the results
  go in `dev/WINDOWS-REPORT.md`. On the Mac, at the start of work check `gh issue list --label from-pc` and
  `gh pr list`, test any PC pull request here before merging, and answer on the issue. Issues found on the Mac that
  need checking on Windows get `windows` + `from-mac`.
- Never commit API keys, `dist/`, `node_modules`, the test project's generated files, or the large test clips listed in `.gitignore`.

## Rules that always apply
- Never open or save the user's real Premiere projects – only the test project in `dev/test-project`, or temporary copies.
- Footage stays on the computer: AI features only ever receive text (transcript lines, requests) – never frames, stills, video or audio.
- Don't drive Premiere while the user is using it; ask first. Quit Premiere and Media Encoder by exact process id, never by name pattern.
- The development panel shares settings with the user's installed copy: leave them as you found them.
