const assert = require('assert');
const { load, test } = require('./harness');
const US = load(['js/tools/01-overnight.js']);

test('overnight footage: camera clips only – not Ultra Studio’s own bins, subclips, stills or offline media', () => {
  const v = (name, extra) => Object.assign({ id: name, name, kind: 'video', path: '/f/' + name, bin: 'Footage', offline: false, subclip: false }, extra);
  const got = US.overnight.footageOf([v('A.mov'), v('B.mp4', { offline: true }), v('C.mov', { subclip: true }), v('D.png', { path: '/f/D.png' }),
    v('E.mov', { bin: 'JMG Ultra Studio / Selects' }), v('F.mov', { bin: 'Interviews / Day 1' }), { id: 'w', kind: 'audio', path: '/f/w.wav' }, null]);
  assert.deepStrictEqual(got.map(x => x.id), ['A.mov', 'F.mov']);
});
test('overnight is understood by the Assistant', () => {
  assert.ok(US.actions.get('overnight.run').match('get this project ready overnight'));
  assert.strictEqual(US.actions.get('overnight.run').match('cut the silences'), null);
});
