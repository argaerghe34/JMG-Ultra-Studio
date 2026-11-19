# Ask – whole jobs (chains of tools)

What an editor types as one request, the chain of tools Ask (and Producer, on the same engine) runs for it, and how far
it gets by itself today. Written 19 Nov 2026 with the "works on its own" tools (`js/tools/40-assistant-agent.js`).

How a chain runs: the AI plans every step on its first turn; a plan of three or more steps is approved **once**
(Proceed with the plan · Step by step · Skip); risky steps still stop and warn (`US.chat.dangerOf`); each step's result
names what the next step needs (sequence, bin, folder, files, ids `f…` `b…` `s…` `c…` `l…`, time ranges – the `GIVES:`
line of a panel tool); a failed step gets one other way, then it stops and reports done / not done; everything is made on
copies, and Undo all takes back what can be taken back and says what can't.

Status: **alone** = runs start to finish without the editor doing anything but approving (unit-tested with a stand-in
AI, editor and web where marked ✔); **partly** = runs, with a gap named; **not** = can't yet, and why.

The starred ones are offered as "Try a whole job" chips in an empty chat (`US.recipes.CHAINS` in `js/tools/42-recipes.js`).

| # | Request | Chain | Status | Gap |
|---|---------|-------|--------|-----|
| 1 | ★ **Select reel from web B-roll** – "On a new sequence, make me a 30-second select reel of the best moments of big boats, with B-roll from YouTube" | `broll.search` → choose → `broll.download` (card to untick; warning when not free to use) into a folder named after the search and a bin → `wait` for the bin → `place` with `newSequence` and lengths adding to 30 s → `timeline` to check | **alone** ✔ (`zz-chat-agent.test.js`, `dev/e2e/40f`) | It chooses by title, length, size and licence – it can't see the thumbnails (US.understand has no route for a picture on the web). "Best moments" inside a downloaded clip need the footage described first (`footage.describe`, or `watch` when seeing-and-hearing is on). |
| 2 | ★ **Promo from the interviews** – "Make a 60-second promo from the interviews about why they came, then check it" | `interviews` (or `search` + `lines`) → `build` with `targetSeconds` → `timeline` → `action check.run` | **alone** (each part tested; the chain as a whole only with a stand-in) | Needs transcripts in Story. Music is not added (see 6). |
| 3 | ★ **Tighten and finish** – "Cut the silences, add lower thirds with each speaker's name the first time they talk, add safe zones and run Final Check" | `action silence.cut` (a copy, becomes the working sequence) → `edit` text on the lines heard, first per speaker → `action safezones.add` → `action check.run` | **alone** ✔ (chain with stand-in tools; a failed step and another way) | Lower thirds are plain text layers from the edit planner; mVFX's designed lower thirds aren't placed by name yet. Resolve can't make text layers from a script. |
| 4 | ★ **Cover the jump cuts** – "Cover the jump cuts in this sequence with B-roll from the bin B-roll" | `timeline` (cut times) → `find` bin → `place` over each cut on V2 (a copy) → `timeline` | **alone** ✔ | Which clip suits which line is by name and description only, unless the footage has been described. |
| 5 | B-roll for every theme, laid over the string-out | `themes` → `broll.search` one request per theme → `broll.download` into a bin per theme → `timeline` → `place` on V2 at each theme's lines | **alone** (same tools as 1 and 4) | As 1: can't see the pictures before downloading. |
| 6 | 60-second promo with B-roll over it and music cut to the beat | 2 → `place` B-roll on V2 → `place` music on A2 (`find` kind audio) → `action beats.markers` → `edit` razor/remove on the beats | **partly** | Music can be put under a cut and beats marked, but re-cutting picture to the beats afterwards is the AI's own planning with `edit` – not one tool. `beats.montage` builds a montage from clips, not from an existing cut. Song Splitter is paused. |
| 7 | ★ **Tidy what’s new** – "Find what's new in the project and put it in bins by subject" | `recent` → (optionally `footage`) → `makebin` × n → `move` | **alone** ✔ | Clips that were in no bin can't be put back to "no bin" by Undo (said plainly). |
| 8 | ★ **Bring in a folder** – "Bring the folder … into a bin called B-roll and tell me what's in it" | `files` → `import` → report | **alone** ✔ | Only Ultra Studio's own folders or one the editor typed in the chat. Imported clips aren't removed by Undo (no safe delete) – said plainly. |
| 9 | ★ **Check again later** – "Check in 30 minutes whether the download has finished, then bring the new files in" | `later` → finish → (the time comes) `files` → `import` | **alone** ✔ (clock run by hand; `dev/e2e/40f` with 1 second) | Caps: 6 follow-ups a chat, a day ahead, 15 steps and 30 minutes alone, the "costly step" spend cap; nothing risky runs without the editor. The panel must be open (or reopened – then it asks before running a late one). |
| 10 | "Download these links and make a sequence of them" | `download` (always warns: permission) → bin → `place` with `newSequence` | **alone** | Needs the Download tab's downloader set up. |
| 11 | ★ **Vertical cut with captions** – "Make a vertical version of this sequence with captions and check it" | `action safezones.add`/reframe (Deliver's vertical copy) → `action story.captions` → `action check.run` | **partly** | Captions and checks run headless; a true reframed vertical copy is Deliver's pack (`deliver.pack` – heavy, warns) rather than a quick copy. |
| 12 | "Three vertical versions with captions, 15, 30 and 60 seconds" | `action story.clips` (length short/standard/long) → captions each → check | **partly** | `story.clips` chooses its own moments; exact lengths are aimed for, not guaranteed. One vertical export per clip is heavy (warns). |
| 13 | "Find the best 10 moments, make selects, put a title on each" | `action story.moments` → `build` (10 lines) → `edit` text per clip → `timeline` | **alone** | Titles are plain text layers (see 3). |
| 14 | "Sync these cameras, cut the podcast between speakers, remove fillers" | `action autosync.sync` → `action podcast.switch` → `action silence.cut` (fillers) | **partly** | Podcast switching needs its mics set up once in the Podcast tab (which mic is who) – Ask says so instead of guessing. Camera Switch itself is paused. |
| 15 | "Build the narrative from this brief, cover the jump cuts with B-roll, add chapter markers and export the review pack" | `action story.narrative` → `action story.build` (narrative) → 4 → `action deliver.chapters` → `action deliver.pack` (warns: heavy, files) | **alone** up to the export; the export **waits for the editor's yes** | By design: exporting always warns. |
| 16 | "Overnight: describe all footage, find themes, build a first cut and leave me notes" | `later` (at a time) → `action footage.describe` (heavy → waits for the editor) … | **partly** | Unattended runs don't start heavy work (they pause for the editor). The right tool is Overnight prep (`overnight.run`), which Ask can start with the editor there; then `later` to read the result and call `notes`. |
| 17 | "Wait for the export, then tell me if the file is there" | `wait` for job → `files` | **alone** ✔ | Up to 30 minutes of waiting in one go; longer is `later`. |
| 18 | "Put the logo at the end of every sequence in the Shorts bin" | `edit` append with `sequences` (warns: changes those sequences themselves) | **alone** (was already so) | Undo takes the logo out again; other in-place edits can't be undone from the chat. |
| 19 | "Give me notes on the cut, then fix the first two" (Producer) | `notes` → `edit`/`build` → `timeline` | **alone** | The fixes are the AI's reading of its own notes. |
| 20 | "What's missing from the story? Plan the pick-up and put markers where it would go" (Producer) | `pickups` → `marknotes` | **alone** | – |
| 21 | "Organise this project into bins by kind of clip" | `bins` → `find` by kind → `makebin` → `move` (or `edit` move in the project) | **alone** ✔ | More than 150 clips at once warns first. |
| 22 | "Find every shot of the harbour and make a string-out" | `footage` (descriptions) → `place` with `newSequence` | **alone** when the footage is described; else it offers `footage.describe` first | Descriptions must exist. |
| 23 | "Make a rough cut, then a tighter version, keep both" | `build` → `version` → `action silence.cut` | **alone** | – |
| 24 | "Replace the music with something from the Music bin and duck it under speech" | `find` audio → `place` on A2 → (duck) | **partly** | Ducking is the Sound tool, which is paused; Ask sets a fixed volume with `edit` volume instead and says so. |
| 25 | "Colour-match the cameras and add a look" | – | **not** | Colour is paused (In development). Ask says so. |
| 26 | "Download B-roll, and pick the three best-looking shots by eye" | 1 → `footage.describe` / `watch` on what was downloaded → choose | **partly** | It can look after downloading (stills or the vision model, as the project allows), not before. |
| 27 | "Start at 6 pm: read the new interviews, find themes, build a string-out" | `later` at 18:00 → `action story.read` → `story.themes` → `story.build` | **alone** when none of the steps is risky; AI spend alone is capped at the "costly step" amount | Reading transcripts needs them made in the editor first (Premiere can't be asked to transcribe). |

## What was added to close gaps (19 Nov 2026)
- Tools run headless and return their result to the chat; a tool that would open its tab doesn't (the chat shows an "Open …" button instead).
- `broll.search`, `broll.download`, `download`; `bins`, `find`, `recent`, `files`, `makebin`, `move`, `import`; `place` (also a new sequence); `wait`; `later`.
- One approval for a whole plan; results that name what the next step needs (`GIVES:`).

## Gaps left
- Seeing web thumbnails before downloading (no picture-from-the-web route in US.understand).
- mVFX's designed titles and lower thirds by name; re-cutting an existing cut to the beat as one tool; anything in a paused tool (Colour, Camera Switch, the old B-roll matcher, Sound, Memory Box, Song Splitter).
- Removing imported clips on Undo (there is no safe delete of project items; Ask never deletes the editor's clips).
