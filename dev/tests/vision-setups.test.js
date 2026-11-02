// Selects: how well a stretch is framed and lit (from what the analysis already measured), and takes of the same
// setup grouped with the best one marked – the order "same setup together" and "best looking first".
const assert = require('assert');
const { load, test } = require('./harness');
const US = load(['vision']);
const V = US.vision, I = V._internal;

const smp = o => Object.assign({ t: 0, p10: 30, p90: 200, hi: 0, lo: 0.02, cx: 0.5, fc: 0 }, o);

test('framing: good contrast with a face on a third scores high; flat, blown or a face at the edge scores lower', () => {
  const good = I.framing([smp({ fc: 1, fx: 0.34 }), smp({ fc: 1, fx: 0.33 })]);
  assert.ok(good.looks >= 95, String(good.looks)); assert.ok(good.notes.includes('face well placed'));
  const flat = I.framing([smp({ p10: 100, p90: 120, fc: 1, fx: 0.34 })]);
  assert.ok(flat.looks < good.looks - 15 && flat.notes.includes('flat, low contrast'));
  const edge = I.framing([smp({ fc: 1, fx: 0.95 })]);
  assert.ok(edge.looks < good.looks - 25 && edge.notes.includes('face at the edge of the frame'));
  const blown = I.framing([smp({ hi: 0.2, fc: 1, fx: 0.5 })]);
  assert.ok(blown.looks < good.looks && blown.notes.includes('highlights blown'));
  assert.strictEqual(I.framing([]).looks, 50, 'nothing measured: neutral');
});

test('setups: clips that look alike are one setup whatever their length; different looks are not', () => {
  const sig = (v, r = [100, 100, 100]) => ({ thumb: new Array(16).fill(v), rgb: r });
  const clip = (id, s) => ({ item: { id, name: id }, data: { sig: s, samples: [{}] } });
  const clips = [clip('a1', sig(50)), clip('b', sig(160, [150, 140, 130])), clip('a2', sig(53)), clip('c', sig(52, [40, 40, 40])), clip('a3', sig(48))];
  const g = I.setups(clips);
  assert.strictEqual(g.get('a1').n, g.get('a2').n); assert.strictEqual(g.get('a1').n, g.get('a3').n);
  assert.ok(!g.has('b') && !g.has('c'), 'one-offs and a different colour are not in a setup');
  assert.strictEqual(I.setups(clips), g, 'the same footage re-ranked: worked out once');
});

test('ordering: the best looking first; the same setup together, best take first, setups by their best', () => {
  const s = (key, rank, setup, looks) => ({ key, clipName: key, start: 0, rank, score: rank, setup, looks, flags: {} });
  const list = [s('x', 90, 0, 40), s('a-lo', 60, 1, 70), s('y', 70, 0, 90), s('a-hi', 80, 1, 60), s('b', 75, 2, 80)];
  assert.deepStrictEqual(V.order(list, 'looks').map(x => x.key), ['y', 'b', 'a-lo', 'a-hi', 'x']);
  assert.deepStrictEqual(V.order(list, 'setup').map(x => x.key), ['x', 'a-hi', 'a-lo', 'b', 'y']);
});

test('scoring real footage: every select has a framing score and the setup marks are consistent', () => {
  const all = require('./fixtures/vision-clips.json');
  const clips = JSON.parse(JSON.stringify(all.find(b => b.bin === 'Test – Selects / Real').clips));
  const r = V.score(clips, V.PRESETS.concert);
  assert.ok(r.selects.length && r.selects.every(x => x.looks >= 0 && x.looks <= 100));
  const bySetup = new Map();
  for (const x of r.selects) if (x.setup) bySetup.set(x.setup, (bySetup.get(x.setup) || 0) + (x.flags.setupBest ? 1 : 0));
  for (const n of bySetup.values()) assert.strictEqual(n, 1, 'one best take per setup');
  assert.strictEqual(r.stats.setups, bySetup.size);
  assert.ok(r.selects.filter(x => !x.setup).every(x => x.flags.setupBest), 'a one-off shot is its own best');
});
