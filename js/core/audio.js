/* JMG Ultra Studio – getting sound out of Premiere for analysis.
   WAV files are read straight from disk; anything else (MP4, MOV, MXF, merged clips, sequences…) is rendered to a small
   16 kHz mono WAV, so every format Premiere can play works. In Premiere that render runs in Media Encoder, in the
   background – Premiere stays free to edit in – and only if Media Encoder can't is Premiere asked to render it itself
   (which keeps Premiere busy until it's done). In Resolve the sound is read straight from the media files (below), and
   only what can't be read that way goes through Resolve's Render Queue. */
(function () {
  'use strict';
  const US = window.US;
  const fs = require('fs'), path = require('path');

  /** Parse WAV/RF64 headers. Returns {format, channels, rate, bits, dataStart, dataBytes}. */
  function wavInfo(fd) {
    const head = Buffer.alloc(12);
    fs.readSync(fd, head, 0, 12, 0);
    const riff = head.toString('ascii', 0, 4);
    if ((riff !== 'RIFF' && riff !== 'RF64' && riff !== 'BW64') || head.toString('ascii', 8, 12) !== 'WAVE') return null;
    let pos = 12, fmt = null, ds64Data = null;
    const ch = Buffer.alloc(8);
    for (let guard = 0; guard < 200; guard++) {
      if (fs.readSync(fd, ch, 0, 8, pos) < 8) break;
      const id = ch.toString('ascii', 0, 4); let size = ch.readUInt32LE(4);
      if (id === 'ds64') { const b = Buffer.alloc(Math.min(size, 28)); fs.readSync(fd, b, 0, b.length, pos + 8); ds64Data = Number(b.readBigUInt64LE(8)); }
      if (id === 'fmt ') {
        const b = Buffer.alloc(Math.min(size, 40)); fs.readSync(fd, b, 0, b.length, pos + 8);
        let format = b.readUInt16LE(0);
        if (format === 0xfffe && b.length >= 26) format = b.readUInt16LE(24);
        fmt = { format, channels: b.readUInt16LE(2), rate: b.readUInt32LE(4), bits: b.readUInt16LE(14) };
      }
      if (id === 'data') {
        if (!fmt) return null;
        if (size === 0xffffffff && ds64Data != null) size = ds64Data;
        const st = fs.fstatSync(fd);
        return Object.assign(fmt, { dataStart: pos + 8, dataBytes: Math.min(size, st.size - pos - 8) });
      }
      pos += 8 + size + (size & 1);
    }
    return null;
  }

  /**
   * Read a WAV as mono Float32 at targetRate (simple anti-aliased decimation: block averaging).
   * Yields to the UI every chunk so the panel never freezes. onProgress(0..1).
   */
  async function readWav(file, { targetRate = 16000, onProgress, check } = {}) {
    const fd = fs.openSync(file, 'r');
    try {
      const info = wavInfo(fd);
      if (!info) throw new US.UserError('CANT_DECODE', { title: 'This sound file isn’t a WAV we can read.', action: 'Let Premiere render it instead (pick the clip in the project).', detail: file });
      const { format, channels, rate, bits, dataStart, dataBytes } = info;
      const bps = bits / 8, frameBytes = bps * channels;
      if (!(format === 1 || format === 3) || ![8, 16, 24, 32].includes(bits)) throw new US.UserError('CANT_DECODE', { detail: `WAV format ${format}, ${bits}-bit` });
      const totalFrames = Math.floor(dataBytes / frameBytes);
      const ratio = Math.max(1, rate / targetRate);
      const outRate = rate / ratio;
      const out = new Float32Array(Math.floor(totalFrames / ratio) + 1);
      const CHUNK = Math.floor((4 << 20) / frameBytes) * frameBytes;
      const buf = Buffer.alloc(CHUNK);
      let frameIdx = 0, outIdx = 0, acc = 0, accN = 0, nextEdge = ratio;
      for (let off = 0; off < dataBytes; off += CHUNK) {
        const n = fs.readSync(fd, buf, 0, Math.min(CHUNK, dataBytes - off), dataStart + off);
        const frames = Math.floor(n / frameBytes);
        for (let f = 0; f < frames; f++) {
          let s = 0;
          const base = f * frameBytes;
          for (let c = 0; c < channels; c++) {
            const p = base + c * bps;
            if (format === 3) s += bits === 32 ? buf.readFloatLE(p) : buf.readDoubleLE(p);
            else if (bits === 16) s += buf.readInt16LE(p) / 32768;
            else if (bits === 24) s += buf.readIntLE(p, 3) / 8388608;
            else if (bits === 32) s += buf.readInt32LE(p) / 2147483648;
            else s += (buf[p] - 128) / 128;
          }
          acc += s / channels; accN++; frameIdx++;
          if (frameIdx >= nextEdge) { out[outIdx++] = acc / accN; acc = 0; accN = 0; nextEdge += ratio; }
        }
        if (onProgress) onProgress(Math.min(1, (off + n) / dataBytes));
        if (check) check();
        await US.sleep(0);
      }
      if (accN && outIdx < out.length) out[outIdx++] = acc / accN;
      return { sr: outRate, data: out.subarray(0, outIdx), duration: totalFrames / rate, sourceRate: rate, channels };
    } finally { fs.closeSync(fd); }
  }

  function isPlainWav(file) {
    if (!/\.(wav|bwf)$/i.test(file || '')) return false;
    try { const fd = fs.openSync(file, 'r'); try { const i = wavInfo(fd); return !!i && (i.format === 1 || i.format === 3); } finally { fs.closeSync(fd); } } catch (e) { return false; }
  }

  /** Premiere's exporter is sometimes briefly busy ("Unable to initialize export") – try once more before giving up. */
  async function retry(fn, job) {
    try { return await fn(); }
    catch (e) {
      if (!e || e.code !== 'RENDER_FAILED') throw e;
      US.log('info', 'Premiere’s exporter was busy – trying again', e.detail);
      job && job.set({ msg: 'Premiere was busy – trying again' });
      await US.sleep(2000);
      return fn();
    }
  }

  /* ---------- Resolve: the sound read straight from the media files ----------
     A Resolve render blocks Resolve and switches its timeline and page while it runs, so in Resolve the panel lays the
     sound out itself, as the timeline does: each clip's media from its source In, at its place on the timeline, at its
     speed, on the tracks that are switched on (or the one soloed). The media is read here – a plain WAV directly, else
     with ffmpeg when it's installed, else with the panel's own decoder (Electron's Web Audio, which reads MP4/AAC, M4A,
     MP3, WAV…). Anything it can't do (a nested timeline, a compound or generated clip, a file it can't decode) falls
     back to Resolve's render. Not heard here, as with a render that ignores them: clip volume, fades and track faders
     (Resolve's API can't read them) – the tools look at the shape of the sound, not its loudness. */
  const SR = 16000;
  const WEB_AUDIO_MAX = 512 * 1024 * 1024;   // the panel's decoder reads the whole file into memory: bigger ones aren't tried
  const AAC_LIKE = /\.(m4a|m4b|aac|mp4|mov|3gp)$/i;
  class NotFromFiles extends Error { constructor(why) { super(why); this.code = 'NOT_FROM_FILES'; } }

  let ffmpegPath;
  /** ffmpeg's path, or '' when it isn't installed (looked for once). Also used by Footage for stills. */
  function ffmpeg() {
    if (ffmpegPath !== undefined) return ffmpegPath;
    const cp = require('child_process');
    const tries = process.platform === 'win32' ? ['C:\\ffmpeg\\bin\\ffmpeg.exe', 'C:\\Program Files\\ffmpeg\\bin\\ffmpeg.exe'] : ['/opt/homebrew/bin/ffmpeg', '/usr/local/bin/ffmpeg', '/usr/bin/ffmpeg'];
    ffmpegPath = tries.find(p => { try { return fs.existsSync(p); } catch (e) { return false; } }) || '';
    if (!ffmpegPath) { try { const out = cp.execFileSync(process.platform === 'win32' ? 'where' : 'which', ['ffmpeg'], { encoding: 'utf8', timeout: 4000, windowsHide: true }).split(/\r?\n/)[0].trim(); if (out && fs.existsSync(out)) ffmpegPath = out; } catch (e) { /* not installed */ } }
    return ffmpegPath;
  }

  /** Several channels (interleaved, or one array per channel) → their average, as reading a rendered WAV does. */
  function averageChannels(chans) {
    if (chans.length === 1) return chans[0];
    const n = Math.min(...chans.map(c => c.length)), out = new Float32Array(n), k = 1 / chans.length;
    for (const c of chans) for (let i = 0; i < n; i++) out[i] += c[i] * k;
    return out;
  }
  /** Linear resampling to SR (only for sources the readers return at another rate). */
  function toRate(data, rate) {
    if (!rate || Math.abs(rate - SR) < 0.5) return data;
    const n = Math.floor(data.length * SR / rate), out = new Float32Array(n), step = rate / SR;
    for (let i = 0; i < n; i++) { const p = i * step, j = Math.floor(p), f = p - j; out[i] = (data[j] || 0) * (1 - f) + (data[j + 1] || 0) * f; }
    return out;
  }

  /** A WAV (as ffmpeg streams it: sizes may be unknown) in a Buffer → {channels, rate, bits, format, dataStart} */
  function wavHead(buf) {
    if (buf.length < 12 || buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') return null;
    let pos = 12, fmt = null;
    while (pos + 8 <= buf.length) {
      const id = buf.toString('ascii', pos, pos + 4), size = buf.readUInt32LE(pos + 4);
      if (id === 'fmt ' && pos + 24 <= buf.length) { let format = buf.readUInt16LE(pos + 8); if (format === 0xfffe && pos + 34 <= buf.length) format = buf.readUInt16LE(pos + 32); fmt = { format, channels: buf.readUInt16LE(pos + 10), rate: buf.readUInt32LE(pos + 12), bits: buf.readUInt16LE(pos + 22) }; }
      if (id === 'data') return fmt ? Object.assign(fmt, { dataStart: pos + 8 }) : null;
      pos += 8 + size + (size & 1);
    }
    return null;
  }

  /* Readers: each gives a file's sound as mono at SR from the media's first frame (data[0] = media time 0), at least up
     to `upTo` seconds where the file has sound, or throws. info: {audioOnly, mediaDuration} from Resolve. */
  const readers = [
    {
      name: 'wav', ok: file => isPlainWav(file),
      async read(file, upTo, info, check) { const r = await readWav(file, { targetRate: SR, check }); return toRate(r.data, r.sr); }
    },
    {
      // timestamps kept (-copyts) and gaps filled from 0 (aresample async): the samples land where Resolve plays them –
      // measured: an Apple .m4a whose sound starts 0.132 s in is heard 0.132 s in by Resolve too
      name: 'ffmpeg', ok: () => !!ffmpeg(),
      read(file, upTo, info, check) {
        return new Promise((resolve, reject) => {
          const p = require('child_process').spawn(ffmpeg(), ['-v', 'error', '-nostdin', '-copyts', '-i', file, '-map', '0:a:0', '-af', `aresample=${SR}:async=1:first_pts=0`, '-c:a', 'pcm_f32le', '-f', 'wav', '-'], { windowsHide: true });
          const parts = []; let got = 0, head = null, err = '', done = false, need = Infinity;
          const finish = (e) => {
            if (done) return; done = true;
            try { p.kill(); } catch (x) { /* gone */ }
            if (e) return reject(e);
            const all = Buffer.concat(parts);
            head = head || wavHead(all);
            if (!head || head.format !== 3 || head.bits !== 32) return reject(new Error('ffmpeg gave no sound' + (err ? ': ' + err.trim().slice(0, 300) : '')));
            const frames = Math.floor((all.length - head.dataStart) / (4 * head.channels)), ch = head.channels;
            const raw = new Float32Array(frames * ch);   // a copy, so it's aligned (little-endian, as every Mac and PC is)
            new Uint8Array(raw.buffer).set(all.subarray(head.dataStart, head.dataStart + frames * ch * 4));
            let mono = raw;
            if (ch > 1) { mono = new Float32Array(frames); const k = 1 / ch; for (let i = 0, q = 0; i < frames; i++) { let s = 0; for (let c = 0; c < ch; c++) s += raw[q++]; mono[i] = s * k; } }
            resolve(toRate(mono, head.rate));
          };
          p.stdout.on('data', b => {
            parts.push(b); got += b.length;
            if (!head) { head = wavHead(Buffer.concat(parts)); if (head) need = head.dataStart + Math.ceil((upTo + 0.5) * head.rate) * 4 * head.channels; }
            try { check && check(); } catch (e) { return finish(e); }
            if (got >= need) finish();   // enough: the rest of the file isn't needed
          });
          p.stderr.on('data', b => { if (err.length < 4000) err += b; });
          p.on('error', e => finish(e));
          p.on('close', () => finish());
        });
      }
    },
    {
      // Electron's own decoder (Chromium with its codecs). It skips an AAC file's priming samples where Resolve (and
      // ffmpeg above) start the sound later: an audio-only AAC file that decodes shorter than Resolve says gets the
      // difference back at the start (measured 0.132 s on an Apple .m4a; ignored under 1.5 frames)
      name: 'panel', ok: file => typeof window !== 'undefined' && !!(window.OfflineAudioContext || window.webkitOfflineAudioContext) && US.fsx.size(file) > 0 && US.fsx.size(file) <= WEB_AUDIO_MAX,
      async read(file, upTo, info) {
        const b = fs.readFileSync(file), Ctx = window.OfflineAudioContext || window.webkitOfflineAudioContext;
        const ab = await new Ctx(1, 1, SR).decodeAudioData(b.buffer.slice(b.byteOffset, b.byteOffset + b.length));
        const chans = []; for (let c = 0; c < ab.numberOfChannels; c++) chans.push(ab.getChannelData(c));
        let data = toRate(averageChannels(chans), ab.sampleRate);
        const short = (info.mediaDuration || 0) - data.length / SR;
        if (info.audioOnly && AAC_LIKE.test(file) && short >= 0.06 && short <= 0.5) { const pad = new Float32Array(data.length + Math.round(short * SR)); pad.set(data, Math.round(short * SR)); data = pad; }
        return data;
      }
    }
  ];

  /** One file's sound, trying each reader that can. → {data, how} */
  async function readSource(file, upTo, info, check) {
    const tried = [];
    for (const r of US.audio.readers) {
      let ok = false; try { ok = r.ok(file); } catch (e) { ok = false; }
      if (!ok) continue;
      try {
        const data = await r.read(file, upTo, info, check);
        if (data && data.length) return { data, how: r.name };
        tried.push(r.name + ': nothing');
      } catch (e) { if (e && e.code === 'CANCELLED') throw e; tried.push(r.name + ': ' + String(e && e.message || e).slice(0, 200)); }
    }
    throw new NotFromFiles(`can’t read ${path.basename(file)}` + (tried.length ? ' (' + tried.join('; ') + ')' : ' (no ffmpeg, and the panel can’t decode it)'));
  }

  /**
   * What a render of a: {id | seqId, soloAudio?} would hold, from Resolve's own view of the clip or timeline:
   * {duration, pieces: [{path, at, len, from, speed, name, audioOnly?, mediaDuration?}]} (seconds: at on the timeline,
   * from in the media). Throws NotFromFiles for anything only a render can do.
   */
  async function layoutFor(a) {
    if (a.seqId) {
      const s = await US.host.call('sequenceInfo', { seqId: a.seqId });
      if (!s || !Array.isArray(s.audio) || !(s.duration > 0)) throw new NotFromFiles('no timeline details');
      const tol = 1.5 / (s.fps || 25), pieces = [];
      s.audio.forEach((tr, i) => {
        // soloAudio: that track only (switched on for the render, whatever it was); else the tracks switched on
        if (a.soloAudio != null ? i !== Number(a.soloAudio) : tr.muted) return;
        for (const c of tr.clips || []) {
          const len = c.end - c.start;
          if (c.disabled || !(len > 0)) continue;
          if (c.isSequence || !c.path) throw new NotFromFiles(`“${c.name}” on A${i + 1} isn’t a media file (a nested timeline, compound or generated clip)`);
          if (c.offline) throw new NotFromFiles(`“${c.name}” is offline`);
          // Resolve's source end is sometimes the last frame and sometimes the one after: within 1.5 frames is normal speed
          const span = c.out - c.in, speed = Math.abs(span - len) <= tol ? 1 : span / len;
          if (!(speed > 0) || !isFinite(speed)) throw new NotFromFiles(`“${c.name}” plays backwards`);
          pieces.push({ path: c.path, at: c.start, len, from: c['in'], speed, name: c.name });
        }
      });
      return { duration: s.duration, pieces };
    }
    const info = await US.host.call('itemInfo', { id: a.id });
    if (!info || !info.path || info.isSequence || info.multicam || /^(sequence|synthetic|subtitle)$/.test(info.kind || '')) throw new NotFromFiles(`“${info && info.name}” isn’t a media file`);
    if (info.offline) throw new NotFromFiles(`“${info.name}” is offline`);
    // the same part Resolve's render takes: a subclip's range, else the clip's In/Out, else all of it
    const r = await US.host.call('audioClipRange', { id: a.id });
    const len = r.out - r['in'];
    if (!(len > 0)) throw new NotFromFiles('empty range');
    return { duration: len, pieces: [{ path: info.path, at: 0, len, from: r['in'], speed: 1, name: info.name, audioOnly: !info.hasVideo, mediaDuration: info.duration }] };
  }

  /** Lay the pieces out (summed where they overlap, silence where there's none). sources: path → mono at SR from 0. */
  function mix(layout, sources) {
    const out = new Float32Array(Math.max(0, Math.round(layout.duration * SR)));
    for (const p of layout.pieces) {
      const src = sources.get(p.path); if (!src) continue;
      const a0 = Math.round(p.at * SR), n = Math.min(Math.round(p.len * SR), out.length - a0), s0 = p.from * SR;
      if (p.speed === 1) { const o = Math.round(s0); for (let k = Math.max(0, -a0); k < n; k++) { const v = src[o + k]; if (v) out[a0 + k] += v; } }
      else for (let k = Math.max(0, -a0); k < n; k++) { const q = s0 + k * p.speed, j = Math.floor(q), f = q - j; out[a0 + k] += (src[j] || 0) * (1 - f) + (src[j + 1] || 0) * f; }
    }
    return out;
  }

  /** A mono 32-bit float WAV (what readWav reads back exactly). */
  function writeFloatWav(file, data, rate = SR) {
    const h = Buffer.alloc(44), bytes = data.length * 4;
    h.write('RIFF', 0); h.writeUInt32LE(36 + bytes, 4); h.write('WAVE', 8); h.write('fmt ', 12); h.writeUInt32LE(16, 16);
    h.writeUInt16LE(3, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(rate, 24); h.writeUInt32LE(rate * 4, 28); h.writeUInt16LE(4, 32); h.writeUInt16LE(32, 34);
    h.write('data', 36); h.writeUInt32LE(bytes, 40);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, Buffer.concat([h, Buffer.from(data.buffer, data.byteOffset, bytes)]));
  }

  /**
   * Resolve: write what renderAudio would (a: {id | seqId, out, soloAudio?}) from the media files – same length, same
   * timing, 16 kHz mono. → {pieces, files, how: {path: reader}}. Throws NotFromFiles when only a render can do it.
   */
  async function fromFiles(a, { job, name = '' } = {}) {
    const layout = await layoutFor(a);
    const check = job && (() => job.check());
    job && job.set({ who: 'computer', msg: `Reading the sound${name ? ' of ' + name : ''} from its media files` });
    const byFile = new Map();
    for (const p of layout.pieces) {
      const end = p.from + p.len * p.speed, f = byFile.get(p.path);
      if (f) { f.upTo = Math.max(f.upTo, end); f.from = Math.min(f.from, p.from); } else byFile.set(p.path, { upTo: end, from: p.from, info: p });
    }
    const sources = new Map(), how = {};
    let i = 0;
    for (const [file, f] of byFile) {
      job && byFile.size > 1 && job.progress(i++ / byFile.size, `Reading the sound of ${path.basename(file)} (${i} of ${byFile.size})`);
      const r = await readSource(file, f.upTo, f.info, check);
      // a reader that stops well short of what's used hasn't read it (Resolve would hear more): let Resolve render it
      const have = r.data.length / SR, want = f.upTo - f.from;
      if (have < f.upTo - Math.max(1, want * 0.02)) throw new NotFromFiles(`${path.basename(file)}: ${have.toFixed(2)} s of sound read, ${f.upTo.toFixed(2)} s needed`);
      sources.set(file, r.data); how[file] = r.how;
      check && check();
    }
    writeFloatWav(a.out, mix(layout, sources));
    return { pieces: layout.pieces.length, files: byFile.size, how };
  }

  /**
   * Render sound to a WAV file, in the background where possible. a: {id | seqId, out, soloAudio?}; name: for the status
   * bar. -> {background: true when Media Encoder did it (or, in Resolve, it was read from the media files)}
   */
  async function render(a, { job, name = '' } = {}) {
    // a: {id | seqId, out, soloAudio?, preset?} – preset: a WAV preset of the caller's (e.g. stereo 48 kHz for loudness)
    const premiere = !(US.app && US.app.is && US.app.is('resolve'));
    // Resolve: from the media files, so Resolve isn't blocked by a render (Settings › Listening to sound)
    if (!premiere && !a.preset && US.settings.get('audio.fromFiles', true) !== false) {
      try {
        const r = await fromFiles(a, { job, name });
        US.log('info', `Sound${name ? ' of ' + name : ''} read from the media files`, JSON.stringify(r.how));
        return { background: true, fromFiles: true };
      } catch (e) {
        if (e && e.code === 'CANCELLED') throw e;
        US.log('info', 'Couldn’t read the sound from the media files – Resolve renders it instead', String(e && (e.detail || e.message) || e));
      }
    }
    if (premiere && US.encoder && US.settings.get('audio.background', true) !== false) {
      try {
        let preset = a.preset || '';
        if (!preset) { try { const p = await US.host.call('presets'); preset = (p && p.wav16k) || ''; } catch (e) { /* Media Encoder's own WAV preset below */ } }
        if (!preset) { try { preset = ((await US.host.call('encoderPresets')) || {}).wav || ''; } catch (e) { /* none */ } }
        if (preset) {
          const [t] = await US.encoder.run([{ audio: true, itemId: a.id, seqId: a.seqId, soloAudio: a.soloAudio, out: a.out, preset, overwrite: true, name }], job, { label: `Media Encoder is rendering the sound${name ? ' of ' + name : ''} in the background`, keepProgress: true, quietMinutes: 10 });
          if (t && t.ok && US.fsx.exists(a.out) && US.fsx.size(a.out) > 44) return { background: true };
          US.log('warn', 'Media Encoder didn’t render the sound – Premiere renders it instead', (t && t.error) || 'no file');
        }
      } catch (e) {
        if (e && e.code === 'CANCELLED') throw e;
        US.log('warn', 'Media Encoder couldn’t render the sound – Premiere renders it instead', String(e && (e.detail || e.title || e.message) || e));
      }
    }
    job && job.set({ who: 'premiere', msg: premiere ? `Premiere is rendering the sound${name ? ' of ' + name : ''} (Media Encoder wasn’t available)` : `Resolve is rendering the sound${name ? ' of ' + name : ''}` });
    const b = Object.assign({}, a); delete b.background;
    await retry(() => US.host.call('renderAudio', b), job);
    return { background: false };
  }

  /**
   * Mono audio for a project item ({id, path, name, offline}). Uses the WAV directly when possible,
   * otherwise asks Premiere to render it. Premiere renders a clip between its In and Out points (or a subclip's
   * range), so the result carries `offset`: where in the source file the analysed sound starts.
   */
  async function forItem(item, { job, targetRate = 16000 } = {}) {
    if (item.offline) throw new US.UserError('OFFLINE', { title: `Can’t find ${item.name}.`, detail: item.path });
    let range = { 'in': 0, out: item.duration || 0, duration: item.duration || 0, subclip: false };
    try { range = await US.host.call('audioClipRange', { id: item.id }); } catch (e) { /* older host script: whole clip */ }
    if (!range.subclip && range['in'] < 0.001 && item.path && isPlainWav(item.path)) {
      job && job.set({ who: 'computer', msg: `Reading ${item.name}` });
      return Object.assign(await readWav(item.path, { targetRate, check: job && (() => job.check()) }), { offset: 0 });
    }
    const out = path.join(US.fsx.tempDir(), `aud-${US.fsx.hash((item.path || item.id) + '|' + US.fsx.mediaKey(item.path || '') + '|' + range['in'] + '|' + range.out)}.wav`);
    if (!US.fsx.exists(out) || US.fsx.size(out) < 100) await render({ id: item.id, out }, { job, name: item.name });
    job && job.set({ who: 'computer', msg: `Reading the sound of ${item.name}` });
    const r = await readWav(out, { targetRate, check: job && (() => job.check()) });
    // between In and Out, as asked – unless the whole clip came back (then the sound starts at the clip's start)
    const want = range.out - range['in'], whole = range.duration && Math.abs(r.duration - range.duration) < 0.5 && Math.abs(want - range.duration) > 0.5;
    const offset = !whole && range['in'] > 0.001 ? range['in'] : 0;
    return Object.assign(r, { offset, partial: !whole && (offset > 0 || (range.duration && range.out < range.duration - 0.05)) });
  }

  /** Mono audio for a whole sequence (always re-rendered: sequences change). */
  async function forSequence(seqId, { job, targetRate = 16000, label = 'the sequence' } = {}) {
    const out = path.join(US.fsx.tempDir(), `seq-${US.fsx.hash(seqId)}-${Date.now()}.wav`);
    await render({ seqId, out }, { job, name: label });
    job && job.set({ who: 'computer', msg: `Reading the sound of ${label}` });
    const r = await readWav(out, { targetRate, check: job && (() => job.check()) });
    try { fs.unlinkSync(out); } catch (e) { /* ignore */ }
    return r;
  }

  /** RMS level per hop in dBFS (floor -100). Returns {db: Float32Array, hop: seconds}. */
  function envelope(data, sr, hopSec = 0.02, winSec = hopSec) {
    const hop = Math.max(1, Math.round(sr * hopSec)), win = Math.max(hop, Math.round(sr * winSec));
    const n = Math.max(0, Math.floor((data.length - win) / hop) + 1);
    const db = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      let s = 0; const a = i * hop;
      for (let j = 0; j < win; j++) { const v = data[a + j]; s += v * v; }
      db[i] = Math.max(-100, 10 * Math.log10(s / win + 1e-12));
    }
    return { db, hop: hop / sr };
  }

  /** Peak (absolute) per bucket, for drawing waveforms. */
  function peaks(data, buckets) {
    const out = new Float32Array(buckets), per = data.length / buckets;
    for (let b = 0; b < buckets; b++) { let m = 0; const a = Math.floor(b * per), z = Math.floor((b + 1) * per); for (let i = a; i < z; i++) { const v = Math.abs(data[i]); if (v > m) m = v; } out[b] = m; }
    return out;
  }

  US.audio = { readWav, wavInfo, isPlainWav, forItem, forSequence, render, envelope, peaks, retry, ffmpeg, readers, layoutFor, mix, fromFiles, writeFloatWav, SR };
})();
