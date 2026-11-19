// premiere-only – moving film as numbered stills with a blend mode, text layers read from Premiere, Opacity keys; Resolve
// uses its own Fusion generators and titles for these (54-mvfx covers them).
// mVFX in real Premiere, the 19 Nov notes: film grain and dust that MOVE (two neighbouring frames differ where a plain
// clip's don't; the clip has its blend mode and a fade whose top is the Strength), an animated title added as text
// layers for the Properties panel (words read back from Premiere, shown in the picture where the panel draws them), a
// picture “dropped” on the timeline dressed afterwards (mvfxDropped), and a movement with nothing selected going on
// the clip under the playhead.
const M = US.mvfx, P = US.mvfxPack, MO = US.mvfxMotion; T.assert(M && P && MO && M.renderFilm, 'mVFX with moving film is loaded');
const fs = require('fs'), path = require('path');
const BIN = 'Test – mVFX film', NAME = 'Test – mVFX film';
const items = await T.importOnce([T.media('concert', 'C001_sharp_static.mp4')], BIN);
const seq = await T.freshSequence(NAME, items[0].id, BIN);
await US.host.call('placeClips', { seqId: seq.id, cursor: 0, clips: [{ id: items[0].id, in: 0, out: 8 }] });   // 0–8 s: a still-ish shot; after that the frame is black
await T.open(seq.id);
const info = await US.host.call('sequenceInfo', { seqId: seq.id, clips: false }), fps = info.fps, W = info.width, H = info.height;
const notes = [`${W}×${H} at ${fps}`], job = US.jobs.testJob('mvfx-film');
const vals = (id, more) => Object.assign(M.valuesFor(P.byId(id)), more);
const canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H;
const ctx = canvas.getContext('2d', { willReadFrequently: true });
async function frame(sec, tag) {
  const file = await US.host.call('exportFrame', { seqId: seq.id, seconds: sec, outBase: path.join(M.artDir(), `e2e-film-${tag}`) });
  const img = new Image(); await new Promise((ok, no) => { img.onload = ok; img.onerror = () => no(new Error('frame not readable: ' + file)); img.src = T.fileUrl(file) + '?' + Date.now(); });
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H); ctx.drawImage(img, 0, 0, W, H);
  return ctx.getImageData(0, 0, W, H).data;
}
const diff = (p, q) => { let s = 0; for (let i = 0; i < p.length; i += 16) s += Math.abs(p[i + 1] - q[i + 1]); return s / (p.length / 16); };
const prop = (track, at, comp, name, what) => US.host.rawEval(`(function(){ var ss=app.project.sequences; for (var i=0;i<ss.numSequences;i++) if (ss[i].sequenceID==${JSON.stringify(seq.id)}) { var tr=ss[i].videoTracks[${track}]; for (var n=0;n<tr.clips.numItems;n++) { var c=tr.clips[n]; if (Math.abs(c.start.seconds-${at})>0.1) continue; for (var k=0;k<c.components.numItems;k++) if (c.components[k].displayName==${JSON.stringify(comp)}) for (var p=0;p<c.components[k].properties.numItems;p++) if (c.components[k].properties[p].displayName==${JSON.stringify(name)}) { var pr=c.components[k].properties[p]; ${what} } } } return 'null'; })()`);

// how much two neighbouring frames of the shot differ on their own
const still = diff(await frame(6, 'plain-a'), await frame(6 + 1 / fps, 'plain-b'));

