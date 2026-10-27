# Plan – Story travels with the project (Mac ↔ PC)

Suggestion 1 from `dev/SUGGESTIONS.md`. Planned 27 Oct 2026. **Built as 1.3.1 the same day** (the user asked for smaller version steps: 1.3.1, not 1.4.0) – code in `js/tools/22-story-sync.js`, tests in `dev/tests/story-sync.test.js`. Not yet tested in Premiere.

## The goal
You open the same project on the Mac or the PC and Story is where you left it: transcripts, speaker names, themes,
narratives, moments, interview summaries and what you were working on. Nothing to export or import.

## How it works today (and why it doesn't travel)
- Story keeps everything in one file per project in Ultra Studio's own folder:
  `~/Library/Application Support/JMG Ultra Studio/projects/<hash of the project's path>-story.json`
  (on Windows, under `%APPDATA%`). On your real projects that file is about 2.3 MB.
- The name comes from the project's **full path**. On the PC the path is different (`D:\…` instead of
  `/Volumes/…`), so the PC looks for a different file and finds nothing.
- **Re-reading the transcripts would also break the themes.** Each transcript is keyed by its clip's full path,
  and every line's id starts with a hash of that path. On the PC the paths change, so the line ids change, and
  themes and narratives would point at lines that no longer exist.
- What already copes with new paths: finding the clip to build with. It matches Premiere's clip id first, then the
  file name (`22-story.js`, around line 563).

## What I'd build

**1. A Story file next to the project.**
- **Where:** `JMG Ultra Studio/<project name> – Story.json`, in the folder that holds the `.prproj`. This is the
  same idea as Safe Zones' *JMG Ultra Studio Guides* folder.
- **Moves with the project:** whether you copy the project folder, use a shared drive, or sync it with
  Dropbox/OneDrive, the Story file goes with it.
- **The local copy stays:** it's still kept as now, as a backup and for projects in folders that can't be written.
- **Saving:** Story saves to both. The file next to the project is written a few seconds after a change rather than
  instantly, so it doesn't make a cloud drive sync constantly, and again whenever the panel closes or the project is
  saved. Writes are atomic, as now, so a half-written file can't happen.
- **Contents:** the file records which computer saved it and when.

**2. Opening a project picks the right copy.**
- **Only one copy:** if there's only the local copy, or only the one next to the project, it's used.
- **Both copies, one changed:** the one changed since the two last matched is used. This is the normal case when
  you alternate machines.
- **Both copies changed** (you worked on both without the file syncing): Story asks, plainly, *"Story was changed
  on this computer and on the PC since you last opened it here. Use: the PC's (Tue 14:20) / this computer's
  (Tue 16:05)."* The other copy is kept as a backup file, so nothing is lost.
- **Dropbox/OneDrive conflicted copies** ("… (conflicted copy)") are noticed and handled the same way.

**3. Line ids that survive a new path.**
- **Matching transcripts:** when transcripts are read on the other computer, each one is matched to the transcript
  already in Story by Premiere's clip id, then by file name, then by name and duration. Path is not used. If it
  matches, the existing line ids are kept, by matching each new line to the old one by start time and words. A
  re-transcribed clip keeps whatever still matches, and Story says how many lines changed.
- **New transcripts** ~~get a line-id prefix that doesn't depend on the path~~ – dropped while building: the copy
  next to the project already carries the ids, and a name-based prefix would clash for two cards' *C0001.MP4*.
  Existing ids are never renamed, so current projects are untouched.
- **Paths:** transcripts store the path from whichever computer last read them. Building uses the clip id or file
  name anyway.

**4. Small extras.**
- **Settings › Story:** a switch, *Keep Story next to the project*, on by default, for anyone who doesn't want
  transcripts beside the project file.
- **Home's Story card:** shows *Story saved with the project* or, if that folder can't be written, *Story is kept on
  this computer only*.
- **Activity log:** records which copy was loaded and why.

**Not included (for now):**
- Selects' marker lists, Final Check and Deliver note markers. These use a separate, smaller per-project store, and
  can be moved the same way later if useful.
- Live editing by two people at once (that's *Shared Story for a team* in the longer-term list).
- Team Projects or Productions without a normal `.prproj` path. They fall back to the local copy, as now.

## Testing
- **Unit tests:** choosing the copy (only local, only beside, one newer, both changed, conflicted copy), and
  carrying line ids across a path change, a re-transcribed clip and a renamed file.
- **Unit test for paths:** Windows paths are checked with simulated paths, so it runs on the Mac too.
- **Premiere e2e on the Mac:** read transcripts, make themes, then copy the test project to a new folder (a
  temporary copy, never your real projects) and open it. Story must load with the themes intact. Then re-read the
  transcripts and check every theme line still resolves and Build still makes the same sequence.
- **Check the clip id:** confirm Premiere's clip id stays the same when the project is reopened from a new place.
  If it doesn't, file-name matching covers it, and the test proves that.
- **On the PC:** added to `dev/WINDOWS-TESTING.md`. Open a project that has been on the Mac and confirm Story is
  there. Its first real proof comes from your PC run.

## Effort and risks
- **Effort:** about 2–3 days, including tests. **Version:** 1.3.1.
- **Risk – a cloud drive syncs late:** the PC opens before the Mac's copy has arrived. The "both changed" question
  and the kept backup cover this. Story never silently overwrites.
- **Risk – transcripts next to the project are seen by anyone you share the folder with.** That's normally what you
  want; the switch turns it off.
- **Risk – existing projects:** the first time a project opens in 1.4, its current local Story is copied beside the
  project. Nothing is renamed or removed.

## Decided (27 Oct)
- **The same drive, on both computers.** You may work on different projects on each computer. When one project is
  edited on both, it lives on the same drive. That makes this the main case:
  - **The folder path differs:** the drive is `/Volumes/<name>` on the Mac and a drive letter (`E:\`) on the PC.
    The Story file is found relative to the project, and clips by Premiere's clip id or file name, so this doesn't
    matter.
  - **One computer at a time:** the drive is usually used by one computer at once, so "both changed" should be rare.
    The question and the backup stay as a safety net.
  - **Drives formatted for both (exFAT):** the Mac leaves hidden `._` files there. Story ignores them, and the Story
    file's name uses only characters Windows allows.
  - **Different projects on each computer:** each project has its own Story file, so they never mix.
- **Where it sits:** a `JMG Ultra Studio` folder next to the project (as suggested), unless you say otherwise.
