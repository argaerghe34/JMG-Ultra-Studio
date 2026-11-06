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
w.IntersectionObserver = function () { return { observe() {}, disconnect() {} }; };
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
for (const f of ['22-story-glossary', '22-story-clips', '22-story-heat', '22-story-script', '22-story-reference', '22-story-crops', '22-story-drag', '22-story-voices', '22-story-proof', '22-story-ai', '22-story-board', '22-story-export', '22-story-moments', '22-story-narrative', '22-story-questions', '22-story-context', '22-story-ask', '22-story-timeline', '22-story', '40-assistant', '41-edit', '42-recipes', '29-words', '35-markers', '36-quickfx', '39-mvfx-fusion', '39-mvfx-looks', '39-mvfx-pack', '39-mvfx', '37-producer', '38-wiki', '43-agent']) run(`js/tools/${f}.js`);
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
  if (!/Names and terms/.test(tool.el.textContent)) errors.push('transcripts: no Names and terms');
  // voices: the button first; once voices are given, a row each with a name, Same person as…, and Undo
  {
    if (!/Tell the voices apart/.test(tool.el.textContent)) errors.push('voices: no Tell the voices apart button');
    const t0 = st.transcripts[0], ls = t0.lines;
    US.storyVoices.apply(st, [t0], { voices: [{ key: 'Voice 1' }, { key: 'Voice 2' }], lines: Object.fromEntries(ls.map((l, i) => [l.id, { voice: i % 2 ? 'Voice 2' : 'Voice 1', sure: 0.8 }])) });
    st.voiceID = { at: 1, voices: [{ key: 'Voice 1', asks: true, interviews: [t0.key], centre: [1, 0] }, { key: 'Voice 2', interviews: [t0.key], centre: [0, 1] }], skipped: [] };
    tool.onShow({ tab: 'transcripts', section: 'scope' }); await new Promise(r => setTimeout(r, 20));
    const rows = tool.el.querySelectorAll('.story-voice');
    if (rows.length !== 2 || !/Asks the questions/.test(rows[0].textContent)) errors.push(`voices: ${rows.length} voice rows`);
    US.storyVoices.undo();
    tool.onShow({ tab: 'transcripts', section: 'scope' }); await new Promise(r => setTimeout(r, 20));
    if (tool.el.querySelectorAll('.story-voice').length || !/Tell the voices apart/.test(tool.el.textContent)) errors.push('voices: undo left voices');
    checks.push(`voices: ${rows.length} rows, undo`);
  }
  // check the words: a mis-heard short form found, corrected in the ticked line only, then offered to go back into Premiere
  {
    const t0 = st.transcripts[0], l0 = t0.lines[0], l1 = t0.lines[1], was0 = l0.text, was1 = l1.text, wasG = st.glossary;
    l0.text = 'We set up FJL with FJL money and FJL people.'; l1.text = 'The FTL crew came.'; S.reindex();
    tool.onShow({ tab: 'transcripts', section: 'scope' }); await new Promise(r => setTimeout(r, 20));
    if (!/Check the words/.test(tool.el.textContent)) errors.push('proof: no Check the words');
    // no names typed: the AI suggests them first (with titles), filled into the box to check
    const wasAI = US.ai;
    US.ai = Object.assign({}, wasAI, { available: () => true, label: () => 'Claude', json: async () => ({ names: [{ name: 'FJL', title: 'a youth charity', kind: 'organisation', heard: ['FTL'], why: '' }, { name: 'Ruth Cohen', title: 'Volunteer', kind: 'person', heard: [], why: '' }] }) });
    try {
      st.proof = {};
      tool.onShow({ tab: 'transcripts', section: 'scope' }); await new Promise(r => setTimeout(r, 20));
      Array.from(tool.el.querySelectorAll('.btn')).find(b => b.textContent === 'Find likely mistakes').click(); await new Promise(r => setTimeout(r, 80));
    } finally { US.ai = wasAI; }
    const people = tool.el.querySelectorAll('.proof-person');
    if (people.length !== 2 || !/Volunteer/.test(Array.from(people[0].querySelectorAll('input')).map(i => i.value).join(' '))) errors.push(`proof: ${people.length} names suggested`);
    if (!/FJL/.test((st.proof.terms || []).join(','))) errors.push('proof: suggested names not in the box ' + JSON.stringify(st.proof.terms));
    const grp = Array.from(tool.el.querySelectorAll('.proof-group')).find(g => /FTL/.test(g.textContent));
    if (!grp) errors.push('proof: FTL not found');
    else {
      Array.from(grp.querySelectorAll('.btn')).find(b => b.textContent === 'Untick all').click();
      if (Array.from(grp.querySelectorAll('.proof-hit input')).some(b => b.checked) || !/0 of/.test(grp.textContent)) errors.push('proof: Untick all left ticks');
      Array.from(grp.querySelectorAll('.btn')).find(b => b.textContent === 'Tick all').click();
      if (!Array.from(grp.querySelectorAll('.proof-hit input')).every(b => b.checked)) errors.push('proof: Tick all missed some');
      Array.from(grp.querySelectorAll('.btn')).find(b => b.textContent === 'Correct the ticked ones').click(); await new Promise(r => setTimeout(r, 30));
      if (S.lineOf(l1.id).text !== 'The FJL crew came.') errors.push('proof: not corrected – ' + S.lineOf(l1.id).text);
      if (!/Update Premiere’s transcripts/.test(tool.el.textContent)) errors.push('proof: no Update Premiere’s transcripts');
    }
    st.glossary = wasG || []; US.storyGlossary.apply(st.transcripts.flatMap(t => t.lines), st.glossary); l0.text = was0; l1.text = was1; delete l0.orig; delete l1.orig; st.proof = {}; S.reindex();
    checks.push('proof: AI names with titles, tick all / untick all, FTL → FJL, update Premiere offered');
  }
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
  if (!/Soundbites/.test(tool.el.textContent)) errors.push('build step: no Soundbites rules');
  if (!tool.el.querySelector('[data-section="clips"]')) errors.push('build step: no Clips for social');
  if (!tool.el.querySelector('[data-section="beats"]')) errors.push('build step: no Beat map');
  if (!tool.el.querySelector('[data-section="script"] textarea')) errors.push('build step: no From a script');
  if (!/Like a reference cut/.test(tool.el.querySelector('[data-section="narrative"]').textContent)) errors.push('narrative: no Like a reference cut');
  {
    const wasAI = US.ai; US.ai = { available: () => false, label: () => 'No AI' };
    try { await S.scoreBeats({ set() { return this; }, progress() {}, check() {}, log() {} }, { crit: ['emotion', 'humour'] }); } finally { US.ai = wasAI; }
    tool.onShow({ tab: 'build', section: 'beats' }); await new Promise(r => setTimeout(r, 30));
    const cells = tool.el.querySelectorAll('[data-section="beats"] .heat-cell');
    if (!cells.length) errors.push('beat map: no heat cells'); else { cells[0].click(); await new Promise(r => setTimeout(r, 10)); if (!/Add to the board|On the board/.test(tool.el.querySelector('[data-section="beats"]').textContent)) errors.push('beat map: no detail on click'); }
    checks.push(`beat map: ${cells.length} passages`);
  }
  {
    // Clips for social › Same crop per person: a row per person in the ticked clips, with Left/Centre/Right and sliders
    const t0 = st.transcripts[0], ids = t0.lines.slice(0, 3).map(l => l.id);
    st.clips = { items: [{ title: 'Test clip', on: true, parts: [{ lineIds: ids, start: t0.lines[0].start, end: t0.lines[2].end }], seconds: 20, scores: {}, score: 7 }], by: 'basic' };
    const was = US.settings.get('story.clips', {});
    US.settings.set('story.clips', Object.assign({}, was, { vertical: true, reframe: 'fixed' }));
    tool.onShow({ tab: 'build', section: 'clips' }); await new Promise(r => setTimeout(r, 30));
    const rows = tool.el.querySelectorAll('[data-section="clips"] .crop-person');
    if (!rows.length) errors.push('clips: no crop rows for “Same crop per person”');
    else {
      Array.from(rows[0].querySelectorAll('button')).find(b => b.textContent.trim() === 'Left').click(); await new Promise(r => setTimeout(r, 20));
      const crops = US.settings.get('story.crops', {});
      if (!Object.values(crops).some(c => c.x === 0.25)) errors.push('clips: Left didn’t set the crop');
      checks.push(`crops: ${rows.length} person rows`);
    }
    US.settings.set('story.clips', was); US.settings.set('story.crops', {}); st.clips = null;
  }
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
  // the narrative can come from a timeline: a Lines from switch, and a timeline picker once it's chosen
  const narCard = () => tool.el.querySelector('[data-section="narrative"]');
  const tlBtn = Array.from(narCard().querySelectorAll('button')).find(b => b.textContent.trim() === 'A timeline');
  if (!tlBtn) errors.push('narrative: no “A timeline” choice');
  else {
    tlBtn.click(); await new Promise(r => setTimeout(r, 40));
    if (!/Timeline/.test(narCard().textContent) || !narCard().querySelector('select')) errors.push('narrative: no timeline picker');
    const back = Array.from(narCard().querySelectorAll('button')).find(b => b.textContent.trim() === 'Your themes');
    if (back) { back.click(); await new Promise(r => setTimeout(r, 40)); }
  }
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
  // Settings: draws with no AI – the Without AI section, usage by key, the code box and About; the top bar's AI chip
  {
    run('js/core/ai.js'); run('js/tools/99-settings.js');
    const set = US.tools.get('settings').create(); w.document.body.appendChild(set.el); set.onShow && set.onShow({ section: 'without-ai' });
    await new Promise(r => setTimeout(r, 50));
    const txt = set.el.textContent;
    for (const want of ['Without AI – what still works', 'Never use AI', 'Needs AI', 'By API key', 'About']) if (!txt.includes(want)) errors.push('Settings: no “' + want + '”');
    if (set.el.querySelector('[data-section="without-ai"] .section.closed')) errors.push('Settings: Without AI didn’t open when asked');
    if (!set.el.querySelector('.settings-code input')) errors.push('Settings: no code box');
    if (!set.el.querySelector('[data-section="sent"]') || !/What was sent to AI/.test(set.el.textContent)) errors.push('Settings: no “What was sent to AI”');
    set.el.remove();
    // two requests of one job: one row with what it was about, opening to show both
    US.settings.set('ai.sentLog', true);
    await US.jobs.run({ title: 'Agent', tool: 'agent', about: 'Asking about Ruth’s interview · “a film”' }, async () => { for (const f of ['Agent', 'Agent']) US.ai.sent.begin({ provider: 'claude', model: 'm', feature: f, req: { system: 's', user: 'u' }, est: { inputTokens: 1, usd: 0.01 } }); return { summary: 'ok' }; });
    const set2 = US.tools.get('settings').create(); w.document.body.appendChild(set2.el);
    await new Promise(r => setTimeout(r, 30));
    const head = set2.el.querySelector('.sent-head');
    if (!head || !/Asking about Ruth’s interview/.test(head.textContent) || !/2 requests/.test(head.textContent)) errors.push('Settings: requests not grouped by job – ' + (head ? head.textContent : 'no group'));
    else { head.click(); if (set2.el.querySelectorAll('.sent-kids:not(.hidden) .sent-req').length !== 2) errors.push('Settings: the group didn’t open to its requests'); }
    set2.el.remove();
    checks.push('sent to AI: grouped by job, with what it was about, opens to each request');
  }
  // the Ask tab in My interviews mode: the welcome, examples and earlier asks
  {
    US.settings.set('assistant.mode', 'interviews');
    const as = US.tools.get('assistant').create(); w.document.body.appendChild(as.el); as.onShow && as.onShow();
    const txt = as.el.textContent;
    if (!/Ask anything about what your interviews say/.test(txt) || !/Earlier:/.test(txt)) errors.push('Ask tab (interviews): ' + txt.slice(0, 200));
    US.settings.set('assistant.mode', 'auto'); as.el.remove();
  }
  // the Ask tab in Anything mode: recipes offered
  {
    US.settings.set('assistant.mode', 'auto');
    const as = US.tools.get('assistant').create(); w.document.body.appendChild(as.el); as.onShow && as.onShow();
    if (!/Recipes/.test(as.el.textContent) || !/Get interviews ready/.test(as.el.textContent)) errors.push('Ask tab: no recipes');
    as.el.remove(); checks.push('ask recipes');
  }
  // the Ask tab in Edit mode: where it acts, and examples
  {
    US.settings.set('assistant.mode', 'edit');
    const as = US.tools.get('assistant').create(); w.document.body.appendChild(as.el); as.onShow && as.onShow();
    const where = as.el.querySelector('.edit-where'), txt = as.el.textContent;
    if (!where || where.classList.contains('hidden') || !['This sequence', 'Selected clips', 'Transcript lines', 'A bin', 'Whole project'].every(x => where.textContent.includes(x))) errors.push('Ask tab (edit): no Where bar');
    if (!/Tell me what to change/.test(txt) || !/cross dissolve on every cut/i.test(txt)) errors.push('Ask tab (edit): ' + txt.slice(0, 200));
    US.settings.set('assistant.mode', 'auto'); as.el.remove();
    checks.push('ask edit: where bar + examples');
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
  // every line can be dragged or put at the playhead, with the options to set how
  {
    const drag = tool.el.querySelectorAll('.story-row[draggable=true]').length, ph = tool.el.querySelectorAll('.story-row .icon-btn[title*="playhead"]').length;
    if (!/Dragging and placing lines/.test(tool.el.textContent)) errors.push('Find: no “Dragging and placing lines” options');
    if (drag && ph < drag) errors.push(`Find: ${drag} draggable rows but ${ph} playhead buttons`);
    checks.push(`placing: ${drag} draggable rows, ${ph} playhead buttons`);
  }
  // Word cloud: words sized by count; clicking one lists every mention with play and a build button
  {
    const wt = US.tools.get('words').create();
    w.document.body.appendChild(wt.el);
    wt.onShow(); await new Promise(r => setTimeout(r, 40));
    const words = wt.el.querySelectorAll('.word-cloud .word');
    if (words.length < 10) errors.push(`word cloud: ${words.length} words`);
    else {
      const sizes = Array.from(words).map(b => parseFloat(b.style.fontSize));
      if (Math.max(...sizes) <= Math.min(...sizes)) errors.push('word cloud: every word the same size');
      words[0].click(); await new Promise(r => setTimeout(r, 20));
      const rows = wt.el.querySelectorAll('.word-mention');
      if (!rows.length || !wt.el.querySelector('.word-mention mark')) errors.push('word cloud: no mentions listed on click');
      if (!Array.from(wt.el.querySelectorAll('.btn')).some(b => /^Build a sequence of \d+ mentions?$/.test(b.textContent))) errors.push('word cloud: no build button');
      const listBtn = Array.from(wt.el.querySelectorAll('.seg')).find(b => b.textContent === 'List');
      listBtn.click(); await new Promise(r => setTimeout(r, 10));
      if (!wt.el.querySelectorAll('.word-row').length) errors.push('word cloud: list view empty');
      Array.from(wt.el.querySelectorAll('.seg')).find(b => b.textContent === 'Cloud').click();
      checks.push(`word cloud: ${words.length} words, “${words[0].textContent}” ${rows.length} mentions`);
    }
  }
  // Producer and the Story wiki, with a stand-in AI that answers in the shared format using real line ids
  {
    const ls = S.state().transcripts.flatMap(t => t.lines), id = i => ls[Math.min(i, ls.length - 1)].id;
    const job = { set() { return this; }, progress() {}, check() {}, log() {} };
    const wasAI = US.ai, wikiAsks = [];
    US.ai = { available: () => true, label: () => 'Test AI', provider: () => 'gemini', approveTotal: async () => {}, json: async req => {
      const t = typeof req.user === 'string' ? req.user : req.user.map(b => b.text || b).join('\n');
      if (/Make part of a wiki/.test(t)) wikiAsks.push(t);
      // the People piece is cut off the first time (as a big project's was): it must be asked again for less, not the same
      if (/key "person" .* at most 40/.test(t)) throw new US.UserError('AI_FAILED', { title: 'The AI’s answer was too long and got cut off.', detail: 'stop_reason max_tokens' });
      if (/Make part of a wiki/.test(t)) return { answer: 'The story.\n\nIt goes on.', groups: [
        { key: 'interview', name: 'Interview 1 – Someone', summary: 'They talk.', items: [{ from: id(0), to: id(1), lead: '', note: 'start', score: 1, tag: '' }] },
        { key: 'person', name: 'Ruth Cohen', summary: 'The baker.', items: [{ from: id(2), to: id(2), lead: '', note: 'grew up in Leeds', score: 0.9, tag: '' }] },
        { key: 'place', name: 'Leeds', summary: 'A city.', items: [{ from: id(2), to: id(2), lead: '', note: 'home town', score: 0.5, tag: '' }] },
        { key: 'date', name: '1987', summary: 'It opened.', items: [{ from: id(3), to: id(3), lead: '', note: 'opened', score: 0.5, tag: '1987' }] }] };
      if (/looks something up/.test(t)) return { answer: 'In Leeds.', groups: [{ key: 'sources', name: 'Sources', summary: '', items: [{ from: id(2), to: id(2), lead: '', note: 'says so', score: 1, tag: '' }] }] };
      if (/pick-up interview/.test(t)) return { answer: 'Gaps.', groups: [{ key: 'gap', name: 'Why it closed', summary: 'Never said.', items: [{ from: id(2), to: id(2), lead: '', note: 'What happened when it closed?', score: 0.9, tag: 'ask' }, { from: id(4), to: id(4), lead: '', note: 'close', score: 0.9, tag: 'near' }] }] };
      return { answer: '', groups: [] };
    } };
    try {
      const built = await US.storyWiki.build(job);
      if (wikiAsks.length !== 5 || !/at most 20/.test(wikiAsks[2]) || built.wiki.missing) errors.push(`wiki: pieces ${wikiAsks.length}, a cut-off piece not asked for less (${built.wiki.missing})`);
      if (built.wiki.data.overview.split('The story.').length !== 2) errors.push('wiki: the overview came more than once');
      const wk = US.tools.get('wiki').create();
      w.document.body.appendChild(wk.el);
      wk.onShow(); await new Promise(r => setTimeout(r, 20));
      if (!/Ruth Cohen|People 1/.test(wk.el.textContent)) errors.push('wiki: no sections after building');
      const people = Array.from(wk.el.querySelectorAll('.seg')).find(b => /^People/.test(b.textContent));
      people.click(); await new Promise(r => setTimeout(r, 10));
      const head = wk.el.querySelector('.wiki-entry-head');
      if (!head || !/Ruth Cohen/.test(head.textContent)) errors.push('wiki: People page empty');
      else { head.click(); await new Promise(r => setTimeout(r, 10)); if (!wk.el.querySelector('.wiki-entry.open .wiki-fact')) errors.push('wiki: an opened entry shows no facts'); }
      const box = wk.el.querySelector('.wiki-search');
      box.value = 'where did ruth grow up'; box.dispatchEvent(new w.Event('input')); await new Promise(r => setTimeout(r, 10));
      if (!/In the wiki · 1 match/.test(wk.el.textContent)) errors.push('wiki: typing did not find Ruth');
      const a = await US.storyWiki.ask(job, 'where did Ruth grow up?');
      wk.onShow({ ask: a.ask }); await new Promise(r => setTimeout(r, 10));
      if (!/In Leeds\./.test(wk.el.textContent) || !wk.el.querySelector('.wiki-answer')) errors.push('wiki: answer not shown');
      checks.push(`wiki: ${wk.el.querySelectorAll('.wiki-entry').length} entries, answer with ${a.ask.sources.length} source`);

      const st = S.state();
      st.producer = { notes: [{ id: 'pn1', name: 'Cut', seqId: 's1', at: 1, updated: 1, by: 'Test AI', ask: {}, rounds: [], cut: [{ lineId: id(0), start: 3, end: 6 }],
        result: { verdict: 'Too slow.', notes: [{ kind: 'buried', title: 'Best line at 6:40', text: 'Open with it.', severity: 0.9, items: [{ from: id(0), to: id(0), tag: 'cut', note: '' }, { from: id(5), to: id(6), tag: 'unused', note: 'better' }] }] } }], pickups: [], markers: {} };
      const pt = US.tools.get('producer').create();
      w.document.body.appendChild(pt.el);
      pt.onShow({ page: 'notes' }); await new Promise(r => setTimeout(r, 20));
      if (!/Too slow\./.test(pt.el.textContent) || pt.el.querySelectorAll('.producer-note .producer-line').length !== 2) errors.push('producer: notes not shown with their lines');
      if (!/In the cut at 0:03/.test(pt.el.textContent) || !/Not in the cut/.test(pt.el.textContent)) errors.push('producer: lines not placed in or out of the cut');
      const plan = await US.producer.planPickups(job, { brief: 'for donors' });
      pt.onShow({ page: 'pickups', id: plan.plan.id }); await new Promise(r => setTimeout(r, 20));
      if (!pt.el.querySelector('.producer-questions li') || !/What happened when it closed\?/.test(pt.el.textContent)) errors.push('producer: pick-up questions not shown');
      checks.push(`producer: notes + ${plan.summary}`);
    } catch (e) { errors.push('producer/wiki: ' + (e.stack || e.title || e)); } finally { US.ai = wasAI; }
  }
  // Markers: the open sequence's markers listed with colour chips; searching filters; ticking shows the bulk bar
  {
    SEQ.markers = [{ guid: 'm1', start: 1, end: 1, name: 'Fix colour', comment: 'too warm', color: 1 }, { guid: 'm2', start: 5, end: 7, name: 'Music up', comment: '', color: 6 }];
    const mt = US.tools.get('markers').create();
    w.document.body.appendChild(mt.el);
    mt.onShow(); await new Promise(r => setTimeout(r, 40));
    const rows = mt.el.querySelectorAll('.marker-row');
    if (rows.length !== 2) errors.push(`markers: ${rows.length} rows`);
    if (mt.el.querySelectorAll('.marker-chip').length !== 2) errors.push('markers: no colour chips');
    const box = mt.el.querySelector('.marker-row input[type=checkbox]');
    if (box) { box.click(); await new Promise(r => setTimeout(r, 10)); if (!/1 ticked/.test(mt.el.querySelector('.marker-bulk').textContent)) errors.push('markers: no bulk bar after ticking'); }
    const search = mt.el.querySelector('input[placeholder^="Search names"]');
    search.value = 'music'; search.dispatchEvent(new w.Event('input')); await new Promise(r => setTimeout(r, 10));
    if (mt.el.querySelectorAll('.marker-row').length !== 1) errors.push('markers: search did not filter');
    const notes = mt.el.querySelector('textarea');
    if (US.markerKit.fromText('00:01 a\n00:02 b', { fps: 25 }).length !== 2 || !notes) errors.push('markers: notes box');
    // the pad: big buttons; a press adds at the playhead; start/stop waits for the second press; a key presses too
    const pads = mt.el.querySelectorAll('.pad-btn');
    if (pads.length !== 9) errors.push(`marker pad: ${pads.length} buttons`);
    const wasCall = US.host.call, added = [], updated = [];
    US.host.call = async (fn, a) => { if (fn === 'addSequenceMarkers') { added.push(a); return ['n' + added.length]; } if (fn === 'updateMarkers') { updated.push(a); return { done: 1, guids: {} }; } if (fn === 'sequenceInfo') return Object.assign({}, SEQ, { playhead: 1 }); return wasCall(fn, a); };
    try {
      const pick = label => Array.from(mt.el.querySelectorAll('.pad-btn')).find(b => b.querySelector('.pad-label').textContent.replace('● ', '') === label);
      pick('Fix').click(); await new Promise(r => setTimeout(r, 30));
      if (!added.length || added[0].markers[0].color !== 1 || added[0].markers[0].start !== 1 || added[0].where !== 'timeline') errors.push('marker pad: Fix did not add a red marker at the playhead ' + JSON.stringify(added));
      pick('Highlight').click(); await new Promise(r => setTimeout(r, 30));
      if (added.length !== 1 || !mt.el.querySelector('.pad-btn.recording')) errors.push('marker pad: start/stop did not wait for its end');
      pick('Select on the clip').click(); await new Promise(r => setTimeout(r, 30));
      if (!added[1] || added[1].where !== 'clips' || added[1].markers[0].end !== 6) errors.push('marker pad: a 5 s marker on the clip');
      Array.from(mt.el.querySelectorAll('.pad-colour'))[6].click(); await new Promise(r => setTimeout(r, 30));
      if (!updated.length || updated[0].markers[0].guid !== 'm1' || updated[0].markers[0].color !== 6) errors.push('marker pad: colour did not change the marker at the playhead ' + JSON.stringify(updated));
      w.document.body.dispatchEvent(new w.KeyboardEvent('keydown', { key: '1', bubbles: true })); await new Promise(r => setTimeout(r, 30));
      if (added.length !== 3 || added[2].markers[0].name !== 'Good') errors.push('marker pad: key 1 did not press Good');
      Array.from(mt.el.querySelectorAll('.btn')).find(b => b.textContent === 'Edit buttons').click(); await new Promise(r => setTimeout(r, 10));
      if (mt.el.querySelectorAll('.pad-edit').length !== 9) errors.push('marker pad: no editors');
    } finally { US.host.call = wasCall; }
    SEQ.markers = [];
    checks.push(`markers: ${rows.length} rows, search, bulk bar · pad: ${pads.length} buttons, start/stop, colour, keys`);
  }
  // Quick effects: a click adds a transition at the cuts between the selected clips, with the length chosen
  {
    const qt = US.tools.get('quickfx').create();
    w.document.body.appendChild(qt.el);
    const tiles = qt.el.querySelectorAll('.qfx-btn');
    if (tiles.length < 25) errors.push(`quick effects: ${tiles.length} buttons`);
    const wasCall = US.host.call, applied = [];
    const READ = { fps: 25, video: [{ index: 0, clips: [{ start: 0, end: 4 }, { start: 4, end: 9 }, { start: 9, end: 12 }] }], audio: [{ index: 0, clips: [{ start: 0, end: 4 }, { start: 4, end: 9 }] }] };
    US.host.call = async (fn, a) => { if (fn === 'editRead') return READ; if (fn === 'editSelection') return [{ kind: 'video', track: 0, start: 0, end: 4 }, { kind: 'video', track: 0, start: 4, end: 9 }, { kind: 'video', track: 0, start: 9, end: 12 }]; if (fn === 'editApply') { applied.push(a); return { done: a.targets.length, skipped: [] }; } return wasCall(fn, a); };
    try {
      Array.from(qt.el.querySelectorAll('.seg')).find(b => b.textContent === '1 s').click();
      const dis = Array.from(qt.el.querySelectorAll('.qfx-btn')).find(b => b.querySelector('.pad-label').textContent === 'Cross Dissolve');
      dis.click(); await new Promise(r => setTimeout(r, 30));
      if (applied.length !== 1 || applied[0].op !== 'transition' || applied[0].params.frames !== 25 || applied[0].params.at !== 'start' || applied[0].targets.length !== 2) errors.push('quick effects: dissolve not at the 2 cuts, 1 s ' + JSON.stringify(applied));
      if (!/Cross Dissolve: 2 transitions added/.test(qt.el.textContent)) errors.push('quick effects: no report');
      const louder = Array.from(qt.el.querySelectorAll('.qfx-btn')).find(b => b.querySelector('.pad-label').textContent === 'Louder');
      louder.click(); await new Promise(r => setTimeout(r, 30));
      if (!applied[1] || applied[1].op !== 'volume' || applied[1].targets.some(t => t.kind !== 'audio') || applied[1].targets.length !== 2) errors.push('quick effects: Louder not on the sound of the selected clips ' + JSON.stringify(applied[1]));
      const star = qt.el.querySelector('.qfx-btn .qfx-star:not(.on)'); star.click();
      if (!/Favourites/.test(qt.el.textContent)) errors.push('quick effects: no favourites');
    } finally { US.host.call = wasCall; US.settings.set('quickfx.favs', undefined); US.settings.set('quickfx.seconds', undefined); }
    checks.push(`quick effects: ${tiles.length} buttons, dissolve at cuts, louder on the sound`);
  }
  // mVFX: nine groups of thumbnails; choosing a lower third shows its fields (name, role), colours and the big button;
  // Add at the playhead paints nothing here (no canvas) but asks Premiere for the text layers with the words typed
  if (US.tools.get('mvfx')) {   // paused (hidden) in the panel for now
    const mt = US.tools.get('mvfx').create();
    w.document.body.appendChild(mt.el);
    await new Promise(r => setTimeout(r, 30));
    const tiles = mt.el.querySelectorAll('.mvfx-tile');
    if (tiles.length !== 8) errors.push(`mvfx: ${tiles.length} lower thirds`);
    const groups = mt.el.querySelectorAll('.mvfx-groups .seg');
    if (groups.length !== 9) errors.push(`mvfx: ${groups.length} groups`);
    Array.from(tiles).find(t => /Tag/.test(t.textContent)).click();   // Tag has no painted art (there is no canvas here), just two text layers
    const inputs = mt.el.querySelectorAll('.mvfx-editor input.input');
    if (inputs.length < 2) errors.push('mvfx: no name/role fields');
    inputs[0].value = 'Mira Haddad'; inputs[0].dispatchEvent(new w.Event('input'));
    const wasCall = US.host.call, calls = [];
    US.host.call = async (fn, a) => { calls.push([fn, a]); if (fn === 'sequenceInfo') return { id: 's1', name: 'Cut', fps: 25, width: 1920, height: 1080, duration: 30 }; if (fn === 'findGuideItem') return 'png1'; if (fn === 'mvfxApply') return { placed: a.layers.length, track: 2, trackName: 'mVFX 1', tracks: [2, 3, 4] }; return wasCall(fn, a); };
    try {
      mt.el.querySelector('.btn.primary').click();
      await new Promise(r => setTimeout(r, 120));
      const ap = calls.find(c => c[0] === 'mvfxApply');
      if (!ap) errors.push('mvfx: Premiere not asked ' + JSON.stringify(calls.map(c => c[0])));
      else {
        const texts = ap[1].layers.filter(l => l.kind === 'text');
        const nm = texts.find(t => t.text === 'Mira Haddad');
        if (texts.length !== 2 || !nm || !(nm.size > 50) || !texts.some(t => t.text === 'FOUNDER, RIVERSIDE TRUST')) errors.push('mvfx: text layers ' + JSON.stringify(texts));
        if (ap[1].seconds !== 5 || ap[1].start !== 0) errors.push('mvfx: at the playhead for 5 s ' + ap[1].start + '/' + ap[1].seconds);
      }
      if (!/Tag added at/.test(mt.el.textContent)) errors.push('mvfx: no report: ' + mt.el.querySelector('.pad-status').textContent);
      // a movement goes on the selected clips with keyframes
      Array.from(groups).find(b => /Movements/.test(b.textContent)).click();
      await new Promise(r => setTimeout(r, 30));
      Array.from(mt.el.querySelectorAll('.mvfx-tile')).find(t => /Push in/.test(t.textContent)).click();
      US.host.call = async (fn, a) => { calls.push([fn, a]); if (fn === 'sequenceInfo') return { id: 's1', name: 'Cut', fps: 25, width: 1920, height: 1080, duration: 30 }; if (fn === 'editRead') return { fps: 25, video: [{ index: 0, clips: [{ start: 0, end: 4 }, { start: 4, end: 9 }] }], audio: [] }; if (fn === 'editSelection') return [{ kind: 'video', track: 0, start: 4, end: 9 }]; if (fn === 'mvfxMove') return { done: 1, skipped: [] }; return wasCall(fn, a); };
      mt.el.querySelector('.btn.primary').click();
      await new Promise(r => setTimeout(r, 60));
      const mv = calls.filter(c => c[0] === 'mvfxMove');
      if (mv.length !== 1 || mv[0][1].keys.length !== 2 || mv[0][1].keys[1].scale !== 112 || mv[0][1].targets[0].start !== 4) errors.push('mvfx: push in keys ' + JSON.stringify(mv.map(c => c[1])));
    } finally { US.host.call = wasCall; for (const k of Object.keys(US.settings.all()).filter(k => k.startsWith('mvfx.'))) US.settings.set(k, undefined); }
    checks.push(`mvfx: ${tiles.length} lower thirds, ${groups.length} groups, Tag → 2 text layers, Push in → keyframes`);
  }
  // Agent: a goal → its plan shown → Go → steps listed → what it made, with the sequences to open; then a follow-up
  {
    const at = US.tools.get('agent').create();
    w.document.body.appendChild(at.el);
    if (at.el.querySelectorAll('.chat-chips .chip').length !== US.agent.GOALS.length) errors.push('agent: no starting goals');
    const wasAI = US.ai, wasCall = US.host.call, turns = [];
    const T = (tool, args = {}, say = '', plan = []) => ({ say, plan, tool, argsJson: JSON.stringify(args) });
    const script = [T('plan', {}, 'My plan.', ['Search', 'Build', 'Finish']), T('themes'), T('version', { name: 'v1' }), T('finish', { summary: 'Made it.', check: ['Look at the ending'] }), T('finish', { summary: 'Shorter.' })];
    US.ai = Object.assign({}, wasAI, { available: () => true, label: () => 'Claude', provider: () => 'gemini', spending: () => ({ cost: 0 }), json: async req => { turns.push(req); return script[turns.length - 1]; } });
    US.host.call = async (fn, a) => (fn === 'cloneSequence' ? { id: 'v1', name: a.name } : fn === 'editRead' ? { id: 's1', name: 'Cut', duration: 30, video: [], audio: [] } : wasCall(fn, a));
    try {
      at.onShow({ goal: 'A 2-minute film about the bakery' });
      Array.from(at.el.querySelectorAll('.btn')).find(b => b.textContent === 'Make plan').click(); await new Promise(r => setTimeout(r, 50));
      const plan = at.el.querySelector('.agent-plan');
      if (!plan || plan.querySelectorAll('li').length !== 3) errors.push('agent: plan not shown');
      else { Array.from(plan.querySelectorAll('.btn')).find(b => b.textContent === 'Go').click(); await new Promise(r => setTimeout(r, 80)); }
      if (at.el.querySelectorAll('.agent-tool').length < 2) errors.push('agent: steps not listed');
      if (!/What it made/.test(at.el.textContent) || !/Made it\./.test(at.el.textContent) || !/Look at the ending/.test(at.el.textContent)) errors.push('agent: no report');
      if (!Array.from(at.el.querySelectorAll('.agent-seqs .btn')).some(b => b.textContent === 'Open')) errors.push('agent: the version to open is missing');
      at.el.querySelector('#agent-follow').value = 'shorter';
      Array.from(at.el.querySelectorAll('.btn')).find(b => b.textContent === 'Carry on').click(); await new Promise(r => setTimeout(r, 60));
      if (turns.length !== 5 || !/The editor follows up: “shorter”/.test(turns[4].turns[turns[4].turns.length - 1].user) || !/Shorter\./.test(at.el.textContent)) errors.push('agent: follow-up not carried on');
    } finally { US.ai = wasAI; US.host.call = wasCall; }
    checks.push(`agent: ${US.agent.GOALS.length} goals, plan → Go → ${at.el.querySelectorAll('.agent-tool').length} steps → report → follow-up`);
  }
  if (errors.length) { console.log('✗ UI smoke test\n  ' + errors.join('\n  ')); process.exit(1); }
  console.log('✓ UI smoke test · ' + checks.join(' · '));
  process.exit(0);
})().catch(e => { console.log('✗ UI smoke test: ' + e.stack); process.exit(1); });
