/* JMG Ultra Studio – Story › 4 Build, one thing at a time (UI review, mock-up 4): "What do you want to make?" above the
   Build step's cards (a sequence, bins, highlights, a beat map, clips for social, from a script, a narrative…). Pick one
   and only that card shows; "Show all" shows every card as before. Nothing is taken away – every card is one click.
   Settings › Layout › "Story › Build: one at a time" turns it off. It works on Story's own cards (data-section), so a
   card Story adds later appears in the chooser by itself. */
(function () {
  'use strict';
  const US = window.US, h = US.h;
  const on = () => US.settings.get('story.buildChooser', true) !== false;
  const picked = () => US.settings.get('story.buildPick', 'build');
  let wanted = null;   // a section asked for by name (Story opened at "narrative", say): shown whatever was picked

  /** The Build pane: the Story pane that holds the "build" card. */
  function buildPane(root) {
    const c = root && root.querySelector('.story-pane > .card[data-section="build"]');
    return c ? c.parentNode : null;
  }
  /** Each card in the pane: {id, title, el} – el is the pane's child that holds it. */
  function cards(pane) {
    return Array.from(pane.querySelectorAll('.card[data-section]')).filter(c => c.closest('.story-pane') === pane).map(c => {
      let el = c; while (el.parentNode !== pane) el = el.parentNode;
      const t = c.querySelector('.card-title');
      const title = t ? Array.from(t.childNodes).filter(n => n.nodeType === 3 || (n.classList && !n.classList.contains('right'))).map(n => n.textContent).join('').trim() : c.dataset.section;
      return { id: c.dataset.section, title, el };
    });
  }
  function apply(pane) {
    const list = cards(pane);
    let bar = Array.from(pane.children).find(x => x.classList && x.classList.contains('story-chooser'));
    if (!on() || list.length < 2) { if (bar) bar.remove(); list.forEach(c => c.el.classList.remove('story-folded')); return; }
    const want = wanted && list.some(c => c.id === wanted) ? wanted : picked();
    const pick = want === 'all' || list.some(c => c.id === want) ? want : list[0].id;
    if (!bar) {
      bar = h('div.story-chooser', { dataset: { section: 'chooser' } });
      const first = list[0].el;
      pane.insertBefore(bar, first);
    }
    US.clear(bar);
    const choose = id => { wanted = null; US.settings.set('story.buildPick', id); apply(pane); };
    bar.append(h('div.field-label', 'What do you want to make?'),
      h('div.story-choices', list.map(c => h('button.story-choice' + (pick === c.id ? '.on' : ''), { dataset: { pick: c.id }, onclick: () => choose(c.id) }, US.keep(c.title))),
        h('button.story-choice.all' + (pick === 'all' ? '.on' : ''), { dataset: { pick: 'all' }, title: 'Every Build card, one under the other', onclick: () => choose('all') }, 'Show all')));
    list.forEach(c => c.el.classList.toggle('story-folded', pick !== 'all' && c.id !== pick));
  }
  /** Watch Story's screen: whenever the Build step draws, add the chooser. */
  const watched = new WeakSet();
  function watch(el) {
    if (!el || watched.has(el) || typeof MutationObserver === 'undefined') return;
    watched.add(el);
    let busy = false;
    new MutationObserver(() => { if (busy) return; busy = true; try { const p = buildPane(el); if (p) apply(p); } finally { Promise.resolve().then(() => { busy = false; }); } }).observe(el, { childList: true, subtree: true });
    const p = buildPane(el); if (p) apply(p);
  }
  US.bus.on('tool-shown', (id, opts, el) => {
    if (id !== 'story') return;
    wanted = opts && opts.section ? opts.section : null;
    watch(el);
    const p = buildPane(el); if (p) apply(p);
    // Story scrolls to the section asked for; with one card showing, the question above it is the better place to be
    if (wanted && on()) setTimeout(() => { const pp = buildPane(el), bar = pp && pp.querySelector(':scope > .story-chooser'); if (bar && bar.scrollIntoView && !bar.closest('.hidden')) bar.scrollIntoView({ block: 'start' }); }, 80);
  });
  US.bus.on('settings', k => { if (k === 'story.buildChooser') document.querySelectorAll('.story-pane').forEach(p => { if (p.querySelector(':scope > .card[data-section="build"]')) apply(p); }); });
  US.storyChooser = { apply, cards };
})();
