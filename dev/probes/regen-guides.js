const path = require('path'), fs = require('fs');
const dir = path.join(require('os').homedir(), 'Library/Application Support/JMG Ultra Studio/guides');
fs.mkdirSync(dir, { recursive: true });
const want = [['Ultra Guide 9x16 Shorts 1080x1920', { crops: ['9x16'], apps: ['shorts'] }], ['Ultra Guide 9x16+1x1 TikTok+Reels 1080x1920', { crops: ['9x16', '1x1'], apps: ['tiktok', 'reels'] }], ['Ultra Guide 9x16+4x5 TikTok 1080x1920', { crops: ['9x16', '4x5'], apps: ['tiktok'] }]];
for (const [name, o] of want) {
  const c = US.safezones.render(1080, 1920, Object.assign({ titleSafe: false, dim: 0.45, style: 'detailed' }, o));
  const b = await new Promise(r => c.toBlob(r, 'image/png'));
  fs.writeFileSync(path.join(dir, name + '.png'), Buffer.from(await b.arrayBuffer()));
}
return fs.readdirSync(dir);
