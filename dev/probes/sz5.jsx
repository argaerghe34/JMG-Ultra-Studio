(function(){ var out=[]; try {
 var seq = app.project.activeSequence, dur = UStudio.ticksToSec(seq.end), fr = Number(seq.timebase)/UStudio.TICKS;
 var tr = seq.videoTracks[4]; var it = tr.clips[0].projectItem;
 for (var k = tr.clips.numItems-1; k>=0; k--) tr.clips[k].remove(false,false);
 var tries = [dur, dur + fr*0.5, dur + fr];
 for (var i=0;i<tries.length;i++){ it.setInPoint(0,4); it.setOutPoint(tries[i],4); tr.overwriteClip(it, 0); var ti = tr.clips[0]; out.push('out='+tries[i].toFixed(4)+' -> end='+ti.end.seconds.toFixed(4)+' seqEnd='+UStudio.ticksToSec(seq.end).toFixed(4)); ti.remove(false,false); }
 it.clearInPoint(); it.clearOutPoint();
 } catch(e){ out.push('ERR '+e+' line '+e.line); } return out.join('\n'); })()
