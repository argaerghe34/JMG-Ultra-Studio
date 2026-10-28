// Selects end to end in real Premiere:
//  A. analyse the concert test clips from scratch and check the ground truth (dev/test-media/README.md);
//  B. grade a stringout sequence (selects point at the source clips, with their place in the sequence), then make
//     a selects sequence, bins by type and markers, with "mark the best";
//  C. ProRes and HEVC clips the panel can't decode → Media Encoder analysis copies → same ground truth;
//  D. a real Lumix 4K 10-bit 4:2:2 H.264 .MOV: graded, and its analysis copy checked.
const BIN = 'Test – Selects';
const S = US.selects, V = US.vision;
const reset = (footage = 'concert') => { Object.assign(S.state.settings, { footage, picky: 'normal', overrides: {}, heroCount: 5, autoCopies: true, attachProxies: false, allTracks: false }); };
const info = {};

/* ---------- A: concert ground truth ---------- */
const names = ['C001_sharp_static', 'C002_blurry', 'C003_dark', 'C004_overexposed', 'C005_shaky', 'C006_whip_pan', 'C007_reveal_pullback', 'C008_duplicate_of_C001', 'C009_slow_pan_good', 'C010_mixed'];
const items = await T.importOnce(names.map(n => T.media('concert', n + '.mp4')), BIN);
const full = await US.host.call('itemsInfo', { ids: items.map(i => i.id) });
const uncache = list => { for (const it of list) for (const f of [1, 0]) { try { T.fs.unlinkSync(US.cache.file('vision', US.fsx.mediaKey(it.path) + '-v' + V.VERSION + '-r3-f' + f)); } catch (e) { /* not cached */ } } };
uncache(full);
reset('concert');
let t0 = performance.now();
await S.analyse(full, 'test clips', US.jobs.testJob('selects A'));
const secs = (performance.now() - t0) / 1000, footage = US.sum(full.map(i => i.duration));
let r = S.state.result;
const sel = n => r.selects.filter(s => s.clipName.startsWith(n));
const rej = n => r.rejected.filter(s => s.clipName.startsWith(n));
const ov = (a0, a1, b0, b1) => Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));
for (const [c, why] of [['C002', /focus/i], ['C003', /dark/i], ['C004', /blown/i], ['C005', /shak/i]]) {
  T.assert(sel(c).length === 0, `${c} should be rejected`);
  T.assert(rej(c).some(x => why.test(x.why)), `${c} reason ${why}: ${rej(c).map(x => x.why)}`);
}
T.assert((sel('C001').length > 0) !== (sel('C008').length > 0), 'exactly one of C001/C008 kept');
T.assert(rej('C001').concat(rej('C008')).some(x => /Duplicate of/.test(x.why)), 'duplicate named');
T.assert(sel('C009').length > 0 && sel('C009')[0].move === 'pan', 'C009 kept as a pan');
T.assert(sel('C006').every(s => ov(s.start, s.end, 4.0, 4.6) === 0) && sel('C006').some(s => s.end <= 4) && sel('C006').some(s => s.start >= 4.6), 'whip pan cut out of C006');
T.assert(sel('C007').some(s => s.flags.reveal === 'Pull-back'), 'C007 is a pull-back reveal');
T.assert(sel('C010').length && sel('C010').every(s => s.start >= 2.6 && s.end <= 15.4), 'C010 selects inside 3–15 s');
info.A = { footage: +footage.toFixed(0), analysis: +secs.toFixed(1), speed: +(footage / secs).toFixed(1) + '×', selects: r.selects.length };

