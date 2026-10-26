// Silence Cut in real Premiere: the four long pauses of the test interview are cut from a copy; the original stays as it was.
const truth = JSON.parse(T.fs.readFileSync(T.media('interview', 'I001_truth.json'), 'utf8'));
const [iv] = await T.importOnce([T.media('interview', 'I001_interview.mp4')], 'Test – Audio');
const seq = await T.freshSequence('Test – Audio e2e interview', iv.id, 'Test – Audio');
await US.host.call('placeClips', { seqId: seq.id, cursor: 0, clips: [{ id: iv.id, in: 0, out: iv.duration }] });
await T.open(seq.id);
// the Assistant's offline phrase matching
const a = US.actions.get('silence.cut');
T.assert(a.match('remove pauses longer than 1 second').minPause === 1, 'parses "longer than 1 second"');
T.assert(a.match('tighten this interview'), 'matches "tighten this interview"');
T.assert(!a.match('add a lower third'), 'ignores unrelated requests');
const r = await T.action('silence.cut', { minPause: 1.0, padding: 0.15 });
T.assert(r.cuts === truth.long_silences.length, `cut ${r.cuts} pauses, expected ${truth.long_silences.length}`);
const want = truth.long_silences.reduce((s, p) => s + p.duration - 2 * 0.15, 0);
T.near(truth.duration - r.duration, want, 0.25, 'time removed');
const copy = await US.host.call('sequenceInfo', { seqId: r.copy.id });
T.assert(copy.video[0].clips.length === 5 && copy.audio[0].clips.length === 5, 'five pieces left on V1 and A1');
copy.video[0].clips.forEach((c, i) => T.near(c.start, copy.audio[0].clips[i].start, 0.001, 'picture and sound stay in sync'));
// every cut lands inside a true long silence (padding kept either side)
const srcGaps = copy.video[0].clips.slice(1).map((c, i) => [copy.video[0].clips[i].out, c.in]);
srcGaps.forEach(([a0, b0], i) => { const s = truth.long_silences[i]; T.assert(a0 >= s.start + 0.05 && b0 <= s.end - 0.05, `cut ${i + 1} (${a0.toFixed(2)}–${b0.toFixed(2)}) inside ${s.start}–${s.end}`); });
const orig = await US.host.call('sequenceInfo', { seqId: seq.id, clips: false });
T.near(orig.duration, truth.duration, 0.01, 'original untouched');
await US.host.call('deleteSequence', { seqId: r.copy.id });
return { cuts: r.cuts, removed: +(truth.duration - r.duration).toFixed(2), expected: +want.toFixed(2) };
