// mVFX – the animated titles: every preset lays out and draws at any moment and frame size, letters arrive one by
// one and leave again, digits roll to the right number, strokes draw on, the calendar knows its weekdays, and the
// frame plan reuses one picture for the still stretch.
const assert = require('assert');
const { load, test } = require('./harness');
const US = load(['time', 'js/tools/39-mvfx-motion.js', 'js/tools/39-mvfx-pack.js']);
const M = US.mvfxMotion, P = US.mvfxPack;

/** A 2D context that measures by letter count and remembers what was drawn. */
function ctx() {
  const calls = [];
  const c = { calls, font: '10px x', fillStyle: '', strokeStyle: '', globalAlpha: 1, lineWidth: 1, filter: 'none',
    measureText(t) { return { width: Array.from(t).length * parseFloat(/(\d+)px/.exec(c.font)[1]) * 0.5 }; },
    fillText(t, x, y) { calls.push(['text', t, x, y, c.globalAlpha, c.fillStyle, c.font, c.filter]); }, fillRect(x, y, w, h) { calls.push(['rect', w, h, c.globalAlpha]); },
    lineTo(x, y) { calls.push(['to', x, y]); }, moveTo(x, y) { calls.push(['from', x, y]); }, stroke() { calls.push(['stroke', c.globalAlpha, c.lineWidth]); }, fill() { calls.push(['fill', c.globalAlpha]); } };
  for (const k of ['save', 'restore', 'beginPath', 'closePath', 'rect', 'clip', 'translate', 'rotate']) c[k] = () => {};
  return c;
}
const values = (p, text) => { const v = P.defaults(p, { serif: 'Baskerville', sans: 'Avenir Next', mono: 'Menlo', hand: 'Bradley Hand' }); Object.assign(v.text, text || {}); return v; };
const drawAt = (p, v, t, W = 1920, H = 1080) => { const c = ctx(), s = M.prepare(c, W, H, p, v, v.duration); c.calls.length = 0; M.draw(c, s, t); return { c, s, text: c.calls.filter(x => x[0] === 'text') }; };

test('every animated preset lays out and draws from start to end, at 16:9, 4K and upright, without throwing; nothing is left at the end', () => {
  for (const p of M.PRESETS) for (const [W, H] of [[1920, 1080], [3840, 2160], [1080, 1920]]) {
    const v = values(p), c = ctx(), s = M.prepare(c, W, H, p, v, v.duration);
    assert.ok(s.items.length, p.id + ' has something to draw');
    assert.ok(s.inEnd > 0 && s.inEnd <= s.outStart && s.outStart < s.total, `${p.id}: in ${s.inEnd} out ${s.outStart} of ${s.total}`);
    for (let t = 0; t <= s.total; t += 0.2) M.draw(c, s, t);
    c.calls.length = 0; M.draw(c, s, s.total);
    assert.ok(c.calls.filter(x => x[0] === 'text').every(x => x[4] < 0.01), p.id + ': letters gone at the end');
    assert.ok(P.GROUPS.some(g => g.id === p.group) && p.label && p.sub, p.id + ' listed');
  }
  assert.strictEqual(new Set(M.PRESETS.map(p => p.id)).size, 34);
});

test('letters arrive one by one in a mixed order, soft at first, all there for the hold, and leave again', () => {
  const p = P.byId('ti-chapter'), v = values(p, { big: 'The River' });
  const early = drawAt(p, v, 0.45), hold = drawAt(p, v, M.holdTime(early.s)), late = drawAt(p, v, early.s.outStart + early.s.outSec * 0.6);
  assert.strictEqual(hold.text.map(x => x[1]).join(''), 'THERIVER');   // small capitals: every letter drawn as a capital
  assert.ok(hold.text.every(x => x[4] === 1 && x[7] === 'none'), 'whole and sharp in the hold');
  assert.ok(early.text.length > 0 && early.text.length < 8, 'some letters, not all, early on: ' + early.text.length);
  assert.ok(early.text.some(x => /blur/.test(x[7])), 'arriving letters are soft');
  assert.ok(late.text.length < 8 || late.text.some(x => x[4] < 1), 'leaving');
  // small capitals: the letters typed in lower case are drawn smaller; wide spacing keeps them apart
  const px = x => parseFloat(/(\d+)px/.exec(x[6])[1]);
  assert.ok(px(hold.text[0]) > px(hold.text[1]), 'T larger than h');
  for (let i = 1; i < hold.text.length; i++) assert.ok(hold.text[i][2] > hold.text[i - 1][2], 'left to right');
  // the same title always animates the same way
  assert.deepStrictEqual(drawAt(p, v, 0.45).text, early.text);
});

