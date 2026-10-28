// resolve/host/core.js against the stand-in Resolve (dev/tests/resolve-fake.js): every core command, and the tricky
// ones properly – markers where/remove, placeClips tracks and record frames, extractRanges geometry, names, subclips.
'use strict';
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path');
const { test } = require('./harness');
const Fake = require('./resolve-fake');
const HOST = require('../../resolve/host');

const NAMES = ['ping', 'context', 'listBins', 'listSequences', 'selectionSummary', 'selectionList', 'binList', 'selectedItems', 'binSummary', 'binItems', 'itemInfo', 'itemsInfo', 'sequenceInfo', 'openSequence', 'setPlayhead', 'showInSource', 'revealItem', 'ensureBin', 'moveItems', 'setLabels', 'renameItem', 'addClipMarkers', 'addSequenceMarkers', 'removeClipMarkers', 'removeSequenceMarkers', 'clipMarkers', 'createSubclips', 'newSequence', 'placeClips', 'cloneSequence', 'extractRanges', 'muteTrack', 'setClipsDisabled', 'importFiles', 'sampleItems', 'deleteSequence', 'saveProject', 'audioClipRange', 'clipRanges'];

function setup(opts) {
  const F = Fake.make(opts);
  const host = HOST.connect({ api: F.resolve });
  const run = async (name, args) => { const r = await host.run(name, args); if (!r.ok) throw Object.assign(new Error(`${name}: ${r.error.code} ${r.error.detail}`), { res: r }); return r.data; };
  const fail = async (name, args) => { const r = await host.run(name, args); assert.ok(!r.ok, name + ' should fail'); return r.error; };
  return { F, host, run, fail };
}
const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-6, `${msg || ''} ${a} ≠ ${b}`);
/** [start, end, srcStart] of every item on a track, in frames from the timeline's start */
const geo = (tl, type, t) => tl.GetItemListInTrack(type, t).map(i => [i._start - tl._start, i._end - tl._start, i._srcStart]);

test('resolve core: every command is there', () => {
  const { host } = setup();
  for (const n of NAMES) assert.strictEqual(typeof host.fns[n], 'function', n);
});

test('resolve core: ping and context (project path stable and unique, timeline, playhead, selection)', async () => {
  const { F, run } = setup({ projectName: 'Wedding' });
  const p = await run('ping');
  assert.strictEqual(p.version, '20.3.1'); assert.strictEqual(p.project, true); assert.ok(/Resolve/.test(p.app));
  let c = await run('context');
  assert.strictEqual(c.project.name, 'Wedding');
  assert.ok(path.isAbsolute(c.project.path) && /Wedding \[project1\]\.drp$/.test(c.project.path), c.project.path);
  assert.ok(c.project.path.includes('Disk Local Database'));
  assert.strictEqual((await run('context')).project.path, c.project.path, 'stable between polls');
  assert.strictEqual(c.sequence, null);
  // same name, another project (other id) → another path
  const G = setup({ projectName: 'Wedding' }); G.F.project.GetUniqueId = () => 'b7c1-99aa-0000';
  assert.notStrictEqual((await G.run('context')).project.path, c.project.path);
  const clip = F.addMedia('/m/A.mp4', { frames: 500 });
  F.addTimeline('Cut', [{ item: clip, in: 0, out: 250 }]);
  F.selected = [clip];
  c = await run('context');
  assert.strictEqual(c.sequence.name, 'Cut'); near(c.sequence.duration, 10); assert.strictEqual(c.sequence.fps, 25);
  assert.strictEqual(c.sequence.width, 1920); near(c.sequence.playhead, 0); assert.strictEqual(c.selection, 1);
  await run('setPlayhead', { seqId: c.sequence.id, seconds: 3.2 });
  near((await run('context')).sequence.playhead, 3.2);
  F.noProject = true;
  c = await run('context');
  assert.strictEqual(c.project, null); assert.strictEqual(c.selection, 0);
  assert.strictEqual((await run('ping')).project, false);
});

