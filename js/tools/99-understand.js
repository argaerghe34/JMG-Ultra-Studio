/* JMG Ultra Studio – Settings › Vision & listening models: who looks at and listens to the footage.

   For the open project: on this computer, or the cloud (a deliberate choice, asked with the estimate; off until
   then), or off – with what each means, how long it would take and what it would cost for this project's footage.
   For this computer: which vision model and which listening model, each downloaded only when Download is pressed
   (size shown first), deleted with one button, and where they are kept; whether they update by themselves; and what
   the background work is doing right now.

   The screen registers itself with US.settingsSections (99-settings.js); US.understandUI also gives the status line
   other screens show (Selects) and the cloud confirmation (Overnight prep). */
(function () {
  'use strict';
  const US = window.US, h = US.h, ui = US.ui;
  // until 99-settings.js has its registry (and in the unit tests): a list anyone can read
  if (!US.settingsSections) { const all = []; US.settingsSections = { list: () => all.slice(), register(s) { const i = all.findIndex(x => x.id === s.id); if (i >= 0) all.splice(i, 1); all.push(s); all.sort((a, b) => (a.order || 0) - (b.order || 0)); return s; } }; }

  const U = () => US.understand, M = () => US.models;
  const money = r => (r[1] < 0.005 ? 'under 1¢' : r[0] === r[1] || US.ai.fmtUSD(r[0]) === US.ai.fmtUSD(r[1]) ? US.ai.fmtUSD(r[1]) : `${US.ai.fmtUSD(r[0])}–${US.ai.fmtUSD(r[1])}`);
  const dur = s => (s < 90 ? 'about a minute' : US.fmtDur(s));
  const durRange = r => (Math.abs(r[0] - r[1]) < 30 ? dur(r[1]) : `${US.fmtDur(r[0])}–${US.fmtDur(r[1])}`);

  /** The numbers for this project's footage (as last counted), for both routes. -> {footage, e} or null when not counted yet */
  function numbers() {
    const f = U().footage(), q = U().queue;
    const clips = q.listed && q.items.length ? q.items : f ? { minutes: f.minutes, clips: f.clips } : null;
    if (!clips) return null;
    const P = U().plan(), v = US.settings.get('understand.visionModel', ''), vm = (M().get(v) || P.vision.model || M().list().find(m => m.best));
    const cloud = US.ai.mediaModel();
    return { footage: f || { clips: q.items.length, minutes: Math.round(q.items.reduce((n, c) => n + c.duration, 0) / 6) / 10 }, e: U().estimate(clips, { bench: U().bench(), visionModel: vm, cloud: cloud.provider === 'none' ? null : cloud, prices: US.ai.MEDIA_PRICES }), vm, cloud };
  }
  /** The plain sentences of an estimate. */
  function estimateText(n) {
    const e = n.e, L = e.local, out = {};
    out.footage = `${US.plural(n.footage.clips, 'clip')}, ${US.fmtDur(e.minutes * 60)} of footage`;
    out.local = `Listening (built in): ${dur(L.listenSecs)}${L.listenMeasured ? ', measured on this computer' : ' – an estimate, press Measure for this computer’s real speed'}. ` +
      (L.visionSecs ? `Looking with ${L.visionModel}: ${L.visionMeasured ? dur(L.visionSecs[1]) + ', measured on this computer' : durRange(L.visionSecs) + ' – an estimate (' + n.vm.assume.join('–') + ' seconds a still, ' + e.stills + ' stills); it isn’t measured here until the model has run'}. ` : 'Looking: needs a vision model (below). ') + 'Cost: nothing.';
    if (e.cloud) {
      const c = e.cloud;
      out.cloud = `${c.label}: ${durRange(c.secs)} with a good connection, about ${c.megabytes} MB uploaded. ` +
        (c.provider === 'gemini' ? `Cost at Google’s paid rate: ${money(c.usd)} (prices read on ${c.date}; a range because Google’s own pages give two token rates). On Google’s free allowance it costs nothing – but Google may then use what is sent to improve its products.` : `Cost: ${money(c.usd)} (prices read on ${c.date}). Claude looks at stills only – listening stays on this computer.`);
      out.usd = c.usd;
    } else out.cloud = 'Needs a Gemini key (sees and hears) or a Claude key (sees stills only) in Settings › AI.';
    return out;
  }

  /**
   * Choosing the cloud for this project: say exactly what leaves, what it costs for this project, and ask.
   * -> true when the editor says yes (and the choice is made).
   */
  async function confirmCloud({ overnight = false } = {}) {
    if (US.ai.projectOffline()) { ui.toast({ type: 'warn', title: 'This project is set to “nothing leaves this computer”', text: 'Its footage is only looked at and listened to here. Change that in Settings › AI first if you mean to.' }); return false; }
    const C = US.ai.mediaModel();
    if (C.provider === 'none') { ui.toast({ type: 'warn', title: 'No cloud AI is set up', text: 'Add a Gemini key (sees and hears) or a Claude key (stills only) in Settings › AI.' }); return false; }
    if (!U().queue.listed) { try { await U().listProject(); } catch (e) { /* estimate without the count */ } }
    const n = numbers(), t = n ? estimateText(n) : null, name = (US.ctx.project && US.ctx.project.name) || 'this project';
    const ok = await ui.modal({ title: overnight ? `Send this project’s footage to ${C.label} tonight?` : `Let ${C.label} see and hear “${name}”?`,
      body: h('div',
        h('p', C.hears ? 'Small stills of each clip (512 pixels wide, about one every ten seconds) and its sound (as plain 16 kHz audio) are sent from this computer to Google, a piece at a time.' : 'Small stills of each clip (512 pixels wide, about one every ten seconds) are sent from this computer to Anthropic. Claude can’t listen: sound stays here.'),
        t ? h('p', h('b', t.footage + '. '), t.cloud) : h('p', 'The footage hasn’t been counted yet, so there’s no estimate – count it first in Settings › Vision & listening models if you want one.'),
        h('p.field-hint', 'This is for this project only, on this computer, until you switch it back. Every request is listed in Settings › What was sent to AI with its size. A project set to “nothing leaves this computer” never sends anything.')),
      buttons: [{ label: 'Keep it on this computer', value: false, kind: 'ghost' }, { label: t && t.usd ? `Yes – up to about ${US.ai.fmtUSD(t.usd[1])}` : 'Yes, use the cloud', value: true, kind: 'primary' }] });
    if (ok) { if (U().route() !== 'cloud') U().setRoute('cloud'); else US.ai.setMedia(true); }
    return !!ok;
  }

  const runNow = () => US.jobs.run({ title: 'Looking at and listening to the footage', tool: 'settings' }, async job => {
    if (U().route() === 'cloud' && !(await confirmCloud())) throw new US.UserError('CANCELLED');
    return U().runAll(job, { heavy: true });
  });
  function addToOvernight() {
    const o = US.overnight ? US.overnight.settings() : { steps: [] };
    if (!o.steps.includes('understand')) { o.steps = o.steps.concat('understand'); US.settings.set('overnight', o); }
    ui.toast({ type: 'ok', title: 'Added to Overnight prep', text: '“Look at and listen to all the footage” is ticked. Start Overnight prep on Home when you leave.', action: { label: 'Open Home', fn: () => US.tools.open('home') } });
  }

  /**
   * The status line: a pill saying where things stand, a plain note when something is waiting (what, why, how long),
   * and the buttons that go with it. It keeps itself up to date.
   */
  function chip({ compact = false } = {}) {
    const el = h('div.und-chip');
    const COLOR = { working: 'var(--accent-hi)', 'up-to-date': 'var(--ok)', paused: 'var(--text-2)', scheduled: 'var(--warn)', 'cloud-waiting': 'var(--warn)', 'needs-model': 'var(--text-2)', off: 'var(--text-3)', starting: 'var(--text-2)', 'no-project': 'var(--text-3)' };
    function draw(st) {
      if (el.isConnected) shown = true; else if (shown) { off(); return; }   // taken off the screen: stop following
      st = st && st.state ? st : U().status();
      US.clear(el);
      el.dataset.state = st.state;
      const btns = (st.offers || []).map(o => o === 'overnight' ? ui.button('Do it in Overnight prep', { small: true, onClick: addToOvernight }) : o === 'now' ? ui.button(st.state === 'scheduled' ? 'Run now anyway' : 'Run now', { small: true, kind: compact ? 'ghost' : 'secondary', onClick: runNow }) : ui.button('Open Settings', { small: true, kind: 'ghost', onClick: () => US.tools.open('settings', { section: 'understand' }) }));
      el.append(h('div.row', ui.pill(st.text, COLOR[st.state]), h('span.grow'), ...(compact ? btns.slice(0, 2) : [])));
      if (st.note) el.append(h('div.field-hint', st.note));
      if (!compact && btns.length) el.append(h('div.row', btns));
    }
    let shown = false;
    const off = US.bus.on('understand', draw);
    draw();
    return el;
  }

  /* ---------- the Settings section ---------- */
  function create() {
    const box = h('div.und-settings');
    let counting = false;
    const set = (k, v) => { US.settings.set('understand.' + k, v); US.bus.emit('models', {}); draw(); };

    function routeCard() {
      const off = US.ai.projectOffline(), r = U().route(), n = numbers(), t = n ? estimateText(n) : null, name = (US.ctx.project && US.ctx.project.name) || '';
      const seg = ui.segmented({ options: [{ value: 'local', label: 'On this computer', title: 'Nothing leaves this computer' }, { value: 'cloud', label: 'Cloud', title: 'Stills and sound are sent to Gemini (or stills to Claude) – asked first, with the cost' }, { value: 'off', label: 'Off' }], value: r,
        onChange: async x => { if (x === 'cloud') { if (!(await confirmCloud())) { draw(); return; } } else U().setRoute(x); draw(); } });
      const pros = (title, good, bad, est) => h('div.und-route', h('div.list-title', title), h('ul', good.map(g => h('li.und-pro', g)), bad.map(b => h('li.und-con', b))), est ? h('div.field-hint', est) : null);
      return h('div.und-block', h('div.und-head', 'This project', name ? h('span.right', US.keep(name)) : null),
        h('div.field-hint', 'Ultra Studio can look at your footage and listen to it, so Ask, Story and Selects know what’s in it – what each shot shows over time, reactions and gestures no transcript has, and what can be heard: music, applause, laughter, wind, a raised voice. Choose where that happens for this project.'),
        US.ctx.project ? ui.field('Where it happens', seg, off ? 'This project is set to “nothing leaves this computer” (Settings › AI): the cloud can’t be chosen for it.' : r === 'cloud' ? `Cloud is on for this project: ${US.ai.mediaModel().label}. Switch back any time.` : 'Cloud is off until you choose it here, and you’re shown the cost first.') : ui.note('Open a project to choose.', 'info'),
        h('div.grid2',
          pros('On this computer', ['Nothing leaves this computer – right for client work under NDA', 'Free, and works offline', 'Listening is built in: nothing to download'], ['Looking needs a model downloaded once (0.5–5 GB)', 'Slower, and uses this computer while it works – big jobs wait for a quiet moment or Overnight prep', 'Small models describe more plainly; naming laughter needs the cloud or the experimental listening model'], t ? t.local : null),
          pros('Cloud', ['The best descriptions, and it hears laughter, applause, music and tone of voice properly', 'Nothing to download; this computer stays free for editing', 'Quick: minutes for most projects'], ['Stills and sound of your footage leave this computer (to Google; stills only to Anthropic)', 'Costs money beyond Google’s free allowance – and on the free allowance Google may use what’s sent', 'Needs the internet, and your own key'], t ? t.cloud : null)),
        h('div.row', h('span.field-hint.grow', t ? `For this project: ${t.footage}${n.footage.at ? `, counted ${new Date(n.footage.at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}` : ''}.` : 'The estimates need this project’s footage counted (a quick look through the project’s bins – nothing is analysed).'),
          US.ctx.project ? ui.button(counting ? 'Counting…' : t ? 'Count again' : 'Count this project’s footage', { small: true, disabled: counting, onClick: async () => { counting = true; draw(); try { await U().listProject(); } finally { counting = false; draw(); } } }) : null,
          ui.button('Measure this computer', { small: true, kind: 'ghost', title: 'A few seconds: how fast this computer listens and, when a vision model is here, looks', onClick: () => US.jobs.run({ title: 'Measuring this computer', tool: 'settings' }, job => U().benchmark(job)).then(draw) })),
        US.ai.mediaModel().provider !== 'none' && !off ? ui.field('Cloud model', ui.select({ options: [{ value: '', label: 'Automatic – the quick, cheap Gemini (or Claude Haiku without a Gemini key)' }].concat((US.ai.choices() || []).filter(c => c.provider === 'gemini' || c.provider === 'claude').map(c => ({ value: c.provider + ':' + c.model, label: c.label + (c.provider === 'claude' ? ' – stills only' : ' – sees and hears') }))), value: US.settings.get('understand.cloudModel', ''), onChange: x => set('cloudModel', x) })) : null);
    }

    function statusCard() {
      return h('div.und-block', h('div.und-head', 'What it’s doing'), chip(),
        ui.toggle({ label: 'Work in the background while the computer is quiet', hint: 'Small slices, only when no job is running, the processor is free, the panel is responsive and the battery isn’t low. It stops the moment you start something. Nothing opens Media Encoder or any window.', value: U().backgroundOn(), onChange: x => set('background', x) }),
        ui.toggle({ label: 'Let big jobs run in the background too', hint: 'Off: looking at more than about 20 minutes’ worth of work is scheduled (Overnight prep, or Run now) instead of started while you edit. On: it works through it in quiet moments.', value: US.settings.get('understand.heavyInBackground', false) === true, onChange: x => set('heavyInBackground', x) }));
    }

    function modelsCard() {
      const Mo = M(), rt = Mo.runtime, vNow = US.settings.get('understand.visionModel', ''), lNow = US.settings.get('understand.listenModel', 'builtin') || 'builtin';
      const own = US.footage && US.footage.visionModel && US.footage.visionModel();
      const have = Mo.list().filter(m => Mo.installed(m.id));
      const visionSel = ui.select({ options: [{ value: '', label: have.some(m => m.use.includes('vision')) || own ? 'Choose…' : 'None yet – download one below' }].concat(have.filter(m => m.use.includes('vision')).map(m => ({ value: m.id, label: m.name }))).concat(own ? [{ value: 'own', label: `${own} – your own model (Ollama / LM Studio)` }] : []), value: vNow, onChange: x => set('visionModel', x) });
      const listenSel = ui.select({ options: [{ value: 'builtin', label: 'Built-in listening (no download)' }].concat(have.filter(m => m.use.includes('listening')).map(m => ({ value: m.id, label: `Built-in + ${m.name} (experimental)` }))), value: lNow, onChange: x => set('listenModel', x) });
      const rows = Mo.list().map(m => {
        const here = Mo.installed(m.id), size = Mo.fmtSize(Mo.totalBytes(m)), extra = !rt.installed() && rt.supported() ? ` + ${Mo.fmtSize(rt.bytes())} helper, once` : '';
        return h('div.list-row',
          h('span.swatch', { style: { background: here ? 'var(--ok)' : 'var(--surface-3)' }, title: here ? 'On this computer' : 'Not downloaded' }),
          h('div.list-main',
            h('div.list-title', m.name, m.best ? ui.pill('recommended') : null, here && (vNow === m.id || lNow === m.id) ? ui.pill('in use', 'var(--ok)') : null),
            h('div.list-sub', `${m.use.includes('listening') ? 'Sees and listens' : 'Sees'} · ${size} · needs ${m.memory} · ${m.licence}`),
            h('div.list-sub', m.what),
            h('div.list-sub', h('a', { href: '#', onclick: e => { e.preventDefault(); US.app.openUrl ? US.app.openUrl(m.source) : US.host.openUrl(m.source); } }, 'Where it comes from'))),
          h('div.sel-right',
            here ? ui.button('Delete', { small: true, kind: 'ghost', title: `Frees ${size} on this computer`, onClick: async () => { if (await ui.confirm({ title: `Delete ${m.name} from this computer?`, text: `It frees ${size}. You can download it again later.`, ok: 'Delete', danger: true })) { Mo.remove(m.id); draw(); } } })
              : ui.button(`Download (${size}${extra})`, { small: true, kind: 'primary', disabled: !rt.supported(), title: rt.supported() ? `From ${new URL(m.files[0].url).hostname}, checked before it’s used` : 'The helper that runs models isn’t available for this kind of computer', onClick: () => US.jobs.run({ title: `Downloading ${m.name}`, tool: 'settings' }, job => Mo.download(m.id, job)).then(draw) })));
      });
      const p = Mo.pendingUpdates(), chk = US.settings.get('understand.updateCheck', null);
      return h('div.und-block', h('div.und-head', 'Models on this computer'),
        h('div.field-hint', 'Nothing here is downloaded until you press Download – the size is on the button. Each comes straight from its makers’ page over HTTPS and is only used once its checksum matches. They run in a small helper program (llama.cpp, open source) that Ultra Studio starts hidden on this computer only and stops when it’s idle.'),
        h('div.grid2', ui.field('Vision model – looks at the shots', visionSel), ui.field('Listening', listenSel, 'Built in: music, applause, silence, wind, noise and a raised voice, measured here. A listening model adds laughter and tone of voice, 30 seconds at a time.')),
        h('div.list', rows),
        rt.supported() ? null : ui.note('The helper isn’t published for this kind of computer, so models can’t be run by Ultra Studio here. A vision model you have in Ollama or LM Studio (Settings › AI › Footage) still works, and so does the cloud.', 'warn'),
        h('div.row', h('span.field-hint.grow', `Kept in: ${US.fsx.pretty(Mo.dir())}${rt.installed() ? ` · helper ${rt.info().version}` : ''}`),
          ui.button(US.fsx.isWin ? 'Open folder' : 'Show in Finder', { small: true, kind: 'ghost', onClick: () => (US.app.reveal ? US.app.reveal(Mo.dir()) : require('child_process').exec((US.fsx.isWin ? 'explorer "' : 'open "') + Mo.dir() + '"')) }),
          ui.button('Move…', { small: true, kind: 'ghost', title: 'Keep the models on another disk', onClick: async () => { const d = await ui.promptText({ title: 'Folder for the models', label: 'A folder on a disk with room (models already downloaded stay where they are – move them by hand or download again)', value: Mo.dir() }); if (d && require('fs').existsSync(d)) set('modelsDir', d); else if (d) ui.toast({ type: 'warn', title: 'That folder doesn’t exist', text: d }); } })),
        ui.toggle({ label: 'Update models automatically', hint: 'Off (as it comes): a newer model is a big download, and nothing big downloads unasked – you’re told here when one is available. On: new versions of the models you have are downloaded by themselves, only when the computer is quiet and plugged in, and the old ones are removed.', value: Mo.autoUpdate(), onChange: x => set('autoUpdate', x) }),
        p.length ? ui.note(`Updates available: ${p.map(u => `${u.name} (${Mo.fmtSize(u.bytes)})`).join(', ')}.`, 'info') : null,
        h('div.row', h('span.field-hint.grow', chk ? `Last checked ${new Date(chk.at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}${chk.ok ? (p.length ? '' : ' – up to date') : ' – couldn’t be reached'}.` : 'Not checked yet. Checking reads a short list from Ultra Studio’s page on GitHub; nothing about you is sent.'),
          p.length ? ui.button(`Download ${US.plural(p.length, 'update')}`, { small: true, kind: 'primary', onClick: () => US.jobs.run({ title: 'Updating the models', tool: 'settings' }, job => Mo.applyUpdates(job)).then(draw) }) : null,
          ui.button('Check for updates', { small: true, onClick: async () => { const r = await Mo.checkUpdates(); if (!r.checked) ui.toast({ type: 'warn', title: 'Couldn’t check for model updates', text: 'Check the internet connection and try again.', detail: r.why }); draw(); } })));
    }

    function draw() {
      US.clear(box);
      if (!U() || !M()) { box.append(ui.note('Seeing and hearing isn’t available in this copy.', 'warn')); return; }
      box.append(routeCard(), statusCard(), modelsCard());
    }
    draw();
    US.bus.on('context', () => { if (box.isConnected !== false) draw(); });
    // Settings puts it in its own closed dropdown, in a [data-section="understand"] box (US.tools.open('settings', {section: 'understand'}))
    return box;
  }

  /* automatic updates: checked once a day at most, taken only when the editor asked for that, the computer is quiet and plugged in */
  async function autoUpdateTick() {
    const Mo = M(); if (!Mo || !Mo.autoUpdate() || US.jobs.current) return;
    const chk = US.settings.get('understand.updateCheck', null);
    if (!chk || Date.now() - chk.at > 86400e3) await Mo.checkUpdates();
    if (!Mo.pendingUpdates().length || !U().calm().ok) return;
    let plugged = true; try { if (navigator.getBattery) plugged = (await navigator.getBattery()).charging; } catch (e) { plugged = true; }
    if (plugged) await US.jobs.run({ title: 'Updating the models', tool: 'settings' }, job => Mo.applyUpdates(job));
  }
  US.bus.on('ready', () => { const t = setInterval(() => autoUpdateTick().catch(() => {}), 30 * 60000); if (t.unref) t.unref(); });

  US.understandUI = { chip, confirmCloud, numbers, estimateText, runNow, addToOvernight, create, autoUpdateTick };
  US.settingsSections.register({ id: 'understand', title: 'Vision & listening models', order: 35, create });

  /* Ask, recipes and the offline parser: “look at and listen to my footage” */
  US.actions.register({
    id: 'understand.run', tool: 'settings', title: 'Look at and listen to the footage', changes: false,
    describe: 'Builds the footage understanding for every clip not yet done: what each shot shows over time, reactions and gestures, and what can be heard (music, applause, laughter, wind, a raised voice). On this computer or – only when chosen for this project in Settings › Vision & listening models – in the cloud.',
    examples: ['look at and listen to my footage', 'understand the footage'],
    match: t => (/\b(understand|listen to|watch|look at and listen)\b.*\b(footage|clips|rushes|project)\b/i.test(t) && !/\binterview/i.test(t) ? { _score: 2.4 } : null),
    run: async (p, job) => { if (U().route() === 'cloud' && !US.ai.mediaOn()) throw new US.UserError('AI_FAILED', { title: 'The cloud isn’t switched on for this project.', action: 'Settings › Vision & listening models.' }); return U().runAll(job, { heavy: true }); }
  });
  US.actions.register({
    id: 'understand.search', tool: 'settings', title: 'Find moments by what’s seen or heard', changes: false,
    describe: 'Searches the footage understanding (shot descriptions, reactions, gestures, sounds) and lists the matching moments with clip and time.',
    params: { query: { type: 'string', default: '', desc: 'What to look for, in plain words: “people laughing”, “the market at dusk”' } },
    examples: ['find shots where people are laughing', 'where is the applause'],
    match: () => null,
    run: async p => { const r = await U().search(p.query, { limit: 30 }); return { summary: r.length ? `${US.plural(r.length, 'moment')} found:\n` + r.map(x => `${x.name} ${US.fmtDur(x.start)}–${US.fmtDur(x.end)}\t${x.text}`).join('\n') : 'Nothing seen or heard matches that (clips not yet looked at can’t be found this way).', results: r }; }
  });
})();
