/* JMG Ultra Studio – Search everything (⌘K / Ctrl+K, or the magnifier in the header): every action the Assistant knows,
   every tool, lines from the interviews and the main settings, in one box (UI review, 18 Nov 2026).
   Return runs an action (one that changes the project asks first), opens a tool, or plays a line in Story › Find;
   ⌘/Ctrl+Return opens an action's tool instead; Tab sends the text to Ask. Anyone can add entries:
   US.search.add(() => [{ kind: 'setting'|'tool'|'action'|'help', title, detail, icon, run }]). */
(function () {
  'use strict';
  const US = window.US, h = US.h, ui = US.ui;
  const KINDS = [['action', 'Do'], ['tool', 'Open'], ['line', 'In your interviews'], ['setting', 'Settings'], ['help', 'Help']];
  const providers = [];

  /** Tools: every registered tool a person can open (Settings included), with where it lives. */
  function toolEntries() {
    return US.tools.list().filter(d => !d.hidden || d.id === 'settings').map(d => {
      const pid = US.placeOf ? US.placeOf(d.id) : null, place = pid && US.PLACES.find(p => p.id === pid);
      const where = pid === 'advanced' && US.PAUSED_TOOLS.includes(d.id) ? 'Advanced › In development' : place && place.id !== d.id && place.name !== d.name ? place.name : '';
      return { kind: 'tool', id: 'tool:' + d.id, title: d.name, detail: [where, d.blurb].filter(Boolean).join(' · '), icon: d.icon, run: () => US.tools.open(d.id) };
    });
  }
  /** Actions: what the Assistant can do, by its plain title. Ones that change the project ask first. */
  function actionEntries() {
    return US.actions.list().map(a => {
      const d = US.tools.get(a.tool);
      return { kind: 'action', id: 'action:' + a.id, title: a.title, detail: (d ? d.name : '') + (a.changes ? ' · works on a copy' : ''), icon: d ? d.icon : 'spark', words: (a.examples || []).join(' '),
        open: d ? () => US.tools.open(d.id) : null,
        run: async () => {
          if (a.changes && !(await ui.confirm({ title: US.say(a.title) + '?', text: US.say('With its usual settings, on the active sequence or your selection. Your own sequence isn’t changed: a new one is made. To choose the settings first, press ⌘/Ctrl+Return to open ' + (d ? d.name : 'the tool') + ' instead.'), ok: 'Run' }))) return;
          US.actions.run(a.id, {}).catch(e => ui.showError(e, { context: a.title }));
        } };
    });
  }
  /** Settings: the sections people look for, each opening Settings there. */
  function settingEntries() {
    const s = (title, detail, section, words) => ({ kind: 'setting', id: 'setting:' + title, title, detail, icon: 'gear', words, run: () => US.tools.open('settings', section ? { section } : undefined) });
    return [
      s('AI: provider, keys and model', 'Settings › AI', 'ai', 'claude gemini key api model cost'),
      s('What was sent to AI', 'Settings › every request’s exact text', 'sent', 'privacy sent requests'),
      s('Without AI – what still works', 'Settings', 'without-ai', 'no ai offline'),
      s('Layout and Classic rail', 'Settings › Layout', 'layout', 'rail classic tabs places layout'),
      s('Markers go on the timeline, clips or both', 'Settings › Markers', null, 'markers clips timeline'),
      s('Updates', 'Settings › check for a new version', 'updates', 'update version install')
    ];
  }
  /** Lines from the interviews (Story's transcripts): a few that contain the words; Return opens Story › Find for them. */
  function lineEntries(q) {
    if (!q || q.length < 3 || !US.story || !US.story.state) return [];
    let st; try { st = US.story.state(); } catch (e) { return []; }
    const out = [], low = q.toLowerCase();
    for (const t of (st && st.transcripts) || []) {
      for (const l of t.lines || []) {
        if (!l.text || !l.text.toLowerCase().includes(low)) continue;
        out.push({ kind: 'line', id: 'line:' + out.length, title: '“' + l.text + '”', detail: [l.speaker || t.name, US.fmtDur ? US.fmtDur(l.start || 0) : ''].filter(Boolean).join(' · '), icon: 'play', run: () => US.tools.open('story', { tab: 'search', query: q }) });
        if (out.length >= 4) return out;
      }
    }
    return out;
  }

  /** Score a text for a query: whole query at a word start beats inside a word; every word must be there. */
  function score(e, q) {
    if (!q) return 1;
    const t = (e.title + ' ' + (e.words || '')).toLowerCase(), d = (e.detail || '').toLowerCase(), words = q.toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.every(w => t.includes(w) || d.includes(w))) return -1;
    const i = t.indexOf(words[0]);
    return (i === 0 ? 100 : i > 0 && /\W/.test(t[i - 1]) ? 80 : i > 0 ? 50 : 20) + (t.includes(q.toLowerCase()) ? 10 : 0) + (e.boost || 0);
  }
  /** Everything that matches, grouped and capped, in the order the box shows them. */
  function results(q) {
    q = (q || '').trim();
    let all = [].concat(actionEntries(), toolEntries(), settingEntries(), lineEntries(q));
    for (const p of providers) { try { all = all.concat(p(q) || []); } catch (e) { /* a provider's problem stays its own */ } }
    const scored = all.map(e => ({ e, s: e.kind === 'line' ? 1 : score(e, q) })).filter(x => x.s >= 0);
    const out = [];
    for (const [k] of KINDS) {
      const g = scored.filter(x => x.e.kind === k).sort((a, b) => b.s - a.s).slice(0, q ? (k === 'action' ? 6 : 4) : (k === 'tool' ? 30 : k === 'help' ? 3 : 0));
      g.forEach(x => out.push(x.e));
    }
    return out;
  }

  /* ---------- the box ---------- */
  let box = null;
  function open(text) {
    if (box) { box.input.focus(); return; }
    const input = h('input.search-input', { type: 'text', placeholder: 'Search tools, actions, interviews, settings…', spellcheck: false, 'aria-label': 'Search everything' });
    const list = h('div.search-list', { role: 'listbox' });
    let shown = [], sel = 0;
    const kindName = Object.fromEntries(KINDS);
    function draw() {
      shown = results(input.value); sel = Math.min(sel, Math.max(0, shown.length - 1));
      US.clear(list);
      let last = null;
      shown.forEach((e, i) => {
        if (e.kind !== last) { last = e.kind; list.appendChild(h('div.search-group', kindName[e.kind] || e.kind)); }
        list.appendChild(h('button.search-item' + (i === sel ? '.on' : ''), { role: 'option', dataset: { i, id: e.id }, onclick: () => choose(i), onmousemove: () => { if (sel !== i) { sel = i; mark(); } } },
          h('span.search-icon', US.icon(e.icon || 'info', 14)), h('span.search-text', h('span.search-title', US.keep(e.title)), e.detail ? h('span.search-detail', e.detail) : null),
          h('span.search-key', e.kind === 'action' ? '↵ run' : e.kind === 'line' ? '↵ find' : '↵ open')));
      });
      if (input.value.trim()) list.appendChild(h('button.search-item.search-ask' + (shown.length ? '' : '.on'), { onclick: () => ask() }, h('span.search-icon', US.icon('ask', 14)), h('span.search-text', h('span.search-title', 'Ask: ', US.keep('“' + input.value.trim() + '”')), h('span.search-detail', 'in plain English, in Ask')), h('span.search-key', 'tab')));
    }
    function mark() { US.$$('.search-item', list).forEach(b => b.classList.toggle('on', +b.dataset.i === sel)); const b = list.querySelector('.search-item.on'); if (b && b.scrollIntoView) b.scrollIntoView({ block: 'nearest' }); }
    function close() { if (!box) return; box.el.remove(); document.removeEventListener('keydown', onKey, true); box = null; }
    function choose(i, alt) { const e = shown[i]; if (!e) return ask(); close(); (alt && e.open ? e.open : e.run)(); }
    function ask() {
      const t = input.value.trim(); close();
      if (!US.tools.get('assistant')) return;
      US.tools.open('assistant');
      // the Ask screen's box gets the words (whichever version of the Ask tab is installed)
      setTimeout(() => { const ta = document.querySelector('.tool:not(.hidden) textarea, .tool:not(.hidden) input[type=text]'); if (ta && t) { ta.value = t; ta.dispatchEvent(new Event('input', { bubbles: true })); ta.focus(); } }, 60);
    }
    function onKey(ev) {
      if (ev.key === 'Escape') { ev.preventDefault(); close(); }
      else if (ev.key === 'ArrowDown') { ev.preventDefault(); sel = Math.min(sel + 1, shown.length - 1); mark(); }
      else if (ev.key === 'ArrowUp') { ev.preventDefault(); sel = Math.max(sel - 1, 0); mark(); }
      else if (ev.key === 'Enter') { ev.preventDefault(); shown.length ? choose(sel, ev.metaKey || ev.ctrlKey) : ask(); }
      else if (ev.key === 'Tab') { ev.preventDefault(); if (input.value.trim()) ask(); }
    }
    input.addEventListener('input', () => { sel = 0; draw(); });
    const panel = h('div.search-box', { role: 'dialog', 'aria-label': 'Search everything' },
      h('div.search-head', US.icon('search', 15), input, h('span.kbd', 'esc')), list,
      h('div.search-foot', h('span', h('span.kbd', '↑'), h('span.kbd', '↓'), ' move'), h('span', h('span.kbd', '↵'), ' run or open'), h('span', h('span.kbd', US.fsx && US.fsx.isWin ? 'Ctrl' : '⌘'), h('span.kbd', '↵'), ' open the tool'), h('span', h('span.kbd', 'tab'), ' ask')));
    const el = h('div.search-scrim', { onclick: e => { if (e.target === el) close(); } }, panel);
    document.body.appendChild(el);
    document.addEventListener('keydown', onKey, true);
    box = { el, input };
    if (text) input.value = text;
    draw();
    setTimeout(() => input.focus(), 0);
  }

  US.search = { open, results, add: fn => providers.push(fn), close: () => box && box.el.remove() };
  // ⌘K / Ctrl+K while the panel has focus (Premiere and Resolve keep their own shortcuts otherwise)
  document.addEventListener('keydown', e => { if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && (e.key === 'k' || e.key === 'K')) { e.preventDefault(); open(); } });
})();
