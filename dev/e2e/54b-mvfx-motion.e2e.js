// mVFX's animated titles in the real editor: a lower third drawn frame by frame and laid as one clip on "mVFX 1" at
// 1 s (its frames on disk, its length right to the frame), a second title over the same moment on "mVFX 2", a pen
// circle later back on "mVFX 1"; and what the editor then shows – a frame from the middle of the title and one from
// its entrance exported and compared with the panel's own drawing of those moments (so the see-through background,
// the size and the frame rate of the numbered stills are all as intended). Premiere also gets the slow push in.
const M = US.mvfx, P = US.mvfxPack, MO = US.mvfxMotion; T.assert(M && P && MO, 'mVFX and its animated titles are loaded');
const fs = require('fs'), path = require('path');
const BIN = 'Test – mVFX motion', NAME = 'Test – mVFX motion', RES = US.app.is('resolve');
const items = await T.importOnce([T.media('concert', 'C001_sharp_static.mp4')], BIN);
const seq = await T.freshSequence(NAME, items[0].id, BIN);   // the clip only gives the sequence its size and rate: it stays empty, so frames show the title alone
await T.open(seq.id);
const info = await US.host.call('sequenceInfo', { seqId: seq.id, clips: false }), fps = info.fps, W = info.width, H = info.height;
const notes = [`${W}×${H} at ${fps}`], job = US.jobs.testJob('mvfx-motion');
const vals = (id, text, more) => { const p = P.byId(id), v = M.valuesFor(p); Object.assign(v.text, text || {}); return Object.assign(v, { scale: 1, dx: 0, dy: 0, push: false }, more); };
const read = () => US.host.call('editRead', { seqId: seq.id });
const track = (r, name) => r.video.find(t => new RegExp('^' + name + '$', 'i').test(t.name || ''));

// a lower third, 4 s long, at 1 s
const rule = P.byId('nm-rule'), v = vals('nm-rule', { name: 'Mira Haddad', role: 'Nurse' }, { duration: 4, shadow: 0 });
const a = await M.apply(rule, v, { at: 1 }, job);
notes.push(a.summary + (a.result.log && a.result.log.length ? ' · ' + a.result.log.join('; ') : ''));
const want = Math.round(4 * fps);
T.assert(a.result.frames === want && fs.readdirSync(a.result.dir).filter(x => /\.png$/.test(x)).length === want && fs.existsSync(path.join(a.result.dir, 'title.json')), `the frames are on disk: ${a.result.frames} of ${want} in ${a.result.dir}`);
T.assert(/^mVFX 1$/i.test(a.result.trackName), 'on mVFX 1: ' + a.result.trackName);
T.near(a.result.start, 1, 0.6 / fps, 'starts at 1 s'); T.near(a.result.end - a.result.start, want / fps, 1.1 / fps, 'as long as its frames (the stills conform to the sequence’s rate)');
let r = await read();
T.assert(track(r, 'mVFX 1') && track(r, 'mVFX 1').clips.length === 1, 'one clip on mVFX 1: ' + JSON.stringify(r.video.map(t => [t.name, t.clips.length])));
// the same words again are not drawn again
const again = await M.apply(rule, v, { at: 12 }, job);
T.assert(again.result.drawn === 0 && again.result.dir === a.result.dir, 'the same title reuses its frames');
// a second title over the same moment takes the next track; a mark later is back on the first
const b = await M.apply(P.byId('ti-chapter'), vals('ti-chapter', { big: 'The River' }, { duration: 3 }), { at: 2 }, job);
T.assert(/^mVFX 2$/i.test(b.result.trackName), 'the overlapping title on mVFX 2: ' + b.result.trackName);
const c = await M.apply(P.byId('mk-circle'), vals('mk-circle', {}, { duration: 2 }), { at: 6 }, job);
T.assert(/^mVFX 1$/i.test(c.result.trackName), 'the circle on mVFX 1 again: ' + c.result.trackName);
notes.push(b.summary, c.summary);

