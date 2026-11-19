// Ask's chat – safety and showing its work: the risk check (one function), Always proceed, the warning before a risky
// step with Continue / Change course (the plan pauses), the journal of what each step made and Undo for a reply or for
// everything (asking before deleting something changed since), the working row's words, “behind the scenes”, a persona
// on the same engine (Producer), and the hook for watching footage.
const assert = require('assert');
const { load, test } = require('./harness');
global.ResizeObserver = global.ResizeObserver || function () { return { observe() {} }; };
global.addEventListener = global.addEventListener || (() => {});
const US = load(['time', 'audio', 'dsp', 'transcript', 'ui', 'app', 'ai', 'js/tools/11-audio-kit.js', 'js/tools/22-story-glossary.js', 'js/tools/22-story-board.js', 'js/tools/22-story-export.js', 'js/tools/22-story-timeline.js', 'js/tools/22-story-narrative.js', 'js/tools/22-story-moments.js', 'js/tools/22-story-ai.js', 'js/tools/22-story-context.js', 'js/tools/22-story-ask.js', 'js/tools/22-story-voices.js', 'js/tools/22-story.js', 'js/tools/14-footage.js', 'js/tools/36-quickfx.js', 'js/tools/37-producer.js', 'js/tools/40-assistant-chat.js', 'js/tools/41-edit.js']);
const C = US.chat;
C._tick = 2;

test('the risk check: which steps stop and warn whatever the editor chose – and which don’t', () => {
  const ids = (tool, args, info) => C.dangerOf(tool, args, info).reasons.map(r => r.id).join();
  // on a copy, reading, building: not risky
  assert.strictEqual(ids('edit', { where: 'sequence', steps: [{ op: 'remove', targets: [{}, {}] }] }), '', 'deleting on a copy is fine');
  assert.strictEqual(ids('timeline', {}), '');
  assert.strictEqual(ids('build', { name: 'x' }), '');
  assert.strictEqual(ids('action', { id: 'silence.cut' }, { action: { changes: true } }), '');
  assert.strictEqual(ids('edit', { where: 'bin', bin: 'Drone', steps: [{ op: 'label', targets: [{}, {}] }] }), '', 'a few labels in a bin can be undone');
  // the sequence itself, not a copy
  assert.strictEqual(ids('edit', { where: 'sequence', inPlace: true, steps: [{ op: 'opacity', targets: [{}] }] }, { seqName: 'My cut' }), 'inPlace,noUndo');
  assert.ok(/“My cut” itself, not a copy/.test(C.dangerOf('edit', { where: 'sequence', inPlace: true, steps: [] }, { seqName: 'My cut' }).reasons[0].text));
  assert.strictEqual(ids('edit', { where: 'sequence', inPlace: true, steps: [{ op: 'opacity', targets: [{}] }] }, { mine: true }), '', 'a copy this chat made is its own to change');
  // deleting from the editor's own sequence
  assert.strictEqual(ids('edit', { where: 'sequence', inPlace: true, steps: [{ op: 'remove', targets: [{}] }] }), 'inPlace,deletes,noUndo');
  // other sequences themselves; many at once
  assert.strictEqual(ids('edit', { where: 'sequence', steps: [{ op: 'append', targets: [{}, {}] }] }), 'inPlace');
  assert.strictEqual(ids('edit', { where: 'sequence', steps: [{ op: 'transition', multi: true, perSeq: Array.from({ length: 6 }, () => ({ targets: [{}] })) }] }), 'inPlace,many,noUndo');
  assert.strictEqual(ids('edit', { where: 'project', steps: [{ op: 'rename', targets: Array.from({ length: 151 }, () => ({})) }] }), 'many');
  assert.strictEqual(ids('edit', { where: 'project', steps: [{ op: 'rename', targets: Array.from({ length: 150 }, () => ({})) }] }), '');
  // panel tools: deleting, heavy work, files
  assert.strictEqual(ids('action', { id: 'tidy.removeUnused' }, { action: { changes: true } }), 'deletes,noUndo');
  assert.strictEqual(ids('action', { id: 'deliver.pack' }, { action: { changes: true } }), 'heavy,noUndo');
  assert.strictEqual(ids('action', { id: 'footage.describe' }, { action: { changes: true } }), 'heavy');
  assert.strictEqual(ids('action', { id: 'overnight.run' }, { action: {} }), 'heavy,noUndo');
  assert.strictEqual(ids('action', { id: 'markers.beats' }, { action: { changes: true, heavy: true, deletes: true, sendsFootage: true } }), 'deletes,heavy,footage', 'a tool can say so itself');
  assert.strictEqual(ids('action', { id: 'deliver.chapters' }, { action: {} }), '');
  // footage leaving the computer; a costly step
  assert.strictEqual(ids('look', {}, { cloud: true, label: 'Claude' }), 'footage');
  assert.strictEqual(ids('look', {}, { cloud: false }), '');
  assert.strictEqual(ids('watch', {}, { cloud: true }), 'footage');
  assert.strictEqual(ids('interviews', {}, { estimateUsd: 1.2 }), 'spend');
  assert.strictEqual(ids('interviews', {}, { estimateUsd: 1.2, limits: { spend: 2 } }), '');
  assert.strictEqual(C.dangerOf('build', {}).risky, false);
  // Always proceed: nothing is asked by card except stills leaving; “don’t ask” as before
  const grid = (m, always) => ['read', 'ai', 'new', 'own', 'out', 'sees'].map(r => C.asksFirst(r, m, always)).join();
  assert.strictEqual(grid('ask', true), 'false,false,false,false,false,true');
  assert.strictEqual(grid('own', true), 'false,false,false,false,false,true');
  assert.strictEqual(grid('never', true), 'false,false,false,false,false,false');
});

