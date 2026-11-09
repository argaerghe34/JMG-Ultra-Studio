// resolve-only
// Story reads interviews from Resolve's own transcripts – of clips, a synced timeline and a multicam clip – without
// transcribing again, reads recordings of the same moment once, and builds selects whose clips bring their picture and
// sound linked; a synced timeline's line brings every switched-on track. In the test project only.
// Media: the test interview, plus a second "device" (its sound only, starting 1.5 s later, made here with ffmpeg).
const S = US.story, fs = require('fs'), path = require('path'), cp = require('child_process');
const BIN = 'Test – Story sources', TL = 'Test – Synced interview (Resolve)', OUT = 'Test – Selects from synced (Resolve)', OUTC = 'Test – Selects from clip (Resolve)', OUTM = 'Test – Selects from multicam (Resolve)';
const KEYS = ['story.binBase', 'story.handles', 'story.markers', 'story.themeNames', 'story.colourThemes', 'story.strongHighlight', 'story.strongFirst', 'story.transcribeMissing'];
const prev = Object.fromEntries(KEYS.map(k => [k, US.settings.get(k)]));
for (const [k, v] of Object.entries({ binBase: BIN, handles: 0, markers: false, themeNames: 'none', colourThemes: false, strongHighlight: false, strongFirst: false })) US.settings.set('story.' + k, v);
const st = S.loadState();
const saved = JSON.parse(JSON.stringify({ themes: st.themes, buildOff: st.buildOff, scope: st.scope, transcripts: st.transcripts }));
const theme = (id, name, ids) => ({ id, name, label: 5, custom: true, picked: true, lineIds: ids, manual: ids.slice() });
const ev = code => T.devEval(code);
const job = () => US.jobs.testJob('story');
async function fresh(name) { const old = await T.seqByName(name); if (old) await US.host.call('deleteSequence', { seqId: old.id }); }
// every item on a timeline: [type, track, clip name, start s, end s, linked names]
const items = name => T.seqByName(name).then(s => ev(`const t = R.needSeq(${JSON.stringify(s.id)}), out = [];
  for (const type of ['video', 'audio']) for (let k = 1; k <= t.GetTrackCount(type); k++) for (const ti of R.list(t.GetItemListInTrack(type, k)).filter(Boolean)) {
    const m = ti.GetMediaPoolItem(); let linked = []; try { linked = R.list(ti.GetLinkedItems()).map(x => x.GetMediaPoolItem().GetName() + '@' + R.list(x.GetTrackTypeAndIndex()).join('')); } catch (e) { linked = ['?' + e.message]; }
    out.push({ type, track: k, name: m ? m.GetName() : '', start: +R.tlSec(t, ti.GetStart()).toFixed(3), end: +R.tlSec(t, ti.GetEnd()).toFixed(3), linked });
  } return out;`));
