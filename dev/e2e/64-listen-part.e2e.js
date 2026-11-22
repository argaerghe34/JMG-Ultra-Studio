// Story › English translation › By listening – only the part in the cut (1.3.43), in the real editor. Story works on a
// sequence that uses two stretches of the test interview, with In and Out marked around part of it: only the spans of
// the interview's REAL sound inside that part are listened to (a stand-in listener counts what it is given – no AI,
// nothing sent), the sound between is never sent, the card says so, and switching it off listens to the rest.
if (!US.story || !US.storyEnglish || !US.storyListen || !US.delivery) throw new Error('Story, English translation and By listening are not loaded in the panel');
const S = US.story, E = US.storyEnglish, LI = US.storyListen, D = US.delivery, P = LI._pure, fs = require('fs');
const BIN = 'Test – Story', SEQ = 'Test – Listen part';
for (let i = 0; i < 100 && US.jobs.current; i++) await T.sleep(200);
const releaseU = US.understand && US.understand.pause ? await US.understand.pause() : () => {};
const releaseD = await D.pause();
const st = S.loadState();
const saved = JSON.parse(JSON.stringify({ scope: st.scope || { kind: 'all' }, english: st.english || null }));
const keep = { routes: Object.assign({}, D.routes), media: US.ai.media, part: US.settings.get('story.listenPart'), tool: US.tools.current, listened: null, eng: null };
let cloud = 0, seqId = '';
const info = {};
try {
  US.ai.media = async () => { cloud++; throw new Error('this test must not reach the cloud'); };
  const [ruth] = await T.importOnce([T.media('interview', 'I001_interview.mp4')], BIN);
  const job = US.jobs.testJob('story');
  await S.importFiles(job, [T.media('transcripts', 'I001_interview.srt')]);
  const real = p => { try { return fs.realpathSync(p); } catch (e) { return p; } };
  const t = st.transcripts.find(x => x.path && real(x.path) === real(ruth.path));
  T.assert(t, 'the interview is in Story');
  keep.listened = LI.forget(t.key); keep.eng = E.forget(t.key);
  // a cut: 4–20 s of the interview, then 40–56 s; In and Out around 8–28 s of the sequence (source 8–20 and 40–44)
  const old = await T.seqByName(SEQ); if (old) await US.host.call('deleteSequence', { seqId: old.id });
  const seq = await US.host.call('newSequence', { name: SEQ, binPath: BIN, likeId: ruth.id }); seqId = seq.id;
  await US.host.call('placeClips', { seqId: seq.id, cursor: 0, clips: [{ id: ruth.id, in: 4, out: 20 }, { id: ruth.id, in: 40, out: 56 }] });
  await T.setInOut(seq.id, 4, 20);
  await S.setScope(job, { kind: 'sequence', seqId: seq.id, seqName: SEQ, inOut: true });
  const parts = S.scopeParts(t.key);
  T.assert(parts.length === 2 && Math.abs(parts[0][0] - 8) < 0.1 && Math.abs(parts[0][1] - 20) < 0.1 && Math.abs(parts[1][0] - 40) < 0.1 && Math.abs(parts[1][1] - 44) < 0.1, 'the stretches of the interview the cut uses between In and Out: ' + JSON.stringify(parts));
  info.parts = parts;

  // the card: the switch is there, on, naming the sequence
  US.settings.set('story.listenPart', true);
  US.tools.open('home'); await T.sleep(150); US.tools.open('story', { tab: 'transcripts' }); await T.sleep(500);
  const card = Array.from(document.querySelectorAll('.section')).find(x => /^English translation/.test((x.querySelector('.section-head') || {}).textContent || ''));
  T.assert(card && card.textContent.includes(`Only the part in “${SEQ}” between In and Out`), 'the card offers “Only the part in the sequence”: ' + (card && card.textContent.slice(0, 300)));

  // a stand-in listener: counts the spans of real sound it is given
  const asked = [];
  D.routes.hearing = async () => ({ ok: true, at: Date.now(), label: 'Stand-in listener', detail: '' });
  D.routes.listen = async (plan, req) => {
    if (req.schema === P.HEAR_SCHEMA) { const m = /(\d+):(\d\d)–(\d+):(\d\d)/.exec(req.user[1].media.note); asked.push({ from: +m[1] * 60 + +m[2], to: +m[3] * 60 + +m[4], secs: req.user[1].media.seconds }); return { speech: true, text: 'Shalom ' + asked.length, language: 'Hebrew' }; }
    if (req.schema === P.TR_SCHEMA) return { spans: req.user.split('(number<TAB>what was said):\n')[1].split('\n').map(r => ({ n: +r.split('\t')[0], english: 'Hello ' + r.split('\t')[0] })) };
    throw new Error('an unexpected request');
  };
  const standIn = { on: true, where: 'local', kind: 'helper', id: 'e2e-part@1', label: 'Stand-in listener', langs: {}, chunkSec: 30, model: { id: 'e2e-part', name: 'Stand-in listener', version: '1' } };
  const r = await LI.run(job, { keys: [t.key], plan: standIn });
  const rec = LI.peek(t.key), inPart = s => parts.some(p => s.end > p[0] && s.start < p[1]);
  const want = rec.grid.filter(inPart);
  T.assert(rec && !rec.done && rec.spans.length === want.length && want.length < rec.grid.length && asked.length === want.length, `only the spans in the part were listened to: ${asked.length} of ${rec.grid.length} (${want.length} in the part) – ${r.summary}`);
  T.assert(rec.spans.every(inPart), 'every span heard lies in the part');
  T.assert(asked.every(a => parts.some(p => a.to >= p[0] - 1 && a.from <= p[1] + 1)), 'and every request carried sound from inside it: ' + JSON.stringify(asked));
  T.assert(/only the part used in “Test – Listen part” between In and Out/.test(r.summary) && r.done === 1, r.summary);
  const lines = t.lines.filter(l => E.enOf(l));
  T.assert(lines.length >= 1 && lines.every(l => parts.some(p => l.end > p[0] - 1 && l.start < p[1] + 1)), `the English went to the lines in the part (${lines.length})`);
  info.part = { grid: rec.grid.length, listened: asked.length, secondsSent: +US.sum(asked.map(a => a.secs)).toFixed(1), summary: r.summary };

  // switched off: the rest of the interview, and only what wasn't heard yet
  US.settings.set('story.listenPart', false);
  const before = asked.length;
  const r2 = await LI.run(job, { keys: [t.key], plan: standIn });
  const rec2 = LI.peek(t.key);
  T.assert(rec2.done && asked.length - before === rec2.grid.length - want.length, `off: the rest was listened to, nothing twice (${asked.length - before} more) – ${r2.summary}`);
  T.assert(cloud === 0, 'nothing went to the cloud');
  info.whole = { more: asked.length - before, summary: r2.summary };
  return info;
} finally {
  Object.assign(D.routes, keep.routes); US.ai.media = keep.media;
  US.settings.set('story.listenPart', keep.part === undefined ? null : keep.part);
  try { const t = st.transcripts.find(x => /I001_interview/.test(x.path || '')); if (t) { LI.forget(t.key); E.forget(t.key); } } catch (e) { /* nothing */ }
  if (keep.listened) LI.unforget(keep.listened);
  if (keep.eng) E.unforget(keep.eng);
  Object.assign(st, { scope: saved.scope }); if (saved.english) st.english = saved.english;
  S.reindex(); S.save(); E.flush();
  if (seqId) await US.host.call('deleteSequence', { seqId }).catch(() => {});
  E.reset(); D.reset();
  releaseD(); releaseU();
  if (keep.tool) US.tools.open(keep.tool);
}