test('the working row’s words, and a step’s arguments in plain words', () => {
  const c = C.newChat();
  assert.strictEqual(C.workingLine(c), '', 'nothing while idle');
  c.status = 'thinking'; c.phase = { kind: 'planning' }; c.usedModel = 'Claude Opus';
  assert.strictEqual(C.workingLine(c), 'Planning · Claude Opus is reading your request');
  c.phase = { kind: 'thinking' };
  assert.strictEqual(C.workingLine(c), 'Thinking · Claude Opus is working out the next step');
  c.status = 'working'; c.phase = { kind: 'running', n: 2, of: 5, name: 'Read “My cut”' };
  assert.strictEqual(C.workingLine(c), 'Running step 2 of 5 · Read “My cut”');
  c.phase = { kind: 'running', n: 4, of: 3, name: 'Check the cut' };
  assert.strictEqual(C.workingLine(c), 'Running step 4 · Check the cut', 'past the plan’s length: no “of”');
  c.phase = { kind: 'checking', n: 3, of: 5, name: 'Read “My cut – Ask”' };
  assert.strictEqual(C.workingLine(c), 'Checking step 3 of 5 · Read “My cut – Ask”');
  c.status = 'asking';
  assert.strictEqual(C.workingLine(c), 'Waiting for you');
  c.status = 'waiting'; c.waitingFor = 'Silence Cut';
  assert.strictEqual(C.workingLine(c), 'Waiting its turn – “Silence Cut” is running');
  const a = C.describeArgs('edit', { where: 'sequence', sequence: 's2', inPlace: false, steps: [{ op: 'transition', targets: { tracks: ['V1'], every: 'cuts' }, params: { name: 'Cross Dissolve', frames: 12 }, why: 'the joins' }] });
  assert.strictEqual(a[0], 'on “s2” – on a copy');
  assert.ok(/^1\. .*name “Cross Dissolve”, frames 12 · which clips: tracks “V1”, every “cuts” \(the joins\)$/.test(a[1]), a[1]);
  assert.deepStrictEqual(C.describeArgs('search', { query: 'the bakery', limit: 10, speaker: '' }), ['query: “the bakery”', 'limit: 10']);
  assert.deepStrictEqual(C.describeArgs('action', { id: 'silence.cut', params: { minPause: 0.5 } }), ['panel tool: silence.cut', 'settings: min pause 0.5']);
  assert.deepStrictEqual(C.describeArgs('build', { name: 'Opening', sections: [{ name: 'A', lineIds: ['r1', 'r2'] }], targetSeconds: 90 }), ['name “Opening”', 'section “A”: 2 lines', 'aiming for 1:30']);
});

