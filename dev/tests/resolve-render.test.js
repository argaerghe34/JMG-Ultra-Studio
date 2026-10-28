// Resolve: rendering (resolve/host/render.js) against the stand-in Resolve, and the panel's render follower
// (js/core/encoder.js) in Resolve mode.
const assert = require('assert'), fs = require('fs'), path = require('path');
const { load, test } = require('./harness');
const { setup, asResolve, fakeJob } = require('./resolve-render-kit');
const { wavHeader } = require('../../resolve/host/render');
const US = load(['audio', 'encoder']);

/** a 10 s timeline of one clip at 25 fps (frames 86400–86650) */
function withTimeline(o = {}) {
  const S = setup(o);
  const file = path.join(S.dir, 'I001.mp4'); fs.writeFileSync(file, 'x');   // on disk, so it isn't offline
  const clip = S.F.addMedia(file, { frames: 500 });
  const tl = S.F.addTimeline('Cut', [{ item: clip, in: 0, out: 250 }]);
  return Object.assign(S, { clip, tl });
}

test('presets: Ultra Studio’s recipes when Resolve has the formats, empty when not', async () => {
  const S = setup();
  assert.deepStrictEqual(await S.run('presets'), { wav16k: 'resolve:wav16k', wav48: 'resolve:wav48', h264proxy: 'resolve:proxy' });
  assert.deepStrictEqual(await S.run('encoderPresets'), { h264: 'resolve:h264', proxy: 'resolve:proxy', analysis: 'resolve:analysis', wav: 'resolve:wav' });
  assert.strictEqual(await S.run('encoderListen'), true);
  S.F.project.GetRenderPresetList = () => ['H.264 Master'];   // no "Audio Only" preset here (WAV comes from it)
  assert.strictEqual((await S.run('presets')).wav16k, '');
  assert.strictEqual((await S.run('encoderPresets')).h264, 'resolve:h264');
});

test('renderAudio of a timeline: sound only, a WAV (48 kHz: Resolve 21 refuses 16 kHz), whole timeline, named as asked; settings put back', async () => {
  const S = withTimeline();
  const P = S.F.project;
  P.SetRenderSettings({ TargetDir: '/Users/me/Renders', CustomName: 'Mine' });
  P.SetCurrentRenderFormatAndCodec('mov', 'ProRes422HQ'); P.SetCurrentRenderMode(0);
  const out = path.join(S.dir, 'sound.wav');
  const r = await S.run('renderAudio', { seqId: S.tl.GetUniqueId(), out });
  assert.strictEqual(r.path, out); assert.ok(r.size > 44); assert.strictEqual(r.rate, 48000); assert.strictEqual(r.resampled, true);
  const j = S.F.jobLog[0];
  assert.strictEqual(j.settings.AudioCodec, 'lpcm', 'Resolve’s Audio Only preset: PCM (in a .mov, turned into the WAV)');
  assert.strictEqual(j.mode, 1, 'single clip');
  assert.strictEqual(j.settings.ExportVideo, false); assert.strictEqual(j.settings.ExportAudio, true);
  assert.strictEqual(j.settings.SelectAllFrames, true);
  assert.strictEqual(j.settings.TargetDir, S.dir); assert.strictEqual(j.settings.CustomName, 'sound');
  assert.strictEqual(j.settings.AudioSampleRate, 48000);
  assert.ok(!require('fs').readdirSync(S.dir).some(f => f.endsWith('.mov')), 'the .mov Resolve wrote is gone');
  assert.strictEqual(j.timeline, 'Cut');
  assert.strictEqual(S.F.renderJobs.length, 0, 'our job is off the Render Queue');
  assert.deepStrictEqual(P.GetCurrentRenderFormatAndCodec(), { format: 'mov', codec: 'ProRes422HQ' }, 'format and codec put back');
  assert.strictEqual(P.GetCurrentRenderMode(), 0);
  assert.strictEqual(P.GetRenderSettings().TargetDir, '/Users/me/Renders', 'the user’s render settings come back from the saved preset');
  assert.deepStrictEqual(Object.keys(S.F.presets), [], 'the temporary preset is deleted');
});

