### Selects – the usable moments in any footage

It plays every clip on your computer (nothing is uploaded) and grades its moments **BEST** (green), **GOOD** (yellow) and **OK** (blue). By default it works on **any footage**: everything you could cut to or put over something else is kept, and only what's technically unusable is left out – blurry or out of focus, far too dark or blown out, too shaky, a camera bump or a whip pan. It names the shot size and every select's **camera move** – *Pan left/right*, *Tilt up/down*, *Push-in*, *Pull-out*, *Static*, *Handheld* or a named *reveal* – with how smooth it is (*very smooth*, *smooth*, *a bit uneven*, *uneven*). It flags **reveals** (pull-backs, crane moves, lights coming up – in purple), shots that crop well to **9:16**, and **slow-mo candidates** (clips shot at 50 fps or more).

1. In **Works on**, choose **Selected clips**, **A bin** or **A sequence**. On a sequence it grades the camera clips on V1 (or **All video tracks**), skipping graphics, adjustment layers, nested sequences and stills. Each select still points at its source clip.
2. **What counts as usable** starts on **Any footage – usable B-roll**, which suits every kind of shot. Only if you want a style to count too, open **Kind of footage (optional)** and choose *Concert & live music*, *Interviews & talking heads*, *Weddings & events*, *Travel & B-roll*, *Sports & action*, *Documentary*, *Drone & aerial*, *Phone footage*, *Crowd & audience* or *Close-ups* – for example Interviews want a steady face, and Sports wants movement.
3. **Camera movement** decides how much smooth movement counts: **Doesn't matter** (technical quality only), **Smooth moves count** (the default: a smooth pan, tilt, push-in or pull-out ranks higher) or **Moves first** (smooth moves first, static shots a little lower). Wobbly or jerky moves never get a bonus, and this changes the order, never what's kept. **Show › Smooth camera moves** lists just those; **Sort › Smoothest moves first** puts them on top; markers name the move too.
4. Choose **How picky** – the same three choices as Story: **Everything useful**, **Balanced** or **Only the best**, each showing how many selects it gives. **Fine-tune** has a slider for each check and grade, plus **Drop duplicate takes**.
5. Press **Find selects**. It runs at about 16× real time on 1080p and remembers each clip, so changing the footage type, How picky or a slider re-grades instantly.
6. Look through the list. **Sort** it (best first, shooting order, shot size…) and **Show** one kind (a grade, reveals, 9:16, close-ups…, or what was **Left out**). Each select says why it scored as it did. Click one to see it in the Source Monitor (or in the sequence), **Keep** a moment it left out, or × to leave one out.
7. **Make it** – tick any mix:
   - **A selects sequence**, colour-coded by grade with a marker on every clip, in the **Order** you choose. Or **One sequence per grade**.
   - **Sort into bins by type**: a bin per category, best first, each in its own colour – by grade, by shot size, by camera move, and **Special** (hero shots, reveals, 9:16, slow-mo, faces, action). Optionally **Also a sequence per category**.
   - **A bin of subclips by grade**, named like `001_BEST_closeup_87`.
   - **Markers on the source clips** with the score and reasons, markers on the sequence you graded, and **Colour labels on the source clips**.
   - **Stills of the best frames**: a full-size PNG of the sharpest frame in each select (sharp, steady, faces if there are any; up to 50, best first) in *Documents › JMG Ultra Studio › Stills* – for thumbnails, posts and your photo edit.
   - **Mark the best**: your top selects (**The best (★)** in Fine-tune: top 3, 5, 10 or 10%) get their own colour (magenta), a ★, and go first.
   - **Include**: **All**, **BEST + GOOD** or **BEST only**.

Nothing changes in your project until you press **Make it**; new items go in *JMG Ultra Studio › Selects*. **Remove Selects markers** takes the markers off again.

