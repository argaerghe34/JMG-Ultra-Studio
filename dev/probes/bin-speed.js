const root = (await US.host.call('listBins'))[0];
const t0 = performance.now(); const sum = await US.host.call('binSummary', { binId: root.id, kinds: ['video'] }); const tSum = performance.now() - t0;
const t1 = performance.now(); const old = await US.host.call('binItems', { binId: root.id, kinds: ['video'], recursive: true }); const tOld = performance.now() - t1;
const picker = US.ui.sourcePicker({ modes: ['bin'], kinds: ['video'] });
US.settings.set('src.bin', root.id); await picker.refresh(); await new Promise(r => setTimeout(r, 300));
const job = US.jobs.testJob(); const msgs = []; const prog = job.progress.bind(job); job.progress = (f, m) => { if (m) msgs.push(m); return prog(f, m); };
const t2 = performance.now(); const r = await picker.resolve(job); const tNew = performance.now() - t2;
// Stop between batches
const job2 = US.jobs.testJob(); let stopped = false; const p2 = job2.progress.bind(job2); job2.progress = (f, m) => { job2.cancelled = true; return p2(f, m); };
try { await picker.resolve(job2); } catch (e) { stopped = e.code === 'CANCELLED'; }
return { binSummary: sum, summaryMs: Math.round(tSum), oldMs: Math.round(tOld), oldCount: old.length, newMs: Math.round(tNew), newCount: r.items.length, progressMsgs: msgs.length, firstMsg: msgs[0], stopWorks: stopped };
