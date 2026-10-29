/* JMG Ultra Studio – Story › Narrative from a brief (S2). Pure logic (unit-tested); the screen is in 22-story.js.
   A brief like “a 60-second video about how the community looks after each other” becomes an ordered list of beats
   (hook → build → payoff), each an interview line, optionally trimmed by whole words, fitted to the duration. */
(function () {
  'use strict';
  const US = window.US;
  const T = () => US.transcript;
  const TONES = ['uplifting', 'emotional', 'moving', 'funny', 'light', 'serious', 'hopeful', 'celebratory', 'reflective', 'punchy', 'warm', 'inspiring', 'sad', 'joyful', 'nostalgic', 'urgent'];
  const WORDNUM = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, ten: 10, fifteen: 15, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, ninety: 90 };

  /** “Create a 60-second video on this topic” -> {seconds, topic, tone, said} (seconds 15..600, 60 if not given). */
  function parseBrief(text) {
    let t = ' ' + String(text || '').replace(/\s+/g, ' ').trim() + ' ';
    let seconds = null;
    const num = x => (WORDNUM[String(x).toLowerCase()] != null ? WORDNUM[String(x).toLowerCase()] : parseFloat(x));
    let m;
    const take = (re, f) => { if (seconds == null && (m = re.exec(t))) { seconds = f(m); t = t.replace(m[0], ' '); } };
    take(/\b(\d{1,2}):(\d{2})\b/, m => +m[1] * 60 + +m[2]);
    take(/\bhalf\s+a\s+minute\b/i, () => 30);
    take(/\b(a|one|two|three|four|five|six|ten|\d+(?:\.\d+)?)[\s-]*(minutes?|mins?|m)\b(\s+and\s+a\s+half)?/i, m => num(m[1]) * 60 + (m[3] ? 30 : 0));
    take(/\b(\d+(?:\.\d+)?|ten|fifteen|twenty|thirty|forty|fifty|sixty|ninety)[\s-]*(seconds?|secs?|s)\b/i, m => num(m[1]));
    const said = seconds != null;
    seconds = Math.max(15, Math.min(600, Math.round(seconds || 60)));
    const tone = TONES.find(w => new RegExp('\\b' + w + '\\b', 'i').test(t)) || '';
    const NOUN = '(video|film|piece|edit|cut|sequence|story|promo|clip|montage|narrative|trailer|teaser|reel|sting|documentary|doc|advert|ad|spot)';
    let topic = t
      .replace(new RegExp('\\b(' + TONES.join('|') + '|short|quick|little|long)\\b', 'ig'), ' ')
      .replace(/\b(please|can you|could you|i want|i'd like|i would like|i need)\b/ig, ' ')
      .replace(/\b(create|make|build|cut|edit|put together|assemble|give me|do)\b/ig, ' ')
      .replace(/\s+/g, ' ')
      .replace(new RegExp('\\b(a|an|the|some)\\s+' + NOUN + 's?\\b', 'ig'), ' ')
      .replace(new RegExp('\\b' + NOUN + '\\b', 'ig'), ' ')
      .replace(/\b(length|duration)\b/ig, ' ')
      .replace(/\s+/g, ' ').trim();
    for (let i = 0; i < 3; i++) topic = topic.replace(/^(about|on|of|for|showing|that shows|around|regarding|and|with|something about|something on|a|an)\s+/i, '');
    topic = topic.replace(/[\s.,;:!?]+$/, '').replace(/^[\s,;:]+/, '').trim();
    if (/^(this|that|it|this topic|that topic|the topic|anything)$/i.test(topic)) topic = '';
    return { seconds, topic, tone, said };
  }

  /** Words kept by a trim (whole words dropped at each end), with their times. */
  function trimmed(line, dropStart = 0, dropEnd = 0) {
    const wt = T().wordTimes(line), n = wt.words.length;
    const a = Math.max(0, Math.min(n - 1, dropStart | 0)), b = Math.max(a, n - 1 - Math.max(0, dropEnd | 0));
    const kept = wt.words.slice(a, b + 1);
    return { start: kept[0].s, end: kept[kept.length - 1].e, text: (a > 0 ? '…' : '') + kept.map(w => w.text).join(' ') + (b < n - 1 ? '…' : ''), dropStart: a, dropEnd: n - 1 - b, exact: wt.exact };
  }
  /** A beat's duration on the timeline (with handles at both ends). */
  const beatDur = (b, handles) => b.end - b.start + 2 * handles;
  const total = (beats, handles) => beats.reduce((n, b) => n + beatDur(b, handles), 0);

  const LEAD = /^(and|so|but|well|um+|uh+|er+|erm|like|yeah|okay|ok|i mean|you know|because|then|now)$/i;
  /**
   * Fit beats into target ±10%. First drop the weakest middle lines (the hook and the payoff stay) – but only while that
   * still leaves enough; then tighten the longest lines by whole words (a leading “and / so / well / um” first, else
   * from the end; never below 4 words or 3 s); as a last resort drop more middle lines. -> beats
   */
  function fit(beats, target, { handles = 0.3, lineOf } = {}) {
    const max = target * 1.1, min = target * 0.9, weaker = (w, b) => (b.strength < w.strength ? b : w);
    const out = beats.slice();
    while (total(out, handles) > max) {
      const t = total(out, handles), fits = out.slice(1, -1).filter(b => t - beatDur(b, handles) >= min);
      if (!fits.length) break;
      out.splice(out.indexOf(fits.reduce(weaker)), 1);
    }
    for (let guard = 0; total(out, handles) > max && guard < 200; guard++) {
      const can = out.filter(b => b.end - b.start >= 3 && T().wordTimes(lineOf(b.lineId)).words.length - b.dropStart - b.dropEnd > 4);
      if (!can.length) break;
      const longest = can.reduce((w, b) => (b.end - b.start > w.end - w.start ? b : w));
      const l = lineOf(longest.lineId), first = T().wordTimes(l).words[longest.dropStart];
      const lead = first && LEAD.test(String(first.text).replace(/[^\w']/g, ''));
      Object.assign(longest, trimmed(l, longest.dropStart + (lead ? 1 : 0), longest.dropEnd + (lead ? 0 : 1)));
    }
    while (total(out, handles) > max && out.length > 2) out.splice(out.indexOf(out.slice(1, -1).reduce(weaker)), 1);
    return out;
  }

  /**
   * Basic narrative without AI: a short strong hook, the most relevant lines in the middle (different speakers where
   * possible), the most heartfelt strong line as the payoff, fitted to the duration.
   * pool: [{id, rel, strength, heart, from?}] (rel 0..1, strength 0..1, heart = emotional weight). lineOf(id) -> line.
   */
  function basic(pool, target, { handles = 0.3, lineOf, title = '' } = {}) {
    if (!pool.length) return null;
    const L = id => lineOf(id), dur = id => L(id).end - L(id).start + 2 * handles;
    const score = c => c.rel * 0.6 + c.strength * 0.4;
    const byScore = pool.slice().sort((a, b) => score(b) - score(a));
    const hook = byScore.find(c => dur(c.id) <= 10 && c.strength >= 0.55) || byScore.find(c => dur(c.id) <= 12) || byScore[0];
    const moving = c => c.heart * 0.5 + c.strength * 0.3 + c.rel * 0.4; // heartfelt, strong and still on the topic
    const payoffPool = pool.filter(c => c.id !== hook.id).sort((a, b) => moving(b) - moving(a));
    const payoff = payoffPool[0] || null;
    const middle = [];
    let used = dur(hook.id) + (payoff ? dur(payoff.id) : 0), lastSpeaker = L(hook.id).speaker;
    const rest = byScore.filter(c => c.id !== hook.id && (!payoff || c.id !== payoff.id));
    while (used < target * 0.95 && rest.length) {
      // prefer a different speaker from the last line, if a good one fits
      let i = rest.findIndex(c => L(c.id).speaker !== lastSpeaker && used + dur(c.id) <= target * 1.1);
      if (i < 0) i = rest.findIndex(c => used + dur(c.id) <= target * 1.1);
      if (i < 0) break;
      const c = rest.splice(i, 1)[0];
      middle.push(c); used += dur(c.id); lastSpeaker = L(c.id).speaker;
    }
    const mk = (c, purpose) => Object.assign({ lineId: c.id, purpose, strength: c.strength }, trimmed(L(c.id), 0, 0));
    const src = c => (c.from && c.from.length ? 'From ' + c.from.map(f => (f === 'board' ? 'the board' : f === 'find more' ? 'Find more' : `“${f}”`)).join(' + ') : 'On the topic');
    let beats = [mk(hook, 'Opens strong and short')].concat(middle.map(c => mk(c, src(c))), payoff ? [mk(payoff, 'The most heartfelt line, to end on')] : []);
    beats = fit(beats, target, { handles, lineOf });
    const inStory = new Set(beats.map(b => b.lineId));
    const alternates = byScore.filter(c => !inStory.has(c.id)).slice(0, ALTERNATES).map(c => ({ lineId: c.id, why: c.heart >= 0.3 ? 'A heartfelt line on the topic' : c.strength >= 0.7 ? 'A strong line on the topic' : 'On the topic' }));
    return { title: title || 'Narrative', logline: '', beats, alternates, by: 'basic' };
  }

  // the strongest lines that didn't make the story, offered at the end of the sequence for the editor to swap in
  const ALTERNATES = 12;
  const AI_SCHEMA = {
    type: 'object', additionalProperties: false, required: ['title', 'logline', 'beats', 'alternates'],
    properties: {
      title: { type: 'string' }, logline: { type: 'string' },
      beats: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['lineId', 'purpose', 'dropStartWords', 'dropEndWords'], properties: { lineId: { type: 'string' }, purpose: { type: 'string' }, dropStartWords: { type: 'integer' }, dropEndWords: { type: 'integer' } } } },
      alternates: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['lineId', 'why'], properties: { lineId: { type: 'string' }, why: { type: 'string' } } } }
    }
  };
  /**
   * The request for an ordered narrative from the pool (text only). The listing goes first (rows in project order via
   * orderOf, the same for any length or tone, so trying another length on the same topic reads it from Claude's
   * cache); the brief comes after it.
   */
  function aiRequest(pool, brief, { handles = 0.3, lineOf, speakerName = s => s, interviewName = () => '', orderOf = null } = {}) {
    const rows = orderOf ? pool.slice().sort((a, b) => orderOf(a.id) - orderOf(b.id)) : pool;
    const listing = 'Interview lines (id<TAB>speaker<TAB>interview<TAB>length<TAB>★ = strong<TAB>text):\n' + rows.map(c => { const l = lineOf(c.id); return `${c.id}\t${speakerName(l.speaker) || '-'}\t${interviewName(c.id).slice(0, 40)}\t${(l.end - l.start).toFixed(1)}s\t${c.strength >= 0.7 ? '★' : ''}\t${l.text.replace(/\s+/g, ' ').slice(0, 400)}`; }).join('\n');
    return {
      system: `You are a documentary editor. Build a short narrative from interview lines: open with a hook, build the story, and end with a payoff. Only use lines from the list, each at most once, in the order they should play. You may drop whole words at the start or end of a line to tighten it (dropStartWords / dropEndWords), but keep each line a complete thought. Give each beat a one-line purpose (what it does in the story, without the words hook, build or payoff). Match the requested length within ±10%. Then, as alternates, list up to ${ALTERNATES} lines you didn’t use that could replace a beat or take the story another way, best first, each with a few words on why (and which beat it could replace, if any). Use British English.`,
      user: T().aiUser(listing, `Brief: ${brief.topic || 'the interviews'}${brief.tone ? ` (tone: ${brief.tone})` : ''}\nLength: ${brief.seconds} seconds, counting about ${(2 * handles).toFixed(1)} s of handles on each line.\nUse only the lines above.${contextNote(brief.context)}`, '1h'),
      schema: AI_SCHEMA, maxTokens: 8000, effort: 'medium', feature: 'Narrative cut'
    };
  }
  // the client's emails, documents and wishes pasted with the brief: after the cached listing, so it never stops the sharing
  const CONTEXT_MAX = 60000;
  /** The pasted context as it goes to the AI (trimmed to CONTEXT_MAX characters). */
  function contextNote(text) {
    const t = String(text || '').replace(/\r/g, '').replace(/\n{3,}/g, '\n\n').trim();
    if (!t) return '';
    return '\n\nThe client’s notes and wishes, pasted by the editor (emails, documents). Follow them where they apply – who it’s for, what to include, avoid or emphasise, the messages and the tone – but only use what the interviews actually say.\n' +
      `--- CLIENT NOTES ---\n${t.slice(0, CONTEXT_MAX)}${t.length > CONTEXT_MAX ? '\n[…the rest was left out]' : ''}\n--- END OF CLIENT NOTES ---`;
  }
  /** Ask the AI for the narrative, then check it and fit it to the duration. */
  async function withAI(pool, brief, opts = {}) {
    if (!US.ai || !US.ai.available()) throw new US.UserError('AI_KEY');
    opts.job && opts.job.set({ who: 'ai', msg: `${US.ai.label()} is shaping a ${brief.seconds}-second story from ${US.plural(pool.length, 'line')}` });
    const r = await US.ai.json(aiRequest(pool, brief, opts));
    return checkAI(r, pool, brief.seconds, { handles: opts.handles == null ? 0.3 : opts.handles, lineOf: opts.lineOf });
  }
  /** Validate the AI's plan: known ids only, each once, sane trims; recompute the length and fit it. */
  function checkAI(r, pool, target, { handles = 0.3, lineOf }) {
    const known = new Map(pool.map(c => [c.id, c])), used = new Set();
    const beats = [];
    for (const b of (r && r.beats) || []) {
      const id = String(b.lineId);
      if (!known.has(id) || used.has(id)) continue;
      used.add(id);
      const l = lineOf(id), n = T().wordTimes(l).words.length;
      let ds = Math.max(0, b.dropStartWords | 0), de = Math.max(0, b.dropEndWords | 0);
      if (n - ds - de < 3) { ds = 0; de = 0; } // never trim a line to nothing
      beats.push(Object.assign({ lineId: id, purpose: String(b.purpose || '').slice(0, 160), strength: known.get(id).strength }, trimmed(l, ds, de)));
    }
    if (!beats.length) throw new US.UserError('AI_FAILED', { title: 'The AI didn’t come back with a usable story.', action: 'Try again, or use the basic version (no AI).' });
    const fitted = fit(beats, target, { handles, lineOf }), inStory = new Set(fitted.map(b => b.lineId)), alternates = [];
    for (const x of (r && r.alternates) || []) { const id = String(x.lineId); if (known.has(id) && !inStory.has(id) && !alternates.some(a => a.lineId === id)) alternates.push({ lineId: id, why: String(x.why || '').slice(0, 160) }); }
    return { title: String((r && r.title) || 'Narrative').slice(0, 80), logline: String((r && r.logline) || '').slice(0, 240), beats: fitted, alternates: alternates.slice(0, ALTERNATES), by: 'ai' };
  }

  US.storyNarrative = { parseBrief, trimmed, fit, basic, aiRequest, withAI, checkAI, AI_SCHEMA, total, contextNote, CONTEXT_MAX, ALTERNATES };
})();
