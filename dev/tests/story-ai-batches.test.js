// Story › How much the AI reads (slider stops, remembered per project), splitting big jobs into batches, merging
// themes found per batch, merging picks by score, one approval for the whole job, Stop, a failing batch, and the cost sums.
const assert = require('assert');
const { load, test } = require('./harness');
global.addEventListener = global.addEventListener || (() => {});
global.ResizeObserver = global.ResizeObserver || function () { return { observe() {} }; };
const US = load(['time', 'transcript', 'ui', 'app', 'js/tools/22-story-ai.js', 'js/tools/22-story-board.js', 'js/tools/22-story-export.js', 'js/tools/22-story-timeline.js', 'js/tools/22-story-narrative.js', 'js/tools/22-story-moments.js', 'js/tools/22-story.js']);
const S = US.story, A = US.storyAI, T = US.transcript;

const TOPICS = ['family dinners on Friday night', 'volunteering at the food bank', 'my first day at work', 'learning Torah with friends', 'the trip to Jerusalem'];
/** n lines over 20 interviews, ~110 characters each. */
function project(n) {
  const per = Math.ceil(n / 20), transcripts = [];
  for (let t = 0; t < 20; t++) {
    const lines = [];
    for (let i = 0; i < per && t * per + i < n; i++) lines.push({ id: `t${t}-${i}`, start: i * 8, end: i * 8 + 6, speaker: 'Speaker 1', text: `I remember ${TOPICS[(t + i) % 5]}, and honestly it changed how I think about everything number ${i}.` });
    transcripts.push({ key: 'k' + t, name: `Interview ${t + 1}`, path: '/m/' + t, lines });
  }
  return S._useState({ transcripts });
}
const lines = () => S.state().transcripts.flatMap(t => t.lines);
function stubAI({ fail = () => false, estimate = 0.05, onCall = () => {} } = {}) {
  const calls = [], approvals = [];
  const ids = req => Array.from((Array.isArray(req.user) ? req.user[0].text : String(req.user)).matchAll(/^(\S+)\t/gm)).map(m => m[1]);
  return { calls, approvals, ai: {
    available: () => true, label: () => 'Claude Opus 5.5', fmtUSD: x => `$${x.toFixed(2)}`,
    estimateFor: () => ({ usd: estimate, name: 'Claude Opus 5.5', inputTokens: 1000, outputTokens: 1000 }),
    approveTotal: async (usd, what) => { approvals.push({ usd, what }); },
    json: async req => {
      calls.push(req); onCall(req, calls.length);
      if (fail(req, calls.length)) throw new US.UserError('AI_FAILED', { title: 'boom' });
      const p = req.schema.properties, got = ids(req);
      if (req.schema === A.MERGE_SCHEMA) {
        const parts = got; // part-theme ids p1.1 … : merge by the topic word in the name
        const by = {}; for (const id of parts) { const nm = /Theme (\w+)/.exec(req.user[0].text.split('\n').find(r => r.startsWith(id + '\t')))[1]; (by[nm] = by[nm] || []).push(id); }
        return { themes: Object.keys(by).sort().map(k => ({ name: `${k} theme`, summary: 's', from: by[k] })) };
      }
      if (p.themes) { const words = ['family', 'volunteering', 'work']; return { themes: words.map((w, i) => ({ name: `Theme ${w}`, summary: 'x', lineIds: got.filter((_, j) => j % 5 === i).slice(0, 30) })) }; }
      if (p.phrases) return { phrases: ['dinner'] };
      if (p.picks) return { picks: got.slice(0, 10).map((id, i) => ({ lineId: id, reason: 'fits', score: req.user[1].includes('part 2 of') ? 0.95 - i * 0.01 : 0.5 - i * 0.01 })) };
      if (p.beats) return { title: 'T', logline: '', beats: got.slice(0, 5).map(id => ({ lineId: id, purpose: 'p', dropStartWords: 0, dropEndWords: 0 })) };
      return {};
    }
  } };
}
const job = (over = {}) => Object.assign({ set() {}, progress() {}, check() {}, log() {} }, over);
async function withAI(stub, fn) { const was = US.ai; US.ai = stub.ai; try { return await fn(); } finally { US.ai = was; } }

