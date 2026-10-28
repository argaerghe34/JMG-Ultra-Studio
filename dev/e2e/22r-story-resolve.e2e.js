// resolve-only
// Story in real Resolve – what 22-story / 22d / 22e check in Premiere through its XML export, checked here through
// Resolve itself: (1) a plain build from two themes; (2) every look option – clip colours on the timeline clips (not
// the source clip), ★ strongest first, theme names as range markers; (3) a line played in the panel; (4) highlights on
// a string-out as range markers, replaced and removed; (5) Transcribe with Resolve (its own subtitles, read back).
const S = US.story, fs = require('fs'), path = require('path');
const BIN = 'Test – Story', SEQ = 'Test – Story themes (Resolve)', SEQ2 = 'Test – Story look (Resolve)', SEQH = 'Test – Story highlights (Resolve)', HANDLES = 0.2;
const KEYS = ['story.binBase', 'story.handles', 'story.markers', 'story.themeNames', 'story.colourThemes', 'story.strongHighlight', 'story.strongFirst', 'story.strongLabel', 'story.colourMethod'];
const prev = Object.fromEntries(KEYS.map(k => [k, US.settings.get(k)]));
const setLook = o => { for (const [k, v] of Object.entries(o)) US.settings.set('story.' + k, v); };
setLook({ binBase: BIN, handles: HANDLES, markers: true, themeNames: 'marker', colourThemes: false, strongHighlight: false, strongFirst: false, strongLabel: 15, colourMethod: 'relabel' });
const st = S.loadState();
const saved = JSON.parse(JSON.stringify({ wall: st.wall, themes: st.themes, buildOff: st.buildOff, ownThemes: st.ownThemes, scope: st.scope, highlights: st.highlights, transcripts: st.transcripts }));
const theme = (id, name, label, ids) => ({ id, name, label, custom: true, picked: true, lineIds: ids, manual: ids.slice() });
st.buildOff = []; st.scope = { kind: 'all' };
async function fresh(name) { const old = await T.seqByName(name); if (old) await US.host.call('deleteSequence', { seqId: old.id }); }
async function seqInfo(name) { const s = await T.seqByName(name); T.assert(s, 'timeline ' + name); return US.host.call('sequenceInfo', { seqId: s.id }); }
// each video track's items with their clip colour, read from Resolve
const colours = async name => { const s = await T.seqByName(name); return T.devEval(`const t = R.needSeq(${JSON.stringify(s.id)}), out = []; for (let k = 1; k <= t.GetTrackCount('video'); k++) out.push(R.list(t.GetItemListInTrack('video', k)).map(ti => ({ start: R.tlSec(t, ti.GetStart()), end: R.tlSec(t, ti.GetEnd()), colour: String(ti.GetClipColor() || '') }))); return out;`); };
const RC = i => ['Violet', 'Navy', 'Teal', 'Purple', 'Blue', 'Olive', 'Pink', 'Orange', 'Purple', 'Blue', 'Teal', 'Pink', 'Tan', 'Green', 'Brown', 'Yellow'][i];   // resolve/host/base.js LABEL_COLORS
try {
  const [clip] = await T.importOnce([T.media('interview', 'I001_interview.mp4')], BIN);
  const colourBefore = (await US.host.call('itemInfo', { id: clip.id })).labelName;
  const job = US.jobs.testJob('story');
  await S.importFiles(job, [T.media('transcripts', 'I001_interview.srt')]);
  const real = p => { try { return fs.realpathSync(p); } catch (e) { return p; } };
  const tr = st.transcripts.find(t => t.path && real(t.path) === real(clip.path));
  T.assert(tr && tr.lines.length >= 12, 'transcript linked to the clip');
  const L = tr.lines;

  // 1. plain build
  st.themes = [theme('t1', 'Opening', 7, [L[0].id, L[1].id]), theme('t2', 'Legacy', 5, [L[L.length - 2].id, L[L.length - 1].id])];
  S.save(); await fresh(SEQ);
  const b = await T.action('story.build', { source: 'themes', name: SEQ });
  T.assert(/4 lines/.test(b.summary), 'build summary: ' + b.summary);
  const info = await seqInfo(SEQ), v = info.video[0].clips, a = info.audio[0].clips, fr = info.frame || 0.04;
  T.assert(v.length === 4 && a.length === 4, `4 video + 4 audio clips (got ${v.length} + ${a.length})`);
  [L[0], L[1], L[L.length - 2], L[L.length - 1]].forEach((l, i) => {
    T.near(v[i].in, Math.max(0, l.start - HANDLES), fr * 1.5, `clip ${i + 1} in`);
    T.near(v[i].out, Math.min(90, l.end + HANDLES), fr * 1.5, `clip ${i + 1} out`);
    if (i) T.near(v[i].start, v[i - 1].end, fr * 1.01, `clip ${i + 1} butts up to the previous one`);
  });
  T.assert(info.markers.map(m => m.name).join('|') === 'Opening|Legacy', 'theme markers: ' + info.markers.map(m => m.name).join('|'));

  // 2. every look option
  setLook({ colourThemes: true, strongHighlight: true, strongFirst: true, themeNames: 'both' });
  st.themes = [theme('t1', 'Opening', 7, L.slice(0, 4).map(l => l.id)), theme('t2', 'Faith & legacy', 5, L.slice(-4).map(l => l.id))];
  S.save();
  const expected = S.themeGroups().flatMap(g => S.strongestFirst(g.lineIds, g.pinned).map(id => ({ id, strong: S.isStrong(L.find(l => l.id === id)), label: g.label })));
  T.assert(expected.some(e => e.strong) && expected.some(e => !e.strong), 'the test themes need strong and ordinary lines');
  await fresh(SEQ2);
  const b2 = await T.action('story.build', { source: 'themes', name: SEQ2 });
  const i2 = await seqInfo(SEQ2), v2 = i2.video[0].clips;
  T.assert(v2.length === 8, 'all 8 lines placed: ' + v2.length);
  expected.forEach((e, k) => { const l = L.find(x => x.id === e.id); T.near(v2[k].in, Math.max(0, l.start - HANDLES), fr * 1.5, `look build clip ${k + 1} is ${e.strong ? 'a strong line' : 'in order'}`); });
  const c2 = (await colours(SEQ2))[0].map(c => c.colour), want = expected.map(e => RC(e.strong ? 15 : e.label));
  T.assert(c2.join('|') === want.join('|'), `timeline clip colours ${c2.join('|')} vs ${want.join('|')}`);
  const names = i2.markers.filter(m => m.name === 'Opening' || m.name === 'Faith & legacy');
  T.assert(names.length === 2 && names.every(m => m.end - m.start > 1), 'theme names as range markers: ' + JSON.stringify(names));
  T.near(names[0].start, v2[0].start, fr * 1.01, 'Opening starts with its first clip'); T.near(names[0].end, v2[3].end, fr * 1.01, 'Opening ends with its last clip');
  T.assert(i2.markers.filter(m => m.name === '★ Strongest').length === expected.filter(e => e.strong).length, 'a ★ marker per strong line');
  T.assert((await US.host.call('itemInfo', { id: clip.id })).labelName === colourBefore, 'the source clip keeps its own colour');

  // 3. a line played in the panel (Resolve's viewer can't be driven by a script)
  const cue = await US.host.cue(clip.id, L[2].start, { play: true });
  await T.sleep(500);
  T.assert(cue.player && cue.playing, 'played in the panel: ' + JSON.stringify(cue));
  await US.host.call('storyStop');

  // 4. highlights on a string-out: range markers, replaced, removed
  await fresh(SEQH);
  const seq = await US.host.call('newSequence', { name: SEQH, binPath: BIN, likeId: clip.id });
  await US.host.call('placeClips', { seqId: seq.id, cursor: 0, clips: [{ id: clip.id, in: 0, out: 90 }] });
  st.themes = []; st.wall = { columns: [], loose: [] }; st.builds = []; st.picky = { s: 0 }; st.highlights = {};
  S.newThemeFrom('Family', [L[0].id, L[1].id]); S.newThemeFrom('Work', [L[6].id]);
  S.ensureColours(); S.save();
  const h = await S.highlightStringOut(job, { seqId: seq.id, use: { themes: true, board: true, builds: true }, markers: true });
  const ih = await US.host.call('sequenceInfo', { seqId: seq.id });
  T.assert(h.sections.length === 3 && ih.markers.length === 3, `three highlights as markers: ${h.sections.length} / ${ih.markers.length}`);
  h.sections.forEach((x, i) => { T.near(ih.markers[i].start, x.start, fr * 1.5, `highlight ${i + 1} start`); T.near(ih.markers[i].end, x.end, fr * 1.5, `highlight ${i + 1} end`); });
  st.themes = st.themes.filter(t => t.name === 'Family'); S.save();
  const h2 = await S.highlightStringOut(job, { seqId: seq.id, use: { themes: true, board: true, builds: true }, markers: true });
  T.assert((await US.host.call('sequenceInfo', { seqId: seq.id })).markers.length === h2.sections.length, 'replaced, not added');
  await S.removeHighlights(job, seq.id);
  const ir = await US.host.call('sequenceInfo', { seqId: seq.id });
  T.assert(ir.markers.length === 0 && ir.video[0].clips.length === 1, 'removed; the interview untouched');

  // 5. Transcribe with Resolve: its own subtitles of a clip, read back as Story lines. The test interview's sound is
  //    synthetic (Resolve hears it as [MUSIC]), so a spoken clip is made with the Mac's own voice (say); on a PC this
  //    step checks only that nothing is left behind.
  const spoken = path.join(fs.realpathSync(US.host.extensionDir()), 'dev', 'test-project', 'exports', 'S001_spoken.wav');
  if (!fs.existsSync(spoken) && process.platform === 'darwin') {
    fs.mkdirSync(path.dirname(spoken), { recursive: true });
    require('child_process').execFileSync('say', ['-o', spoken, '--file-format=WAVE', '--data-format=LEI16@48000', 'I grew up in a small town by the sea. My family ran a bakery on the high street. Every morning my father got up at four to bake the bread, and on Sundays we all went to the beach together.']);
  }
  let transcribed = 'skipped (no say on this computer)';
  if (fs.existsSync(spoken)) {
    const [sp] = await T.importOnce([spoken], BIN);
    await US.host.call('revealItem', { id: sp.id });   // selected in the Media Pool, as the person would
    const t0 = Date.now();
    const rr = await T.action('story.read', {});
    const tr2 = st.transcripts.find(t => t.path && real(t.path) === real(spoken));
    T.assert(tr2 && tr2.lines.length >= 1, 'Resolve transcribed the spoken clip: ' + (rr && rr.summary));
    const words = tr2.lines.map(l => l.text).join(' ');
    T.assert(/bakery|small town|the sea|father/i.test(words), 'the words are there: ' + words.slice(0, 120));
    T.assert(tr2.lines.every(l => l.end > l.start && l.start >= 0 && l.end <= 30), 'times inside the clip');
    transcribed = `${tr2.lines.length} lines in ${((Date.now() - t0) / 1000).toFixed(0)} s: ${words.slice(0, 60)}`;
  }
  const left = await T.devEval("return R.timelines().filter(t => /^Ultra Studio transcribe/.test(t.GetName())).length");
  T.assert(left === 0, 'no scratch timeline left behind: ' + left);
  return { look: b2.summary, colours: c2.join(' '), highlights: h.sections.length, transcribed };
} finally {
  Object.assign(st, saved); S.reindex && S.reindex(); S.save();
  for (const k of KEYS) US.settings.set(k, prev[k] == null ? '' : prev[k]);
  if (prev['story.handles'] == null) US.settings.set('story.handles', 0.3);
  if (prev['story.colourThemes'] == null) US.settings.set('story.colourThemes', true);
  if (prev['story.strongLabel'] == null) US.settings.set('story.strongLabel', 15);
  if (prev['story.markers'] == null) US.settings.set('story.markers', true);
}
