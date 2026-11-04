// Agent: the AI's turns read and checked, lengths, older results shortened, the rules it gets; then whole runs with a
// scripted AI against a stand-in Premiere – plan first (approved with a note), search and read lines, build, read the
// timeline, edit (the editor's own sequence copied first), a panel tool, a kept version, finish – and the limits:
// a plan turned down builds nothing, edits before a plan are refused, it stops at the step limit, a follow-up carries on.
const assert = require('assert');
const { load, test } = require('./harness');
global.ResizeObserver = global.ResizeObserver || function () { return { observe() {} }; };
// Story's companions load before Story itself (as in the panel), so the tests after this one see the same Story
const US = load(['time', 'audio', 'dsp', 'transcript', 'ui', 'app', 'ai', 'js/tools/22-story-glossary.js', 'js/tools/22-story-board.js', 'js/tools/22-story-export.js', 'js/tools/22-story-timeline.js', 'js/tools/22-story-narrative.js', 'js/tools/22-story-moments.js', 'js/tools/22-story-ai.js', 'js/tools/22-story-context.js', 'js/tools/22-story-voices.js', 'js/tools/22-story.js', 'js/tools/41-edit.js', 'js/tools/43-agent.js']);
const A = US.agent;
const job = { set() { return job; }, progress() {}, check() {}, log() {} };

test('the AI’s turn read: tool, arguments as an object, a plan; bad tools and bad JSON become a note', () => {
  assert.deepStrictEqual(A.parseStep({ say: 'Looking.', plan: [], tool: 'search', argsJson: '{"query":"oven"}' }), { say: 'Looking.', plan: [], tool: 'search', args: { query: 'oven' }, bad: '' });
  assert.ok(/no tool “fly”/.test(A.parseStep({ say: '', plan: [], tool: 'fly', argsJson: '{}' }).bad));
  assert.ok(/isn’t valid JSON/.test(A.parseStep({ say: '', plan: [], tool: 'search', argsJson: '{oops' }).bad));
  assert.ok(/JSON object/.test(A.parseStep({ say: '', plan: [], tool: 'search', argsJson: '[1]' }).bad));
  assert.deepStrictEqual(A.parseStep({ say: '', plan: ['a', '', 'b'], tool: 'plan', argsJson: '' }).plan, ['a', 'b']);
});

test('lengths in a goal; what a goal needs', () => {
  assert.deepStrictEqual(['A 2-minute film', '45 seconds for Instagram', 'keep it under 3:30', 'about 90s', '1.5 minutes', 'no length here'].map(A.lengthIn), [120, 45, 210, 90, 90, 0]);
  assert.deepStrictEqual(A.needs('Tighten this cut and check it'), { sequence: true, interviews: false });
  assert.strictEqual(A.needs('a film from the interviews about faith').interviews, true);
});

test('older results shortened so a long run stays cheap; the last ones stay whole', () => {
  const turns = Array.from({ length: 7 }, (_, i) => ({ assistant: '{}', user: `R${i} ` + 'x'.repeat(2000) }));
  const c = A.compact(turns, { keep: 4, room: 500 });
  assert.deepStrictEqual(c.map(t => t.user.length > 1000), [false, false, false, true, true, true, true]);
  assert.ok(/shortened – 2003 characters/.test(c[0].user));
  assert.strictEqual(turns[0].user.length, 2003, 'the session keeps the whole text');
});

test('the rules: every tool, the edits this editor allows, the panel tools with their settings; Resolve says what it can’t do', () => {
  const act = { id: 'silence.cut', title: 'Cut the pauses', describe: 'Removes pauses.', params: { minPause: { type: 'number', default: 0.5, desc: 'Shortest pause' } } };
  const r = A.rules({ resolve: false, actions: [act], ops: US.editAsk.opsFor('timeline', false) });
  for (const t of Object.keys(A.TOOLS)) assert.ok(r.includes(`- ${t}: `), t);
  assert.ok(/- transition: /.test(r) && /- silence\.cut – Cut the pauses\. Removes pauses\.\n    settings: minPause \(number\) = 0\.5: Shortest pause/.test(r));
  assert.ok(/never see footage/.test(r) && /Premiere Pro/.test(r));
  const rr = A.rules({ resolve: true, actions: [], ops: US.editAsk.opsFor('timeline', true) });
  assert.ok(/DaVinci Resolve/.test(rr) && /can’t add transitions/.test(rr) && !/- transition: /.test(rr));
  assert.ok(A.ACTIONS.every(id => !/^(deliver\.pack|deliver\.ranges|overnight|recipes)/.test(id)), 'nothing that renders, exports or runs other chains');
});

