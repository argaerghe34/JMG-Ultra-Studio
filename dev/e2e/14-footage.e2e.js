// What's in the footage, in real Premiere (no AI cost: the AI's description is a stand-in; no model is downloaded).
// Two real clips: stills are taken inside the panel – small JPEGs, no Media Encoder – then each clip is described once,
// kept per file, found again by what it shows, and Ask's chat reads the descriptions. Sending stills to Claude or
// Gemini is refused until it is switched on for the project; the editor's own choices are put back afterwards.
const F = US.footage, C = US.chat; T.assert(F && C, 'footage and the chat are loaded');
const fs = require('fs');
const BIN = 'Test – Footage';
const items = await T.importOnce(['C001_sharp_static.mp4', 'C003_dark.mp4'].map(f => T.media('concert', f)), BIN);
const bins = await US.host.call('listBins'), bin = bins.find(b => b.path === BIN);
const clips = F.describable(await F.listClips(null, { binId: bin.id }));
T.assert(clips.length === 2 && clips.every(c => c.path && c.duration > 1), 'the two clips are listed with their files and lengths: ' + JSON.stringify(clips.map(c => [c.name, c.kind, c.duration])));
const encodersBefore = require('child_process').execSync(process.platform === 'win32' ? 'tasklist' : 'ps -axo comm').toString().split('\n').filter(l => /Media Encoder/i.test(l)).length;

// 1. stills, taken here
const g = await F.grab(clips[0], F.timesFor(clips[0].duration));
T.assert(g.stills.length === F.timesFor(clips[0].duration).length && g.stills.length >= 1, 'stills taken: ' + JSON.stringify({ n: g.stills.length, why: g.why, how: g.how }));
const jpg = Buffer.from(g.stills[0].data, 'base64');
T.assert(jpg[0] === 0xFF && jpg[1] === 0xD8 && jpg.length > 2000 && jpg.length < 200000, 'a small JPEG: ' + jpg.length + ' bytes');
T.assert(g.stills[0].w <= 512 && g.stills[0].h > 100 && g.stills[0].h < g.stills[0].w, 'no wider than 512 pixels: ' + g.stills[0].w + '×' + g.stills[0].h);
// a dark frame and a bright one aren't the same picture
const g2 = await F.grab(clips[1], [1]);
T.assert(g2.stills.length === 1 && g2.stills[0].data !== g.stills[0].data, 'each clip gives its own still');