test('position, size and the frame: centred text stays centred; size scales about the preset’s anchor; an upright frame keeps the type readable', () => {
  const p = P.byId('nm-stack'), v = values(p, { name: 'Mira Haddad', role: 'Nurse' });
  const a = drawAt(p, v, 2.5), left = a.text[0][2];
  assert.ok(Math.abs(left - 0.08 * 1920) < 2, 'the name starts at the left margin: ' + left);
  const b = drawAt(p, Object.assign({}, v, { scale: 1.5, dx: 0.1 }), 2.5);
  assert.ok(Math.abs(b.text[0][2] - (0.08 + 0.1) * 1920) < 2, 'larger, still from its anchor, moved across');
  assert.ok(parseFloat(/(\d+)px/.exec(b.text[0][6])[1]) > parseFloat(/(\d+)px/.exec(a.text[0][6])[1]) * 1.4);
  const up = drawAt(p, v, 2.5, 1080, 1920);
  assert.ok(parseFloat(/(\d+)px/.exec(up.text[0][6])[1]) < 30, 'type sized from the width when the frame is upright');
  const q = P.byId('wd-quote'), qv = values(q), d = drawAt(q, qv, 4);
  const ys = Array.from(new Set(d.text.filter(x => x[1] !== '“' && /\d\dpx "Baskerville"/.test(x[6]) && x[1] === x[1]).map(x => Math.round(x[3]))));
  assert.ok(ys.length >= 3, 'the quote wraps onto lines: ' + ys.length);
});

test('a year rolls: digits pass by early on and stop on the right ones', () => {
  const p = P.byId('dt-year'), v = values(p, { year: '2031' });
  const early = drawAt(p, v, 0.5), hold = drawAt(p, v, M.holdTime(early.s));
  assert.strictEqual(hold.text.map(x => x[1]).join(''), '2031');
  assert.ok(early.text.map(x => x[1]).join('') !== '2031' && early.text.length >= 4, 'still rolling: ' + early.text.map(x => x[1]).join(''));
});

test('the calendar: the month and year, a week centred on the day with the right weekdays, a ring drawn round it; other dates read too', () => {
  assert.deepStrictEqual(M.parseDate('23 March 1994'), { y: 1994, m: 2, d: 23 });
  assert.deepStrictEqual(M.parseDate('March 23, 1994'), { y: 1994, m: 2, d: 23 });
  assert.deepStrictEqual(M.parseDate('1994-03-23'), { y: 1994, m: 2, d: 23 });
  assert.deepStrictEqual(M.parseDate('23/03/1994'), { y: 1994, m: 2, d: 23 });
  assert.strictEqual(M.parseDate('some day'), null);
  assert.strictEqual(M.weekday(1994, 2, 23), 3);   // a Wednesday
  assert.strictEqual(M.weekday(2026, 10, 18), 3);
  const p = P.byId('dt-calendar'), d = drawAt(p, values(p, { date: '1 March 2024' }), 3);
  const words = d.text.map(x => x[1]).join('');
  assert.ok(/MARCH,2024/.test(words) && /272829123/.test(words.replace(/[A-Za-z,]/g, '').replace('2024', '')), 'the week runs over the leap day: ' + words);
  assert.ok(/Fri/.test(words) && d.c.calls.some(x => x[0] === 'stroke'), 'weekday names and the ring');
  const odd = drawAt(p, values(p, { date: 'Spring, long ago' }), 3);
  assert.ok(/SPRING/.test(odd.text.map(x => x[1]).join('')), 'a date it can’t read is shown as typed');
});

