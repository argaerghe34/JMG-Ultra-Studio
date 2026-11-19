// Ask working on its own: the pure parts (licences, the best picks, why a download warns, tracks, times), then whole
// chains with a scripted AI against a stand-in editor and a stand-in web – the user's own case (B-roll of big boats:
// search → pick → the card with clips to untick → download into a folder named after the search → a bin → wait for
// it → a new 30-second sequence), finding its way round a big project and tidying what is new, B-roll over a
// string-out on a copy, panel tools run without taking the screen, one approval for a whole plan, a failed step and
// another way, waiting, and follow-ups it sets itself (a clock run by hand): the caps, what never runs unattended,
// and re-arming after the panel is loaded again.
const assert = require('assert');
const fs = require('fs'), os = require('os'), path = require('path');
const { load, test } = require('./harness');
global.ResizeObserver = global.ResizeObserver || function () { return { observe() {} }; };
global.addEventListener = global.addEventListener || (() => {});
const US = load(['time', 'audio', 'dsp', 'transcript', 'ui', 'app', 'ai', 'js/tools/11-audio-kit.js', 'js/tools/22-story-glossary.js', 'js/tools/22-story-board.js', 'js/tools/22-story-export.js', 'js/tools/22-story-timeline.js', 'js/tools/22-story-narrative.js', 'js/tools/22-story-moments.js', 'js/tools/22-story-ai.js', 'js/tools/22-story-context.js', 'js/tools/22-story-ask.js', 'js/tools/22-story-voices.js', 'js/tools/22-story.js', 'js/tools/14-footage.js', 'js/tools/36-quickfx.js', 'js/tools/37-producer.js', 'js/tools/44-youtube.js', 'js/tools/47-brollfinder.js', 'js/tools/40-assistant-agent.js', 'js/tools/40-assistant-chat.js', 'js/tools/41-edit.js', 'js/tools/42-recipes.js']);
const C = US.chat, A = US.chatAgent, B = US.brollFinder;
C._tick = 2; C._waitEvery = 5;
const FREE = { free: true, credit: false, name: 'Pexels licence', label: 'Free to use' }, CC = { free: true, credit: true, name: 'CC BY 4.0', label: 'Creative Commons' }, STD = { free: false, credit: false, name: '', label: 'Standard YouTube licence' };
const mk = (id, o = {}) => Object.assign({ key: 'x:' + id, source: 'pexels', sourceName: 'Pexels', id, title: 'Clip ' + id, page: 'https://example.test/' + id, author: 'Ann', thumb: '', duration: 20, width: 1920, height: 1080, licence: FREE, files: [{ url: 'https://example.test/' + id + '.mp4', ext: 'mp4', width: 1920, height: 1080, size: 5 * 1024 * 1024 }] }, o);

test('the pure parts: a licence in plain words, the best picks, why a download warns, tracks, when “later” is, files in a folder', () => {
  assert.ok(/^free to use \(Pexels licence\)$/.test(A.licenceWords(mk('a'))) && /free to use with a credit \(CC BY 4\.0\)/.test(A.licenceWords(mk('a', { licence: CC }))) && /NOT free to use – Standard YouTube licence: needs the owner’s permission/.test(A.licenceWords(mk('a', { licence: STD }))));
  const list = [['b1', 'boats', mk('1', { licence: STD })], ['b2', 'boats', mk('2', { height: 720, width: 1280 })], ['b3', 'boats', mk('3')], ['b4', 'boats', mk('4', { duration: 2 })], ['b5', 'cranes', mk('5', { licence: STD })]].map(([id, term, clip]) => ({ id, term, clip }));
  assert.deepStrictEqual(A.bestOf(list, 2).map(x => x.id), ['b2', 'b3', 'b5'], 'free to use and full HD first, each search has its own best; in search order');
  assert.deepStrictEqual(A.downloadReasons(list.slice(1, 3)), [], 'free clips, small: no warning');
  const why = A.downloadReasons(list.slice(0, 2));
  assert.ok(why.length === 1 && why[0].id === 'licence' && /1 of the 2 clips is not free to use \(Standard YouTube licence\): you need the owner’s permission/.test(why[0].text));
  assert.deepStrictEqual(A.downloadReasons([{ clip: mk('big', { files: [{ url: 'u', ext: 'mp4', size: 3 * 1024 * 1024 * 1024, width: 1920, height: 1080 }] }) }]).map(r => r.id), ['download']);
  assert.deepStrictEqual(A.downloadReasons(Array.from({ length: 21 }, (_, i) => ({ clip: mk('n' + i) }))).map(r => r.id), ['download']);
  assert.strictEqual(A.sizeOf(mk('g', { files: [], duration: 10 })), Math.round(10 * 1.2 * 1024 * 1024), 'a size the site doesn’t give is guessed from the length');
  assert.deepStrictEqual([A.trackOf('V2'), A.trackOf('a1'), A.trackOf(''), A.trackOf('V0'), A.trackOf('B2')], [{ kind: 'video', index: 1 }, { kind: 'audio', index: 0 }, { kind: 'video', index: 1 }, null, null]);
  const noon = new Date(2026, 10, 19, 12, 0, 0).getTime();
  assert.deepStrictEqual([A.delayOf({ minutes: 30 }), A.delayOf({ seconds: 1 }), A.delayOf({ hours: 1, minutes: 30 }), A.delayOf({ at: '18:00' }, noon), A.delayOf({ at: '6:30 pm' }, noon), A.delayOf({ at: '09:00' }, noon), A.delayOf({ at: 'soon' }), A.delayOf({})], [1800000, 1000, 5400000, 6 * 3600000, 6.5 * 3600000, 21 * 3600000, 0, 0]);
  assert.deepStrictEqual([A.inWords(1000), A.inWords(30 * 60000), A.inWords(3 * 3600000)], ['1 seconds', '30 minutes', '3 hours']);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'us-agent-'));
  fs.mkdirSync(path.join(dir, 'sub')); fs.writeFileSync(path.join(dir, 'a.mp4'), 'x'); fs.writeFileSync(path.join(dir, 'sub', 'b.mov'), 'xx'); fs.writeFileSync(path.join(dir, 'c.mp4.part'), 'x'); fs.writeFileSync(path.join(dir, 'notes.txt'), 'x'); fs.writeFileSync(path.join(dir, 'empty.mp4'), '');
  assert.deepStrictEqual(A.mediaIn(dir).map(f => f.name), ['a.mp4'], 'media files only – not a download still being written, an empty file or a text file');
  assert.deepStrictEqual(A.mediaIn(dir, { deep: true }).map(f => f.name).sort(), ['a.mp4', 'b.mov']);
  // which folders it may look in: Ultra Studio's own, ones it downloaded to, and ones the editor typed
  const chat = C.newChat();
  assert.strictEqual(A.mayRead(chat, dir), false);
  chat.items.push({ k: 'me', text: `bring in ${dir} please` });
  assert.strictEqual(A.mayRead(chat, dir), true);
  const c2 = C.newChat(); c2._folders = [dir];
  assert.ok(A.mayRead(c2, path.join(dir, 'sub')) && !A.mayRead(c2, os.homedir()));
});

