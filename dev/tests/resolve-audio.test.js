// Resolve: the sound tools' commands (resolve/host/audio.js) and Sound Check in Resolve (no clip volume by script).
const assert = require('assert'), fs = require('fs'), path = require('path');
const { load, test } = require('./harness');
const { setup, asResolve, fakeJob } = require('./resolve-render-kit');
const US = load(['audio', 'dsp', 'js/tools/11-audio-kit.js', 'js/tools/31-sound.js']);

function withTimeline() {
  const S = setup();
  const file = path.join(S.dir, 'I001.mp4'); fs.writeFileSync(file, 'x');
  const clip = S.F.addMedia(file, { frames: 500 });
  const tl = S.F.addTimeline('Cut', [{ item: clip, in: 0, out: 250 }]);
  return Object.assign(S, { clip, tl, seqId: tl.GetUniqueId() });
}

test('lockedTracksWithClips: locked tracks that hold clips, as V1 / A1', async () => {
  const S = withTimeline();
  assert.deepStrictEqual(await S.run('lockedTracksWithClips', { seqId: S.seqId }), []);
  S.tl.AddTrack('audio'); S.tl.SetTrackLock('audio', 2, true);   // locked but empty
  S.tl.SetTrackLock('video', 1, true); S.tl.SetTrackLock('audio', 1, true);
  assert.deepStrictEqual(await S.run('lockedTracksWithClips', { seqId: S.seqId }), ['V1', 'A1']);
  await assert.rejects(S.run('lockedTracksWithClips', { seqId: 'nope' }), e => e.code === 'NOT_FOUND');
});

test('soundGain / soundDuck: a plain “can’t” with the step to take in Resolve, and nothing changed', async () => {
  const S = withTimeline();
  const before = JSON.stringify(S.tl._a.flat().map(i => i._props));
  await assert.rejects(S.run('soundGain', { seqId: S.seqId, db: 3.5 }), e => e.code === 'HOST_SCRIPT' && /clip volume/.test(e.title) && /Normalize Audio Levels/.test(e.action) && /3\.5 dB/.test(e.action));
  await assert.rejects(S.run('soundDuck', { seqId: S.seqId, clips: [], db: 12 }), e => e.code === 'HOST_SCRIPT' && /clip volume/.test(e.title) && /Fairlight/.test(e.action));
  assert.strictEqual(JSON.stringify(S.tl._a.flat().map(i => i._props)), before);
});

test('Sound Check in Resolve: measured from Resolve’s 48 kHz stereo render, with Resolve’s own steps to fix it', async () => {
  const S = withTimeline();
  S.F.wavSeconds = 6; S.F.wavTone = { amp: 0.02, freq: 1000 };   // quiet: about −37 LUFS
  const env = asResolve(US, S.host);
  try {
    assert.deepStrictEqual(await US.audioKit.stereoPreset(), { path: 'resolve:wav48', stereo: true });
    const job = fakeJob();
    const r = await US.soundCheck.check({ kind: 'sequence', id: S.seqId, name: 'Cut', duration: 6, fps: 25 }, 'social', job);
    assert.ok(r.meter.integrated < -30, String(r.meter.integrated));
    assert.strictEqual(S.F.jobLog[0].settings.AudioSampleRate, 48000);
    const quiet = r.issues.find(i => /Too quiet/.test(i.title));
    assert.ok(quiet && /Normalize Audio Levels/.test(quiet.action), JSON.stringify(r.issues));
    assert.ok(!r.issues.some(i => /Essential Sound|Mix track|Loudness Normalisation|Measured in mono/.test(i.title + i.action)), 'no Premiere-only advice');
    // the louder copy: said plainly before any copy is made
    await assert.rejects(US.soundCheck.fixLoudness(r, job), e => e.code === 'HOST_SCRIPT' && /clip volume/.test(e.title) && /Normalize Audio Levels/.test(e.action) && /-14 LUFS/.test(e.action));
    assert.ok(!env.calls.some(c => c[0] === 'cloneSequence' || c[0] === 'soundGain'));
    // the Assistant's “fix the loudness” measures and says what to do instead of failing
    const keepCtx = { project: US.ctx.project, sequence: US.ctx.sequence };
    US.ctx.project = { name: 'Test' }; US.ctx.sequence = { id: S.seqId, name: 'Cut', duration: 6, fps: 25 };
    try {
      const x = await US.actions.get('sound.fix').run({ target: 'social' }, fakeJob());
      assert.ok(/LUFS \(target -14\) – Resolve doesn’t let add-ons change clip volume yet\. Select all the clips/.test(x.summary), x.summary);
    } finally { Object.assign(US.ctx, keepCtx); }
  } finally { env.restore(); }
});

test('Sound Check in Resolve: a 24-bit render (Resolve ignoring the bit depth asked for) measures the same', async () => {
  const S = withTimeline();
  S.F.wavSeconds = 4; S.F.wavTone = { amp: 0.1, freq: 1000 };
  const env = asResolve(US, S.host);
  try {
    const t = { kind: 'sequence', id: S.seqId, name: 'Cut', duration: 4, fps: 25 };
    const a = await US.audioKit.measure(t, fakeJob());
    S.F.wavTone = { amp: 0.1, freq: 1000, bits: 24 };
    const b = await US.audioKit.measure(t, fakeJob());
    assert.ok(Math.abs(a.meter.integrated - b.meter.integrated) < 0.05, `${a.meter.integrated} vs ${b.meter.integrated}`);
    assert.strictEqual(b.sr, 16000);
  } finally { env.restore(); }
});

test('Duck the music in Resolve: a copy with the speech marked (no volume change), music tracks named in the summary', async () => {
  const S = withTimeline();
  const info = { name: 'Cut', duration: 30, fps: 25, audio: [{ index: 0, name: 'Dialogue', clips: [{ name: 'I001.mp4', start: 0, end: 30 }] }, { index: 1, name: 'Music', clips: [{ name: 'Theme.wav', path: '/m/Theme.wav', start: 0, end: 30 }] }] };
  const marks = [];
  const env = asResolve(US, S.host, {
    sequenceInfo: () => info,
    cloneSequence: a => ({ id: 'copy-1', name: a.name }),
    addSequenceMarkers: a => { marks.push(a); return a.markers.map((m, i) => 'g' + i); },
    openSequence: () => true
  });
  const keepStory = US.story;
  US.story = { timelineTranscript: async () => ({ result: { entries: [{ start: 2, end: 6 }, { start: 6.5, end: 9 }, { start: 15, end: 20 }] }, collected: { audioTracks: [] } }) };
  try {
    const r = await US.soundCheck.duckMusic(fakeJob(), { seqId: S.seqId, tracks: [1], db: 12 });
    assert.strictEqual(r.marked, true);
    assert.strictEqual(r.copy.name, 'Cut – speech marked');
    assert.ok(/clip volume/.test(r.summary) && /A2/.test(r.summary) && /12 dB/.test(r.summary), r.summary);
    assert.strictEqual(marks.length, 1);
    assert.strictEqual(marks[0].seqId, 'copy-1'); assert.strictEqual(marks[0].where, 'sequence');
    assert.deepStrictEqual(marks[0].markers.map(m => [m.start, m.end, m.color]), [[2, 9, 6], [15, 20, 6]]);
    assert.ok(!env.calls.some(c => c[0] === 'soundDuck'));
  } finally { env.restore(); US.story = keepStory; }
});
