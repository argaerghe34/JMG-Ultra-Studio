// resolve/host/story.js against the stand-in Resolve (dev/tests/resolve-fake.js): transcripts from Resolve's subtitles,
// placing lines, theme names and highlights as range markers, where Story travels with a Resolve project, captions,
// cueing – and the panel's own player for Resolve (js/core/host.js cue()).
'use strict';
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path');
const { test, load } = require('./harness');
const Fake = require('./resolve-fake');
const HOST = require('../../resolve/host');
const { LABEL_MARKER } = require('../../resolve/host/story');

/**
 * The fake has no subtitle tracks: add them, plus CreateSubtitlesFromAudio (one caption per F.speech[file] entry
 * [text, startSec, endSec] in media time that the audio on track 1 covers) and subtitle files in AppendToTimeline
 * (F.media[srt].cues = [[startSec, endSec, text]]; F.subtitleShift moves them, F.subtitleRefused places nothing).
 */
function withSubtitles(F) {
  F.speech = {}; F.transcribing = new Set(); F.transcribeDelay = 30;
  // deleting a timeline Resolve is still transcribing into crashes it (Resolve 21.1.2, 28 Oct 2026)
  const delTl = F.pool.DeleteTimelines;
  F.pool.DeleteTimelines = tls => { for (const t of [].concat(tls)) if (F.transcribing.has(t)) { F.crashes.push('DeleteTimelines while transcribing ' + t.GetName()); throw new Error('Resolve would crash: timeline deleted while transcribing'); } return delTl(tls); };
  const subItem = (tl, track, start, end, text) => {
    const it = { _type: 'subtitle', _track: track, _start: start, _end: end, _id: 'sub-' + Math.random().toString(36).slice(2) };
    Object.assign(it, { GetName: () => text, GetStart: () => it._start, GetEnd: () => it._end, GetUniqueId: () => it._id, GetTrackTypeAndIndex: () => ['subtitle', track], GetMediaPoolItem: () => null });
    tl._s[track - 1].push(it);
    return it;
  };
  const wrap = tl => {
    if (!tl || tl._s) return tl;
    tl._s = [];
    const count = tl.GetTrackCount, list = tl.GetItemListInTrack, add = tl.AddTrack, del = tl.DeleteTrack, delClips = tl.DeleteClips;
    tl.GetTrackCount = t => (t === 'subtitle' ? tl._s.length : count(t));
    tl.GetItemListInTrack = (t, i) => (t === 'subtitle' ? (tl._s[i - 1] || []).slice().sort((a, b) => a._start - b._start) : list(t, i));
    tl.AddTrack = (t, ...x) => (t === 'subtitle' ? (tl._s.push([]), true) : add(t, ...x));
    tl.DeleteTrack = (t, i) => (t === 'subtitle' ? (tl._s.splice(i - 1, 1), true) : del(t, i));
    tl.SetTrackName = ((orig) => (t, i, n) => { if (t === 'subtitle') { tl._sName = Object.assign(tl._sName || {}, { [i]: n }); return true; } return orig(t, i, n); })(tl.SetTrackName);
    tl.DeleteClips = (items, ripple) => {
      for (const tr of tl._s) for (const it of items) { const k = tr.indexOf(it); if (k >= 0) tr.splice(k, 1); }
      return delClips(items.filter(i => i._type !== 'subtitle'), ripple);
    };
    // like Resolve 21.1.2: it transcribes in the background – the subtitles arrive F.transcribeDelay ms later, all
    // together – and a settings dict it can't read (e.g. {}) throws "GetArgument" though it starts anyway
    tl.CreateSubtitlesFromAudio = (...args) => {
      F.log.push(['CreateSubtitlesFromAudio', args[0]]);
      if (F.transcribeFails) return false;
      const a = tl.GetItemListInTrack('audio', 1)[0];
      if (!a) return false;
      const fps = Number(tl.GetSetting('timelineFrameRate')), file = a._mpi._file;
      const subs = (F.transcribeSilent ? [] : F.speech[file] || []).map(([text, s, e]) => [text, Math.round(s * fps), Math.round(e * fps)])
        .filter(([, f0, f1]) => f0 >= a._srcStart && f1 <= a._srcStart + (a._end - a._start));
      F.transcribing.add(tl);
      setTimeout(() => {
        F.transcribing.delete(tl);
        if (!F.timelines.includes(tl)) return;
        if (!tl._s.length) tl._s.push([]);
        for (const [text, f0, f1] of subs) subItem(tl, 1, a._start + f0 - a._srcStart, a._start + f1 - a._srcStart, text);
      }, F.transcribeDelay);
      if (args.length && args[0] && typeof args[0] === 'object' && Object.keys(args[0]).every(k => !/^\d+$/.test(k))) throw new Error('CreateSubtitlesFromAudio: GetArgument - Unknown object type detected for key:0');
      return true;
    };
    return tl;
  };
  F.timelines.forEach(wrap);
  const create = F.pool.CreateEmptyTimeline, append = F.pool.AppendToTimeline;
  F.pool.CreateEmptyTimeline = n => wrap(create(n));
  F.pool.AppendToTimeline = clips => {
    const list = [].concat(clips), tl = F.currentTimeline;
    const isSub = c => { const it = c && c.mediaPoolItem ? c.mediaPoolItem : c; return it && it._m && it._m.type === 'Subtitle'; };
    if (!list.some(isSub)) return append(clips);
    if (F.subtitleRefused) return [];
    const out = [];
    for (const c of list) {
      const it = c.mediaPoolItem || c, track = c.trackIndex || 1, fps = Number(tl.GetSetting('timelineFrameRate'));
      while (tl._s.length < track) tl._s.push([]);
      const at = (c.recordFrame != null ? c.recordFrame : tl._start) + Math.round((F.subtitleShift || 0) * fps);
      for (const [s, e, text] of it._m.cues || []) out.push(subItem(tl, track, at + Math.round(s * fps), at + Math.round(e * fps), text));
    }
    return out;
  };
  return F;
}
function setup(opts) {
  const F = withSubtitles(Fake.make(opts));
  const host = HOST.connect({ api: F.resolve });
  host.R.transcribeTiming = { poll: 5, settle: 40, max: () => 400 };   // quick, in step with F.transcribeDelay
  const run = async (name, args) => { const r = await host.run(name, args); if (!r.ok) throw Object.assign(new Error(`${name}: ${r.error.code} ${r.error.detail}`), { res: r }); return r.data; };
  const fail = async (name, args) => { const r = await host.run(name, args); assert.ok(!r.ok, name + ' should fail'); return r.error; };
  return { F, host, run, fail };
}
const near = (a, b, msg, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${msg || ''} ${a} ≠ ${b}`);
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'us-rstory-'));
const touch = f => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, 'x'); return f; };

test('resolve story: every Story command is there', () => {
  const { host } = setup();
  for (const n of ['storyClips', 'storyTiming', 'storyCue', 'storyStop', 'storyPlace', 'storyThemeLayers', 'storyHighlights', 'storyRemoveHighlights', 'storySequenceTiming', 'storyProjectFile', 'storyCaptions', 'storyTranscribe', 'storyDropSwap', 'storyPlaceAtPlayhead', 'storySourceRange'])
    assert.strictEqual(typeof host.fns[n], 'function', n);
});

test('resolve story: storyClips – media only, by path, the selection, subclips flagged', async () => {
  const { F, run } = setup();
  const a = F.addMedia('/m/Int A.mp4', { frames: 2500, bin: 'Interviews' }), b = F.addMedia('/m/Int B.mov', { frames: 1000 });
  const sub = F.resolve.GetMediaStorage().AddItemListToMediaPool([{ media: '/m/Int A.mp4', startFrame: 100, endFrame: 499 }])[0];
  F.addTimeline('Cut', [{ item: a, in: 0, out: 100 }]);
  const all = await run('storyClips', {});
  assert.deepStrictEqual(all.map(c => c.path).sort(), ['/m/Int A.mp4', '/m/Int A.mp4', '/m/Int B.mov'], 'no timelines');
  const ia = all.find(c => c.id === a.GetUniqueId());
  assert.strictEqual(ia.bin, 'Interviews'); assert.strictEqual(ia.sub, false); assert.strictEqual(ia.name, 'Int A.mp4');
  assert.strictEqual(all.find(c => c.id === sub.GetUniqueId()).sub, true);
  assert.deepStrictEqual((await run('storyClips', { paths: ['/m/Int B.mov'] })).map(c => c.id), [b.GetUniqueId()]);
  F.selected = [b, F.timelines[0].GetMediaPoolItem()];
  assert.deepStrictEqual((await run('storyClips', { selected: true })).map(c => c.id), [b.GetUniqueId()]);
  // Resolve can hand the selection back as a numbered dict; the bin comes with it
  const keep = F.pool.GetSelectedClips;
  F.pool.GetSelectedClips = () => ({ 1: a, 2: b });
  const got = await run('storyClips', { selected: true });
  assert.deepStrictEqual(got.map(c => c.id), [a.GetUniqueId(), b.GetUniqueId()]);
  assert.strictEqual(got[0].bin, 'Interviews');
  F.pool.GetSelectedClips = () => { throw new Error('refused'); };
  assert.deepStrictEqual(await run('storyClips', { selected: true }), [], 'a refusal is no selection, not an error');
  F.pool.GetSelectedClips = keep;
});

test('resolve story: storyTiming – start timecode, frame rate, drop frame, sound only', async () => {
  const { F, run } = setup();
  const a = F.addMedia('/m/A.mp4', { fps: 25 }), d = F.addMedia('/m/D.mov', { fps: 29.97 }), w = F.addMedia('/m/W.wav', { type: 'Audio', fps: 25 });
  const props = (it, extra) => { const o = it._props; it._props = () => Object.assign(o(), extra); };
  props(a, { 'Start TC': '10:00:00:00' }); props(d, { 'Start TC': '01:00:00;00' });
  const t = await run('storyTiming', { ids: [a.GetUniqueId(), d.GetUniqueId(), w.GetUniqueId(), 'gone'] });
  assert.deepStrictEqual(t[a.GetUniqueId()], { fps: 25, drop: false, start: 36000, audioOnly: false });
  assert.strictEqual(t[d.GetUniqueId()].drop, true); near(t[d.GetUniqueId()].start, 107892 / 29.97, 'drop-frame start');
  assert.strictEqual(t[w.GetUniqueId()].audioOnly, true); assert.strictEqual(t[w.GetUniqueId()].start, 0);
  assert.ok(!('gone' in t));
});

test('resolve story: storyTranscribe waits for Resolve’s background subtitles, reads them in media seconds, leaves Resolve as it was', async () => {
  const { F, host, run, fail } = setup();
  const file = touch(path.join(tmp(), 'Ruth.mp4')), a = F.addMedia(file, { frames: 25 * 60 });
  F.speech[file] = [['I grew up by the sea.', 1, 3.2], ['Ruth: My father fished.', 4, 6], ['- And we never left.', 30, 33]];
  const keep = F.addTimeline('My edit', [{ item: a, in: 0, out: 50 }]);
  F.pool.SetCurrentFolder(F.bin('Interviews'));
  const before = F.timelines.length;
  const r = await run('storyTranscribe', { id: a.GetUniqueId() });
  assert.strictEqual(r.name, 'Ruth.mp4'); assert.strictEqual(r.path, file);
  assert.deepStrictEqual(r.items, [{ text: 'I grew up by the sea.', start: 1, end: 3.2 }, { text: 'Ruth: My father fished.', start: 4, end: 6 }, { text: '- And we never left.', start: 30, end: 33 }]);
  assert.strictEqual(F.timelines.length, before, 'scratch timeline deleted');
  assert.strictEqual(F.currentTimeline, keep, 'current timeline back');
  assert.strictEqual(F.pool.GetCurrentFolder().GetName(), 'Interviews', 'Media Pool folder back');
  const names = []; (function walk(f, p) { for (const s of f.GetSubFolderList()) { names.push(p + s.GetName()); walk(s, p + s.GetName() + '/'); } })(F.root, '');
  assert.ok(!names.includes('JMG Ultra Studio/.scratch'), 'scratch bin gone: ' + names);
  assert.ok(F.log.some(l => l[0] === 'CreateSubtitlesFromAudio'));
  // a subclip: times stay in the media's seconds
  const sub = F.resolve.GetMediaStorage().AddItemListToMediaPool([{ media: file, startFrame: 25 * 20, endFrame: 25 * 40 - 1 }])[0];
  const rs = await run('storyTranscribe', { id: sub.GetUniqueId() });
  assert.deepStrictEqual(rs.items.map(x => [x.start, x.end]), [[30, 33]]);
  // the panel turns them into segments (no word timings; speakers split off)
  const T = load(['transcript']).transcript;
  const segs = T.fromSubtitles(r.items);
  assert.deepStrictEqual(segs.map(s => [s.speaker, s.text, s.start]), [['', 'I grew up by the sea.', 1], ['Ruth', 'My father fished.', 4], ['', 'And we never left.', 30]]);
  assert.ok(segs.every(s => !s.w));
  // what Resolve writes when it hears music, not words, isn't a line
  assert.deepStrictEqual(T.fromSubtitles([{ text: '[MUSIC]', start: 0, end: 13 }, { text: '[MUSIC] [MUSIC]', start: 60, end: 88 }, { text: '♪ (applause) Thank you all.', start: 90, end: 92 }, { text: '[Ruth]: Hello.', start: 93, end: 94 }]).map(s => [s.speaker, s.text]), [['', 'Thank you all.'], ['Ruth', 'Hello.']]);
  const lines = T.toLines(segs, 'k');
  assert.ok(lines.length >= 2 && lines.every(l => l.id.startsWith('k-')));
  assert.strictEqual(T.wordTimes(lines[0]).exact, false, 'words are spread evenly');
  // failures are plain and still clean up
  F.transcribeFails = true;
  const e = await fail('storyTranscribe', { id: a.GetUniqueId() });
  assert.strictEqual(e.code, 'HOST_SCRIPT'); assert.ok(/transcribe/.test(e.title));
  assert.strictEqual(F.timelines.length, before); assert.strictEqual(F.currentTimeline, keep);
  const s = F.addMedia(touch(path.join(tmp(), 'still.png')), { type: 'Still', audioCh: 0 });
  assert.strictEqual((await fail('storyTranscribe', { id: s.GetUniqueId() })).code, 'NO_AUDIO');
  delete F.transcribeFails;
  // nothing heard (or Resolve still busy): its timeline is left alone – deleting it would crash Resolve – and goes on
  // a later run once it's an hour old
  F.transcribeSilent = true; F.transcribeDelay = 600;
  const e2 = await fail('storyTranscribe', { id: a.GetUniqueId() });
  assert.ok(/hasn’t finished/.test(e2.title), e2.title);
  const left = F.timelines.filter(t => /^Ultra Studio transcribe \d+$/.test(t.GetName()));
  assert.strictEqual(left.length, 1, 'left in the .scratch bin'); assert.strictEqual(F.currentTimeline, keep);
  await new Promise(r => setTimeout(r, 700));
  F.transcribeSilent = false; F.transcribeDelay = 30;
  host.R.transcribeTiming.now = () => Date.now() + 2 * 3600e3;
  await run('storyTranscribe', { id: a.GetUniqueId() });
  assert.strictEqual(F.timelines.length, before, 'the old one is cleared too');
  assert.deepStrictEqual(F.crashes, []);
});

test('resolve story: storyPlace – lines one after another, coloured on the timeline only', async () => {
  const { F, run } = setup();
  const a = F.addMedia('/m/A.mp4', { frames: 2500 }), b = F.addMedia('/m/B.mp4', { frames: 2500 });
  a.SetClipColor('Green');
  const tl = F.addTimeline('Story');
  const r = await run('storyPlace', { seqId: tl.GetUniqueId(), cursor: 0, method: 'relabel', clips: [{ id: a.GetUniqueId(), in: 10, out: 14, label: 1 }, { id: b.GetUniqueId(), in: 2, out: 3.6, label: null }, { id: a.GetUniqueId(), in: 40, out: 42, label: 15 }] });
  assert.deepStrictEqual(r.placed, [{ start: 0, end: 4 }, { start: 4, end: 5.6 }, { start: 5.6, end: 7.6 }]);
  near(r.cursor, 7.6);
  const v = tl.GetItemListInTrack('video', 1), au = tl.GetItemListInTrack('audio', 1);
  assert.deepStrictEqual(v.map(i => [i._start - tl._start, i._end - tl._start, i._srcStart]), [[0, 100, 250], [100, 140, 50], [140, 190, 1000]]);
  assert.deepStrictEqual(v.map(i => i._color), ['Navy', '', 'Yellow']);
  assert.deepStrictEqual(au.map(i => i._color), ['Navy', '', 'Yellow'], 'its sound too');
  assert.strictEqual(a.GetClipColor(), 'Green', 'the source clip keeps its own colour');
  // from the end when no cursor
  const r2 = await run('storyPlace', { seqId: tl.GetUniqueId(), clips: [{ id: b.GetUniqueId(), in: 0, out: 1 }] });
  assert.deepStrictEqual(r2.placed, [{ start: 7.6, end: 8.6 }]);
});

test('resolve story: storyDropSwap – the dragged stand-in becomes the lines, video and audio, where it landed', async () => {
  const { F, run } = setup();
  const a = F.addMedia('/m/A.mp4', { frames: 2500 }), stand = F.addMedia('/tmp/JMG Ultra Studio/drag/Ruth 0.12 x1.wav', { type: 'Audio', frames: 150 });
  const tl = F.addTimeline('Cut', [{ item: a, in: 0, out: 100 }]);
  assert.deepStrictEqual(await run('storyDropSwap', { path: '/tmp/other.wav', clips: [{ id: a.GetUniqueId(), in: 1, out: 2 }] }), { found: false }, 'nothing dropped yet');
  // dropped on A2 at 10 s
  tl.AddTrack('audio', 'stereo');
  F.pool.AppendToTimeline([{ mediaPoolItem: stand, startFrame: 0, endFrame: 150, trackIndex: 2, recordFrame: tl._start + 250, mediaType: 2 }]);
  const r = await run('storyDropSwap', { path: '/tmp/JMG Ultra Studio/drag/Ruth 0.12 x1.wav', clips: [{ id: a.GetUniqueId(), in: 12, out: 16 }, { id: a.GetUniqueId(), in: 40, out: 42 }] });
  assert.strictEqual(r.found, true); near(r.start, 10); near(r.end, 16); assert.strictEqual(r.track, 1);
  const v = tl.GetItemListInTrack('video', 2), au = tl.GetItemListInTrack('audio', 2);
  assert.deepStrictEqual(v.map(i => [i._start - tl._start, i._end - tl._start, i._srcStart]), [[250, 350, 300], [350, 400, 1000]], 'the picture, cut to each line');
  assert.deepStrictEqual(au.map(i => i.GetMediaPoolItem()), [a, a], 'its sound, and the stand-in is gone');
  assert.ok(stand._dead, 'the stand-in left the Media Pool');
});

test('resolve story: lines at the playhead (overwrite, in their colour, playhead moves on) and the Source Viewer stand-in', async () => {
  const { F, run } = setup();
  const a = F.addMedia('/m/A.mp4', { frames: 2500 });
  const tl = F.addTimeline('Cut', [{ item: a, in: 0, out: 500 }]);
  const TC = f => { const n = f, fr = n % 25, sec = Math.floor(n / 25); return [Math.floor(sec / 3600), Math.floor(sec / 60) % 60, sec % 60, fr].map(x => String(x).padStart(2, '0')).join(':'); };
  let tc = TC(tl._start + 200);
  tl.GetCurrentTimecode = () => tc; tl.SetCurrentTimecode = x => { tc = x; return true; };
  const r = await run('storyPlaceAtPlayhead', { clips: [{ id: a.GetUniqueId(), in: 30, out: 32, label: 7 }, { id: a.GetUniqueId(), in: 50, out: 51 }], mode: 'insert' });
  assert.strictEqual(r.mode, 'overwrite', 'Resolve has no insert by script');
  near(r.start, 8); near(r.end, 11);
  assert.strictEqual(r.track, 1, 'V1/A1 are taken at the playhead: the next free pair');
  const v = tl.GetItemListInTrack('video', 2);
  assert.deepStrictEqual(v.map(i => [i._start - tl._start, i._srcStart, i._color]), [[200, 750, 'Orange'], [250, 1250, '']], 'one after another from the playhead, the first in its colour');
  assert.strictEqual(tl.GetItemListInTrack('video', 1).length, 1, 'the clip underneath is left alone');
  assert.strictEqual(tc, TC(tl._start + 275), 'the playhead is after them');
  const s = await run('storySourceRange', { id: a.GetUniqueId(), in: 12, out: 16 });
  assert.strictEqual(s.selected, true);
  assert.deepStrictEqual(a.GetMarkInOut().video, { in: 300, out: 400 }, 'In and Out marked on the clip');
  assert.deepStrictEqual(F.selected, [a]);
});

test('resolve story: theme names and highlights are range markers – replaced on re-run, others left alone', async () => {
  const { F, run } = setup();
  const a = F.addMedia('/m/A.mp4', { frames: 25 * 600 });
  const tl = F.addTimeline('String-out', [{ item: a, in: 0, out: 25 * 600 }]);
  tl.AddMarker(250, 'Red', 'Mine', '', 1, '');   // the editor's own, at 10 s
  const id = tl.GetUniqueId();
  const t = await run('storyThemeLayers', { seqId: id, sections: [{ name: 'Family', start: 0, end: 30, label: 1 }, { name: 'Faith', start: 30, end: 45.5, label: null }, { name: 'none', start: 50, end: 50 }] });
  assert.deepStrictEqual([t.kind, t.track, t.placed, t.renamed], ['markers', -1, 2, 2]);
  let m = tl._markers; // real frames (GetMarkers reads one early, like Resolve)
  assert.deepStrictEqual([m[0].name, m[0].color, m[0].duration], ['Family', LABEL_MARKER[1], 750], 'frame 0 = the timeline’s first frame');
  assert.deepStrictEqual([m[750].name, m[750].color, m[750].duration], ['Faith', 'Purple', Math.round(15.5 * 25)]);
  const h = await run('storyHighlights', { seqId: id, trackName: 'Selects', sections: [{ name: 'Family · Faith', start: 10, end: 12, label: 15 }, { name: 'Faith', start: 0, end: 2, label: 6 }] });
  assert.deepStrictEqual([h.kind, h.placed, h.removed, h.named], ['markers', 2, 0, true]);
  m = tl._markers;
  assert.strictEqual(m[250].name, 'Mine', 'the editor’s marker stays');
  assert.deepStrictEqual([m[251].name, m[251].color, m[251].duration], ['Family · Faith', 'Yellow', 49], 'moved on a frame, still ends on time');
  assert.deepStrictEqual([m[1].name, m[1].color], ['Faith', 'Rose'], 'beside the theme marker');
  const again = await run('storyHighlights', { seqId: id, sections: [{ name: 'Only', start: 100, end: 101, label: 2 }] });
  assert.strictEqual(again.removed, 2);
  m = tl._markers;
  assert.deepStrictEqual(Object.values(m).map(x => x.name).sort(), ['Faith', 'Family', 'Mine', 'Only']);
  assert.deepStrictEqual(await run('storyRemoveHighlights', { seqId: id, trackName: 'Selects' }), { removed: 1, track: -1 });
  assert.deepStrictEqual(Object.values(tl.GetMarkers()).map(x => x.name).sort(), ['Faith', 'Family', 'Mine'], 'theme names stay');
  // theme names again: the old ones replaced
  await run('storyThemeLayers', { seqId: id, sections: [{ name: 'Work', start: 5, end: 6 }] });
  assert.deepStrictEqual(Object.values(tl.GetMarkers()).map(x => x.name).sort(), ['Mine', 'Work']);
});

test('resolve story: storySequenceTiming', async () => {
  const { F, run } = setup();
  const tl = F.addTimeline('T');
  assert.deepStrictEqual(await run('storySequenceTiming', { seqId: tl.GetUniqueId() }), { zero: 3600, fps: 25, drop: false, displayFormat: 0, name: 'T' });
  tl.SetSetting('timelineDropFrameTimecode', '1');
  assert.strictEqual((await run('storySequenceTiming', { seqId: tl.GetUniqueId() })).drop, true);
});

test('resolve story: storyProjectFile – Story travels next to the project’s media', async () => {
  const dir = tmp(), US = load(['js/tools/22-story-sync.js']);
  const { F, run } = setup({ projectName: 'Docs: Harbour/2026' });
  // no media yet: kept on this computer
  assert.deepStrictEqual(await run('storyProjectFile', {}), { path: '', name: 'Docs: Harbour/2026', id: 'project-1', folder: '', found: false, reason: 'nomedia' });
  const proj = path.join(dir, 'Harbour');
  for (const f of ['Cards/A001/C0001.MP4', 'Cards/A001/C0002.MP4', 'Cards/B001/C0001.MP4', 'Audio/Ruth.wav']) F.addMedia(touch(path.join(proj, f)));
  F.addMedia('/Volumes/Elsewhere/music.wav', { type: 'Audio' });   // one stray file on another drive doesn't count
  let r = await run('storyProjectFile', {});
  assert.strictEqual(r.folder, proj, 'the deepest folder holding the media');
  assert.strictEqual(r.path, path.join(proj, 'Docs- Harbour-2026'));
  assert.strictEqual(r.found, false); assert.strictEqual(r.reason, '');
  // the panel's sync module puts the copy here
  const shared = US.storySync.sharedFile(r.path);
  assert.strictEqual(shared, path.join(proj, 'JMG Ultra Studio', 'Docs- Harbour-2026 – Story.json'));
  // a Story file already there, deeper (media added elsewhere later): found and kept
  const deeper = path.join(proj, 'Cards');
  touch(path.join(deeper, 'JMG Ultra Studio', 'Docs- Harbour-2026 – Story.json'));
  r = await run('storyProjectFile', {});
  assert.deepStrictEqual([r.folder, r.found], [deeper, true]);
  // the folder the panel remembered wins while it's there
  r = await run('storyProjectFile', { prefer: path.join(proj, 'Audio') });
  assert.strictEqual(r.folder, path.join(proj, 'Audio'));
  r = await run('storyProjectFile', { prefer: path.join(dir, 'gone') });
  assert.strictEqual(r.folder, deeper);
  // media straight in the home folder: not a project folder
  const G = setup({ projectName: 'Home' });
  G.F.addMedia(path.join(os.homedir(), 'a.mp4')); G.F.addMedia(path.join(os.homedir(), 'Movies-not-there', 'b.mp4'));
  const h = await G.run('storyProjectFile', {});
  assert.deepStrictEqual([h.path, h.reason], ['', 'nomedia']);
  // save asks Resolve to save
  const n = F.saved; await run('storyProjectFile', { save: true }); assert.strictEqual(F.saved, n + 1);
});

test('resolve story: storyCaptions – the SRT imported into the Captions bin, left to drag (Resolve 21.1 crashes if a script places it)', async () => {
  const dir = tmp(), srt = path.join(dir, 'Cut - subtitles captions.srt');
  fs.writeFileSync(srt, '1\n00:00:01,500 --> 00:00:03,000\nHello there\n\n2\n00:00:04,000 --> 00:00:05,000\nBye\n');
  const { F, run, fail } = setup();
  F.media[srt] = { type: 'Subtitle', frames: 125, cues: [[1.5, 3, 'Hello there'], [4, 5, 'Bye']] };
  const a = F.addMedia('/m/A.mp4');
  const tl = F.addTimeline('Cut', [{ item: a, in: 0, out: 125 }]), other = F.addTimeline('Other');
  F.project.SetCurrentTimeline(other);
  // like Resolve 21.1: asking a subtitle item for its clip properties brings Resolve down
  const importMedia = F.pool.ImportMedia;
  F.pool.ImportMedia = items => importMedia(items).map(it => { if (/\.srt$/i.test(it.GetName())) it.GetClipProperty = () => { throw new Error('Resolve crashed: GetMediaFrameExtentsWithFrameRate'); }; return it; });
  const r = await run('storyCaptions', { seqId: tl.GetUniqueId(), srt, binPath: 'JMG Ultra Studio/Story/Captions' });
  assert.deepStrictEqual([r.added, r.track, r.reason], [false, -1, 'drag']);
  assert.strictEqual(tl.GetTrackCount('subtitle'), 0, 'nothing placed by script');
  assert.strictEqual(F.currentTimeline, other, 'Resolve left on the timeline it was on');
  const imported = F.bin('JMG Ultra Studio/Story/Captions').GetClipList();
  assert.deepStrictEqual(imported.map(i => i.GetUniqueId()), [r.itemId]);
  // the Media Pool can be listed with it there: its properties are never asked for
  const bins = await run('listBins');
  const capBin = bins.find(b => /Captions$/.test(b.path));
  const items = await run('binItems', { binId: capBin.id, kinds: [], recursive: true });
  assert.ok(Array.isArray(items));
  assert.strictEqual((await fail('storyCaptions', { seqId: tl.GetUniqueId(), srt: path.join(dir, 'missing.srt') })).code, 'NOT_FOUND');
});

test('resolve story: storyCue selects the clip and says where its media is; storyStop stops the panel’s player', async () => {
  const { F, run, fail } = setup();
  const a = F.addMedia('/m/A.mp4'); a.LinkProxyMedia('/p/A_proxy.mov');
  const r = await run('storyCue', { id: a.GetUniqueId(), seconds: 12.5, play: true });
  assert.deepStrictEqual(F.selected, [a]);
  assert.deepStrictEqual([r.position, r.loaded, r.path, r.proxy, r.name, r.hasVideo], [12.5, a.GetUniqueId(), '/m/A.mp4', '/p/A_proxy.mov', 'A.mp4', true]);
  assert.deepStrictEqual(r.timing, { fps: 25, drop: false, start: 0, audioOnly: false });
  assert.strictEqual((await fail('storyCue', { id: 'nope', seconds: 0 })).code, 'NOT_FOUND');
  const keep = global.US; let stopped = 0;
  global.US = { host: { cue: Object.assign(() => {}, { stop: () => stopped++ }) } };
  try { assert.strictEqual(await run('storyStop', {}), true); } finally { global.US = keep; }
  assert.strictEqual(stopped, 1);
});

test('resolve story: the panel plays a line itself in Resolve (cue), toggles, falls back and says so once', async () => {
  const US = load([]);
  const els = [], toasts = [], calls = [];
  // file URLs as the panel makes them (file:///C:/m/… on Windows)
  const href = p => require('url').pathToFileURL(p).href, bad = new Set([href('/m/ProRes.mov')]);
  const fakeAudio = () => {
    const el = { paused: true, readyState: 0, duration: 60, currentTime: 0, _src: '', played: [] };
    Object.defineProperty(el, 'src', { get: () => el._src, set: v => { el._src = v; el.readyState = 0; } });
    el.load = () => setTimeout(() => { if (bad.has(el._src)) { el.onerror && el.onerror(); } else { el.readyState = 1; el.onloadedmetadata && el.onloadedmetadata(); } }, 1);
    el.play = () => { el.paused = false; el.played.push([el._src, el.currentTime]); return Promise.resolve(); };
    el.pause = () => { el.paused = true; };
    els.push(el); return el;
  };
  const media = { a: { path: '/m/A.mp4', proxy: '', name: 'A.mp4' }, p: { path: '/m/ProRes.mov', proxy: '/m/proxy.mp4', name: 'ProRes.mov' }, x: { path: '/m/ProRes.mov', proxy: '', name: 'ProRes.mov' } };
  const keep = { is: US.app.is, call: US.host.call, ce: document.createElement, toast: US.ui.toast };
  US.app.is = w => w === 'resolve';
  US.host.call = async (fn, args) => { calls.push([fn, args]); return Object.assign({ position: args.seconds, timing: { start: 0, fps: 25 }, loaded: args.id }, media[args.id]); };
  document.createElement = tag => (tag === 'audio' ? fakeAudio() : keep.ce(tag));
  US.ui.toast = t => toasts.push(t);
  try {
    let r = await US.host.cue('a', 12, { play: true });
    assert.deepStrictEqual([r.playing, r.landed, r.player, r.file], [true, true, 'panel', '/m/A.mp4']);
    assert.deepStrictEqual(calls[0], ['storyCue', { id: 'a', seconds: 12, play: true, open: true }]);
    assert.strictEqual(els.length, 1); assert.deepStrictEqual(els[0].played, [[href('/m/A.mp4'), 12]]);
    // the same line again: stops
    r = await US.host.cue('a', 12, { play: true });
    assert.strictEqual(r.playing, false); assert.strictEqual(els[0].paused, true);
    // another line of the same clip plays at once (already loaded)
    r = await US.host.cue('a', 30, { play: true });
    assert.strictEqual(r.playing, true); assert.deepStrictEqual(els[0].played[1], [href('/m/A.mp4'), 30]);
    // storyStop (Resolve side) reaches the panel's player
    US.host.cue.stop(); assert.strictEqual(els[0].paused, true);
    // a file Chromium can't decode: its proxy plays instead
    r = await US.host.cue('p', 5, { play: true });
    assert.deepStrictEqual([r.playing, r.file], [true, '/m/proxy.mp4']);
    assert.strictEqual(toasts.length, 0);
    // nothing playable: said once, plainly; the clip is selected in the Media Pool
    r = await US.host.cue('x', 5, { play: true });
    assert.deepStrictEqual([r.playing, r.landed, r.player], [false, false, 'none']);
    await US.host.cue('x', 9, { play: true });
    assert.strictEqual(toasts.length, 1); assert.ok(/can’t play/.test(toasts[0].title) && /Media Pool/.test(toasts[0].text), JSON.stringify(toasts[0]));
    // cue without play (Selects' "show this clip"): selects it and stops
    r = await US.host.cue('a', 3); assert.strictEqual(r.playing, false);
  } finally { US.app.is = keep.is; US.host.call = keep.call; document.createElement = keep.ce; US.ui.toast = keep.toast; }
});

test('resolve story: the Story panel in Resolve – Transcribe with Resolve, and where Story is kept (own Node)', () => {
  // the harness has the panel loaded as Premiere; Resolve's panel needs a fresh Node
  const out = require('child_process').execFileSync(process.execPath, [path.join(__dirname, 'resolve-story-panel.js')], { encoding: 'utf8', timeout: 60000 });
  assert.ok(/\bok\b/.test(out), out);
});

test('resolve story: Resolve 21.1’s own transcription is read word by word with speakers, made first when missing', async () => {
  const { F, host, run } = setup();
  const file = touch(path.join(tmp(), 'Ruth.mp4')), a = F.addMedia(file, { frames: 25 * 60 });
  const R = host.R, tm = { fps: 25, start: R.tcToFrames(String(a.GetClipProperty('Start TC') || '00:00:00:00'), 25) / 25 };
  const tc = s => R.framesToTC(Math.round((tm.start + s) * 25), 25);
  const w = (text, s, e) => ({ text, start: tc(s), end: tc(e) });
  const made = { language: 'en', segments: [
    { start: tc(1), end: tc(3), text: 'I grew up by the sea.', speaker: 'Ruth', words: [w('I', 1, 1.2), w('grew', 1.2, 1.6), w('up', 1.6, 1.8), w('(...)', 1.8, 2), w('by', 2, 2.2), w('the', 2.2, 2.4), w('sea.', 2.4, 3)] },
    { start: tc(10), end: tc(12), text: 'And you stayed?', speaker: 'Interviewer', words: [w('And', 10, 10.4), w('you', 10.4, 10.8), w('stayed?', 10.8, 12)] }
  ] };
  // a clip Resolve has transcribed already: read, nothing made, no scratch timeline
  a.GetTranscription = () => made;
  const before = F.timelines.length;
  const r = await run('storyTranscribe', { id: a.GetUniqueId() });
  assert.strictEqual(r.how, 'read');
  assert.deepStrictEqual(r.words.map(x => [x.w, x.t, x.speaker]).slice(0, 4), [['I', 1, 'Ruth'], ['grew', 1.2, 'Ruth'], ['up', 1.6, 'Ruth'], ['by', 2, 'Ruth']], 'silences left out, media seconds');
  assert.strictEqual(F.timelines.length, before);
  assert.ok(!F.log.some(l => l[0] === 'CreateSubtitlesFromAudio'));
  // the panel: sentences with exact word times and the speakers
  const T = load(['transcript']).transcript;
  const segs = T.wordsToSentences(r.words);
  assert.deepStrictEqual(segs.map(s => [s.speaker, s.text]), [['Ruth', 'I grew up by the sea.'], ['Interviewer', 'And you stayed?']]);
  assert.ok(T.wordTimes(T.toLines(segs, 'k')[0]).exact, 'word times are exact');
  // none yet: TranscribeAudio (with speakers), then read once Resolve says it's done
  let calls = 0, ready = false;
  a.GetTranscription = () => (ready ? made : {});
  a.TranscribeAudio = sp => { calls++; assert.strictEqual(sp, true); setTimeout(() => { ready = true; }, 20); return true; };
  const pr = F.resolve.GetProjectManager().GetCurrentProject();
  pr.GetTranscribeAudioStatus = () => ({ JobStatus: ready ? 'Complete' : 'Analyzing' });
  const r2 = await run('storyTranscribe', { id: a.GetUniqueId() });
  assert.strictEqual(r2.how, 'transcribed'); assert.strictEqual(calls, 1); assert.strictEqual(r2.words.length, 9);
  // Resolve refuses: the subtitle way, as before
  a.TranscribeAudio = () => false; ready = false;
  F.speech[file] = [['From the subtitles.', 1, 3]];
  const r3 = await run('storyTranscribe', { id: a.GetUniqueId() });
  assert.ok(!r3.words); assert.deepStrictEqual(r3.items.map(x => x.text), ['From the subtitles.']);
});

test('resolve story: sources – clips, multicam clips and timelines (their clips on switched-on tracks), and which Resolve has transcribed', async () => {
  const { F, run } = setup();
  const a = F.addMedia('/m/Cam A.mov', { frames: 2500 }), b = F.addMedia('/m/Cam B.mov', { frames: 2500 }), w = F.addMedia('/m/Lav.wav', { type: 'Audio', frames: 2500 });
  const tl = F.addTimeline('Interview synced', [{ item: a, in: 0, out: 2500 }, { item: b, in: 0, out: 2500, track: 2, mediaType: 1 }, { item: w, in: 0, out: 2500, track: 2, mediaType: 2 }]);
  tl._vOn = [true, false];   // V2 (Cam B) switched off
  a.GetTranscription = () => ({ segments: [{ start: '00:00:01:00', end: '00:00:02:00', text: 'Hello.', words: [{ text: 'Hello.', start: '00:00:01:00', end: '00:00:02:00' }] }] });
  const src = await run('storySources', { check: true });
  const by = n => src.find(s => s.name === n);
  assert.strictEqual(by('Interview synced').kind, 'timeline');
  assert.deepStrictEqual(by('Interview synced').members.sort(), [a.GetUniqueId(), w.GetUniqueId()].sort(), 'Cam B is on a switched-off track');
  assert.strictEqual(by('Cam A.mov').transcribed, true); assert.strictEqual(by('Cam B.mov').transcribed, false);
  assert.strictEqual(by('Lav.wav').kind, 'audio');
  // reading never transcribes unless asked
  let asked = 0; b.TranscribeAudio = () => { asked++; return true; };
  const none = await run('storyReadTranscript', { id: b.GetUniqueId() });
  assert.ok(none.none); assert.strictEqual(asked, 0);
  const got = await run('storyReadTranscript', { id: a.GetUniqueId() });
  assert.strictEqual(got.how, 'read'); assert.deepStrictEqual(got.words.map(x => [x.w, x.t]), [['Hello.', 1]]);
});

test('resolve story: a timeline’s transcript is in timeline time, and its line lays every switched-on track between In and Out', async () => {
  const { F, run } = setup();
  const a = F.addMedia('/m/Cam A.mov', { frames: 2500 }), b = F.addMedia('/m/Cam B.mov', { frames: 2500 }), w = F.addMedia('/m/Lav.wav', { type: 'Audio', frames: 2500 });
  const src = F.addTimeline('Interview synced', [{ item: a, in: 100, out: 1100, at: 0 }, { item: b, in: 300, out: 1300, at: 0, track: 2, mediaType: 1 }, { item: w, in: 50, out: 1050, at: 0, track: 2, mediaType: 2 }]);
  const R = HOST.connect({ api: F.resolve }).R, fps = R.fps(src), tc = s => R.framesToTC(src.GetStartFrame() + Math.round(s * fps), fps);
  src._mpi.GetTranscription = nested => (nested ? {} : { segments: [{ start: tc(4), end: tc(6), text: 'We met in Haifa.', speaker: 'Ruth', words: [{ text: 'We', start: tc(4), end: tc(4.4) }, { text: 'met', start: tc(4.4), end: tc(5) }, { text: 'in', start: tc(5), end: tc(5.2) }, { text: 'Haifa.', start: tc(5.2), end: tc(6) }] }] });
  const id = src._mpi.GetUniqueId();
  const t = await run('storyReadTranscript', { id });
  assert.strictEqual(t.kind, 'timeline'); assert.strictEqual(t.path, '');
  assert.deepStrictEqual(t.words.map(x => x.t), [4, 4.4, 5, 5.2], 'seconds from the timeline’s first frame');
  // build: the line 4–6 s
  const out = F.addTimeline('Selects', []);
  const r = await run('storyPlace', { seqId: out.GetUniqueId(), clips: [{ id, in: 4, out: 6 }], cursor: 0 });
  assert.ok(r.placed[0], 'placed');
  const items = ['video', 'audio'].flatMap(type => [1, 2].flatMap(k => R.list(out.GetItemListInTrack(type, k)).map(ti => [type, k, ti.GetMediaPoolItem().GetName(), ti.GetSourceStartFrame(), ti.GetStart() - out.GetStartFrame(), ti.GetEnd() - ti.GetStart()])));
  const f = s => Math.round(s * fps);
  assert.deepStrictEqual(items.sort(), [
    ['audio', 1, 'Cam A.mov', 100 + f(4), 0, f(2)], ['audio', 2, 'Lav.wav', 50 + f(4), 0, f(2)],
    ['video', 1, 'Cam A.mov', 100 + f(4), 0, f(2)], ['video', 2, 'Cam B.mov', 300 + f(4), 0, f(2)]
  ].sort(), 'every track, the same In/Out, the same tracks');
  // a switched-off track stays out; playing the line plays the clip under it
  src._aOn = [true, false];
  const out2 = F.addTimeline('Selects 2', []);
  await run('storyPlace', { seqId: out2.GetUniqueId(), clips: [{ id, in: 4, out: 6 }], cursor: 0 });
  assert.strictEqual(R.list(out2.GetItemListInTrack('audio', 2)).length, 0, 'A2 switched off');
  const cue = await run('storyCue', { id, seconds: 5 });
  assert.strictEqual(cue.path, '/m/Cam A.mov'); near(cue.fileSeconds, 100 / fps + 5, 'media time of the clip under it', 0.05);
});
