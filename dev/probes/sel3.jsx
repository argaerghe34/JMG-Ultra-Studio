(function(){ var out=[]; try {
 var ids = app.getProjectViewIDs(); out.push('ids=' + ids + ' len=' + (ids && ids.length));
 var items=[]; UStudio.walk(app.project.rootItem, function(c){ if (c.type===1 && items.length<300) items.push(c); });
 out.push('items=' + items.length);
 try { var r = app.setProjectViewSelection(items, ids[0]); out.push('set=' + r); } catch (e) { out.push('set err ' + e); }
 var s = app.getCurrentProjectViewSelection(); out.push('cur=' + (s ? s.length : s));
 try { var v = app.getProjectViewSelection(ids[0]); out.push('view=' + (v ? v.length : v)); } catch (e) { out.push('view err ' + e); }
 } catch (e) { out.push('ERR ' + e + ' line ' + e.line); } return out.join(' | '); })()
