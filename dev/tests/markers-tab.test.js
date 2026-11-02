// Markers: timecodes and notes (lines and review CSVs, start timecode), exports (list, CSV, YouTube chapters), markers
// made at cuts/clips/every N s, clip markers shown on the timeline, duplicates, renaming; the Assistant's commands;
// and updateMarkers in the stand-in Resolve (taken off and added again, keeping what isn't changed).
const assert = require('assert');
const { load, test } = require('./harness');
global.addEventListener = global.addEventListener || (() => {});
global.ResizeObserver = global.ResizeObserver || function () { return { observe() {} }; };
const US = load(['time', 'ui', 'app', 'js/tools/11-audio-kit.js', 'js/tools/35-markers.js']);
const M = US.markerKit;

test('timecodes: frames, seconds, minutes, hours', () => {
  assert.strictEqual(M.parseTime('00:01:02:12', 25), 62.48);
  assert.strictEqual(M.parseTime('01:02:03;00', 30), 3723);
  assert.strictEqual(M.parseTime('1:02:03'), 3723);
  assert.strictEqual(M.parseTime('2:03.5'), 123.5);
  assert.strictEqual(M.parseTime('75s'), 75);
  assert.strictEqual(M.parseTime('soon'), null);
});

test('notes: one marker per line with a time, ranges, colours in brackets, the start timecode taken off', () => {
  const ms = M.fromText('Notes from Sam:\n01:23 Fix the colour here. It’s too warm.\n- 02:10–02:25 Too long, trim\n[red] 03:05 Wrong name in the lower third\nThanks!', { fps: 25 });
  assert.deepStrictEqual(ms.map(m => [m.start, m.end, m.name, m.color]), [[83, null, 'Fix the colour here.', 0], [130, 145, 'Too long, trim', 0], [185, null, 'Wrong name in the lower third', 1]]);
  assert.strictEqual(ms[0].comment, 'Fix the colour here. It’s too warm.');
  const z = M.fromText('01:00:10:00 Hello\n01:00:20:00 There', { fps: 25, zero: 3600 });
  assert.deepStrictEqual(z.map(m => m.start), [10, 20], 'counted from 01:00:00:00');
});

test('a review export (CSV): its columns, quoted commas, who said it', () => {
  const csv = 'Timecode,Commenter,Comment,Color\n00:00:05:00,Sam,"Cut this, it drags",Red\n00:00:12:12,Alex,Love it,\nnot a time,x,y,';
  const ms = M.fromText(csv, { fps: 25 });
  assert.deepStrictEqual(ms.map(m => [m.start, m.name, m.comment, m.color]), [[5, 'Cut this, it drags', '– Sam', 1], [12.48, 'Love it', '– Alex', 0]]);
});

test('out: a list, a spreadsheet and YouTube chapters (first at 0:00, 10 s apart)', () => {
  const ms = [{ start: 0, end: 0, name: 'Intro', comment: '', color: 0 }, { start: 5, end: 0, name: 'Too close', comment: '', color: 1 }, { start: 65, end: 70, name: 'Part, two', comment: 'note', color: 6 }];
  assert.strictEqual(M.toText(ms, { fps: 25 }).split('\n')[2], '00:01:05:00 – 00:01:10:00\tBlue\tPart, two\tnote');
  assert.strictEqual(M.toCSV(ms, { fps: 25 }).split('\r\n')[3], '00:01:05:00,00:01:10:00,5.00,Blue,"Part, two",note');
  assert.strictEqual(M.toChapters(ms), '0:00 Intro\n1:05 Part, two\n');
  assert.strictEqual(M.toChapters([{ start: 30, name: 'A' }]), '0:00 Intro\n0:30 A\n');
});

