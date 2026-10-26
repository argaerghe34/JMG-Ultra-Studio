/* JMG Ultra Studio – Story: captions for a sequence from its timeline transcript (pure, unit-tested).
   Uses each word's time on the sequence, so captions follow the speech exactly where Premiere has word timings. */
(function () {
  'use strict';
  const US = window.US;
  const STYLES = {
    subtitles: { label: 'Subtitles', desc: 'Two lines, up to 42 characters each – for YouTube, festivals and accessibility.', lines: 2, chars: 42, words: 99, maxDur: 7, minDur: 0.8 },
    social: { label: 'Social', desc: 'A few words at a time, one line – for Reels, TikTok and Shorts.', lines: 1, chars: 20, words: 3, maxDur: 2.5, minDur: 0.35 },
    words: { label: 'One word', desc: 'One word at a time.', lines: 1, chars: 40, words: 1, maxDur: 1.5, minDur: 0.2 }
  };
  /** Words of an entry on the sequence: Premiere's word times, or spread evenly over the line. */
  function wordsOf(e) {
    const clean = t => t.replace(/^…|…$/g, '');
    if (e.words && e.words.length) return e.words.map(w => ({ start: w.start, end: Math.max(w.end, w.start + 0.05), text: clean(w.text) })).filter(w => w.text);
    const t = clean(e.text).split(/\s+/).filter(Boolean), d = (e.end - e.start) / Math.max(1, t.length);
    return t.map((w, i) => ({ start: e.start + i * d, end: e.start + (i + 1) * d, text: w }));
  }
  /** Break a cue's text into at most `lines` lines near the middle. */
  function wrap(text, lines, chars) {
    if (lines < 2 || text.length <= chars) return text;
    const mid = text.length / 2; let best = -1;
    for (let i = 0; i < text.length; i++) if (text[i] === ' ' && (best < 0 || Math.abs(i - mid) < Math.abs(best - mid))) best = i;
    return best < 0 ? text : text.slice(0, best) + '\n' + text.slice(best + 1);
  }
  /**
   * Caption cues. entries: timeline entries with display names in `name`. opts: {style, names, upper}.
   * Speaker changes always start a new caption; with names on, a person's name opens their first caption of each turn
   * (only when more than one person speaks). -> [{start, end, text}]
   */
  function cues(entries, { style = 'subtitles', names = false, upper = false } = {}) {
    const S = STYLES[style] || STYLES.subtitles, maxChars = S.chars * S.lines;
    const multi = new Set(entries.map(e => e.name)).size > 1;
    const out = [];
    let cur = null, lastName = null;
    const textOf = c => c.prefix + c.words.map(x => x.text).join(' ');
    const flush = () => { if (cur && cur.words.length) out.push({ start: cur.words[0].start, end: cur.words[cur.words.length - 1].end, text: textOf(cur) }); cur = null; };
    for (const e of entries) {
      // a new line always starts a new caption; a new speaker's first caption can carry their name
      flush();
      let prefix = names && multi && e.name !== lastName && style !== 'words' ? `${e.name}: ` : '';
      lastName = e.name;
      for (const w of wordsOf(e)) {
        if (cur) {
          const last = cur.words[cur.words.length - 1].text, text = textOf(cur) + ' ' + w.text;
          const full = text.length > maxChars || cur.words.length >= S.words || w.end - cur.words[0].start > S.maxDur;
          const soft = (/[.!?…]$/.test(last) && text.length > maxChars * 0.4) || (/[,;:–—]$/.test(last) && text.length > maxChars * 0.7) || w.start - cur.words[cur.words.length - 1].end > 0.8;
          if (full || soft) flush();
        }
        if (!cur) { cur = { prefix, words: [] }; prefix = ''; }
        cur.words.push(w);
      }
    }
    flush();
    // tidy: no overlaps, a minimum time on screen, small gaps closed so captions don't flicker
    out.sort((a, b) => a.start - b.start);
    for (let i = 0; i < out.length; i++) {
      const c = out[i], next = out[i + 1];
      if (next && c.end > next.start) c.end = next.start;
      if (c.end - c.start < S.minDur) c.end = next ? Math.min(c.start + S.minDur, next.start) : c.start + S.minDur;
      if (next && next.start - c.end < 0.25) c.end = next.start;
      c.text = wrap(upper ? c.text.toUpperCase() : c.text, S.lines, S.chars);
    }
    return out.filter(c => c.end - c.start > 0.04);
  }
  function srtTime(sec) {
    const ms = Math.max(0, Math.round(sec * 1000)), h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, s = Math.floor(ms / 1000) % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms % 1000).padStart(3, '0')}`;
  }
  const toSRT = list => list.map((c, i) => `${i + 1}\n${srtTime(c.start)} --> ${srtTime(c.end)}\n${c.text}\n`).join('\n');
  US.storyCaptions = { STYLES, cues, toSRT, wordsOf, wrap };
})();
