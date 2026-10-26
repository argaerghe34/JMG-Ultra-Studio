// Does setting Lumetri values change the rendered frame? How do Look index and applyLumetriPreset behave?
const path = require('path'), fs = require('fs');
const tmp = US.fsx.tempDir();
const seqs = await US.host.call('listSequences'); const s = seqs.find(x => x.name === 'Colour probe');
await US.host.call('openSequence', { seqId: s.id });
async function frameStats(tag) {
  const p = await US.host.call('exportFrame', { seqId: s.id, seconds: 2, outBase: path.join(tmp, 'lum-' + tag + '-' + Date.now()) });
  const img = new Image(); img.src = 'data:image/png;base64,' + fs.readFileSync(p).toString('base64'); await img.decode();
  const c = document.createElement('canvas'); c.width = 160; c.height = 90; const g = c.getContext('2d'); g.drawImage(img, 0, 0, 160, 90);
  const d = g.getImageData(0, 0, 160, 90).data; let r = 0, gg = 0, b = 0; const n = d.length / 4;
  for (let i = 0; i < d.length; i += 4) { r += d[i]; gg += d[i + 1]; b += d[i + 2]; }
  fs.unlinkSync(p); return [r / n, gg / n, b / n].map(x => +x.toFixed(1));
}
const setP = (idx, val) => US.host.rawEval(`(function(){ var s=UStudio.needSeq(${JSON.stringify(s.id)}); var ti=s.videoTracks[0].clips[0]; for (var c=0;c<ti.components.numItems;c++){ var cp=ti.components[c]; if (cp.displayName==='Lumetri Color'){ var pr=cp.properties[${idx}]; pr.setValue(${JSON.stringify(val)}, true); return pr.displayName + '=' + pr.getValue(); } } return 'no lumetri'; })()`);
const out = {};
out.base = await frameStats('base');
out.setTemp = await setP(14, 40); out.warm = await frameStats('warm');
out.setTemp0 = await setP(14, 0);
out.setExp = await setP(19, -1.5); out.dark = await frameStats('dark');
out.setExp0 = await setP(19, 0);
out.setLook = await setP(34, 5); out.look5 = await frameStats('look5');
out.lookAsset = await US.host.rawEval(`(function(){ var s=UStudio.needSeq(${JSON.stringify(s.id)}); var ti=s.videoTracks[0].clips[0]; for (var c=0;c<ti.components.numItems;c++){ var cp=ti.components[c]; if (cp.displayName==='Lumetri Color'){ return String(cp.properties[34].getValue()) + ' | ' + String(cp.properties[35].getValue()) + ' | asset len ' + String(cp.properties[129].getValue()).length; } } })()`);
out.setLook0 = await setP(34, 0);
// applyLumetriPreset: select the clip first
out.preset = await US.host.rawEval(`(function(){ try { var s=UStudio.needSeq(${JSON.stringify(s.id)}); var ti=s.videoTracks[0].clips[0]; ti.setSelected(true, true); var r = app.project.applyLumetriPreset('SL Blue Cold (Arri Alexa)'); var n=0; for (var c=0;c<ti.components.numItems;c++) if (ti.components[c].displayName==='Lumetri Color') n++; return 'apply=' + r + ' lumetriCount=' + n; } catch(e){ return 'ERR ' + e; } })()`);
out.afterPreset = await frameStats('preset');
return out;
