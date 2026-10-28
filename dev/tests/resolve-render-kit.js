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
  F.wavSeconds = 2;
  F.renderContent = j => (j.format.format === 'wav' ? makeWav(Number(j.settings.AudioSampleRate) || 48000, 2, F.wavSeconds, F.wavTone || {}) : 'fake render');
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

module.exports = { makeWav, setup, asResolve, fakeJob };
