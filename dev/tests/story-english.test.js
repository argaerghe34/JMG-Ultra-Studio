// Story › English translation (US.storyEnglish): the language of an interview from its letters (and mixed lines);
// translating line by line with ids and times never changing, context either side, names kept as names and out of AI
// when the editor says so, what Listen to delivery heard fed in; carrying on where it stopped and doing again only the
// lines whose words changed; nothing sent for a project kept on this computer without a model here; the English
// transcript (plain and with the original beside it, right-to-left marked); subtitles for an interview and – at
// timeline times – for a sequence, with a line cut in half by a clip's in and out and the same line used twice; Find
// and Story's AI reading the English. A stand-in translator throughout: no AI, no network, no cost.
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path'), zlib = require('zlib');
const { load, test, ROOT } = require('./harness');
global.addEventListener = global.addEventListener || (() => {});
global.ResizeObserver = global.ResizeObserver || function () { return { observe() {} }; };
const US = load(['time', 'audio', 'dsp', 'vision', 'transcript', 'ai', 'understand-models', 'understand', 'delivery', 'ui', 'app',
  'js/tools/22-story-board.js', 'js/tools/22-story-captions.js', 'js/tools/22-story-export.js', 'js/tools/22-story-timeline.js', 'js/tools/22-story-narrative.js', 'js/tools/22-story-moments.js', 'js/tools/22-story-ai.js',
  'js/tools/22-story-ask.js', 'js/tools/22-story-context.js', 'js/tools/22-story-glossary.js', 'js/tools/22-story-questions.js', 'js/tools/22-story-lines.js', 'js/tools/22-story.js', 'js/tools/22-story-delivery.js', 'js/tools/22-story-english.js']);
const E = US.storyEnglish, P = E._pure, S = US.story, T = US.transcript, C = US.storyContext;
const job = { set() { return job; }, progress() { return job; }, busy() { return job; }, range() { return job; }, check() {}, log() {} };
const CTX0 = US.ctx, AI0 = US.ai, CALL0 = US.host.call;
const HEB = 'בעזרת השם';
const EN = { h1: 'My name is Ruth, and I grew up in a small flat.', h2: 'Every Friday the table was full, b’ezrat Hashem [with God’s help].', h3: 'My father always said', h4: 'that a home is only as warm as its open door, and he said it every single week of my childhood without fail.', e2: 'She said b’ezrat Hashem [with God’s help] and we laughed.' };

function project(name = 'English film') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'us-eng-')), prproj = path.join(dir, name + '.prproj');
  fs.writeFileSync(prproj, 'x');
  const media = n => { const p = path.join(dir, n); fs.writeFileSync(p, 'x'); return p; };
  US.ctx = { project: { name, path: prproj }, sequence: { id: 's1', name: 'Cut 1' } };
  US.settings.set('story.exportDir', path.join(dir, 'out'));
  E.reset(); US.delivery.reset();
  S.loadState();
  const st = S.state();
  st.transcripts = [
    { key: 'ruth', name: 'Ruth.mp4', path: media('Ruth.mp4'), itemId: 'i1', source: 'file', language: 'he-IL', lines: [
      { id: 'h1', start: 0.6, end: 5.3, speaker: 'Ruth', text: 'שמי רות ואני גדלתי בדירה קטנה' },
      { id: 'h2', start: 12.5, end: 19.1, speaker: 'Ruth', text: 'כל יום שישי השולחן היה מלא, ' + HEB },
      { id: 'h3', start: 21.5, end: 24, speaker: 'Ruth', text: 'אבא שלי תמיד אמר' },
      { id: 'h4', start: 24, end: 36, speaker: 'Ruth', text: 'שבית חם רק כמו הדלת הפתוחה שלו והוא אמר את זה כל שבוע' },
      { id: 'h5', start: 37, end: 38, speaker: 'Ruth', text: '[laughs]' }] },
    { key: 'sam', name: 'Sam.mp4', path: media('Sam.mp4'), itemId: 'i2', source: 'file', language: 'en-GB', lines: [
      { id: 'e1', start: 0.5, end: 6, speaker: 'Sam', text: 'We always managed, one way or another.' },
      { id: 'e2', start: 7, end: 12, speaker: 'Sam', text: `She said ${HEB} and we laughed.` }] }
  ];
  st.glossary = []; st.english = null;
  S.reindex(); S.save();
  return { dir, prproj, st };
}
/** A stand-in for the editor's text AI: it “translates” the ids under LINES – and, like a careless model, also answers a context line and one it made up. */
function translator({ fail = () => false, only = null } = {}) {
  const calls = [];
  US.ai = Object.assign({}, AI0, { available: () => true, provider: () => 'claude', label: () => 'Claude (stand-in)', estimateFor: () => ({ usd: 0.01 }), approveTotal: async usd => { calls.approved = usd; },
    json: async req => {
      calls.push(req);
      if (fail(calls.length)) throw new US.UserError('AI_FAILED', { title: 'The AI didn’t answer.' });
      const lines = req.user.split('\nLINES (id<TAB>speaker<TAB>text):\n')[1].split('\nCONTEXT')[0].split('\n').map(r => r.split('\t')[0]);
      return { lines: lines.filter(id => !only || only.includes(id)).map(id => ({ id, en: EN[id] || 'English for ' + id, start: 999 })).concat([{ id: 'h1x', en: 'made up' }, { id: 'e1', en: 'a context line, translated anyway' }]) };
    } });
  return calls;
}
const done = () => { US.ai = AI0; US.host.call = CALL0; US.ai.setProjectOffline(false); US.settings.set('story.exportDir', ''); US.ctx = CTX0; E.reset(); };
function unzip(buf) {
  const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06])), n = buf.readUInt16LE(eocd + 10), out = {}; let p = buf.readUInt32LE(eocd + 16);
  for (let i = 0; i < n; i++) {
    const method = buf.readUInt16LE(p + 10), csize = buf.readUInt32LE(p + 20), nl = buf.readUInt16LE(p + 28), off = buf.readUInt32LE(p + 42), name = buf.toString('utf8', p + 46, p + 46 + nl);
    const raw = buf.subarray(off + 30 + buf.readUInt16LE(off + 26) + buf.readUInt16LE(off + 28), off + 30 + buf.readUInt16LE(off + 26) + buf.readUInt16LE(off + 28) + csize);
    out[name] = (method === 8 ? zlib.inflateRawSync(raw) : raw).toString('utf8'); p += 46 + nl + buf.readUInt16LE(p + 30) + buf.readUInt16LE(p + 32);
  }
  return out;
}

