// In Resolve: the moves, flip and opacity work in any version, Punch in every other from the playhead takes the whole
// track; from Resolve 21.1 transitions, speed and volume, from 21.1.2 effects; keyframes are refused plainly.
// Quick effects in real Premiere: three clips in a fresh sequence; then, on every clip: a cross dissolve at the cuts
// (read back from Premiere's Final Cut XML), a punch-in, black & white, half speed, a slow zoom, a sound fade and
// louder sound. Each button's report must match what Premiere did.
const Q = US.quickfx; T.assert(Q, 'Quick effects is loaded');
const fs = require('fs'), os = require('os'), path = require('path');
const BIN = 'Test – Quick effects', NAME = 'Test – Quick effects';
const items = await T.importOnce(['C001_sharp_static.mp4', 'C002_blurry.mp4', 'C003_dark.mp4'].map(f => T.media('concert', f)), BIN);
const seq = await T.freshSequence(NAME, items[0].id, BIN);
await US.host.call('placeClips', { seqId: seq.id, cursor: 0, clips: items.map(it => ({ id: it.id, in: 0, out: 4 })) });
await T.open(seq.id);
const p = id => Q.PRESETS.find(x => x.id === id) || (() => { throw new Error('no preset ' + id); })();
const notes = [];
if (US.app.is('resolve')) {
  const RE = US.resolveEdits, v = (US.premiere && US.premiere.version) || '', read = () => US.host.call('editRead', { seqId: seq.id });
  const refused = async (id, opts = {}) => { try { await Q.apply(p(id), Object.assign({ scope: 'all' }, opts)); return ''; } catch (e) { return e.title || e.message; } };
  notes.push('Resolve ' + v);
  // 1. moves and opacity (every Resolve)
  const r = await Q.apply(p('punch110'), { scope: 'all' }); notes.push('punch110: ' + r.summary);
  T.assert((await read()).video[0].clips.every(c => Math.abs(c.scale - 110) < 0.6), 'every clip at 110% in Resolve: ' + (await read()).video[0].clips.map(c => c.scale));
  const h = await Q.apply(p('half'), { scope: 'all' }); notes.push('half: ' + h.summary);
  await Q.apply(p('reset'), { scope: 'all' });
  // 2. punch in every other from the clip under the playhead (nothing selected): the whole of its track, not 1 clip
  await US.host.call('setPlayhead', { seqId: seq.id, seconds: 1 });
  const a = await Q.apply(p('punchAlt'), { scope: 'selection' }); notes.push('punchAlt: ' + a.summary);
  const sc = (await read()).video[0].clips.map(c => Math.round(c.scale));
  T.assert(sc.join() === '100,110,100', 'every other clip at 110% from the playhead, in Resolve: ' + sc + ' – ' + a.summary);
  await Q.apply(p('reset'), { scope: 'all' });
  // 3. the flip: an Inspector switch, read back as Premiere names it
  const f = await Q.apply(p('flip'), { scope: 'all' }); notes.push('flip: ' + f.summary);
  T.assert((await read()).video[0].clips.every(c => (c.effects || []).includes('Horizontal Flip')), 'every clip flipped: ' + JSON.stringify((await read()).video[0].clips.map(c => c.effects)));
  // 4. never by script: keyframes
  const kf = await refused('zoomIn'); notes.push('zoomIn: ' + kf);
  T.assert(/keyframed zooms/.test(kf), 'a slow zoom is refused plainly: ' + kf);
  if (!RE.atLeast(v, '21.1')) {
    const no = await refused('dissolve'); notes.push('dissolve: ' + no);
    T.assert(/Resolve 21\.1 or later/.test(no), 'transitions need Resolve 21.1, said plainly: ' + no);
    return notes;
  }
  // 5. Resolve 21.1+: a dissolve at the two cuts, sound louder, an effect (21.1.2), then half speed last (it moves what follows)
  const d = await Q.apply(p('dissolve'), { scope: 'all', seconds: 0.5, where: 'cuts' }); notes.push('dissolve: ' + d.summary);
  T.assert(d.result && d.result.done === 2, 'a dissolve at both cuts: ' + d.summary + ' ' + JSON.stringify(d.result && d.result.skipped));
  const l = await Q.apply(p('louder'), { scope: 'all' }); notes.push('louder: ' + l.summary);
  const vol = (await read()).audio[0].clips.map(c => c.volume);
  T.assert(vol.length === 3 && vol.every(x => Math.abs(x - 3) < 0.11), 'the sound 3 dB louder: ' + vol);
  if (RE.atLeast(v, '21.1.2')) {
    const b = await Q.apply(p('blur'), { scope: 'all' }); notes.push('blur: ' + b.summary);
    T.assert((await read()).video[0].clips.every(c => (c.effects || []).includes('Gaussian Blur')), 'Gaussian Blur on every clip: ' + JSON.stringify((await read()).video[0].clips.map(c => c.effects)));
    const bw = await refused('bw'); notes.push('bw: ' + bw);
    T.assert(/Color page/.test(bw), 'Black & White says where Resolve does it: ' + bw);
  }
  const s2 = await Q.apply(p('slow'), { scope: 'all' }); notes.push('slow: ' + s2.summary);
  const after = (await read()).video[0].clips;
  notes.push('after slow: ' + after.map(c => `${c.start}–${c.end} ×${c.speed}`).join(', '));
  T.assert(after.length === 3 && Math.abs(after[0].end - after[0].start - 8) < 0.1, 'half speed: the first clip twice as long: ' + notes[notes.length - 1]);
  return notes;
}
async function hit(id, opts = {}) {
  const r = await Q.apply(p(id), Object.assign({ scope: 'all', seconds: 0.5, where: 'cuts', ends: false }, opts));
  notes.push(`${id}: ${r.summary}`);
  T.assert(r.result && r.result.done > 0, `${id} did something: ${r.summary}`);
  return r;
}
const read = () => US.host.call('editRead', { seqId: seq.id });
async function xmlTransitions() {
  const out = path.join(os.tmpdir(), 'us-e2e-qfx.xml'); try { fs.unlinkSync(out); } catch (e) { /* none */ }
  await US.host.rawEval(`(function(){ var ss=app.project.sequences; for (var i=0;i<ss.numSequences;i++) if (ss[i].sequenceID==${JSON.stringify(seq.id)}) return String(ss[i].exportAsFinalCutProXML(${JSON.stringify(out)}, 1)); })()`, 60000);
  const xml = fs.readFileSync(out, 'utf8');
  return (xml.match(/<transitionitem>[\s\S]*?<\/transitionitem>/g) || []).map(t => ((/<name>([^<]*)<\/name>/.exec(t) || [])[1] || '') + '@' + ((/<start>(-?\d+)<\/start>/.exec(t) || [])[1] || ''));
}
// 1. a dissolve at the two cuts, half a second
await hit('dissolve');
const tr = await xmlTransitions();
notes.push('transitions in Premiere: ' + tr.join(', '));
T.assert(tr.filter(x => /dissolve/i.test(x)).length >= 2, 'a dissolve at both cuts: ' + tr.join(', '));
// 2. punch in on every clip
await hit('punch110');
let info = await read();
const v1 = info.video[0].clips;
T.assert(v1.length === 3 && v1.every(c => c.scale === 110), 'every clip at 110%: ' + v1.map(c => c.scale));
// 2b. punch in every other: back to 100%, then only the middle clip at 110%
await hit('reset');
await hit('punchAlt');
info = await read();
T.assert(info.video[0].clips.map(c => c.scale).join() === '100,110,100', 'every other clip at 110%: ' + info.video[0].clips.map(c => c.scale));
// 2c. a button of your own: punch in 115% (Make your own button), on every clip
const mine = Q.makeOwn({ type: 'punch', value: '115', label: 'Gentle push' }).preset;
const rm = await Q.apply(mine, { scope: 'all' }); notes.push('own 115%: ' + rm.summary);
info = await read();
T.assert(info.video[0].clips.every(c => Math.abs(c.scale - 115) < 0.6), 'your own 115% on every clip: ' + info.video[0].clips.map(c => c.scale));
// 3. black & white
await hit('bw');
info = await read();
T.assert(info.video[0].clips.every(c => (c.effects || []).some(e => /black/i.test(e))), 'Black & White on every clip: ' + JSON.stringify(info.video[0].clips.map(c => c.effects)));
// 4. a slow zoom (keyframed) and sound: a fade at the cuts, louder
await hit('zoomIn');
await hit('audioFade');
await hit('louder');
// 5. half speed last (it moves what follows)
await hit('slow');
info = await read();
notes.push('speeds: ' + info.video[0].clips.map(c => c.speed).join(', '));
T.assert(info.video[0].clips.some(c => Math.abs((c.speed || 1) - 0.5) < 0.01), 'half speed on the clips: ' + info.video[0].clips.map(c => c.speed));
return notes;