**Formats the panel can't read.** The panel reads H.264 MP4 files directly, and uses a clip's proxy if it has one. For 10-bit 4:2:2 (Lumix and others), iPhone HEVC, ProRes or RAW, leave **Make small analysis copies of clips the panel can't read** on: Media Encoder makes a 1280×720 copy with Premiere's own *High Quality 720 HD* preset. The copies stay in Ultra Studio's own folder, and times always match the original. They aren't added to your project unless you tick **Also attach them as proxies** (16:9 clips only).

### Subclip Maker – browse only the parts you chose
**Make subclips of**:
- **Clips in a bin**: every clip in it becomes a subclip of only the part between the In and Out you set on it (in Resolve: Mark In and Mark Out). Clips without In/Out are kept whole.
- **Clips on the timeline**: every clip in the open sequence becomes a subclip of the part used in the edit, in timeline order. Nested sequences, titles and adjustment layers are left out, and a clip's sound isn't made twice.

The subclips have restricted In/Out, so long clips show just that part in thumbnails and when you scrub. Your originals aren't changed.

- **Put them in** **a new bin**: next to the original bin, **"<bin> – Subclips"** (or **"<sequence> – Subclips"** for the timeline), or type another name. Or choose **a bin you choose** from the list.
- **Add handles** (off by default) adds a few seconds before and after each subclip (you set how many), never past the ends of the clip.
- They're numbered in filming order (timeline order for the timeline) with the original file name: *01 – C0012.MP4*.
- Only clips directly in the bin are used, not clips in bins inside it.
- If subclips with the same names are already there, you're asked first: **Replace** moves the earlier ones into **"<bin> – Subclips – earlier"** (add-ons can't delete clips – delete that bin yourself), **Add alongside** names the new ones *(2)*, *(3)*…

### Take Sets – the best take of each retake
For pieces to camera, interviews with do-overs and podcast reads. Pick the sequence and press **Find the takes**: every set of attempts at the same line is grouped – word for word, reworded, cut short or picked up again minutes later (with AI; without it, retakes that share most of their words). Paste the **Script** if there is one: sets are named after its lines and judged against it.

- Each set lists its takes, marked **complete** or **incomplete**, with a note on how they differ and ▶ to hear them. The **last complete take** is chosen; pick another, or **Keep every take** when they aren't really retakes.
- **What will be cut** lists every unchosen take (with the pause after it) – untick any to keep it.
- **Make a copy with the chosen takes** cuts the others out of a copy of the sequence, on every track together so nothing goes out of sync, and puts a marker on each kept take. Words from two takes are never stitched together. The original isn't changed.
- Takes are found from Story's transcripts of the clips in the sequence (only their text goes to the AI). Ask: *keep the best takes*.

### Word cloud – the words said most

The words and phrases said most in your interviews, drawn as a cloud: the bigger the word, the more it's said. It reads Story's transcripts – the interviews (or the sequence) chosen in **Story › 1 Interviews › What to work on** – and counts on this computer; nothing is sent anywhere.

- **Who**: everyone but the interviewer (the default), everyone, or one person – to hear what each of them keeps coming back to.
- **Word forms together** counts *community* and *communities* as one word; **Phrases** adds two- and three-word phrases said in at least two lines (*local community*, *peace of mind*). Small words and fillers (*the*, *um*, *you know*) are left out. **Hide this word** takes one out of the cloud; **Show hidden words again** brings them back.
- **Click a word** to list every time it's said: the words around it, who said it, the interview and the time. **▶** plays it (in Premiere's Source Monitor; in Resolve, in the panel). Shift-click to pick several words. **Find** looks up any word or phrase, even one not in the cloud.
- **Build a sequence of the mentions**: **Just the words** (a supercut – each mention with a little air either side), the **Whole line**, or the **Full sentence**. Untick any you don't want. With several words picked, each gets its own group and colour. Each clip has a marker with the word and its line.
- **Add to Story as a theme** puts every line it's said in into a theme of yours.
- Ask: *word cloud*, or *build every time they say "community"*.
