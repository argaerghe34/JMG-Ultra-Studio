// Memory Box in the real editor: a team download (made here from the unit-test fixture, with real photos, a real video
// and a real sound file as the voice note) brought into one bin – each clip named in story order, carrying its Memory
// Box id – and brought in again: the same clips updated, none added twice. Works in Premiere and Resolve.
const fs = require('fs'), path = require('path');
const MB = US.memoryBox;
const root = path.join(T.dir, 'dev', 'test-project', 'memorybox', 'The E2E family');
const fix = path.join(T.dir, 'dev', 'tests', 'fixtures', 'memorybox');
const json = JSON.parse(fs.readFileSync(path.join(fix, 'memorybox.json'), 'utf8'));
json.family = { id: 'fam-e2e', name: 'The E2E family' };
const put = (rel, from) => { const p = path.join(root, ...rel.split('/')); fs.mkdirSync(path.dirname(p), { recursive: true }); if (!fs.existsSync(p)) fs.copyFileSync(from, p); return fs.statSync(p).size; };
for (const it of json.items) {
  if (it.id === 'it-1' || it.id === 'it-2') it.bytes = put(it.file.path, path.join(fix, ...it.file.path.split('/')));
  if (it.id === 'it-3') it.bytes = put(it.file.path, T.media('selects', 'S05_static_nothing.mp4'));
  if (it.voiceNote) { it.voiceNote.path = 'Voice notes/IMG_0001 - voice.wav'; put(it.voiceNote.path, T.media('audio', 'music_92bpm.wav')); }
  it.sha256 = null;
}
fs.writeFileSync(path.join(root, 'memorybox.json'), JSON.stringify(json, null, 2));

const d = await MB.net.openDownload([root]);
const model = MB.parse(d.json), source = { kind: 'folder', root: d.root };
const job = US.jobs.testJob('memorybox');
const first = await MB.bringIn(model, model.items, source, { voiceNotes: true }, job);
const scan1 = await US.host.call('mbScan', { family: 'fam-e2e' });
T.assert(scan1.length === 4, '3 originals + 1 voice note, once each: ' + JSON.stringify(scan1.map(s => [s.key, s.name])));
const byKey = k => scan1.find(s => s.key === k);
T.assert(byKey('fam-e2e/it-2').name === '001 – IMG_0002.png', 'story order first: ' + byKey('fam-e2e/it-2').name);
T.assert(byKey('fam-e2e/it-1#voice').name === '002 – IMG_0001.png – voice note', 'voice note next to its photo: ' + byKey('fam-e2e/it-1#voice').name);
T.assert(scan1.every(s => s.bin === MB.binPath(model).split('/').join(' / ')), 'one bin: ' + scan1.map(s => s.bin).join(', '));

// the family changes a story; bring it in again: updated, not duplicated
json.items[0].story = 'Ruth and Joe on the steps (updated)';
fs.writeFileSync(path.join(root, 'memorybox.json'), JSON.stringify(json, null, 2));
const model2 = MB.parse((await MB.net.openDownload([root])).json);
const second = await MB.bringIn(model2, model2.items, source, { voiceNotes: true }, job);
const scan2 = await US.host.call('mbScan', { family: 'fam-e2e' });
T.assert(scan2.length === 4 && second.added === 0 && second.updated === 4, 'second time: 4 updated, none added: ' + second.summary);
const info = await US.host.call('itemInfo', { id: byKey('fam-e2e/it-1').id, columns: true });
if (!US.app.is('resolve')) {
  const md = await US.host.rawEval('(function(){var it=null;UStudio.walk(app.project.rootItem,function(c){if(c.nodeId==' + JSON.stringify(info.id) + '){it=c;return false;}});return it?it.getProjectMetadata():"";})()');
  T.assert(/updated/.test(md) && /MemoryBoxId/.test(md), 'the new story is in the clip’s project metadata');
} else {
  const md = await T.devEval('const it = R.needItem(' + JSON.stringify(info.id) + '); return { d: it.GetMetadata("Description"), id: it.GetThirdPartyMetadata("MemoryBoxId") };');
  T.assert(/updated/.test(md.d) && md.id === 'fam-e2e/it-1', 'Description and id in Resolve: ' + JSON.stringify(md));
}
return [first.summary, second.summary];
