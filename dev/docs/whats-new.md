## What's new in 1.3.4

- **Song Splitter lays adjustment layers above your edit.** On a sequence, **Adjustment layers above the edit** puts each song on a new **Songs** track as an adjustment layer numbered 1, 2, 3…, with the talk and applause too, colour-coded (songs green, talk blue, applause orange).
- **Render ranges from any layer track.** Deliver › Render ranges can take its ranges from the **Songs** track (or any track with adjustment layers), not only **Renders** – name the songs, then render them all in one go.
- **Render only one colour** – for example just the songs.
- **See and change your ranges in Ultra Studio:** each range is listed with its colour and times; go to it, rename it, change its start and end (or set it to your In and Out points), change its colour, or delete it.
- **The list keeps itself up to date** while you add, trim or rename layers in the Timeline.
- **A file-name ending** (such as *_1* or *_v2*) on every render and on the export pack.
- *Premiere first:* these arrive in DaVinci Resolve in its next update.

## What's new in 1.3.3

- **JMG Ultra Studio for DaVinci Resolve Studio.** The same panel now runs in DaVinci Resolve Studio (19.1 or later, Mac and Windows) from **Workspace › Workflow Integrations › JMG Ultra Studio**, with Story, Selects, B-roll, Silence Cut, Beats, Songs, Sound Check, Final Check, Safe Zones, Deliver and the Assistant. A few things work differently because of what Resolve lets add-ons do: see *Premiere and Resolve: what's different* in the guide.
- **Markers on the clips themselves.** **Settings › Markers** chooses where every tool puts its markers: on the sequence (as before), on the clips, or both.
- **Selects counts a slow pan as a pan**, not a push-in, when the camera also drifts slightly in or out.
- **Colour and Camera Switch are paused** for now (their screens are hidden; nothing is lost).

## What's new in 1.3.2

- **Render ranges (Deliver).** Mark each part of a sequence you want as its own file with an adjustment layer on a **Renders** track above your edit. **Add a render range** puts one there, between your In and Out points or for 10 seconds from the playhead. Then trim it and rename it in the Timeline. **Send the renders to Media Encoder** queues every range in timeline order, each file named after its layer, with the export preset you choose: Ultra Studio's built-in H.264 ones, or any preset you've saved in Media Encoder or Premiere. Switch a layer off to skip it. Effects you put on a layer show in that render only. Your In and Out points are left as they were.
- **Windows fixes from the first full test on a PC.** The big cache and temporary files now live in the local (not roaming) AppData folder. Saving settings tries again when Windows briefly locks a file. Story matches clips whatever the letter case of their path. The setlist spreadsheet opens cleanly in Excel. Safe Zones keeps a separate guide for each shade. Importing a file that's no longer on disk no longer stops Premiere answering. Selects reads your clips reliably even after Premiere has been busy for a while, instead of saying they couldn't be read, and it no longer misses a short whip pan or bump on computers whose fast playback skips frames. When one file is in several bins, Story stays with the clip its transcript belongs to.

## What's new in 1.3.1

- **Story travels with the project.** Story's transcripts, themes, narratives and speaker names are now also saved in a **JMG Ultra Studio** folder next to the project, so the same project opened on your Mac or your PC – from the same drive, or a copy of the folder – opens Story where you left it. Reading the transcripts again on the other computer keeps every theme and narrative. If Story was changed on both computers in between, it opens the newer one and offers the other, which is kept as a backup. **Settings › Story** switches it off.

## What's new in 1.3

- **Selects counts camera movement.** Every select names its move – *Pan left/right*, *Tilt up/down*, *Push-in*, *Pull-out*, *Static*, *Handheld* or a *reveal* – and how smooth it is. **Camera movement** sets how much smooth moves count (**Smooth moves count** by default, or **Moves first**), and **Smooth camera moves** finds them all.
- **Colour previews appear by themselves.** Rest the playhead on a shot and every look or LUT is shown on it – no “Preview on this frame”, no extra sequence. A big before/after viewer, ← → to step through, and a strip of the shots in your sequence. Premiere's looks are made ready once, then preview instantly.
- **Moments in colour.** **Build these moments** groups them by type, each in its own colour with a label on every clip (*Funny – laughter*); themes made from moments get the same colours. Both can be switched off.
- **▶ plays from the exact line** in Story (and Selects shows the exact moment), even when the clip takes a moment to load.

