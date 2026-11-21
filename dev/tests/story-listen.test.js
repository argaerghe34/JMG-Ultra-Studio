// Story › English translation › By listening (US.storyListen): the spans come from this computer's own measure of
// where someone speaks – times never from a model; pieces never cut a span; the cloud only with Listen to delivery's
// own yes and never for a project kept on this computer; a model on this computer hears one span at a time and
// translates its own words as text; a span nobody is heard in has no text; a clip with no transcript (or an unusable
// one) gets a transcript made by listening that feeds the English transcript and subtitles; a usable transcript is
// kept, with what was heard beside it; a stopped run carries on. Stand-in routes throughout: no model, no network, no cost.
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path');
const { load, test, ROOT } = require('./harness');
global.addEventListener = global.addEventListener || (() => {});
global.ResizeObserver = global.ResizeObserver || function () { return { observe() {} }; };
const US = load(['time', 'audio', 'dsp', 'vision', 'transcript', 'ai', 'understand-models', 'understand', 'delivery', 'ui', 'app',
  'js/tools/14-footage.js', 'js/tools/01-overnight.js', 'js/tools/22-story-board.js', 'js/tools/22-story-captions.js', 'js/tools/22-story-export.js', 'js/tools/22-story-timeline.js', 'js/tools/22-story-narrative.js', 'js/tools/22-story-moments.js', 'js/tools/22-story-ai.js',
  'js/tools/22-story-ask.js', 'js/tools/22-story-context.js', 'js/tools/22-story-glossary.js', 'js/tools/22-story-questions.js', 'js/tools/22-story-lines.js', 'js/tools/22-story.js', 'js/tools/22-story-delivery.js', 'js/tools/22-story-english.js', 'js/tools/22-story-listen.js']);
const LI = US.storyListen, P = LI._pure, E = US.storyEnglish, D = US.delivery, S = US.story;
const job = { set() { return job; }, progress() { return job; }, busy() { return job; }, range() { return job; }, check() {}, log() {} };
const CTX0 = US.ctx, MEDIA0 = US.ai.media;
const sr = 16000;
/** Sound that is loud where someone “speaks” and a faint hiss elsewhere. dips: moments inside speech where it drops (not long enough to be a pause). */
const burst = (secs, on, dips = []) => { const d = new Float32Array(sr * secs); for (let i = 0; i < d.length; i++) { const t = i / sr, loud = on.some(([a, b]) => t >= a && t < b) && !dips.some(([a, b]) => t >= a && t < b); d[i] = (loud ? 0.2 : 0.0005) * Math.sin(i * 0.7) * (0.6 + 0.4 * Math.sin(i * 0.013)); } return d; };
const TALK = [[1, 4.2], [5, 8], [12, 13], [13.4, 14.2], [20, 26], [40, 44]];
const SOUND = () => burst(60, TALK);
const HEB = ['שמי רות ואני גדלתי בדירה קטנה', 'כל יום שישי השולחן היה מלא', 'בעזרת השם', 'אבא שלי תמיד אמר שבית חם כמו הדלת הפתוחה', ''];
const ENG = ['My name is Ruth and I grew up in a small flat.', 'Every Friday the table was full.', 'B’ezrat Hashem [with God’s help].', 'My father always said a home is as warm as its open door.', ''];
const near = (a, b, tol = 0.11) => Math.abs(a - b) <= tol;

