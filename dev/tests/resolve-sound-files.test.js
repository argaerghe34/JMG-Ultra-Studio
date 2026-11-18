// Resolve: the sound tools read the sound straight from the media files (js/core/audio.js fromFiles) instead of
// rendering, so Resolve isn't blocked: the timeline laid out as Resolve plays it (switched-on tracks or the soloed
// one, enabled clips, source In, speed, place), a clip's In/Out or subclip range, the same length as Resolve's render;
// Resolve's render only for what can't be read that way. Also: Footage's stills of a clip saved by Resolve.
const assert = require('assert'), fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');
const { load, test } = require('./harness');
const { setup, asResolve, makeWav, fakeJob } = require('./resolve-render-kit');
const US = load(['audio']);
const A = US.audio, SR = 16000;
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'us-sndfiles-'));

/** A reader standing in for ffmpeg/the panel's decoder: each file's sound is a ramp (sample i = i, or a constant). */
function withReaders(sounds, fn) {
  const keep = A.readers.slice(), seen = [];
  A.readers.splice(0, A.readers.length, { name: 'stub', ok: f => f in sounds, read: async (f, upTo, info) => { seen.push([path.basename(f), upTo, info]); if (sounds[f] instanceof Error) throw sounds[f]; return sounds[f]; } });
  return Promise.resolve().then(() => fn(seen)).finally(() => A.readers.splice(0, A.readers.length, ...keep));
}
const ramp = (n, k = 1) => Float32Array.from({ length: n }, (_, i) => i * k);
const flat = (n, v) => new Float32Array(n).fill(v);
function asResolveStub(stub) {
  const keep = { is: US.app.is, call: US.host.call }, calls = [];
  US.app.is = w => w === 'resolve';
  US.host.call = async (fn, a) => { calls.push([fn, a]); if (stub[fn]) return stub[fn](a); throw new Error('unexpected ' + fn); };
  return { calls, restore() { US.app.is = keep.is; US.host.call = keep.call; US.settings.set('audio.fromFiles', true); } };
}
const seqInfo = (audio, duration = 10, fps = 25) => ({ id: 's1', fps, duration, video: [], audio });

test('layout: tracks switched on (or only the soloed one), enabled clips, source In, speed, place; nested timelines refused', async () => {
  const env = asResolveStub({ sequenceInfo: () => seqInfo([
    { muted: false, clips: [{ name: 'a', path: '/m/a.mp4', start: 1, end: 3, in: 10, out: 12, speed: 1 }, { name: 'off', path: '/m/a.mp4', start: 3, end: 4, in: 0, out: 1, disabled: true }] },
    { muted: true, clips: [{ name: 'b', path: '/m/b.wav', start: 0, end: 10, in: 0, out: 10 }] },
    // the source Out a frame short (as Resolve sometimes reports it) is still normal speed; 2× is 2×
    { muted: false, clips: [{ name: 'c', path: '/m/c.m4a', start: 4, end: 6, in: 5, out: 6.96 }, { name: 'd', path: '/m/c.m4a', start: 6, end: 7, in: 20, out: 22 }] }
  ]) });
  try {
    const l = await A.layoutFor({ seqId: 's1' });
    assert.strictEqual(l.duration, 10);
    assert.deepStrictEqual(l.pieces.map(p => [p.name, p.at, p.len, p.from, p.speed]), [['a', 1, 2, 10, 1], ['c', 4, 2, 5, 1], ['d', 6, 1, 20, 2]]);
    const solo = await A.layoutFor({ seqId: 's1', soloAudio: 1 });
    assert.deepStrictEqual(solo.pieces.map(p => p.name), ['b'], 'the soloed track is heard even when switched off, and only it');
  } finally { env.restore(); }
  for (const bad of [{ name: 'Nest', isSequence: true, path: '', start: 0, end: 1, in: 0, out: 1 }, { name: 'Gen', path: '', start: 0, end: 1, in: 0, out: 1 }, { name: 'Gone', path: '/m/x.mp4', offline: true, start: 0, end: 1, in: 0, out: 1 }]) {
    const e2 = asResolveStub({ sequenceInfo: () => seqInfo([{ muted: false, clips: [bad] }]) });
    try { await assert.rejects(A.layoutFor({ seqId: 's1' }), e => e.code === 'NOT_FROM_FILES' && e.message.includes(bad.name)); } finally { e2.restore(); }
  }
});

