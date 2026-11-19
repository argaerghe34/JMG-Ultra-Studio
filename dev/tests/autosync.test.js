// Auto Sync: the matching on made-up sound (a "room" every device hears with its own level, noise and dullness) –
// clips land where they belong, unrelated and silent ones are left out with the reason, a second take becomes its own
// group, a steady beat (which fits everywhere) is refused rather than guessed; timecode; sorting clips into cameras
// and recorders; the tracks of the new sequence; and the whole job with a pretend editor (no Premiere, no network).
const assert = require('assert');
const path = require('path'), cp = require('child_process');
const { load, test } = require('./harness');
const US = load(['audio', 'dsp', 'js/tools/48-autosync.js']);
const A = US.autoSync, SR = 16000;
const job = () => ({ cancelled: false, set() { return this; }, progress() {}, check() {} });

function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
/** Speech-like bursts: what was going on in the room. */
function room(sec, seed) {
  const r = rng(seed), d = new Float32Array(sec * SR); let t = 0;
  while (t < sec) {
    const len = 0.08 + r() * 0.25, gap = 0.03 + r() * (r() < 0.15 ? 1.5 : 0.2), f = 150 + r() * 1500, amp = 0.2 + r() * 0.6;
    for (let i = Math.floor(t * SR), e = Math.min(d.length, Math.floor((t + len) * SR)); i < e; i++) { const x = (i / SR - t) / len; d[i] += amp * Math.sin(Math.PI * x) * (Math.sin(2 * Math.PI * f * i / SR) + 0.5 * (r() - 0.5)); }
    t += len + gap;
  }
  return d;
}
/** One device's recording of the room between two moments: its own level, hiss and (a far microphone) dullness. */
function hear(R, from, to, { gain = 1, noise = 0.02, seed = 1, dull = 0 } = {}) {
  const r = rng(seed), out = new Float32Array(Math.round((to - from) * SR)); let prev = 0;
  for (let i = 0; i < out.length; i++) { let v = R[Math.round(from * SR) + i] || 0; if (dull) { prev = prev * dull + v * (1 - dull); v = prev; } out[i] = gain * v + noise * (r() - 0.5) * 2; }
  return out;
}
const clipOf = async (key, device, data, extra) => { const fp = await A.fingerprint(data, SR); return Object.assign({ key, name: key, device, dur: data.length / SR, env: fp.env, level: fp.level }, extra); };

const R1 = room(120, 7), R2 = room(60, 99);
let SHOOT = null;
async function shoot() {
  return SHOOT || (SHOOT = [
    await clipOf('rec', 'rec', hear(R1, 0, 120, { noise: 0.005 })),
    await clipOf('A1', 'camA', hear(R1, 12.34, 50, { gain: 0.3, noise: 0.04, seed: 2, dull: 0.7 })),
    await clipOf('A2', 'camA', hear(R1, 70.5, 118, { gain: 0.3, noise: 0.04, seed: 3, dull: 0.7 })),
    await clipOf('B1', 'camB', hear(R1, 30.07, 100, { gain: 0.2, noise: 0.04, seed: 4, dull: 0.8 })),
    await clipOf('X1', 'camA', hear(R2, 0, 45, { seed: 6 })),
    await clipOf('X2', 'camB', hear(R2, 20.5, 60, { seed: 8, gain: 0.2, noise: 0.04 })),
    await clipOf('N', 'camB', hear(room(20, 1234), 0, 20, { seed: 9 })),
    await clipOf('S', 'camB', new Float32Array(10 * SR))
  ]);
}