function project(name = 'Listen film', lines = null) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'us-lis-')), prproj = path.join(dir, name + '.prproj');
  fs.writeFileSync(prproj, 'x');
  const media = path.join(dir, 'Savta.mp4'); fs.writeFileSync(media, 'x');
  US.ctx = { project: { name, path: prproj } };
  US.settings.set('story.exportDir', path.join(dir, 'out'));
  E.reset(); D.reset();
  S.loadState();
  const st = S.state();
  st.transcripts = lines ? [{ key: 'savta', name: 'Savta.mp4', path: media, itemId: 'i1', source: 'premiere', language: 'he-IL', lines }] : [];
  st.glossary = []; st.english = null;
  S.reindex(); S.save();
  return { dir, media, st };
}
const LOCAL = (id = 'tiny@1') => ({ on: true, where: 'local', kind: 'helper', id, label: 'Tiny Listener', langs: {}, chunkSec: 30, model: { id: 'tiny', name: 'Tiny Listener', version: '1' } });
/** Stand-ins for Listen to delivery's routes: the sound, a model on this computer (one span at a time, then text), its hearing check. */
function routes({ sound = SOUND, hear = null } = {}) {
  const keep = Object.assign({}, D.routes), calls = { hear: [], tr: [], other: [], sound: 0 };
  D.routes.sound = async () => { calls.sound++; const data = sound(); return { data, sr, duration: data.length / sr, how: 'ffmpeg' }; };
  D.routes.hearing = async () => ({ ok: true, at: 1, label: 'stand-in', detail: '' });
  D.routes.listen = async (Pl, req) => {
    if (req.schema === P.HEAR_SCHEMA) { const k = calls.hear.length; calls.hear.push(req); if (hear) return hear(req, k); return HEB[k % 5] ? { speech: true, text: HEB[k % 5], language: 'Hebrew' } : { speech: false, text: '', language: '' }; }
    if (req.schema === P.TR_SCHEMA) { calls.tr.push(req); const rows = req.user.split('(number<TAB>what was said):\n')[1].split('\n').map(r => r.split('\t')); return { spans: rows.map(([n, text]) => ({ n: +n, english: ENG[HEB.indexOf(text)] || 'English of ' + n })).concat([{ n: 99, english: 'made up' }]) }; }
    calls.other.push(req); return {};
  };
  return { calls, restore() { Object.assign(D.routes, keep); } };
}
const done = () => { US.ai.media = MEDIA0; US.ai.setDelivery(false); US.ai.setProjectOffline(false); US.secrets.set('geminiKey', ''); US.settings.set('delivery.hearing', {}); US.settings.set('story.exportDir', ''); US.ctx = CTX0; E.reset(); D.reset(); };

test('spans: where someone speaks, measured on this computer – phrases between pauses, short neighbours joined, a long one split at its quietest moment; numbered; nothing for silence', () => {
  const s = P.spans(SOUND(), sr);
  assert.deepStrictEqual(s.map(x => x.n), [1, 2, 3, 4, 5]);
  [[1, 4.2], [5, 8], [12, 14.2], [20, 26], [40, 44]].forEach(([a, b], i) => assert.ok(near(s[i].start, a) && near(s[i].end, b), `span ${i + 1}: ${s[i].start}–${s[i].end}, wanted ${a}–${b}`));
  assert.ok(s.every(x => x.end - x.start <= 8.01 && x.end - x.start >= 0.3), 'each short enough to read as a subtitle');
  // fourteen seconds without a pause, with a dip in the middle: two spans, cut at the dip
  const long = P.spans(burst(30, [[5, 19]], [[11.9, 12.1]]), sr);
  assert.ok(long.length === 2 && near(long[0].start, 5) && near(long[0].end, 12, 0.15) && long[1].start === long[0].end && near(long[1].end, 19), JSON.stringify(long));
  // thirty seconds with no dip at all still comes out in spans of at most eight
  const flat = P.spans(burst(40, [[2, 32]]), sr);
  assert.ok(flat.length >= 4 && flat.every(x => x.end - x.start <= 8.01) && near(flat[0].start, 2) && near(flat[flat.length - 1].end, 32) && flat.every((x, i) => !i || x.start === flat[i - 1].end), JSON.stringify(flat));
  assert.deepStrictEqual(P.spans(new Float32Array(sr * 20), sr), [], 'a recording of nothing');
  assert.deepStrictEqual(P.spans(burst(20, [[0, 20]], []).map(v => v * 0.003), sr), [], 'only a faint hiss');
  assert.deepStrictEqual(P.spans(new Float32Array(0), sr), []);
});

test('pieces: whole spans only – thirty seconds on this computer, up to two minutes in the cloud; a piece is never cut inside a span', () => {
  const s = P.spans(SOUND(), sr);
  const local = P.pieces(s, { chunk: 30 }), cloud = P.pieces(s, { chunk: 120 });
  assert.deepStrictEqual([local.map(p => p.spans.map(x => x.n).join('')), cloud.map(p => p.spans.map(x => x.n).join(''))], [['1234', '5'], ['12345']]);
  for (const p of local.concat(cloud)) { assert.ok(p.end - p.start <= (p.spans.length > 4 ? 120 : 30) + 0.01); assert.ok(p.spans.every(x => x.start >= p.start && x.end <= p.end), 'every span whole inside its piece'); }
  const many = Array.from({ length: 40 }, (_, i) => ({ n: i + 1, start: i * 7, end: i * 7 + 6.5 }));
  const ps = P.pieces(many, { chunk: 30 });
  assert.deepStrictEqual(ps.flatMap(p => p.spans.map(x => x.n)), many.map(x => x.n), 'each span once, in order');
  assert.ok(ps.every(p => p.end - p.start <= 30.01 && p.spans.every(x => x.start >= p.start && x.end <= p.end)));
  assert.deepStrictEqual(P.pieces([]), []);
});