test('which language: from the letters – Hebrew, Yiddish, Arabic, Russian – and a few common words for the Latin ones; mixed lines say what else is in them', () => {
  const d = t => E.detect(t).lang;
  assert.deepStrictEqual([d('שמי רות ואני גדלתי בדירה קטנה'), d('איך בין געווען אַ קינד און מיר האָבן נישט געהאַט קיין געלט'), d('أنا من القدس وكان أبي خبازاً'), d('Меня зовут Рут, я выросла в маленькой квартире'), d('Я виросла у Києві, і це було давно')],
    ['Hebrew', 'Yiddish', 'Arabic', 'Russian', 'Ukrainian']);
  assert.deepStrictEqual([d('We always managed, one way or another.'), d('Je ne sais pas ce que nous allons faire avec les enfants'), d('No sé lo que vamos a hacer con los niños, pero es lo que hay'), d('Ich weiß nicht, was wir mit den Kindern machen und das ist nicht gut')],
    ['English', 'French', 'Spanish', 'German']);
  assert.deepStrictEqual([d('Stamford Hill'), d('Ruth'), d('OK'), d(''), d('[laughs]'), d('… 1960 –')], ['English', 'English', 'English', '', '', ''], 'a name or a word in Latin letters is not “another language”; nothing said is nothing');
  // mixed, both ways round
  assert.deepStrictEqual(E.detect(`She said ${HEB} and we laughed.`), { lang: 'English', others: ['Hebrew'], letters: 27, rtl: false });
  const m = E.detect('אמרתי לו okay, no problem ואז הלכנו הביתה');
  assert.deepStrictEqual([m.lang, m.others, m.rtl], ['Hebrew', ['English'], true]);
  assert.deepStrictEqual([E.isRTL('Hebrew'), E.isRTL('Yiddish'), E.isRTL('Arabic'), E.isRTL('Russian'), E.isRTL('English')], [true, true, true, false, false]);
  assert.deepStrictEqual(['he-IL', 'iw', 'Hebrew', 'en-GB', 'yi', 'English (UK)', '', 'xx'].map(P.fromHint), ['Hebrew', 'Hebrew', 'Hebrew', 'English', 'Yiddish', 'English', '', '']);
});

test('an interview’s language: most of its letters; the editor’s choice wins; an English one is never offered a translation – only its lines in another language', () => {
  const pr = project();
  try {
    const [ruth, sam] = E.statuses();
    assert.deepStrictEqual([ruth.lang, ruth.set, ruth.english, ruth.mixed, ruth.need, ruth.done, ruth.rtl, ruth.todo.map(l => l.id)], ['Hebrew', false, false, false, 4, 0, true, ['h1', 'h2', 'h3', 'h4']], 'every line that says something; “[laughs]” needs no English');
    assert.deepStrictEqual([sam.lang, sam.english, sam.mixed, sam.need, sam.todo.map(l => l.id), sam.others], ['English', false, true, 1, ['e2'], [{ lang: 'Hebrew', lines: 1 }]]);
    pr.st.transcripts[1].lines.pop(); S.reindex();
    const sam2 = E.statuses()[1];
    assert.deepStrictEqual([sam2.lang, sam2.english, sam2.need, sam2.todo], ['English', true, 0, []], 'all in English: nothing to translate');
    assert.deepStrictEqual(E.plan({}).map(x => x.t.key), ['ruth'], '“Translate all interviews not in English” leaves it alone');
    // set by hand
    E.setLanguage('sam', 'French');
    assert.deepStrictEqual([E.statuses()[1].lang, E.statuses()[1].set, E.statuses()[1].need], ['French', true, 1]);
    E.setLanguage('sam', '');
    assert.strictEqual(E.statuses()[1].lang, 'English');
    // Latin letters with the app's own word for it: a short interview Premiere says is French
    assert.strictEqual(E.languageOf([{ text: 'Bonjour Ruth.' }], { hint: 'fr-FR' }).lang, 'French');
    assert.strictEqual(E.languageOf([{ text: 'Hello Ruth.' }], { hint: '' }).lang, 'English');
    assert.strictEqual(E.languageOf([{ text: 'שלום רות' }], { hint: 'en-GB' }).lang, 'Hebrew', 'the letters count for more than the label');
  } finally { done(); }
});

