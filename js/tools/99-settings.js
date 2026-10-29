/* JMG Ultra Studio – Settings (opened from the gear in the header). */
(function () {
  'use strict';
  const US = window.US, h = US.h, ui = US.ui;

  const HIDDEN_NAMES = 'Colour, Cameras, B-roll and Sound Check';
  // five taps on About: one of these (written for Ultra Studio, never fetched from anywhere)
  const JOKES = [
    'Why did the editor break up with the timeline? It had too many unresolved gaps.',
    'How many editors does it take to change a light bulb? None – they’ll fix it in the grade.',
    'I told the client the render would take ten minutes. That was three coffees ago.',
    'Final_v2_FINAL_actually-final_USE-THIS-ONE.mp4 – a love story.',
    'An editor walks into a bar. Cut to the reaction shot.',
    'My therapist asked how I handle conflict. I said: J-cut, L-cut, or a long slow crossfade.',
    '“We’ll fix it in post.” Post would like a word.',
    '“Can you make the logo bigger?” – every client, on every cut, since the dawn of cinema.',
    'Why did the jump cut apologise? It knew it had been a bit abrupt.',
    'Editors don’t get older. They just get re-rendered.',
    '“It’s just a quick change” – the five most expensive words in post-production.',
    'Why was the B-roll so relaxed? It knew it would always cover for everyone.',
    'I asked the timeline out for dinner. It said it was already locked.',
    'Ctrl+Z: the only time machine that actually works – and editors use it more than any physicist.',
    'Why are editors brilliant at poker? They always know exactly when to cut their losses.',
    'A director, a producer and an editor walk into a bar. Only the editor knows which take to use.'
  ];

  US.tools.register({
    id: 'settings', name: 'Settings', icon: 'gear', hidden: true, order: 999,
    create() {
      const v = ui.toolView({ icon: 'gear', title: 'Settings', blurb: 'Optional AI, notifications and where files are kept.' });

      /* AI */
      const provider = ui.segmented({
        options: [{ value: 'auto', label: 'Automatic' }, { value: 'claude', label: 'Claude' }, { value: 'gemini', label: 'Gemini' }, { value: 'off', label: 'Off' }],
        value: US.settings.get('aiProvider', 'auto'), onChange: val => { US.settings.set('aiProvider', val); status(); }
      });
      const aiStatus = h('div.field-hint');
      function keyField(name, label, hint, which) {
        const input = ui.input({ type: 'password', placeholder: US.secrets.get(name) ? '•••••••• saved on this computer' : 'Paste key here' });
        const save = ui.button('Save', { small: true, onClick: () => { US.secrets.set(name, input.value.trim()); input.value = ''; input.placeholder = US.secrets.get(name) ? '•••••••• saved on this computer' : 'Paste key here'; ui.toast({ type: 'ok', title: 'Key saved on this computer', timeout: 2000 }); status(); } });
        const test = ui.button('Test', { small: true, onClick: async () => {
          await US.jobs.run({ title: `Testing your ${label} key`, tool: 'settings', who: 'AI' }, async () => { await US.ai.test(which); ui.toast({ type: 'ok', title: `${label} key works` }); return { summary: 'works' }; });
        } });
        const remove = ui.button('Remove', { small: true, kind: 'ghost', onClick: () => { US.secrets.set(name, ''); input.placeholder = 'Paste key here'; status(); } });
        return ui.field(label, h('div.row', h('div.grow', input), save, test, remove), hint);
      }
      function status() {
        const p = US.ai.provider();
        aiStatus.textContent = p === 'none' ? 'AI is off. Every tool still works; the Assistant uses its built-in commands.' : `Using ${US.ai.label()} for AI requests.${p === 'gemini' ? ' Free within Google’s daily allowance (see the Gemini model below for what that means).' : ''}`;
        drawGemini();
        renderSpend();
      }

      /* Gemini model: Google's newest Flash by default – named, so you know which one */
      const gemSel = ui.select({ options: [], onChange: x => { US.settings.set('geminiModel', x); status(); } });
      let gemList = null;
      function drawGemini() {
        const cur = US.settings.get('geminiModel', US.ai.GEMINI_DEFAULT), lite = US.ai.geminiName(US.settings.get('geminiFastModel', US.ai.GEMINI_FAST_DEFAULT));
        const latest = US.ai.geminiName(US.ai.GEMINI_DEFAULT);
        const opts = [{ value: US.ai.GEMINI_DEFAULT, label: `Google’s newest Flash${/latest/.test(latest) ? '' : ` – now ${latest}`}` }].concat((gemList || []).map(id => ({ value: id, label: US.ai.geminiName(id) })));
        if (!opts.some(o => o.value === cur)) opts.push({ value: cur, label: US.ai.geminiName(cur) });
        gemSel.setOptions(opts, cur);
        gemHint.textContent = `Story and the Assistant use ${US.ai.geminiName(cur)}; quick requests (the Assistant’s plans) use ${lite}.`;
      }
      const gemHint = h('span');
      const gemCheck = ui.button('Check models', { small: true, kind: 'ghost', title: 'Ask Google which Gemini models your key can use', onClick: async () => { gemList = await US.ai.geminiModels(); drawGemini(); ui.toast({ type: gemList.length ? 'ok' : 'warn', title: gemList.length ? `${gemList.length} Gemini models available` : 'Couldn’t list the models', text: gemList.length ? `Newest: ${US.ai.geminiName(gemList[0])}` : 'Check the Gemini key and the internet connection.', timeout: 4000 }); } });

      /* Claude model + cost controls */
      const M = US.ai.MODELS;
      const modelSel = ui.segmented({ options: Object.keys(M).map(k => ({ value: k, label: M[k].short, title: `${M[k].name}: $${M[k].in} per million tokens in, $${M[k].out} out` })), value: US.ai.claudeModel(), onChange: v => { US.settings.set('claudeModel', v); status(); } });
      const askSel = ui.select({ options: [{ value: '0.10', label: 'over 10¢' }, { value: '0.25', label: 'over 25¢' }, { value: '0.50', label: 'over 50¢' }, { value: '1', label: 'over $1' }, { value: '0', label: 'never ask' }], value: String(US.settings.get('aiConfirmAbove', 0.25)), onChange: v => US.settings.set('aiConfirmAbove', +v) });
      const capInput = ui.input({ type: 'number', value: US.settings.get('aiMonthlyCap', 0) || '', placeholder: 'No limit', onInput: v => US.settings.set('aiMonthlyCap', Math.max(0, +v || 0)) });
      const spendBox = h('div');
      function renderSpend() {
        const m = US.ai.spending();
        US.clear(spendBox);
        spendBox.appendChild(ui.stats(ui.stat(m.cost ? `$${m.cost.toFixed(2)}` : '$0', 'Claude this month'), ui.stat(m.calls, 'AI requests'), ui.stat(((m.tokensIn + m.tokensOut) / 1000).toFixed(0) + 'k', 'tokens')));
        const rows = Object.entries(m.byFeature || {}).sort((a, b) => b[1].cost - a[1].cost || b[1].calls - a[1].calls).slice(0, 8)
          .map(([name, f]) => ({ title: name, right: `${f.calls} × · ${f.cost ? '$' + f.cost.toFixed(2) : 'free'}` }));
        if (rows.length) spendBox.appendChild(ui.list(rows));
        renderKeys();
      }
      /* usage per API key: each key by when it was added (and the name you give it), its last 4 characters, what it used */
      const keysBox = h('div.settings-keys');
      const when = t => new Date(t).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
      const kTok = n => (n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : Math.round(n / 1000) + 'k');
      function renderKeys() {
        US.clear(keysBox);
        let u; try { u = US.ai.keyUsage(); } catch (e) { return; }
        const PROV = { claude: 'Claude', gemini: 'Gemini' };
        const rows = u.keys.map(K => {
          const label = K.name || `${PROV[K.provider]} key ${K.added ? 'added ' + when(K.added) : `in use before ${when(u.before.since || K.first || Date.now())}`}`;
          const money = K.provider === 'gemini' ? 'no charge' : `$${K.cost.toFixed(2)}`;
          return h('div.list-row',
            h('span.swatch', { style: { background: K.current ? 'var(--ok)' : 'var(--text-3)' }, title: K.current ? 'The key in use now' : 'Not in use now' }),
            h('div.list-main', h('div.list-title', label, K.current ? ui.pill('in use', 'var(--ok)') : null),
              h('div.list-sub', `${PROV[K.provider]} · …${K.last4}${K.name && K.added ? ` · added ${when(K.added)}` : ''} · ${US.plural(K.calls, 'request')} · ${kTok(K.tokensIn + K.tokensOut)} tokens · ${money}${K.last ? ` · last used ${when(K.last)}` : ' · not used yet'}`),
              K.thisMonth.calls ? h('div.list-sub', `This month: ${US.plural(K.thisMonth.calls, 'request')} · ${kTok(K.thisMonth.tokensIn + K.thisMonth.tokensOut)} tokens${K.provider === 'gemini' ? '' : ` · $${K.thisMonth.cost.toFixed(2)}`}`) : null),
            ui.button(K.name ? 'Rename' : 'Name it', { small: true, kind: 'ghost', title: 'Claude and Google don’t tell apps the name you gave a key – type it here', onClick: async () => { const nm = await ui.promptText({ title: 'Name this key', label: `${PROV[K.provider]} key …${K.last4}`, value: K.name, ok: 'Save' }); if (nm != null) { US.ai.nameKey(K.id, nm); renderKeys(); } } }));
        });
        const b = u.before, old = [];
        if (b.claude.calls) old.push(`Claude ${US.plural(b.claude.calls, 'request')} · $${b.claude.cost.toFixed(2)}`);
        if (b.gemini.calls) old.push(`Gemini ${US.plural(b.gemini.calls, 'request')} · no charge`);
        keysBox.append(h('div.field-label', 'By API key'),
          rows.length ? h('div.list', rows) : h('div.field-hint', 'No keys yet.'),
          old.length ? h('div.field-hint', `Before keys were tracked separately${b.since ? ` (until ${when(b.since)})` : ''}: ${old.join(' · ')} – which key isn’t known.`) : null,
          h('div.field-hint', 'Keys are told apart by a fingerprint and their last 4 characters – the keys themselves stay in this computer’s key store. Claude and Google don’t share a key’s name with apps, so give it one here.'));
      }
      US.bus.on('ai-usage', renderSpend);
      status();

      const notify = ui.toggle({ label: 'Desktop notification when a long job finishes', value: US.settings.get('notifyDesktop', true), onChange: x => US.settings.set('notifyDesktop', x) });
      const sound = ui.toggle({ label: 'Play a sound with it', value: US.settings.get('notifySound', true), onChange: x => US.settings.set('notifySound', x) });

      const openFolder = p => require('child_process').exec((US.fsx.isWin ? 'explorer "' : 'open "') + p + '"');
      v.body.append(
        ui.card(h('div.card-title', 'AI (optional)'),
          h('div.muted', 'Only the Assistant’s free-form requests and Story’s automatic themes use AI. Your footage never leaves this computer – only text (your request, or transcript lines) is sent, straight to the provider you choose.'),
          provider, aiStatus,
          keyField('anthropicKey', 'Claude API key', 'From console.anthropic.com › API keys. Pay-as-you-go; typical requests cost a fraction of a penny.', 'claude'),
          keyField('geminiKey', 'Google Gemini API key', 'From aistudio.google.com › Get API key. Has a free daily allowance.', 'gemini'),
          ui.field('Gemini model', h('div.row', h('div.grow', gemSel), gemCheck), h('span', gemHint, ' Free tier: Google may use what you send to improve its products, and people there may read it – so not for interviews you’ve promised to keep private. Its daily limits are low (check aistudio.google.com › Rate limits). With billing switched on in Google AI Studio, Google doesn’t use it, and 3.8 Flash costs $0.75 / $3.75 per million tokens in / out until 31 Dec 2026, then $1.50 / $7.50.')),
          ui.field('Claude model', modelSel, 'Opus gives the best story judgement. Sonnet costs about half; Haiku a fortieth but is noticeably weaker at story work.'),
          ui.section('Cost', [
            spendBox, keysBox,
            h('div.grid2', ui.field('Ask before a request costing', askSel), ui.field('Monthly limit (US$)', capInput, 'Ultra Studio stops before going over it. Also set a limit at console.anthropic.com.')),
            h('div.field-hint', 'Measured on a 54-interview project with Opus: Find themes ≈ 32¢, Find more ≈ 14¢, a narrative cut ≈ 28¢, Moments ≈ 31¢, an Assistant request 2–5¢ – about $5 for a whole documentary. Asking again soon after costs less. Gemini is free within its daily allowance.')
          ], { open: true })),
        ui.card(h('div.card-title', 'Notifications'), notify, sound),
        ui.card(h('div.card-title', 'Markers'),
          ui.field('Markers go on', ui.segmented({ options: [{ value: 'sequence', label: 'Timeline' }, { value: 'clips', label: 'Clips' }, { value: 'both', label: 'Both' }], value: US.settings.get('markers.where', 'sequence'), onChange: x => US.settings.set('markers.where', x) }),
            'For every tool that marks a sequence (Story, Selects, Beats, Songs, Silence Cut, Final Check, Deliver notes). Clips: each marker goes on the source clip under it, so it shows wherever that clip is used. A marker with no clip under it stays on the timeline. Remove buttons take them off either way.')),
        ui.card(h('div.card-title', 'Story'),
          ui.toggle({ label: 'Keep Story next to the project', value: US.settings.get('story.withProject', true) !== false, onChange: x => { US.settings.set('story.withProject', x); if (x && US.story && US.story.save) US.story.save(); }, hint: 'Story’s transcripts, themes and narratives are also saved in a “JMG Ultra Studio” folder next to the project, so the project opened on another computer – from the same drive, or a copy of the folder – finds them. Anyone you share that folder with can read the transcripts. Switched off, Story is kept on this computer only.' })),
        ui.card(h('div.card-title', 'Files'),
          h('div.muted.small', 'Settings, analysis results and logs: ', h('span.mono', US.fsx.dataDir)),
          h('div.row', ui.button('Open data folder', { small: true, icon: 'folder', onClick: () => openFolder(US.fsx.dataDir) }),
            ui.button('Clear analysis cache', { small: true, kind: 'ghost', onClick: async () => { if (await ui.confirm({ title: 'Clear the analysis cache?', text: 'Clips will be analysed again next time. Nothing in your Premiere project changes.', ok: 'Clear it' })) { require('fs').rmSync(require('path').join(US.fsx.dataDir, 'cache'), { recursive: true, force: true }); ui.toast({ type: 'ok', title: 'Cache cleared' }); } } }))),
        // the editor's full name (US.app.full): "Premiere Pro 26.5" or "DaVinci Resolve Studio 20.3.1"
        about(),
        codeCard()
      );
      /* About – press it five times */
      function about() {
        let taps = [], last = -1;
        const joke = h('div.settings-joke.hidden');
        const card = ui.card(h('div.card-title', 'About'), h('div.muted', `JMG Ultra Studio ${US.version}${US.build ? ` (unpublished${US.build.from ? ' – ' + US.build.from : ''})` : ''} · ${(US.premiere && US.premiere.app && /Resolve/.test(US.premiere.app) ? US.premiere.app : US.app.full)} ${US.premiere ? US.premiere.version : ''}`), h('div.muted.small', 'Works on a copy: tools that change a sequence always make a new one first. Nothing is uploaded.'), joke);
        card.addEventListener('click', () => {
          const now = Date.now();
          taps = taps.filter(t => now - t < 3000).concat(now);
          if (taps.length < 5) return;
          taps = [];
          let i; do { i = Math.floor(Math.random() * JOKES.length); } while (JOKES.length > 1 && i === last);
          last = i; joke.textContent = JOKES[i]; joke.classList.remove('hidden');
        });
        return card;
      }
      /* a code that shows the hidden tabs (kept as a fingerprint, not the code itself) */
      function codeCard() {
        const shown = !!US.settings.get('showHidden', false);
        const reopen = () => { if (US.jobs.current) { ui.toast({ type: 'info', title: 'Close and reopen the panel when the job is done to see the change.' }); return; } setTimeout(() => location.reload(), 1200); };
        const input = ui.input({ type: 'password', placeholder: 'Have a code?', onEnter: x => {
          if (US.fsx.hash(String(x || '').trim().toLowerCase()) !== 'fcddbeaeee0c4414') { ui.toast({ type: 'warn', title: 'That’s not it.', timeout: 2000 }); return; }
          input.value = '';
          if (US.settings.get('showHidden', false)) { ui.toast({ type: 'info', title: 'The hidden tabs are already showing.' }); return; }
          US.settings.set('showHidden', true);
          ui.toast({ type: 'ok', title: 'Hidden tabs unlocked', text: `${HIDDEN_NAMES} – reopening the panel…` });
          reopen();
        } });
        return h('div.settings-code', input, shown ? ui.button('Hide them again', { small: true, kind: 'ghost', onClick: () => { US.settings.set('showHidden', false); ui.toast({ type: 'ok', title: 'Hidden again – reopening the panel…' }); reopen(); } }) : null);
      }

      /* what works without AI – the notes on AI features link here */
      function withoutAI() {
        const row = (name, what, lose) => h('li', h('b', name + ': '), what, lose ? h('span.muted', ' Without AI you lose: ' + lose) : null);
        return h('div', { dataset: { section: 'without-ai' } }, ui.section('Without AI – what still works', [
          h('div.field-hint', 'Without a key, with AI switched Off, or when the AI can’t be reached, almost everything still works. The top bar says “No AI” then, and each AI feature shows “No AI – basic version”. Nothing about your interviews leaves this computer.'),
          h('div.field-label', 'Never use AI'),
          h('div.field-hint', 'Silence, Selects, Songs, Beats, Check, Safe Zones and Deliver – all their analysis runs on this computer. In Story: reading transcripts, Search (words, other forms of a word, related and mis-heard words), building sequences, bins, highlights, captions, the paper edit, the transcript of a sequence, How picky and the ★ strength rating.'),
          h('div.field-label', 'A basic version without AI'),
          h('ul.settings-noai', [
            row('Find themes', 'groups lines by built-in topic word lists (family, faith, community…); your own themes by word search.', 'smarter, better-named themes, and lines that touch a theme without its usual words.'),
            row('Find more', 'a word search on the topic, leaving out lines you already have.', 'lines that say it in other words.'),
            row('Moments', 'found from the words and timing – restarts, stumbles, “are we rolling?”, laughter, swearing, a second voice, the interviewer reacting, long pauses, emotional words.', 'each moment checked and described; expect more false alarms.'),
            row('Questions', 'lines sharing the question’s words, plus the speech around them (the answer after the question, when the interviewer is heard).', 'answers in other words, and exact answer boundaries.'),
            row('Narrative from a brief', 'a short strong line first, the most relevant lines (mixing voices), the most heartfelt line last, fitted to the length; the next-best lines as alternatives.', 'a shaped story, tightened lines, a purpose for each beat, the client notes and reasons for the alternatives.'),
            row('Interview log', 'everything – speakers, themes, strongest lines, moments, timecodes.', 'the summary of each interview.'),
            row('Overnight prep', 'runs the basic Themes, Moments and log.', '')]),
          h('div.field-label', 'Needs AI'),
          h('div.field-hint', 'Ask › My interviews, and free-form requests in Ask › Anything – without AI, Ask still understands its built-in commands (“cut the silences”, “find the bloopers”…) and type “help” to list them.'),
          h('div.field-label', 'When the AI is set up but fails'),
          h('div.field-hint', 'No internet, a usage limit or a cost you decline: you get a message saying what happened and nothing is half done. Find themes has a “Without AI” button, the other features a switch to turn the AI off; the interview log leaves out the summaries; Find more falls back to its word search.')
        ], { open: false }));
      }
      v.body.querySelector('.card').appendChild(withoutAI());

      return { el: v.el, onShow(opt) {
        status();
        const want = opt && opt.section;
        if (want) setTimeout(() => { const t = v.el.querySelector(`[data-section="${want}"]`) || (want === 'ai' ? v.el.querySelector('.card') : null); if (!t) return; const sec = t.querySelector('.section'); if (sec && want !== 'ai') sec.classList.remove('closed'); t.scrollIntoView({ block: 'start' }); }, 30);
      } };
    }
  });
})();
