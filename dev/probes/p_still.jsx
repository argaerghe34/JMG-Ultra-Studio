(function(){ var out=[]; try {
 var png = "/private/tmp/claude-501/-Users-jgersch--claude-spares-spare-ZV76IQ/dfdca15a-57c0-4de5-9767-1734b1f0ead1/scratchpad/render/frame5.png";
 var bin = UStudio.ensureBin('Test – Me');
 var imp = JSON.parse(UStudio.run('importFiles', JSON.stringify({ paths: [png], binId: bin.nodeId })));
 out.push('import: ' + JSON.stringify(imp));
 var still = UStudio.needItem(imp.data[0].id);
 var info = UStudio.itemInfo(still);
 out.push('still info: dur=' + info.duration + ' kind=' + info.kind + ' w=' + info.width);
 // a 20 s test sequence from the probe video
 var root = app.project.rootItem, probe = null; for (var i=0;i<root.children.numItems;i++) if (root.children[i].name=='Probe') probe=root.children[i];
 var v = probe.children[0];
 var ns = JSON.parse(UStudio.run('newSequence', JSON.stringify({ name: 'Me Still Test', binPath: 'Test – Me', likeId: v.nodeId }))).data;
 out.push('seq: ' + JSON.stringify(ns));
 var pr = UStudio.run('placeClips', JSON.stringify({ seqId: ns.id, clips: [{ id: v.nodeId, 'in': 0, out: 20 }] }));
 out.push('place video: ' + pr);
 var seq = UStudio.needSeq(ns.id);
 var p2 = UStudio.run('placeClips', JSON.stringify({ seqId: ns.id, clips: [{ id: still.nodeId, 'in': 0, out: 20, at: 0, v: 3, audio: false }] }));
 out.push('place still on V4: ' + p2 + ' vtracks=' + seq.videoTracks.numTracks);
 var tr = seq.videoTracks[3];
 if (tr.clips.numItems) {
   var ti = tr.clips[0]; out.push('still ti start=' + ti.start.seconds + ' end=' + ti.end.seconds);
   try { var t = new Time(); t.seconds = 20; ti.end = t; out.push('after end=Time: ' + ti.end.seconds); } catch (e) { out.push('set end err ' + e); }
 }
 } catch(e) { out.push('ERR ' + e + ' line ' + e.line); } return out.join('\n'); })()
