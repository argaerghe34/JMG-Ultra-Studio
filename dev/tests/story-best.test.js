// Story › 3 Find › Best lines (US.storyBest): the most impactful lines for a simple highlight video. Each line scored
// on its words (a clear, complete soundbite, feeling, a good length) and – only when Listen to delivery is on and has
// heard it – how it is said; interviewer lines and questions left out; at most a few per interview when asked; with AI,
// the candidates read as text and the AI's picks kept. What it judges is always said, and delivery can be switched off
// for Best lines (then nothing about delivery is used or sent). Stand-ins for the AI and delivery: no network, no cost.
const assert = require('assert');
const { load, test } = require('./harness');
global.addEventListener = global.addEventListener || (() => {});
global.ResizeObserver = global.ResizeObserver || function () { return { observe() {} }; };
const US = load(['time', 'audio', 'dsp', 'vision', 'transcript', 'ai', 'understand-models', 'understand', 'delivery', 'ui', 'app',
  'js/tools/14-footage.js', 'js/tools/22-story-board.js', 'js/tools/22-story-captions.js', 'js/tools/22-story-export.js', 'js/tools/22-story-timeline.js', 'js/tools/22-story-narrative.js', 'js/tools/22-story-moments.js', 'js/tools/22-story-ai.js',
  'js/tools/22-story-ask.js', 'js/tools/22-story-context.js', 'js/tools/22-story-glossary.js', 'js/tools/22-story-questions.js', 'js/tools/22-story-lines.js', 'js/tools/22-story.js', 'js/tools/22-story-delivery.js', 'js/tools/22-story-english.js', 'js/tools/22-story-best.js']);
const B = US.storyBest, P = B._pure, S = US.story, D = US.delivery;
const job = { set() { return job; }, progress() { return job; }, busy() { return job; }, range() { return job; }, check() {}, log() {} };

const L = (id, start, end, text, speaker = 'Ruth') => ({ id, start, end, text, speaker });
function stateWith() {
  const a = [
    L('a1', 0, 9, 'When my mother died, I cried for weeks, and I still miss her every single day.'),
    L('a2', 10, 13, 'Um, yeah, so, um.'),
    L('a3', 14, 20, 'What was the best part of the day for you?', 'Interviewer'),
    L('a4', 21, 32, 'The moment the whole room stood up and sang together, I knew we had done something special.'),
    L('a5', 33, 95, 'And then we went to the hall and then we set up the chairs and then people came in and then the speeches started and it went on for a long time.')
  ];
  const b = [
    L('b1', 0, 8, 'I love this community. It saved my life, honestly.', 'David'),
    L('b2', 9, 15, 'The food was great and the music was brilliant.', 'David'),
    L('b3', 16, 24, 'We raised more money tonight than in the last three years together.', 'David')
  ];
  S._useState({ transcripts: [{ key: 'ruth', name: 'Ruth.mp4', path: '/x/Ruth.mp4', lines: a }, { key: 'david', name: 'David.mp4', path: '/x/David.mp4', lines: b }], themes: [], picked: [] });
}

test('each line scored on its own: a clear, heartfelt soundbite of a good length first; filler, the interviewer, questions and very long lines left out', async () => {
  stateWith();
  const r = await B.find(job, { useAI: false, count: 10, maxLen: 30 });
  const ids = r.list.map(x => x.lineId);
  assert.ok(!ids.includes('a3') && !ids.includes('a5'), 'the interviewer’s question and a 62-second line are left out: ' + ids);
  assert.ok(ids.indexOf('a1') < ids.indexOf('a2') && ids.indexOf('b1') < ids.indexOf('a2'), 'feeling beats filler: ' + ids);
  assert.strictEqual(ids[ids.length - 1], 'a2');
  assert.deepStrictEqual([r.by, r.withDelivery, r.usedDelivery], ['basic', false, 0]);
  assert.ok(/judged on the words only – no listening/.test(r.summary), r.summary);
  assert.ok(r.list.find(x => x.lineId === 'a1').reasons.includes('heartfelt'));
  // a few per interview
  const mix = await B.find(job, { useAI: false, count: 4, maxLen: 30, per: 2 });
  assert.deepStrictEqual(mix.list.map(x => x.lineId.charAt(0)).sort().join(''), 'aabb');
  assert.deepStrictEqual(P.spread([{ line: { id: 1 } }, { line: { id: 2 } }, { line: { id: 3 } }], { count: 2, per: 1, groupOf: id => (id < 3 ? 'x' : 'y') }).map(r => r.line.id), [1, 3]);
});