test('resolve core: bins, timelines, selection kinds and skips', async () => {
  const { F, run } = setup();
  const v = F.addMedia('/m/V.mp4', { bin: 'Rushes' });
  const au = F.addMedia('/m/Music.wav', { type: 'Audio', audioCh: 2, bin: 'Rushes/Sound' });
  const st = F.addMedia('/m/Logo.png', { type: 'Still', audioCh: 0, frames: 1, bin: 'Rushes' });
  const silent = F.addMedia('/m/Silent.mov', { type: 'Video', audioCh: 0, bin: 'Rushes' });
  const tl = F.addTimeline('Edit', [{ item: v, in: 0, out: 100 }]);
  const bins = await run('listBins');
  assert.deepStrictEqual(bins.map(b => b.path), ['(Project root)', 'Rushes', 'Rushes / Sound']);
  assert.deepStrictEqual(await run('listSequences'), [{ id: tl.GetUniqueId(), name: 'Edit' }]);

  F.selected = [v, au, st, silent, tl.GetMediaPoolItem()];
  assert.deepStrictEqual(await run('selectionSummary', { kinds: ['video'] }), { count: 2, skipped: 3, skippedWhy: 'not the right kind of clip' });
  assert.strictEqual((await run('selectionSummary', {})).count, 5);
  const list = await run('selectionList', { kinds: ['audio'] });
  assert.deepStrictEqual(list.map(x => [x.name, x.kind]), [['V.mp4', 'video'], ['Music.wav', 'audio'], ['Silent.mov', 'video']]);
  // the full details know Silent.mov has no sound, so selectedItems leaves it out
  const items = await run('selectedItems', { kinds: ['audio'] });
  assert.deepStrictEqual(items.map(x => x.name), ['V.mp4', 'Music.wav']);
  assert.strictEqual(items[1].bin, 'Rushes / Sound');
  assert.deepStrictEqual((await run('selectedItems', { kinds: ['sequence'] })).map(x => x.name), ['Edit']);

  const rushes = bins[1].id;
  assert.deepStrictEqual((await run('binList', { binId: rushes })).map(x => x.name), ['V.mp4', 'Logo.png', 'Silent.mov', 'Music.wav']);
  assert.deepStrictEqual((await run('binList', { binId: rushes, recursive: false })).map(x => x.name), ['V.mp4', 'Logo.png', 'Silent.mov']);
  assert.deepStrictEqual(await run('binSummary', { binId: rushes, kinds: ['still'] }), { count: 1, skipped: 3, sub: true });
  assert.deepStrictEqual((await run('binItems', { binId: rushes, kinds: ['video'] })).map(x => x.name), ['V.mp4', 'Silent.mov']);
  assert.deepStrictEqual((await run('binItems', { binId: rushes, kinds: ['audio'], recursive: true })).map(x => x.name), ['V.mp4', 'Music.wav']);
  assert.strictEqual((await run('binSummary', { binId: bins[0].id })).count, 5, 'root counts the timeline too');
  assert.strictEqual((await run('binList', { binId: 'nope' }).catch(e => e.res.error.code)), 'NOT_FOUND');
});

test('resolve core: itemInfo, itemsInfo, sampleItems, clipRanges, audioClipRange', async () => {
  const { F, run } = setup();
  const v = F.addMedia('/m/V.mp4', { frames: 1000, fps: 25, width: 3840, height: 2160 });
  F.addTimeline('Edit', [{ item: v, in: 0, out: 100 }]);
  const i = await run('itemInfo', { id: v.GetUniqueId(), columns: true });
  assert.strictEqual(i.kind, 'video'); assert.strictEqual(i.width, 3840); near(i.duration, 40); assert.strictEqual(i.subclip, false);
  assert.strictEqual(i.columns['Clip Name'], 'V.mp4');
  const many = await run('itemsInfo', { ids: [v.GetUniqueId(), 'gone'] });
  assert.strictEqual(many[0].name, 'V.mp4'); assert.strictEqual(many[1], null);
  assert.deepStrictEqual((await run('sampleItems', {})).map(x => x.name), ['V.mp4'], 'no timelines');
  assert.deepStrictEqual(await run('clipRanges', { ids: [v.GetUniqueId(), 'x'] }), [{ id: v.GetUniqueId(), start: 0, end: 40, subclip: false }, null]);
  let r = await run('audioClipRange', { id: v.GetUniqueId() });
  assert.deepStrictEqual([r.in, r.out, r.duration, r.subclip], [0, 40, 40, false]);
  v.SetMarkInOut(50, 99);
  r = await run('audioClipRange', { id: v.GetUniqueId() });
  near(r.in, 2); near(r.out, 4);
});

test('resolve core: labels, names, bins, moving, reveal', async () => {
  const { F, run } = setup();
  const v = F.addMedia('/m/V.mp4'), w = F.addMedia('/m/W.mp4');
  const id = await run('ensureBin', { path: 'JMG Ultra Studio/Selects' });
  assert.strictEqual(await run('ensureBin', { path: 'JMG Ultra Studio/Selects' }), id, 'made once');
  assert.strictEqual(await run('moveItems', { ids: [v.GetUniqueId(), 'gone'], binPath: 'JMG Ultra Studio/Selects' }), id);
  assert.strictEqual((await run('itemInfo', { id: v.GetUniqueId() })).bin, 'JMG Ultra Studio / Selects');
  await run('moveItems', { ids: [w.GetUniqueId()], binId: id });
  assert.strictEqual(F.bin('JMG Ultra Studio/Selects')._clips.length, 2);
  assert.strictEqual(await run('setLabels', { items: [{ id: v.GetUniqueId(), label: 13 }, { id: w.GetUniqueId(), label: 7 }, { id: 'gone', label: 1 }] }), 2);
  assert.strictEqual(v.GetClipColor(), 'Green'); assert.strictEqual(w.GetClipColor(), 'Orange');
  assert.strictEqual((await run('itemInfo', { id: v.GetUniqueId() })).label, 13);
  await run('renameItem', { id: v.GetUniqueId(), name: 'Best take' });
  assert.strictEqual(v.GetName(), 'Best take');
  assert.strictEqual(await run('showInSource', { id: w.GetUniqueId(), seconds: 3 }), true);
  assert.deepStrictEqual(F.selected, [w]);
  assert.strictEqual(await run('revealItem', { id: v.GetUniqueId() }), true);
  assert.deepStrictEqual(F.selected, [v]);
});

