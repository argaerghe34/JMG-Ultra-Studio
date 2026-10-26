// Story › Share › Paper edit in real Premiere: your themes saved as Word and as a spreadsheet – themes in the order of
// the Themes list, each theme's lines in order, themes switched off in Build left out, source timecodes read from the
// clip in Premiere – and a narrative's paper edit, with what each line does and its hidden lines left out.
const S = US.story, fs = require('fs'), os = require('os'), path = require('path'), cp = require('child_process');
const BIN = 'Test – Story';
const prevDir = US.settings.get('story.exportDir');
const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'us-e2e-paper-'));
US.settings.set('story.exportDir', outDir);
const st = S.loadState(), saved = JSON.parse(JSON.stringify({ wall: st.wall, themes: st.themes, buildOff: st.buildOff || [], picky: st.picky || null }));
try {
  const [ruth] = await T.importOnce([T.media('interview', 'I001_interview.mp4')], BIN);
  await S.importFiles(US.jobs.testJob('story'), [T.media('transcripts', 'I001_interview.srt')]);
  const t = st.transcripts.find(x => x.itemId === ruth.id);
  T.assert(t && t.lines.length >= 5, 'I001 transcript linked to the clip');
  const [a, b, c, d, e] = t.lines;
  const theme = (id, name, label, ids) => ({ id, name, label, custom: true, picked: true, lineIds: ids, manual: ids.slice() });
  st.themes = [theme('pe-open', 'Opening', 3, [b.id, a.id]), theme('pe-off', 'Left out', 9, [e.id]), theme('pe-end', 'Ending', 7, [d.id])];
  st.buildOff = ['pe-off'];
  st.wall = { mode: 'columns', loose: [], columns: [{ id: 'pe-nar', name: 'Narrative · 30 s · test', label: 5, narrative: { title: 'A test story', seconds: 30, by: 'basic', at: Date.now() },
    cards: [{ lineId: d.id, note: 'Hook her in' }, { lineId: c.id, hidden: true }, { lineId: a.id, note: 'The payoff' }] }] };
  S.save();
  const timing = (await US.host.call('storyTiming', { ids: [ruth.id] }))[ruth.id];
  const tcOf = sec => US.storyExport.tc(timing.start + sec, { fps: timing.fps, drop: timing.drop });
  const textOf = f => cp.execFileSync('textutil', ['-convert', 'txt', '-stdout', f]).toString();

  const r = await T.action('story.paperEdit', { format: 'docx' });
  T.assert(fs.existsSync(r.file) && /paper edit/.test(r.file), 'Word file saved: ' + r.summary);
  T.assert(/2 groups · 3 lines/.test(r.summary), 'summary counts the themes that are switched on: ' + r.summary);
  const txt = textOf(r.file), at = s => txt.indexOf(s);
  T.assert(at('Opening') >= 0 && at('Opening') < at('Ending') && !txt.includes('Left out'), 'themes in list order, the one switched off left out');
  T.assert(at(b.text) < at(a.text), 'lines in the theme’s order');
  T.assert(txt.includes(`${tcOf(b.start)}–${tcOf(b.end)}`), `source timecodes from Premiere (${tcOf(b.start)})`);

  const csv = await T.action('story.paperEdit', { format: 'csv' });
  const rows = fs.readFileSync(csv.file, 'utf8').replace(/^﻿/, '').trim().split('\r\n');
  T.assert(rows.length === 4 && rows[1].startsWith('Opening,1,') && rows[3].startsWith('Ending,1,'), 'spreadsheet: 3 lines, numbered per theme\n' + rows.join('\n'));

  // the narrative's paper edit
  const n = await T.action('story.paperEdit', { format: 'docx', source: 'narrative' });
  const nt = textOf(n.file);
  T.assert(/1 group · 2 lines/.test(n.summary) && nt.indexOf(d.text) < nt.indexOf(a.text) && !nt.includes(c.text), 'narrative in order, hidden line left out: ' + n.summary);
  T.assert(nt.includes('Note: Hook her in'), 'what each line does is included');

  // Share shows both buttons
  US.story.open('share'); await T.sleep(400);
  const btns = [...document.querySelectorAll('.tool:not(.hidden) .story-pane:not(.hidden) button')].map(x => x.textContent);
  T.assert(btns.includes('Paper edit of your themes') && btns.includes('Paper edit of the narrative'), 'Share has both paper edit buttons: ' + btns.join(', '));
  return { saved: [US.basename(r.file), US.basename(csv.file), US.basename(n.file)], summary: r.summary, firstTC: tcOf(b.start) };
} finally {
  Object.assign(st, saved); S.save();
  US.settings.set('story.exportDir', prevDir);
  try { fs.rmSync(outDir, { recursive: true, force: true }); } catch (e) { /* temp */ }
}
