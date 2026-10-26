// Sound Check in real Premiere: loudness via Premiere's 48 kHz stereo render matches a direct BS.1770 measurement
// of the source WAV; true peak, gaps, hum and wind behave on the test media.
const [m120] = await T.importOnce([T.media('audio', 'music_120bpm.wav')], 'Test – Audio');
// reference: measure the source WAV directly (no Premiere involved)
const fd = T.fs.openSync(m120.path, 'r'); const info = US.audio.wavInfo(fd);
const buf = Buffer.alloc(info.dataBytes); T.fs.readSync(fd, buf, 0, info.dataBytes, info.dataStart); T.fs.closeSync(fd);
const i16 = new Int16Array(buf.buffer, buf.byteOffset, info.dataBytes / 2);
const chs = Array.from({ length: info.channels }, (_, c) => { const a = new Float32Array(i16.length / info.channels); for (let i = 0; i < a.length; i++) a[i] = i16[i * info.channels + c] / 32768; return a; });
const ref = US.dsp.loudness(chs, info.rate).integrated;
const r1 = await US.soundCheck.check({ kind: 'item', id: m120.id, name: m120.name, duration: m120.duration, fps: 25, item: m120 }, 'broadcast', US.jobs.testJob('sound'));
T.near(r1.meter.integrated, ref, 0.2, 'loudness through Premiere vs the source file');
T.assert(r1.meter.truePeakDb >= r1.meter.peakDb - 0.01 && r1.meter.peakDb < -0.9 && r1.meter.peakDb > -1.1, `peak ${r1.meter.peakDb.toFixed(2)} dB (file peaks at −1.0)`);
T.assert(!r1.meter.clips.length && !r1.hum, 'no clipping or hum in clean music');
T.assert(r1.issues.some(i => /Too loud for Broadcast/.test(i.title)), 'flags −18.6 LUFS as too loud for −23');
// interview sequence: two silent gaps over 2 s (10–12.5 and 50–54), no hum, no wind
const [iv] = await T.importOnce([T.media('interview', 'I001_interview.mp4')], 'Test – Audio');
let seq = await T.seqByName('Test – Audio e2e interview');
if (!seq) { seq = await T.freshSequence('Test – Audio e2e interview', iv.id, 'Test – Audio'); await US.host.call('placeClips', { seqId: seq.id, cursor: 0, clips: [{ id: iv.id, in: 0, out: iv.duration }] }); }
await T.open(seq.id);
const r2 = await US.soundCheck.check({ kind: 'sequence', id: seq.id, name: seq.name, duration: 90, fps: 25 }, 'social', US.jobs.testJob('sound2'));
T.assert(r2.dead.length === 2 && Math.abs(r2.dead[0].start - 10) < 0.3 && Math.abs(r2.dead[1].start - 50) < 0.3, 'silent gaps at 10 s and 50 s: ' + JSON.stringify(r2.dead));
T.assert(!r2.hum && !r2.wind.length, 'no hum or wind in the interview');
// the Assistant action runs on the active sequence
const act = await T.action('sound.check', { target: 'podcast' });
T.assert(/LUFS/.test(act.summary), 'action summary mentions LUFS');
T.assert(US.actions.get('sound.check').match('is this loud enough for YouTube?').target === 'social', 'Assistant phrase: loud enough for YouTube');
T.assert(!US.actions.get('sound.check').match('cut the silences'), 'does not steal Silence Cut requests');
return { musicLUFS: +r1.meter.integrated.toFixed(2), reference: +ref.toFixed(2), interviewLUFS: +r2.meter.integrated.toFixed(2), action: act.summary };
