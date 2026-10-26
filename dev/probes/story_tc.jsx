(function(){ try {
 var src = File('/Users/jgersch/Downloads/WhatsApp Chat with Tab/JMG Ultra Studio/jsx/tools/story.jsx'); src.open('r'); var code = src.read(); src.close(); eval(code);
 var out = [];
 var root=app.project.rootItem, bin=null; for (var i=0;i<root.children.numItems;i++) if (root.children[i].name=='Test – Story') bin=root.children[i];
 // a second import of the interview clip that we give a 1-hour start timecode
 var tcItem=null; for (var j=0;j<bin.children.numItems;j++) if (bin.children[j].name=='I001_tc1h') tcItem=bin.children[j];
 if (!tcItem) {
   var before={}; for (var j=0;j<bin.children.numItems;j++) before[bin.children[j].nodeId]=1;
   app.project.importFiles(['/Users/jgersch/Downloads/WhatsApp Chat with Tab/JMG Ultra Studio/dev/test-media/interview/I001_interview.mp4'], true, bin, false);
   for (var j=0;j<bin.children.numItems;j++) if (!before[bin.children[j].nodeId]) tcItem=bin.children[j];
   tcItem.name='I001_tc1h';
   tcItem.setStartTime(3600);
 }
 out.push('timing '+JSON.stringify(UStudio.fn.storyTiming({ids:[tcItem.nodeId]})));
 out.push('getInPoint='+tcItem.getInPoint().seconds+' getOutPoint='+tcItem.getOutPoint().seconds);
 tcItem.setInPoint(5, 4); out.push('after setInPoint(5): getInPoint='+tcItem.getInPoint().seconds);
 tcItem.clearInPoint();
 out.push('cue '+JSON.stringify(UStudio.fn.storyCue({id:tcItem.nodeId, seconds:20})));
 app.enableQE(); out.push('player pos '+qe.source.player.getPosition());
 return out.join('\n'); } catch(e){ return 'ERR '+e+' line '+e.line; } })()
