// Story › Check the words: mis-heard names and short forms found (near a term you gave or one used often, said as
// letters, odd capitals, rare short forms, names spelt two ways), ordinary words left alone; corrections for the ticked
// ones only, with word timings kept; the AI sees only the unusual words; and the corrected transcript back out.
const assert = require('assert');
const { load, test } = require('./harness');
global.ResizeObserver = global.ResizeObserver || function () { return { observe() {} }; };
const US = load(['time', 'audio', 'dsp', 'transcript', 'ui', 'app', 'ai', 'js/tools/22-story-glossary.js', 'js/tools/22-story-board.js', 'js/tools/22-story-export.js', 'js/tools/22-story-timeline.js', 'js/tools/22-story-narrative.js', 'js/tools/22-story-moments.js', 'js/tools/22-story-ai.js', 'js/tools/22-story-context.js', 'js/tools/22-story-voices.js', 'js/tools/22-story-proof.js', 'js/tools/22-story.js', 'js/tools/38-wiki.js', 'js/tools/40-assistant.js']);
const P = US.storyProof, G = US.storyGlossary;
const L = (id, text, extra = {}) => Object.assign({ id, start: 0, end: 5, speaker: 'Ruth', text }, extra);
const LINES = [
  L('a1', 'I joined FJL in 2019 and FJL changed my life.'),
  L('a2', 'Everyone at FJL knows Jacob Gersch.'),
  L('a3', 'The FTL team came to Leeds.'),
  L('a4', 'We call it FJell for short.'),
  L('a5', 'Before F J L there was nothing here.'),
  L('a6', 'Sam said the same thing about the BBC and the NHS.'),
  L('a7', 'Then Gersh came back from Odessa.'),
  L('a8', 'The XQZ report was late.'),
  L('a9', 'He talks about FTL travel, faster than light, in his films.')
];

test('found: near-misses of a short form used often, said as letters, odd capitals, rare short forms, names spelt two ways', () => {
  const g = P.find(LINES, { terms: ['Gersch'] });
  const by = r => g.filter(x => x.right === r).flatMap(x => x.hits.map(h => `${h.lineId}:${h.word}`)).sort();
  assert.deepStrictEqual(by('FJL'), ['a3:FTL', 'a4:FJell', 'a5:F J L', 'a9:FTL']);
  assert.deepStrictEqual(by('Gersch'), ['a7:Gersh']);
  const shape = g.filter(x => x.kind === 'shape').flatMap(x => x.hits.map(h => h.word));
  assert.deepStrictEqual(shape, ['XQZ'], 'a rare short form with nothing like it');
  const all = g.flatMap(x => x.hits.map(h => h.word));
  for (const ok of ['Sam', 'same', 'BBC', 'NHS', 'FJL', 'Leeds', 'Odessa']) assert.ok(!all.includes(ok), ok + ' left alone');
  assert.ok(/letter by letter/.test(g.find(x => x.hits.some(h => h.word === 'F J L')).why));
});

test('letters as they’re said: FJell, eff jay el', () => {
  assert.ok(P.spelled('FJell').includes('fjl'));
  assert.ok(P.spelled('effjayel').includes('fjl'));
  const g = P.find([L('b1', 'FJL FJL FJL'), L('b2', 'I worked for eff jay el for years.')]);
  assert.deepStrictEqual(g.flatMap(x => x.hits.map(h => h.word)), ['eff jay el']);
});

test('words said to be right aren’t shown again; Names and terms entries aren’t either', () => {
  assert.ok(!P.find(LINES, { ignore: ['FTL'] }).some(x => x.heard.includes('FTL')));
  assert.ok(!P.find(LINES, { entries: [{ right: 'FJL', heard: 'FJell' }] }).some(x => x.heard.includes('FJell')));
});

test('correcting the ticked ones only: FTL → FJL in a3 but not in a9 (faster than light); timings kept; undone by removing it', () => {
  const lines = JSON.parse(JSON.stringify(LINES));
  lines[2].w = [0, 20, 20, 60, 60, 90, 90, 120, 120, 150, 150, 200];   // The FTL team came to Leeds.
  lines[4].w = [0, 30, 30, 60, 60, 80, 80, 100, 100, 140, 140, 170, 170, 200, 200, 240];   // Before F J L there was nothing here.
  const g = P.find(lines).find(x => x.right === 'FJL');
  const ticked = new Set(g.hits.filter(h => h.lineId !== 'a9').map(h => h.lineId + ':' + h.i));
  const e = P.entryFor(g, 'FJL', ticked);
  assert.deepStrictEqual(e.lines.sort(), ['a3', 'a4', 'a5']);
  const list = P.merge([], e);
  G.apply(lines, list);
  assert.deepStrictEqual(lines.map(l => l.text).filter((t, i) => [2, 3, 4, 8].includes(i)), ['The FJL team came to Leeds.', 'We call it FJL for short.', 'Before FJL there was nothing here.', 'He talks about FTL travel, faster than light, in his films.']);
  assert.deepStrictEqual(lines[2].w, [0, 20, 20, 60, 60, 90, 90, 120, 120, 150, 150, 200], 'one word for one word: the same times');
  assert.deepStrictEqual(lines[4].w, [0, 30, 30, 100, 100, 140, 140, 170, 170, 200, 200, 240], '“F J L” → “FJL” spans the three letters’ time');
  assert.deepStrictEqual(G.clean(list)[0].lines.sort(), ['a3', 'a4', 'a5'], 'kept with its lines');
  // a second correction to the same spelling joins the first
  const more = P.merge(list, { right: 'FJL', heard: ['FTL'], lines: ['a9'] });
  assert.strictEqual(more.length, 1); assert.ok(more[0].lines.includes('a9'));
  G.apply(lines, []);
  assert.strictEqual(lines[2].text, 'The FTL team came to Leeds.', 'removing it puts the original back');
});

