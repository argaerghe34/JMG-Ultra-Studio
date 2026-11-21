// Story › Listen to delivery (US.delivery, US.storyDelivery, US.ai.media with purpose 'delivery'): off until switched
// on and then nothing is sent; the cloud refused without this project's own yes and always for a project kept on this
// computer; the sound in pieces that keep the transcript's lines and times; a model's answer tidied; records that carry
// on where they stopped and are made again when the model, the languages or the transcript change; the note on each
// line Story sends to its AI (and none when off); the languages in the prompt; honest estimates; the background only on
// this computer and only when calm; Overnight prep inside its limit; heard words offered to Names and terms, never
// added by themselves; Pro View's column, sort and filter. Stand-in models throughout: no model, no network, no cost.
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path'), cp = require('child_process');
const { load, test, ROOT } = require('./harness');
global.addEventListener = global.addEventListener || (() => {});
global.ResizeObserver = global.ResizeObserver || function () { return { observe() {} }; };
const US = load(['time', 'audio', 'dsp', 'vision', 'transcript', 'ai', 'understand-models', 'understand', 'delivery', 'ui', 'app',
  'js/tools/14-footage.js', 'js/tools/01-overnight.js', 'js/tools/22-story-board.js', 'js/tools/22-story-export.js', 'js/tools/22-story-timeline.js', 'js/tools/22-story-narrative.js', 'js/tools/22-story-moments.js', 'js/tools/22-story-ai.js',
  'js/tools/22-story-ask.js', 'js/tools/22-story-context.js', 'js/tools/22-story-glossary.js', 'js/tools/22-story-questions.js', 'js/tools/22-story-lines.js', 'js/tools/22-story.js', 'js/tools/22-story-delivery.js']);
const D = US.delivery, P = D._pure, S = US.story, T = US.transcript, C = US.storyContext, M = US.models;
const job = { set() { return job; }, progress() { return job; }, busy() { return job; }, range() { return job; }, check() {}, log() {} };
const CTX0 = US.ctx;
const HEB = 'בעזרת השם';

/** A project of its own (a folder with a project file), with two interviews Story knows: ids, times, speakers, words. */
function project(name = 'Delivery film') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'us-dlv-')), prproj = path.join(dir, name + '.prproj');
  fs.writeFileSync(prproj, 'x');
  const media = n => { const p = path.join(dir, n); fs.writeFileSync(p, 'x' + Math.random()); return p; };
  US.ctx = { project: { name, path: prproj } };
  D.reset();
  S.loadState();
  const st = S.state();
  st.transcripts = [
    { key: 'ruth', name: 'Ruth.mp4', path: media('Ruth.mp4'), itemId: 'i1', source: 'file', lines: [
      { id: 'r1', start: 1, end: 5, speaker: 'Ruth', text: 'We opened the bakery in nineteen sixty.' },
      { id: 'r2', start: 6, end: 11, speaker: 'Ruth', text: 'And I said bizarre a sham we will manage.' },
      { id: 'r3', start: 12, end: 20, speaker: 'Ruth', text: 'My mother, um, she, she never, she never stopped working.' },
      { id: 'r4', start: 40, end: 49, speaker: 'Ruth', text: 'Oh sure, the landlord was a real sweetheart.' },
      { id: 'r5', start: 70, end: 78, speaker: 'Interviewer', text: 'And what happened then?' }] },
    { key: 'sam', name: 'Sam.mp4', path: media('Sam.mp4'), itemId: 'i2', source: 'file', lines: [
      { id: 's1', start: 0.5, end: 6, speaker: 'Sam', text: 'We always managed, one way or another.' },
      { id: 's2', start: 7, end: 12, speaker: 'Sam', text: 'She used to sing while she kneaded.' }] }
  ];
  st.glossary = [];
  S.reindex(); S.save();
  return { dir, prproj, st };
}
/** What a listening model would answer for a piece: every line scored; r2's Hebrew corrected; r4's sarcasm; something missed after r2. */
const answerFor = req => {
  const ids = Array.from(req.user[0].matchAll(/^(\S+)\t[\d.]+–[\d.]+\t/gm)).map(m => m[1]);
  const one = { r1: { score: 4, notes: ['Confident', 'warm.'] }, r2: { score: 5, notes: ['warm', 'laughing'], heard: [{ said: HEB, transliteration: 'b’ezrat Hashem', language: 'Hebrew', meaning: 'with God’s help', transcriptHad: 'bizarre a sham', kind: 'religious', confidence: 'sure' }] },
    r3: { score: 2, notes: ['hesitant', 'stumbles', 'false start'], cleanStart: false }, r4: { score: 4, notes: ['dry'], heard: [{ said: 'a real sweetheart', transliteration: '', language: 'English', meaning: 'she means the opposite', transcriptHad: 'a real sweetheart', kind: 'sarcasm', confidence: 'fairly sure' }] },
    r5: { score: 3, notes: [] }, s1: { score: 3, notes: ['flat'], cleanEnd: false }, s2: { score: 9, notes: ['warm'], heard: [{ said: '', transliteration: '', language: '', meaning: '', transcriptHad: '', kind: 'x', confidence: 'sure' }] } };
  return { lines: ids.map(id => Object.assign({ id, audible: 'yes', energy: 'medium', cleanStart: true, cleanEnd: true, confidence: 'sure', heard: [] }, one[id])).concat([{ id: 'made-up', audible: 'yes', score: 5, notes: [], energy: 'high', cleanStart: true, cleanEnd: true, confidence: 'sure', heard: [] }]),
    missed: ids.includes('r2') ? [{ afterLine: 'r2', said: 'נו', transliteration: 'nu', language: 'Yiddish', meaning: 'well then', confidence: 'fairly sure' }] : [] };
};
/** Stand-ins for the routes: the sound (silence, long enough) and the model. */
const TALK = () => { const d = new Float32Array(16000 * 80); for (let i = 0; i < d.length; i++) d[i] = Math.sin(i * 0.3) * 0.2; return d; };   // sound all the way through (not silence)
const EVERYTHING = 'We opened the bakery in nineteen sixty. And I said bizarre a sham we will manage. My mother, um, she, she never, she never stopped working. Oh sure, the landlord was a real sweetheart. And what happened then? We always managed, one way or another. She used to sing while she kneaded. נו ' + HEB;
function fakeRoutes({ listen = null, sound = null, hear = null, hearing = null } = {}) {
  const keep = Object.assign({}, D.routes), calls = { listen: [], hear: [], sound: 0, plans: [], hearing: 0 };
  D.routes.sound = async iv => { calls.sound++; if (sound === 'fail') { const e = new Error('no'); e.code = 'NOT_FROM_FILES'; throw e; } const sr = 16000, data = sound || TALK(); return { data, sr, duration: data.length / sr, how: 'ffmpeg' }; };
  // a model on this computer is first asked only what is said (no transcript): here it hears every line, unless told otherwise
  D.routes.listen = async (Pl, req, o) => { if (req.schema === P.HEAR_SCHEMA) { calls.hear.push(req); return hear ? hear(req) : { speech: true, text: EVERYTHING }; } calls.listen.push(req); calls.plans.push(Pl); return listen ? listen(req, Pl, o) : answerFor(req); };
  if (hearing !== 'real') D.routes.hearing = async () => { calls.hearing++; return hearing || { ok: true, at: 1, label: 'stand-in', detail: '' }; };
  return { calls, restore() { Object.assign(D.routes, keep); } };
}
const LOCAL = (id = 'gemma-test@1', label = 'Test listener') => ({ on: true, where: 'local', kind: 'helper', id, label, langs: P.langsOf(null), chunkSec: 30, model: { id: 'gemma-test', name: label, version: '1' } });
/** A listening model on this computer, as if downloaded (the catalogue checks out; the files are a few bytes). */
function tinyListener(id = 'tiny-listen', name = 'Tiny Listener') {
  const crypto = require('crypto');
  const f = (n, body) => ({ role: /mmproj/.test(n) ? 'mmproj' : 'model', name: n, url: 'https://huggingface.co/x/y/resolve/main/' + n, bytes: Buffer.byteLength(body), sha256: crypto.createHash('sha256').update(body).digest('hex'), body });
  const files = [f(id + '.gguf', 'model-bytes'), f('mmproj-' + id + '.gguf', 'proj')];
  const man = { version: 5, runtime: { id: 'llama-server', version: 't1', builds: { [M.platformKey()]: { name: 'h.tar.gz', url: 'https://github.com/x/h.tar.gz', bytes: 3, sha256: 'a'.repeat(64), exe: 'bin/llama-server' } } },
    models: [{ id, name, use: ['vision', 'listening'], version: '1', licence: 'MIT', source: 'https://huggingface.co/x/y', memory: 'little', stillsPerAsk: 2, chunkSec: 30, assume: [1, 2], what: 'test', files: files.map(x => ({ role: x.role, name: x.name, url: x.url, bytes: x.bytes, sha256: x.sha256 })) },
      { id: 'looks-only', name: 'Looks Only', use: ['vision'], version: '1', licence: 'MIT', source: 'https://huggingface.co/x/z', memory: 'little', stillsPerAsk: 2, assume: [1, 2], what: 'test', files: files.map(x => ({ role: x.role, name: 'l-' + x.name, url: x.url + 'l', bytes: x.bytes, sha256: x.sha256 })) }] };
  US.settings.set('understand.modelsDir', fs.mkdtempSync(path.join(os.tmpdir(), 'us-models-')));
  US.settings.set('understand.manifest', man);
  const m = M.get(id);
  fs.mkdirSync(M.modelDir(m), { recursive: true });
  for (const x of files) fs.writeFileSync(path.join(M.modelDir(m), x.name), x.body);
  const exe = path.join(M.runtime.info().dir, 'bin', 'llama-server'); fs.mkdirSync(path.dirname(exe), { recursive: true }); fs.writeFileSync(exe, '#!');
  return { undo() { M.stop(); US.settings.set('understand.manifest', null); US.settings.set('understand.modelsDir', ''); } };
}
const done = () => { US.settings.set('delivery.hearing', {}); US.ai.setDelivery(false); US.ai.setMedia(false); US.ai.setProjectOffline(false); US.secrets.set('geminiKey', ''); US.secrets.set('anthropicKey', ''); US.ctx = CTX0; D.reset(); };

