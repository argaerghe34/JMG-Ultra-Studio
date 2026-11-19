// Deliver › Other editors in the real editor (Premiere and Resolve): the test sequence is sent out as FCPXML (Final Cut
// Pro), FCP 7 XML, EDL and OTIO, each file is brought back in as a new sequence, and the new ones have the same clips,
// in and out points and markers. The original sequence is never changed. Final Cut Pro itself isn't driven: its files
// are checked against FCP's DTD in the unit tests (dev/tests/nle-xml.test.js).
const fs = require('fs'), path = require('path'), N = US.nleXml;
const [c1, c9] = await T.importOnce([T.media('concert', 'C001_sharp_static.mp4'), T.media('concert', 'C009_slow_pan_good.mp4')], 'Test – E2E');
const seq = await T.freshSequence('E2E Other editors', c1.id, 'Test – E2E');
await US.host.call('placeClips', { seqId: seq.id, clips: [{ id: c1.id, in: 1, out: 4 }, { id: c9.id, in: 2, out: 5 }] });
await US.host.call('addSequenceMarkers', { seqId: seq.id, markers: [{ start: 1, name: 'First' }, { start: 4.5, end: 5.5, name: 'Second', comment: 'a note' }] });
await T.open(seq.id);
const info = s => US.host.call('sequenceInfo', { seqId: s });
const pictures = i => i.video.flatMap(t => t.clips).filter(c => !/^(Ultra Guide|Graphic|Text)/.test(c.name)).sort((a, b) => a.start - b.start);
const before = await info(seq.id);
const want = pictures(before).map(c => [c.start, c.end, c.in, c.out]);
T.assert(want.length === 2, 'two clips on the test sequence: ' + want.length);
const fps = before.fps, frame = 1 / fps + 0.001;
const keep = new Set((await US.host.call('listSequences')).map(s => s.id));

// 1. out: a file for each editor, plus EDL and OTIO
const r = await T.action('deliver.toEditor', { editors: 'fcp,premiere,resolve', edl: true, otio: true });
const byExt = Object.fromEntries(r.files.map(f => [path.extname(f.file), f.path]));
for (const ext of ['.fcpxml', '.xml', '.edl', '.otio']) T.assert(byExt[ext] && fs.existsSync(byExt[ext]), ext + ' saved: ' + r.files.map(f => f.file).join(', '));
T.assert(r.stats.clips >= 2 && r.stats.markers >= 2, `read ${r.stats.clips} clips and ${r.stats.markers} markers`);
const fcp = N.readFcpxml(fs.readFileSync(byExt['.fcpxml'], 'utf8'));
T.assert(fcp.video[0].clips.length === 2, 'FCPXML: two clips on the storyline');
fcp.video[0].clips.forEach((c, i) => { T.near(c.at / fps, want[i][0], frame, `FCPXML clip ${i + 1} start`); T.near(c.in / fps, want[i][2], frame, `FCPXML clip ${i + 1} in`); T.near(c.len / fps, want[i][1] - want[i][0], frame, `FCPXML clip ${i + 1} length`); });
T.assert(fcp.markers.map(m => m.name).sort().join(',') === 'First,Second', 'FCPXML markers: ' + fcp.markers.map(m => m.name).join(','));

// 2. back in: each file as a new sequence
const results = {};
for (const ext of ['.fcpxml', '.xml', '.otio', '.edl']) {
  const b = await T.action('deliver.fromEditor', { file: byExt[ext] });
  const got = await info(b.seqId), pics = pictures(got);
  results[ext] = { name: b.name, clips: pics.length, markers: got.markers.length, markersAdded: b.markersAdded, how: b.how, lost: b.lost.length, missing: b.missing.length };
  T.assert(!keep.has(b.seqId), ext + ': a new sequence');
  T.assert(b.missing.length === 0, ext + ': every media file found');
  T.assert(pics.length === 2, `${ext}: two clips back, got ${pics.length}`);
  pics.forEach((c, i) => {
    T.near(c.start, want[i][0], frame, `${ext} clip ${i + 1} start`); T.near(c.end, want[i][1], frame, `${ext} clip ${i + 1} end`);
    T.near(c.in, want[i][2], frame, `${ext} clip ${i + 1} in point`); T.near(c.out, want[i][3], frame, `${ext} clip ${i + 1} out point`);
  });
  // markers: FCPXML and FCP 7 XML carry them; an EDL only as notes, OTIO as the editor reads it
  if (ext === '.fcpxml' || ext === '.xml') {
    T.assert(got.markers.length >= 2, `${ext}: markers back (${got.markers.map(m => m.name).join(',')})`);
    const first = got.markers.find(m => m.name === 'First'), second = got.markers.find(m => m.name === 'Second');
    T.assert(first && second, `${ext}: markers keep their names: ${got.markers.map(m => m.name).join(',')}`);
    T.near(first.start, 1, frame, `${ext} marker First`); T.near(second.start, 4.5, frame, `${ext} marker Second`);
  }
}

// 3. the original is as it was; the new sequences are taken away again
const after = await info(seq.id);
T.assert(JSON.stringify(pictures(after).map(c => [c.start, c.end, c.in, c.out])) === JSON.stringify(want), 'the original sequence is unchanged');
T.assert(after.markers.length === before.markers.length, 'its markers too');
for (const s of await US.host.call('listSequences')) if (!keep.has(s.id) && s.id !== seq.id) await US.host.call('deleteSequence', { seqId: s.id });
try { fs.rmSync(r.dir, { recursive: true, force: true }); } catch (e) { /* left in the test project's exports */ }
return results;
