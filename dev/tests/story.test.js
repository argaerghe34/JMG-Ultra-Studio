// Story round 2: colours, reordering, strongest lines, the build plan, and themes you add yourself.
const assert = require('assert'), path = require('path');
const { load, test, MEDIA } = require('./harness');
global.addEventListener = global.addEventListener || (() => {});
global.ResizeObserver = global.ResizeObserver || function () { return { observe() {} }; };
const US = load(['time', 'transcript', 'ui', 'app', 'js/tools/22-story-ai.js', 'js/tools/22-story.js']);
const S = US.story, T = US.transcript;
const TR = path.join(MEDIA, 'transcripts');

function fresh(extra = {}) {
  const transcripts = ['I001_interview.srt', 'Interview_David_Cohen.txt', 'Interview_Miriam_Levy.csv'].map((f, i) => {
    const segs = T.parseFile(path.join(TR, f)).segments;
    return { key: f, name: f, path: '/media/' + f, itemId: 'item' + i, source: 'file', lines: T.toLines(segs, 'p' + i) };
  });
  return S._useState(Object.assign({ transcripts }, extra));
}
const linesOf = st => st.transcripts.flatMap(t => t.lines);

test('colours: themes get distinct colours, never the highlight colour; columns follow their theme', () => {
  const st = fresh({ themes: [{ id: 'a', name: 'A', lineIds: [] }, { id: 'b', name: 'B', lineIds: [] }, { id: 'c', name: 'C', lineIds: [], label: 2 }], wall: { columns: [{ id: 'c1', name: 'A', themeId: 'a', cards: [] }, { id: 'c2', name: 'Loose', cards: [] }] } });
  const labels = st.themes.map(t => t.label);
  assert.strictEqual(new Set(labels).size, 3);
  assert.ok(!labels.includes(15), 'Yellow is kept for the strongest lines');
  assert.strictEqual(st.wall.columns[0].label, st.themes[0].label);
  assert.ok(st.wall.columns[1].label != null && !labels.includes(st.wall.columns[1].label));
  S.setColour(st.wall.columns[0], 9);
  assert.strictEqual(st.themes[0].label, 9, 'changing the column colour changes its theme');
  S.setColour(st.themes[0], 11);
  assert.strictEqual(st.wall.columns[0].label, 11, 'and the other way round');
  assert.strictEqual(S.nextColour([1, 2], 15), 7);
});
test('reordering columns and cards without dragging', () => {
  const st = fresh({ wall: { columns: [{ id: 'x', name: 'X', cards: [{ lineId: 'a' }, { lineId: 'b', pinned: true }, { lineId: 'c' }, { lineId: 'd' }] }, { id: 'y', name: 'Y', cards: [] }, { id: 'z', name: 'Z', cards: [] }] } });
  const cols = st.wall.columns, ids = () => cols.map(c => c.id).join('');
  assert.strictEqual(S.moveColumn(0, 'left'), false); assert.strictEqual(ids(), 'xyz');
  assert.ok(S.moveColumn(0, 'right')); assert.strictEqual(ids(), 'yxz');
  assert.ok(S.moveColumn(2, 0)); assert.strictEqual(ids(), 'zyx');
  assert.strictEqual(S.moveColumn(2, 'right'), false);
  const x = cols[2], order = () => x.cards.map(k => k.lineId).join('');
  assert.ok(S.moveCard(x, x.cards[2], 'up')); assert.strictEqual(order(), 'acbd');
  assert.ok(S.moveCard(x, x.cards[3], 'top')); assert.strictEqual(order(), 'adcb', 'top stops below the pinned card');
  assert.strictEqual(S.moveCard(x, x.cards[0], 'up'), false);
  assert.ok(S.moveCard(x, x.cards[0], 'bottom')); assert.strictEqual(order(), 'dcba');
  assert.ok(S.moveCardToColumn(x.cards[0], cols[0])); assert.strictEqual(cols[0].cards[0].lineId, 'd');
});
test('strongest lines first: pinned, then strong, then the rest, each keeping its order', () => {
  const st = fresh();
  const L = linesOf(st);
  const strong = L.filter(S.isStrong), weak = L.filter(l => !S.isStrong(l));
  assert.ok(strong.length >= 3 && weak.length >= 3, `${strong.length} strong / ${weak.length} weak`);
  const ids = [weak[0].id, strong[0].id, weak[1].id, strong[1].id, weak[2].id];
  assert.deepStrictEqual(S.strongestFirst(ids), [strong[0].id, strong[1].id, weak[0].id, weak[1].id, weak[2].id]);
  assert.deepStrictEqual(S.strongestFirst(ids, new Set([weak[1].id])), [weak[1].id, strong[0].id, strong[1].id, weak[0].id, weak[2].id]);
});
test('build plan: theme colours, highlight overrides, handles, skipped clips, names', () => {
  const st = fresh();
  const L = linesOf(st);
  const strong = L.filter(S.isStrong), weak = L.filter(l => !S.isStrong(l));
  const groups = [{ name: 'Family', label: 7, lineIds: [weak[0].id, strong[0].id] }, { name: 'Faith', label: 5, lineIds: [weak[1].id, 'missing'] }];
  const itemFor = id => (id === weak[1].id ? null : 'item');
  const p1 = S.planBuild(groups, { handles: 0.3, colour: true, strong: { highlight: false }, itemFor, durOf: () => 1000 });
  assert.deepStrictEqual(p1.clips.map(c => c.label), [7, 7]);
  assert.strictEqual(p1.skipped, 1, 'a line whose clip is not in the project is skipped');
  assert.ok(Math.abs(p1.clips[0].in - Math.max(0, weak[0].start - 0.3)) < 1e-9 && Math.abs(p1.clips[0].out - (weak[0].end + 0.3)) < 1e-9);
  const p2 = S.planBuild(groups, { colour: true, strong: { highlight: true, label: 15, first: true }, itemFor: () => 'item' });
  assert.deepStrictEqual(p2.clips.map(c => [c.lineId, c.label]), [[strong[0].id, 15], [weak[0].id, 7], [weak[1].id, 5]]);
  assert.ok(p2.clips[0].name.startsWith('★ Family 01'), p2.clips[0].name);
  const p3 = S.planBuild(groups, { colour: false, strong: { highlight: false }, itemFor: () => 'item', durOf: () => weak[0].end });
  assert.ok(p3.clips.every(c => c.label === null), 'colour off: no labels');
  assert.strictEqual(p3.clips[0].out, weak[0].end, 'out point never past the end of the clip');
});
test('theme sections span exactly each theme’s placed clips', () => {
  const groups = [{ name: 'A', label: 1, lineIds: [] }, { name: '', label: 2, lineIds: [] }, { name: 'C', label: 3, lineIds: [] }, { name: 'D', label: 4, lineIds: [] }];
  const clips = [{ group: 0, placed: { start: 0, end: 4 } }, { group: 0, placed: { start: 4, end: 9 } }, { group: 1, placed: { start: 9, end: 12 } }, { group: 2, placed: null }, { group: 2, placed: { start: 12, end: 15 } }, { group: 3, placed: null }];
  assert.deepStrictEqual(S.sectionsFrom(groups, clips), [{ name: 'A', label: 1, start: 0, end: 9 }, { name: 'C', label: 3, start: 12, end: 15 }]);
});
test('look options: defaults, and the old “markers off” setting still means off', () => {
  const L = S.lookOptions();
  assert.strictEqual(L.colour, true); assert.strictEqual(L.method, 'relabel'); assert.strictEqual(L.themeNames, 'marker'); assert.strictEqual(L.strong.label, 15);
  US.settings.set('story.markers', false);
  assert.strictEqual(S.lookOptions().themeNames, 'none');
  US.settings.set('story.themeNames', 'both');
  assert.strictEqual(S.lookOptions().themeNames, 'both');
  US.settings.set('story.themeNames', ''); US.settings.set('story.markers', true);
});
test('your own theme (no AI): finds the lines, best first, in its own colour; remembered for the next Find themes', async () => {
  const st = fresh({ themes: [{ id: 'x', name: 'Family', lineIds: [], label: 1 }] });
  const m = S.themeMatches('gratitude', linesOf(st));
  assert.ok(m.length >= 2, 'matches: ' + m.length);
  assert.ok(m.some(x => /grateful/i.test(x.line.text)) && m.some(x => /gratitude/i.test(x.line.text)));
  const th = await S.addCustomTheme(null, 'gratitude');
  assert.strictEqual(th.name, 'Gratitude'); assert.ok(th.custom); assert.strictEqual(th.by, 'you');
  assert.deepStrictEqual(th.lineIds, m.map(x => x.line.id));
  assert.notStrictEqual(th.label, 1); assert.notStrictEqual(th.label, 15);
  assert.ok(!st.wall.columns.some(c => c.themeId === th.id), 'no board column while the board is off');
  assert.deepStrictEqual(S.ownThemeNames(), ['gratitude']);
  // edit which lines are in it
  const extra = linesOf(st).find(l => !th.lineIds.includes(l.id));
  assert.strictEqual(S.addLinesToTheme(th, [extra.id, extra.id, 'nope']), 1);
  S.removeLineFromTheme(th, th.lineIds[0]);
  assert.ok(!th.lineIds.includes(m[0].line.id));
  // a theme nothing matches is still made (fill it from Search)
  const empty = await S.addCustomTheme(null, 'xylophones');
  assert.strictEqual(empty.lineIds.length, 0);
});
test('your own theme with AI: expand, then pick from candidates – text only, strict schemas, safe fallback', async () => {
  const st = fresh();
  const L = linesOf(st);
  const calls = [];
  const saved = US.ai;
  const target = L.find(l => /food bank/.test(l.text)), other = L.find(l => /candles/.test(l.text));
  US.ai = { available: () => true, label: () => 'Gemini', json: async req => {
    calls.push(req);
    if (calls.length === 1) return { phrases: ['food bank', 'candles', 'helping'] };
    return { lineIds: [target.id, 'invented', other.id, target.id] };
  } };
  try {
    const r = await S.themeMatchesAI('giving back', L, {});
    assert.deepStrictEqual(r.map(x => x.line.id), [target.id, other.id], 'AI order, unknown and repeated ids dropped');
    assert.strictEqual(calls.length, 2);
    for (const c of calls) { assert.strictEqual(c.schema.additionalProperties, false); assert.ok(c.schema.required.length); }
    const sent = calls[1].user.map(b => (typeof b === 'string' ? b : b.text)).join('\n');
    assert.ok(!/\/media\/|\.srt|\.csv|item\d/.test(sent), 'no file names, paths or ids of clips sent');
    assert.ok(calls[1].user[0].cache && calls[1].user[0].text.includes(target.id) && calls[1].user[0].text.includes('food bank'), 'the listing comes first, cached');
    assert.ok(/^Theme: giving back/.test(calls[1].user[1]), 'the task comes after it');
    assert.ok(calls.every(c => c.feature === 'Your own theme'));
    // the AI picks nothing → fall back to the offline matches
    calls.length = 0;
    US.ai.json = async req => { calls.push(req); return calls.length === 1 ? { phrases: [] } : { lineIds: [] }; };
    const fb = await S.themeMatchesAI('gratitude', L, {});
    assert.deepStrictEqual(fb.map(x => x.line.id), S.themeMatches('gratitude', L).map(x => x.line.id));
  } finally { US.ai = saved; }
});
test('the Assistant can add a theme; “find themes” still means find themes', () => {
  const m = (id, t) => US.actions.get(id).match(t);
  assert.deepStrictEqual(m('story.addTheme', 'add a theme called gratitude'), { theme: 'gratitude', useAI: false, _score: 2.5 });
  assert.strictEqual(m('story.addTheme', 'make a theme about first day in Israel').theme, 'first day in Israel');
  assert.strictEqual(m('story.addTheme', 'find the themes'), null);
  assert.strictEqual(m('story.addTheme', 'make a stringout of the family theme'), null);
  assert.strictEqual(m('story.themes', 'add a theme called gratitude'), null);
  assert.ok(m('story.themes', 'find the themes'));
});

