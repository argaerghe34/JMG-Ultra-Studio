/* JMG Ultra Studio – mVFX › the Documentary pack: every preset (lower thirds, titles, timelines, overlays, backgrounds,
   freeze frames, movements, transitions, looks), the fonts, the painter that draws a preset at any size (thumbnails,
   the preview, and the PNG layers Premiere gets), and the plan of layers each editor is given. Pure: no DOM except
   a canvas handed in, no Premiere – unit-tested in dev/tests/mvfx.test.js. The Resolve templates are made from the
   same presets in 39-mvfx-fusion.js; the colour looks in 39-mvfx-looks.js; the tab is 39-mvfx.js.
   Our own design throughout: the categories follow what documentary packs cover; the type, layout and motion are ours. */
(function () {
  'use strict';
  const US = window.US;

  /* ---------- fonts: a family per role, present on this computer; PostScript names for Premiere ---------- */
  // ps: [regular, bold]; Resolve takes the family + "Regular"/"Bold"
  const FAMILIES = {
    'Georgia': { ps: ['Georgia', 'Georgia-Bold'], role: 'serif' },
    'Baskerville': { ps: ['Baskerville', 'Baskerville-Bold'], role: 'serif' },
    'Palatino': { ps: ['Palatino-Roman', 'Palatino-Bold'], role: 'serif' },
    'Palatino Linotype': { ps: ['PalatinoLinotype-Roman', 'PalatinoLinotype-Bold'], role: 'serif' },
    'Hoefler Text': { ps: ['HoeflerText-Regular', 'HoeflerText-Black'], role: 'serif' },
    'Cambria': { ps: ['Cambria', 'Cambria-Bold'], role: 'serif' },
    'Garamond': { ps: ['Garamond', 'Garamond-Bold'], role: 'serif' },
    'Times New Roman': { ps: ['TimesNewRomanPSMT', 'TimesNewRomanPS-BoldMT'], role: 'serif' },
    'Helvetica Neue': { ps: ['HelveticaNeue', 'HelveticaNeue-Bold'], role: 'sans' },
    'Avenir Next': { ps: ['AvenirNext-Regular', 'AvenirNext-Bold'], role: 'sans' },
    'Gill Sans': { ps: ['GillSans', 'GillSans-Bold'], role: 'sans' },
    'Segoe UI': { ps: ['SegoeUI', 'SegoeUI-Bold'], role: 'sans' },
    'Calibri': { ps: ['Calibri', 'Calibri-Bold'], role: 'sans' },
    'Bahnschrift': { ps: ['Bahnschrift', 'Bahnschrift-Bold'], role: 'sans' },
    'Open Sans': { ps: ['OpenSans-Regular', 'OpenSans-Bold'], role: 'sans' },
    'Arial': { ps: ['ArialMT', 'Arial-BoldMT'], role: 'sans' },
    'Menlo': { ps: ['Menlo-Regular', 'Menlo-Bold'], role: 'mono' },
    'American Typewriter': { ps: ['AmericanTypewriter', 'AmericanTypewriter-Bold'], role: 'mono' },
    'Consolas': { ps: ['Consolas', 'Consolas-Bold'], role: 'mono' },
    'Courier New': { ps: ['CourierNewPSMT', 'CourierNewPS-BoldMT'], role: 'mono' }
  };
  const ROLES = { serif: 'Serif (titles, quotes)', sans: 'Sans (names, roles)', mono: 'Typewriter (stamps, dates)' };
  // the first family of each role that this computer has (document.fonts.check), else the last (always there)
  const PREFER = {
    serif: ['Georgia', 'Baskerville', 'Palatino', 'Palatino Linotype', 'Cambria', 'Hoefler Text', 'Garamond', 'Times New Roman'],
    sans: ['Helvetica Neue', 'Avenir Next', 'Segoe UI', 'Gill Sans', 'Calibri', 'Bahnschrift', 'Open Sans', 'Arial'],
    mono: ['Menlo', 'American Typewriter', 'Consolas', 'Courier New']
  };
  /** Which families this computer has. check(family) -> bool (document.fonts.check in the panel, a stub in tests). */
  function available(check) {
    const out = {};
    for (const role of Object.keys(PREFER)) {
      const list = PREFER[role].filter(f => { try { return !!check(f); } catch (e) { return false; } });
      out[role] = list.length ? list : [PREFER[role][PREFER[role].length - 1]];
    }
    return out;
  }
  /** The PostScript name Premiere wants. Unknown families: a guess from the name. */
  function psName(family, bold) {
    const f = FAMILIES[family];
    if (f) return f.ps[bold ? 1 : 0];
    const base = String(family || 'Arial').replace(/\s+/g, '');
    return bold ? base + '-Bold' : base;
  }

  /* ---------- the presets ---------- */
  // Each layer: text {field, role (serif|sans|mono), size (fraction of the frame height), bold, caps, tracking (em),
  // colour (text|accent|muted|ink), x, y (fractions of the frame; y = the line's middle), align (left|centre|right),
  // anim (fade|rise|slide|wipe|none), maxWidth (fraction)} or rect {x, y, w, h (fractions, top-left), colour,
  // anim (fade|grow|growY|none), radius?}. Colours are roles the user can change; values below are the defaults.
  const DOC = { text: '#f4f1ea', accent: '#c9a96a', muted: '#b9b4a8', ink: '#101010' };
  const NAME = { id: 'name', label: 'Name', value: 'Ruth Adler' }, ROLE = { id: 'role', label: 'Title or role', value: 'Founder, Riverside Trust' };
  const T = (o) => Object.assign({ type: 'text', role: 'sans', size: 0.045, bold: false, caps: false, tracking: 0, colour: 'text', align: 'left', anim: 'fade' }, o);
  const R = (o) => Object.assign({ type: 'rect', colour: 'accent', anim: 'fade' }, o);
  const title = (id, label, sub, fields, layers, extra) => Object.assign({ id, group: 'lower', kind: 'title', label, sub, fields, layers, duration: 5, inSec: 0.6, outSec: 0.5 }, extra);

  const PRESETS = [
    // ----- lower thirds: the interviewee's name and role, bottom left, never boxed -----
    title('hairline', 'Hairline', 'name over a thin rule', [NAME, ROLE], [
      R({ x: 0.08, y: 0.805, w: 0.22, h: 0.003, anim: 'grow' }),
      T({ field: 'name', role: 'serif', size: 0.058, y: 0.765, x: 0.08, anim: 'rise' }),
      T({ field: 'role', size: 0.028, caps: true, tracking: 0.12, colour: 'muted', y: 0.845, x: 0.08, anim: 'fade' })
    ]),
    title('tag', 'Tag', 'small role above the name', [NAME, ROLE], [
      T({ field: 'role', size: 0.024, caps: true, tracking: 0.2, colour: 'accent', y: 0.745, x: 0.08, anim: 'fade' }),
      T({ field: 'name', role: 'serif', size: 0.064, y: 0.805, x: 0.08, anim: 'rise' })
    ]),
    title('block', 'Block', 'a solid bar behind the name', [NAME, ROLE], [
      R({ x: 0.06, y: 0.74, w: 0.34, h: 0.115, colour: 'ink', anim: 'grow', alpha: 0.85 }),
      R({ x: 0.06, y: 0.74, w: 0.006, h: 0.115, colour: 'accent', anim: 'growY' }),
      T({ field: 'name', size: 0.05, bold: true, y: 0.78, x: 0.085, anim: 'slide' }),
      T({ field: 'role', size: 0.026, colour: 'muted', y: 0.828, x: 0.085, anim: 'slide' })
    ]),
    title('bracket', 'Bracket', 'a corner bracket, like a caption', [NAME, ROLE], [
      R({ x: 0.08, y: 0.745, w: 0.004, h: 0.11, anim: 'growY' }),
      R({ x: 0.08, y: 0.745, w: 0.05, h: 0.004, anim: 'grow' }),
      T({ field: 'name', size: 0.05, bold: true, y: 0.785, x: 0.1, anim: 'slide' }),
      T({ field: 'role', size: 0.026, caps: true, tracking: 0.1, colour: 'muted', y: 0.832, x: 0.1, anim: 'slide' })
    ]),
    title('stacked', 'Stacked', 'serif name, sans role, centred', [NAME, ROLE], [
      T({ field: 'name', role: 'serif', size: 0.066, align: 'centre', x: 0.5, y: 0.78, anim: 'rise' }),
      R({ x: 0.47, y: 0.823, w: 0.06, h: 0.003, anim: 'grow' }),
      T({ field: 'role', size: 0.026, caps: true, tracking: 0.18, colour: 'muted', align: 'centre', x: 0.5, y: 0.86, anim: 'fade' })
    ]),
    title('underline', 'Underline', 'a line that draws under the name', [NAME, ROLE], [
      T({ field: 'name', size: 0.056, bold: true, y: 0.775, x: 0.08, anim: 'wipe' }),
      R({ x: 0.08, y: 0.815, w: 0.3, h: 0.004, anim: 'grow' }),
      T({ field: 'role', size: 0.027, colour: 'muted', y: 0.85, x: 0.08, anim: 'fade' })
    ]),
    title('sidebar', 'Side bar', 'a bar at the edge of frame', [NAME, ROLE], [
      R({ x: 0, y: 0.72, w: 0.012, h: 0.16, anim: 'growY' }),
      T({ field: 'name', role: 'serif', size: 0.056, y: 0.77, x: 0.04, anim: 'slide' }),
      T({ field: 'role', size: 0.027, caps: true, tracking: 0.1, colour: 'muted', y: 0.835, x: 0.04, anim: 'slide' })
    ]),
    title('typewriter', 'Typewriter', 'a stamp in typewriter letters', [NAME, ROLE], [
      T({ field: 'name', role: 'mono', size: 0.042, caps: true, tracking: 0.06, y: 0.78, x: 0.08, anim: 'wipe' }),
      T({ field: 'role', role: 'mono', size: 0.028, colour: 'muted', y: 0.83, x: 0.08, anim: 'wipe' })
    ]),

    // ----- titles and cards -----
    title('chapter', 'Chapter', 'a numbered chapter card', [{ id: 'small', label: 'Small line', value: 'Chapter One' }, { id: 'big', label: 'Title', value: 'The River' }], [
      T({ field: 'small', size: 0.026, caps: true, tracking: 0.3, colour: 'accent', align: 'centre', x: 0.5, y: 0.42, anim: 'fade' }),
      T({ field: 'big', role: 'serif', size: 0.11, align: 'centre', x: 0.5, y: 0.53, anim: 'rise', maxWidth: 0.8 })
    ], { group: 'titles', duration: 5, inSec: 0.9, outSec: 0.7 }),
    title('section', 'Section number', '01 / a heading', [{ id: 'num', label: 'Number', value: '01' }, { id: 'big', label: 'Heading', value: 'Before the flood' }], [
      T({ field: 'num', role: 'mono', size: 0.05, colour: 'accent', x: 0.12, y: 0.5, anim: 'fade' }),
      R({ x: 0.2, y: 0.47, w: 0.003, h: 0.06, colour: 'muted', anim: 'growY' }),
      T({ field: 'big', role: 'serif', size: 0.07, x: 0.23, y: 0.5, anim: 'slide', maxWidth: 0.6 })
    ], { group: 'titles' }),
    title('opening', 'Opening title', 'the film’s name, wide letters', [{ id: 'big', label: 'Title', value: 'A Quiet Harvest' }, { id: 'small', label: 'Under it', value: 'A film by Jacob Gersch' }], [
      T({ field: 'big', role: 'serif', size: 0.1, caps: true, tracking: 0.22, align: 'centre', x: 0.5, y: 0.48, anim: 'fade', maxWidth: 0.86 }),
      T({ field: 'small', size: 0.024, caps: true, tracking: 0.3, colour: 'muted', align: 'centre', x: 0.5, y: 0.6, anim: 'fade' })
    ], { group: 'titles', duration: 6, inSec: 1.4, outSec: 1 }),
    title('location', 'Location & date', 'a corner stamp', [{ id: 'place', label: 'Place', value: 'Hebron Valley, Kenya' }, { id: 'date', label: 'Date', value: 'March 2024' }], [
      R({ x: 0.06, y: 0.1, w: 0.004, h: 0.085, anim: 'growY' }),
      T({ field: 'place', size: 0.04, bold: true, x: 0.08, y: 0.125, anim: 'slide' }),
      T({ field: 'date', role: 'mono', size: 0.026, colour: 'muted', x: 0.08, y: 0.168, anim: 'slide' })
    ], { group: 'titles', duration: 4 }),
    title('timejump', 'Time jump', '“Three years later”', [{ id: 'big', label: 'Words', value: 'Three years later' }], [
      T({ field: 'big', role: 'serif', size: 0.072, caps: true, tracking: 0.16, align: 'centre', x: 0.5, y: 0.5, anim: 'fade', maxWidth: 0.86 })
    ], { group: 'titles', duration: 3.5, inSec: 0.8, outSec: 0.8 }),
    title('quote', 'Quote', 'a pull quote with who said it', [{ id: 'quote', label: 'Quote', value: 'We rebuilt the bridge before the road, because people needed to cross.' }, { id: 'who', label: 'Who said it', value: 'Ruth Adler' }], [
      T({ field: 'mark', role: 'serif', size: 0.18, colour: 'accent', align: 'centre', x: 0.5, y: 0.3, anim: 'fade', fixed: '“' }),
      T({ field: 'quote', role: 'serif', size: 0.052, align: 'centre', x: 0.5, y: 0.5, anim: 'rise', maxWidth: 0.7, lines: 3 }),
      T({ field: 'who', size: 0.026, caps: true, tracking: 0.2, colour: 'muted', align: 'centre', x: 0.5, y: 0.7, anim: 'fade' })
    ], { group: 'titles', duration: 6, inSec: 0.9, outSec: 0.7 }),
    title('credits', 'Credits', 'roles on the left, names on the right', [{ id: 'list', label: 'Lines (role: name, one per line)', value: 'Director: Jacob Gersch\nCamera: Amal Said\nEditor: Noa Levin\nSound: Tom Rees', multiline: true }], [
      T({ field: 'list', part: 'left', size: 0.024, caps: true, tracking: 0.14, colour: 'muted', align: 'right', x: 0.46, y: 0.5, anim: 'fade', lines: 8, lineHeight: 1.9 }),
      T({ field: 'list', part: 'right', role: 'serif', size: 0.036, align: 'left', x: 0.52, y: 0.5, anim: 'fade', lines: 8, lineHeight: 1.27 })
    ], { group: 'titles', duration: 7, inSec: 1, outSec: 0.8 }),
    title('threenames', 'Three names', 'three people side by side', [{ id: 'a', label: 'First', value: 'Ruth Adler' }, { id: 'b', label: 'Second', value: 'Daniel Okafor' }, { id: 'c', label: 'Third', value: 'Mira Haddad' }], [
      T({ field: 'a', role: 'serif', size: 0.05, align: 'centre', x: 0.25, y: 0.5, anim: 'rise' }),
      T({ field: 'b', role: 'serif', size: 0.05, align: 'centre', x: 0.5, y: 0.5, anim: 'rise' }),
      T({ field: 'c', role: 'serif', size: 0.05, align: 'centre', x: 0.75, y: 0.5, anim: 'rise' }),
      R({ x: 0.2, y: 0.56, w: 0.6, h: 0.003, colour: 'muted', anim: 'grow' })
    ], { group: 'titles', duration: 5 }),
    title('endcard', 'End card', 'a closing line and a smaller one', [{ id: 'big', label: 'Line', value: 'In memory of those who stayed' }, { id: 'small', label: 'Under it', value: 'riversidetrust.org' }], [
      T({ field: 'big', role: 'serif', size: 0.062, align: 'centre', x: 0.5, y: 0.47, anim: 'fade', maxWidth: 0.8, lines: 2 }),
      T({ field: 'small', role: 'mono', size: 0.026, colour: 'muted', align: 'centre', x: 0.5, y: 0.6, anim: 'fade' })
    ], { group: 'titles', duration: 8, inSec: 1.5, outSec: 1.5 }),
    title('caption', 'Caption', 'a subtitle-style line at the bottom', [{ id: 'line', label: 'Words', value: 'Archive footage, 1987' }], [
      R({ x: 0.3, y: 0.86, w: 0.4, h: 0.07, colour: 'ink', alpha: 0.6, anim: 'fade', fit: 'line' }),
      T({ field: 'line', size: 0.034, align: 'centre', x: 0.5, y: 0.895, anim: 'fade', maxWidth: 0.8 })
    ], { group: 'titles', duration: 4, inSec: 0.3, outSec: 0.3 }),

    // ----- timelines and dates -----
    title('dateruler', 'Date ruler', 'a year on a ticked line', [{ id: 'date', label: 'Date', value: 'October 1991' }], [
      T({ field: 'date', role: 'serif', size: 0.062, caps: true, tracking: 0.12, align: 'centre', x: 0.5, y: 0.46, anim: 'fade' }),
      R({ x: 0.2, y: 0.57, w: 0.6, h: 0.003, colour: 'muted', anim: 'grow' }),
      R({ x: 0.499, y: 0.53, w: 0.002, h: 0.04, anim: 'growY' }),
      ...[0.25, 0.3, 0.35, 0.4, 0.45, 0.55, 0.6, 0.65, 0.7, 0.75].map(x => R({ x: x - 0.001, y: 0.56, w: 0.002, h: 0.02, colour: 'muted', anim: 'fade' }))
    ], { group: 'dates', duration: 4, inSec: 0.8, outSec: 0.6 }),
    title('erabar', 'Era bar', 'from one year to another', [{ id: 'from', label: 'From', value: '1987' }, { id: 'to', label: 'To', value: '1994' }, { id: 'what', label: 'What', value: 'The drought years' }], [
      T({ field: 'from', role: 'mono', size: 0.04, colour: 'muted', align: 'right', x: 0.24, y: 0.5, anim: 'fade' }),
      R({ x: 0.27, y: 0.497, w: 0.46, h: 0.006, anim: 'grow' }),
      T({ field: 'to', role: 'mono', size: 0.04, colour: 'muted', align: 'left', x: 0.76, y: 0.5, anim: 'fade' }),
      T({ field: 'what', role: 'serif', size: 0.05, align: 'centre', x: 0.5, y: 0.58, anim: 'rise' })
    ], { group: 'dates', duration: 4 }),
    title('stamp', 'Typewriter stamp', 'file no. and a date, top right', [{ id: 'a', label: 'Line 1', value: 'FILE 24 / RA' }, { id: 'b', label: 'Line 2', value: '14 MARCH 2024' }], [
      T({ field: 'a', role: 'mono', size: 0.03, caps: true, tracking: 0.1, align: 'right', x: 0.93, y: 0.11, anim: 'wipe' }),
      T({ field: 'b', role: 'mono', size: 0.03, caps: true, tracking: 0.1, colour: 'muted', align: 'right', x: 0.93, y: 0.155, anim: 'wipe' })
    ], { group: 'dates', duration: 4, inSec: 0.7, outSec: 0.3 }),
    title('daycount', 'Day counter', '“Day 12”, big and plain', [{ id: 'big', label: 'Words', value: 'Day 12' }, { id: 'small', label: 'Under it', value: 'Nairobi' }], [
      T({ field: 'big', size: 0.11, bold: true, x: 0.08, y: 0.18, anim: 'slide' }),
      T({ field: 'small', size: 0.03, caps: true, tracking: 0.2, colour: 'muted', x: 0.085, y: 0.27, anim: 'slide' })
    ], { group: 'dates', duration: 4 }),

    // ----- overlays: drawn by the painter (procedural), no text -----
    { id: 'grain', group: 'overlays', kind: 'overlay', label: 'Film grain', sub: 'fine moving grain', paint: 'grain', duration: 5, blend: 'overlay', alpha: 0.35 },
    { id: 'dust', group: 'overlays', kind: 'overlay', label: 'Dust & scratches', sub: 'specks and hairs', paint: 'dust', duration: 5, blend: 'screen', alpha: 0.7 },
    { id: 'vignette', group: 'overlays', kind: 'overlay', label: 'Vignette', sub: 'darker edges', paint: 'vignette', duration: 5, blend: 'normal', alpha: 0.8 },
    { id: 'leakwarm', group: 'overlays', kind: 'overlay', label: 'Warm light leak', sub: 'an orange wash from the side', paint: 'leak', warm: true, duration: 3, blend: 'screen', alpha: 0.8, anim: 'drift' },
    { id: 'leakcool', group: 'overlays', kind: 'overlay', label: 'Cool light leak', sub: 'a blue wash from the top', paint: 'leak', warm: false, duration: 3, blend: 'screen', alpha: 0.7, anim: 'drift' },
    { id: 'letterbox', group: 'overlays', kind: 'overlay', label: 'Letterbox 2.39', sub: 'cinema bars', paint: 'letterbox', duration: 10, blend: 'normal', alpha: 1 },
    { id: 'gate', group: 'overlays', kind: 'overlay', label: 'Film gate', sub: 'rounded old-film edges', paint: 'gate', duration: 10, blend: 'normal', alpha: 1 },
    { id: 'paper', group: 'overlays', kind: 'overlay', label: 'Paper wash', sub: 'a faint paper texture', paint: 'paper', duration: 5, blend: 'multiply', alpha: 0.5 },
    { id: 'scanlines', group: 'overlays', kind: 'overlay', label: 'Scan lines', sub: 'thin video lines', paint: 'scanlines', duration: 5, blend: 'multiply', alpha: 0.5 },
    { id: 'flicker', group: 'overlays', kind: 'overlay', label: 'Flicker', sub: 'projector flicker', paint: 'flicker', duration: 3, blend: 'screen', alpha: 0.3, anim: 'flicker' },

    // ----- backgrounds: full plates to put titles on -----
    { id: 'bgdust', group: 'backgrounds', kind: 'background', label: 'Dusty dark', sub: 'near black with dust', paint: 'bgdust', duration: 8 },
    { id: 'bgpaper', group: 'backgrounds', kind: 'background', label: 'Paper', sub: 'warm old paper', paint: 'bgpaper', duration: 8 },
    { id: 'bgslate', group: 'backgrounds', kind: 'background', label: 'Slate', sub: 'a cool grey gradient', paint: 'bgslate', duration: 8 },
    { id: 'bgink', group: 'backgrounds', kind: 'background', label: 'Ink', sub: 'black with an ink bloom', paint: 'bgink', duration: 8 },
    { id: 'bglinen', group: 'backgrounds', kind: 'background', label: 'Linen', sub: 'a woven dark cloth', paint: 'bglinen', duration: 8 },
    { id: 'bgspot', group: 'backgrounds', kind: 'background', label: 'Spotlight', sub: 'a soft light on black', paint: 'bgspot', duration: 8 },

    // ----- freeze frames: the frame at the playhead, held, with a look on top -----
    { id: 'frzspot', group: 'freeze', kind: 'freeze', label: 'Freeze · spotlight', sub: 'the frame held, edges darkened', paint: 'spot', duration: 3, fields: [{ id: 'name', label: 'Name (optional)', value: '' }] },
    { id: 'frzbw', group: 'freeze', kind: 'freeze', label: 'Freeze · black & white', sub: 'held and drained of colour', look: 'bw', duration: 3, fields: [] },
    { id: 'frzname', group: 'freeze', kind: 'freeze', label: 'Freeze · name tag', sub: 'held, with a name beside', paint: 'spot', duration: 3, fields: [NAME], layers: [
      R({ x: 0.6, y: 0.5, w: 0.004, h: 0.08, anim: 'growY' }),
      T({ field: 'name', size: 0.044, bold: true, x: 0.62, y: 0.54, anim: 'slide' })
    ] },
    { id: 'frzbox', group: 'freeze', kind: 'freeze', label: 'Freeze · outline box', sub: 'held, a box round the subject', paint: 'box', duration: 3, fields: [] },

    // ----- movements: keyframed camera moves on the clip -----
    { id: 'pushin', group: 'moves', kind: 'move', label: 'Push in', sub: '100 → 112% across the clip', move: { scale: [100, 112] } },
    { id: 'pullout', group: 'moves', kind: 'move', label: 'Pull out', sub: '112 → 100%', move: { scale: [112, 100] } },
    { id: 'panleft', group: 'moves', kind: 'move', label: 'Pan left', sub: 'drifts left at 110%', move: { scale: [110, 110], x: [0.03, -0.03] } },
    { id: 'panright', group: 'moves', kind: 'move', label: 'Pan right', sub: 'drifts right at 110%', move: { scale: [110, 110], x: [-0.03, 0.03] } },
    { id: 'tiltup', group: 'moves', kind: 'move', label: 'Tilt up', sub: 'rises at 110%', move: { scale: [110, 110], y: [0.03, -0.03] } },
    { id: 'tiltdown', group: 'moves', kind: 'move', label: 'Tilt down', sub: 'sinks at 110%', move: { scale: [110, 110], y: [-0.03, 0.03] } },
    { id: 'drift', group: 'moves', kind: 'move', label: 'Handheld drift', sub: 'a slow wander at 108%', move: { scale: [108, 108], drift: 0.012 } },
    { id: 'punch', group: 'moves', kind: 'move', label: 'Punch', sub: 'a quick jump to 120%', move: { scale: [100, 120], seconds: 0.25 } },

    // ----- transitions: a wash over the cut (+ the dissolve in Premiere) -----
    { id: 'trleak', group: 'transitions', kind: 'transition', label: 'Light leak', sub: 'a warm wash over the cut', overlay: 'leakwarm', seconds: 1, transition: 'Cross Dissolve' },
    { id: 'trflash', group: 'transitions', kind: 'transition', label: 'Flash', sub: 'a white flash on the cut', overlay: 'flash', seconds: 0.4, transition: 'Dip to White' },
    { id: 'trburn', group: 'transitions', kind: 'transition', label: 'Film burn', sub: 'the frame burns through', overlay: 'burn', seconds: 1, transition: 'Cross Dissolve' },
    { id: 'trgrain', group: 'transitions', kind: 'transition', label: 'Grain dip', sub: 'grain swells over the cut', overlay: 'grain', seconds: 1, transition: 'Cross Dissolve' },
    { id: 'trdissolve', group: 'transitions', kind: 'transition', label: 'Cross dissolve', sub: 'the classic mix', seconds: 1, transition: 'Cross Dissolve' },
    { id: 'trblack', group: 'transitions', kind: 'transition', label: 'Dip to black', sub: 'out and back in', seconds: 1, transition: 'Dip to Black' },

    // ----- looks: five colour grades (39-mvfx-looks.js has the maths) -----
    { id: 'lkfaded', group: 'looks', kind: 'look', label: 'Faded memory', sub: 'lifted blacks, soft colour', look: 'faded' },
    { id: 'lkwarm', group: 'looks', kind: 'look', label: 'Warm archive', sub: 'amber, like old print', look: 'warm' },
    { id: 'lkcold', group: 'looks', kind: 'look', label: 'Cold night', sub: 'blue shadows, clean whites', look: 'cold' },
    { id: 'lkbleach', group: 'looks', kind: 'look', label: 'Bleach', sub: 'high contrast, drained', look: 'bleach' },
    { id: 'lksepia', group: 'looks', kind: 'look', label: 'Sepia', sub: 'brown-toned, old photograph', look: 'sepia' }
  ];
  const GROUPS = [
    { id: 'lower', name: 'Lower thirds', hint: 'name and role' }, { id: 'titles', name: 'Titles & cards', hint: 'chapters, quotes, credits' },
    { id: 'dates', name: 'Timelines & dates', hint: 'years and stamps' }, { id: 'overlays', name: 'Overlays', hint: 'grain, leaks, bars' },
    { id: 'backgrounds', name: 'Backgrounds', hint: 'plates for titles' }, { id: 'freeze', name: 'Freeze frames', hint: 'hold the frame' },
    { id: 'moves', name: 'Movements', hint: 'camera moves' }, { id: 'transitions', name: 'Transitions', hint: 'over the cut' }, { id: 'looks', name: 'Looks', hint: 'five colour grades' }
  ];
  const byId = id => PRESETS.find(p => p.id === id) || null;

  /* ---------- values: what the user typed, the colours and fonts ---------- */
  /** Default values for a preset: its fields' sample text, the colours, fonts by role, size 1, position offset 0. */
  function defaults(preset, fonts) {
    const v = { text: {}, colours: Object.assign({}, DOC), fonts: Object.assign({ serif: 'Georgia', sans: 'Arial', mono: 'Courier New' }, fonts || {}), scale: 1, dx: 0, dy: 0, duration: preset.duration || 5, alpha: preset.alpha != null ? preset.alpha : 1 };
    for (const f of preset.fields || []) v.text[f.id] = f.value;
    return v;
  }
  /** The words a text layer shows (a fixed mark, a field, or one side of "role: name" lines). */
  function wordsOf(layer, values) {
    if (layer.fixed) return layer.fixed;
    let s = String((values.text || {})[layer.field] != null ? values.text[layer.field] : '');
    if (layer.part) s = s.split(/\r?\n/).map(l => { const i = l.indexOf(':'); return layer.part === 'left' ? (i >= 0 ? l.slice(0, i) : '') : (i >= 0 ? l.slice(i + 1) : l); }).map(x => x.trim()).join('\n');
    if (layer.caps) s = s.toUpperCase();
    return s;
  }
  const hexToRgb = hex => { const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(String(hex || '').trim()); return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : [255, 255, 255]; };
  const rgba = (hex, a) => { const [r, g, b] = hexToRgb(hex); return `rgba(${r},${g},${b},${a == null ? 1 : a})`; };

  /* ---------- the painter ---------- */
  /** A small seeded random, so the same preset always paints the same grain. */
  function rng(seed) { let s = (seed >>> 0) || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
  // in-animation progress for a layer at time t (0..1 of the in), eased
  const ease = t => (t <= 0 ? 0 : t >= 1 ? 1 : t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
  const fontFor = (layer, values) => (values.fonts || {})[layer.role] || { serif: 'Georgia', sans: 'Arial', mono: 'Courier New' }[layer.role];
  function cssFont(layer, values, px) { return `${layer.bold ? 'bold ' : ''}${px}px "${fontFor(layer, values)}", ${layer.role === 'serif' ? 'serif' : layer.role === 'mono' ? 'monospace' : 'sans-serif'}`; }
  /** Wrap words to a width (ctx has the font set). lines: the most to show. */
  function wrap(ctx, text, maxW, lines) {
    const out = [];
    for (const para of String(text).split('\n')) {
      let line = '';
      for (const w of para.split(/\s+/)) { const t = line ? line + ' ' + w : w; if (maxW && line && ctx.measureText(t).width > maxW) { out.push(line); line = w; } else line = t; }
      out.push(line);
    }
    return lines ? out.slice(0, lines) : out;
  }
  /**
   * Draw a preset at W×H. opts: {t: 0..1 of the in-animation (1 = settled), text: true, art: true, frame: a seed for the
   * grain, under: null | a CanvasImageSource (the footage behind, for previews)}. Text and art can be drawn apart,
   * so Premiere gets the art as a PNG and the words as its own text layers.
   */
  function paint(ctx, W, H, preset, values, opts = {}) {
    const t = opts.t == null ? 1 : opts.t, drawText = opts.text !== false, drawArt = opts.art !== false, v = values || defaults(preset);
    const col = role => (v.colours || DOC)[role] || DOC[role] || '#ffffff';
    const S = (v.scale || 1), ox = (v.dx || 0) * W, oy = (v.dy || 0) * H;
    ctx.save();
    if (preset.paint && drawArt) paintArt(ctx, W, H, preset, v, opts);
    const layers = preset.layers || [];
    layers.forEach((L, i) => {
      // layers come in one after another: each starts a little later
      const k = ease((t - i * 0.08) / Math.max(0.3, 1 - layers.length * 0.08 + 0.08));
      if (k <= 0) return;
      ctx.save();
      ctx.globalAlpha = L.anim === 'none' ? 1 : (L.anim === 'grow' || L.anim === 'growY' || L.anim === 'wipe') ? Math.min(1, k * 2) : k;
      if (L.type === 'rect') {
        if (!drawArt) { ctx.restore(); return; }
        let x = L.x * W + ox, y = L.y * H + oy, w = L.w * W * (L.type === 'rect' && L.fit ? 1 : S), hh = L.h * H * (L.h < 0.01 ? 1 : S);
        if (L.anim === 'grow') w *= k; if (L.anim === 'growY') hh *= k;
        ctx.fillStyle = rgba(col(L.colour), L.alpha != null ? L.alpha : 1);
        ctx.fillRect(x, y, w, hh);
      } else {
        if (!drawText) { ctx.restore(); return; }
        const px = Math.round(L.size * H * S), words = wordsOf(L, v);
        ctx.font = cssFont(L, v, px); ctx.fillStyle = col(L.colour); ctx.textBaseline = 'middle';
        ctx.textAlign = L.align === 'centre' ? 'center' : L.align || 'left';
        if (L.tracking) { try { ctx.letterSpacing = (L.tracking * px) + 'px'; } catch (e) { /* older Chromium */ } }
        const lines = wrap(ctx, words, L.maxWidth ? L.maxWidth * W : 0, L.lines || 1), lh = px * (L.lineHeight || 1.25);
        let x = L.x * W + ox, y = L.y * H + oy - (lines.length - 1) * lh / 2;
        if (L.anim === 'rise') y += (1 - k) * H * 0.035; if (L.anim === 'slide') x -= (1 - k) * W * 0.04;
        if (L.anim === 'wipe') { const tw = Math.max(...lines.map(l => ctx.measureText(l).width)); const left = L.align === 'centre' ? x - tw / 2 : L.align === 'right' ? x - tw : x; ctx.beginPath(); ctx.rect(left - px, y - lh * lines.length, (tw + 2 * px) * k, lh * (lines.length + 1)); ctx.clip(); }
        lines.forEach((l, j) => ctx.fillText(l, x, y + j * lh));
      }
      ctx.restore();
    });
    ctx.restore();
  }
  /** The procedural pictures: grain, dust, vignette, leaks, bars, gate, paper, scan lines, backgrounds, freeze looks. */
  function paintArt(ctx, W, H, preset, v, opts) {
    const kind = preset.paint, rand = rng((opts.frame || 0) * 7919 + 17), a = v.alpha != null ? v.alpha : (preset.alpha != null ? preset.alpha : 1);
    const accent = (v.colours || DOC).accent || DOC.accent;
    ctx.save();
    if (kind === 'grain') {
      const cell = Math.max(1, Math.round(W / 480)), id = ctx.createImageData(Math.ceil(W / cell), Math.ceil(H / cell)), d = id.data;
      for (let i = 0; i < d.length; i += 4) { const g = 128 + (rand() - 0.5) * 140; d[i] = d[i + 1] = d[i + 2] = g; d[i + 3] = Math.round(255 * a); }
      const c = document.createElement('canvas'); c.width = id.width; c.height = id.height; c.getContext('2d').putImageData(id, 0, 0);
      ctx.imageSmoothingEnabled = false; ctx.drawImage(c, 0, 0, W, H);
    } else if (kind === 'dust') {
      ctx.globalAlpha = a;
      for (let i = 0; i < 90; i++) { ctx.fillStyle = `rgba(255,250,240,${0.3 + rand() * 0.7})`; ctx.beginPath(); ctx.arc(rand() * W, rand() * H, rand() * rand() * W * 0.0025 + 0.6, 0, 7); ctx.fill(); }
      for (let i = 0; i < 5; i++) { ctx.strokeStyle = `rgba(255,255,255,${0.25 + rand() * 0.5})`; ctx.lineWidth = 1 + rand() * 1.5; const x = rand() * W, y = rand() * H, len = (0.1 + rand() * 0.5) * H; ctx.beginPath(); ctx.moveTo(x, y); ctx.bezierCurveTo(x + (rand() - 0.5) * 60, y + len / 3, x + (rand() - 0.5) * 60, y + 2 * len / 3, x + (rand() - 0.5) * 30, y + len); ctx.stroke(); }
      for (let i = 0; i < 2; i++) { ctx.strokeStyle = `rgba(255,255,255,${0.2 + rand() * 0.3})`; ctx.lineWidth = 1; const x = rand() * W; ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + (rand() - 0.5) * 8, H); ctx.stroke(); }
    } else if (kind === 'vignette' || kind === 'spot' || kind === 'bgspot') {
      const cx = W * (v.cx != null ? v.cx : 0.5), cy = H * (v.cy != null ? v.cy : 0.5), r = Math.max(W, H) * (kind === 'spot' ? 0.75 : 0.85), inner = kind === 'spot' ? 0.18 : kind === 'bgspot' ? 0 : 0.35;
      if (kind === 'bgspot') { ctx.fillStyle = '#050505'; ctx.fillRect(0, 0, W, H); }
      const g = ctx.createRadialGradient(cx, cy, r * inner, cx, cy, r);
      if (kind === 'bgspot') { g.addColorStop(0, 'rgba(70,62,50,1)'); g.addColorStop(0.5, 'rgba(22,20,17,1)'); g.addColorStop(1, 'rgba(4,4,4,1)'); }
      else { g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, `rgba(0,0,0,${kind === 'spot' ? 0.85 : a})`); }
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    } else if (kind === 'leak' || kind === 'burn') {
      const warm = preset.warm !== false, k = opts.t == null ? 1 : opts.t, drift = (kind === 'burn' ? 0.5 : 0.15) * (1 - Math.abs(k * 2 - 1));
      const cx = warm ? W * (1.05 - drift * 0.5) : W * 0.5, cy = warm ? H * 0.5 : H * (-0.1 + drift * 0.3), r = Math.max(W, H) * (kind === 'burn' ? 0.5 + drift : 0.8);
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      const c1 = warm ? '255,140,40' : '70,140,255', c2 = warm ? '255,60,20' : '120,90,255';
      g.addColorStop(0, `rgba(${c1},${a})`); g.addColorStop(0.45, `rgba(${c2},${a * 0.45})`); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      if (kind === 'burn') { ctx.globalAlpha = drift * 1.5; ctx.fillStyle = '#fff2d0'; ctx.fillRect(0, 0, W, H); }
    } else if (kind === 'flash') {
      const k = opts.t == null ? 1 : opts.t; ctx.globalAlpha = 1 - Math.abs(k * 2 - 1); ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H);
    } else if (kind === 'letterbox') {
      const ratio = v.ratio || 2.39, bar = Math.max(0, (H - W / ratio) / 2); ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, bar); ctx.fillRect(0, H - bar, W, bar);
    } else if (kind === 'gate') {
      const m = W * 0.02, r = W * 0.03; ctx.fillStyle = '#000'; ctx.beginPath(); ctx.rect(0, 0, W, H);
      const x = m, y = m, w = W - 2 * m, hh = H - 2 * m; ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + hh, r); ctx.arcTo(x + w, y + hh, x, y + hh, r); ctx.arcTo(x, y + hh, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); ctx.fill('evenodd');
      const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.4, W / 2, H / 2, Math.max(W, H) * 0.7); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.55)'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    } else if (kind === 'paper' || kind === 'bgpaper') {
      if (kind === 'bgpaper') { ctx.fillStyle = '#d9cdb4'; ctx.fillRect(0, 0, W, H); }
      ctx.globalAlpha = kind === 'bgpaper' ? 0.5 : a;
      for (let i = 0; i < 2500; i++) { const s = rand(); ctx.fillStyle = s > 0.5 ? `rgba(120,95,60,${0.05 + rand() * 0.12})` : `rgba(255,250,235,${0.05 + rand() * 0.12})`; ctx.fillRect(rand() * W, rand() * H, 1 + rand() * W * 0.004, 1 + rand() * H * 0.004); }
      const g = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.max(W, H) * 0.8); g.addColorStop(0, 'rgba(255,240,210,0)'); g.addColorStop(1, 'rgba(110,80,40,0.45)'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    } else if (kind === 'scanlines') {
      ctx.globalAlpha = a; ctx.fillStyle = '#000'; const step = Math.max(2, Math.round(H / 270)); for (let y = 0; y < H; y += step) ctx.fillRect(0, y, W, Math.max(1, step / 2));
    } else if (kind === 'flicker') {
      const k = opts.t == null ? 1 : opts.t, f = 0.5 + 0.5 * Math.sin(k * 29) * Math.sin(k * 7.3); ctx.globalAlpha = a * f; ctx.fillStyle = '#fff3dc'; ctx.fillRect(0, 0, W, H);
    } else if (kind === 'bgdust') {
      const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#0b0b0d'); g.addColorStop(1, '#1c1a19'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      for (let i = 0; i < 400; i++) { ctx.fillStyle = `rgba(230,220,200,${rand() * 0.35})`; ctx.beginPath(); ctx.arc(rand() * W, H * (0.4 + rand() * 0.6), rand() * W * 0.0015 + 0.4, 0, 7); ctx.fill(); }
      const s = ctx.createRadialGradient(W * 0.5, H * 1.1, 0, W * 0.5, H * 1.1, H); s.addColorStop(0, 'rgba(120,100,80,0.35)'); s.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = s; ctx.fillRect(0, 0, W, H);
    } else if (kind === 'bgslate') {
      const g = ctx.createLinearGradient(0, 0, W, H); g.addColorStop(0, '#2c3038'); g.addColorStop(1, '#14161a'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    } else if (kind === 'bgink') {
      ctx.fillStyle = '#060607'; ctx.fillRect(0, 0, W, H);
      for (let i = 0; i < 6; i++) { const cx = W * (0.2 + rand() * 0.6), cy = H * (0.2 + rand() * 0.6), r = Math.min(W, H) * (0.15 + rand() * 0.35); const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r); g.addColorStop(0, `rgba(${30 + rand() * 20},${34 + rand() * 20},${50 + rand() * 30},0.9)`); g.addColorStop(1, 'rgba(6,6,7,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); }
    } else if (kind === 'bglinen') {
      ctx.fillStyle = '#17171a'; ctx.fillRect(0, 0, W, H);
      const step = Math.max(2, Math.round(W / 640)); ctx.globalAlpha = 0.5;
      for (let x = 0; x < W; x += step) { ctx.fillStyle = `rgba(255,255,255,${0.02 + rand() * 0.05})`; ctx.fillRect(x, 0, 1, H); }
      for (let y = 0; y < H; y += step) { ctx.fillStyle = `rgba(255,255,255,${0.02 + rand() * 0.05})`; ctx.fillRect(0, y, W, 1); }
    } else if (kind === 'box') {
      const x = W * (v.cx != null ? v.cx - 0.12 : 0.38), y = H * (v.cy != null ? v.cy - 0.22 : 0.28), w = W * 0.24, hh = H * 0.44, k = opts.t == null ? 1 : opts.t;
      ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.rect(x, y, w, hh); ctx.fill('evenodd');
      ctx.strokeStyle = accent; ctx.lineWidth = Math.max(2, W * 0.002); ctx.globalAlpha = Math.min(1, k * 1.5); ctx.strokeRect(x, y, w, hh);
      const c = W * 0.02; ctx.lineWidth *= 2; [[x, y, 1, 1], [x + w, y, -1, 1], [x, y + hh, 1, -1], [x + w, y + hh, -1, -1]].forEach(([px, py, sx, sy]) => { ctx.beginPath(); ctx.moveTo(px + sx * c, py); ctx.lineTo(px, py); ctx.lineTo(px, py + sy * c); ctx.stroke(); });
    }
    ctx.restore();
  }

  /* ---------- the plan: what each editor is asked to do ---------- */
  /** Where a text layer sits in pixels. measure(font css, text) -> width px (a canvas in the panel; a guess in tests). */
  function textPlacement(L, values, W, H, measure) {
    const S = values.scale || 1, px = Math.round(L.size * H * S), words = wordsOf(L, values);
    const lines = words.split('\n'), widest = Math.max(1, ...lines.map(l => (measure ? measure(cssFont(L, values, px), l) : l.length * px * 0.55) * (1 + (L.tracking || 0))));
    const x = L.x * W + (values.dx || 0) * W, y = L.y * H + (values.dy || 0) * H;
    const cx = L.align === 'centre' ? x : L.align === 'right' ? x - widest / 2 : x + widest / 2;
    return { px, words, cx: Math.round(cx), cy: Math.round(y), width: Math.round(widest) };
  }
  /**
   * The layers Premiere gets for a title: the art (rules, bars) as one PNG, each text layer as a native text layer, with
   * its own in/out animation. paths: {art} the PNG the panel painted (art layers only). -> [{kind, …}]
   */
  function premiereLayers(preset, values, seq, paths = {}, measure) {
    const W = seq.width || 1920, H = seq.height || 1080, out = [], inSec = preset.inSec || 0.6, outSec = preset.outSec || 0.5;
    const anim = (a, i) => ({ type: a || 'fade', inSec: inSec + i * 0.08, outSec, dx: a === 'slide' ? -W * 0.04 : 0, dy: a === 'rise' ? H * 0.035 : 0 });
    if ((preset.layers || []).some(l => l.type === 'rect') && paths.art) out.push({ kind: 'still', path: paths.art, anim: anim('fade', 0), name: preset.label + ' art' });
    (preset.layers || []).forEach((L, i) => {
      if (L.type !== 'text') return;
      const p = textPlacement(L, values, W, H, measure);
      if (!p.words.trim()) return;
      out.push({ kind: 'text', text: p.words, family: fontFor(L, values), font: psName(fontFor(L, values), !!L.bold), bold: !!L.bold, size: p.px, colour: (values.colours || DOC)[L.colour] || DOC[L.colour], x: p.cx, y: p.cy, width: p.width, align: L.align || 'left', tracking: L.tracking || 0, anim: anim(L.anim, i), name: p.words.split('\n')[0].slice(0, 40) });
    });
    return out;
  }
  /** Keyframes for a movement across a clip of `seconds` at `fps`: [{at (s), scale, x, y}] – x, y as fractions of the frame. */
  function moveKeys(preset, seconds, fps = 25) {
    const m = preset.move || {}, len = m.seconds && m.seconds < seconds ? m.seconds : seconds, keys = [];
    const at = (t) => ({ at: t, scale: m.scale ? m.scale[0] + (m.scale[1] - m.scale[0]) * (t / len) : 100, x: m.x ? m.x[0] + (m.x[1] - m.x[0]) * (t / len) : 0, y: m.y ? m.y[0] + (m.y[1] - m.y[0]) * (t / len) : 0 });
    if (m.drift) {
      const r = rng(31), n = Math.max(2, Math.round(len / 1.5));
      for (let i = 0; i <= n; i++) keys.push({ at: (len * i) / n, scale: m.scale ? m.scale[0] : 100, x: i === 0 ? 0 : (r() - 0.5) * 2 * m.drift, y: i === 0 ? 0 : (r() - 0.5) * 2 * m.drift });
      return keys;
    }
    const last = at(len); last.at = Math.max(1 / fps, len - 1 / fps);   // the last frame reaches the end value
    keys.push(at(0), last);
    return keys;
  }
  /** What a preset needs before it can be applied, and what the editor can do with it. */
  function readiness(preset, resolve) {
    if (preset.kind === 'move' && resolve) return { ok: preset.id === 'punch', why: 'Resolve doesn’t let add-ons keyframe moves – Punch is set as a still punch-in; do the others on the Edit page.' };
    if (preset.kind === 'transition' && resolve) return { ok: !!preset.overlay, why: preset.overlay ? 'Resolve doesn’t let add-ons add transitions: the wash is laid over the cut, add the dissolve on the Edit page.' : 'Resolve doesn’t let add-ons add transitions – do it on the Edit page.' };
    return { ok: true, why: '' };
  }
  /** A short file-safe tag of the values, so the same picture is painted once. */
  function hashOf(obj) { let h = 2166136261; for (const ch of JSON.stringify(obj)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; } return h.toString(36); }

  US.mvfxPack = { PRESETS, GROUPS, FAMILIES, ROLES, PREFER, DOC, byId, defaults, wordsOf, available, psName, paint, paintArt, premiereLayers, textPlacement, moveKeys, readiness, hashOf, rng, ease, wrap, cssFont, hexToRgb, fontFor };
})();
