/* JMG Ultra Studio – Story › English translation › By listening: the original words and their English made from the
   SOUND, for interviews the editor's own speech-to-text can't write down (Hebrew or Yiddish that comes back as English
   nonsense, or not at all) – and for a clip that has no transcript in Story yet.

   - Times come from this computer, never from a model: the sound is cut into phrases where it goes quiet (the Silence
     Cut's own level measure), merged into spans of roughly 2–8 seconds, and numbered. A model is only ever asked what
     is said in a span it is given.
   - The sound goes the same way as Listen to delivery, with the same choices and the same yes (US.delivery's plan and
     routes; Settings › Listening models for Story): on this computer the chosen listening model after its hearing
     check – one span at a time, asked only “what is said?”, then its own words translated as text; in the cloud the
     chosen Gemini model through US.ai.media({purpose: 'delivery'}) – the project's delivery consent, asked with the
     estimate every time, never in the background, never for a project set to “nothing leaves this computer”.
     It works with Listen to delivery switched off: translating by listening is its own explicit action.
   - A span nobody could be heard speaking in has no text – never an invented one.
   - What comes back is kept with Story's translations (on this computer and in “<project> – English.json”), piece by
     piece, so a stopped run carries on; made again when the model or the language changes.
   - Into Story: an interview with no usable transcript gets one made by listening (original-language lines at this
     computer's times, marked “made by listening – AI”) with its English; one with a transcript keeps it, and the
     listened original and English are kept beside each line. Everything Story › English translation does – the
     transcript document, subtitles, Find, the AI rows – then works from it.

   Pure pieces first (unit-tested: US.storyListen._pure), then the work, into Story, and the screens. */