test('how it is said counts only when Listen to delivery is on and has heard the line – and Best lines says so; switched off here, nothing about delivery is used', async () => {
  stateWith();
  const keep = { settings: D.settings, plan: D.plan, forLine: D.forLine };
  const heard = { b2: { score: 5, energy: 'lively', notes: ['warm, laughing'], in: true, out: true }, a1: { score: 2, energy: 'flat', notes: ['mumbled'], in: true, out: false } };
  try {
    // off: the words only
    let u = B.uses(S.scopeLines());
    assert.deepStrictEqual([u.words, u.delivery.on, u.delivery.heard, u.delivery.why], [true, false, 0, 'off']);
    D.settings = () => ({ on: true, where: 'local', localModel: 'gemma-4-e2b', cloudModel: '', langs: {} });
    D.plan = () => ({ kind: 'helper', label: 'Gemma 4 E2B', why: '' });
    D.forLine = l => heard[l && l.id] || null;
    US.settings.set('story.bestDelivery', true);
    u = B.uses(S.scopeLines());
    assert.deepStrictEqual([u.delivery.on, u.delivery.heard, u.delivery.of, u.delivery.label, u.use], [true, 2, 8, 'Gemma 4 E2B', true]);
    const words = await (async () => { US.settings.set('story.bestDelivery', false); const r = await B.find(job, { count: 10 }); US.settings.set('story.bestDelivery', true); return r; })();
    const r = await B.find(job, { count: 10 });
    assert.deepStrictEqual([r.withDelivery, r.usedDelivery, words.withDelivery, words.usedDelivery], [true, 2, false, 0]);
    const at = (x, id) => x.list.findIndex(y => y.lineId === id);
    assert.ok(at(r, 'b2') < at(words, 'b2'), 'said well: higher');
    const sc = (x, id) => x.list.find(y => y.lineId === id).score;
    assert.ok(sc(r, 'a1') < sc(words, 'a1') && r.list.find(x => x.lineId === 'a1').reasons.includes('weak delivery (2/5)'), 'mumbled: lower');
    assert.ok(r.list.find(x => x.lineId === 'b2').reasons.some(x => /said well \(5\/5, warm, laughing\)/.test(x)));
    assert.ok(/and how 2 of them are said \(listened to\)/.test(r.summary), r.summary);
    // the AI rows carry the delivery note only when it counts
    D.note = l => (heard[l.id] ? ` [delivery ${heard[l.id].score}/5: ${heard[l.id].notes[0]}]` : '');
    const l = S.lineOf('b2');
    assert.ok(/\[delivery 5\/5/.test(P.row(l, true)) && !/delivery/.test(P.row(l, false)));
    const withD = P.requests([l, S.lineOf('b1')], { all: S.scopeLines(), count: 10, withDelivery: true })[0].req;
    const noD = P.requests([l, S.lineOf('b1')], { all: S.scopeLines(), count: 10, withDelivery: false })[0].req;
    assert.ok(withD.user[1].includes(P.DELIVERY_HINT.trim()) && !noD.user[1].includes('SAID') && !/delivery/.test(noD.user[0].text));
  } finally { Object.assign(D, keep); delete D.note; D.note = US.delivery.note; US.settings.set('story.bestDelivery', true); }
});

test('with AI: the candidates read as text (best first, in project order), the AI’s picks kept with why, unknown ids ignored', async () => {
  stateWith();
  const keep = { available: US.ai.available, json: US.ai.json, label: US.ai.label };
  const asked = [];
  US.ai.available = () => true; US.ai.label = () => 'Stand-in AI';
  US.ai.json = async req => { asked.push(req); return { picks: [{ lineId: 'b3', reason: 'a proud moment', score: 0.95 }, { lineId: 'a4', reason: 'goosebumps', score: 0.9 }, { lineId: 'zz', reason: 'made up', score: 1 }] }; };
  try {
    const r = await B.find(job, { useAI: true, count: 5 });
    assert.strictEqual(asked.length, 1);
    assert.ok(/highlight video of an event/.test(asked[0].system) && asked[0].feature === 'Best lines');
    const listing = asked[0].user[0].text;
    assert.ok(listing.indexOf('a1\t') < listing.indexOf('b1\t') && !listing.includes('a3\t') && !listing.includes('a5\t'), 'project order, no interviewer, nothing too long');
    assert.deepStrictEqual(r.list.map(x => [x.lineId, x.score, x.reasons[0]]), [['b3', 0.95, 'a proud moment'], ['a4', 0.9, 'goosebumps']]);
    assert.ok(/chosen by Stand-in AI/.test(r.summary));
  } finally { Object.assign(US.ai, keep); }
});

test('the parts on their own: length suits a highlight; delivery moves the score; Find has the Best lines button and what it judges', () => {
  assert.deepStrictEqual([P.lengthFit(1), P.lengthFit(3), P.lengthFit(10), P.lengthFit(25), P.lengthFit(45)], [0, 0.5, 1, 0.7, 0.2]);
  const q = { score: 0.7, reasons: [] }, l = { start: 0, end: 10, text: 'x' };
  const plain = P.lineScore(l, { q }).score, good = P.lineScore(l, { q, dlv: { score: 5, notes: [] } }).score, poor = P.lineScore(l, { q, dlv: { score: 1, notes: [] } }).score;
  assert.ok(good > plain && plain > poor, [good, plain, poor].join());
  const src = require('fs').readFileSync(require('path').join(__dirname, '..', '..', 'js', 'tools', '22-story.js'), 'utf8');
  assert.ok(/ui\.button\('Best lines'/.test(src) && /B\.usesBox\(lines/.test(src));
  assert.ok(/What Best lines judges/.test(require('fs').readFileSync(require('path').join(__dirname, '..', '..', 'js', 'tools', '22-story-best.js'), 'utf8')));
});
