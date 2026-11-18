// Ask – one chat for everything: what a step touches and when the editor is asked first; the AI's turns read; the rules
// and the brief it gets; then whole conversations with a scripted AI against a stand-in Premiere – what it understood
// and its plan shown, a question with answers, an edit on a copy (approved, a step unticked), a panel tool, the report;
// a step turned down; “don't ask”; changing the sequence itself always asks; the step limit; Stop; two chats at once
// taking turns in the editor; and that each chat's requests carry its own name and AI.
const assert = require('assert');
const { load, test } = require('./harness');
global.ResizeObserver = global.ResizeObserver || function () { return { observe() {} }; };
const US = load(['time', 'audio', 'dsp', 'transcript', 'ui', 'app', 'ai', 'js/tools/22-story-glossary.js', 'js/tools/22-story-board.js', 'js/tools/22-story-export.js', 'js/tools/22-story-timeline.js', 'js/tools/22-story-narrative.js', 'js/tools/22-story-moments.js', 'js/tools/22-story-ai.js', 'js/tools/22-story-context.js', 'js/tools/22-story-ask.js', 'js/tools/22-story-voices.js', 'js/tools/22-story.js', 'js/tools/40-assistant-chat.js', 'js/tools/41-edit.js', 'js/tools/43-agent.js']);
const C = US.chat;
C._tick = 2;

test('what a step touches, and when the editor is asked first', () => {
  for (const t of ['project', 'timeline', 'selection', 'bin', 'search', 'lines', 'themes', 'ask', 'finish', 'open']) assert.strictEqual(C.riskOf(t, {}), 'read', t);
  assert.strictEqual(C.riskOf('interviews', {}), 'ai');
  assert.strictEqual(C.riskOf('build', {}), 'new');
  assert.strictEqual(C.riskOf('edit', { where: 'sequence', steps: [{ op: 'transition' }] }), 'new', 'on a copy');
  assert.strictEqual(C.riskOf('edit', { where: 'sequence', inPlace: true, steps: [] }), 'own');
  assert.strictEqual(C.riskOf('edit', { where: 'project', steps: [] }), 'own');
  assert.strictEqual(C.riskOf('edit', { where: 'sequence', steps: [{ op: 'append' }] }), 'own');
  assert.strictEqual(C.riskOf('edit', { where: 'sequence', steps: [{ op: 'transition', sequences: { bin: 'Shorts' } }] }), 'own');
  assert.strictEqual(C.riskOf('action', { id: 'silence.cut' }, { action: { changes: true } }), 'new');
  assert.strictEqual(C.riskOf('action', { id: 'check.run' }, { action: { changes: false } }), 'read');
  assert.strictEqual(C.riskOf('action', { id: 'deliver.pack' }, { action: { changes: true } }), 'out');
  assert.strictEqual(C.riskOf('action', { id: 'deliver.chapters' }, { action: { changes: false } }), 'read');
  // ask: everything that changes; own: only their own work and files; never: nothing; “Always proceed” covers new things only
  const grid = m => ['read', 'ai', 'new', 'own', 'out'].map(r => C.asksFirst(r, m)).join();
  assert.strictEqual(grid('ask'), 'false,false,true,true,true');
  assert.strictEqual(grid('own'), 'false,false,false,true,true');
  assert.strictEqual(grid('never'), 'false,false,false,false,false');
  assert.deepStrictEqual([C.asksFirst('new', 'ask', true), C.asksFirst('own', 'ask', true), C.asksFirst('out', 'ask', true)], [false, true, true]);
});

