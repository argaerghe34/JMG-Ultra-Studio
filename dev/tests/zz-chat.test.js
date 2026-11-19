// Ask – one chat for everything: what a step touches and when the editor is asked first; the AI's turns read; the rules
// and the brief it gets; then whole conversations with a scripted AI against a stand-in Premiere – what it understood
// and its plan shown, a question with answers, an edit on a copy (approved, a step unticked), a panel tool, the report;
// a step turned down; “don't ask”; changing the sequence itself always asks; the step limit; Stop; two chats at once
// taking turns in the editor; and that each chat's requests carry its own name and AI.
const assert = require('assert');
const { load, test } = require('./harness');
global.ResizeObserver = global.ResizeObserver || function () { return { observe() {} }; };
const US = load(['time', 'audio', 'dsp', 'transcript', 'ui', 'app', 'ai', 'js/tools/22-story-glossary.js', 'js/tools/22-story-board.js', 'js/tools/22-story-export.js', 'js/tools/22-story-timeline.js', 'js/tools/22-story-narrative.js', 'js/tools/22-story-moments.js', 'js/tools/22-story-ai.js', 'js/tools/22-story-context.js', 'js/tools/22-story-ask.js', 'js/tools/22-story-voices.js', 'js/tools/22-story.js', 'js/tools/14-footage.js', 'js/tools/36-quickfx.js', 'js/tools/40-assistant-chat.js', 'js/tools/41-edit.js']);
const C = US.chat;
C._tick = 2;

