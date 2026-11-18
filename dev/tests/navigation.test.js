// Nothing is lost in the navigation: every registered tool – rail, place tabs, Settings, Advanced and Advanced ›
// In development – can be reached by clicking, in the rail as places and in Settings › Classic rail, and every action the
// Assistant knows belongs to a tool that can be reached (dev/tests/navigation-ui.js runs the real panel in jsdom).
// A chat that adds a tool doesn't need to touch this: a tool with no place still gets a rail button of its own.
const { test } = require('./harness');
const cp = require('child_process'), path = require('path');
const assert = require('assert');

let result = null;
function nav() {
  if (result) return result;
  const r = cp.spawnSync(process.execPath, [path.join(__dirname, 'navigation-ui.js')], { encoding: 'utf8', timeout: 120000 });
  const last = (r.stdout || '').trim().split('\n').pop();
  try { result = JSON.parse(last); } catch (e) { throw new Error('navigation-ui.js gave no result:\n' + (r.stdout || '').slice(-1500) + (r.stderr || '').slice(-1500)); }
  if (result.crash) throw new Error(result.crash);
  return result;
}

test('every tool can be reached by clicking – places and Classic rail', () => {
  const r = nav();
  assert.deepStrictEqual(r.errors, [], 'a tool failed to load');
  assert.ok(r.tools.length >= 20, 'expected the whole panel, got ' + r.tools.length + ' tools');
  for (const [mode, m] of Object.entries(r.modes)) {
    assert.deepStrictEqual(m.missing, [], `${mode}: these tools can’t be reached: ${m.missing.join(', ')}`);
    assert.deepStrictEqual(m.actionsMissing, [], `${mode}: these actions belong to a tool that can’t be reached: ${m.actionsMissing.join(', ')}`);
  }
});

test('the rail as places is short; Classic rail keeps one button per tool', () => {
  const r = nav();
  assert.ok(r.modes.places.railButtons <= 9, 'places rail has ' + r.modes.places.railButtons + ' buttons');
  assert.ok(r.modes.classic.railButtons > r.modes.places.railButtons, 'classic rail should have more buttons');
});

test('Advanced keeps every tool it held: Selects, Subclip Maker, MC Selects, Take Sets, Song Splitter, Podcast, and In development', () => {
  const r = nav();
  for (const id of ['selects', 'subclips', 'mcselects', 'takes', 'songs', 'podcast']) {
    if (!r.tools.includes(id)) continue;   // a tool only one editor has (MC Selects is Premiere's)
    assert.ok(r.advanced.includes(id), id + ' is no longer in Advanced');
    assert.ok(/^Advanced › /.test(r.modes.places.how[id]), id + ' is not opened from Advanced: ' + r.modes.places.how[id]);
  }
  for (const id of ['colour', 'cameras', 'broll', 'sound', 'mvfx', 'memorybox']) if (r.tools.includes(id) && r.advanced.includes(id)) assert.ok(/^Advanced › /.test(r.modes.places.how[id]), id + ' (In development) is not opened from Advanced');
});
