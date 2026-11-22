/* JMG Ultra Studio – Story › 3 Find › Best lines: the most impactful, quotable lines, for a simple highlight video
   (an event, a conference, a celebration) when themes would be too much.

   - Without AI: each line is scored on its own – a complete, clear soundbite of a good length (Story's soundbite
     strength), how much feeling it carries (Moments' “heart”), and, when Listen to delivery has heard it, how well it
     is said. Interviewer lines and questions are left out.
   - With AI: the best candidates (as many as one request holds) are read as text and the AI picks the lines that
     would stand on their own in a highlight video, best first, with a few words why.
   - How it is judged is always said: the words (the transcripts) – and, only when Listen to delivery is switched on
     for the project and has heard the lines, how each one is said (tone, energy, clean starts and ends). That can be
     switched off here for one run (“Use how lines are said”), and then nothing about delivery is used or sent.
   - What it found is kept with the project (state.best) until it is found again.

   Pure pieces first (unit-tested: US.storyBest._pure), then the work and the “what it judges” box (the view is in
   22-story.js). */
(function () {
  'use strict';
  const US = window.US, h = US.h, ui = US.ui;
  const T = () => US.transcript, D = () => US.delivery, S = () => US.story, SAI = () => US.storyAI, MO = () => US.storyMoments;
  const r3 = x => Math.round(x * 1000) / 1000;

  /* =================== pure pieces =================== */
  /** How well a line's length suits a highlight: best between 4 and 20 seconds. */
  function lengthFit(d, maxLen = 30) {
    if (d < 2) return 0; if (d < 4) return 0.5; if (d <= 20) return 1; if (d <= maxLen) return 0.7; return 0.2;
  }
  /**
   * A line's score for a highlight, from its text and (when given) how it is said. q: Story's quality ({score, reasons});
   * heart: 0..1; dlv: a delivery entry ({score 1–5, energy, in, out, notes}) or null. -> {score 0..1, reasons, delivery}
   */
  function lineScore(line, { q, heart = 0, dlv = null, maxLen = 30 } = {}) {
    const d = line.end - line.start, reasons = [];
    let s = 0.5 * (q ? q.score : 0.5) + 0.3 * Math.min(1, heart * 1.4) + 0.12 * lengthFit(d, maxLen);
    if (heart >= 0.3) reasons.push('heartfelt');
    if (q && q.score >= 0.75) reasons.push('clear soundbite');
    let delivery = null;
    if (dlv && dlv.score) {
      delivery = { score: dlv.score, energy: dlv.energy || '', notes: (dlv.notes || []).slice(0, 2) };
      s += (dlv.score - 3) * 0.07;
      if (dlv.in !== false && dlv.out !== false) s += 0.02;
      if (dlv.score >= 4) reasons.push(`said well (${dlv.score}/5${dlv.notes && dlv.notes[0] ? ', ' + dlv.notes[0] : ''})`);
      if (dlv.score <= 2) reasons.push(`weak delivery (${dlv.score}/5)`);
    }
    return { score: r3(Math.max(0, Math.min(1, s))), reasons, delivery };
  }
  /**
   * The basic pick: every usable line scored, best first. isOut(line) -> true for interviewer lines and questions.
   * opts.deliveryOf(line) -> entry or null. -> [{line, score, reasons, delivery}]
   */
  function basic(lines, { quality, heart, deliveryOf = () => null, isOut = () => false, minLen = 2, maxLen = 30 } = {}) {
    const out = [];
    for (const l of lines) {
      const d = l.end - l.start;
      if (d < minLen || d > maxLen || isOut(l)) continue;
      if (!/[\p{L}]/u.test(String(l.text || ''))) continue;
      const r = lineScore(l, { q: quality(l), heart: heart(l.text), dlv: deliveryOf(l), maxLen });
      out.push(Object.assign({ line: l }, r));
    }
    return out.sort((a, b) => b.score - a.score || a.line.start - b.line.start);
  }
  /** At most `per` lines from one interview in a row of `count`, so a highlight isn't one person (0 = no limit). */
  function spread(ranked, { count = 20, per = 0, groupOf = () => '' } = {}) {
    if (!per) return ranked.slice(0, count);
    const n = new Map(), out = [];
    for (const r of ranked) { const g = groupOf(r.line.id); if ((n.get(g) || 0) >= per) continue; n.set(g, (n.get(g) || 0) + 1); out.push(r); if (out.length >= count) break; }
    return out;
  }
  const SYSTEM = 'You help an editor make a short highlight video of an event from what people said on camera – not a documentary with themes, just the best moments. From these lines, pick the ones with the most impact: lines that stand on their own without the question, are clear and quotable, carry feeling, humour, a strong opinion or a vivid picture, and would make a viewer stop scrolling. Leave out lines that need context, trail off, are mostly “um”, or are the interviewer. Give each a score from 0 to 1 and a few words why. Only use ids from the list.';
  const DELIVERY_HINT = ' Some lines end with a note on how they are SAID (from listening to the recording): prefer lines that are said well – sure, warm, lively, cleanly started and ended – over the same words said flatly or stumbling.';
  /** The rows the AI reads: id<TAB>speaker<TAB>text, and the delivery note only when withDelivery. */
  function row(l, withDelivery) {
    const base = `${l.id}\t${l.speaker || '-'}\t${String(l.text).replace(/\s+/g, ' ').slice(0, 400)}`;
    if (!withDelivery) { const E = US.storyEnglish; let en = ''; if (E && E.note) { try { en = E.note(l); } catch (e) { en = ''; } } return base + en; }
    return base + T().deliveryNote(l);
  }
  /** The requests: the candidates (best first) in batches, each listed in project order. */
  function requests(cands, { all, count = 20, withDelivery = true, brief = '' } = {}) {
    const batches = SAI().split(cands, l => row(l, withDelivery));
    return batches.map((b, k) => {
      const listing = 'Interview lines (id<TAB>speaker<TAB>text):\n' + T().inOrder(b, all).map(l => row(l, withDelivery)).join('\n');
      const task = `Pick up to ${Math.min(60, count * 2)} of the lines above for the highlight video, best first.${brief ? ` The video: ${brief}.` : ''}${batches.length > 1 ? ` (This is part ${k + 1} of ${batches.length} of the lines; pick the best of this part.)` : ''}${withDelivery && /\[(delivery \d\/5|says |may say )/.test(listing) ? DELIVERY_HINT : ''}`;
      return { lines: b, req: { system: SYSTEM, user: [{ text: listing, cache: true }, task], schema: SAI().PICK_SCHEMA, maxTokens: 8000, effort: 'low', feature: 'Best lines' } };
    });
  }

  /* =================== what it judges =================== */
  /**
   * What Best lines would use right now: {words: true, delivery: {on, where, label, heard, of, why}, use (the switch here)}.
   * heard: lines in `lines` that have been listened to (with a delivery score).
   */
  function uses(lines) {
    const out = { words: true, delivery: { on: false, where: '', label: '', heard: 0, of: lines.length, why: 'off' }, use: useDelivery() };
    const d = D();
    if (!d) { out.delivery.why = 'none'; return out; }
    const s = d.settings(), P = d.plan();
    out.delivery.on = s.on; out.delivery.where = s.where; out.delivery.label = P.label || (s.where === 'cloud' ? 'Gemini' : '');
    if (!s.on) return out;
    out.delivery.heard = lines.filter(l => { const e = d.forLine(l); return e && e.score; }).length;
    out.delivery.why = out.delivery.heard ? '' : 'none-heard';
    return out;
  }
  const useDelivery = () => US.settings.get('story.bestDelivery', true) !== false;
  /** The box that says, before anything runs, what is judged: the words – and how each line is said, or not. */
  function usesBox(lines, { render }) {
    const u = uses(lines), d = u.delivery, on = d.on && d.heard > 0 && u.use;
    const tick = ok => h('span.best-tick' + (ok ? '.on' : ''), ok ? '✓' : '–');
    const where = d.where === 'cloud' ? `${d.label || 'Gemini'} in the cloud` : `${d.label || 'a listening model'} on this computer`;
    const how = !d.on ? 'Off for this project – only the words are judged. Switch on Listen to delivery in Story › 1 Interviews to also judge the tone, energy and delivery of each line.'
      : !d.heard ? 'Listen to delivery is on, but none of these lines has been listened to yet – so only the words are judged. Press Listen now in Story › 1 Interviews.'
        : !u.use ? `Switched off for Best lines: only the words are judged (${US.plural(d.heard, 'line')} have been listened to by ${where}).`
          : `Yes – ${where} has listened to ${d.heard} of ${US.plural(d.of, 'line')}: their delivery scores and notes count${d.heard < d.of ? `. The other ${d.of - d.heard} are judged by their words only` : ''}.`;
    return h('div.best-uses', { dataset: { listening: on ? 'yes' : 'no' } },
      h('div.best-uses-title', 'What Best lines judges'),
      h('div.best-use', tick(true), h('span', h('b', 'The words'), ' – the transcripts: how clear, complete and quotable each line is, and how much feeling it carries.')),
      h('div.best-use', tick(on), h('span', h('b', 'How each line is said'), ' – listening to the recording: ', how)),
      d.on && d.heard ? ui.toggle({ label: 'Use how lines are said', hint: 'Off: Best lines judges the words alone, and nothing about delivery is sent with the AI request.', value: u.use, onChange: x => { US.settings.set('story.bestDelivery', x); render(); } })
        : h('div.row', ui.button(d.on ? 'Listen to delivery' : 'Switch on Listen to delivery', { small: true, kind: 'ghost', title: 'Story › 1 Interviews › Listen to delivery', onClick: () => { try { S().open('transcripts'); setTimeout(() => { const c = document.querySelector('[data-card="delivery"]'); if (c && c.scrollIntoView) c.scrollIntoView({ block: 'start' }); }, 80); } catch (e) { /* the tab */ } } })));
  }

  /* =================== the work =================== */
  /**
   * Find the best lines in the lines Story is working on. -> {list:[{lineId, score, reasons, delivery}], by, label,
   * usedDelivery (lines whose delivery counted), withDelivery, count, maxLen, missing, summary}
   */
  async function find(job, { useAI = false, count = 20, maxLen = 30, per = 0, brief = '' } = {}) {
    const st = S();
    const lines = await st.linesInScope(job), all = st.scopeLines();
    const u = uses(lines), withDelivery = u.use && u.delivery.on && u.delivery.heard > 0;
    const deliveryOf = withDelivery ? (l => D().forLine(l)) : () => null;
    const isOut = l => st.isInterviewer(l) || /\?\s*$/.test(String(l.text || '').trim());
    const ranked = basic(lines, { quality: T().quality, heart: MO().heart, deliveryOf, isOut, maxLen });
    if (!ranked.length) throw new US.UserError('NOTHING_FOUND', { title: 'There are no lines that could work as highlights here.', action: `Lines between 2 and ${maxLen} seconds that aren’t the interviewer are used – try a longer “Longest line”, or work on more interviews.` });
    const groupOf = id => { const t = st.interviewOf(id); return t ? t.key : ''; };
    let list, by = 'basic', label = 'basic – no AI', missing = [];
    if (useAI) {
      const cands = ranked.slice(0, 1500).map(r => r.line);
      const batches = requests(cands, { all, count, withDelivery, brief });
      job && job.set && job.set({ who: 'ai', msg: `${US.ai.label()} is reading ${US.plural(cands.length, 'line')} for the best ones` });
      const r = await SAI().runPicks(batches, { limit: Math.max(count * 3, 60), job, label: 'choosing the best lines' });
      const basicOf = new Map(ranked.map(x => [x.line.id, x]));
      const picked = r.picks.map(p => { const b = basicOf.get(p.line.id) || {}; return { line: p.line, score: r3(p.rel), reasons: p.reasons.concat((b.reasons || []).filter(x => /said well|weak delivery/.test(x))), delivery: b.delivery || null }; });
      list = spread(picked, { count, per, groupOf });
      by = 'ai'; label = `chosen by ${US.ai.label()}`; missing = r.missing || [];
    } else list = spread(ranked, { count, per, groupOf });
    const usedDelivery = list.filter(x => x.delivery).length;
    const out = { list: list.map(x => ({ lineId: x.line.id, score: x.score, reasons: x.reasons, delivery: x.delivery })), by, label, withDelivery, usedDelivery, count, maxLen, per, at: Date.now(), read: lines.length, missing: missing.length ? SAI().missingNote(missing) : '' };
    out.summary = `${US.plural(out.list.length, 'best line')} from ${US.plural(lines.length, 'line')} · judged on the words${withDelivery ? ` and how ${US.plural(usedDelivery, 'of them is', 'of them are')} said (listened to)` : ' only – no listening'}${by === 'ai' ? ` · ${label}` : ''}${out.missing ? ' · ' + out.missing : ''}`;
    return out;
  }
  /** What one AI run would read and cost (before it is sent). */
  function costLine(lines, { count = 20, maxLen = 30 } = {}) {
    if (!(US.ai && US.ai.available())) return '';
    const st = S(), u = uses(lines), withDelivery = u.use && u.delivery.on && u.delivery.heard > 0;
    const ranked = basic(lines, { quality: T().quality, heart: MO().heart, isOut: l => st.isInterviewer(l), maxLen }).slice(0, 1500).map(r => r.line);
    if (!ranked.length) return '';
    const reqs = requests(ranked, { all: st.scopeLines(), count, withDelivery }).map(b => b.req);
    return `${US.ai.label()} reads ${SAI().describe(SAI().cost(reqs), { lines: ranked.length })} – only the text of the lines${withDelivery ? ', with the notes on how they’re said' : ''} is sent.`;
  }

  US.storyBest = { find, uses, usesBox, costLine, useDelivery, SYSTEM,
    _pure: { lengthFit, lineScore, basic, spread, requests, row, DELIVERY_HINT } };
})();