/* ---------- a stand-in editor (bins, clips, sequences) and a stand-in web ---------- */
const WORK = fs.mkdtempSync(path.join(os.tmpdir(), 'us-agent-work-'));
function setup(answers, { clips = [] } = {}) {
  US.story._useState({ transcripts: [], speakers: {}, themes: [] });
  const host = [], ai = [], opened = [];
  const was = { call: US.host.call, ai: US.ai, ctx: US.ctx, refresh: US.refreshContext, toast: US.ui.toast, search: B.search, download: B.net.download, folder: B.defaultFolder, open: US.tools.open, settings: US.settings.get('brollfinder', {}) };
  const P = { seqs: [{ id: 'mine', name: 'String-out' }], bins: ['Interviews'], items: clips.map((c, i) => Object.assign({ id: 'it' + (i + 1), kind: 'video', bin: 'Interviews', path: '/m/' + c.name, duration: 20 }, c)), placed: [], n: 0, open: { id: 'mine', name: 'String-out' } };
  const nameOf = id => (P.seqs.find(x => x.id === id) || {}).name || id;
  const ensure = p => { const parts = String(p).split('/').map(s => s.trim()).filter(Boolean); for (let i = 1; i <= parts.length; i++) { const b = parts.slice(0, i).join(' / '); if (!P.bins.includes(b)) P.bins.push(b); } return parts.join(' / '); };
  const has = (t, part) => !part || String(t).toLowerCase().includes(String(part).toLowerCase());
  US.ctx = { project: { name: 'Big boats test', path: path.join(WORK, 'Big boats test.prproj') }, sequence: P.open, selection: 0 };
  US.refreshContext = async () => { US.ctx = Object.assign({}, US.ctx, { sequence: P.open }); };
  US.ui.toast = () => {};
  US.tools.open = (id, args) => { opened.push([id, args]); };
  US.host.call = async (fn, a) => {
    host.push([fn, a]);
    if (fn === 'listSequences') return P.seqs.map(x => ({ id: x.id, name: x.name }));
    if (fn === 'listBins') return [{ id: 'root', path: '(Project root)' }].concat(P.bins.map((b, i) => ({ id: 'b' + i, path: b })));
    if (fn === 'askBins') { const all = P.bins.filter(b => has(b, a.filter)).map(b => ({ id: b, path: b, clips: P.items.filter(i => i.bin === b).length, bins: P.bins.filter(x => x.startsWith(b + ' / ')).length })); return { total: all.length, bins: all.slice(a.offset || 0, (a.offset || 0) + (a.limit || 200)) }; }
    if (fn === 'askFind') { if (a.idsOnly) return { total: P.items.length, ids: P.items.map(i => i.id) }; const hit = P.items.filter(i => has(i.name, a.name) && has(i.bin, a.bin) && has(i.path, a.path) && (!a.kinds || a.kinds.includes(i.kind))); return { total: hit.length, items: hit.slice(a.offset || 0, (a.offset || 0) + (a.limit || 300)).map(i => ({ id: i.id, name: i.name, bin: i.bin, path: i.path, kind: i.kind })) }; }
    if (fn === 'ensureBin') return ensure(a.path);
    if (fn === 'importFiles') { const bin = ensure(a.binPath); return a.paths.map(p => { const had = P.items.find(i => i.path === p); if (had) return Object.assign({ existing: true }, had); const it = { id: 'it' + (P.items.length + 1), name: path.basename(p), bin, path: p, kind: 'video', duration: 20 }; P.items.push(it); return Object.assign({}, it); }); }
    if (fn === 'moveItems') { const bin = ensure(a.binPath); for (const id of a.ids) P.items.find(i => i.id === id).bin = bin; return a.ids.length; }
    if (fn === 'itemsInfo') return a.ids.map(id => { const i = P.items.find(x => x.id === id); return i ? { id, name: i.name, duration: i.duration, rangeStart: 0, rangeEnd: i.duration } : null; });
    if (fn === 'newSequence') { const id = 'new' + (++P.n); P.seqs.push({ id, name: a.name }); ensure(a.binPath); P.open = { id, name: a.name }; return { id, name: a.name }; }
    if (fn === 'cloneSequence') { const id = 'copy' + (++P.n); P.seqs.push({ id, name: a.name }); ensure(a.binPath); P.open = { id, name: a.name }; return { id, name: a.name }; }
    if (fn === 'placeClips') { const out = []; for (const c of a.clips) { if (c.v > 5) throw new US.UserError('HOST_SCRIPT', { title: 'There is no such track.' }); const p = { seqId: a.seqId, id: c.id, start: c.at, end: c.at + (c.out - c.in), v: c.v, a: c.a, video: c.video, audio: c.audio }; P.placed.push(p); out.push({ start: p.start, end: p.end }); } return { placed: out }; }
    if (fn === 'askStamp') return a.seqIds.map(id => (P.seqs.some(x => x.id === id) ? { id, name: nameOf(id), duration: P.placed.filter(p => p.seqId === id).reduce((m, p) => Math.max(m, p.end), 0), clips: P.placed.filter(p => p.seqId === id).length, markers: 0, guids: [] } : { id, missing: true }));
    if (fn === 'deleteSequence') { P.seqs = P.seqs.filter(x => x.id !== a.seqId); return true; }
    if (fn === 'askRemoveBins') { const removed = [], kept = []; for (const p of a.paths) { if (P.items.some(i => i.bin === p || i.bin.startsWith(p + ' / '))) kept.push({ path: p, why: 'not empty' }); else { P.bins = P.bins.filter(b => b !== p); removed.push(p); } } return { removed, kept }; }
    if (fn === 'openSequence') { P.open = { id: a.seqId, name: nameOf(a.seqId) }; return true; }
    if (fn === 'seqSet') { const q = P.seqs.find(z => z.id === a.seqId), was = { name: q.name }, done = []; if (a.name) { q.name = a.name; if (P.open.id === q.id) P.open = { id: q.id, name: q.name }; done.push('name'); } if (a.outPoint != null) done.push('out'); if (a.inPoint != null) done.push('in'); return { done, failed: [], was }; }
    if (fn === 'trackSet') { P.tracks = P.tracks || {}; const t = (P.tracks[a.seqId] = P.tracks[a.seqId] || { video: 1, audio: 1, set: [] }); if (a.add) t[a.kind] += a.add; if (a.index != null) t.set.push([a.kind, a.index, a.name, a.locked, a.muted]); return { done: a.add ? ['added ' + a.add] : ['name', 'locked'], failed: a.locked ? [] : [], video: t.video, audio: t.audio }; }
    if (fn === 'extractRanges') { P.extracted = [a.seqId, a.ranges]; return { cuts: a.ranges.length, removed: 3, duration: 37 }; }
    if (fn === 'addSequenceMarkers') { P.marks = P.marks || {}; const g = a.markers.map((m, i) => 'g' + ((P.marks[a.seqId] || []).length + i + 1)); P.marks[a.seqId] = (P.marks[a.seqId] || []).concat(g); return g; }
    if (fn === 'removeSequenceMarkers') { P.marks[a.seqId] = (P.marks[a.seqId] || []).filter(g => !a.guids.includes(g)); return a.guids.length; }
    if (fn === 'updateMarkers') return { done: a.markers.length, guids: {} };
    if (fn === 'setPlayhead' || fn === 'selectClips') return fn === 'selectClips' ? a.targets.length : true;
    if (fn === 'exportFrame') return a.outBase + '.png';
    if (fn === 'sequenceInfo' && a.clips === false) return { id: a.seqId, name: nameOf(a.seqId), fps: 25, width: 1920, height: 1080, duration: 40, inPoint: -1, outPoint: -1, playhead: 3, video: [{ index: 0, name: 'Video 1', muted: false, locked: false }, { index: 1, name: 'B-roll', muted: true, locked: true }], audio: [{ index: 0, name: 'Audio 1' }], markers: ((P.marks || {})[a.seqId] || []).map((g, i) => ({ guid: g, start: i + 1, end: i + 1, color: 1, name: 'M' + g, comment: '' })) };
    if (fn === 'editRead' || fn === 'sequenceInfo') return { id: a.seqId, name: nameOf(a.seqId), fps: 25, duration: 40, markers: [], video: [{ index: 0, clips: [{ start: 0, end: 20, in: 0, out: 20, name: 'RUTH.MP4', path: '/m/RUTH.MP4', itemId: 'r', effects: [] }, { start: 20, end: 40, in: 30, out: 50, name: 'RUTH.MP4', path: '/m/RUTH.MP4', itemId: 'r', effects: [] }] }], audio: [] };
    if (fn === 'editProject') return { bins: P.bins.slice(), sequences: P.seqs.map(x => ({ id: x.id, name: x.name, bin: '', duration: 40, video: 1, audio: 1 })), clips: [] };
    return {};
  };
  // the web: a search that finds what the test says, and “downloads” that write a tiny file
  const web = { searched: [], downloaded: [], found: {} };
  B.search = async (job, o) => { web.searched.push(JSON.parse(JSON.stringify({ requests: o.requests, freeOnly: o.freeOnly, sources: o.sources, aim: o.aim }))); const results = o.requests.map(term => ({ term, clips: (web.found[term] || []).filter(c => !o.freeOnly || c.licence.free).slice(0, o.aim), pool: [], notes: web.found[term] ? [] : [`Pexels: nothing for “${term}”.`], asked: [term] })); return { results, summary: `${US.plural(results.reduce((n, r) => n + r.clips.length, 0), 'option')} for ${US.plural(o.requests.length, 'request')} – nothing downloaded yet` }; };
  B.net.download = async (url, file, progress) => { web.downloaded.push(url); if (/fail/.test(url)) throw Object.assign(new Error('gone'), { status: 404 }); fs.writeFileSync(file, 'video'); progress && progress(1); };
  B.defaultFolder = () => path.join(WORK, 'JMG Ultra Studio', 'B-roll');
  US.settings.set('brollfinder', {});
  const list = answers.slice();
  US.ai = Object.assign({}, was.ai, { available: () => true, label: () => 'Claude', provider: () => 'claude', fmtUSD: x => '$' + x.toFixed(2),
    json: async req => { ai.push(JSON.parse(JSON.stringify(Object.assign({}, req, { onUsage: undefined })))); const x = list.shift(); if (!x) throw new Error('no more scripted answers'); if (req.onUsage) req.onUsage({ usd: x.usd != null ? x.usd : 0.01, name: 'Claude Opus 5.5', tokensIn: 100, tokensOut: 10 }); return typeof x === 'function' ? x() : x; } });
  const res = i => ai[i + 1].turns[ai[i + 1].turns.length - 1].user;
  return { host, ai, P, web, opened, res, add: more => list.push(...more), restore: () => { US.host.call = was.call; US.ai = was.ai; US.ctx = was.ctx; US.refreshContext = was.refresh; US.ui.toast = was.toast; B.search = was.search; B.net.download = was.download; B.defaultFolder = was.folder; US.tools.open = was.open; US.settings.set('brollfinder', was.settings); } };
}
const T = (tool, args = {}, say = '', extra = {}) => Object.assign({ say, understood: '', plan: [], tool, argsJson: JSON.stringify(args) }, extra);
const hooksFor = (log, o = {}) => ({ event: it => log.push(it), status: c => { const l = C.workingLine(c); if (l && log._lines) log._lines.push(l); }, approve: async card => { log.push({ k: 'approve?', card }); return o.approve ? o.approve(card) : { ok: true }; }, choose: async () => null, warn: async w => { log.push({ k: 'warn?', w }); return o.warn ? o.warn(w) : 'continue'; }, planApprove: o.planApprove ? async p => { log.push({ k: 'plan?', p }); return o.planApprove(p); } : null, resume: o.resume || null });

