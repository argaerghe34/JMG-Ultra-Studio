// resolve-only
// Story › Build while working on a timeline, in real Resolve (the twin of 22u-story-multicam): (1) an edit with the
// interview camera on V1 (its own sound on A1) and another recording on A2 – each line brings every layer, from the
// same moments; (2) “Its multicam” – from an edit cut from a multicam clip, Story works on the multicam clip itself
// (Resolve has no multicam sequence) and Build gives each line as the multicam clip. Everything is read back from
// Resolve's own timeline items. The multicam clip is the one 22s-story-sources makes (“J001 – multicam”); without it
// that part is skipped and says so. In the test project only.
const S = US.story, fs = require('fs');
const BIN = 'Test – Story', SEQ = 'Test – Story edit with every layer (Resolve)', SEQM = 'Test – Story multicam edit (Resolve)';
const OUT = 'Test – Story every layer selects (Resolve)', OUTM = 'Test – Story multicam selects (Resolve)';
const prevBase = US.settings.get('story.binBase');
US.settings.set('story.binBase', BIN);
const st = S.loadState(), saved = JSON.parse(JSON.stringify({ scope: st.scope || { kind: 'all' }, transcripts: st.transcripts }));
const out = {};
const real = p => { try { return fs.realpathSync(p); } catch (e) { return p; } };
async function fresh(name) { const old = await T.seqByName(name); if (old) await US.host.call('deleteSequence', { seqId: old.id }); }
// every item on a timeline as Resolve has it: type, track, Media Pool item, place and source times (media seconds), links
const items = seqId => T.devEval(`const t = R.needSeq(${JSON.stringify(seqId)}), out = [];
  for (const type of ['video', 'audio']) for (let k = 1; k <= t.GetTrackCount(type); k++) for (const ti of R.list(t.GetItemListInTrack(type, k)).filter(Boolean)) {
    const m = ti.GetMediaPoolItem(), x = R.itemTimes(t, ti); let linked = 0; try { linked = R.list(ti.GetLinkedItems()).length; } catch (e) { linked = -1; }
    out.push({ type, track: k, id: m ? R.id(m) : '', name: m ? String(m.GetName()) : '', start: +x.start.toFixed(3), end: +x.end.toFixed(3), in: +x.in.toFixed(3), linked });
  } return out;`);