test('what is asked: the cloud gets the piece with its numbered spans and gives no times; this computer gets one span and no words at all, then translates its own words as text', () => {
  const piece = { start: 0.75, end: 14.45, spans: [{ n: 1, start: 1, end: 4.2 }, { n: 2, start: 5, end: 8 }] };
  const c = P.cloudRequest({ n: 3, name: 'Savta final.mp4' }, piece, 'QUJD', 3, 'Hebrew', { terms: ['Stamford Hill'] });
  assert.ok(c.user[0].includes('\n1\t0.25–3.45\n2\t4.25–7.25\nThe sound:') && /^A piece of interview 3, 14 seconds long \(it starts 0:00 into the interview\)\. The speaker is most likely speaking Hebrew\. Names the editor has spelt for this project: Stamford Hill\./.test(c.user[0]), c.user[0]);
  assert.ok(/give no times: the times are fixed/.test(c.system) && /NEVER INVENT/.test(c.system) && /"heard": "no" and leave "original" and "english" empty/.test(c.system) && /in its own script/.test(c.system) && /"confidence": "unsure"/.test(c.system));
  assert.ok(c.user[1].media.kind === 'audio' && c.feature === 'Translating by listening' && !/Savta final/.test(c.system + c.user[0]), 'the file’s name isn’t sent');
  assert.ok(/Work out which language is spoken/.test(P.cloudRequest({ n: 1 }, piece, 'QUJD', 3, '').user[0]));
  const hr = P.hearRequest({ name: 'Savta.mp4' }, piece.spans[0], 'QUJD', 3, 'Yiddish');
  assert.ok(hr.user.length === 2 && hr.user[0] === 'The recording:' && hr.user[1].media.seconds === 3.2 && /most likely speaking Yiddish/.test(hr.system) && /not translated/.test(hr.system) && /"speech": false/.test(hr.system));
  const tr = P.translateRequest([{ n: 1, text: HEB[0] }, { n: 2, text: HEB[1] }], 'Hebrew', { terms: ['Ruth'] });
  assert.ok(typeof tr.user === 'string' && tr.user.endsWith(`1\t${HEB[0]}\n2\t${HEB[1]}`) && /Names \(spell them like this\): Ruth/.test(tr.user) && /never invent/.test(tr.system), 'text only – no sound in the second step');
  // the cloud's answer: only the spans it was given; “couldn't hear” – and English with no words under it – is nothing
  const t = P.tidyCloud({ spans: [{ n: 2, heard: 'yes', original: HEB[1], language: 'Hebrew', english: ENG[1], confidence: 'sure', start: 99 }, { n: 1, heard: 'no', original: 'made up', language: 'Hebrew', english: 'made up', confidence: 'sure' }, { n: 7, heard: 'yes', original: 'x', language: 'y', english: 'z', confidence: 'sure' }, { n: 2, heard: 'yes', original: 'again', language: 'x', english: 'again', confidence: 'sure' }] }, piece);
  assert.deepStrictEqual(t, [{ n: 1, start: 1, end: 4.2, text: '', lang: '', en: '', conf: 'sure', unheard: 'model' }, { n: 2, start: 5, end: 8, text: HEB[1], lang: 'Hebrew', en: ENG[1], conf: 'sure' }], 'this computer’s times, whatever the model says');
  assert.deepStrictEqual(P.tidyCloud({ spans: [{ n: 1, heard: 'yes', original: '', language: 'Hebrew', english: 'Something invented.', confidence: 'sure' }] }, piece).map(x => [x.text, x.en, x.unheard]), [['', '', 'model'], ['', '', 'model']], 'English with no original under it is dropped; a span left out is “couldn’t hear”');
  assert.deepStrictEqual(P.tidyCloud(null, piece).map(x => x.unheard), ['model', 'model']);
  assert.deepStrictEqual(P.spanOf({ n: 1, start: 0, end: 1 }, 'We always managed.', 'English', '', 'sure').en, 'We always managed.', 'a span already in English is its own English');
});

