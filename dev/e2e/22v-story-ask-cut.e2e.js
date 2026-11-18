// Ask your interviews › Already in your cut, in real Premiere (no AI cost: the AI's reply is a stand-in).
// A cut with the interview from 2.0–9.0 and 54.0–66.13; an answer with a clip inside the cut, one outside it and one
// that straddles a cut. Checked against the sequence: marked whole / partly / not; “Take those out” leaves the unused;
// and “what haven’t I used yet?” tells the AI which lines the cut has (ids only) and never gives a used clip back.
if (!US.story || !US.storyAsk) throw new Error('Story (Ask) is not loaded in the panel');
const S = US.story, A = US.storyAsk;
const fs = require('fs');
const BIN = 'Test – Story', SEQ = 'Test – Ask cut';
const prevBase = US.settings.get('story.binBase');
US.settings.set('story.binBase', BIN);
const st = S.loadState();
const savedAsks = JSON.parse(JSON.stringify(st.asks || [])), savedScope = JSON.parse(JSON.stringify(st.scope || null)), realAI = US.ai;
try {
  const [ruth] = await T.importOnce([T.media('interview', 'I001_interview.mp4')], BIN);
  T.assert(ruth, 'interview imported');
  const job = US.jobs.testJob('story');
  await S.importFiles(job, [T.media('transcripts', 'I001_interview.srt')]);
  const real = p => { try { return fs.realpathSync(p); } catch (e) { return p; } };
  const tr = st.transcripts.find(t => t.path && real(t.path) === real(ruth.path));
  T.assert(tr && tr.lines.length > 8, 'the interview’s transcript is linked');
  st.scope = { kind: 'all' }; S.save();

  const old = await T.seqByName(SEQ); if (old) await US.host.call('deleteSequence', { seqId: old.id });
  const seq = await US.host.call('newSequence', { name: SEQ, binPath: BIN, likeId: ruth.id });
  await US.host.call('placeClips', { seqId: seq.id, cursor: 0, clips: [{ id: ruth.id, in: 2, out: 9 }, { id: ruth.id, in: 54, out: 66.13 }] });
  const tl = await S.timelineTranscript(job, { seqId: seq.id });
  const heard = new Set(tl.result.entries.map(e => e.lineId)), L = tr.lines;
  const inIdx = L.map((l, i) => (heard.has(l.id) ? i : -1)).filter(i => i >= 0);
  T.assert(inIdx.length >= 3 && inIdx.length < L.length - 2, 'some lines in the cut, some not: ' + inIdx.join(','));
  // a run of lines in the cut, the first line after it, and a stretch outside the cut (two lines, neither heard)
  const run = [inIdx[0]]; while (heard.has((L[run[run.length - 1] + 1] || {}).id)) run.push(run[run.length - 1] + 1);
  const after = run[run.length - 1] + 1;
  // (not right after the straddling clip: clips next to each other in one group are joined into one)
  const out = L.findIndex((l, i) => i > after + 1 && !heard.has(l.id) && L[i + 1] && !heard.has(L[i + 1].id) && !heard.has((L[i - 1] || {}).id));
  T.assert(out > 0 && !heard.has(L[after].id), 'lines to test with');
  const item = (a, b, note) => ({ key: tr.key, from: L[a].id, to: L[b].id, lead: '', note, score: 0.8 });
  const groups = () => [{ name: 'In the cut', summary: '', label: 1, items: [item(run[0], run[run.length - 1], 'used')] }, { name: 'Mixed', summary: '', label: 2, items: [item(run[run.length - 1], after, 'straddles the cut'), item(out, out + 1, 'not used')] }];

  // 1. an answer checked against the sequence (the card's button): the open sequence is the cut
  const ask = { id: US.uid('ask'), request: 'every story about the bakery', at: Date.now(), rounds: [{ text: 'every story about the bakery', parts: [] }], result: { answer: 'Three clips.', groups: groups() }, scope: 'all interviews', by: 'test' };
  st.asks = [ask].concat(st.asks || []); S.save();
  await T.open(seq.id);
  const r1 = await S.askCut(job, { askId: ask.id });
  T.assert(r1.cut.seqId === seq.id && r1.cut.name === SEQ, 'checked against the open sequence');
  T.assert(r1.totals.all === 1 && r1.totals.part === 1 && r1.totals.clips === 3, 'one whole, one partly, of three: ' + JSON.stringify(r1.totals) + ' ' + r1.summary);
  const card = S.askCard(ask, {});
  const pills = Array.from(card.querySelectorAll('.ask-incut')).map(p => p.textContent);
  T.assert(pills.join('|') === 'in your cut|partly in your cut', 'the card marks them: ' + pills.join('|'));
  T.assert(/1 of 3 clips already in “Test – Ask cut” · 1 partly/.test(card.textContent), 'the card says how many: ' + card.querySelector('.ask-cut').textContent);
  T.assert(S.askLeaveOut(ask.id) === 1, 'Take those out: one clip goes');
  T.assert(ask.result.groups.map(g => g.name).join('|') === 'Mixed' && ask.result.groups[0].items.length === 2, 'the whole-in-the-cut clip and its group are gone; partly and unused stay');

  // 2. “what haven’t I used yet?”: the cut's lines go to the AI as ids after the task; used clips never come back
  const sent = [];
  US.ai = Object.assign({}, realAI, { available: () => true, label: () => 'Claude', provider: () => 'claude', approveTotal: async () => {},
    json: async req => { sent.push(req); return { answer: 'Here is what is left.', groups: groups().map(g => ({ key: '', name: g.name, summary: '', items: g.items.map(it => ({ from: it.from, to: it.to, lead: '', note: it.note, score: 0.8, tag: '' })) })) }; } });
  const r2 = await S.askInterviews(job, { request: 'which bakery stories haven’t I used yet?' });
  const task = sent[0].user[1];
  T.assert(/cut already uses these lines/.test(task) && task.includes(L[run[0]].id), 'the AI is told which lines the cut has: ' + task.slice(-300));
  T.assert(!task.includes(SEQ) && !/I001_interview/.test(task), 'ids only – no sequence or file names');
  T.assert(typeof sent[0].user[0].text === 'string' && !/cut already uses/.test(sent[0].user[0].text), 'the shared transcript is unchanged (still cached)');
  const names = r2.ask.result.groups.map(g => `${g.name}:${g.items.length}`).join('|');
  T.assert(names === 'Mixed:2', 'the used clip never comes back, whatever the AI says: ' + names);
  T.assert(r2.ask.cut && r2.ask.cut.name === SEQ, 'and the answer is marked against the cut');
  US.ai = realAI;
  return { heard: heard.size, totals: r1.totals, summary: r1.summary, note: task.split('\n').find(x => /already uses/.test(x)).slice(0, 120) };
} finally {
  US.ai = realAI;
  st.asks = savedAsks; if (savedScope) st.scope = savedScope; S.save();
  US.settings.set('story.binBase', prevBase || '');
}