test('off until switched on: nothing listens, nothing is sent, no line carries a note – whoever asks', async () => {
  project();
  const R = fakeRoutes();
  try {
    const s = D.settings();
    assert.deepStrictEqual([s.on, s.where], [false, 'local'], 'off, and on this computer, until chosen');
    assert.deepStrictEqual([s.langs.hebrew, s.langs.yiddish, s.langs.arabic, s.langs.russian, s.langs.french, s.langs.spanish, s.langs.other], [true, true, false, false, false, false, ''], 'Hebrew and Yiddish ticked');
    assert.deepStrictEqual([D.plan().kind, D.plan().why, D.status().state], ['none', 'off', 'off']);
    assert.strictEqual(await D.tick(), false, 'the background does nothing');
    await assert.rejects(() => D.runAll(job, {}), e => /switched off for this project/.test(e.title));
    await assert.rejects(() => D.analyse(D.interviews()[0], { job }), e => /switched off/.test(e.title));
    assert.deepStrictEqual([R.calls.listen.length, R.calls.sound], [0, 0], 'no sound was read and no model was asked');
    assert.strictEqual(D.active(), false);
    assert.strictEqual(D.note({ id: 'r2' }), '');
    assert.strictEqual(D.digestLine(), '');
    assert.strictEqual(US.ai.deliveryOn(), false, 'and the cloud has no yes');
  } finally { R.restore(); done(); }
});

test('the cloud needs this project’s own yes: refused inside US.ai.media without it, refused for a project kept on this computer, and one yes never opens the other', async () => {
  project('Consent film');
  US.secrets.set('geminiKey', 'g-test'); US.secrets.set('anthropicKey', 'sk-test');
  const SOUND = { media: { kind: 'audio', data: Buffer.alloc(9600).toString('base64'), mime: 'audio/wav', bytes: 9600, seconds: 3, note: 'Ruth.mp4 0:00–0:03 (2 lines)' } };
  const req = { system: 's', user: ['lines', SOUND], schema: { type: 'object' }, purpose: 'delivery', use: 'gemini:gemini-3.8-flash' };
  try {
    await assert.rejects(() => US.ai.media(req), e => /Listening to delivery in the cloud isn’t switched on for this project/.test(e.title) && /Listen to delivery/.test(e.action));
    // “Cloud” for seeing and hearing is a different choice: it doesn't let delivery through…
    US.ai.setMedia(true);
    assert.deepStrictEqual([US.ai.mediaOn(), US.ai.deliveryOn()], [true, false]);
    await assert.rejects(() => US.ai.media(req), e => /Listening to delivery in the cloud isn’t switched on/.test(e.title));
    US.ai.setMedia(false);
    // …and the delivery yes doesn't let seeing and hearing through
    US.ai.setDelivery(true);
    assert.deepStrictEqual([US.ai.mediaOn(), US.ai.deliveryOn()], [false, true]);
    await assert.rejects(() => US.ai.media({ system: 's', user: ['x', SOUND], schema: { type: 'object' } }), e => /Seeing and hearing in the cloud isn’t switched on/.test(e.title));
    // a project set to “nothing leaves this computer” never sends, yes or no
    US.ai.setProjectOffline(true);
    assert.strictEqual(US.ai.deliveryOn(), false);
    await assert.rejects(() => US.ai.media(req), e => /nothing leaves this computer/.test(e.title));
    D.setOn(true); D.setWhere('cloud');
    assert.deepStrictEqual([D.plan().kind, D.plan().why, D.status().state], ['none', 'offline', 'offline']);
    await assert.rejects(() => D.runAll(job, {}), e => /nothing leaves this computer/.test(e.title));
    US.ai.setProjectOffline(false);
    // Claude can't hear: a Claude model is refused for sound even with the yes
    US.ai.setDelivery(true);
    await assert.rejects(() => US.ai.media(Object.assign({}, req, { use: 'claude:claude-haiku-5-5' })), e => /can’t listen/.test(e.title));
    // the yes is per project
    const key = US.fsx.hash(US.ctx.project.path);
    assert.deepStrictEqual(Object.keys(US.settings.get('ai.deliveryProjects')), [key]);
    project('Another film');
    assert.strictEqual(US.ai.deliveryOn(), false, 'another project has no yes');
    D.setOn(true); D.setWhere('cloud');
    assert.deepStrictEqual([D.plan().kind, D.plan().why, D.status().state], ['none', 'consent', 'needs-consent'], 'choosing Cloud is not the yes');
    await assert.rejects(() => D.runAll(job, {}), e => /isn’t switched on for this project on this computer/.test(e.title));
    // going back to this computer takes the yes away again
    US.ai.setDelivery(true); D.setWhere('local');
    assert.strictEqual(US.ai.deliveryOn(), false);
  } finally { US.settings.set('ai.deliveryProjects', {}); done(); }
});

test('the sound in pieces: every line whole and in exactly one piece, with the transcript’s own times; long gaps aren’t sent', () => {
  const lines = [{ id: 'a', start: 1, end: 5 }, { id: 'b', start: 6, end: 11 }, { id: 'c', start: 12, end: 20 }, { id: 'd', start: 40, end: 49 }, { id: 'e', start: 70, end: 78 }, { id: 'f', start: 100, end: 190 }, { id: 'bad', start: 5, end: 5 }, { id: 'late', start: 999, end: 1005 }];
  const ps = P.pieces(lines, 200, { chunk: 30 });
  assert.deepStrictEqual(ps.map(p => [p.start, p.end, p.lines.map(l => l.id).join('')]), [[0.5, 28, 'abc'], [39.5, 57, 'd'], [69.5, 86, 'e'], [99.5, 129.5, 'f']]);
  assert.strictEqual(ps[3].cut, true, 'a line longer than a piece gets one to itself, cut at the piece’s length');
  const seen = ps.flatMap(p => p.lines);
  assert.deepStrictEqual(seen.map(l => l.id), ['a', 'b', 'c', 'd', 'e', 'f'], 'each line once; one with no length, and one past the end of the sound, left out');
  assert.ok(seen.every(l => lines.includes(l)), 'the lines are the transcript’s own – ids and times untouched');
  assert.ok(ps.every(p => p.end - p.start <= 30 && p.start >= 0 && p.end <= 200));
  // a model in the cloud hears two minutes at a time: fewer, longer pieces of the same lines
  assert.deepStrictEqual(P.pieces(lines, 200, { chunk: 120 }).map(p => p.lines.map(l => l.id).join('')), ['abcde', 'f']);
  assert.deepStrictEqual(P.pieces([], 60), []);
});