test('making markers: every N s, at every cut, at every clip; clip markers where they show on the timeline; duplicates; renaming', () => {
  assert.deepStrictEqual(M.every(30, { to: 95, name: 'Check' }).map(m => [m.start, m.name]), [[0, 'Check 1'], [30, 'Check 2'], [60, 'Check 3'], [90, 'Check 4']]);
  const clips = [{ name: 'A', start: 0, end: 5, in: 0, out: 5 }, { name: 'B', start: 5, end: 9, in: 10, out: 14 }, { name: 'C', start: 12, end: 15, in: 0, out: 3 }];
  assert.deepStrictEqual(M.atClips(clips, { mode: 'cuts' }).map(m => [m.start, m.name, m.comment]), [[5, 'Cut 1', 'A → B']], 'a gap isn’t a cut');
  assert.deepStrictEqual(M.atClips(clips, { mode: 'clips' }).map(m => [m.start, m.name]), [[0, 'A'], [5, 'B'], [12, 'C']]);
  const on = M.clipMarkersOnTimeline([{ clip: { name: 'B', start: 5, end: 9, in: 10, out: 14, speed: 2 }, markers: [{ start: 12, end: 13, name: 'Smile', comment: '', color: 3 }, { start: 20, name: 'Not used' }] }]);
  assert.deepStrictEqual(on.map(m => [m.start, m.end, m.name, m.color]), [[6, 6.5, 'Smile', 3]], 'only the part used; a sped-up clip’s times halved');
  assert.deepStrictEqual(M.duplicates([{ guid: 'a', start: 1, name: 'X' }, { guid: 'b', start: 1.01, name: 'X' }, { guid: 'c', start: 1, name: 'Y' }]), ['b']);
  assert.deepStrictEqual(M.rename([{ guid: 'a', start: 0, name: 'old' }, { guid: 'b', start: 1, name: 'x' }], 'Shot {n} ({name})').map(x => x.name), ['Shot 1 (old)', 'Shot 2 (x)']);
  assert.strictEqual(M.filter([{ name: 'Fix', comment: '', color: 1 }, { name: 'ok', comment: 'fix later', color: 0 }, { name: 'z', comment: '', color: 1 }], { text: 'fix', colours: new Set([1]) }).length, 1);
});

test('the Assistant: a named, coloured marker at the playhead; every 30 s; at every cut; copy as chapters; duplicates removed', async () => {
  const was = { call: US.host.call, refresh: US.refreshContext, copy: US.ui.copy }, calls = [];
  let copied = '';
  const SEQ = { name: 'Cut', fps: 25, frame: 0.04, duration: 70, video: [{ index: 0, clips: [{ name: 'A', start: 0, end: 5, in: 0, out: 5 }, { name: 'B', start: 5, end: 9, in: 0, out: 4 }] }], audio: [], markers: [{ guid: 'g1', start: 12, end: 12, name: 'Hi', comment: '', color: 0 }, { guid: 'g2', start: 12, end: 12, name: 'Hi', comment: '', color: 0 }] };
  US.host.call = async (fn, a) => { calls.push([fn, a]); if (fn === 'sequenceInfo') return SEQ; if (fn === 'storySequenceTiming') return { zero: 0 }; if (fn === 'removeSequenceMarkers') return a.guids.length; return []; };
  US.refreshContext = async () => { US.ctx.sequence = { id: 's1', name: 'Cut', playhead: 7.5 }; };
  US.ui.copy = t => { copied = t; };
  US.ctx.sequence = { id: 's1', name: 'Cut' };
  try {
    const act = id => US.actions.list().find(x => x.id === id);
    const p = act('markers.add').match('add a red marker here called fix the sound');
    assert.deepStrictEqual([p.where, p.name, p.color], ['playhead', 'fix the sound', 1]);
    await act('markers.add').run(p);
    assert.deepStrictEqual(calls.find(c => c[0] === 'addSequenceMarkers')[1].markers, [{ start: 7.5, end: null, name: 'fix the sound', comment: '', color: 1 }]);
    calls.length = 0;
    await act('markers.add').run(act('markers.add').match('add a marker every 30 seconds'));
    assert.deepStrictEqual(calls.find(c => c[0] === 'addSequenceMarkers')[1].markers.map(m => m.start), [0, 30, 60]);
    calls.length = 0;
    await act('markers.add').run(act('markers.add').match('put a marker at every cut'));
    assert.deepStrictEqual(calls.find(c => c[0] === 'addSequenceMarkers')[1].markers.map(m => m.start), [5]);
    await act('markers.export').run(act('markers.export').match('copy the markers as youtube chapters'));
    assert.strictEqual(copied, '0:00 Intro\n0:12 Hi\n');
    const r = await act('markers.clean').run({});
    assert.deepStrictEqual(calls.find(c => c[0] === 'removeSequenceMarkers')[1].guids, ['g2']);
    assert.ok(/1 duplicate marker removed/.test(r.summary));
    assert.ok(!act('markers.add').match('remove the markers'));
  } finally { US.host.call = was.call; US.refreshContext = was.refresh; US.ui.copy = was.copy; }
});