/* ---------- whole conversations against a stand-in Premiere that keeps sequences, bins and markers ---------- */
const clip = (start, end, name) => ({ start, end, in: 0, out: end - start, name, path: '/m/' + name, itemId: 'it-' + name, disabled: false, effects: [], label: 3 });
function setup(answers) {
  US.story._useState({ transcripts: [{ key: 'r', name: 'Ruth interview', lines: [{ id: 'r1', start: 0, end: 3, speaker: 'Speaker 1', text: 'The bakery oven was the warmest place on the street.' }] }], speakers: { 'Speaker 1': { name: 'Ruth' } }, themes: [] });
  const host = [], ai = [];
  const was = { call: US.host.call, ai: US.ai, ctx: US.ctx, refresh: US.refreshContext, toast: US.ui.toast };
  const P = { seqs: [{ id: 'mine', name: 'My cut' }, { id: 'other', name: 'Teaser' }], bins: ['Interviews'], stamp: {}, marks: { mine: ['g0'] }, labels: {}, open: { id: 'mine', name: 'My cut' } };
  const nameOf = id => (P.seqs.find(x => x.id === id) || {}).name || id;
  US.ctx = { project: { name: 'Bakery film' }, sequence: P.open, selection: 0 };
  US.refreshContext = async () => { US.ctx = Object.assign({}, US.ctx, { sequence: P.open }); };
  US.ui.toast = () => {};
  let n = 0;
  US.host.call = async (fn, a) => {
    host.push([fn, a]);
    if (fn === 'editRead' || fn === 'sequenceInfo') return { id: a.seqId, name: nameOf(a.seqId), fps: 25, duration: 14, markers: [], video: [{ index: 0, clips: [clip(0, 6, 'RUTH.MP4'), clip(6, 14, 'SAM.MP4')] }], audio: [{ index: 0, clips: [clip(0, 6, 'RUTH.MP4'), clip(6, 14, 'SAM.MP4')] }] };
    if (fn === 'editProject') return { bins: P.bins.slice(), sequences: P.seqs.map(x => ({ id: x.id, name: x.name, bin: '', duration: 14, video: 1, audio: 1 })), clips: [{ id: 'x1', name: 'DJI_001.MP4', bin: 'Drone', kind: 'video' }] };
    if (fn === 'listSequences') return P.seqs.map(x => ({ id: x.id, name: x.name }));
    if (fn === 'listBins') return [{ id: 'root', path: '(Project root)' }].concat(P.bins.map((b, i) => ({ id: 'b' + i, path: b })));
    if (fn === 'binItems') return [{ id: 'x1', name: 'DJI_001.MP4', kind: 'video', bin: 'Interviews', label: 3 }, { id: 'x2', name: 'DJI_002.MP4', kind: 'video', bin: 'Interviews', label: 3 }];
    if (fn === 'setLabels') { for (const it of a.items) P.labels[it.id] = it.label; return a.items.length; }
    if (fn === 'cloneSequence') { const id = 'copy' + (++n); P.seqs.push({ id, name: a.name }); const bin = String(a.binPath || '').split('/').join(' / '); if (bin && !P.bins.includes(bin)) P.bins.push(bin); P.open = { id, name: a.name }; return { id, name: a.name }; }
    if (fn === 'askStamp') return a.seqIds.map(id => (P.seqs.some(x => x.id === id) ? Object.assign({ id, name: nameOf(id), duration: 14, clips: 4, markers: (P.marks[id] || []).length, guids: (P.marks[id] || []).slice() }, P.stamp[id] || {}) : { id, missing: true }));
    if (fn === 'addSequenceMarkers') { const g = a.markers.map((m, i) => 'g' + (P.marks[a.seqId] || []).length + i); P.marks[a.seqId] = (P.marks[a.seqId] || []).concat(g); return g; }
    if (fn === 'removeSequenceMarkers') { P.marks[a.seqId] = (P.marks[a.seqId] || []).filter(g => !a.guids.includes(g)); return a.guids.length; }
    if (fn === 'deleteSequence') { P.seqs = P.seqs.filter(x => x.id !== a.seqId); return true; }
    if (fn === 'askRemoveBins') { const removed = [], kept = []; for (const p of a.paths) { if (/Versions/.test(p) && P.keepBin) kept.push({ path: p, why: 'not empty' }); else { P.bins = P.bins.filter(b => b !== p); removed.push(p); } } return { removed, kept }; }
    if (fn === 'editApply') return { done: a.targets.length, skipped: [], log: [] };
    if (fn === 'openSequence') { P.open = { id: a.seqId, name: nameOf(a.seqId) }; return true; }
    return {};
  };
  const list = answers.slice();
  US.ai = Object.assign({}, was.ai, { available: () => true, label: () => 'Claude', provider: () => 'claude', fmtUSD: x => '$' + x.toFixed(2),
    json: async req => { ai.push(JSON.parse(JSON.stringify(Object.assign({}, req, { onUsage: undefined })))); const x = list.shift(); if (!x) throw new Error('no more scripted answers'); if (req.onUsage) req.onUsage({ usd: 0.01, name: 'Claude Opus 5.5', tokensIn: 1200, tokensOut: 80 }); return x; } });
  return { host, ai, P, restore: () => { US.host.call = was.call; US.ai = was.ai; US.ctx = was.ctx; US.refreshContext = was.refresh; US.ui.toast = was.toast; } };
}
const T = (tool, args = {}, say = '', extra = {}) => Object.assign({ say, understood: '', plan: [], tool, argsJson: JSON.stringify(args) }, extra);
const hooksFor = (log, o = {}) => ({ event: it => log.push(it), trace: t => log.push({ k: 'trace', t }), approve: async card => { log.push({ k: 'approve?', card }); return o.approve ? o.approve(card) : { ok: true }; }, choose: async q => (o.choose ? o.choose(q) : null), warn: async w => { log.push({ k: 'warn?', w }); return o.warn ? o.warn(w) : 'continue'; } });
const EDIT = (extra = {}) => T('edit', Object.assign({ where: 'sequence', steps: [{ op: 'opacity', targets: { tracks: ['V1'] }, params: { value: 50 } }] }, extra), 'Editing.');

