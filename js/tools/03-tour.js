/* JMG Ultra Studio – the guided tour (UI review, 18 Nov 2026): pop-ups that point at the real screen, one step at a
   time, with what it does, tips and suggestions. "Take the tour" is in Settings, in Search (⌘K), and offered once on
   first run; every tab has its own short tour (the ? at the top of the tab).

   The steps are data: js/tools/04-tour-steps.js (US.TOURS), or `tour: [...]` in a tool's own US.tools.register({...}).
   A step: { target, title, text, tip?, tool? }  – `tool` is opened first (default: the tour's own tool).
   Targets: '@rail:story' (a rail place – or, with Classic rail, that place's first tool's button), '@tab:wiki' (a place's
   tab), '@head' (the open tab's title), '@search', '@settings', '@ai', '@status', '@log', '@reload',
   'text:Find the pauses' (the first button, title or label on the open tab with those words), or any CSS selector
   inside the open tab. dev/tests/tour.test.js fails when a tool has no tour or a step points at something that's gone –
   so a chat that adds or changes a tool updates its steps too. */
(function () {
  'use strict';
  const US = window.US, h = US.h, ui = US.ui;

  /** The tour for an id: the tool's own `tour`, else US.TOURS[id]. -> {title, steps} or null */
  function get(id) {
    const d = US.tools.get(id), data = (US.TOURS || {})[id];
    const steps = (d && d.tour) || (data && (data.steps || data)) || null;
    if (!steps || !steps.length) return null;
    return { id, title: (data && data.title) || (id === 'overview' ? 'Ultra Studio in a minute' : 'A tour of ' + (d ? d.name : id)), steps };
  }
  const has = id => !!get(id);

  /** The open tab's root element. */
  const current = () => document.querySelector('.view > .tool:not(.hidden)') || document.querySelector('.view > :not(.hidden)');
  const visible = el => !!el && !el.closest('.hidden');
  /** A step's target -> an element on screen, or null. */
  function resolve(target) {
    if (!target || target === '@head') { const c = current(); return c && (c.querySelector('.tool-head') || c); }
    if (target === '@search') return document.querySelector('.header [data-search]');
    if (target === '@settings') return Array.from(document.querySelectorAll('.header .icon-btn')).find(b => b.title === 'Settings') || null;
    if (target === '@log') return Array.from(document.querySelectorAll('.header .icon-btn')).find(b => b.title === 'Activity log') || null;
    if (target === '@reload') return Array.from(document.querySelectorAll('.header .icon-btn')).find(b => /^Reload/.test(b.title)) || null;
    if (target === '@ai') return document.querySelector('.header .ai-chip');
    if (target === '@status') return document.querySelector('.status');
    if (target === '@tabs') { const t = document.querySelector('.place-tabs'); return t && !t.classList.contains('hidden') ? t : null; }
    let m;
    if ((m = /^@rail:(\w+)$/.exec(target))) {
      const byPlace = document.querySelector(`.rail .rail-btn[data-place="${m[1]}"]`);
      if (byPlace) return byPlace;
      // Classic rail: the button of the place's first tool (or a tool of that id)
      const p = (US.PLACES || []).find(x => x.id === m[1]);
      const ids = p ? (p.id === 'advanced' ? ['advanced'] : US.placeTools(p.id).map(d => d.id)) : [m[1]];
      for (const id of ids) { const b = document.querySelector(`.rail .rail-btn[data-id="${id}"]`); if (b) return b; }
      return null;
    }
    if ((m = /^@tab:([\w-]+)$/.exec(target))) {
      const t = document.querySelector(`.place-tabs:not(.hidden) .place-tab[data-tool="${m[1]}"]`);
      return t || document.querySelector(`.rail .rail-btn[data-id="${m[1]}"]`);   // Classic rail: the tool's own button
    }
    const root = current(); if (!root) return null;
    if ((m = /^text:(.+)$/.exec(target))) {
      const want = m[1].trim().toLowerCase();
      const els = root.querySelectorAll('button, .card-title, .section-title, .section-head, .field-label, .tile-name, .group-title, .empty-title, h2, h3, label');
      return Array.from(els).find(e => visible(e) && e.textContent.replace(/\s+/g, ' ').toLowerCase().includes(want)) || null;
    }
    try { return Array.from(root.querySelectorAll(target)).find(visible) || null; } catch (e) { return null; }
  }

  /* ---------- the pop-up ---------- */
  let run = null;   // {tour, i, el}
  function start(id, { at = 0 } = {}) {
    const tour = get(id); if (!tour) return false;
    stop();
    document.querySelectorAll('.tour-offer').forEach(e => e.remove());
    const ring = h('div.tour-ring'), card = h('div.tour-card', { role: 'dialog', 'aria-live': 'polite' });
    const el = h('div.tour-layer', ring, card);
    document.body.appendChild(el);
    run = { tour, i: at, el, ring, card };
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('resize', place);
    show();
    return true;
  }
  function stop() {
    if (!run) return;
    run.el.remove(); document.removeEventListener('keydown', onKey, true); window.removeEventListener('resize', place);
    run = null;
  }
  function onKey(e) {
    if (!run) return;
    if (e.key === 'Escape') { e.preventDefault(); stop(); }
    else if (e.key === 'ArrowRight' || e.key === 'Enter') { e.preventDefault(); go(1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1); }
  }
  function go(d) { if (!run) return; const n = run.i + d; if (n < 0) return; if (n >= run.tour.steps.length) return stop(); run.i = n; show(); }
  function show() {
    const { tour, i, card } = run, s = tour.steps[i];
    const tool = s.tool || (tour.id !== 'overview' ? tour.id : null);
    if (tool && US.tools.current !== tool && US.tools.get(tool)) US.tools.open(tool);
    if (s.place && US.openPlace) US.openPlace(s.place);
    US.clear(card);
    const last = i === tour.steps.length - 1;
    card.append(...[
      h('div.tour-count', `${i + 1} of ${tour.steps.length} · ${tour.title}`),
      h('div.tour-title', s.title),
      h('div.tour-text', s.text),
      s.tip ? h('div.tour-tip', US.icon('spark', 13), h('span', s.tip)) : null,
      h('div.tour-buttons',
        ui.button('Skip', { kind: 'ghost', small: true, onClick: stop }),
        h('span.grow'),
        i > 0 ? ui.button('Back', { small: true, onClick: () => go(-1) }) : null,
        ui.button(last ? 'Done' : 'Next', { kind: 'primary', small: true, onClick: () => go(1) }))].filter(Boolean));
    setTimeout(place, 30);   // after the tab has drawn
  }
  /** Ring round the target and the card next to it (below, else above), kept inside the panel. */
  function place() {
    if (!run) return;
    const s = run.tour.steps[run.i], el = resolve(s.target), { ring, card } = run;
    run.target = el;
    const W = window.innerWidth, H = window.innerHeight;
    if (!el) { ring.style.display = 'none'; card.style.left = Math.max(8, (W - card.offsetWidth) / 2) + 'px'; card.style.top = Math.max(8, (H - card.offsetHeight) / 3) + 'px'; return; }
    if (el.scrollIntoView) el.scrollIntoView({ block: 'nearest' });
    const r = el.getBoundingClientRect(), pad = 4;
    Object.assign(ring.style, { display: 'block', left: (r.left - pad) + 'px', top: (r.top - pad) + 'px', width: (r.width + pad * 2) + 'px', height: (r.height + pad * 2) + 'px' });
    const cw = Math.min(320, W - 16), ch = card.offsetHeight || 160;
    card.style.width = cw + 'px';
    let left = r.right + 12 + cw < W && r.width < 80 ? r.right + 12 : Math.min(Math.max(8, r.left), W - cw - 8);
    let top = r.width < 80 && r.right + 12 + cw < W ? Math.min(Math.max(8, r.top - 8), H - ch - 8) : (r.bottom + 12 + ch < H ? r.bottom + 12 : Math.max(8, r.top - ch - 12));
    card.style.left = left + 'px'; card.style.top = top + 'px';
  }

  /** A short offer, once, the first time the new layout opens. */
  function offerOnce() {
    if (US.settings.get('tour.offered', false)) return;
    US.settings.set('tour.offered', true);
    const el = h('div.tour-offer', h('div.tour-title', 'A new, simpler layout'),
      h('div.tour-text', 'Ultra Studio’s tools are now grouped by the stages of your edit. Take a one-minute tour?'),
      h('div.tour-buttons', ui.button('Not now', { kind: 'ghost', small: true, onClick: () => el.remove() }), h('span.grow'),
        ui.button('Take the tour', { kind: 'primary', small: true, onClick: () => { el.remove(); start('overview'); } })));
    document.body.appendChild(el);
  }
  US.bus.on('ready', () => setTimeout(offerOnce, 1200));

  /** Tours as a list for Settings and Search: the overview first, then each tool with steps. */
  function list() {
    const tools = US.tools.list().filter(d => (!d.hidden || d.id === 'settings') && has(d.id));
    return [{ id: 'overview', name: get('overview') ? get('overview').title : 'Overview' }].filter(t => has(t.id)).concat(tools.map(d => ({ id: d.id, name: d.name })));
  }
  US.tour = { start, stop, get, has, list, resolve, get running() { return run && { id: run.tour.id, i: run.i, target: run.target, step: run.tour.steps[run.i] }; }, next: () => go(1), back: () => go(-1), place };

  // Search (⌘K): "Take the tour" and a tour for each tab
  if (US.search) US.search.add(q => {
    const out = [{ kind: 'help', id: 'tour:overview', title: 'Take the tour', detail: 'A one-minute tour of Ultra Studio', icon: 'info', words: 'help tour guide tutorial learn how', boost: 50, run: () => start('overview') }];
    if (q) for (const t of list().filter(t => t.id !== 'overview')) out.push({ kind: 'help', id: 'tour:' + t.id, title: 'Tour: ' + t.name, detail: 'What this tab does, step by step', icon: 'info', words: 'help tour guide tutorial', run: () => start(t.id) });
    return out;
  });
})();
