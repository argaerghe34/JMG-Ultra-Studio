// Sound for analysis is rendered in the background: Media Encoder first (Premiere stays free), Premiere's own render
// only when Media Encoder can't (or it's switched off); Resolve uses its own render. Stop isn't turned into a fallback.
const assert = require('assert'), fs = require('fs'), path = require('path'), os = require('os');
const { load, test } = require('./harness');
const US = load(['audio']);
const job = { set() { return job; }, progress() {}, check() {}, log() {} };
function setup({ encoder = 'ok', resolve = false } = {}) {
  const calls = [], runs = [], was = { call: US.host.call, enc: US.encoder, app: US.app };
  US.app = Object.assign({}, US.app, { is: w => w === (resolve ? 'resolve' : 'premiere') });
  US.host.call = async (fn, a) => { calls.push([fn, a]); if (fn === 'presets') return { wav16k: '/p/WAV16k.epr' }; if (fn === 'renderAudio') fs.writeFileSync(a.out, Buffer.alloc(200)); return {}; };
  US.encoder = { run: async (tasks, j, opts) => { runs.push({ tasks, opts }); if (encoder === 'throw') throw new US.UserError('RENDER_FAILED', { title: 'no AME' }); if (encoder === 'stop') throw new US.UserError('CANCELLED'); if (encoder === 'ok') fs.writeFileSync(tasks[0].out, Buffer.alloc(200)); return tasks.map(t => Object.assign(t, { ok: encoder === 'ok' })); } };
  const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'us-aud-')), 'x.wav');
  return { calls, runs, out, restore: () => { US.host.call = was.call; US.encoder = was.enc; US.app = was.app; US.settings.set('audio.background', true); } };
}

test('Premiere: Media Encoder renders the sound (the clip, the sequence, one mic alone); Premiere isn’t asked to', async () => {
  const x = setup();
  try {
    assert.deepStrictEqual(await US.audio.render({ id: 'c1', out: x.out }, { job, name: 'Ruth' }), { background: true });
    await US.audio.render({ seqId: 's1', out: x.out, soloAudio: 2 }, { job });
    assert.ok(!x.calls.some(c => c[0] === 'renderAudio'));
    assert.deepStrictEqual(x.runs.map(r => [r.tasks[0].audio, r.tasks[0].itemId, r.tasks[0].seqId, r.tasks[0].soloAudio, r.tasks[0].preset, r.tasks[0].overwrite, r.opts.keepProgress]), [[true, 'c1', undefined, undefined, '/p/WAV16k.epr', true, true], [true, undefined, 's1', 2, '/p/WAV16k.epr', true, true]]);
    assert.ok(/in the background/.test(x.runs[0].opts.label) && /Ruth/.test(x.runs[0].opts.label));
  } finally { x.restore(); }
});

test('Media Encoder can’t: Premiere renders it instead; switched off: straight to Premiere; Stop stays Stop; Resolve: its own render', async () => {
  let x = setup({ encoder: 'throw' });
  try { assert.deepStrictEqual(await US.audio.render({ id: 'c1', out: x.out }, { job }), { background: false }); assert.ok(x.calls.some(c => c[0] === 'renderAudio' && c[1].id === 'c1')); } finally { x.restore(); }
  x = setup({ encoder: 'nofile' });
  try { await US.audio.render({ id: 'c1', out: x.out }, { job }); assert.ok(x.calls.some(c => c[0] === 'renderAudio')); } finally { x.restore(); }
  x = setup();
  try { US.settings.set('audio.background', false); await US.audio.render({ id: 'c1', out: x.out }, { job }); assert.strictEqual(x.runs.length, 0); assert.ok(x.calls.some(c => c[0] === 'renderAudio')); } finally { x.restore(); }
  x = setup({ encoder: 'stop' });
  try { await assert.rejects(US.audio.render({ id: 'c1', out: x.out }, { job }), e => e.code === 'CANCELLED'); assert.ok(!x.calls.some(c => c[0] === 'renderAudio'), 'Stop doesn’t start Premiere’s render'); } finally { x.restore(); }
  x = setup({ resolve: true });
  try { await US.audio.render({ seqId: 's1', out: x.out }, { job }); assert.strictEqual(x.runs.length, 0); assert.ok(x.calls.some(c => c[0] === 'renderAudio')); } finally { x.restore(); }
});

test('the encoder queues a sound job with Premiere’s command for it', async () => {
  load(['encoder']);
  const was = US.host.call, calls = [];
  US.host.call = async (fn, a) => { calls.push([fn, a]); return 'job-7'; };
  try {
    assert.strictEqual(await US.encoder.queue({ audio: true, seqId: 's1', soloAudio: 1, out: path.join(os.tmpdir(), 'q.wav'), preset: '/p.epr', overwrite: true }), 'job-7');
    assert.deepStrictEqual(calls[0], ['queueAudioExport', { id: undefined, seqId: 's1', out: path.join(os.tmpdir(), 'q.wav'), preset: '/p.epr', soloAudio: 1 }]);
  } finally { US.host.call = was; }
});
