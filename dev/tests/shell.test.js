// The shell after the user's notes of 19 Nov 2026 (dev/tests/shell-ui.js clicks through the real panel in jsdom):
// the rail's places, Ask at the bottom, stars and the rail's own order, Settings (Updates first, dropdowns, no “null”,
// sections other files add) and the hidden game.
const { test } = require('./harness');
const cp = require('child_process'), path = require('path');
const assert = require('assert');

let result = null;
function shell() {
  if (result) return result;
  const r = cp.spawnSync(process.execPath, [path.join(__dirname, 'shell-ui.js')], { encoding: 'utf8', timeout: 120000 });
  const last = (r.stdout || '').trim().split('\n').pop();
  try { result = JSON.parse(last); } catch (e) { throw new Error('shell-ui.js gave no result:\n' + (r.stdout || '').slice(-1500) + (r.stderr || '').slice(-1500)); }
  if (result.crash) throw new Error(result.crash);
  return result;
}
const place = id => shell().places.find(p => p.id === id);

test('the places: Home, Story, Edit, Deliver, Advanced and Ask – no Bring in, no Finish, nothing lost', () => {
  const r = shell();
  assert.deepStrictEqual(r.errors, []);
  assert.deepStrictEqual(r.places.map(p => p.id), ['home', 'story', 'cut', 'deliver', 'advanced', 'ask']);
  assert.strictEqual(place('cut').name, 'Edit');
  assert.deepStrictEqual(r.editTabs, ['quickfx', 'markers', 'safezones', 'silence', 'beats', 'producer'], 'Edit holds Quick effects, Markers, Safe Zones, Silence Cut, Beat Cut and Producer');
  assert.deepStrictEqual(r.deliverTabs, ['check', 'deliver'], 'Final Check is Deliver’s first tab');
  assert.ok(!place('story').tools.includes('producer'), 'Producer moved to Edit');
  // every tool that was in Bring in or Finish still has a place
  for (const id of ['youtube', 'quickfx', 'markers', 'safezones', 'check']) assert.ok(r.placeOf[id], id + ' has no place');
  for (const [id, pid] of Object.entries(r.placeOf)) if (id !== 'settings') assert.ok(r.places.some(p => p.id === pid), `${id} belongs to “${pid}”, which isn’t a place`);
  assert.ok(/^Deliver/.test(r.searchWhere.check) && /^Edit/.test(r.searchWhere.producer), 'Search says where they are now');
});

test('Download and mVFX are Advanced tools; Song Splitter is in development and out of Ask', () => {
  const r = shell();
  assert.ok(r.advanced.includes('youtube') && r.advanced.includes('mvfx'));
  assert.ok(!r.advanced.includes('songs') && r.paused.includes('songs'));
  assert.ok(!r.paused.includes('mvfx'), 'mVFX is no longer paused');
  assert.deepStrictEqual(r.paused.slice().sort(), ['broll', 'cameras', 'colour', 'memorybox', 'songs', 'sound']);
  assert.ok(!r.rail.includes('place:bring') && r.placeOf.youtube === 'advanced', 'Download is off the rail');
  assert.ok(!r.askActions.includes('songs'), 'Ask no longer uses Song Splitter');
  assert.ok(r.askActions.includes('youtube'), 'Ask can still open Download');
  assert.strictEqual(r.searchWhere.youtube, 'Advanced');
  assert.ok(/^Advanced › In development/.test(r.searchWhere.songs));
  assert.ok(/^Advanced ·/.test(r.searchWhere.mvfx));
});

test('Ask is the last thing on the rail, below Advanced, with its own look, and can’t be moved', () => {
  const r = shell();
  assert.deepStrictEqual(r.rail, ['place:home', 'place:story', 'place:cut', 'place:deliver', 'place:advanced', 'place:ask']);
  assert.ok(r.railAskLast, 'Ask should be the rail’s last child, after the spacer, with the sparkle in its ring');
  assert.strictEqual(r.askDraggable, false);
  assert.ok(r.classic.askLast, 'Classic rail: Ask is last too');
});

test('any tab can be starred onto the rail – a sub-tab, an Advanced tool, Settings – and taken off again', () => {
  const r = shell();
  assert.deepStrictEqual(r.starMissing, [], 'no star on: ' + r.starMissing.join(', '));
  assert.deepStrictEqual(r.noStarOn, [], 'Home, Advanced and Ask are always there and need no star');
  assert.deepStrictEqual(r.afterStars, ['place:home', 'place:story', 'place:cut', 'place:deliver', 'tool:wiki', 'tool:youtube', 'tool:settings', 'place:advanced', 'place:ask']);
  assert.deepStrictEqual(r.favsSaved, ['wiki', 'youtube', 'settings']);
  assert.strictEqual(r.favOpens, 'youtube', 'the starred button opens its tool');
  assert.ok(r.favLit.includes('youtube'));
  assert.ok(r.tabStar && r.starShown === '★');
  assert.ok(r.menu.some(x => /Remove from the sidebar/.test(x)), 'right-click offers Remove');
  assert.ok(!r.afterMenuRemove.includes('tool:wiki') && r.menuGone && r.starAfterRemove === '☆');
  assert.ok(!r.afterStarOff.includes('tool:youtube'), 'the same star takes it off');
  assert.ok(r.classic.hasFav && r.classic.settingsFav, 'Classic rail shows starred tools that have no button of their own');
});

