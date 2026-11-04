// Mac only (the interviews are made with the Mac's voices); in Premiere the sound comes through Media Encoder, in Resolve its Render Queue
// Telling the voices apart, the names into Premiere's transcripts and Check the words, in real Premiere:
//  1. three made-up interviews (with transcripts in Premiere's own JSON, as its Text panel exports them) (the same interviewer asking, a different person answering in each), as .m4a – not a
//     plain WAV, so the panel has to have their sound rendered: by Media Encoder, in the background;
//  2. Tell the voices apart: questions and answers told apart in each, the interviewer one voice across all three;
//  3. names given; the transcripts saved in Premiere's own transcript format with them;
//  4. Check the words: the transcript's “FTL” and “FJell” (said “F J L”) found and corrected, timings kept, and the
//     corrected transcript saved again. Story is put back as it was afterwards.
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');
const S = US.story, V = US.storyVoices, P = US.storyProof;
T.assert(S && V && P, 'Story, voices and Check the words are loaded');
const DIR = path.join(os.tmpdir(), 'us-e2e-voices-v2'), BIN = 'Test – Voices';
fs.mkdirSync(DIR, { recursive: true });
const Q = ['So tell me where you grew up.', 'And what happened after that?', 'How did you get involved with the charity?', 'What would you say to a new volunteer?'];
const A = {
  Samantha: ['I grew up in a small town in the north, near the river, where everybody knew everybody.', 'After that we moved to the city, and it took years to settle.', 'I joined F J L in two thousand and nineteen, and F J L changed my life.', 'Just turn up. F J L will look after you.'],
  Karen: ['I grew up by the sea, in a house full of brothers and sisters.', 'Then I trained as a nurse and worked nights for ten years.', 'A friend took me to F J L, and I have been there every week since.', 'Bring your patience, and a sense of humour.'],
  Rishi: ['I grew up in Leeds, above my father’s shop.', 'Then I went to university and studied engineering.', 'I met the people from F J L at a street party.', 'Listen more than you talk.']
};
// what the transcription "heard": FJL right in the first, mis-heard in the others
const HEARD = { Samantha: x => x.replace(/F J L/g, 'FJL'), Karen: x => x.replace(/F J L/g, 'FTL'), Rishi: x => x.replace(/F J L/g, 'FJell') };
const say = (voice, text, out) => { if (!fs.existsSync(out)) cp.execFileSync('say', ['-v', voice, '-o', out, '--file-format=WAVE', '--data-format=LEI16@16000', text]); };
function pcm(file) { const b = fs.readFileSync(file); let p = 12; while (p < b.length - 8) { const id = b.toString('ascii', p, p + 4), n = b.readUInt32LE(p + 4); if (id === 'data') return b.subarray(p + 8, p + 8 + n); p += 8 + n + (n & 1); } throw new Error('no data in ' + file); }
function wav(samples, out) { const h = Buffer.alloc(44); h.write('RIFF', 0); h.writeUInt32LE(36 + samples.length, 4); h.write('WAVEfmt ', 8); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(16000, 24); h.writeUInt32LE(32000, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(samples.length, 40); fs.writeFileSync(out, Buffer.concat([h, samples])); }
const srtTime = s => { const ms = Math.round(s * 1000); return `${String(Math.floor(ms / 3600000)).padStart(2, '0')}:${String(Math.floor(ms / 60000) % 60).padStart(2, '0')}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')},${String(ms % 1000).padStart(3, '0')}`; };
function makeInterview(who) {
  const m4a = path.join(DIR, `Interview ${who}.m4a`), srt = path.join(DIR, `Interview ${who} – transcript.json`), truth = [];
  if (fs.existsSync(m4a) && fs.existsSync(srt) && fs.existsSync(srt + '.json')) return { m4a, srt, truth: JSON.parse(fs.readFileSync(srt + '.json', 'utf8')) };
  const parts = [], gap = Buffer.alloc(16000 * 2 * 0.7), cues = []; let t = 0.5; parts.push(Buffer.alloc(16000 * 2 * 0.5));
  Q.forEach((q, k) => {
    for (const [voice, text] of [['Daniel', q], [who, A[who][k]]]) {
      const f = path.join(DIR, `${voice}-${who}-${k}-${text.length}.wav`); say(voice, text, f);
      const d = pcm(f), secs = d.length / 32000;
      cues.push({ start: t, end: t + secs, text: voice === 'Daniel' ? text : HEARD[who](text) }); truth.push({ start: t, end: t + secs, who: voice === 'Daniel' ? 'asker' : who });
      parts.push(d, gap); t += secs + 0.7;
    }
  });
  const w = path.join(DIR, `Interview ${who}.wav`); wav(Buffer.concat(parts), w);
  cp.execFileSync('afconvert', ['-f', 'm4af', '-d', 'aac', w, m4a]); fs.unlinkSync(w);
  // the transcript as Premiere makes it (Text panel › Export): words with times, one speaker “Unknown” – Premiere doesn't tell them apart
  const seg = c => { const ws = c.text.split(' '), d = (c.end - c.start) / ws.length; return { start: c.start, duration: c.end - c.start, speaker: 'u1', language: 'en-us', words: ws.map((w, i) => ({ confidence: 1, duration: d * 0.9, eos: i === ws.length - 1, start: +(c.start + i * d).toFixed(2), tags: [], text: w, type: 'word' })) }; };
  fs.writeFileSync(srt, JSON.stringify({ language: 'en-us', segments: cues.map(seg), speakers: [{ id: 'u1', name: 'Unknown' }] }));
  fs.writeFileSync(srt + '.json', JSON.stringify(truth));
  return { m4a, srt, truth };
}
const ivs = ['Samantha', 'Karen', 'Rishi'].map(w => Object.assign({ who: w }, makeInterview(w)));
const items = await T.importOnce(ivs.map(x => x.m4a), BIN);
T.assert(items.every(Boolean), 'the interviews imported');

const st = S.loadState(), saved = JSON.parse(JSON.stringify({ transcripts: st.transcripts, speakers: st.speakers, glossary: st.glossary, proof: st.proof, voiceID: st.voiceID, scope: st.scope }));
// the sound of each: rendered by Media Encoder (watched), not by Premiere
const runs = [], realRun = US.encoder && US.encoder.run;
if (US.encoder) US.encoder.run = async (tasks, job, opts) => { runs.push(tasks.map(t => ({ audio: t.audio, item: t.itemId }))); return realRun(tasks, job, opts); };
const cache = [], notes = []; const note = (...a) => notes.push(a.join(' '));
try {
  st.transcripts = []; st.speakers = {}; st.glossary = []; st.proof = {}; delete st.voiceID; st.scope = { kind: 'all' };
  ivs.forEach((iv, i) => { S.addTranscript({ name: `Interview ${iv.who}`, path: iv.m4a, itemId: items[i].id, source: 'file', file: iv.srt, segments: US.transcript.parseFile(iv.srt).segments }); });
  const ts = S.state().transcripts;
  // who really speaks each line: the turn its middle falls in
  const whoSays = (i, l) => { const m = (l.start + l.end) / 2, c = ivs[i].truth.find(x => m >= x.start - 0.3 && m <= x.end + 0.3); return c ? c.who : '?'; };
  T.assert(ts.length === 3 && ts.every((t, i) => t.lines.length >= ivs[i].truth.length && t.lines.every(l => whoSays(i, l) !== '?')), 'lines split at the turns: ' + ts.map(t => t.lines.length));
  T.assert(ts.every((t, i) => t.lines.every(l => { const w = whoSays(i, l); return t.lines.filter(x => x !== l && Math.abs(x.start - l.start) < 0.01).length === 0 && w; })), 'no line mixes two people');
  // a fresh listen: no voice prints or rendered sound kept from an earlier run
  for (const f of fs.readdirSync(US.fsx.tempDir())) if (/^aud-/.test(f)) { const p = path.join(US.fsx.tempDir(), f); cache.push(p); }
  for (const f of fs.readdirSync(US.fsx.cacheDir())) if (/^voices-/.test(f)) fs.unlinkSync(path.join(US.fsx.cacheDir(), f));
  for (const p of cache) { try { fs.unlinkSync(p); } catch (e) { /* gone */ } }

  const t0 = Date.now();
  const r = await V.listen(US.jobs.testJob('voices'));
  note('listen:', r.summary, `${Math.round((Date.now() - t0) / 1000)} s`, 'Media Encoder renders:', JSON.stringify(runs));
  if (!US.app.is('resolve')) T.assert(runs.length === 3 && runs.every(x => x[0].audio), 'each interview’s sound rendered by Media Encoder (in the background): ' + JSON.stringify(runs));

  // questions vs answers, in each; the interviewer the same voice across all three
  const all = S.state().transcripts;
  let wrong = 0; const askers = new Set(), answers = new Map();
  all.forEach((t, i) => t.lines.forEach(l => {
    const truth = whoSays(i, l);
    if (truth === 'asker') askers.add(l.speaker); else { if (!answers.has(truth)) answers.set(truth, new Set()); answers.get(truth).add(l.speaker); }
  }));
  const asker = [...askers][0];
  note('by line:', all.map((t, i) => `${t.name}: ` + t.lines.map(l => `${whoSays(i, l)[0]}=${l.speaker.replace('Voice ', 'V')}${l.voiceSure != null ? '(' + l.voiceSure.toFixed(2) + ')' : ''}`).join(' ')).join(' | '));
  all.forEach((t, i) => t.lines.forEach(l => { if ((whoSays(i, l) === 'asker') !== (l.speaker === asker)) wrong++; }));
  note('voices: askers', [...askers], 'answers', JSON.stringify([...answers].map(([w, s]) => [w, [...s]])), 'lines wrong', wrong);
  T.assert(askers.size === 1, 'the interviewer is one voice in every interview: ' + [...askers]);
  T.assert(wrong <= 1, `${wrong} of ${all.reduce((n, t) => n + t.lines.length, 0)} lines given the wrong side`);
  T.assert([...answers.values()].every(s => s.size === 1 && ![...s][0].includes(asker)), 'each interviewee is one voice');
  T.assert(new Set([...answers.values()].map(s => [...s][0])).size === answers.size, 'different people are different voices (not joined across interviews by sound alone)');
  const offers = V.soundsLike(S.state().voiceID ? S.state().voiceID.voices : [], [...answers.get('Samantha')][0], 2).map(x => `${x.key} ${x.d.toFixed(2)}`);
  note('sounds like Samantha (offered as “Same as…?” when close):', offers.join(', '));

  // 3. names, then Premiere's transcript format with them
  const st2 = S.state();
  st2.speakers[asker].name = 'Jacob';
  for (const [who, set] of answers) st2.speakers[[...set][0]].name = who;
  S.save();
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'us-e2e-named-'));
  const ex = V.exportNamed({ dir: out, resolve: false });
  T.assert(ex.files.length === 3, 'a file per interview');
  const j = JSON.parse(fs.readFileSync(ex.files.find(f => /Samantha/.test(f.t.name)).file, 'utf8'));
  T.assert(JSON.stringify(Object.keys(j)) === '["language","segments","speakers"]' && j.speakers.map(s => s.name).sort().join() === 'Jacob,Samantha', 'Premiere’s transcript format with the names: ' + JSON.stringify(j.speakers));
  T.assert(j.segments.every(s => s.words.length && s.words.every(w => w.start >= s.start - 0.01)), 'every segment has its words, in time');

  // 4. Check the words: FTL and FJell for FJL, found from the short form said often – and from the name given
  const lines = st2.transcripts.flatMap(t => t.lines);
  const found = P.find(lines, { terms: ['FJL'] }), fjl = found.find(g => g.right === 'FJL');
  note('check the words:', found.map(g => `${g.heard.join('/')}→${g.right || '?'} (${g.hits.length}, ${g.kind})`).join(' · '));
  T.assert(fjl && fjl.heard.includes('FTL') && fjl.heard.includes('FJell'), 'FTL and FJell found for FJL');
  const before = new Map(lines.map(l => [l.id, { w: l.w ? l.w.slice() : null, start: l.start, end: l.end }]));
  const e = P.entryFor(fjl, 'FJL', new Set(fjl.hits.map(h => h.lineId + ':' + h.i)));
  st2.glossary = P.merge(st2.glossary, e);
  US.storyGlossary.apply(lines, st2.glossary); S.reindex(); S.save();
  const fixed = lines.filter(l => fjl.hits.some(h => h.lineId === l.id));
  T.assert(fixed.every(l => /\bFJL\b/.test(l.text) && !/FTL|FJell/.test(l.text)), 'corrected: ' + fixed.map(l => l.text).join(' | '));
  T.assert(fixed.every(l => { const b = before.get(l.id); return l.start === b.start && l.end === b.end && (!b.w || (l.w && l.w[0] === b.w[0] && l.w[l.w.length - 1] === b.w[b.w.length - 1])); }), 'the line and its words keep their times');
  const ex2 = V.exportNamed({ dir: out, resolve: false, keys: [st2.transcripts.find(t => /Karen/.test(t.name)).key] });
  const j2 = JSON.parse(fs.readFileSync(ex2.files[0].file, 'utf8')), said = j2.segments.flatMap(s => s.words.map(w => w.text)).join(' ');
  T.assert(ex2.files.length === 1 && /FJL/.test(said) && !/FTL/.test(said), 'the corrected interview saved again for Premiere');
  note('saved for Premiere:', ex.files.map(f => path.basename(f.file)).join(', '), '→', out);
  return notes;
} catch (e) { throw new Error(e.message + '\n      NOTES: ' + notes.join('\n      ')); } finally {
  if (US.encoder) US.encoder.run = realRun;
  const s = S.state(); Object.assign(s, saved); if (!saved.voiceID) delete s.voiceID; if (!saved.proof) delete s.proof; S.reindex(); S.save();
}
