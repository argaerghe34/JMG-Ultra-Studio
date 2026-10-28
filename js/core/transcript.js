/* JMG Ultra Studio – transcripts: reading them (Premiere's own, SRT, VTT, CSV, text, JSON), turning them into
   lines, searching them (words, phrases, near-misses, related words), scoring soundbites and grouping themes.
   Pure logic: no Premiere calls here, so it is unit-tested in Node (dev/tests/transcript.test.js). */
(function () {
  'use strict';
  const US = window.US;
  const TICKS = 254016000000;

  /* =================== text helpers =================== */
  const STOP = new Set(('a an and are as at be been but by can could did do does doing don’t dont for from had has have having he her here hers him his how i i’m im if in into is it its it’s just me my myself no nor not of off on once only or other our out over own same she should so some such than that that’s the their theirs them then there these they this those through to too under until up very was we were what when where which while who whom why will with would you your yours ' +
    'yeah yes okay ok oh well really actually also got get gets going go went gonna wanna thing things lot lots bit kind sort mean know like think said say says ' +
    'um uh er erm ah hmm mm mhm about it\'s that\'s there\'s what\'s they\'re we\'re you\'re i\'ve we\'ve you\'ve i\'ll you\'ll we\'ll didn\'t can\'t isn\'t wasn\'t doesn\'t won\'t wouldn\'t couldn\'t').split(/\s+/)
    .map(w => w.replace(/[’‘]/g, "'"))); // words are compared after norm(), which straightens apostrophes
  const FILLERS = ['um', 'uh', 'er', 'erm', 'ah', 'hmm', 'you know', 'i mean', 'sort of', 'kind of', 'like i said', 'basically', 'literally'];
  const EMOTION = new Set(('love loved loving proud scared afraid fear cried cry tears laugh laughed happy happiest sad grateful thankful blessed lucky miss missed remember remembered never always first last ' +
    'heart hope dream dreams beautiful amazing incredible terrible hard difficult worst best moment moments forever changed life lives family mother father mum dad grandmother grandfather children kids home ' +
    'god faith believe war survived lost found together alone lonely joy pain courage strength').split(/\s+/));

  /** Related words (first word is the group name). Used for search expansion and offline themes. */
  const SYNONYMS = [
    ['family', 'families', 'mother', 'mum', 'mom', 'mummy', 'father', 'dad', 'daddy', 'parent', 'parents', 'grandmother', 'grandfather', 'grandma', 'grandpa', 'granny', 'grandparents', 'grandchildren', 'grandkids', 'children', 'child', 'kids', 'son', 'daughter', 'brother', 'sister', 'sibling', 'siblings', 'wife', 'husband', 'married', 'marriage', 'wedding', 'cousin', 'uncle', 'aunt', 'nephew', 'niece', 'baby', 'babies', 'relatives'],
    ['faith', 'god', 'belief', 'believe', 'religion', 'religious', 'pray', 'prayer', 'prayers', 'praying', 'shul', 'synagogue', 'torah', 'jewish', 'judaism', 'shabbat', 'shabbos', 'sabbath', 'rabbi', 'church', 'mitzvah', 'mitzvot', 'kosher', 'holy', 'spiritual', 'soul', 'tradition', 'traditions', 'yom', 'kippur', 'rosh', 'hashanah', 'pesach', 'passover', 'chanukah', 'hanukkah', 'seder', 'bible', 'blessing'],
    ['volunteering', 'volunteer', 'volunteers', 'volunteered', 'help', 'helping', 'helped', 'charity', 'charities', 'give', 'giving', 'gave', 'donate', 'donation', 'donated', 'community', 'communities', 'support', 'supporting', 'service', 'kindness', 'kind', 'neighbour', 'neighbours', 'neighbor', 'organisation', 'organization', 'fundraising', 'chesed', 'tzedakah'],
    ['childhood', 'remember', 'remembered', 'memory', 'memories', 'grew', 'growing', 'young', 'younger', 'little', 'boy', 'girl', 'teenager', 'youth', 'nostalgia', 'past'],
    ['education', 'school', 'schools', 'learn', 'learned', 'learning', 'learnt', 'teacher', 'teachers', 'teach', 'taught', 'study', 'studied', 'studying', 'university', 'college', 'yeshiva', 'seminary', 'class', 'lesson', 'lessons', 'student', 'students'],
    ['work', 'job', 'jobs', 'career', 'business', 'company', 'office', 'boss', 'profession', 'retire', 'retired', 'retirement', 'worked', 'working', 'shop', 'factory', 'employer'],
    ['hardship', 'lost', 'loss', 'died', 'death', 'dying', 'passed', 'grief', 'grieving', 'hard', 'difficult', 'struggle', 'struggled', 'suffering', 'sick', 'illness', 'ill', 'cancer', 'hospital', 'fear', 'afraid', 'scared', 'war', 'holocaust', 'survived', 'survivor', 'refugee', 'pain', 'tragedy', 'funeral'],
    ['future', 'hope', 'hopes', 'hoping', 'dream', 'dreams', 'generation', 'generations', 'legacy', 'tomorrow', 'plan', 'plans', 'wish', 'next', 'grandchildren', 'continue', 'pass'],
    ['gratitude', 'grateful', 'thankful', 'thank', 'thanks', 'lucky', 'blessed', 'happy', 'happiness', 'joy', 'joyful', 'love', 'loved', 'proud', 'pride', 'wonderful', 'amazing', 'beautiful', 'appreciate'],
    ['places', 'travel', 'travelled', 'traveled', 'trip', 'journey', 'moved', 'move', 'emigrated', 'immigrated', 'country', 'city', 'town', 'abroad', 'visit', 'visited', 'israel', 'london', 'america', 'europe', 'jerusalem', 'flight', 'plane', 'home'],
    ['loneliness', 'lonely', 'alone', 'isolated', 'isolation', 'loneliness', 'missing', 'miss', 'missed'],
    ['food', 'food', 'cook', 'cooking', 'cooked', 'kitchen', 'meal', 'meals', 'dinner', 'lunch', 'recipe', 'bake', 'baking', 'eat', 'eating', 'table'],
    ['music', 'music', 'song', 'songs', 'sing', 'singing', 'sang', 'band', 'concert', 'dance', 'dancing', 'choir', 'piano', 'guitar']
  ];
  const THEME_NAMES = { family: 'Family', faith: 'Faith & tradition', volunteering: 'Community & giving', childhood: 'Growing up & memories', education: 'School & learning', work: 'Work', hardship: 'Hard times', future: 'Hope & the future', gratitude: 'Gratitude & joy', places: 'Places & journeys', loneliness: 'Loneliness', food: 'Food & home', music: 'Music' };

  function norm(s) { return String(s || '').toLowerCase().replace(/[’‘`]/g, "'").replace(/[“”]/g, '"'); }
  function tokens(s) { return (norm(s).match(/[a-z0-9À-ɏ֐-׿']+/g) || []).map(t => t.replace(/^'+|'+$/g, '')).filter(Boolean); }

  /** Light English stemmer – the same on both sides, so “volunteering” and “volunteered” meet. */
  function stem(w) {
    w = String(w).toLowerCase().replace(/'s$/, '').replace(/'/g, '');
    if (w.length < 4) return w;
    let s = w;
    if (/ies$/.test(s) && s.length > 4) s = s.slice(0, -3) + 'y';
    else if (/ied$/.test(s) && s.length > 4) s = s.slice(0, -3) + 'y';
    else if (/(ches|shes|sses|xes|zes)$/.test(s)) s = s.slice(0, -2);
    else if (/ing$/.test(s) && s.length > 5) s = s.slice(0, -3);
    else if (/ed$/.test(s) && s.length > 4) s = s.slice(0, -2);
    else if (/ness$/.test(s) && s.length > 6) s = s.slice(0, -4);
    else if (/ment$/.test(s) && s.length > 6) s = s.slice(0, -4);
    else if (/s$/.test(s) && !/ss$/.test(s) && s.length > 3) s = s.slice(0, -1);
    if (s !== w && /([bdfgkmnprt])\1$/.test(s)) s = s.slice(0, -1); // running -> runn -> run
    if (s.length > 3 && s.endsWith('e')) s = s.slice(0, -1); // love/loved/loving all become "lov"
    return s;
  }

  const SYN_INDEX = new Map(); // stem -> group index
  SYNONYMS.forEach((g, gi) => g.slice(1).concat(g[0]).forEach(w => { const st = stem(w); if (!SYN_INDEX.has(st)) SYN_INDEX.set(st, gi); }));

  function levenshtein(a, b, max = 3) {
    if (a === b) return 0;
    if (Math.abs(a.length - b.length) > max) return max + 1;
    let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
      const cur = [i]; let best = i;
      for (let j = 1; j <= b.length; j++) {
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
        if (cur[j] < best) best = cur[j];
      }
      if (best > max) return max + 1;
      prev = cur;
    }
    return prev[b.length];
  }

  /* =================== timestamps =================== */
  /** Parse one timestamp: "01:02:03,500", "01:02:03.5", "1:02:03:12" (frames), "02:03", "[00:01:02]". NaN if not a time. */
  function parseTime(str, fps = 25) {
    let s = String(str).trim().replace(/^\[|\]$/g, '').replace(/^\(|\)$/g, '');
    let m = /^(\d{1,2}):(\d{2}):(\d{2})[:;](\d{2,3})$/.exec(s); // HH:MM:SS:FF
    if (m) return +m[1] * 3600 + +m[2] * 60 + +m[3] + (m[4].length === 3 ? +m[4] / 1000 : +m[4] / (Math.round(fps) || 25));
    m = /^(?:(\d{1,2}):)?(\d{1,2}):(\d{2})(?:[.,](\d{1,3}))?$/.exec(s);
    if (m) return (+(m[1] || 0)) * 3600 + +m[2] * 60 + +m[3] + (m[4] ? +('0.' + m[4]) : 0);
    m = /^(\d+(?:\.\d+)?)s?$/.exec(s); // plain seconds: "12.5" or "12.5s"
    if (m) return +m[1];
    return NaN;
  }
  const TIME_RE = '\\[?\\d{1,2}:\\d{2}(?::\\d{2})?(?:[:;.,]\\d{1,3})?\\]?';

  /* =================== parsers =================== */
  function cleanCaption(t) {
    return String(t).replace(/<[^>]+>/g, '').replace(/\{\\[^}]*\}/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim();
  }
  /** "Name: text" or "- Name: text" at the start of a caption -> {speaker, text} */
  function splitSpeaker(text) {
    const m = /^(?:-\s*)?(?:\[([^\]]{1,40})\]|([A-Z][\w .'’-]{0,30}?|speaker \d+|SPEAKER \d+)):\s+(.+)$/i.exec(text);
    // a name is short and Capitalised ("Ruth", "David Cohen", "Speaker 2", "Q") – not the start of a sentence like "I hope they carry it on:"
    const looksLikeName = n => { const w = n.trim().split(/\s+/); return w.length <= 3 && w.every(x => /^[A-Z0-9][\w.'’-]*$/.test(x)) && !/^(I|I'm|I’m|And|But|So|The|It|We|My|This|That|There|Then|When|What|Yes|No|Well|Oh)$/.test(w[0]); };
    if (m && !/^\d/.test(m[1] || m[2] || '') && (m[1] || looksLikeName(m[2]))) return { speaker: (m[1] || m[2]).trim(), text: m[3] };
    const v = /^<v\s+([^>]+)>(.*)$/i.exec(text);
    if (v) return { speaker: v[1].trim(), text: v[2] };
    return { speaker: '', text };
  }

  function parseSRT(text, fps) {
    const out = [];
    const blocks = String(text).replace(/\r/g, '').replace(/^﻿/, '').split(/\n\s*\n/);
    for (const b of blocks) {
      const lines = b.split('\n').map(l => l.trim()).filter(Boolean);
      const ti = lines.findIndex(l => /-->/.test(l));
      if (ti < 0) continue;
      const [a, z] = lines[ti].split('-->').map(x => x.trim().split(/\s+/)[0]);
      const start = parseTime(a, fps), end = parseTime(z, fps);
      if (!isFinite(start) || !isFinite(end)) continue;
      let raw = lines.slice(ti + 1).join(' ');
      const vtag = /^<v\s+([^>]+)>/i.exec(raw);
      let speaker = '';
      if (vtag) { speaker = vtag[1].trim(); raw = raw.slice(vtag[0].length); }
      const t = cleanCaption(raw);
      if (!t) continue;
      const sp = speaker ? { speaker, text: t } : splitSpeaker(t);
      out.push({ start, end: Math.max(end, start + 0.1), speaker: sp.speaker, text: sp.text });
    }
    return out;
  }
  const parseVTT = (text, fps) => parseSRT(String(text).replace(/^WEBVTT[^\n]*\n/, '').replace(/^(NOTE|STYLE|REGION)[^\n]*(\n[^\n]+)*/gm, ''), fps);

  function splitCSVLine(line, delim) {
    const out = []; let cur = '', q = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (q) { if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; }
      else if (c === '"') q = true; else if (c === delim) { out.push(cur); cur = ''; } else cur += c;
    }
    out.push(cur);
    return out.map(s => s.trim());
  }
  function parseCSV(text, fps) {
    const rows = String(text).replace(/^﻿/, '').replace(/\r/g, '').split('\n').filter(l => l.trim());
    if (!rows.length) return [];
    const first = rows[0];
    const delim = [['\t', (first.match(/\t/g) || []).length], [';', (first.match(/;/g) || []).length], [',', (first.match(/,/g) || []).length]].sort((a, b) => b[1] - a[1])[0][0];
    const head = splitCSVLine(first, delim).map(h => h.toLowerCase());
    const find = res => head.findIndex(hh => res.some(r => r.test(hh)));
    let iS = find([/^start/, /^in\b/, /begin/, /^from/, /time ?in/, /^timecode/, /^tc/, /^time$/]);
    let iE = find([/^end/, /^out\b/, /^stop/, /^to$/, /time ?out/]);
    let iSp = find([/speaker/, /^name/, /^who/, /^person/, /^character/]);
    let iT = find([/text/, /transcript/, /content/, /dialog/, /caption/, /words?$/, /^line/, /^quote/, /^utterance/]);
    let body = rows.slice(1);
    if (iT < 0 || iS < 0) { // no header: guess columns from the first row
      const cells = splitCSVLine(first, delim);
      const times = cells.map(c => isFinite(parseTime(c, fps)));
      iS = times.indexOf(true); iE = times.indexOf(true, iS + 1);
      iT = cells.reduce((best, c, i) => (!times[i] && c.length > (cells[best] || '').length ? i : best), -1);
      iSp = cells.findIndex((c, i) => !times[i] && i !== iT && c.length < 40);
      body = rows;
    }
    if (iT < 0 || iS < 0) return [];
    const out = [];
    for (const r of body) {
      const c = splitCSVLine(r, delim);
      const start = parseTime(c[iS], fps); if (!isFinite(start)) continue;
      const end = iE >= 0 ? parseTime(c[iE], fps) : NaN;
      const t = cleanCaption(c[iT] || ''); if (!t) continue;
      out.push({ start, end: isFinite(end) ? end : NaN, speaker: iSp >= 0 ? (c[iSp] || '') : '', text: t });
    }
    return fillEnds(out);
  }

  /** Plain text with timestamps in many styles (Premiere "Export to text file", Otter, Descript, hand-made logs). */
  function parseTimedText(text, fps) {
    const lines = String(text).replace(/^﻿/, '').replace(/\r/g, '').split('\n');
    const out = [];
    let cur = null, pendingSpeaker = '';
    const RANGE = new RegExp('^\\s*(' + TIME_RE + ')\\s*(?:-|–|—|to|-->)\\s*(' + TIME_RE + ')\\s*(.*)$');
    const SINGLE_START = new RegExp('^\\s*(' + TIME_RE + ')\\s*[-–:]?\\s*(.*)$');
    const SPEAKER_THEN_TIME = new RegExp('^\\s*([^\\d\\[\\]:][^:\\[\\]]{0,40}?)\\s{1,}(' + TIME_RE + ')\\s*$');
    const flush = () => { if (cur && cur.text.trim()) out.push({ start: cur.start, end: cur.end, speaker: cur.speaker, text: cleanCaption(cur.text) }); cur = null; };
    for (const raw of lines) {
      const line = raw.trim();
      if (!line) { if (cur && cur.text) flush(); continue; }
      let m;
      if ((m = RANGE.exec(line))) {
        flush();
        cur = { start: parseTime(m[1], fps), end: parseTime(m[2], fps), speaker: pendingSpeaker, text: '' };
        pendingSpeaker = '';
        if (m[3]) { const sp = splitSpeaker(m[3]); if (sp.speaker && !sp.text) cur.speaker = sp.speaker; else if (sp.speaker) { cur.speaker = sp.speaker; cur.text = sp.text; } else if (m[3].length < 40 && !/[.?!,]$/.test(m[3]) && !cur.text) cur.speaker = m[3]; else cur.text = m[3]; }
        continue;
      }
      if ((m = SPEAKER_THEN_TIME.exec(line))) { flush(); cur = { start: parseTime(m[2], fps), end: NaN, speaker: m[1].trim(), text: '' }; continue; }
      if ((m = SINGLE_START.exec(line)) && isFinite(parseTime(m[1], fps))) {
        flush();
        const rest = m[2] || '';
        const sp = splitSpeaker(rest);
        cur = { start: parseTime(m[1], fps), end: NaN, speaker: sp.speaker || pendingSpeaker, text: sp.text && !(rest.length < 40 && !/[.?!,]/.test(rest) && !sp.speaker && /^[A-Z][\w .'-]*\d*$/.test(rest)) ? sp.text : '' };
        if (!cur.text && rest && !sp.speaker) cur.speaker = rest;
        pendingSpeaker = '';
        continue;
      }
      if (cur) {
        // a short name line right after the timestamp is the speaker (Premiere puts it there)
        if (!cur.text && !cur.speaker && line.length <= 40 && !/[.?!,;]$/.test(line) && /^[A-Z]/.test(line) && line.split(/\s+/).length <= 4) { cur.speaker = line.replace(/:$/, ''); continue; }
        cur.text += (cur.text ? ' ' : '') + line;
      } else if (line.length <= 40 && /:$|^speaker \d+$/i.test(line)) pendingSpeaker = line.replace(/:$/, '');
    }
    flush();
    return fillEnds(out.filter(s => isFinite(s.start)));
  }

  /** Give segments without an end time one: the next start, or by speaking rate. */
  function fillEnds(segs) {
    segs.sort((a, b) => a.start - b.start);
    for (let i = 0; i < segs.length; i++) {
      const s = segs[i];
      if (!isFinite(s.end) || s.end <= s.start) {
        const est = s.start + Math.max(1, tokens(s.text).length / 2.6);
        const next = segs[i + 1] ? segs[i + 1].start : Infinity;
        s.end = Math.min(est + 0.5, next > s.start ? next : est);
        if (!isFinite(s.end) || s.end <= s.start) s.end = est;
      }
    }
    return segs;
  }

  /** Any JSON transcript: walk for arrays of {text, start/end/duration} (segments) or words. */
  function parseJSONTranscript(obj) {
    let best = null;
    const speakersById = {};
    const TEXT = ['text', 'transcript', 'content', 'word', 'value', 'caption', 'utterance', 'punctuated_word', 'w'];
    const START = ['start', 'starttime', 'start_time', 'begin', 'offset', 'from', 'ts', 'startms', 'start_ms', 'startticks', 'starttimeticks', 'in'];
    const END = ['end', 'endtime', 'end_time', 'to', 'stop', 'endms', 'end_ms', 'endticks', 'out'];
    const DUR = ['duration', 'dur', 'length', 'durationms', 'duration_ms', 'durationticks'];
    const SPK = ['speaker', 'speaker_label', 'speakername', 'speaker_name', 'spk', 'speakerid', 'speaker_id', 'who', 'name'];
    const pick = (o, keys) => { for (const k of Object.keys(o)) if (keys.includes(k.toLowerCase().replace(/[-\s]/g, ''))) return { k, v: o[k] }; return null; };
    const num = v => (typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' && isFinite(+v) ? +v : typeof v === 'string' ? parseTime(v) : (v && typeof v === 'object' && 'ticks' in v ? +v.ticks : NaN));
    function textOf(o) {
      const t = pick(o, TEXT); if (t && typeof t.v === 'string') return t.v;
      if (Array.isArray(o.alternatives) && o.alternatives[0]) return o.alternatives[0].content || o.alternatives[0].transcript || '';
      return null;
    }
    function scan(node, depth, ctxSpeaker) {
      if (!node || depth > 12) return;
      if (Array.isArray(node)) {
        const objs = node.filter(x => x && typeof x === 'object' && !Array.isArray(x));
        if (objs.length >= 1) {
          const timed = objs.filter(o => textOf(o) != null && pick(o, START));
          if (timed.length >= Math.max(1, objs.length * 0.6)) {
            const spaced = timed.filter(o => /\s/.test(textOf(o).trim())).length;
            const kind = spaced > timed.length * 0.3 ? 'segments' : 'words';
            const cand = { kind, items: timed, ctxSpeaker };
            if (!best || (best.kind === 'words' && kind === 'segments') || (best.kind === kind && timed.length > best.items.length)) best = cand;
          }
        }
        node.forEach(x => scan(x, depth + 1, ctxSpeaker));
        return;
      }
      if (typeof node === 'object') {
        // speaker tables: [{id, name}]
        for (const v of Object.values(node)) if (Array.isArray(v)) v.forEach(s => { if (s && typeof s === 'object' && ('id' in s) && typeof s.name === 'string' && textOf(s) == null) speakersById[s.id] = s.name; });
        // segments that contain words: keep segment speaker for its words
        const sp = pick(node, SPK);
        for (const v of Object.values(node)) scan(v, depth + 1, sp && typeof sp.v !== 'object' ? sp.v : ctxSpeaker);
      }
    }
    scan(obj, 0, '');
    if (!best) return [];
    let segs = best.items.map(o => {
      const s = num(pick(o, START).v);
      const e = pick(o, END) ? num(pick(o, END).v) : NaN;
      const d = pick(o, DUR) ? num(pick(o, DUR).v) : NaN;
      const spk = pick(o, SPK);
      let speaker = spk && typeof spk.v !== 'object' ? spk.v : best.ctxSpeaker;
      if (speaker != null && speakersById[speaker] != null) speaker = speakersById[speaker];
      return { start: s, end: isFinite(e) ? e : isFinite(d) ? s + d : NaN, speaker: speaker == null ? '' : String(speaker), text: String(textOf(o) || '').trim(), _keys: Object.keys(o).join(',').toLowerCase() };
    }).filter(s => isFinite(s.start));
    // units: ticks (Premiere), milliseconds, or seconds
    const maxT = Math.max(...segs.map(s => Math.max(s.start, isFinite(s.end) ? s.end : 0)));
    const keys = segs[0] ? segs[0]._keys : '';
    let scale = 1;
    if (/ticks/.test(keys) || maxT > 1e9) scale = 1 / TICKS;
    else if (/ms\b|_ms|millis/.test(keys) || maxT > 200000) scale = 1 / 1000;
    segs.forEach(s => { s.start *= scale; if (isFinite(s.end)) s.end *= scale; delete s._keys; });
    if (best.kind === 'words') return wordsToSentences(segs.map(s => ({ t: s.start, d: isFinite(s.end) ? s.end - s.start : 0.3, w: s.text, speaker: s.speaker })));
    return fillEnds(segs.filter(s => s.text));
  }

  /* =================== Premiere's own transcripts (inside the .prproj) =================== */
  /** Decode one TranscriptData blob (FlatBuffer). Returns {language, speakers:{}, words:[{t,d,w,speaker}]}. */
  function decodePremiereTranscript(buf) {
    const u32 = o => buf.readUInt32LE(o), i32 = o => buf.readInt32LE(o), u16 = o => buf.readUInt16LE(o);
    const i64 = o => Number(buf.readBigInt64LE(o));
    function table(pos) {
      const vt = pos - i32(pos), vsz = u16(vt);
      return { pos, f: i => { const at = vt + 4 + 2 * i; if (at >= vt + vsz) return 0; const o = u16(at); return o ? pos + o : 0; } };
    }
    const ref = p => p + u32(p);
    const str = p => { const q = ref(p); return buf.toString('utf8', q + 4, q + 4 + u32(q)); };
    const vec = p => { const q = ref(p), n = u32(q); const out = []; for (let i = 0; i < n; i++) out.push(q + 4 + 4 * i); return out; };
    const guid = p => { const q = ref(p); const t = table(q); const a = t.f(0), b = t.f(1); return (a ? buf.toString('hex', a, a + 8) : '') + (b ? buf.toString('hex', b, b + 8) : ''); };

    let doc = table(u32(0));
    // the document is either the root table or its first child
    const looksLikeDoc = t => { const p = t.f(0); if (!p) return false; try { const v = vec(p); if (!v.length) return true; const seg = table(ref(v[0])); return !!seg.f(3) && !!seg.f(0); } catch (e) { return false; } };
    if (!looksLikeDoc(doc)) { const c = doc.f(0); if (!c) throw new Error('no document'); doc = table(ref(c)); if (!looksLikeDoc(doc)) throw new Error('unknown transcript layout'); }
    const speakers = {};
    for (const fi of [5, 2]) {
      const p = doc.f(fi); if (!p) continue;
      try { for (const e of vec(p)) { const s = table(ref(e)); const nameP = s.f(0), idP = s.f(1); if (nameP) speakers[idP ? guid(idP) : nameP] = str(nameP); } } catch (e) { /* optional */ }
    }
    const language = doc.f(1) ? (() => { try { return str(doc.f(1)); } catch (e) { return ''; } })() : '';
    const words = [];
    const segs = vec(doc.f(0)).map(e => table(ref(e)));
    let unknownN = 0; const unknownMap = {};
    for (const s of segs) {
      let speaker = '';
      if (s.f(2)) { try { const g = guid(s.f(2)); speaker = speakers[g] || ''; if (!speaker || /^unknown$/i.test(speaker)) { if (!(g in unknownMap)) unknownMap[g] = Object.keys(speakers).length > 1 ? `Speaker ${++unknownN}` : ''; speaker = unknownMap[g]; } } catch (e) { /* none */ } }
      if (!s.f(3)) continue;
      for (const we of vec(s.f(3))) {
        const w = table(ref(we));
        const tp = w.f(2); if (!tp) continue;
        const text = str(tp); if (!text) continue;
        const t = w.f(0) ? i64(w.f(0)) / TICKS : NaN, d = w.f(1) ? i64(w.f(1)) / TICKS : 0;
        if (!isFinite(t)) continue;
        words.push({ t, d, w: text, speaker });
      }
    }
    words.sort((a, b) => a.t - b.t);
    return { language, speakers, words };
  }

  /**
   * Words -> sentence segments (split on . ? !, long pauses, speaker changes, or 30 s).
   * Each segment keeps its word timings compactly as w = [start0, end0, start1, end1, …] in centiseconds from the
   * segment start – exactly one pair per space-separated word of its text (a punctuation-only word joins the word before,
   * spaces inside a word become non-breaking spaces), so a line can be trimmed at the exact word later.
   */
  function wordsToSentences(words, { maxGap = 1.2, maxLen = 30 } = {}) {
    const out = []; let cur = null;
    const flush = () => {
      if (cur && cur.toks.length) out.push({ start: cur.start, end: cur.end, speaker: cur.speaker, text: cur.toks.map(x => x.text).join(' '), w: packWords(cur.start, cur.toks) });
      cur = null;
    };
    for (const w of words) {
      const text = String(w.w).trim().replace(/[ \t\r\n]+/g, '\u00a0'); if (!text) continue;
      const end = w.t + Math.max(0.05, w.d || 0.3);
      if (/^[,.?!;:…"”')\]]+$/.test(text) && cur && cur.toks.length) {
        const last = cur.toks[cur.toks.length - 1];
        last.text += text; last.end = Math.max(last.end, end); cur.end = Math.max(cur.end, end);
        if (/[.?!…]/.test(text)) flush();
        continue;
      }
      if (cur && (w.speaker !== cur.speaker || w.t - cur.end > maxGap || end - cur.start > maxLen)) flush();
      if (!cur) cur = { start: w.t, end, speaker: w.speaker || '', toks: [] };
      cur.toks.push({ text, start: w.t, end }); cur.end = Math.max(cur.end, end);
      if (/[.?!…]["”')\]]?$/.test(text)) flush();
    }
    flush();
    return out;
  }
  function packWords(base, toks) {
    const a = new Array(toks.length * 2);
    for (let i = 0; i < toks.length; i++) { a[2 * i] = Math.round((toks[i].start - base) * 100); a[2 * i + 1] = Math.round((toks[i].end - base) * 100); }
    return a;
  }
  /** Words of a line (split on ordinary whitespace only – a non-breaking space stays inside its word). */
  const lineWords = text => String(text).split(/[ \t\r\n]+/).filter(Boolean);
  /** [{s, e, text}] per word of a line: exact when the line carries word timings, else spread evenly. */
  function wordTimes(line) {
    const words = lineWords(line.text), n = words.length, dur = Math.max(0.01, line.end - line.start);
    const exact = Array.isArray(line.w) && line.w.length === 2 * n;
    return { exact, words: words.map((text, i) => exact ? { text, s: line.start + line.w[2 * i] / 100, e: line.start + line.w[2 * i + 1] / 100 } : { text, s: line.start + dur * i / n, e: line.start + dur * (i + 1) / n }) };
  }

  /**
   * Stream a saved .prproj (gzip XML, can be hundreds of MB) and pull out every transcript with its clip's name and media path.
   * Returns [{name, path, language, segments}]. onProgress(0..1).
   */
  async function readProjectTranscripts(prprojPath, { onProgress, check } = {}) {
    const fs = require('fs'), zlib = require('zlib');
    const size = fs.statSync(prprojPath).size;
    const head = Buffer.alloc(2); const fd = fs.openSync(prprojPath, 'r'); fs.readSync(fd, head, 0, 2, 0); fs.closeSync(fd);
    const gz = head[0] === 0x1f && head[1] === 0x8b;
    const WANT = /^\t<(MasterClip|VideoClip|AudioClip|TranscriptClip|VideoMediaSource|AudioMediaSource|Media|\w*TranscriptDocument)\s[^>]*Object(?:U)?ID="([^"]+)"/;
    const masters = [], clips = {}, sources = {}, media = {}, docs = {};
    let capTag = null, capId = null, capBuf = [];
    function finish(tag, id, text) {
      if (tag === 'MasterClip') {
        const name = (/<Name>([^<]*)<\/Name>/.exec(text) || [])[1] || '';
        const refs = []; text.replace(/<Clip Index="\d+" ObjectRef="([^"]+)"/g, (_, r) => { refs.push(r); return ''; });
        masters.push({ name: unxml(name), refs });
      } else if (tag === 'VideoClip' || tag === 'AudioClip') {
        const s = (/<Source ObjectRef="([^"]+)"/.exec(text) || [])[1]; clips[id] = { kind: tag, source: s };
      } else if (tag === 'TranscriptClip') {
        const d = (/<TranscriptTextSegments ObjectRef="([^"]+)"/.exec(text) || [])[1]; clips[id] = { kind: tag, doc: d };
      } else if (tag === 'VideoMediaSource' || tag === 'AudioMediaSource') {
        const m = (/<Media ObjectU?Ref="([^"]+)"/.exec(text) || [])[1]; sources[id] = m;
      } else if (tag === 'Media') {
        // ActualMediaFilePath / FilePath are usually plain paths; newer projects keep a JSON blob with "mFilePath"
        const abs = v => v && /^([A-Za-z]:[\\/]|\\\\|\/)/.test(v) ? unxml(v) : '';
        const actual = (/<ActualMediaFilePath>([^<]*)<\/ActualMediaFilePath>/.exec(text) || [])[1];
        const fpath = (/<FilePath>([^<]*)<\/FilePath>/.exec(text) || [])[1];
        const fp = (/&quot;mFilePath&quot;:&quot;(.*?)&quot;|"mFilePath":"((?:[^"\\]|\\.)*)"/.exec(text) || []);
        let jsonPath = '';
        // the XML-escaped form is still JSON inside (C:\\Users…): undo both
        try { jsonPath = fp[1] ? JSON.parse('"' + unxml(fp[1]) + '"') : fp[2] ? JSON.parse('"' + fp[2] + '"') : ''; } catch (e) { jsonPath = fp[1] ? unxml(fp[1]) : ''; }
        const title = (/<Title>([^<]*)<\/Title>/.exec(text) || [])[1];
        media[id] = { path: abs(actual) || abs(fpath) || unxml(jsonPath), title: unxml(title || '') };
      } else if (/TranscriptDocument$/.test(tag)) {
        const b64 = (/<TranscriptData[^>]*>([^<]+)<\/TranscriptData>/.exec(text) || [])[1];
        if (b64) { try { docs[id] = decodePremiereTranscript(Buffer.from(b64.trim(), 'base64')); } catch (e) { docs[id] = { error: String(e.message || e) }; } }
      }
    }
    await new Promise((resolve, reject) => {
      let carry = '', read = 0;
      const rs = fs.createReadStream(prprojPath, { highWaterMark: 1 << 20 });
      const st = gz ? rs.pipe(zlib.createGunzip()) : rs;
      rs.on('data', c => { read += c.length; onProgress && onProgress(Math.min(0.99, read / size)); });
      st.on('data', chunk => {
        try { if (check) check(); } catch (e) { rs.destroy(); reject(e); return; }
        const text = carry + chunk.toString('utf8');
        const lines = text.split('\n');
        carry = lines.pop();
        for (const line of lines) {
          if (capTag) {
            capBuf.push(line);
            if (line === '\t</' + capTag + '>' || line.startsWith('\t</' + capTag + '>')) { finish(capTag, capId, capBuf.join('\n')); capTag = null; capBuf = []; }
            continue;
          }
          if (line.charCodeAt(0) !== 9 || line.charCodeAt(1) !== 60) continue; // "\t<"
          const m = WANT.exec(line);
          if (!m) continue;
          if (/\/>\s*$/.test(line)) { finish(m[1], m[2], line); continue; }
          capTag = m[1]; capId = m[2]; capBuf = [line];
        }
      });
      st.on('end', resolve);
      st.on('error', e => reject(new US.UserError('CANT_DECODE', { title: 'Couldn’t read the project file.', action: 'Save the project in Premiere, then try again.', detail: String(e.message || e) })));
    });
    const out = [];
    for (const mc of masters) {
      let doc = null, path = '', title = '';
      for (const r of mc.refs) {
        const c = clips[r]; if (!c) continue;
        if (c.kind === 'TranscriptClip' && c.doc && docs[c.doc] && docs[c.doc].words) doc = docs[c.doc];
        if ((c.kind === 'VideoClip' || c.kind === 'AudioClip') && !path) { const m = media[sources[c.source]]; if (m) { path = m.path; title = m.title; } }
      }
      if (!doc || !doc.words.length) continue;
      out.push({ name: mc.name || title, path, language: doc.language, segments: wordsToSentences(doc.words) });
    }
    // the same media can appear in several master clips (e.g. after duplicating) – keep the longest transcript
    const byKey = new Map();
    for (const t of out) { const k = t.path || t.name; const had = byKey.get(k); if (!had || t.segments.length > had.segments.length) byKey.set(k, t); }
    onProgress && onProgress(1);
    return Array.from(byKey.values());
  }
  function unxml(s) { return String(s).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&'); }

  /* =================== files =================== */
  /**
   * Resolve's own transcription, read through its subtitles (resolve/host/story.js storyTranscribe): [{text, start, end}]
   * in media seconds, one per caption -> segments. Captions carry times per phrase, not per word, so there are no word
   * timings (w): trims and captions spread a line's words evenly over it. A speaker written at the start of a caption
   * ("Ruth: …", "- …") is split off as in subtitle files.
   */
  // sound tags a speech-to-text writes when it hears no words ("[MUSIC]", "(applause)", "♪") – not lines
  const SOUND_TAG = /[[(]\s*(music|applause|laughter|laughs|laughing|cheering|cheers|inaudible|silence|noise|background noise|crosstalk|no audio|blank_audio|foreign)\s*[\])](?!\s*:)|[♪♫]+/gi;
  function fromSubtitles(items) {
    const out = [];
    for (const x of items || []) {
      const start = Number(x.start), end = Number(x.end), t = cleanCaption(String(x.text || '').replace(SOUND_TAG, ' ').replace(/^\s*-\s+/, ''));
      if (!t || !isFinite(start)) continue;
      const sp = splitSpeaker(t);
      out.push({ start, end: Math.max(isFinite(end) ? end : start, start + 0.1), speaker: sp.speaker, text: sp.text });
    }
    return out.sort((a, b) => a.start - b.start);
  }

  /** Parse transcript text by its content/extension. Returns {format, segments}. */
  function parseText(text, filename = '', fps = 25) {
    const ext = (/\.([a-z0-9]+)$/i.exec(filename) || [])[1] || '';
    const t = String(text).replace(/^﻿/, '');
    const trimmed = t.trim();
    if (/^(json|prtranscript)$/i.test(ext) || /^[[{]/.test(trimmed)) {
      try { return { format: 'json', segments: parseJSONTranscript(JSON.parse(trimmed)) }; } catch (e) { if (/json/i.test(ext)) throw e; }
    }
    if (/^vtt$/i.test(ext) || /^WEBVTT/.test(trimmed)) return { format: 'vtt', segments: parseVTT(t, fps) };
    if (/^srt$/i.test(ext) || /^\d+\s*\n\s*\d{1,2}:\d{2}:\d{2}[,.]\d{1,3}\s*-->/.test(trimmed)) return { format: 'srt', segments: parseSRT(t, fps) };
    if (/^(csv|tsv)$/i.test(ext)) return { format: 'csv', segments: parseCSV(t, fps) };
    if (/-->/.test(t)) return { format: 'srt', segments: parseSRT(t, fps) };
    const firstLine = trimmed.split('\n')[0];
    if (/[,\t;]/.test(firstLine) && /(start|text|speaker|in|out|timecode)/i.test(firstLine) && !/[.?!]$/.test(firstLine)) { const s = parseCSV(t, fps); if (s.length) return { format: 'csv', segments: s }; }
    return { format: 'text', segments: parseTimedText(t, fps) };
  }
  function parseFile(file, fps = 25) {
    const fs = require('fs');
    const buf = fs.readFileSync(file);
    let text = buf.toString('utf8');
    if (buf[0] === 0xff && buf[1] === 0xfe) text = buf.toString('utf16le').slice(1);
    const r = parseText(text, file, fps);
    if (!r.segments.length) throw new US.UserError('BAD_INPUT', { title: `No timed lines found in ${US.basename(file)}.`, action: US.app && US.app.is('resolve') ? 'Use a transcript with timecodes: SRT, VTT, CSV, or text with timecodes (subtitles exported from Resolve work).' : 'Use a transcript with timecodes (SRT, VTT, CSV, or text with timecodes – Premiere’s Export to text file with timecodes works).', detail: file });
    return r;
  }

  /* =================== lines =================== */
  /** Segments -> lines (merge short pieces into sentences, split very long ones). Each line gets a stable id. */
  function toLines(segments, keyPrefix = 'L') {
    const segs = segments.filter(s => s.text && isFinite(s.start)).slice().sort((a, b) => a.start - b.start);
    // join b onto a, carrying word timings (shifted to a's start) when both have them
    const join = (a, b) => {
      if (a.w && b.w) { const off = Math.round((b.start - a.start) * 100); a.w = a.w.concat(b.w.map(v => v + off)); } else delete a.w;
      a.text += ' ' + b.text; a.end = Math.max(a.end, b.end);
    };
    const merged = [];
    let cur = null;
    for (const s of segs) {
      const endsSentence = /[.?!…]["”')\]]?$/.test(s.text.trim());
      if (cur && s.speaker === cur.speaker && s.start - cur.end < 1.0 && !/[.?!…]["”')\]]?$/.test(cur.text) && (s.end - cur.start) < 30) join(cur, s);
      else {
        if (cur) merged.push(cur);
        cur = { start: s.start, end: s.end, speaker: s.speaker || '', text: s.text.trim() };
        if (Array.isArray(s.w)) cur.w = s.w.slice();
      }
      if (endsSentence && cur && (cur.end - cur.start) >= 2.5) { merged.push(cur); cur = null; }
    }
    if (cur) merged.push(cur);
    // very short lines join the next one from the same speaker
    const out = [];
    for (let i = 0; i < merged.length; i++) {
      const m = merged[i];
      const prev = out[out.length - 1];
      if (prev && prev.speaker === m.speaker && (prev.end - prev.start) < 3 && m.start - prev.end < 1.2 && (m.end - prev.start) < 25) { join(prev, m); continue; }
      out.push(Object.assign({}, m));
    }
    return out.map(l => {
      l.text = l.text.replace(/[ \t\r\n]+/g, ' ').trim();
      if (l.w && l.w.length !== 2 * lineWords(l.text).length) delete l.w; // never keep timings that don't line up
      return Object.assign(l, { id: keyPrefix + '-' + Math.round(l.start * 100).toString(36) });
    });
  }

  /** A question put to the person speaking, as an interviewer asks it (“What would you say…?”, “Are you…?”) – how a
      transcript with no speaker names shows the interviewer. 'whole': the line is the question (at most a few other
      words, like “That's very nice.”); 'starts' / 'ends': it opens with one and then answers, or answers and then asks
      the next one; null otherwise. Tag questions (“…, you know?”, “right?”), a general “you” (“when you're not with
      them, you wonder how…?”) and the speaker's own (“How can I start that again?”) don't count. */
  const TAG_Q = /(\byou know|\bright|\bisn'?t it|\bdon'?t you think|\byou see|\bokay|\bok)\?["”')]*$/i;
  // the speaker's own rhetorical questions (“Can you imagine?”) are often the line the editor wants
  const RHETORICAL = /\b(can|could) you (imagine|believe)\b|\bwould you believe\b|\byou know what i mean\b/i;
  const ASK_YOU = /\b(what|how|why|which|who|is there|are there)\b[^?]*\b(you|your|yourself|you'(d|re|ve|ll))\b|\b(are|were|do|did|does|have|has|can|could|would|will|should)\s+(you|your)\b|\btell (me|us)\b/i;
  function askedQuestion(text) {
    const sents = (String(text || '').replace(/’/g, "'").match(/[^.?!…]+[.?!…]+["”')]*|[^.?!…]+$/g) || []).map(x => x.trim()).filter(Boolean);
    const isQ = x => /\?["”')]*$/.test(x), asked = x => isQ(x) && ASK_YOU.test(x) && !TAG_Q.test(x) && !RHETORICAL.test(x);
    if (!sents.some(asked)) return null;
    const answer = sents.filter(x => !isQ(x)).reduce((n, x) => n + x.split(/\s+/).length, 0);
    if (answer <= 4) return 'whole';
    const run = list => { const out = []; for (const x of list) { if (!isQ(x)) break; out.push(x); } return out; };
    if (run(sents).some(asked)) return 'starts';
    if (run(sents.slice().reverse()).some(asked)) return 'ends';
    return null; // a question in the middle of an answer is usually the speaker's own
  }

  // the speaker stopping to start again (“How can I start that again?”): the line needs trimming before it's a soundbite
  const RESTARTS = /\b(let me (start|say|try|do) (that|this|it)? ?(again|over)|(can|could|shall|should) i (start|say|do|try) (that|this|it)? ?(again|over)|start (?:(?:that|this|it) )?(again|over)|let me rephrase|scratch that|what was the question( again)?|can you (repeat|ask) (the|that|your) question)\b/i;
  /** A speaker label that names the interviewer's role (“Interviewer”, “Q”, “Sarah (producer)”), not a job title in a
      name (“Jane Smith, Museum Director”). */
  const INTERVIEWER_LABEL = /^\s*(the\s+)?(interview(er)?|producer|director|host|q)\b|\(\s*(the\s+)?(interview(er)?|producer|director|host)\s*\)/i;
  const isInterviewerLabel = s => INTERVIEWER_LABEL.test(String(s || ''));
  /** How good is this line as a soundbite? 0..1 with reasons. */
  function quality(line) {
    if (typeof line.text !== 'string') line = Object.assign({}, line, { text: String(line.text || '') });
    const dur = line.end - line.start;
    const toks = tokens(line.text);
    const low = ' ' + norm(line.text).replace(/[^a-z0-9' ]/g, ' ').replace(/\s+/g, ' ') + ' ';
    let fill = 0;
    for (const f of FILLERS) {
      let i = 0;
      // “Do you know how hard…” is a question, not a filler
      while ((i = low.indexOf(' ' + f + ' ', i)) >= 0) { if (!(f === 'you know' && /\b(do|did|if|don't|didn't)$/.test(low.slice(0, i)))) fill++; i += f.length; }
    }
    const emo = toks.filter(t => EMOTION.has(t) || EMOTION.has(stem(t))).length;
    const reasons = [];
    let s = 0.5;
    if (dur >= 5 && dur <= 25) { s += 0.2; } else if (dur < 3) { s -= 0.25; reasons.push('very short'); } else if (dur > 40) { s -= 0.2; reasons.push('long'); } else if (dur > 25) s -= 0.05;
    const complete = /^[A-Z"“'‘]/.test(line.text.trim()) && /[.?!…]["”')]?$/.test(line.text.trim());
    if (complete) s += 0.12; else reasons.push('partial sentence');
    if (/^(and|but|so|because|or|um|uh)\b/i.test(line.text.trim())) { s -= 0.08; reasons.push('starts mid-thought'); }
    const fr = fill / Math.max(1, toks.length);
    if (fr > 0.06) { s -= Math.min(0.3, fr * 2); reasons.push('lots of “um”s'); }
    s += Math.min(0.2, emo * 0.05);
    if (emo >= 2) reasons.push('heartfelt');
    if (/\d/.test(line.text)) s += 0.03;
    const restarts = RESTARTS.test(line.text);
    if (restarts) reasons.push('starts again');
    const asked = askedQuestion(line.text);
    if (isInterviewerLabel(line.speaker) || asked === 'whole') { s -= 0.25; reasons.push('interviewer'); }
    else if (asked === 'starts' || asked === 'ends') { s -= 0.15; reasons.push(asked === 'starts' ? 'starts with a question' : 'ends with a question'); }
    else if (/\?["”')]?$/.test(line.text.trim())) { s -= 0.1; reasons.push('question'); }
    if (restarts) s = Math.min(s - 0.15, 0.6); // usable once trimmed, never one of the strongest as it stands
    return { score: US.clamp(s, 0, 1), reasons, filler: fill, dur };
  }

  /* =================== search =================== */
  function indexLine(line) {
    if (line._idx) return line._idx;
    const toks = tokens(line.text);
    const stems = toks.map(stem);
    line._idx = { toks, stems, stemSet: new Set(stems), low: ' ' + norm(line.text).replace(/[^a-z0-9À-ɏ֐-׿' ]/g, ' ').replace(/\s+/g, ' ') + ' ', q: quality(line).score };
    Object.defineProperty(line, '_idx', { enumerable: false, value: line._idx, writable: true });
    return line._idx;
  }
  const LEAD = /^(please\s+)?(find|show( me)?|search( for)?|get|give me|look for|i want|i need|pull|grab|lines?|bites?|soundbites?|sound bites?|quotes?|clips?|moments?|bits?|anything|everything|where|when|someone|anyone|people|they|he|she|talks?|talking|talked|speaks?|speaking|spoke|says?|said|mentions?|mentioning|mentioned|about|on|of|for|the|any|all|some|with|that|who|are|is)(?![\w'’])\s*/i;   // not “they” of “they've”
  function parseQuery(q) {
    let s = String(q || '').trim();
    const phrases = []; s = s.replace(/"([^"]+)"|“([^”]+)”/g, (_, a, b) => { phrases.push(norm(a || b).trim()); return ' '; });
    let prev; do { prev = s; s = s.replace(LEAD, '').trim(); } while (s !== prev);
    const words = tokens(s).filter(t => !STOP.has(t));
    return { phrases, words: Array.from(new Set(words)) };
  }
  /**
   * search(query, lines) -> [{line, score, hits:[{term, how}]}], best first.
   * Exact word 1, same root 0.85, related word 0.55, near-miss spelling 0.5, phrase 1.5.
   */
  function search(query, lines, { limit = 200, minQuality = 0 } = {}) {
    const q = parseQuery(query);
    if (!q.words.length && !q.phrases.length) return [];
    const terms = q.words.map(w => ({ w, st: stem(w), syn: SYN_INDEX.get(stem(w)) }));
    const out = [];
    for (const line of lines) {
      const ix = indexLine(line);
      if (ix.q < minQuality) continue;
      let total = 0; const hits = [];
      for (const ph of q.phrases) { if (ix.low.includes(' ' + ph.replace(/[^a-z0-9' ]/g, ' ').replace(/\s+/g, ' ').trim() + ' ')) { total += 1.5; hits.push({ term: ph, how: 'phrase' }); } }
      for (const t of terms) {
        let best = 0, how = '';
        if (ix.toks.includes(t.w)) { best = 1; how = 'word'; }
        else if (ix.stemSet.has(t.st)) { best = 0.85; how = 'root'; }
        else {
          if (t.syn != null) for (const s of ix.stems) if (SYN_INDEX.get(s) === t.syn) { best = 0.55; how = 'related'; break; }
          if (best < 0.5 && t.w.length >= 4) {
            const maxD = t.w.length >= 8 ? 2 : 1;
            for (const tok of ix.toks) if (tok.length >= 3 && Math.abs(tok.length - t.w.length) <= maxD && levenshtein(tok, t.w, maxD) <= maxD) { best = 0.5; how = 'sounds like'; break; }
          }
        }
        if (best) { total += best; hits.push({ term: t.w, how }); }
      }
      if (!hits.length) continue;
      const n = terms.length + q.phrases.length;
      const coverage = total / n;
      out.push({ line, score: coverage * (0.65 + 0.35 * ix.q), hits });
    }
    out.sort((a, b) => b.score - a.score || a.line.start - b.line.start);
    return out.slice(0, limit);
  }

  /* =================== themes =================== */
  /**
   * Offline themes: well-known topics first (family, faith, community…), then the strongest shared words for the rest.
   * lines: [{id, text, ...}] -> [{id, name, keywords, lineIds (best first)}]
   */
  function themesOffline(lines, { max = 10, minSize = 2 } = {}) {
    const assigned = new Map(); // lineId -> {theme, strength}
    const lexHits = new Map();
    for (const l of lines) {
      const ix = indexLine(l);
      const counts = new Map();
      for (const s of ix.stems) { const g = SYN_INDEX.get(s); if (g != null) counts.set(g, (counts.get(g) || 0) + 1); }
      let bestG = null, bestN = 0;
      for (const [g, n] of counts) if (n > bestN) { bestG = g; bestN = n; }
      if (bestG != null) { assigned.set(l.id, { key: 'lex:' + bestG, strength: bestN }); lexHits.set(bestG, (lexHits.get(bestG) || 0) + 1); }
    }
    // greedy keyword groups for the rest
    const rest = lines.filter(l => !assigned.has(l.id));
    const df = new Map();
    for (const l of rest) for (const s of new Set(indexLine(l).stems)) if (!STOP.has(s) && s.length > 3 && !/^\d+$/.test(s) && !s.includes("'")) df.set(s, (df.get(s) || 0) + 1);
    const surface = new Map();
    for (const l of rest) { const ix = indexLine(l); ix.stems.forEach((s, i) => { if (!surface.has(s)) surface.set(s, ix.toks[i]); }); }
    const pool = new Set(rest.map(l => l.id));
    const kw = [];
    const lexThemes = Array.from(lexHits.keys()).length;
    while (kw.length < Math.max(0, max - lexThemes) && pool.size) {
      let bestS = null, bestC = 0;
      for (const [s, c] of df) { if (c < minSize || c > Math.max(minSize + 1, rest.length * 0.6)) continue; let live = 0; for (const l of rest) if (pool.has(l.id) && indexLine(l).stemSet.has(s)) live++; if (live > bestC) { bestC = live; bestS = s; } }
      if (!bestS || bestC < minSize) break;
      kw.push(bestS);
      for (const l of rest) if (pool.has(l.id) && indexLine(l).stemSet.has(bestS)) { pool.delete(l.id); assigned.set(l.id, { key: 'kw:' + bestS, strength: 1 }); }
      df.delete(bestS);
    }
    const groups = new Map();
    for (const l of lines) { const a = assigned.get(l.id); const key = a ? a.key : 'other'; if (!groups.has(key)) groups.set(key, []); groups.get(key).push({ l, strength: a ? a.strength : 0 }); }
    const themes = [];
    for (const [key, arr] of groups) {
      if (key === 'other') continue;
      let name, keywords;
      if (key.startsWith('lex:')) { const g = SYNONYMS[+key.slice(4)]; name = THEME_NAMES[g[0]] || US.cap(g[0]); keywords = topWords(arr.map(x => x.l), 4); }
      else { const s = key.slice(3); name = US.cap(surface.get(s) || s); keywords = topWords(arr.map(x => x.l), 4); }
      arr.sort((a, b) => (indexLine(b.l).q * (1 + 0.15 * b.strength)) - (indexLine(a.l).q * (1 + 0.15 * a.strength)));
      themes.push({ id: 'T' + (US.fsx ? US.fsx.hash(key).slice(0, 6) : key), name, keywords, lineIds: arr.map(x => x.l.id) });
    }
    themes.sort((a, b) => b.lineIds.length - a.lineIds.length);
    const kept = [], small = [];
    for (const t of themes) (t.lineIds.length >= minSize && kept.length < max ? kept : small).push(t);
    const otherIds = (groups.get('other') || []).map(x => x.l.id).concat(...small.map(t => t.lineIds));
    if (otherIds.length) {
      const byQ = otherIds.map(id => lines.find(l => l.id === id)).sort((a, b) => indexLine(b).q - indexLine(a).q);
      kept.push({ id: 'T-other', name: 'Other', keywords: [], lineIds: byQ.map(l => l.id) });
    }
    return kept;
  }
  // extra words that make poor theme labels (still searchable)
  const LABEL_STOP = new Set('because though whatever anyway came come comes coming made make makes making took take takes told tell tells used use still every much many something someone anything everything nothing always never first last years year time times back people person whole little dragged'.split(' '));
  function topWords(lines, n) {
    const c = new Map();
    for (const l of lines) for (const t of new Set(indexLine(l).toks)) if (!STOP.has(t) && !LABEL_STOP.has(t) && t.length > 3 && !t.includes("'")) c.set(t, (c.get(t) || 0) + 1);
    return Array.from(c.entries()).sort((a, b) => b[1] - a[1]).slice(0, n).map(x => x[0]);
  }

  const AI_THEME_SCHEMA = {
    type: 'object', additionalProperties: false, required: ['themes'],
    properties: {
      themes: {
        type: 'array',
        items: {
          type: 'object', additionalProperties: false, required: ['name', 'summary', 'lineIds'],
          properties: { name: { type: 'string' }, summary: { type: 'string' }, lineIds: { type: 'array', items: { type: 'string' } } }
        }
      }
    }
  };
  /** AI themes: only the text of the lines (with ids and speaker names) is sent. Max ~1200 best lines per request. */
  /* AI prompts put the line listing first, as a cache breakpoint, and the task after it. The listing is built the same
     way every time (rows in project order, same columns), so asking again about the same lines reads it from Claude's
     cache at a small fraction of the price. */
  /** One listing row: id<TAB>speaker<TAB>text. */
  function aiRow(l) { return `${l.id}\t${l.speaker || '-'}\t${String(l.text).replace(/\s+/g, ' ').slice(0, 400)}`; }
  /** Lines in project order (the order of `all`), whatever order they were chosen in. */
  function inOrder(lines, all) { const at = new Map(all.map((l, i) => [l.id, i])); return lines.slice().sort((a, b) => (at.has(a.id) ? at.get(a.id) : 1e9) - (at.has(b.id) ? at.get(b.id) : 1e9)); }
  /** user content for US.ai: [cached listing, task]. cache: true = 5 minutes (the default: most listings are sent once or
      twice in a row), '1h' = an hour (listings often reused across a session, like the narrative pool). */
  function aiUser(listing, task, cache = true) { return [{ text: listing, cache }, task]; }

  async function themesAI(lines, { max = 10, job } = {}) {
    if (!US.ai || !US.ai.available()) throw new US.UserError('AI_KEY');
    const pool = inOrder(lines.slice().sort((a, b) => indexLine(b).q - indexLine(a).q).slice(0, 1200), lines);
    const listing = 'Interview lines (id<TAB>speaker<TAB>text):\n' + pool.map(aiRow).join('\n');
    job && job.set({ who: 'ai', msg: `${US.ai.label()} is reading ${pool.length} lines` });
    const r = await US.ai.json({
      system: 'You help a documentary editor sort interview soundbites into themes for a film. Use clear, short theme names an editor would put on a bin (2–4 words). Put each line in at most one theme, best and most quotable lines first. Leave out weak, off-topic or broken lines. Only use line ids that appear in the list.',
      user: aiUser(listing, `Group the interview lines above into between 3 and ${max} themes.`),
      schema: AI_THEME_SCHEMA, maxTokens: 16000, effort: 'low', feature: 'Find themes'
    });
    const known = new Set(pool.map(l => l.id)), used = new Set();
    const themes = (r.themes || []).map((t, i) => ({
      id: 'A' + i + '-' + Math.random().toString(36).slice(2, 6), name: String(t.name || `Theme ${i + 1}`).slice(0, 60), summary: String(t.summary || ''), keywords: [],
      lineIds: (t.lineIds || []).map(String).filter(id => known.has(id) && !used.has(id) && used.add(id))
    })).filter(t => t.lineIds.length);
    if (!themes.length) throw new US.UserError('AI_FAILED', { title: 'The AI didn’t find any themes.', action: 'Try again, or use “Find themes” without AI.' });
    return themes;
  }

  /* =================== matching to clips =================== */
  function stemName(p) { return US.stem(p).toLowerCase().replace(/[_\-.]+/g, ' ').replace(/\b(transcript|captions?|subs?|subtitles?|en|eng|english|final|v\d+)\b/g, '').replace(/\s+/g, ' ').trim(); }
  /** Best clip for a transcript file name: same stem, then one contains the other, then near-miss spelling. */
  function matchClip(fileName, clips) {
    const a = stemName(fileName);
    if (!a) return null;
    let best = null, bestScore = 0;
    for (const c of clips) {
      const b = stemName(c.name || c.path || ''), bp = stemName(c.path || '');
      let s = 0;
      if (a === b || a === bp) s = 1;
      else if (b && (a.includes(b) || b.includes(a))) s = 0.8 * Math.min(a.length, b.length) / Math.max(a.length, b.length) + 0.1;
      else { const d = levenshtein(a, b, 3); if (d <= 2 && a.length > 5) s = 0.6 - d * 0.1; }
      if (s > bestScore) { bestScore = s; best = c; }
    }
    return bestScore >= 0.45 ? best : null;
  }

  US.transcript = {
    TICKS, parseTime, parseSRT, parseVTT, parseCSV, parseTimedText, parseJSONTranscript, parseText, parseFile,
    decodePremiereTranscript, readProjectTranscripts, fromSubtitles, wordsToSentences, toLines, quality, askedQuestion, isInterviewerLabel, search, parseQuery,
    themesOffline, themesAI, AI_THEME_SCHEMA, aiRow, inOrder, aiUser, matchClip, stem, tokens, levenshtein, SYNONYMS, indexLine, lineWords, wordTimes
  };
})();