test('renderAudio of a clip: a scratch timeline (sound only, its In/Out) in JMG Ultra Studio/Temp, deleted after', async () => {
  const S = withTimeline();
  S.clip.SetMarkInOut(50, 149);   // 2 s to 6 s
  const before = S.F.timelines.length;
  const r = await S.run('renderAudio', { id: S.clip.GetUniqueId(), out: path.join(S.dir, 'clip.wav') });
  assert.ok(r.size > 44);
  const j = S.F.jobLog[0];
  assert.ok(/^Ultra Studio temp /.test(j.timeline));
  assert.strictEqual(j.video, 0, 'sound only');
  assert.deepStrictEqual(j.audio, [{ name: 'I001.mp4', src: 50, len: 100 }], 'the clip between its In and Out');
  assert.strictEqual(S.F.timelines.length, before, 'scratch timeline deleted');
  const ultra = S.F.root._subs.find(f => f._name === 'JMG Ultra Studio');
  assert.ok(!ultra || !ultra._subs.some(f => f._name === 'Temp'), 'the empty Temp bin is removed');
  assert.strictEqual(S.F.currentTimeline, S.tl, 'the timeline you had open is current again');
});

test('renderAudio: 48 kHz when Resolve won’t take 16 kHz (the result says so; the panel resamples)', async () => {
  const S = withTimeline();
  const set = S.F.project.SetRenderSettings;
  S.F.project.SetRenderSettings = s => (s.AudioSampleRate === 16000 ? false : set(s));
  const r = await S.run('renderAudio', { seqId: S.tl.GetUniqueId(), out: path.join(S.dir, 'a.wav') });
  assert.strictEqual(S.F.jobLog[0].settings.AudioSampleRate, 48000);
  assert.strictEqual(r.rate, 48000); assert.strictEqual(r.resampled, true);
  // the panel's reader turns it into 16 kHz mono
  const a = await US.audio.readWav(r.path, { targetRate: 16000 });
  assert.strictEqual(a.sr, 16000); assert.strictEqual(a.sourceRate, 48000); assert.ok(Math.abs(a.duration - 2) < 0.01);
});

test('renderAudio: a failed render is a plain RENDER_FAILED, and nothing is left behind', async () => {
  const S = withTimeline();
  S.F.renderFails = true;
  const n = S.F.timelines.length;
  await assert.rejects(S.run('renderAudio', { id: S.clip.GetUniqueId(), out: path.join(S.dir, 'x.wav') }), e => e.code === 'RENDER_FAILED');
  assert.strictEqual(S.F.renderJobs.length, 0); assert.strictEqual(S.F.timelines.length, n);
  // a picture-only clip has no sound to render
  const png = path.join(S.dir, 'a.png'); fs.writeFileSync(png, 'x');
  const still = S.F.addMedia(png, { type: 'Still', audioCh: 0 });
  await assert.rejects(S.run('renderAudio', { id: still.GetUniqueId(), out: path.join(S.dir, 'y.wav') }), e => e.code === 'NO_AUDIO');
  // Resolve already busy rendering
  S.F.renderFails = false; S.F.project.IsRenderingInProgress = () => true;
  await assert.rejects(S.run('renderAudio', { seqId: S.tl.GetUniqueId(), out: path.join(S.dir, 'z.wav') }), e => e.code === 'BUSY');
  assert.strictEqual(S.F.renderJobs.length, 0);
});