test('auto sync: clips land where they belong (within a frame); a second take is its own group; unrelated and silent clips are left out with the reason', async () => {
  const res = await A.solve(await shoot(), {});
  assert.strictEqual(res.groups.length, 2, JSON.stringify(res.groups.map(g => g.members.map(m => m.key))));
  const [g1, g2] = res.groups, pos = g => Object.fromEntries(g.members.map(m => [m.key, m.at]));
  assert.deepStrictEqual(g1.members.map(m => m.key), ['rec', 'A1', 'B1', 'A2']);
  const p = pos(g1);
  for (const [k, want] of [['rec', 0], ['A1', 12.34], ['B1', 30.07], ['A2', 70.5]]) assert.ok(Math.abs(p[k] - want) < 0.02, `${k} at ${p[k]}, should be ${want}`);
  assert.ok(Math.abs(g1.length - 120) < 0.05);
  const q = pos(g2);
  assert.ok(Math.abs(q.X2 - q.X1 - 20.5) < 0.02, 'the second take is lined up within itself');
  assert.ok(g1.members.filter(m => m.how === 'sound').every(m => m.score >= A.MIN_SCORE && /clear|good/.test(m.sure)));
  assert.deepStrictEqual(res.loose.map(l => [l.key, l.why]), [['N', 'nomatch'], ['S', 'silent']]);
});

test('auto sync: a steady beat fits in many places – refused, never guessed; a clip too short to tell is left out', async () => {
  const B = new Float32Array(60 * SR), r = rng(5);
  for (let b = 0; b < 120; b++) for (let i = 0; i < 800; i++) B[b * SR / 2 + i] += Math.exp(-i / 200) * Math.sin(2 * Math.PI * 80 * i / SR) + 0.05 * (r() - 0.5);
  const res = await A.solve([await clipOf('whole', 'rec', hear(B, 0, 60, { noise: 0.01 })), await clipOf('part', 'cam', hear(B, 23.2, 43.2, { gain: 0.4, seed: 4 })), await clipOf('blip', 'cam', hear(R1, 5, 5.6, {}))], {});
  assert.strictEqual(res.groups.length, 0);
  assert.deepStrictEqual(res.loose.map(l => l.key + ':' + l.why).sort(), ['blip:short', 'part:unsure', 'whole:unsure'].sort());
});

test('auto sync: music that repeats bar after bar – the next bar scores nearly as well, but the right place still stands out and is taken', async () => {
  // the same two-second bar over and over, with someone talking quietly over it (the only thing that doesn't repeat)
  const bar = room(2, 404), talk = room(80, 505), M = new Float32Array(80 * SR);
  for (let i = 0; i < M.length; i++) M[i] = bar[i % bar.length] + 0.22 * talk[i];
  const ref = A.composite([{ at: 0, env: A.znorm((await A.fingerprint(hear(M, 0, 80, { noise: 0.005 }), SR)).env) }]);
  const m = A.match(ref, A.znorm((await A.fingerprint(hear(M, 11.3, 71.3, { gain: 0.4, noise: 0.02, seed: 12 }), SR)).env));
  assert.ok(m && Math.abs(m.lag / A.RATE - 11.3) < 0.02, 'found at 11.3 s: ' + JSON.stringify(m));
  assert.ok(m.ratio < A.MIN_RATIO, 'the next bar is nearly as good (ratio ' + m.ratio.toFixed(2) + ')');
  assert.ok(m.sig >= A.MIN_SIG && A.accepts(m), 'but the right place stands out (sig ' + m.sig.toFixed(1) + ')');
});

test('auto sync: no false matches between unrelated recordings; the fingerprint survives its trip through the cache', async () => {
  for (let k = 0; k < 6; k++) {
    const a = A.znorm((await A.fingerprint(hear(room(40 + k * 9, 300 + k), 0, 40 + k * 9, { seed: k }), SR)).env), b = A.znorm((await A.fingerprint(hear(room(8 + k * 5, 900 + k), 0, 8 + k * 5, { seed: 50 + k, gain: 0.3 }), SR)).env);
    const m = A.match(A.composite([{ at: 0, env: a }]), b);
    assert.ok(!A.accepts(m), `unrelated pair ${k} matched: ${JSON.stringify(m)}`);
  }
  const fp = await A.fingerprint(hear(R1, 0, 20, {}), SR), back = A.unpack(JSON.parse(JSON.stringify(A.pack(fp))));
  assert.strictEqual(back.env.length, fp.env.length);
  const m = A.match(A.composite([{ at: 0, env: A.znorm(fp.env) }]), A.znorm(back.env.subarray(500, 1500)));
  assert.ok(m && Math.abs(m.lag - 500) < 0.5 && m.r > 0.95, JSON.stringify(m));
});

