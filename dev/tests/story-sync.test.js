// Story travels with the project: which copy opens, the copy next to the project, and transcripts read again on
// another computer keeping their line ids.
const assert = require('assert'), path = require('path'), fs = require('fs'), os = require('os');
const { load, test, MEDIA } = require('./harness');
global.addEventListener = global.addEventListener || (() => {});
global.ResizeObserver = global.ResizeObserver || function () { return { observe() {} }; };
const US = load(['time', 'transcript', 'ui', 'app', 'js/tools/22-story-ai.js', 'js/tools/22-story-sync.js', 'js/tools/22-story.js']);
const Y = US.storySync, S = US.story, T = US.transcript;
const TR = path.join(MEDIA, 'transcripts');
const withWork = (id, at, extra = {}) => Object.assign({ transcripts: [{ key: 'a', lines: [] }], themes: [], wall: { columns: [] }, sync: { id, at } }, extra);
const empty = (id, at) => ({ transcripts: [], themes: [], wall: { columns: [] }, sync: { id, at } });

test('choosing the copy: only one, the same, or the one that changed', () => {
  assert.deepStrictEqual(Y.choose(null, null, null), { pick: 'none', conflict: false });
  assert.strictEqual(Y.choose(withWork('a', 1), null, null).pick, 'local', 'only this computer’s (before 1.3.1)');
  assert.strictEqual(Y.choose(null, withWork('a', 1), null).pick, 'shared', 'first time on the other computer');
  assert.strictEqual(Y.choose(withWork('a', 1), withWork('a', 1), 'a').pick, 'shared', 'the same copy');
  // alternating computers: the other one changed it since this one last saw it
  assert.deepStrictEqual(Y.choose(withWork('a', 1), withWork('b', 2), 'a'), { pick: 'shared', conflict: false });
  // changed here while the drive was away: the shared copy is still the one last seen
  assert.deepStrictEqual(Y.choose(withWork('c', 3), withWork('a', 1), 'a'), { pick: 'local', conflict: false });
  // changed on both: the newer opens and the other is offered
  assert.deepStrictEqual(Y.choose(withWork('c', 3), withWork('b', 5), 'a'), { pick: 'shared', conflict: true });
  assert.deepStrictEqual(Y.choose(withWork('c', 9), withWork('b', 5), 'a'), { pick: 'local', conflict: true });
});
test('choosing the copy: first meeting on a computer – an empty side never wins or asks', () => {
  assert.deepStrictEqual(Y.choose(empty('x', 9), withWork('b', 1), null), { pick: 'shared', conflict: false });
  assert.deepStrictEqual(Y.choose(withWork('x', 1), empty('b', 9), null), { pick: 'local', conflict: false });
  assert.deepStrictEqual(Y.choose(withWork('x', 1), withWork('b', 9), null), { pick: 'shared', conflict: true });
  assert.deepStrictEqual(Y.choose({ transcripts: [{}], themes: [] }, withWork('b', 9), null).conflict, true, 'an old file without sync info');
});
test('the shared file’s name works on Windows and sits in a JMG Ultra Studio folder next to the project', () => {
  assert.strictEqual(Y.safeName('Promo: v2 "final"?'), 'Promo- v2 -final--');
  assert.strictEqual(Y.safeName('FJL Summer 2026'), 'FJL Summer 2026');
  assert.strictEqual(Y.safeName('ends with dot.'), 'ends with dot');
  const f = Y.sharedFile('/Volumes/Work/FJL/FJL Summer 2026.prproj');
  assert.strictEqual(path.basename(path.dirname(f)), 'JMG Ultra Studio');
  assert.strictEqual(path.basename(f), 'FJL Summer 2026 – Story.json');
});