test('the request: ids, speaker and text under LINES, the lines either side as context only, names to keep, what was really said – and the model is told to return ids and English, never times', () => {
  const all = Array.from({ length: 7 }, (_, i) => ({ id: 'L' + i, start: i * 5, end: i * 5 + 4, speaker: 'Ruth', text: 'שורה מספר ' + i }));
  const bs = P.batches(all, all.slice(2, 6), { max: 3, context: 2 });
  assert.deepStrictEqual(bs.map(b => [b.before.map(l => l.id).join(), b.lines.map(l => l.id).join(), b.after.map(l => l.id).join()]), [['L0,L1', 'L2,L3,L4', 'L5,L6'], ['L3,L4', 'L5', 'L6']]);
  assert.deepStrictEqual(P.batches(all, []), []);
  assert.strictEqual(P.batches(all, all, { chars: 70 }).length, 4, 'a batch also stops at a size');
  const req = P.request(bs[0], { lang: 'Hebrew', n: 3, terms: ['Ruth Gersch', 'Stamford Hill'], speakerName: s => s, heardOf: l => (l.id === 'L3' ? [{ said: HEB, tr: 'b’ezrat Hashem', had: 'bizarre a sham', conf: 'sure' }, { said: 'x', conf: 'unsure' }] : []) });
  assert.ok(/^Interview 3\. It is mostly in Hebrew\.\nNAMES \(spell them like this\): Ruth Gersch, Stamford Hill\nCONTEXT – the lines just before \(do not translate\):\n\(Ruth\) שורה מספר 0\n\(Ruth\) שורה מספר 1\nLINES \(id<TAB>speaker<TAB>text\):\nL2\tRuth\tשורה מספר 2\n/.test(req.user), req.user);
  assert.ok(req.user.includes(`L3\tRuth\tשורה מספר 3 [really said: “${HEB}” (b’ezrat Hashem) where the transcript has “bizarre a sham”]\n`), 'what Listen to delivery heard goes in (not the unsure one)');
  assert.ok(/\nCONTEXT – the lines just after \(do not translate\):\n\(Ruth\) שורה מספר 5\n\(Ruth\) שורה מספר 6$/.test(req.user));
  assert.ok(typeof req.user === 'string' && req.feature === 'English translation' && req.schema === P.SCHEMA, 'plain text, through the text AI');
  const s = req.system;
  assert.ok(/Give no times and no ids of your own/.test(s) && /never translate or return them/.test(s) && /Names of people and places are not translated/.test(s) && /followed by a short gloss in square brackets/.test(s) && /a line that mixes languages becomes one natural English line/.test(s) && /Never invent/.test(s) && /each line keeping its own part/.test(s));
  assert.deepStrictEqual(Object.keys(P.SCHEMA.properties.lines.items.properties), ['id', 'en'], 'the answer has no room for times');
  // the answer: only the ids asked for, each once; nothing for a context line or one it made up; an empty one is no translation
  const got = P.readAnswer({ lines: [{ id: 'L2', en: ' Line  two. ' }, { id: 'L2', en: 'again' }, { id: 'L0', en: 'context' }, { id: 'zz', en: 'made up' }, { id: 'L3', en: '' }, { id: 'L4', en: 'Line four.', start: 1, end: 2 }] }, bs[0]);
  assert.deepStrictEqual([...got], [['L2', 'Line two.'], ['L4', 'Line four.']]);
  assert.deepStrictEqual([...P.readAnswer(null, bs[0])], []);
});

