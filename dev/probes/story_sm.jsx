(function(){ var r=[]; try { var a=app.sourceMonitor.reflect.methods; for (var i=0;i<a.length;i++) r.push(a[i].name); } catch(e){ r.push('ERR '+e); } return r.join(','); })()
