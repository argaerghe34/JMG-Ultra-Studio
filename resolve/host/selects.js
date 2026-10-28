// JMG Ultra Studio – Selects (Resolve side). Same commands, arguments and results as jsx/tools/selects.jsx.
'use strict';
const fs = require('fs');

const STILL = /\.(jpe?g|png|tiff?|psd|ai|bmp|gif|heic|webp|dng|exr|tga|svg)$/i;

module.exports = (R) => {
  const trackOf = ti => { try { return R.list(ti.GetTrackTypeAndIndex()); } catch (e) { return []; } };
  const span = (tl, ti) => ({ start: R.tlSec(tl, ti.GetStart()), end: R.tlSec(tl, ti.GetEnd()) });

  return {
    /**
     * Subclips laid down whole on track 1, so the timeline clips keep the subclip's range; they take the subclip's
     * clip colour (tier colours). a: {seqId, ids:[subclip ids], cursor?} -> {cursor, placed:[{start,end}|null]}
     */
    selectsPlaceWhole(a) {
      const tl = R.needSeq(a.seqId);
      let cursor = a.cursor != null ? a.cursor : R.tlDuration(tl);
      const placed = [];
      R.open(tl);
      for (const id of a.ids || []) {
        const it = R.itemById(id);
        if (!it) { placed.push(null); continue; }
        const p = R.props(it), frames = Number(p['Frames']) || 1;
        let s = Number(p['Start']), e = Number(p['End']);
        if (!isFinite(s) || !isFinite(e) || e < s) { s = 0; e = frames - 1; }
        e += 1; // a subclip's End is its last frame; AppendToTimeline's endFrame is exclusive (base.js clipInfo)
        const got = R.list(R.pool().AppendToTimeline([{ mediaPoolItem: it, startFrame: s, endFrame: e, trackIndex: 1, recordFrame: R.tlFrame(tl, cursor) }])).filter(Boolean);
        const main = got.find(ti => trackOf(ti)[0] === 'video') || got[0];
        if (!main) { placed.push(null); continue; }
        const colour = it.GetClipColor ? String(it.GetClipColor() || '') : '';
        if (colour) for (const ti of got) { try { ti.SetClipColor(colour); } catch (er) { /* a nicety */ } }
        const sp = span(tl, main);
        placed.push(sp); cursor = sp.end;
      }
      return { cursor, placed };
    },

    /**
     * The camera clips a timeline uses, so they can be graded. a: {seqId, allTracks:false}
     * Skips titles/generators, adjustment clips, compound clips and nested timelines, stills and switched-off clips.
     * -> {name, uses:[{itemId, name, track, start, end, in, out, speed}], skipped:{graphics, adjustment, nested, stills, disabled}}
     */
    selectsSequenceUses(a) {
      const tl = R.needSeq(a.seqId), out = [], skipped = { graphics: 0, adjustment: 0, nested: 0, stills: 0, disabled: 0 };
      const n = a.allTracks ? tl.GetTrackCount('video') : Math.min(1, tl.GetTrackCount('video'));
      for (let t = 1; t <= n; t++) {
        for (const ti of R.list(tl.GetItemListInTrack('video', t))) {
          if (!ti) continue;
          const mpi = ti.GetMediaPoolItem ? ti.GetMediaPoolItem() : null;
          if (!mpi) { if (/adjustment/i.test(String(ti.GetName() || ''))) skipped.adjustment++; else skipped.graphics++; continue; }
          if (ti.GetClipEnabled && ti.GetClipEnabled() === false) { skipped.disabled++; continue; }
          const p = R.props(mpi), type = String(p['Type'] || ''), file = String(p['File Path'] || '');
          if (/timeline|compound|multicam/i.test(type)) { skipped.nested++; continue; }
          if (/adjustment/i.test(type)) { skipped.adjustment++; continue; }
          if (!file) { skipped.graphics++; continue; }
          if (STILL.test(file) || /still/i.test(type)) { skipped.stills++; continue; }
          const tm = R.itemTimes(tl, ti);
          out.push({ itemId: R.id(mpi), name: String(p['Clip Name'] || mpi.GetName()), track: t - 1, start: tm.start, end: tm.end, in: tm.in, out: tm.out, speed: tm.speed || 1 });
        }
      }
      return { name: tl.GetName(), uses: out, skipped };
    },

    /** Attach a file as the proxy of a clip. a: {id, path} -> true/false */
    selectsAttachProxy(a) {
      const it = R.needItem(a.id);
      if (!R.exists(a.path)) throw R.err('NOT_FOUND', a.path);
      return !!it.LinkProxyMedia(a.path);
    },

    /**
     * Full-size stills from source clips: each clip goes on a scratch timeline the size of the clip, the playhead goes
     * to the frame and Resolve exports it (Project.ExportCurrentFrameAsStill, with its grade). Stills are only written
     * to disk. The scratch timelines are deleted and Resolve is left on the timeline, page and bin it was on.
     * a: {stills:[{id, seconds, out}]} -> [png path or null]
     */
    selectsStills(a) {
      const pr = R.project(), pool = R.pool(), keepTl = pr.GetCurrentTimeline(), keepFolder = pool.GetCurrentFolder(), made = [], out = [];
      let page = ''; try { page = R.api.GetCurrentPage ? R.api.GetCurrentPage() : ''; } catch (e) { /* older Resolve */ }
      const tls = {};
      try {
        for (const s of a.stills || []) {
          try {
            const it = R.needItem(s.id), info = R.itemInfo(it);
            let tl = tls[s.id];
            if (!tl) {
              const bin = R.ensureBin('JMG Ultra Studio/.stills');
              tl = R.inFolder(bin, () => pool.CreateEmptyTimeline(R.uniqueTimelineName('Ultra Studio stills')));
              if (!tl) throw new Error('no scratch timeline');
              made.push(tl); tls[s.id] = tl;
              // the clip's own size, so the still is too
              if (info.width && info.height) { tl.SetSetting('useCustomSettings', '1'); tl.SetSetting('timelineResolutionWidth', String(info.width)); tl.SetSetting('timelineResolutionHeight', String(info.height)); }
            }
            R.open(tl);
            for (const { ti } of R.trackItems(tl, 'video').concat(R.trackItems(tl, 'audio'))) { try { tl.DeleteClips([ti], false); } catch (e) { /* replaced below */ } }
            const got = R.list(pool.AppendToTimeline([R.clipInfo(it, s.seconds, s.seconds + 0.5, { trackIndex: 1, recordFrame: tl.GetStartFrame(), mediaType: 1 })])).filter(Boolean);
            if (!got.length) throw new Error('not placed');
            tl.SetCurrentTimecode(R.framesToTC(tl.GetStartFrame(), R.fps(tl), R.dropFrame(tl)));
            const file = /\.png$/i.test(s.out) ? s.out : s.out + '.png';
            try { fs.unlinkSync(file); } catch (e) { /* not there */ }
            let ok = pr.ExportCurrentFrameAsStill(file);
            // some Resolve versions export stills only from the Color page
            if ((!ok || !R.exists(file)) && R.api.OpenPage) { try { R.api.OpenPage('color'); ok = pr.ExportCurrentFrameAsStill(file); } catch (e) { ok = false; } }
            out.push(ok && R.exists(file) ? file : null);
          } catch (e) { out.push(null); }
        }
      } finally {
        try { if (made.length) pool.DeleteTimelines(made); } catch (e) { /* left in .stills */ }
        R.forget();
        const e = R.index().folders.find(f => f.parts.join('/') === 'JMG Ultra Studio/.stills');
        if (e && !R.list(e.folder.GetClipList()).length) { try { pool.DeleteFolders([e.folder]); } catch (er) { /* harmless */ } }
        try { if (keepTl && R.timelines().some(t => R.id(t) === R.id(keepTl))) pr.SetCurrentTimeline(keepTl); } catch (er) { /* closing */ }
        try { if (keepFolder) pool.SetCurrentFolder(keepFolder); } catch (er) { /* closing */ }
        try { if (page && R.api.GetCurrentPage() !== page) R.api.OpenPage(page); } catch (er) { /* closing */ }
        R.forget();
      }
      return out;
    }
  };
};
