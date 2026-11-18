// Headless check that nothing is lost in the panel's navigation: the whole panel (every core file and every tool) starts
// in jsdom with a stand-in Premiere, and by clicking only what a person can click – the rail, a place's tabs, the
// Settings gear, Advanced's tiles (In development too) – every registered tool must be reached, in the rail as places
// and in Settings › Classic rail. Every action the Assistant knows must belong to a tool that can be reached.
// Run on its own (node dev/tests/navigation-ui.js) or through navigation.test.js. Prints JSON on the last line.
const { w, US, $$, tick, boot, loadStory, errors } = require('./panel-dom');

/** Every tool reached by clicking what's on screen, starting from the rail. */
async function reachable() {
  const seen = new Set(), how = {};
  const note = via => { const id = US.tools.current; if (id && !seen.has(id)) { seen.add(id); how[id] = via; } };
  for (const b of $$('.rail .rail-btn')) {
    const label = b.textContent.trim();
    b.click(); await tick(); note('rail › ' + label);
    for (const t of $$('.place-tabs:not(.hidden) .place-tab')) { const tl = t.textContent.trim(); t.click(); await tick(); note(`rail › ${label} › tab ${tl}`); }
  }
  const gear = $$('.header .icon-btn').find(b => b.title === 'Settings');
  if (gear) { gear.click(); await tick(); note('header › Settings'); }
  // Advanced's tiles (and the closed "In development" section's), each a click away from Advanced
  const advBtn = $$('.rail .rail-btn').find(b => b.dataset.place === 'advanced' || b.dataset.id === 'advanced');
  if (advBtn) {
    advBtn.click(); await tick();
    const ids = $$('.tool:not(.hidden) [data-tool]').map(t => t.dataset.tool);
    for (const id of ids) {
      advBtn.click(); await tick();
      const t = $$('.tool:not(.hidden) [data-tool]').find(x => x.dataset.tool === id);
      if (t) { t.click(); await tick(); note('Advanced › ' + id); }
    }
  }
  return { seen, how };
}

(async () => {
  await boot();
  const all = US.tools.list().map(d => d.id);
  const out = { tools: all, modes: {} };
  for (const mode of ['places', 'classic']) {
    US.settings.set('ui.classicRail', mode === 'classic');
    US.rebuildRail();
    const { seen, how } = await reachable();
    const missing = all.filter(id => !seen.has(id));
    const actionsMissing = US.actions.list().filter(a => !seen.has(a.tool)).map(a => a.id);
    out.modes[mode] = { railButtons: $$('.rail .rail-btn').length, missing, actionsMissing, how };
  }
  US.settings.set('ui.classicRail', false);
  // ⌘K: every tool and every action is found by its own name, and the header's magnifier opens the box
  const found = q => US.search.results(q).map(e => e.id);
  out.searchMissingTools = US.tools.list().filter(d => !d.hidden || d.id === 'settings').filter(d => !found(d.name).includes('tool:' + d.id)).map(d => d.id);
  out.searchMissingActions = US.actions.list().filter(a => !found(a.title).includes('action:' + a.id)).map(a => a.id);
  const mag = $$('.header .icon-btn').find(b => b.dataset.search);
  if (mag) { mag.click(); await tick(); }
  out.searchOpens = !!w.document.querySelector('.search-scrim .search-input');
  out.searchEmptyShowsTools = $$('.search-item').length >= 10;
  if (US.search.close) US.search.close();
  // Story › 4 Build: the chooser lists every Build card, each can be shown, and Show all shows every one
  await loadStory();
  US.story.open('build'); await tick(); await new Promise(r => setTimeout(r, 30));
  const pane = $$('.story-pane').find(p => p.querySelector(':scope > .card[data-section="build"]'));
  const cardIds = pane ? $$('.card[data-section]', pane).map(c => c.dataset.section) : [];
  const choices = pane ? $$('.story-choice', pane).map(b => b.dataset.pick) : [];
  const shownAfter = [];
  for (const id of choices) {
    const b = $$('.story-choice', pane).find(x => x.dataset.pick === id);
    b.click(); await tick();
    shownAfter.push([id, cardIds.filter(c => { const el = pane.querySelector('.card[data-section="' + c + '"]'); return el && !el.closest('.story-folded'); })]);
  }
  out.chooser = { cardIds, choices, shownAfter };
  out.places = US.PLACES.map(p => ({ id: p.id, tools: (p.id === 'advanced' ? ['advanced'] : US.placeTools(p.id).map(d => d.id)) }));
  out.advanced = US.ADVANCED_TOOLS.concat(US.PAUSED_TOOLS);
  out.errors = errors;
  console.log(JSON.stringify(out));
  process.exit(0);
})().catch(e => { console.log(JSON.stringify({ crash: e.stack })); process.exit(1); });
