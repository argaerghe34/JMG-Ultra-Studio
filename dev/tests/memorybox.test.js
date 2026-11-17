// Memory Box: reading memorybox.json (people merged, private notes, unsafe paths, dates), the clip details, filters,
// what's new since the last sync, the bin plan, and the connection to Memory Box against a stand-in server on this
// computer (families, ETag, downloads that never duplicate, the key never sent to another address).
// Fixture: dev/tests/fixtures/memorybox (hand-made; switch to Memory Box's real sample when it arrives).
'use strict';
const assert = require('assert'), fs = require('fs'), path = require('path'), os = require('os'), http = require('http'), crypto = require('crypto');
const { load, test, ROOT } = require('./harness');
global.addEventListener = global.addEventListener || (() => {});
global.ResizeObserver = global.ResizeObserver || function () { return { observe() {} }; };
const US = load(['time', 'ui', 'app', 'ai', 'js/tools/46-memorybox-data.js', 'js/tools/46-memorybox-net.js', 'js/tools/46-memorybox.js']);
const MB = US.memoryBox;
const FIX = path.join(ROOT, 'dev', 'tests', 'fixtures', 'memorybox');
const sample = () => JSON.parse(fs.readFileSync(path.join(FIX, 'memorybox.json'), 'utf8'));

test('parse: story order, merged people followed, unnamed people labelled, private team notes left out', () => {
  const m = MB.parse(fs.readFileSync(path.join(FIX, 'memorybox.json'), 'utf8'));
  assert.strictEqual(m.family.name, 'The Test family');
  assert.deepStrictEqual(m.items.map(x => x.id), ['it-2', 'it-1', 'it-3', 'it-4', 'it-5'], 'storyOrder');
  const two = m.byId.get('it-2');
  assert.deepStrictEqual(two.people.map(p => [p.id, p.label, p.maybe]), [['p-ruth', 'Grandma Ruth', true]], 'p-ruth-old → p-ruth');
  const one = m.byId.get('it-1');
  assert.deepStrictEqual(one.people.map(p => [p.label, p.maybe]), [['Grandma Ruth', false], ['Grandpa Joe', false], ['Unnamed person 3', true]], 'tagged, pinned, and a suggested face as maybe');
  assert.strictEqual(m.people.find(p => p.id === 'p-ruth').teamNotes, '', 'teamNotes only when export.privateNotes');
  assert.ok(!JSON.stringify(MB.fields(m, one)).includes('PRIVATE'));
  const priv = sample(); priv.export.privateNotes = true;
  assert.strictEqual(MB.parse(priv).people.find(p => p.id === 'p-ruth').teamNotes, 'PRIVATE – must not appear');
  const mp = MB.parse(priv);
  assert.ok(MB.fields(mp, mp.byId.get('it-1')).logNote.includes('Team notes about Grandma Ruth: PRIVATE'), 'in the Log Note when asked for');
  assert.strictEqual(m.byId.get('it-4').path, null, '"../escape.png" is refused');
  assert.ok(m.warnings.some(w => /escape\.png/.test(w)));
  assert.strictEqual(one.place, 'Leeds Town Hall', 'the team’s place wins');
});

test('parse: dates in words, suggested dates marked, decades for browsing', () => {
  const m = MB.parse(sample());
  assert.strictEqual(m.byId.get('it-1').dateText, '12 June 1953');
  assert.strictEqual(m.byId.get('it-2').dateText, '1940s');
  assert.strictEqual(m.byId.get('it-3').dateText, 'about 1991 (suggested)');
  assert.deepStrictEqual(['it-1', 'it-2', 'it-3'].map(id => m.byId.get(id).decade), [1950, 1940, 1990]);
  assert.strictEqual(MB.dateText({ mode: 'month', year: 1984, month: 3 }), 'March 1984');
  assert.strictEqual(MB.dateText({ mode: 'unknown' }), '');
});

test('parse: refuses what isn’t schemaVersion 1, and newer versions ask for an update', () => {
  assert.throws(() => MB.parse('{"items":[]}'), /unknown version/);
  assert.throws(() => MB.parse({ schemaVersion: 2, items: [] }), /newer than Ultra Studio/);
  assert.throws(() => MB.parse('not json'), /can’t be read/);
  const extra = sample(); extra.items[0].somethingNew = { x: 1 }; extra.brandNewTopLevel = true;
  assert.strictEqual(MB.parse(extra).items.length, 5, 'fields added within version 1 are fine');
});

