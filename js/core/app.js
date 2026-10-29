/* JMG Ultra Studio – the shell: header, status bar, tool rail, activity log, settings, start-up. */
(function () {
  'use strict';
  const US = window.US, h = US.h;

  /* ---------- tool registry ---------- */
  const defs = [];
  const mounted = new Map();
  let currentId = null;
  /** Tools taken out for now (the user asked: Colour and Cameras 28 Oct 2026, B-roll and Sound 29 Oct 2026). Their code
      stays; delete an id here to bring one back. The unit tests set window.US_SHOW_PAUSED so the paused tools' code is still tested. */
  US.PAUSED_TOOLS = window.US_SHOW_PAUSED ? [] : ['colour', 'cameras', 'broll', 'sound'];
  US.tools = {
    /** register({id, name, short, icon, group, blurb, order, create: () => ({el, onShow?, onHide?})}) */
    register(def) {
      if (US.PAUSED_TOOLS.includes(def.id)) return;
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
    register(a) { if (US.PAUSED_TOOLS.includes(a.tool)) return; const i = actions.findIndex(x => x.id === a.id); if (i >= 0) actions.splice(i, 1); actions.push(Object.assign({ params: {}, examples: [], changes: false }, a)); },
    list() { return actions.slice(); },
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
  function buildShell() {
    const app = US.$('#app'); US.clear(app);
    els.ctxProject = h('div.ctx-chip', { title: 'Open project' }, US.icon('folder', 13), h('span', '…'));
    els.ctxSeq = h('div.ctx-chip', { title: 'Active sequence' }, US.icon('film', 13), h('span', '…'));
    const header = h('div.header',
      h('div.brand', h('div.brand-mark', 'JU'), h('div.brand-name', 'JMG Ultra Studio')),
      h('div.ctx', els.ctxProject, els.ctxSeq),
      h('button.icon-btn', { title: 'Activity log', onclick: () => toggleLog() }, US.icon('log', 16)),
      h('button.icon-btn', { title: 'Settings', onclick: () => open('settings') }, US.icon('gear', 16)));

    els.statusWho = h('span.status-who', 'Ready');
    els.statusMsg = h('span.status-msg', '');
    els.statusFill = h('div.status-fill');
    els.statusBar = h('div.status-bar', els.statusFill);
    els.statusTime = h('span', '');
    els.stop = h('button.btn.small.secondary.status-stop', { onclick: e => { e.stopPropagation(); US.jobs.cancel(); } }, US.icon('stop', 12), 'Stop');
    els.status = h('div.status', { title: 'Click for the activity log', onclick: () => toggleLog(true) },
      h('div.status-dot'),
      h('div.status-text', h('div.status-line', els.statusWho, els.statusMsg), els.statusBar),
      h('div.status-right', els.statusTime, els.stop));

    els.rail = h('div.rail');
    els.view = h('div.view');
    app.append(header, els.status, h('div.main', els.rail, els.view));
    buildRail();
    buildLogDrawer();
    setIdleStatus();
  }

  function buildRail() {
    US.clear(els.rail);
    const add = d => els.rail.appendChild(h('button.rail-btn', { dataset: { id: d.id }, title: d.name + (d.blurb ? ' – ' + d.blurb : ''), onclick: () => open(d.id) }, US.icon(d.icon, 19), h('span', d.short || d.name)));
    const list = US.tools.list().filter(d => !d.hidden);
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
    const rest = list.filter(d => d.id !== 'home' && d.id !== US.FEATURED && !US.GROUPS.some(g => g.id === d.group));
    if (rest.length) { els.rail.appendChild(h('div.rail-sep')); rest.forEach(add); }
  }

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
      mounted.set(def.id, m); els.view.appendChild(m.el);
    }
    m.el.classList.remove('hidden');
    currentId = def.id;
    US.$$('.rail-btn', els.rail).forEach(b => b.classList.toggle('on', b.dataset.id === def.id));
    els.view.scrollTop = 0;
    if (!def.hidden) US.settings.set('lastTool', def.id);
    m.onShow && m.onShow(opts);
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
  let resultTimer = null;
  function setIdleStatus() {
    els.status.className = 'status';
    els.statusWho.textContent = 'Ready';
    els.statusMsg.textContent = US.say(US.ctx.project ? '' : '· open a project in Premiere to begin');
    els.statusTime.textContent = '';
  }
  let tick = null;
  US.bus.on('job', job => {
    clearTimeout(resultTimer);
    els.status.className = 'status running';
    els.statusWho.textContent = US.say(job.who);
    els.statusMsg.textContent = US.say('· ' + job.title + (job.msg ? ' — ' + job.msg : ''));
    els.statusBar.classList.toggle('indeterminate', job.indeterminate);
    els.statusFill.style.width = (job.frac * 100).toFixed(1) + '%';
    renderTime(job);
  });
  function renderTime(job) {
    const pct = job.indeterminate ? '' : Math.round(job.frac * 100) + '%';
    const left = !job.indeterminate && isFinite(job.eta) && job.frac > 0.03 ? ' · ' + US.fmtEta(job.eta) + ' left' : '';
    els.statusTime.textContent = [pct, US.fmtDur(job.elapsed)].filter(Boolean).join(' · ') + left;
  }
  US.bus.on('jobstart', job => { clearInterval(tick); tick = setInterval(() => { if (US.jobs.current) renderTime(US.jobs.current); }, 500); markRailBusy(job.tool, true); });
  US.bus.on('jobend', (job, r) => {
    clearInterval(tick); markRailBusy(job.tool, false);
    els.status.className = 'status ' + (r.ok ? 'ok' : r.cancelled ? '' : 'error');
    els.statusWho.textContent = r.ok ? 'Done' : r.cancelled ? 'Stopped' : 'Didn’t finish';
    els.statusMsg.textContent = US.say('· ' + job.title + ' — ' + r.summary);
    els.statusTime.textContent = US.fmtDur(job.elapsed);
    resultTimer = setTimeout(setIdleStatus, r.ok ? 12000 : 20000);
    pollContext(true);
  });
  function markRailBusy(toolId, on) {
    const b = els.rail && els.rail.querySelector(`.rail-btn[data-id="${toolId}"]`);
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
      US.log('info', `Started JMG Ultra Studio ${US.version} in ${US.app.full} ${ping.version}`);
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
