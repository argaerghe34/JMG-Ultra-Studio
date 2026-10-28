// Shared set-up for resolve-render/finish/audio tests: the stand-in Resolve with render presets, real WAV renders and a
// way to make the panel think it's in Resolve (US.app and US.host.call pointed at the stand-in).
'use strict';
const fs = require('fs'), path = require('path'), os = require('os');
const { make } = require('./resolve-fake');
const { connect } = require('../../resolve/host');

/** A PCM WAV (16- or 24-bit): a sine at amp (0..1) and freq Hz. */
function makeWav(rate, channels, seconds, { amp = 0.1, freq = 440, bits = 16 } = {}) {
  const B = bits / 8, n = Math.round(rate * seconds), data = Buffer.alloc(n * channels * B), full = bits === 24 ? 8388607 : 32767;
  for (let i = 0; i < n; i++) { const v = Math.round(Math.sin(2 * Math.PI * freq * i / rate) * amp * full); for (let c = 0; c < channels; c++) data.writeIntLE(v, (i * channels + c) * B, B); }
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + data.length, 4); h.write('WAVE', 8); h.write('fmt ', 12); h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20); h.writeUInt16LE(channels, 22); h.writeUInt32LE(rate, 24); h.writeUInt32LE(rate * channels * B, 28); h.writeUInt16LE(channels * B, 32); h.writeUInt16LE(bits, 34);
  h.write('data', 36); h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]);
}

/**
 * What Resolve 21's "Audio Only" preset writes: a QuickTime file with one 'lpcm' sound track (version 2 sound
 * description, little-endian signed integers), its samples in one chunk – the same layout as a real render.
 * bigEndian / chunks let the converter's other paths be tested.
 */
function makeMovPcm(rate, channels, seconds, { amp = 0.1, freq = 440, bits = 16, bigEndian = false, chunks = 1 } = {}) {
  const wav = makeWav(rate, channels, seconds, { amp, freq, bits }), pcm = Buffer.from(wav.subarray(44)), B = bits / 8, bpf = channels * B;
  if (bigEndian) for (let i = 0; i < pcm.length; i += B) pcm.subarray(i, i + B).reverse();
  const box = (type, ...parts) => { const body = Buffer.concat(parts); const h = Buffer.alloc(8); h.writeUInt32BE(8 + body.length); h.write(type, 4, 'latin1'); return Buffer.concat([h, body]); };
  const u32 = (...v) => { const b = Buffer.alloc(4 * v.length); v.forEach((x, i) => b.writeUInt32BE(x >>> 0, i * 4)); return b; };
  const frames = pcm.length / bpf, per = Math.ceil(frames / chunks);
  const desc = Buffer.alloc(72 - 8); // after size+'lpcm'
  desc.writeUInt16BE(1, 6); desc.writeUInt16BE(2, 8); desc.writeUInt16BE(3, 16); desc.writeUInt16BE(16, 18); desc.writeInt16BE(-2, 20); desc.writeUInt32BE(65536, 24); desc.writeUInt32BE(72, 28);
  desc.writeDoubleBE(rate, 32); desc.writeUInt32BE(channels, 40); desc.writeUInt32BE(0x7F000000, 44); desc.writeUInt32BE(bits, 48); desc.writeUInt32BE(12 | (bigEndian ? 2 : 0), 52); desc.writeUInt32BE(bpf, 56); desc.writeUInt32BE(1, 60);
  const ftyp = box('ftyp', Buffer.from('qt  '), u32(0), Buffer.from('qt  ')), mdat = box('mdat', pcm);
  const dataAt = ftyp.length + 8, offsets = []; for (let f = 0; f < frames; f += per) offsets.push(dataAt + f * bpf);
  const counts = offsets.map((o, i) => Math.min(per, frames - i * per));
  const runs = []; counts.forEach((n, i) => { if (!runs.length || runs[runs.length - 1][1] !== n) runs.push([i + 1, n]); });
  const stbl = box('stbl', box('stsd', u32(0, 1), box('lpcm', desc)), box('stts', u32(0, 1, frames, 1)),
    box('stsc', u32(0, runs.length), ...runs.map(([f, n]) => u32(f, n, 1))), box('stsz', u32(0, bpf, frames)), box('stco', u32(0, offsets.length, ...offsets)));
  const hdlr = box('hdlr', u32(0), u32(0x6d686c72), Buffer.from('soun'), Buffer.alloc(12));
  const moov = box('moov', box('trak', box('mdia', hdlr, box('minf', stbl))));
  return Buffer.concat([ftyp, mdat, moov]);
}

/**
 * The stand-in Resolve plus what real Resolve has and the fake lacks: render presets that remember the render settings
 * (SaveAsNewRenderPreset / LoadRenderPreset / DeleteRenderPreset) and WAV renders that are real WAV files.
 * F.jobLog: what each AddRenderJob saw ({settings, format, mode, timeline, audio, video}).
 */