test('resolve core: clip markers (media time, subclips count from their own start)', async () => {
  const { F, run } = setup();
  const v = F.addMedia('/m/V.mp4', { frames: 1000 });
  const g = await run('addClipMarkers', { id: v.GetUniqueId(), markers: [{ start: 2, end: 3, name: 'Good', comment: 'smile', color: 6 }, { start: 2, name: 'clash' }] });
  assert.strictEqual(g.length, 2);
  assert.deepStrictEqual(Object.keys(v._markers).map(Number), [50, 51], 'one marker per frame: the second moves on');
  assert.deepStrictEqual(v._markers[50], { color: 'Blue', name: 'Good', note: 'smile', duration: 25, customData: g[0] });
  const ms = await run('clipMarkers', { id: v.GetUniqueId() });
  assert.deepStrictEqual(ms[0], { guid: g[0], start: 2, end: 3, name: 'Good', comment: 'smile', color: 6 });
  assert.strictEqual(await run('removeClipMarkers', { id: v.GetUniqueId(), guids: [g[0]] }), 1);
  assert.strictEqual(Object.keys(v._markers).length, 1);
  // a subclip of 10–20 s: a marker at 12 s of media is 2 s into the subclip
  const [sid] = await run('createSubclips', { binPath: 'Subs', items: [{ id: v.GetUniqueId(), start: 10, end: 20, name: 'Sub' }] });
  await run('addClipMarkers', { id: sid, markers: [{ start: 12, name: 'in sub' }] });
  const sub = F.bin('Subs')._clips[0];
  assert.deepStrictEqual(Object.keys(sub._markers).map(Number), [50]);
  near((await run('clipMarkers', { id: sid }))[0].start, 12);
});

test('resolve core: subclips (bin, names, labels, ranges; timelines give null)', async () => {
  const { F, run } = setup();
  const v = F.addMedia('/m/Concert.mp4', { frames: 25 * 600 });
  const tl = F.addTimeline('T', []);
  const ids = await run('createSubclips', { binPath: 'JMG Ultra Studio/Song Splitter/Concert', items: [
    { id: v.GetUniqueId(), start: 30, end: 245.5, name: 'Song 1', label: 15 },
    { id: v.GetUniqueId(), start: 300, end: 420, name: 'Song 2' },
    { id: tl.GetMediaPoolItem().GetUniqueId(), start: 0, end: 1, name: 'no file' }] });
  assert.strictEqual(ids.length, 3); assert.strictEqual(ids[2], null);
  const bin = F.bin('JMG Ultra Studio/Song Splitter/Concert');
  assert.deepStrictEqual(bin._clips.map(c => [c.GetName(), c._start, c._end, c.GetClipColor()]), [['Song 1', 750, 6137, 'Yellow'], ['Song 2', 7500, 10499, '']]);
  assert.strictEqual(F.pool.GetCurrentFolder(), F.root, 'current folder put back');
  const info = await run('itemInfo', { id: ids[0] });
  assert.strictEqual(info.subclip, true); near(info.rangeStart, 30); near(info.rangeEnd, 245.52);
  const r = await run('clipRanges', { ids: [ids[1]] });
  assert.deepStrictEqual([r[0].start, r[0].end, r[0].subclip], [300, 420, true]);
  const a = await run('audioClipRange', { id: ids[1] });
  assert.deepStrictEqual([a.in, a.out, a.subclip], [300, 420, true]);
});

/** V1: A 0–10 s (from 5 s into A), B 10–20 s at double speed; V2: B 4–6 s, disabled; A1: music 0–30 s */
function markerTimeline() {
  const S = setup();
  const { F } = S;
  const A = F.addMedia('/m/A.mp4', { frames: 2500 }), B = F.addMedia('/m/B.mp4', { frames: 2500 }), M = F.addMedia('/m/Music.wav', { type: 'Audio', frames: 2500 });
  const tl = F.addTimeline('Cut', [
    { item: A, in: 125, out: 375, at: 0, mediaType: 1 },
    { item: B, in: 0, out: 250, at: 250, mediaType: 1 },
    { item: B, in: 1250, out: 1300, at: 100, track: 2, mediaType: 1 },
    { item: M, in: 0, out: 750, at: 0 }]);
  const [, b] = tl.GetItemListInTrack('video', 1);
  b.GetSourceEndFrame = () => 500; // 250 frames on the timeline show 500 of B: double speed
  tl.GetItemListInTrack('video', 2)[0].SetClipEnabled(false);
  return Object.assign(S, { A, B, M, tl, seqId: tl.GetUniqueId() });
}

test('resolve core: sequence markers “Timeline” (the default) stay on the timeline', async () => {
  const { run, tl, A, seqId } = markerTimeline();
  const g = await run('addSequenceMarkers', { seqId, markers: [{ start: 2, end: 3, name: 'one', color: 1 }] });
  assert.deepStrictEqual(tl._markers, { 50: { color: 'Red', name: 'one', note: '', duration: 25, customData: g[0] } });
  assert.strictEqual(Object.keys(A._markers).length, 0);
  assert.ok(!g[0].startsWith('clip:'));
  const info = await run('sequenceInfo', { seqId });
  assert.deepStrictEqual(info.markers, [{ guid: g[0], start: 2, end: 3, name: 'one', comment: '', color: 1 }]);
  assert.strictEqual(await run('removeSequenceMarkers', { seqId, guids: g }), 1);
  assert.deepStrictEqual(tl._markers, {});
});

