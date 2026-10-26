/* JMG Ultra Studio – Overnight prep: runs the long jobs on a project unattended (Story transcripts, themes, moments and
   the interview log, Selects analysis of all the footage) and leaves a morning report on Home. Nothing in the edit is changed; any AI use
   comes out of a limit agreed before it starts, so it never stops to ask in the night. */
(function () {
  'use strict';
  const US = window.US, h = US.h, ui = US.ui;

  const STEPS = [
    { id: 'transcripts', label: 'Read Premiere’s transcripts', hint: 'Story · saves the project first' },
    { id: 'themes', label: 'Find themes', hint: 'Story · themes you added yourself are kept' },
    { id: 'moments', label: 'Find moments', hint: 'Story · bloopers, funny, off camera, poignant' },
    { id: 'log', label: 'Write the interview log', hint: 'Story · a Word document: each interview’s themes, strongest lines and moments (with AI, a short summary too)' },
    { id: 'selects', label: 'Analyse all the footage for Selects', hint: 'Makes Media Encoder copies of clips the panel can’t read; afterwards Selects grades any bin instantly' }
  ];
  const settings = () => { const o = Object.assign({ steps: ['transcripts', 'themes', 'moments', 'log', 'selects'], useAI: false, limit: 2, footage: 'any' }, US.settings.get('overnight', {})); if (!o.anyFirst) Object.assign(o, { footage: 'any', anyFirst: true }); return o; };

  /** Video clips worth analysing: everything except Ultra Studio's own bins, subclips, stills and offline media. */
  function footageOf(items) {
    return items.filter(it => it && it.kind === 'video' && !it.offline && !it.subclip && !/^JMG Ultra Studio\b/.test(it.bin || '') && !/\.(png|jpe?g|tiff?|psd|gif|bmp)$/i.test(it.path || ''));
  }
  async function allFootage(job) {
    const root = (await US.host.call('listBins'))[0];
    const list = await US.host.call('binList', { binId: root.id, kinds: ['video'], recursive: true });
    const out = [];
    for (let i = 0; i < list.length; i += 40) {
      job.check();
      job.set({ who: 'premiere', msg: `Listing the footage · ${Math.min(list.length, i + 40)} of ${list.length}` });
      out.push(...await US.host.call('itemsInfo', { ids: list.slice(i, i + 40).map(x => x.id) }));
    }
    return footageOf(out);
  }

  const RUNNERS = {
    async transcripts(job) { return US.story.readPremiereTranscripts(job); },
    async themes(job, o) { return US.actions.get('story.themes').run({ useAI: o.useAI && US.ai && US.ai.available() }, job); },
    async moments(job, o) {
      const r = await US.story.findMoments(job, { useAI: o.useAI && US.ai && US.ai.available() });
      return r && r.summary ? r : { summary: 'Moments found' };
    },
    async log(job, o) { return US.story.interviewLog(job, { summaries: !!(o.useAI && US.ai && US.ai.available()), format: 'docx' }); },
    async selects(job, o) {
      const items = await allFootage(job);
      if (!items.length) throw new US.UserError('NOTHING_FOUND', { title: 'There’s no video footage in this project yet.' });
      // the kind of footage chosen here stays (Selects shows the overnight result graded with it);
      // copies are forced on just for the run, and the editor's own choice is put back before saving
      const S = US.selects.state.settings, keepCopies = S.autoCopies;
      Object.assign(S, { footage: o.footage || S.footage, autoCopies: true });
      try { return await US.selects.analyse(items, 'All footage (overnight)', job); } finally { S.autoCopies = keepCopies; US.selects.saveSettings && US.selects.saveSettings(); }
    }
  };

  /** Keep the computer awake while it runs, ending with Premiere's panel process if anything goes wrong.
      Mac: caffeinate. Windows: a hidden PowerShell holding SetThreadExecutionState(ES_CONTINUOUS | ES_SYSTEM_REQUIRED). */
  function stayAwake() {
    const cp = require('child_process');
    let p = null;
    try {
      if (process.platform === 'darwin') p = cp.spawn('caffeinate', ['-i', '-w', String(process.pid)], { stdio: 'ignore' });
      else if (process.platform === 'win32') {
        const ps = `Add-Type -Namespace UltraStudio -Name Power -MemberDefinition '[DllImport("kernel32.dll")] public static extern uint SetThreadExecutionState(uint f);'; ` +
          `[UltraStudio.Power]::SetThreadExecutionState(0x80000001) | Out-Null; while (Get-Process -Id ${process.pid} -ErrorAction SilentlyContinue) { Start-Sleep -Seconds 30 }`;
        p = cp.spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-Command', ps], { stdio: 'ignore', windowsHide: true });
      }
    } catch (e) { p = null; }
    return () => { try { p && p.kill(); } catch (e) { /* gone */ } };
  }

  /** Run the chosen steps one after another; one failing doesn't stop the rest. -> report */
  async function run(job, o = settings()) {
    if (!US.ctx.project) await US.refreshContext();
    if (!US.ctx.project) throw new US.UserError('NO_PROJECT');
    const steps = STEPS.filter(s => o.steps.includes(s.id));
    if (!steps.length) throw new US.UserError('NOTHING_FOUND', { title: 'No steps ticked.', action: 'Tick at least one thing to prepare.' });
    if (o.useAI && US.ai && US.ai.available() && US.ai.provider() === 'claude') {
      // agreed now, while someone is there; nothing asks later
      const ok = await ui.confirm({ title: `Allow up to $${(+o.limit).toFixed(2)} of Claude tonight?`, text: 'Overnight prep won’t stop to ask. AI steps that would go over this limit are skipped and listed in the morning report. Only the text of transcript lines is sent.', ok: 'Allow and start' });
      if (!ok) throw new US.UserError('CANCELLED');
      US.ai.setBudget(+o.limit);
    }
    const release = stayAwake(), t0 = Date.now();
    const report = { project: US.ctx.project.name, started: t0, finished: null, steps: [], ai: o.useAI ? US.ai && US.ai.label() : '' };
    try {
      for (let i = 0; i < steps.length; i++) {
        const s = steps[i], s0 = Date.now();
        job.range(i / steps.length, (i + 1) / steps.length);
        job.set({ msg: `${i + 1} of ${steps.length}: ${s.label}` });
        try {
          const r = await RUNNERS[s.id](job, o);
          report.steps.push({ id: s.id, label: s.label, ok: true, summary: (r && r.summary) || 'Done', secs: (Date.now() - s0) / 1000, file: (r && r.file) || undefined });
        } catch (e) {
          const x = US.errors.explain(e);
          if (x.code === 'CANCELLED' && job.cancelled) { report.steps.push({ id: s.id, label: s.label, ok: false, summary: 'Stopped', secs: (Date.now() - s0) / 1000 }); break; }
          report.steps.push({ id: s.id, label: s.label, ok: false, summary: x.title, action: x.action, secs: (Date.now() - s0) / 1000 });
          US.log('warn', `Overnight prep: ${s.label} – ${x.title}`, x.detail, 'overnight');
        }
      }
    } finally {
      release();
      if (US.ai && US.ai.endBudget) { const left = US.ai.budgetLeft(); if (left != null) report.aiSpent = Math.max(0, +o.limit - left); US.ai.endBudget(); }
      report.finished = Date.now();
      US.settings.set('overnight.report', report);
      US.bus.emit('overnight-report', report);
    }
    job.range(0, 1);
    const ok = report.steps.filter(s => s.ok).length;
    US.tools.open('home');
    return { summary: `Overnight prep: ${ok} of ${report.steps.length} done in ${US.fmtDur((report.finished - t0) / 1000)}`, report };
  }

  US.actions.register({
    id: 'overnight.run', tool: 'home', title: 'Overnight prep: get the project ready', changes: false,
    describe: 'Reads Premiere’s transcripts, finds themes and moments, and analyses all the footage for Selects, one after another, leaving a report on Home.',
    examples: ['get this project ready overnight', 'prepare everything while I’m away'],
    match: t => (/\b(overnight|while i'?m away|over ?night|prepare (everything|the project))\b/i.test(t) ? {} : null),
    run: (p, job) => run(job)
  });

  /* ---------- Home cards ---------- */
  function reportCard() {
    const r = US.settings.get('overnight.report');
    if (!r || r.dismissed) return null;
    const card = ui.card(
      h('div.card-title', 'Overnight prep', h('span.right', `${r.project} · ${new Date(r.finished || r.started).toLocaleString('en-GB', { weekday: 'short', hour: '2-digit', minute: '2-digit' })} · ${US.fmtDur(((r.finished || Date.now()) - r.started) / 1000)}`)),
      ui.list(r.steps.map(s => ({ title: s.label, sub: s.summary + (s.action && !s.ok ? ` – ${s.action}` : ''), right: US.fmtDur(s.secs), color: s.ok ? 'var(--ok)' : 'var(--warn)' }))),
      r.aiSpent != null ? h('div.field-hint', `AI used about $${r.aiSpent.toFixed(2)} (${r.ai}).`) : null,
      ...r.steps.filter(s => s.ok && s.file && US.fsx.exists(s.file)).map(s => h('div.row', h('span.field-hint.grow', US.basename(s.file)), ui.button('Open', { small: true, onClick: () => US.story.openFile(s.file) }))),
      h('div.row', ui.button('Open Story', { small: true, icon: 'story', onClick: () => US.story && US.story.open('themes') }), ui.button('Open Selects', { small: true, onClick: () => US.tools.open('selects') }),
        ui.button('Dismiss', { small: true, kind: 'ghost', onClick: () => { US.settings.set('overnight.report', Object.assign({}, r, { dismissed: true })); card.remove(); } })));
    return card;
  }
  function setupCard() {
    const o = settings(), save = () => US.settings.set('overnight', o);
    const toggles = STEPS.map(s => ui.toggle({ label: s.label, hint: s.hint, value: o.steps.includes(s.id), onChange: x => { o.steps = x ? Array.from(new Set(o.steps.concat(s.id))) : o.steps.filter(y => y !== s.id); save(); } }));
    const footage = ui.select({ options: Object.entries((US.vision && US.vision.FOOTAGE) || {}).map(([k, f]) => ({ value: k, label: f.label })), value: o.footage, onChange: x => { o.footage = x; save(); } });
    const aiOn = US.ai && US.ai.available();
    const limit = ui.select({ options: [0.5, 1, 2, 5, 10].map(v => ({ value: String(v), label: `Up to $${v.toFixed(2)}` })), value: String(o.limit), onChange: x => { o.limit = +x; save(); } });
    const limitF = ui.field('AI limit for the night', limit, 'Asked once when you press Start; nothing asks later.');
    const useAI = aiOn ? ui.toggle({ label: `Use ${US.ai.label()} for themes, moments and interview summaries`, value: o.useAI, hint: 'Sharper themes and checked moments. Off: Ultra Studio’s own grouping, free.', onChange: x => { o.useAI = x; save(); limitF.classList.toggle('hidden', !x || US.ai.provider() !== 'claude'); } }) : null;
    limitF.classList.toggle('hidden', !(aiOn && o.useAI && US.ai.provider() === 'claude'));
    return ui.section('Overnight prep – get this project ready while you’re away', [
      h('div.field-hint', 'Runs the long jobs one after another, keeps the computer awake, and leaves a report here. Your edit isn’t changed. Leave Premiere open with this project.'),
      ...toggles, ui.field('Kind of footage (for Selects)', footage), useAI, limitF,
      ui.actionButton('Start overnight prep', () => US.jobs.run({ title: 'Overnight prep', tool: 'home' }, job => run(job, settings())), { icon: 'check' })
    ], { open: false });
  }

  US.overnight = { STEPS, run, footageOf, reportCard, setupCard, settings };
})();
