// Same crop per person: people from the clips' lines (one per file, or per speaker in a shared shot), the position
// that keeps the crop inside the picture, the speaker of each timeline clip, and the moves grouped per person.
const assert = require('assert');
const { load, test } = require('./harness');
const US = load(['time', 'js/tools/22-story-crops.js']);
const C = US.storyCrops;

const LINES = {
  a: [{ id: 'a1', start: 0, end: 5, speaker: 'Ruth' }, { id: 'a2', start: 5, end: 9, speaker: 'Ruth' }],
  w: [{ id: 'w1', start: 0, end: 4, speaker: 'Host' }, { id: 'w2', start: 4, end: 10, speaker: 'Guest' }, { id: 'w3', start: 10, end: 12, speaker: 'Host' }]
};
const T = { a: { path: '/m/ruth.mov' }, w: { path: '/m/wide.mov' } };
const byId = new Map(), tOf = new Map();
for (const k of Object.keys(LINES)) for (const l of LINES[k]) { byId.set(l.id, l); tOf.set(l.id, T[k]); }

test('people: one row per file and speaker, most lines first', () => {
  const ppl = C.people(['a1', 'a2', 'w1', 'w2', 'w3', 'zz'], { lineOf: id => byId.get(id), transcriptOf: id => tOf.get(id) });
  assert.deepStrictEqual(ppl.map(p => [p.file, p.speaker, p.lines]), [['ruth.mov', 'Ruth', 2], ['wide.mov', 'Host', 2], ['wide.mov', 'Guest', 1]]);
  assert.strictEqual(ppl[0].key, '/m/ruth.mov|Ruth');
});

test('position: centred stays centred, the crop never leaves the picture, zoom lets it go further', () => {
  // 1920 wide in a 608 frame: the crop is 608/1920 of the picture
  assert.strictEqual(C.position(0.5, { srcW: 1920, newW: 608 }).x, 0.5);
  const left = C.position(0.25, { srcW: 1920, newW: 608 });
  assert.ok(Math.abs(left.x - (0.5 + 0.25 * 1920 / 608)) < 1e-9, 'a quarter in from the left: the picture moves right');
  const edge = C.position(0, { srcW: 1920, newW: 608 });
  assert.ok(Math.abs(edge.f - 608 / 3840) < 1e-9, 'held where the frame’s edge meets the picture’s');
  assert.ok(C.position(0, { srcW: 1920, newW: 608, zoom: 1.5 }).f < edge.f, 'zoomed in, it can go nearer the edge');
  assert.strictEqual(C.position(0.1, { srcW: 600, newW: 608 }).x, 0.5, 'a picture narrower than the frame stays centred');
});

test('the speaker of a timeline clip, from the lines in its source range', () => {
  const linesOf = p => (p === '/m/wide.mov' ? LINES.w : []);
  assert.strictEqual(C.speakerIn({ path: '/m/wide.mov', in: 3, out: 9 }, linesOf), 'Guest');
  assert.strictEqual(C.speakerIn({ path: '/m/wide.mov', in: 0, out: 3.5 }, linesOf), 'Host');
  assert.strictEqual(C.speakerIn({ path: '/m/other.mov', in: 0, out: 3 }, linesOf), '');
});

test('plan: one move per person, a shared shot split by speaker, zoom from the clip’s own scale, others left alone', () => {
  const info = { width: 608, video: [{ index: 0, clips: [
    { path: '/m/ruth.mov', in: 0, out: 5, start: 0, scale: 100 },
    { path: '/m/wide.mov', in: 4, out: 10, start: 5 },
    { path: '/m/wide.mov', in: 0, out: 4, start: 11 },
    { path: '/m/ruth.mov', in: 5, out: 9, start: 15, scale: 100 },
    { path: '/m/broll.mov', in: 0, out: 3, start: 19 },
    { path: '/m/nest', isSequence: true, start: 22 }
  ] }] };
  const crops = { '/m/ruth.mov|': { x: 0.5, zoom: 1.2 }, '/m/wide.mov|Guest': { x: 0.7 }, '/m/wide.mov|Host': { x: 0.3 } };
  const moves = C.plan(info, crops, { srcW: 1920, linesOf: p => (p === '/m/wide.mov' ? LINES.w : []) });
  assert.strictEqual(moves.length, 3);
  const ruth = moves.find(m => m.key === '/m/ruth.mov|');
  assert.deepStrictEqual(ruth.targets.map(t => t.start), [0, 15], 'both of Ruth’s clips in one move');
  assert.strictEqual(ruth.params.scale, 120);
  assert.strictEqual(ruth.params.x, 0.5);
  const guest = moves.find(m => m.key === '/m/wide.mov|Guest'), host = moves.find(m => m.key === '/m/wide.mov|Host');
  assert.ok(guest.params.x < 0.5 && host.params.x > 0.5, 'the guest on the right, the host on the left');
  assert.ok(!('scale' in guest.params), 'no zoom: the scale is left as it is');
  assert.deepStrictEqual(host.targets.map(t => t.start), [11]);
});
