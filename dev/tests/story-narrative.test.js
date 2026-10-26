// Story › Narrative from a brief (S2): reading the brief, word trims, fitting to length, the basic version, checking the
// AI's plan, the pool (How picky selects + Find more), the board group and how it builds.
const assert = require('assert'), path = require('path');
const { load, test, MEDIA } = require('./harness');
global.addEventListener = global.addEventListener || (() => {});
global.ResizeObserver = global.ResizeObserver || function () { return { observe() {} }; };
const US = load(['time', 'transcript', 'ui', 'app', 'js/tools/22-story-board.js', 'js/tools/22-story-export.js', 'js/tools/22-story-timeline.js', 'js/tools/22-story-narrative.js', 'js/tools/22-story-moments.js', 'js/tools/22-story-ai.js', 'js/tools/22-story.js', 'js/tools/40-assistant.js']);
const S = US.story, T = US.transcript, N = US.storyNarrative;
const TR = path.join(MEDIA, 'transcripts');
const job = { set() {}, progress() {}, check() {}, log() {} };

function fresh(extra = {}) {
  const transcripts = ['I001_interview.srt', 'Interview_David_Cohen.txt', 'Interview_Miriam_Levy.csv'].map((f, i) => ({ key: f, name: f, path: '/media/' + f, itemId: 'item' + i, source: 'file', lines: T.toLines(T.parseFile(path.join(TR, f)).segments, 'p' + i) }));
  const st = S._useState(Object.assign({ transcripts }, extra));
  st.themes = T.themesOffline(st.transcripts.flatMap(t => t.lines), { max: 8 });
  S.ensureColours();
  return st;
}
const lineOf = st => { const m = new Map(st.transcripts.flatMap(t => t.lines).map(l => [l.id, l])); return id => m.get(id); };
function withAIStub(fn, answer) {
  const was = US.ai;
  const calls = [];
  US.ai = { available: () => true, label: () => 'Claude', json: async req => { calls.push(req); return typeof answer === 'function' ? answer(req) : answer; } };
  return Promise.resolve(fn(calls)).finally(() => { US.ai = was; });
}

test('the brief: length (15 s – 10 min, 60 s if not given), topic and tone', () => {
  const b = x => N.parseBrief(x);
  const cases = [
    ['Create a 60-second video on this topic', 60, ''],
    ['make a 90 second video about how the community looks after each other', 90, 'how the community looks after each other'],
    ['A 2-minute uplifting film about faith and family', 120, 'faith and family'],
    ['1:30 on volunteering', 90, 'volunteering'],
    ['a minute and a half about growing up in London', 90, 'growing up in London'],
    ['half a minute on hope', 30, 'hope'],
    ['give me a short punchy promo about the youth club, 30s', 30, 'the youth club'],
    ['5 min piece on the history of the shul', 300, 'the history of the shul'],
    ['a 5 second sting about bread', 15, 'bread'],
    ['a 20 minute documentary about the war years', 600, 'the war years']
  ];
  for (const [text, secs, topic] of cases) { const r = b(text); assert.strictEqual(r.seconds, secs, text); assert.strictEqual(r.topic, topic, text); }
  assert.strictEqual(b('A 2-minute uplifting film about faith').tone, 'uplifting');
  assert.deepStrictEqual(b('something about Shabbat'), { seconds: 60, topic: 'Shabbat', tone: '', said: false });
});

test('trims drop whole words and use word timings (exact) or an even spread', () => {
  const exact = { id: 'w', start: 10, end: 13, text: 'Well, I think family is everything.', w: [0, 30, 40, 60, 70, 110, 120, 180, 190, 220, 230, 300] };
  const t = N.trimmed(exact, 2, 0);
  assert.strictEqual(t.text, '…think family is everything.');
  assert.ok(Math.abs(t.start - 10.7) < 1e-9 && Math.abs(t.end - 13) < 1e-9 && t.exact, JSON.stringify(t));
  const both = N.trimmed(exact, 1, 1);
  assert.strictEqual(both.text, '…I think family is…'); assert.ok(Math.abs(both.end - 12.2) < 1e-9);
  const spread = N.trimmed({ id: 's', start: 0, end: 10, text: 'one two three four five' }, 1, 1);
  assert.ok(!spread.exact && spread.start > 1.5 && spread.end < 8.5, JSON.stringify(spread));
  assert.strictEqual(N.trimmed(exact, 99, 99).text.replace(/…/g, '').split(' ').length, 1, 'never trimmed to nothing');
});