test('the request: line ids, times within the piece, speaker and text – then the sound; the languages to expect; never invent; the interview only by number', () => {
  const iv = { n: 3, name: 'Ruth Cohen final.mp4' }, piece = { start: 39.5, end: 57, lines: [{ id: 'r4', start: 40, end: 49, speaker: 'Ruth', text: 'Oh sure,   the landlord was a real sweetheart.' }] };
  const langs = P.langsOf({ arabic: true, yiddish: false, other: 'ladino, Aramaic' });
  assert.deepStrictEqual(P.langNames(langs), ['Hebrew', 'Arabic', 'Ladino', 'Aramaic']);
  const req = P.request(iv, piece, 'QUJD', 3, langs, { terms: ['Gersch', 'Whitechapel'] });
  assert.ok(/expect English with words, phrases or whole sentences in: Hebrew, Arabic, Ladino, Aramaic/.test(req.system), 'the project’s languages are in the instruction');
  assert.ok(/NEVER INVENT/.test(req.system) && /"confidence": "unsure"/.test(req.system) && /give no times/.test(req.system));
  assert.ok(/in its own script/.test(req.system) && /sarcasm or a joke/.test(req.system) && /"missed"/.test(req.system));
  const text = req.user[0];
  assert.ok(/^A piece of interview 3, 18 seconds long \(it starts 0:39 into the interview\)\. Languages to expect besides English: Hebrew, Arabic, Ladino, Aramaic\./.test(text));
  assert.ok(text.includes('\nr4\t0.5–9.5\tRuth\tOh sure, the landlord was a real sweetheart.\n'), 'id, seconds from the start of this piece, speaker, text: ' + text);
  assert.ok(/Names and terms the editor has spelt for this project: Gersch, Whitechapel\./.test(text));
  assert.ok(!/Ruth Cohen final/.test(req.system + text), 'the file’s name isn’t sent');
  assert.deepStrictEqual([req.user[1].media.kind, req.user[1].media.mime, req.user[1].media.seconds, req.feature], ['audio', 'audio/wav', 17.5, 'Listening to delivery']);
  assert.deepStrictEqual(P.langNames(P.langsOf(null)), ['Hebrew', 'Yiddish'], 'Hebrew and Yiddish until changed');
  assert.ok(/in: none in particular/.test(P.system({ hebrew: false, yiddish: false })));
});

test('a model’s answer is tidied: only the ids it was given, scores 1–5, short notes – and the times are the transcript’s, never the model’s', () => {
  const piece = { start: 0.5, end: 28, lines: [{ id: 'r1', start: 1, end: 5, text: 'a' }, { id: 'r2', start: 6, end: 11, text: 'b' }] };
  const t = P.tidy({ lines: [
    { id: 'r2', score: 4.6, notes: ['Warm', 'warm', 'LAUGHS.', '', 'a', 'b', 'c'], energy: 'HIGH', cleanStart: false, cleanEnd: true, confidence: 'maybe', start: 999, end: 1000, heard: [{ said: HEB, transliteration: 'b’ezrat Hashem', language: 'Hebrew', meaning: 'with God’s help', transcriptHad: 'bizarre a sham', kind: 'religious', confidence: 'sure' }, { said: '…', transliteration: '' }] },
    { id: 'r2', score: 1, notes: ['again'] }, { id: 'zzz', score: 5, notes: ['invented line'] }, { id: 'r1', score: 0, notes: 'nope', energy: 'low' }],
    missed: [{ afterLine: 'r1', said: 'נו', transliteration: 'nu', language: 'Yiddish', meaning: 'well then', confidence: 'fairly sure', at: 500 }, { afterLine: 'nope', said: 'oy', transliteration: '', language: 'Yiddish', meaning: '', confidence: 'x' }, { afterLine: 'r1', said: '' }] }, piece);
  assert.deepStrictEqual(Object.keys(t.lines).sort(), ['r1', 'r2'], 'a line the model made up is dropped; each line once');
  const e = t.lines.r2;
  assert.deepStrictEqual([e.score, e.notes, e.energy, e.in, e.out, e.conf, e.start, e.end], [5, ['warm', 'laughs', 'a', 'b'], '', false, true, 'unsure', 6, 11]);
  assert.deepStrictEqual(e.heard, [{ said: HEB, tr: 'b’ezrat Hashem', lang: 'Hebrew', meaning: 'with God’s help', had: 'bizarre a sham', kind: 'religious', conf: 'sure' }]);
  assert.deepStrictEqual([t.lines.r1.score, t.lines.r1.notes, t.lines.r1.energy], [null, [], 'low'], 'a score outside 1–5 is no score');
  assert.deepStrictEqual(t.missed.map(m => [m.after, m.at, m.said, m.conf]), [['r1', 5, 'נו', 'fairly sure'], ['', 0.5, 'oy', 'unsure']], 'something missed is placed by the line it follows – that line’s own end');
  assert.deepStrictEqual(P.tidy(null, piece), { lines: {}, missed: [] });
  assert.deepStrictEqual(P.tidy({ lines: 'x', missed: 7 }, piece), { lines: {}, missed: [] });
});

test('the note on a line: [delivery 4/5 – warm, laughs; says “…” (how to read it, language: meaning)] – short, and empty when there is nothing to say', () => {
  const heard = { said: HEB, tr: 'b’ezrat Hashem', lang: 'Hebrew', meaning: 'with God’s help', had: 'bizarre a sham', kind: 'religious', conf: 'sure' };
  assert.strictEqual(P.noteOf({ score: 4, notes: ['warm', 'laughs'], in: true, out: true, conf: 'sure', heard: [heard] }), `[delivery 4/5 – warm, laughs; says “${HEB}” (b’ezrat Hashem, Hebrew: with God’s help)]`);
  assert.strictEqual(P.noteOf({ score: 2, notes: ['hesitant', 'stumbles', 'false start', 'flat'], in: false, out: false, conf: 'unsure', heard: [] }), '[delivery 2/5 – hesitant, stumbles, false start, starts mid-word, ends cut off (unsure)]');
  assert.strictEqual(P.noteOf({ score: null, notes: [], heard: [Object.assign({}, heard, { conf: 'unsure' })] }), `[may say “${HEB}” (b’ezrat Hashem, Hebrew: with God’s help)]`, 'an unsure correction says so');
  assert.strictEqual(P.noteOf({ score: 4, notes: ['dry'], heard: [{ said: 'a real sweetheart', tr: '', lang: 'English', meaning: 'she means the opposite', had: 'a real sweetheart', kind: 'sarcasm', conf: 'sure' }] }), '[delivery 4/5 – dry; sarcastic: she means the opposite]');
  assert.strictEqual(P.noteOf({ score: null, notes: [], heard: [] }), '');
  assert.strictEqual(P.noteOf(null), '');
  const long = P.noteOf({ score: 3, notes: ['x'.repeat(28), 'y'.repeat(28), 'z'.repeat(28)], heard: [heard, heard, heard] });
  assert.ok(long.length <= 192 && /…\]$/.test(long) && (long.match(/says/g) || []).length <= 2, 'kept to a couple of hundred characters, two corrections at most: ' + long.length);
  assert.strictEqual(D.heardText(heard), `“${HEB}” (b’ezrat Hashem, Hebrew: with God’s help)`);
});