test('a clip with no transcript, on this computer: Story gets a transcript made by listening – this computer’s times, the words heard – with its English; the transcript document and the subtitles work from it; it carries on where it stopped', async () => {
  const pr = project();
  const R = routes();
  try {
    assert.strictEqual(D.settings().on, false, 'Listen to delivery is off – translating by listening is its own action');
    const iv = LI.target(pr.media);
    assert.deepStrictEqual([iv.key, iv.name, iv.lines.length, iv.t], [pr.media, 'Savta.mp4', 0, null]);
    // stopped after the first piece: what was heard is kept
    let k = 0;
    const part = await LI.listen(job, iv, { lang: 'Hebrew', plan: LOCAL(), keepGoing: () => k++ < 1 });
    assert.deepStrictEqual([part.more, part.rec.next, part.rec.total, part.rec.done, R.calls.hear.length, R.calls.tr.length], [true, 1, 2, false, 4, 1]);
    assert.ok(R.calls.hear.every(q => q.user.length === 2 && q.user[1].media.seconds <= 8.01) && /most likely speaking Hebrew/.test(R.calls.hear[0].system), 'one span of sound at a time, and nothing else');
    assert.ok(R.calls.tr[0].user.endsWith(`1\t${HEB[0]}\n2\t${HEB[1]}\n3\t${HEB[2]}\n4\t${HEB[3]}`), 'then the words it wrote down, as text');
    assert.strictEqual(S.state().transcripts.length, 0, 'nothing goes into Story until the interview is done');
    // again: from the second piece – the first isn't heard again
    const rest = await LI.listen(job, LI.target(pr.media), { lang: 'Hebrew', plan: LOCAL() });
    assert.deepStrictEqual([rest.rec.done, rest.rec.next, R.calls.hear.length, R.calls.tr.length, R.calls.sound], [true, 2, 5, 1, 2], 'the last span has nobody speaking: nothing to translate');
    const rec = LI.peek(pr.media);
    assert.deepStrictEqual(rec.spans.map(s => [s.n, s.text, s.en, s.unheard]), [[1, HEB[0], ENG[0], undefined], [2, HEB[1], ENG[1], undefined], [3, HEB[2], ENG[2], undefined], [4, HEB[3], ENG[3], undefined], [5, '', '', 'model']]);
    assert.ok(rec.spans.every((s, i) => s.start === rec.grid[i].start && s.end === rec.grid[i].end) && near(rec.spans[0].start, 1) && near(rec.spans[3].end, 26), 'the times are the spans’ own');
    assert.deepStrictEqual([rec.by, rec.asked, rec.lang, rec.where, rec.heard], ['tiny@1', 'Hebrew', 'Hebrew', 'local', 4]);
    // done: nothing is asked again; another model or another language: again
    await LI.listen(job, LI.target(pr.media), { lang: 'Hebrew', plan: LOCAL() });
    assert.strictEqual(R.calls.hear.length, 5);
    await LI.listen(job, LI.target(pr.media), { lang: 'Yiddish', plan: LOCAL(), keepGoing: () => false });
    assert.strictEqual(LI.peek(pr.media).done, true, 'stopped before anything was heard: the record that was there stays');
    // into Story
    const ap = LI.apply(LI.target(pr.media), rec);
    assert.deepStrictEqual([ap.made, ap.lines, ap.lang], [true, 3, 'Hebrew']);
    const t = S.state().transcripts[0];
    assert.deepStrictEqual([t.source, t.language, t.path, t.listened.by, t.listened.ai, t.lines.length], ['listened', 'Hebrew', pr.media, 'Tiny Listener', true, 3]);
    const sp = rec.spans;
    assert.deepStrictEqual(t.lines.map(l => [l.start, l.end, l.text]), [[sp[0].start, sp[1].end, `${HEB[0]} ${HEB[1]}`], [sp[2].start, sp[2].end, HEB[2]], [sp[3].start, sp[3].end, HEB[3]]], 'original-language lines at this computer’s times (Story joins two spans under a second apart into one line, as it does for any transcript); the span nobody spoke in makes no line');
    assert.deepStrictEqual(t.lines.map(l => E.enOf(l)), [`${ENG[0]} ${ENG[1]}`, ENG[2], ENG[3]]);
    const st = E.statuses()[0];
    assert.deepStrictEqual([st.lang, st.need, st.done, st.by, st.source, st.listened], ['Hebrew', 3, 3, 'Tiny Listener, by listening', 'listening', true]);
    assert.strictEqual(LI.unusable(t, 'Hebrew'), '', 'and it is a transcript like any other');
    // everything downstream works from it
    const txt = fs.readFileSync((await E.exportTranscript(job, { key: t.key, format: 'txt', bilingual: true })).file, 'utf8');
    assert.ok(txt.includes(ENG[0]) && txt.includes(HEB[0]) && /AI TRANSLATION – CHECK BEFORE PUBLISHING/.test(txt), txt.slice(0, 200));
    const srt = fs.readFileSync((await E.exportSubtitles(job, { key: t.key, format: 'srt' })).file, 'utf8');
    assert.ok(new RegExp(`^1\\n00:00:0[01],\\d{3} --> 00:00:0[3-6],\\d{3}\\n`).test(srt) && srt.includes('Every Friday the table was full.') && !/[֐-׿]/.test(srt), srt.slice(0, 120));
    assert.deepStrictEqual(S.search('Friday table').map(r => r.line.id), [t.lines[0].id], 'Find finds the Hebrew line by its English');
    assert.ok(US.storyContext.row(t.lines[1]).endsWith(`[English: ${ENG[2]}]`));
    // kept beside the project with the translations
    E.flush();
    const kept = JSON.parse(fs.readFileSync(path.join(pr.dir, 'JMG Ultra Studio', 'Listen film – English.json'), 'utf8'));
    assert.ok(kept.listened[pr.media].spans.length === 5 && kept.interviews[t.key].source === 'listening');
    const saved = LI.forget(pr.media); assert.strictEqual(LI.peek(pr.media), null); LI.unforget(saved); assert.strictEqual(LI.peek(pr.media).done, true);
  } finally { R.restore(); done(); }
});

