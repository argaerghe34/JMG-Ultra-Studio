/* JMG Ultra Studio – Song Splitter: splits a concert or event recording into songs, applause and talk. */
(function () {
  'use strict';
  const US = window.US, h = US.h, ui = US.ui, kit = US.audioKit;
  const VERSION = 1;
  const TYPES = { song: 'Song', applause: 'Applause', talk: 'Talk', silence: 'Quiet' };
  const MARKER_COLOR = { song: 2, applause: 4, talk: 6, silence: 5 };
  const LABEL_SONG = 3; // Lavender
  // adjustment layers above the edit: songs numbered 1, 2, 3…, colour-coded by kind (Premiere labels; Resolve uses the
  // nearest clip colour). Deliver › Render ranges renders them, and can take one colour only.
  const LAYER_TRACK = 'Songs';
  const LAYER_LABEL = { song: 5, talk: 4, applause: 7 };   // Forest, Cerulean, Mango
  /** The layers for a result: each song named by its number (and its title once you've named it), talk and applause. */
  function layerSections(res, off) {
    let n = 0;
    return res.segments.filter(s => LAYER_LABEL[s.type] != null).map(s => {
      const name = s.type === 'song' ? (++n, s.named && s.name ? `${n} ${s.name}` : String(n)) : TYPES[s.type];
      return { name, start: s.start + off, end: s.end + off, label: LAYER_LABEL[s.type], type: s.type };
    });
  }

  async function analyse(target, job) {
    const run = async () => {
      const a = await kit.loadAudio(target, job.range(0, 0.3));
      job.range(0.3, 1).set({ who: 'computer', msg: `Listening to “${target.name}” (${US.fmtDur(a.duration)})` });
      const r = await US.dsp.classify(a.data, a.sr, { onProgress: f => job.progress(f, `Listening… ${US.fmtDur(f * a.duration)} of ${US.fmtDur(a.duration)}`), check: () => job.check() });
      const env = US.audio.envelope(a.data, a.sr, 0.5).db;
      return { segments: r.segments, duration: a.duration, offset: a.offset || 0, curve: Array.from(env) };
    };
    const res = (target.kind === 'item' && target.item.path)
      ? await US.cache.cached('songs', target.item.path, VERSION + '-' + (await US.host.call('audioClipRange', { id: target.id }))['in'].toFixed(3), run)
      : await run();
    return name(res.segments.map(s => Object.assign({}, s)), res);
  }
  function name(segs, res) {
    let n = 0;
    for (const s of segs) if (!s.name || /^(Song \d+|Applause|Talk|Quiet)$/.test(s.name)) s.name = s.type === 'song' ? `Song ${++n}` : TYPES[s.type];
    return Object.assign({}, res, { segments: segs });
  }

  function setlistText(target, res) {
    const fps = target.fps || 25, songs = res.segments.filter(s => s.type === 'song');
    const lines = [`Setlist – ${target.name}`, `${new Date().toLocaleDateString()} · ${songs.length} songs · ${US.fmtDur(res.duration)} recording`, ''];
    songs.forEach((s, i) => lines.push(`${String(i + 1).padStart(2)}. ${s.name.padEnd(28)} ${kit.tc(s.start, fps)} – ${kit.tc(s.end, fps)}  (${US.fmtDur(s.end - s.start)})`));
    lines.push('', 'Everything, in order:');
    res.segments.forEach(s => lines.push(`  ${kit.tc(s.start, fps)}  ${TYPES[s.type].padEnd(9)} ${s.type === 'song' ? s.name : ''}`));
    return lines.join('\n');
  }
  function setlistCSV(target, res) {
    const fps = target.fps || 25, q = s => `"${String(s).replace(/"/g, '""')}"`;
    return ['number,name,type,start_tc,end_tc,start_seconds,end_seconds,duration_seconds']
      .concat(res.segments.map((s, i) => [i + 1, q(s.name), s.type, kit.tc(s.start, fps), kit.tc(s.end, fps), s.start.toFixed(2), s.end.toFixed(2), (s.end - s.start).toFixed(2)].join(','))).join('\r\n');
  }

  /** Send the result to Premiere: markers / subclips / sequences, as chosen. */
  async function output(target, res, opts, job) {
    const songs = res.segments.filter(s => s.type === 'song');
    const off = target.kind === 'item' ? res.offset : 0;
    const done = [];
    if (opts.markers || opts.otherMarkers) {
      const list = res.segments.filter(s => (s.type === 'song' && opts.markers) || (s.type !== 'song' && opts.otherMarkers))
        .map(s => ({ start: s.start + off, end: s.end + off, name: s.name, color: MARKER_COLOR[s.type], comment: `Song Splitter · ${TYPES[s.type]}` }));
      const n = await kit.addMarkers(target, list, job.range(0, 0.3), 'songs:' + target.id);
      done.push(US.plural(n, 'marker'));
    }
    if (opts.layers) {
      if (target.kind === 'item') throw new US.UserError('BAD_INPUT', { title: 'Adjustment layers go on a sequence.', action: 'Choose “Active sequence” as the recording (the sequence with the concert on it), then try again.' });
      job.set({ who: 'premiere', msg: 'Laying adjustment layers above the edit' });
      const sections = layerSections(res, off);
      const r = await US.host.call('labelLayers', { seqId: target.id, trackName: LAYER_TRACK, sections, binPath: 'JMG Ultra Studio/Song Splitter' });
      if (!r.placed) throw new US.UserError('HOST_SCRIPT', { title: US.say('Premiere didn’t lay the adjustment layers.'), action: 'Check the sequence isn’t locked, then try again.', detail: (r.log || []).join('\n') });
      if (r.named === false) ui.toast({ type: 'info', title: `Name the new top track “${LAYER_TRACK}”`, text: US.say('Premiere didn’t let Ultra Studio name it. Double-click the track name in the Timeline and type Songs, so Deliver can find it again.'), timeout: 15000 });
      if (r.kind && r.kind !== 'adjustment' && r.kind !== 'marker') ui.toast({ type: 'info', title: 'Added as invisible clips', text: 'There’s no adjustment layer in this project, so the songs are invisible clips instead. They render just the same. Add one with File › New › Adjustment Layer if you’d rather.', timeout: 12000 });
      done.push(US.plural(r.placed, r.kind === 'marker' ? 'range marker' : 'layer'));
    }
    job.range(0.3, 1);
    const bin = `JMG Ultra Studio/Song Splitter/${kit.safeName(US.stem(target.name))}`;
    if (opts.subclips && target.kind === 'item') {
      job.set({ who: 'premiere', msg: 'Making subclips' });
      const ids = await US.host.call('createSubclips', { binPath: bin, items: songs.map(s => ({ id: target.id, start: s.start + off, end: s.end + off, name: s.name, label: LABEL_SONG })) });
      done.push(US.plural(ids.filter(Boolean).length, 'subclip'));
      job.progress(0.3);
    }
    if (opts.sequences) {
      for (let i = 0; i < songs.length; i++) {
        const s = songs[i];
        job.check();
        job.progress(0.3 + 0.7 * i / songs.length, `Making a sequence for ${s.name} (${i + 1} of ${songs.length})`);
        job.set({ who: 'premiere' });
        if (target.kind === 'item') {
          const seq = await US.host.call('newSequence', { name: s.name, binPath: bin, likeId: target.id });
          await US.host.call('placeClips', { seqId: seq.id, cursor: 0, clips: [{ id: target.id, 'in': s.start + off, out: s.end + off }] });
        } else {
          const copy = await US.host.call('cloneSequence', { seqId: target.id, name: `${target.name} – ${s.name}`, binPath: bin });
          const ranges = [];
          if (s.end < res.duration - 0.05) ranges.push([s.end, res.duration + 1]);
          if (s.start > 0.05) ranges.push([0, s.start]);
          if (ranges.length) await US.host.call('extractRanges', { seqId: copy.id, ranges });
        }
      }
      done.push(US.plural(songs.length, 'sequence'));
    }
    if (!done.length) throw new US.UserError('BAD_INPUT', { title: 'Nothing was chosen to add.', action: 'Tick at least one option under “Add to Premiere”.' });
    return { summary: `Added ${done.join(', ')} for ${US.plural(songs.length, 'song')}${opts.sequences || opts.subclips ? ` (in the “${bin.split('/').pop()}” bin)` : ''}${opts.layers ? ` · layers on the “${LAYER_TRACK}” track` : ''}.` };
  }

  US.actions.register({
    id: 'songs.split', tool: 'songs', title: 'Find the songs in a concert recording', changes: true,
    describe: 'Splits the selected clip (or the active sequence if no clip is selected) into songs, applause and talk, and adds a marker per song.',
    params: { sequences: { type: 'boolean', default: false, desc: 'Also make a sequence per song' }, layers: { type: 'boolean', default: false, desc: 'Also lay numbered, colour-coded adjustment layers above the edit (sequence only)' } },
    examples: ['split this concert into songs', 'find the songs', 'mark each song'],
    match(text) { const t = text.toLowerCase(); if (!/(songs?|setlist|tracks? in (the|this) (concert|gig|show))/.test(t) || !/(split|find|mark|detect|chop|separate|list)/.test(t)) return null; return { sequences: /sequence/.test(t), layers: /adjustment|layers?/.test(t) }; },
    async run(p, job) {
      const target = (await kit.selectedClipTarget()) || await kit.activeSequenceTarget();
      const res = await analyse(target, job.range(0, 0.6));
      job.range(0.6, 1);
      const songs = res.segments.filter(s => s.type === 'song').length;
      if (!songs) throw new US.UserError('NOTHING_FOUND', { title: 'No songs found in that recording.', action: 'Check it has music in it; Song Splitter needs at least 20 seconds of music per song.' });
      return output(target, res, { markers: true, sequences: p.sequences, layers: !!p.layers && target.kind !== 'item' }, job);
    }
  });

  US.tools.register({
    id: 'songs', name: 'Song Splitter', short: 'Songs', icon: 'songs', group: 'find', order: 12,
    blurb: 'Splits a concert or event into songs, applause and talk. Markers, subclips or a sequence per song.',
    hostFns: ['renderAudio', 'addClipMarkers', 'addSequenceMarkers', 'createSubclips', 'newSequence', 'placeClips', 'cloneSequence', 'extractRanges', 'audioClipRange', 'labelLayers', 'removeLabelLayers'],
    create() {
      const v = ui.toolView({ icon: 'songs', title: 'Song Splitter', blurb: 'Point it at the sound-desk recording or your multicam sequence. It finds each song, the applause, talk and the interval.',
        help: h('div', h('ul', h('li', 'It listens for music (steady beat, tuned notes), applause (noisy, no beat) and talk (stop-start speech).'), h('li', 'A change of key or tempo with no gap (a segue) starts a new song.'), h('li', 'It can’t recognise song titles – click a song to rename it.'), h('li', 'Long shows take about a second per 30 minutes once Premiere has rendered the sound.'))) });
      let target = null, res = null, showAll = US.settings.get('songs.showAll', false);

      const picker = ui.sourcePicker({ modes: ['selection', 'sequence'], kinds: ['audio'], label: 'Recording', onChange: () => { res = null; render(); } });
      const findBtn = ui.actionButton('Find the songs', () => US.jobs.run({ title: 'Finding the songs', tool: 'songs' }, async job => {
        target = await kit.resolveTarget(picker, job);
        res = await analyse(target, job);
        render();
        const n = res.segments.filter(s => s.type === 'song').length;
        return { summary: `${US.plural(n, 'song')} found in “${target.name}”` };
      }), { icon: 'songs' });
      const results = h('div');
      v.body.append(ui.card(picker.el, findBtn), results);

      const tl = ui.timeline({ height: 50, onSeek: t => target && kit.goTo(target, t, res ? res.offset : 0) });
      const optMarkers = ui.toggle({ label: 'A marker for each song', value: US.settings.get('songs.markers', true), onChange: x => US.settings.set('songs.markers', x) });
      const optOther = ui.toggle({ label: 'Markers for applause and talk too', value: US.settings.get('songs.other', false), onChange: x => US.settings.set('songs.other', x) });
      const optSub = ui.toggle({ label: 'A subclip for each song', value: US.settings.get('songs.subclips', false), onChange: x => US.settings.set('songs.subclips', x) });
      const optSeq = ui.toggle({ label: 'A sequence for each song', value: US.settings.get('songs.sequences', false), onChange: x => US.settings.set('songs.sequences', x), hint: 'For a sequence, each song gets a trimmed copy of it.' });
      const optLayers = ui.toggle({ label: 'Adjustment layers above the edit', value: US.settings.get('songs.layers', false), onChange: x => US.settings.set('songs.layers', x),
        hint: `On a new top track called “${LAYER_TRACK}”: each song numbered (1, 2, 3…), talk and applause too, colour-coded. Deliver › Render ranges renders them – all, or one colour.` });
      const addBtn = ui.actionButton('Add to Premiere', () => US.jobs.run({ title: 'Adding songs to Premiere', tool: 'songs' }, async job => { const r = await output(target, res, { markers: optMarkers.get(), otherMarkers: optOther.get(), subclips: optSub.get(), sequences: optSeq.get(), layers: target.kind !== 'item' && optLayers.get() }, job); render(); return r; }), { icon: 'songs' });
      const removeLayers = () => US.jobs.run({ title: 'Removing song layers', tool: 'songs' }, async () => { const r = await US.host.call('removeLabelLayers', { seqId: target.id, trackName: LAYER_TRACK }); render(); return { summary: `Removed ${US.plural(r.removed || 0, 'layer')}` }; });

      const edit = fn => { fn(); res = name(res.segments, res); render(); };
      function rowFor(s, i) {
        const color = kit.cssColor(kit.COLORS[s.type]);
        const fps = target.fps || 25;
        const btn = (label, title, fn) => h('button.btn.small.ghost', { title, onclick: e => { e.stopPropagation(); fn(); } }, label);
        return h('div.list-row.clickable', { onclick: () => kit.goTo(target, s.start, res.offset), title: 'Go to this part' },
          h('span.swatch', { style: { background: color } }),
          h('div.list-main', h('div.list-title', s.name), h('div.list-sub', `${kit.tc(s.start, fps)} – ${kit.tc(s.end, fps)} · ${US.fmtDur(s.end - s.start)}${s.type !== 'song' ? '' : ''}`)),
          h('div.songs-actions',
            s.type === 'song' && btn('Rename', 'Give this song its title', async () => { const nm = await ui.promptText({ title: 'Song title', value: s.name, ok: 'Rename' }); if (nm) edit(() => { s.name = nm.trim() || s.name; s.named = true; }); }),
            btn('Type', 'Change between song, applause, talk and quiet', () => edit(() => { const order = ['song', 'applause', 'talk', 'silence']; s.type = order[(order.indexOf(s.type) + 1) % order.length]; if (!s.named) s.name = ''; })),
            i < res.segments.length - 1 && btn('Join ↓', 'Join with the next part', () => edit(() => { const nx = res.segments[i + 1]; s.end = nx.end; res.segments.splice(i + 1, 1); })),
            btn('Split…', 'Split this part in two', async () => {
              const at = await ui.promptText({ title: 'Split at', label: `A time between ${kit.tc(s.start, fps)} and ${kit.tc(s.end, fps)} (e.g. ${kit.tc((s.start + s.end) / 2, fps)})`, value: kit.tc((s.start + s.end) / 2, fps), ok: 'Split' });
              const t = at == null ? NaN : US.time.parseTC(at, fps);
              if (!(t > s.start + 1 && t < s.end - 1)) { if (at != null) ui.toast({ type: 'warn', title: 'That time isn’t inside this part.', text: 'Use a time between its start and end.' }); return; }
              edit(() => { res.segments.splice(i + 1, 0, { type: s.type, start: t, end: s.end }); s.end = t; });
            })));
      }

      function render() {
        US.clear(results);
        if (!res) { results.appendChild(ui.empty({ icon: 'songs', title: 'Select the concert recording and press “Find the songs”.', text: 'Works on a sound-desk WAV, a camera clip or a whole multicam sequence.' })); return; }
        const songs = res.segments.filter(s => s.type === 'song');
        const music = songs.reduce((t, s) => t + s.end - s.start, 0);
        tl.draw({ duration: res.duration, curve: res.curve.map(v => Math.max(0, v + 60)), curveMax: 60, regions: res.segments.map(s => ({ start: s.start, end: s.end, color: kit.cssColor(kit.COLORS[s.type]), alpha: s.type === 'song' ? 0.5 : 0.35, label: s.name })),
          marks: songs.map(s => ({ t: s.start, color: kit.cssColor('var(--text)'), w: 2 })) });
        const shown = res.segments.map((s, i) => ({ s, i })).filter(x => showAll || x.s.type === 'song');
        const fps = target.fps || 25;
        const setTxt = () => setlistText(target, res);
        results.append(
          ui.card(h('div.card-title', 'What’s in the recording', h('span.right', target.name)),
            ui.stats(ui.stat(String(songs.length), 'songs'), ui.stat(US.fmtDur(music), 'of music'), ui.stat(US.fmtDur(res.duration), 'recording')),
            tl.el, kit.legend([['Song', kit.cssColor(kit.COLORS.song)], ['Applause', kit.cssColor(kit.COLORS.applause)], ['Talk', kit.cssColor(kit.COLORS.talk)], ['Quiet', kit.cssColor(kit.COLORS.silence)]]),
            ui.toggle({ label: 'Show applause, talk and quiet parts in the list', value: showAll, onChange: x => { showAll = x; US.settings.set('songs.showAll', x); render(); } }),
            shown.length ? h('div.list.songs-list', shown.map(x => rowFor(x.s, x.i))) : ui.empty({ icon: 'songs', title: 'No songs found.', text: 'Switch on “Show applause, talk and quiet parts” to see what was found, and change a part’s type if needed.' })),
          ui.card(h('div.card-title', 'Add to Premiere'), optMarkers, optOther, target.kind === 'item' && optSub, optSeq, target.kind !== 'item' && optLayers,
            target.kind !== 'item' && optLayers.get() && kit.legend([['Song', ui.LABELS[LAYER_LABEL.song].hex], ['Talk', ui.LABELS[LAYER_LABEL.talk].hex], ['Applause', ui.LABELS[LAYER_LABEL.applause].hex]]),
            addBtn,
            target.kind !== 'item' && ui.button('Remove song layers', { kind: 'ghost', small: true, onClick: removeLayers }),
            kit.recallMarkers('songs:' + target.id) && ui.button('Remove my markers', { kind: 'ghost', small: true, onClick: () => US.jobs.run({ title: 'Removing song markers', tool: 'songs' }, async () => { const n = await kit.removeMarkers('songs:' + target.id); render(); return { summary: `Removed ${US.plural(n, 'marker')}` }; }) })),
          ui.card(h('div.card-title', 'Setlist'),
            h('pre.mono.songs-setlist', songs.map((s, i) => `${i + 1}. ${s.name}  ${kit.tc(s.start, fps)} – ${kit.tc(s.end, fps)}`).join('\n') || 'No songs yet.'),
            h('div.row',
              ui.button('Copy', { small: true, onClick: () => { ui.copy(setTxt()); ui.toast({ type: 'ok', title: 'Setlist copied', timeout: 1500 }); } }),
              ui.button('Save as text and spreadsheet', { small: true, icon: 'folder', onClick: () => {
                try {
                  const base = `Setlist – ${US.stem(target.name)}`;
                  const p = kit.saveText(base + '.txt', setTxt()); kit.saveText(base + '.csv', '﻿' + setlistCSV(target, res) + '\r\n'); // BOM + CRLF so Excel on Windows reads accents
                  ui.toast({ type: 'ok', title: 'Setlist saved', text: `In Documents › JMG Ultra Studio (${US.basename(p)} and .csv).`, action: { label: 'Open', fn: () => kit.open(p) } });
                } catch (e) { ui.showError(new US.UserError('DISK', { detail: e.message })); }
              } }))));
      }
      render();
      return { el: v.el, onShow() { picker.refresh(); } };
    }
  });

  US.songSplitter = { analyse, output, setlistText, setlistCSV, layerSections, LAYER_TRACK, LAYER_LABEL };
})();
