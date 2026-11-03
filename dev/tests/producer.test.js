// Producer and the Story wiki: the cut as the producer reads it, notes and pick-up questions organised from the AI's
// answer (in the shared answer format), markers, the question sheet; the wiki's entries merged across parts, dates in
// order, the instant lookup, answers with their sources, and the Assistant's phrasing.
const assert = require('assert');
const { load, test } = require('./harness');
global.addEventListener = global.addEventListener || (() => {});
global.ResizeObserver = global.ResizeObserver || function () { return { observe() {} }; };
const US = load(['time', 'audio', 'dsp', 'transcript', 'ui', 'app', 'js/tools/11-audio-kit.js', 'js/tools/22-story-glossary.js', 'js/tools/22-story-board.js', 'js/tools/22-story-export.js', 'js/tools/22-story-timeline.js', 'js/tools/22-story-narrative.js', 'js/tools/22-story-moments.js', 'js/tools/22-story-ai.js', 'js/tools/22-story-context.js', 'js/tools/22-story-ask.js', 'js/tools/22-story-drag.js', 'js/tools/22-story.js', 'js/tools/37-producer.js', 'js/tools/38-wiki.js', 'js/tools/40-assistant.js']);
const P = US.producer, W = US.storyWiki;
const known = new Set(['a1', 'a2', 'a3', 'b1', 'b2']);

test('the cut: one row per line in time order, a line cut in two pieces close together kept as one', () => {
  const c = P.cutListing([
    { lineId: 'a2', start: 10, end: 14, text: 'We built the bakery…', speakerKey: 'r' },
    { lineId: 'a1', start: 0, end: 4, text: 'It saved us.', speakerKey: 'r' },
    { lineId: 'a2', start: 14.5, end: 16, text: '…in a week.', speakerKey: 'r' },
    { lineId: 'b1', start: 400, end: 405, text: 'I was born in Leeds.', speakerKey: 'd' }
  ], e => (e.speakerKey === 'r' ? 'Ruth' : 'David'));
  assert.deepStrictEqual(c.rows.map(r => r.lineId), ['a1', 'a2', 'b1']);
  assert.strictEqual(c.rows[1].end, 16);
  assert.ok(/\n6:40\tb1\tDavid\tI was born in Leeds\./.test(c.text));
  assert.strictEqual(c.seconds, 405);
});

test('notes: kinds checked, items tagged by where the line really is, unknown ids dropped, “works” notes last, parts merged', () => {
  const res = P.organiseNotes([
    { answer: 'It starts too slowly.', groups: [
      { key: 'strong', name: 'The ending lands', summary: 'Keep it.', items: [{ from: 'a3', to: 'a3', note: '', score: 0.3, tag: 'cut' }] },
      { key: 'buried', name: 'Your best line is at 6:40', summary: 'Open with it.', items: [{ from: 'b1', to: 'b1', note: 'Leeds', score: 0.9, tag: 'unused' }, { from: 'zz', to: 'zz', note: '', score: 1, tag: 'cut' }] },
      { key: 'nonsense', name: 'Who is Max?', summary: 'Never explained.', items: [] }
    ] },
    { answer: '', groups: [{ key: 'buried', name: 'Your best line is at 6:40', summary: '', items: [{ from: 'a2', to: 'b2', note: '', score: 0.8, tag: 'unused' }] }] }
  ], known, new Set(['a3', 'b1']));
  assert.strictEqual(res.verdict, 'It starts too slowly.');
  assert.deepStrictEqual(res.notes.map(n => n.kind), ['buried', 'unclear', 'strong']);
  const b = res.notes[0];
  assert.deepStrictEqual(b.items.map(i => [i.from, i.tag]), [['b1', 'cut'], ['a2', 'unused']], 'b1 is in the cut whatever the AI said; zz is unknown');
  assert.strictEqual(b.items[1].to, 'b2');
  assert.strictEqual(b.severity, 0.9);
});

