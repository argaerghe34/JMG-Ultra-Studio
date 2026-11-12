// resolve-only
// The transcript of a timeline in Story › Share: speaker names worked out by the AI (text only; "(not sure)" on a
// guess), interviews numbered with where each starts and ends, and clip names on the labels – in real Resolve, on a
// test timeline that cuts between two interviews (J001, made by 22s-story-sources, and I001 with its .srt).
const S = US.story, fs = require('fs');
const BIN = 'Test – Story sources', TLN = 'Test – Two interviews (Resolve)';
const KEYS = ['story.tlAINames', 'story.tlInterviews', 'story.tlClips'];
const prev = Object.fromEntries(KEYS.map(k => [k, US.settings.get(k)]));
const st = S.loadState();
const saved = JSON.parse(JSON.stringify({ transcripts: st.transcripts, whoIsWho: st.whoIsWho || {}, speakerAI: st.speakerAI || {} }));
const ev = code => T.devEval(code);
const job = () => US.jobs.testJob('story');
const report = [];
try {
  const src = await US.host.call('storySources', {});
  const j = src.find(s => s.name === 'J001_spoken_interview.mp4'), i = src.find(s => s.name === 'I001_interview.mp4' && s.kind === 'video');
  T.assert(j && i, 'the two interview clips are in the project (run 22s-story-sources first)');
  // Story has both interviews: J001 from Resolve's own transcript, I001 from its .srt
  st.transcripts = [];
  await S.readResolveTranscripts(job(), { ids: [j.id], transcribe: false });
  await S.importFiles(job(), [T.media('transcripts', 'I001_interview.srt')]);
  T.assert(st.transcripts.length === 2, 'two interviews in Story: ' + st.transcripts.map(t => t.name).join(', '));
  // a timeline cutting between them: J001 0–14 s, I001 10–22 s, J001 30–44 s
  const old = await T.seqByName(TLN); if (old) await US.host.call('deleteSequence', { seqId: old.id });
  const seq = await ev(`const b = R.ensureBin(${JSON.stringify(BIN)}), t = R.inFolder(b, () => R.pool().CreateEmptyTimeline(${JSON.stringify(TLN)}));
    R.project().SetCurrentTimeline(t); const J = R.needItem(${JSON.stringify(j.id)}), I = R.needItem(${JSON.stringify(i.id)}), fj = R.clipFps(J), fi = R.clipFps(I), tf = R.fps(t); let at = t.GetStartFrame();
    for (const [m, f, a, z] of [[J, fj, 0, 14], [I, fi, 10, 22], [J, fj, 30, 44]]) { R.pool().AppendToTimeline([{ mediaPoolItem: m, startFrame: Math.round(a * f), endFrame: Math.round(z * f), trackIndex: 1, recordFrame: at }]); at += Math.round((z - a) * tf); }
    R.forget(); return { id: R.id(t) };`);
  const tl = await S.timelineTranscript(job(), { seqId: seq.id });
  report.push(`timeline transcript: ${tl.result.entries.length} lines · voices: ${tl.result.speakers.map(s => s.clipName + '/' + (s.label || '-')).join(', ')} · missing: ${tl.result.missing.map(m => m.name).join(', ') || 'none'}`);
  T.assert(tl.result.entries.length >= 4 && new Set(tl.result.entries.map(e => e.clipKey)).size === 2, 'lines from both interviews');

  // the AI names the voices (real AI, text only)
  st.speakerAI = {}; st.whoIsWho = {};
  US.settings.set('story.tlAINames', true);
  const named = await S.nameSpeakersAI(job(), tl, { again: true });
  report.push('AI: ' + named.summary);
  for (const [k, a] of Object.entries(st.speakerAI)) report.push(`  ${k.split('|').pop()} in ${tl.result.speakers.find(s => s.key === k).clipName}: ${a.name || '(none)'}${a.sure ? '' : ' (not sure)'} – ${a.why}`);
  const d = S.namesFor(tl);
  T.assert(tl.result.speakers.every(s => d.get(s.key)), 'every voice has a label');

  // export with the interviews numbered and clip names, as text and spreadsheet
  US.settings.set('story.tlInterviews', true); US.settings.set('story.tlClips', true);
  const x = await S.exportTimeline(job(), tl, 'txt'), txt = fs.readFileSync(x.file, 'utf8');
  report.push('TEXT EXPORT\n' + txt);
  T.assert(/Interview 1 starts – J001_spoken_interview\.mp4/.test(txt) && /Interview 2 starts – I001_interview\.mp4/.test(txt) && /Interview 1 ends/.test(txt) && /Interview 2 ends/.test(txt), 'starts and ends of both interviews');
  T.assert((txt.match(/Interview 1 starts/g) || []).length === 2, 'interview 1 starts again after interview 2');
  T.assert(/ · Interview 1 · J001_spoken_interview\.mp4: /.test(txt) && / · Interview 2 · I001_interview\.mp4: /.test(txt), 'labels carry the number and the clip');
  const c = await S.exportTimeline(job(), tl, 'csv'), csv = fs.readFileSync(c.file, 'utf8');
  T.assert(/^﻿?Timecode in,Timecode out,Speaker,Interview,Text/.test(csv), 'spreadsheet has an Interview column');
  const w = await S.exportTimeline(job(), tl, 'docx');
  T.assert(fs.statSync(w.file).size > 2000, 'Word file');
  for (const f of [x.file, c.file, w.file]) fs.unlinkSync(f);
} finally {
  Object.assign(st, saved); S.reindex(); S.save();
  for (const [k, v] of Object.entries(prev)) US.settings.set(k, v);
  window.__e2eReport = report;
}
