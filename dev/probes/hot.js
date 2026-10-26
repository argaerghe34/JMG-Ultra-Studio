// Hot-load files into the running panel without a page reload: node dev/cep.js 8890 js dev/probes/hot.js
// Set window.__hot = ['js/tools/30-safezones.js', 'jsx/tools/finish.jsx'] first, or edit FILES below.
const FILES = JSON.parse(require('fs').readFileSync(require('path').join(US.host.extensionDir(), 'dev/probes/hot.json'), 'utf8'));
const fs = require('fs'), path = require('path'), dir = US.host.extensionDir();
const out = [];
for (const f of FILES) {
  const src = fs.readFileSync(path.join(dir, f), 'utf8');
  if (f.endsWith('.jsx')) {
    const r = await US.host.rawEval('try {\n' + src + '\n;"ok"} catch (e) { "ERR " + e.toString() + " line " + (e.line - 1); }', 30000);
    out.push(f + ': ' + r);
  } else {
    try { (0, eval)(src); out.push(f + ': ok'); } catch (e) { out.push(f + ': ' + e.stack); }
  }
}
return out;
