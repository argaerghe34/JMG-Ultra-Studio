/* JMG Ultra Studio – Story › Questions. Pure logic (unit-tested); the screen is in 22-story.js.
   The editor types the questions from the interview sheet; the AI reads the transcripts in order and finds every full
   answer to each – from where the person starts answering to where they move on – labelled by question. Text only.
   Without AI, a basic version finds the lines that share the question's words and the run of speech around them. */
(function () {
  'use strict';
  const US = window.US;
  const T = () => US.transcript;

  /** “1. What brought you here?\nQ2) Tell me about…” -> ['What brought you here?', 'Tell me about…'] (no repeats) */
  function parse(text) {
    let rows = String(text || '').split(/\r?\n/);
    // one line with several questions in it
    if (rows.filter(r => r.trim()).length === 1 && (rows.join(' ').match(/\?/g) || []).length > 1) rows = rows.join(' ').split(/(?<=\?)\s+/);
    const out = [], seen = new Set();
    for (let r of rows) {
      r = r.replace(/^\s*(?:[-–•*·]+|(?:q(?:uestion)?\s*)?\d+\s*[.):–-]|q(?:uestion)?\s*[.):–-])\s*/i, '').replace(/\s+/g, ' ').trim();
      const k = r.toLowerCase();
      if (!r || seen.has(k)) continue;
      seen.add(k); out.push(r);
    }
    return out;
  }
  /** “What brought you to Israel in the first place?” -> “What brought you to Israel in the…” (for clip and marker names) */
  const short = (q, n = 8) => { const w = String(q).split(/\s+/); return w.slice(0, n).join(' ') + (w.length > n ? '…' : ''); };

  /* ---------- the requests ---------- */
  const BATCH = { lines: 1500, chars: 200000 }, OVERLAP = 25, MAX_SPAN = 150;
  /**
   * The transcripts in parts that each fit one request – whole interviews where they fit, so an answer is never cut
   * between two requests; a very long interview is split with an overlap, so an answer at the join is whole in one of them.
   * transcripts: [{key, lines}] -> [[{key, n (interview number, from 1), lines}]]
   */
  function parts(transcripts, { lines: maxL = BATCH.lines, chars: maxC = BATCH.chars } = {}) {
    const size = l => T().aiRow(l).length + 1, pieces = [];
    transcripts.forEach((t, i) => {
      const ls = t.lines || [];
      if (!ls.length) return;
      const total = ls.reduce((n, l) => n + size(l), 0);
      if (ls.length <= maxL && total <= maxC) { pieces.push({ key: t.key, n: i + 1, lines: ls, chars: total }); return; }
      const k = Math.max(Math.ceil(ls.length / maxL), Math.ceil(total / maxC)), per = Math.ceil(ls.length / k);
      for (let s = 0; s < ls.length; s += per) { const sl = ls.slice(Math.max(0, s - OVERLAP), s + per); pieces.push({ key: t.key, n: i + 1, lines: sl, chars: sl.reduce((n, l) => n + size(l), 0) }); }
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
  const SCHEMA = {
    type: 'object', additionalProperties: false, required: ['answers'],
    properties: { answers: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['question', 'from', 'to', 'asked', 'summary', 'score'],
      properties: { question: { type: 'number' }, from: { type: 'string' }, to: { type: 'string' }, asked: { type: 'string' }, summary: { type: 'string' }, score: { type: 'number' } } } } }
  };
  const SYSTEM = 'You help a documentary editor find the answers to their interview questions. Read the interview transcripts and find every answer to each question: wherever an interviewee answers it, including when they come back to it later or answer it without being asked. ' +
    'Give the full answer: from the line where they start answering to the last line before they move on to something else, including every line in between – an answer is usually several lines, so do not stop at the first sentence. ' +
    'If the interviewer is heard asking the question just before, give that line as “asked”, otherwise "". An answer stays within one interview. A stretch that answers two questions can be listed under both. ' +
    'Leave out passing mentions that do not really answer the question. For each answer give the question number, the first and last line ids, a summary of what they say in a few words, and a score from 0 to 1 for how well and how fully it answers. Only use ids from the list. Use British English.';
  /** Every request: one per part. -> [{part, req}] */
  function requests(questions, transcripts, { feature = 'Interview questions' } = {}) {
    const ps = parts(transcripts);
    const task = (k, n) => `Questions:\n${questions.map((q, i) => `${i + 1}. ${q}`).join('\n')}\n\nFind every answer to each of these questions in the transcripts above.${n > 1 ? `\nThese are part ${k + 1} of ${n} of the interviews.` : ''}`;
    return ps.map((part, k) => ({ part, req: {
      system: SYSTEM,
      user: T().aiUser('Interview transcripts, in order (id<TAB>speaker<TAB>text):\n' + part.map(p => `=== Interview ${p.n} ===\n` + p.lines.map(T().aiRow).join('\n')).join('\n'), task(k, ps.length)),
      schema: SCHEMA, maxTokens: 16000, effort: 'medium', feature
    } }));
  }

  /* ---------- reading the answers ---------- */
  /** id -> {t (the transcript), n, i (place in it)} */
  function indexOf(transcripts) { const m = new Map(); transcripts.forEach((t, n) => (t.lines || []).forEach((l, i) => m.set(l.id, { t, n: n + 1, i }))); return m; }
  const clamp01 = x => Math.max(0, Math.min(1, isFinite(+x) ? +x : 0));
  /**
   * The AI's answers for one part -> [{q, key, from, to, asked, summary, score}] with known ids only: both ends in the
   * same interview (back to front is turned round), at most MAX_SPAN lines, the question asked shortly before the answer.
   * known: the ids that were sent (others are ignored).
   */
  function collect(answers, idx, nq, known = null) {
    const out = [];
    for (const a of answers || []) {
      const q = Math.round(+a.question) - 1;
      if (!(q >= 0 && q < nq)) continue;
      const ok = id => idx.has(String(id)) && (!known || known.has(String(id)));
      if (!ok(a.from)) continue;
      let f = idx.get(String(a.from)), e = ok(a.to) ? idx.get(String(a.to)) : f;
      if (e.t !== f.t) e = f;
      if (e.i < f.i) [f, e] = [e, f];
      const last = Math.min(e.i, f.i + MAX_SPAN - 1), ls = f.t.lines;
      const k = ok(a.asked) ? idx.get(String(a.asked)) : null;
      out.push({ q, key: f.t.key, from: ls[f.i].id, to: ls[last].id, asked: k && k.t === f.t && k.i < f.i && f.i - k.i <= 8 ? ls[k.i].id : '',
        summary: String(a.summary || '').replace(/\s+/g, ' ').trim().slice(0, 160), score: Math.round(clamp01(a.score) * 1000) / 1000 });
    }
    return out;
  }
  /**
   * Group by question; answers to the same question that overlap or touch in one interview become one; best first.
   * -> [{q, question, answers:[{key, from, to, asked, summary, score, by}]}] (one entry per question, in order)
   */
  function organise(questions, list, idx, by = 'ai') {
    return questions.map((question, q) => {
      const mine = list.filter(a => a.q === q).map(a => Object.assign({}, a, { i0: idx.get(a.from).i, i1: idx.get(a.to).i }))
        .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : a.i0 - b.i0));
      const merged = [];
      for (const a of mine) {
        const p = merged[merged.length - 1];
        if (p && p.key === a.key && a.i0 <= p.i1 + 1) {
          if (a.i1 > p.i1) { p.i1 = a.i1; p.to = a.to; }
          if (a.score > p.score) { p.summary = a.summary || p.summary; p.score = a.score; }
          if (!p.asked) p.asked = a.asked;
        } else merged.push(Object.assign({}, a));
      }
      const order = a => idx.get(a.from).n * 1e6 + a.i0;
      const answers = merged.sort((a, b) => b.score - a.score || order(a) - order(b))
        .map(a => ({ key: a.key, from: a.from, to: a.to, asked: a.asked || '', summary: a.summary, score: a.score, by }));
      return { q, question, answers };
    });
  }
  /** The lines of one answer, in order (with the question being asked first, when wanted and known). */
  function linesOf(a, idx, { asked = false } = {}) {
    const f = idx.get(a.from), e = idx.get(a.to);
    if (!f || !e || f.t !== e.t) return f ? [f.t.lines[f.i]] : [];
    const k = asked && a.asked ? idx.get(a.asked) : null;
    return f.t.lines.slice(k && k.t === f.t && k.i < f.i ? k.i : f.i, e.i + 1);
  }

  /* ---------- without AI ---------- */
  /**
   * Basic answers: the lines that share the question's words, each with the run of the same voice around it (if the line
   * is the interviewer asking, the answer after it instead). Rough – the AI does this properly.
   */
  function basic(questions, transcripts, { perQuestion = 8 } = {}) {
    const idx = indexOf(transcripts), all = transcripts.flatMap(t => t.lines || []), list = [];
    const asks = l => /\?["”')]?\s*$/.test(l.text) || T().isInterviewerLabel(l.speaker);
    questions.forEach((question, q) => {
      const r = T().search(question, all, { limit: 60 });
      if (!r.length) return;
      const top = r[0].score;
      for (const x of r.filter(x => x.score >= top * 0.35).slice(0, perQuestion)) {
        const at = idx.get(x.line.id), ls = at.t.lines;
        let i = at.i, asked = '';
        if (asks(ls[i]) && ls[i + 1] && ls[i + 1].speaker !== ls[i].speaker) { asked = ls[i].id; i++; }
        const who = ls[i].speaker, same = j => ls[j] && ls[j].speaker === who;
        let a = i, b = i;
        while (a > 0 && !asked && same(a - 1) && ls[a].start - ls[a - 1].end < 2 && i - a < 12) a--;
        while (same(b + 1) && ls[b + 1].start - ls[b].end < 2 && b - i < 12) b++;
        list.push({ q, key: at.t.key, from: ls[a].id, to: ls[b].id, asked, summary: '', score: Math.round(x.score / top * 1000) / 1000 });
      }
    });
    return organise(questions, list, idx, 'basic');
  }

  /* ---------- with AI ---------- */
  /**
   * Find every answer to each question with the AI (in parts if the interviews are long; a part that fails twice is
   * reported in .missing). transcripts: [{key, lines}] in project order. Only the text of the lines is sent.
   * -> [{q, question, answers}] with .missing
   */
  async function findAI(questions, transcripts, { job, nameOf = () => '' } = {}) {
    if (!US.ai || !US.ai.available()) throw new US.UserError('AI_KEY');
    const SAI = US.storyAI, batches = requests(questions, transcripts), idx = indexOf(transcripts), list = [], missing = [];
    if (batches.length > 1 && US.ai.approveTotal) await US.ai.approveTotal(SAI.cost(batches.map(b => b.req)).usd, `Interview questions (${batches.length} requests)`);
    for (let k = 0; k < batches.length; k++) {
      job && job.check && job.check();
      const b = batches[k], lines = b.part.flatMap(p => p.lines);
      job && job.set && job.set({ who: 'ai', msg: batches.length > 1 ? `${US.ai.label()} is reading part ${k + 1} of ${batches.length} (${US.plural(lines.length, 'line')})` : `${US.ai.label()} is reading ${US.plural(lines.length, 'line')} for the answers` });
      job && job.progress && job.progress(0.05 + 0.9 * k / batches.length);
      const info = {}, r = await SAI.ask(b.req, info);
      if (!r) { missing.push({ part: k + 1, of: batches.length, lines: lines.length, name: b.part.map(p => nameOf(p) || `Interview ${p.n}`).join(', '), error: info.error }); continue; }
      list.push(...collect(r.answers, idx, questions.length, new Set(lines.map(l => l.id))));
    }
    if (batches.length && missing.length === batches.length) throw missing[0].error || new US.UserError('AI_FAILED');
    const out = organise(questions, list, idx, 'ai');
    out.missing = missing;
    return out;
  }

  US.storyQuestions = { parse, short, parts, requests, indexOf, collect, organise, linesOf, basic, findAI, SCHEMA, SYSTEM, BATCH, MAX_SPAN };
})();
