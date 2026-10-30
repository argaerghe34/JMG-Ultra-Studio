// Resolve: Safe Zones guides, full-size timelines, Deliver presets and render ranges (resolve/host/finish.js), and the
// Deliver / Safe Zones tools' Resolve wording.
const assert = require('assert'), fs = require('fs'), path = require('path');
const { load, test } = require('./harness');
const { setup, asResolve, fakeJob } = require('./resolve-render-kit');
const US = load(['time', 'encoder', 'js/tools/30-safezones.js', 'js/tools/33-deliver.js']);

function withTimeline() {
  const S = setup();
  const file = path.join(S.dir, 'I001.mp4'); fs.writeFileSync(file, 'x');
  const clip = S.F.addMedia(file, { frames: 500 });
  const tl = S.F.addTimeline('Cut', [{ item: clip, in: 0, out: 250 }]);   // 10 s at 25 fps
  const png = path.join(S.dir, 'Ultra Guide 9x16 TikTok 1920x1080.png'); fs.writeFileSync(png, 'png');
  const guide = S.F.addMedia(png, { type: 'Still', audioCh: 0, frames: 125, bin: 'JMG Ultra Studio/Guides' });
  return Object.assign(S, { clip, tl, png, guide, seqId: tl.GetUniqueId() });
}
const v = (tl, t) => tl.GetItemListInTrack('video', t);

test('placeGuide: the guide on a new top track named Guides for the whole timeline; placed again, it replaces itself', async () => {
  const S = withTimeline();
  const r = await S.run('placeGuide', { seqId: S.seqId, itemId: S.guide.GetUniqueId() });
  assert.deepStrictEqual(r, { track: 1, start: 0, end: 10 });
  assert.strictEqual(S.tl.GetTrackName('video', 2), 'Guides'); assert.ok(S.tl.GetIsTrackEnabled('video', 2));
  assert.deepStrictEqual(v(S.tl, 2).map(i => [i.GetName(), i._srcStart, i.GetStart(), i.GetEnd()]), [[path.basename(S.png), 0, 86400, 86650]]);
  assert.deepStrictEqual(v(S.tl, 1).map(i => i.GetName()), ['I001.mp4'], 'nothing underneath moves');
  await S.run('showGuides', { seqId: S.seqId, show: false });
  const again = await S.run('placeGuide', { seqId: S.seqId, itemId: S.guide.GetUniqueId() });
  assert.strictEqual(again.track, 1); assert.strictEqual(S.tl.GetTrackCount('video'), 2); assert.strictEqual(v(S.tl, 2).length, 1);
  assert.ok(S.tl.GetIsTrackEnabled('video', 2), 'a placed guide shows');
  // something else on the Guides track: a fresh track instead
  S.F.pool.AppendToTimeline([{ mediaPoolItem: S.clip, startFrame: 0, endFrame: 24, trackIndex: 2, recordFrame: 86650 }]);
  assert.strictEqual((await S.run('placeGuide', { seqId: S.seqId, itemId: S.guide.GetUniqueId() })).track, 2);
});

test('placeGuide: a still that comes out short is laid again until the timeline is covered; the open timeline is kept', async () => {
  const S = withTimeline();
  const other = S.F.addTimeline('Other', []); S.F.project.SetCurrentTimeline(other);
  const append = S.F.pool.AppendToTimeline;
  S.F.pool.AppendToTimeline = clips => append(clips.map(c => Object.assign({}, c, { endFrame: Math.min(c.endFrame, c.startFrame + 100) })));   // 4 s of still at most (endFrame exclusive)
  const r = await S.run('placeGuide', { seqId: S.seqId, itemId: S.guide.GetUniqueId(), trackName: 'Letterbox', prefix: 'Ultra Guide' });
  assert.deepStrictEqual([r.start, r.end], [0, 10]);
  assert.deepStrictEqual(v(S.tl, 2).map(i => [i.GetStart() - 86400, i.GetEnd() - 86400]), [[0, 100], [100, 200], [200, 250]]);
  assert.strictEqual(S.tl.GetTrackName('video', 2), 'Letterbox');
  assert.strictEqual(S.F.currentTimeline, other);
  const empty = S.F.addTimeline('Empty', []);
  await assert.rejects(S.run('placeGuide', { seqId: empty.GetUniqueId(), itemId: S.guide.GetUniqueId() }), e => e.code === 'BAD_INPUT');
});

