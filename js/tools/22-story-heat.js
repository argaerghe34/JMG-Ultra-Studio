/* JMG Ultra Studio – Story › Beat map: every passage of the interviews scored on what the editor is looking for –
   emotion, humour, information, conflict, surprise – and shown as a heat strip per interview, so the strongest parts
   stand out at a glance. Beats picked from it go on a simple story board, in the order you want, and build as a
   sequence. The AI reads passages as text; without AI, word cues score them. Pure logic (unit-tested); the card is in
   22-story.js. */
(function () {
  'use strict';
  const US = window.US;

  const CRITERIA = {
    emotion: { label: 'Emotion', hint: 'feeling, vulnerability, moving moments', colour: '#e2483f' },
    humour: { label: 'Humour', hint: 'funny, playful, laughter', colour: '#f08a24' },
    information: { label: 'Information', hint: 'facts, explanations, clear points', colour: '#3d7ff0' },
    conflict: { label: 'Conflict', hint: 'tension, disagreement, struggle', colour: '#a35bd6' },
    surprise: { label: 'Surprise', hint: 'unexpected, revealing, quotable', colour: '#3fbf4a' }
  };
  /**
   * Passages: consecutive lines by the same speaker, up to maxLen seconds, never across interviews.
   * -> [{id: P1…, key (interview), lineIds, start, end, speaker, text}]
   */
  function passages(transcripts, { maxLen = 40, keep = () => true } = {}) {
    const out = []; let n = 0;
    for (const t of transcripts) {
      let cur = null;
      for (const l of t.lines) {
        if (!keep(l)) { cur = null; continue; }
        if (cur && cur.speaker === l.speaker && l.end - cur.start <= maxLen && l.start - cur.end < 3) { cur.lineIds.push(l.id); cur.end = l.end; cur.text += ' ' + l.text; continue; }
        cur = { id: 'P' + (++n), key: t.key, lineIds: [l.id], start: l.start, end: l.end, speaker: l.speaker, text: l.text };
        out.push(cur);
      }
    }
    return out;
  }
  const SCHEMA = (crit) => ({
    type: 'object', additionalProperties: false, required: ['passages'],
    properties: { passages: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['id', 'scores', 'note'], properties: {
      id: { type: 'string' }, note: { type: 'string' },
      scores: { type: 'object', additionalProperties: false, required: crit, properties: Object.fromEntries(crit.map(c => [c, { type: 'number' }])) } } } } }
  });
  /** Requests of up to `per` passages each (the scores are short, so many fit). */
  function requests(ps, crit, { per = 250, brief = '' } = {}) {
    const sys = `You score passages of interview transcripts for a documentary editor. For each passage give 0–10 for: ${crit.map(c => `${c} (${CRITERIA[c].hint})`).join('; ')}. Most passages score low – keep high scores for the few that really stand out. "note": a few words on what makes it stand out (or "" if nothing). Score every id given.`;
    const out = [];
    for (let i = 0; i < ps.length; i += per) {
      const part = ps.slice(i, i + per);
      out.push({ system: [{ text: sys, cache: true }], user: [`${brief ? `What the film is about: ${brief}\n\n` : ''}PASSAGES:\n` + part.map(p => `${p.id}\t${p.speakerName || p.speaker || 'Speaker'}\t${String(p.text).replace(/\s+/g, ' ').slice(0, 900)}`).join('\n')], schema: SCHEMA(crit), maxTokens: 12000, effort: 'low', feature: 'Beat map', ids: part.map(p => p.id) });
    }
    return out;
  }
  /** Scores from the AI's answers, by passage id (0–1 each). Missing ones stay unscored. */
  function collect(results, crit) {
    const out = new Map();
    for (const r of results) for (const p of (r && r.passages) || []) {
      const s = {}; for (const c of crit) s[c] = Math.max(0, Math.min(1, (+((p.scores || {})[c]) || 0) / 10));
      out.set(String(p.id), { scores: s, note: String(p.note || '').slice(0, 120) });
    }
    return out;
  }
  // without AI: word cues
  const CUES = {
    emotion: /\b(cried|cry|tears|love|loved|miss|missed|died|death|lost|afraid|scared|proud|heart|hurt|pain|grateful|thank|hope|alone|family|mother|father|mum|dad)\b/gi,
    humour: /\b(laugh|laughed|laughing|funny|joke|joking|hilarious|ridiculous|silly|crazy)\b|\(laughs?\)|haha/gi,
    information: /\b\d[\d,.]*\b|\b(because|percent|million|thousand|first|second|year|years|since|started|founded|means|which)\b/gi,
    conflict: /\b(but|however|fight|fought|argue|argued|disagree|wrong|never|against|problem|struggle|struggled|angry|hard)\b/gi,
    surprise: /\b(suddenly|actually|never|imagine|believe|shocked|surprised|unexpected|realised|realized|secret|turns out)\b/gi
  };
  function basic(ps, crit) {
    const out = new Map();
    for (const p of ps) {
      const words = Math.max(8, String(p.text).split(/\s+/).length), s = {};
      for (const c of crit) s[c] = Math.min(1, ((String(p.text).match(CUES[c]) || []).length / words) * 12);
      out.set(p.id, { scores: s, note: '' });
    }
    return out;
  }
  /** One number per passage for the map: one criterion, or the strongest of the chosen ones. */
  const heat = (sc, view, crit) => (!sc ? 0 : view && view !== 'any' ? sc.scores[view] || 0 : Math.max(0, ...crit.map(c => sc.scores[c] || 0)));
  /** The hottest passages for a view, best first. */
  function top(ps, scores, view, crit, n = 10) { return ps.map(p => ({ p, h: heat(scores.get(p.id), view, crit) })).filter(x => x.h > 0).sort((a, b) => b.h - a.h).slice(0, n).map(x => x.p); }

  US.storyHeat = { CRITERIA, passages, requests, collect, basic, heat, top, CUES };
})();
