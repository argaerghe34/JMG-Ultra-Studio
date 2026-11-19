// Auto Sync in the real editor (Premiere and Resolve), with the test media whose sound is known: the long concert
// clip's sound IS the first 120 s of audio/concert_set.wav.
//  1. From clips in a bin: the concert clip and the recording start together on a NEW sequence, camera on V1 with its
//     sound on A1, the recording on A2; a clip that shares no sound with them is not lined up with them.
//  2. From a sequence where the camera clip is trimmed (30–90 s) and dropped in the wrong place: on the new sequence
//     that piece sits 30 s into the recording – and the sequence it came from is exactly as it was.
//  3. The start timecodes can be read (whatever they are), and the tab opens from Advanced.
// Nothing is downloaded and no AI is used. The first run listens to the three files (a few seconds each with ffmpeg;
// otherwise the editor renders their sound, as for every tool that listens).
const A = US.autoSync;
T.assert(A && US.tools.get('autosync'), 'Auto Sync is loaded');
T.assert(US.ADVANCED_TOOLS.includes('autosync'), 'it lives in Advanced');
const fns = await US.host.call('listFns');
T.assert(fns.includes('syncBuild') && fns.includes('syncTimecodes'), 'the editor has syncBuild and syncTimecodes');

const out = {}, made = [];
const frame = 1 / 25, tol = 2 * frame;
const [cam, rec, other] = await T.importOnce([T.media('concert', 'C011_concert_long.mp4'), T.media('audio', 'concert_set.wav'), T.media('concert', 'C001_sharp_static.mp4')], 'Test – Auto Sync');
const clipsOn = (tracks, name) => [].concat(...tracks.map(t => t.clips.filter(c => c.name === name).map(c => Object.assign({ track: t.index }, c))));
const run = (src, o) => US.jobs.run({ title: 'Auto Sync (e2e)', tool: 'autosync' }, job => A.run(job, src, o));
try {
  // the timecodes can be asked for (a number of seconds, or null) – what the test files hold is printed, not judged
  const tcs = await US.host.call('syncTimecodes', { ids: [cam.id, rec.id] });
  T.assert(tcs.length === 2 && tcs.every(t => t && (t.start === null || typeof t.start === 'number')), 'syncTimecodes answers for each clip: ' + JSON.stringify(tcs));
  out.timecodes = tcs.map(t => t.start).join(', ');

  // 1. from clips
  const items = await US.host.call('itemsInfo', { ids: [cam.id, rec.id, other.id] });
  const r1 = await run({ items }, { mode: 'sound', cameraSound: 'keep', colour: true, name: 'Auto Sync e2e – clips' });
  T.assert(r1 && r1.sequence, 'a new sequence was made: ' + (r1 && r1.summary));
  made.push(r1.sequence.id);
  T.assert(!r1.missing, 'every clip could be laid: ' + r1.summary);
  T.assert(r1.counts.cameras === 2 && r1.counts.recorders === 1, 'two cameras (told apart by their file names) and a recorder: ' + JSON.stringify(r1.counts));
  const rep = Object.fromEntries(r1.report.map(x => [x.name, x]));
  T.assert(rep[cam.name].ok && rep[rec.name].ok, 'the concert clip and the recording were lined up: ' + JSON.stringify(r1.report.map(x => [x.name, x.how])));
  const s1 = await US.host.call('sequenceInfo', { seqId: r1.sequence.id });
  const camV = clipsOn(s1.video, cam.name), camA = clipsOn(s1.audio, cam.name), recA = clipsOn(s1.audio, rec.name), recV = clipsOn(s1.video, rec.name);
  T.assert(camV.length === 1 && camA.length === 1 && recA.length === 1 && recV.length === 0, `one picture and one sound layer for the camera, one sound layer for the recording: ${camV.length}/${camA.length}/${recA.length}/${recV.length}`);
  T.near(camV[0].start, recA[0].start, tol, 'the camera and the recording start together');
  T.near(camA[0].start, camV[0].start, 0.001, 'the camera’s sound is under its picture');
  T.near(camV[0].end - camV[0].start, 120, 0.1, 'the camera clip is whole');
  T.near(recA[0].end - recA[0].start, 291, 0.2, 'the recording is whole');
  T.assert(camA[0].track !== recA[0].track, 'camera sound and recording on different audio tracks');
  const otherV = clipsOn(s1.video, other.name);
  T.assert(otherV.length === 1 && otherV[0].track !== camV[0].track, 'the other camera has its own video track');
  if (!rep[other.name].ok) T.assert(otherV[0].start >= recA[0].end - 0.01 && s1.markers.some(m => m.name === 'Not synced'), 'a clip that shares no sound is at the end, after a “Not synced” marker');
  out.clips = `${r1.summary} · ${other.name}: ${rep[other.name].how}`;

  // 2. from a sequence, trimmed and in the wrong place
  const src = await T.freshSequence('Auto Sync e2e – dropped', cam.id, 'Test – Auto Sync');
  made.push(src.id);
  await US.host.call('placeClips', { seqId: src.id, clips: [{ id: cam.id, in: 30, out: 90, at: 200, v: 0, a: 0 }, { id: rec.id, in: 0, out: 291, at: 0, v: 0, a: 1, video: false }] });
  const before = await US.host.call('sequenceInfo', { seqId: src.id });
  const shape = s => JSON.stringify([s.video, s.audio].map(ts => ts.map(t => t.clips.map(c => [c.name, +c.start.toFixed(2), +c.end.toFixed(2), +c.in.toFixed(2)]))));
  T.assert(clipsOn(before.video, cam.name).length === 1 && clipsOn(before.audio, rec.name).length === 1, 'the test sequence is set up: ' + shape(before));
  const r2 = await run({ sequence: before }, { mode: 'sound', cameraSound: 'mute', colour: false });
  T.assert(r2 && r2.sequence && r2.sequence.id !== src.id, 'a NEW sequence, not the one it was given: ' + (r2 && r2.summary));
  made.push(r2.sequence.id);
  T.assert(/– synced/.test(r2.sequence.name), 'named after the sequence it came from: ' + r2.sequence.name);
  T.assert(r2.counts.synced === 2 && !r2.missing, r2.summary);
  const s2 = await US.host.call('sequenceInfo', { seqId: r2.sequence.id });
  const v2 = clipsOn(s2.video, cam.name)[0], a2 = clipsOn(s2.audio, cam.name)[0], w2 = clipsOn(s2.audio, rec.name)[0];
  T.assert(v2 && a2 && w2, 'camera picture, camera sound and recording are all on the new sequence: ' + shape(s2));
  T.near(v2.start - w2.start, 30, tol, 'the trimmed camera piece sits 30 s into the recording');
  T.near(v2.in, 30, tol, 'it still starts 30 s into its file'); T.near(v2.out, 90, tol, 'and ends at 90 s');
  T.near(a2.start, v2.start, 0.001, 'its sound is under it');
  T.assert(s2.audio[a2.track].muted === true && s2.audio[w2.track].muted === false, 'the camera’s sound is muted, the recording’s isn’t');
  const after = await US.host.call('sequenceInfo', { seqId: src.id });
  T.assert(shape(after) === shape(before), 'the sequence it was given is exactly as it was');
  const again = await US.host.call('itemsInfo', { ids: [cam.id] });
  T.assert(again[0] && Math.abs((again[0].rangeEnd - again[0].rangeStart) - (items[0].rangeEnd - items[0].rangeStart)) < 0.01, 'the clip in the bin keeps its own In and Out');
  out.sequence = `${r2.summary} · camera at ${(v2.start - w2.start).toFixed(3)} s`;

  // 3. the tab, from Advanced
  US.tools.open('advanced'); await T.sleep(100);
  const view = () => document.querySelector('.view > :not(.hidden)');
  const tile = view().querySelector('.tile[data-tool="autosync"]');
  T.assert(tile, 'an Auto Sync tile in Advanced');
  tile.click(); await T.sleep(200);
  T.assert(view().querySelector('[data-as="source"]') && /Auto Sync/.test(view().querySelector('.tool-title').textContent), 'the tab opened');
  T.assert(US.actions.get('autosync.sync').match('sync the selected clips'), 'Ask understands “sync the selected clips”');
} finally {
  for (const id of made) { try { await US.host.call('deleteSequence', { seqId: id }); } catch (e) { /* already gone */ } }
  US.tools.open('home');
}
return out;
