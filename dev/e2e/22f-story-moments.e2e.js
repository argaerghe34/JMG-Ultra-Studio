// Story › Moments (S5) in real Premiere: a transcript with a restart, crew chatter, laughter, the interviewer reacting,
// a second voice and an emotional line, at Ruth's interview times. Moments finds them (basic, no AI), makes a
// theme per type, and marks them on a string-out as range markers coloured by type; marking again replaces them;
// Remove clears them. The AI route is checked with a stub (text only).
if (!US.story || !US.story.findMoments) throw new Error('Story (moments) is not loaded in the panel');
const S = US.story, M = US.storyMoments;
const fs = require('fs');
const BIN = 'Test – Story', SEQ = 'Test – Story moments string-out';
const prevBase = US.settings.get('story.binBase');
US.settings.set('story.binBase', BIN);
const st = S.loadState();
const saved = JSON.parse(JSON.stringify({ wall: st.wall, themes: st.themes, picky: st.picky || null, moments: st.moments || null, momentMarkers: st.momentMarkers || {}, scope: st.scope || { kind: 'all' } }));
st.scope = { kind: 'all' };
const realAI = US.ai;
let ruth = null;
try {
  [ruth] = await T.importOnce([T.media('interview', 'I001_interview.mp4')], BIN);
  const job = US.jobs.testJob('story');
  // a stand-in transcript for Ruth's clip (the words don't need to match the audio for markers)
  const segs = [
    { start: 0.6, end: 5.3, speaker: 'Ruth', text: 'My name is Ruth, and I grew up in a small flat in Stamford Hill.' },
    { start: 5.8, end: 10, speaker: 'Ruth', text: 'Sorry, can I start that again? I lost my thread.' },
    { start: 12.5, end: 19.1, speaker: 'Ruth', text: 'Every Friday night the table was full, and the dog once ate the challah [laughs].' },
    { start: 19.7, end: 21, speaker: 'Interviewer', text: 'Oh wow.' },
    { start: 21.5, end: 26, speaker: 'Ruth', text: 'My father always said a home is only as warm as the door is open.' },
    { start: 26.5, end: 31, speaker: 'Ruth', text: 'Is it recording? Okay, good.' },
    { start: 33, end: 39, speaker: 'Ruth', text: 'When my mother passed away I cried for weeks, and I still miss her every day.' },
    { start: 39.5, end: 43.4, speaker: 'Lily', text: 'Mum, the taxi is here!' }
  ];
  // replace the transcript Story already has for this clip (same key), so the string-out finds this one
  await S.importFiles(job, [T.media('transcripts', 'I001_interview.srt')]);
  const real = p => { try { return fs.realpathSync(p); } catch (e) { return p; } };
  const t0 = st.transcripts.find(t => t.path && real(t.path) === real(ruth.path));
  const tr = S.addTranscript({ name: t0.name, path: t0.path, itemId: t0.itemId || ruth.id, source: 'file', segments: segs });
  T.assert(st.transcripts.filter(t => t.path && real(t.path) === real(ruth.path)).length === 1, 'one transcript for the clip');
  const L = tr.lines;
  st.wall = { mode: 'columns', columns: [], loose: [] }; st.picky = { s: S.PICKY_LEVELS.balanced }; st.momentMarkers = {};
  const r = await T.action('story.moments', { type: 'all', useAI: false });
  const mine = r.moments.filter(m => L.some(l => l.id === m.lineId));
  const typeOf = re => { const l = L.find(x => re.test(x.text)); const m = mine.find(x => x.lineId === l.id); return m && m.type; };
  T.assert(typeOf(/start that again/) === 'blooper' && typeOf(/recording/) === 'blooper', 'bloopers: ' + JSON.stringify(mine.map(m => m.type)));
  T.assert(typeOf(/challah/) === 'funny' && typeOf(/Oh wow/) === 'off-camera' && typeOf(/taxi/) === 'off-camera' && typeOf(/passed away/) === 'poignant', 'funny, off camera, poignant');
  T.assert(/basic, no AI/.test(r.summary), r.summary);
  // a theme per type (“Make a theme of these”), each holding its moments
  for (const ty of M.ORDER) S.momentsTheme(mine.filter(m => m.type === ty), ty);
  const mt = st.themes.filter(t => /^Moments · /.test(t.name));
  T.assert(mt.length === 4 && mt.reduce((n, t) => n + t.lineIds.length, 0) === mine.length, 'four Moments themes: ' + mt.map(t => `${t.name} ${t.lineIds.length}`).join(', '));
  T.assert(mt.every(t => M.ORDER.some(ty => t.name === `Moments · ${M.TYPES[ty].plural}` && t.label === M.TYPES[ty].label)), 'each Moments theme in its type’s colour');
  // Build these moments: grouped by type, each clip labelled with a marker in its type's colour
  const oldB = await T.seqByName('Test – Story moments built'); if (oldB) await US.host.call('deleteSequence', { seqId: oldB.id });
  const bm = await S.buildMoments(job, mine, { colour: true, labels: true, name: 'Test – Story moments built' });
  const bi = await US.host.call('sequenceInfo', { seqId: bm.seq.id });
  const labelled = bi.markers.filter(m => M.ORDER.some(ty => m.name.startsWith(M.TYPES[ty].name)));
  T.assert(bi.video[0].clips.length === mine.length && labelled.length === mine.length, `built ${bi.video[0].clips.length} clips, ${labelled.length} labelled`);
  for (const m of labelled) { const ty = M.ORDER.find(t => m.name.startsWith(M.TYPES[t].name)); T.assert(m.color === S.LABEL_TO_MARKER[M.TYPES[ty].label], `${m.name}: marker colour ${m.color}`); }
  T.assert(new Set(labelled.map(m => m.color)).size === 4, 'four colours for four types');
  // a string-out of the whole interview, then markers
  const old = await T.seqByName(SEQ); if (old) await US.host.call('deleteSequence', { seqId: old.id });
  const seq = await US.host.call('newSequence', { name: SEQ, binPath: BIN, likeId: ruth.id });
  await US.host.call('placeClips', { seqId: seq.id, cursor: 0, clips: [{ id: ruth.id, in: 0, out: 60 }] });
  const shown = S.pickMoments(mine);
  const mk = await S.markMoments(job, { seqId: seq.id, list: shown });
  const info = await US.host.call('sequenceInfo', { seqId: seq.id });
  T.assert(info.markers.length === shown.length && mk.marks.length === shown.length, `${info.markers.length} markers for ${shown.length} moments`);
  for (const m of info.markers) {
    const want = mk.marks.find(x => x.name === m.name);
    T.assert(want, 'marker named ' + m.name);
    T.near(m.start, want.start, info.frame * 1.5, m.name + ' start'); T.near(m.end, want.end, info.frame * 1.5, m.name + ' end');
    T.assert(m.color === M.TYPES[want.type].marker, `${m.name}: colour ${m.color}, wanted ${M.TYPES[want.type].marker}`);
  }
  const taxi = info.markers.find(m => /^Off camera: Mum, the taxi/.test(m.name));
  T.near(taxi.start, 39.5, info.frame * 1.5, 'the second voice is marked where it is heard');
  // again: replaced, not doubled; then removed
  await S.markMoments(job, { seqId: seq.id, list: shown.filter(m => m.type === 'blooper') });
  const info2 = await US.host.call('sequenceInfo', { seqId: seq.id });
  T.assert(info2.markers.length === shown.filter(m => m.type === 'blooper').length && info2.markers.every(m => m.color === 1), 'marking again replaces: ' + info2.markers.map(m => m.name).join('|'));
  await S.removeMomentMarkers(job, seq.id);
  const info3 = await US.host.call('sequenceInfo', { seqId: seq.id });
  T.assert(info3.markers.length === 0 && info3.video[0].clips.length === 1, 'markers removed, the interview untouched');
  // the AI route: only the text around each moment is sent
  let sent = '';
  US.ai = { available: () => true, label: () => 'Claude', provider: () => 'claude', json: async req => { sent += [].concat(req.user).map(b => (typeof b === 'string' ? b : b.text)).join('\n'); return { moments: Array.from(req.user[0].text.matchAll(/^(\S+)\t/gm)).map(x => ({ lineId: x[1], type: /taxi/.test(L.find(l => l.id === x[1]) ? L.find(l => l.id === x[1]).text : '') ? 'funny' : 'none', reason: 'Lily interrupts', score: 0.9 })) }; } };
  const ai = await T.action('story.moments', { type: 'all', useAI: true });
  US.ai = realAI;
  const aiMine = ai.moments.filter(m => L.some(l => l.id === m.lineId));
  T.assert(!/\.mp4|\/Users\//.test(sent) && / \|\| /.test(sent), 'text with context only');
  T.assert(aiMine.length === 1 && aiMine[0].type === 'funny' && aiMine[0].by === 'ai' && aiMine[0].reasons[0] === 'Lily interrupts', 'AI classification applied: ' + JSON.stringify(aiMine));
  return { moments: mine.length, marked: info.markers.length, types: M.counts(mine) };
} finally {
  US.ai = realAI;
  Object.assign(st, saved);
  // put Ruth's real transcript back
  try { await S.importFiles(US.jobs.testJob('story'), [T.media('transcripts', 'I001_interview.srt')]); } catch (e) { /* the next Story test re-imports it */ }
  S.save();
  US.settings.set('story.binBase', prevBase || '');
}
