// resolve-only
// The things the Resolve layer assumes about Resolve's API (dev/RESOLVE.md), checked in real Resolve on the test
// project: clip details, frame counting, placing ranges, markers on timelines and clips, subclips, copies, rendering
// sound for analysis and saving a still. Each check says what it found, so a wrong assumption is plain to see.
const BIN = 'Test – Resolve basics', C = US.host.call;
const [clip] = await T.importOnce([T.media('interview', 'I001_interview.mp4')], BIN);
const info = await C('itemInfo', { id: clip.id });
T.assert(info.fps > 20 && info.duration > 10 && info.width === 1920 && info.hasAudio, 'clip details: ' + JSON.stringify(info));
const found = {};
// leftovers from an earlier run that stopped half way
const stale = (await C('clipMarkers', { id: clip.id })).filter(m => m.name === 'on clip').map(m => m.guid);
if (stale.length) await C('removeClipMarkers', { id: clip.id, guids: stale });

// a timeline of two ranges: 2–4 s and 10–13 s of the interview
const seq = await T.freshSequence('Test – Resolve basics', clip.id, BIN);
const placed = await C('placeClips', { seqId: seq.id, clips: [{ id: clip.id, in: 2, out: 4 }, { id: clip.id, in: 10, out: 13 }], cursor: 0 });
found.placed = placed.placed;
T.near(placed.placed[0].start, 0, 0.05, 'first range starts at 0');
T.near(placed.placed[0].end, 2, 0.05, 'first range is 2 s long (inclusive end frame)');
T.near(placed.placed[1].start, 2, 0.05, 'second range follows');
T.near(placed.placed[1].end, 5, 0.05, 'second range is 3 s long');
const si = await C('sequenceInfo', { seqId: seq.id });
const v1 = si.video[0].clips;
T.assert(v1.length === 2, 'two clips on V1: ' + JSON.stringify(v1));
T.near(v1[0].in, 2, 0.05, 'in point read back in media seconds'); T.near(v1[0].out, 4, 0.06, 'out point read back');
T.near(v1[1].in, 10, 0.05, 'second in point');
T.assert(si.audio[0].clips.length === 2, 'sound came along on A1');
T.near(si.duration, 5, 0.05, 'timeline length');

// markers: on the timeline, and on the clip under them (Settings › Markers)
const g1 = await C('addSequenceMarkers', { seqId: seq.id, where: 'sequence', markers: [{ start: 1, end: 1.5, name: 'tl', color: 3 }] });
const g2 = await C('addSequenceMarkers', { seqId: seq.id, where: 'clips', markers: [{ start: 3, name: 'on clip', color: 0 }] });
const si2 = await C('sequenceInfo', { seqId: seq.id });
const tm = si2.markers.find(m => m.name === 'tl');
T.assert(tm, 'timeline marker read back');
T.near(tm.start, 1, 0.05, 'timeline marker time'); T.near(tm.end, 1.5, 0.05, 'timeline marker end');
T.assert(g2[0].startsWith('clip:'), 'marker went on the clip: ' + g2[0]);
const cm = (await C('clipMarkers', { id: clip.id })).find(m => m.name === 'on clip');
T.assert(cm, 'clip marker read back');
T.near(cm.start, 11, 0.05, 'clip marker at the source time (3 s into the timeline = 11 s into the clip)');
T.assert((await C('removeSequenceMarkers', { seqId: seq.id, guids: g1.concat(g2) })) === 2, 'both removed');
T.assert(!(await C('clipMarkers', { id: clip.id })).some(m => m.name === 'on clip'), 'clip marker gone');

// subclips count in media frames, end inclusive
const [sub] = await C('createSubclips', { binPath: BIN, items: [{ id: clip.id, start: 5, end: 7, name: 'Resolve basics subclip' }] });
const subInfo = await C('itemInfo', { id: sub });
found.subclip = { rangeStart: subInfo.rangeStart, rangeEnd: subInfo.rangeEnd, duration: subInfo.duration, subclip: subInfo.subclip };
T.near(subInfo.rangeStart, 5, 0.05, 'subclip starts 5 s in'); T.near(subInfo.rangeEnd, 7, 0.06, 'subclip ends 7 s in');

// a copy, cut down (Silence Cut's way of working)
const copy = await C('cloneSequence', { seqId: seq.id });
const cut = await C('extractRanges', { seqId: copy.id, ranges: [[0.5, 1.5]] });
found.extract = cut;
const ci = await C('sequenceInfo', { seqId: copy.id });
T.near(ci.duration, 4, 0.05, 'a second removed from the copy');
T.near((await C('sequenceInfo', { seqId: seq.id })).duration, 5, 0.05, 'the original is untouched');

// sound for analysis
const wavOut = require('path').join(US.fsx.tempDir(), 'us-resolve-basics.wav');
const wav = await C('renderAudio', { id: clip.id, out: wavOut });
found.renderAudio = wav;
T.assert(T.fs.existsSync(wav.path) && wav.size > 1000, 'analysis sound rendered: ' + JSON.stringify(wav));
const a = await US.audio.readWav(wav.path, { targetRate: 16000 });
found.audio = { rate: a.sourceRate, seconds: a.duration };
T.near(found.audio.seconds, info.duration, 0.3, 'the whole clip came back');

// a still of the timeline (stays on this computer)
const fr = await C('exportFrame', { seqId: seq.id, seconds: 1, outBase: require('path').join(US.fsx.tempDir(), 'us-resolve-basics-still') });
found.exportFrame = fr;
T.assert(T.fs.existsSync(fr.path || fr) && T.fs.statSync(fr.path || fr).size > 1000, 'still saved: ' + JSON.stringify(fr));

await C('deleteSequence', { seqId: copy.id });
return found;
