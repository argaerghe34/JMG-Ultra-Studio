// From a script: the script read into lines (sections, speakers, notes), each found word for word or nearly, cut to
// just its words – across neighbouring lines too – with alternates; the AI only for lines said in other words; built
// in the script's order, a group per section.
const assert = require('assert');
const { load, test } = require('./harness');
global.addEventListener = global.addEventListener || (() => {});
global.ResizeObserver = global.ResizeObserver || function () { return { observe() {} }; };
const US = load(['time', 'transcript', 'ui', 'app', 'js/tools/22-story-glossary.js', 'js/tools/22-story-board.js', 'js/tools/22-story-export.js', 'js/tools/22-story-timeline.js', 'js/tools/22-story-narrative.js', 'js/tools/22-story-moments.js', 'js/tools/22-story-ai.js', 'js/tools/22-story-script.js', 'js/tools/22-story.js']);
const SC = US.storyScript, S = US.story;
// w: word timings in hundredths from the line's start, two per word
const words = (text, per = 40) => text.split(' ').flatMap((_, i) => [i * per, i * per + per - 10]);
const mk = (id, start, end, text, speaker = 'Ruth', exact = true) => Object.assign({ id, start, end, speaker, text }, exact ? { w: words(text) } : {});
const RUTH = [mk('r1', 0, 6, 'Well, you know, I never told anyone this, but my grandmother was a spy.'), mk('r2', 6, 9, 'She carried messages'), mk('r3', 9, 12, 'hidden in loaves of bread.'),
  mk('r4', 12, 16, 'We found the letters after she died.', 'Ruth', false), mk('q1', 16, 18, 'What happened to the letters?', 'Interviewer')];
const DAVID = [mk('d1', 0, 5, 'Every Friday night we open the doors to anyone who is hungry.', 'David'), mk('d2', 5, 9, 'My grandmother was a teacher, not a spy.', 'David')];
const TRS = [{ key: 'ruth', name: 'Ruth', lines: RUTH }, { key: 'david', name: 'David', lines: DAVID }];
const SCRIPT = '# Opening\nRuth: I never told anyone this, but my grandmother was a spy.\n[B-roll of the bakery]\nShe carried messages hidden in loaves of bread.\n\n# Friday\nDAVID – We open the doors to anyone who is hungry.\nThe weather in Iceland is terrible.';

test('the script read: sections from headings, speakers from “Name:”, notes in brackets', () => {
  const p = SC.parse(SCRIPT);
  assert.deepStrictEqual(p.sections, ['Opening', 'Friday']);
  assert.deepStrictEqual(p.units.map(u => [u.section, u.speaker, u.note]), [[0, 'Ruth', false], [0, '', true], [0, '', false], [1, 'DAVID', false], [1, '', false]]);
  assert.strictEqual(p.units[0].text, 'I never told anyone this, but my grandmother was a spy.');
  assert.deepStrictEqual(SC.parse('Then – we left.').units.map(u => [u.speaker, u.text]), [['', 'Then – we left.']], 'a dash after an ordinary word isn’t a speaker');
});

test('matching: word for word cut to just the words, across neighbouring lines, the right speaker first, alternates, nothing for what isn’t said', () => {
  const p = SC.parse(SCRIPT), m = SC.match(p.units, TRS, { speakerOf: l => l.speaker });
  const [a] = m.get('S1');
  assert.deepStrictEqual([a.lineIds, a.grade, a.from, a.to], [['r1'], 'exact', [0, 3], [0, 13]], '“Well, you know,” left off the front');
  assert.strictEqual(a.text, 'I never told anyone this, but my grandmother was a spy.');
  assert.ok(m.get('S1').some(x => x.key === 'david' && x.lineIds.join() === 'd2'), 'David’s similar line is an alternate');
  assert.ok(!m.get('S1').some(x => x.lineIds.length > 1), 'never stitched from the end of one line and the start of the next');
  const b = m.get('S3')[0];
  assert.deepStrictEqual([b.lineIds, b.grade], [['r2', 'r3'], 'exact'], 'one script line said over two lines');
  const d = m.get('S4')[0];
  assert.deepStrictEqual([d.lineIds, d.from[1], d.grade], [['d1'], 3, 'exact'], '“Every Friday night” left off');
  assert.ok(!(m.get('S5') || []).length, 'not said at all: no match');
});

