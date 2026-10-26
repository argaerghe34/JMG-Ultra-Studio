// Camera Switch with three stacked angles and one left out: the left-out angle is emptied in the copy, never covering.
const S = US.story, Cm = US.cameras;
const [iv, c1, c9] = await T.importOnce([T.media('interview', 'I001_interview.mp4'), T.media('concert', 'C001_sharp_static.mp4'), T.media('concert', 'C009_slow_pan_good.mp4')], 'Test – Story');
S.loadState();
if (!S.state().transcripts.some(t => /I001_interview/.test(t.name || t.path || ''))) await S.importFiles(US.jobs.testJob('story'), [T.media('transcripts', 'I001_interview.srt')]);
const seq = await T.freshSequence('E2E Three cameras', iv.id, 'Test – E2E');
const four = (id, v) => [0, 10, 20, 30].map(at => ({ id, in: 0, out: 10, at, v, a: v }));
await US.host.call('placeClips', { seqId: seq.id, clips: [{ id: iv.id, in: 0, out: 40, at: 0, v: 0, a: 0 }].concat(four(c1.id, 1), four(c9.id, 2)) });
await T.open(seq.id);
const r = await Cm.readSequence(US.jobs.testJob('cams'), seq.id);
T.assert(r.cams.join() === '0,1,2', 'three angles: ' + r.cams);
const res = await Cm.makeCopy(US.jobs.testJob('cams'), seq.id, { off: [2], mode: 'alternate', min: 4, max: 12, camFor: { someone: 2 } });
const after = await US.host.call('sequenceInfo', { seqId: res.copy.id });
T.assert(after.video[2].clips.length === 0, 'the unticked V3 is left out of the copy');
T.assert(!res.shots.some(s => s.cam === 2), 'no shot uses V3');
T.assert(after.video[1].clips.length > 0 && after.video[0].clips.length === 1, 'V1 whole, V2 in its shots');
const before = await US.host.call('sequenceInfo', { seqId: seq.id });
T.assert(before.video[2].clips.length === 4, 'the original keeps V3');
return { summary: res.summary };
