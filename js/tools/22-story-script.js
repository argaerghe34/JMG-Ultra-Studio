/* JMG Ultra Studio – Story › From a script: paste a script or a paper edit, and each of its lines is found in the
   interviews – word for word, or the closest thing said – cut to just those words, with the next-best takes to choose
   from. Then build it in the script's order, a group per section. Matching runs on this computer from the transcript
   text; for lines it can't find (a paraphrase, "Ruth on her grandmother"), the AI may choose among the closest lines,
   reading only text. Pure logic (unit-tested); the card and the build are in 22-story.js. */
(function () {
  'use strict';
  const US = window.US;
  const T = () => US.transcript;

  /* ---------- the script ---------- */
  // directions, not words to find: [B-roll of the market], (music up), VO:, GFX, TITLE…
  const DIRECTION = /^\s*(\[.*\]|\(.*\)|(?:b-?roll|broll|music|sfx|gfx|graphics?|title|lower third|super|v\.?o\.?|voice ?over|narrator|cut to|fade (?:in|out)|scene|int\.|ext\.)\b[:.\s-]?)/i;
  /**
   * The script as units to find: one per line (a long line split into sentences), with the section it's in and a
   * speaker hint from "RUTH:" / "Ruth –". Headings (# Act one, or a short line ending in a colon) start a section;
   * directions are kept as notes and not looked for. -> {sections: [name], units: [{id, section, text, speaker, note}]}
   */
  function parse(text) {
    const sections = [], units = []; let sec = -1, n = 0;
    const section = name => { sections.push(name); sec = sections.length - 1; };
    for (const raw of String(text || '').replace(/\r\n?/g, '\n').split('\n')) {
      const line = raw.trim();
      if (!line) continue;
      const head = /^#+\s*(.+)$/.exec(line) || (/^[^.!?"“]{1,40}:$/.test(line) ? [line, line.slice(0, -1)] : null);
      if (head) { section(head[1].trim()); continue; }
      if (sec < 0) section('');
      if (DIRECTION.test(line)) { units.push({ id: 'S' + (++n), section: sec, text: line, speaker: '', note: true }); continue; }
      // "Ruth: …" or "RUTH – …" (a dash only after a name in capitals, so "Then – we left" stays a line)
      const sp = /^([A-Z][\p{L}'.-]*(?:\s[A-Z][\p{L}'.-]*){0,2})\s*:\s+(.+)$/u.exec(line) || /^([A-Z][A-Z'.-]+(?:\s[A-Z][A-Z'.-]+){0,2})\s*[–—-]\s+(.+)$/u.exec(line);
      const speaker = sp && sp[1].length <= 30 ? sp[1] : '', body = (speaker ? sp[2] : line).replace(/^["“]|["”]$/g, '').trim();
      const parts = body.split(/\s+/).length > 40 ? body.match(/[^.!?…]+[.!?…]+["”’)]*|\S[^.!?…]*$/g).map(s => s.trim()).filter(Boolean) : [body];
      for (const p of parts) units.push({ id: 'S' + (++n), section: sec, text: p, speaker, note: false });
    }
    return { sections, units };
  }

  /* ---------- finding it ---------- */
  const content = t => !T().STOP.has(t) && !/^(um|uh|er|erm|ah|mm|hmm)$/.test(t);
  /** A line's words as tokens, with the word each came from. */
  function wordsOf(line) {
    const ws = T().lineWords(line.text), out = [];
    ws.forEach((w, wi) => T().tokens(w).forEach(t => out.push({ t, st: T().stem(t), wi, c: content(t) })));
    return out;
  }
  /** Longest common subsequence of a and b (by .st), with the b positions it used. */
  function lcs(a, b) {
    const m = a.length, n = b.length, d = Array.from({ length: m + 1 }, () => new Uint16Array(n + 1));
    for (let i = m - 1; i >= 0; i--) for (let j = n - 1; j >= 0; j--) d[i][j] = a[i].st === b[j].st ? d[i + 1][j + 1] + 1 : Math.max(d[i + 1][j], d[i][j + 1]);
    const used = []; let i = 0, j = 0;
    while (i < m && j < n) { if (a[i].st === b[j].st) { used.push(j); i++; j++; } else if (d[i + 1][j] >= d[i][j + 1]) i++; else j++; }
    return used;
  }
  /**
   * Score how well a window of lines says a script unit: how much of the unit's meaning words it has (coverage), in the
   * same order (sequence), and how little else is in between (density). The matched words set the span – stretched to
   * take in the unit's small words at either end when they're there too.
   * -> {score, w0: [lineIdx, wordIdx], w1: [lineIdx, wordIdx]} or null
   */
  function scoreWindow(unitToks, win) {
    const toks = []; win.forEach((l, li) => { for (const x of l.toks) toks.push(Object.assign({ li }, x)); });
    const uc = unitToks.filter(x => x.c), tc = toks.filter(x => x.c);
    if (!uc.length || !tc.length) return null;
    const ustems = new Set(uc.map(x => x.st)), have = new Set(tc.map(x => x.st));
    let hit = 0; for (const s of ustems) if (have.has(s)) hit++;
    const coverage = hit / ustems.size;
    if (coverage < 0.3) return null;
    const used = lcs(uc, tc), seq = used.length / uc.length;
    if (!used.length) return null;
    const a = tc[used[0]], b = tc[used[used.length - 1]];
    let i0 = toks.indexOf(a), i1 = toks.indexOf(b);
    // the unit's leading and trailing small words, if they're said right there
    const lead = unitToks.findIndex(x => x.c), trail = unitToks.length - 1 - unitToks.map(x => x.c).lastIndexOf(true);
    for (let k = 1; k <= lead && i0 - 1 >= 0 && toks[i0 - 1].t === unitToks[lead - k].t; k++) i0--;
    for (let k = 1; k <= trail && i1 + 1 < toks.length && toks[i1 + 1].t === unitToks[unitToks.length - trail - 1 + k].t; k++) i1++;
    const inSpan = toks.slice(i0, i1 + 1).filter(x => x.c).length, density = Math.min(1, used.length / Math.max(1, inSpan));
    const score = 0.45 * coverage + 0.4 * seq + 0.15 * density;
    // how many of the unit's words each line says – a line that adds only a word or two is a stitch, not the line
    const perLine = win.map((_, li) => used.filter(j => tc[j].li === li).length);
    return { score, perLine, w0: [toks[i0].li, toks[i0].wi], w1: [toks[i1].li, toks[i1].wi] };
  }
  const GRADE = s => (s >= 0.85 ? 'exact' : s >= 0.6 ? 'close' : s >= 0.4 ? 'weak' : 'none');
  /**
   * Every unit's best matches in the transcripts: windows of 1–3 neighbouring lines by the same speaker, cut to the
   * matched words. transcripts: [{key, lines}]; keep(line): which lines may be used; speakerOf(line): a name to compare
   * with the unit's speaker hint. -> Map(unitId -> [{key, lineIds, from: [i, w], to: [i, w], score, grade, text}]) best first
   */
  function match(units, transcripts, { keep = () => true, speakerOf = l => l.speaker || '', alternates = 4 } = {}) {
    // every line once: its tokens, and an index of meaning-word stems -> where they're said
    const index = new Map(), all = [];
    for (const t of transcripts) t.lines.forEach((l, i) => {
      if (!keep(l)) return;
      const x = { t, i, l, toks: wordsOf(l) }; all.push(x); x.n = all.length - 1;
      for (const s of new Set(x.toks.filter(k => k.c).map(k => k.st))) { if (!index.has(s)) index.set(s, []); index.get(s).push(x); }
    });
    const byLine = new Map(all.map(x => [x.l.id, x]));
    const out = new Map();
    for (const u of units) {
      if (u.note) continue;
      const ut = T().tokens(u.text).map(t => ({ t, st: T().stem(t), c: content(t) }));
      const stems = Array.from(new Set(ut.filter(x => x.c).map(x => x.st)));
      // lines with at least one of the unit's rarer words start a window
      const starts = new Set(), rare = stems.map(s => [s, (index.get(s) || []).length]).filter(x => x[1]).sort((a, b) => a[1] - b[1]).slice(0, 4);
      for (const [s] of rare) for (const x of index.get(s)) { starts.add(x); const prev = x.t.lines[x.i - 1] && byLine.get(x.t.lines[x.i - 1].id); if (prev) starts.add(prev); }
      const cands = [];
      for (const x of starts) {
        const win = [x];
        for (let k = 1; k < 3; k++) {
          const nl = x.t.lines[x.i + k], nx = nl && byLine.get(nl.id), last = win[win.length - 1];
          if (!nx || nl.speaker !== x.l.speaker || nl.start - last.l.end > 4) break;
          win.push(nx);
        }
        for (let len = 1; len <= win.length; len++) {
          const w = win.slice(0, len), r = scoreWindow(ut, w);
          if (!r) continue;
          const sp = u.speaker && speakerOf(x.l) && new RegExp(`\\b${u.speaker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(speakerOf(x.l)) ? 0.05 : 0;
          // a window must use its last line (else the shorter one says it) – and the first
          if (r.w1[0] !== len - 1 || r.w0[0] !== 0) continue;
          // never a franken-bite: across lines, each line must carry its share of the words
          if (len > 1 && r.perLine.some(k => k < 2)) continue;
          cands.push({ key: x.t.key, lineIds: w.map(y => y.l.id), from: [x.i, r.w0[1]], to: [x.i + len - 1, r.w1[1]], score: Math.min(1, r.score + sp) });
        }
      }
      cands.sort((a, b) => b.score - a.score || a.lineIds.length - b.lineIds.length);
      const picks = [];
      for (const c of cands) {
        if (picks.length >= alternates) break;
        if (picks.some(p => p.key === c.key && p.lineIds.some(id => c.lineIds.includes(id)))) continue;   // the same moment, cut differently
        const ws = c.lineIds.map(id => T().lineWords(byLine.get(id).l.text));
        const text = c.lineIds.length === 1 ? ws[0].slice(c.from[1], c.to[1] + 1).join(' ') : [ws[0].slice(c.from[1]).join(' ')].concat(ws.slice(1, -1).map(x => x.join(' ')), [ws[ws.length - 1].slice(0, c.to[1] + 1).join(' ')]).join(' ');
        picks.push(Object.assign(c, { grade: GRADE(c.score), text }));
      }
      out.set(u.id, picks);
    }
    return out;
  }

  /* ---------- the AI, for lines that aren't said word for word ---------- */
  const SCHEMA = { type: 'object', additionalProperties: false, required: ['picks'], properties: { picks: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['unit', 'line', 'why'], properties: { unit: { type: 'string' }, line: { type: 'string' }, why: { type: 'string' } } } } } };
  /** For units with no good match: the closest lines for each (as text), and the AI picks the one that says it, or "none". */
  function request(asks) {
    const sys = 'You match a video script to interview transcripts. For each script line (S…) you get candidate interview lines (L…). Pick the one candidate that says what the script line means – the same point, even in other words – or "none" if none of them does. Never pick a line that only shares a topic. "why": a few words.';
    const body = asks.map(a => `${a.unit.id}\t${a.unit.speaker ? a.unit.speaker + ': ' : ''}${a.unit.text}\n${a.cands.map(c => `  ${c.id}\t${c.speaker}\t${String(c.text).replace(/\s+/g, ' ').slice(0, 400)}`).join('\n')}`).join('\n\n');
    return { system: [{ text: sys, cache: true }], user: [`SCRIPT LINES AND CANDIDATES:\n${body}`], schema: SCHEMA, maxTokens: 4000, effort: 'low', feature: 'From a script' };
  }

  /* ---------- building ---------- */
  /**
   * Groups for Story's builder, in the script's order: a group per section; each chosen match cut to its words (with a
   * little air when the words carry their own times; whole lines when they don't). A line that comes back in the same
   * section starts another group of the same name, so neither clip is lost. lineOf(id) -> line.
   * -> [{name, label, lineIds, trims, lineMarks, pinned, ideas}]
   */
  function groups(parsed, chosen, lineOf, { before = 0.1, after = 0.2, labels = [] } = {}) {
    const out = []; let cur = null, curSec = -1;
    const open = sec => { cur = { name: parsed.sections[sec] || '', label: labels.length ? labels[sec % labels.length] : null, lineIds: [], trims: {}, lineMarks: {}, pinned: new Set(), ideas: [] }; out.push(cur); curSec = sec; };
    for (const u of parsed.units) {
      const m = chosen.get(u.id);
      if (u.note || !m) continue;
      if (curSec !== u.section || m.lineIds.some(id => cur.lineIds.includes(id))) open(u.section);
      m.lineIds.forEach((id, k) => {
        const l = lineOf(id); if (!l) return;
        const wt = T().wordTimes(l), first = k === 0, last = k === m.lineIds.length - 1;
        const s = first && wt.exact ? Math.max(l.start - 0.3, wt.words[m.from[1]].s - before) : l.start;
        const e = last && wt.exact ? Math.min(l.end + 0.3, wt.words[m.to[1]].e + after) : l.end;
        cur.lineIds.push(id); cur.trims[id] = { start: Math.max(0, s), end: e };
        if (first && m.grade !== 'exact') cur.lineMarks[id] = { name: `${m.grade === 'ai' ? 'Chosen by AI' : m.grade === 'close' ? 'Close' : 'Loose'}: ${u.text}`.slice(0, 64), comment: u.text };
      });
    }
    return out.filter(g => g.lineIds.length);
  }

  US.storyScript = { parse, match, scoreWindow, request, groups, GRADE, SCHEMA, DIRECTION };
})();
