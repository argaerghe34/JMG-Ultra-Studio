/* JMG Ultra Studio – Story › Pro View (was “Lines”): every line and its details in one table.
   The list on the left chooses what the table shows – a theme, a search made in Story › Find, the answers to an
   interview question, or the moments Story found – and the line you pick shows on the right. Wide panel: list | table |
   the line. Narrow panel: the same, stacked. The list (and each group in it) folds away to give the table the width.
   It only reads Story (US.story) and uses Story's own play / Source Monitor / playhead / drag / build, so what it does
   is exactly what Story's own buttons do. What it keeps itself, with the project's Story: every Find search
   (state.proView.searches – hidden ones go to “Archived”) and the stars you set by hand (state.proView.stars).
   Per computer (settings): the columns' widths and order, what is folded, and the “used” options.
   Keys (while the table has focus): J/K or ↓/↑ move, Space plays, X ticks, Return puts the ticked lines (or this one)
   at the playhead, / filters, Esc clears the filter.
   The table draws only the rows on screen (every row is the same height), so thousands of lines stay smooth. */
(function () {
  'use strict';
  const US = window.US, h = US.h, ui = US.ui;
  const LEVELS = [['all', 'Everything'], ['balanced', 'Balanced'], ['best', 'Only the best']];
  const hexOfLabel = i => (i != null ? (US.ui.LABELS[i] || US.ui.LABELS[0]).hex : 'var(--text-3)');
  const hexOf = th => hexOfLabel(th ? th.label : null);

  /* ================= the pieces without a screen (unit-tested): US.proView ================= */
  const MAX_SEARCHES = 200, ROW_H = 28, FLEX_MIN = 160, TICK_W = 28, MENU_W = 22, GAP = 10, PAD = 20;
  const normQ = q => String(q || '').trim().toLowerCase();

  /** Pro View's own part of the project's Story. */
  function data(state) {
    const d = state.proView && typeof state.proView === 'object' ? state.proView : (state.proView = {});
    if (!Array.isArray(d.searches)) d.searches = [];
    if (!d.stars || typeof d.stars !== 'object') d.stars = {};
    return d;
  }
  const entryOf = (state, q, mode) => data(state).searches.find(x => x.mode === (mode === 'more' ? 'more' : 'search') && normQ(x.q) === normQ(q)) || null;
  /**
   * Keep a search made in Find. e: {q, mode:'search'|'more', at, info?, more?:[{id, rel, reasons}]}; ids: the lines a
   * plain search found (so it opens the same later without searching again). The same words searched again move to the
   * top (and come back from Archived). -> the entry
   */
  function remember(state, e, ids) {
    if (!e || !normQ(e.q)) return null;
    const d = data(state), mode = e.mode === 'more' ? 'more' : 'search';
    const x = entryOf(state, e.q, mode) || { id: US.uid('f'), mode };
    x.q = String(e.q).trim(); x.at = e.at || Date.now();
    if (mode === 'more') {
      if (e.more) x.more = e.more.map(r => ({ id: r.id, rel: r.rel, reasons: r.reasons || [] }));
      if (e.info != null) x.info = e.info;
    } else if (ids) x.ids = ids.slice(0, 400);
    delete x.archived;
    d.searches = [x].concat(d.searches.filter(y => y !== x)).slice(0, MAX_SEARCHES);
    return x;
  }
  /** Once per project: the searches Find already remembered (its last 12) join the list. -> true when something changed */
  function adopt(state) {
    const d = data(state);
    if (d.adopted) return false;
    d.adopted = 1;
    const recent = ((state.finds && state.finds.recent) || []).slice().reverse();   // oldest first, so the newest ends on top
    for (const e of recent) if (!entryOf(state, e.q, e.mode)) remember(state, e, null);
    return true;
  }
  function setArchived(state, id, on) {
    const x = data(state).searches.find(y => y.id === id);
    if (x) { if (on) x.archived = Date.now(); else delete x.archived; }
    return x || null;
  }
  function forget(state, id) { const d = data(state), n = d.searches.length; d.searches = d.searches.filter(y => y.id !== id); return d.searches.length < n; }
  const searches = (state, { archived = false } = {}) => data(state).searches.filter(x => !!x.archived === !!archived);
  const countOf = x => (x.mode === 'more' ? (x.more || []).length : x.ids ? x.ids.length : null);

  /** A star: yours when you set one, otherwise Story's own (a strong, complete line). */
  function isStar(state, id, strong) { const v = state && state.proView && state.proView.stars ? state.proView.stars[id] : null; return v == null ? !!strong : !!v; }
  function setStar(state, id, on, strong) { const d = data(state); if (!!on === !!strong) delete d.stars[id]; else d.stars[id] = on ? 1 : 0; }

  /** Rows by a column, steady (equal rows keep their order); rows with nothing in that column (null) stay last. */
  function sortRows(rows, key, dir, keys) {
    const f = key && keys[key];
    if (!f) return rows.slice();
    return rows.map((r, i) => ({ r, i, v: f(r) })).sort((a, b) => {
      if (a.v == null || b.v == null) return a.v == null && b.v == null ? a.i - b.i : a.v == null ? 1 : -1;
      return (a.v < b.v ? -1 : a.v > b.v ? 1 : 0) * (dir < 0 ? -1 : 1) || a.i - b.i;
    }).map(x => x.r);
  }
  /** The ids from a to b in the order shown (shift-click). */
  function range(ids, a, b) {
    const i = ids.indexOf(a), j = ids.indexOf(b);
    if (j < 0) return [];
    if (i < 0) return [b];
    return ids.slice(Math.min(i, j), Math.max(i, j) + 1);
  }

  /* ---------- columns: width 0 = takes the room that's left ---------- */
  const COLS = [
    { id: 'star', label: '★', title: 'Star', w: 30, min: 24 },
    { id: 'used', label: 'Used', title: 'Already in the sequence', w: 46, min: 24 },
    { id: 'who', label: 'Who', w: 110, min: 40 },
    { id: 'time', label: 'Time', w: 58, min: 36 },
    { id: 'text', label: 'Line', w: 0, min: 80 },
    { id: 'theme', label: 'Theme', w: 140, min: 40 },
    { id: 'len', label: 'Length', w: 60, min: 36 }
  ];
  const colOf = id => COLS.find(c => c.id === id);
  /** Every column can be hidden but the Line itself (“Used” is shown by its own switch). */
  const canHide = id => id !== 'text' && !!colOf(id);
  function setHidden(lay, id, on) { if (!canHide(id)) return lay; lay.hidden = (lay.hidden || []).filter(x => x !== id); if (on) lay.hidden.push(id); return lay; }
  /** The saved layout made safe: unknown columns dropped, new ones put where they'd be by default. */
  function layout(saved) {
    const s = saved && typeof saved === 'object' ? saved : {};
    const order = (Array.isArray(s.order) ? s.order : []).filter((id, i, a) => colOf(id) && a.indexOf(id) === i);
    COLS.forEach((c, i) => { if (!order.includes(c.id)) order.splice(Math.min(i, order.length), 0, c.id); });
    const widths = {};
    for (const c of COLS) { const w = Number(s.widths && s.widths[c.id]); if (w > 0) widths[c.id] = Math.max(c.min, Math.min(1600, Math.round(w))); }
    // columns switched off in the Columns menu (the tick box isn't a column here and the Line always shows)
    const hidden = (Array.isArray(s.hidden) ? s.hidden : []).filter((id, i, a) => colOf(id) && canHide(id) && a.indexOf(id) === i);
    return { order, widths, hidden };
  }
  /** Move a column to sit before another (before = null: to the end). -> a new order */
  function moveCol(order, id, before) {
    if (!order.includes(id) || id === before) return order.slice();
    const out = order.filter(x => x !== id), i = before == null ? -1 : out.indexOf(before);
    if (i < 0) out.push(id); else out.splice(i, 0, id);
    return out;
  }
  function setWidth(lay, id, px) { const c = colOf(id); if (!c) return lay; lay.widths[id] = Math.max(c.min, Math.min(1600, Math.round(px))); return lay; }
  const widthOf = (lay, id) => lay.widths[id] || colOf(id).w;
  const visible = (lay, { used = true } = {}) => lay.order.filter(id => (used || id !== 'used') && !(lay.hidden || []).includes(id));
  /** grid-template-columns for a row: the tick box, then the columns in order. */
  function template(lay, o) { return [TICK_W + 'px'].concat(visible(lay, o).map(id => { const w = widthOf(lay, id); return w ? w + 'px' : `minmax(${FLEX_MIN}px, 1fr)`; }), [MENU_W + 'px']).join(' '); }
  function minWidth(lay, o) { const v = visible(lay, o); return PAD + TICK_W + MENU_W + v.reduce((n, id) => n + (widthOf(lay, id) || FLEX_MIN), 0) + GAP * (v.length + 1); }
  /** Which rows to draw: those on screen and a few either side. -> {from, to} (to not included) */
  function windowOf(scrollTop, viewH, n, rowH = ROW_H, over = 8) {
    const from = Math.max(0, Math.min(n, Math.floor((scrollTop || 0) / rowH) - over));
    return { from, to: Math.max(from, Math.min(n, Math.ceil(((scrollTop || 0) + (viewH || 0)) / rowH) + over)) };
  }
  /** Nothing said: no words once sounds in square brackets (“[laughs]”, “[ __ ]”) are taken out. */
  const noSpeech = text => !/[\p{L}\p{N}]/u.test(String(text || '').replace(/\[[^\]]*\]/g, ''));

  /* ---------- what the table can show ---------- */
  const whoOf = (S, l) => { if (l.speaker) return S.speakerName(l.speaker); const t = l.id ? S.interviewOf(l.id) : null; return t ? t.name : S.speakerName(''); };
  /** Each theme's lines at this pickiness, and each line's themes. */
  function themeIndex(S, st, s) {
    const eff = new Map(), of = new Map(), pos = new Map();
    let n = 0;
    for (const t of st.transcripts) for (const l of t.lines) pos.set(l.id, n++);
    for (const th of st.themes || []) { const ids = S.effectiveLines(th, s); eff.set(th.id, ids); for (const id of ids) { if (!of.has(id)) of.set(id, []); of.get(id).push(th); } }
    return { eff, of, pos };
  }
  const momentsKept = (S, st) => {
    const list = (st.moments && st.moments.list) || [];
    // moments on a transcript line follow How picky, as in Find; ones with no line at all (seen or heard, not said) all show
    return S.pickMoments(list.filter(m => m.lineId && S.lineOf(m.lineId))).concat(list.filter(m => !m.lineId && m.path && m.start != null && m.end != null));
  };
  /**
   * The groups of the left-hand list. Questions and Moments are there only once they've been used.
   * -> [{id, title, items:[{id, name, n, hex?, entry?}], hint?}]
   */
  function groups(S, st, { s, idx = themeIndex(S, st, s) } = {}) {
    const out = [], M = US.storyMoments;
    const said = st.transcripts.reduce((n, t) => n + t.lines.filter(l => l.text && !S.isInterviewer(l)).length, 0);
    const th = [{ id: 'all', name: 'All lines', n: said, hex: 'var(--text-3)' }];
    for (const t of st.themes || []) th.push({ id: 'theme:' + t.id, name: t.name, n: idx.eff.get(t.id).length, hex: hexOf(t) });
    th.push({ id: 'none', name: 'Not in a theme', n: st.transcripts.reduce((n, t) => n + t.lines.filter(l => l.text && !idx.of.has(l.id) && !S.isInterviewer(l)).length, 0), hex: 'transparent' });
    out.push({ id: 'themes', title: 'Themes', items: th, hint: (st.themes || []).length ? '' : 'themes' });
    const item = x => ({ id: 'find:' + x.id, name: x.q, n: countOf(x), more: x.mode === 'more', entry: x });
    out.push({ id: 'finds', title: 'Find searches', items: searches(st).map(item), hint: searches(st).length ? '' : 'finds' });
    if (st.questions && (st.questions.results || []).length) {
      const rs = st.questions.results, total = rs.reduce((n, r) => n + r.answers.length, 0);
      out.push({ id: 'questions', title: 'Questions', items: [{ id: 'q:all', name: 'Every answer', n: total, hex: 'var(--text-3)' }].concat(rs.map(r => ({ id: 'q:' + r.q, name: `Q${r.q + 1} ${r.question}`, n: r.answers.length, hex: hexOfLabel(S.questionLabel(r.q)) }))) });
    }
    if (st.moments && M) {
      const kept = momentsKept(S, st);
      out.push({ id: 'moments', title: 'Moments', items: [{ id: 'm:all', name: 'Every moment', n: kept.length, hex: 'var(--text-3)' }].concat(M.ORDER.map(t => ({ id: 'm:' + t, name: M.TYPES[t].plural, n: kept.filter(m => m.type === t).length, hex: hexOfLabel(M.TYPES[t].label) })).filter(x => x.n)) });
    }
    const arch = searches(st, { archived: true });
    if (arch.length) out.push({ id: 'archived', title: 'Archived', items: arch.map(item) });
    return out;
  }
  /**
   * The rows for one choice in the list, in their own order (interview order for themes, best first for a search, by
   * question for answers). A row: {id, kind:'line'|'answer'|'moment', l (the line, or the whole answer as one),
   * ids (the transcript lines in it), themes, who, pos, tag?, reasons?, summary?, noSpeech?, path?, label?, desc?}
   */
  function rowsFor(S, st, source, { s, idx = themeIndex(S, st, s), asked = false } = {}) {
    const row = (l, extra) => Object.assign({ id: l.id, kind: 'line', l, ids: [l.id], themes: idx.of.get(l.id) || [], who: whoOf(S, l), pos: idx.pos.has(l.id) ? idx.pos.get(l.id) : 1e9 }, extra);
    const lines = ids => ids.map(id => S.lineOf(id)).filter(l => l && l.text);
    let out = [];
    source = String(source || 'all');
    if (source === 'all' || source === 'none') {
      for (const t of st.transcripts) for (const l of t.lines) if (l.text && !S.isInterviewer(l) && (source === 'all' || !idx.of.has(l.id))) out.push(row(l));
    } else if (source.indexOf('theme:') === 0) {
      out = lines(idx.eff.get(source.slice(6)) || []).map(l => row(l)).sort((a, b) => a.pos - b.pos);
    } else if (source.indexOf('find:') === 0) {
      const e = data(st).searches.find(x => x.id === source.slice(5));
      if (e && e.mode === 'more') out = (e.more || []).map(r => { const l = S.lineOf(r.id); return l && l.text ? row(l, { reasons: r.reasons || [], rel: r.rel }) : null; }).filter(Boolean);
      else if (e) out = lines(e.ids || S.search(e.q).map(r => r.line.id)).map(l => row(l));
    } else if (source.indexOf('q:') === 0 && st.questions && US.storyQuestions) {
      const Q = US.storyQuestions, qi = Q.indexOf(st.transcripts), which = source.slice(2);
      for (const r of st.questions.results || []) {
        if (which !== 'all' && String(r.q) !== which) continue;
        for (const a of r.answers) {
          const ls = Q.linesOf(a, qi, { asked });
          if (!ls.length) continue;
          const first = ls[0], last = ls[ls.length - 1], multi = new Set(ls.map(l => l.speaker)).size > 1;
          // the whole answer as one, from where they start answering to where they move on
          const l = Object.assign({}, first, { end: last.end, text: ls.map(x => (multi ? `${S.speakerName(x.speaker)}: ` : '') + x.text).join(' ') });
          out.push(row(l, { id: `a:${r.q}:${first.id}:${last.id}`, kind: 'answer', ids: ls.map(x => x.id), who: whoOf(S, (ls.find(x => x.id === a.from) || first)), themes: Array.from(new Set(ls.flatMap(x => idx.of.get(x.id) || []))),
            tag: { name: `Q${r.q + 1}`, title: r.question, label: S.questionLabel(r.q) }, label: S.questionLabel(r.q), summary: a.summary || '', pos: idx.pos.get(first.id) }));
        }
      }
    } else if (source.indexOf('m:') === 0 && st.moments && US.storyMoments) {
      const M = US.storyMoments, type = source.slice(2);
      for (const m of momentsKept(S, st)) {
        if (type !== 'all' && m.type !== type) continue;
        const ty = M.TYPES[m.type] || { name: US.cap(String(m.type || 'Moment')), label: null };
        const extra = { kind: 'moment', tag: { name: ty.name, title: (m.reasons || []).join(' · '), label: ty.label }, label: ty.label, reasons: m.reasons || [], moment: m };
        const l = m.lineId ? S.lineOf(m.lineId) : null;
        if (l) { const t = S.interviewOf(l.id); out.push(row(l, Object.assign(extra, { noSpeech: noSpeech(l.text), path: (t && t.path) || '' }))); }
        // seen or heard, not said: there is no transcript line, so the row shows what happens instead
        else out.push(Object.assign({ id: `m:${m.path}:${m.start}`, l: { id: '', start: m.start, end: m.end, text: '', speaker: '' }, ids: [], themes: [], who: m.who || US.basename(m.path), pos: 1e9, noSpeech: true, path: m.path }, extra));
      }
      for (const r of out) if (r.noSpeech) r.desc = describeBasic(r);
    }
    const seen = new Set();
    return out.filter(r => !seen.has(r.id) && seen.add(r.id));
  }
  /** What a moment with nothing said shows until (or without) a described picture: its label or why it was found, and when. */
  function describeBasic(r) {
    const m = r.moment || {}, what = m.label || (r.reasons || []).join(' · ') || (r.tag ? r.tag.name : 'Moment');
    return `${what} · ${US.fmtDur(r.l.start)}–${US.fmtDur(r.l.end)}`;
  }
  /** The words a row is filtered by. */
  const hay = r => (r.l.text + ' ' + r.who + ' ' + r.themes.map(t => t.name).join(' ') + ' ' + (r.tag ? r.tag.name + ' ' + (r.tag.title || '') : '') + ' ' + (r.described || r.desc || '')).toLowerCase();
  const SORT_KEYS = {
    time: r => r.pos * 1e5 + r.l.start, who: r => r.who.toLowerCase(), len: r => r.l.end - r.l.start, star: r => (r.star ? 0 : 1), used: r => (r.used ? 0 : 1),
    theme: r => { const n = r.tag ? r.tag.name : r.themes[0] ? r.themes[0].name : ''; return n ? n.toLowerCase() : null; }, text: r => (r.l.text || r.desc || '').toLowerCase()
  };
  const kindOf = source => (/^(find|q|m):/.exec(String(source)) || [0, 'theme'])[1];

  US.proView = { data, remember, adopt, entryOf, setArchived, forget, searches, countOf, isStar, setStar, sortRows, range, COLS, layout, moveCol, setWidth, setHidden, canHide, template, minWidth, visible, windowOf, noSpeech,
    themeIndex, groups, rowsFor, describeBasic, hay, SORT_KEYS, kindOf, ROW_H };

  /* ================= the tab ================= */
  US.tools.register({
    id: 'storylines', name: 'Pro View', short: 'Pro View', icon: 'log', group: 'find', place: 'story', order: 22.2, wide: true,
    blurb: 'Every line and its details in one table – themes, your searches, answers and moments – best with a wide panel.',
    create() {
      const P = US.proView;
      const v = ui.toolView({ icon: 'log', title: 'Pro View', blurb: 'Every line from your interviews, with its details, in one table. Choose a theme, a search, a question or a kind of moment on the left; pick a line to see it on the right; tick several to add them to a sequence. Widen the panel (or undock it) to see all three side by side.' });
      v.el.classList.add('sl', 'pv');
      const S = () => US.story;
      const set = (k, x) => US.settings.set('proview.' + k, x), get = (k, d) => US.settings.get('proview.' + k, d);
      let source = 'all', level = null, query = '', sel = new Set(), cursor = null, anchor = null, sort = { key: null, dir: 1 }, shown = [], byId = new Map(), groupList = [];
      let lay = P.layout(get('cols', null)), listHidden = !!get('listHidden', false), folded = Object.assign({ archived: true }, get('folded', {}));
      let showUsed = !!get('used', false), hideUsed = !!get('hideUsed', false), used = null;   // used: {seqId, name, ids:Set} for the sequence last checked
      let drawn = { from: -1, to: -1 };
      const strongOf = new WeakMap();
      const strong = l => { if (!strongOf.has(l)) strongOf.set(l, !!S().isStrong(l)); return strongOf.get(l); };
      const mod = US.fsx && US.fsx.isWin ? 'Ctrl' : '⌘';

      const find = h('input.input.sl-find', { type: 'text', placeholder: 'Filter – words, speaker or theme', spellcheck: false, 'aria-label': 'Filter the lines' });
      const picky = ui.segmented({ options: LEVELS.map(([value, label]) => ({ value, label })), value: 'balanced', onChange: x => { level = x; draw(); } });
      const listBtn = h('button.btn.ghost.small.pv-listbtn', { onclick: () => { listHidden = !listHidden; set('listHidden', listHidden); drawShell(); } });
      const summary = h('div.sl-sum');
      const listEl = h('div.sl-themes.pv-list', { 'aria-label': 'What the table shows' });
      const headEl = h('div.pv-row.pv-head'), rowsEl = h('div.pv-rows'), tableEmpty = h('div.pv-none');
      const sizer = h('div.pv-sizer', headEl, rowsEl);
      const table = h('div.sl-table.pv-table', { role: 'listbox', 'aria-multiselectable': 'true', tabindex: 0 }, sizer, tableEmpty);
      const insp = h('div.sl-insp');
      const body = h('div.sl-body', listEl, h('div.sl-mid', table), insp);
      const bar = h('div.pv-bar.hidden');
      const opts = h('div.pv-opts');
      const empty = h('div');
      const keys = h('div.sl-keys', 'Keys: ', h('span.kbd', 'J'), h('span.kbd', 'K'), ' move · ', h('span.kbd', 'space'), ' play · ', h('span.kbd', 'X'), ' tick · ', h('span.kbd', '↵'), ' at the playhead · ', h('span.kbd', '/'), ` filter · shift- or ${mod}-click ticks several · drag a column’s edge to resize it, its title to move it, right-click it to hide it`);
      const tools = h('div.sl-tools', listBtn, find, picky.el || picky, summary);
      v.body.append(tools, opts, bar, empty, body, keys);
      find.addEventListener('input', () => { query = find.value.trim().toLowerCase(); draw(); });

      /* ---------- what's shown ---------- */
      function levelOf(s) { let best = 'balanced', d = 9; for (const [k] of LEVELS) { const x = Math.abs(S().PICKY_LEVELS[k] - s); if (x < d) { d = x; best = k; } } return best; }
      const itemOf = id => { for (const g of groupList) for (const it of g.items) if (it.id === id) return it; return null; };
      const usedNow = () => (showUsed || hideUsed) && used && US.ctx.sequence && used.seqId === US.ctx.sequence.id ? used.ids : null;
      /** Choose what the table shows (from the list, or from Themes / Find: {source} or {find:{q, mode}}). */
      function choose(id) {
        if (id === source) return;
        if (P.kindOf(id) !== P.kindOf(source)) sort = { key: null, dir: 1 };   // a search opens best first, a theme in interview order
        source = id; sel.clear(); cursor = anchor = null; table.scrollTop = 0;
      }
      function openFrom(o) {
        if (!o || !S() || !S().state) return;
        S().loadState();
        const st = S().state();
        if (o.find && String(o.find.q || '').trim()) {
          P.adopt(st);
          let e = P.entryOf(st, o.find.q, o.find.mode);
          if (!e) e = P.remember(st, { q: o.find.q, mode: o.find.mode, at: Date.now() }, null);
          if (e.archived) P.setArchived(st, e.id, false);
          S().save();
          delete folded.finds;
          choose('find:' + e.id);
        } else if (o.source) {
          const g = { theme: 'themes', q: 'questions', m: 'moments' }[P.kindOf(o.source)];
          if (g) delete folded[g];
          choose(String(o.source));
        }
        if (query) { query = ''; find.value = ''; }
      }

      function draw() {
        if (!S() || !S().state) return;
        S().loadState();
        const st = S().state();
        if (P.adopt(st)) S().save();
        const hasLines = st.transcripts.some(t => t.lines.length);
        US.clear(empty);
        [body, keys, tools, opts].forEach(x => x.classList.toggle('hidden', !hasLines));
        if (!hasLines) { bar.classList.add('hidden'); empty.appendChild(ui.empty({ icon: 'story', title: 'No transcripts yet', text: 'Story reads your interviews first – then every line shows here.', action: ui.button('Go to Story › 1 Interviews', { kind: 'primary', onClick: () => S().open('transcripts') }) })); return; }
        if (!level) { const lv = levelOf(S().pickyFor(null).s); (picky.set || (() => {}))(lv); }
        const s = S().PICKY_LEVELS[level || levelOf(S().pickyFor(null).s)];
        const idx = P.themeIndex(S(), st, s);
        groupList = P.groups(S(), st, { s, idx });
        if (!itemOf(source)) { source = 'all'; sel.clear(); cursor = null; }
        const u = usedNow();
        let rows = P.rowsFor(S(), st, source, { s, idx, asked: !!US.settings.get('story.qAsked', false) });
        for (const r of rows) {
          r.star = P.isStar(st, r.l.id || r.id, r.kind !== 'answer' && r.l.id && !r.noSpeech ? strong(r.l) : false);
          r.used = !!u && r.ids.some(id => u.has(id));
          const d = r.noSpeech ? described.get(descKey(r)) : null; if (d && d.text) r.described = d.text;
        }
        if (query) rows = rows.filter(r => P.hay(r).includes(query));
        if (hideUsed && u) rows = rows.filter(r => !r.used);
        shown = P.sortRows(rows, sort.key, sort.dir, P.SORT_KEYS);
        byId = new Map(shown.map((r, i) => [r.id, i]));
        for (const id of Array.from(sel)) if (!byId.has(id)) sel.delete(id);
        if (cursor && !byId.has(cursor)) cursor = null;
        if (!cursor && shown.length) cursor = shown[0].id;
        drawShell(); drawList(); drawOpts(); drawHead(); drawRows(true); drawBar(); drawInsp(); drawSummary();
      }
      function drawSummary() {
        const secs = shown.reduce((n, r) => n + (r.l.end - r.l.start), 0);
        summary.textContent = `${US.plural(shown.length, 'line')} · ${US.fmtDur(secs)}${sel.size ? ` · ${sel.size} ticked` : ''}`;
      }
      /** The list shown or folded away, and the button that says which. */
      function drawShell() {
        body.classList.toggle('pv-nolist', listHidden);
        const it = itemOf(source);
        US.append(US.clear(listBtn), [US.icon(listHidden ? 'right' : 'left', 12), h('span', listHidden ? 'Show the list' : 'Hide the list'), listHidden && it ? h('span.pv-now', ' · ', US.keep(it.name)) : null]);
        listBtn.title = listHidden ? 'Show the list of themes, searches, questions and moments again' : 'Hide the list on the left, so the table gets the full width';
        listBtn.setAttribute('aria-expanded', String(!listHidden));
        (picky.el || picky).classList.toggle('hidden', P.kindOf(source) !== 'theme');
      }

      /* ---------- the list on the left: a group each for Themes, Find searches, Questions, Moments, Archived ---------- */
      function drawList() {
        US.clear(listEl);
        const st = S().state();
        for (const g of groupList) {
          const closed = !!folded[g.id];
          listEl.appendChild(h('button.pv-gh' + (closed ? '.closed' : ''), { dataset: { group: g.id }, 'aria-expanded': String(!closed), title: closed ? 'Show' : 'Hide', onclick: () => { if (closed) delete folded[g.id]; else folded[g.id] = true; set('folded', folded); drawList(); } },
            US.icon('chevron', 12), h('span.pv-gt', g.title), h('span.sl-n', String(g.items.length - (g.id === 'themes' ? 2 : g.id === 'questions' || g.id === 'moments' ? 1 : 0)))));
          if (closed) continue;
          const boxEl = h('div.pv-group', { role: 'listbox', 'aria-label': g.title });
          for (const it of g.items) {
            const e = it.entry, arch = g.id === 'archived';
            boxEl.appendChild(h('div.pv-item' + (source === it.id ? '.on' : ''),
              h('button.sl-theme' + (source === it.id ? '.on' : ''), { role: 'option', dataset: { source: it.id }, title: e ? `${e.mode === 'more' ? 'Find more' : 'Search'}: ${e.q}${e.at ? ' · ' + new Date(e.at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : ''}` : it.name, onclick: () => { choose(it.id); draw(); } },
                e ? h('span.pv-mark', e.mode === 'more' ? '✦' : US.icon('search', 11)) : h('span.sl-sw', { style: { background: it.hex } }),
                h('span.sl-tname', US.keep(it.name)), it.n != null ? h('span.sl-n', String(it.n)) : null),
              e && !arch ? h('button.icon-btn.pv-x', { title: 'Hide this search – it goes to Archived, at the bottom of the list', 'aria-label': 'Archive this search', dataset: { archive: e.id }, onclick: () => { P.setArchived(st, e.id, true); S().save(); if (source === it.id) choose('all'); draw(); } }, US.icon('eyeoff', 12)) : null,
              e && arch ? h('button.icon-btn.pv-x', { title: 'Bring this search back', 'aria-label': 'Bring this search back', dataset: { restore: e.id }, onclick: () => { P.setArchived(st, e.id, false); S().save(); delete folded.finds; draw(); } }, US.icon('eye', 12)) : null,
              e && arch ? h('button.icon-btn.pv-x', { title: 'Delete this search for good', 'aria-label': 'Delete this search', dataset: { forget: e.id }, onclick: () => { P.forget(st, e.id); S().save(); if (source === it.id) choose('all'); draw(); } }, US.icon('close', 12)) : null));
          }
          if (g.hint === 'themes') boxEl.appendChild(h('div.field-hint', 'No themes yet – ', h('button.link-btn', { onclick: () => S().open('themes') }, 'find them in Story › 2 Themes'), '.'));
          if (g.hint === 'finds') boxEl.appendChild(h('div.field-hint', 'Every search you make in ', h('button.link-btn', { onclick: () => S().open('find') }, 'Story › 3 Find'), ' shows here.'));
          listEl.appendChild(boxEl);
        }
      }

      /* ---------- “used” and the columns ---------- */
      function drawOpts() {
        const seq = US.ctx.sequence, fresh = used && seq && used.seqId === seq.id;
        const wasOpen = opts.firstChild && !opts.firstChild.classList.contains('closed');
        const status = !seq ? 'Open a sequence to see which lines are in it.' : fresh ? [`${US.plural(used.ids.size, 'line')} of your interviews found in “`, US.keep(seq.name), '”.'] : ['Not checked for “', US.keep(seq.name), '” yet.'];
        US.clear(opts).appendChild(ui.section('Used lines and columns', [
          ui.toggle({ label: 'Mark lines already in the open sequence', hint: 'A tick in a “Used” column. Story compares the clips in the sequence with the transcripts: a line counts as used when any part of it is in the sequence, on any track.', value: showUsed, onChange: x => { showUsed = x; set('used', x); if (x && !usedNow()) checkUsed(); else draw(); } }),
          ui.toggle({ label: 'Hide used lines', hint: 'Leaves only what isn’t in the open sequence yet.', value: hideUsed, onChange: x => { hideUsed = x; set('hideUsed', x); if (x && !usedNow()) checkUsed(); else draw(); } }),
          h('div.row', h('span.field-hint.grow', status), ui.button(fresh ? 'Check again' : 'Check now', { small: true, icon: 'refresh', disabled: !seq, title: 'Read the open sequence again (after you’ve cut in it)', onClick: () => checkUsed() })),
          h('div.row', h('span.field-hint.grow', 'Columns: drag the edge of a column’s title to make it wider or narrower; press and drag a title to move the column; hide or show columns with the cog at the end of the titles, or right-click a title. Kept on this computer.'),
            ui.button('Reset the columns', { small: true, kind: 'ghost', title: 'Every column back, in its first order and width', onClick: () => { lay = P.layout(null); set('cols', null); drawHead(); drawRows(true); } }))
        ], { open: !!wasOpen, hint: showUsed || hideUsed ? (hideUsed ? 'used lines hidden' : 'used lines marked') : '' }));
      }
      /** Which lines are in the open sequence (Story's own timeline reading – the one “Not already in my cut” uses). */
      function checkUsed() {
        const seq = US.ctx.sequence;
        if (!seq) { ui.toast({ type: 'info', title: 'Open a sequence first.', text: 'Then Pro View can mark the lines that are already in it.' }); draw(); return Promise.resolve(); }
        return Promise.resolve(US.jobs.run({ title: 'Checking which lines are in the sequence', tool: 'storylines' }, async job => {
          const ids = await S().usedInSequence(job, seq.id);
          used = { seqId: seq.id, name: seq.name, ids };
          return { summary: `${US.plural(ids.size, 'line')} of your interviews are in “${seq.name}”` };
        })).catch(() => {}).then(() => draw());
      }

      /* ---------- the table: a header you can sort, resize and reorder; only the rows on screen are drawn ---------- */
      const cols = () => P.visible(lay, { used: showUsed });
      function applyCols() { sizer.style.setProperty('--pv-cols', P.template(lay, { used: showUsed })); sizer.style.minWidth = P.minWidth(lay, { used: showUsed }) + 'px'; }
      function drawHead() {
        applyCols();
        US.clear(headEl);
        const all = shown.length && shown.every(r => sel.has(r.id)), some = !all && shown.some(r => sel.has(r.id));
        const box = h('input', { type: 'checkbox', checked: !!all, title: all ? 'Untick every line shown' : `Tick all ${shown.length} lines shown`, 'aria-label': 'Tick every line shown', onclick: e => { e.stopPropagation(); if (all) sel.clear(); else shown.forEach(r => sel.add(r.id)); anchor = null; afterTick(); } });
        box.indeterminate = !!some;
        headEl.appendChild(h('span.pv-c.pv-tick', box));
        for (const id of cols()) {
          const c = P.COLS.find(x => x.id === id), on = sort.key === id;
          const btn = h('button.sl-th.pv-thb' + (on ? '.on' : ''), { title: `${c.title || c.label} – click to sort, click again to reverse; press and drag to move the column`, 'aria-sort': on ? (sort.dir > 0 ? 'ascending' : 'descending') : 'none' }, h('span.pv-thl', c.label), on ? h('span.pv-arrow', sort.dir > 0 ? '↑' : '↓') : null);
          const grip = h('span.pv-grip', { title: 'Drag to change the width', 'aria-hidden': 'true' });
          const th = h('div.pv-th.pv-c-' + id, { dataset: { col: id } }, btn, grip);
          btn.addEventListener('pointerdown', e => startMove(e, id, th));
          btn.addEventListener('click', () => { if (moved) { moved = false; return; } sort = { key: id, dir: sort.key === id ? -sort.dir : 1 }; draw(); });
          grip.addEventListener('pointerdown', e => startResize(e, id, th));
          th.addEventListener('contextmenu', e => { e.preventDefault(); colMenu({ col: id, x: e.clientX }); });
          headEl.appendChild(th);
        }
        // the Columns menu, at the right-hand end of the titles (it stays in view when the table is scrolled sideways)
        headEl.appendChild(h('button.icon-btn.pv-colbtn', { title: 'Columns – choose which ones show', 'aria-label': 'Columns', 'aria-haspopup': 'true', onclick: e => { e.stopPropagation(); if (menuEl) closeMenu(); else colMenu({}); } }, US.icon('gear', 13)));
      }
      let moved = false, menuEl = null;
      function closeMenu() { if (menuEl) { menuEl.remove(); menuEl = null; document.removeEventListener('pointerdown', menuAway, true); document.removeEventListener('keydown', menuKey, true); } }
      function menuAway(e) { if (menuEl && !menuEl.contains(e.target) && !(e.target.closest && e.target.closest('.pv-colbtn'))) closeMenu(); }
      function menuKey(e) { if (e.key === 'Escape') { closeMenu(); table.focus({ preventScroll: true }); } }
      /** Which columns show: a tick box each (from the button at the end of the titles, or a right-click on a title – then with “Hide this column”). */
      function colMenu({ col = null, x = null }) {
        closeMenu();
        const mid = table.parentNode, box = mid.getBoundingClientRect();
        const hide = (id, on) => { if (id === 'used') { showUsed = !on; set('used', showUsed); } else { P.setHidden(lay, id, on); set('cols', lay); } };
        const again = () => { if (showUsed && !usedNow()) checkUsed(); else draw(); colMenu({ col, x }); };
        const c0 = col && P.COLS.find(c => c.id === col);
        menuEl = h('div.pv-colmenu', { role: 'menu', 'aria-label': 'Columns' },
          c0 && col !== 'text' ? h('button.pv-colhide', { role: 'menuitem', dataset: { hide: col }, onclick: () => { hide(col, true); closeMenu(); if (col === 'used') drawOpts(); draw(); } }, `Hide “${c0.title || c0.label}”`) : null,
          h('div.sl-h', 'Columns'),
          lay.order.map(id => { const c = P.COLS.find(k => k.id === id), fixed = !P.canHide(id), on = id === 'used' ? showUsed : !lay.hidden.includes(id);
            return h('label.pv-colopt' + (fixed ? '.fixed' : ''), { title: fixed ? 'The line itself always shows' : id === 'used' ? 'Marks the lines already in the open sequence' : '' },
              h('input', { type: 'checkbox', checked: on, disabled: fixed, dataset: { colshow: id }, onchange: e => { hide(id, !e.target.checked); if (id === 'used') drawOpts(); again(); } }), h('span', c.title && c.id === 'star' ? 'Star' : c.label)); }),
          h('button.pv-colhide', { role: 'menuitem', dataset: { colreset: '1' }, onclick: () => { lay = P.layout(null); set('cols', null); closeMenu(); draw(); } }, 'Reset the columns'));
        mid.appendChild(menuEl);
        if (x != null) menuEl.style.left = Math.max(4, Math.min(x - box.left, box.width - 190)) + 'px'; else menuEl.style.right = '4px';
        document.addEventListener('pointerdown', menuAway, true); document.addEventListener('keydown', menuKey, true);
      }
      /** Drag a column's edge: its width follows the pointer; saved when you let go. */
      function startResize(e, id, th) {
        if (e.button) return;
        e.preventDefault(); e.stopPropagation();
        const x0 = e.clientX, w0 = th.getBoundingClientRect().width;
        const move = ev => { P.setWidth(lay, id, w0 + ev.clientX - x0); applyCols(); };
        const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); document.body.classList.remove('pv-resizing'); set('cols', lay); };
        document.body.classList.add('pv-resizing');
        window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
      }
      /** Press and drag a column's title: a line shows where it will go; let go to move it. A plain click sorts. */
      function startMove(e, id, th) {
        if (e.button) return;
        const x0 = e.clientX;
        let drag = false, before;
        const cells = () => Array.from(headEl.querySelectorAll('.pv-th'));
        const mark = () => cells().forEach(c => { c.classList.toggle('pv-drop', drag && c.dataset.col === before); c.classList.toggle('pv-drop-end', drag && before === null && c === cells()[cells().length - 1]); });
        const move = ev => {
          if (!drag && Math.abs(ev.clientX - x0) < 6) return;
          drag = true; th.classList.add('pv-moving'); document.body.classList.add('pv-dragging');
          before = null;
          for (const c of cells()) { const b = c.getBoundingClientRect(); if (ev.clientX < b.left + b.width / 2) { before = c.dataset.col; break; } }
          mark();
        };
        const up = () => {
          window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up);
          document.body.classList.remove('pv-dragging');
          if (!drag) return;
          moved = true; setTimeout(() => { moved = false; }, 0);   // the click that follows a drag doesn't sort
          // "before" is among the columns on screen; a hidden Used column keeps its place
          lay.order = P.moveCol(lay.order, id, before === undefined ? null : before);
          set('cols', lay); drawHead(); drawRows(true);
        };
        window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
      }

      function rowEl(r, i) {
        const l = r.l, th = r.themes[0], can = r.ids.length > 0;
        const cell = {
          star: () => h('button.pv-c.pv-c-star.sl-star' + (r.star ? '.on' : ''), { tabindex: -1, title: r.star ? 'Starred – click to take the star off' : 'Click to star this line', 'aria-label': r.star ? 'Starred' : 'Not starred', onclick: e => { e.stopPropagation(); star([r], !r.star); } }, r.star ? '★' : '☆'),
          used: () => h('span.pv-c.pv-c-used', r.used ? h('span.pv-used', { title: used ? `Already in “${used.name}”` : 'Already in the sequence' }, US.icon('ok', 12)) : null),
          who: () => h('span.pv-c.sl-who', US.keep(r.who)),
          time: () => h('span.pv-c.sl-tc', US.fmtDur(l.start)),
          text: () => (r.noSpeech ? h('span.pv-c.sl-text.pv-desc', { title: 'Nothing is said here – this is what happens' }, US.keep(r.described || r.desc || '')) : h('span.pv-c.sl-text', US.keep(l.text))),
          theme: () => h('span.pv-c.sl-tht', r.tag ? [h('span.sl-sw', { style: { background: hexOfLabel(r.tag.label) } }), h('span', { title: r.tag.title || '' }, US.keep(r.tag.name))]
            : th ? [h('span.sl-sw', { style: { background: hexOf(th) } }), US.keep(th.name + (r.themes.length > 1 ? ` +${r.themes.length - 1}` : ''))] : h('span.sl-dim', '–')),
          len: () => h('span.pv-c.sl-len', (l.end - l.start).toFixed(1) + ' s')
        };
        const box = h('input', { type: 'checkbox', checked: sel.has(r.id), tabindex: -1, 'aria-label': 'Tick this line', onclick: e => { e.stopPropagation(); tick(r.id, e, e.target.checked); } });
        if (r.noSpeech) describe(r);
        return h('div.pv-row' + (r.id === cursor ? '.cur' : '') + (sel.has(r.id) ? '.sel' : '') + (r.used ? '.used' : ''), { role: 'option', 'aria-selected': String(sel.has(r.id)), dataset: { id: r.id }, style: { top: i * ROW_H + 'px' }, draggable: can ? 'true' : 'false',
          title: can ? 'Click to see it · double-click to play · drag to the timeline' : 'There’s no transcript line for this moment, so it can’t be played or placed from here',
          onclick: e => pick(r.id, e), ondblclick: () => { if (can) S().cueLine(l); }, ondragstart: e => { if (can) S().dragLines(e, linesOf(acting(r)), placeHow()); } },
          h('span.pv-c.pv-tick', box), cols().map(id => cell[id]()));
      }
      /** Draw the rows on screen (again when force, or when scrolling has moved past what's drawn). */
      function drawRows(force) {
        const w = P.windowOf(Math.max(0, table.scrollTop - headEl.offsetHeight), table.clientHeight || 600, shown.length);
        if (!force && w.from === drawn.from && w.to === drawn.to) return;
        drawn = w;
        rowsEl.style.height = shown.length * ROW_H + 'px';
        US.clear(rowsEl);
        for (let i = w.from; i < w.to; i++) rowsEl.appendChild(rowEl(shown[i], i));
        US.clear(tableEmpty);
        if (!shown.length) {
          const k = P.kindOf(source), u = hideUsed && usedNow();
          tableEmpty.appendChild(ui.empty({ icon: 'info', title: query ? `No lines with “${query}”` : u ? 'Every line here is already in the sequence' : k === 'theme' ? 'No lines here at this pickiness' : 'No lines here',
            text: query ? 'Clear the filter, or search the interviews in Story › Find.' : u ? 'Switch off “Hide used lines” to see them.' : k === 'theme' ? 'Try Everything.' : k === 'find' ? 'This search found nothing in the interviews as they are now.' : 'Nothing was found for this one.' }));
        }
      }
      let raf = 0;
      table.addEventListener('scroll', () => { if (raf) return; raf = requestAnimationFrame(() => { raf = 0; drawRows(false); }); });
      window.addEventListener('resize', US.debounce(() => { if (US.tools.current === 'storylines') drawRows(false); }, 120));

      /* ---------- a moment with nothing said: what happens in it (filled in later, never holding the table up) ---------- */
      const described = new Map(), waiting = [];
      let busy = 0;
      const descKey = r => `${r.path}|${r.l.start}|${r.l.end}`;
      function describe(r) {
        const U = US.understand;
        if (!U || typeof U.describe !== 'function' || !r.path) return;
        const k = descKey(r);
        if (described.has(k)) return;
        described.set(k, {});
        waiting.push({ k, r });
        pump();
      }
      function pump() {
        while (busy < 2 && waiting.length) {
          const { k, r } = waiting.shift();
          busy++;
          let p;
          try { p = Promise.resolve(US.understand.describe({ path: r.path, start: r.l.start, end: r.l.end })); } catch (e) { p = Promise.resolve(null); }
          p.catch(() => null).then(d => {
            busy--;
            const text = d && typeof d.text === 'string' ? d.text.trim() : '';
            if (text) {
              described.set(k, { text });
              for (const x of shown) if (x.noSpeech && descKey(x) === k) {
                x.described = text;
                const el = rowsEl.querySelector(`.pv-row[data-id="${esc(x.id)}"] .pv-desc`);
                if (el) { US.clear(el).appendChild(document.createTextNode(text)); }
                if (x.id === cursor) drawInsp();
              }
            }
            pump();
          });
        }
      }
      const esc = id => (window.CSS && CSS.escape ? CSS.escape(id) : String(id).replace(/"/g, '\\"'));

      /* ---------- picking and ticking ---------- */
      /** The rows a button, a key or a drag acts on: the ticked ones (in table order) when this row is one of them – or there's no row – else this one. */
      function acting(r) { return sel.size && (!r || sel.has(r.id)) ? shown.filter(x => sel.has(x.id)) : r ? [r] : []; }
      /** rows -> the lines to play or place (an answer is one piece, first word to last). */
      const linesOf = rs => rs.filter(r => r.ids.length).map(r => r.l);
      /** Answers go in their question's colour and moments in their type's, as in Find; other lines in their theme's. */
      function placeHow() { const k = P.kindOf(source); if (k !== 'q' && k !== 'm') return {}; const lab = new Map(shown.map(r => [r.l, r.label])); return { labelOf: l => (lab.has(l) ? lab.get(l) : null) }; }
      const rowOf = id => (byId.has(id) ? shown[byId.get(id)] : null);
      function tick(id, e, on) {
        const ids = shown.map(r => r.id);
        if (e && e.shiftKey && anchor && byId.has(anchor)) P.range(ids, anchor, id).forEach(x => (on ? sel.add(x) : sel.delete(x)));
        else if (on) sel.add(id); else sel.delete(id);
        anchor = id;
        afterTick();
      }
      function afterTick() { drawHead(); drawRows(true); drawBar(); drawSummary(); }
      function pick(id, e) {
        if (e && (e.metaKey || e.ctrlKey)) { sel.has(id) ? sel.delete(id) : sel.add(id); anchor = id; }
        else if (e && e.shiftKey && cursor) { P.range(shown.map(r => r.id), anchor && byId.has(anchor) ? anchor : cursor, id).forEach(x => sel.add(x)); }
        else anchor = id;
        cursor = id;
        afterTick(); drawInsp(); reveal(id);
      }
      /** Keep the picked row on screen. */
      function reveal(id) {
        if (!byId.has(id)) return;
        const top = byId.get(id) * ROW_H, hd = headEl.offsetHeight || 26, viewH = table.clientHeight || 0;
        if (top < table.scrollTop) table.scrollTop = top;
        else if (viewH && top + ROW_H + hd > table.scrollTop + viewH) table.scrollTop = top + ROW_H + hd - viewH;
        drawRows(false);
      }
      function star(rs, on) {
        const st = S().state();
        for (const r of rs) P.setStar(st, r.l.id || r.id, on, r.kind !== 'answer' && r.l.id && !r.noSpeech ? strong(r.l) : false);
        S().save();
        draw();
      }

      /* ---------- the bar for the ticked lines ---------- */
      function drawBar() {
        const rs = shown.filter(r => sel.has(r.id)), n = rs.length;
        bar.classList.toggle('hidden', !n);
        US.clear(bar);
        if (!n) return;
        const secs = rs.reduce((k, r) => k + (r.l.end - r.l.start), 0), allStar = rs.every(r => r.star);
        US.append(bar, [h('span.pv-bar-n', h('b', String(n)), ` ticked · ${US.fmtDur(secs)}`),
          ui.button(`Add ${US.plural(n, 'line')} to a sequence`, { small: true, kind: 'primary', icon: 'film', title: 'To the open sequence – at the playhead or at the end – or to a new sequence', onClick: () => addDialog(rs) }),
          ui.button(allStar ? 'Unstar' : 'Star', { small: true, icon: 'star', title: allStar ? 'Take the star off the ticked lines' : 'Star the ticked lines', onClick: () => star(rs, !allStar) }),
          !allStar && rs.some(r => r.star) ? ui.button('Unstar', { small: true, kind: 'ghost', title: 'Take the star off the ticked lines', onClick: () => star(rs, false) }) : null,
          ui.button('Copy the text', { small: true, kind: 'ghost', onClick: () => copy(rs) }),
          ui.button('New theme from these', { small: true, kind: 'ghost', icon: 'plus', onClick: () => newTheme(rs) }),
          ui.button('Clear', { small: true, kind: 'ghost', title: 'Untick them all', onClick: () => { sel.clear(); anchor = null; afterTick(); } })]);
      }
      /** Where the ticked lines go: the open sequence (playhead or end) or a new one – with Story's own placing and options. */
      async function addDialog(rs) {
        const lines = linesOf(rs), ids = Array.from(new Set(rs.flatMap(r => r.ids)));
        if (!lines.length) { ui.toast({ type: 'info', title: 'These moments have no transcript line.', text: 'They can’t be placed from here yet.' }); return; }
        const seq = US.ctx.sequence;
        let where = get('addWhere', 'playhead');
        if (!seq) where = 'new';
        const it = itemOf(source);
        const nameIn = ui.input({ value: `Story – ${it && source !== 'all' ? it.name.slice(0, 60) : 'picked lines'}` });
        const newBox = h('div.pv-add-new', ui.field('Name', nameIn), S().orderToggle(), h('div.field-hint', 'Off: in the order they are in the table. A new sequence follows Story › 4 Build’s settings.'));
        const hereHint = h('div.field-hint', seq ? ['The open sequence is “', US.keep(seq.name), `”. ${S().placeOpts().mode === 'insert' ? 'At the playhead, later clips move along (insert)' : 'At the playhead, the lines overwrite what’s there'} – change it below.`] : 'No sequence is open, so the lines go into a new one.');
        const sync = () => { newBox.classList.toggle('hidden', where !== 'new'); hereHint.classList.toggle('hidden', where === 'new' && !!seq); };
        const whereSel = ui.select({ options: [{ value: 'playhead', label: 'The open sequence – at the playhead' }, { value: 'end', label: 'The open sequence – at the end' }, { value: 'new', label: 'A new sequence' }].filter(o => seq || o.value === 'new'), value: where, onChange: x => { where = x; sync(); } });
        sync();
        const ok = await ui.modal({ title: `Add ${US.plural(lines.length, 'line')} to a sequence`, body: h('div.pv-add', ui.field('Where', whereSel), hereHint, newBox, S().placeOptionsSection()), buttons: [{ label: 'Cancel', value: false, kind: 'ghost' }, { label: 'Add', value: true, kind: 'primary' }] });
        if (!ok) return;
        if (seq) set('addWhere', where);
        if (where === 'new') {
          const name = nameIn.value.trim() || 'Story – picked lines';
          await US.jobs.run({ title: `Building “${name}”`, tool: 'storylines' }, job => S().buildSequence(job, { name, groups: [{ name: '', label: null, lineIds: ids }] }));
          return;
        }
        if (where === 'end') await S().placeAtEnd(lines, placeHow()); else await S().placeAtPlayhead(lines, placeHow());
        // they're in the sequence now (when it was checked, the marks follow without reading it again)
        if (used && US.ctx.sequence && used.seqId === US.ctx.sequence.id) { ids.forEach(id => used.ids.add(id)); draw(); }
      }

      /* ---------- the line you picked ---------- */
      function drawInsp() {
        US.clear(insp);
        const r = cursor ? rowOf(cursor) : null;
        if (!r) { insp.appendChild(h('div.field-hint', 'Pick a line to see it here.')); return; }
        const l = r.l, t = l.id ? S().interviewOf(l.id) : null, ths = r.themes, can = r.ids.length > 0;
        const how = placeHow();
        US.append(insp, [h('div.sl-h', r.kind === 'answer' ? 'Answer' : r.kind === 'moment' ? 'Moment' : 'Line'),
          r.noSpeech ? h('div.sl-quote.pv-desc', US.keep(r.described || r.desc || '')) : h('div.sl-quote', US.keep('“' + l.text + '”')),
          r.noSpeech ? h('div.field-hint', r.described ? 'Nothing is said here – this is what happens in the picture and sound.' : US.understand && US.understand.describe && r.path ? 'Nothing is said here. A description of what happens will show once this clip has been looked at.' : 'Nothing is said here – this is why Story picked it.') : null,
          h('dl.sl-kv',
            r.kind === 'answer' ? [h('dt', 'Question'), h('dd', US.keep(`${r.tag.name} ${r.tag.title}`))] : null,
            r.kind === 'answer' && r.summary ? [h('dt', 'In short'), h('dd', US.keep(r.summary))] : null,
            r.kind === 'moment' ? [h('dt', 'Kind'), h('dd', h('span.sl-chip', h('span.sl-sw', { style: { background: hexOfLabel(r.tag.label) } }), r.tag.name))] : null,
            (r.reasons || []).length ? [h('dt', 'Why'), h('dd', US.keep(r.reasons.join(' · ')))] : null,
            h('dt', 'Speaker'), h('dd', US.keep(l.speaker ? S().speakerName(l.speaker) : 'Not named in the transcript')),
            h('dt', 'Interview'), h('dd', US.keep(t ? t.name : r.path ? US.basename(r.path) : '–')),
            h('dt', 'Time'), h('dd', `${US.fmtDur(l.start)} – ${US.fmtDur(l.end)} (${(l.end - l.start).toFixed(1)} s)`),
            h('dt', 'Themes'), h('dd', ths.length ? ths.map(th => h('span.sl-chip', h('span.sl-sw', { style: { background: hexOf(th) } }), US.keep(th.name))) : '–'),
            h('dt', 'Star'), h('dd', r.star ? (r.kind === 'line' && strong(l) ? '★ A strong, complete line' : '★ Starred by you') : r.kind === 'line' && strong(l) ? 'Star taken off by you' : 'No star'),
            usedNow() ? [h('dt', 'Used'), h('dd', r.used ? ['In “', US.keep(used.name), '”'] : 'Not in the open sequence')] : null),
          can ? h('div.sl-acts',
            ui.button('Play', { kind: 'primary', small: true, icon: 'play', onClick: () => S().cueLine(l), title: 'Play it in the Source Monitor (space)' }),
            ui.button('At the playhead', { small: true, icon: 'film', onClick: () => S().placeAtPlayhead([l], how), title: 'Put it at the playhead of the open sequence (Return)' }),
            ui.button('Source Monitor', { small: true, onClick: () => S().openInSource(l), title: 'Open with its In and Out set' }),
            ui.button(r.star ? 'Unstar' : 'Star', { small: true, icon: 'star', onClick: () => star([r], !r.star) }),
            l.text ? ui.button('More like this', { small: true, icon: 'search', onClick: () => US.tools.open('story', { tab: 'search', query: l.text.split(/\s+/).filter(w => w.length > 4).slice(0, 3).join(' ') }) }) : null,
            ui.button('Copy', { small: true, onClick: () => copy([r]) }))
            : h('div.field-hint', 'There’s no transcript line for this moment, so it can’t be played or placed from here yet.'),
          h('div.field-hint', 'Tick lines to add several to a sequence in one go, or drag a line (or the ticked ones) from the table straight onto the timeline.')]);
      }
      function copy(rs) { ui.copy(rs.map(r => `${r.who} (${US.fmtDur(r.l.start)}): ${r.noSpeech ? r.described || r.desc || '' : r.l.text}`).join('\n')); ui.toast({ type: 'ok', title: `Copied ${US.plural(rs.length, 'line')}`, timeout: 1500 }); }
      function newTheme(rs) {
        const ids = Array.from(new Set(rs.flatMap(r => r.ids)));
        if (!ids.length) return;
        const name = 'New theme ' + ((S().state().themes || []).length + 1);
        try { S().newThemeFrom(name, ids); ui.toast({ type: 'ok', title: `“${name}” made from ${US.plural(ids.length, 'line')}`, text: 'Rename it in Story › 2 Themes.', timeout: 3000 }); draw(); } catch (e) { ui.showError(e); }
      }

      table.addEventListener('keydown', e => {
        if (e.target !== table) return;
        const i = cursor && byId.has(cursor) ? byId.get(cursor) : -1, r = i >= 0 ? shown[i] : null;
        const go = (j, shift) => { if (j < 0 || j >= shown.length) return; if (shift) { if (r) sel.add(r.id); sel.add(shown[j].id); } cursor = shown[j].id; if (!shift) anchor = cursor; afterTick(); drawInsp(); reveal(cursor); };
        if (e.key === 'j' || e.key === 'ArrowDown') { e.preventDefault(); go(i + 1, e.shiftKey && e.key === 'ArrowDown'); }
        else if (e.key === 'k' || e.key === 'ArrowUp') { e.preventDefault(); go(i - 1, e.shiftKey && e.key === 'ArrowUp'); }
        else if (e.key === 'x' && r) { e.preventDefault(); tick(r.id, e, !sel.has(r.id)); }
        else if (e.key === ' ') { e.preventDefault(); if (r && r.ids.length) S().cueLine(r.l); }
        else if (e.key === 'Enter') { e.preventDefault(); const ls = linesOf(acting(r)); if (ls.length) S().placeAtPlayhead(ls, placeHow()); }
        else if (e.key === '/') { e.preventDefault(); find.focus(); }
      });
      find.addEventListener('keydown', e => { if (e.key === 'Escape') { find.value = ''; query = ''; draw(); table.focus(); } else if (e.key === 'Enter' || e.key === 'ArrowDown') { e.preventDefault(); table.focus(); } });
      US.bus.on('context', US.debounce(() => { if (US.tools.current === 'storylines') draw(); }, 400));
      return { el: v.el, onShow(o) {
        openFrom(o);
        draw();
        // the “used” marks are for the sequence that's open now: read it once when the tab opens on another one
        if ((showUsed || hideUsed) && US.ctx.sequence && !(used && used.seqId === US.ctx.sequence.id) && S() && S().state && S().state().transcripts.some(t => t.lines.length)) checkUsed();
        setTimeout(() => { if (US.tools.current === 'storylines' && document.activeElement !== find) table.focus({ preventScroll: true }); }, 30);
      } };
    }
  });
})();
