// MC Selects in Resolve (resolve/host/mcselects.js): which angle each multicam cut shows, from the timeline's FCPXML
// export (the shape Resolve 21.2 writes, measured 18 Nov 2026), the same results as Premiere's mcRead, and mcBuild.
const assert = require('assert'), fs = require('fs'), path = require('path');
const { load, test } = require('./harness');
const { setup, asResolve, fakeJob } = require('./resolve-render-kit');
const { parseFcpxml, secs } = require('../../resolve/host/mcselects');
global.addEventListener = global.addEventListener || (() => {});
global.ResizeObserver = global.ResizeObserver || function () { return { observe() {} }; };
const US = load(['time', 'ui', 'app', 'js/tools/25-mcselects.js']);

const u = p => 'file://' + encodeURI(p);
/** An FCPXML like Resolve's: a multicam of two cameras (B in two files) and a sound angle; cuts on the spine. */
function fcpxml(dir, cuts) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE fcpxml>
<fcpxml version="1.9">
  <resources>
    <format id="r0" frameDuration="1/25s" width="1920" height="1080"/>
    <media id="r9" name="Gig &amp; crowd">
      <multicam tcFormat="NDF" format="r0" tcStart="10/1s">
        <mc-angle angleID="ang-a" name="Angle 1">
          <asset-clip ref="r1" offset="10/1s" start="0/1s" duration="100/1s" name="A001.mp4"/>
        </mc-angle>
        <mc-angle angleID="ang-b" name="Angle 2">
          <asset-clip ref="r2" offset="10/1s" start="20/1s" duration="5/1s" name="B001.mp4"/>
          <asset-clip ref="r3" offset="15/1s" start="0/1s" duration="95/1s" name="B002.mp4"/>
        </mc-angle>
        <mc-angle angleID="ang-s" name="Angle 3">
          <asset-clip ref="r4" offset="10/1s" start="0/1s" duration="100/1s" name="lav.wav"/>
        </mc-angle>
      </multicam>
    </media>
    <asset id="r1" hasVideo="1" hasAudio="1" start="0/1s" name="A001.mp4"><media-rep kind="original-media" src="${u(path.join(dir, 'A001.mp4'))}"/></asset>
    <asset id="r2" hasVideo="1" start="0/1s" name="B001.mp4"><media-rep kind="original-media" src="${u(path.join(dir, 'B001.mp4'))}"/></asset>
    <asset id="r3" hasVideo="1" start="0/1s" name="B002.mp4"><media-rep kind="original-media" src="${u(path.join(dir, 'B002.mp4'))}"/></asset>
    <asset id="r4" hasAudio="1" start="0/1s" name="lav.wav"><media-rep kind="original-media" src="${u(path.join(dir, 'lav.wav'))}"/></asset>
  </resources>
  <library><event name="E"><project name="P"><sequence format="r0" tcStart="3600/1s"><spine>
${cuts.map(([at, len, from, ang, audio]) => `    <mc-clip ref="r9" offset="${(3600 + at) * 25}/25s" start="${(10 + from) * 25}/25s" duration="${len * 25}/25s" name="Gig">
      <mc-source angleID="${ang}" srcEnable="${audio ? 'video' : 'all'}"/>${audio ? `\n      <mc-source angleID="${audio}" srcEnable="audio"/>` : ''}
    </mc-clip>`).join('\n')}
    <gap offset="3700/1s" duration="1/1s"><mc-clip ref="r9" lane="1" offset="3700/1s" start="10/1s" duration="1/1s"><mc-source angleID="ang-b" srcEnable="all"/></mc-clip></gap>
  </spine></sequence></project></event></library>