test('the tools are offered to Ask and to Producer alike, with finish last, and the AI is told it can do these things itself', () => {
  for (const P of [null, US.chatPersonas.producer]) {
    const t = C.toolsHere(P), names = Object.keys(t);
    for (const k of ['broll.search', 'broll.download', 'download', 'bins', 'find', 'recent', 'files', 'makebin', 'move', 'import', 'place', 'wait', 'later']) assert.ok(names.includes(k), k);
    assert.strictEqual(names[names.length - 1], 'finish');
    const r = C.rules({ resolve: false, actions: [], ops: { timeline: [], items: [] }, tools: t, persona: P });
    assert.ok(/- broll\.download: Download B-roll you found/.test(r) && /Never say you can’t press Find, tick, download, make a bin, import a folder or find new clips – you can\./.test(r) && /call wait/.test(r) && /call later with exactly what you will do/.test(r) && /one chain: plan every step on the first turn/.test(r));
  }
  assert.deepStrictEqual(['broll.search', 'broll.download', 'bins', 'find', 'makebin', 'move', 'import', 'place', 'wait', 'later'].map(k => C.riskOf(k, {})), ['ai', 'out', 'read', 'read', 'new', 'own', 'new', 'new', 'read', 'read']);
  assert.strictEqual(C.describeCall('broll.download', { best: 2, bin: 'Big boats' }), 'Download the best 2 B-roll clips of each search into the bin “Big boats”');
  assert.strictEqual(C.describeCall('wait', { for: 'bin', bin: 'Big boats' }), 'Wait for clips in the bin “Big boats”');
});

