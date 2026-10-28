// JMG Ultra Studio – Resolve side: rendering (the Resolve versions of jsx/host.jsx's presets, renderAudio, exportFrame,
// encoder*, queue*Export and autoReframe). Premiere hands exports to Media Encoder; here they go to Resolve's own
// Render Queue (AddRenderJob → StartRendering → GetRenderJobStatus), and the panel follows them by polling
// renderJobStatus (js/core/encoder.js).
//
// A "preset" is a string, as in Premiere (where it is an .epr path):
//   'resolve:<recipe>'  one of RECIPES below (format, codec and size set by Ultra Studio)
//   'preset:<name>'     one of Resolve's render presets (Deliver page), loaded by name
//   '/path/to/x.xml'    a render preset file, imported into Resolve and used
// Every command puts back what it changed: render format/codec/mode and settings (through a temporary render preset),
// the current timeline, the playhead and the page.
'use strict';
const fs = require('fs'), path = require('path');

/** Ultra Studio's own render settings, the nearest Resolve match for each Premiere/Media Encoder preset it uses. */
const RECIPES = {
  h264: { name: 'H.264 – timeline size, high quality', format: 'mp4', codec: [/^h\.?264$/i, /264/], size: 'timeline', audio: true, video: true, opt: { AudioCodec: 'aac', AudioSampleRate: 48000, VideoQuality: 0 } },
  youtube1080: { name: 'H.264 – YouTube 1080p', format: 'mp4', codec: [/^h\.?264$/i, /264/], size: [1920, 1080], audio: true, video: true, opt: { AudioCodec: 'aac', AudioSampleRate: 48000 } },
  youtube2160: { name: 'H.264 – YouTube 4K', format: 'mp4', codec: [/^h\.?264$/i, /264/], size: [3840, 2160], audio: true, video: true, opt: { AudioCodec: 'aac', AudioSampleRate: 48000 } },
  prores: { name: 'ProRes 422 HQ – timeline size', format: 'mov', codec: [/422.*hq|hq.*422/i, /prores/i], size: 'timeline', audio: true, video: true, opt: { AudioCodec: 'lpcm', AudioSampleRate: 48000 } },
  proxy: { name: 'H.264 1280×720', format: 'mp4', codec: [/^h\.?264$/i, /264/], size: [1280, 720], audio: true, video: true, opt: { AudioCodec: 'aac', AudioSampleRate: 48000 } },
  analysis: { name: 'H.264 1280×720 (analysis copy)', format: 'mp4', codec: [/^h\.?264$/i, /264/], size: [1280, 720], audio: true, video: true, opt: { AudioCodec: 'aac', AudioSampleRate: 48000 } },
  // Resolve 21 can't be set to its Wave format by script ("Unknown render codec/format combination" for every codec,
  // and GetRenderCodecs('wav') is empty) and won't take 16 kHz. So WAV = its "Audio Only" preset (PCM in a .mov),
  // turned into a plain WAV on this computer when the render is done (movPcmToWav, no change to the sound).
  wav: { name: 'WAV 48 kHz 16-bit', audioOnly: true, audio: true, video: false, rate: 48000, opt: { AudioCodec: 'lpcm', AudioSampleRate: 48000, AudioBitDepth: 16 } },
  wav48: { name: 'WAV 48 kHz 16-bit', audioOnly: true, audio: true, video: false, rate: 48000, opt: { AudioCodec: 'lpcm', AudioSampleRate: 48000, AudioBitDepth: 16 } },
  wav16k: { name: 'WAV 48 kHz 16-bit (Resolve won’t render 16 kHz; the panel resamples)', audioOnly: true, audio: true, video: false, rate: 48000, opt: { AudioCodec: 'lpcm', AudioSampleRate: 48000, AudioBitDepth: 16 } }
};
const AUDIO_ONLY = 'Audio Only';
const TOKEN = 'resolve:';
const SNAPSHOT = 'JMG Ultra Studio – your render settings';
const wait = ms => new Promise(r => setTimeout(r, ms));
const even = n => Math.max(2, Math.round(n / 2) * 2);

/** WAV header → {rate, channels, bits} (or null). */
function wavHeader(file) {
  let fd;
  try {
    fd = fs.openSync(file, 'r');
    const b = Buffer.alloc(4096), n = fs.readSync(fd, b, 0, 4096, 0);
    if (n < 44 || !/^(RIFF|RF64|BW64)$/.test(b.toString('ascii', 0, 4))) return null;
    for (let p = 12; p + 8 <= n;) {
      const id = b.toString('ascii', p, p + 4), size = b.readUInt32LE(p + 4);
      if (id === 'fmt ' && p + 24 <= n) return { channels: b.readUInt16LE(p + 10), rate: b.readUInt32LE(p + 12), bits: b.readUInt16LE(p + 22) };
      p += 8 + size + (size & 1);
    }
    return null;
  } catch (e) { return null; } finally { if (fd != null) fs.closeSync(fd); }
}

