const assert = require('assert');
const { load, test } = require('./harness');
global.addEventListener = global.addEventListener || (() => {});
global.ResizeObserver = global.ResizeObserver || function () { return { observe() {} }; };
const US = load(['time', 'transcript', 'ui', 'app', 'js/tools/22-story-ai.js', 'js/tools/22-story-captions.js', 'js/tools/22-story.js', 'js/tools/23-broll.js', 'js/tools/24-cameras.js', 'js/tools/34-colour.js', 'js/tools/40-assistant.js']);
const A = US.assistant;

// stand-ins for other tools' actions (registered by their own files in the real panel)
US.actions.register({ id: 'silence.cut', tool: 'silence', title: 'Cut silences', changes: true, params: { minPause: { type: 'number', default: 0.6, desc: 'Shortest pause to cut, in seconds' } }, examples: ['cut the silences'], match: t => (/\bsilen|pauses?\b/i.test(t) ? { minPause: (/(\d+(?:\.\d+)?)\s*s/.exec(t) || [])[1] || 0.6 } : null), run: async () => ({ summary: 'ok' }) });
US.actions.register({ id: 'beats.markers', tool: 'beats', title: 'Markers on the beat', params: { every: { type: 'number', default: 1 } }, examples: ['markers on every beat'], match: t => (/\bbeats?\b/i.test(t) && /\bmarkers?\b/i.test(t) ? { every: 1 } : null), run: async () => ({ summary: 'ok' }) });
US.actions.register({ id: 'qc.check', tool: 'qc', title: 'Check the cut', examples: ['check the cut'], match: t => (/\bcheck\b.*\bcut\b/i.test(t) ? {} : null), run: async () => ({ summary: 'ok' }) });