// film grain, 3 s at 1 s: one clip of numbered stills, a second of different frames then the same again
const grain = await M.apply(P.byId('grain'), vals('grain', { duration: 3, alpha: 0.6 }), { at: 1 }, job);
const want = Math.round(3 * fps), loop = fs.readdirSync(path.join(grain.result.dir, 'loop')).filter(x => /\.png$/.test(x)).length;
notes.push(grain.summary + (grain.result.log && grain.result.log.length ? ' · ' + grain.result.log.join('; ') : ''));
T.assert(grain.result.moving && grain.result.frames === want && fs.readdirSync(grain.result.dir).filter(x => /\.png$/.test(x)).length === want, `grain’s frames are on disk: ${grain.result.frames} of ${want}`);
T.assert(loop === Math.round(fps) || loop === want, `a one-second loop of different frames: ${loop}`);
T.near(grain.result.end - grain.result.start, want / fps, 1.1 / fps, 'the grain clip is as long as asked');
const blend = await prop(grain.result.track, 1, 'Opacity', 'Blend Mode', 'return String(pr.getValue());');
const fade = JSON.parse(await prop(grain.result.track, 1, 'Opacity', 'Opacity', 'var ks=pr.getKeys()||[], o=[]; for (var j=0;j<ks.length;j++) o.push(pr.getValueAtKey(ks[j])); return JSON.stringify(o);') || '[]');
notes.push(`grain: blend mode ${blend} (17 = Overlay), opacity keys ${JSON.stringify(fade)}`);
T.assert(String(blend) === '17', 'grain is set to Overlay: ' + blend);
T.assert(fade.length === 4 && Math.abs(Math.max(...fade) - 60) < 1.5 && Math.min(...fade) === 0, 'it fades in to its Strength (60%) and out again: ' + JSON.stringify(fade));
const g1 = diff(await frame(2.5, 'grain-a'), await frame(2.5 + 1 / fps, 'grain-b'));
notes.push(`moving: neighbouring frames differ by ${g1.toFixed(2)} with grain, ${still.toFixed(2)} without`);
T.assert(g1 > still + 0.3, `the grain moves from frame to frame: ${g1.toFixed(2)} against ${still.toFixed(2)} for the shot alone`);

// dust and scratches over the same moment: the next mVFX track, Screen, and it moves too
const dust = await M.apply(P.byId('dust'), vals('dust', { duration: 3, alpha: 1 }), { at: 4.5 }, job);
T.assert(dust.result.moving && /^mVFX \d$/i.test(dust.result.trackName), 'dust placed: ' + dust.summary);
const d1 = diff(await frame(6, 'dust-a'), await frame(6 + 2 / fps, 'dust-b'));
notes.push(`${dust.summary} · neighbouring frames differ by ${d1.toFixed(3)} (the shot alone ${still.toFixed(3)})`);
T.assert(d1 > still, `dust comes and goes: ${d1.toFixed(3)} against ${still.toFixed(3)}`);
const again = await M.apply(P.byId('dust'), vals('dust', { duration: 3, alpha: 1 }), { at: 30 }, job);
T.assert(again.result.drawn === 0, 'the same overlay again draws nothing new');

// an animated title as text layers for the Properties panel, at 10 s (black behind it)
const rule = P.byId('nm-rule'), rv = vals('nm-rule', { duration: 4, shadow: 0, scale: 1, dx: 0, dy: 0, push: false, editable: true }); Object.assign(rv.text, { name: 'Mira Haddad', role: 'Nurse' });
T.assert(M.editablePlan(rule, rv, { width: W, height: H }).ok, 'Ruled can be text layers');
const ed = await M.apply(rule, rv, { at: 10 }, job);
if (ed.result.fellBack) {
  // this Premiere won't let a script set a text layer's words (27.0): the text layers are taken away again and the
  // title is added drawn whole – check that's what is on the timeline, and nothing of the template's text is left
  notes.push('WORDS AS TEXT LAYERS NOT POSSIBLE HERE: ' + ed.summary + ' · ' + JSON.stringify(ed.result.textLog || []));
  const r = await US.host.call('editRead', { seqId: seq.id }), at10 = r.video.flatMap(t => t.clips.map(c => Object.assign({ track: t.name }, c))).filter(c => Math.abs(c.start - 10) < 0.05);
  T.assert(at10.length === 1 && /\.png$/i.test(at10[0].path || '') && ed.result.removed >= 2, 'only the drawn title is at 10 s: ' + JSON.stringify(at10) + ' removed ' + ed.result.removed);
}
else {
notes.push(ed.summary + ' · ' + JSON.stringify(ed.result.text.map(t => [t.words, t.font, t.size, t.colour])) + (ed.result.log.length ? ' · ' + ed.result.log.join('; ') : ''));
T.assert(ed.result.editable && ed.result.textLayers === 2 && ed.result.art && ed.result.text.every(t => t.words), 'two text layers over the drawn rule: ' + JSON.stringify(ed.result));
const seen = [], names = (await US.host.call('editRead', { seqId: seq.id })).video;
for (const t of ed.result.tracks.slice(1)) { const r = await US.host.call('renderRanges', { seqId: seq.id, track: (names.find(x => x.index === t) || {}).name, kinds: 'text' }); for (const x of r.ranges) if (Math.abs(x.start - 10) < 0.05) seen.push(x.name); }
notes.push('text layers read back: ' + JSON.stringify(seen));
T.assert(seen.some(x => /MIRA HADDAD/i.test(x)) && seen.some(x => /NURSE/i.test(x)), 'the words are Premiere’s own text: ' + JSON.stringify(seen));
{
  const box = { x: 0, y: Math.round(H * 0.68), w: Math.round(W * 0.6), h: Math.round(H * 0.28) };
  const stats = d => { let n = 0, sx = 0, sy = 0; for (let y = box.y; y < box.y + box.h; y += 2) for (let x = box.x; x < box.x + box.w; x += 2) { const i = (y * W + x) * 4; if ((d[i] * 2 + d[i + 1] * 3 + d[i + 2]) / 6 > 96) { n++; sx += x; sy += y; } } return { n, x: n ? sx / n / W : 0, y: n ? sy / n / H : 0 }; };
  const shown = stats(await frame(12.4, 'editable'));
  const scene = MO.prepare(ctx, W, H, rule, rv, 4); ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H); MO.draw(ctx, scene, 2.4);
  const mine = stats(ctx.getImageData(0, 0, W, H).data);
  notes.push(`editable title: Premiere shows ${shown.n} bright px centred ${(shown.x * 100).toFixed(1)}%, ${(shown.y * 100).toFixed(1)}% · drawn ${mine.n} centred ${(mine.x * 100).toFixed(1)}%, ${(mine.y * 100).toFixed(1)}%`);
  T.assert(shown.n > mine.n * 0.3, `the text layers show in the picture: ${shown.n} bright against ${mine.n} drawn`);
  T.assert(Math.abs(shown.x - mine.x) < 0.06 && Math.abs(shown.y - mine.y) < 0.06, `where the design puts them: ${JSON.stringify(shown)} against ${JSON.stringify(mine)}`);
}

}   // words as text layers

