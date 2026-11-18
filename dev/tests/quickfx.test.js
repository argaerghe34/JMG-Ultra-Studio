// Quick effects: which clips an edit goes on, where transitions go (at the cuts, or each clip's ends), the calls made,
// what Resolve can't do, and the report.
const assert = require('assert');
const { load, test } = require('./harness');
const US = load(['time', 'ui', 'app', 'js/tools/36-quickfx.js']);
const Q = US.quickfx;
const READ = { fps: 25, video: [{ index: 0, clips: [{ start: 0, end: 4 }, { start: 4, end: 9 }, { start: 10, end: 12 }] }, { index: 1, locked: true, clips: [{ start: 0, end: 3 }] }], audio: [{ index: 0, clips: [{ start: 0, end: 4 }] }] };

test('targets: the selected clips of the kind the edit needs, never on a locked track; every clip when nothing is picked', () => {
  const sel = [{ kind: 'video', track: 0, start: 4, end: 9 }, { kind: 'video', track: 1, start: 0, end: 3 }];
  assert.deepStrictEqual(Q.targetsFor(READ, sel, 'video'), [{ kind: 'video', track: 0, start: 4, end: 9 }]);
  assert.strictEqual(Q.targetsFor(READ, null, 'video').length, 3);
  assert.deepStrictEqual(Q.targetsFor(READ, null, 'audio'), [{ kind: 'audio', track: 0, start: 0, end: 4 }]);
  assert.deepStrictEqual(Q.targetsFor(READ, sel, 'audio'), []);
});

test('transitions at the cuts: only where one clip meets the next (not across a gap); the outer ends when asked', () => {
  const ts = Q.targetsFor(READ, null, 'video');
  assert.deepStrictEqual(Q.transitionPlaces(ts, 'cuts').map(p => [p.target.start, p.at]), [[4, 'start']]);
  assert.deepStrictEqual(Q.transitionPlaces(ts, 'cuts', { ends: true }).map(p => [p.target.start, p.at]), [[0, 'start'], [4, 'start'], [4, 'end'], [10, 'start'], [10, 'end']]);
  assert.deepStrictEqual(Q.transitionPlaces([ts[0]], 'cuts').map(p => p.at), ['start', 'end'], 'one clip: both ends');
  assert.deepStrictEqual(Q.transitionPlaces(ts, 'end').map(p => p.at), ['end', 'end', 'end']);
});

test('calls: a transition’s length in frames, grouped by where it goes; a fade keeps its own place; other edits in one call', () => {
  const P = id => Q.PRESETS.find(p => p.id === id), ts = Q.targetsFor(READ, null, 'video');
  const c = Q.calls(P('dissolve'), ts, { where: 'both', seconds: 1, fps: 25 });
  assert.deepStrictEqual(c.map(x => [x.params.at, x.params.frames, x.targets.length, x.params.name]), [['start', 25, 3, 'Cross Dissolve'], ['end', 25, 3, 'Cross Dissolve']]);
  assert.deepStrictEqual(Q.calls(P('fadeOut'), ts, { where: 'cuts', seconds: 0.5 }).map(x => [x.params.at, x.targets.length]), [['end', 3]]);
  assert.deepStrictEqual(Q.calls(P('punch110'), ts, {}).map(x => [x.op, x.params.scale, x.targets.length]), [['motion', 110, 3]]);
  assert.deepStrictEqual(Q.calls(P('dissolve'), [], {}), []);
});

test('punch in every other: the 2nd, 4th… clip of each track (counted per track, in time order), in one motion call', () => {
  const ts = [0, 4, 9, 12, 15].map(start => ({ kind: 'video', track: 0, start, end: start + 3 })).concat([{ kind: 'video', track: 1, start: 0, end: 5 }, { kind: 'video', track: 1, start: 5, end: 8 }]);
  assert.deepStrictEqual(Q.everyNth(ts, 2).map(t => [t.track, t.start]), [[0, 4], [0, 12], [1, 5]]);
  const c = Q.calls(Q.PRESETS.find(p => p.id === 'punchAlt'), ts, {});
  assert.deepStrictEqual(c.map(x => [x.op, x.params.scale, x.targets.length]), [['motion', 110, 3]]);
  assert.deepStrictEqual(Q.calls(Q.PRESETS.find(p => p.id === 'punchAlt'), ts.slice(0, 1), {}), [], 'one clip: nothing to alternate');
  assert.ok(Q.works(Q.PRESETS.find(p => p.id === 'punchAlt'), true), 'works in Resolve too');
});