test('slider stops per feature, today’s defaults, stored per project (Everything = "all")', () => {
  assert.deepStrictEqual(A.stopsFor('themes'), [600, 1200, 2500, 5000, Infinity]);
  assert.deepStrictEqual(A.stopsFor('findMore'), [200, 600, 1200, 2500, Infinity]);
  assert.deepStrictEqual(A.stopsFor('narrative'), [120, 600, 1200, 2500, Infinity]);
  project(100);
  assert.deepStrictEqual(['themes', 'ownTheme', 'findMore', 'narrative'].map(f => S.readsFor(f)), [1200, 200, 200, 120]);
  S.setReads('themes', Infinity); S.setReads('findMore', 600);
  assert.deepStrictEqual(S.state().aiReads, { themes: 'all', findMore: 600 });
  assert.strictEqual(S.readsFor('themes'), Infinity); assert.strictEqual(S.readsFor('findMore'), 600);
  assert.strictEqual(A.fromStored(777, 'themes'), 1200, 'an unknown value falls back to the default');
  assert.strictEqual(A.stopLabel(Infinity, 7237), 'Everything (7,237 lines)'); assert.strictEqual(A.stopLabel(1200), 'Best 1,200');
});

test('batches: even, in order, every line once, under the line and character limits', () => {
  const items = Array.from({ length: 4000 }, (_, i) => 'x'.repeat(50 + (i % 7) * 20));
  const b = A.split(items, x => x);
  assert.strictEqual(b.length, 3); assert.deepStrictEqual(b.map(x => x.length), [1334, 1334, 1332]);
  assert.deepStrictEqual(b.flat(), items);
  const long = A.split(Array.from({ length: 1000 }, () => 'y'.repeat(399)), x => x);
  assert.ok(long.length === 2 && long.every(x => x.reduce((n, s) => n + s.length + 1, 0) <= A.BATCH.chars), 'split by characters too');
  assert.deepStrictEqual(A.split([], x => x), []);
});

test('Find themes on Everything: per-batch themes, one merge (names and sizes only), union of lines, stable ids, one approval', async () => {
  project(4000);
  const st = stubAI(), progress = [];
  const run = () => withAI(st, () => A.findThemes(lines(), { limit: Infinity, max: 6, job: job({ progress: p => progress.push(p) }), nameOf: l => l.id.split('-')[0] }));
  const themes = await run();
  const maps = st.calls.filter(c => c.schema === T.AI_THEME_SCHEMA), merges = st.calls.filter(c => c.schema === A.MERGE_SCHEMA);
  assert.strictEqual(maps.length, 3); assert.strictEqual(merges.length, 1);
  assert.ok(maps.every(c => c.user[0].cache === true && c.feature === 'Find themes'));
  assert.ok(!/I remember/.test(merges[0].user[0].text), 'the merge sends no line text');
  assert.ok(/p1\.1\tTheme family\t30\t/.test(merges[0].user[0].text), 'part-theme ids, names and sizes');
  assert.deepStrictEqual(themes.map(t => t.name), ['family theme', 'volunteering theme', 'work theme']);
  assert.ok(themes.every(t => t.lineIds.length === 90 && t.from.length === 3), 'each final theme is the union of its three part-themes');
  const all = themes.flatMap(t => t.lineIds); assert.strictEqual(new Set(all).size, all.length, 'every line once');
  const partOf = id => Math.floor(lines().findIndex(l => l.id === id) / 1334);
  assert.deepStrictEqual(themes[0].lineIds.slice(0, 3).map(partOf), [0, 1, 2], 'the best of each part first, fairly interleaved');
  assert.strictEqual(st.approvals.length, 1); assert.ok(Math.abs(st.approvals[0].usd - 0.05 * 4) < 1e-9, 'one approval: three parts + the merge');
  assert.ok(progress.length >= 4 && progress.every((p, i) => !i || p >= progress[i - 1]), 'progress per part');
  assert.strictEqual(themes.requests, 4);
  const again = await run();
  assert.deepStrictEqual(again.map(t => t.id), themes.map(t => t.id), 'the same ids every time');
});

