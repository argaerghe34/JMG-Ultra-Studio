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
1. Choose the **Track** whose adjustment layers are the ranges – the list shows every video track (*V3 · Renders · 4 layers*), and **New track on top for render ranges** adds an empty one above everything: **Renders** (made the first time you add a range), or any track that holds adjustment layers – for example **Songs**, where Song Splitter puts its songs.
2. Type a name and press **Add a render range**. An adjustment layer goes on that track, between your In and Out points (or for 10 seconds from the playhead), in the colour you pick next to the button. You can also put adjustment layers there yourself, from the Project panel.
3. Each range is listed with its colour, times and length. Click one to go there. **Rename** gives it (and its file) a name: *Teaser 30s* → *Teaser 30s.mp4*. **Times…** sets its start and end as the Timeline shows them, or to your In and Out points (type *In/Out*). **Colour** changes its colour, and **Delete** takes it off the timeline. You can still trim and rename layers in the Timeline: the list follows the Timeline by itself within a few seconds (**Refresh** does it at once).
4. **Colour**: render every range, or only the ranges of one colour – for example only the songs, not the talk and applause.
5. Pick the **Export settings**: the built-in H.264 presets, any preset you've saved in Media Encoder or in Premiere's Export screen, or **Choose a preset file…**. **Add to every file name** puts an ending on each file, such as *_1* or *_v2* (*Song 1_v2.mp4*); the export pack uses it too.
6. Press **Send the renders to Media Encoder**. Every range is queued in timeline order and rendered one after another, with progress in the status bar. Turn off **Start rendering straight away** to leave them waiting in Media Encoder's queue instead.

Switch a layer off (Enable, in its right-click menu) to skip it. An empty adjustment layer doesn't change the picture, but any effect you add to one shows in that render. Your own In and Out points are left as they were. If the project has no adjustment layer, an invisible clip is used instead, and it renders the same way.

*Colours:* Premiere doesn't tell add-ons the colour of a clip in the Timeline, so Ultra Studio knows the colours it gave – from Song Splitter, **Add a render range** and **Colour** here. Change a range's colour here rather than in the Timeline, or it won't be picked up by the colour filter.


**Chapters** – builds a YouTube chapter list from your named markers (`0:00 Intro`, `1:23 Family`…). It starts at 0:00 and warns about YouTube's rules (at least 3 chapters, each 10 seconds or longer). **Copy** it into the video description.
