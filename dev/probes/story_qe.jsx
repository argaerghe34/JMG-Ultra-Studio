(function(){ function m(o){ try { var r=[]; var a=o.reflect.methods; for(var i=0;i<a.length;i++) r.push(a[i].name); var p=o.reflect.properties; var q=[]; for (var j=0;j<p.length;j++) q.push(p[j].name); return r.join(',')+' | P: '+q.join(','); } catch(e){ return 'ERR '+e; } }
 app.enableQE(); var out=[]; out.push('QE: '+m(qe)); try { out.push('qe.source: '+m(qe.source)); out.push('qe.source.player: '+m(qe.source.player)); } catch(e){ out.push('src err '+e); }
 try { out.push('sm args play: '+app.sourceMonitor.reflect.find('play').arguments.length); } catch(e){}
 return out.join('\n'); })()