test('exportFrame: playhead to the time, still saved, playhead/timeline/page put back; Color page as a fallback', async () => {
  const S = withTimeline();
  const other = S.F.addTimeline('Other', [{ item: S.clip, in: 0, out: 50 }]);
  S.F.project.SetCurrentTimeline(other);
  S.F.resolve.OpenPage('media');
  S.tl.SetCurrentTimecode('01:00:01:00');
  const seen = [];
  const exp = S.F.project.ExportCurrentFrameAsStill;
  S.F.project.ExportCurrentFrameAsStill = f => { seen.push([S.F.resolve.GetCurrentPage(), S.tl.GetCurrentTimecode()]); return S.F.resolve.GetCurrentPage() === 'color' ? exp(f) : false; };
  const p = await S.run('exportFrame', { seqId: S.tl.GetUniqueId(), seconds: 4.2, outBase: path.join(S.dir, 'thumb') });
  assert.strictEqual(p, path.join(S.dir, 'thumb.png')); assert.ok(fs.existsSync(p));
  const tc = require('../../resolve/host/base').framesToTC(S.tl.GetStartFrame() + 105, 25, false);   // 4.2 s = 105 frames in
  assert.deepStrictEqual(seen, [['edit', tc], ['color', tc]]);
  assert.strictEqual(S.F.resolve.GetCurrentPage(), 'media'); assert.strictEqual(S.F.currentTimeline, other);
  assert.strictEqual(S.tl.GetCurrentTimecode(), '01:00:01:00');
  S.F.project.ExportCurrentFrameAsStill = () => false;
  await assert.rejects(S.run('exportFrame', { seqId: S.tl.GetUniqueId(), seconds: 1, outBase: path.join(S.dir, 'no') }), e => e.code === 'RENDER_FAILED');
});

test('queueExport + startEncoderBatch + renderJobStatus: only our renders start; finished ones leave the queue', async () => {
  const S = withTimeline();
  const P = S.F.project;
  P.SetRenderSettings({ TargetDir: '/u', CustomName: 'Theirs' }); const theirs = P.AddRenderJob();
  const out = path.join(S.dir, 'Cut - Master.mp4');
  const id = await S.run('queueExport', { seqId: S.tl.GetUniqueId(), out, preset: 'resolve:h264', workArea: 0 });
  const j = S.F.jobLog[1];
  assert.deepStrictEqual(j.format, { format: 'mp4', codec: 'H264' });
  assert.strictEqual(j.settings.SelectAllFrames, true); assert.strictEqual(j.settings.ExportVideo, true); assert.strictEqual(j.settings.ExportAudio, true);
  assert.strictEqual(j.settings.FormatWidth, 1920); assert.strictEqual(j.settings.FormatHeight, 1080);
  assert.strictEqual(j.settings.CustomName, 'Cut - Master'); assert.strictEqual(j.settings.TargetDir, S.dir);
  assert.strictEqual(await S.run('startEncoderBatch', { ids: [id] }), true);
  const [st] = await S.run('renderJobStatus', { ids: [id] });
  assert.deepStrictEqual([st.status, st.progress, st.file], ['complete', 1, out]);
  assert.deepStrictEqual(S.F.renderJobs.map(x => x.JobId), [theirs], 'their job is still there, not rendered');
  assert.strictEqual(S.F.renderJobs[0].status, 'Ready');
  // a job someone took off the queue
  assert.strictEqual((await S.run('renderJobStatus', { ids: ['gone'] }))[0].status, 'missing');
});

test('queueExport: a Resolve render preset by name, a vertical timeline gets vertical YouTube sizes, a Premiere .epr is refused', async () => {
  const S = withTimeline();
  await S.run('queueExport', { seqId: S.tl.GetUniqueId(), out: path.join(S.dir, 'a.mp4'), preset: 'preset:YouTube - 1080p' });
  assert.strictEqual(S.F.jobLog[0].settings.SelectAllFrames, true);
  await assert.rejects(S.run('queueExport', { seqId: S.tl.GetUniqueId(), out: path.join(S.dir, 'b.mp4'), preset: 'preset:Nope' }), e => e.code === 'PRESET_MISSING');
  await assert.rejects(S.run('queueExport', { seqId: S.tl.GetUniqueId(), out: path.join(S.dir, 'b.mp4'), preset: '/Users/me/Presets/H264.epr' }), e => e.code === 'PRESET_MISSING' && /Premiere/.test(e.title));
  S.tl.SetSetting('timelineResolutionWidth', '1080'); S.tl.SetSetting('timelineResolutionHeight', '1920');
  await S.run('queueExport', { seqId: S.tl.GetUniqueId(), out: path.join(S.dir, 'c.mp4'), preset: 'resolve:youtube1080' });
  const j = S.F.jobLog[S.F.jobLog.length - 1].settings;
  assert.deepStrictEqual([j.FormatWidth, j.FormatHeight], [1080, 1920]);
  // In/Out of the timeline (workArea 1): Resolve reports marks from the timeline's start
  S.tl.SetMarkInOut(50, 99);
  await S.run('queueExport', { seqId: S.tl.GetUniqueId(), out: path.join(S.dir, 'd.mp4'), preset: 'resolve:h264', workArea: 1 });
  const k = S.F.jobLog[S.F.jobLog.length - 1].settings;
  assert.deepStrictEqual([k.SelectAllFrames, k.MarkIn, k.MarkOut], [false, 86450, 86499]);
});

