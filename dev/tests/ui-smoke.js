// Headless smoke test of the Story screen: renders every tab in jsdom with a stubbed Premiere bridge and fails on any
// exception, so UI mistakes are caught without Premiere. Run on its own (node dev/tests/ui-smoke.js) or via run.js.
const { JSDOM } = require('jsdom');
const fs = require('fs'), path = require('path'), os = require('os'), vm = require('vm');
const ROOT = path.join(__dirname, '..', '..');
process.env.HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'us-ui-'));
process.env.APPDATA = process.env.LOCALAPPDATA = process.env.HOME; // Windows keeps settings under AppData, not HOME
const dom = new JSDOM('<!doctype html><html><body><div id="app"></div><div id="toasts"></div></body></html>', { pretendToBeVisual: true, runScripts: 'outside-only', url: 'file://' + path.join(ROOT, 'index.html') });
const w = dom.window;
w.require = require; w.process = process; w.Buffer = Buffer; w.console = console;
w.ResizeObserver = function () { return { observe() {}, disconnect() {} }; };
w.HTMLCanvasElement.prototype.getContext = () => null;
w.document.elementsFromPoint = () => [];
w.Element.prototype.scrollIntoView = function () {}; // not in jsdom
const errors = [];
w.addEventListener('error', e => errors.push(e.error ? e.error.stack : e.message));
const ctx = dom.getInternalVMContext();
const run = f => vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
for (const f of ['util', 'platform', 'store', 'host', 'jobs', 'ui', 'app', 'time', 'transcript']) run(`js/core/${f}.js`);
const US = w.US;
// a fake Premiere
const SEQ = { id: 's1', name: 'Cut', fps: 25, frame: 0.04, duration: 30, video: [{ index: 0, name: 'Video 1', clips: [] }], audio: [{ index: 0, name: 'Audio 1', muted: false, clips: [] }], markers: [] };
US.host.call = async (fn, a) => {
  switch (fn) {
    case 'listSequences': return [{ id: 's1', name: 'Cut' }];
    case 'storyClips': return [];
    case 'sequenceInfo': return SEQ;
    case 'storySequenceTiming': return { zero: 0, fps: 25, drop: false };
    case 'context': return { project: { name: 'Test', path: '/tmp/test.prproj' }, sequence: { id: 's1', name: 'Cut', fps: 25, duration: 30 } };
    default: return {};
  }
};
US.ctx = { project: { name: 'Test', path: path.join(process.env.HOME, 'test.prproj') }, sequence: { id: 's1', name: 'Cut', fps: 25, duration: 30 } };
for (const f of ['22-story-ai', '22-story-board', '22-story-export', '22-story-moments', '22-story-narrative', '22-story-questions', '22-story-context', '22-story-ask', '22-story-timeline', '22-story', '40-assistant']) run(`js/tools/${f}.js`);
const T = US.transcript, S = US.story;
US.tools.open = () => {}; // no app shell here; the test drives the Story screen directly

