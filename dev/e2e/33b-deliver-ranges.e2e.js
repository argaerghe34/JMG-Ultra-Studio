// Deliver › Render ranges: two ranges sent to the renderer one after the other, each file named after its range and
// holding only its own part of the sequence; your In/Out stay put. Premiere: adjustment layers on a “Renders” track
// above the edit, Media Encoder. Resolve: range markers (no adjustment clips by script), the Render Queue.
const fs = require('fs'), path = require('path'), isR = US.app.is('resolve');
const [c1, c9] = await T.importOnce([T.media('concert', 'C001_sharp_static.mp4'), T.media('concert', 'C009_slow_pan_good.mp4')], 'Test – E2E');
const seq = await T.freshSequence('E2E Ranges', c1.id, 'Test – E2E');
await US.host.call('placeClips', { seqId: seq.id, clips: [{ id: c1.id, in: 0, out: 6 }, { id: c9.id, in: 0, out: 6 }] });
await T.open(seq.id);
const a = await US.host.call('addRenderRange', { seqId: seq.id, name: 'E2E Range Hook', start: 1, end: 3 });
const b = await US.host.call('addRenderRange', { seqId: seq.id, name: 'E2E Range Teaser', start: 5, end: 9 });
T.assert(a.placed === 1 && b.placed === 1 && (isR || (a.track === b.track && a.named)), 'both ranges placed (on one track named Renders in Premiere): ' + JSON.stringify([a, b]));
const found = await US.host.call('renderRanges', { seqId: seq.id });
T.assert(isR || found.trackName === 'Renders', 'found on the Renders track: ' + found.trackName);
T.assert(found.ranges.map(r => r.name).join('|') === 'E2E Range Hook|E2E Range Teaser', 'ranges listed by name: ' + JSON.stringify(found));
T.near(found.ranges[1].end - found.ranges[1].start, 4, 0.05, 'teaser range is 4 s');
// your own In/Out (here 0.5–7 s) must come back exactly after the renders are queued
// (Premiere only: Resolve renders a range with the render's own Mark In/Out and never touches the timeline's)
if (!isR) T.assert(await US.host.rawEval(`(function(){ var s=UStudio.needSeq(${JSON.stringify(seq.id)}); s.setOutPoint(7); s.setInPoint(0.5); s.setOutPoint(7); return 'ok'; })()`) === 'ok', 'In/Out set');
const before = await US.host.call('sequenceInfo', { seqId: seq.id, clips: false });
if (!isR) { T.near(before.inPoint, 0.5, 0.05, 'In set to 0.5 s'); T.near(before.outPoint, 7, 0.05, 'Out set to 7 s'); }

const saved = US.settings.get('deliver.ranges', {});
US.settings.set('deliver.ranges', { preset: '', queueOnly: false, replace: false });
let r;
try { r = await T.action('deliver.ranges', {}); } finally { US.settings.set('deliver.ranges', saved); }
T.assert(r.files && r.files.length === 2, 'two renders: ' + r.summary);
const names = r.files.map(f => path.basename(f));
T.assert(/^E2E Range Hook( \(\d+\))?\.mp4$/.test(names[0]) && /^E2E Range Teaser( \(\d+\))?\.mp4$/.test(names[1]), 'files named after the layers: ' + names.join(', '));
async function dims(f) { const v = document.createElement('video'); v.muted = true; v.src = T.fileUrl(f); await new Promise(res => { v.onloadedmetadata = res; v.onerror = res; setTimeout(res, 5000); }); const d = [v.videoWidth, v.videoHeight, v.duration]; v.removeAttribute('src'); v.load(); return d; }
const h = await dims(r.files[0]), t = await dims(r.files[1]);
T.assert(fs.existsSync(r.files[0]) && h[0] === 1920, 'hook rendered at the sequence size, got ' + h);
T.near(h[2], 2, 0.15, 'hook is only its 2 s');
T.near(t[2], 4, 0.15, 'teaser is only its 4 s (across the cut)');
const after = await US.host.call('sequenceInfo', { seqId: seq.id, clips: false });
if (!isR || before.inPoint != null) { T.near(after.inPoint || 0, before.inPoint || 0, 0.01, 'In point put back'); T.near(after.outPoint || 0, before.outPoint || 0, 0.01, 'Out point put back'); }
return { files: names, lengths: [h[2], t[2]].map(x => x.toFixed(2)), kind: a.kind };