test('the corrected transcript goes out in Premiere’s format with the same word times', () => {
  const t = { key: 'k', name: 'Ruth', lines: [L('c1', 'The FTL team came.', { start: 10, end: 12, w: [0, 50, 50, 100, 100, 150, 150, 200] })] };
  G.apply(t.lines, [{ right: 'FJL', heard: 'FTL' }]);
  const j = US.storyVoices.premiereTranscript(t, () => 'Ruth');
  assert.deepStrictEqual(j.segments[0].words.map(w => [w.text, w.start, w.duration]), [['The', 10, 0.5], ['FJL', 10.5, 0.5], ['team', 11, 0.5], ['came.', 11.5, 0.5]]);
});

test('the AI sees only the unusual words, once each, with a little context; its answers become groups for words that are there', () => {
  const c = P.aiCandidates(LINES);
  assert.ok(c.some(x => x.w === 'FTL' && /The FTL team came/.test(x.ctx)));
  assert.ok(!c.some(x => /^(team|came|the|said)$/i.test(x.w)), 'ordinary words aren’t sent');
  assert.strictEqual(c.filter(x => x.w === 'FJL').length, 1, 'each word once');
  const req = P.aiRequest(c, { terms: ['FJL'] });
  assert.ok(/Names and terms that appear in these interviews: FJL/.test(req.user) && req.schema === P.AI_SCHEMA && req.feature === 'Check the words');
  assert.ok(!req.user.includes('I joined FJL in 2019 and FJL changed my life.'), 'not whole lines');
  const g = P.aiGroups(LINES, [{ heard: 'Odessa', right: 'Odesa', why: 'Ukrainian spelling' }, { heard: 'Nowhere', right: 'X', why: '' }]);
  assert.deepStrictEqual(g.map(x => [x.right, x.hits.length]), [['Odesa', 1]]);
});

test('asking the Assistant', () => {
  const m = t => (US.assistant.matchOffline(t).steps[0] || {}).action;
  assert.strictEqual(m('find words the transcript got wrong'), 'story.proof');
  assert.strictEqual(m('check the transcripts for spelling mistakes'), 'story.proof');
});

test('names from the AI: only capitalised words and short forms with a little around them are sent; one name each, with title, people first', () => {
  const c = P.nameCandidates(LINES);
  assert.ok(c.some(x => x.w === 'Gersch' && /Everyone at FJL knows Jacob Gersch/.test(x.ctx[0])));
  assert.strictEqual(c.find(x => x.w === 'FJL').n, 3, 'how often it’s mentioned');
  assert.ok(!c.some(x => /^(team|said|report)$/i.test(x.w)));
  const req = P.namesRequest(c, { known: ['FJL'] });
  assert.ok(req.schema === P.NAMES_SCHEMA && /Names the editor already gave: FJL/.test(req.user) && /title or role/.test(req.system));
  const got = P.namesFrom({ names: [
    { name: 'FJL', title: 'a youth charity', kind: 'organisation', heard: ['FTL', 'FJell', 'FJL'], why: '' },
    { name: 'Jacob Gersch', title: 'Rabbi', kind: 'person', heard: ['Gersh'], why: 'runs it' },
    { name: 'jacob gersch', title: '', kind: 'person', heard: ['Gersh.'], why: '' },
    { name: 'Odessa', title: '', kind: 'nowhere', heard: [], why: '' }, { name: '', title: '', kind: 'person', heard: [], why: '' }] }, LINES);
  assert.deepStrictEqual(got.map(p => [p.name, p.title, p.kind, p.ok]), [['Jacob Gersch', 'Rabbi', 'person', true], ['FJL', 'a youth charity', 'organisation', true], ['Odessa', '', 'other', true]]);
  assert.deepStrictEqual(got[1].heard, ['FTL', 'FJell'], 'the right spelling isn’t listed as heard');
  assert.ok(got[0].n >= 2, 'Gersch and Gersh both counted');
});

test('the names box: ticked names in, unticked out, a re-spelt name replaces its old spelling, the editor’s own words kept', () => {
  const ps = [{ name: 'FJL', ok: true }, { name: 'Odessa', ok: false }, { name: 'Jacob Gersch', was: 'Jakob Gersch', ok: true }];
  assert.deepStrictEqual(P.termsWith(['Leeds', 'Odessa', 'Jakob Gersch'], ps), ['FJL', 'Jacob Gersch', 'Leeds']);
});