test('interview summaries: kept when a transcript is read again; a refusal skips one interview, a key problem stops the rest', async () => {
  load(['ai']);
  const segs = T.parseFile(path.join(TR, 'I001_interview.srt')).segments;
  const st = S._useState({ transcripts: [] });
  const t = S.addTranscript({ name: 'I001.mp4', path: '/media/I001.mp4', itemId: 'item0', source: 'premiere', segments: segs });
  t.summary = { text: 'Ruth on Stamford Hill', sig: S.summarySig(t), by: 'Gemini' };
  const again = S.addTranscript({ name: 'I001.mp4', path: '/media/I001.mp4', itemId: 'item0', source: 'premiere', segments: segs });
  assert.strictEqual(st.transcripts.length, 1);
  assert.strictEqual(again.summary && again.summary.text, 'Ruth on Stamford Hill', 'reading the same transcript again keeps its summary');
  assert.strictEqual(S.summaryPlan().todo.length, 0, 'and it still fits, so nothing is asked again');
  st.speakers[again.lines[0].speaker] = { name: 'Ruth', color: 0 };
  assert.strictEqual(S.summaryPlan().todo.length, 1, 'naming the speaker makes it out of date');

  const many = S._useState({ transcripts: Array.from({ length: 8 }, (_, i) => ({ key: 'k' + i, name: 'Interview ' + i, path: '', itemId: '', source: 'file', lines: T.toLines(segs, 'z' + i) })) });
  const realAsk = US.storyAI.ask; let asked = 0;
  try {
    US.storyAI.ask = async req => { asked++; if (/Interview 1”/.test(req.user)) throw new US.UserError('AI_REFUSED'); return { summary: 'ok' }; };
    assert.deepStrictEqual(await S.summarise(null, many.transcripts), { made: 7, failed: 1 });
    assert.strictEqual(many.transcripts.filter(x => x.summary).length, 7);
    for (const x of many.transcripts) delete x.summary; asked = 0;
    US.storyAI.ask = async () => { asked++; await new Promise(r => setTimeout(r, 5)); throw new US.UserError('AI_KEY'); };
    await assert.rejects(S.summarise(null, many.transcripts), e => e.code === 'AI_KEY');
    await new Promise(r => setTimeout(r, 30));
    assert.strictEqual(asked, 3, 'the three already asking finish; nothing more is sent');
  } finally { US.storyAI.ask = realAsk; }
});