test('building: script order, a group per section, each clip cut to its words (whole line when times are estimated), a marker on loose matches', () => {
  const p = SC.parse(SCRIPT + '\nWe found the letters after she died.'), m = SC.match(p.units, TRS);
  const chosen = new Map(); for (const [id, ms] of m) if (ms.length) chosen.set(id, ms[0]);
  const lineOf = id => RUTH.concat(DAVID).find(l => l.id === id);
  const g = SC.groups(p, chosen, lineOf);
  assert.deepStrictEqual(g.map(x => [x.name, x.lineIds]), [['Opening', ['r1', 'r2', 'r3']], ['Friday', ['d1', 'r4']]]);
  assert.ok(Math.abs(g[0].trims.r1.start - 1.1) < 1e-9 && Math.abs(g[0].trims.r1.end - 5.7) < 1e-9, 'from “I” with a little air, to the end of “spy.”');
  assert.deepStrictEqual(g[1].trims.r4, { start: 12, end: 16 }, 'no word times: the whole line');
  assert.strictEqual(Object.keys(g[0].lineMarks).length, 0, 'word-for-word matches need no marker');
});

test('story.script: matched (AI only for the line in other words) and built; the alternates and leaving a line out', async () => {
  S._useState({ transcripts: JSON.parse(JSON.stringify(TRS)).map(t => Object.assign(t, { path: `/m/${t.key}.mov`, itemId: 'item-' + t.key })) });
  const was = { call: US.host.call, ai: US.ai }, calls = [], sent = [];
  US.ai = { available: () => true, label: () => 'Claude', json: async req => { sent.push(req.user[0]); const L = /\n  (L\d+)\t[^\t]*\tWe found the letters/.exec(req.user[0]); return { picks: [{ unit: 'S6', line: L ? L[1] : 'L1', why: 'Same point' }] }; } };
  US.host.call = async (fn, a) => {
    calls.push([fn, a]);
    if (fn === 'storyClips') return [{ id: 'item-ruth', path: '/m/ruth.mov', name: 'ruth.mov' }, { id: 'item-david', path: '/m/david.mov', name: 'david.mov' }];
    if (fn === 'itemsInfo') return a.ids.map(id => ({ id, duration: 100 }));
    if (fn === 'newSequence') return { id: 'seqS', name: a.name };
    if (fn === 'storyPlace') return { placed: a.clips.map((c, i) => ({ start: i * 3, end: i * 3 + 3 })), cursor: a.clips.length * 3 };
    return {};
  };
  try {
    const job = { set() { return job; }, progress() {}, check() {}, log() {}, range() { return job; } };
    const r = await S.matchScript(job, { text: SCRIPT + '\nAfter her death we discovered the letters.', useAI: true });
    assert.strictEqual(sent.length, 1, 'one AI request');
    assert.ok(/S6\t/.test(sent[0]) && !/S1\t/.test(sent[0]), 'only the line said in other words (and the one not said) go to the AI');
    const st = S.state().script;
    assert.strictEqual(st.matches.S6[0].grade, 'ai');
    assert.strictEqual(st.chosen.S5, -1, 'not said: left out');
    assert.ok(/3 said word for word/.test(r.summary) && /1 matched by meaning/.test(r.summary), r.summary);
    st.chosen.S1 = st.matches.S1.findIndex(x => x.key === 'david');
    const b = await S.buildScript(job);
    const placed = calls.filter(c => c[0] === 'storyPlace').flatMap(c => c[1].clips);
    assert.strictEqual(calls.find(c => c[0] === 'newSequence')[1].name, 'Story – from the script');
    assert.strictEqual(placed[0].id, 'item-david', 'the alternate chosen is built');
    assert.deepStrictEqual(placed.map(c => c.id), ['item-david', 'item-ruth', 'item-ruth', 'item-david', 'item-ruth'], 'in the script’s order');
    assert.ok(b.seq);
    const act = US.actions.list().find(x => x.id === 'story.script');
    assert.ok(act.match('build from my script') && act.match('match this paper edit to the interviews') && !act.match('save the paper edit'));
  } finally { US.host.call = was.call; US.ai = was.ai; }
});
