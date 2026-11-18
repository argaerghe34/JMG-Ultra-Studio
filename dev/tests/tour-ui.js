// Runs every tour step by step in the real panel (jsdom, dev/tests/panel-dom.js) and reports what's missing: tools with
// no tour, steps whose target isn't on screen, steps without a title or text, rail places the overview doesn't show.
// The overview runs with the rail as places and with Classic rail. Prints JSON on the last line (tour.test.js reads it).
const { US, $$, tick, boot, errors, w } = require('./panel-dom');

async function runTour(id) {
  const bad = [];
  if (!US.tour.start(id)) return [`${id}: no tour`];
  const n = US.tour.get(id).steps.length;
  for (let i = 0; i < n; i++) {
    await tick(); await new Promise(r => setTimeout(r, 40));
    const r = US.tour.running;
    if (!r) { bad.push(`${id}: stopped at step ${i + 1}`); break; }
    const s = r.step;
    if (!s.title || !s.text) bad.push(`${id} step ${i + 1}: needs a title and a text`);
    const el = US.tour.resolve(s.target);
    if (!el) bad.push(`${id} step ${i + 1} (“${s.title}”): “${s.target}” isn’t on screen${s.tool || id !== 'overview' ? ' in ' + (s.tool || id) : ''}`);
    if (i < n - 1) US.tour.next();
  }
  US.tour.stop();
  return bad;
}

(async () => {
  await boot();
  const out = { errors, noTour: [], badSteps: [], overviewMissingPlaces: [], offered: false, settingsButton: false, questionMarks: [] };
  const tools = US.tools.list().filter(d => !d.hidden || d.id === 'settings');
  out.noTour = tools.filter(d => !US.tour.has(d.id)).map(d => d.id);
  for (const d of tools) if (US.tour.has(d.id)) out.badSteps.push(...await runTour(d.id));
  for (const mode of ['places', 'classic']) {
    US.settings.set('ui.classicRail', mode === 'classic'); US.rebuildRail();
    out.badSteps.push(...(await runTour('overview')).map(x => `[${mode}] ` + x));
  }
  US.settings.set('ui.classicRail', false); US.rebuildRail();
  // every place on the rail has a step in the overview
  const ov = US.tour.get('overview').steps.map(s => s.target);
  out.overviewMissingPlaces = US.PLACES.filter(p => (p.id === 'advanced' ? US.tools.get('advanced') : US.placeTools(p.id).length) && !ov.includes('@rail:' + p.id)).map(p => p.id);
  // the ? beside each tab's title starts that tab's tour
  for (const d of tools.filter(d => d.id !== 'settings')) {
    US.tools.open(d.id); await tick();
    const q = w.document.querySelector(`.view > :not(.hidden) .tour-btn[data-tour="${d.id}"]`);
    if (!q && w.document.querySelector('.view > :not(.hidden) .tool-head')) out.questionMarks.push(d.id);
  }
  // Settings › Take the tour starts the overview; Search lists it
  US.tools.open('settings'); await tick();
  const btn = $$('.view > :not(.hidden) button').find(b => b.textContent.trim() === 'Take the tour');
  if (btn) { btn.click(); await tick(); out.settingsButton = !!US.tour.running && US.tour.running.id === 'overview'; US.tour.stop(); }
  out.inSearch = US.search.results('tour').some(e => e.id === 'tour:overview');
  console.log(JSON.stringify(out));
  process.exit(0);
})().catch(e => { console.log(JSON.stringify({ crash: e.stack })); process.exit(1); });
