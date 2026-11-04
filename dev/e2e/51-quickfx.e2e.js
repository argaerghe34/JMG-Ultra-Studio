// In Resolve: the moves and opacity work, and the buttons Resolve can't do (transitions, effects, speed) say so plainly
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
  let refused = '';
  try { await Q.apply(p('dissolve'), { scope: 'all', seconds: 0.5, where: 'cuts' }); } catch (e) { refused = e.title || e.message; }
  T.assert(/Resolve doesn’t let add-ons/.test(refused), 'transitions refused plainly: ' + refused);
  const r = await Q.apply(p('punch110'), { scope: 'all' });
  notes.push('punch110: ' + r.summary, 'dissolve: ' + refused);
  const info = await US.host.call('editRead', { seqId: seq.id });
  T.assert(info.video[0].clips.every(c => Math.abs(c.scale - 110) < 0.6), 'every clip at 110% in Resolve: ' + info.video[0].clips.map(c => c.scale));
  const h = await Q.apply(p('half'), { scope: 'all' }); notes.push('half: ' + h.summary);
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
