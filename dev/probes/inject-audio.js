// Hot-loads the sound tools into the running panel (development only; no page reload).
const fs = require('fs'), path = require('path');
const root = '/Users/jgersch/Downloads/WhatsApp Chat with Tab/JMG Ultra Studio';
const out = [];
for (const f of ['js/core/dsp.js', 'js/tools/11-audio-kit.js', 'js/tools/12-songs.js', 'js/tools/20-silence.js', 'js/tools/21-beats.js', 'js/tools/31-sound.js']) {
  try { (0, eval)(fs.readFileSync(path.join(root, f), 'utf8')); out.push('ok ' + f); } catch (e) { out.push('ERR ' + f + ': ' + e.message); }
}
const src = fs.readFileSync(path.join(root, 'jsx/tools/audio.jsx'), 'utf8');
out.push('jsx: ' + await US.host.rawEval('try {\n' + src + '\n;"ok"} catch (e) { "ERR " + e.toString() + " line " + (e.line - 1); }', 20000));
if (!document.querySelector('link[href*="tools/audio.css"]')) { const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = 'css/tools/audio.css?' + Date.now(); document.head.appendChild(l); }
out.push('tools: ' + US.tools.list().map(t => t.id).join(','));
return out;
