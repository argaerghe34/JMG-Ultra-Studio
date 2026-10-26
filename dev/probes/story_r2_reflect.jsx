(function(){ try {
 function args(o,name){ try{ var f=o.reflect.find(name); var r=[]; for(var i=0;i<f.arguments.length;i++) r.push((f.arguments[i].name||'?')+':'+f.arguments[i].dataType); return name+'('+r.join(', ')+') -> '+f.dataType; }catch(e){ return name+' ERR '+e; } }
 app.enableQE(); var out=[], qp=qe.project, ms=qp.reflect.methods, names=[];
 for (var i=0;i<ms.length;i++) names.push(ms[i].name);
 out.push('QEPROJECT: '+names.join(','));
 var want=['newTransparentVideo','newColorMatte','newBlackVideo','newBarsAndTone','newUniversalCountingLeader','newBin','newSequence'];
 for (var j=0;j<want.length;j++) out.push('  '+args(qp,want[j]));
 for (var k=0;k<names.length;k++) if (/adjust/i.test(names[k])) out.push('  ADJ: '+args(qp,names[k]));
 // project item / app methods mentioning adjustment
 var pm=app.project.reflect.methods, pr=[]; for (var p=0;p<pm.length;p++) if (/adjust|new/i.test(pm[p].name)) pr.push(pm[p].name); out.push('PROJECT new/adjust: '+pr.join(','));
 // a track item's property types
 var seqs=app.project.sequences, ti=null;
 for (var s=0;s<seqs.numSequences && !ti;s++) { var vt=seqs[s].videoTracks; for (var t=0;t<vt.numTracks && !ti;t++) if (vt[t].clips.numItems) ti=vt[t].clips[0]; }
 if (ti) { var props=ti.reflect.properties, pp=[]; for (var q=0;q<props.length;q++) pp.push(props[q].name+':'+props[q].type); out.push('TRACKITEM props: '+pp.join(', ')); out.push('  '+args(ti,'move')); }
 return out.join('\n'); } catch(e){ return 'ERR '+e+' line '+e.line; } })()
