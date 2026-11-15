// premiere-only
// Story › Build while working on a sequence, in real Premiere: (1) an edit with the interview camera on V1 (its own
// sound on A1) and another recording on A2 – each line brings every layer, from the same moments; (2) "Its multicam's
// own sequence" – from an edit cut from a multicam clip, Story works on the multicam's own sequence and Build gives each
// line as the multicam clip itself. Uses the test project only.
const S = US.story, fs = require('fs');
const BIN = 'Test – Story', SEQ = 'Test – Story edit with every layer';
const prevBase = US.settings.get('story.binBase');
US.settings.set('story.binBase', BIN);
const st = S.loadState(), saved = JSON.parse(JSON.stringify({ scope: st.scope || { kind: 'all' } }));
const out = {};
const real = p => { try { return fs.realpathSync(p); } catch (e) { return p; } };
try {
  const [ruth, wav] = await T.importOnce([T.media('interview', 'I001_interview.mp4'), T.media('audio', 'concert_set.wav')], BIN);
  T.assert(ruth && wav, 'clips imported');
  const job = US.jobs.testJob('story');
  await S.importFiles(job, [T.media('transcripts', 'I001_interview.srt'), T.media('transcripts', 'C001_sharp_static.json')]);
  const tr = st.transcripts.find(t => t.itemId === ruth.id) || st.transcripts.find(t => t.path && real(t.path) === real(ruth.path)) || st.transcripts.find(t => /I001_interview/.test(US.basename(t.path || t.name)));
  T.assert(tr, 'the interview transcript: ' + st.transcripts.map(t => t.name + ' ' + t.path + ' ' + t.itemId).join(' | ') + ' – clip ' + ruth.path);
  const L = tr.lines;
  // the edit: the interview from 5 s into it, 10 s into the sequence (picture and sound); the concert recording on A2 from 10 s
  const seq = await T.freshSequence(SEQ, ruth.id, BIN);
  await US.host.call('placeClips', { seqId: seq.id, clips: [{ id: ruth.id, in: 5, out: 65, at: 10 }, { id: wav.id, in: 0, out: 60, at: 10, a: 1, video: false }] });
  await S.setScope(job, { kind: 'sequence', seqId: seq.id, seqName: SEQ, inOut: false });
  // lines from the interview's transcript (if the project holds two transcripts of it, Build still finds them in the sequence)
  const lines = L.filter(l => l.start >= 7 && l.end <= 60).slice(1, 3);
  T.assert(lines.length === 2, 'two lines to build');
  const look = Object.assign(S.lookOptions(), { handles: 0.5, themeNames: 'marker', strong: { first: false, highlight: false } });
  const r = await S.buildSequence(job, { name: 'Test – Story every layer selects', groups: [{ name: 'Layers', label: 3, lineIds: lines.map(l => l.id) }], look });
  const info = await US.host.call('sequenceInfo', { seqId: r.seq.id });
  // the same file (a project can hold the interview twice, e.g. after relinking)
  const isFile = (c, it) => c.itemId === it.id || (c.path && it.path && real(c.path).toLowerCase() === real(it.path).toLowerCase()) || c.name === it.name;
  const v1 = info.video[0].clips, a1 = info.audio[0].clips, a2 = (info.audio[1] || { clips: [] }).clips;
  out.layers = { v1: v1.map(c => [c.name, +c.start.toFixed(2), +c.in.toFixed(2)]), a1: a1.map(c => [c.name, +c.start.toFixed(2), +c.in.toFixed(2)]), a2: a2.map(c => [c.name, +c.start.toFixed(2), +c.in.toFixed(2)]) };
  T.assert(v1.length === 2 && v1.every(c => isFile(c, ruth)), 'V1: the camera, twice: ' + JSON.stringify(out.layers.v1));
  T.assert(a1.length === 2 && a1.every(c => isFile(c, ruth)), 'A1: the camera’s own sound, twice: ' + JSON.stringify(out.layers.a1));
  T.assert(a2.length === 2 && a2.every(c => isFile(c, wav)), 'A2: the other recording, twice: ' + JSON.stringify(out.layers.a2));
  lines.forEach((l, i) => {
    T.near(v1[i].in, l.start - 0.5, 0.05, `line ${i + 1}: camera from the line (less its handle)`);
    T.near(a1[i].in, l.start - 0.5, 0.05, `line ${i + 1}: its sound from the same moment`);
    T.near(a2[i].in, l.start - 0.5 - 5, 0.05, `line ${i + 1}: the other recording from the same moment`);
    T.near(a1[i].start, v1[i].start, 0.02, `line ${i + 1}: A1 lines up with V1`); T.near(a2[i].start, v1[i].start, 0.02, `line ${i + 1}: A2 lines up with V1`);
    T.near(v1[i].end - v1[i].start, l.end - l.start + 1, 0.05, `line ${i + 1}: its length with handles`);
  });
  // (2) the multicam: an edit in the test project cut from a multicam clip
  const seqs = await US.host.call('listSequences');
  let edit = null;
  for (const s of seqs) { const m = await US.host.call('storyMulticamsIn', { seqId: s.id }); if (!m.self && m.multicams.length && m.multicams[0].id) { edit = { s, m }; break; } }
  if (!edit) out.multicam = 'skipped: no edit cut from a multicam clip in this test project';
  else {
    const mc = edit.m.multicams[0];
    const res = await S.setMulticamScope(job, { seqId: edit.s.id, seqName: edit.s.name });
    T.assert(S.scopeOf().seqId === mc.id && S.scopeOf().via && S.scopeOf().via.id === edit.s.id, 'working on the multicam’s own sequence: ' + JSON.stringify(S.scopeOf()));
    T.assert(new RegExp('^Lines in the multicam “').test(S.scopeLabel()), S.scopeLabel());
    const ls = S.scopeLines();
    T.assert(ls.length >= 2, 'lines heard in the multicam: ' + ls.length);
    const b = await S.buildSequence(job, { name: 'Test – Story multicam selects', groups: [{ name: 'Multicam', label: 5, lineIds: ls.slice(0, 2).map(l => l.id) }], look });
    const i2 = await US.host.call('sequenceInfo', { seqId: b.seq.id });
    const mv = i2.video[0].clips, ma = i2.audio.flatMap(t => t.clips);
    out.multicam = { edit: edit.s.name, multicam: mc.name, summary: res.summary, v1: mv.map(c => [c.name, +c.start.toFixed(2), +c.in.toFixed(2)]), audio: ma.length };
    T.assert(mv.length === 2 && mv.every(c => c.itemId === mc.itemId), 'V1 is the multicam clip: ' + JSON.stringify(out.multicam.v1));
    T.assert(ma.length >= 2, 'its sound comes with it: ' + ma.length + ' audio clips');
  }
  return out;
} finally {
  Object.assign(st, saved); S.save();
  if (prevBase != null) US.settings.set('story.binBase', prevBase); else if (US.settings.get('story.binBase') != null) { delete US.settings.all()['story.binBase']; US.settings.set('lastTool', US.settings.get('lastTool')); }
}
