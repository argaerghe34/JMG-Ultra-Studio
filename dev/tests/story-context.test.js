// Story › the shared transcript: every feature's request starts with the same system text, the same transcript block
// (cached for an hour) and the same answer format – the three things that must match for Claude to share its cache
// (measured 29 Oct 2026) – with the feature's task after it. Answers in the shared format are read back per feature.
const assert = require('assert'), path = require('path');
const { load, test, MEDIA } = require('./harness');
global.addEventListener = global.addEventListener || (() => {});
global.ResizeObserver = global.ResizeObserver || function () { return { observe() {} }; };
const US = load(['time', 'transcript', 'ui', 'app', 'js/tools/22-story-board.js', 'js/tools/22-story-export.js', 'js/tools/22-story-timeline.js', 'js/tools/22-story-narrative.js', 'js/tools/22-story-moments.js', 'js/tools/22-story-ai.js', 'js/tools/22-story-context.js', 'js/tools/22-story-questions.js', 'js/tools/22-story.js']);
const S = US.story, T = US.transcript, C = US.storyContext;
const job = { set() {}, progress() {}, check() {}, log() {} };

function fresh() {
  const TR = path.join(MEDIA, 'transcripts');
  const transcripts = ['I001_interview.srt', 'Interview_David_Cohen.txt', 'Interview_Miriam_Levy.csv'].map((f, i) => ({ key: f, name: 'Clip ' + f, path: '/media/' + f, itemId: 'item' + i, source: 'file', lines: T.toLines(T.parseFile(path.join(TR, f)).segments, 'p' + i) }));
  transcripts[0].lines.push({ id: 'm1', start: 200, end: 203, speaker: '', text: 'Sorry, can I start again?' }, { id: 'm2', start: 204, end: 207, speaker: '', text: 'Is it recording? [laughs]' });
  const st = S._useState({ transcripts });
  st.themes = T.themesOffline(st.transcripts.flatMap(t => t.lines), { max: 6 }); S.ensureColours();
  return st;
}
/** A stand-in Claude that answers the shared format from the ids it can see. */
function stub(calls) {
  const ids = req => (Array.isArray(req.user) ? Array.from(req.user[0].text.matchAll(/^(\S+)\t/gm)).map(m => m[1]) : []);
  return { available: () => true, provider: () => 'claude', label: () => 'Claude', estimateFor: () => ({ usd: 0.01 }), approveTotal: async () => {},
    json: async req => {
      calls.push(req);
      // the narrative's last step reads its own short pool (not the shared transcript)
      if (req.schema !== C.SCHEMA) return req.schema.properties.beats ? { title: 'T', logline: '', beats: ids(req).slice(0, 4).map(id => ({ lineId: id, purpose: 'p', dropStartWords: 0, dropEndWords: 0 })) } : { phrases: [] };
      const got = ids(req), one = id => ({ from: id, to: id, lead: '', note: 'fits', score: 0.8, tag: '' });
      if (/^Task: find the answers/.test(req.user[1])) return { answer: '', groups: [{ key: '1', name: 'Q', summary: '', items: [{ from: got[1], to: got[3], lead: got[0], note: 'answers it', score: 0.9, tag: '' }] }] };
      if (/^Find moments/.test(req.user[1])) { const cands = Array.from(req.user[1].matchAll(/^(\S+)\t/gm)).map(m => m[1]); return { answer: '', groups: [{ key: 'blooper', name: '', summary: '', items: cands.map(one) }] }; }
      if (/Group the interview lines|themes/i.test(req.user[1]) && /key = the editor's theme name/.test(req.user[1])) return { answer: '', groups: [{ key: 'gratitude', name: 'Gratitude', summary: 's', items: got.slice(0, 3).map(one) }, { key: '', name: 'Family', summary: 's', items: got.slice(3, 6).map(one) }] };
      if (!Array.isArray(req.user)) return { phrases: [] };   // not on the shared transcript: shows up in the feature list below
      return { answer: '', groups: [{ key: 'picks', name: '', summary: '', items: got.slice().reverse().map(one) }] };
    } };
}

test('every feature shares one opening: the same system text, transcript block (cached an hour) and answer format', async () => {
  const st = fresh(), calls = [], was = US.ai;
  US.ai = stub(calls);
  try {
    st.ownThemes = ['gratitude'];
    await S.findAllThemes(job, { useAI: true, own: ['gratitude'] });
    await S.addCustomTheme(job, 'kindness', { useAI: true });
    const skip = new Set(st.transcripts[1].lines.slice(-5).map(l => l.id));
    const more = await S.findMore(job, 'community', { useAI: true, exclude: skip });
    assert.ok(more.length && more.every(r => !skip.has(r.line.id)), `Find more never returns a line already chosen (${more.length} found)`);
    await S.makeNarrative(job, { brief: 'a 60 second video about family', useAI: true });
    await S.findMoments(job, { useAI: true });
    await S.findAnswers(job, { questions: ['What does family mean to you?'], useAI: true });
  } finally { US.ai = was; }
  const ctx = calls.filter(c => c.schema === C.SCHEMA);
  const features = Array.from(new Set(ctx.map(c => c.feature)));
  assert.deepStrictEqual(features.sort(), ['Find more', 'Find themes', 'Interview questions', 'Moments', 'Narrative cut', 'Your own theme'].sort(), 'features on the shared transcript: ' + features.join(', '));
  const first = ctx[0];
  for (const c of ctx) {
    assert.strictEqual(c.system, first.system, `${c.feature}: same system text`);
    assert.strictEqual(c.user[0].text, first.user[0].text, `${c.feature}: byte-identical transcript block`);
    assert.strictEqual(c.user[0].cache, '1h', `${c.feature}: cached for an hour`);
    assert.strictEqual(JSON.stringify(c.schema), JSON.stringify(C.SCHEMA), `${c.feature}: one answer format`);
    assert.ok(typeof c.user[1] === 'string' && !c.user[0].text.includes(c.user[1].slice(0, 30)), `${c.feature}: the task comes after`);
  }
  assert.ok(!/Clip |\/media\/|item\d/.test(first.user[0].text), 'no clip names, paths or clip ids – “Interview 1” only');
  assert.ok(/=== Interview 1 ===\n\S+\t\S*\t\d+:\d\d\+\d+\t/.test(first.user[0].text), 'layout: id, speaker, start+seconds, text');
  assert.ok(st.themes.some(t => /^gratitude$/i.test(t.name) && t.lineIds.length), 'your theme came back under your name: ' + st.themes.map(t => `${t.name} ${t.lineIds.length}`).join(', '));
  assert.ok(st.moments.list.some(m => m.by === 'ai'), 'moments read from the shared format');
  assert.strictEqual(st.questions.results[0].answers[0].asked !== '', true, 'the question being asked came back as “lead”');
});

test('cost: the first request of a job writes the transcript, the ones after read it', () => {
  const st = fresh(), reqs = C.requests(S.scopeTranscripts(), { task: () => 'x', feature: 'Test' }).map(b => b.req);
  const twice = US.storyAI.cost([reqs[0], reqs[0]]);
  let seen = [];
  const was = US.ai;
  US.ai = { label: () => 'Claude', estimateFor: r => { seen.push(r.user[0].warm === true); return { usd: 0 }; } };
  try { US.storyAI.cost([reqs[0], reqs[0], reqs[0]]); } finally { US.ai = was; }
  assert.deepStrictEqual(seen, [false, true, true]);
  assert.strictEqual(twice.requests, 2);
  assert.ok(st.transcripts.length === 3);
});

test('parts: whole interviews, deterministic; a huge project is read in parts that never split an interview that fits', () => {
  fresh();
  const ts = S.scopeTranscripts();
  assert.strictEqual(C.parts(ts).length, 1);
  const small = C.parts(ts, { chars: 3000 });
  assert.ok(small.length > 1);
  assert.deepStrictEqual(C.parts(ts, { chars: 3000 }).map(p => p.map(x => x.lines[0].id)), small.map(p => p.map(x => x.lines[0].id)), 'the same every time');
  assert.ok(ts.every(t => t.n >= 1), 'interviews keep their number');
});
