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

// Resolve: the project's folder is found as soon as the project opens (not only when Story asks), with the same guess
// (storyProjectFile, next to the media); Home › Choose the project's folder… keeps a chosen one for that project.
async function asResolve(fn) {
  const keep = { is: US.app.is, call: US.host.call, ctx: US.ctx.project }, calls = [];
  US.app.is = id => id === 'resolve';
  try { return await fn(calls, answer => { US.host.call = async (name, a) => { calls.push([name, a]); return answer(a || {}); }; }); }
  finally { US.app.is = keep.is; US.host.call = keep.call; US.ctx.project = keep.ctx; }
}
const tick = () => new Promise(r => setTimeout(r, 0));

test('Resolve: the project’s folder is attached as soon as the project opens, with the guess from its media', () => asResolve(async (calls, host) => {
  const media = tmp(), ident = path.join(tmp(), 'Resolve projects', 'Docs [abc].drp');
  host(a => (a.prefer ? { path: path.join(a.prefer, 'Docs'), folder: a.prefer, found: false, reason: '' } : { path: path.join(media, 'Docs'), folder: media, found: false, reason: '' }));
  const seen = [];
  US.bus.on('project-folder', f => seen.push(f));
  US.ctx.project = { name: 'Docs', path: ident };
  US.bus.emit('context', US.ctx); await tick(); await tick();
  assert.deepStrictEqual(calls.map(c => c[0]), ['storyProjectFile'], 'asked once, without Story');
  assert.strictEqual(calls[0][1].prefer, undefined, 'nothing remembered yet: the guess');
  const st = US.projectStore(ident);
  assert.strictEqual(st.sharedFile(), path.join(media, 'JMG Ultra Studio', 'Docs – Project.json'));
  assert.ok(fs.existsSync(path.join(media, 'JMG Ultra Studio', 'Read me.txt')), 'the folder is made with its note');
  assert.strictEqual(st.get('storyFolder'), media, 'remembered so it doesn’t move');
  assert.strictEqual(seen.length, 1); assert.strictEqual(seen[0].ident, ident); assert.strictEqual(seen[0].chosen, false);
  assert.strictEqual(US.projectFolder.known(ident).folder, media);
  // polled again with the same project: not asked again; Story's question gets the same answer
  US.bus.emit('context', US.ctx); await tick();
  const again = await US.projectFolder.ask(ident);
  assert.strictEqual(calls.length, 1); assert.strictEqual(again.folder, media);
}));

test('Resolve: Choose the project’s folder… is remembered for that project, and its data moves there', () => asResolve(async (calls, host) => {
  const media = tmp(), mine = tmp(), ident = path.join(tmp(), 'Film [def].drp');
  host(a => { const f = a.prefer && fs.existsSync(a.prefer) ? a.prefer : media; return { path: path.join(f, 'Film'), folder: f, found: false, reason: '' }; });
  US.ctx.project = { name: 'Film', path: ident };
  await US.projectFolder.ask(ident);
  const st = US.projectStore(ident);
  st.set('memoryBox', { m: 1 });
  const r = await US.projectFolder.choose(mine, ident);
  assert.strictEqual(calls[calls.length - 1][1].prefer, mine, 'Resolve is asked with the chosen folder');
  assert.deepStrictEqual([r.folder, r.chosen], [mine, true]);
  assert.strictEqual(st.sharedFile(), path.join(mine, 'JMG Ultra Studio', 'Film – Project.json'));
  st.flush();
  assert.deepStrictEqual(read(st.sharedFile()).memoryBox, { m: 1 }, 'the project’s data is written in the chosen folder');
  assert.ok(!('storyFolder' in read(st.sharedFile())) && !('folderChosen' in read(st.sharedFile())), 'the choice is about this computer');
  // opened again later: asked with the remembered folder
  const n = calls.length;
  await US.projectFolder.ask(ident, { again: true });
  assert.strictEqual(calls[n][1].prefer, mine);
  assert.strictEqual(US.projectFolder.known(ident).chosen, true);
}));

test('Resolve: no media and no folder chosen – kept on this computer; a failed answer is asked again', () => asResolve(async (calls, host) => {
  const ident = path.join(tmp(), 'Empty [123].drp');
  host(() => ({ path: '', folder: '', found: false, reason: 'nomedia' }));
  const r = await US.projectFolder.ask(ident);
  assert.strictEqual(r.reason, 'nomedia');
  assert.strictEqual(US.projectStore(ident).sharedFile(), '', 'nothing beside the project');
  const id2 = path.join(tmp(), 'Busy [456].drp');
  host(() => { throw new Error('Resolve is busy'); });
  await assert.rejects(US.projectFolder.ask(id2));
  host(() => ({ path: '', folder: '', found: false, reason: 'nomedia' }));
  assert.strictEqual((await US.projectFolder.ask(id2)).reason, 'nomedia', 'asked again after the failure');
}));

test('Premiere: the project folder is the .prproj’s, and Resolve is never asked', async () => {
  const keep = US.host.call; let asked = 0;
  US.host.call = async () => { asked++; return {}; };
  try {
    const dir = tmp(), prproj = path.join(dir, 'P.prproj');
    assert.strictEqual(await US.projectFolder.ask(prproj), null);
    assert.strictEqual(await US.projectFolder.choose(dir, prproj), null);
    const keepCtx = US.ctx.project; US.ctx.project = { name: 'P', path: prproj };
    US.bus.emit('context', US.ctx); await tick(); US.ctx.project = keepCtx;
    assert.strictEqual(asked, 0);
    assert.strictEqual(US.projectStore(prproj).sharedFile(), path.join(dir, 'JMG Ultra Studio', 'P – Project.json'));
  } finally { US.host.call = keep; }
});