test('fitting: weakest middle lines go first (while that leaves enough), the hook and payoff stay, then lines lose words', () => {
  const lines = new Map();
  const mk = (id, dur, strength, lead = '') => { lines.set(id, { id, start: 0, end: dur, text: lead + Array.from({ length: Math.round(dur * 2.5) }, (_, i) => 'word' + i).join(' ') + '.' }); return Object.assign({ lineId: id, purpose: '', strength }, N.trimmed(lines.get(id))); };
  const fitted = (bs, target) => N.fit(bs.map(b => Object.assign({}, b)), target, { handles: 0, lineOf: id => lines.get(id) });
  const beats = [mk('hook', 5, 0.6), mk('a', 10, 0.9), mk('b', 10, 0.3), mk('c', 10, 0.5), mk('payoff', 8, 0.8)];
  const twenty = fitted(beats, 20);
  assert.deepStrictEqual(twenty.map(b => b.lineId), ['hook', 'a', 'payoff'], 'dropped the two weakest middle lines');
  assert.ok(N.total(twenty, 0) <= 22 && N.total(twenty, 0) >= 18, 'within ±10%: ' + N.total(twenty, 0));
  const t28 = fitted(beats, 28);
  assert.deepStrictEqual(t28.map(b => b.lineId), ['hook', 'a', 'c', 'payoff'], 'only the weakest dropped – dropping another would be too short');
  assert.ok(N.total(t28, 0) <= 28 * 1.1 && N.total(t28, 0) >= 28 * 0.9 && t28.some(b => b.dropEnd > 0), 'then tightened by words: ' + N.total(t28, 0));
  assert.deepStrictEqual(fitted(beats, 30).map(b => b.lineId), ['hook', 'a', 'c', 'payoff'], '33 s is within +10% of 30 s');
  // a single over-long middle line is tightened, not dropped; a leading “And” goes first
  const long = [mk('hook', 4, 0.6), mk('big', 30, 0.9, 'And '), mk('payoff', 4, 0.8)];
  const t = fitted(long, 30);
  assert.strictEqual(t.length, 3); assert.ok(N.total(t, 0) <= 33 && t[1].dropStart === 1 && t[1].dropEnd > 0 && /^…word0/.test(t[1].text) && /…$/.test(t[1].text), `tightened: ${N.total(t, 0)} s ${t[1].text.slice(0, 20)}`);
});

test('basic version: short strong hook, heartfelt payoff on the topic, mixed voices, fitted to the length', async () => {
  const st = fresh(), L = lineOf(st);
  for (const brief of ['a 60-second video about family', 'a 30 second film about the community', '45s about faith']) {
    const b = N.parseBrief(brief);
    const pool = await S.narrativePool(job, b);
    const nar = N.basic(pool, b.seconds, { handles: 0.3, lineOf: L });
    const total = N.total(nar.beats, 0.3);
    assert.ok(total <= b.seconds * 1.1 && total >= b.seconds * 0.9, `${brief}: ${total.toFixed(1)} s`);
    const hook = nar.beats[0], payoff = nar.beats[nar.beats.length - 1];
    assert.ok(hook.end - hook.start <= 12, 'short hook');
    const pc = pool.find(c => c.id === payoff.lineId);
    assert.ok(pc.heart > 0 || pc.strength >= 0.8, `heartfelt or strong payoff for ${brief}`);
    assert.strictEqual(nar.by, 'basic');
    const spk = nar.beats.map(x => L(x.lineId).speaker);
    assert.ok(spk.some((s, i) => i && s !== spk[i - 1]), 'more than one voice');
  }
});