test('the user’s own case – “a 30-second select reel of big boats, B-roll from YouTube”: searched, picked, shown to untick, downloaded into a folder named after the search, a bin made, brought in, waited for, a new sequence built – and Undo takes back what it can', async () => {
  const x = setup([
    T('broll.search', { requests: ['big boats', 'container ships at sea'], sources: ['youtube'], freeOnly: false, aim: 4 }, 'Searching.', { understood: 'A 30-second select reel of big boats, with B-roll from YouTube, on a new sequence.', plan: ['Search YouTube for big boats', 'Download the best ones into a Big boats bin', 'Wait for them', 'Build a 30-second sequence', 'Check it'] }),
    T('broll.download', { ids: ['b1', 'b2', 'b3', 'b5', 'b9'], bin: 'Big boats' }, 'Downloading my picks.'),
    T('wait', { for: 'bin', bin: 'Big boats', atLeast: 3, timeoutMinutes: 0.0005 }, 'Making sure they are in.'),
    T('place', { newSequence: 'Big boats – selects', clips: [{ clip: 'f1', length: 10 }, { clip: 'f2', length: 10, from: 2 }, { clip: 'f3', length: 10 }] }, 'Building the reel.'),
    T('finish', { reply: 'A 30-second reel of three boat shots is open.', done: ['3 clips downloaded', 'bin Big boats', 'sequence of 0:30'], check: ['Two clips need permission'] })]);
  x.web.found = { 'big boats': [mk('y1', { source: 'youtube', sourceName: 'YouTube', licence: STD, title: 'Giant ship in a storm' }), mk('y2', { source: 'youtube', sourceName: 'YouTube', licence: CC, title: 'Harbour timelapse' }), mk('y3', { source: 'youtube', sourceName: 'YouTube', licence: STD, title: 'Tanker from a drone' })], 'container ships at sea': [mk('y4', { title: 'Container ship' }), mk('fail5', { title: 'Gone video', files: [{ url: 'https://example.test/fail5.mp4', ext: 'mp4', size: 1000, width: 1920, height: 1080 }] })] };
  try {
    const log = [], chat = C.newChat(); log._lines = [];
    await C.send(chat, 'On a new sequence, make me a select reel of 30 seconds showing the best moments of big boats and get that b-roll from YouTube', hooksFor(log, { approve: async card => (card.items ? { ok: true, items: card.items.filter(i => !/Tanker/.test(i.label)).map(i => i.id) } : { ok: true }) }), { mode: 'ask' });
    // the search ran here, in the background – no tab was opened
    assert.deepStrictEqual(x.web.searched, [{ requests: ['big boats', 'container ships at sea'], freeOnly: false, sources: Object.fromEntries(B.SOURCES.map(s => [s.id, s.id === 'youtube'])), aim: 4 }]);
    assert.strictEqual(x.opened.length, 0, 'nothing took the screen');
    assert.ok(/b1\tbig boats\tGiant ship in a storm\tYouTube\t0:20\t1920×1080\tNOT free to use – Standard YouTube licence: needs the owner’s permission/.test(x.res(0)) && /b2\t[^\n]*free to use with a credit/.test(x.res(0)) && /b5\tcontainer ships at sea\tGone video/.test(x.res(0)), x.res(0));
    // not free to use → the warning (even though nothing else is risky), then the card with the picks to untick
    const w = log.find(i => i.k === 'warn?').w;
    assert.ok(w.reasons.some(r => r.id === 'licence' && /2 of the 4 clips are not free to use/.test(r.text)));
    const card = log.filter(i => i.k === 'approve?').map(i => i.card).find(c => c.items);
    assert.deepStrictEqual(card.items.map(i => [i.id, i.label, i.warn]), [['b1', 'Giant ship in a storm', true], ['b2', 'Harbour timelapse', false], ['b3', 'Tanker from a drone', true], ['b5', 'Gone video', false]]);
    assert.ok(/4 clips, about 15 MB in all, into .*B-roll/.test(card.detail) && /Then into the bin “Big boats”/.test(card.detail) && /NOT free to use/.test(card.items[0].sub) && card.always === false);
    // downloaded: only the ticked ones; one failed and is said; each search has its own folder with the list of sources
    assert.deepStrictEqual(x.web.downloaded.map(u => path.basename(u)), ['y1.mp4', 'y2.mp4', 'fail5.mp4']);
    const root = path.join(WORK, 'JMG Ultra Studio', 'B-roll');
    assert.deepStrictEqual(fs.readdirSync(root).sort(), ['big boats', 'container ships at sea']);
    assert.ok(fs.readdirSync(path.join(root, 'big boats')).includes(B.LIST_NAME) && fs.readdirSync(path.join(root, 'big boats')).filter(f => /\.mp4$/.test(f)).length === 2);
    assert.ok(/2 clips downloaded/.test(x.res(1)) && /The editor unticked 1\./.test(x.res(1)) && /Didn’t download: Gone video – It isn’t there any more\./.test(x.res(1)) && /In the bin “Big boats”: 2 clips – f1 [^;]+; f2 /.test(x.res(1)) && /TELL THE EDITOR: 1 of these is not free to use/.test(x.res(1)) && /Unknown ids left out: b9\./.test(x.res(1)), x.res(1));
    assert.deepStrictEqual(x.P.items.map(i => i.bin), ['Big boats', 'Big boats']);
    // it waited (and gave up plainly: the bin has 2, it asked for 3) instead of telling the editor to come back
    assert.ok(log._lines.some(l => /^Waiting for 3 clips in the bin “Big boats” \(checks every \d+ s\)$/.test(l)), log._lines.join(' | '));
  } finally { x.restore(); }
});

test('the same case carried through: the bin fills, the reel is built on a new sequence, the plan is approved once, and Undo all takes back the sequence and the bin it can', async () => {
  const x = setup([
    T('broll.search', { requests: ['big boats'], aim: 3 }, '', { understood: 'A 30-second reel of big boats.', plan: ['Search', 'Download into a bin', 'Wait', 'Build 30 seconds'] }),
    T('broll.download', { best: 3, bin: 'Big boats', folder: 'big ships at sea' }),
    T('wait', { for: 'bin', bin: 'Big boats', atLeast: 3 }),
    T('place', { newSequence: 'Big boats – selects', clips: [{ clip: 'f1', length: 10 }, { clip: 'f2', length: 10, from: 2 }, { clip: 'f3', length: 10 }, { clip: 'f9', length: 5 }] }),
    T('finish', { reply: 'Done.' })]);
  x.web.found = { 'big boats': [mk('p1'), mk('p2', { licence: CC }), mk('p3')] };
  try {
    const log = [], chat = C.newChat();
    await C.send(chat, 'a 30-second select reel of big boats with B-roll from the web', hooksFor(log, { planApprove: async () => ({ ok: true }) }), { mode: 'ask' });
    assert.strictEqual(log.filter(i => i.k === 'plan?').length, 1, 'the whole plan is approved once');
    assert.deepStrictEqual(log.filter(i => i.k === 'approve?').map(i => (i.card.items || []).length), [3], 'the plan’s yes covers the steps – but the clips to download are still shown to untick');
    assert.ok(!log.some(i => i.k === 'warn?'), 'free clips and a small download: no warning');
    assert.ok(fs.existsSync(path.join(WORK, 'JMG Ultra Studio', 'B-roll', 'big ships at sea', 'big boats')), 'the folder asked for, with a folder for the search inside');
    assert.ok(/The bin “Big boats” has 3 clips\./.test(x.res(2)));
    assert.ok(/3 placed in “Ask – Big boats – selects” \(a new sequence, 0:30 long, now your working sequence\)/.test(x.res(3)) && /NOT placed: f9: not a clip you have been shown/.test(x.res(3)), x.res(3));
    assert.deepStrictEqual(x.P.placed.map(p => [p.seqId, p.start, p.end, p.v]), [['new1', 0, 10, 0], ['new1', 10, 20, 0], ['new1', 20, 30, 0]]);
    assert.deepStrictEqual(chat.work, { seqId: 'new1', name: 'Ask – Big boats – selects', ours: true });
    const plan = C.undoPlan(chat);
    assert.ok(plan.can.some(c => /Delete the sequence “Ask – Big boats – selects”/.test(c.text)) && plan.can.some(c => /Remove the bin “Big boats”/.test(c.text)));
    assert.ok(plan.cant.some(c => /3 downloaded files in .* stay on the disk/.test(c.text)) && plan.cant.some(c => /3 clips added to the bin “Big boats” stay in the project/.test(c.text)), 'and it says what stays');
    const res = await C.undo(chat);
    assert.ok(!x.P.seqs.some(s => s.id === 'new1') && x.P.bins.includes('Big boats') && res.kept.some(k => /The bin “Big boats” stays – it is not empty/.test(k)), 'the sequence goes; the bin stays because the clips are in it');
  } finally { x.restore(); }
});

