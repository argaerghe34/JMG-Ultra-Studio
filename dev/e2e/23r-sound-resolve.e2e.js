// resolve-only
// Sound Check › Duck the music under speech, in Resolve (add-ons can't change volume there): a copy of the timeline
// with each stretch of speech marked in blue, found from the transcript; the original untouched. (Premiere: 23c.)
const S = US.story;
const [iv] = await T.importOnce([T.media('interview', 'I001_interview.mp4')], 'Test – Story');
const [music] = await T.importOnce([T.media('audio', 'music_120bpm.wav')], 'Test – E2E');
S.loadState();
if (!S.state().transcripts.some(t => /I001_interview/.test(t.name || t.path || ''))) await S.importFiles(US.jobs.testJob('story'), [T.media('transcripts', 'I001_interview.srt')]);
const seq = await T.freshSequence('E2E Duck (Resolve)', iv.id, 'Test – E2E');
await US.host.call('placeClips', { seqId: seq.id, clips: [{ id: iv.id, in: 0, out: 30, at: 0 }, { id: music.id, in: 0, out: 30, at: 0, a: 1, video: false }] });
await T.open(seq.id);
await T.devEval(`return R.needSeq(${JSON.stringify(seq.id)}).SetTrackName('audio', 2, 'Music')`);
const r = await T.action('sound.duck', { db: 12 });
T.assert(r.marked && r.via === 'transcript' && r.regions.length >= 1, 'speech found from the transcript: ' + r.summary);
const info = await US.host.call('sequenceInfo', { seqId: r.copy.id });
const blue = info.markers.filter(m => m.end - m.start > 0.5);
T.assert(blue.length === r.regions.length, `a marker per stretch of speech: ${blue.length} vs ${r.regions.length}`);
r.regions.forEach((x, i) => { T.near(blue[i].start, x.start, 0.05, `stretch ${i + 1} start`); T.near(blue[i].end, x.end, 0.05, `stretch ${i + 1} end`); });
const orig = await US.host.call('sequenceInfo', { seqId: seq.id });
T.assert(!orig.markers.length && orig.audio[1].clips.length === 1, 'the original is unchanged');
let gain = '';
try { await US.host.call('soundGain', { seqId: seq.id, db: -3 }); } catch (e) { gain = e.title || e.message; }
T.assert(/volume/i.test(gain), 'changing volume says plainly it can’t: ' + gain);
return { summary: r.summary, regions: r.regions.map(x => `${x.start.toFixed(1)}–${x.end.toFixed(1)}`) };