test('findGuideItem, guideStatus, showGuides, removeGuides (letterbox bars apart from guides)', async () => {
  const S = withTimeline();
  assert.strictEqual(await S.run('findGuideItem', { path: S.png }), S.guide.GetUniqueId());
  assert.strictEqual(await S.run('findGuideItem', { path: path.join(S.dir, 'nope.png') }), null);
  await S.run('placeGuide', { seqId: S.seqId, itemId: S.guide.GetUniqueId() });
  const barsPng = path.join(S.dir, 'Ultra Letterbox 2.39x1 1920x1080.png'); fs.writeFileSync(barsPng, 'png');
  const bars = S.F.addMedia(barsPng, { type: 'Still', audioCh: 0 });
  await S.run('placeGuide', { seqId: S.seqId, itemId: bars.GetUniqueId(), trackName: 'Letterbox', prefix: 'Ultra Letterbox' });
  assert.deepStrictEqual(await S.run('guideStatus', { seqId: S.seqId }), [{ track: 1, count: 1, hidden: false }], 'bars export with the film: not a guide');
  assert.strictEqual(await S.run('showGuides', { seqId: S.seqId, show: false }), 1);
  assert.deepStrictEqual(await S.run('guideStatus', { seqId: S.seqId }), [{ track: 1, count: 1, hidden: true }]);
  assert.ok(S.tl.GetIsTrackEnabled('video', 3), 'the bars track is untouched');
  assert.strictEqual(await S.run('removeGuides', { seqId: S.seqId, prefix: 'Ultra Letterbox' }), 1);
  assert.strictEqual(S.tl.GetTrackCount('video'), 2, 'its emptied Letterbox track goes');
  assert.strictEqual(await S.run('removeGuides', { seqId: S.seqId }), 1);
  assert.strictEqual(S.tl.GetTrackCount('video'), 1);
  assert.deepStrictEqual(await S.run('guideStatus', { seqId: S.seqId }), []);
});

test('fitToSize: a new timeline of the exact size with the reframed one nested in it; a resized copy if nesting is refused', async () => {
  const S = withTimeline();
  const r = await S.run('autoReframe', { seqId: S.seqId, num: 9, den: 16, name: 'Cut – 9:16', binPath: 'JMG Ultra Studio/Deliver' });
  const f = await S.run('fitToSize', { seqId: r.id, width: 1080, height: 1920, name: 'Cut – 9:16 1080×1920', binPath: 'JMG Ultra Studio/Deliver' });
  assert.deepStrictEqual([f.name, f.width, f.height, f.via], ['Cut – 9∶16 1080×1920', 1080, 1920, 'nested'] /* Resolve refuses ':' in names: a look-alike */);
  assert.ok(Math.abs(f.scale - 177.78) < 0.01);
  const t = S.F.timelines.find(x => x.GetUniqueId() === f.id), src = S.F.timelines.find(x => x.GetUniqueId() === r.id);
  assert.strictEqual(v(t, 1)[0].GetMediaPoolItem(), src.GetMediaPoolItem(), 'the reframed timeline, nested');
  assert.ok(S.F.bin('JMG Ultra Studio/Deliver')._clips.includes(t.GetMediaPoolItem()));
  assert.strictEqual(S.F.currentTimeline, S.tl);
  // nesting refused
  const append = S.F.pool.AppendToTimeline;
  S.F.pool.AppendToTimeline = clips => (clips.some(c => /timeline/i.test(c.mediaPoolItem._m.type)) ? [] : append(clips));
  const g = await S.run('fitToSize', { seqId: r.id, width: 1080, height: 1920, name: 'Copy', binPath: 'JMG Ultra Studio/Deliver' });
  assert.deepStrictEqual([g.via, g.width, g.height], ['copy', 1080, 1920]);
});

test('deliverPresets: built-in recipes plus Resolve’s own render presets (not our temporary one)', async () => {
  const S = withTimeline();
  S.F.presets['JMG Ultra Studio – your render settings 1'] = {};
  const p = await S.run('deliverPresets');
  assert.deepStrictEqual([p.h264, p.youtube1080, p.youtube2160, p.prores, p.wav], ['resolve:h264', 'resolve:youtube1080', 'resolve:youtube2160', 'resolve:prores', 'resolve:wav']);
  assert.deepStrictEqual(p.renderPresets.map(x => x.path), ['preset:H.264 Master', 'preset:YouTube - 1080p', 'preset:Vimeo - 1080p', 'preset:ProRes 422 HQ', 'preset:Audio Only']);
});

