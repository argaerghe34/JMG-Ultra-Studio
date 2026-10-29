// Story › Find › Questions: the editor's questions, the requests (whole interviews per part), reading the AI's answers
// (full spans, merged, best first), the basic version, and building / saving the answers.
const assert = require('assert');
const { load, test } = require('./harness');
global.addEventListener = global.addEventListener || (() => {});
global.ResizeObserver = global.ResizeObserver || function () { return { observe() {} }; };
const US = load(['time', 'transcript', 'ui', 'app', 'js/tools/22-story-board.js', 'js/tools/22-story-export.js', 'js/tools/22-story-timeline.js', 'js/tools/22-story-narrative.js', 'js/tools/22-story-ai.js', 'js/tools/22-story-questions.js', 'js/tools/22-story.js']);
const Q = US.storyQuestions;

const mk = (id, start, end, speaker, text) => ({ id, start, end, speaker, text });
const A = { key: 'ruth', name: 'Ruth', lines: [
  mk('a1', 0, 3, 'Interviewer', 'What brought you to Israel?'),
  mk('a2', 3.5, 8, 'Ruth', 'My parents had always talked about it.'),
  mk('a3', 8.5, 14, 'Ruth', 'And after the war there was nothing left for us in Poland.'),
  mk('a4', 14.5, 18, 'Ruth', 'So we packed two suitcases and came.'),
  mk('a5', 19, 21, 'Interviewer', 'Tell me about your first day.'),
  mk('a6', 21.5, 27, 'Ruth', 'It was so hot, and nobody spoke Yiddish at the port.'),
  mk('a7', 27.5, 31, 'Ruth', 'But a woman gave us oranges.')] };
const B = { key: 'sam', name: 'Sam', lines: [
  mk('b1', 0, 5, 'Sam', 'We came to Israel because my brother was already here.'),
  mk('b2', 5.5, 9, 'Sam', 'He wrote every week telling us to come.'),
  mk('b3', 9.5, 14, 'Sam', 'The community here is like a family.')] };

test('questions: one per line, numbers and bullets dropped, no repeats; several on one line are split', () => {
  assert.deepStrictEqual(Q.parse('1. What brought you here?\nQ2) Tell me about your first day.\n\n- What does community mean?\n• what brought you here?\nQuestion 5: Who helped you?'),
    ['What brought you here?', 'Tell me about your first day.', 'What does community mean?', 'Who helped you?']);
  assert.deepStrictEqual(Q.parse('Where were you born? Why did you leave? '), ['Where were you born?', 'Why did you leave?']);
  assert.deepStrictEqual(Q.parse('1960s – what was it like?'), ['1960s – what was it like?'], 'a year is not a number to drop');
  assert.strictEqual(Q.short('What brought you to Israel in the first place after the war?'), 'What brought you to Israel in the first…');
});

test('requests: whole interviews in one part; a long interview is split with an overlap; only line text and the questions are sent', () => {
  const reqs = Q.requests(['What brought you to Israel?'], [A, B]);
  assert.strictEqual(reqs.length, 1);
  const listing = reqs[0].req.user[0].text, task = reqs[0].req.user[1];
  assert.ok(/=== Interview 1 ===\na1\tInterviewer\tWhat brought you/.test(listing) && /=== Interview 2 ===\nb1\tSam/.test(listing), listing);
  assert.ok(/Questions:\n1\. What brought you to Israel\?/.test(task));
  const long = { key: 'long', lines: Array.from({ length: 100 }, (_, i) => mk('l' + i, i * 2, i * 2 + 1.5, 'X', 'Line number ' + i)) };
  const ps = Q.parts([A, long, B], { lines: 40, chars: 1e6 });
  assert.ok(ps.every(p => p.reduce((n, x) => n + x.lines.length, 0) <= 40 + 25), 'parts stay near the limit');
  const pieces = ps.flat().filter(x => x.key === 'long');
  assert.ok(pieces.length >= 3 && pieces[1].lines[0].id === 'l' + (34 - 25), 'overlap at the join: ' + pieces.map(p => p.lines[0].id).join(','));
  assert.ok(ps.flat().filter(x => x.key === 'ruth').length === 1, 'a short interview is never split');
});