test('Always proceed: chosen on a card, later steps in that chat run without one – in a new chat they ask again', async () => {
  const x = setup([EDIT(), T('version', { name: 'v1' }), T('edit', { where: 'bin', bin: 'Interviews', steps: [{ op: 'label', targets: {}, params: { label: 13 } }] }), T('finish', { reply: 'Done.' }), EDIT(), T('finish', { reply: 'Done again.' })]);
  try {
    const log = [], chat = C.newChat();
    await C.send(chat, 'half opacity, keep a version, colour the interviews', hooksFor(log, { approve: async () => ({ ok: true, always: true }) }), { mode: 'ask' });
    assert.strictEqual(log.filter(i => i.k === 'approve?').length, 1, 'asked once; “Always proceed” covered the version and the change to their own clips');
    assert.strictEqual(chat.always, true);
    assert.deepStrictEqual(x.P.labels, { x1: 13, x2: 13 });
    assert.ok(!log.some(i => i.k === 'warn?'), 'nothing here was risky');
    const l2 = [], other = C.newChat();
    await C.send(other, 'half opacity', hooksFor(l2), { mode: 'ask' });
    assert.strictEqual(l2.filter(i => i.k === 'approve?').length, 1, 'it is remembered for that chat only');
    assert.strictEqual(C.fromStored(C.toStored(chat)).always, false, 'and not kept after the chat is closed');
  } finally { x.restore(); }
});

