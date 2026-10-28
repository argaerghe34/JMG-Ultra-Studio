// premiere-only – reads label colours from Premiere’s XML export; Resolve: 22r-story-resolve
// Story › Narrative from a brief (S2) in real Premiere, with the AI stubbed (the stub answers like Claude would, from the
// lines it is sent): the brief becomes a narrative “Narrative · 30 s · family” (shown in Build), and building it lays the beats in
// order, with a word trim applied to the in-point, Hook / Build / Payoff markers, and each line in its theme's colour.
if (!US.story || !US.story.makeNarrative) throw new Error('Story (narrative) is not loaded in the panel');
const S = US.story, N = US.storyNarrative;
const fs = require('fs'), os = require('os'), path = require('path');
const BIN = 'Test – Story', SEQ = 'Test – Story narrative';
const prev = { base: US.settings.get('story.binBase'), more: US.settings.get('story.moreAI'), names: US.settings.get('story.themeNames'), colour: US.settings.get('story.colourThemes'), hl: US.settings.get('story.strongHighlight') };
US.settings.set('story.binBase', BIN); US.settings.set('story.moreAI', false); US.settings.set('story.themeNames', 'marker'); US.settings.set('story.colourThemes', true); US.settings.set('story.strongHighlight', false);
const st = S.loadState();
const saved = JSON.parse(JSON.stringify({ themes: st.themes, wall: st.wall, builds: st.builds || [], picky: st.picky || null, scope: st.scope || { kind: 'all' }, ownThemes: st.ownThemes || null }));
st.scope = { kind: 'all' };
const realAI = US.ai;
async function xmlLabels(seqId) {
  const out = path.join(os.tmpdir(), 'us-e2e-nar.xml'); try { fs.unlinkSync(out); } catch (e) { /* none */ }
  await US.host.rawEval(`(function(){ var ss=app.project.sequences; for (var i=0;i<ss.numSequences;i++) if (ss[i].sequenceID==${JSON.stringify(seqId)}) return String(ss[i].exportAsFinalCutProXML(${JSON.stringify(out)}, 1)); })()`, 60000);
  // first picture track (tracks are told apart by their clips' source media type: clip files nest their own <video>)
  const tracks = [];
  fs.readFileSync(out, 'utf8').replace(/<track\b[^>]*>([\s\S]*?)<\/track>/g, (m, tb) => { const labels = []; let type = ''; tb.replace(/<clipitem id="[^"]*"[^>]*>([\s\S]*?)<\/clipitem>/g, (mm, b) => { type = type || ((/<sourcetrack>\s*<mediatype>(\w+)<\/mediatype>/.exec(b) || [])[1] || ''); labels.push((/<label2>([^<]*)<\/label2>/.exec(b) || [])[1] || ''); return mm; }); if (labels.length && type !== 'audio') tracks.push(labels); return m; });
  return tracks[0] || [];
}
try {
  const [ruth] = await T.importOnce([T.media('interview', 'I001_interview.mp4')], BIN);
  const job = US.jobs.testJob('story');
  await S.importFiles(job, [T.media('transcripts', 'I001_interview.srt')]);
  const real = p => { try { return fs.realpathSync(p); } catch (e) { return p; } };
  const L = st.transcripts.find(t => t.path && real(t.path) === real(ruth.path)).lines;
  const ruthIds = new Set(L.map(l => l.id));
  // selects: two of Ruth's themes (different colours), no other narratives
  st.themes = []; st.wall = { mode: 'columns', columns: [], loose: [] }; st.picky = { s: S.PICKY_LEVELS.all };
  const fam = S.newThemeFrom('Family', L.filter(l => /mother|father|grandmother|children|family|grew up/i.test(l.text)).map(l => l.id));
  const faith = S.newThemeFrom('Faith', L.filter(l => /faith|candles|Shabbat|synagogue/i.test(l.text)).map(l => l.id));
  st.wall.columns = []; S.ensureColours(); S.save();
  T.assert(fam.label !== faith.label, 'two theme colours');
  // the stub: hook, two build lines (the second trimmed by two words), payoff – only Ruth's lines, from the list it was sent
  let sent = '';
  US.ai = { available: () => true, label: () => 'Claude', provider: () => 'claude', json: async req => {
    sent = [].concat(req.user).map(b => (typeof b === 'string' ? b : b.text)).join('\n');
    T.assert(req.feature === 'Narrative cut' && req.user[0].cache, 'cached listing first, billed to the narrative');
    const ids = Array.from(req.user[0].text.matchAll(/^(\S+)\t/gm)).map(m => m[1]).filter(id => ruthIds.has(id));
    const pick = [ids.find(id => /grew up/.test(L.find(l => l.id === id).text)), ids.find(id => /grandmother/.test(L.find(l => l.id === id).text)), ids.find(id => /candles|Shabbat/.test(L.find(l => l.id === id).text) && !/grandmother/.test(L.find(l => l.id === id).text)), ids.find(id => /door is open/.test(L.find(l => l.id === id).text))].filter(Boolean);
    return { title: 'An open door', logline: 'Ruth on the home she grew up in.', beats: pick.map((id, i) => ({ lineId: id, purpose: ['Who she is', 'What was handed down', 'Faith at home', 'What it all meant'][i], dropStartWords: i === 2 ? 2 : 0, dropEndWords: 0 })) };
  } };
  const r = await T.action('story.narrative', { brief: 'Make a 30-second video about family', useAI: true });
  T.assert(/Length: 30 seconds/.test(sent) && !/\.mp4|\/Users\//.test(sent), 'only the brief and line text were sent');
  const col = st.wall.columns.find(c => c.id === r.column.id);
  T.assert(col && col.name === 'Narrative · 30 s · family' && col.narrative.by === 'ai' && col.narrative.title === 'An open door', 'narrative: ' + (col && col.name));
  T.assert(col.cards.length === 4 && col.cards[2].trim && col.cards[2].trim.dropStart === 2, 'four beats, the third trimmed: ' + JSON.stringify(col.cards.map(k => k.trim || null)));
  // build it
  const old = await T.seqByName(SEQ); if (old) await US.host.call('deleteSequence', { seqId: old.id });
  const b = await T.action('story.build', { source: 'narrative', name: SEQ });
  const info = await US.host.call('sequenceInfo', { seqId: b.seq.id });
  const clips = info.video[0].clips, handles = S.lookOptions().handles;
  T.assert(clips.length === 4, 'four clips: ' + clips.length);
  col.cards.forEach((k, i) => {
    const x = S.trimOf(k) || L.find(l => l.id === k.lineId);
    T.near(clips[i].in, Math.max(0, x.start - handles), info.frame * 1.5, `beat ${i + 1} in-point`);
    T.near(clips[i].out, x.end + handles, info.frame * 1.5, `beat ${i + 1} out-point`);
  });
  T.assert(S.trimOf(col.cards[2]).start > L.find(l => l.id === col.cards[2].lineId).start + 0.3, 'the trim moved the in-point later');
  const names = info.markers.map(m => m.name);
  T.assert(names.join('|') === 'Hook|Build|Payoff', 'section markers: ' + names.join('|'));
  T.near(info.markers[1].start, clips[1].start, info.frame * 1.01, 'Build starts at the second clip');
  const labels = await xmlLabels(b.seq.id), LN = i => US.ui.LABELS[i].name;
  const sel = S.selectionMap({ themes: true, board: false, builds: false });
  const want = col.cards.map(k => LN(sel.has(k.lineId) ? sel.get(k.lineId).label : S.columnLabel(col)));
  T.assert(labels.join('|') === want.join('|'), `colours ${labels.join('|')} (wanted ${want.join('|')})`);
  T.assert(new Set(labels).size >= 2, 'lines keep their own theme colours');
  // the basic version, without AI
  US.ai = realAI;
  const basic = await T.action('story.narrative', { brief: 'half a minute on family', useAI: false });
  T.assert(basic.narrative.by === 'basic' && /basic version/.test(basic.summary) && basic.column.name.startsWith('Narrative · 30 s · family'), basic.summary);
  return { built: clips.length, length: US.fmtDur(info.duration || clips[clips.length - 1].end), basic: basic.summary.slice(0, 80) };
} finally {
  US.ai = realAI;
  Object.assign(st, saved); S.save();
  US.settings.set('story.binBase', prev.base || ''); US.settings.set('story.moreAI', prev.more !== false); US.settings.set('story.themeNames', prev.names || 'marker');
  US.settings.set('story.colourThemes', prev.colour !== false); US.settings.set('story.strongHighlight', !!prev.hl);
}
