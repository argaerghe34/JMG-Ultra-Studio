/* JMG Ultra Studio – Ask your interviews. Pure logic (unit-tested); the result card is in 22-story.js, the chat in
   40-assistant.js. A free-form request (“every story about Grandma, in order”, “where do Ruth and Sam disagree?”, “a
   45-second opening”) goes to the AI with the shared transcript (cached an hour, so asking again or refining is cheap);
   it answers in words and in groups of clips – whole stretches of speech – that the editor checks, edits and then
   builds, marks, makes into themes or saves. Text only. */
(function () {
  'use strict';
  const US = window.US;

  const RULES = [
    'Do what they ask using the transcripts above.',
    '- “answer”: a short written reply (2–5 sentences, plain British English): what you found or the answer to their question, and anything worth knowing (for example if little fits, or someone never mentions it).',
    '- “groups”: the clips. Use groups whenever lines, clips, moments, a selection or a cut would help – and also to show where people say what your answer claims. Give each group a short, clear name (2–5 words), a one-sentence summary and the key "".',
    '- Each item is one clip: a whole stretch of one interview, from the line where it starts making sense on its own to the line where the thought ends – several lines when needed, never cut off mid-thought. “lead”: a line just before it that it needs (such as the question being asked), else "". “note”: why it’s here, in a few words. “score”: how well it fits. “tag”: "".',
    '- Order the groups, and the clips in each, the way the editor would want them in a cut: in story order when they ask for a story or a sequence of events, otherwise best first.',
    '- When they ask for a length (“45 seconds”, “two minutes”), keep the total close to it – the start+seconds column gives the timing.',
    '- Never invent anything the transcripts don’t say. In “answer”, “summary” and “note”, never mention line ids or interview numbers – name the people and what they say.'
  ].join('\n');
  /** The first request of a conversation. */
  function task(request, k = 0, n = 1) {
    return `The editor asks: “${String(request).trim()}”\n\n${RULES}${US.storyContext ? US.storyContext.partNote(k, n) : ''}`;
  }
  /** A follow-up in the same conversation (the transcripts are still the first message, read from the cache). */
  function followUp(text) {
    return `The editor follows up: “${String(text).trim()}”\nAnswer again in full with that change – the whole set of groups and clips, not only what changed. Same rules as before.`;
  }

  const normName = s => String(s || '').toLowerCase().replace(/[^\p{L}\p{N} ]+/gu, ' ').replace(/\s+/g, ' ').trim();
  const clamp01 = x => Math.max(0, Math.min(1, isFinite(+x) ? +x : 0));
  const MAX_SPAN = 150;
  /** id -> {t, i} over every transcript */
  function indexOf(transcripts) { const m = new Map(); transcripts.forEach(t => (t.lines || []).forEach((l, i) => m.set(l.id, { t, i }))); return m; }
  /**
   * The answers of every part -> {answer, groups:[{name, summary, items:[{key, from, to, lead, note, score}]}]}.
   * Known ids only; both ends of a clip in the same interview (back to front turned round, at most MAX_SPAN lines); the
   * lead just before the clip in the same interview; the same group from several parts combined; a clip that overlaps
   * one already in its group joins it. The AI's order is kept.
   */
  function organise(results, idx) {
    const answers = [], groups = [], byName = new Map();
    for (const r of results || []) {
      if (!r) continue;
      if (String(r.answer || '').trim()) answers.push(String(r.answer).trim());
      for (const g of r.groups || []) {
        const name = String(g.name || '').trim() || 'Clips', k = normName(name);
        let G = byName.get(k);
        if (!G) { G = { name: name.slice(0, 60), summary: String(g.summary || '').trim().slice(0, 300), items: [] }; byName.set(k, G); groups.push(G); }
        for (const it of g.items || []) {
          let f = idx.get(String(it.from)), e = idx.get(String(it.to || it.from));
          if (!f) continue;
          if (!e || e.t !== f.t) e = f;
          if (e.i < f.i) [f, e] = [e, f];
          const ls = f.t.lines, last = Math.min(e.i, f.i + MAX_SPAN - 1), ld = idx.get(String(it.lead || ''));
          const item = { key: f.t.key, from: ls[f.i].id, to: ls[last].id, i0: f.i, i1: last, lead: ld && ld.t === f.t && ld.i < f.i && f.i - ld.i <= 8 ? ls[ld.i].id : '',
            note: String(it.note || '').replace(/\s+/g, ' ').trim().slice(0, 200), score: Math.round(clamp01(it.score) * 1000) / 1000 };
          const hit = G.items.find(x => x.key === item.key && item.i0 <= x.i1 + 1 && item.i1 >= x.i0 - 1);
          if (hit) { if (item.i0 < hit.i0) { hit.i0 = item.i0; hit.from = item.from; hit.lead = hit.lead || item.lead; } if (item.i1 > hit.i1) { hit.i1 = item.i1; hit.to = item.to; } continue; }
          G.items.push(item);
        }
      }
    }
    const clean = groups.filter(g => g.items.length).map(g => Object.assign(g, { items: g.items.map(({ i0, i1, ...x }) => x) }));
    return { answer: answers.join('\n\n'), groups: clean };
  }
  /** The lines of one clip, in order (with its lead first when wanted). */
  function linesOf(item, idx, { lead = false } = {}) {
    const f = idx.get(item.from), e = idx.get(item.to);
    if (!f) return [];
    if (!e || e.t !== f.t) return [f.t.lines[f.i]];
    const ld = lead && item.lead ? idx.get(item.lead) : null;
    return f.t.lines.slice(ld && ld.t === f.t && ld.i < f.i ? ld.i : f.i, e.i + 1);
  }
  /** Seconds a clip runs (first line's start to last line's end). */
  function lengthOf(item, idx, o) { const ls = linesOf(item, idx, o); return ls.length ? ls[ls.length - 1].end - ls[0].start : 0; }
  /** {clips, seconds} for some groups */
  function totals(groups, idx, o) { let clips = 0, seconds = 0; for (const g of groups) for (const it of g.items) { clips++; seconds += lengthOf(it, idx, o); } return { clips, seconds }; }
  /** “a 45-second opening” -> 45; “two minutes” -> 120; none -> 0 */
  function wantedLength(request) {
    const t = String(request || '').toLowerCase().replace(/\bhalf an? minute\b/g, '30 seconds').replace(/\ba minute\b/g, '1 minute').replace(/\bone\b/g, '1').replace(/\btwo\b/g, '2').replace(/\bthree\b/g, '3').replace(/\bfive\b/g, '5').replace(/\bten\b/g, '10');
    const m = /(\d+(?:\.\d+)?)\s*-?\s*(s|sec|secs|second|seconds|m|min|mins|minute|minutes)\b/.exec(t);
    return m ? Math.round(+m[1] * (/^m/.test(m[2]) ? 60 : 1)) : 0;
  }
  /** A short name for what was asked: for the sequence, the document and the chat. */
  function title(request) { const w = String(request || '').replace(/[“”"]/g, '').trim().split(/\s+/); return (w.slice(0, 7).join(' ') + (w.length > 7 ? '…' : '')).replace(/^./, c => c.toUpperCase()) || 'Ask'; }

  US.storyAsk = { RULES, task, followUp, organise, indexOf, linesOf, lengthOf, totals, wantedLength, title, MAX_SPAN };
})();
