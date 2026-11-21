// Story › English translation › By listening, in the real editor (no AI cost, nothing downloaded, nothing sent anywhere).
// The test interview gets a transcript as a speech-to-text would leave a Hebrew interview: English nonsense. Story says
// it can't be used and offers “Translate by listening” first. The interview's REAL sound is read here and cut into
// spans by this computer (its soundtrack is synthetic bursts at known phrase times – so the spans are checked against
// the truth file); a stand-in listening model gets one span of real WAV sound at a time, then its own words as text.
// Then for real: Story's transcript replaced by one made by listening (this computer's times), its English, the
// bilingual Word document, the .srt – all from the listened transcript. The cloud is refused without the project's
// yes. If a listening model IS on this computer, it really listens to speech made here with the Mac's “say” (a Hebrew
// voice when one is installed) and what it returns is logged, not judged.
// Everything made here is put back afterwards, and the test can be run twice in the same panel session.
if (!US.story || !US.storyEnglish || !US.storyListen || !US.delivery) throw new Error('Story, English translation and By listening are not loaded in the panel');
const S = US.story, E = US.storyEnglish, LI = US.storyListen, D = US.delivery, P = LI._pure, fs = require('fs'), path = require('path'), zlib = require('zlib');
const BIN = 'Test – Story';
const W = ms => new Promise(r => setTimeout(r, ms));
const $ = (q, root) => (root || document).querySelector(q), $$ = (q, root) => Array.from((root || document).querySelectorAll(q));
for (let i = 0; i < 100 && US.jobs.current; i++) await T.sleep(200);
const releaseU = US.understand && US.understand.pause ? await US.understand.pause() : () => {};
const releaseD = await D.pause();
const encoders = () => require('child_process').execSync(process.platform === 'win32' ? 'tasklist' : 'ps -axo comm').toString().split('\n').filter(l => /Media Encoder/i.test(l)).length;
const encodersBefore = encoders();