test('queueItemExport: a Media Pool clip on a scratch timeline, kept until its render is over', async () => {
  const S = withTimeline();
  const n = S.F.timelines.length;
  const id = await S.run('queueItemExport', { id: S.clip.GetUniqueId(), out: path.join(S.dir, 'copy.mp4'), preset: 'resolve:analysis' });
  const j = S.F.jobLog[0];
  assert.ok(/^Ultra Studio temp /.test(j.timeline)); assert.strictEqual(j.video, 1, 'picture and sound');
  assert.deepStrictEqual([j.settings.FormatWidth, j.settings.FormatHeight], [1280, 720]);
  assert.strictEqual(S.F.timelines.length, n + 1, 'the scratch timeline waits for the render');
  assert.strictEqual(S.F.currentTimeline, S.tl);
  await S.run('startEncoderBatch', { ids: [id] });
  assert.strictEqual((await S.run('renderJobStatus', { ids: [id] }))[0].status, 'complete');
  assert.strictEqual(S.F.timelines.length, n, 'and goes when it’s done');
});

test('autoReframe: Smart Reframe on a copy at the same height (608×1080 for 9:16), the open timeline kept', async () => {
  const S = withTimeline();
  const calls = [];
  const dup = S.tl.DuplicateTimeline;
  S.tl.DuplicateTimeline = n => { const c = dup(n); for (const ti of c._v.flat()) ti.SmartReframe = () => { calls.push(ti.GetName()); return true; }; return c; };
  const r = await S.run('autoReframe', { seqId: S.tl.GetUniqueId(), num: 9, den: 16, motion: 'default', name: 'Cut – 9:16', binPath: 'JMG Ultra Studio/Deliver' });
  assert.deepStrictEqual([r.name, r.width, r.height, r.reframed, r.failed], ['Cut – 9:16', 608, 1080, 1, 0]);
  const t = S.F.timelines.find(x => x.GetUniqueId() === r.id);
  assert.strictEqual(t.GetSetting('useCustomSettings'), '1');
  assert.strictEqual(t.GetSetting('timelineInputResMismatchBehavior'), 'scaleToCrop');
  assert.deepStrictEqual(calls, ['I001.mp4']);
  assert.strictEqual(S.F.currentTimeline, S.tl);
  assert.strictEqual(S.tl.GetSetting('timelineResolutionWidth'), '1920', 'the original keeps its size');
});

test('renderStop: stops Resolve and takes our unfinished renders off the queue', async () => {
  const S = withTimeline();
  S.F.project.StartRendering = () => { for (const j of S.F.renderJobs) j.status = 'Rendering'; return true; };
  const st = S.F.project.GetRenderJobStatus;
  S.F.project.GetRenderJobStatus = id => Object.assign(st(id), { CompletionPercentage: 40 });
  const id = await S.run('queueItemExport', { id: S.clip.GetUniqueId(), out: path.join(S.dir, 'c.mp4'), preset: 'resolve:h264' });
  await S.run('startEncoderBatch', { ids: [id] });
  const [s] = await S.run('renderJobStatus', { ids: [id] });
  assert.deepStrictEqual([s.status, s.progress], ['rendering', 0.4]);
  const n = S.F.timelines.length;
  assert.strictEqual(await S.run('renderStop', { ids: [id] }), 1);
  assert.strictEqual(S.F.renderJobs.length, 0); assert.strictEqual(S.F.timelines.length, n - 1, 'its scratch timeline goes too');
});

