// Sound Check › Duck the music under speech: an interview on A1 and music on A2 → a copy with the music down under speech.
const S = US.story;
const [iv] = await T.importOnce([T.media('interview', 'I001_interview.mp4')], 'Test – Story');
const [music] = await T.importOnce([T.media('audio', 'music_120bpm.wav')], 'Test – E2E');
S.loadState();
if (!S.state().transcripts.some(t => /I001_interview/.test(t.name || t.path || ''))) await S.importFiles(US.jobs.testJob('story'), [T.media('transcripts', 'I001_interview.srt')]);
const seq = await T.freshSequence('E2E Duck', iv.id, 'Test – E2E');
await US.host.call('placeClips', { seqId: seq.id, clips: [{ id: iv.id, in: 0, out: 30, at: 0 }, { id: music.id, in: 0, out: 30, at: 0, a: 1, video: false }] });
await T.open(seq.id);
// an unnamed WAV track might be someone's separately recorded voice: the Assistant asks instead of guessing
let refused = '';
try { await T.action('sound.duck', { db: 12 }); } catch (e) { refused = e.title || e.message; }
T.assert(/isn’t sure which track is the music/.test(refused), 'refuses to guess: ' + refused);
await US.host.rawEval(`(function(){ var s=UStudio.needSeq(${JSON.stringify(seq.id)}); UStudio.openAndQE(s).getAudioTrackAt(1).setName('Music'); return s.audioTracks[1].name; })()`);
const r = await T.action('sound.duck', { db: 12 });
T.assert(r.via === 'transcript' && r.tracks.join() === '1' && r.regions.length >= 1, 'music on A2 ducked under the transcript lines: ' + r.summary);
// measure the music alone in the copy: mute the interview, render, compare speech vs non-speech loudness
await US.host.call('muteTrack', { seqId: r.copy.id, index: 0, mute: true });
const info = await US.host.call('sequenceInfo', { seqId: r.copy.id });
const a = await US.audioKit.loadAudio({ kind: 'sequence', id: r.copy.id, name: info.name, duration: info.duration, fps: info.fps, extra: 0 }, US.jobs.testJob('duck'));
await US.host.call('muteTrack', { seqId: r.copy.id, index: 0, mute: false });
const env = US.audio.envelope(a.data, a.sr, 0.1, 0.1);
const at = t => env.db[Math.min(env.db.length - 1, Math.round(t / env.hop))];
const inside = r.regions.map(x => (x.start + x.end) / 2).filter(t => t < 29), loudMusic = Math.max(...env.db);
const mid = US.mean(inside.map(at));
T.assert(loudMusic - mid > 8, `music is lower under speech: peak ${loudMusic.toFixed(1)} dB, under speech ${mid.toFixed(1)} dB`);
const orig = await US.host.call('sequenceInfo', { seqId: seq.id });
T.assert(orig.audio[1].clips.length === 1, 'the original is unchanged');
return { summary: r.summary, regions: r.regions.map(x => `${x.start.toFixed(1)}–${x.end.toFixed(1)}`), dip: (loudMusic - mid).toFixed(1) + ' dB' };