/**
 * The PCM sound of a QuickTime file (Resolve's "Audio Only" render) as a WAV: the first sound track's samples, in
 * order, chunk by chunk, with the byte order made little-endian. Handles 'lpcm' (version 2 sound description, with
 * its flags), 'sowt' / 'twos' / 'in24' / 'in32' / 'fl32'. → {rate, channels, bits, frames}
 */
function movPcmToWav(src, dst) {
  const b = fs.readFileSync(src);
  const box = (o, end) => { if (o + 8 > end) return null; let size = b.readUInt32BE(o), h = 8; if (size === 1) { size = Number(b.readBigUInt64BE(o + 8)); h = 16; } else if (size === 0) size = end - o; return { type: b.toString('latin1', o + 4, o + 8), start: o + h, end: o + size }; };
  const kids = (o, end) => { const out = []; for (let x; (x = box(o, end)) && x.end > o; o = x.end) out.push(x); return out; };
  const find = (list, type) => list.find(x => x.type === type);
  const moov = find(kids(0, b.length), 'moov');
  if (!moov) throw new Error('no moov in ' + src);
  let stbl = null;
  for (const trak of kids(moov.start, moov.end).filter(x => x.type === 'trak')) {
    const mdia = find(kids(trak.start, trak.end), 'mdia'); if (!mdia) continue;
    const m = kids(mdia.start, mdia.end), hdlr = find(m, 'hdlr');
    if (!hdlr || b.toString('latin1', hdlr.start + 8, hdlr.start + 12) !== 'soun') continue;
    const minf = find(m, 'minf'); stbl = minf && find(kids(minf.start, minf.end), 'stbl'); if (stbl) break;
  }
  if (!stbl) throw new Error('no sound track in ' + src);
  const s = kids(stbl.start, stbl.end), stsd = find(s, 'stsd'), e = stsd.start + 8;   // first sample description
  const fmt = b.toString('latin1', e + 4, e + 8), ver = b.readUInt16BE(e + 16);
  let channels, bits, rate, float = false, big;
  if (ver === 2) {
    // version 2: …, sizeOfStruct (e+36), sample rate float64 (e+40), channels (e+48), 0x7F000000, bits (e+56), flags (e+60)
    rate = b.readDoubleBE(e + 40); channels = b.readUInt32BE(e + 48); bits = b.readUInt32BE(e + 56);
    const flags = b.readUInt32BE(e + 60); float = !!(flags & 1); big = !!(flags & 2);
  } else {
    channels = b.readUInt16BE(e + 24); bits = b.readUInt16BE(e + 26); rate = b.readUInt32BE(e + 32) / 65536;
    big = fmt !== 'sowt'; if (fmt === 'in24') bits = 24; if (fmt === 'in32') bits = 32; if (fmt === 'fl32') { bits = 32; float = true; }
    if (ver === 1 && /^(in24|in32|fl32)$/.test(fmt)) { const en = kids(e + 52, e + b.readUInt32BE(e)).find(x => x.type === 'enda'); big = !(en && b.readUInt16BE(en.start)); }
  }
  if (!/^(lpcm|sowt|twos|in24|in32|fl32|raw )$/.test(fmt) || !channels || !bits) throw new Error(`not PCM sound (${fmt}, ${channels} ch, ${bits} bit)`);
  const bpf = channels * bits / 8;
  const co = find(s, 'stco') || find(s, 'co64'), wide = co.type === 'co64';
  const offsets = []; for (let i = 0, n = b.readUInt32BE(co.start + 4); i < n; i++) offsets.push(wide ? Number(b.readBigUInt64BE(co.start + 8 + i * 8)) : b.readUInt32BE(co.start + 8 + i * 4));
  const sc = find(s, 'stsc'), runs = []; for (let i = 0, n = b.readUInt32BE(sc.start + 4); i < n; i++) runs.push([b.readUInt32BE(sc.start + 8 + i * 12), b.readUInt32BE(sc.start + 12 + i * 12)]);
  const sz = find(s, 'stsz'), constSize = b.readUInt32BE(sz.start + 4), sizes = constSize ? null : Array.from({ length: b.readUInt32BE(sz.start + 8) }, (_, i) => b.readUInt32BE(sz.start + 12 + i * 4));
  // samples per chunk → bytes per chunk (a "sample" here is one frame of all channels, or a packet of that size)
  const parts = []; let sample = 0, total = 0;
  offsets.forEach((off, i) => {
    let per = 0; for (const [first, n] of runs) if (first <= i + 1) per = n;
    let bytes = 0; for (let k = 0; k < per; k++) bytes += sizes ? sizes[sample + k] || 0 : constSize * (constSize < bpf ? bpf / constSize : 1);
    if (!sizes && constSize === 1) bytes = per * bpf;   // old QuickTime: sizes counted in single samples
    sample += per; const part = b.subarray(off, Math.min(b.length, off + bytes)); parts.push(part); total += part.length;
  });
  let data = Buffer.concat(parts, total - (total % bpf));
  const w = bits / 8;
  if (big && w > 1) { data = Buffer.from(data); for (let i = 0; i + w <= data.length; i += w) data.subarray(i, i + w).reverse(); }
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + data.length, 4); h.write('WAVEfmt ', 8); h.writeUInt32LE(16, 16);
  h.writeUInt16LE(float ? 3 : 1, 20); h.writeUInt16LE(channels, 22); h.writeUInt32LE(Math.round(rate), 24);
  h.writeUInt32LE(Math.round(rate) * bpf, 28); h.writeUInt16LE(bpf, 32); h.writeUInt16LE(bits, 34); h.write('data', 36); h.writeUInt32LE(data.length, 40);
  const tmp = dst + '.part';
  fs.writeFileSync(tmp, Buffer.concat([h, data])); fs.renameSync(tmp, dst);
  return { rate: Math.round(rate), channels, bits, frames: data.length / bpf };
}

