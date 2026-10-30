const assert = require('assert');
const { load, test } = require('./harness');
const US = load(['js/tools/01-overnight.js']);

test('overnight footage: camera clips only – not Ultra Studio’s own bins, subclips, stills or offline media', () => {
  const v = (name, extra) => Object.assign({ id: name, name, kind: 'video', path: '/f/' + name, bin: 'Footage', offline: false, subclip: false }, extra);
  const got = US.overnight.footageOf([v('A.mov'), v('B.mp4', { offline: true }), v('C.mov', { subclip: true }), v('D.png', { path: '/f/D.png' }),
    v('E.mov', { bin: 'JMG Ultra Studio / Selects' }), v('F.mov', { bin: 'Interviews / Day 1' }), { id: 'w', kind: 'audio', path: '/f/w.wav' }, null]);
  assert.deepStrictEqual(got.map(x => x.id), ['A.mov', 'F.mov']);
});
test('overnight is understood by the Assistant', () => {
  assert.ok(US.actions.get('overnight.run').match('get this project ready overnight'));
  assert.strictEqual(US.actions.get('overnight.run').match('cut the silences'), null);
});

test('overnight: a recipe runs inside the night’s job; an edit step is left for the morning', async () => {
  const { load: load2 } = require('./harness');
  const U = load2(['ui', 'app', 'js/tools/42-recipes.js', 'js/tools/01-overnight.js']);
  const ran = [];
  U.actions.register({ id: 'test.night', tool: 'x', title: 'Night step', params: {}, run: async (p, job) => { ran.push(job.id); return { summary: 'ok' }; } });
  const job = { id: 'night-1', set() { return job; }, progress() {}, check() {}, range() { return job; } };
  const r1 = U.recipes.save({ name: 'Night', steps: [{ action: 'test.night' }, { action: 'test.night' }] });
  const out1 = await U.overnight.RUNNERS.recipe(job, { recipe: r1.id });
  assert.deepStrictEqual(ran, ['night-1', 'night-1'], 'both steps inside the one night job');
  assert.ok(/all 2 steps done/.test(out1.summary));
  const r2 = U.recipes.save({ name: 'With an edit', steps: [{ action: 'test.night' }, { edit: 'dissolves on V1' }, { action: 'test.night' }] });
  const out2 = await U.overnight.RUNNERS.recipe(job, { recipe: r2.id });
  assert.ok(/1 of 3 steps done – step 2 is an edit/.test(out2.summary), out2.summary);
  assert.ok(U.overnight.STEPS.some(s => s.id === 'beats') && U.overnight.STEPS.some(s => s.id === 'clips'));
});