test('translating: every line keeps its id and its times; it carries on where it stopped; only lines whose words changed are done again; it travels with the project', async () => {
  const pr = project();
  let calls = translator({ only: ['h1', 'h2'] });
  try {
    const before = JSON.stringify(pr.st.transcripts);
    assert.ok(/4 lines · about 1¢ with Claude \(stand-in\) · 1 request/.test(E.describePlan(E.plan({ keys: ['ruth'] }))), E.describePlan(E.plan({ keys: ['ruth'] })));
    // the model only answers two of the four lines (as if it stopped): they are kept, the rest still to do
    const r1 = await E.translate(job, { keys: ['ruth'] });
    assert.deepStrictEqual([r1.lines, r1.interviews, calls.length], [2, 1, 1]);
    assert.ok(/2 lines translated into English in 1 interview · AI translation – check before publishing/.test(r1.summary));
    assert.strictEqual(JSON.stringify(pr.st.transcripts), before, 'the transcript itself – ids, times, words – is untouched');
    assert.deepStrictEqual([E.enOf('h1'), E.enOf(S.lineOf('h2')), E.enOf('h3'), E.enOf('e1')], [EN.h1, EN.h2, '', ''], 'by id or by line; a context line’s “translation” and a made-up id were dropped');
    assert.deepStrictEqual([E.statuses()[0].done, E.statuses()[0].todo.map(l => l.id), E.statuses()[0].by], [2, ['h3', 'h4'], 'Claude (stand-in)']);
    // again: only what's left is asked for – with the lines before it as context
    calls = translator();
    const r2 = await E.translate(job, { keys: ['ruth'] });
    assert.deepStrictEqual([r2.lines, calls.length], [2, 1]);
    assert.ok(/LINES \(id<TAB>speaker<TAB>text\):\nh3\t/.test(calls[0].user) && !/\nh1\t/.test(calls[0].user) && /CONTEXT – the lines just before \(do not translate\):\n\(Ruth\) שמי רות/.test(calls[0].user));
    assert.deepStrictEqual(await E.translate(job, { keys: ['ruth'] }).then(r => [r.lines, calls.length]), [0, 1], 'all done: nothing is sent');
    // “all interviews not in English” doesn't touch the English one, even its Hebrew line – that is asked for by name
    assert.strictEqual((await E.translate(job, {})).lines, 0);
    await E.translate(job, { keys: ['sam'] });
    assert.ok(/LINES \(id<TAB>speaker<TAB>text\):\ne2\tSam\tShe said /.test(calls[1].user) && !/\ne1\t/.test(calls[1].user.split('LINES')[1].split('CONTEXT')[0]), 'in an English interview only the line with Hebrew in it');
    assert.strictEqual(E.enOf('e2'), EN.e2);
    // a line reworded (the transcripts read again, a name corrected): its English is gone, and only that line is done again
    S.lineOf('h3').text = 'אבא שלי תמיד אמר לנו';
    assert.deepStrictEqual([E.enOf('h3'), E.enOf('h4'), E.statuses()[0].todo.map(l => l.id)], ['', EN.h4, ['h3']]);
    await E.translate(job, { keys: ['ruth'] });
    assert.ok(/LINES \(id<TAB>speaker<TAB>text\):\nh3\t[^\n]*\nCONTEXT/.test(calls[2].user), 'one line in the request');
    // beside the project, and read back on another computer
    E.flush();
    const file = path.join(pr.dir, 'JMG Ultra Studio', 'English film – English.json');
    assert.ok(fs.existsSync(file), fs.readdirSync(pr.dir).join());
    const kept = JSON.parse(fs.readFileSync(file, 'utf8'));
    assert.ok(/AI translation – check before publishing/.test(kept._about) && kept.interviews.ruth.lang === 'Hebrew' && kept.interviews.ruth.lines.h1.en === EN.h1 && !('start' in kept.interviews.ruth.lines.h1), 'ids and English only – no times are kept with a translation');
    fs.unlinkSync(P.localFile()); E.reset();
    assert.strictEqual(E.enOf('h2'), EN.h2);
    // forget() and unforget(), for the e2e test
    const saved = E.forget('ruth');
    assert.deepStrictEqual([E.enOf('h2'), E.statuses()[0].done], ['', 0]);
    E.unforget(saved);
    assert.strictEqual(E.enOf('h2'), EN.h2);
  } finally { done(); }
});

test('a request that fails is said, the rest is kept; Stop stops; a big job asks once for the whole cost', async () => {
  const pr = project();
  pr.st.transcripts[0].lines = Array.from({ length: 90 }, (_, i) => ({ id: 'b' + i, start: i * 4, end: i * 4 + 3, speaker: 'Ruth', text: 'זו שורה מספר ' + i + ' של הראיון' }));
  S.reindex();
  let calls = translator({ fail: n => n === 2 || n === 3 });   // the second batch fails, and its one retry
  try {
    const r = await E.translate(job, { keys: ['ruth'] });
    assert.deepStrictEqual([calls.length, r.lines, E.statuses()[0].done], [4, 50, 50], 'three batches (40, 40, 10): the middle one failed twice');
    assert.ok(/Part 2 of 3 \(Ruth\.mp4\) couldn’t be read/.test(r.missing) && calls.approved > 0, r.missing);
    calls = translator();
    let n = 0;
    await assert.rejects(() => E.translate({ set() {}, progress() {}, check() { if (n++ === 1) throw new US.UserError('CANCELLED'); } }, { keys: ['ruth'], force: true }), e => e.code === 'CANCELLED');
    assert.strictEqual(calls.length, 1, 'stopped between requests');
    assert.strictEqual(E.statuses()[0].done, 50, 'and what was there is still there');
    calls = translator({ fail: () => true });
    await assert.rejects(() => E.translate(job, { keys: ['ruth'] }), e => /didn’t answer/.test(e.title));
  } finally { done(); }
});

test('nothing is sent for a project kept on this computer without a model here; names kept out of AI are no hint; only text goes, through US.ai.json', async () => {
  const pr = project();
  try {
    // the real US.ai: no key, no local model, and the project is “nothing leaves this computer”
    let sent = 0; const keepJson = US.ai.json, was = { a: US.secrets.get('anthropicKey'), g: US.secrets.get('geminiKey'), l: US.settings.get('ai.localModel', '') };
    US.secrets.set('anthropicKey', ''); US.secrets.set('geminiKey', ''); US.settings.set('ai.localModel', '');
    US.ai.json = async () => { sent++; return { lines: [] }; };
    try {
      US.ai.setProjectOffline(true);
      assert.strictEqual(US.ai.available(), false);
      await assert.rejects(() => E.translate(job, { keys: ['ruth'] }), e => e.code === 'AI_KEY' && /nothing leaves this computer/.test(e.title) && /model on this computer/.test(e.title) && /Models on this computer/.test(e.action));
      // a key doesn't change that: a project kept here is only ever translated by a model on this computer
      US.secrets.set('anthropicKey', 'sk-test');
      assert.strictEqual(US.ai.available(), false);
      await assert.rejects(() => E.translate(job, { keys: ['ruth'] }), e => e.code === 'AI_KEY');
      US.secrets.set('anthropicKey', '');
      US.ai.setProjectOffline(false);
      await assert.rejects(() => E.translate(job, { keys: ['ruth'] }), e => e.code === 'AI_KEY' && /Translating needs AI/.test(e.title));
      assert.deepStrictEqual([sent, E.statuses()[0].done], [0, 0]);
    } finally { US.ai.json = keepJson; US.secrets.set('anthropicKey', was.a || ''); US.secrets.set('geminiKey', was.g || ''); US.settings.set('ai.localModel', was.l || ''); }
    // Names and terms: spellings are given to the translator – but not the ones marked “Keep out of AI” (US.ai swaps those for placeholders in everything sent)
    pr.st.glossary = [{ right: 'Stamford Hill', heard: [], hide: false }, { right: 'Ruth Gersch', heard: ['Gersh'], hide: true }];
    const calls = translator();
    await E.translate(job, { keys: ['ruth'] });
    assert.ok(/NAMES \(spell them like this\): Stamford Hill\n/.test(calls[0].user) && !/Gersch/.test(calls[0].user));
    assert.ok(calls.every(q => typeof q.user === 'string' && typeof q.system === 'string' && !/"media"|"image"/.test(JSON.stringify(q))), 'text only: the footage rule is untouched');
    assert.ok(!/Ruth\.mp4/.test(calls[0].user + calls[0].system), 'the interview is named by its number, not its file');
  } finally { done(); }
});