test('listening to an interview: a record per media file with every line’s delivery; it carries on where it stopped, and is made again only when the model, the languages or the transcript change', async () => {
  const pr = project('Record film');
  const R = fakeRoutes();
  try {
    const ruth = D.interviews()[0], Pl = LOCAL();
    assert.deepStrictEqual(D.interviews().map(iv => [iv.key, iv.n, iv.lines.length, iv.seconds]), [['ruth', 1, 5, 78], ['sam', 2, 2, 12]]);
    // stopped after the first piece (the background's slice ran out): what is done is kept
    let n = 0;
    const part = await D.analyse(ruth, { job, plan: Pl, keepGoing: () => n++ < 1 });
    assert.deepStrictEqual([part.more, part.rec.next, part.rec.total, !!part.rec.done, R.calls.listen.length], [true, 1, 3, false, 1]);
    assert.deepStrictEqual(Object.keys(D.peek(ruth.path).lines).sort(), ['r1', 'r2', 'r3']);
    // next time: from the second piece – the first isn't asked again
    const rest = await D.analyse(ruth, { job, plan: Pl });
    assert.deepStrictEqual([rest.more, rest.rec.done, rest.rec.judged, R.calls.listen.length], [false, true, 5, 3]);
    assert.ok(/^r4\t/m.test(R.calls.listen[1].user[0]) && !/^r1\t/m.test(R.calls.listen[1].user[0]));
    const rec = D.peek(ruth.path);
    assert.deepStrictEqual([rec.by, rec.label, rec.where, rec.langs, rec.total, rec.next], ['gemma-test@1', 'Test listener', 'local', 'hebrew,yiddish', 3, 3]);
    assert.deepStrictEqual([rec.lines.r2.score, rec.lines.r2.start, rec.lines.r2.end, rec.lines.r2.heard[0].said], [5, 6, 11, HEB], 'times from the transcript');
    assert.deepStrictEqual(rec.missed.map(m => [m.after, m.at, m.tr]), [['r2', 11, 'nu']]);
    assert.strictEqual(rec.lines['made-up'], undefined);
    // done: nothing is asked again
    const again = await D.analyse(ruth, { job, plan: Pl });
    assert.deepStrictEqual([again.did, R.calls.listen.length], [false, 3]);
    assert.strictEqual(D.needs(ruth, Pl), false);
    // another model: made again
    const other = LOCAL('gemma-big@2', 'Bigger listener');
    assert.strictEqual(D.needs(ruth, other), true);
    await D.analyse(ruth, { job, plan: other });
    assert.deepStrictEqual([D.peek(ruth.path).by, R.calls.listen.length], ['gemma-big@2', 6]);
    // other languages: made again
    assert.strictEqual(D.needs(ruth, Object.assign({}, other, { langs: P.langsOf({ arabic: true }) })), true);
    // the transcript changed (a line reworded): made again; a glossary correction alone doesn't count
    pr.st.transcripts[0].lines[0].orig = pr.st.transcripts[0].lines[0].text; pr.st.transcripts[0].lines[0].text = 'We opened the Bakery in 1960.';
    assert.strictEqual(D.needs(D.interviews()[0], other), false, 'corrected by Names and terms: the same recording, the same words said');
    delete pr.st.transcripts[0].lines[0].orig;
    assert.strictEqual(D.needs(D.interviews()[0], other), true, 'reworded: listened to again');
    // the copy that travels with the project
    D.flush();
    const file = path.join(pr.dir, 'JMG Ultra Studio', 'Record film – Delivery.json');
    assert.ok(fs.existsSync(file), 'kept beside the project: ' + fs.readdirSync(pr.dir).join(', '));
    const kept = JSON.parse(fs.readFileSync(file, 'utf8')), k = Object.keys(kept.interviews);
    assert.ok(k.length === 1 && /^ruth\.mp4\|\d+$/.test(k[0]) && kept.interviews[k[0]].lines.r2.heard[0].tr === 'b’ezrat Hashem' && !('path' in kept.interviews[k[0]]), 'keyed by file name and size, without this computer’s path');
    // on another computer (nothing in the cache): read from the travelling copy
    fs.unlinkSync(US.cache.file('delivery', P.keyOf(ruth.path))); D.reset();
    assert.strictEqual(D.peek(ruth.path).lines.r2.score, 5);
    // forget() and unforget(), for the e2e test
    const saved = D.forget(ruth.path);
    assert.strictEqual(D.peek(ruth.path), null);
    D.unforget(saved);
    assert.strictEqual(D.peek(ruth.path).by, 'gemma-big@2');
  } finally { R.restore(); done(); }
});

test('a piece the model answers nonsense for is left out and counted; a run of nothing but nonsense stops; sound that can’t be read waits', async () => {
  project('Bad answers');
  const bad = () => { throw new US.UserError('AI_FAILED', { title: 'The AI’s answer didn’t make sense.' }); };
  let k = 0;
  const R = fakeRoutes({ listen: req => (k++ === 1 ? bad() : answerFor(req)) });
  try {
    const ruth = D.interviews()[0], r = await D.analyse(ruth, { job, plan: LOCAL() });
    assert.deepStrictEqual([r.rec.done, r.rec.failed, Object.keys(r.rec.lines).sort()], [true, 1, ['r1', 'r2', 'r3', 'r5']], 'the second piece (r4) is left out');
    R.restore();
    const R2 = fakeRoutes({ listen: bad });
    await assert.rejects(() => D.analyse(D.interviews()[1], { job, plan: LOCAL() }), e => /didn’t make sense/.test(e.title));
    await assert.rejects(() => D.analyse(ruth, { job, plan: LOCAL('m@2'), force: true }), e => /didn’t make sense/.test(e.title));
    R2.restore();
    // no key, no consent, Stop: the run ends at once, and what was done is kept
    const R3 = fakeRoutes({ listen: () => { throw new US.UserError('CANCELLED'); } });
    await assert.rejects(() => D.analyse(ruth, { job, plan: LOCAL('m@3') }), e => e.code === 'CANCELLED');
    R3.restore();
    const R4 = fakeRoutes({ sound: 'fail' });
    D.reset();
    const w = await D.analyse(D.interviews()[1], { job, plan: LOCAL('m@4'), force: true });
    assert.deepStrictEqual([w.skipped, w.rec.waiting, R4.calls.listen.length], ['sound', 'render', 0], 'in the background a render is never started: it waits');
    const h = await D.analyse(D.interviews()[1], { job, plan: LOCAL('m@4'), heavy: true });
    assert.deepStrictEqual([h.skipped, h.rec.cant], ['sound', true]);
    R4.restore();
  } finally { R.restore(); done(); }
});

test('what Story sends to its AI: every row carries the line’s note, the AI is told once what the notes mean – and with the switch off, nothing at all', async () => {
  project('Notes film');
  const R = fakeRoutes();
  try {
    D.setOn(true);
    const before = { row: C.row(S.lineOf('r2')), ai: T.aiRow(S.lineOf('r2')), sys: C.requests(S.scopeTranscripts(), { task: () => 'Task' })[0].req.system };
    assert.ok(!/delivery/.test(before.row + before.ai) && before.sys === C.SYSTEM, 'switched on but not listened to yet: nothing is added');
    for (const iv of D.interviews()) await D.analyse(iv, { job, plan: LOCAL() });
    assert.strictEqual(D.active(), true);
    const note = `[delivery 5/5 – warm, laughing; says “${HEB}” (b’ezrat Hashem, Hebrew: with God’s help)]`;
    assert.strictEqual(D.note(S.lineOf('r2')), ' ' + note);
    assert.strictEqual(D.note('r2'), ' ' + note, 'by id too');
    // the shared transcript (Themes, Find more, your own themes, the narrative shortlist, Moments, Questions, Ask, Producer)
    assert.strictEqual(C.row(S.lineOf('r2')), `r2\tRuth\t0:06+5\tAnd I said bizarre a sham we will manage. ${note}`);
    assert.strictEqual(C.row(S.lineOf('r3')), 'r3\tRuth\t0:12+8\tMy mother, um, she, she never, she never stopped working. [delivery 2/5 – hesitant, stumbles, false start, starts mid-word]');
    const reqs = C.requests(S.scopeTranscripts(), { task: () => 'Task', feature: 'Ask' });
    assert.ok(reqs[0].req.user[0].text.includes(note) && reqs[0].req.system.startsWith(C.SYSTEM) && reqs[0].req.system.endsWith(D.HINT));
    assert.ok(/prefer the better-delivered take/.test(D.HINT) && /read the corrected words as what was really said/.test(D.HINT) && /never quote them/.test(D.HINT));
    // the plain listing (Find themes in batches, Find more, the narrative)
    assert.strictEqual(T.aiRow(S.lineOf('s1')), 's1\tSam\tWe always managed, one way or another. [delivery 3/5 – flat, ends cut off]');
    const user = T.aiUser('Interview lines:\n' + T.aiRow(S.lineOf('s1')), 'Group them.');
    assert.strictEqual(user[1], 'Group them.\n\n' + D.HINT);
    assert.deepStrictEqual(T.aiUser('Interview lines:\nx1\tSam\tNo note here.', 'Group them.')[1], 'Group them.', 'no notes in the listing: the task is as it always was');
    const nar = US.storyNarrative.aiRequest([{ id: 'r2', strength: 0.8 }, { id: 's1', strength: 0.2 }], { topic: 'the bakery', seconds: 30 }, { lineOf: id => S.lineOf(id) });
    assert.ok(nar.user[0].text.includes(note) && nar.user[1].endsWith(D.HINT), 'the narrative from a brief reads them too');
    // Ask your interviews: its task rides on the shared transcript
    assert.ok(/best-delivered/.test(D.digestLine()) && /6 lines have a delivery score/.test(D.digestLine()) && /Test listener/.test(D.digestLine()), D.digestLine());
    // a line reworded since it was listened to is left alone
    S.lineOf('s1').text = 'We always managed.';
    assert.strictEqual(D.note('s1'), '');
    // switched off: the records stay, and nothing about delivery goes anywhere
    D.setOn(false);
    assert.deepStrictEqual([D.active(), D.note('r2'), D.forLine('r2'), D.digestLine(), D.heardTerms().length], [false, '', null, '', 0]);
    assert.strictEqual(C.row(S.lineOf('r2')), before.row);
    assert.strictEqual(T.aiRow(S.lineOf('r2')), before.ai);
    assert.strictEqual(C.requests(S.scopeTranscripts(), { task: () => 'Task' })[0].req.system, C.SYSTEM, 'byte for byte as before');
    assert.ok(D.peek(D.interviews()[0].path).done, 'what was heard is kept for when it is switched on again');
    D.setOn(true);
    assert.strictEqual(D.note('r2'), ' ' + note);
  } finally { R.restore(); done(); }
});

