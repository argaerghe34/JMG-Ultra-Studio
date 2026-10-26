// Selects scoring against measurements taken in real Premiere from dev/test-media/concert (fixture recorded by
// dev/probes/selects/dump.js). Ground truth: dev/test-media/README.md.
const assert = require('assert');
const { load, test } = require('./harness');
const US = load(['vision']);
const all = require('./fixtures/vision-clips.json');
const synth = all.find(b => b.bin === 'Test – Selects').clips;
const real = all.find(b => b.bin === 'Test – Selects / Real').clips;
const fresh = clips => JSON.parse(JSON.stringify(clips));
const byName = (r, prefix) => r.selects.filter(s => s.clipName.startsWith(prefix));
const rejOf = (r, prefix) => r.rejected.filter(x => x.clipName.startsWith(prefix));
const overlap = (a0, a1, b0, b1) => Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));

const R = US.vision.score(fresh(synth), US.vision.PRESETS.concert);

test('rejects blurry, dark, blown-out and shaky clips with the right reason', () => {
  for (const [c, why] of [['C002', /focus/i], ['C003', /dark/i], ['C004', /blown/i], ['C005', /shak/i]]) {
    assert.strictEqual(byName(R, c).length, 0, `${c} should have no selects, got ${JSON.stringify(byName(R, c))}`);
    assert.ok(rejOf(R, c).some(x => why.test(x.why)), `${c} reason should match ${why}: ${JSON.stringify(rejOf(R, c).map(x => x.why))}`);
  }
});

test('keeps the good clips (C001 or its duplicate, C009) and tiers them BEST', () => {
  const c1 = byName(R, 'C001').concat(byName(R, 'C008'));
  assert.ok(c1.length >= 1, 'C001/C008 kept');
  assert.ok(byName(R, 'C009').length >= 1, 'C009 kept');
  for (const s of c1.concat(byName(R, 'C009'))) assert.strictEqual(s.tier, 'BEST', `${s.clipName} ${s.score}`);
});

test('drops exactly one of C001/C008 as a duplicate', () => {
  const kept = ['C001', 'C008'].filter(c => byName(R, c).length);
  assert.strictEqual(kept.length, 1, `kept: ${kept}`);
  const other = kept[0] === 'C001' ? 'C008' : 'C001';
  assert.ok(rejOf(R, other).some(x => /Duplicate of/.test(x.why)));
  assert.ok(R.stats.dupes >= 1);
});

test('cuts the whip pan out of C006 and keeps both sides', () => {
  const s = byName(R, 'C006');
  for (const x of s) assert.ok(overlap(x.start, x.end, 4.0, 4.6) === 0, `select ${x.start}-${x.end} overlaps the whip pan`);
  assert.ok(s.some(x => x.end <= 4.0), 'something before the whip');
  assert.ok(s.some(x => x.start >= 4.6), 'something after the whip');
});

test('flags C007 as a reveal (pull-back), and nothing else in the set', () => {
  const s = byName(R, 'C007');
  assert.ok(s.some(x => x.flags.reveal === 'Pull-back'), JSON.stringify(s));
  const others = R.selects.filter(x => x.flags.reveal && !x.clipName.startsWith('C007'));
  assert.strictEqual(others.length, 0, JSON.stringify(others.map(x => x.clipName + ' ' + x.flags.reveal)));
});

test('picks the 3–15 s window of C010', () => {
  const s = byName(R, 'C010');
  assert.ok(s.length >= 1);
  for (const x of s) assert.ok(x.start >= 2.6 && x.end <= 15.4, `select ${x.start}-${x.end} outside 3–15`);
  const covered = US.sum(s.map(x => overlap(x.start, x.end, 3, 15)));
  assert.ok(covered >= 12 * 0.7, `covers only ${covered.toFixed(1)} s of the good 12 s`);
});

test('stricter checks never keep more footage than looser ones', () => {
  const base = Object.assign({}, US.vision.PRESETS.concert, { dupes: false });
  const kept = k => US.vision.score(fresh(synth.concat(real)), Object.assign({}, base, { focus: k, exposure: k, steady: k })).stats.keptDur;
  const vals = [20, 40, 60, 80].map(kept);
  // reveals ignore exposure on purpose, so allow a hair of slack
  for (let i = 1; i < vals.length; i++) assert.ok(vals[i] <= vals[i - 1] * 1.005 + 1e-6, vals.join(' '));
});

