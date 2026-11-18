// What's in the footage, in words: small stills in an AI request (how each AI receives them, what the record of what
// was sent keeps, what they cost) – refused for Claude and Gemini until the editor switches it on for the project, and
// never for a project kept on this computer; when to look at a clip; the description tidied, kept per file and
// searched; who looks; and the optional models for this computer – listed, downloaded only on a yes, removed.
const assert = require('assert'), http = require('http'), fs = require('fs'), os = require('os'), path = require('path');
const { load, test } = require('./harness');
global.addEventListener = global.addEventListener || (() => {});
const US = load(['transcript', 'ai', 'js/tools/14-footage.js', 'js/tools/01-overnight.js']);
const F = US.footage, job = { set() { return job; }, progress() { return job; }, busy() { return job; }, check() {}, log() {} };
const CTX0 = US.ctx;   // other tests share this process: the project these tests pretend is open is put back each time
const STILL = { image: { data: 'QUJD', mime: 'image/jpeg', w: 512, h: 288, note: 'DJI_001.MP4 at 0:08' } };
function server(handler) { return new Promise(res => { const s = http.createServer((req, rs) => { let b = ''; req.on('data', c => { b += c; }); req.on('end', () => handler(req, b ? JSON.parse(b) : null, rs)); }); s.listen(0, '127.0.0.1', () => res(s)); }); }
const tmpClip = name => { const p = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'us-look-')), name); fs.writeFileSync(p, 'x'); return p; };

test('a still in a request: as Claude receives it, as the record keeps it (a line, not the picture), and what it costs', () => {
  const S = US.ai._stills;
  assert.deepStrictEqual(S.toContent(['Clip:', STILL]), [{ type: 'text', text: 'Clip:' }, { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'QUJD' } }]);
  const parts = S.partsOf({ system: 'sys', user: ['Clip:', STILL] });
  assert.deepStrictEqual(parts.map(p => p.text), ['sys', 'Clip:', '[still: DJI_001.MP4 at 0:08 – 512×288; the picture itself isn’t kept here]']);
  assert.ok(!JSON.stringify(parts).includes('QUJD'), 'the picture isn’t in the record');
  assert.strictEqual(US.ai.imageTokens({ w: 512, h: 288 }), 19 * 11);
  const plain = US.ai.estimate({ system: 's', user: ['Clip:'], maxTokens: 500 }), withStill = US.ai.estimate({ system: 's', user: ['Clip:', STILL, STILL], maxTokens: 500 });
  assert.ok(Math.abs(withStill.inputTokens - plain.inputTokens - 2 * 209) <= 1, 'each still adds its tokens to the estimate');
});