test('auto sync: drift – a recorder running 0.1% fast is measured, a steady one isn’t flagged', async () => {
  const R = room(200, 21), ref = A.composite([{ at: 0, env: A.znorm((await A.fingerprint(hear(R, 0, 200, { noise: 0.005 }), SR)).env) }]);
  const steady = A.znorm((await A.fingerprint(hear(R, 10, 190, { seed: 3, gain: 0.5 }), SR)).env);
  const m1 = A.match(ref, steady), d1 = A.drift(ref, steady, m1.lag);
  assert.ok(d1 != null && Math.abs(d1) < 0.015, 'steady: ' + d1);
  // the same 180 s, played 0.1% slow (so by the end it is 0.18 s behind)
  const src = hear(R, 10, 190, { seed: 3, gain: 0.5 }), slow = new Float32Array(Math.round(src.length * 1.001));
  for (let i = 0; i < slow.length; i++) slow[i] = src[Math.min(src.length - 1, Math.round(i / 1.001))];
  const z = A.znorm((await A.fingerprint(slow, SR)).env), m2 = A.match(ref, z);
  assert.ok(m2, 'still found');
  const d2 = A.drift(ref, z, m2.lag);
  assert.ok(d2 != null && Math.abs(Math.abs(d2) - 0.12) < 0.06, 'drift between the first and last minute, about 0.12 s: ' + d2);
});

test('auto sync: timecode – overlapping clips of different devices line up by their clocks; “both” matches the rest by sound', async () => {
  const s = await shoot(), by = k => Object.assign({}, s.find(c => c.key === k));
  const clips = [Object.assign(by('rec'), { tc: 36000 }), Object.assign(by('A1'), { tc: 36012.34 }), Object.assign(by('B1'), { tc: null }), Object.assign(by('X1'), { tc: 50000 }), Object.assign(by('S'), { tc: 0 })];
  const tcOnly = await A.solve(clips, { mode: 'timecode' });
  assert.strictEqual(tcOnly.groups.length, 1);
  assert.deepStrictEqual(tcOnly.groups[0].members.map(m => [m.key, +m.at.toFixed(2), m.how]), [['rec', 0, 'timecode'], ['A1', 12.34, 'timecode']]);
  assert.deepStrictEqual(tcOnly.loose.map(l => l.key + ':' + l.why), ['B1:notimecode', 'X1:alone', 'S:notimecode']);
  const both = await A.solve(clips, { mode: 'both' });
  const g = both.groups[0], b1 = g.members.find(m => m.key === 'B1');
  assert.ok(b1 && b1.how === 'sound' && Math.abs(b1.at - 30.07) < 0.02, 'B1 joined the timecoded group by sound: ' + JSON.stringify(b1));
  assert.deepStrictEqual(both.loose.map(l => l.key).sort(), ['S', 'X1']);
  // two clips of ONE camera that overlap by timecode are not a sync
  const one = await A.solve([Object.assign(by('A1'), { tc: 100 }), Object.assign(by('A2'), { tc: 110 })], { mode: 'timecode' });
  assert.strictEqual(one.groups.length, 0);
});

const item = (id, file, o = {}) => Object.assign({ id, name: path.basename(file), path: file, kind: /\.wav$/i.test(file) ? 'audio' : 'video', hasVideo: !/\.wav$/i.test(file), hasAudio: true, duration: 60, rangeStart: 0, rangeEnd: 60, fps: 25, width: 1920, height: 1080, offline: false }, o);