test('notes: markers on the runs of lines in the cut, and as text', () => {
  const res = { verdict: 'V', notes: [{ kind: 'repeat', title: 'Said twice', text: 'Cut one.', items: [{ from: 'a1', tag: 'cut' }, { from: 'a2', tag: 'cut' }, { from: 'b2', tag: 'unused' }] }] };
  const rows = { a1: [{ start: 0, end: 4 }], a2: [{ start: 4.5, end: 9 }] };
  const m = P.noteMarkers(res.notes, id => rows[id] || []);
  assert.deepStrictEqual(m.map(x => [x.start, x.end, x.color]), [[0, 9, 4]], 'touching lines make one range, in the kind’s colour');
  assert.ok(/^Said again: Said twice/.test(m[0].name));
  const t = P.notesText(res, { name: 'Rough cut', lineText: id => id.toUpperCase(), timeOf: id => (id === 'a1' ? 0 : id === 'a2' ? 4.5 : null) });
  assert.ok(t.includes('1. [Said again] Said twice') && t.includes('at 0:05: A2') && t.includes('not in the cut: B2'));
  assert.ok(P.notesTask({ name: 'Rough cut', seconds: 125, cut: 'CUT', tone: 'kind', focus: 'pace', brief: 'for donors' }).includes('(2:05 long)'));
});

test('pick-ups: questions for the person whose line it is, closest lines kept, by person and as a document', () => {
  const sp = { a1: 'Ruth', a2: 'Ruth', b1: 'David' };
  const p = P.organisePickups([{ answer: 'Nobody says why it closed.', groups: [
    { key: 'gap', name: 'Why the bakery closed', summary: 'The turn is never explained.', items: [
      { from: 'a1', to: 'a1', note: 'What happened the week the bakery closed?', score: 0.9, tag: 'ask' },
      { from: 'b1', to: 'b1', note: 'How did you hear it was closing?', score: 0.9, tag: 'ask' },
      { from: 'a2', to: 'a2', note: 'mentions it, no reason', score: 0.9, tag: 'near' },
      { from: 'zz', to: 'zz', note: 'Anyone: what year was it?', score: 0.5, tag: 'ask' }] },
    { key: 'gap', name: 'Max', summary: 'Who is he?', items: [{ from: 'a2', to: 'a2', note: 'Who is Max to you?', score: 0.5, tag: 'ask' }] },
    { key: 'gap', name: 'Empty', summary: '', items: [] }
  ] }], known, id => sp[id] || '');
  assert.deepStrictEqual(p.gaps.map(g => g.title), ['Why the bakery closed', 'Max']);
  assert.deepStrictEqual(p.gaps[0].asks.map(a => a.speaker), ['Ruth', 'David', '']);
  assert.deepStrictEqual(p.gaps[0].near.map(n => n.from), ['a2']);
  const per = P.byPerson(p.gaps);
  assert.deepStrictEqual(per.map(x => [x.speaker, x.items.length]), [['Ruth', 2], ['David', 1], ['', 1]]);
  const text = P.pickupText(p, { by: 'person' });
  assert.ok(text.includes('Ruth\n  1. What happened the week the bakery closed?   (Why the bakery closed)'));
  assert.ok(text.includes('Anyone\n'));
  const doc = P.pickupDoc(p, { title: 'T' });
  assert.ok(doc.blocks.some(b => b.heading === 'Ruth') && doc.blocks.some(b => b.heading === 'Why – the gaps'));
  assert.ok(US.storyExport.docx(doc).length > 500, 'makes a .docx');
});