test('mix: pieces at their place, from their source In, at their speed, summed; silence elsewhere; exact length', () => {
  const src = new Map([['/a', ramp(SR * 20)], ['/b', flat(SR * 5, 0.5)]]);
  const out = A.mix({ duration: 3, pieces: [{ path: '/a', at: 0.5, len: 1, from: 2, speed: 1 }, { path: '/b', at: 1, len: 1, from: 0, speed: 1 }, { path: '/a', at: 2, len: 0.5, from: 1, speed: 2 }] }, src);
  assert.strictEqual(out.length, 3 * SR);
  assert.strictEqual(out[0], 0); assert.strictEqual(out[SR / 2 - 1], 0, 'silence before the first piece');
  assert.strictEqual(out[SR / 2], 2 * SR, 'the first piece starts at its source In');
  assert.strictEqual(out[SR + 10], 2 * SR + SR / 2 + 10 + 0.5, 'overlapping pieces are summed');
  assert.strictEqual(out[2 * SR + 100], SR + 200, '2× speed reads twice as fast');
  assert.strictEqual(out[2.5 * SR + 1], 0, 'silence after the last piece');
});

test('Resolve: a timeline’s sound comes from the files – no render – and reads back with the length and timing Resolve’s render has', async () => {
  const dir = tmp(), out = path.join(dir, 'seq.wav'), a = path.join(dir, 'a.mp4');
  const env = asResolveStub({ sequenceInfo: () => seqInfo([{ muted: false, clips: [{ name: 'a', path: a, start: 2, end: 4, in: 1, out: 3 }] }], 6) });
  try {
    await withReaders({ [a]: ramp(SR * 10, 1e-6) }, async seen => {
      const job = fakeJob();
      assert.deepStrictEqual(await A.render({ seqId: 's1', out }, { job, name: 'Cut' }), { background: true, fromFiles: true });
      assert.ok(!env.calls.some(c => c[0] === 'renderAudio'), 'Resolve isn’t asked to render');
      assert.strictEqual(job.who, 'computer'); assert.ok(/from its media files/.test(job.msgs[0]));
      assert.deepStrictEqual(seen.map(s => [s[0], s[1]]), [['a.mp4', 3]], 'each file read once, as far as it’s used');
      const r = await A.readWav(out, { targetRate: SR });
      assert.strictEqual(r.sr, SR); assert.strictEqual(r.data.length, 6 * SR); assert.strictEqual(r.duration, 6);
      assert.strictEqual(r.data[2 * SR - 1], 0);
      assert.ok(Math.abs(r.data[2 * SR] - SR * 1e-6) < 1e-9, 'the clip is heard from its source In at its place');
      const s = await A.forSequence('s1', { job: fakeJob() });
      assert.strictEqual(s.data.length, 6 * SR);
    });
  } finally { env.restore(); }
});

test('Resolve: a clip’s In/Out (or subclip) part, with forItem’s offset as with a render; the file read once per range', async () => {
  const dir = tmp(), f = path.join(dir, 'Karen.m4a');
  const env = asResolveStub({
    itemInfo: () => ({ id: 'c1', name: 'Karen.m4a', path: f, hasVideo: false, duration: 30, kind: 'audio' }),
    audioClipRange: () => ({ in: 5, out: 12, duration: 30, subclip: false })
  });
  try {
    await withReaders({ [f]: ramp(SR * 30) }, async seen => {
      const a = await A.forItem({ id: 'c1', name: 'Karen.m4a', path: f, duration: 30 }, { job: fakeJob() });
      assert.strictEqual(a.offset, 5); assert.strictEqual(a.partial, true);
      assert.strictEqual(a.data.length, 7 * SR); assert.strictEqual(a.data[0], 5 * SR);
      assert.deepStrictEqual(seen[0][2] && [seen[0][2].audioOnly, seen[0][2].mediaDuration], [true, 30], 'the reader knows it’s sound only, and Resolve’s length');
      assert.ok(!env.calls.some(c => c[0] === 'renderAudio'));
    });
  } finally { env.restore(); }
});

