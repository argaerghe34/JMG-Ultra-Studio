// Ask – one chat for everything, in real Premiere (no AI cost: the AI's turns are a stand-in script).
// Three clips in a fresh sequence. Chat A: reads the sequence, punches in on every clip on V1, switches the first one off and colours them – approved from the card, with the second step (switching off) unticked – on a copy; then reports. The colour isn't offered: Premiere can't colour timeline clips, and the card says so. Chat B, at the same time:
// reads the project and adds a marker on the first clip of the same sequence, in the sequence itself (asked first, as
// it changes the editor's own). Both finish; the steps in Premiere took turns; the original only has B's marker.
// (The check is on scale, which Premiere reads back; a timeline clip's colour label can't be read from a script here.)
// In Resolve, timeline clips can be coloured: the card offers the colour as a third step (unticked here, so the copy's
// clips stay uncoloured), and at the end the colour is set on the copy and read back.
const C = US.chat, E = US.editAsk; T.assert(C && E, 'the chat is loaded');
const BIN = 'Test – Ask chat', NAME = 'Test – Ask chat';
const items = await T.importOnce(['C001_sharp_static.mp4', 'C002_blurry.mp4', 'C003_dark.mp4'].map(f => T.media('concert', f)), BIN);
const seq = await T.freshSequence(NAME, items[0].id, BIN);
await US.host.call('placeClips', { seqId: seq.id, cursor: 0, clips: items.map(it => ({ id: it.id, in: 0, out: 4 })) });
await T.open(seq.id);
for (const s of (await US.host.call('listSequences')).filter(s => s.name === `${NAME} – Ask`)) await US.host.call('deleteSequence', { seqId: s.id });
const step = (tool, args = {}, say = '', extra = {}) => Object.assign({ say, understood: '', plan: [], tool, argsJson: JSON.stringify(args) }, extra);
const a = C.newChat(), b = C.newChat();
const script = {
  [a.id]: [step('timeline', {}, 'Reading the sequence.', { understood: 'Punch in on the clips on V1 and colour them, on a copy.', plan: ['Read it', 'Punch in and colour on a copy'] }),
    step('edit', { where: 'sequence', steps: [{ op: 'motion', targets: { tracks: ['V1'] }, params: { scale: 120 }, why: 'punch in' }, { op: 'enable', targets: { tracks: ['V1'], every: 'first' }, params: { on: false }, why: 'hide it' }, { op: 'label', targets: { tracks: ['V1'] }, params: { label: 13 }, why: 'green' }] }, 'On a copy.'),
    step('timeline', {}, 'Checking it.'),
    step('finish', { reply: 'Punched in, on a copy.', done: ['3 clips at 120%'], notDone: ['Switching the first clip off – you unticked it', 'The colour – Premiere can’t colour timeline clips'] })],
  [b.id]: [step('project', {}, 'Looking at the project.', { understood: 'A marker on the first clip, in the sequence itself.', plan: ['Find the sequence', 'Add the marker'] }),
    step('edit', { where: 'sequence', sequence: NAME, inPlace: true, steps: [{ op: 'marker', targets: { tracks: ['V1'], every: 'first' }, params: { name: 'Ask test', color: 1 }, why: '' }] }),
    step('finish', { reply: 'Marker added.', done: ['1 marker'] })]
};
const realAI = US.ai, sent = [];
let both = 0, most = 0;   // AI requests in flight at once: the chats think side by side
US.ai = Object.assign({}, realAI, { available: () => true, label: () => 'Claude', provider: () => 'claude',
  json: async req => { sent.push(req); most = Math.max(most, ++both); await T.sleep(150); both--; const x = script[req.as.id].shift(); if (!x) throw new Error('no more scripted turns'); return x; } });
