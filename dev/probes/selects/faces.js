// Which chat images contain a face FaceDetector can find? (for synthetic interview test clips)
const fs = require('fs');
const dir = '/Users/jgersch/Downloads/WhatsApp Chat with Tab/';
const files = fs.readdirSync(dir).filter(f => /^IMG-.*\.jpg$/.test(f));
const fd = new FaceDetector({ fastMode: false, maxDetectedFaces: 5 });
const out = [];
for (const f of files) {
  const img = new Image(); img.src = US.vision.fileUrl(dir + f);
  try { await img.decode(); } catch (e) { continue; }
  const faces = await fd.detect(img);
  if (faces.length) out.push(`${f} ${img.naturalWidth}x${img.naturalHeight} faces=${faces.length} ` + faces.map(x => `[${Math.round(x.boundingBox.x)},${Math.round(x.boundingBox.y)},${Math.round(x.boundingBox.width)}x${Math.round(x.boundingBox.height)}]`).join(' '));
}
return out;