test('Resolve: rendered instead when it can’t be read (no reader, too short, nested timeline) or it’s switched off; Stop stays Stop; Sound Check’s preset still renders', async () => {
  const dir = tmp(), out = path.join(dir, 'x.wav'), a = path.join(dir, 'a.mp4');
  const tl = [{ muted: false, clips: [{ name: 'a', path: a, start: 0, end: 4, in: 0, out: 4 }] }];
  const stub = { sequenceInfo: () => seqInfo(tl, 4), renderAudio: x => { fs.writeFileSync(x.out, makeWav(48000, 2, 1)); return { path: x.out }; } };
  const cases = [
    ['can’t decode', { [a]: new Error('Unsupported codec') }, {}],
    ['reads only 1 s of 4', { [a]: ramp(SR) }, {}],
    ['nothing reads it', {}, {}],
    ['nested timeline', { [a]: ramp(SR * 5) }, { sequenceInfo: () => seqInfo([{ muted: false, clips: [{ name: 'N', isSequence: true, path: '', start: 0, end: 4, in: 0, out: 4 }] }], 4) }],
    ['switched off', { [a]: ramp(SR * 5) }, {}, () => US.settings.set('audio.fromFiles', false)],
    ['a preset of its own', { [a]: ramp(SR * 5) }, {}, null, { preset: 'resolve:wav48' }]
  ];
  for (const [why, sounds, more, before, extra] of cases) {
    const env = asResolveStub(Object.assign({}, stub, more));
    try {
      before && before();
      await withReaders(sounds, async () => {
        const r = await A.render(Object.assign({ seqId: 's1', out }, extra || {}), { job: fakeJob() });
        assert.strictEqual(r.background, false, why);
        assert.ok(env.calls.some(c => c[0] === 'renderAudio'), why + ': Resolve renders it');
      });
    } finally { env.restore(); }
  }
  const env = asResolveStub(stub);
  try {
    await withReaders({ [a]: ramp(SR * 5) }, async () => {
      const job = fakeJob(); job.cancelled = true;
      await assert.rejects(A.render({ seqId: 's1', out }, { job }), e => e.code === 'CANCELLED');
      assert.ok(!env.calls.some(c => c[0] === 'renderAudio'), 'Stop doesn’t start a render');
    });
  } finally { env.restore(); }
});

test('Premiere is unchanged: Media Encoder / its own render, never the files', async () => {
  const keep = { call: US.host.call, enc: US.encoder }, calls = [];
  US.host.call = async (fn, a) => { calls.push(fn); if (fn === 'renderAudio') fs.writeFileSync(a.out, Buffer.alloc(200)); return {}; };
  US.encoder = null;
  try {
    await A.render({ seqId: 's1', out: path.join(tmp(), 'p.wav') }, { job: fakeJob() });
    assert.deepStrictEqual(calls, ['renderAudio']);
  } finally { US.host.call = keep.call; US.encoder = keep.enc; }
});

