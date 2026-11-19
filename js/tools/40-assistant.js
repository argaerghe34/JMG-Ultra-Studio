/* JMG Ultra Studio – Assistant (the Ask tab): one chat box for everything. Built-in commands work with no key (a plan,
   then Run); with a Claude, Gemini or local AI the chat in 40-assistant-chat.js understands anything, reads the
   project, asks when unsure, and does it – several chats at once. This file: the offline matching and the screen
   (US.chatView – Producer's chat is the same screen with its own persona). Dictation is in 40-assistant-dictate.js. */
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

  /* ---------- the chat screen: one chat box for everything, several chats at once ----------
     Shared by Ask and Producer (a persona on the same engine, US.chatPersonas): the chats bar and options pinned at the
     top, the messages, a working row with “behind the scenes”, suggested answers just above the one chat box, dictation,
     Always proceed, the warning before a risky step, and Undo for a reply or for everything the AI did. */
  /**
   * o: {key ('assistant' – where its settings and chats are kept), tool (the tab it lives in), persona ('' | a
   * US.chatPersonas id), placeholder, examples, hello (the greeting's first line), offline (built-in commands and
   * recipes work without AI: Ask only)}. -> {parts: [elements to put in the tab], onShow(), _chats, _submit, _show, _add}
   */
  US.chatView = function (o = {}) {
    const C = US.chat, E = US.editAsk, D = US.dictation;
    const KEY = o.key || 'assistant', TOOL = o.tool || 'assistant', PERSONA = o.persona || '', OFFLINE = o.offline !== false && !PERSONA;
    const set = (k, d) => US.settings.get(`${KEY}.${k}`, d), put = (k, v) => US.settings.set(`${KEY}.${k}`, v);
    const aiOn = () => !!(US.ai && US.ai.available());
    const PLACEHOLDER = o.placeholder || 'e.g. cut the silences · a cross dissolve on every cut on V1 · every story about Grandma, in order · put the drone clips in a Drone bin';
    const EXAMPLES = o.examples || ['Organise this project into bins by kind of clip', 'A cross dissolve on every cut on V1', 'Every story about family, in the order it happened', 'Which stories about family haven’t I used yet?', 'Tighten this cut: take out the pauses and check it', 'Lower thirds with the speaker’s name the first time each person talks', 'How do I export just the audio?'];

    /* ----- the chats ----- */
    let chats = [], cur = null;
    const tabs = h('div.chat-tabs'), logs = h('div.chat-logs'), counter = h('span.field-hint.chat-count');
    const input = h('textarea.input.chat-input', { rows: 2, placeholder: PLACEHOLDER });
    const sendBtn = ui.button('Send', { kind: 'primary', icon: 'chevron', onClick: () => submit() });
    const stopBtn = ui.button('Stop', { kind: 'ghost', onClick: () => { if (cur) { C.stop(cur); if (cur.pending) cur.pending(null); } } });
    input.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); } });
    // while a “which clip?” question waits, what is typed narrows the list above the box
    input.addEventListener('input', () => { if (cur && cur.ask && cur.ask.filter) cur.ask.filter(input.value); });
    let mode = set('permission', 'ask');
    const modeSel = ui.select({ options: C.MODES.map(m => ({ value: m.id, label: m.label })), value: mode, onChange: x => { mode = x; put('permission', x); modeSel.title = (C.MODES.find(m => m.id === x) || {}).hint || ''; } });
    modeSel.title = (C.MODES.find(m => m.id === mode) || {}).hint || '';
    const modelSel = ui.select({ options: [], onChange: x => { if (cur) { cur.model = x; keep(); } put('model', x); } });
    function drawModels() {
      const cs = US.ai && US.ai.choices ? US.ai.choices() : [{ id: 'auto', label: 'Automatic', hint: '' }];
      const want = (cur && cur.model) || 'auto';
      modelSel.setOptions(cs.map(c => ({ value: c.id, label: c.id === 'auto' ? `AI: automatic${aiOn() ? ` (${US.ai.label()})` : ''}` : `AI: ${c.label}` })), cs.some(c => c.id === want) ? want : 'auto');
      modelSel.title = 'Which AI this chat uses. Text is sent; small stills only when you’ve allowed them for the project. Never video or sound unless you chose that for the project.';
      modelSel.disabled = !aiOn();
      drawSettings();
    }
    // what one request may spend before it stops to ask (0 = no limit: the cost is still shown as it goes)
    const LIMITS = [0.5, 2, 5, 10, 0];
    let budget = +set('budget', 2); if (!LIMITS.includes(budget)) budget = 2;
    const usd = x => (US.ai && US.ai.fmtUSD ? US.ai.fmtUSD(x) : '$' + x.toFixed(2));
    const limitSel = ui.select({ options: LIMITS.map(x => ({ value: String(x), label: x ? `Stop to ask at $${x % 1 ? x.toFixed(2) : x} a request` : 'No spending limit' })), value: String(budget), onChange: x => { budget = +x; put('budget', budget); } });
    limitSel.title = 'How much one request may spend on AI before it stops and asks you. It never stops silently: you can let it carry on, or lift the limit for the chat. Your monthly AI limit in Settings always holds. Gemini’s free allowance and a local model cost nothing.';
    const costLine = h('div.field-hint.chat-cost');
    function drawCost() { const c = cur, m = US.ai && US.ai.spending ? US.ai.spending().cost : 0; const by = c && c.usedModel ? `${c.usedModel} · ` : ''; costLine.textContent = c && c.spent > 0.004 ? `${by}AI cost – this chat: ${usd(c.spent)} · this month: ${usd(m)}` : m > 0.004 ? `${by}AI cost this month: ${usd(m)}` : by ? `${by}no charge so far` : ''; costLine.title = 'Which AI answered last, and what the AI has cost: this chat so far, and everything this month (Settings shows it by feature and by key).'; }

    /* ----- Always proceed: per chat, with a chip to switch it off; the default for new chats is in the settings below ----- */
    const alwaysChip = h('button.chip.on.chat-always.hidden', { title: 'This chat doesn’t stop to ask before each step. Risky steps still stop and warn you first. Click to switch it off.', onclick: () => { if (cur) { cur.always = false; drawTabs(); } } }, 'Always proceed ', h('span.chat-tab-x', '×'));
    const undoAllBtn = ui.button('Undo all', { small: true, kind: 'ghost', title: 'Take back everything the AI did in this chat: the sequences, bins and markers it made, and the labels, names and bins it changed', onClick: () => doUndo(cur, null) });
    undoAllBtn.classList.add('chat-undo-all', 'hidden');
    const RISK_SPEND = [0.5, 1, 2, 5];
    // how often it asks, which AI and the spending limit fold away under one line that says what is chosen, so the
    // pinned top stays two thin rows however narrow the panel is
    const optsRow = h('div.row.chat-opts', modeSel, modelSel, limitSel);
    const settingsSec = ui.section(`${PERSONA ? 'Chat' : 'Ask'} settings`, [
      optsRow,
      ui.toggle({ label: 'Always proceed in new chats', hint: 'Steps run without a card to approve first. Anything risky – changing a sequence itself, deleting, a lot at once, long or heavy work, something Undo can’t take back, a costly step, footage leaving this computer – still stops and warns you.', value: !!set('always', false), onChange: x => { put('always', !!x); if (cur && !cur.items.length) { cur.always = !!x; drawTabs(); } } }),
      ui.field('Warn before a step expected to cost more than', ui.select({ options: RISK_SPEND.map(x => ({ value: String(x), label: `$${x % 1 ? x.toFixed(2) : x}` })), value: String(RISK_SPEND.includes(+set('riskSpend', 1)) ? +set('riskSpend', 1) : 1), onChange: x => put('riskSpend', +x) }))
    ], { open: false });
    settingsSec.classList.add('chat-settings');
    const settingsHint = h('span.section-hint.chat-settings-now');
    settingsSec.querySelector('.section-head').appendChild(settingsHint);
    const picked = sel => { const op = sel.options && sel.options[sel.selectedIndex]; return op ? op.textContent : ''; };
    function drawSettings() { settingsHint.textContent = [picked(modeSel), picked(modelSel), picked(limitSel)].filter(Boolean).join(' · '); settingsHint.title = 'How often it asks before a step · which AI this chat uses · when one request stops to ask about its cost. Click to change them.'; }
    for (const sel of [modeSel, modelSel, limitSel]) sel.addEventListener('change', () => drawSettings());

    const DOT = { thinking: 'The AI is thinking', working: 'Working in the editor', waiting: 'Waiting its turn', asking: 'Waiting for you' };
    function drawTabs() {
      US.clear(tabs);
      for (const c of chats) {
        tabs.appendChild(h('button.chat-tab' + (c === cur ? '.on' : ''), { title: c.status !== 'idle' ? `${c.title} – ${DOT[c.status] || ''}` : c.title, onclick: () => show(c) },
          c.status !== 'idle' ? h('span.chat-dot.' + c.status) : null, h('span.chat-tab-name', c.title),
          chats.length > 1 || c.items.length ? h('span.chat-tab-x', { title: c.status !== 'idle' ? 'Stop and close this chat' : 'Close this chat (it stays under Earlier)', onclick: e => { e.stopPropagation(); close(c); } }, '×') : null));
      }
      tabs.appendChild(h('button.chat-tab.chat-new', { title: 'New chat – it can work while the others do', onclick: () => show(add()) }, '+'));
      const old = earlier();
      if (old.length) {
        const sel = ui.select({ options: old.slice(0, 30).map(x => ({ value: x.id, label: x.title })), placeholder: 'Earlier…', onChange: id => { const s = earlier().find(x => x.id === id); if (s) { const c = C.fromStored(s); chats.push(c); mount(c); show(c); keep(); } } });
        sel.classList.add('chat-earlier'); tabs.appendChild(sel);
      }
      const busy = chats.filter(c => c.status !== 'idle').length;
      counter.textContent = busy ? `${US.plural(busy, 'chat')} working` : '';
      const mine = cur && cur.status !== 'idle';
      stopBtn.classList.toggle('hidden', !mine); sendBtn.classList.toggle('hidden', !!mine && !cur.pending);
      alwaysChip.classList.toggle('hidden', !(cur && cur.always));
      const plan = cur ? C.undoPlan(cur) : { can: [], cant: [] };
      undoAllBtn.classList.toggle('hidden', !plan.can.length && !plan.cant.length);
      undoAllBtn.disabled = !!mine;
      drawCost(); drawWorking(); drawAnswers(); drawSettings(); drawFollow(); railMark();
    }
    /** Chats kept with the project: the open ones and, under Earlier, the ones closed (the newest 30). */
    // in the project's own store (not projectSettings: that falls back to the last project's value, and chats belong to one project)
    const pstore = () => US.projectStore((US.ctx && US.ctx.project && (US.ctx.project.path || US.ctx.project.name)) || 'none');
    const stored = () => { let s = null; try { s = pstore().get(`${KEY}.chats`); } catch (e) { s = null; } return s && Array.isArray(s.open) ? s : { open: [], closed: [] }; };
    const store = val => pstore().set(`${KEY}.chats`, val);
    const earlier = () => stored().closed.filter(x => !chats.some(c => c.id === x.id));
    const keep = US.debounce(() => { try { const s = stored(); store({ open: chats.filter(c => c.items.length).map(C.toStored), closed: s.closed.filter(x => !chats.some(c => c.id === x.id)).slice(0, 30) }); } catch (e) { /* a convenience */ } }, 600);
    function add() { const c = C.newChat({ model: set('model', 'auto'), always: !!set('always', false), persona: PERSONA }); chats.push(c); mount(c); return c; }
    function mount(c) { c._resume = (chat, f) => converse(chat, f.text, { unattended: true }); c._changed = () => { drawTabs(); keep(); }; c.logEl = h('div.chat.hidden'); c.bubbles = []; logs.appendChild(c.logEl); if (c.items.length) { for (const it of c.items) render(c, it, true); } else greet(c); }
    function show(c) { cur = c; for (const x of chats) x.logEl.classList.toggle('hidden', x !== c); drawTabs(); drawModels(); const last = c.logEl.lastChild; if (last && last.scrollIntoView) last.scrollIntoView({ block: 'end' }); setTimeout(() => input.focus(), 30); }
    function close(c) {
      for (const f of c.followups || []) C.cancelFollowUp(c, f.id);
      C.disarm(c);
      if (c.status !== 'idle') { C.stop(c); if (c.pending) c.pending(null); }
      chats = chats.filter(x => x !== c); c.logEl.remove();
      if (c.items.length) { try { const s = stored(); store({ open: s.open.filter(x => x.id !== c.id), closed: [C.toStored(c)].concat(s.closed.filter(x => x.id !== c.id)).slice(0, 30) }); } catch (e) { /* a convenience */ } }
      if (!chats.length) add();
      if (cur === c) show(chats[chats.length - 1]); else drawTabs();
      keep();
    }

    /* ----- the working row: what it is doing right now, with the live steps one click away ----- */
    const workText = h('span.chat-working-text'), liveList = h('ol.chat-trace');
    const liveBox = h('div.chat-behind.hidden', liveList);
    const liveBtn = h('button.btn.small.ghost.chat-behind-btn', { title: 'Everything it is doing, step by step, as it happens', onclick: () => { liveBox.classList.toggle('hidden'); liveBtn.classList.toggle('open', !liveBox.classList.contains('hidden')); } }, US.icon('chevron', 12), h('span', 'Behind the scenes'));
    const working = h('div.chat-working.hidden', { role: 'status', 'aria-live': 'polite' }, h('div.row', h('span.chat-working-dots', { 'aria-hidden': 'true' }, h('i'), h('i'), h('i')), workText, liveBtn), liveBox);
    const KIND = { read: 'Reading', ai: 'AI', plan: 'Plan', call: 'Step', result: 'Result', check: 'Check', retry: 'Retry', error: 'Problem', ask: 'You', risk: 'Warning', report: 'Report', undo: 'Undo' };
    const clock = at => { try { return new Date(at).toLocaleTimeString('en-GB', { hour12: false }); } catch (e) { return ''; } };
    const traceRow = t => h('li.chat-trace-row.kind-' + t.kind, h('span.chat-trace-time', clock(t.at)), h('span.chat-trace-kind', KIND[t.kind] || t.kind), h('span.chat-trace-text', US.say(t.text), t.detail ? h('div.chat-trace-detail', US.say(t.detail)) : null));
    function drawWorking() {
      const line = cur ? C.workingLine(cur) : '';
      working.classList.toggle('hidden', !line);
      working.classList.toggle('waiting', !!cur && (cur.status === 'asking' || cur.status === 'waiting'));
      workText.textContent = US.say(line);
      if (!line) return;
      const tr = (cur.trace || []);
      if (liveList._for !== cur || liveList.children.length > tr.length) { US.clear(liveList); liveList._for = cur; }
      for (let i = liveList.children.length; i < tr.length; i++) liveList.appendChild(traceRow(tr[i]));
    }

    /* ----- follow-ups it set itself (“check again in 30 minutes”): a chip with a countdown and Cancel ----- */
    const followBar = h('div.chat-follow.hidden');
    const hhmm = at => { try { return new Date(at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }); } catch (e) { return ''; } };
    const countdown = ms => { ms = Math.max(0, ms); const s0 = Math.round(ms / 1000), hh = Math.floor(s0 / 3600), mm = Math.floor((s0 % 3600) / 60), ss = s0 % 60; return hh ? `${hh} h ${mm} min` : mm ? `${mm} min ${ss < 10 ? '0' : ''}${ss} s` : `${ss} s`; };
    function drawFollow() {
      const fs2 = cur ? (cur.followups || []).filter(f => f.state === 'pending' || f.state === 'due' || f.state === 'running') : [];
      US.clear(followBar);
      followBar.classList.toggle('hidden', !fs2.length);
      for (const f of fs2) {
        if (f.state === 'due') followBar.appendChild(h('div.chat-follow-row.due', h('span.grow', h('b', `Was due at ${hhmm(f.at)}, while the panel was closed: `), US.say(f.text)),
          ui.button('Run it now', { small: true, kind: 'primary', onClick: () => { C.runFollowUp(cur, f.id); drawFollow(); keep(); } }), ui.button('Skip', { small: true, kind: 'ghost', onClick: () => { C.cancelFollowUp(cur, f.id); drawFollow(); keep(); } })));
        else followBar.appendChild(h('div.chat-follow-row', h('span.chat-follow-clock', f.state === 'running' ? 'Now' : `Back in ${countdown(f.at - C.clock.now())}`), h('span.grow.chat-follow-text', { title: f.text }, US.say(f.text)),
          f.state === 'running' ? null : ui.button('Cancel', { small: true, kind: 'ghost', title: 'Don’t come back to this', onClick: () => { C.cancelFollowUp(cur, f.id); drawFollow(); keep(); } })));
      }
    }
    setInterval(() => { if (cur && (cur.followups || []).some(f => f.state === 'pending') && followBar.isConnected) drawFollow(); }, 1000);
    /* the Ask button on the rail: a ring while any chat works, a dot when one finished while you were elsewhere */
    const railBtn = () => { try { return document.querySelector(TOOL === 'assistant' ? '.rail-ask, .rail-btn[data-id="assistant"]' : `.rail-btn[data-id="${TOOL}"]`); } catch (e) { return null; } };
    const away = () => !head.isConnected || head.offsetParent === null;
    function railMark() { const b = railBtn(); if (!b || !b.classList) return; b.classList.toggle('chat-busy', chats.some(c => c.status !== 'idle' && c.status !== 'asking')); b.classList.toggle('chat-needs-you', chats.some(c => c.status === 'asking')); }
    function railDone(on) { const b = railBtn(); if (!b || !b.querySelector) return; const d = b.querySelector('.chat-done-dot'); if (on && !d) b.appendChild(h('span.chat-done-dot', { title: 'A chat finished while you were away' })); else if (!on && d) d.remove(); }

    /* ----- answers to a question: buttons just above the one chat box ----- */
    const answers = h('div.chat-answers.hidden');
    function drawAnswers() {
      const a = cur && cur.status === 'asking' ? cur.ask : null;
      US.clear(answers);
      answers.classList.toggle('hidden', !a);
      if (a) {
        if (a.options && a.options.length) answers.appendChild(h('div.chat-chips', a.options.map(x => h('button.chip.chat-option', { title: 'Answer with this', onclick: () => a.done(x) }, US.say(x)))));
        if (a.picker) answers.appendChild(a.picker);
      }
      const p = cur && cur.status === 'asking' && cur.pending ? cur.pendingKind : '';
      input.placeholder = p === 'question' ? US.say(`Your answer to: ${cur.ask ? cur.ask.question : 'the question'}`) : p === 'approve' ? 'Type yes to go ahead – or say what you’d like instead' : p === 'limit' ? 'Type “carry on”, or “stop”' : PLACEHOLDER;
      input.classList.toggle('answering', !!p);
    }

    /* ----- dictation: record, turn into words on this computer, put them in the box to check ----- */
    let rec = null, micState = 'idle';
    const micLevel = h('span.chat-mic-level', h('i')), micTime = h('span.chat-mic-time');
    const micBtn = h('button.icon-btn.chat-mic', { title: 'Dictate – speak your request. It is turned into words on this computer; nothing you say is sent anywhere.', 'aria-label': 'Dictate', onclick: () => mic() }, US.icon('mic', 18));
    const micRow = h('div.chat-mic-row.hidden', micLevel, micTime, h('span.grow'), ui.button('Cancel', { small: true, kind: 'ghost', onClick: () => micCancel() }), ui.button('Done', { small: true, kind: 'primary', onClick: () => mic() }));
    function micDraw(text) { micBtn.classList.toggle('recording', micState === 'recording'); micBtn.classList.toggle('busy', micState === 'busy'); micRow.classList.toggle('hidden', micState === 'idle'); micRow.classList.toggle('busy', micState === 'busy'); if (text != null) micTime.textContent = text; }
    function micCancel() { if (rec) { try { rec.cancel(); } catch (e) { /* stopped */ } rec = null; } micState = 'idle'; micDraw(''); }
    async function mic() {
      if (!D) return;
      if (micState === 'busy') return;
      if (micState === 'recording') {
        const r = rec; rec = null; micState = 'busy'; micDraw('Turning your speech into words on this computer…');
        try {
          const got = await r.stop();
          const text = await D.transcribe(got);
          input.value = D.joinText(input.value, text); input.focus();
          input.dispatchEvent(new Event('input'));
        } catch (e) { ui.showError(e); }
        finally { micState = 'idle'; micDraw(''); }
        return;
      }
      // nothing to turn speech into words here: say so before recording anything
      const eng = D.engine();
      if (!eng.id) { ui.toast({ type: 'warn', title: eng.why, text: eng.action, timeout: 12000 }); return; }
      try {
        micState = 'busy'; micDraw('Starting the microphone…');
        rec = await D.start({ onLevel: (lv, secs) => { micLevel.firstChild.style.width = Math.round(lv * 100) + '%'; micTime.textContent = `Listening… ${US.fmtDur ? US.fmtDur(secs) : Math.round(secs) + ' s'} – press Done when you’ve finished`; }, onLimit: () => mic() });
        micState = 'recording'; micDraw('Listening… press Done when you’ve finished');
      } catch (e) { rec = null; micState = 'idle'; micDraw(''); ui.showError(e); }
    }

    /* ----- what a chat shows ----- */
    function bubble(c, who, ...kids) {
      const b = h('div.bubble.' + who.replace(/ /g, '.'), kids);
      c.logEl.appendChild(b); c.bubbles.push(b);
      while (c.bubbles.length > 160) c.bubbles.shift().remove();
      if (c === cur && b.scrollIntoView) b.scrollIntoView({ block: 'end', behavior: 'smooth' });
      return b;
    }
    const chips = list => h('div.chat-chips', list.map(x => h('button.chip', { onclick: () => { input.value = US.say(x); submit(); } }, x)));
    function exampleChips(n = 10) {
      const ex = []; const per = new Map();
      for (const a of US.actions.list()) for (const e of (a.examples || []).slice(0, 1)) { if (!per.has(a.tool)) per.set(a.tool, 0); if (per.get(a.tool) < 2) { ex.push(e); per.set(a.tool, per.get(a.tool) + 1); } }
      return ex.slice(0, n);
    }
    function greet(c) {
      if (PERSONA) {
        if (aiOn()) bubble(c, 'bot', h('div', o.hello || 'Tell me what you want.'), chips(EXAMPLES), h('div.field-hint', `Worked out by ${US.ai.label()}. It has every tool Ask has: it reads your project, sequences and interviews as text, and can make the changes it suggests – it asks first, and warns before anything risky.`));
        else bubble(c, 'bot', h('div', o.hello || 'Tell me what you want.'), ui.needsAI(`${(C.personaOf(PERSONA) || {}).name || 'This chat'} needs AI.`));
        return;
      }
      const asks = (US.story && US.story.asks ? (() => { try { return US.story.asks(); } catch (e) { return []; } })() : []).slice(0, 4);
      if (aiOn()) bubble(c, 'bot', h('div', 'Tell me what you want – in your own words. I read your project, sequences and interviews as text, tell you what I understood and what I’ll do, ask when I’m not sure, and ask before I change anything.'), chips(EXAMPLES),
        h('div.field-hint', `Worked out by ${US.ai.label()}. Text is sent – and a few small stills only if you’ve switched that on for this project (you’re asked each time); never video or sound. Start another chat with + while this one works.`),
        asks.length ? h('div', h('div.field-hint', 'Earlier answers from your interviews:'), h('div.chat-chips', asks.map(a => h('button.chip', { onclick: () => { bubble(c, 'me', a.request); showAsk(c, a); } }, US.storyAsk.title(a.request))))) : null,
        chainChips(), recipeChips(c));
      else bubble(c, 'bot', h('div', 'Hi! I can run any JMG Ultra Studio tool for you. Try one of these:'), chips(exampleChips()),
        h('div.field-hint', 'These work without any AI. Add a Claude or Gemini key in Settings and I’ll understand anything you ask – edits, questions about your interviews, several steps at once.'),
        ui.button('Open Settings', { small: true, kind: 'ghost', onClick: () => US.tools.open('settings') }), recipeChips(c));
    }
    /** Whole jobs to try – several tools in a row. A chip puts the request in the box, with the part to change selected. */
    function chainChips() {
      const cs = (US.recipes && US.recipes.CHAINS) || [];
      if (!cs.length) return null;
      return h('div', h('div.field-label', 'Try a whole job'), h('div.chat-chips', cs.slice(0, 8).map(x => h('button.chip', { title: `${x.ask}\n\nSteps: ${x.steps.join(' → ')}`, onclick: () => {
        input.value = x.ask; input.focus();
        const a = x.ask.indexOf('['), b = x.ask.indexOf(']');
        if (a >= 0 && b > a && input.setSelectionRange) input.setSelectionRange(a, b + 1); else submit();
      } }, x.name))), h('div.field-hint', 'Each is several steps: I plan them all, you approve the plan once, and I work through it – on copies.'));
    }
    const goTo = (m, t, seqId) => { if (t.seqId) US.host.call('openSequence', { seqId: t.seqId }).then(() => (t.start != null ? US.host.call('setPlayhead', { seqId: t.seqId, seconds: t.start }) : null)).catch(e => ui.showError(e)); else if (m && m.kind === 'timeline' && t.start != null) US.host.call('setPlayhead', { seqId: seqId || m.seq.id, seconds: t.start }).catch(e => ui.showError(e)); else if (t.itemId) US.host.call('revealItem', { id: t.itemId }).catch(() => {}); };
    const targetName = t => (t.line ? `${t.speaker ? t.speaker + ': ' : ''}${(t.text || '').slice(0, 40)}` : t.itemId || t.sequence ? t.name : t.seqName ? `${t.seqName}: ${t.kind === 'audio' ? 'A' : 'V'}${t.track + 1} ${US.fmtDur(t.start)}` : `${t.kind === 'audio' ? 'A' : 'V'}${t.track + 1} ${US.fmtDur(t.start)} ${t.name || ''}`.trim());
    const RISK = { new: ['makes something new', 'var(--info)'], own: ['changes your own work', 'var(--warn)'], out: ['writes files', 'var(--warn)'], sees: ['stills leave this computer', 'var(--warn)'] };
    /** A card to approve before a step runs: Proceed · Always proceed · Skip. -> {ok, always, steps} */
    function approve(c, card) {
      return new Promise(res => {
        const steps = card.steps || [], on = steps.map(() => true);
        const rowsEl = steps.length ? h('ol.plan-steps', steps.map((s, i) => {
          const more = h('div.edit-targets.hidden', s.targets.slice(0, 40).map(t => h('button.chip', { title: 'Go there', onclick: () => goTo(card.model, t) }, targetName(t))), s.targets.length > 40 ? h('span.field-hint', `…and ${s.targets.length - 40} more`) : null);
          return h('li.edit-step', h('label.row', h('input', { type: 'checkbox', checked: true, onchange: e => { on[i] = e.target.checked; } }), h('div.grow', h('b', E.describe(s)), s.why ? h('div.field-hint', s.why) : null)), h('button.btn.small.ghost', { onclick: () => more.classList.toggle('hidden') }, 'Which'), more);
        })) : null;
        // things the step would take (clips to download): each can be unticked
        const picks = card.items || [], onP = picks.map(() => true);
        const picksEl = picks.length ? h('div.chat-picks', picks.map((p, i) => h('label.chat-pick' + (p.warn ? '.warn' : ''), h('input', { type: 'checkbox', checked: true, onchange: e => { onP[i] = e.target.checked; } }),
          p.thumb ? h('img.chat-pick-thumb', { src: p.thumb, alt: '', loading: 'lazy' }) : h('span.chat-pick-thumb'), h('span.grow', h('b', US.keep(p.label)), h('div.field-hint', p.sub || '')),
          p.link ? h('button.btn.small.ghost', { title: 'Open its page in your browser', onclick: e => { e.preventDefault(); US.app.openUrl(p.link); } }, 'Page') : null))) : null;
        const status = h('div.plan-status');
        const done = (r, text) => { c.pending = null; c.pendingKind = ''; box.classList.add('chat-card-done'); status.textContent = text; drawTabs(); res(r); };
        const go = always => { const pick = steps.filter((x, i) => on[i]); if ((steps.length && !pick.length) || (picks.length && !onP.some(Boolean))) { status.textContent = 'Tick at least one, or press Skip.'; return; } done(Object.assign({ ok: true, always, steps: pick }, picks.length ? { items: picks.filter((x, i) => onP[i]).map(x => x.id) } : {}), always ? 'Approved – I won’t stop to ask again in this chat (switch that off with the “Always proceed” chip at the top). I still warn you before anything risky.' : 'Approved.'); };
        const box = bubble(c, 'bot wide chat-card', h('div.plan',
          h('div.row', h('div.field-label.grow', 'May I?'), RISK[card.risk] ? ui.pill(RISK[card.risk][0], RISK[card.risk][1]) : null),
          h('div', h('b', US.say(card.title))), card.detail ? h('div.field-hint.pre', US.say(card.detail)) : null, rowsEl, picksEl,
          card.dropped && card.dropped.length ? h('div.field-hint', 'Left out: ' + card.dropped.join(' · ')) : null,
          h('div.row.chat-card-btns', ui.button('Proceed', { kind: 'primary', small: true, icon: 'play', onClick: () => go(false) }),
            card.risk !== 'sees' && card.always !== false ? ui.button('Always proceed', { small: true, title: 'Don’t stop to ask again in this chat. Anything risky – changing a sequence itself, deleting, a lot at once, heavy work, something that can’t be undone – still stops and warns you. Switch it off with the chip at the top.', onClick: () => go(true) }) : null,
            ui.button('Skip', { kind: 'ghost', small: true, onClick: () => done({ ok: false }, 'Skipped – it didn’t run.') })), status));
        c.pendingKind = 'approve';
        c.pending = v => { if (v == null) done({ ok: false }, 'Stopped.'); else if (/^(y|yes|yep|ok|okay|go|go ahead|proceed|do it|sure|fine)\b/i.test(v)) { bubble(c, 'me', v); go(false); } else { bubble(c, 'me', v); done({ ok: false, note: v }, 'Not run – I’ll go by what you said instead.'); } };
        drawTabs();
      });
    }
    /** A plan of several steps: one yes for all of it, step by step, or not at all. -> {ok} | {each} | {note} | {} */
    function planApprove(c, p) {
      return new Promise(res => {
        const status = h('div.plan-status');
        const done = (r, text) => { c.pending = null; c.pendingKind = ''; box.classList.add('chat-card-done'); status.textContent = text; drawTabs(); res(r); };
        const box = bubble(c, 'bot wide chat-card chat-plan-card', h('div.plan',
          h('div.field-label', 'The whole plan – may I?'), h('ol.agent-plan-list', p.plan.map(x => h('li', US.say(x)))),
          h('div.field-hint', 'One yes covers every step of this request. I still stop and warn you before anything risky, and everything is made on copies – Undo all takes the lot back.'),
          h('div.row.chat-card-btns', ui.button('Proceed with the plan', { kind: 'primary', small: true, icon: 'play', onClick: () => done({ ok: true }, 'Plan approved – working through it.') }),
            ui.button('Step by step', { small: true, title: 'Ask me before each step that changes something', onClick: () => done({ each: true }, 'I’ll ask before each step.') }),
            ui.button('Skip', { kind: 'ghost', small: true, onClick: () => done({}, 'Plan turned down – nothing ran.') })), status));
        c.pendingKind = 'approve';
        c.pending = v => { if (v == null) done({}, 'Stopped.'); else if (/^(y|yes|yep|ok|okay|go|go ahead|proceed|do it|sure|fine)\b/i.test(v)) { bubble(c, 'me', v); done({ ok: true }, 'Plan approved – working through it.'); } else { bubble(c, 'me', v); done({ note: v }, 'Not run – I’ll plan again by what you said.'); } };
        drawTabs();
      });
    }
    /** Before a risky step, whatever was chosen about asking: what has happened, what could, Continue or Change course. */
    async function warn(c, w) {
      if (c !== cur) { US.tools.open(TOOL); show(c); }
      const r = await ui.modal({ title: 'Before I go on – this step needs your say', wide: true,
        body: h('div.chat-warn',
          h('p', h('b', US.say(w.title))), w.detail ? h('p.pre', US.say(w.detail)) : null,
          h('div.field-label', 'What could happen'), h('ul.chat-list.no', w.reasons.map(x => h('li', US.say(x.text)))),
          h('div.field-label', 'What has happened so far'), w.sofar && w.sofar.length ? h('ol.agent-plan-list', w.sofar.map(x => h('li', US.say(x)))) : h('p', 'Nothing has been changed yet for this request.'),
          h('p.field-hint', 'Continue runs this step. Change course leaves it undone and pauses the plan, so you can say in the chat what you’d like instead.')),
        buttons: [{ label: 'Change course', value: 'change', kind: 'secondary' }, { label: 'Continue', value: 'continue', kind: 'danger' }] });
      return r === 'continue' ? 'continue' : 'change';
    }
    /** At a limit: say what's been spent and let the editor decide. -> 'more' | 'free' | 'stop' */
    function limit(c, l) {
      return new Promise(res => {
        const status = h('div.plan-status');
        const done = (r, text) => { c.pending = null; c.pendingKind = ''; box.classList.add('chat-card-done'); status.textContent = text; drawTabs(); res(r); };
        const money = l.kind === 'money';
        const box = bubble(c, 'bot wide chat-card', h('div.plan', h('div.row', h('div.field-label.grow', money ? 'Spending check' : 'Still going'), ui.pill(money ? usd(l.used) + ' so far' : `${l.used} steps`, 'var(--warn)')),
          h('div', money ? `This request has used about ${usd(l.used)} of AI – the amount you set it to stop and ask at (${usd(l.limit)}). I’m not finished.` : `This request has taken ${l.used} steps and I’m not finished.`),
          h('div.field-hint', `This chat altogether: ${usd(l.total)}. Nothing is lost if you stop – what’s made so far is kept.`),
          h('div.row.chat-card-btns', ui.button(money ? `Carry on (up to ${usd(l.limit + budget)})` : 'Carry on', { kind: 'primary', small: true, onClick: () => done('more', 'Carrying on.') }),
            ui.button('No limit for this chat', { small: true, title: 'This chat won’t stop to ask again. The cost keeps showing under the chat box, and your monthly limit in Settings still holds.', onClick: () => done('free', 'No limit for this chat – the cost keeps showing below.') }),
            ui.button('Stop here', { kind: 'ghost', small: true, onClick: () => done('stop', 'Stopped here.') })), status));
        c.pendingKind = 'limit';
        c.pending = v => { if (v == null) done('stop', 'Stopped.'); else if (/^(y|yes|ok|okay|go|carry on|continue|more|sure)\b/i.test(v)) done('more', 'Carrying on.'); else done('stop', 'Stopped here.'); };
        drawTabs();
      });
    }
    /**
     * A question from the AI. Its suggested answers are buttons just above the chat box (a list of the project's own
     * clips, bins, sequences or tracks when it asks for one); typing an answer in the chat box always works. No box of
     * its own. -> the answer, or null
     */
    function choose(c, q) {
      return new Promise(res => {
        const pr = q.project || { bins: [], sequences: [], clips: [] };
        const status = h('div.plan-status', 'Pick an answer above the chat box, or type your own there.');
        const done = (ans, shown) => { c.pending = null; c.pendingKind = ''; c.ask = null; box.classList.add('chat-card-done'); status.textContent = ans != null ? '' : 'Closed.'; if (ans != null) bubble(c, 'me', shown || ans); drawTabs(); res(ans); };
        let picker = null, filter = null;
        if (q.kind === 'clip' && pr.clips.length) {
          const pick = list => list.slice(0, 500).map(x => ({ value: x.id, label: `${x.name}${x.bin && x.bin !== '(Project root)' ? `  –  ${x.bin}` : ''}` }));
          const sel = ui.select({ options: pick(pr.clips), placeholder: 'Choose the clip… (type part of its name below to narrow the list)', onChange: id => { const x = pr.clips.find(y => y.id === id); if (x) done(`the clip “${x.name}” (${x.id}${x.bin ? `, in ${x.bin}` : ''})`, x.name); } });
          filter = text => { const w = String(text || '').trim().toLowerCase(); sel.setOptions(pick(w ? pr.clips.filter(x => `${x.name} ${x.file}`.toLowerCase().includes(w)) : pr.clips), ''); };
          picker = sel;
        } else if (q.kind === 'bin' && pr.bins.length) picker = ui.select({ options: pr.bins.slice().sort((a, b) => a.localeCompare(b)).map(b => ({ value: b, label: b })), placeholder: 'Choose the bin…', onChange: b => { if (b) done(`the bin “${b}”`, b); } });
        else if (q.kind === 'sequence' && pr.sequences.length) picker = ui.select({ options: pr.sequences.map(x => ({ value: x.id, label: `${x.name}${x.bin && x.bin !== '(Project root)' ? `  –  ${x.bin}` : ''}` })), placeholder: US.say('Choose the sequence…'), onChange: id => { const x = pr.sequences.find(y => y.id === id); if (x) done(`the sequence “${x.name}” (${x.id})`, x.name); } });
        else if (q.kind === 'track') { const n = Math.max(3, ...pr.sequences.map(x => x.video || 0)) + 1, a = Math.max(3, ...pr.sequences.map(x => x.audio || 0)) + 1; picker = ui.select({ options: [...Array(n).keys()].map(i => 'V' + (i + 1)).concat([...Array(a).keys()].map(i => 'A' + (i + 1))).map(t => ({ value: t, label: t })), placeholder: 'Choose the track…', onChange: t => { if (t) done(`track ${t}`, t); } }); }
        const box = bubble(c, 'bot wide chat-card chat-question', h('div.plan', h('div.field-label', 'A question first'), h('div', h('b', US.say(q.question))), status));
        c.ask = { question: q.question, options: q.options || [], picker, filter, done };
        c.pendingKind = 'question';
        c.pending = v => done(v);
        drawTabs();
        if (c === cur) setTimeout(() => input.focus(), 30);
      });
    }
    /**
     * Behind the scenes, closed until asked for: what it understood, the plan, then every step in detail – what it
     * read, each call with its arguments in plain words, what came back, checks, retries – and the AI used, the tokens
     * and the cost.
     */
    function behind(c, end) {
      const at = c.items.indexOf(end), from = c.items.map(x => x.k).lastIndexOf('me', at < 0 ? c.items.length : at), part = c.items.slice(from + 1).filter(x => x !== end);
      const u = part.find(x => x.k === 'understood'), plans = part.filter(x => x.k === 'plan'), steps = part.filter(x => x.k === 'step');
      const tr = end.trace || [];
      const tokens = (end.tokensIn || end.tokensOut) ? ` · ${(end.tokensIn || 0).toLocaleString('en-GB')} tokens read, ${(end.tokensOut || 0).toLocaleString('en-GB')} written` : '';
      const body = h('div.chat-why.hidden',
        u ? h('div', h('div.field-label', 'What I understood'), h('div', u.text)) : null,
        plans.length ? h('div', h('div.field-label', 'The plan'), h('ol.agent-plan-list', plans[plans.length - 1].plan.map(p => h('li', p)))) : null,
        tr.length ? h('div', h('div.field-label', 'Step by step'), h('ol.chat-trace', tr.map(traceRow)))
          : steps.length ? h('div', h('div.field-label', 'What I did'), h('ol.agent-plan-list', steps.map(s => h('li', s.text, s.result ? h('span.agent-res', ' → ' + s.result) : null)))) : null,
        end.k === 'end' ? h('div.field-hint', `${end.model || 'AI'} · ${US.plural(end.steps || 0, 'step')}${tokens}${end.spent > 0.004 ? ` · about ${usd(end.spent)}` : ' · no charge'}${steps.some(x => x.tool === 'look') ? ' · text and the stills you approved were sent' : steps.some(x => x.tool === 'watch') ? ' · text was sent, and footage only as you approved' : ' · only text was sent'}`) : null);
      const btn = h('button.btn.small.ghost.chat-why-btn.chat-behind-btn', { title: 'Everything it did, step by step', onclick: () => { body.classList.toggle('hidden'); btn.classList.toggle('open', !body.classList.contains('hidden')); } }, US.icon('chevron', 12), h('span', 'Behind the scenes'));
      return h('div.chat-behind-wrap', btn, body);
    }
    /** Undo one reply's changes (turn) or everything the AI did in the chat (turn null): shown first, then done. */
    async function doUndo(c, turn) {
      if (!c) return;
      if (c.status !== 'idle' || US.jobs.current) { ui.toast({ type: 'warn', title: 'Something is still running.', text: 'Wait for it to finish, or press Stop – then undo.' }); return; }
      const plan = C.undoPlan(c, { turn });
      if (!plan.can.length && !plan.cant.length) { ui.toast({ type: 'info', title: 'There is nothing to undo here.' }); return; }
      const list = xs => h('ul.chat-list', xs.map(x => h('li', US.say(x.text))));
      const ok = await ui.modal({ title: turn == null ? 'Undo everything the AI did in this chat?' : 'Undo what this reply did?', wide: true,
        body: h('div.chat-warn', plan.can.length ? h('div', h('div.field-label', 'This will'), list(plan.can)) : h('p', 'Nothing here can be taken back automatically.'),
          plan.cant.length ? h('div', h('div.field-label', 'This can’t be undone from here'), list(plan.cant)) : null,
          h('p.field-hint', 'Only what the AI made or changed is touched – never your own clips, sequences or files. If you’ve changed a sequence it made, you’re asked before it is deleted.')),
        buttons: plan.can.length ? [{ label: 'Cancel', value: false, kind: 'ghost' }, { label: turn == null ? 'Undo everything' : 'Undo this reply', value: true, kind: 'primary' }] : [{ label: 'Close', value: false, kind: 'primary' }] });
      if (!ok) return;
      try {
        const res = await C.undo(c, { turn, confirm: async entries => ((await ui.modal({ title: 'You’ve changed these since the AI made them', body: h('div', h('ul.chat-list', entries.map(x => h('li', US.keep(x.name)))), h('p', 'Deleting them would lose your changes. Keep them, or delete them anyway?')), buttons: [{ label: 'Delete anyway', value: 'delete', kind: 'danger' }, { label: 'Keep them', value: 'keep', kind: 'primary' }] })) === 'delete' ? 'delete' : 'keep') });
        const it = { k: 'undone', at: Date.now(), turn, undone: res.undone, kept: res.kept, cant: res.cant, failed: res.failed };
        c.items.push(it); render(c, it);
      } catch (e) { ui.showError(e); }
      drawTabs(); keep();
    }
    const undoable = (c, turn) => { const p = C.undoPlan(c, { turn }); return p.can.length + p.cant.length; };
    function render(c, it, old = false) {
      if (it.k === 'me' && it.auto) bubble(c, 'bot agent-say chat-auto', h('span', h('b', 'Back, as planned: '), it.text));
      else if (it.k === 'me') bubble(c, 'me', it.text);
      else if (it.k === 'followup') bubble(c, 'bot agent-say chat-auto', h('span', h('b', `I’ll come back at ${hhmm(it.at)}: `), it.text));
      else if (it.k === 'opened') bubble(c, 'bot agent-say', h('span.row', h('span.field-hint.grow', `Run in the background – its results are in ${it.name}.`), ui.button(`Open ${it.name}`, { small: true, kind: 'ghost', onClick: () => US.tools.open(it.tool, it.args || undefined) })));
      else if (it.k === 'understood') bubble(c, 'bot chat-understood', h('div.field-label', 'What I understand'), h('div', it.text));
      else if (it.k === 'plan') bubble(c, 'bot chat-plan', h('div.field-label', 'Plan'), h('ol.agent-plan-list', it.plan.map(p => h('li', p))));
      else if (it.k === 'say') bubble(c, 'bot agent-say', it.text);
      else if (it.k === 'step') { it.el = bubble(c, 'bot agent-tool', h('span.agent-step', US.say(it.text)), it.result ? h('span.agent-res', ' → ' + it.result) : null); }
      else if (it.k === 'result') { const el = it.on && it.on.el; if (el) el.appendChild(h('span.agent-res', ' → ' + it.text)); }
      else if (it.k === 'warn') bubble(c, 'bot agent-warn', it.text);
      else if (it.k === 'paused') bubble(c, 'bot wide agent-warn chat-paused', h('div', h('b', 'Plan paused. '), it.text), h('div.row.chat-end-tools', behind(c, it), undoable(c, it.turn) ? ui.button('Undo what this request did so far', { small: true, kind: 'ghost', onClick: () => doUndo(c, it.turn) }) : null));
      else if (it.k === 'undone') {
        const list = (label, xs, cls) => (xs && xs.length ? h('div', h('div.field-label', label), h('ul.chat-list' + (cls || ''), xs.map(x => h('li', US.say(x))))) : null);
        bubble(c, 'bot wide chat-undone', h('div', h('b', it.undone && it.undone.length ? 'Undone.' : 'Nothing was taken back.')), list('Taken back', it.undone, '.ok'), list('Kept', it.kept), list('Couldn’t be undone from here', it.cant, '.no'), list('Didn’t work', it.failed, '.no'));
      }
      else if (it.k === 'card' && it.card === 'ask') { try { const a = US.story.asks().find(x => x.id === it.askId); if (a) showAsk(c, a); } catch (e) { /* the answer is gone */ } }
      else if (it.k === 'card' && it.card && it.card !== 'ask' && o.cards && o.cards[it.card]) { try { const el = o.cards[it.card](it); if (el) bubble(c, 'bot wide', el); } catch (e) { /* the result is gone */ } }
      else if (it.k === 'undo' && !old) bubble(c, 'bot agent-say', ui.button('Undo that', { small: true, kind: 'ghost', title: 'Puts labels, names and bins back as they were', onClick: () => US.jobs.run({ title: 'Putting it back', tool: TOOL }, async () => { await E.undoItems(it.undo); for (const j of c.journal || []) if (j.kind === 'items' && j.undo === it.undo) j.undone = true; drawTabs(); keep(); return { summary: 'Put back as it was' }; }) }));
      else if (it.k === 'unplace' && !old) bubble(c, 'bot agent-say', ui.button('Take them out again', { small: true, kind: 'ghost', onClick: () => US.jobs.run({ title: 'Taking them out again', tool: TOOL }, async () => { const n = await E.unplace(it.unplace); for (const j of c.journal || []) if (j.kind === 'placed' && j.list === it.unplace) j.undone = true; drawTabs(); keep(); return { summary: `Took out ${US.plural(n, 'clip')}` }; }) }));
      else if (it.k === 'end') {
        const seqs = (it.versions || []).filter((x, i, a) => a.findIndex(y => y.seqId === x.seqId) === i);
        const list = (label, xs, cls) => (xs && xs.length ? h('div', h('div.field-label', label), h('ul.chat-list' + (cls || ''), xs.map(x => h('li', x)))) : null);
        const asked = (c.items.slice(0, c.items.indexOf(it)).reverse().find(x => x.k === 'me') || {}).text || '';
        bubble(c, 'bot wide chat-end', it.reply ? h('div.chat-reply', it.reply) : null, list('Done', it.done, '.ok'), list('Not done', it.notDone, '.no'), list('Worth checking', it.check),
          seqs.length ? h('div', h('div.field-label', US.say('Sequences I made (yours are untouched)')), h('div.agent-seqs', seqs.map(x => h('div.row', h('span.grow', x.name, h('span.field-hint', ` – ${x.why}`)), ui.button('Open', { small: true, kind: 'ghost', onClick: () => US.host.call('openSequence', { seqId: x.seqId }).catch(err => ui.showError(err)) }))))) : null,
          it.next && it.next.length && !old ? h('div.chat-chips', it.next.map(x => h('button.chip', { onclick: () => { input.value = x; submit(); } }, x))) : null,
          h('div.field-hint', `${it.model || 'AI'}${it.spent > 0.004 ? ` · this request: about ${usd(it.spent)}` : ' · no charge for this request'}${it.total > it.spent + 0.004 ? ` · this chat: ${usd(it.total)}` : ''}`),
          h('div.row.chat-end-tools', behind(c, it),
            it.turn && undoable(c, it.turn) ? ui.button('Undo this reply', { small: true, kind: 'ghost', title: 'Take back what the AI made or changed for this request', onClick: () => doUndo(c, it.turn) }) : null,
            asked && (it.steps || 0) > 1 && !old && OFFLINE ? ui.button('Save as a recipe', { small: true, kind: 'ghost', icon: 'plus', title: 'Ask for this again later, on any project, in one go', onClick: () => saveRecipe([{ edit: asked, where: 'sequence' }], asked.slice(0, 40)) }) : null));
      }
    }
    /** An answer from the interviews, as its card. Changing it (“shorter”, “only Ruth”) asks again in the same conversation with the transcripts, read from the cache. */
    function showAsk(c, a) {
      bubble(c, 'bot wide', US.story.askCard(a, { onRefine: async t => {
        bubble(c, 'me', t);
        const thinking = bubble(c, 'bot', h('div.row', h('div.spinner.small'), h('span.muted', `${aiOn() ? US.ai.label() : 'The AI'} is reading your interviews…`)));
        const r = await US.jobs.run({ title: 'Changing the answer', tool: TOOL, who: US.jobs.WHO.ai, about: US.storyContext && US.storyContext.about ? US.storyContext.about(t) : '' }, job => US.story.askInterviews(job, { request: t, askId: a.id }));
        thinking.remove();
        if (r && r.ask) showAsk(c, r.ask);
      } }));
    }

    /* ----- sending ----- */
    const quick = text => text.length <= 70 && !/\b(and then|then|after that|and also)\b|[;\n]/i.test(text);
    async function submit(text = input.value.trim(), c = cur) {
      if (!text || !c) return;
      // a question or approval is waiting: what's typed answers it
      if (c.pending && c.status === 'asking') { input.value = ''; const p = c.pending; if (/^(no|skip|stop|cancel|don’t|dont|don't)\b/i.test(text)) p(null); else p(text); return; }
      if (c.status !== 'idle') { ui.toast({ type: 'warn', title: 'This chat is still working.', text: 'Wait for it, press Stop, or start another chat with +.' }); return; }
      input.value = '';
      if (!OFFLINE) {
        if (!aiOn()) { note(c, text); bubble(c, 'bot', ui.needsAI(`${(C.personaOf(PERSONA) || {}).name || 'This chat'} needs AI.`)); return; }
        return converse(c, text);
      }
      if (/^(help|what can you do\??|\?)$/i.test(text)) { bubble(c, 'me', text); showAll(c); return; }
      // a built-in command, word for word: free and instant, with or without AI (in a new chat; a conversation goes to the AI)
      const off = matchOffline(text), fresh = !c.context;
      const own = s => s.action !== 'story.ask' && s.action !== 'edit.ask';
      if (off.steps.length === 1 && own(off.steps[0]) && (!aiOn() || (fresh && quick(text)))) { note(c, text); showPlan(c, { reply: 'Here’s what I’ll do:', steps: off.steps }); return; }
      if (!aiOn()) {
        note(c, text);
        if (off.steps.length === 1 && !own(off.steps[0])) { bubble(c, 'bot', h('div', 'That one needs AI – it has to read your project or interviews and work it out.'), h('div.field-hint', 'Add a Claude or Gemini key (or a local model) in Settings.'), ui.button('Open Settings', { small: true, kind: 'ghost', onClick: () => US.tools.open('settings') })); return; }
        if (off.alternatives.filter(own).length > 1) { bubble(c, 'bot', h('div', 'That could mean a few things. Which one?'), h('div.chat-chips', off.alternatives.filter(own).map(alt => { const a = US.actions.get(alt.action); return h('button.chip', { onclick: () => showPlan(c, { reply: 'Here’s what I’ll do:', steps: [{ action: alt.action, params: alt.params }] }) }, a.title); }))); return; }
        const near = suggest(text);
        bubble(c, 'bot', h('div', 'I didn’t recognise that as one of my built-in commands.'), near.length ? h('div', h('div.field-hint', 'Did you mean:'), chips(near.map(x => x.ex))) : chips(exampleChips(6)),
          h('div.field-hint', 'Add a Claude or Gemini key in Settings and I’ll handle anything you ask.'), ui.button('Open Settings', { small: true, kind: 'ghost', onClick: () => US.tools.open('settings') }));
        return;
      }
      return converse(c, text);
    }
    /** A request typed in a chat that the AI doesn't handle (a built-in command): shown, and kept with the chat. */
    function note(c, text) { if (c.title === 'New chat') c.title = C.titleOf(text); const it = { k: 'me', text, at: Date.now() }; c.items.push(it); render(c, it); drawTabs(); keep(); }
    async function converse(c, text, extra = {}) {
      const wasAway = away();
      try {
        await C.send(c, text, { event: it => { render(c, it); keep(); drawCost(); }, status: () => drawTabs(), approve: card => approve(c, card), choose: q => choose(c, q), limit: l => limit(c, l), warn: w => warn(c, w), trace: () => { if (c === cur) drawWorking(); }, journal: () => { if (c === cur) drawTabs(); keep(); }, planApprove: p => planApprove(c, p), resume: (chat, f) => converse(chat, f.text, { unattended: true }) },
          Object.assign({ mode, maxSteps: +set('maxSteps', 25), budget, persona: PERSONA, limits: { spend: +set('riskSpend', 1) || 1 } }, extra));
      } catch (e) { ui.showError(e); }
      finally { c.pending = null; c.pendingKind = ''; c.ask = null; drawTabs(); keep();
        // finished while the editor was on another tab: a dot on the Ask button, and a word
        if ((wasAway || away()) && away()) { railDone(true); if (US.ui.toast) ui.toast({ type: 'ok', title: `${PERSONA ? 'Producer' : 'Ask'}: “${c.title}” has finished`, text: extra.unattended ? 'It came back to it as planned.' : '', timeout: 8000, action: { label: 'Show', fn: () => { US.tools.open(TOOL, PERSONA ? { page: 'chat' } : undefined); show(c); } } }); }
        else if (c !== cur && US.ui.toast) ui.toast({ type: 'ok', title: `“${c.title}” has finished`, timeout: 5000, action: { label: 'Show', fn: () => { US.tools.open(TOOL); show(c); } } }); }
    }

    /* ----- built-in commands: the plan, then Run ----- */
    function showAll(c) {
      const byTool = new Map();
      for (const a of US.actions.list()) { const n = (US.tools.get(a.tool) || {}).name || a.tool; if (!byTool.has(n)) byTool.set(n, []); byTool.get(n).push(a); }
      bubble(c, 'bot', h('div', 'Here’s everything I can do:'), Array.from(byTool.entries()).map(([n, acts]) => h('div.chat-group', h('div.field-label', n), chips(acts.map(a => (a.examples && a.examples[0]) || a.title)))));
    }
    function showPlan(c, plan) {
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
      bubble(c, 'bot', card);
      cancel.addEventListener('click', () => { runBtn.disabled = cancel.disabled = true; status.textContent = 'Cancelled.'; });
      runBtn.addEventListener('click', async () => {
        if (US.jobs.current) { ui.toast({ type: 'warn', title: 'Something else is still running.', text: 'Wait for it to finish, or press Stop.' }); return; }
        runBtn.disabled = cancel.disabled = true;
        for (let i = 0; i < steps.length; i++) {
          status.textContent = `Running step ${i + 1} of ${steps.length}…`;
          const r = await US.actions.run(steps[i].action, steps[i].params);
          if (r === undefined) { status.textContent = `Stopped at step ${i + 1}. Nothing after it ran.`; bubble(c, 'bot', h('div', `Step ${i + 1} didn’t finish – see the message above. ${i ? 'The earlier steps are done.' : ''}`)); return; }
          bubble(c, 'bot', h('div.done', US.icon('ok', 15), h('span', `${describeStep(steps[i]).title}: ${r.summary || 'done'}`)));
          if (r.ask) showAsk(c, r.ask);
        }
        status.textContent = 'All done.';
        card.appendChild(h('div.row', ui.button('Save as a recipe', { small: true, kind: 'ghost', icon: 'plus', title: 'Run these steps again later, on any project, in one go', onClick: () => saveRecipe(steps, '') })));
      });
    }

    /* ----- recipes: saved chains of steps ----- */
    function recipeChips(c) {
      if (!US.recipes) return null;
      const rs = US.recipes.list().slice(0, 6);
      return h('div', h('div.field-label', 'Recipes'), h('div.chat-chips', rs.map(r => h('button.chip', { title: US.recipes.describe(r), onclick: () => { bubble(c, 'me', `Run “${r.name}”`); runRecipe(c, r); } }, r.name)),
        h('button.chip.ghost', { onclick: () => showRecipes(c) }, 'All recipes…')));
    }
    function showRecipes(c) {
      const rows = US.recipes.list().map(r => h('div.list-row',
        h('div.list-main', h('div.list-title', r.name, r.starter ? ui.pill('starter', 'var(--text-2)') : null), h('div.list-sub', US.recipes.describe(r))),
        h('div.songs-actions',
          ui.button('Run', { small: true, kind: 'primary', onClick: () => { bubble(c, 'me', `Run “${r.name}”`); runRecipe(c, r); } }),
          r.starter ? null : ui.button('Rename', { small: true, kind: 'ghost', onClick: async () => { const nm = await ui.promptText({ title: 'Recipe name', value: r.name, ok: 'Rename' }); if (nm) { US.recipes.rename(r.id, nm); showRecipes(c); } } }),
          r.starter ? null : ui.button('Delete', { small: true, kind: 'ghost', onClick: async () => { if (await ui.confirm({ title: `Delete the recipe “${r.name}”?`, ok: 'Delete', danger: true })) { US.recipes.remove(r.id); showRecipes(c); } } }))));
      bubble(c, 'bot wide', h('div', h('div', 'Recipes run their steps one after another, on whatever project is open. Save one from any plan or finished request (“Save as a recipe”).'), h('div.list', rows)));
    }
    async function saveRecipe(steps, suggested) {
      const nm = await ui.promptText({ title: 'Save as a recipe', label: 'Name it so you can run it again on another project', value: suggested || '', ok: 'Save' });
      if (!nm) return;
      try { const r = US.recipes.save({ name: nm, steps }); ui.toast({ type: 'ok', title: `Saved “${r.name}”`, text: US.recipes.describe(r), timeout: 5000 }); } catch (e) { ui.showError(e); }
    }
    async function runRecipe(c, r) {
      if (US.jobs.current || c.status !== 'idle') { ui.toast({ type: 'warn', title: 'Something else is still running.', text: 'Wait for it to finish, or press Stop.' }); return; }
      const status = h('div.plan-status', 'Starting…'), lines = h('ol.plan-steps', r.steps.map(s => h('li', s.edit != null ? `Ask: “${s.edit}”` : US.say((US.actions.get(s.action) || {}).title || s.action))));
      bubble(c, 'bot', h('div.plan', h('b', r.name), lines, status));
      const out = await US.recipes.run(r, {
        onStep: (i, s, phase, res) => { const li = lines.children[i]; if (!li) return; if (phase === 'start') { status.textContent = `Step ${i + 1} of ${r.steps.length}…`; li.classList.add('running'); } else { li.classList.remove('running'); li.classList.add('done'); if (res && res.summary) li.appendChild(h('div.field-hint', res.summary)); } },
        // a step in words is asked in this chat, like typing it
        onEdit: async s => { if (!aiOn()) return false; const where = { selection: ' (on the selected clips)', transcripts: ' (on the transcript lines heard in the sequence)', bin: ' (in the bin)', project: ' (in the whole project)' }[s.where] || ''; const n = c.items.length; await converse(c, s.edit + where); return c.items.slice(n).some(x => x.k === 'end'); }
      });
      status.textContent = out.stoppedAt < 0 ? `All ${US.plural(out.of, 'step')} done.` : `Stopped at step ${out.stoppedAt + 1} of ${out.of}. Nothing after it ran.`;
    }

    /* ----- putting it together: the bar of chats and the options stay at the top; only the messages scroll ----- */
    const head = h('div.chat-head', h('div.chat-top', tabs, counter, alwaysChip, undoAllBtn), settingsSec);
    const foot = h('div.chat-foot', followBar, working, answers, micRow, h('div.chat-bar', input, D && D.supported() ? micBtn : null, sendBtn, stopBtn), costLine);
    function load() {
      for (const c of chats) c.logEl.remove();
      chats = [];
      try { for (const s of stored().open.slice(0, 8)) { const c = C.fromStored(s); chats.push(c); mount(c); C.rearm(c); } } catch (e) { chats = []; }
      show(chats.length ? chats[chats.length - 1] : add());
    }
    let project = (US.ctx && US.ctx.project && (US.ctx.project.path || US.ctx.project.name)) || '';
    load();
    US.bus.on('settings', US.debounce(drawModels, 300));
    US.bus.on('secrets', US.debounce(() => { drawModels(); if (cur && !cur.items.length) { US.clear(cur.logEl); cur.bubbles = []; greet(cur); } }, 300));
    // another project: its own chats (ones still working carry on and stay)
    US.bus.on('context', US.debounce(() => { const p = (US.ctx && US.ctx.project && (US.ctx.project.path || US.ctx.project.name)) || ''; if (p !== project) { project = p; if (!chats.some(c => c.status !== 'idle')) load(); } }, 800));
    return { parts: [head, logs, foot], onShow() { railDone(false); drawModels(); drawTabs(); setTimeout(() => input.focus(), 50); }, _chats: () => chats, _submit: submit, _show: show, _add: add, _undo: doUndo, _mic: mic };
  };

  US.tools.register({
    id: 'assistant', name: 'Assistant', short: 'Ask', icon: 'ask', order: 40,
    hostFns: ['editRead', 'editSelection', 'editApply', 'editProject', 'cloneSequence', 'setLabels', 'renameItem', 'moveItems', 'binItems', 'placeClips', 'listSequences', 'listBins', 'deleteSequence', 'removeSequenceMarkers', 'removeClipMarkers', 'askBins', 'askFind', 'ensureBin', 'importFiles', 'itemsInfo', 'askStamp', 'askRemoveBins', 'dictateTranscribe'],
    blurb: 'Say what you want in plain English – it reads your project, asks when it isn’t sure, shows what it will do and does it.',
    create() {
      const v = ui.toolView({ icon: 'ask', title: 'Assistant', blurb: 'One chat for everything: run a tool, change a sequence or the project, ask about your interviews or how to do something. It says what it understood and what it will do, and asks before it changes anything.',
        help: h('div', h('p', 'Type what you want – or press the microphone and say it (your speech is turned into words on this computer). It reads your project as text (names, times, tracks, labels, effects, transcripts, and the written descriptions of your footage), tells you what it understood and its plan, and works step by step. Before a step that changes something you get a card to approve; choose how often it asks with the first menu under the chats, or press Always proceed on a card.'),
          h('p', 'Whatever you choose, it stops and warns you before anything risky: changing a sequence itself, deleting, a lot at once, long or heavy work, something that can’t be undone, a costly step, or footage leaving this computer. Change course pauses the plan so you can say what you’d like instead.'),
          h('p', 'While it works, the row above the chat box shows what it is doing; “Behind the scenes” lists every step in detail. Undo this reply takes back what one answer did; Undo all takes back everything the AI did in the chat – it says plainly what can’t be undone.'),
          h('p', 'It works on its own where it can: it searches and downloads B-roll for you (you untick what you don’t want), finds things in a big project, makes bins, brings in folders, waits for a job to finish, and can set itself a time to come back (“check again in 30 minutes”) – you see a countdown and can cancel. On its own it never runs anything risky: it waits for you.'),
          h('p', 'Start another chat with + while one is working: they think side by side and take turns in Premiere. A dot on a chat shows it is working, or waiting for you.'),
          h('p', 'Common requests (cut the silences, add captions, check the cut…) work without any AI key.')) });
      const view = US.chatView({ key: 'assistant', tool: 'assistant' });
      v.body.append(...view.parts);
      v.el.classList.add('chat-tool');
      return { el: v.el, onShow: view.onShow, _chats: view._chats, _submit: view._submit, _show: view._show, _add: view._add, _undo: view._undo };
    }
  });
})();
