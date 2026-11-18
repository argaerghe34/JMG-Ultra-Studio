// resolve-only
// Deliver › Render ranges as Text+ titles in real Resolve (Premiere's text layers: 33c): “Add a render range” with
// “Text titles” places a Text+ title showing its name on a “Renders” video track (made on top), without moving the
// edit; the panel renames, moves, recolours and deletes it; each title renders as its own file with the titles' track
// switched off while sending, and on again after. Needs Resolve 21.1.2+ (TimelineItem.SetName / SetPosition /
// SetRightOffset) – where Resolve won't place a title the range comes back as a marker (kind 'marker' + log).
const fs = require('fs'), path = require('path');
const [c1, c9] = await T.importOnce([T.media('concert', 'C001_sharp_static.mp4'), T.media('concert', 'C009_slow_pan_good.mp4')], 'Test – E2E');
const seq = await T.freshSequence('E2E Range titles', c1.id, 'Test – E2E');
await US.host.call('placeClips', { seqId: seq.id, clips: [{ id: c1.id, in: 0, out: 6 }, { id: c9.id, in: 0, out: 6 }] });
await T.open(seq.id);
const layout = () => T.devEval('const t = R.needSeq(' + JSON.stringify(seq.id) + '); const o = []; for (const k of ["video", "audio"]) for (let i = 1; i <= t.GetTrackCount(k); i++) for (const x of R.list(t.GetItemListInTrack(k, i))) if (x.GetMediaPoolItem()) o.push(k + i + ":" + x.GetStart() + "-" + x.GetEnd()); return o.sort().join(",")');
const before = await layout();

const a = await US.host.call('addRenderRange', { seqId: seq.id, name: 'E2E Title Hook', start: 1, end: 3, as: 'text' });
T.assert(a.kind === 'text' && a.placed === 1, 'placed as a Text+ title: ' + JSON.stringify(a));
const b = await US.host.call('addRenderRange', { seqId: seq.id, name: 'E2E Title Teaser', start: 5, end: 9, as: 'text', label: 13 });
T.assert(b.kind === 'text' && b.track === a.track, 'the second on the same Renders track: ' + JSON.stringify(b));
T.assert(await layout() === before, 'the edit underneath didn’t move');
const list = async () => (await US.host.call('renderRanges', { seqId: seq.id, kinds: 'text' })).ranges.sort((x, y) => x.start - y.start);
let got = await list();
T.assert(got.map(r => r.name).join('|') === 'E2E Title Hook|E2E Title Teaser', 'listed by name: ' + JSON.stringify(got));
T.near(got[0].start, 1, 0.05, 'hook starts at 1 s'); T.near(got[0].end, 3, 0.05, 'hook ends at 3 s'); T.near(got[1].end - got[1].start, 4, 0.05, 'teaser is 4 s');
T.assert(got[1].label === 13, 'teaser in the chosen colour: ' + got[1].label);
const words = await T.devEval('const t = R.needSeq(' + JSON.stringify(seq.id) + '); const o = []; for (let i = 1; i <= t.GetTrackCount("video"); i++) for (const x of R.list(t.GetItemListInTrack("video", i))) if (!x.GetMediaPoolItem()) { const c = x.GetFusionCompByIndex(1); const tools = c ? Object.values(c.GetToolList(false, "TextPlus") || {}) : []; o.push(x.GetName() + "=" + (tools[0] ? tools[0].GetInput("StyledText") : "?")); } return o');
T.assert(words.some(w => /E2E Title Hook$/.test(w)), 'the title shows its name: ' + words.join(' · '));

// renamed, moved and recoloured from the panel: the same title
let x = await US.host.call('editRenderRange', { seqId: seq.id, track: 'Renders', nodeId: got[0].nodeId, name: 'E2E Title Opening' });
T.assert(x.range && x.range.name === 'E2E Title Opening' && x.range.nodeId === got[0].nodeId, 'renamed in place: ' + JSON.stringify(x.range));
x = await US.host.call('editRenderRange', { seqId: seq.id, track: 'Renders', nodeId: got[0].nodeId, start: 0.5, end: 2.5, label: 5 });
T.near(x.range.start, 0.5, 0.05, 'moved start'); T.near(x.range.end, 2.5, 0.05, 'moved end');
T.assert(x.range.label === 5 && x.range.nodeId === got[0].nodeId, 'new colour, same title: ' + JSON.stringify(x.range));
T.assert(await layout() === before, 'still nothing under it moved');

// rendered: one file per title, the titles' track off while sending and on again after
const saved = US.settings.get('deliver.ranges', {});
US.settings.set('deliver.ranges', { preset: '', queueOnly: false, replace: true, track: 'Renders', kinds: 'text', hideText: true });
let r;
try { r = await T.action('deliver.ranges', {}); } finally { US.settings.set('deliver.ranges', saved); }
const names = r.files.map(f => path.basename(f));
T.assert(names.join('|') === 'E2E Title Opening.mp4|E2E Title Teaser.mp4', 'files named after the titles: ' + names.join(', '));
async function dur(f) { const v = document.createElement('video'); v.muted = true; v.src = T.fileUrl(f); await new Promise(res => { v.onloadedmetadata = res; v.onerror = res; setTimeout(res, 5000); }); const d = v.duration; v.removeAttribute('src'); v.load(); return d; }
T.near(await dur(r.files[0]), 2, 0.15, 'opening is its 2 s'); T.near(await dur(r.files[1]), 4, 0.15, 'teaser is its 4 s');
T.assert(!(await US.host.call('renderRanges', { seqId: seq.id, kinds: 'text' })).hidden, 'the titles’ track is on again');

got = await list();
await US.host.call('removeRenderRange', { seqId: seq.id, track: 'Renders', nodeId: got[1].nodeId });
T.assert((await list()).length === 1, 'deleted');
for (const f of r.files) { try { fs.unlinkSync(f); } catch (e) { /* gone */ } }
return { kind: a.kind, files: names, log: a.log.concat(b.log) };
