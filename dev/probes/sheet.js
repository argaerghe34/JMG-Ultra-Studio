const S = '/private/tmp/claude-501/-Users-jgersch-Downloads-WhatsApp-Chat-with-Tab/dfdca15a-57c0-4de5-9767-1734b1f0ead1/scratchpad';
const ids = ['home','selects','songs','silence','beats','story','sound','assistant','settings'];
const fs = require('fs');
const cols = 3, w = 460, hgt = 820, sc = 0.62;
const c = document.createElement('canvas'); c.width = Math.round(cols * w * sc); c.height = Math.round(Math.ceil(ids.length / cols) * hgt * sc);
const g = c.getContext('2d'); g.fillStyle = '#000'; g.fillRect(0, 0, c.width, c.height);
for (let i = 0; i < ids.length; i++) {
  const img = new Image(); img.src = 'data:image/png;base64,' + fs.readFileSync(S + '/ui-' + ids[i] + '.png').toString('base64'); await img.decode();
  g.drawImage(img, (i % cols) * w * sc, Math.floor(i / cols) * hgt * sc, w * sc, hgt * sc);
}
const b = await new Promise(r => c.toBlob(r, 'image/png')); fs.writeFileSync(S + '/ui-sheet.png', Buffer.from(await b.arrayBuffer()));
return [c.width, c.height];
