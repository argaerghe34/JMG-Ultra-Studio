// Page-side only hot-load (for when Premiere is busy): vision engine, Selects screen and stylesheet.
const fs = require('fs');
const ROOT = '/Users/jgersch/Downloads/WhatsApp Chat with Tab/JMG Ultra Studio/';
eval(fs.readFileSync(ROOT + 'js/core/vision.js', 'utf8'));
const link = document.querySelector('link[href^="css/tools/selects.css"]');
if (link) link.href = 'css/tools/selects.css?' + Date.now(); else { const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = 'css/tools/selects.css?' + Date.now(); document.head.appendChild(l); }
eval(fs.readFileSync(ROOT + 'js/tools/10-selects.js', 'utf8'));
// fill results from the recorded fixture so the screen can be reviewed without Premiere
if (window.__selectsDemo) {
  const all = JSON.parse(fs.readFileSync(ROOT + 'dev/tests/fixtures/vision-clips.json', 'utf8'));
  US.selects.state.clips = all[0].clips.concat(all[1].clips);
  US.selects.state.sourceLabel = '“Test – Selects” bin';
  US.selects.rescore();
}
US.tools.open('selects');
return US.tools.list().map(t => t.id);