test('render ranges: duration markers with Ultra Studio’s tag; other markers are left out', async () => {
  const S = withTimeline();
  assert.deepStrictEqual(await S.run('renderRanges', { seqId: S.seqId }), { track: -1, trackName: '', ranges: [], colours: true, hidden: false });
  S.tl.AddMarker(50, 'Blue', 'A note', '', 1, 'us-123');   // someone else's marker at 2 s
  const r = await S.run('addRenderRange', { seqId: S.seqId, name: 'Teaser', start: 2, end: 6 });
  assert.deepStrictEqual([r.placed, r.named, r.kind], [1, true, 'marker']);
  assert.strictEqual(r.log.length, 1, 'moved on a frame because of the other marker');
  await S.run('addRenderRange', { seqId: S.seqId, name: 'Outro', start: 8, end: 10 });
  const m = S.tl._markers[51];
  assert.deepStrictEqual([m.color, m.name, m.duration, /^us-range-/.test(m.customData)], ['Fuchsia', 'Teaser', 99, true]);
  const got = await S.run('renderRanges', { seqId: S.seqId });
  assert.deepStrictEqual(got.ranges.map(x => [x.name, x.start, x.end, x.disabled]), [['Teaser', 2.04, 6, false], ['Outro', 8, 10, false]]);
  assert.strictEqual(got.track, 0);
  await assert.rejects(S.run('addRenderRange', { seqId: S.seqId, name: 'x', start: 3, end: 3 }), e => e.code === 'BAD_INPUT');
});

test('song layers in Resolve: coloured range markers in a “Songs” group; replaced when run again; read back with their colours', async () => {
  const S = withTimeline();
  const sections = [{ name: '1', start: 0, end: 4, label: 5 }, { name: 'Talk', start: 4, end: 5, label: 4 }, { name: '2', start: 5, end: 9, label: 5 }, { name: 'Applause', start: 9, end: 10, label: 7 }];
  const r = await S.run('labelLayers', { seqId: S.seqId, trackName: 'Songs', sections });
  assert.deepStrictEqual([r.kind, r.placed, r.removed], ['marker', 4, 0]);
  const got = await S.run('renderRanges', { seqId: S.seqId, track: 'Songs' });
  assert.deepStrictEqual(got.ranges.map(x => [x.name, x.start, x.end, x.label]), [['1', 0, 4, 5], ['Talk', 4, 5, 4], ['2', 5, 9, 5], ['Applause', 9, 10, 7]]);
  assert.deepStrictEqual(Object.values(S.tl._markers).map(m => m.color), ['Green', 'Sky', 'Green', 'Sand']);
  assert.strictEqual((await S.run('renderRanges', { seqId: S.seqId })).ranges.length, 0, 'not render ranges of the Renders group');
  await S.run('addRenderRange', { seqId: S.seqId, name: 'Teaser', start: 2.5, end: 3.5 });
  assert.deepStrictEqual((await S.run('rangeTracks', { seqId: S.seqId })).tracks.map(t => [t.name, t.count]).sort(), [['Renders', 1], ['Songs', 4]]);
  const again = await S.run('labelLayers', { seqId: S.seqId, trackName: 'Songs', sections: sections.slice(0, 1) });
  assert.deepStrictEqual([again.placed, again.removed], [1, 4]);
  assert.strictEqual((await S.run('renderRanges', { seqId: S.seqId })).ranges.length, 1, 'the render range stays');
  assert.strictEqual((await S.run('removeLabelLayers', { seqId: S.seqId, trackName: 'Songs' })).removed, 1);
  assert.deepStrictEqual(S.F.crashes, []);
});
test('render ranges in Resolve: added in a group and colour, renamed, moved, recoloured and deleted – the same id throughout', async () => {
  const S = withTimeline();
  await S.run('addRenderRange', { seqId: S.seqId, name: 'Encore', start: 6, end: 8, track: 'Songs', label: 5 });
  let [r] = (await S.run('renderRanges', { seqId: S.seqId, track: 'songs' })).ranges;
  assert.deepStrictEqual([r.name, r.start, r.end, r.label], ['Encore', 6, 8, 5]);
  const id = r.nodeId;
  await S.run('editRenderRange', { seqId: S.seqId, track: 'Songs', nodeId: id, name: '3 Encore' });
  const e = await S.run('editRenderRange', { seqId: S.seqId, track: 'Songs', nodeId: id, start: 5, end: 9.6, label: 11 });
  assert.deepStrictEqual([e.range.name, e.range.start, e.range.end, e.range.label, e.range.nodeId], ['3 Encore', 5, 9.6, 11, id]);
  assert.strictEqual(Object.values(S.tl._markers).length, 1, 'one marker, laid again');
  await assert.rejects(S.run('editRenderRange', { seqId: S.seqId, track: 'Songs', nodeId: id, start: 4, end: 4 }), x => x.code === 'BAD_INPUT');
  await S.run('removeRenderRange', { seqId: S.seqId, track: 'Songs', nodeId: id });
  assert.strictEqual((await S.run('renderRanges', { seqId: S.seqId, track: 'Songs' })).ranges.length, 0);
  await assert.rejects(S.run('removeRenderRange', { seqId: S.seqId, track: 'Songs', nodeId: id }), x => x.code === 'NOT_FOUND');
});
test('a new place for render ranges in Resolve (Premiere: a new top track): a group name no other group has; nothing is made until a range goes in it', async () => {
  const S = withTimeline();
  assert.deepStrictEqual(await S.run('addRangeTrack', { seqId: S.seqId, name: 'Renders' }), { index: -1, name: 'Renders', named: true, log: [] });
  await S.run('addRenderRange', { seqId: S.seqId, name: 'A', start: 1, end: 2, track: 'Renders' });
  assert.strictEqual((await S.run('addRangeTrack', { seqId: S.seqId, name: 'Renders' })).name, 'Renders 2', 'Renders is taken');
  assert.strictEqual(Object.values(S.tl._markers).length, 1, 'no marker made for the new group');
});

