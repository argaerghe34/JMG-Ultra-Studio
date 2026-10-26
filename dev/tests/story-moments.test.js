// Story › Moments (S5): the cues (restarts, retakes, stumbles, crew chatter, laughter, swearing, off-camera voices,
// pauses, emotion), the AI check, How picky, the board and markers on a string-out.
const assert = require('assert'), path = require('path');
const { load, test, MEDIA } = require('./harness');
global.addEventListener = global.addEventListener || (() => {});
global.ResizeObserver = global.ResizeObserver || function () { return { observe() {} }; };
const US = load(['time', 'transcript', 'ui', 'app', 'js/tools/22-story-board.js', 'js/tools/22-story-export.js', 'js/tools/22-story-timeline.js', 'js/tools/22-story-narrative.js', 'js/tools/22-story-moments.js', 'js/tools/22-story-ai.js', 'js/tools/22-story.js', 'js/tools/40-assistant.js']);
const S = US.story, T = US.transcript, M = US.storyMoments;
const job = { set() {}, progress() {}, check() {}, log() {} };

const mk = (id, start, end, speaker, text, extra) => Object.assign({ id, start, end, speaker, text }, extra);
const RUTH = [
  mk('a', 0, 4, 'Ruth', 'My name is Ruth and I grew up in'),
  mk('b', 4.5, 8, 'Ruth', 'My name is Ruth, sorry, can I start again?'),
  mk('c', 9, 10, 'Interviewer', 'Wow, really?'),
  mk('d', 10.5, 18, 'Ruth', 'When my mother passed away I cried for weeks, and I still miss her so much.'),
  mk('e', 18.5, 21, 'Ruth', 'Is it recording? Okay, good.'),
  mk('f', 21.5, 26, 'Ruth', 'And then the the the dog ate the challah [laughs]'),
  mk('g', 26.5, 29, 'Interviewer', 'What did you do next?'),
  mk('h', 29.5, 31, 'Ruth', 'We just'),
  mk('i', 34, 38, 'Ruth', 'carried on, the way you do.'),
  mk('j', 38.5, 40, 'Ruth', 'Cut.'),
  mk('k', 41, 44, 'Lily', 'Mum, the taxi is here!'),
  mk('l', 44.5, 48, 'Ruth', 'Oh [ __ ], sorry.'),
  mk('m', 48.5, 55, 'Ruth', 'We had very, very little, but the door was always open.'),
  mk('n', 55.5, 60, 'Ruth', 'Education, education, education – that was the rule.'),
  mk('o', 60.5, 65, 'Ruth', 'So I I think we we went to to the market every week.'),
  mk('p', 65.5, 67, 'Ruth', 'And the best part was'),
  mk('q', 75.5, 79, 'Ruth', 'the singing, every Friday.')
];
const byId = list => new Map(list.map(m => [m.lineId, m]));

