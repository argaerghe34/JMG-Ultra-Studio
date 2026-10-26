// Sound engine tests against the synthetic ground truth in dev/test-media.
const assert = require('assert'), path = require('path'), fs = require('fs'), os = require('os'), cp = require('child_process');
const { load, test, MEDIA } = require('./harness');
const US = load(['audio', 'dsp']);
const truth = f => JSON.parse(fs.readFileSync(path.join(MEDIA, f), 'utf8'));
const have = f => fs.existsSync(path.join(MEDIA, f));

function sine(freq, amp, secs, sr) { const a = new Float32Array(Math.round(secs * sr)); for (let i = 0; i < a.length; i++) a[i] = amp * Math.sin(2 * Math.PI * freq * i / sr); return a; }
function noise(amp, secs, sr, seed = 1) { let x = seed; const a = new Float32Array(Math.round(secs * sr)); for (let i = 0; i < a.length; i++) { x = (x * 1103515245 + 12345) & 0x7fffffff; a[i] = amp * (x / 0x7fffffff * 2 - 1); } return a; }

test('FFT finds a 1 kHz tone', () => {
  const n = 1024, sr = 16000, re = new Float64Array(n), im = new Float64Array(n);
  for (let i = 0; i < n; i++) re[i] = Math.sin(2 * Math.PI * 1000 * i / sr);
  US.dsp.fft(re, im);
  let best = 0, bk = 0; for (let k = 0; k < n / 2; k++) { const m = re[k] ** 2 + im[k] ** 2; if (m > best) { best = m; bk = k; } }
  assert.strictEqual(bk, 64);
});

for (const f of ['music_120bpm', 'music_92bpm']) {
  test(`beats and tempo: ${f}`, async () => {
    if (!have(`audio/${f}.wav`)) return console.log('      (skipped: no test media)');
    const t = truth(`audio/${f}_truth.json`);
    const a = await US.audio.readWav(path.join(MEDIA, 'audio', f + '.wav'));
    const r = await US.dsp.analyseBeats(a.data, a.sr);
    assert.ok(Math.abs(r.bpm - t.bpm) < 1, `tempo ${r.bpm} vs ${t.bpm}`);
    const hits = t.beats.filter(tb => r.beats.some(b => Math.abs(b - tb) <= 0.05)).length;
    const extra = r.beats.filter(b => !t.beats.some(tb => Math.abs(b - tb) <= 0.05)).length;
    console.log(`      ${f}: ${r.bpm.toFixed(2)} BPM, ${hits}/${t.beats.length} beats within ±50 ms, ${extra} extra, downbeats ${t.downbeats.filter(tb => r.downbeats.some(b => Math.abs(b - tb) <= 0.05)).length}/${t.downbeats.length}`);
    assert.ok(hits >= t.beats.length * 0.95, `only ${hits}/${t.beats.length} beats`);
    assert.ok(extra <= 2);
  });
}

test('interview: the four long pauses and nothing else long', async () => {
  if (!have('interview/I001_interview.mp4')) return console.log('      (skipped: no test media)');
  const wav = path.join(os.tmpdir(), 'us-interview16k.wav');
  if (!fs.existsSync(wav)) { try { cp.execFileSync('afconvert', ['-f', 'WAVE', '-d', 'LEI16@16000', '-c', '1', path.join(MEDIA, 'interview', 'I001_interview.mp4'), wav]); } catch (e) { return console.log('      (skipped: afconvert not available)'); } }
  const t = truth('interview/I001_truth.json');
  const a = await US.audio.readWav(wav);
  const env = US.audio.envelope(a.data, a.sr, 0.02, 0.03);
  const st = US.dsp.levelStats(env.db);
  const r = US.dsp.findPauses(env, { threshold: st.auto, minPause: 1.0, padding: 0.15, duration: a.duration });
  assert.strictEqual(r.pauses.length, t.long_silences.length, r.pauses.map(p => p.start.toFixed(2) + '-' + p.end.toFixed(2)).join(' '));
  r.pauses.forEach((p, i) => {
    assert.ok(Math.abs(p.start - t.long_silences[i].start) < 0.06 && Math.abs(p.end - t.long_silences[i].end) < 0.06, `pause ${i}: ${p.start}-${p.end}`);
  });
  const want = t.long_silences.reduce((s, p) => s + p.duration - 0.3, 0);
  assert.ok(Math.abs(r.removed - want) < 0.25, `removed ${r.removed} vs ${want}`);
  // natural short pauses (0.36–0.58 s) are kept at the default 0.6 s
  assert.strictEqual(US.dsp.findPauses(env, { threshold: st.auto, minPause: 0.6, duration: a.duration }).pauses.length, 4);
  console.log(`      threshold ${st.auto.toFixed(1)} dB (floor ${st.floor.toFixed(1)}, speech ${st.speech.toFixed(1)}); pauses within ±60 ms`);
});

