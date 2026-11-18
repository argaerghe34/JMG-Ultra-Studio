// Resolve: Ask › Edit's and Quick effects' commands (resolve/host/edit.js) against the stand-in Resolve, made to act
// like Resolve 21.2 (AddTransition, SetSpeed, AudioVolume, AddEffect, SetName, Timeline.GetSelectedClips – from
// Resolve's scripting changelog, their presence checked in 21.2.0.6): flips, names, the selection, transitions at the
// cuts and at the ends, speed from the end, volume relative to the clip's, effects by Premiere's or Resolve's names,
// and what Resolve has nothing like said plainly. The real behaviour is checked by the e2e test 51-quickfx in Resolve.
const assert = require('assert');
const { test } = require('./harness');
const Fake = require('./resolve-fake'), HOST = require('../../resolve/host');

const LIBRARY = [
  { id: 'Open FX/FxFactory Pro Blur/Gaussian Blur', category: 'ofx', name: 'Gaussian Blur' },
  { id: 'Resolve FX/Resolve FX Blur/Gaussian Blur', category: 'ofx', name: 'Gaussian Blur' },
  { id: 'Resolve FX/Resolve FX Blur/Mosaic Blur', category: 'ofx', name: 'Mosaic Blur' },
  { id: 'Fusion/Fusion Effects/CCTV', category: 'fusion', name: 'CCTV' }
];
/** The stand-in's clips and timeline given what Resolve 21.2 has. */
function as212(F, tl) {
  F.resolve.GetEffectsList = kind => (kind === 'audio' ? [{ id: 'Noise Reduction', category: 'audio', name: 'Noise Reduction' }] : LIBRARY.slice());
  tl.GetSelectedClips = () => F.tlSelected || [];
  tl._transitions = [];
  for (const kind of ['video', 'audio']) for (let t = 1; t <= tl.GetTrackCount(kind); t++) for (const ti of tl.GetItemListInTrack(kind, t)) {
    ti._props.FlipX = false; ti._props.FlipY = false; ti._props.AudioVolume = 0; ti._props.AudioVolumeEnabled = true; ti._speed = 100; ti._fx = [];
    ti.GetType = () => kind;
    ti.SetName = n => { ti._label = n; return true; };
    // like Resolve 21.2 (measured): all four strings needed; 'center' at a start needs media before the clip's first frame;
    // the transition then shows among the track's items, starting where it sits
    ti.AddTransition = o => {
      if (!['type', 'category', 'position', 'alignment'].every(k => typeof o[k] === 'string')) throw new Error('Execute: AddTransition: Error response (errorStr:type, category, position and alignment must be strings) (errorCode:2)');
      if (o.category !== (kind === 'audio' ? 'audio' : 'simple')) throw new Error('Execute: AddTransition: Error response (errorStr:unrecognized category) (errorCode:2)');
      if (o.type === 'Nope' || (o.alignment === 'center' && o.position === 'start' && ti._srcStart === 0)) throw new Error('Execute: AddTransition: Error response (errorStr:failed to place transition) (errorCode:6)');
      tl._transitions.push(Object.assign({ item: ti.GetName(), start: ti.GetStart() }, o));
      const at = o.position === 'start' ? ti._start : ti._end - o.duration;
      const tr = { _start: at, _end: at + o.duration, GetType: () => 'transition', GetName: () => o.type, GetStart: () => tr._start, GetEnd: () => tr._end, GetMediaPoolItem: () => null, GetUniqueId: () => 'tr' + at, GetClipEnabled: () => true };
      tl.GetItemListInTrack(kind, t); (kind === 'video' ? tl._v : tl._a)[t - 1].push(tr);
      return tr;
    };
    ti.SetSpeed = o => { if (!(o.Percentage > 0)) return false; const len = ti._end - ti._start, nl = Math.round(len * 100 / o.Percentage); ti._speed = o.Percentage; if (o.RippleTimeline) for (const x of tl.GetItemListInTrack(kind, t)) if (x._start >= ti._end) { x._start += nl - len; x._end += nl - len; } ti._end = ti._start + nl; return true; };
    ti.GetSpeed = () => ({ Percentage: ti._speed, PitchCorrection: true });
    ti.AddEffect = (cat, id) => { const e = LIBRARY.concat([{ id: 'Noise Reduction', category: 'audio', name: 'Noise Reduction' }]).find(x => x.id === id && x.category === cat); if (!e) return null; const fx = { GetInfo: () => Object.assign({}, e) }; ti._fx.push(fx); return fx; };
    ti.GetEffects = cat => ti._fx.filter(f => f.GetInfo().category === cat);
  }
}
function setup() {
  const F = Fake.make(), host = HOST.connect({ api: F.resolve });
  const run = async (n, a) => { const r = await host.run(n, a); if (!r.ok) throw new Error(`${n}: ${r.error.code} ${r.error.detail}`); return r.data; };
  const a = F.addMedia('/m/A.mp4', { frames: 2500 }), b = F.addMedia('/m/B.mp4', { frames: 2500 }), c = F.addMedia('/m/C.mp4', { frames: 2500 });
  // 0–4 s, 4–6 s, 6–10 s on V1 and A1 at 25 fps
  const tl = F.addTimeline('Cut', [{ item: a, in: 0, out: 100 }, { item: b, in: 0, out: 50 }, { item: c, in: 0, out: 100 }]);
  as212(F, tl);
  return { F, tl, run, seqId: tl.GetUniqueId(), v: start => ({ kind: 'video', track: 0, start }), au: start => ({ kind: 'audio', track: 0, start }), item: (k, i) => tl.GetItemListInTrack(k, 1)[i] };
}