const where = id => ({ a1: { key: 'r', n: 1 }, a2: { key: 'r', n: 1 }, a3: { key: 'r', n: 1 }, b1: { key: 'd', n: 2 }, b2: { key: 'd', n: 2 } })[id] || null;
const WIKI = W.organise([
  { answer: 'A bakery that held a street together.\n\nIt closed in 2003.', groups: [
    { key: 'interview', name: 'Interview 2 – David', summary: 'David on the closure.', items: [{ from: 'b1', to: 'b1', note: 'the last day', score: 1 }] },
    { key: 'interview', name: 'Interview 1 – Ruth', summary: 'Ruth on growing up.', items: [{ from: 'a1', to: 'a1', note: 'Leeds', score: 1 }] },
    { key: 'person', name: 'Ruth', summary: 'Baker’s daughter.', items: [{ from: 'a1', to: 'a1', note: 'grew up in Leeds', score: 0.9, tag: '' }] },
    { key: 'place', name: 'Leeds', summary: 'Where Ruth grew up.', items: [{ from: 'a1', to: 'a1', note: 'Ruth’s home town', score: 0.6, tag: '' }] },
    { key: 'date', name: 'The closure', summary: 'The bakery closed.', items: [{ from: 'b1', to: 'b1', note: 'closed', score: 0.8, tag: '2003-05' }] },
    { key: 'date', name: 'Sometime later', summary: 'They met again.', items: [{ from: 'b2', to: 'b2', note: '', score: 0.2, tag: '' }] },
    { key: 'date', name: 'the winter of 1987', summary: 'It opened.', items: [{ from: 'a2', to: 'a2', note: 'opened', score: 0.8, tag: '' }] }
  ] },
  { answer: '', groups: [
    { key: 'person', name: 'Ruth Cohen', summary: 'Runs the bakery now.', items: [{ from: 'a3', to: 'a3', note: 'took over in 2010', score: 1, tag: '' }, { from: 'zz', to: 'zz', note: 'made up', score: 1, tag: '' }] },
    { key: 'people', name: 'Uncle Max', summary: 'Ruth’s uncle.', items: [] }
  ] }
], where);

test('wiki: interviews in order, the same person from two parts made one, dates in time order, undated last', () => {
  assert.deepStrictEqual(WIKI.interviews.map(i => [i.n, i.title]), [[1, 'Interview 1 – Ruth'], [2, 'Interview 2 – David']]);
  assert.deepStrictEqual(WIKI.person.map(p => p.name), ['Ruth Cohen', 'Uncle Max'], '“Ruth” and “Ruth Cohen” are one person, with the longer name');
  assert.deepStrictEqual(WIKI.person[0].facts.map(f => f.note), ['grew up in Leeds', 'took over in 2010'], 'an unknown line is left out');
  assert.ok(WIKI.person[0].summary.includes('Baker’s daughter') && WIKI.person[0].summary.includes('Runs the bakery'));
  assert.deepStrictEqual(WIKI.date.map(d => d.when), ['1987', '2003-05', '']);
  assert.ok(WIKI.overview.includes('\n\nIt closed'));
  assert.deepStrictEqual(W.counts(WIKI), { interviews: 2, person: 2, place: 1, date: 3, thing: 0 });
});

test('wiki lookup: question words left out, every word must match, names count most', () => {
  const hits = W.search(WIKI, 'Where did Ruth grow up?');
  assert.strictEqual(hits[0].entry.name, 'Ruth Cohen');
  assert.deepStrictEqual(hits[0].hits.map(f => f.note), ['grew up in Leeds']);
  assert.strictEqual(W.search(WIKI, 'leeds')[0].entry.name, 'Leeds', 'the place itself before the people it’s a fact of');
  assert.deepStrictEqual(W.search(WIKI, 'ruth paris'), []);
  assert.deepStrictEqual(W.search(WIKI, 'who is'), [], 'only question words: nothing to look for');
  assert.strictEqual(W.yearIn('in the 1990s'), '1990');
});

test('wiki answers: sources known and best first; the document has every section', () => {
  const a = W.organiseAnswer([{ answer: 'Ruth grew up in Leeds.', groups: [{ key: 'sources', items: [{ from: 'a2', to: 'a2', note: 'x', score: 0.4 }, { from: 'a1', to: 'zz', note: 'Leeds', score: 0.9 }, { from: 'zz', to: 'zz', score: 1 }] }] }], id => !!where(id));
  assert.strictEqual(a.answer, 'Ruth grew up in Leeds.');
  assert.deepStrictEqual(a.sources.map(s => [s.from, s.to]), [['a1', 'a1'], ['a2', 'a2']]);
  assert.ok(W.askTask('where did Ruth grow up?').includes('key "sources"'));
  const doc = W.toDoc(WIKI, { lineText: id => id });
  assert.deepStrictEqual(doc.blocks.filter(b => b.heading).map(b => b.heading), ['Overview', 'Interviews', 'People', 'Places', 'Dates']);
});

