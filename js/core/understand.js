/* JMG Ultra Studio – understanding the footage: what each clip shows and how it sounds, over time, in words.

   One engine (US.understand) builds a record per clip – shot descriptions with times, tags (shot size, setting, people),
   things seen that a transcript misses (reactions, gestures, looks), and things heard (music, applause, laughter,
   silence, wind, a raised voice) – keeps it per media file, and lets everything else search it, quote it, or hand a
   short digest of it to an AI that only reads text (Ask, Producer, Story).

   Who looks and listens is the project's choice (Settings › Vision & listening models):
     on this computer – a vision model run by Ultra Studio's helper (or one you have in Ollama / LM Studio), and the
                        built-in listener (measured here, no model) with, optionally, a listening model;
     cloud            – small stills and the sound go to Gemini (Claude: stills only) through US.ai.media. Off until
                        chosen for the project; never for a project set to “nothing leaves this computer”.

   Background first: a quiet queue works through the project in small slices while the computer is calm (no job
   running, low load, the panel responsive, not on a low battery) and stops the moment it isn't. Work that would be
   heavy isn't started behind the editor's back: status() says what is waiting, why and for how long, and it is
   offered to Overnight prep or “Run now”. Frames and sound come only from routes that open nothing: the panel's own
   <video>, ffmpeg when installed, plain WAV files. Media Encoder is never started from here.

   Pure pieces first (unit-tested), then the routes, the record store, the queue and the public API. */
