// Story › English translation, in the real editor (no AI cost: a stand-in translator; nothing is sent anywhere).
// A small Hebrew stand-in transcript at the test interview's times. Story works out that it is Hebrew and offers the
// translation (and not for the interviews in English); the stand-in translator gets transcript TEXT only – ids, lines,
// the lines either side – and every line keeps its id and times. Then for real: the English transcript as a Word
// document (plain, and with the Hebrew beside it), English subtitles for the interview at the transcript's times, and
// English subtitles for a real sequence at TIMELINE times – a line whole, a line cut in half by the clip's in and out,
// and the first line again – written as an .srt, brought into the project and (Premiere) put on the sequence as a
// caption track; “Show English under each line”, Find and Pro View's filter reading the English, and Story's AI rows.
// Everything made here (the translations, Story's state, the choices, the stand-in) is put back afterwards, and the
// test can be run twice in the same panel session.
if (!US.story || !US.storyEnglish || !US.proView) throw new Error('Story and English translation are not loaded in the panel');
const S = US.story, E = US.storyEnglish, fs = require('fs'), path = require('path'), zlib = require('zlib');
const BIN = 'Test – Story', SEQ = 'Test – Story English';
const W = ms => new Promise(r => setTimeout(r, ms));
const $ = (q, root) => (root || document).querySelector(q), $$ = (q, root) => Array.from((root || document).querySelectorAll(q));
for (let i = 0; i < 100 && US.jobs.current; i++) await T.sleep(200);
const idle = async () => { for (let i = 0; i < 300 && US.jobs.current; i++) await T.sleep(100); await W(200); };
const releaseU = US.understand && US.understand.pause ? await US.understand.pause() : () => {};
const releaseD = US.delivery && US.delivery.pause ? await US.delivery.pause() : () => {};

const SET = ['story.binBase', 'story.exportDir', 'story.englishFormat', 'story.englishBilingual', 'story.englishSubs'];
const keep = { set: Object.fromEntries(SET.map(k => [k, US.settings.get(k)])), tool: US.tools.current, ai: {}, saved: null };
const outDir = path.join(fs.realpathSync(US.host.extensionDir()), 'dev', 'test-project', 'exports'); fs.mkdirSync(outDir, { recursive: true });   // imported into the test project, so not a temp folder
US.settings.set('story.binBase', BIN); US.settings.set('story.exportDir', outDir);
['story.englishFormat', 'story.englishBilingual', 'story.englishSubs'].forEach(k => US.settings.set(k, null));
const st = S.loadState();
const savedState = JSON.parse(JSON.stringify({ themes: st.themes, wall: st.wall, glossary: st.glossary || [], scope: st.scope || { kind: 'all' }, proView: st.proView || null, english: st.english || null, finds: st.finds || null }));
st.scope = { kind: 'all' }; st.english = null;
const HEB = 'בעזרת השם';
const LINES = [
  { start: 0.6, end: 5.3, speaker: 'Ruth', text: 'שמי רות ואני גדלתי בדירה קטנה בסטמפורד היל.', en: 'My name is Ruth, and I grew up in a small flat in Stamford Hill.' },
  { start: 5.8, end: 10, speaker: 'Ruth', text: 'סליחה, אפשר להתחיל שוב? איבדתי את החוט.', en: 'Sorry, can I start again? I lost my thread.' },
  { start: 12.5, end: 19.1, speaker: 'Ruth', text: 'כל יום שישי השולחן היה מלא, ' + HEB, en: 'Every Friday night the table was full, b’ezrat Hashem [with God’s help].' },
  { start: 21.5, end: 26, speaker: 'Ruth', text: 'אבא שלי תמיד אמר שבית חם רק כמו הדלת הפתוחה שלו.', en: 'My father always said a home is only as warm as its open door.' },
  { start: 33, end: 39, speaker: 'Ruth', text: 'Okay, and then we moved to London.', en: 'Okay, and then we moved to London.' }];
