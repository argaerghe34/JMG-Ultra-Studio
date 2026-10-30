// Podcast: who is speaking from each mic's own levels (bleed loses), the editor's rules (shortest and longest shot,
// "mm-hm"s ignored, wides on crosstalk and at the ends, reaction shots), unticked switches, and Resolve's podSwitch.
const assert = require('assert');
const { load, test } = require('./harness');
global.addEventListener = global.addEventListener || (() => {});
global.ResizeObserver = global.ResizeObserver || function () { return { observe() {} }; };
const US = load(['time', 'audio', 'dsp', 'ui', 'app', 'js/tools/11-audio-kit.js', 'js/tools/28-podcast.js']);
const P = US.podcast;

// levels every 20 ms: who talks when (seconds); a talker's own mic at -20 dB, bleed into the other mics at -38, quiet -60
function mics(script, n, dur) {
  const f = Math.round(dur / 0.02), envs = Array.from({ length: n }, () => new Float32Array(f).fill(-60));
  for (const [who, a, b] of script) for (let i = Math.round(a / 0.02); i < Math.round(b / 0.02); i++) for (let m = 0; m < n; m++) envs[m][i] = Math.max(envs[m][i], m === who ? -20 + (i % 7) * 0.3 : -38);
  return envs;
}

test('who speaks: each mic against its own levels – the voice bleeding into another mic loses; two at once is crosstalk', () => {
  const envs = mics([[0, 0, 10], [1, 10, 20], [0, 20, 25], [1, 22, 25]], 2, 30);
  const r = P.speakerRuns(envs).runs.map(x => [Math.round(x.start), Math.round(x.end), x.who]);
  assert.deepStrictEqual(r, [[0, 10, 0], [10, 20, 1], [20, 22, 0], [22, 25, 'cross'], [25, 30, 'none']]);
});

test('the rules: wides at the ends, a cut a few frames after the voice, “mm-hm”s ignored, wide on crosstalk, shortest and longest shot', () => {
  const setup = { cameras: [{ track: 0, shows: 'wide' }, { track: 1, shows: 0 }, { track: 2, shows: 1 }], names: { 0: 'Ruth', 1: 'Sam' } };
  const runs = [{ start: 0, end: 30, who: 0 }, { start: 30, end: 30.6, who: 1 }, { start: 30.6, end: 40, who: 0 }, { start: 40, end: 70, who: 1 }, { start: 70, end: 72, who: 'cross' }, { start: 72, end: 73, who: 1 }, { start: 73, end: 90, who: 0 }];
  const segs = P.plan(runs, setup, { maxHold: 20, minHold: 2.5, delayFrames: 3, reactions: true, introWide: 3, outroWide: 3 }, { duration: 90, fps: 25 });
  const cams = segs.map(s => s.camera);
  assert.strictEqual(segs[0].camera, 0, 'opens wide'); assert.strictEqual(segs[0].end, 3);
  assert.strictEqual(segs[segs.length - 1].camera, 0, 'closes wide'); assert.strictEqual(segs[segs.length - 1].start, 87);
  assert.ok(!segs.some(s => s.camera === 2 && s.start >= 30 && s.start < 31), 'Sam’s 0.6 s “mm-hm” gets no shot');
  const sam = segs.find(s => s.camera === 2 && /Sam speaks/.test(s.why));
  assert.ok(Math.abs(sam.start - (40 + 3 / 25)) < 1e-9, 'cut 3 frames after Sam starts');
  assert.ok(segs.some(s => /reaction/.test(s.why)), 'a long answer gets a reaction shot');
  assert.ok(segs.every((s, i) => i === 0 || i === segs.length - 1 || s.end - s.start >= 2.5 - 1e-9), 'no shot under the shortest');
  assert.ok(segs.every(s => s.end - s.start <= 20 + 2.5 + 1e-9 || s.camera === 0), 'none held much past the longest');
  assert.ok(cams.includes(0) && cams.includes(1) && cams.includes(2));
  const same = P.plan(runs, setup, { maxHold: 20, seed: 7 }, { duration: 90 }), again = P.plan(runs, setup, { maxHold: 20, seed: 7 }, { duration: 90 });
  assert.deepStrictEqual(same, again, 'the same seed gives the same edit');
});