test('Find themes: a failing part is tried again, then skipped and named; a failed merge falls back to names; Stop stops', async () => {
  project(4000);
  // part 2 fails twice: carried on without it
  let st = stubAI({ fail: (req, n) => req.schema === T.AI_THEME_SCHEMA && /\bt8-0\b/.test(req.user[0].text) });
  let themes = await withAI(st, () => A.findThemes(lines(), { limit: Infinity, max: 6, job: job(), nameOf: l => `Interview ${+l.id.slice(1).split('-')[0] + 1}` }));
  assert.strictEqual(st.calls.filter(c => c.schema === T.AI_THEME_SCHEMA).length, 4, 'three parts, one tried twice');
  assert.strictEqual(themes.missing.length, 1); assert.strictEqual(themes.missing[0].part, 2);
  assert.ok(/Part 2 of 3 \(Interview 7 … Interview 14\) couldn’t be read/.test(A.missingNote(themes.missing)), A.missingNote(themes.missing));
  assert.ok(themes.every(t => t.lineIds.length === 60));
  // a flaky part that works the second time
  let first = true;
  st = stubAI({ fail: req => req.schema === T.AI_THEME_SCHEMA && /\bt8-0\b/.test(req.user[0].text) && first && !(first = false) });
  themes = await withAI(st, () => A.findThemes(lines(), { limit: Infinity, max: 6, job: job() }));
  assert.strictEqual(themes.missing.length, 0);
  // the merge fails: themes with the same name are combined instead
  st = stubAI({ fail: req => req.schema === A.MERGE_SCHEMA });
  themes = await withAI(st, () => A.findThemes(lines(), { limit: Infinity, max: 6, job: job() }));
  assert.strictEqual(themes.mergedBy, 'name'); assert.deepStrictEqual(themes.map(t => t.name).sort(), ['Theme family', 'Theme volunteering', 'Theme work']);
  // every part fails: an error, not an empty result
  st = stubAI({ fail: () => true });
  await assert.rejects(withAI(st, () => A.findThemes(lines(), { limit: Infinity, max: 6, job: job() })), e => e.code === 'AI_FAILED');
  // Stop after the first part
  st = stubAI(); let checks = 0;
  await assert.rejects(withAI(st, () => A.findThemes(lines(), { limit: Infinity, max: 6, job: job({ check() { if (++checks > 1) throw new US.UserError('CANCELLED'); } }) })), e => e.code === 'CANCELLED');
  assert.strictEqual(st.calls.length, 1, 'nothing more sent after Stop');
  // Best 1,200: one request, no merge, same as before
  st = stubAI();
  themes = await withAI(st, () => A.findThemes(lines(), { limit: 1200, max: 6, job: job() }));
  assert.strictEqual(st.calls.length, 1); assert.strictEqual(themes.requests, 1);
});

test('Find more / your own theme on Everything: batches, picks merged by score across batches, one approval', async () => {
  project(4000);
  const st = stubAI();
  const r = await withAI(st, () => S.findMore(job(), 'family dinners', { useAI: true, exclude: new Set(), reads: Infinity }));
  const picks = st.calls.filter(c => c.schema === A.PICK_SCHEMA);
  assert.strictEqual(picks.length, 3); assert.ok(picks.every((c, k) => c.user[1].includes(`part ${k + 1} of 3`)));
  assert.strictEqual(r.length, 30); assert.ok(r.slice(0, 10).every(x => x.rel > 0.8), 'the best-scored picks first, whatever part they came from');
  assert.strictEqual(st.approvals.length, 1);
  const st2 = stubAI();
  const own = await withAI(st2, () => S.themeMatchesAI('gratitude', lines(), { reads: 600, job: job() }));
  assert.strictEqual(st2.calls.filter(c => c.schema === A.PICK_SCHEMA).length, 1, 'Best 600: one request');
  assert.ok(own.length && st2.approvals.length === 0, 'one request needs no extra approval');
  // the candidates: matching lines first, then the strongest others
  const c = S.rankCandidates(['food bank'], lines(), 1000);
  assert.strictEqual(c.length, 1000); assert.ok(c.slice(0, 800).every(x => /food bank/.test(x.line.text)), 'matching lines first');
  const everything = S.rankCandidates(['food bank'], lines(), Infinity);
  assert.ok(everything.length === 4000 && everything[3999].score === 0, 'then every other line, strongest first');
});