test('strokes draw on: an arrow is part-drawn early, whole later with its head; turning and width change where it goes', () => {
  const p = P.byId('mk-arrow'), v = values(p);
  const ends = t => { const d = drawAt(p, v, t); return d.c.calls.filter(x => x[0] === 'to'); };
  assert.ok(ends(0.3).length < ends(2).length, 'more of it later');
  const a = drawAt(p, v, 2).c.calls.filter(x => x[0] === 'to'), b = drawAt(p, Object.assign({}, v, { rot: 90 }), 2).c.calls.filter(x => x[0] === 'to');
  assert.ok(Math.abs(a[a.length - 1][2] - b[b.length - 1][2]) > 50, 'turned');
  const r = P.byId('mk-rule'), w1 = drawAt(r, values(r), 2).c.calls.filter(x => x[0] === 'to')[0][1], w2 = drawAt(r, Object.assign(values(r), { stretch: 2 }), 2).c.calls.filter(x => x[0] === 'to')[0][1];
  assert.ok(w2 - 960 > (w1 - 960) * 1.9, 'twice as wide: ' + w1 + ' → ' + w2);
});

test('credits and lists: one row per line, roles on the left of names; a time jump swaps one date for the other mid-clip', () => {
  const p = P.byId('wd-credits'), d = drawAt(p, values(p, { list: 'Director: Ada Low\nCamera: Ben Ray\n: Cy Dee' }), 4);
  const rows = Array.from(new Set(d.text.map(x => Math.round(x[3]))));
  assert.strictEqual(rows.length, 3);
  const dir = d.text.find(x => x[1] === 'D'), ada = d.text.find(x => x[1] === 'A');
  assert.ok(dir[2] < 960 && ada[2] > 960, 'role left of centre, name right');
  const j = P.byId('dt-jump'), jv = values(j, { from: 'May 1990', to: 'June 2020' });
  const first = drawAt(j, jv, 1.8).text.map(x => x[1]).join(''), last = drawAt(j, jv, 4.6).text.filter(x => x[4] > 0.5).map(x => x[1]).join('');
  assert.ok(/MAY1990/.test(first) && /JUNE2020/.test(last) && !/MAY/.test(last), first + ' → ' + last);
});

test('the frames of a clip: every frame of the entrance and exit drawn, the still stretch one picture reused; what a preset lets you change', () => {
  const p = P.byId('nm-rule'), v = values(p), s = M.prepare(ctx(), 1920, 1080, p, v, 5), fr = M.frames(s, 25);
  assert.strictEqual(fr.length, 125);
  const own = fr.filter(f => f.same == null), held = fr.filter(f => f.same != null);
  assert.ok(own.length < 90 && held.length > 35, `${own.length} drawn, ${held.length} reused`);
  assert.ok(held.every(f => f.same === held[0].same && f.same < f.i), 'all the same earlier frame');
  assert.ok(fr[0].same == null && fr[124].same == null && fr[held[0].same].t > s.inEnd, 'the held picture comes after the entrance');
  assert.strictEqual(M.frames(M.prepare(ctx(), 1920, 1080, p, v, 2), 23.976).length, 48);
  assert.deepStrictEqual(M.uses(p, v), { roles: ['serif'], colours: ['text', 'muted'] });
  assert.deepStrictEqual(M.uses(P.byId('nm-hand'), values(P.byId('nm-hand'))).roles, ['hand', 'serif']);
  assert.deepStrictEqual(M.uses(P.byId('mk-highlight'), values(P.byId('mk-highlight'))), { roles: [], colours: ['accent'] });
  const d = P.defaults(P.byId('mk-note'));
  assert.strictEqual(d.opt.side, 'right'); assert.strictEqual(d.shadow, 0.4); assert.strictEqual(d.fonts.hand, 'Comic Sans MS');
});
