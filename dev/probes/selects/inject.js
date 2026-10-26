// Hot-loads the Selects files into the running panel (no page reload, so other builders aren't disturbed).
const fs = require('fs');
const ROOT = '/Users/jgersch/Downloads/WhatsApp Chat with Tab/JMG Ultra Studio/';
eval(fs.readFileSync(ROOT + 'js/core/vision.js', 'utf8'));
const jsx = fs.readFileSync(ROOT + 'jsx/tools/selects.jsx', 'utf8');
const r = await US.host.rawEval('try {\n' + jsx + '\n;"ok"} catch (e) { "ERR " + e.toString() + " line " + (e.line - 1); }', 20000);
if (r !== 'ok') return 'jsx failed: ' + r;
if (!document.querySelector('link[href^="css/tools/selects.css"]')) { const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = 'css/tools/selects.css?' + Date.now(); document.head.appendChild(l); }
else document.querySelector('link[href^="css/tools/selects.css"]').href = 'css/tools/selects.css?' + Date.now();
eval(fs.readFileSync(ROOT + 'js/tools/10-selects.js', 'utf8'));
return { ok: true, tools: US.tools.list().map(t => t.id), fns: (await US.host.call('listFns')).filter(f => /selects/.test(f)) };