test('How picky leaves out an unnamed interviewer’s questions unless “Include interviewer questions” is on', () => {
  fresh();
  const q = { id: 'q1', start: 0, end: 6, speaker: '', text: 'What would you say makes the program special for the students?' };
  const a = { id: 'a1', start: 6, end: 14, speaker: '', text: 'It brings people from all over the world together, and that changes them.' };
  const o = S.pickyFor(null);
  assert.strictEqual(S.passLevel(q, 1, Object.assign({}, o, { interviewer: false })), -Infinity);
  assert.ok(S.passLevel(q, 1, Object.assign({}, o, { interviewer: true })) > -Infinity);
  assert.ok(S.passLevel(a, 1, o) > -Infinity, 'the answer stays');
});

test('How picky: a speaker renamed “Interviewer” in Story is left out; a job title in a name isn’t', () => {
  fresh({ speakers: { 'Speaker 2': { name: 'Interviewer' } } });
  const o = S.pickyFor(null);
  const q = { id: 'q2', start: 0, end: 8, speaker: 'Speaker 2', text: 'So tell me a bit about the early days of the school here.' };
  const d = { id: 'd2', start: 8, end: 16, speaker: 'Jane Smith, Museum Director', text: 'It was my second home, and I loved every single day of it.' };
  assert.strictEqual(S.passLevel(q, 1, o), -Infinity);
  assert.ok(S.passLevel(d, 1, o) > -Infinity);
});