// 2. describing: refused for Claude/Gemini until switched on; then once per clip, kept, found again
const keep = { ai: US.ai, with: US.settings.get('footage.with'), model: US.settings.get('footage.model'), stills: US.ai.stillsOn() };
const cacheFiles = clips.map(c => US.cache.file('look', US.fsx.mediaKey(c.path) + '-v' + F.VERSION));
const cacheWas = cacheFiles.map(f => (fs.existsSync(f) ? fs.readFileSync(f) : null));
cacheFiles.forEach(f => { try { fs.unlinkSync(f); } catch (e) { /* not there */ } });
const sent = [];
try {
  US.settings.set('footage.with', 'cloud');
  US.ai = Object.assign({}, keep.ai, { available: () => true, provider: () => 'claude', label: () => 'Claude', choices: () => [{ id: 'auto', provider: '', label: 'Automatic' }, { id: 'claude:claude-haiku-5-5', provider: 'claude', model: 'claude-haiku-5-5', label: 'Claude Haiku 5.5' }],
    json: async req => { sent.push(req); const name = req.user.find(b => b.image).image.note.split(' at ')[0]; return /C003/.test(name) ? { description: 'A dim stage with a few faint lights.', shot: 'wide', setting: 'a concert hall', people: 'no one clear', action: '', text: '', tags: ['dark', 'stage', 'lights'] } : { description: 'A band plays on a brightly lit stage.', shot: 'wide', setting: 'a concert hall', people: 'four musicians', action: 'playing', text: '', tags: ['band', 'stage', 'guitar'] }; } });
  US.ai.setStills(false);
  let refused = '';
  try { await F.describe(US.jobs.testJob('footage'), clips); } catch (e) { refused = e.title || e.message; }
  T.assert(/aren’t allowed to leave this computer/.test(refused) && sent.length === 0, 'refused until switched on for the project: ' + refused);
  US.ai.setStills(true);
  const r = await F.describe(US.jobs.testJob('footage'), clips);
  T.assert(r.described === 2 && !r.skipped.length && /2 clips described by Claude Haiku 5\.5/.test(r.summary), 'both described: ' + r.summary);
  T.assert(sent.length === 2 && sent.every(q => q.use === 'claude:claude-haiku-5-5' && q.user.filter(b => b.image).length >= 1 && q.user.filter(b => b.image).every(b => b.image.w <= 512)), 'one request a clip, small stills only');
  T.assert(!JSON.stringify(sent.map(q => q.user.filter(b => !b.image))).includes(clips[0].path), 'no file paths in the request');
  const again = await F.describe(US.jobs.testJob('footage'), clips);
  T.assert(again.described === 0 && again.already === 2 && sent.length === 2, 'each clip is described once: ' + again.summary);
  const found = F.find(clips.map(c => ({ item: c, look: F.lookOf(c) })), 'band on stage');
  T.assert(found.length >= 1 && /C001/.test(found[0].item.name), 'found by what it shows: ' + found.map(x => x.item.name));

  // 3. Ask's chat reads the descriptions (a stand-in for the AI's turns)
  const chat = C.newChat(), log = [];
  const script = [{ say: 'Looking.', understood: 'You want the dark shots.', plan: ['Find them'], tool: 'footage', argsJson: JSON.stringify({ query: 'dark stage', bin: BIN }) }, { say: '', understood: '', plan: [], tool: 'finish', argsJson: JSON.stringify({ reply: 'One dark shot.' }) }];
  const chatAI = US.ai; let turns = [];
  US.ai = Object.assign({}, chatAI, { json: async req => (req.feature === 'Ask' ? (turns.push(req), script.shift()) : chatAI.json(req)) });
  for (let i = 0; i < 100 && US.jobs.current; i++) await T.sleep(200);
  await C.send(chat, 'which shots are dark?', { event: it => log.push(it), status() {}, approve: async () => ({ ok: true }), choose: async () => null }, { mode: 'ask' });
  const result = turns[1].turns[0].user;
  T.assert(/C003_dark\.mp4\twide\tA dim stage/.test(result) && /^RESULT of footage:\n\d+ clips/.test(result), 'the chat was given the descriptions: ' + result.slice(0, 300));
  T.assert(log.some(i => i.k === 'end' && i.reply === 'One dark shot.') && !log.some(i => i.k === 'warn'), 'and reported');
} finally {
  US.ai = keep.ai; US.ai.setStills(keep.stills);
  US.settings.set('footage.with', keep.with); US.settings.set('footage.model', keep.model);
  cacheFiles.forEach((f, i) => { try { if (cacheWas[i]) fs.writeFileSync(f, cacheWas[i]); else fs.unlinkSync(f); } catch (e) { /* gone */ } });
}
const encodersAfter = require('child_process').execSync(process.platform === 'win32' ? 'tasklist' : 'ps -axo comm').toString().split('\n').filter(l => /Media Encoder/i.test(l)).length;
T.assert(encodersAfter <= encodersBefore, 'Media Encoder wasn’t started');
// 4. Settings has the Footage section, with the optional models and nothing ticked to download
US.tools.open('settings', { section: 'footage' });
await T.sleep(400);
const sec = document.querySelector('[data-section="footage"]');
T.assert(sec && /Models on this computer \(optional\)/.test(sec.textContent) && F.MODELS.every(m => sec.textContent.includes(m.name)), 'Settings › AI › Footage lists the optional models');
return { stills: g.stills.length, how: g.how, bytes: jpg.length, size: `${g.stills[0].w}×${g.stills[0].h}`, ffmpeg: !!F.ffmpeg() };