test('a transcript the speech-to-text got wrong is replaced; a usable one is kept, with what was heard beside each line', async () => {
  // Hebrew, says the editor's app – but written down as English nonsense
  const junk = [{ id: 'j1', start: 1, end: 8, speaker: 'Speaker 1', text: 'Shimmy root van he got ality bedera ketana' }, { id: 'j2', start: 12, end: 26, speaker: 'Speaker 1', text: 'Call yom she she ha shool khan' }];
  let pr = project('Junk film', junk), R = routes();
  try {
    const s0 = E.statuses()[0];
    assert.deepStrictEqual([s0.lang, LI.unusable(pr.st.transcripts[0], s0.lang)], ['Hebrew', 'script'], 'it should be Hebrew and isn’t written in Hebrew letters');
    assert.deepStrictEqual(LI.waiting(), ['savta'], 'Overnight prep would do it');
    const r = await LI.run(job, { keys: ['savta'], plan: LOCAL() });
    assert.deepStrictEqual([r.done, r.made, r.lines, r.unheard], [1, 1, 3, 1]);
    assert.ok(/1 interview translated by listening with Tiny Listener/.test(r.summary) || /by listening with/.test(r.summary), r.summary);
    assert.ok(/1 transcript made by listening · 1 stretch couldn’t be heard – left empty/.test(r.summary) && /Made by listening – AI transcription and translation, check before publishing$/.test(r.summary), r.summary);
    const t = S.state().transcripts[0];
    assert.deepStrictEqual([S.state().transcripts.length, t.path, t.source, t.lines.map(l => l.text)], [1, pr.media, 'listened', [`${HEB[0]} ${HEB[1]}`, HEB[2], HEB[3]]], 'the same interview, now with the words that were said');
    assert.deepStrictEqual(LI.waiting(), []);
    R.restore(); done();
    // a transcript that IS Hebrew: kept as it is
    const good = [{ id: 'g1', start: 0.8, end: 8.2, speaker: 'Ruth', text: 'שמי רות וגדלתי בדירה קטנה. כל יום שישי השולחן מלא' }, { id: 'g2', start: 11.5, end: 27, speaker: 'Ruth', text: 'בעזרת השם אבא תמיד אמר שבית חם' }, { id: 'g3', start: 50, end: 55, speaker: 'Ruth', text: 'זה הכל' }];
    pr = project('Good film', good); R = routes();
    assert.strictEqual(LI.unusable(pr.st.transcripts[0], 'Hebrew'), '');
    assert.deepStrictEqual(LI.waiting(), [], 'not for Overnight prep: its transcript can be translated as text');
    const before = JSON.stringify(pr.st.transcripts[0].lines);
    const r2 = await LI.run(job, { keys: ['savta'], plan: LOCAL() });
    assert.deepStrictEqual([r2.made, r2.lines, JSON.stringify(S.state().transcripts[0].lines) === before, S.state().transcripts[0].source], [0, 2, true, 'premiere'], 'the editor’s transcript is untouched');
    assert.deepStrictEqual([E.enOf('g1'), E.origOf('g1')], [`${ENG[0]} ${ENG[1]}`, `${HEB[0]} ${HEB[1]}`], 'two spans heard inside the first line: their English and their words, in order');
    assert.deepStrictEqual([E.enOf('g2'), E.origOf('g2'), E.enOf('g3')], [`${ENG[2]} ${ENG[3]}`, `${HEB[2]} ${HEB[3]}`, ''], 'a line nothing was heard in has no English yet');
    const d = E.documentOf(S.state().transcripts[0], { bilingual: true });
    assert.deepStrictEqual([d.rows[0].orig, d.rows[0].en, d.rows[2].orig], [`${HEB[0]} ${HEB[1]}`, `${ENG[0]} ${ENG[1]}`, 'זה הכל'], 'the bilingual document shows what was heard beside the English');
    // pure: each span goes to the line it mostly lies in; one that lies in no line is left out
    assert.deepStrictEqual(P.assign([{ id: 'a', start: 0, end: 5 }, { id: 'b', start: 5, end: 10 }], [{ start: 1, end: 4, text: 'x', en: 'X' }, { start: 4.5, end: 9, text: 'y', en: 'Y' }, { start: 20, end: 22, text: 'z', en: 'Z' }, { start: 6, end: 7, text: '', en: '' }]), { a: { en: 'X', orig: 'x' }, b: { en: 'Y', orig: 'y' } });
    assert.deepStrictEqual([LI.unusable({ lines: [] }, 'Hebrew'), LI.unusable({ lines: [{ text: '[music]' }] }, 'Hebrew'), LI.unusable({ lines: [{ text: 'Hello there' }] }, 'English'), LI.unusable({ lines: [{ text: 'Bonjour' }] }, 'French')], ['none', 'none', '', ''], 'Latin-letter languages can’t be told apart this way');
  } finally { R.restore(); done(); }
});

