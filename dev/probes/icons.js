// Draws the panel icons (Premiere shows them in the Window › Extensions panel tab) and saves them to assets/.
const fs = require('fs'), path = require('path'), dir = path.join(US.host.extensionDir(), 'assets');
function draw(size, dark) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d');
  const r = size * 0.22;
  const grad = g.createLinearGradient(0, 0, size, size); grad.addColorStop(0, '#7c6cf0'); grad.addColorStop(1, '#c45cff');
  g.fillStyle = grad;
  g.beginPath(); g.moveTo(r, 0); g.arcTo(size, 0, size, size, r); g.arcTo(size, size, 0, size, r); g.arcTo(0, size, 0, 0, r); g.arcTo(0, 0, size, 0, r); g.fill();
  g.fillStyle = '#fff'; g.font = `800 ${Math.round(size * 0.46)}px -apple-system, system-ui, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('JU', size / 2, size * 0.54);
  return c;
}
async function save(c, name) { const b = await new Promise(r => c.toBlob(r, 'image/png')); fs.writeFileSync(path.join(dir, name), Buffer.from(await b.arrayBuffer())); }
fs.mkdirSync(dir, { recursive: true });
await save(draw(23), 'icon-dark.png');
await save(draw(46), 'icon-dark@2x.png');
await save(draw(256), 'icon-256.png');
return fs.readdirSync(dir);
