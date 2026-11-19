/* JMG Ultra Studio – Ask: dictation. Speak a request instead of typing it. The microphone is recorded in the panel
   (getUserMedia → plain samples, so there is a live level and nothing to decode), turned into a small 16 kHz mono WAV in
   the computer's temp folder, and put into words ON THIS COMPUTER – by the listening model the app has (US.listen, when
   that part of the app is there) or, in Resolve, by Resolve's own transcription. The speech never leaves the computer,
   and the file is deleted as soon as it has been read. The words go into the chat box to check and edit before sending.

   Not used, on purpose: the browser's own speech recognition (webkitSpeechRecognition). In CEP's Chromium and in
   Electron it has no engine behind it – it is Google's online service, needs Google's keys, and would send the speech
   away. Pure logic first (unit-tested), then the recorder. */
(function () {
  'use strict';
  const US = window.US;
  US.addIcon('mic', 'M10 2.5a2.5 2.5 0 0 0-2.5 2.5v5a2.5 2.5 0 0 0 5 0V5A2.5 2.5 0 0 0 10 2.5zM5 9.5a5 5 0 0 0 10 0M10 14.5v3M7 17.5h6');
  const RATE = 16000, MAX_SECONDS = 120;

  /* ---------- pure ---------- */
  /** Several channels of samples -> one. */
  function mixDown(channels) {
    if (!channels || !channels.length) return new Float32Array(0);
    if (channels.length === 1) return channels[0];
    const n = channels[0].length, out = new Float32Array(n);
    for (const ch of channels) for (let i = 0; i < n; i++) out[i] += ch[i] / channels.length;
    return out;
  }
  /** Mono samples at any rate -> 16 kHz (each output sample is the average of the input it covers, so nothing aliases badly). */
  function to16k(samples, rate) {
    if (!samples || !samples.length || !(rate > 0)) return new Float32Array(0);
    if (rate === RATE) return samples;
    const step = rate / RATE, n = Math.floor(samples.length / step), out = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const a = Math.floor(i * step), b = Math.max(a + 1, Math.min(samples.length, Math.floor((i + 1) * step)));
      let sum = 0; for (let k = a; k < b; k++) sum += samples[k];
      out[i] = sum / (b - a);
    }
    return out;
  }
  /** How loud a block is, 0–1, for the level meter (speech sits around 0.2–0.7). */
  function levelOf(block) {
    if (!block || !block.length) return 0;
    let sum = 0; for (let i = 0; i < block.length; i++) sum += block[i] * block[i];
    const db = 20 * Math.log10(Math.sqrt(sum / block.length) + 1e-9);
    return Math.max(0, Math.min(1, (db + 60) / 54));
  }
  /** Mono float samples -> the bytes of a 16-bit WAV file. */
  function wavBytes(samples, rate = RATE) {
    const n = samples.length, buf = Buffer.alloc(44 + n * 2);
    buf.write('RIFF', 0, 'ascii'); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVE', 8, 'ascii'); buf.write('fmt ', 12, 'ascii');
    buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22); buf.writeUInt32LE(rate, 24); buf.writeUInt32LE(rate * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
    buf.write('data', 36, 'ascii'); buf.writeUInt32LE(n * 2, 40);
    for (let i = 0; i < n; i++) buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, samples[i])) * 32767), 44 + i * 2);
    return buf;
  }
  /** Was anything said? (a recording of silence isn't worth transcribing) */
  function hasSpeech(samples) { if (!samples || samples.length < RATE * 0.3) return false; let peak = 0; for (let i = 0; i < samples.length; i += 4) { const v = Math.abs(samples[i]); if (v > peak) peak = v; } return peak > 0.01; }
  /** Dictated words joined onto what is already in the box. */
  function joinText(have, said) {
    const a = String(have || '').replace(/\s+$/, ''), b = String(said || '').replace(/\s+/g, ' ').trim();
    if (!b) return a;
    return a ? `${a} ${b}` : b;
  }
  /**
   * Which engine will turn speech into words here – always one on this computer.
   * -> {id: 'listen' | 'resolve', label} or {id: '', why, action}
   */
  function engine() {
    if (US.listen && typeof US.listen.transcribe === 'function') { let label = 'the listening model on this computer'; try { if (typeof US.listen.label === 'function') label = US.listen.label() || label; } catch (e) { /* its usual name */ } return { id: 'listen', label }; }
    if (US.app && US.app.is && US.app.is('resolve')) return { id: 'resolve', label: 'Resolve’s own transcription' };
    return { id: '', why: 'Dictation needs a listening model on this computer, and there isn’t one yet.', action: `Choose and download one in Settings › AI (listening) – your speech is never sent anywhere.${process.platform === 'darwin' ? ' Until then, click in the box and use the Mac’s own dictation (press the microphone key, or Fn twice).' : process.platform === 'win32' ? ' Until then, click in the box and press Windows + H for Windows’ own dictation.' : ''}` };
  }
  /** A microphone problem in plain words. */
  function micError(e) {
    const name = String((e && e.name) || ''), msg = String((e && e.message) || e || '');
    if (e instanceof US.UserError) return e;
    if (/NotFound|DevicesNotFound|OverconstrainedError/i.test(name)) return new US.UserError('NOTHING_FOUND', { title: 'No microphone was found.', action: 'Plug one in (or switch it on in your computer’s sound settings) and try again.', detail: msg });
    if (/NotAllowed|PermissionDenied|Security/i.test(name)) return new US.UserError('BAD_INPUT', { title: 'The microphone isn’t allowed here.', action: process.platform === 'darwin' ? `Allow ${US.app && US.app.is && US.app.is('resolve') ? 'DaVinci Resolve' : 'Premiere Pro'} in System Settings › Privacy & Security › Microphone, then restart it.` : 'Allow apps to use the microphone in Windows Settings › Privacy & security › Microphone, then try again.', detail: msg });
    if (/NotReadable|TrackStart|Abort/i.test(name)) return new US.UserError('BUSY', { title: 'The microphone is in use by something else.', action: 'Close the other app that is recording, then try again.', detail: msg });
    return new US.UserError('UNKNOWN', { title: 'The microphone couldn’t be started.', action: 'Check that a microphone is plugged in and allowed, then try again.', detail: `${name} ${msg}`.trim() });
  }

  /* ---------- the recorder ---------- */
  const supported = () => typeof navigator !== 'undefined' && !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia) && !!(window.AudioContext || window.webkitAudioContext);
  /** In Resolve the window's shell is asked first (macOS wants a say before the microphone opens). */
  async function allowed() {
    if (!(US.app && US.app.is && US.app.is('resolve'))) return 'granted';
    try { return (await require('electron').ipcRenderer.invoke('ultra-studio:mic')) || 'granted'; } catch (e) { return 'granted'; }
  }
  /**
   * Start recording. onLevel(0–1, seconds) is called as it goes; it stops itself after two minutes.
   * -> {stop() -> Promise<{samples (16 kHz mono), seconds}>, cancel()}
   */
  async function start({ onLevel = () => {}, onLimit = () => {} } = {}) {
    if (!supported()) throw new US.UserError('BAD_INPUT', { title: 'This panel can’t reach a microphone here.', action: 'Restart the editor after updating Ultra Studio (the microphone is switched on when the panel loads). If it still can’t, type your request instead.' });
    const ok = await allowed();
    if (ok === 'denied') throw micError({ name: 'NotAllowedError', message: 'the system said no' });
    if (ok === 'unavailable') throw new US.UserError('BAD_INPUT', { title: 'This Resolve’s panel window can’t ask for the microphone.', action: 'Type your request instead – or use your computer’s own dictation in the box.' });
    let stream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: false, noiseSuppression: true, autoGainControl: true }, video: false }); }
    catch (e) { throw micError(e); }
    const AC = window.AudioContext || window.webkitAudioContext, ctx = new AC();
    const src = ctx.createMediaStreamSource(stream), node = ctx.createScriptProcessor(4096, 1, 1), mute = ctx.createGain();
    const chunks = []; let n = 0, live = true;
    mute.gain.value = 0;   // the node has to be connected to run; nothing is played back
    node.onaudioprocess = ev => {
      if (!live) return;
      const b = new Float32Array(ev.inputBuffer.getChannelData(0));
      chunks.push(b); n += b.length;
      const secs = n / ctx.sampleRate;
      try { onLevel(levelOf(b), secs); } catch (e) { /* the screen's own business */ }
      if (secs >= MAX_SECONDS) { live = false; try { onLimit(); } catch (e) { /* as above */ } }
    };
    src.connect(node); node.connect(mute); mute.connect(ctx.destination);
    const end = () => {
      live = false;
      try { node.disconnect(); src.disconnect(); mute.disconnect(); } catch (e) { /* already apart */ }
      try { stream.getTracks().forEach(t => t.stop()); } catch (e) { /* already stopped */ }
      const rate = ctx.sampleRate;
      try { ctx.close(); } catch (e) { /* closed */ }
      return rate;
    };
    return {
      stop: async () => { const rate = end(), all = new Float32Array(n); let o = 0; for (const c of chunks) { all.set(c, o); o += c.length; } const samples = to16k(all, rate); return { samples, seconds: samples.length / RATE }; },
      cancel: () => { end(); }
    };
  }
  /** The words in a recording, by the engine on this computer. rec: {samples (16 kHz mono)}. -> text */
  async function transcribe(rec, job) {
    const eng = engine();
    if (!eng.id) throw new US.UserError('NOTHING_FOUND', { title: eng.why, action: eng.action });
    if (!hasSpeech(rec.samples)) throw new US.UserError('NOTHING_FOUND', { title: 'Nothing was heard.', action: 'Check the right microphone is chosen in your computer’s sound settings, speak a little closer, and try again.' });
    const fs = require('fs'), path = require('path'), os = require('os');
    const file = path.join(os.tmpdir(), `jmg-ultra-studio-dictation-${Date.now()}.wav`);
    try { fs.writeFileSync(file, wavBytes(rec.samples, RATE)); } catch (e) { throw new US.UserError('DISK', { detail: String(e && e.message || e) }); }
    try {
      if (job) job.set({ who: 'computer', msg: `Turning your speech into words with ${eng.label}` });
      let r;
      if (eng.id === 'listen') r = await US.listen.transcribe({ path: file, samples: rec.samples, sampleRate: RATE, job });
      else {
        r = await US.host.call('dictateTranscribe', { path: file, maxMs: 90000 + Math.round(rec.seconds * 3000) });
        if (r && r.unsupported) throw new US.UserError('NOTHING_FOUND', { title: 'Resolve couldn’t turn the recording into words.', action: 'Type your request instead.', detail: r.why || '' });
      }
      const text = String(typeof r === 'string' ? r : (r && (r.text || (Array.isArray(r.words) ? r.words.map(w => w.w || w.text || '').join(' ') : ''))) || '').replace(/\s+/g, ' ').trim();
      if (!text) throw new US.UserError('NOTHING_FOUND', { title: 'No words were made out.', action: 'Try again a little closer to the microphone, or type your request.' });
      return text;
    } finally { try { fs.unlinkSync(file); } catch (e) { /* gone already */ } }
  }

  US.dictation = { RATE, MAX_SECONDS, mixDown, to16k, levelOf, wavBytes, hasSpeech, joinText, engine, micError, supported, start, transcribe };
})();
