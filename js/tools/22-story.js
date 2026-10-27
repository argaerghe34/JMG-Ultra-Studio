/* JMG Ultra Studio – Story: transcripts → search → themes → the wall → a sequence. */
(function () {
  'use strict';
  const US = window.US, h = US.h, ui = US.ui, T = US.transcript;
  const path = require('path');

  US.addIcon('pin', 'M7 3h6l-1 5 3 3H5l3-3zM10 11v6');
  US.addIcon('eye', 'M2 10s3-5 8-5 8 5 8 5-3 5-8 5-8-5-8-5zm8 2a2 2 0 1 0 0-4 2 2 0 0 0 0 4z');
  US.addIcon('eyeoff', 'M3 3l14 14M8 5.3A8 8 0 0 1 10 5c5 0 8 5 8 5a14 14 0 0 1-2.5 3M5 6.5C3 8 2 10 2 10s3 5 8 5a7 7 0 0 0 3-.7');
  US.addIcon('note', 'M4 3h9l3 3v11H4zM7 8h6M7 11h6M7 14h3');
  US.addIcon('grip', 'M7 5h.01M13 5h.01M7 10h.01M13 10h.01M7 15h.01M13 15h.01');
  US.addIcon('left', 'M12 5l-5 5 5 5');
  US.addIcon('right', 'M8 5l5 5-5 5');
  US.addIcon('up', 'M5 12l5-5 5 5');
  US.addIcon('down', 'M5 8l5 5 5-5');
  US.addIcon('more', 'M5 10h.01M10 10h.01M15 10h.01');
  US.addIcon('star', 'M10 3l2.1 4.3 4.7.7-3.4 3.3.8 4.7L10 13.8 5.8 16l.8-4.7L3.2 8l4.7-.7z');

  const SPEAKER_COLORS = ['#6b8bd6', '#1ebc9c', '#f1a33b', '#e46b8a', '#d38fd8', '#56a845', '#29a0d8', '#c9a87f', '#a593e0', '#e2d33a'];
  const binBase = () => US.settings.get('story.binBase') || 'JMG Ultra Studio/Story';

  /* ================= colours & strength ================= */
  // Premiere label colours for themes, in a pleasant order; Yellow (15) is kept for the strongest lines by default.
  const THEME_PALETTE = [1, 2, 7, 6, 3, 5, 4, 12, 0, 10, 8, 11, 9, 14, 13, 15];
  // nearest of Premiere's 8 marker colours for each label colour
  const LABEL_TO_MARKER = { 0: 2, 1: 6, 2: 7, 3: 2, 4: 6, 5: 0, 6: 1, 7: 3, 8: 2, 9: 6, 10: 7, 11: 2, 12: 3, 13: 0, 14: 3, 15: 4 };
  const STRONG = 0.7; // same bar as the "strong" pill
  // the post-it board is switched off for now (its data and code stay, so it can come back): themes, narratives and
  // the paper edit stand in for it
  const BOARD = false;
  const strongLabel = () => US.settings.get('story.strongLabel', 15);
  const isStrong = l => !!l && T.quality(l).score >= STRONG;
  const labelHex = i => (US.ui.LABELS[i] || US.ui.LABELS[0]).hex;
  const labelName = i => (US.ui.LABELS[i] || US.ui.LABELS[0]).name;
  /** First palette colour not in use (and not the highlight colour). */
  function nextColour(used, avoid) {
    const u = new Set(used);
    for (const i of THEME_PALETTE) if (!u.has(i) && i !== avoid) return i;
    const pool = THEME_PALETTE.filter(i => i !== avoid);
    return pool[used.length % pool.length];
  }

  /* ================= state (one file per project) ================= */
  let state = null, statePath = '', lineById = new Map(), clipOfLine = new Map();
  const emptyState = () => ({ transcripts: [], speakers: {}, themes: [], wall: { columns: [] }, picked: [], whoIsWho: {} });
  function storyFile(projectPath) { return path.join(US.fsx.dataDir, 'projects', US.fsx.hash(projectPath || 'none') + '-story.json'); }
  // the copy next to the project (22-story-sync.js), so the project opened on another computer has its Story
  let session = null;
  function loadState() {
    const p = (US.ctx.project && US.ctx.project.path) || '';
    if (p === statePath && state) return state;
    flushShared();
    statePath = p;
    session = p && US.storySync ? US.storySync.open(p, storyFile(p)) : null;
    state = Object.assign(emptyState(), p ? (session ? session.state || {} : US.fsx.readJSON(storyFile(p), {})) : {});
    reindex(); ensureColours();
    if (session && session.other) { const other = session.other; setTimeout(() => offerOther(other), 300); }
    if (session && session.needsWrite) saveNow();   // stamped, so the next open knows the two copies match
    return state;
  }
  const saveNow = () => {
    if (!statePath || !state) return;
    if (session) session.stamp(state);
    try { US.fsx.writeJSON(storyFile(statePath), state); } catch (e) { US.ui.showError(e, { context: 'Saving Story' }); }
    if (session) saveShared();
  };
  const save = US.debounce(saveNow, 400);
  // a few seconds after the last change, so a synced drive isn't kept busy
  let sharedTimer = null;
  function saveShared() { clearTimeout(sharedTimer); sharedTimer = setTimeout(flushShared, 3000); }
  function flushShared() {
    if (sharedTimer == null || !session || !state) return;
    clearTimeout(sharedTimer); sharedTimer = null;
    const theirs = session.writeShared(state);
    if (theirs) setTimeout(() => offerOther(theirs), 0);
  }
  window.addEventListener('beforeunload', flushShared);
  if (document.addEventListener) document.addEventListener('visibilitychange', () => { if (document.hidden) flushShared(); });
  /** Story was changed on two computers without the copies meeting: the newer one is open, the other was kept as a
      backup next to the project – offer it. */
  async function offerOther(other) {
    const S = US.storySync, mine = state, forPath = statePath;
    const pick = await US.ui.modal({
      title: 'Story was changed on two computers',
      body: US.h('div',
        US.h('p', `This project’s Story was changed on ${S.describe(mine)} and on ${S.describe(other)}, and the two copies didn’t meet in between.`),
        US.h('p', `Story has opened the newer one, from ${S.describe(mine)}. The other is kept as a backup in the “JMG Ultra Studio” folder next to the project, so nothing is lost.`)),
      buttons: [{ label: `Use the one from ${S.describe(other).split(',')[0]}`, value: 'other', kind: 'ghost' }, { label: 'Keep this one', value: 'keep', kind: 'primary' }]
    });
    if (pick !== 'other' || statePath !== forPath || state !== mine) return;
    try { US.fsx.writeJSON(S.backupName(forPath, mine), mine); } catch (e) { /* the copy on this computer is overwritten next */ }
    state = Object.assign(emptyState(), other);
    reindex(); ensureColours(); saveNow(); flushShared();
    US.log('info', `Story switched to the copy from ${S.describe(other)}; the other is kept as a backup`, '', 'story');
    US.bus.emit('story-replaced');
  }
  function reindex() {
    lineById = new Map(); clipOfLine = new Map(); linesStamp++;
    for (const t of state.transcripts) for (const l of t.lines) { lineById.set(l.id, l); clipOfLine.set(l.id, t); }
  }
  /** Every theme and wall column gets a colour; a column that came from a theme shares the theme's colour. */
  function ensureColours() {
    const avoid = strongLabel();
    const used = state.themes.filter(t => t.label != null).map(t => t.label);
    for (const t of state.themes) if (t.label == null) { t.label = nextColour(used, avoid); used.push(t.label); }
    for (const c of state.wall.columns) {
      const th = c.themeId && state.themes.find(t => t.id === c.themeId);
      if (th) c.label = th.label;
      else if (c.label == null) { c.label = nextColour(used.concat(state.wall.columns.map(x => x.label).filter(x => x != null)), avoid); used.push(c.label); }
    }
  }
  function columnLabel(c) { const th = c.themeId && state.themes.find(t => t.id === c.themeId); return th ? th.label : c.label; }
  /** Change a colour on a theme or a column; theme and its column stay the same colour. */
  function setColour(target, idx) {
    target.label = idx;
    if (target.lineIds) { for (const c of state.wall.columns) if (c.themeId === target.id) c.label = idx; }
    else if (target.themeId) { const th = state.themes.find(t => t.id === target.themeId); if (th) th.label = idx; }
  }
  function allLines() { return state.transcripts.flatMap(t => t.lines); }
  function speakerName(s) { return (state.speakers[s] && state.speakers[s].name) || s || 'Unknown speaker'; }
  /** Who said a line, for a caption under it: the speaker's name, or the clip when the transcript has no speaker names. */
  function whoSaid(l) { const n = speakerName(l.speaker); if (n !== speakerName('')) return n; const t = clipOfLine.get(l.id); return t ? t.name : ''; }
  function speakerColor(s) {
    if (!state.speakers[s]) state.speakers[s] = { name: s, color: Object.keys(state.speakers).length % SPEAKER_COLORS.length };
    return SPEAKER_COLORS[state.speakers[s].color % SPEAKER_COLORS.length];
  }

  // lines that came back different when transcripts were read again (for the summary)
  const readCount = { again: 0, changed: 0 };
  const readNote = () => readCount.changed ? ` · ${US.plural(readCount.changed, 'line')} read differently this time` : '';
  /** Add or replace a transcript. lines get ids unique across the project. */
  function addTranscript({ name, path: p, itemId, source, file, format, language, segments }) {
    const prefixOf = k => US.fsx.hash(k).slice(0, 5);
    let key = p || name;
    let lines = T.toLines(segments, prefixOf(key));
    // read before – maybe on another computer, where the clip's path is different: keep its key and line ids, so
    // themes, narratives and moments still find their lines
    const old = US.storySync ? US.storySync.matchTranscript(state.transcripts, { key, path: p, name, itemId, lines }) : state.transcripts.find(x => x.key === key);
    if (old && old.key !== key) { key = old.key; lines = T.toLines(segments, prefixOf(key)); }
    if (old && US.storySync) { const r = US.storySync.carryIds(old.lines, lines); readCount.again++; readCount.changed += r.changed; }
    const t = { key, name, path: p || '', itemId: itemId || (old && old.itemId) || '', source, file: file || '', format: format || '', language: language || '', lines, added: Date.now() };
    const i = old ? state.transcripts.indexOf(old) : -1;
    if (i >= 0 && state.transcripts[i].summary) t.summary = state.transcripts[i].summary;   // kept while it still fits (summarySig)
    if (i >= 0) state.transcripts[i] = t; else state.transcripts.push(t);
    lines.forEach(l => speakerColor(l.speaker));
    return t;
  }

  /* ================= reordering (pure, used by buttons and dragging) ================= */
  function moveIn(arr, from, to) {
    if (from < 0 || to < 0 || from >= arr.length || to >= arr.length || from === to) return false;
    const [x] = arr.splice(from, 1); arr.splice(to, 0, x); return true;
  }
  /** where: 'left' | 'right' | index */
  function moveColumn(i, where) { const cols = state.wall.columns; return moveIn(cols, i, where === 'left' ? i - 1 : where === 'right' ? i + 1 : where); }
  /** where: 'up' | 'down' | 'top' | 'bottom'. Top stops below pinned cards (unless this card is pinned). */
  function moveCard(col, card, where) {
    const i = col.cards.indexOf(card);
    const firstFree = col.cards.filter(k => k.pinned && k !== card).length;
    const j = where === 'up' ? i - 1 : where === 'down' ? i + 1 : where === 'top' ? (card.pinned ? 0 : firstFree) : col.cards.length - 1;
    return moveIn(col.cards, i, j);
  }
  function moveCardToColumn(card, toCol) {
    const from = state.wall.columns.find(c => c.cards.includes(card));
    if (!from || from === toCol) return false;
    from.cards.splice(from.cards.indexOf(card), 1); toCol.cards.push(card); return true;
  }
  /** Pinned first, then the strongest lines, then the rest – each group keeps its order. */
  function strongestFirst(lineIds, pinned = new Set()) {
    const p = [], s = [], r = [];
    for (const id of lineIds) (pinned.has(id) ? p : isStrong(lineById.get(id)) ? s : r).push(id);
    return p.concat(s, r);
  }

  /* ================= how picky (S6) =================
     One setting decides which lines a theme (or Find more, Moments, the narrative pool, bins, the board) uses.
     Every line gets a "pass level": the pickiest setting at which it still qualifies. A setting keeps a prefix of the
     lines sorted by pass level, so Everything useful ⊇ Balanced ⊇ Only the best always holds. */
  const PICKY_LEVELS = { all: 0.1, balanced: 0.45, best: 0.85 };
  const PICKY_TEXT = {
    all: ['Everything useful', 'every line that touches the theme, including short and partial ones'],
    balanced: ['Balanced', 'good soundbites that match the theme'],
    best: ['Only the best', 'strong, complete sentences that match the theme closely']
  };
  /** The interviewer: named so in the transcript or in Story, or a question put to the speaker (transcripts without speaker names). */
  const isInterviewer = (line, qy = T.quality(line)) => T.isInterviewerLabel(line.speaker) || (!!line.speaker && T.isInterviewerLabel(speakerName(line.speaker))) || qy.reasons.includes('interviewer');
  // lines a story can't use as they stand: the interviewer, or a question (the speaker's own, or the interviewer's next one)
  const ASKS = ['question', 'starts with a question', 'ends with a question'];
  const notForStory = (line, qy = T.quality(line)) => isInterviewer(line, qy) || ASKS.some(r => qy.reasons.includes(r));
  function pickyDefaults() { return { s: PICKY_LEVELS.balanced, perInterview: 0, maxPerTheme: 0, interviewer: false, short: 'auto', minLen: 0, maxLen: 60 }; }
  /** Project setting, with a theme's own level on top. */
  function pickyFor(th) { return Object.assign(pickyDefaults(), (state && state.picky) || {}, th && th.picky && th.picky.s != null ? { s: th.picky.s } : {}); }
  function pickyLevel(s) { let best = 'balanced', d = 9; for (const [k, v] of Object.entries(PICKY_LEVELS)) if (Math.abs(v - s) < d) { d = Math.abs(v - s); best = k; } return d < 0.02 ? best : null; }
  /** The pickiest setting (0..1+) at which this line still qualifies; -Infinity when the options rule it out entirely. */
  function passLevel(line, rel, o) {
    const dur = line.end - line.start, qy = T.quality(line);
    if (!o.interviewer && isInterviewer(line, qy)) return -Infinity;
    if (dur < (o.minLen || 0) || dur > (o.maxLen || 1e9)) return -Infinity;
    const veryShort = qy.reasons.includes('very short'), partial = qy.reasons.includes('partial sentence');
    const short = dur < 3 || veryShort || partial;
    const shortCap = !short || o.short === 'yes' ? 9 : o.short === 'no' ? -Infinity : 0.3;
    // when short/partial lines are allowed, being short isn't held against their strength (the cap above decides where they show)
    const strength = qy.score + (short ? (veryShort ? 0.25 : 0) + (partial ? 0.12 : 0) : 0);
    return Math.min(rel / 0.6, (strength - 0.25) / 0.5, shortCap);
  }
  const pickyCap = o => (o.maxPerTheme > 0 ? o.maxPerTheme : Math.round(100 - 85 * o.s));
  /**
   * Which of these lines to use. relOf(id) -> 0..1 relevance; groupOf(id) -> interview key (for "at least N per interview").
   * manual: lines added by hand (always kept). passOf: how a line's pass level is worked out (Moments use their score).
   * Returns ids in their original order.
   */
  function pickLines(ids, { relOf = () => 1, groupOf = () => '', manual = new Set(), opts = pickyFor(null), passOf = passLevel } = {}) {
    const cand = [];
    ids.forEach((id, i) => { const l = lineById.get(id); if (!l) return; const p = passOf(l, relOf(id), opts); if (p > -Infinity || manual.has(id)) cand.push({ id, i, p, g: groupOf(id) }); });
    const ranked = cand.filter(c => c.p > -Infinity).sort((a, b) => b.p - a.p || a.i - b.i);
    const keep = new Set(ranked.filter(c => c.p >= opts.s).slice(0, pickyCap(opts)).map(c => c.id));
    if (opts.perInterview > 0) {
      const per = new Map();
      for (const c of ranked) { const n = per.get(c.g) || 0; if (n < opts.perInterview) { keep.add(c.id); per.set(c.g, n + 1); } }
    }
    for (const id of manual) keep.add(id);
    return cand.filter(c => keep.has(c.id)).sort((a, b) => a.i - b.i).map(c => c.id);
  }
  /** relevance of each line in a theme: stored scores, else from its order (best first). */
  function relevanceOf(th) {
    if (th.scores) return id => (th.scores[id] != null ? th.scores[id] : 0.5);
    const n = th.lineIds.length, idx = new Map(th.lineIds.map((id, i) => [id, i]));
    return id => 1 - 0.8 * (idx.get(id) || 0) / Math.max(1, n - 1);
  }
  const interviewOf = id => { const t = clipOfLine.get(id); return t ? t.key : ''; };
  /** The lines a theme uses at its pickiness (lines you added by hand always stay). */
  function effectiveLines(th, s) {
    const opts = pickyFor(th); if (s != null) opts.s = s;
    return pickLines(th.lineIds, { relOf: relevanceOf(th), groupOf: interviewOf, manual: new Set(th.manual || []), opts });
  }
  /** "Only the best: 24 lines – strong, complete sentences … · at least 2 per interview" */
  function describePicky(o, count, texts = PICKY_TEXT) {
    const lv = pickyLevel(o.s);
    const head = lv ? `${texts[lv][0]}: ${US.plural(count, 'line')} – ${texts[lv][1]}` : `Custom (${o.s < PICKY_LEVELS.balanced ? `between ${texts.all[0]} and ${texts.balanced[0]}` : `between ${texts.balanced[0]} and ${texts.best[0]}`}): ${US.plural(count, 'line')}`;
    const extra = [o.perInterview > 0 ? `at least ${o.perInterview} per interview` : '', o.maxPerTheme > 0 ? `at most ${o.maxPerTheme} per theme` : '', o.interviewer ? 'interviewer questions included' : '', o.short === 'yes' ? 'short and partial lines included' : o.short === 'no' ? 'short and partial lines left out' : '', o.minLen > 0 || o.maxLen < 60 ? `${o.minLen}–${o.maxLen} s long` : ''].filter(Boolean);
    return head + (extra.length ? ' · ' + extra.join(' · ') : '');
  }

  /* ================= themes you add yourself ================= */
  /** Offline: Story's search (words, roots, related words, near-misses); clear matches only. -> [{line, score}] */
  function themeMatches(theme, lines, { limit = 120 } = {}) {
    const r = T.search(theme, lines, { limit: 400 });
    if (!r.length) return [];
    const top = r[0].score, floor = Math.max(0.12, top * 0.2); // generous: “How picky” narrows it later
    return r.filter(x => x.score >= floor).slice(0, limit).map(x => ({ line: x.line, score: x.score, rel: x.score / top, hits: x.hits }));
  }
  const THEME_EXPAND_SCHEMA = { type: 'object', additionalProperties: false, required: ['phrases'], properties: { phrases: { type: 'array', items: { type: 'string' } } } };
  const SAI = () => US.storyAI;
  /** The short request for “ways people say it”: words and phrases interviewees might use about a theme or topic. */
  function expandRequest(what, kind, feature) {
    return {
      system: `You help a documentary editor find interview lines ${kind === 'theme' ? 'for a theme' : 'on a topic'}. List words and short phrases interviewees might actually say when talking about it – synonyms, concrete details, related places, people and feelings. Plain lowercase, no explanations.`,
      user: `${kind === 'theme' ? 'Theme' : 'Topic'}: ${what}\nGive 10–25 words or short phrases.`, schema: THEME_EXPAND_SCHEMA, maxTokens: 2000, effort: 'low', feature
    };
  }
  /**
   * What the AI reads, most promising first: lines that match the words (and related phrases), then – when the editor
   * lets the AI read more than that – the strongest other lines. n: how many (Infinity = all). -> [{line, score, hits}]
   */
  function rankCandidates(queries, lines, n) {
    const best = new Map();
    for (const q of queries) for (const r of T.search(q, lines, { limit: n === Infinity ? 2000 : Math.max(80, Math.min(2000, n)) })) { const had = best.get(r.line.id); if (!had || r.score > had.score) best.set(r.line.id, { line: r.line, score: r.score, hits: r.hits, q }); }
    const hits = Array.from(best.values()).sort((a, b) => b.score - a.score);
    if (hits.length >= n) return hits.slice(0, n);
    const rest = lines.filter(l => !best.has(l.id)).sort((a, b) => T.indexLine(b).q - T.indexLine(a).q);
    return hits.concat((n === Infinity ? rest : rest.slice(0, n - hits.length)).map(l => ({ line: l, score: 0, hits: [] })));
  }
  const OWN_PICK_SYSTEM = 'You help a documentary editor. From the interview lines, choose the ones that genuinely belong to the theme – clear, quotable lines first. Leave out lines that only share a word. Give each a score from 0 to 1 for how well it fits and a few words why. Only use ids from the list.';
  const FIND_PICK_SYSTEM = 'You help a documentary editor. From these interview lines, pick the ones that genuinely touch on the topic – directly or indirectly – and say in a few words why, with a score from 0 to 1 for how well it fits. Best first. Leave out lines that only share a word. Only use ids from the list.';
  const partOf = (k, n) => (n > 1 ? `\nThese are part ${k + 1} of ${n} of the interviews.` : '');
  const nameOfLine = l => (clipOfLine.get(l.id) || {}).name || '';
  /**
   * With AI: (1) words and phrases people use about the theme, (2) the lines to read (as many as How much the AI reads
   * allows), (3) the AI picks the lines that really fit, best first – in batches if there are many. Only the theme and
   * line text are sent. Falls back to offline if it picks none.
   */
  async function themeMatchesAI(theme, lines, { limit = 60, job, reads = readsFor('ownTheme') } = {}) {
    if (!US.ai || !US.ai.available()) throw new US.UserError('AI_KEY');
    job && job.set({ who: 'ai', msg: `${US.ai.label()} is thinking of ways people talk about “${theme}”` });
    const ex = await US.ai.json(expandRequest(theme, 'theme', 'Your own theme'));
    const queries = [theme].concat((ex.phrases || []).map(String).filter(Boolean).slice(0, 25));
    const cands = rankCandidates(queries, lines, reads);
    if (!cands.length) return [];
    const batches = SAI().pickRequests(cands.map(c => c.line), { all: lines, system: OWN_PICK_SYSTEM, feature: 'Your own theme', maxTokens: 4000,
      task: (k, n) => `Theme: ${theme}\nChoose up to ${limit} of the lines above, best first.${partOf(k, n)}` });
    if (batches.length > 1 && US.ai.approveTotal) await US.ai.approveTotal(SAI().cost(batches.map(b => b.req)).usd, `Your own theme “${theme}” (${batches.length} requests)`);
    job && job.set({ who: 'ai', msg: `${US.ai.label()} is choosing from ${US.plural(cands.length, 'line')}` });
    const r = await SAI().runPicks(batches, { limit, job, nameOf: nameOfLine, label: `choosing lines for “${theme}”` });
    const byId = new Map(cands.map(c => [c.line.id, c]));
    const out = r.picks.map(p => Object.assign({}, byId.get(p.line.id), { rel: p.rel, reasons: p.reasons }));
    if (!out.length) return themeMatches(theme, lines, { limit });
    out.missing = r.missing;
    return out;
  }
  /* ---------- your themes, found in the same pass as the others ---------- */
  /** “Gratitude, first day in Israel; faith” -> ['Gratitude', 'first day in Israel', 'faith'] (no repeats) */
  function splitThemes(text) {
    const seen = new Set(), key = x => SAI().normName(x);
    return String(text || '').split(/[,;\n]+/).map(x => x.trim().replace(/\s+/g, ' ')).filter(x => x && !seen.has(key(x)) && seen.add(key(x)));
  }
  /** The editor's themes for Find themes: what they typed (kept with the project), else the ones they added before. */
  function ownThemeNames() {
    if (!state) return [];
    if (Array.isArray(state.ownThemes)) return state.ownThemes.slice();
    // a theme made from picked lines (before 1.2 it wasn't marked: every line in it was added by hand) isn't looked for
    const picked = t => t.picked || (t.manual && t.manual.length && t.lineIds.every(id => t.manual.includes(id)));
    return splitThemes(state.themes.filter(t => t.custom && !picked(t)).map(t => t.query || t.name).join('\n'));
  }
  /**
   * Your themes from a Find themes pass ([{name, lineIds, scores?, summary?}]) into Story's themes: a theme you had
   * already keeps its colour, name and the lines you added by hand. -> the themes
   */
  function applyOwnThemes(found, by) {
    const norm = SAI().normName, used = state.themes.map(t => t.label).filter(x => x != null), claimed = new Set();
    return found.map(r => {
      const old = state.themes.find(t => t.custom && !claimed.has(t) && norm(t.query || t.name) === norm(r.name));
      if (old) claimed.add(old);
      const manual = old && old.manual ? old.manual.filter(id => lineById.has(id)) : [];
      const ids = Array.from(new Set(r.lineIds.filter(id => lineById.has(id)).concat(manual)));
      const scores = r.scores || Object.fromEntries(r.lineIds.map((id, i) => [id, +(1 - 0.8 * i / Math.max(1, r.lineIds.length - 1)).toFixed(3)]));
      const th = Object.assign(old || { id: US.uid('U'), custom: true, keywords: [], label: nextColour(used, strongLabel()) },
        { name: old ? old.name : US.cap(r.name), query: r.name, lineIds: ids, scores, summary: r.summary || '', by: r.searched ? 'you' : by });
      if (manual.length) th.manual = manual;
      used.push(th.label);
      return th;
    });
  }
  /**
   * Find themes: your own themes and the others in ONE pass over the lines you chose to work on (with AI, one read –
   * a theme of yours it finds nothing for gets Story's own search). Found themes are replaced; your other themes stay.
   */
  async function findAllThemes(job, { useAI = false, own = ownThemeNames() } = {}) {
    const lines = await linesInScope(job), ai = !!(useAI && US.ai && US.ai.available());
    let mine, found;
    if (ai) {
      const all = await SAI().findThemes(lines, { limit: readsFor('themes'), max: 10, job, nameOf: nameOfLine, own });
      mine = all.filter(t => t.own); found = all.filter(t => !t.own);
      Object.assign(found, { missing: all.missing, requests: all.requests });
      for (const t of mine) if (!t.lineIds.length) { const m = themeMatches(t.name, lines); Object.assign(t, { lineIds: m.map(x => x.line.id), scores: Object.fromEntries(m.map(x => [x.line.id, +x.rel.toFixed(3)])), searched: true }); }
    } else {
      job && job.set({ who: 'computer', msg: `Grouping ${US.plural(lines.length, 'line')}` }); await US.sleep(10);
      mine = own.map(name => { const m = themeMatches(name, lines); return { name, lineIds: m.map(x => x.line.id), scores: Object.fromEntries(m.map(x => [x.line.id, +x.rel.toFixed(3)])) }; });
      const taken = new Set(mine.flatMap(t => t.lineIds));
      found = T.themesOffline(lines.filter(l => !taken.has(l.id)), { max: 10 });
    }
    // a found theme with the same name as one of yours joins it
    const norm = SAI().normName;
    found = Object.assign(found.filter(t => { const m = mine.find(x => norm(x.name) === norm(t.name)); if (!m) return true; m.lineIds = Array.from(new Set(m.lineIds.concat(t.lineIds))); return false; }), { missing: found.missing, requests: found.requests });
    const yours = applyOwnThemes(mine, ai ? 'ai' : 'you');
    // another theme of yours with the same name (e.g. added twice) joins it, with the lines you added by hand
    const yourKey = new Map(yours.map(t => [norm(t.query || t.name), t]));
    const kept = state.themes.filter(t => {
      if (!t.custom || yours.includes(t)) return false;
      const same = !t.picked && yourKey.get(norm(t.query || t.name));
      if (!same) return true;
      const manual = (t.manual || []).filter(id => lineById.has(id));
      if (manual.length) { same.manual = Array.from(new Set((same.manual || []).concat(manual))); same.lineIds = Array.from(new Set(same.lineIds.concat(manual))); }
      return false;
    });
    // a found theme found again (same id) keeps its colour, a name you gave it and the lines you added by hand
    const olds = state.themes.filter(t => !t.custom), taken = new Set();
    for (const t of found) {
      const old = olds.find(o => !taken.has(o) && (o.id === t.id || norm(o.origName || o.name) === norm(t.name)));
      if (old) taken.add(old);
      t.origName = t.name;
      if (!old) continue;
      t.id = old.id;
      if (old.label != null) t.label = old.label;
      if (old.origName && old.name !== old.origName) t.name = old.name;
      const manual = (old.manual || []).filter(id => lineById.has(id));
      if (manual.length) { t.manual = manual; t.lineIds = Array.from(new Set(t.lineIds.concat(manual))); }
    }
    state.ownThemes = own.slice();
    state.themes = yours.concat(kept, found.map(t => Object.assign(t, { by: ai ? 'ai' : 'offline' })));
    ensureColours(); saveNow();
    return { yours, found, lines };
  }
  /** Add one more theme of yours without reading everything again (only lines that could be about it). */
  async function addCustomTheme(job, text, { useAI = false, limit } = {}) {
    const name = String(text || '').trim().replace(/\s+/g, ' ');
    if (!name) throw new US.UserError('BAD_INPUT', { title: 'Type a theme first.', action: 'For example “Gratitude” or “first day in Israel”.' });
    job && job.set({ who: useAI ? 'ai' : 'computer', msg: `Looking for lines about “${name}”` });
    const lines = await linesInScope(job);
    const matches = useAI && US.ai && US.ai.available() ? await themeMatchesAI(name, lines, { limit: limit || 60, job }) : themeMatches(name, lines, { limit: limit || 120 });
    if (matches.missing && matches.missing.length) US.ui.toast({ type: 'warn', title: 'Part of the interviews wasn’t read', text: SAI().missingNote(matches.missing), timeout: 15000 });
    const used = state.themes.map(t => t.label).concat(state.wall.columns.map(c => c.label)).filter(x => x != null);
    const th = { id: US.uid('U'), name: US.cap(name), custom: true, query: name, keywords: [], lineIds: matches.map(m => m.line.id), scores: Object.fromEntries(matches.map(m => [m.line.id, +m.rel.toFixed(3)])), by: useAI ? 'ai' : 'you', label: nextColour(used, strongLabel()) };
    state.themes.push(th);
    if (!ownThemeNames().some(x => x.toLowerCase() === name.toLowerCase())) state.ownThemes = ownThemeNames().concat(name);
    if (BOARD) state.wall.columns.push({ id: US.uid('c'), name: th.name, themeId: th.id, label: th.label, cards: effectiveLines(th).slice(0, 30).map(id => ({ lineId: id })) });
    saveNow();
    return th;
  }
  /** Look again for a theme you added (e.g. after more transcripts arrived); new matches are added at the end. */
  async function refreshCustomTheme(job, th, { useAI = false } = {}) {
    const q = th.query || th.name;
    const lines = await linesInScope(job);
    const matches = useAI && US.ai && US.ai.available() ? await themeMatchesAI(q, lines, { job }) : themeMatches(q, lines);
    th.scores = th.scores || {};
    for (const m of matches) th.scores[m.line.id] = Math.max(th.scores[m.line.id] || 0, +m.rel.toFixed(3));
    return addLinesToTheme(th, matches.map(m => m.line.id));
  }
  /** A theme (and wall column) from lines you picked. */
  function newThemeFrom(name, ids) {
    const used = state.themes.map(t => t.label).concat(state.wall.columns.map(c => c.label)).filter(x => x != null);
    const th = { id: US.uid('U'), name: US.cap(name || 'New theme'), custom: true, picked: true, query: name, keywords: [], lineIds: ids.filter(id => lineById.has(id)), manual: ids.filter(id => lineById.has(id)), by: 'you', label: nextColour(used, strongLabel()) };
    state.themes.push(th);
    if (BOARD) state.wall.columns.push({ id: US.uid('c'), name: th.name, themeId: th.id, label: th.label, cards: th.lineIds.map(id => ({ lineId: id })) });
    saveNow();
    return th;
  }
  /** Lines in/out of a theme; its wall column follows. Returns how many were added. */
  function addLinesToTheme(th, ids, { manual = false } = {}) {
    const have = new Set(th.lineIds);
    const add = ids.filter(id => lineById.has(id) && !have.has(id) && have.add(id));
    th.lineIds.push(...add);
    if (manual) { th.manual = Array.from(new Set((th.manual || []).concat(ids.filter(id => lineById.has(id))))); }
    const col = state.wall.columns.find(c => c.themeId === th.id);
    if (col) { const onWall = new Set(state.wall.columns.flatMap(c => c.cards.map(k => k.lineId))); add.filter(id => !onWall.has(id)).forEach(id => col.cards.push({ lineId: id })); }
    saveNow();
    return add.length;
  }
  function removeLineFromTheme(th, id) {
    th.lineIds = th.lineIds.filter(x => x !== id);
    if (th.manual) th.manual = th.manual.filter(x => x !== id);
    const col = state.wall.columns.find(c => c.themeId === th.id);
    if (col) col.cards = col.cards.filter(k => k.lineId !== id);
    saveNow();
  }

  /* ================= what to work on ================= */
  /* Themes, Find, Find more and Moments read the lines chosen here: every interview, some of them, or the lines heard
     in a sequence (e.g. the editor's selects) – optionally only between its In and Out points.
     state.scope = {kind: 'all'|'interviews'|'sequence', keys, seqId, seqName, inOut, ids, range, at} */
  function scopeOf() { return Object.assign({ kind: 'all', keys: [], ids: [] }, state && state.scope); }
  function scopeLines() {
    const s = scopeOf();
    if (s.kind === 'interviews') { const keys = new Set(s.keys); return state.transcripts.filter(t => keys.has(t.key)).flatMap(t => t.lines); }
    if (s.kind === 'sequence') { const ids = new Set(s.ids); return allLines().filter(l => ids.has(l.id)); }
    return allLines();
  }
  /** “All 12 interviews” · “3 of 12 interviews” · “Lines in “Selects v2” between In and Out” */
  function scopeLabel() {
    const s = scopeOf(), n = state.transcripts.length;
    if (s.kind === 'interviews') return `${s.keys.filter(k => state.transcripts.some(t => t.key === k)).length} of ${US.plural(n, 'interview')}`;
    if (s.kind === 'sequence') return `Lines in “${s.seqName || 'a sequence'}”${s.inOut ? ' between In and Out' : ''}`;
    return n === 1 ? 'The interview' : `All ${US.plural(n, 'interview')}`;
  }
  /** A sequence's In and Out points, or null when none are set (Premiere then reports the whole sequence). */
  function inOutOf(info) {
    const a = +info.inPoint, b = +info.outPoint, f = info.frame || 0.04;
    if (!isFinite(a) || !isFinite(b) || b <= a + f) return null;
    if (a < f && b >= (info.duration || 0) - f) return null;
    return [a, b];
  }
  /** The lines heard in the chosen sequence (read again each time: the cut changes). */
  async function refreshScope(job) {
    const s = scopeOf();
    if (s.kind !== 'sequence') return scopeLines();
    if (!s.seqId) throw new US.UserError('NO_SEQUENCE', { title: 'No sequence chosen to work on.', action: 'Choose one in Story › 1 Interviews › What to work on.' });
    const tl = await timelineTranscript(job, { seqId: s.seqId, tracks: 'auto' });
    const range = s.inOut ? inOutOf(tl.info) : null;
    if (s.inOut && !range) throw new US.UserError('NOTHING_FOUND', { title: `“${tl.info.name}” has no In and Out points.`, action: 'Mark In and Out in the Timeline (I and O), or untick “Only between In and Out”.' });
    const heard = tl.result.entries.filter(e => !range || (e.end > range[0] && e.start < range[1]));
    const ids = Array.from(new Set(heard.map(e => e.lineId)));
    if (!ids.length) throw new US.UserError('NOTHING_FOUND', { title: `No transcribed interview lines in “${tl.info.name}”${range ? ' between its In and Out points' : ''}.`, action: 'Check the sequence uses your transcribed interview clips, or choose another one.' });
    state.scope = Object.assign(s, { seqName: tl.info.name, ids, range, at: Date.now() });
    linesStamp++; saveNow();
    return scopeLines();
  }
  /** Choose what to work on. -> {lines, summary} */
  async function setScope(job, scope) {
    const prev = state.scope;
    state.scope = Object.assign({ kind: 'all', keys: [], ids: [] }, scope);
    linesStamp++;
    let lines;
    try { lines = await refreshScope(job); } catch (e) { state.scope = prev; linesStamp++; throw e; }   // a failed choice keeps the one before
    saveNow();
    const n = new Set(lines.map(l => (clipOfLine.get(l.id) || {}).key)).size;
    return { lines, summary: `${scopeLabel()}: ${US.plural(lines.length, 'line')} from ${US.plural(n, 'interview')}` };
  }
  /** The lines to read for Themes, Find more and Moments (the sequence is read again first). */
  async function linesInScope(job) {
    const lines = await refreshScope(job);
    if (!lines.length) throw new US.UserError('NOTHING_FOUND', { title: 'There are no lines to work on.', action: 'Choose what to work on in Story › 1 Interviews.' });
    return lines;
  }

  /* ================= find more (S4) ================= */
  /** Every line already chosen: in a theme or a narrative (or on the board, when it's on). */
  function selectedIds() {
    const set = new Set();
    for (const t of state.themes) if (t.name !== 'Other') t.lineIds.forEach(id => set.add(id));
    for (const c of state.wall.columns) if (BOARD || c.narrative) c.cards.forEach(k => k.lineId && set.add(k.lineId));
    if (BOARD) for (const l of state.wall.loose || []) if (l.card.lineId) set.add(l.card.lineId);
    return set;
  }
  /** Lines heard in a sequence (via the Timeline transcript mapping). */
  async function usedInSequence(job, seqId) {
    const tl = await timelineTranscript(job, { seqId, tracks: 'auto' });
    return new Set(tl.result.entries.map(e => e.lineId));
  }
  function hitReasons(hits) {
    const out = [];
    for (const x of hits || []) {
      if (x.how === 'phrase') out.push(`says “${x.term}”`);
      else if (x.how === 'word' || x.how === 'root') out.push(`mentions “${x.term}”`);
      else if (x.how === 'related') out.push(`related to “${x.term}”`);
      else if (x.how === 'sounds like') out.push(`sounds like “${x.term}”`);
    }
    return Array.from(new Set(out)).slice(0, 3);
  }
  /**
   * New lines on a topic that aren't selected yet. -> [{line, rel (0..1), reasons:[…]}], best first (with .missing when
   * part of a batched AI read failed). exclude: Set of line ids to leave out. With AI: related phrases, then the AI reads
   * as many lines as How much the AI reads allows (in batches if needed), picks and says why (text only).
   */
  async function findMore(job, topic, { useAI = false, exclude = new Set(), limit = 120, feature = 'Find more', reads = readsFor('findMore') } = {}) {
    if (!String(topic || '').trim()) throw new US.UserError('BAD_INPUT', { title: 'Type a topic first.', action: 'For example “community” or “the day we arrived”.' });
    const lines = (await linesInScope(job)).filter(l => !exclude.has(l.id));
    const ai = useAI && US.ai && US.ai.available();
    let queries = [topic];
    if (ai) {
      job && job.set({ who: 'ai', msg: `${US.ai.label()} is thinking of ways people talk about “${topic}”` });
      const ex = await US.ai.json(expandRequest(topic, 'topic', feature));
      queries = queries.concat((ex.phrases || []).map(String).filter(Boolean).slice(0, 25));
    }
    if (ai) {
      const cands = rankCandidates(queries, lines, reads);
      if (cands.length) {
        const batches = SAI().pickRequests(cands.map(c => c.line), { all: allLines(), system: FIND_PICK_SYSTEM, feature,
          task: (k, n) => `Topic: ${topic}\nPick up to ${limit} of the lines above.${partOf(k, n)}` });
        if (batches.length > 1 && US.ai.approveTotal) await US.ai.approveTotal(SAI().cost(batches.map(b => b.req)).usd, `${feature} “${topic}” (${batches.length} requests)`);
        job && job.set({ who: 'ai', msg: `${US.ai.label()} is checking ${US.plural(cands.length, 'line')}` });
        const r = await SAI().runPicks(batches, { limit, exclude, job, nameOf: nameOfLine, label: `finding more about “${topic}”` });
        if (r.picks.length) { const out = r.picks; out.missing = r.missing; return out; }
      }
    }
    const best = new Map();
    for (const q of queries) for (const r of T.search(q, lines, { limit: 150 })) {
      const had = best.get(r.line.id);
      if (!had || r.score > had.score) best.set(r.line.id, { line: r.line, score: r.score, reasons: hitReasons(r.hits).map(x => (q === topic ? x : `${x} (from “${q}”)`)) });
    }
    let cands = Array.from(best.values()).sort((a, b) => b.score - a.score).slice(0, 200);
    if (!cands.length) return [];
    const top = cands[0].score;
    cands = cands.map(c => Object.assign(c, { rel: c.score / top }));
    return cands.filter(c => c.rel >= 0.15).slice(0, limit).map(c => ({ line: c.line, rel: c.rel, reasons: c.reasons }));
  }

  /* ================= how much the AI reads ================= */
  /** The project's choice for a feature (themes | ownTheme | findMore | narrative): a number of lines, or Infinity. */
  function readsFor(f) { return SAI().fromStored(((state && state.aiReads) || {})[f], f); }
  function setReads(f, n) { state.aiReads = Object.assign({}, state.aiReads, { [f]: SAI().toStored(n) }); saveNow(); }
  let byQuality = null, planCache = new Map();
  /** Stand-in lines for estimates: the n strongest (the real ones depend on the topic, but cost about the same). */
  function strongest(n) {
    if (!byQuality || byQuality.stamp !== linesStamp) byQuality = { stamp: linesStamp, list: scopeLines().slice().sort((a, b) => T.indexLine(b).q - T.indexLine(a).q) };
    return n === Infinity ? byQuality.list : byQuality.list.slice(0, n);
  }
  /**
   * Every request a feature would make with the AI reading n lines, and what that costs and takes.
   * -> {requests, usd, free, name, secs, lines, all, total}
   */
  function readsPlan(feature, n) {
    const key = [feature, n, linesStamp, US.ai && US.ai.label ? US.ai.label() : '', feature === 'themes' ? ownThemeNames().join(';') : ''].join('|');
    if (planCache.has(key)) return planCache.get(key);
    const all = scopeLines();
    let reqs = [], lines = 0;
    if (feature === 'themes') {
      const p = SAI().themesRequests(all, { limit: n, max: 10, own: ownThemeNames() });
      reqs = p.batches.map(b => b.req).concat(p.merge ? [p.merge] : []); lines = p.pool.length;
    } else if (feature === 'ownTheme' || feature === 'findMore') {
      const c = strongest(n), own = feature === 'ownTheme';
      reqs = [expandRequest('example', own ? 'theme' : 'topic', '')].concat(SAI().pickRequests(c, { all, system: own ? OWN_PICK_SYSTEM : FIND_PICK_SYSTEM, task: () => 'Topic: an example topic\nPick up to 120 of the lines above.', feature: '' }).map(b => b.req));
      lines = c.length;
    } else {
      const brief = { topic: 'an example topic', seconds: 60, tone: '' }, L = lookOptions();
      const asPool = ls => ls.map(l => ({ id: l.id, strength: T.indexLine(l).q }));
      const narr = ls => N().aiRequest(asPool(ls), brief, { handles: L.handles, lineOf: id => lineById.get(id), speakerName, interviewName: interviewLabel });
      const c = n <= 150 ? strongest(200) : strongest(n);
      reqs = [expandRequest('example', 'topic', '')].concat(SAI().pickRequests(c, { all, system: n <= 150 ? FIND_PICK_SYSTEM : SHORTLIST_SYSTEM, task: () => 'Brief: an example topic\nPick up to 60 of the lines above.', feature: '' }).map(b => b.req), [narr(strongest(Math.min(n, 120)))]);
      lines = n <= 150 ? Math.min(n, all.length) : c.length;
    }
    const p = Object.assign(SAI().cost(reqs), { lines, all: n === Infinity || n >= all.length, total: all.length });
    if (planCache.size > 50) planCache.clear();
    planCache.set(key, p);
    return p;
  }

  /** Project clips (once per action). */
  async function projectClips(paths) { return US.host.call('storyClips', paths ? { paths } : {}); }
  /** path -> itemId for these transcripts; prefers master clips over subclips. */
  async function resolveItems(transcripts) {
    const paths = Array.from(new Set(transcripts.map(t => t.path).filter(Boolean)));
    const clips = paths.length ? await projectClips(paths) : [];
    const byPath = new Map();
    for (const c of clips) { const had = byPath.get(c.path); if (!had || (had.sub && !c.sub)) byPath.set(c.path, c); }
    const out = new Map();
    let all = null; // fallback: same file name anywhere in the project (media moved, or reached through another folder/link)
    for (const t of transcripts) {
      let c = t.path ? byPath.get(t.path) : null;
      if (!c && (t.path || t.name)) {
        if (!all) all = (await projectClips()).filter(x => !x.sub);
        const base = US.basename(t.path || t.name).toLowerCase();
        c = all.find(x => x.id === t.itemId) || all.find(x => US.basename(x.path).toLowerCase() === base) || null;
      }
      if (c) { out.set(t.key, c.id); t.itemId = c.id; }
      else if (t.itemId) out.set(t.key, t.itemId);
    }
    return out;
  }

  /* ================= building in Premiere ================= */
  /** How the build looks in the timeline (from Settings, shared by the Wall, Themes and the Assistant). */
  function lookOptions() {
    let names = US.settings.get('story.themeNames');
    if (!names) names = US.settings.get('story.markers', true) === false ? 'none' : 'marker';
    return {
      handles: US.settings.get('story.handles', 0.3),
      colour: US.settings.get('story.colourThemes', true),
      strong: { highlight: US.settings.get('story.strongHighlight', false), label: strongLabel(), first: US.settings.get('story.strongFirst', false) },
      themeNames: names, // 'marker' | 'layer' | 'both' | 'none'
      method: US.settings.get('story.colourMethod', 'relabel') // 'relabel' (verified) | 'subclips'
    };
  }
  /**
   * Pure plan: groups [{name, label, lineIds, pinned:Set, labels?:{lineId: label}, trims?:{lineId: {start, end}}}]
   * -> {clips:[{lineId, group, id, in, out, label, strong, name}], skipped}.
   * A strongest line takes the highlight colour (when on); otherwise its own colour (labels) or its theme's colour (when on).
   * A trimmed line (a narrative tightened by a few words) uses its trimmed times.
   */
  function planBuild(groups, { handles = 0.3, colour = true, strong = {}, itemFor, durOf = () => Infinity } = {}) {
    const clips = []; let skipped = 0;
    groups.forEach((g, gi) => {
      let ids = g.lineIds.filter(id => lineById.has(id));
      if (strong.first) ids = strongestFirst(ids, g.pinned || new Set());
      ids.forEach((id, k) => {
        const l = lineById.get(id), itemId = itemFor(id);
        if (!itemId) { skipped++; return; }
        const st = isStrong(l), own = g.labels && g.labels[id] != null ? g.labels[id] : g.label, tr = g.trims && g.trims[id];
        const label = strong.highlight && st ? strong.label : colour && own != null ? own : null;
        const words = l.text.split(/\s+/).slice(0, 6).join(' ').replace(/[\\/:*?"<>|]/g, '');
        clips.push({ lineId: id, group: gi, id: itemId, in: Math.max(0, (tr ? tr.start : l.start) - handles), out: Math.min(durOf(itemId) || Infinity, (tr ? tr.end : l.end) + handles), label, strong: st, name: `${st && strong.highlight ? '★ ' : ''}${g.name ? g.name + ' ' : ''}${String(k + 1).padStart(2, '0')} – ${words}…` });
      });
    });
    return { clips, skipped };
  }
  /** Theme sections from what was placed: [{name, label, start, end}] in timeline order. */
  function sectionsFrom(groups, clips) {
    const out = [];
    groups.forEach((g, gi) => {
      const placed = clips.filter(c => c.group === gi && c.placed);
      if (!placed.length || !g.name) return;
      out.push({ name: g.name, label: g.label, start: placed[0].placed.start, end: placed[placed.length - 1].placed.end });
    });
    return out;
  }

  /**
   * Lay lines into a new sequence. groups: [{name, label, lineIds, pinned}]. look: lookOptions().
   * Returns {summary, seq, notes}.
   */
  async function buildSequence(job, { name, groups, look = lookOptions() }) {
    const ids = groups.flatMap(g => g.lineIds).filter(id => lineById.has(id));
    if (!ids.length) throw new US.UserError('NOTHING_FOUND', { title: 'There are no lines to build from.', action: 'Add some cards to the board (or pick lines in Search) first.' });
    job.set({ who: 'premiere', msg: 'Finding the interview clips in your project' });
    const ts = Array.from(new Set(ids.map(id => clipOfLine.get(id))));
    const items = await resolveItems(ts);
    if (!ts.some(t => items.has(t.key))) throw new US.UserError('NOT_FOUND', { title: 'None of these interviews are in the project.', action: 'Link each transcript to its clip in Story › 1 Interviews › Interviews and speakers, then try again.', detail: ts.map(t => t.name).join(', ') });
    const infos = await US.host.call('itemsInfo', { ids: Array.from(new Set(Array.from(items.values()))) });
    const durById = new Map(infos.filter(Boolean).map(i => [i.id, i.duration]));
    const plan = planBuild(groups, { handles: look.handles, colour: look.colour, strong: look.strong, itemFor: id => items.get(clipOfLine.get(id).key), durOf: id => durById.get(id) });
    if (!plan.clips.length) throw new US.UserError('NOT_FOUND', { title: 'None of these lines’ interviews are in the project.', action: 'Link each transcript to its clip in Story › 1 Interviews › Interviews and speakers, then try again.' });
    const seq = await US.host.call('newSequence', { name, binPath: binBase(), likeId: plan.clips[0].id });
    job.log(`Made sequence “${seq.name}”`);
    let cursor = 0;
    const total = plan.clips.length;
    for (let i = 0; i < total; i += 6) {
      job.check();
      const chunk = plan.clips.slice(i, i + 6);
      const g = groups[chunk[0].group];
      job.progress(i / total * 0.85, `Placing line ${i + 1} of ${total}${g && g.name ? ' · ' + g.name : ''}`);
      const r = await US.host.call('storyPlace', { seqId: seq.id, cursor, method: look.method, binPath: `${binBase()}/Story clips – ${seq.name}`, clips: chunk.map(c => ({ id: c.id, in: c.in, out: c.out, label: c.label, name: c.name })) });
      chunk.forEach((c, k) => { c.placed = r.placed[k]; });
      cursor = r.cursor;
    }
    const placedN = plan.clips.filter(c => c.placed).length;
    state.builds = (state.builds || []).filter(b => b.seqId !== seq.id).concat([{ seqId: seq.id, name: seq.name, lineIds: plan.clips.filter(c => c.placed).map(c => c.lineId), at: Date.now() }]).slice(-30);
    saveNow();
    const sections = sectionsFrom(groups, plan.clips);
    const markers = [], notes = [];
    if (look.themeNames === 'marker' || look.themeNames === 'both') for (const s of sections) markers.push({ start: s.start, name: s.name, color: s.label != null && look.colour ? LABEL_TO_MARKER[s.label] : 2 });
    // idea notes on the board become markers where they sit
    let lastEnd = 0;
    groups.forEach((g, gi) => {
      const inG = plan.clips.filter(c => c.group === gi && c.placed);
      for (const idea of g.ideas || []) {
        const next = idea.before ? inG.find(c => c.lineId === idea.before) : null;
        markers.push({ start: next ? next.placed.start : inG.length ? inG[inG.length - 1].placed.end : lastEnd, name: 'Idea: ' + idea.text.slice(0, 60), comment: idea.text, color: 5 });
      }
      if (inG.length) lastEnd = inG[inG.length - 1].placed.end;
    });
    // a marker on each clip that says what it is (moments: “Funny – laughter”), in its group's colour
    for (const c of plan.clips) { const mk = c.placed && groups[c.group] && groups[c.group].lineMarks && groups[c.group].lineMarks[c.lineId]; if (mk) markers.push({ start: c.placed.start, end: c.placed.end, name: mk.name, comment: mk.comment || '', color: look.colour && groups[c.group].label != null ? LABEL_TO_MARKER[groups[c.group].label] : 5 }); }
    if (look.strong.highlight) for (const c of plan.clips) if (c.strong && c.placed) { const l = lineById.get(c.lineId); markers.push({ start: c.placed.start, end: c.placed.end, name: '★ Strongest', comment: l.text.slice(0, 200), color: LABEL_TO_MARKER[look.strong.label] }); }
    if (markers.length) { job.set({ msg: 'Adding markers' }); await US.host.call('addSequenceMarkers', { seqId: seq.id, markers }); }
    if ((look.themeNames === 'layer' || look.themeNames === 'both') && sections.length) {
      job.progress(0.92, 'Labelling the themes above the clips');
      try {
        const lr = await US.host.call('storyThemeLayers', { seqId: seq.id, binPath: binBase(), create: US.settings.get('story.makeLabelClips', true), sections: sections.map(s => ({ name: s.name, start: s.start, end: s.end, label: look.colour ? s.label : null })) });
        if (lr.kind === 'transparent') notes.push('No adjustment layer in this project – used invisible label clips instead. Add one with File › New › Adjustment Layer and Ultra Studio will use it.');
        if (lr.renamed < lr.placed) notes.push(`Premiere didn’t take the theme name on ${US.plural(lr.placed - lr.renamed, 'label clip')}.`);
        if (lr.log && lr.log.length) job.log('Theme layer notes', lr.log.join('\n'));
      } catch (e) { const x = US.errors.explain(e); notes.push(`${x.title} ${x.action}`); job.log('Theme layer failed', x.detail); }
    }
    await US.host.call('openSequence', { seqId: seq.id });
    job.progress(1);
    if (notes.length) US.ui.toast({ type: 'info', title: 'Built – one thing to know', text: notes.join(' '), timeout: 15000 });
    const skipped = plan.skipped + (total - placedN);
    return { seq, notes, summary: `Built “${seq.name}” · ${US.plural(placedN, 'line')} · ${US.fmtDur(cursor)}${skipped ? ` (${skipped} skipped: clip not in project)` : ''}` };
  }

  /** A bin of subclips per theme, best first, in the theme's colour (strongest lines in the highlight colour, starred). */
  async function sortIntoBins(job, { themes, perTheme = 0, sequences = false, look = lookOptions() }) {
    const use = themes.filter(t => t.lineIds.length);
    if (!use.length) throw new US.UserError('NOTHING_FOUND', { title: 'There are no themes yet.', action: 'Press “Find themes” first.' });
    const pick = th => { const ids = effectiveLines(th); return (look.strong.first ? strongestFirst(ids) : ids).slice(0, perTheme > 0 ? perTheme : ids.length); };
    const ts = Array.from(new Set(use.flatMap(pick).map(id => clipOfLine.get(id)).filter(Boolean)));
    job.set({ who: 'premiere', msg: 'Finding the interview clips in your project' });
    const items = await resolveItems(ts);
    const infos = await US.host.call('itemsInfo', { ids: Array.from(new Set(Array.from(items.values()))) });
    const durById = new Map(infos.filter(Boolean).map(i => [i.id, i.duration]));
    const total = use.reduce((n, t) => n + pick(t).length, 0);
    let done = 0, made = 0;
    for (let ti = 0; ti < use.length; ti++) {
      const th = use[ti];
      const lines = pick(th).map(id => lineById.get(id)).filter(Boolean);
      for (let i = 0; i < lines.length; i += 10) {
        job.check();
        const chunk = lines.slice(i, i + 10);
        const subs = [];
        chunk.forEach((l, k) => {
          const itemId = items.get(clipOfLine.get(l.id).key); if (!itemId) return;
          const st = look.strong.highlight && isStrong(l);
          const rank = String(i + k + 1).padStart(2, '0');
          const words = l.text.split(/\s+/).slice(0, 7).join(' ').replace(/[\\/:*?"<>|]/g, '');
          const label = st ? look.strong.label : look.colour ? th.label : null;
          subs.push(Object.assign({ id: itemId, start: Math.max(0, l.start - look.handles), end: Math.min(durById.get(itemId) || Infinity, l.end + look.handles), name: `${st ? '★ ' : ''}${rank} ${speakerName(l.speaker)} – ${words}…` }, label != null ? { label } : {}));
        });
        job.progress(done / total * (sequences ? 0.7 : 1), `Theme ${ti + 1} of ${use.length} · ${th.name}`);
        if (subs.length) { await US.host.call('createSubclips', { items: subs, binPath: `${binBase()}/Selects – ${th.name}` }); made += subs.length; }
        done += chunk.length;
      }
    }
    if (sequences) {
      for (let ti = 0; ti < use.length; ti++) {
        job.range(0.7 + 0.3 * ti / use.length, 0.7 + 0.3 * (ti + 1) / use.length);
        await buildSequence(job, { name: `Selects – ${use[ti].name}`, groups: [{ name: use[ti].name, label: use[ti].label, lineIds: pick(use[ti]) }], look });
      }
    }
    return { summary: `${US.plural(made, 'subclip')} in ${US.plural(use.length, 'theme bin')}${sequences ? ' + a sequence per theme' : ''}` };
  }

  /* ================= timeline transcript ================= */
  const TL = () => US.storyTimeline, EX = () => US.storyExport;
  /** transcript for a timeline clip: same media file, else same file name */
  function transcriptLookup() {
    const byPath = new Map(), byBase = new Map();
    for (const t of state.transcripts) { if (t.path) byPath.set(t.path, t); byBase.set(US.basename(t.path || t.name).toLowerCase(), t); }
    return c => (c.path && byPath.get(c.path)) || byBase.get(US.basename(c.path || c.name || '').toLowerCase()) || null;
  }
  /** Read a sequence and work out who says what. tracks: 'auto' or audio track indexes. */
  async function timelineTranscript(job, { seqId, tracks = 'auto', info = null }) {
    loadState();
    if (!info) {
      job && job.set({ who: 'premiere', msg: 'Reading the sequence' });
      info = await US.host.call('sequenceInfo', { seqId });
      info.timing = await US.host.call('storySequenceTiming', { seqId });
    }
    const find = transcriptLookup();
    const collected = TL().collectClips(info, { tracks, hasTranscript: c => !!find(c) });
    const result = TL().build(collected.clips, find);
    return { info, tracks, collected, result };
  }
  function namesFor(tl) { if (!state.whoIsWho) state.whoIsWho = {}; return TL().displayNames(tl.result.speakers, state.whoIsWho); }
  const fileSafe = n => String(n).replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim().slice(0, 80) || 'Transcript';
  function uniquePath(f) {
    if (US.encoder && US.encoder.unique) return US.encoder.unique(f);
    if (!US.fsx.exists(f)) return f;
    const ext = path.extname(f), base = f.slice(0, -ext.length);
    for (let i = 2; ; i++) if (!US.fsx.exists(`${base} ${i}${ext}`)) return `${base} ${i}${ext}`;
  }
  function openFile(f, reveal) {
    const cp = require('child_process');
    if (US.fsx.isWin) cp.exec(reveal ? `explorer /select,"${f}"` : `start "" "${f}"`);
    else cp.execFile('open', reveal ? ['-R', f] : [f]);
  }
  /** Write the transcript as docx | txt | srt | csv. Returns {file, summary}. */
  async function exportTimeline(job, tl, format = 'docx') {
    const display = namesFor(tl), E = EX(), timing = tl.info.timing || { zero: 0, fps: tl.info.fps || 25, drop: false };
    const entries = tl.result.entries;
    if (!entries.length) throw new US.UserError('NOTHING_FOUND', { title: 'There’s nothing to export yet.', action: 'None of the clips in this sequence have transcripts – see the list on the Timeline tab.' });
    const ids = Array.from(new Set(entries.map(e => e.itemId).filter(Boolean)));
    job && job.set({ who: 'premiere', msg: 'Reading source timecodes' });
    const itemTiming = ids.length ? await US.host.call('storyTiming', { ids }) : {};
    const seqTC = sec => E.tc(timing.zero + sec, { fps: timing.fps, drop: timing.drop });
    const srcTC = (e, sec) => { const it = itemTiming[e.itemId]; return it ? E.tc(it.start + sec, { fps: it.fps, drop: it.drop }) : E.tc(sec, { fps: timing.fps }); };
    const t = {
      title: `Transcript – ${tl.info.name}`, sequence: tl.info.name, project: US.ctx.project ? US.ctx.project.name : '',
      date: new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }),
      speakers: TL().people(tl.result.speakers, display),
      paragraphs: TL().paragraphs(entries, display),
      entries: entries.map(e => Object.assign({}, e, { name: display.get(e.speakerKey) })),
      seqTC, srcTC
    };
    const body = format === 'docx' ? E.toDocx(t) : format === 'srt' ? E.toSRT(t) : format === 'csv' ? E.toCSV(t) : E.toText(t);
    const dir = US.fsx.ensureDir(US.settings.get('story.exportDir') || path.join(US.fsx.exportsDir(), 'Transcripts'));
    const d = new Date(), stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const file = uniquePath(path.join(dir, `${fileSafe(tl.info.name)} ${stamp}.${E.EXT[format] || 'txt'}`));
    require('fs').writeFileSync(file, body);
    return { file, summary: `Saved “${US.basename(file)}” · ${US.plural(t.paragraphs.length, 'paragraph')} · ${US.plural(t.speakers.length, 'speaker')}` };
  }

  /** The board as a paper edit (docx | txt | csv): every group in its order with its lines (speaker, clip, source
      timecodes, trims, notes) and idea cards; hidden cards are left out. Returns {file, summary}. */
  /**
   * The paper edit: a document of lines in order, group by group, with speakers and source timecodes. source: 'themes'
   * (every theme in order, as How picky chooses), 'narrative' (a narrative made from a brief: narrative = its id, empty
   * = the newest) or 'board'.
   */
  async function exportBoard(job, format = 'docx', { source = BOARD ? 'board' : 'themes', narrative = '' } = {}) {
    loadState(); B().ensure(state.wall); ensureColours();
    const E = EX(), keep = k => !k.hidden && (k.idea != null || lineById.has(k.lineId));
    let groups;
    if (source === 'narrative') {
      const col = latestNarrative(narrative);
      if (!col) throw new US.UserError('NOTHING_FOUND', { title: 'There’s no narrative yet.', action: 'Make one in Story › 4 Build › Narrative from a brief.' });
      groups = [{ name: col.name, label: columnLabel(col), cards: col.cards.filter(keep) }];
    } else if (source === 'board') {
      groups = state.wall.columns.map(c => ({ name: c.name, label: columnLabel(c), cards: c.cards.filter(keep) }));
      if (state.wall.loose.length) groups.push({ name: 'Not in a group', label: null, cards: state.wall.loose.map(l => l.card).filter(keep) });
    } else groups = themeGroups().map(g => ({ name: g.name, label: g.label, cards: g.lineIds.map(id => ({ lineId: id })) }));
    const used = groups.filter(g => g.cards.length);
    if (!used.some(g => g.cards.some(k => k.idea == null))) throw new US.UserError('NOTHING_FOUND', source === 'board' ? { title: 'The board has no lines on it yet.', action: 'Put your themes on the board, or tick lines in Find and press “Add to board”.' } : { title: 'Your themes have no lines yet.', action: 'Find themes first (Story › 2 Themes), or choose a less picky setting.' });
    job && job.set({ who: 'premiere', msg: 'Reading source timecodes' });
    const ts = Array.from(new Set(used.flatMap(g => g.cards.filter(k => k.lineId).map(k => clipOfLine.get(k.lineId))).filter(Boolean)));
    const items = await resolveItems(ts), ids = Array.from(new Set(items.values()));   // by file path: clip ids go stale
    const timing = ids.length ? await US.host.call('storyTiming', { ids }) : {};
    const card = k => {
      if (k.idea != null) return { idea: k.idea };
      const l = lineById.get(k.lineId), t = clipOfLine.get(k.lineId), tr = trimOf(k), a = tr ? tr.start : l.start, b = tr ? tr.end : l.end;
      const it = t && timing[items.get(t.key)], src = sec => (it ? E.tc(it.start + sec, { fps: it.fps, drop: it.drop }) : E.tc(sec));
      const who = speakerName(l.speaker);
      return { speaker: who === speakerName('') ? '' : who, interview: interviewLabel(k.lineId), clip: t ? t.name : '', srcIn: src(a), srcOut: src(b), dur: b - a, text: tr ? tr.text : l.text, strong: isStrong(l), note: k.note || '' };
    };
    const project = US.ctx.project ? US.ctx.project.name.replace(/\.prproj$/i, '') : '';
    const doc = { title: 'Paper edit', project, date: new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }),
      groups: used.map(g => ({ name: g.name, colour: g.label != null ? labelName(g.label) : '', hex: g.label != null ? labelHex(g.label) : '', cards: g.cards.map(card) })) };
    const body = format === 'csv' ? E.paperCSV(doc) : format === 'txt' ? E.paperText(doc) : E.paperDocx(doc);
    const dir = US.fsx.ensureDir(US.settings.get('story.exportDir') || path.join(US.fsx.exportsDir(), 'Transcripts'));
    const d = new Date(), stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const file = uniquePath(path.join(dir, `${fileSafe(project || 'Story')} - paper edit ${stamp}.${E.EXT[format] || 'docx'}`));
    require('fs').writeFileSync(file, body);
    return { file, summary: `Saved “${US.basename(file)}” · ${E.paperSummary(doc)}` };
  }

  /* ---------- interview log ---------- */
  const SUMMARY_SCHEMA = { type: 'object', additionalProperties: false, required: ['summary'], properties: { summary: { type: 'string' } } };
  // a summary is kept while the lines and the speakers' names are the same
  const summarySig = t => `${t.lines.length}:${t.lines.length ? t.lines[t.lines.length - 1].end.toFixed(1) : 0}:${Array.from(new Set(t.lines.map(l => speakerName(l.speaker)))).join('|')}`;
  const SUMMARY_CHARS = 200000;
  function summaryRequest(t) {
    const all = t.lines.map(l => `${speakerName(l.speaker)}: ${l.text}`).join('\n'), text = all.slice(0, SUMMARY_CHARS);
    return {
      system: 'You write logging notes for a documentary editor, in plain British English.',
      user: `Interview “${t.name}” (speaker: text):\n${text}${text.length < all.length ? '\n[The transcript is cut short here.]' : ''}\n\nIn two or three plain sentences, say who is speaking (if it is clear) and what they talk about: the main topics and any stand-out story. No preamble, no lists.`,
      schema: SUMMARY_SCHEMA, maxTokens: 600, effort: 'low', fast: true, feature: 'Interview summaries'
    };
  }
  /** What summarising would cost: {todo, usd, free, name} (interviews already summarised and unchanged are kept). */
  function summaryPlan(list = state.transcripts) {
    const todo = list.filter(t => t.lines.length && !(t.summary && t.summary.sig === summarySig(t)));
    const est = todo.map(t => US.ai.estimateFor(summaryRequest(t)));
    return { todo, usd: est.reduce((n, e) => n + (e.usd || 0), 0), free: !est.length || est.every(e => e.free), name: est[0] ? est[0].name : '' };
  }
  /** A short AI summary of each interview, kept with its transcript and made again only when its lines change. */
  async function summarise(job, list) {
    const plan = summaryPlan(list);
    if (!plan.todo.length) return { made: 0, failed: 0 };
    if (!plan.free && US.ai.approveTotal) await US.ai.approveTotal(plan.usd, `Summarising ${US.plural(plan.todo.length, 'interview')}`);
    let done = 0, failed = 0, stop = null;
    try {
      await US.pool(plan.todo, 3, async t => {
        if (stop) return;
        try {
          job && job.check();
          const r = await SAI().ask(summaryRequest(t));
          if (r && r.summary) t.summary = { text: String(r.summary).trim(), sig: summarySig(t), by: US.ai.label(), at: Date.now() }; else failed++;
        } catch (e) { if (e && e.code === 'AI_REFUSED') failed++; else { stop = stop || e; return; } }
        done++; if (!stop && job) job.set({ who: 'ai' }).progress(done / plan.todo.length * 0.8, `Summarising the interviews · ${done} of ${plan.todo.length}`);
      });
    } finally { saveNow(); }
    if (stop) throw stop;
    return { made: done - failed, failed };
  }
  /** The interview log (docx | csv | txt): per interview its speakers, length, summary (AI, optional), the themes it
      feeds with counts and first timecode, its strongest lines, its moments and (optionally) the whole transcript. */
  async function interviewLog(job, { summaries = false, full = false, format = 'docx' } = {}) {
    loadState();
    const list = state.transcripts.filter(t => t.lines.length);
    if (!list.length) throw new US.UserError('NOTHING_FOUND', { title: 'There are no transcripts in Story yet.', action: 'Read Premiere’s transcripts first (Story › 1 Interviews).' });
    const E = EX();
    let note = '';
    if (summaries && US.ai && US.ai.available()) {
      // the log is worth having without summaries: a declined cost, a spending limit or an AI failure only leaves them out
      try { const x = await summarise(job, list); if (x.failed) note = ` (${US.plural(x.failed, 'summary', 'summaries')} couldn’t be made – try again later)`; }
      catch (e) { if (job && job.cancelled) throw e; const x = US.errors.explain(e); note = `: ${x.title.replace(/\.$/, '')}`; US.log('warn', 'Interview log: summaries stopped – ' + x.title, x.detail, 'story'); }
    }
    job && job.set({ who: 'premiere' }).progress(0.85, 'Reading source timecodes');
    const items = await resolveItems(list), ids = Array.from(new Set(items.values()));
    const timing = ids.length ? await US.host.call('storyTiming', { ids }) : {};
    const themes = state.themes.filter(th => th.name !== 'Other'), moments = (state.moments && state.moments.list) || [];
    const shown = new Set(pickMoments(moments).map(m => m.lineId));   // as picky as the Moments list; then the best 5 per interview
    const interviews = list.map(t => {
      const it = timing[items.get(t.key)], at = sec => (it ? E.tc(it.start + sec, { fps: it.fps, drop: it.drop }) : E.tc(sec));
      const mine = new Set(t.lines.map(l => l.id)), talk = new Map();
      for (const l of t.lines) talk.set(speakerName(l.speaker), (talk.get(speakerName(l.speaker)) || 0) + (l.end - l.start));
      const names = Array.from(talk.keys()).sort((a, b) => talk.get(b) - talk.get(a));
      const topics = themes.map(th => {
        const ls = effectiveLines(th).filter(id => mine.has(id)).map(id => lineById.get(id)).filter(Boolean);   // as How picky chooses
        return ls.length ? { name: th.name, hex: labelHex(th.label), count: ls.length, at: at(Math.min(...ls.map(l => l.start))) } : null;
      }).filter(Boolean).sort((a, b) => b.count - a.count);
      const best = t.lines.filter(isStrong).map(l => ({ l, q: T.quality(l).score })).sort((a, b) => b.q - a.q).slice(0, 5)
        .map(({ l }) => ({ at: at(l.start), dur: l.end - l.start, speaker: speakerName(l.speaker), text: l.text }));
      const ms = moments.filter(m => mine.has(m.lineId) && shown.has(m.lineId)).sort((a, b) => b.score - a.score).slice(0, 5).map(m => { const l = lineById.get(m.lineId); const ty = MO().TYPES[m.type]; return l && { type: ty ? ty.name : m.type, at: at(l.start), start: l.start, text: l.text, why: (m.reasons || [])[0] || '' }; })
        .filter(Boolean).sort((a, b) => a.start - b.start);
      const unnamed = names.length === 1 && names[0] === speakerName('');   // no speakers in this transcript: no labels
      let transcript = null;
      if (full) {
        transcript = [];
        for (const l of t.lines) {
          const who = unnamed ? '' : speakerName(l.speaker), last = transcript[transcript.length - 1];
          if (last && last.speaker === who && l.start - last.start < 60) last.text += ' ' + l.text;
          else transcript.push({ at: at(l.start), start: l.start, speaker: who, text: l.text });
        }
      }
      return { number: state.transcripts.indexOf(t) + 1, name: t.name, speakers: unnamed ? '' : names.join(', '), length: Math.max(...t.lines.map(l => l.end)),
        summary: t.summary && t.summary.sig === summarySig(t) ? t.summary.text : '', summaryBy: t.summary ? t.summary.by : '', topics, best, moments: ms, transcript };
    });
    const project = US.ctx.project ? US.ctx.project.name.replace(/\.prproj$/i, '') : '';
    const doc = { title: 'Interview log', project, date: new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }), interviews };
    const body = format === 'csv' ? E.logCSV(doc) : format === 'txt' ? E.logText(doc) : E.logDocx(doc);
    const dir = US.fsx.ensureDir(US.settings.get('story.exportDir') || path.join(US.fsx.exportsDir(), 'Transcripts'));
    const d = new Date(), stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const file = uniquePath(path.join(dir, `${fileSafe(project || 'Story')} - interview log ${stamp}.${E.EXT[format] || 'docx'}`));
    require('fs').writeFileSync(file, body);
    const summed = interviews.filter(i => i.summary).length;
    if (note) note = ` (${summed ? 'not every interview has a summary' : 'no summaries'}${note})`;
    return { file, summary: `Saved “${US.basename(file)}” · ${E.logSummary(doc)}${summed ? ` · ${US.plural(summed, 'summary', 'summaries')}` : ''}${note}` };
  }

  const CAP = () => US.storyCaptions;
  /** Premiere captions for a sequence from its timeline transcript. opts: {style, names, upper, add} -> {file, count, summary} */
  async function makeCaptions(job, tl, { style = 'subtitles', names = false, upper = false, add = true, target = null } = {}) {
    const display = namesFor(tl), entries = tl.result.entries.map(e => Object.assign({}, e, { name: display.get(e.speakerKey) }));
    if (!entries.length) throw new US.UserError('NOTHING_FOUND', { title: 'There’s no transcribed speech in this sequence.', action: 'Transcribe the clips you used, read Premiere’s transcripts, then try again.' });
    const cues = CAP().cues(entries, { style, names, upper });
    const dir = US.fsx.ensureDir(path.join(US.settings.get('story.exportDir') || path.join(US.fsx.exportsDir(), 'Transcripts'), 'Captions'));
    const file = uniquePath(path.join(dir, `${fileSafe(tl.info.name)} - ${CAP().STYLES[style].label.toLowerCase()} captions.srt`));
    require('fs').writeFileSync(file, CAP().toSRT(cues));
    if (add) {
      job && job.set({ who: 'premiere' }).progress(0.7, `Adding ${US.plural(cues.length, 'caption')} to “${tl.info.name}”`);
      await US.host.call('storyCaptions', { seqId: target || tl.info.id, srt: file, binPath: binBase() + '/Captions' });
    }
    return { file, count: cues.length, summary: add ? `${US.plural(cues.length, 'caption')} added to “${tl.info.name}” (${CAP().STYLES[style].label.toLowerCase()})` : `Saved “${US.basename(file)}” · ${US.plural(cues.length, 'caption')}` };
  }

  /* ================= promo: a narrative with B-roll, captions and a vertical version ================= */
  /**
   * Build a narrative group, cover its jump cuts with B-roll from a bin, add captions, and make a 9:16 version.
   * o: {broll: binId or '', captions: 'social' | 'subtitles' | '', vertical: bool} -> {seq, vertical, summary}
   */
  async function makePromo(job, col, o = {}) {
    const total = 1 + (o.broll ? 1 : 0) + (o.vertical ? 1 : 0) + (o.captions ? (o.vertical ? 2 : 1) : 0);
    let n = 0; const stage = () => { job.range(n / total, (n + 1) / total); n++; };
    const done = [];
    stage();
    let seq = (await buildNarrative(job, col)).seq;
    done.push(`“${seq.name}”`);
    if (o.broll) {
      stage();
      // jump cuts (and cuts back to someone) first; a short promo of different people has few, so then every 6 s
      let r = null;
      for (const mode of ['cuts', 'every']) {
        try { r = await US.broll.cover(job, { seqId: seq.id, binId: o.broll, mode, every: 6 }); break; } catch (e) { if (US.errors.explain(e).code !== 'NOTHING_FOUND' || mode === 'every') { if (US.errors.explain(e).code !== 'NOTHING_FOUND') throw e; } }
      }
      if (r) { seq = r.copy; done.push(`${US.plural(r.shots.length, 'B-roll cutaway')}`); } else done.push('no spots for B-roll (too short)');
    }
    let inner = null, vertical = null;
    if (o.vertical) {
      stage();
      job.set({ who: 'premiere', msg: 'Auto Reframe: making the 9:16 version' });
      const info = await US.host.call('sequenceInfo', { seqId: seq.id, clips: false });
      inner = await US.host.call('autoReframe', { seqId: seq.id, num: 9, den: 16, motion: 'default', name: `${seq.name} – 9:16`, binPath: binBase() });
      const W = Math.max(info.width, info.height) >= 3000 ? 2160 : 1080, H = Math.round(W * 16 / 9);
      vertical = await US.host.call('fitToSize', { seqId: inner.id, width: W, height: H, name: `${seq.name} – 9:16 ${W}×${H}`, binPath: binBase() });
      done.push(`a ${W}×${H} vertical version`);
    }
    if (o.captions) {
      stage();
      await makeCaptions(job, await timelineTranscript(job, { seqId: seq.id }), { style: o.captions });
      if (vertical) {
        // the vertical sequence holds the reframed one nested, so its captions come from the reframed sequence's words
        stage();
        await makeCaptions(job, await timelineTranscript(job, { seqId: inner.id }), { style: o.captions, target: vertical.id });
      }
      done.push(`${CAP().STYLES[o.captions].label.toLowerCase()} captions`);
    }
    job.range(0, 1);
    await US.host.call('openSequence', { seqId: (vertical || seq).id }); await US.refreshContext();
    return { seq, vertical, summary: `Promo: ${done.join(', ')}` };
  }

  /* ================= highlight selects on a string-out (S1) ================= */
  const BUILT_LABEL = 4; // Cerulean: lines that are only in a sequence Story built
  /** Every chosen line with its colour and theme names: themes (as chosen by How picky), board cards, lines in sequences Story built. */
  function selectionMap({ themes = true, board = true, builds = true } = {}) {
    const sel = new Map();
    const add = (id, label, name) => { if (!lineById.has(id)) return; const x = sel.get(id); if (!x) sel.set(id, { label, names: [name] }); else if (!x.names.includes(name)) x.names.push(name); };
    if (themes) for (const th of state.themes) if (th.name !== 'Other') for (const id of effectiveLines(th)) add(id, th.label, th.name);
    if (board) {
      for (const c of state.wall.columns) if (BOARD || c.narrative) for (const k of c.cards) if (k.lineId && !k.hidden) add(k.lineId, columnLabel(c), c.name);
      if (BOARD) for (const l of state.wall.loose || []) if (l.card.lineId && !l.card.hidden) add(l.card.lineId, 1, 'On the board');
    }
    if (builds) for (const b of state.builds || []) for (const id of b.lineIds) add(id, BUILT_LABEL, `In “${b.name}”`);
    return sel;
  }
  /** Guess the string-out of all interviews by its name. */
  function guessStringOut(seqs) { return seqs.find(q => /str(i)?ng|string.?out|all.?int/i.test(q.name)) || null; }
  /**
   * Put every selected line on top of a string-out, in its theme's colour, on a track called “Selects”; optionally markers.
   * Running again replaces the previous highlights. -> {tl, sel, sections, result, summary}
   */
  async function highlightStringOut(job, { seqId, use = {}, markers = false }) {
    loadState();
    const tl = await timelineTranscript(job, { seqId, tracks: 'auto' });
    const sel = selectionMap(use);
    const sections = TL().highlightSections(tl.result.entries, sel);
    if (!sections.length) throw new US.UserError('NOTHING_FOUND', { title: `None of your selected lines are in “${tl.info.name}”.`, action: tl.result.entries.length ? 'Make some selections first (themes or the board), or pick the string-out with your interviews.' : 'The clips in this sequence have no transcripts yet – read Premiere’s transcripts first.' });
    state.highlights = state.highlights || {};
    const prev = state.highlights[seqId] || {};
    job.set({ who: 'premiere', msg: `Highlighting ${US.plural(sections.length, 'selected line')}` });
    job.progress(0.4);
    const r = await US.host.call('storyHighlights', { seqId, trackName: 'Selects', trackIndex: prev.track, binPath: binBase(), create: US.settings.get('story.makeLabelClips', true), sections: sections.map(x => ({ name: x.name, start: x.start, end: x.end, label: x.label })) });
    if (prev.markerGuids && prev.markerGuids.length) { try { await US.host.call('removeSequenceMarkers', { seqId, guids: prev.markerGuids }); } catch (e) { /* already gone */ } }
    let guids = [];
    if (markers) guids = await US.host.call('addSequenceMarkers', { seqId, markers: sections.map(x => ({ start: x.start, end: x.end, name: x.name, color: x.label != null ? LABEL_TO_MARKER[x.label] : 2 })) });
    state.highlights[seqId] = { track: r.track, markerGuids: guids || [], at: Date.now(), count: r.placed };
    saveNow();
    if (r.kind === 'transparent') US.ui.toast({ type: 'info', title: 'Highlighted – one thing to know', text: 'No adjustment layer in this project – used invisible label clips instead. Add one with File › New › Adjustment Layer and Ultra Studio will use it.', timeout: 15000 });
    if (r.log && r.log.length) job.log('Highlight notes', r.log.join('\n'));
    job.progress(1);
    return { tl, sel, sections, result: r, summary: `${US.plural(r.placed, 'selected line')} highlighted on “${tl.info.name}”${r.removed ? ` (replaced ${r.removed} old ones)` : ''}` };
  }
  async function removeHighlights(job, seqId) {
    loadState();
    const prev = (state.highlights || {})[seqId] || {};
    job && job.set({ who: 'premiere', msg: 'Removing the highlights' });
    const r = await US.host.call('storyRemoveHighlights', { seqId, trackName: 'Selects', trackIndex: prev.track });
    if (prev.markerGuids && prev.markerGuids.length) { try { await US.host.call('removeSequenceMarkers', { seqId, guids: prev.markerGuids }); } catch (e) { /* already gone */ } }
    if (state.highlights) delete state.highlights[seqId];
    saveNow();
    return { summary: r.removed ? `${US.plural(r.removed, 'highlight')} removed` : 'There were no highlights to remove' };
  }

  /* ================= narrative from a brief (S2) ================= */
  const N = () => US.storyNarrative, MO = () => US.storyMoments, B = () => US.storyBoard;
  const fmtSecs = s => (s < 120 ? `${Math.round(s)} s` : s % 60 ? `${Math.floor(s / 60)} min ${Math.round(s % 60)} s` : `${s / 60} min`);
  /**
   * The lines a narrative is made from: your selects (themes as chosen by How picky, board cards) plus lines on the topic
   * that aren't selected yet (Find more, also as chosen by How picky). Interviewer lines and lines too long for the
   * length are left out. -> [{id, rel, strength, heart, from:[…]}] best first
   */
  async function narrativePool(job, brief, { useAI = false, max = 120, maxLen = Math.max(8, brief.seconds * 0.5), reads = 120 } = {}) {
    const from = new Map(), scoped = await linesInScope(job), inScope = new Set(scoped.map(l => l.id));
    const add = (id, src) => { if (!lineById.has(id) || !inScope.has(id)) return; if (!from.has(id)) from.set(id, []); if (!from.get(id).includes(src)) from.get(id).push(src); };
    for (const th of state.themes) if (th.name !== 'Other') for (const id of effectiveLines(th)) add(id, th.name);
    if (BOARD) {
      for (const c of state.wall.columns) if (!c.narrative && !c.moments) for (const k of c.cards) if (k.lineId && !k.hidden) add(k.lineId, 'board');
      for (const l of state.wall.loose || []) if (l.card.lineId && !l.card.hidden) add(l.card.lineId, 'board');
    }
    if (useAI && reads > 150) return narrativeShortlist(job, brief, from, { reads, maxLen, max, lines: scoped });
    const rel = new Map();
    let relOf = id => 0.5 + (from.get(id).includes('board') ? 0.1 : 0);
    if (brief.topic) {
      const r = T.search(brief.topic, scoped, { limit: 400 }), top = r.length ? r[0].score : 1;
      r.forEach(x => rel.set(x.line.id, x.score / top));
      // lines in a theme whose name is the topic count as on topic
      const stems = new Set(brief.topic.toLowerCase().split(/[^a-z0-9']+/).filter(w => w.length > 2).map(w => T.stem(w)));
      const onTopic = new Set(state.themes.filter(th => `${th.name} ${th.query || ''} ${(th.keywords || []).join(' ')}`.toLowerCase().split(/[^a-z0-9']+/).some(w => w.length > 2 && stems.has(T.stem(w)))).map(th => th.name));
      relOf = id => Math.max(rel.get(id) || 0, from.get(id).some(n => onTopic.has(n)) ? 0.6 : 0.1);
      const more = await findMore(job, brief.topic, { useAI, exclude: new Set(from.keys()), limit: 80, feature: 'Narrative cut' });
      const mrel = new Map(more.map(x => [x.line.id, x.rel]));
      for (const id of pickLines(more.map(x => x.line.id), { relOf: id => mrel.get(id), groupOf: interviewOf, opts: pickyFor(null) })) { add(id, 'find more'); rel.set(id, Math.max(rel.get(id) || 0, mrel.get(id) * 0.9)); }
    }
    let pool = Array.from(from.keys()).map(id => {
      const l = lineById.get(id), q = T.quality(l);
      return { id, rel: US.clamp(relOf(id), 0, 1), strength: q.score, heart: MO().heart(l.text), from: from.get(id), skip: l.end - l.start > maxLen || notForStory(l, q) };
    }).filter(c => !c.skip);
    if (brief.topic && pool.filter(c => c.rel >= 0.15).length >= 6) pool = pool.filter(c => c.rel >= 0.15);
    const score = c => c.rel * 0.6 + c.strength * 0.4;
    pool.forEach(c => delete c.skip);
    return pool.sort((a, b) => score(b) - score(a)).slice(0, max);
  }
  const SHORTLIST_SYSTEM = 'You help a documentary editor choose interview lines for a short film. From these lines, pick the ones that could work in it: on the brief, clear and quotable, complete thoughts. Give each a score from 0 to 1 for how well it would work and a few words why. Only use ids from the list.';
  /**
   * When the AI reads more than one request holds: rank every usable line by the topic (search plus the AI's related
   * phrases) and by your selects, take as many as How much the AI reads allows, let the AI shortlist the best in
   * batches, and make the story from the shortlist. -> pool [{id, rel, strength, heart, from}] (.missing as for Find more)
   */
  async function narrativeShortlist(job, brief, from, { reads, maxLen, max = 120, lines = scopeLines() }) {
    const usable = lines.filter(l => { return l.end - l.start <= maxLen && !notForStory(l); });
    const hit = new Map();
    if (brief.topic) {
      job && job.set({ who: 'ai', msg: `${US.ai.label()} is thinking of ways people talk about “${brief.topic}”` });
      const ex = await US.ai.json(expandRequest(brief.topic, 'topic', 'Narrative cut'));
      for (const q of [brief.topic].concat((ex.phrases || []).map(String).filter(Boolean).slice(0, 25))) for (const r of T.search(q, usable, { limit: 2000 })) hit.set(r.line.id, Math.max(hit.get(r.line.id) || 0, r.score));
    }
    const top = Array.from(hit.values()).reduce((a, b) => Math.max(a, b), 1e-9);
    const key = l => (hit.has(l.id) ? hit.get(l.id) / top : 0) * 0.6 + (from.has(l.id) ? 0.3 : 0) + T.indexLine(l).q * 0.1;
    const ranked = usable.map(l => ({ l, k: key(l) })).sort((a, b) => b.k - a.k).map(x => x.l);
    const cands = reads === Infinity ? ranked : ranked.slice(0, reads);
    const batches = SAI().pickRequests(cands, { all: allLines(), system: SHORTLIST_SYSTEM, feature: 'Narrative cut',
      task: (k, n) => `Brief: ${brief.topic || 'the interviews'}${brief.tone ? ` (tone: ${brief.tone})` : ''}\nPick up to 60 of the lines above that could work in it, best first.${partOf(k, n)}` });
    job && job.set({ who: 'ai', msg: `${US.ai.label()} is reading ${US.plural(cands.length, 'line')} for the story` });
    const r = await SAI().runPicks(batches, { limit: max, job, nameOf: nameOfLine, label: 'shortlisting lines' });
    const pool = r.picks.map(p => { const q = T.quality(p.line); return { id: p.line.id, rel: p.rel, strength: q.score, heart: MO().heart(p.line.text), from: from.get(p.line.id) || [] }; });
    pool.missing = r.missing; pool.read = cands.length;
    return pool;
  }
  /** “Interview 3”: which interview a line is from, without sending clip or file names. */
  function interviewLabel(id) { const t = clipOfLine.get(id); return t ? `Interview ${state.transcripts.indexOf(t) + 1}` : ''; }
  /** id -> position in the project (transcripts in order, lines in time order): the order AI listings use. */
  function projectOrder() { const at = new Map(allLines().map((l, i) => [l.id, i])); return id => (at.has(id) ? at.get(id) : 1e9); }
  /** The newest narrative on the board (or the one with this column id). */
  function latestNarrative(id) {
    const cols = state.wall.columns.filter(c => c.narrative);
    return (id && cols.find(c => c.id === id)) || cols.reduce((best, c) => (!best || (c.narrative.at || 0) >= (best.narrative.at || 0) ? c : best), null); // ties: the later group
  }
  /** A narrative as a new board group “Narrative · 60 s · topic” – each card notes what the line does. */
  function narrativeColumn(nar, brief, poolN = 0) {
    const base = `Narrative · ${fmtSecs(brief.seconds)} · ${brief.topic || nar.title}`;
    let name = base; for (let n = 2; state.wall.columns.some(c => c.name === name); n++) name = `${base} (${n})`;
    const col = { id: US.uid('c'), name, cards: nar.beats.map(b => Object.assign({ lineId: b.lineId, note: b.purpose }, b.dropStart || b.dropEnd ? { trim: { dropStart: b.dropStart, dropEnd: b.dropEnd } } : {})),
      narrative: { title: nar.title, logline: nar.logline, by: nar.by, seconds: brief.seconds, topic: brief.topic, tone: brief.tone, pool: poolN, at: Date.now() } };
    B().ensure(state.wall);
    state.wall.columns.push(col);
    ensureColours(); saveNow();
    return col;
  }
  /** Brief -> narrative on the board. -> {narrative, column, brief, summary} */
  async function makeNarrative(job, { brief: text, useAI = false }) {
    loadState();
    const brief = N().parseBrief(text), L = lookOptions(), ai = !!(useAI && US.ai && US.ai.available()), reads = ai ? readsFor('narrative') : 120;
    if (ai && US.ai.approveTotal) { const p = readsPlan('narrative', reads); await US.ai.approveTotal(p.usd, `Narrative cut (${US.plural(p.requests, 'request')})`); }
    job.set({ who: 'computer', msg: brief.topic ? `Gathering lines about “${brief.topic}”` : 'Gathering your selects' });
    // with AI the pool doesn't depend on the length (lines up to 45 s), so another length on the same topic sends the same listing
    const pool = await narrativePool(job, brief, Object.assign({ useAI: ai && (reads > 150 || US.settings.get('story.moreAI', true)), reads }, ai ? { maxLen: 45 } : {}));
    if (!pool.length) throw new US.UserError('NOTHING_FOUND', brief.topic ? { title: `There are no lines about “${brief.topic}” yet.`, action: 'Try other words, or find themes first.' } : { title: 'There are no selects to make a story from yet.', action: 'Find themes first – or say what the video is about.' });
    const lineOf = id => lineById.get(id);
    const nar = ai
      ? await N().withAI(pool, brief, { handles: L.handles, lineOf, speakerName, interviewName: interviewLabel, orderOf: projectOrder(), job })
      : N().basic(pool, brief.seconds, { handles: L.handles, lineOf, title: brief.topic ? US.cap(brief.topic) : 'Narrative' });
    const col = narrativeColumn(nar, brief, pool.length);
    const secs = N().total(nar.beats, L.handles);
    const short = (secs < brief.seconds * 0.9 ? ' – it came out shorter: add more selects or try a broader topic' : '') + (pool.missing && pool.missing.length ? ` · ${SAI().missingNote(pool.missing)}` : '');
    return { narrative: nar, column: col, brief, summary: `“${nar.title}” – ${US.plural(nar.beats.length, 'line')}, ${US.fmtDur(secs)} (asked for ${fmtSecs(brief.seconds)}${short})${nar.by === 'basic' ? ' · basic version (no AI)' : ''} – ${BOARD ? 'on the board' : 'saved'} as “${col.name}”` };
  }
  /**
   * A narrative group as build groups: Hook, Build, Payoff (by position, so rearranging on the board counts), each line in
   * the colour of the theme it came from, trimmed lines at their trimmed times.
   */
  function narrativeGroups(col) {
    const g = wallGroups([col])[0]; if (!g || !g.lineIds.length) return [];
    const sel = selectionMap({ themes: true, board: false, builds: false }), labels = {};
    for (const id of g.lineIds) { const x = sel.get(id); labels[id] = x ? x.label : g.label; }
    const ids = g.lineIds;
    const parts = ids.length >= 3 ? [['Hook', ids.slice(0, 1)], ['Build', ids.slice(1, -1)], ['Payoff', ids.slice(-1)]] : [[col.name, ids]];
    return parts.map(([name, lineIds], i) => ({ name, label: g.label, lineIds, labels, trims: g.trims, pinned: new Set(),
      ideas: g.ideas.filter(x => (x.before ? lineIds.includes(x.before) : i === parts.length - 1)) }));
  }
  async function buildNarrative(job, col, { name } = {}) {
    if (!col) throw new US.UserError('NOTHING_FOUND', { title: 'There’s no narrative yet.', action: 'Make one on Story › Build › Narrative first.' });
    const look = lookOptions();
    look.strong = Object.assign({}, look.strong, { first: false }); // keep the story's order
    return buildSequence(job, { name: name || `Story – ${col.narrative.title}`, groups: narrativeGroups(col), look });
  }

  /* ================= moments (S5) ================= */
  const MOMENT_PICKY = {
    all: ['Every possible moment', 'faint cues too – a stumble, a short pause'],
    balanced: ['Balanced', 'clear moments'],
    best: ['Only the best', 'the stand-out moments']
  };
  /** Moments use their score as the pass level; interviewer and short lines are allowed (that's often where they are). */
  const momentPass = (l, score) => (score - 0.15) / 0.6;
  /** The moments kept at the How picky setting, optionally of one type. */
  function pickMoments(list, { type = 'all', opts = pickyFor(null) } = {}) {
    const by = new Map(list.map(m => [m.lineId, m]));
    const ids = list.filter(m => (type === 'all' || m.type === type) && lineById.has(m.lineId)).map(m => m.lineId);
    const keep = new Set(pickLines(ids, { relOf: id => by.get(id).score, groupOf: interviewOf, opts: Object.assign({}, opts, { maxPerTheme: 1e6 }), passOf: momentPass }));
    return list.filter(m => keep.has(m.lineId));
  }
  function lineContext() {
    const m = new Map();
    for (const t of state.transcripts) t.lines.forEach((l, i) => m.set(l.id, { prev: t.lines[i - 1] || null, next: t.lines[i + 1] || null }));
    return id => m.get(id) || {};
  }
  /** The candidates found from the words and timing (worked out again only when the transcripts or names change). */
  let linesStamp = 0, candMemo = null, planMemo = null;
  /** Moments in the lines chosen to work on (found with each whole interview around them, for the timing cues). */
  function momentCandidates() {
    const sc = scopeOf(), key = linesStamp + '|' + state.transcripts.length + '|' + JSON.stringify(state.speakers) + '|' + sc.kind + (sc.keys || []).join(',');
    if (!candMemo || candMemo.key !== key) {
      const ids = sc.kind === 'all' ? null : new Set(scopeLines().map(l => l.id));
      candMemo = { key, list: MO().detect(state.transcripts, { speakerName }).filter(m => !ids || ids.has(m.lineId)) };
    }
    return candMemo.list;
  }
  /**
   * What checking moments with AI involves at the How picky setting: Everything useful checks every candidate, Balanced
   * the best 240, Only the best the best 120. -> {found, checked, cap, every, calls, usd, free, name}
   */
  function momentsPlan({ opts = pickyFor(null) } = {}) {
    const found = momentCandidates(), cap = MO().capFor(opts.s), ai = US.ai && US.ai.available();
    const key = [candMemo.key, cap, ai ? US.ai.label() : 'none'].join('|');
    if (planMemo && planMemo.key === key) return planMemo.plan;
    const plan = { found: found.length, checked: Math.min(found.length, cap), cap, every: cap === Infinity, calls: 0, usd: 0, free: false, name: ai ? US.ai.label() : '' };
    if (ai && plan.checked) {
      const reqs = MO().requests(found, { lineOf: id => lineById.get(id), ctxOf: lineContext(), speakerName, max: cap });
      plan.calls = reqs.length;
      for (const b of reqs) { const e = US.ai.estimateFor ? US.ai.estimateFor(b.req) : { usd: 0, free: true }; plan.usd += e.usd || 0; plan.free = !!e.free; if (e.name) plan.name = e.name; }
    }
    planMemo = { key, plan };
    return plan;
  }
  /** Find moments in every transcript (with AI: the ones How picky allows are checked and described). Kept with the project. */
  async function findMoments(job, { useAI = false } = {}) {
    loadState();
    const ai = !!(useAI && US.ai && US.ai.available());
    await linesInScope(job);
    job && job.set({ who: 'computer', msg: `Looking for moments in ${scopeLabel().replace(/^All /, 'all ')}` });
    let list = momentCandidates().slice(), plan = null;
    if (ai && list.length) {
      plan = momentsPlan();
      // many small requests never reach the per-request question, so approve the whole run once (and check the monthly cap)
      if (!plan.free && US.ai.approveTotal) await US.ai.approveTotal(plan.usd, `Checking ${plan.checked} moments (${plan.calls} requests)`);
      list = await MO().classifyAI(list, { lineOf: id => lineById.get(id), ctxOf: lineContext(), speakerName, job, max: plan.cap });
    }
    // a run on part of the material keeps the moments found before in the rest (the interview log uses them all)
    const sc = scopeOf(), mineIds = sc.kind === 'all' ? null : new Set(scopeLines().map(l => l.id));
    const others = mineIds && state.moments ? state.moments.list.filter(m => !mineIds.has(m.lineId)) : [];
    state.moments = { at: Date.now(), by: ai ? 'ai' : 'basic', checked: plan ? plan.checked : 0, list: list.concat(others) };
    saveNow();
    const c = MO().counts(list);
    return { moments: list, summary: list.length ? `${US.plural(list.length, 'moment')}: ${MO().ORDER.filter(t => c[t]).map(t => `${c[t]} ${MO().TYPES[t].plural.toLowerCase()}`).join(', ')}${ai ? ` (${plan.checked === plan.found ? 'all' : `the best ${plan.checked} of ${plan.found}`} checked by ${plan.name})` : ' (basic, no AI)'}` : 'No moments found' };
  }
  /** A board group per type (“Moments · Bloopers”), each card noting why. -> number of cards added */
  function addMomentsToBoard(list) {
    B().ensure(state.wall);
    const have = new Set(state.wall.columns.flatMap(c => c.cards.map(k => k.lineId)).concat(state.wall.loose.map(l => l.card.lineId)));
    let n = 0;
    for (const t of MO().ORDER) {
      const ms = list.filter(m => m.type === t && !have.has(m.lineId) && lineById.has(m.lineId));
      if (!ms.length) continue;
      const name = `Moments · ${MO().TYPES[t].plural}`;
      let col = state.wall.columns.find(c => c.name === name);
      if (!col) { col = { id: US.uid('c'), name, label: MO().TYPES[t].label, moments: t, cards: [] }; state.wall.columns.push(col); }
      for (const m of ms) { col.cards.push({ lineId: m.lineId, note: m.reasons[0] || '' }); have.add(m.lineId); n++; }
    }
    ensureColours(); saveNow();
    return n;
  }
  /**
   * Themes from moments, one per type in that type's colour (“Moments · Funny” in Mango, “Moments · Bloopers” in Rose…),
   * so they stay told apart when built, highlighted or shared. -> {theme (the first), themes, added}
   */
  function momentsTheme(list, type = 'all') {
    const types = type === 'all' ? MO().ORDER : [type], themes = []; let added = 0;
    for (const ty of types) {
      const ids = list.filter(m => m.type === ty && lineById.has(m.lineId)).map(m => m.lineId);
      if (!ids.length && type === 'all') continue;
      const name = `Moments · ${MO().TYPES[ty].plural}`, want = MO().TYPES[ty].label;
      let th = state.themes.find(t => t.custom && t.name === name);
      if (!th) { th = newThemeFrom(name, ids); added += th.lineIds.length; }
      else added += addLinesToTheme(th, ids, { manual: true });
      th.label = want;    // the type's own colour, as on the markers and the Moments list
      themes.push(th);
    }
    saveNow();
    return { theme: themes[0] || null, themes, added };
  }
  /**
   * A sequence of moments grouped by type: each type in its own colour (colour) and every clip with a marker saying
   * what it is and why (labels: “Funny – laughter”). Story's other timeline options (handles, theme names) apply.
   */
  async function buildMoments(job, list, { colour = true, labels = true, name = 'Story – moments' } = {}) {
    loadState();
    const T5 = MO().TYPES, groups = [];
    for (const ty of MO().ORDER) {
      const ms = list.filter(m => m.type === ty && lineById.has(m.lineId));
      if (!ms.length) continue;
      groups.push({ name: T5[ty].plural, label: T5[ty].label, lineIds: ms.map(m => m.lineId), pinned: new Set(), ideas: [], trims: {},
        lineMarks: labels ? Object.fromEntries(ms.map(m => [m.lineId, { name: `${T5[ty].name}${m.reasons && m.reasons[0] ? ' – ' + m.reasons[0].replace(/\s*\(.*$/, '') : ''}`.slice(0, 60), comment: (m.reasons || []).join(' · ') }])) : null });
    }
    if (!groups.length) throw new US.UserError('NOTHING_FOUND', { title: 'There are no moments to build.', action: 'Find moments first, or choose another type.' });
    const look = Object.assign(lookOptions(), { colour, strong: Object.assign({}, lookOptions().strong, { highlight: false, first: false }) });
    return buildSequence(job, { name, groups, look });
  }
  /** Range markers on a string-out for the moments heard in it, coloured by type. Running again replaces them. */
  async function markMoments(job, { seqId, list }) {
    loadState();
    if (!seqId) throw new US.UserError('NO_SEQUENCE', { action: 'Choose your string-out first.' });
    const tl = await timelineTranscript(job, { seqId, tracks: 'auto' });
    const marks = MO().markers(tl.result.entries, list);
    if (!marks.length) throw new US.UserError('NOTHING_FOUND', { title: `None of these moments are in “${tl.info.name}”.`, action: tl.result.entries.length ? 'Pick the string-out with your interviews, or show more moments.' : 'The clips in this sequence have no transcripts yet – read Premiere’s transcripts first.' });
    state.momentMarkers = state.momentMarkers || {};
    const prev = state.momentMarkers[seqId];
    if (prev && prev.guids && prev.guids.length) { try { await US.host.call('removeSequenceMarkers', { seqId, guids: prev.guids }); } catch (e) { /* already gone */ } }
    job.set({ who: 'premiere', msg: `Marking ${US.plural(marks.length, 'moment')}` });
    const guids = await US.host.call('addSequenceMarkers', { seqId, markers: marks.map(m => ({ start: m.start, end: m.end, name: m.name, comment: m.comment, color: m.color })) });
    state.momentMarkers[seqId] = { guids: guids || [], at: Date.now(), count: marks.length };
    saveNow();
    const missing = list.length - new Set(marks.map(m => m.lineId)).size;
    return { marks, tl, summary: `${US.plural(marks.length, 'moment')} marked on “${tl.info.name}”${prev ? ' (the earlier ones replaced)' : ''}${missing > 0 ? ` · ${missing} not in this sequence` : ''}` };
  }
  async function removeMomentMarkers(job, seqId) {
    loadState();
    const prev = (state.momentMarkers || {})[seqId];
    if (prev && prev.guids && prev.guids.length) { try { await US.host.call('removeSequenceMarkers', { seqId, guids: prev.guids }); } catch (e) { /* already gone */ } }
    if (state.momentMarkers) delete state.momentMarkers[seqId];
    saveNow();
    return { summary: prev ? `${US.plural(prev.count || prev.guids.length, 'moment marker')} removed` : 'There were no moment markers to remove' };
  }

  /* ================= reading transcripts ================= */
  async function readPremiereTranscripts(job) {
    loadState();
    job.set({ who: 'premiere', msg: 'Saving your project so Premiere writes its transcripts to disk' });
    const pf = await US.host.call('storyProjectFile', { save: true });
    job.set({ who: 'computer', msg: 'Reading transcripts from the project file' });
    const found = await T.readProjectTranscripts(pf.path, { onProgress: p => job.progress(p * 0.85, 'Reading transcripts from the project file'), check: () => job.check() });
    if (!found.length) throw new US.UserError('NOTHING_FOUND', { title: 'Premiere hasn’t made any transcripts in this project yet.', action: 'Select your interview clips in the Project panel, right-click › Transcribe (free, runs on this computer). When it finishes, press this button again.' });
    job.set({ msg: 'Linking transcripts to clips' });
    readCount.again = readCount.changed = 0;
    for (const f of found) addTranscript({ name: f.name, path: f.path, source: 'premiere', language: f.language, segments: f.segments });
    await resolveItems(state.transcripts);
    reindex(); saveNow();
    const lines = found.reduce((n, f) => n + f.segments.length, 0);
    return { summary: `${US.plural(found.length, 'transcript')} read (${US.plural(lines, 'sentence')})${readNote()}` };
  }

  async function importFiles(job, files) {
    loadState();
    const clips = await projectClips();
    const masters = clips.filter(c => !c.sub);
    let ok = 0; const bad = [];
    readCount.again = readCount.changed = 0;
    for (let i = 0; i < files.length; i++) {
      job.check();
      job.progress(i / files.length, `Reading ${US.basename(files[i])}`);
      try {
        const r = T.parseFile(files[i], US.ctx.sequence ? US.ctx.sequence.fps : 25);
        const clip = T.matchClip(files[i], masters);
        addTranscript({ name: clip ? clip.name : US.basename(files[i]), path: clip ? clip.path : '', itemId: clip ? clip.id : '', source: 'file', file: files[i], format: r.format, segments: r.segments });
        ok++;
      } catch (e) { bad.push(`${US.basename(files[i])}: ${US.errors.explain(e).title}`); }
    }
    reindex(); saveNow();
    if (bad.length) US.ui.toast({ type: 'warn', title: `${US.plural(bad.length, 'file')} couldn’t be read`, text: 'Those files have no timecodes we recognise.', detail: bad.join('\n') });
    const unlinked = state.transcripts.filter(t => !t.path && !t.itemId).length;
    return { summary: `${US.plural(ok, 'transcript')} imported${unlinked ? ` · ${unlinked} not linked to a clip yet` : ''}${readNote()}` };
  }

  /* ================= small UI pieces ================= */
  /** Colour picker: Premiere's 16 label colours. Resolves with the index, or undefined. */
  function pickColour(current, title = 'Colour in the timeline') {
    return new Promise(resolve => {
      let done = false;
      const grid = h('div.story-colours', US.ui.LABELS.map(L => h('button.story-colour' + (L.i === current ? '.on' : ''), { title: L.name, onclick: () => { done = true; close(); resolve(L.i); } }, h('span', { style: { background: L.hex } }), L.name)));
      let close = () => {};
      ui.modal({ title, body: h('div', h('div.field-hint', 'Premiere label colour – clips of this theme get it in the timeline and in bins.'), grid), buttons: [{ label: 'Cancel', value: false, kind: 'ghost' }] }).then(() => { if (!done) resolve(undefined); });
      close = () => { const back = document.querySelector('.modal-back'); if (back) back.click(); };
    });
  }
  function swatchButton(label, onPick, title) {
    return h('button.story-swatch', { title: `${title || 'Colour'}: ${labelName(label)} – click to change`, style: { background: labelHex(label) }, onclick: async e => { e.stopPropagation(); const i = await pickColour(label); if (i != null) onPick(i); } });
  }
  /** Small menu next to a button: items [{label, onClick, danger}] (null = separator). */
  function popMenu(anchor, items) {
    document.querySelectorAll('.story-menu').forEach(m => m.remove());
    const r = anchor.getBoundingClientRect();
    const m = h('div.story-menu', items.map(it => it ? h('button.story-menu-item' + (it.danger ? '.danger' : ''), { onclick: e => { e.stopPropagation(); m.remove(); it.onClick(); } }, it.label) : h('div.story-menu-sep')));
    document.body.appendChild(m);
    const w = m.offsetWidth, hgt = m.offsetHeight;
    m.style.left = Math.max(4, Math.min(window.innerWidth - w - 4, r.right - w)) + 'px';
    m.style.top = (r.bottom + hgt + 4 < window.innerHeight ? r.bottom + 2 : Math.max(4, r.top - hgt - 2)) + 'px';
    const off = e => { if (!m.contains(e.target)) { m.remove(); document.removeEventListener('pointerdown', off, true); document.removeEventListener('keydown', esc, true); } };
    const esc = e => { if (e.key === 'Escape') { m.remove(); document.removeEventListener('pointerdown', off, true); document.removeEventListener('keydown', esc, true); } };
    setTimeout(() => { document.addEventListener('pointerdown', off, true); document.addEventListener('keydown', esc, true); }, 0);
  }
  const iconBtn = (icon, title, onClick, extra = '') => h('button.icon-btn' + extra, { title, onclick: e => { e.stopPropagation(); onClick(e); } }, US.icon(icon, 14));

  /**
   * The “How picky” control: three choices with live counts, a fine-tune slider, an explanation of what's kept,
   * and (optionally) More options. get() -> opts; set(partial) saves and redraws; countAt(opts) -> number of lines.
   */
  function pickyControl({ get, set, countAt, withOptions = true, extra = null, texts = PICKY_TEXT }) {
    const choices = h('div.picky-choices'), explain = h('div.picky-explain');
    const fineFmt = v => { const lv = pickyLevel(v / 100); return lv ? texts[lv][0] : v < 45 ? `between ${texts.all[0]} and ${texts.balanced[0]}` : `between ${texts.balanced[0]} and ${texts.best[0]}`; };
    function draw(o) {
      US.clear(choices);
      for (const k of ['all', 'balanced', 'best']) {
        const n = countAt(Object.assign({}, o, { s: PICKY_LEVELS[k] }));
        choices.appendChild(h('button.picky-choice' + (pickyLevel(o.s) === k ? '.on' : ''), { title: US.cap(texts[k][1]), onclick: () => set({ s: PICKY_LEVELS[k] }) },
          h('div.picky-name', texts[k][0]), h('div.picky-count', US.plural(n, 'line')), h('div.picky-desc', US.cap(texts[k][1]))));
      }
      explain.textContent = describePicky(o, countAt(o), texts);
    }
    const fine = ui.slider({ label: 'Fine-tune', min: 0, max: 100, step: 1, value: Math.round(get().s * 100), fmt: fineFmt, onInput: v => draw(Object.assign({}, get(), { s: v / 100 })), onChange: v => set({ s: v / 100 }) });
    const o = get();
    const opts = withOptions ? ui.section('More options', [
      ui.slider({ label: 'At least this many lines from every interview', min: 0, max: 5, value: o.perInterview, fmt: v => (v ? `${v} per interview` : 'off'), hint: 'So quieter interviewees aren’t dropped when you only keep the best.', onChange: v => set({ perInterview: v }) }),
      ui.slider({ label: 'Most lines per theme', min: 0, max: 100, value: o.maxPerTheme, fmt: v => (v ? `${v}` : 'automatic'), onChange: v => set({ maxPerTheme: v }) }),
      ui.toggle({ label: 'Include interviewer questions', value: o.interviewer, onChange: v => set({ interviewer: v }) }),
      ui.field('Short or partial lines', ui.segmented({ options: [{ value: 'auto', label: 'Automatic', title: 'Kept in Everything useful, left out otherwise' }, { value: 'yes', label: 'Include' }, { value: 'no', label: 'Leave out' }], value: o.short, onChange: v => set({ short: v }) })),
      h('div.grid2',
        ui.slider({ label: 'Shortest line', min: 0, max: 20, value: o.minLen, fmt: v => (v ? `${v} s` : 'any'), onChange: v => set({ minLen: v }) }),
        ui.slider({ label: 'Longest line', min: 5, max: 60, value: Math.min(60, o.maxLen), fmt: v => (v >= 60 ? 'any' : `${v} s`), onChange: v => set({ maxLen: v >= 60 ? 60 : v }) }))], { open: false }) : null;
    draw(o);
    return h('div.picky', choices, fine, explain, extra, opts);
  }

  /**
   * “How much Claude reads”: a slider over the feature's stops (Best 600 … Everything), with what the current stop
   * involves – lines, cost with the current model, requests and time. Remembered per project.
   */
  function readsControl(feature) {
    const stops = SAI().stopsFor(feature), total = scopeLines().length;
    const line = h('div.field-hint.story-reads-cost');
    const show = i => { const n = stops[i], p = readsPlan(feature, n); line.textContent = SAI().describe(p, { lines: p.lines, all: p.all }); };
    const at = Math.max(0, stops.indexOf(readsFor(feature)));
    const sl = ui.slider({ label: `How much ${US.ai.label()} reads`, min: 0, max: stops.length - 1, step: 1, value: at, fmt: i => SAI().stopLabel(stops[i], total), onInput: show, onChange: i => { setReads(feature, stops[i]); show(i); } });
    show(at);
    return h('div.story-reads', sl, line);
  }

  /* ================= the tool ================= */
  US.tools.register({
    id: 'story', name: 'Story', short: 'Story', icon: 'story', group: 'cut', order: 22,
    blurb: 'Step by step from your interviews to a cut: themes, specific lines and moments, a sequence or a narrative, and documents to share.',
    hostFns: ['storyClips', 'storyCue', 'storyProjectFile', 'storyTiming', 'storyPlace', 'storyThemeLayers', 'storyCaptions'],
    create() {
      const v = ui.toolView({
        icon: 'story', title: 'Story', blurb: 'From your interviews to a cut, step by step: themes, the lines you need, a sequence or narrative, and documents to share.',
        help: h('div', h('p', 'Story works from transcripts, in five steps. You can go back to any step at any time.'), h('ol',
          h('li', h('b', 'Interviews. '), 'Let Premiere transcribe your interviews (select clips › right-click › Transcribe – free, on this computer), then press “Read Premiere’s transcripts” – or import transcript files. Then choose what to work on: every interview, some of them, or the lines in a sequence such as your selects (only between its In and Out points if you like).'),
          h('li', h('b', 'Themes. '), 'Type the themes you want (optional) and press Find themes: Story finds yours and its own in one pass. How picky sets how many lines each theme keeps. Each theme has a colour its clips get in the timeline.'),
          h('li', h('b', 'Find. '), 'Search for specific lines (by word, related words and mis-heard words), Find more on a topic you haven’t covered, and Moments – bloopers, funny bits, off-camera voices and poignant moments.'),
          h('li', h('b', 'Build. '), 'A sequence from your themes, a narrative from a one-sentence brief (and a promo from it), bins by theme, and highlights on a string-out – your clips are never changed.'),
          h('li', h('b', 'Share. '), 'An interview log, a paper edit and the transcript of any sequence – as Word, a spreadsheet, text or subtitles.')))
      });
      // the steps, in order: [tab, label, what it's for]
      const STEPS = [
        ['transcripts', 'Interviews', 'Get the transcripts and choose what to work on.'],
        ['themes', 'Themes', 'Group the best lines by what they’re about – your themes and the ones Story finds, in one pass.'],
        ['search', 'Find', 'Look for specific lines, anything you’ve missed on a topic, and moments.'],
        ...(BOARD ? [['wall', 'Board', 'Put the lines in order on the post-it board.']] : []),
        ['build', 'Build', 'Make it in Premiere: a sequence from your themes, a narrative from a brief, bins, highlights.'],
        ['timeline', 'Share', 'Documents to share: the interview log, a paper edit, the transcript of a sequence.']];
      const stepNo = t => STEPS.findIndex(x => x[0] === t);
      let tab = US.settings.get('story.tab', 'transcripts');
      if (stepNo(tab) < 0) tab = 'transcripts';
      const tabs = ui.segmented({ options: STEPS.map(([value, label, title], i) => ({ value, label: `${i + 1} ${label}`, title })), value: tab, onChange: t => show(t) });
      tabs.classList.add('story-tabs');
      const panes = Object.fromEntries(STEPS.map(x => [x[0], h('div.story-pane')]));
      v.body.append(tabs, ...Object.values(panes));
      function show(t) { if (stepNo(t) < 0) t = t === 'wall' ? 'build' : 'transcripts'; tab = t; tabs.set(t); US.settings.set('story.tab', t); for (const [k, el] of Object.entries(panes)) el.classList.toggle('hidden', k !== t); render(); }
      /** ✓ on the steps that are done (transcripts read, themes found). */
      function markSteps() {
        const done = { transcripts: state.transcripts.length > 0, themes: state.themes.some(t => t.name !== 'Other') };
        tabs.querySelectorAll('.seg').forEach((b, i) => { b.textContent = `${i + 1} ${STEPS[i][1]}${done[STEPS[i][0]] ? ' ✓' : ''}`; });
      }
      /** “Step 2 of 5 · Group the best lines…” */
      function stepHead(t) { const i = stepNo(t); return h('div.story-step-head', h('b', `Step ${i + 1} of ${STEPS.length}`), ' · ', STEPS[i][2]); }
      /** The way on: “Next: 2 Themes →” (and a skip where a step is optional). */
      function nextBar(t, { skip = false } = {}) {
        const i = stepNo(t), nx = STEPS[i + 1], sk = skip && STEPS[i + 2];
        if (!nx) return null;
        return h('div.story-next', sk ? ui.button(`Skip to ${i + 3} ${sk[1]}`, { kind: 'ghost', onClick: () => { show(sk[0]); v.body.scrollTop = 0; } }) : null,
          ui.button(`Next: ${i + 2} ${nx[1]} →`, { kind: 'primary', onClick: () => { show(nx[0]); v.body.scrollTop = 0; } }));
      }
      /** What Themes, Find and Moments read, with a way to change it. */
      function scopeChip() {
        const sc = scopeOf(), seq = sc.kind === 'sequence';
        return h('div.story-scope-chip', h('span.grow', h('b', 'Working on: '), `${scopeLabel()} · ${US.plural(scopeLines().length, 'line')}${seq && sc.at ? ` (read ${new Date(sc.at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })})` : ''}`),
          seq ? ui.button('Read again', { small: true, kind: 'ghost', title: 'Read the sequence again (Search uses it as last read; Themes, Find more and Moments read it again themselves)', onClick: () => US.jobs.run({ title: 'Reading the sequence', tool: 'story' }, async job => { const ls = await refreshScope(job); return { summary: `${scopeLabel()}: ${US.plural(ls.length, 'line')}` }; }).then(() => render()) }) : null,
          ui.button('Change', { small: true, kind: 'ghost', title: 'Choose what to work on: every interview, some of them, or the lines in a sequence', onClick: () => { pendingSection = 'scope'; show('transcripts'); } }));
      }

      function render() {
        if (!US.ctx.project) { for (const el of Object.values(panes)) { US.clear(el).appendChild(ui.empty({ icon: 'folder', title: 'Open a project first', text: 'Story keeps its transcripts, themes and narratives with each Premiere project.' })); } return; }
        loadState();
        markSteps();
        if (tab === 'transcripts') renderTranscripts();
        if (tab === 'search') renderSearch();
        if (tab === 'themes') renderThemes();
        if (tab === 'wall' && BOARD) renderWall();
        if (tab === 'timeline') renderTimeline();
        if (tab === 'build') renderBuild();
        if (pendingSection) { const want = pendingSection; pendingSection = null; setTimeout(() => { const t = v.el.querySelector(`[data-section="${want}"]`); if (t) t.scrollIntoView({ block: 'start' }); }, 30); }
      }
      let pendingSection = null;
      const needTranscripts = () => ui.empty({ icon: 'story', title: 'No transcripts yet', text: 'Start with step 1 – Premiere can make them for free.', action: ui.button('Go to 1 Interviews', { kind: 'primary', onClick: () => show('transcripts') }) });

      /* ---------- Transcripts ---------- */
      function renderTranscripts() {
        const el = US.clear(panes.transcripts);
        const lines = allLines();
        const secs = state.transcripts.reduce((n, t) => n + (t.lines.length ? t.lines[t.lines.length - 1].end : 0), 0);
        const speakers = new Set(lines.map(l => l.speaker));
        el.appendChild(stepHead('transcripts'));
        el.appendChild(ui.card(
          h('div.card-title', 'Get transcripts'),
          h('div.muted', 'Premiere’s own transcription is free, accurate and stays on this computer. Select your interviews in the Project panel › right-click › Transcribe. When it’s done, read them in here.'),
          ui.actionButton(state.transcripts.length ? 'Read Premiere’s transcripts again' : 'Read Premiere’s transcripts', () => US.actions.run('story.read', {}), { icon: 'refresh' }),
          h('div.row', ui.button('Import transcript files…', { icon: 'folder', onClick: async () => {
            const r = window.cep && window.cep.fs ? window.cep.fs.showOpenDialogEx(true, false, 'Choose transcript files', '', ['srt', 'vtt', 'txt', 'csv', 'tsv', 'json', 'prtranscript']) : null;
            if (r && r.data && r.data.length) await US.jobs.run({ title: 'Importing transcripts', tool: 'story' }, job => importFiles(job, r.data.map(US.normPath))).then(render);
          } }), h('span.field-hint', 'SRT, VTT, CSV, JSON or text with timecodes'))));
        if (!state.transcripts.length) { el.appendChild(ui.note('Reading saves your project first, because that’s where Premiere keeps its transcripts.')); return; }
        const named = Array.from(speakers).filter(Boolean).length, one = (n, w) => (n === 1 ? w : w + 's');
        el.appendChild(ui.stats(ui.stat(state.transcripts.length, one(state.transcripts.length, 'interview')), ui.stat(US.fmtDur(secs), 'of speech'), ui.stat(lines.length, one(lines.length, 'line')),
          named ? ui.stat(named, one(named, 'speaker')) : ui.stat('No', 'speaker names')));
        el.appendChild(scopeCard());
        // the technical part: which clip each transcript belongs to, and speaker names
        const unlinked = state.transcripts.filter(t => !(t.path || t.itemId));
        const details = ui.section('Interviews and speakers', [interviewList(), speakerNames(speakers, lines)], { open: unlinked.length > 0, hint: unlinked.length ? `${unlinked.length} not linked to a clip` : 'link clips, name speakers' });
        if (unlinked.length) el.appendChild(ui.note(`${US.plural(unlinked.length, 'transcript')} ${unlinked.length === 1 ? 'isn’t' : 'aren’t'} linked to a clip yet, so ${unlinked.length === 1 ? 'its lines' : 'their lines'} can’t be played or built. Link ${unlinked.length === 1 ? 'it' : 'them'} below.`, 'warn'));
        el.appendChild(details);
        el.appendChild(nextBar('transcripts'));
      }
      function interviewList() {
        const rows = state.transcripts.slice().sort((a, b) => a.name.localeCompare(b.name)).map(t => {
          const linked = !!(t.path || t.itemId);
          return h('div.list-row',
            h('span.swatch', { style: { background: linked ? 'var(--ok)' : 'var(--warn)' }, title: linked ? 'Linked to a clip' : 'Not linked to a clip' }),
            h('div.list-main', h('div.list-title', t.name), h('div.list-sub', `${t.source === 'premiere' ? 'Premiere transcript' : 'File: ' + US.basename(t.file)} · ${US.plural(t.lines.length, 'line')} · ${US.fmtDur(t.lines.length ? t.lines[t.lines.length - 1].end : 0)}${linked ? '' : ' · not linked to a clip'}`)),
            ui.button(linked ? 'Relink' : 'Link to clip', { small: true, kind: linked ? 'ghost' : 'secondary', onClick: () => linkDialog(t) }),
            h('button.icon-btn', { title: 'Remove this transcript from Story', onclick: async () => { if (await ui.confirm({ title: `Remove “${t.name}”?`, text: 'Its lines leave Find and Themes. Nothing in Premiere changes.', ok: 'Remove' })) { state.transcripts = state.transcripts.filter(x => x !== t); reindex(); pruneWall(); saveNow(); render(); } } }, US.icon('close', 14)));
        });
        return h('div.list.story-list', rows);
      }
      function speakerNames(speakers, lines) {
        const spk = Array.from(speakers);
        return h('div.story-speakers', h('div.field-hint', spk.length > 1 || spk[0] ? 'Speaker names – they show in Find, Themes, documents and subclip names.' : 'Premiere’s transcripts have no speaker names, so Story shows the clip name instead.'),
          ...spk.filter((x, i) => x || spk.length > 1).map(s => h('div.row', h('span.swatch', { style: { background: speakerColor(s) } }), h('div.grow', ui.input({ value: speakerName(s), placeholder: s || 'Unknown speaker', onInput: val => { state.speakers[s].name = val.trim() || s; save(); } })), h('span.field-hint', US.plural(lines.filter(l => l.speaker === s).length, 'line')))));
      }
      /** Step 1b: every interview, some of them, or the lines in a sequence (e.g. your selects), optionally In to Out. */
      let scopeSeqs = null;
      function scopeCard() {
        const sc = scopeOf();
        let kind = sc.kind;
        const body = h('div.story-scope-body'), status = h('div.field-hint.story-scope-status');
        const showStatus = () => { const n = scopeLines().length; status.textContent = `Now: ${scopeLabel()} · ${US.plural(n, 'line')}${scopeOf().kind === 'sequence' && scopeOf().at ? ` · read ${new Date(scopeOf().at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}` : ''}`; };
        const apply = scope => {
          if (scope.kind !== 'sequence') { state.scope = Object.assign({ kind: 'all', keys: [], ids: [] }, scope); linesStamp++; saveNow(); showStatus(); markSteps(); return; }
          US.jobs.run({ title: 'Reading the sequence', tool: 'story' }, job => setScope(job, scope)).then(() => render());
        };
        const seg = ui.segmented({ options: [{ value: 'all', label: 'All interviews' }, { value: 'interviews', label: 'Some interviews' }, { value: 'sequence', label: 'A sequence' }], value: kind, onChange: k => { kind = k; draw(); if (k === 'all') apply({ kind: 'all' }); else if (k === 'interviews') apply({ kind: 'interviews', keys: scopeOf().kind === 'interviews' ? scopeOf().keys : state.transcripts.map(t => t.key) }); } });
        function draw() {
          US.clear(body);
          if (kind === 'interviews') {
            const keys = new Set(scopeOf().kind === 'interviews' ? scopeOf().keys : state.transcripts.map(t => t.key));
            const tick = (t, on) => { on ? keys.add(t.key) : keys.delete(t.key); apply({ kind: 'interviews', keys: Array.from(keys) }); };
            body.append(h('div.row', ui.button('All', { small: true, kind: 'ghost', onClick: () => { apply({ kind: 'interviews', keys: state.transcripts.map(t => t.key) }); draw(); } }), ui.button('None', { small: true, kind: 'ghost', onClick: () => { apply({ kind: 'interviews', keys: [] }); draw(); } })),
              h('div.story-scope-list', state.transcripts.slice().sort((a, b) => a.name.localeCompare(b.name)).map(t => h('label.story-scope-item', h('input', { type: 'checkbox', checked: keys.has(t.key), onchange: e => tick(t, e.target.checked) }), h('span.grow', t.name), h('span.field-hint', US.plural(t.lines.length, 'line'))))));
          } else if (kind === 'sequence') {
            let seqId = scopeOf().seqId || (US.ctx.sequence && US.ctx.sequence.id) || '', inOut = !!scopeOf().inOut;
            const sel = ui.select({ options: [], placeholder: 'Choose a sequence…', onChange: x => { seqId = x; } });
            const fill = seqs => { scopeSeqs = seqs; sel.setOptions(seqs.map(q => ({ value: q.id, label: q.name + (US.ctx.sequence && q.id === US.ctx.sequence.id ? '  (open)' : '') })), seqId); };
            if (scopeSeqs) fill(scopeSeqs);
            US.host.call('listSequences').then(fill).catch(() => {});
            body.append(h('div.field-hint', 'Story reads which lines are heard in the sequence – your selects or a rough cut – and works only on those. Themes, Find more and Moments read it again each time, so changes to the cut count; Search uses it as last read (Read again updates it).'),
              ui.field('Sequence', sel),
              ui.toggle({ label: 'Only between its In and Out points', hint: 'Mark In and Out in the Timeline (I and O) around the part you want.', value: inOut, onChange: x => { inOut = x; } }),
              ui.actionButton('Use this sequence', () => { const id = sel.get() || seqId; if (!id) { ui.toast({ type: 'info', title: 'Choose a sequence first.' }); return; } apply({ kind: 'sequence', seqId: id, seqName: ((scopeSeqs || []).find(q => q.id === id) || {}).name || '', inOut }); }, { icon: 'target', block: false }));
          }
          showStatus();
        }
        draw();
        return h('div.card', { dataset: { section: 'scope' } }, h('div.card-title', 'What to work on'),
          h('div.muted', 'Themes, Find and Moments read only these lines – handy when you only need part of the material.'),
          seg, body, status);
      }
      async function linkDialog(t) {
        const clips = (await projectClips()).filter(c => !c.sub);
        const best = T.matchClip(t.name, clips);
        const sel = ui.select({ options: clips.map(c => ({ value: c.id, label: `${c.name}  (${c.bin})` })), value: (best && best.id) || t.itemId || '', placeholder: 'Choose the interview clip…' });
        const ok = await ui.modal({ title: `Link “${t.name}”`, body: h('div', h('p', 'Which clip in your project is this interview?'), sel), buttons: [{ label: 'Cancel', value: false, kind: 'ghost' }, { label: 'Link', value: true, kind: 'primary' }] });
        if (!ok || !sel.get()) return;
        const c = clips.find(x => x.id === sel.get());
        const oldKey = t.key;
        t.itemId = c.id; t.path = c.path; t.key = c.path || t.key;
        if (oldKey !== t.key) { const prev = state.transcripts.find(x => x !== t && x.key === t.key); if (prev) state.transcripts = state.transcripts.filter(x => x !== prev); }
        reindex(); saveNow(); render();
        ui.toast({ type: 'ok', title: `Linked to ${c.name}`, timeout: 2500 });
      }

      /* ---------- Search and Find more ---------- */
      let lastQuery = '', strongOnly = US.settings.get('story.strong', false), results = [], targetTheme = null, targetColumn = null;
      let moreMode = false, moreResults = [], moreTopic = '', moreInfo = '';
      let momentsMode = false, momentType = 'all', momentsAI = US.settings.get('story.momentsAI', true), momSeq = '';
      let momColours = US.settings.get('story.momentColours', true), momLabels = US.settings.get('story.momentLabels', true);
      let moreAI = US.settings.get('story.moreAI', true), notInCut = false, cutSeq = '';
      const picked = () => new Set(state.picked || []);
      /** Open Find more (from Search, a theme or a board column) and run it. */
      function startFindMore({ topic = '', theme = null, column = null } = {}) {
        targetTheme = theme ? theme.id : null; targetColumn = column ? column.id : null;
        lastQuery = topic; moreMode = true; momentsMode = false; moreResults = []; moreInfo = '';
        show('search');
        if (topic) runFindMore(topic);
      }
      async function runFindMore(topic) {
        moreTopic = topic;
        const aiOn = US.ai && US.ai.available() && moreAI;
        await US.jobs.run({ title: `Finding more about “${topic}”`, tool: 'story' }, async job => {
          const exclude = selectedIds();
          let inCut = 0;
          if (notInCut && cutSeq) { const used = await usedInSequence(job, cutSeq); used.forEach(id => { if (!exclude.has(id)) inCut++; exclude.add(id); }); }
          moreResults = await findMore(job, topic, { useAI: aiOn, exclude });
          moreInfo = `Leaving out ${US.plural(selectedIds().size, 'line')} already in themes${BOARD ? ' or on the board' : ''}${notInCut && cutSeq ? ` and ${US.plural(inCut, 'more line')} already in your cut` : ''}.`;
          return { summary: `${US.plural(moreResults.length, 'new line')} found` };
        });
        render();
      }
      function renderSearch() {
        const el = US.clear(panes.search);
        if (!state.transcripts.length) { el.appendChild(needTranscripts()); return; }
        el.appendChild(stepHead('search'));
        el.appendChild(scopeChip());
        const tgt = targetTheme && state.themes.find(t => t.id === targetTheme), tcol = targetColumn && state.wall.columns.find(c => c.id === targetColumn);
        if (tgt || tcol) el.appendChild(h('div.note.story-target', h('span.story-swatch.static', { style: { background: labelHex(tgt ? tgt.label : columnLabel(tcol)) } }), h('span.grow', `Adding lines to “${(tgt || tcol).name}” – tick lines, then press “Add to ${(tgt || tcol).name}”.`), ui.button('Done', { small: true, kind: 'ghost', onClick: () => { targetTheme = null; targetColumn = null; render(); } })));
        const input = ui.input({ value: lastQuery, placeholder: 'e.g. volunteering, "open door", lonely…', onEnter: q => { moreMode = momentsMode = false; run(q); } });
        el.appendChild(h('div.row.story-find-row', h('div.grow', input),
          ui.button('Search', { kind: moreMode || momentsMode ? 'secondary' : 'primary', icon: 'target', onClick: () => { moreMode = momentsMode = false; run(input.value); } }),
          ui.button('Find more', { kind: moreMode && !momentsMode ? 'primary' : 'secondary', icon: 'spark', title: 'Anything that touches on this topic and isn’t selected yet', onClick: () => { moreMode = true; momentsMode = false; lastQuery = input.value; runFindMore(input.value); } }),
          ui.button('Moments', { kind: momentsMode ? 'primary' : 'secondary', icon: 'star', title: 'Bloopers, funny bits, off-camera voices and poignant moments', onClick: () => { momentsMode = true; render(); } })));
        if (momentsMode) { el.appendChild(momentsView()); el.appendChild(pickedBar()); el.appendChild(nextBar('search')); return; }
        if (moreMode) {
          const aiOn = US.ai && US.ai.available();
          const seqSel = ui.select({ options: [], placeholder: 'Choose your cut…', onChange: v => { cutSeq = v; } });
          US.host.call('listSequences').then(seqs => { if (!cutSeq) cutSeq = (US.ctx.sequence && US.ctx.sequence.id) || ''; seqSel.setOptions(seqs.map(q => ({ value: q.id, label: q.name })), cutSeq); }).catch(() => {});
          el.appendChild(h('div.story-more-opts',
            aiOn ? ui.toggle({ label: `Let ${US.ai.label()} find lines that say it in other words`, hint: 'Only the text of your lines is sent.', value: moreAI, onChange: x => { moreAI = x; US.settings.set('story.moreAI', x); render(); } }) : null,
            aiOn && moreAI ? readsControl('findMore') : null,
            ui.toggle({ label: 'Not already in my cut', hint: 'Also leave out lines already used in a sequence.', value: notInCut, onChange: x => { notInCut = x; render(); } }),
            notInCut ? seqSel : null));
        } else {
          el.appendChild(h('div.row.story-chips', ['family', 'faith', 'volunteering', 'growing up', 'hard times', 'hope'].map(c => h('button.chip', { onclick: () => { input.value = c; moreMode = false; run(c); } }, c)),
            ui.toggle({ label: 'Strong soundbites only', value: strongOnly, onChange: x => { strongOnly = x; US.settings.set('story.strong', x); run(input.value); } })));
        }
        const list = h('div.story-results');
        el.appendChild(list);
        el.appendChild(pickedBar());
        if (moreMode) drawMore(list); else drawResults(list);
        el.appendChild(nextBar('search'));
        setTimeout(() => input.focus(), 30);
        function run(q) { lastQuery = q; results = q.trim() ? T.search(q, scopeLines(), { limit: 200, minQuality: strongOnly ? 0.6 : 0 }) : []; render(); }
      }
      /* ---------- Moments ---------- */
      /** “Claude Opus 5.5 checks the best 240 of 1,455 candidates (How picky: Balanced) – about 27¢.” */
      function momentsCostLine() {
        const o = pickyFor(null), p = momentsPlan({ opts: o }), lv = pickyLevel(o.s);
        if (!p.found) return h('div.field-hint.story-moments-cost', 'No candidates in the words or timing yet.');
        const cost = p.free ? 'no charge within Gemini’s free allowance' : `about ${US.ai.fmtUSD(p.usd)}${p.calls > 1 ? ` in ${p.calls} requests` : ''}`;
        const which = p.every ? `all ${p.found.toLocaleString('en-GB')} candidates` : `the best ${p.checked.toLocaleString('en-GB')} of ${p.found.toLocaleString('en-GB')} candidates`;
        return h('div.field-hint.story-moments-cost', `${p.name} checks ${which} (How picky: ${lv ? MOMENT_PICKY[lv][0] : 'custom'}) – ${cost}. ${p.every ? 'Balanced checks the best 240, Only the best 120.' : 'Every possible moment checks them all.'}`);
      }
      function momentsView() {
        const aiOn = US.ai && US.ai.available(), M = MO(), saved = state.moments;
        const box = h('div', h('div.card', { dataset: { section: 'moments' } },
          h('div.card-title', 'Moments', saved ? h('span.right', saved.by === 'ai' ? `checked by ${aiOn ? US.ai.label() : 'AI'}` : 'basic – no AI') : null),
          h('div.muted', 'Bloopers, funny bits, off-camera voices and poignant moments – found from what’s said and how it’s timed: restarts and retakes, “are we rolling?”, laughter, swearing, a second voice, the interviewer reacting, long pauses mid-thought and emotional words.'),
          aiOn ? ui.toggle({ label: `Let ${US.ai.label()} check each moment`, hint: 'Sends the text of each moment with a line either side – nothing else.', value: momentsAI, onChange: x => { momentsAI = x; US.settings.set('story.momentsAI', x); render(); } })
            : h('div.field-hint', 'Basic version: found from the words and timing alone. Add an AI key in Settings to have each moment checked and described.'),
          aiOn && momentsAI ? momentsCostLine() : null,
          ui.actionButton(saved ? 'Find moments again' : 'Find moments', () => US.actions.run('story.moments', { useAI: !!(aiOn && momentsAI), type: momentType }).then(() => render()), { icon: 'spark' })));
        if (!saved) return box;
        const scopeIds = scopeOf().kind === 'all' ? null : new Set(scopeLines().map(l => l.id));
        const list = saved.list.filter(m => lineById.has(m.lineId) && (!scopeIds || scopeIds.has(m.lineId)));
        const kept = pickMoments(list), c = M.counts(kept);
        const shown = momentType === 'all' ? kept : kept.filter(m => m.type === momentType);
        box.appendChild(ui.section('How picky', [pickyControl({ withOptions: false, texts: MOMENT_PICKY, get: () => pickyFor(null), countAt: o => pickMoments(list, { type: momentType, opts: o }).length, set: partial => { state.picky = Object.assign(pickyFor(null), partial); saveNow(); render(); } })], { open: false }));
        box.appendChild(h('div.row.story-chips.story-moment-types', [['all', 'All']].concat(M.ORDER.map(t => [t, M.TYPES[t].plural])).map(([t, name]) =>
          h('button.chip' + (momentType === t ? '.on' : ''), { onclick: () => { momentType = t; render(); } }, t === 'all' ? null : h('span.story-dot', { style: { background: labelHex(M.TYPES[t].label) } }), `${name} ${c[t]}`))));
        const seqSel = ui.select({ options: [], placeholder: 'Choose your string-out…', onChange: x => { momSeq = x; render(); } });
        US.host.call('listSequences').then(seqs => { if (!momSeq) { const g = guessStringOut(seqs); momSeq = (g && g.id) || (US.ctx.sequence && US.ctx.sequence.id) || ''; } seqSel.setOptions(seqs.map(q => ({ value: q.id, label: q.name })), momSeq); }).catch(() => {});
        const marked = momSeq && state.momentMarkers && state.momentMarkers[momSeq];
        box.appendChild(h('div.story-moments-bar',
          h('div.row', h('span.field-hint.grow', `${US.plural(shown.length, 'moment')} shown${list.length > kept.length ? ` · ${list.length - kept.length} more at a less picky setting` : ''}`),
            BOARD ? ui.button('Add to board', { small: true, icon: 'story', title: 'A board group per type: Moments · Bloopers, Moments · Funny…', onClick: () => { const n = addMomentsToBoard(shown); ui.toast({ type: 'ok', title: n ? `${US.plural(n, 'moment')} added to the board` : 'They’re all on the board already', action: n ? { label: 'Open board', fn: () => show('wall') } : null }); } })
              : ui.button('Make themes of these', { small: true, icon: 'story', title: 'A theme per type – “Moments · Funny”, “Moments · Bloopers”… – each in its type’s colour, to build, put in bins or share', onClick: () => { const r = momentsTheme(shown, momentType); ui.toast({ type: 'ok', title: r.added ? `${US.plural(r.added, 'moment')} in ${r.themes.length === 1 ? `the theme “${r.theme.name}”` : `${r.themes.length} themes (one per type)`}` : 'They’re all in their themes already', action: { label: 'Open Themes', fn: () => show('themes') } }); } }),
            ui.button('Build these moments', { small: true, kind: 'primary', icon: 'film', title: 'A new sequence, grouped by type, each type in its own colour and every clip labelled', onClick: () => US.jobs.run({ title: 'Building the moments', tool: 'story' }, job => buildMoments(job, shown, { colour: momColours, labels: momLabels, name: `Story – moments${momentType === 'all' ? '' : ' – ' + M.TYPES[momentType].plural.toLowerCase()}` })) })),
          h('div.row', ui.toggle({ label: 'Colour by type', hint: 'Bloopers Rose, Funny Mango, Off camera Teal, Poignant Purple', value: momColours, onChange: x => { momColours = x; US.settings.set('story.momentColours', x); } }),
            ui.toggle({ label: 'Label each moment', hint: 'A marker on every clip: “Funny – laughter”', value: momLabels, onChange: x => { momLabels = x; US.settings.set('story.momentLabels', x); } })),
          h('div.row', h('div.grow', seqSel),
            ui.button('Mark on string-out', { small: true, icon: 'target', title: 'Range markers coloured by type – Bloopers red, Funny orange, Off camera cyan, Poignant purple', onClick: () => US.jobs.run({ title: 'Marking moments on the string-out', tool: 'story' }, async job => { const r = await markMoments(job, { seqId: momSeq, list: shown }); render(); return r; }) }),
            marked ? ui.button('Remove markers', { small: true, kind: 'ghost', onClick: () => US.jobs.run({ title: 'Removing moment markers', tool: 'story' }, async job => { const r = await removeMomentMarkers(job, momSeq); render(); return r; }) }) : null)));
        const lst = h('div.story-results'), p = picked();
        if (!shown.length) lst.appendChild(ui.empty({ icon: 'star', title: list.length ? 'Nothing at this setting' : 'No moments found', text: list.length ? 'Choose a less picky setting or another type.' : 'Nothing stood out in the words or timing. With an AI key, each line can be checked more closely.' }));
        for (const m of shown.slice(0, 300)) {
          const l = lineById.get(m.lineId), ty = M.TYPES[m.type];
          lst.appendChild(lineRow(l, { reasons: m.reasons, checked: p.has(l.id), onCheck: on => togglePick(l.id, on), tag: ui.pill(ty.name, labelHex(ty.label)),
            extra: BOARD ? iconBtn('plus', 'Add to board', () => { const n = addMomentsToBoard([m]); ui.toast({ type: 'ok', title: n ? `Added to “Moments · ${ty.plural}”` : 'It’s on the board already', timeout: 2500 }); }) : null }));
        }
        if (shown.length > 300) lst.appendChild(h('div.field-hint', `…and ${shown.length - 300} more – choose a pickier setting.`));
        box.appendChild(lst);
        return box;
      }
      function drawResults(list) {
        US.clear(list);
        if (!lastQuery.trim()) { list.appendChild(h('div.field-hint', `Search ${US.plural(scopeLines().length, 'line')} (${scopeLabel().replace(/^All /, 'all ')}). Tick lines to add them to a theme or build them. “Find more” looks for anything on a topic that isn’t in a theme yet.`)); return; }
        if (!results.length) { list.appendChild(ui.empty({ icon: 'target', title: 'Nothing found', text: 'Try a shorter or different word, or “Find more”.' })); return; }
        list.appendChild(h('div.field-hint', `${US.plural(results.length, 'line')} · best first`));
        const p = picked();
        for (const r of results) list.appendChild(lineRow(r.line, { hits: r.hits, checked: p.has(r.line.id), onCheck: on => { togglePick(r.line.id, on); } }));
      }
      function drawMore(list) {
        US.clear(list);
        if (!moreTopic) { list.appendChild(h('div.field-hint', `Type a topic and press “Find more”. It leaves out everything already in your themes${BOARD ? ' and on the board' : ''}, so you only see what you might have missed.`)); return; }
        const relOf = new Map(moreResults.map(r => [r.line.id, r.rel]));
        const keep = () => new Set(pickLines(moreResults.map(r => r.line.id), { relOf: id => relOf.get(id), groupOf: interviewOf, opts: pickyFor(null) }));
        const box = h('div');
        const drawRows = () => {
          US.clear(box);
          const k = keep(), p = picked();
          const rows = moreResults.filter(r => k.has(r.line.id));
          if (!rows.length) { box.appendChild(ui.empty({ icon: 'target', title: moreResults.length ? 'Nothing at this setting' : 'Nothing new found', text: moreResults.length ? 'Choose a less picky setting above.' : 'Everything on this topic is already selected – or try other words.' })); return; }
          for (const r of rows) box.appendChild(lineRow(r.line, { reasons: r.reasons, checked: p.has(r.line.id), onCheck: on => togglePick(r.line.id, on) }));
        };
        list.append(h('div.field-hint', `Find more: “${moreTopic}” – ${US.plural(moreResults.length, 'new line')}. ${moreInfo}`),
          moreResults.length ? ui.section('How picky', [pickyControl({ withOptions: true, get: () => pickyFor(null), countAt: o => pickLines(moreResults.map(r => r.line.id), { relOf: id => relOf.get(id), groupOf: interviewOf, opts: o }).length, set: partial => { state.picky = Object.assign(pickyFor(null), partial); saveNow(); drawMore(list); } })], { open: false }) : null,
          box);
        drawRows();
      }
      function togglePick(id, on) {
        const p = picked(); if (on) p.add(id); else p.delete(id);
        state.picked = Array.from(p); save();
        const bar = panes.search.querySelector('.story-picked'); if (bar) bar.replaceWith(pickedBar());
      }
      function pickedBar() {
        const ids = (state.picked || []).filter(id => lineById.has(id)), n = ids.length;
        const tgt = targetTheme && state.themes.find(t => t.id === targetTheme), tcol = targetColumn && state.wall.columns.find(c => c.id === targetColumn);
        const done = (k, name) => { state.picked = []; save(); ui.toast({ type: 'ok', title: `${US.plural(k, 'line')} added to “${name}”`, timeout: 3000 }); if (moreMode) moreResults = moreResults.filter(r => !ids.includes(r.line.id)); render(); };
        return h('div.story-picked' + (n ? '' : '.hidden'),
          h('span', h('b', n), ' picked'),
          tgt ? ui.button(`Add to ${tgt.name}`, { small: true, kind: 'primary', onClick: () => done(addLinesToTheme(tgt, ids, { manual: true }), tgt.name) })
            : tcol ? ui.button(`Add to ${tcol.name}`, { small: true, kind: 'primary', onClick: () => { const th = tcol.themeId && state.themes.find(t => t.id === tcol.themeId); let k; if (th) k = addLinesToTheme(th, ids, { manual: true }); else { const have = new Set(state.wall.columns.flatMap(c => c.cards.map(x => x.lineId))); const add = ids.filter(id => !have.has(id)); add.forEach(id => tcol.cards.push({ lineId: id })); k = add.length; saveNow(); } done(k, tcol.name); } })
              : ui.button('Add to theme…', { small: true, onClick: () => addPickedToTheme(ids) }),
          !tgt && !tcol ? ui.button('New theme from these', { small: true, onClick: async () => { const nm = await ui.promptText({ title: 'New theme', label: 'Name', value: US.cap((moreMode && moreTopic) || lastQuery || 'New theme') }); if (!nm) return; const th = newThemeFrom(nm.trim(), ids); done(ids.length, th.name); } }) : null,
          BOARD ? ui.button('Add to board', { small: true, onClick: () => { addToWall(ids, 'Picked lines'); ui.toast({ type: 'ok', title: `${US.plural(n, 'line')} added to the board`, action: { label: 'Open board', fn: () => show('wall') } }); } }) : null,
          tgt || tcol || moreMode ? null : ui.button('Build sequence', { small: true, kind: 'primary', onClick: () => US.actions.run('story.build', { source: 'picked' }) }),
          ui.button('Clear', { small: true, kind: 'ghost', onClick: () => { state.picked = []; save(); render(); } }));
      }
      async function addPickedToTheme(ids) {
        if (!state.themes.length) { ui.toast({ type: 'info', title: 'There are no themes yet.', text: 'Find themes in step 2, or press “New theme from these”.' }); return; }
        const sel = ui.select({ options: state.themes.map(t => ({ value: t.id, label: `${t.name} (${t.lineIds.length})` })), value: state.themes[0].id });
        const ok = await ui.modal({ title: `Add ${US.plural(ids.length, 'line')} to a theme`, body: h('div', sel), buttons: [{ label: 'Cancel', value: false, kind: 'ghost' }, { label: 'Add', value: true, kind: 'primary' }] });
        if (!ok) return;
        const th = state.themes.find(t => t.id === sel.get());
        const k = addLinesToTheme(th, ids, { manual: true });
        ui.toast({ type: 'ok', title: `${US.plural(k, 'line')} added to “${th.name}”`, timeout: 3000 });
        if (moreMode) moreResults = moreResults.filter(r => !ids.includes(r.line.id));
        state.picked = []; save();
        render();
      }
      /** One line: text with highlighted hits, speaker/clip/time, play, optional checkbox / remove button. */
      function lineRow(l, { hits = [], checked, onCheck, onRemove, reasons = null, tag = null, extra = null } = {}) {
        const t = clipOfLine.get(l.id);
        const q = T.quality(l);
        const textEl = h('div.story-text');
        const terms = hits.filter(x => x.how === 'word' || x.how === 'root' || x.how === 'phrase').map(x => x.term);
        textEl.innerHTML = highlight(l.text, terms);
        const box = onCheck ? h('input', { type: 'checkbox', checked: !!checked, onchange: e => onCheck(e.target.checked) }) : null;
        return h('div.story-row' + (checked ? '.on' : ''), { onclick: e => { if (box && e.target === textEl) { box.checked = !box.checked; onCheck(box.checked); e.currentTarget.classList.toggle('on', box.checked); } } },
          box, h('span.story-bar', { style: { background: speakerColor(l.speaker) } }),
          h('div.story-main', textEl, reasons && reasons.length ? h('div.story-why', 'Why: ' + reasons.join(' · ')) : null, h('div.story-meta', tag, `${[speakerName(l.speaker) !== speakerName('') ? speakerName(l.speaker) : '', t ? t.name : ''].filter(Boolean).join(' · ')} · ${US.fmtDur(l.start)} · ${(l.end - l.start).toFixed(1)} s`, q.score >= STRONG ? ui.pill('★ strong', 'var(--ok)') : null, hits.some(x => x.how === 'sounds like') ? ui.pill('sounds like', 'var(--info)') : null, hits.some(x => x.how === 'related') && !terms.length ? ui.pill('related', 'var(--text-2)') : null)),
          playButton(l), extra,
          onRemove ? iconBtn('close', 'Take this line out of the theme', onRemove) : null);
      }
      function highlight(text, terms) {
        let s = US.esc(text);
        const stems = terms.map(x => T.stem(x));
        s = s.replace(/[A-Za-zÀ-ɏ']+/g, w => (stems.includes(T.stem(w)) || terms.includes(w.toLowerCase()) ? `<mark>${w}</mark>` : w));
        for (const ph of terms.filter(x => /\s/.test(x))) s = s.replace(new RegExp(ph.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'ig'), m => `<mark>${m}</mark>`);
        return s;
      }
      function playButton(l, at = l.start) {
        return h('button.icon-btn', { title: 'Play in the Source Monitor', onclick: async e => {
          e.stopPropagation();
          const t = clipOfLine.get(l.id);
          try {
            const items = await resolveItems([t]);
            const id = items.get(t.key);
            if (!id) throw new US.UserError('NOT_FOUND', { title: `“${t.name}” isn’t linked to a clip.`, action: 'Link it in Story › 1 Interviews › Interviews and speakers, then try again.' });
            await US.host.cue(id, Math.max(0, at - 0.2), { play: true });
          } catch (err) { ui.showError(err); }
        } }, US.icon('play', 15));
      }

      /* ---------- shared "how it looks in the timeline" options ---------- */
      function lookControls({ withNames = true } = {}) {
        const L = lookOptions();
        const strongSw = swatchButton(L.strong.label, i => { US.settings.set('story.strongLabel', i); render(); }, 'Highlight colour');
        return [
          ui.toggle({ label: 'Colour each theme', hint: 'Every theme’s clips get its colour label, so you can tell them apart in the timeline.', value: L.colour, onChange: x => US.settings.set('story.colourThemes', x) }),
          h('div.row.story-strong-row', ui.toggle({ label: 'Highlight the strongest lines', hint: `In ${labelName(L.strong.label)} with a ★ – overrides the theme colour.`, value: L.strong.highlight, onChange: x => US.settings.set('story.strongHighlight', x) }), strongSw),
          ui.toggle({ label: 'Strongest lines first in each theme', hint: 'Pinned cards still come first.', value: L.strong.first, onChange: x => US.settings.set('story.strongFirst', x) }),
          withNames ? ui.field('Theme names in the timeline', ui.segmented({ options: [{ value: 'marker', label: 'Markers' }, { value: 'layer', label: 'Name layer', title: 'A clip named after the theme on the track above, spanning the theme' }, { value: 'both', label: 'Both' }, { value: 'none', label: 'Off' }], value: L.themeNames, onChange: x => US.settings.set('story.themeNames', x) }), 'Name layer uses an adjustment layer from your project if there is one (File › New › Adjustment Layer).') : null
        ];
      }

      /* ---------- Themes ---------- */
      let mergeSel = new Set(), openThemes = new Set();
      function renderThemes() {
        const el = US.clear(panes.themes);
        if (!state.transcripts.length) { el.appendChild(needTranscripts()); return; }
        const aiOn = US.ai && US.ai.available();
        el.appendChild(stepHead('themes'));
        el.appendChild(scopeChip());
        // one pass: your themes and the ones Story finds
        const ownIn = ui.input({ value: ownThemeNames().join(', '), placeholder: 'Optional – e.g. Gratitude, first day in Israel, faith', onInput: x => { state.ownThemes = splitThemes(x); save(); } });
        const findThemes = async useAI => {
          state.ownThemes = splitThemes(ownIn.value); saveNow();
          if (state.themes.length && !(await ui.confirm({ title: 'Find themes again?', text: 'Found themes are replaced and your themes are looked for again. Lines you added to a theme by hand stay.', ok: 'Find themes' }))) return;
          await US.actions.run('story.themes', { useAI }); render();
        };
        el.appendChild(ui.card(h('div.card-title', 'Find themes'),
          h('div.muted', aiOn ? `${US.ai.label()} reads the text of your lines once and finds your themes and its own in the same pass – nothing is read twice.` : 'Story finds your themes by their words and groups the rest by what they’re about (family, faith, community…). Add an AI key in Settings for smarter, named themes.'),
          ui.field('Your themes', ownIn, 'Separate them with commas. Leave it empty to let Story find them all.'),
          h('div.row', ui.actionButton(aiOn ? `Find themes with ${US.ai.label()}` : 'Find themes', () => findThemes(!!aiOn), { icon: 'spark', block: false }),
            aiOn ? ui.button('Without AI', { onClick: () => findThemes(false) }) : null),
          aiOn ? readsControl('themes') : null));
        if (!state.themes.length) return;
        const themes = state.themes;
        el.appendChild(h('div.row',
          h('span.field-hint.grow', `${US.plural(themes.length, 'theme')} · tick two or more to merge`),
          ui.button('Merge ticked', { small: true, onClick: mergeThemes }),
          BOARD ? ui.button('Arrange on the board', { small: true, kind: 'primary', icon: 'story', title: 'Put every theme on the post-it board, ready to sort and arrange', onClick: async () => { if (state.wall.columns.length && !(await ui.confirm({ title: 'Replace the board?', text: 'The board is rebuilt from these themes (as chosen by How picky). Notes, order and idea cards on it are lost.', ok: 'Replace' }))) return; fillWallFromThemes(); show('wall'); } }) : null));
        // how picky (project setting; a theme can have its own in its ⋯ menu)
        const named = themes.filter(t => t.name !== 'Other');
        const totalAt = o => named.reduce((n, t) => n + pickLines(t.lineIds, { relOf: relevanceOf(t), groupOf: interviewOf, manual: new Set(t.manual || []), opts: t.picky && t.picky.s != null ? Object.assign({}, o, { s: t.picky.s }) : o }).length, 0);
        el.appendChild(ui.card(h('div.card-title', 'How picky', h('span.right', 'used for building, bins, Find more and the narrative')),
          pickyControl({ get: () => pickyFor(null), countAt: totalAt, set: partial => { state.picky = Object.assign(pickyFor(null), partial); saveNow(); render(); } })));
        for (const th of themes) {
          const all = th.lineIds.filter(id => lineById.has(id));
          const ids = effectiveLines(th), lines = ids.map(id => lineById.get(id));
          const isOpen = openThemes.has(th.id);
          const strongN = lines.filter(isStrong).length;
          const lv = th.picky && th.picky.s != null ? (pickyLevel(th.picky.s) ? PICKY_TEXT[pickyLevel(th.picky.s)][0] : 'custom') : null;
          const more = isOpen ? h('div.story-theme-lines', lines.slice(0, 80).map(l => lineRow(l, { onRemove: () => { removeLineFromTheme(th, l.id); render(); } })),
            lines.length > 80 ? h('div.field-hint', `…and ${lines.length - 80} more`) : null,
            all.length > ids.length ? h('div.field-hint', `${US.plural(all.length - ids.length, 'more line')} at a less picky setting.`) : null) : null;
          el.appendChild(h('div.card.story-theme', { style: { borderLeftColor: labelHex(th.label) } },
            h('div.row',
              h('input', { type: 'checkbox', title: 'Tick to merge', checked: mergeSel.has(th.id), onchange: e => { e.target.checked ? mergeSel.add(th.id) : mergeSel.delete(th.id); } }),
              swatchButton(th.label, i => { setColour(th, i); saveNow(); render(); }, 'Theme colour'),
              h('div.grow', h('div.card-title', th.name, th.custom ? ui.pill(th.by === 'ai' ? 'yours · AI' : 'yours', 'var(--accent-hi)') : null, lv ? ui.pill(`this theme: ${lv}`, 'var(--info)') : null,
                h('span.right', { title: all.length !== ids.length ? `${all.length} lines in the theme, ${ids.length} kept at this setting` : '' }, `${all.length !== ids.length ? `${all.length} → ` : ''}${US.plural(ids.length, 'line')}${strongN ? ` · ★ ${strongN}` : ''}`)),
                h('div.field-hint', th.summary || (th.keywords && th.keywords.length ? th.keywords.join(' · ') : th.custom ? `Lines about “${th.query}”` : ''))),
              iconBtn('more', 'More', e => popMenu(e.currentTarget, [
                { label: 'Rename…', onClick: async () => { const n = await ui.promptText({ title: 'Rename theme', value: th.name }); if (n && n.trim()) { th.name = n.trim(); syncWallNames(); saveNow(); render(); } } },
                { label: 'Colour…', onClick: async () => { const i = await pickColour(th.label); if (i != null) { setColour(th, i); saveNow(); render(); } } },
                { label: 'How picky for this theme…', onClick: () => themePickyDialog(th) },
                { label: 'Move up', onClick: () => { const i = state.themes.indexOf(th); if (i > 0) { moveIn(state.themes, i, i - 1); saveNow(); render(); } } },
                { label: 'Move down', onClick: () => { const i = state.themes.indexOf(th); if (i < state.themes.length - 1) { moveIn(state.themes, i, i + 1); saveNow(); render(); } } },
                { label: 'Find more for this theme…', onClick: () => startFindMore({ topic: th.query || th.name, theme: th }) },
                th.custom ? { label: 'Look again (new transcripts)', onClick: () => US.jobs.run({ title: `Looking again for “${th.name}”`, tool: 'story' }, async job => { const k = await refreshCustomTheme(job, th, { useAI: th.by === 'ai' }); render(); return { summary: k ? `${US.plural(k, 'new line')} added` : 'no new lines' }; }) } : null,
                null,
                { label: 'Delete theme', danger: true, onClick: async () => { if (await ui.confirm({ title: `Delete “${th.name}”?`, text: th.custom && !th.picked ? 'The lines stay in Find. It’s also taken off “Your themes”, so Find themes won’t look for it again.' : 'The lines stay in Find.', ok: 'Delete' })) { state.themes = state.themes.filter(x => x !== th); if (th.custom) state.ownThemes = ownThemeNames().filter(x => SAI().normName(x) !== SAI().normName(th.query || th.name)); saveNow(); render(); } } }].filter((x, i, arr) => x !== null || (i > 0 && arr[i - 1] !== null))))),
            isOpen ? null : lines.slice(0, 2).map(l => h('div.story-quote', `“${l.text}”`, h('span.story-meta', ' – ' + whoSaid(l)))),
            lines.length ? null : h('div.field-hint', all.length ? 'No lines at this setting – try a less picky one.' : 'No lines yet – press “Find more” to look for some.'),
            h('div.row',
              lines.length > 2 || isOpen ? ui.button(isOpen ? 'Show less' : `Show all ${lines.length}`, { small: true, kind: 'ghost', onClick: () => { isOpen ? openThemes.delete(th.id) : openThemes.add(th.id); render(); } }) : null,
              ui.button('Find more', { small: true, kind: 'ghost', icon: 'target', title: 'Look for more lines on this theme that aren’t selected yet', onClick: () => startFindMore({ topic: th.query || th.name, theme: th }) })),
            more));
        }
        // one more theme later, without reading everything again
        const oneIn = ui.input({ placeholder: 'e.g. The market', onEnter: () => addOne() });
        let useAI = US.settings.get('story.ownAI', true);
        async function addOne() {
          const text = oneIn.value.trim();
          if (!text) { oneIn.focus(); return; }
          const r = await US.actions.run('story.addTheme', { theme: text, useAI: !!(aiOn && useAI) });
          if (r) { oneIn.value = ''; openThemes.add(r.theme.id); render(); }
        }
        el.appendChild(ui.section('Add one more theme', [
          h('div.field-hint', 'Story looks only at lines that could be about it – cheaper than finding all the themes again. It’s added to “Your themes” too.'),
          h('div.row', h('div.grow', oneIn), ui.actionButton('Find lines', addOne, { icon: 'target', block: false })),
          aiOn ? ui.toggle({ label: `Let ${US.ai.label()} choose the lines`, hint: 'Finds lines that say it in other words. Only the text of your lines is sent.', value: useAI, onChange: x => { useAI = x; US.settings.set('story.ownAI', x); render(); } }) : null,
          aiOn && useAI ? readsControl('ownTheme') : null], { open: false, hint: 'without reading everything again' }));
        el.appendChild(nextBar('themes', { skip: true }));
      }
      function themePickyDialog(th) {
        const body = h('div');
        const draw = () => {
          US.clear(body).appendChild(pickyControl({
            withOptions: false,
            get: () => pickyFor(th),
            countAt: o => effectiveLines(th, o.s).length,
            set: partial => { th.picky = { s: partial.s != null ? partial.s : pickyFor(th).s }; saveNow(); draw(); },
            extra: h('div.row', ui.button('Use the project setting', { small: true, kind: 'ghost', onClick: () => { delete th.picky; saveNow(); draw(); } }), h('span.field-hint', th.picky ? 'This theme has its own setting.' : 'Following the project setting.'))
          }));
        };
        draw();
        ui.modal({ title: `How picky for “${th.name}”`, wide: true, body, buttons: [{ label: 'Done', value: true, kind: 'primary' }] }).then(() => render());
      }
      function mergeThemes() {
        const sel = state.themes.filter(t => mergeSel.has(t.id));
        if (sel.length < 2) { ui.toast({ type: 'info', title: 'Tick two or more themes to merge them.' }); return; }
        const keep = sel[0];
        for (const t of sel.slice(1)) {
          addLinesToTheme(keep, t.lineIds);
          if (t.manual) keep.manual = Array.from(new Set((keep.manual || []).concat(t.manual)));
          if (t.scores || keep.scores) { const relK = relevanceOf(keep), relT = relevanceOf(t); const sc = {}; keep.lineIds.forEach(id => { sc[id] = Math.max(t.lineIds.includes(id) ? relT(id) : 0, relK(id)); }); keep.scores = sc; }
        }
            // themes merged away aren't looked for again; the lines merged in stay when Find themes runs again
        // (into one of your themes: as lines added by hand; into a found theme: it becomes a theme you made)
        const gone = sel.slice(1).filter(t => t.custom).map(t => SAI().normName(t.query || t.name));
        if (gone.length) state.ownThemes = ownThemeNames().filter(x => !gone.includes(SAI().normName(x)));
        if (keep.custom) keep.manual = Array.from(new Set((keep.manual || []).concat(sel.slice(1).flatMap(t => t.lineIds)))).filter(id => lineById.has(id));
        else Object.assign(keep, { custom: true, picked: true, query: keep.name });
        state.themes = state.themes.filter(t => t === keep || !mergeSel.has(t.id));
        mergeSel = new Set(); saveNow(); render();
        ui.toast({ type: 'ok', title: `Merged into “${keep.name}”`, timeout: 2500 });
      }

      /* ---------- Board (the post-it board) ---------- */
      let showHidden = false, fullScreen = false;
      const selected = new Set();
      const boardHelpers = () => ({
        lineOf: id => lineById.get(id),
        themeOf: id => state.themes.find(t => t.name !== 'Other' && t.lineIds.includes(id)) || null,
        speakerName, interviewOf: id => { const t = clipOfLine.get(id); return { key: t ? t.key : '', name: t ? t.name : '' }; },
        strength: l => T.quality(l).score, colourFor: (key, used) => nextColour(used, strongLabel())
      });
      const pastel = hex => { const n = parseInt(String(hex).slice(1), 16), mix = c => Math.round(c + (255 - c) * 0.62); return `rgb(${mix(n >> 16 & 255)},${mix(n >> 8 & 255)},${mix(n & 255)})`; };
      const tilt = key => { let x = 0; for (const ch of String(key)) x = (x * 31 + ch.charCodeAt(0)) | 0; return ((Math.abs(x) % 21) - 10) / 10; }; // -1..1 degree, stable per card
      function setFull(on) {
        fullScreen = on;
        document.body.classList.toggle('focus', on);
        v.el.classList.toggle('story-full', on);
        render();
      }
      document.addEventListener('keydown', e => { if (e.key === 'Escape' && fullScreen) setFull(false); });
      window.addEventListener('resize', US.debounce(() => { if (tab === 'wall') fitBoard(); }, 120));
      function fitBoard() {
        const area = panes.wall.querySelector('.board-area'); if (!area) return;
        const top = area.getBoundingClientRect().top;
        area.style.height = Math.max(320, window.innerHeight - top - (fullScreen ? 8 : 16)) + 'px';
      }
      function arrangeMenu(anchor) {
        const H = boardHelpers(), go = f => { f(); saveNow(); render(); };
        popMenu(anchor, [
          { label: 'Group by theme', onClick: () => go(() => B().groupBy(state.wall, 'theme', H)) },
          { label: 'Group by speaker', onClick: () => go(() => B().groupBy(state.wall, 'speaker', H)) },
          { label: 'Group by interview', onClick: () => go(() => B().groupBy(state.wall, 'interview', H)) },
          null,
          { label: 'Sort: strongest first', onClick: () => go(() => B().sortGroups(state.wall, 'strength', H)) },
          { label: 'Sort: shortest first', onClick: () => go(() => B().sortGroups(state.wall, 'length', H)) },
          { label: 'Sort: by speaker', onClick: () => go(() => B().sortGroups(state.wall, 'speaker', H)) },
          { label: 'Sort: by interview', onClick: () => go(() => B().sortGroups(state.wall, 'interview', H)) },
          { label: 'Sort: in interview order', onClick: () => go(() => B().sortGroups(state.wall, 'time', H)) }
        ]);
      }
      function paperMenu(anchor) {
        const go = format => US.jobs.run({ title: 'Saving the paper edit', tool: 'story' }, async job => {
          const x = await exportBoard(job, format);
          ui.toast({ type: 'ok', title: 'Paper edit saved', text: US.basename(x.file), action: { label: 'Open', fn: () => openFile(x.file) } });
          return x;
        });
        popMenu(anchor, [
          { label: 'Word document', onClick: () => go('docx') },
          { label: 'Spreadsheet (.csv)', onClick: () => go('csv') },
          { label: 'Plain text', onClick: () => go('txt') }
        ]);
      }
      async function addIdeaCard(at) {
        const text = await ui.promptText({ title: 'Idea note', label: 'A concept, or a placeholder like “B-roll of the market”', multiline: true, placeholder: 'B-roll of the market' });
        if (text == null || !text.trim()) return;
        if (state.wall.mode === 'free') B().addIdea(state.wall, text, at || { x: 40, y: 40 });
        else { let g = state.wall.columns.find(c => c.name === 'Ideas'); if (!g) { g = { id: US.uid('c'), name: 'Ideas', cards: [] }; state.wall.columns.push(g); ensureColours(); } B().addIdea(state.wall, text, { group: g }); }
        saveNow(); render();
      }
      async function addGroup() {
        const n = await ui.promptText({ title: 'New group', label: 'Name (e.g. Act 1, Opening, Faith)', value: `Group ${state.wall.columns.length + 1}` });
        if (!n) return;
        state.wall.columns.push({ id: US.uid('c'), name: n.trim() || 'Group', cards: [] }); ensureColours(); saveNow(); render();
      }
      function renderWall() {
        const el = US.clear(panes.wall);
        if (!state.transcripts.length) { el.appendChild(needTranscripts()); return; }
        B().ensure(state.wall); ensureColours();
        const cols = state.wall.columns, mode = state.wall.mode;
        for (const k of Array.from(selected)) if (!B().allCards(state.wall).some(x => x.card === k)) selected.delete(k);
        const fullBtn = ui.button(fullScreen ? 'Exit full screen' : 'Full screen', { small: true, kind: fullScreen ? 'primary' : 'secondary', title: fullScreen ? 'Back to the normal view (Esc)' : 'Just the board, as big as the panel. Tip: press ` (the key above Tab) in Premiere to maximise this panel.', onClick: () => setFull(!fullScreen) });
        const bar = fullScreen
          ? h('div.board-bar.slim', fullBtn, ui.button('Arrange', { small: true, icon: 'more', onClick: e => arrangeMenu(e.currentTarget) }), ui.button('Idea', { small: true, icon: 'plus', onClick: () => addIdeaCard() }),
              h('span.grow'), ui.actionButton('Build sequence', () => US.actions.run('story.build', { source: 'wall' }), { icon: 'film', block: false, small: true }))
          : h('div.board-bar',
              ui.segmented({ options: [{ value: 'columns', label: 'Columns' }, { value: 'free', label: 'Free board', title: 'Place cards and groups anywhere' }], value: mode, onChange: m => { state.wall.mode = m; saveNow(); render(); } }),
              ui.button('Arrange', { small: true, icon: 'more', title: 'Group by theme, speaker or interview; sort by strength, length…', onClick: e => arrangeMenu(e.currentTarget) }),
              ui.button('Idea', { small: true, icon: 'plus', title: 'A blank post-it for an idea or a placeholder', onClick: () => addIdeaCard() }),
              ui.button('Group', { small: true, icon: 'plus', onClick: addGroup }),
              ui.button('Paper edit', { small: true, icon: 'deliver', title: 'Save the board as a document to share: each group in order, with speakers, source timecodes and notes', onClick: e => paperMenu(e.currentTarget) }),
              state.themes.length ? ui.button(cols.length ? 'Refill from themes' : 'Arrange on the board', { small: true, icon: 'spark', onClick: async () => { if (cols.length && !(await ui.confirm({ title: 'Refill the board from your themes?', text: 'The board is rebuilt from the themes (as chosen by How picky). Notes, order and idea cards on it are lost.', ok: 'Refill' }))) return; fillWallFromThemes(); render(); } }) : null,
              ui.toggle({ label: 'Show hidden', value: showHidden, onChange: x => { showHidden = x; render(); } }),
              h('span.grow'), fullBtn);
        el.appendChild(bar);
        if (selected.size) el.appendChild(selectionBar());
        if (!cols.length && !state.wall.loose.length) {
          el.appendChild(ui.empty({ icon: 'story', title: 'The board is empty', text: state.themes.length ? 'Put your themes on it, or tick lines in Find and press “Add to board”.' : 'Find themes first, or tick lines in Find and press “Add to board”.', action: state.themes.length ? ui.button('Arrange on the board', { kind: 'primary', icon: 'spark', onClick: () => { fillWallFromThemes(); render(); } }) : null }));
          return;
        }
        const area = h('div.board-area');
        el.appendChild(area);
        if (mode === 'free') renderFree(area); else renderColumns(area);
        if (!fullScreen) el.appendChild(h('div.field-hint.board-hint', mode === 'free'
          ? 'Drag cards into a group to snap them in, or anywhere to park them. Drag empty space to move around; double-click it for an idea note. Shift-click to select several.'
          : 'Move groups with ◀ ▶ and cards with ▲ ▼ (or drag). Shift-click cards to select several. Build the sequence on the Build tab.'));
        requestAnimationFrame(fitBoard);
      }
      function selectionBar() {
        const cards = Array.from(selected);
        return h('div.story-picked.board-sel',
          h('span', h('b', cards.length), ' selected'),
          ui.button('Move to…', { small: true, onClick: async () => {
            const sel = ui.select({ options: state.wall.columns.map(c => ({ value: c.id, label: c.name })), value: state.wall.columns[0] && state.wall.columns[0].id });
            if (!state.wall.columns.length) return;
            const ok = await ui.modal({ title: `Move ${US.plural(cards.length, 'card')} to…`, body: h('div', sel), buttons: [{ label: 'Cancel', value: false, kind: 'ghost' }, { label: 'Move', value: true, kind: 'primary' }] });
            if (ok) { B().moveCards(state.wall, cards, state.wall.columns.find(c => c.id === sel.get())); selected.clear(); saveNow(); render(); }
          } }),
          ui.button('Hide', { small: true, onClick: () => { cards.forEach(k => { k.hidden = true; }); selected.clear(); saveNow(); render(); } }),
          ui.button('Show', { small: true, kind: 'ghost', onClick: () => { cards.forEach(k => { k.hidden = false; }); saveNow(); render(); } }),
          ui.button('Remove', { small: true, kind: 'ghost', onClick: () => { cards.forEach(k => B().detach(state.wall, k)); selected.clear(); saveNow(); render(); } }),
          ui.button('Clear', { small: true, kind: 'ghost', onClick: () => { selected.clear(); render(); } }));
      }
      /* columns mode */
      function renderColumns(area) {
        const board = h('div.wall');
        state.wall.columns.forEach((c, ci) => board.appendChild(columnEl(c, ci)));
        if (state.wall.loose.length) board.appendChild(columnEl({ id: '__loose', name: 'On the free board', label: null, cards: state.wall.loose.map(l => l.card), loose: true }, -1));
        area.appendChild(board);
      }
      function columnEl(c, ci) {
        const cols = state.wall.columns, label = c.loose ? null : columnLabel(c);
        const cards = c.cards.filter(k => (B().isIdea(k) || lineById.has(k.lineId)) && (showHidden || !k.hidden));
        const head = h('div.wall-head', { dataset: { col: ci } },
          c.loose ? null : h('span.wall-grip', { title: 'Drag to move this group' }, US.icon('grip', 14)),
          c.loose ? null : swatchButton(label, i => { setColour(c, i); saveNow(); render(); }, 'Group colour'),
          h('span.wall-name', { title: c.loose ? 'Cards parked on the free board – they aren’t built until they’re in a group' : 'Click to rename', onclick: () => { if (!c.loose) renameColumn(c); } }, c.name),
          h('span.wall-count', String(c.cards.filter(k => !k.hidden && !B().isIdea(k)).length)),
          c.loose ? null : iconBtn('left', 'Move group left', () => { if (moveColumn(ci, 'left')) { saveNow(); render(); } }, ci === 0 ? '.dim' : ''),
          c.loose ? null : iconBtn('right', 'Move group right', () => { if (moveColumn(ci, 'right')) { saveNow(); render(); } }, ci === cols.length - 1 ? '.dim' : ''),
          c.loose ? null : iconBtn('more', 'More', e => groupMenu(e.currentTarget, c, ci)));
        const body = h('div.wall-cards', { dataset: { col: ci } }, cards.map(k => cardEl(k, c)));
        if (!cards.length) body.appendChild(h('div.wall-empty', 'Drop cards here'));
        const col = h('div.wall-col', { dataset: { col: ci }, style: { borderTopColor: label != null ? labelHex(label) : 'var(--border)' } }, head, body);
        if (!c.loose) head.querySelector('.wall-grip').addEventListener('pointerdown', e => startColumnDrag(e, ci, col));
        return col;
      }
      function groupMenu(anchor, c, ci) {
        const cols = state.wall.columns, label = columnLabel(c), H = boardHelpers();
        popMenu(anchor, [
          { label: 'Rename…', onClick: () => renameColumn(c) },
          { label: 'Colour…', onClick: async () => { const i = await pickColour(label); if (i != null) { setColour(c, i); saveNow(); render(); } } },
          { label: 'Find more for this group…', onClick: () => startFindMore({ topic: (c.themeId && (state.themes.find(t => t.id === c.themeId) || {}).query) || c.name, column: c }) },
          { label: 'Strongest lines first', onClick: () => { const one = { columns: [c], loose: [] }; B().sortGroups(one, 'strength', H); saveNow(); render(); } },
          { label: 'Idea note in this group…', onClick: async () => { const text = await ui.promptText({ title: 'Idea note', multiline: true, placeholder: 'B-roll of the market' }); if (text && text.trim()) { B().addIdea(state.wall, text, { group: c }); saveNow(); render(); } } },
          { label: 'Move to the start', onClick: () => { if (moveColumn(ci, 0)) { saveNow(); render(); } } },
          { label: 'Move to the end', onClick: () => { if (moveColumn(ci, cols.length - 1)) { saveNow(); render(); } } },
          null,
          { label: 'Delete group', danger: true, onClick: async () => { if (!c.cards.length || await ui.confirm({ title: `Delete “${c.name}”?`, text: `Its ${US.plural(c.cards.length, 'card')} leave the board. The lines stay in Find and Themes.`, ok: 'Delete' })) { cols.splice(cols.indexOf(c), 1); saveNow(); render(); } } }]);
      }
      async function renameColumn(c) { const n = await ui.promptText({ title: 'Rename group', value: c.name }); if (n && n.trim()) { c.name = n.trim(); const th = c.themeId && state.themes.find(t => t.id === c.themeId); if (th) th.name = c.name; saveNow(); render(); } }
      /** A post-it: a line (with play, ▲ ▼ and ⋯) or an idea note. */
      function cardEl(k, c, { free = false } = {}) {
        const label = c && !c.loose ? columnLabel(c) : null;
        const isIdea = B().isIdea(k);
        const l = isIdea ? null : lineById.get(k.lineId), t = isIdea ? null : clipOfLine.get(k.lineId);
        const strong = !isIdea && isStrong(l), tr = isIdea ? null : trimOf(k);
        const i = c ? c.cards.indexOf(k) : -1;
        const style = { '--tilt': tilt(B().keyOf(k)) + 'deg' };
        if (!isIdea && label != null) style.background = pastel(labelHex(label));
        const el = h('div.wall-card.postit' + (isIdea ? '.idea' : '') + (k.pinned ? '.pinned' : '') + (k.hidden ? '.is-hidden' : '') + (strong ? '.strong' : '') + (selected.has(k) ? '.selected' : ''), { dataset: { key: B().keyOf(k) }, style },
          isIdea ? h('div.wall-idea-tag', 'Idea') : h('span.story-bar', { style: { background: speakerColor(l.speaker) } }),
          h('div.wall-text', isIdea ? k.idea : tr ? tr.text : l.text),
          !isIdea && k.note ? h('div.wall-note', k.note) : null,
          h('div.wall-meta',
            h('span', strong ? h('b.wall-star', { title: 'One of the strongest lines' }, '★ ') : null, isIdea ? 'not built – becomes a marker' : `${l.speaker ? speakerName(l.speaker) + ' · ' : ''}${((tr || l).end - (tr || l).start).toFixed(0)} s${tr ? ' · trimmed' : ''}`),
            h('span.wall-btns',
              isIdea ? null : playButton(l, (tr || l).start),
              free || !c || c.loose ? null : iconBtn('up', 'Move up', () => { if (moveCard(c, k, 'up')) { saveNow(); render(); } }, i === 0 ? '.dim' : ''),
              free || !c || c.loose ? null : iconBtn('down', 'Move down', () => { if (moveCard(c, k, 'down')) { saveNow(); render(); } }, i === c.cards.length - 1 ? '.dim' : ''),
              iconBtn('more', 'More', e => cardMenu(e.currentTarget, k, c)))));
        el.title = isIdea ? 'Idea note – drag to move' : `${t ? t.name : ''} · ${US.fmtDur(l.start)}–${US.fmtDur(l.end)}\nDrag to move · Shift-click to select several`;
        el.addEventListener('pointerdown', e => { if (e.target.closest('button')) return; (free ? startFreeDrag : startCardDrag)(e, k, el); });
        return el;
      }
      function cardMenu(anchor, k, c) {
        const isIdea = B().isIdea(k), inGroup = c && !c.loose;
        popMenu(anchor, [
          inGroup ? { label: 'Move to the top', onClick: () => { moveCard(c, k, 'top'); saveNow(); render(); } } : null,
          inGroup ? { label: 'Move to the bottom', onClick: () => { moveCard(c, k, 'bottom'); saveNow(); render(); } } : null,
          { label: 'Move to a group…', onClick: () => moveToColumnDialog(k, c) },
          null,
          isIdea ? { label: 'Edit idea…', onClick: async () => { const n = await ui.promptText({ title: 'Idea note', value: k.idea, multiline: true }); if (n != null && n.trim()) { k.idea = n.trim(); saveNow(); render(); } } } : null,
          !isIdea && inGroup ? { label: k.pinned ? 'Unpin' : 'Pin to the top', onClick: () => { k.pinned = !k.pinned; if (k.pinned) moveIn(c.cards, c.cards.indexOf(k), 0); saveNow(); render(); } } : null,
          !isIdea ? { label: k.hidden ? 'Show (include in the sequence)' : 'Hide (leave out of the sequence)', onClick: () => { k.hidden = !k.hidden; saveNow(); render(); } } : null,
          !isIdea && k.trim ? { label: 'Use the whole line (untrim)', onClick: () => { delete k.trim; saveNow(); render(); } } : null,
          !isIdea ? { label: k.note ? 'Edit note…' : 'Add a note…', onClick: async () => { const n = await ui.promptText({ title: 'Note on this card', value: k.note || '', multiline: true, placeholder: 'e.g. use with the candle B-roll' }); if (n != null) { k.note = n.trim(); saveNow(); render(); } } } : null,
          null,
          { label: 'Remove from the board', danger: true, onClick: () => { B().detach(state.wall, k); selected.delete(k); saveNow(); render(); } }].filter((x, i, arr) => x !== null || (i > 0 && arr[i - 1] !== null)));
      }
      async function moveToColumnDialog(k, from) {
        const others = state.wall.columns.filter(c => c !== from);
        if (!others.length) { ui.toast({ type: 'info', title: 'There’s no other group.', text: 'Add a group first.' }); return; }
        const sel = ui.select({ options: others.map(c => ({ value: c.id, label: c.name })), value: others[0].id });
        const ok = await ui.modal({ title: 'Move card to…', body: h('div', sel), buttons: [{ label: 'Cancel', value: false, kind: 'ghost' }, { label: 'Move', value: true, kind: 'primary' }] });
        if (ok) { B().moveCards(state.wall, selected.has(k) ? Array.from(selected) : [k], state.wall.columns.find(c => c.id === sel.get())); selected.clear(); saveNow(); render(); }
      }
      /** click (no drag) on a card: select it; Shift/Cmd/Ctrl adds to the selection */
      function clickCard(e, k) {
        if (e.shiftKey || e.metaKey || e.ctrlKey) { selected.has(k) ? selected.delete(k) : selected.add(k); }
        else if (selected.size === 1 && selected.has(k)) selected.clear();
        else { selected.clear(); selected.add(k); }
        render();
      }
      /* dragging in columns mode (pointer events); a selected card drags all selected cards */
      function startCardDrag(e, k, el) {
        if (e.button !== 0) return;
        const sx = e.clientX, sy = e.clientY;
        let ghost = null, mark = null, target = null;
        const move = ev => {
          if (!ghost && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 5) return;
          if (!ghost) {
            const r = el.getBoundingClientRect();
            ghost = el.cloneNode(true); ghost.classList.add('wall-ghost'); ghost.style.width = r.width + 'px';
            if (selected.has(k) && selected.size > 1) ghost.appendChild(h('div.wall-ghost-count', `+${selected.size - 1}`));
            document.body.appendChild(ghost);
            el.classList.add('dragging'); mark = h('div.wall-drop');
          }
          ghost.style.left = (ev.clientX + 6) + 'px'; ghost.style.top = (ev.clientY + 6) + 'px';
          target = dropTarget(ev.clientX, ev.clientY, el);
          if (target && mark) { if (target.before) target.list.insertBefore(mark, target.before); else target.list.appendChild(mark); }
          autoScroll(ev);
        };
        const up = ev => {
          document.removeEventListener('pointermove', move); document.removeEventListener('pointerup', up);
          if (!ghost) { clickCard(ev, k); return; }
          ghost.remove(); mark && mark.remove(); el.classList.remove('dragging');
          if (!target || target.col < 0) return;
          const to = state.wall.columns[target.col];
          const moving = selected.has(k) && selected.size > 1 ? B().allCards(state.wall).map(x => x.card).filter(x => selected.has(x)) : [k];
          let idx = target.beforeKey ? to.cards.findIndex(x => B().keyOf(x) === target.beforeKey) : to.cards.length;
          if (idx < 0) idx = to.cards.length;
          B().moveCards(state.wall, moving, to, idx);
          saveNow(); render();
        };
        document.addEventListener('pointermove', move); document.addEventListener('pointerup', up);
      }
      function dropTarget(x, y, dragging) {
        const colEl = document.elementsFromPoint(x, y).map(n => n.closest && n.closest('.wall-col')).find(Boolean);
        if (!colEl) return null;
        const list = colEl.querySelector('.wall-cards');
        const cards = US.$$('.wall-card', list).filter(c => c !== dragging);
        const before = cards.find(c => { const r = c.getBoundingClientRect(); return y < r.top + r.height / 2; }) || null;
        return { col: +colEl.dataset.col, list, before, beforeKey: before ? before.dataset.key : null };
      }
      function autoScroll(ev) {
        const board = panes.wall.querySelector('.wall, .board-free'); if (!board) return;
        const r = board.getBoundingClientRect();
        if (ev.clientX > r.right - 30) board.scrollLeft += 12; else if (ev.clientX < r.left + 30) board.scrollLeft -= 12;
        if (ev.clientY > r.bottom - 30) board.scrollTop += 12; else if (ev.clientY < r.top + 30) board.scrollTop -= 12;
      }
      function startColumnDrag(e, ci, colEl) {
        e.preventDefault();
        const board = colEl.parentElement;
        colEl.classList.add('dragging');
        let to = ci;
        const move = ev => {
          const cols = US.$$('.wall-col', board).filter(c => +c.dataset.col >= 0);
          to = cols.findIndex(c => { const r = c.getBoundingClientRect(); return ev.clientX < r.left + r.width / 2; });
          if (to < 0) to = cols.length; // past the last group: move to the end
          cols.forEach((c, i) => { c.classList.toggle('drop-left', i === to && i !== ci && i !== ci + 1); c.classList.toggle('drop-right', to === cols.length && i === cols.length - 1 && i !== ci); });
          autoScroll(ev);
        };
        const up = () => {
          document.removeEventListener('pointermove', move); document.removeEventListener('pointerup', up);
          moveColumn(ci, to > ci ? to - 1 : to);
          saveNow(); render();
        };
        document.addEventListener('pointermove', move); document.addEventListener('pointerup', up);
      }
      /* free board mode */
      function renderFree(area) {
        const M = B().M, wall = state.wall;
        const scroller = h('div.board-free');
        area.appendChild(scroller);
        B().layout(wall, Math.max(500, area.clientWidth || 1000));
        const ext = B().extent(wall);
        const canvas = h('div.board-canvas', { style: { width: ext.w + 'px', height: ext.h + 'px' } });
        scroller.appendChild(canvas);
        for (const g of wall.columns) {
          const s = B().groupSize(g), label = columnLabel(g);
          const frame = h('div.bf-group', { style: { left: g.pos.x + 'px', top: g.pos.y + 'px', width: s.w + 'px', height: s.h + 'px', borderColor: labelHex(label), background: pastel(labelHex(label)).replace('rgb', 'rgba').replace(')', ',0.10)') } },
            h('div.bf-head', { title: 'Drag to move this group' }, swatchButton(label, i => { setColour(g, i); saveNow(); render(); }, 'Group colour'), h('span.wall-name', g.name), h('span.wall-count', String(g.cards.filter(k => !k.hidden && !B().isIdea(k)).length)), iconBtn('more', 'More', e => groupMenu(e.currentTarget, g, wall.columns.indexOf(g)))));
          frame.querySelector('.bf-head').addEventListener('pointerdown', e => { if (e.target.closest('button')) return; startGroupMove(e, g, frame, scroller); });
          canvas.appendChild(frame);
          g.cards.forEach((k, i) => {
            if (k.hidden && !showHidden) return;
            if (!B().isIdea(k) && !lineById.has(k.lineId)) return;
            const p = B().cardSlot(g, i);
            const c = cardEl(k, g, { free: true }); c.classList.add('bf-card'); Object.assign(c.style, { left: p.x + 'px', top: p.y + 'px', width: M.cardW + 'px', height: M.cardH + 'px' });
            canvas.appendChild(c);
          });
        }
        for (const lo of wall.loose) {
          const k = lo.card; if (!B().isIdea(k) && !lineById.has(k.lineId)) continue;
          const c = cardEl(k, null, { free: true }); c.classList.add('bf-card', 'loose'); Object.assign(c.style, { left: lo.x + 'px', top: lo.y + 'px', width: M.cardW + 'px', height: M.cardH + 'px' });
          canvas.appendChild(c);
        }
        // pan by dragging empty space; double-click for an idea note
        scroller.addEventListener('pointerdown', e => {
          if (e.target !== canvas && e.target !== scroller) return;
          const sx = e.clientX, sy = e.clientY, l0 = scroller.scrollLeft, t0 = scroller.scrollTop;
          scroller.classList.add('panning');
          const move = ev => { scroller.scrollLeft = l0 - (ev.clientX - sx); scroller.scrollTop = t0 - (ev.clientY - sy); };
          const up = () => { scroller.classList.remove('panning'); document.removeEventListener('pointermove', move); document.removeEventListener('pointerup', up); };
          document.addEventListener('pointermove', move); document.addEventListener('pointerup', up);
        });
        canvas.addEventListener('dblclick', e => { if (e.target !== canvas) return; const r = canvas.getBoundingClientRect(); addIdeaCard({ x: e.clientX - r.left - M.cardW / 2, y: e.clientY - r.top - 20 }); });
        const st = US.settings.get('story.boardScroll', null); if (st) { scroller.scrollLeft = st[0]; scroller.scrollTop = st[1]; }
        scroller.addEventListener('scroll', US.debounce(() => US.settings.set('story.boardScroll', [scroller.scrollLeft, scroller.scrollTop]), 300));
      }
      function startGroupMove(e, g, frame, scroller) {
        if (e.button !== 0) return;
        e.preventDefault();
        const sx = e.clientX, sy = e.clientY, x0 = g.pos.x, y0 = g.pos.y;
        let moved = false;
        const move = ev => { const dx = ev.clientX - sx, dy = ev.clientY - sy; if (!moved && Math.hypot(dx, dy) < 4) return; moved = true; frame.style.left = Math.max(0, x0 + dx) + 'px'; frame.style.top = Math.max(0, y0 + dy) + 'px'; frame.classList.add('moving'); };
        const up = ev => {
          document.removeEventListener('pointermove', move); document.removeEventListener('pointerup', up);
          if (!moved) return;
          const snap = v => Math.max(0, Math.round(v / 12) * 12);
          g.pos = { x: snap(x0 + ev.clientX - sx), y: snap(y0 + ev.clientY - sy) };
          saveNow(); render();
        };
        document.addEventListener('pointermove', move); document.addEventListener('pointerup', up);
      }
      function startFreeDrag(e, k, el) {
        if (e.button !== 0) return;
        const sx = e.clientX, sy = e.clientY;
        const canvas = el.parentElement, r0 = el.getBoundingClientRect();
        const offX = sx - r0.left, offY = sy - r0.top;
        let moved = false;
        const moving = () => (selected.has(k) && selected.size > 1 ? B().allCards(state.wall).map(x => x.card).filter(x => selected.has(x)) : [k]);
        const move = ev => {
          if (!moved && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 5) return;
          moved = true; el.classList.add('dragging-free');
          const cr = canvas.getBoundingClientRect();
          el.style.left = (ev.clientX - cr.left - offX) + 'px'; el.style.top = (ev.clientY - cr.top - offY) + 'px';
          autoScroll(ev);
        };
        const up = ev => {
          document.removeEventListener('pointermove', move); document.removeEventListener('pointerup', up);
          if (!moved) { clickCard(ev, k); return; }
          const cr = canvas.getBoundingClientRect();
          const x = ev.clientX - cr.left - offX, y = ev.clientY - cr.top - offY;
          const hit = B().hitGroup(state.wall, ev.clientX - cr.left, ev.clientY - cr.top);
          const cards = moving();
          if (hit) B().moveCards(state.wall, cards, hit.group, hit.index);
          else cards.forEach((c, i) => B().makeLoose(state.wall, c, x + i * 14, y + i * 14));
          saveNow(); render();
        };
        document.addEventListener('pointermove', move); document.addEventListener('pointerup', up);
      }

      /* ---------- Build ---------- */
      let hl = null, hlSeq = '', hlUse = Object.assign({ themes: true, board: true, builds: true }, US.settings.get('story.hlUse', {})), hlMarkers = US.settings.get('story.hlMarkers', false);
      function renderBuild() {
        const el = US.clear(panes.build);
        if (!state.transcripts.length) { el.appendChild(needTranscripts()); return; }
        B().ensure(state.wall);
        const L = lookOptions();
        el.appendChild(stepHead('build'));
        // build from the themes (or the board, when it's on)
        const groups = BOARD ? wallGroups() : themeGroups();
        const count = groups.reduce((n, g) => n + g.lineIds.length, 0);
        const secs = groups.reduce((n, g) => n + g.lineIds.reduce((m, id) => { const l = (g.trims && g.trims[id]) || lineById.get(id); return m + (l ? l.end - l.start + 2 * L.handles : 0); }, 0), 0);
        const nameIn = ui.input({ value: US.settings.get('story.seqName', 'Story – rough cut'), onInput: x => US.settings.set('story.seqName', x) });
        const named = state.themes.filter(t => t.name !== 'Other'), off = new Set(state.buildOff || []);
        const which = BOARD || !named.length ? null : ui.section('Themes to include', [h('div.field-hint', 'In the order of the Themes list (⋯ › Move up / down there). The lines are the ones How picky keeps.'),
          ...named.map(t => ui.toggle({ label: `${t.name} · ${US.plural(effectiveLines(t).length, 'line')}`, value: !off.has(t.id), onChange: x => { off[x ? 'delete' : 'add'](t.id); state.buildOff = Array.from(off); saveNow(); renderBuild(); } }))], { open: named.length <= 12, hint: off.size ? `${off.size} left out` : 'all of them' });
        el.appendChild(h('div.card', { dataset: { section: 'build' } }, h('div.card-title', BOARD ? 'Build a sequence from the board' : 'Build a sequence from your themes', h('span.right', `${US.plural(groups.length, BOARD ? 'group' : 'theme')} · ${US.plural(count, 'line')} · about ${US.fmtDur(secs)}`)),
          !BOARD && !named.length ? ui.note('Find themes first (step 2) – or tick lines in Find and press “Build sequence”.', 'info') : null,
          BOARD && state.wall.loose.length ? ui.note(`${US.plural(state.wall.loose.length, 'card')} parked on the free board ${state.wall.loose.length === 1 ? 'isn’t' : 'aren’t'} in a group, so ${state.wall.loose.length === 1 ? 'it isn’t' : 'they aren’t'} built.`, 'warn') : null,
          which,
          ui.field('Sequence name', nameIn),
          ui.section('In the timeline', lookControls({ withNames: true }), { open: false, hint: 'colours, ★ strongest lines, theme names' }),
          ui.section('Options', [ui.slider({ label: 'Handles', min: 0, max: 2, step: 0.1, value: L.handles, fmt: x => `${x.toFixed(1)} s each side`, onChange: x => US.settings.set('story.handles', x) })], { open: false }),
          ui.actionButton(BOARD ? 'Build sequence from the board' : 'Build sequence', () => US.actions.run('story.build', { source: BOARD ? 'wall' : 'themes' }), { icon: 'film' })));
        el.appendChild(narrativeCard());
        // bins by theme
        let seqs = US.settings.get('story.seqPerTheme', false);
        el.appendChild(h('div.card', { dataset: { section: 'bins' } }, h('div.card-title', 'Sort selects into bins'),
          h('div.muted', 'Makes a bin per theme with its lines as subclips, best first – the lines chosen by How picky. Your original clips are untouched.'),
          ui.toggle({ label: 'Also make a sequence per theme', value: seqs, onChange: x => { seqs = x; US.settings.set('story.seqPerTheme', x); } }),
          ui.section('Colours and highlights', lookControls({ withNames: true }), { open: false }),
          ui.actionButton('Sort into bins by theme', () => US.actions.run('story.bins', { sequences: seqs }), { icon: 'folder' })));
        // highlight selects on a string-out
        const seqSel = ui.select({ options: [], placeholder: 'Choose your string-out…', onChange: x => { hlSeq = x; hl = null; renderBuild(); } });
        US.host.call('listSequences').then(seqs => { if (!hlSeq) { const g = guessStringOut(seqs); hlSeq = (g && g.id) || (US.ctx.sequence && US.ctx.sequence.id) || ''; } seqSel.setOptions(seqs.map(q => ({ value: q.id, label: q.name })), hlSeq); }).catch(() => {});
        const had = hlSeq && state.highlights && state.highlights[hlSeq];
        const run = async markersToo => {
          const r = await US.jobs.run({ title: 'Highlighting selects on the string-out', tool: 'story' }, job => highlightStringOut(job, { seqId: hlSeq, use: hlUse, markers: markersToo }));
          if (r) { hl = r; renderBuild(); }
        };
        el.appendChild(h('div.card', { dataset: { section: 'highlights' } }, h('div.card-title', 'Highlight selects in a string-out'),
          h('div.muted', 'Puts every selected line on a “Selects” track above your string-out of all the interviews, in its theme’s colour – so you can scrub through and see what’s been chosen, and what’s been missed.'),
          ui.field('String-out', seqSel),
          h('div.grid2',
            ui.toggle({ label: 'Lines in themes', hint: 'As chosen by How picky', value: hlUse.themes, onChange: x => { hlUse.themes = x; US.settings.set('story.hlUse', hlUse); } }),
            ui.toggle({ label: BOARD ? 'Cards on the board' : 'Lines in your narratives', value: hlUse.board, onChange: x => { hlUse.board = x; US.settings.set('story.hlUse', hlUse); } }),
            ui.toggle({ label: 'Lines in sequences Story built', value: hlUse.builds, onChange: x => { hlUse.builds = x; US.settings.set('story.hlUse', hlUse); } }),
            ui.toggle({ label: 'Also add range markers', hint: 'For the Markers panel', value: hlMarkers, onChange: x => { hlMarkers = x; US.settings.set('story.hlMarkers', x); } })),
          h('div.row', ui.actionButton(had ? 'Highlight again' : 'Highlight selects', () => run(hlMarkers), { icon: 'spark', block: false }),
            ui.button('Show what’s missed', { icon: 'target', title: 'Coverage per interview, without changing the sequence', onClick: () => US.jobs.run({ title: 'Checking coverage', tool: 'story' }, async job => { const tl = await timelineTranscript(job, { seqId: hlSeq, tracks: 'auto' }); hl = { tl, sel: selectionMap(hlUse) }; renderBuild(); return { summary: 'coverage ready' }; }) }),
            had ? ui.button('Remove highlights', { kind: 'ghost', onClick: () => US.jobs.run({ title: 'Removing highlights', tool: 'story' }, async job => { const r = await removeHighlights(job, hlSeq); hl = null; renderBuild(); return r; }) }) : null),
          hl ? coverageView(hl) : null));
        el.appendChild(nextBar('build'));
      }
      /* narrative from a brief */
      let narBrief = US.settings.get('story.brief', ''), narAI = US.settings.get('story.narrativeAI', true);
      function narrativeCard() {
        const aiOn = US.ai && US.ai.available(), useAI = !!(aiOn && narAI);
        const parsed = h('div.field-hint.story-brief-parsed');
        const showParsed = x => { const b = N().parseBrief(x); parsed.textContent = x.trim() ? `${fmtSecs(b.seconds)}${b.said ? '' : ' (no length given)'} · ${b.topic ? `about “${b.topic}”` : 'from all your selects'}${b.tone ? ` · ${b.tone}` : ''}` : 'Say how long and what it’s about.'; };
        const input = ui.input({ value: narBrief, placeholder: 'e.g. a 60-second video about how the community looks after each other', onInput: x => { narBrief = x; US.settings.set('story.brief', x); showParsed(x); }, onEnter: () => go() });
        showParsed(narBrief);
        const go = () => { if (!narBrief.trim()) { input.focus(); return; } US.actions.run('story.narrative', { brief: narBrief, useAI }).then(r => { if (r) renderBuild(); }); };
        const latest = latestNarrative();
        return h('div.card', { dataset: { section: 'narrative' } }, h('div.card-title', 'Narrative from a brief'),
          h('div.muted', BOARD ? 'Describe the video and Story puts a story together from your interviews – a hook, the build and a payoff – fitted to the length. It uses your selects (themes and the board, as chosen by How picky) and other lines on the topic. It lands on the board as a new group, so you can rearrange it before building.'
            : 'Describe the video and Story puts a story together from your interviews – a hook, the build and a payoff – fitted to the length. It uses your themes (as chosen by How picky) and other lines on the topic, from what you chose to work on.'),
          input, parsed,
          aiOn ? ui.toggle({ label: `Let ${US.ai.label()} shape the story`, hint: 'It chooses the order, tightens lines by a few words and says what each one does. Only the text of your lines is sent.', value: narAI, onChange: x => { narAI = x; US.settings.set('story.narrativeAI', x); renderBuild(); } }) : null,
          useAI ? readsControl('narrative') : h('div.field-hint', h('b', 'Basic version (no AI): '), 'a short strong line first, then the most relevant lines (mixing voices) and the most heartfelt line last, fitted to the length.'),
          ui.actionButton(latest ? 'Make another narrative' : 'Make the narrative', go, { icon: 'spark' }),
          latest ? narrativeView(latest) : null);
      }
      function narrativeView(col) {
        const nar = col.narrative, L = lookOptions();
        const cards = col.cards.filter(k => k.lineId && !k.hidden && lineById.has(k.lineId));
        const total = cards.reduce((n, k) => { const x = trimOf(k) || lineById.get(k.lineId); return n + x.end - x.start + 2 * L.handles; }, 0);
        const off = total / nar.seconds - 1, acts = cards.length >= 3;
        return h('div.story-narrative', { style: { borderLeftColor: labelHex(columnLabel(col)) } },
          h('div.row', h('b.grow', nar.title), ui.pill(nar.by === 'ai' ? 'AI' : 'basic – no AI', nar.by === 'ai' ? 'var(--accent-hi)' : 'var(--text-2)')),
          nar.logline ? h('div.field-hint', nar.logline) : null,
          h('div.field-hint', `${BOARD ? 'On the board as' : 'Saved as'} “${col.name}” · ${US.plural(cards.length, 'line')} · ${US.fmtDur(total)} (asked for ${fmtSecs(nar.seconds)}${Math.abs(off) > 0.1 ? ` – ${Math.round(Math.abs(off) * 100)}% ${off > 0 ? 'over' : 'under'}` : ''})`),
          h('ol.story-beats', cards.map((k, i) => {
            const l = lineById.get(k.lineId), tr = trimOf(k), act = acts ? (i === 0 ? 'Hook' : i === cards.length - 1 ? 'Payoff' : 'Build') : '';
            return h('li.story-beat', h('div.story-beat-main', h('div.story-beat-purpose', act ? h('b', act) : null, act && k.note ? ' – ' : '', k.note || ''), h('div.story-text', `“${tr ? tr.text : l.text}”`),
              h('div.story-meta', `${whoSaid(l)} · ${((tr || l).end - (tr || l).start).toFixed(1)} s${tr ? ' · trimmed' : ''}`)), playButton(l, (tr || l).start));
          })),
          h('div.field-hint', BOARD ? 'Colours, theme names and the strongest-line highlight follow “In the timeline” above. Hook, Build and Payoff go by position, so rearranging the group on the board changes them.' : 'Colours, theme names and the strongest-line highlight follow “In the timeline” above.'),
          h('div.row', BOARD ? ui.button('Rearrange on the board', { icon: 'story', onClick: () => show('wall') }) : null, ui.actionButton('Build this narrative', () => US.actions.run('story.build', { source: 'narrative', narrative: col.id }), { icon: 'film', block: false }),
            ui.button('Paper edit', { title: 'This narrative as a Word document with source timecodes (format as chosen in 5 Share)', onClick: () => US.jobs.run({ title: 'Saving the paper edit', tool: 'story' }, async job => { const x = await exportBoard(job, logFormat, { source: 'narrative', narrative: col.id }); ui.toast({ type: 'ok', title: 'Paper edit saved', text: US.basename(x.file), action: { label: 'Open', fn: () => openFile(x.file) } }); return x; }) })),
          promoBox(col));
      }
      /** "Make it a promo": the same build, then B-roll, captions and a vertical version. */
      function promoBox(col) {
        const P = Object.assign({ broll: '', captions: 'social', vertical: true }, US.settings.get('story.promo', {}));
        const save = () => US.settings.set('story.promo', P);
        const bin = ui.select({ options: [{ value: '', label: 'No B-roll' }], value: P.broll, onChange: x => { P.broll = x; save(); } });
        US.host.call('listBins').then(bins => bin.setOptions([{ value: '', label: 'No B-roll' }].concat(bins.filter(b => !/^JMG Ultra Studio/.test(b.path) && b.path !== '(Project root)').map(b => ({ value: b.id, label: b.path }))), P.broll)).catch(() => {});
        const caps = ui.segmented({ options: [{ value: '', label: 'No captions' }, { value: 'social', label: 'Social' }, { value: 'subtitles', label: 'Subtitles' }], value: P.captions, onChange: x => { P.captions = x; save(); } });
        const vert = ui.toggle({ label: 'A vertical 9:16 version too', hint: 'Auto Reframe, at full size (1080×1920)', value: P.vertical, onChange: x => { P.vertical = x; save(); } });
        return ui.section('Make it a promo', [
          h('div.field-hint', 'Builds this narrative, then covers its jump cuts with your best B-roll, adds captions timed to the words, and makes a vertical version for Reels, TikTok and Shorts. Each step makes a new sequence; nothing is changed in place.'),
          ui.field('B-roll from', bin), ui.field('Captions', caps), vert,
          ui.actionButton('Make the promo', () => US.jobs.run({ title: 'Making a promo', tool: 'story' }, job => makePromo(job, col, Object.assign({}, P, { broll: bin.get(), captions: caps.get(), vertical: vert.get() }))), { icon: 'film' })
        ], { open: false });
      }
      function coverageView(r) {
        const cov = TL().coverage(r.tl.result.entries, r.sel);
        const timing = r.tl.info.timing || { zero: 0, fps: r.tl.info.fps || 25 };
        const jump = sec => US.host.call('setPlayhead', { seqId: r.tl.info.id, seconds: sec }).catch(e => ui.showError(e));
        if (!cov.length) return ui.note('No transcribed interviews in this sequence yet.', 'warn');
        const tot = cov.reduce((n, c) => n + c.total, 0), sel = cov.reduce((n, c) => n + c.selected, 0);
        return h('div.cov', h('div.card-title', 'Coverage', h('span.right', `${US.fmtDur(sel)} of ${US.fmtDur(tot)} selected (${Math.round(100 * sel / Math.max(1, tot))}%)`)),
          cov.map(c => {
            const span = Math.max(0.01, c.end - c.start);
            const bar = h('div.cov-bar', { title: 'Click to move the playhead there', onclick: e => { const rr = e.currentTarget.getBoundingClientRect(); jump(c.start + span * (e.clientX - rr.left) / rr.width); } },
              c.ranges.map(x => h('span' + (x.selected ? '.on' : ''), { style: { left: (100 * (x.start - c.start) / span) + '%', width: Math.max(0.3, 100 * (x.end - x.start) / span) + '%', background: x.selected && x.label != null ? labelHex(x.label) : null } })));
            const gap = c.gaps[0];
            return h('div.cov-row',
              h('div.row', h('b.grow', c.name), h('span.field-hint', `${US.fmtDur(c.selected)} of ${US.fmtDur(c.total)} · ${Math.round(c.pct * 100)}%`),
                gap ? ui.button(`Biggest gap ${US.fmtDur(gap.end - gap.start)}`, { small: true, kind: 'ghost', title: `Jump to ${EX().tc(timing.zero + gap.start, { fps: timing.fps, drop: timing.drop })}`, onClick: () => jump(gap.start) }) : null),
              bar);
          }));
      }

      /* ---------- Timeline transcript ---------- */
      let tl = null, tlSeq = '', tlTracks = 'auto', tlFormat = US.settings.get('story.exportFormat', 'docx'), lastExport = null;
      let logFormat = US.settings.get('story.logFormat', 'docx'), lastDoc = null;
      /** Interview log and paper edit: documents about the whole project, to share. */
      function documentsCard() {
        const aiOn = US.ai && US.ai.available(), o = Object.assign({ summaries: false, full: false }, US.settings.get('story.log', {}));
        const keep = () => US.settings.set('story.log', o);
        let costText = '';
        if (aiOn) { const p = summaryPlan(); costText = !p.todo.length ? 'Every interview has a summary already.' : `${US.plural(p.todo.length, 'interview')} to summarise · ${p.free ? `no charge with ${p.name}` : `about ${US.ai.fmtUSD(p.usd)} with ${p.name}`}. Only the transcript text is sent; summaries are kept.`; }
        const fmt = ui.segmented({ options: [{ value: 'docx', label: 'Word' }, { value: 'csv', label: 'Spreadsheet' }, { value: 'txt', label: 'Text' }], value: logFormat, onChange: v => { logFormat = v; US.settings.set('story.logFormat', v); } });
        const lastRow = h('div');
        const showLast = () => { US.clear(lastRow); if (lastDoc) lastRow.appendChild(h('div.row', h('span.field-hint.grow', US.basename(lastDoc)), ui.button('Open', { small: true, onClick: () => openFile(lastDoc) }), ui.button(US.fsx.isWin ? 'Show in Explorer' : 'Show in Finder', { small: true, kind: 'ghost', onClick: () => openFile(lastDoc, true) }))); };
        showLast();
        const saved = (x, what) => { lastDoc = x.file; showLast(); ui.toast({ type: 'ok', title: `${what} saved`, text: US.basename(x.file), action: { label: 'Open', fn: () => openFile(x.file) } }); return x; };
        const latest = latestNarrative();
        return ui.card(h('div.card-title', 'Interview log & paper edit'),
          h('div.muted', `Documents to share with a director, producer or client. The interview log has a section for each interview: who speaks and for how long, the themes it feeds, its strongest lines and its moments, with source timecodes. The paper edit is ${BOARD ? 'your board, group by group' : 'your themes in order – or your narrative – line by line'}.`),
          fmt,
          aiOn ? ui.toggle({ label: `A short summary of each interview (${US.ai.label()})`, value: o.summaries, hint: costText, onChange: v => { o.summaries = v; keep(); } }) : null,
          ui.toggle({ label: 'Include the full transcripts', value: o.full, hint: 'Each interview’s transcript, timecoded, on its own pages', onChange: v => { o.full = v; keep(); } }),
          h('div.row', ui.actionButton('Save the interview log', () => US.jobs.run({ title: 'Writing the interview log', tool: 'story' }, async job => saved(await interviewLog(job, { summaries: !!(aiOn && o.summaries), full: o.full, format: logFormat }), 'Interview log')), { icon: 'deliver', block: false }),
            ui.button(BOARD ? 'Paper edit of the board' : 'Paper edit of your themes', { title: 'Each theme in order with its lines (as How picky keeps them), speakers and source timecodes', onClick: () => US.jobs.run({ title: 'Saving the paper edit', tool: 'story' }, async job => saved(await exportBoard(job, logFormat), 'Paper edit')) }),
            latest ? ui.button('Paper edit of the narrative', { title: `“${latest.narrative.title}”, line by line with what each line does`, onClick: () => US.jobs.run({ title: 'Saving the paper edit', tool: 'story' }, async job => saved(await exportBoard(job, logFormat, { source: 'narrative', narrative: latest.id }), 'Paper edit')) }) : null),
          h('div.field-hint', 'Saved in Documents › JMG Ultra Studio › Transcripts.'),
          lastRow);
      }
      function renderTimeline() {
        const el = US.clear(panes.timeline);
        el.appendChild(stepHead('timeline'));
        el.appendChild(documentsCard());
        const seqSel = ui.select({ options: [], placeholder: 'Choose a sequence…', onChange: v => { tlSeq = v; tl = null; renderTimeline(); } });
        US.host.call('listSequences').then(seqs => { const act = US.ctx.sequence && US.ctx.sequence.id; if (!tlSeq) tlSeq = act || (seqs[0] && seqs[0].id) || ''; seqSel.setOptions(seqs.map(q => ({ value: q.id, label: q.name + (q.id === act ? '  (open)' : '') })), tlSeq); }).catch(() => {});
        el.appendChild(ui.card(h('div.card-title', 'Transcript of a timeline'),
          h('div.muted', 'Who says what in a sequence, in timeline order – from Premiere’s transcripts of the clips you used, trimmed at every cut. Name the speakers once and export it.'),
          ui.field('Sequence', seqSel),
          ui.actionButton(tl ? 'Make it again' : 'Make transcript', () => US.jobs.run({ title: 'Making the timeline transcript', tool: 'story' }, async job => { tl = await timelineTranscript(job, { seqId: tlSeq || (US.ctx.sequence && US.ctx.sequence.id), tracks: tlTracks }); renderTimeline(); return { summary: `${US.plural(tl.result.entries.length, 'line')} · ${US.plural(tl.result.speakers.length, 'voice')}` }; }), { icon: 'story' })));
        if (!tl) return;
        const r = tl.result, c = tl.collected;
        if (r.missing.length) {
          const names = r.missing.map(m => m.name);
          el.appendChild(h('div.note.warn', US.icon('warn', 15), h('div',
            h('div', h('b', `${US.plural(names.length, 'clip')} in this sequence ${names.length === 1 ? 'has' : 'have'} no transcript yet: `), names.slice(0, 8).join(', ') + (names.length > 8 ? ` …and ${names.length - 8} more` : '') + '.'),
            h('div', 'Select them in the Project panel › right-click › Transcribe (or Window › Text › Transcript › Transcribe). To do it automatically, turn on “Auto-transcribe” in Premiere’s Import settings. If they’re music or sound effects, ignore this.'),
            h('div.row', { style: { marginTop: '6px' } }, ui.button('Read Premiere’s transcripts', { small: true, icon: 'refresh', onClick: async () => { const ok = await US.actions.run('story.read', {}); if (ok) { tl = await timelineTranscript(null, { seqId: tl.info.id, tracks: tlTracks, info: tl.info }); show('timeline'); } } })))));
        }
        const staleKeys = new Set(r.entries.filter(e => e.exact === false).map(e => e.clipKey));
        const stale = state.transcripts.filter(t => staleKeys.has(t.key) && t.source === 'premiere');
        if (stale.length) el.appendChild(ui.note(`${US.plural(stale.length, 'transcript')} ${stale.length === 1 ? 'was' : 'were'} read before Story kept Premiere’s word timings, so cuts there are trimmed by estimate. Press “Read Premiere’s transcripts” on the Transcripts tab once to trim at the exact word.`));
        const skipped = [c.nested.length ? `${US.plural(c.nested.length, 'nested sequence')} (${c.nested.join(', ')}) – open them and make their own transcript` : '', c.disabled ? `${US.plural(c.disabled, 'disabled clip')}` : '', c.muted.length ? `muted tracks ${c.muted.join(', ')}` : ''].filter(Boolean);
        if (skipped.length) el.appendChild(h('div.field-hint', 'Left out: ' + skipped.join(' · ') + '.'));
        const chosen = new Set(tlTracks === 'auto' ? c.audioTracks.filter(t => !t.muted && t.transcribed).map(t => t.index) : tlTracks);
        el.appendChild(ui.section('Audio tracks', [h('div.field-hint', 'Normally only tracks with transcribed clips are used, so music beds and effects stay out.'),
          ...c.audioTracks.map(t => ui.toggle({ label: `${t.name}${t.muted ? ' (muted)' : ''}`, hint: `${US.plural(t.clips, 'clip')} · ${t.transcribed} with transcripts`, value: chosen.has(t.index), onChange: async on => { const set = new Set(chosen); on ? set.add(t.index) : set.delete(t.index); tlTracks = Array.from(set).sort(); tl = await timelineTranscript(null, { seqId: tl.info.id, tracks: tlTracks, info: tl.info }); renderTimeline(); } }))], { open: false }));
        if (!r.entries.length) { el.appendChild(ui.empty({ icon: 'story', title: 'No transcribed speech in this sequence', text: 'Transcribe the clips you used (see above), then make the transcript again.' })); return; }
        // who is who
        const display = namesFor(tl), folks = TL().people(r.speakers, display);
        const colourOf = name => SPEAKER_COLORS[Math.max(0, folks.findIndex(p => p.name.toLowerCase() === String(name).toLowerCase())) % SPEAKER_COLORS.length];
        const listEl = h('div.story-tl-list'), peopleEl = h('div.field-hint');
        const redraw = () => { const d = namesFor(tl); const f = TL().people(r.speakers, d); peopleEl.textContent = `${US.plural(f.length, 'person', 'people')}: ` + f.map(p => `${p.name} (${US.fmtDur(p.talk)})`).join(', '); drawLines(d); };
        el.appendChild(ui.card(h('div.card-title', 'Who is who', h('span.right', US.plural(r.speakers.length, 'voice'))),
          h('div.muted', 'Premiere tells voices apart within each clip. Type a name for each – the same name in two rows means the same person.'),
          ...r.speakers.map(sp => {
            const input = ui.input({ value: (state.whoIsWho || {})[sp.key] || '', placeholder: display.get(sp.key), onInput: US.debounce(v => { state.whoIsWho[sp.key] = v.trim(); save(); redraw(); }, 350) });
            return h('div.story-who', h('span.swatch', { style: { background: colourOf(display.get(sp.key)) } }),
              h('div.story-who-main', h('div.row', h('div.grow', input), h('span.field-hint', US.fmtDur(sp.talk))),
                h('div.story-meta', `${sp.clipName}${TL().GENERIC.test(sp.label || '') ? (sp.label ? ' · ' + sp.label : '') : ' · named “' + sp.label + '” in Premiere'}`),
                sp.sample ? h('div.story-who-sample', `“${sp.sample.text}”`) : null),
              sp.sample ? h('button.icon-btn', { title: 'Hear this voice', onclick: async () => { try { await US.host.cue(sp.sample.itemId, Math.max(0, sp.sample.srcIn - 0.2), { play: true }); } catch (e) { ui.showError(e); } } }, US.icon('play', 15)) : null);
          }), peopleEl));
        // export
        const fmt = ui.segmented({ options: [{ value: 'docx', label: 'Word' }, { value: 'txt', label: 'Text' }, { value: 'srt', label: 'Subtitles' }, { value: 'csv', label: 'Spreadsheet' }], value: tlFormat, onChange: v => { tlFormat = v; US.settings.set('story.exportFormat', v); } });
        const lastRow = h('div');
        const showLast = () => { US.clear(lastRow); if (lastExport) lastRow.appendChild(h('div.row', h('span.field-hint.grow', US.basename(lastExport)), ui.button('Open', { small: true, onClick: () => openFile(lastExport) }), ui.button(US.fsx.isWin ? 'Show in Explorer' : 'Show in Finder', { small: true, kind: 'ghost', onClick: () => openFile(lastExport, true) }))); };
        showLast();
        el.appendChild(ui.card(h('div.card-title', 'Export'), fmt,
          h('div.field-hint', 'Word: title, speaker key and timecoded paragraphs · Text · Subtitles (.srt) with names · Spreadsheet (.csv) with source clips and timecodes. Saved in Documents › JMG Ultra Studio › Transcripts.'),
          ui.actionButton('Export transcript', () => US.jobs.run({ title: 'Exporting the transcript', tool: 'story' }, async job => { const x = await exportTimeline(job, tl, tlFormat); lastExport = x.file; showLast(); ui.toast({ type: 'ok', title: 'Transcript saved', text: US.basename(x.file), action: { label: 'Open', fn: () => openFile(x.file) } }); return x; }), { icon: 'deliver' }),
          lastRow));
        // captions
        const capStyle = ui.segmented({ options: Object.entries(CAP().STYLES).map(([k, x]) => ({ value: k, label: x.label, title: x.desc })), value: US.settings.get('story.capStyle', 'subtitles'), onChange: v => { US.settings.set('story.capStyle', v); capHint.textContent = CAP().STYLES[v].desc; } });
        const capHint = h('div.field-hint', CAP().STYLES[capStyle.get()].desc);
        const capNames = ui.toggle({ label: 'Speaker names', value: US.settings.get('story.capNames', false), hint: 'When the person speaking changes', onChange: v => US.settings.set('story.capNames', v) });
        const capUpper = ui.toggle({ label: 'Capitals', value: US.settings.get('story.capUpper', false), onChange: v => US.settings.set('story.capUpper', v) });
        const capOpts = add => ({ style: capStyle.get(), names: capNames.get(), upper: capUpper.get(), add });
        el.appendChild(ui.card(h('div.card-title', 'Captions'),
          h('div.muted', `Premiere captions from this transcript, timed to each word. They go on a caption track of “${tl.info.name}”, where you can style them (Window › Essential Graphics) and fix any word.`),
          capStyle, capHint, h('div.grid2', capNames, capUpper),
          h('div.row', h('div.grow', ui.actionButton('Add captions to the sequence', () => US.jobs.run({ title: 'Adding captions', tool: 'story' }, job => makeCaptions(job, tl, capOpts(true))), { icon: 'story' })),
            ui.button('Save .srt only', { onClick: () => US.jobs.run({ title: 'Saving captions', tool: 'story' }, async job => { const x = await makeCaptions(job, tl, capOpts(false)); lastExport = x.file; showLast(); return x; }) }))));
        // the transcript
        el.appendChild(h('div.card-title', 'Transcript', h('span.right', `${tl.info.name}`)));
        el.appendChild(listEl);
        function drawLines(d) {
          US.clear(listEl);
          const timing = tl.info.timing || { zero: 0, fps: tl.info.fps || 25 };
          const paras = TL().paragraphs(r.entries, d);
          for (const p of paras.slice(0, 600)) listEl.appendChild(h('div.story-tl-row', { title: 'Click to move the playhead here', onclick: () => US.host.call('setPlayhead', { seqId: tl.info.id, seconds: p.start }).catch(e => ui.showError(e)) },
            h('span.story-tl-tc', EX().tc(timing.zero + p.start, { fps: timing.fps, drop: timing.drop })),
            h('div.story-tl-body', h('span.story-tl-name', { style: { color: colourOf(p.name) } }, p.name), ' ', p.text)));
          if (paras.length > 600) listEl.appendChild(h('div.field-hint', `…${paras.length - 600} more paragraphs in the export.`));
        }
        redraw();
      }

      US.bus.on('context', () => { const was = statePath; loadState(); if (was !== statePath) render(); });
      US.bus.on('story-replaced', () => render());
      return { el: v.el, onShow(opts) {
        if (opts && opts.tab) tab = opts.tab;
        if (opts && opts.section) pendingSection = opts.section;
        if (opts && (opts.section === 'moments' || opts.moments)) { momentsMode = true; moreMode = false; if (opts.type) momentType = opts.type; }
        else if (opts && opts.tab === 'search') momentsMode = false;
        if (opts && opts.more) { moreMode = true; moreTopic = lastQuery = opts.more.topic; moreResults = opts.more.results; moreInfo = opts.more.info || ''; targetTheme = targetColumn = null; }
        else if (opts && opts.query != null && opts.tab === 'search') { moreMode = false; lastQuery = opts.query; results = T.search(lastQuery, scopeLines(), { limit: 200, minQuality: strongOnly ? 0.6 : 0 }); }
        show(tab);
      } };
    }
  });

  /* ================= wall helpers (shared with actions) ================= */
  function fillWallFromThemes(perTheme = US.settings.get('story.wallPerTheme', 30)) {
    ensureColours();
    state.wall.loose = [];
    state.wall.columns = state.themes.filter(t => t.name !== 'Other').map(t => ({ id: US.uid('c'), name: t.name, themeId: t.id, label: t.label, cards: effectiveLines(t).slice(0, perTheme).map(id => ({ lineId: id })) }));
    saveNow();
  }
  function addToWall(ids, name) {
    let col = state.wall.columns.find(c => c.name === name);
    if (!col) { col = { id: US.uid('c'), name, cards: [] }; state.wall.columns.push(col); ensureColours(); }
    const have = new Set(state.wall.columns.flatMap(c => c.cards.map(k => k.lineId)));
    ids.filter(id => !have.has(id)).forEach(id => col.cards.push({ lineId: id }));
    saveNow();
  }
  function pruneWall() {
    const keep = k => k.idea != null || lineById.has(k.lineId);
    for (const c of state.wall.columns) c.cards = c.cards.filter(keep);
    if (state.wall.loose) state.wall.loose = state.wall.loose.filter(l => keep(l.card));
    state.themes.forEach(t => { t.lineIds = t.lineIds.filter(id => lineById.has(id)); });
  }
  function syncWallNames() { for (const c of state.wall.columns) { const t = state.themes.find(x => x.id === c.themeId); if (t) c.name = t.name; } }
  /** A trimmed card's words and times (narratives tighten lines by whole words), or null. */
  function trimOf(k) { const l = k.trim && lineById.get(k.lineId); return l ? US.storyNarrative.trimmed(l, k.trim.dropStart, k.trim.dropEnd) : null; }
  /** Themes as build groups, in the order of the Themes list (the lines How picky keeps; themes switched off left out). */
  function themeGroups() {
    const off = new Set(state.buildOff || []);
    return state.themes.filter(t => t.name !== 'Other' && !off.has(t.id)).map(t => ({ name: t.name, label: t.label, lineIds: effectiveLines(t), pinned: new Set(), ideas: [], trims: {} })).filter(g => g.lineIds.length);
  }
  function wallGroups(cols = state.wall.columns) {
    return cols.map(c => {
      const ideas = [];
      c.cards.forEach((k, i) => { if (k.idea == null) return; const next = c.cards.slice(i + 1).find(x => x.lineId && !x.hidden); ideas.push({ text: k.idea, before: next ? next.lineId : null }); });
      const trims = {}; for (const k of c.cards) { const tr = k.lineId && !k.hidden ? trimOf(k) : null; if (tr) trims[k.lineId] = tr; }
      return { name: c.name, label: columnLabel(c), lineIds: c.cards.filter(k => k.lineId && !k.hidden).map(k => k.lineId), pinned: new Set(c.cards.filter(k => k.pinned && k.lineId).map(k => k.lineId)), ideas, trims };
    }).filter(g => g.lineIds.length || g.ideas.length);
  }

  /* ================= actions (also used by the Assistant) ================= */
  const openStory = (tab, extra) => { US.tools.open('story', Object.assign({ tab }, extra)); };
  function needLines() {
    loadState();
    if (!US.ctx.project) throw new US.UserError('NO_PROJECT');
    if (!allLines().length) throw new US.UserError('NOTHING_FOUND', { title: 'There are no transcripts in Story yet.', action: 'Open Story › 1 Interviews and read Premiere’s transcripts (or import files) first.' });
  }

  US.actions.register({
    id: 'story.read', tool: 'story', title: 'Read Premiere’s transcripts', changes: false,
    describe: 'Saves the project and reads every transcript Premiere has made for its clips into Story.',
    examples: ['read the transcripts', 'load Premiere’s transcripts'],
    match: t => (/\b(read|load|import|get|pull)\b.*\btranscripts?\b/i.test(t) ? {} : null),
    run: async (p, job) => { const r = await readPremiereTranscripts(job); openStory('transcripts'); return r; }
  });
  US.actions.register({
    id: 'story.search', tool: 'story', title: 'Search the interviews', changes: false,
    describe: 'Finds the best interview lines about a topic (by word, related words and near-misses).',
    params: { query: { type: 'string', default: '', desc: 'What the lines should be about, e.g. "volunteering" or a quoted phrase' } },
    examples: ['lines about volunteering', 'find where they talk about faith', 'soundbites about family'],
    match(t) {
      const m = /\b(lines?|soundbites?|sound bites?|bites?|quotes?|moments?)\s+(about|on|where|when|mentioning)\b(.+)$/i.exec(t) || /\b(?:find|search|show)\b.*\b(?:where|when)\b.*\b(?:talks?|talking|says?|said|speaks?|mentions?)\s+(?:about\s+)?(.+)$/i.exec(t) || /\bsearch (?:the )?(?:interviews?|transcripts?) for (.+)$/i.exec(t);
      if (!m) return null;
      const q = (m[3] || m[1] || '').replace(/^\s*(about|on)\s+/i, '').trim();
      return q ? { query: q, _score: 2 } : null;
    },
    run: async (p, job) => {
      needLines();
      const r = T.search(p.query, await linesInScope(job), { limit: 200 });
      openStory('search', { query: p.query });
      return { summary: r.length ? `${US.plural(r.length, 'line')} about “${p.query}” – best: “${r[0].line.text.slice(0, 60)}…”` : `Nothing found for “${p.query}”` };
    }
  });
  US.actions.register({
    id: 'story.themes', tool: 'story', title: 'Find themes in the interviews', changes: false,
    describe: 'Groups the interview lines (the ones chosen in What to work on) into themes, best lines first – the editor’s own themes and the others in one pass. Themes you added yourself are kept.',
    params: { useAI: { type: 'boolean', default: false, desc: 'Use the AI (only line text is sent) instead of the built-in grouping' }, own: { type: 'string', default: '', desc: 'The editor’s own themes, comma separated (empty = the ones already typed in Story)' } },
    examples: ['find the themes', 'group the interviews by topic'],
    match: t => (/\b(themes?|topics?)\b/i.test(t) && /\b(find|group|sort|show|what|make|get|work out)\b/i.test(t) && !/\bbins?\b/i.test(t) && !/\b(add|new|own|called)\b/i.test(t) ? { useAI: !!(US.ai && US.ai.available()) } : null),
    run: async (p, job) => {
      needLines();
      const own = p.own ? splitThemes(ownThemeNames().concat(splitThemes(p.own)).join('\n')) : ownThemeNames();
      const { yours, found, lines } = await findAllThemes(job, { useAI: p.useAI, own });
      openStory('themes');
      const parts = found.requests > 1 ? ` (read in ${found.requests - 1} parts and merged)` : '';
      const missing = found.missing && found.missing.length ? ` · ${SAI().missingNote(found.missing)}` : '';
      const named = found.filter(t => t.name !== 'Other');
      const mine = yours.length ? `Yours: ${yours.map(t => `${t.name} (${t.lineIds.length})`).join(', ')} · ` : '';
      return { summary: `${mine}${US.plural(named.length, 'theme')} found: ${named.slice(0, 4).map(t => t.name).join(', ')}${named.length > 4 ? '…' : ''} · from ${US.plural(lines.length, 'line')}${parts}${missing}` };
    }
  });
  US.actions.register({
    id: 'story.addTheme', tool: 'story', title: 'Add your own theme', changes: false,
    describe: 'Makes a theme from a word or phrase you give (e.g. "gratitude", "first day in Israel"), finds the lines about it best first, and adds it as a wall column.',
    params: { theme: { type: 'string', default: '', desc: 'The theme, in a word or a short phrase' }, useAI: { type: 'boolean', default: false, desc: 'Let the AI choose the lines (only line text is sent)' } },
    examples: ['add a theme called gratitude', 'make a theme about first day in Israel'],
    match(t) {
      const m = /\b(?:add|make|create|new)\b.*?\btheme\b\s*(?:called|named|about|for|on|:)?\s*["“]?(.+?)["”]?\s*$/i.exec(t);
      if (!m || !m[1].trim() || /^(s|from|by)\b/i.test(m[1])) return null;
      return { theme: m[1].trim(), useAI: !!(US.ai && US.ai.available()), _score: 2.5 };
    },
    run: async (p, job) => {
      needLines();
      const th = await addCustomTheme(job, p.theme, { useAI: p.useAI });
      openStory('themes');
      return { theme: th, summary: th.lineIds.length ? `“${th.name}”: ${US.plural(th.lineIds.length, 'line')}, best first` : `“${th.name}” added – no lines found yet; tick lines in Find and press “Add to theme…”, or try other words` };
    }
  });
  US.actions.register({
    id: 'story.findMore', tool: 'story', title: 'Find more on a topic', changes: false,
    describe: 'Finds interview lines on a topic that aren’t selected yet (not in a theme), and optionally not already used in the open sequence.',
    params: { topic: { type: 'string', default: '', desc: 'What the lines should touch on' }, notInCut: { type: 'boolean', default: false, desc: 'Also leave out lines already used in the open sequence' } },
    examples: ['find anything else about community', 'find more about faith that’s not already in my cut'],
    match(t) {
      const m = /\b(?:find|look for|search for|get|show)\b.*?\b(?:more|anything(?:\s+else)?|everything|other|additional|extra)\b.*?\b(?:about|on|touch(?:es|ing)? on|related to|to do with|regarding)\s+(.+)$/i.exec(t);
      if (!m) return null;
      const notInCut = /\bnot\b.*\b(?:already\s+)?(?:in|used in)\s+(?:my|the)\s+(?:cut|edit|sequence|timeline)\b/i.test(t);
      const topic = m[1].replace(/\s*,?\s*(?:that|which|that's|that’s)?\s*(?:is|are|isn't|isn’t|aren't)?\s*(?:not\s+)?(?:already\s+)?(?:in|used in)\s+(?:my|the)\s+(?:cut|edit|sequence|timeline).*$/i, '').replace(/^(?:the|a)\s+/i, '').trim();
      return topic ? { topic, notInCut, _score: 2.6 } : null;
    },
    run: async (p, job) => {
      needLines();
      const exclude = selectedIds(); let inCut = 0;
      if (p.notInCut) { const seq = US.ctx.sequence; if (!seq) throw new US.UserError('NO_SEQUENCE', { action: 'Open your cut in the Timeline, then try again.' }); (await usedInSequence(job, seq.id)).forEach(id => { if (!exclude.has(id)) inCut++; exclude.add(id); }); }
      const r = await findMore(job, p.topic, { useAI: !!(US.ai && US.ai.available() && US.settings.get('story.moreAI', true)), exclude });
      const info = `Leaving out ${US.plural(selectedIds().size, 'line')} already in themes${BOARD ? ' or on the board' : ''}${p.notInCut ? ` and ${US.plural(inCut, 'more line')} already in your cut` : ''}.`;
      openStory('search', { more: { topic: p.topic, results: r, info } });
      return { results: r, summary: r.length ? `${US.plural(r.length, 'new line')} about “${p.topic}” that you haven’t selected yet` : `Nothing new about “${p.topic}” – it’s all selected already` };
    }
  });
  US.actions.register({
    id: 'story.bins', tool: 'story', title: 'Sort selects into bins by theme', changes: true,
    describe: 'Makes a bin per theme with the best lines as subclips (best first, in the theme’s colour), optionally a sequence per theme.',
    params: { perTheme: { type: 'number', default: 0, desc: 'Most lines per theme (0 = as chosen by How picky)' }, sequences: { type: 'boolean', default: false, desc: 'Also make a sequence per theme' } },
    examples: ['sort the selects into bins by theme', 'make a bin for each theme'],
    match: t => (/\bbins?\b/i.test(t) && /\b(themes?|topics?)\b/i.test(t) ? { perTheme: 0, sequences: /\bsequences?\b/i.test(t) } : null),
    run: async (p, job) => {
      needLines();
      if (!state.themes.length) { job.set({ msg: 'Finding themes first' }); state.themes = T.themesOffline(allLines(), { max: 10 }); ensureColours(); saveNow(); }
      return sortIntoBins(job, { themes: state.themes.filter(t => t.name !== 'Other'), perTheme: p.perTheme, sequences: p.sequences });
    }
  });
  US.actions.register({
    id: 'story.build', tool: 'story', title: 'Build a sequence from your themes', changes: true,
    describe: 'Lays the interview lines into a new sequence in order: every theme in turn (as chosen by How picky), picked search lines, one theme, or a narrative. Uses the colour, highlight and theme-name options set in Story.',
    params: { source: { type: 'enum', options: ['themes', 'picked', 'theme', 'narrative', 'wall'], default: 'themes', desc: 'Where the lines come from: every theme in order (themes), the picked lines, one theme, or the newest narrative made from a brief' }, theme: { type: 'string', default: '', desc: 'Theme name when source is "theme"' }, narrative: { type: 'string', default: '', desc: 'Board group id of the narrative when source is "narrative" (empty = the newest)' }, name: { type: 'string', default: '', desc: 'Name for the new sequence' } },
    examples: ['build a sequence from the themes', 'make a stringout of the family theme', 'build the narrative'],
    match(t) {
      if (/\b(build|make|lay out|assemble)\b.*\b(the|this|that|my)\s+narrative\b/i.test(t)) return { source: 'narrative', _score: 2.9 };
      if (!/\b(build|make|create|assemble|lay out|string ?out)\b/i.test(t) || !/\b(sequence|stringout|string-out|rough ?cut|cut|timeline|edit)\b/i.test(t) || !/\b(wall|story|interviews?|themes?|picked|selected lines|stringout|string-out)\b/i.test(t)) return null;
      const th = /([\w&'-]+(?:\s+[\w&'-]+)?)\s+theme\b/i.exec(t) || /\btheme\s+(?:called\s+)?["“]?([\w &'-]+)/i.exec(t);
      const thName = th ? th[1].trim().replace(/^(the|a|an|of|from)\s+/i, '') : '';
      if (thName && !/^(a|the|each|every|per|by)$/i.test(thName)) return { source: 'theme', theme: thName, _score: 2 };
      if (/\bpicked|selected lines|ticked\b/i.test(t)) return { source: 'picked', _score: 2 };
      return { source: 'themes', _score: 1.5 };
    },
    run: async (p, job) => {
      needLines();
      let groups, name = p.name;
      if (p.source === 'narrative') return buildNarrative(job, latestNarrative(p.narrative), { name });
      if (p.source === 'picked') { groups = [{ name: '', label: null, lineIds: (state.picked || []).filter(id => lineById.has(id)) }]; name = name || 'Story – picked lines'; }
      else if (p.source === 'theme') {
        const q = String(p.theme || '').toLowerCase();
        const th = state.themes.find(t => t.name.toLowerCase() === q) || state.themes.find(t => t.name.toLowerCase().includes(q) || q.includes(t.name.toLowerCase().split(/\W/)[0]));
        if (!th) throw new US.UserError('NOTHING_FOUND', { title: `There’s no theme called “${p.theme}”.`, action: 'Find themes first, or check the name in Story › 2 Themes.' });
        groups = [{ name: th.name, label: th.label, lineIds: effectiveLines(th) }]; name = name || `Story – ${th.name}`;
      } else if (p.source === 'wall' && BOARD) {
        if (!state.wall.columns.length) throw new US.UserError('NOTHING_FOUND', { title: 'The board is empty.', action: 'Open Story › Board and arrange your themes on it first.' });
        ensureColours();
        groups = wallGroups();
        name = name || US.settings.get('story.seqName', 'Story – rough cut');
      } else {
        ensureColours();
        groups = themeGroups();
        if (!groups.length) throw new US.UserError('NOTHING_FOUND', { title: state.themes.length ? 'None of your themes has lines at this How picky setting.' : 'There are no themes yet.', action: state.themes.length ? 'Choose a less picky setting, or switch more themes on.' : 'Find themes first (Story › 2 Themes).' });
        name = name || US.settings.get('story.seqName', 'Story – rough cut');
      }
      return buildSequence(job, { name, groups, look: lookOptions() });
    }
  });

  US.actions.register({
    id: 'story.narrative', tool: 'story', title: 'Make a narrative from a brief', changes: false,
    describe: 'Turns a brief like “a 60-second video about how the community looks after each other” into a story told by the interviews – hook, build, payoff – fitted to the length (15 s to 10 min), from your selects and other lines on the topic. It is saved in Story › Build; build it with story.build source "narrative".',
    params: { brief: { type: 'string', default: '', desc: 'The brief in the user’s words, including the length and topic' }, useAI: { type: 'boolean', default: false, desc: 'Let the AI shape the story (only line text is sent); otherwise the basic version' } },
    examples: ['make a 60 second video about community', 'cut a 2 minute story about faith and family', 'create a 30s promo about the youth club'],
    match(t) {
      if (/\b(beats?|music|songs?|tracks?|bins?|silences?|captions?|subtitles?|transcripts?|safe ?zones?|vertical|social versions?|wall|board|picked|themes?|paper[- ]?edit)\b/i.test(t)) return null; // other tools' jobs
      const verb = /\b(make|create|cut|build|edit|put together|assemble|give me|do)\b/i.test(t);
      const dur = /(\b\d{1,2}:\d{2}\b|\b(\d+(\.\d+)?|a|one|two|three|four|five|ten|fifteen|twenty|thirty|forty|fifty|sixty|ninety)[\s-]*(seconds?|secs?|s|minutes?|mins?)\b|\bhalf a minute\b)/i.test(t);
      const about = /\b(about|on|showing|around)\s+\w/i.test(t);
      const noun = /\b(video|film|piece|edit|story|promo|montage|narrative|reel|teaser|trailer|short)\b/i.test(t) || (dur && /\bcut\b/i.test(t) && about);
      if (!verb || !(noun && (dur || about)) && !/\bnarrative\b/i.test(t)) return null;
      return { brief: t, useAI: !!(US.ai && US.ai.available() && US.settings.get('story.narrativeAI', true)), _score: 2.8 };
    },
    run: async (p, job) => {
      needLines();
      const r = await makeNarrative(job, { brief: p.brief, useAI: p.useAI });
      openStory('build', { section: 'narrative' });
      return r;
    }
  });
  US.actions.register({
    id: 'story.moments', tool: 'story', title: 'Find moments: bloopers, funny, off camera, poignant', changes: false,
    describe: 'Finds bloopers (restarts, stumbles, crew chatter, swearing), funny moments (laughter), off-camera voices (a second voice, the interviewer reacting) and poignant moments (emotional words, long pauses) in the interviews.',
    params: { type: { type: 'enum', options: ['all', 'funny', 'blooper', 'off-camera', 'poignant'], default: 'all', desc: 'Which kind to show' }, useAI: { type: 'boolean', default: false, desc: 'Let the AI check each moment (only the text around it is sent)' } },
    examples: ['find the bloopers', 'show me the funny moments', 'any off-camera voices?', 'find poignant moments'],
    match(t) {
      const type = /\b(bloopers?|out-?takes?|mistakes|flubs?|gaffes?|restarts?|false starts?|stumbles?)\b/i.test(t) ? 'blooper' : /\b(funny|funniest|laugh(s|ter|ing)?|jokes?|humou?r)\b/i.test(t) ? 'funny' : /\boff[- ]?camera\b|\binterviewer (reacts?|interjects?)\b|\bsecond voice\b/i.test(t) ? 'off-camera' : /\b(poignant|moving|emotional|touching|tearful|heartfelt)\b/i.test(t) ? 'poignant' : null;
      const moments = /\bmoments?\b/i.test(t);
      if (!type && !moments) return null;
      if (/\b(lines?|soundbites?|sound bites?|quotes?|bites?)\s+(about|on|where|when|mentioning)\b/i.test(t)) return null; // a search
      if (!type && /\bmoments?\s+(about|on|where|when|mentioning)\b/i.test(t)) return null; // that's a search
      if (type === 'poignant' && !moments && !/\b(find|show|any|where)\b/i.test(t)) return null;
      return { type: type || 'all', useAI: !!(US.ai && US.ai.available() && US.settings.get('story.momentsAI', true)), _score: 2.7 };
    },
    run: async (p, job) => {
      needLines();
      const r = await findMoments(job, { useAI: p.useAI });
      openStory('search', { section: 'moments', moments: true, type: p.type || 'all' });
      const kept = pickMoments(r.moments, { type: p.type || 'all' });
      if (p.type && p.type !== 'all') r.summary = `${US.plural(kept.length, MO().TYPES[p.type].name.toLowerCase() + ' moment')} at your How picky setting · ${r.summary}`;
      return r;
    }
  });
  US.actions.register({
    id: 'story.interviewLog', tool: 'story', title: 'Write the interview log', changes: false,
    describe: 'Saves a document with a section per interview: who speaks and for how long, the themes it feeds, its strongest lines and moments with source timecodes – optionally a short AI summary of each interview and the full transcripts.',
    params: { summaries: { type: 'boolean', default: false, desc: 'Add a short AI summary of each interview' }, full: { type: 'boolean', default: false, desc: 'Include every interview’s full transcript' }, format: { type: 'enum', options: ['docx', 'csv', 'txt'], default: 'docx', desc: 'File type: docx (Word), csv (spreadsheet) or txt' } },
    examples: ['write an interview log', 'summarise each interview', 'all the interview transcripts as one Word document'],
    match(t) {
      const media = /\b(video|film|reel|promo|cut|edit|sequence|timeline|seconds?|minutes?|secs?|mins?)\b/i;   // that's a narrative or a timeline transcript
      const sum = /\bsummar(y|ies|i[sz]e)\b/i.test(t) && /\b(each|every|all( of)?( the| my)?|the|my) interviews?\b/i.test(t) && !media.test(t);
      const log = /\binterviews? ?log\b|\blog (the|all|my|each|every) interviews?\b|\blogging (doc|document|sheet)\b/i.test(t);
      const book = (/\b(all|every) (of )?(the |my )?(interviews?|interview transcripts|transcripts)\b.*\b(word|document|docx|print|one file)\b/i.test(t) && !media.test(t)) || /\btranscript book\b/i.test(t);
      if (!sum && !log && !book) return null;
      const format = /\b(csv|spreadsheet|excel|sheet)\b/i.test(t) ? 'csv' : /\b(txt|plain text|text file)\b/i.test(t) ? 'txt' : 'docx';
      return { summaries: sum, full: book || /\bfull transcripts?\b/i.test(t), format, _score: 3 };
    },
    run: async (p, job) => {
      if (!US.ctx.project) throw new US.UserError('NO_PROJECT');
      openStory('timeline');
      const ai = US.ai && US.ai.available();
      const x = await interviewLog(job, { summaries: !!(p.summaries && ai), full: p.full, format: p.format });
      if (p.summaries && !ai) x.summary += ' (no summaries: no AI is set up – Settings › AI)';
      US.ui.toast({ type: 'ok', title: 'Interview log saved', text: US.basename(x.file), action: { label: 'Open', fn: () => openFile(x.file) } });
      return x;
    }
  });
  US.actions.register({
    id: 'story.paperEdit', tool: 'story', title: 'Save a paper edit', changes: false,
    describe: 'Saves a paper edit – every theme in order (or the newest narrative), with its lines, speakers and source timecodes – as a Word document, spreadsheet or text file to share.',
    params: { format: { type: 'enum', options: ['docx', 'csv', 'txt'], default: 'docx', desc: 'File type: docx (Word), csv (spreadsheet) or txt' }, source: { type: 'enum', options: ['themes', 'narrative'], default: 'themes', desc: 'The themes in order, or the newest narrative' } },
    examples: ['save a paper edit of the themes', 'export the narrative to Word', 'make a paper edit I can send to the director'],
    match(t) {
      const paper = /\bpaper[- ]?edit\b/i.test(t), other = /\b(sequence|promo|video|timeline|build)\b/i.test(t);
      const asDoc = /\b(board|wall|themes|narrative)\b/i.test(t) && /\b(word|docx|document|print(out)?|csv|spreadsheet|excel)\b/i.test(t);
      const saveBoard = /\b(export|save|share|send|print)( out)? (the |my |this |our )?(story )?(board|wall|themes|narrative)\b/i.test(t);
      if (!paper && ((!asDoc && !saveBoard) || other)) return null;
      const format = /\b(csv|spreadsheet|excel|sheet)\b/i.test(t) ? 'csv' : /\b(txt|plain text|text file)\b/i.test(t) ? 'txt' : 'docx';
      return { format, source: /\bnarrative\b/i.test(t) ? 'narrative' : 'themes', _score: 2.5 };
    },
    run: async (p, job) => {
      if (!US.ctx.project) throw new US.UserError('NO_PROJECT');
      openStory('timeline');
      const x = await exportBoard(job, p.format, { source: p.source === 'narrative' ? 'narrative' : BOARD ? 'board' : 'themes' });
      US.ui.toast({ type: 'ok', title: 'Paper edit saved', text: US.basename(x.file), action: { label: 'Open', fn: () => openFile(x.file) } });
      return x;
    }
  });
  US.actions.register({
    id: 'story.timelineTranscript', tool: 'story', title: 'Transcript of a timeline', changes: false,
    describe: 'Writes who says what in a sequence (the open one unless named), from Premiere’s transcripts of the clips used, and saves it as Word, text, subtitles or a spreadsheet.',
    params: { format: { type: 'enum', options: ['docx', 'txt', 'srt', 'csv'], default: 'docx', desc: 'File type: docx (Word), txt, srt (subtitles) or csv (spreadsheet)' }, sequence: { type: 'string', default: '', desc: 'Sequence name (leave empty for the open one)' } },
    examples: ['transcript of this timeline', 'export the transcript as a Word document', 'who says what in this cut'],
    match(t) {
      const tlWords = /\b(timeline|sequence|cut|edit)\b/i.test(t);
      if (!(/\btranscripts?\b/i.test(t) && (tlWords || /\b(export|save|word|docx|document|srt|subtitles?|csv|spreadsheet)\b/i.test(t))) && !/\bwho says what\b/i.test(t)) return null;
      if (/\b(read|load|import|pull)\b/i.test(t) && !tlWords) return null;
      const format = /\b(srt|subtitles?|captions?)\b/i.test(t) ? 'srt' : /\b(csv|spreadsheet|excel|sheet)\b/i.test(t) ? 'csv' : /\b(txt|plain text|text file)\b/i.test(t) ? 'txt' : 'docx';
      return { format, _score: 2.5 };
    },
    run: async (p, job) => {
      loadState();
      if (!US.ctx.project) throw new US.UserError('NO_PROJECT');
      let seqId = US.ctx.sequence && US.ctx.sequence.id;
      if (p.sequence) { const q = (await US.host.call('listSequences')).find(x => x.name.toLowerCase() === p.sequence.toLowerCase()) || (await US.host.call('listSequences')).find(x => x.name.toLowerCase().includes(p.sequence.toLowerCase())); if (!q) throw new US.UserError('NOT_FOUND', { title: `There’s no sequence called “${p.sequence}”.`, action: 'Check the name, or open the sequence and try again.' }); seqId = q.id; }
      if (!seqId) throw new US.UserError('NO_SEQUENCE');
      const tl = await timelineTranscript(job, { seqId });
      openStory('timeline');
      const x = await exportTimeline(job, tl, p.format);
      US.ui.toast({ type: 'ok', title: 'Transcript saved', text: US.basename(x.file), action: { label: 'Open', fn: () => openFile(x.file) } });
      if (tl.result.missing.length) x.summary += ` (${US.plural(tl.result.missing.length, 'clip')} had no transcript)`;
      return x;
    }
  });

  US.actions.register({
    id: 'story.captions', tool: 'story', title: 'Add captions to a sequence', changes: true,
    describe: 'Adds Premiere captions to the open sequence from its interview transcripts, timed to each word: subtitles (two lines), social (a few words at a time) or one word at a time.',
    params: { style: { type: 'enum', options: ['subtitles', 'social', 'words'], default: 'subtitles', desc: 'subtitles, social or words' }, names: { type: 'boolean', default: false, desc: 'Speaker names when the speaker changes' }, upper: { type: 'boolean', default: false, desc: 'Capitals' } },
    examples: ['add captions', 'social captions for reels', 'one word at a time captions in capitals'],
    match(t) {
      if (!/\b(captions?|subtitles?|subs)\b/i.test(t) || /\btranscripts?\b/i.test(t)) return null;
      return { style: /one word|word by word|single word/i.test(t) ? 'words' : /social|reels?|tiktok|shorts|instagram|few words/i.test(t) ? 'social' : 'subtitles', names: /\b(names?|speakers?)\b/i.test(t), upper: /\b(capitals?|caps|upper ?case)\b/i.test(t), _score: 2.5 };
    },
    run: async (p, job) => {
      loadState();
      const seqId = US.ctx.sequence && US.ctx.sequence.id;
      if (!seqId) throw new US.UserError('NO_SEQUENCE');
      const tl = await timelineTranscript(job, { seqId });
      const x = await makeCaptions(job, tl, { style: p.style, names: p.names, upper: p.upper, add: true });
      if (tl.result.missing.length) x.summary += ` (${US.plural(tl.result.missing.length, 'clip')} had no transcript)`;
      return x;
    }
  });

  US.actions.register({
    id: 'story.promo', tool: 'story', title: 'Make a promo from the latest narrative', changes: true,
    describe: 'Builds the latest narrative cut, then (optionally) covers its jump cuts with B-roll from a bin, adds captions and makes a vertical 9:16 version.',
    params: { bin: { type: 'string', default: '', desc: 'B-roll bin name (empty = no B-roll)' }, captions: { type: 'enum', options: ['', 'social', 'subtitles'], default: 'social', desc: 'Caption style' }, vertical: { type: 'boolean', default: true, desc: 'Also a 9:16 version' } },
    examples: ['make a promo from the narrative with captions and a vertical version', 'turn the narrative into a promo with b-roll from the B-roll bin'],
    match(t) {
      if (!/\bpromo\b/i.test(t)) return null;
      const m = /b-?roll (?:from|in) (?:the )?[“"']?([^“"',.]+?)[”"']?(?: bin)?(?:[,.]|$| and | with )/i.exec(t);
      return { bin: m ? m[1].trim() : '', captions: /no captions|without captions/i.test(t) ? '' : /subtitles/i.test(t) ? 'subtitles' : 'social', vertical: !/no vertical|without (a )?vertical|horizontal only/i.test(t), _score: 2.5 };
    },
    run: async (p, job) => {
      loadState();
      const col = latestNarrative();
      if (!col) throw new US.UserError('NOTHING_FOUND', { title: 'There’s no narrative yet.', action: 'Make one first, e.g. “a 30-second video about volunteering”, then ask for the promo.' });
      let broll = '';
      if (p.bin) { const b = (await US.host.call('listBins')).find(x => x.path.toLowerCase().includes(p.bin.toLowerCase())); if (!b) throw new US.UserError('NOT_FOUND', { title: `There’s no bin called “${p.bin}”.`, action: 'Check the name of your B-roll bin.' }); broll = b.id; }
      return makePromo(job, col, { broll, captions: p.captions, vertical: p.vertical });
    }
  });

  // for Home, tests and the Assistant
  const SECTIONS = { transcripts: { tab: 'transcripts' }, scope: { tab: 'transcripts', section: 'scope' }, find: { tab: 'search' }, search: { tab: 'search' }, themes: { tab: 'themes' }, board: BOARD ? { tab: 'wall' } : { tab: 'build', section: 'build' }, wall: BOARD ? { tab: 'wall' } : { tab: 'build', section: 'build' }, share: { tab: 'timeline' }, build: { tab: 'build', section: 'build' }, narrative: { tab: 'build', section: 'narrative' }, highlights: { tab: 'build', section: 'highlights' }, timeline: { tab: 'timeline' }, export: { tab: 'timeline' }, moments: { tab: 'search', section: 'moments' } };
  US.story = {
    /** Open Story at a section: transcripts, find, themes, board, narrative, timeline, moments, highlights */
    open(section) { US.tools.open('story', Object.assign({}, SECTIONS[section] || { tab: 'transcripts' })); },
    SECTIONS,
    loadState: () => loadState(), state: () => state, addTranscript: (...a) => { const t = addTranscript(...a); reindex(); saveNow(); return t; },
    buildSequence, sortIntoBins, readPremiereTranscripts, importFiles, syncStatus: () => (session ? session.status() : null), flushShared: () => flushShared(), fillWallFromThemes: n => fillWallFromThemes(n), resolveItems, reindex: () => reindex(), save: saveNow,
    // pure pieces (unit-tested)
    nextColour, ensureColours: () => ensureColours(), setColour, columnLabel, moveColumn, moveCard, moveCardToColumn, strongestFirst, isStrong, planBuild, sectionsFrom, lookOptions,
    themeMatches, themeMatchesAI, findAllThemes, ownThemeNames: () => ownThemeNames(), splitThemes, scopeOf: () => scopeOf(), scopeLines: () => scopeLines(), scopeLabel: () => scopeLabel(), setScope, inOutOf, addCustomTheme, addLinesToTheme, removeLineFromTheme, wallGroups, LABEL_TO_MARKER, THEME_PALETTE,
    timelineTranscript, exportTimeline, exportBoard, interviewLog, summarise, openFile, summaryPlan, summarySig, namesFor, refreshCustomTheme: (...a) => refreshCustomTheme(...a),
    PICKY_LEVELS, pickyFor, passLevel, pickLines, effectiveLines, describePicky, relevanceOf, findMore, selectedIds, newThemeFrom, usedInSequence,
    selectionMap, highlightStringOut, removeHighlights, guessStringOut,
    narrativePool, makeNarrative, narrativeColumn, narrativeGroups, buildNarrative, makePromo, latestNarrative: id => latestNarrative(id), trimOf,
    readsFor, setReads, readsPlan, rankCandidates,
    findMoments, momentsPlan, pickMoments, addMomentsToBoard, momentsTheme, buildMoments, themeGroups, BOARD, markMoments, removeMomentMarkers,
    /** tests only: use a state object without a project */
    _useState(s) { session = null; clearTimeout(sharedTimer); sharedTimer = null; state = Object.assign(emptyState(), s); statePath = ''; reindex(); ensureColours(); return state; }
  };
})();