function setup(opts = {}) {
  const F = make(opts);
  const P = F.project, presets = {}, builtIn = P.GetRenderPresetList();
  P.GetRenderPresetList = () => builtIn.concat(Object.keys(presets));
  P.SaveAsNewRenderPreset = n => { if (presets[n] || builtIn.includes(n)) return false; presets[n] = { settings: P.GetRenderSettings(), format: P.GetCurrentRenderFormatAndCodec(), mode: P.GetCurrentRenderMode() }; return true; };
  P.LoadRenderPreset = n => {
    if (n === 'Audio Only') { P.SetCurrentRenderFormatAndCodec('mov', 'H264'); P.SetRenderSettings({ ExportVideo: false, ExportAudio: true, AudioCodec: 'lpcm' }); return true; }
    if (builtIn.includes(n)) return true;
    const p = presets[n]; if (!p) return false;
    P.SetCurrentRenderFormatAndCodec(p.format.format, p.format.codec); P.SetCurrentRenderMode(p.mode); P.SetRenderSettings(p.settings); return true;
  };
  P.DeleteRenderPreset = n => { if (!presets[n]) return false; delete presets[n]; return true; };
  F.presets = presets;
  F.jobLog = [];
  const add = P.AddRenderJob;
  P.AddRenderJob = () => {
    const tl = F.currentTimeline;
    F.jobLog.push({ settings: P.GetRenderSettings(), format: P.GetCurrentRenderFormatAndCodec(), mode: P.GetCurrentRenderMode(), timeline: tl && tl.GetName(), audio: tl ? tl._a.flat().map(i => ({ name: i.GetName(), src: i._srcStart, len: i._end - i._start })) : [], video: tl ? tl._v.flat().length : 0 });
    return add();
  };
  // like Resolve 21: the Wave format can't be chosen by script and 16 kHz is refused
  const setFC = P.SetCurrentRenderFormatAndCodec;
  P.SetCurrentRenderFormatAndCodec = (f, c) => { if (f === 'wav') throw new Error('Execute: SetCurrentRenderFormatAndCodec: Error response (errorStr:Unknown render codec/format combination)'); return setFC(f, c); };
  P.GetRenderCodecs = (keep => f => (f === 'wav' ? {} : keep(f)))(P.GetRenderCodecs);
  const setRS = P.SetRenderSettings;
  P.SetRenderSettings = s => (s && Number(s.AudioSampleRate) && Number(s.AudioSampleRate) < 44100 ? false : setRS(s));
  F.wavSeconds = 2;
  F.renderContent = j => (j.settings.ExportVideo === false && j.settings.AudioCodec === 'lpcm' ? makeMovPcm(Number(j.settings.AudioSampleRate) || 48000, 2, F.wavSeconds, F.wavTone || {}) : 'fake render');
  const host = connect({ api: F.resolve });
  /** run a command; resolves with its data, rejects with {code, title, action, detail} */
  const run = async (name, args) => { const r = await host.run(name, args); if (!r.ok) throw Object.assign(new Error(r.error.title || r.error.code), r.error); return r.data; };
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'us-resolve-render-'));
  return { F, host, run, dir };
}

/**
 * Make the panel (loaded with the harness) think it runs in Resolve, with US.host.call answered by the stand-in.
 * calls: every host call made, [name, args]. stub: {name: fn(args)} answers first. Returns {calls, restore()}.
 */
function asResolve(US, host, stub = {}) {
  const keep = { is: US.app.is, id: US.app.id, name: US.app.name, call: US.host.call, refresh: US.refreshContext };
  const calls = [];
  US.app.is = w => w === 'resolve'; US.app.id = 'resolve'; US.app.name = 'Resolve';
  US.refreshContext = async () => {};
  US.host.call = async (fn, args) => {
    calls.push([fn, args]);
    if (stub[fn]) return stub[fn](args);
    const r = await host.run(fn, args);
    if (r.ok) return r.data;
    throw new US.UserError(r.error.code, { title: r.error.title, action: r.error.action, detail: r.error.detail });
  };
  return { calls, restore() { US.app.is = keep.is; US.app.id = keep.id; US.app.name = keep.name; US.host.call = keep.call; US.refreshContext = keep.refresh; } };
}

/** A job like US.jobs makes, recording progress. */
function fakeJob() {
  const j = { cancelled: false, frac: [], msgs: [], who: '' };
  j.set = o => { if (o.who) j.who = o.who; if (o.msg) j.msgs.push(o.msg); return j; };
  j.progress = (f, m) => { j.frac.push(f); if (m) j.msgs.push(m); return j; };
  j.range = () => j;
  j.check = () => { if (j.cancelled) { const e = new Error('Stopped'); e.code = 'CANCELLED'; throw e; } };
  return j;
}

module.exports = { makeMovPcm, makeWav, setup, asResolve, fakeJob };
