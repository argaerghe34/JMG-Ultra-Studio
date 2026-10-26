// Opens each tool in turn and saves a screenshot of the panel (uses CDP from Node, so this only opens tools and waits).
const ids = JSON.parse(require('fs').readFileSync(require('path').join(US.host.extensionDir(), 'dev/probes/shots.json'), 'utf8'));
window.__shotQueue = ids.slice();
window.__shotNext = async () => { const id = window.__shotQueue.shift(); if (!id) return null; US.tools.open(id); document.querySelector('.view').scrollTop = 0; await new Promise(r => setTimeout(r, 900)); return id; };
return ids.length;