test('re-ranking is instant (slider moves never re-analyse)', () => {
  // ~7,500 short clips worth of samples: repeat the 27 clips 280 times
  const big = [];
  for (let k = 0; k < 280; k++) for (const c of synth.concat(real)) big.push({ item: Object.assign({}, c.item, { id: c.item.id + '-' + k }), data: c.data });
  const st = Object.assign({}, US.vision.PRESETS.concert, { dupes: false });
  US.vision.score(big, st); // warm (memoises per-clip extras)
  // best of three, so a busy machine (Premiere rendering next to the tests) doesn't fail it
  let ms = Infinity;
  for (let k = 0; k < 3; k++) { const t0 = Date.now(); US.vision.score(big, Object.assign({}, st, { focus: 70 - k })); ms = Math.min(ms, Date.now() - t0); }
  assert.ok(ms < 900, `re-rank of ${big.length} clips took ${ms} ms`);
  console.log(`      (re-ranked ${big.length} clips in ${ms} ms)`);
});

test('your force-in / force-out choices win', () => {
  const st = Object.assign({}, US.vision.PRESETS.concert);
  const base = US.vision.score(fresh(synth), st);
  const c9 = byName(base, 'C009')[0];
  const c2 = rejOf(base, 'C002')[0];
  st.forced = [{ clipId: c9.clipId, mode: 'out', t: (c9.start + c9.end) / 2 }, { clipId: c2.clipId, mode: 'in', start: 1, end: 5 }];
  const r = US.vision.score(fresh(synth), st);
  assert.ok(!byName(r, 'C009').some(x => x.start === c9.start), 'C009 removed');
  assert.ok(rejOf(r, 'C009').some(x => x.why === 'Removed by you'));
  assert.ok(byName(r, 'C002').some(x => x.flags.forced === 'in'), 'C002 forced in');
});

test('real phone footage: nothing crashes and a sensible share is kept', () => {
  const r = US.vision.score(fresh(real), US.vision.PRESETS.concert);
  assert.ok(r.stats.kept > 0);
  const share = r.stats.keptDur / r.stats.footage;
  assert.ok(share > 0.1 && share < 0.95, `kept ${(share * 100).toFixed(0)} % of footage`);
  for (const s of r.selects) { assert.ok(s.end > s.start); assert.ok(s.reasons.length); assert.ok(['BEST', 'GOOD', 'OK'].includes(s.tier)); }
});

test('ordering by score, time and shot type', () => {
  const byScore = US.vision.order(R.selects, 'score');
  for (let i = 1; i < byScore.length; i++) assert.ok(byScore[i - 1].score >= byScore[i].score);
  const byTime = US.vision.order(R.selects, 'time');
  assert.ok(byTime[0].clipName <= byTime[byTime.length - 1].clipName);
  assert.strictEqual(US.vision.order(R.selects, 'shot').length, R.selects.length);
});

test('C010: blurry and dark stretches are reported separately', () => {
  const r = rejOf(R, 'C010');
  assert.ok(r.some(x => /focus/i.test(x.why) && x.start >= 14 && x.end <= 17.6), JSON.stringify(r));
  assert.ok(r.some(x => /dark/i.test(x.why) && x.start >= 16.4), JSON.stringify(r));
});

/* ---------- footage types and the extra checks (clips from dev/make-selects-media.swift, measured in the panel) ---------- */
const checks = require('./fixtures/vision-checks.json').clips;
const typed = (type, extra) => US.vision.score(fresh(checks), Object.assign(US.vision.settingsFor(type), { dupes: false }, extra || {}));

test('footage types: interviews need a face; the talking head is a BEST close-up', () => {
  const r = typed('interview');
  const s6 = byName(r, 'S06');
  assert.ok(s6.length && s6.every(s => s.tier === 'BEST' && s.shot === 'close' && s.faces), JSON.stringify(s6));
  for (const c of ['S03', 'S05']) assert.ok(byName(r, c).length === 0 && rejOf(r, c).some(x => /face/i.test(x.why)), c);
});