## What's new in 1.2

**Story is now the heart of Ultra Studio – step by step.** It opens first, and Home shows where your project is up to. Story runs in five steps, each with a **Next** button: **1 Interviews · 2 Themes · 3 Find · 4 Build · 5 Share**.
- **Choose what to work on:** all your interviews, some of them, or just the lines heard in a sequence such as your selects – only between its In and Out points if you like. Themes, Find and Moments then read only those lines.
- **Your themes and Story's in one pass:** type the themes you want and press **Find themes**. With AI, your lines are read once, not once per theme.
- **How picky** per theme (every useful line, balanced, or only the best), and **How much the AI reads**, from the best 600 lines up to everything. You see the cost before it runs.
- **Find** specific lines, **Find more** on a topic you haven't covered, and **Moments**: bloopers, funny and poignant moments, off-camera voices.
- **Build** a sequence from your themes in their **colours on the timeline**, the best lines marked or placed first, with an **adjustment layer named after each theme** above its clips – or bins by theme.
- **A narrative cut from a sentence:** *“Create a 60-second video about why people volunteer”* builds a Hook / Build / Payoff cut from your interviews – and **Make it a promo** adds B-roll, captions and a vertical version in one go.
- **Highlights in your string-outs:** your selects are marked in theme colours on a **Selects** track above each interview, with how much of each interview you've used.
- **Share:** an **interview log** (each interview's themes, strongest lines and moments with timecodes, a short AI summary of each, and the full transcripts if you want them) and a **paper edit** of your themes or your narrative, as Word or a spreadsheet.
- A **speaker-labelled transcript of any timeline**, from Premiere's own transcripts – and **captions** from it, timed to each word: subtitles, social (a few words at a time) or one word at a time.
- The post-it board is switched off for now: building, bins and the paper edit work straight from your themes.

**Selects works on any footage.** By default it keeps everything you could use as B-roll and leaves out only what's technically unusable – blurry or out of focus, far too dark or blown out, too shaky, a camera bump or a whip pan. Choosing a kind of footage (concert, interview, wedding…) is optional. It runs on a sequence as well as clips or a bin, sorts the selects into bins by type, and marks the best ones with a magenta ★. It can also save **full-size stills of the best frame** in each select. Footage the panel can't read directly (like your Lumix 10-bit .MOV files) is read through a quick copy made by Media Encoder.

**New: Colour.** Premiere's looks and your own LUTs previewed on your shot, quick grading, **automatic camera matching**, and **Log**: shows how Premiere reads each clip (your Lumix files are already recognised as V-Log and shown in normal colour) and sets the camera profile when it isn't.

**New: B-roll.** Covers the jump cuts in your interviews (or long talking heads) with the best moments from a bin of B-roll, on a copy of the sequence – picture only, so the interview carries on underneath.

**New: Camera Switch.** For interviews filmed on two or more cameras: cuts between the angles at the ends of sentences – alternating, or following whoever is speaking – on a copy, with the sound untouched. With only one camera it punches in on every other shot instead.

**New: Overnight prep** on Home: reads the transcripts, finds themes and moments, writes the interview log, and analyses all your footage for Selects while you're away, with a report in the morning.

**Final Check can check the whole project:** unused clips (tidied into a bin and back, never deleted), offline media and anything imported twice.

**Safe Zones:** a plain grey style with no text, and **letterboxing** to any shape (2.39:1, 1.85:1, 4:3…) without social guides.

**Sound Check can fix the loudness:** one press makes a copy at −14 LUFS (or podcast/broadcast) and measures it again. It can also **duck the music under speech** on a copy.

**AI costs up front:** choose Claude Opus, Sonnet or Haiku, see this month's spending, set a monthly limit, and get asked before anything costs more than 25¢. Typical costs for your projects are in the guide.

**Fixed:** your Lumix .MOV files (now read through a quick Media Encoder copy, and the setup check says so), the Gemini key test, Story's AI stopping when Gemini was busy (Google's quicker model now answers instead), the sound check timing, and a Selects run that couldn't be stopped.