test('a risky step warns even with Always proceed or “don’t ask”: Continue runs it (a copy from before is kept); Change course pauses the plan and tells the AI', async () => {
  let x = setup([T('timeline', {}, 'Reading.'), EDIT({ inPlace: true }), T('finish', { reply: 'Done.' })]);
  try {
    const log = [], chat = C.newChat({ always: true });
    await C.send(chat, 'half opacity on V1 in the sequence itself', hooksFor(log), { mode: 'never' });
    const w = log.find(i => i.k === 'warn?').w;
    assert.deepStrictEqual(w.reasons.map(r => r.id), ['inPlace', 'noUndo']);
    assert.ok(/“My cut” itself/.test(w.reasons[0].text) && /copy from before is kept/.test(w.reasons[1].text));
    assert.ok(w.sofar.length === 1 && /^Read the sequence → “My cut”/.test(w.sofar[0]), 'what has happened so far: ' + w.sofar.join('|'));
    assert.ok(!log.some(i => i.k === 'approve?'), 'Continue at the warning is the approval');
    const clone = x.host.find(h => h[0] === 'cloneSequence');
    assert.deepStrictEqual([clone[1].seqId, clone[1].name, clone[1].binPath], ['mine', 'My cut – before Ask', 'JMG Ultra Studio/Ask/Before'], 'a copy from before the change');
    assert.ok(x.host.some(h => h[0] === 'editApply' && h[1].seqId === 'mine'), 'the edit ran in the sequence itself');
    const plan = C.undoPlan(chat);
    assert.strictEqual(plan.can.length, 0, 'the copy from before is never offered for deletion');
    assert.ok(plan.cant.length === 1 && /“My cut” was changed itself/.test(plan.cant[0].text) && /kept as “My cut – before Ask”/.test(plan.cant[0].text), 'and Undo says plainly what it can’t do');
  } finally { x.restore(); }
  x = setup([EDIT({ inPlace: true }), T('finish', { reply: 'Left alone.' }, '', { understood: 'You want it on a copy instead.' })]);
  try {
    const log = [], chat = C.newChat();
    await C.send(chat, 'half opacity in the sequence itself', hooksFor(log, { warn: async () => 'change' }), { mode: 'ask' });
    assert.ok(!x.host.some(h => h[0] === 'editApply' || h[0] === 'cloneSequence'), 'nothing ran');
    const p = log.find(i => i.k === 'paused');
    assert.ok(p && /Paused before “Edit the sequence itself/.test(p.text) && !log.some(i => i.k === 'end') && chat.status === 'idle');
    assert.ok(/PAUSED your plan at the step/.test(chat.pendingResult) && /did NOT run/.test(chat.pendingResult));
    assert.strictEqual(x.ai.length, 1, 'the AI isn’t asked again until the editor says something');
    await C.send(chat, 'do it on a copy instead', hooksFor(log), { mode: 'never' });
    const last = x.ai[x.ai.length - 1].turns;
    assert.ok(/PAUSED your plan/.test(last[last.length - 1].user) && /The editor says: “do it on a copy instead”/.test(last[last.length - 1].user));
  } finally { x.restore(); }
});

test('the journal and Undo: what each reply made is taken back – one reply or everything; a sequence changed since is asked about; what can’t be undone is said', async () => {
  const x = setup([EDIT(), T('version', { name: 'v1' }), T('finish', { reply: 'Half opacity on a copy, and a version kept.' }),
    T('edit', { where: 'bin', bin: 'Interviews', steps: [{ op: 'label', targets: {}, params: { label: 13 } }] }), T('finish', { reply: 'Coloured.' })]);
  try {
    const log = [], chat = C.newChat();
    await C.send(chat, 'half opacity and keep a version', hooksFor(log), { mode: 'never' });
    await C.send(chat, 'colour the interviews green', hooksFor(log), { mode: 'never' });
    const J = chat.journal.map(j => `${j.turn}:${j.kind}:${j.name || j.path || ''}`);
    assert.deepStrictEqual(J, ['1:seq:My cut – Ask', '1:bin:JMG Ultra Studio / Ask', '1:seq:My cut – Ask – v1', '1:bin:JMG Ultra Studio / Ask / Versions', '2:items:'], J.join(' | '));
    assert.deepStrictEqual(chat.journal[0].stamp, { duration: 14, clips: 4, markers: 0 }, 'noted as it was when the AI left it');
    assert.deepStrictEqual(chat.origin, { seqId: 'mine', name: 'My cut' });
    const ends = log.filter(i => i.k === 'end');
    assert.deepStrictEqual(ends.map(e => e.turn), [1, 2]);
    // one reply: only the labels go back
    assert.deepStrictEqual(C.undoPlan(chat, { turn: 2 }).can.map(c => c.text), ['Put labels, names and bins back as they were']);
    let res = await C.undo(chat, { turn: 2 });
    assert.deepStrictEqual(x.P.labels, { x1: 3, x2: 3 });
    assert.deepStrictEqual([res.undone.length, res.kept.length, res.failed.length], [1, 0, 0]);
    assert.strictEqual(x.P.seqs.length, 4, 'the first reply’s sequences are still there');
    // everything: the editor has changed the copy since → asked; “keep” leaves it and its bin, the version goes
    x.P.stamp.copy1 = { clips: 6 }; x.P.keepBin = false;
    const asked = [];
    assert.deepStrictEqual(C.undoPlan(chat).can.map(c => c.entry.kind), ['bin', 'seq', 'bin', 'seq'], 'newest first');
    res = await C.undo(chat, { confirm: async entries => { asked.push(entries.map(e => e.name)); return 'keep'; } });
    assert.deepStrictEqual(asked, [['My cut – Ask']], 'never deleted without asking once it has been changed');
    assert.deepStrictEqual(x.P.seqs.map(s => s.id), ['mine', 'other', 'copy1']);
    assert.ok(res.kept.some(k => /“My cut – Ask” stays – you’ve changed it since/.test(k)) && res.undone.some(u => /Deleted the sequence “My cut – Ask – v1”/.test(u)));
    assert.deepStrictEqual(x.P.open, { id: 'mine', name: 'My cut' }, 'back in the sequence that was open');
    assert.ok(/The editor pressed Undo for everything you did in this chat/.test(chat.pendingResult) && /read again/.test(chat.pendingResult));
    assert.strictEqual(chat.versions.length, 1);
    // again, this time “delete anyway”: it goes, and the chat has no working sequence
    res = await C.undo(chat, { confirm: async () => 'delete' });
    assert.deepStrictEqual(x.P.seqs.map(s => s.id), ['mine', 'other']);
    assert.strictEqual(chat.work, null);
    assert.deepStrictEqual(C.undoPlan(chat), { can: [], cant: [] }, 'nothing left to undo');
    assert.ok(x.host.filter(h => h[0] === 'deleteSequence').every(h => /^copy/.test(h[1].seqId)), 'only sequences the AI made were ever deleted');
    // kept with the project, without the live parts
    const s = C.toStored(chat);
    assert.ok(s.journal.length === 5 && s.journal.every(j => j.undone) && s.requests === 2 && JSON.stringify(s).length < 30000);
  } finally { x.restore(); }
});