test('the AI’s turn read; a chat’s name; older results shortened; what is kept with the project', () => {
  assert.deepStrictEqual(C.parseStep({ say: 'Reading.', understood: 'You want X.', plan: ['a', ' ', 'b'], tool: 'timeline', argsJson: '{"sequence":"s2"}' }), { say: 'Reading.', understood: 'You want X.', plan: ['a', 'b'], tool: 'timeline', args: { sequence: 's2' }, bad: '' });
  assert.ok(/no tool “fly”/.test(C.parseStep({ tool: 'fly', argsJson: '{}' }).bad) && /valid JSON/.test(C.parseStep({ tool: 'project', argsJson: '{x' }).bad));
  assert.strictEqual(C.titleOf('put a cross dissolve on every single cut please'), 'Put a cross dissolve on…');
  const turns = Array.from({ length: 8 }, (_, i) => ({ assistant: '{}', user: `R${i} ` + 'x'.repeat(2000) }));
  assert.deepStrictEqual(C.compact(turns).map(t => t.user.length > 1000), [false, false, false, true, true, true, true, true]);
  const c = C.newChat({ title: 'T' }); c.items = [{ k: 'me', text: 'hi' }, { k: 'card', card: 'approve', el: {} }, { k: 'card', card: 'ask', askId: 'a1', keep: true }, { k: 'step', text: 'Read', el: { big: 1 } }]; c.turns = turns; c.logEl = {}; c.job = {};
  const s = C.toStored(c);
  assert.deepStrictEqual(s.items.map(x => x.k + (x.el ? '!' : '')), ['me', 'card', 'step'], 'live cards and screen elements aren’t kept');
  assert.ok(!('logEl' in s) && !('job' in s) && JSON.stringify(s).length < 12000);
  assert.strictEqual(C.fromStored(s).status, 'idle');
});

test('the rules and the brief: every tool, the edits, every panel tool with its settings; text only; the editor’s choice about asking', () => {
  const act = { id: 'silence.cut', tool: 'silence', title: 'Cut the pauses', describe: 'Removes pauses.', changes: true, params: { minPause: { type: 'number', default: 0.5, desc: 'Shortest pause' } } };
  const r = C.rules({ resolve: false, actions: [act], ops: { timeline: US.editAsk.opsFor('timeline', false), items: US.editAsk.opsFor('items', false) } });
  for (const t of Object.keys(C.TOOLS)) assert.ok(r.includes(`- ${t}: `), t);
  assert.ok(/never see footage, frames or audio/.test(r) && /Adobe Premiere Pro/.test(r));
  assert.ok(/- transition: /.test(r) && /- move: /.test(r) && /- silence\.cut \[silence\] – Cut the pauses \(changes the project\)\. Removes pauses\.\n    settings: minPause \(number\) = 0\.5: Shortest pause/.test(r), 'edits and panel tools listed');
  assert.ok(/"understood"/.test(r) && /call "ask"/.test(r) && /Never say something was done that a tool did not report/.test(r));
  const rr = C.rules({ resolve: true, actions: [], ops: { timeline: US.editAsk.opsFor('timeline', true), items: US.editAsk.opsFor('items', true) } });
  assert.ok(/DaVinci Resolve/.test(rr) && !/- transition: /.test(rr));
  const b = C.brief({ editor: 'Premiere Pro', project: 'Bakery film', sequence: { name: 'Cut v3', duration: 185 }, selection: 4, story: { interviews: [{ name: 'Ruth', lines: 120, speakers: ['Ruth'] }], lines: 120, themes: [], brief: '' }, mode: 'own' });
  assert.ok(/PROJECT: Bakery film/.test(b) && /OPEN SEQUENCE: “Cut v3” – 3:05/.test(b) && /SELECTED IN THE PROJECT PANEL: 4 clips/.test(b) && /- Ruth: 120 lines/.test(b) && /approves changes to their own sequences/.test(b));
  assert.ok(!C.actionsHere().some(a => /^(story\.ask|edit\.ask|agent\.run)$/.test(a.id)), 'its own tools do those');
});

