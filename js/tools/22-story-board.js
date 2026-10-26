/* JMG Ultra Studio – Story › Board: the post-it board's data (pure, unit-tested). Rendering is in 22-story.js.
   wall = { mode: 'columns'|'free', columns: [group], loose: [{card, x, y}] }
   group = { id, name, themeId?, label, cards: [card], pos?: {x, y} }
   card  = { lineId, pinned?, hidden?, note? }  or an idea note { id, idea: 'B-roll of market' } */
(function () {
  'use strict';
  const US = window.US;
  const M = { cardW: 196, cardH: 118, gap: 12, head: 40, cols: 2 };

  const isIdea = k => !!(k && k.idea != null);
  const keyOf = k => (isIdea(k) ? k.id : k.lineId);
  function ensure(wall) { if (!wall.columns) wall.columns = []; if (!wall.loose) wall.loose = []; if (!wall.mode) wall.mode = 'columns'; return wall; }
  /** Every card with where it is: {card, group|null, index} (groups first, then loose). */
  function allCards(wall) {
    ensure(wall);
    const out = [];
    wall.columns.forEach(g => g.cards.forEach((card, index) => out.push({ card, group: g, index })));
    wall.loose.forEach((l, index) => out.push({ card: l.card, group: null, index, loose: l }));
    return out;
  }
  function detach(wall, card) {
    for (const g of wall.columns) { const i = g.cards.indexOf(card); if (i >= 0) { g.cards.splice(i, 1); return true; } }
    const j = wall.loose.findIndex(l => l.card === card); if (j >= 0) { wall.loose.splice(j, 1); return true; }
    return false;
  }
  /** Move cards (in this order) into a group at index (default: the end). */
  function moveCards(wall, cards, group, index) {
    ensure(wall);
    let at = index == null ? group.cards.length : index;
    for (const c of cards) {
      const was = group.cards.indexOf(c);
      if (was >= 0 && was < at) at--;
      detach(wall, c);
      group.cards.splice(Math.min(at, group.cards.length), 0, c); at++;
    }
    return group;
  }
  /** Park a card anywhere on the free board. */
  function makeLoose(wall, card, x, y) { ensure(wall); detach(wall, card); wall.loose.push({ card, x: Math.max(0, Math.round(x)), y: Math.max(0, Math.round(y)) }); return card; }
  /** A blank post-it for an idea or placeholder. */
  function addIdea(wall, text, { group = null, index = null, x = 40, y = 40 } = {}) {
    ensure(wall);
    const card = { id: US.uid('idea-'), idea: String(text || '').trim() || 'New idea' };
    if (group) group.cards.splice(index == null ? group.cards.length : index, 0, card); else wall.loose.push({ card, x, y });
    return card;
  }

  /**
   * Regroup every card by theme, speaker or interview. Ideas go to an "Ideas" group; pins, hides and notes stay on
   * their cards. H: {themeOf(lineId) -> theme|null, lineOf(id), speakerName(s), interviewOf(id) -> {key, name}, colourFor(key, used)}
   */
  function groupBy(wall, by, H) {
    ensure(wall);
    const cards = allCards(wall).map(x => x.card);
    const buckets = new Map();
    const ideas = [];
    const used = [];
    for (const card of cards) {
      if (isIdea(card)) { ideas.push(card); continue; }
      const l = H.lineOf(card.lineId); if (!l) continue;
      let key, name, label = null, themeId;
      if (by === 'theme') { const th = H.themeOf(card.lineId); key = th ? 'theme:' + th.id : 'none'; name = th ? th.name : 'No theme'; label = th ? th.label : null; themeId = th ? th.id : undefined; }
      else if (by === 'speaker') { name = H.speakerName(l.speaker); key = 'speaker:' + name.toLowerCase(); }
      else { const iv = H.interviewOf(card.lineId); key = 'interview:' + iv.key; name = iv.name; }
      if (!buckets.has(key)) buckets.set(key, { id: US.uid('c'), name, label, themeId, cards: [] });
      buckets.get(key).cards.push(card);
    }
    const groups = Array.from(buckets.entries()).map(([key, g]) => { if (g.label == null) g.label = H.colourFor(key, used); used.push(g.label); if (!g.themeId) delete g.themeId; return g; });
    if (ideas.length) groups.push({ id: US.uid('c'), name: 'Ideas', label: H.colourFor('ideas', used), cards: ideas });
    wall.columns = groups;
    wall.loose = [];
    return wall;
  }
  /** Sort the cards inside every group. Pinned cards stay first; ideas go after the lines. */
  function sortGroups(wall, by, H) {
    ensure(wall);
    const keyFns = {
      strength: l => -H.strength(l),
      length: l => l.end - l.start,
      speaker: l => H.speakerName(l.speaker).toLowerCase(),
      interview: (l, id) => H.interviewOf(id).name.toLowerCase(),
      time: (l, id) => H.interviewOf(id).name.toLowerCase() + '|' + String(Math.round(l.start * 100)).padStart(9, '0')
    };
    const f = keyFns[by]; if (!f) return wall;
    for (const g of wall.columns) {
      const pinned = g.cards.filter(k => k.pinned && !isIdea(k)), ideas = g.cards.filter(isIdea);
      const rest = g.cards.filter(k => !k.pinned && !isIdea(k)).map((k, i) => ({ k, i, v: f(H.lineOf(k.lineId) || { start: 0, end: 0, speaker: '' }, k.lineId) }));
      rest.sort((a, b) => (a.v < b.v ? -1 : a.v > b.v ? 1 : a.i - b.i));
      g.cards = pinned.concat(rest.map(x => x.k), ideas);
    }
    return wall;
  }

  /* ---------- free board layout ---------- */
  function groupSize(g, m = M) {
    const n = Math.max(1, g.cards.length), cols = Math.min(m.cols, n), rows = Math.ceil(n / m.cols);
    return { w: m.cols * m.cardW + (m.cols + 1) * m.gap, h: m.head + rows * m.cardH + (rows + 1) * m.gap, cols: Math.max(cols, m.cols) };
  }
  /** Give groups without a position one, in rows that fit the given width. */
  function layout(wall, width = 1200, m = M) {
    ensure(wall);
    let x = m.gap, y = m.gap, rowH = 0;
    const placed = wall.columns.filter(g => g.pos);
    for (const g of wall.columns) {
      if (g.pos) continue;
      const s = groupSize(g, m);
      if (x > m.gap && x + s.w > width) { x = m.gap; y += rowH + 2 * m.gap; rowH = 0; }
      // don't sit on top of a group that already has a place
      while (placed.some(p => { const ps = groupSize(p, m); return x < p.pos.x + ps.w && x + s.w > p.pos.x && y < p.pos.y + ps.h && y + s.h > p.pos.y; })) y += 40;
      g.pos = { x, y };
      x += s.w + 2 * m.gap; rowH = Math.max(rowH, s.h);
    }
    return wall;
  }
  /** Where each card of a group sits on the board. */
  function cardSlot(g, i, m = M) { const c = i % m.cols, r = Math.floor(i / m.cols); return { x: g.pos.x + m.gap + c * (m.cardW + m.gap), y: g.pos.y + m.head + m.gap + r * (m.cardH + m.gap) }; }
  /** The group (and insertion index) under a point, for dropping a card. */
  function hitGroup(wall, x, y, m = M) {
    for (let gi = wall.columns.length - 1; gi >= 0; gi--) {
      const g = wall.columns[gi]; if (!g.pos) continue;
      const s = groupSize(g, m);
      if (x >= g.pos.x && x <= g.pos.x + s.w && y >= g.pos.y && y <= g.pos.y + s.h + m.cardH) {
        const col = Math.max(0, Math.min(m.cols - 1, Math.floor((x - g.pos.x - m.gap) / (m.cardW + m.gap))));
        const row = Math.max(0, Math.floor((y - g.pos.y - m.head - m.gap) / (m.cardH + m.gap)));
        return { group: g, index: Math.min(g.cards.length, row * m.cols + col) };
      }
    }
    return null;
  }
  function extent(wall, m = M) {
    let w = 0, h = 0;
    for (const g of wall.columns) if (g.pos) { const s = groupSize(g, m); w = Math.max(w, g.pos.x + s.w); h = Math.max(h, g.pos.y + s.h); }
    for (const l of wall.loose || []) { w = Math.max(w, l.x + m.cardW); h = Math.max(h, l.y + m.cardH); }
    return { w: w + 400, h: h + 300 };
  }

  US.storyBoard = { M, isIdea, keyOf, allCards, detach, moveCards, makeLoose, addIdea, groupBy, sortGroups, groupSize, layout, cardSlot, hitGroup, extent, ensure };
})();
