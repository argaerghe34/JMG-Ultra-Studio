// The shell after the notes of 19 Nov 2026, clicked through in the real panel (jsdom, dev/tests/panel-dom.js): the
// rail's places, Ask at the bottom, stars and the rail's own order, Settings (Updates first, dropdowns, no “null”,
// sections other files add, the Sidebar list) and the hidden game. Prints JSON on the last line (shell.test.js reads it).
const { w, US, $$, tick, boot, errors, ROOT } = require('./panel-dom');
const fs = require('fs'), path = require('path');

const railKeys = () => $$('.rail .rail-btn').map(b => b.dataset.place ? 'place:' + b.dataset.place : 'tool:' + b.dataset.id);
const openSettings = async () => { US.tools.open('settings'); await tick(); return w.document.querySelector('.view > :not(.hidden)'); };
/** Text nodes that say “null” or “undefined” – what Element.append(null) leaves behind. */
function nullTexts(root) {
  const out = [], walk = w.document.createTreeWalker(root, 4);
  for (let n = walk.nextNode(); n; n = walk.nextNode()) if (/^\s*(null|undefined)\s*$/.test(n.nodeValue)) out.push((n.parentNode.className || n.parentNode.tagName) + ' › ' + (n.nextSibling ? n.nextSibling.textContent.slice(0, 40) : 'last'));
  return out;
}