test('Listen now and the background: on this computer it works in quiet slices; the cloud is never used behind the editor’s back', async () => {
  project('Queue film');
  const TL = tinyListener(), R = fakeRoutes(), keepCalm = US.understand.calm;
  try {
    assert.deepStrictEqual(D.localModels().map(m => [m.id, m.installed]), [['tiny-listen', true]], 'only models that can listen are offered');
    D.setOn(true);
    assert.deepStrictEqual([D.plan().kind, D.plan().label, D.plan().id, D.settings().localModel], ['helper', 'Tiny Listener', 'tiny-listen@1', 'tiny-listen']);
    // busy: nothing
    US.understand.calm = () => ({ ok: false, why: '“Export” is running' });
    assert.strictEqual(await D.tick(), false);
    assert.ok(D.status().state === 'paused' && /paused while “Export” is running/.test(D.status().text));
    assert.strictEqual(R.calls.listen.length, 0);
    // calm: one slice does what it can (here: the first interview), the next slice the next
    US.understand.calm = () => ({ ok: true, why: '' });
    assert.ok(D.status().state === 'working' && /an assumption until it has run here/.test(D.status().note), JSON.stringify(D.status()));
    assert.strictEqual(await D.tick(), true);
    assert.deepStrictEqual([R.calls.listen.length, D.backlog().todo.map(iv => iv.key)], [3, ['sam']]);
    assert.strictEqual(await D.tick(), true);
    assert.strictEqual(await D.tick(), false, 'nothing left');
    assert.ok(D.status().state === 'up-to-date' && /Listened to all 2 interviews with Tiny Listener/.test(D.status().text));
    assert.ok(D.bench()['tiny-listen'] > 0, 'its speed on this computer is measured as it works');
    // held (the e2e tests): nothing
    D.forget(D.interviews()[1].path);
    const release = await D.pause();
    assert.strictEqual(await D.tick(), false);
    release();
    // no listening model here: said plainly, with where to get one – and nothing is downloaded
    TL.undo();
    assert.deepStrictEqual([D.plan().kind, D.plan().why, D.status().state, D.status().offers], ['none', 'model', 'needs-model', ['models']]);
    await assert.rejects(() => D.runAll(job, {}), e => /no listening model on this computer yet/.test(e.title) && /Vision & listening models/.test(e.action));
    // the cloud: chosen and agreed – and still nothing in the background
    US.secrets.set('geminiKey', 'g-test');
    D.setWhere('cloud'); US.ai.setDelivery(true);
    const sent = [], keepMedia = US.ai.media;
    US.ai.media = async req => { sent.push(req); if (req.onUsage) req.onUsage({ usd: 0, paidUsd: 0.01 }); return answerFor(req); };
    R.restore();
    const keepSound = D.routes.sound; D.routes.sound = async () => ({ data: TALK(), sr: 16000, duration: 80, how: 'ffmpeg' });
    try {
      assert.deepStrictEqual([D.plan().kind, D.plan().id, D.plan().label, D.plan().chunkSec], ['cloud', 'cloud:gemini-3.8-flash', 'Gemini 3.8 Flash', 120]);
      assert.deepStrictEqual([D.status().state, D.status().offers], ['cloud-waiting', ['now', 'overnight']]);
      assert.ok(/never done behind your back/.test(D.status().note));
      assert.strictEqual(await D.tick(), false);
      assert.strictEqual(sent.length, 0, 'nothing is sent until Listen now or Overnight prep');
      const r = await D.runAll(job, {});
      assert.deepStrictEqual([r.done, sent.length], [2, 2], 'two minutes at a time: one request an interview');
      assert.ok(sent.every(q => q.purpose === 'delivery' && q.use === 'gemini:gemini-3.8-flash' && q.user[1].media.kind === 'audio'), 'through US.ai.media, as a delivery request – where the yes is checked');
      assert.ok(/2 interviews listened to with Gemini 3.8 Flash/.test(r.summary) && /Google’s paid rate/.test(r.summary), r.summary);
      assert.strictEqual(D.peek(D.interviews()[0].path).where, 'cloud');
      // Overnight prep's limit: a piece that wouldn't fit isn't sent
      D.setModel('cloud', 'gemini-4-hydrogen');
      const n0 = sent.length, lim = await D.runAll(job, { limitUsd: 0.0001 });
      assert.deepStrictEqual([lim.stopped, lim.done, sent.length - n0], ['limit', 0, 0]);
      assert.ok(/stopped at the limit/.test(lim.summary));
      const some = await D.runAll(job, { limitUsd: 0.011 });
      assert.deepStrictEqual([some.stopped, some.done, sent.length - n0], ['limit', 1, 1], 'the first fits, then the limit is reached');
    } finally { US.ai.media = keepMedia; D.routes.sound = keepSound; }
  } finally { US.understand.calm = keepCalm; R.restore(); TL.undo(); US.settings.set('delivery.bench', {}); done(); }
});

test('a lot of listening isn’t started while the editor works: it is scheduled, with how long and why – Overnight prep or Listen now', async () => {
  const pr = project('Long film');
  const TL = tinyListener(), R = fakeRoutes(), keepCalm = US.understand.calm;
  try {
    // an hour and a half of talking
    pr.st.transcripts[0].lines = Array.from({ length: 540 }, (_, i) => ({ id: 'L' + i, start: i * 10, end: i * 10 + 9, speaker: 'Ruth', text: 'Line number ' + i + ' of a long interview.' }));
    S.reindex();
    D.setOn(true);
    US.understand.calm = () => ({ ok: true, why: '' });
    const st = D.status();
    assert.deepStrictEqual([st.state, st.offers], ['scheduled', ['overnight', 'now']]);
    assert.ok(/too much to do while you edit/.test(st.text) && /an assumption until it has run here/.test(st.note) && /Overnight prep/.test(st.note), JSON.stringify(st));
    assert.strictEqual(await D.tick(), false);
    assert.strictEqual(R.calls.listen.length, 0);
    US.settings.set('understand.heavyInBackground', true);
    assert.strictEqual(D.status().state, 'working', '“Let big jobs run in the background too” lets it');
    US.settings.set('understand.background', false);
    assert.ok(D.status().state === 'paused' && /background work is switched off/.test(D.status().text));
    assert.strictEqual(await D.tick(), false);
  } finally { US.settings.set('understand.heavyInBackground', false); US.settings.set('understand.background', true); US.understand.calm = keepCalm; R.restore(); TL.undo(); done(); }
});