test('wiki pieces: the story a few interviews at a time, then people, places and dates, things; a cut-off piece asks for less', () => {
  const ps = W.pieces(Array.from({ length: 26 }, (_, i) => i + 1));
  assert.deepStrictEqual(ps.map(W.pieceName), ['Interviews 1–8', 'Interviews 9–16', 'Interviews 17–24', 'Interviews 25–26', 'People', 'Places and dates', 'Things']);
  assert.deepStrictEqual(ps.map(p => !!p.first), [true, false, false, false, false, false, false]);
  assert.ok(/overview/.test(W.task(ps[0])) && /“answer”: ""/.test(W.task(ps[1])) && /Interview 9, Interview 10/.test(W.task(ps[1])));
  const half = W.smaller(ps[0]);
  assert.deepStrictEqual(half.map(o => o.nums), [[1, 2, 3, 4], [5, 6, 7, 8]]);
  assert.deepStrictEqual(half.map(o => !!o.first), [true, false]);
  const tight = W.smaller(ps[4]);
  assert.ok(tight.length === 1 && tight[0].tight && /at most 20/.test(W.task(tight[0])) && /at most 40/.test(W.task(ps[4])));
  assert.deepStrictEqual(W.smaller(tight[0]), []);
  assert.ok(W.smaller({ kind: 'story', nums: [3] })[0].tight);
  assert.deepStrictEqual(W.pieces([1, 2], false).map(p => !!p.first), [false, false, false, false]);
});

test('an answer cut off for length isn’t paid for twice', async () => {
  const was = US.ai; let n = 0;
  US.ai = Object.assign({}, was, { json: async () => { n++; throw new US.UserError('AI_FAILED', { detail: 'stop_reason max_tokens' }); } });
  try { const info = {}; assert.strictEqual(await US.storyAI.ask({}, info), null); assert.strictEqual(n, 1); assert.ok(/max_tokens/.test(info.error.detail)); }
  finally { US.ai = was; }
});

test('the requests share the cached transcript: same system, same answer format, the transcript first', () => {
  const ts = [{ key: 'r', name: 'Ruth', n: 1, lines: [{ id: 'a1', start: 0, end: 4, speaker: 'Ruth', text: 'I grew up in Leeds.' }] }];
  const a = US.storyContext.requests(ts, { task: (k, n) => W.task(W.pieces([1])[0], k, n) }), b = US.storyContext.requests(ts, { task: (k, n) => P.notesTask({ name: 'x', seconds: 1, cut: 'C' }, k, n) });
  assert.strictEqual(a[0].req.system, b[0].req.system);
  assert.strictEqual(a[0].req.schema, b[0].req.schema);
  assert.strictEqual(a[0].req.user[0].text, b[0].req.user[0].text);
});

test('the Assistant: notes, pick-ups and the wiki by plain words, without stealing others', () => {
  const m = t => (US.assistant.matchOffline(t).steps[0] || {}).action;
  assert.strictEqual(m('give me notes on my cut'), 'producer.notes');
  assert.strictEqual(m('play devil’s advocate on this sequence'), 'producer.notes');
  assert.strictEqual(m('what should I ask in the pick-up interview'), 'producer.pickups');
  assert.strictEqual(m('questions for a reshoot'), 'producer.pickups');
  assert.strictEqual(m('where did Ruth grow up'), 'wiki.ask');
  assert.strictEqual(m('who is uncle Max?'), 'wiki.ask');
  assert.strictEqual(m('make a story wiki'), 'wiki.build');
  assert.notStrictEqual(m('find where they talk about faith'), 'wiki.ask');
  assert.notStrictEqual(m('show me a word cloud'), 'wiki.ask');
});
