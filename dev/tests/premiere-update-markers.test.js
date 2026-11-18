// Runs jsx/host.jsx's updateMarkers against a stand-in for a clip's markers in Premiere. In Premiere 2027 a clip's own
// marker kept its old name and colour after an edit (dev/e2e/35-markers-clips.e2e.js): every change is now read back
// from a fresh copy and, where it didn't stick, the marker is made again with the new values (its guid changes, as in
// Resolve). Where edits do stick, the marker is changed in place and keeps its guid.
'use strict';
const assert = require('assert'), fs = require('fs'), path = require('path'), vm = require('vm');
const { test, ROOT } = require('./harness');

function makePremiere({ editsStick }) {
  let nextGuid = 1;
  const store = [];   // the clip's markers as Premiere keeps them: {guid, start, end, name, comments, color, type}
  const time = s => ({ seconds: s });
  // getMarkers() hands out marker objects; with editsStick false, writing to them changes only that copy
  function view(rec, live = editsStick) {
    const tgt = live ? rec : Object.assign({}, rec);
    return {
      get guid() { return tgt.guid; }, get type() { return tgt.type; },
      get name() { return tgt.name; }, set name(v) { tgt.name = v; },
      get comments() { return tgt.comments; }, set comments(v) { tgt.comments = v; },
      get start() { return time(tgt.start); }, set start(v) { tgt.start = typeof v === 'number' ? v : v.seconds; },
      get end() { return time(tgt.end); }, set end(v) { tgt.end = typeof v === 'number' ? v : v.seconds; },
      getColorByIndex() { return tgt.color; }, setColorByIndex(c) { tgt.color = c; }, setTypeAsChapter() { tgt.type = 'Chapter'; }, _rec: rec
    };
  }
  function markers() {
    const views = store.slice().sort((a, b) => a.start - b.start).map(r => view(r));
    return {
      getFirstMarker() { return views[0]; },
      getNextMarker(m) { return views[views.indexOf(m) + 1]; },
      // a new marker: made by Premiere itself, so writing to it sticks
      createMarker(s) { const rec = { guid: 'g' + (nextGuid++), start: s, end: s, name: '', comments: '', color: 0, type: 'Comment' }; store.push(rec); return view(rec, true); },
      deleteMarker(m) { const i = store.indexOf(m._rec); if (i >= 0) store.splice(i, 1); }
    };
  }
  const clip = { nodeId: 'X', name: 'C001.mp4', type: 1, getMarkers: markers };
  const root = { nodeId: 'root', type: 3, children: { numItems: 1, 0: clip } };
  function Time() { this.seconds = 0; }
  const ctx = { app: { project: { rootItem: root, sequences: { numSequences: 0 } }, path: '/Applications/Premiere/' }, $: { os: 'Macintosh' }, JSON, Time, ExternalObject: {}, File: function () { return { exists: false }; } };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'jsx/host.jsx'), 'utf8'), ctx, { filename: 'jsx/host.jsx' });
  const call = (name, a) => { const r = JSON.parse(ctx.UStudio.run(name, JSON.stringify(a))); if (!r.ok) throw new Error(name + ': ' + JSON.stringify(r.error)); return r.data; };
  return { call, store };
}

for (const editsStick of [false, true]) {
  test(`premiere updateMarkers on a clip's marker (${editsStick ? 'edits stick: changed in place' : 'edits ignored, as in Premiere 2027: made again'})`, () => {
    const P = makePremiere({ editsStick });
    const [g] = P.call('addClipMarkers', { id: 'X', markers: [{ start: 1, end: null, name: 'On X', comment: 'keep me', color: 3 }] });
    const r = P.call('updateMarkers', { seqId: 'S', markers: [{ guid: `clip:X:${g}`, name: 'Moved', color: 6, start: 1.5 }] });
    assert.strictEqual(r.done, 1);
    assert.strictEqual(r.remade, editsStick ? 0 : 1);
    const ms = P.call('clipMarkers', { id: 'X' });
    assert.strictEqual(ms.length, 1, JSON.stringify(ms));
    assert.deepStrictEqual([ms[0].name, ms[0].comment, ms[0].color, ms[0].start, ms[0].end], ['Moved', 'keep me', 6, 1.5, 1.5]);
    assert.strictEqual(r.guids[`clip:X:${g}`], `clip:X:${ms[0].guid}`);
    assert.strictEqual(ms[0].guid === g, editsStick, 'keeps its guid only when changed in place');
    // a marker that isn't there: nothing done, nothing made
    assert.strictEqual(P.call('updateMarkers', { id: 'X', markers: [{ guid: 'nope', name: 'x' }] }).done, 0);
    assert.strictEqual(P.call('clipMarkers', { id: 'X' }).length, 1);
  });
}