const logs = { a: [], b: [] }, cards = [], states = [];
const hooks = (k, chat) => ({ event: it => logs[k].push(it), status: () => states.push(`${k}:${chat.status}`), approve: async card => { cards.push({ k, risk: card.risk, title: card.title, detail: card.detail, dropped: card.dropped || [], steps: (card.steps || []).map(s => E.describe(s)) }); return { ok: true, steps: k === 'a' ? card.steps.slice(0, 1) : card.steps }; }, choose: async () => null });
try {
  for (let i = 0; i < 100 && US.jobs.current; i++) await T.sleep(200);
  await Promise.all([C.send(a, 'punch in on the clips on V1 and colour them green', hooks('a', a), { mode: 'ask' }), C.send(b, `add a marker called Ask test on the first clip of ${NAME}, in the sequence itself`, hooks('b', b), { mode: 'own' })]);
} finally { US.ai = realAI; }
const endA = logs.a.find(i => i.k === 'end'), endB = logs.b.find(i => i.k === 'end');
T.assert(endA && endB, 'both chats finished: ' + JSON.stringify([logs.a.map(i => i.k + (i.text ? ':' + i.text : '')), logs.b.map(i => i.k + (i.text ? ':' + i.text : ''))]).slice(0, 900));
T.assert(most === 2, 'the two chats were thinking at the same time');
T.assert(logs.a.some(i => i.k === 'understood') && logs.a.some(i => i.k === 'plan') && logs.a.filter(i => i.k === 'step').length === 3, 'chat A showed what it understood, its plan and its three steps');
// the cards: A's makes something new (a copy), B's changes the editor's own sequence
const ca = cards.find(c => c.k === 'a'), cb = cards.find(c => c.k === 'b');
const RES = US.app.is('resolve');
T.assert(ca && ca.risk === 'new' && ca.steps.length === (RES ? 3 : 2) && /scale 120% · 3 clips on V1/.test(ca.steps[0]) && /Switch off · 1 clip on V1/.test(ca.steps[1]) && (!RES || /Colour .*· 3 clips on V1/.test(ca.steps[2])) && /a copy of/.test(ca.detail), 'A’s card: ' + JSON.stringify(ca));
if (RES) T.assert(!ca.dropped.length, 'Resolve colours timeline clips: the colour step is on the card, nothing left out: ' + JSON.stringify(ca.dropped));
else T.assert(ca.dropped.length === 1 && /Premiere can’t colour clips on a timeline/.test(ca.dropped[0]), 'colouring timeline clips isn’t offered in Premiere, and the card says why: ' + JSON.stringify(ca.dropped));
T.assert(cb && cb.risk === 'own' && /ITSELF – no copy/.test(cb.detail), 'B’s card: ' + JSON.stringify(cb));
// what Premiere has now: the copy's clips are at 120% and not green (the unticked step didn't run); the original is at its own size and has B's marker
T.assert(a.work && a.work.ours && a.work.name === `${NAME} – Ask`, 'A works on its copy: ' + JSON.stringify(a.work));
const copy = await US.host.call('editRead', { seqId: a.work.seqId }), orig = await US.host.call('editRead', { seqId: seq.id });
const at120 = c => Math.abs(Number(c.scale) - 120) < 0.6;
T.assert(copy.video[0].clips.length === 3 && copy.video[0].clips.every(at120), 'the copy’s clips are at 120%: ' + copy.video[0].clips.map(c => c.scale) + ' – ' + JSON.stringify(logs.a.filter(i => i.k === 'step' || i.k === 'warn').map(i => (i.text || '') + (i.result ? ' → ' + i.result : ''))).slice(0, 700));
T.assert(copy.video[0].clips.every(c => !c.disabled), 'the unticked step didn’t run – no clip is switched off: ' + copy.video[0].clips.map(c => c.disabled));
if (RES) T.assert(copy.video[0].clips.every(c => c.label == null), 'Resolve: the unticked colour step didn’t run – the copy’s clips have no colour: ' + copy.video[0].clips.map(c => c.label));
T.assert(orig.video[0].clips.length === 3 && !orig.video[0].clips.some(at120), 'the original’s clips are the size they were: ' + orig.video[0].clips.map(c => c.scale));
T.assert((orig.markers || []).some(m => m.name === 'Ask test'), 'B’s marker is on the original: ' + JSON.stringify((orig.markers || []).map(m => m.name)));
// the AI was sent text only, under each chat's own name
const all = JSON.stringify(sent.map(r => [r.system, r.user, r.turns]));
T.assert(sent.every(r => r.as && /^Ask: /.test(r.as.title) && r.feature === 'Ask') && /C001_sharp_static/.test(all) && !/\/Users\/|[A-Z]:\\\\/.test(all), 'clip names and times – no file paths');
T.assert(!US.jobs.current, 'Premiere is free again');
// the screen: the Ask tab opens with one chat box and these chats can be shown
US.tools.open('assistant');
await T.sleep(100);
const view = Array.from(document.querySelectorAll('.chat-input')).map(i => i.closest('.tool')).find(v => v && v.offsetParent !== null) || document.querySelector('.chat-input').closest('.tool');
T.assert(view.querySelector('.chat-tab.chat-new') && !view.querySelector('.chat-mode') && view.querySelectorAll('.chat-opts select').length === 3 && !US.tools.get('agent'), 'one chat box: chats as tabs, how often it asks, which AI, the spending limit – and no Agent tab');
let labels = '', labelsOk = false;
try { const x = await US.host.call('editApply', { seqId: a.work.seqId, op: 'label', params: { label: 13 }, targets: copy.video[0].clips.map(c => ({ kind: 'video', track: 0, start: c.start, end: c.end })) }); const back = await US.host.call('editRead', { seqId: a.work.seqId }); labels = `set on ${x.done}, skipped ${(x.skipped || []).length}${x.skipped && x.skipped[0] ? ' (' + x.skipped[0].why + ')' : ''}, read back: ${back.video[0].clips.map(c => c.label)}`; labelsOk = x.done === 3 && back.video[0].clips.every(c => c.label === 13); } catch (e) { labels = 'failed: ' + (e.title || e.message); }
await US.host.call('deleteSequence', { seqId: a.work.seqId }).catch(() => {});
if (RES) T.assert(labelsOk, 'Resolve colours the copy’s timeline clips Green and reads it back: ' + labels);
return { timelineLabels: labels, cards: cards.map(c => `${c.k}: ${c.risk} – ${c.steps.join(' | ')}`), waited: [...new Set(states)].join(' '), a: endA.reply, b: endB.reply };