/* ---------- whole conversations ---------- */
const clip = (start, end, name) => ({ start, end, in: 0, out: end - start, name, path: '/m/' + name, itemId: 'it-' + name, disabled: false, effects: [], label: 3 });
const NAMES = { mine: 'My cut', other: 'Teaser' };
const INFO = id => ({ id, name: NAMES[id] || id, fps: 25, duration: 14, markers: [], video: [{ index: 0, clips: [clip(0, 6, 'RUTH.MP4'), clip(6, 14, 'SAM.MP4')] }], audio: [{ index: 0, clips: [clip(0, 6, 'RUTH.MP4'), clip(6, 14, 'SAM.MP4')] }] });
function setup(answers, { open = { id: 'mine', name: 'My cut' }, slow = 0 } = {}) {
  US.story._useState({ transcripts: [{ key: 'r', name: 'Ruth interview', lines: [{ id: 'r1', start: 0, end: 3, speaker: 'Speaker 1', text: 'The bakery oven was the warmest place on the street.' }] }], speakers: { 'Speaker 1': { name: 'Ruth' } }, themes: [] });
  const host = [], ai = [];
  const was = { call: US.host.call, ai: US.ai, ctx: US.ctx, refresh: US.refreshContext, toast: US.ui.toast };
  let current = open, inHost = 0, overlap = 0;
  US.ctx = { project: { name: 'Bakery film' }, sequence: open, selection: 0 };
  US.refreshContext = async () => { US.ctx = Object.assign({}, US.ctx, { sequence: current }); };
  US.ui.toast = () => {};
  US.host.call = async (fn, a) => {
    host.push([fn, a]);
    if (++inHost > 1) overlap++;
    try {
      if (slow) await new Promise(r => setTimeout(r, slow));
      if (fn === 'editRead') return JSON.parse(JSON.stringify(INFO(a.seqId)));
      if (fn === 'editProject') return { bins: ['Interviews', 'Drone'], sequences: [{ id: 'mine', name: 'My cut', bin: '', duration: 14, video: 1, audio: 1 }, { id: 'other', name: 'Teaser', bin: 'Shorts', duration: 14, video: 1, audio: 1 }], clips: [{ id: 'it-RUTH.MP4', name: 'RUTH.MP4', bin: 'Interviews', kind: 'video' }] };
      if (fn === 'cloneSequence') return { id: 'copy' + host.filter(h => h[0] === 'cloneSequence').length, name: a.name };
      if (fn === 'editApply') return { done: a.targets.length, skipped: [], log: [] };
      if (fn === 'openSequence') { current = { id: a.seqId, name: NAMES[a.seqId] || a.seqId }; return true; }
      if (fn === 'sequenceInfo') return JSON.parse(JSON.stringify(INFO(a.seqId)));
      return {};
    } finally { inHost--; }
  };
  const scripts = Array.isArray(answers) ? { any: answers.slice() } : answers;
  US.ai = Object.assign({}, was.ai, { available: () => true, label: () => 'Claude', provider: () => 'claude', fmtUSD: x => '$' + x.toFixed(2),
    json: async req => { ai.push(JSON.parse(JSON.stringify(Object.assign({}, req, { onUsage: undefined })))); const list = scripts[req.as && scripts[req.as.id] ? req.as.id : 'any']; const x = list.shift(); if (!x) throw new Error('no more scripted answers'); if (x.wait) await new Promise(r => setTimeout(r, x.wait)); if (req.onUsage) req.onUsage({ usd: x.usd || 0.01, name: 'Claude Opus 5.5' }); return x; } });
  const restore = () => { US.host.call = was.call; US.ai = was.ai; US.ctx = was.ctx; US.refreshContext = was.refresh; US.ui.toast = was.toast; };
  return { host, ai, restore, overlap: () => overlap };
}
const T = (tool, args = {}, say = '', extra = {}) => Object.assign({ say, understood: '', plan: [], tool, argsJson: JSON.stringify(args) }, extra);
const hooksFor = (log, { approve = async () => ({ ok: true }), choose = async () => null } = {}) => ({ event: it => log.push(it), approve: async card => { log.push({ k: 'approve?', card }); return approve(card); }, choose: async q => { log.push({ k: 'choose?', q }); return choose(q); } });
function standIn(a) { const was = US.actions.get(a.id); US.actions.register(a); return () => { if (was) US.actions.register(was); }; }