test('concert set: songs, applause and talk', async () => {
  if (!have('audio/concert_set.wav')) return console.log('      (skipped: no test media)');
  const t = truth('audio/concert_set_truth.json');
  const a = await US.audio.readWav(path.join(MEDIA, 'audio', 'concert_set.wav'));
  const r = await US.dsp.classify(a.data, a.sr);
  const typeAt = (segs, x) => (segs.find(s => x >= s.start && x < s.end) || {}).type;
  let ok = 0, tot = 0;
  for (let x = 0.5; x < t.duration; x += 1) { tot++; if (typeAt(r.segments, x) === typeAt(t.segments, x)) ok++; }
  const songs = r.segments.filter(s => s.type === 'song'), tSongs = t.segments.filter(s => s.type === 'song');
  const startErr = tSongs.map(ts => Math.min(...songs.map(s => Math.abs(s.start - ts.start))));
  console.log(`      ${(100 * ok / tot).toFixed(1)}% of seconds labelled right; ${songs.length}/${tSongs.length} songs; song start errors ${startErr.map(e => e.toFixed(1)).join(', ')} s`);
  assert.strictEqual(songs.length, tSongs.length);
  assert.ok(ok / tot > 0.95);
  assert.ok(Math.max(...startErr) <= 3);
});

test('loudness: 1 kHz sine at −20 dBFS', () => {
  const sr = 48000, s = sine(997, 0.1, 5, sr);
  const mono = US.dsp.loudness([s], sr).integrated, stereo = US.dsp.loudness([s, s], sr).integrated;
  assert.ok(Math.abs(stereo - (-20)) < 0.2, `stereo ${stereo}`);
  assert.ok(Math.abs(mono - (-23.01)) < 0.2, `mono ${mono}`);
  // gating: 5 s of near-silence after the tone must not pull the figure down
  const withGap = new Float32Array(s.length * 2); withGap.set(s); 
  assert.ok(Math.abs(US.dsp.loudness([withGap, withGap], sr).integrated - stereo) < 0.3);
});

test('peaks: clipping is found, a clean tone is not clipped', () => {
  const sr = 48000, s = sine(440, 1.3, 1, sr).map(v => Math.max(-1, Math.min(1, v)));
  const p = US.dsp.peaks([s], sr);
  assert.ok(p.clips.length >= 1 && p.peakDb > -0.01);
  const q = US.dsp.peaks([sine(440, 0.5, 1, sr)], sr);
  assert.strictEqual(q.clips.length, 0);
  assert.ok(Math.abs(q.peakDb - 20 * Math.log10(0.5)) < 0.05);
});

test('hum: 50 Hz mains hum detected, plain noise not', async () => {
  const sr = 16000, base = noise(0.003, 8, sr);
  const hum = base.map((v, i) => v + 0.01 * Math.sin(2 * Math.PI * 50 * i / sr) + 0.005 * Math.sin(2 * Math.PI * 100 * i / sr) + 0.004 * Math.sin(2 * Math.PI * 150 * i / sr));
  const h1 = US.dsp.detectHum(await US.dsp.quietSpectrum(hum, sr));
  assert.ok(h1 && h1.freq === 50, JSON.stringify(h1));
  assert.strictEqual(US.dsp.detectHum(await US.dsp.quietSpectrum(base, sr)), null);
});

test('wind/rumble and dead air', async () => {
  const sr = 16000;
  const speechy = noise(0.05, 6, sr, 7);
  const rumble = new Float32Array(sr * 2); for (let i = 0; i < rumble.length; i++) rumble[i] = 0.3 * Math.sin(2 * Math.PI * 35 * i / sr) * (0.6 + 0.4 * Math.sin(2 * Math.PI * 1.3 * i / sr));
  const quiet = noise(0.0003, 3, sr, 3);
  const all = new Float32Array(speechy.length + rumble.length + quiet.length + speechy.length);
  all.set(speechy, 0); all.set(rumble, speechy.length); all.set(quiet, speechy.length + rumble.length); all.set(speechy, speechy.length + rumble.length + quiet.length);
  const r = await US.dsp.windAndDeadAir(all, sr);
  assert.ok(r.wind.length === 1 && Math.abs(r.wind[0].start - 6) < 0.3, JSON.stringify(r.wind));
  assert.ok(r.dead.length === 1 && Math.abs(r.dead[0].start - 8) < 0.3, JSON.stringify(r.dead));
});

test('streaming meter matches the one-shot measurement', () => {
  const sr = 48000, a = sine(997, 0.1, 6, sr), b = noise(0.05, 6, sr, 9);
  const one = US.dsp.loudness([a, b], sr).integrated;
  const m = new US.dsp.LoudnessMeter(sr, 2);
  for (let i = 0; i < a.length; i += 12345) m.push([a.subarray(i, i + 12345), b.subarray(i, i + 12345)]);
  const r = m.result();
  assert.ok(Math.abs(r.integrated - one) < 0.05, `${r.integrated} vs ${one}`);
  const pk = Math.max(US.dsp.util.amax(a.map(Math.abs)), US.dsp.util.amax(b.map(Math.abs)));
  assert.ok(Math.abs(r.peakDb - 20 * Math.log10(pk)) < 0.01);
  assert.strictEqual(r.clips.length, 0);
});
