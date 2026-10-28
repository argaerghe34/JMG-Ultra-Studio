// Resolve: what real Resolve 21.1.2 does that can crash it or break a command (dev/RESOLVE.md › Measured), against the
// stand-in (dev/tests/resolve-fake.js), which throws – and run.js fails the test – whenever undefined / null / NaN is
// sent to the API, a deleted object is used, or a subtitle file is asked for its clip properties.
'use strict';
const assert = require('assert'), fs = require('fs'), path = require('path');
const { test } = require('./harness');
const Fake = require('./resolve-fake');
const HOST = require('../../resolve/host');
const kit = require('./resolve-render-kit');

function setup(opts) {
  const F = Fake.make(opts);
  const host = HOST.connect({ api: F.resolve });
  const run = async (name, args) => { const r = await host.run(name, args); if (!r.ok) throw Object.assign(new Error(`${name}: ${r.error.code} ${r.error.detail}`), { res: r }); return r.data; };
  const fail = async (name, args) => { const r = await host.run(name, args); assert.ok(!r.ok, name + ' should fail'); return r.error; };
  return { F, host, run, fail, R: host.R };
}
/** a subtitle file in the Media Pool, as an imported .srt is */
const addSrt = (F, name = 'Cut captions.srt') => F.addMedia('/m/' + name, { type: 'Subtitle', frames: 125, audioCh: 0 });

test('resolve safety: the stand-in itself refuses bad values, dead objects and subtitle clip properties', () => {
  const { F } = setup();
  const clip = F.addMedia('/m/A.mp4');
  const tl = F.addTimeline('Cut', [{ item: clip, in: 0, out: 50 }]);
  assert.throws(() => F.pool.AppendToTimeline([{ mediaPoolItem: clip, startFrame: 0, endFrame: 10, recordFrame: undefined }]), /would abort/);
  assert.throws(() => tl.AddMarker(NaN, 'Blue', '', '', 1, ''), /would abort/);
  const [ti] = tl.GetItemListInTrack('video', 1);
  tl.DeleteClips([ti], false);
  assert.throws(() => ti.GetName(), /Unable to find proxy object/);
  assert.throws(() => addSrt(F).GetClipProperty(), /would abort/);
  assert.throws(() => F.pool.CreateEmptyTimeline('Interview – 9:16'), /Unable to create a timeline/);
  F.crashes.splice(0);   // seen on purpose
});

test('resolve safety: clipInfo sends whole frames, leaves out what isn’t set, refuses subtitle files and missing times', () => {
  const { F, R } = setup();
  const clip = F.addMedia('/m/A.mp4');
  const ci = R.clipInfo(clip, 1.01, 2.5, { trackIndex: 2, recordFrame: 86400.4, mediaType: undefined });
  assert.deepStrictEqual(Object.keys(ci).sort(), ['endFrame', 'mediaPoolItem', 'recordFrame', 'startFrame', 'trackIndex']);
  assert.deepStrictEqual([ci.startFrame, ci.endFrame, ci.trackIndex, ci.recordFrame], [25, 63, 2, 86400]);   // endFrame exclusive
  assert.ok(!('mediaType' in R.clipInfo(clip, 0, 1, { mediaType: NaN, recordFrame: null })));
  assert.throws(() => R.clipInfo(clip, undefined, 2), e => e.usCode === 'BAD_INPUT');
  assert.throws(() => R.clipInfo(clip, 0, 'x'), e => e.usCode === 'BAD_INPUT');
  assert.throws(() => R.clipInfo(addSrt(F), 0, 2), e => e.usCode === 'HOST_SCRIPT');
  assert.deepStrictEqual(R.clean({ a: 1, b: undefined, c: null, d: NaN, e: '', f: false, g: Infinity }), { a: 1, e: '', f: false });
});

