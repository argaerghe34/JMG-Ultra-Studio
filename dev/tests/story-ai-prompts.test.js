// Story's AI requests, for the cost guide: every call names its feature (for the spending ledger), puts the line listing
// first as a cached block with the task after it, and sends a byte-identical listing when asked again about the same
// lines – so a follow-up reads it from Claude's cache.
const assert = require('assert'), path = require('path');
const { load, test, MEDIA } = require('./harness');
global.addEventListener = global.addEventListener || (() => {});
global.ResizeObserver = global.ResizeObserver || function () { return { observe() {} }; };
const US = load(['time', 'transcript', 'ui', 'app', 'js/tools/22-story-board.js', 'js/tools/22-story-export.js', 'js/tools/22-story-timeline.js', 'js/tools/22-story-narrative.js', 'js/tools/22-story-moments.js', 'js/tools/22-story-ai.js', 'js/tools/22-story.js']);
const S = US.story, T = US.transcript;
const job = { set() {}, progress() {}, check() {}, log() {} };

function fresh() {
  const TR = path.join(MEDIA, 'transcripts');
  const transcripts = ['I001_interview.srt', 'Interview_David_Cohen.txt', 'Interview_Miriam_Levy.csv', 'C001_sharp_static.json'].map((f, i) => ({ key: f, name: f, path: '/media/' + f, itemId: 'item' + i, source: 'file', lines: T.toLines(T.parseFile(path.join(TR, f)).segments, 'p' + i) }));
  // a few moments
  transcripts[0].lines.push({ id: 'm1', start: 200, end: 203, speaker: '', text: 'Sorry, can I start again?' }, { id: 'm2', start: 204, end: 207, speaker: '', text: 'Is it recording? [laughs]' });
  const st = S._useState({ transcripts });
  st.themes = T.themesOffline(st.transcripts.flatMap(t => t.lines), { max: 6 }); S.ensureColours();
  return st;
}
/** A stand-in AI that answers each schema sensibly from the ids it was sent, and records every request. */
function stub(calls) {
  const ids = req => Array.from((Array.isArray(req.user) ? req.user[0].text : req.user).matchAll(/^(\S+)\t/gm)).map(m => m[1]);
  return { available: () => true, label: () => 'Claude', json: async req => {
    calls.push(req);
    const p = req.schema.properties, got = ids(req);
    if (p.themes) return { themes: [{ name: 'Family', summary: '', lineIds: got.slice(0, 3) }] };
    if (p.phrases) return { phrases: ['helping', 'neighbours'] };
    if (p.picks) return { picks: got.slice(0, 4).map(id => ({ lineId: id, reason: 'on topic' })) };
    if (p.lineIds) return { lineIds: got.slice(0, 4) };
    if (p.beats) return { title: 'T', logline: '', beats: got.slice(0, 4).map(id => ({ lineId: id, purpose: 'p', dropStartWords: 0, dropEndWords: 0 })) };
    if (p.moments) return { moments: got.map(id => ({ lineId: id, type: 'blooper', reason: 'r', score: 0.7 })) };
    throw new Error('unexpected schema');
  } };
}
const text = x => (Array.isArray(x) ? x.map(b => (typeof b === 'string' ? b : b.text)).join('\n') : String(x));

test('every Story AI call names its feature; listings go first as a cached block, the task after', async () => {
  const st = fresh(), calls = [], was = US.ai;
  US.ai = stub(calls);
  try {
    await T.themesAI(st.transcripts.flatMap(t => t.lines), { max: 6 });
    await S.addCustomTheme(job, 'gratitude', { useAI: true });
    await S.findMore(job, 'community', { useAI: true, exclude: S.selectedIds() });
    await S.makeNarrative(job, { brief: 'a 60 second video about family', useAI: true });
    await S.findMoments(job, { useAI: true });
  } finally { US.ai = was; }
  const features = Array.from(new Set(calls.map(c => c.feature)));
  assert.deepStrictEqual(features, ['Find themes', 'Your own theme', 'Find more', 'Narrative cut', 'Moments']);
  const withListing = calls.filter(c => Array.isArray(c.user));
  assert.deepStrictEqual(calls.filter(c => !Array.isArray(c.user)).map(c => Object.keys(c.schema.properties)[0]), ['phrases', 'phrases', 'phrases'], 'only the short “ways people say it” requests carry no listing');
  assert.deepStrictEqual(calls.filter(c => c.feature === 'Narrative cut').length, 3, 'the narrative’s own Find more counts as the narrative');
  for (const c of withListing) {
    assert.strictEqual(c.user.length, 2);
    // the narrative pool, often reused within a session, is cached for an hour; everything else for 5 minutes
    const session = /Brief:/.test(c.user[1]);
    assert.ok(c.user[0].cache === (session ? '1h' : true) && /\t/.test(c.user[0].text), `${c.feature}: listing first, cached ${session ? 'for an hour' : 'for 5 minutes'}`);
    assert.ok(!/Topic:|Theme:|Brief:|Length:|Group the|Classify/.test(c.user[0].text), `${c.feature}: no task text inside the cached listing`);
    assert.ok(typeof c.user[1] === 'string' && c.user[1].length < 400, `${c.feature}: a short task after it`);
  }
  for (const c of calls) assert.ok(!/\/media\/|item\d/.test(text(c.user) + text(c.system)), 'no paths or clip ids');
});