test('the brief: the editor, the open sequence, interviews with their speakers, themes and the project brief', () => {
  const b = A.brief({ editor: 'Premiere Pro', sequence: { name: 'Cut v3', duration: 185, clips: 40 }, story: { interviews: [{ name: 'Ruth', lines: 120, speakers: ['Ruth', 'Jo'] }], lines: 120, themes: [{ name: 'Family', n: 14 }], brief: 'For donors' } });
  assert.ok(/OPEN SEQUENCE: “Cut v3” – 3:05, 40 clips/.test(b) && /- Ruth: 120 lines – Ruth, Jo/.test(b) && /THEMES FOUND: Family \(14\)/.test(b) && /BRIEF FOR THIS PROJECT: For donors/.test(b));
  assert.ok(/none transcribed/.test(A.brief({ editor: 'Premiere Pro', sequence: null, story: null })));
});

/* ---------- whole runs ---------- */
const clip = (start, end, name) => ({ start, end, in: 0, out: end - start, name, path: '/m/' + name, itemId: 'it-' + name, disabled: false, effects: [], label: 3 });
const INFO = id => ({ id, name: id === 'mine' ? 'My cut' : 'Agent – Bakery', fps: 25, duration: 14, markers: [], video: [{ index: 0, clips: [clip(0, 6, 'RUTH.MP4'), clip(6, 14, 'SAM.MP4')] }], audio: [{ index: 0, clips: [clip(0, 6, 'RUTH.MP4'), clip(6, 14, 'SAM.MP4')] }] });
function setup(answers, { open = null } = {}) {
  const S = US.story;
  S._useState({ transcripts: [
    { key: 'r', name: 'Ruth interview', lines: [{ id: 'r1', start: 0, end: 3, speaker: 'Speaker 2', text: 'What did the bakery mean to you?' }, { id: 'r2', start: 3, end: 9, speaker: 'Speaker 1', text: 'The bakery oven was the warmest place on the street, everyone came in.' }, { id: 'r3', start: 9, end: 14, speaker: 'Speaker 1', text: 'When it closed I cried for a week.' }] },
    { key: 's', name: 'Sam interview', lines: [{ id: 's1', start: 0, end: 5, speaker: 'Speaker 1', text: 'Now the bakery is open again and full of children.' }] }],
  speakers: { 'Speaker 1': { name: 'Ruth' }, 'Speaker 2': { name: 'Interviewer' } }, themes: [{ name: 'The bakery', lineIds: ['r2', 's1'] }] });
  const host = [], ai = [], events = [];
  const was = { call: US.host.call, ai: US.ai, ctx: US.ctx, build: S.buildSequence, refresh: US.refreshContext };
  US.ctx = { sequence: open };
  let current = open;
  US.refreshContext = async () => { US.ctx = { sequence: current }; };
  US.host.call = async (fn, a) => {
    host.push([fn, a]);
    if (fn === 'editRead') return JSON.parse(JSON.stringify(INFO(a.seqId)));
    if (fn === 'cloneSequence') return { id: 'copy' + host.filter(h => h[0] === 'cloneSequence').length, name: a.name };
    if (fn === 'editApply') return { done: a.targets.length, skipped: [], log: [] };
    if (fn === 'openSequence') { current = { id: a.seqId, name: a.seqId }; return true; }
    return {};
  };
  S.buildSequence = async (j, o) => { host.push(['build', o]); current = { id: 'built', name: o.name }; return { seq: { id: 'built', name: o.name }, summary: `Built “${o.name}” · ${US.plural(o.groups.flatMap(g => g.lineIds).length, 'line')} · 0:14` }; };
  let budget = null;
  US.ai = Object.assign({}, was.ai, { available: () => true, label: () => 'Claude', provider: () => 'claude', setBudget: x => { budget = x; }, endBudget: () => { budget = 'ended'; }, spending: () => ({ cost: 0 }),
    json: async req => { ai.push(JSON.parse(JSON.stringify(req))); const x = answers[ai.length - 1]; if (!x) throw new Error('no more scripted answers'); return x; } });
  const restore = () => { US.host.call = was.call; US.ai = was.ai; US.ctx = was.ctx; S.buildSequence = was.build; US.refreshContext = was.refresh; };
  return { host, ai, events, onEvent: e => events.push(e), restore, budget: () => budget };
}
const T = (tool, args = {}, say = '', plan = []) => ({ say, plan, tool, argsJson: JSON.stringify(args) });
// stand-in panel tools for these runs; the real ones (if loaded) are put back afterwards
function standIn(a) { const was = US.actions.get(a.id); US.actions.register(a); return () => { if (was) US.actions.register(was); }; }