test('the pool: How picky selects (themes and board) plus Find more on the topic, no interviewer, no duplicates', async () => {
  const st = fresh(), L = lineOf(st);
  st.transcripts[0].lines.push({ id: 'q1', start: 200, end: 204, speaker: 'Interviewer', text: 'What does family mean to you?' }); S.reindex();
  st.wall.columns.push({ id: 'b', name: 'Board', label: 2, cards: [{ lineId: st.transcripts[1].lines[3].id }] });
  const pool = await S.narrativePool(job, N.parseBrief('60 seconds about family'));
  assert.ok(pool.length >= 6);
  assert.ok(!pool.some(c => c.id === 'q1'), 'no interviewer questions');
  assert.strictEqual(new Set(pool.map(c => c.id)).size, pool.length, 'each line once');
  assert.ok(pool.some(c => c.from.includes('Family')), 'theme selects');
  assert.ok(pool.every(c => c.rel >= 0 && c.rel <= 1 && c.strength >= 0 && c.strength <= 1));
  // pickier setting -> fewer theme selects in the pool
  const before = pool.filter(c => c.from.some(f => f !== 'find more' && f !== 'board')).length;
  st.picky = { s: S.PICKY_LEVELS.best };
  const best = (await S.narrativePool(job, N.parseBrief('60 seconds about family'))).filter(c => c.from.some(f => f !== 'find more' && f !== 'board')).length;
  assert.ok(best < before, `Only the best gives fewer selects: ${best} < ${before}`);
  // no topic: every select, nothing from Find more
  st.picky = {};
  const all = await S.narrativePool(job, N.parseBrief('a 60 second video'));
  assert.ok(all.length && all.every(c => !c.from.includes('find more')));
  assert.ok(L(pool[0].id));
});

