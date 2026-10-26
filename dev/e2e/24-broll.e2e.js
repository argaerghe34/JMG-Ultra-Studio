// B-roll: cover the jump cuts of an interview with the best moments from a B-roll bin, on a copy.
const [iv] = await T.importOnce([T.media('interview', 'I001_interview.mp4')], 'Test – E2E');
const broll = await T.importOnce([T.media('concert', 'C001_sharp_static.mp4'), T.media('concert', 'C009_slow_pan_good.mp4'), T.media('concert', 'C002_blurry.mp4')], 'Test – B-roll');
const seq = await T.freshSequence('E2E B-roll', iv.id, 'Test – E2E');
// three pieces of the same interview back to back = two jump cuts; then music on A2 that must survive
await US.host.call('placeClips', { seqId: seq.id, clips: [{ id: iv.id, in: 0, out: 6, at: 0 }, { id: iv.id, in: 9, out: 15, at: 6 }, { id: iv.id, in: 18, out: 26, at: 12 }] });
const [music] = await T.importOnce([T.media('audio', 'music_120bpm.wav')], 'Test – E2E');
await US.host.call('placeClips', { seqId: seq.id, clips: [{ id: music.id, in: 0, out: 20, at: 0, a: 1, video: false }] });
await T.open(seq.id);
const before = await US.host.call('sequenceInfo', { seqId: seq.id });
T.assert(before.audio[1].clips.length === 1, 'music on A2');

// pick the B-roll bin in the tool, as the user would
US.tools.open('broll');
const bins = await US.host.call('listBins'); const bin = bins.find(b => b.path === 'Test – B-roll');
const root = document.querySelector('.tool:not(.hidden)');
[...root.querySelectorAll('.segmented .seg')].find(b => b.textContent.trim() === 'A bin').click();
let sel = null;
for (let i = 0; i < 40 && !sel; i++) { await T.sleep(250); sel = [...root.querySelectorAll('select')].find(s => [...s.options].some(o => o.value === bin.id)); }
T.assert(sel, 'B-roll bin listed in the picker');
sel.value = bin.id; sel.dispatchEvent(new Event('change'));

const r = await T.action('broll.cover', { mode: 'jump' });
T.assert(r.shots.length === 2 && !r.uncovered.length, 'two jump cuts covered: ' + r.summary);
T.assert(!r.shots.some(s => /C002/.test(s.name)), 'the blurry clip isn’t used first: ' + r.shots.map(s => s.name));
const after = await US.host.call('sequenceInfo', { seqId: r.copy.id });
const t = after.video[r.track];
T.assert(t.name === 'B-roll' && t.clips.length === 2, 'B-roll track: ' + t.name + ' ' + t.clips.length);
T.near(t.clips[0].start, 5, 0.05, 'first cutaway starts a second before the cut');
T.near(t.clips[0].end - t.clips[0].start, 3, 0.05, 'three seconds long');
T.assert(r.track >= 2, 'B-roll is above the track whose sound is the music (V' + (r.track + 1) + ')');
T.assert(after.audio[0].clips.length === 3 && Math.abs(after.audio[0].clips[2].end - 20) < 0.05, 'interview sound untouched');
T.assert(after.audio[1].clips.length === 1 && Math.abs(after.audio[1].clips[0].end - before.audio[1].clips[0].end) < 0.05, 'music untouched');
T.assert(!after.audio[r.track] || after.audio[r.track].clips.length === 0, 'B-roll is picture only');
const orig = await US.host.call('sequenceInfo', { seqId: seq.id });
T.assert(orig.video.every(tr => tr.index === 0 || tr.clips.length === 0), 'the original sequence has no B-roll');
// running again on the copy: the spots are covered now
await T.open(r.copy.id);
const again = US.broll.findSpots(await US.host.call('sequenceInfo', { seqId: r.copy.id }), { mode: 'jump' });
T.assert(again.spots.length === 0 && again.skipped.covered === 2, 'already covered spots are skipped');
return { summary: r.summary, shots: r.shots.map(s => `${s.name.slice(0, 4)} ${s.in.toFixed(1)}–${s.out.toFixed(1)} @${s.at}`) };