const log = [], sent = [], made = [];
try {
  // a run that stopped early may have left a filter or a search on: start clean
  US.tools.open('storylines', { source: 'all' }); await W(400);
  { const tool0 = $('.tool.pv') || document, f0 = $('.sl-find', tool0); if (f0 && f0.value) { f0.value = ''; f0.dispatchEvent(new Event('input')); await W(150); } const s0 = $('.pv-dfilter select', tool0); if (s0 && s0.value !== 'any') { s0.value = 'any'; s0.dispatchEvent(new Event('change')); await W(150); } }

  // the interview: the real clip, with a Hebrew stand-in transcript at its times
  const [ruth] = await T.importOnce([T.media('interview', 'I001_interview.mp4')], BIN);
  const job = US.jobs.testJob('story');
  await S.importFiles(job, [T.media('transcripts', 'I001_interview.srt')]);
  const real = p => { try { return fs.realpathSync(p); } catch (e) { return p; } };
  const t0 = st.transcripts.find(t => t.path && real(t.path) === real(ruth.path));
  T.assert(t0, 'Story linked the transcript to the clip');
  const tr = S.addTranscript({ name: t0.name, path: t0.path, itemId: t0.itemId || ruth.id, source: 'file', segments: LINES.map(({ start, end, speaker, text }) => ({ start, end, speaker, text })) });
  st.glossary = [{ right: 'Stamford Hill', heard: [], hide: false }];
  S.reindex(); S.save();
  keep.saved = E.forget(tr.key);
  const L = tr.lines, lineOf = re => L.find(l => re.test(l.text)), enFor = l => (LINES.find(x => x.text === l.text) || {}).en || '';
  const friday = lineOf(/שישי/), name = lineOf(/שמי/), father = lineOf(/אבא/);
  const frozen = JSON.stringify(L.map(l => [l.id, l.start, l.end, l.speaker, l.text]));

  // 1. the language is worked out here; the translation is offered for this interview – and not for ones in English
  const s0 = E.statuses().find(s => s.key === tr.key);
  T.assert(s0.lang === 'Hebrew' && s0.rtl && s0.need === 5 && s0.done === 0 && !s0.english, 'Story sees a Hebrew interview with five lines to translate: ' + JSON.stringify({ lang: s0.lang, need: s0.need, done: s0.done }));
  const others = E.statuses().filter(s => s.key !== tr.key);
  T.assert(others.every(s => s.lang === 'English' || s.set), 'the other test interviews are in English: ' + others.map(s => `${s.name} ${s.lang}`).join(', '));
  T.assert(E.plan({}).every(p => p.t.key === tr.key), '“Translate all interviews not in English” would only do the Hebrew one');
  US.tools.open('home'); await W(150); US.tools.open('story', { tab: 'transcripts' }); await W(500);
  const card = () => $$('.section').find(x => /^English translation/.test(($('.section-head', x) || {}).textContent || ''));
  const row = () => $(`.eng-row[data-english="${CSS.escape(tr.key)}"]`, card());
  T.assert(card() && !card().classList.contains('closed') && row() && /Hebrew/.test($('.pill', row()).textContent) && /0 of 5 lines translated/.test(row().textContent), 'the card is open, with the interview named as Hebrew: ' + (row() ? row().textContent.slice(0, 120) : 'no row'));
  for (const s of others.filter(x => x.english)) { const r = $(`.eng-row[data-english="${CSS.escape(s.key)}"]`, card()); T.assert(r && !$$('button', r).some(b => /^Translate/.test(b.textContent.trim())) && /nothing to translate/.test(r.textContent), `no translation is offered for “${s.name}”`); }

  // 2. translate – a stand-in for the editor's text AI, which checks what it is sent
  for (const k of ['available', 'provider', 'label', 'estimateFor', 'approveTotal', 'json']) keep.ai[k] = US.ai[k];
  Object.assign(US.ai, { available: () => true, provider: () => 'claude', label: () => 'Stand-in translator', estimateFor: () => ({ usd: 0 }), approveTotal: async () => {},
    json: async req => {
      if (typeof req.user !== 'string' || /"media"|"image"/.test(JSON.stringify(req))) throw new Error('something other than text was sent');
      sent.push(req);
      const ids = req.user.split('\nLINES (id<TAB>speaker<TAB>text):\n')[1].split('\nCONTEXT')[0].split('\n').map(r => r.split('\t')[0]);
      return { lines: ids.map(id => ({ id, en: enFor(S.lineOf(id)), start: 0, end: 999 })).concat([{ id: 'not-a-line', en: 'made up' }]) };
    } });
  $$('button', row()).find(b => /^Translate/.test(b.textContent.trim())).click();
  await W(300); await idle();
  const s1 = E.statuses().find(s => s.key === tr.key);
  T.assert(s1.done === 5 && sent.length === 1, 'translated from the card: ' + JSON.stringify({ done: s1.done, requests: sent.length }));
  T.assert(JSON.stringify(tr.lines.map(l => [l.id, l.start, l.end, l.speaker, l.text])) === frozen, 'every line keeps its id, its times, its speaker and its own words');
  T.assert(/It is mostly in Hebrew/.test(sent[0].user) && /NAMES \(spell them like this\): Stamford Hill/.test(sent[0].user) && /Give no times/.test(sent[0].system) && !/I001/.test(sent[0].user), 'the request: the language, the names to keep, no times asked for, no file name');
  T.assert(E.enOf(friday) === enFor(friday) && E.enOf(name.id) === enFor(name) && E.enOf('not-a-line') === '', 'each line’s English is kept by its id; a made-up id is dropped');
  const n1 = sent.length; await E.translate(job, { keys: [tr.key] });
  T.assert(sent.length === n1, 'done once: nothing is sent again');
  E.flush();
  const shared = E._pure.sharedFile();
  if (shared) { T.assert(fs.existsSync(shared) && JSON.parse(fs.readFileSync(shared, 'utf8')).interviews[tr.key].lines[friday.id].en === enFor(friday), 'kept beside the project: ' + shared); log.push('travels in ' + path.basename(shared)); }
  US.tools.open('home'); await W(150); US.tools.open('story', { tab: 'transcripts' }); await W(500);
  T.assert(/5 of 5 lines translated by Stand-in translator/.test(row().textContent) && /AI translation – check before publishing/.test(card().textContent) && $$('button', row()).some(b => b.textContent.trim() === 'English transcript') && $$('button', row()).some(b => b.textContent.trim() === 'English subtitles'), 'the row says it is translated, by whom, that it is an AI translation, and offers the transcript and the subtitles');

  // 3. the full English transcript: Word, plain and with the Hebrew beside it (right-to-left)
  const xmlOf = file => { const b = fs.readFileSync(file); let e = b.length - 22; while (e > 0 && b.readUInt32LE(e) !== 0x06054b50) e--; for (let o = b.readUInt32LE(e + 16), n = b.readUInt16LE(e + 10); n-- > 0;) { const nl = b.readUInt16LE(o + 28), nm = b.toString('utf8', o + 46, o + 46 + nl), off = b.readUInt32LE(o + 42), cs = b.readUInt32LE(o + 20), m = b.readUInt16LE(o + 10); if (nm === 'word/document.xml') { const raw = b.subarray(off + 30 + b.readUInt16LE(off + 26) + b.readUInt16LE(off + 28), off + 30 + b.readUInt16LE(off + 26) + b.readUInt16LE(off + 28) + cs); return (m === 8 ? zlib.inflateRawSync(raw) : raw).toString('utf8'); } o += 46 + nl + b.readUInt16LE(o + 30) + b.readUInt16LE(o + 32); } return ''; };
  T.assert(US.actions.get('story.englishTranscript').match('save the English transcript') && US.actions.get('story.translate').match('translate the Hebrew interview'), 'Ask knows the requests');
  const doc = await E.exportTranscript(job, { key: tr.key, format: 'docx' }); made.push(doc.file);
  const x1 = xmlOf(doc.file);
  T.assert(fs.existsSync(doc.file) && /English transcript/.test(path.basename(doc.file)) && x1.includes(enFor(friday)) && x1.includes('AI translation – check before publishing') && x1.includes('Ruth: ') && !x1.includes(HEB), 'the English transcript as a Word document, with speakers and the AI-translation mark: ' + doc.summary);
  T.assert(/\d\d:\d\d:\d\d[:;]\d\d/.test(x1), 'with timecodes');
  const both = await E.exportTranscript(job, { key: tr.key, format: 'docx', bilingual: true }); made.push(both.file);
  const x2 = xmlOf(both.file);
  T.assert(x2.includes('<w:tbl>') && x2.includes(HEB) && x2.includes(enFor(friday)) && (x2.match(/<w:bidi\/>/g) || []).length === 4 && x2.includes('<w:rtl/>'), 'with the original beside it: two columns, the four Hebrew lines right-to-left (the English one isn’t) – ' + JSON.stringify({ tbl: x2.includes('<w:tbl>'), heb: x2.includes(HEB), en: x2.includes(enFor(friday)), bidi: (x2.match(/<w:bidi\/>/g) || []).length, rtl: x2.includes('<w:rtl/>') }));
  const txt = await E.exportTranscript(job, { key: tr.key, format: 'txt' }); made.push(txt.file);
  T.assert(/AI TRANSLATION – CHECK BEFORE PUBLISHING/.test(fs.readFileSync(txt.file, 'utf8')) && fs.readFileSync(txt.file, 'utf8').includes('Ruth: ' + enFor(name)), 'and as text');
  log.push(doc.summary);

  // 4. English subtitles for the interview, at the transcript's times
  const cuesOf = file => fs.readFileSync(file, 'utf8').trim().split(/\n\n/).map(b => { const [, time, ...rest] = b.split('\n'), t = x => { const m = /(\d+):(\d+):(\d+)[,.](\d+)/.exec(x); return +m[1] * 3600 + +m[2] * 60 + +m[3] + +m[4] / 1000; }; return { start: t(time.split(' --> ')[0]), end: t(time.split(' --> ')[1]), lines: rest, text: rest.join(' ') }; });
  const sub = await E.exportSubtitles(job, { key: tr.key, format: 'srt' }); made.push(sub.file);
  const ic = cuesOf(sub.file);
  T.assert(ic.length >= 5 && Math.abs(ic[0].start - 0.6) < 0.01 && ic.map(c => c.text).join(' ').includes(enFor(friday)) && ic.every(c => c.lines.length <= 2 && c.lines.every(l => l.length <= 48)) && ic.every((c, i) => !i || c.start >= ic[i - 1].end - 0.001), 'the interview’s .srt: at its own times, two lines of about 42 characters, in order – ' + sub.summary);
  T.assert(ic.find(c => c.text.startsWith('Every Friday')) && Math.abs(ic.find(c => c.text.startsWith('Every Friday')).start - 12.5) < 0.01, '“Every Friday…” starts at 12.5 s, where the Hebrew line does');
  const vtt = await E.exportSubtitles(job, { key: tr.key, format: 'vtt' }); made.push(vtt.file);
  T.assert(/^WEBVTT\n\nNOTE AI translation – check before publishing/.test(fs.readFileSync(vtt.file, 'utf8')), 'and a .vtt, marked');

  // 5. English subtitles for a real sequence, at TIMELINE times: a line whole, a line cut in half, the first line again
  const old = await T.seqByName(SEQ); if (old) await US.host.call('deleteSequence', { seqId: old.id });
  const seq = await US.host.call('newSequence', { name: SEQ, binPath: BIN, likeId: ruth.id });
  await US.host.call('placeClips', { seqId: seq.id, cursor: 0, clips: [{ id: ruth.id, in: 12.5, out: 19.1 }, { id: ruth.id, in: 23.75, out: 26 }, { id: ruth.id, in: 12.5, out: 19.1 }] });
  await T.open(seq.id);
  const tracksBefore = await T.captionTracks();
  const r = await T.action('story.englishSubtitles', {}); made.push(r.file);
  T.assert(r.count >= 3 && fs.existsSync(r.file) && /English subtitles \(AI translation\)/.test(path.basename(r.file)) && /AI translation – check before publishing/.test(r.summary), 'the sequence’s .srt was written: ' + r.summary);
  const sc = cuesOf(r.file), at = (a, b) => sc.filter(c => c.start >= a - 0.05 && c.end <= b + 0.05).map(c => c.text).join(' ');
  T.assert(at(0, 6.6) === enFor(friday), 'the first clip’s line at the start of the timeline (not at 12.5 s): ' + JSON.stringify(sc.slice(0, 2)));
  const half = at(6.6, 8.85);
  T.assert(half && enFor(father).endsWith(half) && half.split(' ').length < enFor(father).split(' ').length * 0.75, 'the line cut in half by the clip’s in point gets the second part of its English: “' + half + '”');
  T.assert(at(8.85, 15.5) === enFor(friday), 'the same line used again is subtitled again, at its second place: ' + JSON.stringify(sc.slice(-2)));
  if (US.app.is('resolve')) T.assert(r.added === false && /drag/.test(r.summary) && await T.captionTracks() === tracksBefore, 'Resolve: the file is in the Media Pool to drag on – said plainly: ' + r.summary);
  else T.assert(r.added === true && await T.captionTracks() === tracksBefore + 1, 'Premiere: a caption track was added to the sequence (nothing burnt in)');
  log.push(r.summary);

  // 6. “Show English under each line”, Find and Pro View's filter read the English; so does Story's AI
  T.assert(E.showOn() === false && E.lineEl(friday) === null, 'the English isn’t shown under lines until switched on');
  E.setShow(true);
  T.assert(E.lineEl(friday) && E.lineEl(friday).textContent.includes(enFor(friday)), 'switched on: the English under the line');
  const found = S.search('Friday table');
  T.assert(found.length && found[0].line.id === friday.id && found[0].line.text.includes(HEB), 'Find finds the Hebrew line by its English – and gives back the original line: ' + found.map(x => x.line.id).join());
  US.tools.open('storylines', { source: 'all' }); await W(500);
  const tool = $('.tool.pv') || document, find = $('.sl-find', tool);
  find.value = 'warm as its open door'; find.dispatchEvent(new Event('input')); await W(300);
  const rows = $$('.pv-rows .pv-row', tool).map(x => x.dataset.id).filter(Boolean);
  T.assert(rows.length === 1 && rows[0] === father.id, 'Pro View’s filter finds the line by its English: ' + rows.join());
  $(`.pv-row[data-id="${CSS.escape(father.id)}"]`, tool).click(); await W(200);
  T.assert($('.sl-insp .eng-line', tool) && $('.sl-insp', tool).textContent.includes(enFor(father)) && /AI translation/.test($('.sl-insp', tool).textContent), 'the picked line shows its English, marked as an AI translation');
  find.value = ''; find.dispatchEvent(new Event('input')); await W(200);
  T.assert(US.storyContext.row(friday).endsWith(`[English: ${enFor(friday)}]`) && !/English:/.test(US.storyContext.row(lineOf(/London/))), 'Story’s AI reads the English beside the Hebrew line – and nothing extra on the line that is English already');
  E.setShow(false);
  return log.join(' | ');
} finally {
  for (const k of Object.keys(keep.ai)) US.ai[k] = keep.ai[k];
  try { const old = await T.seqByName(SEQ); if (old) await US.host.call('deleteSequence', { seqId: old.id }); } catch (e) { /* the next run removes it */ }
  if (keep.saved) { try { E.unforget(keep.saved); E.flush(); } catch (e) { /* nothing to put back */ } }
  Object.assign(st, savedState); if (!savedState.proView) delete st.proView; if (!savedState.english) delete st.english; if (!savedState.finds) delete st.finds;
  try { await S.importFiles(US.jobs.testJob('story'), [T.media('transcripts', 'I001_interview.srt')]); } catch (e) { /* the next Story test re-imports it */ }
  S.reindex(); S.save();
  for (const f of made) { if (f && !/\.srt$/i.test(f)) { try { fs.unlinkSync(f); } catch (e) { /* gone */ } } }   // the .srt files are in the test project now: left where they are
  for (const k of SET) US.settings.set(k, keep.set[k] === undefined ? null : keep.set[k]);
  E.reset();
  releaseD(); releaseU();
  if (keep.tool) US.tools.open(keep.tool);
}
