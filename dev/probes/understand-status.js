// What seeing and hearing is doing in the open panel, and what it has kept – read only, nothing is started or changed.
// node dev/cep.js 8890 js dev/probes/understand-status.js   (Resolve: node dev/cep.js resolve js …)
const U = US.understand;
if (!U) return { loaded: false };
const st = U.status(), pl = U.plan(), q = U.queue, kept = U.kept();
const tally = {};
for (const r of kept) { const k = `seen: ${r.seen} | heard: ${r.heard}`; tally[k] = (tally[k] || 0) + 1; }
return {
  project: US.ctx.project && US.ctx.project.name,
  status: { state: st.state, text: st.text, note: st.note, done: st.done, total: st.total, waiting: st.waiting, offers: st.offers },
  plan: { route: pl.route, vision: pl.vision.kind + (pl.vision.label ? ' – ' + pl.vision.label : ''), listening: pl.listening.label, listenModel: pl.listenModel ? pl.listenModel.label : '' },
  background: { on: U.backgroundOn(), running: q.running, listed: q.listed, clipsListed: q.items.length, lastClip: q.last, failures: q.failed, lastError: q.lastError, calm: U.calm() },
  sharedFile: U._pure.sharedFile(),
  bench: U.bench(),
  keptCount: kept.length,
  byRoute: tally,
  kept: kept.slice(0, 40)
};