test('flip: an Inspector switch (FlipX / FlipY) in any Resolve, read back as Premiere names the effect; not on sound', async () => {
  const S = setup();
  const r = await S.run('editApply', { seqId: S.seqId, op: 'effect', params: { name: 'Horizontal Flip' }, targets: [S.v(0), S.v(4), S.au(0)] });
  assert.deepStrictEqual([r.done, r.skipped.map(x => x.why)], [2, ['a flip is for picture']]);
  await S.run('editApply', { seqId: S.seqId, op: 'effect', params: { name: 'vertical flip' }, targets: [S.v(6)] });
  assert.deepStrictEqual([0, 1, 2].map(i => [S.item('video', i).GetProperty('FlipX'), S.item('video', i).GetProperty('FlipY')]), [[true, false], [true, false], [false, true]]);
  const info = await S.run('editRead', { seqId: S.seqId });
  assert.deepStrictEqual(info.video[0].clips.map(c => c.effects), [['Horizontal Flip'], ['Horizontal Flip'], ['Vertical Flip']]);
  // an older Resolve without the new methods still flips
  for (const k of ['AddEffect', 'GetEffects']) delete S.item('video', 0)[k];
  assert.strictEqual((await S.run('editApply', { seqId: S.seqId, op: 'effect', params: { name: 'Vertical Flip' }, targets: [S.v(0)] })).done, 1);
});

test('rename: timeline clips get the name (SetName); an older Resolve says which version can', async () => {
  const S = setup();
  const r = await S.run('editApply', { seqId: S.seqId, op: 'rename', params: { name: 'Answer 1' }, targets: [S.v(0)] });
  assert.deepStrictEqual([r.done, S.item('video', 0)._label], [1, 'Answer 1']);
  assert.strictEqual((await S.run('editApply', { seqId: S.seqId, op: 'rename', params: { name: ' ' }, targets: [S.v(4)] })).skipped[0].why, 'no name given');
  delete S.item('video', 2).SetName;
  const old = await S.run('editApply', { seqId: S.seqId, op: 'rename', params: { name: 'X' }, targets: [S.v(6)] });
  assert.ok(old.unsupported && /Resolve 20\.2 or later/.test(old.why) && !old.done, old.why);
});