test('wavHeader reads rate and channels', () => {
  const { makeWav } = require('./resolve-render-kit');
  const f = path.join(require('os').tmpdir(), `us-wh-${Date.now()}.wav`);
  fs.writeFileSync(f, makeWav(44100, 1, 0.1));
  assert.deepStrictEqual(wavHeader(f), { channels: 1, rate: 44100, bits: 16 });
  fs.unlinkSync(f);
});

/* ---------- the panel: US.encoder.run in Resolve ---------- */
async function encoderRun(S, tasks, opts, { onPoll } = {}) {
  const env = asResolve(US, S.host);
  const job = fakeJob();
  US.encoder.pollMs = 1;
  try {
    const p = US.encoder.run(tasks, job, opts);
    if (onPoll) onPoll(job);
    return { job, calls: env.calls, out: await p.catch(e => ({ error: e })) };
  } finally { env.restore(); US.encoder.pollMs = 1000; }
}

test('encoder (Resolve): real progress from GetRenderJobStatus, files where Resolve wrote them', async () => {
  const S = withTimeline();
  // each status call moves a rendering job on by half
  S.F.project.StartRendering = (...ids) => { for (const j of S.F.renderJobs) if (ids.flat().includes(j.JobId)) { j.status = 'Rendering'; j.pct = 0; } return true; };
  S.F.project.GetRenderJobStatus = id => {
    const j = S.F.renderJobs.find(x => x.JobId === id); if (!j) return {};
    if (j.status === 'Rendering') { j.pct += 50; if (j.pct >= 100) { j.status = 'Complete'; fs.mkdirSync(j.settings.TargetDir, { recursive: true }); fs.writeFileSync(path.join(j.settings.TargetDir, j.settings.CustomName + '.' + j.format.format), 'x'); } }
    return { JobStatus: j.status, CompletionPercentage: j.status === 'Complete' ? 100 : j.pct || 0 };
  };
  const tasks = [{ seqId: S.tl.GetUniqueId(), out: path.join(S.dir, 'Cut - Master.mov'), preset: 'resolve:h264', name: 'Master' }, { seqId: S.tl.GetUniqueId(), out: path.join(S.dir, 'Cut - 9x16.mp4'), preset: 'resolve:h264', name: '9x16' }];
  const { job, calls, out } = await encoderRun(S, tasks, { label: 'Exporting', from: 0.2, to: 1 });
  assert.ok(!out.error, out.error && out.error.stack);
  assert.ok(out.every(t => t.ok), JSON.stringify(out));
  assert.strictEqual(out[0].out, path.join(S.dir, 'Cut - Master.mp4'), 'the H.264 recipe writes .mp4, and the result says so');
  assert.deepStrictEqual(calls.map(c => c[0]).filter((c, i, a) => a.indexOf(c) === i), ['queueExport', 'startEncoderBatch', 'renderJobStatus']);
  assert.deepStrictEqual(calls.find(c => c[0] === 'startEncoderBatch')[1].ids, tasks.map(t => t.id));
  assert.ok(job.frac.some(f => f > 0.2 && f < 1), 'progress in between: ' + job.frac.join(','));
  assert.ok(job.frac.every((f, i) => i === 0 || f >= job.frac[i - 1] - 1e-9), 'never goes back');
  assert.strictEqual(job.frac[job.frac.length - 1], 1);
  assert.ok(job.msgs.some(m => /Exporting 1 of 2 · Master/.test(m)));
  assert.strictEqual(S.F.renderJobs.length, 0);
});

test('encoder (Resolve): a failed render is reported plainly and stays in the queue to show why', async () => {
  const S = withTimeline();
  const start = S.F.project.StartRendering;
  S.F.project.StartRendering = (...ids) => { const r = start(...ids); S.F.renderJobs[1].status = 'Failed'; return r; };
  const tasks = ['a', 'b'].map(n => ({ seqId: S.tl.GetUniqueId(), out: path.join(S.dir, n + '.mp4'), preset: 'resolve:h264', name: n }));
  const { out } = await encoderRun(S, tasks, {});
  assert.deepStrictEqual(out.map(t => t.ok), [true, false]);
  assert.strictEqual(out[1].error, 'fake failure');
  assert.deepStrictEqual(S.F.renderJobs.map(j => j.status), ['Failed']);
});