test('cues: restarts, retakes, stumbles, crew chatter, “cut”, laughter, bleeped swearing, a second voice, the interviewer reacting, pauses, emotion', () => {
  const found = byId(M.detect([{ key: 'k', lines: RUTH }]));
  const t = id => found.get(id) && found.get(id).type;
  assert.strictEqual(t('a'), 'blooper', 'abandoned first take (retake)'); assert.ok(found.get('a').cues.includes('retake'));
  assert.strictEqual(t('b'), 'blooper'); assert.ok(/Starts again \(“sorry, can I start again/.test(found.get('b').reasons[0]), found.get('b').reasons[0]);
  assert.strictEqual(t('c'), 'off-camera', 'interviewer reacts between two answers'); assert.ok(/Interviewer reacts off camera/.test(found.get('c').reasons[0]));
  assert.strictEqual(t('d'), 'poignant');
  assert.strictEqual(t('e'), 'blooper'); assert.ok(/Talks to the crew/.test(found.get('e').reasons[0]));
  assert.strictEqual(t('f'), 'funny', 'laughing while stumbling is funny'); assert.ok(found.get('f').cues.includes('stumble') && found.get('f').cues.includes('laugh'));
  assert.ok(!found.has('g'), 'an interviewer question is not a moment');
  assert.ok(!found.has('h'), 'a 3-second pause mid-sentence is thinking, not a blooper');
  assert.strictEqual(t('p'), 'blooper', 'an 8.5-second pause mid-sentence is'); assert.ok(/Pauses 8\.5 s mid-thought/.test(found.get('p').reasons[0]));
  assert.strictEqual(t('o'), 'blooper', 'three stumbles in one line'); assert.ok(found.get('o').score < 0.4, 'but only just');
  assert.strictEqual(t('j'), 'blooper', '“Cut.”');
  assert.strictEqual(t('k'), 'off-camera'); assert.ok(/A second voice joins in – Lily/.test(found.get('k').reasons[0]));
  assert.strictEqual(t('l'), 'blooper'); assert.ok(found.get('l').reasons.some(r => /Swears \(bleeped/.test(r)));
  assert.ok(!found.has('m'), '“very, very” is not a stumble');
  assert.ok(!found.has('n'), 'a repeated word for effect is not a stumble');
  // real interviews: “and, and” is how people talk; a retake is cut off or says it again, not a repeated opening
  const one = (text, next) => M.detect([{ key: 'r', lines: [mk('x', 0, 5, 'Ruth', text), mk('y', 5.5, 10, 'Ruth', next || 'Then we moved on.')] }]).filter(m => m.lineId === 'x');
  assert.strictEqual(one('I was happy and, and learned from from people.').length, 0, 'two small stumbles are not a moment');
  assert.strictEqual(one('It’s going to engage you intellectually.', 'It’s going to engage you emotionally, and you meet people.').length, 0, 'a repeated opening for effect');
  assert.strictEqual(one('There’s nothing we have to apologize for.', 'There’s nothing we need to be embarrassed for.').length, 0);
  assert.ok(one('They are doing a great serve for Israel.', 'They are doing great serve for Israel when they are away.')[0].cues.includes('retake'), 'says it again: a retake');
  assert.ok(one('It has a lasting impact and it has a lasting,', 'it has a lasting impact on participants.')[0].cues.includes('retake'), 'cut off and started again');
  const list = M.detect([{ key: 'k', lines: RUTH }]);
  assert.ok(list.every((x, i) => !i || list[i - 1].score >= x.score), 'best first');
});

test('voices: the main speaker talks most; another voice that mostly asks questions is the interviewer', () => {
  const v = M.voices([mk('1', 0, 20, 'Speaker 1', 'A long answer.'), mk('2', 20, 22, 'Speaker 2', 'And then?'), mk('3', 22, 40, 'Speaker 1', 'Another answer.'), mk('4', 40, 41, 'Speaker 2', 'Why?')]);
  assert.strictEqual(v.main, 'Speaker 1'); assert.ok(v.interviewer.has('Speaker 2'));
});

test('pauses inside a line come from word timings; emotional pauses are poignant', () => {
  const sad = mk('p', 0, 9, 'Ruth', 'And when she died I just could not speak.', { w: [0, 20, 25, 50, 55, 80, 85, 120, 400, 420, 430, 460, 470, 500, 510, 560, 570, 620].map(x => x) });
  // word 4 → 5 has a 2.8 s gap; the line carries emotion
  const r = M.cues(sad, { main: 'Ruth' });
  const pause = r.find(c => c.kind === 'pause');
  assert.ok(pause && pause.type === 'poignant' && /Pauses 2\.8 s/.test(pause.why), JSON.stringify(r));
  assert.strictEqual(M.typeOf(r).type, 'poignant');
  assert.ok(M.heart('I cried and cried') > M.heart('I cried') && M.heart('the weather was nice') === 0);
});

test('AI check: text with a line either side; known ids only; “none” drops it; unanswered ones keep the basic type', async () => {
  const list = M.detect([{ key: 'k', lines: RUTH }]);
  const L = new Map(RUTH.map(l => [l.id, l])), ctx = new Map(RUTH.map((l, i) => [l.id, { prev: RUTH[i - 1] || null, next: RUTH[i + 1] || null }]));
  const was = US.ai, calls = [];
  US.ai = { available: () => true, label: () => 'Claude', json: async req => { calls.push(req); const ids = Array.from(req.user[0].text.matchAll(/^([a-z])\t/gm)).map(x => x[1]); return { moments: ids.map(id => (id === 'e' ? { lineId: id, type: 'none', reason: 'just checking', score: 0.1 } : id === 'f' ? { lineId: id, type: 'funny', reason: 'The dog ate the challah', score: 1.4 } : id === 'a' ? null : { lineId: id, type: 'blooper', reason: 'x', score: 0.5 })).filter(Boolean).concat([{ lineId: 'zz', type: 'funny', reason: 'unknown', score: 1 }]) }; } };
  try {
    const out = await M.classifyAI(list, { lineOf: id => L.get(id), ctxOf: id => ctx.get(id), speakerName: s => s, job, chunk: 4 });
    assert.strictEqual(calls.length, Math.ceil(list.length / 4), 'sent in batches');
    assert.ok(calls.every(c => c.schema === M.AI_SCHEMA && c.feature === 'Moments' && c.user[0].cache && c.user[1] === 'Classify every candidate above.'));
    const sent = calls.map(c => c.user[0].text).join('\n');
    assert.ok(/Ruth: Is it recording\? Okay, good\./.test(sent) && /\|\| Ruth: And then the the the dog/.test(sent), 'the line with context');
    const o = byId(out);
    assert.ok(!o.has('e'), '“none” drops it'); assert.ok(!o.has('zz'), 'unknown ids ignored');
    assert.strictEqual(o.get('f').by, 'ai'); assert.strictEqual(o.get('f').score, 1, 'score clamped'); assert.strictEqual(o.get('f').reasons[0], 'The dog ate the challah');
    assert.strictEqual(o.get('a').by, 'basic', 'unanswered keeps its basic classification');
  } finally { US.ai = was; }
  assert.deepStrictEqual(M.merge([{ lineId: 'x', type: 'blooper', score: 0.5, reasons: ['r'], cues: [], by: 'basic' }], { moments: [{ lineId: 'x', type: 'weird', reason: '', score: 1 }] }), [], 'an unknown type is dropped like none');
});

function fresh() {
  const st = S._useState({ transcripts: [{ key: '/m/ruth.mov', name: 'ruth.mov', path: '/m/ruth.mov', itemId: 'r', source: 'file', lines: RUTH.map(l => Object.assign({}, l)) }] });
  return st;
}

test('How picky: fewer moments as it gets pickier (nested); interviewer and short lines are allowed; filter by type', async () => {
  const st = fresh();
  const r = await S.findMoments(job, { useAI: false });
  assert.ok(/basic, no AI/.test(r.summary) && st.moments.by === 'basic', r.summary);
  const at = s => S.pickMoments(st.moments.list, { opts: Object.assign(S.pickyFor(null), { s }) }).map(m => m.lineId);
  const all = at(S.PICKY_LEVELS.all), bal = at(S.PICKY_LEVELS.balanced), best = at(S.PICKY_LEVELS.best);
  assert.ok(best.every(id => bal.includes(id)) && bal.every(id => all.includes(id)), 'nested');
  assert.ok(all.length > bal.length && bal.length > best.length && best.length > 0, `${all.length} / ${bal.length} / ${best.length}`);
  assert.ok(all.includes('c') && all.includes('j'), 'the interviewer’s reaction and a one-word “Cut.” are kept');
  const funny = S.pickMoments(st.moments.list, { type: 'funny', opts: Object.assign(S.pickyFor(null), { s: S.PICKY_LEVELS.all }) });
  assert.ok(funny.length && funny.every(m => m.type === 'funny'));
});

test('Add to board: a group per type in its colour, no duplicates; the narrative pool leaves Moments out', async () => {
  const st = fresh();
  await S.findMoments(job, {});
  const n = S.addMomentsToBoard(st.moments.list);
  assert.strictEqual(n, st.moments.list.length);
  const cols = st.wall.columns.filter(c => c.moments);
  assert.deepStrictEqual(cols.map(c => c.name).sort(), ['Moments · Bloopers', 'Moments · Funny', 'Moments · Off camera', 'Moments · Poignant']);
  for (const c of cols) assert.strictEqual(c.label, M.TYPES[c.moments].label);
  assert.ok(cols.every(c => c.cards.every(k => k.note)), 'each card says why');
  assert.strictEqual(S.addMomentsToBoard(st.moments.list), 0, 'nothing twice');
  const pool = await S.narrativePool(job, US.storyNarrative.parseBrief('a 30 second video'));
  assert.ok(!pool.some(c => st.moments.list.some(m => m.lineId === c.id && m.type === 'blooper')), 'bloopers on the board aren’t narrative material');
});

test('Mark on string-out: range markers coloured by type where each moment is heard; running again replaces them', async () => {
  const st = fresh();
  await S.findMoments(job, {});
  const clip = { name: 'ruth.mov', path: '/m/ruth.mov', itemId: 'r', disabled: false, isSequence: false, speed: 1 };
  const INFO = { id: 'seq1', name: 'String-out', fps: 25, frame: 0.04, video: [{ index: 0, name: 'V1', clips: [Object.assign({ start: 100, end: 160, in: 0, out: 60 }, clip)] }], audio: [{ index: 0, name: 'A1', muted: false, clips: [Object.assign({ start: 100, end: 160, in: 0, out: 60 }, clip)] }], markers: [] };
  const calls = [];
  const was = US.host.call;
  US.host.call = async (fn, a) => { calls.push([fn, a]); if (fn === 'sequenceInfo') return JSON.parse(JSON.stringify(INFO)); if (fn === 'storySequenceTiming') return { zero: 0, fps: 25 }; if (fn === 'addSequenceMarkers') return a.markers.map((m, i) => 'g' + calls.length + '-' + i); return {}; };
  try {
    const shown = S.pickMoments(st.moments.list);
    const r = await S.markMoments(job, { seqId: 'seq1', list: shown });
    const add = calls.find(c => c[0] === 'addSequenceMarkers')[1];
    assert.strictEqual(add.markers.length, shown.length);
    const k = add.markers.find(m => /^Off camera: Mum, the taxi/.test(m.name));
    assert.ok(k && Math.abs(k.start - 141) < 1e-6 && Math.abs(k.end - 144) < 1e-6 && k.color === M.TYPES['off-camera'].marker, JSON.stringify(k));
    assert.ok(add.markers.every((m, i) => !i || add.markers[i - 1].start <= m.start), 'in timeline order');
    assert.ok(add.markers.filter(m => /^Blooper: /.test(m.name)).every(m => m.color === 1), 'bloopers red');
    assert.ok(/marked on “String-out”/.test(r.summary));
    // again: the old markers are removed first
    calls.length = 0;
    await S.markMoments(job, { seqId: 'seq1', list: shown.slice(0, 2) });
    const rm = calls.find(c => c[0] === 'removeSequenceMarkers');
    assert.ok(rm && rm[1].guids.length === shown.length, 'replaced the earlier markers');
    await S.removeMomentMarkers(job, 'seq1');
    assert.ok(!st.momentMarkers.seq1);
    await assert.rejects(S.markMoments(job, { seqId: 'seq1', list: [{ lineId: 'nope', type: 'funny', score: 1, reasons: [] }] }), e => e.code === 'NOTHING_FOUND');
  } finally { US.host.call = was; }
  // marker colours match the board colours
  for (const t of M.ORDER) assert.strictEqual(M.TYPES[t].marker, S.LABEL_TO_MARKER[M.TYPES[t].label], t);
});

test('the Assistant: “find the bloopers”, “funny moments”; “moments about family” stays a search', () => {
  const m = t => US.assistant.matchOffline(t).steps[0] || {};
  assert.deepStrictEqual([m('find the bloopers').action, m('find the bloopers').params.type], ['story.moments', 'blooper']);
  assert.strictEqual(m('show me the funny moments').params.type, 'funny');
  assert.strictEqual(m('any off-camera voices?').params.type, 'off-camera');
  assert.strictEqual(m('find poignant moments').params.type, 'poignant');
  assert.strictEqual(m('find moments').params.type, 'all');
  assert.strictEqual(m('moments about family').action, 'story.search');
  assert.strictEqual(m('lines about humour').action, 'story.search');
});

test('the sample interviews: a few believable moments, no false bloopers', () => {
  const TR = path.join(MEDIA, 'transcripts');
  const ts = ['I001_interview.srt', 'Interview_David_Cohen.txt', 'Interview_Miriam_Levy.csv', 'C001_sharp_static.json'].map((f, i) => ({ key: f, lines: T.toLines(T.parseFile(path.join(TR, f)).segments, 'p' + i) }));
  const list = M.detect(ts);
  assert.ok(list.length >= 3 && list.length <= 8, 'a handful: ' + list.length);
  assert.ok(!list.some(m => m.type === 'blooper'), 'no bloopers in clean interviews');
  assert.ok(list.some(m => m.type === 'off-camera'), 'the second voice in the concert clip');
});

test('review fixes: ordinary speech isn’t a restart; curly apostrophes; trailing off; “I-I-I”; a pause between sentences', () => {
  const kinds = (text, ctx = {}) => M.cues({ id: 'x', start: 0, end: 5, speaker: 'Ruth', text }, Object.assign({ main: 'Ruth' }, ctx)).map(c => c.kind);
  for (const t of ['I’m so sorry I wasn’t there when she died.', 'I said sorry, I was wrong.', 'There was no wait at all.', 'I couldn’t wait, no one could.', 'Where was I born? In Leeds.',
    'We went from the top of the hill to the bottom.', 'I’ve told her one more time that I love her.', 'Take two tablets a day.', 'I’ll say it again, family comes first.', 'We had to start again in a new country.'])
    assert.ok(!kinds(t).includes('restart'), t);
  for (const t of ['Sorry, can I start again?', 'Wait, no, that’s wrong.', 'Where was I?', 'Okay, from the top.', 'Starting over. My name is Ruth.', 'I’ve lost my train of thought.', 'Let me say that again.'])
    assert.ok(kinds(t).includes('restart'), t);
  assert.ok(kinds('Don’t use that.').includes('chatter'));
  assert.ok(kinds('it’s it’s it’s it’s fine').includes('stumble'));
  assert.ok(kinds('I-I-I-I think so.').includes('stumble'), 'a hyphenated stammer');
  const next = (text, start = 13) => ({ next: { id: 'y', start, end: start + 5, speaker: 'Ruth', text } });
  assert.ok(!kinds('I’m sure.', next('I’m sure it was raining that day.')).includes('retake'), 'two words, not three');
  assert.ok(kinds('So I went to the…', next('So I went to the market on Friday.')).includes('retake'), 'trailing off is cut off');
  assert.ok(kinds('And the best part was…', next('the dancing, all night long.')).includes('pause'), 'trailing off, then 8 s');
  // word timings: a gap after a full stop is between sentences, not mid-thought
  const l = { id: 'w', start: 0, end: 10, speaker: 'Ruth', text: 'That was the end. Then we moved.', w: [0, 30, 30, 60, 60, 90, 90, 120, 750, 800, 800, 850, 850, 900] };
  assert.ok(!M.cues(l, { main: 'Ruth' }).some(c => c.kind === 'pause'), JSON.stringify(M.cues(l, { main: 'Ruth' })));
  l.text = 'That was the end then we moved on.'; l.w = [0, 30, 30, 60, 60, 90, 90, 120, 750, 800, 800, 850, 850, 900, 900, 950];
  assert.ok(M.cues(l, { main: 'Ruth' }).some(c => c.kind === 'pause'), 'mid-sentence it still counts');
});