/** One render engine per connection (render.js and finish.js share it: job ids, scratch timelines). */
const engines = new WeakMap();
function engine(R) {
  if (engines.has(R)) return engines.get(R);
  const scratch = new Map();  // render job id → scratch timeline id (deleted when the job is over)
  const keep = new Set();     // job ids to leave in the Render Queue when done (removeWhenDone: false)
  const pending = new Set();  // job ids added but not started
  const toWav = new Map();    // job id → the WAV it was asked for (Resolve renders PCM in a .mov; converted when done)
  const pr = () => R.project();
  const call = (o, fn, ...args) => { try { return o && typeof o[fn] === 'function' ? o[fn](...args) : undefined; } catch (e) { return undefined; } };

  /* ---------- formats and codecs ---------- */
  function formats() { return call(pr(), 'GetRenderFormats') || {}; }
  /** 'mp4' → the format name Resolve takes ('mp4'), or '' when this Resolve has no such format */
  function formatKey(want) {
    const f = formats(), vals = Object.values(f).map(String), keys = Object.keys(f);
    if (vals.includes(want)) return want;
    const k = keys.find(x => x.toLowerCase() === want.toLowerCase());
    return k ? String(f[k]) : '';
  }
  function codecFor(format, res) {
    const c = call(pr(), 'GetRenderCodecs', format) || {};
    for (const re of res) for (const [desc, name] of Object.entries(c)) if (re.test(String(name)) || re.test(desc)) return String(name);
    return '';
  }
  /** a render format → the file extension it writes ('mxf_op1a' → 'mxf') */
  const extOf = format => String(format || '').toLowerCase().replace(/_.*$/, '') || 'mp4';
  function recipeOk(key) {
    const r = RECIPES[key]; if (!r) return false;
    if (r.audioOnly) return R.list(call(pr(), 'GetRenderPresetList')).map(String).includes(AUDIO_ONLY);
    const f = formatKey(r.format); return !!(f && codecFor(f, r.codec));
  }
  const token = key => (recipeOk(key) ? TOKEN + key : '');

  /* ---------- settings in and out ---------- */
  /** Settings that may not apply to every codec go one at a time, so one refusal doesn't lose the rest. */
  function setOptional(o) { const out = {}; for (const [k, v] of Object.entries(o || {})) out[k] = call(pr(), 'SetRenderSettings', { [k]: v }) !== false; return out; }
  function sizeFor(rec, tl) {
    const s = R.size(tl);
    if (rec.size === 'timeline') return s;
    let [w, h] = rec.size;
    if (s.height > s.width) [w, h] = [h, w];   // a vertical timeline gets the vertical version of the size
    return { width: w, height: h };
  }
  /** Make a preset string current. → {ext, rate (WAV only), name} */
  function applyPreset(preset, tl) {
    const p = String(preset || '');
    if (p.startsWith(TOKEN)) {
      const rec = RECIPES[p.slice(TOKEN.length)];
      if (!rec) throw R.err('PRESET_MISSING', 'Unknown Ultra Studio recipe ' + p);
      if (rec.audioOnly) {
        if (!call(pr(), 'LoadRenderPreset', AUDIO_ONLY)) throw R.err('PRESET_MISSING', 'LoadRenderPreset ' + AUDIO_ONLY, 'Resolve’s “Audio Only” render preset is missing.', 'Reset Resolve’s render presets on the Deliver page, then try again.');
        if (call(pr(), 'SetRenderSettings', { ExportVideo: false, ExportAudio: true }) === false) throw R.err('RENDER_FAILED', 'SetRenderSettings audio only', 'Resolve didn’t take the render settings.', 'Open the Deliver page once, then try again.');
        setOptional(rec.opt);
        return { ext: 'mov', rate: rec.rate, name: rec.name, wav: true };
      }
      const format = formatKey(rec.format), codec = format && codecFor(format, rec.codec);
      if (!codec) throw R.err('PRESET_MISSING', `No ${rec.format} / ${rec.codec.map(String).join(' or ')} in GetRenderFormats/GetRenderCodecs`, `Resolve can’t render ${rec.name} on this computer.`, 'Choose another render preset, then try again.');
      if (!call(pr(), 'SetCurrentRenderFormatAndCodec', format, codec)) throw R.err('RENDER_FAILED', `SetCurrentRenderFormatAndCodec(${format}, ${codec}) refused`, 'Resolve didn’t take the render settings.', 'Open the Deliver page once, then try again.');
      const s = { ExportVideo: !!rec.video, ExportAudio: !!rec.audio };
      if (rec.video) { const z = sizeFor(rec, tl); s.FormatWidth = z.width; s.FormatHeight = z.height; }
      if (call(pr(), 'SetRenderSettings', s) === false) throw R.err('RENDER_FAILED', 'SetRenderSettings ' + JSON.stringify(s), 'Resolve didn’t take the render settings.', 'Open the Deliver page once, then try again.');
      let rate = rec.rate || 0;
      if (rate) { if (!setOptional({ AudioSampleRate: rate }).AudioSampleRate) { rate = 48000; setOptional({ AudioSampleRate: 48000 }); } }
      setOptional(rec.opt);
      return { ext: extOf(format), rate, name: rec.name };
    }
    if (p.startsWith('preset:') || (p && !/[\\/]/.test(p) && !/\.(xml|epr)$/i.test(p))) {
      const name = p.replace(/^preset:/, '');
      if (!call(pr(), 'LoadRenderPreset', name)) throw R.err('PRESET_MISSING', 'LoadRenderPreset ' + name, `Resolve has no render preset called “${name}” any more.`, 'Choose the preset again in Deliver › Render ranges.');
      return { ext: extOf((call(pr(), 'GetCurrentRenderFormatAndCodec') || {}).format), rate: 0, name };
    }
    if (/\.epr$/i.test(p)) throw R.err('PRESET_MISSING', p, 'That’s a Premiere export preset, which Resolve can’t use.', 'Choose one of Resolve’s render presets instead.');
    if (/\.xml$/i.test(p)) {
      if (!R.exists(p)) throw R.err('PRESET_MISSING', p, 'The render preset file isn’t there any more.', 'Choose the preset again in Deliver › Render ranges.');
      if (!call(R.api, 'ImportRenderPreset', p)) throw R.err('PRESET_MISSING', 'ImportRenderPreset ' + p, 'Resolve didn’t accept that render preset file.', 'Save the preset again from Resolve’s Deliver page, then choose it.');
      return { ext: extOf((call(pr(), 'GetCurrentRenderFormatAndCodec') || {}).format), rate: 0, name: path.basename(p, '.xml') };
    }
    throw R.err('PRESET_MISSING', 'No preset given');
  }

  /**
   * Run fn, then put Resolve back: render format/codec, mode and settings (saved as a temporary render preset – the
   * API can't read them), the current timeline and the page.
   */
  async function withRestore(fn) {
    const P = pr(), page = call(R.api, 'GetCurrentPage'), tl = call(P, 'GetCurrentTimeline');
    const fc = call(P, 'GetCurrentRenderFormatAndCodec'), mode = call(P, 'GetCurrentRenderMode');
    const snap = SNAPSHOT + ' ' + Date.now();
    const saved = !!call(P, 'SaveAsNewRenderPreset', snap);
    try { return await fn(); } finally {
      if (saved) { call(P, 'LoadRenderPreset', snap); call(P, 'DeleteRenderPreset', snap); }
      if (fc && fc.format) call(P, 'SetCurrentRenderFormatAndCodec', fc.format, fc.codec);
      if (mode != null) call(P, 'SetCurrentRenderMode', mode);
      const now = call(P, 'GetCurrentTimeline');
      if (tl && R.timelineById(R.id(tl)) && (!now || R.id(now) !== R.id(tl))) call(P, 'SetCurrentTimeline', tl);
      if (page && call(R.api, 'GetCurrentPage') !== page) call(R.api, 'OpenPage', page);
    }
  }

  /**
   * Queue one render of a timeline. range: {start, end} in timeline seconds (else the whole timeline).
   * → {id, file, ext, rate}. The file is TargetDir/CustomName.<the preset's extension>.
   */
  function addJob(tl, out, preset, range) {
    const P = pr();
    R.open(tl);
    const info = applyPreset(preset, tl);
    call(P, 'SetCurrentRenderMode', 1);   // single clip
    const dir = path.dirname(out), base = path.basename(out).replace(/\.[^.]+$/, '');
    const s = { TargetDir: dir, CustomName: base };
    if (range) {
      const a = R.tlFrame(tl, Math.max(0, range.start)), b = Math.min(R.tlFrame(tl, range.end), tl.GetEndFrame()) - 1;   // MarkOut is the last frame
      if (!(b >= a)) throw R.err('BAD_INPUT', `Empty range ${range.start}–${range.end}`, 'That range is empty.', 'Set the range around the part to render, then try again.');
      Object.assign(s, { SelectAllFrames: false, MarkIn: a, MarkOut: b });
    } else s.SelectAllFrames = true;
    if (call(P, 'SetRenderSettings', s) === false) throw R.err('RENDER_FAILED', 'SetRenderSettings ' + JSON.stringify(s), 'Resolve didn’t take the render settings.', 'Check the export folder exists and can be written to, then try again.');
    let id = call(P, 'AddRenderJob');
    if (!id) { call(R.api, 'OpenPage', 'deliver'); id = call(P, 'AddRenderJob'); }   // some versions add jobs only from the Deliver page
    if (!id) throw R.err('RENDER_FAILED', 'AddRenderJob returned nothing for ' + out, 'Resolve didn’t add the render to its queue.', 'Open the Deliver page, check the render settings there, then try again.');
    id = String(id);
    pending.add(id);
    if (info.wav) { toWav.set(id, path.join(dir, base + '.wav')); return { id, ext: 'wav', rate: info.rate, file: path.join(dir, base + '.wav') }; }
    return { id, ext: info.ext, rate: info.rate, file: path.join(dir, base + '.' + info.ext) };
  }

  /* ---------- scratch timelines (to render a Media Pool clip) ---------- */
  const TEMP_BIN = 'JMG Ultra Studio/Temp';
  /** The part of a clip that's used: a subclip's range, else its In/Out marks, else all of it (media seconds). */
  function clipRange(item) {
    const info = R.itemInfo(item), fps = info.fps || 25;
    if (info.subclip) return { start: info.rangeStart, end: info.rangeEnd, info };
    // the same range as audioClipRange (core.js), so the panel's offsets line up with what was rendered
    const m = call(item, 'GetMarkInOut') || {}, mk = m.audio || m.video;
    const start = mk && mk.in != null ? Number(mk.in) / fps : 0, end = mk && mk.out != null ? (Number(mk.out) + 1) / fps : info.duration;
    return end > start ? { start, end, info } : { start: 0, end: info.duration, info };
  }
  /** A temporary timeline in "JMG Ultra Studio/Temp" holding one clip (mediaType 2 = sound only). It becomes current. */
  function scratchTimeline(item, { mediaType, whole } = {}) {
    const pool = R.pool();
    const r = clipRange(item), info = r.info;
    if (info.offline) throw R.err('OFFLINE', info.path);
    if (mediaType === 2 && !info.hasAudio) throw R.err('NO_AUDIO', info.name);
    const bin = R.ensureBin(TEMP_BIN);
    const name = R.uniqueTimelineName('Ultra Studio temp ' + Date.now());
    const tl = R.inFolder(bin, () => pool.CreateEmptyTimeline(name));
    if (!tl) throw R.err('RENDER_FAILED', 'CreateEmptyTimeline ' + name, 'Resolve couldn’t make a temporary timeline.', 'Check the project isn’t locked, then try again.');
    // same frame rate and size as the clip (only possible while the timeline is empty)
    if (call(tl, 'SetSetting', 'useCustomSettings', '1') !== false) {
      if (info.fps) call(tl, 'SetSetting', 'timelineFrameRate', String(info.fps));
      if (info.width && info.height) { call(tl, 'SetSetting', 'timelineResolutionWidth', String(info.width)); call(tl, 'SetSetting', 'timelineResolutionHeight', String(info.height)); }
    }
    R.open(tl);
    const a = whole ? (info.subclip ? info.rangeStart : 0) : r.start, b = whole ? (info.subclip ? info.rangeEnd : info.duration) : r.end;
    const ci = R.clipInfo(item, a, b, Object.assign({ trackIndex: 1, recordFrame: tl.GetStartFrame() }, mediaType ? { mediaType } : {}));
    const placed = R.list(pool.AppendToTimeline([ci]));
    if (!placed.length) { dropScratch(tl); throw R.err('RENDER_FAILED', 'AppendToTimeline refused ' + info.name, 'Resolve couldn’t put the clip on a temporary timeline.', 'Check the clip plays in Resolve, then try again.'); }
    return tl;
  }
  function dropScratch(tl) {
    if (!tl) return;
    call(R.pool(), 'DeleteTimelines', [tl]);
    R.forget();
    const e = R.index().folders.find(f => R.binPath(f.parts) === 'JMG Ultra Studio / Temp');
    if (e && !R.list(e.folder.GetClipList()).length && !R.list(e.folder.GetSubFolderList()).length) call(R.pool(), 'DeleteFolders', [e.folder]);
    R.forget();
  }

  /* ---------- jobs ---------- */
  function jobFile(id) {
    const j = R.list(call(pr(), 'GetRenderJobList')).find(x => x && String(x.JobId) === id);
    return j && j.TargetDir && j.OutputFilename ? path.join(String(j.TargetDir), String(j.OutputFilename)) : '';
  }
  function norm(st) {
    const s = String((st && st.JobStatus) || '');
    if (!st || !Object.keys(st).length) return 'missing';
    if (/complete/i.test(s)) return 'complete';
    if (/fail/i.test(s)) return 'failed';
    if (/cancel/i.test(s)) return 'cancelled';
    if (/render/i.test(s)) return 'rendering';
    return 'waiting';
  }
  /** A job is over: delete its scratch timeline, and (finished, ours) take it off the Render Queue. */
  function finish(id, state) {
    const tid = scratch.get(id);
    if (tid) { scratch.delete(id); dropScratch(R.timelineById(tid)); }
    pending.delete(id);
    if (state === 'complete' && !keep.has(id)) call(pr(), 'DeleteRenderJob', id);
    keep.delete(id);
  }
  /** → [{id, status: waiting|rendering|complete|failed|cancelled|missing, progress 0..1, error, file}] */
  function status(ids) {
    return ids.map(String).map(id => {
      const st = call(pr(), 'GetRenderJobStatus', id) || {}, state = norm(st), file = jobFile(id);
      const out = { id, status: state, progress: state === 'complete' ? 1 : Math.max(0, Math.min(1, (Number(st.CompletionPercentage) || 0) / 100)), error: String(st.Error || ''), file };
      if (st.EstimatedTimeRemainingInMs != null) out.etaMs = Number(st.EstimatedTimeRemainingInMs) || 0;
      if (state === 'missing') out.error = 'The render was taken off Resolve’s Render Queue.';
      if (toWav.has(id) && state === 'complete') {
        const wav = toWav.get(id); toWav.delete(id);
        try { movPcmToWav(file, wav); if (file !== wav) fs.unlinkSync(file); out.file = wav; } catch (e) { out.status = 'failed'; out.error = 'Couldn’t read the sound Resolve rendered: ' + e.message; }
      } else if (/failed|cancelled|missing/.test(state)) toWav.delete(id);
      if (/complete|failed|cancelled|missing/.test(state)) finish(id, state);
      return out;
    });
  }
  function start(ids) {
    const P = pr();
    ids = (ids && ids.length ? ids : Array.from(pending)).map(String);
    if (!ids.length) return false;
    if (call(P, 'IsRenderingInProgress')) throw R.err('BUSY', 'IsRenderingInProgress', 'Resolve is already rendering.', 'Wait for that render to finish (or stop it on the Deliver page), then try again.');
    if (call(P, 'StartRendering', ids) === false) throw R.err('RENDER_FAILED', 'StartRendering ' + ids.join(','), 'Resolve didn’t start rendering.', 'Open the Deliver page to see if a render is waiting for you, then try again.');
    ids.forEach(id => pending.delete(id));
    return true;
  }
  /** Render now and wait (renderAudio). → the job's last status */
  async function renderAndWait(id, { timeoutMs = 9 * 60000 } = {}) {
    start([id]);
    const t0 = Date.now();
    for (;;) {
      const [st] = status([id]);
      if (st.status === 'complete') return st;
      if (/failed|cancelled|missing/.test(st.status)) { call(pr(), 'DeleteRenderJob', id); throw R.err('RENDER_FAILED', `Render ${st.status}: ${st.error}`); }
      if (Date.now() - t0 > timeoutMs) { call(pr(), 'StopRendering'); call(pr(), 'DeleteRenderJob', id); finish(id, 'failed'); throw R.err('RENDER_FAILED', 'Render took longer than ' + Math.round(timeoutMs / 60000) + ' minutes', 'Resolve took too long to render the sound.', 'Try a shorter timeline or clip, or check Resolve isn’t waiting for you.'); }
      await wait(250);
    }
  }
  function stop(ids) {
    const P = pr();
    call(P, 'StopRendering');
    let n = 0;
    for (const id of (ids || []).map(String)) {
      const st = norm(call(P, 'GetRenderJobStatus', id) || {});
      if (st !== 'complete') { if (call(P, 'DeleteRenderJob', id)) n++; }
      finish(id, st === 'complete' ? 'complete' : 'cancelled');
    }
    return n;
  }

  /** A timeline's size and its frame-size settings (custom per timeline). mismatch: how other-size clips fill it. */
  function setSize(tl, w, h, mismatch) {
    tl.SetSetting('useCustomSettings', '1');
    tl.SetSetting('timelineResolutionWidth', String(w));
    tl.SetSetting('timelineResolutionHeight', String(h));
    try { tl.SetSetting('timelineOutputResolutionWidth', String(w)); tl.SetSetting('timelineOutputResolutionHeight', String(h)); } catch (e) { /* follows the timeline size */ }
    if (mismatch) { try { tl.SetSetting('timelineInputResMismatchBehavior', mismatch); } catch (e) { /* project default */ } }
    const s = R.size(tl);
    return s.width === w && s.height === h;
  }
  /** Put a new timeline (made in the current folder) in a bin, if Resolve made it elsewhere. */
  function intoBin(tl, bin) {
    const mpi = tl.GetMediaPoolItem && tl.GetMediaPoolItem();
    if (!mpi) return;
    R.forget();
    const e = R.entry(R.id(mpi));
    if (e && e.folder && R.id(e.folder) !== R.id(bin)) { try { R.pool().MoveClips([mpi], bin); } catch (x) { /* stays where Resolve put it */ } }
    R.forget();
  }

  const E = { setSize, intoBin, RECIPES, TOKEN, formats, formatKey, codecFor, recipeOk, token, applyPreset, withRestore, addJob, clipRange, scratchTimeline, dropScratch, scratch, keep, pending, status, start, stop, renderAndWait, finish, extOf };
  engines.set(R, E);
  return E;
}

