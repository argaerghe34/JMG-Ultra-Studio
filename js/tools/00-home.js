/* JMG Ultra Studio – Home: what each tool is for, and “Check my setup” (a real end-to-end self-test). */
(function () {
  'use strict';
  const US = window.US, h = US.h, ui = US.ui;

  const WHATS_NEW = [
    'New in 1.3 – Selects names every camera move (pan left/right, tilt, push-in, pull-out, reveals) and how smooth it is, and smooth moves count. Colour previews appear by themselves as you move the playhead, with a before/after viewer. Moments are colour-coded and labelled by type in the timeline. ▶ in Story plays from the exact line.',
    'Story is the heart of Ultra Studio, now step by step: 1 Interviews · 2 Themes · 3 Find · 4 Build · 5 Share, each with a Next button. Choose what to work on once – all interviews, some of them, or just the lines in a sequence such as your selects (between its In and Out if you like).',
    'Type your own themes and Story finds them and its own in one pass – the AI reads your lines once. Then: How picky per theme, a sequence from your themes in their colours, a narrative cut from one sentence (and a promo with B-roll, captions and a vertical version), Moments, highlights in your string-outs, an interview log with a summary of each interview, a paper edit, and word-timed captions.',
    'Selects works on any footage: it keeps everything usable as B-roll and leaves out only what’s technically unusable (blurry, far too dark or bright, too shaky). It also works on sequences, sorts selects into bins by type, marks the best with a magenta ★, and saves full-size stills.',
    'New: Colour – looks and LUTs previewed on your shot, quick grading, automatic camera matching, and a log-footage check.',
    'New: B-roll – covers the jump cuts in your interviews with your best B-roll, on a copy. And Camera Switch – cuts between interview angles at sentence ends.',
    'New: Overnight prep (below) – transcripts, themes, moments, the interview log and Selects analysis while you’re away, with a morning report.',
    'Sound Check fixes the loudness and ducks the music under speech, on a copy. Safe Zones: plain grey guides and letterboxing. AI costs shown before anything runs, with a monthly limit.'
  ];

  /** The guide shipped inside the extension (or the development copy). */
  function openGuide() {
    const path = require('path'), fs = require('fs'), dir = US.host.extensionDir();
    const f = [path.join(dir, 'docs', 'guide.html'), path.join(dir, 'dev', 'docs', 'Read me first.html')].find(x => fs.existsSync(x));
    if (!f) return ui.toast({ type: 'warn', title: 'The guide isn’t installed', text: 'It’s the “Read me first” file next to the installer.' });
    const url = 'file://' + (US.fsx.isWin ? '/' + f.replace(/\\/g, '/') : f).split('/').map(encodeURIComponent).join('/').replace(/%3A/g, ':');
    try { window.cep.util.openURLInDefaultBrowser(url); } catch (e) { require('child_process').exec((US.fsx.isWin ? 'start "" "' : 'open "') + f + '"'); }
  }

  US.tools.register({
    id: 'home', name: 'Home', short: 'Home', icon: 'home', order: 0,
    create() {
      const v = ui.toolView({ icon: 'home', title: 'Home', blurb: 'Pick a tool, or check everything works on this computer.' });
      const ctxLine = h('p');
      const hero = h('div.hero', h('h2', 'Welcome to JMG Ultra Studio'), ctxLine,
        h('div.row', ui.button('Check my setup', { kind: 'primary', icon: 'check', onClick: () => selfTest() }), ui.button('Guide', { kind: 'ghost', icon: 'info', onClick: openGuide }), ui.button('Activity log', { kind: 'ghost', icon: 'log', onClick: () => US.toggleLog(true) })));
      // once per version: what changed since the last one
      const news = US.settings.get('seenVersion') === US.version ? h('div') : ui.card(
        h('div.card-title', `What's new in ${US.version}`),
        h('ul.news', WHATS_NEW.map(x => h('li', x))),
        h('div.row', ui.button('Read the guide', { small: true, icon: 'info', onClick: openGuide }), ui.button('Got it', { small: true, kind: 'ghost', onClick: () => { US.settings.set('seenVersion', US.version); news.remove(); } })));
      const results = h('div');
      const groups = h('div', { style: { display: 'flex', flexDirection: 'column', gap: '12px' } });
      // Story is the heart of the app: what's in this project so far, and one click to each step
      const featuredCard = h('div');
      function storyCounts() {
        try {
          if (!US.story || !US.story.loadState || !US.ctx.project) return null;
          US.story.loadState(); const st = US.story.state();
          const lines = st.transcripts.reduce((n, t) => n + (t.lines ? t.lines.length : 0), 0);
          const narratives = (st.wall && st.wall.columns || []).filter(c => c.narrative).length;
          return { interviews: st.transcripts.length, lines, themes: st.themes.filter(t => t.name !== 'Other').length, narratives };
        } catch (e) { return null; }
      }
      const openSection = s => (US.story && US.story.open) ? US.story.open(s) : US.tools.open(US.FEATURED, { tab: s });
      function renderFeatured() {
        US.clear(featuredCard);
        const d = US.tools.get(US.FEATURED); if (!d) return;
        const c = storyCounts();
        const step = (label, icon, fn, primary) => ui.button(label, { kind: primary ? 'primary' : 'secondary', small: true, icon, onClick: fn });
        const hasTranscripts = c && c.interviews > 0;
        featuredCard.appendChild(h('div.card.featured-card',
          h('div.featured-head', h('div.tool-icon', US.icon(d.icon, 22)),
            h('div', h('div.tile-name', d.name + ' – the heart of Ultra Studio'), h('div.tile-blurb', 'Interviews and documentaries, step by step: read the transcripts, find the themes and the lines you need, build the cut and share the documents.'))),
          c ? ui.stats(ui.stat(c.interviews, 'interviews read'), ui.stat(c.lines.toLocaleString(), 'lines'), ui.stat(c.themes, 'themes'), ui.stat(c.narratives, c.narratives === 1 ? 'narrative' : 'narratives'))
            : h('div.field-hint', US.ctx.project ? 'Open Story to read this project’s transcripts.' : 'Open a project in Premiere to begin.'),
          h('div.row',
            step(hasTranscripts ? 'Read transcripts again' : 'Read Premiere’s transcripts', 'refresh', () => US.actions.run('story.read', {}).then(renderFeatured), !hasTranscripts),
            step('2 Themes', 'story', () => openSection('themes'), hasTranscripts && !c.themes),
            step('3 Find', 'target', () => openSection('find')),
            step('4 Build', 'film', () => openSection('build'), hasTranscripts && c.themes > 0),
            step('5 Share', 'log', () => openSection('share')))));
      }
      // Overnight prep: the morning report up top, the set-up further down
      const nightReport = h('div'), nightSetup = h('div');
      const drawNight = () => { if (!US.overnight) return; US.clear(nightReport); const c = US.overnight.reportCard(); if (c) nightReport.appendChild(c); if (!nightSetup.firstChild) nightSetup.appendChild(US.overnight.setupCard()); };
      US.bus.on('overnight-report', drawNight);
      drawNight();
      v.body.append(hero, news, nightReport, featuredCard, results, nightSetup, groups);

      function renderTiles() {
        US.clear(groups);
        for (const g of US.GROUPS) {
          const tools = US.tools.list().filter(d => d.group === g.id && !d.hidden && d.id !== US.FEATURED);
          if (!tools.length) continue;
          groups.appendChild(h('div.group-title', g.name));
          groups.appendChild(h('div.tiles', tools.map(d => h('button.tile', { onclick: () => US.tools.open(d.id) }, h('div.tool-icon', US.icon(d.icon, 17)), h('div', h('div.tile-name', d.name), h('div.tile-blurb', d.blurb || ''))))));
        }
        const other = US.tools.list().filter(d => d.id !== 'home' && !d.hidden && !US.GROUPS.some(g => g.id === d.group));
        if (other.length) {
          groups.appendChild(h('div.group-title', 'More'));
          groups.appendChild(h('div.tiles', other.map(d => h('button.tile', { onclick: () => US.tools.open(d.id) }, h('div.tool-icon', US.icon(d.icon, 17)), h('div', h('div.tile-name', d.name), h('div.tile-blurb', d.blurb || ''))))));
        }
      }
      function renderCtx() {
        const c = US.ctx;
        ctxLine.textContent = !c.project ? 'Open a project in Premiere to get started.'
          : c.sequence ? `Working in “${c.project.name}”. Active sequence: ${c.sequence.name} (${US.fmtDur(c.sequence.duration)}).`
            : `Working in “${c.project.name}”. Open a sequence or select clips to begin.`;
      }
      US.bus.on('context', renderCtx);

      /* ---------- self-test ---------- */
      async function selfTest() {
        const rows = [];
        const add = (state, title, text) => { rows.push({ state, title, text }); draw(); };
        function draw() {
          US.clear(results);
          const okN = rows.filter(r => r.state === 'ok').length, bad = rows.filter(r => r.state === 'bad').length, warn = rows.filter(r => r.state === 'warn').length;
          results.appendChild(ui.card(
            h('div.card-title', 'Setup check', h('span.right', `${okN} passed${warn ? ` · ${warn} to look at` : ''}${bad ? ` · ${bad} failed` : ''}`)),
            h('div', rows.map(r => h('div.check-row', US.icon(r.state === 'ok' ? 'ok' : r.state === 'bad' ? 'error' : 'warn', 16), h('div', h('div', r.title), r.text && h('div.field-hint', r.text))))),
            h('div.row', ui.button('Copy report', { small: true, icon: 'log', onClick: () => { ui.copy(report()); ui.toast({ type: 'ok', title: 'Report copied', text: 'Paste it into a message to support.', timeout: 2500 }); } }))));
          US.$$('.check-row .icon', results).forEach((ic, i) => ic.classList.add(rows[i].state === 'ok' ? 'okc' : rows[i].state === 'bad' ? 'badc' : 'warnc'));
        }
        function report() {
          return [`JMG Ultra Studio ${US.version} setup check – ${new Date().toLocaleString()}`, `Premiere ${US.premiere && US.premiere.version} · ${US.premiere && US.premiere.os} · panel engine ${navigator.userAgent.match(/Chrome\/[\d.]+/)} · Node ${process.version}`]
            .concat(rows.map(r => `${r.state === 'ok' ? '✓' : r.state === 'bad' ? '✗' : '!'} ${r.title}${r.text ? ' – ' + r.text : ''}`)).join('\n');
        }

        await US.jobs.run({ title: 'Checking your setup', tool: 'home' }, async job => {
          const steps = 8; let n = 0; const step = msg => job.progress(n++ / steps, msg);

          step('Talking to Premiere');
          try { const p = await US.host.call('ping', {}, { timeout: 10000 }); add('ok', `Connected to Premiere Pro ${p.version}`); }
          catch (e) { add('bad', 'Can’t talk to Premiere', US.errors.explain(e).action); return { summary: 'Premiere didn’t answer' }; }

          step('Checking the project');
          await US.refreshContext();
          if (US.ctx.project) add('ok', `Project open: ${US.ctx.project.name}`); else add('warn', 'No project open', 'Open a project to test the audio and video checks below.');

          step('Checking the Premiere scripts');
          try {
            const fns = await US.host.call('listFns');
            const need = US.tools.list().flatMap(d => d.hostFns || []);
            const missing = need.filter(f => !fns.includes(f));
            if (missing.length) add('bad', 'Some Premiere scripts didn’t load', missing.join(', ')); else add('ok', `All ${fns.length} Premiere commands loaded`);
          } catch (e) { add('bad', 'Premiere scripts didn’t load', US.errors.explain(e).detail); }

          step('Checking disk access');
          try { const f = require('path').join(US.fsx.tempDir(), 'selftest.txt'); require('fs').writeFileSync(f, 'ok'); require('fs').unlinkSync(f); add('ok', 'Can save files', US.fsx.dataDir); }
          catch (e) { add('bad', 'Can’t save files', US.errors.explain(e).action); }

          let sample = [];
          if (US.ctx.project) { try { sample = await US.host.call('sampleItems', { max: 300 }); } catch (e) { /* reported below */ } }

          step('Testing sound analysis');
          // a clip long enough to time properly (10 s–10 min), else whatever has sound
          const audible = sample.filter(i => i.hasAudio && !i.offline && i.duration > 0);
          const withAudio = audible.filter(i => i.duration >= 10 && i.duration <= 600).sort((a, b) => Math.abs(a.duration - 60) - Math.abs(b.duration - 60))[0] || audible.sort((a, b) => b.duration - a.duration)[0];
          if (!withAudio) add('warn', 'Sound analysis not tested', 'No online clips with sound in this project yet.');
          else {
            try {
              const t0 = performance.now();
              const a = await US.audio.forItem(withAudio, { job });
              const secs = (performance.now() - t0) / 1000;
              const speed = a.duration / Math.max(0.05, secs);
              add('ok', `Sound analysis works (${US.fmtDur(a.duration)} of sound read in ${secs.toFixed(1)} s)`, a.duration >= 5 ? `About ${Math.round(speed)}× real time, using “${withAudio.name}”.` : `Using “${withAudio.name}” (too short to time).`);
            } catch (e) { const x = US.errors.explain(e); add('bad', 'Sound analysis failed', `${x.title} ${x.action}${x.detail ? ' (' + x.detail.slice(0, 160) + ')' : ''}`); }
          }

          step('Testing picture analysis');
          const vids = sample.filter(i => i.kind === 'video' && !i.offline);
          if (!vids.length) add('warn', 'Picture analysis not tested', 'No online video clips in this project yet.');
          else if (!US.vision) add('warn', 'Picture analysis not installed');
          else {
            let tested = 0, okN = 0, copyN = 0, failNames = [], why = '';
            for (const it of vids.slice(0, 6)) {
              tested++;
              try { const r = await US.vision.probe(it); if (r.ok) okN++; else { if (r.needsCopy) copyN++; failNames.push(it.name); why = why || r.reason || ''; } } catch (e) { failNames.push(it.name); why = why || US.errors.explain(e).detail; }
            }
            const fix = 'Selects makes small readable copies with Media Encoder when it needs them (or create H.264 proxies in Premiere).';
            // clips the panel can't decode itself (10-bit 4:2:2, HEVC, ProRes…) are fine if Media Encoder can make copies
            let copiesOk = false;
            if (copyN && okN + copyN === tested && US.vision.analysisPreset) { try { await US.vision.analysisPreset(); copiesOk = true; } catch (e) { /* preset missing: warn below */ } }
            if (okN === tested) add('ok', `Picture analysis works (${okN} of ${tested} sample clips readable)`);
            else if (copiesOk) add('ok', `Picture analysis works (${okN} of ${tested} sample clips read directly; ${copyN} through a quick copy Media Encoder makes automatically)`, `Read through copies: ${failNames.join(', ')}. That’s normal for 10-bit, HEVC, ProRes and RAW footage.`);
            else if (okN) add('warn', `Picture analysis reads ${okN} of ${tested} sample clips directly`, `Can’t read ${failNames.join(', ')}${why ? ' – ' + why : ''}. ${fix}`);
            else add('warn', 'Picture analysis can’t read these clips directly', `${failNames.join(', ')}${why ? ' – ' + why : ''}. ${fix}`);
          }

          step('Checking Premiere presets');
          try { const p = await US.host.call('presets'); const miss = Object.keys(p).filter(k => !p[k]); if (miss.length) add('warn', 'Some Premiere presets are missing', miss.join(', ')); else add('ok', 'Premiere export presets found'); }
          catch (e) { add('bad', 'Couldn’t check presets', US.errors.explain(e).detail); }

          step('Checking the AI (optional)');
          if (!US.ai || !US.ai.available()) add('ok', 'No AI key set – that’s fine', 'Everything works without one. A key only adds free-form requests in the Assistant and automatic themes in Story.');
          else {
            job.set({ who: 'ai', msg: 'Testing your AI key' });
            try { await US.ai.test(US.ai.provider()); add('ok', `${US.ai.label()} key works`); }
            catch (e) { const x = US.errors.explain(e); add('bad', `${US.ai.label()} key didn’t work`, `${x.title} ${x.action}${x.detail ? ' (' + x.detail.slice(0, 200) + ')' : ''}`); }
          }
          job.progress(1);
          const bad = rows.filter(r => r.state === 'bad').length;
          US.log(bad ? 'error' : 'ok', 'Setup check report', report(), 'home');
          return { summary: bad ? `${bad} problem${bad > 1 ? 's' : ''} found` : 'everything works' };
        });
      }

      return { el: v.el, onShow() { renderFeatured(); renderTiles(); renderCtx(); } };
    }
  });
})();