test('what to work on: some interviews, or the lines heard in a sequence – optionally only between In and Out', async () => {
  const st = fresh();
  const t0 = st.transcripts[0], t1 = st.transcripts[1];
  // some interviews
  await S.setScope(null, { kind: 'interviews', keys: [t1.key] });
  assert.ok(S.scopeLines().length === t1.lines.length && /1 of 3 interviews/.test(S.scopeLabel()));
  assert.ok(T.search('family', S.scopeLines()).every(r => t1.lines.includes(r.line)));
  // a sequence: interview 0 from 0 to 40 s on A1; In/Out 10–25 s
  const end = t0.lines[t0.lines.length - 1].end;
  let info = { id: 's1', name: 'Selects v2', fps: 25, frame: 0.04, duration: end, video: [{ index: 0, name: 'V1', clips: [] }], audio: [{ index: 0, name: 'A1', clips: [{ name: 'I001', start: 0, end, in: 0, out: end, speed: 1, path: '/media/I001_interview.srt', itemId: 'item0' }] }], markers: [], inPoint: 10, outPoint: 25 };
  const was = US.host.call;
  US.host.call = async fn => (fn === 'sequenceInfo' ? info : fn === 'storySequenceTiming' ? { zero: 0, fps: 25 } : {});
  try {
    await S.setScope(null, { kind: 'sequence', seqId: 's1', inOut: true });
    const want = t0.lines.filter(l => l.end > 10 && l.start < 25).map(l => l.id);
    assert.deepStrictEqual(S.scopeLines().map(l => l.id), want);
    assert.ok(want.length > 0 && want.length < t0.lines.length);
    assert.strictEqual(S.scopeLabel(), 'Lines in “Selects v2” between In and Out');
    // without In/Out: the whole sequence
    await S.setScope(null, { kind: 'sequence', seqId: 's1', inOut: false });
    assert.strictEqual(S.scopeLines().length, t0.lines.length);
    // themes and Find more read only these lines
    await S.setScope(null, { kind: 'sequence', seqId: 's1', inOut: true });
    await S.findAllThemes(US.jobs.testJob(), { useAI: false });
    const ids = new Set(want);
    assert.ok(st.themes.length && st.themes.every(t => t.lineIds.every(id => ids.has(id))), 'themes only from the In–Out lines');
    const more = await S.findMore(null, 'family', {});
    assert.ok(more.every(r => ids.has(r.line.id)));
    // the cut changes: read again each time (In/Out moved)
    info = Object.assign({}, info, { inPoint: 0, outPoint: 9 });
    await S.findMore(null, 'family', {});
    assert.deepStrictEqual(S.scopeLines().map(l => l.id), t0.lines.filter(l => l.end > 0 && l.start < 9).map(l => l.id));
    // In/Out asked for but none set (Premiere reports the whole sequence)
    info = Object.assign({}, info, { inPoint: 0, outPoint: end });
    await assert.rejects(S.setScope(null, { kind: 'sequence', seqId: 's1', inOut: true }), e => /has no In and Out points/.test(e.title));
    assert.strictEqual(S.inOutOf({ inPoint: 0, outPoint: 30, duration: 30, frame: 0.04 }), null);
    assert.deepStrictEqual(S.inOutOf({ inPoint: 2, outPoint: 30, duration: 30, frame: 0.04 }), [2, 30]);
  } finally { US.host.call = was; }
  await S.setScope(null, { kind: 'all' });
  assert.strictEqual(S.scopeLines().length, linesOf(st).length);
});

