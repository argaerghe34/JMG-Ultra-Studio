// Story travels with the project, in real Premiere: the copy next to the test project is written and matches, and a
// transcript read again "on the other computer" (its clip's path changed to a drive letter) keeps its key and line
// ids, so a theme still finds every line and Premiere's clip is still found for building.
const S = US.story, Y = US.storySync, fs = require('fs');
const BIN = 'Test – Story';
const st = S.loadState(), saved = JSON.parse(JSON.stringify(st));
try {
  const [ruth] = await T.importOnce([T.media('interview', 'I001_interview.mp4')], BIN);
  await S.importFiles(US.jobs.testJob('story'), [T.media('transcripts', 'I001_interview.srt')]);
  const real = p => { try { return fs.realpathSync(p); } catch (e) { return p; } };
  const tr = st.transcripts.find(t => t.path && real(t.path) === real(ruth.path));
  T.assert(tr, 'Ruth’s transcript is in Story');
  const ids = tr.lines.map(l => l.id);
  st.themes.push({ id: 'sync-test', name: 'Sync test', lineIds: ids.slice(0, 6), manual: true });
  S.save(); S.flushShared();
  // the copy next to the project
  const file = Y.sharedFile(US.ctx.project.path);
  T.assert(fs.existsSync(file), 'Story saved next to the project: ' + file);
  const there = JSON.parse(fs.readFileSync(file, 'utf8'));
  T.assert(there.sync && there.sync.id === st.sync.id, 'the copy next to the project is the one open');
  T.assert(there.themes.some(t => t.id === 'sync-test'), 'with the new theme');
  T.assert(S.syncStatus().where === 'project', 'Home says it’s saved with the project: ' + JSON.stringify(S.syncStatus()));
  // "the PC": the same transcript, its clip reached through a drive letter that doesn't exist here
  const key = tr.key, n = st.transcripts.length;
  tr.path = 'E:\\FJL\\' + US.basename(tr.path);
  const segs = US.transcript.parseFile(T.media('transcripts', 'I001_interview.srt')).segments;
  S.addTranscript({ name: tr.name, path: 'F:\\Media\\' + US.basename(ruth.path), source: 'file', segments: segs });
  T.assert(st.transcripts.length === n, `no duplicate interview (${st.transcripts.length} vs ${n})`);
  const again = st.transcripts.find(t => t.key === key);
  T.assert(again && again.path.startsWith('F:\\'), 'the same interview, with this computer’s path');
  const now = new Set(again.lines.map(l => l.id));
  T.assert(st.themes.find(t => t.id === 'sync-test').lineIds.every(id => now.has(id)), 'the theme still finds every line');
  // building finds Premiere's clip by its id or file name, whatever the path
  const items = await S.resolveItems([again]);
  // I001 is in several bins of the test project: any copy of Ruth's file will do
  const found = items.get(key) && (await US.host.call('itemsInfo', { ids: [items.get(key)] }))[0];
  T.assert(found && real(found.path) === real(ruth.path), `the clip is still found for building (${items.get(key)}: ${found && found.path})`);
  return { file: US.basename(file), lines: ids.length, clip: ruth.id };
} finally {
  // put Story back as it was, here and next to the project
  for (const k of Object.keys(st)) delete st[k];
  Object.assign(st, saved); S.reindex(); S.save(); S.flushShared();
}
