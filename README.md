# JMG Ultra Studio

A panel for Adobe Premiere Pro (2025 and later, Mac and Windows) and DaVinci Resolve Studio (19.1 and later, Mac and Windows) that helps you go from footage and interviews to a finished edit: **Story** (themes, lines and narratives from interviews), **Selects**, **Colour**, **B-roll**, **Camera Switch**, **Silence Cut**, **Beats**, **Songs**, **Sound Check**, **Final Check**, **Safe Zones**, **Deliver** and an **Assistant**.

Both editors get every change at once: one panel, the same version number, two packages per release.

The guide is in [`dev/docs/`](dev/docs) (built into *Read me first.html* in every package). What's new: [`dev/docs/whats-new.md`](dev/docs/whats-new.md).

## Installing on a PC (or a Mac)

1. Open the **Releases** page of this repository (right-hand side on GitHub) and download the newest `JMG-Ultra-Studio-<version>.zip`.
2. Right-click the zip › **Extract All**.
3. Double-click **Install on Windows.bat** (on a Mac: **Install on Mac.command**). If Windows SmartScreen appears, click **More info › Run anyway**.
4. Open Premiere Pro › **Window › Extensions › JMG Ultra Studio**, then on Home press **Check my setup**.
5. Add your AI key again in Settings – keys are kept on each computer, never in this repository.

Your settings, analysis cache and logs live in `%APPDATA%\JMG Ultra Studio` (Windows) or `~/Library/Application Support/JMG Ultra Studio` (Mac). Story is also saved in a `JMG Ultra Studio` folder next to each project, so a project opened on the other computer (same drive, or a copy of the folder) opens Story where you left it.

## DaVinci Resolve Studio

The same panel runs in **DaVinci Resolve Studio** as a *Workflow Integration* plugin: the same tools and screens, in Resolve's words (timelines, the Media Pool, the render queue).

- **Needs DaVinci Resolve Studio 19.1 or later** (20 recommended), on a Mac or a PC. The free DaVinci Resolve can't run plugins.
- **Install:** download `JMG-Ultra-Studio-Resolve-<version>.zip` from Releases, unzip it, quit Resolve, then double-click **Install on Mac.command** or **Install on Windows.bat** (it may ask for your Mac password, or Windows may ask for permission: Resolve's plugin folder is shared by everyone on the computer). Then open Resolve › **Workspace › Workflow Integrations › JMG Ultra Studio**, and on Home press **Check my setup**.
- **Remove:** **Uninstall on Mac / Windows**. Settings, the analysis cache and logs are shared with the Premiere version (same folders as above).
- **What's different in Resolve:** the panel opens as its own window; Resolve's own transcripts can't be read by a plugin, so Story transcribes on this computer or reads transcript files; clip volume can't be set by a script, so Sound Check reports instead of fixing; renders go through Resolve's render queue with Resolve render presets; Resolve projects live in its database, not in files. Colour and Camera Switch are paused in both editors. The full list: [`dev/RESOLVE.md`](dev/RESOLVE.md).

## Working on the code on the PC

1. Install **Git** (or GitHub Desktop) and **Node.js**, then clone this repository – in GitHub Desktop: *File › Clone repository* › `JMG-Ultra-Studio`.
2. Open the folder in Claude Code (Claude desktop app › Code) and say *“Read dev/WINDOWS-TESTING.md and follow it.”* Claude tests the panel on the PC, writes Windows versions of the Mac-only development scripts, and reports back as GitHub issues, a pull request and `dev/WINDOWS-REPORT.md`.
3. Unit tests run anywhere: `cd dev && npm install && cd .. && node dev/tests/run.js`.
4. Packages: `node dev/win/build.js` (Premiere) and `node dev/resolve/build.js` (Resolve) – both work on the PC and the Mac.

Not in the repository: built packages (`dist/` – see Releases), `dev/node_modules`, the test project's generated files, and two large test clips (`dev/test-media/real/P1003525.MOV`, a real Lumix V-Log clip, and `dev/test-media/unreadable/C006_whip_pan_prores.mov`). Copy those two by hand if you need every Premiere test.

## Keeping the Mac and the PC in step

This repository is the shared copy. Before working on either computer, get the latest (*Fetch/Pull* in GitHub Desktop, or `git pull`); after a change, commit and push it. Each installed version is also published as a Release with its zip. How the code fits together: [`dev/CONVENTIONS.md`](dev/CONVENTIONS.md).
