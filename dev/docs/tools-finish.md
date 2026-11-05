### Safe Zones – social guides and letterboxing

Two modes, chosen at the top:

**Social guides** show the **9:16, 4:5 and 1:1** crops and where **TikTok, Instagram Reels, YouTube Shorts and Facebook** put their buttons, captions and top bar, so titles and subtitles stay clear.
- Tick the crops and apps and check the preview (**Use current frame** shows it over your shot).
- **Look:** *Colours & labels* (red app areas, a green safe box, names) or **Plain grey** (just grey areas and thin lines, no colours or text).
- **Put guide on the sequence** adds it on a top track called **Guides** for the whole length. Nothing underneath moves; adding another replaces the old one.
- **Before exporting, press Hide for export.** Premiere can't show a clip but leave it out of an export, so the guide track gets switched off. Final Check and Deliver both catch it if you forget.

**Letterbox** adds bars to any picture shape (**2.39:1, 2:1, 1.85:1, 4:3, 1:1, 4:5, 9:16**) without any social guides:
- **Black bars** are part of your film: they go on their own top track called **Letterbox** and they export. Change the shape any time and the bars are replaced.
- **Grey guide** is a see-through framing preview that is hidden for export like the other guides.

**Save PNG pack** writes the guides as images (1080p, 4K, vertical) for any other editor. Guide images are kept in a “JMG Ultra Studio Guides” folder next to your project, so they move with it. App layouts are approximate and change from time to time.

### Final Check – before you export

Press **Check the cut** on the active sequence. It never changes anything; it lists:
- **Fix before export:** black gaps, flash frames (clips of 1–2 frames), offline media, a Safe Zones guide still showing.
- **Worth a look:** clips switched off, the same shot used twice, holes in the sound, open notes (red markers or markers starting “TODO”/“FIX”).
- **For info:** speed changes, locked tracks, and (if you set it) shots longer than a set length.

Click any line to jump the playhead there. **Add markers for these** marks them on the timeline; **Remove check markers** takes them off again.

**Check the project** lists clips that aren't used in any sequence, offline media (relink them with right-click › Link Media) and anything imported twice. **Move them into a bin “Unused”** tidies the unused clips away – nothing is deleted – and **Put them back** returns each one to where it was.

**Compare two versions** lists what changed between an older and a newer cut: shots added, removed, trimmed and moved, plus the change in length. It's handy after a round of client notes. It picks the previous version automatically when they're named like “Promo v2” / “Promo v3”.

### Deliver – every export in one go

**Export pack** – tick what you need and press **Export**:
- **Master** in the sequence's own shape (H.264, high quality).
- **Vertical 9:16, Square 1:1, Portrait 4:5**, made with Premiere's Auto Reframe as new sequences in *JMG Ultra Studio › Deliver* (so you can adjust the framing and re-export), at full platform size: 1080×1920, 1080×1080, 1080×1350 (or 2160 wide from a 4K edit).
- **Sound only** (WAV 48 kHz) and a **thumbnail** (the frame under the playhead).

Exports go through **Media Encoder**, and the status bar shows its real progress. Files land in *Documents › JMG Ultra Studio › Exports › <sequence and date>*, or a folder you choose. Earlier exports are never overwritten. Safe Zones guides are hidden automatically first.

**Render ranges** – several renders from one sequence, each a part you mark yourself:
0. **Ranges are**: **Adjustment layers** (as before), **Text layers**, or **Both**. A text layer shows its name in the Timeline; its length is the render and the words it shows become the file name. With **Text layers**, **Add a render range** adds a text layer from Premiere's Basic Title template. **Keep the text out of the renders** (on by default) switches the track off while the renders go to Media Encoder and on again afterwards, so the text isn't in the files – nor are effects on that track's adjustment layers. In Resolve, Text and Text+ titles count when they're on a video track named like the ranges (e.g. *Renders*); rename and move them in the Timeline.
1. Choose the **Track** whose adjustment layers are the ranges – the list shows every video track (*V3 · Renders · 4 layers*), and **New track on top for render ranges** adds an empty one above everything: **Renders** (made the first time you add a range), or any track that holds adjustment layers – for example **Songs**, where Song Splitter puts its songs.
2. Type a name and press **Add a render range**. An adjustment layer goes on that track, between your In and Out points (or for 10 seconds from the playhead), in the colour you pick next to the button. You can also put adjustment layers there yourself, from the Project panel.
3. Each range is listed with its colour, times and length. Click one to go there. **Rename** gives it (and its file) a name: *Teaser 30s* → *Teaser 30s.mp4*. **Times…** sets its start and end as the Timeline shows them, or to your In and Out points (type *In/Out*). **Colour** changes its colour, and **Delete** takes it off the timeline. You can still trim and rename layers in the Timeline: the list follows the Timeline by itself within a few seconds (**Refresh** does it at once).
4. **Colour**: render every range, or only the ranges of one colour – for example only the songs, not the talk and applause.
5. Pick the **Export settings**: the built-in H.264 presets, any preset you've saved in Media Encoder or in Premiere's Export screen, or **Choose a preset file…**. **Add to every file name** puts an ending on each file, such as *_1* or *_v2* (*Song 1_v2.mp4*); the export pack uses it too.
6. Press **Send the renders to Media Encoder**. Every range is queued in timeline order and rendered one after another, with progress in the status bar. Turn off **Start rendering straight away** to leave them waiting in Media Encoder's queue instead.

