### Song Splitter – concerts and events

Point it at the **sound-desk recording** (a clip or WAV) or your **multicam sequence** and press **Find the songs**. It finds each song, the applause, talk and the interval, and handles songs that run straight into each other.

- **How many songs**: if it finds too many (a solo or a quiet bridge counted as a new song) or too few, move **Fewer songs – more songs**. Fewer: only applause or long talk between songs starts a new one, and short songs join their neighbours. More: a change of key or tempo counts too. Or type **the number of songs played** if you know the setlist: it keeps the strongest breaks that give that many. Both re-sort what it already heard, straight away, without listening again. Titles you've typed stay with their songs.
- The list is editable: **rename** songs (it can't recognise titles, so type them), **join** or **split** parts at a time, change a part's type, and click to jump there.
- **Add to Premiere** can add any combination of: a marker for each song (and for applause and talk too), a subclip for each song, and a sequence for each song. On a sequence it makes trimmed copies, one per song.
- **Adjustment layers above the edit** (on a sequence): a new top track called **Songs** with an adjustment layer for each song, numbered **1, 2, 3…** (with its title once you've renamed it), plus the talk and applause, colour-coded – songs green, talk blue, applause orange. Name the songs in the Timeline, then **Deliver › Render ranges** renders each one: choose the **Songs** track and the songs' colour. Running it again replaces the layers; **Remove song layers** takes them away.
- **Copy** or **Save** the setlist with timecodes (text and spreadsheet).
- **Remove my markers** takes away only the markers it added.

### Podcast – cut between the cameras by who is speaking
For a synced video podcast: the cameras stacked on video tracks, each person's mic on its own audio track. Press **Read the tracks**, name each mic after its person (leave a track empty if it isn't a mic) and say what each camera shows – one person, or **Wide / everyone**. **Save as a preset** to reuse the setup on every episode.

- **Listen to the mics**: each mic is rendered on its own (the others muted for a moment, then put back) and measured on this computer against its own quiet and talking levels – so a voice that bleeds into another mic doesn't steal the shot, and two people talking at once count as crosstalk. Nothing leaves the computer.
- **How it cuts**: **Long-form**, **Standard** or **Promo**, or set the **Shortest shot** (a quick reply doesn't flash a cut) and **Longest shot** (then a reaction shot of someone listening, or the wide) yourself. **Cut after the voice starts** a few frames late, as an editor would; **ignore replies** like *yeah* and *mm-hm*; **wide** when people talk over each other, on long silences, and at the start and the end; cutaways land on sentence ends when Story has transcripts. **Shuffle the variety** picks differently (and repeatably) when there's more than one choice.
- Changing a rule redraws the edit at once: a coloured strip of the shots, how much each camera is used, and **every switch** in a list – untick one to stay on the shot before, ▶ to see it.
- **Make the switched copy**: a copy of the sequence with every camera still stacked, cut at each switch and only the active one switched on. To change a shot later, switch a piece on (or the one above it off). The original isn't changed.
- In DaVinci Resolve the same, except that Resolve can't cut clips by script, so each camera track is laid again in pieces from the same source times. Resolve Studio's own SmartSwitch is another option there.
- The **Podcast episode** recipe (Ask › Recipes) switches the cameras, cuts the fillers and false starts from the switched copy, and writes the episode text.

### Silence Cut – tighten interviews

Pick a sequence (the active one by default) and press **Find the pauses**. The pauses show on a strip under the waveform. Then choose a preset:
- **Natural** – only clear pauses.
- **Tight** – a good default for interviews.
- **Very tight** – social-media pace.
- **Podcast** – long gaps only.

Or fine-tune **silence level** (**Auto level** sets it from the room noise), **shortest pause to cut**, and how much to **keep around speech**. The numbers update as you move the sliders.

**Make a cut copy** duplicates the sequence and ripple-cuts every pause across all tracks, so picture and sound stay in sync. The original is never touched. Or use **Add markers instead** to decide by hand. Locked tracks are flagged first, because cutting around them would knock them out of sync.

**Fillers and false starts** – below the pauses: **Find fillers and false starts** reads the words in Story's transcripts of the clips in the sequence and lists every *um*, *uh*, *er*, doubled small word (*the the*) and restarted sentence, each with the words around it. Untick any you want to keep (filter by kind, **Tick all** / **Untick all**), press ▶ to hear one, then **Make a cut copy** – with **Cut the pauses too** when you've found them, both go in one copy. Soft fillers (*, you know,*) are off unless you switch them on. Cuts are exact with Premiere's word timings; in Resolve (times per phrase) they're estimated and left unticked.
- **Punch in on the jump cuts** (with either cut button): in the cut copy, every other piece of a shot that was cut is pushed in a little – **Push in to** 104–130 %, 110 % by default – so each cut reads as a change of framing, the way an editor hides a jump cut. Only pieces of the same shot that meet at a cut change; a new shot starts at 100 %, and B-roll on the tracks above is left alone. It uses the clip's own Scale (Zoom in Resolve), so it's easy to change by hand. Ask: *punch in on the jump cuts* (on the open sequence – run it on a copy).

### Beat Cut – cut to the music

Premiere has no beat detection; this adds it. Select a music clip and press **Find the beat**. It shows the tempo; if it's double or half what you hear, use **Double speed** / **Half speed**.
- **Add markers**: every beat, every 2 beats, every bar or every 2 bars. Use them with Premiere's *Automate to Sequence › At unnumbered markers*.
- **Make the beat cut**: pick a bin of clips (your Selects work well), a length (15 s, 30 s, 60 s or the whole song), the cut rhythm, the order (bin order or shuffled), and optionally **faster cuts in louder parts**. You get a new sequence with the music on A1 and a shot on every cut. If Selects has analysed the clips, each shot starts at its best moment.

### Story – interviews into a cut

For documentaries and charity interviews: find the best lines across hours of interviews and build the cut from them.

**Transcripts.** Transcribe in Premiere as usual (free, and on your computer). Then press **Read Premiere's transcripts**: Ultra Studio saves the project and reads every transcript straight from it, so there's no exporting clip by clip. On a real 30-hour project it read 222 transcripts in under 2 seconds. You can also import **SRT, VTT, CSV or text** transcripts from other services; they link to their clips by file name, and you can fix any link.

**Who's speaking.** When the transcripts don't say who speaks, open **Interviews and speakers** and press **Tell the voices apart**. Ultra Studio listens to each interview on your computer (nothing is sent anywhere) and gives every line its voice from its pitch and the sound of the voice. The one asking the questions is found in every interview and becomes **Interviewer**. Name each voice once – *Ruth* – and every line of it follows, in Find, Themes, documents and the AI's reading. ▶ plays a clear line of each voice; **Same person as…** joins two voices; **Listen again** for new interviews keeps the names; **Put the speakers back** undoes it. It tells people apart by pitch, or by how they sound together with who asks and who answers – two people with very similar voices who both answer may stay one voice. The first listen takes about a minute per hour of interview; after that it's instant. Ask: *tell the voices apart*.

**Check the words.** Transcription gets names, places and short forms wrong – *FTL* or *FJell* for *FJL*, *Rogan* for *Rogen*. In **Check the words**, list the names and terms that should appear (*FJL, Gersch, Odessa*) and press **Find likely mistakes**. It finds, on your computer: near-misses of those names, and of short forms the interviews use often; short forms said as letters (*F J L*, *eff jay el*, *FJell*); oddly mixed capitals; short forms heard only once or twice; and names spelt two ways. Don't know every name? Press **Suggest names from the interviews** (or Find with the box empty): the AI lists the people, organisations and places mentioned, spelt correctly, with each person's title or role – they fill the names box, and you untick, re-spell or retitle any that are wrong. Each group of finds has **Tick all** and **Untick all**. Tick *Ask the AI to look too* and the AI looks over the unusual words as well – only those words and a few around each are sent. Each find shows the line with the word marked: ▶ plays it, untick any that are right (*FTL* in “faster than light”), type what it should say, and press **Correct the ticked ones**. Corrections go into Names and terms (only for the ticked lines), every word keeps its timing, and **It's right** stops a word being shown again. Then **Update Premiere's transcripts** saves the corrected interviews in Premiere's own format – the same times, so they stay in sync with the footage – to bring in from the Text panel › … › Import › Import transcript… (see below). Ask: *find words the transcript got wrong*.

**The names in Premiere's own transcripts.** Once the voices have names, press **Names into Premiere's transcripts**. Add-ons can't write into Premiere's transcripts, so Ultra Studio saves each interview's transcript – the same words and times, now with the speakers' names – in Premiere's own transcript format, in a *JMG Ultra Studio / Transcripts with speakers* folder next to your project. For each interview: press **Open in Source**, then in the Text panel › Transcript choose **… › Import › Import transcript…** and pick its file. Captions and Text-Based Editing then have the names (tested in Premiere 26: names, words and times all arrive). If the Text panel doesn't show them, look in its … menu › Transcript view options. The “um”s Story leaves out aren't in the imported transcript. In Resolve you get subtitles that start with who's speaking (*RUTH: …*) to bring in with File › Import › Subtitle. Ask: *add the speaker names to the transcripts in Premiere*.

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

### Agent – give it a goal, it makes the cut

Write what you want made – *“a 2-minute film for the donors about the bakery: open on Ruth’s first day, end on hope”*, *“everything they say about faith, strongest first”*, *“tighten this cut and keep it under 3 minutes”* – or pick one of the starting goals (charity film, best-answers string-out, everything on a topic, tighten this cut, social clip, polish for review). Press **Make plan**: the Agent shows its plan in a few steps; add a note if you like (*“keep the oven line”*) and press **Go**.

It then works on its own, a step at a time, and you see each step as it happens: it **searches the interviews** (often several times, with different words), **reads the strongest lines** with what was said around them, **builds a new sequence** from them (interviewer questions left out, thoughts finished, aiming for your length), **reads the sequence back** and checks it against the goal, then **tidies it** with Ultra Studio's own tools – dissolves where the speaker changes, punch-ins, cutting the pauses, captions, safe zones, chapters, Final Check – and fixes what's off. It can **keep a version** before a big change so you can compare.

At the end it says what it made, the choices it took and **what's worth checking**, and lists every sequence it made with an **Open** button. Ask for changes underneath – *“30 seconds shorter”*, *“open on Sam instead”*, *“fewer dissolves”* – and it carries on from where it was, remembering what it did.

- **Your own sequences are never changed.** It builds new ones, or works on a copy (“… – Agent”). Versions go in *JMG Ultra Studio/Agent/Versions*.
- **Limits:** at most 6–30 steps and $0.50–$5 of AI per go, set next to the goal; Stop works at any time. A typical go is 8–15 steps.
- **Footage never leaves the computer:** the AI reads only text – transcript lines, the timeline as a list of clips, and what each tool reports.
- It can't render, export, move project items or run Overnight prep or recipes – those stay your call. In Resolve it can't add transitions, effects or text (Resolve doesn't let add-ons).
- Needs Claude or Gemini (Opus gives the best story judgement). From the Assistant: *“agent: a 2-minute film about …”*.
- **Don't want it?** Settings › Agent › Show the Agent off – the tab and its command go, and everything else works as in 1.3.27.

### Assistant – just ask

Type what you want: *“cut the silences”*, *“markers on every beat”*, *“check the cut”*, *“safe zones for Reels”*, *“export the master and a vertical version”*, *“what changed between v1 and v2”*. It shows a **plan** first – each step in plain words, with the ones that change your project marked – and only acts when you press **Run**.

Common requests work with **no AI key**. With a key (Settings), it can handle anything phrased freely and chain several steps. It can only ever run Ultra Studio's own tools.

### MC Selects – the cameras you keep from a multicam edit
Open a cut multicam edit (the multicam clips on V1) and press **Read the cameras**. Every camera is listed by its file name with a still of it (the file's own preview, as Finder or Explorer shows it – nothing is rendered; switch off **Show a still of each camera** to hide them), the camera model when the file says (*📷 Sony ILCE-7SM3*, *Panasonic DC-S1M2*, *GoPro HERO11*, *Apple iPhone 15 Pro*), how many cuts it has and how long it's on screen. Under the list, the total running time of the cameras you keep – what the new sequence will run. Keep the ones you want and press **Make the MC Selects sequence**: a new sequence of just their shots, back to back in the order you edited them, each cut its own clip with no handles. Give a camera a label colour to see it at a glance, and switch on **Include the camera’s scratch audio** for the camera's own sound. Your choices are remembered.

Works with Multi-Camera Source Sequences and with nested sequences switched to multicam. Ultra Studio saves the project first, because which camera each cut shows is only written in the saved project. **Premiere only:** Resolve doesn't let add-ons see which camera a multicam cut shows.