test('Narrative on Everything: shortlisted in batches by topic, then one story from the shortlist', async () => {
  project(4000);
  S.state().themes = [S.newThemeFrom('Family', lines().slice(0, 20).map(l => l.id))].filter(Boolean);
  S.setReads('narrative', Infinity);
  const st = stubAI();
  const r = await withAI(st, () => S.makeNarrative(job(), { brief: 'a 60 second video about family dinners', useAI: true }));
  const shortlist = st.calls.filter(c => c.schema === A.PICK_SCHEMA), story = st.calls.filter(c => c.schema === US.storyNarrative.AI_SCHEMA);
  assert.ok(shortlist.length >= 3 && story.length === 1, `${shortlist.length} shortlist requests, ${story.length} story request`);
  assert.ok(shortlist.every(c => c.feature === 'Narrative cut'));
  assert.ok((story[0].user[0].text.match(/\n/g) || []).length <= 120, 'the story request reads only the shortlist');
  assert.strictEqual(st.approvals.length, 1);
  assert.ok(r.narrative.beats.length);
  S.setReads('narrative', 120);
});

test('cost sums: every request counted, time added up, Gemini free; the line under the slider', async () => {
  project(4000);
  const st = stubAI({ estimate: 0.3 });
  await withAI(st, () => {
    const p = S.readsPlan('themes', Infinity);
    assert.deepStrictEqual([p.requests, p.lines, p.all], [4, 4000, true]); assert.ok(Math.abs(p.usd - 1.2) < 1e-9 && p.secs > 60);
    assert.strictEqual(A.describe(p, { lines: p.lines, all: true }), `All 4,000 lines · about $1.20 with Claude Opus 5.5 · 4 requests · ${A.fmtTime(p.secs)}`);
    assert.strictEqual(S.readsPlan('themes', 1200).requests, 1);
    assert.strictEqual(S.readsPlan('findMore', 200).requests, 2, '“ways to say it” + one pick');
    assert.strictEqual(S.readsPlan('findMore', Infinity).requests, 4);
    assert.strictEqual(S.readsPlan('narrative', 120).requests, 3, 'as today: ways to say it, Find more, the story');
    assert.strictEqual(S.readsPlan('narrative', Infinity).requests, 5, 'ways to say it, three shortlist parts, the story');
  });
  const gem = stubAI(); gem.ai.estimateFor = () => ({ usd: 0, free: true, name: 'Gemini' }); gem.ai.label = () => 'Gemini';
  await withAI(gem, () => { const p = S.readsPlan('themes', 2500); assert.ok(p.free && /no charge with Gemini/.test(A.describe(p, { lines: p.lines }))); });
  assert.ok(/~\d+ min/.test(A.fmtTime(200)) && A.fmtTime(20) === '~20 s');
});

test('your themes and the others in ONE pass: named in the task (after the cached listing), kept by name, never merged away', async () => {
  project(800);
  // the stand-in AI answers with the editor's themes (by the names asked for) and two of its own
  const st = stubAI(); const realJson = st.ai.json;
  st.ai.json = async req => {
    if (!req.schema.properties.themes || req.schema === A.MERGE_SCHEMA) return realJson(req);
    st.calls.push(req);
    const got = Array.from(req.user[0].text.matchAll(/^(\S+)\t/gm)).map(m => m[1]);
    return { themes: [{ name: 'gratitude', summary: 'thanks', lineIds: got.slice(0, 5) }, { name: 'The Trip to Jerusalem', summary: 'j', lineIds: got.slice(5, 9) }, { name: 'Family', summary: 'f', lineIds: got.slice(9, 20) }, { name: 'Work', summary: 'w', lineIds: got.slice(20, 30) }] };
  };
  const themes = await withAI(st, () => A.findThemes(lines(), { limit: 1200, max: 6, job: job(), own: ['Gratitude', 'trip to Jerusalem', 'Forgiveness'] }));
  assert.strictEqual(st.calls.filter(c => c.schema === A.ownThemeSchema()).length, 1, 'one read of the lines');
  const req = st.calls[0];
  assert.ok(/“Gratitude”, “trip to Jerusalem”, “Forgiveness”/.test(req.user[1]) && !/Gratitude/.test(req.user[0].text), 'the themes are in the task, not the cached listing');
  assert.deepStrictEqual(themes.filter(t => t.own).map(t => [t.name, t.lineIds.length]), [['Gratitude', 5], ['trip to Jerusalem', 4], ['Forgiveness', 0]]);
  assert.deepStrictEqual(themes.filter(t => !t.own).map(t => t.name), ['Family', 'Work']);
  // the cost line under the slider counts the same single request
  assert.strictEqual(A.themesRequests(lines(), { limit: 1200, own: ['Gratitude'] }).batches.length, 1);
  assert.ok(/Gratitude/.test(A.themesTask(10, ['Gratitude'])) && /between 3 and 10/.test(A.themesTask(10, [])));
});

