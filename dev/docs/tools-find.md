### Selects – the usable moments in any footage

It plays every clip on your computer (nothing is uploaded) and grades its moments **BEST** (green), **GOOD** (yellow) and **OK** (blue). By default it works on **any footage**: everything you could cut to or put over something else is kept, and only what's technically unusable is left out – blurry or out of focus, far too dark or blown out, too shaky, a camera bump or a whip pan. It names the shot size and camera move too. It flags **reveals** (pull-backs, crane moves, lights coming up – in purple), shots that crop well to **9:16**, and **slow-mo candidates** (clips shot at 50 fps or more).

1. In **Works on**, choose **Selected clips**, **A bin** or **A sequence**. On a sequence it grades the camera clips on V1 (or **All video tracks**), skipping graphics, adjustment layers, nested sequences and stills. Each select still points at its source clip.
2. **What counts as usable** starts on **Any footage – usable B-roll**, which suits every kind of shot. Only if you want a style to count too, open **Kind of footage (optional)** and choose *Concert & live music*, *Interviews & talking heads*, *Weddings & events*, *Travel & B-roll*, *Sports & action*, *Documentary*, *Drone & aerial*, *Phone footage*, *Crowd & audience* or *Close-ups* – for example Interviews want a steady face, and Sports wants movement.
3. Choose **How picky** – the same three choices as Story: **Everything useful**, **Balanced** or **Only the best**, each showing how many selects it gives. **Fine-tune** has a slider for each check and grade, plus **Drop duplicate takes**.
4. Press **Find selects**. It runs at about 16× real time on 1080p and remembers each clip, so changing the footage type, How picky or a slider re-grades instantly.
5. Look through the list. **Sort** it (best first, shooting order, shot size…) and **Show** one kind (a grade, reveals, 9:16, close-ups…, or what was **Left out**). Each select says why it scored as it did. Click one to see it in the Source Monitor (or in the sequence), **Keep** a moment it left out, or × to leave one out.
6. **Make it** – tick any mix:
   - **A selects sequence**, colour-coded by grade with a marker on every clip, in the **Order** you choose. Or **One sequence per grade**.
   - **Sort into bins by type**: a bin per category, best first, each in its own colour – by grade, by shot size, by camera move, and **Special** (hero shots, reveals, 9:16, slow-mo, faces, action). Optionally **Also a sequence per category**.
   - **A bin of subclips by grade**, named like `001_BEST_closeup_87`.
   - **Markers on the source clips** with the score and reasons, markers on the sequence you graded, and **Colour labels on the source clips**.
   - **Stills of the best frames**: a full-size PNG of the sharpest frame in each select (sharp, steady, faces if there are any; up to 50, best first) in *Documents › JMG Ultra Studio › Stills* – for thumbnails, posts and your photo edit.
   - **Mark the best**: your top selects (**The best (★)** in Fine-tune: top 3, 5, 10 or 10%) get their own colour (magenta), a ★, and go first.
   - **Include**: **All**, **BEST + GOOD** or **BEST only**.

Nothing changes in your project until you press **Make it**; new items go in *JMG Ultra Studio › Selects*. **Remove Selects markers** takes the markers off again.

**Formats the panel can't read.** The panel reads H.264 MP4 files directly, and uses a clip's proxy if it has one. For 10-bit 4:2:2 (Lumix and others), iPhone HEVC, ProRes or RAW, leave **Make small analysis copies of clips the panel can't read** on: Media Encoder makes a 1280×720 copy with Premiere's own *High Quality 720 HD* preset. The copies stay in Ultra Studio's own folder, and times always match the original. They aren't added to your project unless you tick **Also attach them as proxies** (16:9 clips only).
