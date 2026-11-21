// Story › Pro View (was Lines): the search history kept with the project (hide / archive / bring back), the groups of
// the left-hand list (Themes, Find searches, Questions, Moments – the last two only once used), the rows for each,
// moments with nothing said, stars, sorting by any column, shift-ranges, the columns (order, widths) and which rows
// are drawn. The screen itself is checked in Premiere by dev/e2e/22w-story-proview.e2e.js.
const assert = require('assert');
const { load, test } = require('./harness');
global.addEventListener = global.addEventListener || (() => {});
global.ResizeObserver = global.ResizeObserver || function () { return { observe() {} }; };
const US = load(['time', 'transcript', 'ui', 'app', 'js/tools/22-story-board.js', 'js/tools/22-story-export.js', 'js/tools/22-story-timeline.js', 'js/tools/22-story-narrative.js', 'js/tools/22-story-moments.js', 'js/tools/22-story-ai.js', 'js/tools/22-story-questions.js', 'js/tools/22-story-lines.js', 'js/tools/22-story.js']);
const S = US.story, P = US.proView;

const mk = (id, start, end, speaker, text) => ({ id, start, end, speaker, text });
const RUTH = [
  mk('a1', 0, 3, 'Interviewer', 'What does family mean to you?'),
  mk('a2', 3.5, 9, 'Ruth', 'Family is everything to me, it always was the heart of our home.'),
  mk('a3', 9.5, 15, 'Ruth', 'My mother kept the door open for the whole street, every single Friday.'),
  mk('a4', 15.5, 17, 'Ruth', '[laughs]'),
  mk('a5', 17.5, 22, 'Ruth', 'The community carried us when my father died.')];
const SAM = [
  mk('b1', 0, 5, 'Sam', 'We came because my brother was already here with his family.'),
  mk('b2', 5.5, 9, 'Sam', 'He wrote every week telling us to come.')];
function fresh(extra) {
  return S._useState(Object.assign({ transcripts: [
    { key: '/m/ruth.mov', name: 'ruth.mov', path: '/m/ruth.mov', itemId: 'r', source: 'file', lines: RUTH.map(l => Object.assign({}, l)) },
    { key: '/m/sam.mov', name: 'sam.mov', path: '/m/sam.mov', itemId: 's', source: 'file', lines: SAM.map(l => Object.assign({}, l)) }] }, extra));
}
const ids = rows => rows.map(r => r.id);

test('the tab is called Pro View and keeps its id', () => {
  const d = US.tools.get('storylines');
  assert.strictEqual(d.name, 'Pro View'); assert.strictEqual(d.short, 'Pro View'); assert.strictEqual(d.place, 'story');
});

test('every Find search is kept: newest first, the same words again move up, results kept so nothing is searched or sent again', () => {
  const st = fresh();
  const a = P.remember(st, { q: 'family', mode: 'search', at: 1 }, ['a2', 'b1']);
  P.remember(st, { q: 'the door', mode: 'more', at: 2, info: 'Leaving out 0 lines', more: [{ id: 'a3', rel: 0.9, reasons: ['says “door”'] }] });
  P.remember(st, { q: 'community', mode: 'search', at: 3 }, ['a5']);
  assert.deepStrictEqual(P.searches(st).map(x => x.q), ['community', 'the door', 'family']);
  const again = P.remember(st, { q: ' Family ', mode: 'search', at: 4 }, ['a2']);
  assert.strictEqual(again.id, a.id, 'one entry per search, whatever the capitals');
  assert.deepStrictEqual(P.searches(st).map(x => x.q), ['Family', 'community', 'the door']);
  assert.deepStrictEqual(again.ids, ['a2']);
  assert.strictEqual(P.remember(st, { q: '  ', mode: 'search' }, []), null, 'an empty search is not kept');
  // a search and a Find more of the same words are two entries
  P.remember(st, { q: 'family', mode: 'more', at: 5, more: [] });
  assert.strictEqual(P.searches(st).length, 4);
  assert.deepStrictEqual(P.countOf(P.entryOf(st, 'the door', 'more')), 1);
  // it travels with the project's Story
  assert.ok(JSON.parse(JSON.stringify(st)).proView.searches.length === 4);
});

