// Story › 3 Find › Best lines (1.3.43), in the real editor: the button in Find, the box that says what is judged –
// the words, and how each line is said only when Listen to delivery is on and has heard it – the lines found (no AI:
// nothing sent), ticked and built into a sequence. Delivery is stood in for the second half (no model, no cost).
if (!US.story || !US.storyBest) throw new Error('Story and Best lines are not loaded in the panel');
const S = US.story, B = US.storyBest, D = US.delivery, fs = require('fs');
const BIN = 'Test – Story';
for (let i = 0; i < 100 && US.jobs.current; i++) await T.sleep(200);
const st = S.loadState();
const saved = JSON.parse(JSON.stringify({ scope: st.scope || { kind: 'all' }, best: st.best || null, picked: st.picked || [] }));
const keep = { best: US.settings.get('story.best'), bd: US.settings.get('story.bestDelivery'), settings: D.settings, plan: D.plan, forLine: D.forLine, ai: US.ai.json, tool: US.tools.current };
const $$ = (q, root) => Array.from((root || document).querySelectorAll(q));
const pane = () => document.querySelector('.tool:not(.hidden) .story-pane:not(.hidden)');
let sent = 0, made = [];
const info = {};
try {
  US.ai.json = async () => { sent++; throw new Error('this test must not send anything to AI'); };
  const [ruth] = await T.importOnce([T.media('interview', 'I001_interview.mp4')], BIN);
  await S.importFiles(US.jobs.testJob('story'), [T.media('transcripts', 'I001_interview.srt')]);
  st.scope = { kind: 'all' }; st.best = null; st.picked = []; S.save();
  US.settings.set('story.best', { count: 10, maxLen: 30, per: 0, useAI: false });
  US.settings.set('story.bestDelivery', true);

  // 1. Find has a Best lines button; the box says only the words are judged while Listen to delivery is off
  S.open('best');
  const bestBtn = () => pane() && $$('.story-find-row button', pane()).find(b => b.textContent.trim() === 'Best lines');
  for (let i = 0; i < 30 && !(bestBtn() && bestBtn().classList.contains('primary') && pane().querySelector('.best-uses')); i++) await T.sleep(150);
  const btn = bestBtn();
  T.assert(btn && btn.classList.contains('primary'), 'Story › 3 Find has a Best lines button, chosen: ' + (pane() ? $$('.story-find-row button', pane()).map(b => b.textContent.trim() + (b.classList.contains('primary') ? '*' : '')).join(', ') : 'no pane'));
  const box = () => pane().querySelector('.best-uses');
  T.assert(box() && /What Best lines judges/.test(box().textContent) && /The words/.test(box().textContent), 'the box says what is judged');
  if (!D.settings().on) T.assert(box().dataset.listening === 'no' && /Off for this project – only the words are judged/.test(box().textContent), 'delivery off: only the words – ' + box().textContent.slice(0, 260));
  info.offText = box().textContent.replace(/\s+/g, ' ').slice(0, 220);

  // 2. found on the words alone, and shown best first
  const go = $$('button', pane()).find(b => /^Find the best lines/.test(b.textContent.trim()));
  T.assert(go, 'a Find the best lines button');
  go.click();
  for (let i = 0; i < 100 && (US.jobs.current || !S.state().best); i++) await T.sleep(150);
  await T.sleep(300);
  const r = S.state().best;
  T.assert(r && r.list.length >= 3 && r.by === 'basic' && r.withDelivery === false && sent === 0, 'found without AI, on the words: ' + (r && r.summary));
  T.assert(r.list.every(x => { const l = S.lineOf(x.lineId); return l && l.end - l.start <= 30 && !S.isInterviewer(l); }), 'no interviewer lines, none longer than 30 s');
  T.assert(/judged on the words only – no listening/.test(r.summary), r.summary);
  const rows = $$('.story-best .story-row', pane());
  T.assert(rows.length === r.list.length, `a row for each (${rows.length} of ${r.list.length})`);
  info.found = r.list.slice(0, 5).map(x => `${x.score} ${S.lineOf(x.lineId).text.slice(0, 60)}`);

  // 3. tick them all and build a sequence
  const all = $$('button', pane()).find(b => /^Select all/.test(b.textContent.trim()));
  T.assert(all, 'Select all'); all.click(); await T.sleep(300);
  T.assert((S.state().picked || []).length === r.list.length, 'all ticked');
  const before = (await US.host.call('listSequences')).map(s => s.id);
  await US.actions.run('story.build', { source: 'picked', name: 'Test – Best lines' });
  for (let i = 0; i < 100 && US.jobs.current; i++) await T.sleep(200);
  const seqs = (await US.host.call('listSequences')).filter(s => !before.includes(s.id)); made = seqs.map(s => s.id);
  const built = seqs.find(s => s.name === 'Test – Best lines');
  T.assert(built, 'the sequence was built: ' + seqs.map(s => s.name).join(', '));
  const si = await US.host.call('sequenceInfo', { seqId: built.id });
  // only lines from interviews linked to a clip in the project can be placed (the other test transcripts have no media); next to each other they join
  const linked = r.list.filter(x => { const t = S.interviewOf(x.lineId); return t && t.path && fs.existsSync(t.path); });
  T.assert(linked.length >= 1 && si.duration > 0 && si.video[0].clips.length >= 1, `its clips (${si.video[0].clips.length} video, ${si.audio[0].clips.length} audio, ${si.duration.toFixed(1)} s) for ${linked.length} of ${r.list.length} lines that have media`);
  info.built = { lines: r.list.length, withMedia: linked.length, clips: si.video[0].clips.length, seconds: +si.duration.toFixed(1) };

  // 4. with delivery heard (stood in): the box says yes, by whom and how many; delivery counts – and can be switched off
  const lines = S.scopeLines(), heard = new Map(lines.slice(0, 6).map((l, i) => [l.id, { score: i % 2 ? 5 : 2, notes: [i % 2 ? 'warm' : 'flat'], energy: '', in: true, out: true }]));
  D.settings = () => ({ on: true, where: 'local', localModel: 'gemma-4-e2b', cloudModel: '', langs: {} });
  D.plan = () => ({ kind: 'helper', label: 'Gemma 4 E2B', why: '' });
  D.forLine = l => heard.get(l && l.id) || null;
  S.open('best'); await T.sleep(500);
  T.assert(box().dataset.listening === 'yes' && new RegExp(`Gemma 4 E2B on this computer has listened to 6 of ${lines.length} lines`).test(box().textContent) && /Use how lines are said/.test(box().textContent), 'delivery heard: the box says so – ' + box().textContent.replace(/\s+/g, ' ').slice(0, 300));
  const r2 = await B.find(US.jobs.testJob('best'), { count: 10 });
  T.assert(r2.withDelivery && /how \d+ of them (is|are) said \(listened to\)/.test(r2.summary), r2.summary);
  US.settings.set('story.bestDelivery', false);
  S.open('best'); await T.sleep(400);
  T.assert(box().dataset.listening === 'no' && /Switched off for Best lines: only the words are judged/.test(box().textContent), 'switched off here: only the words');
  const r3 = await B.find(US.jobs.testJob('best'), { count: 10 });
  T.assert(!r3.withDelivery && r3.usedDelivery === 0 && sent === 0, 'switched off: delivery not used, nothing sent');
  info.withDelivery = r2.summary; info.switchedOff = r3.summary;
  return info;
} finally {
  US.ai.json = keep.ai; D.settings = keep.settings; D.plan = keep.plan; D.forLine = keep.forLine;
  US.settings.set('story.best', keep.best === undefined ? null : keep.best);
  US.settings.set('story.bestDelivery', keep.bd === undefined ? null : keep.bd);
  Object.assign(st, { scope: saved.scope, picked: saved.picked }); if (saved.best) st.best = saved.best; else delete st.best;
  S.save();
  for (const id of made) await US.host.call('deleteSequence', { seqId: id }).catch(() => {});
  if (keep.tool) US.tools.open(keep.tool);
}
