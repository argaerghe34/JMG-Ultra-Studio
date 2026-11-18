/* JMG Ultra Studio – mVFX › motion titles: the animated documentary titles, dates, credits and hand-drawn marks. Each
   preset is a small scene (text that arrives letter by letter, rules and ticks that draw on, digits that roll, pen
   strokes) drawn on a canvas at any time t of its length – the same drawing makes the thumbnail, the live preview and
   the frames of the clip the editor gets (a PNG sequence with transparency, so it plays the same in Premiere and
   Resolve). Pure: a 2D context handed in, no DOM, no editor – unit-tested in dev/tests/mvfx-motion.test.js.
   Our own design: small serif capitals with wide spacing, soft entrances that settle, nothing boxed. */
(function () {
  'use strict';
  const US = window.US;

  /* ---------- timing ---------- */
  const clamp01 = x => (x < 0 ? 0 : x > 1 ? 1 : x);
  const easeOut = x => 1 - Math.pow(1 - clamp01(x), 3);                       // arrives fast, settles gently
  const easeIn = x => Math.pow(clamp01(x), 2);                                 // leaves slowly, then goes
  const easeInOut = x => { x = clamp01(x); return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };
  /** A repeatable random source from a string or number (the same title always animates the same way). */
  function rng(seed) {
    let s = 2166136261;
    for (const ch of String(seed)) { s ^= ch.charCodeAt(0); s = Math.imul(s, 16777619); }
    s = (s >>> 0) || 1;
    return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
  }
  const hexToRgb = hex => { const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(String(hex || '').trim()); return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : [255, 255, 255]; };
  const rgba = (hex, a) => { const c = hexToRgb(hex); return `rgba(${c[0]},${c[1]},${c[2]},${a == null ? 1 : Math.round(a * 1000) / 1000})`; };
  const GENERIC = /^(serif|sans-serif|monospace|cursive)$/;
  const cssFont = (px, family, o) => `${o && o.italic ? 'italic ' : ''}${o && o.bold ? 'bold ' : ''}${px}px ${GENERIC.test(family) ? family : '"' + family + '"'}`;

  /* ---------- the presets ---------- */
  // An item is one of:
  //  text   {spans:[{field|text, role, size, caps ('small'|'upper'), track (em), colour, bold, italic}], x, y, align,
  //          reveal ('letters' random order, soft · 'type' left to right · 'fade' · 'rise' · 'roll' digits roll),
  //          at (s), dur (s, one letter's fade), spread (s, first letter to last), maxWidth, lineHeight, until (s),
  //          base (a size: sit on the baseline a line of that size would have – small text beside larger)}
  //          – or the span's keys on the item itself for one style
  //  line   {x1, y1, x2, y2, w, colour, at, dur, from ('start'|'centre')}
  //  ticks  {x, y, w, n, every, h, colour, at, dur, slide (tick spacings moved across the clip)}
  //  stroke {pts:[[x, y]…], w, colour, at, dur, wobble, head (an arrow head), close}
  //  plate  {colour, alpha, at, dur}           a dimming layer over the whole frame
  //  bar    {x, y, w, h, colour, alpha, at, dur}   a marker-pen bar that draws on
  // Sizes are fractions of the frame height (of a 16:9 frame as wide as this one, if the frame is taller than that);
  // x and y are fractions of the frame. Colours are roles: text, muted, accent.
  const F = (id, label, value, o) => Object.assign({ id, label, value }, o);
  const NAME = F('name', 'Name', 'Ruth Adler'), ROLE = F('role', 'Title or role', 'Founder, Riverside Trust');
  const M = (id, group, label, sub, fields, items, extra) => Object.assign({ id, group, kind: 'motion', label, sub, fields, duration: 5, outSec: 0.7, shadow: 0.5, anchor: [0.5, 0.5] }, typeof items === 'function' ? { build: items } : { items }, extra);
  const lines = s => String(s || '').split(/\r?\n/).map(x => x.trim()).filter(Boolean);
  const pair = l => { const i = l.indexOf(':'); return i >= 0 ? [l.slice(0, i).trim(), l.slice(i + 1).trim()] : ['', l.trim()]; };
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'], DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  /** "23 March 1994", "March 23, 1994", "1994-03-23" -> {y, m (0-11), d} or null. Read by hand: no time zones. */
  function parseDate(s) {
    s = String(s || '').trim();
    let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
    if (m) return ok(+m[1], +m[2] - 1, +m[3]);
    const mon = MONTHS.findIndex(x => new RegExp('\\b' + x.slice(0, 3), 'i').test(s));
    const nums = (s.match(/\d+/g) || []).map(Number), y = nums.find(n => n > 31), d = nums.find(n => n >= 1 && n <= 31);
    if (mon >= 0 && y != null && d != null) return ok(y, mon, d);
    m = /^(\d{1,2})[./](\d{1,2})[./](\d{4})$/.exec(s);
    if (m) return ok(+m[3], +m[2] - 1, +m[1]);
    return null;
    function ok(yy, mm, dd) { return mm >= 0 && mm < 12 && dd >= 1 && dd <= 31 ? { y: yy, m: mm, d: dd } : null; }
  }
  /** Day of the week, 0 = Sunday (Zeller-free: days since a known Sunday). */
  function weekday(y, m, d) { const t = Date.UTC(y, m, d); return ((Math.floor(t / 86400000) + 4) % 7 + 7) % 7; }
  function addDays(y, m, d, n) { const t = new Date(Date.UTC(y, m, d) + n * 86400000); return { y: t.getUTCFullYear(), m: t.getUTCMonth(), d: t.getUTCDate() }; }
  const CAP = { role: 'serif', caps: 'small', track: 0.16 };   // the pack's voice: small serif capitals, wide

  const PRESETS = [
    /* ----- names: who is speaking ----- */
    M('nm-inline', 'names', 'Inline', 'role, then the name, on one line', [NAME, ROLE], [
      { t: 'text', x: 0.08, y: 0.86, align: 'left', reveal: 'letters', at: 0.1, spans: [
        Object.assign({ field: 'role', size: 0.02, colour: 'muted' }, CAP, { track: 0.22 }), { text: '   ', size: 0.02 },
        Object.assign({ field: 'name', size: 0.036 }, CAP)] }
    ], { anchor: [0.08, 0.86] }),
    M('nm-stack', 'names', 'Stacked', 'the name over a small role', [NAME, ROLE], [
      Object.assign({ t: 'text', field: 'name', size: 0.04, x: 0.08, y: 0.825, align: 'left', reveal: 'letters', at: 0.1 }, CAP),
      Object.assign({ t: 'text', field: 'role', size: 0.019, colour: 'muted', x: 0.08, y: 0.872, align: 'left', reveal: 'letters', at: 0.45 }, CAP, { track: 0.24 })
    ], { anchor: [0.08, 0.85] }),
    M('nm-rule', 'names', 'Ruled', 'a hairline draws between name and role', [NAME, ROLE], [
      Object.assign({ t: 'text', field: 'name', size: 0.04, x: 0.08, y: 0.815, align: 'left', reveal: 'letters', at: 0.25 }, CAP),
      { t: 'line', x1: 0.08, y1: 0.848, x2: 0.3, y2: 0.848, w: 0.0014, colour: 'muted', at: 0, dur: 0.9, from: 'start' },
      Object.assign({ t: 'text', field: 'role', size: 0.019, colour: 'muted', x: 0.08, y: 0.878, align: 'left', reveal: 'letters', at: 0.55 }, CAP, { track: 0.24 })
    ], { anchor: [0.08, 0.85] }),
    M('nm-centre', 'names', 'Centred', 'a small role above the name, centred', [NAME, ROLE], [
      Object.assign({ t: 'text', field: 'role', size: 0.018, colour: 'muted', x: 0.5, y: 0.815, align: 'centre', reveal: 'letters', at: 0.1 }, CAP, { track: 0.3 }),
      Object.assign({ t: 'text', field: 'name', size: 0.04, x: 0.5, y: 0.86, align: 'centre', reveal: 'letters', at: 0.3 }, CAP, { track: 0.2 })
    ], { anchor: [0.5, 0.85] }),
    M('nm-hand', 'names', 'Signed', 'the name as handwriting, the role in capitals', [NAME, ROLE], [
      { t: 'text', field: 'name', role: 'hand', size: 0.058, x: 0.08, y: 0.815, align: 'left', reveal: 'type', at: 0.1, spread: 0.9 },
      Object.assign({ t: 'text', field: 'role', size: 0.018, colour: 'muted', x: 0.082, y: 0.872, align: 'left', reveal: 'letters', at: 0.7 }, CAP, { track: 0.24 })
    ], { anchor: [0.08, 0.85] }),
    M('nm-place', 'names', 'Place & date', 'when and where, small, in a corner', [F('date', 'Date', 'June 2022'), F('place', 'Place', 'Hebron Valley, Kenya')], [
      { t: 'text', x: 0.08, y: 0.87, align: 'left', reveal: 'letters', at: 0.1, spans: [
        Object.assign({ field: 'date', size: 0.022, colour: 'muted' }, CAP, { track: 0.2 }), { text: '   ', size: 0.022 },
        Object.assign({ field: 'place', size: 0.022 }, CAP, { track: 0.2 })] }
    ], { anchor: [0.08, 0.87], duration: 4 }),

    /* ----- titles ----- */
    M('ti-film', 'titles', 'Film title', 'the film’s name, large, over the picture', [F('big', 'Title', 'March'), F('small', 'Under it', 'Columbus, Ohio'), F('tiny', 'Smallest line', 'A film about the winter that changed the town')], [
      { t: 'plate', colour: '#000000', alpha: 0.35, at: 0, dur: 1.2 },
      { t: 'text', field: 'big', role: 'serif', caps: 'upper', bold: true, size: 0.2, track: 0.02, x: 0.5, y: 0.47, align: 'centre', reveal: 'letters', at: 0.2, dur: 1.1, spread: 1.0, maxWidth: 0.9 },
      Object.assign({ t: 'text', field: 'small', size: 0.02, x: 0.5, y: 0.61, align: 'centre', reveal: 'letters', at: 1.0 }, CAP, { track: 0.3 }),
      Object.assign({ t: 'text', field: 'tiny', size: 0.013, colour: 'muted', x: 0.5, y: 0.8, align: 'centre', reveal: 'fade', at: 1.5, dur: 1 }, CAP, { track: 0.3 })
    ], { duration: 6, outSec: 1, shadow: 0.3 }),
    M('ti-chapter', 'titles', 'Chapter', 'one line in wide capitals', [F('big', 'Words', 'The Case of the Missing Road')], [
      Object.assign({ t: 'text', field: 'big', size: 0.045, x: 0.5, y: 0.5, align: 'centre', reveal: 'letters', at: 0.1, dur: 0.8, spread: 1.0, maxWidth: 0.86 }, CAP, { track: 0.2 })
    ], { duration: 4.5, outSec: 0.9 }),
    M('ti-later', 'titles', 'Time passes', '“13 years later”', [F('big', 'How long', '13 years'), F('small', 'After it', 'later')], [
      { t: 'text', x: 0.5, y: 0.5, align: 'centre', reveal: 'letters', at: 0.1, dur: 0.8, spread: 0.9, spans: [
        Object.assign({ field: 'big', size: 0.04 }, CAP, { track: 0.34 }), { text: '  ', size: 0.04 },
        Object.assign({ field: 'small', size: 0.026, colour: 'muted' }, CAP, { track: 0.4 })] }
    ], { duration: 4, outSec: 0.9 }),
    M('ti-hand', 'titles', 'Scrawled heading', 'handwriting over a line of capitals', [F('big', 'Handwritten', 'New episode'), F('small', 'Under it', 'The case of Ruth Adler')], [
      { t: 'text', field: 'big', role: 'hand', size: 0.1, x: 0.5, y: 0.44, align: 'centre', reveal: 'type', at: 0.1, spread: 0.9 },
      { t: 'text', field: 'small', role: 'sans', caps: 'upper', size: 0.022, track: 0.28, x: 0.5, y: 0.555, align: 'centre', reveal: 'letters', at: 0.6 }
    ], { duration: 4.5 }),
    M('ti-close', 'titles', 'Closing line', 'plain wide capitals, typed on', [F('big', 'Words', 'To be continued…')], [
      { t: 'text', field: 'big', role: 'sans', caps: 'small', size: 0.05, track: 0.14, x: 0.5, y: 0.5, align: 'centre', reveal: 'type', at: 0.1, spread: 1.3, dur: 0.5, maxWidth: 0.86 }
    ], { duration: 4.5, outSec: 1 }),
    M('ti-series', 'titles', 'Series card', 'a small line, the name, a small line', [F('top', 'Above', 'Watch the'), F('big', 'Name', 'Documentary'), F('bottom', 'Below', 'Original series')], [
      Object.assign({ t: 'text', field: 'top', size: 0.016, colour: 'muted', x: 0.5, y: 0.435, align: 'centre', reveal: 'letters', at: 0.5 }, CAP, { track: 0.4 }),
      Object.assign({ t: 'text', field: 'big', size: 0.07, x: 0.5, y: 0.5, align: 'centre', reveal: 'letters', at: 0.1, dur: 0.9, spread: 1.0, maxWidth: 0.9 }, CAP, { track: 0.12 }),
      Object.assign({ t: 'text', field: 'bottom', size: 0.014, colour: 'muted', x: 0.5, y: 0.565, align: 'centre', reveal: 'letters', at: 0.8 }, CAP, { track: 0.5 })
    ], { duration: 5, outSec: 0.9 }),
    M('ti-facts', 'titles', 'Three facts', 'three words, each with a small label', [F('list', 'Lines (label: word)', 'Filmed in: Ohio\nBased on: real events\nSix nominations: three awards', { multiline: true })], (v) => {
      const rows = lines(v.text.list).slice(0, 4).map(pair), n = rows.length || 1, out = [];
      rows.forEach((r, i) => {
        const x = 0.5 + (i - (n - 1) / 2) * (0.78 / Math.max(n, 3));
        out.push(Object.assign({ t: 'text', text: r[0], size: 0.014, colour: 'muted', x, y: 0.465, align: 'centre', reveal: 'letters', at: 0.5 + i * 0.15 }, CAP, { track: 0.34 }));
        out.push(Object.assign({ t: 'text', text: r[1], size: 0.04, x, y: 0.51, align: 'centre', reveal: 'letters', at: 0.1 + i * 0.15 }, CAP, { track: 0.14 }));
      });
      return out;
    }, { duration: 5 }),

    /* ----- dates and time ----- */
    M('dt-year', 'time', 'Year', 'the digits roll into place', [F('year', 'Year', '1994')], [
      { t: 'text', field: 'year', role: 'serif', size: 0.07, track: 0.34, x: 0.5, y: 0.5, align: 'centre', reveal: 'roll', at: 0.1, dur: 1.5 }
    ], { duration: 4, outSec: 0.8 }),
    M('dt-calendar', 'time', 'Calendar', 'a week of days, the date circled by hand', [F('date', 'Date (day month year)', '23 March 1994')], (v) => {
      const d = parseDate(v.text.date);
      if (!d) return [Object.assign({ t: 'text', text: v.text.date, size: 0.04, x: 0.5, y: 0.5, align: 'centre', reveal: 'letters', at: 0.1 }, CAP)];
      const out = [Object.assign({ t: 'text', text: `${MONTHS[d.m]}, ${d.y}`, size: 0.024, x: 0.5, y: 0.425, align: 'centre', reveal: 'letters', at: 0.1 }, CAP, { track: 0.24 })];
      for (let i = -3; i <= 3; i++) {
        const day = addDays(d.y, d.m, d.d, i), x = 0.5 + i * 0.062, at = 0.35 + Math.abs(i) * 0.09;
        out.push({ t: 'text', text: DAYS[weekday(day.y, day.m, day.d)], role: 'serif', size: 0.014, track: 0.22, colour: 'muted', x, y: 0.485, align: 'centre', reveal: 'fade', at, dur: 0.6 });
        out.push({ t: 'text', text: String(day.d), role: 'serif', size: 0.03, track: 0.06, colour: i ? 'muted' : 'text', x, y: 0.53, align: 'centre', reveal: 'rise', at: at + 0.05, dur: 0.6 });
      }
      out.push({ t: 'stroke', pts: ring(0.5, 0.527, 0.034, 0.044, 'cal' + v.text.date), w: 0.0022, at: 1.15, dur: 0.75 });
      return out;
    }, { duration: 5 }),
    M('dt-clock', 'time', 'Time & day', 'a clock time that rolls, and the day', [F('time', 'Time', '05:20 AM'), F('day', 'Day', 'May 13th')], [
      { t: 'text', x: 0.5, y: 0.5, align: 'centre', reveal: 'roll', at: 0.1, dur: 1.3, spans: [
        { field: 'time', role: 'serif', size: 0.04, track: 0.2 }, { text: '  /  ', role: 'serif', size: 0.04, colour: 'muted' }, { field: 'day', role: 'serif', size: 0.04, track: 0.06 }] }
    ], { duration: 4 }),
    M('dt-pointer', 'time', 'Marked day', 'a date, what happened, and a tick', [F('date', 'Date', 'May 10, 1992'), F('what', 'What happened', 'Day of the flood')], [
      Object.assign({ t: 'text', field: 'date', size: 0.026, x: 0.5, y: 0.43, align: 'centre', reveal: 'letters', at: 0.1 }, CAP, { track: 0.2 }),
      Object.assign({ t: 'text', field: 'what', size: 0.018, colour: 'muted', x: 0.5, y: 0.47, align: 'centre', reveal: 'letters', at: 0.5 }, CAP, { track: 0.3 }),
      { t: 'line', x1: 0.5, y1: 0.5, x2: 0.5, y2: 0.545, w: 0.0016, at: 0.8, dur: 0.6, from: 'start' }
    ], { duration: 4.5 }),
    M('dt-axis', 'time', 'Timeline', 'a ruled line of years with a marker', [F('date', 'Date', 'October 1991')], [
      Object.assign({ t: 'text', field: 'date', size: 0.03, x: 0.5, y: 0.44, align: 'centre', reveal: 'letters', at: 0.5 }, CAP, { track: 0.22 }),
      { t: 'ticks', x: 0.14, y: 0.52, w: 0.72, n: 49, every: 6, h: 0.012, colour: 'muted', at: 0, dur: 1.3 },
      { t: 'line', x1: 0.5, y1: 0.475, x2: 0.5, y2: 0.515, w: 0.002, at: 0.9, dur: 0.5, from: 'start' }
    ], { duration: 4.5 }),
    M('dt-jump', 'time', 'Time jump', 'the line slides from one date to another', [F('from', 'From', 'October 1991'), F('to', 'To', 'November 2020')], (v, total) => {
      const mid = Math.max(1.6, total * 0.45);
      return [
        Object.assign({ t: 'text', field: 'from', size: 0.03, x: 0.5, y: 0.44, align: 'centre', reveal: 'letters', at: 0.4, until: mid - 0.25 }, CAP, { track: 0.22 }),
        Object.assign({ t: 'text', field: 'to', size: 0.03, x: 0.5, y: 0.44, align: 'centre', reveal: 'letters', at: mid + 0.35 }, CAP, { track: 0.22 }),
        { t: 'ticks', x: 0.14, y: 0.52, w: 0.72, n: 49, every: 6, h: 0.012, colour: 'muted', at: 0, dur: 1.2, slide: 30, slideAt: mid - 0.5, slideDur: 1.4 },
        { t: 'line', x1: 0.5, y1: 0.475, x2: 0.5, y2: 0.515, w: 0.002, at: 0.8, dur: 0.5, from: 'start' }
      ];
    }, { duration: 6 }),
    M('dt-span', 'time', 'From – to', 'two years joined by a line', [F('from', 'From', '1987'), F('to', 'To', '1994'), F('what', 'What', 'The drought years')], [
      { t: 'text', field: 'from', role: 'serif', size: 0.04, track: 0.2, x: 0.36, y: 0.48, align: 'right', reveal: 'roll', at: 0.1, dur: 1.1 },
      { t: 'line', x1: 0.39, y1: 0.48, x2: 0.61, y2: 0.48, w: 0.0016, colour: 'muted', at: 0.5, dur: 1.1, from: 'start' },
      { t: 'text', field: 'to', role: 'serif', size: 0.04, track: 0.2, x: 0.64, y: 0.48, align: 'left', reveal: 'roll', at: 0.9, dur: 1.1 },
      Object.assign({ t: 'text', field: 'what', size: 0.018, colour: 'muted', x: 0.5, y: 0.545, align: 'centre', reveal: 'letters', at: 1.3 }, CAP, { track: 0.3 })
    ], { duration: 5 }),

    /* ----- words: quotes, statements, credits ----- */
    M('wd-quote', 'words', 'Quote', 'a pull quote and who said it', [F('quote', 'Quote', 'We rebuilt the bridge before the road, because people needed to cross. Nobody asked us to. It was simply the next thing to do.', { multiline: true }), F('who', 'Who said it', 'Ruth Adler')], [
      { t: 'plate', colour: '#000000', alpha: 0.5, at: 0, dur: 0.9 },
      { t: 'text', text: '“', role: 'serif', size: 0.11, x: 0.27, y: 0.4, align: 'left', reveal: 'fade', at: 0.1, dur: 0.8 },
      { t: 'text', field: 'quote', role: 'serif', size: 0.027, track: 0.01, x: 0.27, y: 0.48, valign: 'top', align: 'left', reveal: 'type', at: 0.3, spread: 1.8, dur: 0.5, maxWidth: 0.46, lineHeight: 1.6 },
      Object.assign({ t: 'text', field: 'who', size: 0.02, x: 0.73, y: 0.74, align: 'right', reveal: 'letters', at: 1.6 }, CAP, { track: 0.24 })
    ], { duration: 7, outSec: 0.9, shadow: 0 }),
    M('wd-script', 'words', 'Handwritten note', 'a paragraph written out by hand', [F('note', 'Words', 'I remember once she spent an entire Sunday afternoon teaching herself to fix our broken radio from a library book, and by evening the kitchen was full of music again.', { multiline: true })], [
      { t: 'plate', colour: '#000000', alpha: 0.55, at: 0, dur: 0.9 },
      { t: 'text', field: 'note', role: 'hand', size: 0.042, x: 0.5, y: 0.5, align: 'left', block: 'centre', reveal: 'type', at: 0.2, spread: 2.6, dur: 0.35, maxWidth: 0.62, lineHeight: 1.5 }
    ], { duration: 8, outSec: 0.9, shadow: 0 }),
    M('wd-statement', 'words', 'Statement', 'paragraphs of small text on a dimmed picture', [F('note', 'Paragraphs (a blank line between)', 'As the dust settled, Maya found solace in painting, her artworks soon celebrated worldwide.\n\nTom returned to the coast, becoming a conservationist.\n\nTogether, they kept a legacy of hope.', { multiline: true })], (v) => {
      const paras = String(v.text.note || '').split(/\r?\n\s*\r?\n/).map(x => x.replace(/\s+/g, ' ').trim()).filter(Boolean).slice(0, 4);
      const out = [{ t: 'plate', colour: '#000000', alpha: 0.72, at: 0, dur: 1 }];
      paras.forEach((p, i) => out.push({ t: 'text', text: p, role: 'serif', size: 0.022, track: 0.02, x: 0.3, y: 0.5 + (i - (paras.length - 1) / 2) * 0.115, align: 'left', reveal: 'type', at: 0.5 + i * 1.3, spread: 1.1, dur: 0.5, maxWidth: 0.42, lineHeight: 1.6 }));
      return out;
    }, { duration: 9, outSec: 1, shadow: 0 }),
    M('wd-credits', 'words', 'Credits', 'roles on the left, names on the right', [F('list', 'Lines (role: name)', 'Series idea: Jacob Gersch\nExecutive producers: Amal Said\n: Noa Levin\nCinematography: Tom Rees\nSound: Mira Haddad\nEditor: Daniel Okafor', { multiline: true })], (v) => {
      const rows = lines(v.text.list).slice(0, 12).map(pair), n = rows.length || 1, gap = Math.min(0.052, 0.62 / n), out = [];
      rows.forEach((r, i) => {
        const y = 0.5 + (i - (n - 1) / 2) * gap, at = 0.1 + i * 0.13;
        if (r[0]) out.push(Object.assign({ t: 'text', text: r[0], size: 0.015, colour: 'muted', x: 0.485, y, base: 0.024, align: 'right', reveal: 'letters', at, spread: 0.5 }, CAP, { track: 0.3 }));
        out.push(Object.assign({ t: 'text', text: r[1], size: 0.024, x: 0.515, y, align: 'left', reveal: 'letters', at: at + 0.1, spread: 0.5 }, CAP, { track: 0.2 }));
      });
      return out;
    }, { duration: 7, outSec: 0.9, shadow: 0.3 }),
    M('wd-cast', 'words', 'Cast row', 'people side by side, a small line over each', [F('list', 'Lines (small line: name)', 'Director: Jacob Gersch\nCamera: Amal Said\nEditor: Noa Levin\nSound: Tom Rees', { multiline: true })], (v) => {
      const rows = lines(v.text.list).slice(0, 5).map(pair), n = rows.length || 1, out = [];
      rows.forEach((r, i) => {
        const x = 0.5 + (i - (n - 1) / 2) * (0.8 / Math.max(n, 3)), at = 0.1 + i * 0.18;
        out.push(Object.assign({ t: 'text', text: r[0], size: 0.013, colour: 'muted', x, y: 0.795, align: 'centre', reveal: 'letters', at, spread: 0.5 }, CAP, { track: 0.36 }));
        out.push(Object.assign({ t: 'text', text: r[1], size: 0.024, x, y: 0.83, align: 'centre', reveal: 'letters', at: at + 0.12, spread: 0.6 }, CAP, { track: 0.2 }));
      });
      return out;
    }, { duration: 6, anchor: [0.5, 0.82] }),
    M('wd-file', 'words', 'File note', 'two tiny lines, like a case number', [F('a', 'Line 1', 'Case no. 32/1C'), F('b', 'Line 2', 'Tel. 01 5550 0142')], [
      Object.assign({ t: 'text', field: 'a', size: 0.016, x: 0.08, y: 0.85, align: 'left', reveal: 'letters', at: 0.1 }, CAP, { track: 0.34 }),
      { t: 'text', field: 'b', role: 'mono', size: 0.015, track: 0.1, colour: 'muted', x: 0.08, y: 0.882, align: 'left', reveal: 'type', at: 0.5, spread: 0.8 }
    ], { duration: 4, anchor: [0.08, 0.86] }),
    M('wd-source', 'words', 'Source line', 'where the footage came from, very small', [F('line', 'Words', 'Archive footage · Riverside Trust, 1987')], [
      Object.assign({ t: 'text', field: 'line', size: 0.015, colour: 'text', x: 0.5, y: 0.93, align: 'centre', reveal: 'fade', at: 0.1, dur: 0.8 }, CAP, { track: 0.3 })
    ], { duration: 4, anchor: [0.5, 0.93] }),

    /* ----- marks: things drawn on the picture ----- */
    M('mk-arrow', 'marks', 'Arrow', 'a hand-drawn arrow', [], (v) => [
      { t: 'stroke', pts: wobble([[0.62, 0.3], [0.57, 0.4], [0.5, 0.52], [0.44, 0.62]], 0.006, 'arrow'), w: 0.004, at: 0.1, dur: 0.7, head: 0.05 }
    ], { duration: 3, rotate: true, shadow: 0.4, outSec: 0.5 }),
    M('mk-circle', 'marks', 'Circle', 'a pen circle round something', [], (v) => [
      { t: 'stroke', pts: ring(0.5, 0.5, 0.09 * (v.stretch || 1), 0.16, 'ring'), w: 0.004, at: 0.1, dur: 0.8 }
    ], { duration: 3, stretch: true, shadow: 0.4, outSec: 0.5 }),
    M('mk-underline', 'marks', 'Underline', 'a quick stroke under something', [], (v) => [
      { t: 'stroke', pts: wobble([[0.36, 0.56], [0.45, 0.553], [0.55, 0.562], [0.64, 0.552]], 0.004, 'under'), w: 0.004, at: 0.1, dur: 0.5 }
    ], { duration: 3, rotate: true, shadow: 0.4, outSec: 0.5 }),
    M('mk-bracket', 'marks', 'Corners', 'four corners that frame a detail', [], (v) => {
      const w = 0.12 * (v.stretch || 1), hh = 0.2, l = 0.06, out = [];
      for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        const cx = 0.5 + sx * w, cy = 0.5 + sy * hh;
        out.push({ t: 'stroke', pts: [[cx - sx * l * 0.5625, cy], [cx, cy], [cx, cy - sy * l]], straight: true, w: 0.003, at: 0.1 + out.length * 0.08, dur: 0.45 });
      }
      return out;
    }, { duration: 3, stretch: true, shadow: 0.4, outSec: 0.5 }),
    M('mk-note', 'marks', 'Pointer note', 'a handwritten name with a line to its owner', [NAME], (v) => {
      const left = (v.opt || {}).side === 'left', s = left ? -1 : 1;
      return [
        { t: 'text', field: 'name', role: 'hand', size: 0.05, x: 0.5 + s * 0.06, y: 0.36, align: left ? 'right' : 'left', reveal: 'type', at: 0.1, spread: 0.7 },
        { t: 'stroke', pts: wobble([[0.5 + s * 0.05, 0.39], [0.5 + s * 0.03, 0.45], [0.5 - s * 0.01, 0.5], [0.5 - s * 0.04, 0.56]], 0.004, 'note'), w: 0.0028, at: 0.6, dur: 0.7 }
      ];
    }, { duration: 4, shadow: 0.4, options: [{ id: 'side', label: 'The line runs', value: 'right', choices: [{ value: 'right', label: 'Down to the left' }, { value: 'left', label: 'Down to the right' }] }] }),
    M('mk-highlight', 'marks', 'Marker', 'a marker-pen bar over a line of text', [], [
      { t: 'bar', x: 0.3, y: 0.47, w: 0.4, h: 0.06, colour: 'accent', alpha: 0.5, at: 0.1, dur: 0.7 }
    ], { duration: 3, stretch: true, rotate: true, shadow: 0, outSec: 0.5 }),
    M('mk-rule', 'marks', 'Rule', 'a hairline that draws from its middle', [], [
      { t: 'line', x1: 0.3, y1: 0.5, x2: 0.7, y2: 0.5, w: 0.0016, at: 0.1, dur: 1, from: 'centre' }
    ], { duration: 4, stretch: true, rotate: true, shadow: 0.3 })
  ];
  // how much a preset is enlarged in its small tile (about its anchor), so the type can be read there
  const TILE = {'nm-inline': 2.1, 'nm-stack': 2.3, 'nm-rule': 2.3, 'nm-centre': 2.3, 'nm-hand': 2.2, 'nm-place': 2.1, 'ti-film': 1, 'ti-chapter': 1.5, 'ti-later': 2, 'ti-hand': 1.6, 'ti-close': 1.5, 'ti-series': 1.5, 'ti-facts': 1.15, 'dt-year': 2.2, 'dt-calendar': 1.8, 'dt-clock': 1.9, 'dt-pointer': 2.2, 'dt-axis': 1.25, 'dt-jump': 1.25, 'dt-span': 1.7, 'wd-quote': 1.6, 'wd-script': 1.35, 'wd-statement': 1.7, 'wd-credits': 1.7, 'wd-cast': 1.15, 'wd-file': 2.3, 'wd-source': 1.8, 'mk-arrow': 1.4, 'mk-circle': 1.4, 'mk-underline': 1.4, 'mk-bracket': 1.3, 'mk-note': 1.6, 'mk-highlight': 1.3, 'mk-rule': 1.4};
  const GROUPS = [
    { id: 'names', name: 'Names', hint: 'who is speaking, where and when' }, { id: 'titles', name: 'Titles', hint: 'film titles and chapter cards' },
    { id: 'time', name: 'Dates & time', hint: 'years, calendars, timelines' }, { id: 'words', name: 'Quotes & credits', hint: 'quotes, statements, credits' },
    { id: 'marks', name: 'Marks', hint: 'arrows, circles, pointers' }
  ];

  /** A slightly uneven hand-drawn ring round (cx, cy), a little more than once round so the ends cross. */
  function ring(cx, cy, rx, ry, seed) {
    const r = rng(seed), pts = [], n = 22, a0 = -2.2 + r() * 0.4;
    for (let i = 0; i <= n + 2; i++) { const a = a0 + (i / n) * Math.PI * 2, k = 1 + (r() - 0.5) * 0.07 + (i / n) * 0.035; pts.push([cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k]); }
    return pts;
  }
  /** The points of a pen stroke, nudged a little so it isn't ruler-straight (the ends stay put). */
  function wobble(pts, amount, seed) { const r = rng(seed); return pts.map((p, i) => (i === 0 || i === pts.length - 1 ? p : [p[0] + (r() - 0.5) * amount, p[1] + (r() - 0.5) * amount])); }

  /* ---------- laying a scene out ---------- */
  /** A smooth path through points (Catmull-Rom), as many short segments. pts in pixels. */
  function smooth(pts, per) {
    if (pts.length < 3) return pts.slice();
    const out = [], n = pts.length, P = i => pts[Math.max(0, Math.min(n - 1, i))];
    for (let i = 0; i < n - 1; i++) {
      const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
      for (let s = 0; s < per; s++) {
        const t = s / per, t2 = t * t, t3 = t2 * t;
        out.push([0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
          0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3)]);
      }
    }
    out.push(pts[n - 1]);
    return out;
  }
  const textOf = (sp, v) => { let s = sp.text != null ? String(sp.text) : String(((v.text || {})[sp.field]) != null ? v.text[sp.field] : ''); return sp.caps === 'upper' ? s.toUpperCase() : s; };

  /**
   * Lay a preset out for a frame size: every letter's place, every stroke's points in pixels, and when each starts.
   * ctx only measures here. v: the values (text, colours, fonts, scale, dx, dy, shadow, rot, stretch, opt).
   * -> {W, H, unit, total, outSec, inEnd, outStart, busy:[[from, to]], items:[…], shadow}
   */
  function prepare(ctx, W, H, preset, v, total) {
    total = Math.max(0.6, Number(total || v.duration || preset.duration || 5));
    const outSec = Math.min(preset.outSec || 0.7, total * 0.4), outStart = total - outSec;
    const unit = Math.min(H, W * 9 / 16), sc = Number(v.scale) || 1, ax = preset.anchor[0], ay = preset.anchor[1];
    const rot = (Number(v.rot) || 0) * Math.PI / 180, cr = Math.cos(rot), sr = Math.sin(rot);
    // a point of the design -> pixels: scaled about the preset's anchor, turned (marks only), then moved
    const px = (x, y, turn) => {
      let dx = (x - ax) * W * sc, dy = (y - ay) * H * sc;
      if (turn && rot) { const rx = dx * cr - dy * sr, ry = dx * sr + dy * cr; dx = rx; dy = ry; }
      return [ax * W + dx + (Number(v.dx) || 0) * W, ay * H + dy + (Number(v.dy) || 0) * H];
    };
    const fonts = Object.assign({ serif: 'Georgia', sans: 'Arial', mono: 'Courier New', hand: 'cursive' }, v.fonts || {});
    const colour = role => (v.colours && v.colours[role]) || { text: '#f4f1ea', muted: '#b9b4a8', accent: '#c9a96a' }[role] || role || '#f4f1ea';
    const src = preset.build ? preset.build(v, total) : preset.items;
    const scene = { W, H, unit, total, outSec, outStart, inEnd: 0, busy: [], items: [], shadow: v.shadow != null ? Number(v.shadow) : (preset.shadow || 0) };
    const wCache = {};
    const width = (font, s) => { const k = font + '|' + s; if (wCache[k] == null) { ctx.font = font; wCache[k] = ctx.measureText(s).width; } return wCache[k]; };
    const seen = t => { if (t > scene.inEnd) scene.inEnd = t; };

    src.forEach((it, index) => {
      const at = Number(it.at) || 0;
      if (it.t === 'text') {
        const spans = (it.spans || [it]).map(sp => ({ sp, s: textOf(sp, v) }));
        if (!spans.some(x => x.s.trim())) return;
        // letters with their own size and face
        const glyphLine = (parts) => {   // parts: [{sp, s}] -> {glyphs, w}
          const gs = []; let x = 0;
          for (const { sp, s } of parts) {
            const base = Math.max(4, Math.round((sp.size || it.size) * unit * sc)), family = fonts[sp.role || it.role || 'serif'] || fonts.serif;
            const tr = (sp.track != null ? sp.track : it.track || 0) * base, caps = sp.caps || it.caps, o = { bold: sp.bold || it.bold, italic: sp.italic || it.italic };
            const kern = caps !== 'small';   // one face and size: measure the run so far, so pairs keep their fit
            const fontFull = cssFont(base, family, o), fontSmall = cssFont(Math.round(base * 0.8), family, o);
            let run = '', x0 = x;
            for (const ch0 of Array.from(s)) {
              const lower = caps === 'small' && ch0 !== ch0.toUpperCase(), ch = caps === 'small' ? ch0.toUpperCase() : ch0;
              const font = lower ? fontSmall : fontFull, n = gs.length;
              let gx, adv;
              if (kern) { gx = x0 + width(fontFull, run) + tr * Array.from(run).length; run += ch; adv = x0 + width(fontFull, run) + tr * Array.from(run).length - gx; x = gx + adv; }
              else { gx = x; adv = width(font, ch) + tr; x += adv; }
              gs.push({ ch, x: gx, adv, font, px: lower ? Math.round(base * 0.8) : base, base, colour: colour(sp.colour || it.colour || 'text'), space: !ch.trim(), n });
            }
            if (gs.length) x -= tr;   // no spacing after a run's last letter
            x += tr;
          }
          const last = gs[gs.length - 1];
          return { glyphs: gs, w: last ? last.x + last.adv - (last.adv > width(last.font, last.ch) ? last.adv - width(last.font, last.ch) : 0) : 0 };
        };
        // lines: typed breaks, then wrapped to maxWidth (one style only)
        let rows = [];
        if (it.spans) rows = [glyphLine(spans)];
        else {
          const maxW = it.maxWidth ? it.maxWidth * W * Math.max(1, sc * 0.999) : Infinity;
          for (const para of spans[0].s.split(/\r?\n/)) {
            const words = para.split(/\s+/).filter(Boolean); let cur = '';
            if (!words.length) continue;
            for (const w of words) {
              const tryLine = cur ? cur + ' ' + w : w;
              if (cur && glyphLine([{ sp: it, s: tryLine }]).w > maxW) { rows.push(glyphLine([{ sp: it, s: cur }])); cur = w; } else cur = tryLine;
            }
            if (cur) rows.push(glyphLine([{ sp: it, s: cur }]));
          }
        }
        if (!rows.length) return;
        const basePx = Math.max(...rows.map(r => Math.max(...r.glyphs.map(g => g.base), 0)), 4), lh = (it.lineHeight || 1.25) * basePx;
        const [X, Y] = px(it.x, it.y, false), blockW = Math.max(...rows.map(r => r.w));
        const top = it.valign === 'top' ? Y : Y - (rows.length - 1) * lh / 2;
        const glyphs = [];
        rows.forEach((r, k) => {
          let left = it.align === 'centre' ? X - r.w / 2 : it.align === 'right' ? X - r.w : X;
          if (it.block === 'centre') left = X - blockW / 2;   // a left-ranged paragraph, centred as a block
          for (const g of r.glyphs) glyphs.push(Object.assign(g, { x: left + g.x, y: top + k * lh + (it.base ? Math.round(it.base * unit * sc) : basePx) * 0.34, line: k }));
        });
        const ink = glyphs.filter(g => !g.space), n = ink.length;
        const reveal = it.reveal || 'letters', dur = it.dur != null ? it.dur : reveal === 'type' ? 0.3 : reveal === 'roll' ? 1.3 : 0.6;
        const spread = reveal === 'fade' || reveal === 'rise' ? 0 : it.spread != null ? it.spread : reveal === 'type' ? Math.min(2.4, n * 0.04) : Math.min(0.9, 0.25 + n * 0.03);
        const order = ink.map((g, i) => i);
        if (reveal === 'letters') { const r = rng(preset.id + index + ink.map(g => g.ch).join('')); for (let i = n - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); const t = order[i]; order[i] = order[j]; order[j] = t; } }
        const rank = []; order.forEach((gi, pos) => { rank[gi] = pos; });
        const until = it.until != null ? Math.min(it.until, outStart) : outStart, fade = it.until != null ? 0.5 : outSec;
        ink.forEach((g, i) => {
          const f = n > 1 ? rank[i] / (n - 1) : 0;
          g.start = at + f * spread; g.dur = dur;
          g.outStart = until + (reveal === 'letters' || reveal === 'type' ? (1 - f) * fade * 0.45 : 0); g.outDur = fade * 0.55;
          if (reveal === 'roll' && /\d/.test(g.ch)) { g.digit = Number(g.ch); g.turns = 9 + (i % 4) * 4; g.start = at + i * 0.07; g.dur = dur; }
        });
        seen(at + spread + dur + (reveal === 'roll' ? n * 0.07 : 0));
        if (it.until != null) scene.busy.push([until - 0.05, until + fade + 0.05]);
        scene.items.push({ t: 'text', reveal, glyphs: ink, blur: reveal === 'letters' ? 0.14 : reveal === 'fade' ? 0.06 : 0, rise: reveal === 'rise' ? basePx * 0.35 : 0, box: { x: Math.min(...glyphs.map(g => g.x)), y: top - basePx * 0.6, w: blockW, h: rows.length * lh }, lh: basePx * 1.15 });
        return;
      }
      const dur = it.dur != null ? it.dur : 0.8, lw = Math.max(1, (it.w || 0.002) * unit * Math.sqrt(sc));
      if (it.t === 'line') {
        const a = px(it.x1, it.y1, true), b = px(it.x2, it.y2, true);
        // stretch: the line's length about its middle
        const k = preset.stretch && v.stretch ? Number(v.stretch) : 1, mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
        scene.items.push({ t: 'line', a: [mx + (a[0] - mx) * k, my + (a[1] - my) * k], b: [mx + (b[0] - mx) * k, my + (b[1] - my) * k], lw, colour: colour(it.colour || 'text'), at, dur, from: it.from || 'start' });
      } else if (it.t === 'ticks') {
        const a = px(it.x, it.y, false), b = px(it.x + it.w, it.y, false);
        scene.items.push({ t: 'ticks', x: a[0], y: a[1], w: b[0] - a[0], n: it.n, every: it.every || 5, h: (it.h || 0.012) * unit * sc, lw: Math.max(1, 0.0014 * unit), colour: colour(it.colour || 'muted'), at, dur, slide: it.slide || 0, slideAt: it.slideAt || 0, slideDur: it.slideDur || 1 });
        if (it.slide) scene.busy.push([it.slideAt - 0.05, it.slideAt + it.slideDur + 0.05]);
      } else if (it.t === 'stroke') {
        const raw = it.pts.map(p => px(p[0], p[1], true)), pts = it.straight ? raw : smooth(raw, 14), len = [0];
        for (let i = 1; i < pts.length; i++) len.push(len[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
        scene.items.push({ t: 'stroke', pts, len, lw, colour: colour(it.colour || 'text'), at, dur, head: it.head ? it.head * unit * sc : 0 });
      } else if (it.t === 'plate') {
        scene.items.push({ t: 'plate', colour: it.colour || '#000000', alpha: it.alpha != null ? it.alpha : 0.5, at, dur });
      } else if (it.t === 'bar') {
        const k = preset.stretch && v.stretch ? Number(v.stretch) : 1, c = px(it.x + it.w / 2, it.y + it.h / 2, false);
        scene.items.push({ t: 'bar', cx: c[0], cy: c[1], w: it.w * W * sc * k, h: it.h * H * sc, rot, colour: colour(it.colour || 'accent'), alpha: it.alpha != null ? it.alpha : 0.5, at, dur, seed: preset.id });
      }
      seen(at + dur + (it.head ? 0.25 : 0));
    });
    scene.inEnd = Math.min(scene.inEnd, outStart);
    return scene;
  }

  /* ---------- drawing a scene at a time ---------- */
  /** Draw the scene as it looks t seconds in, over whatever is on the canvas already (nothing is cleared). */
  function draw(ctx, scene, t) {
    const { unit, outStart, outSec } = scene, leave = 1 - easeIn((t - outStart) / outSec);
    ctx.save();
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const it of scene.items) {
      if (it.t === 'plate') { const a = easeInOut((t - it.at) / it.dur) * leave * it.alpha; if (a > 0.002) { ctx.globalAlpha = a; ctx.fillStyle = it.colour; ctx.fillRect(0, 0, scene.W, scene.H); } }
    }
    const shadow = on => { if (on && scene.shadow > 0) { ctx.shadowColor = `rgba(0,0,0,${Math.min(0.9, 0.75 * scene.shadow)})`; ctx.shadowBlur = unit * 0.014; ctx.shadowOffsetY = unit * 0.002; } else { ctx.shadowColor = 'rgba(0,0,0,0)'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0; } };
    shadow(true);
    for (const it of scene.items) {
      if (it.t === 'text') {
        for (const g of it.glyphs) {
          const p = easeOut((t - g.start) / g.dur), out = 1 - easeIn((t - g.outStart) / g.outDur);
          if (g.digit != null) { rollDigit(ctx, it, g, t, out); continue; }
          const a = p * out;
          if (a <= 0.003) continue;
          const soft = it.blur ? (1 - Math.min(p, out)) * g.px * it.blur : 0;
          if ('filter' in ctx) ctx.filter = soft > 0.4 ? `blur(${soft.toFixed(1)}px)` : 'none';
          ctx.globalAlpha = a; ctx.fillStyle = g.colour; ctx.font = g.font;
          ctx.fillText(g.ch, g.x, g.y + (it.rise ? (1 - p) * it.rise : 0));
        }
        if ('filter' in ctx) ctx.filter = 'none';
      } else if (it.t === 'line') {
        const p = easeInOut((t - it.at) / it.dur);
        if (p <= 0 || leave <= 0.003) continue;
        const ax = it.from === 'centre' ? (it.a[0] + it.b[0]) / 2 - (it.b[0] - it.a[0]) * p / 2 : it.a[0], ay = it.from === 'centre' ? (it.a[1] + it.b[1]) / 2 - (it.b[1] - it.a[1]) * p / 2 : it.a[1];
        const bx = it.from === 'centre' ? (it.a[0] + it.b[0]) / 2 + (it.b[0] - it.a[0]) * p / 2 : it.a[0] + (it.b[0] - it.a[0]) * p, by = it.from === 'centre' ? (it.a[1] + it.b[1]) / 2 + (it.b[1] - it.a[1]) * p / 2 : it.a[1] + (it.b[1] - it.a[1]) * p;
        ctx.globalAlpha = leave; ctx.strokeStyle = it.colour; ctx.lineWidth = it.lw; ctx.lineCap = 'butt';
        ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke(); ctx.lineCap = 'round';
      } else if (it.t === 'ticks') {
        const p = easeOut((t - it.at) / it.dur);
        if (p <= 0 || leave <= 0.003) continue;
        const gap = it.w / (it.n - 1), mid = it.x + it.w / 2, off = it.slide ? easeInOut((t - it.slideAt) / it.slideDur) * it.slide : 0;
        ctx.strokeStyle = it.colour; ctx.lineWidth = it.lw; ctx.lineCap = 'butt';
        ctx.globalAlpha = leave * p * 0.8; ctx.beginPath(); ctx.moveTo(mid - it.w * p / 2, it.y); ctx.lineTo(mid + it.w * p / 2, it.y); ctx.stroke();
        const whole = Math.floor(off), frac = off - whole;
        for (let i = -1; i <= it.n; i++) {
          const x = it.x + (i - frac) * gap, d = Math.abs(x - mid) / (it.w / 2);
          if (d > p || d > 1) continue;
          const edge = Math.min(1, (1 - d) / 0.18), major = (((i + whole) % it.every) + it.every) % it.every === 0;
          ctx.globalAlpha = leave * edge * (major ? 1 : 0.7);
          ctx.beginPath(); ctx.moveTo(x, it.y); ctx.lineTo(x, it.y - it.h * (major ? 1 : 0.5)); ctx.stroke();
        }
        ctx.lineCap = 'round';
      } else if (it.t === 'stroke') {
        const p = easeInOut((t - it.at) / it.dur);
        if (p <= 0 || leave <= 0.003) continue;
        const total = it.len[it.len.length - 1], want = total * p;
        ctx.globalAlpha = leave; ctx.strokeStyle = it.colour; ctx.lineWidth = it.lw;
        ctx.beginPath(); ctx.moveTo(it.pts[0][0], it.pts[0][1]);
        let end = it.pts[0], before = it.pts[0];
        for (let i = 1; i < it.pts.length; i++) {
          if (it.len[i] <= want) { ctx.lineTo(it.pts[i][0], it.pts[i][1]); before = end; end = it.pts[i]; continue; }
          const k = (want - it.len[i - 1]) / Math.max(1e-6, it.len[i] - it.len[i - 1]);
          before = it.pts[i - 1]; end = [it.pts[i - 1][0] + (it.pts[i][0] - it.pts[i - 1][0]) * k, it.pts[i - 1][1] + (it.pts[i][1] - it.pts[i - 1][1]) * k];
          ctx.lineTo(end[0], end[1]); break;
        }
        ctx.stroke();
        if (it.head) {   // the two barbs open once the shaft has arrived
          const hp = easeOut((t - it.at - it.dur * 0.85) / 0.25);
          if (hp > 0) {
            const n = it.pts.length, a = Math.atan2(it.pts[n - 1][1] - it.pts[n - 4][1], it.pts[n - 1][0] - it.pts[n - 4][0]), tip = it.pts[n - 1];
            ctx.beginPath();
            for (const s of [-1, 1]) { ctx.moveTo(tip[0], tip[1]); ctx.lineTo(tip[0] - Math.cos(a + s * 0.42) * it.head * hp, tip[1] - Math.sin(a + s * 0.42) * it.head * hp); }
            ctx.stroke();
          }
        }
      } else if (it.t === 'bar') {
        const p = easeInOut((t - it.at) / it.dur);
        if (p <= 0 || leave <= 0.003) continue;
        shadow(false);
        const r = rng(it.seed), w = it.w * p, x0 = -it.w / 2, hh = it.h / 2, j = () => (r() - 0.5) * it.h * 0.12;
        ctx.save(); ctx.translate(it.cx, it.cy); ctx.rotate(it.rot);
        ctx.globalAlpha = leave * it.alpha; ctx.fillStyle = it.colour;
        ctx.beginPath(); ctx.moveTo(x0 + j(), -hh + j()); ctx.lineTo(x0 + w, -hh + j()); ctx.lineTo(x0 + w + j(), hh + j()); ctx.lineTo(x0 + j(), hh + j()); ctx.closePath(); ctx.fill();
        ctx.restore(); shadow(true);
      }
    }
    ctx.restore();
  }
  /** One digit of a rolling number: the column of digits slides up and stops on the right one. */
  function rollDigit(ctx, it, g, t, out) {
    const p = easeOut((t - g.start) / g.dur), a = Math.min(1, (t - g.start) / 0.25) * out;
    if (a <= 0.003) return;
    const pos = g.digit - (1 - p) * g.turns, lo = Math.floor(pos), frac = pos - lo, lh = it.lh;
    const d = n => String(((n % 10) + 10) % 10);
    ctx.save();
    ctx.beginPath(); ctx.rect(g.x - g.px * 0.3, g.y - g.px * 0.86, g.adv + g.px * 0.6, g.px * 1.12); ctx.clip();
    ctx.fillStyle = g.colour; ctx.font = g.font;
    const moving = p < 0.999;
    ctx.globalAlpha = a * (moving ? 0.55 + 0.45 * p : 1);
    ctx.fillText(d(lo), g.x, g.y - frac * lh);
    if (frac > 0.001) ctx.fillText(d(lo + 1), g.x, g.y + (1 - frac) * lh);
    ctx.restore();
  }

  /* ---------- the frames of a clip ---------- */
  /**
   * Which frames of the clip need drawing: the entrance, the exit and any moment something moves; the still stretch in
   * between is one picture reused. -> [{i (0-based), t, same (the frame it repeats, or null)}]
   */
  function frames(scene, fps) {
    const n = Math.max(2, Math.round(scene.total * fps)), out = [], f = 1 / fps;
    let hold = null;
    for (let i = 0; i < n; i++) {
      const t = i * f;
      const moving = t <= scene.inEnd + f || t >= scene.outStart - f * 0.5 || scene.busy.some(b => t >= b[0] && t <= b[1]);
      if (moving) { out.push({ i, t, same: null }); hold = null; }
      else if (hold == null) { hold = i; out.push({ i, t, same: null }); }
      else out.push({ i, t, same: hold });
    }
    return out;
  }
  /** The moment that shows a preset whole: everything arrived, nothing leaving (thumbnails, the still preview). */
  const holdTime = scene => Math.min(scene.outStart - 0.01, Math.max(scene.inEnd + 0.05, (scene.inEnd + scene.outStart) / 2));

  /** The font roles and colour roles a preset uses with these values (what the tab offers to change). */
  function uses(preset, v) {
    const src = preset.build ? preset.build(v || { text: {} }, (v && v.duration) || preset.duration) : preset.items, roles = new Set(), colours = new Set();
    for (const it of src) {
      if (it.t === 'text') for (const sp of it.spans || [it]) { roles.add(sp.role || it.role || 'serif'); colours.add(sp.colour || it.colour || 'text'); }
      else if (it.t === 'plate') continue;
      else colours.add(it.colour || (it.t === 'bar' ? 'accent' : it.t === 'ticks' ? 'muted' : 'text'));
    }
    return { roles: Array.from(roles), colours: Array.from(colours).filter(c => /^(text|muted|accent)$/.test(c)) };
  }

  US.mvfxMotion = { PRESETS, GROUPS, TILE, uses, prepare, draw, frames, holdTime, parseDate, weekday, ring, wobble, smooth, rng, easeOut, easeIn, easeInOut, cssFont, rgba };
})();
