/* JMG Ultra Studio – Story › Clip Finder: short clips for social from the interviews or a timeline (a podcast
   episode, a rough cut). The AI reads the lines as text and suggests clips that stand on their own – each with a hook,
   a title, a score for each part of a good clip (hook, stands alone, payoff, length) and the reason in words, not a
   bare "virality" number. A clip may join lines from different places (a question's answer plus its punchline); each
   part ends where a sentence ends. Pure logic (unit-tested); running and building are in 22-story.js. */
(function () {
  'use strict';
  const US = window.US;

  const SCHEMA = {
    type: 'object', additionalProperties: false, required: ['clips'],
    properties: { clips: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['title', 'hook', 'parts', 'scores', 'reason', 'caption'], properties: {
      title: { type: 'string' }, hook: { type: 'string' }, reason: { type: 'string' }, caption: { type: 'string' },
      parts: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['from', 'to'], properties: { from: { type: 'string' }, to: { type: 'string' } } } },
      scores: { type: 'object', additionalProperties: false, required: ['hook', 'standalone', 'payoff', 'length'], properties: { hook: { type: 'number' }, standalone: { type: 'number' }, payoff: { type: 'number' }, length: { type: 'number' } } } } } } }
  };
  const SYSTEM = [
    'You find short clips for social media (Reels, TikTok, Shorts, LinkedIn) in interview or podcast transcripts, for a video editor. You get the lines, each with an id, speaker, start time and length in seconds, and the text.',
    'A good clip: the first seconds hook (a surprising claim, a question, a strong feeling, a story starting); it makes sense on its own with no context; it pays off (a punchline, insight, turn or emotional peak); it fits the length asked.',
    '- "parts": one or more stretches of consecutive lines (from → to, same interview). Usually one part; join a second part only when it really completes the first (a question and its answer, a set-up and its punchline). Each part must start and end on whole sentences.',
    '- "scores": 0–10 each for hook, standalone, payoff and length (how well it fits the length asked).',
    '- "hook": the opening words as a viewer would see them as on-screen text (under 12 words, from what is said).',
    '- "title": under 60 characters. "caption": a post caption of 1–2 sentences. "reason": why it works, in one sentence.',
    '- Never invent anything that isn’t said. Best clips first. Don’t pick the interviewer’s questions on their own.'
  ].join('\n');
  function listing(lines) { return lines.map(l => `${l.id}\t${l.speaker || 'Speaker'}\t${Math.round(l.start)}s+${(l.end - l.start).toFixed(1)}\t${String(l.text).replace(/\s+/g, ' ').trim()}`).join('\n'); }
  function request(lines, { count = 8, min = 20, max = 60, brief = '' } = {}) {
    return { system: [{ text: SYSTEM, cache: true }], user: [{ text: 'LINES:\n' + listing(lines), cache: '1h' }, `Find up to ${count} clips of ${min}–${max} seconds.${String(brief).trim() ? ` What the editor wants: ${String(brief).trim()}` : ''}`], schema: SCHEMA, maxTokens: 8000, effort: 'medium', feature: 'Clip Finder' };
  }
  const ends = t => /[.!?…]["”’')\]]*$/.test(String(t || '').trim());
  /**
   * The AI's clips tidied: parts of known, consecutive lines in one interview (turned round if needed), run on to the
   * end of the sentence (same speaker, up to 2 lines) and back to its start; lengths measured; clips far outside the
   * length dropped; best first by the scores. order: id -> {list, i} (the lines of each interview in order).
   * -> [{title, hook, caption, reason, parts:[{lineIds}], seconds, scores, score}]
   */
  function organise(r, at, { min = 20, max = 60 } = {}) {
    const out = [];
    for (const c of (r && r.clips) || []) {
      const parts = [], used = new Set();
      for (const p of c.parts || []) {
        let a = at.get(String(p.from)), b = at.get(String(p.to || p.from));
        if (!a) continue; if (!b || b.list !== a.list) b = a;
        let i0 = Math.min(a.i, b.i), i1 = Math.max(a.i, b.i);
        const ls = a.list, sp = ls[i0].speaker;
        if (i1 - i0 > 40) i1 = i0 + 40;
        while (i0 > 0 && i0 > Math.min(a.i, b.i) - 1 && ls[i0 - 1].speaker === sp && !ends(ls[i0 - 1].text) && /^[\p{Ll}…,;]/u.test(String(ls[i0].text).trim())) i0--;
        let k = 0; while (i1 < ls.length - 1 && k < 2 && !ends(ls[i1].text) && ls[i1 + 1].speaker === ls[i1].speaker) { i1++; k++; }
        const ids = ls.slice(i0, i1 + 1).map(l => l.id).filter(id => !used.has(id));
        ids.forEach(id => used.add(id));
        if (ids.length) parts.push({ lineIds: ids, start: ls[i0].start, end: ls[i1].end });
      }
      if (!parts.length) continue;
      const seconds = parts.reduce((n, p) => n + p.end - p.start, 0);
      if (seconds < min * 0.6 || seconds > max * 1.4) continue;
      const s = c.scores || {}, cl = x => Math.max(0, Math.min(10, +x || 0));
      const scores = { hook: cl(s.hook), standalone: cl(s.standalone), payoff: cl(s.payoff), length: cl(s.length) };
      out.push({ title: String(c.title || '').trim().slice(0, 80) || 'Clip', hook: String(c.hook || '').trim(), caption: String(c.caption || '').trim(), reason: String(c.reason || '').trim(), parts, seconds, scores, score: Math.round((scores.hook * 0.35 + scores.standalone * 0.3 + scores.payoff * 0.25 + scores.length * 0.1) * 10) / 10 });
    }
    // the same lines twice: keep the better one
    const seen = new Set();
    return out.sort((a, b) => b.score - a.score).filter(c => { const k = c.parts.flatMap(p => p.lineIds).join(','); if (seen.has(k)) return false; seen.add(k); return true; });
  }
  /**
   * Without AI: windows of consecutive lines by one speaker, 20–60 s, starting on a strong short line and ending on a
   * sentence; scored by the lines' own strength. quality(line) -> 0..1.
   */
  function basic(lists, quality, { count = 8, min = 20, max = 60 } = {}) {
    const cands = [];
    for (const ls of lists) for (let i = 0; i < ls.length; i++) {
      let j = i, secs = ls[i].end - ls[i].start;
      while (j + 1 < ls.length && ls[j + 1].speaker === ls[i].speaker && secs < min) { j++; secs = ls[j].end - ls[i].start; }
      while (j + 1 < ls.length && ls[j + 1].speaker === ls[i].speaker && !ends(ls[j].text) && ls[j + 1].end - ls[i].start <= max) { j++; secs = ls[j].end - ls[i].start; }
      if (secs < min * 0.8 || secs > max) continue;
      const q = ls.slice(i, j + 1).map(quality), hook = quality(ls[i]);
      cands.push({ title: ls[i].text.split(/\s+/).slice(0, 8).join(' '), hook: ls[i].text.split(/\s+/).slice(0, 10).join(' '), caption: '', reason: 'Strong lines from one speaker (basic – no AI)', parts: [{ lineIds: ls.slice(i, j + 1).map(l => l.id), start: ls[i].start, end: ls[j].end }], seconds: secs, scores: { hook: Math.round(hook * 10), standalone: 5, payoff: Math.round(Math.max(...q) * 10), length: 10 }, score: Math.round((hook * 0.5 + q.reduce((a, b) => a + b, 0) / q.length * 0.5) * 100) / 10 });
    }
    // best first, never two clips sharing lines
    const used = new Set(), out = [];
    for (const c of cands.sort((a, b) => b.score - a.score)) { const ids = c.parts[0].lineIds; if (ids.some(id => used.has(id))) continue; ids.forEach(id => used.add(id)); out.push(c); if (out.length >= count) break; }
    return out;
  }

  US.storyClips = { SCHEMA, SYSTEM, listing, request, organise, basic };
})();