test('a search can be hidden (archived), brought back, or deleted for good; searching it again brings it back', () => {
  const st = fresh();
  const a = P.remember(st, { q: 'family', mode: 'search', at: 1 }, ['a2']), b = P.remember(st, { q: 'door', mode: 'search', at: 2 }, ['a3']);
  P.setArchived(st, a.id, true);
  assert.deepStrictEqual(P.searches(st).map(x => x.q), ['door']);
  assert.deepStrictEqual(P.searches(st, { archived: true }).map(x => x.q), ['family']);
  let g = P.groups(S, st, { s: S.PICKY_LEVELS.balanced });
  assert.deepStrictEqual(g.map(x => x.id), ['themes', 'finds', 'archived']);
  assert.deepStrictEqual(g[2].items.map(i => i.name), ['family']);
  assert.deepStrictEqual(ids(P.rowsFor(S, st, 'find:' + a.id, { s: 0 })), ['a2'], 'an archived search still opens');
  P.setArchived(st, a.id, false);
  assert.deepStrictEqual(P.searches(st).map(x => x.q), ['door', 'family']);
  P.setArchived(st, a.id, true); P.remember(st, { q: 'family', mode: 'search', at: 9 }, ['a2', 'b1']);
  assert.strictEqual(P.searches(st, { archived: true }).length, 0, 'searched again: back in the list');
  assert.ok(P.forget(st, b.id)); assert.ok(!P.forget(st, b.id));
  assert.deepStrictEqual(P.data(st).searches.map(x => x.q), ['family']);
});

test('the searches Find already remembered join the list once', () => {
  const st = fresh({ finds: { last: { q: 'door', mode: 'search', at: 20 }, recent: [{ q: 'door', mode: 'search', at: 20 }, { q: 'father', mode: 'more', at: 10, more: [{ id: 'a5', rel: 1, reasons: [] }] }] } });
  assert.strictEqual(P.adopt(st), true);
  assert.deepStrictEqual(P.searches(st).map(x => x.q), ['door', 'father']);
  assert.strictEqual(P.adopt(st), false);
  // an old plain search has no kept results: it is searched again here (free, on this computer)
  const rows = P.rowsFor(S, st, 'find:' + P.entryOf(st, 'door', 'search').id, { s: 0 });
  assert.ok(ids(rows).includes('a3'), ids(rows).join());
  assert.deepStrictEqual(ids(P.rowsFor(S, st, 'find:' + P.entryOf(st, 'father', 'more').id, { s: 0 })), ['a5']);
});

test('the list: Themes and Find searches always; Questions and Moments only once they have been used', () => {
  const st = fresh();
  const th = S.newThemeFrom('Family', ['a2', 'b1']);
  let g = P.groups(S, st, { s: 0 });
  assert.deepStrictEqual(g.map(x => x.id), ['themes', 'finds']);
  assert.deepStrictEqual(g[0].items.map(i => [i.id, i.n]), [['all', 6], ['theme:' + th.id, 2], ['none', 4]], 'the interviewer’s question is not counted');
  assert.strictEqual(g[1].hint, 'finds');
  st.questions = { list: ['What does family mean?'], by: 'basic', results: [{ q: 0, question: 'What does family mean?', answers: [{ from: 'a2', to: 'a3', asked: 'a1', summary: 'Everything' }, { from: 'b1', to: 'b1' }] }] };
  st.moments = { at: 1, by: 'basic', list: [{ lineId: 'a4', key: '/m/ruth.mov', type: 'funny', score: 0.9, reasons: ['Laughter'] }, { lineId: 'a5', key: '/m/ruth.mov', type: 'poignant', score: 0.9, reasons: ['Emotional words'] }] };
  g = P.groups(S, st, { s: 0 });
  assert.deepStrictEqual(g.map(x => x.id), ['themes', 'finds', 'questions', 'moments']);
  assert.deepStrictEqual(g[2].items.map(i => [i.id, i.n]), [['q:all', 2], ['q:0', 2]]);
  assert.deepStrictEqual(g[3].items.map(i => i.id), ['m:all', 'm:funny', 'm:poignant'], 'only the kinds of moment that were found');
});