// what the editor shows, against the panel's own drawing of the same moment
const canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H;
const ctx = canvas.getContext('2d', { willReadFrequently: true }), scene = MO.prepare(ctx, W, H, rule, v, 4);
const box = { x: 0, y: Math.round(H * 0.72), w: Math.round(W * 0.5), h: Math.round(H * 0.24) };   // where the lower third sits
const ours = t => { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H); MO.draw(ctx, scene, t); return ctx.getImageData(box.x, box.y, box.w, box.h).data; };
async function shown(sec, tag) {
  const out = path.join(a.result.dir, '..', `e2e-frame-${tag}`);
  const file = await US.host.call('exportFrame', { seqId: seq.id, seconds: sec, outBase: out });
  const img = new Image(); await new Promise((ok, no) => { img.onload = ok; img.onerror = () => no(new Error('frame not readable: ' + file)); img.src = T.fileUrl(file) + '?' + Date.now(); });
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H); ctx.drawImage(img, 0, 0, W, H);
  return { data: ctx.getImageData(box.x, box.y, box.w, box.h).data, file };
}
const lum = d => { let s = 0, n = 0; for (let i = 0; i < d.length; i += 4) { const y = (d[i] * 2 + d[i + 1] * 3 + d[i + 2]) / 6; s += y; if (y > 96) n++; } return { mean: s / (d.length / 4), bright: n }; };
const diff = (p, q) => { let s = 0; for (let i = 0; i < p.length; i += 4) s += Math.abs(p[i + 1] - q[i + 1]); return s / (p.length / 4); };
if (b.result.track != null) { /* the chapter title sits mid-frame, outside the box */ }
// the hold: the whole lower third, where it should be
const hold = await shown(1 + 2.4, 'hold'), mine = ours(2.4), lh = lum(hold.data), lm = lum(mine);
notes.push(`hold: shown ${lh.bright} bright px, drawn ${lm.bright}, difference ${diff(hold.data, mine).toFixed(2)}`);
T.assert(lm.bright > 300, 'the panel draws the title: ' + lm.bright);
T.assert(lh.bright > lm.bright * 0.6 && lh.bright < lm.bright * 1.6, `the editor shows the title where the panel drew it: ${lh.bright} bright pixels against ${lm.bright} (${hold.file})`);
T.assert(diff(hold.data, mine) < 2.5, 'the shown frame matches the drawn one: ' + diff(hold.data, mine).toFixed(2));
// the entrance: the frame at 0.6 s in looks like our 0.6 s, not like the same frame count at another rate
const tIn = Math.round(0.6 * fps) / fps, early = await shown(1 + tIn, 'in'), right = diff(early.data, ours(tIn)), wrong = Math.min(diff(early.data, ours(tIn * 29.97 / fps)), diff(early.data, ours(tIn * 24 / fps)), diff(early.data, ours(tIn + 0.2)));
notes.push(`entrance at ${tIn.toFixed(2)} s: difference ${right.toFixed(2)} to that moment, ${wrong.toFixed(2)} to others`);
T.assert(right < 2.5 && (Math.abs(fps - 29.97) < 0.1 || right <= wrong), `the entrance plays at the sequence’s frame rate: ${right.toFixed(2)} against ${wrong.toFixed(2)}`);
// before it starts and after it ends: nothing
const before = await shown(0.5, 'before');
T.assert(lum(before.data).bright === 0, 'nothing before the title starts');

// changing a title that's on the timeline: the new one takes the old one's place
const rep = await M.apply(rule, vals('nm-rule', { name: 'Mira Haddad-Okafor', role: 'Senior nurse' }, { duration: 4, shadow: 0 }), { replace: { kind: 'video', track: a.result.track, start: a.result.start, end: a.result.end } }, job);
r = await read();
const t1 = track(r, 'mVFX 1').clips.filter(c => Math.abs(c.start - 1) < 0.05);
T.assert(/replaced at/.test(rep.summary) && t1.length === 1 && rep.result.dir !== a.result.dir && /^mVFX 1$/i.test(rep.result.trackName), 'the title at 1 s was replaced, not doubled: ' + rep.summary + ' ' + JSON.stringify(r.video.map(t => [t.name, t.clips.map(c => c.start)])));
notes.push(rep.summary);

if (!RES) {   // Premiere: the slow push in is two Scale keyframes on the title's clip
  const d = await M.apply(P.byId('ti-later'), vals('ti-later', {}, { duration: 3, push: true }), { at: 16 }, job);
  const keys = await US.host.rawEval(`(function(){ var ss=app.project.sequences; for (var i=0;i<ss.numSequences;i++) if (ss[i].sequenceID==${JSON.stringify(seq.id)}) { var tr=ss[i].videoTracks[${d.result.track}]; for (var n=0;n<tr.clips.numItems;n++) { var c=tr.clips[n]; if (Math.abs(c.start.seconds-16)>0.1) continue; for (var k=0;k<c.components.numItems;k++) if (c.components[k].displayName=='Motion') for (var p=0;p<c.components[k].properties.numItems;p++) if (c.components[k].properties[p].displayName=='Scale') { var pr=c.components[k].properties[p], ks=pr.getKeys()||[], o=[]; for (var j=0;j<ks.length;j++) o.push(pr.getValueAtKey(ks[j])); return JSON.stringify(o); } } } return '[]'; })()`);
  notes.push('push in: Scale keys ' + keys + (d.result.note ? ' · ' + d.result.note : ''));
  const kv = JSON.parse(keys || '[]');
  T.assert(kv.length === 2 && Math.abs(kv[0] - 100) < 0.1 && Math.abs(kv[1] - 104) < 0.1, 'two Scale keys 100 → 104: ' + keys);
}
return notes;