test('resolve core: sequence markers “Clips” go on the clip under them, at its own time and length', async () => {
  const { run, tl, A, B, M, seqId } = markerTimeline();
  const g = await run('addSequenceMarkers', { seqId, where: 'clips', markers: [
    { start: 2, end: 4, name: 'in A', color: 3 },   // A starts 5 s into its media: 7–9 s of A
    { start: 5, name: 'under a disabled clip' },    // V2's B is disabled, so A (V1) at 10 s
    { start: 12, end: 14, name: 'in B fast' },      // B at double speed: 4 s into B, 4 s long
    { start: 25, name: 'music only' }] });          // no video: the music clip
  assert.deepStrictEqual(tl._markers, {}, 'nothing on the timeline');
  assert.deepStrictEqual(Object.entries(A._markers).map(([f, m]) => [Number(f), m.duration, m.name, m.color]), [[175, 50, 'in A', 'Sand'], [250, 1, 'under a disabled clip', 'Green']]);
  assert.deepStrictEqual(Object.entries(B._markers).map(([f, m]) => [Number(f), m.duration]), [[100, 100]]);
  assert.deepStrictEqual(Object.keys(M._markers).map(Number), [625]);
  assert.ok(g.every(x => /^clip:clip-[0-9a-f]+:us-[0-9a-f]+$/.test(x)), g.join());
  assert.strictEqual(g[0].split(':')[1], A.GetUniqueId());
  assert.strictEqual(await run('removeSequenceMarkers', { seqId, guids: g }), 4);
  assert.strictEqual(Object.keys(A._markers).length + Object.keys(B._markers).length + Object.keys(M._markers).length, 0);
});

test('resolve core: “Clips” keeps a marker with no clip under it on the timeline; “Both” puts it in both places', async () => {
  const { run, tl, A, seqId } = markerTimeline();
  const g = await run('addSequenceMarkers', { seqId, where: 'clips', markers: [{ start: 40, name: 'past the end' }] });
  assert.deepStrictEqual(Object.keys(tl._markers).map(Number), [1000]);
  assert.ok(!g[0].startsWith('clip:'));
  const g2 = await run('addSequenceMarkers', { seqId, where: 'both', markers: [{ start: 1, name: 'both' }] });
  assert.strictEqual(g2.length, 2);
  assert.deepStrictEqual(Object.keys(A._markers).map(Number), [150]);
  assert.strictEqual(Object.keys(tl._markers).length, 2);
  assert.strictEqual(await run('removeSequenceMarkers', { seqId, guids: g.concat(g2) }), 3);
  assert.strictEqual(Object.keys(tl._markers).length + Object.keys(A._markers).length, 0);
});

test('resolve core: sequenceInfo (tracks, clips, speed, disabled, mute/lock, In/Out)', async () => {
  const { run, tl, A, F, seqId } = markerTimeline();
  tl.SetTrackEnable('audio', 1, false); tl.SetTrackLock('video', 2, true);
  tl.SetMarkInOut(25, 49);
  const i = await run('sequenceInfo', { seqId });
  assert.strictEqual(i.name, 'Cut'); assert.strictEqual(i.fps, 25); near(i.frame, 0.04); near(i.duration, 30);
  assert.strictEqual(i.itemId, tl.GetMediaPoolItem().GetUniqueId());
  near(i.inPoint, 1); near(i.outPoint, 2);
  assert.deepStrictEqual(i.video.map(t => [t.index, t.name, t.muted, t.locked, t.clips.length]), [[0, 'Video 1', false, false, 2], [1, 'Video 2', false, true, 1]]);
  assert.deepStrictEqual(i.audio.map(t => [t.index, t.muted]), [[0, true]]);
  const [a, b] = i.video[0].clips;
  assert.deepStrictEqual([a.name, a.start, a.end, a.in, a.out, a.disabled, a.speed, a.path, a.itemId], ['A.mp4', 0, 10, 5, 15, false, 1, '/m/A.mp4', A.GetUniqueId()]);
  assert.strictEqual(a.offline, true, 'the fake media is not on disk');
  assert.strictEqual(b.speed, 2);
  assert.strictEqual(i.video[1].clips[0].disabled, true);
  assert.strictEqual(i.video[0].clips[0].nodeId, tl.GetItemListInTrack('video', 1)[0].GetUniqueId());
  const bare = await run('sequenceInfo', { seqId, clips: false });
  assert.strictEqual(bare.video[0].clips.length, 0);
  assert.strictEqual(F.log.filter(x => x[0] === 'SetCurrentTimeline').length, 0, 'reading does not switch timelines');
  assert.strictEqual((await run('sequenceInfo', {})).id, seqId, 'no id: the current timeline');
});