test('someone walking through a talking head is cut out', () => {
  const r = typed('interview');
  const s7 = byName(r, 'S07');
  assert.ok(s7.length >= 1, 'rest of the interview kept');
  for (const s of s7) assert.ok(overlap(s.start, s.end, 5.9, 7.4) === 0, `${s.start}-${s.end} overlaps the walk-through`);
  assert.ok(rejOf(r, 'S07').some(x => /walks through/i.test(x.why) && x.start >= 4.5 && x.end <= 8.6), JSON.stringify(rejOf(r, 'S07')));
});

test('auto-exposure pumping: rejected for phone footage, flagged for concerts', () => {
  assert.ok(byName(typed('phone'), 'S02').length === 0 && rejOf(typed('phone'), 'S02').some(x => /pumping/i.test(x.why)));
  assert.ok(byName(typed('concert'), 'S02').some(s => s.issues.includes('Exposure pumping')));
});

test('strobes: part of the show for concerts, flagged as flicker for documentaries', () => {
  assert.ok(byName(typed('concert'), 'S01').some(s => s.tier !== 'OK'), 'concert keeps the strobe clip');
  const d = byName(typed('documentary'), 'S01');
  assert.ok(d.length && d.every(s => s.issues.includes('Flicker')) && d.every(s => s.score < byName(typed('concert'), 'S01')[0].score), JSON.stringify(d));
});

test('colour shift (white balance drifting) is caught around 4–6 s', () => {
  const r = typed('phone');
  assert.ok(rejOf(r, 'S03').some(x => /colour/i.test(x.why) && x.start < 6 && x.end > 4.5), JSON.stringify(rejOf(r, 'S03')));
  assert.ok(byName(r, 'S03').every(s => overlap(s.start, s.end, 4.8, 6) === 0));
});

test('“nothing happening”: dropped for travel and sports, fine for concerts', () => {
  assert.ok(byName(typed('travel'), 'S05').length === 0 && rejOf(typed('travel'), 'S05').some(x => /nothing happening/i.test(x.why)));
  assert.ok(byName(typed('sports'), 'S05').length === 0);
  assert.ok(byName(typed('concert'), 'S05').length > 0);
});

test('sports keeps the moment with action', () => {
  const s = byName(typed('sports'), 'S04');
  assert.ok(s.length >= 1 && s.every(x => x.start >= 3.5 && x.end <= 8.8), JSON.stringify(s));
});

test('camera moves are named: push-in, tilt, handheld, static', () => {
  const r = typed('concert');
  assert.strictEqual(byName(r, 'S09')[0].move, 'push-in');
  assert.strictEqual(byName(r, 'S10')[0].move, 'tilt');
  assert.strictEqual(byName(r, 'S04')[0].move, 'static');
  const wob = checks.find(c => c.item.name.startsWith('S08'));
  assert.strictEqual(US.median(US.vision._internal.prepare(JSON.parse(JSON.stringify(wob.data))).move.map(m => (m === 'handheld' ? 1 : 0))), 1);
});

test('categories for “sort into bins by type”', () => {
  const r = typed('concert');
  const cats = US.vision.categories(r.selects, ['grade', 'shot', 'move', 'special']);
  const get = n => cats.find(c => c.name === n);
  assert.ok(get('BEST') && get('Close-ups') && get('Push-ins') && get('Tilts') && get('Static') && get('Hero shots'), cats.map(c => c.name).join(', '));
  assert.ok(get('Close-ups').selects.some(s => s.clipName.startsWith('S06')));
  for (const c of cats) for (let i = 1; i < c.selects.length; i++) assert.ok(c.selects[i - 1].score >= c.selects[i].score, `${c.name} best first`);
  assert.strictEqual(new Set(cats.map(c => c.label)).size >= 8, true, 'categories use distinct label colours');
});