test('a big project: bins by name with counts, clips by name or by the folder their files are in, what is new since the chat started; then an empty bin, a move (undone again) and a whole folder brought in', async () => {
  const many = Array.from({ length: 12 }, (_, i) => ({ name: `IV_${i}.mp4`, bin: 'Interviews' }));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'us-agent-dl-'));
  for (const n of ['ship one.mp4', 'ship two.mp4', 'readme.txt']) fs.writeFileSync(path.join(dir, n), 'v');
  const x = setup([
    T('bins', { filter: 'boat' }), () => { arrive(); return T('recent', {}); }, T('find', { file: 'drone' }), T('makebin', { bin: 'B-roll/Big boats' }), T('move', { clips: ['f1', 'f2', 'f77'], bin: 'B-roll/Big boats' }),
    T('files', { folder: dir }), T('import', { folder: dir, bin: 'B-roll/Big boats' }), T('import', { folder: os.homedir(), bin: 'X' }), T('files', {}), T('finish', { reply: 'Tidied.' })], { clips: many });
  // two clips arrive in the project after the chat has started (the editor's own import)
  const arrive = () => x.P.items.push({ id: 'n1', name: 'DJI_boat_1.mp4', kind: 'video', bin: '(Project root)', path: '/dl/drone/DJI_boat_1.mp4', duration: 9 }, { id: 'n2', name: 'DJI_boat_2.mp4', kind: 'video', bin: '(Project root)', path: '/dl/drone/DJI_boat_2.mp4', duration: 9 });
  try {
    const log = [], chat = C.newChat();
    await C.send(chat, `find the new boat clips, put them in a Big boats bin, and bring in ${dir}`, hooksFor(log), { mode: 'never' });
    assert.ok(/There is no bin with “boat” in its name\. Make one with makebin\./.test(x.res(0)));
    assert.ok(/^2 new clips \(id, name, kind, bin, file\):\nf1\tDJI_boat_1\.mp4\tvideo\t\(Project root\)\tdrone\/DJI_boat_1\.mp4\nf2\t/.test(x.res(1).replace(/^RESULT of recent:\n/, '')), x.res(1));
    assert.ok(/2 clips \(id, name, kind, bin, file\):\nf1\t/.test(x.res(2)), 'the same clip keeps its id');
    assert.ok(/The bin “B-roll \/ Big boats” is there now/.test(x.res(3)) && x.P.bins.includes('B-roll / Big boats'));
    assert.ok(/2 clips are in the bin “B-roll \/ Big boats” now\. Not known, left out: f77\./.test(x.res(4)) && x.P.items.filter(i => /DJI/.test(i.name)).every(i => i.bin === 'B-roll / Big boats'), x.res(4));
    assert.ok(/2 media files in “[^”]+”, newest first/.test(x.res(5)) && /ship one\.mp4\t1 MB/.test(x.res(5)) && !/readme/.test(x.res(5)), x.res(5));
    assert.ok(/2 clips brought into the bin “B-roll \/ Big boats”:\nf3\tship one\.mp4\t0:20\nf4\tship two\.mp4/.test(x.res(6)), x.res(6));
    assert.ok(/Not done: “[^”]+” isn’t one of Ultra Studio’s folders and the editor hasn’t named it in this chat/.test(x.res(7)), 'a folder nobody named isn’t read');
    assert.ok(/Places footage is downloaded to/.test(x.res(8)) && /the project’s folder/.test(x.res(8)));
    assert.ok(!x.host.some(h => h[0] === 'editProject'), 'the whole project was never read');
    // undo: the move goes back; the imported clips are said to stay; the bin stays as it isn't empty
    const plan = C.undoPlan(chat);
    assert.ok(plan.cant.some(c => /2 clips that were in no bin stay in “B-roll \/ Big boats”/.test(c.text)) && plan.cant.some(c => /2 clips brought into the bin “B-roll\/Big boats” stay in the project/.test(c.text)), JSON.stringify(plan.cant.map(c => c.text)));
    await C.undo(chat);
    assert.deepStrictEqual(x.P.items.filter(i => /DJI/.test(i.name)).map(i => i.bin), ['B-roll / Big boats', 'B-roll / Big boats'], 'clips that were in no bin can’t be told back to “no bin” – they stay, and nothing else moved');
  } finally { x.restore(); fs.rmSync(dir, { recursive: true, force: true }); }
});

test('B-roll over a string-out: project clips placed over the cuts on V2 – on a copy, the editor’s sequence untouched; a track that isn’t there is said and the rest still placed; Undo all removes the copy', async () => {
  const x = setup([T('timeline', {}), T('find', { bin: 'B-roll' }), T('place', { clips: [{ clip: 'f1', at: 18, length: 4, track: 'V2' }, { clip: 'f2', at: 30, length: 4, track: 'V9' }, { clip: 'f1', at: 5, length: 3, track: 'Z1' }, { clip: 'music.wav', at: 0, track: 'A2' }] }), T('place', { clips: [{ clip: 'f2', at: 30, length: 4, track: 'V2' }] }), T('finish', { reply: 'Covered.' })],
    { clips: [{ name: 'harbour.mp4', bin: 'B-roll' }, { name: 'cranes.mp4', bin: 'B-roll' }, { name: 'music.wav', bin: 'B-roll', kind: 'audio', duration: 60 }] });
  try {
    const log = [], chat = C.newChat();
    await C.send(chat, 'cover the jump cut with B-roll from the B-roll bin and put the music under it', hooksFor(log), { mode: 'never' });
    assert.ok(/2 placed in “String-out – Ask” \(a copy of “String-out”, now your working sequence\)/.test(x.res(2)) && /harbour\.mp4: 0:18–0:22 on V2/.test(x.res(2)) && /music\.wav: 0:00–1:00 on A2/.test(x.res(2)) && /NOT placed: harbour\.mp4: “Z1” isn’t a track[^;]*; cranes\.mp4: There is no such track\./.test(x.res(2)), x.res(2));
    assert.ok(x.P.placed.every(p => p.seqId === 'copy1') && !x.P.placed.some(p => p.seqId === 'mine'), 'the editor’s own sequence is untouched');
    assert.deepStrictEqual(x.P.placed.map(p => [p.id, p.v, p.a, p.video, p.audio]), [['it1', 1, 0, true, false], ['it3', 0, 1, false, true], ['it2', 1, 0, true, false]]);
    assert.ok(/1 placed in “String-out – Ask”:/.test(x.res(3)) && x.host.filter(h => h[0] === 'cloneSequence').length === 1, 'the second go uses the same copy');
    await C.undo(chat);
    assert.deepStrictEqual(x.P.seqs.map(s => s.id), ['mine']);
  } finally { x.restore(); }
});

