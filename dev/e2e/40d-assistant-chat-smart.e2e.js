// costs-ai – real AI requests (roughly $0.50–$2 in all): run with `node dev/e2e/run.js 40d` or E2E_AI=1
// Ask, given hard requests by the real AI in real Premiere (the user asked for this, 18 Nov 2026) – does it understand
// what is meant, and does Premiere end up as asked? Five requests in four chats:
//  A  a story from an interview: “how her father's saying about the open door came true” – start on the saying, no
//     introduction, no ums, end on the legacy line, about 40 seconds;
//  A2 a follow-up in the same chat: a 20-second version with the same opening and ending, keeping the first;
//  B  a compound edit that needs working out: take out the technically bad shots going by their names, close the gaps,
//     punch in on the rest, and mark the longest shot that is LEFT (the longest of all is one of the bad ones);
//  C  something Premiere can't do (colour clips on a timeline): it must say so and offer what works – not pretend;
//  D  a question, at the same time as C: answered from the project and the interview, changing nothing.
// Everything each chat understood, planned, did, was told and reported – and every Premiere command – is written to
// a report (the path is in the result) so the whole process can be read, not only the pass marks. Safety is asserted
// hard (the editor's own sequences untouched, nothing missing); how well it understood is a list of checks, all shown.
const fs = require('fs'), path = require('path'), os = require('os');
const C = US.chat, S = US.story; T.assert(C && S, 'the chat and Story are loaded');
T.assert(US.ai && US.ai.available(), 'AI is set up in Settings');
const OUT = path.join(os.tmpdir(), 'us-e2e-ask-smart.md');
const BIN = 'Test – Ask smart', NAME = 'Test – Ask smart';
const checks = [], check = (who, ok, msg) => { checks.push({ who, ok: !!ok, msg }); return !!ok; };
const report = ['# Ask – hard requests in real Premiere', '', new Date().toISOString(), ''];
const covers = (c, t) => c.in <= t && c.out >= t;   // a clip that plays this moment of the interview
const at = (x, pct) => Math.abs(Number(x.scale) - pct) < 0.6;
const v1 = info => (info.video[0] || { clips: [] }).clips;
const clipsLine = cl => cl.map(c => `${c.name} ${(+c.in).toFixed(1)}–${(+c.out).toFixed(1)} @${(+c.start).toFixed(1)}`).join(' | ');

// every command sent to Premiere while the chats work
const hostReal = US.host.call, hostLog = [];
US.host.call = function (fn, a) { hostLog.push({ t: Date.now(), fn, seqId: a && a.seqId, op: a && a.op, n: a && a.targets ? a.targets.length : undefined, name: a && a.name }); return hostReal.apply(this, arguments); };
const READS = /^(list|sequenceInfo|editRead|editSelection|binItems|itemInfo|itemsInfo|activeSequence|projectInfo|getContext|context|selection|markers$|readMarkers|ping)/;

