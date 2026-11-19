// Ask working on its own, in the real editor – the user's own case, with a stand-in AI and a stand-in web (no cost, no
// real downloads: a “download” copies one of the test clips):
// 1. “a select reel of big boats, with B-roll from the web”: B-roll searched in the background (no tab opened) → its
//    picks shown on the card, one unticked → downloaded into a folder named after the search, with the list of sources
//    → into a bin → waited for → a new sequence built from them at the length asked for → read back. Then Undo all:
//    the sequence goes, and it says the files and the clips in the bin stay.
// 2. Finding its way round: bins by name, clips by file folder, what is new, an empty bin made, clips moved and put back.
// 3. “check again in 1 second”: the chat sets itself a follow-up, finishes, and carries on by itself when it fires.
// 4. On its own, a risky step waits for the editor instead of running.
const C = US.chat, A = US.chatAgent, B = US.brollFinder; T.assert(C && A && B && US.chatTools && US.chatTools['broll.download'] && C.schedule, 'the tools for working on its own are loaded');
const fs = require('fs'), os = require('os'), path = require('path');
// a fresh folder each run: files left by an earlier run count as "already there", not as downloaded
const ROOT = path.join(os.tmpdir(), 'jmg-ultra-studio-e2e-big-boats-' + Date.now().toString(36)),BIN = 'Test – Big boats', EMPTY = 'Test – Ask agent/Empty one ' + Date.now().toString(36);   // a new empty bin each run (an earlier run's would already hold clips)
fs.mkdirSync(ROOT, { recursive: true });
const SRC = ['C001_sharp_static.mp4', 'C002_blurry.mp4', 'C003_dark.mp4'];
const clipOf = (f, i, licence) => ({ key: 'e2e:' + f, source: 'pexels', sourceName: 'Pexels', id: 'e2e' + i, title: ['Container ship at sea', 'Harbour cranes', 'Ferry in fog'][i], page: 'https://example.test/' + f, author: 'Test', authorUrl: '', thumb: '', preview: '', duration: 8, width: 1920, height: 1080, licence, files: [{ url: 'e2e://' + f, ext: 'mp4', width: 1920, height: 1080, size: 3 * 1024 * 1024 }] });
const FREE = { free: true, credit: false, name: 'Pexels licence', label: 'Free to use' }, STD = { free: false, credit: false, name: '', label: 'Standard licence' };
const was = { ai: US.ai, search: B.search, download: B.net.download, folder: B.defaultFolder, open: US.tools.open, settings: US.settings.get('brollfinder', {}), tick: C._waitEvery };
const web = { searched: [], downloaded: [] }, opened = [], sent = [];
let script = [];
const step = (tool, args = {}, say = '', extra = {}) => Object.assign({ say, understood: '', plan: [], tool, argsJson: JSON.stringify(args) }, extra);
B.search = async (job, o) => { web.searched.push(o.requests.slice()); return { results: o.requests.map(term => ({ term, clips: SRC.map((f, i) => clipOf(f, i, i === 2 ? STD : FREE)).filter(c => !o.freeOnly || c.licence.free), pool: [], notes: [], asked: [term] })), summary: `${o.freeOnly ? 2 : 3} options for 1 request – nothing downloaded yet` }; };
B.net.download = async (url, file, progress) => { web.downloaded.push(url); fs.copyFileSync(T.media('concert', url.replace('e2e://', '')), file); progress && progress(1); };
B.defaultFolder = () => ROOT;
US.settings.set('brollfinder', {});
// the editor's own choices about warnings are put aside for the test (the defaults: warn once per chat) and put back after
const ALONE_KEYS = ['followUps', 'minutes', 'spend', 'steps', 'licenceWarn', 'noYouTubeWarn', 'bigGB', 'manyClips'], wasAlone = ALONE_KEYS.map(k => US.settings.get('askAlone.' + k, undefined));
for (const k of ALONE_KEYS) if (US.settings.get('askAlone.' + k, undefined) !== undefined) US.settings.set('askAlone.' + k, undefined);
US.tools.open = (id, args) => { opened.push(id); };
C._waitEvery = 500;
US.ai = Object.assign({}, was.ai, { available: () => true, label: () => 'Claude', provider: () => 'claude',
  json: async req => { sent.push(req); const x = script.shift(); if (!x) throw new Error('no more scripted turns'); if (req.onUsage) req.onUsage({ usd: 0, name: 'Stand-in AI', tokensIn: 500, tokensOut: 40 }); return x; } });