/* ---------- B: grade a sequence, then bins by type + mark the best ---------- */
const [face] = await T.importOnce([T.media('selects', 'S06_face_interview.mp4')], BIN);
const c10 = items[9], c06 = items[5], c09 = items[8];
const seq = await T.freshSequence('E2E Selects stringout', c10.id, BIN);
await US.host.call('placeClips', { seqId: seq.id, clips: [{ id: c06.id, in: 0, out: 8 }, { id: c10.id, in: 4, out: 12 }, { id: face.id, in: 2, out: 10 }, { id: c10.id, in: 15, out: 19 }, { id: c09.id, in: 1, out: 9 }] });
reset('concert');
const job = US.jobs.testJob('selects B');
const plan = await S.planForSequence(seq.id, job);
T.assert(plan.analysisItems.length === 4, `4 source clips (got ${plan.analysisItems.length})`);
await S.runPlan(plan, job);
r = S.state.result;
const srcIds = new Set([c06.id, c10.id, face.id, c09.id]);
T.assert(r.selects.length >= 4 && r.selects.every(s => srcIds.has(s.clipId)), 'selects point at the source clips');
T.assert(r.selects.every(s => s.tl != null && s.tl >= 0 && s.tl <= 40), 'each select knows its place in the sequence');
T.assert(r.rejected.some(x => x.clipId === c10.id && x.start >= 14.9 && /focus|dark/i.test(x.why)), 'the blurry/dark use of C010 is rejected');
T.assert(r.selects.filter(s => s.clipId === c10.id).every(s => s.start >= 4 - 1e-6 && s.end <= 12 + 1e-6), 'only the used stretch of C010 is graded');
const faceSel = r.selects.find(s => s.clipId === face.id);
T.assert(faceSel && faceSel.shot === 'close' && faceSel.faces, 'the talking head is a close-up with a face');
const before = (await US.host.call('listSequences')).map(s => s.id);
const binsBefore = new Set((await US.host.call('listBins')).map(b => b.path));
const out = await S.makeOutputs({ sequence: true, order: 'sequence', markBest: true, tiers: 'all', seqMarkers: true, byType: { groups: ['grade', 'shot', 'move', 'special'], sequences: false }, basePath: `${BIN}/E2E output` }, US.jobs.testJob('selects out'));
const main = await US.host.call('sequenceInfo', { seqId: out.sequence.id });
const n = r.selects.length, heroes = r.selects.filter(s => s.flags.hero).length;
T.assert(main.video[0].clips.length === n, `selects sequence has ${main.video[0].clips.length} clips, expected ${n}`);
T.near(main.duration, US.sum(r.selects.map(s => s.dur)), n * main.frame + 0.05, 'sequence length = total select length');
T.assert(main.markers.filter(m => /★/.test(m.name)).length === heroes, 'a ★ marker per marked best');
const bins = (await US.host.call('listBins')).map(b => b.path);
const run = bins.find(p => !binsBefore.has(p) && /^Test – Selects \/ E2E output \/ [^/]+$/.test(p) && bins.includes(p + ' / By shot size / Close-ups'));
T.assert(run, 'bins by type made: ' + bins.filter(p => /E2E output/.test(p)).slice(-12).join(' | '));
for (const b of ['By grade / BEST', 'By camera move / Static', 'By camera move / Pans', 'Special / Hero shots']) T.assert(bins.includes(`${run} / ${b}`), `bin ${b}`);
const heroBin = (await US.host.call('listBins')).find(b => b.path === `${run} / Special / Hero shots`);
const heroClips = await US.host.call('binItems', { binId: heroBin.id, kinds: [], recursive: false });
T.assert(heroClips.length === heroes && heroClips.every(c => c.label === 11 && /^\d{3}_★_/.test(c.name)), 'hero subclips are magenta, ★ and numbered best-first: ' + heroClips.map(c => c.name + '/' + c.label).join(', '));
const closeBin = (await US.host.call('listBins')).find(b => b.path === `${run} / By shot size / Close-ups`);
const closeClips = await US.host.call('binItems', { binId: closeBin.id, kinds: [], recursive: false });
T.assert(closeClips.length >= 1 && closeClips.every(c => c.label === 6 || c.label === 11), 'close-ups are rose (or magenta if best)');
const seqAfter = await US.host.call('sequenceInfo', { seqId: seq.id });
T.assert(seqAfter.markers.length === n, `markers on the graded sequence (${seqAfter.markers.length})`);
await S.removeMarkers(US.jobs.testJob('remove'));
T.assert((await US.host.call('sequenceInfo', { seqId: seq.id })).markers.length === 0, 'sequence markers removed again');
for (const s of await US.host.call('listSequences')) if (!before.includes(s.id)) await US.host.call('deleteSequence', { seqId: s.id });
info.B = { uses: plan.uses, selects: n, heroes, categories: out.categories.length };

