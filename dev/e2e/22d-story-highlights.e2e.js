// premiere-only – Premiere’s adjustment-layer highlights, read from its XML export; Resolve: 22r-story-resolve
// Story › Highlight selects on a string-out (S1) and the board's idea notes (S3), in real Premiere:
// a string-out of the whole interview; lines chosen in a theme, on the board and in a built sequence get highlight clips on a
// “Selects” track (names, times, colours checked via FCP XML) and range markers; running again replaces them; Remove clears them.
if (!US.story || !US.story.highlightStringOut) throw new Error('Story (highlights) is not loaded in the panel');
const S = US.story, TL = US.storyTimeline;
const fs = require('fs'), os = require('os'), path = require('path');
const BIN = 'Test – Story', SEQ = 'Test – Story string-out', SEQB = 'Test – Story ideas';
const prevBase = US.settings.get('story.binBase');
US.settings.set('story.binBase', BIN);
const st = S.loadState();
const saved = JSON.parse(JSON.stringify({ themes: st.themes, wall: st.wall, builds: st.builds || [], picky: st.picky || null, highlights: st.highlights || {} }));
async function xmlVideo(seqId) {
  const out = path.join(os.tmpdir(), 'us-e2e-hl.xml'); try { fs.unlinkSync(out); } catch (e) { /* none */ }
  await US.host.rawEval(`(function(){ var ss=app.project.sequences; for (var i=0;i<ss.numSequences;i++) if (ss[i].sequenceID==${JSON.stringify(seqId)}) return String(ss[i].exportAsFinalCutProXML(${JSON.stringify(out)}, 1)); })()`, 60000);
  const tracks = [];
  fs.readFileSync(out, 'utf8').replace(/<track\b[^>]*>([\s\S]*?)<\/track>/g, (m, tb) => { const items = []; let type = ''; tb.replace(/<clipitem id="[^"]*"[^>]*>([\s\S]*?)<\/clipitem>/g, (mm, b) => { type = type || ((/<sourcetrack>\s*<mediatype>(\w+)<\/mediatype>/.exec(b) || [])[1] || ''); items.push({ name: ((/<name>([^<]*)<\/name>/.exec(b) || [])[1] || '').replace(/&amp;/g, '&'), label: (/<label2>([^<]*)<\/label2>/.exec(b) || [])[1] || '' }); return mm; }); if (items.length && type !== 'audio') tracks.push(items); return m; });
  return tracks;
}
try {
  const [ruth] = await T.importOnce([T.media('interview', 'I001_interview.mp4')], BIN);
  const job = US.jobs.testJob('story');
  await S.importFiles(job, [T.media('transcripts', 'I001_interview.srt')]);
  const real = p => { try { return fs.realpathSync(p); } catch (e) { return p; } };
  const L = st.transcripts.find(t => t.path && real(t.path) === real(ruth.path)).lines;
  // the string-out: the whole interview
  for (const n of [SEQ, SEQB]) { const o = await T.seqByName(n); if (o) await US.host.call('deleteSequence', { seqId: o.id }); }
  const seq = await US.host.call('newSequence', { name: SEQ, binPath: BIN, likeId: ruth.id });
  await US.host.call('placeClips', { seqId: seq.id, cursor: 0, clips: [{ id: ruth.id, in: 0, out: 90 }] });
  // selections: a theme (2 lines), a narrative (1 line), a built sequence (1 line)
  st.themes = []; st.wall = { columns: [], loose: [] }; st.builds = [{ seqId: 'x', name: 'Earlier cut', lineIds: [L[8].id] }]; st.picky = { s: 0 }; st.highlights = {};
  const fam = S.newThemeFrom('Family', [L[0].id, L[1].id]);
  st.wall.columns.push({ id: 'b1', name: 'Board pick', label: 2, narrative: { title: 'N', seconds: 30, by: 'basic', at: Date.now() }, cards: [{ lineId: L[5].id }] });
  S.ensureColours(); S.save();
  const r = await S.highlightStringOut(job, { seqId: seq.id, use: { themes: true, board: true, builds: true }, markers: true });
  T.assert(r.sections.length === 4, 'four selected lines: ' + r.sections.map(x => x.name).join(' | '));
  const info = await US.host.call('sequenceInfo', { seqId: seq.id });
  const track = info.video[r.result.track];
  T.assert(r.result.named ? track.name === 'Selects' : true, 'track named Selects: ' + track.name);
  T.assert(track.clips.length === 4, 'four highlight clips: ' + track.clips.length);
  r.sections.forEach((x, i) => { T.near(track.clips[i].start, x.start, info.frame * 1.5, `highlight ${i + 1} start`); T.near(track.clips[i].end, x.end, info.frame * 1.5, `highlight ${i + 1} end`); T.assert(track.clips[i].name === x.name, `highlight ${i + 1} name ${track.clips[i].name}`); });
  T.assert(/^Family · /.test(track.clips[0].name), 'named after its theme: ' + track.clips[0].name);
  const x1 = await xmlVideo(seq.id);
  const hlTrack = x1[x1.length - 1], LN = i => US.ui.LABELS[i].name;
  T.assert(hlTrack.map(c => c.label).join('|') === r.sections.map(x => LN(x.label)).join('|'), 'colours ' + hlTrack.map(c => c.label).join('|'));
  T.assert(hlTrack.map(c => c.label).includes(LN(fam.label)) && hlTrack.map(c => c.label).includes(LN(2)) && hlTrack.map(c => c.label).includes(LN(4)), 'theme, narrative and built-sequence colours');
  T.assert(info.markers.length === 4 && info.markers.every((m, i) => m.name === r.sections[i].name), 'range markers: ' + info.markers.map(m => m.name).join('|'));
  // coverage
  const cov = TL.coverage(r.tl.result.entries, r.sel);
  T.assert(cov.length === 1 && cov[0].pct > 0.1 && cov[0].pct < 0.6 && cov[0].gaps.length, 'coverage ' + JSON.stringify({ pct: cov[0].pct, gaps: cov[0].gaps.length }));
  // again with less selected: replaced, not added
  st.wall.columns = []; st.builds = []; S.save();
  const r2 = await S.highlightStringOut(job, { seqId: seq.id, use: { themes: true, board: true, builds: true }, markers: true });
  const info2 = await US.host.call('sequenceInfo', { seqId: seq.id });
  T.assert(r2.result.removed === 4 && info2.video[r2.result.track].clips.length === 2 && info2.markers.length === 2, `replaced: removed ${r2.result.removed}, now ${info2.video[r2.result.track].clips.length} clips, ${info2.markers.length} markers`);
  T.assert(r2.result.track === r.result.track, 'same Selects track');
  const rm = await S.removeHighlights(job, seq.id);
  const info3 = await US.host.call('sequenceInfo', { seqId: seq.id });
  T.assert(info3.video[r.result.track].clips.length === 0 && info3.markers.length === 0 && /2 highlights removed/.test(rm.summary), 'removed: ' + rm.summary);
  T.assert(info3.video[0].clips.length === 1, 'the interview itself is untouched');

  // S3: idea notes on the board become markers in the built sequence (only while the board is on)
  let ideas = [];
  if (S.BOARD) {
    st.wall = { mode: 'columns', loose: [], columns: [{ id: 'g', name: 'Opening', label: 7, cards: [{ id: 'i1', idea: 'Title card' }, { lineId: L[0].id }, { id: 'i2', idea: 'B-roll of the market' }, { lineId: L[1].id }] }] };
    S.ensureColours(); S.save();
    await T.action('story.build', { source: 'wall', name: SEQB });
    const ib = await US.host.call('sequenceInfo', { seqId: (await T.seqByName(SEQB)).id });
    ideas = ib.markers.filter(m => /^Idea: /.test(m.name));
    T.assert(ideas.length === 2 && ideas[0].name === 'Idea: Title card' && ideas[1].name === 'Idea: B-roll of the market', 'idea markers: ' + ib.markers.map(m => m.name).join('|'));
    T.near(ideas[1].start, ib.video[0].clips[1].start, ib.frame * 1.01, 'the idea marker sits where its next line starts');
  }
  return { highlighted: r.sections.length, kind: r.result.kind, coverage: Math.round(cov[0].pct * 100) + '%', ideas: S.BOARD ? ideas.length : 'board off' };
} finally {
  Object.assign(st, saved); S.save();
  US.settings.set('story.binBase', prevBase || '');
}