test('the cloud: only with Listen to delivery’s own yes for the project, asked every time; never for a project kept on this computer; through US.ai.media as a delivery request; inside a limit', async () => {
  const pr = project('Cloud film');
  const sent = [], keepSound = D.routes.sound, toasts = [], keepToast = US.ui.toast, keepModal = US.ui.modal;
  let asked = 0, answer = false;
  US.ui.toast = t => toasts.push(t);
  US.ui.modal = async m => { asked++; US.ui.modal.last = m; return answer; };
  D.routes.sound = async () => { const data = SOUND(); return { data, sr, duration: 60, how: 'ffmpeg' }; };
  US.ai.media = async req => { sent.push(req); if (req.onUsage) req.onUsage({ usd: 0, paidUsd: 0.01 }); const ns = Array.from(req.user[0].matchAll(/^(\d+)\t[\d.]+–[\d.]+$/gm)).map(m => +m[1]); return { spans: ns.map(n => (HEB[n - 1] ? { n, heard: 'yes', original: HEB[n - 1], language: 'Hebrew', english: ENG[n - 1], confidence: 'sure' } : { n, heard: 'no', original: '', language: '', english: '', confidence: 'sure' })) }; };
  try {
    US.secrets.set('geminiKey', 'g-test');
    D.setWhere('cloud');
    assert.deepStrictEqual([D.settings().on, LI.plan().kind, LI.plan().why], [false, 'none', 'consent'], 'Cloud chosen is not the yes');
    // straight to the engine without the yes: refused, nothing read or sent
    await assert.rejects(() => LI.listen(job, LI.target(pr.media), { lang: 'Hebrew' }), e => /isn’t switched on for this project on this computer/.test(e.title));
    await assert.rejects(() => LI.run(job, { keys: [pr.media], confirmed: true }), e => /isn’t switched on for this project/.test(e.title));
    // the real US.ai.media refuses too (the check is inside it)
    await assert.rejects(() => MEDIA0({ purpose: 'delivery', use: 'gemini:gemini-3.8-flash', system: 's', user: ['x', { media: { kind: 'audio', data: 'AAAA', mime: 'audio/wav', seconds: 1 } }] }), e => /Listening to delivery in the cloud isn’t switched on/.test(e.title));
    // asked, and “no”: nothing sent, no yes kept
    answer = false;
    await assert.rejects(() => LI.run(job, { keys: [pr.media], lang: 'Hebrew' }), e => e.code === 'CANCELLED');
    assert.deepStrictEqual([asked, sent.length, US.ai.deliveryOn()], [1, 0, false]);
    const m = US.ui.modal.last, body = JSON.stringify(m.title) + (m.body && m.body.textContent ? m.body.textContent : '');
    assert.ok(/Let Gemini 3\.8 Flash listen to “Savta\.mp4”, to translate it\?/.test(m.title) && m.buttons.length === 2 && /Don’t send/.test(m.buttons[0].label), body);
    // “yes”: the same consent as Listen to delivery – and the sound goes through US.ai.media as a delivery request
    answer = true;
    const r = await LI.run(job, { keys: [pr.media], lang: 'Hebrew' });
    assert.deepStrictEqual([asked, US.ai.deliveryOn(), sent.length, r.done, r.made, r.lines], [2, true, 1, 1, 1, 3], 'two minutes at a time: one request for this minute of sound');
    assert.ok(sent[0].purpose === 'delivery' && sent[0].use === 'gemini:gemini-3.8-flash' && sent[0].user[1].media.kind === 'audio' && /^1\t/m.test(sent[0].user[0]) && !/[֐-׿]/.test(sent[0].user[0]), 'the sound and the span numbers – no transcript');
    assert.ok(/Google’s paid rate/.test(r.summary) && LI.peek(pr.media).where === 'cloud' && S.state().transcripts[0].lines.length === 3, r.summary);
    assert.strictEqual(D.settings().on, false, 'and Listen to delivery itself is still off');
    // asked again the next time, even with the yes already given
    await LI.run(job, { keys: [pr.media], lang: 'Hebrew' });
    assert.deepStrictEqual([asked, sent.length], [3, 1], 'asked each time; already done, so nothing is sent');
    // a limit (Overnight prep): a piece that wouldn't fit isn't sent
    const lim = await LI.run(job, { keys: [pr.media], lang: 'Yiddish', confirmed: true, force: true, limitUsd: 0.0001 });
    assert.deepStrictEqual([lim.stopped, lim.done, sent.length], ['limit', 0, 1]);
    assert.ok(/stopped at the limit/.test(lim.summary));
    // a project set to “nothing leaves this computer”: refused, yes or no
    US.ai.setProjectOffline(true);
    assert.deepStrictEqual([LI.plan().kind, LI.plan().why], ['none', 'offline']);
    const n = asked;
    await assert.rejects(() => LI.run(job, { keys: [pr.media], lang: 'Arabic' }), e => e.code === 'CANCELLED');
    assert.ok(asked === n && /nothing leaves this computer/.test(toasts[toasts.length - 1].title), 'not even asked');
    await assert.rejects(() => LI.run(job, { keys: [pr.media], lang: 'Arabic', confirmed: true }), e => /nothing leaves this computer/.test(e.title));
    assert.strictEqual(sent.length, 1);
    // the estimate says what it is
    US.ai.setProjectOffline(false);
    const e = LI.estimate([{ seconds: 3600 }]);
    assert.ok(e.known && e.cloud.usd[1] > 0.1 && /1h 00m of sound|60 min|1:00:00/.test(LI.estimateText(e)) === /of sound/.test(LI.estimateText(e)) && /at most .* at Google’s paid rate/.test(LI.estimateText(e)) && /is an assumption/.test(LI.estimateText(e)), LI.estimateText(e));
    assert.ok(/a length that isn’t known until the sound is read/.test(LI.estimateText(LI.estimate([{ seconds: 0 }]))));
    D.setWhere('local');
    assert.ok(/an assumption, it hasn’t been measured here/.test(LI.estimateText(LI.estimate([{ seconds: 600 }]))) && /Cost: nothing/.test(LI.estimateText(LI.estimate([{ seconds: 600 }]))));
  } finally { US.ui.toast = keepToast; US.ui.modal = keepModal; D.routes.sound = keepSound; D.setWhere('local'); done(); }
});