test('rename in a bin: renameItem works in every Resolve (the Media Pool clip)', async () => {
  const S = setup(), id = S.item('video', 0).GetMediaPoolItem().GetUniqueId();
  assert.strictEqual(await S.run('renameItem', { id, name: 'Ruth answer' }), true);
  assert.strictEqual(S.item('video', 0).GetMediaPoolItem().GetName(), 'Ruth answer');
});

test('the selection: the clips selected in the Timeline (21.0.4), video before sound; none selected – the clip under the playhead', async () => {
  const S = setup();
  S.F.tlSelected = [S.item('audio', 1), S.item('video', 2), S.item('video', 1)];
  assert.deepStrictEqual((await S.run('editSelection', { seqId: S.seqId })).map(x => [x.kind, x.track, x.start, !!x.underPlayhead]), [['video', 0, 4, false], ['video', 0, 6, false], ['audio', 0, 4, false]]);
  S.F.tlSelected = [];
  S.tl._playhead = S.tl.GetStartFrame() + 125;   // 5 s in
  assert.deepStrictEqual((await S.run('editSelection', { seqId: S.seqId })).map(x => [x.start, x.underPlayhead]), [[4, true]]);
});

test('transitions: Premiere’s names in Resolve’s words, across a cut (centre) or inside the clip at an outer end; both ends; plain refusals', async () => {
  const S = setup();
  const r = await S.run('editApply', { seqId: S.seqId, op: 'transition', params: { name: 'Cross Dissolve', at: 'start', frames: 12 }, targets: [S.v(4), S.v(6)] });
  assert.strictEqual(r.done, 2);
  assert.deepStrictEqual(S.tl._transitions.map(t => [t.item, t.type, t.category, t.position, t.alignment, t.duration]), [['B.mp4', 'Cross Dissolve', 'simple', 'start', 'right', 12], ['C.mp4', 'Cross Dissolve', 'simple', 'start', 'right', 12]], 'B and C start at their media’s first frame: no room across the cut, so the dissolve starts on it');
  const info = await S.run('editRead', { seqId: S.seqId });
  assert.deepStrictEqual(info.video[0].clips.map(c => c.name), ['A.mp4', 'B.mp4', 'C.mp4'], 'transitions aren’t read as clips');
  assert.strictEqual((await S.run('editApply', { seqId: S.seqId, op: 'motion', params: { scale: 120 }, targets: [S.v(4)] })).done, 1);
  assert.strictEqual(S.tl.GetItemListInTrack('video', 1).find(i => i.GetName() === 'B.mp4').GetProperty('ZoomX'), 1.2, 'the clip, not the transition starting with it');
  S.tl._transitions.length = 0;
  await S.run('editApply', { seqId: S.seqId, op: 'transition', params: { name: 'Dip to Black', at: 'both', seconds: 1 }, targets: [S.v(0)] });
  assert.deepStrictEqual(S.tl._transitions.map(t => [t.type, t.position, t.alignment, t.duration]), [['Dip To Color Dissolve', 'start', 'right', 25], ['Dip To Color Dissolve', 'end', 'center', 25]], 'the timeline’s first frame: inside the clip; the cut: across it');
  S.tl._transitions.length = 0;
  await S.run('editApply', { seqId: S.seqId, op: 'transition', params: { name: 'Constant Power', at: 'end' }, targets: [S.au(6)] });
  assert.deepStrictEqual(S.tl._transitions.map(t => [t.type, t.category, t.alignment, t.duration]), [['Cross Fade +3 dB', 'audio', 'left', 13]], 'sound fades; half a second by default');
  const film = await S.run('editApply', { seqId: S.seqId, op: 'transition', params: { name: 'Film Dissolve' }, targets: [S.v(0)] });
  assert.ok(film.unsupported && /Resolve has no Film Dissolve transition – try Cross Dissolve/.test(film.why));
  const nope = await S.run('editApply', { seqId: S.seqId, op: 'transition', params: { name: 'Nope', at: 'start' }, targets: [S.v(4)] });
  assert.deepStrictEqual([nope.done, /Resolve didn’t add “Nope”/.test(nope.skipped[0].why)], [0, true]);
});

