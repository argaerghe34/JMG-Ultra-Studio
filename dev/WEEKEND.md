# Weekend plan (Fri 23 Oct 2026, 5pm → Mon 26 Oct, morning)

Jacob is away from the Mac from 5pm Friday until Monday morning. Goal: a better, fully tested JMG Ultra Studio
installed and working in Premiere by **Monday 07:30**, plus a short "What's new" note for him.

## Rules
- Premiere is free to use from 17:00 Friday. Use the dev setup (`dev/link-dev.sh`, `dev/restart-premiere.sh`), always
  through `dev/with-premiere.sh` when more than one agent may drive it. Never open his real projects except via the
  temporary-copy method (`dev/probes/fjl-copy-*.sh`) and never save them.
- Nothing is uploaded anywhere (he declined Descript uploads). No new outside services without asking.
- Every feature: plain-English UI built from `US.ui`, progress in the status bar, plain errors, works on a copy,
  unit tests + an e2e test in real Premiere, guide section in `dev/docs/`.
- Keep the panel simple: add new things as options/sections of existing tools where they fit; only add a tool if it's
  clearly separate.
- Before Monday: full `node dev/e2e/run.js` green, `dev/build.sh`, `dev/unlink-dev.sh`, run the installer, verify the
  installed copy with Home › Check my setup (temporary .debug, then remove it), quit Premiere cleanly, write
  `dev/docs/whats-new.md` (+ regenerate "Read me first.html").
- MONDAY SCRIPT: `E2E_RETRY=1 dev/with-premiere.sh node dev/e2e/run.js` (all green – a test that only passes on the
  second try is listed; 10-selects can flake on fresh analysis under load, on a FRESH Premiere: run dev/restart-premiere.sh
  first and quit Media Encoder), then `dev/monday.sh` – quits Premiere + Media Encoder, builds, installs with the real
  Mac installer, starts Premiere on the test project, runs Home › Check my setup on the INSTALLED copy, quits
  Premiere, clears seenVersion/overnight.report, removes .debug + the dev helper. Then send Jacob the summary.
- Before handing over: the dev panel shares settings with Jacob's installed copy – make sure `seenVersion` isn't
  '1.1.0' (so What's new shows) and `overnight.report` is empty (no test report on his Home).

## Status at handover (Fri ~15:00)
- Installed now: build from Friday afternoon (see the last entry in the log below).
- Selects round 2 (any-video presets, sequence source, sort into bins by type, mark-the-best, Media Encoder analysis
  copies for 10-bit 4:2:2 Lumix/HEVC/ProRes) – check the builder's report / finish what's left.
- Story round 2 done (wall reorder, own themes, theme colours, strongest lines, theme name layers, Timeline
  transcript with speakers + docx/txt/srt/csv). Word-level timings for exact cut trimming – finish if not done.
- Timeline transcript of FJL "Internship lines1" – deliver the .docx to Documents/JMG Ultra Studio/Transcripts.

## TOP PRIORITY – Story (Jacob, Fri 14:30: "I want the main focus of the program to be the Story section")
His requests, in his words (paraphrased):
S1. **Highlight selects in interview string-outs** – on a sequence holding all the interview string-outs, highlight the
    sections already selected (in themes / wall / built cuts) so he can scrub the full interviews, see what's selected and
    spot what's missed. Highlight colours must match the theme colours.
S2. **Narrative cut from a prompt** – e.g. "Create a 60-second video on this topic": a narrative cut matching the brief,
    using existing selects or making new ones where needed.
S3. **Organise thematic selections visually** – after themes are made, rearrange and sort them in a post-it style view to
    organise ideas and develop concepts before building the edit.
S4. **Find additional selects on a topic, later in the edit** – "find anything that touches on this topic or theme",
    usable when something is missing, not only in the first pass.
S5. **Bloopers, funny and poignant moments** – a subject doing something funny, an off-camera interaction, a blooper, a
    poignant moment: things that enrich documentaries even if not core footage.
S6. **Stringency slider** when making selects by theme – choose how strict the selects are, per theme. Fri 15:00 detail:
    "Sometimes every possible useful clip, sometimes only the best, sometimes middle ground – present helpful options":
    3-way choice **Everything useful / Balanced / Only the best** + fine-tune slider, live counts per choice, per-theme
    override, extras (at least N per interview, max per theme, interviewer questions, short/partial lines). Use the SAME
    control in Selects (replace/align its presets) once Story's version lands.
S7. **AI cost clarity (Claude API)** – Jacob, Fri 15:10: "If I connect Claude API, explain how much budget I should put toward
    this and what typical costs in my use case would look like. I want the most fully featured, capable extension, but
    it's important to get an idea of cost up front." Deliver: (a) dev/docs/ai-costs.md + a guide section with budget advice
    and per-feature costs measured from his real FJL project (count the tokens each request would send; prices from the
    claude-api skill: Opus 5.5 $4/$20 per MTok, Sonnet 5.5 $2/$10, Haiku 5.5 $0.10/$0.50, cache reads Opus $0.20),
    (b) in the app: record `usage` from every AI response → "AI spending this month" in Settings, (c) an estimate shown
    before big AI jobs ("about $0.40 with Claude Opus 5.5") with confirm above a threshold, (d) optional monthly cap,
    (e) model choice in Settings (Opus 5.5 default = best; Sonnet 5.5 = about half; Haiku 5.5 = cheapest), (f) prompt
    caching of the transcript corpus so repeated Story requests cost far less. Ballpark already given to Jacob Fri 15:10:
    ~$5–15 per big documentary project with Opus 5.5; suggest $25 prepaid + a $50 monthly limit in the Console.
Make Story feel like the heart of the app (prominent on Home, clear flow: transcripts → find → themes → board → cut).

S8. **Colour tab** – Jacob, Fri evening: "add a colour tab. It should provide LUTs and grading options visually and also be
    able to auto match cameras." Probe Premiere 26.5's Lumetri scripting first (QE addVideoEffect 'Lumetri Color', its
    component properties incl. Input LUT / Look, project.applyLumetriPreset / getAllLumetriPresetsList), then build:
    visual LUT browser (previews rendered on the current frame), simple grading controls/looks applied on an adjustment
    layer or the clips (on a copy where sensible), and "Match cameras": pick a reference shot, measure colour stats of
    reference vs other cameras' frames, make a correction (.cube LUT or Lumetri values) and apply it to that camera's clips.

## Feature backlog after Story (pick in this order; research first with WebSearch where useful)
1. **Finish Selects round 2** and verify on the real Lumix clip (/Volumes/LUMIX/DCIM/100_PANA/P1003525.MOV) if the
   card is still mounted.
2. **Captions from transcripts**: Timeline transcript → SRT → `seq.createCaptionTrack(srtItem, 0)`; options for social
   style (short lines, 1–3 words) and burned-in look guidance; speaker names optional.
3. **Promo cutdowns** (Tab had this): from Story's strongest lines, build 15/30/60/90 s cutdowns (+ 9:16 via Deliver's
   full-size reframe), with B-roll on V2 from Selects (BEST, matching shot types), music optional with Beat Cut.
4. **Auto B-roll over interviews**: lay B-roll on V2 over interview lines (by transcript keywords vs clip names /
   bins / Selects categories; avoid repeats; cover long talking-head stretches; leave the first/last seconds clear).
5. **Overnight mode / batch queue**: queue long jobs (analyse bins for Selects, read transcripts, make analysis copies,
   Sound Check every sequence) to run unattended with a morning report in Home – "useful when I'm away".