test('a whole conversation: understood and plan shown → a question answered → the sequence read → an edit approved (one step unticked) on a copy → a panel tool → the report; then a follow-up in the same chat', async () => {
  let ran = 0;
  const putBack = standIn({ id: 'check.run', tool: 'check', title: 'Check the cut', changes: false, params: {}, run: async () => { ran++; return { summary: 'No problems found' }; } });
  const x = setup([
    T('ask', { question: 'Dissolves on the picture only, or the sound too?', options: ['Picture only', 'Picture and sound'], kind: 'choice' }, 'One thing to check first.', { understood: 'You want a dissolve on every cut of the open sequence, then a check.', plan: ['Read the sequence', 'Add the dissolves on a copy', 'Check the cut'] }),
    T('timeline', {}, 'Reading your sequence.'),
    T('edit', { where: 'sequence', steps: [{ op: 'transition', targets: { tracks: ['V1'], every: 'cuts' }, params: { name: 'Cross Dissolve', at: 'start' }, why: 'the joins' }, { op: 'label', targets: { tracks: ['V1'] }, params: { label: 13 }, why: 'so you can see them' }, { op: 'teleport', targets: {}, params: {} }] }, 'Adding them on a copy.'),
    T('action', { id: 'check.run' }, 'Checking it.'),
    T('finish', { reply: 'A dissolve is on the one join on V1, in a copy.', done: ['1 dissolve'], notDone: ['Sound fades – you chose picture only'], check: ['The join at 0:06'], next: ['Make them 20 frames'] }),
    T('finish', { reply: 'It is 14 seconds long.' }, '', { understood: 'You want to know how long the copy is.' })]);
  const log = [], chat = C.newChat();
  try {
    await C.send(chat, 'a cross dissolve on every cut, then check it', hooksFor(log, { choose: async () => 'Picture only', approve: async card => ({ ok: true, steps: card.steps ? card.steps.slice(0, 1) : undefined }) }), { mode: 'ask' });
    assert.strictEqual(chat.title, 'A cross dissolve on every…');
    assert.deepStrictEqual(log.filter(i => i.k !== 'result').map(i => i.k), ['me', 'understood', 'plan', 'say', 'choose?', 'say', 'step', 'say', 'step', 'approve?', 'say', 'step', 'end']);
    assert.deepStrictEqual(log.find(i => i.k === 'plan').plan, ['Read the sequence', 'Add the dissolves on a copy', 'Check the cut']);
    // what the AI was sent: the rules and the brief cached, the request, each result as the next turn
    assert.ok(x.ai.every(r => r.system[0].cache === '1h' && r.user[0].cache === '1h' && r.user[0].text === x.ai[0].user[0].text && r.feature === 'Ask'));
    assert.ok(/PROJECT: Bakery film/.test(x.ai[0].user[0].text) && /OPEN SEQUENCE: “My cut”/.test(x.ai[0].user[0].text) && /Ruth interview: 1 lines/.test(x.ai[0].user[0].text));
    assert.strictEqual(x.ai[0].user[1], 'The editor says: “a cross dissolve on every cut, then check it”');
    assert.deepStrictEqual(x.ai[0].as, { id: chat.id, title: 'Ask: A cross dissolve on every…', about: chat.about }, 'its requests are kept under the chat’s own name');
    const res = i => x.ai[i + 1].turns[i].user;
    assert.ok(/The editor answers: “Picture only”/.test(res(0)));
    assert.ok(/SEQUENCE “My cut”/.test(res(1)) && /c1\tV1/.test(res(1)) && !/PROJECT CLIPS/.test(res(1)));
    // the approval card: the checked steps with what they touch; only the ticked one ran, on a copy
    const card = log.find(i => i.k === 'approve?').card;
    assert.deepStrictEqual([card.risk, card.steps.length, card.dropped.length], ['new', 2, 1]);
    assert.ok(/a copy of “My cut” \(yours stays as it is\)/.test(card.detail));
    const applied = x.host.filter(h => h[0] === 'editApply');
    assert.deepStrictEqual(applied.map(h => [h[1].seqId, h[1].op]), [['copy1', 'transition']], 'the unticked label step didn’t run; the editor’s own sequence is untouched');
    assert.ok(/Cross Dissolve at the start · 1 clip on V1: 1 done/.test(res(2)) && /unticked 1 step/.test(res(2)) && /Left out: teleport/.test(res(2)) && /copy “My cut – Ask”, now your working sequence/.test(res(2)), res(2));
    assert.deepStrictEqual(chat.work, { seqId: 'copy1', name: 'My cut – Ask', ours: true });
    assert.strictEqual(ran, 1, 'a panel tool that only reads isn’t asked about');
    assert.ok(/No problems found/.test(res(3)));
    const end = log.find(i => i.k === 'end');
    assert.deepStrictEqual([end.reply, end.done, end.notDone, end.check, end.next, end.steps, end.versions.map(v => v.name)], ['A dissolve is on the one join on V1, in a copy.', ['1 dissolve'], ['Sound fades – you chose picture only'], ['The join at 0:06'], ['Make them 20 frames'], 5, ['My cut – Ask']]);
    assert.ok(Math.abs(end.spent - 0.05) < 1e-9 && end.model === 'Claude Opus 5.5', 'what this request cost, and which AI');
    assert.strictEqual(chat.status, 'idle');
    // a follow-up: the same conversation, told where things stand now
    await C.send(chat, 'how long is it?', hooksFor(log), { mode: 'ask' });
    const last = x.ai[x.ai.length - 1];
    assert.strictEqual(last.user[1], x.ai[0].user[1], 'the same first message (read from the cache)');
    assert.ok(/your working sequence “My cut – Ask”/.test(last.turns[last.turns.length - 1].user) && /The editor says: “how long is it\?”/.test(last.turns[last.turns.length - 1].user));
    assert.strictEqual(log[log.length - 1].reply, 'It is 14 seconds long.');
    assert.strictEqual(x.overlap(), 0);
  } finally { x.restore(); putBack(); }
});

