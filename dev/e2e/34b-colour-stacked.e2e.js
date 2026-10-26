// Colour › Match with stacked angles: camera B on V1 under camera A on V2 – each measured on its own.
const C = US.colour, path = T.path, fs = T.fs;
const [a, b] = await T.importOnce([T.media('concert', 'C001_sharp_static.mp4'), T.media('concert', 'C008_duplicate_of_C001.mp4')], 'Test – E2E');
await US.host.call('colourSetSpace', { itemIds: [b.id], space: 'Panasonic V-Log/V-Gamut' });   // camera B looks different
const seq = await T.freshSequence('E2E Colour stacked', a.id, 'Test – E2E');
await US.host.call('placeClips', { seqId: seq.id, clips: [{ id: b.id, in: 0, out: 6, at: 0, v: 0, a: 0 }, { id: a.id, in: 0, out: 6, at: 0, v: 1, a: 1 }] });
await T.open(seq.id);
await US.host.call('setPlayhead', { seqId: seq.id, seconds: 2 }); await US.refreshContext();
await US.host.rawEval(`(function(){ var s=UStudio.needSeq(${JSON.stringify(seq.id)}); s.videoTracks[1].clips[0].setSelected(false, true); s.videoTracks[0].clips[0].setSelected(true, true); return 1; })()`);
const frame = async (track) => {
  // measure one track alone
  const info = await US.host.call('sequenceInfo', { seqId: seq.id, clips: false });
  for (const t of info.video) if (t.index > track) await US.host.call('muteTrack', { seqId: seq.id, video: true, index: t.index, mute: true });
  const p = await US.host.call('exportFrame', { seqId: seq.id, seconds: 3, outBase: path.join(US.fsx.tempDir(), 'stk' + Date.now()) });
  for (const t of info.video) if (t.index > track) await US.host.call('muteTrack', { seqId: seq.id, video: true, index: t.index, mute: false });
  const img = new Image(); img.src = 'data:image/png;base64,' + fs.readFileSync(p).toString('base64'); await img.decode();
  const c = document.createElement('canvas'); c.width = 160; c.height = 90; const g = c.getContext('2d'); g.drawImage(img, 0, 0, 160, 90); fs.unlinkSync(p);
  return C.stats(g.getImageData(0, 0, 160, 90).data);
};
const before = C.difference(await frame(0), await frame(1));
const r = await T.action('colour.match', {});
T.assert(r.ref.track === 1, 'the reference is camera A on V2 (what shows at the playhead)');
const after = C.difference(await frame(0), await frame(1));
T.assert(after < before * 0.4, `camera B matched on its own: ${before.toFixed(1)} → ${after.toFixed(1)}`);
const info = await US.host.call('sequenceInfo', { seqId: seq.id, clips: false });
T.assert(info.video.every(t => !t.muted), 'every track is switched back on');
await US.host.call('colourSetSpace', { itemIds: [b.id], space: '' });
return { before: before.toFixed(1), after: after.toFixed(1), summary: r.summary };
