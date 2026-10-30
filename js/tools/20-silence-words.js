/* JMG Ultra Studio – Silence Cut › Fillers and false starts: found from the words heard in a sequence (Story's
   transcripts, with Premiere's word timings), never from the sound alone. Pure logic (unit-tested); the card is in
   20-silence.js. Every find is a suggestion in the review list – nothing is cut until the editor makes a cut copy. */
(function () {
  'use strict';
  const US = window.US;

  // "um" and friends: almost never meant
  const FILLERS = new Set(['um', 'umm', 'ummm', 'uh', 'uhh', 'uhm', 'er', 'erm', 'errm', 'ah', 'ahh', 'eh', 'hmm', 'hm', 'mm', 'mmm']);
  // phrases that are fillers only sometimes: off unless asked for
  const SOFT = [['you', 'know'], ['i', 'mean'], ['sort', 'of'], ['kind', 'of'], ['like'], ['basically'], ['literally'], ['actually']];
  // small words whose doubling ("I I", "the the") is a stumble, not emphasis ("very very" is left alone)
  const STUTTER = new Set('i a an the and but so to we it that this in of on my he she they you is was are be or if at for with as our me us'.split(' '));
  const bare = w => String(w || '').toLowerCase().replace(/[’']/g, "'").replace(/^[^\p{L}\p{N}']+|[^\p{L}\p{N}']+$/gu, '').replace(/^'+|'+$/g, '');

  /** Every heard word in time order with its speaker, entry and whether its timing is exact. */
  function wordsOf(entries) {
    const out = [];
    for (const e of entries || []) for (const w of e.words || []) out.push({ start: w.start, end: w.end, text: w.text, b: bare(w.text), speaker: e.speakerKey || e.speaker || '', exact: !!e.exact, entry: e });
    return out.sort((a, b) => a.start - b.start);
  }
  /** "…and [um] we went…" */
  function context(ws, i, j) {
    const before = ws.slice(Math.max(0, i - 4), i).filter(w => w.speaker === ws[i].speaker).map(w => w.text).join(' ');
    const after = ws.slice(j + 1, j + 5).filter(w => w.speaker === ws[i].speaker).map(w => w.text).join(' ');
    return `${before ? '…' + before + ' ' : ''}[${ws.slice(i, j + 1).map(w => w.text).join(' ')}]${after ? ' ' + after + '…' : ''}`;
  }
  /** The cut for words i..j: from the first word to just before the next word (the pause after goes too), within this speaker. */
  function span(ws, i, j) {
    const next = ws[j + 1] && ws[j + 1].speaker === ws[i].speaker && ws[j + 1].start - ws[j].end < 1.5 ? ws[j + 1] : null;
    const prev = ws[i - 1] && ws[i - 1].speaker === ws[i].speaker ? ws[i - 1] : null;
    const start = prev ? Math.max(prev.end + 0.01, ws[i].start - 0.02) : ws[i].start - 0.02;
    const end = next ? Math.max(ws[j].end, next.start - 0.04) : ws[j].end + 0.04;
    return { start: Math.max(0, start), end };
  }
  /**
   * Fillers, soft fillers (if asked), doubled small words and restarts ("we went to the – we went to the shop").
   * -> [{id, kind: 'filler'|'soft'|'repeat'|'restart', start, end, text, context, exact, on}] in time order, not overlapping.
   * on: suggested (exact timings only – where words are spread evenly over a line, the editor ticks them).
   */
  function find(entries, { fillers = true, soft = false, falseStarts = true } = {}) {
    const ws = wordsOf(entries), out = [];
    const same = (a, b) => a && b && a.speaker === b.speaker && b.start - a.end < 1.5;
    const add = (kind, i, j) => { const s = span(ws, i, j), exact = ws.slice(i, j + 1).every(w => w.exact); out.push({ id: `${kind}-${Math.round(s.start * 100)}`, kind, start: s.start, end: s.end, text: ws.slice(i, j + 1).map(w => w.text).join(' '), context: context(ws, i, j), exact, on: exact }); };
    for (let i = 0; i < ws.length; i++) {
      const w = ws[i];
      if (fillers && FILLERS.has(w.b)) { add('filler', i, i); continue; }
      if (soft) { const hit = SOFT.find(p => p.every((x, k) => ws[i + k] && ws[i + k].b === x && (!k || same(ws[i + k - 1], ws[i + k])))); if (hit && /[,]$/.test(ws[i + hit.length - 1].text) || (hit && i > 0 && /,$/.test(ws[i - 1].text))) { add('soft', i, i + hit.length - 1); i += hit.length - 1; continue; } }
      if (!falseStarts) continue;
      // a doubled small word: cut the first
      if (STUTTER.has(w.b) && same(w, ws[i + 1]) && ws[i + 1].b === w.b) { add('repeat', i, i); continue; }
      // a restart: the same 2+ words again within the next few words, with no sentence ending between – cut up to the restart
      for (let j = i + 2; j <= i + 8 && j < ws.length; j++) {
        if (!same(ws[j - 1], ws[j]) || /[.!?]$/.test(ws[j - 1].text)) break;
        let k = 0; while (k < 4 && ws[i + k] && ws[j + k] && i + k < j && ws[i + k].b && ws[i + k].b === ws[j + k].b) k++;
        // a comma inside means a finished clause (“I think we should go, and I think we should stay”), not a restart
        if (k >= 2 && !ws.slice(i, j).some(x => /[,;:]$/.test(x.text))) {
          add('restart', i, j - 1);
          // ticked only when it's clearly abandoned: broken off with a dash or dots, or just a few words
          const last = out[out.length - 1]; last.on = last.on && (/[-–—…]$|\.\.\.$/.test(ws[j - 1].text) || j - i <= 3);
          i = j - 1; break;
        }
      }
    }
    // one cut per stretch: an overlap keeps the earlier find, extended
    out.sort((a, b) => a.start - b.start);
    const merged = [];
    for (const c of out) { const last = merged[merged.length - 1]; if (last && c.start < last.end) { last.end = Math.max(last.end, c.end); last.text += ' ' + c.text; continue; } merged.push(c); }
    return merged;
  }
  /** Ranges to cut from ticked finds plus pauses, overlaps joined: [[start, end]] */
  function ranges(items, pauses = []) {
    const all = items.filter(x => x.on).map(x => [x.start, x.end]).concat(pauses.map(p => [p.start, p.end])).sort((a, b) => a[0] - b[0]);
    const out = [];
    for (const r of all) { const last = out[out.length - 1]; if (last && r[0] <= last[1] + 0.02) last[1] = Math.max(last[1], r[1]); else out.push(r.slice()); }
    return out.filter(r => r[1] - r[0] > 0.03);
  }
  const KIND = { filler: 'Filler', soft: 'Soft filler', repeat: 'Repeated word', restart: 'False start' };

  US.speechCleanup = { FILLERS, SOFT, STUTTER, find, ranges, wordsOf, KIND, bare };
})();