test('markers a panel tool puts on the open sequence are journalled and taken off again; exported files are named as staying', async () => {
  const mark = { id: 'markers.test', tool: 'markers', title: 'Mark the beats', changes: true, params: {}, run: async () => { await US.host.call('addSequenceMarkers', { seqId: 'mine', markers: [{ start: 1 }, { start: 2 }] }); return { summary: '2 markers' }; } };
  const exp = { id: 'deliver.test', tool: 'deliver', title: 'Export it', changes: true, params: {}, run: async () => ({ summary: 'Exported', file: '/out/Film.mp4' }) };
  const was = [US.actions.get(mark.id), US.actions.get(exp.id)]; US.actions.register(mark); US.actions.register(exp);
  const x = setup([T('action', { id: 'markers.test' }), T('action', { id: 'deliver.test' }), T('finish', { reply: 'Marked and exported.' })]);
  try {
    const log = [], chat = C.newChat();
    await C.send(chat, 'mark the beats and export', hooksFor(log), { mode: 'never' });
    assert.deepStrictEqual(log.filter(i => i.k === 'warn?').map(i => i.w.reasons.map(r => r.id).join()), ['heavy,noUndo'], 'the export warned; the markers didn’t');
    const m = chat.journal.find(j => j.kind === 'markers');
    assert.deepStrictEqual([m.seqId, m.guids.length], ['mine', 2]);
    const plan = C.undoPlan(chat);
    assert.deepStrictEqual(plan.can.map(c => c.text), ['Take 2 markers off “My cut”']);
    assert.deepStrictEqual(plan.cant.map(c => c.text), ['The file “Film.mp4” stays on the disk']);
    const res = await C.undo(chat);
    assert.deepStrictEqual(x.P.marks.mine, ['g0'], 'the editor’s own marker is still there');
    assert.deepStrictEqual(res.cant, ['The file “Film.mp4” stays on the disk']);
  } finally { x.restore(); was.forEach(a => a && US.actions.register(a)); }
});

