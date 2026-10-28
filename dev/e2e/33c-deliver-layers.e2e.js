// premiere-only
// 1.3.4 in real Premiere: Song Splitter lays numbered, colour-coded layers above the edit; Deliver › Render ranges
// takes them from that track, one colour only, with a file-name ending; ranges are renamed, moved, recoloured and
// deleted from the panel, and the list follows the Timeline by itself. (Resolve: 33d, once it's there.)
const fs = require('fs'), path = require('path'), SS = US.songSplitter, D = US.deliver;
const [c11] = await T.importOnce([T.media('concert', 'C011_concert_long.mp4')], 'Test – Audio');
const sq = await T.freshSequence('E2E Song layers', c11.id, 'Test – E2E');
await US.host.call('placeClips', { seqId: sq.id, cursor: 0, clips: [{ id: c11.id, in: 0, out: c11.duration }] });
await T.open(sq.id);
const target = { kind: 'sequence', id: sq.id, name: 'E2E Song layers', duration: 120, fps: 25 };
const res = await SS.analyse(target, US.jobs.testJob('songs'));
const songs = res.segments.filter(s => s.type === 'song');
T.assert(songs.length === 2, `${songs.length} songs in the first 2 minutes of the concert`);

// 1. Song Splitter: the layers
const o = await SS.output(target, res, { layers: true }, US.jobs.testJob('layers'));
T.assert(/layers? on the “Songs” track/.test(o.summary), 'summary: ' + o.summary);
const want = SS.layerSections(res, 0);
let got = await US.host.call('renderRanges', { seqId: sq.id, track: 'Songs' });
T.assert(got.trackName === 'Songs', 'on a track called Songs: ' + got.trackName);
T.assert(got.ranges.map(r => r.name).join('|') === want.map(w => w.name).join('|'), `named ${got.ranges.map(r => r.name).join('|')} vs ${want.map(w => w.name).join('|')}`);
got.ranges.forEach((r, i) => { T.near(r.start, want[i].start, 0.05, `${r.name} start`); T.near(r.end, want[i].end, 0.05, `${r.name} end`); });
T.assert(want.filter(w => w.type === 'song').map(w => w.name).join(',') === '1,2', 'songs numbered 1, 2');
const coloured = D.layerColours.apply(sq.id, 'Songs', got.ranges);
T.assert(coloured.every((r, i) => r.label === want[i].label), 'each layer’s colour is known: ' + coloured.map(r => r.label).join(','));
const again = await SS.output(target, res, { layers: true }, US.jobs.testJob('layers again'));
T.assert((await US.host.call('renderRanges', { seqId: sq.id, track: 'Songs' })).ranges.length === want.length, 'running again replaces the layers: ' + again.summary);
T.assert((await US.host.call('rangeTracks', { seqId: sq.id })).tracks.some(t => t.name === 'Songs' && t.count === want.length), 'Deliver offers the Songs track');

// 2. Deliver: only the songs' colour, with an ending, rendered
const saved = US.settings.get('deliver.ranges', {});
US.settings.set('deliver.ranges', { preset: '', queueOnly: false, replace: true, track: 'Songs', colour: String(SS.LAYER_LABEL.song), suffix: '_v2' });
let r;
try { r = await T.action('deliver.ranges', {}); } finally { US.settings.set('deliver.ranges', saved); }
const names = r.files.map(f => path.basename(f));
T.assert(names.join('|') === '1_v2.mp4|2_v2.mp4', 'only the songs, with the ending: ' + names.join(', '));
for (let i = 0; i < 2; i++) {
  const v = document.createElement('video'); v.muted = true; v.src = T.fileUrl(r.files[i]);
  await new Promise(ok => { v.onloadedmetadata = ok; v.onerror = ok; setTimeout(ok, 5000); });
  T.near(v.duration, songs[i].end - songs[i].start, 0.2, `song ${i + 1} file is just the song`);
  v.removeAttribute('src');
}

// 3. edited from the panel
got = (await US.host.call('renderRanges', { seqId: sq.id, track: 'Songs' })).ranges;
const one = got.find(x => x.name === '1');
await US.host.call('editRenderRange', { seqId: sq.id, track: 'Songs', nodeId: one.nodeId, name: '1 Opening' });
let now = (await US.host.call('renderRanges', { seqId: sq.id, track: 'Songs' })).ranges.find(x => x.name === '1 Opening');
T.assert(now && Math.abs(now.start - one.start) < 0.05, 'renamed in place');
const moved = await US.host.call('editRenderRange', { seqId: sq.id, track: 'Songs', nodeId: now.nodeId, start: one.start + 2, end: one.end - 3, label: 11 });
D.layerColours.forget(sq.id, 'Songs', now); D.layerColours.remember(sq.id, 'Songs', [Object.assign({}, moved.range, { label: 11 })]);
now = (await US.host.call('renderRanges', { seqId: sq.id, track: 'Songs' })).ranges.find(x => x.name === '1 Opening');
T.near(now.start, one.start + 2, 0.05, 'moved start'); T.near(now.end, one.end - 3, 0.05, 'moved end');
T.assert(D.layerColours.apply(sq.id, 'Songs', [now])[0].label === 11, 'new colour remembered');
const talk = got.find(x => x.name === 'Talk');
if (talk) {
  await US.host.call('removeRenderRange', { seqId: sq.id, track: 'Songs', nodeId: talk.nodeId });
  T.assert(!(await US.host.call('renderRanges', { seqId: sq.id, track: 'Songs' })).ranges.some(x => x.name === 'Talk'), 'deleted');
}

// 4. the screen follows the Timeline by itself (a layer added outside the screen shows within a few seconds)
const keepRo = US.settings.get('deliver.ranges', {});
US.settings.set('deliver.ranges', Object.assign({}, keepRo, { track: 'Songs', colour: '' }));
let listed = '';
try {
  US.tools.open('deliver', { tab: 'ranges' });
  await T.sleep(1500);
  await US.host.call('addRenderRange', { seqId: sq.id, name: 'E2E Encore', start: 110, end: 118, track: 'Songs' });
  for (let i = 0; i < 12 && !/E2E Encore/.test(listed); i++) { await T.sleep(1000); listed = (document.querySelector('.tool:not(.hidden) .ranges-list') || {}).innerText || ''; }
} finally { US.settings.set('deliver.ranges', keepRo); }
T.assert(/E2E Encore/.test(listed), 'the new layer appeared in the list by itself: ' + listed.slice(0, 200));
T.assert(/1 Opening/.test(listed), 'the renamed one is listed');

await US.host.call('removeLabelLayers', { seqId: sq.id, trackName: 'Songs' });
for (const x of (await US.host.call('renderRanges', { seqId: sq.id, track: 'Songs' })).ranges) await US.host.call('removeRenderRange', { seqId: sq.id, track: 'Songs', nodeId: x.nodeId });   // E2E Encore (a render range, not a song layer)
D.layerColours.put(sq.id, 'Songs', []);
for (const f of r.files) { try { fs.unlinkSync(f); } catch (e) { /* gone */ } }
return { layers: want.map(w => w.name).join(' '), files: names, kind: o.summary };
