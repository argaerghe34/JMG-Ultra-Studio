// 1.3.9: a target length for builds, Recipes (saved chains of steps), and Deliver › Episode text.
const assert = require('assert');
const { load, test } = require('./harness');
global.addEventListener = global.addEventListener || (() => {});
global.ResizeObserver = global.ResizeObserver || function () { return { observe() {} }; };
const US = load(['time', 'transcript', 'ui', 'app', 'js/tools/22-story-glossary.js', 'js/tools/22-story-board.js', 'js/tools/22-story-export.js', 'js/tools/22-story-timeline.js', 'js/tools/22-story-narrative.js', 'js/tools/22-story-moments.js', 'js/tools/22-story-ai.js', 'js/tools/22-story.js', 'js/tools/33-deliver-text.js', 'js/tools/42-recipes.js']);
const S = US.story, R = US.recipes, E = US.episodeText;
const mk = (id, start, end, text, speaker = 'Ruth') => ({ id, start, end, speaker, text });

test('target length: weakest lines go from the longest group until it fits ±10%; pinned and each group’s last line stay; shorter is reported', () => {
  const lines = [mk('a', 0, 10, 'My grandmother baked every single Friday for the whole street.'), mk('b', 10, 20, 'um yeah'), mk('c', 20, 30, 'She never wrote a recipe down, not once, in her whole life.'),
    mk('d', 30, 40, 'We moved here in 1962 and the street welcomed us.'), mk('e', 40, 50, 'so'), mk('f', 50, 60, 'It was the kindest place I have ever lived, truly.')];
  S._useState({ transcripts: [{ key: 't', name: 'T', lines }] });
  const g = [{ name: 'Family', lineIds: ['a', 'b', 'c'], pinned: new Set() }, { name: 'Moving', lineIds: ['d', 'e', 'f'], pinned: new Set(['e']) }];
  const r = S.fitToLength(g, 40);
  assert.ok(r.seconds <= 44, `fits: ${r.seconds}`);
  assert.ok(r.removed.includes('b') && !r.removed.includes('e'), 'the weak “um yeah” goes; the pinned “so” stays');
  assert.ok(r.groups.every(x => x.lineIds.length >= 1));
  assert.strictEqual(S.fitToLength(g, 200).short, true, 'never adds – says it’s short');
  assert.deepStrictEqual([S.parseLength('3:00'), S.parseLength('90'), S.parseLength('2 min'), S.parseLength('1m 30s'), S.parseLength('')], [180, 90, 120, 90, 0]);
  assert.strictEqual(US.actions.get('story.build').match('build a 3 minute cut from the themes').seconds, 180);
});

test('recipes: saved with only the settings that differ, replaced by name, run in order; an edit step is handed over; starters listed', async () => {
  US.settings.set('recipes', []);
  const ran = [];
  US.actions.register({ id: 'test.one', tool: 'x', title: 'One', params: { n: { type: 'number', default: 1 } }, run: async p => { ran.push(['one', p.n]); return { summary: 'one done' }; } });
  US.actions.register({ id: 'test.two', tool: 'x', title: 'Two', params: {}, run: async () => { ran.push(['two']); return { summary: 'two done' }; } });
  const r = R.save({ name: 'My prep', steps: [{ action: 'test.one', params: { n: 1 } }, { edit: 'dissolves on V1', where: 'sequence' }, { action: 'test.two', params: {} }, { action: 'nope' }] });
  assert.deepStrictEqual(r.steps, [{ action: 'test.one', params: {} }, { edit: 'dissolves on V1', where: 'sequence' }, { action: 'test.two', params: {} }], 'defaults left out; unknown actions dropped');
  R.save({ name: 'my prep', steps: [{ action: 'test.two' }] });
  assert.strictEqual(R.list().filter(x => !x.starter).length, 1, 'same name: replaced');
  const again = R.save({ name: 'Full', steps: [{ action: 'test.one', params: { n: 5 } }, { edit: 'colour the drone clips', where: 'project' }, { action: 'test.two' }] });
  const edits = [], steps = [];
  const out = await R.run(again, { onStep: (i, s, phase) => steps.push(`${i}:${phase}`), onEdit: async s => { edits.push(s); return true; } });
  assert.deepStrictEqual(ran, [['one', 5], ['two']]);
  assert.deepStrictEqual(edits, [{ edit: 'colour the drone clips', where: 'project' }]);
  assert.strictEqual(out.stoppedAt, -1);
  const stop = await R.run(again, { onEdit: async () => false });
  assert.strictEqual(stop.stoppedAt, 1, 'a declined edit stops the recipe');
  assert.ok(R.describe(again).includes('One → Edit: “colour the drone clips” → Two'));
});

test('episode text: the listing, the answer tidied (chapters valid for YouTube, made-up quotes dropped), basic version without AI, one text file', () => {
  const paras = [{ start: 0, end: 30, name: 'Ruth', text: 'Welcome. My grandmother baked every Friday for the whole street.', entries: [{ start: 0, end: 30, text: 'Welcome. My grandmother baked every Friday for the whole street.' }] },
    { start: 31, end: 90, name: 'Sam', text: 'She spoke four languages and never wrote a recipe down.', entries: [{ start: 31, end: 90, text: 'She spoke four languages and never wrote a recipe down.' }] }];
  assert.ok(/\[0:31 \| 31\] Sam: She spoke four languages/.test(E.listing(paras)));
  const req = E.request(paras, { title: 'Episode 3', notes: 'Show: Family Recipes' });
  assert.ok(/Episode: Episode 3/.test(req.user[0]) && /Show: Family Recipes/.test(req.user[0]) && req.schema === E.SCHEMA);
  const p = E.organise({ titles: ['Friday baking'], description: 'About baking.', showNotes: [{ at: 40, text: 'Languages' }, { at: 5, text: 'Baking' }],
    chapters: [{ at: 3, title: 'Baking' }, { at: 8, title: 'Too soon' }, { at: 40, title: 'Languages' }, { at: 500, title: 'Past the end' }],
    quotes: [{ at: 31, speaker: 'Sam', text: 'She spoke four languages and never wrote a recipe down.' }, { at: 10, speaker: 'Ruth', text: 'We were the richest family in town.' }],
    social: { short: 'x', linkedin: 'y', instagram: 'z' }, keywords: ['baking'] }, paras, 90);
  assert.deepStrictEqual(p.chapters.map(c => [c.t, c.title]), [[0, 'Baking'], [40, 'Languages']], 'first moved to 0, under-10-second and end-of-episode ones dropped');
  assert.deepStrictEqual(p.quotes.map(q => q.speaker), ['Sam'], 'a quote nobody said is dropped');
  assert.deepStrictEqual(p.showNotes.map(n => n.t), [5, 40]);
  const b = E.basic(paras, [{ start: 30, name: 'Languages' }]);
  assert.deepStrictEqual(b.chapters.map(c => c.title), ['Intro', 'Languages']); assert.ok(b.quotes.length >= 1 && b.by === 'basic');
  const txt = E.toText(p, 'Episode 3');
  assert.ok(/# Episode 3/.test(txt) && /## Chapters\n0:00 Baking/.test(txt) && /> “She spoke four languages/.test(txt) && /\*\*LinkedIn:\*\* y/.test(txt));
});
