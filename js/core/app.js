/* JMG Ultra Studio – the shell: header, status bar, tool rail, activity log, settings, start-up. */
(function () {
  'use strict';
  const US = window.US, h = US.h;

  /* ---------- tool registry ---------- */
  const defs = [];
  const mounted = new Map();
  let currentId = null;
  /** Tools taken out for now (the user asked: Colour and Cameras 28 Oct 2026, B-roll and Sound 29 Oct 2026, Song Splitter
      19 Nov 2026 – mVFX came back that day). Their code stays; delete an id here to bring one back. The unit tests set
      window.US_SHOW_PAUSED so the paused tools' code is still tested. */
  US.PAUSED_TOOLS = window.US_SHOW_PAUSED || (US.settings && US.settings.get('showHidden', false)) ? [] : ['colour', 'cameras', 'broll', 'sound', 'memorybox', 'songs'];   // Settings › a code shows them
  /** Tools that live in the Advanced tab instead of the rail (the user asked, 9 Nov 2026): niche ones, opened from there.
      The paused tools above are there too, under "In development", unless the Settings code puts them back on the rail.
      'youtube' is Download (19 Nov 2026: off the rail – star it to put it back). */
  US.ADVANCED_TOOLS = ['selects', 'subclips', 'mcselects', 'takes', 'podcast', 'mvfx', 'youtube'];
  /** Is it a tab of its own on the rail and on Home (not hidden, not in Advanced, not in development)? */
  US.onRail = d => !!d && !d.hidden && !US.PAUSED_TOOLS.includes(d.id) && !US.ADVANCED_TOOLS.includes(d.id);
  /** The tab a tool is reached from: Advanced for the tools kept there. */
  US.homeTabOf = id => (US.tools.get('advanced') && (US.ADVANCED_TOOLS.includes(id) || US.PAUSED_TOOLS.includes(id)) ? 'advanced' : id);
  /**
   * The rail's places (the user's notes, 19 Nov 2026): Home › Story › Edit › Deliver › Advanced, and Ask at the very
   * bottom. A place with several tools shows them as tabs along the top of the view. A tool joins a place with
   * `place: 'cut'` in its definition (or is listed here); one with neither goes by its group, and a tool that still has
   * no place gets a rail button of its own – so nothing on the rail is ever lost. "Bring in" (Download) moved into
   * Advanced and "Finish" went: its tools are in Edit, and Final Check is Deliver's first tab. Any tool can be starred
   * onto the rail (US.favs) and the rail put in the person's own order (US.railOrder). Settings › Classic rail brings
   * back one button per tool (US.classicRail()).
   */
  US.PLACES = [
    { id: 'home', name: 'Home', icon: 'home', tools: ['home'] },
    { id: 'story', name: 'Story', icon: 'story', tools: ['story', 'storylines', 'wiki', 'words'], blurb: 'From interviews to a cut' },
    { id: 'cut', name: 'Edit', icon: 'scissors', tools: ['quickfx', 'markers', 'safezones', 'silence', 'beats', 'producer', 'agent'], blurb: 'Make the edit faster, and polish it' },
    { id: 'deliver', name: 'Deliver', icon: 'deliver', tools: ['check', 'deliver'], blurb: 'Check it, then everything out in one go' },
    { id: 'advanced', name: 'Advanced', icon: 'folder', tools: ['advanced'], blurb: 'More tools, and the ones in development' },
    { id: 'ask', name: 'Ask', icon: 'sparkle', tools: ['assistant'], blurb: 'AI – say it in plain English' }
  ];
  // a tool that names no place goes by its group ('finish' tools are part of Edit now; a 'selects' one gets a button of its own)
  const GROUP_PLACE = { find: 'story', cut: 'cut', finish: 'cut' };
  US.addIcon('sparkle', 'M9 3l1.6 4.4L15 9l-4.4 1.6L9 15l-1.6-4.4L3 9l4.4-1.6zM15.5 13l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z');
  US.addIcon('star', 'M10 3l2.1 4.3 4.7.7-3.4 3.3.8 4.7L10 13.8 5.8 16l.8-4.7L3.2 8l4.7-.7z');

  /* ---------- favourites and the rail's order: kept in this computer's settings file (the data folder – not the
     extension folder, so updates leave it alone, and not with the project, so the other computer keeps its own) ---------- */
  const NO_STAR = ['home', 'advanced', 'assistant'];   // always on the rail already
  US.favs = {
    /** Starred tool ids that still exist, in the order they were starred. */
    list() { return (US.settings.get('ui.favs', []) || []).filter(id => US.tools.get(id) && US.favs.can(id)); },
    has(id) { return US.favs.list().includes(id); },
    /** May this tool be starred? Any tab or sub-tab, Settings and the Advanced ones too – not the three that are always there. */
    can(id) { const d = US.tools.get(id); return !!d && !NO_STAR.includes(id) && (!d.hidden || id === 'settings'); },
    toggle(id, on) {
      if (!US.favs.can(id)) return false;
      const cur = (US.settings.get('ui.favs', []) || []).filter(x => x !== id), want = on == null ? !US.favs.has(id) : !!on;
      if (want) cur.push(id);
      US.settings.set('ui.favs', cur);
      railChanged();
      return want;
    }
  };
  /** What the rail shows above Ask, in the default order: the places, tools no place claims, then the starred tools – Advanced last. */
  function defaultRail() {
    const out = [], adv = [];
    for (const p of US.PLACES) {
      if (p.id === 'ask') continue;
      const tools = p.id === 'advanced' ? [US.tools.get('advanced')].filter(Boolean) : US.placeTools(p.id);
      if (!tools.length) continue;
      (p.id === 'advanced' ? adv : out).push({ key: 'place:' + p.id, place: p.id, name: p.name, icon: p.icon, title: p.name + (tools.length > 1 ? ' – ' + tools.map(d => d.name).join(', ') : tools[0].blurb ? ' – ' + tools[0].blurb : '') });
    }
    const own = US.tools.list().filter(d => US.onRail(d) && !US.placeOf(d.id));
    for (const d of own) out.push({ key: 'tool:' + d.id, tool: d.id, name: d.short || d.name, icon: d.icon, title: d.name + (d.blurb ? ' – ' + d.blurb : '') });
    for (const id of US.favs.list()) {
      if (own.some(d => d.id === id)) continue;
      const d = US.tools.get(id);
      out.push({ key: 'tool:' + id, tool: id, fav: true, name: d.short || d.name, icon: d.icon, title: `${d.name} – starred${d.blurb ? '. ' + d.blurb : ''} (right-click to move or remove)` });
    }
    return out.concat(adv);
  }
  US.railOrder = {
    /** The rail's items in the person's order. One that isn't in the saved order yet (a new place, a new star) goes
        after the item it follows by default. -> [{key, place|tool, fav, name, icon, title}] */
    items() {
      const def = defaultRail(), saved = (US.settings.get('ui.railOrder', []) || []).filter(k => def.some(x => x.key === k));
      const keys = saved.slice();
      def.forEach((x, i) => {
        if (keys.includes(x.key)) return;
        let at = 0;
        for (let j = i - 1; j >= 0; j--) { const k = keys.indexOf(def[j].key); if (k >= 0) { at = k + 1; break; } }
        keys.splice(at, 0, x.key);
      });
      return keys.map(k => def.find(x => x.key === k));
    },
    keys() { return US.railOrder.items().map(x => x.key); },
    /** Move an item up (-1) or down (+1). */
    move(key, by) {
      const keys = US.railOrder.keys(), i = keys.indexOf(key), j = i + by;
      if (i < 0 || j < 0 || j >= keys.length) return false;
      keys.splice(j, 0, keys.splice(i, 1)[0]);
      US.railOrder.set(keys);
      return true;
    },
    /** Put `key` just before `beforeKey` (or last, when that's null). */
    place(key, beforeKey) {
      const keys = US.railOrder.keys().filter(k => k !== key), at = beforeKey ? keys.indexOf(beforeKey) : -1;
      keys.splice(at < 0 ? keys.length : at, 0, key);
      US.railOrder.set(keys);
    },
    set(keys) { US.settings.set('ui.railOrder', keys); railChanged(); },
    reset() { US.settings.set('ui.railOrder', []); railChanged(); },
    get changed() { return (US.settings.get('ui.railOrder', []) || []).length > 0; }
  };
  function railChanged() { if (US.rebuildRail) US.rebuildRail(); drawStars(); US.bus.emit('rail'); }

  /* ---------- Settings sections other files add (the user's notes, 19 Nov 2026): a file registers a section and
     Settings shows it as a closed dropdown, so nobody else edits 99-settings.js.
     US.settingsSections.register({ id, title, order, create(): HTMLElement }) ---------- */
  const settingsSections = [];
  US.settingsSections = {
    register(sec) {
      if (!sec || !sec.id || typeof sec.create !== 'function') return;
      const i = settingsSections.findIndex(x => x.id === sec.id);
      if (i >= 0) settingsSections.splice(i, 1);
      settingsSections.push(sec);
      US.bus.emit('settings-sections');
    },
    list() { return settingsSections.slice().sort((a, b) => (a.order == null ? 50 : a.order) - (b.order == null ? 50 : b.order)); }
  };
  US.classicRail = () => !!(US.settings && US.settings.get('ui.classicRail', false));
  /** The place a tool belongs to (null for Settings and other hidden screens). Advanced's own tools belong to Advanced. */
  US.placeOf = id => {
    const d = US.tools.get(id);
    if (!d || (d.hidden && id !== 'advanced')) return null;
    if (id === 'advanced' || US.homeTabOf(id) === 'advanced') return 'advanced';
    if (d.place && US.PLACES.some(p => p.id === d.place)) return d.place;
    const p = US.PLACES.find(x => x.tools.includes(id));
    if (p) return p.id;
    return GROUP_PLACE[d.group] || null;
  };
  /** The tools shown as tabs in a place, in the place's order (then by tool order). */
  US.placeTools = pid => {
    const p = US.PLACES.find(x => x.id === pid); if (!p) return [];
    const listed = p.tools.map(id => US.tools.get(id)).filter(d => d && US.onRail(d) && US.placeOf(d.id) === pid);
    const extra = US.tools.list().filter(d => US.onRail(d) && !p.tools.includes(d.id) && US.placeOf(d.id) === pid);
    return listed.concat(extra);
  };
  US.tools = {
    /** register({id, name, short, icon, group, blurb, order, apps?: ['premiere'] (only there), create: () => ({el, onShow?, onHide?})}) */
    register(def) {
      if (def.apps && US.app && !def.apps.includes(US.app.id)) return;
      // re-registering (development hot reload) replaces the old tool and its screen
      const i = defs.findIndex(d => d.id === def.id);
      if (i >= 0) { defs.splice(i, 1); const m = mounted.get(def.id); if (m) { m.el.remove(); mounted.delete(def.id); } }
      defs.push(def);
      if (els.rail) buildRail();
    },
    list() { return defs.slice().sort((a, b) => (a.order || 50) - (b.order || 50)); },
    get(id) { return defs.find(d => d.id === id); },
    open,
    get current() { return currentId; }
  };
  /* ---------- actions: things a tool can do, callable from its own screen or from the Assistant ---------- */
  const actions = [];
  US.actions = {
    /**
     * register({ id: 'silence.cut', tool: 'silence', title, describe, params: {name: {type:'number'|'string'|'boolean'|'enum', default, desc, options?}},
     *            examples: ['cut the silences'], match?(text) -> params|null, changes: true if it creates/changes things in the project,
     *            run: async (params, job) -> {summary} })
     * run() is called inside a job; it should use job.progress/job.check and throw US.UserError for plain failures.
     */
    register(a) { if ((a.apps && US.app && !a.apps.includes(US.app.id))) return; const i = actions.findIndex(x => x.id === a.id); if (i >= 0) actions.splice(i, 1); actions.push(Object.assign({ params: {}, examples: [], changes: false }, a)); },
    /** What the Assistant and the Agent may use: not the tools still in development (their own buttons still work). */
    list() { return actions.filter(a => !US.PAUSED_TOOLS.includes(a.tool)); },
    get(id) { return actions.find(a => a.id === id); },
    /** Fill defaults and coerce types. */
    normalize(a, params) {
      const out = {};
      for (const [k, p] of Object.entries(a.params || {})) {
        let v = params && params[k] != null ? params[k] : p.default;
        if (p.type === 'number' && v != null) v = Number(v);
        if (p.type === 'boolean' && v != null) v = v === true || v === 'true';
        if (p.type === 'enum' && v != null && p.options && !p.options.includes(v)) v = p.default;
        out[k] = v;
      }
      return out;
    },
    /** Run an action as a job (with status bar, log and plain errors). */
    async run(id, params, opts = {}) {
      const a = US.actions.get(id);
      if (!a) throw new US.UserError('UNKNOWN', { detail: 'No action ' + id });
      return US.jobs.run({ title: opts.title || a.title, tool: a.tool }, job => a.run(US.actions.normalize(a, params), job));
    }
  };

  /** The tool the app is built around: shown first in the rail and as the big card on Home. */
  US.FEATURED = 'story';
  US.GROUPS = [
    { id: 'selects', name: 'Selects & clips' },
    { id: 'find', name: 'Find the good bits' },
    { id: 'cut', name: 'Cut faster' },
    { id: 'finish', name: 'Finish & deliver' }
  ];

  /* ---------- context (project / sequence / selection), polled while idle ---------- */
  US.ctx = { project: null, sequence: null, selection: 0 };
  let lastCtx = '';
  async function pollContext(force) {
    if (!force && (document.hidden || US.jobs.current)) return;
    try {
      const c = await US.host.call('context', {}, { timeout: 8000 });
      const s = JSON.stringify(c);
      if (s !== lastCtx) { lastCtx = s; US.ctx = c; renderCtx(); if (!US.jobs.current && els.status && els.status.className === 'status') setIdleStatus(); US.bus.emit('context', c); }
    } catch (e) { /* shown in header when it matters */ }
  }
  US.refreshContext = () => pollContext(true);

  /* ---------- skin: follow Premiere's panel brightness (Resolve has no theme to follow: the dark default in app.css
     is close to Resolve's own grey) ---------- */
  function applySkin() {
    if (!window.__adobe_cep__) return;
    try {
      const env = JSON.parse(window.__adobe_cep__.getHostEnvironment());
      const c = env.appSkinInfo.panelBackgroundColor.color;
      const lum = (c.red * 0.299 + c.green * 0.587 + c.blue * 0.114);
      const root = document.documentElement;
      root.classList.toggle('light', lum > 140);
      if (lum <= 140) {
        const sh = d => `rgb(${Math.min(255, c.red + d) | 0},${Math.min(255, c.green + d) | 0},${Math.min(255, c.blue + d) | 0})`;
        root.style.setProperty('--bg', sh(0));
        root.style.setProperty('--surface', sh(7));
        root.style.setProperty('--surface-2', sh(14));
        root.style.setProperty('--surface-3', sh(23));
        root.style.setProperty('--border', sh(27));
        root.style.setProperty('--border-2', sh(42));
      }
    } catch (e) { /* default dark */ }
  }

  /* ---------- shell ---------- */
  let els = {};
  /**
   * Load the panel again from disk – its code, and Premiere's scripts (sent again at start-up) – so an update or a test
   * copy takes effect without closing and reopening the panel. Your settings and Story work are saved first; a job
   * that's running is asked about, as reloading stops it.
   */
  async function reloadPanel() {
    if (US.jobs.current && !(await US.ui.confirm({ title: 'Reload while this is running?', text: `“${US.jobs.current.title}” will stop. Anything it already made in ${US.app.is('resolve') ? 'Resolve' : 'Premiere'} stays.`, ok: 'Stop and reload', danger: true }))) return;
    if (US.jobs.current) { try { US.jobs.cancel(); US.jobs.cancel(); US.jobs.cancel(); } catch (e) { /* stopping anyway */ } }
    US.log('info', 'Reloading JMG Ultra Studio', '', 'app');
    US.settings.flush();
    setTimeout(() => location.reload(), 150);   // the log line and saves get out first; Story saves on the way out
  }

  /** The top bar's AI chip: the model in use, or “No AI” (features then run their basic versions). */
  function drawAIChip() {
    const c = els.aiChip; if (!c) return;
    const on = !!(US.ai && US.ai.available()), name = on ? US.ai.label().replace(/^Claude /, '') : '';
    c.textContent = on ? `AI · ${name}` : 'No AI';
    c.classList.toggle('off', !on);
    c.title = on && US.ai.provider() === 'local' ? `AI runs on this computer (${US.ai.label()}) – nothing leaves it, not even text. Click for Settings.` : on ? `AI requests go to ${US.ai.label()} – text, and stills or sound of your footage only where you allowed it for the project. Click for Settings – “What was sent to AI” lists every request.` : 'No AI is connected: Story’s AI features run their basic versions, and Ask › My interviews needs AI. Click to see what’s different, or to add a key.';
  }
  US.bus.on('secrets', drawAIChip);
  US.bus.on('settings', k => { if (/^(aiProvider|claudeModel|geminiModel|ai\.localModel|ai\.offlineProjects)$/.test(k)) drawAIChip(); });
  US.bus.on('context', US.debounce(() => drawAIChip(), 300));   // another project may be set to keep everything on this computer
  function buildShell() {
    const app = US.$('#app'); US.clear(app);
    els.ctxProject = h('div.ctx-chip', { title: 'Open project' }, US.icon('folder', 13), h('span', '…'));
    els.ctxSeq = h('div.ctx-chip', { title: 'Active sequence' }, US.icon('film', 13), h('span', '…'));
    const header = h('div.header',
      h('div.brand', h('div.brand-mark', 'JU'), h('div.brand-name', 'JMG Ultra Studio', h('small', { title: 'Version' }, `v${US.version}`),
        US.build ? h('span.unpublished-tag', { title: `Not a released version – ${US.build.dev ? 'running straight from the source folder' : `a test copy${US.build.at ? ' from ' + new Date(US.build.at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''}${US.build.from ? ` (${US.build.from})` : ''}`}. Install a release to go back.` }, 'unpublished') : null)),
      h('div.ctx', els.ctxProject, els.ctxSeq),
      els.aiChip = h('button.ai-chip', { onclick: () => open('settings', { section: 'ai' }) }),
      h('button.icon-btn', { title: `Search everything – tools, actions, interviews, settings (${US.fsx && US.fsx.isWin ? 'Ctrl' : '⌘'}K)`, dataset: { search: '1' }, onclick: () => US.search && US.search.open() }, US.icon('search', 16)),
      h('button.icon-btn', { title: 'Reload Ultra Studio – picks up a new version or test copy without closing the panel', onclick: () => reloadPanel() }, US.icon('refresh', 16)),
      h('button.icon-btn', { title: 'Activity log', onclick: () => toggleLog() }, US.icon('log', 16)),
      h('button.icon-btn', { title: 'Settings', onclick: () => open('settings') }, US.icon('gear', 16)));

    els.statusWho = h('span.status-who', 'Ready');
    els.statusMsg = h('span.status-msg', '');
    els.statusFill = h('div.status-fill');
    els.statusBar = h('div.status-bar', els.statusFill);
    els.statusTime = h('span', '');
    els.stopLabel = h('span', 'Stop');
    els.stop = h('button.btn.small.secondary.status-stop', { title: 'Stop after this step – three quick clicks stop at once', onclick: e => { e.stopPropagation(); const left = US.jobs.cancel(); els.stopLabel.textContent = left > 0 ? `Stop now (${left} more)` : 'Stop'; } }, US.icon('stop', 12), els.stopLabel);
    els.status = h('div.status', { title: 'Click for the activity log', onclick: () => toggleLog(true) },
      h('div.status-dot'),
      h('div.status-text', h('div.status-line', els.statusWho, els.statusMsg), els.statusBar),
      h('div.status-right', els.statusTime, els.stop));

    els.rail = h('div.rail');
    els.view = h('div.view');
    els.placeTabs = h('div.place-tabs.hidden', { role: 'tablist' });
    app.append(header, els.status, h('div.main', els.rail, h('div.content', els.placeTabs, els.view)));
    drawAIChip();
    buildRail();
    buildLogDrawer();
    setIdleStatus();
  }

  function buildRail() {
    US.clear(els.rail);
    els.rail.classList.toggle('places', !US.classicRail());
    if (els.rail.parentNode) els.rail.parentNode.classList.toggle('places', !US.classicRail());
    if (!US.classicRail()) return buildPlaces();
    const add = d => els.rail.appendChild(h('button.rail-btn', { dataset: { id: d.id }, title: d.name + (d.blurb ? ' – ' + d.blurb : ''), onclick: () => open(d.id) }, US.icon(d.icon, 19), h('span', d.short || d.name)));
    const list = US.tools.list().filter(US.onRail);
    const home = list.find(d => d.id === 'home'); if (home) add(home);
    // the featured tool (Story – the heart of the app) sits right under Home
    const featured = list.find(d => d.id === US.FEATURED);
    if (featured) { els.rail.appendChild(h('div.rail-sep')); add(featured); }
    for (const g of US.GROUPS) {
      const inGroup = list.filter(d => d.group === g.id && d.id !== US.FEATURED);
      if (!inGroup.length) continue;
      els.rail.appendChild(h('div.rail-sep'));
      inGroup.forEach(add);
    }
    const rest = list.filter(d => d.id !== 'home' && d.id !== US.FEATURED && d.id !== 'assistant' && !US.GROUPS.some(g => g.id === d.group));
    if (rest.length) { els.rail.appendChild(h('div.rail-sep')); rest.forEach(add); }
    // starred tools that have no button of their own here (the Advanced ones, Settings)
    const favs = US.favs.list().map(id => US.tools.get(id)).filter(d => !list.includes(d));
    if (favs.length) { els.rail.appendChild(h('div.rail-sep')); favs.forEach(d => { add(d); starMark(els.rail.lastChild, d.id); }); }
    if (list.some(d => d.id === 'assistant')) els.rail.append(h('div.rail-spacer'), askButton({ id: 'assistant' }, () => open('assistant')));
  }
  /** Ask: at the very bottom of the rail, and plainly the AI – a sparkle in a slowly turning ring (css: .rail-ask). */
  function askButton(dataset, onclick) {
    return h('button.rail-btn.rail-ask', { dataset, title: 'Ask – the AI: say what you want in plain English, or ask about your interviews', onclick },
      h('span.ask-orb', US.icon('sparkle', 17)), h('span', 'Ask'));
  }
  /** A starred tool's rail button: a small star, and a right-click menu to move or remove it. */
  function starMark(b, id) {
    b.classList.add('rail-fav'); b.dataset.fav = id;
    b.appendChild(h('span.rail-star', { 'aria-hidden': 'true' }, '★'));
  }
  /** Right-click (or the Menu key) on a rail button: move it, or take a starred one off. */
  function railMenu(e, item) {
    e.preventDefault();
    closeRailMenu();
    const r = e.currentTarget.getBoundingClientRect(), keys = US.railOrder.keys(), i = keys.indexOf(item.key);
    const row = (label, fn, off) => h('button.rail-menu-item', { disabled: !!off, onclick: () => { closeRailMenu(); fn(); } }, label);
    const menu = h('div.rail-menu', { role: 'menu', style: { left: (r.right + 4) + 'px', top: Math.max(4, Math.min(r.top, window.innerHeight - 120)) + 'px' } },
      row('Move up', () => US.railOrder.move(item.key, -1), i <= 0),
      row('Move down', () => US.railOrder.move(item.key, 1), i >= keys.length - 1),
      item.fav ? row('Remove from the sidebar', () => US.favs.toggle(item.tool, false)) : null,
      row('Sidebar settings…', () => open('settings', { section: 'sidebar' })));
    document.body.appendChild(menu);
    setTimeout(() => document.addEventListener('mousedown', railMenuOff, true), 0);
    document.addEventListener('keydown', railMenuOff, true);
  }
  function railMenuOff(e) { if (e.type === 'keydown' ? e.key === 'Escape' : !e.target.closest || !e.target.closest('.rail-menu')) closeRailMenu(); }
  function closeRailMenu() {
    document.querySelectorAll('.rail-menu').forEach(m => m.remove());
    document.removeEventListener('mousedown', railMenuOff, true); document.removeEventListener('keydown', railMenuOff, true);
  }
  /** Drag a rail button up or down to reorder the rail (Settings › Sidebar has Up and Down buttons for the same). */
  function dragToReorder(b, item) {
    b.draggable = true;
    const clear = () => US.$$('.rail-btn', els.rail).forEach(x => x.classList.remove('drop-before', 'drop-after'));
    b.addEventListener('dragstart', e => { railDrag = item.key; b.classList.add('dragging'); try { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', item.name); } catch (x) { /* some hosts refuse */ } });
    b.addEventListener('dragend', () => { railDrag = null; b.classList.remove('dragging'); clear(); });
    b.addEventListener('dragover', e => {
      if (!railDrag || railDrag === item.key) return;
      e.preventDefault(); clear();
      const r = b.getBoundingClientRect();
      b.classList.add(e.clientY < r.top + r.height / 2 ? 'drop-before' : 'drop-after');
    });
    b.addEventListener('drop', e => {
      if (!railDrag || railDrag === item.key) return;
      e.preventDefault();
      const r = b.getBoundingClientRect(), before = e.clientY < r.top + r.height / 2, keys = US.railOrder.keys().filter(k => k !== railDrag);
      const key = railDrag; railDrag = null;
      US.railOrder.place(key, before ? item.key : keys[keys.indexOf(item.key) + 1] || null);
    });
  }
  let railDrag = null;

  /** The rail as places: the places and starred tools in the person's order, then Ask at the very bottom. */
  function buildPlaces() {
    for (const item of US.railOrder.items()) {
      const b = h('button.rail-btn', { dataset: item.place ? { place: item.place } : { id: item.tool }, title: item.title, onclick: () => (item.place ? openPlace(item.place) : open(item.tool)), oncontextmenu: e => railMenu(e, item) }, US.icon(item.icon, 19), h('span', item.name));
      b.dataset.key = item.key;
      if (item.fav) starMark(b, item.tool);
      dragToReorder(b, item);
      els.rail.appendChild(b);
    }
    if (US.placeTools('ask').length) els.rail.append(h('div.rail-spacer'), askButton({ place: 'ask' }, () => openPlace('ask')));
    if (currentId) markRail(currentId);
  }
  /** The star beside a tab's title: on the rail or not (every open tab's star is kept in step). */
  function drawStars() {
    document.querySelectorAll('.fav-btn').forEach(b => {
      const on = US.favs.has(b.dataset.star);
      b.classList.toggle('on', on); b.textContent = on ? '★' : '☆';
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
      b.title = on ? 'On the sidebar – click to take it off' : 'Add to the sidebar, for one-click access';
    });
  }
  function starButton(id) {
    return h('button.icon-btn.fav-btn', { dataset: { star: id }, onclick: () => { const on = US.favs.toggle(id); US.ui.toast({ type: 'ok', title: on ? `${US.tools.get(id).name} is on the sidebar` : `${US.tools.get(id).name} is off the sidebar`, text: on ? 'Drag it to move it, or right-click it. Settings › Sidebar has the whole list.' : '', timeout: 2500 }); } }, '☆');
  }
  /** Open a place: the tool last used there, or its first. */
  function openPlace(pid) {
    const tools = pid === 'advanced' ? [US.tools.get('advanced')].filter(Boolean) : US.placeTools(pid);
    if (!tools.length) return;
    const last = US.settings.get('place.last.' + pid, null);
    open(tools.some(d => d.id === last) ? last : tools[0].id);
  }
  US.openPlace = openPlace;
  /** Light the rail button for a tool, and show its place's tabs. */
  function markRail(id) {
    if (!els.rail) return;
    const classic = US.classicRail(), pid = classic ? null : US.placeOf(id);
    const railId = classic ? US.homeTabOf(id) : pid;
    US.$$('.rail-btn', els.rail).forEach(b => b.classList.toggle('on', classic ? (b.dataset.id === railId || b.dataset.id === id) : (b.dataset.place ? b.dataset.place === railId : b.dataset.id === id)));
    drawPlaceTabs(pid, id);
  }
  function drawPlaceTabs(pid, id) {
    if (!els.placeTabs) return;
    US.clear(els.placeTabs);
    const tools = pid && pid !== 'advanced' ? US.placeTools(pid) : [];
    els.placeTabs.classList.toggle('hidden', tools.length < 2);
    if (tools.length < 2) return;
    tools.forEach(d => els.placeTabs.appendChild(h('button.place-tab' + (d.id === id ? '.on' : ''), { dataset: { tool: d.id }, role: 'tab', title: (d.blurb || d.name) + (US.favs.has(d.id) ? ' (starred: on the sidebar)' : ''), onclick: () => open(d.id) }, US.icon(d.icon, 14), h('span.pt-long', d.name), h('span.pt-short', d.short || d.name), US.favs.has(d.id) ? h('span.pt-star', { 'aria-hidden': 'true' }, '★') : null)));
  }
  US.rebuildRail = () => { if (els.rail) buildRail(); if (currentId) markRail(currentId); };

  function open(id, opts) {
    const def = US.tools.get(id) || US.tools.get('home');
    if (!def) return;
    if (currentId && mounted.has(currentId)) { const m = mounted.get(currentId); m.el.classList.add('hidden'); m.onHide && m.onHide(); }
    let m = mounted.get(def.id);
    if (!m) {
      try { m = def.create(); }
      catch (e) { US.ui.showError(e, { context: 'Opening ' + def.name }); m = { el: US.ui.empty({ icon: 'error', title: `${def.name} couldn’t start.`, text: 'Open the activity log (☰) and send the details to support.' }) }; US.log('error', `${def.name} failed to open`, e.stack); }
      // wide tools (Story's board, and any tool that asks) use the panel's full width instead of a reading width
      if (def.wide || def.id === US.FEATURED) m.el.classList.add('wide');
      // a tool kept in Advanced: a way back there, and for one in development a plain warning
      if (def.id !== 'advanced' && US.homeTabOf(def.id) === 'advanced') {
        const dev = US.PAUSED_TOOLS.includes(def.id);
        m.el.prepend(h('div.advanced-crumb', h('button.link-btn', { onclick: () => open('advanced') }, '‹ Advanced' + (dev ? ' › In development' : '')),
          dev ? h('span.field-hint', ' – still being made: parts may not work yet') : null));
      }
      // a short tour of this tab (js/tools/03-tour.js), from a ? beside its title
      const head = m.el.querySelector && m.el.querySelector('.tool-head');
      if (head && US.tour && US.tour.has(def.id)) head.appendChild(h('button.icon-btn.tour-btn', { title: 'A short tour of this tab', dataset: { tour: def.id }, onclick: () => US.tour.start(def.id) }, '?'));
      // a star on every tab and sub-tab: starred, it gets a button of its own on the rail (US.favs)
      if (US.favs.can(def.id) && m.el.prepend) {
        const star = starButton(def.id), crumb = m.el.querySelector && m.el.querySelector('.advanced-crumb');
        if (head) head.appendChild(star); else if (crumb) crumb.appendChild(star); else m.el.prepend(h('div.fav-bar', star));
      }
      mounted.set(def.id, m); els.view.appendChild(m.el);
    }
    m.el.classList.remove('hidden');
    drawStars();
    currentId = def.id;
    markRail(def.id);
    els.view.scrollTop = 0;
    if (!def.hidden) US.settings.set('lastTool', def.id);
    const pid = US.placeOf(def.id); if (pid && pid !== 'advanced') US.settings.set('place.last.' + pid, def.id);
    m.onShow && m.onShow(opts);
    US.bus.emit('tool-shown', def.id, opts, m.el);
  }

  function renderCtx() {
    const c = US.ctx;
    const p = els.ctxProject, s = els.ctxSeq;
    p.querySelector('span').textContent = c.project ? c.project.name : 'No project open';
    p.classList.toggle('off', !c.project);
    // the timeline's own name as it is (never put in Resolve's words); the rest in the editor's words
    s.querySelector('span').textContent = c.sequence ? c.sequence.name : US.say('No sequence');
    s.classList.toggle('off', !c.sequence);
    s.title = c.sequence ? `${c.sequence.name} · ${c.sequence.width}×${c.sequence.height} · ${+c.sequence.fps.toFixed(3)} fps · ${US.fmtDur(c.sequence.duration)}` : US.say('No active sequence');
  }

  /* ---------- status bar ---------- */
  /** "Camera Switch: " when the job belongs to a tool other than the one on screen, so the status line never seems to
      be about the wrong tab (UI review). */
  function otherTool(job) {
    const d = job && job.tool && job.tool !== currentId && US.tools.get(job.tool);
    return d && !d.hidden && d.id !== 'home' ? d.name + ': ' : '';
  }
  let resultTimer = null;
  function setIdleStatus() {
    els.status.className = 'status';
    els.statusWho.textContent = 'Ready';
    els.statusMsg.textContent = US.say(US.ctx.project ? '' : '· open a project in Premiere to begin');
    els.statusTime.textContent = '';
  }
  let tick = null;
  US.bus.on('job', job => {
    if (!els.status) return;   // no screen yet (start-up, tests)
    clearTimeout(resultTimer);
    els.status.className = 'status running';
    els.statusWho.textContent = US.say(job.who);
    els.statusMsg.textContent = US.say('· ' + otherTool(job) + job.title + (job.msg ? ' — ' + job.msg : ''));
    els.statusMsg.title = job.about || '';
    els.statusBar.classList.toggle('indeterminate', job.indeterminate);
    els.statusFill.style.width = (job.frac * 100).toFixed(1) + '%';
    renderTime(job);
  });
  function renderTime(job) {
    const pct = job.indeterminate ? '' : Math.round(job.frac * 100) + '%';
    const left = !job.indeterminate && isFinite(job.eta) && job.frac > 0.03 ? ' · ' + US.fmtEta(job.eta) + ' left' : '';
    els.statusTime.textContent = [pct, US.fmtDur(job.elapsed)].filter(Boolean).join(' · ') + left;
  }
  US.bus.on('jobstart', job => { if (!els.status) return; if (els.stopLabel) els.stopLabel.textContent = 'Stop'; clearInterval(tick); tick = setInterval(() => { if (US.jobs.current) renderTime(US.jobs.current); }, 500); markRailBusy(job.tool, true); });
  US.bus.on('jobend', (job, r) => {
    if (!els.status) return;
    clearInterval(tick); markRailBusy(job.tool, false);
    els.status.className = 'status ' + (r.ok ? 'ok' : r.cancelled ? '' : 'error');
    els.statusWho.textContent = r.ok ? 'Done' : r.cancelled ? 'Stopped' : 'Didn’t finish';
    els.statusMsg.textContent = US.say('· ' + otherTool(job) + job.title + ' — ' + r.summary);
    els.statusTime.textContent = US.fmtDur(job.elapsed);
    resultTimer = setTimeout(setIdleStatus, r.ok ? 12000 : 20000);
    pollContext(true);
  });
  function markRailBusy(toolId, on) {
    const pid = !US.classicRail() && US.placeOf(toolId);
    const b = els.rail && (els.rail.querySelector(`.rail-btn[data-id="${toolId}"]`) || (pid && els.rail.querySelector(`.rail-btn[data-place="${pid}"]`)));
    if (!b) return;
    const d = b.querySelector('.busy-dot');
    if (on && !d) b.appendChild(h('span.busy-dot')); else if (!on && d) d.remove();
  }

  /* ---------- activity log drawer ---------- */
  function buildLogDrawer() {
    els.logBody = h('div.drawer-body');
    els.drawer = h('div.drawer',
      h('div.drawer-head', US.icon('log', 16), h('span.grow', 'Activity log'),
        h('button.btn.small.ghost', { onclick: () => { US.ui.copy(US.log.entries().map(fmtEntry).join('\n')); US.ui.toast({ type: 'ok', title: 'Log copied', timeout: 1500 }); } }, 'Copy'),
        h('button.btn.small.ghost', { onclick: () => { require('child_process').exec((US.fsx.isWin ? 'explorer "' : 'open "') + US.fsx.logDir() + '"'); } }, 'Open folder'),
        h('button.icon-btn', { onclick: () => toggleLog(false) }, US.icon('close', 15))),
      els.logBody);
    document.body.appendChild(els.drawer);
    US.log.entries().forEach(addLogRow);
    US.bus.on('log', addLogRow);
  }
  function fmtEntry(e) { return `${new Date(e.t).toLocaleTimeString()} [${e.level}] ${e.tool ? e.tool + ': ' : ''}${e.text}${e.detail ? '\n  ' + e.detail : ''}`; }
  function addLogRow(e) {
    if (!els.logBody) return;
    els.logBody.appendChild(h('div.log-row.' + e.level, h('span.log-time', new Date(e.t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })), h('span.log-text', (e.tool ? US.tools.get(e.tool) ? US.tools.get(e.tool).name + ': ' : '' : '') + e.text), e.detail && h('span.log-detail', e.detail.slice(0, 2000))));
    while (els.logBody.children.length > 400) els.logBody.firstChild.remove();
    els.logBody.scrollTop = els.logBody.scrollHeight;
  }
  function toggleLog(force) { els.drawer.classList.toggle('open', force); if (els.drawer.classList.contains('open')) els.logBody.scrollTop = els.logBody.scrollHeight; }
  US.toggleLog = toggleLog;

  /* ---------- start-up ---------- */
  function bootScreen(msg, err) {
    const app = US.$('#app'); US.clear(app);
    app.appendChild(h('div.boot', h('div',
      h('div.brand-mark', 'JU'), h('div', { style: { fontWeight: 650, color: 'var(--text)', fontSize: '14px' } }, 'JMG Ultra Studio'),
      h('div', { style: { marginTop: '6px' } }, msg),
      err ? h('div', { style: { marginTop: '12px', display: 'flex', gap: '8px', justifyContent: 'center' } },
        US.ui.button('Try again', { kind: 'primary', onClick: boot }),
        US.ui.button('Details', { kind: 'ghost', onClick: () => US.ui.modal({ title: 'Details', body: h('pre.mono', { style: { whiteSpace: 'pre-wrap', userSelect: 'text' } }, err), buttons: [{ label: 'Close', value: 1 }] }) }))
        : h('div.spinner'))));
  }

  async function boot() {
    applySkin();
    try { window.__adobe_cep__.addEventListener('com.adobe.csxs.events.ThemeColorChanged', applySkin); } catch (e) { /* older CEP, or Resolve */ }
    bootScreen(`Connecting to ${US.app.name}…`);
    try {
      US.fsx.cleanTemp();
      await US.host.loadScripts();
      const ping = await US.host.call('ping', {}, { timeout: 15000 });
      US.premiere = ping;
      if (US.fsx.isWin && !US.app.is('resolve')) { try { US.fsx.setDocumentsDir(await US.host.rawEval('Folder.myDocuments.fsName', 5000)); } catch (e) { /* keep the default */ } }
      US.log('info', `Started JMG Ultra Studio ${US.version}${US.build ? ` (unpublished${US.build.from ? ': ' + US.build.from : ''})` : ''} in ${US.app.full} ${ping.version}`);
    } catch (e) {
      // the Resolve connection (resolve/host/index.js) explains itself with usTitle/usAction
      const x = e && e.usTitle ? { title: US.say(e.usTitle), action: US.say(e.usAction || ''), detail: String(e.stack || e.message) } : US.errors.explain(e);
      bootScreen(e && e.usTitle ? `${x.title} ${x.action}` : `Couldn’t connect to ${US.app.name}. ` + x.action, x.detail || String(e));
      return;
    }
    buildShell();
    await pollContext(true);
    open(US.settings.get('lastTool', 'home'));
    US.bus.emit('ready');
    setInterval(() => pollContext(false), 2500);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) pollContext(true); });
    window.addEventListener('focus', () => pollContext(true));
  }
  US.boot = boot;

  window.addEventListener('error', e => US.log && US.log('error', 'Unexpected problem in the panel', (e.error && e.error.stack) || e.message));
  window.addEventListener('unhandledrejection', e => US.log && US.log('error', 'Unexpected problem in the panel', (e.reason && (e.reason.stack || e.reason.message)) || String(e.reason)));
})();