test('the English transcript: speakers and timecodes, marked as an AI translation; with the original beside it the Hebrew column is right-to-left; text and CSV too', async () => {
  const pr = project();
  translator();
  US.host.call = async (fn, a) => (fn === 'storyTiming' ? { i1: { start: 3600, fps: 25, drop: false } } : {});
  try {
    await assert.rejects(() => E.exportTranscript(job, { key: 'ruth' }), e => /hasn’t been translated yet/.test(e.title) && /Press Translate first/.test(e.action));
    await E.translate(job, { keys: ['ruth'] });
    const d = E.documentOf(pr.st.transcripts[0], { bilingual: true });
    assert.deepStrictEqual(d.rows.map(r => [r.tc, r.speaker, r.translated]), [['00:00:00:15', 'Ruth', true], ['00:00:12:12', 'Ruth', true], ['00:00:21:12', 'Ruth', true], ['00:00:24:00', 'Ruth', true]], 'the transcript’s own times and speakers; “[laughs]” isn’t a line of speech');
    assert.deepStrictEqual([d.lang, d.rtl, d.rows[1].en, d.rows[1].orig], ['Hebrew', true, EN.h2, pr.st.transcripts[0].lines[1].text]);
    // Word, plain
    const plain = await E.exportTranscript(job, { key: 'ruth', format: 'docx' });
    assert.ok(/Ruth\.mp4 – English transcript \d{4}-\d\d-\d\d\.docx$/.test(plain.file) && fs.existsSync(plain.file) && /4 lines · AI translation – check before publishing/.test(plain.summary), plain.summary);
    assert.ok(plain.file.startsWith(path.join(pr.dir, 'out')), 'where Story’s other documents go');
    const x1 = unzip(fs.readFileSync(plain.file))['word/document.xml'];
    assert.ok(x1.includes('English transcript – Ruth.mp4') && x1.includes('AI translation – check before publishing.') && x1.includes('Translated from Hebrew by Claude (stand-in)') && x1.includes('01:00:12:12') && x1.includes('Ruth: ') && x1.includes('b’ezrat Hashem [with God’s help]'), 'source timecode, speaker, English, and the mark');
    assert.ok(!x1.includes('<w:tbl>') && !x1.includes(HEB) && !x1.includes('<w:bidi/>'));
    // Word, the original beside the English
    const both = await E.exportTranscript(job, { key: 'ruth', format: 'docx', bilingual: true });
    assert.ok(/English transcript \(with original\)/.test(both.file));
    const x2 = unzip(fs.readFileSync(both.file))['word/document.xml'];
    assert.ok(x2.includes('<w:tbl>') && x2.includes('Original (Hebrew)') && x2.includes(HEB) && x2.includes(EN.h1));
    assert.strictEqual((x2.match(/<w:bidi\/>/g) || []).length, 4, 'each Hebrew paragraph starts at the right');
    assert.ok(new RegExp(`<w:rPr><w:rtl/></w:rPr><w:t xml:space="preserve">[^<]*${HEB}`).test(x2), 'and its text runs right-to-left');
    assert.ok(!/<w:rtl\/>[^<]*<\/w:rPr><w:t xml:space="preserve">My name is Ruth/.test(x2), 'the English column is left-to-right');
    // text and CSV
    const txt = fs.readFileSync((await E.exportTranscript(job, { key: 'ruth', format: 'txt', bilingual: true })).file, 'utf8');
    assert.ok(/^English transcript – Ruth\.mp4\n.*translated from Hebrew\nAI TRANSLATION – CHECK BEFORE PUBLISHING\n\n01:00:00:15 {2}Ruth: My name is Ruth, and I grew up in a small flat\.\n {10}שמי רות/.test(txt), txt.slice(0, 300));
    const csv = fs.readFileSync((await E.exportTranscript(job, { key: 'ruth', format: 'csv' })).file, 'utf8');
    assert.ok(csv.charCodeAt(0) === 0xFEFF && /Time in,Time out,Speaker,English \(AI translation – check before publishing\),Original \(Hebrew\)\r\n01:00:00:15,01:00:05:07,Ruth,"My name is Ruth, and I grew up in a small flat\.",שמי רות/.test(csv), csv.slice(0, 300));
    // an English interview with one Hebrew line: its English lines are the transcript's own
    await E.translate(job, { keys: ['sam'] });
    const ds = E.documentOf(pr.st.transcripts[1], { bilingual: true });
    assert.deepStrictEqual(ds.rows.map(r => [r.en, r.translated]), [['We always managed, one way or another.', false], [EN.e2, true]]);
    // a line still without English is said, not left out
    S.lineOf('h3').text = 'אבא שלי תמיד אמר לנו';
    const part = await E.exportTranscript(job, { key: 'ruth', format: 'txt' });
    assert.ok(/1 not translated yet/.test(part.summary) && /Ruth: \[not translated\]/.test(fs.readFileSync(part.file, 'utf8')));
  } finally { done(); }
});

