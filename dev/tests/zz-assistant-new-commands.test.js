// The Assistant understands the weekend's new commands without AI (and none of them steals another's phrasing).
const assert = require('assert');
const { load, test } = require('./harness');
global.addEventListener = global.addEventListener || (() => {});
global.ResizeObserver = global.ResizeObserver || function () { return { observe() {} }; };
const US = load(['time', 'audio', 'dsp', 'transcript', 'ui', 'app', 'js/tools/11-audio-kit.js', 'js/tools/20-silence-words.js', 'js/tools/20-silence-punch.js', 'js/tools/20-silence.js', 'js/tools/22-story-glossary.js', 'js/tools/22-story-board.js', 'js/tools/22-story-export.js', 'js/tools/22-story-timeline.js', 'js/tools/22-story-narrative.js', 'js/tools/22-story-moments.js', 'js/tools/22-story-ai.js', 'js/tools/22-story-clips.js', 'js/tools/22-story-heat.js', 'js/tools/22-story-script.js', 'js/tools/22-story-reference.js', 'js/tools/22-story-crops.js', 'js/tools/22-story.js', 'js/tools/27-takes.js', 'js/tools/21-beats.js', 'js/tools/28-podcast.js', 'js/tools/35-markers.js', 'js/tools/29-words.js', 'js/tools/33-deliver-text.js', 'js/tools/33-deliver.js', 'js/tools/40-assistant.js', 'js/tools/41-edit.js', 'js/tools/42-recipes.js']);
const m = t => (US.assistant.matchOffline(t).steps[0] || {});

test('new commands by plain words', () => {
  const cases = [
    ['find clips for TikTok', 'story.clips'], ['find 5 short clips from this podcast episode', 'story.clips'], ['make a beat map', 'story.beats'],
    ['write the show notes', 'deliver.text'], ['give me titles and a description for this episode', 'deliver.text'],
    ['keep the best takes', 'takes.cut'], ['get rid of the retakes', 'takes.cut'], ['switch the podcast cameras', 'podcast.switch'],
    ['cut the ums and the false starts', 'silence.cut'], ['run my Podcast episode recipe', 'recipes.run'], ['build a 3 minute cut from the themes', 'story.build'],
    ['show me a word cloud', 'words.cloud'], ['what are the most common words in the interviews', 'words.cloud'],
    ['build every time they say “community”', 'words.build'], ['make a supercut of everyone saying amazing', 'words.build'], ['find where they talk about faith', 'story.search'], ['build from my script', 'story.script'], ['use this timeline as a reference', 'story.reference'], ['punch in on the jump cuts', 'silence.punch'], ['add a marker every 30 seconds', 'markers.add'], ['put a marker at every cut', 'markers.add'], ['remove duplicate markers', 'markers.clean'], ['copy the markers as youtube chapters', 'markers.export'], ['add a marker on every beat of the music', 'beats.markers'], ['cut it like my last video', 'story.reference'], ['match this paper edit to the interviews', 'story.script']
  ];
  for (const [t, want] of cases) assert.strictEqual(m(t).action, want, t);
  assert.strictEqual(m('find 5 short clips from this podcast episode').params.source, 'timeline');
  assert.strictEqual(m('make a supercut of everyone saying amazing').params.text, 'amazing');
  assert.strictEqual(m('cut the ums and the false starts').params.fillers, true);
  assert.strictEqual(m('cut the ums and the false starts').params.pauses, false);
  assert.notStrictEqual(m('make subclips of this bin').action, 'story.clips', 'subclips aren’t social clips');
  assert.notStrictEqual(m('add subtitles to the sequence').action, 'deliver.text');
  const sug = US.assistant.suggest('remove the silent bits');
  assert.strictEqual(sug[0] && sug[0].a.id, 'silence.cut', JSON.stringify(sug.map(x => x.a.id)));
});