test('a whole run: plan approved with a note → search → read lines → build → read it → edit → a panel tool → keep a version → finish', async () => {
  let ran = 0;
  const putBack = standIn({ id: 'check.run', tool: 'check', title: 'Check the cut', changes: false, params: {}, run: async () => { ran++; return { summary: 'No problems found' }; } });
  const answers = [
    T('plan', {}, 'Here’s how I’ll make it.', ['Find lines about the bakery', 'Build a 2-minute cut', 'Dissolves between speakers', 'Check it']),
    T('search', { query: 'bakery oven', limit: 10 }, 'Searching.'),
    T('lines', { ids: ['r2'], around: 1 }),
    T('build', { name: 'Bakery', sections: [{ name: 'Then', lineIds: ['r2', 'r3', 'nope'] }, { name: 'Now', lineIds: ['s1'] }], targetSeconds: 120 }),
    T('timeline'),
    T('edit', { steps: [{ op: 'transition', targets: { tracks: ['V1'], every: 'cuts' }, params: { name: 'Cross Dissolve', at: 'start' }, why: 'smooth' }, { op: 'teleport', targets: {}, params: {} }] }),
    T('action', { id: 'check.run' }),
    T('version', { name: 'v1' }),
    T('finish', { summary: 'A 0:14 cut about the bakery.', check: ['Ruth’s last line may be cut short'] })];
  const x = setup(answers);
  try {
    const s = A.newSession('A 2-minute film about the bakery');
    let asked = null;
    await A.run(job, s, { maxSteps: 12, onEvent: x.onEvent, confirmPlan: async p => { asked = p; return { ok: true, note: 'keep the oven line' }; } });
    assert.deepStrictEqual(asked.plan, ['Find lines about the bakery', 'Build a 2-minute cut', 'Dissolves between speakers', 'Check it']);
    // what the AI was sent
    assert.strictEqual(x.ai[0].user[0].cache, '1h', 'the project brief is cached for the whole run');
    assert.ok(/Ruth interview: 3 lines/.test(x.ai[0].user[0].text) && /THEMES FOUND: The bakery \(2\)/.test(x.ai[0].user[0].text));
    assert.ok(/GOAL: A 2-minute film about the bakery\n\(Target length: about 2:00\.\)/.test(x.ai[0].user[1]));
    assert.ok(x.ai.every(r => r.user[0].text === x.ai[0].user[0].text && r.system[0].cache === '1h' && r.feature === 'Agent'));
    assert.ok(/approved the plan with a note: “keep the oven line”/.test(x.ai[1].turns[0].user));
    const res = i => x.ai[i + 1].turns[i].user;
    assert.ok(/r2\tRuth interview\tRuth\t0:03–0:09\tThe bakery oven/.test(res(1)), res(1));
    assert.ok(!/What did the bakery mean/.test(res(1)), 'interviewer questions aren’t offered as soundbites');
    assert.ok(/>r2\t/.test(res(2)) && /r1\t.*Interviewer/.test(res(2)), 'the line read with what was said around it');
    assert.ok(/Built “Agent – Bakery” · 3 lines/.test(res(3)) && /1 unknown line ids were left out/.test(res(3)));
    const built = x.host.find(h => h[0] === 'build')[1];
    assert.deepStrictEqual([built.target, built.groups.map(g => [g.name, g.lineIds])], [120, [['Then', ['r2', 'r3']], ['Now', ['s1']]]]);
    assert.ok(/Working sequence “Agent – Bakery” – 0:14 long/.test(res(4)) && /c1\tV1/.test(res(4)));
    assert.ok(/Cross Dissolve at the start · 1 clip on V1: 1 done/.test(res(5)) && /Left out: teleport/.test(res(5)), res(5));
    assert.ok(x.host.filter(h => h[0] === 'editApply').every(h => h[1].seqId === 'built'), 'its own sequence is edited in place');
    assert.strictEqual(ran, 1); assert.ok(/No problems found/.test(res(6)));
    assert.ok(/Kept a copy “Agent – Bakery – v1”/.test(res(7)));
    assert.ok(s.done && s.summary === 'A 0:14 cut about the bakery.' && s.check[0] === 'Ruth’s last line may be cut short');
    assert.deepStrictEqual(s.versions.map(v => v.name), ['Agent – Bakery', 'Agent – Bakery – v1']);
    assert.ok(x.host.every(h => !(h[1] && h[1].seqId === 'mine')), 'never touched anything of the editor’s');
    const done = x.events.find(e => e.type === 'done');
    assert.ok(done && done.versions.length === 2);
    assert.deepStrictEqual(x.events.filter(e => e.type === 'tool').map(e => e.tool), ['search', 'lines', 'build', 'timeline', 'edit', 'action', 'version', 'finish']);
  } finally { x.restore(); putBack(); }
});