test('auto sync: cameras and recorders – by card folder, else by how the files are named; stills, offline clips and sequences are left out', () => {
  const d = A.devicesFromItems([item('1', '/shoot/A CAM/PRIVATE/M4ROOT/CLIP/C0001.MP4'), item('2', '/shoot/A CAM/PRIVATE/M4ROOT/CLIP/C0002.MP4'), item('3', '/shoot/B CAM/DCIM/100MEDIA/C0001.MP4'), item('4', '/shoot/Zoom F6/TAKE01.WAV')]);
  assert.deepStrictEqual(d.map(x => [x.name, x.kind, x.keys.join()]), [['A CAM', 'camera', '1,2'], ['B CAM', 'camera', '3'], ['Recorder 1', 'recorder', '4']]);
  // everything in one folder: told apart by the file names (and the picture size)
  const e = A.devicesFromItems([item('1', '/all/C0001.MP4'), item('2', '/all/C0002.MP4'), item('3', '/all/GX010034.MP4'), item('4', '/all/DJI_0001.MP4', { width: 3840, height: 2160 }), item('5', '/all/ZOOM0001.WAV'), item('6', '/all/ZOOM0002.WAV')]);
  assert.deepStrictEqual(e.map(x => [x.name, x.keys.join()]), [['Camera A', '1,2'], ['Camera B', '4'], ['Camera C', '3'], ['Recorder 1', '5,6']]);
  const f = A.fromItems([item('1', '/a/x.mp4'), item('2', '/b/y.mp4', { rangeStart: 5, rangeEnd: 20 }), item('3', '/a/pic.jpg', { kind: 'still' }), item('4', '/a/gone.mp4', { offline: true }), item('5', '', { kind: 'sequence' })]);
  assert.strictEqual(f.clips.length, 2); assert.strictEqual(f.skipped, 3);
  assert.deepStrictEqual([f.clips[1].in, f.clips[1].out, f.clips[1].dur], [5, 20, 15]);
});

const SEQ = { id: 's1', name: 'Wedding', video: [
  { index: 0, name: 'Video 1', clips: [{ itemId: 'a', name: 'A1.mp4', path: '/m/A1.mp4', start: 0, end: 40, in: 0, out: 40 }, { itemId: 'a2', name: 'A2.mp4', path: '/m/A2.mp4', start: 40, end: 70, in: 10, out: 40 }, { itemId: 'nest', name: 'Nested', path: '', start: 70, end: 80, in: 0, out: 10, isSequence: true }] },
  { index: 1, name: 'B cam', clips: [{ itemId: 'b', name: 'B1.mp4', path: '/m/B1.mp4', start: 0, end: 60, in: 0, out: 60 }] }],
  audio: [
  { index: 0, name: 'Audio 1', clips: [{ itemId: 'a', name: 'A1.mp4', path: '/m/A1.mp4', start: 0, end: 40, in: 0, out: 40 }, { itemId: 'a2', name: 'A2.mp4', path: '/m/A2.mp4', start: 40, end: 70, in: 10, out: 40 }] },
  { index: 1, name: 'Audio 2', clips: [{ itemId: 'b', name: 'B1.mp4', path: '/m/B1.mp4', start: 0, end: 60, in: 0, out: 60 }] },
  { index: 2, name: 'Audio 3', clips: [{ itemId: 'w', name: 'F6.wav', path: '/m/F6.wav', start: 0, end: 100, in: 0, out: 100 }] }] };
const INFOS = { a: item('a', '/m/A1.mp4'), a2: item('a2', '/m/A2.mp4'), b: item('b', '/m/B1.mp4'), w: item('w', '/m/F6.wav', { duration: 100, rangeEnd: 100 }), nest: { id: 'nest', kind: 'sequence' } };

test('auto sync: from a sequence – one camera per video track, one recorder per audio track, a camera’s own sound not counted twice, trims kept', () => {
  const f = A.fromSequence(SEQ, INFOS);
  assert.deepStrictEqual(f.devices.map(d => [d.id, d.name, d.kind]), [['v0', 'Camera on V1', 'camera'], ['v1', 'B cam', 'camera'], ['a2', 'Recorder on A3', 'recorder']]);
  assert.deepStrictEqual(f.clips.map(c => [c.key, c.itemId, c.device, c.in, c.out]), [['v0:0', 'a', 'v0', 0, 40], ['v0:1', 'a2', 'v0', 10, 40], ['v1:0', 'b', 'v1', 0, 60], ['a2:0', 'w', 'a2', 0, 100]]);
  assert.strictEqual(f.skipped, 1);
});

