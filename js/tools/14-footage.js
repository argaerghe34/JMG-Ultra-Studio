/* JMG Ultra Studio – what's in the footage, in words. A few small stills of each clip (one for a short clip, up to
   four for a long one) are shown to an AI that writes a line or two and some tags: the kind of shot, where it is, who
   and what is in it, what happens, any writing in the picture. The words are kept per file, so each clip is described
   once – then Ask (and anything else) can find “the drone shots over water” by reading text.

   Who looks is the editor's choice: Claude or Gemini (small stills leave the computer – only when that is switched on
   for the project), or a model on this computer (nothing leaves; an optional download, never made by default).
   Stills are grabbed inside the panel, or with ffmpeg when it is installed; in Resolve, a clip neither can read has
   its stills saved by Resolve itself (exportFrame on a temporary timeline). Media Encoder is never started for this:
   a clip that can't be read is left out and listed, for Overnight prep's Selects step to make a copy of.

   Pure logic first (unit-tested), then grabbing stills, describing and the actions. No screen of its own: Settings ›
   AI has the choices, Overnight prep has the step, Ask has the tools. */
(function () {
  'use strict';
  const US = window.US;
  const VERSION = 1;   // bump when what a description holds changes (the cache starts again)
  const clip = (s, n) => { s = String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n) + '…' : s; };
  const fmtT = s => { s = Math.max(0, +s || 0); const m = Math.floor(s / 60), ss = Math.round(s - m * 60); return `${m}:${ss < 10 ? '0' : ''}${ss}`; };
  const IMAGE = /\.(png|jpe?g|tiff?|bmp|gif|webp|heic)$/i;

  /* ---------- the optional models for this computer (Settings › AI › Models on this computer) ---------- */
  // Nothing here is downloaded unless the editor presses Download (or says yes when a feature asks).
  const MODELS = [
    { id: 'qwen3.5:4b', name: 'Qwen 3.5 (4B)', size: '3.4 GB', needs: 'about 8 GB of memory', use: 'vision', best: true,
      what: 'Looks at stills of your footage and describes them, on this computer.',
      where: 'Describe the footage (Overnight prep, or “describe my footage” in Ask) and Ask’s “look at this clip” – when you choose “A model on this computer” to do the looking. Not needed if Claude or Gemini describe your footage.' },
    { id: 'minicpm-v4.6:1b', name: 'MiniCPM-V 4.6 (1B)', size: '1.6 GB', needs: 'about 4 GB of memory', use: 'vision',
      what: 'A smaller, quicker model for describing stills – for a computer with little memory. Its descriptions are plainer.',
      where: 'The same places as the one above, instead of it.' },
    { id: 'gemma4:e4b', name: 'Gemma 4 (E4B)', size: '9.6 GB', needs: '16 GB of memory or more', use: 'vision',
      what: 'A larger model for describing stills: better at reading writing in the picture, slower.',
      where: 'The same places, on a strong computer.' }
  ];
  const visionModel = () => String(US.settings.get('footage.localModel', '') || '').trim();

  /* ---------- pure pieces ---------- */
  /** When to look at a clip `seconds` long: one still for a short clip, more for a longer one (at most `max`). */
  function timesFor(seconds, max = 4) {
    const d = Math.max(0, +seconds || 0);
    if (!(d > 0)) return [0];
    const n = Math.max(1, Math.min(max, d < 8 ? 1 : d < 40 ? 2 : d < 180 ? 3 : 4));
    return n === 1 ? [Math.round(d * 0.4 * 100) / 100] : Array.from({ length: n }, (_, i) => Math.round(d * (i + 0.5) / n * 100) / 100);
  }
  const SHOTS = ['wide', 'medium', 'close-up', 'detail', 'aerial', 'interview', 'screen or graphic', 'other'];
  const SCHEMA = {
    type: 'object', additionalProperties: false, required: ['description', 'shot', 'setting', 'people', 'action', 'text', 'tags'],
    properties: { description: { type: 'string' }, shot: { type: 'string', enum: SHOTS }, setting: { type: 'string' }, people: { type: 'string' }, action: { type: 'string' }, text: { type: 'string' }, tags: { type: 'array', items: { type: 'string' } } }
  };
  const SYSTEM = 'You describe footage for a documentary and charity-film editor, from a few small stills of ONE clip (in time order). Say only what the stills show – never guess names, places or events that aren’t visible. ' +
    '"description": one or two plain sentences an editor could search for (what and who is in the shot, where, what happens across the stills). "shot": the kind of shot. "setting": where it is, in a few words (“a bakery kitchen”, “a beach at dusk”) or "". ' +
    '"people": who is seen, in a few words (“two women in aprons”, “a child”, “no one”). "action": what happens, or "". "text": any writing clearly readable in the picture (signs, captions, a slate), else "". ' +
    '"tags": 4–10 short lower-case search words (things, places, colours, weather, mood, time of day). British English.';
  /** The request for one clip: what it is in words, then its stills. */
  function request(item, stills) {
    const user = [`Clip, ${item.duration ? fmtT(item.duration) + ' long' : 'a still image'}. ${stills.length === 1 ? 'One still' : stills.length + ' stills'}${stills.length > 1 ? ', at ' + stills.map(s => fmtT(s.t)).join(', ') : ''}:`];
    for (const s of stills) user.push({ image: { data: s.data, mime: 'image/jpeg', w: s.w, h: s.h, note: `${item.name || 'clip'} at ${fmtT(s.t)}` } });
    return { system: SYSTEM, user, schema: SCHEMA, maxTokens: 700, effort: 'low', feature: 'Describe footage' };
  }
  /** The AI's answer, tidied. */
  function tidy(r) {
    const str = (x, n) => clip(typeof x === 'string' ? x : '', n);
    return { description: str(r && r.description, 400), shot: SHOTS.includes(r && r.shot) ? r.shot : 'other', setting: str(r && r.setting, 80), people: str(r && r.people, 80), action: str(r && r.action, 120), text: str(r && r.text, 160),
      tags: Array.from(new Set((Array.isArray(r && r.tags) ? r.tags : []).map(t => String(t).toLowerCase().trim()).filter(t => t && t.length <= 30))).slice(0, 12) };
  }
  /** Everything searchable about a clip, as one line of text. */
  const textOf = (item, d) => [item.name, d.description, d.shot, d.setting, d.people, d.action, d.text, (d.tags || []).join(' ')].filter(Boolean).join('. ');
  /**
   * Find clips by what's in them. rows: [{item, look}] (look = a description or null) -> the matching rows, best first.
   * Words are matched the way Story's search matches lines (stems and close words); no query = everything described.
   */
  function find(rows, query, { limit = 40 } = {}) {
    const have = rows.filter(r => r.look);
    if (!String(query || '').trim()) return have.slice(0, limit);
    const lines = have.map((r, i) => ({ id: 'f' + i, text: textOf(r.item, r.look), row: r }));
    const hits = US.transcript && US.transcript.search ? US.transcript.search(String(query), lines, { limit }) : [];
    if (hits.length) return hits.map(h => h.line.row);
    const words = String(query).toLowerCase().split(/\W+/).filter(w => w.length > 2);
    return lines.filter(l => words.some(w => l.text.toLowerCase().includes(w))).slice(0, limit).map(l => l.row);
  }
  /** One row for the AI or a list: name, kind of shot, what's in it. */
  const rowOf = (item, d) => [item.name, d.shot, d.description, d.setting, d.people, d.text ? `text: ${d.text}` : '', (d.tags || []).join(', ')].map(x => clip(x, 220)).join('\t');
  /** Roughly what describing `clips` clips will cost with a Claude model (stills in, a few lines out). */
  function costFor(clips, stillsEach = 2, model = null) {
    const m = US.ai && US.ai.MODELS && US.ai.MODELS[model || (US.ai.claudeModel && US.ai.claudeModel())];
    if (!m) return 0;
    const still = US.ai.imageTokens ? US.ai.imageTokens({ w: 512, h: 288 }) : 200;
    return clips * ((stillsEach * still + 320) * m.in + 190 * m.out) / 1e6;
  }

  /* ---------- who looks ---------- */
  /**
   * The AI that looks at stills, from Settings › AI › Footage: 'cloud' (the cheapest good one the editor has a key for,
   * or the one they chose) or 'local' (the vision model on this computer). A project kept on this computer is always local.
   * -> {where: 'cloud'|'local'|'none', use (for US.ai.json), label, why (when 'none')}
   */
  function looker() {
    const ai = US.ai;
    if (!ai) return { where: 'none', why: 'AI isn’t available.' };
    const want = ai.projectOffline && ai.projectOffline() ? 'local' : US.settings.get('footage.with', 'cloud');
    // one choice for looking on this computer (Settings › Vision & listening models): Ultra Studio's own model in its
    // helper, or the editor's own in Ollama / LM Studio
    const mine = US.models && US.models.jobs ? US.models.jobs().look : '';
    const own = /^us:/.test(mine) && US.models.runtime.installed() ? US.models.get(mine.slice(3)) : null;
    if (want === 'local' && own) return { where: 'local', helper: own.id, use: { provider: 'local', model: own.id }, label: `${own.name} (on this computer)` };
    if (want === 'local') {
      const m = visionModel();
      return m ? { where: 'local', use: { provider: 'local', model: m }, label: `${m} (on this computer)` } : { where: 'none', needsModel: true, why: 'No model for looking at footage is chosen on this computer yet.' };
    }
    const cs = (ai.choices ? ai.choices() : []).filter(c => c.provider === 'claude' || c.provider === 'gemini');
    if (!cs.length) return visionModel() ? { where: 'local', use: { provider: 'local', model: visionModel() }, label: `${visionModel()} (on this computer)` } : { where: 'none', why: 'There’s no Claude or Gemini key, and no model for looking at footage on this computer.' };
    const chosen = cs.find(c => c.id === US.settings.get('footage.model', ''));
    // describing is simple work: the cheapest model does it well
    const pick = chosen || cs.find(c => /haiku/.test(c.model)) || cs.find(c => c.provider === 'gemini' && /lite/.test(c.model)) || cs[0];
    return { where: 'cloud', use: pick.id, label: pick.label, model: pick.model, provider: pick.provider };
  }
  /** Can stills be looked at right now? Throws a plain message saying what to switch on when not. */
  function mustBeAllowed(L = looker()) {
    if (L.where === 'none') throw new US.UserError('AI_KEY', { title: L.why || 'Nothing is set up to look at footage.', action: 'Settings › AI › Footage: choose Claude or Gemini, or download a model for this computer.' });
    if (L.where === 'cloud' && !US.ai.stillsOn()) throw new US.UserError('AI_FAILED', { title: 'Stills from this project aren’t allowed to leave this computer.', action: 'Settings › AI › Footage: switch on “Small stills may be sent” for this project – or choose a model on this computer, and nothing leaves.' });
    return L;
  }

  /** Ask whoever looks: Ultra Studio's own model through its helper, else the AI named by L.use (US.ai.json enforces the stills switch). */
  async function lookAI(L, req, job) {
    if (!L.helper) return US.ai.json(Object.assign({}, req, { use: L.use }));
    const url = await US.models.start(L.helper, { job: job && job.busy ? job : null });
    try { return await US.ai.localAt(Object.assign({}, req, { url, model: L.helper, maxTokens: Math.max(req.maxTokens || 0, 1200) })); } finally { US.models.touch(); }
  }

  /* ---------- models on this computer: only ever downloaded when the editor says so ---------- */
  const sameModel = (a, b) => String(a).toLowerCase() === String(b).toLowerCase() || String(a).toLowerCase() === String(b).toLowerCase() + ':latest';
  /** Which of the optional models are on this computer: {running, kind, installed: [names]} */
  async function modelStatus() {
    const st = await US.ai.localStatus();
    return { running: st.ok, kind: st.kind, installed: st.ok ? await US.ai.localModels() : [] };
  }
  /** Download a model with Ollama, as a job with its progress. Chosen for footage when none is yet. */
  async function download(id, job) {
    const st = await US.ai.localStatus();
    if (!st.ok) throw new US.UserError('AI_FAILED', { title: 'Ollama isn’t running on this computer.', action: 'Models on this computer run in Ollama, a free app: get it from ollama.com, open it once, then press Download again.' });
    if (st.kind !== 'ollama') throw new US.UserError('AI_FAILED', { title: 'This needs Ollama.', action: 'LM Studio downloads models in its own window – get the model there, then choose it in Settings › AI › Footage. With Ollama (ollama.com), Ultra Studio downloads it for you.' });
    const m = MODELS.find(x => x.id === id) || { id, name: id, size: '' };
    job && job.set({ who: 'computer', msg: `Downloading ${m.name}${m.size ? ` (${m.size})` : ''}` });
    const p = US.ai.pullLocal(id, x => { if (job) { if (job.cancelled) p.cancel(); else if (x.total) job.progress(x.done / x.total, `Downloading ${m.name} · ${(x.done / 1e9).toFixed(1)} of ${(x.total / 1e9).toFixed(1)} GB`); else job.busy(`${m.name}: ${x.status || 'getting ready'}`); } });
    await p;
    if (!visionModel()) US.settings.set('footage.localModel', id);
    return { summary: `${m.name} is on this computer${m.size ? ` (${m.size})` : ''}` };
  }
  /**
   * Before looking with a model on this computer: is it there? If not, ask – say what it is for and how big – and
   * download it only on a yes. -> true when ready; throws (plainly) when the editor says no or it can't be had.
   */
  async function ready(job, { ask = true } = {}) {
    let L = looker();
    if (L.where === 'cloud' || L.helper) return true;   // Ultra Studio's own model is on disk already, and needs no Ollama
    const st = await modelStatus();
    const id = L.where === 'local' ? L.use.model : (MODELS.find(m => m.best) || MODELS[0]).id;
    if (L.where === 'local' && st.running && st.installed.some(x => sameModel(x, id))) return true;
    const m = MODELS.find(x => x.id === id) || { id, name: id, size: 'a few GB', what: 'Looks at stills of your footage and describes them, on this computer.' };
    if (!ask || !US.ui || !US.ui.modal) throw new US.UserError('AI_FAILED', { title: `The model for looking at footage on this computer (${m.name}) isn’t downloaded.`, action: 'Settings › AI › Models on this computer: press Download – or choose Claude or Gemini to look at footage.' });
    if (!st.running) {
      const go = await US.ui.modal({ title: 'Looking at footage on this computer needs Ollama', body: US.h('div', US.h('p', 'Ollama is a free app that runs AI models on your own computer, so nothing leaves it. It isn’t running here (or isn’t installed).'), US.h('p.field-hint', 'Get it from ollama.com, open it once, then try again. Or let Claude or Gemini look at your footage instead (Settings › AI › Footage).')),
        buttons: [{ label: 'Not now', value: '', kind: 'ghost' }, { label: 'Open Settings', value: 'settings' }, { label: 'Open ollama.com', value: 'site', kind: 'primary' }] });
      if (go === 'site') US.host.openUrl && US.host.openUrl('https://ollama.com/download');
      if (go === 'settings') US.tools.open('settings', { section: 'footage' });
      throw new US.UserError('CANCELLED', { title: 'Nothing was looked at.', action: 'Start Ollama, or choose Claude or Gemini in Settings › AI › Footage.' });
    }
    const yes = await US.ui.modal({ title: `Download ${m.name}?`, body: US.h('div', US.h('p', `${m.what} It isn’t on this computer yet.`), US.h('p', `It is a ${m.size} download${m.needs ? ` and wants ${m.needs}` : ''}. It stays on this computer until you remove it (Settings › AI › Models on this computer).`), US.h('p.field-hint', 'Nothing is downloaded unless you say so here.')),
      buttons: [{ label: 'Not now', value: false, kind: 'ghost' }, { label: `Download (${m.size})`, value: true, kind: 'primary' }] });
    if (!yes) throw new US.UserError('CANCELLED', { title: 'Nothing was downloaded or looked at.' });
    await download(id, job);
    US.settings.set('footage.localModel', id); US.settings.set('footage.with', 'local');
    return true;
  }

  /* ---------- grabbing stills (in the panel, else ffmpeg; never Media Encoder) ---------- */
  let ffmpegPath;
  function ffmpeg() {
    if (ffmpegPath !== undefined) return ffmpegPath;
    if (US.audio && US.audio.ffmpeg) return (ffmpegPath = US.audio.ffmpeg());   // one search, shared with the sound tools
    const fs = require('fs'), cp = require('child_process');
    const env = process.env, path = require('path');
    // Windows: the usual hand-made folders, then winget, Chocolatey and Scoop (Premiere's PATH is the one it started with)
    const tries = process.platform === 'win32' ? ['C:\\ffmpeg\\bin\\ffmpeg.exe', 'C:\\Program Files\\ffmpeg\\bin\\ffmpeg.exe',
      env.LOCALAPPDATA && path.join(env.LOCALAPPDATA, 'Microsoft', 'WinGet', 'Links', 'ffmpeg.exe'),
      path.join(env.ProgramData || 'C:\\ProgramData', 'chocolatey', 'bin', 'ffmpeg.exe'),
      env.USERPROFILE && path.join(env.USERPROFILE, 'scoop', 'shims', 'ffmpeg.exe')].filter(Boolean) : ['/opt/homebrew/bin/ffmpeg', '/usr/local/bin/ffmpeg', '/usr/bin/ffmpeg'];
    ffmpegPath = tries.find(p => { try { return fs.existsSync(p); } catch (e) { return false; } }) || '';
    if (!ffmpegPath) { try { const out = cp.execFileSync(process.platform === 'win32' ? 'where' : 'which', ['ffmpeg'], { encoding: 'utf8', timeout: 4000, windowsHide: true }).split(/\r?\n/)[0].trim(); if (out && fs.existsSync(out)) ffmpegPath = out; } catch (e) { /* not installed */ } }
    return ffmpegPath;
  }
  function viaFfmpeg(file, t, width) {
    return new Promise(resolve => {
      const bin = ffmpeg(); if (!bin) return resolve(null);
      const args = ['-v', 'error', '-ss', String(Math.max(0, t)), '-i', file, '-frames:v', '1', '-vf', `scale=${width}:-2`, '-q:v', '6', '-f', 'image2pipe', '-vcodec', 'mjpeg', '-'];
      require('child_process').execFile(bin, args, { encoding: 'buffer', maxBuffer: 8 * 1024 * 1024, timeout: 20000, windowsHide: true }, (err, out) => resolve(!err && out && out.length > 500 ? out : null));
    });
  }
  function drawSmall(el, sw, sh, width) {
    const w = Math.min(width, sw || width), hgt = Math.max(2, Math.round(w * (sh || 9) / (sw || 16)));
    const cv = document.createElement('canvas'); cv.width = w; cv.height = hgt;
    cv.getContext('2d').drawImage(el, 0, 0, w, hgt);
    return { data: cv.toDataURL('image/jpeg', 0.72).split(',')[1], w, h: hgt };
  }
  /**
   * A few small stills of one clip. -> {stills:[{t, data (base64 JPEG), w, h}], how: 'panel'|'ffmpeg'|'image'} or
   * {stills: [], why} when it can't be read here (offline, or a format that needs a copy – Media Encoder isn't started).
   */
  async function grab(item, times, { width = 512 } = {}) {
    const fs = require('fs'), V = US.vision;
    if (!item.path || item.offline || !fs.existsSync(item.path)) return { stills: [], why: 'offline' };
    if (IMAGE.test(item.path)) {
      try {
        const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('image')); i.src = V.fileUrl(item.path); });
        return { stills: [Object.assign({ t: 0 }, drawSmall(img, img.naturalWidth, img.naturalHeight, width))], how: 'image' };
      } catch (e) { const b = await viaFfmpeg(item.path, 0, width); return b ? { stills: [{ t: 0, data: b.toString('base64'), w: width, h: Math.round(width * 9 / 16) }], how: 'ffmpeg' } : { stills: [], why: 'can’t be read' }; }
    }
    const src = await V.pickSource(item);
    if (src.ok) {
      let v = null;
      try {
        v = await V.openVideo(src.file);
        const out = [];
        for (const t of times) { await V.seek(v, t); out.push(Object.assign({ t }, drawSmall(v, v.videoWidth, v.videoHeight, width))); }
        return { stills: out, how: 'panel' };
      } catch (e) { /* try ffmpeg below */ } finally { if (v) V.closeVideo(v); }
    }
    if (ffmpeg()) {
      const out = [];
      for (const t of times) { const b = await viaFfmpeg(item.path, t, width); if (b) out.push({ t, data: b.toString('base64'), w: width, h: Math.round(width * 9 / 16) }); }
      if (out.length) return { stills: out, how: 'ffmpeg' };
    }
    // Resolve can always show its own clips: it saves the stills (on a temporary timeline, put back after)
    if (US.app.is('resolve') && item.id) {
      const out = await viaResolve(item, times, width);
      if (out.length) return { stills: out, how: 'resolve' };
    }
    return { stills: [], why: 'needs a copy' };
  }
  /** Stills saved by Resolve (exportFrame with a clip id), made small here; the PNGs are deleted after. */
  async function viaResolve(item, times, width) {
    const fs = require('fs'), path = require('path'), out = [];
    let files = [];
    try { files = await US.host.call('exportFrame', { id: item.id, times, outBase: path.join(US.fsx.tempDir(), 'look-' + US.fsx.hash(item.id + '|' + Date.now())) }); }
    catch (e) { US.log('info', 'Resolve couldn’t save stills of ' + item.name, String(e && (e.detail || e.message) || e)); return out; }
    for (let i = 0; i < times.length; i++) {
      const f = files && files[i];
      if (!f) continue;
      try {
        const img = await new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => rej(new Error('image')); im.src = US.vision.fileUrl(f); });
        out.push(Object.assign({ t: times[i] }, drawSmall(img, img.naturalWidth, img.naturalHeight, width)));
      } catch (e) { /* that one's missing */ } finally { try { fs.unlinkSync(f); } catch (e) { /* gone */ } }
    }
    return out;
  }

  /* ---------- describing, kept per file ---------- */
  const keyOf = item => US.fsx.mediaKey(item.path || item.id) + '-v' + VERSION;
  /** What's known about a clip (or null): {description, shot, setting, people, action, text, tags, by, at} */
  function lookOf(item) {
    let d = null;
    try { d = item && item.path ? US.cache.get('look', keyOf(item)) : null; } catch (e) { d = null; }
    return d || fromUnderstanding(item);
  }
  /** The same shape from US.understand's record (shots over time, things seen and heard), when that has looked at the clip. */
  function fromUnderstanding(item) {
    const U = US.understand; if (!U || !U.peek || !item || !item.path) return null;
    let r = null; try { r = U.peek(item.path); } catch (e) { r = null; }
    if (!r || r.fromLook || !((r.shots || []).length || (r.sounds || []).some(s => s.type !== 'silence'))) return null;
    const heard = Array.from(new Set((r.sounds || []).filter(s => s.type !== 'silence').map(s => U.SOUND_WORDS[s.type] || s.type)));
    const seen = (r.events || []).slice(0, 5).map(e => e.text);
    return { description: clip([r.summary, heard.length ? 'Heard: ' + heard.join(', ') + '.' : ''].filter(Boolean).join(' '), 400), shot: SHOTS.includes(r.shot) ? r.shot : 'other', setting: r.setting || '', people: r.people || '', action: clip(seen.join('; '), 120), text: '',
      tags: Array.from(new Set((r.tags || []).concat(heard))).slice(0, 12), by: (r.vision && r.vision.label) || 'Built-in listening', at: r.at || 0, understood: true };
  }
  /** The clips worth describing: video and stills that are online – not sequences, sound, or Ultra Studio's own bins. */
  const describable = items => (items || []).filter(it => it && (it.kind === 'video' || it.kind === 'still' || IMAGE.test(it.path || '')) && it.path && !it.offline && !/^JMG Ultra Studio\b/.test(it.bin || ''));
  /** The clips in a bin (or the whole project), as the host lists them. */
  async function listClips(job, { binId = null } = {}) {
    job && job.set && job.set({ who: 'premiere', msg: 'Listing the footage' });
    const id = binId || ((await US.host.call('listBins'))[0] || {}).id;
    return id ? (await US.host.call('binItems', { binId: id, recursive: true })).filter(it => it && it.kind !== 'bin') : [];
  }
  /**
   * Describe clips that aren't described yet (force: all of them again). One request per clip; cloud models take a few
   * at once, a local model one at a time. -> {summary, described, already, skipped:[{name, why}], failed, usd, by}
   */
  async function describe(job, items, { force = false, perClip = +US.settings.get('footage.stills', 4), onClip = null, ask: mayAsk = true } = {}) {
    if (looker().where !== 'cloud') await ready(job, { ask: mayAsk });
    const L = mustBeAllowed(), todo = [], already = [];
    // a clip US.understand has only listened to still wants looking at
    for (const it of describable(items)) { const d = !force && lookOf(it); (d && !(d.understood && !d.description.replace(/Heard:.*$/, '').trim()) ? already : todo).push(it); }
    const skipped = [], out = { described: 0, failed: 0, usd: 0 };
    let next = 0, firstError = null;
    const worker = async () => {
      while (next < todo.length) {
        job && job.check && job.check();
        const it = todo[next++];
        job && job.set && job.set({ who: L.where === 'local' ? 'computer' : 'ai', msg: `Looking at ${it.name}` });
        job && job.progress && job.progress((out.described + out.failed + skipped.length) / todo.length, `${out.described + out.failed + skipped.length + 1} of ${todo.length}: ${it.name}`);
        const g = await US.footage.grab(it, timesFor(it.duration, perClip));
        if (!g.stills.length) { skipped.push({ name: it.name, why: g.why }); continue; }
        try {
          const r = await lookAI(L, Object.assign(request(it, g.stills), { onUsage: u => { out.usd += u.usd || 0; } }), job);
          const d = Object.assign(tidy(r), { by: L.label, at: Date.now(), stills: g.stills.length });
          US.cache.set('look', keyOf(it), d);
          out.described++;
          if (onClip) onClip(it, d);
        } catch (e) {
          if (e instanceof US.UserError && e.code === 'CANCELLED') throw e;
          out.failed++; firstError = firstError || e;
          // the limit, no key, no connection: the rest would fail the same way
          const x = US.errors && US.errors.explain ? US.errors.explain(e) : { title: String(e) };
          if (/limit|key|reach|answer|allowed/i.test(x.title) && out.failed >= 2 && !out.described) { next = todo.length; }
        }
      }
    };
    await Promise.all(Array.from({ length: L.where === 'local' ? 1 : 3 }, worker));
    if (!out.described && firstError && todo.length) throw firstError;
    const needCopy = skipped.filter(s => s.why === 'needs a copy').length;
    const bits = [`${US.plural(out.described, 'clip')} described by ${L.label}`];
    if (already.length) bits.push(`${already.length} already done`);
    if (skipped.length) bits.push(`${skipped.length} couldn’t be read${needCopy ? ` (${needCopy} need a copy – Overnight prep’s Selects step makes them)` : ''}`);
    if (out.failed) bits.push(`${out.failed} didn’t work`);
    if (out.usd > 0.004) bits.push(`about ${US.ai.fmtUSD(out.usd)}`);
    return Object.assign(out, { summary: bits.join(' · '), already: already.length, skipped, by: L.label, where: L.where });
  }
  /**
   * Look at particular clips with a question (“is the logo visible?”, “which of these is sharpest on the faces?”).
   * -> {answer, stills, skipped, by, usd}
   */
  async function ask(job, items, question, { perClip = 2 } = {}) {
    if (looker().where !== 'cloud') await ready(job);
    const L = mustBeAllowed(), user = [`The editor asks about ${items.length === 1 ? 'this clip' : 'these clips'}: “${String(question).trim()}”\nThe stills follow, each after a line saying which clip and time it is.`], skipped = [];
    let n = 0, usd = 0;
    for (const it of items.slice(0, 8)) {
      job && job.check && job.check();
      job && job.set && job.set({ who: 'computer', msg: `Taking stills of ${it.name}` });
      const g = await US.footage.grab(it, timesFor(it.duration, Math.max(1, Math.min(4, perClip))), { width: 768 });
      if (!g.stills.length) { skipped.push({ name: it.name, why: g.why }); continue; }
      for (const s of g.stills) { user.push(`“${it.name}” at ${fmtT(s.t)}:`); user.push({ image: { data: s.data, mime: 'image/jpeg', w: s.w, h: s.h, note: `${it.name} at ${fmtT(s.t)}` } }); n++; }
    }
    if (!n) throw new US.UserError('NOTHING_FOUND', { title: 'None of those clips could be read for stills.', action: skipped.some(s => s.why === 'needs a copy') ? 'They need a small copy first: Overnight prep’s Selects step makes them (or create proxies).' : 'Check the clips are online.' });
    job && job.set && job.set({ who: L.where === 'local' ? 'computer' : 'ai', msg: `${L.label} is looking at ${US.plural(n, 'still')}` });
    const r = await lookAI(L, { system: 'You look at small stills from a video editor’s clips and answer their question from what the stills show. Be specific and brief; name the clip you mean. Say when a still doesn’t show enough to tell. Never guess names or places that aren’t visible. British English.',
      user, schema: { type: 'object', additionalProperties: false, required: ['answer'], properties: { answer: { type: 'string' } } }, maxTokens: 1200, effort: 'low', feature: 'Look at footage', onUsage: u => { usd += u.usd || 0; } }, job);
    return { answer: String((r && r.answer) || '').trim(), stills: n, skipped, by: L.label, where: L.where, usd };
  }

  /* ---------- actions (Ask's built-in commands, Overnight prep, recipes) ---------- */
  US.actions.register({
    id: 'footage.describe', tool: 'assistant', title: 'Describe the footage', changes: false,
    describe: 'Looks at a few small stills of each clip not yet described and writes what is in it (kind of shot, setting, people, action, writing in the picture, tags), so clips can be found by what they show. Kept per file: each clip is done once. Stills go to the AI chosen in Settings › AI › Footage – Claude or Gemini (only when that is switched on for the project) or a model on this computer.',
    params: { bin: { type: 'string', default: '', desc: 'A bin’s name or path; empty for the whole project' }, again: { type: 'boolean', default: false, desc: 'Describe clips again that are already described' } },
    examples: ['describe my footage', 'look at the footage in the Drone bin'],
    match: t => (/\b(describe|look at|look through|analyse|analyze|index|catalogue|log)\b.*\b(footage|clips|shots|b-?roll|rushes)\b/i.test(t) && !/\binterview|\bselects?\b|\bbest\b/i.test(t) ? { bin: (/\b(?:in|from) (?:the |my )?(.+?) bin\b/i.exec(t) || [])[1] || '', _score: 2.2 } : null),
    run: async (p, job) => {
      let binId = null;
      if (p.bin) { const w = String(p.bin).toLowerCase(), bins = (await US.host.call('listBins')).filter(b => b.path !== '(Project root)'), hit = bins.find(b => b.path.toLowerCase() === w || b.path.split('/').pop().trim().toLowerCase() === w) || bins.find(b => b.path.toLowerCase().includes(w)); if (!hit) throw new US.UserError('NOTHING_FOUND', { title: `There’s no bin called “${p.bin}”.` }); binId = hit.id; }
      const items = describable(await listClips(job, { binId }));
      if (!items.length) throw new US.UserError('NOTHING_FOUND', { title: 'There’s no footage here to describe.' });
      return describe(job, items, { force: !!p.again });
    }
  });

  US.footage = { VERSION, MODELS, SHOTS, SCHEMA, visionModel, modelStatus, download, ready, timesFor, request, tidy, textOf, find, rowOf, costFor, looker, mustBeAllowed, ffmpeg, grab, lookOf, describable, listClips, describe, ask };
})();
