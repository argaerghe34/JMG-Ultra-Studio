/* JMG Ultra Studio – UI kit. Every tool builds its screen from these so they all look and behave the same. */
(function () {
  'use strict';
  const US = window.US, h = US.h;
  const ui = (US.ui = {});

  /* ---------- toasts ---------- */
  ui.toast = function ({ type = 'info', title, text, detail, action, timeout }) {
    const host = US.$('#toasts');
    const icon = { ok: 'ok', info: 'info', warn: 'warn', error: 'error' }[type] || 'info';
    let detailEl = null;
    const close = () => { t.classList.add('out'); setTimeout(() => t.remove(), 200); };
    const t = h('div.toast.' + type,
      h('div.toast-icon', US.icon(icon, 18)),
      h('div.toast-body',
        title && h('div.toast-title', title),
        text && h('div.toast-text', text),
        (detail || action) && h('div.toast-actions',
          action && h('button.btn.small.secondary', { onclick: () => { action.fn(); close(); } }, action.label),
          detail && h('button.btn.small.ghost', { onclick: () => { if (!detailEl) { detailEl = h('pre.toast-detail', detail); t.querySelector('.toast-body').appendChild(detailEl); } else { detailEl.remove(); detailEl = null; } } }, 'Details'),
          detail && h('button.btn.small.ghost', { onclick: () => { copy(detail); ui.toast({ type: 'ok', title: 'Copied details', timeout: 1500 }); } }, 'Copy'))),
      h('button.toast-x', { title: 'Close', onclick: close }, US.icon('close', 14)));
    host.appendChild(t);
    const ms = timeout != null ? timeout : type === 'error' ? 0 : type === 'warn' ? 9000 : 4500;
    if (ms) setTimeout(close, ms);
    return close;
  };
  function copy(text) {
    const ta = h('textarea', { style: { position: 'fixed', opacity: 0 } }, text);
    document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); } catch (e) { /* ignore */ } ta.remove();
  }
  ui.copy = copy;

  /** Show any error as: what went wrong + the one thing to do + Details (hidden). */
  ui.showError = function (err, { context } = {}) {
    const x = US.errors.explain(err);
    if (x.code === 'CANCELLED') return;
    ui.toast({ type: 'error', title: x.title, text: x.action, detail: (context ? context + '\n' : '') + (x.detail || '(no further details)') });
  };

  /* ---------- modal ---------- */
  ui.modal = function ({ title, body, buttons = [], wide }) {
    return new Promise(resolve => {
      const done = v => { back.remove(); resolve(v); };
      const box = h('div.modal' + (wide ? '.wide' : ''),
        h('div.modal-title', title),
        h('div.modal-body', body),
        h('div.modal-buttons', buttons.map(b => h('button.btn.' + (b.kind || 'secondary'), { onclick: () => done(b.value) }, b.label))));
      const back = h('div.modal-back', { onclick: e => { if (e.target === back) done(undefined); } }, box);
      document.body.appendChild(back);
      const first = box.querySelector('.btn.primary') || box.querySelector('.btn'); first && first.focus();
    });
  };
  ui.confirm = async function ({ title, text, ok = 'Go ahead', cancel = 'Cancel', danger }) {
    const r = await ui.modal({ title, body: h('p', text), buttons: [{ label: cancel, value: false, kind: 'ghost' }, { label: ok, value: true, kind: danger ? 'danger' : 'primary' }] });
    return !!r;
  };
  ui.promptText = async function ({ title, label, value = '', ok = 'OK', placeholder = '', multiline }) {
    const input = multiline ? h('textarea.input', { rows: 8, placeholder }, value) : h('input.input', { value, placeholder });
    const r = await ui.modal({ title, body: h('div', label && h('label.field-label', label), input), buttons: [{ label: 'Cancel', value: false, kind: 'ghost' }, { label: ok, value: true, kind: 'primary' }] });
    return r ? input.value : null;
  };

  /* ---------- controls ---------- */
  ui.button = function (label, { kind = 'secondary', icon, onClick, disabled, title, small, block } = {}) {
    const b = h('button.btn.' + kind, { onclick: onClick, disabled, title }, icon && US.icon(icon, small ? 14 : 16), label && h('span', label));
    if (small) b.classList.add('small'); if (block) b.classList.add('block');
    return b;
  };
  /** Primary action that greys out while any job runs. */
  ui.actionButton = function (label, onClick, opts = {}) {
    const b = ui.button(label, Object.assign({ kind: 'primary', block: true }, opts, { onClick: async () => { if (US.jobs.current) return; await onClick(); } }));
    const sync = () => { b.disabled = !!US.jobs.current || !!b._forceDisabled; };
    US.bus.on('jobstart', sync); US.bus.on('jobend', () => setTimeout(sync, 0));
    b.setEnabled = v => { b._forceDisabled = !v; sync(); };
    return b;
  };

  ui.field = function (label, control, hint) {
    return h('div.field', label && h('label.field-label', label), control, hint && h('div.field-hint', hint));
  };

  /** Slider with live value: {label, min, max, step, value, fmt, onInput, hint} */
  ui.slider = function ({ label, min = 0, max = 100, step = 1, value, fmt = v => v, onInput, hint, onChange }) {
    const val = h('span.slider-val', fmt(value));
    const input = h('input.slider', { type: 'range', min, max, step, value });
    input.addEventListener('input', () => { const v = +input.value; val.textContent = fmt(v); onInput && onInput(v); });
    input.addEventListener('change', () => onChange && onChange(+input.value));
    const wrap = h('div.field.slider-field', h('div.slider-head', h('label.field-label', label), val), input, hint && h('div.field-hint', hint));
    wrap.set = v => { input.value = v; val.textContent = fmt(+v); };
    wrap.get = () => +input.value;
    return wrap;
  };

  ui.toggle = function ({ label, value, onChange, hint }) {
    const input = h('input', { type: 'checkbox', checked: !!value });
    input.addEventListener('change', () => onChange && onChange(input.checked));
    const wrap = h('label.toggle', input, h('span.toggle-track', h('span.toggle-knob')), h('span.toggle-text', h('span', label), hint && h('span.field-hint', hint)));
    wrap.set = v => { input.checked = !!v; }; wrap.get = () => input.checked;
    return wrap;
  };

  /** Segmented control: options [{value,label,title}] */
  ui.segmented = function ({ options, value, onChange }) {
    const wrap = h('div.segmented');
    const btns = options.map(o => h('button.seg' + (o.value === value ? '.on' : ''), { title: o.title || '', onclick: () => { set(o.value); onChange && onChange(o.value); } }, o.label));
    function set(v) { value = v; btns.forEach((b, i) => b.classList.toggle('on', options[i].value === v)); }
    US.append(wrap, btns); wrap.set = set; wrap.get = () => value;
    return wrap;
  };

  ui.select = function ({ options, value, onChange, placeholder }) {
    const s = h('select.input');
    function fill(opts, v) {
      US.clear(s);
      if (placeholder) s.appendChild(h('option', { value: '' }, placeholder));
      for (const o of opts) s.appendChild(h('option', { value: o.value, disabled: o.disabled }, o.label));
      if (v != null) s.value = v;
    }
    fill(options, value);
    s.addEventListener('change', () => onChange && onChange(s.value));
    s.setOptions = fill; s.get = () => s.value; s.set = v => { s.value = v; };
    return s;
  };

  ui.input = function ({ value = '', placeholder = '', onInput, onEnter, type = 'text' }) {
    const i = h('input.input', { value, placeholder, type });
    if (onInput) i.addEventListener('input', () => onInput(i.value));
    if (onEnter) i.addEventListener('keydown', e => { if (e.key === 'Enter') onEnter(i.value); });
    return i;
  };

  /** Collapsible section */
  ui.section = function (title, children, { open = true, hint } = {}) {
    const body = h('div.section-body', children);
    const head = h('button.section-head', { onclick: () => sec.classList.toggle('closed') }, US.icon('chevron', 14), h('span', title), hint && h('span.section-hint', hint));
    const sec = h('div.section' + (open ? '' : '.closed'), head, body);
    return sec;
  };
  ui.card = (...kids) => h('div.card', kids);
  ui.row = (...kids) => h('div.row', kids);
  ui.pill = (text, color) => h('span.pill', { style: color ? { '--pill': color } : null }, text);
  ui.empty = function ({ icon = 'info', title, text, action }) {
    return h('div.empty', US.icon(icon, 28), h('div.empty-title', title), text && h('div.empty-text', text), action);
  };
  ui.note = (text, type = 'info') => h('div.note.' + type, US.icon(type === 'warn' ? 'warn' : 'info', 15), h('span', text));
  ui.stat = (value, label) => h('div.stat', h('div.stat-val', value), h('div.stat-label', label));
  ui.stats = (...items) => h('div.stats', items);

  /** Standard tool screen: header + scrollable body. Returns {el, body, setSubtitle} */
  ui.toolView = function ({ icon, title, blurb, help }) {
    const sub = h('div.tool-blurb', blurb);
    const body = h('div.tool-body');
    const el = h('div.tool',
      h('div.tool-head', h('div.tool-icon', US.icon(icon, 20)), h('div.tool-titles', h('div.tool-title', title), sub),
        help && h('button.icon-btn', { title: 'How this works', onclick: () => ui.modal({ title, body: h('div.help', typeof help === 'string' ? h('p', help) : help), buttons: [{ label: 'Got it', value: true, kind: 'primary' }] }) }, US.icon('info', 16))),
      body);
    return { el, body, setSubtitle: t => { sub.textContent = t; } };
  };

  /* ---------- "Works on" picker shared by tools ---------- */
  /**
   * ui.sourcePicker({ modes: ['selection','bin','sequence','file'], kinds: ['video','audio'], onChange })
   * get() -> {mode, binId, seqId, filePath}. resolve() -> Promise<{items:[...], sequence}> from Premiere.
   */
  ui.sourcePicker = function ({ modes = ['selection', 'bin'], kinds = ['video'], onChange, label = 'Works on', fileFilter } = {}) {
    const labels = { selection: 'Selected clips', bin: 'A bin', sequence: 'A sequence', file: 'A file on disk' };
    let mode = US.settings.get('src.mode.' + modes.join(), modes[0]);
    if (!modes.includes(mode)) mode = modes[0];
    let filePath = '';
    const status = h('div.src-status', '…');
    const binSel = ui.select({ options: [], placeholder: 'Choose a bin…', onChange: () => { refreshStatus(); onChange && onChange(); } });
    const seqSel = ui.select({ options: [], placeholder: 'Choose a sequence…', onChange: () => { refreshStatus(); onChange && onChange(); } });
    const fileBtn = ui.button('Choose file…', { small: true, icon: 'folder', onClick: async () => {
      const r = window.cep && window.cep.fs && window.cep.fs.showOpenDialogEx ? window.cep.fs.showOpenDialogEx(false, false, 'Choose a file', '', fileFilter || []) : null;
      if (r && r.data && r.data.length) { filePath = US.normPath(r.data[0]); refreshStatus(); onChange && onChange(); }
    } });
    const seg = ui.segmented({ options: modes.map(m => ({ value: m, label: labels[m] })), value: mode, onChange: v => { mode = v; US.settings.set('src.mode.' + modes.join(), v); layout(); refreshLists(); onChange && onChange(); } });
    const extra = h('div.src-extra');
    function layout() {
      US.clear(extra);
      if (mode === 'bin') extra.appendChild(binSel);
      if (mode === 'sequence') extra.appendChild(seqSel);
      if (mode === 'file') extra.appendChild(fileBtn);
    }
    async function refreshLists() {
      try {
        if (mode === 'bin') {
          const bins = await US.host.call('listBins');
          const keep = binSel.get() || US.settings.get('src.bin', '');
          binSel.setOptions(bins.map(b => ({ value: b.id, label: b.path })), keep);
        } else if (mode === 'sequence') {
          const ctx = await US.host.call('context');
          const seqs = await US.host.call('listSequences');
          const keep = seqSel.get() || (ctx.sequence && ctx.sequence.id) || '';
          seqSel.setOptions(seqs.map(s => ({ value: s.id, label: s.name + (ctx.sequence && s.id === ctx.sequence.id ? '  (open)' : '') })), keep);
        }
      } catch (e) { /* context poll will show the problem */ }
      refreshStatus();
    }
    async function refreshStatus() {
      try {
        if (mode === 'selection') {
          const s = await US.host.call('selectionSummary', { kinds });
          status.textContent = s.count ? `${US.plural(s.count, 'clip')} selected${s.skipped ? ` (${s.skipped} skipped: ${s.skippedWhy})` : ''}` : 'Select clips in the Project panel.';
          status.classList.toggle('warn', !s.count);
        } else if (mode === 'bin') {
          const id = binSel.get(); US.settings.set('src.bin', id);
          if (!id) { status.textContent = 'Pick a bin.'; status.classList.add('warn'); return; }
          const s = await US.host.call('binSummary', { binId: id, kinds });
          status.textContent = `${US.plural(s.count, 'clip')} in this bin${s.sub ? ' (including sub-bins)' : ''}`; status.classList.toggle('warn', !s.count);
        } else if (mode === 'sequence') {
          status.textContent = seqSel.get() ? '' : 'Pick a sequence.'; status.classList.toggle('warn', !seqSel.get());
        } else if (mode === 'file') {
          status.textContent = filePath ? US.basename(filePath) : 'No file chosen.'; status.classList.toggle('warn', !filePath);
        }
      } catch (e) { status.textContent = US.errors.explain(e).title; status.classList.add('warn'); }
    }
    /** Full details for a light list, 40 at a time, with progress; keeps only the kinds this tool wants. */
    async function details(list, job) {
      const out = [], CH = 40;
      for (let i = 0; i < list.length; i += CH) {
        if (job) { job.check(); job.set({ who: 'premiere' }).progress(0, `Reading clip details ${Math.min(list.length, i + CH)} of ${list.length}`); }
        const infos = await US.host.call('itemsInfo', { ids: list.slice(i, i + CH).map(x => x.id) });
        for (const it of infos) if (it && kindOk(it)) out.push(it);
      }
      return out;
    }
    function kindOk(info) {
      if (!kinds || !kinds.length) return info.kind !== 'bin';
      return kinds.includes(info.kind) || (kinds.includes('audio') && info.kind === 'video' && info.hasAudio);
    }
    layout(); refreshLists();
    const el = h('div.src-picker', h('div.field-label', label), modes.length > 1 && seg, extra, status);
    const refreshSoon = US.debounce(() => { if (mode === 'selection' && el.offsetParent) refreshStatus(); }, 400);
    US.bus.on('context', refreshSoon);
    new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) refreshSoon(); }).observe(el);
    return {
      el,
      get: () => ({ mode, binId: binSel.get(), seqId: seqSel.get(), filePath }),
      refresh: refreshLists,
      /** Ask Premiere for the actual items. Throws a plain error if there's nothing to work on. */
      /**
       * Ask Premiere for the actual items. Lists them cheaply first, then reads their details in small batches,
       * so big selections show progress and Stop works between batches. Pass the running job if there is one.
       */
      async resolve(job) {
        if (mode === 'selection') {
          const list = await US.host.call('selectionList', { kinds });
          if (!list.length) throw new US.UserError('NO_SELECTION');
          return { items: await details(list, job) };
        }
        if (mode === 'bin') {
          if (!binSel.get()) throw new US.UserError('NO_SELECTION', { title: 'No bin chosen.', action: 'Pick a bin in “Works on”, then try again.' });
          const list = await US.host.call('binList', { binId: binSel.get(), kinds, recursive: true });
          const items = list.length ? await details(list, job) : [];
          if (!items.length) throw new US.UserError('NO_SELECTION', { title: 'That bin has no usable clips.', action: 'Pick another bin, or add clips to it.' });
          return { items };
        }
        if (mode === 'sequence') { if (!seqSel.get()) throw new US.UserError('NO_SEQUENCE', { title: 'No sequence chosen.', action: 'Pick a sequence in “Works on”, then try again.' }); return { sequence: await US.host.call('sequenceInfo', { seqId: seqSel.get() }) }; }
        if (mode === 'file') { if (!filePath) throw new US.UserError('NO_SELECTION', { title: 'No file chosen.', action: 'Press “Choose file…” first.' }); return { filePath }; }
      }
    };
  };

  /* ---------- timeline strip: regions, markers and a curve over time ---------- */
  /**
   * ui.timeline({height}) -> {el, draw({duration, curve, curveMax, regions:[{start,end,color,label}], marks:[{t,color}], playhead})}
   * Click calls onSeek(seconds).
   */
  ui.timeline = function ({ height = 64, onSeek } = {}) {
    const canvas = h('canvas.timeline');
    const tip = h('div.timeline-tip');
    const el = h('div.timeline-wrap', canvas, tip);
    let model = null;
    function draw(m) {
      if (m) model = m; if (!model) return;
      const dpr = window.devicePixelRatio || 1, w = el.clientWidth || 300;
      canvas.width = w * dpr; canvas.height = height * dpr; canvas.style.height = height + 'px';
      const g = canvas.getContext('2d'); g.scale(dpr, dpr);
      const css = getComputedStyle(document.documentElement);
      g.fillStyle = css.getPropertyValue('--surface-2'); g.fillRect(0, 0, w, height);
      const d = model.duration || 1, X = t => (t / d) * w;
      for (const r of model.regions || []) { g.fillStyle = r.color; g.globalAlpha = r.alpha == null ? 0.45 : r.alpha; g.fillRect(X(r.start), 0, Math.max(1, X(r.end) - X(r.start)), height); }
      g.globalAlpha = 1;
      if (model.curve && model.curve.length) {
        const c = model.curve, n = c.length, mx = model.curveMax || Math.max(1e-9, ...c);
        g.strokeStyle = css.getPropertyValue('--text-2'); g.lineWidth = 1; g.beginPath();
        for (let x = 0; x < w; x++) { const i = Math.min(n - 1, Math.floor(x / w * n)); const y = height - 4 - (c[i] / mx) * (height - 8); x ? g.lineTo(x, y) : g.moveTo(x, y); }
        g.stroke();
      }
      for (const mk of model.marks || []) { g.fillStyle = mk.color || css.getPropertyValue('--accent'); g.fillRect(X(mk.t) - 0.5, 0, mk.w || 1, height); }
      if (model.playhead != null) { g.fillStyle = '#fff'; g.fillRect(X(model.playhead) - 1, 0, 2, height); }
    }
    canvas.addEventListener('mousemove', e => {
      if (!model) return; const r = canvas.getBoundingClientRect(); const t = (e.clientX - r.left) / r.width * model.duration;
      const reg = (model.regions || []).find(x => t >= x.start && t <= x.end);
      tip.textContent = US.fmtDur(t, true) + (reg && reg.label ? ' · ' + reg.label : ''); tip.style.left = Math.min(r.width - 80, Math.max(0, e.clientX - r.left)) + 'px'; tip.style.opacity = 1;
    });
    canvas.addEventListener('mouseleave', () => { tip.style.opacity = 0; });
    canvas.addEventListener('click', e => { if (!model || !onSeek) return; const r = canvas.getBoundingClientRect(); onSeek((e.clientX - r.left) / r.width * model.duration); });
    new ResizeObserver(() => draw()).observe(el);
    return { el, draw };
  };

  /** Small list with optional click handler: rows [{title, sub, right, color, onClick}] */
  ui.list = function (rows, { empty } = {}) {
    if (!rows.length && empty) return ui.empty(empty);
    return h('div.list', rows.map(r => h('div.list-row' + (r.onClick ? '.clickable' : ''), { onclick: r.onClick, title: r.tip || '' },
      r.color && h('span.swatch', { style: { background: r.color } }),
      h('div.list-main', h('div.list-title', r.title), r.sub && h('div.list-sub', r.sub)),
      r.right != null && h('div.list-right', r.right))));
  };

  /** Premiere label colours (Project panel labels 0–15) and marker colours (0–7). */
  ui.LABELS = [
    { i: 0, name: 'Violet', hex: '#a593e0' }, { i: 1, name: 'Iris', hex: '#6b8bd6' }, { i: 2, name: 'Caribbean', hex: '#1ebc9c' }, { i: 3, name: 'Lavender', hex: '#d38fd8' },
    { i: 4, name: 'Cerulean', hex: '#29a0d8' }, { i: 5, name: 'Forest', hex: '#56a845' }, { i: 6, name: 'Rose', hex: '#e46b8a' }, { i: 7, name: 'Mango', hex: '#f1a33b' },
    { i: 8, name: 'Purple', hex: '#8f53c9' }, { i: 9, name: 'Blue', hex: '#3a5fd6' }, { i: 10, name: 'Teal', hex: '#18898f' }, { i: 11, name: 'Magenta', hex: '#c33ea8' },
    { i: 12, name: 'Tan', hex: '#c9a87f' }, { i: 13, name: 'Green', hex: '#3e9e39' }, { i: 14, name: 'Brown', hex: '#8a5a32' }, { i: 15, name: 'Yellow', hex: '#e2d33a' }
  ];
  ui.MARKER_COLORS = [
    { i: 0, name: 'Green', hex: '#3fbf4a' }, { i: 1, name: 'Red', hex: '#e2483f' }, { i: 2, name: 'Purple', hex: '#a35bd6' }, { i: 3, name: 'Orange', hex: '#f08a24' },
    { i: 4, name: 'Yellow', hex: '#e9d33a' }, { i: 5, name: 'White', hex: '#e6e6e6' }, { i: 6, name: 'Blue', hex: '#3d7ff0' }, { i: 7, name: 'Cyan', hex: '#2fc6d6' }
  ];
})();