test('rows: a theme in interview order, All lines without the interviewer, Not in a theme, a search best first', () => {
  const st = fresh();
  const th = S.newThemeFrom('Family', ['b1', 'a2']);
  assert.deepStrictEqual(ids(P.rowsFor(S, st, 'theme:' + th.id, { s: 0 })), ['a2', 'b1']);
  assert.deepStrictEqual(ids(P.rowsFor(S, st, 'all', { s: 0 })), ['a2', 'a3', 'a4', 'a5', 'b1', 'b2']);
  assert.deepStrictEqual(ids(P.rowsFor(S, st, 'none', { s: 0 })), ['a3', 'a4', 'a5', 'b2']);
  const r = P.rowsFor(S, st, 'all', { s: 0 })[0];
  assert.strictEqual(r.who, 'Ruth'); assert.deepStrictEqual(r.themes.map(t => t.name), ['Family']); assert.deepStrictEqual(r.ids, ['a2']);
  const e = P.remember(st, { q: 'family', mode: 'search', at: 1 }, ['b1', 'a2', 'gone']);
  assert.deepStrictEqual(ids(P.rowsFor(S, st, 'find:' + e.id, { s: 0 })), ['b1', 'a2'], 'as Find showed it; a line that no longer exists is left out');
  assert.deepStrictEqual(P.rowsFor(S, st, 'find:nope', { s: 0 }), []);
});

test('answers: each whole answer is one row, in its question’s colour, placed as one piece', () => {
  const st = fresh();
  st.questions = { list: ['What does family mean?'], by: 'basic', results: [{ q: 0, question: 'What does family mean?', answers: [{ from: 'a2', to: 'a3', asked: 'a1', summary: 'Everything' }, { from: 'b1', to: 'b1' }] }] };
  const rows = P.rowsFor(S, st, 'q:0', { s: 0 });
  assert.strictEqual(rows.length, 2);
  const a = rows[0];
  assert.strictEqual(a.kind, 'answer'); assert.deepStrictEqual(a.ids, ['a2', 'a3']);
  assert.strictEqual(a.l.id, 'a2'); assert.strictEqual(a.l.start, 3.5); assert.strictEqual(a.l.end, 15, 'first word to last');
  assert.ok(/Family is everything.*every single Friday\.$/.test(a.l.text));
  assert.strictEqual(a.tag.name, 'Q1'); assert.strictEqual(a.label, S.questionLabel(0)); assert.strictEqual(a.summary, 'Everything');
  assert.strictEqual(RUTH[1].end, 9); assert.strictEqual(S.lineOf('a2').end, 9, 'the transcript line itself is untouched');
  const asked = P.rowsFor(S, st, 'q:all', { s: 0, asked: true });
  assert.deepStrictEqual(asked[0].ids, ['a1', 'a2', 'a3'], 'with “start with the question”, as in Find');
});

test('moments: by kind; one with nothing said shows what happens instead of a line', () => {
  const st = fresh();
  st.moments = { at: 1, by: 'basic', list: [
    { lineId: 'a4', key: '/m/ruth.mov', type: 'funny', score: 0.9, reasons: ['Laughter'] },
    { lineId: 'a5', key: '/m/ruth.mov', type: 'poignant', score: 0.9, reasons: ['Emotional words'] },
    { path: '/m/ruth.mov', start: 40, end: 44, type: 'funny', label: 'A tray is dropped off camera', score: 0.8 },
    { lineId: 'deleted', type: 'funny', score: 1, reasons: [] }] };
  const all = P.rowsFor(S, st, 'm:all', { s: 0 });
  assert.strictEqual(all.length, 3, 'a moment whose line is gone is left out');
  const laugh = all.find(r => r.id === 'a4'), said = all.find(r => r.id === 'a5'), seen = all.find(r => !r.l.id);
  assert.strictEqual(said.noSpeech, false); assert.strictEqual(said.tag.name, 'Poignant'); assert.strictEqual(said.kind, 'moment');
  assert.strictEqual(laugh.noSpeech, true, '“[laughs]” is a sound, not speech');
  assert.strictEqual(laugh.desc, 'Laughter · 0:15–0:17'); assert.strictEqual(laugh.path, '/m/ruth.mov');
  assert.strictEqual(seen.noSpeech, true); assert.strictEqual(seen.desc, 'A tray is dropped off camera · 0:40–0:44');
  assert.deepStrictEqual(seen.ids, [], 'no transcript line: it shows, but can’t be placed');
  assert.deepStrictEqual(ids(P.rowsFor(S, st, 'm:poignant', { s: 0 })), ['a5']);
  assert.ok(P.noSpeech('') && P.noSpeech('[ __ ]') && P.noSpeech(' [music] … ') && !P.noSpeech('Oh [laughs]') && !P.noSpeech('שלום'));
  // the filter reads the description
  assert.ok(P.hay(seen).includes('tray'));
  seen.described = 'A waiter trips; everyone laughs'; assert.ok(P.hay(seen).includes('waiter'));
});