test('resolve core: openSequence, setPlayhead (drop frame), muteTrack, setClipsDisabled', async () => {
  const { F, run } = setup();
  const v = F.addMedia('/m/V.mp4', { frames: 5000 });
  const one = F.addTimeline('One', [{ item: v, in: 0, out: 100 }]), two = F.addTimeline('Two', [{ item: v, in: 0, out: 100 }, { item: v, in: 200, out: 300 }]);
  F.resolve.OpenPage('media');
  await run('openSequence', { seqId: one.GetUniqueId() });
  assert.strictEqual(F.currentTimeline, one); assert.strictEqual(F.resolve.GetCurrentPage(), 'edit');
  // drop-frame: a 29.97 DF timeline, 10 minutes in (the timecode carries ";")
  let tc = null; two.SetCurrentTimecode = x => { tc = x; return true; };
  two.SetSetting('timelineFrameRate', '29.97'); two.SetSetting('timelineDropFrameTimecode', '1');
  await run('setPlayhead', { seqId: two.GetUniqueId(), seconds: 600 });
  assert.strictEqual(F.currentTimeline, two);
  assert.strictEqual(tc, require('../../resolve/host/base').framesToTC(86400 + Math.round(600 * 29.97), 29.97, true));
  assert.ok(tc.includes(';'));
  assert.strictEqual(await run('muteTrack', { seqId: two.GetUniqueId(), video: true, index: 0, mute: true }), true);
  assert.strictEqual(two.GetIsTrackEnabled('video', 1), false);
  await run('muteTrack', { seqId: two.GetUniqueId(), index: 0, mute: true });
  assert.strictEqual(two.GetIsTrackEnabled('audio', 1), false);
  await run('muteTrack', { seqId: two.GetUniqueId(), video: true, index: 0, mute: false });
  assert.strictEqual(two.GetIsTrackEnabled('video', 1), true);
  assert.strictEqual((await run('muteTrack', { seqId: two.GetUniqueId(), video: true, index: 4, mute: true }).catch(e => e.res.error.code)), 'NOT_FOUND');
  assert.strictEqual(await run('setClipsDisabled', { seqId: two.GetUniqueId(), video: true, index: 0, disabled: true }), 2);
  assert.ok(two.GetItemListInTrack('video', 1).every(i => !i.GetClipEnabled()));
  assert.ok(two.GetItemListInTrack('audio', 1).every(i => i.GetClipEnabled()));
});

test('resolve core: newSequence (unique name, bin, the clip’s size and rate when they differ)', async () => {
  const { F, run } = setup();
  const uhd = F.addMedia('/m/UHD.mov', { width: 3840, height: 2160, fps: 50 });
  const hd = F.addMedia('/m/HD.mov');
  const wav = F.addMedia('/m/Song.wav', { type: 'Audio' });
  F.addTimeline('Beat Cut', []);
  const s = await run('newSequence', { name: 'Beat Cut', binPath: 'JMG Ultra Studio/Beat Cut', likeId: uhd.GetUniqueId() });
  assert.strictEqual(s.name, 'Beat Cut 2');
  const tl = F.timelines.find(t => t.GetUniqueId() === s.id);
  assert.ok(F.bin('JMG Ultra Studio/Beat Cut')._clips.includes(tl._mpi), 'in the bin');
  assert.strictEqual(F.pool.GetCurrentFolder(), F.root);
  assert.deepStrictEqual(tl._settings, { useCustomSettings: '1', timelineFrameRate: '50', timelineResolutionWidth: '3840', timelineResolutionHeight: '2160' });
  assert.strictEqual(tl.GetItemListInTrack('video', 1).length, 0, 'empty');
  const s2 = await run('newSequence', { name: 'Story', likeId: hd.GetUniqueId() });
  assert.deepStrictEqual(F.timelines.find(t => t.GetUniqueId() === s2.id)._settings, {}, 'same as the project: no custom settings');
  assert.ok(F.bin('JMG Ultra Studio')._clips.length >= 1);
  const s3 = await run('newSequence', { name: 'Song', binPath: 'X', likeId: wav.GetUniqueId() });
  assert.deepStrictEqual(F.timelines.find(t => t.GetUniqueId() === s3.id)._settings, {});
  const ctx = await run('sequenceInfo', { seqId: s.id });
  assert.strictEqual(ctx.fps, 50); assert.strictEqual(ctx.width, 3840);
});