test('a transcript read on another computer (new path) is matched to the one already in Story', () => {
  const gone = () => false;
  const ruth = [{ text: 'I grew up in Stamford Hill.' }, { text: 'My father ran a bakery.' }];
  const ts = [{ key: '/Volumes/Work/Ruth.mov', path: '/Volumes/Work/Ruth.mov', name: 'Ruth.mov', itemId: '000f1', lines: ruth },
    { key: '/Volumes/Work/David.mov', path: '/Volumes/Work/David.mov', name: 'David.mov', itemId: '', lines: [{ text: 'Shalom.' }] }];
  assert.strictEqual(Y.matchTranscript(ts, { key: 'E:\\Work\\Ruth.mov', path: 'E:\\Work\\Ruth.mov', name: 'Ruth.mov', lines: ruth }, gone), ts[0], 'by file name across \\ and /');
  // the same name but different words: another clip (another card, or a new clip while the old one is offline)
  assert.strictEqual(Y.matchTranscript(ts, { key: 'E:\\Card2\\Ruth.mov', path: 'E:\\Card2\\Ruth.mov', name: 'Ruth.mov', lines: [{ text: 'My grandmother came from Vilnius.' }] }, gone), null);
  // transcribed again: lines split differently, words alike
  assert.strictEqual(Y.matchTranscript(ts, { key: 'E:\\Work\\Ruth.mov', path: 'E:\\Work\\Ruth.mov', name: 'Ruth.mov', lines: [{ text: 'I grew up in Stamford Hill. My father ran a bakery.' }] }, gone), ts[0]);
  assert.strictEqual(Y.matchTranscript(ts, { key: 'E:\\x\\renamed.mov', path: 'E:\\x\\renamed.mov', name: 'renamed', itemId: '000f1' }, gone), ts[0], 'by Premiere’s clip id');
  assert.strictEqual(Y.matchTranscript(ts, { key: 'E:\\Work\\Miriam.mov', path: 'E:\\Work\\Miriam.mov', name: 'Miriam.mov' }, gone), null, 'a new interview');
  assert.strictEqual(Y.matchTranscript(ts, { key: '/Volumes/Work/David.mov', path: '/Volumes/Work/David.mov' }, () => true), ts[1], 'same path');
  // a clip whose own file is still there is never taken over by another with the same name
  assert.strictEqual(Y.matchTranscript(ts, { key: '/Other/Ruth.mov', path: '/Other/Ruth.mov', name: 'Ruth.mov', lines: ruth }, () => true), null);
});
test('two cards’ C0001.MP4 are told apart by what is said', () => {
  const L = texts => texts.map((text, i) => ({ id: 'x' + i, start: i * 5, end: i * 5 + 4, text }));
  const a = { key: '/A/C0001.MP4', path: '/A/C0001.MP4', name: 'C0001.MP4', lines: L(['We started the food bank in 2019.', 'Every Friday the vans go out.']) };
  const b = { key: '/B/C0001.MP4', path: '/B/C0001.MP4', name: 'C0001.MP4', lines: L(['My grandmother came from Vilnius.', 'She never talked about it.']) };
  const it = { key: 'E:\\B\\C0001.MP4', path: 'E:\\B\\C0001.MP4', name: 'C0001.MP4', lines: L(['My grandmother came from Vilnius.', 'She never talked about it.']) };
  assert.strictEqual(Y.matchTranscript([a, b], it, () => false), b);
});
test('line ids carry over: same timing keeps the id, a line that moved a little takes its old id', () => {
  const old = [{ id: 'p-1', start: 1, text: 'I grew up in Stamford Hill.' }, { id: 'p-2', start: 6, text: 'My father ran a bakery on the corner.' }, { id: 'p-3', start: 12, text: 'We had nothing, but we had each other.' }];
  const now = [{ id: 'p-1', start: 1, text: 'I grew up in Stamford Hill.' }, { id: 'p-6.4', start: 6.4, text: 'My father ran a bakery on the corner there.' }, { id: 'p-20', start: 20, text: 'Something new entirely different.' }];
  const r = Y.carryIds(old, now);
  assert.deepStrictEqual(now.map(l => l.id), ['p-1', 'p-2', 'p-20']);
  assert.deepStrictEqual(r, { kept: 2, changed: 1 });
  assert.ok(!old.some(l => l.taken), 'no marks left behind');
});

test('Story: reading the transcripts again on the PC keeps the themes', () => {
  const files = ['I001_interview.srt', 'Interview_David_Cohen.txt'];
  const seg = files.map(f => T.parseFile(path.join(TR, f)).segments);
  S._useState({});
  files.forEach((f, i) => S.addTranscript({ name: f, path: '/Volumes/Work/FJL/' + f, itemId: 'item' + i, source: 'premiere', segments: seg[i] }));
  const st = S.state(), ids = st.transcripts.flatMap(t => t.lines.map(l => l.id));
  st.themes.push({ id: 'th', name: 'Family', lineIds: ids.slice(0, 5).concat(ids.slice(-3)) });
  st.scope = { kind: 'interviews', keys: [st.transcripts[1].key], ids: [] };
  const keys = st.transcripts.map(t => t.key);
  // the PC: the same drive is E:, and Premiere's transcripts come without clip ids
  files.forEach((f, i) => S.addTranscript({ name: f, path: 'E:\\FJL\\' + f, source: 'premiere', segments: seg[i] }));
  assert.strictEqual(st.transcripts.length, 2, 'no duplicate interviews');
  assert.deepStrictEqual(st.transcripts.map(t => t.key), keys, 'keys stay, so the chosen interviews stay chosen');
  assert.deepStrictEqual(st.transcripts.map(t => t.path), files.map(f => 'E:\\FJL\\' + f), 'paths are this computer’s');
  assert.deepStrictEqual(st.transcripts.map(t => t.itemId), ['item0', 'item1']);
  const now = new Set(st.transcripts.flatMap(t => t.lines.map(l => l.id)));
  assert.ok(st.themes[0].lineIds.every(id => now.has(id)), 'every theme line still found');
});