test('the rail in your own order: Up/Down, dragging, kept in this computer’s settings – outside the app’s folder', () => {
  const r = shell();
  assert.deepStrictEqual(r.afterMoveUp.slice(0, 4), ['place:home', 'place:story', 'place:deliver', 'place:cut']);
  assert.deepStrictEqual(r.afterDrag, ['place:story', 'place:deliver', 'place:cut', 'tool:settings', 'place:advanced', 'place:home', 'place:ask'], 'Home dropped on Advanced goes after it; Ask stays last');
  assert.deepStrictEqual(r.savedOrder, r.afterDrag.slice(0, -1), 'the order is in settings.json');
  assert.deepStrictEqual(r.savedFavs, ['settings']);
  assert.ok(r.dataDirOutsideApp, 'settings.json must not be inside the folder an update replaces');
  assert.ok(!r.projectStoreHasIt, 'the order must not travel with the project to the other computer');
  const s = r.settings;
  assert.deepStrictEqual(s.sidebar, ['place:story', 'place:deliver', 'place:cut', 'tool:settings', 'tool:youtube', 'place:advanced', 'place:home', 'ask'], 'Settings › Sidebar lists the rail in order, a new star after the others');
  assert.ok(s.downMoved, 'Down moves a row and the rail');
  assert.ok(s.removed, 'Remove takes a star off');
  assert.ok(s.added, 'Add puts a tab on the rail');
  assert.deepStrictEqual(s.reset, ['place:home', 'place:story', 'place:cut', 'place:deliver', 'tool:youtube', 'tool:markers', 'place:advanced', 'place:ask'], 'Back to the usual order keeps the stars');
});

test('Settings: Updates first; the long parts are closed dropdowns; nothing removed', () => {
  const s = shell().settings;
  assert.strictEqual(s.firstCard, 'Updates');
  // Quick start sits just under Updates (note 57, js/tools/03-quickstart.js)
  assert.deepStrictEqual(s.cardOrder.slice(0, 4), ['Updates', 'Quick start', 'AI (optional)', 'What was sent to AI']);
  assert.deepStrictEqual(s.text, [], 'missing from Settings: ' + s.text.join(', '));
  for (const t of ['API keys', 'Models', 'Cost', 'Footage – what the AI may see', 'Without AI – what still works', 'Show the requests', 'Keeping and previewing']) assert.ok(s.sections.includes(t), 'no dropdown “' + t + '”');
  assert.deepStrictEqual(s.openSections, ['API keys'], 'only API keys is open (there is no key yet) – open: ' + s.openSections.join(', '));
  assert.ok(s.sentClosed && s.sentRows > 0);
  assert.ok(s.sentOpensWhenAsked, 'Search › What was sent to AI opens the dropdown');
});

test('Settings › What was sent to AI: no “null” above Refresh (Element.append(null) writes the word)', () => {
  const r = shell();
  assert.ok(r.settings.sentRows > 0, 'the log needs a request for this to mean anything');
  assert.deepStrictEqual(r.settings.nulls, [], '“null” shows in Settings at: ' + r.settings.nulls.join(' | '));
  assert.strictEqual(r.domAppendNull, 'null', 'the cause: the DOM’s own append() turns null into text');
  assert.strictEqual(r.usAppendNull, '', 'US.append leaves null out, as US.h does');
});

test('US.settingsSections.register: another file’s section shows in Settings as a closed dropdown, in order', () => {
  const s = shell().settings;
  // the panel's own sections are there too (Vision & listening models, order 35): every one in order, the test ones where they belong
  assert.deepStrictEqual(s.extra, ['test-early', 'test-late', 'understand', 'delivery', 'mcp', 'test-broken']);
  assert.ok(s.extraClosed && s.extraBody);
  assert.deepStrictEqual(s.extraAfter, ['test-early', 'test-late', 'test-live', 'understand', 'delivery', 'mcp', 'test-broken'], 'one registered while Settings is open shows too');
  assert.ok(s.sections.includes('Added by another file') && s.sections.includes('Broken one'), 'a section that fails to draw doesn’t take Settings down');
});

test('Settings › Take the tour offers the Full guide', () => assert.ok(shell().fullStarts));

test('the hidden game: “game” in the code box opens it; loaded only then; small; the rules hold', () => {
  const g = shell().game;
  assert.ok(!g.loadedAtStart && !g.inIndex && !g.inTools, 'the game must not load at start-up');
  assert.ok(g.bytes < 12000, 'the game is ' + g.bytes + ' bytes');
  assert.ok(g.scriptAsked && g.boxCleared && g.opened);
  assert.ok(g.hiddenStill, 'the game code must not unlock the hidden tabs');
  assert.ok(g.always.over && g.always.patience === 0, 'holding all the time lets three fluffs in: game over');
  assert.ok(!g.never.over && g.never.score === 0, 'never holding scores nothing and loses nothing');
  assert.ok(!g.perfect.over && g.perfect.patience === 3 && g.perfect.score > 1000 && g.perfect.kept > 10, 'keeping only good takes scores and keeps the client');
  assert.ok(g.bestKept);
});
