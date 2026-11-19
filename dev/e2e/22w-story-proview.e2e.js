// Story › Pro View (was Lines) in the real editor: a stand-in transcript at Ruth's interview times, a theme, a Find
// search, questions and moments. The tab opens on what Themes / Find pass it; the list has a group for each; ticking
// lines and adding them at the end of the open sequence places them (nothing already there moves); “used” then marks
// exactly those lines and “Hide used lines” leaves the rest; sorting, a column moved and resized, the list hidden.
if (!US.story || !US.proView) throw new Error('Story (Pro View) is not loaded in the panel');
const S = US.story, P = US.proView;
const fs = require('fs');
const BIN = 'Test – Story', SEQ = 'Test – Story Pro View';
const W = ms => new Promise(r => setTimeout(r, ms));
const $ = (q, root) => (root || document).querySelector(q), $$ = (q, root) => Array.from((root || document).querySelectorAll(q));
const prevBase = US.settings.get('story.binBase');
const prevSet = {}; for (const k of ['cols', 'listHidden', 'folded', 'used', 'hideUsed', 'addWhere']) prevSet[k] = US.settings.get('proview.' + k);
US.settings.set('story.binBase', BIN);
const st = S.loadState();
const saved = JSON.parse(JSON.stringify({ wall: st.wall, themes: st.themes, picky: st.picky || null, moments: st.moments || null, questions: st.questions || null, finds: st.finds || null, proView: st.proView || null, scope: st.scope || { kind: 'all' } }));
st.scope = { kind: 'all' };
const lastTool = US.tools.current;
try {
  const [ruth] = await T.importOnce([T.media('interview', 'I001_interview.mp4')], BIN);
  const job = US.jobs.testJob('story');
  const segs = [
    { start: 0.6, end: 5.3, speaker: 'Ruth', text: 'My name is Ruth, and I grew up in a small flat in Stamford Hill.' },
    { start: 5.8, end: 10, speaker: 'Ruth', text: 'Sorry, can I start that again? I lost my thread.' },
    { start: 12.5, end: 19.1, speaker: 'Ruth', text: 'Every Friday night the table was full, and the dog once ate the challah [laughs].' },
    { start: 19.7, end: 21, speaker: 'Interviewer', text: 'Oh wow.' },
    { start: 21.5, end: 26, speaker: 'Ruth', text: 'My father always said a home is only as warm as the door is open.' },
    { start: 26.5, end: 31, speaker: 'Ruth', text: '[laughs]' },
    { start: 33, end: 39, speaker: 'Ruth', text: 'When my mother passed away I cried for weeks, and I still miss her every day.' },
    { start: 39.5, end: 43.4, speaker: 'Lily', text: 'Mum, the taxi is here!' }
  ];
  await S.importFiles(job, [T.media('transcripts', 'I001_interview.srt')]);
  const real = p => { try { return fs.realpathSync(p); } catch (e) { return p; } };
  const t0 = st.transcripts.find(t => t.path && real(t.path) === real(ruth.path));
  const tr = S.addTranscript({ name: t0.name, path: t0.path, itemId: t0.itemId || ruth.id, source: 'file', segments: segs });
  const L = tr.lines, id = re => L.find(l => re.test(l.text)).id;
  st.themes = []; st.wall = { mode: 'columns', columns: [], loose: [] }; st.picky = { s: S.PICKY_LEVELS.all }; st.proView = null; st.finds = null;
  const th = S.newThemeFrom('Home', [id(/small flat/), id(/Friday night/), id(/door is open/)]);
  st.questions = { list: ['Where did you grow up?'], by: 'basic', results: [{ q: 0, question: 'Where did you grow up?', answers: [{ from: id(/small flat/), to: id(/start that again/) }] }] };
  st.moments = { at: Date.now(), by: 'basic', list: [{ lineId: id(/^\[laughs\]$/), type: 'funny', score: 0.95, reasons: ['Laughter'] }, { lineId: id(/passed away/), type: 'poignant', score: 0.95, reasons: ['Emotional words'] }] };
  const e = P.remember(st, { q: 'door', mode: 'search', at: Date.now() }, [id(/door is open/)]);
  S.save();
  ['cols', 'folded'].forEach(k => US.settings.set('proview.' + k, null));
  US.settings.set('proview.listHidden', false); US.settings.set('proview.used', false); US.settings.set('proview.hideUsed', false);

  // the tab, renamed, opened on a theme the way Themes' “Open in Pro View” does
  T.assert(US.tools.get('storylines').name === 'Pro View', 'the tab is called Pro View');
  US.tools.open('storylines', { source: 'theme:' + th.id }); await W(500);
  const tool = $('.tool.pv');
  const rowIds = () => $$('.pv-rows .pv-row', tool).map(r => r.dataset.id);
  T.assert($('.tool-head', tool).textContent.includes('Pro View'), 'title: ' + $('.tool-head', tool).textContent.slice(0, 40));
  T.assert($$('.pv-gh', tool).map(g => g.dataset.group).join() === 'themes,finds,questions,moments', 'groups: ' + $$('.pv-gh', tool).map(g => g.dataset.group).join());
  T.assert(rowIds().length === 3 && $('.pv-item.on', tool).textContent.includes('Home'), 'the theme’s three lines: ' + rowIds().length);
  // …and on a search the way Find's does; every search is in the list
  US.tools.open('storylines', { find: { q: 'door', mode: 'search' } }); await W(300);
  T.assert(rowIds().join() === id(/door is open/) && $('.pv-item.on', tool).textContent.includes('door'), 'the search’s line');
  // answers (one row for the whole answer) and moments (nothing said → what happens)
  US.tools.open('storylines', { source: 'q:all' }); await W(300);
  T.assert(rowIds().length === 1 && /small flat.*lost my thread/.test($('.pv-rows .sl-text', tool).textContent), 'one row for the whole answer');
  US.tools.open('storylines', { source: 'm:all' }); await W(300);
  T.assert(rowIds().length === 2 && $$('.pv-rows .pv-desc', tool).length === 1 && /Laughter/.test($('.pv-rows .pv-desc', tool).textContent), 'a moment with nothing said shows why it was picked: ' + $$('.pv-rows .sl-text', tool).map(x => x.textContent).join(' | '));

  // sort by Length, then reverse
  US.tools.open('storylines', { source: 'all' }); await W(300);
  const lens = () => $$('.pv-rows .sl-len', tool).map(x => parseFloat(x.textContent));
  $('.pv-th[data-col="len"] .pv-thb', tool).click(); await W(100);
  const up = lens(); T.assert(up.every((x, i) => !i || up[i - 1] <= x), 'shortest first: ' + up.join());
  $('.pv-th[data-col="len"] .pv-thb', tool).click(); await W(100);
  const down = lens(); T.assert(down.every((x, i) => !i || down[i - 1] >= x) && /↓/.test($('.pv-th[data-col="len"]', tool).textContent), 'again reverses: ' + down.join());
  $('.pv-th[data-col="time"] .pv-thb', tool).click(); await W(100);

  // tick two lines (the second with shift: the range), add them at the end of the open sequence
  const old = await T.seqByName(SEQ); if (old) await US.host.call('deleteSequence', { seqId: old.id });
  const seq = await US.host.call('newSequence', { name: SEQ, binPath: BIN, likeId: ruth.id });
  await US.host.call('placeClips', { seqId: seq.id, cursor: 0, clips: [{ id: ruth.id, in: 33, out: 39 }] });   // “passed away” is already in the cut
  await T.open(seq.id);
  const boxes = () => $$('.pv-rows .pv-tick input', tool);
  boxes()[0].click(); await W(50);
  boxes()[1].dispatchEvent(new MouseEvent('click', { bubbles: true, shiftKey: true })); await W(100);
  T.assert(/^2 ticked/.test($('.pv-bar-n', tool).textContent) && /Add 2 lines to a sequence/.test($('.pv-bar', tool).textContent), 'the bar: ' + $('.pv-bar', tool).textContent.slice(0, 60));
  const ticked = rowIds().filter((x, i) => boxes()[i].checked).map(x => S.lineOf(x));
  await S.placeAtEnd(ticked);
  const info = await US.host.call('sequenceInfo', { seqId: seq.id });
  const clips = info.video[0].clips;
  T.assert(clips.length === 3, `the clip that was there and two lines after it: ${clips.length}`);
  T.near(clips[0].start, 0, info.frame * 1.5, 'what was there has not moved'); T.near(clips[0].end, 6, info.frame * 1.5, 'nor been cut');
  T.near(clips[1].start, 6, info.frame * 1.5, 'the first line starts at the old end');
  T.near(clips[1].in, ticked[0].start, info.frame * 1.5, 'cut to the line');
  T.near(clips[2].out, ticked[1].end, info.frame * 1.5, 'the second line follows');

  // “used”: the lines in the sequence get a tick; hiding them leaves the rest
  const usedIds = await S.usedInSequence(job, seq.id);
  T.assert([ticked[0].id, ticked[1].id, id(/passed away/)].every(x => usedIds.has(x)) && !usedIds.has(id(/taxi/)), 'used: ' + Array.from(usedIds).length);
  if ($('.pv-opts .section', tool).classList.contains('closed')) $('.pv-opts .section-head', tool).click();
  await W(50);
  { const t = $$('.pv-opts .toggle input', tool); if (t[1].checked) { t[1].click(); await W(300); } if (t[0].checked) { t[0].click(); await W(300); } }
  $$('.pv-opts .toggle input', tool)[0].click();   // on: reads the open sequence
  for (let i = 0; i < 40 && !$$('.pv-rows .pv-used', tool).length; i++) await W(250);
  T.assert($('.pv-th[data-col="used"]', tool) && $$('.pv-rows .pv-used', tool).length === 3, 'three lines marked used: ' + $$('.pv-rows .pv-used', tool).length);
  const before = rowIds().length;
  $$('.pv-opts .toggle input', tool)[1].click(); await W(300);
  T.assert(rowIds().length === before - 3 && !rowIds().includes(id(/passed away/)), `used lines hidden: ${before} → ${rowIds().length}`);
  $$('.pv-opts .toggle input', tool)[1].click(); await W(200);

  // star by hand; a column moved and resized is remembered; the list folds away
  const sid = id(/taxi/), was = P.isStar(st, sid, S.isStrong(S.lineOf(sid)));
  $(`.pv-rows .pv-row[data-id="${sid}"] .pv-c-star`, tool).click(); await W(150);
  T.assert(P.isStar(st, sid, S.isStrong(S.lineOf(sid))) === !was, 'the star flips');
  const pe = (el, type, x) => el.dispatchEvent(new PointerEvent(type, { bubbles: true, clientX: x, clientY: 10, button: 0 }));
  const whoW = $('.pv-th[data-col="who"]', tool).getBoundingClientRect().width;
  pe($('.pv-th[data-col="who"] .pv-grip', tool), 'pointerdown', 300); pe(window, 'pointermove', 340); pe(window, 'pointerup', 340); await W(50);
  T.near($('.pv-th[data-col="who"]', tool).getBoundingClientRect().width, whoW + 40, 2, 'the column is 40 px wider');
  const lb = $('.pv-th[data-col="len"] .pv-thb', tool), lr = lb.getBoundingClientRect(), wr = $('.pv-th[data-col="who"]', tool).getBoundingClientRect();
  pe(lb, 'pointerdown', lr.left + 5); pe(window, 'pointermove', lr.left - 30); pe(window, 'pointermove', wr.left + 4); pe(window, 'pointerup', wr.left + 4); await W(100);
  const order = $$('.pv-th', tool).map(x => x.dataset.col);
  T.assert(order.indexOf('len') === order.indexOf('who') - 1, 'Length moved before Who: ' + order.join());
  const kept = US.settings.get('proview.cols');
  T.assert(kept && kept.widths.who === Math.round(whoW + 40) && kept.order.indexOf('len') < kept.order.indexOf('who'), 'kept on this computer: ' + JSON.stringify(kept));
  if (US.settings.get('proview.listHidden')) { $('.pv-listbtn', tool).click(); await W(100); }
  const tw2 = $('.pv-table', tool).getBoundingClientRect().width;
  $('.pv-listbtn', tool).click(); await W(100);
  T.assert($('.pv-table', tool).getBoundingClientRect().width > tw2 && US.settings.get('proview.listHidden') === true, 'the list hidden: the table is wider');
  // archive the search, and get it back
  $('.pv-listbtn', tool).click(); await W(50);
  $(`[data-archive="${e.id}"]`, tool).click(); await W(150);
  T.assert($('.pv-gh[data-group="archived"]', tool) && P.searches(st, { archived: true }).length === 1, 'archived');
  $('.pv-gh[data-group="archived"]', tool).click(); await W(50); $(`[data-restore="${e.id}"]`, tool).click(); await W(150);
  T.assert(P.searches(st).some(x => x.id === e.id) && !$('.pv-gh[data-group="archived"]', tool), 'and back');
  return { rows: before, used: usedIds.size, order: order.join() };
} finally {
  Object.assign(st, saved); if (!saved.proView) delete st.proView; if (!saved.finds) delete st.finds; if (!saved.questions) delete st.questions; if (!saved.moments) delete st.moments;
  try { await S.importFiles(US.jobs.testJob('story'), [T.media('transcripts', 'I001_interview.srt')]); } catch (e) { /* the next Story test re-imports it */ }
  S.save();
  for (const k of Object.keys(prevSet)) US.settings.set('proview.' + k, prevSet[k] === undefined ? null : prevSet[k]);
  US.settings.set('story.binBase', prevBase || '');
  if (lastTool) US.tools.open(lastTool);
}