test('Find themes in Story: your themes found in the same pass, the rest replaced; hand-added lines and colours stay', async () => {
  project(400);
  const st0 = S.state();
  const handLine = st0.transcripts[3].lines[2].id;
  st0.themes = [{ id: 'U1', name: 'Gratitude', custom: true, query: 'gratitude', lineIds: [handLine], manual: [handLine], label: 6, by: 'you' }, { id: 'old', name: 'Old found theme', lineIds: [], by: 'ai' }];
  st0.ownThemes = ['gratitude', 'Jerusalem'];
  const st = stubAI(); const realJson = st.ai.json;
  st.ai.json = async req => {
    if (!req.schema.properties.themes || req.schema === A.MERGE_SCHEMA) return realJson(req);
    st.calls.push(req);
    const got = Array.from(req.user[0].text.matchAll(/^(\S+)\t/gm)).map(m => m[1]);
    return { themes: [{ name: 'Gratitude', summary: 's', lineIds: got.slice(0, 6) }, { name: 'Volunteering', summary: 'v', lineIds: got.slice(6, 16) }] };
  };
  await withAI(st, () => S.findAllThemes(job(), { useAI: true }));
  const th = S.state().themes;
  const g = th.find(t => t.name === 'Gratitude');
  assert.ok(g && g.id === 'U1' && g.label === 6 && g.lineIds.includes(handLine) && g.lineIds.length === 7, 'same theme, colour and hand-added line');
  const j = th.find(t => t.query === 'Jerusalem');
  assert.ok(j && j.custom && j.by === 'you' && j.lineIds.length > 0, 'nothing from the AI: Story’s own search fills it');
  assert.ok(!th.some(t => t.name === 'Old found theme') && th.some(t => t.name === 'Volunteering' && !t.custom));
  assert.strictEqual(st.calls.filter(c => c.schema === A.ownThemeSchema()).length, 1);
  assert.strictEqual(st.calls.filter(c => c.schema !== A.ownThemeSchema()).length, 0, 'no separate own-theme requests');
});

test('review fixes: a theme the AI renamed counts as yours when it says so; a bigger theme that only contains your word doesn’t', () => {
  const own = ['Gratitude', 'home'];
  assert.deepStrictEqual(A.ownFor(own, [{ name: 'Thankfulness', yours: 'Gratitude' }, { name: 'Leaving home behind', yours: '' }, { name: 'Home', yours: '' }, { name: 'Family', yours: '' }]), ['Gratitude', null, 'home', null]);
  assert.strictEqual(A.ownMatcher(['home'])('Leaving home behind'), null);
  assert.strictEqual(A.ownMatcher(['first day'])('My first day'), 'first day');
  assert.ok(A.ownThemeSchema().properties.themes.items.required.includes('yours') && A.themesRequests(lines(), { limit: 600, own: ['x'] }).batches[0].req.schema === A.ownThemeSchema());
  assert.strictEqual(A.themesRequests(lines(), { limit: 600 }).batches[0].req.schema, T.AI_THEME_SCHEMA, 'without your themes: the same request as before');
});