test('panel tools run in the background: one that would open its tab doesn’t take the screen (the chat offers a button instead) and what it gives is passed on; a failed step gets another way', async () => {
  const opens = { id: 'check.test', tool: 'check', title: 'Check the cut', changes: false, params: {}, run: async () => { US.tools.open('check', { result: { n: 2 } }); return { summary: '2 things to look at', seqId: 'mine', ranges: [{ start: 3, end: 4.5 }], files: ['/out/report.txt'] }; } };
  const fails = { id: 'silence.test', tool: 'silence', title: 'Cut the silences', changes: true, params: {}, run: async () => { throw new US.UserError('NO_AUDIO', { title: 'This sequence has no sound to listen to.', action: 'Choose one with sound.' }); } };
  const was = [US.actions.get(opens.id), US.actions.get(fails.id)]; US.actions.register(opens); US.actions.register(fails);
  const x = setup([T('action', { id: 'silence.test' }), T('action', { id: 'check.test' }), T('finish', { reply: 'Checked.', notDone: ['The silences – there is no sound'] })]);
  try {
    const realOpen = US.tools.open, log = [], chat = C.newChat();
    await C.send(chat, 'cut the silences then check it', hooksFor(log), { mode: 'never' });
    assert.strictEqual(x.opened.length, 0, 'the tab was not opened');
    assert.strictEqual(US.tools.open, realOpen, 'and opening tabs works again afterwards');
    assert.deepStrictEqual(log.filter(i => i.k === 'opened').map(i => [i.tool, i.args]), [['check', { result: { n: 2 } }]]);
    assert.ok(/ERROR: This sequence has no sound to listen to\. Choose one with sound\./.test(x.res(0)), 'the failure goes back to the AI, which carries on');
    assert.ok(/2 things to look at\. GIVES: sequence id mine; files: report\.txt; ranges \(s\): 3–4\.5\. \(Its results are in the/.test(x.res(1)), x.res(1));
    assert.strictEqual(log.find(i => i.k === 'end').notDone[0], 'The silences – there is no sound');
  } finally { x.restore(); was.forEach((a, i) => (a ? US.actions.register(a) : null)); }
});

test('one approval for a whole plan: yes covers every step of that request only; “step by step” asks each; a plan turned down runs nothing; risky steps still warn', async () => {
  const steps = () => [T('makebin', { bin: 'A' }, '', { understood: 'Three bins.', plan: ['Make A', 'Make B', 'Make C'] }), T('makebin', { bin: 'B' }), T('makebin', { bin: 'C' }), T('finish', { reply: 'Made.' })];
  let x = setup(steps().concat([T('makebin', { bin: 'D' }), T('finish', { reply: 'And D.' })]));
  try {
    const log = [], chat = C.newChat();
    await C.send(chat, 'make three bins', hooksFor(log, { planApprove: async () => ({ ok: true }) }), { mode: 'ask' });
    assert.deepStrictEqual(log.filter(i => /\?$/.test(i.k)).map(i => i.k), ['plan?'], 'asked once');
    assert.deepStrictEqual(log.find(i => i.k === 'plan?').p.plan, ['Make A', 'Make B', 'Make C']);
    await C.send(chat, 'and one more', hooksFor(log, { planApprove: async () => ({ ok: true }) }), { mode: 'ask' });
    assert.deepStrictEqual(log.filter(i => /\?$/.test(i.k)).map(i => i.k), ['plan?', 'approve?'], 'the next request asks again (a short plan: by card)');
  } finally { x.restore(); }
  x = setup(steps());
  try { const log = []; await C.send(C.newChat(), 'make three bins', hooksFor(log, { planApprove: async () => ({ each: true }) }), { mode: 'ask' }); assert.strictEqual(log.filter(i => i.k === 'approve?').length, 3); } finally { x.restore(); }
  x = setup([steps()[0], T('finish', { reply: 'What would you like instead?' })]);
  try {
    const log = [];
    await C.send(C.newChat(), 'make three bins', hooksFor(log, { planApprove: async () => ({ note: 'only two' }) }), { mode: 'ask' });
    assert.ok(!x.host.some(h => h[0] === 'ensureBin') && /did not approve your plan – nothing ran\. Instead they say: “only two”/.test(x.res(0)));
  } finally { x.restore(); }
  x = setup([T('broll.search', { requests: ['boats'], freeOnly: false }, '', { understood: 'x', plan: ['a', 'b', 'c'] }), T('broll.download', { ids: ['b1'] }), T('finish', { reply: 'ok' })]);
  x.web.found = { boats: [mk('y', { licence: STD })] };
  try { const log = []; await C.send(C.newChat(), 'get it', hooksFor(log, { planApprove: async () => ({ ok: true }) }), { mode: 'ask' }); assert.deepStrictEqual(log.filter(i => /\?$/.test(i.k)).map(i => i.k), ['plan?', 'warn?', 'approve?'], 'the warning is not covered by the plan’s yes, and the picks are still shown'); } finally { x.restore(); }
});

test('the editor itself, by typed commands: a sequence’s settings, a copy, a new name (given back by Undo), In/Out; tracks and extracting on a copy; markers listed, added, changed, removed (the editor’s own only after a warning); the playhead, the selection, a frame – and an unknown command is refused', async () => {
  const E = (d, more = {}) => T('editor', Object.assign({ do: d }, more));
  const x = setup([E('sequence.settings'), E('sequence.duplicate', { name: 'String-out v2' }), E('sequence.rename', { name: 'Rough cut' }), E('sequence.inout', { in: 2, out: 30 }),
    E('track.add', { kind: 'video', count: 2 }), E('track.set', { track: 'V2', name: 'B-roll', locked: true }), E('sequence.extract', { ranges: [[5, 6], [9, 8], [12, 14]] }),
    E('marker.add', { sequence: 'Rough cut', markers: [{ at: 4, name: 'Check' }, { at: 9, end: 11, name: 'Slow', color: 1 }] }), E('marker.list', { sequence: 'Rough cut' }), E('marker.change', { sequence: 'Rough cut', markers: [{ id: 'g2', name: 'Fixed' }] }), E('marker.remove', { sequence: 'Rough cut', ids: ['g3'] }), E('marker.remove', { sequence: 'Rough cut', ids: ['g0'] }),
    E('playhead', { at: 12 }), E('select', { clips: [{ track: 'V1', at: 0 }, { track: 'Q', at: 1 }] }), E('frame', { at: 3 }), E('format.disk'), E('track.set', { track: 'V1' }), T('finish', { reply: 'Done.' })]);
  try {
    x.P.marks = { mine: ['g0'] };
    const log = [], chat = C.newChat();
    await C.send(chat, 'work the editor', hooksFor(log), { mode: 'never' });
    const r = i => x.res(i).replace(/^RESULT of editor:\n/, '');
    assert.ok(/^SEQUENCE “String-out” \(id mine\): 1920×1080, 25 fps, 0:40 \(40 s\); video tracks 2 \(V1, V2 “B-roll” off locked\); audio tracks 1 \(A1\); In not set, Out not set; playhead 0:03; 1 markers\.$/.test(r(0)), r(0));
    assert.ok(/A copy “String-out v2” \(id copy1\)/.test(r(1)) && /“String-out” is now called “Rough cut”\./.test(r(2)) && /Set on “Rough cut”: out, in\./.test(r(3)), [r(1), r(2), r(3)].join(' | '));
    assert.ok(/added 2 on the copy “Rough cut – Ask”, now your working sequence \(the editor’s “Rough cut” is unchanged\): there are 3 video and 1 audio tracks now\./.test(r(4)), r(4));
    assert.ok(/^V2: name, locked\.$/.test(r(5)) && x.host.filter(h => h[0] === 'cloneSequence').length === 2, 'the second track change uses the same copy: ' + r(5));
    assert.deepStrictEqual(x.P.extracted, ['copy2', [[5, 6], [12, 14]]], 'ranges checked; taken out of the copy, never the editor’s sequence');
    assert.ok(/2 markers added to “Rough cut”: g2 at 0:04; g3 at 0:09\./.test(r(7)) && /3 markers on “Rough cut”/.test(r(8)) && /g2\t2\t2\t1\tMg2/.test(r(8)) && /1 of 1 markers changed/.test(r(9)) && /1 markers removed/.test(r(10)), [r(7), r(8)].join(' | '));
    // removing a marker it added: no warning; the editor's own: a warning first (mode “don't ask” notwithstanding)
    const warns = log.filter(i => i.k === 'warn?').map(i => i.w.reasons.map(q => q.id + ':' + q.text).join());
    assert.ok(warns.length === 1 && /^deletes:It removes 1 marker of yours from “Rough cut”/.test(warns[0]), JSON.stringify(warns));
    assert.ok(/The playhead is at 0:12/.test(r(12)) && /1 of 1 clips are selected/.test(r(13)) && /The frame at 0:03 of “[^”]+” is saved: .*Frames.*\.png$/.test(r(14)), [r(12), r(13), r(14)].join(' | '));
    assert.ok(/there is no editor command “format\.disk”/.test(r(15)) && /give "name", "locked" or "off"/.test(r(16)));
    // Undo: the copies go, its remaining marker comes off, the name is given back; In/Out and the frame are said to stay
    const plan = C.undoPlan(chat);
    assert.ok(plan.can.some(c => /Give the sequence “Rough cut” its name “String-out” back/.test(c.text)) && plan.can.some(c => /Take 1 marker off “Rough cut”/.test(c.text)) && plan.cant.some(c => /In and Out of “Rough cut” were changed/.test(c.text)) && plan.cant.some(c => /The picture “[^”]+” stays on the disk/.test(c.text)), JSON.stringify([plan.can.map(c => c.text), plan.cant.map(c => c.text)]));
    await C.undo(chat);
    assert.deepStrictEqual([x.P.seqs.map(q => q.name), x.P.marks.mine], [['String-out'], []]);
  } finally { x.restore(); }
});

test('waiting: for a job to finish, files to arrive in a folder, a number of seconds – shown in the working row, Stop always works, and it gives up plainly', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'us-agent-wait-'));
  fs.writeFileSync(path.join(dir, 'clip.mp4.part'), 'x');
  const x = setup([T('wait', { for: 'files', folder: dir }), T('wait', { for: 'seconds', seconds: 0.02 }), T('wait', { for: 'files', folder: os.homedir() }), T('wait', { for: 'bin', bin: 'Nowhere', timeoutMinutes: 0.0005 }), T('wait', { for: 'job' }), T('wait', { for: 'seconds', seconds: 600 }), T('finish', { reply: 'never' })]);
  try {
    const log = [], chat = C.newChat(); log._lines = [];
    chat._folders = [dir];
    const run = C.send(chat, 'wait for the download', hooksFor(log), { mode: 'ask' });
    setTimeout(() => { fs.writeFileSync(path.join(dir, 'clip.mp4'), 'video'); fs.rmSync(path.join(dir, 'clip.mp4.part')); }, 30);
    for (let i = 0; i < 400 && x.ai.length < 6; i++) await new Promise(r => setTimeout(r, 5));
    assert.ok(/1 media files are in “[^”]+” and nothing is still being written: clip\.mp4/.test(x.res(0)), x.res(0));
    assert.ok(/have passed/.test(x.res(1)));
    assert.ok(/Not waited: “[^”]+” isn’t one of Ultra Studio’s folders/.test(x.res(2)));
    assert.ok(/Still not there after [^–]+– waited for clips in the bin “Nowhere”\. Tell the editor, or set a follow-up with "later" and finish\./.test(x.res(3)), x.res(3));
    assert.ok(/Nothing is running now\./.test(x.res(4)));
    assert.ok(log._lines.some(l => /^Waiting for files in “[^”]+” \(checks every 1 s\)$/.test(l)), log._lines.join(' | '));
    // the sixth wait is ten minutes: Stop ends it at once
    await new Promise(r => setTimeout(r, 20));
    assert.strictEqual(chat.status, 'working');
    C.stop(chat); await run;
    assert.ok(/Stopped/.test(log[log.length - 1].text) && chat.status === 'idle');
  } finally { x.restore(); fs.rmSync(dir, { recursive: true, force: true }); }
});