const seqsNamed = async re => (await US.host.call('listSequences')).filter(s => re.test(s.name));
for (const s of await seqsNamed(/^Ask . Test . Big boats/)) await US.host.call('deleteSequence', { seqId: s.id });
const out = {};
const say = log => JSON.stringify(log.map(i => i.k + (i.text ? ':' + String(i.text).slice(0, 80) : '') + (i.result ? ' → ' + String(i.result).slice(0, 120) : ''))).slice(0, 1800);
const last = () => { const t = sent[sent.length - 1].turns; return t[t.length - 1].user; };
try {
  for (let i = 0; i < 100 && US.jobs.current; i++) await T.sleep(200);
  /* 1 – the big-boats request, end to end */
  const a = C.newChat(), log = [], cards = [], warned = [], lines = [], results = [];
  const hooks = { event: it => log.push(it), status: c => { const l = C.workingLine(c); if (l && lines[lines.length - 1] !== l) lines.push(l); }, approve: async card => { cards.push(card); return card.items ? { ok: true, items: card.items.slice(0, 2).map(i => i.id) } : { ok: true }; }, choose: async () => null, warn: async w => { warned.push(w); return 'continue'; }, planApprove: async p => { cards.push({ plan: p.plan }); return { ok: true }; } };
  script = [step('broll.search', { requests: ['big boats'], freeOnly: false, aim: 3 }, 'Searching.', { understood: 'A short select reel of big boats, B-roll from the web, on a new sequence.', plan: ['Search for big boats', 'Download the best into a bin', 'Wait for them', 'Build the reel', 'Check it'] }),
    step('broll.download', { ids: ['b1', 'b2', 'b3'], bin: BIN }, 'Downloading my picks.'),
    step('wait', { for: 'bin', bin: BIN, atLeast: 2, timeoutMinutes: 1 }, 'Making sure they are in.'),
    step('place', { newSequence: 'Test – Big boats', clips: [{ clip: 'f1', length: 3 }, { clip: 'f2', length: 3, from: 1 }] }, 'Building it.'),
    step('timeline', {}, 'Checking it.'),
    step('finish', { reply: 'A 6-second reel of two boat shots is open.', done: ['2 clips downloaded', 'bin', 'sequence'] })];
  await C.send(a, 'On a new sequence, make me a select reel of 6 seconds showing the best moments of big boats and get that b-roll from the web', hooks, { mode: 'ask' });
  for (const r of sent) { const t = r.turns || []; if (t.length) results.push(t[t.length - 1].user); }
  const end = log.find(i => i.k === 'end');
  T.assert(end, 'the request finished: ' + say(log));
  T.assert(web.searched.length === 1 && !opened.length, 'the search ran in the background – no tab was opened: ' + JSON.stringify(opened));
  T.assert(cards[0].plan && cards[0].plan.length === 5, 'the whole plan was approved once');
  T.assert(warned.length === 1 && warned[0].reasons.some(r => r.id === 'licence'), 'a pick that isn’t free to use: the warning first: ' + JSON.stringify(warned.map(w => w.reasons)));
  const pick = cards.find(c => c.items);
  T.assert(pick && pick.items.length === 3 && pick.items[2].warn === true && /into the bin/.test(pick.detail), 'then the card with the three picks to untick: ' + JSON.stringify(pick && pick.items.map(i => i.label)));
  T.assert(web.downloaded.length === 2, 'only the two ticked were downloaded: ' + JSON.stringify(web.downloaded));
  T.assert(warned[0].reasons.find(r => r.id === 'licence').more && a._licenceTold === true && !A.downloadReasons([{ clip: clipOf(SRC[2], 2, STD) }], '1080', a).length, 'the warning says what the licence means, and is given once per chat');
  const dir = path.join(ROOT, 'big boats'), files = fs.existsSync(dir) ? fs.readdirSync(dir) : [];
  T.assert(files.filter(f => /\.mp4$/i.test(f)).length === 2 && files.includes(B.LIST_NAME), 'in a folder named after the search, with the list of sources and licences: ' + JSON.stringify(files));
  const bins = (await US.host.call('askBins', { filter: BIN })).bins;
  T.assert(bins.length === 1 && bins[0].clips >= 2, 'the bin has the clips: ' + JSON.stringify(bins));
  T.assert(lines.some(l => /^Waiting for 2 clips in the bin/.test(l)), 'it waited, and said so: ' + lines.join(' | '));
  T.assert(a.work && a.work.ours && /^Ask – Test – Big boats/.test(a.work.name), 'a new sequence is its working one: ' + JSON.stringify(a.work));
  const st = (await US.host.call('askStamp', { seqIds: [a.work.seqId] }))[0];
  T.assert(st && !st.missing && st.clips >= 2 && Math.abs(st.duration - 6) < 0.6, 'two clips, about six seconds: ' + JSON.stringify(st) + ' · ' + results.slice(-2).join(' · ').slice(0, 600));
  T.assert(US.ctx.sequence && US.ctx.sequence.id === a.work.seqId, 'and it is open');
  const plan = C.undoPlan(a);
  T.assert(plan.can.some(x => x.entry.kind === 'seq' && x.entry.seqId === a.work.seqId) && plan.cant.some(x => /stay on the disk/.test(x.text)) && plan.cant.some(x => /stay in the project/.test(x.text)), 'Undo offers the sequence and says what stays: ' + JSON.stringify([plan.can.map(x => x.text), plan.cant.map(x => x.text)]));
  const made = a.work.seqId, res = await C.undo(a, { confirm: async () => 'delete' });
  T.assert(!(await US.host.call('listSequences')).some(s => s.id === made), 'Undo all removed the sequence: ' + JSON.stringify(res));
  out.undo = res; out.results = results.map(r => r.slice(0, 160));

  /* 2 – finding its way round the project */
  const b = C.newChat(), lb = [];
  script = [step('bins', { filter: BIN }), step('find', { file: 'big boats' }), step('recent', { minutes: 5 }), step('makebin', { bin: EMPTY }), step('move', { clips: ['f1'], bin: EMPTY }), step('finish', { reply: 'Looked and moved.' })];
  const n0 = sent.length;
  await C.send(b, 'where did the boat clips go? put one in an empty bin', { event: it => lb.push(it) }, { mode: 'never' });
  const rb = sent.slice(n0 + 1).map(r => r.turns[r.turns.length - 1].user);
  T.assert(lb.some(i => i.k === 'end'), 'finished: ' + say(lb));
  T.assert(new RegExp(BIN).test(rb[0]) && /\t([2-9]|\d{2,})\t/.test(rb[0]), 'bins: found by name with its count: ' + rb[0]);
  T.assert(/f1\t/.test(rb[1]) && /big boats\//.test(rb[1]), 'find: by the folder the files are in: ' + rb[1].slice(0, 300));
  T.assert(/new clips|Nothing new/.test(rb[2]), 'recent answered: ' + rb[2].slice(0, 200));
  const eb = (await US.host.call('askBins', { filter: EMPTY.split('/').pop() })).bins;   // this run's bin only
  T.assert(eb.length === 1 && eb[0].clips === 1, 'the empty bin was made and one clip moved into it: ' + JSON.stringify(eb) + ' · ' + rb[4]);
  await C.undo(b, { confirm: async () => 'keep' });
  const eb2 = (await US.host.call('askBins', { filter: 'Empty one' })).bins;
  T.assert(!eb2.length || eb2[0].clips === 0, 'Undo put the clip back and took the empty bin away: ' + JSON.stringify(eb2));
  out.find = rb.map(r => r.slice(0, 120));

  /* 3 – “check again in 1 second”: it comes back by itself */
  const c = C.newChat(), lc = [];
  const hc = { event: it => lc.push(it), resume: async (chat, f) => { await C.send(chat, f.text, hc, { mode: 'ask', unattended: true }); } };
  script = [step('later', { seconds: 1, then: `Look whether the bin ${BIN} has clips and say how many` }, 'I’ll come back to it.', { understood: 'Check again shortly.' }), step('finish', { reply: 'Back in a second.' }),
    step('bins', { filter: BIN }, 'Looking.', { understood: 'Time to check.' }), step('finish', { reply: 'It has clips.' })];
  await C.send(c, 'check again in a second whether the boats bin has clips', hc, { mode: 'ask' });
  T.assert(c.followups && c.followups.length === 1 && c.followups[0].state === 'pending' && lc.some(i => i.k === 'followup'), 'a follow-up is set and shown: ' + JSON.stringify(c.followups));
  for (let i = 0; i < 60 && lc.filter(x => x.k === 'end').length < 2; i++) await T.sleep(250);
  const ends = lc.filter(x => x.k === 'end');
  T.assert(ends.length === 2 && ends[1].reply === 'It has clips.' && c.followups[0].state === 'done', 'it fired and the chat carried on by itself: ' + say(lc) + ' ' + JSON.stringify(c.followups));
  T.assert(lc.filter(x => x.k === 'me').length === 2 && lc.filter(x => x.k === 'me')[1].auto === true && /YOUR OWN FOLLOW-UP/.test(sent[sent.length - 2].turns.slice(-1)[0].user), 'as its own return, told so');

  /* 4 – on its own, nothing risky runs */
  const d = C.newChat(), ld = [];
  await T.open((await US.host.call('listSequences'))[0].id);
  const before = (await US.host.call('listSequences')).length;
  script = [step('edit', { where: 'sequence', inPlace: true, steps: [{ op: 'marker', targets: { tracks: ['V1'], every: 'first' }, params: { name: 'Unattended', color: 1 } }] })];
  await C.send(d, 'Put a marker on the first clip in the sequence itself', { event: it => ld.push(it), warn: async () => { throw new Error('nobody is there to be asked'); } }, { mode: 'never', unattended: true });
  T.assert(ld.some(i => i.k === 'paused' && /^Waiting for you before/.test(i.text)) && (await US.host.call('listSequences')).length === before, 'it waited for the editor: ' + say(ld));
  T.assert(!US.jobs.current, 'the editor is free again');
} finally {
  US.ai = was.ai; B.search = was.search; B.net.download = was.download; B.defaultFolder = was.folder; US.tools.open = was.open; US.settings.set('brollfinder', was.settings); ALONE_KEYS.forEach((k, i) => { if (wasAlone[i] !== undefined) US.settings.set('askAlone.' + k, wasAlone[i]); }); C._waitEvery = was.tick;
  for (const s of await seqsNamed(/^Ask . Test . Big boats/)) await US.host.call('deleteSequence', { seqId: s.id }).catch(() => {});
  await US.host.call('askRemoveBins', { paths: ['Test – Ask agent / Empty one', 'Test – Ask agent', 'JMG Ultra Studio / Ask'] }).catch(() => {});
}
/* the commands themselves */
const all = await US.host.call('askBins', {});
T.assert(all.total >= 1 && all.bins.every(x => x.path && x.clips >= 0 && x.bins >= 0), 'askBins lists every bin with counts: ' + JSON.stringify(all).slice(0, 300));
const ids = await US.host.call('askFind', { idsOnly: true }), some = await US.host.call('askFind', { name: 'C001', kinds: ['video'], limit: 5 });
T.assert(ids.total === ids.ids.length && ids.total > 0 && some.items.length >= 1 && some.items.every(i => /C001/i.test(i.name) && i.kind === 'video' && i.bin), 'askFind: ' + JSON.stringify(some).slice(0, 300));
/* the screen: the Ask button on the rail takes the working ring and the done dot */
out.rail = !!document.querySelector('.rail-ask, .rail-btn[data-id="assistant"]');
return out;
