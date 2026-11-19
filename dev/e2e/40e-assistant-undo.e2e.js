// Ask – the journal, Undo and the warning, in the real editor (no AI cost: the AI's turns are a stand-in script).
// 1. A request that edits on a copy, keeps a version, colours the bin's clips and puts markers on the open sequence
//    (through a stand-in panel tool): the journal lists the sequences, bins, markers and labels; “Undo this reply”
//    takes the sequences away, the markers off and the labels back – and the editor's own sequence and marker stay.
// 2. A copy the editor has changed since is asked about before it is deleted: “keep” leaves it, “delete” removes it.
// 3. Changing the sequence itself stops at the warning even with Always proceed and “don't ask”; Continue keeps a copy
//    from before the change; Change course pauses the plan with nothing run.
// 4. Producer is the same engine: its requests are filed under Producer and it shows its work.
// 5. The screen: the top bar is pinned, one chat box, the working row, and whether the microphone can be reached.
const C = US.chat, E = US.editAsk; T.assert(C && C.undo && C.dangerOf && E, 'the chat is loaded');
const BIN = 'Test – Ask undo', NAME = 'Test – Ask undo';
const items = await T.importOnce(['C001_sharp_static.mp4', 'C002_blurry.mp4', 'C003_dark.mp4'].map(f => T.media('concert', f)), BIN);
const seq = await T.freshSequence(NAME, items[0].id, BIN);
await US.host.call('placeClips', { seqId: seq.id, cursor: 0, clips: items.map(it => ({ id: it.id, in: 0, out: 4 })) });
await T.open(seq.id);
const seqsNamed = async re => (await US.host.call('listSequences')).filter(s => re.test(s.name));
const OURS = new RegExp('^' + NAME.replace(/[–-]/g, '.') + ' . (Ask|before Ask)');
for (const s of await seqsNamed(OURS)) await US.host.call('deleteSequence', { seqId: s.id });
const [mine] = await US.host.call('addSequenceMarkers', { seqId: seq.id, markers: [{ start: 1, end: 1, name: 'The editor’s own', comment: '', color: 0 }] });
const labelsNow = async () => { const b = (await US.host.call('listBins')).find(x => x.path.split(' / ').pop() === BIN); return (await US.host.call('binItems', { binId: b.id, recursive: true })).filter(x => x.kind !== 'sequence' && x.kind !== 'bin').map(x => `${x.name}:${x.label}`).sort().join(); };
const labelsBefore = await labelsNow();
const stand = { id: 'e2e.marks', tool: 'markers', title: 'Mark two places', describe: 'Two markers on the open sequence.', changes: true, params: {}, run: async () => { await US.host.call('addSequenceMarkers', { seqId: seq.id, markers: [{ start: 2, end: 2, name: 'AI one', comment: '', color: 1 }, { start: 3, end: 3, name: 'AI two', comment: '', color: 1 }] }); return { summary: '2 markers' }; } };
US.actions.register(stand);
const step = (tool, args = {}, say = '', extra = {}) => Object.assign({ say, understood: '', plan: [], tool, argsJson: JSON.stringify(args) }, extra);
const realAI = US.ai, sent = [];
let script = [];
US.ai = Object.assign({}, realAI, { available: () => true, label: () => 'Claude', provider: () => 'claude',
  json: async req => { sent.push(req); const x = script.shift(); if (!x) throw new Error('no more scripted turns'); if (req.onUsage) req.onUsage({ usd: 0, name: 'Stand-in AI', tokensIn: 900, tokensOut: 60 }); return x; } });