test('your own buttons: a kind and a value (or a name) make a preset; out-of-range and empty values say why', () => {
  const m = x => Q.makeOwn(x);
  const punch = m({ type: 'punch', value: '115' }).preset;
  assert.deepStrictEqual([punch.id, punch.label, punch.op, punch.params, punch.kind, punch.group], ['own:punch:115', 'Punch in 115%', 'motion', { scale: 115 }, 'video', 'own']);
  assert.deepStrictEqual(m({ type: 'speed', value: '75' }).preset.params, { percent: 75 });
  assert.strictEqual(m({ type: 'speed', value: '75' }).preset.label, 'Slow 75%');
  const vol = m({ type: 'volume', value: '−6' }).preset;
  assert.deepStrictEqual([vol.label, vol.params, vol.kind], ['−6 dB', { db: -6 }, 'audio']);
  assert.strictEqual(m({ type: 'volume', value: '2,5' }).preset.label, '+2.5 dB', 'a comma works as the decimal point');
  const fx = m({ type: 'effect', name: '  Directional Blur ', label: 'Whoosh blur' }).preset;
  assert.deepStrictEqual([fx.id, fx.label, fx.params, fx.op], ['own:effect:directional blur', 'Whoosh blur', { name: 'Directional Blur' }, 'effect']);
  assert.match(m({ type: 'punch', value: '900' }).error, /10 to 400%/);
  assert.match(m({ type: 'opacity', value: '' }).error, /number/);
  assert.match(m({ type: 'speed', value: 'fast' }).error, /number/);
  assert.match(m({ type: 'transition', name: ' ' }).error, /name/);
  assert.ok(m({ type: 'nope', value: 1 }).error);
});

test('your own buttons: saved as plain settings and read back the same; a broken entry is left out; Resolve offers only what it can do', () => {
  const made = [{ type: 'punch', value: 115 }, { type: 'effect', name: 'Ultra Key', label: 'Green screen' }, { type: 'volume', value: -6 }].map(x => Q.makeOwn(x).preset);
  const saved = JSON.parse(JSON.stringify(made.map(p => p.own)));
  const back = Q.ownPresets(saved.concat([{ type: 'punch', value: 5000 }, null, 'x']));
  assert.deepStrictEqual(back.map(p => [p.id, p.label]), made.map(p => [p.id, p.label]));
  assert.deepStrictEqual(Q.ownPresets(undefined), []);
  assert.deepStrictEqual(Object.keys(Q.OWN).filter(t => Q.works({ op: Q.OWN[t].op }, true, '21.0.4')), ['punch', 'opacity']);
  assert.deepStrictEqual(Object.keys(Q.OWN).filter(t => Q.works({ op: Q.OWN[t].op }, true, '21.2.0.6')), Object.keys(Q.OWN), 'Resolve 21.2: every kind');
});

