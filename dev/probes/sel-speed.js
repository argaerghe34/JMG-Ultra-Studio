// select every clip in the project (up to 300) in the Project panel, then time the old and new ways of reading it
const n = await US.host.rawEval(`(function(){ var items=[]; UStudio.walk(app.project.rootItem, function(c){ if (c.type===1 && items.length<300) items.push(c); }); var ids = app.getProjectViewIDs(); app.setProjectViewSelection(items, ids[0]); return items.length; })()`);
const t0 = performance.now(); const sum = await US.host.call('selectionSummary', { kinds: ['video'] }); const tSum = performance.now() - t0;
const t1 = performance.now(); const old = await US.host.call('selectedItems', { kinds: ['video'] }); const tOld = performance.now() - t1;
const picker = US.ui.sourcePicker({ modes: ['selection'], kinds: ['video'] });
const job = US.jobs.testJob(); const msgs = []; const set = job.set.bind(job); job.set = o => { if (o.msg) msgs.push(o.msg); return set(o); }; const prog = job.progress.bind(job); job.progress = (f, m) => { if (m) msgs.push(m); return prog(f, m); };
const t2 = performance.now(); const r = await picker.resolve(job); const tNew = performance.now() - t2;
return { selected: n, summary: sum, summaryMs: Math.round(tSum), oldMs: Math.round(tOld), oldCount: old.length, newMs: Math.round(tNew), newCount: r.items.length, progress: msgs.slice(0, 3).concat(msgs.length > 3 ? ['…'] : []) };
