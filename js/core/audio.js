/* JMG Ultra Studio – getting sound out of Premiere for analysis.
   WAV files are read straight from disk; anything else (MP4, MOV, MXF, merged clips, sequences…) is rendered by
   Premiere itself to a small 16 kHz mono WAV, so every format Premiere can play works. */
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
    if (!US.fsx.exists(out) || US.fsx.size(out) < 100) {
      job && job.set({ who: 'premiere', msg: `Premiere is rendering the sound of ${item.name}` });
      await retry(() => US.host.call('renderAudio', { id: item.id, out }), job);
    }
    job && job.set({ who: 'computer', msg: `Reading the sound of ${item.name}` });
    const offset = range['in'] > 0.001 ? range['in'] : 0;
    return Object.assign(await readWav(out, { targetRate, check: job && (() => job.check()) }), { offset, partial: offset > 0 || (range.duration && range.out < range.duration - 0.05) });
  }

  /** Mono audio for a whole sequence (always re-rendered: sequences change). */
  async function forSequence(seqId, { job, targetRate = 16000, label = 'the sequence' } = {}) {
    const out = path.join(US.fsx.tempDir(), `seq-${US.fsx.hash(seqId)}-${Date.now()}.wav`);
    job && job.set({ who: 'premiere', msg: `Premiere is rendering the sound of ${label}` });
    await retry(() => US.host.call('renderAudio', { seqId, out }), job);
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

  US.audio = { readWav, wavInfo, isPlainWav, forItem, forSequence, envelope, peaks, retry };
})();