test('resolve safety: placeClips refuses a clip without times before placing anything; track numbers are numbers', async () => {
  const { F, run, fail } = setup();
  const clip = F.addMedia('/m/A.mp4', { frames: 500 });
  const tl = F.addTimeline('Cut', []);
  const e = await fail('placeClips', { seqId: tl.GetUniqueId(), clips: [{ id: clip.GetUniqueId(), in: 0, out: 2 }, { id: clip.GetUniqueId(), in: 0 }] });
  assert.strictEqual(e.code, 'BAD_INPUT');
  assert.strictEqual(tl.GetItemListInTrack('video', 1).length, 0, 'nothing placed');
  assert.strictEqual((await fail('placeClips', { seqId: tl.GetUniqueId(), clips: [{ id: clip.GetUniqueId(), in: 0, out: 2, at: NaN }] })).code, 'BAD_INPUT');
  const r = await run('placeClips', { seqId: tl.GetUniqueId(), cursor: 'soon', clips: [{ id: clip.GetUniqueId(), in: 0, out: 2, v: '1', a: '1' }] });
  assert.deepStrictEqual(r.placed, [{ start: 0, end: 2 }]);
  assert.strictEqual(tl.GetItemListInTrack('video', 2).length, 1, 'v "1" is track 2, not track 11');
});

test('resolve safety: markers without a time are refused before any is added; "frame:" ids remove markers without customData', async () => {
  const { F, run, fail } = setup();
  const clip = F.addMedia('/m/A.mp4', { frames: 500 });
  const tl = F.addTimeline('Cut', [{ item: clip, in: 0, out: 250 }]), seqId = tl.GetUniqueId();
  for (const where of ['sequence', 'clips', 'both']) {
    const e = await fail('addSequenceMarkers', { seqId, where, markers: [{ start: 1, name: 'ok' }, { name: 'no time' }] });
    assert.strictEqual(e.code, 'BAD_INPUT', where);
  }
  assert.deepStrictEqual(tl._markers, {}, 'nothing added');
  assert.deepStrictEqual(clip._markers, {}, 'nothing added on the clip');
  assert.strictEqual((await fail('addClipMarkers', { id: clip.GetUniqueId(), markers: [{ start: 'later' }] })).code, 'BAD_INPUT');
  // a marker the person made (no customData): readMarkers calls it frame:<real frame>, and that id removes it
  tl.AddMarker(50, 'Red', 'mine', '', 1, '');
  const info = await run('sequenceInfo', { seqId });
  assert.strictEqual(info.markers[0].guid, 'frame:50');
  assert.strictEqual(await run('removeSequenceMarkers', { seqId, guids: ['frame:50'] }), 1);
  assert.deepStrictEqual(tl._markers, {});
});

test('resolve safety: removing markers when DeleteMarkerByCustomData throws falls back to the real frame', async () => {
  const { F, run } = setup();
  const clip = F.addMedia('/m/A.mp4', { frames: 500 });
  const tl = F.addTimeline('Cut', [{ item: clip, in: 0, out: 250 }]), seqId = tl.GetUniqueId();
  const guids = await run('addSequenceMarkers', { seqId, where: 'sequence', markers: [{ start: 1, name: 'a' }, { start: 2, name: 'b' }] });
  F.fail.DeleteMarkerByCustomData = 'Unknown marker';
  assert.strictEqual(await run('removeSequenceMarkers', { seqId, guids }), 2);
  assert.deepStrictEqual(tl._markers, {});
});

test('resolve safety: subclips, B-roll and Story lines without times are skipped, never sent as NaN', async () => {
  const { F, run } = setup();
  const clip = F.addMedia('/m/A.mp4', { frames: 500 }), id = clip.GetUniqueId();
  const subs = await run('createSubclips', { binPath: 'Subs', items: [{ id, start: 1, end: 2, name: 7 }, { id, start: 1 }] });
  assert.ok(subs[0] && subs[1] === null, JSON.stringify(subs));
  const tl = F.addTimeline('Cut', [{ item: clip, in: 0, out: 250 }]), seqId = tl.GetUniqueId();
  const b = await run('brollPlace', { seqId, shots: [{ id, in: 0, out: 1, at: 2 }, { id, in: 0, out: 1 }, { id: addSrt(F).GetUniqueId(), in: 0, out: 1, at: 5 }] });
  assert.strictEqual(b.placed, 1);
  const s = await run('storyPlace', { seqId, cursor: 0, clips: [{ id, out: 3 }, { id, in: 3, out: 4 }] });
  assert.strictEqual(s.placed[0], null); assert.deepStrictEqual(s.placed[1], { start: 0, end: 1 });
  const st = await run('storyHighlights', { seqId, sections: [{ name: 'x' }, { name: 'y', start: 1, end: 2, label: 3 }] });
  assert.strictEqual(st.placed, 1);
});

