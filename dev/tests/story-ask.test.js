// Ask your interviews: the answer tidied (whole clips in one interview, groups combined across parts, overlaps joined,
// the AI's order kept), a follow-up that keeps the cached opening and adds the earlier answer and the change after it,
// and the answer as text. Only the transcripts' text is sent.
const assert = require('assert'), path = require('path');
const { load, test, MEDIA } = require('./harness');
global.addEventListener = global.addEventListener || (() => {});
global.ResizeObserver = global.ResizeObserver || function () { return { observe() {} }; };
const US = load(['time', 'transcript', 'ui', 'app', 'js/tools/22-story-board.js', 'js/tools/22-story-export.js', 'js/tools/22-story-timeline.js', 'js/tools/22-story-narrative.js', 'js/tools/22-story-moments.js', 'js/tools/22-story-ai.js', 'js/tools/22-story-context.js', 'js/tools/22-story-ask.js', 'js/tools/22-story-questions.js', 'js/tools/22-story.js']);
const S = US.story, T = US.transcript, A = US.storyAsk, C = US.storyContext;
const job = { set() {}, progress() {}, check() {}, log() {} };

const mk = (id, start, end, speaker, text) => ({ id, start, end, speaker, text });
const RUTH = { key: 'ruth', name: 'Ruth', lines: [mk('a1', 0, 3, 'Interviewer', 'Tell me about your grandmother.'), mk('a2', 3.5, 9, 'Ruth', 'She baked every Friday.'), mk('a3', 9.5, 15, 'Ruth', 'The whole street smelled of challah.'), mk('a4', 15.5, 20, 'Ruth', 'And she never wrote a recipe down.'), mk('a5', 21, 26, 'Ruth', 'We moved in 1962.')] };
const SAM = { key: 'sam', name: 'Sam', lines: [mk('b1', 0, 6, 'Sam', 'My grandmother came from Odessa.'), mk('b2', 6.5, 12, 'Sam', 'She spoke four languages.')] };

test('the answer tidied: whole clips, ends turned round, unknown ids out, lead kept only just before, overlaps joined, groups combined across parts', () => {
  const idx = A.indexOf([RUTH, SAM]);
  const r = A.organise([
    { answer: 'Both talk about their grandmothers.', groups: [{ key: '', name: 'Grandmothers', summary: 'Who they were', items: [
      { from: 'a4', to: 'a2', lead: 'a1', note: 'Friday baking', score: 0.9, tag: '' },
      { from: 'a3', to: 'a5', lead: '', note: 'overlaps: joins the first', score: 0.5, tag: '' },
      { from: 'zz', to: 'a2', lead: '', note: 'unknown id', score: 1, tag: '' }] }] },
    { answer: 'Sam’s came from Odessa.', groups: [{ key: '', name: 'grandmothers', summary: '', items: [{ from: 'b1', to: 'a3', lead: 'a1', note: 'Odessa', score: 0.8, tag: '' }] }, { key: '', name: 'Empty', summary: '', items: [] }] }
  ], idx);
  assert.strictEqual(r.answer, 'Both talk about their grandmothers.\n\nSam’s came from Odessa.');
  assert.deepStrictEqual(r.groups.map(g => g.name), ['Grandmothers'], 'same group from two parts combined; empty group dropped');
  assert.deepStrictEqual(r.groups[0].items.map(x => `${x.from}-${x.to}${x.lead ? ' lead ' + x.lead : ''}`), ['a2-a5 lead a1', 'b1-b1'], 'turned round, joined, other interview cut to one line, lead from another interview dropped');
  assert.deepStrictEqual(A.linesOf(r.groups[0].items[0], idx, { lead: true }).map(l => l.id), ['a1', 'a2', 'a3', 'a4', 'a5']);
  assert.strictEqual(A.totals(r.groups, idx).seconds, (26 - 3.5) + 6);
});

