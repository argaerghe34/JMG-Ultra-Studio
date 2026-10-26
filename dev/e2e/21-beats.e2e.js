// Beat Cut in real Premiere: tempo and beats of the 120 and 92 BPM test tracks, bar markers on the clip, and a beat montage.
const out = {};
const [m120, m92] = await T.importOnce([T.media('audio', 'music_120bpm.wav'), T.media('audio', 'music_92bpm.wav')], 'Test – Audio');
for (const [item, file] of [[m120, 'music_120bpm'], [m92, 'music_92bpm']]) {
  const truth = JSON.parse(T.fs.readFileSync(T.media('audio', file + '_truth.json'), 'utf8'));
  const target = { kind: 'item', id: item.id, name: item.name, duration: item.duration, fps: 25, item };
  const an = await US.beatCut.analyse(target, US.jobs.testJob('beats'));
  T.near(an.bpm, truth.bpm, 1, `${file} tempo`);
  const hits = truth.beats.filter(tb => an.beats.some(b => Math.abs(b - tb) <= 0.05)).length;
  T.assert(hits >= truth.beats.length * 0.95, `${file}: ${hits}/${truth.beats.length} beats within ±50 ms`);
  const downHits = truth.downbeats.filter(tb => an.downbeats.some(b => Math.abs(b - tb) <= 0.05)).length;
  T.assert(downHits >= truth.downbeats.length * 0.9, `${file}: ${downHits}/${truth.downbeats.length} bars`);
  out[file] = `${an.bpm.toFixed(2)} BPM, ${hits}/${truth.beats.length} beats, ${downHits}/${truth.downbeats.length} bars`;
}
// bar markers on the 120 BPM clip, then remove them again
const target = { kind: 'item', id: m120.id, name: m120.name, duration: m120.duration, fps: 25, item: m120 };
const an = await US.beatCut.analyse(target, US.jobs.testJob('beats'));
const before = (await US.host.call('clipMarkers', { id: m120.id })).length;
const times = US.beatCut.markerTimes(an, 'bar');
await US.audioKit.addMarkers(target, times.map((x, i) => ({ start: x.t, name: `Bar ${i + 1}`, color: 3 })), US.jobs.testJob('m'), 'beats:' + m120.id);
const mk = await US.host.call('clipMarkers', { id: m120.id });
T.assert(mk.length - before === an.downbeats.length, `${mk.length - before} markers for ${an.downbeats.length} bars`);
T.near(mk[before].start, 0.5, 0.03, 'first bar marker at 0.5 s');
T.assert(await US.audioKit.removeMarkers('beats:' + m120.id) === an.downbeats.length, 'markers removed');
T.assert((await US.host.call('clipMarkers', { id: m120.id })).length === before, 'no markers left behind');
// beat montage: 15 s, a cut every 2 beats
const clips = await T.importOnce(['C001_sharp_static.mp4', 'C005_shaky.mp4', 'C009_slow_pan_good.mp4', 'C007_reveal_pullback.mp4'].map(f => T.media('concert', f)), 'Test – Audio/Clips');
const res = await US.beatCut.montage(target, an, clips, { every: 2, energy: false, length: 15, order: 'bin' }, US.jobs.testJob('montage'));
const si = await US.host.call('sequenceInfo', { seqId: res.seq.id });
T.near(si.duration, 15, 0.05, 'montage length');
const v1 = si.video[0].clips;
T.assert(v1.every(c => c.start === 0 || an.beats.some(b => Math.abs(b - c.start) <= 0.041)), 'every cut on a beat (±1 frame)');
T.assert(v1.slice(1).every((c, i) => Math.abs(c.start - v1[i].end) < 0.001), 'no gaps between shots');
T.assert(si.audio[0].clips.length === 1 && si.audio[0].clips[0].name === 'music_120bpm.wav', 'only the music on A1');
T.assert(si.audio.slice(1).every(t => !t.clips.length), 'clips’ own sound left out');
T.assert(US.actions.get('beats.markers').match('markers on every beat').every === 'beat', 'Assistant phrase: markers on every beat');
T.assert(US.actions.get('beats.montage').match('cut the BEST bin to the music').bin === 'BEST', 'Assistant phrase: cut the BEST bin to the music');
await US.host.call('deleteSequence', { seqId: res.seq.id });
out.montage = `${v1.length} shots in 15 s`;
return out;