test('resolve safety: a subtitle file is never laid on a timeline or asked for its frames (Selects, Render Queue)', async () => {
  const S = kit.setup();
  const srt = addSrt(S.F), tl = S.F.addTimeline('Cut', []), before = S.F.timelines.length;
  const r = await S.run('selectsPlaceWhole', { seqId: tl.GetUniqueId(), ids: [srt.GetUniqueId()] });
  assert.deepStrictEqual(r.placed, [null]);
  await assert.rejects(S.run('queueItemExport', { id: srt.GetUniqueId(), out: path.join(S.dir, 'x.mp4'), preset: 'resolve:h264' }));
  assert.strictEqual(S.F.timelines.length, before, 'no scratch timeline left behind');
  assert.deepStrictEqual(await S.run('audioClipRange', { id: srt.GetUniqueId() }), { in: 0, out: 0, duration: 0, mediaStart: 0, subclip: false });
});

test('resolve safety: a subtitle whose name has no “.srt” (as Resolve shows an imported one) is known by its Type', async () => {
  const S = kit.setup();
  const sub = S.F.addMedia('/m/Cut captions.srt', { type: 'Subtitle', frames: 425, audioCh: 0, name: 'Cut captions - social captions (14)' });
  const vid = S.F.addMedia(path.join(S.dir, 'A.mp4'), { frames: 250 });
  const id = sub.GetUniqueId();
  const info = (await S.run('itemsInfo', { ids: [id] }))[0];
  assert.strictEqual(info.kind, 'subtitle', 'not footage, though it has a Resolution');
  assert.ok(!info.hasVideo && !info.hasAudio);
  const listed = await S.run('binList', { binId: S.host.R.id(S.host.R.root()), kinds: ['video'], recursive: true });
  assert.deepStrictEqual(listed.map(x => x.id), [vid.GetUniqueId()], 'overnight prep and Selects never see it');
  const tl = S.F.addTimeline('Cut', []), before = S.F.timelines.length;
  assert.deepStrictEqual((await S.run('selectsPlaceWhole', { seqId: tl.GetUniqueId(), ids: [id] })).placed, [null]);
  await assert.rejects(S.run('queueItemExport', { id, out: path.join(S.dir, 'x.mp4'), preset: 'resolve:h264' }));
  await assert.rejects(S.run('renderAudio', { id }));
  assert.strictEqual(S.F.timelines.length, before, 'no scratch timeline left behind');
  assert.deepStrictEqual(S.F.crashes, [], 'nothing that would abort Resolve');
});

test('resolve: generators, titles and Fusion clips in the Media Pool aren’t footage', async () => {
  const S = kit.setup();
  const g = S.F.addMedia('/m/Solid Color', { type: 'Generator', audioCh: 0 });
  const v = S.F.addMedia(path.join(S.dir, 'A.mp4'), { frames: 250 });
  const info = await S.run('itemsInfo', { ids: [g.GetUniqueId(), v.GetUniqueId()] });
  assert.deepStrictEqual(info.map(i => i.kind), ['synthetic', 'video']);
  assert.deepStrictEqual((await S.run('binList', { binId: S.host.R.id(S.host.R.root()), kinds: ['video'], recursive: true })).map(x => x.id), [v.GetUniqueId()]);
});

test('resolve safety: a thrown SetRenderSettings / StartRendering is a refusal, and the settings are still put back', async () => {
  const S = kit.setup();
  const file = path.join(S.dir, 'A.mp4'); fs.writeFileSync(file, 'x');
  const clip = S.F.addMedia(file, { frames: 500 });
  const tl = S.F.addTimeline('Cut', [{ item: clip, in: 0, out: 250 }]), seqId = tl.GetUniqueId();
  S.F.project.SetCurrentRenderFormatAndCodec('mov', 'ProRes422HQ');
  S.F.fail.SetRenderSettings = 'Invalid target directory';
  await assert.rejects(S.run('queueExport', { seqId, out: path.join(S.dir, 'out', 'A.mp4'), preset: 'resolve:h264' }), e => e.code === 'RENDER_FAILED');
  assert.strictEqual(S.F.renderJobs.length, 0, 'no job queued with the old settings');
  delete S.F.fail.SetRenderSettings;
  assert.deepStrictEqual(S.F.project.GetCurrentRenderFormatAndCodec(), { format: 'mov', codec: 'ProRes422HQ' }, 'put back');
  const id = await S.run('queueExport', { seqId, out: path.join(S.dir, 'out', 'A.mp4'), preset: 'resolve:h264' });
  S.F.fail.StartRendering = 'Busy';
  await assert.rejects(S.run('startEncoderBatch', { ids: [id] }), e => e.code === 'RENDER_FAILED');
  delete S.F.fail.StartRendering;
  assert.strictEqual(await S.run('startEncoderBatch', { ids: [id] }), true, 'still pending, so it can start later');
});