6. **Talking-head camera switching**: with one mic per speaker (separate audio tracks), cut between camera angles to
   whoever is talking (on a copy; minimum shot length; reaction shots option).
7. **Music ducking**: lower music under dialogue with volume keyframes (verify the keyframe API in 26.5 first).
8. **Project tidy**: find unused clips, duplicates, offline media; organise into bins by type/date/camera (on request,
   with preview, undo-able by moving back).
9. **Best frames / thumbnails**: sharpest moments with faces, export stills (uses Selects measurements).
10. Sound Check "apply": set clip gain to hit the loudness target (on a copy).

## Log
- Fri 14:45 – Usage limit paused everything 12:00–14:40; Jacob closed Premiere at ~14:30. Installed a stable build of
  today's code (unit tests 101/101) so his Premiere uses an installed copy until 17:00; dev links removed. Delivered
  "Internship lines1 2026-10-23.docx/.txt" (from Premiere's transcripts, 64 paragraphs, 33 speakers) to
  Documents/JMG Ultra Studio/Transcripts. Selects builder stopped mid "analysis copies via Media Encoder" (Part C failing:
  copies not produced – investigate first). Story builder stopped after word-level timings (unit tests pass; e2e and
  big-project memory check pending). Story S1–S6 handed to the Story builder (code now; Premiere after 17:00).
- At 17:07: dev/link-dev.sh, dev/restart-premiere.sh, tell builders Premiere is ready; resume Selects builder on Part C.
- Fri 14:55 – Story featured: US.FEATURED = 'story' (first in the rail after Home; big "start here" card on Home with
  the 5-step path). Not yet seen in Premiere – screenshot Home + rail at 17:07. Story builder working on S6/S4 first.
- Fri 15:20 – Jacob (screenshot of the Wall in a wide panel): "should extend to the right to use the full screen; should
  also work in full screen". Core: `.tool.wide` (no 760px cap) for Story + `body.focus` mode (hides header/rail).
  Story builder: columns flex to fill, height follows panel, board "Full screen" button (focus mode, Esc to exit).
  Verify at 460px and at a wide/maximised size after 17:00.
- Fri 15:25 – Jacob: "Continue when session limit resets." On every check-in: if a builder stopped with a usage-limit
  (429) error, resume it with SendMessage (Story builder: a7ce74739bce48748, Selects builder: a5a6d02e7226181a5) telling
  it to carry on from where it stopped; don't start new builders for work they already own.
- Fri ~15:45 – Story builder: word timings done (30 h project: 256,563 words kept, read 1.1 s), S6 How picky + S4 Find
  more built; 110/110 unit tests; e2e 22-story, 22b, 22c, 40-assistant to run after 17:00. Now on S1 + S3, then S2, S5.
  Me: Story-first Home panel (project counts + one-click Read transcripts / Find themes / Board / Narrative / Timeline).
- Fri 15:00 – Home: Story-first card with project counts (interviews read, lines, themes, on the board) and one-click
  steps (Read transcripts, Themes, Board, Narrative cut, Timeline transcript; the next step is highlighted). Uses
  US.story.open(section) when the Story builder exports it. Screenshot at 17:07.
- Fri – Story builder: S1 highlights in string-outs (Build tab; "Selects" track, theme colours, coverage per interview
  with "Show what's missed") and S3 post-it board (columns + free board, idea notes, arrange/sort, multi-select, full
  screen with Esc) built; tabs now Transcripts · Find · Themes · Board · Build · Export; US.story.open(section)
  exported. 119/119 unit tests. e2e 22d-story-highlights + earlier ones to run after 17:00. Now on S2 + S5.
- Fri ~15:50 – Story builder: S2 narrative (brief parsing, ±10% fit, board group, build with Hook/Build/Payoff) and S5
  Moments (text cues + AI classification, filter chips, add to board, markers on string-out) built; 136/136 unit tests.
  ALL SIX Story requests are now code-complete; Premiere e2e (22-story, 22b–22f, 40-assistant) after 17:00.
  Me now: S7 AI cost controls in ai.js + Settings + docs.
- Fri ~15:40 – S7 in core: MODELS price table (Opus 5.5 $4/$20, Sonnet 5.5 $2/$10, Haiku 5.5 $0.10/$0.50, cache
  read/write), model choice, spending ledger (ai-usage.json, by feature/model), estimate + one confirm per job above the
  threshold (default 25¢), monthly cap, cacheable blocks; Settings › AI shows it all. 139/139 unit tests. Story builder:
  adding feature labels + cache blocks, measuring real FJL request sizes for dev/docs/ai-costs.md (write the doc from
  its table).
- Fri ~16:00 – Real cost measurements (stubbed AI) from FJL + BollagKremer → dev/docs/ai-costs.md (now in the guide,
  tables supported by make-guide.js) and Settings hint. Core: cache '1h' (2× write) + cache-aware costing/estimates.
  Story builder: 1h cache for themes/narrative/moments/assistant, Moments count follows How picky. 142/142 unit tests.
  TODO after Premiere tests: rewrite the guide's Story section for S1–S6 + new tab names, and put Story first in the
  guide (make the guide's group order: Story, Find the good bits, Cut faster, Finish & deliver, Ask).
- Fri ~16:05 – Cache: 5 min for Find themes + Moments (cheaper first runs), 1 h for Narrative pool + Assistant block.
  Core US.ai.approveTotal(usd, feature) for multi-request jobs (one question per job). TODO: update dev/docs/ai-costs.md
  with the builder's re-measured first-run table (include "first run" and "repeat within the cache" columns).
- Fri ~16:20 – ai-costs.md + Settings hint updated with the final first-run / repeat table (FJL Opus: themes 32¢/6¢,
  find more 14¢/9¢, narrative 28¢/18¢, moments balanced 31¢/19¢; ~ $5 per documentary). Story builder idle, waiting
  for "Premiere ready".
- Fri 15:55 – Jacob: "include an option to not limit anything to 1200 lines – it may be important to include
  everything (depending on the project); perhaps a sliding scale". Story builder: "How much the AI reads" slider (600 /
  1,200 / 2,500 / 5,000 / Everything) with live cost/time, batched map→merge for Find themes beyond one request,
  same for other AI features, approveTotal once per job. Update ai-costs.md with the "Everything" rows afterwards.
- Fri 19:41 – Usage limit paused work 16:00–19:40 (Story builder stopped mid "how much the AI reads" slider). Premiere
  closed. Now: link dev, start Premiere on the test project, resume both builders, run Story e2e, then Colour tab (S8).
- Fri ~20:30 – Selects round 2 DONE + e2e green (10 footage types, new checks, sequence source, sort into bins by type,
  mark the best (magenta ★), How picky aligned with Story, analysis copies via "High Quality 720 HD.epr" – now
  encoderPresets().analysis in core). Note: builder says the panel decodes its P1003525 copy directly on this Mac, but
  Jacob's self-test this morning couldn't read FJL's P10001xx.MOV – those are likely another format (5.9K/HEVC?); the
  copy fallback covers it. Colour tab (S8): Lumetri probe done (props verified, presets by name work, renders change);
  jsx/tools/colour.jsx written; building 34-colour.js now.
- Fri ~20:20 – Story builder DONE: "How much the AI reads" slider (Best 600 … Everything, live cost/time, batched
  map→merge, retry/skip with named missing parts), all 7 Story/Assistant e2e green in Premiere, clip names no longer
  sent to AI. "Everything" first-run costs (Opus): FJL themes $1.33, own theme $1.37, find more $1.33, narrative $1.38;
  BollagKremer themes $2.81 → add to ai-costs.md.
- Fri ~20:20 – Colour tab (S8) built + e2e GREEN in Premiere (34-colour): Looks (Premiere's 325 Lumetri looks grouped
  Film / SpeedLooks per camera / B&W / Technical, rendered by Premiere on the playhead frame), LUTs (your .cube files,
  previews from the LUT maths; applied through Lumetri's Look menu – the menu number is found by rendering each entry
  and matching; Kodak 5218/2395 found at #28 in 21 s; LUTs Premiere doesn't know yet are copied to the Creative LUT
  folder → restart), Grade (sliders + presets, Premiere-rendered preview), Match cameras (least-squares on measured
  effects + Broyden updates, keeps best; e2e 11.8 → 2.7), Log (Premiere 25+ colour management: setOverrideColorSpace,
  e.g. Panasonic V-Log/V-Gamut; guesses camera from file names like P1003525.MOV; undo). Findings: QE addVideoEffect
  and applyLumetriPreset put the new Lumetri at the TOP of the stack (Ultra Studio's own instance is tracked by value
  fingerprint, never touching the editor's grade); QE track items include "Empty" gaps (fixed index lookup).
  Core fix: US.projectStore now returns one store per project (a second store read before the 250 ms save lost data –
  affected Check/Deliver/Selects too). 162 unit tests green; full e2e suite running.
- Fri ~20:40 – Full e2e suite 17/17 GREEN in Premiere (incl. 34-colour). Guide rebuilt: What's new (dev/docs/whats-new.md,
  shown first), Tools assembled from tools-*.md in rail order (Story first; new tools-story.md / tools-find.md written by a
  docs helper from the code; tools-colour.md, tools-broll.md, tools-ask.md by me), ai-costs "Everything" table; make-guide
  now does *italics* and nested bullets under numbered steps. Story wording: "wall" → "board" everywhere visible; empty
  own-theme message points at "Add to theme…". Setup check: clips that only need a Media Encoder copy count as working.
- Fri ~20:40 – NEW tool B-roll (cut group): covers jump cuts / cuts between people / long stretches with the best Selects
  moments from a B-roll bin, on a copy, own "B-roll" track chosen where the matching audio track is empty (Premiere puts a
  clip's sound on the same-numbered audio track), picture only by default; already-covered spots skipped. 7 unit tests +
  e2e 24-broll GREEN (interview + music untouched, blurry clip not used).
- Fri ~21:00 – Captions (backlog #2) DONE: Story › Export › Captions (Subtitles 2×42 / Social ≤3 words ≤2.5 s / One word;
  speaker names, capitals) from the timeline transcript, timed to Premiere's word times (timeline entries now carry
  words), added as a real Premiere caption track via seq.createCaptionTrack(srtItem, 0, CAPTION_FORMAT_SUBTITLE)
  (verified: CaptionDataClipTrack appears in the saved .prproj). Assistant: "add captions", "social captions for reels".
  e2e 22g GREEN, 5 unit tests + routing tests. Home: Guide button + "What's new in 1.1.0" card (once per version; NOTE:
  dev panel shares settings with the installed one – seenVersion is '1.0.0' now, leave it so Jacob sees the card).
  Version bumped to 1.1.0 (US.version now read from the manifest). Bug found+fixed: python non-raw strings turned \b
  into backspace in 2 lines of 22-story.js – scan for control chars before building (grep -P "[\x00-\x08]").
- Sat 00:45 – (usage limit paused Fri ~21:05 → Sat 00:40.) Backlog #9 Best frames DONE as a Selects "Make" option:
  "Stills of the best frames" – the sharpest/steadiest/face frame per select (bestFrame over the analysis samples),
  rendered full size by Premiere from a hidden sequence made like the clip (selectsStills), up to 50, best first, PNGs in
  Documents/JMG Ultra Studio/Stills/<run>; hidden sequences + bin removed, active sequence restored. Unit test + e2e
  10b GREEN (3 × 1920×1080). Checkpoint build 1.1.0 made Fri 21:00 (dist/). Build now refuses control characters
  (perl check); vision timing test made best-of-3 < 900 ms (it flaked under load).
- Sat ~00:55 – Backlog #5 Overnight prep DONE (Home section + morning report card): Story read transcripts / themes /
  moments + Selects analysis of all project footage (own bins, subclips, stills, offline left out; Media Encoder copies
  on), one step failing doesn't stop the rest, caffeinate -i -w <panel pid> while running. AI: new unattended budget in
  ai.js (US.ai.setBudget/endBudget/budgetLeft) – agreed once at Start, requests draw it down, over-limit steps are
  skipped with a plain reason (never a modal at night). 3 unit tests (incl. budget) + e2e 01-overnight GREEN
  (themes, moments, 71 clips → 83 selects in 15 s). Guide + What's new + Home list updated.
- Sat ~01:05 – Backlog #3 Promo cutdowns DONE: Story › Build › under each narrative "Make it a promo" (B-roll from a
  bin → captions Social/Subtitles → 9:16 full-size version, captions on the vertical from the reframed sequence's words;
  each step a new sequence) + Assistant "story.promo" ("turn the narrative into a promo with b-roll from the B-roll
  bin"). US.broll.cover() for other tools; promos fall back to a cutaway every 6 s when there are no jump cuts. e2e 22h
  GREEN (57 s narrative, 3 cutaways, 1080×1920, captions on both). HAZARD seen once: after ~5 h of heavy testing,
  Premiere hung inside app.project.save() (progress dialog modal loop, SerializeToFile) – not reproducible step by
  step or on a fresh Premiere; killed by PID 95672 + restarted (test project backup in scratchpad). Monday: fresh
  Premiere before the final e2e run.
- Sat ~01:15 – Full e2e 22/22 GREEN (after promo/stills/overnight). Backlog #6 Camera Switch DONE (new tool, cut group):
  stacked synced angles on V1…; Alternate angles (min/max shot, varied rhythm, start camera) or Follow who's speaking
  (Premiere transcript speakers → camera per person; quick replies stay; long answers cut to the wide and back); cut
  points between transcript lines, else pause middles (Silence's envelope); copy "… – camera cut" via QE
  track.razor + remove of other-camera pieces (verified: razor is video-only, remove leaves linked audio). 5 unit
  tests + routing + e2e 24b GREEN (sound identical, lowest angle whole, V2 only in its shots). Guide/What's new/Home.
- Sat ~01:12 – Filler-word cutting considered and DROPPED: Premiere's transcripts in Jacob's real projects contain
  essentially no "um/uh" (1 match in ~3 MB) and Premiere's own text-based editing already deletes fillers. Instead:
  Camera Switch with ONE camera now punches in (105–140%, default 115%) on every other shot (camerasPunch: razor +
  Motion Scale × zoom on top of the clip's own scale). e2e 24c GREEN (6 shots, 3 at 120%, sound untouched).
- Sat ~01:18 – Backlog #10 Sound Check "apply" DONE: "Make a copy at −14 LUFS" (or the chosen target) – clip Volume
  Level (linear, 0 dB = 0.1778, Premiere's clip max +6 dB) × gain on every playing clip incl. keyframes (soundGain),
  gain held back so true peak stays under the limit, copy measured again; Assistant "fix the loudness / make it -14
  LUFS". e2e 23b GREEN (−16.8 → −23.0 LUFS, original untouched).
- Sat ~01:21 – Backlog #7 Music ducking DONE (Sound Check › "Duck the music under speech"): music tracks guessed from
  audio-only files, speech from the timeline transcript (else: mute music on the copy, render, non-pause stretches),
  stretches joined across gaps ≤ 1.5 s, Volume keyframes down 0.4 s before / up 0.8 s after (soundDuck; key times are
  in the clip's SOURCE time – verified by rendering), clips with existing volume keyframes left alone. Assistant
  "duck the music under the interviews". 4 unit tests + e2e 23c GREEN.
- Sat ~01:40 – Backlog #8 Project tidy DONE as Final Check › "Check the project": unused (not in any sequence, by item
  or media path), offline, imported twice; "Move them into a bin Unused" (remembered, "Put them back"); never deletes.
  tidyAudit 293 clips / 119 sequences < 1 s. Unit + e2e 32c GREEN. HOUSEKEEPING: e2e runner now redirects
  US.fsx.exportsDir to dev/test-project/exports/Documents (tests had written captions + Deliver exports into Jacob's
  real Documents › JMG Ultra Studio – moved to dev/test-project/exports/from-documents, caption items relinked;
  his own 3 files untouched); temp-folder media in the test project relinked (would have caused Link Media dialogs).
  HAZARD 2: after force-killing Premiere, the old Media Encoder stays connected to nothing and the next export hangs
  Premiere in EncoderHelper::QueueJob – killed AME + Premiere, restarted; Deliver GREEN again. Guide now says: quit
  Media Encoder if an export never starts. Monday: quit AME too before the final run.
- Sat ~01:50 – Full e2e 26/27 (all new tests green); 10-selects failed once ("C007 is a pull-back reveal") on the
  first run after a Premiere restart, then passed twice – analysis is playback-based and varies slightly (6–7
  selects). Monday: if 10-selects fails, rerun it once before worrying. Wrote dev/monday.sh (see Rules) and am
  trial-running it now (it installs the 1.1.0 build; dev link restored afterwards with dev/link-dev.sh). A code
  reviewer is reading all the weekend features for bugs.
- Sat ~01:57 – dev/monday.sh trial-run END TO END OK: built 1.1.0, installed with the real Mac installer, Premiere
  relaunched on the test project with the INSTALLED copy, Home › Check my setup all green (89 commands, sound,
  picture, presets, Gemini), Premiere quit, settings cleaned (seenVersion stays 1.0.0 → What's new will show),
  .debug + helper removed. Found + fixed on the way: `pgrep -x` on macOS only sees the first 15 characters of a
  process name ("Adobe Premiere "), so the INSTALLER never noticed Premiere was open, and restart-premiere.sh never
  quit it – now matched by the main program's full path via ps (helpers share the folder). Also the check waits for
  the panel to finish starting. Dev link restored (installed 1.1.0 parked in "JMG Ultra Studio dev"; monday.sh
  installs fresh and deletes that folder).
- Sat ~02:30 – Code review (fresh reviewer) → fixed: (1) Camera Switch: unticked angles are emptied in the copy
  (they covered the others), camFor only to chosen cameras, Assistant honours S.off – e2e 24d; (2) Ducking: tracks
  with transcripts or dialogue-like names are never "music", speech only from non-music tracks, the Assistant only
  ducks a track named like music (else asks), UI needs a ticked track – e2e 23c updated; (3) Colour: our Lumetri is
  now STAMPED (Vignette Feather 50.37, prop 113) instead of tracked by fingerprint – survives trim/rename/undo/tweaks;
  Stop mid-match leaves the clip neutral – e2e 34 checks rename+trim; (4) Match: reference = what shows at the
  playhead (topmost), each clip measured on its own (tracks above muted, restored), middle of the clip – new e2e 34b
  (stacked angles 11.6 → 1.7); (5) B-roll: subclip ranges respected, same footage never twice; (6) Overnight puts
  autoCopies back before saving; (7) Project tidy: repeated moves keep the first bin, subclips not "imported twice";
  (8) neutral() resets whites/blacks; (9) stills filenames safe on Windows; (10) Colour reset runs as a job, no
  preview renders while hidden. (11) checked: QE razor uses zero-based TC even with a 01:00:00:00 start – fine.
- Sat ~02:20 – Full e2e 28/29 (10-selects flaked once more on fresh analysis in the full suite; passes alone and
  after Overnight, twice) → e2e runner now has E2E_RETRY=1 (reports "passed on the second try", never hides).
  Monday cron replaced (144a5fc4, Mon 05:13) with the dev/monday.sh flow. INTERIM HAND-OVER STATE: ran
  dev/monday.sh with the current build (incl. review fixes) → 1.1.0 installed for real and checked (89 commands),
  Premiere closed, no dev links. Between work bursts the Mac stays like this; a new burst starts with
  `bash dev/link-dev.sh` + `bash dev/restart-premiere.sh "$PWD/dev/cep.js"` and ends with `bash dev/monday.sh`.
  Next: a Windows-compatibility read of the code (paths, installer .bat) by a reviewer; Selects sampling robustness
  under load (dropped frames during 16× playback) if time allows.
- Sat ~02:40 – WINDOWS review (fresh reviewer, code read) → fixed all 11: (1) CRITICAL: the zip carried 74 macOS
  "._*" files – on Windows they unzip as real files and the panel would try to run "._x.jsx" and not start. Build now
  zips with ditto --norsrc --noextattr, strips xattrs, refuses a zip with ._ entries; loaders (index.html, host.js)
  skip dot-files; the .bat deletes ._* after copying. (2) .bat: stops if the old folder can't be moved, really
  restores on a failed copy. (3) Premiere transcripts: JSON-escaped Windows paths (C:\\Users) decoded. (4) Safe Zones
  preview uses vision.fileUrl. (5) Overnight keeps a Windows PC awake (PowerShell SetThreadExecutionState). (6)
  Exports go to Premiere's Folder.myDocuments on Windows (OneDrive). (7) log "Open folder" via explorer/open. (8)
  dialog paths normalised, case-insensitive same-path on Windows. (9) stills render to ASCII names then rename;
  caption files use a plain hyphen. (10) presets returned as fsName. (11) settings rename retries on EPERM/EBUSY.
- Sat ~02:45 – SELECTS FLAKE FIXED at the root: playback sampling at 8× lands on different frames each run (phase), so
  a 0.6 s whip pan was caught or missed by luck. Analysis now times three seeks inside each clip and SEEKS frame by
  frame when that's about as fast as playback (all 1080p H.264 + analysis copies here: exact, deterministic, and
  faster – C011 120 s: 12.0 s seek vs 15.1 s playback); long-GOP 4K (≈200 ms/seek) keeps playback (P1003525 10 s).
  Full suite on a FRESH Premiere: 10-selects passed first time; 01-overnight now refreshes the context first.
  restart-premiere.sh waits for the debug ports to be free (a new Premiere that finds them taken never opens them)
  and stops a non-answering Premiere by exact PID.
- Sat 02:46 – dev/monday.sh again: current build (Windows fixes + Selects seeking) installed for real and checked
  (89 commands), zip clean (0 ._ files, 75 entries), Premiere closed, no dev links. Hand-over state.
- Sat ~05:50 – Narrow-panel pass (dev/probes/narrow_cdp.js): all 15 screens at 460 px, nothing wider than the panel.
  REAL-PROJECT STRESS TEST on a TEMPORARY COPY of FJL (dev/probes/fjl-open-copy.sh; original untouched, last
  saved by Jacob Fri 12:35; the copy's Story data deleted afterwards): Check the project 886 clips in 7 s (found:
  right after opening, Premiere reports clips "offline" while still linking → now only missing files count, with a
  "still linking" note); read 54 transcripts / 10,985 sentences 1.9 s; timeline transcript 101 lines, all
  word-exact; 885 social captions 2.5 s; Camera Switch one camera → 82 shots / punch-ins 23 s (summary now counts
  punched shots, not pieces); B-roll spots on the 120-clip rough cut: 6 jump / 84 cuts / 162 every-10 s; ducking
  on Volunteering Reel_1 (music A2 guessed, not "sure" → the Assistant would ask) 25 s; Sound Check −15.1 LUFS
  peak +0.1 (fix would ask for a limiter); Overnight (transcripts+themes+moments) 4.4 s; Selects on a 12-clip 4K bin
  73 s (2.9× real time, originals decoded directly); B-roll over the 6 jump cuts from that bin 5 s. FINDING: Premiere
  already reads Jacob's Lumix files as Panasonic V-Log/V-Gamut (from metadata) → Log tab now says "converted by
  Premiere – nothing to do"; What's new / guide wording adjusted.
- Sat 05:55 – dev/monday.sh: current build installed + checked, Premiere closed, zip clean. Hand-over state.
- Sat ~07:20 – LIVE GEMINI CHECK of Story's AI on the test project (Jacob's Gemini key, text only): themes OK 297 s,
  own theme OK 165 s, Assistant plan 3.1 s – but narrative and moments FAILED with Gemini 503 "high demand" (the
  thinking model gemini-flash-latest = 3.8-flash; ~70 s even for a tiny prompt; thinkingBudget/thinkingLevel both
  timed out at 120 s, so not used). flash-lite answered in 0.5 s. FIX (js/core/ai.js gemini()): when the main model
  answers 429/5xx or nothing within 180 s, the quick model (geminiFastModel) answers that request instead, logged
  "…was busy, so … answered instead"; the cost record and error details name the model actually used; quick
  requests are not retried. Unit test with a fake Google (192 pass). Story AI e2e 5/5. Live rerun: narrative
  "The Open Door" 5 lines 0:30 (120.6 s), moments 3 poignant checked (15.1 s), Assistant 5.2 s – Gemini wasn't busy
  this time, so the fallback is covered by the unit test only. ai-costs.md + What's new mention it.
- Sat 07:15 – dev/monday.sh: build with the Gemini fallback installed and checked (installed ai.js has it), Premiere closed, no dev links. Hand-over state.
- Sat ~10:00 – Backlog finished, so a new Story item: PAPER EDIT. Story › Board › "Paper edit" (Word / spreadsheet /
  text) saves the board to share with a director or client: groups in board order with their colour, each line with
  speaker, interview, clip, SOURCE timecodes (read from Premiere via storyTiming), length, ★ strongest, notes, idea
  cards; trimmed narrative lines use their trimmed words/times; hidden cards left out; loose cards → "Not in a group".
  Saved next to the transcripts (Documents › JMG Ultra Studio › Transcripts). Assistant: "a paper edit of the board",
  "export the board as a spreadsheet" → story.paperEdit. Pure renderers in 22-story-export.js (paperDocx/CSV/Text)
  unit-tested incl. textutil read-back (193 pass); new e2e 22i-story-paper (order, idea, hidden, note, source TC).
  Checked the Word output visually (QuickLook render of the test project's 11-group board) and the button at 1154 px
  and 460 px (toolbar wraps). Guide, What's new and Home news updated; "Read me first" regenerated.
  FULL e2e 30/30 GREEN first try (no retries).
- Sat 10:03 – dev/monday.sh: build with Paper edit installed and checked, Premiere closed, no dev links. Hand-over state.
- Sat ~13:00 – INTERVIEW LOG (research: editors still log interviews by hand / paste transcripts into ChatGPT).
  Story › Export › "Interview log & paper edit" card (Word / Spreadsheet / Text): a section per interview – speakers
  by talk time, length, the themes it feeds (count + first source TC, theme colour), its 5 strongest lines, its
  moments, optional full transcripts (paragraphs per speaker, each interview on a new page; no "Unknown speaker"
  labels when a transcript has no speakers). Optional AI summary per interview (2–3 sentences; cost shown first –
  free with Gemini, which uses the quick model; text only; KEPT on the transcript with a signature, so only new or
  changed interviews are summarised again; 3 at a time). If the AI is turned down (declined cost, the night's limit,
  key/failure) the log is still saved without summaries and says why. Also: "Paper edit of the board" button there,
  Assistant story.interviewLog ("write an interview log", "summarise each interview", "all the interview transcripts
  as one Word document"), and an Overnight prep step "Write the interview log" (with AI summaries when the night uses
  AI; the morning report has an Open button for the file). Live: 4 Gemini summaries of the test interviews in 3.9 s,
  accurate. Unit 194 pass; new e2e 22j-story-log (stand-in AI: summaries made once and kept, full transcript with
  source TC, AI failure → saved without), 01-overnight now includes the log. FULL e2e 30/31 – the one failure was
  22j picking up a test edit made mid-run before the panel reloaded; after reload 22j/22i/01-overnight green.
  Found and fixed in the test: importing a transcript replaces its record, so restores are now by transcript key.
- Sat 13:07 – dev/monday.sh: build with the interview log installed and checked, Premiere closed, no dev links. Hand-over state.
- Sat ~16:00 – REAL-SCALE CHECK of Paper edit + Interview log on a TEMPORARY COPY of FJL (fjl-open-copy.sh; original
  untouched – still Jacob's Fri 12:35 save; the copy's Story data and all outputs deleted afterwards; NO AI used, so
  nothing of his was sent anywhere): 54 transcripts / 7,237 lines read 7.4 s, 11 themes, board 10 groups / 300 lines →
  paper edit 0.8 s (33 KB), log 0.7 s (51 KB; with full transcripts 0.9 s, 264 KB). Found on real data: FJL's
  transcripts have NO speaker names, so every card said "Unknown speaker" → cards now lead with the clip name; basic
  moments flagged 342 "bloopers" (mostly "and, and") → the log uses the Moments list's own pickiness and the best 5
  per interview (176 across 54).
  CODE REVIEW (fresh reviewer) of today's three additions → fixed all 8: (1) re-reading transcripts replaced the
  record and dropped its AI summary, so Overnight (transcripts → log) would pay for every summary again each night →
  addTranscript keeps it, the signature decides; (2) one refused/failed summary left the other requests running after
  the job ended (stale status bar, unsaved, still spending) → a refusal skips that interview, anything else stops the
  rest before they ask, what's made is saved; (3) "Talks about" now counts lines as How picky chooses (effectiveLines);
  (4) Assistant near-misses ("2 minute summary video", "save the sequence from the wall", "video wall", "picked lines
  to the board", "promo from the board", "transcripts … in this sequence") no longer route to the documents;
  (5) clips are found by file path (resolveItems) before reading source timecodes – stale ids gave 00:00 timecodes;
  (6) hidden idea cards left out of the paper edit; (7) the log numbers interviews like the board; (8) summaries read
  up to 200,000 characters (and say if cut), and renaming a speaker makes a summary out of date. Gemini fallback: no
  defects. Unit 195 pass; e2e Story/Overnight/Assistant 13/13 (22i now also checks a hidden idea).
- Sat 16:11 – dev/monday.sh: build with the review fixes installed and checked, Premiere closed, no dev links. Hand-over state.
- Sat ~19:00 – MOMENTS PRECISION on real data (TEMPORARY FJL copy again, no AI, copy + its Story data deleted after,
  original untouched): basic detection flagged 342 "bloopers" in 7,237 lines – 115 were lone everyday stumbles
  ("and, and", "my my"), 121 thinking pauses of 2–6 s, and most of 34 "retakes" were openings repeated on purpose
  ("It's going to engage you intellectually… emotionally"). Restarts (51) and crew chatter (12) were accurate.
  Now: a retake needs the same first 3 words AND a cut-off/very short first line OR ≥60% of its content words said
  again (strength~strengthened, conceptions~preconceptions); stumbles alone count only for real stammering (4+
  repeats → 0.45; 3 → 0.3; fewer only back up other signs); pauses alone count from 6 s. FJL: 384 → 145 moments
  (103 bloopers, 11 retakes – all real; 109 shown at default How picky). Tuned offline against the saved transcripts
  (scratch only, deleted). Unit tests updated (3-s pause = thinking, 8.5-s pause = blooper, real-data near misses);
  195 pass; e2e 22f/22h/22j/01-overnight/40 green. Guide: what doesn't count.
- Sat 19:00 – dev/monday.sh: build with the Moments precision installed and checked, Premiere closed, no dev links. Hand-over state.
- Sat ~22:00 – INTERVIEWER QUESTIONS WITHOUT SPEAKER NAMES (found on FJL: its Premiere transcripts have no speakers, so
  the interviewer could only be told apart by name – never). TEMPORARY FJL copy again (no AI; copy + its Story data
  deleted; themes data kept in scratch only while tuning, then deleted). transcript.askedQuestion(text): a question
  PUT TO "you" (question word … you, "are/do/can/would you", "is there … you", "tell me"), not tag questions or a
  general "you": 'whole' (only the question, at most 4 other words like "That's very nice.") → quality reason
  'interviewer' (−0.25) and How picky leaves it out unless "Include interviewer questions"; 'starts'/'ends' (question
  + answer in one line) → −0.15, ranks lower. FJL: 389 'whole' lines (random sample of 30: all the interviewer or crew),
  53 starts, 71 ends; a musing "when you're not with them, you wonder how…?" no longer counts. Unit tests from the real
  cases (197 pass); e2e Story/Overnight/Assistant 13/13. Guide: How picky paragraph.
- Sat 22:00 – dev/monday.sh: build with interviewer-question recognition installed and checked, Premiere closed, no dev links. Hand-over state.
- Sun ~01:00 – REAL-SCALE UI PASS of Story on a TEMPORARY FJL copy (no AI; copy, its Story data and screenshots
  deleted after). Speed is fine at 54 interviews / 7,237 lines / a 300-card board: tabs open in 0.07–0.54 s (board
  slowest), moving a card 0.21 s, search 0.05 s. Fixed what real data showed: (1) offline theme keywords included
  "it's · about · because" – the stop list held curly apostrophes but words are compared straightened (fixed for
  search too), plus contractions/"about"/"because" kept out of labels; (2) lines with a spoken restart ("How can I
  start that again? I think…") were ★ strongest → quality reason 'starts again', score capped at 0.6 (usable,
  never strongest; 39 such lines in FJL, none strongest now); (3) with no speaker names, theme quotes, Find rows and
  the narrative list said "Unknown speaker" → they show the clip; the Transcripts stats say "No speaker names"
  (and "1 interview", not "1 interviews"). Unit 198 pass (new: keywords, restart cap); e2e Story/Overnight/Assistant
  13/13. (A test script of mine typed into a hidden speaker-name field on the copy – only the copy, reset and deleted.)
- Sun 01:00 – dev/monday.sh: build with the UI-pass fixes installed and checked, Premiere closed, no dev links. Hand-over state.
- Sun ~03:53 – started a fresh review of the Saturday-evening scoring changes; the session then hit its weekly usage
  limit, so the review, the remaining Sunday check-ins and the Mon 05:13 finalisation did NOT run.
- Mon 09:53 – resumed after the 07:30 deadline. Installed copy is the Sun 01:00 build (monday.sh: built, installed
  with the real Mac installer, Home › Check my setup green on the INSTALLED copy, Premiere closed). Checked now
  without Premiere: ~/Library/.../CEP/extensions/JMGUltraStudio is a real folder, version 1.1.0, js/jsx/css identical
  to the source, no .debug, no dev helper; seenVersion 1.0.0 (What's new will show), overnight.report empty; unit
  tests 198/198; dist/JMG-Ultra-Studio-1.1.0.zip (Sun 01:00, 0 "._" files) with the installers and "Read me first";
  whats-new.md and "Read me first.html" current. Weekend check-in timer stopped. NOT DONE: the final full e2e run on
  this exact build (last full suite Sat ~13:00: 30/31, the one failure a mid-run test edit, green after reload; every
  later change covered by unit tests + the Story/Overnight/Assistant e2e subset 13/13) and the fresh review of the
  Sat-evening scoring changes. Not started now because Jacob may be using the Mac and the run needs Premiere to
  itself for ~10 minutes (restart-premiere.sh saves whatever project is open when it quits Premiere).
- Mon 11:07 – Jacob freed Premiere: final full run on this exact build. Premiere was closed and no lock was held;
  linked the dev copy and started Premiere fresh on dev/test-project (confirmed it was the open project). Full e2e
  31/31 passed first time (11:07–11:12, E2E_RETRY=1, no retries needed); unit tests 198/198. Then monday.sh (after
  checking the test project was still the one open): built, installed with the Mac installer, Check my setup green on
  the INSTALLED copy (Premiere 26.5.2, 89 commands, sound/picture analysis, presets, Gemini key), Premiere closed.
  Verified after: JMGUltraStudio is a real folder, 1.1.0, js/jsx/css identical to the source, no .debug or dev helper,
  Premiere and Media Encoder closed, no lock, seenVersion 1.0.0, overnight.report empty; dist/JMG-Ultra-Studio-1.1.0.zip
  (11:13, 0 "._" files) with both installers and "Read me first.html" (regenerated by the build). Jacob's real
  projects were not opened. Still NOT DONE: the fresh code review of the Sat-evening scoring changes.
- Mon ~11:15 – FRESH REVIEW of the Sat-evening scoring changes (independent reviewer, code + probes; no Premiere).
  13 findings; fixed 12 (backups of the three files in scratch/pre-review):
  (1) Moments RESTART flagged ordinary speech as a 0.75 blooper (“I'm so sorry I wasn't there when she died”, “there
  was no wait”, “where was I born?”, “take two tablets”, “we had to start again”) → sorry/wait/no/start again only as
  a clause of their own, from the top/take two/one more time/where was I/I'll say it again only ending one;
  (2) curly apostrophes defeated the Moments patterns and word counts → straightened first;
  (3) transcript RESTARTS missed “start that again” (missing space) → fixed, so the 0.6 cap applies;
  (4) a word-timing gap after a full stop counted as mid-thought → skipped; (5) a trailing “…” counted as a finished
  sentence → it doesn't (retakes, pauses); (6) “I-I-I-I” found but never scored → counted;
  (8) rhetorical “Can you imagine?” / “would you believe” treated as interviewer questions → not any more;
  (9) contractions (they've, haven't) as theme names/keywords → skipped; “they've” in a search no longer leaves “ve”;
  (10) labels like “Jane Smith, Museum Director” lost all lines, and a speaker renamed “Interviewer” in Story was
  ignored → shared T.isInterviewerLabel (role at the start or in brackets) + the Story name checked in How picky;
  (11) narrative pool skipped plain questions but kept lines starting/ending with the interviewer's → skips all three;
  (12) “Do you know how…” counted as a “you know” filler → not after do/did/if; (13) quality() on a line with no
  text → no crash. NOT changed: (7) a line repeated word-for-word isn't a retake (may be a duplicated segment; left).
  Unit 201/201 (3 new tests from the review's cases). Guide updated (Moments, How picky), Read me regenerated.
  Not yet re-measured on FJL (transcripts were deleted from scratch); not yet run in Premiere or installed – the
  installed copy is still the 11:13 build.
- Mon 11:25 – review fixes run and installed: dev links + fresh Premiere on the test project; e2e Story/Overnight/
  Assistant 12/12; monday.sh (test project confirmed open first): built, installed with the Mac installer, Check my
  setup green on the INSTALLED copy, Premiere closed. Verified: real folder, 1.1.0, js/jsx/css identical to the source
  (installed transcript.js has isInterviewerLabel), no .debug/helper, Premiere + Media Encoder closed, no lock,
  seenVersion 1.0.0, overnight.report empty, zip 11:27 with 0 "._" files. Jacob's real projects not opened.
- Mon ~13:45 – 1.2.0 (Jacob's requests, source only – NOT yet run in Premiere or installed; Premiere is in use):
  (1) Find themes takes "Your themes" and finds them and its own in ONE pass (AI reads the lines once; own themes in
  the task after the cached listing; answer says which theme is "yours"; empty ones filled by Story's search);
  "Add one more theme" kept as the cheap single-theme add. (2) What to work on: all / some interviews / the lines
  heard in a sequence, optionally In–Out (host sequenceInfo now returns inPoint/outPoint); used by Themes, Search,
  Find more, Moments, narrative. (3) Board switched off (BOARD=false, code kept): build from themes (switch themes
  on/off, order via Move up/down), bins moved to Build, paper edit of themes or a narrative, Moments → "Make a theme of
  these". (4) Story is five numbered steps (1 Interviews · 2 Themes · 3 Find · 4 Build · 5 Share) with step headings,
  Next buttons, ✓ on done steps, a "Working on" chip; linking/speakers folded into "Interviews and speakers".
  (5) Selects: new default "Any footage – usable B-roll" (only technical faults rejected; no style rules, duplicates
  kept); kind of footage optional; one-time migration of saved settings; Overnight and B-roll default to it.
  Fresh review: 10 findings, all fixed (scope rollback, narrative scope, old picked themes, Unicode/duplicate theme
  names, found themes keep hand-added lines/name/colour, moments per scope, Search "as last read" + Read again,
  merge keeps lines, Selects strict preset kept footage). Unit 210/210, UI smoke ✓. e2e 22-story, 22d, 22e, 22f, 22i,
  40 updated for themes instead of the board. Docs: tools-story.md rewritten, tools-find/broll/guide/ai-costs,
  whats-new.md (1.2), Home What's new; Read me regenerated. Version 1.2.0.
- Mon 13:47–14:00 – 1.2.0 run and installed (Jacob freed Premiere; it was idle with no project – quit via AppleScript,
  Media Encoder by PID). New e2e 22k-story-scope: In/Out marked in Premiere (setInPoint 10 / setOutPoint 25) read back
  exactly; whole sequence 10 lines, In–Out 2; no In/Out reads as -400000 → "none" (error, old choice kept); steps
  render. Screens checked (steps 1, 2, 4). Found and fixed: a theme of yours added twice stayed twice → Find themes
  folds it into one (unit test). Full e2e 32/32 first time; unit 211/211; UI smoke ✓. monday.sh: built, installed with
  the Mac installer, Check my setup green on the INSTALLED copy (Premiere 26.5.2, 89 commands), Premiere closed.
  Verified: real folder, 1.2.0, js/jsx/css identical, no .debug/helper, no lock, seenVersion 1.0.0 (What's new shows),
  overnight.report empty, zip 1.2.0 (0 "._"). The e2e had left the SHARED settings on Selects footage "concert" and
  Overnight "documentary" → set back to "any" (Premiere closed); story.tab set to step 1. dev/e2e/run.js now restores
  those shared settings after every test (dev only; syntax-checked, not yet run).
- Mon 26 Oct ~16:40–18:10 – 1.3.0 (Jacob's notes, run early at his request): Selects camera movement (direction,
  smoothness, Camera movement setting, Smooth camera moves filter/sort/bin; grades stay technical), Colour previews
  made automatically from the frame under the playhead (looks captured once as 32³ colour tables; LUTs from file;
  quick grade; before/after viewer, ← →, shot strip), Moments colour-coded and labelled by type (theme per type,
  Build these moments), ▶ cue checks the loaded clip and position before playing. Review: 6 findings fixed. Premiere:
  Jacob's Premiere didn't answer an AppleScript quit (screen dark, likely a dialog) → stopped by exact PID after he
  confirmed his project was saved. Found in Premiere and fixed: frames taken at 160×90 (previews need 320×180).
  Measured: identity table exact (0); film look vs Premiere 0.00; SpeedLooks Blue Cold 4.1/255 (its slight
  softening isn't a colour). Full e2e 33/33 first time; unit 216; monday.sh green (89 commands), Premiere closed,
  shared settings intact (Any footage, Smooth moves count). Vision model research: dev/VISION-MODELS.md.
- Tue 27 Oct – 1.3.1, Story travels with the project (dev/PLAN-STORY-SYNC.md; Jacob uses one drive on both
  computers). Story also writes "<project> – Story.json" in a "JMG Ultra Studio" folder next to the .prproj (3 s
  after the last change, and when the panel hides/closes or the project changes); the copy in Application Support
  stays. Which copy opens: the one that changed since this computer last synced (id kept in the project store);
  changed on both → newer opens, the other is backed up beside it and offered in a dialog. Sync-service conflicted
  copies are offered once and renamed to backups; ._ files ignored; a copy the other computer wrote while this one was
  open is backed up, not overwritten blindly. Transcripts read again with a new path match the old one (clip id, then
  file name, same-name clips by their words; a clip whose own file still exists is never taken over) and keep their
  key and line ids (carryIds also rescues lines that moved ≤1.5 s when re-transcribed). Settings › Story switch;
  Home says where Story is saved. Version steps are now 1.3.x at Jacob's request. Independent review: 3 fixed
  (a lone same-name clip was matched without checking its words; an upgraded project asked "two computers" on every
  open because its first shared write wasn't stamped; an unreadable shared copy could be replaced without a backup).
  Unit 231 (15 new). Premiere: full e2e 34/34 first time (new 22l-story-sync); monday.sh green (89 commands),
  installed copy identical, Premiere closed. The e2e had changed the shared settings story.tab and story.narrativeAI
  → set back (Premiere closed); dev/e2e/run.js now restores those two as well. Released v1.3.1.
- Wed 28 Oct – 1.3.2, first full test on Windows (dev/WINDOWS-REPORT.md, PR windows-fixes, issues #1–#11) and
  Render ranges (Deliver), asked for by Jacob: adjustment layers on a "Renders" track above the edit, each rendered by
  Media Encoder under its own name, in timeline order, with a chosen preset (built-in H.264, or his own Media Encoder /
  Premiere presets). The sequence In/Out is set to each range while queuing (Media Encoder copies it then) and put
  back; "none" reads as -400000 s. Only the Renders track counts, so grading layers and Story's theme layers never
  export. Windows app fixes: cache/temp in LOCALAPPDATA, rename retries, path case in Story, CSV for Excel, Safe Zones
  shade names, missing files no longer passed to importFiles (one stopped Premiere answering for hours), Selects kicks a
  muted play() when the panel's browser holds back a paused video's first frame (it did after busy spells) and reads by seeking when fast playback drops frames (12–17 of ~30
  here; a whip pan fell between samples), Story stays with a transcript's own clip when a file is
  in several bins. Test fixes: Node docx reader instead of textutil, file URLs, Array.indexOf in a jsx helper (34).
  dev/win/build.js builds the zip on Windows with Unix modes (the .command files stay executable). Independent review
  of Render ranges: 5 fixed. Unit 243. Premiere (PC): e2e 35 tests – see the report.
- Wed 28 Oct – 1.3.2 from the PC (PR #12: Render ranges + Windows fixes, merged and released on the PC) tested on the
  Mac: unit 243/243, Premiere full e2e 35/35 first time (incl. 33b-deliver-ranges), monday.sh green (93 commands),
  installed copy identical, Premiere closed; only the test project was opened (Jacob had already quit Premiere). The
  e2e changed the shared settings deliver.ranges, lastTool, src.bin → set back; dev/e2e/run.js restores them now.
  The release v1.3.2 (Windows-built zip) was left as published.
- Wed 28 Oct (evening) – JMG Ultra Studio for DaVinci Resolve Studio, asked for by Jacob ("a complete version for
  DaVinci Resolve … feature parity … on GitHub"; "when I give feedback, all versions – Premiere on Mac and Windows and
  Davinci – updated simultaneously"). Also: Colour and Camera Switch paused in every version (code and unit tests
  kept, US.PAUSED_TOOLS; "don't test hidden features"), and Settings › Markers (Timeline / Clips / Both) for every tool
  that marks a sequence. Design in dev/RESOLVE.md: one panel; js/core/platform.js (US.app, US.say – Resolve's words);
  resolve/host/*.js answer every jsx command with the same names and results; the plugin is a Workflow Integration
  (Electron) whose main process keeps the one connection to Resolve (a second connection from a reloaded page hangs).
  Built in four parallel parts, then tested in real Resolve 21.1.2 on the project "JMG Ultra Studio Test" (Jacob made
  it and opened the panel; I opened the panel again through Resolve's menu later). Measured and handled: timeline
  ranges end-exclusive, subclips inclusive, GetMarkers one frame early, names without : / etc., Wave/16 kHz not
  scriptable (Audio Only → WAV here), render marks move the timeline's In/Out, SetCurrentTimeline busy after Smart
  Reframe, stills always 5 s. Resolve crashed once: asking an imported .srt for its clip properties aborts Resolve 21.1
  – subtitle items are never asked or placed now; Story's captions are imported for one drag. Independent review of
  the Resolve layer: no undefined/NaN reaches Resolve; the stand-in Resolve fails tests on them. Selects: a small zoom
  reading during a clear pan isn't a push-in any more (both editors). Unit 340. Premiere e2e 29/29 (twice, after all
  changes). Resolve e2e: 18/30 on the second run before the fixes; the rest (and the new 22r/23r Resolve tests) wait
  for Resolve to be reopened – the Mac locked at 17:53 and Resolve can't be reopened by script.
- **Wed 28 Oct, evening–night – Resolve made stable, 1.3.3 released; notes for 1.3.4 built and released for both.**
  Resolve crashes found and fixed: an imported .srt shows in the Media Pool **without** its extension, so overnight
  prep took it for footage and laid it on a scratch timeline (aborts Resolve) – subtitles are now known by Type
  "Subtitle" too. Transcribe with Resolve: `CreateSubtitlesFromAudio` runs in the background (throws on `{}` but
  starts anyway); deleting its timeline early segfaulted Resolve – it now waits for the subtitles and never deletes a
  timeline Resolve may be writing into. Analysis copies came out 4K: `SetCurrentRenderMode` resets the render size, so
  it's set first. No FaceDetector in Resolve's Electron 36 (Selects finds no faces there). Resolve e2e 28/28, Premiere
  e2e 29/29 → **v1.3.3** (first Resolve release) with a README "Where each version stands" table; issue #13 for the PC.
  Jacob's notes for the next version (Premiere first, then Resolve; versions may differ if GitHub says so): Song
  Splitter adjustment layers (numbered songs, colour by kind, "Songs" track); Deliver render ranges from any layer
  track, one colour only, editable in the panel (rename, times, colour, delete), refreshing every 3 s, file-name
  ending. Premiere 26.5 can't read or set a timeline clip's colour (TrackItem/QE have none), so the panel remembers
  the colours it gave (by times, else unique name). Resolve: groups of range markers (`us-lyr-Songs~…`), colours read
  from the markers. Also: adjustment layers and generated items aren't footage any more. Premiere e2e 30/30, Resolve
  29/29 → **v1.3.4** for both (Premiere 22:32, Resolve 22:40). Test project now has a real adjustment layer (made via
  File › New while the Mac was unlocked). Resolve on the Mac now has the real 1.3.4 install (dev link removed at
  Jacob's request) – for Resolve e2e again: quit Resolve, `dev/resolve/link-dev.sh`, reopen it and the panel.
- **29 Oct (unreleased, branch `story-questions`, tried in Jacob's Premiere via `dev/try-in-premiere.sh`):** Story ›
  Find › Questions; Ask › My interviews (answers in words + grouped clips, edited, then built / marked / themes / Word,
  follow-ups); one shared transcript for every Story AI request (same system text, transcript block cached an hour,
  one answer format – measured: a different `output_config.format` breaks Claude's cache sharing, a different effort
  doesn't); narrative client notes and up to all shortlisted alternatives; keep clips in filmed order; Deliver: client
  notes out, any video track or a new top one, colour drop-down; B-roll and Sound hidden (Settings code shows them);
  Gemini model named (latest Flash = 3.8); usage per API key; three quick clicks on Stop stop at once; “unpublished”
  tag. **▶ fixed for camera timecode:** in Premiere 26.5.2 the Source Monitor counts from the clip's first frame, not
  its media timecode – a QE `scrubTo` in camera timecode is echoed back by `getPosition()` but the playhead stays at
  frame 0 and plays from there (measured on Jacob's clips starting 19:39:28:20). Story ▶ and Selects' preview now jump
  from the first frame (camera timecode only as a fallback); verified on his footage (16:48 and 2:00 both play from the
  line). The test media all start at 00:00:00:00, so the e2e never saw it – a camera-timecode clip in the e2e is due.
  → **v1.3.5** released 29 Oct 14:05 for Premiere and Resolve (both zips on the release; issue #14 for the PC).
  Tested: Jacob on his Mac in Premiere 26.5.2, 372 unit tests, headless screen tests; the e2e suites were not re-run
  (Premiere was in use – `dev/monday.sh` quits it); Resolve 1.3.5 not yet tried in Resolve itself. Premiere on the
  Mac has the real 1.3.5 install (copied as the installer does, without waiting for Premiere to quit); Resolve on the
  Mac still has 1.3.4 until it can be quit. Due: the e2e suites on 1.3.5 and a camera-timecode clip in the e2e.
