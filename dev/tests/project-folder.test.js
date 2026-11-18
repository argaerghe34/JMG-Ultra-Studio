// Everything Ultra Studio keeps for a project travels in the project's "JMG Ultra Studio" folder (1.3.37): the tools'
// project data (– Project.json) merged value by value between computers, and the project's own choices.
const assert = require('assert'), path = require('path'), fs = require('fs'), os = require('os');
const { load, test } = require('./harness');
const US = load([]);
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'us-proj-'));
const read = f => JSON.parse(fs.readFileSync(f, 'utf8'));

test('a Premiere project gets its folder at once, with a note, and the tools’ data in “– Project.json”', () => {
  const dir = tmp(), prproj = path.join(dir, 'Promo: v2.prproj');
  const st = US.projectStore(prproj);
  const folder = path.join(dir, 'JMG Ultra Studio');
  assert.ok(fs.existsSync(path.join(folder, 'Read me.txt')), 'the folder is made when the project opens');
  assert.strictEqual(st.sharedFile(), path.join(folder, 'Promo- v2 – Project.json'));
  st.set('memoryBox', { fam: { at: 1 } });
  st.set('storySync', { id: 'only-here' });
  st.flush();
  const out = read(st.sharedFile());
  assert.deepStrictEqual(out.memoryBox, { fam: { at: 1 } });
  assert.ok(out._at.memoryBox > 0, 'each value says when it changed');
  assert.ok(!('storySync' in out) && !('projectPath' in out), 'what’s about this computer only stays here');
});

test('two computers: each finds the other’s data, the newer value wins, nothing of either is lost', () => {
  const dir = tmp(), shared = US.projectStore.sharedFile(path.join(dir, 'Film'));
  const mac = US.projectStore('resolve://mac/Film').attach(shared);
  mac.set('checkMarkers', { a: ['g1'] }); mac.set('layerColours', { s: [1] }); mac.flush();
  // the PC opens the project: it has nothing yet, so it takes everything
  const pc = US.projectStore('resolve://pc/Film').attach(shared);
  assert.deepStrictEqual(pc.get('checkMarkers'), { a: ['g1'] });
  assert.deepStrictEqual(pc.get('layerColours'), { s: [1] });
  // the PC changes one value later; the Mac changes another
  const t0 = Date.now(); while (Date.now() === t0) { /* a later millisecond */ }
  pc.set('checkMarkers', { a: ['g1', 'g2'] }); pc.flush();
  mac.set('soundMarkers', { k: 1 }); mac.flush();
  assert.deepStrictEqual(mac.get('checkMarkers'), { a: ['g1', 'g2'] }, 'the PC’s newer value reached the Mac');
  assert.deepStrictEqual(read(shared).soundMarkers, { k: 1 }, 'and the Mac’s own change is kept');
  assert.deepStrictEqual(read(shared).checkMarkers, { a: ['g1', 'g2'] });
});

test('an unreadable or missing shared file is never a reason to lose this computer’s data', () => {
  const dir = tmp(), shared = US.projectStore.sharedFile(path.join(dir, 'Doc'));
  fs.mkdirSync(path.dirname(shared), { recursive: true });
  fs.writeFileSync(shared, '{ half a file');
  const st = US.projectStore('resolve://x/Doc');
  st.set('memoryBox', { keep: true });
  st.attach(shared);
  assert.deepStrictEqual(st.get('memoryBox'), { keep: true });
  st.flush();
  assert.deepStrictEqual(read(shared).memoryBox, { keep: true }, 'replaced by a whole copy');
});

test('Settings › Keep Ultra Studio’s work with the project off: nothing is written beside the project', () => {
  const dir = tmp();
  US.settings.set('story.withProject', false);
  try {
    const st = US.projectStore(path.join(dir, 'Off.prproj'));
    st.set('memoryBox', 1); st.flush();
    assert.strictEqual(st.sharedFile(), '');
    assert.ok(!fs.existsSync(path.join(dir, 'JMG Ultra Studio')));
  } finally { US.settings.set('story.withProject', true); }
});

test('the project’s own choices (a script typed in, crops per person) live with the project', () => {
  const dir = tmp(), keep = US.ctx.project;
  try {
    US.settings.set('takes.script', 'from before');
    US.ctx.project = { path: path.join(dir, 'One.prproj'), name: 'One' };
    assert.strictEqual(US.projectSettings.get('takes.script', ''), 'from before', 'a project without its own starts from the last one used');
    US.projectSettings.set('takes.script', 'One’s script');
    US.ctx.project = { path: path.join(dir, 'Two.prproj'), name: 'Two' };
    US.projectSettings.set('takes.script', 'Two’s script');
    US.ctx.project = { path: path.join(dir, 'One.prproj'), name: 'One' };
    assert.strictEqual(US.projectSettings.get('takes.script', ''), 'One’s script');
    US.projectStore(US.ctx.project.path).flush();
    assert.strictEqual(read(path.join(dir, 'JMG Ultra Studio', 'One – Project.json'))['set.takes.script'], 'One’s script', 'and travels with it');
  } finally { US.ctx.project = keep; }
});
