// Story › build from a sequence, lines that start and end between frames (23 Nov 2026 fix). The user's build from a
// string-out came out with some lines picture-only and others sound-only: each layer is laid on its own, and the half
// Premiere lays with it is taken away – but picture lands on whole frames and sound to the sample, so a range between
// frames left them up to a frame apart and a tolerance under a frame removed a WANTED half. Ranges are now snapped to
// frames. Here: a string-out with the interview on V1/A1, ranges deliberately between frames, every range laid with
// both its picture and its sound, end to end with no gaps.
const BIN = 'Test – Story', SRC = 'Test – Layers string-out', made = [];
const [ruth] = await T.importOnce([T.media('interview', 'I001_interview.mp4')], BIN);
try {
  for (const n of [SRC, 'Test – Layers frames']) { const old = await T.seqByName(n); if (old) await US.host.call('deleteSequence', { seqId: old.id }); }
  const src = await US.host.call('newSequence', { name: SRC, binPath: BIN, likeId: ruth.id }); made.push(src.id);
  await US.host.call('placeClips', { seqId: src.id, cursor: 0, clips: [{ id: ruth.id, in: 0, out: 60 }] });
  const seq = await US.host.call('newSequence', { name: 'Test – Layers frames', binPath: BIN, likeId: ruth.id }); made.push(seq.id);
  // between frames at 25 fps (and at 24, 29.97 …): .01, .03, .45, .98
  const ranges = [[2.01, 6.45], [6.46, 9.98], [12.03, 17.21], [20.45, 22.99], [30.01, 34.03], [40.98, 44.47]].map(([start, end]) => ({ start, end }));
  const r = await US.host.call('storyPlaceFromSequence', { seqId: seq.id, srcSeqId: src.id, cursor: 0, ranges });
  T.assert(r.how === 'tracks' && r.missing.length === 0, 'laid layer by layer, nothing missing: ' + JSON.stringify(r.missing));
  const si = await US.host.call('sequenceInfo', { seqId: seq.id });
  const v = si.video[0].clips.slice().sort((a, b) => a.start - b.start), a = si.audio[0].clips.slice().sort((x, y) => x.start - y.start);
  T.assert(v.length === ranges.length && a.length === ranges.length, `a picture and a sound clip for every line (${v.length} video, ${a.length} audio, ${ranges.length} lines)`);
  v.forEach((c, i) => {
    T.near(a[i].start, c.start, 0.03, `line ${i + 1}: sound starts with the picture`);
    T.near(a[i].end, c.end, 0.03, `line ${i + 1}: sound ends with the picture`);
    if (i) T.near(c.start, v[i - 1].end, 0.001, `line ${i + 1} follows on with no gap`);
  });
  return { lines: ranges.length, end: +si.duration.toFixed(2), cursor: r.cursor };
} finally {
  for (const id of made) await US.host.call('deleteSequence', { seqId: id }).catch(() => {});
}