Switch a layer off (Enable, in its right-click menu) to skip it. An empty adjustment layer doesn't change the picture, but any effect you add to one shows in that render. Your own In and Out points are left as they were. If the project has no adjustment layer, an invisible clip is used instead, and it renders the same way.

*Colours:* Premiere doesn't tell add-ons the colour of a clip in the Timeline, so Ultra Studio knows the colours it gave – from Song Splitter, **Add a render range** and **Colour** here. Change a range's colour here rather than in the Timeline, or it won't be picked up by the colour filter.


**Chapters** – builds a YouTube chapter list from your named markers (`0:00 Intro`, `1:23 Family`…). It starts at 0:00 and warns about YouTube's rules (at least 3 chapters, each 10 seconds or longer). **Copy** it into the video description.

**Episode text** – titles, a description, show notes with times, YouTube chapters, pull quotes, social posts and keywords, written from what is said in the open sequence (Story's transcripts of the clips in it; only that text goes to the AI). Add **Notes for the writer** – the show's name, tone, links – then **Write the episode text**. Each part has **Copy**; **Save as a text file** keeps them all; **Add the chapters as markers** puts them on the sequence. Quotes the AI returns are checked against the transcript, and chapters follow YouTube's rules (first at 0:00, each at least 10 seconds). Without AI it gives chapters from your named markers and the strongest lines as quotes.

### Markers – make and manage them

Every marker on the **open sequence** – or on the **clips selected** in the Project panel (Media Pool in Resolve) – in one list. Press **Read again** after changing markers in the editor.

- **Marker pad**: big buttons that each make one kind of marker at the playhead of the open sequence, in its colour and length, on the **Timeline**, the **Clip** under the playhead or **Both**. The standard set: **Good**, **Fix**, **Note…** (asks for the note), **B-roll here** and **Highlight** (press to start, press again to end – for logging while it plays), **Music cue** (4 s), **Chapter**, **Whole clip** (the length of the clip under the playhead) and **Select on the clip** (5 s, on the clip). Keys **1–9** press them while the panel has focus. **Edit buttons** to rename them, change colour, length (a point, seconds, the clip under the playhead, In to Out, or start/stop), where they go, the key, and whether they ask for a note or make a chapter marker; add more, or go back to the **Standard set**.
- **Colour buttons**: eight big colours – press one to recolour the marker at the playhead (on the timeline or the clip under it), or every ticked marker in the list.
- **The last marker**: **End it here** stretches it to the playhead, **Rename…**, or **Delete it**.
- **Find them**: search names and comments, and click the colour chips to show only some colours. Click a marker's time to move the playhead there (a clip's: to show it in the Source Monitor).
- **Change them**: type a new name or comment, or pick a colour, right in the list. Tick several (or **Tick all shown**) to **recolour**, **Rename…** with a pattern (*Shot {n}*, *{name} – fixed*, *{tc}*), **Move…** earlier or later by some seconds, **Copy as text**, copy them **Onto the clips** under them (so they travel with the clips), or **Delete**.
- **Add markers** in the colour chosen: **At the playhead**, **Every … seconds**, **At every cut** or **At every clip** on a track (named after the clip), or **Show the clips' own markers** – markers made on the source clips added to the sequence where those parts are used.
- **From notes or a review export**: paste a client's notes – one per line with a time, like *01:23 Fix the colour*, *02:10–02:25 Too long*, *[red] 03:05 Wrong name* – or load a CSV export from a review tool (a *Timecode* column, plus comment, name, colour and who wrote it). Times written from 01:00:00:00 are counted from the sequence's start.
- **Export**: the markers shown **Copy as a list**, **Copy as YouTube chapters** (first at 0:00, at least 10 s apart) or **Save as spreadsheet**. **Remove duplicates** (same time, same name) or **Remove the ones shown**.
- In Resolve, changing a marker takes it off and adds it again with the change – the same marker, shown the same way.
- Ask: *add a red marker here called fix the sound*, *add a marker every 30 seconds*, *put a marker at every cut*, *copy the markers as YouTube chapters*, *remove duplicate markers*.