test('what a step touches, and when the editor is asked first', () => {
  for (const t of ['project', 'timeline', 'selection', 'bin', 'footage', 'search', 'lines', 'themes', 'ask', 'finish', 'open']) assert.strictEqual(C.riskOf(t, {}), 'read', t);
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
  // ask: everything that changes; own: only their own work and files; never: nothing; “Always proceed” covers everything but
  // stills leaving the computer (risky steps stop at a warning instead: zz-chat-safety.test.js)
  const grid = m => ['read', 'ai', 'new', 'own', 'out', 'sees'].map(r => C.asksFirst(r, m)).join();
  assert.strictEqual(grid('ask'), 'false,false,true,true,true,true');
  assert.strictEqual(grid('own'), 'false,false,false,true,true,true', 'stills leaving the computer are asked about like the editor’s own work');
  assert.strictEqual(grid('never'), 'false,false,false,false,false,false');
  assert.deepStrictEqual([C.asksFirst('new', 'ask', true), C.asksFirst('own', 'ask', true), C.asksFirst('out', 'ask', true), C.asksFirst('sees', 'ask', true)], [false, false, false, true]);
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
  assert.ok(/You don’t watch video or hear audio/.test(r) && /written descriptions Ultra Studio keeps of each clip/.test(r) && /Adobe Premiere Pro/.test(r));
  assert.ok(/- transition: /.test(r) && /- move: /.test(r) && /- silence\.cut \[silence\] – Cut the pauses \(changes the project\)\. Removes pauses\.\n    settings: minPause \(number\) = 0\.5: Shortest pause/.test(r), 'edits and panel tools listed');
  assert.ok(/"understood"/.test(r) && /call "ask"/.test(r) && /Never say something was done that a tool did not report/.test(r));
  const rr = C.rules({ resolve: true, actions: [], ops: { timeline: US.editAsk.opsFor('timeline', true, '21.0'), items: US.editAsk.opsFor('items', true, '21.0') } });
  assert.ok(/DaVinci Resolve/.test(rr) && !/- transition: /.test(rr));
  const r21 = C.rules({ resolve: true, actions: [], ops: { timeline: US.editAsk.opsFor('timeline', true, '21.2'), items: US.editAsk.opsFor('items', true, '21.2') } });
  assert.ok(/- transition: /.test(r21) && /- speed: /.test(r21) && !/- zoom: /.test(r21) && /add-ons can’t make keyframed zooms, text layers, cuts, trims, slides of a clip along the timeline or effect settings by name/.test(r21), 'Resolve 21.2: transitions and speed offered; keyframes, text and cuts said plainly');
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
    T('edit', { where: 'sequence', steps: [{ op: 'transition', targets: { tracks: ['V1'], every: 'cuts' }, params: { name: 'Cross Dissolve', at: 'start' }, why: 'the joins' }, { op: 'motion', targets: { tracks: ['V1'] }, params: { scale: 110 }, why: 'a little closer' }, { op: 'label', targets: { tracks: ['V1'] }, params: { label: 13 }, why: 'so you can see them' }, { op: 'teleport', targets: {}, params: {} }] }, 'Adding them on a copy.'),
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
    assert.deepStrictEqual([card.risk, card.steps.length, card.dropped.length], ['new', 2, 2]);
    assert.ok(card.dropped.some(d => /^label: Premiere can’t colour clips on a timeline from a script/.test(d)), 'colouring timeline clips isn’t offered in Premiere, and the card says why');
    assert.ok(/a copy of “My cut” \(yours stays as it is\)/.test(card.detail));
    const applied = x.host.filter(h => h[0] === 'editApply');
    assert.deepStrictEqual(applied.map(h => [h[1].seqId, h[1].op]), [['copy1', 'transition']], 'the unticked framing step didn’t run; the editor’s own sequence is untouched');
    assert.ok(/Cross Dissolve at the start · 1 clip on V1: 1 done/.test(res(2)) && /unticked 1 step/.test(res(2)) && /Left out: label: Premiere can’t colour clips on a timeline[^\n]*teleport/.test(res(2)) && /copy “My cut – Ask”, now your working sequence/.test(res(2)), res(2));
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

test('a step turned down doesn’t run and the AI is told (with what the editor said instead); “don’t ask” runs straight through; the sequence itself always stops at a warning first', async () => {
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
    const l3 = [], warned = [];
    await C.send(C.newChat(), 'half opacity on V1, in the sequence itself', Object.assign(hooksFor(l3), { warn: async w => { warned.push(w); return 'continue'; } }), { mode: 'own' });
    assert.ok(warned.length === 1 && warned[0].risk === 'own' && /“My cut” ITSELF – no copy/.test(warned[0].detail) && warned[0].reasons.some(r => r.id === 'inPlace'), 'a warning, not a card');
    assert.ok(!l3.some(i => i.k === 'approve?'));
    assert.ok(x.host.some(h => h[0] === 'editApply' && h[1].seqId === 'mine'));
    assert.deepStrictEqual(x.host.filter(h => h[0] === 'cloneSequence').map(h => h[1].name), ['My cut – before Ask'], 'the only copy is the one kept from before');
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
    assert.ok(/Stopped after 3 steps/.test(log[log.length - 1].text) && chat.status === 'idle' && /step limit/.test(chat.pendingResult));
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

test('spending: the chat keeps count and stops to ask at the limit – carry on (as much again), no limit for this chat, or stop; no limit set never asks', async () => {
  const reads = n => Array.from({ length: n }, () => T('project', {}, '', { usd: 0.4 })).concat([T('finish', { reply: 'Read it all.' }, '', { usd: 0.4 })]);
  // stop at the limit: $1 a request, 40¢ a turn → asked after the third turn
  let x = setup(reads(8));
  try {
    const log = [], asked = [], chat = C.newChat();
    await C.send(chat, 'read a lot', Object.assign(hooksFor(log), { limit: async l => { asked.push(l); return 'stop'; } }), { mode: 'never', budget: 1 });
    assert.strictEqual(asked.length, 1);
    assert.deepStrictEqual([asked[0].kind, asked[0].limit, Math.round(asked[0].used * 100), Math.round(asked[0].total * 100)], ['money', 1, 120, 120]);
    assert.ok(/Stopped at the spending limit for one request \(\$1\.00; this request used about \$1\.20\)/.test(log[log.length - 1].text), log[log.length - 1].text);
    assert.strictEqual(x.ai.length, 3, 'nothing more was sent');
    assert.ok(/spending limit/.test(chat.pendingResult));
  } finally { x.restore(); }
  // carry on: as much again each time it asks
  x = setup(reads(5));
  try {
    const log = [], asked = [], chat = C.newChat();
    await C.send(chat, 'read a lot', Object.assign(hooksFor(log), { limit: async l => { asked.push(l.limit); return 'more'; } }), { mode: 'never', budget: 1 });
    assert.deepStrictEqual(asked, [1, 2], 'asked at $1, then at $2');
    const end = log[log.length - 1];
    assert.ok(end.k === 'end' && Math.abs(end.spent - 2.4) < 1e-9 && Math.abs(end.total - 2.4) < 1e-9, 'it finished, and the report says what it cost');
  } finally { x.restore(); }
  // no limit for this chat: asked once, never again – in this request or the next
  x = setup(reads(6).concat(reads(4)));
  try {
    const log = [], asked = [], chat = C.newChat();
    const hooks = Object.assign(hooksFor(log), { limit: async l => { asked.push(l.kind); return 'free'; } });
    await C.send(chat, 'read a lot', hooks, { mode: 'never', budget: 1, maxSteps: 4 });
    await C.send(chat, 'and again', hooks, { mode: 'never', budget: 1, maxSteps: 4 });
    assert.deepStrictEqual(asked, ['money'], 'once');
    assert.strictEqual(log.filter(i => i.k === 'end').length, 2);
    assert.ok(Math.abs(chat.spent - 4.8) < 1e-9, 'the chat’s running total: ' + chat.spent);
  } finally { x.restore(); }
  // budget 0 = no spending limit; the step limit asks the same way
  x = setup(reads(5));
  try {
    const log = [], asked = [], chat = C.newChat();
    await C.send(chat, 'read a lot', Object.assign(hooksFor(log), { limit: async l => { asked.push(l.kind); return 'more'; } }), { mode: 'never', budget: 0, maxSteps: 4 });
    assert.deepStrictEqual(asked, ['steps']);
    assert.strictEqual(log[log.length - 1].k, 'end');
    assert.strictEqual(US.ai.budgetLeft({ id: chat.id }), null, 'its account with the AI layer is closed afterwards');
  } finally { x.restore(); }
});

test('a cut from a goal, in the chat: search → read lines → build a new sequence (asked first) → keep a version → report', async () => {
  const x = setup([
    T('search', { query: 'bakery oven', limit: 10 }, 'Searching.', { understood: 'A short film about the bakery.', plan: ['Find the lines', 'Build it'] }),
    T('lines', { ids: ['r1', 'zz'], around: 1 }),
    T('themes', {}),
    T('build', { name: 'Bakery', sections: [{ name: 'Then', lineIds: ['r1', 'nope'] }], targetSeconds: 60 }),
    T('version', { name: 'v1' }),
    T('finish', { reply: 'A short cut about the bakery.' })]);
  const was = US.story.buildSequence; let built = null;
  US.story.buildSequence = async (j, o) => { built = o; return { seq: { id: 'built', name: o.name }, seconds: 3.4, placed: 1, summary: `Built “${o.name}” · 1 line · 0:03` }; };
  try {
    const log = [], chat = C.newChat();
    await C.send(chat, 'a short film about the bakery', hooksFor(log), { mode: 'ask' });
    const res = i => x.ai[i + 1].turns[i].user;
    assert.ok(/r1\tRuth interview\tRuth\t0:00–0:03\tThe bakery oven/.test(res(0)), res(0));
    assert.ok(/>r1\t/.test(res(1)) && /zz: no such line/.test(res(1)));
    assert.ok(/No themes yet/.test(res(2)));
    assert.deepStrictEqual([built.name, built.target, built.groups.map(g => [g.name, g.lineIds])], ['Ask – Bakery', 0, [['Then', ['r1']]]], 'every line the AI chose is used: nothing is dropped to fit a length');
    assert.ok(/SHORTER than the 1:00 asked for – build again with more lines/.test(res(3)), res(3));
    assert.ok(/Built “Ask – Bakery”/.test(res(3)) && /1 unknown line ids were left out/.test(res(3)));
    const cards = log.filter(i => i.k === 'approve?').map(i => [i.card.risk, i.card.title]);
    assert.deepStrictEqual(cards.map(c => c[0]), ['new', 'new'], 'building and keeping a version make new things: asked first');
    assert.ok(/A new sequence “Ask – Bakery” from 1 line/.test(log.find(i => i.k === 'approve?').card.detail));
    assert.ok(x.host.some(h => h[0] === 'cloneSequence' && h[1].seqId === 'built' && h[1].binPath === 'JMG Ultra Studio/Ask/Versions'));
    assert.deepStrictEqual(chat.versions.map(v => v.why), ['built from the interviews', 'kept as a version']);
    assert.ok(!US.agent && !US.tools.get('agent') && !US.actions.get('agent.run'), 'there is no Agent any more');
  } finally { US.story.buildSequence = was; x.restore(); }
});

test('what’s in the picture: the chat reads the kept descriptions (free), says what isn’t described yet, and looks at stills only after a card – refused plainly when stills may not leave', async () => {
  const F = US.footage, was = { lookOf: F.lookOf, list: F.listClips, grab: F.grab, looker: F.looker, stillsOn: null };
  const CLIPS = [{ id: 'it1', name: 'DJI_001.MP4', kind: 'video', path: '/m/DJI_001.MP4', bin: 'Drone', duration: 20 }, { id: 'it2', name: 'A001.MP4', kind: 'video', path: '/m/A001.MP4', bin: 'Drone', duration: 5 }, { id: 'it3', name: 'A002.MP4', kind: 'video', path: '/m/A002.MP4', bin: 'Drone', duration: 5 }];
  const LOOKS = { it1: { description: 'A drone shot flying over a wide river at sunset.', shot: 'aerial', setting: 'a river valley', people: 'no one', action: 'the camera flies forward', text: '', tags: ['river', 'water', 'sunset', 'drone'] }, it2: { description: 'A baker kneads dough on a floury table.', shot: 'close-up', setting: 'a bakery kitchen', people: 'one woman', action: 'kneading', text: 'COHEN’S BAKERY', tags: ['bread', 'hands', 'flour'] } };
  const x = setup([
    T('footage', { query: 'water', bin: 'Drone' }, 'Looking through the descriptions.', { understood: 'You want shots with water.', plan: ['Find them'] }),
    T('look', { clips: ['i2', 'A002.MP4'], bin: 'Drone', question: 'Is the bakery’s name readable?', stills: 1 }),
    T('finish', { reply: 'One river shot; the sign is readable in A001.' }),
    T('look', { clips: ['i2'], bin: 'Drone', question: 'again?' }), T('finish', { reply: 'Not allowed.' })]);
  const hostWas = US.host.call, sentStills = [];
  US.host.call = async (fn, a) => (fn === 'listBins' ? [{ id: 'root', path: '(Project root)' }, { id: 'b1', path: 'Drone' }] : fn === 'binItems' ? CLIPS : hostWas(fn, a));
  F.lookOf = it => LOOKS[it.id] || null;
  F.grab = async (it, times) => ({ stills: times.map(t => ({ t, data: 'QUJD', w: 768, h: 432 })), how: 'panel' });
  let allowed = true;
  US.secrets.set('anthropicKey', 'sk-test');   // a Claude key: the cheapest Claude model does the looking
  const aiWas = US.ai, realJson = US.ai.json;
  US.ai = Object.assign({}, US.ai, { stillsOn: () => allowed, json: async req => (req.feature === 'Look at footage' ? (sentStills.push(req), req.onUsage && req.onUsage({ usd: 0.002 }), { answer: 'Yes – “COHEN’S BAKERY” is clear in A001; A002 shows no sign.' }) : realJson(req)) });
  try {
    const log = [], chat = C.newChat();
    await C.send(chat, 'which shots have water in them?', hooksFor(log), { mode: 'own' });
    const res = i => x.ai[i + 1].turns[i].user;
    assert.ok(/1 clips \(id, name, shot/.test(res(0)) && /i1\tDJI_001\.MP4\taerial\tA drone shot flying over a wide river/.test(res(0)), res(0));
    assert.ok(/1 of 3 clips here have no description yet \(describing them would cost about/.test(res(0)) && /footage\.describe with bin "Drone"/.test(res(0)));
    const card = log.find(i => i.k === 'approve?').card;
    assert.strictEqual(card.risk, 'sees');
    assert.ok(/Small stills \(768 pixels wide\) will be sent to Claude Haiku 5\.5: up to 1 still each of “A001\.MP4”, “A002\.MP4”/.test(card.detail) && /No video or sound is sent/.test(card.detail), card.detail);
    assert.strictEqual(sentStills.length, 1);
    assert.deepStrictEqual(sentStills[0].user.filter(b => b.image).map(b => b.image.note), ['A001.MP4 at 0:02', 'A002.MP4 at 0:02']);
    assert.strictEqual(sentStills[0].use, 'claude:claude-haiku-5-5');
    assert.ok(/From 2 stills \(Claude Haiku 5\.5\): Yes/.test(res(1)));
    assert.ok(Math.abs(chat.spent - (0.03 + 0.002)) < 1e-9, 'the stills’ cost is on the chat’s account: ' + chat.spent);
    // not switched on for this project: nothing is grabbed or sent, and the AI is told what the editor must do
    allowed = false;
    await C.send(chat, 'look again', hooksFor(log), { mode: 'never' });
    const last = x.ai[x.ai.length - 1].turns;
    assert.ok(/Not possible yet: Stills from this project aren’t allowed to leave this computer\. Tell the editor: Settings › AI › Footage/.test(last[last.length - 1].user), last[last.length - 1].user);
    assert.strictEqual(sentStills.length, 1, 'nothing more was sent');
  } finally { US.secrets.set('anthropicKey', ''); US.ai = aiWas; US.host.call = hostWas; Object.assign(F, { lookOf: was.lookOf, listClips: was.list, grab: was.grab, looker: was.looker }); x.restore(); }
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