(function () {
  'use strict';
  const US = window.US;
  const fs = require('fs'), path = require('path'), os = require('os');
  const VERSION = 1;   // bump when what a record holds changes (records are made again)
  const clip = (s, n) => { s = String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
  const fmtT = s => { s = Math.max(0, +s || 0); const m = Math.floor(s / 60), ss = Math.floor(s - m * 60); return `${m}:${ss < 10 ? '0' : ''}${ss}`; };
  const num = (x, d = 0) => (isFinite(+x) ? +x : d);
  const set = k => US.settings.get('understand.' + k);

  /* =================== pure pieces =================== */
  const SHOTS = ['wide', 'medium', 'close-up', 'detail', 'aerial', 'interview', 'screen or graphic', 'other'];
  const EVENT_KINDS = ['reaction', 'gesture', 'look', 'action', 'text', 'other'];
  const SOUND_TYPES = ['laughter', 'applause', 'cheering', 'music', 'singing', 'crowd', 'wind', 'traffic', 'noise', 'silence', 'raised voice', 'crying', 'emphasis', 'other'];
  const SOUND_WORDS = { laughter: 'laughter', applause: 'applause', cheering: 'cheering', music: 'music', singing: 'singing', crowd: 'a crowd', wind: 'wind noise', traffic: 'traffic', noise: 'background noise', silence: 'silence', 'raised voice': 'a raised voice', crying: 'crying', emphasis: 'a raised voice', other: 'a sound' };

  /** When to look at a clip: about one still every `every` seconds, at least one, at most `max` (spread evenly). */
  function visionTimes(seconds, { every = 10, max = 24 } = {}) {
    const d = Math.max(0, +seconds || 0);
    if (!(d > 0)) return [0];
    const n = Math.max(1, Math.min(max, Math.ceil(d / every)));
    return Array.from({ length: n }, (_, i) => Math.round(d * (i + 0.5) / n * 100) / 100);
  }
  /** Pieces of sound for a model that listens `chunk` seconds at a time: all of a short clip, an even spread of a long one. */
  function listenChunks(seconds, { chunk = 30, max = 20 } = {}) {
    const d = Math.max(0, +seconds || 0), all = Math.max(1, Math.ceil(d / chunk));
    const pick = all <= max ? Array.from({ length: all }, (_, i) => i) : Array.from({ length: max }, (_, i) => Math.round(i * (all - 1) / (max - 1)));
    return pick.map(i => ({ start: i * chunk, end: Math.min(d, (i + 1) * chunk) })).filter(c => c.end - c.start >= 1 || all === 1);
  }

  const VSCHEMA = {
    type: 'object', additionalProperties: false, required: ['shots', 'events'],
    properties: {
      shots: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['from', 'to', 'description', 'shot', 'setting', 'people', 'tags'],
        properties: { from: { type: 'number' }, to: { type: 'number' }, description: { type: 'string' }, shot: { type: 'string', enum: SHOTS }, setting: { type: 'string' }, people: { type: 'string' }, tags: { type: 'array', items: { type: 'string' } } } } },
      events: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['at', 'kind', 'what'], properties: { at: { type: 'number' }, kind: { type: 'string', enum: EVENT_KINDS }, what: { type: 'string' } } } }
    }
  };
  const VSYSTEM = 'You log footage for a documentary and charity-film editor from small stills of ONE clip, given in time order, each after a line with its time in seconds. Say only what the stills show – never guess names, places or events that aren’t visible. ' +
    '"shots": what the clip shows over time. Stills that show the same thing belong to one entry; a new entry when the picture changes. "from"/"to": seconds. "description": one plain sentence an editor could search for. "shot": the kind of shot. "setting": where, in a few words, or "". "people": who is seen, in a few words (“two women in aprons”, “no one”). "tags": 3–8 short lower-case search words. ' +
    '"events": things an editor would want that a transcript never has – a reaction (a smile, a laugh, tears, surprise), a gesture (a nod, a wave, a handshake, pointing), a look (to camera, away, between two people), an action, or writing readable in the picture ("text") – each with "at" (the still’s time) and "what" in a few words. An empty list when there are none. British English.';
  /** The request for some stills of a clip: a line of text saying what follows, then each still after its time. */
  function visionRequest(item, stills) {
    const user = [`Clip “${item.name || 'clip'}”, ${fmtT(item.duration)} long. ${stills.length === 1 ? 'One still' : stills.length + ' stills'} follow.`];
    for (const s of stills) { user.push(`Still at ${Math.round(s.t * 10) / 10} seconds:`); user.push({ image: { data: s.data, mime: 'image/jpeg', w: s.w, h: s.h, note: `${item.name || 'clip'} at ${fmtT(s.t)}` } }); }
    return { system: VSYSTEM, user, schema: VSCHEMA, maxTokens: 700 + stills.length * 300, feature: 'Seeing footage' };
  }
  const tagsOf = x => Array.from(new Set((Array.isArray(x) ? x : []).map(t => String(t).toLowerCase().trim()).filter(t => t && t.length <= 30))).slice(0, 10);
  /**
   * A model's answer about some stills, tidied: times kept inside the clip and in order, each shot at least covering
   * the stills it was made from. times: when the stills were taken; span: seconds one still stands for.
   */
  function tidyVision(r, times, duration, span) {
    const d = Math.max(0, +duration || 0), half = Math.max(0.5, (span || 10) / 2), lo = Math.max(0, times[0] - half), hi = d ? Math.min(d, times[times.length - 1] + half) : times[times.length - 1] + half;
    let shots = (Array.isArray(r && r.shots) ? r.shots : []).map(s => {
      let a = US.clamp(num(s.from, lo), lo, hi), b = US.clamp(num(s.to, hi), lo, hi);
      if (b < a) { const t = a; a = b; b = t; }
      return { start: a, end: b, text: clip(s.description, 300), shot: SHOTS.includes(s.shot) ? s.shot : 'other', setting: clip(s.setting, 80), people: clip(s.people, 80), tags: tagsOf(s.tags) };
    }).filter(s => s.text).sort((a, b) => a.start - b.start);
    if (shots.length === 1) { shots[0].start = lo; shots[0].end = hi; }
    // no gaps or overlaps: each shot runs to the start of the next, the first from the start, the last to the end
    shots.forEach((s, i) => { s.start = i ? Math.max(shots[i - 1].start, s.start) : lo; if (i) shots[i - 1].end = s.start; if (i === shots.length - 1) s.end = hi; });
    shots = shots.filter(s => s.end - s.start > 0.05 || shots.length === 1).map(s => Object.assign(s, { start: Math.round(s.start * 10) / 10, end: Math.round(s.end * 10) / 10 }));
    const events = (Array.isArray(r && r.events) ? r.events : []).map(e => ({ t: Math.round(US.clamp(num(e.at, times[0]), lo, hi) * 10) / 10, kind: EVENT_KINDS.includes(e.kind) ? e.kind : 'other', text: clip(e.what, 140) })).filter(e => e.text).slice(0, 12);
    return { shots, events };
  }
  /** Shots next to each other that say the same kind of thing become one (a tiny model answers still by still). */
  function mergeShots(shots) {
    const out = [];
    for (const s of shots.slice().sort((a, b) => a.start - b.start)) {
      const l = out[out.length - 1];
      const same = l && l.shot === s.shot && (l.text === s.text || (l.tags.length && s.tags.filter(t => l.tags.includes(t)).length >= Math.max(2, Math.ceil(Math.min(l.tags.length, s.tags.length) * 0.6))));
      if (same) { l.end = Math.max(l.end, s.end); l.tags = tagsOf(l.tags.concat(s.tags)); if (s.text.length > l.text.length) l.text = s.text; if (!l.setting) l.setting = s.setting; if (!l.people) l.people = s.people; }
      else out.push(Object.assign({}, s, { tags: s.tags.slice() }));
    }
    return out;
  }

  const ASCHEMA = {
    type: 'object', additionalProperties: false, required: ['sounds', 'tone'],
    properties: {
      sounds: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['from', 'to', 'type', 'what'], properties: { from: { type: 'number' }, to: { type: 'number' }, type: { type: 'string', enum: SOUND_TYPES.filter(t => t !== 'emphasis') }, what: { type: 'string' } } } },
      tone: { type: 'string' }
    }
  };
  const ASYSTEM = 'You listen to a piece of sound from a video editor’s clip and note what a transcript would miss. Do NOT transcribe the words. ' +
    '"sounds": each thing heard that isn’t plain talking – laughter, applause, cheering, music, singing, a crowd, wind, traffic, other noise, a long silence, a raised voice, crying – with "from"/"to" in seconds from the start of this piece and "what" in a few words (“two people laugh”, “soft piano”). An empty list when there is only plain talk. ' +
    '"tone": how the speaking sounds, in a few words (“warm and amused”, “hesitant, close to tears”, “flat”), or "" when nobody speaks. Only what you can hear – never guess. British English.';
  function listenRequest(item, chunk, wavBase64, bytes) {
    return { system: ASYSTEM, user: [`A piece of the sound of “${item.name || 'clip'}”, ${Math.round(chunk.end - chunk.start)} seconds long (from ${fmtT(chunk.start)} in the clip).`, { media: { kind: 'audio', data: wavBase64, mime: 'audio/wav', bytes, seconds: chunk.end - chunk.start, note: `${item.name || 'clip'} ${fmtT(chunk.start)}–${fmtT(chunk.end)}` } }], schema: ASCHEMA, maxTokens: 900, feature: 'Hearing footage' };
  }
  function tidyListen(r, chunk, by) {
    const len = chunk.end - chunk.start;
    const sounds = (Array.isArray(r && r.sounds) ? r.sounds : []).map(s => {
      let a = US.clamp(num(s.from, 0), 0, len), b = US.clamp(num(s.to, len), 0, len); if (b < a) { const t = a; a = b; b = t; }
      return { type: SOUND_TYPES.includes(s.type) ? s.type : 'other', start: Math.round((chunk.start + a) * 10) / 10, end: Math.round((chunk.start + Math.max(b, a + 0.5)) * 10) / 10, text: clip(s.what, 100), conf: 0.7, by };
    }).filter(s => s.type !== 'other' || s.text).slice(0, 12);
    return { sounds, tone: clip(r && r.tone, 80) };
  }
  /** The built-in listener's events as record sounds. */
  const builtinSounds = ev => (ev.events || []).map(e => ({ type: e.type, start: e.start, end: e.end, text: '', conf: e.conf, by: 'built-in' }));
  /** Sounds from two listeners together: a model's word for a stretch replaces the built-in one for the same stretch. */
  function mergeSounds(builtin, model) {
    const covered = b => model.some(m => Math.min(m.end, b.end) - Math.max(m.start, b.start) > 0.5 * (b.end - b.start) && (m.type === b.type || b.type === 'noise' || b.type === 'emphasis' || b.type === 'applause'));
    return builtin.filter(b => !covered(b)).concat(model).sort((a, b) => a.start - b.start);
  }

  /** The whole-clip line of a record, from its shots. */
  function summarise(rec) {
    const shots = rec.shots || [];
    const count = {}; for (const s of shots) count[s.shot] = (count[s.shot] || 0) + (s.end - s.start || 1);
    rec.shot = Object.keys(count).sort((a, b) => count[b] - count[a])[0] || '';
    rec.setting = (shots.find(s => s.setting) || {}).setting || '';
    rec.people = (shots.find(s => s.people && !/^no ?one$/i.test(s.people)) || {}).people || '';
    rec.tags = tagsOf([].concat(...shots.map(s => s.tags))).slice(0, 12);
    rec.summary = clip(Array.from(new Set(shots.map(s => s.text))).slice(0, 3).join(' '), 320);
    return rec;
  }
  const soundLine = s => `${SOUND_WORDS[s.type] || s.type}${s.text ? ` (${s.text})` : ''}`;
  /** What a stretch of a clip shows and sounds like, as a sentence or two (null when nothing is known about it). */
  function describeRange(rec, start, end) {
    if (!rec) return null;
    const a = Math.max(0, num(start, 0)), b = end == null || !isFinite(+end) ? Infinity : +end, over = (s, e) => Math.min(e, b) - Math.max(s, a) > 0 || (s >= a && s <= b);
    const shots = (rec.shots || []).filter(s => over(s.start, s.end)), events = (rec.events || []).filter(e => e.t >= a - 0.5 && e.t <= b + 0.5), sounds = (rec.sounds || []).filter(s => s.type !== 'silence' && over(s.start, s.end));
    const quiet = (rec.sounds || []).some(s => s.type === 'silence' && s.start <= a + 0.5 && s.end >= Math.min(b, rec.duration || b) - 0.5);
    const bits = [];
    if (shots.length) bits.push(Array.from(new Set(shots.map(s => s.text))).slice(0, 3).join(' '));
    if (events.length) bits.push(events.slice(0, 4).map(e => e.text).join('; ') + '.');
    if (sounds.length) bits.push('Sound: ' + Array.from(new Set(sounds.map(soundLine))).slice(0, 4).join(', ') + '.'); else if (quiet) bits.push('No sound to speak of.');
    if (!bits.length) return null;
    return { text: clip(bits.join(' '), 500), shot: shots[0] ? shots[0].shot : '', tags: tagsOf([].concat(...shots.map(s => s.tags))), sounds: Array.from(new Set(sounds.map(s => s.type))), events: events.map(e => e.text) };
  }

  /* ---------- search ---------- */
  const STOP = new Set('the a an of in on at to and or with for from is are was were it this that these those my our their his her some any all shots shot clip clips footage where when who people person someone'.split(' '));
  const SAME = [['laugh', 'laughter', 'laughing', 'giggle', 'chuckle'], ['clap', 'applause', 'clapping', 'ovation'], ['cheer', 'cheering', 'whoop'], ['music', 'song', 'band', 'piano', 'guitar', 'singing'], ['smile', 'smiling', 'grin'], ['cry', 'crying', 'tears', 'tearful'], ['quiet', 'silence', 'silent'], ['wind', 'windy'], ['kid', 'child', 'children', 'kids'], ['closeup', 'close-up', 'close'], ['drone', 'aerial'], ['sea', 'ocean', 'beach', 'water'], ['car', 'traffic', 'road'], ['crowd', 'audience'], ['hug', 'embrace', 'hugging'], ['wave', 'waving'], ['nod', 'nodding'], ['market', 'stall', 'stalls']];
  const stem = w => { w = w.toLowerCase().replace(/[’']s$/, ''); for (const g of SAME) if (g.includes(w)) return g[0]; return w.length > 4 ? w.replace(/(ing|ed|es|s)$/, '') : w; };
  const words = t => String(t || '').toLowerCase().split(/[^a-z0-9À-ɏ-]+/).filter(Boolean);
  /** Everything searchable in a record, one row per timed thing: [{start, end, text, kind}] */
  function rowsOf(rec) {
    const rows = [], d = rec.duration || 0;
    for (const s of rec.shots || []) rows.push({ start: s.start, end: s.end, kind: 'shot', text: [s.text, s.shot + ' shot', s.setting, s.people, s.tags.join(' ')].filter(Boolean).join('. ') });
    for (const e of rec.events || []) rows.push({ start: Math.max(0, e.t - 2), end: d ? Math.min(d, e.t + 3) : e.t + 3, kind: 'event', text: `${e.text} (${e.kind})` });
    for (const s of rec.sounds || []) rows.push({ start: s.start, end: s.end, kind: 'sound', text: `${soundLine(s)} ${s.type}${s.type === 'laughter' ? ' people laughing' : s.type === 'applause' ? ' people clapping' : ''}` });
    if (rec.tone) rows.push({ start: 0, end: d, kind: 'tone', text: 'Tone of voice: ' + rec.tone });
    return rows;
  }
  /** Search some records. -> [{path, name, start, end, text, kind, score}] best first; score 0..1 */
  function searchRecords(recs, query, { limit = 20 } = {}) {
    const q = Array.from(new Set(words(query).filter(w => !STOP.has(w)).map(stem)));
    if (!q.length) return [];
    const out = [], phrase = String(query || '').toLowerCase().trim();
    for (const rec of recs) {
      const nameW = new Set(words(rec.name).map(stem));
      for (const row of rowsOf(rec)) {
        const have = new Set(words(row.text).map(stem));
        let hit = 0; for (const w of q) if (have.has(w)) hit++; else if (nameW.has(w)) hit += 0.5; else if ([...have].some(x => x.length > 4 && w.length > 4 && (x.indexOf(w) === 0 || w.indexOf(x) === 0))) hit += 0.7;
        if (!hit) continue;
        let score = hit / q.length;
        if (score < 0.5 && q.length > 1) continue;
        if (phrase.length > 4 && row.text.toLowerCase().includes(phrase)) score = Math.min(1, score + 0.15);
        out.push({ path: rec.path, name: rec.name, start: row.start, end: row.end, text: clip(row.text, 240), kind: row.kind, score: Math.round(Math.min(1, score) * 100) / 100 });
      }
    }
    return out.sort((a, b) => b.score - a.score || (a.kind === 'shot' ? -1 : 1) - (b.kind === 'shot' ? -1 : 1) || a.start - b.start).slice(0, limit);
  }

  /* ---------- the digest for an AI that reads text ---------- */
  function digestOf(rec, budget) {
    const head = `${rec.name} (${fmtT(rec.duration)}${rec.shot ? ', ' + rec.shot : ''}${rec.setting ? ', ' + rec.setting : ''})`;
    const shots = (rec.shots || []).map(s => `${fmtT(s.start)}–${fmtT(s.end)} ${s.text}`), events = (rec.events || []).map(e => `${fmtT(e.t)} ${e.text}`), sounds = (rec.sounds || []).filter(s => s.type !== 'silence' || s.end - s.start >= 5).map(s => `${fmtT(s.start)}–${fmtT(s.end)} ${soundLine(s)}`);
    let out = head;
    const add = (label, list) => { for (let i = 0; i < list.length; i++) { const piece = (i ? '; ' : `\n  ${label}: `) + list[i]; if (out.length + piece.length > budget) return; out += piece; } };
    add('seen', shots); add('moments', events); add('heard', sounds);
    if (rec.tone && out.length + rec.tone.length + 12 <= budget) out += `\n  tone: ${rec.tone}`;
    if (rec.sound && rec.sound.label && rec.sound.label !== 'no speech' && rec.sound.label !== 'clean' && out.length + 30 <= budget) out += `\n  sound quality: ${rec.sound.label}`;
    return out.length > budget ? out.slice(0, Math.max(0, budget - 1)) + '…' : out;
  }
  /** Records → one text, at most maxChars: every clip gets a fair share, and clips are dropped (and counted) only when even a line each won't fit. */
  function digest(recs, maxChars = 6000) {
    const HEAD = 'WHAT IS IN THE FOOTAGE (looked at and listened to by Ultra Studio; times are minutes:seconds into each clip):\n';
    if (!recs.length) return '';
    const room = Math.max(0, maxChars - HEAD.length - 40);
    let n = recs.length; while (n > 1 && room / n < 90) n--;
    const per = Math.floor(room / n) - 1, parts = recs.slice(0, n).map(r => digestOf(r, Math.max(60, per)));
    let text = HEAD + parts.join('\n');
    if (n < recs.length) text += `\n(and ${recs.length - n} more clips, not listed)`;
    return text.length > maxChars ? text.slice(0, maxChars - 1) + '…' : text;
  }

  /* ---------- how long, how much (for Settings and the confirmations) ---------- */
  const ASSUME = { listenX: 40, cloudSecPerAsk: [4, 12] };   // used only until this computer has been measured
  /**
   * An honest estimate for some footage. clips: [{duration}] (or {minutes, clips: n}). bench: what was measured on this
   * computer ({listenX, vision: {modelId: secPerStill}}). -> {minutes, clips, stills, local: {...}, cloud: {...}}
   */
  function estimate(input, { bench = {}, visionModel = null, cloud = null, prices = null } = {}) {
    const list = Array.isArray(input) ? input : null;
    const minutes = list ? list.reduce((n, c) => n + (+c.duration || 0), 0) / 60 : +input.minutes || 0;
    const clips = list ? list.length : +input.clips || 0;
    const stills = list ? list.reduce((n, c) => n + visionTimes(c.duration).length, 0) : Math.max(clips, Math.ceil(minutes * 6));
    const secs = minutes * 60;
    // on this computer
    const lx = bench.listenX || 0, measuredV = visionModel && bench.vision && bench.vision[visionModel.id];
    const vRange = measuredV ? [measuredV, measuredV] : visionModel ? visionModel.assume || [2, 15] : null;
    const local = {
      listenSecs: secs / (lx || ASSUME.listenX), listenMeasured: !!lx,
      visionSecs: vRange ? [stills * vRange[0], stills * vRange[1]] : null, visionMeasured: !!measuredV, visionModel: visionModel ? visionModel.name : '',
      usd: 0
    };
    // cloud
    let c = null;
    if (cloud && cloud.provider === 'gemini' && prices) {
      const p = US.ai.mediaPrice(cloud.model), T = prices.tokens, asks = Math.ceil(stills / 6) + Math.ceil(secs / 120);
      const inTok = [stills * T.still[0] + secs * T.audioPerSec[0] + asks * 250, stills * T.still[1] + secs * T.audioPerSec[1] + asks * 400], outTok = [minutes * T.outPerMin[0], minutes * T.outPerMin[1]];
      c = { provider: 'gemini', label: cloud.label, hears: true, usd: [(inTok[0] * p.in + outTok[0] * p.out) / 1e6, (inTok[1] * p.in + outTok[1] * p.out) / 1e6], secs: [asks * ASSUME.cloudSecPerAsk[0] / 3, asks * ASSUME.cloudSecPerAsk[1] / 3], date: prices.date, freeTier: true, megabytes: Math.round(secs * 0.032 + stills * 0.03) };
    } else if (cloud && cloud.provider === 'claude') {
      const m = US.ai.MODELS[cloud.model], asks = Math.ceil(stills / 6), tok = US.ai.imageTokens({ w: 512, h: 288 });
      const inTok = stills * tok + asks * 400, outTok = [minutes * 80, minutes * 200];
      c = { provider: 'claude', label: cloud.label, hears: false, usd: [(inTok * m.in + outTok[0] * m.out) / 1e6, (inTok * m.in + outTok[1] * m.out) / 1e6], secs: [asks * ASSUME.cloudSecPerAsk[0] / 3, asks * ASSUME.cloudSecPerAsk[1] / 3], date: prices ? prices.date : '', freeTier: false, megabytes: Math.round(stills * 0.03) };
    }
    return { minutes, clips, stills, local, cloud: c };
  }

  /* =================== the project's choices =================== */
  const curProject = () => (US.ctx && US.ctx.project && (US.ctx.project.path || US.ctx.project.name)) || '';
  const pstore = () => US.projectStore(curProject() || 'none');
  /** 'local' (on this computer – the default), 'cloud' (only once chosen and confirmed for this project) or 'off'. */
  function route() {
    const r = pstore().get('understand.route') || 'local';
    if (r === 'cloud' && !(US.ai && US.ai.mediaOn && US.ai.mediaOn())) return 'local';   // the consent is kept on this computer; a project kept here never goes
    return r === 'off' || r === 'cloud' ? r : 'local';
  }
  function setRoute(r) {
    pstore().set('understand.route', r === 'cloud' || r === 'off' ? r : 'local');
    if (US.ai && US.ai.setMedia) US.ai.setMedia(r === 'cloud');
    US.bus.emit('understand', status());
    kick();
  }
  /** Who would look and listen right now. vision/listening: {kind, id, label, model} – kind 'none' when nothing can. */
  function plan() {
    const M = US.models, r = route(), out = { route: r, vision: { kind: 'none', id: '', label: '' }, listening: { kind: 'builtin', id: 'builtin', label: 'Built-in listening' }, listenModel: null };
    if (r === 'off') { out.listening = { kind: 'none', id: '', label: '' }; return out; }
    if (r === 'cloud') {
      const C = US.ai.mediaModel();
      if (C.provider !== 'none') { out.vision = { kind: 'cloud', id: 'cloud:' + C.provider + ':' + C.model, label: C.label, cloud: C }; if (C.hears) out.listenModel = { kind: 'cloud', id: 'cloud:' + C.model, label: C.label, chunkSec: 120, max: 30 }; }
      return out;
    }
    const v = String(set('visionModel') || ''), own = US.footage && US.footage.visionModel && US.footage.visionModel();
    const pick = M && M.get(v) && M.installed(v) && M.runtime.installed() ? M.get(v) : null;
    if (pick) out.vision = { kind: 'helper', id: pick.id + '@' + pick.version, label: pick.name, model: pick };
    else if ((v === 'own' || !v) && own) out.vision = { kind: 'own', id: 'own:' + own, label: `${own} (your own model)`, own };
    else out.vision.needsModel = true;
    const l = String(set('listenModel') || 'builtin'), lm = M && l !== 'builtin' && M.get(l) && M.get(l).use.includes('listening') && M.installed(l) && M.runtime.installed() ? M.get(l) : null;
    if (lm) out.listenModel = { kind: 'helper', id: lm.id + '@' + lm.version, label: lm.name, model: lm, chunkSec: lm.chunkSec || 30, max: 20 };
    return out;
  }

  /* =================== records: per media file, and a copy with the project =================== */
  const keyOf = p => US.fsx.mediaKey(p) + '-v' + VERSION;
  const mem = new Map();
  /** The file that travels with the project: "<project> – Footage.json" in its JMG Ultra Studio folder. */
  function sharedFile() {
    const p = curProject();
    if (!p || !/\.prproj$/i.test(p) || !US.fsx.exists(p) || US.settings.get('story.withProject', true) === false) return '';
    try { return US.projectStore.sharedFile(p).replace(/ – Project\.json$/, ' – Footage.json'); } catch (e) { return ''; }
  }
  const travelKey = p => US.basename(p).toLowerCase() + '|' + US.fsx.size(p);
  let shared = null, sharedFor = '';
  function sharedData() { const f = sharedFile(); if (f !== sharedFor) { sharedFor = f; shared = f ? US.fsx.readJSON(f, { v: VERSION, clips: {} }) : null; if (shared && !shared.clips) shared.clips = {}; } return shared; }
  const saveShared = US.debounce(() => { const f = sharedFile(); if (f && shared && f === sharedFor) { try { US.fsx.writeJSON(f, shared); } catch (e) { /* a read-only folder: this computer's copy is enough */ } } }, 1500);
  /** A clip's record as kept (null when there is none). An older “Describe the footage” description stands in for the picture. */
  function peek(p) {
    if (!p) return null;
    const k = keyOf(p);
    if (mem.has(k)) return mem.get(k);
    let rec = null;
    try { rec = US.cache.get('understand', k); } catch (e) { rec = null; }
    if (!rec) { const S = sharedData(), t = S && S.clips[travelKey(p)]; if (t && t.v === VERSION) { rec = Object.assign({}, t, { path: p }); try { US.cache.set('understand', k, rec); } catch (e) { /* kept in memory */ } } }
    if ((!rec || !(rec.shots || []).length) && US.footage && US.footage.lookOf) {
      let look = null; try { look = US.cache.get('look', US.fsx.mediaKey(p) + '-v' + US.footage.VERSION); } catch (e) { look = null; }
      if (look && look.description) {
        const d = (rec && rec.duration) || 0;
        rec = summarise(Object.assign({ v: VERSION, path: p, name: US.basename(p), duration: d, events: [], sounds: [] }, rec || {}, { shots: [{ start: 0, end: d, text: look.description + (look.action ? ' ' + look.action : '') + (look.text ? ` Text: ${look.text}.` : ''), shot: SHOTS.includes(look.shot) ? look.shot : 'other', setting: look.setting || '', people: look.people || '', tags: tagsOf(look.tags) }], fromLook: true }));
        return rec;   // not kept: it follows the description it comes from
      }
    }
    if (rec) mem.set(k, rec);
    return rec;
  }
  function save(item, rec) {
    const k = keyOf(item.path);
    rec.v = VERSION; rec.path = item.path; rec.name = item.name || US.basename(item.path); rec.at = Date.now();
    mem.set(k, rec);
    try { US.cache.set('understand', k, rec); } catch (e) { /* disk full: kept in memory */ }
    const S = sharedData(); if (S) { const copy = Object.assign({}, rec); delete copy.path; S.clips[travelKey(item.path)] = copy; saveShared(); }
    // the project's list of clips it knows about (search and the digest work without asking the editor's app)
    const idx = Object.assign({}, pstore().get('understand.index') || {});
    idx[item.path] = { name: rec.name, duration: rec.duration || item.duration || 0 };
    pstore().set('understand.index', idx);
    return rec;
  }
  /** Which parts of a clip still need doing with the current plan: {vision, listening, listenModel} */
  function needs(rec, P = plan()) {
    const v = rec && rec.vision, l = rec && rec.listening, lm = rec && rec.listenModel;
    return {
      vision: P.vision.kind !== 'none' && !(v && v.done && v.by === P.vision.id),
      listening: P.listening.kind === 'builtin' && !(l && (l.done || l.cant)),
      listenModel: !!P.listenModel && !(lm && lm.done && lm.by === P.listenModel.id)
    };
  }
  const anyNeed = n => n.vision || n.listening || n.listenModel;

  /* =================== the routes: asking a model =================== */
  // tests put stand-ins here
  const routes = {
    async vision(P, req, opts) {
      if (P.vision.kind === 'cloud') return US.ai.media(Object.assign({}, req, { onUsage: opts.onUsage }));
      if (P.vision.kind === 'own') return US.ai.json(Object.assign({}, req, { use: { provider: 'local', model: P.vision.own }, onUsage: opts.onUsage }));
      const url = await US.models.start(P.vision.model.id, { job: opts.job });
      try { return await US.ai.localAt(Object.assign({}, req, { url, model: P.vision.model.id })); } finally { US.models.touch(); }
    },
    async listen(P, req, opts) {
      if (P.listenModel.kind === 'cloud') return US.ai.media(Object.assign({}, req, { onUsage: opts.onUsage }));
      const url = await US.models.start(P.listenModel.model.id, { job: opts.job });
      try { return await US.ai.localAt(Object.assign({}, req, { url, model: P.listenModel.model.id })); } finally { US.models.touch(); }
    },
    grab: (item, times) => US.footage.grab(item, times, { width: 512 }),
    /** A clip's sound, by a route that opens nothing; with heavy (Overnight prep, Run now) the editor's app may render it. */
    async sound(item, { heavy = false, job = null } = {}) {
      try { return await US.audio.fileAudio(item.path, { check: job && job.check ? () => job.check() : null }); }
      catch (e) {
        if (e && e.code === 'CANCELLED') throw e;
        if (!heavy || !item.id) throw e;
        const r = await US.audio.forItem(item, { job });
        return { data: r.data, sr: r.sr || US.audio.SR, duration: r.duration, how: 'render', offset: r.offset || 0 };
      }
    }
  };

  /* =================== doing a clip =================== */
  // what ffmpeg says about a file with no sound track (measured in Premiere on 19 Nov: WhatsApp videos without sound
  // were left “waiting for a render” that could never help)
  const NO_TRACK = /matches no streams|does not contain any stream|no audio stream|no sound track/i;
  /**
   * Do what a clip still needs (or part of it: `keepGoing()` false stops between requests and the rest is picked up
   * next time). -> {rec, did: {vision, listening, listenModel}, more: true when it stopped early, usd, skipped}
   */
  async function analyse(item, { job = null, heavy = false, keepGoing = () => true, force = false, only = null, plan: given = null } = {}) {
    const P = given || plan();   // given: who looks and listens, when the caller has decided (tests)
    let rec = force ? null : peek(item.path);
    if (rec && rec.fromLook) rec = null;
    rec = rec ? Object.assign({}, rec) : { v: VERSION, shots: [], events: [], sounds: [], duration: item.duration || 0 };
    if (!rec.duration && item.duration) rec.duration = item.duration;
    const need = needs(rec, P), did = { vision: false, listening: false, listenModel: false }, out = { rec, did, more: false, usd: 0, paidUsd: 0, skipped: '' };
    const onUsage = u => { out.usd += u.usd || 0; out.paidUsd += u.paidUsd || 0; };
    const want = k => need[k] && (!only || only.includes(k));
    let audio = null;
    const getAudio = async () => audio || (audio = await routes.sound(item, { heavy, job }));

    if (want('listening')) {
      job && job.set && job.set({ who: 'computer', msg: `Listening to ${item.name}` });
      try {
        const a = await getAudio(), ev = await US.dsp.soundEvents(a.data, a.sr, { check: job && job.check ? () => job.check() : null });
        rec.sounds = mergeSounds(builtinSounds(ev), (rec.sounds || []).filter(s => s.by !== 'built-in'));
        rec.sound = Object.assign({}, ev.quality, { speech: ev.speech });
        if (!rec.duration) rec.duration = a.duration;
        rec.listening = { done: true, by: 'builtin', how: a.how, at: Date.now() };
        did.listening = true;
      } catch (e) {
        if (e && e.code === 'CANCELLED') throw e;
        if (NO_TRACK.test(String(e && (e.message || e.detail) || e))) {
          // a clip with no sound at all (a phone video sent without it, a screen recording): nothing to wait for
          rec.listening = { done: true, by: 'builtin', how: 'none', noTrack: true, at: Date.now() };
          rec.sound = { label: 'no sound track', speech: 0 };
          rec.sounds = (rec.sounds || []).filter(s => s.by !== 'built-in');
          did.listening = true;
        } else {
          // can't be read without a render: it waits for Overnight prep (heavy), and isn't tried again every few seconds
          rec.listening = heavy ? { cant: true, why: 'no sound could be read', at: Date.now() } : { waiting: 'render', at: Date.now() };
          out.skipped = 'sound';
        }
      }
      save(item, rec);
    }

    if (want('vision') && keepGoing()) {
      const M = P.vision.model, per = P.vision.kind === 'cloud' ? 6 : (M && M.stillsPerAsk) || 2;
      const times = visionTimes(rec.duration || item.duration), span = (rec.duration || item.duration || 10) / times.length;
      let v = rec.vision && rec.vision.by === P.vision.id && !rec.vision.done ? rec.vision : { by: P.vision.id, next: 0, total: times.length };
      if (v.next === 0) { rec.shots = []; rec.events = []; }
      while (v.next < times.length) {
        if (!keepGoing()) { out.more = true; break; }
        job && job.check && job.check();
        const batch = times.slice(v.next, v.next + per);
        job && job.set && job.set({ who: P.vision.kind === 'cloud' ? 'ai' : 'computer', msg: `Looking at ${item.name}${times.length > per ? ` · ${fmtT(batch[0])} of ${fmtT(rec.duration)}` : ''}` });
        const g = await routes.grab(item, batch);
        if (!g.stills.length) { rec.vision = { by: P.vision.id, cant: true, why: g.why || 'can’t be read', at: Date.now() }; out.skipped = out.skipped || 'picture'; v = null; break; }
        const t0 = Date.now();
        const r = await routes.vision(P, visionRequest(item, g.stills), { job, onUsage });
        if (P.vision.kind === 'helper') noteSpeed(M.id, (Date.now() - t0) / 1000 / g.stills.length);
        const t = tidyVision(r, g.stills.map(s => s.t), rec.duration, span);
        rec.shots = rec.shots.concat(t.shots); rec.events = rec.events.concat(t.events);
        v = { by: P.vision.id, next: v.next + batch.length, total: times.length };
        rec.vision = v; save(item, rec);
      }
      if (v && v.next >= times.length) {
        rec.shots = mergeShots(rec.shots); summarise(rec);
        rec.vision = { by: P.vision.id, label: P.vision.label, done: true, stills: times.length, at: Date.now() };
        did.vision = true; save(item, rec);
      } else if (!v) save(item, rec);
    } else if (want('vision')) out.more = true;

    if (want('listenModel') && !out.more) {
      if (!keepGoing()) out.more = true;
      else {
        try {
          const a = await getAudio(), L = P.listenModel, chunks = listenChunks(a.duration, { chunk: L.chunkSec, max: L.max });
          const found = []; const tones = [];
          for (const c of chunks) {
            if (!keepGoing()) { out.more = true; break; }
            job && job.check && job.check();
            job && job.set && job.set({ who: L.kind === 'cloud' ? 'ai' : 'computer', msg: `${L.label} is listening to ${item.name} · ${fmtT(c.start)}` });
            const wav = US.audio.wavBytes(a.data.subarray(Math.floor(c.start * a.sr), Math.floor(c.end * a.sr)), a.sr);
            const t = tidyListen(await routes.listen(P, listenRequest(item, c, wav.toString('base64'), wav.length), { job, onUsage }), c, L.label);
            found.push(...t.sounds); if (t.tone) tones.push(t.tone);
          }
          if (!out.more) {
            rec.sounds = mergeSounds((rec.sounds || []).filter(s => s.by === 'built-in'), found);
            rec.tone = clip(Array.from(new Set(tones)).slice(0, 3).join('; '), 160);
            rec.listenModel = { done: true, by: L.id, label: L.label, pieces: chunks.length, partial: chunks.length * L.chunkSec < a.duration - 1, at: Date.now() };
            did.listenModel = true; save(item, rec);
          }
        } catch (e) {
          if (e && (e.code === 'CANCELLED' || e instanceof US.UserError)) throw e;
          rec.listenModel = { by: P.listenModel.id, waiting: 'render', at: Date.now() }; out.skipped = out.skipped || 'sound'; save(item, rec);
        }
      }
    }
    return out;
  }

  /* ---------- measured speed on this computer ---------- */
  function bench() { return Object.assign({ vision: {} }, US.settings.get('understand.bench', {})); }
  function noteSpeed(modelId, secPerStill) {
    const b = bench(), old = b.vision[modelId];
    b.vision = Object.assign({}, b.vision, { [modelId]: Math.round((old ? old * 0.7 + secPerStill * 0.3 : secPerStill) * 100) / 100 }); b.at = Date.now();
    US.settings.set('understand.bench', b);
  }
  /** A quick measurement: the built-in listener on 20 seconds of test sound, and – when a vision model is here – one test still. */
  async function benchmark(job) {
    const sr = 16000, n = sr * 20, data = new Float32Array(n);
    for (let i = 0; i < n; i++) data[i] = (Math.sin(i * 0.05) * 0.2 + (Math.random() - 0.5) * 0.1) * (0.5 + 0.5 * Math.sin(i / sr * 6));
    job && job.set && job.set({ who: 'computer', msg: 'Measuring how fast this computer listens' });
    const t0 = performance.now(); await US.dsp.soundEvents(data, sr);
    const b = bench(); b.listenX = Math.round(20 / Math.max(0.01, (performance.now() - t0) / 1000)); b.at = Date.now();
    US.settings.set('understand.bench', b);
    const P = plan();
    if (P.vision.kind === 'helper' && typeof document !== 'undefined' && document.createElement('canvas').getContext) {
      job && job.set && job.set({ who: 'computer', msg: `Measuring how fast ${P.vision.label} looks at a still` });
      const cv = document.createElement('canvas'); cv.width = 512; cv.height = 288;
      const g = cv.getContext('2d'); const gr = g.createLinearGradient(0, 0, 512, 288); gr.addColorStop(0, '#2a4d7a'); gr.addColorStop(1, '#d9a441'); g.fillStyle = gr; g.fillRect(0, 0, 512, 288); g.fillStyle = '#fff'; g.beginPath(); g.arc(380, 90, 40, 0, 7); g.fill();
      const still = { t: 0, data: cv.toDataURL('image/jpeg', 0.72).split(',')[1], w: 512, h: 288 };
      await routes.vision(P, visionRequest({ name: 'test still', duration: 5 }, [still]), { job });   // the first answer includes loading the model
      const t1 = performance.now(); await routes.vision(P, visionRequest({ name: 'test still', duration: 5 }, [still]), { job });
      const b2 = bench(); b2.vision = Object.assign({}, b2.vision, { [P.vision.model.id]: Math.round((performance.now() - t1) / 10) / 100 }); US.settings.set('understand.bench', b2);
    }
    return { summary: `Listening: ${bench().listenX}× real time${P.vision.kind === 'helper' && bench().vision[P.vision.model.id] ? ` · looking: ${bench().vision[P.vision.model.id]} s a still with ${P.vision.label}` : ''}`, bench: bench() };
  }

  /* =================== is the computer calm? =================== */
  const load = { lag: 0, cpu: 0, last: null, battery: null, timer: null };
  function cpuNow() { let idle = 0, total = 0; for (const c of os.cpus()) { for (const k in c.times) total += c.times[k]; idle += c.times.idle; } return { idle, total }; }
  function sampleLoad() {
    const now = cpuNow();
    if (load.last) { const dt = now.total - load.last.total; if (dt > 0) load.cpu = load.cpu * 0.5 + (1 - (now.idle - load.last.idle) / dt) * 0.5; }
    load.last = now;
    const t0 = Date.now(); setTimeout(() => { load.lag = load.lag * 0.6 + Math.max(0, Date.now() - t0 - 50) * 0.4; }, 50);
    try { if (typeof navigator !== 'undefined' && navigator.getBattery) navigator.getBattery().then(b => { load.battery = { charging: b.charging, level: b.level }; }).catch(() => {}); } catch (e) { /* no battery to ask */ }
  }
  /**
   * May background work run now? -> {ok, why}. Busy means: a job is running (an export, an analysis, Media Encoder),
   * the processor is loaded (playback, a render), the panel is slow to respond, or the battery is low and unplugged.
   * `m` (tests): {job, cpu, lag, load1, cores, battery}
   */
  function calm(m = {}) {
    const job = 'job' in m ? m.job : US.jobs.current, cpu = 'cpu' in m ? m.cpu : load.cpu, lag = 'lag' in m ? m.lag : load.lag;
    const cores = m.cores || os.cpus().length || 4, l1 = 'load1' in m ? m.load1 : os.loadavg()[0], bat = 'battery' in m ? m.battery : load.battery;
    if (job) return { ok: false, why: `“${job.title || 'a job'}” is running` };
    if (cpu > 0.6) return { ok: false, why: `the computer is busy (processor at ${Math.round(cpu * 100)}%)` };
    if (l1 / cores > 0.9) return { ok: false, why: 'the computer is busy' };
    if (lag > 120) return { ok: false, why: 'the editor is busy (the panel is slow to respond)' };
    if (bat && !bat.charging && bat.level < 0.3) return { ok: false, why: `the battery is at ${Math.round(bat.level * 100)}% and not charging` };
    return { ok: true, why: '' };
  }

  /* =================== the queue =================== */
  const HEAVY_SECS = 20 * 60;   // model work beyond this isn't started in the background unless the editor says so
  const Q = { items: [], project: '', listed: false, listing: false, state: 'idle', why: '', running: false, timer: null, last: null, failed: 0, lastError: '' };
  const retried = new Set();   // clips whose sound waited for a render, tried once more this session
  let held = 0;   // pause(): background work waits until every hold is released (e2e tests, nothing persistent)
  const backgroundOn = () => set('background') !== false;
  const heavyInBackground = () => set('heavyInBackground') === true;
  /** Clips of the open project (once per project, when calm). */
  async function listProject() {
    if (Q.listing) return; Q.listing = true;
    try {
      const F = US.footage, items = F.describable(await F.listClips(null)).filter(it => it.kind !== 'still' && !/\.(png|jpe?g|tiff?|bmp|gif|webp|heic)$/i.test(it.path || ''));
      Q.items = items.map(it => ({ id: it.id, path: it.path, name: it.name, duration: it.duration || 0, kind: it.kind }));
      Q.listed = true; Q.project = curProject();
      pstore().set('understand.footage', { clips: Q.items.length, minutes: Math.round(Q.items.reduce((n, c) => n + c.duration, 0) / 6) / 10, at: Date.now() });
    } catch (e) { US.log('info', 'Understanding: the project’s footage couldn’t be listed yet', String(e && (e.detail || e.message) || e), 'understand'); }
    finally { Q.listing = false; }
  }
  /** What's left: [{item, need}] and how long the model work would take here. */
  function backlog(P = plan()) {
    const todo = [];
    for (const it of Q.items) { const n = needs(peek(it.path), P), r = peek(it.path); if (r && r.vision && r.vision.cant && r.vision.by === P.vision.id) n.vision = false; if (r && r.listening && r.listening.waiting) { if (retried.has(it.path)) n.listeningWaits = true; else n.retry = true; } if (r && r.listenModel && r.listenModel.waiting) n.listenModel = false; if (anyNeed(n)) todo.push({ item: it, need: n }); }
    const vis = todo.filter(t => t.need.vision).map(t => t.item);
    const e = estimate(vis, { bench: bench(), visionModel: P.vision.model || (P.vision.kind === 'own' ? { id: P.vision.id, name: P.vision.label, assume: [2, 15] } : null) });
    const visionSecs = e.local.visionSecs ? (e.local.visionSecs[0] + e.local.visionSecs[1]) / 2 : 0;
    return { todo, vision: vis.length, listening: todo.filter(t => t.need.listening && !t.need.listeningWaits).length, waitsForRender: todo.filter(t => t.need.listeningWaits).length, listenModel: todo.filter(t => t.need.listenModel).length, visionSecs, visionRange: e.local.visionSecs, stills: e.stills };
  }
  /**
   * Where things stand, in plain words. -> {enabled, route, state, text, note, total, done, waiting, minutesLeft,
   * vision, listening, offers: ['overnight', 'now', 'settings']}
   * state: 'off' | 'no-project' | 'starting' | 'up-to-date' | 'working' | 'paused' | 'scheduled' | 'needs-model' | 'cloud-waiting'
   */
  function status() {
    const P = plan(), base = { enabled: P.route !== 'off', route: P.route, vision: P.vision.label, listening: P.listenModel ? `${P.listening.label} + ${P.listenModel.label}` : P.listening.label, total: Q.items.length, done: 0, waiting: 0, minutesLeft: 0, offers: [], note: '', why: Q.why };
    if (P.route === 'off') return Object.assign(base, { state: 'off', text: 'Seeing and hearing is off for this project' });
    if (!curProject()) return Object.assign(base, { state: 'no-project', text: 'No project open' });
    if (!Q.listed || Q.project !== curProject()) return Object.assign(base, { state: 'starting', text: backgroundOn() ? 'Waiting for a quiet moment to look through the project' : 'Background work is switched off', offers: ['now'] });
    const B = backlog(P);
    base.waiting = B.todo.length; base.done = Q.items.length - B.todo.length; base.minutesLeft = Math.round(B.visionSecs / 60);
    const range = B.visionRange ? `${US.fmtDur(B.visionRange[0])}–${US.fmtDur(B.visionRange[1])}` : '';
    const NEED = 'Listening is built in. To see what’s in the shots, download a vision model – or choose Cloud – in Settings › Vision & listening models.';
    if (!B.todo.length && P.vision.kind === 'none') return Object.assign(base, { state: 'needs-model', text: `Listened to all ${US.plural(Q.items.length, 'clip')} · nothing here can look at footage yet`, note: NEED, offers: ['settings'] });
    if (!B.todo.length) return Object.assign(base, { state: 'up-to-date', text: `All ${US.plural(Q.items.length, 'clip')} looked at and listened to` });
    if (Q.running) return Object.assign(base, { state: 'working', text: `Understanding the footage · ${base.done} of ${Q.items.length} clips`, note: Q.last ? `Now: ${Q.last}` : '' });
    if (P.route === 'cloud') return Object.assign(base, { state: 'cloud-waiting', text: `${US.plural(B.todo.length, 'clip')} waiting for the cloud`, note: `Sending footage costs money, so it isn’t done behind your back. ${P.vision.label} will look at ${US.plural(B.vision, 'clip')}${B.listenModel ? ' and listen to ' + B.listenModel : ''} when you press Run now, or in Overnight prep within the limit you set.`, offers: ['now', 'overnight'] });
    if (P.vision.needsModel && !B.listening && !B.listenModel) return Object.assign(base, { state: 'needs-model', text: `Listened to ${base.total - B.waitsForRender} of ${base.total} clips · nothing here can look at footage yet`, note: NEED + (B.waitsForRender ? ` ${US.plural(B.waitsForRender, 'clip')} couldn’t be listened to without a render: Overnight prep does those.` : ''), offers: ['settings'].concat(B.waitsForRender ? ['overnight'] : []) });
    const heavy = B.visionSecs > HEAVY_SECS && !heavyInBackground();
    if (!B.listening && !B.listenModel && (!B.vision || P.vision.kind === 'none') && B.waitsForRender) return Object.assign(base, { state: 'scheduled', text: `${US.plural(B.waitsForRender, 'clip')} can’t be listened to without a render`, note: `Their sound can’t be read here directly (no ffmpeg on this computer, and the panel can’t decode them), and nothing is rendered behind your back. Overnight prep does it, or run it now.`, offers: ['overnight', 'now'] });
    if (heavy && !B.listening) return Object.assign(base, { state: 'scheduled', text: `${US.plural(B.vision, 'clip')} waiting to be looked at – too much to do while you edit`, note: `${P.vision.label} would need about ${range} of this computer’s full attention (${B.stills} stills${bench().vision[(P.vision.model || {}).id] ? ', measured here' : ', an estimate – not yet measured here'}), which would slow ${US.app ? US.app.name : 'the editor'}. It’s scheduled rather than started: add it to Overnight prep, or run it now anyway.`, offers: ['overnight', 'now'] });
    const c = calm();
    if (!backgroundOn()) return Object.assign(base, { state: 'paused', text: `${US.plural(B.todo.length, 'clip')} waiting · background work is switched off`, offers: ['now', 'overnight'] });
    if (!c.ok) return Object.assign(base, { state: 'paused', text: `${US.plural(B.todo.length, 'clip')} waiting · paused while ${c.why}`, note: 'It carries on by itself when things are quiet.', offers: ['overnight'] });
    return Object.assign(base, { state: 'working', text: `Understanding the footage in the background · ${base.done} of ${Q.items.length} clips`, note: heavy ? `Listening now; looking at the shots (${range}) is scheduled – Overnight prep or Run now.` : '', offers: heavy ? ['overnight', 'now'] : [] });
  }
  /** One small slice of background work, if the computer is calm. -> true when something was done */
  async function tick() {
    if (Q.running || held > 0 || !backgroundOn() || !curProject() || !US.footage) return false;
    const P = plan();
    if (P.route === 'off') return false;
    if (Q.project !== curProject()) { Q.items = []; Q.listed = false; Q.failed = 0; }
    if (!calm().ok) { Q.why = calm().why; return false; }
    Q.running = true;
    try {
      if (!Q.listed) { await listProject(); US.bus.emit('understand', status()); return true; }
      if (P.route === 'cloud') return false;   // never behind the editor's back: Run now or Overnight prep
      if (Q.failed >= 3) return false;          // something is wrong (a model that won't start…): wait to be asked
      const B = backlog(P), heavy = B.visionSecs > HEAVY_SECS && !heavyInBackground();
      const next = B.todo.find(t => t.need.listening && !t.need.listeningWaits) || (!heavy && B.todo.find(t => t.need.vision)) || (!heavy && B.todo.find(t => t.need.listenModel));
      if (!next) return false;
      Q.last = next.item.name;
      if (next.need.retry) retried.add(next.item.path);
      US.bus.emit('understand', status());
      const only = next.need.listening && !next.need.listeningWaits ? ['listening'] : next.need.vision ? ['vision'] : ['listenModel'];
      const t0 = Date.now();
      // a slice: stop between requests after ~25 s, or as soon as the computer is no longer calm
      await analyse(next.item, { only, keepGoing: () => Date.now() - t0 < 25000 && calm().ok });
      Q.failed = 0;
      return true;
    } catch (e) {
      Q.failed++; Q.lastError = (US.errors && US.errors.explain(e).title) || String(e && e.message || e);
      US.log('info', 'Understanding (background): ' + Q.lastError, (US.errors && US.errors.explain(e).detail) || '', 'understand');
      return false;
    } finally { Q.running = false; US.bus.emit('understand', status()); }
  }
  function schedule(ms) { clearTimeout(Q.timer); Q.timer = setTimeout(async () => { let did = false; try { sampleLoad(); did = await tick(); } catch (e) { /* next time */ } schedule(did ? 4000 : 20000); }, ms); if (Q.timer && Q.timer.unref) Q.timer.unref(); }
  let started = false;   // the background starts once the panel is up (US.bus 'ready'), never in the unit tests
  function kick() { if (started) schedule(3000); }
  /**
   * Do everything that's waiting, as a job (Run now, Overnight prep). heavy: the editor's app may render sound that
   * can't be read otherwise. -> {summary, done, failed, skipped, usd}
   */
  async function runAll(job, { heavy = true, items = null, force = false } = {}) {
    const P = plan();
    if (P.route === 'off') throw new US.UserError('NOTHING_FOUND', { title: 'Seeing and hearing is off for this project.', action: 'Switch it on in Settings › Vision & listening models.' });
    if (!items) { if (!Q.listed || Q.project !== curProject()) await listProject(); items = Q.items; }
    if (!items.length) throw new US.UserError('NOTHING_FOUND', { title: 'There’s no footage in this project yet.' });
    const todo = force ? items.slice() : items.filter(it => { const r = peek(it.path), n = needs(r, P); if (heavy && r && r.listening && r.listening.waiting) n.listening = true; return anyNeed(n); });
    const out = { done: 0, failed: 0, skipped: 0, usd: 0, paidUsd: 0, already: items.length - todo.length };
    let firstError = null;
    Q.running = true;
    try {
      for (let i = 0; i < todo.length; i++) {
        job.check();
        job.progress(i / todo.length, `${i + 1} of ${todo.length}: ${todo[i].name}`);
        Q.last = todo[i].name;
        try {
          if (heavy) { const r = peek(todo[i].path); if (r && r.listening && r.listening.waiting) { const c = Object.assign({}, r); delete c.listening; mem.set(keyOf(todo[i].path), c); try { US.cache.set('understand', keyOf(todo[i].path), c); } catch (e) { /* memory */ } } }
          const r = await analyse(todo[i], { job, heavy, force });
          out.usd += r.usd; out.paidUsd += r.paidUsd; if (r.skipped) out.skipped++; out.done++;
        } catch (e) {
          if (e instanceof US.UserError && e.code === 'CANCELLED') throw e;
          out.failed++; firstError = firstError || e;
          if (out.failed >= 3 && !out.done) break;   // a key, the model, the connection: the rest would fail the same way
        }
      }
    } finally { Q.running = false; Q.failed = 0; US.bus.emit('understand', status()); }
    if (!out.done && firstError) throw firstError;
    const bits = [`${US.plural(out.done, 'clip')} looked at and listened to`];
    if (P.vision.kind === 'none') bits[0] = `${US.plural(out.done, 'clip')} listened to (no vision model yet)`;
    if (out.already) bits.push(`${out.already} already done`);
    if (out.skipped) bits.push(`${out.skipped} only partly (couldn’t be read)`);
    if (out.failed) bits.push(`${out.failed} didn’t work`);
    if (out.paidUsd > 0.004) bits.push(`about ${US.ai.fmtUSD(out.paidUsd)} at Google’s paid rate (nothing within the free allowance)`); else if (out.usd > 0.004) bits.push(`about ${US.ai.fmtUSD(out.usd)}`);
    return Object.assign(out, { summary: bits.join(' · ') });
  }

  /* =================== watching a moment for Ask =================== */
  const ASK_SCHEMA = { type: 'object', additionalProperties: false, required: ['answer'], properties: { answer: { type: 'string' } } };
  async function itemFor(o) {
    const it = o.item || {};
    if (it.path) return { id: it.id || o.itemId, path: it.path, name: it.name || US.basename(it.path), duration: it.duration || 0 };
    const id = o.itemId || it.id;
    if (!id) return null;
    try { const [x] = await US.host.call('itemsInfo', { ids: [id] }); return x && x.path ? { id, path: x.path, name: x.name || it.name || US.basename(x.path), duration: x.duration || 0 } : null; } catch (e) { return null; }
  }
  /**
   * Watch and listen to a clip (or a moment of it) now, and answer: what the record says, made first if it's missing,
   * and – with a question and something that can look – the question asked about stills of that moment.
   * -> {text, usd, where} (text says plainly what couldn't be done)
   */
  async function watch(o) {
    const job = o.job || null, item = await itemFor(o);
    if (!item) return { text: 'That clip’s media file couldn’t be found, so it couldn’t be watched.', usd: 0 };
    const pl = plan(), out = { text: '', usd: 0, paidUsd: 0, where: pl.route === 'cloud' ? 'cloud' : 'local' };
    if (pl.route === 'off') return Object.assign(out, { text: 'Seeing and hearing is switched off for this project (Settings › Vision & listening models).' });
    const from = Math.max(0, +o.from || 0), to = +o.to > from ? +o.to : null;
    // what is still missing for this clip, done now (the sound may need the editor's app to render it: they asked)
    const r0 = await analyse(item, { job, heavy: true });
    out.usd += r0.usd; out.paidUsd += r0.paidUsd;
    const rec = peek(item.path), d = describeRange(rec, from, to);
    let answer = '';
    if (o.question && pl.vision.kind !== 'none') {
      const dur = (rec && rec.duration) || item.duration || 0, a = from, b = to != null ? to : dur || from + 10;
      const n = Math.max(1, Math.min(4, Math.ceil((b - a) / 3))), times = Array.from({ length: n }, (_, i) => Math.round((a + (b - a) * (i + 0.5) / n) * 100) / 100);
      job && job.set && job.set({ who: pl.vision.kind === 'cloud' ? 'ai' : 'computer', msg: `Looking at ${item.name} ${fmtT(a)}–${fmtT(b)}` });
      const g = await routes.grab(item, times);
      if (g.stills.length) {
        const req = visionRequest(item, g.stills);
        req.system = 'You look at small stills of a moment of ONE clip, in time order, and answer a video editor’s question from what they show – a look, a gesture, who is in frame, what happens. Be specific and brief. Say when the stills don’t show enough to tell. Never guess names or places that aren’t visible. British English.';
        req.user = req.user.concat([`What was heard and seen around then, from earlier listening: ${d ? d.text : 'nothing noted'}`, `The editor asks: “${String(o.question).trim()}”`]);
        req.schema = ASK_SCHEMA; req.maxTokens = 1000; req.feature = 'Watching footage';
        try { const r = await routes.vision(pl, req, { job, onUsage: u => { out.usd += u.usd || 0; out.paidUsd += u.paidUsd || 0; } }); answer = clip(r && r.answer, 800); }
        catch (e) { if (e && e.code === 'CANCELLED') throw e; answer = ''; out.note = (US.errors && US.errors.explain(e).title) || String(e && e.message || e); }
      }
    }
    const bits = [];
    if (answer) bits.push(answer);
    if (d) bits.push((answer ? 'Also noted: ' : '') + d.text);
    if (pl.vision.kind === 'none') bits.push('(Only listened to – nothing on this computer can look at footage yet: Settings › Vision & listening models.)');
    if (out.note) bits.push(`(Looking didn’t work: ${out.note})`);
    out.text = bits.join(' ') || 'Nothing could be seen or heard there (the clip may not be readable without a copy).';
    return out;
  }

  /* =================== the public API =================== */
  const known = () => Object.keys(pstore().get('understand.index') || {}).concat(Q.items.map(i => i.path)).filter((p, i, a) => a.indexOf(p) === i);
  async function pathsOfSequence(seq) {
    try {
      const id = seq === true || seq === 'active' ? (US.ctx && US.ctx.sequence && US.ctx.sequence.id) : (seq && seq.id) || seq;
      if (!id) return null;
      const u = await US.host.call('selectsSequenceUses', { seqId: id, allTracks: true });
      const ids = Array.from(new Set((u.uses || []).map(x => x.itemId)));
      const info = ids.length ? await US.host.call('itemsInfo', { ids }) : [];
      return info.map(x => x && x.path).filter(Boolean);
    } catch (e) { return null; }
  }

  US.understand = {
    VERSION, SHOTS, SOUND_TYPES, SOUND_WORDS,
    /**
     * What a stretch of a clip shows and sounds like: {text, shot, tags, sounds, events}, or null when it isn't known
     * yet (the clip then goes to the front of the background queue). Never starts heavy work itself.
     */
    async describe(o = {}) {
      // Ask's “watch” tool: {item, itemId, from, to, question, job} – it has asked the editor, so the work is done now
      if (o.job || o.question || o.item || o.itemId) return watch(o);
      const { path: p, start = 0, end = null } = o;
      const rec = peek(p), d = describeRange(rec, start, end);
      if (!d && p && route() !== 'off') { const i = Q.items.findIndex(x => x.path === p); if (i > 0) Q.items.unshift(Q.items.splice(i, 1)[0]); else if (i < 0 && US.fsx.exists(p)) Q.items.unshift({ path: p, name: US.basename(p), duration: (rec && rec.duration) || 0 }); kick(); }
      return d;
    },
    /** A clip's record as kept – no work is done: {name, duration, summary, shot, setting, people, tags, shots, events, sounds, sound, tone} or null. */
    async forClip(p) { return peek(p); },
    /** The same, at once (for drawing a list). */
    peek,
    /** Find moments by what is seen or heard: [{path, name, start, end, text, kind, score}], best first. */
    async search(query, { limit = 20, paths = null } = {}) { return searchRecords((paths || known()).map(peek).filter(Boolean), query, { limit }); },
    status,
    /** Where looking and listening happen for the open project: {where: 'cloud'|'local'|'off', label} (Ask's footage warning). */
    where() { const pl = plan(); return { where: pl.route === 'cloud' ? 'cloud' : pl.route === 'off' ? 'off' : 'local', label: pl.vision.label || (pl.listenModel && pl.listenModel.label) || pl.listening.label || '' }; },
    /**
     * A short text of what's in the footage, for the prompt of an AI that only reads text (Ask, Producer, Story):
     * paths: these clips; sequence: true (the open one) or its id; neither: everything known in the project. '' when nothing is known.
     */
    async context({ paths = null, sequence = null, maxChars = 6000 } = {}) {
      if (!paths && !known().length) return '';   // nothing known: nothing to say, and the editor isn't asked anything
      let list = paths || (sequence ? await pathsOfSequence(sequence) : null) || known();
      return digest(list.map(peek).filter(Boolean), maxChars);
    },
    /* the rest is for Settings, Selects, Overnight prep and the tests */
    plan, route, setRoute, needs, analyse, runAll, benchmark, bench, estimate, calm, tick, kick, backlog, listProject, describeRange, searchRecords, digest,
    backgroundOn, queue: Q, routes,
    /** Footage in the open project as last counted: {clips, minutes, at} or null. */
    footage: () => pstore().get('understand.footage') || null,
    /**
     * Hold the background queue (it finishes the request in hand first). -> release(); waits for that request to end.
     */
    async pause({ waitMs = 120000 } = {}) {
      held++; let done = false;
      const t0 = Date.now(); while (Q.running && Date.now() - t0 < waitMs) await new Promise(r => setTimeout(r, 200));
      return () => { if (!done) { done = true; held = Math.max(0, held - 1); kick(); } };
    },
    /** Everything kept about one clip, taken away: -> what was there (give it to unforget() to put it back). */
    forget(p) {
      const k = keyOf(p), saved = { path: p, cache: null, shared: null, index: null };
      try { saved.cache = US.cache.get('understand', k); } catch (e) { saved.cache = null; }
      try { require('fs').unlinkSync(US.cache.file('understand', k)); } catch (e) { /* not there */ }
      mem.delete(k);
      const S = sharedData(); if (S && S.clips[travelKey(p)]) { saved.shared = S.clips[travelKey(p)]; delete S.clips[travelKey(p)]; saveShared(); }
      const idx = Object.assign({}, pstore().get('understand.index') || {}); if (idx[p]) { saved.index = idx[p]; delete idx[p]; pstore().set('understand.index', idx); }
      return saved;
    },
    unforget(saved) {
      if (!saved || !saved.path) return;
      const p = saved.path, k = keyOf(p);
      mem.delete(k);
      try { if (saved.cache) US.cache.set('understand', k, saved.cache); else require('fs').unlinkSync(US.cache.file('understand', k)); } catch (e) { /* gone */ }
      const S = sharedData(); if (S) { if (saved.shared) S.clips[travelKey(p)] = saved.shared; else delete S.clips[travelKey(p)]; saveShared(); }
      const idx = Object.assign({}, pstore().get('understand.index') || {}); if (saved.index) idx[p] = saved.index; else delete idx[p]; pstore().set('understand.index', idx);
    },
    /** What is kept for the open project, for a look by hand: [{name, path, duration, at, seen, heard, sounds, quality, by}] */
    kept() {
      return known().map(p => { const r = peek(p); if (!r) return { path: p, name: US.basename(p), kept: false };
        return { name: r.name, path: p, duration: Math.round(r.duration || 0), at: r.at ? new Date(r.at).toISOString() : '', fromLook: !!r.fromLook,
          seen: r.vision ? (r.vision.done ? `done by ${r.vision.label || r.vision.by}` : r.vision.cant ? 'can’t be read: ' + r.vision.why : `part done (${r.vision.next}/${r.vision.total})`) : (r.shots || []).length ? 'from an older description' : 'not looked at',
          heard: r.listening ? (r.listening.done ? `built-in, read via ${r.listening.how}` : r.listening.waiting ? 'waiting: its sound needs a render' : 'couldn’t be read') : 'not listened to',
          listenModel: r.listenModel ? (r.listenModel.done ? 'done by ' + r.listenModel.label : 'waiting') : '',
          sounds: (r.sounds || []).map(s => `${s.type} ${fmtT(s.start)}–${fmtT(s.end)}`), quality: r.sound ? r.sound.label : '' }; });
    },
    /** Forget what's kept in memory (tests; after models change). */
    reset() { mem.clear(); shared = null; sharedFor = ''; Q.items = []; Q.listed = false; Q.project = ''; Q.failed = 0; },
    _pure: { visionTimes, listenChunks, visionRequest, tidyVision, mergeShots, listenRequest, tidyListen, builtinSounds, mergeSounds, summarise, rowsOf, digestOf, VSCHEMA, ASCHEMA, keyOf, sharedFile, travelKey, HEAVY_SECS }
  };

  /* =================== US.listen: speech to words on this computer (Ask's dictation) =================== */
  // The listening model (Gemma 4 via the helper) hears speech; nothing is sent anywhere. No model: a plain message –
  // except in Resolve, where `transcribe` is left out so dictation uses Resolve's own transcription instead.
  const listenModelHere = () => { const M = US.models; if (!M) return null; const want = String(set('listenModel') || ''); const ok = m => m && m.use.includes('listening') && M.installed(m.id) && M.runtime.installed(); return ok(M.get(want)) ? M.get(want) : M.list().find(ok) || null; };
  const TSCHEMA = { type: 'object', additionalProperties: false, required: ['text'], properties: { text: { type: 'string' } } };
  async function transcribe({ path: file = '', samples = null, sampleRate = 16000, job = null } = {}) {
    const m = listenModelHere();
    if (!m) throw new US.UserError('NOTHING_FOUND', { title: 'Dictation needs a listening model on this computer.', action: 'Settings › Vision & listening models: download Gemma 4 E2B (it listens as well as looks). Your speech is never sent anywhere.' });
    let data = samples, sr = sampleRate;
    if (!data && file) { const a = await US.audio.readWav(file, { targetRate: 16000 }); data = a.data; sr = a.sr || 16000; }
    if (!data || !data.length) throw new US.UserError('NOTHING_FOUND', { title: 'Nothing was heard.' });
    const url = await US.models.start(m.id, { job }), parts = [];
    try {
      for (let s = 0; s < data.length; s += sr * 30) {   // the model listens 30 seconds at a time
        job && job.check && job.check();
        const wav = US.audio.wavBytes(data.subarray(s, Math.min(data.length, s + sr * 30)), sr);
        const r = await US.ai.localAt({ url, model: m.id, temperature: 0, schema: TSCHEMA, maxTokens: 800, feature: 'Dictation',
          system: 'Write down exactly what is said in the recording, in the language spoken, with normal punctuation. Only the words – no comments. If nothing is said, answer with empty text.',
          user: ['The recording:', { media: { kind: 'audio', data: wav.toString('base64'), mime: 'audio/wav', bytes: wav.length, seconds: wav.length / 2 / sr, note: 'dictation' } }] });
        if (r && r.text) parts.push(String(r.text).trim());
      }
    } finally { US.models.touch(); }
    return { text: parts.join(' ').replace(/\s+/g, ' ').trim(), by: m.name };
  }
  US.listen = { label: () => { const m = listenModelHere(); return m ? `${m.name} on this computer` : 'a listening model on this computer'; }, available: () => !!listenModelHere() };
  Object.defineProperty(US.listen, 'transcribe', { enumerable: true, get: () => (US.app && US.app.is && US.app.is('resolve') && !listenModelHere() ? undefined : transcribe) });

  // the background queue starts by itself, quietly, and follows the open project
  US.bus.on('context', () => { if (Q.project && Q.project !== curProject()) { Q.items = []; Q.listed = false; } kick(); });
  US.bus.on('models', () => { Q.failed = 0; US.bus.emit('understand', status()); kick(); });
  US.bus.on('ready', () => { if (started) return; started = true; load.timer = setInterval(sampleLoad, 5000); if (load.timer.unref) load.timer.unref(); schedule(30000); });
})();
