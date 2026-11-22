// Selects: making a selects sequence lays each select straight from its clip (no subclip per select – that made
// Premiere slow to respond); subclips only when asked for. And Selects › Check usability with a vision model on this
// computer: frames inside each select, asked only whether it's usable B-roll; the answer tidied; kept per media file by
// the stretch it looked at; “unusable” leaves a select out and “maybe” moves it down a grade (both switchable); never
// the cloud, nothing downloaded. Stand-in routes and host: no model, no Premiere.
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path');
const { load, test } = require('./harness');
const US = load(['time', 'vision', 'ai', 'understand-models', 'understand', 'js/tools/10-selects-look.js', 'js/tools/10-selects.js']);
const L = US.selectsLook, P = L._pure, SEL = US.selects;
const job = { set() { return job; }, progress() { return job; }, range() { return job; }, check() {}, log() {} };

const sel = (key, clipId, start, end, score, tier, extra = {}) => Object.assign({ key, clipId, clipName: clipId + '.mp4', start, end, dur: end - start, score, tier, reasons: ['sharp'], flags: {}, issues: [], shot: 'mid', move: 'static' }, extra);
function setup() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'us-look-'));
  const a = path.join(dir, 'A.mp4'), b = path.join(dir, 'B.mp4'); fs.writeFileSync(a, 'x'); fs.writeFileSync(b, 'x');
  SEL.state.clips = [{ item: { id: 'ia', path: a, name: 'A.mp4', duration: 60 }, data: { samples: [] } }, { item: { id: 'ib', path: b, name: 'B.mp4', duration: 60 }, data: { samples: [] } }];
  SEL.state.sourceLabel = 'Test bin'; SEL.state.seq = null; SEL.state.forced = [];
  SEL.state.result = { selects: [sel('a1', 'ia', 2, 8, 90, 'BEST'), sel('a2', 'ia', 20, 26, 75, 'GOOD'), sel('b1', 'ib', 5, 9, 60, 'OK'), sel('b2', 'ib', 30, 40, 82, 'BEST')], rejected: [], stats: { kept: 4, best: 2, good: 1, ok: 1, reveals: 0, keptDur: 26, footage: 120, clips: 2 } };
  return { dir, a, b };
}

test('making a selects sequence: each select laid straight from its clip in its grade’s colour – no subclips unless asked for', async () => {
  setup();
  const calls = [], H0 = US.host.call;
  US.host.call = async (fn, args) => {
    calls.push([fn, args]);
    if (fn === 'newSequence') return { id: 'seq1', name: args.name };
    if (fn === 'storyPlace') { let c = args.cursor; return { cursor: c + 100, placed: args.clips.map(x => { const p = { start: c, end: c + (x.out - x.in) }; c = p.end; return p; }), method: 'relabel' }; }
    if (fn === 'createSubclips') return args.items.map((x, i) => 'sub' + i);
    if (fn === 'selectsPlaceWhole') return { cursor: 0, placed: args.ids.map(() => ({ start: 0, end: 1 })) };
    return [];
  };
  try {
    await SEL.makeOutputs({ sequence: true, order: 'score', tiers: 'all', markBest: false }, job);
    const fns = calls.map(c => c[0]);
    assert.ok(!fns.includes('createSubclips') && !fns.includes('selectsPlaceWhole'), 'no subclips: ' + fns.join(', '));
    const place = calls.filter(c => c[0] === 'storyPlace');
    assert.strictEqual(place.length, 1, 'ten at a time');
    assert.deepStrictEqual(place[0][1].clips.map(c => [c.id, c.in, c.out, c.label]), [['ia', 2, 8, 5], ['ib', 30, 40, 5], ['ia', 20, 26, 15], ['ib', 5, 9, 9]], 'best first, each from its own clip, in its grade’s colour');
    assert.strictEqual(place[0][1].method, 'relabel', 'the source clip’s own label is put back');
    // a bin of subclips, when asked for: then the sequence uses them
    calls.length = 0;
    await SEL.makeOutputs({ sequence: true, subclips: true, order: 'score', tiers: 'all', markBest: false }, job);
    const f2 = calls.map(c => c[0]);
    assert.ok(f2.includes('createSubclips') && f2.includes('selectsPlaceWhole') && !f2.includes('storyPlace'), f2.join(', '));
  } finally { US.host.call = H0; }
});

