// Story: the post-it board (S3) and highlighting selects on a string-out (S1).
const assert = require('assert'), path = require('path');
const { load, test, MEDIA } = require('./harness');
global.addEventListener = global.addEventListener || (() => {});
global.ResizeObserver = global.ResizeObserver || function () { return { observe() {} }; };
const US = load(['time', 'transcript', 'ui', 'app', 'js/tools/22-story-board.js', 'js/tools/22-story-export.js', 'js/tools/22-story-timeline.js', 'js/tools/22-story-ai.js', 'js/tools/22-story.js']);
const S = US.story, B = US.storyBoard, TL = US.storyTimeline, T = US.transcript;
const TR = path.join(MEDIA, 'transcripts');

function fresh(extra = {}) {
  const transcripts = ['I001_interview.srt', 'Interview_David_Cohen.txt', 'Interview_Miriam_Levy.csv'].map((f, i) => {
    const segs = T.parseFile(path.join(TR, f)).segments;
    return { key: f, name: f, path: '/media/' + f, itemId: 'item' + i, source: 'file', lines: T.toLines(segs, 'p' + i) };
  });
  return S._useState(Object.assign({ transcripts }, extra));
}
const lines = st => st.transcripts.flatMap(t => t.lines);
const helpers = st => ({
  lineOf: id => lines(st).find(l => l.id === id),
  themeOf: id => st.themes.find(t => t.lineIds.includes(id)) || null,
  speakerName: s => s || 'Unknown speaker',
  interviewOf: id => { const t = st.transcripts.find(x => x.lines.some(l => l.id === id)); return { key: t.key, name: t.name }; },
  strength: l => T.quality(l).score,
  colourFor: (key, used) => S.nextColour(used, 15)
});

