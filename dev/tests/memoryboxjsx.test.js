// Runs jsx/host.jsx + jsx/tools/memorybox.jsx against a small stand-in for Premiere's ExtendScript objects: clips
// imported into one bin, named, their details and Memory Box id written to the project metadata (never the files),
// found again by id after a move, updated and relinked, not imported twice. What real Premiere does with the XMP is
// checked by dev/e2e/56-memorybox.e2e.js.
'use strict';
const assert = require('assert'), fs = require('fs'), path = require('path'), vm = require('vm');
const { test, ROOT } = require('./harness');
const FIX = path.join(ROOT, 'dev', 'tests', 'fixtures', 'memorybox');
const NS = 'http://ns.adobe.com/premierePrivateProjectMetaData/1.0/';

function makePremiere() {
  let nextId = 1;
  const coll = arr => new Proxy({ get numItems() { return arr.length; } }, { get: (o, p) => (p in o ? o[p] : /^\d+$/.test(p) ? arr[+p] : undefined) });
  const schema = [], writes = [];
  function item(name, { type = 1, p = '', kids = null } = {}) {
    const k = kids || [];
    const it = {
      nodeId: 'n' + (nextId++), name, type, path: p, parent: null, children: coll(k), _kids: k, md: '<x:xmpmeta/>',
      get treePath() { const parts = []; for (let x = it; x && x.type !== 3; x = x.parent) parts.unshift(x.name); return '\\P.prproj\\' + parts.join('\\'); },
      getMediaPath() { return it.path; }, isSequence() { return false; }, isOffline() { return !fs.existsSync(it.path); },
      getProjectMetadata() { return it.md; },
      setProjectMetadata(x, fields) { it.md = x; writes.push({ name: it.name, fields }); },
      canChangeMediaPath() { return true; }, changeMediaPath(np) { it.path = np; return true; },
      createBin(n) { const b = item(n, { type: 2, kids: [] }); k.push(b); b.parent = it; return b; },
      moveBin(bin) { it.parent._kids.splice(it.parent._kids.indexOf(it), 1); bin._kids.push(it); it.parent = bin; }
    };
    return it;
  }
  const root = item('root', { type: 3, kids: [] });
  const all = () => { const out = []; (function w(b) { for (const c of b._kids) { out.push(c); if (c.type === 2) w(c); } })(root); return out; };
  const project = {
    rootItem: root, path: '/p/P.prproj', sequences: { numSequences: 0 },
    // like Premiere 2027: a file already in the project isn't imported again
    importFiles(paths, quiet, bin) { for (const p of paths) { if (all().some(c => c.type === 1 && c.path === p)) continue; const c = item(path.basename(p), { p }); bin._kids.push(c); c.parent = bin; } return true; },
    addPropertyToProjectMetadataSchema(n, label, t) { if (schema.some(s => s[0] === n)) return false; schema.push([n, label, t]); return true; }
  };
  // a tiny XMPMeta: properties of the Premiere project namespace, kept as <premierePrivateProjectMetaData:Key>value</…>
  class XMPMeta {
    constructor(s) { this.p = {}; const re = /<premierePrivateProjectMetaData:([\w.]+)>([^<]*)</g; let m; while ((m = re.exec(String(s || '')))) this.p[m[1]] = m[2]; }
    setProperty(ns, k, v) { assert.strictEqual(ns, NS); this.p[k] = String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;'); }
    serialize() { return '<x:xmpmeta>' + Object.entries(this.p).map(([k, v]) => `<premierePrivateProjectMetaData:${k}>${v}</premierePrivateProjectMetaData:${k}>`).join('') + '</x:xmpmeta>'; }
  }
  const ctx = { app: { project, path: '/Applications/Premiere/' }, $: { os: 'Macintosh' }, JSON, XMPMeta, ExternalObject: {}, File: function (p) { return { exists: fs.existsSync(p) }; } };
  vm.createContext(ctx);
  for (const f of ['jsx/host.jsx', 'jsx/tools/memorybox.jsx']) vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
  const call = (name, a) => { const r = JSON.parse(ctx.UStudio.run(name, JSON.stringify(a))); if (!r.ok) throw new Error(name + ': ' + JSON.stringify(r.error)); return r.data; };
  return { call, root, all, schema, writes, item, project };
}
const photo = path.join(FIX, 'Photos', '1953', 'IMG_0001.png'), photo2 = path.join(FIX, 'Photos', '1940s', 'IMG_0002.png');
const fields = { description: 'Ruth & Joe', comment: 'Grandma Ruth', logNote: 'Story: Ruth <and> Joe\nPlace: Leeds', scene: 'The wedding', shot: '12 June 1953', client: 'The Test family', keywords: 'x', people: 'y' };
const BIN = 'JMG Ultra Studio/Memory Box – The Test family';

test('premiere memory box: one bin, story-order names, details and id in the project metadata; found again by id', () => {
  const P = makePremiere();
  const r = P.call('mbApply', { binPath: BIN, add: [{ key: 'fam-test/it-1', path: photo, name: '002 – IMG_0001.png', fields }, { key: 'fam-test/it-2', path: photo2, name: '001 – IMG_0002.png', fields: { description: 'Ruth as a girl' } }], update: [] });
  assert.deepStrictEqual([r.added.length, r.failed.length], [2, 0], JSON.stringify(r.failed));
  assert.deepStrictEqual(P.schema, [['MemoryBoxId', 'Memory Box id', 2]]);
  const c = P.all().find(x => x.name === '002 – IMG_0001.png');
  assert.ok(c && c.parent.name === 'Memory Box – The Test family' && c.parent.parent.name === 'JMG Ultra Studio');
  for (const k of ['MemoryBoxId>fam-test/it-1<', 'Column.PropertyText.Description>Ruth &amp; Joe<', 'Column.Intrinsic.LogNote>Story: Ruth &lt;and> Joe\nPlace: Leeds<', 'Column.PropertyText.Scene>The wedding<', 'Column.PropertyText.Shot>12 June 1953<', 'Column.PropertyText.Client>The Test family<', 'Column.PropertyText.Comment>Grandma Ruth<']) assert.ok(c.md.includes(k), k);
  assert.ok(P.writes.every(w => w.fields.includes('MemoryBoxId')), 'the fields written are named to Premiere');
  // moved by the editor: still found
  const mine = P.root.createBin('My selects'); c.moveBin(mine);
  const scan = P.call('mbScan', { family: 'fam-test' });
  assert.deepStrictEqual(scan.map(s => [s.key, s.bin]).sort(), [['fam-test/it-1', 'My selects'], ['fam-test/it-2', 'JMG Ultra Studio / Memory Box – The Test family']]);
  assert.deepStrictEqual(P.call('mbScan', { family: 'other' }), []);
});

test('premiere memory box: updates by id (relinked, renamed only when the name is ours); a hand-imported file tagged, not imported twice', () => {
  const P = makePremiere();
  const hand = P.item('IMG_0001.png', { p: photo }); P.root._kids.push(hand); hand.parent = P.root;
  const r = P.call('mbApply', { binPath: BIN, add: [{ key: 'fam-test/it-1', path: photo, name: '002 – IMG_0001.png', fields }], update: [] });
  assert.ok(r.added[0].existing); assert.strictEqual(hand.name, '002 – IMG_0001.png');
  assert.strictEqual(P.all().filter(x => x.type === 1).length, 1, 'no second clip');
  hand.path = '/gone/IMG_0001.png';
  const [s] = P.call('mbScan', { family: 'fam-test' });
  assert.ok(s.offline);
  const u = P.call('mbApply', { binPath: BIN, add: [], update: [{ key: s.key, clipId: s.id, name: '003 – IMG_0001.png', fields: Object.assign({}, fields, { description: 'New story' }), relink: photo }] });
  assert.deepStrictEqual([u.updated, u.relinked, u.failed.length], [1, 1, 0]);
  assert.strictEqual(hand.path, photo); assert.strictEqual(hand.name, '003 – IMG_0001.png');
  assert.ok(hand.md.includes('Description>New story<'));
  hand.name = 'Opening shot';
  P.call('mbApply', { binPath: BIN, add: [], update: [{ key: s.key, clipId: s.id, name: '004 – IMG_0001.png', fields }] });
  assert.strictEqual(hand.name, 'Opening shot', 'a name the editor gave is kept');
});