test('auto sync: the new sequence – cameras on video tracks with their sound below in the same order, recorders after; groups apart; unplaced clips last; overlapping clips of “one” camera get a second track', () => {
  const clips = [
    { key: 'r', itemId: 'r', device: 'rec', dur: 100, in: 0, out: 100, hasAudio: true, hasVideo: false },
    { key: 'a1', itemId: 'a1', device: 'A', dur: 30, in: 0, out: 30, hasAudio: true, hasVideo: true },
    { key: 'a2', itemId: 'a2', device: 'A', dur: 30, in: 2, out: 32, hasAudio: true, hasVideo: true },
    { key: 'b1', itemId: 'b1', device: 'B', dur: 50, in: 0, out: 50, hasAudio: false, hasVideo: true },
    { key: 'x', itemId: 'x', device: 'B', dur: 10, in: 0, out: 10, hasAudio: true, hasVideo: true },
    { key: 'y', itemId: 'y', device: 'A', dur: 20, in: 0, out: 20, hasAudio: true, hasVideo: true },
    { key: 'z', itemId: 'z', device: 'rec', dur: 20, in: 0, out: 20, hasAudio: true, hasVideo: false }];
  const devices = [{ id: 'rec', name: 'Zoom', kind: 'recorder' }, { id: 'B', name: 'B cam', kind: 'camera' }, { id: 'A', name: 'A cam', kind: 'camera' }];
  const result = { groups: [{ length: 100, members: [{ key: 'r', at: 0 }, { key: 'a1', at: 10.013 }, { key: 'a2', at: 25 }, { key: 'b1', at: 40 }] }, { length: 20, members: [{ key: 'y', at: 0 }, { key: 'z', at: 0 }] }], loose: [{ key: 'x', why: 'nomatch' }] };
  const p = A.layout(result, clips, devices, { fps: 25 });
  assert.deepStrictEqual(p.tracks, { video: ['A cam (1)', 'A cam (2)', 'B cam'], audio: ['A cam (1)', 'A cam (2)', 'B cam', 'Zoom'] });
  const L = Object.fromEntries(p.layers.map(l => [l.key, l]));
  assert.deepStrictEqual([L.a1.at, L.a1.v, L.a1.a], [10, 0, 0], 'snapped to a frame of the sequence');
  assert.deepStrictEqual([L.a2.at, L.a2.v, L.a2.a, L.a2.in, L.a2.out], [25, 1, 1, 2, 32], 'overlaps a1: second track, nothing lost');
  assert.deepStrictEqual([L.b1.v, L.b1.a], [2, null], 'a camera clip without sound gets no audio layer');
  assert.deepStrictEqual([L.r.v, L.r.a, L.r.at], [null, 3, 0]);
  assert.deepStrictEqual([L.y.at, L.z.at], [105, 105], 'the second group starts after the first and a gap');
  assert.deepStrictEqual([L.x.at, L.x.v, L.x.a], [130, 2, 2], 'the clip that couldn’t be placed is last');
  assert.deepStrictEqual(p.markers.map(m => [m.start, m.name]), [[0, 'Synced group 1'], [105, 'Synced group 2'], [130, 'Not synced']]);
  assert.ok(new Set(p.rows.map(r => r.label)).size === 3, 'a colour each');
  // camera sound muted, or left out; no colours
  const m = A.layout(result, clips, devices, { cameraSound: 'mute', colour: false });
  assert.deepStrictEqual(m.mute, [0, 1, 2]); assert.ok(m.layers.every(l => l.label == null));
  const n = A.layout(result, clips, devices, { cameraSound: 'none' });
  assert.deepStrictEqual(n.tracks.audio, ['Zoom']);
  assert.deepStrictEqual(n.layers.filter(l => l.a != null).map(l => l.key).sort(), ['r', 'z']);
  // one group and nothing loose: no markers needed
  assert.deepStrictEqual(A.layout({ groups: [result.groups[0]], loose: [] }, clips, devices, {}).markers, []);
});