test('honest estimates: this computer measured or said to be assumed; the cloud a dated range at Google’s paid rate, per model', () => {
  const input = { seconds: 3600, lines: 480, chars: 48000 };
  const e = P.estimate(input, { chunk: 30, localModel: { id: 'g', name: 'Gemma' }, cloudModel: 'gemini-3.8-flash', prices: US.ai.MEDIA_PRICES });
  assert.deepStrictEqual([e.minutes, e.local.measured, e.local.secs, e.local.usd], [60, false, [1200, 7200], 0], 'until measured: between half and three times real time');
  const m = P.estimate(input, { localModel: { id: 'g', name: 'Gemma' }, bench: { g: 2 } });
  assert.deepStrictEqual([m.local.measured, m.local.secs, m.cloud], [true, [1800, 1800], null]);
  const c = e.cloud;
  assert.deepStrictEqual([c.label, c.asks, c.date, c.megabytes], ['Gemini 3.8 Flash', 30, US.ai.MEDIA_PRICES.date, 115.2]);
  assert.ok(c.usd[0] > 0.1 && c.usd[1] > c.usd[0] && c.usd[1] < 1, 'an hour with Flash: ' + c.usd);
  const dear = P.estimate(input, { cloudModel: 'gemini-4-hydrogen', prices: US.ai.MEDIA_PRICES }).cloud, cheap = P.estimate(input, { cloudModel: 'gemini-3.5-flash-lite', prices: US.ai.MEDIA_PRICES }).cloud;
  assert.ok(dear.usd[1] > c.usd[1] && c.usd[1] > cheap.usd[1], 'the dearer the model, the dearer the estimate');
  assert.deepStrictEqual(D.cloudModels().map(x => x.id), Object.keys(US.ai.MEDIA_PRICES.gemini), 'the cloud models offered are the Gemini ones that hear (Claude can’t)');
  assert.ok(P.pieceUsd({ start: 0, end: 120, lines: [{ text: 'x'.repeat(400) }] }, 'gemini-3.8-flash') > 0.002);
  // the sentences
  project('Estimate film');
  try {
    const n = US.storyDelivery.numbers(), t = US.storyDelivery.estimateText(n);
    assert.ok(/^2 interviews, .* of speech, 7 lines$/.test(t.interviews), t.interviews);
    assert.ok(/Needs a listening model downloaded once/.test(t.local) && /Cost: nothing/.test(t.local));
    assert.ok(/Gemini 3\.8 Flash/.test(t.cloud) && /Cost at Google’s paid rate/.test(t.cloud) && /prices read on 19 Nov 2026/.test(t.cloud) && /is an assumption/.test(t.cloud) && /free allowance/.test(t.cloud), t.cloud);
    assert.ok(/weaker at Hebrew and Yiddish/.test(US.storyDelivery.HONEST) && /tested on real footage/.test(US.storyDelivery.HONEST));
  } finally { done(); }
});

test('words it heard are offered to Names and terms – never added by themselves; adding one corrects only the lines it was heard in', async () => {
  const pr = project('Terms film');
  const R = fakeRoutes();
  try {
    D.setOn(true);
    for (const iv of D.interviews()) await D.analyse(iv, { job, plan: LOCAL() });
    const offers = US.storyDelivery.offers();
    assert.deepStrictEqual(offers.map(x => [x.right, x.said, x.lang, x.meaning, x.heard, x.lines]), [['b’ezrat Hashem', HEB, 'Hebrew', 'with God’s help', ['bizarre a sham'], ['r2']]], 'the sure correction; not the sarcasm, and nothing the transcript already had right');
    assert.deepStrictEqual(pr.st.glossary, [], 'nothing was added');
    assert.strictEqual(S.lineOf('r2').text, 'And I said bizarre a sham we will manage.');
    US.storyDelivery.addTerm(offers[0]);
    assert.deepStrictEqual(pr.st.glossary, [{ right: 'b’ezrat Hashem', heard: ['bizarre a sham'], hide: false, lines: ['r2'] }]);
    assert.strictEqual(S.lineOf('r2').text, 'And I said b’ezrat Hashem we will manage.');
    assert.deepStrictEqual(US.storyDelivery.offers(), [], 'once in Names and terms it isn’t offered again');
    assert.ok(D.forLine('r2') && D.forLine('r2').score === 5, 'the corrected line keeps what was heard');
    // names kept out of AI are no hint for the listener
    pr.st.glossary.push({ right: 'Whitechapel', heard: [], hide: false }, { right: 'Gersch', heard: ['Gersh'], hide: true });
    const n0 = R.calls.listen.length;
    await D.analyse(D.interviews()[1], { job, plan: LOCAL('other@1') });
    assert.ok(/spelt for this project: b’ezrat Hashem, Whitechapel\./.test(R.calls.listen[n0].user[0]));
  } finally { R.restore(); done(); }
});

test('Pro View: a Delivery column only while there is something to show; sort by how well a line is said; filter by delivery; the filter box finds a note', () => {
  const PV = US.proView;
  assert.ok(PV.COLS.some(c => c.id === 'delivery' && c.label === 'Delivery'));
  const lay = PV.layout(null);
  assert.ok(!PV.visible(lay, { used: true }).includes('delivery') && PV.visible(lay, { used: false, delivery: true }).includes('delivery'));
  assert.strictEqual(PV.canHide('delivery'), true);
  const row = (id, delivery) => ({ id, l: { id, start: 0, end: 1, text: 'words' }, ids: [id], themes: [], who: 'Ruth', pos: 0, delivery });
  const rows = [row('a', { score: 2, notes: ['hesitant'], heard: [] }), row('b', null), row('c', { score: 5, notes: ['warm'], heard: [{ said: HEB, tr: 'b’ezrat Hashem', lang: 'Hebrew', meaning: 'with God’s help' }] }), row('d', { score: 4, notes: [], heard: [] })];
  assert.deepStrictEqual(PV.sortRows(rows, 'delivery', 1, PV.SORT_KEYS).map(r => r.id), ['c', 'd', 'a', 'b'], 'best said first; not listened to stays last');
  assert.deepStrictEqual(PV.sortRows(rows, 'delivery', -1, PV.SORT_KEYS).map(r => r.id), ['a', 'd', 'c', 'b']);
  const f = k => PV.byDelivery(rows, k).map(r => r.id).join('');
  assert.deepStrictEqual([f('any'), f('4'), f('3'), f('low'), f('heard'), f('none')], ['abcd', 'cd', 'cd', 'a', 'c', 'b']);
  assert.ok(PV.hay(rows[2]).includes('hashem') && PV.hay(rows[0]).includes('hesitant') && !PV.hay(rows[1]).includes('undefined'));
  // several lines as one (an answer): the average score, the notes and corrections together
  assert.deepStrictEqual([P.combine([rows[0].delivery, rows[2].delivery, null]).score, P.combine([rows[0].delivery, rows[2].delivery]).notes, P.combine([rows[0].delivery, rows[2].delivery]).heard.length, P.combine([null])], [4, ['hesitant', 'warm'], 1, null]);
});