test('moving cards: between groups, within a group, several at once, from the free board', () => {
  const a = { lineId: 'a' }, b = { lineId: 'b' }, c = { lineId: 'c' }, d = { lineId: 'd' }, e = { lineId: 'e' };
  const wall = { columns: [{ id: 'g1', cards: [a, b, c] }, { id: 'g2', cards: [d] }], loose: [{ card: e, x: 10, y: 10 }] };
  B.moveCards(wall, [a], wall.columns[1], 0);
  assert.deepStrictEqual(wall.columns.map(g => g.cards.map(x => x.lineId).join('')), ['bc', 'ad']);
  B.moveCards(wall, [b], wall.columns[0], 2); // to the end of its own group
  assert.strictEqual(wall.columns[0].cards.map(x => x.lineId).join(''), 'cb');
  B.moveCards(wall, [c, e], wall.columns[1], 1);
  assert.deepStrictEqual(wall.columns.map(g => g.cards.map(x => x.lineId).join('')), ['b', 'aced']);
  assert.strictEqual(wall.loose.length, 0, 'the parked card joined the group');
  B.makeLoose(wall, a, 300, 120);
  assert.deepStrictEqual([wall.columns[1].cards.length, wall.loose[0].x, wall.loose[0].y], [3, 300, 120]);
  const idea = B.addIdea(wall, 'B-roll of the market', { group: wall.columns[0], index: 0 });
  assert.ok(B.isIdea(idea) && wall.columns[0].cards[0] === idea && /^idea-/.test(B.keyOf(idea)));
});
test('group by theme, speaker or interview keeps every card (pins, notes, hidden) and puts ideas in their own group', () => {
  const st = fresh();
  const L = lines(st);
  st.themes = [{ id: 'f', name: 'Family', label: 7, lineIds: [L[0].id, L[1].id] }, { id: 'v', name: 'Volunteering', label: 5, lineIds: [L[20].id] }];
  const pinned = { lineId: L[1].id, pinned: true, note: 'open with this' };
  st.wall = { columns: [{ id: 'x', name: 'Mixed', cards: [{ lineId: L[0].id }, pinned, { lineId: L[20].id, hidden: true }, { lineId: L[30].id }] }], loose: [{ card: { id: 'i1', idea: 'Title card' }, x: 0, y: 0 }] };
  B.groupBy(st.wall, 'theme', helpers(st));
  assert.deepStrictEqual(st.wall.columns.map(g => [g.name, g.cards.length]), [['Family', 2], ['Volunteering', 1], ['No theme', 1], ['Ideas', 1]]);
  assert.strictEqual(st.wall.columns[0].label, 7); assert.strictEqual(st.wall.columns[0].themeId, 'f');
  assert.ok(st.wall.columns[0].cards.includes(pinned) && pinned.note === 'open with this', 'the same card objects move');
  assert.ok(st.wall.columns[1].cards[0].hidden, 'hidden stays hidden');
  assert.strictEqual(st.wall.loose.length, 0);
  B.groupBy(st.wall, 'speaker', helpers(st));
  assert.ok(st.wall.columns.every(g => g.name === 'Ideas' || g.cards.every(k => helpers(st).lineOf(k.lineId).speaker === st.wall.columns.find(x => x === g).cards.map(c => helpers(st).lineOf(c.lineId).speaker)[0])), 'one speaker per group');
  B.groupBy(st.wall, 'interview', helpers(st));
  const labels = st.wall.columns.map(g => g.label);
  assert.strictEqual(new Set(labels).size, labels.length, 'every group its own colour');
});
test('sorting inside groups: pinned first, ideas after the lines', () => {
  const st = fresh();
  const L = lines(st);
  const strong = L.filter(S.isStrong), weak = L.filter(l => !S.isStrong(l));
  const pin = { lineId: weak[1].id, pinned: true };
  st.wall = { columns: [{ id: 'g', name: 'G', cards: [{ lineId: weak[0].id }, { id: 'i', idea: 'x' }, pin, { lineId: strong[0].id }] }], loose: [] };
  B.sortGroups(st.wall, 'strength', helpers(st));
  assert.deepStrictEqual(st.wall.columns[0].cards.map(k => k.lineId || 'idea'), [weak[1].id, strong[0].id, weak[0].id, 'idea']);
  B.sortGroups(st.wall, 'length', helpers(st));
  const rest = st.wall.columns[0].cards.slice(1, 3).map(k => helpers(st).lineOf(k.lineId));
  assert.ok(rest[0].end - rest[0].start <= rest[1].end - rest[1].start);
});
test('free board: groups get places that don’t overlap; dropping a card finds the group and slot', () => {
  const wall = { columns: [{ id: 'a', cards: [1, 2, 3].map(i => ({ lineId: 'a' + i })), pos: { x: 12, y: 12 } }, { id: 'b', cards: [{ lineId: 'b1' }] }, { id: 'c', cards: [] }], loose: [] };
  B.layout(wall, 1000);
  const box = g => { const s = B.groupSize(g); return [g.pos.x, g.pos.y, g.pos.x + s.w, g.pos.y + s.h]; };
  const [A, Bb, C] = wall.columns.map(box);
  const overlap = (p, q) => p[0] < q[2] && p[2] > q[0] && p[1] < q[3] && p[3] > q[1];
  assert.ok(!overlap(A, Bb) && !overlap(A, C) && !overlap(Bb, C), JSON.stringify([A, Bb, C]));
  const slot = B.cardSlot(wall.columns[0], 2);
  const hit = B.hitGroup(wall, slot.x + 10, slot.y + 10);
  assert.strictEqual(hit.group.id, 'a'); assert.strictEqual(hit.index, 2);
  assert.strictEqual(B.hitGroup(wall, 5000, 5000), null);
  const ext = B.extent(wall);
  assert.ok(ext.w > Math.max(A[2], Bb[2], C[2]) && ext.h > Math.max(A[3], Bb[3], C[3]));
});
test('building from the board: hidden cards and parked cards left out, idea notes kept in place', () => {
  const st = fresh();
  const L = lines(st);
  st.wall = { columns: [{ id: 'g', name: 'Opening', cards: [{ id: 'i1', idea: 'Title' }, { lineId: L[0].id }, { lineId: L[1].id, hidden: true }, { id: 'i2', idea: 'Market B-roll' }, { lineId: L[2].id }, { id: 'i3', idea: 'End' }] }, { id: 'h', name: 'Only ideas', cards: [{ id: 'i4', idea: 'Music swell' }] }], loose: [{ card: { lineId: L[5].id }, x: 1, y: 1 }] };
  S.ensureColours();
  const g = S.wallGroups();
  assert.deepStrictEqual(g[0].lineIds, [L[0].id, L[2].id]);
  assert.deepStrictEqual(g[0].ideas.map(x => [x.text, x.before]), [['Title', L[0].id], ['Market B-roll', L[2].id], ['End', null]]);
  assert.deepStrictEqual(g[1].ideas.map(x => x.text), ['Music swell']);
  assert.ok(!g.some(x => x.lineIds.includes(L[5].id)), 'parked cards are not built');
});
test('selected lines: theme colour first, board and built sequences add names; highlight names and coverage', () => {
  const st = fresh();
  const L = lines(st).filter(l => l.id.startsWith('p0'));
  st.themes = [{ id: 'f', name: 'Family', label: 7, lineIds: [L[0].id, L[1].id] }, { id: 'h', name: 'Faith', label: 5, lineIds: [L[1].id] }];
  st.wall = { columns: [{ id: 'c', name: 'Board pick', label: 2, narrative: { seconds: 60 }, cards: [{ lineId: L[3].id }, { lineId: L[4].id, hidden: true }] }], loose: [] };
  st.builds = [{ seqId: 's', name: 'Rough cut', lineIds: [L[6].id, L[0].id] }];
  st.picky = { s: 0 };
  const sel = S.selectionMap({ themes: true, board: true, builds: true });
  assert.deepStrictEqual(sel.get(L[1].id), { label: 7, names: ['Family', 'Faith'] });
  assert.deepStrictEqual(sel.get(L[3].id), { label: 2, names: ['Board pick'] });
  assert.ok(!sel.has(L[4].id), 'hidden cards are not selections');
  assert.deepStrictEqual(sel.get(L[6].id), { label: 4, names: ['In “Rough cut”'] });
  assert.deepStrictEqual(sel.get(L[0].id).names, ['Family', 'In “Rough cut”']);
  assert.ok(!S.selectionMap({ themes: false, board: true, builds: false }).has(L[0].id));
  // the string-out: the whole interview, in one clip
  const clip = { start: 100, end: 190, in: 0, out: 90, speed: 1, path: '/media/I001_interview.srt', name: 'I001.mp4', itemId: 'i' };
  const r = TL.build([clip], () => st.transcripts[0]);
  const hs = TL.highlightSections(r.entries, sel);
  assert.strictEqual(hs.length, 4, 'L0, L1, L3 and L6 – each line once');
  assert.strictEqual(hs[1].name, "Family + Faith · There were six of us children…");
  assert.ok(Math.abs(hs[0].start - (100 + L[0].start)) < 1e-9 && hs[0].label === 7);
  const cov = TL.coverage(r.entries, sel);
  assert.strictEqual(cov.length, 1);
  const total = r.entries.reduce((n, e) => n + e.end - e.start, 0), chosen = r.entries.filter(e => sel.has(e.lineId)).reduce((n, e) => n + e.end - e.start, 0);
  assert.ok(Math.abs(cov[0].total - total) < 1e-9 && Math.abs(cov[0].selected - chosen) < 1e-9 && Math.abs(cov[0].pct - chosen / total) < 1e-9);
  assert.ok(cov[0].gaps.length && cov[0].gaps.every(g => !r.entries.some(e => sel.has(e.lineId) && e.start >= g.start && e.end <= g.end)), 'gaps hold no selected line');
  assert.ok(cov[0].gaps[0].end - cov[0].gaps[0].start >= cov[0].gaps[cov[0].gaps.length - 1].end - cov[0].gaps[cov[0].gaps.length - 1].start, 'biggest gap first');
  assert.strictEqual(S.guessStringOut([{ name: 'Rough cut' }, { name: 'ALL INT Strng Out' }]).name, 'ALL INT Strng Out');
});
