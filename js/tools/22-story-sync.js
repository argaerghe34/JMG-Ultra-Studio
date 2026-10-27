/* JMG Ultra Studio – Story travels with the project: a copy of Story next to the .prproj (in a "JMG Ultra Studio"
   folder), so the same project opened on the Mac or the PC – usually from the same drive – finds its transcripts,
   themes and narratives. The copy in Ultra Studio's own folder stays as before. Loaded before 22-story.js. */
(function () {
  'use strict';
  const US = window.US;
  const fsx = US.fsx, fs = fsx.fs, path = fsx.path, os = fsx.os;

  const FOLDER = 'JMG Ultra Studio';
  /** Characters Windows doesn't allow in file names (a Mac allows most of them). */
  const safeName = s => String(s || 'Project').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-').replace(/[. ]+$/, '') || 'Project';
  const projectName = p => US.basename(p).replace(/\.prproj$/i, '');
  const sharedDir = projectPath => path.join(path.dirname(projectPath), FOLDER);
  const sharedFile = projectPath => path.join(sharedDir(projectPath), safeName(projectName(projectPath)) + ' – Story.json');
  const computer = () => ({ by: String(os.hostname() || '').replace(/\.local$/i, ''), os: fsx.isWin ? 'PC' : 'Mac' });
  const hasWork = s => !!s && ((s.transcripts && s.transcripts.length) || (s.themes && s.themes.length) || (s.wall && s.wall.columns && s.wall.columns.length));

  /** Which copy to open. local / shared: the two Story states (or null); synced: the id of the shared copy this
      computer last wrote or read (null if never). Returns { pick: 'none'|'local'|'shared', conflict }. With a
      conflict the newer copy is picked and the other one should be offered. */
  function choose(local, shared, synced) {
    if (!local && !shared) return { pick: 'none', conflict: false };
    if (!shared) return { pick: 'local', conflict: false };
    if (!local) return { pick: 'shared', conflict: false };
    const lid = local.sync && local.sync.id, sid = shared.sync && shared.sync.id;
    if (lid && lid === sid) return { pick: 'shared', conflict: false };
    if (!synced) {
      // first time on this computer with both: an empty side never counts as work to keep
      if (!hasWork(local)) return { pick: 'shared', conflict: false };
      if (!hasWork(shared)) return { pick: 'local', conflict: false };
      return { pick: newer(local, shared), conflict: true };
    }
    const localChanged = lid !== synced, sharedChanged = sid !== synced;
    if (!sharedChanged) return { pick: 'local', conflict: false };
    if (!localChanged) return { pick: 'shared', conflict: false };
    return { pick: newer(local, shared), conflict: true };
  }
  const savedAt = s => (s && s.sync && s.sync.at) || 0;
  const newer = (local, shared) => (savedAt(shared) > savedAt(local) ? 'shared' : 'local');

  /* ---------- transcripts read again on another computer (or re-transcribed) ---------- */
  const words = s => String(s || '').toLowerCase().replace(/[^\p{L}\p{N}' ]+/gu, ' ').split(/\s+/).filter(Boolean);
  function similar(a, b) {
    const A = new Set(words(a)), B = new Set(words(b));
    if (!A.size || !B.size) return 0;
    let n = 0; for (const w of A) if (B.has(w)) n++;
    return n / Math.max(A.size, B.size);
  }
  /** The transcript already in Story that this newly read one replaces, when its path changed (another computer,
      another drive letter, moved media). By Premiere's clip id, else the same file name – several with one name (two
      cards' C0001.MP4) are told apart by their words. A transcript whose own file is still there is never taken over.
      it: { key, path, name, itemId, lines }. */
  function matchTranscript(transcripts, it, exists = fsx.exists) {
    const exact = transcripts.find(t => t.key === it.key);
    if (exact) return exact;
    // only the few candidates are checked on disk (a big project on a network drive has hundreds of transcripts)
    const free = t => !t.path || !exists(t.path);
    if (it.itemId) { const byId = transcripts.find(t => t.itemId && t.itemId === it.itemId && free(t)); if (byId) return byId; }
    const base = US.basename(it.path || it.name).toLowerCase();
    if (!base) return null;
    const same = transcripts.filter(t => US.basename(t.path || t.name).toLowerCase() === base && free(t));
    // a file name alone isn't enough (another card's C0001.MP4, or a new clip while the old one is offline): it has
    // to say the same things
    let best = null, bestN = 0;
    for (const t of same) { const n = sameWords(t.lines || [], it.lines || []); if (n > bestN) { best = t; bestN = n; } }
    return bestN >= 0.3 ? best : null;
  }
  /** How much two transcripts of one clip say the same: the share of lines read identically, or, for a clip
      transcribed again (lines split differently), how alike their words are. 0–1. */
  function sameWords(a, b) {
    if (!a.length || !b.length) return 0;
    const texts = new Set(a.map(l => l.text));
    const same = b.reduce((k, l) => k + (texts.has(l.text) ? 1 : 0), 0) / Math.min(a.length, b.length);
    if (same >= 0.3) return same;
    const head = ls => ls.slice(0, 60).map(l => l.text).join(' ');
    return similar(head(a), head(b)) >= 0.6 ? 0.3 : same;
  }
  /** Give re-read lines the ids they had, so themes, narratives and moments keep pointing at them. Lines read the
      same way get the same id anyway (the id is the start time); a line that moved a little (re-transcribed) takes
      the old id of the nearest line within 1.5 s that says nearly the same. Returns { kept, changed }. */
  function carryIds(oldLines, newLines) {
    const newIds = new Set(newLines.map(l => l.id));
    const orphans = oldLines.filter(l => !newIds.has(l.id));
    const oldIds = new Set(oldLines.map(l => l.id));
    let changed = 0;
    for (const l of newLines) {
      if (oldIds.has(l.id)) continue;
      let best = null, bestD = Infinity;
      for (const o of orphans) {
        if (o.taken) continue;
        const d = Math.abs(o.start - l.start);
        if (d <= 1.5 && d < bestD && similar(o.text, l.text) >= 0.6) { best = o; bestD = d; }
      }
      if (best) { best.taken = true; l.id = best.id; } else changed++;
    }
    orphans.forEach(o => delete o.taken);
    return { kept: newLines.length - changed, changed };
  }

  /* ---------- files ---------- */
  const readState = f => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return null; } };
  const statOf = f => { try { const s = fs.statSync(f); return { size: s.size, mtimeMs: s.mtimeMs }; } catch (e) { return null; } };
  const sameStat = (a, b) => !!a && !!b && a.size === b.size && a.mtimeMs === b.mtimeMs;
  /** Other copies a sync service made beside ours ("… (conflicted copy …)", "…-PCNAME", "… (1)"). Not backups, not
      the hidden ._ files a Mac leaves on exFAT drives. */
  function strayCopies(projectPath) {
    const main = path.basename(sharedFile(projectPath)), stem = main.replace(/\.json$/, '');
    try {
      return fs.readdirSync(sharedDir(projectPath))
        .filter(f => f !== main && f[0] !== '.' && f.startsWith(stem) && /\.json$/i.test(f) && !/\(backup /.test(f))
        .map(f => path.join(sharedDir(projectPath), f));
    } catch (e) { return []; }
  }
  function backupName(projectPath, s) {
    const d = new Date(savedAt(s) || Date.now()), p2 = n => String(n).padStart(2, '0');
    const who = safeName((s && s.sync && (s.sync.by || s.sync.os)) || 'unknown');
    return path.join(sharedDir(projectPath), `${safeName(projectName(projectPath))} – Story (backup from ${who} ${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())} ${p2(d.getHours())}${p2(d.getMinutes())}).json`);
  }
  /** Who saved a copy, in plain words, and when. */
  function describe(s) {
    const me = computer(), sy = (s && s.sync) || {};
    const where = !sy.by ? 'an earlier version' : (sy.by === me.by ? 'this computer' : `the ${sy.os === me.os ? 'other ' + sy.os : sy.os} (${sy.by})`);
    const at = savedAt(s) ? new Date(savedAt(s)).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
    return at ? `${where}, ${at}` : where;
  }

  /** One per open project: loads the right copy, then keeps the shared copy up to date. */
  function open(projectPath, localFile) {
    const on = US.settings.get('story.withProject', true) !== false;
    const store = US.projectStore(projectPath);
    const rec = store.get('storySync', {});
    const file = sharedFile(projectPath);
    const local = readState(localFile);
    let shared = null, status = { where: 'local', reason: on ? '' : 'off' };
    if (on) {
      shared = readState(file);
      if (!shared && fsx.exists(file)) status.reason = 'unreadable';
    }
    let { pick, conflict } = choose(local, shared, rec.id || null);
    let other = conflict ? (pick === 'local' ? shared : local) : null;
    // copies a sync service set aside: the newest that isn't what we're opening is offered like a conflict
    if (on) for (const f of strayCopies(projectPath)) {
      const s = readState(f);
      const chosen = pick === 'local' ? local : shared;
      if (s && s.sync && (!chosen || !chosen.sync || s.sync.id !== chosen.sync.id) && s.sync.id !== rec.id && hasWork(s)) {
        if (!other || savedAt(s) > savedAt(other)) other = s;
      }
      try { fs.renameSync(f, s ? backupName(projectPath, s) : f + '.unreadable'); } catch (e) { /* leave it */ }
    }
    const state = pick === 'local' ? local : pick === 'shared' ? shared : null;
    if (other) {
      try { fsx.writeJSON(backupName(projectPath, other), other); } catch (e) { /* the question still offers it */ }
      US.log('warn', `Story was changed on two computers: opened the copy from ${describe(state)}; kept the one from ${describe(other)} as a backup`, '', 'story');
    } else if (state) US.log('info', `Story opened from ${pick === 'shared' ? 'the copy next to the project' : 'this computer'} (${describe(state)})`, '', 'story');

    // a copy that couldn't be read (a sync service or antivirus holding it) counts as unseen: checked again before writing
    let lastStat = on && shared ? statOf(file) : null, failed = false;
    if (pick === 'shared' && shared && shared.sync) {
      store.set('storySync', { id: shared.sync.id }); store.flush(); status.where = 'project';
      // this computer's copy becomes the one it opened, or the next open would think it had changed here
      if (!local || !local.sync || local.sync.id !== shared.sync.id) { try { fsx.writeJSON(localFile, shared); } catch (e) { /* kept next to the project */ } }
    }
    const session = {
      state, other, file, projectPath,
      // a copy only on this computer (older version, or the drive was away): put it next to the project soon
      needsWrite: on && pick === 'local' && hasWork(local),
      status: () => status,
      /** Stamp the state before it's written to this computer. */
      stamp(s) { s.sync = Object.assign({ id: US.uid('s'), at: Date.now() }, computer()); },
      /** Write the copy next to the project (now). Doesn't overwrite a copy another computer wrote meanwhile:
          that one is kept as a backup and offered instead. */
      writeShared(s) {
        if (US.settings.get('story.withProject', true) === false) { status = { where: 'local', reason: 'off' }; return null; }
        if (!s || (!hasWork(s) && !fsx.exists(file))) return null;   // nothing yet – but an emptied Story is saved
        let theirs = null;
        const now = statOf(file);
        if (now && !sameStat(now, lastStat)) {   // includes a copy that appeared since this one opened
          const t = readState(file);
          if (!t) {
            // can't read it (held by a sync service, half-synced): keep its bytes before replacing it, or leave it be
            try { fs.copyFileSync(file, backupName(projectPath, { sync: { by: 'unreadable copy', at: Date.now() } })); }
            catch (e) { status = { where: 'local', reason: 'unreadable' }; return null; }
          } else if (t.sync && (!s.sync || t.sync.id !== s.sync.id) && t.sync.id !== store.get('storySync', {}).id) theirs = t;
        }
        try {
          if (theirs) fsx.writeJSON(backupName(projectPath, theirs), theirs);
          fsx.writeJSON(file, s);
          lastStat = statOf(file);
          store.set('storySync', { id: s.sync && s.sync.id }); store.flush();
          if (failed) US.log('info', 'Story is saved next to the project again', file, 'story');
          failed = false; status = { where: 'project', reason: '' };
        } catch (e) {
          if (!failed) US.log('warn', 'Couldn’t save Story next to the project – it’s kept on this computer', `${file}\n${e.message}`, 'story');
          failed = true; status = { where: 'local', reason: 'unwritable' };
        }
        return theirs;
      }
    };
    return session;
  }

  US.storySync = { open, choose, matchTranscript, carryIds, similar, sameWords, sharedFile, safeName, describe, hasWork, strayCopies, backupName };
})();
