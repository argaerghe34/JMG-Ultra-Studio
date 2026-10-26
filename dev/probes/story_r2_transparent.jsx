(function(){ try {
 var root = app.project.rootItem, before = {}, out = [];
 UStudio.walk(root, function (c) { before[c.nodeId] = true; });
 var seq = app.project.activeSequence;
 out.push('active seq ' + (seq ? seq.name + ' ' + seq.frameSizeHorizontal + 'x' + seq.frameSizeVertical + ' tb ' + seq.timebase : 'none'));
 app.enableQE();
 var r = qe.project.newTransparentVideo(seq.frameSizeHorizontal, seq.frameSizeVertical, Number(seq.timebase), 1, 1);
 out.push('newTransparentVideo(w,h,ticksPerFrame,1,1) -> ' + r);
 var made = [];
 UStudio.walk(root, function (c) { if (!before[c.nodeId]) made.push(c.name + ' type ' + c.type + ' bin ' + UStudio.binPath(c) + ' adj ' + (function(){ try { return c.isAdjustmentLayer(); } catch(e) { return '?'; } })() + ' dur ' + c.getOutPoint().seconds); });
 out.push('new items: ' + made.join('; '));
 return out.join('\n'); } catch(e){ return 'ERR '+e+' line '+e.line; } })()