test('on the stand-in Resolve: a timeline of a real WAV (clip 2 s in, from 1 s of the file) reads back sample-exact at 16 kHz', async () => {
  const S = setup(), dir = tmp(), file = path.join(dir, 'tone.wav');
  fs.writeFileSync(file, makeWav(16000, 2, 8, { amp: 0.25, freq: 100 }));
  const clip = S.F.addMedia(file, { frames: 200, type: 'Audio' });
  const tl = S.F.addTimeline('Tone', [{ item: clip, in: 25, out: 100, at: 50 }]);   // 1 s–4 s of the file, at 2 s
  const env = asResolve(US, S.host);
  try {
    const a = await A.forSequence(tl.GetUniqueId(), { job: fakeJob() });
    assert.ok(!env.calls.some(c => c[0] === 'renderAudio'), 'no render');
    assert.strictEqual(a.data.length, Math.round((tl.GetEndFrame() - tl.GetStartFrame()) / 25 * SR), 'as long as the timeline');
    const src = await A.readWav(file, { targetRate: SR });
    for (const k of [0, 123, 4000, 47999]) assert.ok(Math.abs(a.data[2 * SR + k] - src.data[SR + k]) < 1e-6, 'sample ' + k);
    assert.strictEqual(a.data[2 * SR - 5], 0, 'silence before the clip');
  } finally { env.restore(); }
});

test('ffmpeg (when installed): the channels’ average at 16 kHz, from the file’s start – the same as reading the WAV', async () => {
  if (!A.ffmpeg()) return;   // not installed here: nothing to compare
  const file = path.join(tmp(), 'st.wav');
  fs.writeFileSync(file, makeWav(48000, 2, 3, { amp: 0.3, freq: 300 }));
  const ff = A.readers.find(r => r.name === 'ffmpeg'), wav = A.readers.find(r => r.name === 'wav');
  const a = await ff.read(file, 3, {}), b = await wav.read(file, 3, {});
  assert.ok(Math.abs(a.length - b.length) <= 2, `${a.length} vs ${b.length}`);
  let num = 0, den = 0; for (let i = 1000; i < b.length - 1000; i++) { num += (a[i] - b[i]) ** 2; den += b[i] ** 2; }
  assert.ok(num / den < 0.01, 'same sound, same level, no shift: ' + (num / den));
  // reading stops once it has what's used
  const part = await ff.read(file, 1, {});
  assert.ok(part.length >= SR && part.length < 3 * SR, 'stopped early: ' + part.length);
});

test('the panel’s decoder: channels averaged; an audio-only AAC file that decodes shorter than Resolve’s clip starts later', async () => {
  const keep = global.OfflineAudioContext, dir = tmp(), m4a = path.join(dir, 'a.m4a'), mp4 = path.join(dir, 'v.mp4');
  fs.writeFileSync(m4a, 'x'); fs.writeFileSync(mp4, 'x');
  global.OfflineAudioContext = class { constructor(c, n, sr) { this.sr = sr; } async decodeAudioData() { const l = flat(SR * 2, 0.2), r = flat(SR * 2, 0.4); return { sampleRate: SR, numberOfChannels: 2, getChannelData: c => (c ? r : l) }; } };
  try {
    const panel = A.readers.find(r => r.name === 'panel');
    assert.ok(panel.ok(m4a));
    const a = await panel.read(m4a, 2, { audioOnly: true, mediaDuration: 2.132 });
    assert.strictEqual(a.length, Math.round(2.132 * SR)); assert.strictEqual(a[0], 0); assert.ok(Math.abs(a[Math.round(0.132 * SR) + 5] - 0.3) < 1e-6);
    const b = await panel.read(mp4, 2, { audioOnly: false, mediaDuration: 2.132 });
    assert.strictEqual(b.length, 2 * SR, 'a video file isn’t moved'); assert.ok(Math.abs(b[0] - 0.3) < 1e-6);
    const c = await panel.read(m4a, 2, { audioOnly: true, mediaDuration: 2.02 });
    assert.strictEqual(c.length, 2 * SR, 'under 1.5 frames short: frame rounding, not moved');
  } finally { if (keep) global.OfflineAudioContext = keep; else delete global.OfflineAudioContext; }
});

