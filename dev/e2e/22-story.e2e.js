// Story in real Premiere:
//  1. import a transcript file, link it, cue the Source Monitor, build from two themes (plain build, markers);
//  2. build again with every look option: theme colours (approach A, relabel), strongest lines highlighted + first,
//     theme names as markers AND a name layer above the clips – then read the clip colours back from an FCP XML export;
//  3. the subclip fallback (approach B) on a small build; 4. a theme you add yourself (no board column while it's off);
//  5. "Read Premiere's transcripts" saves the project and says plainly that there are none.
if (!US.story) throw new Error('Story is not loaded in the panel');
const S = US.story;
const BIN = 'Test – Story', SEQ = 'Test – Story themes', SEQ2 = 'Test – Story themes (look)', SEQ3 = 'Test – Story themes (subclips)', HANDLES = 0.2;
const KEYS = ['story.binBase', 'story.handles', 'story.markers', 'story.themeNames', 'story.colourThemes', 'story.strongHighlight', 'story.strongFirst', 'story.strongLabel', 'story.colourMethod'];
const prev = Object.fromEntries(KEYS.map(k => [k, US.settings.get(k)]));
const setLook = o => { for (const [k, v] of Object.entries(o)) US.settings.set('story.' + k, v); };
setLook({ binBase: BIN, handles: HANDLES, markers: true, themeNames: 'marker', colourThemes: false, strongHighlight: false, strongFirst: false, strongLabel: 15, colourMethod: 'relabel' });
const st = S.loadState();
const savedWall = JSON.parse(JSON.stringify(st.wall)), savedThemes = JSON.parse(JSON.stringify(st.themes)), savedOff = st.buildOff, savedOwn = st.ownThemes, savedScope = st.scope;
// a theme of exactly these lines, in this order (lines added by hand always stay, whatever How picky says)
const theme = (id, name, label, ids) => ({ id, name, label, custom: true, picked: true, lineIds: ids, manual: ids.slice() });
st.buildOff = []; st.scope = { kind: 'all' };
const fs = require('fs'), os = require('os'), path = require('path');
async function seqInfo(name) { const s = await T.seqByName(name); T.assert(s, 'sequence ' + name); return US.host.call('sequenceInfo', { seqId: s.id }); }
async function xmlLabels(name) {
  const s = await T.seqByName(name), out = path.join(os.tmpdir(), 'us-e2e-story.xml');
  try { fs.unlinkSync(out); } catch (e) { /* none */ }
  await US.host.rawEval(`(function(){ var ss=app.project.sequences; for (var i=0;i<ss.numSequences;i++) if (ss[i].sequenceID==${JSON.stringify(s.id)}) return String(ss[i].exportAsFinalCutProXML(${JSON.stringify(out)}, 1)); })()`, 60000);
  const xml = fs.readFileSync(out, 'utf8');
  // clips carry a nested <file><media><video>, so classify each <track> by its clips' <sourcetrack> media type
  const tracks = [];
  xml.replace(/<track\b[^>]*>([\s\S]*?)<\/track>/g, (m, tb) => {
    const items = []; let type = '';
    tb.replace(/<clipitem id="[^"]*"[^>]*>([\s\S]*?)<\/clipitem>/g, (mm, b) => {
      type = type || ((/<sourcetrack>\s*<mediatype>(\w+)<\/mediatype>/.exec(b) || [])[1] || '');
      items.push({ name: ((/<name>([^<]*)<\/name>/.exec(b) || [])[1] || '').replace(/&amp;/g, '&'), label: (/<label2>([^<]*)<\/label2>/.exec(b) || [])[1] || '' });
      return mm;
    });
    if (items.length && type !== 'audio') tracks.push(items);
    return m;
  });
  return tracks; // video tracks that have clips, bottom first: [V1 clipitems, V2 clipitems, …]
}
async function fresh(name) { const old = await T.seqByName(name); if (old) await US.host.call('deleteSequence', { seqId: old.id }); }
try {
  const [clip] = await T.importOnce([T.media('interview', 'I001_interview.mp4')], BIN);
  T.assert(clip && clip.id, 'interview clip imported');
  const clipLabelBefore = (await US.host.call('itemInfo', { id: clip.id })).label;

  // 1. import + plain build
  const job = US.jobs.testJob('story');
  const r = await S.importFiles(job, [T.media('transcripts', 'I001_interview.srt')]);
  T.assert(/1 transcript imported/.test(r.summary), 'import summary: ' + r.summary);
  const real = p => { try { return fs.realpathSync(p); } catch (e) { return p; } };
  const tr = st.transcripts.find(t => t.path && real(t.path) === real(clip.path));
  T.assert(tr, 'transcript linked to the clip (by its file)');
  T.assert(tr.lines.length >= 12 && tr.lines.length <= 15, 'lines: ' + tr.lines.length);
  const cue = await US.host.call('storyCue', { id: clip.id, seconds: 20, play: false });
  T.near(cue.position, 20, 0.05, 'Source Monitor position');
  const L = tr.lines;
  st.themes = [theme('t1', 'Opening', 7, [L[0].id, L[1].id]), theme('t2', 'Legacy', 5, [L[L.length - 2].id, L[L.length - 1].id])];
  S.save();
  await fresh(SEQ);
  const b = await T.action('story.build', { source: 'themes', name: SEQ });
  T.assert(/4 lines/.test(b.summary), 'build summary: ' + b.summary);
  const info = await seqInfo(SEQ);
  const v = info.video[0].clips, a = info.audio[0].clips, fr = info.frame || 0.04;
  T.assert(v.length === 4 && a.length === 4, `4 video + 4 audio clips (got ${v.length} + ${a.length})`);
  const want = [L[0], L[1], L[L.length - 2], L[L.length - 1]];
  want.forEach((l, i) => {
    T.near(v[i].in, Math.max(0, l.start - HANDLES), fr * 1.5, `clip ${i + 1} in`);
    T.near(v[i].out, Math.min(90, l.end + HANDLES), fr * 1.5, `clip ${i + 1} out`);
    if (i) T.near(v[i].start, v[i - 1].end, fr * 1.01, `clip ${i + 1} butts up to the previous one`);
  });
  T.assert(info.markers.map(m => m.name).join('|') === 'Opening|Legacy', 'theme markers: ' + info.markers.map(m => m.name).join('|'));
  T.assert(!info.video[1].clips.length, 'no name layer when only markers are asked for');

  // 2. every look option: colours (relabel), strongest highlighted + first, markers + name layer
  setLook({ colourThemes: true, strongHighlight: true, strongFirst: true, themeNames: 'both' });
  st.themes = [theme('t1', 'Opening', 7, L.slice(0, 4).map(l => l.id)), theme('t2', 'Faith & legacy', 5, L.slice(-4).map(l => l.id))];
  S.save();
  const groups = S.themeGroups();
  const expected = groups.flatMap(g => S.strongestFirst(g.lineIds, g.pinned).map(id => ({ id, group: g.name, strong: S.isStrong(L.find(l => l.id === id)), label: g.label })));
  T.assert(expected.some(e => e.strong) && expected.some(e => !e.strong), 'the test themes need strong and ordinary lines: ' + expected.map(e => e.strong).join(','));
  await fresh(SEQ2);
  const b2 = await T.action('story.build', { source: 'themes', name: SEQ2 });
  const i2 = await seqInfo(SEQ2);
  const v2 = i2.video[0].clips;
  T.assert(v2.length === 8, 'all 8 lines placed: ' + v2.length);
  expected.forEach((e, k) => { const l = L.find(x => x.id === e.id); T.near(v2[k].in, Math.max(0, l.start - HANDLES), fr * 1.5, `look build clip ${k + 1} is ${e.strong ? 'a strong line' : 'in order'}`); });
  const layer = i2.video[1].clips;
  T.assert(layer.map(c => c.name).join('|') === 'Opening|Faith & legacy', 'name layer clips: ' + layer.map(c => c.name).join('|'));
  T.near(layer[0].start, v2[0].start, fr * 1.01, 'Opening layer starts with its first clip'); T.near(layer[0].end, v2[3].end, fr * 1.01, 'Opening layer ends with its last clip');
  T.near(layer[1].start, v2[4].start, fr * 1.01, 'second layer starts with its first clip'); T.near(layer[1].end, v2[7].end, fr * 1.01, 'second layer ends with its last clip');
  const mk = i2.markers.map(m => m.name);
  T.assert(mk.filter(n => n === '★ Strongest').length === expected.filter(e => e.strong).length, 'a ★ marker per strong line: ' + mk.join('|'));
  T.assert(mk.includes('Opening') && mk.includes('Faith & legacy'), 'theme name markers too');
  const x2 = await xmlLabels(SEQ2);
  const LN = i => US.ui.LABELS[i].name;
  const gotLabels = x2[0].map(c => c.label), wantLabels = expected.map(e => (e.strong ? LN(15) : LN(e.label)));
  T.assert(gotLabels.join('|') === wantLabels.join('|'), `timeline colours ${gotLabels.join('|')} vs ${wantLabels.join('|')}`);
  T.assert(x2[1].map(c => c.label).join('|') === [LN(7), LN(5)].join('|'), 'name layer clips in theme colours: ' + x2[1].map(c => c.label).join('|'));
  T.assert((await US.host.call('itemInfo', { id: clip.id })).label === clipLabelBefore, 'the source clip keeps its own colour');

  // 3. subclip fallback (approach B)
  setLook({ colourMethod: 'subclips', strongHighlight: false, strongFirst: false, themeNames: 'none' });
  st.themes = [theme('t1', 'B test', 9, L.slice(0, 2).map(l => l.id))];
  S.save();
  await fresh(SEQ3);
  await T.action('story.build', { source: 'themes', name: SEQ3 });
  const x3 = await xmlLabels(SEQ3);
  T.assert(x3[0].length === 2 && x3[0].every(c => c.label === LN(9)), 'subclip build colours: ' + x3[0].map(c => c.label).join('|'));

  // 4. a theme you add yourself
  const before = st.wall.columns.length;
  const th = await S.addCustomTheme(US.jobs.testJob('story'), 'Shabbat candles');
  T.assert(th.lineIds.length >= 1 && st.themes.includes(th) && st.wall.columns.length === before, 'custom theme added (no board column while the board is off)');

  // 5. Premiere's transcripts
  let code = '';
  try { await T.action('story.read', {}); } catch (e) { code = e.code; }
  T.assert(code === 'NOTHING_FOUND', 'story.read without Premiere transcripts gives a plain NOTHING_FOUND, got ' + code);

  return { lines: L.length, look: b2.summary, layerKind: b2.notes && b2.notes.length ? 'label clips' : 'adjustment layer', colours: gotLabels.join(' ') };
} finally {
  st.wall = savedWall; st.themes = savedThemes; st.buildOff = savedOff; st.ownThemes = savedOwn; st.scope = savedScope; S.save();
  for (const k of KEYS) US.settings.set(k, prev[k] == null ? '' : prev[k]);
  if (prev['story.handles'] == null) US.settings.set('story.handles', 0.3);
  if (prev['story.colourThemes'] == null) US.settings.set('story.colourThemes', true);
  if (prev['story.strongLabel'] == null) US.settings.set('story.strongLabel', 15);
  if (prev['story.markers'] == null) US.settings.set('story.markers', true);
}
