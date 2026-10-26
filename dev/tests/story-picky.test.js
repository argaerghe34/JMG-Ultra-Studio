// Story: “How picky” (S6) and Find more (S4).
const assert = require('assert'), path = require('path');
const { load, test, MEDIA } = require('./harness');
global.addEventListener = global.addEventListener || (() => {});
global.ResizeObserver = global.ResizeObserver || function () { return { observe() {} }; };
const US = load(['time', 'transcript', 'ui', 'app', 'js/tools/22-story-export.js', 'js/tools/22-story-timeline.js', 'js/tools/22-story-ai.js', 'js/tools/22-story.js']);
const S = US.story, T = US.transcript;
const TR = path.join(MEDIA, 'transcripts');

function fresh(extra = {}) {
  const transcripts = ['I001_interview.srt', 'Interview_David_Cohen.txt', 'Interview_Miriam_Levy.csv'].map((f, i) => {
    const segs = T.parseFile(path.join(TR, f)).segments;
    return { key: f, name: f, path: '/media/' + f, itemId: 'item' + i, source: 'file', lines: T.toLines(segs, 'p' + i) };
  });
  const st = S._useState(Object.assign({ transcripts }, extra));
  return st;
}
const allIds = st => st.transcripts.flatMap(t => t.lines.map(l => l.id));
const subset = (a, b) => a.every(x => b.includes(x));