test('queueRangeExport: the render’s own Mark In/Out (last frame inclusive); the timeline’s In/Out untouched', async () => {
  const S = withTimeline();
  S.tl.SetMarkInOut(10, 20);
  const out = path.join(S.dir, 'Teaser.mp4');
  const r = await S.run('queueRangeExport', { seqId: S.seqId, out, preset: 'resolve:h264', start: 2, end: 6 });
  assert.ok(r.id); assert.strictEqual(r.restored, true);
  const s = S.F.jobLog[0].settings;
  assert.deepStrictEqual([s.SelectAllFrames, s.MarkIn, s.MarkOut, s.TargetDir, s.CustomName], [false, 86450, 86549, S.dir, 'Teaser']);
  assert.deepStrictEqual(S.tl.GetMarkInOut().video, { in: 10, out: 20 });
});

test('presetExtension: from the recipe or the loaded preset; Resolve’s settings put back', async () => {
  const S = withTimeline();
  assert.strictEqual(await S.run('presetExtension', { seqId: S.seqId, preset: 'resolve:prores' }), 'mov');
  assert.strictEqual(await S.run('presetExtension', { seqId: S.seqId, preset: 'resolve:wav' }), 'wav');
  S.F.project.LoadRenderPreset = n => { if (n !== 'ProRes 422 HQ') return false; S.F.project.SetCurrentRenderFormatAndCodec('mov', 'ProRes422HQ'); return true; };
  assert.strictEqual(await S.run('presetExtension', { seqId: S.seqId, preset: 'preset:ProRes 422 HQ' }), 'mov');
  assert.deepStrictEqual(S.F.project.GetCurrentRenderFormatAndCodec(), { format: 'mp4', codec: 'H264' }, 'put back');
  assert.strictEqual(await S.run('presetExtension', { seqId: S.seqId, preset: 'preset:Nope' }), '');
});

/* ---------- the tools in Resolve ---------- */
test('Deliver in Resolve: render ranges from markers, rendered through the Render Queue with a recipe (no preset file needed)', async () => {
  const S = withTimeline();
  await S.run('addRenderRange', { seqId: S.seqId, name: 'Teaser', start: 2, end: 6 });
  // sequenceInfo belongs to another Resolve module: answered here
  const env = asResolve(US, S.host, { sequenceInfo: () => ({ id: S.seqId, name: 'Cut', duration: 10, fps: 25, width: 1920, height: 1080, markers: [] }) });
  const keep = US.settings.get('deliver.ranges', null), ctx = US.ctx.sequence;
  US.ctx.sequence = { id: S.seqId, name: 'Cut' };
  US.encoder.pollMs = 1;
  try {
    const job = fakeJob();
    const r = await US.actions.get('deliver.ranges').run({}, job);
    assert.ok(/1 render saved/.test(r.summary), r.summary);
    assert.deepStrictEqual(r.files, [path.join(r.dir, 'Teaser.mp4')]);
    assert.ok(fs.existsSync(r.files[0]));
    const names = env.calls.map(c => c[0]);
    assert.ok(names.includes('guideStatus') && names.includes('queueRangeExport') && names.includes('renderJobStatus'));
    assert.strictEqual(env.calls.find(c => c[0] === 'presetExtension')[1].preset, 'resolve:h264');
    fs.rmSync(r.dir, { recursive: true, force: true });
  } finally { env.restore(); US.encoder.pollMs = 1000; US.ctx.sequence = ctx; if (keep) US.settings.set('deliver.ranges', keep); }
});

