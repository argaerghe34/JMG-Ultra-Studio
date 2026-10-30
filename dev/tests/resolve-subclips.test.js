// resolve/host/subclips.js against the stand-in Resolve: each clip's Mark In/Out (or all of it) as a subclip in
// "<bin> – Subclips", and Replace moving earlier ones aside.
'use strict';
const assert = require('assert');
const { test } = require('./harness');
const Fake = require('./resolve-fake');
const HOST = require('../../resolve/host');

function setup() {
  const F = Fake.make();
  const host = HOST.connect({ api: F.resolve });
  const run = async (name, args) => { const r = await host.run(name, args); if (!r.ok) throw new Error(`${name}: ${r.error.code} ${r.error.detail}`); return r.data; };
  return { F, run };
}

test('resolve subclips: Mark In/Out (or the whole clip) into "<bin> – Subclips"; Replace moves earlier ones aside', async () => {
  const { F, run } = setup();
  const a = F.addMedia('/m/C0012.mp4', { frames: 2500, bin: 'Shoot/Roam' }), b = F.addMedia('/m/C0013.mp4', { frames: 2500, bin: 'Shoot/Roam' });
  a.SetMarkInOut(250, 499);
  const bin = (await run('listBins')).find(x => x.path === 'Shoot / Roam');
  const read = await run('subRead', { binId: bin.id });
  assert.strictEqual(read.targetPath, 'Shoot / Roam – Subclips');
  assert.deepStrictEqual(read.clips.map(c => [c.name, c.in, c.out, c.whole]), [['C0012.mp4', 10, 20, false], ['C0013.mp4', 0, 100, true]]);
  const items = read.clips.map((c, i) => ({ id: c.id, name: `0${i + 1} – ${c.name}`, in: c.in, out: c.out }));
  const r = await run('subMake', { targetPath: read.targetPath, items, conflicts: [], mode: 'replace' });
  assert.deepStrictEqual([r.made, r.moved, r.failed], [2, 0, []]);
  const out = F.bin('Shoot/Roam – Subclips');
  assert.deepStrictEqual(out._clips.map(c => [c.GetName(), c._start, c._end]), [['01 – C0012.mp4', 250, 499], ['02 – C0013.mp4', 0, 2499]]);
  // again: both names are taken; Replace moves the earlier ones into "… – earlier"
  const again = await run('subRead', { binId: bin.id });
  assert.deepStrictEqual(again.existing, ['01 – C0012.mp4', '02 – C0013.mp4']);
  const r2 = await run('subMake', { targetPath: read.targetPath, items, conflicts: again.existing, mode: 'replace' });
  assert.deepStrictEqual([r2.made, r2.moved], [2, 2]);
  assert.strictEqual(F.bin('Shoot/Roam – Subclips – earlier')._clips.length, 2);
  assert.strictEqual(F.bin('Shoot/Roam – Subclips')._clips.length, 2);
});