test('resolve core: placeClips (cursor, at, tracks made, record frames, audio only, split tracks linked)', async () => {
  const { F, run } = setup();
  const v = F.addMedia('/m/V.mp4', { frames: 5000 }), m = F.addMedia('/m/M.wav', { type: 'Audio', frames: 5000 });
  const st = F.addMedia('/m/Logo.png', { type: 'Still', audioCh: 0, frames: 1 });
  const seq = await run('newSequence', { name: 'Beat', likeId: v.GetUniqueId() });
  const tl = F.timelines.find(t => t.GetUniqueId() === seq.id);
  F.pool.CreateEmptyTimeline('Elsewhere'); // the current timeline is another one: placeClips must open its own
  let r = await run('placeClips', { seqId: seq.id, clips: [{ id: v.GetUniqueId(), in: 2, out: 4 }, { id: v.GetUniqueId(), in: 10, out: 11.6 }] });
  assert.strictEqual(F.currentTimeline, tl);
  assert.deepStrictEqual(r, { cursor: 3.6, placed: [{ start: 0, end: 2 }, { start: 2, end: 3.6 }], end: 3.6 });
  assert.deepStrictEqual(geo(tl, 'video', 1), [[0, 50, 50], [50, 90, 250]]);
  assert.deepStrictEqual(geo(tl, 'audio', 1), [[0, 50, 50], [50, 90, 250]]);
  // cursor given; at given (does not move the cursor); higher tracks made as needed
  r = await run('placeClips', { seqId: seq.id, cursor: 10, clips: [{ id: v.GetUniqueId(), in: 0, out: 1, v: 2, a: 2 }, { id: st.GetUniqueId(), in: 0, out: 2, at: 1, v: 1 }, { id: v.GetUniqueId(), in: 0, out: 1 }] });
  assert.deepStrictEqual(r.placed, [{ start: 10, end: 11 }, { start: 1, end: 3 }, { start: 11, end: 12 }]);
  near(r.cursor, 12);
  assert.strictEqual(tl.GetTrackCount('video'), 3); assert.strictEqual(tl.GetTrackCount('audio'), 3);
  assert.deepStrictEqual(geo(tl, 'video', 3), [[250, 275, 0]]);
  assert.deepStrictEqual(geo(tl, 'video', 2), [[25, 75, 0]], 'a still lasts as long as asked');
  assert.strictEqual(tl.GetItemListInTrack('audio', 2).length, 0, 'a still has no sound');
  // music: audio only on A2 at 0, Beat Cut's call
  const before = tl.GetItemListInTrack('video', 1).length;
  r = await run('placeClips', { seqId: seq.id, clips: [{ id: m.GetUniqueId(), in: 1, out: 5, at: 0, a: 1, video: false }] });
  assert.deepStrictEqual(geo(tl, 'audio', 2), [[0, 100, 25]]);
  assert.strictEqual(tl.GetItemListInTrack('video', 1).length, before);
  // a video clip without its sound
  await run('placeClips', { seqId: seq.id, clips: [{ id: v.GetUniqueId(), in: 0, out: 1, at: 20, audio: false }] });
  assert.deepStrictEqual(geo(tl, 'video', 1).pop(), [500, 525, 0]);
  assert.ok(!geo(tl, 'audio', 1).some(g => g[0] === 500));
  // picture on V1 and sound on A3: two appends, linked back together
  const linked = []; tl.SetClipsLinked = (items, on) => { linked.push([items.length, on]); return true; };
  r = await run('placeClips', { seqId: seq.id, clips: [{ id: v.GetUniqueId(), in: 0, out: 1, at: 30, v: 0, a: 2 }] });
  assert.deepStrictEqual(geo(tl, 'video', 1).pop(), [750, 775, 0]);
  assert.deepStrictEqual(geo(tl, 'audio', 3).pop(), [750, 775, 0]);
  assert.deepStrictEqual(linked, [[2, true]]);
  assert.strictEqual((await run('placeClips', { seqId: seq.id, clips: [{ id: 'gone', in: 0, out: 1 }] }).catch(e => e.res.error.code)), 'NOT_FOUND');
});

test('resolve core: cloneSequence (unique name, bin, same contents) and deleteSequence, saveProject', async () => {
  const { F, run } = setup();
  const v = F.addMedia('/m/V.mp4', { frames: 5000 });
  const tl = F.addTimeline('Interview', [{ item: v, in: 0, out: 500 }]);
  tl.AddMarker(10, 'Blue', 'keep', '', 1, 'us-1');
  F.pool.CreateEmptyTimeline('Interview – pauses cut');
  const c = await run('cloneSequence', { seqId: tl.GetUniqueId(), name: 'Interview – pauses cut', binPath: 'JMG Ultra Studio/Silence Cut' });
  assert.strictEqual(c.name, 'Interview – pauses cut 2');
  const copy = F.timelines.find(t => t.GetUniqueId() === c.id);
  assert.notStrictEqual(c.id, tl.GetUniqueId());
  assert.deepStrictEqual(geo(copy, 'video', 1), geo(tl, 'video', 1));
  assert.ok(F.bin('JMG Ultra Studio/Silence Cut')._clips.includes(copy._mpi));
  assert.strictEqual(copy._markers[10].customData, 'us-1');
  const c2 = await run('cloneSequence', { seqId: tl.GetUniqueId() });
  assert.strictEqual(c2.name, 'Interview copy');
  assert.strictEqual(await run('deleteSequence', { seqId: c2.id }), true);
  assert.ok(!F.timelines.some(t => t.GetUniqueId() === c2.id));
  assert.strictEqual(await run('saveProject'), true); assert.strictEqual(F.saved, 1);
});

/**
 * Interview timeline, 25 fps, 0–40 s:
 *   V1: A 0–20 s (media 0–20), A 20–40 s (media 100–120)   A1/A2-linked sound under the same
 *   V2: B overlay 8–12 s (media 50–54), disabled, coloured, zoomed, with an item marker at its 3rd second
 *   A2: music 0–40 s (media 0–40)
 * Timeline markers at 1 s, 5.5 s (inside a cut), 15 s (2 s long, across the second cut), 30 s.
 */
