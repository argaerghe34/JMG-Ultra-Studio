/* JMG Ultra Studio – Story › English translation: for interviews that aren't in English (Hebrew, Yiddish, Arabic,
   Russian…) – an English translation of every line, a full English transcript, and English subtitles.

   - The language of an interview is worked out here from its transcript's letters (cheap, on this computer) and can be
     set by hand. An interview in English is never offered a translation; one with phrases in another language is
     offered it for those lines only.
   - Translating uses the text AI the editor already uses (US.ai.json: Claude, Gemini or the reading model on this
     computer) – transcript text only, so the footage rule is untouched; names kept out of AI stay out; a project set
     to “nothing leaves this computer” is only translated by a model on this computer. Line by line in batches with the
     lines either side as context; the model gives back ids and English only – ids and times are the transcript's, always.
     When Listen to delivery corrected words in a line, the translator is told what was really said.
   - Kept per project (on this computer, and in “<project> – English.json” beside the project), carried on where it
     stopped, and made again only for lines whose text changed.
   - Out: an English transcript (Word, text or CSV; optionally the original beside the English, right-to-left set for
     Hebrew, Yiddish and Arabic), English subtitles for an interview (.srt / .vtt at the transcript's times), and
     English subtitles for a sequence at TIMELINE times (Story's own timeline reading and its caption command – the same
     in Premiere and Resolve). Nothing is burnt in.
   - Everything shown or written says it is an AI translation to check before publishing.

   Pure pieces first (unit-tested: US.storyEnglish._pure), then the store, the work, the files and the screens. */
