(function(){ try {
 var root=app.project.rootItem, bin=null; for (var i=0;i<root.children.numItems;i++) if (root.children[i].name=='Test – Story') bin=root.children[i];
 if (!bin) bin=root.createBin('Test – Story');
 var have=null; for (var j=0;j<bin.children.numItems;j++) if (bin.children[j].name=='I001_interview.mp4') have=bin.children[j];
 if (!have) { app.project.importFiles(['/Users/jgersch/Downloads/WhatsApp Chat with Tab/JMG Ultra Studio/dev/test-media/interview/I001_interview.mp4'], true, bin, false); for (var j=0;j<bin.children.numItems;j++) if (bin.children[j].name=='I001_interview.mp4') have=bin.children[j]; }
 var out=['item '+have.nodeId];
 app.sourceMonitor.openProjectItem(have);
 app.enableQE(); var p=qe.source.player;
 out.push('pos0 '+p.getPosition());
 var tries=['5080320000000','00:00:20:00','20'];
 for (var k=0;k<tries.length;k++){ var e=''; try { p.startScrubbing(); p.scrubTo(tries[k]); p.endScrubbing(); } catch(x){ e=String(x);} out.push('scrubTo '+tries[k]+' -> pos '+p.getPosition()+' sm '+app.sourceMonitor.getPosition().seconds+' '+e); }
 return out.join('\n'); } catch(e){ return 'ERR '+e+' line '+e.line; } })()
