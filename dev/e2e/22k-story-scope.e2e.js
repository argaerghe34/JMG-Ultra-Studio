// Story › What to work on, in real Premiere: the lines heard in a sequence, and only between its In and Out points
// (marked in Premiere); no In/Out reads as "none"; Themes and Find more then read only those lines.
const S = US.story, fs = require('fs');
const BIN = 'Test – Story', SEQ = 'Test – Story scope';
const st = S.loadState(), saved = JSON.parse(JSON.stringify({ scope: st.scope || { kind: 'all' }, themes: st.themes, ownThemes: st.ownThemes || null }));
try {
  const [ruth] = await T.importOnce([T.media('interview', 'I001_interview.mp4')], BIN);
  await S.importFiles(US.jobs.testJob('story'), [T.media('transcripts', 'I001_interview.srt')]);
  const real = p => { try { return fs.realpathSync(p); } catch (e) { return p; } };
  const L = st.transcripts.find(t => t.path && real(t.path) === real(ruth.path)).lines;
  const old = await T.seqByName(SEQ); if (old) await US.host.call('deleteSequence', { seqId: old.id });
  const seq = await US.host.call('newSequence', { name: SEQ, binPath: BIN, likeId: ruth.id });
  await US.host.call('placeClips', { seqId: seq.id, cursor: 0, clips: [{ id: ruth.id, in: 0, out: 60 }] });
  const job = US.jobs.testJob('story');
  // the whole sequence
  await S.setScope(job, { kind: 'sequence', seqId: seq.id, seqName: SEQ, inOut: false });
  const whole = S.scopeLines().map(l => l.id), want60 = L.filter(l => l.end > 0 && l.start < 60).map(l => l.id);
  T.assert(whole.length === want60.length && whole.every(id => want60.includes(id)), `the whole sequence: ${whole.length} lines, wanted ${want60.length}`);
  // no In/Out marked: says so, keeps the choice before
  let msg = '';
  try { await S.setScope(job, { kind: 'sequence', seqId: seq.id, inOut: true }); } catch (e) { msg = e.title; }
  T.assert(/has no In and Out points/.test(msg) && S.scopeOf().inOut === false, 'no In/Out: ' + msg);
  // In at 10 s, Out at 25 s, marked in Premiere
  await T.setInOut(seq.id, 10, 25);
  const info = await US.host.call('sequenceInfo', { seqId: seq.id });
  T.near(info.inPoint, 10, 0.05, 'In read back'); T.near(info.outPoint, 25, 0.05, 'Out read back');
  await S.setScope(job, { kind: 'sequence', seqId: seq.id, inOut: true });
  const part = S.scopeLines().map(l => l.id), want = L.filter(l => l.end > 10 && l.start < 25).map(l => l.id);
  T.assert(part.length === want.length && part.every(id => want.includes(id)) && part.length < whole.length, `In–Out: ${part.length} lines, wanted ${want.length}`);
  T.assert(S.scopeLabel() === `Lines in “${SEQ}” between In and Out`, S.scopeLabel());
  // themes and Find more read only those lines
  const r = await S.findAllThemes(job, { useAI: false, own: ['family'] });
  const ids = new Set(part), made = r.yours.concat(r.found);
  T.assert(made.length && made.every(t => t.lineIds.every(id => ids.has(id))), 'themes found only from the In–Out lines');
  const more = await S.findMore(job, 'family', {});
  T.assert(more.every(r => ids.has(r.line.id)), 'Find more only from the In–Out lines');
  // the step layout shows it
  US.story.open('themes'); await T.sleep(500);
  const chip = document.querySelector('.tool:not(.hidden) .story-pane:not(.hidden) .story-scope-chip');
  T.assert(chip && /Working on: Lines in “Test – Story scope” between In and Out/.test(chip.textContent), 'chip: ' + (chip && chip.textContent));
  const steps = [...document.querySelectorAll('.tool:not(.hidden) .story-tabs .seg')].map(b => b.textContent);
  T.assert(steps.length === 5 && /^1 Interviews/.test(steps[0]) && /^5 Share/.test(steps[4]), 'steps: ' + steps.join(' | '));
  return { whole: whole.length, inOut: part.length, range: [info.inPoint, info.outPoint], steps: steps.join(' | ') };
} finally {
  Object.assign(st, saved); S.save();
}
