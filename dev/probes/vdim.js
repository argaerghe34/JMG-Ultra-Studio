const dir = '/Users/jgersch/Documents/JMG Ultra Studio/Exports/Me Deliver Test 2026-10-22';
const out = {};
for (const f of require('fs').readdirSync(dir).filter(f => f.endsWith('.mp4'))) {
  const v = document.createElement('video'); v.muted = true; v.src = 'file://' + (dir + '/' + f).split('/').map(encodeURIComponent).join('/');
  await new Promise(r => { v.onloadedmetadata = r; v.onerror = r; setTimeout(r, 4000); });
  out[f] = v.videoWidth + 'x' + v.videoHeight + ' ' + v.duration;
  v.removeAttribute('src'); v.load();
}
return out;