test('speed: SetSpeed with the timeline rippled, from the last clip back, read back; volume: dB added to the clip’s own, sound only', async () => {
  const S = setup();
  const r = await S.run('editApply', { seqId: S.seqId, op: 'speed', params: { percent: 50 }, targets: [S.v(0), S.v(4)] });
  assert.strictEqual(r.done, 2);
  assert.deepStrictEqual(S.tl.GetItemListInTrack('video', 1).map(i => [i.GetStart() - 86400, i.GetEnd() - 86400]), [[0, 200], [200, 300], [300, 400]], 'each twice as long, the rest moved along');
  const info = await S.run('editRead', { seqId: S.seqId });
  assert.deepStrictEqual(info.video[0].clips.map(c => c.start), [0, 8, 12]);
  S.item('audio', 0)._props.AudioVolume = -2;
  const v = await S.run('editApply', { seqId: S.seqId, op: 'volume', params: { db: -3 }, targets: [S.au(0), S.v(0)] });
  assert.deepStrictEqual([v.done, v.skipped.map(x => x.why), S.item('audio', 0).GetProperty('AudioVolume')], [1, ['volume is for sound clips'], -5]);
  assert.strictEqual((await S.run('editRead', { seqId: S.seqId })).audio[0].clips[0].volume, -5);
  delete S.item('audio', 1)._props.AudioVolume;   // Resolve before 21.1 has no such property
  const old = await S.run('editApply', { seqId: S.seqId, op: 'volume', params: { db: 3 }, targets: [S.au(4)] });
  assert.ok(old.unsupported && /Resolve 21\.1 or later lets add-ons make volume changes/.test(old.why));
});

test('effects: found in the Effects Library by Premiere’s or Resolve’s name (Resolve FX first), read back; what Resolve does elsewhere is said', async () => {
  const S = setup();
  assert.strictEqual((await S.run('editApply', { seqId: S.seqId, op: 'effect', params: { name: 'Gaussian Blur' }, targets: [S.v(0)] })).done, 1);
  assert.strictEqual((await S.run('editApply', { seqId: S.seqId, op: 'effect', params: { name: 'Mosaic' }, targets: [S.v(4)] })).done, 1);
  assert.strictEqual((await S.run('editApply', { seqId: S.seqId, op: 'effect', params: { name: 'cctv' }, targets: [S.v(6)] })).done, 1);
  assert.deepStrictEqual(S.item('video', 0)._fx.map(f => f.GetInfo().id), ['Resolve FX/Resolve FX Blur/Gaussian Blur']);
  assert.deepStrictEqual((await S.run('editRead', { seqId: S.seqId })).video[0].clips.map(c => c.effects), [['Gaussian Blur'], ['Mosaic Blur'], ['CCTV']]);
  const bw = await S.run('editApply', { seqId: S.seqId, op: 'effect', params: { name: 'Black & White' }, targets: [S.v(0)] });
  assert.ok(bw.unsupported && /Color page/.test(bw.why));
  const odd = await S.run('editApply', { seqId: S.seqId, op: 'effect', params: { name: 'Glow Deluxe' }, targets: [S.v(0)] });
  assert.ok(!odd.done && /Effects Library has no “Glow Deluxe”/.test(odd.skipped[0].why));
  assert.strictEqual((await S.run('editApply', { seqId: S.seqId, op: 'effect', params: { name: 'DeNoise' }, targets: [S.au(0)] })).done, 1, 'a sound effect from the audio list');
});

test('never by script: keyframed zooms, text layers and cuts come back unsupported with nothing changed', async () => {
  const S = setup();
  for (const op of ['zoom', 'text', 'razor']) {
    const r = await S.run('editApply', { seqId: S.seqId, op, params: {}, targets: [S.v(0)] });
    assert.ok(r.unsupported && /Resolve doesn’t let add-ons add/.test(r.why) && !r.done, op);
  }
  assert.strictEqual(S.item('video', 0).GetProperty('ZoomX'), 1);
});