/* ---------- follow-ups, with the clock run by hand ---------- */
function fakeClock() {
  const real = Object.assign({}, C.clock), t = { now: 1000000, timers: [], n: 0 };
  C.clock.now = () => t.now;
  C.clock.set = (fn, ms) => { const id = ++t.n; t.timers.push({ id, at: t.now + ms, fn }); return id; };
  C.clock.clear = id => { t.timers = t.timers.filter(x => x.id !== id); };
  t.advance = async ms => { const to = t.now + ms; for (;;) { const due = t.timers.filter(x => x.at <= to).sort((a, b) => a.at - b.at)[0]; if (!due) break; t.timers = t.timers.filter(x => x !== due); t.now = Math.max(t.now, due.at); await due.fn(); } t.now = to; };
  t.restore = () => Object.assign(C.clock, real);
  return t;
}

test('“check again in 30 minutes”: the chat sets itself a follow-up, says when it will be back, and when the time comes carries on by itself – in the same conversation', async () => {
  const clock = fakeClock();
  const x = setup([T('later', { minutes: 30, then: 'Look in the bin Big boats and build the reel if the clips are there' }, 'I’ll come back to it.', { understood: 'The download is still running.', plan: [] }), T('finish', { reply: 'I’ll check again at half past.' }),
    T('bins', { filter: 'Interviews' }, 'Looking.', { understood: 'Time to check.' }), T('finish', { reply: 'They are there now.' })]);
  try {
    const log = [], chat = C.newChat(), runs = [];
    const hooks = hooksFor(log, { resume: async (c, f) => { runs.push(f.text); await C.send(c, f.text, hooks, { mode: 'ask', unattended: true }); } });
    await C.send(chat, 'the download is still going – check again in 30 minutes', hooks, { mode: 'ask' });
    const f = chat.followups[0];
    assert.deepStrictEqual([chat.followups.length, f.state, f.at - clock.now, f.text], [1, 'pending', 1800000, 'Look in the bin Big boats and build the reel if the clips are there']);
    assert.ok(/Set: in 30 minutes \(\d\d:\d\d\) you will carry on with: “Look in the bin Big boats/.test(x.res(0)) && /Now call finish/.test(x.res(0)));
    assert.deepStrictEqual(log.filter(i => i.k === 'followup').map(i => [i.id, i.at]), [[f.id, f.at]], 'the chat shows it (a chip with a countdown)');
    await clock.advance(29 * 60000);
    assert.strictEqual(runs.length, 0, 'not before its time');
    await clock.advance(60000);
    assert.deepStrictEqual([runs.length, f.state], [1, 'done']);
    const me = log.filter(i => i.k === 'me');
    assert.ok(me.length === 2 && me[1].auto === true, 'shown as its own return, not as something the editor typed');
    const turn = x.ai[2].turns[x.ai[2].turns.length - 1].user;
    assert.ok(/It is now the time you set yourself\. YOUR OWN FOLLOW-UP: “Look in the bin Big boats/.test(turn) && /The editor may not be at the computer/.test(turn), turn);
    assert.strictEqual(log.filter(i => i.k === 'end').pop().reply, 'They are there now.');
    assert.ok(chat.unattendedMs >= 0 && chat.status === 'idle');
  } finally { x.restore(); clock.restore(); }
});