test('answers: full spans in one interview, ends turned round, unknown ids and numbers ignored, overlaps merged, best first', () => {
  const idx = Q.indexOf([A, B]), qs = ['What brought you to Israel?', 'Tell me about your first day.', 'Who is your family?'];
  const list = Q.collect([
    { question: 1, from: 'a4', to: 'a2', asked: 'a1', summary: 'Nothing left in Poland', score: 0.9 },
    { question: 1, from: 'b1', to: 'b2', asked: '', summary: 'Brother was here', score: 0.95 },
    { question: 1, from: 'b2', to: 'b3', asked: '', summary: 'Letters', score: 0.4 },          // overlaps b1–b2: merged
    { question: 2, from: 'a6', to: 'b3', asked: 'a5', summary: 'Hot, oranges', score: 0.8 },   // ends in another interview: just a6
    { question: 9, from: 'a2', to: 'a3', asked: '', summary: 'no such question', score: 1 },
    { question: 2, from: 'zz', to: 'a7', asked: '', summary: 'unknown id', score: 1 }
  ], idx, qs.length);
  assert.strictEqual(list.length, 4);
  assert.deepStrictEqual([list[0].from, list[0].to, list[0].asked], ['a2', 'a4', 'a1'], 'turned round, question asked kept');
  assert.deepStrictEqual([list[3].from, list[3].to], ['a6', 'a6']);
  const res = Q.organise(qs, list, idx);
  assert.deepStrictEqual(res.map(r => r.answers.length), [2, 1, 0]);
  assert.deepStrictEqual(res[0].answers.map(a => `${a.from}-${a.to}`), ['b1-b3', 'a2-a4'], 'merged, best first');
  assert.strictEqual(res[0].answers[0].summary, 'Brother was here');
  assert.deepStrictEqual(Q.linesOf(res[0].answers[1], idx).map(l => l.id), ['a2', 'a3', 'a4']);
  assert.deepStrictEqual(Q.linesOf(res[0].answers[1], idx, { asked: true }).map(l => l.id), ['a1', 'a2', 'a3', 'a4'], 'with the question being asked');
});

test('basic (no AI): the interviewer asking is followed by the answer; the run of one voice around a match', () => {
  const res = Q.basic(['What brought you to Israel?'], [A, B]);
  const spans = res[0].answers.map(a => `${a.from}-${a.to}${a.asked ? ' asked ' + a.asked : ''}`);
  assert.ok(spans.includes('a2-a4 asked a1'), spans.join(', '));
  assert.ok(spans.includes('b1-b3'), spans.join(', '));
  assert.ok(res[0].answers.every(a => a.by === 'basic'));
});

test('with AI (stand-in): the answers come back labelled by question, text only', async () => {
  const sent = [], was = US.ai;
  try {
  US.ai = { available: () => true, label: () => 'Claude', estimateFor: () => ({ usd: 0.01 }), approveTotal: async () => {},
    json: async req => { sent.push(req);
      return { answers: [{ question: 1, from: 'a2', to: 'a4', asked: 'a1', summary: 'Nothing left', score: 0.9 }] }; } };
  const res = await Q.findAI(['What brought you to Israel?'], [A, B].map(t => Object.assign({}, t)), { job: { set() {}, progress() {}, check() {} } });
  assert.strictEqual(res[0].answers.length, 1);
  assert.strictEqual(res[0].answers[0].by, 'ai');
  assert.strictEqual(res.missing.length, 0);
  assert.ok(sent.every(r => !/\.mp4|\.mov/i.test(JSON.stringify(r))), 'text only');
  } finally { US.ai = was; }
});