const store = US.projectStore(US.ctx.project.path || US.ctx.project.name);
const KEYS = ['delivery.on', 'delivery.where'], SET = ['story.binBase', 'story.exportDir'];
const keep = { store: Object.fromEntries(KEYS.map(k => [k, store.get(k)])), set: Object.fromEntries(SET.map(k => [k, US.settings.get(k)])), consent: US.ai.deliveryOn(), hearing: US.settings.get('delivery.hearing'), routes: Object.assign({}, D.routes), media: US.ai.media, tool: US.tools.current, english: null, listened: [] };
const outDir = path.join(fs.realpathSync(US.host.extensionDir()), 'dev', 'test-project', 'exports'); fs.mkdirSync(outDir, { recursive: true });
US.settings.set('story.binBase', BIN); US.settings.set('story.exportDir', outDir);
const st = S.loadState();
const savedState = JSON.parse(JSON.stringify({ themes: st.themes, wall: st.wall, glossary: st.glossary || [], scope: st.scope || { kind: 'all' }, proView: st.proView || null, english: st.english || null }));
st.scope = { kind: 'all' }; st.english = null;
const HEB = ['שמי רות ואני גדלתי בדירה קטנה', 'כל יום שישי השולחן היה מלא', 'בעזרת השם', 'אבא שלי תמיד אמר שבית חם כמו הדלת הפתוחה'];
const ENG = ['My name is Ruth and I grew up in a small flat.', 'Every Friday the table was full.', 'B’ezrat Hashem [with God’s help].', 'My father always said a home is as warm as its open door.'];
const log = [], made = [];
let cloudCalls = 0;
try {
  // as it comes for this test: delivery off, on this computer, no cloud yes
  store.set('delivery.on', false); store.set('delivery.where', 'local'); US.ai.setDelivery(false); D.reset();
  US.ai.media = async () => { cloudCalls++; throw new Error('this test must not reach the cloud'); };

  // the interview: the real clip, with the transcript a speech-to-text leaves of Hebrew it can't follow
  const [ruth] = await T.importOnce([T.media('interview', 'I001_interview.mp4')], BIN);
  const job = US.jobs.testJob('story');
  await S.importFiles(job, [T.media('transcripts', 'I001_interview.srt')]);
  const real = p => { try { return fs.realpathSync(p); } catch (e) { return p; } };
  const t0 = st.transcripts.find(t => t.path && real(t.path) === real(ruth.path));
  T.assert(t0, 'Story linked the transcript to the clip');
  const junk = S.addTranscript({ name: t0.name, path: t0.path, itemId: t0.itemId || ruth.id, source: 'file', segments: [
    { start: 0.6, end: 5.3, speaker: '', text: 'Shimmy root van he got ality bedera ketana' }, { start: 12.5, end: 19.1, speaker: '', text: 'Call yom she she ha shool khan hi a ma lay' }, { start: 21.5, end: 26, speaker: '', text: 'Abba shelly tammy da mar' }] });
  S.reindex(); S.save();
  const key = junk.key;
  keep.english = E.forget(key); keep.listened.push(LI.forget(key));
  E.setLanguage(key, 'Hebrew');

  // 1. Story says the transcript can't be used for Hebrew, and offers listening first
  const s0 = E.statuses().find(s => s.key === key);
  T.assert(s0.lang === 'Hebrew' && LI.unusable(junk, 'Hebrew') === 'script', 'a Hebrew interview written in Latin letters: the transcript is unusable – ' + JSON.stringify({ lang: s0.lang, why: LI.unusable(junk, 'Hebrew') }));
  US.tools.open('home'); await W(150); US.tools.open('story', { tab: 'transcripts' }); await W(500);
  const card = () => $$('.section').find(x => /^English translation/.test(($('.section-head', x) || {}).textContent || ''));
  const row = () => $(`.eng-row[data-english="${CSS.escape(key)}"]`, card());
  const btns = () => $$('button', row()).map(b => ({ text: b.textContent.trim(), primary: b.classList.contains('primary') }));
  T.assert(row() && btns().some(b => /^Translate by listening/.test(b.text) && b.primary) && !btns().some(b => /^Translate$/.test(b.text) && b.primary) && /isn’t written in Hebrew/.test(row().textContent), '“Translate by listening” is the first choice on the row, with why: ' + JSON.stringify(btns()));
  T.assert(/By listening\./.test(card().textContent) && /small models on this computer are weak at Hebrew and Yiddish/.test(card().textContent) && $$('button', card()).some(b => /Listen to a clip with no transcript/.test(b.textContent)), 'the card explains listening honestly and offers a clip with no transcript');
  log.push('listening would happen: ' + (LI.plan().kind === 'helper' ? 'on this computer with ' + LI.plan().label : 'nowhere yet – ' + LI.plan().why));

  // 2. the real sound, cut into spans by this computer – checked against the clip's truth file
  const iv = LI.target(key);
  let a;
  try { a = await D.routes.sound(iv, { heavy: false }); }
  catch (e) { log.push('the interview’s sound couldn’t be read without a render (no ffmpeg; the panel can’t decode it) – the rest of this test needs the sound and was not run'); T.assert(encoders() === encodersBefore, 'Media Encoder was not started'); return log.join(' | '); }
  const grid = P.spans(a.data, a.sr), truth = JSON.parse(fs.readFileSync(T.media('interview', 'I001_truth.json'), 'utf8'));
  const quiet = truth.long_silences.concat([truth.leading_silence, truth.trailing_silence]);
  T.assert(grid.length >= 8 && grid.every(s => s.end - s.start <= 8.01 && s.end - s.start >= 0.3) && grid.every((s, i) => s.n === i + 1 && (!i || s.start >= grid[i - 1].end)), `the sound in ${grid.length} numbered spans of at most 8 seconds, in order`);
  const inQuiet = grid.map(s => quiet.reduce((n, q) => n + Math.max(0, Math.min(s.end, q.end) - Math.max(s.start, q.start)), 0));
  T.assert(inQuiet.every(x => x <= 0.35), 'no span runs into one of the clip’s known silences: ' + JSON.stringify(grid.filter((s, i) => inQuiet[i] > 0.35)));
  T.assert(Math.abs(grid[0].start - truth.leading_silence.end) <= 0.25 && Math.abs(grid[grid.length - 1].end - truth.trailing_silence.start) <= 0.25, `the first span starts where the speech does (${grid[0].start} s) and the last ends where it does (${grid[grid.length - 1].end} s)`);
  const ps = P.pieces(grid, { chunk: 30 });
  T.assert(ps.every(p => p.end - p.start <= 30.01 && p.spans.every(s => s.start >= p.start && s.end <= p.end)) && ps.flatMap(p => p.spans).length === grid.length, `in ${ps.length} pieces of at most 30 seconds, none cut inside a span`);
  log.push(`${grid.length} spans in ${ps.length} pieces from the real sound, first ${grid[0].start}–${grid[0].end} s`);
  T.assert(encoders() === encodersBefore, 'Media Encoder was not started');

  // 3. a stand-in listening model: one span of real sound at a time and nothing else, then its own words as text
  const heard = [], texts = [];
  D.routes.hearing = async () => ({ ok: true, at: Date.now(), label: 'Stand-in listener', detail: '' });
  D.routes.listen = async (plan, req) => {
    if (req.schema === P.HEAR_SCHEMA) {
      const m = req.user[1].media, wav = Buffer.from(m.data, 'base64');
      if (!(req.user.length === 2 && wav.toString('ascii', 0, 4) === 'RIFF' && wav.readUInt32LE(24) === 16000)) throw new Error('not one span of 16 kHz WAV sound');
      let peak = 0; for (let i = 44; i + 1 < wav.length; i += 100) peak = Math.max(peak, Math.abs(wav.readInt16LE(i)));
      const k = heard.length; heard.push({ secs: m.seconds, peak, lang: /most likely speaking Hebrew/.test(req.system) });
      return k % 5 === 4 ? { speech: false, text: '', language: '' } : { speech: true, text: HEB[k % 4] + ' ' + k, language: 'Hebrew' };   // each a little different: the same long sentence “heard” twice is taken for made up
    }
    if (req.schema === P.TR_SCHEMA) { if (typeof req.user !== 'string') throw new Error('the second step must be text only'); texts.push(req.user); return { spans: req.user.split('(number<TAB>what was said):\n')[1].split('\n').map(r => r.split('\t')).map(([n, text]) => ({ n: +n, english: (ENG[HEB.indexOf(text.replace(/ \d+$/, ''))] || '') + ' ' + n })) }; }
    throw new Error('an unexpected request');
  };
  const standIn = { on: true, where: 'local', kind: 'helper', id: 'e2e-stand-in@1', label: 'Stand-in listener', langs: {}, chunkSec: 30, model: { id: 'e2e-stand-in', name: 'Stand-in listener', version: '1' } };
  const r = await LI.run(job, { keys: [key], plan: standIn });
  const rec = LI.peek(key);
  T.assert(r.done === 1 && r.made === 1 && rec && rec.done && rec.spans.length === grid.length && heard.length === grid.length && texts.length >= 1, 'listened to, span by span: ' + r.summary);
  T.assert(heard.every(h => h.secs <= 8.01 && h.lang) && heard.filter(h => h.peak > 200).length >= heard.length * 0.8, 'each request carried one span of real sound, and the language to expect');
  T.assert(rec.spans.every((s, i) => s.start === grid[i].start && s.end === grid[i].end) && rec.spans.filter(s => !s.text).length === Math.floor(grid.length / 5) && rec.spans.filter(s => !s.text).every(s => !s.en && s.unheard), 'every span keeps this computer’s times; the ones nobody was heard in have no words and no English');
  T.assert(D.settings().on === false && cloudCalls === 0, 'Listen to delivery stayed off, and nothing went to the cloud');
  T.assert(encoders() === encodersBefore, 'still no Media Encoder');

  // 4. into Story: the transcript made by listening, with its English – and everything downstream works from it
  const t = S.state().transcripts.find(x => x.path && real(x.path) === real(ruth.path));
  T.assert(t && t.source === 'listened' && t.listened && t.listened.ai && t.lines.length >= 4 && t.lines.every(l => /[֐-׿]/.test(l.text)), 'Story’s transcript for the interview is now the one made by listening, in Hebrew: ' + (t && [t.source, t.lines.length]));
  T.assert(t.lines.every(l => rec.spans.some(s => Math.abs(s.start - l.start) < 0.011) && rec.spans.some(s => Math.abs(s.end - l.end) < 0.011)), 'its lines start and end where spans do');
  T.assert(t.lines.every(l => E.enOf(l)) && E.statuses().find(s => s.key === t.key).done === t.lines.length && /by listening/.test(E.statuses().find(s => s.key === t.key).by), 'every line has its English, marked as made by listening');
  US.tools.open('home'); await W(150); US.tools.open('story', { tab: 'transcripts' }); await W(500);
  const row2 = $(`.eng-row[data-english="${CSS.escape(t.key)}"]`, card());
  T.assert(row2 && /Transcript made by listening – AI/.test(row2.textContent) && /AI translation – check before publishing/.test(row2.textContent) && $$('button', row2).some(b => b.textContent.trim() === 'English transcript'), 'the row says how the transcript was made, and offers the documents: ' + (row2 ? row2.textContent.slice(0, 160) : 'no row'));
  const xmlOf = file => { const b = fs.readFileSync(file); let e = b.length - 22; while (e > 0 && b.readUInt32LE(e) !== 0x06054b50) e--; for (let o = b.readUInt32LE(e + 16), n = b.readUInt16LE(e + 10); n-- > 0;) { const nl = b.readUInt16LE(o + 28), nm = b.toString('utf8', o + 46, o + 46 + nl), off = b.readUInt32LE(o + 42), cs = b.readUInt32LE(o + 20), m = b.readUInt16LE(o + 10); if (nm === 'word/document.xml') { const raw = b.subarray(off + 30 + b.readUInt16LE(off + 26) + b.readUInt16LE(off + 28), off + 30 + b.readUInt16LE(off + 26) + b.readUInt16LE(off + 28) + cs); return (m === 8 ? zlib.inflateRawSync(raw) : raw).toString('utf8'); } o += 46 + nl + b.readUInt16LE(o + 30) + b.readUInt16LE(o + 32); } return ''; };
  const doc = await E.exportTranscript(job, { key: t.key, format: 'docx', bilingual: true }); made.push(doc.file);
  const x = xmlOf(doc.file);
  T.assert(x.includes(HEB[0]) && x.includes(ENG[0]) && x.includes('<w:bidi/>') && x.includes('AI translation – check before publishing'), 'the bilingual Word document, Hebrew right-to-left beside the English: ' + doc.summary);
  const sub = await E.exportSubtitles(job, { key: t.key, format: 'srt' }); made.push(sub.file);
  const cues = fs.readFileSync(sub.file, 'utf8').trim().split(/\n\n/).map(b => { const [, time, ...rest] = b.split('\n'), tt = z => { const m = /(\d+):(\d+):(\d+),(\d+)/.exec(z); return +m[2] * 60 + +m[3] + +m[4] / 1000; }; return { start: tt(time.split(' --> ')[0]), end: tt(time.split(' --> ')[1]), text: rest.join(' ') }; });
  T.assert(cues.length >= t.lines.length && Math.abs(cues[0].start - t.lines[0].start) < 0.02 && cues.every(c => !/[֐-׿]/.test(c.text)) && cues.every(c => !quiet.some(q => q.end - q.start >= 2 && c.start >= q.start + 0.3 && c.start < q.end - 0.3)), 'English subtitles at the listened lines’ times – none starting inside a known silence: ' + sub.summary);
  T.assert(S.search('Friday table').some(z => z.line.id && /[֐-׿]/.test(z.line.text)), 'Find finds a listened line by its English');
  log.push(r.summary);

  // 5. the cloud: chosen but without this project's yes – nothing is read or sent
  if (!US.ai.projectOffline()) {
    D.setWhere('cloud');
    let refused = ''; try { await LI.listen(job, LI.target(t.key), { lang: 'Hebrew', force: true }); } catch (e) { refused = e.title || e.message; }
    T.assert(LI.plan().why === 'consent' || LI.plan().why === 'key', 'Cloud chosen is not the yes: ' + LI.plan().why);
    T.assert(/isn’t switched on for this project|needs a Gemini key/.test(refused) && cloudCalls === 0, 'cloud listening refused without the yes: ' + refused);
    D.setWhere('local');
  }

  // 6. a real listening model, when there is one here: speech made with the Mac's “say”, listened to for real (logged, not judged)
  Object.assign(D.routes, keep.routes);
  const P1 = LI.plan();
  if (P1.kind === 'helper' && process.platform === 'darwin') {
    const os = require('os'), cp = require('child_process'), dir = fs.mkdtempSync(path.join(os.tmpdir(), 'us-say-'));
    try {
      const voices = cp.execFileSync('say', ['-v', '?']).toString(), he = (/^(\S+)\s+he_IL/m.exec(voices) || [])[1] || '';
      const wav = path.join(dir, he ? 'hebrew.wav' : 'english.wav');
      cp.execFileSync('say', (he ? ['-v', he] : []).concat(['-o', path.join(dir, 's.aiff'), he ? 'שמי רות. כל יום שישי השולחן היה מלא, בעזרת השם.' : 'My name is Ruth. Every Friday night the table was full.']));
      cp.execFileSync('afconvert', ['-f', 'WAVE', '-d', 'LEI16@16000', '-c', '1', path.join(dir, 's.aiff'), wav]);
      const t1 = Date.now(), rr = await LI.listen(US.jobs.testJob('story'), LI.target(wav), { lang: he ? 'Hebrew' : '', plan: P1 });
      keep.listened.push({ key: wav, was: null });
      T.assert(rr.rec && rr.rec.done && rr.rec.grid.length >= 1 && rr.rec.spans.every((s, i) => s.start === rr.rec.grid[i].start), 'a real listen ran, with this computer’s spans: ' + JSON.stringify(rr.rec && rr.rec.grid));
      log.push(`REAL listening with ${P1.label} to ${he ? 'Hebrew' : 'English'} speech made by “say”${he ? ' (' + he + ')' : ' (no Hebrew voice is installed)'} in ${((Date.now() - t1) / 1000).toFixed(1)} s – ${rr.rec.spans.map(s => (s.text ? `[${s.start}–${s.end}] “${s.text}” (${s.lang}) → “${s.en}”` : `[${s.start}–${s.end}] couldn’t hear`)).join(' ; ')} (a computer voice: not a judgement of quality)`);
    } catch (e) { log.push('the real listen could not be run here: ' + (e.title || e.message)); }
    finally { try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) { /* temp */ } }
  } else log.push(P1.kind === 'helper' ? 'not a Mac, so no speech was made to listen to for real' : `no usable listening model on this computer (${P1.why}), so real listening was not run`);
  return log.join(' | ');
} finally {
  Object.assign(D.routes, keep.routes); US.ai.media = keep.media;
  for (const s of keep.listened) { try { LI.forget(s.key); LI.unforget(s); } catch (e) { /* nothing to put back */ } }
  try { for (const t of S.state().transcripts.filter(x => x.source === 'listened')) { LI.forget(t.key); E.forget(t.key); } } catch (e) { /* none */ }
  if (keep.english) { try { E.unforget(keep.english); } catch (e) { /* nothing to put back */ } }
  Object.assign(st, savedState); if (!savedState.proView) delete st.proView; if (!savedState.english) delete st.english;
  st.transcripts = st.transcripts.filter(x => x.source !== 'listened');
  try { await S.importFiles(US.jobs.testJob('story'), [T.media('transcripts', 'I001_interview.srt')]); } catch (e) { /* the next Story test re-imports it */ }
  S.reindex(); S.save(); E.flush();
  for (const f of made) { try { fs.unlinkSync(f); } catch (e) { /* gone */ } }
  for (const k of KEYS) store.set(k, keep.store[k]);
  US.ai.setDelivery(keep.consent); US.settings.set('delivery.hearing', keep.hearing || {});
  for (const k of SET) US.settings.set(k, keep.set[k] === undefined ? null : keep.set[k]);
  E.reset(); D.reset(); if (US.models) US.models.stop();
  releaseD(); releaseU();
  if (keep.tool) US.tools.open(keep.tool);
}