test('what the vision model is asked: frames inside the select, away from its edges; only usability, never what is in the shot', () => {
  assert.deepStrictEqual(P.stillTimes({ start: 10, end: 20 }, 3), [11.5, 15, 18.5]);
  assert.deepStrictEqual(P.stillTimes({ start: 10, end: 12 }, 3), [10.3, 11.7], 'a short select: two');
  assert.deepStrictEqual(P.stillTimes({ start: 10, end: 20 }, 1), [15], 'a model that takes one frame: the middle');
  const req = P.request({ clipName: 'A.mp4', start: 10, end: 20 }, [{ t: 11.5, data: 'AAA', w: 384, h: 216 }, { t: 15, data: 'BBB', w: 384, h: 216 }]);
  assert.strictEqual(req.user.filter(x => x.image).length, 2);
  assert.ok(/USABLE as B-roll/.test(req.system) && /do not describe or label/.test(req.system));
  assert.deepStrictEqual(req.schema.properties.usable.enum, ['yes', 'maybe', 'no']);
});

test('the answer tidied: a known verdict and a score 1–5, only listed words; a verdict that disagrees with its score is pulled in line', () => {
  assert.deepStrictEqual(P.tidy({ usable: 'yes', score: 5, problems: ['too dark', 'made up'], good: ['sharp', 'sharp', 'steady'], note: 'Lovely.' }), { usable: 'yes', score: 5, problems: ['too dark'], good: ['sharp', 'steady'], note: 'Lovely.' });
  assert.strictEqual(P.tidy({ usable: 'yes', score: 1, problems: [], good: [], note: '' }).usable, 'maybe');
  assert.strictEqual(P.tidy({ usable: 'no', score: 5, problems: [], good: [], note: '' }).usable, 'maybe');
  assert.deepStrictEqual([P.tidy({ usable: 'odd', score: 2 }).usable, P.tidy({ score: 9, usable: 'no' }).score], ['no', 1]);
  assert.strictEqual(P.tidy({}), null, 'nothing usable in the answer: nothing kept');
});

test('how it counts: unusable leaves a select out (with why), maybe moves it down a grade, a good one says so – both switchable; a select you kept stays', () => {
  const r = { selects: [sel('1', 'c', 0, 5, 90, 'BEST'), sel('2', 'c', 10, 15, 80, 'BEST'), sel('3', 'c', 20, 25, 70, 'GOOD'), sel('4', 'c', 30, 35, 50, 'OK'), sel('5', 'c', 40, 45, 60, 'GOOD', { flags: { forced: true } })], rejected: [], stats: { kept: 5, best: 2, good: 2, ok: 1 } };
  const looks = [{ start: 0, end: 5, usable: 'no', score: 1, problems: ['blurry or out of focus'], good: [], note: '' }, { start: 10, end: 15, usable: 'maybe', score: 3, problems: ['too dark'], good: [], note: '' }, { start: 20.5, end: 25, usable: 'yes', score: 5, problems: [], good: ['sharp', 'nice light'], note: '' }, { start: 40, end: 45, usable: 'no', score: 1, problems: ['shaky'], good: [], note: '' }];
  const of = s => P.lookFor(s, looks);
  const a = P.adjust(r, of, { by: 'Gemma 4 E2B' });
  assert.deepStrictEqual(a.selects.map(s => [s.key, s.tier]), [['2', 'GOOD'], ['3', 'GOOD'], ['4', 'OK'], ['5', 'GOOD']]);
  assert.deepStrictEqual(a.rejected.map(s => [s.key, s.why]), [['1', 'Unusable to Gemma 4 E2B: blurry or out of focus']]);
  assert.ok(a.selects[0].reasons.includes('down a grade – Gemma 4 E2B: too dark') && a.selects[1].reasons.includes('Gemma 4 E2B: sharp, nice light'));
  assert.deepStrictEqual([a.stats.kept, a.stats.best, a.stats.good, a.stats.ok, a.stats.looked], [4, 0, 3, 1, 4]);
  assert.strictEqual(r.selects[1].tier, 'BEST', 'the grade it came from is left as it was');
  const b = P.adjust(r, of, { leaveOut: false, weigh: false });
  assert.deepStrictEqual([b.selects.length, b.selects.map(s => s.tier).join(), b.rejected.length], [5, 'BEST,BEST,GOOD,OK,GOOD', 0], 'both off: only what it said is shown');
  assert.strictEqual(P.lookFor({ start: 0, end: 10 }, [{ start: 8, end: 14 }]), null, 'an opinion about a different stretch doesn’t count');
});

