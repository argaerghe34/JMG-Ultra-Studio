// Story › Share › Transcript of a timeline: the AI names the voices from what's said (text only), "(not sure)" on a
// guess; a typed name wins; the switch turns the AI's names off.
const assert = require('assert');
const { load, test } = require('./harness');
const US = load(['time', 'transcript', 'ui', 'app', 'js/tools/22-story-ai.js', 'js/tools/22-story-captions.js', 'js/tools/22-story-export.js', 'js/tools/22-story-timeline.js', 'js/tools/22-story.js']);
const S = US.story;

test('story: speaker names from the AI – text only, wiki people included, sure / not sure, typed names win', async () => {
  const st = S.loadState();
  const keep = { transcripts: st.transcripts, wiki: st.wiki, whoIsWho: st.whoIsWho, speakerAI: st.speakerAI }, keepAI = US.ai, keepSet = US.settings.get('story.tlAINames');
  try {
    const L = (id, start, text, speaker) => ({ id, start, end: start + 3, text, speaker });
    st.transcripts = [
      { key: 'k-ruth', name: 'ruth.mov', path: '/m/ruth.mov', lines: [L('a', 0, 'So Ruth, tell me where you grew up.', 'Speaker 1'), L('b', 4, 'I grew up in Haifa, by the sea, above my father’s bakery.', 'Speaker 2')] },
      { key: 'k-dav', name: 'david.wav', path: '/m/david.wav', lines: [L('c', 0, 'We lit the candles every Friday night.', 'Speaker 1')] }
    ];
    st.wiki = { data: { person: [{ name: 'Ruth Cohen', summary: 'Grew up in Haifa above the family bakery.' }, { name: 'David Levy', summary: 'Ruth’s cousin.' }], interviews: [{ title: 'Ruth Cohen', summary: 'Childhood in Haifa.' }] } };
    st.whoIsWho = {}; st.speakerAI = {};
    const sp = (clipKey, label, first) => ({ key: clipKey + '|' + label, label, clipName: clipKey === 'k-ruth' ? 'ruth.mov' : 'david.wav', clipKey, talk: 3, first });
    const tl = { info: { name: 'Cut' }, result: { entries: [], speakers: [sp('k-ruth', 'Speaker 1', 0), sp('k-ruth', 'Speaker 2', 4), sp('k-dav', 'Speaker 1', 9)] } };
    const sent = [];
    US.ai = { available: () => true, label: () => 'Claude Test', approveTotal: async () => {}, estimateFor: () => ({ usd: 0.01 }),
      json: async req => { sent.push(req); return { voices: [{ key: 'k-ruth|Speaker 1', name: 'Interviewer', sure: true, why: 'asks the questions' }, { key: 'k-ruth|Speaker 2', name: 'Ruth Cohen', sure: true, why: 'addressed as Ruth' }, { key: 'k-dav|Speaker 1', name: 'David Levy', sure: false, why: 'only cousin in the story' }, { key: 'not-asked', name: 'X', sure: true, why: '' }] }; } };
    const job = { check() {}, set() { return job; }, progress() { return job; } };
    const r = await S.nameSpeakersAI(job, tl);
    assert.strictEqual(sent.length, 1);
    const u = sent[0].user;
    assert.ok(/Ruth Cohen: Grew up in Haifa/.test(u) && /So Ruth, tell me/.test(u) && /k-dav\|Speaker 1/.test(u), 'reads the wiki’s people, the opening and every voice key');
    assert.ok(!/\/m\//.test(u), 'no file paths: only the words');
    assert.ok(/1 marked “not sure”/.test(r.summary), r.summary);
    let d = S.namesFor(tl);
    assert.deepStrictEqual(tl.result.speakers.map(s => d.get(s.key)), ['Interviewer', 'Ruth Cohen', 'David Levy (not sure)']);
    assert.ok(!st.speakerAI['not-asked'], 'a key it wasn’t asked about is ignored');
    st.whoIsWho['k-dav|Speaker 1'] = 'Dave';
    d = S.namesFor(tl); assert.strictEqual(d.get('k-dav|Speaker 1'), 'Dave', 'a typed name wins');
    US.settings.set('story.tlAINames', false);
    d = S.namesFor(tl); assert.deepStrictEqual(tl.result.speakers.map(s => d.get(s.key)), ['Speaker A', 'Speaker B', 'Dave'], 'switched off: the AI’s names go');
    // only the ones without a name are asked again, unless "Ask again"
    sent.length = 0;
    const r2 = await S.nameSpeakersAI(job, tl);
    assert.strictEqual(sent.length, 0); assert.ok(/already/.test(r2.summary));
    await S.nameSpeakersAI(job, tl, { again: true }); assert.strictEqual(sent.length, 1);
  } finally { Object.assign(st, keep); US.ai = keepAI; US.settings.set('story.tlAINames', keepSet); }
});
