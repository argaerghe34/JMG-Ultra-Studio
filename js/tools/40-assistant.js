/* JMG Ultra Studio – Assistant: say what you want in plain English. Built-in commands work with no key;
   with a Claude or Gemini key it plans anything the tools can do. It always shows the plan and waits for Run. */
(function () {
  'use strict';
  const US = window.US, h = US.h, ui = US.ui;

  /* ---------- planning (pure, unit-tested) ---------- */
  /** Resolve's words back to the Premiere words the actions' match() expect ("timeline" also means a sequence). */
  function premiereWords(text) {
    return text.replace(/\b([Tt])imelines\b/g, (m, t) => (t === 'T' ? 'S' : 's') + 'equences').replace(/\b([Tt])imeline\b/g, (m, t) => (t === 'T' ? 'S' : 's') + 'equence')
      .replace(/\bMedia Pool\b/gi, 'Project panel').replace(/\b(Resolve’s |the )?render queue\b/gi, 'Media Encoder').replace(/\bcompound clips?\b/gi, m => /s$/i.test(m) ? 'nested sequences' : 'nested sequence');
  }
  /** Offline: every action's match(); best score wins. Returns {steps, alternatives}. In Resolve, a request in
      Resolve's words that matches nothing is tried once more in Premiere's. */
  function matchOffline(text) {
    const r = matchWords(text);
    if (r.steps.length || r.alternatives.length || !US.app.is('resolve')) return r;
    const again = premiereWords(text);
    return again === text ? r : matchWords(again);
  }
  function matchWords(text) {
    const found = [];
    for (const a of US.actions.list()) {
      if (typeof a.match !== 'function') continue;
      let p = null;
      try { p = a.match(text); } catch (e) { p = null; }
      if (!p) continue;
      const score = typeof p._score === 'number' ? p._score : 1;
      const params = Object.assign({}, p); delete params._score;
      found.push({ action: a.id, params, score });
    }
    found.sort((x, y) => y.score - x.score);
    if (!found.length) return { steps: [], alternatives: [] };
    const top = found.filter(f => f.score === found[0].score);
    return { steps: top.length === 1 ? [{ action: top[0].action, params: top[0].params }] : [], alternatives: top.length > 1 ? top : found.slice(1, 4) };
  }

  /** Rough closeness of a request to each action's examples, for "did you mean". */
  const SMALL = new Set('the a an and or of to in on for with from into my me it this that these those all any some please can could you would like want make do get put'.split(' '));
  function suggest(text, n = 4) {
    const T = US.transcript;
    const words = s => (T ? T.tokens(s) : String(s).toLowerCase().split(/\W+/)).filter(w => w.length > 2 && !SMALL.has(w)).map(w => (T ? T.stem(w) : w));
    const toks = words(text);
    const near = (a, b) => a === b || (a.length >= 5 && b.length >= 5 && a.slice(0, 5) === b.slice(0, 5));
    const scored = [];
    for (const a of US.actions.list()) for (const ex of a.examples || []) {
      const et = words(ex);
      const hit = et.filter(w => toks.some(t => near(t, w))).length;
      if (hit) scored.push({ ex, a, s: hit / Math.sqrt(et.length) });
    }
    scored.sort((x, y) => y.s - x.s);
    const seen = new Set();
    return scored.filter(x => (seen.has(x.a.id) ? false : seen.add(x.a.id))).slice(0, n);
  }

  /** What the actions do, in the editor's own words (US.say: "timeline" in Resolve), so the AI's reply uses them too. */
  function catalogue() {
    return US.actions.list().map(a => ({
      id: a.id, tool: (US.tools.get(a.tool) || {}).name || a.tool, title: US.say(a.title), describe: US.say(a.describe || ''), changesProject: !!a.changes,
      params: Object.fromEntries(Object.entries(a.params || {}).map(([k, p]) => [k, { type: p.type, default: p.default, options: p.options, desc: p.desc }]))
    }));
  }
  function planSchema() {
    return {
      type: 'object', additionalProperties: false, required: ['reply', 'steps'],
      properties: {
        reply: { type: 'string' },
        steps: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['action', 'paramsJson'], properties: { action: { type: 'string', enum: US.actions.list().map(a => a.id) }, paramsJson: { type: 'string' } } } }
      }
    };
  }
  /** Ask the AI for a plan; returns {reply, steps:[{action, params}], rejected:[...]}. Only registered actions survive. */
  async function planWithAI(text, job) {
    const ctx = US.ctx || {};
    const system = [
      US.app.is('resolve')
        ? 'You are the Assistant inside JMG Ultra Studio, a Workflow Integration panel in DaVinci Resolve Studio used by a video editor. Use Resolve’s words: timeline (not sequence), Media Pool, bin, render queue.'
        : 'You are the Assistant inside JMG Ultra Studio, a panel in Adobe Premiere Pro used by a video editor.',
      'Turn the editor’s request into a short plan of steps using ONLY the actions listed below (by id). Use as few steps as possible, in the right order.',
      'Each step has "action" (an id from the list) and "paramsJson" (a JSON object string with only that action’s params; leave out params to use defaults).',
      'If nothing in the list can do what was asked, return no steps and say so plainly in "reply", suggesting the closest thing it can do.',
      '"reply" is one or two short, friendly sentences in British English describing what you will do. Never claim to have done anything – the editor presses Run first.',
      US.say('Actions that change the project always work on a copy or make new bins and sequences; mention that if relevant.'),
      '', 'ACTIONS:', JSON.stringify(catalogue())
    ].join('\n');
    const user = `Project: ${ctx.project ? ctx.project.name : '(none open)'}. ${US.say('Active sequence')}: ${ctx.sequence ? `${ctx.sequence.name} (${US.fmtDur(ctx.sequence.duration)})` : '(none)'}. ${US.say('Clips selected in the Project panel')}: ${ctx.selection || 0}.\n\nRequest: ${text}`;
    job && job.set({ who: 'ai', msg: `${US.ai.label()} is planning your request` });
    // the instructions and action list are the same every time: cached, so follow-up requests read them at a fraction of the price
    const r = await US.ai.json({ system: [{ text: system, cache: '1h' }], user, schema: planSchema(), maxTokens: 4000, effort: 'low', fast: true, feature: 'Assistant plan' });
    return validatePlan(r);
  }
  function validatePlan(r) {
    const steps = [], rejected = [];
    for (const s of (r && r.steps) || []) {
      const a = US.actions.get(s.action);
      if (!a) { rejected.push(s.action); continue; }
      let params = {};
      try { params = s.paramsJson ? JSON.parse(s.paramsJson) : (s.params || {}); } catch (e) { params = {}; }
      const clean = {};
      for (const k of Object.keys(a.params || {})) if (params && params[k] != null) clean[k] = params[k];
      steps.push({ action: a.id, params: US.actions.normalize(a, clean) });
    }
    return { reply: String((r && r.reply) || ''), steps: steps.slice(0, 8), rejected };
  }
  function describeStep(s) {
    const a = US.actions.get(s.action);
    const ps = Object.entries(s.params || {}).filter(([k, v]) => v !== '' && v != null && a.params[k] && v !== a.params[k].default)
      .map(([k, v]) => {
        if (typeof v === 'string') return `“${v}”`;
        const d = (a.params[k].desc || k).split(/[,(–]/)[0].trim();
        const label = d.length <= 28 ? d.toLowerCase() : k.replace(/([A-Z])/g, ' $1').toLowerCase();
        return `${label}: ${typeof v === 'boolean' ? (v ? 'yes' : 'no') : v}`;
      });
    return { tool: (US.tools.get(a.tool) || {}).name || '', title: a.title, detail: ps.join(' · '), changes: !!a.changes };
  }

  US.assistant = { matchOffline, premiereWords, suggest, planWithAI, validatePlan, planSchema, catalogue, describeStep };

  /* ---------- the screen ---------- */
  US.tools.register({
    id: 'assistant', name: 'Assistant', short: 'Ask', icon: 'ask', order: 40,
    hostFns: ['editRead', 'editSelection', 'editApply', 'cloneSequence', 'setLabels', 'renameItem', 'moveItems', 'binItems'],
    blurb: 'Say what you want in plain English – run a tool, or ask anything about your interviews.',
    create() {
      const v = ui.toolView({ icon: 'ask', title: 'Assistant', blurb: 'Tell it what you want. It shows a plan first and only acts when you press Run.' });
      const log = h('div.chat');
      const PLACEHOLDER = { auto: 'e.g. cut the silences · markers on every beat · find the best shots in Concert · check the cut', interviews: 'e.g. every story about Grandma, in order · where do Ruth and Sam disagree? · a 45-second opening about why they came', edit: 'e.g. a cross dissolve on every clip on V1 · punch in 110% where the speaker changes · colour the drone clips green' };
      // Anything: commands, and questions about the interviews when the AI sees that's what you mean; My interviews: straight to the interviews
      let mode = US.settings.get('assistant.mode', 'auto');
      const modeSel = ui.segmented({ options: [{ value: 'auto', label: 'Anything', title: 'Run a tool, or ask about your interviews' }, { value: 'interviews', label: 'My interviews', title: 'Ask anything about what your interviews say – answered with clips you check before anything is built' }, { value: 'edit', label: 'Edit', title: 'Change your sequence or project in plain English – transitions, effects, framing, labels, markers… – checked before it runs, on a copy' }], value: mode, onChange: x => { mode = x; US.settings.set('assistant.mode', x); input.placeholder = PLACEHOLDER[x]; whereBar.classList.toggle('hidden', x !== 'edit'); greet(); } });
      modeSel.classList.add('chat-mode');
      /* Edit: where it acts */
      const E = US.editAsk;
      let where = US.settings.get('editAsk.where', 'sequence'), whereBin = US.settings.get('editAsk.bin', ''), editConv = null, bins = [];
      const whereSeg = ui.segmented({ options: [{ value: 'sequence', label: 'This sequence' }, { value: 'selection', label: 'Selected clips' }, { value: 'transcripts', label: 'Transcript lines' }, { value: 'bin', label: 'A bin' }, { value: 'project', label: 'Whole project' }], value: where, onChange: x => { where = x; US.settings.set('editAsk.where', x); editConv = null; drawWhere(); } });
      const binSel = ui.select({ options: [], placeholder: 'Choose a bin…', onChange: x => { whereBin = x; US.settings.set('editAsk.bin', x); editConv = null; } });
      const whereNote = h('div.field-hint'), whereBar = h('div.edit-where', h('div.field-label', 'Where'), whereSeg, binSel, whereNote);
      function drawWhere() {
        binSel.classList.toggle('hidden', where !== 'bin');
        if (where === 'bin' && !bins.length) US.host.call('listBins').then(b => { bins = b.filter(x => x.path !== '(Project root)'); binSel.setOptions(bins.map(x => ({ value: x.id, label: x.path })), bins.some(x => x.id === whereBin) ? whereBin : ''); }).catch(() => {});
        const seq = US.ctx.sequence ? `“${US.ctx.sequence.name}”` : 'the open sequence (none open)';
        whereNote.textContent = { sequence: `Every clip in ${seq}. Edits run on a copy unless you say otherwise.`, selection: US.app.is('resolve') ? 'Resolve doesn’t say which clips are selected: the clip under the playhead is used.' : `Only the clips selected in ${seq}.`, transcripts: `The transcribed lines heard in ${seq} – for markers, text, cuts or the clips under them.`, bin: 'The clips in the bin (and bins inside it). Labels, names, bins, markers or a new sequence.', project: 'Every clip in the project. Labels, names, bins, markers or a new sequence.' }[where];
      }
      const scopeNow = () => ({ where, seqId: US.ctx.sequence && US.ctx.sequence.id, binId: whereBin, binName: (bins.find(b => b.id === whereBin) || {}).path || '' });
      whereBar.classList.toggle('hidden', mode !== 'edit'); drawWhere();
      US.bus.on('context', US.debounce(() => { if (mode === 'edit') drawWhere(); }, 500));
      const input = h('textarea.input.chat-input', { rows: 2, placeholder: PLACEHOLDER[mode] || PLACEHOLDER.auto });
      const send = ui.button('Send', { kind: 'primary', icon: 'chevron', onClick: () => submit() });
      input.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); } });
      v.body.append(modeSel, whereBar, log, h('div.chat-bar', input, send));
      const history = [];

      function bubble(who, ...kids) {
        const b = h('div.bubble.' + who.replace(/ /g, '.'), kids);
        log.appendChild(b); history.push(b);
        while (history.length > 40) history.shift().remove();
        b.scrollIntoView({ block: 'end', behavior: 'smooth' });
        return b;
      }
      function chips(list) { return h('div.chat-chips', list.map(x => h('button.chip', { onclick: () => { input.value = US.say(x); submit(); } }, x))); }
      function exampleChips(n = 10) {
        const ex = []; const per = new Map();
        for (const a of US.actions.list()) for (const e of (a.examples || []).slice(0, 1)) { if (!per.has(a.tool)) per.set(a.tool, 0); if (per.get(a.tool) < 2) { ex.push(e); per.set(a.tool, per.get(a.tool) + 1); } }
        return ex.slice(0, n);
      }
      const ASK_EXAMPLES = ['Every story about family, in the order it happened', 'Where do the interviewees disagree?', 'A 45-second opening about why they came', 'Who talks about their parents, and what do they say?', 'The funniest moments, best first'];
      /** What the AI reads for an ask, and what it costs (the shared transcript). */
      function readsLine() { try { US.story.loadState(); return US.story.contextLine(); } catch (e) { return ''; } }
      const EDIT_EXAMPLES = ['A cross dissolve on every cut on V1', 'Punch in to 110% on each interview clip', 'Dip to black where the speaker changes', 'Lower thirds with the speaker’s name the first time each person talks', 'Audio fades of 12 frames on every music clip', 'Colour every clip longer than 20 seconds orange'];
      function greet() {
        US.clear(log); history.length = 0;
        const aiOn = US.ai && US.ai.available();
        if (mode === 'edit') {
          editConv = null;
          bubble('bot', h('div', 'Tell me what to change. I read the sequence (or bin, or project) as text – clip names, times, tracks, labels, effects and, if transcribed, who speaks – and show you a plan. Nothing changes until you press Run, and sequence edits go on a copy.'), chips(EDIT_EXAMPLES),
            aiOn ? h('div.field-hint', `Planned by ${US.ai.label()} – only text is sent, never footage.${US.app.is('resolve') ? ' In Resolve: framing, opacity, colours, on/off, deleting and markers (Resolve doesn’t let add-ons add transitions, effects or text).' : ''}`) : h('div.field-hint', 'This needs AI: add a Claude or Gemini key in Settings.'));
          return;
        }
        if (mode === 'interviews') {
          const earlier = (US.story && US.story.asks ? (() => { try { return US.story.asks(); } catch (e) { return []; } })() : []).slice(0, 4);
          bubble('bot', h('div', 'Ask anything about what your interviews say. I answer in words and with clips, grouped – nothing changes in Premiere until you choose how it lands.'), chips(ASK_EXAMPLES),
            aiOn ? h('div.field-hint', readsLine() || 'Only the text of the transcripts is sent – never footage.') : h('div.field-hint', 'This needs AI: add a Claude or Gemini key in Settings.'),
            earlier.length ? h('div', h('div.field-hint', 'Earlier:'), h('div.chat-chips', earlier.map(a => h('button.chip', { onclick: () => { bubble('me', a.request); showAsk(a); } }, US.storyAsk.title(a.request))))) : null);
          return;
        }
        bubble('bot', h('div', 'Hi! I can run any JMG Ultra Studio tool for you. Try one of these:'), chips(exampleChips()),
          h('div.field-hint', aiOn ? `Anything else goes to ${US.ai.label()} (only your words are sent – never footage).` : 'These work without any AI. Add a Claude or Gemini key in Settings and I’ll understand free-form requests too.'));
      }

      async function submit() {
        const text = input.value.trim();
        if (!text) return;
        input.value = '';
        bubble('me', text);
        if (/^(help|what can you do\??|\?)$/i.test(text)) { showAll(); return; }
        if (mode === 'interviews') { runAsk(text); return; }
        if (mode === 'edit') { runEdit(text); return; }
        const off = matchOffline(text);
        if (off.steps.length === 1 && off.steps[0].action === 'edit.ask' && US.ai && US.ai.available()) { runEdit(text, { where: 'sequence' }); return; }
        if (off.steps.length) { showPlan({ reply: 'Here’s what I’ll do:', steps: off.steps }); return; }
        if (off.alternatives.length > 1) {
          bubble('bot', h('div', 'That could mean a few things. Which one?'), h('div.chat-chips', off.alternatives.map(alt => { const a = US.actions.get(alt.action); return h('button.chip', { onclick: () => showPlan({ reply: 'Here’s what I’ll do:', steps: [{ action: alt.action, params: alt.params }] }) }, a.title); })));
          return;
        }
        if (US.ai && US.ai.available()) {
          const thinking = bubble('bot', h('div.row', h('div.spinner.small'), h('span.muted', `${US.ai.label()} is thinking…`)));
          const plan = await US.jobs.run({ title: 'Planning your request', tool: 'assistant', who: US.jobs.WHO.ai }, job => planWithAI(text, job));
          thinking.remove();
          if (!plan) { bubble('bot', h('div', 'I couldn’t reach the AI just now. The built-in commands still work:'), chips(exampleChips(6))); return; }
          if (!plan.steps.length) { bubble('bot', h('div', plan.reply || 'I can’t do that with the tools I have.'), suggest(text).length ? chips(suggest(text).map(x => x.ex)) : null); return; }
          // a question about the interviews changes nothing: answer it straight away
          if (plan.steps.length === 1 && plan.steps[0].action === 'story.ask') { runAsk(plan.steps[0].params.request || text); return; }
          if (plan.steps.length === 1 && plan.steps[0].action === 'edit.ask') { runEdit(plan.steps[0].params.request || text, { where: plan.steps[0].params.where || 'sequence' }); return; }
          showPlan(plan);
          return;
        }
        const near = suggest(text);
        bubble('bot', h('div', 'I didn’t recognise that as one of my built-in commands.'), near.length ? h('div', h('div.field-hint', 'Did you mean:'), chips(near.map(x => x.ex))) : chips(exampleChips(6)),
          h('div.field-hint', 'Add a Claude or Gemini key in Settings and I’ll handle free-form requests.'), ui.button('Open Settings', { small: true, kind: 'ghost', onClick: () => US.tools.open('settings') }));
      }

      function showAll() {
        const byTool = new Map();
        for (const a of US.actions.list()) { const n = (US.tools.get(a.tool) || {}).name || a.tool; if (!byTool.has(n)) byTool.set(n, []); byTool.get(n).push(a); }
        bubble('bot', h('div', 'Here’s everything I can do:'), Array.from(byTool.entries()).map(([n, acts]) => h('div.chat-group', h('div.field-label', n), chips(acts.map(a => (a.examples && a.examples[0]) || a.title)))));
      }

      function showPlan(plan) {
        const steps = plan.steps;
        const changes = steps.some(s => US.actions.get(s.action).changes);
        const runBtn = ui.button(steps.length > 1 ? `Run all ${steps.length} steps` : 'Run', { kind: 'primary', icon: 'play' });
        const cancel = ui.button('Cancel', { kind: 'ghost' });
        const status = h('div.plan-status');
        const card = h('div.plan',
          plan.reply ? h('div', plan.reply) : null,
          h('ol.plan-steps', steps.map(s => { const d = describeStep(s); return h('li', h('div', h('b', d.title), d.tool ? h('span.muted', ` · ${d.tool}`) : null), d.detail ? h('div.field-hint', d.detail) : null, d.changes ? ui.pill('makes new bins/sequences', 'var(--warn)') : null); })),
          changes ? h('div.field-hint', 'Your existing clips and sequences aren’t changed – anything new goes into new bins and sequences.') : null,
          h('div.row', runBtn, cancel), status);
        bubble('bot', card);
        cancel.addEventListener('click', () => { runBtn.disabled = cancel.disabled = true; status.textContent = 'Cancelled.'; });
        runBtn.addEventListener('click', async () => {
          if (US.jobs.current) { ui.toast({ type: 'warn', title: 'Something else is still running.', text: 'Wait for it to finish, or press Stop.' }); return; }
          runBtn.disabled = cancel.disabled = true;
          for (let i = 0; i < steps.length; i++) {
            status.textContent = `Running step ${i + 1} of ${steps.length}…`;
            const r = await US.actions.run(steps[i].action, steps[i].params);
            if (r === undefined) { status.textContent = `Stopped at step ${i + 1}. Nothing after it ran.`; bubble('bot', h('div', `Step ${i + 1} didn’t finish – see the message above. ${i ? 'The earlier steps are done.' : ''}`)); return; }
            bubble('bot', h('div.done', US.icon('ok', 15), h('span', `${describeStep(steps[i]).title}: ${r.summary || 'done'}`)));
            if (r.ask) showAsk(r.ask);
          }
          status.textContent = 'All done.';
        });
      }

      /** Ask the interviews (or follow up an earlier answer) and show the answer card. */
      async function runAsk(text, askId = null) {
        const thinking = bubble('bot', h('div.row', h('div.spinner.small'), h('span.muted', `${US.ai && US.ai.available() ? US.ai.label() : 'The AI'} is reading your interviews…`)));
        const r = await US.jobs.run({ title: askId ? 'Changing the answer' : 'Asking your interviews', tool: 'assistant', who: US.jobs.WHO.ai }, job => US.story.askInterviews(job, { request: text, askId }));
        thinking.remove();
        if (r && r.ask) showAsk(r.ask);
      }
      /* ---------- Edit: plan → check the plan → run (on a copy) → read back and check the result ---------- */
      async function runEdit(text, over = null) {
        const scope = Object.assign(scopeNow(), over || {});
        const thinking = bubble('bot', h('div.row', h('div.spinner.small'), h('span.muted', `${US.ai && US.ai.available() ? US.ai.label() : 'The AI'} is reading ${scope.where === 'bin' ? 'the bin' : scope.where === 'project' ? 'the project' : 'the sequence'} and planning…`)));
        const r = await US.jobs.run({ title: editConv ? 'Changing the edit plan' : 'Planning the edit', tool: 'assistant', who: US.jobs.WHO.ai }, job => E.plan(job, { request: text, scope, conv: editConv }));
        thinking.remove();
        if (!r) return;
        editConv = r.conv;
        showEditPlan(r.plan);
      }
      function showEditPlan(p, { followUp = false } = {}) {
        const conv = editConv, m = conv.model, timeline = m.kind === 'timeline';
        if (!p.steps.length) {
          bubble('bot', h('div', p.reply || (p.done ? 'That’s all done.' : 'I couldn’t find a way to do that with the edits I have.')), p.dropped.length ? h('div.field-hint', 'Left out: ' + p.dropped.join(' · ')) : null);
          return;
        }
        const on = p.steps.map(() => true);
        const seqFor = () => conv.workSeqId || (m.seq && m.seq.id);
        const goTo = t => { if (timeline && t.start != null) US.host.call('setPlayhead', { seqId: seqFor(), seconds: t.start }).catch(e => ui.showError(e)); else if (t.itemId) US.host.call('revealItem', { id: t.itemId }).catch(() => {}); };
        const stepRow = (s, i) => {
          const more = h('div.edit-targets.hidden', s.targets.slice(0, 40).map(t => h('button.chip', { title: 'Go there', onclick: () => goTo(t) }, t.line ? `${t.speaker ? t.speaker + ': ' : ''}${(t.text || '').slice(0, 40)}` : t.itemId ? t.name : `${t.kind === 'audio' ? 'A' : 'V'}${t.track + 1} ${US.fmtDur(t.start)} ${t.name || ''}`.trim())), s.targets.length > 40 ? h('span.field-hint', `…and ${s.targets.length - 40} more`) : null);
          const box = h('input', { type: 'checkbox', checked: true, onchange: e => { on[i] = e.target.checked; } });
          return h('li.edit-step', h('label.row', box, h('div.grow', h('b', E.describe(s)), s.why ? h('div.field-hint', s.why) : null)), h('button.btn.small.ghost', { onclick: () => more.classList.toggle('hidden') }, 'Which'), more);
        };
        const copyToggle = timeline && !conv.workSeqId ? ui.toggle({ label: 'Work on a copy of the sequence', hint: `Off: “${m.seq.name}” itself changes (Edit › Undo in Premiere can take steps back one by one).`, value: US.settings.get('editAsk.copy', true), onChange: x => US.settings.set('editAsk.copy', x) }) : null;
        const runBtn = ui.button(p.steps.length > 1 ? `Run ${p.steps.length} edits` : 'Run', { kind: 'primary', icon: 'play' }), cancel = ui.button('Cancel', { kind: 'ghost' }), status = h('div.plan-status');
        const card = h('div.plan',
          followUp ? h('div.field-label', 'Still to do') : null,
          p.reply ? h('div', p.reply) : null,
          h('ol.plan-steps', p.steps.map(stepRow)),
          p.dropped.length ? h('div.field-hint', 'Left out: ' + p.dropped.join(' · ')) : null,
          copyToggle, timeline && conv.workSeqId ? h('div.field-hint', `Runs on the copy “${conv.workSeqName}”.`) : null,
          !timeline ? h('div.field-hint', 'This changes clips in your project. Labels, names and bins can be put back with Undo afterwards.') : null,
          h('div.row', runBtn, cancel), status,
          h('div.field-hint', 'Not right? Type what to change below and I’ll redo the plan.'));
        bubble('bot wide', card);
        cancel.addEventListener('click', () => { runBtn.disabled = cancel.disabled = true; status.textContent = 'Cancelled.'; });
        runBtn.addEventListener('click', async () => {
          const steps = p.steps.filter((x, i) => on[i]);
          if (!steps.length) { status.textContent = 'Tick at least one edit.'; return; }
          runBtn.disabled = cancel.disabled = true; status.textContent = 'Running…';
          const out = await US.jobs.run({ title: 'Editing', tool: 'assistant' }, job => E.run(job, conv, steps, { copy: !timeline ? false : conv.workSeqId ? true : US.settings.get('editAsk.copy', true) }));
          if (!out) { status.textContent = 'Stopped – see the message above.'; return; }
          status.textContent = 'Done.';
          bubble('bot', h('div.done', US.icon('ok', 15), h('span', out.summary)),
            h('ul.edit-results', out.results.map(x => h('li', `${E.describe(x.step)}: ${x.unsupported ? x.why : `${x.done} done${x.skipped && x.skipped.length ? ` · ${x.skipped.length} skipped (${[...new Set(x.skipped.map(k => k.why))].slice(0, 2).join('; ')})` : ''}`}`))),
            out.undo && out.undo.length ? ui.button('Undo', { small: true, kind: 'ghost', onClick: () => US.jobs.run({ title: 'Putting it back', tool: 'assistant' }, async () => { await E.undoItems(out.undo); return { summary: 'Put back as it was' }; }) }) : null);
          // stage 2: read back what happened and check it against the request
          const thinking = bubble('bot', h('div.row', h('div.spinner.small'), h('span.muted', 'Checking the result…')));
          const c = await US.jobs.run({ title: 'Checking the edit', tool: 'assistant', who: US.jobs.WHO.ai }, job => E.check(job, conv, out));
          thinking.remove();
          if (!c) return;
          editConv = c.conv;
          if (c.plan.steps.length) showEditPlan(c.plan, { followUp: true });
          else bubble('bot', h('div', c.plan.reply || 'That looks done.'));
        });
      }
      function showAsk(a) { bubble('bot wide', US.story.askCard(a, { onRefine: t => { bubble('me', t); runAsk(t, a.id); } })); }

      greet();
      return { el: v.el, onShow() { if (!history.length) greet(); setTimeout(() => input.focus(), 50); } };
    }
  });
})();
