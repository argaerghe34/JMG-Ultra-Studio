/* JMG Ultra Studio – Story › Lines: every theme and line in one table, with a panel for the line you pick (UI review,
   mock-up 5 – the wide view). Wide panel: themes | lines | the line. Narrow panel: the same, stacked.
   It only reads Story (US.story) and uses Story's own play / Source Monitor / playhead / drag, so what it does is exactly
   what Story's own buttons do. Keys (while the table has focus): J/K or ↓/↑ move, Space plays, Return puts the selected
   lines at the playhead, / filters, Esc clears the filter. */
(function () {
  'use strict';
  const US = window.US, h = US.h, ui = US.ui;
  const LEVELS = [['all', 'Everything'], ['balanced', 'Balanced'], ['best', 'Only the best']];
  const hexOf = th => th && th.label != null ? (US.ui.LABELS[th.label] || US.ui.LABELS[0]).hex : 'var(--text-3)';

  US.tools.register({
    id: 'storylines', name: 'Lines', short: 'Lines', icon: 'log', group: 'find', place: 'story', order: 22.2, wide: true,
    blurb: 'Every theme and line in one table, with the line you pick beside it – best with a wide panel.',
    create() {
      const v = ui.toolView({ icon: 'log', title: 'Lines', blurb: 'Every theme and line from your interviews in one table. Pick a theme on the left, a line in the middle, and see it – with what you can do with it – on the right. Widen the panel (or undock it) to see all three side by side.' });
      v.el.classList.add('sl');
      let themeId = 'all', level = null, query = '', sel = new Set(), cursor = null, sort = { key: 'time', dir: 1 }, shown = [], limit = 400;
      const S = () => US.story;
      /** Who said it: the speaker's name, or the interview's when the transcript has no speakers. */
      const whoOf = l => { if (l.speaker) return S().speakerName(l.speaker); const t = S().interviewOf(l.id); return t ? t.name : S().speakerName(''); };

      const find = h('input.input.sl-find', { type: 'text', placeholder: 'Filter – words, speaker or theme', spellcheck: false, 'aria-label': 'Filter the lines' });
      const picky = ui.segmented({ options: LEVELS.map(([value, label]) => ({ value, label })), value: 'balanced', onChange: x => { level = x; draw(); } });
      const summary = h('div.sl-sum');
      const themesEl = h('div.sl-themes', { role: 'listbox', 'aria-label': 'Themes' });
      const table = h('div.sl-table', { role: 'listbox', 'aria-multiselectable': 'true', tabindex: 0 });
      const insp = h('div.sl-insp');
      const body = h('div.sl-body', themesEl, h('div.sl-mid', table), insp);
      const empty = h('div');
      const keys = h('div.sl-keys', 'Keys: ', h('span.kbd', 'J'), h('span.kbd', 'K'), ' move · ', h('span.kbd', 'space'), ' play · ', h('span.kbd', '↵'), ' at the playhead · ', h('span.kbd', '/'), ' filter · shift- or ⌘-click picks several');
      const tools = h('div.sl-tools', find, picky.el || picky, summary);
      v.body.append(tools, empty, body, keys);
      find.addEventListener('input', () => { query = find.value.trim().toLowerCase(); limit = 400; draw(); });

      /** The lines for the chosen theme at the chosen pickiness, filtered. -> [{l, themes}] */
      function rows() {
        const st = S().state(), themes = st.themes || [];
        const lv = level || levelOf(S().pickyFor(null).s);
        const s = S().PICKY_LEVELS[lv];
        const themesOf = new Map();
        const eff = new Map(themes.map(th => [th.id, S().effectiveLines(th, s)]));
        for (const th of themes) for (const id of eff.get(th.id)) { if (!themesOf.has(id)) themesOf.set(id, []); themesOf.get(id).push(th); }
        let ids;
        if (themeId === 'all') ids = st.transcripts.flatMap(t => t.lines.map(l => l.id));
        else if (themeId === 'none') ids = st.transcripts.flatMap(t => t.lines.map(l => l.id)).filter(id => !themesOf.has(id));
        else ids = eff.get(themeId) || [];
        let out = ids.map(id => ({ l: S().lineOf(id), themes: themesOf.get(id) || [] })).filter(r => r.l && r.l.text);
        if (themeId === 'all' || themeId === 'none') out = out.filter(r => !S().isInterviewer(r.l));
        if (query) out = out.filter(r => (r.l.text + ' ' + whoOf(r.l) + ' ' + r.themes.map(t => t.name).join(' ')).toLowerCase().includes(query));
        const tOrder = new Map(st.transcripts.map((t, i) => [t.key, i]));
        const key = { time: r => { const t = S().interviewOf(r.l.id); return (t ? tOrder.get(t.key) : 0) * 1e6 + r.l.start; }, who: r => whoOf(r.l).toLowerCase(), len: r => r.l.end - r.l.start, strong: r => -S().isStrong(r.l) }[sort.key];
        out.sort((a, b) => { const x = key(a), y = key(b); return (x < y ? -1 : x > y ? 1 : 0) * sort.dir; });
        return out;
      }
      function levelOf(s) { let best = 'balanced', d = 9; for (const [k] of LEVELS) { const x = Math.abs(S().PICKY_LEVELS[k] - s); if (x < d) { d = x; best = k; } } return best; }

      function draw() {
        if (!S() || !S().state) return;
        S().loadState();
        const st = S().state();
        const hasLines = st.transcripts.some(t => t.lines.length);
        US.clear(empty);
        [body, keys, tools].forEach(x => x.classList.toggle('hidden', !hasLines));
        if (!hasLines) { empty.appendChild(ui.empty({ icon: 'story', title: 'No transcripts yet', text: 'Story reads your interviews first – then every line shows here.', action: ui.button('Go to Story › 1 Interviews', { kind: 'primary', onClick: () => S().open('transcripts') }) })); return; }
        if (!level) { const lv = levelOf(S().pickyFor(null).s); (picky.set || (() => {}))(lv); }
        drawThemes(st);
        shown = rows();
        if (cursor && !shown.some(r => r.l.id === cursor)) cursor = null;
        if (!cursor && shown.length) cursor = shown[0].l.id;
        drawTable();
        drawInsp();
        const secs = shown.reduce((n, r) => n + (r.l.end - r.l.start), 0);
        summary.textContent = `${US.plural(shown.length, 'line')} · ${US.fmtDur(secs)}${sel.size > 1 ? ` · ${sel.size} picked` : ''}`;
      }
      function drawThemes(st) {
        US.clear(themesEl);
        const lv = level || 'balanced', s = S().PICKY_LEVELS[lv];
        const all = st.transcripts.reduce((n, t) => n + t.lines.length, 0);
        const item = (id, name, hex, n) => h('button.sl-theme' + (themeId === id ? '.on' : ''), { role: 'option', dataset: { theme: id }, onclick: () => { themeId = id; sel.clear(); cursor = null; limit = 400; draw(); } },
          h('span.sl-sw', { style: { background: hex } }), h('span.sl-tname', US.keep(name)), h('span.sl-n', String(n)));
        themesEl.append(h('div.sl-h', 'Themes'), item('all', 'All lines', 'var(--text-3)', all));
        for (const th of st.themes || []) themesEl.appendChild(item(th.id, th.name, hexOf(th), S().effectiveLines(th, s).length));
        const inTheme = new Set((st.themes || []).flatMap(th => S().effectiveLines(th, s)));
        themesEl.appendChild(item('none', 'Not in a theme', 'transparent', st.transcripts.reduce((n, t) => n + t.lines.filter(l => !inTheme.has(l.id) && !S().isInterviewer(l)).length, 0)));
        if (!(st.themes || []).length) themesEl.appendChild(h('div.field-hint', 'No themes yet – ', h('button.link-btn', { onclick: () => S().open('themes') }, 'find them in Story › 2 Themes'), '.'));
      }
      function drawTable() {
        US.clear(table);
        const head = (key, label, cls = '') => h('button.sl-th' + cls + (sort.key === key ? '.on' : ''), { onclick: () => { sort = { key, dir: sort.key === key ? -sort.dir : 1 }; draw(); }, title: 'Sort' }, label, sort.key === key ? (sort.dir > 0 ? ' ↑' : ' ↓') : '');
        table.appendChild(h('div.sl-row.sl-head', head('who', 'Who'), head('time', 'Time'), h('span.sl-th', 'Line'), h('span.sl-th', 'Theme'), head('strong', '★'), head('len', 'Length', '.r')));
        for (const r of shown.slice(0, limit)) {
          const l = r.l, th = r.themes[0];
          table.appendChild(h('div.sl-row' + (l.id === cursor ? '.cur' : '') + (sel.has(l.id) ? '.sel' : ''), { role: 'option', dataset: { id: l.id }, draggable: 'true', title: 'Click to see it · double-click to play · drag to the timeline',
            onclick: e => pick(l.id, e), ondblclick: () => S().cueLine(l), ondragstart: e => S().dragLines(e, picked(l)) },
            h('span.sl-who', US.keep(whoOf(l))), h('span.sl-tc', US.fmtDur(l.start)), h('span.sl-text', US.keep(l.text)),
            h('span.sl-tht', th ? [h('span.sl-sw', { style: { background: hexOf(th) } }), US.keep(th.name + (r.themes.length > 1 ? ` +${r.themes.length - 1}` : ''))] : h('span.sl-dim', '–')),
            h('span.sl-star', S().isStrong(l) ? '★' : ''), h('span.sl-len', (l.end - l.start).toFixed(1) + ' s')));
        }
        if (shown.length > limit) table.appendChild(h('div.sl-more', ui.button(`Show ${Math.min(400, shown.length - limit)} more of ${shown.length - limit}`, { small: true, onClick: () => { limit += 400; drawTable(); } })));
        if (!shown.length) table.appendChild(ui.empty({ icon: 'info', title: query ? `No lines with “${query}”` : 'No lines here at this pickiness', text: query ? 'Clear the filter, or search the interviews in Story › Find.' : 'Try Everything.' }));
      }
      /** The lines a button acts on: the picked ones (in table order), else this one. */
      function picked(l) { const ids = sel.size > 1 && (!l || sel.has(l.id)) ? shown.map(r => r.l.id).filter(id => sel.has(id)) : [l ? l.id : cursor]; return ids.map(id => S().lineOf(id)).filter(Boolean); }
      function pick(id, e) {
        if (e && (e.metaKey || e.ctrlKey)) { sel.has(id) ? sel.delete(id) : sel.add(id); }
        else if (e && e.shiftKey && cursor) { const ids = shown.map(r => r.l.id), a = ids.indexOf(cursor), b = ids.indexOf(id); sel = new Set(ids.slice(Math.min(a, b), Math.max(a, b) + 1)); }
        else sel = new Set([id]);
        cursor = id; drawTable(); drawInsp(); summary.textContent = summary.textContent.replace(/ · \d+ picked$/, '') + (sel.size > 1 ? ` · ${sel.size} picked` : '');
        const row = table.querySelector(`.sl-row[data-id="${CSS.escape ? CSS.escape(id) : id}"]`); if (row && row.scrollIntoView) row.scrollIntoView({ block: 'nearest' });
      }
      function drawInsp() {
        US.clear(insp);
        const lines = cursor ? picked(S().lineOf(cursor)) : [];
        if (!lines.length) { insp.appendChild(h('div.field-hint', 'Pick a line to see it here.')); return; }
        if (lines.length > 1) {
          const secs = lines.reduce((n, l) => n + (l.end - l.start), 0);
          insp.append(h('div.sl-h', `${lines.length} lines picked`), h('div.muted', `${US.fmtDur(secs)} together, from ${US.plural(new Set(lines.map(l => (S().interviewOf(l.id) || {}).key)).size, 'interview')}.`),
            h('div.sl-acts', ui.button('At the playhead', { kind: 'primary', small: true, icon: 'film', onClick: () => S().placeAtPlayhead(lines), title: 'Put these lines at the playhead of the open sequence, in this order' }),
              ui.button('Copy the text', { small: true, onClick: () => copy(lines) }),
              ui.button('New theme from these', { small: true, icon: 'plus', onClick: () => newTheme(lines) })));
          return;
        }
        const l = lines[0], t = S().interviewOf(l.id), r = shown.find(x => x.l.id === l.id), ths = r ? r.themes : [];
        insp.append(h('div.sl-h', 'Line'),
          h('div.sl-quote', US.keep('“' + l.text + '”')),
          h('dl.sl-kv',
            h('dt', 'Speaker'), h('dd', US.keep(l.speaker ? S().speakerName(l.speaker) : 'Not named in the transcript')),
            h('dt', 'Interview'), h('dd', US.keep(t ? t.name : '–')),
            h('dt', 'Time'), h('dd', `${US.fmtDur(l.start)} – ${US.fmtDur(l.end)} (${(l.end - l.start).toFixed(1)} s)`),
            h('dt', 'Themes'), h('dd', ths.length ? ths.map(th => h('span.sl-chip', h('span.sl-sw', { style: { background: hexOf(th) } }), US.keep(th.name))) : '–'),
            h('dt', 'Strength'), h('dd', S().isStrong(l) ? '★ A strong, complete line' : 'Usable')),
          h('div.sl-acts',
            ui.button('Play', { kind: 'primary', small: true, icon: 'play', onClick: () => S().cueLine(l), title: 'Play it in the Source Monitor (space)' }),
            ui.button('At the playhead', { small: true, icon: 'film', onClick: () => S().placeAtPlayhead([l]), title: 'Put it at the playhead of the open sequence (Return)' }),
            ui.button('Source Monitor', { small: true, onClick: () => S().openInSource(l), title: 'Open with its In and Out set' }),
            ui.button('More like this', { small: true, icon: 'search', onClick: () => US.tools.open('story', { tab: 'search', query: l.text.split(/\s+/).filter(w => w.length > 4).slice(0, 3).join(' ') }) }),
            ui.button('Copy', { small: true, onClick: () => copy([l]) })),
          h('div.field-hint', 'Drag a line (or several) from the table straight onto the timeline.'));
      }
      function copy(lines) { ui.copy(lines.map(l => `${whoOf(l)} (${US.fmtDur(l.start)}): ${l.text}`).join('\n')); ui.toast({ type: 'ok', title: `Copied ${US.plural(lines.length, 'line')}`, timeout: 1500 }); }
      function newTheme(lines) {
        const name = 'New theme ' + ((S().state().themes || []).length + 1);
        try { S().newThemeFrom(name, lines.map(l => l.id)); ui.toast({ type: 'ok', title: `“${name}” made from ${US.plural(lines.length, 'line')}`, text: 'Rename it in Story › 2 Themes.', timeout: 3000 }); draw(); } catch (e) { ui.showError(e); }
      }
      table.addEventListener('keydown', e => {
        if (e.target !== table) return;
        const ids = shown.map(r => r.l.id), i = ids.indexOf(cursor);
        if (e.key === 'j' || e.key === 'ArrowDown') { e.preventDefault(); if (i < ids.length - 1) pick(ids[i + 1], { shiftKey: e.shiftKey && e.key === 'ArrowDown' }); }
        else if (e.key === 'k' || e.key === 'ArrowUp') { e.preventDefault(); if (i > 0) pick(ids[i - 1], { shiftKey: e.shiftKey && e.key === 'ArrowUp' }); }
        else if (e.key === ' ') { e.preventDefault(); const l = S().lineOf(cursor); if (l) S().cueLine(l); }
        else if (e.key === 'Enter') { e.preventDefault(); const ls = picked(S().lineOf(cursor)); if (ls.length) S().placeAtPlayhead(ls); }
        else if (e.key === '/') { e.preventDefault(); find.focus(); }
      });
      find.addEventListener('keydown', e => { if (e.key === 'Escape') { find.value = ''; query = ''; draw(); table.focus(); } else if (e.key === 'Enter' || e.key === 'ArrowDown') { e.preventDefault(); table.focus(); } });
      US.bus.on('context', US.debounce(() => { if (US.tools.current === 'storylines') draw(); }, 400));
      return { el: v.el, onShow() { draw(); setTimeout(() => { if (US.tools.current === 'storylines' && document.activeElement !== find) table.focus({ preventScroll: true }); }, 30); } };
    }
  });
})();