const prevBase = US.settings.get('story.binBase');
const st = S.loadState();
const saved = JSON.parse(JSON.stringify({ transcripts: st.transcripts, speakers: st.speakers, scope: st.scope || null, themes: st.themes || [], asks: st.asks || [] }));
const made = [];   // sequences the chats made, removed at the end
async function talk(key, chat, text, opts, answers = {}) {
  const ev = [], cards = [], asked = [], h0 = hostLog.length, t0 = Date.now(), spent0 = chat.spent || 0, turns0 = chat.turns.length;
  const hooks = { event: e => ev.push(e), status() {},
    approve: async card => { cards.push({ risk: card.risk, title: card.title, detail: card.detail, dropped: card.dropped || [], steps: (card.steps || []).map(s => US.editAsk.describe(s)) }); return { ok: true }; },
    // a risky step (the editor's own sequence itself, a lot at once…) stops at the warning instead of a card: counted the same way
    warn: async w => { cards.push({ risk: w.risk, title: w.title, detail: w.detail, dropped: [], steps: [], warned: w.reasons.map(r => r.id) }); return 'continue'; },
    choose: async q => { const pick = (answers.choose && answers.choose(q)) || (q.options || [])[0] || 'you decide'; asked.push({ question: q.question, options: q.options || [], answered: pick }); return pick; },
    limit: async () => 'stop' };
  let error = '';
  try { await C.send(chat, text, hooks, Object.assign({ maxSteps: 16, budget: 1 }, opts)); } catch (e) { error = e.title || e.message || String(e); }
  const end = ev.filter(e => e.k === 'end').pop(), steps = ev.filter(e => e.k === 'step');
  const r = { key, ev, cards, asked, end, steps, error, tools: steps.map(s => s.tool), warns: ev.filter(e => e.k === 'warn').map(e => e.text), host: hostLog.slice(h0), seconds: Math.round((Date.now() - t0) / 1000), cost: (chat.spent || 0) - spent0 };
  for (const v of chat.versions || []) if (!made.includes(v.seqId)) made.push(v.seqId);
  for (const j of chat.journal || []) { if (j.kind === 'seq' && !made.includes(j.seqId)) made.push(j.seqId); if (j.backupId && !made.includes(j.backupId)) made.push(j.backupId); }   // and the copies kept from before a change in place
  // the report: the conversation as the editor saw it, then what the AI was told after each step
  report.push(`## ${key}`, '', `**Asked** (${opts.mode}): ${text}`, '', `**Understood:** ${(ev.find(e => e.k === 'understood') || {}).text || '—'}`, `**Plan:** ${((ev.find(e => e.k === 'plan') || {}).plan || []).join(' → ') || '—'}`, '');
  for (const e of ev) {
    if (e.k === 'say') report.push(`- _${e.text}_`);
    else if (e.k === 'step') report.push(`- **${e.tool}** – ${e.text}`);
    else if (e.k === 'result') report.push(`  - ${e.text}`);
    else if (e.k === 'warn') report.push(`- ⚠ ${e.text}`);
  }
  for (const c of cards) report.push(`- card (${c.risk}): ${c.title || ''} – ${c.detail || ''}${c.steps.length ? ' – steps: ' + c.steps.join(' | ') : ''}${c.dropped.length ? ' – left out: ' + c.dropped.join('; ') : ''}`);
  for (const q of asked) report.push(`- question: ${q.question} [${q.options.join(' / ')}] → answered “${q.answered}”`);
  if (error) report.push(`- ERROR thrown: ${error}`);
  if (end) report.push('', `**Report:** ${end.reply}`, `- done: ${end.done.join(' · ') || '—'}`, `- not done: ${end.notDone.join(' · ') || '—'}`, `- to check: ${end.check.join(' · ') || '—'}`, `- next: ${end.next.join(' · ') || '—'}`);
  else report.push('', '**No report – it did not finish.**');
  report.push('', `${steps.length} steps · ${r.seconds} s · ${US.ai.fmtUSD(r.cost)} · ${chat.usedModel || US.ai.label()} · Premiere commands that change things: ${r.host.filter(h => !READS.test(h.fn)).map(h => h.fn + (h.op ? ':' + h.op : '') + (h.n != null ? '×' + h.n : '')).join(', ') || 'none'}`, '');
  report.push('<details><summary>What the AI was told after each step</summary>', '', ...chat.turns.slice(turns0).map((t, i) => '```\n' + `[${i}] AI: ${String(t.assistant || '').slice(0, 700)}\n→ ${String(t.user || '').slice(0, 1800)}` + '\n```'), '', '</details>', '');
  check(key, end && !error, `finished with a report${error ? ' – ' + error : ''}`);
  check(key, ev.some(e => e.k === 'understood' && e.text.length > 15) && ev.some(e => e.k === 'plan' && e.plan.length), 'said what it understood and showed a plan');
  check(key, !/Illegal Parameter|HOST_SCRIPT|is not a function|undefined is not/.test(chat.turns.slice(turns0).map(t => t.user).join('\n')), 'no step failed with a scripting error');
  check(key, !r.warns.length, 'no warnings' + (r.warns.length ? ': ' + r.warns.join(' | ').slice(0, 300) : ''));
  return r;
}
const free = async () => { for (let i = 0; i < 150 && US.jobs.current; i++) await T.sleep(200); };
let seqsBefore = [], seq = null, origBefore = null, fatal = null, labelsBefore = [];
try {
  // ---- the material: one interview with its transcript; a rough assembly of six concert shots ----
  US.settings.set('story.binBase', BIN);
  st.transcripts = []; st.speakers = {}; st.themes = []; st.scope = { kind: 'all' }; if (S.reindex) S.reindex(); S.save();
  const [ruth] = await T.importOnce([T.media('interview', 'I001_interview.mp4')], BIN);
  await S.importFiles(US.jobs.testJob('story'), [T.media('transcripts', 'I001_interview.srt')]);
  T.assert(S.state().transcripts.some(t => t.lines.length > 8), 'the interview’s transcript is in Story');
  const shots = [['C001_sharp_static.mp4', 4], ['C002_blurry.mp4', 3], ['C009_slow_pan_good.mp4', 6], ['C003_dark.mp4', 7], ['C005_shaky.mp4', 2], ['C007_reveal_pullback.mp4', 5]];
  const items = await T.importOnce(shots.map(s => T.media('concert', s[0])), BIN);
  seq = await T.freshSequence(NAME, items[0].id, BIN);
  await US.host.call('placeClips', { seqId: seq.id, cursor: 0, clips: items.map((it, i) => ({ id: it.id, in: 0, out: shots[i][1] })) });
  for (const s of (await US.host.call('listSequences')).filter(s => s.name === `${NAME} – Ask`)) await US.host.call('deleteSequence', { seqId: s.id });
  labelsBefore = (await US.host.call('itemsInfo', { ids: items.map(it => it.id) })).map((x, i) => ({ id: items[i].id, label: x ? x.label : null }));
  await T.open(seq.id);
  seqsBefore = await US.host.call('listSequences');
  origBefore = await US.host.call('editRead', { seqId: seq.id });
  T.assert(v1(origBefore).length === 6, 'six shots in the assembly');
  const same = (a, b) => JSON.stringify(v1(a).map(c => [c.name, +(+c.start).toFixed(2), +(+c.end).toFixed(2), c.scale, c.disabled])) === JSON.stringify(v1(b).map(c => [c.name, +(+c.start).toFixed(2), +(+c.end).toFixed(2), c.scale, c.disabled]));   // the clips: which, where, how big, on or off
  const marks = x => (x.markers || []).map(m => [m.name, +(+m.start).toFixed(2)]);

  // ---- A: a story from the interview ----
  await free();
  const a = C.newChat();
  const ra = await talk('A – a story from the interview', a, 'From Ruth’s interview, build me a cut of about 40 seconds that tells one story: how her father’s saying about the open door came true in her own life. Open on the saying itself, skip her introduction and any umming, and finish on what she wants her legacy to be.', { mode: 'never' });
  const va = (a.versions || [])[0];
  let infoA = null;
  if (check(ra.key, va && va.seqId !== seq.id, 'it built a new sequence: ' + (va ? va.name : 'none'))) {
    infoA = await US.host.call('sequenceInfo', { seqId: va.seqId }); const cl = v1(infoA);
    report.push(`Premiere now has “${va.name}”: ${cl.length} clips, ${(+infoA.duration).toFixed(1)} s – ${clipsLine(cl)}`, '');
    check(ra.key, infoA.duration >= 22 && infoA.duration <= 62, `about 40 seconds: ${(+infoA.duration).toFixed(1)} s`);
    check(ra.key, cl.length && covers(cl[0], 22.5), 'opens on the father’s saying (0:19.7–0:26.0): first clip ' + (cl[0] ? `${cl[0].in}–${cl[0].out}` : '—'));
    check(ra.key, !cl.some(c => covers(c, 2.5)), 'no introduction (“My name is Ruth…”)');
    check(ra.key, !cl.some(c => covers(c, 28.7)) && !cl.some(c => covers(c, 73)), 'neither of the “um” lines (0:26.5, 1:11.5)');
    check(ra.key, cl.some(c => covers(c, 68.2)), 'has “That’s when I understood what my father meant about the open door” (1:06.5)');
    check(ra.key, cl.length && covers(cl[cl.length - 1], 85.5), 'ends on the legacy line (1:21.9–1:29.4): last clip ' + (cl.length ? `${cl[cl.length - 1].in}–${cl[cl.length - 1].out}` : '—'));
    report.push(cl.every((c, i) => !i || c.in >= cl[i - 1].in) ? 'The lines are in the order she says them.' : 'The lines are NOT in the order she says them (nobody asked for that – see whether it said why).', '');
    check(ra.key, (a.versions || []).length === 1, `one build was enough – no second go to put right what the first lost: ${(a.versions || []).map(v => v.name).join(' | ')}`);
  }
  check(ra.key, ra.tools.includes('build') && (ra.tools.includes('lines') || ra.tools.includes('search') || ra.tools.includes('interviews')), 'it read the interview before building: ' + ra.tools.join(', '));

  // ---- A2: a follow-up that leans on the chat so far ----
  await free();
  const ra2 = await talk('A2 – a follow-up in the same chat', a, 'Good. Now a shorter one as well, about 20 seconds, with the same opening and the same ending – keep the first version.', { mode: 'never' });
  const vb = (a.versions || []).filter(v => !va || v.seqId !== va.seqId).pop();
  if (check(ra2.key, vb && va, 'a second sequence was made: ' + (vb ? vb.name : 'none'))) {
    const info2 = await US.host.call('sequenceInfo', { seqId: vb.seqId }), cl = v1(info2);
    report.push(`Premiere now has “${vb.name}”: ${cl.length} clips, ${(+info2.duration).toFixed(1)} s – ${clipsLine(cl)}`, '');
    check(ra2.key, info2.duration >= 11 && info2.duration <= 31 && info2.duration < infoA.duration, `about 20 seconds and shorter than the first (${(+infoA.duration).toFixed(1)} s): ${(+info2.duration).toFixed(1)} s`);
    check(ra2.key, cl.length && covers(cl[0], 22.5) && covers(cl[cl.length - 1], 85.5), 'the same opening and ending');
    const still = await US.host.call('sequenceInfo', { seqId: va.seqId }).catch(() => null);
    check(ra2.key, still && Math.abs(still.duration - infoA.duration) < 0.1, 'the first version is still there, unchanged');
  }
  check(ra2.key, ra2.steps.length <= 6, `it didn’t start from scratch: ${ra2.steps.length} steps (${ra2.tools.join(', ')})`);

  // ---- B: a compound edit that needs working out ----
  await T.open(seq.id); await free();
  const b = C.newChat();
  const rb = await talk('B – a compound edit', b, `In “${NAME}”: going by the file names, take out the shots that are technically bad and close up the gaps, punch in to 110% on everything that’s left, and put a marker called Longest on the longest shot that remains.`, { mode: 'ask' });
  const wb = b.work;
  if (check(rb.key, wb && wb.ours && wb.seqId !== seq.id, 'it worked on a copy: ' + JSON.stringify(wb || null))) {
    const copy = await US.host.call('editRead', { seqId: wb.seqId }), cl = v1(copy);
    report.push(`Premiere now has “${wb.name}”: ${cl.length} clips – ${clipsLine(cl)} · scale ${cl.map(c => c.scale).join(', ')} · markers ${JSON.stringify((copy.markers || []).map(m => [m.name, +(+m.start).toFixed(2)]))}`, '');
    const names = cl.map(c => c.name).join(' ');
    check(rb.key, cl.length === 3 && /C001/.test(names) && /C009/.test(names) && /C007/.test(names), 'the blurry, dark and shaky shots are gone and the three good ones stay: ' + names);
    check(rb.key, cl.length && Math.abs(cl[0].start) < 0.05 && cl.every((c, i) => !i || Math.abs(c.start - cl[i - 1].end) < 0.05), 'no gaps left');
    check(rb.key, cl.length && cl.every(c => at(c, 110)), 'every shot left is at 110%: ' + cl.map(c => c.scale));
    const longest = cl.find(c => /C009/.test(c.name)), mk = (copy.markers || []).filter(m => /longest/i.test(m.name));
    check(rb.key, mk.length === 1 && longest && mk[0].start >= longest.start - 0.05 && mk[0].start < longest.end, 'one marker “Longest”, on the slow pan (the longest shot LEFT – the dark one was longer): ' + JSON.stringify(mk.map(m => m.start)));
  }
  check(rb.key, rb.cards.length >= 1 && rb.cards.every(c => c.risk !== 'own'), 'it asked before changing, and only ever to work on a copy: ' + rb.cards.map(c => c.risk).join(','));
  const afterB = await US.host.call('editRead', { seqId: seq.id });
  T.assert(same(afterB, origBefore) && !marks(afterB).length, 'B left the editor’s own sequence exactly as it was');

  // ---- C and D at the same time: something Premiere can't do; and a question ----
  await T.open(seq.id); await free();
  const c = C.newChat(), d = C.newChat();
  const [rc, rd] = await Promise.all([
    talk('C – something Premiere can’t do', c, `Colour the technically bad shots in “${NAME}” red on the timeline so I can spot them at a glance.`, { mode: 'own' }, { choose: q => (q.options || []).find(o => /marker/i.test(o)) }),
    talk('D – a question, nothing to change', d, `Don’t change anything – just tell me: how many shots are in “${NAME}” and which one is the longest, and what does Ruth say about her grandmother?`, { mode: 'never' })]);
  const said = r => [r.end ? r.end.reply : '', ...(r.end ? r.end.notDone.concat(r.end.done, r.end.next) : []), ...r.asked.map(q => q.question + ' ' + q.options.join(' ')), ...r.ev.filter(e => e.k === 'say' || e.k === 'understood').map(e => e.text)].join(' ');
  check(rc.key, !rc.host.some(h => h.fn === 'editApply' && h.op === 'label'), 'it never tried to colour timeline clips');
  check(rc.key, /can.t|cannot|isn.t (possible|able)|not possible|doesn.t (let|allow)|no way/i.test(said(rc)), 'it said plainly that Premiere can’t do this');
  check(rc.key, /\bbin\b|marker/i.test(said(rc)), 'and offered what does work (colour in the bin, or markers)');
  const afterC = await US.host.call('editRead', { seqId: seq.id });
  check(rc.key, same(afterC, origBefore), 'the editor’s own clips are as they were');
  const mk = marks(afterC), badShots = v1(afterC).filter(x => /C002|C003|C005/.test(x.name)), onBad = m => badShots.some(x => m[1] >= x.start - 0.05 && m[1] < x.end);
  report.push(`After C, “${NAME}” has markers: ${JSON.stringify(mk)}`, '');
  if (mk.length) {
    check(rc.key, rc.cards.some(k => k.risk === 'own'), 'markers on the editor’s own sequence came after a card saying it changes the sequence itself');
    check(rc.key, mk.length === 3 && mk.every(onBad), 'one marker on each bad shot and nowhere else: ' + JSON.stringify(mk));
    check(rc.key, !/nothing (in|on) your sequence has changed|unchanged|untouched/i.test(rc.end ? rc.end.reply : ''), 'and its report doesn’t claim the sequence is unchanged');
  }
  if (c.work && c.work.ours) { const cc = await US.host.call('editRead', { seqId: c.work.seqId }); report.push(`C worked on “${c.work.name}”: markers ${JSON.stringify((cc.markers || []).map(m => [m.name, +(+m.start).toFixed(2)]))}`, ''); const bad = v1(cc).filter(x => /C002|C003|C005/.test(x.name)); check(rc.key, !(cc.markers || []).length || bad.every(x => (cc.markers || []).some(m => m.start >= x.start - 0.05 && m.start < x.end)), 'if it used markers, each bad shot has one'); }
  const replyD = rd.end ? rd.end.reply : '';
  check(rd.key, !rd.tools.some(t => /^(edit|build|action|version)$/.test(t)) && !rd.cards.length, 'it changed nothing: ' + rd.tools.join(', '));
  check(rd.key, /\b(6|six)\b/i.test(replyD), 'six shots');
  check(rd.key, /dark|C003/i.test(replyD), 'the longest is the dark one (7 s)');
  check(rd.key, /candle/i.test(replyD), 'her grandmother taught her to light the candles');
  check(rd.key, rd.steps.length <= 5, `without wandering: ${rd.steps.length} steps (${rd.tools.join(', ')})`);
  const last = await US.host.call('editRead', { seqId: seq.id });
  T.assert(same(last, origBefore), 'the editor’s own clips are exactly as they were after all four chats');
  T.assert(!marks(last).length || rc.cards.some(k => k.risk === 'own'), 'no marker went on the editor’s own sequence without a card first: ' + JSON.stringify(marks(last)));
  const seqsAfter = await US.host.call('listSequences');
  T.assert(seqsBefore.every(x => seqsAfter.some(y => y.id === x.id)), 'no sequence of the project went missing');
  T.assert(!US.jobs.current, 'Premiere is free again');
  report.push('## Cost', '', [['A', a], ['B', b], ['C', c], ['D', d]].map(([k, ch]) => `${k}: ${US.ai.fmtUSD(ch.spent || 0)} in ${ch.steps || 0} steps`).join(' · '), '');
} catch (e) { fatal = e; report.push('', '## Stopped early', '', String((e && (e.stack || e.message)) || e)); }
finally {
  US.host.call = hostReal;
  const s2 = S.state(); Object.assign(s2, JSON.parse(JSON.stringify(saved))); if (S.reindex) S.reindex(); S.save();
  US.settings.set('story.binBase', prevBase || '');
  // C may have coloured the clips in the bin (what it should offer): put their colours back
  const back = labelsBefore.filter(x => x.label != null); if (back.length) await hostReal.call(US.host, 'setLabels', { items: back }).catch(() => {});
  for (const id of made) if (!seqsBefore.some(s => s.id === id)) await hostReal.call(US.host, 'deleteSequence', { seqId: id }).catch(() => {});
  const failed = checks.filter(x => !x.ok);
  report.splice(4, 0, '## Checks', '', ...checks.map(x => `- ${x.ok ? '✓' : '✗'} **${x.who.split(' – ')[0]}** ${x.msg}`), '', `${checks.length - failed.length} of ${checks.length} passed`, '');
  try { fs.writeFileSync(OUT, report.join('\n'), 'utf8'); } catch (e) { /* the result still has the checks */ }
}
if (fatal) throw fatal;
const failed = checks.filter(x => !x.ok);
T.assert(!failed.length, `${failed.length} of ${checks.length} checks failed (full report: ${OUT}):\n` + failed.map(x => `      ✗ ${x.who.split(' – ')[0]}: ${x.msg}`).join('\n'));
return { report: OUT, passed: `${checks.length} of ${checks.length}`, checks: checks.map(x => `${x.who.split(' – ')[0]}: ${x.msg}`) };
