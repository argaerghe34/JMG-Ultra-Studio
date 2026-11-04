// both editors (Mac: the interviews from 50-voices-names-proof)
// costs-ai – real Claude requests (about 20–60¢): run with `node dev/e2e/run.js 52-ai` or E2E_AI=1
// The AI features in real Premiere, on the three interviews 50-voices-names-proof makes (run that first):
//  1. names in the interviews suggested by the AI, with titles – FJL among them;
//  2. the Agent: a short goal → its plan → it searches, reads and builds a new sequence on its own, then finishes;
//     never touching any other sequence; every request kept in What was sent to AI as one job, with what it was about;
//  3. the wiki looks something up, with a line on what it's about.
// Story is put back as it was afterwards.
const fs = require('fs'), path = require('path'), os = require('os');
const S = US.story, P = US.storyProof, A = US.agent;
T.assert(US.ai && US.ai.available(), 'AI is set up in Settings');
T.assert(A && !A.off, 'the Agent is on');
const DIR = path.join(os.tmpdir(), 'us-e2e-voices-v2'), BIN = 'Test – Voices';
const ivs = ['Samantha', 'Karen', 'Rishi'].map(w => ({ who: w, m4a: path.join(DIR, `Interview ${w}.m4a`), srt: path.join(DIR, `Interview ${w} – transcript.json`) }));
T.assert(ivs.every(x => fs.existsSync(x.m4a) && fs.existsSync(x.srt)), 'the interviews from 50-voices-names-proof are there (run it first)');
const items = await T.importOnce(ivs.map(x => x.m4a), BIN);
const notes = [], note = (...a) => notes.push(a.join(' '));
const st = S.loadState(), saved = JSON.parse(JSON.stringify({ transcripts: st.transcripts, speakers: st.speakers, glossary: st.glossary, proof: st.proof, scope: st.scope, wiki: st.wiki, themes: st.themes }));
const seqsBefore = await US.host.call('listSequences');
const spentBefore = US.ai.spending().cost;
try {
  st.transcripts = []; st.speakers = {}; st.glossary = []; st.proof = {}; st.scope = { kind: 'all' }; st.themes = [];
  ivs.forEach((iv, i) => S.addTranscript({ name: `Interview ${iv.who}`, path: iv.m4a, itemId: items[i].id, source: 'file', file: iv.srt, segments: US.transcript.parseFile(iv.srt).segments }));
  S.save();
  const lines = S.state().transcripts.flatMap(t => t.lines);

  // 1. names, with titles
  const r1 = await US.ai.json(P.namesRequest(P.nameCandidates(lines), { known: [] }));
  const people = P.namesFrom(r1, lines);
  note('names:', people.map(p => `${p.name}${p.title ? ' (' + p.title + ')' : ''} [${p.kind}${p.heard.length ? '; heard ' + p.heard.join('/') : ''}]`).join(' · '));
  T.assert(people.some(p => /^FJL$/i.test(p.name)), 'FJL among the names: ' + people.map(p => p.name));
  T.assert(people.some(p => /Leeds/.test(p.name) && p.kind === 'place'), 'Leeds, a place');

  // 2. the Agent: a short goal, on its own
  const events = [];
  const s = A.newSession('A 40-second piece on how people got involved with FJL, ending on their advice to a new volunteer.');
  const about2 = US.storyContext.about(s.goal); let job2 = null;
  const t0 = Date.now();
  // as the Agent tab runs it: inside a job (so its requests are kept together), with a spending limit
  await US.jobs.run({ title: 'Agent', tool: 'agent', about: about2 }, async job => {
    job2 = job; US.ai.setBudget(1);
    try { await A.run(job, s, { maxSteps: 12, confirmPlan: async p => { events.push({ type: 'plan', plan: p.plan }); return { ok: true, note: '' }; }, onEvent: e => events.push(e) }); }
    finally { US.ai.endBudget(); }
    return { summary: 'agent' };
  });
  const tools = events.filter(e => e.type === 'tool').map(e => e.tool);
  note(`agent: ${s.steps} steps in ${Math.round((Date.now() - t0) / 1000)} s · plan: ${(events.find(e => e.type === 'plan') || { plan: [] }).plan.join(' / ')} · tools: ${tools.join(', ')} · done: ${s.done} · “${s.summary || ''}” · check: ${(s.check || []).join(' / ')}`);
  const warns = events.filter(e => e.type === 'warn').map(e => e.text); if (warns.length) note('agent warnings:', warns.join(' | '));
  const errs = s.turns.map(t => t.user).filter(u => /^RESULT of [^:]+:\nERROR/.test(u)); if (errs.length) note('tool errors the AI was told:', errs.map(u => u.split('\n').slice(0, 2).join(' ')).join(' | ').slice(0, 900));
  T.assert(events.some(e => e.type === 'plan'), 'it showed a plan first');
  T.assert(tools.includes('search') && tools.includes('build'), 'it searched and built');
  T.assert(s.versions.length >= 1, 'it made a sequence');
  const made = await T.seqByName(s.versions[0].name);
  T.assert(made, 'the sequence is in the project: ' + s.versions[0].name);
  const info = await US.host.call('sequenceInfo', { seqId: made.id });
  note(`built “${made.name}”: ${info.video.reduce((n, t) => n + t.clips.length, 0)} clips, ${Math.round(info.duration)} s`);
  T.assert(info.duration > 5 && info.duration < 120, 'a sensible length: ' + info.duration);
  T.assert(s.done, 'it finished (called finish) within its steps');
  const seqsAfter = await US.host.call('listSequences');
  T.assert(seqsBefore.every(b => seqsAfter.some(a => a.id === b.id)), 'no sequence of the project went missing');
  // kept as one job in What was sent to AI, with what it was about
  const sent = US.ai.sent.list(), g = US.ai.sent.groups(sent).find(x => x.key === 'job:' + job2.id);
  T.assert(g && g.items.length === s.steps && g.about === about2, `one group for the run, with its subtitle: ${g ? g.items.length + ' / ' + g.about : 'none'}`);

  // 3. the wiki looks something up, with a line on what it's about
  const W = US.storyWiki;
  if (W && W.ask) {
    const q = 'Where did Rishi grow up?', about = US.storyContext.about(q);
    note('wiki subtitle:', about);
    T.assert(/Rishi/.test(about), 'the subtitle names the interview');
    let r3 = null;
    await US.jobs.run({ title: 'Looking it up', tool: 'wiki', about }, async job => { r3 = await W.ask(job, q); return { summary: 'wiki' }; });
    note('wiki:', r3.ask.answer.slice(0, 160));
    T.assert(/Leeds/i.test(r3.ask.answer), 'the answer: Leeds');
  }
  note(`AI cost of this test: $${(US.ai.spending().cost - spentBefore).toFixed(2)}`);
  return notes;
} catch (e) { throw new Error(e.message + '\n      NOTES: ' + notes.join('\n      ')); } finally {
  const s2 = S.state(); Object.assign(s2, saved); if (!saved.proof) delete s2.proof; if (!saved.wiki) delete s2.wiki; S.reindex(); S.save();
}