test('asking again about the same lines sends a byte-identical listing (themes, own theme, Find more, narrative of another length, moments)', async () => {
  const st = fresh(), was = US.ai;
  const run = async fn => { const calls = []; US.ai = stub(calls); try { await fn(); } finally { US.ai = was; } return calls.filter(c => Array.isArray(c.user)).map(c => c.user[0].text); };
  const lines = () => st.transcripts.flatMap(t => t.lines);
  const a1 = await run(() => T.themesAI(lines(), { max: 6 })), a2 = await run(() => T.themesAI(lines(), { max: 10 }));
  assert.deepStrictEqual(a1, a2, 'Find themes, even with another number of themes');
  const o1 = await run(() => S.themeMatchesAI('gratitude', lines(), {})), o2 = await run(() => S.themeMatchesAI('gratitude', lines(), {}));
  assert.deepStrictEqual(o1, o2, 'your own theme, looked up again');
  const f1 = await run(() => S.findMore(job, 'community', { useAI: true, exclude: new Set() })), f2 = await run(() => S.findMore(job, 'community', { useAI: true, exclude: new Set() }));
  assert.deepStrictEqual(f1, f2, 'Find more, same topic');
  US.settings.set('story.moreAI', false); // the narrative's own request only
  const n1 = await run(() => S.makeNarrative(job, { brief: 'a 60 second video about family', useAI: true })), n2 = await run(() => S.makeNarrative(job, { brief: 'three minutes about family, uplifting', useAI: true }));
  US.settings.set('story.moreAI', true);
  assert.strictEqual(n1.length, 1); assert.strictEqual(n1[0], n2[0], 'narrative: 60 s and 3 min on the same topic send the same listing');
  const m1 = await run(() => S.findMoments(job, { useAI: true })), m2 = await run(() => S.findMoments(job, { useAI: true }));
  assert.ok(m1.length >= 1); assert.deepStrictEqual(m1, m2, 'moments, found again');
  // rows are in project order, whatever order they were picked in
  const rows = a1[0].split('\n').slice(1).map(r => r.split('\t')[0]), order = new Map(lines().map((l, i) => [l.id, i]));
  assert.ok(rows.every((id, i) => !i || order.get(rows[i - 1]) < order.get(id)), 'project order');
});

test('Moments: How picky sets how many candidates the AI checks (all / 240 / 120), with a cost estimate approved once for the whole run', async () => {
  const M = US.storyMoments;
  assert.strictEqual(M.capFor(S.PICKY_LEVELS.all), Infinity); assert.strictEqual(M.capFor(S.PICKY_LEVELS.balanced), 240); assert.strictEqual(M.capFor(S.PICKY_LEVELS.best), 120);
  const st = fresh();
  // 300 restarts, so the caps bite
  st.transcripts.push({ key: 'x', name: 'x', path: '/media/x', lines: Array.from({ length: 300 }, (_, i) => ({ id: 'x' + i, start: i * 10, end: i * 10 + 4, speaker: 'Ann', text: `Sorry, can I start again? Number ${i}.` })) });
  S.reindex();
  const was = US.ai, calls = [], asked = [];
  const ai = stub(calls);
  ai.estimateFor = req => ({ usd: 0.07, name: 'Claude Opus 5.5', inputTokens: 1, outputTokens: 1 });
  ai.fmtUSD = x => `$${x.toFixed(2)}`;
  ai.approveTotal = async (usd, what) => asked.push({ usd, what }); // core: asks if over the threshold, checks the monthly cap
  US.ai = ai;
  try {
    const plan = s => S.momentsPlan({ opts: Object.assign(S.pickyFor(null), { s }) });
    const all = plan(S.PICKY_LEVELS.all), bal = plan(S.PICKY_LEVELS.balanced), best = plan(S.PICKY_LEVELS.best);
    assert.ok(all.found > 300 && all.every && all.checked === all.found, JSON.stringify(all));
    assert.deepStrictEqual([bal.checked, bal.calls, best.checked, best.calls], [240, 4, 120, 2]);
    assert.ok(Math.abs(bal.usd - 0.28) < 1e-9 && bal.name === 'Claude Opus 5.5', 'estimate: one per request');
    // Everything useful: every candidate is sent, after one approval for the whole run
    st.picky = { s: S.PICKY_LEVELS.all };
    const r = await S.findMoments(job, { useAI: true });
    assert.strictEqual(asked.length, 1); assert.ok(Math.abs(asked[0].usd - 0.07 * all.calls) < 1e-9 && /Checking \d+ moments \(\d+ requests\)/.test(asked[0].what), JSON.stringify(asked[0]));
    assert.strictEqual(calls.reduce((n, c) => n + (c.user[0].text.match(/\n/g) || []).length, 0), all.found, 'every candidate sent');
    assert.ok(/all checked by Claude Opus 5\.5/.test(r.summary), r.summary);
    // declined (or over the monthly cap): nothing sent
    calls.length = 0; ai.approveTotal = async () => { throw new US.UserError('CANCELLED'); };
    await assert.rejects(S.findMoments(job, { useAI: true }), e => e.code === 'CANCELLED');
    assert.strictEqual(calls.length, 0);
    // Only the best: the best 120; Gemini (free) skips the approval
    st.picky = { s: S.PICKY_LEVELS.best }; asked.length = 0; ai.approveTotal = async (usd, what) => asked.push({ usd, what });
    ai.estimateFor = () => ({ usd: 0, free: true, name: 'Gemini' });
    const r2 = await S.findMoments(job, { useAI: true });
    assert.strictEqual(asked.length, 0, 'nothing to approve with Gemini');
    assert.ok(/the best 120 of \d+ checked by Gemini/.test(r2.summary), r2.summary);
  } finally { US.ai = was; }
});