test('how long they asked for, and a short title', () => {
  assert.strictEqual(A.wantedLength('a 45-second opening about why they came'), 45);
  assert.strictEqual(A.wantedLength('two minutes on faith'), 120);
  assert.strictEqual(A.wantedLength('a 1.5 min teaser'), 90);
  assert.strictEqual(A.wantedLength('every story about Grandma'), 0);
  assert.strictEqual(A.title('every story about Grandma, in the order it happened please'), 'Every story about Grandma, in the order…');
});

test('asking and following up: the same cached opening, the earlier answer and the change after it; kept with the project; text only', async () => {
  const st = S._useState({ transcripts: [Object.assign({ path: '/media/ruth.mov', itemId: 'item1', source: 'file' }, JSON.parse(JSON.stringify(RUTH))), Object.assign({ path: '/media/sam.mov', itemId: 'item2', source: 'file' }, JSON.parse(JSON.stringify(SAM)))] });
  const calls = [], was = US.ai;
  US.ai = { available: () => true, provider: () => 'claude', label: () => 'Claude', estimateFor: () => ({ usd: 0 }), approveTotal: async () => {},
    json: async req => { calls.push(req); return calls.length === 1
      ? { answer: 'Two grandmothers.', groups: [{ key: '', name: 'Ruth’s grandmother', summary: '', items: [{ from: 'a2', to: 'a4', lead: 'a1', note: 'baking', score: 0.9, tag: '' }] }, { key: '', name: 'Sam’s grandmother', summary: '', items: [{ from: 'b1', to: 'b2', lead: '', note: 'Odessa', score: 0.8, tag: '' }] }] }
      : { answer: 'Just Ruth.', groups: [{ key: '', name: 'Ruth’s grandmother', summary: '', items: [{ from: 'a2', to: 'a3', lead: '', note: 'baking', score: 0.9, tag: '' }] }] }; } };
  let first, second;
  try {
    first = await S.askInterviews(job, { request: 'every story about grandmothers' });
    second = await S.askInterviews(job, { request: 'only Ruth, shorter', askId: first.ask.id });
  } finally { US.ai = was; }
  assert.strictEqual(calls[0].schema, C.SCHEMA, 'the shared answer format');
  assert.strictEqual(calls[0].user[0].cache, '1h');
  assert.ok(/The editor asks: “every story about grandmothers”/.test(calls[0].user[1]));
  assert.strictEqual(calls[1].user[0].text, calls[0].user[0].text, 'follow-up: same transcripts');
  assert.strictEqual(calls[1].user[1], calls[0].user[1], 'follow-up: same first task, so the whole first message is read from the cache');
  assert.strictEqual(calls[1].turns.length, 1);
  assert.deepStrictEqual(JSON.parse(calls[1].turns[0].assistant).answer, 'Two grandmothers.', 'the earlier answer');
  assert.ok(/only Ruth, shorter/.test(calls[1].turns[0].user), 'then the change');
  assert.strictEqual(second.ask.id, first.ask.id, 'the same conversation');
  assert.deepStrictEqual(second.ask.result.groups.map(g => g.name), ['Ruth’s grandmother']);
  assert.ok(second.ask.result.groups[0].label != null, 'each group has a colour');
  assert.strictEqual(st.asks.length, 1, 'kept with the project');
  assert.ok(!/\/media\/|item\d|Ruth\.mov/.test(JSON.stringify(calls)), 'no paths or clip ids sent');
  const text = S.askText(first.ask.id);
  assert.ok(/only Ruth|every story/.test(text) && /Ruth’s grandmother/.test(text) && /She baked every Friday/.test(text), text);
  const themes = S.askThemes(first.ask.id);
  assert.strictEqual(themes.length, 1);
  assert.deepStrictEqual(themes[0].lineIds, ['a2', 'a3']);
});

