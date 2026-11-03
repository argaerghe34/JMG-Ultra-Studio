// Home › What's new: the latest versions read from whats-new.md, as plain text.
const assert = require('assert'), fs = require('fs'), path = require('path');
const { load, test, ROOT } = require('./harness');
const US = load(['js/tools/00-home.js']);

test('what’s new: newest versions first, bullets as plain text, a paragraph when there are no bullets', () => {
  const md = '## What\'s new in 1.4\n\n- **Bold** thing with *emphasis* and a [link](x.html)\n- `code` too\n\n## What\'s new in 1.3.9.1\n\nJust a paragraph.\n\n## What\'s new in 1.3.9\n\n- Old\n';
  const n = US.homeNews.parseNews(md, 2);
  assert.deepStrictEqual(n.map(x => x.version), ['1.4', '1.3.9.1']);
  assert.deepStrictEqual(n[0].items, ['Bold thing with emphasis and a link', 'code too']);
  assert.deepStrictEqual(n[1].items, ['Just a paragraph.']);
});
test('what’s new: the real file starts with the current version', () => {
  const n = US.homeNews.parseNews(fs.readFileSync(path.join(ROOT, 'dev', 'docs', 'whats-new.md'), 'utf8'), 3);
  assert.strictEqual(n.length, 3);
  assert.ok(n.every(x => x.items.length && x.items.every(i => !/\*\*/.test(i))));
});