test('Deliver and Safe Zones say Smart Reframe and the Render Queue in Resolve, and keep Premiere’s words otherwise', () => {
  assert.ok(/Auto Reframe/.test(US.deliver.OUTPUTS.v916.label), 'Premiere (the test default)');
  const src = fs.readFileSync(path.join(__dirname, '..', '..', 'js', 'tools', '33-deliver.js'), 'utf8');
  assert.ok(/Smart Reframe/.test(src) && /Render All on the Deliver page/.test(src));
  const sz = fs.readFileSync(path.join(__dirname, '..', '..', 'js', 'tools', '30-safezones.js'), 'utf8');
  assert.ok(/Resolve renders every track that’s switched on/.test(sz));
});

test('render ranges from Text titles in Resolve: Text+ on a track named like the ranges, named by its words; colour, delete, track off while rendering', async () => {
  const S = withTimeline(), tl = S.tl;
  tl.AddTrack('video'); tl.SetTrackName('video', 2, 'Renders');
  const title = (name, words, at, end) => ({ _id: 'title-' + at, _type: 'video', _track: 2, _start: 86400 + at, _end: 86400 + end, _color: '', GetName: () => name, GetUniqueId() { return this._id; }, GetStart() { return this._start; }, GetEnd() { return this._end; },
    GetMediaPoolItem: () => null, GetClipEnabled: () => true, GetClipColor() { return this._color; }, SetClipColor(c) { this._color = c; return true; },
    GetFusionCompCount: () => (words ? 1 : 0), GetFusionCompByIndex: () => ({ GetToolList: () => ({ 1: { GetInput: k => (k === 'StyledText' ? words : '') } }) }) });
  tl._v[1].push(title('Text+', 'Teaser 30s', 0, 75), title('Lower third', '', 100, 150));
  await S.run('addRenderRange', { seqId: S.seqId, name: 'Outro', start: 8, end: 10 });
  const only = k => S.run('renderRanges', { seqId: S.seqId, kinds: k }).then(r => r.ranges.map(x => [x.name, x.start, x.end, x.kind]));
  assert.deepStrictEqual(await only('adjustment'), [['Outro', 8, 10, 'marker']], 'markers only, as before');
  assert.deepStrictEqual(await only('text'), [['Teaser 30s', 0, 3, 'text'], ['Lower third', 4, 6, 'text']], 'titles: named by their words, else the clip name');
  assert.strictEqual((await only('both')).length, 3);
  assert.deepStrictEqual((await S.run('rangeTracks', { seqId: S.seqId, kinds: 'both' })).tracks.map(t => [t.name, t.count]), [['Renders', 3]]);
  const t1 = (await S.run('renderRanges', { seqId: S.seqId, kinds: 'text' })).ranges[0];
  await S.run('editRenderRange', { seqId: S.seqId, track: 'Renders', nodeId: t1.nodeId, label: 5 });
  assert.strictEqual(tl._v[1][0]._color, 'Green');
  await assert.rejects(S.run('editRenderRange', { seqId: S.seqId, track: 'Renders', nodeId: t1.nodeId, name: 'New' }), e => e.code === 'BAD_INPUT', 'titles are renamed in the Timeline');
  assert.deepStrictEqual(await S.run('rangeTrackOutput', { seqId: S.seqId, track: 'Renders', on: false }), { track: 1, was: 1 });
  assert.strictEqual(tl.GetIsTrackEnabled('video', 2), false);
  assert.strictEqual((await S.run('renderRanges', { seqId: S.seqId, kinds: 'text' })).hidden, true);
  await S.run('rangeTrackOutput', { seqId: S.seqId, track: 'Renders', on: true });
  await S.run('removeRenderRange', { seqId: S.seqId, track: 'Renders', nodeId: t1.nodeId });
  assert.deepStrictEqual((await only('text')).map(x => x[0]), ['Lower third']);
});
