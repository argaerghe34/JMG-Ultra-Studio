const [c1, c9] = await T.importOnce([T.media('concert', 'C001_sharp_static.mp4'), T.media('concert', 'C009_slow_pan_good.mp4')], 'Test – E2E');
const seq = await T.freshSequence('E2E Final Check', c1.id, 'Test – E2E');
// clip, 1 s black gap, a 1-frame flash, a clip, then the first clip's same moment again
await US.host.call('placeClips', { seqId: seq.id, clips: [
  { id: c1.id, in: 0, out: 3, at: 0 }, { id: c9.id, in: 1, out: 1.04, at: 4 }, { id: c9.id, in: 2, out: 5, at: 4.04 }, { id: c1.id, in: 0.5, out: 2.5, at: 7.04 }] });
await US.host.call('addSequenceMarkers', { seqId: seq.id, markers: [{ start: 1, name: 'TODO fix colour', color: 1 }] });
await T.open(seq.id);
const job = US.jobs.testJob();
const seqInfo = await US.host.call('sequenceInfo', { seqId: seq.id });
const issues = US.check.scan(seqInfo, { longShot: 0, audioGap: 0.5, repeatMin: 0.5 });
const kinds = issues.map(i => i.kind);
for (const k of ['gap', 'flash', 'repeat', 'note']) T.assert(kinds.includes(k), 'finds ' + k + ' (got ' + kinds.join(',') + ')');
const gap = issues.find(i => i.kind === 'gap'); T.near(gap.t, 3, 0.05, 'gap start'); T.near(gap.end, 4, 0.05, 'gap end');
return { found: kinds };
