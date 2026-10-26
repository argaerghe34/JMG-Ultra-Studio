const assert = require('assert');
const { load, test } = require('./harness');
const US = load(['js/tools/32-check.js']);
const fr = 1 / 25;
function clip(name, start, end, extra) { return Object.assign({ name, start, end, in: 0, out: end - start, itemId: name, path: '/m/' + name + '.mp4', disabled: false, offline: false, speed: 1 }, extra); }
const seq = {
  id: 's', name: 'Test', fps: 25, frame: fr, duration: 30,
  video: [
    { index: 0, name: 'Video 1', muted: false, locked: false, clips: [clip('A', 0, 10), clip('B', 10.2, 10.24), clip('C', 10.24, 20, { in: 5, out: 14.76, itemId: 'A' }), clip('D', 20, 30, { offline: true })] },
    { index: 1, name: 'Guides', muted: false, locked: false, clips: [clip('Ultra Guide 9x16 1920x1080', 0, 29.96)] }
  ],
  audio: [{ index: 0, name: 'Audio 1', muted: false, locked: false, clips: [clip('A', 0, 10), clip('C', 12, 30)] }],
  markers: [{ start: 5, end: 5, name: 'TODO shorten', comment: '', color: 4 }]
};
test('finds gap, flash frame, repeat, offline, visible guide, sound hole and open note', () => {
  const issues = US.check.scan(seq, { longShot: 0, audioGap: 0.5, repeatMin: 0.5 });
  const kinds = issues.map(i => i.kind);
  for (const k of ['gap', 'flash', 'repeat', 'offline', 'guide', 'silence', 'note']) assert.ok(kinds.includes(k), 'missing ' + k + ' in ' + kinds);
  const gap = issues.find(i => i.kind === 'gap');
  assert.ok(Math.abs(gap.t - 10) < 1e-9 && Math.abs(gap.end - 10.2) < 1e-9);
  assert.strictEqual(issues[0].sev, 'error');
});
test('clean sequence has no issues', () => {
  const clean = { id: 'c', name: 'Clean', fps: 25, frame: fr, duration: 20, video: [{ index: 0, name: 'V1', muted: false, clips: [clip('A', 0, 10), clip('B', 10, 20)] }], audio: [{ index: 0, name: 'A1', muted: false, clips: [clip('A', 0, 10), clip('B', 10, 20)] }], markers: [] };
  assert.deepStrictEqual(US.check.scan(clean, { longShot: 0, audioGap: 0.5, repeatMin: 0.5 }), []);
});
test('compare finds added, removed, trimmed and moved shots', () => {
  const mk = (clips, markers = []) => ({ id: 'x', name: 'v', fps: 25, frame: 0.04, duration: clips.reduce((m, c) => Math.max(m, c[4]), 0), video: [{ index: 0, name: 'V1', clips: clips.map(([itemId, i, o, st, en]) => ({ name: itemId, itemId, in: i, out: o, start: st, end: en })) }], audio: [], markers });
  const A = mk([['a', 0, 5, 0, 5], ['b', 0, 4, 5, 9], ['c', 2, 6, 9, 13], ['d', 0, 3, 13, 16]]);
  const B = mk([['b', 0, 4, 0, 4], ['a', 0, 4, 4, 8], ['c', 2, 6, 8, 12], ['e', 0, 2, 12, 14]], [{ start: 3, name: 'New note' }]);
  const r = US.check.compare(A, B);
  assert.deepStrictEqual([r.stats.added, r.stats.removed, r.stats.trimmed, r.stats.moved], [1, 1, 1, 1]);
  assert.ok(r.changes.some(c => c.kind === 'trimmed' && /ends 1\.0 s earlier/.test(c.text)));
  assert.ok(r.changes.some(c => c.kind === 'marker'));
});
test('guesses the previous version from the name', () => {
  const seqs = [{ id: 1, name: 'Interview v1' }, { id: 2, name: 'Interview v2' }, { id: 3, name: 'Interview v3' }, { id: 4, name: 'Promo v1' }];
  assert.strictEqual(US.check.guessOld(seqs, seqs[2]).id, 2);
  assert.strictEqual(US.check.guessOld(seqs, seqs[3]), null);
});

test('project check: unused, offline and imported twice – Ultra Studio’s own bins left out', () => {
  const it = (id, extra) => Object.assign({ id, name: id, path: '/m/' + id, bin: 'Footage', offline: false, used: true, sequence: false }, extra);
  const a = US.check.audit([it('a'), it('b', { used: false }), it('c', { offline: true }), it('d', { path: '/m/a', bin: 'Old' }), it('e', { used: false, bin: 'JMG Ultra Studio / Selects' }),
    it('s1', { sequence: true, path: '' }), it('g', { path: '' })]);
  assert.deepStrictEqual(a.unused.map(x => x.id), ['b']);
  assert.deepStrictEqual(a.offline.map(x => x.id), ['c']);
  assert.deepStrictEqual(a.duplicates.map(d => [d.path, d.list.map(x => x.id)]), [['/m/a', ['a', 'd']]]);
  assert.strictEqual(a.sequences, 1); assert.strictEqual(a.clips, 5);
});

test('project check: clips Premiere is still linking are not offline', () => {
  const it = (id, extra) => Object.assign({ id, name: id, path: '/m/' + id, bin: 'Footage', offline: false, used: true, sequence: false }, extra);
  const a = US.check.audit([it('a', { offline: true }), it('b', { offline: true })], { exists: p => p === '/m/a' });
  assert.deepStrictEqual(a.offline.map(x => x.id), ['b']);
  assert.strictEqual(a.linking, 1);
});
