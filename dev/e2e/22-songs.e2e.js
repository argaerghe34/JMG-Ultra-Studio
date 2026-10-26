// Song Splitter in real Premiere: the 4 songs of the test concert (incl. a segue), per-song markers and sequences,
// and the same on a sequence (trimmed copies per song).
const truth = JSON.parse(T.fs.readFileSync(T.media('audio', 'concert_set_truth.json'), 'utf8'));
const [wav, c11] = await T.importOnce([T.media('audio', 'concert_set.wav'), T.media('concert', 'C011_concert_long.mp4')], 'Test – Audio');
const tA = { kind: 'item', id: wav.id, name: wav.name, duration: wav.duration, fps: 25, item: wav };
await US.audioKit.removeMarkers('songs:' + wav.id); // leftovers from an interrupted run
const before = (await US.host.call('clipMarkers', { id: wav.id })).filter(m => /^Song \d/.test(m.name)).length;
const res = await US.songSplitter.analyse(tA, US.jobs.testJob('songs'));
const typeAt = (segs, x) => (segs.find(s => x >= s.start && x < s.end) || {}).type;
let ok = 0, tot = 0;
for (let x = 0.5; x < truth.duration; x += 1) { tot++; if (typeAt(res.segments, x) === typeAt(truth.segments, x)) ok++; }
const songs = res.segments.filter(s => s.type === 'song'), tSongs = truth.segments.filter(s => s.type === 'song');
T.assert(songs.length === tSongs.length, `${songs.length} songs found, ${tSongs.length} expected`);
tSongs.forEach((ts, i) => { T.near(songs[i].start, ts.start, 3, `song ${i + 1} start`); T.near(songs[i].end, ts.end, 3, `song ${i + 1} end`); });
T.assert(ok / tot > 0.95, `${(100 * ok / tot).toFixed(1)}% of seconds labelled right`);
// markers + a sequence per song
const o = await US.songSplitter.output(tA, res, { markers: true, sequences: true }, US.jobs.testJob('out'));
const mk = (await US.host.call('clipMarkers', { id: wav.id })).filter(m => /^Song \d/.test(m.name));
T.assert(mk.length - before === 4, `${mk.length - before} song markers`);
const all = await US.host.call('listSequences');
for (const song of songs) {
  // newest sequence with this song's name (sequence names get a number if one already exists)
  const s = all.filter(x => x.name === song.name || x.name.startsWith(song.name + ' ')).pop();
  T.assert(s, `a sequence for ${song.name}`);
  const i = await US.host.call('sequenceInfo', { seqId: s.id });
  T.near(i.duration, song.end - song.start, 0.1, `sequence for ${song.name}`);
  T.near(i.audio[0].clips[0].in, song.start, 0.05, `${song.name} starts at the song`);
  await US.host.call('deleteSequence', { seqId: s.id });
}
await US.audioKit.removeMarkers('songs:' + wav.id);
// sequence mode: C011 is the first 120 s of the concert (song 1 = 15–75, song 2 starts at 95 and is cut at 120)
const sq = await T.freshSequence('Test – Audio e2e concert', c11.id, 'Test – Audio');
await US.host.call('placeClips', { seqId: sq.id, cursor: 0, clips: [{ id: c11.id, in: 0, out: c11.duration }] });
const tB = { kind: 'sequence', id: sq.id, name: 'Test – Audio e2e concert', duration: 120, fps: 25 };
const rB = await US.songSplitter.analyse(tB, US.jobs.testJob('songsB'));
const sB = rB.segments.filter(s => s.type === 'song');
T.assert(sB.length === 2, `${sB.length} songs in the sequence`);
await US.songSplitter.output(tB, rB, { markers: true, sequences: true }, US.jobs.testJob('outB'));
const copies = (await US.host.call('listSequences')).filter(s => s.name.startsWith('Test – Audio e2e concert – '));
T.assert(copies.length === 2, `${copies.length} trimmed copies`);
for (const c of copies) {
  const i = await US.host.call('sequenceInfo', { seqId: c.id });
  const song = sB.find(s => c.name.endsWith(s.name));
  T.near(i.duration, song.end - song.start, 0.1, `${c.name} length`);
  T.near(i.video[0].clips[0].in, song.start, 0.1, `${c.name} starts at the song`);
  await US.host.call('deleteSequence', { seqId: c.id });
}
const smk = (await US.host.call('sequenceInfo', { seqId: sq.id })).markers;
T.assert(smk.length === 2, 'a marker per song on the sequence');
T.assert(US.songSplitter.setlistCSV(tA, res).split('\n').length === res.segments.length + 1, 'setlist CSV has a row per part');
return { accuracy: `${(100 * ok / tot).toFixed(1)}%`, songStarts: songs.map(s => s.start.toFixed(1)).join(', '), sequenceMode: sB.map(s => `${s.start.toFixed(0)}–${s.end.toFixed(0)}`).join(', ') };
