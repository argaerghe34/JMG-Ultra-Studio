const assert = require('assert');
const { load, test } = require('./harness');
const US = load(['js/tools/24-cameras.js']);
const C = US.cameras;
const covers = (shots, d) => { assert.strictEqual(shots[0].start, 0); assert.ok(Math.abs(shots[shots.length - 1].end - d) < 1e-9); for (let i = 1; i < shots.length; i++) assert.ok(Math.abs(shots[i].start - shots[i - 1].end) < 1e-9 && shots[i].cam !== shots[i - 1].cam); };

test('camera tracks: angles that run for most of the sequence, not labels, guides or B-roll', () => {
  const clip = (s, e, extra) => Object.assign({ name: 'cam.mov', path: '/c.mov', start: s, end: e }, extra);
  const info = { duration: 100, video: [{ index: 0, name: 'Video 1', clips: [clip(0, 100)] }, { index: 1, name: 'Video 2', clips: [clip(0, 60), clip(62, 98)] },
    { index: 2, name: 'B-roll', clips: [clip(0, 100)] }, { index: 3, name: 'Video 4', clips: [clip(0, 100, { name: 'Ultra Guide 9x16' })] }, { index: 4, name: 'Video 5', clips: [clip(10, 20)] }] };
  assert.deepStrictEqual(C.cameraTracks(info), [0, 1]);
});

test('cut points: between lines, and in pauses', () => {
  const e = [{ start: 1, end: 4 }, { start: 4.2, end: 9 }, { start: 11, end: 15 }];
  assert.deepStrictEqual(C.cutPoints({ entries: e, duration: 20 }), [4.1, 10.75]);
  assert.deepStrictEqual(C.cutPoints({ pauses: [{ start: 5, end: 6 }], duration: 20 }), [5.5]);
});

test('alternate: shots between min and max, at cut points, round the cameras', () => {
  const pts = []; for (let t = 2.5; t < 60; t += 2.5) pts.push(t);
  const shots = C.planShots({ duration: 60, points: pts, cams: [0, 1], min: 4, max: 12 });
  covers(shots, 60);
  assert.strictEqual(shots[0].cam, 0, 'starts on the first camera');
  for (const s of shots.slice(0, -1)) { const d = s.end - s.start; assert.ok(d >= 4 - 1e-9 && d <= 12 + 1e-9, d); assert.ok(pts.includes(s.end), 'cuts on a cut point: ' + s.end); }
  assert.ok(new Set(shots.map(s => +(s.end - s.start).toFixed(1))).size > 1, 'lengths vary');
  // no cut points at all: cuts at the longest length, and never a tiny last shot
  const plain = C.planShots({ duration: 30, points: [], cams: [0, 1, 2], min: 4, max: 12 });
  assert.deepStrictEqual(plain.map(s => [s.start, s.end, s.cam]), [[0, 12, 0], [12, 24, 1], [24, 30, 2]]);
  const tail = C.planShots({ duration: 26, points: [], cams: [0, 1], min: 4, max: 12 });
  assert.deepStrictEqual(tail.map(s => s.end), [12, 26], 'the last 2 s join the shot before');
});

test('speaker: each person’s camera, short replies stay on the shot, long answers cut to the wide and back', () => {
  const turns = [{ start: 0.5, end: 8, speaker: 'Q' }, { start: 8.5, end: 9.5, speaker: 'R' }, { start: 10, end: 12, speaker: 'Q' }, { start: 12.5, end: 60, speaker: 'R' }];
  const pts = []; for (let t = 15; t < 60; t += 3) pts.push(t);
  const shots = C.planShots({ duration: 60, points: pts, cams: [0, 1, 2], mode: 'speaker', min: 3, max: 10, turns, camFor: { Q: 2, R: 1 } });
  covers(shots, 60);
  assert.strictEqual(shots[0].cam, 2, 'the interviewer’s camera first');
  assert.ok(!shots.some(s => s.cam === 1 && s.start < 10), 'the 1 s “yes” didn’t get its own shot');
  const answer = shots.filter(s => s.start >= 12);
  assert.strictEqual(answer[0].cam, 1, 'the answer starts on Ruth’s camera');
  assert.ok(answer.some(s => s.cam === 0), 'the long answer cuts to the wide');
  assert.ok(answer.every(s => s.cam === 0 || s.cam === 1));
});

test('turns join consecutive lines of the same person', () => {
  const t = C.turnsFrom([{ start: 0, end: 2, speakerKey: 'a' }, { start: 2.1, end: 4, speakerKey: 'a' }, { start: 5, end: 6, speakerKey: 'b' }]);
  assert.deepStrictEqual(t, [{ start: 0, end: 4, speaker: 'a' }, { start: 5, end: 6, speaker: 'b' }]);
});
