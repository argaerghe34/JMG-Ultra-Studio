# Research: Synq (Rhys Obasi) and how we built Auto Sync

19 Nov 2026. The user sent https://rhysobasi.store/products/synq and asked: "research how this works and add it to
the advanced tab". This note says what Synq does (with sources), what comparable tools do, and what we built –
**Auto Sync**, in Advanced. Auto Sync was inspired by Synq's idea (one press, a synced timeline, a report of what
couldn't be placed); the code, name, wording, look and settings are our own. Nothing of theirs was copied, and we have
not seen their code or run their panel.

## What could and couldn't be read

- The product page opened and was read in full, including the five FAQ answers (they are in the page).
- The page's "Customise your sequence" walk-through is an animation; only its first step gave up its text.
- **The demo video (3 min 20 s, `/demos/synq-demo.mp4`) was gone through frame by frame afterwards** (the user asked):
  its burned-in captions were read and its screens enlarged. What it shows is in "What the demo video shows" below,
  and it corrects two things the first version of this note got wrong (marked there).
- A web search found **no independent coverage**: no review, tutorial, forum thread or social post about Synq. The
  store has no documentation or changelog pages. Everything about Synq below is the seller's own description.

## What Synq is (seller's page)

Source for this section: https://rhysobasi.store/products/synq

- A panel for **Premiere Pro only** ("Works in Premiere Pro 2025 or later · Mac & Windows"). £49.99 once, 7-day
  money-back, two machines per editor, studio licences by enquiry. "Trusted by 730+".
- One line: "One-click audio or timecode syncing in Premiere Pro."
- Workflow, as shown: (1) drop the footage on a timeline – cameras and microphones, 18 clips in the illustration, each
  camera's clips on a video track, microphones on audio tracks; (2) press the button; (3) the clips move to where they
  belong on that timeline. A quoted user: it "literally stays on the timeline".
- "Customise your sequence": "Choose your track order, colours and audio. Create a multicam sequence if you need one."
  Three groups of settings – Tracks, Audio, Multicam.
- FAQ: no timecode needed – it "can match the sound recorded by your cameras and microphones"; with matching timecode
  it can use that; on mixed shoots it lines up the timecoded clips first and matches the rest by sound; it does not
  use Premiere's Synchronize command.
- FAQ: clips it "can't confidently place are kept at the end of the timeline, and the report explains why". Sound
  matching needs sound the recordings share; silent clips or ones with nothing in common need timecode or placing by
  hand.
