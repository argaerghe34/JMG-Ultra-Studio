// Story › reading from Resolve: recordings of the same moment on several devices are recognised by their words.
const assert = require('assert');
const { load, test } = require('./harness');
const US = load(['time', 'transcript', 'ui', 'app', 'js/tools/22-story-ai.js', 'js/tools/22-story-captions.js', 'js/tools/22-story.js']);

test('story: the same words from two devices are one recording; a different interview is not', () => {
  const said = 'I was born in Haifa in nineteen fifty two and my father ran the bakery on the corner of the market where everyone came on Friday mornings for challah';
  const w = s => s.split(' ');
  const camA = w(said), lav = w('um ' + said.replace('bakery', 'bakeries') + ' yes'), other = w('We moved to London when I was nine and I did not speak a word of English at school for the first year at least');
  const g = US.story.sameRecordings([{ key: 'camA', words: camA }, { key: 'lav', words: lav }, { key: 'other', words: other }]);
  assert.deepStrictEqual(g, [['camA', 'lav']]);
  assert.deepStrictEqual(US.story.sameRecordings([{ key: 'a', words: w('yes no') }, { key: 'b', words: w('yes no') }]), [], 'too short to tell');
});
