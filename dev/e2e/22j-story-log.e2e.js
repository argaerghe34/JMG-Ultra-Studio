// Story › Export › Interview log in real Premiere: a section per interview with source timecodes from Premiere, the full
// transcripts on request, and AI summaries made once and kept (the AI is a stand-in here, so nothing is sent).
const S = US.story, fs = require('fs'), os = require('os'), path = require('path'), cp = require('child_process');
const BIN = 'Test – Story';
const prevDir = US.settings.get('story.exportDir'), outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'us-e2e-log-'));
US.settings.set('story.exportDir', outDir);
const st = S.loadState(), savedSummaries = new Map(st.transcripts.map(t => [t.key, t.summary]));   // by key: importing replaces a transcript's record
const realAsk = US.storyAI.ask, realAvail = US.ai.available;
let asked = 0;
US.storyAI.ask = async req => { asked++; return { summary: 'Stand-in summary: ' + /Interview “([^”]+)”/.exec(req.user)[1] }; };
US.ai.available = () => true;
try {
  const [ruth] = await T.importOnce([T.media('interview', 'I001_interview.mp4')], BIN);
  await S.importFiles(US.jobs.testJob('story'), [T.media('transcripts', 'I001_interview.srt')]);
  const t = st.transcripts.find(x => x.itemId === ruth.id);
  T.assert(t && t.lines.length, 'I001 transcript linked to the clip');
  const n = st.transcripts.filter(x => x.lines.length).length;
  for (const x of st.transcripts) delete x.summary;
  const timing = (await US.host.call('storyTiming', { ids: [ruth.id] }))[ruth.id];
  const tcOf = sec => US.storyExport.tc(timing.start + sec, { fps: timing.fps, drop: timing.drop });

  const r = await T.action('story.interviewLog', { summaries: true, full: true, format: 'docx' });
  T.assert(fs.existsSync(r.file) && /interview log/.test(r.file), 'Word file saved: ' + r.summary);
  T.assert(asked === n && new RegExp(`${n} summaries`).test(r.summary), `one summary per interview (${asked} of ${n}): ${r.summary}`);
  const txt = cp.execFileSync('textutil', ['-convert', 'txt', '-stdout', r.file]).toString();
  T.assert(txt.includes(t.name) && txt.includes('Stand-in summary: ' + t.name), 'the interview and its summary');
  T.assert(txt.includes(tcOf(t.lines[0].start)) && txt.includes('Transcript'), `full transcript with source timecodes (${tcOf(t.lines[0].start)})`);
  T.assert(t.summary && t.summary.sig === S.summarySig(t), 'summary kept with the transcript');

  const again = await T.action('story.interviewLog', { summaries: true, full: false, format: 'csv' });
  T.assert(asked === n, 'kept summaries are not asked for again');
  const rows = fs.readFileSync(again.file, 'utf8').replace(/^﻿/, '').trim().split('\r\n');
  T.assert(rows.filter(x => /,About,/.test(x)).length === n && !rows.some(x => /,Transcript,/.test(x)), 'spreadsheet: one About row per interview, no transcript');

  // the AI turned down (a key problem, a declined cost, the night's limit): the log is still saved, without summaries
  for (const x of st.transcripts) delete x.summary;
  US.storyAI.ask = async () => { throw new US.UserError('AI_KEY'); };
  const plain = await T.action('story.interviewLog', { summaries: true, format: 'txt' });
  T.assert(fs.existsSync(plain.file) && /no summaries/.test(plain.summary), 'saved without summaries: ' + plain.summary);

  // the Export tab shows the card
  S.open('export'); await T.sleep(400);
  const btn = [...document.querySelectorAll('.tool:not(.hidden) button')].find(x => /Save the interview log/.test(x.textContent));
  T.assert(btn, 'Interview log card on the Export tab');
  return { saved: [US.basename(r.file), US.basename(again.file)], summary: r.summary, interviews: n };
} finally {
  US.storyAI.ask = realAsk; US.ai.available = realAvail;
  for (const x of st.transcripts) { const v = savedSummaries.get(x.key); if (v === undefined || /^Stand-in/.test(v.text || '')) delete x.summary; else x.summary = v; }
  S.save();
  US.settings.set('story.exportDir', prevDir);
  try { fs.rmSync(outDir, { recursive: true, force: true }); } catch (e) { /* temp */ }
}