test('resolve safety: a format without a codec is never sent back half (withRestore)', async () => {
  const S = kit.setup();
  const file = path.join(S.dir, 'A.mp4'); fs.writeFileSync(file, 'x');
  const clip = S.F.addMedia(file, { frames: 500 });
  const tl = S.F.addTimeline('Cut', [{ item: clip, in: 0, out: 250 }]);
  S.F.project.GetCurrentRenderFormatAndCodec = () => ({ format: 'mp4' });
  S.F.project.SaveAsNewRenderPreset = () => false;
  await S.run('queueExport', { seqId: tl.GetUniqueId(), out: path.join(S.dir, 'out', 'A.mp4'), preset: 'resolve:h264' });
});

test('resolve safety: Resolve busy (SetCurrentTimeline throws for a moment) – openSequence tries again', async () => {
  const { F, run } = setup();
  const clip = F.addMedia('/m/A.mp4', { frames: 500 });
  const a = F.addTimeline('A', [{ item: clip, in: 0, out: 50 }]), b = F.addTimeline('B', [{ item: clip, in: 0, out: 50 }]);
  F.project.SetCurrentTimeline(b);
  let refusals = 1;
  const set = F.project.SetCurrentTimeline;
  F.project.SetCurrentTimeline = tl => { if (refusals-- > 0) throw new Error('Execute: SetCurrentTimeline: Unable to execute script action'); return set(tl); };
  assert.strictEqual(await run('openSequence', { seqId: a.GetUniqueId() }), true);
  assert.strictEqual(F.currentTimeline, a);
});

test('resolve safety: fitToSize – a nesting AppendToTimeline that throws falls back to a resized copy', async () => {
  const S = kit.setup();
  const file = path.join(S.dir, 'A.mp4'); fs.writeFileSync(file, 'x');
  const clip = S.F.addMedia(file, { frames: 500 });
  const tl = S.F.addTimeline('Cut', [{ item: clip, in: 0, out: 250 }]);
  const append = S.F.pool.AppendToTimeline;
  S.F.pool.AppendToTimeline = clips => { if (clips.some(c => c.mediaPoolItem === tl._mpi)) throw new Error('Execute: AppendToTimeline: Error response'); return append(clips); };
  const r = await S.run('fitToSize', { seqId: tl.GetUniqueId(), width: 1080, height: 1920, name: 'Cut vertical' });
  assert.strictEqual(r.via, 'copy'); assert.strictEqual(r.width, 1080); assert.strictEqual(r.height, 1920);
  assert.ok(!S.F.timelines.some(t => t._dead), 'the refused empty timeline is gone');
});

test('resolve safety: extractRanges carries only real property values over and moves markers by their own id', async () => {
  const { F, run } = setup();
  const clip = F.addMedia('/m/A.mp4', { frames: 1000 });
  const tl = F.addTimeline('Cut', [{ item: clip, in: 0, out: 500 }]), seqId = tl.GetUniqueId();
  const [ti] = tl.GetItemListInTrack('video', 1);
  ti._props.Weird = null; ti._props.Odd = NaN; ti._props.ZoomX = 1.5;
  tl.AddMarker(300, 'Red', 'mine', '', 1, 'shared');
  tl.AddMarker(400, 'Red', 'mine too', '', 1, 'shared');
  tl.AddMarker(450, 'Blue', 'ours', '', 1, 'us-only');
  const r = await run('extractRanges', { seqId, ranges: [[2, 4]] });
  assert.strictEqual(r.cuts, 1);
  const parts = tl.GetItemListInTrack('video', 1);
  assert.ok(parts.every(p => p._props.ZoomX === 1.5), 'zoom carried over');
  assert.deepStrictEqual(Object.keys(tl._markers).map(Number).sort((x, y) => x - y), [250, 350, 400]);
  assert.strictEqual(tl._markers[400].customData, 'us-only');
});
