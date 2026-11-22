// Selects, 1.3.43, in the real editor:
//  A. a selects sequence is made straight from the clips – no subclip per select (that made Premiere slow to respond),
//     the right number of clips and length, the source clips' own colour labels put back, and quicker than before;
//  B. Check usability with the vision model on this computer (the one chosen in Settings – Gemma 4 E2B here): every
//     select looked at gets a verdict, unusable ones leave the grade, nothing is sent anywhere; the card shows.
// Real model, no cloud, no cost. Skips B when no vision model is installed on this computer.
const BIN = 'Test – Selects';
const S = US.selects, L = US.selectsLook, info = {};
const names = ['C001_sharp_static', 'C002_blurry', 'C003_dark', 'C009_slow_pan_good', 'C010_mixed'];
const items = await T.importOnce(names.map(n => T.media('concert', n + '.mp4')), BIN);
const full = await US.host.call('itemsInfo', { ids: items.map(i => i.id) });
const keepSel = Object.assign({}, S.state.settings), keepLook = US.settings.get('selects.look', null);
Object.assign(S.state.settings, { footage: 'concert', picky: 'normal', overrides: {}, heroCount: 5, autoCopies: false, attachProxies: false, allTracks: false });
US.settings.set('selects.look', { leaveOut: true, weigh: true, how: 30 });
L.forget(full.map(i => i.path));
const made = [];
try {
  await S.runPlan(S.planForItems(full, 'fast test clips'), US.jobs.testJob('selects fast'));
  let r = S.state.result;
  T.assert(r.selects.length >= 3, `selects found (${r.selects.length})`);

  /* ---------- A: the selects sequence, straight from the clips ---------- */
  const labelsOf = async () => { const b = (await US.host.call('listBins')).find(x => x.path === BIN); return Object.fromEntries((await US.host.call('binItems', { binId: b.id, kinds: [], recursive: false })).filter(x => items.some(i => i.id === x.id)).map(x => [x.id, x.label])); };
  const labels0 = await labelsOf();
  const seqBefore = (await US.host.call('listSequences')).map(s => s.id);
  const binsBefore = new Set((await US.host.call('listBins')).map(b => b.path));
  const t0 = performance.now();
  const out = await S.makeOutputs({ sequence: true, order: 'score', markBest: true, tiers: 'all', basePath: `${BIN}/E2E fast` }, US.jobs.testJob('selects fast out'));
  const secs = (performance.now() - t0) / 1000;
  for (const s of await US.host.call('listSequences')) if (!seqBefore.includes(s.id)) made.push(s.id);
  const main = await US.host.call('sequenceInfo', { seqId: out.sequence.id });
  const n = r.selects.length;
  T.assert(main.video[0].clips.length === n, `selects sequence has ${main.video[0].clips.length} clips, expected ${n}`);
  T.near(main.duration, US.sum(r.selects.map(s => s.dur)), n * main.frame + 0.05, 'sequence length = total select length');
  T.assert(main.markers.length === n, `a marker per select (${main.markers.length})`);
  // each clip on the timeline is its select's own stretch of its source clip
  const byStart = main.video[0].clips.slice().sort((a, b) => a.start - b.start), order = US.vision.order(r.selects, 'score', { heroFirst: true });
  byStart.forEach((c, i) => { const s = order[i]; T.near(c.in, s.start, 0.05, `clip ${i + 1} in`); T.near(c.out, s.end, 0.05, `clip ${i + 1} out`); });
  // no subclips: the new bins hold only the sequence
  const newBins = (await US.host.call('listBins')).filter(b => !binsBefore.has(b.path));
  let subclips = 0, inBins = [];
  for (const b of newBins) { const its = await US.host.call('binItems', { binId: b.id, kinds: [], recursive: false }); inBins = inBins.concat(its.map(x => x.name)); subclips += its.filter(x => x.subclip || /^\d{3}_/.test(x.name)).length; }
  T.assert(subclips === 0, 'no subclips made: ' + inBins.join(', '));
  const labels1 = await labelsOf();
  T.assert(JSON.stringify(labels0) === JSON.stringify(labels1), `the source clips keep their own colour labels: ${JSON.stringify(labels0)} → ${JSON.stringify(labels1)}`);
  info.A = { selects: n, seconds: +secs.toFixed(1), perSelect: +(secs / n).toFixed(2), newBins: newBins.map(b => b.path.split(' / ').pop()), inBins };

  /* ---------- B: usability, by the vision model on this computer ---------- */
  const P = L.local();
  if (P.kind === 'none') info.B = 'skipped: no vision model on this computer';
  else {
    const media0 = US.ai.media, sent = [];
    US.ai.media = async req => { sent.push(req); throw new Error('nothing should go to the cloud'); };
    try {
      const t1 = performance.now();
      const res = await L.check(US.jobs.testJob('look'), { how: 'all' });
      const lsecs = (performance.now() - t1) / 1000;
      T.assert(sent.length === 0, 'nothing sent to the cloud');
      T.assert(res.looked >= 1, 'it looked: ' + res.summary);
      r = S.state.result;
      const looked = r.selects.concat(r.rejected).filter(s => s.look);
      T.assert(looked.length === res.looked, `every select it looked at carries its verdict (${looked.length} of ${res.looked})`);
      T.assert(r.selects.every(s => !s.look || s.look.usable !== 'no'), 'unusable ones are not in the grade');
      T.assert(r.rejected.filter(s => s.look && s.look.usable === 'no').every(s => /^Unusable to /.test(s.why)), 'and say why under Left out');
      // a second opinion on stretches the measurements already know about: sharp C001 against blurry C002 and dark C003
      const probe = ['C001', 'C002', 'C003'].map(k => { const c = S.state.clips.find(x => x.item.name.startsWith(k)); return { key: 'probe-' + k, clipId: c.item.id, clipName: c.item.name, start: 2, end: 6, score: 50, tier: 'OK', reasons: [], flags: {} }; });
      await L.check(US.jobs.testJob('look probe'), { list: probe });
      const op = probe.map(p => L.opinion(p));
      T.assert(op.every(Boolean), 'a verdict for each probe');
      // the card in Selects
      US.tools.open('selects');
      await T.sleep(400);
      const card = document.querySelector('.sel-look');
      T.assert(card && /Check usability with a vision model/.test(card.textContent) && /on this computer/.test(card.textContent) && card.textContent.includes(P.label), 'the card shows, with the model: ' + (card && card.textContent.slice(0, 200)));
      info.B = { model: P.label, looked: res.looked, seconds: +lsecs.toFixed(1), perSelect: +(lsecs / Math.max(1, res.looked)).toFixed(1), counts: res.counts,
        verdicts: looked.map(s => `${s.clipName.replace('.mp4', '')} ${US.fmtDur(s.start, true)}: ${s.look.usable} ${s.look.score}/5 ${s.look.problems.join('/')}`),
        probe: probe.map((p, i) => `${p.clipName.replace('.mp4', '')}: ${op[i].usable} ${op[i].score}/5 ${op[i].problems.join('/')} – ${op[i].note}`),
        sharpBeatsBlurAndDark: op[0].score >= op[1].score && op[0].score >= op[2].score };
    } finally { US.ai.media = media0; }
  }
} finally {
  for (const id of made) await US.host.call('deleteSequence', { seqId: id }).catch(() => {});
  Object.assign(S.state.settings, keepSel); S.saveSettings();
  if (keepLook) US.settings.set('selects.look', keepLook); else US.settings.set('selects.look', {});
  L.forget(full.map(i => i.path));
}
return info;