test('the caps on follow-ups: a few a chat, a day ahead at most, none in the past; it never fires while the chat or another job is busy (it tries again, then gives up); cancelled ones don’t fire', async () => {
  const clock = fakeClock(), x = setup([]);
  try {
    const chat = C.newChat(), fired = [];
    chat._resume = async (c, f) => { fired.push(f.id); };
    assert.ok(/Say in "then"/.test(C.schedule(chat, { inMs: 5000 }).error) && /already passed/.test(C.schedule(chat, { inMs: 10, text: 'x' }).error) && /at most a day ahead/.test(C.schedule(chat, { inMs: 25 * 3600000, text: 'x' }).error));
    const a = C.schedule(chat, { inMs: 60000, text: 'first' }), b = C.schedule(chat, { inMs: 120000, text: 'second' });
    assert.strictEqual(C.cancelFollowUp(chat, b.id), true);
    // busy: the chat itself is working, then another job is running
    chat.status = 'working';
    await clock.advance(60000);
    assert.deepStrictEqual([fired.length, a.state, a.tries], [0, 'pending', 1], 'held while the chat is busy');
    chat.status = 'idle';
    const realJobs = Object.getOwnPropertyDescriptor(US.jobs, 'current');
    Object.defineProperty(US.jobs, 'current', { configurable: true, get: () => ({ title: 'Export' }) });
    await clock.advance(C.FOLLOW.retryMs);
    assert.strictEqual(fired.length, 0, 'held while another job is running');
    Object.defineProperty(US.jobs, 'current', realJobs);
    await clock.advance(C.FOLLOW.retryMs);
    assert.deepStrictEqual([fired, a.state, b.state], [[a.id], 'done', 'cancelled']);
    await clock.advance(200000);
    assert.strictEqual(fired.length, 1, 'the cancelled one never fired');
    // it gives up, saying so, when it can never get a turn
    const c = C.schedule(chat, { inMs: 2000, text: 'third' });
    chat.status = 'working';
    await clock.advance(2000 + C.FOLLOW.retryMs * (C.FOLLOW.tries + 1));
    assert.strictEqual(c.state, 'missed');
    chat.status = 'idle';
    // the most a chat may set, and none once it has used its time alone
    for (let i = 0; i < 10; i++) C.schedule(chat, { inMs: 5000, text: 'more ' + i });
    assert.strictEqual(chat.followups.filter(f => f.state !== 'cancelled').length, C.FOLLOW.perChat);
    assert.ok(/already set 6 follow-ups, the most it may/.test(C.schedule(chat, { inMs: 5000, text: 'x' }).error));
    const lone = C.newChat(); lone.unattendedMs = C.FOLLOW.unattendedMs;
    assert.ok(/used all the time it may work on its own/.test(C.schedule(lone, { inMs: 5000, text: 'x' }).error));
    assert.deepStrictEqual([C.FOLLOW.perChat, C.FOLLOW.maxMs, C.FOLLOW.steps, C.FOLLOW.unattendedMs], [6, 86400000, 15, 1800000]);
  } finally { x.restore(); clock.restore(); }
});

test('on its own it is careful: a risky step doesn’t run – the plan waits for the editor; spending and steps are capped and nobody is asked; “carry on” then runs it with them there', async () => {
  const clock = fakeClock();
  const EDIT = T('edit', { where: 'sequence', inPlace: true, steps: [{ op: 'opacity', targets: { tracks: ['V1'] }, params: { value: 50 } }] });
  let x = setup([EDIT, EDIT, T('finish', { reply: 'Done with you here.' })]);
  try {
    const log = [], chat = C.newChat();
    await C.send(chat, 'Carry on and change the sequence itself', hooksFor(log), { mode: 'never', unattended: true });
    assert.ok(!log.some(i => i.k === 'warn?') && !x.host.some(h => h[0] === 'editApply' || h[0] === 'cloneSequence'), 'nothing ran and nobody was asked');
    const p = log.find(i => i.k === 'paused');
    assert.ok(/^Waiting for you before “Edit the sequence itself/.test(p.text) && /I was working on my own and this step is risky \(It changes “String-out” itself, not a copy\./.test(p.text), p.text);
    await C.send(chat, 'carry on', hooksFor(log), { mode: 'never' });
    assert.ok(log.some(i => i.k === 'warn?') && x.host.some(h => h[0] === 'editApply'), 'with the editor there it warns as usual, and runs on Continue');
  } finally { x.restore(); }
  // spend: the cap is the “costly step” threshold, whatever the chat's own limit; the limit card is never shown
  x = setup(Array.from({ length: 8 }, () => T('bins', {}, '', { usd: 0.4 })));
  try {
    const log = [], chat = C.newChat(); let asked = 0;
    await C.send(chat, 'keep looking', Object.assign(hooksFor(log), { limit: async () => { asked++; return 'more'; } }), { mode: 'never', unattended: true, budget: 10, limits: { spend: 1 } });
    assert.deepStrictEqual([asked, x.ai.length], [0, 3], 'stopped at $1 without asking');
    assert.ok(/Stopped at the spending limit/.test(log[log.length - 1].text));
  } finally { x.restore(); }
  x = setup(Array.from({ length: 30 }, () => T('bins', {}, '', { usd: 0 })));
  try { const log = []; await C.send(C.newChat(), 'keep looking', hooksFor(log), { mode: 'never', unattended: true, maxSteps: 25, budget: 0 }); assert.strictEqual(x.ai.length, C.FOLLOW.steps, 'at most 15 steps on its own'); } finally { x.restore(); }
  // time: a chat that has used its half hour alone stops at once
  x = setup([T('bins', {})]);
  try { const log = [], chat = C.newChat(); chat.unattendedMs = C.FOLLOW.unattendedMs; await C.send(chat, 'more', hooksFor(log), { mode: 'never', unattended: true }); assert.ok(x.ai.length === 0 && /worked on its own for 30 minutes in all/.test(log[log.length - 1].text)); } finally { x.restore(); clock.restore(); }
});

test('after the panel is loaded again: follow-ups are kept with the chat and armed again; one whose time passed while the panel was closed is not run by itself – it is “due” until the editor says', async () => {
  const clock = fakeClock(), x = setup([]);
  try {
    const chat = C.newChat({ title: 'Boats' });
    const soon = C.schedule(chat, { inMs: 10 * 60000, text: 'check the bin' }), late = C.schedule(chat, { inMs: 5 * 60000, text: 'check the folder' });
    const kept = JSON.parse(JSON.stringify(C.toStored(chat)));
    assert.deepStrictEqual(kept.followups.map(f => [f.text, f.state, f.at]), [['check the bin', 'pending', soon.at], ['check the folder', 'pending', late.at]]);
    C.disarm(chat);
    assert.strictEqual(clock.timers.length, 0, 'the old panel’s timers are gone');
    // the panel was closed for seven minutes
    clock.now += 7 * 60000;
    const again = C.fromStored(kept), fired = [];
    again._resume = async (c, f) => { fired.push(f.text); };
    const due = C.rearm(again);
    assert.deepStrictEqual([due.map(f => f.text), again.followups.map(f => f.state)], [['check the folder'], ['pending', 'due']]);
    await clock.advance(3 * 60000);
    assert.deepStrictEqual(fired, ['check the bin'], 'the one still ahead fires at its time; the late one waits to be asked');
    assert.strictEqual(C.runFollowUp(again, again.followups[1].id), true);
    await clock.advance(1);
    assert.deepStrictEqual([fired, again.followups.map(f => f.state)], [['check the bin', 'check the folder'], ['done', 'done']]);
    assert.strictEqual(C.runFollowUp(again, again.followups[1].id), false, 'not twice');
  } finally { x.restore(); clock.restore(); }
});

test('whole jobs to try: each starter chain names the steps it takes; the list and what each needs is in dev/docs/ask-chains.md', () => {
  const cs = US.recipes.CHAINS;
  assert.ok(cs.length >= 6 && cs.every(c => c.id && c.name && c.ask.length > 20 && c.steps.length >= 3) && new Set(cs.map(c => c.id)).size === cs.length);
  assert.ok(/big boats/.test(cs[0].ask), 'the user’s own case is the first');
  const doc = fs.readFileSync(path.join(__dirname, '..', 'docs', 'ask-chains.md'), 'utf8');
  for (const c of cs) assert.ok(doc.includes(c.name), `${c.name} is in the document`);
});
