/* JMG Ultra Studio – Settings (opened from the gear in the header). */
(function () {
  'use strict';
  const US = window.US, h = US.h, ui = US.ui;

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
        aiStatus.textContent = p === 'none' ? 'AI is off. Every tool still works; the Assistant uses its built-in commands.' : `Using ${US.ai.label()} for AI requests.${p === 'gemini' ? ' Free within Google’s daily allowance.' : ''}`;
        renderSpend();
      }

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
          ui.field('Claude model', modelSel, 'Opus gives the best story judgement. Sonnet costs about half; Haiku a fortieth but is noticeably weaker at story work.'),
          ui.section('Cost', [
            spendBox,
            h('div.grid2', ui.field('Ask before a request costing', askSel), ui.field('Monthly limit (US$)', capInput, 'Ultra Studio stops before going over it. Also set a limit at console.anthropic.com.')),
            h('div.field-hint', 'Measured on a 54-interview project with Opus: Find themes ≈ 32¢, Find more ≈ 14¢, a narrative cut ≈ 28¢, Moments ≈ 31¢, an Assistant request 2–5¢ – about $5 for a whole documentary. Asking again soon after costs less. Gemini is free within its daily allowance.')
          ], { open: true })),
        ui.card(h('div.card-title', 'Notifications'), notify, sound),
        ui.card(h('div.card-title', 'Story'),
          ui.toggle({ label: 'Keep Story next to the project', value: US.settings.get('story.withProject', true) !== false, onChange: x => { US.settings.set('story.withProject', x); if (x && US.story && US.story.save) US.story.save(); }, hint: 'Story’s transcripts, themes and narratives are also saved in a “JMG Ultra Studio” folder next to the project, so the project opened on another computer – from the same drive, or a copy of the folder – finds them. Anyone you share that folder with can read the transcripts. Switched off, Story is kept on this computer only.' })),
        ui.card(h('div.card-title', 'Files'),
          h('div.muted.small', 'Settings, analysis results and logs: ', h('span.mono', US.fsx.dataDir)),
          h('div.row', ui.button('Open data folder', { small: true, icon: 'folder', onClick: () => openFolder(US.fsx.dataDir) }),
            ui.button('Clear analysis cache', { small: true, kind: 'ghost', onClick: async () => { if (await ui.confirm({ title: 'Clear the analysis cache?', text: 'Clips will be analysed again next time. Nothing in your Premiere project changes.', ok: 'Clear it' })) { require('fs').rmSync(require('path').join(US.fsx.dataDir, 'cache'), { recursive: true, force: true }); ui.toast({ type: 'ok', title: 'Cache cleared' }); } } }))),
        ui.card(h('div.card-title', 'About'), h('div.muted', `JMG Ultra Studio ${US.version} · Premiere Pro ${US.premiere ? US.premiere.version : ''}`), h('div.muted.small', 'Works on a copy: tools that change a sequence always make a new one first. Nothing is uploaded.'))
      );
      return { el: v.el };
    }
  });
})();
