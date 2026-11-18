// resolve-only
// Story › Narrative from a brief in real Resolve (the twin of 22e-story-narrative, which reads Premiere's XML export),
// with the AI stubbed (it answers like Claude would, from the lines it is sent): the brief becomes a narrative
// “Narrative · 30 s · family”, and building it lays the beats in order, with a word trim applied to the in-point,
// Hook / Build / Payoff markers and each beat's purpose, and each line in its theme's colour – all read back from
// Resolve itself (the timeline items' source times and clip colours, the timeline's markers).
if (!US.story || !US.story.makeNarrative) throw new Error('Story (narrative) is not loaded in the panel');
const S = US.story;
const fs = require('fs');
const BIN = 'Test – Story', SEQ = 'Test – Story narrative (Resolve)';
const prev = { base: US.settings.get('story.binBase'), more: US.settings.get('story.moreAI'), names: US.settings.get('story.themeNames'), colour: US.settings.get('story.colourThemes'), hl: US.settings.get('story.strongHighlight') };
US.settings.set('story.binBase', BIN); US.settings.set('story.moreAI', false); US.settings.set('story.themeNames', 'marker'); US.settings.set('story.colourThemes', true); US.settings.set('story.strongHighlight', false);
const st = S.loadState();
const saved = JSON.parse(JSON.stringify({ themes: st.themes, wall: st.wall, builds: st.builds || [], picky: st.picky || null, scope: st.scope || { kind: 'all' }, ownThemes: st.ownThemes || null }));
st.scope = { kind: 'all' };
const realAI = US.ai;
const RC = i => ['Violet', 'Navy', 'Teal', 'Purple', 'Blue', 'Olive', 'Pink', 'Orange', 'Purple', 'Blue', 'Teal', 'Pink', 'Tan', 'Green', 'Brown', 'Yellow'][i];   // resolve/host/base.js LABEL_COLORS
// V1 of a timeline as Resolve has it: each item's place, its source in/out (media seconds) and its clip colour
const v1 = seqId => T.devEval(`const t = R.needSeq(${JSON.stringify(seqId)});
  return R.list(t.GetItemListInTrack('video', 1)).filter(Boolean).map(ti => { const x = R.itemTimes(t, ti), m = ti.GetMediaPoolItem(); return { name: m ? String(m.GetName()) : '', start: x.start, end: x.end, in: x.in, out: x.out, colour: String(ti.GetClipColor() || '') }; });`);
