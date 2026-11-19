// The real seeing route on two test clips, by hand: stills taken in the panel, the vision model asked, the raw answer,
// the tidied result and the timings. No record is made or changed (it doesn't go through analyse/save); the requests do
// show in Settings › What was sent to AI as “Seeing footage (probe)”, as every request does.
// CEP_TIMEOUT=180 node dev/cep.js 8890 js dev/probes/understand-describe.js
const U = US.understand, P = U && U._pure, path = require('path'), fs = require('fs');
if (!U) return { loaded: false };
const plan = U.plan();
if (plan.vision.kind === 'none') return { vision: 'none', note: 'No vision model is chosen or installed (Settings › Vision & listening models).', plan: { route: plan.route, needsModel: !!plan.vision.needsModel } };
const dir = path.join(fs.realpathSync(US.host.extensionDir()), 'dev', 'test-media');
const CLIPS = [{ file: path.join(dir, 'concert', 'C001_sharp_static.mp4'), upTo: 10 }, { file: path.join(dir, 'interview', 'I001_interview.mp4'), upTo: 20 }];
const release = await U.pause();   // the background queue waits, so the timings are the model's own
const out = { model: plan.vision.label, kind: plan.vision.kind, perAsk: (plan.vision.model && plan.vision.model.stillsPerAsk) || 2, clips: [] };
try {
  const tStart = performance.now();
  let first = true;
  for (const c of CLIPS) {
    const row = { clip: path.basename(c.file), asks: [] };
    out.clips.push(row);
    if (!fs.existsSync(c.file)) { row.error = 'file not found: ' + c.file; continue; }
    const item = { path: c.file, name: path.basename(c.file), duration: c.upTo };
    const times = P.visionTimes(c.upTo), per = out.perAsk, shots = [], events = [];
    for (let i = 0; i < times.length; i += per) {
      const batch = times.slice(i, i + per), ask = { times: batch };
      row.asks.push(ask);
      const t0 = performance.now();
      const g = await U.routes.grab(item, batch);
      ask.grabMs = Math.round(performance.now() - t0); ask.stills = g.stills.length; ask.how = g.how || g.why;
      if (!g.stills.length) { ask.error = 'no stills: ' + g.why; continue; }
      ask.stillBytes = g.stills.map(s => Math.round(s.data.length * 3 / 4));
      const req = P.visionRequest(item, g.stills); req.feature = 'Seeing footage (probe)'; ask.maxTokens = req.maxTokens;
      const t1 = performance.now();
      try {
        const raw = await U.routes.vision(plan, req, { job: US.jobs.testJob('probe') });
        ask.secs = Math.round((performance.now() - t1) / 10) / 100; ask.secsPerStill = Math.round(ask.secs / g.stills.length * 100) / 100;
        if (first) { ask.note = 'the first request includes starting the helper and loading the model'; first = false; }
        ask.raw = raw;
        const t = P.tidyVision(raw, g.stills.map(s => s.t), c.upTo, c.upTo / times.length);
        shots.push(...t.shots); events.push(...t.events);
      } catch (e) { const x = US.errors.explain(e); ask.secs = Math.round((performance.now() - t1) / 10) / 100; ask.error = x.title; ask.detail = String(x.detail || '').slice(0, 600); first = false; }
    }
    row.tidied = { shots: P.mergeShots(shots), events };
    const timed = row.asks.filter(a => a.secsPerStill && !a.note);
    row.secsPerStill = timed.length ? Math.round(timed.reduce((n, a) => n + a.secsPerStill, 0) / timed.length * 100) / 100 : null;
  }
  out.totalSecs = Math.round((performance.now() - tStart) / 100) / 10;
  out.helper = US.models.helper.url || '';
} finally { release(); }
return out;
