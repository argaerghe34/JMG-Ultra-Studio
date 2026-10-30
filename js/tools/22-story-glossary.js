/* JMG Ultra Studio – Story › Names and terms. Pure logic (unit-tested); the card is in 22-story.js.
   A per-project list of how names, places and jargon are spelt, and how the transcription heard them. Corrections are
   made word by word from each line's original text (kept), so applying again never doubles a name and word timings stay
   exact (a replaced stretch's time is shared by the new words). Entries marked "keep out of AI" are swapped for
   placeholders ("[Name 1]") in everything sent to the AI and put back in its answers. */
(function () {
  'use strict';
  const US = window.US;
  const T = () => US.transcript;

  // a word compared without case, accents or the punctuation around it
  const bare = w => String(w || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[’']/g, "'").replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
  const split = s => String(s || '').split(/[ \t\r\n]+/).filter(Boolean);
  /** Entries as kept: [{right, heard:[spellings], hide}] – empty ones dropped, heard never equal to right. */
  function clean(list) {
    return (list || []).map(e => {
      const right = String(e.right || '').replace(/\s+/g, ' ').trim();
      const heard = (Array.isArray(e.heard) ? e.heard : String(e.heard || '').split(/[,;\n]/)).map(x => x.replace(/\s+/g, ' ').trim()).filter(x => x && x !== right);   // a different case counts too: “jacob” → “Jacob”
      return { right, heard: Array.from(new Set(heard)), hide: !!e.hide };
    }).filter(e => e.right);
  }
  /** The spellings to replace, longest first so "Jacob Gersh" wins over "Jacob". */
  function rules(entries) {
    const out = [];
    for (const e of clean(entries)) for (const h of e.heard) { const toks = split(h).map(bare).filter(Boolean); if (toks.length) out.push({ toks, right: e.right }); }
    return out.sort((a, b) => b.toks.length - a.toks.length);
  }
  /**
   * One line's words corrected. words: ["I'm", "Jakob,"…]; w: word timings [s0,e0,s1,e1…] in centiseconds or null.
   * -> {words, w, changed}
   */
  function fixWords(words, w, rs) {
    const outW = [], outT = w ? [] : null; let changed = false;
    for (let i = 0; i < words.length;) {
      const hit = rs.find(r => r.toks.every((t, k) => i + k < words.length && bare(words[i + k]) === t));
      if (!hit) { outW.push(words[i]); if (outT) outT.push(w[2 * i], w[2 * i + 1]); i++; continue; }
      const n = hit.toks.length, first = words[i], last = words[i + n - 1];
      const lead = (first.match(/^[^\p{L}\p{N}]+/u) || [''])[0], trail = (last.match(/[^\p{L}\p{N}]+$/u) || [''])[0];
      const rep = split(hit.right), already = rep.length === n && rep.every((x, k) => x === words[i + k].replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ''));
      rep[0] = lead + rep[0]; rep[rep.length - 1] += trail;
      if (!already) changed = true;
      outW.push(...rep);
      if (outT && rep.length === n) for (let k = 0; k < n; k++) outT.push(w[2 * (i + k)], w[2 * (i + k) + 1]);   // word for word: each keeps its own time
      else if (outT) { const s = w[2 * i], e = w[2 * (i + n - 1) + 1], step = (e - s) / rep.length; rep.forEach((x, k) => outT.push(Math.round(s + step * k), Math.round(s + step * (k + 1)))); }
      i += n;
    }
    return { words: outW, w: outT, changed };
  }
  /**
   * Correct lines in place from their original text: text (and word timings) become the corrected version, the
   * original is kept in orig / origW, and a line no rule touches any more goes back to its original. -> lines changed
   */
  function apply(lines, entries) {
    const rs = rules(entries); let n = 0;
    for (const l of lines || []) {
      const base = l.orig != null ? l.orig : l.text, baseW = l.orig != null ? l.origW : l.w;
      const words = T().lineWords(base), w = Array.isArray(baseW) && baseW.length === 2 * words.length ? baseW : null;
      const r = rs.length ? fixWords(words, w, rs) : { changed: false }, before = l.text;
      if (r.changed) {
        const text = r.words.join(' ');
        if (l.orig == null) { l.orig = l.text; if (l.w) l.origW = l.w; }
        if (l.text !== text) n++;
        l.text = text; if (r.w) l.w = r.w; else delete l.w;
      } else if (l.orig != null) {
        l.text = l.orig; if (l.origW) l.w = l.origW; else delete l.w;
        delete l.orig; delete l.origW; n++;
      }
      if (l.text !== before) l._idx = null;   // the search index is made again from the new words
    }
    return n;
  }
  /**
   * Placeholders for the names kept out of AI: every spelling (right and heard) becomes "[Name 1]" etc. in what's
   * sent, and the placeholders in the answer become the right spelling again. -> {redact(text), restore(text), count} or null
   */
  function redactor(entries) {
    const hide = clean(entries).filter(e => e.hide);
    if (!hide.length) return null;
    const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
    const table = hide.map((e, i) => ({ ph: `[Name ${i + 1}]`, right: e.right, re: new RegExp(`(?<![\\p{L}\\p{N}])(?:${[e.right].concat(e.heard).sort((a, b) => b.length - a.length).map(esc).join('|')})(?![\\p{L}\\p{N}])`, 'giu') }));
    return {
      count: hide.length,
      redact: text => table.reduce((t, x) => t.replace(x.re, x.ph), String(text)),
      restore: text => table.reduce((t, x) => t.split(x.ph).join(x.right), String(text))
    };
  }
  /**
   * Names the transcription may have spelt in more than one way: capitalised words (not at a sentence start) that
   * look alike – "Gersch" and "Gersh", "Jakob" and "Jacob". -> [{right (the commonest), heard:[the others], count}]
   */
  function suggest(lines, entries = []) {
    const known = new Set(clean(entries).flatMap(e => [e.right].concat(e.heard)).map(bare));
    const count = new Map();
    for (const l of lines || []) {
      const ws = T().lineWords(l.text);
      ws.forEach((w, i) => {
        const core = w.replace(/^[^\p{L}]+|[^\p{L}]+$/gu, '');
        if (core.length < 3 || !/^\p{Lu}\p{Ll}/u.test(core) || i === 0 || /[.!?]$/.test(ws[i - 1]) || known.has(bare(core))) return;
        count.set(core, (count.get(core) || 0) + 1);
      });
    }
    const names = Array.from(count.entries()).filter(([w]) => !COMMON.has(w.toLowerCase())).sort((a, b) => b[1] - a[1]);
    const used = new Set(), out = [];
    for (const [w, c] of names) {
      if (used.has(w)) continue;
      const like = names.filter(([x]) => x !== w && !used.has(x) && Math.abs(x.length - w.length) <= 2 && T().levenshtein(bare(x), bare(w)) <= (w.length >= 6 ? 2 : 1) && bare(x)[0] === bare(w)[0]);
      if (!like.length) continue;
      used.add(w); like.forEach(([x]) => used.add(x));
      out.push({ right: w, heard: like.map(([x]) => x), count: c + like.reduce((n, [, k]) => n + k, 0) });
    }
    return out.slice(0, 20);
  }
  // capitalised words that aren't names
  const COMMON = new Set('i the and but so then when where what who why how this that these those there they we you he she it my our your his her their mr mrs ms dr monday tuesday wednesday thursday friday saturday sunday january february march april may june july august september october november december english french german god christmas easter okay yeah'.split(' '));

  US.storyGlossary = { clean, rules, fixWords, apply, redactor, suggest, bare };
})();
