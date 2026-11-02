/* JMG Ultra Studio – Story › Narrative › Like a reference cut: the shape of a video you like – a past edit in the
   project, or the transcript of any video (.srt, .vtt, .txt) – read as its beats: what each part does and how long it
   runs. The narrative then follows that shape with your own interviews. Only the reference's words go to the AI (its
   transcript text, never its picture or sound); without AI its rhythm is read from pauses and who's speaking. Pure
   logic (unit-tested); the card and the narrative are in 22-story.js. */
(function () {
  'use strict';
  const US = window.US;

  /** The reference's lines in its own time, starting at 0: [{start, end, speaker, text}] */
  function normalise(lines) {
    const ls = (lines || []).filter(l => l && String(l.text || '').trim() && l.end > l.start).slice().sort((a, b) => a.start - b.start);
    const t0 = ls.length ? ls[0].start : 0;
    return ls.map(l => ({ start: l.start - t0, end: l.end - t0, speaker: String(l.speaker || ''), text: String(l.text).replace(/\s+/g, ' ').trim() }));
  }
  const SCHEMA = {
    type: 'object', additionalProperties: false, required: ['summary', 'beats'],
    properties: { summary: { type: 'string' }, beats: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['role', 'purpose', 'from', 'to'], properties: { role: { type: 'string' }, purpose: { type: 'string' }, from: { type: 'number' }, to: { type: 'number' } } } } }
  };
  /** Ask the AI for the reference's structure (its transcript as text, with times). */
  function request(lines, { name = '' } = {}) {
    const sys = 'You are a documentary and promo editor. You read the transcript of a finished video and describe its structure, so another video can be cut the same way with different interviews. Give 4–12 beats in order, covering the whole video: "role" – a short name (Hook, Set-up, Problem, Turning point, Proof, Emotional peak, Call to action, Ending…); "purpose" – what the beat does for the viewer, in general terms that would fit another subject (not this video\'s facts); "from"/"to" – its start and end in seconds. "summary": one sentence on the overall shape and pace.';
    const body = lines.map(l => `${l.start.toFixed(1)}–${l.end.toFixed(1)}\t${l.speaker || '-'}\t${l.text.slice(0, 300)}`).join('\n');
    return { system: [{ text: sys, cache: true }], user: [`REFERENCE${name ? ` “${name}”` : ''} (${Math.round(duration(lines))} s):\n${body.slice(0, 60000)}`], schema: SCHEMA, maxTokens: 3000, effort: 'low', feature: 'Reference cut' };
  }
  const duration = lines => (lines.length ? lines[lines.length - 1].end : 0);
  /** The AI's beats tidied: in order, inside the video, at least 2 s each; the last one runs to the end. */
  function organise(r, lines) {
    const end = duration(lines), out = [];
    for (const b of ((r && r.beats) || []).slice().sort((a, b) => (+a.from || 0) - (+b.from || 0))) {
      const from = Math.max(out.length ? out[out.length - 1].to : 0, Math.min(end, +b.from || 0)), to = Math.min(end, Math.max(from, +b.to || 0));
      if (to - from < 2) continue;
      out.push({ role: String(b.role || 'Beat').slice(0, 40), purpose: String(b.purpose || '').slice(0, 200), from, to });
    }
    if (out.length) { out[0].from = 0; out[out.length - 1].to = end; }
    return { seconds: end, summary: String((r && r.summary) || '').slice(0, 240), beats: out, by: 'ai' };
  }
  /**
   * Without AI: the rhythm only – parts split where the voice changes or pauses, about every 10–30 s; the first part
   * is the opening, the last the ending. Enough to match the length and the pace.
   */
  function basic(lines) {
    const end = duration(lines), parts = [];
    let cur = null;
    for (const l of lines) {
      const brk = cur && ((l.speaker !== cur.speaker && cur.to - cur.from >= 8) || l.start - cur.to >= 1.2 || cur.to - cur.from >= 30);
      if (!cur || brk) { cur = { from: l.start, to: l.end, speaker: l.speaker, n: 1, first: l.text }; parts.push(cur); } else { cur.to = l.end; cur.n++; }
    }
    // very short parts join the one before
    const merged = [];
    for (const p of parts) { const last = merged[merged.length - 1]; if (last && p.to - p.from < 6) { last.to = p.to; continue; } merged.push(p); }
    const beats = merged.map((p, i) => ({ role: i === 0 ? 'Opening' : i === merged.length - 1 ? 'Ending' : `Part ${i + 1}`, purpose: i === 0 ? 'Opens the video' : i === merged.length - 1 ? 'Ends it' : (new Set(lines.filter(l => l.start >= p.from && l.end <= p.to).map(l => l.speaker)).size > 1 ? 'Voices in turn' : 'One voice'), from: p.from, to: p.to }));
    if (beats.length) { beats[0].from = 0; beats[beats.length - 1].to = end; }
    return { seconds: end, summary: `${beats.length} parts over ${US.fmtDur(end)}`, beats, by: 'basic' };
  }
  /**
   * What the narrative is told: the reference's beats scaled to the length asked for (a 4-minute reference shapes a
   * 60-second cut in the same proportions).
   */
  function note(ref, seconds = ref.seconds) {
    const k = ref.seconds > 0 ? seconds / ref.seconds : 1;
    return `Cut it with the same structure as a reference video the editor likes${ref.name ? ` (“${ref.name}”)` : ''}${ref.summary ? ` – ${ref.summary}` : ''}. Its beats, scaled to this length – follow their order, purpose and proportions with lines from these interviews:\n` +
      ref.beats.map((b, i) => `${i + 1}. ${b.role} – about ${Math.max(2, Math.round((b.to - b.from) * k))} s${b.purpose ? `: ${b.purpose}` : ''}`).join('\n');
  }

  US.storyReference = { normalise, request, organise, basic, note, SCHEMA, duration };
})();