test('Story commands are understood offline', () => {
  const m = t => A.matchOffline(t).steps[0];
  assert.deepStrictEqual(m('lines about volunteering'), { action: 'story.search', params: { query: 'volunteering' } });
  assert.deepStrictEqual(m('find where they talk about faith and prayer'), { action: 'story.search', params: { query: 'faith and prayer' } });
  assert.strictEqual(m('find the themes').action, 'story.themes');
  assert.strictEqual(m('sort the selects into bins by theme').action, 'story.bins');
  assert.deepStrictEqual(m('make a stringout of the family theme').params, { source: 'theme', theme: 'family' });
  assert.deepStrictEqual(m('build the sequence from the themes').params, { source: 'themes' });
  assert.strictEqual(m('read the transcripts').action, 'story.read');
});
test('captions, B-roll and colour requests route to their actions', () => {
  const m = t => A.matchOffline(t).steps[0];
  assert.deepStrictEqual(m('add captions'), { action: 'story.captions', params: { style: 'subtitles', names: false, upper: false } });
  assert.strictEqual(m('social captions in caps for reels').params.style, 'social');
  assert.strictEqual(m('one word at a time captions').params.style, 'words');
  assert.strictEqual(m('export the transcript as subtitles').action, 'story.timelineTranscript', 'a transcript file is not captions');
  assert.deepStrictEqual(m('save the themes as a paper edit'), { action: 'story.paperEdit', params: { format: 'docx', source: 'themes' } });
  assert.deepStrictEqual(m('export the narrative as a spreadsheet'), { action: 'story.paperEdit', params: { format: 'csv', source: 'narrative' } });
  assert.strictEqual(m('make a paper edit I can send to the director').action, 'story.paperEdit');
  assert.deepStrictEqual(m('write an interview log'), { action: 'story.interviewLog', params: { summaries: false, full: false, format: 'docx' } });
  assert.deepStrictEqual(m('summarise each interview').params, { summaries: true, full: false, format: 'docx' });
  assert.deepStrictEqual(m('all the interview transcripts as one Word document').params, { summaries: false, full: true, format: 'docx' });
  assert.strictEqual(m('log the interviews in a spreadsheet').params.format, 'csv');
  // near misses found in review: these are not documents
  const not = (t, id) => assert.notStrictEqual((A.matchOffline(t).steps[0] || {}).action, id, t);
  for (const t of ['cut a 2 minute summary video from the interviews', 'summarise the interviews in a 60 second video', 'export the transcripts of all the interviews in this sequence to word']) not(t, 'story.interviewLog');
  for (const t of ['make a sequence from the wall and save it', 'export this sequence for the video wall', 'send the picked lines to the board', 'make a promo from the board and save it']) not(t, 'story.paperEdit');
  assert.strictEqual(m('make a sequence from the wall and save it').action, 'story.build');
  assert.strictEqual(m('export the transcripts of all the interviews in this sequence to word').action, 'story.timelineTranscript');
  assert.strictEqual(m('export the transcript of this timeline as a Word document').action, 'story.timelineTranscript');
  assert.strictEqual(m('cover the jump cuts with b-roll').action, 'broll.cover');
  assert.strictEqual(m('match the cameras').action, 'colour.match');
  assert.strictEqual(m('cut between the cameras').action, 'cameras.cut');
  assert.strictEqual(m('switch camera angles to follow whoever is speaking').params.mode, 'speaker');
  assert.deepStrictEqual(m('these clips are v-log').params, { space: 'Panasonic V-Log/V-Gamut' });
});
test('other tools’ commands route to their actions; nonsense matches nothing', () => {
  assert.deepStrictEqual(A.matchOffline('cut pauses longer than 1.2 s').steps, [{ action: 'silence.cut', params: { minPause: '1.2' } }]);
  assert.strictEqual(A.matchOffline('add markers on every beat').steps[0].action, 'beats.markers');
  assert.strictEqual(A.matchOffline('please check the cut before export').steps[0].action, 'qc.check');
  const none = A.matchOffline('make me a cup of tea');
  assert.strictEqual(none.steps.length, 0);
});
test('validatePlan keeps only known actions and params, with types fixed', () => {
  const r = A.validatePlan({ reply: 'ok', steps: [
    { action: 'silence.cut', paramsJson: '{"minPause":"0.8","bogus":1}' },
    { action: 'delete.everything', paramsJson: '{}' },
    { action: 'story.build', paramsJson: '{"source":"nonsense"}' },
    { action: 'qc.check', paramsJson: 'not json' }] });
  assert.deepStrictEqual(r.rejected, ['delete.everything']);
  assert.deepStrictEqual(r.steps[0], { action: 'silence.cut', params: { minPause: 0.8 } });
  assert.strictEqual(r.steps[1].params.source, 'themes', 'bad enum falls back to default');
  assert.strictEqual(r.steps[2].action, 'qc.check');
});
test('AI planning sends the action list, constrains ids, and is validated', async () => {
  let req = null;
  const saved = US.ai;
  US.ai = { available: () => true, label: () => 'Claude', json: async r => { req = r; return { reply: 'I’ll cut the pauses, then check the cut.', steps: [{ action: 'silence.cut', paramsJson: '{"minPause":1}' }, { action: 'qc.check', paramsJson: '{}' }] }; } };
  try {
    const plan = await A.planWithAI('tighten up the interview and make sure nothing is broken');
    assert.deepStrictEqual(plan.steps.map(s => s.action), ['silence.cut', 'qc.check']);
    assert.ok(req.schema.properties.steps.items.properties.action.enum.includes('story.build'));
    assert.strictEqual(req.schema.additionalProperties, false);
    assert.strictEqual(req.schema.properties.steps.items.additionalProperties, false);
    assert.ok(Array.isArray(req.system) && req.system.length === 1 && req.system[0].cache === '1h', 'the instructions and action list are one block, cached for an hour');
    assert.ok(/silence\.cut/.test(req.system[0].text) && /ONLY the actions/.test(req.system[0].text));
    assert.ok(/Request: tighten up/.test(req.user) && req.feature === 'Assistant plan');
  } finally { US.ai = saved; }
});
test('suggestions point at the closest built-in command', () => {
  const s = A.suggest('remove the silent bits');
  assert.ok(s.length && s[0].a.id === 'silence.cut', JSON.stringify(s.map(x => x.a.id)));
  const d = A.describeStep({ action: 'silence.cut', params: { minPause: 1.5 } });
  assert.strictEqual(d.title, 'Cut silences'); assert.ok(d.changes); assert.ok(/1\.5/.test(d.detail));
});