test('the editor’s own sequence: copied once before the first change; a tool that makes its own copy becomes the working sequence', async () => {
  const putBack = standIn({ id: 'silence.cut', tool: 'silence', title: 'Cut the pauses', changes: true, params: { minPause: { type: 'number', default: 0.5 } }, run: async p => { await US.host.call('openSequence', { seqId: 'tight' }); return { summary: `Cut 12 pauses (min ${p.minPause}s)` }; } });
  const x = setup([
    T('plan', {}, '', ['Read it', 'Dissolves', 'Cut the pauses', 'Finish']),
    T('timeline'),
    T('edit', { steps: [{ op: 'transition', targets: { tracks: ['V1'], every: 'cuts' }, params: { name: 'Cross Dissolve' } }] }),
    T('edit', { steps: [{ op: 'marker', targets: { ids: ['c1'] }, params: { name: 'Look' } }] }),
    T('action', { id: 'silence.cut', params: { minPause: 0.8 } }),
    T('finish', { summary: 'Tightened.', check: [] })], { open: { id: 'mine', name: 'My cut' } });
  try {
    const s = A.newSession('Tighten this cut');
    await A.run(job, s, { onEvent: x.onEvent });
    const clones = x.host.filter(h => h[0] === 'cloneSequence');
    assert.strictEqual(clones.length, 1, 'one copy, made before the first change');
    assert.deepStrictEqual(clones[0][1], { seqId: 'mine', name: 'My cut – Agent', binPath: 'JMG Ultra Studio/Agent' });
    assert.ok(x.host.filter(h => h[0] === 'editApply').every(h => h[1].seqId === 'copy1'));
    assert.strictEqual(x.host.filter(h => h[0] === 'editRead' && h[1].seqId === 'mine').length >= 1, true, 'reading the editor’s cut is fine');
    assert.ok(/Cut 12 pauses \(min 0\.8s\)\. Its result is the sequence “tight”, now your working sequence/.test(x.ai[5].turns[4].user));
    assert.deepStrictEqual(s.work, { seqId: 'tight', name: 'tight', ours: true });
    assert.deepStrictEqual(s.versions.map(v => v.why), ['copy of your sequence', 'Cut the pauses']);
  } finally { x.restore(); putBack(); }
});

