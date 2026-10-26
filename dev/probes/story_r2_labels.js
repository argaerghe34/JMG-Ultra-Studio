// Real-Premiere check of colour approaches A (relabel) and B (subclips), track item rename/end, read back from FCP XML.
const fs = require('fs'), path = require('path'), os = require('os');
const dir = US.host.extensionDir();
const src = fs.readFileSync(path.join(dir, 'jsx/tools/story.jsx'), 'utf8');
const load = await US.host.rawEval('try {\n' + src + '\n;"ok"} catch (e) { "ERR " + e.toString() + " line " + (e.line - 1); }', 20000);
const real = p => fs.realpathSync(p);
const media = real(path.join(dir, 'dev/test-media/interview/I001_interview.mp4'));
let clips = await US.host.call('storyClips', { paths: [media] });
let clip = clips.find(c => !c.sub && c.bin === 'Test – Story');
if (!clip) { const r = await US.host.call('importFiles', { paths: [media], binPath: 'Test – Story' }); clip = r[0]; }
const info = await US.host.call('itemInfo', { id: clip.id });
const old = (await US.host.call('listSequences')).find(s => s.name === 'Test – Story colours');
if (old) await US.host.call('deleteSequence', { seqId: old.id });
const seq = await US.host.call('newSequence', { name: 'Test – Story colours', binPath: 'Test – Story', likeId: clip.id });
const a = await US.host.call('storyPlace', { seqId: seq.id, cursor: 0, method: 'relabel', clips: [{ id: clip.id, in: 1, out: 4, label: 7 }] });
const b = await US.host.call('storyPlace', { seqId: seq.id, cursor: a.cursor, method: 'subclips', binPath: 'Test – Story/Story clips', clips: [{ id: clip.id, in: 10, out: 13, label: 9, name: 'B subclip' }] });
const c = await US.host.call('storyPlace', { seqId: seq.id, cursor: b.cursor, method: 'relabel', clips: [{ id: clip.id, in: 20, out: 22 }] });
const after = await US.host.call('itemInfo', { id: clip.id });
// rename + end on the third timeline clip (ExtendScript directly)
const tiTest = await US.host.rawEval(`(function(){ try { var s=null, ss=app.project.sequences; for (var i=0;i<ss.numSequences;i++) if (ss[i].sequenceID==${JSON.stringify(seq.id)}) s=ss[i];
  var ti=s.videoTracks[0].clips[2]; var r=[]; ti.name='Renamed clip'; r.push('name='+ti.name); var e0=ti.end.seconds; var t=new Time(); t.seconds=e0-0.5; ti.end=t; r.push('end '+e0+' -> '+ti.end.seconds); return r.join(' | '); } catch(e){ return 'ERR '+e+' line '+e.line; } })()`, 20000);
const xmlPath = path.join(os.tmpdir(), 'us-story-colours.xml');
try { fs.unlinkSync(xmlPath); } catch (e) {}
const exp = await US.host.rawEval(`(function(){ try { var s=null, ss=app.project.sequences; for (var i=0;i<ss.numSequences;i++) if (ss[i].sequenceID==${JSON.stringify(seq.id)}) s=ss[i]; return String(s.exportAsFinalCutProXML(${JSON.stringify(xmlPath)}, 1)); } catch(e){ return 'ERR '+e; } })()`, 60000);
let xml = ''; try { xml = fs.readFileSync(xmlPath, 'utf8'); } catch (e) {}
const items = [];
xml.replace(/<clipitem id="[^"]*"[^>]*>([\s\S]*?)<\/clipitem>/g, (m, body) => { const name = (/<name>([^<]*)<\/name>/.exec(body) || [])[1]; const lab = (/<labels>\s*<label2>([^<]*)<\/label2>/.exec(body) || [])[1]; const st = (/<start>(\d+)<\/start>/.exec(body) || [])[1]; items.push({ name, label: lab || '(none)', start: st }); return m; });
return { load, seq: seq.name, itemLabelBefore: info.label, itemLabelAfter: after.label, placed: [a.placed, b.placed, c.placed], tiTest, exp, xmlBytes: xml.length, clipitems: items };
