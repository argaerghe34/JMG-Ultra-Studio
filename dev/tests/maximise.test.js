// ` maximises the panel on the Mac, like Premiere's own panels: not while typing in a box, not with ⌘/Ctrl/⌥; the
// AppleScript picks Premiere's own Window › Maximize Frame (or Restore Frame Size).
const assert = require('assert');
const { load, test } = require('./harness');
const US = load([]);
const K = (o, tag = 'DIV') => Object.assign({ code: 'Backquote', key: '`', metaKey: false, ctrlKey: false, altKey: false, target: { tagName: tag, isContentEditable: false } }, o);

test('` maximises; typing it in a box, or with ⌘/Ctrl/⌥, doesn’t', () => {
  const k = US.maximise.isKey;
  assert.ok(k(K({})) && k(K({ key: '~', shiftKey: true })), 'with Shift too (Premiere: the active frame)');
  for (const tag of ['INPUT', 'TEXTAREA', 'SELECT']) assert.ok(!k(K({}, tag)), tag);
  assert.ok(!k(K({ target: { tagName: 'DIV', isContentEditable: true } })));
  assert.ok(!k(K({ metaKey: true })) && !k(K({ ctrlKey: true })) && !k(K({ altKey: true })));
  assert.ok(!k(K({ code: 'KeyA', key: 'a' })));
});

test('the menu item it chooses: Premiere’s own Maximize Frame / Restore Frame Size', () => {
  const s = US.maximise.SCRIPT;
  assert.ok(/process whose name starts with "Adobe Premiere Pro"/.test(s) && /menu "Window"/.test(s) && /starts with "Maximize"/.test(s) && /starts with "Restore Frame"/.test(s) && /click item 1/.test(s));
});
