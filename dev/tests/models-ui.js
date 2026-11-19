// Headless check that Settings names every model on this computer once (jsdom, a stand-in Premiere, a stand-in Ollama
// with qwen3.5:4b and llama3.2, and Ultra Studio's own Gemma 4 E2B as if downloaded): one list, one picker per job,
// the Footage card with the permission only, and the AI card using the same “Reading and writing” picker.
// Run on its own (node dev/tests/models-ui.js) or through understand.test.js. Prints JSON on the last line.
const http = require('http'), fs = require('fs'), os = require('os'), path = require('path'), crypto = require('crypto');
const srv = http.createServer((req, rs) => { let b = ''; req.on('data', c => { b += c; }); req.on('end', () => {
  rs.setHeader('content-type', 'application/json');
  const CAPS = { 'qwen3.5:4b': ['completion', 'vision'], 'llama3.2:latest': ['completion'] };
  if (req.url === '/api/tags') return rs.end(JSON.stringify({ models: Object.keys(CAPS).map(name => ({ name })) }));
  if (req.url === '/v1/models') return rs.end(JSON.stringify({ data: Object.keys(CAPS).map(id => ({ id })) }));
  if (req.url === '/api/show') return rs.end(JSON.stringify({ capabilities: CAPS[JSON.parse(b).model] || [] }));
  rs.end('{}');
}); });
srv.listen(0, '127.0.0.1', async () => {
  const { w, US, $$, tick, boot, errors } = require('./panel-dom');
  const out = { errors };
  try {
    await boot();
    const M = US.models;
    // Ultra Studio's own Gemma 4 E2B, as if downloaded: a list that checks out, with files a few bytes long
    const f = (name, body) => ({ role: /mmproj/.test(name) ? 'mmproj' : 'model', name, url: 'https://huggingface.co/x/y/resolve/main/' + name, bytes: Buffer.byteLength(body), sha256: crypto.createHash('sha256').update(body).digest('hex'), body });
    const files = [f('g.gguf', 'model'), f('mmproj-g.gguf', 'proj')];
    US.settings.set('understand.modelsDir', fs.mkdtempSync(path.join(os.tmpdir(), 'us-models-')));
    US.settings.set('understand.manifest', { version: 5, runtime: { id: 'llama-server', version: 't1', builds: { [M.platformKey()]: { name: 'h.tar.gz', url: 'https://github.com/x/h.tar.gz', bytes: 3, sha256: 'a'.repeat(64), exe: 'bin/llama-server' } } },
      models: [{ id: 'gemma-4-e2b', name: 'Gemma 4 E2B', use: ['vision', 'listening'], version: '1', licence: 'Apache-2.0', source: 'https://huggingface.co/x/y', memory: 'about 4.5 GB', what: 'test', files: files.map(x => ({ role: x.role, name: x.name, url: x.url, bytes: x.bytes, sha256: x.sha256 })) },
        { id: 'smolvlm2-500m', name: 'SmolVLM2 500M', use: ['vision'], version: '1', licence: 'Apache-2.0', source: 'https://huggingface.co/x/z', memory: 'about 1 GB', what: 'test', files: [{ role: 'model', name: 's.gguf', url: 'https://huggingface.co/x/z/resolve/main/s.gguf', bytes: 436808704, sha256: 'b'.repeat(64) }] }] });
    const m = M.get('gemma-4-e2b'); fs.mkdirSync(M.modelDir(m), { recursive: true }); for (const x of files) fs.writeFileSync(path.join(M.modelDir(m), x.name), x.body);
    const exe = path.join(M.runtime.info().dir, 'bin', 'llama-server'); fs.mkdirSync(path.dirname(exe), { recursive: true }); fs.writeFileSync(exe, '#!');
    // the editor's own Qwen, chosen for story work and for looking – as it was in 1.3.40, where it showed twice
    US.settings.set('ai.localUrl', 'http://127.0.0.1:' + srv.address().port);
    US.settings.set('ai.localModel', 'qwen3.5:4b'); US.settings.set('footage.localModel', 'qwen3.5:4b'); US.settings.set('footage.with', 'local');
    US.tools.open('settings'); await tick();
    for (let i = 0; i < 40; i++) { await new Promise(r => setTimeout(r, 50)); if ($$('.und-here [data-model]').length >= 3) break; }
    const set = w.document.querySelector('.tool:not(.hidden)') || w.document.body;
    const sectionOf = n => { const s = n.closest('[data-section]'); return s ? s.dataset.section : ''; };
    // every <select>: how many of its options name each model
    out.selects = $$('select', set).map(sel => { const labels = Array.from(sel.options).map(o => o.textContent); const n = re => labels.filter(l => re.test(l)).length; return { section: sectionOf(sel), job: (sel.closest('[data-job]') || { dataset: {} }).dataset.job || '', qwen: n(/qwen/i), gemma: n(/gemma/i), llama: n(/llama3/i), chosen: sel.options[sel.selectedIndex] ? sel.options[sel.selectedIndex].textContent : '' }; }).filter(x => x.qwen || x.gemma || x.llama);
    // rows that name a model, anywhere in Settings
    out.rows = $$('.list-row', set).map(r => ({ section: sectionOf(r), title: (r.querySelector('.list-title') || {}).textContent || '' })).filter(r => /qwen|gemma|llama3|smolvlm/i.test(r.title));
    const und = set.querySelector('.settings-extra [data-section="understand"]'), ft = set.querySelector('[data-section="footage"]'), ai = set.querySelector('[data-section="ai"]');
    out.jobs = $$('.und-job-name', und).map(x => x.firstChild.textContent);
    out.explains = { why: /that is why you may have more than one model/.test(und.textContent), ways: /Downloaded by Ultra Studio/.test(und.textContent) && /Your own, from Ollama or LM Studio/.test(und.textContent), two: /Only the one chosen in that job’s picker is used\. Nothing runs twice/.test(und.textContent), app: /Ollama is running on this computer/.test(und.textContent) };
    out.buttons = { here: $$('.und-here button', und).map(b => b.textContent.trim()), more: $$('.und-more button', und).map(b => b.textContent.trim()) };
    out.footage = { link: $$('button', ft).some(b => /Choose the model that looks: Models on this computer/.test(b.textContent)), downloads: $$('button', ft).filter(b => /^Download|^Remove|Use this one/.test(b.textContent.trim())).length, permission: /small stills may be sent to Claude or Gemini/.test(ft.textContent), who: /Who looks at the stills/.test(ft.textContent) };
    out.aiCard = { label: /Model for reading and writing/.test(ai.textContent), points: /chosen in Settings › Vision & listening models › Models on this computer/.test(ai.textContent), offline: /nothing leaves this computer/.test(ai.textContent), address: /Address/.test(ai.textContent), find: $$('button', ai).some(b => b.textContent.trim() === 'Find models') };
    // choosing in one place shows in the other: the AI card's picker and the section's are the same setting
    const aiSel = $$('select', ai).find(s => Array.from(s.options).some(o => /llama3/.test(o.textContent)));
    aiSel.value = 'llama3.2:latest'; aiSel.dispatchEvent(new w.Event('change')); await tick(); await new Promise(r => setTimeout(r, 200));
    const undText = set.querySelector('.settings-extra [data-section="understand"] [data-job="text"] select');
    out.oneSetting = { setting: US.settings.get('ai.localModel'), sectionShows: undText.options[undText.selectedIndex].textContent };
  } catch (e) { out.errors.push(String(e && e.stack || e)); }
  console.log(JSON.stringify(out));
  process.exit(0);
});
