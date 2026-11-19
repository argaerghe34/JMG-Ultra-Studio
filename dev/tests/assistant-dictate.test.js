// Ask › dictation: the recording turned into a 16 kHz mono WAV, the level meter, “was anything said”, which engine
// turns speech into words (always one on this computer – or a plain message when there is none), microphone problems
// in plain words, and that the recording is deleted once it has been read.
const assert = require('assert');
const fs = require('fs'), os = require('os');
const { load, test } = require('./harness');
const US = load(['time', 'audio', 'js/tools/40-assistant-dictate.js']);
const D = US.dictation;
const tone = (secs, rate, amp = 0.5, hz = 220) => Float32Array.from({ length: Math.round(secs * rate) }, (_, i) => amp * Math.sin(2 * Math.PI * hz * i / rate));

test('samples: several channels mixed to one, any rate brought to 16 kHz, written as a 16-bit mono WAV', () => {
  assert.deepStrictEqual(Array.from(D.mixDown([Float32Array.from([1, 0, -1]), Float32Array.from([0, 0, 1])])), [0.5, 0, 0]);
  const a = D.to16k(tone(1, 48000), 48000);
  assert.strictEqual(a.length, 16000);
  assert.ok(Math.max(...a) > 0.45 && Math.max(...a) <= 0.5, 'the tone survives');
  assert.strictEqual(D.to16k(tone(1, 44100), 44100).length, 16000);
  assert.strictEqual(D.to16k(a, 16000), a, 'already 16 kHz: left alone');
  assert.strictEqual(D.to16k(new Float32Array(0), 48000).length, 0);
  const w = D.wavBytes(Float32Array.from([0, 1, -1, 2]), 16000);
  assert.deepStrictEqual([w.toString('ascii', 0, 4), w.toString('ascii', 8, 12), w.readUInt16LE(22), w.readUInt32LE(24), w.readUInt16LE(34), w.readUInt32LE(40), w.length], ['RIFF', 'WAVE', 1, 16000, 16, 8, 52]);
  assert.deepStrictEqual([w.readInt16LE(44), w.readInt16LE(46), w.readInt16LE(48), w.readInt16LE(50)], [0, 32767, -32767, 32767], 'too-loud samples are held at full scale');
});

test('the level meter and “was anything said”; dictated words join what is already typed', () => {
  assert.strictEqual(D.levelOf(new Float32Array(1024)), 0);
  const quiet = D.levelOf(tone(0.1, 16000, 0.01)), loud = D.levelOf(tone(0.1, 16000, 0.5));
  assert.ok(quiet > 0.1 && quiet < loud && loud <= 1, `${quiet} ${loud}`);
  assert.strictEqual(D.hasSpeech(tone(1, 16000, 0.2)), true);
  assert.strictEqual(D.hasSpeech(tone(1, 16000, 0.001)), false, 'a silent room');
  assert.strictEqual(D.hasSpeech(tone(0.1, 16000, 0.5)), false, 'too short to be a request');
  assert.strictEqual(D.joinText('', '  cut the   silences '), 'cut the silences');
  assert.strictEqual(D.joinText('Tighten this. ', 'then check it'), 'Tighten this. then check it');
  assert.strictEqual(D.joinText('as typed', ''), 'as typed');
});

test('the engine is always on this computer: the app’s listening model when there is one, Resolve’s own transcription in Resolve, else a plain message – never a web service', async () => {
  const was = { listen: US.listen, is: US.app.is, call: US.host.call };
  try {
    delete US.listen; US.app.is = () => false;
    const none = D.engine();
    assert.ok(none.id === '' && /needs a listening model on this computer/.test(none.why) && /never sent anywhere/.test(none.action));
    await assert.rejects(D.transcribe({ samples: tone(1, 16000), seconds: 1 }), e => e instanceof US.UserError && /listening model on this computer/.test(e.title));
    // Resolve: its own transcription, through the host command; the recording is deleted afterwards
    US.app.is = x => x === 'resolve';
    assert.strictEqual(D.engine().id, 'resolve');
    let seen = null;
    US.host.call = async (fn, a) => { seen = { fn, exists: fs.existsSync(a.path), bytes: fs.statSync(a.path).size, path: a.path }; return { text: '  cut the silences  ' }; };
    assert.strictEqual(await D.transcribe({ samples: tone(1, 16000), seconds: 1 }), 'cut the silences');
    assert.deepStrictEqual([seen.fn, seen.exists, seen.bytes], ['dictateTranscribe', true, 44 + 32000]);
    assert.ok(seen.path.startsWith(os.tmpdir()) && !fs.existsSync(seen.path), 'in the temp folder, and gone once read');
    US.host.call = async () => ({ unsupported: true, why: 'needs Resolve 21.1' });
    await assert.rejects(D.transcribe({ samples: tone(1, 16000), seconds: 1 }), e => /Resolve couldn’t turn the recording into words/.test(e.title) && /21\.1/.test(e.detail));
    // the app's listening model, when that part is there, comes first – in either editor
    let got = null;
    US.listen = { transcribe: async o => { got = { rate: o.sampleRate, n: o.samples.length, file: fs.existsSync(o.path) }; return { text: 'put the drone clips in a bin' }; }, label: () => 'Whisper small' };
    assert.deepStrictEqual(D.engine(), { id: 'listen', label: 'Whisper small' });
    assert.strictEqual(await D.transcribe({ samples: tone(1, 16000), seconds: 1 }), 'put the drone clips in a bin');
    assert.deepStrictEqual(got, { rate: 16000, n: 16000, file: true });
    await assert.rejects(D.transcribe({ samples: tone(1, 16000, 0.0005), seconds: 1 }), e => /Nothing was heard/.test(e.title), 'silence isn’t sent to the model');
    US.listen.transcribe = async () => '';
    await assert.rejects(D.transcribe({ samples: tone(1, 16000), seconds: 1 }), e => /No words were made out/.test(e.title));
  } finally { if (was.listen) US.listen = was.listen; else delete US.listen; US.app.is = was.is; US.host.call = was.call; }
});

test('microphone problems in plain words; no microphone support says so instead of failing', async () => {
  assert.ok(/No microphone was found/.test(D.micError({ name: 'NotFoundError' }).title));
  assert.ok(/isn’t allowed here/.test(D.micError({ name: 'NotAllowedError' }).title) && /Microphone/.test(D.micError({ name: 'NotAllowedError' }).action));
  assert.ok(/in use by something else/.test(D.micError({ name: 'NotReadableError' }).title));
  assert.ok(/couldn’t be started/.test(D.micError(new Error('odd')).title));
  assert.strictEqual(D.supported(), false, 'no microphone API in this test');
  await assert.rejects(D.start(), e => e instanceof US.UserError && /can’t reach a microphone/.test(e.title));
  const src = fs.readFileSync(require('path').join(__dirname, '..', '..', 'js', 'tools', '40-assistant-dictate.js'), 'utf8');
  assert.ok(!/new\s+(webkit)?SpeechRecognition|fetch\(|https?:\/\//.test(src), 'no online speech service, no network');
});
