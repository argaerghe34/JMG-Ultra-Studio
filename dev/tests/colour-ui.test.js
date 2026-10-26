// Runs the headless Colour screen check (jsdom) in its own process.
const assert = require('assert'), cp = require('child_process'), path = require('path');
const { test } = require('./harness');
test('Colour screen: switching tabs while looks load keeps the LUT list right (jsdom)', () => {
  const r = cp.spawnSync(process.execPath, [path.join(__dirname, 'colour-ui.js')], { encoding: 'utf8', timeout: 60000 });
  assert.strictEqual(r.status, 0, (r.stdout || '') + (r.stderr || ''));
});