test('behind the scenes: every reading, plan, call with its arguments, result, question, retry and the AI’s tokens and cost – live, and kept with the reply', async () => {
  const x = setup([T('ask', { question: 'Which track?', options: ['V1', 'V2'], kind: 'choice' }, '', { understood: 'You want V1 faded.', plan: ['Ask which track', 'Edit', 'Check'] }), T('fly', {}), EDIT(), T('timeline', {}, 'Checking.'), T('finish', { reply: 'Done.' })]);
  try {
    const log = [], chat = C.newChat(), phases = [];
    const hooks = hooksFor(log, { choose: async () => 'V1' });
    hooks.status = c => { if (c.phase && c.phase.kind) phases.push(C.workingLine(c)); };
    await C.send(chat, 'half opacity', hooks, { mode: 'never' });
    const end = log.find(i => i.k === 'end'), kinds = end.trace.map(t => t.kind);
    assert.deepStrictEqual(kinds, ['read', 'ai', 'plan', 'plan', 'ask', 'ask', 'ai', 'retry', 'ai', 'call', 'result', 'ai', 'check', 'result', 'ai', 'report'], kinds.join());
    assert.deepStrictEqual(log.filter(i => i.k === 'trace').map(i => i.t.kind), kinds, 'the same lines arrive live');
    const by = k => end.trace.filter(t => t.kind === k);
    assert.ok(/1\. Ask which track\n2\. Edit\n3\. Check/.test(by('plan')[1].detail));
    assert.ok(/Asked you: “Which track\?”/.test(by('ask')[0].text) && /Answers offered: V1 · V2/.test(by('ask')[0].detail) && /You answered: “V1”/.test(by('ask')[1].text));
    assert.ok(/1,200 tokens read, 80 written · about \$0\.01/.test(by('ai')[0].detail) && /Claude Opus 5\.5 answered/.test(by('ai')[0].text));
    assert.ok(/no tool “fly”/.test(by('retry')[0].detail));
    assert.ok(/^Edit the sequence/.test(by('call')[0].text) && /on a copy/.test(by('call')[0].detail) && /value 50 · which clips: tracks “V1”/.test(by('call')[0].detail), by('call')[0].detail);
    assert.ok(/^Checking: Read the sequence/.test(by('check')[0].text), 'reading back after a change is the check');
    assert.deepStrictEqual([end.tokensIn, end.tokensOut, end.model, end.steps], [6000, 400, 'Claude Opus 5.5', 5]);
    assert.ok(phases.includes('Planning · Claude is reading your request') && phases.some(p => /^Running step 1 of 3 · Edit the sequence/.test(p)) && phases.some(p => /^Checking step 2 of 3 · Read the sequence/.test(p)), phases.join(' | '));
    assert.strictEqual(chat.phase, null);
    const kept = C.toStored(chat).items.find(i => i.k === 'end');
    assert.ok(kept.trace.length === end.trace.length && kept.trace.every(t => t.text.length <= 201 && t.detail.length <= 301), 'kept short with the project');
  } finally { x.restore(); }
});

