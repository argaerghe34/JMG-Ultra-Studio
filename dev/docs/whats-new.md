## What's new in 1.3.28.7

- **` maximises the panel (Mac)**, like Premiere's own panels: press it anywhere in Ultra Studio (not while typing in a box) and the panel fills Premiere's window; press it again to put it back. The first time, macOS may ask to let Premiere control the computer – allow it in System Settings › Privacy & Security › Accessibility.

## What's new in 1.3.28.6

- **Fits any panel size.** Narrow panels: the top bar gives way bit by bit (version, then the name, then the project) instead of running off the edge, the rail and spacing tighten, and rows of fields stack. Short panels: the rail drops its labels. Wide panels: tools use the extra width (more columns) instead of a narrow column.
- **Updating without quitting Premiere.** The installer now updates the panel in place while Premiere is open – then press ↻ in the panel's top bar. (It only asks you to quit Premiere when the panel's set-up file itself changed.)

## What's new in 1.3.28.5

- **What was sent to AI is tidier** (Settings): one row per thing you did – an Agent run, a wiki, Find themes in batches – with how many requests, the cost and when; click it to open the requests underneath, and a request to read exactly what was sent.
- **Says what it's about:** the Agent, the Wiki and the Assistant show a line on what you asked about – *Asking about Ruth's interview · “where did she grow up?”* – while they work (and in the status bar's tooltip), and it's kept with the requests in Settings.

## What's new in 1.3.28.4

- **Check the words – names suggested by the AI:** press *Suggest names from the interviews* (or just Find with the names box empty) and the AI lists the people, organisations and places the interviews mention, spelt correctly, with each person's title or role (*Rabbi*, *founder of FJL*). They go into the names box by default and are listed below it: untick any that are wrong, correct a spelling or a title. Only the capitalised words and a few around each are sent.
- **Tick all / Untick all** for each group of words to correct, and for every group at once.

## What's new in 1.3.28.3

- **Listening happens in the background.** When a tool needs to hear a clip or sequence that isn't a plain WAV – Tell the voices apart, Silence Cut, Beat Cut, Song Splitter, Podcast, Home's check – its sound is now rendered by Media Encoder while you carry on editing, instead of Premiere showing an “Exporting” box and making a temporary sequence. Only if Media Encoder can't does Premiere render it itself. Switch: Settings › Listening to sound.

## What's new in 1.3.28.2

- **Check the words** (Story › 1 Interviews): finds words the transcription probably got wrong – mis-heard names, places and short forms (*FTL* or *FJell* for *FJL*), letters said one by one, odd capitals, names spelt two ways – with the AI's look too if you like (only the unusual words are sent). Play each line, untick the ones that are right, type the correction: it keeps every word's timing. Then **Update Premiere's transcripts** puts the corrections back into Premiere, still in sync with the footage.
- Ask: *find words the transcript got wrong*.

## What's new in 1.3.28.1

- **Speakers' names into Premiere's transcripts** (Story › 1 Interviews › Interviews and speakers): after telling the voices apart and naming them, one button saves every interview's transcript with the names, in Premiere's own format – bring each in from the Text panel › … › Import, and captions and Text-Based Editing show who's speaking. In Resolve: subtitles that start with the speaker's name.
- Ask: *add the speaker names to the transcripts in Premiere*.

## What's new in 1.3.28

- **Agent** (new tab, in Cut faster): give it a goal – *“a 2-minute film for the donors about the bakery, ending on hope”* – and it shows its plan, then works on its own: searching your interviews, reading the best lines, building a new sequence, reading it back, tidying it with Ultra Studio's own tools (dissolves, punch-ins, pauses, captions, Final Check) and fixing what's off. You see every step; at the end it lists what it made and what to check, and you can ask for changes (*“30 seconds shorter”*) and it carries on. It never changes your own sequences, stops at the step and spending limits you set, and only ever sends text to the AI – never footage. Six starting goals for interview films, string-outs, topics, tightening, social clips and review polish.
- **Going back:** Settings › Agent › *Show the Agent* off removes the tab and its command (everything else as in 1.3.27). Or install 1.3.27 from GitHub › Releases.
- Ask: *agent: …*, *make me a rough cut about …*.

## What's new in 1.3.27

- **Tell the voices apart** (Story › 1 Interviews › Interviews and speakers): Premiere's transcripts don't say who speaks, so Ultra Studio now listens to each interview on this computer – nothing is sent anywhere – and gives every line its voice, from its pitch and the sound of the voice. The interviewer is found by their questions in every interview. Name each voice once and every line of it follows; play a line to check, join two voices that are the same person, listen again for new interviews (names stay), or put the speakers back.
- **Quick effects** (new tab, in Finish): one click adds a transition, effect, move or sound change to the selected clips – or every clip. Dissolve every cut in the sequence at once, punch in, slow zooms, slow motion, black & white, stabilise, sound fades and more; set the transition length once, star your favourites, or add anything from the Effects panel by name. In Resolve, the moves and opacity (add-ons can't add transitions or effects there).
- Ask: *tell the voices apart*, *who is speaking*.

## What's new in 1.3.26.1

- **Story wiki** works on big projects: the wiki is now made in pieces (the overview and interviews a few at a time, then people, places and dates, things), so 20+ interviews no longer run past the length limit. A piece that's still too long is split again instead of failing, and an answer cut off for length is no longer sent a second time.

## What's new in 1.3.26

- **Story wiki** (new tab): a quick reference to your story from every interview – the overview, each interview in brief, and pages for the people, places, dates and things in it, every fact with the line that says it (play, drag or place it). Type to look something up at once; press Return and the AI answers from the interviews (“where did Ruth grow up?”) with the lines that say so. **Save as Word** for the whole wiki.
- **Producer** (new tab): **Notes on the cut** – a devil's-advocate producer reads the lines in your sequence next to every interview and argues with it: what's buried, said twice, missing, slow or unclear, and better lines you left out; jump to each place, mark them on the sequence, and answer back. **Pick-up interview** – what the story still needs and the questions to ask each person to get it, as a question sheet (copy or Word).
- **Home**: What's new is folded into one line – open it to read, **Got it** hides it until the next version.
- Text only, as always: the AI reads the transcripts, never the footage. Premiere and Resolve.

## What's new in 1.3.25

- **Lines straight into the timeline, from everywhere** (Story): besides dragging from Find, each line now has two buttons – **At the playhead** (insert or overwrite; the playhead moves past it, so the next one follows on) and **Source Monitor** (the clip opens with In and Out set to the line, to drag with Premiere's own preview). Ticked lines go **At the playhead** together.
- **Drag and place from more places**: Questions (a whole answer as one clip), a theme's lines, board cards (by their ⋮⋮ handle) and the Word cloud's mentions.
- **Dragging and placing lines** options: a little extra either side, **Colour by theme**, and insert or overwrite. Premiere and Resolve (in Resolve, lines at the playhead go on the first free tracks, and the clip is selected in the Media Pool with In and Out marked).

## What's new in 1.3.24

- **Drag lines from Find onto the timeline** (Story › 3 Find): any line in Search, Find more or Moments can be dragged straight onto the sequence – it lands where you drop it with its video and audio, cut to the line's own In and Out. Drag a ticked line to bring all the ticked lines, one after another. Premiere and Resolve.

## What's new in 1.3.23

The last pieces from the competitor research, in one update:
- **Same crop per person** (Story › Clips for social, and Make it a promo): instead of the automatic reframe, which can drift from clip to clip, set a crop once for each person – **Left**, **Centre**, **Right** or a slider, and a zoom – and every vertical clip of them uses it. Two people sharing one wide shot each get their own crop. Nothing is looked at; the positions are yours. Premiere and Resolve.
- **Resolve's own transcripts, word by word** (Story › 1 Interviews, Resolve 21.1 and later): **Transcribe with Resolve** now reads the transcription Resolve keeps with each clip – with exact word times and the speakers – and asks Resolve to make one when a clip has none. Clips you've already transcribed in the Media Pool are read at once. Older Resolve works as before (subtitles, timed per phrase).
- **Selects: takes of the same setup and how well it's framed**: clips of the same shot (same place, framing and light) are grouped as a **setup**, each select says whether it's the setup's **best take** or an **alternate**, and **Only the best take of each setup** leaves the alternates out of what's made. Each select also gets a framing score from what was already measured – contrast, nothing blown, a face on a third and not cut by the edge – with **Sort › Best looking first** and **Same setup together**. Nothing new is analysed. Ask: *selects, best of each setup*.

## What's new in 1.3.22

- **Marker pad** (Markers): big buttons at the top of the Markers tab, each making one kind of marker at the playhead – its name, colour and length, on the timeline, the clip under the playhead, or both. Lengths: a point, a number of seconds, the whole clip under the playhead, In to Out, or press to start and press again to end (for logging while it plays). Keys 1–9 press them. **Edit buttons** to make your own set.
- **Colour buttons**: eight big colours that recolour the marker at the playhead (or the ticked ones) with one press.
- **The last marker**: stretch it to the playhead, rename it or delete it.

## What's new in 1.3.21

- **Markers** (Finish & deliver): a new tab for making and managing markers on the open sequence or on clips. Every marker in one list – search, filter by colour, rename, recolour, comment, move and delete them, one at a time or ticked together (rename with a pattern like *Shot {n}*). Add them at the playhead, every so often, at every cut or clip, from the clips' own markers, or from a client's notes or a review tool's CSV export. Copy them as a list or YouTube chapters, save them as a spreadsheet, and remove duplicates. Premiere and Resolve. Ask: *add a marker every 30 seconds*.

## What's new in 1.3.20

- **Punch in on the jump cuts** (Silence Cut): a switch on the cut copy – every other piece of a shot that was cut is pushed in a little (110 %, or what you choose), so the cuts read as changes of framing, like FireCut's and AutoCut's zoom cuts. B-roll above is left alone; a new shot starts at 100 %. Works in Premiere and Resolve. Ask: *punch in on the jump cuts*.

## What's new in 1.3.19

- **Like a reference cut** (Story › 4 Build › Narrative from a brief): point it at a past edit or the transcript file of any video whose shape you like, and the next narrative follows it – the same beats (Hook, Set-up, Turning point, Ending…) in the same proportions, scaled to your length, with your own interviews. Only the reference's transcript text is read by the AI; without AI its length and rhythm are used. Ask: *use this timeline as a reference*.

## What's new in 1.3.18

- **From a script** (Story › 4 Build): paste a script or paper edit and each line is found in the interviews – word for word, cut to just those words, even across two lines – with the next-best takes to choose from. Lines said in other words can be matched by meaning with AI (only text is sent). Then **Build the script**, in its order, a group per section. Like Jumper's Script Editor and Premiere's Paper Edit, but across every interview at once and in Resolve too. Ask: *build from my script*.

## What's new in 1.3.17.1

A small update to the Word cloud:
- **List** view: the words ranked, with a bar for how often each is said. **How many words** sets the size of the cloud (20–200).
- **Order** when building: **As said** (interview by interview), or **Mix the voices** – taking turns between the people saying it, the classic supercut.
- **Tick all / Untick all** for the mentions; **Copy the counts** or **Save as spreadsheet** (word, times said, lines, interviews).

## What's new in 1.3.17

- **Word cloud** (Find the good bits): the words and phrases said most in your interviews, as a cloud – bigger means said more. Choose who: everyone, everyone but the interviewer, or one person. Click a word to see every time it's said, with the words around it, who said it and when, and play any of them. Then **build a sequence** of them – just the words (a supercut), the whole line or the full sentence – or add them to Story as a theme. Shift-click to build several words at once, one group and colour each. Counted on this computer from Story's transcripts; nothing is sent anywhere. Ask: *build every time they say "community"*.
- Decided: **Podcast** stays its own tool in Cut faster, and audio levelling stays with Premiere's and Resolve's own tools.

## What's new in 1.3.16.1

A small update to 1.3.16 – fixes found in a review of the weekend's work, before anyone used them:

- Story builds no longer stop with an error on single-speaker interviews, and **Whole sentences** only joins lines that are close together.
- **What was sent to AI** keeps its record across sessions (a start-up tidy-up used to empty it).
- **Ask › Edit**: deleting a line you've cut around deletes that line, not what came before it; several deletes and speed changes run from the end so they can't move each other; the self-check reads the new times.
- **Podcast**: a camera keeps following its person when a mic is added or taken away; the on/off switches mean the same from the Assistant; no overlapping shots at the start.
- **Fillers**: *cut the ums* cuts only fillers (false starts only when you ask); a sentence with a comma isn't taken for a false start; long restarts are listed but left unticked.
- **Take Sets**: cuts never reach into the next take, overlapping ones are joined, and the kept-take markers sit exactly where the takes end up.
- In Resolve: the title tracks are switched back exactly as they were after rendering; a speed-changed camera clip is flagged; a camera track is put back if Resolve won't lay its pieces.

## What's new in 1.3.16

- **Overnight prep does more** (Home): besides transcripts, themes, moments, the interview log and Selects, it can now **make the beat map**, **find clips for social**, and **then run a recipe** – for example *Podcast episode* on the open sequence – all within the AI limit agreed when you press Start. Edit steps in a recipe are left for the morning, because they need checking; the report says so.

## What's new in 1.3.15

- **AI on this computer** (Settings › AI): choose **On this computer** and Ultra Studio uses a model running locally – Ollama or LM Studio – so not even text leaves. **Find models** lists what's installed; **Test** checks it answers. It only ever talks to this computer (an address elsewhere is refused). Small local models are fast but clearly weaker at story work, so themes, narratives and edits come out simpler – try an 8B model or larger.
- **This project: nothing leaves this computer**: a switch per project, for NDA or broadcast work. That project then uses only the local model – or no AI at all – never Claude or Gemini, whatever else is chosen. The top bar says so.

## What's new in 1.3.14

- **Beat map** (Story › 4 Build): every passage of the interviews scored on what you're looking for – **Emotion**, **Humour**, **Information**, **Conflict**, **Surprise** – and shown as a heat strip per interview, so the strongest parts stand out at a glance. Click a passage to read and hear it, with its scores and what makes it stand out; **The strongest** lists the top ones. **Add to the board**, drag the board's beats into order (or ↑ ↓), and **Build the board** as a sequence. Only text goes to the AI; without AI, word cues score it. Ask: *show me the most emotional moments*.

## What's new in 1.3.13

- **Clips for social** (Story › 4 Build): short clips that stand on their own, from your interviews or from what is heard in a timeline (a podcast episode, a rough cut). Each comes with a hook, a title, a score for the hook, standing alone, the payoff and the length, and why it works – not a bare "virality" number. A clip can join two moments (a question and its answer); every part ends on a whole sentence. Tick the ones you want and **Build the ticked clips**: each gets its own sequence with the hook as a marker, a vertical version (9:16, 4:5 or 1:1, using Premiere's Auto Reframe or Resolve's Smart Reframe) and captions. Only line text goes to the AI; without AI, strong stretches by one speaker. Ask: *find 5 short clips from this podcast episode*.

## What's new in 1.3.12

- **Podcast** (Cut faster): cuts between the cameras of a video podcast by who is speaking. Say whose mic is whose and what each camera shows (save it as a preset per show); each mic is heard on its own, on this computer, against its own levels, so bleed doesn't steal the shot. Editor's rules: shortest and longest shot (Long-form, Standard, Promo), a cut a few frames after the voice starts, *mm-hm*s ignored, the wide on crosstalk, long silences and at the ends, reaction shots in long answers, cutaways on sentence ends. Every switch is listed – untick one to keep the shot before. The copy keeps every camera, cut and switched on or off, so it stays re-switchable. Works in Resolve too (each camera laid again in pieces). Ask: *switch the podcast cameras*.
- **Podcast episode** recipe: switch the cameras → cut the fillers and false starts → write the episode text, in one go.

## What's new in 1.3.11

- **Take Sets** (Selects & clips): the retakes in a sequence – pieces to camera, interview do-overs, podcast reads – grouped by what they try to say, even reworded or minutes apart, with the last complete take chosen. Pick another or keep them all, check what will be cut, and get a copy of the sequence with only the chosen takes: every track cut together, a marker on each kept take, and never words from two takes stitched together. Paste the script to judge takes against it. Without AI it groups retakes that share most of their words. Ask: *keep the best takes*.

## What's new in 1.3.10

- **Fillers and false starts** (Silence Cut): found from the words in Story's transcripts of the clips in the sequence – *um*, *uh*, *er*, doubled small words (*I I went*), restarted sentences (*we went to the – we went to the shop*), and, if you ask, soft fillers between commas (*, you know,*). Each one is listed with the words around it: untick any you want to keep, press ▶ to hear it in the Timeline, then **Make a cut copy** – with the pauses too if you found them, in one copy. With Premiere's word timings the cuts are exact; otherwise they're estimated and left unticked for you to check. Ask: *cut the ums and the false starts*.
- **The review list**: one list for every automatic change – tick, untick, filter by kind, tick or untick all, and go to each – so nothing is cut that you haven't seen. Take Sets and the podcast switcher use it too.

## What's new in 1.3.9

- **Length** (Story › 4 Build): type a length like *3:00* and the cut is fitted to it (±10%): the weakest lines are left out, from the longest themes first, until it fits – pinned lines and each theme's best line stay. It never makes lines up: if there aren't enough, it says so. The Assistant understands *build a 3 minute cut from the themes*.
- **Recipes** (Ask): a chain of steps saved under a name and run again on another project in one go. After any plan runs, **Save as a recipe**; after an Ask › Edit, save the request itself. Three to start with: *Get interviews ready* (transcripts → themes → moments → interview log), *Themes into a string-out* and *Check and deliver*. An edit step stops for you to check its plan, then the recipe carries on. Run one from its chip, from **All recipes…**, or by asking *run my … recipe*.
- **Episode text** (Deliver): title ideas, a description, show notes with times, YouTube chapters, pull quotes (checked word for word against the transcript), social posts and keywords – from what is said in the open sequence. Add notes for the writer (show name, tone, links). Copy each part, save them all as one text file, or add the chapters as markers. Without AI: chapters from your markers and the strongest lines as quotes.

## What's new in 1.3.8.2

A small update to 1.3.8.

- **Names and terms** (Story › 1 Interviews): spell names, places and jargon as they should be, with how the transcription heard them (*Jacob Gersch* – heard as *Jakob Gersh*). Apply, and every line is corrected – search, themes, captions, text layers, documents and AI requests all use the right spelling. The original text is kept, so applying again never doubles a name and removing one puts it back; word timings stay exact. **Suggest from the transcripts** finds names spelt more than one way. Tick **Keep out of AI** and the name is replaced by *[Name 1]* in everything sent to Claude or Gemini and put back in the answer – *What was sent to AI* shows it.
- **Soundbites** (Story › 4 Build): rules every built sequence follows – **whole sentences** (a line that stops mid-sentence runs on into the same speaker's next lines; never across to someone else), **leave out the interviewer**, a **shortest soundbite** (1.5 s to start with), **tight edges** on the first and last word, and **say why each clip is there** – a marker with the reason (a narrative beat's purpose, an answer's note, a moment's type). Lines a narrative trimmed on purpose keep their trim.

## What's new in 1.3.8.1

- **What was sent to AI** (Settings): every AI request's exact text is kept on this computer, per project, for 90 days – click one to read it, copy it or save it as a text file for a client. Large parts sent again and again (the shared transcript) are stored once. Switch the log off if you'd rather not keep it.
- **Show me before sending**: set it to **Always** and each AI request opens first with the text and its cost – **Send**, **Send the rest of this job** (for features that send several requests) or **Cancel**, which sends nothing. Otherwise Ultra Studio asks only when a request costs more than your limit, as before.

## What's new in 1.3.8

- **Ask › Edit**: say what to change in your sequence or project and the AI plans it – dissolves on every cut, a punch-in on each answer, dip to black where the speaker changes, lower thirds with each speaker's name, audio fades, effects, speed, labels, markers, cuts, deleting, renaming, moving clips to bins. Choose **where** it acts: the sequence, its selected clips, the transcript lines heard in it, a bin or the whole project. You check the plan first; sequence edits run on a copy; then it reads the result back, checks it against what you asked and offers what's still missing.

Also in this version (first tried as 1.3.7.1):

- **Song Splitter finds the right number of songs**: it listens once and remembers every place a song might end, with how sure it is. Applause and longer talk between songs are the surest signs; a key change alone (a solo, a bridge) no longer starts a new song unless you ask for more. New **Fewer songs – more songs** slider, and a box for **the number of songs played** if you know the setlist – both re-sort the list instantly, without listening again.
- **MC Selects** shows a still of each camera (the file's own preview from Finder or Explorer – nothing is rendered), the **camera model** when the file says (Sony, Canon, Panasonic Lumix, Fujifilm, Nikon, GoPro, DJI, iPhone…), and the **total running time** of the cameras you keep.
- **Subclip Maker** can make subclips of **every clip on the timeline** (the part used), and put them in **a new bin you name or a bin you choose**. **Add handles** (off by default) adds a few seconds each side.
- **Deliver › Render ranges** can use **text layers** as well as adjustment layers – they show their name in the Timeline. The text is kept out of the renders. In Resolve: Text and Text+ titles.
- **Reload** (↻ in the top bar) loads Ultra Studio again – a new version or test copy takes effect without closing and reopening the panel. Your settings and Story work are saved first.
- Text layers used as render ranges are named by the words they show, not “Graphic” (a name you give the clip yourself wins).
- **Selects, Subclip Maker and MC Selects** have their own section in the tool bar, **Selects & clips**, under Story.

## What's new in 1.3.7

This version brings together what was added on the Mac and on Windows: everything from 1.3.6 (**MC Selects** and **Subclip Maker**, below) plus:

- **Narrative from a timeline** (Story › Build › Narrative from a brief): a new **Lines from** switch. **Your themes** works as before (your themes, as chosen by How picky, plus other lines on the topic). **A timeline** makes the story only from the interview lines heard in a sequence you choose – a selects sequence, a string-out of your picks or a rough cut. The open sequence is chosen to start with. Story reads the timeline again each time, so changes to it count. A topic in the brief still narrows it to lines about that topic; the alternative selects come from the same timeline; with AI only the text of those lines is sent. Works the same in DaVinci Resolve.

## What's new in 1.3.6

- **MC Selects** (Cut): from a cut multicam edit (the multicam clips on V1), see every camera by its file name with how many cuts and how long it's on screen. Keep the ones you want and get a new sequence of just their shots, back to back in the order you edited them, each cut its own clip with no handles. Give each camera a label colour if you like, and add its scratch audio. Your choices are remembered. Works with multicam source sequences and with nested sequences switched to multicam.
- **Subclip Maker** (Find): choose a bin and every clip in it becomes a subclip of only the part between the In and Out you set on it, with restricted In/Out – so long clips show just that part in thumbnails and when you scrub. Clips without In/Out are kept whole. They go in a new bin next to the original, "<bin> – Subclips", numbered in filming order with the original file name ("01 – C0012.MP4"). If subclips with the same names are already there you're asked first: **Replace** (the earlier ones move to "<bin> – Subclips – earlier", as add-ons can't delete clips) or **Add alongside** (the new ones get "(2)", "(3)"…).
- **In DaVinci Resolve** Subclip Maker works the same, from each clip's Mark In and Mark Out. MC Selects isn't offered in Resolve: Resolve doesn't let add-ons see which camera a multicam cut shows.

## What's new in 1.3.5

- **Ask about your interviews.** **Ask › My interviews**: ask anything about what your interviews say – *every story about Grandma, in the order it happened*, *where do Ruth and Sam disagree?*, *a 45-second opening about why they came*. You get a short answer and the clips, grouped and whole. Play, reorder, take out, rename and recolour them, then choose how they land: a **new sequence** (grouped and coloured, with markers or name layers), **range markers** on a sequence you have, **themes**, **Word** or text. Type a change under the answer (*shorter*, *leave out Sam*) and it reworks it. Needs AI.
- **Interview questions.** **Story › 3 Find › Questions**: paste the questions you asked and the AI finds every full answer to each, labelled by question – from where they start answering to where they move on. **Build the answers** or **Save as Word**.
- **Your interviews are read once.** With Claude, every Story AI feature – themes, Find more, moments, questions, the narrative, Ask – now starts from the same copy of your transcripts, which Claude keeps for an hour. After the first request each one reads them at a twentieth of the price. The line where the *How much the AI reads* slider was shows when Claude has them, and what a request costs.
- **Narrative from a brief**: a box for the **client's notes** – paste emails, briefs or documents with what they want, and the story follows them. **Alternative selects**: the lines that didn't make the story (the AI says why), from 5 up to all of them, shown under the narrative and, if you like, added at the end of the sequence after the payoff.
- **Find**: **Select all / Unselect all** on every list, and **Add to a new sequence…** with a name you type.
- **Keep clips in the order they were filmed** – a switch on every Story build (themes, bins, the narrative, questions, moments, Ask).
- **Build**: **All on / All off** for the themes to include. **Highlight selects in a string-out** can put markers on the **timeline, the clips, or both**.
- **Deliver › Render ranges**: choose **any video track** – or **New track on top for render ranges** – and change a range's colour from a drop-down. **Client notes** is gone from Deliver.
- **▶ plays from the right place on camera footage.** On clips with their own timecode (for example starting 19:39:28:20), ▶ in Story and the preview in Selects played from the start of the clip; now they play from the line.
- **Stop**: one click stops after the current step; **three quick clicks stop at once**, AI requests included – no need to close the panel.
- **AI**: the top bar shows which AI is in use, or **No AI**; features that work best with AI say when they're running their basic version, and **Settings › Without AI** explains what still works. Settings names the **Gemini model** (Google's newest Flash, now 3.8 Flash) and lets you pick one, with what the free tier means. **Usage by API key** in Settings › Cost.
- The version shows in the top bar. **B-roll** and **Sound Check** are paused for now (their code is kept).
- **In DaVinci Resolve** all of this comes too, with Resolve's differences: Ask's group names are markers or range markers (no name layers), render ranges stay groups of range markers (no new track needed), and ▶ already played lines in the panel itself.

## What's new in 1.3.4

- **Song Splitter lays adjustment layers above your edit.** On a sequence, **Adjustment layers above the edit** puts each song on a new **Songs** track as an adjustment layer numbered 1, 2, 3…, with the talk and applause too, colour-coded (songs green, talk blue, applause orange).
- **Render ranges from any layer track.** Deliver › Render ranges can take its ranges from the **Songs** track (or any track with adjustment layers), not only **Renders** – name the songs, then render them all in one go.
- **Render only one colour** – for example just the songs.
- **See and change your ranges in Ultra Studio:** each range is listed with its colour and times; go to it, rename it, change its start and end (or set it to your In and Out points), change its colour, or delete it.
- **The list keeps itself up to date** while you add, trim or rename layers in the Timeline.
- **A file-name ending** (such as *_1* or *_v2*) on every render and on the export pack.
- **In DaVinci Resolve** the same arrives with coloured **range markers** instead of adjustment layers (Resolve can't make adjustment clips from a plugin): Song Splitter's songs are markers in a **Songs** group, and Deliver › Render ranges › **Ranges** chooses Renders or Songs. Their colours come straight from Resolve.

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
