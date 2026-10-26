window.__hotFiles = ['js/tools/32-check.js'];
const fs = require('fs'), path = require('path'); (0, eval)(fs.readFileSync(path.join(US.host.extensionDir(), 'js/tools/32-check.js'), 'utf8'));
await US.actions.run('check.run', {});
await new Promise(r => setTimeout(r, 500));
return US.log.entries().slice(-2).map(e => e.text);