test('encoder (Resolve): Stop stops the render and takes ours off the queue', async () => {
  const S = withTimeline();
  S.F.project.StartRendering = () => { for (const j of S.F.renderJobs) j.status = 'Rendering'; return true; };
  let stopped = 0; S.F.project.StopRendering = () => { stopped++; };
  const tasks = [{ seqId: S.tl.GetUniqueId(), out: path.join(S.dir, 's.mp4'), preset: 'resolve:h264', name: 's' }];
  const { out, calls } = await encoderRun(S, tasks, {}, { onPoll: job => setTimeout(() => { job.cancelled = true; }, 15) });
  assert.strictEqual(out.error && out.error.code, 'CANCELLED');
  assert.ok(/Stopped rendering/.test(out.error.title));
  assert.ok(calls.some(c => c[0] === 'renderStop')); assert.strictEqual(stopped, 1);
  assert.strictEqual(S.F.renderJobs.length, 0);
});

test('encoder (Resolve): queue only leaves the renders waiting in the Render Queue', async () => {
  const S = withTimeline();
  const tasks = [{ seqId: S.tl.GetUniqueId(), out: path.join(S.dir, 'q.mp4'), preset: 'resolve:h264', name: 'q', range: { start: 2, end: 4 } }];
  const { out, calls } = await encoderRun(S, tasks, { queueOnly: true });
  assert.strictEqual(out[0].queued, true);
  assert.ok(!calls.some(c => c[0] === 'startEncoderBatch'));
  assert.deepStrictEqual(S.F.renderJobs.map(j => [j.status, j.settings.MarkIn, j.settings.MarkOut]), [['Ready', 86450, 86499]]);
});

test('encoder (Resolve): a render that can’t be queued takes the ones already queued off again', async () => {
  const S = withTimeline();
  const tasks = [{ seqId: S.tl.GetUniqueId(), out: path.join(S.dir, 'ok.mp4'), preset: 'resolve:h264' }, { seqId: S.tl.GetUniqueId(), out: path.join(S.dir, 'bad.mp4'), preset: 'preset:Missing' }];
  const { out } = await encoderRun(S, tasks, {});
  assert.strictEqual(out.error && out.error.code, 'PRESET_MISSING');
  assert.strictEqual(S.F.renderJobs.length, 0);
});

test('core audio in Resolve: a timeline’s sound is rendered by Resolve and read at 16 kHz', async () => {
  const S = withTimeline();
  const env = asResolve(US, S.host);
  try {
    const a = await US.audio.forSequence(S.tl.GetUniqueId(), {});
    assert.strictEqual(a.sr, 16000); assert.ok(Math.abs(a.duration - 2) < 0.01); assert.ok(a.data.length > 30000);
  } finally { env.restore(); }
});

test('movPcmToWav: Resolve’s Audio Only .mov becomes the same sound as a WAV (16/24-bit, either byte order, several chunks)', () => {
  const { makeMovPcm, makeWav } = require('./resolve-render-kit');
  const { movPcmToWav } = require('../../resolve/host/render');
  const dir = require('fs').mkdtempSync(path.join(require('os').tmpdir(), 'us-movpcm-'));
  for (const o of [{}, { bits: 24 }, { bigEndian: true }, { bits: 24, bigEndian: true, chunks: 7 }, { chunks: 3 }]) {
    const mov = path.join(dir, 'a.mov'), wav = path.join(dir, 'a.wav');
    require('fs').writeFileSync(mov, makeMovPcm(48000, 2, 0.5, o));
    const r = movPcmToWav(mov, wav);
    assert.deepStrictEqual([r.rate, r.channels, r.bits, r.frames], [48000, 2, o.bits || 16, 24000], JSON.stringify(o));
    assert.ok(require('fs').readFileSync(wav).equals(makeWav(48000, 2, 0.5, o)), 'identical to the WAV of the same sound ' + JSON.stringify(o));
  }
});