test('with AI: only text is sent; unknown ids, repeats and silly trims are dropped; the length is checked and fitted', async () => {
  const st = fresh(), L = lineOf(st);
  const b = N.parseBrief('a 30 second video about family');
  const pool = await S.narrativePool(job, b);
  await withAIStub(async calls => {
    const nar = await N.withAI(pool, b, { handles: 0.3, lineOf: L, speakerName: s => s, interviewName: () => 'Interview' });
    const req = calls[0], sent = req.user.map(b => (typeof b === 'string' ? b : b.text)).join('\n');
    assert.ok(req.user[0].cache && /^Interview lines/.test(req.user[0].text) && /Length: 30 seconds/.test(req.user[1]) && /family/.test(req.user[1]), 'the listing first (cached), then the brief');
    assert.ok(!/\/media\//.test(sent) && !/item\d/.test(sent), 'no paths or clip ids sent');
    assert.strictEqual(req.feature, 'Narrative cut');
    assert.strictEqual(req.schema, N.AI_SCHEMA);
    assert.deepStrictEqual(nar.beats.map(x => x.lineId).slice(0, 2), [pool[0].id, pool[2].id]);
    assert.ok(!nar.beats.some(x => x.lineId === 'nope'), 'unknown id dropped');
    assert.strictEqual(nar.beats.filter(x => x.lineId === pool[0].id).length, 1, 'repeat dropped');
    assert.strictEqual(nar.beats[1].dropStart, 1, 'a sensible trim is kept');
    assert.ok(N.total(nar.beats, 0.3) <= 33, 'fitted: ' + N.total(nar.beats, 0.3));
    assert.strictEqual(nar.by, 'ai'); assert.strictEqual(nar.title, 'Home is where the door is open');
  }, req => ({ title: 'Home is where the door is open', logline: 'Family, told by three people.', beats: [
    { lineId: pool[0].id, purpose: 'Sets the scene', dropStartWords: 0, dropEndWords: 0 },
    { lineId: pool[2].id, purpose: 'Why it matters', dropStartWords: 1, dropEndWords: 0 },
    { lineId: 'nope', purpose: 'x', dropStartWords: 0, dropEndWords: 0 },
    { lineId: pool[0].id, purpose: 'again', dropStartWords: 0, dropEndWords: 0 },
    ...pool.slice(3, 14).map(c => ({ lineId: c.id, purpose: 'More', dropStartWords: 0, dropEndWords: 400 }))] }));
  assert.throws(() => N.checkAI({ beats: [{ lineId: 'zzz', purpose: '', dropStartWords: 0, dropEndWords: 0 }] }, pool, 30, { lineOf: L }), e => e.code === 'AI_FAILED');
});

test('makeNarrative puts it on the board as “Narrative · 60 s · topic”; it builds as Hook, Build, Payoff with theme colours and trims', async () => {
  const st = fresh(), L = lineOf(st);
  const r = await S.makeNarrative(job, { brief: 'Make a 60-second video about family' });
  const col = st.wall.columns[st.wall.columns.length - 1];
  assert.strictEqual(col.name, 'Narrative · 60 s · family');
  assert.ok(col.narrative && col.narrative.by === 'basic' && col.narrative.seconds === 60);
  assert.strictEqual(col.cards.length, r.narrative.beats.length);
  assert.ok(col.cards.every(k => k.note), 'each card says what it does');
  assert.ok(/basic version/.test(r.summary), r.summary);
  // same brief again: a second group, the first is kept
  await S.makeNarrative(job, { brief: 'Make a 60-second video about family' });
  assert.ok(st.wall.columns.some(c => c.name === 'Narrative · 60 s · family (2)'));
  assert.strictEqual(S.latestNarrative().name, 'Narrative · 60 s · family (2)');
  // trim one card, then build groups
  col.cards[1].trim = { dropStart: 1, dropEnd: 0 };
  const groups = S.narrativeGroups(col);
  assert.deepStrictEqual(groups.map(g => g.name), ['Hook', 'Build', 'Payoff']);
  assert.deepStrictEqual(groups.flatMap(g => g.lineIds), col.cards.map(k => k.lineId));
  const tr = S.trimOf(col.cards[1]);
  const plan = S.planBuild(groups, { handles: 0.3, colour: true, itemFor: () => 'item', durOf: () => 1e9 });
  const c1 = plan.clips.find(c => c.lineId === col.cards[1].lineId);
  assert.ok(Math.abs(c1.in - (tr.start - 0.3)) < 1e-9 && tr.start > L(col.cards[1].lineId).start, 'trimmed start used');
  const sel = S.selectionMap({ themes: true, board: false, builds: false });
  for (const c of plan.clips) { const x = sel.get(c.lineId); assert.strictEqual(c.label, x ? x.label : S.columnLabel(col), 'each line in its theme colour'); }
  // rearranging on the board changes the hook
  const first = col.cards[0]; col.cards.push(col.cards.shift());
  assert.strictEqual(S.narrativeGroups(col)[2].lineIds[0], first.lineId);
  // building the whole board keeps the trim too
  const wg = S.wallGroups().find(g => g.name === col.name);
  assert.deepStrictEqual(Object.keys(wg.trims), [col.cards.find(k => k.trim).lineId]);
});

test('the Assistant understands narrative briefs and “build the narrative”', () => {
  const m = t => US.assistant.matchOffline(t).steps[0] || {};
  assert.strictEqual(m('make a 60 second video about community').action, 'story.narrative');
  assert.strictEqual(m('make a 60 second video about community').params.brief, 'make a 60 second video about community');
  assert.strictEqual(m('cut a 2 minute story about faith and family').action, 'story.narrative');
  assert.strictEqual(m('create a 30s promo about the youth club').action, 'story.narrative');
  assert.strictEqual(m('make a 90 second cut about family from the interviews').action, 'story.narrative');
  assert.deepStrictEqual(m('build the narrative').params, { source: 'narrative' });
  assert.deepStrictEqual(m('build the sequence from the themes').params, { source: 'themes' });
  assert.notStrictEqual(m('make a 30 second edit on the beat').action, 'story.narrative');
  assert.notStrictEqual(m('make a 30 second montage of the Selects bin to this track').action, 'story.narrative');
  assert.notStrictEqual(m('lines about volunteering').action, 'story.narrative');
});
