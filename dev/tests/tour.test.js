// The tour stays up to date with the panel: every tool a person can open has a tour, every step points at something
// that's really on screen, and the overview shows every place on the rail. When this fails after you changed a tool,
// update its steps in js/tools/04-tour-steps.js (or the tool's own `tour: [...]`).
const { test } = require('./harness');
const cp = require('child_process'), path = require('path');
const assert = require('assert');

let result = null;
function tour() {
  if (result) return result;
  const r = cp.spawnSync(process.execPath, [path.join(__dirname, 'tour-ui.js')], { encoding: 'utf8', timeout: 180000 });
  const last = (r.stdout || '').trim().split('\n').pop();
  try { result = JSON.parse(last); } catch (e) { throw new Error('tour-ui.js gave no result:\n' + (r.stdout || '').slice(-1500) + (r.stderr || '').slice(-1500)); }
  if (result.crash) throw new Error(result.crash);
  return result;
}

test('every tool has a tour (js/tools/04-tour-steps.js)', () => {
  assert.deepStrictEqual(tour().noTour, [], 'add tour steps for: ' + tour().noTour.join(', '));
});
test('every tour step points at something on screen', () => {
  assert.deepStrictEqual(tour().badSteps, [], 'fix these steps in js/tools/04-tour-steps.js:\n  ' + tour().badSteps.join('\n  '));
});
test('the overview shows every place on the rail', () => {
  assert.deepStrictEqual(tour().overviewMissingPlaces, [], 'add an overview step with target @rail:<place> for: ' + tour().overviewMissingPlaces.join(', '));
});
test('the tour starts from Settings, from Search and from the ? on each tab', () => {
  const r = tour();
  assert.ok(r.settingsButton, 'Settings › Take the tour didn’t start the overview');
  assert.ok(r.inSearch, 'Search doesn’t list “Take the tour”');
  assert.deepStrictEqual(r.questionMarks, [], 'no ? on these tabs: ' + r.questionMarks.join(', '));
});
