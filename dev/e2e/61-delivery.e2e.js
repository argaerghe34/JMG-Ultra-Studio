// Story › Listen to delivery, in the real editor (no AI cost, nothing downloaded, nothing sent anywhere).
// A stand-in transcript at Ruth's interview times; the interview's REAL sound is read here (from the file – never a
// render, never Media Encoder) and cut into pieces; a stand-in listening model checks that each piece is real WAV sound
// with its transcript lines, and answers. Then everything downstream runs for real: the record per media file and the
// copy beside the project, the note on each line Story sends to its AI, the pill, Pro View's Delivery column and
// filter, the words offered to Names and terms, the card in 1 Interviews and Settings › Listen to delivery. Off by
// default and off again sends nothing; the cloud is refused without this project's own yes. If a listening model IS on
// this computer (Gemma 4, downloaded in Settings), it really listens to the first piece.
// Everything made here (the record, the project's choices, Story's state) is put back afterwards.
if (!US.story || !US.delivery || !US.storyDelivery || !US.proView) throw new Error('Story and Listen to delivery are not loaded in the panel');
const S = US.story, D = US.delivery, UI = US.storyDelivery, PV = US.proView, fs = require('fs');
const BIN = 'Test – Story', HEB = 'בעזרת השם';
const W = ms => new Promise(r => setTimeout(r, ms));
const $ = (q, root) => (root || document).querySelector(q), $$ = (q, root) => Array.from((root || document).querySelectorAll(q));
const encoders = () => require('child_process').execSync(process.platform === 'win32' ? 'tasklist' : 'ps -axo comm').toString().split('\n').filter(l => /Media Encoder/i.test(l)).length;
const encodersBefore = encoders();
for (let i = 0; i < 100 && US.jobs.current; i++) await T.sleep(200);
const releaseU = US.understand && US.understand.pause ? await US.understand.pause() : () => {};
const release = await D.pause();