test('on this computer: no listening model, or one that failed its hearing check, is said plainly and nothing is heard; sound that can’t be read is said', async () => {
  const pr = project('No model film');
  const R = routes();
  try {
    assert.deepStrictEqual([LI.plan().kind, LI.plan().why], ['none', 'model']);
    await assert.rejects(() => LI.run(job, { keys: [pr.media] }), e => /no listening model on this computer yet/.test(e.title) && /Listening models for Story/.test(e.action));
    D.routes.hearing = async () => ({ ok: false, at: 1, label: 'Tiny Listener', detail: 'a silent clip: 5/5 clear' });
    await assert.rejects(() => LI.listen(job, LI.target(pr.media), { plan: LOCAL('deaf@1') }), e => /doesn’t seem to listen/.test(e.title));
    assert.deepStrictEqual([R.calls.hear.length, R.calls.sound, LI.peek(pr.media)], [0, 0, null]);
    D.routes.hearing = async () => ({ ok: true });
    D.routes.sound = async () => { const e = new Error('no'); e.code = 'NOT_FROM_FILES'; throw e; };
    await assert.rejects(() => LI.listen(job, LI.target(pr.media), { plan: LOCAL('ok@1') }), e => /The sound of “Savta\.mp4” couldn’t be read/.test(e.title));
    // nobody speaks anywhere: no spans, nothing asked, nothing made
    D.routes.sound = async () => ({ data: new Float32Array(sr * 20), sr, duration: 20, how: 'ffmpeg' });
    const none = await LI.listen(job, LI.target(pr.media), { plan: LOCAL('ok@1') });
    assert.deepStrictEqual([none.rec.done, none.rec.grid, R.calls.hear.length, LI.apply(LI.target(pr.media), none.rec).lines, S.state().transcripts.length], [true, [], 0, 0, 0]);
  } finally { R.restore(); done(); }
});

