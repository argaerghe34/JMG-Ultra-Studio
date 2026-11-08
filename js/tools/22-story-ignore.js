/* Story › leave out what isn't speech: sung lyrics, other languages and lines the transcription misheard (a concert or
   event with speeches between songs). Premiere transcribes everything it hears as one language, so songs and Hebrew come
   back as lines – often nonsense. Lines left out stay in the project (transcript.ignored) and come back when the option
   is turned off or a line is kept; everything else in Story – search, themes, moments, AI, building – only sees the rest.
   Found on this computer (sung: slow, long-held, repeated words; other alphabets) and, if asked, by the AI. */
(function () {
  'use strict';
  const US = window.US;
  const S = () => US.story, T = () => US.transcript;

  const WHY = { song: 'Sung', language: 'Another language', garbled: 'Misheard', other: 'Not speech', between: 'Between songs', you: 'Left out by you' };
  const words = t => String(t || '').split(/[ \t\r\n]+/).filter(Boolean);
  const norm = t => String(t || '').toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();

  /** Each line's reason to leave it out, found without AI: id -> 'song' | 'language' | 'between'. */
  function detect(lines, { songs = true, language = true } = {}) {
    const out = new Map(), ls = (lines || []).slice().sort((a, b) => a.start - b.start);
    // the same words more than once in an interview: a chorus
    const seen = new Map();
    for (const l of ls) { const n = norm(l.text); if (words(n).length >= 3) seen.set(n, (seen.get(n) || 0) + 1); }
    const sets = ls.map(l => new Set(words(norm(l.text))));
    for (let i = 0; i < ls.length; i++) {
      const l = ls[i], text = String(l.text || ''), ws = words(text), n = ws.length;
      if (!n) continue;
      if (language) {
        const letters = (text.match(/\p{L}/gu) || []).length, other = (text.match(/[֐-׿؀-ۿЀ-ӿͰ-Ͽ]/g) || []).length;
        if (letters && other / letters >= 0.3) { out.set(l.id, 'language'); continue; }
      }
      if (!songs) continue;
      const dur = Math.max(0.1, l.end - l.start);
      let score = 0;
      if (/[♪♫]|\b(la|na|oh|ooh|yeah|hey|ah)( \1){2,}\b/i.test(text)) score += 2;
      if (n / dur < 1.4 && dur >= 3) score++;
      const W = T().wordTimes ? T().wordTimes(l) : null;
      if (W && W.exact && n >= 3) { const avg = W.words.reduce((s, w) => s + (w.e - w.s), 0) / n; if (avg > 0.55) score++; }
      const rep = seen.get(norm(text)) || 0;
      if (rep >= 2) score += rep >= 3 ? 2 : 1;
      else if (sets[i].size >= 4) {   // nearly the same line elsewhere (a chorus heard a little differently)
        for (let j = 0; j < ls.length; j++) {
          if (j === i || sets[j].size < 4) continue;
          let both = 0; for (const w of sets[i]) if (sets[j].has(w)) both++;
          if (both / (sets[i].size + sets[j].size - both) >= 0.7) { score++; break; }
        }
      }
      const grams = new Map(); for (let k = 0; k + 1 < n; k++) { const g = (ws[k] + ' ' + ws[k + 1]).toLowerCase(); grams.set(g, (grams.get(g) || 0) + 1); }
      if (Math.max(0, ...grams.values()) >= 3) score++;
      if (score >= 2) out.set(l.id, 'song');
    }
    // a few words between two left-out lines are part of the song too
    for (let i = 1; i < ls.length - 1; i++) {
      const l = ls[i];
      if (out.has(l.id) || words(l.text).length > 8) continue;
      const a = ls.slice(0, i).reverse().find(x => out.has(x.id)), b = ls.slice(i + 1).find(x => out.has(x.id));
      if (a && b && a === ls[i - 1] && b === ls[i + 1] && b.start - a.end < 20) out.set(l.id, 'between');
    }
    return out;
  }

  /** Split each transcript into the lines Story uses (t.lines) and the ones left out (t.ignored), by cfg. Returns the number left out. */
  function partition(transcripts, cfg) {
    cfg = cfg || {};
    let n = 0;
    const keep = new Set(cfg.keep || []), drop = new Set(cfg.drop || []), ai = cfg.ai || {};
    for (const t of transcripts || []) {
      const pool = (t.lines || []).concat(t.ignored || []).sort((a, b) => a.start - b.start);
      pool.forEach(l => { delete l.left; });
      if (!cfg.on) { t.lines = pool; delete t.ignored; continue; }
      const found = detect(pool, cfg);
      const left = [], kept = [];
      for (const l of pool) {
        const why = drop.has(l.id) ? 'you' : keep.has(l.id) ? null : found.get(l.id) || (cfg.useAi !== false && ai[l.id]) || null;
        if (why) { l.left = why; left.push(l); } else kept.push(l);
      }
      t.lines = kept;
      if (left.length) t.ignored = left; else delete t.ignored;
      n += left.length;
    }
    return n;
  }

  /* ---------- the AI's look: which lines aren't the spoken remarks ---------- */
  const AI_SCHEMA = { type: 'object', additionalProperties: false, required: ['lines'], properties: { lines: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['id', 'why'], properties: { id: { type: 'string' }, why: { type: 'string', enum: ['song', 'language', 'garbled', 'other'] } } } } } };
  function aiRequest(lines, { speech = 'English', brief = '' } = {}) {
    const mmss = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
    return {
      system: `You read speech-to-text transcripts of recordings such as concerts and events, where people speak between songs. The transcription heard everything as ${speech}, so songs, other languages and noise come back as lines too – often nonsense or words that don't fit together. The editor wants only the spoken ${speech} remarks: speeches, introductions, thanks, stories. List the lines that are NOT that: "song" (sung lyrics, in any language), "language" (spoken in another language, or another language heard as ${speech} sounds), "garbled" (words that make no sense together – misheard music, crowd or noise), "other" (applause, cheering, counting in, sound checks). Keep every line that is ordinary ${speech} speech, even short or informal ones, and when unsure keep it. Answer as JSON.`,
      user: `${brief ? `About the recording: ${brief}\n` : ''}Each line: id<TAB>time<TAB>words a second<TAB>text. Singing is usually slower than speech, and choruses repeat.\n\n${lines.map(l => `${l.id}\t${mmss(l.start)}\t${(words(l.text).length / Math.max(0.1, l.end - l.start)).toFixed(1)}\t${l.text}`).join('\n')}\n\nList only the lines to leave out.`,
      schema: AI_SCHEMA, maxTokens: 6000, effort: 'low', fast: true, feature: 'Leave out what isn’t speech'
    };
  }
  /** The AI's answer as id -> why (only ids it was sent). */
  function aiFrom(r, lines) {
    const ids = new Set((lines || []).map(l => l.id)), out = {};
    for (const x of (r && r.lines) || []) if (ids.has(x.id) && WHY[x.why]) out[x.id] = x.why;
    return out;
  }
  async function askAi(job, cfg) {
    const st = S().state(), all = st.transcripts.flatMap(t => (t.lines || []).concat(t.ignored || [])).sort((a, b) => a.start - b.start);
    const speech = String(cfg.speech || 'English'), brief = String(US.settings.get('story.brief', '') || '');
    const got = {};
    for (let i = 0; i < all.length; i += 180) {
      const part = all.slice(i, i + 180);
      job.set({ who: 'ai', msg: `${US.ai.label()} is reading lines ${i + 1}–${i + part.length} of ${all.length}` });
      if (job.progress) job.progress(i / all.length);
      Object.assign(got, aiFrom(await US.ai.json(aiRequest(part, { speech, brief })), part));
    }
    return got;
  }

  /* ---------- Story › 1 Interviews ---------- */
  function card({ render }) {
    const h = US.h, ui = US.ui, st = S().state();
    const cfg = st.ignore = Object.assign({ on: false, songs: true, language: true, useAi: true, speech: 'English', ai: {}, keep: [], drop: [] }, st.ignore || {});
    const apply = () => { S().reindex(); S().save(); render(); };
    const left = st.transcripts.flatMap(t => (t.ignored || []).map(l => ({ l, t })));
    const secs = left.reduce((s, x) => s + (x.l.end - x.l.start), 0);
    const status = h('div.field-hint');
    const box = h('div.ignore-list');
    const toggle = (label, key, title) => h('label.row', { title: title || '' }, h('input', { type: 'checkbox', checked: !!cfg[key], onchange: e => { cfg[key] = e.target.checked; apply(); } }), ' ' + label);
    if (cfg.on) {
      const byT = new Map(); for (const x of left) { if (!byT.has(x.t)) byT.set(x.t, []); byT.get(x.t).push(x.l); }
      let shown = 0;
      for (const [t, ls] of byT) {
        box.appendChild(h('div.field-label', `${t.name} – ${US.plural(ls.length, 'line')} left out`));
        for (const l of ls) {
          if (shown++ > 400) break;
          box.appendChild(h('div.ignore-line', h('span.chip', WHY[l.left] || l.left), h('span.ignore-time', US.fmtDur ? US.fmtDur(l.start) : String(Math.round(l.start))), h('span.ignore-text.muted', l.text),
            ui.button('Keep', { small: true, kind: 'ghost', title: 'Use this line after all', onClick: () => { cfg.keep = (cfg.keep || []).filter(x => x !== l.id).concat(l.id); cfg.drop = (cfg.drop || []).filter(x => x !== l.id); apply(); } })));
        }
      }
      if (!left.length) box.appendChild(h('div.field-hint', 'Nothing left out yet – try “Check with AI”.'));
    }
    const kept = (cfg.keep || []).length;
    return ui.section('Leave out songs and other languages', [
      h('div.field-hint', 'For concerts and events: Premiere transcribes everything as one language, so songs, Hebrew and crowd noise come back as lines – often nonsense. Turn this on to leave them out of search, themes, moments, AI and building. Nothing is deleted: turn it off, or press Keep on a line, to have it back.'),
      toggle('Leave out what isn’t speech', 'on'),
      cfg.on ? h('div.ignore-opts',
        toggle('Sung lines (slow, long-held or repeated words)', 'songs'),
        toggle('Hebrew and other alphabets', 'language'),
        toggle('What the AI found', 'useAi', 'Lines the AI said are sung, in another language or misheard'),
        h('div.row', h('span.field-label', 'Speeches are in'), ui.input({ value: cfg.speech, placeholder: 'English', onInput: v => { cfg.speech = v.trim() || 'English'; S().save(); } })),
        h('div.row',
          ui.button(Object.keys(cfg.ai || {}).length ? 'Check with AI again' : 'Check with AI', { small: true, kind: 'primary', title: 'Finds lyrics, other languages and misheard lines this computer can’t tell – best for Hebrew heard as English', onClick: async () => {
            if (!US.ai || !US.ai.available()) { ui.toast({ type: 'warn', title: 'This needs AI.', text: 'Add a Claude or Gemini key in Settings.' }); return; }
            try {
              const got = await US.jobs.run({ title: 'Finding what isn’t speech', tool: 'story' }, job => askAi(job, cfg));
              if (got === undefined) return;
              cfg.ai = got; cfg.useAi = true; apply();
            } catch (e) { if (!(e instanceof US.UserError && e.code === 'CANCELLED')) status.textContent = `The AI’s look didn’t work: ${e.title || e.message}.`; }
          } }),
          kept ? ui.button(`Forget ${US.plural(kept, 'kept line')}`, { small: true, kind: 'ghost', onClick: () => { cfg.keep = []; apply(); } }) : null),
        status, box) : null
    ], { open: cfg.on && left.length > 0, hint: cfg.on ? `${US.plural(left.length, 'line')} left out${secs ? ` (${US.fmtDur(secs)})` : ''}` : 'off – for concerts and events' });
  }
  /** Leave one line out by hand (from a line's menu). */
  function dropLine(id) {
    const st = S().state(), cfg = st.ignore = Object.assign({ on: true, songs: true, language: true, useAi: true, speech: 'English', ai: {}, keep: [], drop: [] }, st.ignore || {});
    cfg.on = true; cfg.drop = (cfg.drop || []).filter(x => x !== id).concat(id); cfg.keep = (cfg.keep || []).filter(x => x !== id);
    S().reindex(); S().save();
  }

  US.storyIgnore = { detect, partition, aiRequest, aiFrom, card, dropLine, AI_SCHEMA, WHY };
})();