</fcpxml>`;
}

test('FCPXML times and the active angle of every cut on the spine (video source wins; connected clips left out)', () => {
  assert.strictEqual(secs('361/24s'), 361 / 24); assert.strictEqual(secs('5s'), 5); assert.strictEqual(secs('0s'), 0); assert.strictEqual(secs(''), 0);
  const x = parseFcpxml(fcpxml('/m', [[0, 2, 0, 'ang-a'], [2, 3, 2, 'ang-b', 'ang-s'], [5, 1, 5, 'nope']]));
  assert.deepStrictEqual(x.cuts.map(c => [c.offset, c.at, c.in, c.out, c.angle]), [[3600, 0, 0, 2, 0], [3602, 2, 2, 5, 1], [3605, 5, 5, 6, null]]);
  const mc = x.multicams.r9;
  assert.strictEqual(mc.name, 'Gig & crowd');
  assert.deepStrictEqual(mc.angles.map(a => a.clips.map(c => [c.name, c.path, c.start, c.end, c.in, c.video])), [
    [['A001.mp4', '/m/A001.mp4', 0, 100, 0, true]],
    [['B001.mp4', '/m/B001.mp4', 0, 5, 20, true], ['B002.mp4', '/m/B002.mp4', 5, 100, 0, true]],
    [['lav.wav', '/m/lav.wav', 0, 100, 0, false]]]);
});

function withMulticam(cuts) {
  const S = setup(), fps = 25;
  const [a, b1, b2] = ['A001.mp4', 'B001.mp4', 'B002.mp4'].map(n => { const f = path.join(S.dir, n); fs.writeFileSync(f, 'x'); return S.F.addMedia(f, { frames: 2500 }); });
  const mc = S.F.addMedia(path.join(S.dir, 'Gig'), { type: 'Multicam', frames: 2500, name: 'Gig' });
  const still = S.F.addMedia(path.join(S.dir, 'logo.png'), { type: 'Still', frames: 125 });
  const tl = S.F.addTimeline('Gig edit', cuts.map(([at, len, from]) => ({ item: mc, in: from * fps, out: (from + len) * fps, at: at * fps })).concat([{ item: still, in: 0, out: 25, at: 20 * fps }]));
  const exported = [];
  tl.Export = (file, type) => { exported.push([file, type]); fs.writeFileSync(file, fcpxml(S.dir, cuts)); return true; };
  return Object.assign(S, { a, b1, b2, mc, tl, exported, seqId: tl.GetUniqueId() });
}

test('mcRead in Resolve: Premiere’s shape, each cut with its angle; the FCPXML is a temporary file, deleted after', async () => {
  const S = withMulticam([[0, 2, 0, 'ang-a'], [2, 3, 2, 'ang-b'], [5, 2, 5, 'ang-a']]);
  const r = await S.run('mcRead', { seqId: S.seqId });
  assert.strictEqual(r.name, 'Gig edit'); assert.strictEqual(r.other, 1, 'the still on V1 isn’t a multicam cut');
  assert.deepStrictEqual(r.cuts.map(c => [c.start, c.end, c.in, c.out, c.angle, c.startTicks, c.mcId]), [
    [0, 2, 0, 2, 0, '86400', S.mc.GetUniqueId()], [2, 5, 2, 5, 1, '86450', S.mc.GetUniqueId()], [5, 7, 5, 7, 0, '86525', S.mc.GetUniqueId()]]);
  const m = r.multicams[S.mc.GetUniqueId()];
  assert.strictEqual(m.found, true);
  assert.deepStrictEqual(m.angles.map(a => a.clips.map(c => [c.itemId, c.start, c.end, c.in])), [
    [[S.a.GetUniqueId(), 0, 100, 0]], [[S.b1.GetUniqueId(), 0, 5, 20], [S.b2.GetUniqueId(), 5, 100, 0]], []], 'the sound angle has no pictures');
  assert.strictEqual(S.exported.length, 1); assert.strictEqual(S.exported[0][1], 5, 'FCPXML 1.9 (Resolve 21’s number for it)');
  assert.ok(!fs.existsSync(S.exported[0][0]), 'temporary file removed');
});

test('mcRead in Resolve: no multicam on V1 means nothing is exported', async () => {
  const S = setup(), f = path.join(S.dir, 'A.mp4'); fs.writeFileSync(f, 'x');
  const a = S.F.addMedia(f, { frames: 250 }), tl = S.F.addTimeline('Plain', [{ item: a, in: 0, out: 50 }]);
  let asked = 0; tl.Export = () => { asked++; return true; };
  const r = await S.run('mcRead', { seqId: tl.GetUniqueId() });
  assert.deepStrictEqual([r.cuts.length, r.other, asked], [0, 1, 0]);
});

test('MC Selects in Resolve: the panel takes the angles from mcRead (no project file), keeps the chosen cameras, builds a coloured timeline', async () => {
  const S = withMulticam([[0, 2, 0, 'ang-a'], [2, 6, 2, 'ang-b'], [8, 2, 8, 'ang-a']]);
  const R = asResolve(US, S.host);
  try {
    const job = fakeJob();
    const e = await US.mcSelects.readEdit(S.seqId, job);
    assert.deepStrictEqual(e.cams.map(c => [c.name, c.cuts, c.seconds]), [['A001.mp4', 2, 4], ['B001.mp4 +1 more', 1, 6], ['Camera 3 (empty)', 0, 0]]);
    assert.ok(!R.calls.some(c => c[0] === 'storyProjectFile'), 'no project file in Resolve');
    const r = await US.mcSelects.build(S.seqId, { cameras: { 'A001.mp4': { keep: false }, 'B001.mp4 +1 more': { keep: true, label: '13' } }, audio: false }, job);
    // camera B from 2 to 8 s of the multicam: B001 22–25, then B002 0–3
    assert.deepStrictEqual(r.pieces.map(p => [p.itemId, p.in, p.out, p.label]), [[S.b1.GetUniqueId(), 22, 25, 13], [S.b2.GetUniqueId(), 0, 3, 13]]);
    const made = S.F.timelines.find(t => t.GetUniqueId() === r.seqId);
    assert.ok(made && /MC Selects/.test(made.GetName()));
    assert.deepStrictEqual(made.GetItemListInTrack('video', 1).map(i => [i.GetName(), i.GetStart() - 86400, i.GetEnd() - 86400, i.GetClipColor()]), [['B001.mp4', 0, 75, 'Green'], ['B002.mp4', 75, 150, 'Green']]);
    assert.strictEqual(made.GetItemListInTrack('audio', 1).length, 0, 'picture only');
  } finally { R.restore(); }
});
