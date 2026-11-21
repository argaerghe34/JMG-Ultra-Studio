/* JMG Ultra Studio – listening to delivery: how each interview line is SAID, not only what the transcript says.

   One engine (US.delivery). For every interview Story knows (its media file and its transcript lines with times) the
   sound is taken in pieces; each piece goes to a model that listens, together with the transcript lines that fall in
   it, and comes back with, per line: a delivery score 1–5, a few words on how it sounds (confident, warm, hesitant,
   flat, laughing, stumbles, trails off…), its energy, whether it starts and ends cleanly enough to cut – and the words
   the transcript got wrong, wrote as nonsense or left out: Hebrew, Yiddish or any other language, names, places,
   religious and cultural terms, sarcasm, a joke, a quoted voice, singing – each with what was said (in its own script
   when it has one), how to read it, the language, what it means, and what the transcript had. Speech the transcript
   missed between lines is kept too. Times always come from the transcript, never from the model.

   Per project, all of it a choice (Story › 1 Interviews › Listen to delivery, and Settings › Listen to delivery):
     off by default;
     on this computer – a listening model run by Ultra Studio's helper (US.models; nothing leaves), in the background
                        when the computer is calm, like US.understand;
     cloud            – a Gemini model through US.ai.media({purpose: 'delivery'}): its own yes per project (US.ai.
                        deliveryOn), asked with the estimate; never for a project set to “nothing leaves this computer”;
                        and never behind the editor's back – only Listen now or Overnight prep within its limit.

   Records are kept per media file in the cache and travel with the project in “<project> – Delivery.json”; they are
   made again only when the model, the languages or the transcript change, piece by piece (a stopped run carries on).

   Pure pieces first (unit-tested), then the choices, the record store, the routes, the work, the queue and the API. */