test('Find themes without AI: your themes by their words, the rest grouped; a found theme with your name joins yours', async () => {
  const st = fresh();
  await S.findAllThemes(US.jobs.testJob(), { useAI: false, own: S.splitThemes('Gratitude, family, gratitude') });
  const names = st.themes.map(t => t.name);
  assert.deepStrictEqual(names.slice(0, 2), ['Gratitude', 'Family']);
  assert.strictEqual(names.filter(n => /^family$/i.test(n)).length, 1, 'one Family theme');
  assert.ok(st.themes[0].custom && st.themes[0].lineIds.length && st.themes[1].custom);
  assert.deepStrictEqual(S.ownThemeNames(), ['Gratitude', 'family']);
  const yours = new Set(st.themes.slice(0, 2).flatMap(t => t.lineIds));
  assert.ok(st.themes.slice(2).filter(t => t.name !== 'Other').every(t => t.lineIds.every(id => !yours.has(id))), 'each line in one theme');
  // the build groups follow the Themes list, without Other and without themes switched off
  st.buildOff = [st.themes[0].id];
  assert.ok(!S.themeGroups().some(g => g.name === 'Gratitude' || g.name === 'Other') && S.themeGroups()[0].name === 'Family');
});

test('review fixes: a failed scope keeps the old one; old picked themes; repeats and Hebrew names; found themes keep your changes', async () => {
  const st = fresh();
  await S.setScope(null, { kind: 'interviews', keys: [st.transcripts[1].key] });
  const was = US.host.call;
  US.host.call = async fn => (fn === 'sequenceInfo' ? { id: 's', name: 'Empty', frame: 0.04, duration: 10, video: [], audio: [], markers: [] } : {});
  try { await assert.rejects(S.setScope(null, { kind: 'sequence', seqId: 's' })); } finally { US.host.call = was; }
  assert.ok(S.scopeOf().kind === 'interviews' && S.scopeLines().length === st.transcripts[1].lines.length, 'the old choice stays');
  await S.setScope(null, { kind: 'all' });
  // a theme made from picked lines before 1.2 (no “picked” mark) isn't one to look for
  const L = linesOf(st);
  st.themes = [{ id: 'old', name: 'Family', custom: true, query: 'Family', lineIds: [L[0].id, L[1].id], manual: [L[0].id, L[1].id] }, { id: 'g', name: 'Gratitude', custom: true, query: 'gratitude', lineIds: [] }];
  delete st.ownThemes;
  assert.deepStrictEqual(S.ownThemeNames(), ['gratitude']);
  // repeats by the same words, Hebrew names kept apart
  assert.deepStrictEqual(S.splitThemes('Family, the family, תודה, משפחה'), ['Family', 'תודה', 'משפחה']);
  await S.findAllThemes(US.jobs.testJob(), { useAI: false, own: ['תודה', 'משפחה', 'family'] });
  const ids = st.themes.map(t => t.id);
  assert.strictEqual(new Set(ids).size, ids.length, 'no theme twice');
  assert.ok(st.themes.some(t => t.name === 'תודה') && st.themes.some(t => t.name === 'משפחה'));
  // a found theme: renamed, recoloured and given a line by hand – all kept when Find themes runs again
  const f = st.themes.find(t => !t.custom && t.name !== 'Other');
  const extra = L.find(l => !f.lineIds.includes(l.id));
  S.addLinesToTheme(f, [extra.id], { manual: true }); f.name = 'My name for it'; S.setColour(f, 12);
  const id = f.id;
  await S.findAllThemes(US.jobs.testJob(), { useAI: false, own: ['תודה', 'משפחה', 'family'] });
  const again = st.themes.find(t => t.id === id);
  assert.ok(again && again !== f && again.name === 'My name for it' && again.label === 12 && again.lineIds.includes(extra.id), JSON.stringify(again && { name: again.name, label: again.label }));
});