(function () {
  'use strict';
  const US = window.US, h = US.h, ui = US.ui;
  const D = () => US.delivery, E = () => US.storyEnglish, S = () => US.story;
  const VERSION = 1;
  const MARK = 'Made by listening – AI transcription and translation, check before publishing';
  const clip = (s, n) => { s = String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
  const r2 = x => Math.round(x * 100) / 100;
  const fmtT = s => { s = Math.max(0, +s || 0); const m = Math.floor(s / 60), ss = Math.floor(s - m * 60); return `${m}:${ss < 10 ? '0' : ''}${ss}`; };
  const hasLetters = s => /[\p{L}\p{N}]/u.test(String(s || ''));

  /* =================== spans: where someone speaks, measured here =================== */
  const HOP = 0.05;
  /** The sound's level every 50 ms, in dB. */
  function envelope(data, sr) {
    const hop = Math.max(1, Math.round(sr * HOP)), n = Math.floor(data.length / hop), db = new Float32Array(n);
    for (let i = 0; i < n; i++) { let s = 0; for (let k = i * hop, e = k + hop; k < e; k++) s += data[k] * data[k]; db[i] = s > 0 ? Math.max(-100, 10 * Math.log10(s / hop)) : -100; }
    return db;
  }
  /**
   * The stretches where something is said, as spans a subtitle could carry: phrases between pauses (the Silence Cut's
   * level measure), neighbours joined across a short pause while the span stays short, long ones split at their
   * quietest moment. -> [{n (1, 2, 3…), start, end}] in seconds – never a time from a model.
   */
  function spans(data, sr, { min = 2, max = 8, pause = 0.35, join = 1 } = {}) {
    const db = envelope(data, sr), n = db.length, dur = data.length / sr;
    if (!n) return [];
    const st = US.dsp.levelStats(db);
    if (st.speech < -60) return [];                                   // a recording of nothing
    const thr = Math.max(-60, Math.min(st.auto, st.speech - 20));     // as the delivery silence gate: quiet = well under the loud parts
    const P = US.dsp.findPauses({ db, hop: HOP }, { threshold: thr, minPause: pause, padding: 0, bridge: 0.1, duration: dur }).pauses;
    let ph = [], at = 0;
    for (const p of P) { if (p.start - at >= 0.25) ph.push({ start: at, end: p.start }); at = p.end; }
    if (dur - at >= 0.25) ph.push({ start: at, end: dur });
    // a long phrase: cut where it is quietest, away from its edges, until every part fits
    const split = s => {
      if (s.end - s.start <= max) return [s];
      const a = Math.floor((s.start + Math.max(1, (s.end - s.start) * 0.25)) / HOP), b = Math.ceil((s.end - Math.max(1, (s.end - s.start) * 0.25)) / HOP);
      let best = Math.floor((a + b) / 2), low = Infinity;
      for (let i = a; i < b && i < n; i++) { const v = (db[i - 1] || db[i]) + db[i] + (db[i + 1] || db[i]); if (v < low) { low = v; best = i; } }
      const t = best * HOP;
      return split({ start: s.start, end: t }).concat(split({ start: t, end: s.end }));
    };
    ph = ph.flatMap(split);
    // short neighbours become one span, while the pause between them is short and the span stays readable
    const out = [];
    for (const s of ph) {
      const l = out[out.length - 1];
      if (l && s.start - l.end <= join && s.end - l.start <= max && (l.end - l.start < min || s.end - s.start < min)) l.end = s.end; else out.push({ start: s.start, end: s.end });
    }
    return out.filter(s => s.end - s.start >= 0.3).map((s, i) => ({ n: i + 1, start: r2(s.start), end: r2(s.end) }));
  }
  /**
   * Spans in pieces a model can take (30 s on this computer, up to 120 s in the cloud): whole spans only – a piece is
   * never cut inside one, and a new piece starts after a gap longer than `gap` seconds (so the sound between two parts
   * of a cut that aren't listened to is never sent – used when only part is listened to). -> [{start, end, spans}]
   */
  function pieces(list, { chunk = 30, pad = 0.25, gap = Infinity } = {}) {
    const out = [];
    let cur = null;
    for (const s of list) {
      if (cur && s.end + pad - cur.start <= chunk && s.start - cur.end <= gap) { cur.spans.push(s); cur.end = r2(s.end + pad); continue; }
      cur = { start: r2(Math.max(0, s.start - pad)), end: r2(s.end + pad), spans: [s] };
      out.push(cur);
    }
    return out;
  }

  /** The spans that lie in (or touch) the stretches of the recording a cut uses ([[from, to]…]); all of them when ranges is null. */
  const within = (list, ranges) => (ranges ? list.filter(s => ranges.some(r => s.end > r[0] && s.start < r[1])) : list);
  /** How many seconds of sound some ranges are. */
  const rangeSecs = ranges => (ranges || []).reduce((n, r) => n + Math.max(0, r[1] - r[0]), 0);

  /* =================== asking =================== */
  const CONF = ['sure', 'fairly sure', 'unsure'];
  const HEARD = ['yes', 'partly', 'no'];
  const expect = lang => (lang ? `The speaker is most likely speaking ${lang}.` : 'Work out which language is spoken.');
  /* the cloud: a piece of sound with its numbered spans – the words, the language and the English of each, in one answer */
  const SCHEMA = { type: 'object', additionalProperties: false, required: ['spans'], properties: { spans: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['n', 'heard', 'original', 'language', 'english', 'confidence'],
    properties: { n: { type: 'integer' }, heard: { type: 'string', enum: HEARD }, original: { type: 'string' }, language: { type: 'string' }, english: { type: 'string' }, confidence: { type: 'string', enum: CONF } } } } } };
  const SYSTEM = 'You listen to a piece of a filmed interview for a documentary editor. There is no usable transcript: you write down what is said, and translate it. The piece has been cut into numbered spans where someone speaks (each with its start and end in seconds from the start of this piece). ' +
    'Answer for every span number you are given – the same numbers, no others – and give no times: the times are fixed. For each span: ' +
    '"heard": can you actually hear someone speaking in it – "yes", "partly" or "no" (silence, music, noise). ' +
    '"original": exactly the words spoken in that span, in the language they are spoken in and in its own script (Hebrew and Yiddish in Hebrew letters, Arabic in Arabic letters, Russian in Cyrillic) – not translated, not tidied. "language": the language of that span. ' +
    '"english": those words in natural spoken English. A sentence that runs over two spans: translate it so the spans read on from each other, each keeping its own part. Names of people and places are not translated – write them in Latin letters. A blessing, an idiom or a religious or cultural term stays in the English, transliterated, followed by a short gloss in square brackets: “b’ezrat Hashem [with God’s help]”. ' +
    'NEVER INVENT. If you cannot hear a span being spoken, say "heard": "no" and leave "original" and "english" empty. If you are not sure of the words, say so with "confidence": "unsure". British English.';
  function cloudRequest(iv, piece, wavBase64, bytes, lang, { terms = [] } = {}) {
    const rows = piece.spans.map(s => `${s.n}\t${r2(Math.max(0, s.start - piece.start))}–${r2(s.end - piece.start)}`);
    const text = `A piece of interview ${iv.n || 1}, ${Math.round(piece.end - piece.start)} seconds long (it starts ${fmtT(piece.start)} into the interview). ${expect(lang)}` +
      (terms.length ? ` Names the editor has spelt for this project: ${terms.slice(0, 40).join(', ')}.` : '') +
      `\nThe spans in this piece (number<TAB>seconds from the start of this piece):\n${rows.join('\n')}\nThe sound:`;
    return { system: SYSTEM, user: [text, { media: { kind: 'audio', data: wavBase64, mime: 'audio/wav', bytes, seconds: piece.end - piece.start, note: `${iv.name || 'interview'} ${fmtT(piece.start)}–${fmtT(piece.end)} (${piece.spans.length} spans, to write down and translate)` } }],
      schema: SCHEMA, maxTokens: Math.min(8000, 600 + piece.spans.length * 260), feature: 'Translating by listening' };
  }
  /* this computer: one span of sound and nothing else – “what is said?” (the question a small model answers honestly) */
  const HEAR_SCHEMA = { type: 'object', additionalProperties: false, required: ['speech', 'text', 'language'], properties: { speech: { type: 'boolean' }, text: { type: 'string' }, language: { type: 'string' } } };
  const hearSystem = lang => `You listen to a short recording. "speech": true only if you can hear someone speaking in it. "text": exactly what is said, in the language spoken and in its own script, with normal punctuation – only the words, not translated, no comments. "language": the language spoken. ${expect(lang)} If nobody speaks (silence, a tone, music, noise), answer "speech": false, "text": "" and "language": "".`;
  function hearRequest(iv, span, wavBase64, bytes, lang) {
    return { system: hearSystem(lang), user: ['The recording:', { media: { kind: 'audio', data: wavBase64, mime: 'audio/wav', bytes, seconds: span.end - span.start, note: `${iv.name || 'interview'} ${fmtT(span.start)}–${fmtT(span.end)} (what is said)` } }], schema: HEAR_SCHEMA, maxTokens: 500, feature: 'Translating by listening' };
  }
  /* …then its own words, as text, into English (no sound in this request) */
  const TR_SCHEMA = { type: 'object', additionalProperties: false, required: ['spans'], properties: { spans: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['n', 'english'], properties: { n: { type: 'integer' }, english: { type: 'string' } } } } } };
  const TR_SYSTEM = 'You translate what was said in a filmed interview into English, span by span. Answer with one item for every span number you are given – the same numbers, no others. Natural spoken English, nothing added. A sentence that runs over two spans: translate it so the spans read on from each other, each keeping its own part. ' +
    'Names of people and places are not translated – write them in Latin letters. A blessing, an idiom or a religious or cultural term stays in the English, transliterated, followed by a short gloss in square brackets. Words already in English stay as they are. If a span can’t be understood, give "" for it – never invent. British English.';
  function translateRequest(heard, lang, { terms = [] } = {}) {
    return { system: TR_SYSTEM, user: `${lang ? `Mostly in ${lang}.` : ''}${terms.length ? ` Names (spell them like this): ${terms.slice(0, 40).join(', ')}.` : ''}\nThe spans (number<TAB>what was said):\n${heard.map(s => `${s.n}\t${s.text}`).join('\n')}`,
      schema: TR_SCHEMA, maxTokens: Math.min(6000, 400 + heard.reduce((n, s) => n + s.text.length, 0) * 2), feature: 'Translating by listening' };
  }
  const blank = (s, why) => ({ n: s.n, start: s.start, end: s.end, text: '', lang: '', en: '', conf: 'sure', unheard: why });
  const isEnglish = lang => /^english$/i.test(String(lang || '').trim());
  /** A span as kept: this computer's times, the words, their language and the English – or nothing at all when it wasn't heard. */
  function spanOf(s, text, lang, en, conf) {
    text = clip(text, 1200); en = clip(en, 1500);
    if (!hasLetters(text)) return blank(s, 'model');
    if (isEnglish(lang) && !hasLetters(en)) en = text;
    return { n: s.n, start: s.start, end: s.end, text, lang: clip(lang, 24), en: hasLetters(en) ? en : '', conf: CONF.includes(conf) ? conf : 'unsure' };
  }
  /**
   * What a model makes up when it hears no words (measured with Gemma 4 E2B on speech-like noise, 21 Nov 2026): its
   * own prompt read back (“The recording:”), and the same sentence “heard” in several different places. Both are
   * taken out – the span is left as “couldn't hear”. -> the spans, cleaned
   */
  function scrub(list) {
    const key = t => String(t || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim(), seen = new Map();
    for (const s of list) { const k = key(s.text); if (k && k.split(' ').length >= 4) seen.set(k, (seen.get(k) || 0) + 1); }
    return list.map(s => { const k = key(s.text); return s.text && (/^(the )?recording$/.test(k) || (seen.get(k) || 0) >= 2) ? blank(s, 'made-up') : s; });
  }
  /** The cloud's answer for a piece: only the spans it was given, each once; “couldn't hear” has no words and no English. */
  function tidyCloud(r, piece) {
    const by = new Map();
    for (const x of Array.isArray(r && r.spans) ? r.spans : []) { const n = Math.round(+(x && x.n)); if (!by.has(n)) by.set(n, x); }
    return piece.spans.map(s => { const x = by.get(s.n); return !x || x.heard === 'no' ? blank(s, 'model') : spanOf(s, x.original, x.language, x.english, x.confidence); });
  }
  /** A local model's English for the spans it had written down: only those numbers; a span with no words never gets English. */
  function tidyTranslate(r, heard) {
    const by = new Map();
    for (const x of Array.isArray(r && r.spans) ? r.spans : []) { const n = Math.round(+(x && x.n)); if (!by.has(n)) by.set(n, clip(x.english, 1500)); }
    return heard.map(s => Object.assign({}, s, { en: isEnglish(s.lang) ? s.text : hasLetters(by.get(s.n)) ? by.get(s.n) : '' }));
  }

  /* =================== a transcript that can't be used, and fitting what was heard to lines =================== */
  /**
   * Can this interview's transcript be translated as it is? 'none' (no lines), 'script' (it should be Hebrew, Arabic,
   * Russian… but is written in Latin letters: the speech-to-text wrote nonsense) or '' (usable, as far as letters can tell).
   */
  function unusable(t, lang) {
    const lines = (t && t.lines) || [];
    if (!lines.some(l => E().detect(l.text).lang)) return 'none';   // “[music]” and the like are not words
    if (!lang || ['English', 'French', 'Spanish', 'German', 'Italian', 'Portuguese', 'Dutch'].includes(lang)) return '';
    let own = 0, n = 0;
    for (const l of lines) { const d = E().detect(l.text); if (!d.lang) continue; n++; if (d.lang === lang || d.others.includes(lang) || (d.lang !== 'English' && !['French', 'Spanish', 'German', 'Italian', 'Portuguese', 'Dutch'].includes(d.lang))) own++; }
    return n && own / n < 0.3 ? 'script' : '';
  }
  /** What was heard, given to the transcript's own lines by time: each span to the line it mostly lies in. -> {lineId: {en, orig}} */
  function assign(lines, heard) {
    const out = {};
    for (const s of heard) {
      if (!s.text) continue;
      let best = null, most = 0;
      for (const l of lines) { const o = Math.min(l.end, s.end) - Math.max(l.start, s.start); if (o > most) { most = o; best = l; } }
      if (!best || most < Math.min(0.3 * (s.end - s.start), 0.5)) continue;
      const x = out[best.id] || (out[best.id] = { en: '', orig: '' });
      x.orig = (x.orig + ' ' + s.text).trim(); if (s.en) x.en = (x.en + ' ' + s.en).trim();
    }
    return out;
  }
  /** The language most of what was heard is in. */
  function mainLanguage(heard, fallback = '') {
    const c = new Map(); for (const s of heard) if (s.text && s.lang) { const k = s.lang[0].toUpperCase() + s.lang.slice(1).toLowerCase(); c.set(k, (c.get(k) || 0) + s.text.length); }
    return Array.from(c.entries()).sort((a, b) => b[1] - a[1]).map(x => x[0])[0] || fallback;
  }

  /* =================== what is kept (with Story's translations: here and beside the project) =================== */
  const store = () => E()._store;
  const recs = () => { const d = store().load(); if (!d.listened) d.listened = {}; return d.listened; };
  /** What was heard for an interview (by its Story key, or a media file's path): the record, or null. */
  const peek = key => recs()[key] || null;
  const terms = () => { try { return (S().glossary() || []).filter(e => e && e.right && !e.hide).map(e => String(e.right)).slice(0, 40); } catch (e) { return []; } };
  /** Who would listen: Listen to delivery's own plan (its models, its where, its consent, its hearing check) – whether or not delivery is switched on. */
  const plan = () => D().plan({ force: true });
  const fresh = (rec, P, lang) => !!rec && rec.v === VERSION && rec.by === P.id && (rec.asked || '') === (lang || '');
  /** An interview by its key, or a media file with no transcript in Story: {key, name, path, itemId, n, lines, seconds} */
  function target(key) {
    S().loadState();
    const ts = S().state().transcripts || [], i = ts.findIndex(t => t.key === key);
    if (i >= 0) { const t = ts[i]; return { key: t.key, name: t.name, path: t.path || '', itemId: t.itemId || '', n: i + 1, lines: t.lines || [], seconds: (t.lines || []).reduce((n, l) => Math.max(n, +l.end || 0), 0), t }; }
    return { key, name: US.basename(key), path: key, itemId: '', n: ts.length + 1, lines: [], seconds: 0, t: null };
  }

  /* =================== listening =================== */
  /**
   * Listen to one interview (or carry on): its sound read here, cut into spans here, and each piece asked about.
   * lang: the language to expect ('' = work it out). limit: {left()} dollars for the cloud. keepGoing(): stop between pieces.
   * ranges: only the stretches of the recording a cut uses ([[from, to]…] in its own seconds – Story › What to work on,
   * a sequence, between its In and Out): only the spans in them are listened to; null = the whole interview. What was
   * heard is kept span by span, so a later, wider choice only listens to what's new.
   * -> {rec, more, usd, paidUsd, stopped, skipped, complete (every span asked for has been heard), want, of}
   */
  async function listen(job, iv, { lang = '', plan: given = null, heavy = true, keepGoing = () => true, force = false, limit = null, ranges = null } = {}) {
    const P = given || plan(), out = { rec: null, more: false, usd: 0, paidUsd: 0, stopped: '', skipped: '', complete: false, want: 0, of: 0 };
    if (P.kind === 'none') throw whyNot(P);
    if (!iv.path) { out.skipped = 'no-file'; return out; }
    const L = recs();
    let rec = force ? null : L[iv.key];
    if (fresh(rec, P, lang) && rec.done) { out.rec = rec; out.complete = true; out.want = out.of = rec.grid.length; return out; }
    // a model on this computer is checked once (Listen to delivery's hearing check): one that scores a silent clip isn't asked
    if (P.kind === 'helper') { const hc = await D().ensureHearing(P, job); if (hc.ok === false) throw whyNot(Object.assign({}, P, { why: 'deaf' })); }
    job && job.set && job.set({ who: 'computer', msg: `Reading the sound of ${iv.name}` });
    let a;
    try { a = await D().routes.sound(iv, { heavy, job }); }
    catch (e) { if (e && e.code === 'CANCELLED') throw e; throw new US.UserError('NOTHING_FOUND', { title: `The sound of “${iv.name}” couldn’t be read.`, action: 'Check that its media file is online; a file the panel can’t decode needs ffmpeg on this computer.', detail: String(e && (e.detail || e.message) || e) }); }
    if (!fresh(rec, P, lang)) rec = { v: VERSION, by: P.id, label: P.label, where: P.kind === 'cloud' ? 'cloud' : 'local', asked: lang || '', next: 0, grid: spans(a.data, a.sr), spans: [], duration: a.duration, done: false };
    else rec = Object.assign({}, rec, { spans: rec.spans.slice() });
    out.rec = rec;
    // only the spans asked for (the part of the interview in the cut) that haven't been heard yet
    const have = new Set(rec.spans.map(s => s.n)), want = within(rec.grid, ranges);
    const ps = pieces(want.filter(s => !have.has(s.n)), { chunk: P.chunkSec, gap: ranges || have.size ? 3 : Infinity }), hint = terms();
    out.want = want.length; out.of = rec.grid.length;
    rec.total = rec.grid.length;   // counted in spans: “12 of 80 stretches heard”
    let at = 0;
    const onUsage = u => { out.usd += u.usd || 0; out.paidUsd += u.paidUsd || 0; };
    const wavOf = (s, e) => US.audio.wavBytes(a.data.subarray(Math.floor(s * a.sr), Math.floor(e * a.sr)), a.sr);
    const keepRec = () => { L[iv.key] = rec; rec.at = Date.now(); store().save(); };
    while (at < ps.length) {
      if (!keepGoing()) { out.more = true; break; }
      job && job.check && job.check();
      const p = ps[at];
      if (limit && P.kind === 'cloud' && D()._pure.pieceUsd({ start: p.start, end: p.end, lines: p.spans.map(() => ({ text: 'x'.repeat(60) })) }, P.cloudModel) > limit.left() - out.paidUsd + 1e-9) { out.more = true; out.stopped = 'limit'; break; }
      job && job.set && job.set({ who: P.kind === 'cloud' ? 'ai' : 'computer', msg: `${P.label} is listening to ${iv.name} · ${fmtT(p.start)} of ${fmtT(a.duration)}` });
      job && job.progress && job.progress(at / ps.length);
      let got;
      if (P.kind === 'cloud') {
        const wav = wavOf(p.start, p.end);
        got = tidyCloud(await D().routes.listen(P, cloudRequest(iv, p, wav.toString('base64'), wav.length, lang, { terms: hint }), { job, onUsage }), p);
      } else {
        // one span at a time, the sound and nothing else; then the words it wrote down, translated as text
        const heard = [];
        for (const s of p.spans) {
          job && job.check && job.check();
          const wav = wavOf(Math.max(0, s.start - 0.1), s.end + 0.1), r = await D().routes.listen(P, hearRequest(iv, s, wav.toString('base64'), wav.length, lang), { job, onUsage });
          heard.push(r && r.speech !== false ? spanOf(s, r.text, r.language || lang, '', 'fairly sure') : blank(s, 'model'));
        }
        const said = heard.filter(s => s.text && !isEnglish(s.lang));
        const en = said.length ? tidyTranslate(await D().routes.listen(P, translateRequest(said, lang || mainLanguage(heard), { terms: hint }), { job, onUsage }), said) : [];
        got = heard.map(s => en.find(x => x.n === s.n) || (s.text && isEnglish(s.lang) ? Object.assign({}, s, { en: s.text }) : s));
      }
      rec.spans = rec.spans.filter(s => !got.some(g => g.n === s.n)).concat(got);
      rec.next = rec.spans.length;
      at++;
      keepRec();
    }
    if (at >= ps.length) {
      out.complete = true;
      rec.spans = scrub(rec.spans.slice().sort((x, y) => x.n - y.n));
      rec.next = rec.spans.length;
      rec.done = rec.grid.every(g => rec.spans.some(s => s.n === g.n));
      rec.lang = mainLanguage(rec.spans, lang); rec.heard = rec.spans.filter(s => s.text).length;
      keepRec();
    }
    return out;
  }
  function whyNot(P) {
    const T = {
      offline: ['This project is set to “nothing leaves this computer”.', 'Listen on this computer instead (Settings › Listening models for Story), or change the project’s setting in Settings › AI.'],
      consent: ['Listening in the cloud isn’t switched on for this project on this computer.', 'Choose “By listening” again and say yes to the estimate – or listen on this computer (Settings › Listening models for Story).'],
      key: ['Cloud listening needs a Gemini key.', 'Add one in Settings › AI (Claude can’t hear), or listen on this computer.'],
      model: ['There’s no listening model on this computer yet.', 'Download one in Settings › Vision & listening models (Gemma 4 listens), or choose Cloud in Settings › Listening models for Story.'],
      deaf: [`${D().DEAF}.`, 'So what it wrote down couldn’t be trusted. Choose another listening model, or Cloud, in Settings › Listening models for Story.']
    }[P.why] || ['Nothing can listen yet.', 'Settings › Listening models for Story.'];
    return new US.UserError(P.why === 'key' ? 'AI_KEY' : 'NOTHING_FOUND', { title: T[0], action: T[1] });
  }

  /* =================== into Story =================== */
  /**
   * Put what was heard to work. An interview with no usable transcript (or a clip with none) gets a transcript made by
   * listening – the original words at this computer's times – with its English; one whose transcript is kept gets the
   * listened original and English beside its lines. -> {key, lines, made (a transcript was made), lang}
   */
  function apply(iv, rec, { replace = false } = {}) {
    const heard = (rec.spans || []).filter(s => s.text).sort((a, b) => a.start - b.start), lang = rec.lang || mainLanguage(heard, rec.asked);
    if (!heard.length) return { key: iv.key, lines: 0, made: false, lang };
    const by = `${rec.label}, by listening`;
    let t = iv.t, made = false;
    if (!t || replace) {
      t = S().addTranscript({ name: iv.name, path: iv.path, itemId: iv.itemId, source: 'listened', language: lang, segments: heard.map(s => ({ start: s.start, end: s.end, speaker: '', text: s.text })) });
      t.listened = { by: rec.label, at: Date.now(), ai: true };
      // the transcript it replaces (when Story didn't take the new one for the same interview) goes; what was heard stays findable under the new one
      if (iv.t && iv.t !== t) { const st = S().state(); st.transcripts = st.transcripts.filter(x => x !== iv.t); }
      if (t.key !== iv.key) recs()[t.key] = rec;
      made = true;
    }
    const map = assign(t.lines, heard);
    if (made) for (const id of Object.keys(map)) delete map[id].orig;   // the lines ARE the original
    E().setEnglish(t.key, { lang, by, source: 'listening' }, t.lines, map);
    S().reindex(); S().save();
    return { key: t.key, lines: Object.keys(map).length, made, lang };
  }

  /* ---------- how long, how much (before anything is sent) ---------- */
  /** For some interviews: {seconds, known, cloud: {label, usd, secs}|null, local: {secs, measured}} – delivery's own estimate; `known` false when a length isn't known until the sound is read. */
  function estimate(ivs) {
    const len = iv => (iv.ranges ? rangeSecs(iv.ranges) : iv.seconds || 0);
    const s = D().settings(), secs = ivs.reduce((n, iv) => n + len(iv), 0), known = ivs.every(iv => len(iv) > 0), part = ivs.some(iv => iv.ranges);
    const lm = D().localModels().find(m => m.id === s.localModel) || null, lines = Math.ceil(secs / 5);
    const e = D().estimate({ seconds: secs, lines, chars: 0 }, { chunk: 30, cloudChunk: 120, bench: D().bench(), localModel: lm && lm.model, cloudModel: s.cloudModel, prices: US.ai.MEDIA_PRICES });
    return { seconds: secs, known, part, where: s.where, cloud: e.cloud, local: e.local, model: lm ? lm.name : '' };
  }
  function estimateText(e) {
    const money = r => (r[1] < 0.005 ? 'under 1¢' : US.ai.fmtUSD(r[0]) === US.ai.fmtUSD(r[1]) ? US.ai.fmtUSD(r[1]) : `${US.ai.fmtUSD(r[0])}–${US.ai.fmtUSD(r[1])}`);
    const len = (e.known ? `${US.fmtDur(e.seconds)} of sound` : `${e.seconds ? 'at least ' + US.fmtDur(e.seconds) : 'a length that isn’t known until the sound is read'}`) + (e.part ? ' (only the part used in the sequence you’re working on)' : '');
    if (e.where === 'cloud') return e.cloud ? `${len}. ${e.cloud.label}: about ${e.cloud.megabytes} MB of sound uploaded; at most ${money(e.cloud.usd)} at Google’s paid rate (prices read on ${e.cloud.date}; an estimate – it counts every second as speech, and how much the model writes back is an assumption). On Google’s free allowance it costs nothing, but Google may then use what is sent.` : `${len}. Needs a Gemini key (Claude can’t hear).`;
    return `${len}. ${e.model || 'A listening model'} on this computer: ${e.local.measured ? US.fmtDur(e.local.secs[1]) + ', from its measured speed' : `${US.fmtDur(e.local.secs[0])}–${US.fmtDur(e.local.secs[1])} – an assumption, it hasn’t been measured here`}; listening span by span is slower than that suggests. Cost: nothing.`;
  }
  /** The cloud's yes, asked every time with the estimate (the same per-project consent as Listen to delivery). */
  async function confirmCloud(ivs, { overnight = false, limit = null } = {}) {
    if (US.ai.projectOffline()) { ui.toast({ type: 'warn', title: 'This project is set to “nothing leaves this computer”', text: 'Its interviews can only be listened to here. Choose “This computer” in Settings › Listening models for Story.' }); return false; }
    if (!US.secrets.get('geminiKey')) { ui.toast({ type: 'warn', title: 'Cloud listening needs a Gemini key', text: 'Add one in Settings › AI. Claude can’t hear, so a Claude key isn’t enough.' }); return false; }
    const s = D().settings(), label = (US.ai.MEDIA_PRICES.gemini[s.cloudModel] || {}).name || 'Gemini', e = estimate(ivs);
    const ok = await ui.modal({ title: overnight ? `Send ${US.plural(ivs.length, 'interview')} to ${label} tonight, to translate by listening?` : `Let ${label} listen to ${ivs.length === 1 ? `“${ivs[0].name}”` : US.plural(ivs.length, 'interview')}, to translate ${ivs.length === 1 ? 'it' : 'them'}?`,
      body: h('div',
        h('p', `The interview’s sound – ${ivs.some(iv => iv.ranges) ? `only the part used in “${scopeName()}”${(S().scopeOf() || {}).inOut ? ' between its In and Out points' : ''}, ` : ''}the stretches where someone speaks, as plain 16 kHz audio, a piece at a time – is sent from this computer to Google, to write down what is said and translate it into English. No picture and no transcript is sent.`),
        h('p', h('b', estimateText(Object.assign({}, e, { where: 'cloud' })))),
        overnight && limit != null ? h('p', `Overnight prep stops sending before it goes over tonight’s limit of ${US.ai.fmtUSD(+limit)}, counted at Google’s paid rate; the rest waits.`) : null,
        h('p.field-hint', 'This is the same yes as Listen to delivery’s cloud choice for this project, on this computer – there is one choice for sending interview sound, and you are asked each time. Every request is listed in Settings › What was sent to AI with its size. A project set to “nothing leaves this computer” never sends anything.')),
      buttons: [{ label: 'Don’t send', value: false, kind: 'ghost' }, { label: e.cloud ? `Yes – up to about ${US.ai.fmtUSD(e.cloud.usd[1])}` : 'Yes, use the cloud', value: true, kind: 'primary' }] });
    if (ok) US.ai.setDelivery(true);
    return !!ok;
  }
  /**
   * Translate some interviews by listening, as a job. keys: Story's interview keys or media files' paths; lang: the
   * language to expect for a clip with no transcript ('' = work it out; an interview's own set language is used when it
   * has one); confirmed: the cloud's yes has been given for this run (the screens ask; Ask and Overnight prep ask too).
   * -> {summary, done, lines, made, stopped}
   */
  async function run(job, { keys, lang = '', limitUsd = null, confirmed = false, force = false, plan: given = null, whole = !partOn() } = {}) {
    let ivs = (keys || []).map(target);
    if (!ivs.length) throw new US.UserError('NOTHING_FOUND', { title: 'Choose an interview to listen to first.' });
    // Story is working on a sequence: only the part of each interview the cut uses (between In and Out) is listened to
    let skipped = [];
    if (!whole && S().scopeOf().kind === 'sequence') {
      await S().refreshScope(job);
      for (const iv of ivs) { const r = S().scopeParts(iv.key); iv.ranges = r; }
      skipped = ivs.filter(iv => !iv.ranges.length);
      ivs = ivs.filter(iv => iv.ranges.length);
      if (!ivs.length) throw new US.UserError('NOTHING_FOUND', { title: `${skipped.length === 1 ? `“${skipped[0].name}” isn’t` : 'Those interviews aren’t'} used in “${scopeName()}”${S().scopeOf().inOut ? ' between its In and Out points' : ''}.`, action: 'Story only listens to the part of an interview used in the sequence you’re working on. Untick “Only the part in the sequence” under English translation to listen to the whole interview, or choose what to work on in Story › 1 Interviews.' });
    }
    if (!given && D().settings().where === 'cloud' && !confirmed && !(await confirmCloud(ivs))) throw new US.UserError('CANCELLED');
    const P = given || plan();   // given: who listens, when the caller has decided (tests)
    if (P.kind === 'none') throw whyNot(P);
    const out = { done: 0, lines: 0, made: 0, paidUsd: 0, stopped: '', unheard: 0 };
    const limit = limitUsd != null && isFinite(+limitUsd) ? { left: () => +limitUsd - out.paidUsd } : null;
    for (let i = 0; i < ivs.length; i++) {
      job.check(); job.range && job.range(i / ivs.length, (i + 1) / ivs.length);
      const iv = ivs[i], st = iv.t ? E().statusOf(iv.t) : null, want = st ? (st.set || st.lang !== 'English' ? st.lang : lang) : lang;
      const r = await listen(job, iv, { lang: want, plan: P, limit, force, ranges: iv.ranges || null });
      out.paidUsd += r.paidUsd;
      if (r.stopped === 'limit') { out.stopped = 'limit'; break; }
      if (!r.rec || !r.complete) continue;
      if (iv.ranges) { out.part = true; out.spans = (out.spans || 0) + r.want; out.of = (out.of || 0) + r.of; }
      // replaced only when it was unusable for the language the editor (or the app) gave it – and only once all of it has been heard
      const ap = apply(iv, r.rec, { replace: r.rec.done && !!iv.t && !!unusable(iv.t, want) });
      out.done++; out.lines += ap.lines; if (ap.made) out.made++; out.unheard += r.rec.spans.filter(s => !s.text).length;
    }
    job.range && job.range(0, 1);
    US.bus.emit('english', {});
    const bits = [`${US.plural(out.done, 'interview')} translated by listening with ${P.label}`, `${US.plural(out.lines, 'line')} in English`];
    if (out.part) bits.push(`only the part used in “${scopeName()}”${S().scopeOf().inOut ? ' between In and Out' : ''} (${out.spans} of ${US.plural(out.of, 'stretch', 'stretches')})`);
    if (skipped.length) bits.push(`${skipped.map(iv => `“${iv.name}”`).join(', ')} not in the sequence – left out`);
    if (out.made) bits.push(`${US.plural(out.made, 'transcript')} made by listening`);
    if (out.unheard) bits.push(`${US.plural(out.unheard, 'stretch', 'stretches')} couldn’t be heard – left empty`);
    if (out.stopped === 'limit') bits.push(`stopped at the limit of ${US.ai.fmtUSD(+limitUsd)} – the rest waits`);
    if (out.paidUsd > 0.004) bits.push(`about ${US.ai.fmtUSD(out.paidUsd)} at Google’s paid rate (nothing within the free allowance)`);
    return Object.assign(out, { summary: bits.join(' · ') + ' · ' + MARK });
  }

  /* ---------- only the part in the cut ---------- */
  /** “Only the part in the sequence” (on unless switched off): while Story works on a sequence, listen only to what the cut uses. */
  const partOn = () => US.settings.get('story.listenPart', true) !== false;
  const scopeName = () => { try { return S().scopeOf().seqName || 'the sequence'; } catch (e) { return 'the sequence'; } };
  /** An interview with the part of it the sequence uses, as last read (for the estimate on its button). */
  function withParts(iv) {
    try { if (partOn() && S().scopeOf().kind === 'sequence') { const r = S().scopeParts(iv.key); if (r) iv.ranges = r; } } catch (e) { /* the whole */ }
    return iv;
  }
  function partToggle({ render }) {
    let sc; try { sc = S().scopeOf(); } catch (e) { return null; }
    if (!sc || sc.kind !== 'sequence') return h('div.field-hint', 'Story listens to whole interviews. To listen only to part of one, choose a sequence in Story › 1 Interviews › What to work on (and “Only between In and Out” for just that part).');
    return ui.toggle({ label: `Only the part in “${scopeName()}”${sc.inOut ? ' between In and Out' : ''}`, hint: 'Listens only to the stretches of each interview the sequence uses (the sequence is read again first) – nothing else is sent or listened to. Off: whole interviews.', value: partOn(), onChange: x => { US.settings.set('story.listenPart', x); render(); } });
  }

  /* =================== Story › 1 Interviews › English translation: the extra controls =================== */
  /** Is listening the better source for this interview? '' or why ('none' | 'script'). */
  const prefer = s => { try { const t = S().state().transcripts.find(x => x.key === s.key); return unusable(t, s.lang); } catch (e) { return ''; } };
  const start = (keys, lang, { render }) => US.jobs.run({ title: 'Translating by listening', tool: 'story' }, job => run(job, { keys, lang })).then(x => { render(); return x; }).catch(e => { if (!(e instanceof US.UserError && e.code === 'CANCELLED')) ui.showError(e); render(); });
  /** On an interview's row: “By listening” – first, and said why, when its transcript can't be used. */
  function rowControls(s, { render }) {
    if (!D() || s.english) return null;
    const why = prefer(s), rec = peek(s.key), part = rec && !rec.done && rec.grid && rec.spans && rec.spans.length ? ` (${rec.spans.length} of ${rec.grid.length} stretches heard)` : '';
    return [why ? h('span.field-hint.eng-why', why === 'script' ? `This transcript isn’t written in ${s.lang} – the speech-to-text couldn’t follow it.` : 'There are no words in this transcript.') : null,
      ui.button(why ? `Translate by listening${part}` : `By listening${part}`, { small: true, kind: why ? 'primary' : 'ghost', title: `${why ? 'Make the transcript and its English from the sound instead' : 'Make the English from the sound, and keep what was heard beside your transcript'} – ${estimateText(estimate([withParts(target(s.key))]))}`, onClick: () => start([s.key], '', { render }) })];
  }
  /** Under the list: where listening happens, and a clip with no transcript in Story. */
  function cardExtras({ render }) {
    if (!D()) return null;
    const s = D().settings(), P = plan();
    const whereText = s.where === 'cloud' ? `in the cloud (${(US.ai.MEDIA_PRICES.gemini[s.cloudModel] || {}).name || 'Gemini'}) – you’re asked first, with the cost, every time` : P.kind === 'helper' ? `on this computer (${P.label}) – nothing leaves` : P.why === 'deaf' ? 'on this computer – but the chosen model failed its hearing check' : 'on this computer – no listening model is here yet';
    let lang = '';
    const langSel = ui.select({ options: [{ value: '', label: 'Work out the language' }].concat(E().LANGS.filter(l => l !== 'English').map(l => ({ value: l, label: l }))), value: '', onChange: x => { lang = x; } });
    return h('div.eng-listen',
      h('div.field-hint', h('b', 'By listening. '), 'When the speech-to-text couldn’t write an interview down – Hebrew or Yiddish that came back as nonsense, or nothing at all – Story can make the words and their English from the sound instead. This computer finds where someone speaks (so every time is exact); the listening model writes down and translates each stretch. ', h('i', 'AI transcription and translation: small models on this computer are weak at Hebrew and Yiddish – check before publishing.')),
      partToggle({ render }),
      h('div.row', h('span.field-hint.grow', `Listening happens ${whereText}.`), ui.button('Listening models for Story', { small: true, kind: 'ghost', title: 'This computer or the cloud, and which model – the same choices as Listen to delivery', onClick: () => US.tools.open('settings', { section: 'delivery' }) })),
      h('div.row', h('span.eng-lang', langSel), ui.button('Listen to a clip with no transcript…', { small: true, icon: 'folder', title: 'Choose an interview’s media file: Story makes its transcript and its English by listening', onClick: () => {
        const files = US.app.pickFiles({ multi: true, title: 'Choose the interview’s media', ext: ['mp4', 'mov', 'mxf', 'wav', 'mp3', 'm4a', 'aif', 'aiff'] }) || [];
        if (files.length) start(files.map(US.normPath), lang, { render });
      } })));
  }
  /** Overnight prep: the interviews whose transcript can't be used (and any already started) – the same yes and limit as delivery. */
  function waiting() {
    S().loadState();
    return E().statuses().filter(s => !s.english && (prefer(s) || (peek(s.key) && !peek(s.key).done))).filter(s => s.done < s.need || !peek(s.key) || !peek(s.key).done).map(s => s.key);
  }

  US.storyListen = { VERSION, MARK, plan, peek, listen, apply, run, estimate, estimateText, confirmCloud, rowControls, cardExtras, waiting, unusable, target,
    /** What was heard for one interview, taken away -> what was there (give it to unforget()). */
    forget(key) { const L = recs(), was = L[key] || null; delete L[key]; store().save(); return { key, was }; },
    unforget(saved) { if (!saved) return; const L = recs(); if (saved.was) L[saved.key] = saved.was; else delete L[saved.key]; store().save(); },
    _pure: { envelope, spans, pieces, within, rangeSecs, cloudRequest, hearRequest, translateRequest, tidyCloud, tidyTranslate, spanOf, scrub, assign, mainLanguage, SCHEMA, HEAR_SCHEMA, TR_SCHEMA, SYSTEM } };
})();