test('a persona is the same engine with another manner and its own tools: Producer has everything Ask has, plus notes, pick-ups and markers', async () => {
  const P = US.chatPersonas.producer;
  assert.ok(P && P === C.personaOf('producer') && C.personaOf('nobody') === null);
  const tools = C.toolsHere(P), names = Object.keys(tools);
  for (const t of Object.keys(C.TOOLS)) assert.ok(names.includes(t), `Producer has Ask’s “${t}”`);
  assert.deepStrictEqual(names.slice(-4), ['notes', 'pickups', 'marknotes', 'finish'], 'its own tools, with finish last');
  const r = C.rules({ resolve: false, actions: [], ops: { timeline: [], items: [] }, tools, persona: P });
  assert.ok(/^YOUR ROLE HERE: you are the Producer/.test(r) && /Be proactive/.test(r) && /propose what to do next/.test(r) && /- notes: A producer’s notes on a cut/.test(r) && /- edit: Change clips/.test(r) && /PANEL TOOLS/.test(r));
  assert.ok(!/YOUR ROLE HERE/.test(C.rules({ resolve: false, actions: [], ops: { timeline: [], items: [] } })), 'Ask is as it was');
  assert.deepStrictEqual([C.riskOf('notes', {}), C.riskOf('pickups', {}), C.riskOf('marknotes', {})], ['ai', 'ai', 'new']);
  assert.strictEqual(C.describeCall('notes', { sequence: 'My cut', focus: 'pace' }), 'Producer’s notes on “My cut” – pace');
  // what the AI reads back from notes and a pick-up plan
  const rec = { name: 'My cut', cut: [{ lineId: 'a1', start: 65, end: 70 }], result: { verdict: 'Slow start.', notes: [{ kind: 'buried', title: 'Best line at 1:05', text: 'Open with it.', items: [{ from: 'a1', to: 'a1', tag: 'cut', note: 'the oven' }, { from: 'b1', to: 'b2', tag: 'unused', note: '' }] }] } };
  const txt = US.producer.notesForAI(rec);
  assert.ok(/VERDICT: Slow start\./.test(txt) && /1\. \[Buried\] Best line at 1:05 – Open with it\.\n   line a1 \(in the cut at 1:05\): the oven\n   line b1–b2 \(not in the cut\)/.test(txt), txt);
  assert.ok(/1\. GAP “Why it closed” – Never said\.\n   ask Anyone: What happened\?/.test(US.producer.pickupsForAI({ result: { summary: 'One gap.', gaps: [{ title: 'Why it closed', why: 'Never said.', asks: [{ speaker: '', question: 'What happened?' }], near: [] }] } })));
  // a conversation as the Producer: its own tool runs, the requests are filed under Producer, the card is shown
  const wasNotes = P.tools.notes.run;
  P.tools.notes.run = async (a, ctx) => { const s = await ctx.seqFor(a.sequence); ctx.event({ k: 'card', card: 'producerNotes', id: 'pn1', keep: true }); ctx.note('3 notes on “' + s.name + '”'); return 'NOTES: the opening is slow.'; };
  const x = setup([T('notes', { focus: 'pace' }, 'Reading the cut.', { understood: 'You want a review.', plan: ['Notes on the cut'] }), T('marknotes', {}), T('finish', { reply: 'The opening is slow.', next: ['Move the oven line to the top'] })]);
  try {
    US.story.state().producer = { notes: [], pickups: [], markers: {} };
    const log = [], chat = C.newChat();
    await C.send(chat, 'review my cut', hooksFor(log), { mode: 'ask', persona: 'producer' });
    assert.ok(x.ai.every(q => q.feature === 'Producer' && /^YOUR ROLE HERE/.test(q.system[0].text)) && x.ai[0].as.title === 'Producer: Review my cut');
    assert.ok(/RESULT of notes:\nNOTES: the opening is slow\./.test(x.ai[1].turns[0].user));
    assert.deepStrictEqual(log.filter(i => i.k === 'card').map(i => [i.card, i.id]), [['producerNotes', 'pn1']]);
    assert.strictEqual(log.filter(i => i.k === 'step')[0].result, '3 notes on “My cut”');
    assert.strictEqual(log.filter(i => i.k === 'approve?').length, 1, 'marking the notes changes the sequence: asked first, like any step');
    assert.ok(/no notes yet/.test(x.ai[2].turns[1].user));
    const end = log.find(i => i.k === 'end');
    assert.ok(end.trace.some(t => t.kind === 'call' && /Producer’s notes on the cut – pace/.test(t.text)) && end.model === 'Claude Opus 5.5', 'it shows its work like Ask');
    assert.strictEqual(C.toStored(chat).persona, 'producer');
  } finally { x.restore(); P.tools.notes.run = wasNotes; }
});

test('watching footage: offered only when that part of the app is there (US.understand), and through the warning when it would leave the computer', async () => {
  assert.ok(!('watch' in C.toolsHere()), 'not there: not offered');
  const calls = [];
  US.understand = { describe: async o => { calls.push(o); return { text: 'Ruth looks away before she answers.', usd: 0.02 }; }, where: () => ({ where: 'cloud', label: 'Gemini' }) };
  const x = setup([T('watch', { clip: 'DJI_001.MP4', from: 3, to: 9, question: 'What does she do?' }), T('finish', { reply: 'She looks away.' })]);
  try {
    assert.ok(/Watch and listen to one clip/.test(C.toolsHere().watch));
    assert.strictEqual(C.riskOf('watch', {}), 'sees');
    const log = [], chat = C.newChat({ always: true });
    await C.send(chat, 'what does Ruth do at 0:03?', hooksFor(log), { mode: 'never' });
    assert.deepStrictEqual(log.find(i => i.k === 'warn?').w.reasons.map(r => r.id), ['footage']);
    assert.deepStrictEqual([calls.length, calls[0].itemId, calls[0].from, calls[0].to, calls[0].question], [1, 'x1', 3, 9, 'What does she do?']);
    assert.ok(/From watching and listening to “DJI_001\.MP4” \(0:03–0:09\): Ruth looks away/.test(x.ai[1].turns[0].user));
    assert.ok(Math.abs(chat.spent - 0.04) < 1e-9, 'what it cost is counted in the chat');
  } finally { x.restore(); delete US.understand; }
});
