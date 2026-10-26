// Development: (re)load Story + Assistant into the running panel without reloading the page.
const fs = require('fs'), path = require('path');
const dir = US.host.extensionDir();
for (const f of ['js/core/transcript.js', 'js/tools/22-story-ai.js', 'js/tools/22-story-board.js', 'js/tools/22-story-export.js', 'js/tools/22-story-moments.js', 'js/tools/22-story-narrative.js', 'js/tools/22-story-timeline.js', 'js/tools/22-story.js', 'js/tools/40-assistant.js']) (0, eval)(fs.readFileSync(path.join(dir, f), 'utf8'));
for (const c of ['story.css', 'assistant.css']) {
  document.querySelectorAll(`link[data-dev="${c}"]`).forEach(l => l.remove());
  const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = 'css/tools/' + c + '?' + Date.now(); l.dataset.dev = c; document.head.appendChild(l);
}
const src = fs.readFileSync(path.join(dir, 'jsx/tools/story.jsx'), 'utf8');
const r = await US.host.rawEval('try {\n' + src + '\n;"ok"} catch (e) { "ERR " + e.toString() + " line " + (e.line - 1); }', 20000);
return { jsx: r, story: !!US.tools.get('story'), assistant: !!US.tools.get('assistant'), actions: US.actions.list().length };