test('a step turned down doesn’t run and the AI is told (with what the editor said instead); “don’t ask” runs straight through; the sequence itself always asks first', async () => {
  const edit = (extra = {}) => T('edit', Object.assign({ where: 'sequence', steps: [{ op: 'opacity', targets: { tracks: ['V1'] }, params: { value: 50 } }] }, extra));
  let x = setup([edit(), T('finish', { reply: 'Left as it was.' })]);
  const log = [];
  try {
    await C.send(C.newChat(), 'half opacity on V1', hooksFor(log, { approve: async () => ({ ok: false, note: 'only the first clip' }) }), { mode: 'ask' });
    assert.ok(!x.host.some(h => h[0] === 'editApply' || h[0] === 'cloneSequence'), 'nothing changed');
    assert.ok(/did not approve this step – it did not run\. Instead they say: “only the first clip”/.test(x.ai[1].turns[0].user));
  } finally { x.restore(); }
  x = setup([edit(), T('finish', { reply: 'Done.' })]);
  try {
    const l2 = [];
    await C.send(C.newChat(), 'half opacity on V1', hooksFor(l2), { mode: 'never' });
    assert.ok(!l2.some(i => i.k === 'approve?') && x.host.some(h => h[0] === 'editApply' && h[1].seqId === 'copy1'), 'not asked – and still on a copy');
  } finally { x.restore(); }
  x = setup([edit({ inPlace: true }), T('finish', { reply: 'Done.' })]);
  try {
    const l3 = [];
    await C.send(C.newChat(), 'half opacity on V1, in the sequence itself', hooksFor(l3), { mode: 'own' });
    const card = l3.find(i => i.k === 'approve?').card;
    assert.ok(card.risk === 'own' && /“My cut” ITSELF – no copy/.test(card.detail));
    assert.ok(x.host.some(h => h[0] === 'editApply' && h[1].seqId === 'mine') && !x.host.some(h => h[0] === 'cloneSequence'));
  } finally { x.restore(); }
});

test('a sequence by name or id, one that isn’t there, a step that fails, a tool that doesn’t exist: the AI is told and carries on; the step limit; Stop', async () => {
  let x = setup([T('timeline', { sequence: 'teaser' }), T('timeline', { sequence: 'Nowhere' }), T('action', { id: 'format.drive' }), T('edit', { where: 'sequence', steps: [{ op: 'opacity', targets: { tracks: ['V9'] }, params: { value: 50 } }] }), T('fly', {}), T('finish', { reply: 'ok' })]);
  try {
    const log = [];
    await C.send(C.newChat(), 'look around', hooksFor(log), { mode: 'never' });
    const res = i => x.ai[i + 1].turns[i].user;
    assert.ok(/SEQUENCE “Teaser”/.test(res(0)) && /There is no sequence “Nowhere”/.test(res(1)) && /no panel tool “format\.drive”/.test(res(2)) && /Nothing to do: .*nothing matched/.test(res(3)) && /no tool “fly”/.test(res(4)));
  } finally { x.restore(); }
  x = setup(Array.from({ length: 6 }, () => T('project')));
  try {
    const log = [], chat = C.newChat();
    await C.send(chat, 'keep reading', hooksFor(log), { mode: 'ask', maxSteps: 3 });
    assert.strictEqual(x.ai.length, 3);
    assert.ok(/stopped after 3 steps/.test(log[log.length - 1].text) && chat.status === 'idle' && /step limit/.test(chat.pendingResult));
  } finally { x.restore(); }
  x = setup([T('project'), T('project', {}, '', { wait: 30 }), T('finish', { reply: 'never' })]);
  try {
    const log = [], chat = C.newChat();
    const p = C.send(chat, 'read', hooksFor(log), { mode: 'ask' });
    await new Promise(r => setTimeout(r, 15)); C.stop(chat); await p;
    assert.ok(/Stopped/.test(log[log.length - 1].text) && !log.some(i => i.k === 'end') && chat.status === 'idle');
    assert.ok(x.ai.length <= 2, 'nothing more was asked of the AI');
  } finally { x.restore(); }
});