test('where it shows: a Settings section, an Overnight prep step that is off unless ticked, a tour step in Story and in Settings, and the engine loaded by the panel', () => {
  assert.ok(US.settingsSections.list().some(s => s.id === 'delivery' && s.title === 'Listening models for Story'));
  const o = US.overnight.settings();
  assert.ok(!o.steps.includes('delivery'), 'not ticked until “Do it in Overnight prep”');
  const overnight = fs.readFileSync(path.join(ROOT, 'js', 'tools', '01-overnight.js'), 'utf8');
  assert.ok(/id: 'delivery', label: 'Listen to the delivery of the interviews'/.test(overnight) && /limitUsd/.test(overnight) && /confirmCloud\(\{ overnight: true/.test(overnight));
  assert.ok(/'understand', 'delivery'\]/.test(fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8')), 'index.html loads js/core/delivery.js');
  const tour = fs.readFileSync(path.join(ROOT, 'js', 'tools', '04-tour-steps.js'), 'utf8');
  assert.ok((tour.match(/target: 'text:Listen to delivery'/g) || []).length === 1 && /target: 'text:Listening models for Story'/.test(tour));
  assert.ok(US.actions.get('delivery.run') && US.actions.get('delivery.run').match('listen to the delivery of my interviews'));
  // the footage rule names this second choice
  const rule = fs.readFileSync(path.join(ROOT, 'CLAUDE.md'), 'utf8');
  assert.ok(/Listen to delivery/.test(rule) && /purpose: 'delivery'/.test(rule));
});

test('in the panel (jsdom): the card in Story › 1 Interviews is off until switched on; Cloud asks first with the estimate and “no” leaves everything on this computer; Settings has every choice', () => {
  const r = cp.spawnSync(process.execPath, [path.join(__dirname, 'delivery-ui.js')], { encoding: 'utf8', timeout: 120000 });
  const last = (r.stdout || '').trim().split('\n').pop();
  let o; try { o = JSON.parse(last); } catch (e) { throw new Error('delivery-ui.js gave no result:\n' + (r.stdout || '').slice(-1500) + (r.stderr || '').slice(-1500)); }
  assert.deepStrictEqual(o.errors, []);
  assert.deepStrictEqual(o.card, { there: true, title: 'Listen to delivery', toggle: false, where: false, buttons: [] }, 'off: only the switch');
  assert.deepStrictEqual(o.on, { toggle: true, where: ['This computer', 'Cloud'], state: 'needs-model', offers: ['Open the models'], honest: true, langs: true });
  assert.ok(o.confirm && /Let Gemini 3\.8 Flash listen to the interviews/.test(o.confirm.title) && o.confirm.says && o.confirm.separate, JSON.stringify(o.confirm));
  assert.deepStrictEqual(o.confirm.buttons.length, 2);
  assert.deepStrictEqual(o.afterNo, { where: 'local', deliveryOn: false, mediaOn: false });
  assert.deepStrictEqual(o.afterYes, { where: 'cloud', deliveryOn: true, mediaOn: false, state: 'cloud-waiting', offers: ['Listen now', 'Do it in Overnight prep'] }, 'yes is for delivery only – seeing and hearing stays off');
  assert.deepStrictEqual(o.settings.inSettings, { title: 'Listening models for Story', closed: true });
  assert.deepStrictEqual(o.settings.prosCons, { pros: 6, cons: 6 });
  assert.deepStrictEqual(o.settings.langs, ['hebrew:true', 'yiddish:true', 'arabic:false', 'russian:false', 'french:false', 'spanish:false']);
  assert.deepStrictEqual(o.settings.cloudModels, 3);
  assert.ok(o.settings.claude && o.settings.honest && o.settings.estimate && o.settings.noDownload, JSON.stringify(o.settings));
  assert.deepStrictEqual(o.offline, { cloudRefused: true, where: 'local', deliveryOn: false });
  assert.deepStrictEqual(o.lines, { pill: '♪ 5/5', heard: true, pillOff: false }, 'a listened-to line shows its pill and corrected words in Story’s lists – and neither when switched off');
});

/* ---------- 1.3.42: does the model really listen? (Gemma 4 E2B scored a clip with no speech “5/5 clear, warm” from the transcript) ---------- */
const CHECK_TEXT = 'We opened the bakery in nineteen sixty. And my mother never stopped working for a single day.';
const burst = (secs, spans, level = 0.2) => { const sr = 16000, d = new Float32Array(sr * secs); for (let i = 0; i < d.length; i++) { const t = i / sr; d[i] = (spans.some(([a, b]) => t >= a && t < b) ? level : 0.0005) * Math.sin(i * 0.7) * (0.6 + 0.4 * Math.sin(i * 0.013)); } return d; };

test('both routes are asked whether each line can be HEARD, and to give no score when it can’t; a line not heard never gets a score – not even 1/5', () => {
  assert.ok(P.SCHEMA.properties.lines.items.required.includes('audible') && P.SCHEMA.properties.lines.items.properties.audible.enum.join() === 'yes,partly,no');
  const sys = P.system(null);
  assert.ok(/"audible": can you actually HEAR that line being spoken/.test(sys) && /do not assume a line is spoken because it is written/.test(sys) && /say "audible": "no" and give NO score/.test(sys) && /Never judge a line from its text/.test(sys));
  const piece = { start: 0, end: 20, lines: [{ id: 'a', start: 1, end: 4, text: 'One.' }, { id: 'b', start: 5, end: 8, text: 'Two.' }, { id: 'c', start: 9, end: 12, text: 'Three.' }, { id: 'd', start: 13, end: 16, text: 'Four.' }] };
  const t = P.tidy({ lines: [
    { id: 'a', audible: 'no', score: 4, notes: ['clear', 'warm'], energy: 'medium', heard: [{ said: 'x y', transliteration: '', language: 'English', meaning: '', transcriptHad: 'q', kind: 'word', confidence: 'sure' }] },
    { id: 'b', audible: 'yes', score: 1, notes: ['Inaudible'], energy: 'low', heard: [] },           // what Gemini answered on the clip with no speech
    { id: 'c', audible: 'partly', score: 3, notes: ['under music'], energy: 'low', heard: [] },
    { id: 'd', score: 4, notes: ['warm'], energy: 'medium', heard: [{ said: 'Four.', transliteration: 'Four.', language: 'English', meaning: 'the number', transcriptHad: 'four', kind: 'other', confidence: 'sure' }] }], missed: [] }, piece);
  assert.deepStrictEqual([t.lines.a.score, t.lines.a.notes, t.lines.a.heard, t.lines.a.unheard], [null, [], [], 'model'], 'said to be inaudible: no score, no notes, no corrections');
  assert.deepStrictEqual([t.lines.b.score, t.lines.b.unheard], [null, 'model'], '“inaudible” in the notes is not a 1/5');
  assert.deepStrictEqual([t.lines.c.score, t.lines.c.partly, t.lines.c.unheard], [3, true, undefined]);
  assert.deepStrictEqual([t.lines.d.score, t.lines.d.heard], [4, []], 'an older answer without the field counts as heard; the transcript’s own words given back are no correction');
  assert.strictEqual(P.noteOf(t.lines.a), '', 'nothing about it goes to Story’s AI');
  assert.deepStrictEqual([P.combine([t.lines.a, t.lines.c]).score, P.combine([t.lines.a, t.lines.b]).unheard], [3, 'model']);
  assert.deepStrictEqual(US.proView.byDelivery([{ delivery: t.lines.a }, { delivery: t.lines.c }, { delivery: null }], 'unheard').length, 1);
  assert.strictEqual(US.proView.SORT_KEYS.delivery({ delivery: t.lines.a }), null, 'and it sorts with the lines that have no score');
});

test('a model on this computer listens first, without the transcript: a piece where nobody speaks is never judged; a line whose words weren’t heard gets no score, and only a correction that was really heard is kept', async () => {
  project('Listen first');
  const Pl = LOCAL(), iv = { n: 1, name: 'Ruth.mp4' }, sr = 16000;
  const piece = { start: 0, end: 12, lines: [{ id: 'r1', start: 1, end: 5, speaker: 'Ruth', text: 'We opened the bakery in nineteen sixty.' }, { id: 'r2', start: 6, end: 11, speaker: 'Ruth', text: 'And I said bizarre a sham we will manage.' }] };
  // nobody speaks: one request (what is said?), no judging, every line “couldn't hear”
  let R = fakeRoutes({ hear: () => ({ speech: false, text: '' }) });
  try {
    const none = await D.listenPiece(Pl, iv, piece, TALK().subarray(0, sr * 12), sr, {});
    assert.deepStrictEqual([R.calls.hear.length, R.calls.listen.length, none.lines.r1.unheard, none.lines.r2.unheard, none.lines.r1.score, none.said], [1, 0, 'model', 'model', null, '']);
    const req = R.calls.hear[0];
    assert.ok(req.user.length === 2 && req.user[0] === 'The recording:' && req.user[1].media.kind === 'audio' && !/bakery/.test(JSON.stringify([req.system, req.user[0]])), 'the first request carries the sound and not one word of the transcript');
    assert.deepStrictEqual([P.saidOf({ speech: true, text: 'The recording' }), P.saidOf({ speech: false, text: 'We opened the bakery' }), P.saidOf(null)], ['', '', ''], 'two stray words, or “no speech”, is nobody speaking');
  } finally { R.restore(); }
  // the first line is heard; where the second should be, other words (Hebrew) are heard – the model scores both anyway
  R = fakeRoutes({ hear: () => ({ speech: true, text: `We opened the bakery in nineteen sixty and I said ${HEB} we will manage` }),
    listen: req => ({ lines: [{ id: 'r1', audible: 'yes', score: 4, notes: ['warm'], energy: 'medium', heard: [] },
      { id: 'r2', audible: 'yes', score: 5, notes: ['clear'], energy: 'high', heard: [{ said: HEB, transliteration: 'b’ezrat Hashem', language: 'Hebrew', meaning: 'with God’s help', transcriptHad: 'bizarre a sham', kind: 'religious', confidence: 'sure' }, { said: 'מזל טוב', transliteration: 'mazel tov', language: 'Hebrew', meaning: 'congratulations', transcriptHad: 'manage', kind: 'word', confidence: 'sure' }] }],
      missed: [{ afterLine: 'r2', said: 'thank you very much', transliteration: '', language: 'English', meaning: '', confidence: 'sure' }] }) });
  try {
    const piece2 = { start: 0, end: 12, lines: [piece.lines[0], { id: 'r2', start: 6, end: 11, speaker: 'Ruth', text: 'And beside bizarre sham villa manager.' }] };
    const t = await D.listenPiece(Pl, iv, piece2, TALK().subarray(0, sr * 12), sr, {});
    assert.deepStrictEqual([t.lines.r1.score, t.lines.r1.unheard], [4, undefined]);
    assert.deepStrictEqual([t.lines.r2.score, t.lines.r2.notes, t.lines.r2.unheard, t.lines.r2.heard.map(h => h.said)], [null, [], 'words', [HEB]], 'no score for words that weren’t heard; the correction that WAS heard is kept, the invented one dropped');
    assert.deepStrictEqual(t.missed, [], '“missed” speech the model never wrote down is dropped too');
    assert.ok(/What you wrote down a moment ago when you listened to this piece without the transcript: “We opened the bakery/.test(R.calls.listen[0].user[0]));
    assert.strictEqual(P.noteOf(t.lines.r2), `[says “${HEB}” (b’ezrat Hashem, Hebrew: with God’s help)]`, 'the correction still reaches Story’s AI – without a score');
    assert.deepStrictEqual([P.overlap('We opened the bakery', new Set(['we', 'opened', 'the', 'bakery'])), P.overlap('Oh.', new Set(['x'])), P.overlap('', new Set(['x']))], [1, 0, null]);
  } finally { R.restore(); done(); }
});

test('a line where the recording is silent gets no score whatever the model says – on every route; a steady room or music bed is not “silent”', async () => {
  const lines = [{ id: 'a', start: 1, end: 4 }, { id: 'b', start: 6, end: 9 }, { id: 'c', start: 11, end: 14 }];
  assert.deepStrictEqual([...P.silentLines(burst(16, [[1, 4], [11, 14]]), 16000, lines)], ['b'], 'speech at 1–4 and 11–14, nothing at 6–9');
  assert.deepStrictEqual([...P.silentLines(new Float32Array(16000 * 16), 16000, lines)], ['a', 'b', 'c'], 'a recording of nothing');
  assert.deepStrictEqual([...P.silentLines(burst(16, [[0, 16]], 0.0005), 16000, lines)].length, 3, 'only a faint hiss: nothing to judge');
  assert.deepStrictEqual([...P.silentLines(TALK().subarray(0, 16000 * 16), 16000, lines)], [], 'sound all the way through, no pauses');
  // the cloud route: the model scores every line; one of them is silent
  project('Silent gate');
  US.secrets.set('geminiKey', 'g-test');
  D.setOn(true); D.setWhere('cloud'); US.ai.setDelivery(true);
  const keepMedia = US.ai.media, keepSound = D.routes.sound;
  US.ai.media = async req => ({ lines: Array.from(req.user[0].matchAll(/^(\S+)\t[\d.]+–[\d.]+\t/gm)).map(m => ({ id: m[1], audible: 'yes', score: 4, notes: ['clear'], energy: 'medium', cleanStart: true, cleanEnd: true, confidence: 'sure', heard: [] })), missed: [] });
  D.routes.sound = async iv => ({ data: iv.key === 'ruth' ? burst(80, [[1, 5], [12, 20], [40, 49], [70, 78]]) : TALK(), sr: 16000, duration: 80, how: 'ffmpeg' });
  try {
    await D.runAll(job, {});
    const rec = D.peek(D.interviews()[0].path);
    assert.deepStrictEqual(['r1', 'r2', 'r3', 'r4'].map(id => [rec.lines[id].score, rec.lines[id].unheard]), [[4, undefined], [null, 'silent'], [4, undefined], [4, undefined]]);
    assert.deepStrictEqual([rec.judged, rec.unheard], [4, 1]);
    assert.deepStrictEqual([D.note('r1'), D.note('r2')], [' [delivery 4/5 – clear]', '']);
    const e = D.forLine('r2');
    assert.ok(US.storyDelivery.short(e) === 'couldn’t hear' && /silent here/.test(US.storyDelivery.titleOf(e)) && /no delivery score/.test(US.storyDelivery.titleOf(e)), 'shown as “couldn’t hear”, never as a low score');
  } finally { US.ai.media = keepMedia; D.routes.sound = keepSound; done(); }
});

test('the hearing check: a model that scores a silent clip from the transcript fails – its scores are never made, kept, shown or sent, and Listen now says why', async () => {
  project('Hearing check');
  const TL = tinyListener(), keepCalm = US.understand.calm;
  US.understand.calm = () => ({ ok: true, why: '' });
  // this “model” reads the transcript back: whatever the sound, it claims to hear the lines and scores them
  let R = fakeRoutes({ hearing: 'real', hear: () => ({ speech: true, text: CHECK_TEXT + ' ' + EVERYTHING }),
    listen: req => ({ lines: Array.from(req.user[0].matchAll(/^(\S+)\t[\d.]+–[\d.]+\t/gm)).map(m => ({ id: m[1], audible: 'yes', score: 5, notes: ['clear', 'warm'], energy: 'medium', cleanStart: true, cleanEnd: true, confidence: 'sure', heard: [] })), missed: [] }) });
  try {
    D.setOn(true);
    assert.deepStrictEqual([D.plan().kind, D.hearing()], ['helper', {}], 'not checked yet');
    await assert.rejects(() => D.runAll(job, {}), e => /doesn’t seem to listen – it judged a silent clip from the transcript/.test(e.title) && /another listening model/.test(e.action) && /Cloud/.test(e.action));
    const h = D.hearing()['tiny-listen@1'];
    assert.ok(h && h.ok === false && /a silent clip: 5\/5 clear, warm/.test(h.detail), JSON.stringify(h));
    assert.strictEqual(R.calls.hear.length, 2, 'two short pieces: near-silence and a tone');
    assert.ok(R.calls.hear.every(q => q.user[1].media.seconds === 8) && R.calls.listen.every(q => /^h1\t/m.test(q.user[0])), 'only the made-up lines were ever sent – no interview was listened to');
    const kept = D.peek(D.interviews()[0].path);
    assert.ok(!kept || !kept.done, 'nothing is kept as listened to');
    assert.deepStrictEqual([D.plan().kind, D.plan().why, D.status().state, D.status().offers], ['none', 'deaf', 'deaf', ['settings', 'recheck']]);
    assert.ok(/doesn’t seem to listen/.test(D.status().text) && /Tiny Listener gave a delivery score to made-up lines over a silent clip/.test(D.status().note) && /none are kept, shown or sent/.test(D.status().note), JSON.stringify(D.status()));
    assert.strictEqual(await D.tick(), false, 'and the background doesn’t try');
    const n = R.calls.hear.length;
    await assert.rejects(() => D.runAll(job, {}), e => /doesn’t seem to listen/.test(e.title));
    assert.strictEqual(R.calls.hear.length, n, 'the check is kept per model and version: not run again');
    // scores an earlier version made with this model are not shown or sent either
    const iv = D.interviews()[0];
    US.cache.set('delivery', P.keyOf(iv.path), { v: D.VERSION, by: 'tiny-listen@1', label: 'Tiny Listener', where: 'local', langs: 'hebrew,yiddish', sig: P.sigOf(iv.lines), next: 1, total: 1, done: true, lines: { r1: { t: P.lineSig(iv.lines[0]), start: 1, end: 5, score: 5, notes: ['clear'], heard: [] } }, missed: [] });
    D.reset();
    assert.deepStrictEqual([D.active(), D.note('r1')], [false, '']);
    R.restore();
    // “Check again” (or another model): an honest one passes – on silence it hears nobody, so nothing is judged
    R = fakeRoutes({ hearing: 'real', hear: () => ({ speech: false, text: '' }) });
    D.forgetHearing();
    assert.deepStrictEqual([D.plan().kind, D.hearing()], ['helper', {}]);
    const ok = await D.ensureHearing(D.plan(), job);
    assert.deepStrictEqual([ok.ok, ok.detail, R.calls.hear.length, R.calls.listen.length, D.hearing()['tiny-listen@1'].ok], [true, '', 2, 0, true]);
    assert.deepStrictEqual([D.active(), D.note('r1')], [true, ' [delivery 5/5 – clear]'], 'a model that passes has its records used');
    // the cloud has no such check (it would cost money): it relies on “audible”, the notes and the silence gate
    assert.deepStrictEqual(await D.ensureHearing({ kind: 'cloud', id: 'cloud:x' }), { ok: true });
  } finally { US.understand.calm = keepCalm; R.restore(); TL.undo(); done(); }
});