test('builds: “keep clips in the order they were filmed” sorts each group by interview and time; otherwise the given order', () => {
  S._useState({ transcripts: [JSON.parse(JSON.stringify(RUTH)), JSON.parse(JSON.stringify(SAM))] });
  const groups = [{ name: 'G', label: 1, lineIds: ['b2', 'a4', 'a2', 'b1'] }], order = id => ['a1', 'a2', 'a3', 'a4', 'a5', 'b1', 'b2'].indexOf(id);
  const as = o => S.planBuild(groups, Object.assign({ handles: 0, itemFor: () => 'item' }, o)).clips.map(c => c.lineId);
  assert.deepStrictEqual(as({}), ['b2', 'a4', 'a2', 'b1']);
  assert.deepStrictEqual(as({ inOrder: true, orderOf: order }), ['a2', 'a4', 'b1', 'b2']);
});

test('narrative: the client’s notes go after the cached listing; alternatives come back unused, known and unique', () => {
  const N = US.storyNarrative, lineOf = id => [...RUTH.lines, ...SAM.lines].find(l => l.id === id);
  const pool = ['a2', 'a3', 'a4', 'b1', 'b2'].map(id => ({ id, rel: 1, strength: 0.6, heart: 0 }));
  const req = N.aiRequest(pool, { topic: 'grandmothers', seconds: 30, tone: '', context: 'From: client\nPlease keep it upbeat and mention Zanzibar.' }, { lineOf });
  assert.ok(!/Zanzibar/.test(req.user[0].text), 'not in the cached listing');
  assert.ok(/CLIENT NOTES ---\nFrom: client\nPlease keep it upbeat and mention Zanzibar\.\n--- END/.test(req.user[1]), 'after it, marked as the client’s notes');
  assert.strictEqual(N.contextNote(''), '');
  assert.ok(/the rest was left out/.test(N.contextNote('x'.repeat(N.CONTEXT_MAX + 10))));
  const nar = N.checkAI({ title: 'T', logline: '', beats: [{ lineId: 'a2', purpose: 'p', dropStartWords: 0, dropEndWords: 0 }, { lineId: 'b1', purpose: 'p', dropStartWords: 0, dropEndWords: 0 }],
    alternates: [{ lineId: 'a2', why: 'already used' }, { lineId: 'b2', why: 'four languages' }, { lineId: 'b2', why: 'twice' }, { lineId: 'zz', why: 'unknown' }] }, pool, 30, { lineOf });
  assert.deepStrictEqual(nar.alternates, [{ lineId: 'b2', why: 'four languages' }]);
  const basic = N.basic(pool, 12, { lineOf });
  assert.ok(basic.alternates.length && basic.alternates.every(a => !basic.beats.some(b => b.lineId === a.lineId)), 'the basic version offers the next best lines');
});

test('narrative alternatives: the AI’s (with reasons) first, then the rest of the shortlist – as many as asked, up to all of them', () => {
  S._useState({ transcripts: [JSON.parse(JSON.stringify(RUTH)), JSON.parse(JSON.stringify(SAM))] });
  const col = { cards: [{ lineId: 'a2' }], narrative: { alternates: [{ lineId: 'b2', why: 'four languages' }, { lineId: 'a2', why: 'in the story' }], shortlist: ['a2', 'b2', 'a3', 'b1', 'zz', 'a4'] } };
  assert.deepStrictEqual(S.narrativeAlternates(col, Infinity).map(a => a.lineId + (a.why ? ':' + a.why : '')), ['b2:four languages', 'a3', 'b1', 'a4']);
  assert.deepStrictEqual(S.narrativeAlternates(col, 2).map(a => a.lineId), ['b2', 'a3']);
  const req = US.storyNarrative.aiRequest([{ id: 'a2', strength: 0.5 }], { topic: 't', seconds: 30, tone: '' }, { lineOf: id => RUTH.lines.find(l => l.id === id), alternates: 500 });
  assert.ok(/Alternates: up to 40\./.test(req.user[1]), 'the AI names at most 40 with reasons; the rest come from the shortlist');
  assert.ok(!/\d+ lines you didn/.test(req.system), 'the count isn’t in the system text, so the cached listing is shared whatever the count');
});