module.exports = function (R) {
  const E = engine(R);
  const P = () => R.project();

  return {
    /** The presets the panel checks for (Premiere: .epr files). */
    presets() {
      return { wav16k: E.token('wav16k'), wav48: E.token('wav48'), h264proxy: E.token('proxy') };
    },

    /**
     * Render the sound of a timeline or a Media Pool clip to a WAV. a: {seqId | id, out, preset?} → {path, size, rate,
     * channels}. 16 kHz when Resolve allows it, else 48 kHz (the panel's WAV reader resamples either way). A clip goes
     * on a temporary timeline in "JMG Ultra Studio/Temp" (its In/Out or subclip range, as Premiere does), deleted after.
     */
    async renderAudio(a) {
      const preset = String(a.preset || '').startsWith(E.TOKEN) ? a.preset : E.TOKEN + 'wav16k';
      const tl = a.seqId ? R.needSeq(a.seqId) : null, item = tl ? null : R.needItem(a.id);
      if (!a.out) throw R.err('BAD_INPUT', 'renderAudio: no out path');
      fs.mkdirSync(path.dirname(a.out), { recursive: true });
      try { fs.unlinkSync(a.out); } catch (e) { /* not there */ }
      let scratchTl = null, job = null;
      return E.withRestore(async () => {
        try {
          const target = tl || (scratchTl = E.scratchTimeline(item, { mediaType: 2 }));
          job = E.addJob(target, a.out, preset);
          const st = await E.renderAndWait(job.id);
          const file = R.exists(a.out) ? a.out : st.file || job.file;
          if (!R.exists(file) || fs.statSync(file).size <= 44) throw R.err('RENDER_FAILED', 'No sound file at ' + file);
          if (file !== a.out) { try { fs.renameSync(file, a.out); } catch (e) { /* keep Resolve's name */ } }
          const p = R.exists(a.out) ? a.out : file, h = wavHeader(p) || {};
          return { path: p, size: fs.statSync(p).size, rate: h.rate || job.rate || 0, channels: h.channels || 0, resampled: !!(h.rate && h.rate !== 16000) };
        } finally {
          if (job) { E.pending.delete(job.id); try { P().DeleteRenderJob(job.id); } catch (e) { /* gone */ } }
          if (scratchTl) E.dropScratch(scratchTl);
        }
      });
    },

    /**
     * One frame of a timeline as a PNG (Resolve's "Export current frame as still"). a: {seqId, seconds, outBase} → path.
     * The playhead, timeline and page are put back. The still is only ever written to this computer.
     */
    async exportFrame(a) {
      const tl = R.needSeq(a.seqId), pr = P(), api = R.api;
      const file = String(a.outBase || '').replace(/\.png$/i, '') + '.png';
      fs.mkdirSync(path.dirname(file), { recursive: true });
      try { fs.unlinkSync(file); } catch (e) { /* not there */ }
      const page = api.GetCurrentPage ? api.GetCurrentPage() : '', was = pr.GetCurrentTimeline();
      let before = '', ok = false, tried = [];
      try {
        if (!/^(edit|cut|color)$/.test(page || '')) api.OpenPage('edit');   // the playhead can't be set on the Media or Fusion page
        R.open(tl);
        before = tl.GetCurrentTimecode() || '';
        const fps = R.fps(tl), f = Math.max(tl.GetStartFrame(), Math.min(R.tlFrame(tl, Number(a.seconds) || 0), tl.GetEndFrame() - 1));
        const tc = R.framesToTC(f, fps, R.dropFrame(tl));
        const attempt = where => { tried.push(where); tl.SetCurrentTimecode(tc); return !!pr.ExportCurrentFrameAsStill(file) && R.exists(file); };
        ok = attempt(api.GetCurrentPage ? api.GetCurrentPage() : 'edit');
        if (!ok) { api.OpenPage('color'); ok = attempt('color'); }   // some versions export stills from the Color page only
      } finally {
        try { if (before) tl.SetCurrentTimecode(before); } catch (e) { /* leave it */ }
        if (was && R.id(was) !== R.id(tl)) pr.SetCurrentTimeline(was);
        if (page && api.GetCurrentPage && api.GetCurrentPage() !== page) api.OpenPage(page);
      }
      if (!ok) throw R.err('RENDER_FAILED', 'ExportCurrentFrameAsStill failed on ' + tried.join(', ') + ' → ' + file, 'Resolve couldn’t save the frame.', 'Check the timeline has a picture at the playhead, then try again.');
      return file;
    },

    /* ---------- the Render Queue (Premiere: Media Encoder) ---------- */
    /** Premiere forwards Media Encoder's events; in Resolve the panel polls renderJobStatus instead. */
    encoderListen() { return true; },
    encoderPresets() { return { h264: E.token('h264'), proxy: E.token('proxy'), analysis: E.token('analysis'), wav: E.token('wav') }; },
    /** Queue a Media Pool clip (all of it, or a subclip's part) on a temporary timeline. a: {id, out, preset, removeWhenDone} → job id */
    async queueItemExport(a) {
      const item = R.needItem(a.id);
      return E.withRestore(async () => {
        const tl = E.scratchTimeline(item, { whole: true });
        let job;
        try { job = E.addJob(tl, a.out, a.preset); } catch (e) { E.dropScratch(tl); throw e; }
        E.scratch.set(job.id, R.id(tl));
        if (a.removeWhenDone === false) E.keep.add(job.id);
        return job.id;
      });
    },
    /** Queue a timeline. a: {seqId, out, preset, workArea: 0 whole | 1 its In/Out, removeWhenDone} → job id */
    async queueExport(a) {
      const tl = R.needSeq(a.seqId);
      let range = null;
      if (a.workArea === 1) {
        const m = (tl.GetMarkInOut && tl.GetMarkInOut()) || {}, v = m.video || m.audio, s = tl.GetStartFrame(), fps = R.fps(tl);
        // Resolve reports marks from the timeline's start (0 = first frame); older versions in absolute frames
        if (v && v.in != null && v.out != null) { const off = Number(v.in) >= s ? s : 0; range = { start: (Number(v.in) - off) / fps, end: (Number(v.out) + 1 - off) / fps }; }
      }
      return E.withRestore(async () => {
        const job = E.addJob(tl, a.out, a.preset, range);
        if (a.removeWhenDone === false) E.keep.add(job.id);
        return job.id;
      });
    },
    /** Start our queued renders (only ours – other jobs in the Render Queue are left alone). a: {ids?} */
    startEncoderBatch(a) { return E.start(a && a.ids); },
    /** Resolve only: how our renders are getting on. a: {ids} → [{id, status, progress, error, file}] */
    renderJobStatus(a) { return E.status(R.list(a.ids)); },
    /** Resolve only: Stop – stops rendering and takes our unfinished renders off the queue. a: {ids} → how many removed */
    renderStop(a) { return E.stop(R.list(a.ids)); },

    /**
     * Smart Reframe (Studio) as Premiere's Auto Reframe: a copy of the timeline at num:den with the same height
     * (607×1080 → 608×1080 from 1080p, even numbers), each video clip reframed. a: {seqId, num, den, name, binPath}
     * → {id, name, width, height, reframed, failed}
     */
    async autoReframe(a) {
      const src = R.needSeq(a.seqId), pr = P(), api = R.api, s = R.size(src);
      if (!(a.num > 0 && a.den > 0)) throw R.err('BAD_INPUT', 'autoReframe ' + a.num + ':' + a.den);
      const h = s.height, w = even(h * a.num / a.den);
      const bin = R.ensureBin(a.binPath || 'JMG Ultra Studio/Deliver');
      const name = R.uniqueTimelineName(a.name || `${src.GetName()} – ${a.num}:${a.den}`);
      const was = pr.GetCurrentTimeline(), page = api.GetCurrentPage ? api.GetCurrentPage() : '';
      try {
        const dup = R.inFolder(bin, () => src.DuplicateTimeline(name));
        if (!dup) throw R.err('HOST_SCRIPT', 'DuplicateTimeline refused', 'Resolve couldn’t copy the timeline for Smart Reframe.', 'Check the project isn’t locked, then try again.');
        E.intoBin(dup, bin);
        if (!E.setSize(dup, w, h, 'scaleToCrop')) { R.pool().DeleteTimelines([dup]); throw R.err('HOST_SCRIPT', `Timeline size ${w}×${h} not taken`, 'Resolve didn’t take the new frame size.', 'Try again. If it keeps happening, make the copy by hand and use Smart Reframe in the Inspector.'); }
        R.open(dup);
        const items = R.trackItems(dup, 'video').filter(x => x.ti.GetMediaPoolItem && x.ti.GetMediaPoolItem());
        const tryAll = list => list.filter(x => { try { return !!x.ti.SmartReframe(); } catch (e) { return false; } });
        let done = tryAll(items);
        if (!done.length && items.length && page !== 'edit') { api.OpenPage('edit'); done = tryAll(items); }   // the Inspector's reframe lives on the Edit page
        return { id: R.id(dup), name: dup.GetName(), width: w, height: h, reframed: done.length, failed: items.length - done.length };
      } finally {
        if (was && R.timelineById(R.id(was))) pr.SetCurrentTimeline(was);
        if (page && api.GetCurrentPage && api.GetCurrentPage() !== page) api.OpenPage(page);
      }
    },

  };
};
module.exports.engine = engine;
module.exports.RECIPES = RECIPES;
module.exports.wavHeader = wavHeader;
module.exports.movPcmToWav = movPcmToWav;
