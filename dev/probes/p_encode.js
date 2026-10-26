window.__usEnc = [];
window.__adobe_cep__.addEventListener('com.jmgphotography.ultrastudio.encoder', e => window.__usEnc.push(e.data));
const r = await US.host.rawEval(require('fs').readFileSync(require('path').join(US.host.extensionDir(), 'dev/probes/p_encode.jsx'), 'utf8'), 120000);
const t0 = Date.now();
while (Date.now() - t0 < 150000 && !window.__usEnc.some(x => x.kind === 'complete' || x.kind === 'error')) await new Promise(res => setTimeout(res, 1000));
return { r, secs: (Date.now() - t0) / 1000, events: window.__usEnc.filter((x, i, a) => x.kind !== 'progress' || i % 5 === 0 || i === a.length - 1) };