const out = {};
try {
  for (let i = 0; i < 100 && US.jobs.current; i++) await T.sleep(200);
  /* 1 – a reply that makes several things, then is undone */
  const a = C.newChat(), log = [], warned = [], lines = [];
  const hooks = { event: it => log.push(it), status: c => { const l = C.workingLine(c); if (l && lines[lines.length - 1] !== l) lines.push(l); }, approve: async () => ({ ok: true, always: true }), choose: async () => null, warn: async w => { warned.push(w); return 'continue'; } };
  script = [step('timeline', {}, 'Reading.', { understood: 'Punch in on a copy, keep a version, colour the clips, mark two places.', plan: ['Read', 'Punch in on a copy', 'Keep a version', 'Colour the clips', 'Mark two places'] }),
    step('edit', { where: 'sequence', steps: [{ op: 'motion', targets: { tracks: ['V1'] }, params: { scale: 115 }, why: 'punch in' }] }, 'On a copy.'),
    step('version', { name: 'v1' }, 'Keeping it.'),
    step('edit', { where: 'bin', bin: BIN, steps: [{ op: 'label', targets: { kind: 'video' }, params: { label: 13 }, why: 'green' }] }, 'Colouring.'),
    step('open', { sequence: NAME }, 'Back to yours.'),
    step('action', { id: 'e2e.marks' }, 'Marking.'),
    step('finish', { reply: 'All four done.', done: ['punched in', 'version', 'coloured', 'marked'] })];
  await C.send(a, 'punch in on a copy, keep a version, colour the clips green and mark two places', hooks, { mode: 'ask' });
  const end = log.find(i => i.k === 'end');
  T.assert(end, 'the request finished: ' + JSON.stringify(log.map(i => i.k + (i.text ? ':' + i.text : '') + (i.result ? ' → ' + i.result : ''))).slice(0, 1200));
  T.assert(a.always === true && !warned.length, 'Always proceed was chosen on the first card and nothing here was risky: ' + JSON.stringify(warned.map(w => w.reasons)));
  const kinds = a.journal.map(j => j.kind);
  T.assert(kinds.filter(k => k === 'seq').length === 2 && kinds.includes('items') && kinds.includes('markers'), 'the journal has the copy, the version, the labels and the markers: ' + JSON.stringify(a.journal.map(j => [j.turn, j.kind, j.name || j.path || (j.guids || j.undo || []).length, j.seqId || ''])) + ' · steps: ' + JSON.stringify(log.filter(i => i.k === 'step').map(i => i.text + ' → ' + (i.result || ''))));
  T.assert(a.journal.filter(j => j.kind === 'seq').every(j => j.stamp && j.stamp.clips > 0), 'each sequence it made is noted as it was left: ' + JSON.stringify(a.journal.filter(j => j.kind === 'seq').map(j => j.stamp)));
  T.assert(a.journal.find(j => j.kind === 'markers').guids.length === 2, 'its two markers, not the editor’s own');
  T.assert(end.trace.some(t => t.kind === 'call' && /scale 115/.test(t.detail)) && end.trace.some(t => t.kind === 'check' || t.kind === 'result') && end.tokensIn === 900 * 7, 'behind the scenes has each call with its arguments, and the tokens: ' + end.tokensIn);
  T.assert(lines.some(l => /^Planning/.test(l)) && lines.some(l => /^Running step 2 of 5 · Edit/.test(l)), 'the working row said what it was doing: ' + lines.join(' | '));
  T.assert((await seqsNamed(OURS)).length === 2 && (await labelsNow()) !== labelsBefore, 'the editor has the copy and the version, and the clips are coloured');
  const plan = C.undoPlan(a, { turn: end.turn });
  out.undo = plan.can.map(x => x.text);
  const res = await C.undo(a, { turn: end.turn, confirm: async () => 'keep' });
  T.assert(!res.failed.length, 'nothing failed: ' + JSON.stringify(res));
  T.assert((await seqsNamed(OURS)).length === 0, 'the copy and the version are gone: ' + JSON.stringify((await seqsNamed(OURS)).map(s => s.name)));
  T.assert((await labelsNow()) === labelsBefore, 'the labels are back as they were: ' + (await labelsNow()) + ' / ' + labelsBefore);
  const info = await US.host.call('sequenceInfo', { seqId: seq.id });
  T.assert(info.markers.length === 1 && info.markers[0].name === 'The editor’s own' && info.video[0].clips.length === 3, 'the editor’s own sequence and marker are untouched: ' + JSON.stringify(info.markers.map(m => m.name)));
  T.assert(US.ctx.sequence && US.ctx.sequence.id === seq.id, 'back in the sequence that was open: ' + JSON.stringify(US.ctx.sequence && US.ctx.sequence.name));
  out.bins = res.undone.filter(x => /bin/.test(x)).concat(res.kept);
  // the script's “open” step made the editor's own sequence the working one: it stays (Undo never deletes their sequence)
  const left = C.undoPlan(a), J = () => JSON.stringify((a.journal || []).map(j => ({ turn: j.turn, kind: j.kind, name: j.name || j.path || '', seqId: j.seqId, undone: j.undone, kept: j.kept || '', n: (j.guids || j.undo || j.list || []).length, stamp: j.stamp })));
  T.assert(!left.can.length, 'nothing left to undo – still offered: ' + JSON.stringify(left.can.map(x => x.text)) + ' · result: ' + JSON.stringify(res) + ' · journal: ' + J());
  T.assert(!a.work || a.work.seqId === seq.id, 'the working sequence is the editor’s own or none: ' + JSON.stringify(a.work));
  out.journal = J();

  /* 2 – a copy the editor has changed since: asked first */
  const b = C.newChat(), lb = [];
  script = [step('edit', { where: 'sequence', sequence: NAME, steps: [{ op: 'motion', targets: { tracks: ['V1'] }, params: { scale: 110 } }] }), step('finish', { reply: 'On a copy.' })];
  await C.send(b, 'punch in a little on a copy', { event: it => lb.push(it), approve: async () => ({ ok: true }) }, { mode: 'never' });
  const copy = b.journal.find(j => j.kind === 'seq');
  T.assert(copy && b.work && b.work.seqId === copy.seqId, 'the copy is in the journal');
  await US.host.call('addSequenceMarkers', { seqId: copy.seqId, markers: [{ start: 1, end: 1, name: 'The editor worked on this', comment: '', color: 2 }] });
  const asked = [];
  let r2 = await C.undo(b, { confirm: async es => { asked.push(es.map(e => e.name)); return 'keep'; } });
  T.assert(asked.length === 1 && (await seqsNamed(OURS)).length === 1 && r2.kept.some(k => /you’ve changed it since/.test(k)), 'changed since: asked, and kept: ' + JSON.stringify([asked, r2]));
  r2 = await C.undo(b, { confirm: async () => 'delete' });
  T.assert((await seqsNamed(OURS)).length === 0, 'deleted once the editor said so');

  /* 3 – the sequence itself: the warning, whatever was chosen about asking */
  const c = C.newChat({ always: true }), lc = [], wc = [];
  await T.open(seq.id);
  script = [step('edit', { where: 'sequence', sequence: NAME, inPlace: true, steps: [{ op: 'marker', targets: { tracks: ['V1'], every: 'first' }, params: { name: 'In place', color: 1 } }] }), step('finish', { reply: 'Paused.' })];
  await C.send(c, 'a marker on the first clip, in the sequence itself', { event: it => lc.push(it), warn: async w => { wc.push(w); return 'change'; } }, { mode: 'never' });
  T.assert(wc.length === 1 && wc[0].reasons.some(x => x.id === 'inPlace') && lc.some(i => i.k === 'paused') && !lc.some(i => i.k === 'end'), 'Change course: the plan paused: ' + JSON.stringify(lc.map(i => i.k)));
  T.assert((await US.host.call('sequenceInfo', { seqId: seq.id })).markers.length === 1 && !(await seqsNamed(OURS)).length, 'and nothing ran');
  script = [step('edit', { where: 'sequence', sequence: NAME, inPlace: true, steps: [{ op: 'marker', targets: { tracks: ['V1'], every: 'first' }, params: { name: 'In place', color: 1 } }] }), step('finish', { reply: 'Marked.' })];
  await C.send(c, 'carry on', { event: it => lc.push(it), warn: async w => { wc.push(w); return 'continue'; } }, { mode: 'never' });
  const before = await seqsNamed(/before Ask$/);
  T.assert(wc.length === 2 && before.length === 1, 'Continue: a copy from before the change is kept: ' + JSON.stringify(before.map(s => s.name)));
  T.assert((await US.host.call('sequenceInfo', { seqId: seq.id })).markers.some(m => m.name === 'In place'), 'and the sequence itself was changed');
  const pc = C.undoPlan(c);
  // the marker it added in place is found by comparing before and after, so it can be taken off; the change to the
  // sequence itself as a whole is listed as what Undo can't do, naming the copy kept from before
  T.assert(pc.cant.length === 1 && pc.cant[0].entry.kind === 'inplace' && /can’t be put back from here/.test(pc.cant[0].text) && /before Ask/.test(pc.cant[0].text), 'Undo says plainly that it can’t put the sequence itself back: ' + JSON.stringify(pc));
  T.assert(pc.can.every(x => x.entry.kind === 'markers' && x.entry.seqId === seq.id) && !pc.can.some(x => x.entry.kind === 'seq'), 'only its marker is offered – never the editor’s sequence or the copy from before: ' + JSON.stringify(pc.can.map(x => x.text)));
  if (pc.can.length) {
    const rc = await C.undo(c, { confirm: async () => 'keep' });
    const left = (await US.host.call('sequenceInfo', { seqId: seq.id })).markers.map(m => m.name);
    T.assert(!rc.failed.length && !left.includes('In place') && left.includes('The editor’s own'), 'Undo took its marker off and left the editor’s: ' + JSON.stringify([rc, left]));
    T.assert((await seqsNamed(/before Ask$/)).length === 1, 'the copy from before is kept');
  }
  out.cant = pc.cant[0].text;

  /* 4 – Producer on the same engine */
  const p = C.newChat(), lp = [];
  const n0 = sent.length;
  script = [step('timeline', { sequence: NAME }, 'Looking at the cut.', { understood: 'You want a review.', plan: ['Read the cut'] }), step('finish', { reply: 'Three clips, twelve seconds.', next: ['Tighten it'] })];
  await C.send(p, 'review my cut', { event: it => lp.push(it) }, { mode: 'ask', persona: 'producer' });
  const ep = lp.find(i => i.k === 'end');
  T.assert(ep && sent.slice(n0).every(q => q.feature === 'Producer' && /^Producer: /.test(q.as.title) && /YOUR ROLE HERE: you are the Producer/.test(q.system[0].text) && /- notes: /.test(q.system[0].text) && /- edit: /.test(q.system[0].text)), 'Producer’s requests carry its role and every tool');
  T.assert(ep.trace.length >= 5 && ep.model === 'Stand-in AI', 'and it shows its work');
} finally {
  US.ai = realAI;
  for (const s of await seqsNamed(OURS)) await US.host.call('deleteSequence', { seqId: s.id }).catch(() => {});
  await US.host.call('askRemoveBins', { paths: ['JMG Ultra Studio / Ask / Before', 'JMG Ultra Studio / Ask / Versions', 'JMG Ultra Studio / Ask'] }).catch(() => {});
}
/* the commands themselves */
const st = await US.host.call('askStamp', { seqIds: [seq.id, 'no-such-sequence'] });
T.assert(st[0].clips >= 3 && st[0].markers >= 1 && st[0].guids.length === st[0].markers && Math.abs(st[0].duration - 12) < 0.5 && st[1].missing === true, 'askStamp: ' + JSON.stringify(st));
const rb = await US.host.call('askRemoveBins', { paths: [(await US.host.call('listBins')).find(x => x.path.split(' / ').pop() === BIN).path, 'No / Such / Bin'] });
T.assert(rb.removed.length === 0 && rb.kept.length === 2 && rb.kept.some(k => k.why === 'not empty') && rb.kept.some(k => k.why === 'not there any more'), 'a bin with anything in it is never removed: ' + JSON.stringify(rb));
if (!US.app.is('resolve')) { const d = await US.host.call('dictateTranscribe', { path: '/nowhere.wav' }); T.assert(d && d.unsupported === true && d.why, 'Premiere says plainly that it can’t transcribe for a panel: ' + JSON.stringify(d)); }
await US.host.call('removeSequenceMarkers', { seqId: seq.id, guids: [mine] }).catch(() => {});
/* 5 – the screen */
US.tools.open('assistant');
await T.sleep(150);
const view = Array.from(document.querySelectorAll('.chat-input')).map(i => i.closest('.tool')).find(v => v && v.offsetParent !== null) || document.querySelector('.chat-input').closest('.tool');
const head = view.querySelector('.chat-head');
T.assert(head && getComputedStyle(head).position === 'sticky' && head.querySelector('.chat-tabs') && head.querySelector('.chat-opts'), 'the chats bar and options are pinned at the top');
T.assert(view.querySelectorAll('.chat-foot textarea').length === 1 && view.querySelector('.chat-working') && view.querySelector('.chat-answers'), 'one chat box, with the working row and the answers above it');
out.mic = { reachable: US.dictation.supported(), button: !!view.querySelector('.chat-mic'), engine: US.dictation.engine().id || US.dictation.engine().why };
US.tools.open('producer', { page: 'chat' });
await T.sleep(150);
T.assert(Array.from(document.querySelectorAll('.chat-head')).some(h2 => h2.offsetParent !== null && /producer/i.test(h2.closest('.tool').textContent)), 'Producer has the same chat');
return out;
