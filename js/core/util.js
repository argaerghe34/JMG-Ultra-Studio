/* JMG Ultra Studio – small shared helpers. Everything hangs off the global US namespace. */
(function () {
  'use strict';
  const US = (window.US = window.US || {});
  // the version comes from the manifest, so it can't drift from what's installed
  US.version = (function () {
    try {
      const fs = require('fs'), path = require('path');
      let p = decodeURIComponent(location.pathname); if (/^\/[A-Za-z]:\//.test(p)) p = p.slice(1);
      const m = /ExtensionBundleVersion="([^"]+)"/.exec(fs.readFileSync(path.join(path.dirname(p), 'CSXS', 'manifest.xml'), 'utf8'));
      return m ? m[1] : '1.3.7.1';
    } catch (e) { return '1.3.7.1'; }
  })();
  /** An unpublished copy – one copied in to try before a release (dev/try-in-premiere.sh leaves unpublished.json), or
      Premiere using the source folder itself (dev link) – or null for a released install. {from, at, dev} */
  US.build = (function () {
    try {
      const fs = require('fs'), path = require('path');
      let p = decodeURIComponent(location.pathname); if (/^\/[A-Za-z]:\//.test(p)) p = p.slice(1);
      const dir = path.dirname(p), f = path.join(dir, 'unpublished.json');
      if (fs.existsSync(f)) return Object.assign({ from: '', at: '' }, JSON.parse(fs.readFileSync(f, 'utf8')));
      if (fs.existsSync(path.join(dir, '.git'))) return { from: 'the source folder', at: '', dev: true };
    } catch (e) { /* a released install */ }
    return null;
  })();
  US.name = 'JMG Ultra Studio';

  /** Build a DOM element: h('div.card#id', {onclick, class, style, ...}, children...) */
  function h(sel, attrs, ...kids) {
    if (attrs == null || typeof attrs !== 'object' || attrs instanceof Node || Array.isArray(attrs)) { if (attrs != null) kids.unshift(attrs); attrs = {}; }
    const m = /^([a-z0-9-]+)?((?:[.#][\w-]+)*)$/i.exec(sel) || [];
    const el = document.createElement(m[1] || 'div');
    (m[2] || '').replace(/([.#])([\w-]+)/g, (_, t, v) => { if (t === '.') el.classList.add(v); else el.id = v; });
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'class') String(v).split(/\s+/).filter(Boolean).forEach(c => el.classList.add(c));
      else if (k === 'style' && typeof v === 'object') { for (const [sk, sv] of Object.entries(v)) { if (sv == null) continue; if (sk.startsWith('--')) el.style.setProperty(sk, sv); else el.style[sk] = sv; } }
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (k === 'html') el.innerHTML = v;
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k in el && typeof v !== 'string') el[k] = v;
      else el.setAttribute(k, v === true ? '' : (k === 'title' || k === 'placeholder') ? say(v) : v);
    }
    append(el, kids);
    return el;
  }
  function append(el, kids) {
    for (const k of kids.flat(Infinity)) {
      if (k == null || k === false) continue;
      el.appendChild(k instanceof Node ? k : document.createTextNode(say(String(k))));
    }
    return el;
  }
  /** Text in the editor's own words (js/core/platform.js: “sequence” reads “timeline” in Resolve). */
  function say(t) { return US.say ? US.say(t) : t; }
  US.h = h;
  US.append = append;
  US.clear = el => { while (el.firstChild) el.removeChild(el.firstChild); return el; };
  US.$ = (sel, root) => (root || document).querySelector(sel);
  US.$$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  US.sleep = ms => new Promise(r => setTimeout(r, ms));
  US.nextFrame = () => new Promise(r => requestAnimationFrame(() => r()));
  US.clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  US.lerp = (a, b, t) => a + (b - a) * t;
  US.uid = (p = '') => p + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);
  US.debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
  US.sum = a => a.reduce((s, x) => s + x, 0);
  US.mean = a => (a.length ? US.sum(a) / a.length : 0);
  US.median = a => { if (!a.length) return 0; const s = Array.from(a).sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
  US.percentile = (a, p) => { if (!a.length) return 0; const s = Array.from(a).sort((x, y) => x - y); const i = US.clamp((s.length - 1) * p, 0, s.length - 1); const lo = Math.floor(i), hi = Math.ceil(i); return s[lo] + (s[hi] - s[lo]) * (i - lo); };
  US.plural = (n, one, many) => `${n} ${n === 1 ? one : (many || one + 's')}`;
  US.cap = s => (s ? s[0].toUpperCase() + s.slice(1) : s);

  /** 75 -> "1:15", 3725.4 -> "1:02:05" */
  US.fmtDur = function (sec, withTenths) {
    if (!isFinite(sec)) return '–';
    const neg = sec < 0; sec = Math.abs(sec);
    const h_ = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    const ss = withTenths ? s.toFixed(1).padStart(4, '0') : String(Math.floor(s)).padStart(2, '0');
    return (neg ? '-' : '') + (h_ ? `${h_}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`);
  };
  /** Friendly "about 3 min" */
  US.fmtEta = function (sec) {
    if (!isFinite(sec) || sec < 0) return '';
    if (sec < 10) return 'a few seconds';
    if (sec < 60) return `${Math.round(sec / 5) * 5}s`;
    if (sec < 3600) return `${Math.round(sec / 60)} min`;
    return `${(sec / 3600).toFixed(1)} h`;
  };
  US.fmtBytes = b => (b < 1024 ? b + ' B' : b < 1048576 ? (b / 1024).toFixed(0) + ' KB' : b < 1073741824 ? (b / 1048576).toFixed(1) + ' MB' : (b / 1073741824).toFixed(2) + ' GB');
  US.basename = p => String(p || '').split(/[\\/]/).pop();
  /** A path from a file dialog in this computer's own form (Windows dialogs can answer C:/…). */
  US.normPath = p => (p ? require('path').normalize(String(p)) : p);
  /** The same file or folder? (Windows ignores letter case.) */
  /** A Map key for a path that matches the way samePath does (Windows: any case, either slash). */
  US.pathKey = p => { const s = require('path').normalize(String(p || '')); return process.platform === 'win32' ? s.toLowerCase() : s; };
  US.samePath = (a, b) => { const P = require('path'), x = P.resolve(String(a)), y = P.resolve(String(b)); return process.platform === 'win32' ? x.toLowerCase() === y.toLowerCase() : x === y; };
  US.stem = p => US.basename(p).replace(/\.[^.]+$/, '');
  US.esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /** Tiny event emitter */
  US.emitter = function () {
    const map = new Map();
    return {
      on(ev, fn) { if (!map.has(ev)) map.set(ev, new Set()); map.get(ev).add(fn); return () => map.get(ev).delete(fn); },
      emit(ev, ...a) { (map.get(ev) || []).forEach(fn => { try { fn(...a); } catch (e) { console.error(e); } }); }
    };
  };
  US.bus = US.emitter();

  /** Run async work over items with limited concurrency, reporting progress. */
  US.pool = async function (items, limit, worker) {
    const out = new Array(items.length); let next = 0;
    async function run() { while (next < items.length) { const i = next++; out[i] = await worker(items[i], i); } }
    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
    return out;
  };

  /** Inline SVG icons (stroke style, 20x20 viewBox). */
  const P = {
    home: 'M3 9.5 10 4l7 5.5V16a1 1 0 0 1-1 1h-3.5v-4.5h-5V17H4a1 1 0 0 1-1-1z',
    selects: 'M3 5h14M3 10h9M3 15h6m7-3 1.6 3.2 3.4.5-2.5 2.3.6 3.4L16 18.9l-3 1.5.6-3.4-2.5-2.3 3.4-.5z',
    silence: 'M3 10h2l1.5-4 2 8 2-10 2 12 1.5-6H17',
    beats: 'M7 15.5V5l9-2v10.5M7 15.5a2 2 0 1 1-4 0 2 2 0 0 1 4 0zm9-2a2 2 0 1 1-4 0 2 2 0 0 1 4 0z',
    songs: 'M10 3a3 3 0 0 0-3 3v4a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zM5 10a5 5 0 0 0 10 0M10 15v3',
    story: 'M3 4h5v5H3zM12 4h5v3h-5zM12 11h5v5h-5zM3 13h5v3H3z',
    safe: 'M7 2h6a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1zM8.5 6h3M8.5 14h3',
    check: 'M4 10.5 8 14l8-9',
    deliver: 'M3 7l7-4 7 4v7l-7 4-7-4zm0 0 7 4 7-4m-7 4v7',
    ask: 'M4 4h12a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1h-7l-4 3v-3H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zm3 5h.01M10 9h.01M13 9h.01',
    sound: 'M4 8v4h3l4 3V5L7 8zm10-1a4 4 0 0 1 0 6m2-8a7 7 0 0 1 0 10',
    log: 'M5 4h10M5 8h10M5 12h6M5 16h8',
    close: 'M5 5l10 10M15 5 5 15',
    play: 'M6 4l10 6-10 6z',
    stop: 'M5 5h10v10H5z',
    gear: 'M10 7a3 3 0 1 0 0 6 3 3 0 0 0 0-6zm7 3-1.6.6-.5 1.3.7 1.6-1.4 1.4-1.6-.7-1.3.5L10 17l-.9-1.5-1.3-.5-1.6.7-1.4-1.4.7-1.6-.5-1.3L3 10l1.5-.9.5-1.3-.7-1.6 1.4-1.4 1.6.7 1.3-.5L10 3l.9 1.5 1.3.5 1.6-.7 1.4 1.4-.7 1.6.5 1.3z',
    refresh: 'M16 6V3m0 3h-3m3 0a7 7 0 1 0 1 5',
    info: 'M10 9v5m0-8h.01M10 17a7 7 0 1 0 0-14 7 7 0 0 0 0 14z',
    warn: 'M10 3 2 17h16zM10 8v4m0 3h.01',
    error: 'M10 17a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM7.5 7.5l5 5m0-5-5 5',
    ok: 'M10 17a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM7 10l2 2 4-4',
    chevron: 'M8 5l5 5-5 5',
    'chevron-left': 'M12 5l-5 5 5 5', 'chevron-right': 'M8 5l5 5-5 5',
    plus: 'M10 4v12M4 10h12',
    target: 'M10 17a7 7 0 1 0 0-14 7 7 0 0 0 0 14zm0-4a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
    folder: 'M3 6a1 1 0 0 1 1-1h4l2 2h6a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z',
    film: 'M4 3h12v14H4zM4 7h3m-3 6h3m6-6h3m-3 6h3M7 3v14m6-14v14',
    spark: 'M10 2v4m0 8v4M2 10h4m8 0h4M4.5 4.5l2.5 2.5m6 6 2.5 2.5m0-11L13 7m-6 6-2.5 2.5'
  };
  /** Tools can add their own icons: US.addIcon('wave', 'M3 10h14'). 20×20 viewBox, stroked. */
  US.addIcon = (name, d) => { P[name] = d; };
  US.icon = function (name, size = 18) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 20 20'); svg.setAttribute('width', size); svg.setAttribute('height', size);
    svg.setAttribute('fill', 'none'); svg.setAttribute('stroke', 'currentColor'); svg.setAttribute('stroke-width', '1.6');
    svg.setAttribute('stroke-linecap', 'round'); svg.setAttribute('stroke-linejoin', 'round'); svg.classList.add('icon');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', P[name] || P.info); svg.appendChild(path);
    return svg;
  };
})();
