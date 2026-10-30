// Beat map: passages (one speaker, not across interviews, up to a length), scoring requests and answers, word cues
// without AI, the strongest first, and the board built in its own order.
const assert = require('assert');
const { load, test } = require('./harness');
global.addEventListener = global.addEventListener || (() => {});
global.ResizeObserver = global.ResizeObserver || function () { return { observe() {} }; };
const US = load(['time', 'transcript', 'ui', 'app', 'js/tools/22-story-glossary.js', 'js/tools/22-story-board.js', 'js/tools/22-story-export.js', 'js/tools/22-story-timeline.js', 'js/tools/22-story-narrative.js', 'js/tools/22-story-moments.js', 'js/tools/22-story-ai.js', 'js/tools/22-story-heat.js', 'js/tools/22-story.js']);
const H = US.storyHeat, S = US.story;
const mk = (id, start, end, text, speaker = 'Ruth') => ({ id, start, end, speaker, text });
const TS = [{ key: 'r', name: 'Ruth', lines: [mk('a1', 0, 10, 'My mother cried when we left.'), mk('a2', 10, 20, 'I miss her every day.'), mk('a3', 20, 60, 'The factory opened in 1962 and employed 400 people.'), mk('q1', 60, 63, 'Why?', 'Interviewer'), mk('a4', 63, 70, 'We laughed so much, it was ridiculous.')] },
  { key: 's', name: 'Sam', lines: [mk('b1', 0, 10, 'But they never agreed with us.', 'Sam')] }];

test('passages: one speaker’s neighbouring lines up to the length, never across interviews or past a skipped line', () => {
  const ps = H.passages(TS, { maxLen: 40, keep: l => l.speaker !== 'Interviewer' });
  assert.deepStrictEqual(ps.map(p => [p.key, p.lineIds]), [['r', ['a1', 'a2']], ['r', ['a3']], ['r', ['a4']], ['s', ['b1']]]);
});

test('requests carry text only and the chosen criteria; answers become 0–1 scores; word cues without AI; strongest first', () => {
  const ps = H.passages(TS);
  const reqs = H.requests(ps, ['emotion', 'humour'], { per: 2, brief: 'a film about leaving' });
  assert.strictEqual(reqs.length, 3);
  assert.ok(/emotion \(feeling/.test(reqs[0].system[0].text) && /What the film is about: a film about leaving/.test(reqs[0].user[0]) && /P1\tRuth\tMy mother cried/.test(reqs[0].user[0]));
  assert.deepStrictEqual(Object.keys(reqs[0].schema.properties.passages.items.properties.scores.properties), ['emotion', 'humour']);
  const sc = H.collect([{ passages: [{ id: 'P1', scores: { emotion: 9, humour: 1 }, note: 'loss' }, { id: 'P4', scores: { emotion: 2, humour: 8 }, note: '' }] }], ['emotion', 'humour']);
  assert.deepStrictEqual(sc.get('P1').scores, { emotion: 0.9, humour: 0.1 });
  assert.deepStrictEqual(H.top(ps, sc, 'humour', ['emotion', 'humour']).map(p => p.id), ['P4', 'P1']);
  assert.deepStrictEqual(H.top(ps, sc, 'any', ['emotion', 'humour']).map(p => p.id), ['P1', 'P4']);
  const b = H.basic(ps, ['emotion', 'humour', 'information', 'conflict']);
  assert.ok(b.get('P1').scores.emotion > b.get('P2').scores.emotion || b.get('P1').scores.emotion > 0.3, 'feelings score as emotion');
  assert.ok(b.get('P4').scores.humour > 0.3 && b.get('P2').scores.information > 0.3 && b.get('P5').scores.conflict > 0.3, JSON.stringify([...b]));   // P3 is the interviewer’s question
});

test('the board builds in its own order, whole passages', async () => {
  const st = S._useState({ transcripts: JSON.parse(JSON.stringify(TS)) });
  const was = US.ai; US.ai = { available: () => false };
  try {
    await S.scoreBeats({ set() { return this; }, progress() {}, check() {}, log() {} }, { crit: ['emotion', 'humour'] });
    assert.ok(st.beatMap.passages.length >= 3 && Object.keys(st.beatMap.scores).length === st.beatMap.passages.length);
    const byLine = id => st.beatMap.passages.find(p => p.lineIds.includes(id)).id;
    st.beatBoard = [byLine('a4'), byLine('a1')];
    assert.deepStrictEqual(S.boardGroups()[0].lineIds, ['a4', 'a1', 'a2'], 'the board’s order, each passage whole');
  } finally { US.ai = was; }
});