### Quick effects – one click
A pad of buttons: click one and it goes on the clips selected in the Timeline – or on **Every clip** in the sequence. Undo with ⌘Z / Ctrl+Z as usual.

- **Transitions**: Cross Dissolve, Dip to Black or White, Film and Additive Dissolve, Push, Morph Cut (hides a jump cut), and **Fade in** / **Fade out**. Choose the length once (¼, ½, 1 or 2 seconds) and where they go: **at the cuts between** the clips (the default – a dissolve on every cut of a whole sequence in one click), or at the start, end or both ends of each.
- **Moves and speed**: Punch in 110% or 120%, Back to 100%, Slow zoom in or out across the clip, Slow motion (50%) and Speed up (200%).
- **Effects**: Black & White, Blur, Stabilise (Warp Stabilizer), Flip, Sharpen, Lumetri Color, Pixelate, and half or fully see-through.
- **Sound**: fades (Constant Power or Exponential Fade), Louder, Quieter and Duck under. A sound button on a selected video clip changes its linked sound.
- **Favourites**: star a button to keep it at the top.
- **Any by name**: anything in Premiere's Effects panel, typed as it's named there.
- In Resolve, add-ons can't add transitions, effects, speed or volume, so those buttons are greyed out; the moves and opacity work on the clip under the playhead (Resolve doesn't tell add-ons which clips are selected) or every clip.

### mVFX – a documentary titles pack
Nine groups of presets, each with a painted thumbnail and a live preview (press **Play** to see it animate). Click one, type the words, press the big button.

- **Lower thirds** (Hairline, Tag, Block, Bracket, Stacked, Underline, Side bar, Typewriter): a name and a role. The name fields offer the people Story knows from the transcripts.
- **Titles & cards**: Chapter, Section number, Opening title, Location & date, Time jump, Quote, Credits (role: name, one per line), Three names, End card, Caption.
- **Timelines & dates**: Date ruler, Era bar, Typewriter stamp, Day counter.
- **Overlays**: Film grain, Dust & scratches, Vignette, Warm and Cool light leaks, Letterbox 2.39, Film gate, Paper wash, Scan lines, Flicker – with a **Strength** slider.
- **Backgrounds**: Dusty dark, Paper, Slate, Ink, Linen, Spotlight – plates to put a title on.
- **Freeze frames**: the frame at the playhead held for a few seconds, with a spotlight, black & white, a name tag or an outline box (the spot's place is set with two sliders).
- **Movements**: Push in, Pull out, Pan left/right, Tilt up/down, Handheld drift, Punch – on the selected clips (or every clip).
- **Transitions**: Light leak, Flash, Film burn, Grain dip, Cross dissolve, Dip to black – at the cuts between the selected clips.
- **Looks**: Faded memory, Warm archive, Cold night, Bleach, Sepia – a colour grade on the selected clips. The .cube files are also saved in Documents › JMG Ultra Studio › Looks.

**Colours and fonts** (one set for the whole pack): text, accent, second-line and bar colours; a serif, a sans and a typewriter family from the fonts on this computer. **Size**, **Across / Up–down** and **Length on the timeline** are per preset.

Everything is native and editable afterwards:
- **Premiere:** titles go on tracks named **mVFX 1, 2, 3…** above the edit. Each line is its own text layer (Premiere's Basic Title) – change the words, font or colour in Essential Graphics; the rules and bars are PNG pictures underneath (kept in a “JMG Ultra Studio mVFX” folder next to the project); the in/out animations are keyframes on Opacity and Position. Movements are Motion keyframes; looks are a Lumetri Color effect with the look's settings; transitions are the real transition plus the wash over the cut.
- **Resolve:** every preset is a Fusion title or generator in the Effects Library (Titles / Generators › **JMG Ultra Studio** – press **Install the whole pack** once; Resolve lists new templates after a restart). The button writes the preset with your words in it and inserts it at the playhead, 5 s long – trim it in the Timeline; words, colours, sizes and positions are Inspector controls. Resolve doesn't let add-ons keyframe or add transitions, so movements other than Punch (a still punch-in) are greyed out and a transition lays only its wash over the playhead. Looks go on the clip's first node as a LUT.