function interview() {
  const S = setup();
  const { F } = S;
  const A = F.addMedia('/m/A.mp4', { frames: 25 * 300 }), B = F.addMedia('/m/B.mp4', { frames: 25 * 300 }), M = F.addMedia('/m/M.wav', { type: 'Audio', frames: 25 * 300 });
  const tl = F.addTimeline('Interview', [
    { item: A, in: 0, out: 500, at: 0 }, { item: A, in: 2500, out: 3000, at: 500 },
    { item: B, in: 1250, out: 1350, at: 200, track: 2, mediaType: 1 },
    { item: M, in: 0, out: 1000, at: 0, track: 2 }]);
  const b = tl.GetItemListInTrack('video', 2)[0];
  b.SetClipEnabled(false); b.SetClipColor('Orange'); b.SetProperty('ZoomX', 1.4); b.AddMarker(75, 'Red', 'look', 'n', 1, 'us-item');
  tl.AddMarker(25, 'Blue', 'start', '', 1, 'us-a');
  tl.AddMarker(138, 'Red', 'pause', '', 1, 'us-b');
  tl.AddMarker(375, 'Green', 'long', '', 50, 'us-c');
  tl.AddMarker(750, 'Yellow', 'late', '', 1, 'us-d');
  tl.SetTrackLock('audio', 2, true); tl.SetTrackEnable('audio', 2, false);
  return Object.assign(S, { A, B, M, tl, seqId: tl.GetUniqueId() });
}

test('resolve core: extractRanges ripple-removes ranges on every track, markers and states kept', async () => {
  const { F, run, tl, seqId, B } = interview();
  const linked = []; tl.SetClipsLinked = (items, on) => { linked.push(items.map(i => i.GetTrackTypeAndIndex().join(''))); return true; };
  // the tool sends them from the end backwards; 4.4–6 s and 9–10 s and 16–17 s (and one less than a frame)
  const r = await run('extractRanges', { seqId, ranges: [[16, 17], [9, 10], [4.4, 6], [30, 30.01]] });
  assert.strictEqual(r.cuts, 3);
  near(r.removed, 0.04 * (40 + 25 + 25)); near(r.duration, 40 - 3.6);
  // V1: 0–20 s of A minus the three cuts → 0–110, 150–225, 250–400 (media), then A's second half moved 90 frames left
  assert.deepStrictEqual(geo(tl, 'video', 1), [[0, 110, 0], [110, 185, 150], [185, 335, 250], [335, 410, 425], [410, 910, 2500]]);
  assert.deepStrictEqual(geo(tl, 'audio', 1), geo(tl, 'video', 1), 'sound cut the same');
  // V2: B 200–300 loses 225–250 → 200–225 → 160–185 (media 1250–1275) and 250–300 → 185–235 (media 1300–1350)
  const v2 = tl.GetItemListInTrack('video', 2);
  assert.deepStrictEqual(geo(tl, 'video', 2), [[160, 185, 1250], [185, 235, 1300]]);
  assert.ok(v2.every(i => !i.GetClipEnabled() && i.GetClipColor() === 'Orange' && i.GetProperty('ZoomX') === 1.4), 'disabled, colour and zoom survive');
  assert.deepStrictEqual(Object.keys(v2[1]._markers).map(Number), [25], 'the item marker (75 frames in) sits 25 frames into the second part');
  assert.strictEqual(v2[1]._markers[25].customData, 'us-item');
  assert.ok(B._markers && Object.keys(B._markers).length === 0, 'the Media Pool clip is not touched');
  // music on A2 ripples too; the track stays locked and off
  assert.deepStrictEqual(geo(tl, 'audio', 2), [[0, 110, 0], [110, 185, 150], [185, 335, 250], [335, 910, 425]]);
  assert.strictEqual(tl.GetIsTrackLocked('audio', 2), true); assert.strictEqual(tl.GetIsTrackEnabled('audio', 2), false);
  // timeline markers: 1 s stays, the one in the cut goes, 15 s (2 s long, across 16–17 s) moves to 12.4 s and loses 1 s, 30 s moves 3.6 s left
  assert.deepStrictEqual(Object.entries(tl._markers).map(([f, m]) => [Number(f), m.duration, m.customData]), [[25, 1, 'us-a'], [310, 25, 'us-c'], [660, 1, 'us-d']]);
  // linked pairs (A on V1 + A1) are linked again, part by part
  assert.ok(linked.length >= 5 && linked.every(l => l.length === 2 && l.includes('video1') && l.includes('audio1')), JSON.stringify(linked));
  const info = await run('sequenceInfo', { seqId });
  assert.deepStrictEqual(info.markers.map(m => m.guid), ['us-a', 'us-c', 'us-d']);
  assert.strictEqual(F.currentTimeline, tl);
});