test('auto sync: Ask – “sync the selected clips”, by timecode, the open sequence; not Story, captions or beats', () => {
  assert.deepStrictEqual(A.matchAsk('sync the selected clips'), { mode: 'sound', from: 'selection', _score: 2.5 });
  assert.deepStrictEqual(A.matchAsk('line up the cameras with the recorder’s sound in this sequence'), { mode: 'sound', from: 'sequence', _score: 2.5 });
  assert.strictEqual(A.matchAsk('synchronise the footage by timecode').mode, 'timecode');
  assert.strictEqual(A.matchAsk('sync the clips by timecode then by sound').mode, 'both');
  for (const t of ['sync the captions', 'cut the clips to the beat', 'sync story with the project', 'make it shorter']) assert.strictEqual(A.matchAsk(t), null, t);
  const a = US.actions.get('autosync.sync');
  assert.ok(a && a.changes && a.tool === 'autosync');
});

test('auto sync: the whole job with a pretend editor – listens once per file, builds a NEW sequence, changes nothing else, reports every clip', async () => {
  const sound = { '/m/A1.mp4': hear(R1, 12.34, 52.34, { gain: 0.3, noise: 0.04, seed: 2 }), '/m/A2.mp4': hear(R1, 60, 100, { gain: 0.3, noise: 0.04, seed: 3 }), '/m/B1.mp4': hear(R1, 30.08, 90.08, { gain: 0.2, noise: 0.04, seed: 4 }), '/m/F6.wav': hear(R1, 0, 100, { noise: 0.005 }) };
  const calls = [], heard = [];
  const keep = { call: US.host.call, sound: A.io.sound, refresh: US.refreshContext };
  US.refreshContext = async () => {};
  A.io.sound = async it => { heard.push(it.path); return { data: sound[it.path], sr: SR, offset: 0 }; };
  US.host.call = async (fn, a) => {
    calls.push([fn, a]);
    if (fn === 'itemsInfo') return a.ids.map(id => INFOS[id] || null);
    if (fn === 'syncBuild') return { id: 'new1', name: a.name, placed: a.layers.length, missing: [], passes: 1, named: 0 };
    if (fn === 'openSequence') return true;
    throw new Error('unexpected command ' + fn);
  };
  try {
    const r = await A.run(job(), { sequence: SEQ }, { mode: 'sound' });
    assert.deepStrictEqual(heard.slice().sort(), Object.keys(sound).sort(), 'each file listened to once');
    assert.deepStrictEqual(calls.map(c => c[0]), ['itemsInfo', 'syncBuild', 'openSequence'], 'no command that changes the user’s sequence');
    const b = calls[1][1];
    assert.strictEqual(b.name, 'Wedding – synced'); assert.strictEqual(b.binPath, 'JMG Ultra Studio/Auto Sync'); assert.strictEqual(b.likeId, 'a');
    assert.deepStrictEqual(b.videoNames, ['B cam', 'Camera on V1']); assert.deepStrictEqual(b.audioNames, ['B cam', 'Camera on V1', 'Recorder on A3']);
    const L = Object.fromEntries(b.layers.map(l => [l.id, l]));
    for (const [id, want] of [['w', 0], ['a', 12.34], ['b', 30.08]]) assert.ok(Math.abs(L[id].at - want) <= 0.04, `${id} at ${L[id].at}, should be ${want} (to the frame)`);
    // A2 uses 10–40 s of its file, which is 70–100 s of the room
    assert.ok(Math.abs(L.a2.at - 70) <= 0.04 && L.a2.in === 10 && L.a2.out === 40, JSON.stringify(L.a2));
    assert.deepStrictEqual([L.b.v, L.b.a, L.a.v, L.a.a, L.w.v, L.w.a], [0, 0, 1, 1, null, 2]);
    assert.ok(b.layers.every(l => Math.abs(l.at * 25 - Math.round(l.at * 25)) < 1e-6), 'every clip starts on a frame');
    assert.strictEqual(r.counts.synced, 4); assert.strictEqual(r.counts.skipped, 1);
    assert.ok(/4 of 4 clips lined up in “Wedding – synced”/.test(r.summary), r.summary);
    assert.ok(r.report.every(x => x.ok && x.device && x.how));
    // a second run reads the fingerprints it kept – unless the files have no fingerprint on disk (they don't exist here)
    // nothing to line up: no sequence is made
    calls.length = 0; heard.length = 0;
    A.io.sound = async it => ({ data: hear(room(20, it.path.length * 31 + it.path.charCodeAt(4)), 0, 20, {}), sr: SR, offset: 0 });
    const none = await A.run(job(), { items: [item('p', '/x/one/P.mp4', { duration: 20, rangeEnd: 20 }), item('q', '/x/two/Q.mp4', { duration: 20, rangeEnd: 20 })] }, {});
    assert.strictEqual(none.sequence, null); assert.ok(/Nothing could be lined up/.test(none.summary));
    assert.ok(!calls.some(c => c[0] === 'syncBuild'), 'no empty sequence');
    assert.ok(none.report.every(x => !x.ok && x.how));
    // one camera only: a plain message, nothing done
    await assert.rejects(() => A.run(job(), { items: [item('p', '/x/P1.mp4'), item('q', '/x/P2.mp4')] }, {}), e => e.code === 'NOTHING_FOUND' && /one camera/.test(e.title));
    await assert.rejects(() => A.run(job(), { items: [item('p', '/x/P1.mp4')] }, {}), e => /at least two clips/.test(e.title));
  } finally { US.host.call = keep.call; A.io.sound = keep.sound; US.refreshContext = keep.refresh; }
});