(function () {
  'use strict';
  const US = window.US, h = US.h, ui = US.ui;
  const path = require('path'), fs = require('fs');
  const S = () => US.story, T = () => US.transcript, EX = () => US.storyExport, CAP = () => US.storyCaptions, SAI = () => US.storyAI;
  const VERSION = 1;
  const MARK = 'AI translation – check before publishing';
  const clip = (s, n) => { s = String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; };

  /* =================== which language? (letters and a few very common words – no model) =================== */
  // each alphabet as a character class (escapes, so the file itself stays plain to read)
  const CLASS = { hebrew: '\\u0590-\\u05FF\\uFB1D-\\uFB4F', arabic: '\\u0600-\\u06FF\\u0750-\\u077F\\uFB50-\\uFDFF\\uFE70-\\uFEFC', cyrillic: '\\u0400-\\u04FF', greek: '\\u0370-\\u03FF', latin: 'A-Za-z\\u00C0-\\u024F' };
  const SCRIPTS = {}, NOT = {};
  for (const k of Object.keys(CLASS)) { SCRIPTS[k] = new RegExp(`[${CLASS[k]}]`, 'g'); NOT[k] = new RegExp(`[^${CLASS[k]}\\s']+`, 'g'); }
  const set = s => new Set(s.split(' '));
  const YIDDISH = set('איז דער די דאס דאָס און נישט ניט וואס וואָס מיר זיי האט האָט געווען פון אויף מיט איך דו ער זי אַ אין צו ווי אויך נאָר אָבער זייער געזאגט געזאָגט'), YIDDISH_LETTERS = /[ײױװ]|אַ|אָ|פֿ|יִ/;
  const HEBREW = set('של את לא אני הוא היא זה על עם כי גם אבל היה מה יש אנחנו אתה הם כל כך אז רק או אם היתה הייתי שלי אותו'), HEBREW_PREFIX = /^(ש|וה|כש|מה|לה|שה)/;
  const LATIN = {
    English: set('the and of to is was that it in you for with on have this are not but they we my she he had what'),
    French: set('le la les des est et que je pas une un dans pour qui avec sur nous vous il elle ce mais ne se'),
    Spanish: set('el los las que y es en una por no un con para como pero su lo yo muy se del más qué'),
    German: set('der die das und ist nicht ich ein eine zu mit auf für wir sie es den dem war aber auch'),
    Italian: set('il lo gli che è non una per con sono ma come più mi si anche questo della'),
    Portuguese: set('o os as que é não uma para com em um mas como eu se mais muito também isso'),
    Dutch: set('de het een en is niet ik van dat op voor met zijn maar ook wij deze naar')
  };
  const RTL = new Set(['Hebrew', 'Yiddish', 'Arabic', 'Persian']);
  const LANGS = ['English', 'Hebrew', 'Yiddish', 'Arabic', 'Russian', 'French', 'Spanish', 'German', 'Italian', 'Portuguese', 'Dutch', 'Ukrainian', 'Persian', 'Greek'];
  const isRTL = lang => RTL.has(lang);
  const lettersOf = text => { const c = {}; let total = 0; for (const k of Object.keys(SCRIPTS)) { c[k] = (String(text || '').match(SCRIPTS[k]) || []).length; total += c[k]; } c.total = total; return c; };
  const wordsOf = text => String(text || '').toLowerCase().split(/[^\p{L}\p{M}']+/u).filter(Boolean);
  /** The language written in one script. */
  function langOfScript(script, text) {
    const ws = wordsOf(text);
    if (script === 'hebrew') {
      const yi = ws.filter(w => YIDDISH.has(w)).length + (YIDDISH_LETTERS.test(text) ? 2 : 0), he = ws.filter(w => HEBREW.has(w) || (w.length > 3 && HEBREW_PREFIX.test(w))).length;
      return yi > he ? 'Yiddish' : 'Hebrew';
    }
    if (script === 'arabic') return /[پچژگ]/.test(text) ? 'Persian' : 'Arabic';
    if (script === 'cyrillic') return /[іїєґ]/i.test(text) ? 'Ukrainian' : 'Russian';
    if (script === 'greek') return 'Greek';
    let best = 'English', n = 0, en = 0;
    for (const [lang, words] of Object.entries(LATIN)) { const k = ws.filter(w => words.has(w)).length; if (lang === 'English') en = k; if (k > n) { n = k; best = lang; } }
    return best !== 'English' && n >= 2 && n > en ? best : 'English';
  }
  /**
   * The language of some text: {lang ('' when it has no letters), others: [languages also in it], letters, rtl}.
   * A few words of another alphabet inside English (or the other way round) make it mixed: `others` names them.
   */
  function detect(text) {
    const t = String(text || '').replace(/\[[^\]]*\]/g, ' '), c = lettersOf(t);
    if (!c.total) return { lang: '', others: [], letters: 0, rtl: false };
    const order = Object.keys(SCRIPTS).filter(k => c[k]).sort((a, b) => c[b] - c[a]);
    const only = k => t.replace(NOT[k], ' ');   // just the words written in that alphabet
    const lang = langOfScript(order[0], only(order[0]));
    const others = order.slice(1).filter(k => c[k] >= 2).map(k => langOfScript(k, only(k))).filter(l => l !== lang);
    return { lang, others: Array.from(new Set(others)), letters: c.total, rtl: isRTL(lang) };
  }
  const CODES = { he: 'Hebrew', iw: 'Hebrew', yi: 'Yiddish', ji: 'Yiddish', ar: 'Arabic', ru: 'Russian', fr: 'French', es: 'Spanish', de: 'German', it: 'Italian', pt: 'Portuguese', nl: 'Dutch', uk: 'Ukrainian', fa: 'Persian', el: 'Greek', en: 'English' };
  /** A language name from what an editor's app says about a transcript (“he-IL”, “Hebrew”, “en-GB”) – '' when unknown. */
  function fromHint(h) { const s = String(h || '').trim().toLowerCase(); if (!s) return ''; const named = LANGS.find(l => l.toLowerCase() === s || s.indexOf(l.toLowerCase()) === 0); return named || CODES[s.slice(0, 2)] || ''; }
  /**
   * An interview's language from its lines: {lang, others: [{lang, lines}], foreign (lines not in English), lines, rtl}.
   * The language most of its letters are in; `set` (the editor's choice) wins, then what the lines show, then the app's hint.
   */
  function languageOf(lines, { hint = '', set: chosen = '' } = {}) {
    const by = new Map(), count = new Map();
    let foreign = 0, n = 0;
    for (const l of lines || []) {
      const d = detect(l.text); if (!d.lang) continue;
      n++;
      by.set(d.lang, (by.get(d.lang) || 0) + d.letters);
      for (const x of [d.lang].concat(d.others)) count.set(x, (count.get(x) || 0) + 1);
      if (d.lang !== 'English' || d.others.length) foreign++;
    }
    const seen = Array.from(by.entries()).sort((a, b) => b[1] - a[1]);
    // Latin letters can't tell a short interview's language for sure: there the app's own word for it counts
    const guess = seen.length ? seen[0][0] : '';
    const lang = chosen || (guess && guess !== 'English' ? guess : fromHint(hint) || guess || 'English');
    return { lang, detected: guess || 'English', others: Array.from(count.entries()).filter(([l]) => l !== lang).map(([l, k]) => ({ lang: l, lines: k })).sort((a, b) => b.lines - a.lines), foreign: lang === 'English' ? foreign : n, lines: n, rtl: isRTL(lang) };
  }
  /** Does this line need translating, in an interview in `lang`? Every line that says something when the interview isn't in English; in an English one, only lines with another language in them. */
  function needsEnglish(line, lang) {
    const d = detect(line.text);
    if (!d.lang) return false;
    return lang !== 'English' || d.lang !== 'English' || d.others.length > 0;
  }

  /* =================== translating: batches, the request, the answer =================== */
  const sig = l => US.fsx.hash(String(l.text == null ? '' : l.text).replace(/\s+/g, ' ').trim()).slice(0, 8);
  /**
   * The lines to translate in batches that fit one request, each with the lines just before and after it as context
   * (so a sentence that runs over two lines reads properly). all: the interview's lines in order; todo: the ones to do.
   * -> [{lines, before, after}]
   */
  function batches(all, todo, { max = 40, chars = 5000, context = 2 } = {}) {
    const at = new Map(all.map((l, i) => [l.id, i])), list = todo.filter(l => at.has(l.id)).sort((a, b) => at.get(a.id) - at.get(b.id)), out = [];
    let cur = [], c = 0;
    const flush = () => { if (!cur.length) return; const i0 = at.get(cur[0].id), i1 = at.get(cur[cur.length - 1].id); out.push({ lines: cur, before: all.slice(Math.max(0, i0 - context), i0), after: all.slice(i1 + 1, i1 + 1 + context) }); cur = []; c = 0; };
    for (const l of list) { const n = String(l.text).length + 20; if (cur.length && (cur.length >= max || c + n > chars)) flush(); cur.push(l); c += n; }
    flush();
    return out;
  }
  const SCHEMA = { type: 'object', additionalProperties: false, required: ['lines'], properties: { lines: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['id', 'en'], properties: { id: { type: 'string' }, en: { type: 'string' } } } } } };
  const SYSTEM = 'You translate the transcript of a filmed interview into English for a documentary editor, line by line. The lines to translate come under LINES (id, speaker, text); lines under CONTEXT are only there so you can follow the sentence – never translate or return them. ' +
    'Answer with one item for every id under LINES – the same ids, unchanged, no others – and its English in "en". Give no times and no ids of your own. ' +
    'Translate what the person says, in natural spoken English in their own register – not tidied up, not summarised, nothing added. A sentence that runs over several lines: translate it so the lines read on from each other, each line keeping its own part (subtitles are made line by line). ' +
    'Names of people and places are not translated: write them in Latin letters, with the spellings given under NAMES when they are there. Words that are already English stay as they are; a line that mixes languages becomes one natural English line. ' +
    'A phrase that carries its meaning as it is – a blessing, an idiom, a religious or cultural term, a quotation, a song – stays in the English, transliterated, followed by a short gloss in square brackets: “b’ezrat Hashem [with God’s help]”. ' +
    'The transcript was made by a machine and may be wrong; where a line says [really said: …], that is what was heard in the recording – translate that. ' +
    'Never invent: if a line can’t be understood, give "" for it. British English.';
  /** One row of a request: id, speaker, text – and what Listen to delivery heard there, when it corrected the transcript. */
  function rowOf(l, { speakerName = s => s, heardOf = () => [] } = {}) {
    const heard = (heardOf(l) || []).filter(x => x && x.said && x.conf !== 'unsure').slice(0, 3);
    return `${l.id}\t${speakerName(l.speaker) || '-'}\t${String(l.text).replace(/\s+/g, ' ').trim().slice(0, 1500)}` +
      (heard.length ? ` [really said: ${heard.map(x => `“${x.said}”${x.tr ? ` (${x.tr})` : ''}${x.had ? ` where the transcript has “${x.had}”` : ''}`).join('; ')}]` : '');
  }
  /** The request for one batch. o: {lang, n (interview number), terms: [spellings], speakerName, heardOf} – text only. */
  function request(batch, o = {}) {
    const row = l => rowOf(l, o), ctx = ls => ls.map(l => `(${o.speakerName ? o.speakerName(l.speaker) || '-' : l.speaker || '-'}) ${String(l.text).replace(/\s+/g, ' ').trim().slice(0, 400)}`).join('\n');
    const user = `Interview ${o.n || 1}. It is mostly in ${o.lang || 'another language'}.` +
      ((o.terms || []).length ? `\nNAMES (spell them like this): ${o.terms.slice(0, 60).join(', ')}` : '') +
      (batch.before.length ? `\nCONTEXT – the lines just before (do not translate):\n${ctx(batch.before)}` : '') +
      `\nLINES (id<TAB>speaker<TAB>text):\n${batch.lines.map(row).join('\n')}` +
      (batch.after.length ? `\nCONTEXT – the lines just after (do not translate):\n${ctx(batch.after)}` : '');
    return { system: SYSTEM, user, schema: SCHEMA, maxTokens: Math.min(16000, 800 + Math.ceil(batch.lines.reduce((n, l) => n + String(l.text).length, 0) * 1.2)), effort: 'low', feature: 'English translation' };
  }
  /** A model's answer for a batch: only the ids that were asked for (never a context line or one it made up), each once. -> Map id -> English */
  function readAnswer(r, batch) {
    const known = new Set(batch.lines.map(l => String(l.id))), out = new Map();
    for (const x of Array.isArray(r && r.lines) ? r.lines : []) {
      const id = String(x && x.id), en = clip(x && x.en, 2000);
      if (known.has(id) && !out.has(id) && en) out.set(id, en);
    }
    return out;
  }

  /* =================== subtitles =================== */
  /** The part of an English line that goes with a stretch of the original (f0–f1 of its length): words in proportion, with … where it is cut. */
  function sliceEnglish(en, f0, f1) {
    const ws = String(en || '').split(/\s+/).filter(Boolean), n = ws.length;
    if (!n) return '';
    const a = Math.max(0, Math.min(n - 1, Math.round(Math.max(0, f0) * n))), b = Math.max(a + 1, Math.min(n, Math.round(Math.min(1, f1) * n)));
    return (a > 0 ? '…' : '') + ws.slice(a, b).join(' ') + (b < n ? '…' : '');
  }
  /**
   * A sequence's entries (Story's timeline reading: each a transcript line as heard on the timeline, whole or cut by the
   * clip's in and out, once for every time it is used) as English at TIMELINE times.
   * lineOf(id) -> the line; enOf(line) -> its English ('' when there is none); isEnglish(line) -> the line is English already.
   * -> {entries: [{start, end, text, name, lineId}], missing (lines with no English yet)}
   */
  function englishEntries(entries, { lineOf, enOf, isEnglish = () => false }) {
    const out = [], miss = new Set();
    for (const e of entries || []) {
      const l = lineOf(e.lineId); if (!l) continue;
      let en = enOf(l);
      if (!en && isEnglish(l)) { out.push({ start: e.start, end: e.end, text: e.text, name: e.speaker || '', lineId: l.id }); continue; }
      if (!en) { miss.add(l.id); continue; }
      const dur = Math.max(0.01, l.end - l.start);
      if (e.partial) en = sliceEnglish(en, (e.srcIn - l.start) / dur, (e.srcOut - l.start) / dur);
      if (en) out.push({ start: e.start, end: e.end, text: en, name: e.speaker || '', lineId: l.id });
    }
    return { entries: out, missing: miss.size };
  }
  /** Subtitles to read: two lines of up to 42 characters, split in proportion to the time (Story's own caption splitting). */
  const cuesOf = entries => CAP().cues(entries.map(e => ({ start: e.start, end: e.end, text: e.text, name: e.name || '' })), { style: 'subtitles', names: false });
  const vttTime = sec => { const ms = Math.max(0, Math.round(sec * 1000)), p = (x, n = 2) => String(x).padStart(n, '0'); return `${p(Math.floor(ms / 3600000))}:${p(Math.floor(ms / 60000) % 60)}:${p(Math.floor(ms / 1000) % 60)}.${p(ms % 1000, 3)}`; };
  const toVTT = (cues, note = MARK) => `WEBVTT\n\nNOTE ${note}\n\n` + cues.map((c, i) => `${i + 1}\n${vttTime(c.start)} --> ${vttTime(c.end)}\n${c.text}\n`).join('\n');

  /* =================== the English transcript as a document =================== */
  /** d: {title, subtitle, lang, rtl, bilingual, rows: [{tc, speaker, en, orig, translated}]} */
  function docText(d) {
    const out = [d.title, d.subtitle, MARK.toUpperCase(), ''];
    for (const r of d.rows) { out.push(`${r.tc}  ${r.speaker ? r.speaker + ': ' : ''}${r.en || '[not translated]'}`); if (d.bilingual && r.orig && r.translated) out.push(`          ${r.orig}`); out.push(''); }
    return out.join('\n');
  }
  const csvCell = s => { s = String(s == null ? '' : s); return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  function docCSV(d) {
    const rows = [['Time in', 'Time out', 'Speaker', 'English (' + MARK + ')', `Original (${d.lang})`]];
    for (const r of d.rows) rows.push([r.tc, r.tcOut, r.speaker, r.en, r.translated ? r.orig : '']);
    return '\uFEFF' + rows.map(r => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
  }
  function docDocx(d) {
    const tc = r => ({ text: r.tc + '   ', mono: true, color: '808080', size: 18 }), who = r => (r.speaker ? [{ text: r.speaker + ': ', bold: true }] : []);
    const blocks = [{ paragraph: { spaceAfter: 200, runs: [{ text: MARK + '.', bold: true, color: '9A3B2E' }, { text: ` Translated from ${d.lang}${d.by ? ' by ' + d.by : ''}; the times and speakers are the transcript’s own.`, color: '666666' }] } }];
    if (d.bilingual) {
      // the original beside the English: its column runs right-to-left for Hebrew, Yiddish and Arabic
      const head = t => ({ runs: [{ text: t, bold: true, color: '444444' }] });
      blocks.push({ table: { widths: [1100, 4270, 4270], rows: [[head('Time'), head(`Original (${d.lang})`), head('English')]].concat(d.rows.map(r => [
        { runs: [{ text: r.tc, mono: true, color: '808080', size: 18 }] },
        { rtl: d.rtl && r.translated, runs: who(r).map(x => Object.assign({ rtl: d.rtl && r.translated }, x)).concat([{ text: r.orig, rtl: d.rtl && r.translated }]) },
        { runs: who(r).concat([{ text: r.en || '[not translated]', color: r.en ? undefined : '9A3B2E' }]) }])) } });
    } else for (const r of d.rows) blocks.push({ paragraph: { runs: [tc(r)].concat(who(r), [{ text: r.en || '[not translated]', color: r.en ? undefined : '9A3B2E' }]) } });
    return EX().docx({ title: d.title, subtitle: d.subtitle, blocks });
  }

  /* =================== what is kept: per project, here and beside the project =================== */
  const curProject = () => (US.ctx && US.ctx.project && (US.ctx.project.path || US.ctx.project.name)) || '';
  const localFile = () => path.join(US.fsx.dataDir, 'projects', US.fsx.hash(curProject() || 'none') + '-english.json');
  function sharedFile() {
    let p = curProject();
    try { if (S() && S().sharedProjectPath && S().sharedProjectPath()) p = S().sharedProjectPath(); } catch (e) { /* the project's own path */ }
    if (!p || !US.fsx.exists(p) || US.settings.get('story.withProject', true) === false) return '';
    try { return US.projectStore.sharedFile(p).replace(/ – Project\.json$/, ' – English.json'); } catch (e) { return ''; }
  }
  let data = null, dataFor = null, stamp = 0, idx = null, idxStamp = -1;
  const blank = () => ({ v: VERSION, interviews: {} });
  /** The project's translations: {v, interviews: {key: {lang, by, at, lines: {id: {s (the text it was made from), en}}}}} */
  function load() {
    const p = curProject();
    if (data && dataFor === p) return data;
    data = Object.assign(blank(), p ? US.fsx.readJSON(localFile(), blank()) : {}); dataFor = p; stamp++;
    if (!data.interviews || data.v !== VERSION) data = blank();
    // made on another computer: the copy beside the project fills in what this one doesn't have
    const sf = sharedFile(), other = sf ? US.fsx.readJSON(sf, null) : null;
    if (other && other.v === VERSION && other.interviews) for (const [k, iv] of Object.entries(other.interviews)) {
      const mine = data.interviews[k] || (data.interviews[k] = { lang: iv.lang, by: iv.by, at: iv.at, lines: {} });
      for (const [id, e] of Object.entries(iv.lines || {})) if (!mine.lines[id] || (iv.at || 0) > (mine.at || 0)) mine.lines[id] = e;
    }
    return data;
  }
  const writeLocal = () => { if (data && dataFor) { try { US.fsx.ensureDir(path.dirname(localFile())); US.fsx.writeJSON(localFile(), data); } catch (e) { /* kept in memory */ } } };
  const writeShared = () => { const sf = sharedFile(); if (sf && data && dataFor === curProject()) { try { US.fsx.writeJSON(sf, Object.assign({ _about: `JMG Ultra Studio – English translations of this project’s interviews (${MARK}). Kept here so the project opened on another computer has them.` }, data)); } catch (e) { /* a read-only folder */ } } };
  const saveSoon = US.debounce(writeShared, 1500);
  function save() { stamp++; writeLocal(); saveSoon(); }
  function index() {
    if (idx && idxStamp === stamp && dataFor === curProject()) return idx;
    const m = new Map(); for (const iv of Object.values(load().interviews)) for (const [id, e] of Object.entries(iv.lines || {})) m.set(id, e);
    idx = m; idxStamp = stamp;
    return m;
  }
  /** A line's English ('' when there is none, or the line's words have changed since it was translated). By the line or its id. */
  function enOf(l) {
    const line = l && typeof l === 'object' ? l : S() && S().lineOf ? S().lineOf(l) : null;
    if (!line || !line.id) return '';
    const e = index().get(line.id);
    return e && e.s === sig(line) ? e.en : '';
  }
  const has = () => { try { return !!curProject() && index().size > 0; } catch (e) { return false; } };

  /* ---------- the project's choices (kept with Story, so they travel) ---------- */
  function opts() { const st = S().state(); if (!st.english || typeof st.english !== 'object') st.english = {}; if (!st.english.langs) st.english.langs = {}; return st.english; }
  const showOn = () => { try { S().loadState(); const st = S().state(); return !!(st && st.english && st.english.show); } catch (e) { return false; } };
  function setShow(on) { opts().show = !!on; S().save(); US.bus.emit('english', {}); }
  function setLanguage(key, lang) { const o = opts(); if (lang) o.langs[key] = lang; else delete o.langs[key]; S().save(); US.bus.emit('english', {}); }
  const transcripts = () => { S().loadState(); return (S().state().transcripts || []).filter(t => (t.lines || []).length); };
  /**
   * Where an interview stands: {key, name, n, lang, set (chosen by hand), detected, others, english (nothing to
   * translate), need (lines that want English), done, todo: [lines], rtl, by}
   */
  function statusOf(t) {
    const o = opts(), L = languageOf(t.lines, { hint: t.language, set: o.langs[t.key] || '' });
    const need = t.lines.filter(l => needsEnglish(l, L.lang)), todo = need.filter(l => !enOf(l)), kept = load().interviews[t.key];
    return { key: t.key, name: t.name, n: S().state().transcripts.indexOf(t) + 1, lang: L.lang, set: !!o.langs[t.key], detected: L.detected, others: L.others, english: L.lang === 'English' && !need.length, mixed: L.lang === 'English' && need.length > 0,
      need: need.length, done: need.length - todo.length, todo, rtl: L.rtl, by: kept ? kept.by : '' };
  }
  const statuses = () => transcripts().map(statusOf);
  /** A line that is English already, in an interview where nothing about it needs translating. */
  const langMemo = new WeakMap();
  const langOfInterview = t => { const o = opts(), chosen = o.langs[t.key] || '', m = langMemo.get(t); if (m && m.n === t.lines.length && m.chosen === chosen) return m.lang; const lang = languageOf(t.lines, { hint: t.language, set: chosen }).lang; langMemo.set(t, { n: t.lines.length, chosen, lang }); return lang; };
  const isEnglishLine = l => { const t = S().interviewOf(l.id); return t ? !needsEnglish(l, langOfInterview(t)) : detect(l.text).lang === 'English'; };

  /* =================== translating =================== */
  function terms() { try { return (S().glossary() || []).filter(e => e && e.right && !e.hide).map(e => String(e.right)).slice(0, 60); } catch (e) { return []; } }
  const heardOf = l => { const D = US.delivery; if (!D || !D.forLine) return []; try { const e = D.forLine(l); return e ? e.heard || [] : []; } catch (e) { return []; } };
  /** The requests that would be made: [{t, st, batch, req}] – keys: these interviews (null: every one that isn't English); force: again, even where there is English. */
  function plan({ keys = null, force = false } = {}) {
    const out = [];
    for (const t of transcripts()) {
      if (keys && !keys.includes(t.key)) continue;
      const st = statusOf(t);
      if (!keys && st.lang === 'English') continue;   // “all interviews not in English” leaves English ones alone, mixed or not
      const todo = force ? t.lines.filter(l => needsEnglish(l, st.lang)) : st.todo;
      for (const b of batches(t.lines, todo)) out.push({ t, st, batch: b, req: request(b, { lang: st.lang, n: st.n, terms: terms(), speakerName: s => S().speakerName(s), heardOf }) });
    }
    return out;
  }
  /** What translating would take, in a sentence (for the buttons and the question before a big job). */
  function describePlan(p) {
    if (!p.length) return 'Everything that needs English has it.';
    const lines = p.reduce((n, x) => n + x.batch.lines.length, 0), c = SAI().cost(p.map(x => x.req));
    return SAI().describe(c, { lines });
  }
  /**
   * Translate (the rest of) some interviews – or all that aren't in English. Text only, through US.ai.json. Carries on
   * where it stopped: each batch is kept as it comes back. -> {summary, lines, interviews, missing}
   */
  async function translate(job, { keys = null, force = false } = {}) {
    S().loadState();
    if (!transcripts().length) throw new US.UserError('NOTHING_FOUND', { title: 'There are no transcripts yet.', action: 'Read them first in Story › 1 Interviews.' });
    const p = plan({ keys, force });
    if (!p.length) return { summary: keys ? 'Already translated – nothing to do' : 'No interviews need translating', lines: 0, interviews: 0, missing: '' };
    // text only – but a project set to “nothing leaves this computer” has only the model on this computer, or nothing
    if (!US.ai || !US.ai.available()) throw new US.UserError('AI_KEY', US.ai && US.ai.projectOffline && US.ai.projectOffline()
      ? { title: 'This project is set to “nothing leaves this computer”, and there’s no model on this computer to translate with.', action: 'Choose a model for reading and writing in Settings › Vision & listening models › Models on this computer – or change the project’s setting in Settings › AI.' }
      : { title: 'Translating needs AI.', action: 'Add a Claude or Gemini key in Settings › AI, or choose a model on this computer.' });
    if (p.length > 1 && US.ai.approveTotal) await US.ai.approveTotal(SAI().cost(p.map(x => x.req)).usd, `English translation (${p.length} requests)`);
    const D = load(), missing = [], done = new Set();
    let n = 0;
    for (let k = 0; k < p.length; k++) {
      job && job.check && job.check();
      const { t, st, batch, req } = p[k];
      job && job.set && job.set({ who: 'ai', msg: `${US.ai.label()} is translating ${t.name} (${st.lang}) · ${k + 1} of ${p.length}` });
      job && job.progress && job.progress(k / p.length);
      const info = {}, r = await SAI().ask(req, info);
      if (!r) { missing.push({ part: k + 1, of: p.length, lines: batch.lines.length, name: t.name, error: info.error }); continue; }
      const got = readAnswer(r, batch), iv = D.interviews[t.key] || (D.interviews[t.key] = { lines: {} });
      Object.assign(iv, { lang: st.lang, by: US.ai.label(), at: Date.now() });
      for (const l of batch.lines) if (got.has(l.id)) { iv.lines[l.id] = { s: sig(l), en: got.get(l.id) }; n++; }
      done.add(t.key);
      save();
    }
    if (missing.length === p.length) throw missing[0].error || new US.UserError('AI_FAILED');
    US.bus.emit('english', {});
    return { summary: `${US.plural(n, 'line')} translated into English in ${US.plural(done.size, 'interview')} · ${MARK}`, lines: n, interviews: done.size, missing: SAI().missingNote(missing) };
  }

  /* =================== files =================== */
  const fileSafe = n => String(n).replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim().slice(0, 80) || 'Interview';
  function uniquePath(f) { if (!fs.existsSync(f)) return f; const ext = path.extname(f), base = f.slice(0, f.length - ext.length); for (let i = 2; i < 500; i++) if (!fs.existsSync(`${base} (${i})${ext}`)) return `${base} (${i})${ext}`; return f; }
  const exportDir = sub => US.fsx.ensureDir(path.join(US.settings.get('story.exportDir') || path.join(US.fsx.exportsDir(), 'Transcripts'), sub || ''));
  const stampDate = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const tOf = key => { const t = transcripts().find(x => x.key === key); if (!t) throw new US.UserError('NOT_FOUND', { title: 'That interview isn’t in Story any more.' }); return t; };
  /** The document for one interview. tcOf(sec) -> the timecode to print. */
  function documentOf(t, { bilingual = false, tcOf = s => EX().tc(s, { fps: 25 }) } = {}) {
    const st = statusOf(t);
    return { title: `English transcript – ${t.name}`, subtitle: `${US.ctx.project ? US.ctx.project.name + ' · ' : ''}${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })} · translated from ${st.lang}`,
      lang: st.lang, rtl: st.rtl, by: st.by, bilingual,
      rows: t.lines.filter(l => detect(l.text).lang).map(l => { const need = needsEnglish(l, st.lang), en = need ? enOf(l) : l.text; return { tc: tcOf(l.start), tcOut: tcOf(l.end), speaker: l.speaker ? S().speakerName(l.speaker) : '', en, orig: l.text, translated: need }; }) };
  }
  /** Write an interview's full English transcript: docx | txt | csv, optionally with the original beside it. -> {file, summary} */
  async function exportTranscript(job, { key, format = 'docx', bilingual = false } = {}) {
    const t = tOf(key), st = statusOf(t);
    if (st.need && !st.done) throw new US.UserError('NOTHING_FOUND', { title: `“${t.name}” hasn’t been translated yet.`, action: 'Press Translate first (Story › 1 Interviews › English translation).' });
    // source timecode when the clip is known (as Story's other documents), else time from the start of the interview
    let tcOf = s => EX().tc(s, { fps: 25 });
    if (t.itemId) { try { job && job.set && job.set({ who: 'premiere', msg: 'Reading the source timecode' }); const it = (await US.host.call('storyTiming', { ids: [t.itemId] }))[t.itemId]; if (it && it.fps) tcOf = s => EX().tc(it.start + s, { fps: it.fps, drop: it.drop }); } catch (e) { /* time from the start */ } }
    const d = documentOf(t, { bilingual, tcOf }), body = format === 'docx' ? docDocx(d) : format === 'csv' ? docCSV(d) : docText(d);
    const file = uniquePath(path.join(exportDir(), `${fileSafe(t.name)} – English transcript${bilingual ? ' (with original)' : ''} ${stampDate()}.${format === 'docx' ? 'docx' : format === 'csv' ? 'csv' : 'txt'}`));
    fs.writeFileSync(file, body);
    const left = st.need - st.done;
    return { file, summary: `Saved “${US.basename(file)}” · ${US.plural(d.rows.length, 'line')}${left ? ` · ${left} not translated yet` : ''} · ${MARK}` };
  }
  /** Write an interview's English subtitles at the transcript's times: srt | vtt. -> {file, count, summary} */
  async function exportSubtitles(job, { key, format = 'srt' } = {}) {
    const t = tOf(key), st = statusOf(t);
    const entries = t.lines.map(l => ({ start: l.start, end: l.end, name: l.speaker || '', text: needsEnglish(l, st.lang) ? enOf(l) : (detect(l.text).lang ? l.text : '') })).filter(e => e.text);
    if (!entries.length) throw new US.UserError('NOTHING_FOUND', { title: `“${t.name}” hasn’t been translated yet.`, action: 'Press Translate first (Story › 1 Interviews › English translation).' });
    const cues = cuesOf(entries);
    const file = uniquePath(path.join(exportDir('Captions'), `${fileSafe(t.name)} – English subtitles (AI translation).${format === 'vtt' ? 'vtt' : 'srt'}`));
    fs.writeFileSync(file, format === 'vtt' ? toVTT(cues) : CAP().toSRT(cues));
    const left = st.need - st.done;
    return { file, count: cues.length, summary: `Saved “${US.basename(file)}” · ${US.plural(cues.length, 'subtitle')}${left ? ` · ${left} lines not translated yet` : ''} · ${MARK}` };
  }
  /**
   * English subtitles for a sequence, at timeline times: every interview line heard in it (whole, cut by a clip's in
   * and out, or used more than once) with its English. Writes the .srt and – with add – brings it into the project and
   * onto the sequence with Story's caption command (Resolve: into the Media Pool, to drag on, when it can't be placed).
   * -> {file, count, missing, added, summary}
   */
  async function sequenceSubtitles(job, { seqId = null, add = true, tracks = 'auto' } = {}) {
    const id = seqId || (US.ctx.sequence && US.ctx.sequence.id);
    if (!id) throw new US.UserError('NO_SEQUENCE');
    const tl = await S().timelineTranscript(job, { seqId: id, tracks });
    const r = englishEntries(tl.result.entries, { lineOf: x => S().lineOf(x), enOf, isEnglish: isEnglishLine });
    if (!r.entries.length) throw new US.UserError('NOTHING_FOUND', r.missing
      ? { title: `The interviews in “${tl.info.name}” haven’t been translated yet.`, action: 'Translate them first in Story › 1 Interviews › English translation.' }
      : { title: `None of the clips in “${tl.info.name}” have a transcript.`, action: 'Story needs the interviews’ transcripts first (Story › 1 Interviews).' });
    const cues = cuesOf(r.entries);
    const file = uniquePath(path.join(exportDir('Captions'), `${fileSafe(tl.info.name)} – English subtitles (AI translation).srt`));
    fs.writeFileSync(file, CAP().toSRT(cues));
    const note = r.missing ? ` · ${US.plural(r.missing, 'line')} not translated yet, left out` : '';
    if (add) {
      const bin = (US.settings.get('story.binBase') || 'JMG Ultra Studio/Story') + '/Captions';
      job && job.set && job.set({ who: 'premiere' }); job && job.progress && job.progress(0.7, `Adding ${US.plural(cues.length, 'subtitle')} to “${tl.info.name}”`);
      const res = await US.host.call('storyCaptions', { seqId: id, srt: file, binPath: bin });
      if (res && res.added === false) {
        ui.toast({ type: 'info', title: 'English subtitles saved – one step to do', text: `Drag “${US.basename(file)}” from the Media Pool (${bin}) to the start of the timeline.`, timeout: 20000 });
        return { file, count: cues.length, missing: r.missing, added: false, summary: `Saved “${US.basename(file)}” · ${US.plural(cues.length, 'subtitle')} (in the Media Pool, to drag onto the timeline)${note} · ${MARK}` };
      }
      return { file, count: cues.length, missing: r.missing, added: true, summary: `${US.plural(cues.length, 'English subtitle')} added to “${tl.info.name}”${note} · ${MARK}` };
    }
    return { file, count: cues.length, missing: r.missing, added: false, summary: `Saved “${US.basename(file)}” · ${US.plural(cues.length, 'subtitle')}${note} · ${MARK}` };
  }

  /* =================== what Story shows, finds and sends =================== */
  /** For a row sent to Story's AI: the English beside a line that isn't in English – only when there is one. */
  function note(l) { if (!l || !l.id || !has()) return ''; const en = enOf(l); return en && en !== String(l.text).trim() ? ` [English: ${clip(en, 320)}]` : ''; }
  const HINT = 'Lines that are not in English carry “[English: …]”: an AI translation of that line, there so you can read it. Name themes, write summaries and answer in English; the original words are what was said, and a quotation in a document should say it is a translation.';
  const promptHint = text => (text && /\[English: /.test(String(text)) ? HINT : '');
  /** Find: lines whose ENGLISH matches, added to a search's own results (best first; a line found both ways stays once). */
  const pseudo = new Map();
  function searchMore(query, lines, results = [], { limit = 200, minQuality = 0 } = {}) {
    if (!has() || !String(query || '').trim()) return results;
    const have = new Set(results.map(r => r.line.id)), list = [];
    for (const l of lines) {
      if (have.has(l.id)) continue;
      const en = enOf(l); if (!en) continue;
      let p = pseudo.get(l.id); if (!p || p.text !== en) { p = { id: l.id, start: l.start, end: l.end, speaker: l.speaker, text: en, _of: l }; pseudo.set(l.id, p); }
      p._of = l; list.push(p);
    }
    if (!list.length) return results;
    const more = T().search(query, list, { limit, minQuality: 0 }).filter(r => !minQuality || T().quality(r.line._of).score >= minQuality).map(r => ({ line: r.line._of, score: r.score, hits: r.hits.map(x => Object.assign({}, x, { english: true })), english: true }));
    return results.concat(more).sort((a, b) => b.score - a.score).slice(0, limit);
  }
  /** The English under a line in Story's lists (null when “Show English under each line” is off or there is none). */
  function lineEl(l, { always = false } = {}) {
    if (!always && !showOn()) return null;
    const en = enOf(l);
    return en ? h('div.eng-line', { title: MARK }, h('span.eng-mark', 'EN'), ' ', US.keep(en)) : null;
  }

  /* =================== Story › 1 Interviews: the card =================== */
  const openFile = (f, reveal) => (S().openFile ? S().openFile(f, reveal) : null);
  const savedToast = (x, what) => { ui.toast({ type: 'ok', title: `${what} saved`, text: US.basename(x.file), action: { label: US.fsx.isWin ? 'Show in Explorer' : 'Show in Finder', fn: () => openFile(x.file, true) } }); return x; };
  function card({ render }) {
    const list = statuses(), foreign = list.filter(s => !s.english && !s.mixed), mixed = list.filter(s => s.mixed), o = opts();
    const fmt = US.settings.get('story.englishFormat', 'docx'), both = !!US.settings.get('story.englishBilingual', false), sub = US.settings.get('story.englishSubs', 'srt');
    const run = (title, fn) => US.jobs.run({ title, tool: 'story' }, fn).then(x => { render(); return x; }).catch(e => { if (!(e instanceof US.UserError && e.code === 'CANCELLED')) ui.showError(e); render(); });
    const todoAll = foreign.reduce((n, s) => n + s.todo.length, 0), allPlan = todoAll ? describePlan(plan({})) : '';
    const langSel = s => ui.select({ options: [{ value: '', label: `Automatic – ${s.detected}` }].concat(LANGS.map(l => ({ value: l, label: l }))), value: s.set ? s.lang : '', onChange: x => { setLanguage(s.key, x); render(); } });
    const row = s => h('div.list-row.eng-row', { dataset: { english: s.key } },
      h('span.swatch', { style: { background: s.english ? 'var(--text-3)' : s.need && s.done === s.need ? 'var(--ok)' : 'var(--warn)' }, title: s.english ? 'In English' : s.done === s.need ? 'Translated' : 'Not translated yet' }),
      h('div.list-main',
        h('div.list-title', US.keep(s.name), ui.pill(s.lang, s.english ? 'var(--text-3)' : 'var(--accent)'), s.others.filter(x => x.lang !== 'English').slice(0, 2).map(x => ui.pill(`some ${x.lang}`, 'var(--text-2)'))),
        h('div.list-sub', s.english ? 'In English – nothing to translate.' : s.mixed ? `In English, with ${US.plural(s.need, 'line')} in another language · ${s.done} translated` : `${s.done} of ${US.plural(s.need, 'line')} translated${s.by ? ' by ' + s.by : ''}${s.done ? ' · ' + MARK : ''}`)),
      h('div.sel-right',
        h('span.eng-lang', { title: 'The interview’s language – set it by hand if Story has it wrong' }, langSel(s)),
        s.english ? null : ui.button(s.todo.length ? (s.done ? `Translate the rest (${s.todo.length})` : 'Translate') : 'Translated', { small: true, kind: s.todo.length && !s.mixed ? 'primary' : 'ghost', disabled: !s.todo.length, title: s.todo.length ? describePlan(plan({ keys: [s.key] })) : 'Every line has its English', onClick: () => run(`Translating ${s.name}`, job => translate(job, { keys: [s.key] })) }),
        s.done ? ui.button('English transcript', { small: true, title: 'The whole interview in English, with speakers and timecodes – in the format chosen below', onClick: () => run('Saving the English transcript', async job => savedToast(await exportTranscript(job, { key: s.key, format: fmt, bilingual: both }), 'English transcript')) }) : null,
        s.done ? ui.button('English subtitles', { small: true, title: `An .${sub} file at the interview’s own times – two lines of up to 42 characters`, onClick: () => run('Saving the English subtitles', async job => savedToast(await exportSubtitles(job, { key: s.key, format: sub }), 'English subtitles')) }) : null));
    const any = list.some(s => s.done), seq = US.ctx.sequence;
    const body = [
      h('div.field-hint', 'For interviews that aren’t in English: Story translates every line (the lines either side are read too, so sentences run on properly), keeps names as names, and keeps a blessing or an idiom in the original with a short gloss. The line’s own times never change – so the English can be a full transcript, subtitles for the interview, or subtitles on a sequence you have cut. Only transcript text is sent, to the AI you already use.'),
      list.length ? h('div.list.eng-list', list.map(row)) : h('div.field-hint', 'No interviews yet.'),
      foreign.length ? h('div.row', ui.button(todoAll ? `Translate all interviews not in English (${US.plural(todoAll, 'line')})` : 'All translated', { kind: todoAll ? 'primary' : 'ghost', small: true, disabled: !todoAll, title: allPlan, onClick: () => run('Translating the interviews into English', job => translate(job, {})) }),
        h('span.field-hint.grow', allPlan)) : null,
      !foreign.length && !mixed.length && list.length ? h('div.field-hint', 'All your interviews are in English, so there’s nothing to translate. If one isn’t, set its language on its row.') : null,
      any ? ui.note(`${MARK}. A machine made these translations: read them against the original (or ask someone who speaks the language) before they go on screen or to a client.`, 'warn') : null,
      any || foreign.length ? ui.toggle({ label: 'Show English under each line', hint: 'In Story’s lists and Pro View. The original stays the line you cut with; Find and Pro View’s filter search the English as well.', value: !!o.show, onChange: x => { setShow(x); render(); } }) : null,
      any ? h('div.row.eng-opts',
        ui.field('Transcript format', ui.select({ options: [{ value: 'docx', label: 'Word (.docx)' }, { value: 'txt', label: 'Text (.txt)' }, { value: 'csv', label: 'Spreadsheet (.csv)' }], value: fmt, onChange: x => { US.settings.set('story.englishFormat', x); render(); } })),
        ui.field('Subtitle format', ui.select({ options: [{ value: 'srt', label: 'SubRip (.srt)' }, { value: 'vtt', label: 'WebVTT (.vtt)' }], value: sub, onChange: x => { US.settings.set('story.englishSubs', x); render(); } }))) : null,
      any ? ui.toggle({ label: 'Original beside the English', hint: 'Two columns in the Word document (Hebrew, Yiddish and Arabic set right-to-left); the original under each line in the text file.', value: both, onChange: x => { US.settings.set('story.englishBilingual', x); render(); } }) : null,
      any ? h('div.row', ui.button('Add English subtitles to the open sequence', { small: true, icon: 'film', disabled: !seq, title: seq ? 'Every interview line heard in the open sequence, in English, at the sequence’s own times – as a caption track, never burnt in' : 'Open a sequence first', onClick: () => run('Adding English subtitles', job => sequenceSubtitles(job, {})) }),
        h('span.field-hint.grow', seq ? ['For “', US.keep(seq.name), '”: an .srt at timeline times, brought into the project and put on the sequence as captions.'] : 'Open the sequence you have cut to subtitle it.')) : null
    ];
    return ui.section('English translation', body, { open: foreign.length > 0 || mixed.length > 0, hint: foreign.length ? `${US.plural(foreign.length, 'interview')} not in English${todoAll ? '' : ' · translated'}` : mixed.length ? `${US.plural(mixed.reduce((n, s) => n + s.need, 0), 'line')} in another language` : 'your interviews are in English' });
  }

  US.storyEnglish = {
    VERSION, MARK, LANGS, HINT,
    detect, languageOf, isRTL, statusOf, statuses, setLanguage, setShow, showOn, has, enOf, note, promptHint, searchMore, lineEl,
    plan, describePlan, translate, exportTranscript, exportSubtitles, sequenceSubtitles, documentOf, card,
    /** Write the copy beside the project now (tests; before the project closes). */
    flush() { writeLocal(); writeShared(); },
    /** Forget what's in memory (tests; another project). */
    reset() { data = null; dataFor = null; idx = null; stamp++; pseudo.clear(); },
    /** One interview's translations taken away -> what was there (give it to unforget()). */
    forget(key) { const D = load(), was = D.interviews[key] || null; delete D.interviews[key]; save(); return { key, was }; },
    unforget(saved) { if (!saved) return; const D = load(); if (saved.was) D.interviews[saved.key] = saved.was; else delete D.interviews[saved.key]; save(); },
    _pure: { langOfScript, fromHint, needsEnglish, sig, batches, request, rowOf, readAnswer, SCHEMA, SYSTEM, sliceEnglish, englishEntries, cuesOf, toVTT, docText, docCSV, docDocx, sharedFile, localFile }
  };
  US.bus.on('context', () => { if (dataFor !== curProject()) { data = null; idx = null; } });

  /* =================== Ask, Producer, recipes and the offline parser =================== */
  const keysFor = name => { const q = String(name || '').trim().toLowerCase(); if (!q) return null; const hit = transcripts().filter(t => t.name.toLowerCase().includes(q)); if (!hit.length) throw new US.UserError('NOT_FOUND', { title: `No interview is called “${name}”.`, action: 'Leave the name out to do every interview that isn’t in English.' }); return hit.map(t => t.key); };
  US.actions.register({
    id: 'story.translate', tool: 'story', title: 'Translate interviews into English', changes: false,
    describe: 'Translates the transcript lines of interviews that are not in English (Hebrew, Yiddish, Arabic, Russian…) into English, line by line, keeping every line’s id and times. Text only. Only lines without English yet are done. The result is an AI translation to check before publishing.',
    params: { interview: { type: 'string', default: '', desc: 'Part of one interview’s name – empty for every interview that isn’t in English' } },
    examples: ['translate the interviews into English', 'translate the Hebrew interview'],
    match: t => (/\btranslat\w*\b/i.test(t) && /\b(interviews?|transcripts?|hebrew|yiddish|arabic|russian|english)\b/i.test(t) && !/\bsubtitles?\b/i.test(t) ? { _score: 2.6 } : null),
    run: async (p, job) => translate(job, { keys: keysFor(p.interview) })
  });
  US.actions.register({
    id: 'story.englishTranscript', tool: 'story', title: 'Save the English transcript of an interview', changes: false,
    describe: 'Writes the full English transcript of translated interviews as a document (Word, text or CSV) with speakers and timecodes; optionally the original beside the English. Marked as an AI translation. Translate first (story.translate).',
    params: { interview: { type: 'string', default: '', desc: 'Part of one interview’s name – empty for every translated interview' }, format: { type: 'string', default: 'docx', options: ['docx', 'txt', 'csv'], desc: 'docx, txt or csv' }, bilingual: { type: 'boolean', default: false, desc: 'The original beside the English' } },
    examples: ['save the English transcript', 'export a bilingual transcript of the Hebrew interview'],
    match: t => (/\benglish transcript\b|\b(bilingual|translated) transcript\b/i.test(t) ? { _score: 2.7, bilingual: /bilingual|original/i.test(t) } : null),
    run: async (p, job) => {
      const keys = keysFor(p.interview) || statuses().filter(s => s.done).map(s => s.key), files = [];
      if (!keys.length) throw new US.UserError('NOTHING_FOUND', { title: 'No interview has been translated yet.', action: 'Translate first: Story › 1 Interviews › English translation.' });
      for (const key of keys) files.push(await exportTranscript(job, { key, format: ['docx', 'txt', 'csv'].includes(p.format) ? p.format : 'docx', bilingual: !!p.bilingual }));
      return { file: files[0].file, files: files.map(f => f.file), summary: files.length === 1 ? files[0].summary : `${US.plural(files.length, 'English transcript')} saved in ${US.fsx.pretty ? US.fsx.pretty(path.dirname(files[0].file)) : path.dirname(files[0].file)} · ${MARK}` };
    }
  });
  US.actions.register({
    id: 'story.englishSubtitles', tool: 'story', title: 'Add English subtitles to the open sequence', changes: true,
    describe: 'Makes English subtitles for the open sequence from the translated interview lines heard in it, at timeline times (lines cut by a clip’s in and out, or used twice, included), writes an .srt, brings it into the project and puts it on the sequence as a caption track. Never burnt in. Marked as an AI translation. Translate first (story.translate).',
    params: { add: { type: 'boolean', default: true, desc: 'Put the subtitles on the sequence (false: only write the .srt file)' } },
    examples: ['add English subtitles to this sequence', 'subtitle the cut in English'],
    match: t => (/\benglish (subtitles?|captions?)\b|\bsubtitles? .*\bin english\b/i.test(t) ? { _score: 2.8 } : null),
    run: async (p, job) => sequenceSubtitles(job, { add: p.add !== false })
  });
})();
