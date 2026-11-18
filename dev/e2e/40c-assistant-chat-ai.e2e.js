// costs-ai – real AI requests (a few cents): run with `node dev/e2e/run.js 40c` or E2E_AI=1
// Ask – one chat for everything, with the real AI in real Premiere: three clips in a fresh sequence, and the request
// “scale every clip on V1 to 120% and add a marker called Review at the start” with “don't ask” on. The AI must read the
// sequence, make the changes on a copy (never the sequence itself), and report – and a question (“how many clips are in
// it?”) in the same chat must be answered from what it read, without changing anything.
const C = US.chat; T.assert(C, 'the chat is loaded');
T.assert(US.ai && US.ai.available(), 'AI is set up in Settings');
const BIN = 'Test – Ask chat', NAME = 'Test – Ask chat AI';
const items = await T.importOnce(['C001_sharp_static.mp4', 'C002_blurry.mp4', 'C003_dark.mp4'].map(f => T.media('concert', f)), BIN);
const seq = await T.freshSequence(NAME, items[0].id, BIN);
await US.host.call('placeClips', { seqId: seq.id, cursor: 0, clips: items.map(it => ({ id: it.id, in: 0, out: 4 })) });
await T.open(seq.id);
for (const s of (await US.host.call('listSequences')).filter(s => s.name === `${NAME} – Ask`)) await US.host.call('deleteSequence', { seqId: s.id });
const chat = C.newChat(), log = [], asked = [];
const hooks = { event: it => log.push(it), status() {}, approve: async card => { asked.push(card.title); return { ok: true }; }, choose: async q => { asked.push('Q: ' + q.question); return q.options[0] || 'yes'; } };
const spent0 = US.ai.spending().cost;
for (let i = 0; i < 100 && US.jobs.current; i++) await T.sleep(200);
await C.send(chat, 'Scale every clip on V1 to 120% and add a marker called Review at the start of the first clip.', hooks, { mode: 'never', maxSteps: 10, budget: 1 });
const end = log.find(i => i.k === 'end');
const told = log.map(i => `${i.k}: ${i.text || i.reply || (i.plan || []).join(' / ') || ''}${i.result ? ' → ' + i.result : ''}`).join('\n');
T.assert(end, 'it finished with a report:\n' + told);
T.assert(log.some(i => i.k === 'understood' && i.text.length > 10) && log.some(i => i.k === 'plan' && i.plan.length), 'it said what it understood and its plan:\n' + told);
T.assert(chat.work && chat.work.ours && chat.work.seqId !== seq.id, 'it worked on a copy: ' + JSON.stringify(chat.work));
const copy = await US.host.call('editRead', { seqId: chat.work.seqId }), orig = await US.host.call('editRead', { seqId: seq.id });
T.assert(copy.video[0].clips.length === 3 && copy.video[0].clips.every(c => Math.abs(Number(c.scale) - 120) < 0.6), 'the copy’s clips are at 120%: ' + copy.video[0].clips.map(c => c.scale) + '\n' + told);
T.assert((copy.markers || []).some(m => /review/i.test(m.name) && m.start < 0.5), 'a marker “Review” at the start of the copy: ' + JSON.stringify(copy.markers));
T.assert(!orig.video[0].clips.some(c => Math.abs(Number(c.scale) - 120) < 0.6) && !(orig.markers || []).some(m => /review/i.test(m.name)), 'the original is untouched');
// a question in the same chat: answered, nothing changed
const applied = log.filter(i => i.k === 'step' && /^Edit/.test(i.text)).length;
await C.send(chat, 'How many clips are on V1 of it, and how long is it altogether?', hooks, { mode: 'never', maxSteps: 6, budget: 1 });
const end2 = log.filter(i => i.k === 'end')[1];
T.assert(end2 && /\b(3|three)\b/i.test(end2.reply) && /\b12\b|0:12|twelve/i.test(end2.reply), 'the answer: three clips, 12 seconds – ' + (end2 && end2.reply));
T.assert(log.filter(i => i.k === 'step' && /^Edit/.test(i.text)).length === applied, 'a question changes nothing');
await US.host.call('deleteSequence', { seqId: chat.work.seqId }).catch(() => {});
return { steps: chat.steps, cost: US.ai.fmtUSD(US.ai.spending().cost - spent0), asked, report: end.reply, done: end.done, answer: end2.reply };