(async () => {
  // a section another file adds before Settings is ever opened (package E does this from its own file)
  US.settingsSections.register({ id: 'test-late', title: 'Added by another file', order: 20, create: () => US.h('div.test-late', 'Hello from another file') });
  US.settingsSections.register({ id: 'test-early', title: 'Sorted first', order: 5, create: () => US.h('div', 'First') });
  US.settingsSections.register({ id: 'test-broken', title: 'Broken one', order: 90, create: () => { throw new Error('boom'); } });
  await boot();
  const out = { errors };

  /* ---- places ---- */
  out.places = US.PLACES.map(p => ({ id: p.id, name: p.name, tools: p.id === 'advanced' ? ['advanced'] : US.placeTools(p.id).map(d => d.id) }));
  out.advanced = US.ADVANCED_TOOLS.slice(); out.paused = US.PAUSED_TOOLS.slice();
  out.placeOf = {}; for (const d of US.tools.list()) out.placeOf[d.id] = US.placeOf(d.id);
  out.askActions = Array.from(new Set(US.actions.list().map(a => a.tool)));
  out.rail = railKeys();
  out.railAskLast = (() => { const kids = Array.from(w.document.querySelector('.rail').children), n = kids.length; return n > 1 && kids[n - 1].classList.contains('rail-ask') && kids[n - 2].classList.contains('rail-spacer') && !!kids[n - 1].querySelector('.ask-orb svg'); })();
  // Deliver's tabs, in order; Edit's
  $$('.rail .rail-btn').find(b => b.dataset.place === 'deliver').click(); await tick();
  US.tools.open('check'); await tick();
  out.deliverTabs = $$('.place-tabs:not(.hidden) .place-tab').map(t => t.dataset.tool);
  US.tools.open('quickfx'); await tick();
  out.editTabs = $$('.place-tabs:not(.hidden) .place-tab').map(t => t.dataset.tool);
  out.searchWhere = {}; for (const id of ['youtube', 'mvfx', 'songs', 'check', 'producer']) { const d = US.tools.get(id); const e = d && US.search.results(d.name).find(x => x.id === 'tool:' + id); out.searchWhere[id] = e ? e.detail : null; }

  /* ---- stars ---- */
  const star = async id => { US.tools.open(id); await tick(); const b = w.document.querySelector(`.view > :not(.hidden) .fav-btn[data-star="${id}"]`); if (b) { b.click(); await tick(); } return !!b; };
  out.noStarOn = ['home', 'advanced', 'assistant'].filter(id => { US.tools.open(id); return !!w.document.querySelector('.view > :not(.hidden) .fav-btn'); });
  out.starMissing = [];
  for (const d of US.tools.list().filter(d => US.favs.can(d.id))) { US.tools.open(d.id); await tick(); if (!w.document.querySelector(`.view > :not(.hidden) .fav-btn[data-star="${d.id}"]`)) out.starMissing.push(d.id); }
  await star('wiki'); await star('youtube'); await star('settings');
  out.afterStars = railKeys();
  out.favsSaved = US.settings.get('ui.favs');
  US.tools.open('home'); await tick();
  $$('.rail .rail-btn').find(b => b.dataset.fav === 'youtube').click(); await tick();
  out.favOpens = US.tools.current;
  out.favLit = $$('.rail .rail-btn.on').map(b => b.dataset.place || b.dataset.id);
  US.tools.open('wiki'); await tick();
  out.tabStar = !!w.document.querySelector('.place-tab[data-tool="wiki"] .pt-star');
  out.starShown = w.document.querySelector('.view > :not(.hidden) .fav-btn').textContent;
  // unstar from the rail button's menu
  const favBtn = $$('.rail .rail-btn').find(b => b.dataset.fav === 'wiki');
  favBtn.dispatchEvent(new w.MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
  out.menu = $$('.rail-menu .rail-menu-item').map(b => b.textContent);
  $$('.rail-menu .rail-menu-item').find(b => /Remove/.test(b.textContent)).click(); await tick();
  out.afterMenuRemove = railKeys();
  out.menuGone = !w.document.querySelector('.rail-menu');
  out.starAfterRemove = w.document.querySelector('.view > :not(.hidden) .fav-btn').textContent;
  // and from the same star
  await star('youtube');
  out.afterStarOff = railKeys();

  /* ---- order ---- */
  US.railOrder.move('place:deliver', -1);
  out.afterMoveUp = railKeys();
  // drag Home onto Advanced (jsdom has no layout: the drop lands in the lower half, so "after")
  const btn = k => $$('.rail .rail-btn').find(b => b.dataset.key === k);
  btn('place:home').dispatchEvent(new w.Event('dragstart', { bubbles: true }));
  const drop = new w.Event('drop', { bubbles: true, cancelable: true }); drop.clientY = 5;
  btn('place:advanced').dispatchEvent(drop); await tick();
  out.afterDrag = railKeys();
  out.askDraggable = !!w.document.querySelector('.rail-ask').draggable;
  US.settings.flush();
  const saved = JSON.parse(fs.readFileSync(path.join(US.fsx.dataDir, 'settings.json'), 'utf8'));
  out.savedOrder = saved['ui.railOrder']; out.savedFavs = saved['ui.favs'];
  out.dataDirOutsideApp = !path.resolve(US.fsx.dataDir).startsWith(path.resolve(ROOT));
  out.projectStoreHasIt = JSON.stringify(US.projectStore ? Object.keys(US.projectStore(US.ctx.project && US.ctx.project.path).all ? US.projectStore(US.ctx.project.path).all() : {}) : []).includes('rail');
  // Classic rail: Ask still last, starred Advanced tools get a button
  await star('youtube');
  US.settings.set('ui.classicRail', true); US.rebuildRail();
  out.classic = { askLast: $$('.rail .rail-btn').pop().classList.contains('rail-ask'), hasFav: !!$$('.rail .rail-btn').find(b => b.dataset.fav === 'youtube'), settingsFav: !!$$('.rail .rail-btn').find(b => b.dataset.fav === 'settings') };
  US.settings.set('ui.classicRail', false); US.rebuildRail();

  /* ---- Settings ---- */
  US.settings.set('ai.sentLog', true);
  await US.jobs.run({ title: 'Find themes', tool: 'story' }, async () => { US.ai.sent.begin({ provider: 'claude', model: 'm', feature: 'Themes', req: { system: 's', user: 'u' }, est: { inputTokens: 1, usd: 0.01 } }); return { summary: 'ok' }; });
  await new Promise(r => setTimeout(r, 600));   // the log's own redraw
  const set = await openSettings();
  $$('[data-section="sent"] button', set).find(b => b.textContent.trim() === 'Refresh').click();
  await new Promise(r => setTimeout(r, 80));
  out.settings = {
    firstCard: (set.querySelector('.tool-body > * .card-title, .tool-body > .card > .card-title') || {}).textContent,
    cardOrder: $$('.card-title', set).map(c => c.textContent),
    nulls: nullTexts(set),
    openSections: $$('.section:not(.closed) > .section-head', set).map(x => x.firstElementChild.nextSibling.textContent),
    sections: $$('.section > .section-head', set).map(x => x.firstElementChild.nextSibling.textContent),
    sentRows: $$('[data-section="sent"] .sent-req, [data-section="sent"] .sent-head', set).length,
    sentClosed: !!set.querySelector('[data-section="sent"] .section.closed'),
    text: ['Check for updates and install', 'Another version', 'Claude API key', 'Google Gemini API key', 'Gemini model', 'Claude model', 'Read the interviews once', 'On this computer (offline)', 'Footage – what the AI may see', 'By API key', 'Monthly limit', 'Without AI – what still works', 'Keep a copy of everything sent to AI', 'Show the text and cost before sending', 'Refresh', 'Clear this project’s log', 'Open the folder', 'Classic rail', 'Notifications', 'Markers go on', 'Open data folder', 'About'].filter(t => !set.textContent.includes(t)),
    extra: $$('.settings-extra > [data-section]', set).map(x => x.dataset.section),
    extraClosed: $$('.settings-extra .section', set).every(x => x.classList.contains('closed')),
    extraBody: !!set.querySelector('[data-section="test-late"] .test-late'),
    sidebar: $$('[data-section="sidebar"] .list-row', set).map(r => r.dataset.key || 'ask')
  };
  // a section registered while Settings is open shows up too
  US.settingsSections.register({ id: 'test-live', title: 'Registered later', order: 30, create: () => US.h('div', 'Later') });
  await new Promise(r => setTimeout(r, 120));
  out.settings.extraAfter = $$('.settings-extra > [data-section]', set).map(x => x.dataset.section);
  // opening Settings at a section opens its dropdown
  US.tools.open('settings', { section: 'sent' }); await new Promise(r => setTimeout(r, 60));
  out.settings.sentOpensWhenAsked = !set.querySelector('[data-section="sent"] .section').classList.contains('closed');
  // Sidebar list: Down on the first row, Remove on a star, Add another
  const rows = () => $$('[data-section="sidebar"] .list-row', set);
  const first = rows()[0].dataset.key;
  $$('button', rows()[0]).find(b => b.textContent.trim() === 'Down').click(); await tick();
  out.settings.downMoved = railKeys().indexOf(first) === 1 && rows()[1].dataset.key === first;
  $$('button', rows().find(r => r.dataset.key === 'tool:settings')).find(b => b.textContent.trim() === 'Remove').click(); await tick();
  out.settings.removed = !US.favs.has('settings') && !rows().some(r => r.dataset.key === 'tool:settings');
  const add = set.querySelector('[data-section="sidebar"] select');
  add.value = 'markers'; add.dispatchEvent(new w.Event('change', { bubbles: true }));
  $$('[data-section="sidebar"] button', set).find(b => b.textContent.trim() === 'Add').click(); await tick();
  out.settings.added = US.favs.has('markers') && railKeys().includes('tool:markers');
  $$('[data-section="sidebar"] button', set).find(b => /usual order/.test(b.textContent)).click(); await tick();
  out.settings.reset = railKeys();

  /* ---- the tour: both from Settings ---- */
  const full = $$('button', set).find(b => b.textContent.trim() === 'Full guide');
  if (full) { full.click(); await tick(); out.fullStarts = !!US.tour.running && US.tour.running.id === 'full'; US.tour.stop(); }

  /* ---- the hidden game ---- */
  out.game = { loadedAtStart: !!US.game, inIndex: /game\.js/.test(fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8')), inTools: fs.readdirSync(path.join(ROOT, 'js', 'tools')).some(f => /game/.test(f)), bytes: fs.statSync(path.join(ROOT, 'js', 'extra', 'game.js')).size };
  const code = set.querySelector('.settings-code input');
  code.value = 'Game '; code.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); await tick();
  const tag = $$('script').find(s => /js\/extra\/game\.js$/.test(s.getAttribute('src') || ''));
  out.game.scriptAsked = !!tag; out.game.boxCleared = code.value === '';
  out.game.hiddenStill = US.settings.get('showHidden', false) === false;
  w.eval(fs.readFileSync(path.join(ROOT, 'js', 'extra', 'game.js'), 'utf8'));   // jsdom doesn't fetch scripts: run it as the browser would
  if (tag && tag.onload) tag.onload();
  await tick();
  out.game.opened = !!w.document.querySelector('.modal .game-canvas');
  // the rules, without a screen: a fixed "dice" so it's the same every time
  const G = US.game, dice = () => { let x = 7; return () => { x = (x * 16807) % 2147483647; return x / 2147483647; }; };
  const play = policy => { const s = G.fresh(dice()); for (let i = 0; i < 60 * 240 && !s.over; i++) { const c = s.clips.find(c => c.a <= s.x && s.x < c.b); G.step(s, 1 / 60, policy(c, s)); } return s; };
  const always = play(() => true), never = play(() => false), perfect = play(c => !!c && c.good);
  out.game.always = { over: always.over, patience: always.patience };
  out.game.never = { over: never.over, score: Math.round(never.score) };
  out.game.perfect = { over: perfect.over, score: Math.round(perfect.score), patience: perfect.patience, streak: perfect.streak, kept: perfect.kept.length };
  out.game.bestKept = always.best === Math.round(always.score);
  $$('.modal .btn').forEach(b => b.click());
  // the cause of the “null” in Settings, shown plainly
  { const a = w.document.createElement('div'), b = w.document.createElement('div'); a.append(null); US.append(b, [null]); out.domAppendNull = a.textContent; out.usAppendNull = b.textContent; }
  out.errors = errors;
  console.log(JSON.stringify(out));
  process.exit(0);
})().catch(e => { console.log(JSON.stringify({ crash: e.stack })); process.exit(1); });
