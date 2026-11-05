// mVFX in the real editor: three clips in a fresh sequence, then – a lower third at 1 s (Premiere: a PNG rule + two
// Basic Title text layers on mVFX tracks, the words read back; Resolve: our Fusion title inserted from the Effects
// Library, or a plain “install and restart” note the first time), a film-grain overlay, a held frame with the
// spotlight look, a camera move (Premiere: keyframes; Resolve: a still punch-in), the Warm archive look (Premiere:
// Lumetri; Resolve: a LUT on node 1), and the Light leak transition at the cuts (Resolve: over the playhead).
const M = US.mvfx, P = US.mvfxPack; T.assert(M && P, 'mVFX is loaded');
const fs = require('fs');
const BIN = 'Test – mVFX', NAME = 'Test – mVFX', RES = US.app.is('resolve');
const items = await T.importOnce(['C001_sharp_static.mp4', 'C002_blurry.mp4', 'C003_dark.mp4'].map(f => T.media('concert', f)), BIN);
const seq = await T.freshSequence(NAME, items[0].id, BIN);
await US.host.call('placeClips', { seqId: seq.id, cursor: 0, clips: items.map(it => ({ id: it.id, in: 0, out: 4 })) });
await T.open(seq.id);
const notes = [], job = US.jobs.testJob('mvfx');
const v = (p, text) => Object.assign(M.valuesFor(p), text ? { text } : {});
const read = () => US.host.call('editRead', { seqId: seq.id });

if (RES) {
  const inst = await M.installAll(job);
  T.assert(inst.result.written.length >= 40 && fs.existsSync(inst.result.dir), 'the pack installed: ' + inst.summary);
  notes.push('installed: ' + inst.result.written.length);
  let r = null, missing = '';
  try { r = await M.apply(P.byId('hairline'), v(P.byId('hairline'), { name: 'Mira Haddad', role: 'Nurse' }), { at: 1 }, job); }
  catch (e) { missing = e.title || e.message; }
  if (r) {
    notes.push('hairline: ' + r.summary);
    const info = await read(), got = info.video.flatMap(t => t.clips).filter(c => Math.abs(c.start - 1) < 0.1);
    T.assert(got.length >= 1, 'a title at 1 s: ' + JSON.stringify(info.video.map(t => t.clips.map(c => [c.name, c.start]))));
    const g = await M.apply(P.byId('grain'), v(P.byId('grain')), { at: 2 }, job); notes.push('grain: ' + g.summary);
  } else {
    T.assert(/couldn’t find/.test(missing), 'the first time, Resolve has to be restarted to list new templates – said plainly: ' + missing);
    notes.push('titles need a restart of Resolve: ' + missing);
  }
  const fr = await M.apply(P.byId('frzspot'), v(P.byId('frzspot')), { at: 3 }, job);
  T.assert(fs.existsSync(fr.result.path) && fr.result.start >= 2.9, 'the frame held: ' + fr.summary);
  notes.push('freeze: ' + fr.summary);
  const mv = await M.apply(P.byId('punch'), null, { scope: 'all' }, job);
  const info = await read();
  T.assert(info.video[0].clips.every(c => Math.abs(c.scale - 120) < 0.6), 'every clip at 120% (a still punch-in in Resolve): ' + info.video[0].clips.map(c => c.scale));
  notes.push('punch: ' + mv.summary);
  let refused = '';
  try { await M.apply(P.byId('pushin'), null, { scope: 'all' }, job); } catch (e) { refused = e.title || e.message; }
  T.assert(/Resolve doesn’t let add-ons/.test(refused), 'keyframed moves refused plainly: ' + refused);
  const lk = await M.apply(P.byId('lkwarm'), null, { scope: 'all' }, job);
  T.assert(lk.result.done === 3, 'the look on 3 clips: ' + lk.summary);
  const lut = await T.devEval('const t = R.needSeq(' + JSON.stringify(seq.id) + '); return R.list(t.GetItemListInTrack("video", 1)).map(i => i.GetLUT ? i.GetLUT(1) : "?")');
  notes.push('LUTs: ' + JSON.stringify(lut));
  const tr = await M.apply(P.byId('trleak'), v(P.byId('trleak')), { at: 4 }, job);
  T.assert(/laid over the playhead/.test(tr.summary), 'the wash over the cut: ' + tr.summary);
  notes.push('leak: ' + tr.summary);
  return notes;
}