test('mark the best: heroes first, and the hero count is adjustable', () => {
  const r = US.vision.score(fresh(synth.concat(real)), Object.assign({}, US.vision.PRESETS.concert, { heroCount: 10 }));
  assert.strictEqual(r.stats.heroes, 10);
  const o = US.vision.order(r.selects, 'time', { heroFirst: true });
  assert.ok(o.slice(0, 10).every(s => s.flags.hero) && !o[10].flags.hero);
  const pct = US.vision.score(fresh(synth.concat(real)), Object.assign({}, US.vision.PRESETS.concert, { heroCount: 'pct' }));
  assert.strictEqual(pct.stats.heroes, Math.max(1, Math.round(pct.selects.length * 0.1)));
});

test('pickiness: strict is stricter than normal for every footage type', () => {
  for (const t of Object.keys(US.vision.FOOTAGE)) {
    const n = US.vision.settingsFor(t), s = US.vision.settingsFor(t, 'strict'), l = US.vision.settingsFor(t, 'loose');
    assert.ok(s.focus >= n.focus && n.focus >= l.focus && s.ok >= n.ok && n.ok >= l.ok, t);
  }
  assert.ok(US.vision.PRESETS.strict && US.vision.PRESETS.loose && US.vision.PRESETS.interview);
});

test('sequence uses: only the used stretch is graded, selects point at the source clip and know their place', () => {
  const c10 = synth.find(c => c.item.name.startsWith('C010'));
  const uses = [
    { item: Object.assign({}, c10.item, { id: c10.item.id + '#0', srcId: c10.item.id, range: [4, 12], seq: { start: 30, speed: 1 } }), data: c10.data },
    { item: Object.assign({}, c10.item, { id: c10.item.id + '#1', srcId: c10.item.id, range: [15, 19], seq: { start: 50, speed: 1 } }), data: c10.data }
  ];
  const r = US.vision.score(fresh(uses), US.vision.PRESETS.concert);
  assert.ok(r.selects.length >= 1 && r.selects.every(s => s.clipId === c10.item.id && s.start >= 4 - 1e-6 && s.end <= 12 + 1e-6), JSON.stringify(r.selects));
  assert.ok(r.selects.every(s => s.tl >= 30 && s.tl <= 38), 'timeline position');
  assert.ok(r.rejected.some(x => x.start >= 15 - 1e-6 && /focus|dark/i.test(x.why)), 'the blurry/dark use is rejected');
  assert.strictEqual(r.stats.clips, 1);
});

test('any footage (the default): only technical faults are rejected – no genre rules', () => {
  const st = US.vision.settingsFor('any');
  const R2 = US.vision.score(fresh(synth), st);
  // blurry, dark, blown-out and shaky clips are still left out, and the whip pan is cut
  for (const [c, why] of [['C002', /focus/i], ['C003', /dark/i], ['C004', /blown/i], ['C005', /shak/i]]) {
    assert.strictEqual(byName(R2, c).length, 0, c);
    assert.ok(rejOf(R2, c).some(x => why.test(x.why)), `${c}: ${JSON.stringify(rejOf(R2, c).map(x => x.why))}`);
  }
  assert.ok(byName(R2, 'C006').every(x => overlap(x.start, x.end, 4.0, 4.6) === 0), 'whip pan cut out');
  // usable shots of any kind stay: still shots, no faces, strobes; a duplicate take is usable footage too
  const r = typed('any');
  assert.ok(byName(r, 'S05').length > 0, 'a still shot with nothing happening is still usable B-roll');
  assert.ok(byName(r, 'S03').length > 0 && byName(r, 'S05').length > 0, 'no face needed');
  assert.ok(byName(r, 'S01').length > 0, 'strobes are not a fault');
  assert.ok(['C001', 'C008'].every(c => byName(R2, c).length), 'both takes kept');
  // nothing is rejected for a style reason
  const STYLE = /face|nothing happening|movement|walks through|colour shift/i;
  assert.ok(!R2.rejected.concat(r.rejected).some(x => STYLE.test(x.why)), JSON.stringify(R2.rejected.concat(r.rejected).filter(x => STYLE.test(x.why)).map(x => x.why)));
  // it keeps at least as much as the strictest genre on the same clips
  assert.ok(r.selects.length >= typed('interview').selects.length && r.selects.length >= typed('travel').selects.length);
});