test('two chats at once: both think side by side, their steps in the editor take turns, each finishes with its own report and its own AI', async () => {
  const a = C.newChat({ model: 'claude:claude-haiku-5-5' }), b = C.newChat();
  const x = setup({ [a.id]: [T('timeline', {}, 'A reads.', { wait: 5 }), T('edit', { where: 'sequence', steps: [{ op: 'opacity', targets: { tracks: ['V1'] }, params: { value: 50 } }] }), T('finish', { reply: 'A done.' })],
    [b.id]: [T('timeline', { sequence: 'Teaser' }, 'B reads.', { wait: 5 }), T('edit', { where: 'sequence', sequence: 'Teaser', steps: [{ op: 'enable', targets: { tracks: ['V1'], every: 'last' }, params: { on: false } }] }), T('finish', { reply: 'B done.' })] }, { slow: 3 });
  try {
    const la = [], lb = [], states = [];
    const watch = (log, chat) => Object.assign(hooksFor(log), { status: () => states.push(`${chat === a ? 'a' : 'b'}:${chat.status}`) });
    await Promise.all([C.send(a, 'half opacity on V1', watch(la, a), { mode: 'never' }), C.send(b, 'switch off the last clip in Teaser', watch(lb, b), { mode: 'never' })]);
    assert.strictEqual(la[la.length - 1].reply, 'A done.'); assert.strictEqual(lb[lb.length - 1].reply, 'B done.');
    assert.strictEqual(x.overlap(), 0, 'never two steps in the editor at the same moment');
    assert.ok(states.includes('a:waiting') || states.includes('b:waiting'), 'one waited its turn: ' + [...new Set(states)].join(' '));
    const applied = x.host.filter(h => h[0] === 'editApply').map(h => `${h[1].op}@${h[1].seqId}`).sort();
    assert.deepStrictEqual(applied.map(s => s.split('@')[0]), ['enable', 'opacity']); assert.strictEqual(new Set(applied.map(s => s.split('@')[1])).size, 2, 'each on its own copy: ' + applied);
    assert.deepStrictEqual([a.work.name, b.work.name], ['My cut – Ask', 'Teaser – Ask']);
    assert.ok(x.ai.filter(r => r.as.id === a.id).every(r => r.use === 'claude:claude-haiku-5-5') && x.ai.filter(r => r.as.id === b.id).every(r => r.use === undefined), 'each chat uses the AI chosen for it');
    assert.ok(!US.jobs.current, 'the editor is free again');
  } finally { x.restore(); }
});

test('the AI layer: a request can name whose it is and which AI answers; the choices on offer', () => {
  const cs = US.ai.choices();
  assert.strictEqual(cs[0].id, 'auto');
  assert.deepStrictEqual(US.ai.resolveUse('claude:claude-haiku-5-5').provider, US.ai.provider(), 'no key here: the usual AI (none) stands in');
  US.ai.setBudget(1, { id: 'chat-x' }); assert.strictEqual(US.ai.budgetLeft({ id: 'chat-x' }), 1); assert.strictEqual(US.ai.budgetLeft({ id: 'chat-y' }), null); US.ai.endBudget({ id: 'chat-x' });
  assert.strictEqual(US.ai.budgetLeft({ id: 'chat-x' }), null);
});
