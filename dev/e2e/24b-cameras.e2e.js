// Camera Switch: an interview on V1 and a second angle on V2 (synced) → a copy that cuts between them at sentence ends.
const S = US.story, Cm = US.cameras;
const [iv, cam2] = await T.importOnce([T.media('interview', 'I001_interview.mp4'), T.media('concert', 'C001_sharp_static.mp4')], 'Test – Story');
S.loadState();
if (!S.state().transcripts.some(t => /I001_interview/.test(t.name || t.path || ''))) await S.importFiles(US.jobs.testJob('story'), [T.media('transcripts', 'I001_interview.srt')]);
const seq = await T.freshSequence('E2E Cameras', iv.id, 'Test – E2E');
await US.host.call('placeClips', { seqId: seq.id, clips: [{ id: iv.id, in: 0, out: 40, at: 0, v: 0, a: 0 }, { id: cam2.id, in: 0, out: 10, at: 0, v: 1, a: 1 }, { id: cam2.id, in: 0, out: 10, at: 10, v: 1, a: 1 }, { id: cam2.id, in: 0, out: 10, at: 20, v: 1, a: 1 }, { id: cam2.id, in: 0, out: 10, at: 30, v: 1, a: 1 }] });
await T.open(seq.id);
const r = await Cm.readSequence(US.jobs.testJob('cams'), seq.id);
T.assert(r.cams.join() === '0,1', 'two camera angles: ' + r.cams);
T.assert(r.via === 'transcript' && r.points.length >= 4, `cut points from the transcript: ${r.via}, ${r.points.length}`);
const res = await T.action('cameras.cut', { mode: 'alternate', min: 4, max: 12 });
T.assert(res.shots.length >= 3, 'several shots: ' + res.summary);
const before = await US.host.call('sequenceInfo', { seqId: seq.id }), after = await US.host.call('sequenceInfo', { seqId: res.copy.id });
T.assert(after.video[0].clips.length === 1 && Math.abs(after.video[0].clips[0].end - 40) < 0.05, 'the lowest angle runs underneath, whole');
// V2 shows only in its own shots
const fr = 1 / (after.fps || 25) + 0.01;
for (const c of after.video[1].clips) {
  const mid = (c.start + c.end) / 2, shot = res.shots.find(s => mid >= s.start && mid < s.end);
  T.assert(shot && shot.cam === 1, `V2 piece ${c.start.toFixed(2)}–${c.end.toFixed(2)} is in a V2 shot`);
}
for (const s of res.shots.filter(x => x.cam === 1)) {
  const shown = US.sum(after.video[1].clips.map(c => Math.max(0, Math.min(c.end, s.end) - Math.max(c.start, s.start))));
  T.assert(shown >= s.end - s.start - 2 * fr, `V2 covers its shot ${s.start.toFixed(2)}–${s.end.toFixed(2)}`);
}
T.assert(JSON.stringify(after.audio.map(t => t.clips.map(c => [c.start.toFixed(2), c.end.toFixed(2)]))) === JSON.stringify(before.audio.map(t => t.clips.map(c => [c.start.toFixed(2), c.end.toFixed(2)]))), 'the sound is exactly as before');
T.assert(before.video[1].clips.length === 4, 'the original sequence is unchanged');
for (const s of res.shots.slice(0, -1)) T.assert(r.points.some(p => Math.abs(p - s.end) < 0.01) || Math.abs(s.end - s.start - 12) < 0.01, `cut at ${s.end} is between sentences (or at the longest length)`);
return { summary: res.summary, shots: res.shots.map(s => `V${s.cam + 1} ${s.start.toFixed(1)}–${s.end.toFixed(1)}`) };
