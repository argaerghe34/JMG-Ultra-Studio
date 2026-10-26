const [c1, c9, c7] = await T.importOnce([T.media('concert', 'C001_sharp_static.mp4'), T.media('concert', 'C009_slow_pan_good.mp4'), T.media('concert', 'C007_reveal_pullback.mp4')], 'Test – E2E');
const v1 = await T.freshSequence('E2E Interview v1', c1.id, 'Test – E2E');
await US.host.call('placeClips', { seqId: v1.id, clips: [{ id: c1.id, in: 0, out: 4 }, { id: c9.id, in: 0, out: 4 }, { id: c7.id, in: 2, out: 6 }] });
const v2 = await T.freshSequence('E2E Interview v2', c1.id, 'Test – E2E');
await US.host.call('placeClips', { seqId: v2.id, clips: [{ id: c9.id, in: 0, out: 4 }, { id: c1.id, in: 0, out: 3 }] }); // reordered, c1 trimmed, c7 dropped
await T.open(v2.id);
const r = await T.action('check.compare', {}); // should guess v1 from the name
T.assert(/E2E Interview v1 → E2E Interview v2/.test(r.summary), 'guessed the old version: ' + r.summary);
T.assert(/0 added, 1 removed, 1 trimmed, 1 moved/.test(r.summary), r.summary);
return r.summary;