test('checking: only on this computer, best first, what was said kept per media file and counted in the grade at once; nothing to look with is said plainly', async () => {
  const { a, b } = setup();
  US.settings.set('selects.look', {});
  const asked = [], grabbed = [], R0 = Object.assign({}, L.routes);
  L.routes.grab = async (item, times) => { grabbed.push([item.path, times]); return { stills: times.map(t => ({ t, data: 'IMG', w: 384, h: 216 })) }; };
  L.routes.ask = async (Pl, req) => { asked.push(req); const k = asked.length; return k === 1 ? { usable: 'yes', score: 5, problems: [], good: ['sharp'], note: '' } : k === 2 ? { usable: 'no', score: 1, problems: ['too dark'], good: [], note: '' } : { usable: 'maybe', score: 3, problems: ['shaky'], good: [], note: '' }; };
  const LOCAL = { kind: 'helper', id: 'tiny@1', label: 'Tiny Eye', model: { id: 'tiny' }, perAsk: 2 };
  try {
    await assert.rejects(L.check(job, { plan: { kind: 'none' } }), /no vision model on this computer/);
    assert.strictEqual(asked.length, 0);
    const r = await L.check(job, { how: 2, plan: LOCAL });
    assert.deepStrictEqual([r.looked, r.counts], [2, { yes: 1, maybe: 0, no: 1 }]);
    assert.ok(/nothing left this computer/.test(r.summary));
    assert.deepStrictEqual(grabbed.map(g => [path.basename(g[0]), g[1].length]), [['A.mp4', 2], ['B.mp4', 2]], 'the best two first, two frames each');
    assert.deepStrictEqual(L.looksOf(a).map(l => [l.start, l.end, l.usable, l.by]), [[2, 8, 'yes', 'tiny@1']]);
    assert.deepStrictEqual(L.looksOf(b).map(l => [l.start, l.usable]), [[30, 'no']]);
    // Selects re-grades with it (rescore runs the real scorer, so look at the adjusting directly on the kept result)
    const res = { selects: [sel('a1', 'ia', 2, 8, 90, 'BEST'), sel('b2', 'ib', 30, 40, 82, 'BEST'), sel('b1', 'ib', 5, 9, 60, 'OK')], rejected: [], stats: {} };
    const adj = L.adjustResult(res);
    assert.deepStrictEqual([adj.selects.map(s => s.key), adj.rejected.map(s => s.key)], [['a1', 'b1'], ['b2']]);
    // again: only what hasn't been looked at
    SEL.state.result = res;
    const again = await L.check(job, { how: 'all', plan: LOCAL });
    assert.deepStrictEqual([again.looked, asked.length], [1, 3]);
  } finally { Object.assign(L.routes, R0); L.forget([a, b]); }
});

test('the model it uses is the one on this computer chosen in Settings – never the cloud', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', '..', 'js', 'tools', '10-selects-look.js'), 'utf8');
  assert.ok(!/US\.ai\.media\(/.test(src), 'no cloud route');
  assert.ok(/US\.ai\.localAt\(/.test(src) && /provider: 'local'/.test(src));
  assert.ok(!/models\.download|\.download\(/.test(src), 'nothing is downloaded from here');
});