test('review fixes: a Moments run on part of the material keeps the moments found in the rest', async () => {
  const st = fresh();
  st.transcripts[0].lines.push({ id: 'zz1', start: 300, end: 303, speaker: 'Ruth', text: 'Sorry, can I start that again?' });
  st.transcripts[2].lines.push({ id: 'zz2', start: 300, end: 303, speaker: '', text: 'Is it recording? Okay, good.' });
  S.reindex();
  await S.findMoments(null, {});
  const all = st.moments.list.map(m => m.lineId);
  assert.ok(all.includes('zz1') && all.includes('zz2'));
  await S.setScope(null, { kind: 'interviews', keys: [st.transcripts[0].key] });
  await S.findMoments(null, {});
  assert.ok(st.moments.list.some(m => m.lineId === 'zz2'), 'moments in the other interviews stay for the log');
  await S.setScope(null, { kind: 'all' });
});

test('a theme of yours added twice becomes one when Find themes runs, keeping the lines you added by hand', async () => {
  const st = fresh();
  const L = linesOf(st);
  st.themes = [{ id: 'g1', name: 'Gratitude', custom: true, query: 'gratitude', lineIds: [], by: 'you' }, { id: 'g2', name: 'Gratitude', custom: true, query: 'Gratitude', lineIds: [L[5].id], manual: [L[5].id], by: 'ai' }];
  st.ownThemes = ['gratitude'];
  await S.findAllThemes(US.jobs.testJob(), { useAI: false });
  const g = st.themes.filter(t => /^gratitude$/i.test(t.name));
  assert.strictEqual(g.length, 1, g.map(t => t.id).join(','));
  assert.ok(g[0].lineIds.includes(L[5].id) && g[0].manual.includes(L[5].id));
});
