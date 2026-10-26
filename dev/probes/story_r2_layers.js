// Real-Premiere check of storyThemeLayers: create the invisible label clip, place one per theme above the clips, name + length + colour.
const fs = require('fs'), path = require('path'), os = require('os');
const dir = US.host.extensionDir();
const src = fs.readFileSync(path.join(dir, 'jsx/tools/story.jsx'), 'utf8');
const load = await US.host.rawEval('try {\n' + src + '\n;"ok"} catch (e) { "ERR " + e.toString() + " line " + (e.line - 1); }', 20000);
// park the probe's stray "Transparent Video" so the creation path runs for real
const tidy = await US.host.rawEval(`(function(){ var n=0; UStudio.walk(app.project.rootItem, function(c){ if (c.type===1 && c.name==='Transparent Video') { c.name='Probe transparent'; c.moveBin(UStudio.ensureBin('Test – Story')); n++; } }); return n; })()`, 20000);
const media = fs.realpathSync(path.join(dir, 'dev/test-media/interview/I001_interview.mp4'));
const clip = (await US.host.call('storyClips', { paths: [media] })).find(c => !c.sub && c.bin === 'Test – Story');
const old = (await US.host.call('listSequences')).find(s => s.name === 'Test – Story layers');
if (old) await US.host.call('deleteSequence', { seqId: old.id });
const seq = await US.host.call('newSequence', { name: 'Test – Story layers', binPath: 'Test – Story', likeId: clip.id });
await US.host.call('storyPlace', { seqId: seq.id, cursor: 0, method: 'relabel', clips: [{ id: clip.id, in: 0, out: 4, label: 7 }, { id: clip.id, in: 30, out: 38, label: 5 }] });
const r = await US.host.call('storyThemeLayers', { seqId: seq.id, binPath: 'Test – Story', sections: [{ name: 'Family', start: 0, end: 4, label: 7 }, { name: 'Faith & tradition', start: 4, end: 12, label: 5 }] });
const info = await US.host.call('sequenceInfo', { seqId: seq.id });
const layer = info.video[r.track].clips.map(c => ({ name: c.name, start: +c.start.toFixed(3), end: +c.end.toFixed(3) }));
// second run reuses the label clip
const r2 = await US.host.call('storyThemeLayers', { seqId: seq.id, binPath: 'Test – Story', sections: [{ name: 'Again', start: 0, end: 4 }] });
const labelItems = await US.host.rawEval(`(function(){ var o=[]; UStudio.walk(app.project.rootItem, function(c){ if (c.type===1 && /theme label|Transparent/.test(c.name)) o.push(c.name+' @ '+UStudio.binPath(c)+' label '+c.getColorLabel()+' in/out '+c.getInPoint().seconds+'-'+c.getOutPoint().seconds); }); return o.join(' | '); })()`, 20000);
const xmlPath = path.join(os.tmpdir(), 'us-story-layers.xml');
await US.host.rawEval(`(function(){ var ss=app.project.sequences; for (var i=0;i<ss.numSequences;i++) if (ss[i].sequenceID==${JSON.stringify(seq.id)}) return String(ss[i].exportAsFinalCutProXML(${JSON.stringify(xmlPath)}, 1)); })()`, 60000);
const xml = fs.readFileSync(xmlPath, 'utf8');
const labels = []; xml.replace(/<clipitem id="[^"]*"[^>]*>([\s\S]*?)<\/clipitem>/g, (m, b) => { labels.push(((/<name>([^<]*)<\/name>/.exec(b) || [])[1]) + '=' + ((/<label2>([^<]*)<\/label2>/.exec(b) || [])[1] || '-')); return m; });
return { load, tidy, result: r, layer, reuse: r2.how, labelItems, labels: Array.from(new Set(labels)) };