/* ---------- C: clips the panel can't decode → Media Encoder analysis copies ---------- */
// ProRes and HEVC versions of the whip-pan clip: the ground truth must still hold when read through the copies.
// the ProRes one isn't in every checkout (the Windows clone had only the HEVC one): use what's there
const hardFiles = ['C006_whip_pan_prores.mov', 'C006_whip_pan_hevc.mov'].map(f => T.media('unreadable', f)).filter(f => T.fs.existsSync(f));
T.assert(hardFiles.length, 'no clips in dev/test-media/unreadable');
const hard = await T.importOnce(hardFiles, BIN);
const hardInfo = await US.host.call('itemsInfo', { ids: hard.map(i => i.id) });
for (const it of hardInfo) { try { T.fs.unlinkSync(V.analysisCopyPath(it)); } catch (e) { /* none yet */ } }
uncache(hardInfo);
for (const it of hardInfo) { const d = await V.pickSource(it); T.assert(!d.ok && d.needsCopy, `${it.name} shouldn’t decode in the panel: ${JSON.stringify(d)}`); }
reset('concert');
t0 = performance.now();
await S.runPlan(S.planForItems(hardInfo, 'unreadable test clips'), US.jobs.testJob('selects C'));
const csecs = (performance.now() - t0) / 1000;
r = S.state.result;
T.assert(S.state.failed.length === 0, 'both read via analysis copies: ' + JSON.stringify(S.state.failed.map(f => f.item.name + ' ' + f.error.title)));
for (const it of hardInfo) {
  T.assert(S.state.clips.find(c => c.item.id === it.id).data.source === 'copy', `${it.name} analysed from its copy`);
  const ss = r.selects.filter(s => s.clipId === it.id).concat(r.rejected.filter(x => x.clipId === it.id && /Duplicate/.test(x.why)));
  T.assert(ss.length && ss.every(s => ov(s.start, s.end, 4.0, 4.6) === 0), `${it.name}: whip pan cut out through the copy ${JSON.stringify(ss.map(s => [s.start, s.end]))}`);
}
const inProject = (await US.host.call('binItems', { binId: (await US.host.call('listBins')).find(b => b.path === BIN).id, kinds: [], recursive: true })).filter(x => x.path && x.path.indexOf(US.fsx.cacheDir()) === 0);
T.assert(inProject.length === 0, 'analysis copies are not added to the project');
info.C = { clips: hardFiles.map(f => /prores/i.test(f) ? 'ProRes 422' : 'HEVC').join(' + '), total: +csecs.toFixed(1) + ' s incl. Media Encoder', copyMB: hardInfo.map(it => +(T.fs.statSync(V.analysisCopyPath(it)).size / 1048576).toFixed(1)) };

/* ---------- D: the real Lumix 4K 10-bit 4:2:2 .MOV (copied off the card) ---------- */
const lumix = T.media('real', 'P1003525.MOV');
if (T.fs.existsSync(lumix)) {
  const [lx] = await T.importOnce([lumix], BIN);
  const it = (await US.host.call('itemsInfo', { ids: [lx.id] }))[0];
  const direct = await V.pickSource(it);
  try { T.fs.unlinkSync(V.analysisCopyPath(it)); } catch (e) { /* none yet */ }
  t0 = performance.now();
  const made = await V.makeAnalysisCopies([it], US.jobs.testJob('lumix copy'), {});
  const copySecs = (performance.now() - t0) / 1000;
  T.assert(made.made.length === 1, 'Lumix analysis copy made: ' + JSON.stringify(made.failed));
  const copy = await V.analyseClip(Object.assign({}, it, { path: V.analysisCopyPath(it), proxy: '' }), { job: US.jobs.testJob() });
  T.near(copy.duration, it.duration, 0.2, 'copy has the original’s timing');
  T.assert(copy.width === 1280 && copy.height === 720 && copy.samples.length > 50, `copy ${copy.width}×${copy.height}, ${copy.samples.length} samples`);
  reset('concert'); uncache([it]);
  t0 = performance.now();
  await S.runPlan(S.planForItems([it], 'Lumix test'), US.jobs.testJob('selects D'));
  const dsecs = (performance.now() - t0) / 1000;
  T.assert(S.state.clips.length === 1, 'Lumix clip graded');
  info.D = { clip: `${it.width}×${it.height} ${it.duration.toFixed(1)} s 10-bit 4:2:2`, panelDecodesOriginal: direct.ok, gradedFrom: S.state.clips[0].data.source, grade: +dsecs.toFixed(1) + ' s', copy: +copySecs.toFixed(1) + ' s in Media Encoder', copyMB: +(T.fs.statSync(V.analysisCopyPath(it)).size / 1048576).toFixed(1), selects: S.state.result.selects.length };
} else info.D = 'skipped: dev/test-media/real/P1003525.MOV not present';
return info;