test('English subtitles for an interview: at the transcript’s times, two lines of up to 42 characters, a long line split in proportion to its time; .srt and .vtt', async () => {
  const pr = project();
  translator();
  try {
    await E.translate(job, { keys: ['ruth'] });
    const srt = await E.exportSubtitles(job, { key: 'ruth', format: 'srt' });
    assert.ok(/Captions[\\/]Ruth\.mp4 – English subtitles \(AI translation\)\.srt$/.test(srt.file) && /AI translation – check before publishing/.test(srt.summary), srt.file);
    const text = fs.readFileSync(srt.file, 'utf8'), cues = text.trim().split(/\n\n/).map(b => { const [n, time, ...rest] = b.split('\n'); const t = x => { const m = /(\d+):(\d+):(\d+),(\d+)/.exec(x); return +m[1] * 3600 + +m[2] * 60 + +m[3] + +m[4] / 1000; }; return { n: +n, start: t(time.split(' --> ')[0]), end: t(time.split(' --> ')[1]), lines: rest }; });
    assert.deepStrictEqual(cues.map(c => c.n), cues.map((_, i) => i + 1));
    assert.ok(cues.every(c => c.lines.length <= 2 && c.lines.every(l => l.length <= 48)), 'two lines, about 42 characters each: ' + JSON.stringify(cues.map(c => c.lines)));
    assert.ok(cues.every((c, i) => c.end > c.start && (!i || c.start >= cues[i - 1].end - 0.001)), 'in order, never overlapping');
    assert.deepStrictEqual([cues[0].start, cues[0].lines.join(' ')], [0.6, 'My name is Ruth, and I grew up in a small flat.'], 'the first line at its own time');
    // the long line (24–36 s) is several subtitles spread over its twelve seconds, none before it starts or after it ends
    const long = cues.filter(c => c.start >= 24 - 0.001 && c.end <= 36.001);
    assert.ok(long.length >= 2 && long.every(c => c.end - c.start <= 7.01) && Math.abs(long[0].start - 24) < 0.01 && Math.abs(long[long.length - 1].end - 36) < 0.3, JSON.stringify(long));
    assert.strictEqual(long.map(c => c.lines.join(' ')).join(' '), EN.h4, 'every word, once');
    const share = long[0].lines.join(' ').split(' ').length / EN.h4.split(' ').length, time = (long[0].end - long[0].start) / 12;
    assert.ok(Math.abs(share - time) < 0.12, `the first part has ${Math.round(share * 100)}% of the words and ${Math.round(time * 100)}% of the time`);
    assert.ok(!text.includes(HEB) && !/\[laughs\]/.test(text), 'English only');
    const vtt = fs.readFileSync((await E.exportSubtitles(job, { key: 'ruth', format: 'vtt' })).file, 'utf8');
    assert.ok(/^WEBVTT\n\nNOTE AI translation – check before publishing\n\n1\n00:00:00\.600 --> 00:00:0\d\.\d{3}\nMy name is Ruth/.test(vtt), vtt.slice(0, 200));
    await assert.rejects(() => E.exportSubtitles(job, { key: 'nope' }), e => /isn’t in Story any more/.test(e.title));
    E.forget('ruth');
    await assert.rejects(() => E.exportSubtitles(job, { key: 'ruth' }), e => /hasn’t been translated yet/.test(e.title));
  } finally { done(); }
});

