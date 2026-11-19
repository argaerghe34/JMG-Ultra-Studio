// mVFX in the real editor: three clips in a fresh sequence, then – a lower third at 1 s (Premiere: a PNG rule + two
// Basic Title text layers that really show in the exported frame, where the preview draws them;
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
// whether this Premiere takes a text layer's words is remembered in a setting shared with the installed copy: tried
// afresh here, and put back as it was at the end (also when a check fails)
const wasDrawn = US.settings.get('mvfx.textDrawn', null);
US.settings.set('mvfx.textDrawn', undefined);
try {
const lt = await M.apply(P.byId('hairline'), v(P.byId('hairline'), { name: 'Mira Haddad', role: 'Nurse' }), { at: 1 }, job);
notes.push('hairline: ' + lt.summary);
let info;
if (lt.result.drawnTitle) {
  // this Premiere won't let a script set a text layer's words (27.0): the text layers were taken away again and the
  // title drawn whole – only the drawn clip is at 1 s, nothing of the template's "Your Title Here"
  notes.push('PLAIN TEXT IS DRAWN IN THIS PREMIERE: ' + JSON.stringify(lt.result.textLog || []) + ' · removed ' + lt.result.removed);
  info = await read();
  const at1 = info.video.flatMap(t => t.clips.map(c => Object.assign({ track: t.name }, c))).filter(c => Math.abs(c.start - 1) < 0.05 && /^mVFX/i.test(c.track));
  T.assert(at1.length === 1 && /\.png$/i.test(at1[0].path || '') && Math.abs(at1[0].end - 6) < 0.1 && /words can’t be edited in Properties/.test(lt.summary), 'only the drawn title at 1–6 s, and said: ' + JSON.stringify(at1) + ' · ' + lt.summary);
} else {
T.assert(lt.result.placed === 3 && lt.result.tracks.length === 3, 'a rule and two text layers: ' + JSON.stringify(lt.result));
notes.push('text JSON keys: ' + JSON.stringify(lt.result.text.map(t => [t.words, t.font, t.size, t.colour, t.keys.slice(0, 12)])));
const words = await US.host.call('renderRanges', { seqId: seq.id, track: 'mVFX 2', kinds: 'text' });
T.assert(words.ranges.length === 1 && words.ranges[0].name === 'Mira Haddad' && Math.abs(words.ranges[0].start - 1) < 0.05 && Math.abs(words.ranges[0].end - 6) < 0.1, 'the name read back from the text layer: ' + JSON.stringify(words.ranges));
const role = await US.host.call('renderRanges', { seqId: seq.id, track: 'mVFX 3', kinds: 'text' });
T.assert(role.ranges.length === 1 && role.ranges[0].name === 'NURSE', 'the role in capitals: ' + JSON.stringify(role.ranges));
info = await read();
const art = info.video.find(t => /^mVFX 1$/i.test(t.name));
T.assert(art && art.clips.length === 1 && Math.abs(art.clips[0].start - 1) < 0.05 && /\.png$/i.test(art.clips[0].path || ''), 'the rule as a PNG on mVFX 1: ' + JSON.stringify(art && art.clips));
}
// …and the title is really IN the picture (it used to be placed thousands of pixels outside it): the same title again
// past the end of the clips, where the frame is otherwise black – what Premiere shows there against the panel's own drawing
{
  const path = require('path'), sz = await US.host.call('sequenceInfo', { seqId: seq.id, clips: false }), W = sz.width, H = sz.height, hair = P.byId('hairline'), hv = v(hair, { name: 'Mira Haddad', role: 'Nurse' });
  const far = await M.apply(hair, hv, { at: 14 }, job);
  T.assert(far.result.placed === 3 || far.result.drawnTitle, 'the title again at 14 s: ' + far.summary);
  const file = await US.host.call('exportFrame', { seqId: seq.id, seconds: 14 + 3, outBase: path.join(M.artDir(), 'e2e-plain-title') });
  const c = document.createElement('canvas'); c.width = W; c.height = H; const ctx = c.getContext('2d', { willReadFrequently: true });
  const box = { x: 0, y: Math.round(H * 0.66), w: Math.round(W * 0.7), h: Math.round(H * 0.3) };   // where Hairline sits
  const stats = () => { const d = ctx.getImageData(box.x, box.y, box.w, box.h).data; let n = 0, sx = 0, sy = 0; for (let i = 0; i < d.length; i += 4) if ((d[i] * 2 + d[i + 1] * 3 + d[i + 2]) / 6 > 96) { n++; sx += (i / 4) % box.w; sy += Math.floor(i / 4 / box.w); } return { n, x: n ? sx / n / W : 0, y: n ? (box.y + sy / n) / H : 0 }; };
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H); P.paint(ctx, W, H, hair, hv, { t: 1 }); const mine = stats();
  const img = new Image(); await new Promise((ok, no) => { img.onload = ok; img.onerror = () => no(new Error('frame not readable: ' + file)); img.src = T.fileUrl(file) + '?' + Date.now(); });
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H); ctx.drawImage(img, 0, 0, W, H); const shown = stats();
  notes.push(`plain title in the picture: Premiere shows ${shown.n} bright px centred ${(shown.x * 100).toFixed(1)}%, ${(shown.y * 100).toFixed(1)}% · the panel draws ${mine.n} centred ${(mine.x * 100).toFixed(1)}%, ${(mine.y * 100).toFixed(1)}% · log ${JSON.stringify(far.result.log)} (${file})`);
  T.assert(mine.n > 300, 'the panel draws the title: ' + mine.n);
  T.assert(shown.n > mine.n * 0.3, `the title shows in Premiere’s picture where a lower third sits: ${shown.n} bright pixels against the panel’s ${mine.n} (${file})`);
  T.assert(Math.abs(shown.x - mine.x) < 0.06 && Math.abs(shown.y - mine.y) < 0.06, `and it sits where the preview shows it: ${JSON.stringify(shown)} against ${JSON.stringify(mine)}`);
  const sel = await US.host.call('renderRanges', { seqId: seq.id, track: 'mVFX 2', kinds: 'text' });
  if (!far.result.drawnTitle) T.assert(sel.ranges.some(r => r.name === 'Mira Haddad' && Math.abs(r.start - 14) < 0.05), 'its words read back at 14 s: ' + JSON.stringify(sel.ranges));
}
// an overlay
const g = await M.apply(P.byId('grain'), v(P.byId('grain')), { at: 2 }, job);
T.assert(g.result.placed === 1 && g.result.moving && g.result.frames >= 100, 'grain placed as a moving clip: ' + g.summary + ' ' + JSON.stringify({ frames: g.result.frames, log: g.result.log })); notes.push('grain: ' + g.summary);
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
} finally { US.settings.set('mvfx.textDrawn', wasDrawn == null ? undefined : wasDrawn); }