test('exportFrame with a clip id (Footage’s fallback): stills from a temporary timeline, which goes again; timeline and page put back', async () => {
  const S = setup();
  const file = path.join(S.dir, 'A001.MOV'); fs.writeFileSync(file, 'x');
  const clip = S.F.addMedia(file, { frames: 500 });
  const mine = S.F.addTimeline('Mine', [{ item: clip, in: 0, out: 100 }]);
  S.F.project.SetCurrentTimeline(mine); S.F.resolve.OpenPage('media');
  const before = S.F.project.GetTimelineCount(), tcs = [];
  const exp = S.F.project.ExportCurrentFrameAsStill;
  S.F.project.ExportCurrentFrameAsStill = f => { const tl = S.F.project.GetCurrentTimeline(); tcs.push([tl.GetName(), tl.GetCurrentTimecode(), tl.GetStartFrame()]); return exp(f); };
  const files = await S.run('exportFrame', { id: clip.GetUniqueId(), times: [2, 12], outBase: path.join(S.dir, 'look') });
  assert.deepStrictEqual(files, [path.join(S.dir, 'look-1.png'), path.join(S.dir, 'look-2.png')]);
  assert.ok(files.every(f => fs.existsSync(f)));
  assert.ok(tcs.every(t => /^Ultra Studio temp/.test(t[0])), 'on a temporary timeline');
  const tc = require('../../resolve/host/base').framesToTC;
  assert.deepStrictEqual(tcs.map(t => t[1]), [tc(tcs[0][2] + 50, 25, false), tc(tcs[1][2] + 300, 25, false)], 'at the clip’s media times');
  assert.strictEqual(S.F.project.GetTimelineCount(), before, 'the temporary timeline is gone');
  assert.strictEqual(S.F.currentTimeline, mine); assert.strictEqual(S.F.resolve.GetCurrentPage(), 'media');
  // a timeline still is as before
  assert.strictEqual(await S.run('exportFrame', { seqId: mine.GetUniqueId(), seconds: 1, outBase: path.join(S.dir, 'thumb') }), path.join(S.dir, 'thumb.png'));
});

test('Footage in Resolve: a clip neither the panel nor ffmpeg can read gets its stills from Resolve, made small; the PNGs deleted', async () => {
  load(['js/tools/14-footage.js']);
  const F = US.footage, keep = { is: US.app.is, call: US.host.call, vision: US.vision, Image: global.Image, ce: document.createElement }, dir = tmp();
  const clip = path.join(dir, 'A001.MOV'); fs.writeFileSync(clip, 'x');
  const pngs = [];
  US.app.is = w => w === 'resolve';
  US.vision = Object.assign({}, keep.vision, { pickSource: async () => ({ ok: false }), fileUrl: f => 'file://' + f });
  US.host.call = async (fn, a) => { assert.strictEqual(fn, 'exportFrame'); assert.strictEqual(a.id, 'c1'); return a.times.map((t, i) => { const p = `${a.outBase}-${i + 1}.png`; fs.writeFileSync(p, 'png'); pngs.push(p); return p; }); };
  global.Image = class { set src(v) { this.naturalWidth = 1920; this.naturalHeight = 1080; setTimeout(() => this.onload(), 0); } };
  document.createElement = t => (t === 'canvas' ? { getContext: () => ({ drawImage() {} }), toDataURL: () => 'data:image/jpeg;base64,QUJD' } : keep.ce(t));
  try {
    const r = await F.grab({ id: 'c1', name: 'A001.MOV', path: clip }, [1, 5], { width: 512 });
    assert.strictEqual(r.how, 'resolve');
    assert.deepStrictEqual(r.stills.map(s => [s.t, s.data, s.w, s.h]), [[1, 'QUJD', 512, 288], [5, 'QUJD', 512, 288]]);
    assert.ok(pngs.length === 2 && pngs.every(p => !fs.existsSync(p)), 'Resolve’s PNGs are deleted');
    US.app.is = w => w === 'premiere';
    assert.deepStrictEqual(await F.grab({ id: 'c1', name: 'A001.MOV', path: clip }, [1], { width: 512 }), { stills: [], why: 'needs a copy' }, 'Premiere: left for Overnight prep, as before');
  } finally { US.app.is = keep.is; US.host.call = keep.call; US.vision = keep.vision; if (keep.Image) global.Image = keep.Image; else delete global.Image; document.createElement = keep.ce; }
});
