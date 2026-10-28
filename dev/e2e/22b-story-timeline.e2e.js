// Story › Timeline transcript in real Premiere: a sequence cut from two transcribed clips (the interview, cut mid-sentence
// on both sides, and a clip with two voices and word timings – also cut inside a sentence, which must be trimmed at the exact
// word), mapped to sequence time, named, and exported as Word, text, subtitles and CSV.
if (!US.story || !US.storyTimeline || !US.storyExport) throw new Error('Story (timeline transcript) is not loaded in the panel');
const S = US.story, E = US.storyExport, T2 = US.transcript;
const fs = require('fs'), os = require('os'), path = require('path'), cp = require('child_process');
const BIN = 'Test – Story', SEQ = 'Test – Story timeline';
const prevBase = US.settings.get('story.binBase'), prevDir = US.settings.get('story.exportDir');
const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'us-timeline-'));
US.settings.set('story.binBase', BIN); US.settings.set('story.exportDir', outDir);
const st = S.loadState();
const savedWho = JSON.parse(JSON.stringify(st.whoIsWho || {}));
try {
  const [ruth, c001] = await T.importOnce([T.media('interview', 'I001_interview.mp4'), T.media('concert', 'C001_sharp_static.mp4')], BIN);
  T.assert(ruth && c001, 'clips imported');
  const job = US.jobs.testJob('story');
  await S.importFiles(job, [T.media('transcripts', 'I001_interview.srt'), T.media('transcripts', 'C001_sharp_static.json')]);
  const real = p => { try { return fs.realpathSync(p); } catch (e) { return p; } };
  T.assert(st.transcripts.some(t => t.path && real(t.path) === real(c001.path)), 'C001 transcript linked');

  // the cut: interview 2.0–9.0 (both sentences cut), C001 whole, interview 54.0–66.13, C001 5.3–6.5 (inside “…coming, it means so much to us.”)
  const old = await T.seqByName(SEQ); if (old) await US.host.call('deleteSequence', { seqId: old.id });
  const seq = await US.host.call('newSequence', { name: SEQ, binPath: BIN, likeId: ruth.id });
  await US.host.call('placeClips', { seqId: seq.id, cursor: 0, clips: [{ id: ruth.id, in: 2, out: 9 }, { id: c001.id, in: 0, out: 10 }, { id: ruth.id, in: 54, out: 66.13 }, { id: c001.id, in: 5.3, out: 6.5 }] });
  const tl = await S.timelineTranscript(job, { seqId: seq.id });
  const e = tl.result.entries;
  T.assert(e.length === 8, 'lines on the timeline (a short sentence joins the next one): ' + e.length + ' ' + JSON.stringify(e.map(x => x.text)));
  T.assert(/^…/.test(e[0].text) && /…$/.test(e[1].text), 'first two lines are cut mid-sentence: ' + e[0].text + ' | ' + e[1].text);
  T.assert(e[0].start >= -0.01 && e[0].srcIn >= 2 - 0.01 && e[1].srcOut <= 9 + 0.01, 'trimmed at the cuts');
  T.near(e[2].start, 7 + 0.5, 0.05, 'C001 line 1 at 7.5 s'); T.assert(/Welcome everyone/.test(e[2].text), 'C001 line 1 text');
  T.near(e[5].start, 17, 0.05, 'third clip starts at 17 s'); T.assert(/After I retired/.test(e[5].text), 'interview line 9');
  for (let i = 1; i < e.length; i++) T.assert(e[i].start >= e[i - 1].start, 'time order');
  // word timings: exact trimming inside a sentence (an even guess would say “…means so much…” and start later)
  const last = e[7], seqLen = (await US.host.call('sequenceInfo', { seqId: seq.id })).video[0].clips;
  T.assert(last.exact === true && last.text === '…it means so much…', 'exact cut: ' + last.text + ' exact=' + last.exact);
  // Premiere snaps the cut to frames (6.5 s → 6.48 s at 25 fps), so the line ends at the cut or at “much”, whichever is first
  T.near(last.srcIn, 5.6, 0.011, 'starts with “it” (5.60 s in the clip)'); T.near(last.srcOut, Math.min(seqLen[3].out, 6.55), 0.011, 'ends with “much” or at the cut');
  T.near(last.start, seqLen[3].start + (5.6 - seqLen[3].in), 0.02, 'on the timeline where “it” is heard');
  T.assert(e[2].exact === true && e[0].exact === false, 'word timings used where they exist (JSON), estimate for the SRT');
  T.assert(tl.result.speakers.length === 3 && !tl.result.missing.length, 'three voices, nothing missing: ' + tl.result.speakers.map(s => s.key).join(', '));
  let d = S.namesFor(tl);
  T.assert(tl.result.speakers.map(s => d.get(s.key)).join('|') === 'Speaker A|Speaker B|Speaker C', 'letters before naming');
  // name them: interview voice and C001's second voice are the same person
  st.whoIsWho[tl.result.speakers[0].key] = 'Ruth'; st.whoIsWho[tl.result.speakers[2].key] = 'ruth'; S.save();
  d = S.namesFor(tl);
  const folks = US.storyTimeline.people(tl.result.speakers, d);
  T.assert(folks.map(p => p.name).join('|') === 'Ruth|Speaker A', 'people after naming: ' + folks.map(p => p.name).join('|'));

  // export all four
  const files = {};
  for (const f of ['docx', 'txt', 'srt', 'csv']) { const x = await S.exportTimeline(job, tl, f); files[f] = x.file; T.assert(fs.existsSync(x.file) && fs.statSync(x.file).size > 50, f + ' written'); }
  const tc0 = E.tc(e[0].start + (tl.info.timing.zero || 0), { fps: tl.info.timing.fps, drop: tl.info.timing.drop });   // as the editor shows it (Resolve's timelines start at 01:00:00:00)
  const docText = T.docxText(files.docx);   // reading it also proves the zip is valid
  for (const want of [`Transcript – ${SEQ}`, 'Speakers', 'Ruth', 'Speaker A: Welcome everyone to the concert tonight.', tc0]) T.assert(docText.includes(want), 'Word has “' + want + '”');
  const cues = T2.parseSRT(fs.readFileSync(files.srt, 'utf8'));
  T.assert(cues.length >= 8, 'subtitle cues: ' + cues.length);
  T.near(cues[0].start, e[0].start, 0.002, 'first cue time'); T.assert(cues[0].speaker === 'Ruth', 'cue speaker ' + cues[0].speaker);
  const rows = fs.readFileSync(files.csv, 'utf8').replace(/^﻿/, '').trim().split('\r\n');
  T.assert(rows.length === 9, 'csv rows ' + rows.length);
  const c3 = rows[3].split(',');
  T.assert(c3[0] === E.tc(e[2].start, { fps: tl.info.timing.fps }) && c3[2] === 'Speaker A' && c3[4] === 'C001_sharp_static.mp4' && c3[5] === '00:00:00:12', 'csv row for C001: ' + rows[3]);
  const txt = fs.readFileSync(files.txt, 'utf8');
  T.assert(txt.includes('Speakers:') && txt.includes(`${tc0}  Ruth: …`), 'text export');

  // the Assistant route, on the open sequence
  await T.open(seq.id);
  const a = US.actions.get('story.timelineTranscript');
  T.assert(a.match('export the transcript of this timeline as a spreadsheet').format === 'csv', 'match csv');
  const viaAction = await T.action('story.timelineTranscript', { format: 'txt' });
  T.assert(fs.existsSync(viaAction.file) && viaAction.file !== files.txt, 'action saved a new file (never overwrites)');
  return { lines: e.length, people: folks.map(p => `${p.name} ${US.fmtDur(p.talk)}`), files: Object.values(files).map(f => path.basename(f)) };
} finally {
  st.whoIsWho = savedWho; S.save();
  US.settings.set('story.binBase', prevBase || ''); US.settings.set('story.exportDir', prevDir || '');
}