// a picture dragged out and dropped: Premiere places the file itself; mvfxDropped then finds and dresses it
{
  const painted = await M.paintPNG(P.byId('vignette'), vals('vignette'), W, H, { text: false, t: 1, frame: 0 });
  const file = path.join(path.dirname(painted), `vignette-dropped-e2e${Date.now().toString(36)}.png`); fs.copyFileSync(painted, file);
  T.assert((await US.host.call('mvfxDropped', { path: file })).found === false, 'not on the timeline yet');
  const got = await US.host.call('importFiles', { paths: [file], binPath: BIN });
  await US.host.call('placeClips', { seqId: seq.id, cursor: 20, clips: [{ id: got[0].id, in: 0, out: 2 }] });   // stands in for the drop
  const dr = await US.host.call('mvfxDropped', { path: file, seconds: 4, blend: 'multiply', anim: M.plateAnim(P.byId('vignette'), { width: W, height: H }), name: 'Vignette', binPath: 'JMG Ultra Studio/mVFX' });
  notes.push('dropped: ' + JSON.stringify(dr));
  T.assert(dr.found && Math.abs(dr.start - 20) < 0.05 && Math.abs(dr.end - 24) < 0.1, 'found where it was dropped and made 4 s long: ' + JSON.stringify(dr));
  const bm = await prop(dr.track, 20, 'Opacity', 'Blend Mode', 'return String(pr.getValue());');
  T.assert(String(bm) === '3', 'set to Multiply: ' + bm);
}

// a movement with nothing selected goes on the clip under the playhead (when something is selected, that is used – said in the note)
await US.host.call('setPlayhead', { seqId: seq.id, seconds: 3 });
const sel = await US.host.call('editSelection', { seqId: seq.id });
const mv = await M.apply(P.byId('panleft'), null, { scope: 'selection' }, job);
notes.push('pan left: ' + mv.summary + ` (selected before: ${sel.length})`);
T.assert(mv.result.done >= 1, 'the pan went on a clip: ' + mv.summary);
if (!sel.length) T.assert(/under the playhead/.test(mv.summary), 'and it says it used the clip under the playhead: ' + mv.summary);
const pos = JSON.parse(await prop(0, 0, 'Motion', 'Position', 'var ks=pr.getKeys()||[], o=[]; for (var j=0;j<ks.length;j++) o.push(pr.getValueAtKey(ks[j])); return JSON.stringify(o);') || '[]');
notes.push('pan keys (fractions of the frame): ' + JSON.stringify(pos));
if (pos.length) T.assert(pos.every(k => k[0] > 0.3 && k[0] < 0.7 && Math.abs(k[1] - 0.5) < 0.1), 'the pan stays in the picture: ' + JSON.stringify(pos));
return notes;