/* ---------- the files ---------- */
function project(name = 'FJL Summer') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'us-proj-'));
  const p = path.join(dir, name + '.prproj'); fs.writeFileSync(p, 'x');
  return { dir, p, local: path.join(dir, 'local-' + Math.random().toString(36).slice(2) + '-story.json') };
}
/** The same project folder reached from "another computer": a different path (another mount point or drive letter). */
function elsewhere(pr) {
  const dir2 = fs.mkdtempSync(path.join(os.tmpdir(), 'us-proj2-'));
  fs.rmSync(dir2, { recursive: true }); fs.symlinkSync(pr.dir, dir2, 'junction');
  return { dir: dir2, p: path.join(dir2, path.basename(pr.p)), local: path.join(os.tmpdir(), 'other-' + Math.random().toString(36).slice(2) + '-story.json') };
}
const save = (sess, s, file) => { sess.stamp(s); US.fsx.writeJSON(file, s); return sess.writeShared(s); };

test('files: an older project’s Story is put next to it, and the other computer opens it', () => {
  const pr = project();
  US.fsx.writeJSON(pr.local, withWork(undefined, 0, { themes: [{ id: 't', name: 'Faith', lineIds: [] }], sync: undefined }));
  const a = Y.open(pr.p, pr.local);
  assert.ok(a.needsWrite && a.state.themes[0].name === 'Faith');
  assert.strictEqual(save(a, a.state, pr.local), null);
  assert.ok(fs.existsSync(Y.sharedFile(pr.p)));
  assert.strictEqual(a.status().where, 'project');
  const pc = elsewhere(pr);
  const b = Y.open(pc.p, pc.local);
  assert.strictEqual(b.state.themes[0].name, 'Faith');
  assert.ok(!b.other && !b.needsWrite);
  // edit on the PC, then back on the Mac: the Mac opens the PC's version, no question
  b.state.themes.push({ id: 'u', name: 'Gratitude', lineIds: [] }); save(b, b.state, pc.local);
  const a2 = Y.open(pr.p, pr.local);
  assert.deepStrictEqual(a2.state.themes.map(t => t.name), ['Faith', 'Gratitude']);
  assert.ok(!a2.other);
  // and again, without changing anything: still the PC's version (this computer's copy was brought up to date)
  const a3 = Y.open(pr.p, pr.local);
  assert.deepStrictEqual(a3.state.themes.map(t => t.name), ['Faith', 'Gratitude']);
  assert.ok(!a3.other && !a3.needsWrite);
});
test('files: changed on both computers – the newer opens, the other is kept as a backup and offered', () => {
  const pr = project(), pc = elsewhere(pr);
  US.fsx.writeJSON(pr.local, withWork('m0', 1));
  const a = Y.open(pr.p, pr.local); save(a, a.state, pr.local);
  const b = Y.open(pc.p, pc.local); save(b, b.state, pc.local);
  // the Mac changes it with the drive away (only its own copy), then the PC changes the shared one later
  const ma = Y.open(pr.p, pr.local); ma.stamp(ma.state); ma.state.sync.at -= 60000; ma.state.note = 'mac'; US.fsx.writeJSON(pr.local, ma.state);
  const pb = Y.open(pc.p, pc.local); pb.state.note = 'pc'; save(pb, pb.state, pc.local);
  const again = Y.open(pr.p, pr.local);
  assert.strictEqual(again.state.note, 'pc', 'the newer one');
  assert.strictEqual(again.other.note, 'mac', 'the other is offered');
  const backups = fs.readdirSync(path.join(pr.dir, 'JMG Ultra Studio')).filter(f => /\(backup from /.test(f));
  assert.strictEqual(backups.length, 1);
  assert.strictEqual(JSON.parse(fs.readFileSync(path.join(pr.dir, 'JMG Ultra Studio', backups[0]))).note, 'mac');
});
test('files: a copy written by the other computer while this one is open isn’t overwritten blindly', () => {
  const pr = project(), pc = elsewhere(pr);
  US.fsx.writeJSON(pr.local, withWork('m0', 1));
  const a = Y.open(pr.p, pr.local); save(a, a.state, pr.local);
  const b = Y.open(pc.p, pc.local); b.state.note = 'pc'; save(b, b.state, pc.local);
  a.state.note = 'mac';
  const theirs = save(a, a.state, pr.local);
  assert.strictEqual(theirs && theirs.note, 'pc', 'the PC’s copy is handed back to offer');
  assert.strictEqual(JSON.parse(fs.readFileSync(Y.sharedFile(pr.p))).note, 'mac');
  assert.ok(fs.readdirSync(path.join(pr.dir, 'JMG Ultra Studio')).some(f => /\(backup from /.test(f)));
});
test('files: a sync service’s conflicted copy is offered and tidied; ._ files and the switch', () => {
  const pr = project();
  US.fsx.writeJSON(pr.local, withWork('m0', 1));
  const a = Y.open(pr.p, pr.local); save(a, a.state, pr.local);
  const dir = path.join(pr.dir, 'JMG Ultra Studio');
  const conflicted = path.join(dir, 'FJL Summer – Story (conflicted copy 2026-10-27).json');
  US.fsx.writeJSON(conflicted, withWork('pc9', Date.now() + 1000, { note: 'pc' }));
  fs.writeFileSync(path.join(dir, '._FJL Summer – Story.json'), 'mac metadata');
  const b = Y.open(pr.p, pr.local);
  assert.strictEqual(b.other && b.other.note, 'pc');
  assert.ok(!fs.existsSync(conflicted), 'renamed to a backup');
  assert.ok(fs.existsSync(path.join(dir, '._FJL Summer – Story.json')), '._ files are left alone');
  assert.strictEqual(Y.open(pr.p, pr.local).other, null, 'asked once');
  US.settings.set('story.withProject', false);
  try {
    const c = Y.open(pr.p, pr.local);
    assert.strictEqual(c.status().reason, 'off');
    assert.strictEqual(c.writeShared(c.state), null);
  } finally { US.settings.set('story.withProject', true); }
});
test('files: a folder that can’t be written keeps Story on this computer, without an error', () => {
  const pr = project();
  fs.writeFileSync(path.join(pr.dir, 'JMG Ultra Studio'), 'a file where the folder would go');
  US.fsx.writeJSON(pr.local, withWork('m0', 1));
  const a = Y.open(pr.p, pr.local);
  save(a, a.state, pr.local);
  assert.deepStrictEqual(a.status(), { where: 'local', reason: 'unwritable' });
});

test('the only clip with that name is not taken over when it says something else (two cards, the PC reads card 2 first)', () => {
  const L = texts => texts.map((text, i) => ({ id: 'x' + i, start: i * 5, end: i * 5 + 4, text }));
  const card1 = { key: '/Volumes/X/Card1/C0001.MP4', path: '/Volumes/X/Card1/C0001.MP4', name: 'C0001.MP4', lines: L(['We started the food bank in 2019.', 'Every Friday the vans go out.']) };
  const card2 = { key: 'E:\\Card2\\C0001.MP4', path: 'E:\\Card2\\C0001.MP4', name: 'C0001.MP4', lines: L(['My grandmother came from Vilnius.', 'She never talked about it.']) };
  assert.strictEqual(Y.matchTranscript([card1], card2, () => false), null);
});
test('files: an older project opened and closed without changes doesn’t ask about two computers next time', () => {
  const pr = project();
  US.fsx.writeJSON(pr.local, withWork(undefined, 0, { sync: undefined }));
  const a = Y.open(pr.p, pr.local);
  assert.ok(a.needsWrite);
  save(a, a.state, pr.local);   // what Story does when it opens one (saveNow: stamped, then the shared copy)
  for (let k = 0; k < 2; k++) { const b = Y.open(pr.p, pr.local); assert.strictEqual(b.other, null); assert.ok(!b.needsWrite); }
  assert.ok(!fs.readdirSync(path.join(pr.dir, 'JMG Ultra Studio')).some(f => /\(backup from /.test(f)), 'no backups');
});
test('files: a copy next to the project that couldn’t be read when opening is never replaced without a backup', () => {
  const pr = project(), pc = elsewhere(pr);
  US.fsx.writeJSON(pr.local, withWork('m0', 1));
  const a = Y.open(pr.p, pr.local); save(a, a.state, pr.local);
  const b = Y.open(pc.p, pc.local); b.state.note = 'pc'; save(b, b.state, pc.local);
  const file = Y.sharedFile(pr.p), good = fs.readFileSync(file);
  fs.writeFileSync(file, good.slice(0, 20));   // half-synced when the Mac opens
  const m = Y.open(pr.p, pr.local);
  assert.strictEqual(m.status().reason, 'unreadable');
  // it arrives in full, then the Mac saves: the PC's copy is kept and offered
  fs.writeFileSync(file, good);
  m.state.note = 'mac';
  const theirs = save(m, m.state, pr.local);
  assert.strictEqual(theirs && theirs.note, 'pc');
  // still unreadable when saving: its bytes are kept first
  const m2 = Y.open(pr.p, pr.local);
  fs.writeFileSync(file, good.slice(0, 20));
  m2.state.note = 'mac2'; save(m2, m2.state, pr.local);
  const dir = path.join(pr.dir, 'JMG Ultra Studio');
  assert.ok(fs.readdirSync(dir).some(f => /backup from unreadable copy/.test(f)));
});