test('switches as a review list; unticking one keeps the shot before; stats', () => {
  const segs = [{ start: 0, end: 5, camera: 0, why: 'Opening wide' }, { start: 5, end: 12, camera: 1, why: 'Ruth speaks' }, { start: 12, end: 20, camera: 2, why: 'Sam speaks' }, { start: 20, end: 30, camera: 1, why: 'Ruth speaks' }];
  const items = P.switches(segs, { 0: 'Wide', 1: 'Ruth', 2: 'Sam' });
  assert.deepStrictEqual(items.map(x => x.title), ['→ Ruth', '→ Sam', '→ Ruth']);
  items[1].on = false;
  assert.deepStrictEqual(P.applyTicks(segs, items).map(s => [s.start, s.end, s.camera]), [[0, 5, 0], [5, 30, 1]], 'no Sam: Ruth carries on (and the next Ruth joins)');
  const st = P.stats(segs);
  assert.deepStrictEqual([st.shots, st.average, st.share[1]], [4, 7.5, 17]);
});

/* ---------- Resolve's podSwitch against the stand-in ---------- */
const Fake = require('./resolve-fake'), HOST = require('../../resolve/host');
test('Resolve: each camera track laid again in pieces at the switches, only the active one switched on', async () => {
  const F = Fake.make(), host = HOST.connect({ api: F.resolve });
  const run = async (n, a) => { const r = await host.run(n, a); if (!r.ok) throw new Error(`${n}: ${r.error.code} ${r.error.detail}`); return r.data; };
  const a = F.addMedia('/m/CamA.mp4', { frames: 2500 }), b = F.addMedia('/m/CamB.mp4', { frames: 2500 });
  const tl = F.addTimeline('Pod', [{ item: a, in: 0, out: 750 }]);
  // camera B stacked on V2 for the same 30 s
  tl.AddTrack('video');
  F.resolve.GetProjectManager().GetCurrentProject().GetMediaPool().AppendToTimeline([{ mediaPoolItem: b, startFrame: 0, endFrame: 750, trackIndex: 2, recordFrame: tl.GetStartFrame(), mediaType: 1 }]);
  const r = await run('podSwitch', { seqId: tl.GetUniqueId(), cameras: [0, 1], segments: [{ start: 0, end: 10, camera: 0 }, { start: 10, end: 20, camera: 1 }, { start: 20, end: 30, camera: 0 }] });
  const v1 = tl.GetItemListInTrack('video', 1), v2 = tl.GetItemListInTrack('video', 2);
  assert.deepStrictEqual(v1.map(x => [x.GetStart() - tl.GetStartFrame(), x.GetEnd() - tl.GetStartFrame(), x.GetClipEnabled()]), [[0, 250, true], [250, 500, false], [500, 750, true]]);
  assert.deepStrictEqual(v2.map(x => x.GetClipEnabled()), [false, true, false]);
  assert.deepStrictEqual(v2.map(x => x._srcStart), [0, 250, 500], 'each piece plays from the same source time');
  assert.deepStrictEqual([r.on, r.off], [3, 3]);
});

test('cameras follow their mic by track (a mic added or removed changes nothing); on/off switches mean the usual lengths; no overlaps at the start', () => {
  const runs = [{ start: 0, end: 1, who: 1 }, { start: 1, end: 30, who: 0 }, { start: 30, end: 60, who: 1 }];
  // mics on A2 and A3 (A1 was the music, now left out): V2 shows the person on A2, V3 the one on A3
  const setup = { mics: [{ track: 1, name: 'Ruth' }, { track: 2, name: 'Sam' }], cameras: [{ track: 0, shows: 'wide' }, { track: 1, shows: 1 }, { track: 2, shows: 2 }] };
  const segs = P.plan(runs, setup, { introWide: false, wideOnSilence: true, maxHold: 0, minHold: 0.5 }, { duration: 60, fps: 25 });
  assert.deepStrictEqual(segs.map(s => s.camera), [2, 1, 2], 'no opening or closing wide when switched off; Ruth (A2) on V2');
  const on = P.plan(runs, setup, { introWide: true, maxHold: 0, minHold: 0.5 }, { duration: 60, fps: 25 });
  assert.strictEqual(on[0].camera, 0); assert.strictEqual(on[0].end, 3, 'on = a 3 s opening wide');
  assert.strictEqual(on[on.length - 1].camera, 0); assert.strictEqual(on[on.length - 1].start, 57, '…and a 3 s closing one');
  for (let i = 1; i < on.length; i++) assert.ok(on[i].start >= on[i - 1].end - 1e-9 && on[i].start === on[i - 1].end, `no overlap at ${i}`);
});