// Premiere
const lt = await M.apply(P.byId('hairline'), v(P.byId('hairline'), { name: 'Mira Haddad', role: 'Nurse' }), { at: 1 }, job);
notes.push('hairline: ' + lt.summary);
T.assert(lt.result.placed === 3 && lt.result.tracks.length === 3, 'a rule and two text layers: ' + JSON.stringify(lt.result));
notes.push('text JSON keys: ' + JSON.stringify(lt.result.text.map(t => [t.words, t.font, t.size, t.colour, t.keys.slice(0, 12)])));
const words = await US.host.call('renderRanges', { seqId: seq.id, track: 'mVFX 2', kinds: 'text' });
T.assert(words.ranges.length === 1 && words.ranges[0].name === 'Mira Haddad' && Math.abs(words.ranges[0].start - 1) < 0.05 && Math.abs(words.ranges[0].end - 6) < 0.1, 'the name read back from the text layer: ' + JSON.stringify(words.ranges));
const role = await US.host.call('renderRanges', { seqId: seq.id, track: 'mVFX 3', kinds: 'text' });
T.assert(role.ranges.length === 1 && role.ranges[0].name === 'NURSE', 'the role in capitals: ' + JSON.stringify(role.ranges));
let info = await read();
const art = info.video.find(t => /^mVFX 1$/i.test(t.name));
T.assert(art && art.clips.length === 1 && Math.abs(art.clips[0].start - 1) < 0.05 && /\.png$/i.test(art.clips[0].path || ''), 'the rule as a PNG on mVFX 1: ' + JSON.stringify(art && art.clips));
// an overlay
const g = await M.apply(P.byId('grain'), v(P.byId('grain')), { at: 2 }, job);
T.assert(g.result.placed === 1, 'grain placed: ' + g.summary); notes.push('grain: ' + g.summary);
// a held frame with its look
const fr = await M.apply(P.byId('frzspot'), v(P.byId('frzspot')), { at: 3 }, job);
T.assert(fs.existsSync(fr.result.path) && Math.abs(fr.result.start - 3) < 0.05 && Math.abs(fr.result.end - 6) < 0.1, 'the frame held for 3 s: ' + JSON.stringify(fr.result));
notes.push('freeze: ' + fr.summary);
// a camera move: keyframes, so Scale no longer reads as one value
const mv = await M.apply(P.byId('pushin'), null, { scope: 'all' }, job);
T.assert(mv.result.done === 3, 'push in on 3 clips: ' + mv.summary);
info = await read();
T.assert(info.video[0].clips.every(c => c.scale == null), 'Scale is keyframed (not one value) on the clips: ' + info.video[0].clips.map(c => c.scale));
const keys = await US.host.rawEval(`(function(){ var ss=app.project.sequences; for (var i=0;i<ss.numSequences;i++) if (ss[i].sequenceID==${JSON.stringify(seq.id)}) { var c=ss[i].videoTracks[0].clips[0]; for (var k=0;k<c.components.numItems;k++) if (c.components[k].displayName=='Motion') for (var p=0;p<c.components[k].properties.numItems;p++) if (c.components[k].properties[p].displayName=='Scale') { var ks=c.components[k].properties[p].getKeys(); var o=[]; for (var j=0;j<ks.length;j++) o.push([ks[j].seconds, c.components[k].properties[p].getValueAtKey(ks[j])]); return JSON.stringify(o); } } })()`);
notes.push('scale keys: ' + keys);
const kv = JSON.parse(keys || '[]');
T.assert(kv.length === 2 && Math.abs(kv[0][1] - 100) < 0.1 && Math.abs(kv[1][1] - 112) < 0.1, 'two Scale keys 100 → 112: ' + keys);
// a look: Lumetri Color with the look's settings
const lk = await M.apply(P.byId('lkwarm'), null, { scope: 'all' }, job);
T.assert(lk.result.done === 3 && lk.result.set.length >= 3, 'Lumetri on 3 clips with settings: ' + lk.summary + ' · set ' + lk.result.set.join(', ') + ' · ' + lk.result.log.join('; '));
info = await read();
T.assert(info.video[0].clips.every(c => (c.effects || []).some(e => /Lumetri/i.test(e))), 'Lumetri Color on every clip: ' + JSON.stringify(info.video[0].clips.map(c => c.effects)));
notes.push('look: ' + lk.summary + ' · ' + lk.result.set.join(', '));
T.assert(fs.existsSync(M.lutFile('warm')), 'the .cube written');
// a transition with its wash at the two cuts
const tr = await M.apply(P.byId('trleak'), v(P.byId('trleak')), { scope: 'all' }, job);
T.assert(tr.result.cuts === 2 && tr.result.done === 2, 'light leak at 2 cuts with 2 dissolves: ' + tr.summary);
notes.push('leak: ' + tr.summary);
return notes;
