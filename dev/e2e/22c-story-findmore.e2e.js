// Story › Find more and How picky in real Premiere: a theme already holds some lines, a cut uses others; Find more must
// return only lines that are in neither, with reasons, and the Assistant action must do the same on the open sequence.
if (!US.story || !US.story.findMore) throw new Error('Story (Find more) is not loaded in the panel');
const S = US.story, T2 = US.transcript;
const fs = require('fs');
const BIN = 'Test – Story', SEQ = 'Test – Story find more';
const prevBase = US.settings.get('story.binBase'), prevAI = US.settings.get('story.moreAI');
US.settings.set('story.binBase', BIN); US.settings.set('story.moreAI', false); // offline route here; the AI route is unit-tested with a stub
const st = S.loadState();
const saved = JSON.parse(JSON.stringify({ themes: st.themes, wall: st.wall, picky: st.picky || null }));
try {
  const [ruth] = await T.importOnce([T.media('interview', 'I001_interview.mp4')], BIN);
  const job = US.jobs.testJob('story');
  await S.importFiles(job, [T.media('transcripts', 'I001_interview.srt'), T.media('transcripts', 'Interview_David_Cohen.txt'), T.media('transcripts', 'Interview_Miriam_Levy.csv')]);
  const real = p => { try { return fs.realpathSync(p); } catch (e) { return p; } };
  const L = st.transcripts.find(t => t.path && real(t.path) === real(ruth.path)).lines;
  // a theme holding one volunteering line, nothing on the board
  st.themes = []; st.wall = { columns: [] }; st.picky = null;
  const th = S.newThemeFrom('Volunteering', [L.find(l => /volunteering at the food bank/.test(l.text)).id]);
  // the cut uses the interview from 66.5 to 81 (“I remember a young mum…”, “That's when I understood…”)
  const old = await T.seqByName(SEQ); if (old) await US.host.call('deleteSequence', { seqId: old.id });
  const seq = await US.host.call('newSequence', { name: SEQ, binPath: BIN, likeId: ruth.id });
  await US.host.call('placeClips', { seqId: seq.id, cursor: 0, clips: [{ id: ruth.id, in: 60.6, out: 81.4 }] });
  const used = await S.usedInSequence(job, seq.id);
  const inCut = L.filter(l => used.has(l.id));
  T.assert(inCut.some(l => /young mum/.test(l.text)), 'the cut’s lines are found: ' + inCut.map(l => l.text.slice(0, 30)).join(' | '));
  // Find more “kindness”: not the theme's line, not the cut's lines
  const all = await S.findMore(job, 'kindness', { exclude: S.selectedIds() });
  const fresh = await S.findMore(job, 'kindness', { exclude: new Set([...S.selectedIds(), ...used]) });
  T.assert(all.some(r => used.has(r.line.id)), 'without “not in my cut” the cut’s lines can come back');
  T.assert(!fresh.some(r => used.has(r.line.id) || th.lineIds.includes(r.line.id)), 'with it they don’t');
  T.assert(fresh.every(r => r.reasons.length), 'every result says why');
  // How picky applies to Find more results and nests
  const relOf = new Map(all.map(r => [r.line.id, r.rel]));
  const at = s => S.pickLines(all.map(r => r.line.id), { relOf: id => relOf.get(id), opts: Object.assign(S.pickyFor(null), { s }) });
  const e = at(S.PICKY_LEVELS.all), b = at(S.PICKY_LEVELS.balanced), o = at(S.PICKY_LEVELS.best);
  T.assert(o.every(id => b.includes(id)) && b.every(id => e.includes(id)), `nested ${e.length} ⊇ ${b.length} ⊇ ${o.length}`);
  // the Assistant route, on the open sequence
  await T.open(seq.id);
  const viaAction = await T.action('story.findMore', { topic: 'kindness', notInCut: true });
  T.assert(!viaAction.results.some(r => used.has(r.line.id)), 'action leaves out the cut too');
  T.assert(US.actions.get('story.findMore').match('find anything else about kindness that’s not already in my cut').notInCut, 'match');
  return { found: all.length, notInCut: fresh.length, levels: [e.length, b.length, o.length], action: viaAction.summary };
} finally {
  st.themes = saved.themes; st.wall = saved.wall; st.picky = saved.picky; S.save();
  US.settings.set('story.binBase', prevBase || ''); US.settings.set('story.moreAI', prevAI == null ? true : prevAI);
}
