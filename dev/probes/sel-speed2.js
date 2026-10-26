const n = await US.host.rawEval(`(function(){ var items=[]; UStudio.walk(app.project.rootItem, function(c){ if (c.type===1 && items.length<300) items.push(c); }); var ids = app.getProjectViewIDs(); var r = app.setProjectViewSelection(items, ids[0]); var s = app.getCurrentProjectViewSelection(); return items.length + ' set=' + r + ' views=' + ids.length + ' sel=' + (s ? s.length : 'null') + ' viewSel=' + (app.getProjectViewSelection(ids[0]) || []).length; })()`);
const sum = await US.host.call('selectionSummary', { kinds: ['video'] });
const list = await US.host.call('selectionList', { kinds: ['video'] });
return { n, sum, list: list.length };
