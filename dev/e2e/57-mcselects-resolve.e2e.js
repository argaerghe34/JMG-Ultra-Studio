// resolve-only
// MC Selects in real Resolve (Premiere's MC Selects has no e2e: it needs a saved multicam project). Which angle each
// multicam cut shows comes from the timeline's FCPXML export (a temporary file): two cuts of the J001 multicam clip
// (made by 22s-story-sources from a camera and a lav) are read, and MC Selects lays the camera's pieces, exactly as
// cut, back to back in a new timeline – picture only, in the colour chosen. Resolve can't switch a cut's angle by
// script, so every cut here shows Angle 1 (the camera); the unit tests cover switched angles.
const src = (await US.host.call('storySources', {})).find(s => s.kind === 'multicam' && /^J001/.test(s.name));
if (!src) return { skipped: 'no J001 multicam clip in the test project – run 22s-story-sources once first' };
const seq = await T.freshSequence('E2E MC Selects', src.id, 'Test – E2E');
await US.host.call('placeClips', { seqId: seq.id, clips: [{ id: src.id, in: 5, out: 9 }, { id: src.id, in: 20, out: 23 }] });
await T.open(seq.id);

const read = await US.host.call('mcRead', { seqId: seq.id });
T.assert(read.cuts.length === 2 && read.other === 0, 'two multicam cuts on V1: ' + JSON.stringify(read.cuts));
T.assert(read.cuts.every(c => c.angle === 0), 'each cut shows Angle 1 (from the FCPXML): ' + read.cuts.map(c => c.angle).join(','));
T.near(read.cuts[0].in, 5, 0.05, 'first cut starts 5 s into the multicam'); T.near(read.cuts[1].out, 23, 0.05, 'second ends at 23 s');
const mc = read.multicams[read.cuts[0].mcId];
T.assert(mc && mc.found && mc.angles[0].clips.length >= 1 && mc.angles[0].clips[0].itemId, 'the camera angle’s clip found in the Media Pool: ' + JSON.stringify(mc));

const M = US.mcSelects, job = US.jobs.testJob('mc selects');
const e = await M.readEdit(seq.id, job);
const cam = e.cams.find(c => c.cuts === 2);
T.assert(cam, 'one camera holds both cuts: ' + JSON.stringify(e.cams));
const r = await M.build(seq.id, { cameras: { [cam.name]: { keep: true, label: '13' } }, audio: false }, job);
T.assert(r.placed === 2, 'two pieces laid: ' + r.summary);
const info = await US.host.call('sequenceInfo', { seqId: r.seqId, clips: true });
T.near(info.duration, 7, 0.1, 'the new timeline runs 4 s + 3 s');
const colours = await T.devEval('const t = R.needSeq(' + JSON.stringify(r.seqId) + '); return R.list(t.GetItemListInTrack("video", 1)).map(i => i.GetClipColor())');
T.assert(colours.length === 2 && colours.every(c => c === 'Green'), 'in the chosen colour: ' + colours.join(','));
const audio = await T.devEval('const t = R.needSeq(' + JSON.stringify(r.seqId) + '); let n = 0; for (let k = 1; k <= t.GetTrackCount("audio"); k++) n += R.list(t.GetItemListInTrack("audio", k)).length; return n');
T.assert(audio === 0, 'picture only: ' + audio + ' audio clips');
await US.host.call('deleteSequence', { seqId: r.seqId });
return { cuts: read.cuts.length, camera: cam.name, summary: r.summary };
