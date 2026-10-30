### Song Splitter – concerts and events

Point it at the **sound-desk recording** (a clip or WAV) or your **multicam sequence** and press **Find the songs**. It finds each song, the applause, talk and the interval, and handles songs that run straight into each other.

- The list is editable: **rename** songs (it can't recognise titles, so type them), **join** or **split** parts at a time, change a part's type, and click to jump there.
- **Add to Premiere** can add any combination of: a marker for each song (and for applause and talk too), a subclip for each song, and a sequence for each song. On a sequence it makes trimmed copies, one per song.
- **Adjustment layers above the edit** (on a sequence): a new top track called **Songs** with an adjustment layer for each song, numbered **1, 2, 3…** (with its title once you've renamed it), plus the talk and applause, colour-coded – songs green, talk blue, applause orange. Name the songs in the Timeline, then **Deliver › Render ranges** renders each one: choose the **Songs** track and the songs' colour. Running it again replaces the layers; **Remove song layers** takes them away.
- **Copy** or **Save** the setlist with timecodes (text and spreadsheet).
- **Remove my markers** takes away only the markers it added.

### Silence Cut – tighten interviews

Pick a sequence (the active one by default) and press **Find the pauses**. The pauses show on a strip under the waveform. Then choose a preset:
- **Natural** – only clear pauses.
- **Tight** – a good default for interviews.
- **Very tight** – social-media pace.
- **Podcast** – long gaps only.

Or fine-tune **silence level** (**Auto level** sets it from the room noise), **shortest pause to cut**, and how much to **keep around speech**. The numbers update as you move the sliders.

**Make a cut copy** duplicates the sequence and ripple-cuts every pause across all tracks, so picture and sound stay in sync. The original is never touched. Or use **Add markers instead** to decide by hand. Locked tracks are flagged first, because cutting around them would knock them out of sync.

### Beat Cut – cut to the music

Premiere has no beat detection; this adds it. Select a music clip and press **Find the beat**. It shows the tempo; if it's double or half what you hear, use **Double speed** / **Half speed**.
- **Add markers**: every beat, every 2 beats, every bar or every 2 bars. Use them with Premiere's *Automate to Sequence › At unnumbered markers*.
- **Make the beat cut**: pick a bin of clips (your Selects work well), a length (15 s, 30 s, 60 s or the whole song), the cut rhythm, the order (bin order or shuffled), and optionally **faster cuts in louder parts**. You get a new sequence with the music on A1 and a shot on every cut. If Selects has analysed the clips, each shot starts at its best moment.

### Story – interviews into a cut

For documentaries and charity interviews: find the best lines across hours of interviews and build the cut from them.

**Transcripts.** Transcribe in Premiere as usual (free, on your computer, and it tells speakers apart). Then press **Read Premiere's transcripts**: Ultra Studio saves the project and reads every transcript straight from it, so there's no exporting clip by clip. On a real 30-hour project it read 222 transcripts in under 2 seconds. You can also import **SRT, VTT, CSV or text** transcripts from other services; they link to their clips by file name, and you can fix any link.

**Search.** Type a word or idea (*family*, *volunteering*). It also finds related words and mis-heard spellings. ▶ plays a line in the Source Monitor; tick lines to collect them. **Strong soundbites only** hides questions, fillers and half sentences.

**Themes.** **Find themes** groups every interview's best lines by topic (sharper with an AI key). **Add your own theme**: type a word or phrase (*gratitude*, *first day in Israel*) and Story finds the matching lines, best first. You can take lines out, add more from Search, or press **Find again** later. Rename or merge themes; **Sort into bins by theme** makes a bin per theme with the best lines first.

**Wall.** A post-it wall: each theme is a column of cards, coloured by speaker.
- Reorder columns with **◀ ▶** (or drag them) and cards with **▲ ▼** (or drag).
- The **⋯** menus can rename a column, change its colour, put its strongest lines first, move a card to another column, and pin, hide or annotate a card.
- Press ▶ to hear a card.

**Build sequence from wall** lays the lines out in that order with small handles, with these options:
- **Colour each theme:** every theme's clips get their own label colour in the timeline (shown as a swatch on the column; pick any of Premiere's 16).
- **Highlight the strongest lines:** a distinct colour (Yellow unless you change it) plus a ★ marker. Optionally **strongest lines first** in each theme.
- **Theme names in the timeline:** *Markers*, a *Name layer* (one clip per theme on the top track, spanning exactly that theme and named after it, using your project's adjustment layer if there is one), *Both*, or *Off*.

The wall is saved with the project.

**Timeline – a transcript of any cut.** Pick a sequence and Story builds its transcript in timeline order, keeping only the words you actually used. It leaves out muted tracks and music beds, and lists any clip that still needs transcribing.
- **Who is who:** each voice is listed with its talk time, a sample line and ▶. Type names once, and the same name across clips becomes one person. Unnamed voices are labelled Speaker A, B, C… consistently across the whole timeline.
- Click a paragraph to jump there. **Export** it as **Word**, **text**, **subtitles (.srt)** or a **spreadsheet**, saved to *Documents › JMG Ultra Studio › Transcripts*.
- Nothing leaves your computer.

### Sound Check – before you upload

Pick the target – **YouTube & social** (−14 LUFS), **Podcast** (−16) or **Broadcast UK/EBU** (−23) – and press **Check the sound** on a sequence or selected clips. It measures loudness the way YouTube, Spotify and broadcasters do. Then it lists anything to fix, each with a plain instruction (e.g. *“Raise the mix by about 3.5 dB”*) and a jump-to button:
- clipping and peaks too hot
- mains hum
- wind and rumble
- silent gaps
Checking never changes your sequence. When the loudness is off, **Make a copy at −14 LUFS** (or the target you chose) makes a copy with every clip's level changed by the right amount – held back if the peaks would go over the limit – and measures the copy again, so you see it land on target.

**Duck the music under speech** makes a copy of the active sequence with the music lowered while people speak (**Duck by**, 6–24 dB), fading down just before each sentence and back up after. It suggests the music tracks (audio-only files such as WAV or MP3, never a track with transcribed speech – check them in **Music on**, especially if you record interview sound separately) and the speech from the transcripts, or from the sound when there are none.

### Assistant – just ask

Type what you want: *“cut the silences”*, *“markers on every beat”*, *“check the cut”*, *“safe zones for Reels”*, *“export the master and a vertical version”*, *“what changed between v1 and v2”*. It shows a **plan** first – each step in plain words, with the ones that change your project marked – and only acts when you press **Run**.

Common requests work with **no AI key**. With a key (Settings), it can handle anything phrased freely and chain several steps. It can only ever run Ultra Studio's own tools.

### MC Selects – the cameras you keep from a multicam edit
Open a cut multicam edit (the multicam clips on V1) and press **Read the cameras**. Every camera is listed by its file name, with how many cuts it has and how long it's on screen. Keep the ones you want and press **Make the MC Selects sequence**: a new sequence of just their shots, back to back in the order you edited them, each cut its own clip with no handles. Give a camera a label colour to see it at a glance, and switch on **Include the camera’s scratch audio** for the camera's own sound. Your choices are remembered.

Works with Multi-Camera Source Sequences and with nested sequences switched to multicam. Ultra Studio saves the project first, because which camera each cut shows is only written in the saved project. **Premiere only:** Resolve doesn't let add-ons see which camera a multicam cut shows.
