/* JMG Ultra Studio – the tour's steps (js/tools/03-tour.js shows them). One entry per tool id, plus "overview".
   KEEP THIS UP TO DATE: when you add, rename or move a tool, a button or a card that a step points at, change its steps
   here (or give the tool its own `tour: [...]`). dev/tests/tour.test.js fails when a tool has no tour, when a step points
   at something that isn't on screen, or when a rail place has no step in the overview.
   Write like the rest of the panel: short, friendly, plain British English, Premiere's words (Resolve's are put in). */
(function () {
  'use strict';
  const US = window.US;
  US.TOURS = {
    overview: { title: 'Ultra Studio in a minute', steps: [
      { tool: 'home', target: '@rail:home', title: 'Home', text: 'Where this project stands, what’s new, and Check my setup – a real test that everything works on this computer.', tip: 'Start here when something seems wrong: Check my setup says what to fix.' },
      { target: '@rail:bring', title: 'Bring in', text: 'Get material into the project: download videos from YouTube, Vimeo and many other sites straight into a bin.' },
      { target: '@rail:story', title: 'Story – the heart of Ultra Studio', text: 'From interviews to a cut, step by step: read the transcripts, find the themes and the lines you need, build a sequence or a narrative, and share the documents.', tip: 'Lines (every theme and line in one table – great on a wide panel), Story wiki, Word cloud and Producer are tabs inside Story.' },
      { target: '@rail:cut', title: 'Cut', text: 'Tools that make the edit faster: Silence Cut takes the pauses out, Beat Cut cuts to the music. They always work on a copy.' },
      { target: '@rail:finish', title: 'Finish', text: 'Polish and check before export: one-click effects, every marker in one list, social safe zones and Final Check for black gaps and flash frames.' },
      { target: '@rail:deliver', title: 'Deliver', text: 'Every export in one go – the master, vertical and square versions, render ranges, YouTube chapters and the episode text.' },
      { target: '@rail:ask', title: 'Ask', text: 'Say what you want in plain English – run a tool, or ask anything about your interviews.', tip: 'Only text is ever sent to the AI: your request or transcript lines, never footage.' },
      { target: '@rail:advanced', title: 'Advanced', text: 'Tools for particular jobs – Selects, Subclip Maker, MC Selects, Take Sets, Song Splitter, Podcast – and the ones still in development.' },
      { target: '@search', title: 'Search everything', text: 'Find any tool, action, setting or line from your interviews. Type a few letters and press Return.', tip: 'Shortcut: ⌘K (Ctrl+K on Windows) while the panel is active.' },
      { target: '@ai', title: 'AI – optional', text: 'Shows the AI in use, or “No AI”. Everything works without it; with it, Story’s themes and Ask get smarter. Click it to add a key.' },
      { target: '@status', title: 'What’s happening', text: 'Every job shows here with its progress and time left, and a Stop button. Click it for the activity log.' },
      { target: '@settings', title: 'Settings, and this tour again', text: 'AI keys, markers, where files go – and Layout › Classic rail if you prefer one rail button per tool. Take this tour again from here.', tip: 'Every tab has its own short tour: the ? at the top of the tab.' }
    ] },

    home: [
      { target: '[data-section="next"]', title: 'Where you are, and what’s next', text: 'The five stages of the edit, ticked as you go, and one suggested next step for this project. Click a stage to go there.', tip: 'Below it: the last things you ran, to pick up where you left off.' },
      { target: 'text:Check my setup', title: 'Check my setup', text: 'A real end-to-end test: it talks to Premiere, reads a clip and checks each tool has what it needs.', tip: 'Copy the report and send it if you ever need help.' },
      { target: '.featured-card', title: 'Story at a glance', text: 'How far this project has got – interviews read, lines, themes, narratives – with one click to each step.' },
      { target: 'text:Overnight prep', title: 'Overnight prep', text: 'Leave the computer working: transcripts, themes, moments and the interview log, with a report here in the morning.' }
    ],
    youtube: [
      { target: 'text:Links', title: 'Paste the links', text: 'One link per line – YouTube, Vimeo, Instagram, TikTok and many more.' },
      { target: 'text:Where they go', title: 'Where they go', text: 'A folder and a bin in your project, or just a folder.' },
      { target: 'text:Download and import', title: 'Download', text: 'Each video is downloaded and imported, ready to edit.' }
    ],
    story: [
      { target: 'text:1 Interviews', open: { tab: 'transcripts' }, title: 'Five steps', text: 'Interviews › Themes › Find › Build › Share. A tick shows a step that’s done; you can jump to any step.', tip: 'Story is saved with the project, so it opens the same on your other computer.' },
      { target: 'text:Get transcripts', open: { tab: 'transcripts' }, title: '1 · Get the transcripts', text: 'Story reads Premiere’s own transcripts (free, private, accurate) or files you import – SRT, VTT, CSV or text.' },
      { target: 'text:2 Themes', title: '2 · Themes', text: 'Group the best lines by what they’re about – your own themes and the ones Story finds.' },
      { target: 'text:3 Find', title: '3 · Find', text: 'Search for anything the themes missed, or let Story find moments and the answers to your questions.' },
      { target: 'text:4 Build', title: '4 · Build', text: 'Turn the lines into a sequence, a narrative from a brief, clips for social or a beat map – always as a new sequence. Build asks “What do you want to make?” and shows that one; Show all shows them all.' },
      { target: 'text:5 Share', title: '5 · Share', text: 'The interview log and paper edit for your director or client, and a transcript of any sequence.' }
    ],
    storylines: [
      { target: '.sl-themes', title: 'Themes', text: 'Pick a theme – or All lines, or the lines in no theme yet. The number is how many lines it has at the pickiness chosen above.' },
      { target: '.sl-table', title: 'Every line in one table', text: `Who, when, the line, its theme, ★ for a strong complete line, and its length. Click a column to sort; shift- or ${US.fsx && US.fsx.isWin ? 'Ctrl' : '⌘'}-click to pick several.`, tip: 'Keys: J and K move, space plays, Return puts the lines at the playhead, / filters.' },
      { target: '.sl-insp', title: 'The line you picked', text: 'Read it in full, play it, open it in the Source Monitor, put it at the playhead, or find more like it. With several picked: put them all at the playhead, or make a new theme from them.' },
      { target: '.sl-find', title: 'Filter', text: 'Type a word, a speaker or a theme to narrow the table.', tip: 'Widen or undock the panel to see the themes, the table and the line side by side.' }
    ],
    wiki: [
      { target: '@head', title: 'Story wiki', text: 'A quick reference made from every interview: an overview, each interview in brief, and the people, places and dates – each fact with the line that says it.', tip: 'It needs AI. Without it, Story › Find searches the same transcripts.' }
    ],
    words: [
      { target: '.word-opts', title: 'Whose words', text: 'Choose whose words count – everyone but the interviewer, one person or all – and whether word forms and phrases go together.' },
      { target: '.word-cloud', title: 'The cloud', text: 'Bigger means said more. Click a word to see every time it’s said; shift-click to pick several, then build a sequence of them.' }
    ],
    producer: [
      { target: '@head', title: 'Producer', text: 'A second opinion from the transcripts: notes on your cut, and what a pick-up interview should ask.' },
      { target: '.segmented', title: 'Two kinds of help', text: 'Notes on the cut, or a plan for a pick-up interview with the questions to ask.', tip: 'It reads the transcripts as text – never the footage.' }
    ],
    silence: [
      { target: 'text:Find the pauses', title: 'Find the pauses', text: 'Ultra Studio listens to the sequence and finds every pause. Nothing changes until you make a cut copy.' },
      { target: 'text:Fillers and false starts', title: 'Fillers and false starts', text: '“Um”, “uh”, doubled words and restarted sentences, found from Story’s transcripts. Untick any you want to keep.' }
    ],
    beats: [
      { target: 'text:Find the beat', title: 'Find the beat', text: 'Premiere has no beat detection – this finds the beat and the bars, marks them, and can cut a bin of clips to the music.', tip: 'Select a music clip first, or choose a sequence.' }
    ],
    agent: [
      { target: 'text:Make plan', title: 'Agent', text: 'Give it a goal; it plans, searches your interviews and builds a cut on a new sequence. It needs AI.' }
    ],
    quickfx: [
      { target: 'text:Transitions', title: 'One click, many clips', text: 'Select clips in the Timeline, then click a button: it goes on every selected clip, or every clip.' },
      { target: '.pad-grid', title: 'Your favourites', text: 'Star a button to keep it at the top.', tip: 'Undo works as usual: ⌘Z / Ctrl+Z in Premiere. A greyed-out button says why when you click it.' }
    ],
    markers: [
      { target: 'text:Marker pad', title: 'Marker pad', text: 'Each pad adds a marker at the playhead – press its number key for speed.' },
      { target: 'text:Add markers', title: 'Add markers in bulk', text: 'From pasted notes, at every cut, or every so often.' },
      { target: 'text:Export and tidy up', title: 'Export and tidy up', text: 'Save the markers as a list, a spreadsheet or YouTube chapters, and remove duplicates.' }
    ],
    safezones: [
      { target: '@head', title: 'Safe Zones', text: 'Social crops and where each app puts its buttons, so your text stays clear – or letterbox bars to any shape.', tip: 'Deliver hides the guides automatically when it exports.' }
    ],
    check: [
      { target: 'text:Check the cut', title: 'Final Check', text: 'Catches black gaps, flash frames and offline media before you export. Checking never changes your cut.' },
      { target: '.segmented', title: 'Three kinds of check', text: 'This cut, two versions compared, or the whole project.' }
    ],
    deliver: [
      { target: 'text:Outputs', title: 'Choose the outputs', text: 'The master plus vertical, square and portrait versions, sound only and a thumbnail – all in one go.' },
      { target: 'text:Export', title: 'Export', text: 'Everything goes out together, named after the sequence and the date.', tip: 'The other tabs here: Render ranges, Bin export, Chapters and Episode text.' }
    ],
    assistant: [
      { target: '@head', title: 'Ask', text: 'Say what you want in plain English: “cut the silences”, “markers on every beat”, or a question about your interviews.', tip: 'Anything that changes the project is shown as a plan first – nothing runs until you press Run.' }
    ],
    advanced: [
      { target: '.tiles', title: 'Tools for particular jobs', text: 'Selects, Subclip Maker, MC Selects, Take Sets, Song Splitter and Podcast. Each opens here and has a link back.' },
      { target: 'text:In development', title: 'In development', text: 'Tools still being made. Parts may not work yet – try them on a copy.' }
    ],
    selects: [
      { target: 'text:What counts as usable', title: 'Selects', text: 'Grades any footage Best / Good / OK and leaves out only what’s technically unusable – blurry, far too dark or shaky.' },
      { target: 'text:Find selects', title: 'Find selects', text: 'Then sort them into bins by type, mark the best and make a selects sequence.' }
    ],
    subclips: [
      { target: 'text:Make subclips', title: 'Subclip Maker', text: 'Every clip in a bin (its In to Out) or on the timeline (the part used) becomes a subclip – handy for browsing long clips.' }
    ],
    mcselects: [
      { target: 'text:Cameras – keep or reject', title: 'Choose the cameras', text: 'From your cut multicam edit, tick the cameras to keep.' },
      { target: 'text:Make the MC Selects sequence', title: 'Make the sequence', text: 'Just the shots from those cameras, back to back in edit order, each camera in its own colour.' }
    ],
    takes: [
      { target: 'text:Find the takes', title: 'Take Sets', text: 'Retakes grouped by what they say; the best take of each is kept and the rest cut from a copy.' }
    ],
    songs: [
      { target: '@head', title: 'Song Splitter', text: 'Splits a concert or event into songs, applause and talk.' },
      { target: 'text:Find the songs', title: 'Find the songs', text: 'Then markers, subclips or a sequence per song.' }
    ],
    podcast: [
      { target: 'text:How it cuts', title: 'Podcast', text: 'Cuts between the cameras of a video podcast by who is speaking, with an editor’s rules – and you can switch again.' },
      { target: 'text:Read the tracks', title: 'Start', text: 'Ultra Studio reads which microphone is whose, then listens.' }
    ],
    colour: [
      { target: '@head', title: 'Colour (in development)', text: 'Looks and LUTs previewed on your shot, quick grading, camera matching and a log-footage check.' }
    ],
    cameras: [
      { target: 'text:Make a camera cut copy', title: 'Camera Switch (in development)', text: 'Cuts between interview angles at sentence ends, on a copy.' }
    ],
    broll: [
      { target: 'text:Make a B-roll copy', title: 'B-roll (in development)', text: 'Covers the jump cuts in your interviews with your best B-roll, on a copy.' }
    ],
    sound: [
      { target: 'text:Check the sound', title: 'Sound Check (in development)', text: 'Checks the loudness, fixes it and ducks the music under speech – on a copy.' }
    ],
    mvfx: [
      { target: '.mvfx-grid', title: 'mVFX (in development)', text: 'Documentary titles – names, dates, quotes and credits – placed as one clip at the playhead.' },
      { target: 'text:Colours and fonts', title: 'Your look', text: 'Colours and fonts for the whole pack.' }
    ],
    memorybox: [
      { target: 'text:Connect', title: 'Memory Box (in development)', text: 'Bring a family’s photos and videos from Memory Box into one bin, in story order, each with its story, people, date and place.' }
    ],
    settings: [
      { target: 'text:AI (optional)', title: 'AI is optional', text: 'Choose Claude, Gemini, AI on this computer, or none. Only text is ever sent – never footage.' },
      { target: 'text:Layout', title: 'Layout', text: 'Classic rail brings back one rail button per tool.' },
      { target: 'text:What was sent to AI', title: 'What was sent to AI', text: 'Every request’s exact text, so you can always see what left this computer.' }
    ]
  };
})();
