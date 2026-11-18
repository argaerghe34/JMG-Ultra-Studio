/* JMG Ultra Studio – Assistant (the Ask tab): one chat box for everything. Built-in commands work with no key (a plan,
   then Run); with a Claude, Gemini or local AI the chat in 40-assistant-chat.js understands anything, reads the
   project, asks when unsure, and does it – several chats at once. This file: the offline matching and the screen. */
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

  /* ---------- the screen: one chat box for everything, several chats at once ---------- */
  US.tools.register({
    id: 'assistant', name: 'Assistant', short: 'Ask', icon: 'ask', order: 40,
    hostFns: ['editRead', 'editSelection', 'editApply', 'editProject', 'cloneSequence', 'setLabels', 'renameItem', 'moveItems', 'binItems', 'placeClips'],
    blurb: 'Say what you want in plain English – it reads your project, asks when it isn’t sure, shows what it will do and does it.',
    create() {
      const C = US.chat, E = US.editAsk;
      const v = ui.toolView({ icon: 'ask', title: 'Assistant', blurb: 'One chat for everything: run a tool, change a sequence or the project, ask about your interviews or how to do something. It says what it understood and what it will do, and asks before it changes anything.',
        help: h('div', h('p', 'Type what you want. It reads your project as text (names, times, tracks, labels, effects, transcripts, and the written descriptions of your footage), tells you what it understood and its plan, and works step by step. Before a step that changes something you get a card to approve; choose how often it asks with the first menu under the chats.'),
          h('p', 'Start another chat with + while one is working: they think side by side and take turns in Premiere. A dot on a chat shows it is working, or waiting for you.'),
          h('p', 'Common requests (cut the silences, add captions, check the cut…) work without any AI key.')) });
      const aiOn = () => !!(US.ai && US.ai.available());
      const PLACEHOLDER = 'e.g. cut the silences · a cross dissolve on every cut on V1 · every story about Grandma, in order · put the drone clips in a Drone bin';
      const EXAMPLES = ['Organise this project into bins by kind of clip', 'A cross dissolve on every cut on V1', 'Every story about family, in the order it happened', 'Which stories about family haven’t I used yet?', 'Tighten this cut: take out the pauses and check it', 'Lower thirds with the speaker’s name the first time each person talks', 'How do I export just the audio?'];

      /* ----- the chats ----- */
      let chats = [], cur = null;
      const tabs = h('div.chat-tabs'), logs = h('div.chat-logs'), counter = h('span.field-hint.chat-count');
      const input = h('textarea.input.chat-input', { rows: 2, placeholder: PLACEHOLDER });
      const sendBtn = ui.button('Send', { kind: 'primary', icon: 'chevron', onClick: () => submit() });
      const stopBtn = ui.button('Stop', { kind: 'ghost', onClick: () => { if (cur) { C.stop(cur); if (cur.pending) cur.pending(null); } } });
      input.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); } });
      let mode = US.settings.get('assistant.permission', 'ask');
      const modeSel = ui.select({ options: C.MODES.map(m => ({ value: m.id, label: m.label })), value: mode, onChange: x => { mode = x; US.settings.set('assistant.permission', x); modeSel.title = (C.MODES.find(m => m.id === x) || {}).hint || ''; } });
      modeSel.title = (C.MODES.find(m => m.id === mode) || {}).hint || '';
      const modelSel = ui.select({ options: [], onChange: x => { if (cur) { cur.model = x; keep(); } US.settings.set('assistant.model', x); } });
      function drawModels() {
        const cs = US.ai && US.ai.choices ? US.ai.choices() : [{ id: 'auto', label: 'Automatic', hint: '' }];
        const want = (cur && cur.model) || 'auto';
        modelSel.setOptions(cs.map(c => ({ value: c.id, label: c.id === 'auto' ? `AI: automatic${aiOn() ? ` (${US.ai.label()})` : ''}` : `AI: ${c.label}` })), cs.some(c => c.id === want) ? want : 'auto');
        modelSel.title = 'Which AI this chat uses. Text is sent; small stills only when you’ve allowed them for the project. Never video or sound.';
        modelSel.disabled = !aiOn();
      }
      // what one request may spend before it stops to ask (0 = no limit: the cost is still shown as it goes)
      const LIMITS = [0.5, 2, 5, 10, 0];
      let budget = +US.settings.get('assistant.budget', 2); if (!LIMITS.includes(budget)) budget = 2;
      const usd = x => (US.ai && US.ai.fmtUSD ? US.ai.fmtUSD(x) : '$' + x.toFixed(2));
      const limitSel = ui.select({ options: LIMITS.map(x => ({ value: String(x), label: x ? `Stop to ask at $${x % 1 ? x.toFixed(2) : x} a request` : 'No spending limit' })), value: String(budget), onChange: x => { budget = +x; US.settings.set('assistant.budget', budget); } });
      limitSel.title = 'How much one request may spend on AI before it stops and asks you. It never stops silently: you can let it carry on, or lift the limit for the chat. Your monthly AI limit in Settings always holds. Gemini’s free allowance and a local model cost nothing.';
      const costLine = h('div.field-hint.chat-cost');
      function drawCost() { const c = cur, m = US.ai && US.ai.spending ? US.ai.spending().cost : 0; costLine.textContent = c && c.spent > 0.004 ? `AI cost – this chat: ${usd(c.spent)} · this month: ${usd(m)}` : m > 0.004 ? `AI cost this month: ${usd(m)}` : ''; costLine.title = 'What the AI has cost: this chat so far, and everything this month (Settings shows it by feature and by key).'; }
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
          const sel = ui.select({ options: old.slice(0, 30).map(o => ({ value: o.id, label: o.title })), placeholder: 'Earlier…', onChange: id => { const s = earlier().find(o => o.id === id); if (s) { const c = C.fromStored(s); chats.push(c); show(c); keep(); } } });
          sel.classList.add('chat-earlier'); tabs.appendChild(sel);
        }
        const busy = chats.filter(c => c.status !== 'idle').length;
        counter.textContent = busy ? `${US.plural(busy, 'chat')} working` : '';
        const mine = cur && cur.status !== 'idle';
        stopBtn.classList.toggle('hidden', !mine); sendBtn.classList.toggle('hidden', !!mine && !cur.pending);
        drawCost();
      }
      /** Chats kept with the project: the open ones and, under Earlier, the ones closed (the newest 30). */
      // in the project's own store (not projectSettings: that falls back to the last project's value, and chats belong to one project)
      const pstore = () => US.projectStore((US.ctx && US.ctx.project && (US.ctx.project.path || US.ctx.project.name)) || 'none');
      const stored = () => { let s = null; try { s = pstore().get('assistant.chats'); } catch (e) { s = null; } return s && Array.isArray(s.open) ? s : { open: [], closed: [] }; };
      const store = val => pstore().set('assistant.chats', val);
      const earlier = () => stored().closed.filter(o => !chats.some(c => c.id === o.id));
      const keep = US.debounce(() => { try { const s = stored(); store({ open: chats.filter(c => c.items.length).map(C.toStored), closed: s.closed.filter(o => !chats.some(c => c.id === o.id)).slice(0, 30) }); } catch (e) { /* a convenience */ } }, 600);
      function add() { const c = C.newChat({ model: US.settings.get('assistant.model', 'auto') }); chats.push(c); mount(c); return c; }
      function mount(c) { c.logEl = h('div.chat.hidden'); c.bubbles = []; logs.appendChild(c.logEl); if (c.items.length) { for (const it of c.items) render(c, it, true); } else greet(c); }
      function show(c) { cur = c; for (const x of chats) x.logEl.classList.toggle('hidden', x !== c); drawTabs(); drawModels(); const last = c.logEl.lastChild; if (last && last.scrollIntoView) last.scrollIntoView({ block: 'end' }); setTimeout(() => input.focus(), 30); }
      function close(c) {
        if (c.status !== 'idle') { C.stop(c); if (c.pending) c.pending(null); }
        chats = chats.filter(x => x !== c); c.logEl.remove();
        if (c.items.length) { try { const s = stored(); store({ open: s.open.filter(o => o.id !== c.id), closed: [C.toStored(c)].concat(s.closed.filter(o => o.id !== c.id)).slice(0, 30) }); } catch (e) { /* a convenience */ } }
        if (!chats.length) add();
        if (cur === c) show(chats[chats.length - 1]); else drawTabs();
        keep();
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
        const asks = (US.story && US.story.asks ? (() => { try { return US.story.asks(); } catch (e) { return []; } })() : []).slice(0, 4);
        if (aiOn()) bubble(c, 'bot', h('div', 'Tell me what you want – in your own words. I read your project, sequences and interviews as text, tell you what I understood and what I’ll do, ask when I’m not sure, and ask before I change anything.'), chips(EXAMPLES),
          h('div.field-hint', `Worked out by ${US.ai.label()}. Text is sent – and a few small stills only if you’ve switched that on for this project (you’re asked each time); never video or sound. Start another chat with + while this one works.`),
          asks.length ? h('div', h('div.field-hint', 'Earlier answers from your interviews:'), h('div.chat-chips', asks.map(a => h('button.chip', { onclick: () => { bubble(c, 'me', a.request); showAsk(c, a); } }, US.storyAsk.title(a.request))))) : null,
          recipeChips(c));
        else bubble(c, 'bot', h('div', 'Hi! I can run any JMG Ultra Studio tool for you. Try one of these:'), chips(exampleChips()),
          h('div.field-hint', 'These work without any AI. Add a Claude or Gemini key in Settings and I’ll understand anything you ask – edits, questions about your interviews, several steps at once.'),
          ui.button('Open Settings', { small: true, kind: 'ghost', onClick: () => US.tools.open('settings') }), recipeChips(c));
      }
      const goTo = (m, t, seqId) => { if (t.seqId) US.host.call('openSequence', { seqId: t.seqId }).then(() => (t.start != null ? US.host.call('setPlayhead', { seqId: t.seqId, seconds: t.start }) : null)).catch(e => ui.showError(e)); else if (m && m.kind === 'timeline' && t.start != null) US.host.call('setPlayhead', { seqId: seqId || m.seq.id, seconds: t.start }).catch(e => ui.showError(e)); else if (t.itemId) US.host.call('revealItem', { id: t.itemId }).catch(() => {}); };
      const targetName = t => (t.line ? `${t.speaker ? t.speaker + ': ' : ''}${(t.text || '').slice(0, 40)}` : t.itemId || t.sequence ? t.name : t.seqName ? `${t.seqName}: ${t.kind === 'audio' ? 'A' : 'V'}${t.track + 1} ${US.fmtDur(t.start)}` : `${t.kind === 'audio' ? 'A' : 'V'}${t.track + 1} ${US.fmtDur(t.start)} ${t.name || ''}`.trim());
      const RISK = { new: ['makes something new', 'var(--info)'], own: ['changes your own work', 'var(--warn)'], out: ['writes files', 'var(--warn)'], sees: ['stills leave this computer', 'var(--warn)'] };
      /** A card to approve before a step runs. -> {ok, always, steps} */
      function approve(c, card) {
        return new Promise(res => {
          const steps = card.steps || [], on = steps.map(() => true);
          const rowsEl = steps.length ? h('ol.plan-steps', steps.map((s, i) => {
            const more = h('div.edit-targets.hidden', s.targets.slice(0, 40).map(t => h('button.chip', { title: 'Go there', onclick: () => goTo(card.model, t) }, targetName(t))), s.targets.length > 40 ? h('span.field-hint', `…and ${s.targets.length - 40} more`) : null);
            return h('li.edit-step', h('label.row', h('input', { type: 'checkbox', checked: true, onchange: e => { on[i] = e.target.checked; } }), h('div.grow', h('b', E.describe(s)), s.why ? h('div.field-hint', s.why) : null)), h('button.btn.small.ghost', { onclick: () => more.classList.toggle('hidden') }, 'Which'), more);
          })) : null;
          const status = h('div.plan-status');
          const done = (r, text) => { c.pending = null; box.classList.add('chat-card-done'); status.textContent = text; drawTabs(); res(r); };
          const go = always => { const pick = steps.filter((x, i) => on[i]); if (steps.length && !pick.length) { status.textContent = 'Tick at least one, or press Skip.'; return; } done({ ok: true, always, steps: pick }, always ? 'Approved – I won’t ask again in this chat for steps like this.' : 'Approved.'); };
          const box = bubble(c, 'bot wide chat-card', h('div.plan',
            h('div.row', h('div.field-label.grow', 'May I?'), RISK[card.risk] ? ui.pill(RISK[card.risk][0], RISK[card.risk][1]) : null),
            h('div', h('b', US.say(card.title))), card.detail ? h('div.field-hint.pre', US.say(card.detail)) : null, rowsEl,
            card.dropped && card.dropped.length ? h('div.field-hint', 'Left out: ' + card.dropped.join(' · ')) : null,
            h('div.row.chat-card-btns', ui.button('Proceed', { kind: 'primary', small: true, icon: 'play', onClick: () => go(false) }),
              card.risk === 'new' ? ui.button('Always proceed', { small: true, title: 'Don’t ask again in this chat before steps that only make new things (copies, new sequences, markers). Changes to your own work and exports are still asked about.', onClick: () => go(true) }) : null,
              ui.button('Skip', { kind: 'ghost', small: true, onClick: () => done({ ok: false }, 'Skipped – it didn’t run.') })), status));
          c.pending = v => { if (v == null) done({ ok: false }, 'Stopped.'); else if (/^(y|yes|yep|ok|okay|go|go ahead|proceed|do it|sure|fine)\b/i.test(v)) { bubble(c, 'me', v); go(false); } else { bubble(c, 'me', v); done({ ok: false, note: v }, 'Not run – I’ll go by what you said instead.'); } };
          drawTabs();
        });
      }
      /** At a limit: say what's been spent and let the editor decide. -> 'more' | 'free' | 'stop' */
      function limit(c, l) {
        return new Promise(res => {
          const status = h('div.plan-status');
          const done = (r, text) => { c.pending = null; box.classList.add('chat-card-done'); status.textContent = text; drawTabs(); res(r); };
          const money = l.kind === 'money';
          const box = bubble(c, 'bot wide chat-card', h('div.plan', h('div.row', h('div.field-label.grow', money ? 'Spending check' : 'Still going'), ui.pill(money ? usd(l.used) + ' so far' : `${l.used} steps`, 'var(--warn)')),
            h('div', money ? `This request has used about ${usd(l.used)} of AI – the amount you set it to stop and ask at (${usd(l.limit)}). I’m not finished.` : `This request has taken ${l.used} steps and I’m not finished.`),
            h('div.field-hint', `This chat altogether: ${usd(l.total)}. Nothing is lost if you stop – what’s made so far is kept.`),
            h('div.row.chat-card-btns', ui.button(money ? `Carry on (up to ${usd(l.limit + budget)})` : 'Carry on', { kind: 'primary', small: true, onClick: () => done('more', 'Carrying on.') }),
              ui.button('No limit for this chat', { small: true, title: 'This chat won’t stop to ask again. The cost keeps showing under the chat box, and your monthly limit in Settings still holds.', onClick: () => done('free', 'No limit for this chat – the cost keeps showing below.') }),
              ui.button('Stop here', { kind: 'ghost', small: true, onClick: () => done('stop', 'Stopped here.') })), status));
          c.pending = v => { if (v == null) done('stop', 'Stopped.'); else if (/^(y|yes|ok|okay|go|carry on|continue|more|sure)\b/i.test(v)) done('more', 'Carrying on.'); else done('stop', 'Stopped here.'); };
          drawTabs();
        });
      }
      /** A question with answers to pick from (or type one). -> the answer, or null */
      function choose(c, q) {
        return new Promise(res => {
          const pr = q.project || { bins: [], sequences: [], clips: [] };
          const status = h('div.plan-status'), own = h('input.input', { placeholder: 'Or type your answer' });
          const done = (ans, shown) => { c.pending = null; box.classList.add('chat-card-done'); if (ans != null) bubble(c, 'me', shown || ans); else status.textContent = 'Closed.'; drawTabs(); res(ans); };
          let picker = null;
          if (q.kind === 'clip' && pr.clips.length) {
            const pick = list => list.slice(0, 500).map(x => ({ value: x.id, label: `${x.name}${x.bin && x.bin !== '(Project root)' ? `  –  ${x.bin}` : ''}` }));
            const sel = ui.select({ options: pick(pr.clips), placeholder: 'Choose the clip…', onChange: id => { const x = pr.clips.find(y => y.id === id); if (x) done(`the clip “${x.name}” (${x.id}${x.bin ? `, in ${x.bin}` : ''})`, x.name); } });
            const find = h('input.input', { placeholder: 'Type part of its name to find it' });
            find.addEventListener('input', () => { const w = find.value.trim().toLowerCase(); sel.setOptions(pick(w ? pr.clips.filter(x => `${x.name} ${x.file}`.toLowerCase().includes(w)) : pr.clips), ''); });
            picker = h('div.edit-question', find, sel);
          } else if (q.kind === 'bin' && pr.bins.length) picker = ui.select({ options: pr.bins.slice().sort((a, b) => a.localeCompare(b)).map(b => ({ value: b, label: b })), placeholder: 'Choose the bin…', onChange: b => { if (b) done(`the bin “${b}”`, b); } });
          else if (q.kind === 'sequence' && pr.sequences.length) picker = ui.select({ options: pr.sequences.map(x => ({ value: x.id, label: `${x.name}${x.bin && x.bin !== '(Project root)' ? `  –  ${x.bin}` : ''}` })), placeholder: US.say('Choose the sequence…'), onChange: id => { const x = pr.sequences.find(y => y.id === id); if (x) done(`the sequence “${x.name}” (${x.id})`, x.name); } });
          else if (q.kind === 'track') { const n = Math.max(3, ...pr.sequences.map(x => x.video || 0)) + 1, a = Math.max(3, ...pr.sequences.map(x => x.audio || 0)) + 1; picker = ui.select({ options: [...Array(n).keys()].map(i => 'V' + (i + 1)).concat([...Array(a).keys()].map(i => 'A' + (i + 1))).map(t => ({ value: t, label: t })), placeholder: 'Choose the track…', onChange: t => { if (t) done(`track ${t}`, t); } }); }
          const send = () => { if (own.value.trim()) done(own.value.trim()); };
          own.addEventListener('keydown', e => { if (e.key === 'Enter') send(); });
          const box = bubble(c, 'bot wide chat-card', h('div.plan', h('div.field-label', 'A question first'), h('div', h('b', US.say(q.question))),
            q.options.length ? h('div.chat-chips', q.options.map(o => h('button.chip.chat-option', { onclick: () => done(o) }, US.say(o)))) : null, picker,
            h('div.row.chat-card-btns', h('div.grow', own), ui.button('Answer', { small: true, onClick: send })), status));
          c.pending = v => done(v);
          drawTabs();
        });
      }
      /** How it got there: what it understood, the plan and every step since the request, the AI and what it cost. */
      function reasoning(c, end) {
        const from = c.items.map(x => x.k).lastIndexOf('me', c.items.indexOf(end) < 0 ? c.items.length : c.items.indexOf(end)), part = c.items.slice(from + 1).filter(x => x !== end);
        const u = part.find(x => x.k === 'understood'), plans = part.filter(x => x.k === 'plan'), steps = part.filter(x => x.k === 'step');
        const body = h('div.chat-why.hidden',
          u ? h('div', h('div.field-label', 'What I understood'), h('div', u.text)) : null,
          plans.length ? h('div', h('div.field-label', 'The plan'), h('ol.agent-plan-list', plans[plans.length - 1].plan.map(p => h('li', p)))) : null,
          steps.length ? h('div', h('div.field-label', 'What I did'), h('ol.agent-plan-list', steps.map(s => h('li', s.text, s.result ? h('span.agent-res', ' → ' + s.result) : null)))) : null,
          h('div.field-hint', `${end.model || 'AI'} · ${US.plural(end.steps || 0, 'step')}${end.spent > 0.004 ? ` · about ${usd(end.spent)}` : ''}${steps.some(x => x.tool === 'look') ? ' · text and the stills you approved were sent' : ' · only text was sent'}`));
        return h('div', h('button.btn.small.ghost.chat-why-btn', { onclick: () => body.classList.toggle('hidden') }, 'How I got there'), body);
      }
      function render(c, it, old = false) {
        if (it.k === 'me') bubble(c, 'me', it.text);
        else if (it.k === 'understood') bubble(c, 'bot chat-understood', h('div.field-label', 'What I understand'), h('div', it.text));
        else if (it.k === 'plan') bubble(c, 'bot chat-plan', h('div.field-label', 'Plan'), h('ol.agent-plan-list', it.plan.map(p => h('li', p))));
        else if (it.k === 'say') bubble(c, 'bot agent-say', it.text);
        else if (it.k === 'step') { it.el = bubble(c, 'bot agent-tool', h('span.agent-step', US.say(it.text)), it.result ? h('span.agent-res', ' → ' + it.result) : null); }
        else if (it.k === 'result') { const el = it.on && it.on.el; if (el) el.appendChild(h('span.agent-res', ' → ' + it.text)); }
        else if (it.k === 'warn') bubble(c, 'bot agent-warn', it.text);
        else if (it.k === 'card' && it.card === 'ask') { try { const a = US.story.asks().find(x => x.id === it.askId); if (a) showAsk(c, a); } catch (e) { /* the answer is gone */ } }
        else if (it.k === 'undo' && !old) bubble(c, 'bot agent-say', ui.button('Undo that', { small: true, kind: 'ghost', title: 'Puts labels, names and bins back as they were', onClick: () => US.jobs.run({ title: 'Putting it back', tool: 'assistant' }, async () => { await E.undoItems(it.undo); return { summary: 'Put back as it was' }; }) }));
        else if (it.k === 'unplace' && !old) bubble(c, 'bot agent-say', ui.button('Take them out again', { small: true, kind: 'ghost', onClick: () => US.jobs.run({ title: 'Taking them out again', tool: 'assistant' }, async () => ({ summary: `Took out ${US.plural(await E.unplace(it.unplace), 'clip')}` })) }));
        else if (it.k === 'end') {
          const seqs = (it.versions || []).filter((x, i, a) => a.findIndex(y => y.seqId === x.seqId) === i);
          const list = (label, xs, cls) => (xs && xs.length ? h('div', h('div.field-label', label), h('ul.chat-list' + (cls || ''), xs.map(x => h('li', x)))) : null);
          const asked = (c.items.slice(0, c.items.indexOf(it)).reverse().find(x => x.k === 'me') || {}).text || '';
          bubble(c, 'bot wide chat-end', it.reply ? h('div.chat-reply', it.reply) : null, list('Done', it.done, '.ok'), list('Not done', it.notDone, '.no'), list('Worth checking', it.check),
            seqs.length ? h('div', h('div.field-label', US.say('Sequences I made (yours are untouched)')), h('div.agent-seqs', seqs.map(x => h('div.row', h('span.grow', x.name, h('span.field-hint', ` – ${x.why}`)), ui.button('Open', { small: true, kind: 'ghost', onClick: () => US.host.call('openSequence', { seqId: x.seqId }).catch(err => ui.showError(err)) }))))) : null,
            it.next && it.next.length && !old ? h('div.chat-chips', it.next.map(x => h('button.chip', { onclick: () => { input.value = x; submit(); } }, x))) : null,
            it.spent > 0.004 ? h('div.field-hint', `This request: about ${usd(it.spent)} of AI (${it.model || 'AI'})${it.total > it.spent + 0.004 ? ` · this chat: ${usd(it.total)}` : ''}`) : null,
            h('div.row', reasoning(c, it), asked && (it.steps || 0) > 1 && !old ? ui.button('Save as a recipe', { small: true, kind: 'ghost', icon: 'plus', title: 'Ask for this again later, on any project, in one go', onClick: () => saveRecipe([{ edit: asked, where: 'sequence' }], asked.slice(0, 40)) }) : null));
        }
      }
      /** An answer from the interviews, as its card. Changing it (“shorter”, “only Ruth”) asks again in the same conversation with the transcripts, read from the cache. */
      function showAsk(c, a) {
        bubble(c, 'bot wide', US.story.askCard(a, { onRefine: async t => {
          bubble(c, 'me', t);
          const thinking = bubble(c, 'bot', h('div.row', h('div.spinner.small'), h('span.muted', `${aiOn() ? US.ai.label() : 'The AI'} is reading your interviews…`)));
          const r = await US.jobs.run({ title: 'Changing the answer', tool: 'assistant', who: US.jobs.WHO.ai, about: US.storyContext && US.storyContext.about ? US.storyContext.about(t) : '' }, job => US.story.askInterviews(job, { request: t, askId: a.id }));
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
      async function converse(c, text) {
        try {
          await C.send(c, text, { event: it => { render(c, it); keep(); drawCost(); }, status: () => drawTabs(), approve: card => approve(c, card), choose: q => choose(c, q), limit: l => limit(c, l) }, { mode, maxSteps: +US.settings.get('assistant.maxSteps', 25), budget });
        } catch (e) { ui.showError(e); }
        finally { c.pending = null; drawTabs(); keep(); if (c !== cur && US.ui.toast) ui.toast({ type: 'ok', title: `“${c.title}” has finished`, timeout: 5000, action: { label: 'Show', fn: () => { US.tools.open('assistant'); show(c); } } }); }
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

      /* ----- putting it together ----- */
      v.body.append(h('div.chat-top', tabs, counter), h('div.row.chat-opts', modeSel, modelSel, limitSel), logs, h('div.chat-bar', input, sendBtn, stopBtn), costLine);
      function load() {
        for (const c of chats) c.logEl.remove();
        chats = [];
        try { for (const s of stored().open.slice(0, 8)) { const c = C.fromStored(s); chats.push(c); mount(c); } } catch (e) { chats = []; }
        show(chats.length ? chats[chats.length - 1] : add());
      }
      let project = (US.ctx && US.ctx.project && (US.ctx.project.path || US.ctx.project.name)) || '';
      load();
      US.bus.on('settings', US.debounce(drawModels, 300));
      US.bus.on('secrets', US.debounce(() => { drawModels(); if (cur && !cur.items.length) { US.clear(cur.logEl); cur.bubbles = []; greet(cur); } }, 300));
      // another project: its own chats (ones still working carry on and stay)
      US.bus.on('context', US.debounce(() => { const p = (US.ctx && US.ctx.project && (US.ctx.project.path || US.ctx.project.name)) || ''; if (p !== project) { project = p; if (!chats.some(c => c.status !== 'idle')) load(); } }, 800));
      return { el: v.el, onShow() { drawModels(); drawTabs(); setTimeout(() => input.focus(), 50); }, _chats: () => chats, _submit: submit, _show: show, _add: add };
    }
  });
})();
