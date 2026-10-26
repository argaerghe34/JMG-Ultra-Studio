window.__usTestEvents = [];
window.__adobe_cep__.addEventListener('com.jmgphotography.ultrastudio.test', e => window.__usTestEvents.push(e.data));
const r = await US.host.rawEval(require('fs').readFileSync(require('path').join(US.host.extensionDir(), 'dev/probes/p_reframe.jsx'), 'utf8'), 300000);
await new Promise(res => setTimeout(res, 500));
return { r, events: window.__usTestEvents };
