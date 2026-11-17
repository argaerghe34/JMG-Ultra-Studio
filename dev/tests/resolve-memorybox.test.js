// resolve/host/memorybox.js against the stand-in Resolve: a family's files in one bin with their details and Memory Box
// id; a second sync updates the same clips (found wherever they were moved), relinks a moved file, never duplicates.
'use strict';
const assert = require('assert'), fs = require('fs'), path = require('path');
const { test, ROOT } = require('./harness');
const Fake = require('./resolve-fake');
const HOST = require('../../resolve/host');
const FIX = path.join(ROOT, 'dev', 'tests', 'fixtures', 'memorybox');

function setup() {
  const F = Fake.make();
  const host = HOST.connect({ api: F.resolve });
  const run = async (name, args) => { const r = await host.run(name, args); if (!r.ok) throw new Error(`${name}: ${r.error.code} ${r.error.detail}`); return r.data; };
  return { F, run };
}
const photo = path.join(FIX, 'Photos', '1953', 'IMG_0001.png'), photo2 = path.join(FIX, 'Photos', '1940s', 'IMG_0002.png');
const fields = { description: 'Ruth and Joe', comment: 'Grandma Ruth', people: 'Grandma Ruth', keywords: 'Grandma Ruth, Leeds', scene: 'The wedding', shot: '12 June 1953', logNote: 'Story: …', client: 'The Test family' };
const BIN = 'JMG Ultra Studio/Memory Box – The Test family';

test('resolve memory box: imported into one bin, named, details and id written; found again by id after a move', async () => {
  const { F, run } = setup();
  const r = await run('mbApply', { binPath: BIN, add: [{ key: 'fam-test/it-1', path: photo, name: '002 – IMG_0001.png', fields }, { key: 'fam-test/it-2', path: photo2, name: '001 – IMG_0002.png', fields: { description: 'Ruth as a girl' } }], update: [] });
  assert.deepStrictEqual([r.added.length, r.failed.length], [2, 0], JSON.stringify(r.failed));
  const bin = F.bin('JMG Ultra Studio/Memory Box – The Test family');
  const c = bin._clips.find(x => x.GetName() === '002 – IMG_0001.png');
  assert.ok(c, bin._clips.map(x => x.GetName()).join(', '));
  assert.deepStrictEqual(c.GetMetadata(), { Description: 'Ruth and Joe', Comments: 'Grandma Ruth', People: 'Grandma Ruth', Keywords: 'Grandma Ruth, Leeds', Scene: 'The wedding', Shot: '12 June 1953' });
  assert.strictEqual(c.GetThirdPartyMetadata('MemoryBoxId'), 'fam-test/it-1');
  // the editor moves it into another bin: still found, by id
  const other = F.resolve.GetProjectManager().GetCurrentProject().GetMediaPool();
  const mine = other.AddSubFolder(other.GetRootFolder(), 'My selects'); other.MoveClips([c], mine);
  const scan = await run('mbScan', { family: 'fam-test' });
  assert.deepStrictEqual(scan.map(s => [s.key, s.bin]).sort(), [['fam-test/it-1', 'My selects'], ['fam-test/it-2', 'JMG Ultra Studio / Memory Box – The Test family']]);
  assert.deepStrictEqual(await run('mbScan', { family: 'another-family' }), []);
});

test('resolve memory box: a second sync updates the same clip (renamed when ours, relinked when its file moved), no duplicate', async () => {
  const { F, run } = setup();
  await run('mbApply', { binPath: BIN, add: [{ key: 'fam-test/it-1', path: photo, name: '002 – IMG_0001.png', fields }], update: [] });
  const [s] = await run('mbScan', { family: 'fam-test' });
  const moved = path.join(FIX, 'Photos', '1940s', 'IMG_0002.png');   // stands in for the file's new place
  const r = await run('mbApply', { binPath: BIN, add: [], update: [{ key: s.key, clipId: s.id, name: '003 – IMG_0001.png', fields: Object.assign({}, fields, { description: 'New story' }), relink: moved }] });
  assert.deepStrictEqual([r.updated, r.relinked, r.failed.length], [1, 1, 0]);
  const clips = F.bin('JMG Ultra Studio/Memory Box – The Test family')._clips;
  assert.strictEqual(clips.length, 1, 'never a second clip');
  assert.strictEqual(clips[0].GetName(), '003 – IMG_0001.png');
  assert.strictEqual(clips[0].GetMetadata('Description'), 'New story');
  assert.strictEqual(clips[0].GetThirdPartyMetadata('MemoryBoxId'), 'fam-test/it-1', 'the id is written again after ReplaceClip');
  // a name the editor gave is kept
  clips[0].SetName('Ruth – opening shot');
  await run('mbApply', { binPath: BIN, add: [], update: [{ key: s.key, clipId: s.id, name: '004 – IMG_0001.png', fields }] });
  assert.strictEqual(clips[0].GetName(), 'Ruth – opening shot');
});

test('resolve memory box: a file already in the project (imported by hand) is tagged where it is, not imported twice', async () => {
  const { F, run } = setup();
  const pool = F.resolve.GetProjectManager().GetCurrentProject().GetMediaPool();
  const [mine] = pool.ImportMedia([photo]);
  pool.ImportMedia = () => [];   // like Resolve: a file already in the project isn't imported again
  const r = await run('mbApply', { binPath: BIN, add: [{ key: 'fam-test/it-1', path: photo, name: '002 – IMG_0001.png', fields }], update: [] });
  assert.strictEqual(r.added.length, 1); assert.ok(r.added[0].existing);
  assert.strictEqual(mine.GetThirdPartyMetadata('MemoryBoxId'), 'fam-test/it-1');
  assert.strictEqual(mine.GetName(), '002 – IMG_0001.png', 'still named like its file, so given the story-order name');
});
