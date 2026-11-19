// The shell after the notes of 19 Nov 2026, in the real panel: the rail's places with Ask at the bottom, stars and the
// rail's own order (put back as they were afterwards – the dev panel shares the installed copy's settings), Settings
// with Updates first and no “null”, and the hidden game opening from the code box. Changes nothing in the project.
const notes = [], $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
const keep = { favs: US.settings.get('ui.favs', []), order: US.settings.get('ui.railOrder', []), classic: US.settings.get('ui.classicRail', false), last: US.tools.current };
const keys = () => $$('.rail .rail-btn').map(b => b.dataset.place ? 'place:' + b.dataset.place : 'tool:' + b.dataset.id);
try {
  US.settings.set('ui.classicRail', false); US.settings.set('ui.favs', []); US.railOrder.reset();
  await T.sleep(200);
  T.assert(JSON.stringify(keys()) === JSON.stringify(['place:home', 'place:story', 'place:cut', 'place:deliver', 'place:advanced', 'place:ask']), 'the rail is Home, Story, Edit, Deliver, Advanced, Ask – got ' + keys().join(', '));
  const rail = document.querySelector('.rail'), ask = rail.querySelector('.rail-ask'), adv = rail.querySelector('[data-place="advanced"]');
  const ra = ask.getBoundingClientRect(), rr = rail.getBoundingClientRect();
  T.assert(ra.top > adv.getBoundingClientRect().bottom - 1 && rr.bottom - ra.bottom < 16, `Ask sits at the bottom of the rail (${Math.round(rr.bottom - ra.bottom)} px from it)`);
  T.assert(getComputedStyle(ask.querySelector('.ask-orb'), '::before').backgroundImage.includes('conic-gradient'), 'Ask has its ring');
  notes.push(`rail ${Math.round(rr.height)} px high, Ask ${Math.round(rr.bottom - ra.bottom)} px from the bottom`);

  // the places' tabs
  US.tools.open('check'); await T.sleep(300);
  T.assert($$('.place-tabs:not(.hidden) .place-tab').map(t => t.dataset.tool).join() === 'check,deliver', 'Final Check is Deliver’s first tab');
  US.tools.open('quickfx'); await T.sleep(300);
  const edit = $$('.place-tabs:not(.hidden) .place-tab').map(t => t.dataset.tool);
  T.assert(['quickfx', 'markers', 'safezones', 'silence', 'beats', 'producer'].every(id => edit.includes(id)), 'Edit holds its six tabs – got ' + edit.join(', '));
  const tabs = document.querySelector('.place-tabs');
  notes.push(`Edit’s tabs: ${tabs.scrollWidth > tabs.clientWidth + 1 ? 'scroll sideways at this width' : 'fit'} (${tabs.clientWidth} px)`);

  // star a sub-tab and an Advanced tool; reorder; unstar
  for (const id of ['wiki', 'youtube']) { US.tools.open(id); await T.sleep(300); const s = document.querySelector(`.view > :not(.hidden) .fav-btn[data-star="${id}"]`); T.assert(s, id + ' has a star'); s.click(); await T.sleep(150); }
  T.assert(keys().join() === 'place:home,place:story,place:cut,place:deliver,tool:wiki,tool:youtube,place:advanced,place:ask', 'starred tabs get rail buttons – ' + keys().join(', '));
  US.tools.open('home'); await T.sleep(200);
  rail.querySelector('[data-fav="youtube"]').click(); await T.sleep(300);
  T.assert(US.tools.current === 'youtube', 'the starred button opens Download');
  US.railOrder.move('tool:wiki', -1); await T.sleep(150);
  T.assert(keys().indexOf('tool:wiki') === 3, 'Up moves it');
  T.assert(rail.scrollHeight <= rail.clientHeight + 1 || rail.querySelector('.rail-ask'), 'the rail still shows Ask');
  US.favs.toggle('wiki', false); US.favs.toggle('youtube', false); await T.sleep(150);
  T.assert(!keys().some(k => /^tool:/.test(k)), 'unstarred: off the rail');
  $$('.toast').forEach(t => t.remove());

  // Settings: Updates first, no “null”, the dropdowns closed
  US.tools.open('settings'); await T.sleep(500);
  const set = document.querySelector('.view > :not(.hidden)');
  T.assert(set.querySelector('.card-title').textContent === 'Updates', 'Updates is the first card');
  const refresh = $$('[data-section="sent"] button', set).find(b => b.textContent.trim() === 'Refresh'); refresh.click(); await T.sleep(300);
  const nulls = []; { const tw = document.createTreeWalker(set, NodeFilter.SHOW_TEXT); for (let n = tw.nextNode(); n; n = tw.nextNode()) if (/^\s*(null|undefined)\s*$/.test(n.nodeValue)) nulls.push(n.parentNode.className || n.parentNode.tagName); }
  T.assert(!nulls.length, 'no “null” anywhere in Settings – ' + nulls.join(', '));
  T.assert(set.querySelector('[data-section="sent"] .section.closed') && set.querySelector('[data-section="ai-cost"] .section.closed'), 'What was sent and Cost start closed');
  notes.push(`Settings is ${document.querySelector('.view').scrollHeight} px tall with everything closed`);

  // the game opens from the code box, and closes
  const code = set.querySelector('.settings-code input');
  code.value = 'game'; code.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  await T.sleep(900);
  const canvas = document.querySelector('.modal .game-canvas');
  T.assert(canvas && US.game, 'typing “game” opens Rough Cut');
  T.assert(canvas.getContext('2d').getImageData(0, 80, canvas.width, 60).data.some(x => x > 0), 'the game draws');
  $$('.modal .btn').forEach(b => b.click()); await T.sleep(200);
  T.assert(!document.querySelector('.game-canvas'), 'Back to work closes it');
} finally {
  US.settings.set('ui.favs', keep.favs); US.settings.set('ui.railOrder', keep.order); US.settings.set('ui.classicRail', keep.classic);
  US.rebuildRail(); $$('.toast, .rail-menu').forEach(t => t.remove());
  US.tools.open(keep.last || 'home');
}
return notes;