test('Resolve: what each version lets add-ons do – the one list (US.resolveEdits), and plain words for the rest', () => {
  const old = Q.PRESETS.filter(p => Q.works(p, true, '20.3.1')).map(p => p.id);
  assert.deepStrictEqual(old, ['punch110', 'punch120', 'punchAlt', 'reset', 'flip', 'half', 'solid'], 'Resolve 20: moves, the flip and opacity');
  const off = Q.PRESETS.filter(p => !Q.works(p, true, '21.2.0.6')).map(p => p.id);
  assert.deepStrictEqual(off, ['dipWhite', 'film', 'zoomIn', 'zoomOut', 'bw', 'stabilise', 'lumetri'], 'Resolve 21.2: only keyframes and what Resolve has no such thing for');
  assert.deepStrictEqual(Q.PRESETS.filter(p => p.op === 'effect' && Q.works(p, true, '21.1')).map(p => p.id), ['flip'], 'effects from 21.1.2; the flip is an Inspector switch');
  const RE = US.resolveEdits;
  assert.match(RE.why('transition', { version: '20.3.1' }), /^Resolve 21\.1 or later lets add-ons make transitions – update Resolve/);
  assert.match(RE.why('zoom', { version: '21.2' }), /doesn’t let add-ons make keyframed zooms/);
  assert.match(RE.why('effect', { version: '21.2', name: 'Black & White' }), /no Black & White effect – set Saturation to 0 on the Color page/);
  assert.strictEqual(RE.why('effect', { version: '19.0', name: 'Horizontal Flip' }), '');
  assert.strictEqual(RE.cantList('21.2'), 'keyframed zooms, text layers or cuts');
  assert.strictEqual(RE.cantList('21.0'), 'transitions, speed changes, volume changes, effects, keyframed zooms, text layers or cuts');
  assert.ok(RE.selects('21.0.4') && !RE.selects('21.0.3') && RE.atLeast('21.10', '21.2'));
  assert.ok(Q.PRESETS.every(p => Q.works(p, false)));
  assert.strictEqual(new Set(Q.PRESETS.map(p => p.id)).size, Q.PRESETS.length, 'ids are unique');
});

test('punch in every other in Resolve, with one clip picked: In to Out on its track when set, else the whole track; nothing picked: every clip', () => {
  const info = { duration: 20, inPoint: 0, outPoint: 20, video: [{ index: 0, clips: [{ start: 0, end: 4 }, { start: 4, end: 9 }, { start: 9, end: 12 }, { start: 12, end: 20 }] }, { index: 1, clips: [{ start: 2, end: 6 }] }], audio: [{ index: 0, clips: [{ start: 0, end: 20 }] }] };
  const one = { kind: 'video', track: 0, start: 4, end: 9, underPlayhead: true };
  const w = Q.widerPick(info, one);
  assert.deepStrictEqual([w.sel.map(x => x.start), w.note], [[0, 4, 9, 12], ' (the whole of V1)']);
  const r = Q.widerPick(Object.assign({}, info, { inPoint: 3, outPoint: 11 }), one);
  assert.deepStrictEqual([r.sel.map(x => x.start), r.note], [[0, 4, 9], ' (In to Out on V1)'], 'clips touching In–Out');
  assert.deepStrictEqual(Q.widerPick(info, null), { sel: null, note: ' (every clip – Resolve had no clips selected)' });
  // Resolve 21.2 selects the clip under the playhead itself – its picture and its sound (measured): still one video clip
  const both = [one, Object.assign({}, one, { kind: 'audio' })];
  assert.deepStrictEqual(Q.everyPick(info, both, 'video'), w, 'picture and sound of one clip count as one');
  assert.strictEqual(Q.everyPick(info, [one, { kind: 'video', track: 0, start: 9, end: 12 }], 'video'), null, 'two picked: kept as picked');
  const ts = Q.targetsFor(info, w.sel, 'video'), c = Q.calls(Q.PRESETS.find(p => p.id === 'punchAlt'), ts, {});
  assert.deepStrictEqual(c[0].targets.map(t => t.start), [4, 12], 'the 2nd and 4th clip of V1, not V2');
});

test('the report: done, skipped, and why when nothing was done', () => {
  const P = Q.PRESETS[0];
  assert.strictEqual(Q.report(P, { done: 2, skipped: [] }), 'Cross Dissolve: 2 transitions added');
  assert.strictEqual(Q.report(P, { done: 0, skipped: [{ why: 'Premiere has no transition called “Push”.' }] }), 'Cross Dissolve: Premiere has no transition called “Push”.');
  assert.strictEqual(Q.report(Q.PRESETS.find(p => p.id === 'bw'), { done: 3, skipped: [{ why: 'x' }] }), 'Black & White: 3 clips · 1 skipped');
});

test('the Effects tab in jsdom: Make your own button saves, shows, applies and deletes a button', () => {
  const cp = require('child_process'), path = require('path');
  const r = cp.spawnSync(process.execPath, [path.join(__dirname, 'quickfx-ui.js')], { encoding: 'utf8', timeout: 60000 });
  assert.strictEqual(r.status, 0, (r.stdout || '') + (r.stderr || ''));
});