test('fields: what each clip carries (story, people, date, place, chapters, Q&A, voice note) and its key', () => {
  const m = MB.parse(sample()), it = m.byId.get('it-1'), f = MB.fields(m, it);
  assert.strictEqual(f.description, 'Ruth and Joe on the town hall steps');
  assert.strictEqual(f.comment, 'Grandma Ruth, Grandpa Joe, Unnamed person 3 (maybe)');
  assert.strictEqual(f.scene, 'The wedding'); assert.strictEqual(f.shot, '12 June 1953'); assert.strictEqual(f.client, 'The Test family');
  for (const s of ['Story: Ruth and Joe', 'Place: Leeds Town Hall', 'Occasion: Wedding', 'Q: Who took this?\nA: Uncle Bill', 'Q: Which church? (not answered yet)', 'Voice note: Voice notes/IMG_0001 - voice.m4a', 'Team note: Use for the opening', 'photo 1 · uploaded by Auntie Sue']) assert.ok(f.logNote.includes(s), s + '\n' + f.logNote);
  assert.ok(/Grandma Ruth/.test(f.keywords) && !/Unnamed/.test(f.keywords) && /1950s/.test(f.keywords), f.keywords);
  assert.strictEqual(MB.clipName(it), '002 – IMG_0001.png');
  assert.strictEqual(MB.key(m, it), 'fam-test/it-1'); assert.strictEqual(MB.key(m, it, true), 'fam-test/it-1#voice');
  assert.deepStrictEqual(MB.parseKey('fam-test/it-1#voice'), { family: 'fam-test', item: 'it-1', voice: true });
});

test('browse: facets and filters by person, decade, chapter, tag, type and words', () => {
  const m = MB.parse(sample()), fc = MB.facets(m);
  assert.deepStrictEqual(fc.people.map(p => [p.label, p.count]), [['Grandma Ruth', 2], ['Grandpa Joe', 1], ['Unnamed person 3', 1]]);
  assert.deepStrictEqual(fc.decades.map(d => d.label), ['1940s', '1950s', '1990s', 'Date unknown']);
  const ids = f => MB.filter(m, f).map(x => x.id);
  assert.deepStrictEqual(ids({ person: 'p-ruth' }), ['it-2', 'it-1']);
  assert.deepStrictEqual(ids({ decade: '1990' }), ['it-3']);
  assert.deepStrictEqual(ids({ chapter: 'ch-roots' }), ['it-2']);
  assert.deepStrictEqual(ids({ tag: 'tag-hol', type: 'video' }), ['it-3']);
  assert.deepStrictEqual(ids({ q: 'uncle bill' }), ['it-1'], 'answers are searched');
  assert.deepStrictEqual(ids({ q: 'town steps' }), ['it-1'], 'every word must match, in any order');
});

test('what’s new: first sync, then new and changed items; removed ones noticed', () => {
  const m = MB.parse(sample());
  const d0 = MB.diff(m, null);
  assert.ok(d0.first); assert.strictEqual(d0.added.length, 5);
  const snap = MB.snapshot(m, m.items.slice(0, 3));
  const later = sample();
  later.items[0].story = 'Ruth and Joe, June 1953';                       // it-1 changed
  later.items.splice(1, 1);                                              // it-2 deleted in Memory Box
  const m2 = MB.parse(later), d = MB.diff(m2, snap);
  assert.deepStrictEqual(d.changed.map(x => x.id), ['it-1']);
  assert.deepStrictEqual(d.added.map(x => x.id).sort(), ['it-4', 'it-5'], 'never brought in = new');
  assert.deepStrictEqual(d.removed, ['it-2']);
  assert.deepStrictEqual(MB.filter(m2, { only: 'updates' }, d.status).map(x => x.id), ['it-1', 'it-4', 'it-5']);
});

test('plan: one bin, story order, voice note after its photo; existing clips updated (relinked when moved); the rest skipped plainly', () => {
  const m = MB.parse(sample());
  const local = (it, voice) => path.join(FIX, ...(voice ? it.voice : it.path).split('/'));
  const p = MB.plan(m, m.items, { local: (it, v) => (fs.existsSync(local(it, v)) ? local(it, v) : ''), existing: [] });
  assert.deepStrictEqual(p.add.map(x => x.name), ['001 – IMG_0002.png', '002 – IMG_0001.png', '002 – IMG_0001.png – voice note', '003 – VID_0003.mp4']);
  assert.deepStrictEqual(p.skip.map(x => [x.item, x.why]), [['it-4', 'no safe file path'], ['it-5', 'not a photo or video']]);
  assert.strictEqual(MB.binPath(m), 'JMG Ultra Studio/Memory Box – The Test family');
  const again = MB.plan(m, m.items, { local: (it, v) => local(it, v), existing: [{ key: 'fam-test/it-1', id: 'c1', name: 'x', path: '/gone/IMG_0001.png', offline: true }] });
  const u = again.update.find(x => x.key === 'fam-test/it-1');
  assert.strictEqual(u.clipId, 'c1'); assert.strictEqual(u.relink, local(m.byId.get('it-1'), false));
  assert.ok(!again.add.some(x => x.key === 'fam-test/it-1'), 'never imported twice');
  const noVoice = MB.plan(m, m.items, { local, existing: [], voiceNotes: false });
  assert.ok(!noVoice.add.some(x => /voice/.test(x.name)));
});