const store = US.projectStore(US.ctx.project.path || US.ctx.project.name);
const KEYS = ['delivery.on', 'delivery.where', 'delivery.localModel', 'delivery.cloudModel', 'delivery.langs', 'delivery.notTerms'];
const keep = { store: Object.fromEntries(KEYS.map(k => [k, store.get(k)])), consent: US.ai.deliveryOn(), media: US.ai.mediaOn(), routes: Object.assign({}, D.routes), hearing: US.settings.get('delivery.hearing'), base: US.settings.get('story.binBase'), tool: US.tools.current, saved: null };
US.settings.set('story.binBase', BIN);
const st = S.loadState();
const savedState = JSON.parse(JSON.stringify({ themes: st.themes, wall: st.wall, glossary: st.glossary || [], scope: st.scope || { kind: 'all' }, proView: st.proView || null }));
st.scope = { kind: 'all' };
const log = [];
try {
  // 0. as it comes: off, and nothing about delivery anywhere
  for (const k of KEYS) store.set(k, undefined);
  US.ai.setDelivery(false);
  D.reset();
  T.assert(D.settings().on === false && D.settings().where === 'local' && D.status().state === 'off', 'off until switched on: ' + JSON.stringify(D.settings()));
  T.assert(D.settings().langs.hebrew && D.settings().langs.yiddish && !D.settings().langs.arabic, 'Hebrew and Yiddish ticked to start with');

  // the interview: the real clip, with a stand-in transcript at its times
  const [ruth] = await T.importOnce([T.media('interview', 'I001_interview.mp4')], BIN);
  const job = US.jobs.testJob('story');
  await S.importFiles(job, [T.media('transcripts', 'I001_interview.srt')]);
  const real = p => { try { return fs.realpathSync(p); } catch (e) { return p; } };
  const t0 = st.transcripts.find(t => t.path && real(t.path) === real(ruth.path));
  T.assert(t0, 'Story linked the transcript to the clip');
  const tr = S.addTranscript({ name: t0.name, path: t0.path, itemId: t0.itemId || ruth.id, source: 'file', segments: [
    { start: 0.6, end: 5.3, speaker: 'Ruth', text: 'My name is Ruth, and I grew up in a small flat in Stamford Hill.' },
    { start: 5.8, end: 10, speaker: 'Ruth', text: 'Sorry, can I start that again? I lost my thread.' },
    { start: 12.5, end: 19.1, speaker: 'Ruth', text: 'Every Friday night the table was full, bizarre a sham.' },
    { start: 21.5, end: 26, speaker: 'Ruth', text: 'My father always said a home is only as warm as the door is open.' },
    { start: 33, end: 39, speaker: 'Ruth', text: 'When my mother passed away I cried for weeks, and I still miss her every day.' }] });
  st.glossary = [];
  S.reindex(); S.save();
  const L = tr.lines, id = re => L.find(l => re.test(l.text)).id, friday = id(/Friday night/), again = id(/start that again/);
  const iv = D.interviews().find(x => x.key === tr.key);
  T.assert(iv && iv.path && iv.lines.length === 5, 'the engine sees the interview Story knows: ' + JSON.stringify(iv && [iv.name, iv.lines.length]));
  keep.saved = D.forget(iv.path);

  // 1. off: the card is there with only its switch; nothing listens; no row carries a note
  US.tools.open('story', { tab: 'transcripts' }); await W(400);
  let card = $('.dlv-card');
  T.assert(card && /Listen to delivery/.test(card.textContent) && !$('.toggle input', card).checked && !$('.segmented', card), 'the card in 1 Interviews, off, with only its switch');
  const rowOff = US.storyContext.row(S.lineOf(friday));
  T.assert(!/delivery/.test(rowOff) && D.note(friday) === '' && (await D.tick()) === false, 'off: nothing is added to what Story sends, and the background does nothing');
  let refusedOff = ''; try { await D.runAll(job, {}); } catch (e) { refusedOff = e.title || e.message; }
  T.assert(/switched off for this project/.test(refusedOff), 'off: Listen now refuses – ' + refusedOff);

  // 2. the cloud: refused inside US.ai.media without this project's own yes (nothing is sent)
  if (!US.ai.projectOffline()) {
    let refused = '';
    try { await US.ai.media({ purpose: 'delivery', use: 'gemini:' + D.CLOUD_DEFAULT, system: 's', user: ['x', { media: { kind: 'audio', data: 'AAAA', mime: 'audio/wav', seconds: 1 } }] }); } catch (e) { refused = e.title || e.message; }
    T.assert(/Listening to delivery in the cloud isn’t switched on for this project/.test(refused), 'cloud listening is refused until chosen: ' + refused);
  }

  // 3. switched on (this computer): the real sound in pieces, a stand-in model that checks what it is given
  $('.toggle input', card).click(); await W(300);
  card = $('.dlv-card');
  T.assert(D.settings().on && $('.segmented', card) && $('.dlv-chip', card), 'switched on from the card: where, and where things stand – ' + ($('.dlv-chip .pill', card) || {}).textContent);
  const P0 = D.plan();
  log.push(`on this computer: ${P0.kind === 'helper' ? P0.label : 'no listening model (' + D.status().text + ')'}`);
  const heard = [];
  D.routes.hearing = async () => ({ ok: true, at: Date.now(), label: 'Stand-in listener', detail: '' });   // the stand-in isn't a model to check
  D.routes.listen = async (plan, req) => {
    // a model on this computer is first asked only what is said, without the transcript: the stand-in “hears” every line
    if (req.schema === D._pure.HEAR_SCHEMA) return { speech: true, text: L.map(l => l.text).join(' ') + ' ' + HEB };
    const m = req.user[1].media, wav = Buffer.from(m.data, 'base64');
    if (!(wav.toString('ascii', 0, 4) === 'RIFF' && wav.readUInt32LE(24) === 16000 && wav.length > 16000 * 2)) throw new Error('not a piece of 16 kHz WAV sound');
    let peak = 0; for (let i = 44; i + 1 < wav.length; i += 200) peak = Math.max(peak, Math.abs(wav.readInt16LE(i)));
    const ids = Array.from(req.user[0].matchAll(/^(\S+)\t[\d.]+–[\d.]+\t/gm)).map(x => x[1]);
    heard.push({ secs: m.seconds, bytes: wav.length, peak, ids, langs: /in: Hebrew, Yiddish/.test(req.system), never: /NEVER INVENT/.test(req.system) });
    return { lines: ids.map(x => (x === friday ? { id: x, score: 5, notes: ['warm', 'laughing'], energy: 'high', cleanStart: true, cleanEnd: true, confidence: 'sure', heard: [{ said: HEB, transliteration: 'b’ezrat Hashem', language: 'Hebrew', meaning: 'with God’s help', transcriptHad: 'bizarre a sham', kind: 'religious', confidence: 'sure' }] }
      : x === again ? { id: x, score: 1, notes: ['false start', 'hesitant'], energy: 'low', cleanStart: true, cleanEnd: false, confidence: 'sure', heard: [] }
        : { id: x, score: 4, notes: ['confident'], energy: 'medium', cleanStart: true, cleanEnd: true, confidence: 'fairly sure', heard: [] })).concat([{ id: 'not-a-line', score: 5, notes: [], energy: 'high', cleanStart: true, cleanEnd: true, confidence: 'sure', heard: [] }]), missed: [] };
  };
  const standIn = { on: true, where: 'local', kind: 'helper', id: 'e2e-stand-in@1', label: 'Stand-in listener', langs: D.settings().langs, chunkSec: 30, model: { id: 'e2e-stand-in', name: 'Stand-in listener', version: '1' } };
  const r = await D.analyse(iv, { job, plan: standIn });
  const rec = D.peek(iv.path);
  if (r.skipped === 'sound') {
    T.assert(rec.waiting === 'render' && heard.length === 0, 'its sound can’t be read here, so it waits for Listen now or Overnight prep: ' + JSON.stringify(rec));
    log.push('the interview’s sound couldn’t be read without a render (no ffmpeg; the panel can’t decode it) – it waits, as it should; the rest of this test needs the sound and was not run');
    T.assert(encoders() === encodersBefore, 'Media Encoder was not started');
    return log.join(' | ');
  }
  T.assert(rec && rec.done && rec.total === heard.length && heard.length >= 2, `listened to in ${heard.length} pieces: ` + JSON.stringify(heard.map(h => [h.secs, h.ids.length])));
  T.assert(heard.every(h => h.secs <= 30.01 && h.langs && h.never) && heard.some(h => h.peak > 200), 'each piece is real sound of at most 30 seconds, with the languages and “never invent” in the instruction: ' + JSON.stringify(heard.map(h => [h.secs, h.peak])));
  T.assert(heard.flatMap(h => h.ids).slice().sort().join() === L.map(l => l.id).sort().join(), 'every transcript line went with exactly one piece');
  T.assert(L.every(l => rec.lines[l.id] && rec.lines[l.id].start === l.start && rec.lines[l.id].end === l.end) && !rec.lines['not-a-line'], 'the record keeps the transcript’s own times, and no line the model made up');
  T.assert(encoders() === encodersBefore, 'Media Encoder was not started');
  log.push(`the real sound was read and heard in ${heard.length} pieces (${heard.map(h => Math.round(h.secs) + ' s').join(', ')})`);
  // done once: nothing is asked again; another model: again
  const n0 = heard.length;
  await D.analyse(iv, { job, plan: standIn });
  T.assert(heard.length === n0 && D.needs(iv, standIn) === false && D.needs(iv, Object.assign({}, standIn, { id: 'other@2' })) === true, 'listened to once; made again only for another model');
  // the copy that travels with the project
  D.flush();
  const shared = D._pure.sharedFile();
  if (shared) { T.assert(fs.existsSync(shared) && /Delivery\.json$/.test(shared) && Object.values(JSON.parse(fs.readFileSync(shared, 'utf8')).interviews).some(x => x.lines && x.lines[friday]), 'kept beside the project: ' + shared); log.push('travels in ' + require('path').basename(shared)); }
  else log.push('no folder beside the project here, so the record is kept on this computer only');

  // 4. what Story sends to its AI, and what it shows
  const note = `[delivery 5/5 – warm, laughing; says “${HEB}” (b’ezrat Hashem, Hebrew: with God’s help)]`;
  T.assert(D.active() && D.note(friday) === ' ' + note, 'the note on the line: ' + D.note(friday));
  T.assert(US.storyContext.row(S.lineOf(friday)).endsWith(note) && US.transcript.aiRow(S.lineOf(again)).endsWith('[delivery 1/5 – false start, hesitant, ends cut off]'), 'both listings carry it');
  const reqs = US.storyContext.requests(S.scopeTranscripts(), { task: () => 'Task', feature: 'Ask' });
  T.assert(reqs.some(q => q.req.user[0].text.includes(note)) && reqs.every(q => q.req.system.endsWith(D.HINT)), 'Ask’s and Themes’ request carries the notes, and the AI is told what they mean');
  T.assert(/best-delivered/.test(D.digestLine()), 'Ask’s digest says delivery notes exist');
  const pill = UI.pill(S.lineOf(friday));
  T.assert(pill && pill.textContent === '♪ 5/5' && UI.heardEl(S.lineOf(friday)) && UI.heardEl(S.lineOf(friday)).textContent.includes(HEB), 'the pill and the corrected words for Story’s lists');

  // 5. Pro View: the Delivery column, sorting by it, the filter, the corrected words
  US.tools.open('storylines', { source: 'all' }); await W(600);
  const tool = $('.sl.pv') || document;
  T.assert($('.pv-th.pv-c-delivery', tool), 'the Delivery column shows: ' + $$('.pv-th', tool).map(x => x.dataset.col).join());
  const rowOf = lid => $(`.pv-row[data-id="${lid}"]`, tool);
  { const s0 = $('.pv-dfilter select', tool); if (s0 && s0.value !== 'any') { s0.value = 'any'; s0.dispatchEvent(new Event('change')); await W(200); } }   // a run that stopped early leaves its filter on
  $('.pv-th.pv-c-delivery .pv-thb', tool).click(); await W(300);   // best said first: the lines listened to come to the top
  T.assert(rowOf(friday) && /5\/5/.test($('.pv-c-delivery', rowOf(friday)).textContent) && /warm/.test($('.pv-c-delivery', rowOf(friday)).textContent) && $('.dlv-mark', rowOf(friday)), 'the row shows its score, how it sounds and the ◆ marker');
  const order = $$('.pv-row', tool).map(x => x.dataset.id).filter(x => L.some(l => l.id === x));
  T.assert(order[0] === friday && order[order.length - 1] === again, 'sorted by delivery: best said first, the false start last – ' + order.join());
  const sel = $('.pv-dfilter select', tool);
  T.assert(sel && !$('.pv-dfilter', tool).classList.contains('hidden'), 'the delivery filter is offered');
  sel.value = 'heard'; sel.dispatchEvent(new Event('change')); await W(300);
  const onlyHeard = $$('.pv-row', tool).map(x => x.dataset.id).filter(Boolean);   // the heading row has no id
  T.assert(onlyHeard.length === 1 && onlyHeard[0] === friday, '“With corrected words” leaves the one line: ' + onlyHeard.join());
  rowOf(friday).click(); await W(200);
  T.assert($('.sl-insp .dlv-heard', tool) && $('.sl-insp', tool).textContent.includes(HEB) && /5 out of 5/.test($('.sl-insp', tool).textContent), 'the picked line shows its delivery and the words heard');
  sel.value = 'any'; sel.dispatchEvent(new Event('change')); await W(200);

  // 6. words it heard are offered – not added
  const offers = UI.offers();
  T.assert(offers.length === 1 && offers[0].right === 'b’ezrat Hashem' && offers[0].heard.join() === 'bizarre a sham' && (st.glossary || []).length === 0, 'offered to Names and terms, nothing added: ' + JSON.stringify(offers));
  US.tools.open('story', { tab: 'transcripts' }); await W(400);
  card = $('.dlv-card');
  const add = $$('button', card).find(b => b.textContent.trim() === 'Add to Names and terms');
  T.assert(add && card.textContent.includes(HEB), 'the card lists the word with its button');
  add.click(); await W(400);
  T.assert(st.glossary.length === 1 && st.glossary[0].right === 'b’ezrat Hashem' && /b’ezrat Hashem/.test(S.lineOf(friday).text) && UI.offers().length === 0, 'added on the press, and only that line is corrected: ' + S.lineOf(friday).text);
  T.assert(D.forLine(friday) && D.forLine(friday).score === 5, 'the corrected line keeps what was heard');

  // 7. Settings › Listen to delivery: every choice, with this project's estimate; nothing downloads from here
  const sec = US.settingsSections.list().find(s => s.id === 'delivery');
  T.assert(sec && sec.title === 'Listening models for Story', 'registered as a Settings section');
  const el = sec.create(), text = el.textContent;
  T.assert(/This computer/.test(text) && /Cloud/.test(text) && /Claude can’t hear/.test(text) && /weaker at Hebrew and Yiddish/.test(text) && /For this project: /.test(text) && $$('input[data-lang]', el).length === 6, 'both routes with pros, cons and the estimate, the models and the languages');
  T.assert(!$$('button', el).some(b => /^Download/.test(b.textContent.trim())), 'nothing is downloaded from this screen');
  const n = UI.numbers(), tx = UI.estimateText(n);
  log.push(`estimate for this project – ${tx.interviews}. This computer: ${tx.local} Cloud: ${tx.cloud}`);

  // 8. the cloud chosen without its yes: nothing is sent, and it says why
  if (!US.ai.projectOffline()) {
    D.setWhere('cloud');
    T.assert(D.plan().kind === 'none' && D.plan().why === 'consent' && D.status().state === 'needs-consent' && (await D.tick()) === false, 'Cloud chosen but not agreed: nothing listens – ' + D.status().text);
    D.setWhere('local');
  }

  // 9. a real listening model, when there is one on this computer (nothing leaves). The test interview's soundtrack has
  //    NO speech – synthetic sound at the phrase times – so the only honest outcome is: no delivery scores at all.
  //    (1.3.41 let Gemma 4 E2B score it “5/5 clear, warm” from the transcript.)
  Object.assign(D.routes, keep.routes);
  if (P0.kind === 'helper' || P0.why === 'deaf') {
    D.forget(iv.path); D.forgetHearing(); D.reset();
    const P1 = D.plan(), t1 = Date.now();
    const check = await D.ensureHearing(P1, US.jobs.testJob('story'));
    log.push(`REAL hearing check of ${P1.label}: ${check.ok ? 'passed – it scored neither a silent clip nor a tone' : 'FAILED – ' + check.detail} (${((Date.now() - t1) / 1000).toFixed(1)} s)`);
    if (check.ok) {
      let k = 0; const t2 = Date.now();
      const rr = await D.analyse(iv, { job: US.jobs.testJob('story'), keepGoing: () => k++ < 1 });
      const got = Object.entries(rr.rec.lines);
      T.assert(rr.did && rr.rec.next === 1 && got.length >= 1, 'one piece was listened to for real: ' + JSON.stringify({ next: rr.rec.next, failed: rr.rec.failed, lines: got.length }));
      T.assert(got.every(([, e]) => e.unheard && !e.score && !(e.notes || []).length), 'no speech in this clip, so no line may have a delivery score: ' + JSON.stringify(got.map(([x, e]) => [x, e.unheard || '', e.score, e.notes])));
      T.assert(D.note(got[0][0]) === '', 'and nothing about those lines goes to Story’s AI');
      log.push(`REAL listening with ${P1.label} to the clip with no speech: one piece in ${((Date.now() - t2) / 1000).toFixed(1)} s – ${got.map(([, e]) => 'couldn’t hear (' + e.unheard + ')').join(', ')}: no invented scores`);
    } else {
      let why = ''; try { await D.runAll(US.jobs.testJob('story'), {}); } catch (e) { why = e.title || e.message; }
      T.assert(/doesn’t seem to listen/.test(why) && D.status().state === 'deaf' && !(D.peek(iv.path) || {}).done, 'a model that fails the check is refused, and nothing is kept: ' + why);
    }
    // one real listen to real (synthetic-voice) speech, made here with the Mac's own “say”: logged, not judged
    if (check.ok && process.platform === 'darwin') {
      const os = require('os'), cp = require('child_process'), dir = fs.mkdtempSync(require('path').join(os.tmpdir(), 'us-say-'));
      try {
        cp.execFileSync('say', ['-o', dir + '/s.aiff', 'My name is Ruth, and I grew up in a small flat in Stamford Hill. Every Friday night the table was full.']);
        cp.execFileSync('afconvert', ['-f', 'WAVE', '-d', 'LEI16@16000', '-c', '1', dir + '/s.aiff', dir + '/s.wav']);
        const a = await US.audio.readWav(dir + '/s.wav', { targetRate: 16000 }), secs = a.data.length / 16000;
        const lines = [{ id: 'say1', start: 0.1, end: secs * 0.6, speaker: 'Ruth', text: 'My name is Ruth, and I grew up in a small flat in Stamford Hill.' }, { id: 'say2', start: secs * 0.6, end: secs - 0.1, speaker: 'Ruth', text: 'Every Friday night the table was full.' }, { id: 'say3', start: 0.1, end: 1, speaker: 'Ruth', text: 'We opened the bakery in nineteen sixty.' }];
        const t3 = Date.now(), r3 = await D.listenPiece(D.plan(), { n: 1, name: 'say' }, { start: 0, end: secs, lines }, a.data, 16000, { job: US.jobs.testJob('story') });
        T.assert(r3.lines.say3 && r3.lines.say3.unheard, 'a line that isn’t in the speech gets no score: ' + JSON.stringify(r3.lines.say3));
        log.push(`REAL listening to ${secs.toFixed(1)} s of synthetic speech (${((Date.now() - t3) / 1000).toFixed(1)} s) – it wrote down “${r3.said}”; ${['say1', 'say2'].map(x => { const e = r3.lines[x]; return e ? (e.unheard ? 'couldn’t hear' : `${e.score || '?'}/5 ${e.notes.join(', ')}`) : 'no answer'; }).join(' | ')} (not a judgement of quality: a computer voice)`);
      } catch (e) { log.push('the synthetic-speech listen could not be run here: ' + (e.title || e.message)); }
      finally { try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) { /* temp */ } }
    }
  } else log.push('no listening model on this computer, so real listening was not run (download Gemma 4 in Settings › Vision & listening models to test it)');

  // 10. switched off again: the notes are gone from everything Story sends
  D.setOn(false);
  T.assert(!D.active() && D.note(friday) === '' && !/delivery \d\/5/.test(US.storyContext.row(S.lineOf(friday))) && UI.pill(S.lineOf(friday)) === null, 'off: nothing about delivery is sent or shown');
  return log.join(' | ');
} finally {
  Object.assign(D.routes, keep.routes);
  if (keep.saved) { try { D.forget(keep.saved.path); } catch (e) { /* nothing to take away */ } D.unforget(keep.saved); D.flush(); }
  for (const k of KEYS) store.set(k, keep.store[k]);
  US.ai.setDelivery(keep.consent); US.ai.setMedia(keep.media);
  US.settings.set('delivery.hearing', keep.hearing || {});
  Object.assign(st, savedState); if (!savedState.proView) delete st.proView;
  try { await S.importFiles(US.jobs.testJob('story'), [T.media('transcripts', 'I001_interview.srt')]); } catch (e) { /* the next Story test re-imports it */ }
  S.reindex(); S.save();
  US.settings.set('story.binBase', keep.base || '');
  D.reset(); if (US.models) US.models.stop();
  release(); releaseU();
  if (keep.tool) US.tools.open(keep.tool);
}