test('where it shows: on the interview’s row and under the list, in Ask, in Overnight prep, and the Settings section reads as the listening models for Story', () => {
  const p = US.actions.get('story.translate').params;
  assert.ok(p.listen && p.listen.type === 'boolean' && /SOUND/.test(p.listen.desc));
  const english = fs.readFileSync(path.join(ROOT, 'js', 'tools', '22-story-english.js'), 'utf8');
  assert.ok(/LI\.rowControls\(s, \{ render \}\)/.test(english) && /LI\.cardExtras\(\{ render \}\)/.test(english) && /LI\.run\(job, \{ keys \}\)/.test(english));
  const overnight = fs.readFileSync(path.join(ROOT, 'js', 'tools', '01-overnight.js'), 'utf8');
  assert.ok(/id: 'englishListen'/.test(overnight) && /confirmed: true, limitUsd/.test(overnight) && /storyListen\.confirmCloud\(/.test(overnight));
  assert.ok(!US.overnight.settings().steps.includes('englishListen'), 'not ticked until chosen');
  assert.ok(US.settingsSections.list().some(s => s.id === 'delivery' && s.title === 'Listening models for Story'));
  assert.ok(/AI transcription and translation/.test(LI.MARK) && /check before publishing/.test(LI.MARK));
  assert.ok(/'Made by listening – AI'/.test(fs.readFileSync(path.join(ROOT, 'js', 'tools', '22-story.js'), 'utf8')));
});

test('what a model makes up when it hears no words is taken out: its own prompt read back, and the same sentence “heard” in several places (seen with Gemma 4 E2B on speech-like noise)', async () => {
  const sp = (n, text, en = 'x') => ({ n, start: n * 10, end: n * 10 + 5, text, lang: 'Hebrew', en, conf: 'fairly sure' });
  const same = 'שלום לכולם, אני רוצה להגיד לכם שזה היה יום נפלא.';
  const out = P.scrub([sp(1, 'The recording:'), sp(2, HEB[0]), sp(3, same), sp(4, ''), sp(5, same.replace('.', '')), sp(6, 'שלום'), sp(7, 'שלום'), sp(8, HEB[1])]);
  assert.deepStrictEqual(out.map(s => [s.n, !!s.text, s.unheard]), [[1, false, 'made-up'], [2, true, undefined], [3, false, 'made-up'], [4, false, undefined], [5, false, 'made-up'], [6, true, undefined], [7, true, undefined], [8, true, undefined]], 'a short word said twice is just a word said twice');
  assert.ok(out.filter(s => s.unheard).every(s => s.en === '' && s.start === s.n * 10), 'no English for them either; the times stay');
  // through a whole listen: the made-up sentence never reaches Story
  const pr = project('Made-up film');
  const R = routes({ hear: (req, k) => (k === 1 || k === 3 ? { speech: true, text: same, language: 'Hebrew' } : k === 0 ? { speech: true, text: HEB[0], language: 'Hebrew' } : { speech: true, text: 'The recording:', language: 'en' }) });
  try {
    const r = await LI.listen(job, LI.target(pr.media), { lang: 'Hebrew', plan: LOCAL() });
    assert.deepStrictEqual(r.rec.spans.map(s => [s.n, s.text, s.unheard]), [[1, HEB[0], undefined], [2, '', 'made-up'], [3, '', 'made-up'], [4, '', 'made-up'], [5, '', 'made-up']]);
    assert.deepStrictEqual([LI.apply(LI.target(pr.media), r.rec).lines, S.state().transcripts[0].lines.map(l => l.text)], [1, [HEB[0]]]);
  } finally { R.restore(); done(); }
});