test('a team download on disk: the folder is used where it is; nothing copied; missing parts said plainly', async () => {
  const d = await MB.net.openDownload([FIX]);
  assert.strictEqual(d.root, FIX);
  const m = MB.parse(d.json);
  const r = await MB.net.ensureLocal(m, m.items, { kind: 'folder', root: FIX });
  assert.deepStrictEqual([r.downloaded, r.already, r.missing.length], [0, 4, 0], '3 originals + 1 voice note');
  assert.strictEqual(MB.net.zipBase('/x/The Adams family - part 2 of 3.zip'), 'The Adams family');
  assert.strictEqual(MB.net.zipBase('/x/Adams (part 1).zip'), 'Adams');
});

/* ---------- the connection, against a stand-in Memory Box on this computer ---------- */
function standIn() {
  const json = sample(), files = {}, seen = [];
  for (const it of json.items) if (it.file && MB.safeRel(it.file.path) && it.type !== 'other') files[it.id] = fs.readFileSync(path.join(FIX, ...it.file.path.split('/')));
  files['it-1#voice'] = fs.readFileSync(path.join(FIX, 'Voice notes', 'IMG_0001 - voice.m4a'));
  let other;   // a second server standing in for signed storage (another address)
  const S = { busyOnce: false, expireOnce: new Set(), dropOnce: new Set() };
  const storage = http.createServer((req, res) => {
    seen.push({ host: 'storage', url: req.url, auth: req.headers.authorization || '', range: req.headers.range || '' });
    const k = decodeURIComponent(req.url.slice(1)); if (!files[k]) { res.statusCode = 404; return res.end(); }
    if (S.expireOnce.delete(k)) { res.statusCode = 403; return res.end('<Error>Request has expired</Error>'); }
    const m = /^bytes=(\d+)-$/.exec(req.headers.range || ''), from = m ? Number(m[1]) : 0, body = files[k].subarray(from);
    res.statusCode = m ? 206 : 200; res.setHeader('Content-Length', body.length);
    if (S.dropOnce.delete(k)) { res.write(body.subarray(0, Math.floor(body.length / 2))); return setTimeout(() => res.socket.destroy(), 20); }
    res.end(body);
  });
  const api = http.createServer((req, res) => {
    seen.push({ host: 'api', url: req.url, auth: req.headers.authorization || '' });
    if (req.headers.authorization !== 'Bearer mbk_test') { res.statusCode = 401; return res.end('{"error":"That key is switched off"}'); }
    const u = req.url.replace('/api/editor/v1', '');
    const etag = '"v1-' + crypto.createHash('md5').update(JSON.stringify(json)).digest('hex') + '"';
    if (u === '/me') return res.end(JSON.stringify({ app: 'Memory Box', version: '1.3.4', keyName: 'Test' }));
    if (u === '/families') { if (S.busyOnce) { S.busyOnce = false; res.statusCode = 429; res.setHeader('Retry-After', '2'); return res.end('{"error":"Too many requests"}'); } return res.end(JSON.stringify([{ id: 'fam-test', name: 'The Test family', itemCount: 5, photoCount: 3, videoCount: 1, portalUrl: 'http://localhost/admin/families/fam-test' }])); }
    if (u.startsWith('/families/fam-test/memorybox.json')) { if (req.headers['if-none-match'] === etag) { res.statusCode = 304; return res.end(); } res.setHeader('ETag', etag); return res.end(JSON.stringify(json)); }
    const m = /^\/items\/([^/]+)\/(original|voice-note)$/.exec(u);
    if (m) { res.statusCode = 302; res.setHeader('Location', `http://127.0.0.1:${other}/${encodeURIComponent(m[1] + (m[2] === 'voice-note' ? '#voice' : ''))}`); return res.end(); }
    res.statusCode = 404; res.end();
  });
  return new Promise(r => storage.listen(0, '127.0.0.1', () => { other = storage.address().port; api.listen(0, '127.0.0.1', () => r(Object.assign(S, { url: `http://127.0.0.1:${api.address().port}`, json, seen, close: () => { api.close(); storage.close(); } }))); }));
}