test('English subtitles for a sequence: at TIMELINE times – a line cut in half by a clip’s in and out gets its half of the English, a line used twice is subtitled twice, an English line keeps its own words', async () => {
  const pr = project();
  translator();
  const ruth = pr.st.transcripts[0].path, sam = pr.st.transcripts[1].path, placed = [];
  // the cut: Ruth 12.5–19.1 whole at 0 s · Sam's English line at 10 s · Ruth's long line from its middle (30–36 of 24–36) at 20 s · the first again at 30 s · a clip with no transcript
  const clip = (start, p, i, o, itemId) => ({ start, end: start + (o - i), in: i, out: o, speed: 1, itemId, path: p, name: path.basename(p) });
  US.host.call = async (fn, a) => {
    if (fn === 'sequenceInfo') return { id: 's1', name: 'Cut 1', fps: 25, audio: [{ index: 0, name: 'A1', clips: [clip(0, ruth, 12.5, 19.1, 'i1'), clip(10, sam, 0.5, 6, 'i2'), clip(20, ruth, 30, 36, 'i1'), clip(30, ruth, 12.5, 19.1, 'i1'), clip(40, '/x/music.wav', 0, 5, 'i9')] }], video: [{ index: 0, clips: [] }] };
    if (fn === 'storySequenceTiming') return { zero: 0, fps: 25, drop: false };
    if (fn === 'storyCaptions') { placed.push(a); return { added: true }; }
    return {};
  };
  try {
    // nothing translated yet: only the line that is English already can be subtitled – the rest is counted, and said
    const r0 = await E.sequenceSubtitles(job, { seqId: 's1', add: false });
    assert.deepStrictEqual([r0.count, r0.missing, placed.length], [1, 2, 0]);
    assert.ok(/2 lines not translated yet, left out/.test(r0.summary), r0.summary);
    await E.translate(job, { keys: ['ruth'] });
    const r = await E.sequenceSubtitles(job, { seqId: 's1' });
    assert.deepStrictEqual([r.added, r.missing, placed.length], [true, 0, 1]);
    assert.deepStrictEqual([placed[0].seqId, placed[0].srt, placed[0].binPath], ['s1', r.file, 'JMG Ultra Studio/Story/Captions'], 'Story’s own caption command: the file into the project and onto the sequence – the same in both editors');
    assert.ok(/Cut 1 – English subtitles \(AI translation\)( \(\d+\))?\.srt$/.test(r.file) && /English subtitles added to “Cut 1” · AI translation – check before publishing/.test(r.summary), r.summary);
    const blocks = fs.readFileSync(r.file, 'utf8').trim().split(/\n\n/).map(b => { const [, time, ...rest] = b.split('\n'); const t = x => { const m = /(\d+):(\d+):(\d+),(\d+)/.exec(x); return +m[2] * 60 + +m[3] + +m[4] / 1000; }; return { start: t(time.split(' --> ')[0]), end: t(time.split(' --> ')[1]), text: rest.join(' ') }; });
    const at = (a, b) => blocks.filter(c => c.start >= a - 0.01 && c.end <= b + 0.01).map(c => c.text).join(' ');
    assert.strictEqual(at(0, 6.7), EN.h2, 'the whole line, at the start of the timeline – not at 12.5 s');
    assert.strictEqual(at(10, 15.6), 'We always managed, one way or another.', 'a line already in English is its own subtitle');
    const half = at(20, 26.1);
    assert.ok(half && EN.h4.endsWith(half) && !EN.h4.startsWith(half) && Math.abs(half.split(' ').length / EN.h4.split(' ').length - 0.5) < 0.15, 'the second half of the line gets the second half of the English: ' + half);
    assert.strictEqual(at(30, 36.7), EN.h2, 'used twice: subtitled twice, each at its own place');
    assert.ok(blocks.every(c => c.end <= 36.71), 'nothing for the clip without a transcript');
    // pure: the same mapping from Story's own timeline entries
    const TLn = US.storyTimeline, lines = pr.st.transcripts[0].lines;
    const entries = TLn.mapLines(clip(100, ruth, 30, 33, 'i1'), lines);
    const en = P.englishEntries(entries, { lineOf: id => S.lineOf(id), enOf: E.enOf });
    assert.deepStrictEqual([en.entries.length, en.entries[0].start, en.entries[0].end, en.missing], [1, 100, 103, 0]);
    assert.ok(/^….*…$/.test(en.entries[0].text), 'cut at both ends: ' + en.entries[0].text);
    assert.deepStrictEqual([P.sliceEnglish('one two three four', 0, 0.5), P.sliceEnglish('one two three four', 0.5, 1), P.sliceEnglish('one two three four', 0.25, 0.75), P.sliceEnglish('one', 0.4, 0.6), P.sliceEnglish('', 0, 1)], ['one two…', '…three four', '…two three…', 'one', '']);
    // a line with no English yet is left out and counted; “only the file” doesn't touch the sequence
    E.forget('ruth'); translator({ only: ['h2'] }); await E.translate(job, { keys: ['ruth'] });
    const r2 = await E.sequenceSubtitles(job, { seqId: 's1', add: false });
    assert.deepStrictEqual([r2.added, r2.missing, placed.length], [false, 1, 1]);
    assert.ok(/1 line not translated yet, left out/.test(r2.summary));
    // Resolve, when it can't place a subtitle file by script: said plainly, with what to drag where
    const toasts = [], keepToast = US.ui.toast; US.ui.toast = t => toasts.push(t);
    const call = US.host.call; US.host.call = async (fn, a) => (fn === 'storyCaptions' ? { added: false } : call(fn, a));
    try { const r3 = await E.sequenceSubtitles(job, { seqId: 's1' }); assert.ok(r3.added === false && /to drag onto the timeline/.test(r3.summary) && /Drag “Cut 1 – English subtitles/.test(toasts[0].text) && /JMG Ultra Studio\/Story\/Captions/.test(toasts[0].text)); } finally { US.ui.toast = keepToast; }
  } finally { done(); }
});