test('limits: a plan turned down builds nothing; changes before a plan are refused; it stops at the step limit; bad turns are told', async () => {
  let x = setup([T('plan', {}, '', ['Build it'])]);
  try {
    const s = A.newSession('A film');
    await A.run(job, s, { onEvent: x.onEvent, confirmPlan: async () => ({ ok: false }) });
    assert.strictEqual(x.ai.length, 1); assert.ok(!x.host.some(h => h[0] === 'build'));
    assert.ok(x.events.some(e => e.type === 'warn' && /wasn’t approved/.test(e.text)));
  } finally { x.restore(); }
  x = setup([T('build', { sections: [{ name: 'A', lineIds: ['r2'] }] }), { say: '', plan: [], tool: 'nope', argsJson: '{}' }, T('search', { query: 'oven' }), T('search', { query: 'warm' })]);
  try {
    const s = A.newSession('A film');
    await A.run(job, s, { maxSteps: 4, onEvent: x.onEvent });
    assert.ok(!x.host.some(h => h[0] === 'build'), 'no building before an approved plan');
    assert.ok(/show your plan first/.test(x.ai[1].turns[0].user));
    assert.ok(/no tool “nope”/.test(x.ai[2].turns[1].user));
    assert.strictEqual(x.ai.length, 4, 'four steps, then it stops');
    assert.ok(x.events.some(e => e.type === 'warn' && /Stopped after 4 steps/.test(e.text)) && !s.done);
  } finally { x.restore(); }
});

test('a follow-up carries on the same conversation: the brief still cached, the last result and the request added, no new plan needed', async () => {
  const x = setup([
    T('plan', {}, '', ['Build', 'Finish']),
    T('build', { name: 'Bakery', sections: [{ name: 'All', lineIds: ['r2', 's1'] }] }),
    T('finish', { summary: 'Done.' }),
    T('edit', { steps: [{ op: 'remove', targets: { ids: ['c2'] }, params: { ripple: true } }] }),
    T('finish', { summary: 'Shorter now.' })]);
  try {
    const s = A.newSession('A film about the bakery');
    await A.run(job, s, { onEvent: x.onEvent });
    assert.ok(s.done);
    await A.run(job, s, { followUp: 'Make it 10 seconds shorter', onEvent: x.onEvent });
    const r = x.ai[3];
    assert.strictEqual(r.user[0].text, x.ai[0].user[0].text);
    assert.ok(/The editor follows up: “Make it 10 seconds shorter” \(target length about 0:10\)/.test(r.turns[r.turns.length - 1].user) && /working sequence is “Agent – Bakery”/.test(r.turns[r.turns.length - 1].user));
    assert.ok(x.host.some(h => h[0] === 'editApply' && h[1].op === 'remove' && h[1].seqId === 'built'), 'edits without asking for a new plan');
    assert.strictEqual(s.summary, 'Shorter now.');
  } finally { x.restore(); }
});

test('the Assistant hands a goal over: “agent: …” and “make me a rough cut …”', () => {
  const a = US.actions.get('agent.run');
  assert.deepStrictEqual(a.match('agent: a 2-minute charity film about the bakery'), { goal: 'a 2-minute charity film about the bakery', _score: 2.4 });
  assert.ok(a.match('make me a rough cut about leaving home'));
  assert.strictEqual(a.match('cut the silences'), null);
});

test('switched off in Settings: no tab, no command (rollback without reinstalling)', () => {
  const vm = require('vm'), fs = require('fs'), path = require('path');
  const tools = US.tools.get('agent'), had = US.agent;
  US.settings.set('agent.enabled', false);
  try {
    US.agent = null;
    vm.runInThisContext(fs.readFileSync(path.join(__dirname, '..', '..', 'js', 'tools', '43-agent.js'), 'utf8'));
    assert.deepStrictEqual(US.agent, { off: true });
    assert.ok(tools, 'it was there while on');
  } finally { US.settings.set('agent.enabled', true); US.agent = had; }
});