test('connection: families, the family’s memorybox.json with ETag (304 = unchanged), a wrong key said plainly', async () => {
  const S = await standIn();
  try {
    MB.net.setConn(S.url, 'mbk_test');
    assert.strictEqual((await MB.net.me()).keyName, 'Test');
    const fams = await MB.net.families();
    assert.deepStrictEqual(fams.map(f => [f.id, f.items, f.photos, f.videos]), [['fam-test', 5, 3, 1]], 'itemCount, photoCount, videoCount');
    const r = await MB.net.family('fam-test');
    assert.strictEqual(r.json.family.id, 'fam-test'); assert.ok(r.etag);
    assert.ok((await MB.net.family('fam-test', { etag: r.etag })).notModified);
    MB.net.setConn(S.url, 'wrong');
    await assert.rejects(MB.net.families(), e => /didn’t accept the access key/.test(e.title) && /That key is switched off/.test(e.detail), 'Memory Box’s own words in the details');
  } finally { S.close(); MB.net.setConn('', ''); }
});

test('connection: originals saved once in <folder>/<family>/<path>, checked (size, sha256), the key never sent to storage', async () => {
  const S = await standIn(), dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mb-dl-'));
  try {
    MB.net.setConn(S.url, 'mbk_test');
    const m = MB.parse((await MB.net.family('fam-test')).json), src = { kind: 'online', folder: dir };
    const job = { cancelled: false, check() {}, progress() {}, set() {} };
    const r1 = await MB.net.ensureLocal(m, m.items, src, { job });
    assert.deepStrictEqual([r1.downloaded, r1.already, r1.missing.length], [4, 0, 0]);
    assert.ok(fs.existsSync(path.join(dir, 'The Test family', 'Photos', '1953', 'IMG_0001.png')));
    assert.ok(fs.existsSync(path.join(dir, 'The Test family', 'Voice notes', 'IMG_0001 - voice.m4a')));
    assert.ok(S.seen.filter(s => s.host === 'storage').every(s => !s.auth), 'no key sent to the storage address');
    const r2 = await MB.net.ensureLocal(m, m.items, src, { job });
    assert.deepStrictEqual([r2.downloaded, r2.already], [0, 4], 'nothing downloaded twice');
    // a file that arrives different from its sha256 is not kept
    const bad = JSON.parse(JSON.stringify(S.json)); bad.items[0].sha256 = 'f'.repeat(64);
    const mb = MB.parse(bad); fs.rmSync(path.join(dir, 'The Test family', 'Photos', '1953', 'IMG_0001.png'));
    const r3 = await MB.net.ensureLocal(mb, [mb.byId.get('it-1')], src, { job, voiceNotes: false });
    assert.strictEqual(r3.missing.length, 1); assert.ok(/didn’t arrive whole/.test(r3.missing[0].why));
    assert.ok(!fs.existsSync(path.join(dir, 'The Test family', 'Photos', '1953', 'IMG_0001.png')) && !fs.existsSync(path.join(dir, 'The Test family', 'Photos', '1953', 'IMG_0001.png.part')));
  } finally { S.close(); MB.net.setConn('', ''); fs.rmSync(dir, { recursive: true, force: true }); }
});

test('connection: only https, except Memory Box running on this computer', () => {
  assert.throws(() => MB.net.checkUrl('http://memorybox.example.com'), /https/);
  assert.ok(MB.net.checkUrl('https://memorybox.example.com'));
  assert.ok(MB.net.checkUrl('http://localhost:3000'));
  assert.ok(MB.net.checkUrl('http://memorybox.test'));
});