test('resolve core: extractRanges in chunks from the end gives the same result as one call', async () => {
  const one = interview(), two = interview();
  const ranges = [[30, 31], [16, 17], [9, 10], [4.4, 6], [0, 0.5]];
  const r1 = await one.run('extractRanges', { seqId: one.seqId, ranges });
  let removed = 0, r;
  for (const part of [ranges.slice(0, 2), ranges.slice(2, 4), ranges.slice(4)]) { r = await two.run('extractRanges', { seqId: two.seqId, ranges: part }); removed += r.removed; }
  near(removed, r1.removed); near(r.duration, r1.duration);
  for (const [type, t] of [['video', 1], ['video', 2], ['audio', 1], ['audio', 2]]) assert.deepStrictEqual(geo(two.tl, type, t), geo(one.tl, type, t), type + t);
  assert.deepStrictEqual(Object.keys(two.tl._markers), Object.keys(one.tl._markers));
});

test('resolve core: extractRanges like Song Splitter (keep one song: cut the end past the timeline, then the start)', async () => {
  const { run, tl, seqId } = interview();
  const r = await run('extractRanges', { seqId, ranges: [[25, 41], [0, 12]] });
  assert.strictEqual(r.cuts, 2);
  near(r.duration, 13); near(r.removed, 27);
  assert.deepStrictEqual(geo(tl, 'video', 1), [[0, 200, 300], [200, 325, 2500]]);
  assert.deepStrictEqual(geo(tl, 'audio', 2), [[0, 325, 300]]);
  assert.deepStrictEqual(tl.GetItemListInTrack('video', 2).length, 0, 'the overlay (8–12 s) was inside the cut');
  assert.deepStrictEqual(Object.entries(tl._markers).map(([f, m]) => [Number(f), m.customData]), [[75, 'us-c']]);
});

test('resolve core: extractRanges refuses items it can’t rebuild, before changing anything', async () => {
  const { run, tl, seqId } = interview();
  // a title (no Media Pool clip) after the first cut
  const title = { _start: tl._start + 600, _end: tl._start + 650, GetStart: () => tl._start + 600, GetEnd: () => tl._start + 650, GetName: () => 'Lower third', GetMediaPoolItem: () => null, GetUniqueId: () => 'title-1' };
  tl.AddTrack('video'); tl._v[2].push(title);
  const before = JSON.stringify([geo(tl, 'video', 1), geo(tl, 'audio', 1), Object.keys(tl._markers)]);
  const r = await run('extractRanges', { seqId, ranges: [[5, 6]] }).catch(e => e.res.error);
  assert.strictEqual(r.code, 'HOST_SCRIPT'); assert.ok(/can’t move one item/.test(r.title), r.title); assert.ok(/Lower third/.test(r.detail));
  assert.strictEqual(JSON.stringify([geo(tl, 'video', 1), geo(tl, 'audio', 1), Object.keys(tl._markers)]), before);
  // …but a title before the first cut is fine
  title._start = title._end = 0; title.GetStart = () => tl._start; title.GetEnd = () => tl._start + 50;
  const ok = await run('extractRanges', { seqId, ranges: [[5, 6]] });
  near(ok.removed, 1);
  // a speed change after the cut is refused too
  const it = tl.GetItemListInTrack('video', 1)[2]; it.GetSourceEndFrame = () => it._srcStart + 2 * (it._end - it._start);
  assert.ok(/speed change/.test((await run('extractRanges', { seqId, ranges: [[30, 31]] }).catch(e => e.res.error)).detail));
  // nothing to cut
  assert.deepStrictEqual(await run('extractRanges', { seqId, ranges: [[3, 3.01]] }), { cuts: 0, removed: 0, duration: 39 });
});

test('resolve core: importFiles (into the bin, missing files left out, none at all is a plain error)', async () => {
  const { F, run } = setup();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'us-resolve-core-'));
  const a = path.join(dir, 'Guide.png'), b = path.join(dir, 'Clip.mp4');
  fs.writeFileSync(a, 'x'); fs.writeFileSync(b, 'x');
  F.media[a] = { type: 'Still', frames: 1, audioCh: 0, fps: 25, width: 1920, height: 1080 };
  const got = await run('importFiles', { paths: [a, path.join(dir, 'gone.mp4'), b], binPath: 'JMG Ultra Studio/Guides' });
  assert.deepStrictEqual(got.map(x => [x.name, x.path]), [['Guide.png', a], ['Clip.mp4', b]]);
  assert.strictEqual(F.bin('JMG Ultra Studio/Guides')._clips.length, 2);
  assert.strictEqual(F.pool.GetCurrentFolder(), F.root);
  const e = await run('importFiles', { paths: [path.join(dir, 'gone.mp4')] }).catch(x => x.res.error);
  assert.strictEqual(e.code, 'NOTHING_FOUND'); assert.strictEqual(e.title, 'That file isn’t there any more.');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('resolve core: no project / no timeline give the plain errors', async () => {
  const { F, run } = setup();
  assert.strictEqual((await run('sequenceInfo', {}).catch(e => e.res.error.code)), 'NO_SEQUENCE');
  assert.strictEqual((await run('sequenceInfo', { seqId: 'gone' }).catch(e => e.res.error.code)), 'NOT_FOUND');
  F.noProject = true;
  assert.strictEqual((await run('selectionSummary', {}).catch(e => e.res.error.code)), 'NO_PROJECT');
  assert.strictEqual((await run('listBins').catch(e => e.res.error.code)), 'NO_PROJECT');
});