test('stars: Story’s own for a strong line until you set or take one off by hand', () => {
  const st = fresh();
  assert.strictEqual(P.isStar(st, 'a2', true), true); assert.strictEqual(P.isStar(st, 'a3', false), false);
  P.setStar(st, 'a3', true, false); P.setStar(st, 'a2', false, true);
  assert.strictEqual(P.isStar(st, 'a3', false), true); assert.strictEqual(P.isStar(st, 'a2', true), false);
  assert.deepStrictEqual(P.data(st).stars, { a3: 1, a2: 0 });
  P.setStar(st, 'a3', false, false); P.setStar(st, 'a2', true, true);
  assert.deepStrictEqual(P.data(st).stars, {}, 'back to Story’s own: nothing kept');
});

test('sort by Who, Theme, Length, Star and Used; again reverses; ties keep their order; no theme stays last', () => {
  const st = fresh();
  S.newThemeFrom('Family', ['a2', 'b1']); S.newThemeFrom('Arriving', ['b2']);
  const rows = P.rowsFor(S, st, 'all', { s: 0 });
  rows.forEach(r => { r.star = r.id === 'a5' || r.id === 'b2'; r.used = r.id === 'a3'; });
  const by = (k, d) => ids(P.sortRows(rows, k, d, P.SORT_KEYS));
  assert.deepStrictEqual(by(null, 1), ['a2', 'a3', 'a4', 'a5', 'b1', 'b2'], 'no column: the list’s own order');
  assert.deepStrictEqual(by('who', 1), ['a2', 'a3', 'a4', 'a5', 'b1', 'b2']);
  assert.deepStrictEqual(by('who', -1), ['b1', 'b2', 'a2', 'a3', 'a4', 'a5']);
  assert.deepStrictEqual(by('len', 1), ['a4', 'b2', 'a5', 'b1', 'a2', 'a3']);
  assert.deepStrictEqual(by('len', -1)[0], 'a2');
  assert.deepStrictEqual(by('star', 1), ['a5', 'b2', 'a2', 'a3', 'a4', 'b1']);
  assert.deepStrictEqual(by('star', -1), ['a2', 'a3', 'a4', 'b1', 'a5', 'b2']);
  assert.deepStrictEqual(by('theme', 1), ['b2', 'a2', 'b1', 'a3', 'a4', 'a5']);
  assert.deepStrictEqual(by('theme', -1), ['a2', 'b1', 'b2', 'a3', 'a4', 'a5'], 'lines in no theme stay at the bottom');
  assert.deepStrictEqual(by('used', 1)[0], 'a3');
  assert.deepStrictEqual(by('time', -1), ['b2', 'b1', 'a5', 'a4', 'a3', 'a2']);
  assert.strictEqual(rows[0].id, 'a2', 'sorting makes a new list');
});

test('shift-click ticks the range between two rows, either way round', () => {
  const list = ['a', 'b', 'c', 'd', 'e'];
  assert.deepStrictEqual(P.range(list, 'b', 'd'), ['b', 'c', 'd']);
  assert.deepStrictEqual(P.range(list, 'd', 'b'), ['b', 'c', 'd']);
  assert.deepStrictEqual(P.range(list, 'c', 'c'), ['c']);
  assert.deepStrictEqual(P.range(list, 'gone', 'c'), ['c']);
  assert.deepStrictEqual(P.range(list, 'a', 'gone'), []);
});

