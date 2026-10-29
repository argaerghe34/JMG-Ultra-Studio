/* JMG Ultra Studio – Story › the shared transcript ("read once"). Pure logic (unit-tested); used by Themes, Find more,
   your own themes, the narrative shortlist, Moments, Questions and Ask.
   Every request about the interviews starts the same way – one fixed instruction, the transcripts of what you're working
   on in one fixed layout, and one answer format – so Claude keeps that opening for an hour and every later request reads
   it at a twentieth of the price (measured 29 Oct 2026: a different answer format breaks the sharing, a different effort
   doesn't). What each feature wants comes after it. Only text is sent. */
(function () {
  'use strict';
  const US = window.US;
  const T = () => US.transcript;

  const SYSTEM = 'You help a documentary editor work with their interview transcripts. The transcripts come first – one block per interview, one row per line: id, speaker, start (m:ss) and length in seconds, then what was said. The task comes after them. ' +
    'Answer in the JSON shape given: “answer” is a short written reply when the task asks for one, otherwise "". “groups” hold the lines – each group has a key, a name, a summary and items. Each item is a stretch of one interview from line “from” to line “to” (the same id for a single line), with “lead” (a line just before it that belongs with it, such as the question being asked, or ""), a short note, a score from 0 to 1, and a tag (or ""). ' +
    'Only use line ids from the transcripts. Use British English.';
  /** One answer format for every feature (a different one would start a new cache). Keep it byte-for-byte the same. */
  const SCHEMA = {
    type: 'object', additionalProperties: false, required: ['answer', 'groups'],
    properties: {
      answer: { type: 'string' },
      groups: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['key', 'name', 'summary', 'items'], properties: {
        key: { type: 'string' }, name: { type: 'string' }, summary: { type: 'string' },
        items: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['from', 'to', 'lead', 'note', 'score', 'tag'], properties: {
          from: { type: 'string' }, to: { type: 'string' }, lead: { type: 'string' }, note: { type: 'string' }, score: { type: 'number' }, tag: { type: 'string' } } } } } } }
    }
  };

  /** Is the shared transcript in use? Claude only (Gemini's free tier can't take whole projects at once); Settings can turn it off. */
  const on = () => !!(US.ai && US.ai.provider && US.ai.provider() === 'claude' && US.settings.get('ai.shareTranscripts', true) !== false);

  const mmss = s => { s = Math.max(0, Math.floor(s)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
  /** One row: id, speaker, start+seconds, text (the whole line). */
  function row(l) { return `${l.id}\t${l.speaker || '-'}\t${mmss(l.start)}+${Math.max(1, Math.round(l.end - l.start))}\t${String(l.text).replace(/\s+/g, ' ').trim()}`; }

  // one request holds up to ~450,000 tokens of transcript (Claude reads up to a million); bigger projects are read in parts
  const LIMIT = { chars: 1600000, lines: 60000 }, OVERLAP = 25;
  /**
   * The transcripts in parts that each fit one request – whole interviews where they fit; a very long interview is split
   * with an overlap. Deterministic, so the same material always makes the same parts (and the same cache).
   * transcripts: [{key, name, n (interview number), lines}] -> [[{key, name, n, lines}]]
   */
  function parts(transcripts, { chars: maxC = LIMIT.chars, lines: maxL = LIMIT.lines } = {}) {
    const size = l => row(l).length + 1, pieces = [];
    transcripts.forEach((t, i) => {
      const ls = t.lines || [], n = t.n || i + 1;
      if (!ls.length) return;
      const total = ls.reduce((k, l) => k + size(l), 0);
      if (ls.length <= maxL && total <= maxC) { pieces.push({ key: t.key, name: t.name || '', n, lines: ls, chars: total }); return; }
      const k = Math.max(Math.ceil(ls.length / maxL), Math.ceil(total / maxC)), per = Math.ceil(ls.length / k);
      for (let s = 0; s < ls.length; s += per) { const sl = ls.slice(Math.max(0, s - OVERLAP), s + per); pieces.push({ key: t.key, name: t.name || '', n, lines: sl, chars: sl.reduce((m, l) => m + size(l), 0) }); }
    });
    const out = [];
    let cur = [], c = 0, n = 0;
    for (const p of pieces) {
      if (cur.length && (c + p.chars > maxC || n + p.lines.length > maxL)) { out.push(cur); cur = []; c = 0; n = 0; }
      cur.push(p); c += p.chars; n += p.lines.length;
    }
    if (cur.length) out.push(cur);
    return out;
  }
  /** The transcript text of one part, always laid out the same way. */
  function listing(part) {
    // “Interview 3” only – clip and file names aren't sent
    return 'Interview transcripts (id<TAB>speaker<TAB>start+seconds<TAB>text):\n' + part.map(p => `=== Interview ${p.n} ===\n` + p.lines.map(row).join('\n')).join('\n');
  }
  /**
   * The requests for a task over these transcripts: one per part. task(k, n) -> the instruction after the transcripts.
   * -> [{part, lines, req}] – req goes to US.ai.json as it is.
   */
  function requests(transcripts, { task, maxTokens = 16000, effort = 'low', feature = '' }) {
    const ps = parts(transcripts);
    return ps.map((part, k) => ({ part, lines: part.flatMap(p => p.lines), req: {
      system: SYSTEM, user: [{ text: listing(part), cache: '1h' }, task(k, ps.length)], schema: SCHEMA, maxTokens, effort, feature
    } }));
  }
  const partNote = (k, n) => (n > 1 ? `\nThe interviews are long, so they come in parts: this is part ${k + 1} of ${n}.` : '');

  /* ---------- reading answers ---------- */
  const clamp01 = x => Math.max(0, Math.min(1, isFinite(+x) ? +x : 0));
  /** Every item of an answer, flat: [{group (key/name/summary), from, to, lead, note, score, tag}] (known ids only, when known is given). */
  function items(r, known = null) {
    const out = [];
    for (const g of (r && r.groups) || []) for (const it of g.items || []) {
      const from = String(it.from || ''), to = String(it.to || it.from || '');
      if (!from || (known && !known.has(from))) continue;
      out.push({ group: { key: String(g.key || ''), name: String(g.name || ''), summary: String(g.summary || '') }, from, to: known && !known.has(to) ? from : to, lead: known && it.lead && !known.has(String(it.lead)) ? '' : String(it.lead || ''),
        note: String(it.note || '').replace(/\s+/g, ' ').trim().slice(0, 200), score: clamp01(it.score), tag: String(it.tag || '') });
    }
    return out;
  }
  /** As single-line picks (Find more, your own theme, the narrative shortlist): {picks:[{lineId, reason, score}]} */
  function asPicks(r, known) { return { picks: items(r, known).map(x => ({ lineId: x.from, reason: x.note, score: x.score })) }; }

  US.storyContext = { SYSTEM, SCHEMA, on, row, LIMIT, parts, listing, requests, partNote, items, asPicks };
})();