test('the marker pad: a point, seconds, the clip under the playhead, In to Out, and start/stop – on the timeline or the clip', () => {
  const info = { playhead: 6, frame: 0.04, duration: 30, inPoint: 2, outPoint: 9, video: [{ clips: [{ name: 'A.mov', start: 0, end: 5 }, { name: 'B.mov', start: 5, end: 12, itemId: 'b' }] }, { clips: [{ name: 'Off', start: 5, end: 8, disabled: true }] }], audio: [] };
  const b = (o) => Object.assign({ id: 'x', label: 'Fix', color: 1, length: 'point', secs: 2, where: 'timeline' }, o);
  assert.deepStrictEqual(M.press(b(), info), { marker: { start: 6, end: null, name: 'Fix', comment: '', color: 1, chapter: false }, where: 'timeline' });
  assert.deepStrictEqual(M.press(b({ length: 'secs', secs: 3, where: 'clips' }), info).marker.end, 9);
  assert.strictEqual(M.press(b({ length: 'secs', secs: 30 }), info).marker.end, 30, 'not past the end');
  const c = M.press(b({ length: 'clip' }), info);
  assert.deepStrictEqual([c.marker.start, c.marker.end, c.marker.comment], [5, 12, 'B.mov'], 'the enabled clip on top');
  assert.deepStrictEqual([M.press(b({ length: 'inout' }), info).marker.start, M.press(b({ length: 'inout' }), info).marker.end], [2, 9]);
  assert.ok(M.press(b({ length: 'inout' }), Object.assign({}, info, { inPoint: 0, outPoint: 30 })).error, 'no In and Out set');
  const t = b({ length: 'toggle' });
  assert.deepStrictEqual(M.press(t, info), { start: 6 });
  assert.deepStrictEqual([M.press(t, Object.assign({}, info, { playhead: 10 }), { pending: 6 }).marker.start, M.press(t, Object.assign({}, info, { playhead: 10 }), { pending: 6 }).marker.end], [6, 10]);
  assert.strictEqual(M.press(t, Object.assign({}, info, { playhead: 2 }), { pending: 6 }).marker.start, 2, 'pressed earlier: still the right way round');
  assert.ok(M.press(b(), Object.assign({}, info, { playhead: null })).error);
  assert.strictEqual(M.press(b({ label: 'Note…' }), info, { name: '' }).marker.name, 'Note');
  assert.strictEqual(M.PAD_DEFAULTS.length, 9);
  assert.ok(M.PAD_DEFAULTS.every(x => x.key && M.describePad(x)));
});

test('the marker at the playhead: one that covers it (the latest to start), else the nearest within half a second', () => {
  const ms = [{ guid: 'a', start: 1, end: 10 }, { guid: 'b', start: 4, end: 6 }, { guid: 'c', start: 20, end: 20 }];
  assert.strictEqual(M.markerAt(ms, 5).guid, 'b');
  assert.strictEqual(M.markerAt(ms, 8).guid, 'a');
  assert.strictEqual(M.markerAt(ms, 20.3).guid, 'c');
  assert.strictEqual(M.markerAt(ms, 15), null);
});