const on = (list, type, track) => list.filter(i => i.type === type && i.track === track).sort((a, b) => a.start - b.start);
const brief = list => list.map(i => `${i.type[0].toUpperCase()}${i.track} ${i.name} ${i.start}–${i.end} in ${i.in}`);
try {
  const [ruth, wav] = await T.importOnce([T.media('interview', 'I001_interview.mp4'), T.media('audio', 'concert_set.wav')], BIN);
  T.assert(ruth && wav, 'clips imported');
  const job = US.jobs.testJob('story');
  await S.importFiles(job, [T.media('transcripts', 'I001_interview.srt')]);
  const tr = st.transcripts.find(t => t.itemId === ruth.id) || st.transcripts.find(t => t.path && real(t.path) === real(ruth.path));
  T.assert(tr, 'the interview transcript: ' + st.transcripts.map(t => t.name + ' ' + t.path).join(' | '));
  const L = tr.lines;

  // (1) the edit: the interview from 5 s into it, 10 s into the timeline (picture and sound); the concert recording on A2 from 10 s
  const seq = await T.freshSequence(SEQ, ruth.id, BIN);
  await US.host.call('placeClips', { seqId: seq.id, clips: [{ id: ruth.id, in: 5, out: 65, at: 10 }, { id: wav.id, in: 0, out: 60, at: 10, a: 1, video: false }] });
  const edit = await items(seq.id);
  out.edit = brief(edit);
  T.assert(on(edit, 'video', 1).length === 1 && on(edit, 'audio', 2).length === 1 && on(edit, 'audio', 2)[0].id === wav.id, 'the edit: camera on V1, the other recording on A2: ' + out.edit.join(' · '));
  await S.setScope(job, { kind: 'sequence', seqId: seq.id, seqName: SEQ, inOut: false });
  const lines = L.filter(l => l.start >= 7 && l.end <= 60).slice(1, 3);
  T.assert(lines.length === 2, 'two lines to build');
  const look = Object.assign(S.lookOptions(), { handles: 0.5, themeNames: 'marker', strong: { first: false, highlight: false } });
  await fresh(OUT);
  const r = await S.buildSequence(job, { name: OUT, groups: [{ name: 'Layers', label: 3, lineIds: lines.map(l => l.id) }], look });
  const got = await items(r.seq.id);
  out.layers = brief(got);
  const v1 = on(got, 'video', 1), a1 = on(got, 'audio', 1), a2 = on(got, 'audio', 2);
  T.assert(v1.length === 2 && v1.every(c => c.id === ruth.id), 'V1: the camera, twice: ' + out.layers.join(' · '));
  T.assert(a1.length === 2 && a1.every(c => c.id === ruth.id), 'A1: the camera’s own sound, twice: ' + out.layers.join(' · '));
  T.assert(a2.length === 2 && a2.every(c => c.id === wav.id), 'A2: the other recording, twice: ' + out.layers.join(' · '));
  lines.forEach((l, i) => {
    T.near(v1[i].in, l.start - 0.5, 0.06, `line ${i + 1}: camera from the line (less its handle)`);
    T.near(a1[i].in, l.start - 0.5, 0.06, `line ${i + 1}: its sound from the same moment`);
    T.near(a2[i].in, l.start - 0.5 - 5, 0.06, `line ${i + 1}: the other recording from the same moment`);
    T.near(a1[i].start, v1[i].start, 0.05, `line ${i + 1}: A1 lines up with V1`); T.near(a2[i].start, v1[i].start, 0.05, `line ${i + 1}: A2 lines up with V1`);
    T.near(a2[i].end, v1[i].end, 0.05, `line ${i + 1}: A2 ends with V1`);
    T.near(v1[i].end - v1[i].start, l.end - l.start + 1, 0.06, `line ${i + 1}: its length with handles`);
  });
  T.assert(v1.every(v => v.linked >= 2), 'each line’s picture and every sound move together (linked)');

  // (2) the multicam: an edit cut from the multicam clip 22s-story-sources makes
  const mc = (await US.host.call('storySources', {})).find(s => s.kind === 'multicam' && s.name.startsWith('J001'));
  if (!mc) out.multicam = 'skipped: no “J001 – multicam” in the test project (22s-story-sources makes it)';
  else {
    // Story reads the multicam clip itself (transcribed once by Resolve; read as it is afterwards)
    st.transcripts = [];
    const rr = await S.readResolveTranscripts(job, { ids: [mc.id], transcribe: true });
    await T.sleep(400); document.querySelectorAll('.modal-back').forEach(m => m.remove());   // any offer, not needed here
    const mT = st.transcripts.find(t => t.itemId === mc.id);
    T.assert(mT && mT.lines.length >= 2, 'the multicam clip read in Story: ' + (rr && rr.summary));
    const len = Math.min(40, Math.floor(mT.lines[mT.lines.length - 1].end));   // inside the multicam clip
    await fresh(SEQM);
    const e = await US.host.call('newSequence', { name: SEQM, binPath: BIN, likeId: mc.id });
    await US.host.call('placeClips', { seqId: e.id, clips: [{ id: mc.id, in: 0, out: len, at: 0 }] });
    const mcs = await US.host.call('storyMulticamsIn', { seqId: e.id });
    T.assert(!mcs.self && mcs.multicams.length === 1 && mcs.multicams[0].itemId === mc.id, 'the edit uses the multicam clip: ' + JSON.stringify(mcs));
    const res = await S.setMulticamScope(job, { seqId: e.id, seqName: SEQM });
    T.assert(S.scopeOf().multicam && S.scopeOf().kind === 'interviews' && S.scopeOf().via && S.scopeOf().via.id === e.id, 'working on the multicam clip: ' + JSON.stringify(S.scopeOf()));
    const ls = S.scopeLines().filter(l => l.start > 0.5 && l.end <= len && !/\?\s*$/.test(l.text));
    T.assert(ls.length >= 2, 'lines heard in the multicam: ' + ls.length);
    await fresh(OUTM);
    const b = await S.buildSequence(job, { name: OUTM, groups: [{ name: 'Multicam', label: 5, lineIds: ls.slice(0, 2).map(l => l.id) }], look });
    const om = await items(b.seq.id), mv = on(om, 'video', 1), ma = om.filter(i => i.type === 'audio');
    out.multicam = { summary: res.summary, items: brief(om) };
    T.assert(mv.length === 2 && mv.every(c => c.id === mc.id), 'V1 is the multicam clip: ' + out.multicam.items.join(' · '));
    T.assert(ma.length >= 2 && ma.every(c => c.id === mc.id), 'its sound comes with it: ' + out.multicam.items.join(' · '));
    ls.slice(0, 2).forEach((l, i) => T.near(mv[i].in, Math.max(0, l.start - 0.5), 0.06, `multicam line ${i + 1} from the line (less its handle)`));
  }
  return out;
} finally {
  Object.assign(st, saved); S.reindex && S.reindex(); S.save();
  if (prevBase != null) US.settings.set('story.binBase', prevBase); else if (US.settings.get('story.binBase') != null) { delete US.settings.all()['story.binBase']; US.settings.set('lastTool', US.settings.get('lastTool')); }
}