test('auto sync: by timecode nothing is listened to; a clip’s timecode counts from the part it uses', async () => {
  const calls = [], keep = { call: US.host.call, sound: A.io.sound, refresh: US.refreshContext };
  US.refreshContext = async () => {};
  A.io.sound = async () => { throw new Error('listened'); };
  US.host.call = async (fn, a) => {
    calls.push([fn, a]);
    if (fn === 'itemsInfo') return a.ids.map(id => INFOS[id] || null);
    if (fn === 'syncTimecodes') return [{ id: 'a', start: 3600 }, { id: 'a2', start: 3650 }, { id: 'b', start: 3610 }, { id: 'w', start: null }];
    if (fn === 'syncBuild') return { id: 'n', name: a.name, placed: a.layers.length, missing: [] };
    return true;
  };
  try {
    const r = await A.run(job(), { sequence: SEQ }, { mode: 'timecode' });
    const L = Object.fromEntries(calls.find(c => c[0] === 'syncBuild')[1].layers.map(l => [l.id, l]));
    assert.deepStrictEqual([L.a.at, L.b.at, L.a2.at], [0, 10, 60], 'a2 uses its file from 10 s: 3650 + 10 − 3600');
    assert.strictEqual(r.counts.loose, 1);
    assert.ok(/has no timecode/.test(r.report.find(x => x.key === 'a2:0').how));
  } finally { US.host.call = keep.call; A.io.sound = keep.sound; US.refreshContext = keep.refresh; }
});

test('auto sync: the screen – in Advanced, a press builds the new sequence and shows the report', () => {
  const r = cp.spawnSync(process.execPath, [path.join(__dirname, 'autosync-ui.js')], { encoding: 'utf8', timeout: 120000 });
  const last = (r.stdout || '').trim().split('\n').pop();
  let out; try { out = JSON.parse(last); } catch (e) { throw new Error('autosync-ui.js gave no result:\n' + (r.stdout || '').slice(-1500) + (r.stderr || '').slice(-1500)); }
  assert.deepStrictEqual(out.problems, [], out.problems.join('\n'));
  assert.deepStrictEqual(out.errors, [], out.errors.join('\n'));
});