const report = [];
try {
  // 1. media: the interview, and its sound from a second device (1.5 s later, a little duller)
  // (I001's sound is heard by Resolve as music, so a spoken interview is made here with the Mac's voice)
  const FF = fs.existsSync('/opt/homebrew/bin/ffmpeg') ? '/opt/homebrew/bin/ffmpeg' : 'ffmpeg';
  const vid = T.media('interview', 'J001_spoken_interview.mp4'), lav = T.media('interview', 'J001_lav.wav');
  if (!fs.existsSync(vid)) {
    const tmp = require('os').tmpdir(), aiff = path.join(tmp, 'j001.aiff');
    cp.execFileSync('/usr/bin/say', ['-v', 'Daniel', '-r', '170', '-o', aiff, [
      'So tell me where you grew up.', 'I grew up in Haifa, by the sea. My father ran a small bakery on the corner of the market, and every Friday morning the whole street queued for his challah.',
      'What did you learn from him?', 'He taught me that you get up early, you do the work properly, and you never send anyone home without bread, even when they cannot pay.',
      'When did you leave?', 'We moved to London when I was nine. I did not speak a word of English for the first year, and the school was cold and grey after the sunshine at home.',
      'And how did you find your way?', 'Football, mostly. Nobody cares what language you speak when you can pass the ball. By the second year I had friends, and by the third I was translating for my mother.'
    ].join(' [[slnc 900]] ')]);
    cp.execFileSync(FF, ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=1280x720:rate=25', '-i', aiff, '-shortest', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-ar', '48000', vid]);
  }
  if (!fs.existsSync(lav)) cp.execFileSync(FF, ['-y', '-v', 'error', '-ss', '1.5', '-i', vid, '-vn', '-ac', '1', '-ar', '48000', '-af', 'lowpass=f=6000', lav]);
  // reuse them wherever they are (making a multicam moves its recordings into an "Original Clips" bin)
  const known = (await US.host.call('storySources', {})).filter(s => s.kind !== 'multicam' && s.kind !== 'timeline');
  const findOrImport = async p => known.find(s => s.path === p || US.basename(s.path) === US.basename(p)) || (await T.importOnce([p], BIN))[0];
  const cv = await findOrImport(vid), ca = await findOrImport(lav);
  T.assert(cv && ca, 'both recordings imported');

  // 2. Resolve's own transcripts of both (made once; afterwards they're read as they are)
  for (const c of [cv, ca]) {
    const r = await US.host.call('storyReadTranscript', { id: c.id, transcribe: true }, { timeout: 0 });
    T.assert(r.words && r.words.length > 40, `${c.name}: a transcript with words (${r.words && r.words.length})`);
    report.push(`${c.name}: ${r.how} – ${r.words.length} words`);
    const again = await US.host.call('storyReadTranscript', { id: c.id });
    T.assert(again.how === 'read', `${c.name}: read the second time, not transcribed again`);
  }

  // 3. a synced timeline: the camera on V1/A1, the second device on A2, 1.5 s in
  let tl = await T.seqByName(TL);
  if (!tl) {
    tl = await ev(`const bin = R.ensureBin(${JSON.stringify(BIN)}), t = R.inFolder(bin, () => R.pool().CreateEmptyTimeline(${JSON.stringify(TL)}));
      R.project().SetCurrentTimeline(t); const fps = R.fps(t), v = R.needItem(${JSON.stringify(cv.id)}), a = R.needItem(${JSON.stringify(ca.id)});
      if (t.GetTrackCount('audio') < 2) t.AddTrack('audio', 'mono');
      R.pool().AppendToTimeline([{ mediaPoolItem: v, startFrame: 0, endFrame: Math.round(60 * R.clipFps(v)), trackIndex: 1, recordFrame: t.GetStartFrame() }]);
      R.pool().AppendToTimeline([{ mediaPoolItem: a, startFrame: 0, endFrame: Math.round(58 * R.clipFps(a)), mediaType: 2, trackIndex: 2, recordFrame: t.GetStartFrame() + Math.round(1.5 * fps) }]);
      R.forget(); return { id: R.id(t), name: t.GetName() };`);
  }
  const tlItems = await items(TL);
  report.push('synced timeline: ' + tlItems.map(i => `${i.type[0].toUpperCase()}${i.track} ${i.name} ${i.start}–${i.end}`).join(' · '));
  T.assert(tlItems.some(i => i.type === 'audio' && i.track === 2 && i.name === ca.name), 'the second device is on A2');

  // 4. the sources list: the timeline with its clips, both clips marked transcribed
  const src = await US.host.call('storySources', { check: true });
  const tlSrc = src.find(s => s.kind === 'timeline' && s.name === TL);
  T.assert(tlSrc && tlSrc.members.includes(cv.id) && tlSrc.members.includes(ca.id), 'the timeline lists both recordings: ' + JSON.stringify(tlSrc));
  T.assert(src.find(s => s.id === cv.id).transcribed && src.find(s => s.id === ca.id).transcribed, 'both clips show a transcript in Resolve');

  // 5. the timeline's own transcript (from its clips' transcripts, or made as a nested clip)
  let tr = await US.host.call('storyReadTranscript', { id: tlSrc.id });
  report.push('timeline transcript without transcribing: ' + (tr.none ? 'none' : tr.words.length + ' words'));
  if (tr.none) { tr = await US.host.call('storyReadTranscript', { id: tlSrc.id, transcribe: true }, { timeout: 0 }); report.push('timeline transcribed as a nested clip: ' + tr.words.length + ' words'); }
  T.assert(tr.words && tr.words.length > 40, 'a transcript of the timeline');
  const firstClip = (await US.host.call('storyReadTranscript', { id: cv.id })).words[0];
  T.near(tr.words[0].t, firstClip.t, 0.5, 'the timeline transcript is in timeline time (the camera starts at 0)');

  // 6. reading in Story: the two recordings are the same moment – read once
  st.transcripts = [];
  const r1 = await S.readResolveTranscripts(job(), { ids: [cv.id, ca.id], transcribe: false });
  report.push('read both recordings: ' + r1.summary);
  T.assert(/read once/.test(r1.summary) && st.transcripts.length === 1, 'two devices, one transcript: ' + r1.summary);
  T.assert(/nothing transcribed again/.test(r1.summary), 'nothing transcribed again: ' + r1.summary);
  await new Promise(r => setTimeout(r, 400)); document.querySelectorAll('.modal-back').forEach(m => m.remove());   // the multicam offer, not needed here
  const clipT = st.transcripts[0];
  report.push('kept: ' + clipT.name);

  // 7. selects from the clip: picture and sound, linked
  st.themes = [theme('c1', 'From the clip', (a => [a[0], a[a.length - 1]])(clipT.lines.filter(l => l.start > 3 && !/\?\s*$/.test(l.text))).map(l => l.id))]; st.buildOff = []; st.scope = { kind: 'all' }; S.reindex(); S.save();
  await fresh(OUTC);
  await T.action('story.build', { source: 'themes', name: OUTC });
  const oc = await items(OUTC);
  report.push('selects from the clip: ' + oc.map(i => `${i.type[0].toUpperCase()}${i.track} ${i.name} ${i.start}–${i.end} linked[${i.linked.join(',')}]`).join(' · '));
  const vC = oc.filter(i => i.type === 'video'), aC = oc.filter(i => i.type === 'audio');
  T.assert(vC.length === 2 && aC.length === 2, `2 video + 2 audio clips (got ${vC.length} + ${aC.length})`);
  T.assert(vC.every(v => v.linked.some(x => /@audio/.test(x))), 'each picture is linked to its sound');

  // 8. selects from the synced timeline: every switched-on track between the line's In and Out
  st.transcripts = [];
  const r2 = await S.readResolveTranscripts(job(), { ids: [tlSrc.id], transcribe: false });
  report.push('read the synced timeline: ' + r2.summary);
  const tlT = st.transcripts[0];
  T.assert(tlT && tlT.itemId === tlSrc.id && !tlT.path, 'the timeline is the interview');
  const ans = L => L.filter(l => l.start > 3 && !/\?\s*$/.test(l.text)), ls0 = ans(tlT.lines), ls = [ls0[0], ls0[ls0.length - 1]];
  st.themes = [theme('s1', 'From the synced timeline', ls.map(l => l.id))]; S.reindex(); S.save();
  await fresh(OUT);
  await T.action('story.build', { source: 'themes', name: OUT });
  const os = await items(OUT);
  report.push('selects from the synced timeline: ' + os.map(i => `${i.type[0].toUpperCase()}${i.track} ${i.name} ${i.start}–${i.end} linked[${i.linked.join(',')}]`).join(' · '));
  for (const want of [['video', 1, cv.name], ['audio', 1, cv.name], ['audio', 2, ca.name]]) T.assert(os.filter(i => i.type === want[0] && i.track === want[1] && i.name === want[2]).length === 2, `each line has ${want.join(' ')}`);
  const v1 = os.filter(i => i.type === 'video'), a2 = os.filter(i => i.type === 'audio' && i.track === 2);
  v1.forEach((v, k) => { T.near(a2[k].start, v.start, 0.05, 'A2 starts with the picture'); T.near(a2[k].end, v.end, 0.05, 'A2 ends with the picture'); });
  T.assert(v1.every(v => v.linked.some(x => /@audio1/.test(x))), 'picture and its sound are linked');

  // 9. a multicam clip of the two recordings (synced by sound): read, and its selects
  let mc = src.find(s => s.kind === 'multicam' && s.name.startsWith('J001'));
  if (!mc) { try { mc = await US.host.call('storyMakeMulticam', { ids: [cv.id, ca.id], name: 'J001 – multicam' }); } catch (e) { report.push('multicam not made: ' + e.message); } }
  if (mc) {
    const mt = await US.host.call('storyReadTranscript', { id: mc.id });
    report.push('multicam transcript without transcribing: ' + (mt.none ? 'none' : mt.words.length + ' words'));
    st.transcripts = [];
    const r3 = await S.readResolveTranscripts(job(), { ids: [mc.id], transcribe: true });
    report.push('read the multicam: ' + r3.summary);
    const mT = st.transcripts[0];
    st.themes = [theme('m1', 'From the multicam', (a => [a[0], a[a.length - 1]])(mT.lines.filter(l => l.start > 3 && !/\?\s*$/.test(l.text))).map(l => l.id))]; S.reindex(); S.save();
    await fresh(OUTM);
    await T.action('story.build', { source: 'themes', name: OUTM });
    const om = await items(OUTM);
    report.push('selects from the multicam: ' + om.map(i => `${i.type[0].toUpperCase()}${i.track} ${i.name} ${i.start}–${i.end} linked[${i.linked.join(',')}]`).join(' · '));
    T.assert(om.filter(i => i.type === 'video').length === 2, 'two multicam selects with picture');
    T.assert(om.filter(i => i.type === 'audio').length >= 2, 'and their sound');
  }
} finally {
  Object.assign(st, saved); S.reindex(); S.save();
  for (const [k, v] of Object.entries(prev)) US.settings.set(k, v);
  window.__e2eReport = report;
}