test('Story reads the English: Find finds a line by its English; what Story sends to its AI carries the English beside a line that isn’t English – and nothing when there is none', async () => {
  const pr = project();
  translator();
  try {
    const row0 = C.row(S.lineOf('h2')), sys0 = C.requests(S.scopeTranscripts(), { task: () => 'Task' })[0].req.system;
    assert.ok(!/English:/.test(row0) && sys0 === C.SYSTEM && E.note(S.lineOf('h2')) === '' && E.has() === false, 'no translations: nothing is added');
    assert.deepStrictEqual(E.searchMore('table', pr.st.transcripts[0].lines, []), []);
    await E.translate(job, { keys: ['ruth'] });
    // Find
    const lines = pr.st.transcripts.flatMap(t => t.lines);
    assert.deepStrictEqual(T.search('Friday table', lines).length, 0, 'the Hebrew words don’t match');
    const found = E.searchMore('Friday table', lines, T.search('Friday table', lines));
    assert.deepStrictEqual([found.map(r => r.line.id), found[0].line === S.lineOf('h2'), found[0].english], [['h2'], true, true], 'found by its English – and it is the original line that comes back, to play and to cut');
    assert.deepStrictEqual(S.search('small flat').map(r => r.line.id), ['h1'], 'Story’s own search (Find, Pro View) does the same');
    const both = E.searchMore('managed', lines, T.search('managed', lines));
    assert.deepStrictEqual(both.map(r => r.line.id), ['e1'], 'a line found by its own words stays once');
    // what the AI reads
    assert.strictEqual(C.row(S.lineOf('h2')), `${row0} [English: ${EN.h2}]`);
    assert.strictEqual(T.aiRow(S.lineOf('h1')), `h1\tRuth\t${S.lineOf('h1').text} [English: ${EN.h1}]`);
    assert.ok(!/English:/.test(C.row(S.lineOf('e1'))) && !/English:/.test(C.row(S.lineOf('h5'))), 'an English line, and one with nothing said, carry nothing');
    const req = C.requests(S.scopeTranscripts(), { task: () => 'Task' })[0].req;
    assert.ok(req.system.startsWith(C.SYSTEM) && req.system.endsWith(E.HINT) && /Name themes, write summaries and answer in English/.test(E.HINT));
    assert.strictEqual(T.aiUser('Lines:\n' + T.aiRow(S.lineOf('h1')), 'Group them.')[1], 'Group them.\n\n' + E.HINT);
    assert.strictEqual(T.aiUser('Lines:\n' + T.aiRow(S.lineOf('e1')), 'Group them.')[1], 'Group them.');
    // the switch for Story's lists
    assert.strictEqual(E.showOn(), false, 'off until switched on');
    E.setShow(true);
    assert.deepStrictEqual([E.showOn(), pr.st.english.show], [true, true]);
    // Pro View's filter reads it
    assert.ok(US.proView.hay({ l: S.lineOf('h2'), who: 'Ruth', themes: [], english: EN.h2 }).includes('friday the table was full'));
  } finally { done(); }
});

test('Ask can do it: translate, save the English transcript, add English subtitles – and it shows where it should', () => {
  const m = (id, t) => US.actions.get(id).match(t);
  assert.ok(m('story.translate', 'translate the interviews into English') && m('story.translate', 'translate the Hebrew interview'));
  assert.ok(m('story.englishTranscript', 'save the English transcript') && m('story.englishTranscript', 'export a bilingual transcript of the Hebrew interview').bilingual === true);
  assert.ok(m('story.englishSubtitles', 'add English subtitles to this sequence') && m('story.englishSubtitles', 'subtitle the cut in English'));
  assert.strictEqual(m('story.translate', 'add English subtitles to this sequence'), null);
  assert.strictEqual(m('story.englishSubtitles', 'find the themes'), null);
  assert.deepStrictEqual([US.actions.get('story.translate').changes, US.actions.get('story.englishSubtitles').changes], [false, true]);
  const story = fs.readFileSync(path.join(ROOT, 'js', 'tools', '22-story.js'), 'utf8');
  assert.ok(/US\.storyEnglish\.card\(\{ render \}\)/.test(story) && /US\.storyEnglish\.lineEl\(l\)/.test(story));
  const tour = fs.readFileSync(path.join(ROOT, 'js', 'tools', '04-tour-steps.js'), 'utf8');
  assert.ok(/target: 'text:English translation'/.test(tour));
  assert.ok(!new RegExp(String.fromCharCode(0xFEFF)).test(fs.readFileSync(path.join(ROOT, 'js', 'tools', '22-story-english.js'), 'utf8')), 'no byte-order mark hiding in the file');
});

test('in the panel (jsdom): with every interview in English the card is closed and offers nothing to translate; a Hebrew interview opens it with Translate; once translated – transcript, subtitles, the switch, the sequence, and the warning', () => {
  const r = require('child_process').spawnSync(process.execPath, [path.join(__dirname, 'english-ui.js')], { encoding: 'utf8', timeout: 120000 });
  const last = (r.stdout || '').trim().split('\n').pop();
  let o; try { o = JSON.parse(last); } catch (e) { throw new Error('english-ui.js gave no result:\n' + (r.stdout || '').slice(-1500) + (r.stderr || '').slice(-1500)); }
  assert.deepStrictEqual(o.errors, []);
  assert.deepStrictEqual(o.english, { there: true, closed: true, says: true, rows: 3, translate: [], toggle: false }, 'English interviews are never shown as needing a translation');
  assert.deepStrictEqual([o.hebrew.open, o.hebrew.pill, o.hebrew.sub, o.hebrew.rowButtons, o.hebrew.all, o.hebrew.langs], [true, 'Hebrew', '0 of 2 lines translated', ['Translate', 'By listening'], 'Translate all interviews not in English (2 lines)', ['Automatic – Hebrew', 'English', 'Hebrew']]);
  assert.ok(/1 interview not in English/.test(o.hebrew.hint));
  assert.deepStrictEqual(o.translated, { sub: '2 of 2 lines translated by Stand-in · AI translation – check before publishing', rowButtons: ['Translated', 'By listening', 'English transcript', 'English subtitles'], warn: true, show: true, sequence: true, formats: ['docx,txt,csv', 'srt,vtt'] });
  assert.ok(o.lineOff === false && /^EN English of /.test(o.lineOn), '“Show English under each line”: off until switched on');
});