(function () {
  'use strict';
  const US = window.US;
  const VERSION = 2;   // bump when what a record holds changes (records are made again). 2: each line says whether it was heard at all
  const clip = (s, n) => { s = String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
  const fmtT = s => { s = Math.max(0, +s || 0); const m = Math.floor(s / 60), ss = Math.floor(s - m * 60); return `${m}:${ss < 10 ? '0' : ''}${ss}`; };
  const r1 = x => Math.round(x * 10) / 10;

  /* =================== pure pieces =================== */
  const LANGS = [
    { id: 'hebrew', name: 'Hebrew', on: true }, { id: 'yiddish', name: 'Yiddish', on: true },
    { id: 'arabic', name: 'Arabic', on: false }, { id: 'russian', name: 'Russian', on: false },
    { id: 'french', name: 'French', on: false }, { id: 'spanish', name: 'Spanish', on: false }
  ];
  const KINDS = ['word', 'name', 'place', 'religious', 'sarcasm', 'joke', 'quote', 'singing', 'other'];
  const ENERGY = ['low', 'medium', 'high'];
  const CONF = ['sure', 'fairly sure', 'unsure'];
  const AUDIBLE = ['yes', 'partly', 'no'];
  // a model that writes this in its notes couldn't hear the line, whatever score it gave (Gemini: 1/5 “inaudible” on a clip with no speech)
  const UNHEARD = /\b(inaudible|unintelligible|not audible|no (audible )?speech|can(no|’|')?t (be heard|hear)|nothing (is )?(said|spoken)|no one speaks)\b/i;
  const NOTE_WORDS = ['confident', 'warm', 'hesitant', 'flat', 'emotional', 'laughing', 'stumbles', 'trails off', 'interrupted', 'false start'];

  /** The languages to listen for, made safe: {hebrew, yiddish, arabic, russian, french, spanish, other} (Hebrew and Yiddish on until changed). */
  function langsOf(saved) {
    const s = saved && typeof saved === 'object' ? saved : {}, out = {};
    for (const L of LANGS) out[L.id] = L.id in s ? !!s[L.id] : L.on;
    out.other = clip(s.other, 120);
    return out;
  }
  /** Their names, in a fixed order: ['Hebrew', 'Yiddish', 'Ladino'…] */
  function langNames(langs) {
    const l = langsOf(langs), extra = String(l.other || '').split(/[,;]+/).map(x => clip(x, 30)).filter(Boolean);
    return Array.from(new Set(LANGS.filter(L => l[L.id]).map(L => L.name).concat(extra.map(x => x[0].toUpperCase() + x.slice(1)))));
  }
  const langsKey = langs => langNames(langs).join(',').toLowerCase();

  /** What a line was when it was listened to: its own start and words (the original ones – a glossary correction doesn't change it). */
  const lineText = l => String(l.orig != null ? l.orig : l.text == null ? '' : l.text).replace(/\s+/g, ' ').trim();
  const lineSig = l => US.fsx.hash(`${r1(+l.start || 0)}|${lineText(l)}`).slice(0, 8);
  /** A whole transcript's signature: any line added, taken away, retimed or reworded changes it. */
  const sigOf = lines => US.fsx.hash((lines || []).map(l => l.id + ':' + lineSig(l)).join('\n'));

  /**
   * The sound in pieces a model can take, each with the transcript lines that fall in it. Every line is in exactly one
   * piece, whole; a piece runs from just before its first line to just after its last (and on over a short gap to the
   * next line, so speech the transcript missed there is heard); long stretches with no lines aren't sent. A line longer
   * than a piece gets one to itself, cut at the piece's length (`cut`).
   * lines: [{id, start, end, speaker, text}] -> [{start, end, lines, cut?}] – the lines keep the transcript's times.
   */
  function pieces(lines, duration, { chunk = 30, pad = 0.5, gap = 8 } = {}) {
    const d = +duration > 0 ? +duration : Infinity;
    const ls = (lines || []).filter(l => l && l.id && isFinite(+l.start) && +l.end > +l.start && +l.start < d).slice().sort((a, b) => a.start - b.start);
    const out = [];
    let i = 0;
    while (i < ls.length) {
      const s = Math.max(0, r1(ls[i].start - pad)), own = [ls[i]];
      let j = i + 1;
      while (j < ls.length && ls[j].end + pad - s <= chunk) own.push(ls[j++]);
      const last = own[own.length - 1], next = ls[j];
      let e = Math.max(last.end + pad, next ? Math.min(next.start, last.end + gap) : last.end + pad);
      const p = { start: s, end: r1(Math.min(d, s + chunk, e)), lines: own };
      if (last.end > p.end + 0.05) p.cut = true;
      if (p.end - p.start >= 0.3) out.push(p);
      i = j;
    }
    return out;
  }

  const HEARD = {
    type: 'object', additionalProperties: false, required: ['said', 'transliteration', 'language', 'meaning', 'transcriptHad', 'kind', 'confidence'],
    properties: { said: { type: 'string' }, transliteration: { type: 'string' }, language: { type: 'string' }, meaning: { type: 'string' }, transcriptHad: { type: 'string' }, kind: { type: 'string', enum: KINDS }, confidence: { type: 'string', enum: CONF } }
  };
  const SCHEMA = {
    type: 'object', additionalProperties: false, required: ['lines', 'missed'],
    properties: {
      lines: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['id', 'audible', 'score', 'notes', 'energy', 'cleanStart', 'cleanEnd', 'confidence', 'heard'],
        properties: { id: { type: 'string' }, audible: { type: 'string', enum: AUDIBLE }, score: { type: 'integer' }, notes: { type: 'array', items: { type: 'string' } }, energy: { type: 'string', enum: ENERGY }, cleanStart: { type: 'boolean' }, cleanEnd: { type: 'boolean' }, confidence: { type: 'string', enum: CONF }, heard: { type: 'array', items: HEARD } } } },
      missed: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['afterLine', 'said', 'transliteration', 'language', 'meaning', 'confidence'],
        properties: { afterLine: { type: 'string' }, said: { type: 'string' }, transliteration: { type: 'string' }, language: { type: 'string' }, meaning: { type: 'string' }, confidence: { type: 'string', enum: CONF } } } }
    }
  };
  /** The instruction: what to judge, which languages to expect, and never to invent. */
  function system(langs) {
    const names = langNames(langs), list = names.length ? names.join(', ') : 'none in particular';
    return 'You listen to a piece of a filmed interview for a documentary editor and judge how each line is SAID – the transcript only has the words. The transcript’s lines for this piece come first (id, when it is said, who, the text), then the sound. Answer for every line id you are given; never add ids, never change them, and give no times – the times are the transcript’s. ' +
      'FIRST, for each line, "audible": can you actually HEAR that line being spoken in the sound? "yes", "partly" (some of it, or under other sound), or "no" – silence, music, noise, a tone, or other words than the line’s. The transcript can be wrong and the sound can be empty: do not assume a line is spoken because it is written. ' +
      'If you cannot hear a line being spoken, say "audible": "no" and give NO score: "score" 0, "notes" [], "heard" []. Never judge a line from its text. ' +
      '"score": delivery from 1 to 5 – 5 = clear, sure, alive, usable in a film exactly as it is; 3 = fine; 1 = stumbling, mumbled, flat, talked over or cut off. Judge the saying, not what is said. ' +
      `"notes": up to four short lower-case words or phrases for how it sounds, such as: ${NOTE_WORDS.join(', ')}. "energy": low, medium or high. ` +
      '"cleanStart" / "cleanEnd": true when the line starts / ends cleanly enough to cut there (no overlap with another voice, no clipped word, no breath or laugh running over the edge). ' +
      `LANGUAGES. The transcript was made by a machine that expects one language. In this project, expect English with words, phrases or whole sentences in: ${list} – and any other language may turn up. ` +
      '"heard": every word or phrase in the line that the transcript got wrong, wrote as nonsense or left out because it is in another language – and also names, places, religious or cultural terms it misheard, sarcasm or a joke (the words mean something other than they read), a quoted or imitated voice, and singing. For each: ' +
      '"said" = what is really said, in its own script when it has one (Hebrew and Yiddish in Hebrew letters, Arabic in Arabic letters, Russian in Cyrillic); "transliteration" = how to read it in Latin letters; "language"; "meaning" = what it means in plain English, a few words; "transcriptHad" = the transcript’s words for it exactly as given, or "" when the transcript left it out; "kind"; "confidence". An empty list when the transcript has the line right. ' +
      '"missed": speech you hear in this piece that is in none of the lines (often a phrase in another language between two lines): "afterLine" = the id of the line it follows ("" when it comes before the first), and the same fields. An empty list when there is none. ' +
      'NEVER INVENT. Only what you can hear. If you are not sure of a word, its language or its meaning, say so with "confidence": "unsure" – or leave it out; a wrong correction is worse than none. "confidence" on a line is how sure you are of its score. Do not transcribe lines that are already right. British English.';
  }
  /**
   * The request for one piece: the lines (ids, times within THIS piece, speaker, text), then the sound. The interview
   * is named only by its number (as everywhere in Story); `terms`: the project's names and terms, as a hint.
   */
  function request(iv, piece, wavBase64, bytes, langs, { terms = [], said = '' } = {}) {
    const rows = piece.lines.map(l => `${l.id}\t${r1(Math.max(0, l.start - piece.start))}–${r1(Math.max(0, Math.min(piece.end, l.end) - piece.start))}\t${l.speaker || '-'}\t${lineText(l).slice(0, 600)}`);
    const text = `A piece of interview ${iv.n || 1}, ${Math.round(piece.end - piece.start)} seconds long (it starts ${fmtT(piece.start)} into the interview). ` +
      `Languages to expect besides English: ${langNames(langs).join(', ') || 'none in particular'}.` +
      (terms.length ? ` Names and terms the editor has spelt for this project: ${terms.slice(0, 40).join(', ')}.` : '') +
      (piece.cut ? ' The last line runs on past the end of this piece: judge what you hear of it.' : '') +
      (said ? `\nWhat you wrote down a moment ago when you listened to this piece without the transcript: “${said}”. A line whose words are not in that was not heard.` : '') +
      `\nThe transcript’s lines in this piece (id<TAB>seconds from the start of this piece<TAB>speaker<TAB>text):\n${rows.join('\n')}\nThe sound:`;
    return { system: system(langs), user: [text, { media: { kind: 'audio', data: wavBase64, mime: 'audio/wav', bytes, seconds: piece.end - piece.start, note: `${iv.name || 'interview'} ${fmtT(piece.start)}–${fmtT(piece.end)} (${piece.lines.length} lines)` } }],
      schema: SCHEMA, maxTokens: Math.min(8000, 600 + piece.lines.length * 220), feature: 'Listening to delivery' };
  }
  /* ---------- a model on this computer listens FIRST, without the transcript (measured 21 Nov 2026: given the lines,
     Gemma 4 E2B scored a silent clip “4/5 clear, warm” from the text; asked only “what is said?” it answers honestly) ---------- */
  const HEAR_SCHEMA = { type: 'object', additionalProperties: false, required: ['speech', 'text'], properties: { speech: { type: 'boolean' }, text: { type: 'string' } } };
  const HEAR_SYSTEM = 'You listen to a recording. "speech": true only if you can hear someone speaking in it. "text": exactly what is said, in the language spoken (in its own script), with normal punctuation – only the words, no comments. If nobody speaks (silence, a tone, music, noise), answer "speech": false and "text": "".';
  /** The request that asks only what is said in a piece – no transcript, so nothing can be read off it. */
  function hearRequest(iv, piece, wavBase64, bytes) {
    return { system: HEAR_SYSTEM, user: ['The recording:', { media: { kind: 'audio', data: wavBase64, mime: 'audio/wav', bytes, seconds: piece.end - piece.start, note: `${iv.name || 'interview'} ${fmtT(piece.start)}–${fmtT(piece.end)} (what is said)` } }], schema: HEAR_SCHEMA, maxTokens: 900, feature: 'Listening to delivery' };
  }
  const wordsOf = t => String(t || '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f\u0591-\u05c7]/g, '').split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  /** What the model wrote down for a piece: '' when it heard nobody speak. */
  const saidOf = r => (r && r.speech !== false && wordsOf(r.text).length >= 3 ? clip(r.text, 4000) : '');
  /** How much of some words is in what was heard (0–1; null when there are no words long enough to tell). */
  function overlap(text, heardWords) {
    let ws = wordsOf(text).filter(w => w.length >= 3); if (ws.length < 2) ws = wordsOf(text);
    if (!ws.length) return null;
    return ws.filter(w => heardWords.has(w)).length / ws.length;
  }
  /**
   * Which of a piece's lines were really heard, from what the model wrote down before it saw them:
   * {none: nobody speaks in the piece, ok: Set of line ids whose words were heard, words: Set of every word heard}
   */
  function ground(piece, said) {
    const words = new Set(wordsOf(said)), ok = new Set();
    if (!words.size) return { none: true, ok, words };
    for (const l of piece.lines) { const o = overlap(lineText(l), words); if (o == null || o >= 0.4) ok.add(l.id); }
    return { none: false, ok, words };
  }
  /**
   * Lines where the recording is silent, measured here (no model): a line counts as silent when hardly any of its
   * span rises above the recording's own quiet level (the Silence Cut's threshold), or the whole recording is silence.
   * -> Set of line ids
   */
  function silentLines(data, sr, lines) {
    const hop = Math.max(1, Math.round(sr * 0.05)), n = Math.floor(data.length / hop), db = new Float32Array(n);
    for (let i = 0; i < n; i++) { let s = 0; for (let k = i * hop, e = k + hop; k < e; k++) s += data[k] * data[k]; db[i] = s > 0 ? Math.max(-100, 10 * Math.log10(s / hop)) : -100; }
    // quiet = well under the recording's loud parts (a steady room or music bed with no pauses is not “silent”)
    const st = US.dsp.levelStats(db), dead = st.speech < -60, thr = Math.min(st.auto, st.speech - 20), out = new Set();
    for (const l of lines || []) {
      const a = Math.max(0, Math.floor(l.start / 0.05)), b = Math.min(n, Math.ceil(l.end / 0.05));
      if (b <= a) continue;
      let loud = 0; for (let i = a; i < b; i++) if (db[i] >= thr && db[i] > -60) loud++;
      if (dead || loud < Math.max(2, 0.08 * (b - a))) out.add(l.id);
    }
    return out;
  }
  const confOf = c => (CONF.includes(c) ? c : 'unsure');
  const hasLetters = s => /[\p{L}\p{N}]/u.test(String(s || ''));
  function tidyHeard(x) {
    const said = clip(x && x.said, 80), tr = clip(x && x.transliteration, 80);
    if (!hasLetters(said) && !hasLetters(tr)) return null;
    // the transcript's own words given back as a “correction” (small models do this for every line) are no correction
    const same = (a, b) => a && b && wordsOf(a).join(' ') === wordsOf(b).join(' ');
    if (same(said, x.transcriptHad) && !['sarcasm', 'joke', 'quote', 'singing'].includes(x.kind)) return null;
    return { said: hasLetters(said) ? said : tr, tr: hasLetters(tr) && tr !== said ? tr : '', lang: clip(x.language, 24), meaning: clip(x.meaning, 100), had: clip(x.transcriptHad, 80), kind: KINDS.includes(x.kind) ? x.kind : 'other', conf: confOf(x.confidence) };
  }
  /** A line nobody could hear being spoken: it has no delivery score (why: 'model' said so, or the sound there is 'silent'). */
  const unheardEntry = (l, why) => ({ t: lineSig(l), start: l.start, end: l.end, score: null, notes: [], energy: '', in: true, out: true, conf: 'sure', heard: [], unheard: why });
  /**
   * A model's answer about one piece, tidied: only the ids it was given (each once), scores 1–5 or none, a few short
   * notes, and the times copied from the transcript. -> {lines: {id: entry}, missed: [{after, at, said…}]}
   */
  function tidy(r, piece) {
    const known = new Map(piece.lines.map(l => [String(l.id), l])), lines = {};
    for (const x of Array.isArray(r && r.lines) ? r.lines : []) {
      const l = x && known.get(String(x.id));
      if (!l || lines[l.id]) continue;
      // not heard being spoken (the model says so, or its notes do): no score, no notes – never a low score
      const au = AUDIBLE.includes(x.audible) ? x.audible : 'yes';
      if (au === 'no' || (Array.isArray(x.notes) ? x.notes : []).some(n => UNHEARD.test(String(n)))) { lines[l.id] = unheardEntry(l, 'model'); continue; }
      const sc = Math.round(+x.score), notes = Array.from(new Set((Array.isArray(x.notes) ? x.notes : []).map(n => clip(n, 28).toLowerCase().replace(/[.;\[\]]+/g, '').trim()).filter(hasLetters))).slice(0, 4);
      lines[l.id] = { t: lineSig(l), start: l.start, end: l.end, score: sc >= 1 && sc <= 5 ? sc : null, notes, energy: ENERGY.includes(x.energy) ? x.energy : '', in: x.cleanStart !== false, out: x.cleanEnd !== false, conf: confOf(x.confidence),
        heard: (Array.isArray(x.heard) ? x.heard : []).map(tidyHeard).filter(Boolean).slice(0, 6) };
      if (au === 'partly') lines[l.id].partly = true;
    }
    const missed = [];
    for (const m of Array.isArray(r && r.missed) ? r.missed : []) {
      const h = tidyHeard(m); if (!h) continue;
      const after = known.get(String(m.afterLine || ''));
      // when it is: the end of the line it follows, or the start of the piece – the transcript's times, not the model's
      missed.push({ after: after ? after.id : '', at: after ? after.end : piece.start, said: h.said, tr: h.tr, lang: h.lang, meaning: h.meaning, conf: h.conf });
    }
    return { lines, missed: missed.slice(0, 8) };
  }

  /** One heard word as it is written everywhere: “בעזרת השם” (b'ezrat Hashem, Hebrew: with God's help) */
  function heardText(h) {
    const inside = [h.tr, [h.lang, h.meaning].filter(Boolean).join(': ')].filter(Boolean).join(', ');
    return `“${h.said}”${inside ? ` (${inside})` : ''}`;
  }
  const HOW = { sarcasm: 'sarcastic', joke: 'a joke', quote: 'quoting someone', singing: 'sung' };
  /**
   * The short note that rides on a line in everything Story sends to its AI – and '' when there is nothing to say:
   * [delivery 4/5 – warm, laughs; says “בעזרת השם” (b'ezrat Hashem, Hebrew: with God's help)]
   */
  function noteOf(e, { max = 190, heard = 2 } = {}) {
    if (!e) return '';   // a line that couldn't be heard has no score and no notes – only a correction that was really heard
    const bits = [];
    let head = e.score ? `delivery ${e.score}/5` : '';
    const words = (e.notes || []).slice(0, 3);
    if (e.in === false) words.push('starts mid-word'); if (e.out === false) words.push('ends cut off');
    if (words.length) head += (head ? ' – ' : '') + words.join(', ');
    if (e.conf === 'unsure' && head) head += ' (unsure)';
    if (head) bits.push(head);
    for (const h of (e.heard || []).slice(0, heard)) {
      const how = HOW[h.kind];
      bits.push(how && !h.tr && h.had && h.said === h.had ? `${how}${h.meaning ? ': ' + h.meaning : ''}` : `${h.conf === 'unsure' ? 'may say' : how ? how + ', says' : 'says'} ${heardText(h)}`);
    }
    if (!bits.length) return '';
    let text = bits.join('; ');
    if (text.length > max) text = text.slice(0, max - 1).replace(/\s+\S*$/, '') + '…';
    return `[${text}]`;
  }
  /** What Story's AI is told once, wherever lines carry notes. */
  const HINT = 'Some lines end with a note in square brackets, made by listening to the recording: “delivery N/5” is how well the line is said (5 = clear, sure and usable as it is; 1 = stumbling, flat or cut off), then how it sounds; “says …” gives words the transcript got wrong, in the original language with their meaning. ' +
    'When two lines make the same point, prefer the better-delivered take; avoid a line marked as starting mid-word or ending cut off unless nothing else says it; read the corrected words as what was really said. The notes are not part of what was said – never quote them, and a line without a note simply hasn’t been listened to.';

  /** Several lines' entries as one (an answer of several lines in Pro View): the average score, the notes and the heard words together. */
  function combine(list) {
    const all = (list || []).filter(Boolean), es = all.filter(e => !e.unheard);
    if (!es.length) return all[0] || null;   // nothing in it could be heard: said as such
    if (es.length === 1) return es[0];
    const sc = es.filter(e => e.score).map(e => e.score);
    return { score: sc.length ? Math.round(sc.reduce((a, b) => a + b, 0) / sc.length) : null, notes: Array.from(new Set(es.flatMap(e => e.notes || []))).slice(0, 4), energy: es[0].energy || '', in: es[0].in !== false, out: es[es.length - 1].out !== false,
      conf: es.some(e => e.conf === 'unsure') ? 'unsure' : es[0].conf, heard: es.flatMap(e => e.heard || []), start: es[0].start, end: es[es.length - 1].end };
  }

  /* ---------- how long, how much ---------- */
  // used only until this computer has been measured (speed) – and for what a model writes back, which is never measured ahead
  const ASSUME = { localX: [0.5, 3], cloudSecPerAsk: [4, 12], outPerLine: [35, 90], promptTokens: 900 };
  /**
   * An honest estimate for some interviews. input: {seconds (of sound that would be sent), lines, chars (of their text)}.
   * -> {minutes, lines, local: {secs: [lo, hi], measured, x}, cloud: {model, label, usd: [lo, hi], secs, megabytes, date} | null}
   */
  function estimate(input, { chunk = 30, cloudChunk = 120, bench = {}, localModel = null, cloudModel = '', prices = null } = {}) {
    const secs = Math.max(0, +input.seconds || 0), lines = Math.max(0, +input.lines || 0), chars = Math.max(0, +input.chars || 0);
    const x = localModel && bench[localModel.id] ? bench[localModel.id] : 0;
    const local = { secs: x ? [secs / x, secs / x] : [secs / ASSUME.localX[1], secs / ASSUME.localX[0]], measured: !!x, x, model: localModel ? localModel.name : '', asks: Math.ceil(secs / chunk), usd: 0 };
    let cloud = null;
    if (cloudModel && prices) {
      const p = US.ai.mediaPrice(cloudModel), T = prices.tokens, asks = Math.max(lines ? 1 : 0, Math.ceil(secs / cloudChunk));
      const text = chars / 3.2 + lines * 12 + asks * ASSUME.promptTokens;
      const inTok = [secs * T.audioPerSec[0] + text, secs * T.audioPerSec[1] + text], outTok = [lines * ASSUME.outPerLine[0], lines * ASSUME.outPerLine[1]];
      cloud = { model: cloudModel, label: p.name, asks, usd: [(inTok[0] * p.in + outTok[0] * p.out) / 1e6, (inTok[1] * p.in + outTok[1] * p.out) / 1e6], secs: [asks * ASSUME.cloudSecPerAsk[0], asks * ASSUME.cloudSecPerAsk[1]], megabytes: Math.round(secs * 0.032 * 10) / 10, date: prices.date };
    }
    return { minutes: secs / 60, lines, local, cloud };
  }
  /** What one piece would cost at Google's paid rate, at most (for staying inside a limit). */
  function pieceUsd(piece, model) {
    const p = US.ai.mediaPrice(model), T = US.ai.MEDIA_PRICES.tokens, secs = piece.end - piece.start, chars = piece.lines.reduce((n, l) => n + lineText(l).length + 20, 0);
    return ((secs * T.audioPerSec[1] + chars / 3.2 + ASSUME.promptTokens) * p.in + piece.lines.length * ASSUME.outPerLine[1] * p.out) / 1e6;
  }

  /* =================== the project's choices =================== */
  const curProject = () => (US.ctx && US.ctx.project && (US.ctx.project.path || US.ctx.project.name)) || '';
  const pstore = () => US.projectStore(curProject() || 'none');
  const CLOUD_DEFAULT = 'gemini-3.8-flash';
  const cloudModels = () => Object.entries((US.ai && US.ai.MEDIA_PRICES && US.ai.MEDIA_PRICES.gemini) || {}).map(([id, m]) => ({ id, name: m.name, in: m.in, out: m.out }));
  /** Listening models Ultra Studio can run here: [{id, name, installed, model}] */
  function localModels() {
    const M = US.models; if (!M) return [];
    return M.list().filter(m => (m.use || []).includes('listening')).map(m => ({ id: m.id, name: m.name, installed: !!(M.installed(m.id) && M.runtime.installed()), model: m }));
  }
  /** The project's choices: {on, where: 'local'|'cloud', localModel, cloudModel, langs} – off until switched on. */
  function settings() {
    const s = pstore(), cm = String(s.get('delivery.cloudModel') || ''), ids = cloudModels().map(m => m.id);
    const here = localModels(), want = String(s.get('delivery.localModel') || ''), usual = String(US.settings.get('understand.listenModel') || '');
    const lm = here.find(m => m.id === want && m.installed) || here.find(m => m.id === usual && m.installed) || here.find(m => m.installed) || here.find(m => m.id === want) || null;
    return { on: s.get('delivery.on') === true, where: s.get('delivery.where') === 'cloud' ? 'cloud' : 'local', localModel: lm ? lm.id : '', cloudModel: ids.includes(cm) ? cm : (ids.includes(CLOUD_DEFAULT) ? CLOUD_DEFAULT : ids[0] || ''), langs: langsOf(s.get('delivery.langs')) };
  }
  const changed = () => { stamp++; US.bus.emit('delivery', status()); kick(); };
  function setOn(on) { pstore().set('delivery.on', !!on); changed(); }
  /** Where it happens. Choosing 'cloud' here does NOT give the consent: that is US.ai.setDelivery(true), after the editor's yes. */
  function setWhere(w) { pstore().set('delivery.where', w === 'cloud' ? 'cloud' : 'local'); if (w !== 'cloud' && US.ai && US.ai.setDelivery && US.ai.deliveryOn()) US.ai.setDelivery(false); changed(); }
  function setModel(where, id) { pstore().set(where === 'cloud' ? 'delivery.cloudModel' : 'delivery.localModel', String(id || '')); changed(); }
  function setLangs(l) { pstore().set('delivery.langs', langsOf(l)); changed(); }
  /**
   * Who would listen right now: {on, where, kind: 'helper'|'cloud'|'none', id, label, why, langs, chunkSec, model}.
   * why (when kind is 'none'): 'off' | 'offline' | 'consent' | 'key' | 'model' | 'deaf' (the model failed its hearing check).
   */
  function plan({ force = false } = {}) {
    // force: who would listen if asked now, whether or not Listen to delivery is switched on (Story › Translate by
    // listening is its own explicit action – with the same models, the same where and the same cloud consent)
    const s = settings(), out = { on: s.on || force, where: s.where, kind: 'none', id: '', label: '', why: '', langs: s.langs, chunkSec: 30, model: null };
    if (!s.on && !force) { out.why = 'off'; return out; }
    if (s.where === 'cloud') {
      const A = US.ai;
      if (!A || A.projectOffline()) out.why = 'offline';
      else if (!A.deliveryOn()) out.why = 'consent';
      else if (!US.secrets.get('geminiKey') || !s.cloudModel) out.why = 'key';
      else Object.assign(out, { kind: 'cloud', id: 'cloud:' + s.cloudModel, label: A.MEDIA_PRICES.gemini[s.cloudModel].name, chunkSec: 120, cloudModel: s.cloudModel });
      return out;
    }
    const m = localModels().find(x => x.id === s.localModel && x.installed);
    if (!m) { out.why = 'model'; return out; }
    const h = hearing()[m.id + '@' + m.model.version];
    if (h && h.ok === false) return Object.assign(out, { why: 'deaf', label: m.name, deaf: h });
    return Object.assign(out, { kind: 'helper', id: m.id + '@' + m.model.version, label: m.name, model: m.model, chunkSec: m.model.chunkSec || 30 });
  }

  /* =================== the interviews (from Story) =================== */
  /** Every interview Story knows: [{key, name, path, itemId, n, lines, seconds}] – lines keep the transcript's ids and times. */
  function interviews() {
    const S = US.story; if (!S || !S.state) return [];
    try { S.loadState(); } catch (e) { return []; }
    const st = S.state(); if (!st) return [];
    return (st.transcripts || []).map((t, i) => ({ key: t.key, name: t.name || `Interview ${i + 1}`, path: t.path || '', itemId: t.itemId || '', n: i + 1, lines: t.lines || [], seconds: (t.lines || []).reduce((n, l) => Math.max(n, +l.end || 0), 0) })).filter(t => t.lines.length);
  }
  /** The project's names and terms, as a hint for the listener (not the ones kept out of AI). */
  function terms() {
    try { return (US.story.glossary() || []).filter(e => e && e.right && !e.hide).map(e => String(e.right)).slice(0, 40); } catch (e) { return []; }
  }
  /** What would be sent for these interviews: {seconds, lines, chars, interviews} (the sound of the pieces, not of the gaps). */
  function totals(list = interviews(), chunk = 30) {
    const out = { seconds: 0, lines: 0, chars: 0, interviews: list.length, pieces: 0 };
    for (const iv of list) { const ps = pieces(iv.lines, iv.seconds + 1, { chunk }); out.pieces += ps.length; for (const p of ps) { out.seconds += p.end - p.start; out.lines += p.lines.length; out.chars += p.lines.reduce((n, l) => n + lineText(l).length, 0); } }
    return out;
  }

  /* =================== records: per media file, and a copy with the project =================== */
  const keyOf = p => US.fsx.mediaKey(p) + '-v' + VERSION;
  const mem = new Map();
  let stamp = 0;   // anything that changes what note() would say
  /** The file that travels with the project: “<project> – Delivery.json” in its JMG Ultra Studio folder. */
  function sharedFile() {
    let p = curProject();
    try { if (US.story && US.story.sharedProjectPath && US.story.sharedProjectPath()) p = US.story.sharedProjectPath(); } catch (e) { /* the project's own path */ }
    if (!p || !US.fsx.exists(p) || US.settings.get('story.withProject', true) === false) return '';
    try { return US.projectStore.sharedFile(p).replace(/ – Project\.json$/, ' – Delivery.json'); } catch (e) { return ''; }
  }
  const travelKey = p => US.basename(p).toLowerCase() + '|' + US.fsx.size(p);
  let shared = null, sharedFor = '';
  function sharedData() { const f = sharedFile(); if (f !== sharedFor) { sharedFor = f; shared = f ? US.fsx.readJSON(f, { v: VERSION, interviews: {} }) : null; if (shared && !shared.interviews) shared.interviews = {}; } return shared; }
  const writeShared = () => { const f = sharedFile(); if (f && shared && f === sharedFor) { try { US.fsx.writeJSON(f, Object.assign({ _about: 'JMG Ultra Studio – Listen to delivery: how each interview line is said, and the words the transcript got wrong. Kept here so the project opened on another computer has it.' }, shared)); } catch (e) { /* a read-only folder: this computer's copy is enough */ } } };
  const saveShared = US.debounce(writeShared, 1500);
  /** An interview's record as kept (null when there is none). */
  function peek(p) {
    if (!p) return null;
    const k = keyOf(p);
    if (mem.has(k)) return mem.get(k);
    let rec = null;
    try { rec = US.cache.get('delivery', k); } catch (e) { rec = null; }
    if (!rec) { const S = sharedData(), t = S && S.interviews[travelKey(p)]; if (t && t.v === VERSION) { rec = Object.assign({}, t, { path: p }); try { US.cache.set('delivery', k, rec); } catch (e) { /* kept in memory */ } } }
    if (rec && rec.v !== VERSION) rec = null;
    if (rec) mem.set(k, rec);
    return rec;
  }
  function save(iv, rec) {
    const k = keyOf(iv.path);
    rec.v = VERSION; rec.path = iv.path; rec.name = iv.name || US.basename(iv.path); rec.at = Date.now();
    mem.set(k, rec); stamp++;
    try { US.cache.set('delivery', k, rec); } catch (e) { /* disk full: kept in memory */ }
    const S = sharedData(); if (S) { const copy = Object.assign({}, rec); delete copy.path; S.interviews[travelKey(iv.path)] = copy; saveShared(); }
    return rec;
  }
  /** Is this interview's record what the current choices would make? */
  const fresh = (rec, iv, P) => !!rec && rec.by === P.id && rec.langs === langsKey(P.langs) && rec.sig === sigOf(iv.lines);
  /** Does this interview still need listening to with the current plan? (One with no media file can't be.) */
  function needs(iv, P = plan()) {
    if (P.kind === 'none' || !iv.path) return false;
    const rec = peek(iv.path);
    return !(fresh(rec, iv, P) && (rec.done || rec.cant));
  }

  /* ---------- a line's entry, for everything that shows or sends it ---------- */
  // asked once per line of every listing and list, so it is kept: made again when a record changes (stamp), the project
  // changes, or a moment has passed (the transcripts may have been read again – forLine checks each line anyway)
  let idx = null, idxKey = '', idxAt = 0;
  function index() {
    const key = `${curProject()}|${stamp}`;
    if (idx && key === idxKey && Date.now() - idxAt < 1500) return idx;
    const list = interviews(), m = new Map(), deaf = hearing();
    for (const iv of list) {
      const rec = iv.path ? peek(iv.path) : null;
      if (!rec || !rec.lines) continue;
      if (rec.where === 'local' && deaf[rec.by] && deaf[rec.by].ok === false) continue;   // a model that judged a silent clip: its scores aren't shown or sent
      for (const l of iv.lines) { const e = rec.lines[l.id]; if (e && e.t === lineSig(l)) m.set(l.id, e); }   // a line reworded since is left alone
    }
    idx = m; idxKey = key; idxAt = Date.now();
    return m;
  }
  const isOn = () => pstore().get('delivery.on') === true;
  /** Are there notes to use? (Switched on for the project, and at least one line listened to.) */
  const active = () => { try { return !!curProject() && isOn() && index().size > 0; } catch (e) { return false; } };
  /** A line's entry ({score, notes, energy, in, out, conf, heard, start, end}) or null – by the line or its id. Null when switched off. */
  function forLine(l) {
    const id = l && typeof l === 'object' ? l.id : l;
    if (!id || !active()) return null;
    const e = index().get(id);
    if (!e) return null;
    // the line as it is now (the transcripts may have been read again since): one reworded since it was heard is left alone
    let now = l && typeof l === 'object' && l.text != null && l.start != null ? l : null;
    if (!now) { try { now = US.story.lineOf(id) || null; } catch (x) { now = null; } }
    return !now || e.t === lineSig(now) ? e : null;
  }
  const forLines = ids => combine((ids || []).map(forLine));
  /** The bracketed note for a line in an AI request ('' when off, not listened to, or nothing to say), with a space before it. */
  function note(l) { const e = forLine(l); const n = e ? noteOf(e) : ''; return n ? ' ' + n : ''; }
  /** The sentence that explains the notes to an AI – only when this text carries some. */
  const promptHint = text => (text && /\[(delivery \d\/5|says |may say )/.test(String(text)) ? HINT : '');
  /** One line for Ask's and Producer's digest ('' when off or nothing is known). */
  function digestLine() {
    if (!active()) return '';
    const es = Array.from(index().values()), scored = es.filter(e => e.score), heard = es.reduce((n, e) => n + (e.heard || []).length, 0), by = Array.from(new Set(interviews().map(iv => iv.path && peek(iv.path)).filter(r => r && r.label).map(r => r.label))).join(', ');
    return `DELIVERY NOTES (Ultra Studio listened to the interviews${by ? ' with ' + by : ''}): ${scored.length} lines have a delivery score from 1 to 5 (how well the line is said) with notes on how it sounds${heard ? `, and ${heard} words or phrases the transcript got wrong are corrected (other languages, names, sarcasm)` : ''}. ` +
      'Story’s tools use them: asking the interviews for the “best-delivered” takes, or for where someone laughs, hesitates or speaks another language, works. A line with no note hasn’t been listened to.';
  }
  /**
   * Words heard that the project's Names and terms doesn't have, for the editor to add or not:
   * [{right, said, lang, meaning, heard: [what the transcript had], lines: [ids], count}] – only sure ones the transcript got wrong.
   */
  function heardTerms(glossary = null) {
    if (!active()) return [];
    const G = US.storyGlossary, bare = G ? G.bare : s => String(s).toLowerCase();
    let have = glossary; if (!have) { try { have = US.story.glossary(); } catch (e) { have = []; } }
    const known = new Set((have || []).flatMap(e => [e.right].concat(Array.isArray(e.heard) ? e.heard : String(e.heard || '').split(/[,;]/))).map(x => bare(x)).filter(Boolean));
    const by = new Map();
    for (const [id, e] of index()) for (const h of e.heard || []) {
      if (h.conf === 'unsure' || !h.had || !['word', 'name', 'place', 'religious', 'other'].includes(h.kind)) continue;
      const right = h.tr || h.said;
      if (!right || bare(right) === bare(h.had) || known.has(bare(right)) || known.has(bare(h.had))) continue;
      const k = bare(right); let x = by.get(k);
      if (!x) { x = { right, said: h.said, lang: h.lang, meaning: h.meaning, heard: [], lines: [], count: 0 }; by.set(k, x); }
      if (!x.heard.includes(h.had)) x.heard.push(h.had);
      if (!x.lines.includes(id)) x.lines.push(id);
      x.count++;
    }
    return Array.from(by.values()).sort((a, b) => b.count - a.count).slice(0, 40);
  }

  /* =================== the routes: sound in, a model's answer out =================== */
  // tests put stand-ins here
  const routes = {
    /** An interview's sound by a route that opens nothing; with heavy (Listen now, Overnight prep) the editor's app may render it. */
    async sound(iv, { heavy = false, job = null } = {}) {
      const item = { id: iv.itemId, path: iv.path, name: iv.name, duration: iv.seconds };
      if (US.understand && US.understand.routes && US.understand.routes.sound) return US.understand.routes.sound(item, { heavy, job });
      return US.audio.fileAudio(iv.path, { check: job && job.check ? () => job.check() : null });
    },
    /** One piece to the model the plan names. The cloud goes through US.ai.media – which checks this project's delivery consent itself. */
    async listen(P, req, opts = {}) {
      if (P.kind === 'cloud') return US.ai.media(Object.assign({}, req, { purpose: 'delivery', use: 'gemini:' + P.cloudModel, onUsage: opts.onUsage }));
      const url = await US.models.start(P.model.id, { job: opts.job });
      try { return await US.ai.localAt(Object.assign({}, req, { url, model: P.model.id, temperature: 0 })); } finally { US.models.touch(); }
    }
  };
  // the sound of the interview in hand, kept for a few minutes so a background slice doesn't read the file again each time
  let lastAudio = null, audioTimer = null;
  async function audioFor(iv, o) {
    if (lastAudio && lastAudio.path === iv.path) return lastAudio.a;
    const a = await routes.sound(iv, o);
    lastAudio = { path: iv.path, a };
    clearTimeout(audioTimer); audioTimer = setTimeout(() => { lastAudio = null; }, 180000); if (audioTimer && audioTimer.unref) audioTimer.unref();
    return a;
  }

  /* ---------- measured speed on this computer (seconds of sound per second of work) ---------- */
  const bench = () => Object.assign({}, US.settings.get('delivery.bench', {}));
  function noteSpeed(modelId, x) { if (!(x > 0) || !isFinite(x)) return; const b = bench(), old = b[modelId]; b[modelId] = Math.round((old ? old * 0.7 + x * 0.3 : x) * 100) / 100; US.settings.set('delivery.bench', b); }

  /* =================== listening to one interview =================== */
  const BAD_ANSWER = e => !!(e && (e.emptyAnswer || /didn’t make sense|empty answer/.test(String(e.title || ''))));
  /**
   * One piece of sound and its lines to the model. On this computer the model first writes down what it hears WITHOUT
   * the lines; a piece where nobody speaks is never judged, and a line whose words weren't heard gets no score whatever
   * the model then says. Every route: a line the model says it couldn't hear, or whose span is silent (quiet: Set of
   * ids), has no score. data: the piece's samples. -> {lines, missed, said}
   */
  async function listenPiece(P, iv, p, data, sr, { job = null, onUsage = null, terms: hint = [], quiet = null } = {}) {
    const wav = US.audio.wavBytes(data, sr), b64 = wav.toString('base64');
    let said = null, g = null;
    if (P.kind === 'helper') {
      said = saidOf(await routes.listen(P, hearRequest(iv, p, b64, wav.length), { job, onUsage }));
      g = ground(p, said);
      if (g.none) return { lines: Object.fromEntries(p.lines.map(l => [l.id, unheardEntry(l, 'model')])), missed: [], said: '' };
    }
    const t = tidy(await routes.listen(P, request(iv, p, b64, wav.length, P.langs, { terms: hint, said: said || '' }), { job, onUsage }), p);
    for (const l of p.lines) {
      const e = t.lines[l.id];
      if (!e || e.unheard) continue;
      if (quiet && quiet.has(l.id)) { t.lines[l.id] = unheardEntry(l, 'silent'); continue; }
      if (g && !g.ok.has(l.id)) {
        // other words were heard here than the transcript has: no score – but a correction made of words that WERE heard is kept
        const kept = (e.heard || []).filter(h => { const o = overlap(h.said, g.words); return o != null && o >= 0.6; });
        t.lines[l.id] = Object.assign(unheardEntry(l, 'words'), { heard: kept });
      }
    }
    if (g) t.missed = t.missed.filter(m => { const o = overlap(m.said, g.words); return o != null && o >= 0.6; });
    t.said = said || '';
    return t;
  }

  /* ---------- the hearing check: does a model on this computer listen, or read the transcript back? ---------- */
  const hearing = () => Object.assign({}, US.settings.get('delivery.hearing', {}));
  const CHECK_LINES = [{ id: 'h1', start: 0.5, end: 4, speaker: 'Ruth', text: 'We opened the bakery in nineteen sixty.' }, { id: 'h2', start: 4.5, end: 7.5, speaker: 'Ruth', text: 'And my mother never stopped working for a single day.' }];
  /**
   * A few seconds, once per model and version: near-silence and then a plain tone, each with two made-up transcript
   * lines. A model that gives any of those lines a score is judging from the text – it fails, and isn't used.
   * -> {ok, at, label, detail}
   */
  async function hearingCheck(P, job = null) {
    const sr = 16000, n = sr * 8, noise = new Float32Array(n), tone = new Float32Array(n);
    for (let i = 0; i < n; i++) { noise[i] = (((i * 1103515245 + 12345) >>> 8) % 1000 / 1000 - 0.5) * 0.002; tone[i] = 0.2 * Math.sin(2 * Math.PI * 440 * i / sr); }
    const piece = { start: 0, end: 8, lines: CHECK_LINES }, bad = [];
    job && job.set && job.set({ who: 'computer', msg: `Checking that ${P.label} really listens (a few seconds, once)` });
    for (const [what, data] of [['a silent clip', noise], ['a plain tone', tone]]) {
      job && job.check && job.check();
      const t = await listenPiece(P, { n: 1, name: 'hearing check' }, piece, data, sr, { job });
      for (const l of CHECK_LINES) { const e = t.lines[l.id]; if (e && !e.unheard && (e.score || (e.notes || []).length)) bad.push(`${what}: ${e.score ? e.score + '/5' : ''} ${(e.notes || []).join(', ')}`.trim()); }
    }
    return { ok: !bad.length, at: Date.now(), label: P.label, detail: bad.slice(0, 2).join('; ') };
  }
  routes.hearing = (P, job) => hearingCheck(P, job);
  /** The check's result for this plan's model – run now when it hasn't been (kept per model and version). */
  async function ensureHearing(P, job = null) {
    if (P.kind !== 'helper') return { ok: true };
    const had = hearing()[P.id];
    if (had) return had;
    const r = await routes.hearing(P, job);
    const all = hearing(); all[P.id] = r; US.settings.set('delivery.hearing', all); stamp++;
    US.bus.emit('delivery', status());
    return r;
  }
  /** Forget the check for the chosen local model, so it is made again at the next listen (Settings › “Check again”). */
  function forgetHearing() { const s = settings(), all = hearing(); for (const k of Object.keys(all)) if (k.indexOf(s.localModel + '@') === 0) delete all[k]; US.settings.set('delivery.hearing', all); changed(); }
  const DEAF = 'This model doesn’t seem to listen – it judged a silent clip from the transcript';
  /**
   * Listen to what an interview still needs – all of it, or until keepGoing() says stop (the rest is picked up next
   * time, from the piece it stopped at). limit: {left(): dollars} – a cloud piece that wouldn't fit isn't sent.
   * -> {rec, did, more, usd, paidUsd, skipped, stopped}
   */
  async function analyse(iv, { job = null, heavy = false, keepGoing = () => true, force = false, plan: given = null, limit = null } = {}) {
    const P = given || plan(), out = { rec: null, did: false, more: false, usd: 0, paidUsd: 0, skipped: '', stopped: '' };
    // nothing is ever sent when it is switched off – whoever calls
    if (!given && !P.on) throw new US.UserError('NOTHING_FOUND', { title: 'Listen to delivery is switched off for this project.', action: 'Switch it on in Story › 1 Interviews.' });
    if (P.kind === 'none') throw needError(P);
    if (!iv.path) { out.skipped = 'no-file'; return out; }
    let rec = force ? null : peek(iv.path);
    if (fresh(rec, iv, P) && rec.done) { out.rec = rec; return out; }
    rec = fresh(rec, iv, P) && !rec.cant ? Object.assign({}, rec, { lines: Object.assign({}, rec.lines), missed: (rec.missed || []).slice() })
      : { v: VERSION, by: P.id, label: P.label, where: P.kind === 'cloud' ? 'cloud' : 'local', langs: langsKey(P.langs), sig: sigOf(iv.lines), next: 0, total: 0, failed: 0, lines: {}, missed: [], done: false };
    delete rec.waiting;
    out.rec = rec;
    const onUsage = u => { out.usd += u.usd || 0; out.paidUsd += u.paidUsd || 0; };
    let a;
    try { a = await audioFor(iv, { heavy, job }); }
    catch (e) {
      if (e && e.code === 'CANCELLED') throw e;
      // can't be read without a render: it waits for Listen now or Overnight prep, and isn't tried again every few seconds
      if (heavy) { rec.cant = true; rec.why = 'its sound couldn’t be read'; } else rec.waiting = 'render';
      out.skipped = 'sound'; save(iv, rec); return out;
    }
    // a model on this computer is checked once: one that scores a silent clip is never asked about real ones
    if (P.kind === 'helper') { const h = await ensureHearing(P, job); if (h.ok === false) throw needError(Object.assign({}, P, { why: 'deaf', deaf: h })); }
    const ps = pieces(iv.lines, a.duration, { chunk: P.chunkSec }), hint = terms();
    if (!a.quiet || a.quietFor !== rec.sig) { a.quiet = silentLines(a.data, a.sr, iv.lines); a.quietFor = rec.sig; }
    rec.total = ps.length; rec.duration = a.duration;
    let lastBad = null;
    while (rec.next < ps.length) {
      if (!keepGoing()) { out.more = true; break; }
      job && job.check && job.check();
      const p = ps[rec.next];
      if (limit && P.kind === 'cloud' && pieceUsd(p, P.cloudModel) > limit.left() + 1e-9) { out.more = true; out.stopped = 'limit'; break; }
      job && job.set && job.set({ who: P.kind === 'cloud' ? 'ai' : 'computer', msg: `${P.label} is listening to ${iv.name} · ${fmtT(p.start)} of ${fmtT(a.duration)}` });
      const t0 = Date.now();
      let r = null;
      try { r = await listenPiece(P, iv, p, a.data.subarray(Math.floor(p.start * a.sr), Math.floor(p.end * a.sr)), a.sr, { job, onUsage, terms: hint, quiet: a.quiet }); }
      catch (e) {
        // an answer that can't be read (small models do this now and then): that piece is left out and said so; anything
        // else – no key, no consent, no connection, Stop – ends the run with what is done so far kept
        if (!BAD_ANSWER(e)) { save(iv, rec); throw e; }
        rec.failed = (rec.failed || 0) + 1; lastBad = e;
        if (rec.failed >= 3 && rec.failed > rec.next) { save(iv, rec); throw e; }   // nothing but bad answers: the model, not the piece
      }
      if (P.kind === 'helper') noteSpeed(P.model.id, (p.end - p.start) / Math.max(0.05, (Date.now() - t0) / 1000));
      if (r) { Object.assign(rec.lines, r.lines); rec.missed.push(...r.missed); }
      if (limit && limit.spend) limit.spend(out.paidUsd);
      rec.next++; out.did = true;
      save(iv, rec);
    }
    // not one piece could be read: that is the model, not the interview – nothing is kept as “done”
    if (rec.next >= ps.length && ps.length && (rec.failed || 0) >= ps.length) { rec.next = 0; rec.failed = 0; save(iv, rec); throw lastBad || new US.UserError('AI_FAILED', { title: 'The listening model’s answers didn’t make sense.', action: 'Try again, or choose another model in Settings › Listening models for Story.' }); }
    if (rec.next >= ps.length) { rec.done = true; rec.judged = Object.values(rec.lines).filter(e => !e.unheard).length; rec.unheard = Object.values(rec.lines).filter(e => e.unheard).length; save(iv, rec); }
    return out;
  }
  function needError(P) {
    const T = {
      off: ['Listen to delivery is switched off for this project.', 'Switch it on in Story › 1 Interviews.'],
      offline: ['This project is set to “nothing leaves this computer”.', 'Listen to delivery on this computer instead (Story › 1 Interviews › Listen to delivery), or change the project’s setting in Settings › AI.'],
      consent: ['Listening to delivery in the cloud isn’t switched on for this project on this computer.', 'Story › 1 Interviews › Listen to delivery: choose “Cloud” (you’re shown the cost first) – or listen on this computer.'],
      key: ['Cloud listening needs a Gemini key.', 'Add one in Settings › AI (Claude can’t hear), or listen on this computer.'],
      deaf: [`${DEAF}.`, 'So its scores would be made up, and nothing was kept. Choose another listening model in Settings › Listening models for Story, or choose Cloud there (Gemini hears properly).'],
      model: ['There’s no listening model on this computer yet.', 'Download one in Settings › Vision & listening models (Gemma 4 listens), or choose Cloud in Story › 1 Interviews › Listen to delivery.']
    }[P.why] || ['Nothing can listen to delivery yet.', 'Story › 1 Interviews › Listen to delivery.'];
    return new US.UserError(P.why === 'key' ? 'AI_KEY' : 'NOTHING_FOUND', { title: T[0], action: T[1] });
  }

  /* =================== the queue: quietly, on this computer only =================== */
  const HEAVY_SECS = 20 * 60;
  const Q = { running: false, timer: null, last: '', failed: 0, lastError: '', why: '' };
  let held = 0, started = false;
  const calm = () => (US.understand && US.understand.calm ? US.understand.calm() : { ok: !US.jobs.current, why: 'a job is running' });
  const backgroundOn = () => US.settings.get('understand.background') !== false;
  const heavyInBackground = () => US.settings.get('understand.heavyInBackground') === true;
  /** What's left: {todo: [interviews], seconds (of sound still to hear), secs: [lo, hi] on this computer, noFile, waitsForRender} */
  function backlog(P = plan()) {
    const list = interviews(), todo = [], out = { todo, total: list.length, noFile: list.filter(iv => !iv.path).length, waitsForRender: 0, cant: 0, seconds: 0, lines: 0, chars: 0, secs: [0, 0] };
    for (const iv of list) {
      const rec = iv.path ? peek(iv.path) : null, ok = fresh(rec, iv, P);
      if (ok && rec.cant) out.cant++;
      if (!needs(iv, P)) continue;
      if (ok && rec.waiting) out.waitsForRender++;
      todo.push(iv);
      const t = totals([iv], P.chunkSec), part = ok && rec.total ? 1 - rec.next / rec.total : 1;
      out.seconds += t.seconds * part; out.lines += Math.round(t.lines * part); out.chars += Math.round(t.chars * part);
    }
    const e = estimate(out, { chunk: P.chunkSec, bench: bench(), localModel: P.model });
    out.secs = e.local.secs; out.measured = e.local.measured;
    return out;
  }
  /**
   * Where things stand, in plain words. -> {on, where, state, text, note, total, done, waiting, by, offers: ['now', 'overnight', 'settings', 'models']}
   * state: 'off' | 'no-project' | 'no-interviews' | 'needs-model' | 'needs-consent' | 'needs-key' | 'offline' |
   *        'up-to-date' | 'working' | 'paused' | 'scheduled' | 'cloud-waiting'
   */
  function status() {
    const s = settings(), base = { on: s.on, where: s.where, by: '', total: 0, done: 0, waiting: 0, offers: [], note: '' };
    if (!s.on) return Object.assign(base, { state: 'off', text: 'Listen to delivery is off for this project' });
    if (!curProject()) return Object.assign(base, { state: 'no-project', text: 'No project open' });
    const P = plan(); base.by = P.label;
    const list = interviews();
    base.total = list.length;
    if (!list.length) return Object.assign(base, { state: 'no-interviews', text: 'No interviews yet – read the transcripts first' });
    if (P.why === 'offline') return Object.assign(base, { state: 'offline', text: 'This project is set to “nothing leaves this computer”', note: 'So the cloud can’t listen to it. Choose “This computer” below, or change the project’s setting in Settings › AI.', offers: ['settings'] });
    if (P.why === 'consent') return Object.assign(base, { state: 'needs-consent', text: 'Cloud is chosen, but nothing is sent until you say yes on this computer', note: 'You’re shown what would be sent and what it costs first.', offers: ['now'] });
    if (P.why === 'key') return Object.assign(base, { state: 'needs-key', text: 'Cloud listening needs a Gemini key', note: 'Claude can’t hear. Add a Gemini key in Settings › AI, or listen on this computer.', offers: ['settings'] });
    if (P.why === 'deaf') return Object.assign(base, { state: 'deaf', text: DEAF, note: `${P.label} gave a delivery score to made-up lines over ${P.deaf && P.deaf.detail ? P.deaf.detail.replace(/:.*$/, '') : 'a silent clip'}${P.deaf && P.deaf.detail ? ` (“${P.deaf.detail.replace(/^[^:]*: /, '')}”)` : ''}, so its scores can’t be trusted: none are kept, shown or sent to Story’s AI. Choose another listening model, or Cloud – Gemini hears properly.`, offers: ['settings', 'recheck'] });
    if (P.why === 'model') return Object.assign(base, { state: 'needs-model', text: 'No listening model on this computer yet', note: 'Download one in Settings › Vision & listening models (nothing is downloaded until you press Download), or choose Cloud.', offers: ['models'] });
    const B = backlog(P);
    base.waiting = B.todo.length; base.done = list.length - B.todo.length - B.noFile;
    const extra = [B.noFile ? `${US.plural(B.noFile, 'interview')} not linked to a media file can’t be listened to` : '', B.cant ? `${US.plural(B.cant, 'interview')} couldn’t be read` : ''].filter(Boolean).join(' · ');
    if (!B.todo.length) return Object.assign(base, { state: 'up-to-date', text: `Listened to ${base.done === list.length ? `all ${US.plural(list.length, 'interview')}` : `${base.done} of ${US.plural(list.length, 'interview')}`} with ${P.label}`, note: extra });
    if (Q.running) return Object.assign(base, { state: 'working', text: `Listening to delivery · ${base.done} of ${list.length} interviews done`, note: Q.last ? `Now: ${Q.last}` : '' });
    const left = `${US.plural(B.todo.length, 'interview')} to listen to (${US.fmtDur(B.seconds)} of speech)`;
    if (P.kind === 'cloud') return Object.assign(base, { state: 'cloud-waiting', text: `${left} – waiting for you`, note: `Sending sound costs money, so it is never done behind your back. ${P.label} listens when you press Listen now (you see the estimate first), or in Overnight prep within the limit you set.${extra ? ' ' + extra + '.' : ''}`, offers: ['now', 'overnight'] });
    const range = Math.abs(B.secs[0] - B.secs[1]) < 30 ? US.fmtDur(B.secs[1]) : `${US.fmtDur(B.secs[0])}–${US.fmtDur(B.secs[1])}`;
    const how = B.measured ? 'measured on this computer' : 'an assumption until it has run here';
    if (B.waitsForRender === B.todo.length) return Object.assign(base, { state: 'scheduled', text: `${US.plural(B.todo.length, 'interview')} can’t be read without a render`, note: 'Their sound can’t be read here directly, and nothing is rendered behind your back. Listen now or Overnight prep does it.', offers: ['now', 'overnight'] });
    const heavy = (B.secs[0] + B.secs[1]) / 2 > HEAVY_SECS && !heavyInBackground();
    if (heavy) return Object.assign(base, { state: 'scheduled', text: `${left} – too much to do while you edit`, note: `${P.label} would need about ${range} of this computer’s attention (${how}). It’s scheduled rather than started: add it to Overnight prep, or listen now anyway.`, offers: ['overnight', 'now'] });
    if (!backgroundOn()) return Object.assign(base, { state: 'paused', text: `${left} · background work is switched off`, offers: ['now', 'overnight'] });
    const c = calm();
    if (!c.ok) return Object.assign(base, { state: 'paused', text: `${left} · paused while ${c.why}`, note: 'It carries on by itself when things are quiet.', offers: ['now', 'overnight'] });
    return Object.assign(base, { state: 'working', text: `Listening in the background · ${base.done} of ${list.length} interviews done`, note: `About ${range} left (${how}).${Q.lastError ? ' Last try: ' + Q.lastError : ''}`, offers: ['now'] });
  }
  /** One small slice of background work, if it is on, on this computer, and the computer is calm. -> true when something was done */
  async function tick() {
    if (Q.running || held > 0 || !backgroundOn() || !curProject() || !US.story) return false;
    if (US.understand && US.understand.queue && US.understand.queue.running) return false;   // one thing at a time
    const P = plan();
    if (!P.on || P.kind !== 'helper') return false;   // off; or the cloud – never behind the editor's back
    if (!calm().ok) { Q.why = calm().why; return false; }
    if (Q.failed >= 3) return false;                   // something is wrong (a model that won't start…): wait to be asked
    const B = backlog(P);
    if ((B.secs[0] + B.secs[1]) / 2 > HEAVY_SECS && !heavyInBackground()) return false;
    const next = B.todo.find(iv => { const r = peek(iv.path); return !(fresh(r, iv, P) && r.waiting); });
    if (!next) return false;
    Q.running = true; Q.last = next.name;
    US.bus.emit('delivery', status());
    try {
      const t0 = Date.now();
      await analyse(next, { plan: P, keepGoing: () => Date.now() - t0 < 25000 && calm().ok && held === 0 && isOn() });
      Q.failed = 0; Q.lastError = '';
      return true;
    } catch (e) {
      Q.failed++; Q.lastError = (US.errors && US.errors.explain(e).title) || String(e && e.message || e);
      US.log('info', 'Listen to delivery (background): ' + Q.lastError, (US.errors && US.errors.explain(e).detail) || '', 'delivery');
      return false;
    } finally { Q.running = false; US.bus.emit('delivery', status()); }
  }
  function schedule(ms) { clearTimeout(Q.timer); Q.timer = setTimeout(async () => { let did = false; try { did = await tick(); } catch (e) { /* next time */ } schedule(did ? 4000 : 25000); }, ms); if (Q.timer && Q.timer.unref) Q.timer.unref(); }
  function kick() { if (started) schedule(3000); }
  /**
   * Listen to everything that's waiting, as a job (Listen now, Overnight prep). heavy: the editor's app may render sound
   * that can't be read otherwise. limitUsd: stop sending to the cloud before going over it (counted at the paid rate).
   * -> {summary, done, failed, skipped, usd, paidUsd, stopped}
   */
  async function runAll(job, { heavy = true, force = false, limitUsd = null, only = null } = {}) {
    const P = plan();
    if (P.kind === 'none') throw needError(P);
    const list = interviews().filter(iv => !only || only.includes(iv.key));
    if (!list.length) throw new US.UserError('NOTHING_FOUND', { title: 'There are no interviews to listen to yet.', action: 'Read the transcripts first (Story › 1 Interviews).' });
    const todo = list.filter(iv => iv.path && (force || needs(iv, P) || (heavy && (peek(iv.path) || {}).cant)));
    const out = { done: 0, failed: 0, skipped: 0, usd: 0, paidUsd: 0, already: list.filter(iv => iv.path).length - todo.length, noFile: list.filter(iv => !iv.path).length, stopped: '' };
    const limit = limitUsd != null && isFinite(+limitUsd) ? { left: () => +limitUsd - out.paidUsd - cur, spend: x => { cur = x; } } : null;
    let cur = 0, firstError = null;
    Q.running = true;
    try {
      for (let i = 0; i < todo.length; i++) {
        job.check();
        job.progress(i / todo.length, `${i + 1} of ${todo.length}: ${todo[i].name}`);
        Q.last = todo[i].name;
        try {
          if (heavy) { const r = peek(todo[i].path); if (r && (r.cant || r.waiting)) { const c = Object.assign({}, r); delete c.cant; delete c.waiting; mem.set(keyOf(todo[i].path), c); } }
          cur = 0;
          const r = await analyse(todo[i], { job, heavy, force, plan: P, limit });
          out.usd += r.usd; out.paidUsd += r.paidUsd; cur = 0;
          if (r.stopped === 'limit') { out.stopped = 'limit'; break; }
          if (r.skipped) out.skipped++; else out.done++;
        } catch (e) {
          if (e && e.code === 'CANCELLED') throw e;
          out.failed++; firstError = firstError || e;
          if (!(BAD_ANSWER(e)) || (out.failed >= 2 && !out.done)) break;   // a key, the consent, the model, the connection: the rest would fail the same way
        }
      }
    } finally { Q.running = false; Q.failed = 0; lastAudio = null; US.bus.emit('delivery', status()); }
    if (!out.done && !out.skipped && !out.stopped && firstError) throw firstError;
    const bits = [`${US.plural(out.done, 'interview')} listened to with ${P.label}`];
    if (out.already) bits.push(`${out.already} already done`);
    if (out.skipped) bits.push(`${out.skipped} couldn’t be read`);
    if (out.noFile) bits.push(`${out.noFile} not linked to a media file`);
    if (out.failed) bits.push(`${out.failed} didn’t work`);
    if (out.stopped === 'limit') bits.push(`stopped at the limit of ${US.ai.fmtUSD(+limitUsd)} – the rest waits`);
    if (out.paidUsd > 0.004) bits.push(`about ${US.ai.fmtUSD(out.paidUsd)} at Google’s paid rate (nothing within the free allowance)`);
    return Object.assign(out, { summary: bits.join(' · ') });
  }

  /* =================== the public API =================== */
  US.delivery = {
    VERSION, LANGS, KINDS, NOTE_WORDS, HINT, CLOUD_DEFAULT,
    /* what Story shows and sends */
    active, isOn, forLine, forLines, note, promptHint, digestLine, heardTerms, heardText, noteOf,
    /* the choices (per project) */
    settings, setOn, setWhere, setModel, setLangs, plan, localModels, cloudModels, langNames,
    /* the work */
    interviews, totals, status, backlog, needs, analyse, runAll, tick, kick, estimate, bench, routes, queue: Q, peek,
    /* does the local model really listen? */
    hearing, hearingCheck, ensureHearing, forgetHearing, listenPiece, DEAF,
    /** Hold the background queue (it finishes the piece in hand first). -> release() */
    async pause({ waitMs = 120000 } = {}) {
      held++; let done = false;
      const t0 = Date.now(); while (Q.running && Date.now() - t0 < waitMs) await new Promise(r => setTimeout(r, 200));
      return () => { if (!done) { done = true; held = Math.max(0, held - 1); kick(); } };
    },
    /** Everything kept about one interview's media file, taken away: -> what was there (give it to unforget()). */
    forget(p) {
      const k = keyOf(p), saved = { path: p, cache: null, shared: null };
      try { saved.cache = US.cache.get('delivery', k); } catch (e) { saved.cache = null; }
      try { require('fs').unlinkSync(US.cache.file('delivery', k)); } catch (e) { /* not there */ }
      mem.delete(k); stamp++;
      const S = sharedData(); if (S && S.interviews[travelKey(p)]) { saved.shared = S.interviews[travelKey(p)]; delete S.interviews[travelKey(p)]; saveShared(); }
      if (lastAudio && lastAudio.path === p) lastAudio = null;
      return saved;
    },
    unforget(saved) {
      if (!saved || !saved.path) return;
      const p = saved.path, k = keyOf(p);
      mem.delete(k); stamp++;
      try { if (saved.cache) US.cache.set('delivery', k, saved.cache); else require('fs').unlinkSync(US.cache.file('delivery', k)); } catch (e) { /* gone */ }
      const S = sharedData(); if (S) { if (saved.shared) S.interviews[travelKey(p)] = saved.shared; else delete S.interviews[travelKey(p)]; saveShared(); }
    },
    /** Write the travelling copy now (tests; before the project closes). */
    flush() { writeShared(); },
    /** Forget what's kept in memory (tests; after models change). */
    reset() { mem.clear(); shared = null; sharedFor = ''; idx = null; idxKey = ''; stamp++; lastAudio = null; Q.failed = 0; Q.lastError = ''; },
    _pure: { hearRequest, HEAR_SCHEMA, saidOf, ground, overlap, silentLines, unheardEntry, langsOf, langNames, langsKey, lineSig, sigOf, pieces, system, request, tidy, noteOf, combine, estimate, pieceUsd, SCHEMA, keyOf, sharedFile, travelKey, HEAVY_SECS, ASSUME }
  };

  US.bus.on('context', () => { idx = null; lastAudio = null; kick(); });
  US.bus.on('models', () => { Q.failed = 0; stamp++; US.bus.emit('delivery', status()); kick(); });
  US.bus.on('story-replaced', () => { stamp++; });
  US.bus.on('ready', () => { if (started) return; started = true; schedule(45000); });
})();