test('stills leave this computer only when switched on for the project – never for a project kept here; a model on this computer may always look', async () => {
  const seen = [];
  const s = await server((req, body, rs) => { seen.push([req.method, req.url, body]); rs.setHeader('content-type', 'application/json'); rs.end(JSON.stringify({ choices: [{ message: { content: '{"description":"A river."}' } }], usage: { prompt_tokens: 300, completion_tokens: 10 } })); });
  US.settings.set('ai.localUrl', `http://localhost:${s.address().port}`);
  US.ctx = { project: { name: 'Bakery film', path: '/p/bakery.prproj' } };
  US.secrets.set('anthropicKey', 'sk-test'); US.settings.set('aiProvider', 'claude');
  try {
    assert.strictEqual(US.ai.stillsOn(), false, 'off until switched on');
    await assert.rejects(() => US.ai.json({ system: 's', user: ['Clip:', STILL], feature: 'Describe footage' }), e => /aren’t allowed to leave this computer/.test(e.title) && /Settings › AI › Footage/.test(e.action));
    assert.strictEqual(seen.length, 0, 'nothing was sent anywhere');
    // a model on this computer: allowed, and it gets the picture as a data URL, with the model named for footage
    const r = await US.ai.json({ system: 's', user: ['Clip:', STILL], schema: { type: 'object' }, feature: 'Describe footage', use: { provider: 'local', model: 'qwen3.5:4b' } });
    assert.deepStrictEqual(r, { description: 'A river.' });
    const post = seen.find(x => x[0] === 'POST')[2];
    assert.strictEqual(post.model, 'qwen3.5:4b');
    assert.deepStrictEqual(post.messages[1].content, [{ type: 'text', text: 'Clip:' }, { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,QUJD' } }]);
    const logged = US.ai.sent.list()[0];
    assert.ok(logged.provider === 'local' && !JSON.stringify(logged).includes('QUJD'));
    // switched on for this project only
    US.ai.setStills(true);
    assert.strictEqual(US.ai.stillsOn(), true);
    US.ctx = { project: { name: 'Other film', path: '/p/other.prproj' } };
    assert.strictEqual(US.ai.stillsOn(), false, 'another project is still off');
    US.ctx = { project: { name: 'Bakery film', path: '/p/bakery.prproj' } };
    US.ai.setProjectOffline(true);
    assert.strictEqual(US.ai.stillsOn(), false, '“nothing leaves this computer” wins');
    US.ai.setProjectOffline(false); US.ai.setStills(false);
  } finally { s.close(); US.secrets.set('anthropicKey', ''); US.settings.set('aiProvider', 'auto'); US.ctx = CTX0; }
});

test('when to look: one still for a short clip, up to four spread over a long one; the request names each still; the answer tidied', () => {
  assert.deepStrictEqual([0, 5, 20, 90, 600].map(d => F.timesFor(d)), [[0], [2], [5, 15], [15, 45, 75], [75, 225, 375, 525]]);
  assert.deepStrictEqual(F.timesFor(600, 2), [150, 450]);
  const req = F.request({ name: 'DJI_001.MP4', duration: 20 }, [{ t: 5, data: 'QQ==', w: 512, h: 288 }, { t: 15, data: 'Qg==', w: 512, h: 288 }]);
  assert.strictEqual(req.user[0], 'Clip, 0:20 long. 2 stills, at 0:05, 0:15:');
  assert.deepStrictEqual(req.user.slice(1).map(b => b.image.note), ['DJI_001.MP4 at 0:05', 'DJI_001.MP4 at 0:15']);
  assert.ok(!/DJI_001/.test(req.user[0]) && /never guess names/.test(req.system) && req.feature === 'Describe footage');
  const d = F.tidy({ description: '  A drone shot\nover a river. ', shot: 'spaceship', setting: 'a valley', people: 3, action: '', text: '', tags: ['River', 'river', ' Sunset ', '', 'x'.repeat(40)] });
  assert.deepStrictEqual(d, { description: 'A drone shot over a river.', shot: 'other', setting: 'a valley', people: '', action: '', text: '', tags: ['river', 'sunset'] });
});

test('finding clips by what they show: stems and close words like Story’s search; nothing described is nothing found; the cost to describe', () => {
  const rows = [
    { item: { name: 'DJI_001.MP4' }, look: { description: 'A drone shot flying over a wide river at sunset.', shot: 'aerial', setting: 'a river valley', people: 'no one', action: '', text: '', tags: ['water', 'sunset'] } },
    { item: { name: 'A001.MP4' }, look: { description: 'A baker kneads dough on a floury table.', shot: 'close-up', setting: 'a bakery kitchen', people: 'one woman', action: 'kneading', text: 'COHEN’S BAKERY', tags: ['bread', 'hands'] } },
    { item: { name: 'A002.MP4' }, look: null }];
  assert.deepStrictEqual(F.find(rows, 'rivers').map(r => r.item.name), ['DJI_001.MP4']);
  assert.deepStrictEqual(F.find(rows, 'baking bread').map(r => r.item.name), ['A001.MP4']);
  assert.deepStrictEqual(F.find(rows, 'cohen').map(r => r.item.name), ['A001.MP4'], 'writing in the picture counts');
  assert.deepStrictEqual(F.find(rows, '').map(r => r.item.name), ['DJI_001.MP4', 'A001.MP4'], 'no query: everything described');
  assert.deepStrictEqual(F.find(rows, 'helicopter'), []);
  assert.ok(/^A001\.MP4\tclose-up\tA baker kneads dough/.test(F.rowOf(rows[1].item, rows[1].look)) && /text: COHEN’S BAKERY/.test(F.rowOf(rows[1].item, rows[1].look)));
  const haiku = F.costFor(1000, 2, 'claude-haiku-5-5'), opus = F.costFor(1000, 2, 'claude-opus-5-5');
  assert.ok(haiku > 0.05 && haiku < 0.5 && opus > 4 && opus < 12, `1,000 clips: Haiku ${haiku}, Opus ${opus}`);
});

test('who looks: the cheapest model that does it well, the one chosen, a model on this computer – and only that for a project kept here', () => {
  US.ctx = { project: { name: 'Bakery film', path: '/p/bakery.prproj' } };
  for (const k of ['footage.with', 'footage.model', 'footage.localModel']) US.settings.set(k, undefined);
  try {
    assert.strictEqual(F.looker().where, 'none', 'no key, no model');
    US.secrets.set('anthropicKey', 'sk-test');
    assert.deepStrictEqual([F.looker().where, F.looker().use], ['cloud', 'claude:claude-haiku-5-5']);
    assert.throws(() => F.mustBeAllowed(), e => /aren’t allowed to leave/.test(e.title), 'not until it’s switched on for the project');
    US.ai.setStills(true); assert.strictEqual(F.mustBeAllowed().where, 'cloud');
    US.settings.set('footage.model', 'claude:claude-sonnet-5-5'); assert.strictEqual(F.looker().label, 'Claude Sonnet 5.5');
    US.settings.set('footage.with', 'local');
    assert.ok(F.looker().where === 'none' && F.looker().needsModel, 'this computer chosen, no model yet');
    US.settings.set('footage.localModel', 'qwen3.5:4b');
    assert.deepStrictEqual([F.looker().where, F.looker().use], ['local', { provider: 'local', model: 'qwen3.5:4b' }]);
    US.settings.set('footage.with', 'cloud'); US.ai.setProjectOffline(true);
    assert.strictEqual(F.looker().where, 'local', 'a project kept on this computer never uses Claude or Gemini');
  } finally { US.ai.setProjectOffline(false); US.ai.setStills(false); US.secrets.set('anthropicKey', ''); for (const k of ['footage.with', 'footage.model', 'footage.localModel']) US.settings.set(k, undefined); US.ctx = CTX0; }
});

test('describing: each clip once, kept per file; unreadable clips listed (no Media Encoder); not allowed is said plainly; Overnight prep has the step', async () => {
  US.ctx = { project: { name: 'Bakery film', path: '/p/bakery.prproj' } };
  const a = tmpClip('DJI_001.MP4'), b = tmpClip('A001.MOV'), c = tmpClip('A002.MP4');
  const items = [{ id: '1', name: 'DJI_001.MP4', kind: 'video', path: a, duration: 20, bin: 'Drone' }, { id: '2', name: 'A001.MOV', kind: 'video', path: b, duration: 5, bin: 'Day 1' }, { id: '3', name: 'A002.MP4', kind: 'video', path: c, duration: 5, bin: 'Day 1' },
    { id: '4', name: 'Music.wav', kind: 'audio', path: '/m/Music.wav' }, { id: '5', name: 'Gone.mp4', kind: 'video', path: '/m/Gone.mp4', offline: true }, { id: '6', name: 'Cut', kind: 'sequence' }, { id: '7', name: 'Copy.mp4', kind: 'video', path: a, bin: 'JMG Ultra Studio/Selects' }];
  assert.deepStrictEqual(F.describable(items).map(i => i.name), ['DJI_001.MP4', 'A001.MOV', 'A002.MP4'], 'video that is online; not sound, sequences, offline media or Ultra Studio’s own bins');
  const was = { grab: F.grab, ai: US.ai }, sent = [], grabbed = [];
  F.grab = async (it, times) => { grabbed.push([it.name, times]); return it.name === 'A001.MOV' ? { stills: [], why: 'needs a copy' } : { stills: times.map(t => ({ t, data: 'QUJD', w: 512, h: 288 })), how: 'panel' }; };
  US.secrets.set('anthropicKey', 'sk-test');
  US.ai = Object.assign({}, was.ai, { json: async req => { sent.push(req); if (req.onUsage) req.onUsage({ usd: 0.001 }); return { description: `What ${req.user[1].image.note.split(' at ')[0]} shows.`, shot: 'wide', setting: '', people: '', action: '', text: '', tags: ['test'] }; } });
  try {
    await assert.rejects(() => F.describe(job, items), e => /aren’t allowed to leave this computer/.test(e.title));
    assert.strictEqual(grabbed.length, 0, 'no stills were taken');
    US.ai.setStills(true);
    const r = await F.describe(job, items);
    assert.deepStrictEqual([r.described, r.already, r.skipped, r.failed], [2, 0, [{ name: 'A001.MOV', why: 'needs a copy' }], 0]);
    assert.ok(/2 clips described by Claude Haiku 5\.5 · 1 couldn’t be read \(1 need a copy – Overnight prep’s Selects step makes them\)/.test(r.summary), r.summary);
    assert.deepStrictEqual(grabbed.find(g => g[0] === 'DJI_001.MP4')[1], [5, 15]);
    assert.ok(sent.every(q => q.use === 'claude:claude-haiku-5-5' && q.feature === 'Describe footage'));
    assert.strictEqual(F.lookOf(items[0]).description, 'What DJI_001.MP4 shows.');
    assert.strictEqual(F.lookOf(items[0]).by, 'Claude Haiku 5.5');
    assert.strictEqual(F.lookOf(items[1]), null);
    // again: nothing new to send
    const n = sent.length, r2 = await F.describe(job, items);
    assert.deepStrictEqual([r2.described, r2.already, sent.length - n], [0, 2, 0]);
    // the file changes: described again
    fs.writeFileSync(c, 'changed, longer');
    assert.strictEqual(F.lookOf(items[2]), null);
    assert.ok(US.overnight.STEPS.some(s => s.id === 'look' && /No Media Encoder/.test(s.hint)) && typeof US.overnight.RUNNERS.look === 'function');
    assert.ok(!US.overnight.settings().steps.includes('look'), 'not ticked unless the editor ticks it');
    assert.deepStrictEqual(US.actions.get('footage.describe').match('describe my footage'), { bin: '', _score: 2.2 });
    assert.strictEqual(US.actions.get('footage.describe').match('look at the footage in the Drone bin').bin, 'Drone');
    assert.strictEqual(US.actions.get('footage.describe').match('find the best shots in my footage'), null);
  } finally { F.grab = was.grab; US.ai = was.ai; US.ai.setStills(false); US.secrets.set('anthropicKey', ''); US.ctx = CTX0; }
});

test('models for this computer: nothing downloads by itself – asked first with what it is for and its size; downloaded with progress; listed; removed', async () => {
  const seen = [], have = ['llama3.2'];
  const s = await server((req, body, rs) => {
    seen.push([req.method, req.url, body]);
    rs.setHeader('content-type', 'application/json');
    if (req.url === '/api/tags') return rs.end(JSON.stringify({ models: have.map(name => ({ name })) }));
    if (req.url === '/v1/models') return rs.end(JSON.stringify({ data: have.map(id => ({ id })) }));
    if (req.url === '/api/pull') { have.push(body.model); return rs.end(['{"status":"pulling manifest"}', '{"status":"downloading","completed":1700000000,"total":3400000000}', '{"status":"success"}'].join('\n') + '\n'); }
    if (req.url === '/api/delete') { have.splice(have.indexOf(body.model), 1); return rs.end('{}'); }
    rs.statusCode = 404; rs.end('{}');
  });
  US.settings.set('ai.localUrl', `http://localhost:${s.address().port}`);
  US.ctx = { project: { name: 'Bakery film', path: '/p/bakery.prproj' } };
  for (const k of ['footage.with', 'footage.model', 'footage.localModel']) US.settings.set(k, undefined);
  const wasModal = US.ui.modal, asked = [];
  try {
    assert.ok(F.MODELS.every(m => m.what && m.where && m.size && m.needs), 'each says what it is for, where it is used and how big it is');
    assert.deepStrictEqual(await F.modelStatus(), { running: true, kind: 'ollama', installed: ['llama3.2'] });
    US.settings.set('footage.with', 'local');
    // no → nothing is downloaded
    US.ui.modal = async o => { asked.push(o.title); return false; };
    await assert.rejects(() => F.ready(job), e => e.code === 'CANCELLED');
    assert.deepStrictEqual(asked, ['Download Qwen 3.5 (4B)?']);
    assert.ok(!seen.some(x => x[1] === '/api/pull'), 'not without a yes');
    // unattended (Overnight prep): never asks, says what to do
    await assert.rejects(() => F.ready(job, { ask: false }), e => /isn’t downloaded/.test(e.title) && /Models on this computer: press Download/.test(e.action));
    // yes → downloaded, with progress, and chosen for footage
    const progress = [];
    US.ui.modal = async () => true;
    assert.strictEqual(await F.ready({ set() { return this; }, busy() { return this; }, check() {}, progress(f, m) { progress.push([f, m]); return this; } }), true);
    assert.deepStrictEqual(seen.find(x => x[1] === '/api/pull')[2], { model: 'qwen3.5:4b', stream: true });
    assert.deepStrictEqual(progress, [[0.5, 'Downloading Qwen 3.5 (4B) · 1.7 of 3.4 GB']]);
    assert.deepStrictEqual([F.visionModel(), F.looker().where], ['qwen3.5:4b', 'local']);
    assert.strictEqual(await F.ready(job), true, 'there now: nothing more to ask');
    await US.ai.removeLocal('qwen3.5:4b');
    assert.deepStrictEqual((await F.modelStatus()).installed, ['llama3.2']);
  } finally { s.close(); US.ui.modal = wasModal; for (const k of ['footage.with', 'footage.model', 'footage.localModel']) US.settings.set(k, undefined); }
  // Ollama not running: no download, a plain message
  US.settings.set('ai.localUrl', 'http://localhost:9');
  try { await assert.rejects(() => F.download('qwen3.5:4b', job), e => /Ollama isn’t running/.test(e.title) && /ollama\.com/.test(e.action)); } finally { US.settings.set('ai.localUrl', US.ai.LOCAL_URL); US.ctx = CTX0; }
});