test('columns: order and widths are kept, made safe, moved and resized', () => {
  const def = P.layout(null);
  assert.deepStrictEqual(def.order, ['star', 'used', 'who', 'time', 'text', 'theme', 'len', 'delivery']);
  assert.deepStrictEqual(def.widths, {});
  const saved = P.layout({ order: ['len', 'who', 'nonsense', 'who', 'text'], widths: { who: 5, len: 90.4, text: 9999, nonsense: 50, time: 'x' } });
  assert.deepStrictEqual(saved.order.slice().sort(), def.order.slice().sort(), 'every column once, unknown ones dropped');
  assert.deepStrictEqual(saved.order.filter(c => ['len', 'who', 'text'].includes(c)), ['len', 'who', 'text'], 'the saved order is kept');
  assert.deepStrictEqual(saved.widths, { who: 40, len: 90, text: 1600 }, 'widths kept within sensible limits');
  assert.deepStrictEqual(P.moveCol(def.order, 'len', 'who'), ['star', 'used', 'len', 'who', 'time', 'text', 'theme', 'delivery']);
  assert.deepStrictEqual(P.moveCol(def.order, 'star', null), ['used', 'who', 'time', 'text', 'theme', 'len', 'delivery', 'star']);
  assert.deepStrictEqual(P.moveCol(def.order, 'who', 'who'), def.order);
  assert.deepStrictEqual(P.moveCol(def.order, 'nope', 'who'), def.order);
  assert.strictEqual(P.template(def, { used: false }), '28px 30px 110px 58px minmax(160px, 1fr) 140px 60px 22px', 'the tick box, the columns, then room for the Columns button');
  assert.strictEqual(P.template(def, { used: true }).split(' ').length, 10, 'the Used column only when it is switched on');
  assert.strictEqual(P.template(def, { used: false, delivery: true }), '28px 30px 110px 58px minmax(160px, 1fr) 140px 60px 150px 22px', 'the Delivery column only while Listen to delivery is on and has heard something');
  P.setWidth(def, 'who', 200.6); P.setWidth(def, 'text', 300); P.setWidth(def, 'star', 1);
  assert.strictEqual(P.template(def, { used: false }), '28px 24px 201px 58px 300px 140px 60px 22px');
  assert.ok(P.minWidth(def, { used: false }) > 800);
  assert.deepStrictEqual(P.layout(JSON.parse(JSON.stringify(def))), def, 'what is saved comes back the same');
});

test('columns can be hidden and shown again (not the Line); kept with the widths and order; Reset brings them all back', () => {
  const lay = P.layout(null);
  assert.deepStrictEqual(lay.hidden, []);
  P.setHidden(lay, 'who', true); P.setHidden(lay, 'len', true); P.setHidden(lay, 'who', true);
  assert.deepStrictEqual(lay.hidden, ['len', 'who']);
  assert.deepStrictEqual(P.visible(lay, { used: false }), ['star', 'time', 'text', 'theme']);
  assert.strictEqual(P.template(lay, { used: false }), '28px 30px 58px minmax(160px, 1fr) 140px 22px');
  assert.ok(P.minWidth(lay, { used: false }) < P.minWidth(P.layout(null), { used: false }));
  P.setHidden(lay, 'text', true); P.setHidden(lay, 'nonsense', true);
  assert.deepStrictEqual(lay.hidden, ['len', 'who'], 'the Line can’t be hidden');
  assert.ok(!P.canHide('text') && P.canHide('who') && P.canHide('star') && !P.canHide('tick'));
  // order and widths are untouched by hiding, and it all comes back from the settings
  P.setWidth(lay, 'who', 180); lay.order = P.moveCol(lay.order, 'len', 'who');
  const back = P.layout(JSON.parse(JSON.stringify(lay)));
  assert.deepStrictEqual(back, lay);
  P.setHidden(back, 'who', false);
  assert.deepStrictEqual(P.visible(back, { used: false }), ['star', 'who', 'time', 'text', 'theme']);
  assert.strictEqual(P.template(back, { used: false }).split(' ')[2], '180px', 'shown again at the width it had');
  assert.deepStrictEqual(P.layout({ hidden: ['text', 'who', 'who', 'x'] }).hidden, ['who'], 'a saved list is made safe');
  assert.deepStrictEqual(P.layout(null).hidden, [], 'Reset the columns');
});

test('thousands of lines: only the rows on screen (and a few either side) are drawn', () => {
  assert.deepStrictEqual(P.windowOf(0, 560, 6000), { from: 0, to: 28 });
  assert.deepStrictEqual(P.windowOf(28000, 560, 6000), { from: 992, to: 1028 });
  assert.deepStrictEqual(P.windowOf(1e9, 560, 6000), { from: 6000, to: 6000 });
  assert.deepStrictEqual(P.windowOf(0, 560, 3), { from: 0, to: 3 });
  assert.deepStrictEqual(P.windowOf(0, 560, 0), { from: 0, to: 0 });
  // and getting them ready is quick
  const lines = []; for (let i = 0; i < 6000; i++) lines.push(mk('x' + i, i * 5, i * 5 + 4, i % 3 ? 'Ana' : 'Ben', `Line ${i} about family and the long road here.`));
  const st = S._useState({ transcripts: [{ key: '/m/big.mov', name: 'big.mov', path: '/m/big.mov', source: 'file', lines }] });
  const t0 = Date.now(), rows = P.sortRows(P.rowsFor(S, st, 'all', { s: 0 }), 'who', 1, P.SORT_KEYS);
  assert.strictEqual(rows.length, 6000); assert.ok(Date.now() - t0 < 1500, `6,000 rows took ${Date.now() - t0} ms`);
});
