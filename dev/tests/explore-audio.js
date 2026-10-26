// Exploration helper (not a test): prints DSP results against ground truth.
// node dev/tests/explore-audio.js beats|pauses|classify
const path = require('path'), fs = require('fs'), cp = require('child_process'), os = require('os');
const { load, MEDIA } = require('./harness');
const US = load(['audio', 'dsp']);
const what = process.argv[2] || 'beats';

function interviewWav() {
  const out = path.join(os.tmpdir(), 'us-interview16k.wav');
  if (!fs.existsSync(out)) cp.execFileSync('afconvert', ['-f', 'WAVE', '-d', 'LEI16@16000', '-c', '1', path.join(MEDIA, 'interview', 'I001_interview.mp4'), out]);
  return out;
}

(async () => {
  if (what === 'beats') {
    for (const f of ['music_120bpm', 'music_92bpm']) {
      const truth = JSON.parse(fs.readFileSync(path.join(MEDIA, 'audio', f + '_truth.json')));
      const a = await US.audio.readWav(path.join(MEDIA, 'audio', f + '.wav'), { targetRate: 16000 });
      const t0 = Date.now();
      const r = await US.dsp.analyseBeats(a.data, a.sr);
      const errs = truth.beats.map(tb => Math.min(...r.beats.map(b => Math.abs(b - tb))));
      const hits = errs.filter(e => e <= 0.05).length;
      const dbHits = truth.downbeats.filter(tb => r.downbeats.some(b => Math.abs(b - tb) <= 0.07)).length;
      const offs = truth.beats.map(tb => { const b = r.beats.reduce((x, y) => Math.abs(y - tb) < Math.abs(x - tb) ? y : x, 1e9); return b - tb; }).filter(e => Math.abs(e) < 0.1);
      console.log(f, `bpm ${r.bpm.toFixed(2)} (truth ${truth.bpm}) beats found ${r.beats.length}/${truth.beats.length} hits ±50ms ${hits} mean offset ${(US.dsp.util.mean(offs) * 1000).toFixed(1)}ms downbeats ${dbHits}/${truth.downbeats.length} first ${r.beats.slice(0, 3).map(x => x.toFixed(3))} (${Date.now() - t0} ms)`);
    }
  }
  if (what === 'pauses') {
    const truth = JSON.parse(fs.readFileSync(path.join(MEDIA, 'interview', 'I001_truth.json')));
    const a = await US.audio.readWav(interviewWav(), { targetRate: 16000 });
    const env = US.audio.envelope(a.data, a.sr, 0.02, 0.03);
    const st = US.dsp.levelStats(env.db);
    console.log('stats', st);
    for (const minPause of [1.0, 0.6, 0.3]) {
      const r = US.dsp.findPauses(env, { threshold: st.auto, minPause, padding: 0.15, duration: a.duration });
      console.log(`minPause ${minPause}: ${r.pauses.length} pauses`, r.pauses.map(p => `${p.start.toFixed(2)}-${p.end.toFixed(2)}`).join(' '), `removed ${r.removed.toFixed(2)}s`);
    }
    console.log('truth long', truth.long_silences.map(p => `${p.start}-${p.end}`).join(' '));
  }
  if (what === 'classify') {
    const truth = JSON.parse(fs.readFileSync(path.join(MEDIA, 'audio', 'concert_set_truth.json')));
    const a = await US.audio.readWav(path.join(MEDIA, 'audio', 'concert_set.wav'), { targetRate: 16000 });
    const t0 = Date.now();
    const r = await US.dsp.classify(a.data, a.sr);
    console.log(`classified ${a.duration}s in ${Date.now() - t0} ms`);
    console.log('found:', r.segments.map(s => `${s.type} ${s.start.toFixed(0)}-${s.end.toFixed(0)}`).join(' | '));
    console.log('truth:', truth.segments.map(s => `${s.type === 'song' ? 'song' : s.type} ${s.start}-${s.end}`).join(' | '));
    let ok = 0; r.seconds.forEach(s => { const tr = truth.segments.find(x => s.t + 0.5 >= x.start && s.t + 0.5 < x.end); if (tr && tr.type === s.type) ok++; });
    console.log(`per-second label accuracy (raw labels after smoothing): ${(100 * ok / r.seconds.length).toFixed(1)}%`);
    if (process.argv[3] === 'features') {
      for (const seg of truth.segments) {
        const ss = r.seconds.filter(s => s.t >= seg.start + 1 && s.t < seg.end - 1);
        const avg = k => (US.dsp.util.mean(ss.map(s => s.f[k]))).toFixed(3);
        const mn = k => Math.min(...ss.map(s => s.f[k])).toFixed(3), mx = k => Math.max(...ss.map(s => s.f[k])).toFixed(3);
        console.log(seg.type.padEnd(9), ['db', 'mod', 'flat', 'cent', 'reg', 'tonal', 'chStab'].map(k => `${k} ${avg(k)} [${mn(k)}..${mx(k)}]`).join('  '));
      }
    }
  }
})().catch(e => { console.error(e); process.exit(1); });