test('bring in: downloads, scans, applies in the editor and remembers the sync (stand-in editor)', async () => {
  const S = await standIn(), dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mb-in-'));
  const calls = [], clips = [];
  const saved = US.host.call, ctx = US.ctx.project;
  US.ctx.project = { name: 'T', path: path.join(dir, 'T.prproj') };
  US.host.call = async (name, a) => {
    calls.push(name);
    if (name === 'mbScan') return clips.slice();
    if (name === 'mbApply') { for (const x of a.add) clips.push({ key: x.key, id: 'c' + clips.length, name: x.name, path: x.path, offline: false }); return { added: a.add.map(x => ({ key: x.key, id: 'c', name: x.name })), updated: a.update.length, relinked: 0, failed: [] }; }
    throw new Error('unexpected ' + name);
  };
  try {
    MB.net.setConn(S.url, 'mbk_test');
    const m = MB.parse((await MB.net.family('fam-test')).json), job = { cancelled: false, check() {}, progress() {}, set() {} };
    const r = await MB.bringIn(m, m.items, { kind: 'online', folder: dir }, { voiceNotes: true }, job);
    assert.strictEqual(r.added, 4); assert.strictEqual(r.skipped.length, 2);
    const r2 = await MB.bringIn(m, m.items, { kind: 'online', folder: dir }, { voiceNotes: true }, job);
    assert.deepStrictEqual([r2.added, r2.updated, r2.downloaded], [0, 4, 0], 'the second time: updated, not duplicated, nothing downloaded');
    const snap = US.projectStore(US.ctx.project.path).get('memoryBox')['fam-test'].snapshot;
    assert.deepStrictEqual(Object.keys(snap.items).sort(), ['it-1', 'it-2', 'it-3']);
    assert.strictEqual(MB.diff(m, snap).changed.length, 0);
  } finally { US.host.call = saved; US.ctx.project = ctx; S.close(); MB.net.setConn('', ''); fs.rmSync(dir, { recursive: true, force: true }); }
});

test('connection: busy (429) waits Retry-After and asks again; an expired storage link and a dropped download are asked for again and resumed', async () => {
  const S = await standIn(), dir = require('fs').mkdtempSync(require('path').join(require('os').tmpdir(), 'mb-retry-'));
  const scale = MB.net.waitScale; MB.net.waitScale = 5;
  try {
    MB.net.setConn(S.url, 'mbk_test');
    S.busyOnce = true;
    assert.strictEqual((await MB.net.families()).length, 1, 'answered after waiting');
    const m = MB.parse((await MB.net.family('fam-test')).json), job = { cancelled: false, check() {}, progress() {}, set() {} };
    S.expireOnce.add('it-1'); S.dropOnce.add('it-3');
    const r = await MB.net.ensureLocal(m, m.items, { kind: 'online', folder: dir }, { job });
    assert.deepStrictEqual([r.downloaded, r.missing.length], [4, 0], JSON.stringify(r.missing));
    const vid = S.seen.filter(x => x.host === 'storage' && x.url === '/it-3');
    assert.strictEqual(vid.length, 2); assert.ok(/^bytes=\d+-$/.test(vid[1].range), 'resumed with Range: ' + vid[1].range);
    assert.strictEqual(fs.readFileSync(MB.localPath(dir, m, 'Videos/VID_0003.mp4'), 'utf8'), fs.readFileSync(path.join(FIX, 'Videos', 'VID_0003.mp4'), 'utf8'), 'the resumed file is whole');
  } finally { MB.net.waitScale = scale; S.close(); MB.net.setConn('', ''); fs.rmSync(dir, { recursive: true, force: true }); }
});

test('Memory Box’s real samples (1.3.3, the sample family): read, in story order, with people and tags', () => {
  for (const f of ['memorybox-sample-year.json', 'memorybox-sample-story.json']) {
    const m = MB.parse(fs.readFileSync(path.join(ROOT, 'dev', 'tests', 'fixtures', 'memorybox-sample', f), 'utf8'));
    assert.strictEqual(m.family.name, 'Family Sample Cohen');
    assert.deepStrictEqual(m.items.map(x => x.order), [1, 2, 3, 4, 5, 6]);
    assert.ok(m.items.every(x => x.path && x.type === 'photo'), 'every path is safe');
    const wed = m.items.find(x => x.originalName === 'wedding-1972.jpg');
    assert.deepStrictEqual(wed.people.map(p => p.label), ['Grandma Ruth', 'Grandpa Harry']);
    assert.strictEqual(wed.dateText, '1972'); assert.strictEqual(wed.place, 'Manchester');
    const sea = m.items.find(x => x.originalName === 'seaside-holiday.jpg');
    assert.deepStrictEqual(sea.people.map(p => [p.label, p.maybe]), [['Grandpa Harry', false], ['Uncle David', true]]);
    assert.ok(MB.facets(m).tags.some(t => t.label === 'Seaside holidays'));
    const plan = MB.plan(m, m.items, { local: it => '/x/' + it.path });
    assert.strictEqual(plan.add.length, 6); assert.strictEqual(plan.add[0].name, '001 – old-scan-1950s.jpg');
  }
});
