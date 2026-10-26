/* JMG Ultra Studio – shared helpers for the sound tools (Silence Cut, Beat Cut, Song Splitter, Sound Check).
   Registers no tool of its own. */
(function () {
  'use strict';
  const US = window.US;
  const fs = require('fs'), path = require('path'), cp = require('child_process');
  const kit = (US.audioKit = {});

  /* ---------- what are we working on? ---------- */
  /**
   * Turn a source picker into one target: {kind:'sequence'|'item', id, name, duration, fps, item?, extra}
   * (with several clips selected, the first is used and `extra` says how many were left out).
   */
  kit.resolveTarget = async function (picker, job) {
    const r = await picker.resolve(job);
    if (r.sequence) return { kind: 'sequence', id: r.sequence.id, name: r.sequence.name, duration: r.sequence.duration, fps: r.sequence.fps, sequence: r.sequence, extra: 0 };
    if (r.items && r.items.length) { const it = r.items[0]; return { kind: 'item', id: it.id, name: it.name, duration: it.duration, fps: it.fps || 25, item: it, extra: r.items.length - 1, items: r.items }; }
    throw new US.UserError('NO_SELECTION');
  };
  kit.activeSequenceTarget = async function () {
    await US.refreshContext();
    if (!US.ctx.project) throw new US.UserError('NO_PROJECT');
    if (!US.ctx.sequence) throw new US.UserError('NO_SEQUENCE');
    const s = US.ctx.sequence;
    return { kind: 'sequence', id: s.id, name: s.name, duration: s.duration, fps: s.fps, extra: 0 };
  };
  kit.selectedClipTarget = async function () {
    const items = await US.host.call('selectedItems', { kinds: ['audio'] });
    if (!items.length) return null;
    const it = items[0];
    return { kind: 'item', id: it.id, name: it.name, duration: it.duration, fps: it.fps || 25, item: it, extra: items.length - 1, items };
  };

  /** Premiere's exporter is sometimes briefly busy ("Unable to initialize export") – try once more before giving up. */
  kit.retry = async function (fn, job) {
    try { return await fn(); }
    catch (e) {
      if (!e || e.code !== 'RENDER_FAILED') throw e;
      US.log('info', 'Premiere’s exporter was busy – trying again', e.detail);
      job && job.set({ msg: 'Premiere was busy – trying again' });
      await US.sleep(2000);
      return fn();
    }
  };

  /**
   * Mono sound for a target at 16 kHz. For clips, the result has `offset`: where in the source file
   * the analysed sound starts (Premiere renders a clip between its In and Out points).
   */
  kit.loadAudio = async function (target, job) {
    if (target.kind === 'sequence') {
      const a = await kit.retry(() => US.audio.forSequence(target.id, { job, label: `“${target.name}”` }), job);
      return Object.assign(a, { offset: 0 });
    }
    const it = target.item;
    if (it.offline) throw new US.UserError('OFFLINE', { title: `Can’t find ${it.name}.`, detail: it.path });
    const range = await US.host.call('audioClipRange', { id: it.id });
    if (!range.subclip && it.path && US.audio.isPlainWav(it.path)) {
      job && job.set({ who: 'computer', msg: `Reading ${it.name}` });
      const a = await US.audio.readWav(it.path, { targetRate: 16000, onProgress: f => job && job.progress(f * 0.3), check: job && (() => job.check()) });
      return Object.assign(a, { offset: 0 });
    }
    const offset = range['in'] > 0.001 ? range['in'] : 0;
    const out = path.join(US.fsx.tempDir(), `snd-${US.fsx.hash(it.path + '|' + US.fsx.mediaKey(it.path || '') + '|' + range['in'] + '|' + range.out)}.wav`);
    if (!US.fsx.exists(out) || US.fsx.size(out) < 100) {
      job && job.set({ who: 'premiere', msg: `Premiere is rendering the sound of ${it.name}` });
      await kit.retry(() => US.host.call('renderAudio', { id: it.id, out }), job);
    }
    job && job.set({ who: 'computer', msg: `Reading the sound of ${it.name}` });
    const a = await US.audio.readWav(out, { targetRate: 16000, check: job && (() => job.check()) });
    return Object.assign(a, { offset, partial: offset > 0 || range.out < range.duration - 0.05 });
  };

  /** Jump Premiere to a time: the playhead for sequences, the Source Monitor for clips. */
  kit.goTo = function (target, seconds, offset = 0) {
    const p = target.kind === 'sequence' ? US.host.call('setPlayhead', { seqId: target.id, seconds }) : US.host.cue(target.id, seconds + offset);
    return p.catch(e => US.ui.showError(e));
  };

  kit.tc = (t, fps) => US.time.toTC(t, fps || 25);

  /* ---------- markers we added (so they can be removed again) ---------- */
  const store = () => US.projectStore(US.ctx.project ? US.ctx.project.path : 'none');
  kit.rememberMarkers = function (key, target, guids) {
    const s = store(), all = s.get('soundMarkers', {});
    const prev = all[key] && all[key].guids ? all[key].guids : [];
    all[key] = { kind: target.kind, id: target.id, guids: prev.concat(guids), when: Date.now() };
    s.set('soundMarkers', all); s.flush();
  };
  kit.recallMarkers = key => (store().get('soundMarkers', {})[key]) || null;
  kit.removeMarkers = async function (key) {
    const m = kit.recallMarkers(key);
    if (!m || !m.guids.length) return 0;
    let n = 0;
    for (const part of kit.chunk(m.guids, 200)) n += await US.host.call(m.kind === 'sequence' ? 'removeSequenceMarkers' : 'removeClipMarkers', m.kind === 'sequence' ? { seqId: m.id, guids: part } : { id: m.id, guids: part });
    const s = store(), all = s.get('soundMarkers', {}); delete all[key]; s.set('soundMarkers', all); s.flush();
    return n;
  };
  /** Add markers in chunks with progress. markers: [{start,end?,name,comment?,color}] in target time. */
  kit.addMarkers = async function (target, markers, job, key) {
    const guids = [];
    const parts = kit.chunk(markers, 100);
    for (let i = 0; i < parts.length; i++) {
      job && job.check();
      job && job.progress(i / parts.length, `Adding markers ${i * 100 + 1}–${Math.min(markers.length, (i + 1) * 100)} of ${markers.length}`);
      job && job.set({ who: 'premiere' });
      const g = await US.host.call(target.kind === 'sequence' ? 'addSequenceMarkers' : 'addClipMarkers', target.kind === 'sequence' ? { seqId: target.id, markers: parts[i] } : { id: target.id, markers: parts[i] });
      guids.push(...g);
    }
    if (key) kit.rememberMarkers(key, target, guids);
    return guids.length;
  };

  /* ---------- files ---------- */
  kit.safeName = s => String(s || 'untitled').replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim().slice(0, 80);
  kit.saveText = function (name, text) {
    const p = path.join(US.fsx.exportsDir(), kit.safeName(name));
    fs.writeFileSync(p, text);
    return p;
  };
  kit.open = p => cp.exec(US.fsx.isWin ? `start "" "${p}"` : `open "${p}"`);
  kit.reveal = p => cp.exec(US.fsx.isWin ? `explorer /select,"${p}"` : `open -R "${p}"`);
  kit.chunk = (arr, n) => { const out = []; for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n)); return out; };

  /* ---------- full-quality measurement for Sound Check ---------- */
  kit.stereoPreset = async function () {
    const p = await US.host.call('presets');
    const base = String(p.wav16k || '').replace(/Settings[\\/]EncoderPresets[\\/]WAV_Mono_16bit_16kHz\.epr$/i, '');
    const cand = base ? path.join(base, 'MediaIO', 'systempresets', '3F3F3F3F_57415645', 'Waveform Audio 48kHz 16-bit.epr') : '';
    if (cand && US.fsx.exists(cand)) return { path: cand, stereo: true };
    if (p.wav48) return { path: p.wav48, stereo: false };
    return { path: p.wav16k, stereo: false };
  };

  /**
   * Render the target at 48 kHz (stereo when Premiere allows) and measure it while reading, so even long
   * sequences never sit in memory. Returns {meter, mono16 (Float32Array @16 kHz), sr: 16000, channels, rate}.
   */
  kit.measure = async function (target, job, { from = 0, to = 1 } = {}) {
    const preset = await kit.stereoPreset();
    const out = path.join(US.fsx.tempDir(), `measure-${US.fsx.hash(target.id)}-${Date.now()}.wav`);
    job.set({ who: 'premiere', msg: `Premiere is rendering the sound of “${target.name}”` });
    await kit.retry(() => US.host.call('renderAudio', target.kind === 'sequence' ? { seqId: target.id, out, preset: preset.path } : { id: target.id, out, preset: preset.path }), job);
    job.set({ who: 'computer', msg: `Measuring “${target.name}”` });
    const fd = fs.openSync(out, 'r');
    try {
      const info = US.audio.wavInfo(fd);
      if (!info || info.format !== 1 || info.bits !== 16) throw new US.UserError('CANT_DECODE', { detail: 'Unexpected render format ' + JSON.stringify(info) });
      const { channels, rate, dataStart, dataBytes } = info;
      const meter = new US.dsp.LoudnessMeter(rate, channels);
      const ratio = Math.max(1, Math.round(rate / 16000));
      const mono = new Float32Array(Math.ceil(dataBytes / (2 * channels) / ratio) + 1);
      let mi = 0, acc = 0, accN = 0;
      const frameBytes = 2 * channels, CH = Math.floor((4 << 20) / frameBytes) * frameBytes, buf = Buffer.alloc(CH);
      for (let off = 0; off < dataBytes; off += CH) {
        const n = fs.readSync(fd, buf, 0, Math.min(CH, dataBytes - off), dataStart + off);
        const frames = Math.floor(n / frameBytes);
        const i16 = new Int16Array(buf.buffer, buf.byteOffset, frames * channels);
        const chs = Array.from({ length: channels }, () => new Float32Array(frames));
        for (let f = 0; f < frames; f++) {
          let s = 0;
          for (let c = 0; c < channels; c++) { const v = i16[f * channels + c] / 32768; chs[c][f] = v; s += v; }
          acc += s / channels; if (++accN === ratio) { mono[mi++] = acc / ratio; acc = 0; accN = 0; }
        }
        meter.push(chs);
        job.check();
        job.progress(from + (to - from) * Math.min(1, (off + n) / dataBytes), `Measuring “${target.name}”`);
        await US.sleep(0);
      }
      return { meter: meter.result(), mono16: mono.subarray(0, mi), sr: rate / ratio, channels, rate, stereoPreset: preset.stereo };
    } finally {
      fs.closeSync(fd);
      try { fs.unlinkSync(out); } catch (e) { /* in use */ }
    }
  };

  /* ---------- shared look ---------- */
  kit.COLORS = { song: 'var(--accent)', applause: 'var(--warn)', talk: 'var(--info)', silence: 'var(--text-3)', cut: 'var(--err)' };
  kit.cssColor = v => getComputedStyle(document.documentElement).getPropertyValue(v.replace(/^var\((--[\w-]+)\)$/, '$1')).trim() || v;
  kit.legend = items => US.h('div.legend', items.map(([label, color]) => US.h('span', US.h('i', { style: { background: color } }), label)));
})();