- FAQ: multicam is optional – edit on the synced timeline, or "choose Create Multicam from the report".
- FAQ: syncing needs Premiere 2025+; track colours and Create Multicam need Premiere 2026.
- History (seller's pages): Synq is the renamed, rebuilt "Spread+" (https://rhysobasi.store/products/spread-plus).
  The free sibling "Spread" puts each clip on its own track, opens Premiere's own Synchronize, then re-stacks
  (https://rhysobasi.store/products/spread).

## What the demo video shows

Source: the video on the product page, captions and screens. Times are in the video.

- **0:00** Synq "replaces the much beloved" Spread+. The panel is a docked tab with one big button (the logo).
- **0:13** The test: a sequence with "about 3.5 hours" of footage – camera clips on one video track, microphone
  clips on audio tracks, nothing lined up. One press, a short "Importing" bar, then the report: **27 clips synced,
  3.2 s, 1 didn't sync** ("Show list").
- **0:30 The report is also the control panel** ("real time controls over our sequence"):
  - *Settings for this sequence* – five drop-downs: **Camera audio** (Keep / Mute "keep it, but switched off" /
    Delete "remove it from the edit" – changed back and forth in the video, the timeline following each time),
    **Unused audio** (shown: Parked), **Trim audio** (shown: To video), **Link groups** (shown: Standard),
    **Track layout** (shown: Per device); and a box "Use these settings from now on". What the last four do isn't
    said or shown.
  - *Sequences*: **Synced | Original** switch, **Duplicate Sequence**, **Create Multicam**.
  - *Track order · top first*: one row per camera or recorder (first clip's name and a count), with a **colour** dot
    (a palette pops up), **Nudge** ‹ › arrows, a **Tracks** drop-down ("V3 + A3", "A4"…) and a link icon. Changing a
    colour or a track changes the timeline at once.
  - "More info", "Report a problem", "Done".
- **1:02 Create Multicam** makes a multi-camera source sequence ("Test – multicam") from the synced one; the button
  then reads "Open multicam". The presenter says he doesn't edit that way himself.
- **1:28** The panel's button looks different while a sequence it has already synced is open – press it to get the
  report back and keep changing things.
- **1:51 Why it is fast:** "Synq essentially listens to your project audio in the background whilst you have the
  panel open, so that when it comes time to press the button, most of the heavy lifting has already been done." A thin
  grey bar at the bottom of the panel shows it working. New footage is imported, the bar runs, and "roughly an hour
  and a half worth of audio" then syncs in 1.6 s.
- **2:36 Settings** (Settings | License): the same five drop-downs as defaults, then *Sound*: **Analyze sound
  automatically** (a switch – "I would recommend leaving this on"), **Saved analysis – 161 MB – Clear**, **Analysis
  folder – Default – Choose** ("It makes its own folder, Synq Saved Analysis, inside the one you choose").
- **2:51 Timecode:** pressing the button on timecoded footage brings up "Your footage has timecode. 4 cameras and
  3 recorders:" with each device's name and its span of the day ("GH 17:05 to 17:17" …) and the question "Line it up
  by timecode or by audio?" – two buttons. Result: 44 clips, 5.6 s, 0 didn't sync.

**Corrections to the first version of this note:**
1. Synq does *not* simply rearrange your timeline and leave you without the original: the report has a
   Synced | Original switch, and the project shows a "Synq Backups" bin. So "works on a copy" is not a difference.
2. Its settings are now known (above) – more than "track order, colours and audio" suggested.

What people say: only the six testimonials on the seller's page (wedding, event and documentary editors; the theme is
"hundreds of mic clips and multiple cams without ever leaving Premiere"). **No complaints could be found anywhere** –
which says there is little written about it, not that there are none.

Not known: how it treats drift on long recordings, its speed, what the report looks like, its version history.

## Comparable tools (why the design is what it is)

| Tool | Takes | Gives | Known weak points | Source |
|---|---|---|---|---|
| Premiere › Synchronize | selected timeline clips, one per track | clips moved on the timeline | greyed out unless clips are on separate tracks; users report only two clips at a time | Adobe community threads [1][2] |
| Premiere › Create Multi-Camera Source Sequence | bin clips | a multicam source; by timecode, sound or In point | failures give a "could not synchronize" warning; sound matching "slower and more prone to error" | frame.io guide [3] |
| Premiere › Merge Clips | one video + audio | a new merged clip | loses the audio's own metadata | [3] |
| PluralEyes (Red Giant/Maxon) | a project or loose media, outside the editor | a synced timeline via XML; corrected drift | in "limited maintenance mode" since 1 Feb 2023; breaks after system updates; duplicates on round trip | Maxon [4], ProVideo Coalition [5] |
| Syncaila | XML/AAF, outside the editor | synced XML; many cameras, hours of footage | not a panel; duplicates on re-import | [5] |
| Resolve › Auto Sync Audio / Auto Align Clips | Media Pool clips / timeline clips | synced clips; by waveform or timecode | waveform sync sometimes fails quietly | [6] |
| Final Cut › Synchronize Clips | browser clips | a compound or multicam clip | long processing | Apple [7] |
| Tentacle Sync Studio | timecode (file or recorded on a sound channel) | XML/AAF, multicam | Mac only; needs their timecode workflow | [8] |
| Syncitol (free, open source) | an unsorted sequence | a new "-SYNC" sequence; drift flagged, not fixed; result card: synced / check / unsynced | Premiere 26+ only | [9] |

[1] https://community.adobe.com/questions-729/synchronize-option-greyed-out-when-selecting-multiple-clips-in-premiere-pro-1621760
[2] https://community.adobe.com/questions-729/when-i-go-to-sync-clips-in-premiere-pro-it-will-only-sync-two-clips-it-won-t-sync-multiple-clips-at-once-like-syncaila-does-if-this-could-be-fixed-it-would-be-a-game-changer-i-am-working-with-a-mac-1624183
[3] https://blog.frame.io/2023/04/10/editors-guide-syncing-premiere-pro-projects/
[4] https://support.maxon.net/hc/en-us/articles/7389361453340
[5] https://www.provideocoalition.com/sync-shootout-pluraleyes-vs-syncaila/
[6] https://jayaretv.com/edit/auto-sync-audio-and-video-in-davinci-resolve-using-waveforms/ , https://forum.blackmagicdesign.com/viewtopic.php?p=585467
[7] https://support.apple.com/guide/final-cut-pro/verc1fabc30/mac
[8] https://tentaclesync.com/sync-studio
[9] https://thinkvp.com.au/blog/syncitol-free-multicam-sync-plugin-for-premiere-pro/

Several rows come from search summaries, not opened pages (Adobe's own help pages refused automated reading). Treat
the table as orientation, not as checked fact.

The usual method: compare the recordings' sound by cross-correlation and take the best lag; with many recordings,
solve them together rather than pair by pair; measure drift by repeating the comparison along the recording
(MathWorks on GCC-PHAT https://www.mathworks.com/help/phased/ref/gccphat.html ; Google, "Temporal synchronization of
multiple audio signals" https://research.google/pubs/temporal-synchronization-of-multiple-audio-signals/ ; Ellis,
skewview https://www.ee.columbia.edu/~dpwe/LabROSA/projects/skewview/).

Lessons taken: stay inside the editor; many clips at once (the built-in command's main complaint); never fail
quietly – say per clip how it was placed and why not; flag drift; don't make a multicam compulsory.

## What the app already had

Nothing lined clips up. Camera Switch, Podcast and Story's multicam all *start* from angles that are already synced
(Camera Switch's help sent people to Premiere's Synchronize). The pieces Auto Sync reuses:

- `US.audio.fileAudio` / `US.audio.forItem` – a clip's sound as 16 kHz mono (from the file where possible, so the
  editor isn't asked to render).
- `US.dsp.onsetStrength` (the Beat Cut engine) and `US.dsp.fft` – what the sound is compared with.
- `US.cache.cached` – each file is listened to once.
- `ui.sourcePicker`, `US.jobs`, `newSequence`, `addSequenceMarkers`, `muteTrack`, `openSequence`.

## What we built: Auto Sync (Advanced)

Files: `js/tools/48-autosync.js` (`US.autoSync`), `css/tools/autosync.css`, `jsx/tools/sync.jsx`,
`resolve/host/sync.js`, tests `dev/tests/autosync.test.js`, `autosync-ui.js`, `autosyncjsx.test.js`,
`resolve-sync.test.js`, e2e `dev/e2e/60-autosync.e2e.js`.

1. **Works on** selected clips, a bin, or a sequence the footage was dropped on.
   - Clips or a bin: sorted into cameras and recorders by the folder the files are in (one card = one folder), else by
     how the files are named.
   - A sequence: each track is one camera or recorder; trims are kept.
2. **Match by** sound, timecode, or timecode first and sound for the rest.
3. Each clip is listened to once (a small fingerprint of where sounds start, 100 per second, kept in the cache). The
   longest clip starts a group; every other clip is compared with everything placed so far, and joins when the match
   is clear. Clips that match nothing in a group start their own group (another take, another scene).
   A match must be far above chance and stand out from the next best place – by 1.45 times, or (music repeats, so
   the next bar scores nearly as well) by a wide statistical margin. Measured: 150 pairs of unrelated made-up
   recordings gave no match; a steady beat that fits everywhere is refused ("not sure enough"), not guessed; the test
   media's concert clip, trimmed to 30–90 s, landed at 30.00 s of `audio/concert_set.wav` (read with ffmpeg).
4. **A new sequence** – the user's sequence and clips are never changed: every camera on its own video track with its
   sound on the matching audio track, recorders below; groups one after another with a marker each; clips that
   couldn't be placed at the end after a "Not synced" marker.
5. **The report**: per clip, how it was placed (sound – how sure; timecode) or why not (no sound, nothing in common),
   and any drift measured between the start and the end of the overlap.
6. Options: camera sound kept / muted / left out; a colour per camera.

### How it differs from Synq

- Works in **Premiere and Resolve** (Synq: Premiere only), and Premiere versions before 2025 are not excluded by
  design.
- Both keep the original: we build a new sequence, Synq keeps an "Original" beside its "Synced" one.
- Can start from **clips in a bin** with no timeline at all.
- Unrelated takes become **separate synced groups** rather than a pile at the end.
- **No "Create Multicam" button.** Neither editor's scripting interface that this panel uses offers it as far as we
  know (not tested), so the result screen gives the three clicks to do it by hand. Synq does this from its report in
  Premiere 2026.
- Track order can't be rearranged in the panel: cameras by name from V1 up.
- Drift is measured and reported, not corrected (same as Syncitol; PluralEyes corrected it).

### What Synq has that Auto Sync doesn't (seen in the video; not built – for the user to choose)

1. **Listening ahead.** Synq analyses the project's sound while its panel is open, so the press takes seconds. Auto
   Sync listens when the button is pressed (each file once – a second run is quick). Listening ahead on its own would
   go against the house rule that the computer does nothing unasked, so it would have to be a switch that is off to
   start with, or a job for Overnight prep.
2. **Changing the result afterwards**: a camera's colour, which track it is on, a nudge left or right, camera sound
   kept / muted / deleted – each applied at once. Auto Sync's options are chosen before the press; changing one means
   pressing again.
3. **Asking "timecode or sound?"** when timecode is found, with each device's span of the day listed. Auto Sync has a
   three-way choice made beforehand and doesn't say what timecode it found.
4. **Create Multicam** as a button (ours: the clicks, in words).
5. **Time taken** in the result; "Duplicate Sequence".
6. "Unused audio: Parked", "Trim audio: To video", "Link groups", "Track layout" – can't be matched until it is known
   what they do.

### Not verified

Nothing here has run in real Premiere or Resolve – see the hand-over note and `dev/e2e/60-autosync.e2e.js`. The
riskiest parts: where Premiere puts the other half of a clip when one half is laid on a chosen track (the Premiere
command lays, removes what isn't wanted, checks and repairs – the method Story's `storyPlaceFromSequence` uses), and
reading a clip's start timecode in Premiere (`Column.Intrinsic.MediaStart`).