(async () => {
  const st = S.loadState();
  const TR = path.join(ROOT, 'dev', 'test-media', 'transcripts');
  ['I001_interview.srt', 'Interview_David_Cohen.txt', 'Interview_Miriam_Levy.csv'].forEach((f, i) => S.addTranscript({ name: f, path: '/media/' + f, source: 'file', file: path.join(TR, f), segments: T.parseFile(path.join(TR, f)).segments }));
  await US.actions.get('story.themes').run({ useAI: false }, US.jobs.testJob());
  await S.addCustomTheme(null, 'gratitude');
  const def = US.tools.get('story');
  const tool = def.create();
  w.document.body.appendChild(tool.el);
  const tabs = ['transcripts', 'themes', 'search', 'build', 'timeline'];
  const checks = [];
  for (const tab of tabs) {
    tool.onShow({ tab });
    await new Promise(r => setTimeout(r, 30));
    const pane = Array.from(tool.el.querySelectorAll('.story-pane')).find(p => !p.classList.contains('hidden'));
    checks.push(`${tab}: ${pane ? pane.textContent.length : 0} chars`);
    if (!pane || pane.textContent.length < 20) errors.push(`step ${tab} rendered nothing`);
    if (pane && !/Step \d of 5/.test(pane.textContent)) errors.push(`step ${tab}: no step heading`);
    if (pane && tab !== 'timeline' && !Array.from(pane.querySelectorAll('.story-next .btn')).some(b => /^Next: /.test(b.textContent))) errors.push(`step ${tab}: no Next button`);
  }
  // the steps: five, numbered, done ones ticked; no Board
  const segs = Array.from(tool.el.querySelectorAll('.story-tabs .seg')).map(b => b.textContent);
  if (segs.length !== 5 || !/^1 Interviews ✓$/.test(segs[0]) || !/^2 Themes ✓$/.test(segs[1]) || segs.some(x => /Board/.test(x))) errors.push('steps: ' + segs.join(' | '));
  checks.push('steps: ' + segs.join(' | '));
  // the old Board tab opens Build instead
  tool.onShow({ tab: 'wall' }); await new Promise(r => setTimeout(r, 20));
  if (!tool.el.querySelector('[data-section="build"]')) errors.push('the old board tab did not open Build');
  // Themes: your themes field, How picky with three counted choices; pressing one re-renders
  tool.onShow({ tab: 'themes' });
  if (!Array.from(tool.el.querySelectorAll('.story-pane:not(.hidden) .field')).some(f => /Your themes/.test(f.textContent))) errors.push('no “Your themes” field');
  const choices = tool.el.querySelectorAll('.picky-choice');
  if (choices.length < 3) errors.push('How picky choices missing');
  else { choices[2].click(); await new Promise(r => setTimeout(r, 20)); if (Math.abs(S.pickyFor(null).s - S.PICKY_LEVELS.best) > 1e-9) errors.push('choosing Only the best did not stick'); }
  st.picky = { s: S.PICKY_LEVELS.balanced };
  // Merge ticked: a found theme into Gratitude (yours) – the merged lines become hand-added, the found one isn't looked for again
  {
    tool.onShow({ tab: 'themes' }); await new Promise(r => setTimeout(r, 20));
    const gi = st.themes.findIndex(t => t.name === 'Gratitude'), fi = st.themes.findIndex(t => !t.custom && t.name !== 'Other');
    const g = st.themes[gi], f = st.themes[fi], fLines = f.lineIds.slice();
    const order = gi < fi ? [gi, fi] : [fi, gi];
    const boxes = tool.el.querySelectorAll('.story-pane:not(.hidden) .story-theme input[type=checkbox]');
    boxes[gi].click(); boxes[fi].click();
    Array.from(tool.el.querySelectorAll('.story-pane:not(.hidden) .btn')).find(b => b.textContent === 'Merge ticked').click();
    await new Promise(r => setTimeout(r, 20));
    const keep = st.themes[order[0]];
    if (!st.themes.includes(keep) || st.themes.includes(order[0] === gi ? f : g)) errors.push('merge: wrong theme kept');
    if (!(keep.custom && fLines.every(id => keep.lineIds.includes(id)))) errors.push('merge: lines not merged into a theme of yours');
    if (keep === g && !fLines.every(id => (keep.manual || []).includes(id))) errors.push('merge: merged lines are not kept by hand');
    checks.push(`merge: “${keep.name}” ${keep.lineIds.length} lines`);
  }
  // What to work on: some interviews – Find and Themes read only those
  tool.onShow({ tab: 'transcripts', section: 'scope' }); await new Promise(r => setTimeout(r, 20));
  const some = Array.from(tool.el.querySelectorAll('[data-section="scope"] .seg')).find(b => /Some interviews/.test(b.textContent));
  some.click(); await new Promise(r => setTimeout(r, 20));
  const boxes = tool.el.querySelectorAll('[data-section="scope"] .story-scope-item input');
  if (boxes.length !== 3) errors.push(`scope: ${boxes.length} interview boxes`);
  boxes[1].click(); boxes[2].click(); await new Promise(r => setTimeout(r, 20));
  const inScope = S.scopeLines().length, all = st.transcripts.reduce((n, t) => n + t.lines.length, 0);
  if (!(inScope > 0 && inScope < all) || S.scopeOf().kind !== 'interviews') errors.push(`scope: ${inScope} of ${all} lines`);
  tool.onShow({ tab: 'search' }); await new Promise(r => setTimeout(r, 20));
  if (!/Working on: 1 of 3 interviews/.test(tool.el.querySelector('.story-pane:not(.hidden) .story-scope-chip').textContent)) errors.push('no “Working on” chip on Find');
  checks.push(`scope: ${inScope} of ${all} lines`);
  await S.setScope(null, { kind: 'all' });
  // Build: from your themes, with the themes to include; bins; highlights; open(section)
  tool.onShow({ tab: 'build' }); await new Promise(r => setTimeout(r, 20));
  for (const sec of ['build', 'narrative', 'bins', 'highlights']) if (!tool.el.querySelector(`[data-section="${sec}"]`)) errors.push(`build step: no ${sec} section`);
  if (!/Build a sequence from your themes/.test(tool.el.querySelector('[data-section="build"]').textContent)) errors.push('build card is not “from your themes”');
  if (typeof S.open !== 'function' || S.SECTIONS.board.tab !== 'build') errors.push('US.story.open missing');
  // S2: the narrative card, a basic narrative, its beats
  const nr = await US.actions.get('story.narrative').run({ brief: 'a 45 second video about family', useAI: false }, US.jobs.testJob());
  nr.column.cards[1].trim = { dropStart: 1, dropEnd: 0 };
  tool.onShow({ tab: 'build', section: 'narrative' }); await new Promise(r => setTimeout(r, 40));
  const beats = tool.el.querySelectorAll('.story-beat').length;
  if (beats !== nr.column.cards.length || !/Hook/.test(tool.el.querySelector('.story-narrative').textContent)) errors.push(`narrative shows ${beats} beats of ${nr.column.cards.length}`);
  if (/board/i.test(tool.el.querySelector('.story-narrative').textContent)) errors.push('the narrative still mentions the board');
  checks.push(`narrative: ${beats} beats (${nr.summary.slice(0, 60)}…)`);
  // Share: paper edits of the themes and the narrative
  tool.onShow({ tab: 'timeline' }); await new Promise(r => setTimeout(r, 20));
  const shareBtns = Array.from(tool.el.querySelectorAll('.story-pane:not(.hidden) .btn')).map(b => b.textContent);
  if (!shareBtns.includes('Paper edit of your themes') || !shareBtns.includes('Paper edit of the narrative')) errors.push('share: ' + shareBtns.join(', '));
  // S5: Moments in Find – find them, filter by type, How picky
  st.transcripts[0].lines.push({ id: 'zz1', start: 300, end: 303, speaker: 'Ruth', text: 'Sorry, can I start again?' }, { id: 'zz2', start: 303.5, end: 306, speaker: 'Ruth', text: 'Ha ha, the dog ate it [laughs]' }); S.reindex();
  tool.onShow({ tab: 'search', section: 'moments' }); await new Promise(r => setTimeout(r, 20));
  if (!tool.el.querySelector('[data-section="moments"]')) errors.push('moments section missing');
  await US.actions.get('story.moments').run({ useAI: false, type: 'all' }, US.jobs.testJob());
  tool.onShow({ tab: 'search', section: 'moments' }); await new Promise(r => setTimeout(r, 20));
  const momentRows = tool.el.querySelectorAll('.story-results .story-row').length, chips = tool.el.querySelectorAll('.story-moment-types .chip').length;
  if (!momentRows || chips !== 5) errors.push(`moments: ${momentRows} rows, ${chips} type chips`);
  const bl = Array.from(tool.el.querySelectorAll('.story-moment-types .chip')).find(b => /Bloopers/.test(b.textContent));
  bl.click(); await new Promise(r => setTimeout(r, 20));
  const blRows = tool.el.querySelectorAll('.story-results .story-row').length;
  if (!blRows || blRows >= momentRows) errors.push(`filter by type: ${blRows} of ${momentRows}`);
  checks.push(`moments: ${momentRows} rows, ${blRows} bloopers`);
  const mk = Array.from(tool.el.querySelectorAll('.story-moments-bar .btn')).find(b => /Make themes of these/.test(b.textContent));
  if (!mk) errors.push('no “Make themes of these”'); else { mk.click(); await new Promise(r => setTimeout(r, 20)); if (!st.themes.some(t => t.name === 'Moments · Bloopers' && t.lineIds.length === blRows && t.label === US.storyMoments.TYPES.blooper.label)) errors.push('moments theme not made in the blooper colour'); }
  if (!Array.from(tool.el.querySelectorAll('.story-moments-bar .btn')).some(b => /Build these moments/.test(b.textContent))) errors.push('no “Build these moments”');
  if (Array.from(tool.el.querySelectorAll('.story-moments-bar .toggle')).filter(t => /Colour by type|Label each moment/.test(t.textContent)).length !== 2) errors.push('no colour / label switches for moments');
  // Find › Search: Select all ticks every line shown, Unselect all clears them; the bar offers a new sequence you name
  {
    st.picked = [];
    tool.onShow({ tab: 'search', query: 'family' }); await new Promise(r => setTimeout(r, 20));
    const sa = Array.from(tool.el.querySelectorAll('.story-pane:not(.hidden) .story-select-row .btn')).find(b => /^Select all \d+/.test(b.textContent));
    const shown = tool.el.querySelectorAll('.story-pane:not(.hidden) .story-results .story-row').length;
    if (!sa) errors.push('find: no Select all'); else {
      sa.click(); await new Promise(r => setTimeout(r, 20));
      if ((st.picked || []).length !== shown) errors.push(`select all: ${(st.picked || []).length} of ${shown} ticked`);
      if (!Array.from(tool.el.querySelectorAll('.story-picked .btn')).some(b => /Add to a new sequence/.test(b.textContent))) errors.push('picked bar: no “Add to a new sequence…”');
      const un = Array.from(tool.el.querySelectorAll('.story-pane:not(.hidden) .story-select-row .btn')).find(b => b.textContent === 'Unselect all');
      if (!un) errors.push('find: no Unselect all after selecting'); else { un.click(); await new Promise(r => setTimeout(r, 20)); if ((st.picked || []).length) errors.push('unselect all left ' + st.picked.length); }
      checks.push(`select all: ${shown} lines`);
    }
  }
  // Find › Questions: the questions, every answer under its question, take one out, save as Word
  tool.onShow({ tab: 'search', questions: true }); await new Promise(r => setTimeout(r, 20));
  const qta = tool.el.querySelector('.story-questions-input');
  if (!qta) errors.push('no questions box'); else { qta.value = '1. What does family mean to you?\n2. Tell me about your faith.'; qta.dispatchEvent(new w.Event('input')); }
  await S.findAnswers(US.jobs.testJob(), { questions: US.storyQuestions.parse(qta ? qta.value : ''), useAI: false });
  tool.onShow({ tab: 'search', questions: true }); await new Promise(r => setTimeout(r, 20));
  const qHeads = tool.el.querySelectorAll('.story-q-head').length, qRows = tool.el.querySelectorAll('.story-q-row').length;
  if (qHeads !== 2 || !qRows) errors.push(`questions: ${qHeads} questions, ${qRows} answers`);
  const qx = tool.el.querySelector('.story-q-row .icon-btn[title^="Not an answer"]');
  if (qx) { qx.click(); await new Promise(r => setTimeout(r, 20)); if (tool.el.querySelectorAll('.story-q-row').length !== qRows - 1) errors.push('taking an answer out did not stick'); }
  const qdoc = await S.exportBoard(US.jobs.testJob(), 'txt', { source: 'questions' });
  if (!/Interview answers/.test(fs.readFileSync(qdoc.file, 'utf8')) || !/Q1\. What does family mean to you\?/.test(fs.readFileSync(qdoc.file, 'utf8'))) errors.push('answers document: ' + qdoc.summary);
  checks.push(`questions: ${qHeads} questions, ${qRows} answers · ${qdoc.summary}`);
  // Ask: the answer card – groups, clips, every way it can land, taking a clip out and moving a group
  {
    const ids = st.transcripts[0].lines.map(l => l.id);
    const res = US.storyAsk.organise([{ answer: 'Two things stand out.', groups: [{ key: '', name: 'Family', summary: 's', items: [{ from: ids[0], to: ids[2], lead: '', note: 'n', score: 0.9, tag: '' }, { from: ids[4], to: ids[4], lead: '', note: 'n2', score: 0.5, tag: '' }] }, { key: '', name: 'Work', summary: '', items: [{ from: ids[6], to: ids[7], lead: '', note: '', score: 0.4, tag: '' }] }] }], US.storyAsk.indexOf(st.transcripts));
    res.groups.forEach((g, i) => { g.label = i + 1; });
    const ask = { id: 'ask-test', request: 'a 45-second opening about family', at: Date.now(), rounds: [], result: res, scope: 'All interviews' };
    st.asks = [ask];
    let refined = '';
    const card = S.askCard(ask, { onRefine: t => { refined = t; } });
    w.document.body.appendChild(card);
    const rows = () => card.querySelectorAll('.story-q-row').length;
    if (card.querySelectorAll('.ask-group').length !== 2 || rows() !== 3) errors.push(`ask card: ${card.querySelectorAll('.ask-group').length} groups, ${rows()} clips`);
    if (!/you asked for 0:45/.test(card.textContent)) errors.push('ask card: no wanted length');
    for (const land of ['mark', 'themes', 'doc', 'sequence']) {
      const b = Array.from(card.querySelectorAll('.ask-landing .seg')).find(x => x.dataset.value === land || x.textContent === { mark: 'Mark a sequence', themes: 'Themes', doc: 'Word or text', sequence: 'New sequence' }[land]);
      if (!b) { errors.push('ask card: no ' + land); continue; }
      b.click(); await new Promise(r => setTimeout(r, 10));
    }
    card.querySelector('.story-q-row .icon-btn[title="Take this clip out"]').click(); await new Promise(r => setTimeout(r, 10));
    if (rows() !== 2) errors.push('ask card: taking a clip out did not stick');
    card.querySelector('.ask-group .icon-btn[title="Move the group down"]').click(); await new Promise(r => setTimeout(r, 10));
    if (ask.result.groups[0].name !== 'Work') errors.push('ask card: moving a group did not stick');
    const inp = card.querySelector('.ask-refine input'); inp.value = 'shorter'; inp.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Enter' }));
    if (refined !== 'shorter') errors.push('ask card: follow-up not sent');
    checks.push(`ask card: ${rows()} clips after taking one out`);
    card.remove();
  }
  // the Ask tab in My interviews mode: the welcome, examples and earlier asks
  {
    US.settings.set('assistant.mode', 'interviews');
    const as = US.tools.get('assistant').create(); w.document.body.appendChild(as.el); as.onShow && as.onShow();
    const txt = as.el.textContent;
    if (!/Ask anything about what your interviews say/.test(txt) || !/Earlier:/.test(txt)) errors.push('Ask tab (interviews): ' + txt.slice(0, 200));
    US.settings.set('assistant.mode', 'auto'); as.el.remove();
  }
  // Search › Find more renders results with reasons (lines not yet selected)
  st.picky = { s: S.PICKY_LEVELS.all };
  st.themes = st.themes.filter(t => t.custom && !t.picked);
  const more = await S.findMore(null, 'family', { exclude: S.selectedIds() });
  tool.onShow({ tab: 'search', more: { topic: 'family', results: more, info: 'test' } });
  await new Promise(r => setTimeout(r, 20));
  const why = tool.el.querySelectorAll('.story-why').length;
  if (!more.length || !why) errors.push(`find more showed ${why} reasons for ${more.length} results`);
  checks.push(`find more: ${more.length} results, ${why} with reasons`);
  if (errors.length) { console.log('✗ UI smoke test\n  ' + errors.join('\n  ')); process.exit(1); }
  console.log('✓ UI smoke test · ' + checks.join(' · '));
  process.exit(0);
})().catch(e => { console.log('✗ UI smoke test: ' + e.stack); process.exit(1); });
