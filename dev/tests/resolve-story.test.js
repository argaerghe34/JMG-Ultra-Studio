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
    tl.AddTrack = (t, x) => (t === 'subtitle' ? (tl._s.push([]), true) : add(t, x));
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
  for (const n of ['storyClips', 'storyTiming', 'storyCue', 'storyStop', 'storyPlace', 'storyThemeLayers', 'storyHighlights', 'storyRemoveHighlights', 'storySequenceTiming', 'storyProjectFile', 'storyCaptions', 'storyTranscribe'])
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