test('levels nest: Everything useful ⊇ Balanced ⊇ Only the best, for every theme and the whole project', () => {
  const st = fresh();
  st.themes = T.themesOffline(st.transcripts.flatMap(t => t.lines), { max: 8 }).concat([{ id: 'all', name: 'Everything', lineIds: allIds(st) }]);
  S.ensureColours();
  for (const th of st.themes) {
    const a = S.effectiveLines(th, S.PICKY_LEVELS.all), b = S.effectiveLines(th, S.PICKY_LEVELS.balanced), c = S.effectiveLines(th, S.PICKY_LEVELS.best);
    assert.ok(subset(c, b) && subset(b, a), `nested for ${th.name}: ${a.length} ⊇ ${b.length} ⊇ ${c.length}`);
    // the fine-tune slider is monotone too
    let prev = null;
    for (let s = 0; s <= 1.0001; s += 0.05) { const k = S.effectiveLines(th, s); if (prev) assert.ok(subset(k, prev), `monotone at ${s.toFixed(2)} for ${th.name}`); prev = k; }
  }
  const big = st.themes.find(t => t.id === 'all');
  const n = lv => S.effectiveLines(big, S.PICKY_LEVELS[lv]).length;
  assert.ok(n('all') > n('balanced') && n('balanced') > n('best') && n('best') > 0, `counts ${n('all')} / ${n('balanced')} / ${n('best')}`);
});
test('what each level keeps: short and partial lines only in Everything; questions only when asked for; lengths', () => {
  const extra = { key: 'x.srt', name: 'x.srt', path: '/media/x.srt', itemId: 'itemx', source: 'file', lines: [
    { id: 'x-1', start: 0, end: 1.6, speaker: 'Anna', text: 'Yes, my family.' },
    { id: 'x-2', start: 3, end: 9, speaker: 'Anna', text: 'and then my family went to the market where we used to' },
    { id: 'x-3', start: 12, end: 20, speaker: 'Anna', text: 'My family always cooked together on Fridays, and I loved every minute of it.' }] };
  const st = fresh();
  st.transcripts.push(extra); S.reindex();
  const big = { id: 'all', name: 'Everything', lineIds: allIds(st) };
  big.scores = Object.fromEntries(big.lineIds.map(id => [id, 1])); // every line equally on-topic: test the other rules
  st.themes = [big]; S.ensureColours();
  const lines = id => st.transcripts.flatMap(t => t.lines).find(l => l.id === id);
  const short = allIds(st).filter(id => { const l = lines(id); return l.end - l.start < 3 || T.quality(l).reasons.includes('partial sentence'); });
  assert.ok(short.length, 'the samples have short or partial lines');
  const everything = S.effectiveLines(big, S.PICKY_LEVELS.all), balanced = S.effectiveLines(big, S.PICKY_LEVELS.balanced);
  assert.ok(short.some(id => everything.includes(id)), 'Everything useful keeps short/partial lines');
  assert.ok(!short.some(id => balanced.includes(id)), 'Balanced leaves them out (automatic)');
  const asked = allIds(st).filter(id => /interviewer/i.test(lines(id).speaker));
  assert.ok(asked.length && !asked.some(id => everything.includes(id)), 'interviewer questions left out by default');
  st.picky = { interviewer: true };
  assert.ok(asked.some(id => S.effectiveLines(big, S.PICKY_LEVELS.all).includes(id)), '…and kept when included');
  st.picky = { short: 'yes' };
  assert.ok(short.some(id => S.effectiveLines(big, S.PICKY_LEVELS.balanced).includes(id)), 'short lines can be included at any level');
  st.picky = { minLen: 6, maxLen: 9 };
  assert.ok(S.effectiveLines(big, S.PICKY_LEVELS.all).every(id => { const d = lines(id).end - lines(id).start; return d >= 6 && d <= 9; }), 'length bounds');
  st.picky = { maxPerTheme: 3 };
  assert.ok(S.effectiveLines(big, S.PICKY_LEVELS.all).length <= 3, 'most lines per theme');
});
test('at least N lines from every interview – quieter interviewees stay in, and levels still nest', () => {
  const st = fresh();
  const big = { id: 'all', name: 'Everything', lineIds: allIds(st) };
  st.themes = [big]; S.ensureColours();
  const keyOf = id => st.transcripts.find(t => t.lines.some(l => l.id === id)).key;
  st.picky = { maxPerTheme: 2 }; // so plain "best" only keeps two lines
  const best = S.effectiveLines(big, S.PICKY_LEVELS.best);
  assert.ok(new Set(best.map(keyOf)).size < 3, 'without the minimum some interviews are missing');
  st.picky = { maxPerTheme: 2, perInterview: 1 };
  const withMin = S.effectiveLines(big, S.PICKY_LEVELS.best);
  assert.strictEqual(new Set(withMin.map(keyOf)).size, 3, 'every interview is represented');
  assert.ok(subset(withMin, S.effectiveLines(big, S.PICKY_LEVELS.balanced)) && subset(S.effectiveLines(big, S.PICKY_LEVELS.balanced), S.effectiveLines(big, S.PICKY_LEVELS.all)), 'still nested');
});
test('lines you added by hand always stay; a theme can have its own level; the explanation says what was kept', () => {
  const st = fresh();
  const ids = allIds(st);
  const weak = ids.find(id => /interviewer/i.test(st.transcripts.flatMap(t => t.lines).find(l => l.id === id).speaker));
  const th = { id: 't', name: 'Mine', lineIds: ids.slice(0, 20).concat([weak]), manual: [weak] };
  st.themes = [th]; S.ensureColours();
  assert.ok(S.effectiveLines(th, S.PICKY_LEVELS.best).includes(weak), 'manual line kept even at Only the best');
  st.picky = { s: S.PICKY_LEVELS.all };
  th.picky = { s: S.PICKY_LEVELS.best };
  assert.strictEqual(S.pickyFor(th).s, S.PICKY_LEVELS.best);
  assert.deepStrictEqual(S.effectiveLines(th), S.effectiveLines(th, S.PICKY_LEVELS.best));
  const o = S.pickyFor(th);
  assert.ok(/^Only the best: \d+ lines – strong, complete sentences that match the theme closely$/.test(S.describePicky(o, 24)), S.describePicky(o, 24));
  assert.ok(/at least 2 per interview/.test(S.describePicky(Object.assign({}, o, { perInterview: 2 }), 5)));
  assert.ok(/^Custom \(between Balanced and Only the best\)/.test(S.describePicky(Object.assign({}, o, { s: 0.6 }), 9)));
});
test('Find more: only lines not yet selected, with reasons; “not in my cut” leaves out more', async () => {
  const st = fresh();
  const lines = st.transcripts.flatMap(t => t.lines);
  const vol = lines.filter(l => /volunteer/i.test(l.text)).map(l => l.id);
  st.themes = [{ id: 'v', name: 'Volunteering', lineIds: vol.slice(0, 1) }];
  st.wall = { columns: [{ id: 'c', name: 'Narrative', narrative: { seconds: 60 }, cards: [{ lineId: vol[1] }] }] };
  S.ensureColours();
  const r = await S.findMore(null, 'volunteering', { exclude: S.selectedIds() });
  assert.ok(r.length >= 1);
  assert.ok(!r.some(x => x.line.id === vol[0] || x.line.id === vol[1]), 'selected lines left out');
  assert.ok(r.every(x => x.reasons.length && x.rel > 0 && x.rel <= 1), 'every result says why');
  assert.ok(r.some(x => /mentions “volunteering”|related to “volunteering”/.test(x.reasons.join(' '))));
  const inCut = new Set([r[0].line.id]);
  const r2 = await S.findMore(null, 'volunteering', { exclude: new Set([...S.selectedIds(), ...inCut]) });
  assert.ok(!r2.some(x => inCut.has(x.line.id)), 'lines in the cut left out');
  await assert.rejects(() => S.findMore(null, '  '), /Type a topic/);
});
test('Find more with AI: related phrases, picks with reasons, never a selected or unknown line; text only', async () => {
  const st = fresh();
  const lines = st.transcripts.flatMap(t => t.lines);
  const food = lines.find(l => /food bank/.test(l.text)), meals = lines.find(l => /Meals on the doorstep/.test(l.text)), sel = lines.find(l => /youth club/.test(l.text));
  st.themes = [{ id: 'x', name: 'X', lineIds: [sel.id] }]; S.ensureColours();
  const calls = [], saved = US.ai;
  US.ai = { available: () => true, label: () => 'Claude', json: async req => { calls.push(req); return calls.length === 1 ? { phrases: ['food bank', 'meals', 'youth club'] } : { picks: [{ lineId: meals.id, reason: 'neighbours brought food every night' }, { lineId: sel.id, reason: 'already selected' }, { lineId: 'nope', reason: 'x' }, { lineId: food.id, reason: 'helping at the food bank' }] }; } };
  try {
    const r = await S.findMore(null, 'kindness of strangers', { useAI: true, exclude: S.selectedIds() });
    assert.deepStrictEqual(r.map(x => x.line.id), [meals.id, food.id]);
    assert.deepStrictEqual(r[0].reasons, ['neighbours brought food every night']);
    assert.ok(!calls[1].user.includes(sel.id), 'selected lines are not even sent');
    for (const c of calls) assert.strictEqual(c.schema.additionalProperties, false);
    assert.strictEqual(calls[1].schema.properties.picks.items.additionalProperties, false);
    assert.ok(!/\/media\/|item\d/.test(calls[1].user), 'no paths or clip ids sent');
  } finally { US.ai = saved; }
});
test('Find more is understood by the Assistant; plain searches still go to Search', () => {
  const m = t => US.actions.get('story.findMore').match(t);
  assert.deepStrictEqual(m('find anything else about community'), { topic: 'community', notInCut: false, _score: 2.6 });
  assert.deepStrictEqual(m('find more about faith that’s not already in my cut'), { topic: 'faith', notInCut: true, _score: 2.6 });
  assert.strictEqual(m('find anything that touches on the war').topic, 'war');
  assert.strictEqual(m('lines about volunteering'), null);
  assert.strictEqual(m('find the themes'), null);
});
test('a new theme from lines you picked: kept by hand, with its own colour; not re-found by Find themes', () => {
  const st = fresh();
  const ids = allIds(st).slice(0, 3);
  const th = S.newThemeFrom('market day', ids);
  assert.strictEqual(th.name, 'Market day'); assert.deepStrictEqual(th.manual, ids);
  assert.deepStrictEqual(S.effectiveLines(th, S.PICKY_LEVELS.best), ids);
  assert.ok(th.picked && th.label != null && !S.ownThemeNames().includes('market day'));
});