try {
  const [ruth] = await T.importOnce([T.media('interview', 'I001_interview.mp4')], BIN);
  const job = US.jobs.testJob('story');
  await S.importFiles(job, [T.media('transcripts', 'I001_interview.srt')]);
  const real = p => { try { return fs.realpathSync(p); } catch (e) { return p; } };
  const tr = st.transcripts.find(t => t.path && real(t.path) === real(ruth.path));
  T.assert(tr && tr.lines.length >= 12, 'transcript linked to the clip');
  const L = tr.lines, ruthIds = new Set(L.map(l => l.id));
  // selects: two of Ruth's themes (different colours), no other narratives
  st.themes = []; st.wall = { mode: 'columns', columns: [], loose: [] }; st.picky = { s: S.PICKY_LEVELS.all };
  const fam = S.newThemeFrom('Family', L.filter(l => /mother|father|grandmother|children|family|grew up/i.test(l.text)).map(l => l.id));
  const faith = S.newThemeFrom('Faith', L.filter(l => /faith|candles|Shabbat|synagogue/i.test(l.text)).map(l => l.id));
  st.wall.columns = []; S.ensureColours(); S.save();
  T.assert(fam.label !== faith.label, 'two theme colours');
  // the stub: hook, two build lines (the second trimmed by two words), payoff – only Ruth's lines, from the list it was sent
  let sent = '';
  US.ai = Object.assign({}, realAI, { available: () => true, label: () => 'Claude', provider: () => 'claude', json: async req => {
    sent = [].concat(req.user).map(b => (typeof b === 'string' ? b : b.text)).join('\n');
    T.assert(req.feature === 'Narrative cut' && req.user[0].cache, 'cached listing first, billed to the narrative');
    const ids = Array.from(req.user[0].text.matchAll(/^(\S+)\t/gm)).map(m => m[1]).filter(id => ruthIds.has(id));
    const txt = id => L.find(l => l.id === id).text;
    const pick = [ids.find(id => /grew up/.test(txt(id))), ids.find(id => /grandmother/.test(txt(id))), ids.find(id => /candles|Shabbat/.test(txt(id)) && !/grandmother/.test(txt(id))), ids.find(id => /door is open/.test(txt(id)))].filter(Boolean);
    return { title: 'An open door', logline: 'Ruth on the home she grew up in.', beats: pick.map((id, i) => ({ lineId: id, purpose: ['Who she is', 'What was handed down', 'Faith at home', 'What it all meant'][i], dropStartWords: i === 2 ? 2 : 0, dropEndWords: 0 })) };
  } });
  const r = await T.action('story.narrative', { brief: 'Make a 30-second video about family', useAI: true });
  T.assert(/Length: 30 seconds/.test(sent) && !/\.mp4|\/Users\/|\/Library\//.test(sent), 'only the brief and line text were sent');
  const col = st.wall.columns.find(c => c.id === r.column.id);
  T.assert(col && col.name === 'Narrative · 30 s · family' && col.narrative.by === 'ai' && col.narrative.title === 'An open door', 'narrative: ' + (col && col.name));
  T.assert(col.cards.length === 4 && col.cards[2].trim && col.cards[2].trim.dropStart === 2, 'four beats, the third trimmed: ' + JSON.stringify(col.cards.map(k => k.trim || null)));

  // build it
  const old = await T.seqByName(SEQ); if (old) await US.host.call('deleteSequence', { seqId: old.id });
  const b = await T.action('story.build', { source: 'narrative', name: SEQ });
  const info = await US.host.call('sequenceInfo', { seqId: b.seq.id }), fr = info.frame || 0.04;
  const all = await v1(b.seq.id), clips = all.slice(0, 4), handles = S.lookOptions().handles;
  T.assert(clips.length === 4 && clips.every(c => c.name === ruth.name), 'four beats from the interview on V1: ' + JSON.stringify(all.map(c => c.name)));
  // the four beats first; after them, the narrative's alternatives (“Alternative selects”) to swap in
  const altAt = (info.markers.find(m => m.name === 'Alternative selects') || {}).start;
  T.assert(all.length === 4 || (altAt != null && Math.abs(altAt - clips[3].end) < fr * 1.5), `four beats, then the alternatives: ${all.length} clips, alternatives at ${altAt}`);
  col.cards.forEach((k, i) => {
    const x = S.trimOf(k) || L.find(l => l.id === k.lineId);
    T.near(clips[i].in, Math.max(0, x.start - handles), fr * 1.5, `beat ${i + 1} in-point (Resolve's source start)`);
    T.near(clips[i].out, x.end + handles, fr * 1.5, `beat ${i + 1} out-point (Resolve's source end)`);
    if (i) T.near(clips[i].start, clips[i - 1].end, fr * 1.01, `beat ${i + 1} butts up to the one before`);
  });
  T.assert(S.trimOf(col.cards[2]).start > L.find(l => l.id === col.cards[2].lineId).start + 0.3, 'the trim moved the in-point later');
  // the sections, each beat's purpose, then the alternatives – Resolve's timeline markers
  const sections = info.markers.filter(m => /^(Hook|Build|Payoff)$/.test(m.name));
  T.assert(sections.map(m => m.name).join('|') === 'Hook|Build|Payoff', 'section markers: ' + info.markers.map(m => m.name).join('|'));
  T.near(sections[0].start, clips[0].start, fr * 1.5, 'Hook starts at the first clip');
  T.near(sections[1].start, clips[1].start, fr * 1.5, 'Build starts at the second clip');
  T.near(sections[2].start, clips[3].start, fr * 1.5, 'Payoff starts at the last beat');
  T.assert(info.markers.some(m => m.name === 'Hook: Who she is'), 'each beat’s purpose marked: ' + info.markers.map(m => m.name).join('|'));
  // each line in its theme's colour: the timeline clips' own colours (the source clip keeps its own)
  const sel = S.selectionMap({ themes: true, board: false, builds: false });
  const want = col.cards.map(k => RC(sel.has(k.lineId) ? sel.get(k.lineId).label : S.columnLabel(col)));
  const got = clips.map(c => c.colour);
  T.assert(got.join('|') === want.join('|'), `clip colours ${got.join('|')} (wanted ${want.join('|')})`);
  T.assert(new Set(got).size >= 2, 'lines keep their own theme colours');

  // the basic version, without AI
  US.ai = realAI;
  const basic = await T.action('story.narrative', { brief: 'half a minute on family', useAI: false });
  T.assert(basic.narrative.by === 'basic' && /basic version/.test(basic.summary) && basic.column.name.startsWith('Narrative · 30 s · family'), basic.summary);
  return { built: `${clips.length} beats + ${all.length - clips.length} alternatives`, colours: got.join(' '), length: US.fmtDur(info.duration || clips[clips.length - 1].end), basic: basic.summary.slice(0, 80) };
} finally {
  US.ai = realAI;
  Object.assign(st, saved); S.save();
  US.settings.set('story.binBase', prev.base || ''); US.settings.set('story.moreAI', prev.more !== false); US.settings.set('story.themeNames', prev.names || 'marker');
  US.settings.set('story.colourThemes', prev.colour !== false); US.settings.set('story.strongHighlight', !!prev.hl);
}
