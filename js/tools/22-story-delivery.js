/* JMG Ultra Studio – Story › Listen to delivery: the screens for US.delivery (js/core/delivery.js).

   - the card in Story › 1 Interviews: the switch (off until switched on, per project), where it happens, where things
     stand, “Listen now” / “Do it in Overnight prep”, and the words it heard that Names and terms doesn't have –
     offered, never added by themselves;
   - Settings › Listen to delivery (US.settingsSections): the full choices – this computer or the cloud with honest
     pros, cons, time and cost for this project's interviews, which model for each, and the languages to listen for;
   - the cloud's own yes for the project (US.ai.setDelivery), always asked with the estimate; a project set to
     “nothing leaves this computer” can't choose it;
   - the small pieces other screens show: a line's pill and its corrected words (Story's lists, Pro View). */
(function () {
  'use strict';
  const US = window.US, h = US.h, ui = US.ui;
  const D = () => US.delivery, S = () => US.story;
  const money = r => (r[1] < 0.005 ? 'under 1¢' : US.ai.fmtUSD(r[0]) === US.ai.fmtUSD(r[1]) ? US.ai.fmtUSD(r[1]) : `${US.ai.fmtUSD(r[0])}–${US.ai.fmtUSD(r[1])}`);
  const dur = s => (s < 90 ? 'about a minute' : US.fmtDur(s));
  const durRange = r => (Math.abs(r[0] - r[1]) < 30 ? dur(r[1]) : `${dur(r[0])}–${dur(r[1])}`);
  const HONEST = 'Honestly: the small models that run on this computer are weaker at Hebrew and Yiddish than the cloud models, and how well they judge delivery on real speech is still unproven – none of this has been tested on real footage yet. Treat a score as a first opinion and check corrected words by ear before they go in a caption.';

  /**
   * The numbers for this project's interviews, for both routes. left: only what hasn't been listened to yet.
   * -> {count, seconds, lines, local, cloud, lm, s} or null when there are no interviews
   */
  function numbers({ left = false, as = '' } = {}) {
    const s = D().settings(), all = D().interviews();
    if (!all.length) return null;
    const lm = D().localModels().find(m => m.id === s.localModel) || null, chunk = (lm && lm.model.chunkSec) || 30;
    // “left” for the cloud is judged as the cloud model would see it, whether or not it has its yes yet
    const P = as === 'cloud' ? { kind: 'cloud', id: 'cloud:' + s.cloudModel, langs: s.langs } : D().plan();
    const list = left && P.kind !== 'none' ? all.filter(iv => iv.path && D().needs(iv, P)) : all.filter(iv => iv.path);
    const tl = D().totals(list, chunk), tc = D().totals(list, 120);
    const local = D().estimate(tl, { chunk, bench: D().bench(), localModel: lm && lm.model }).local;
    const cloud = s.cloudModel ? D().estimate(tc, { cloudModel: s.cloudModel, prices: US.ai.MEDIA_PRICES }).cloud : null;
    return { count: list.length, of: all.length, noFile: all.filter(iv => !iv.path).length, seconds: tl.seconds, lines: tl.lines, local, cloud, lm, s };
  }
  /** The plain sentences of an estimate: {interviews, local, cloud, usd} */
  function estimateText(n) {
    const out = {};
    out.interviews = `${US.plural(n.count, 'interview')}, ${US.fmtDur(n.seconds)} of speech, ${US.plural(n.lines, 'line')}${n.noFile ? ` (${n.noFile} more not linked to a media file can’t be listened to)` : ''}`;
    out.local = n.lm && n.lm.installed
      ? `${n.lm.name}: ${n.local.measured ? dur(n.local.secs[1]) + ', measured on this computer' : durRange(n.local.secs) + ' – an assumption (between half and three times as fast as the speech plays); it isn’t measured until the model has listened here'}. Cost: nothing.`
      : 'Needs a listening model downloaded once (Settings › Vision & listening models). Cost: nothing.';
    if (n.cloud) {
      const c = n.cloud;
      out.cloud = `${c.label}: ${durRange(c.secs)} with a good connection, about ${c.megabytes} MB of sound uploaded in ${US.plural(c.asks, 'piece')}. Cost at Google’s paid rate: ${money(c.usd)} (prices read on ${c.date}; a range because Google’s own pages give two token rates for sound, and how much the model writes back is an assumption). On Google’s free allowance it costs nothing – but Google may then use what is sent to improve its products.`;
      out.usd = c.usd;
    } else out.cloud = 'Needs a Gemini key in Settings › AI. Claude can’t hear.';
    return out;
  }

  /**
   * The cloud's yes for this project: say exactly what leaves, what it costs, and ask. Asked every time before
   * anything is sent by hand, and once before Overnight prep. -> true when the editor says yes.
   */
  async function confirmCloud({ overnight = false, limit = null } = {}) {
    if (US.ai.projectOffline()) { ui.toast({ type: 'warn', title: 'This project is set to “nothing leaves this computer”', text: 'Its interviews can only be listened to here. Change that in Settings › AI first if you mean to.' }); return false; }
    if (!US.secrets.get('geminiKey')) { ui.toast({ type: 'warn', title: 'Cloud listening needs a Gemini key', text: 'Add one in Settings › AI. Claude can’t hear, so a Claude key isn’t enough.' }); return false; }
    const n = numbers({ left: true, as: 'cloud' }), t = n && n.count ? estimateText(n) : null, s = D().settings();
    const label = (US.ai.MEDIA_PRICES.gemini[s.cloudModel] || {}).name || 'Gemini', name = (US.ctx.project && US.ctx.project.name) || 'this project';
    const hidden = (() => { try { return (S().glossary() || []).filter(e => e.hide).length; } catch (e) { return 0; } })();
    const ok = await ui.modal({ title: overnight ? `Send this project’s interviews to ${label} tonight?` : `Let ${label} listen to the interviews of “${name}”?`,
      body: h('div',
        h('p', 'The sound of each interview (plain 16 kHz audio, only the stretches with transcript lines) is sent from this computer to Google, a piece at a time, together with the transcript lines in that piece. No picture is sent.'),
        t ? h('p', h('b', t.interviews + '. '), t.cloud) : h('p', 'Everything has been listened to already – nothing would be sent now.'),
        overnight && limit != null ? h('p', `Overnight prep stops sending before it goes over tonight’s limit of ${US.ai.fmtUSD(+limit)}, counted at Google’s paid rate; the rest waits.`) : null,
        hidden ? h('p.field-hint', `Names you keep out of AI are replaced in the transcript lines that are sent – but they can still be heard in the sound itself.`) : null,
        h('p.field-hint', 'This yes is for Listen to delivery in this project only, on this computer, until you switch it back – it is separate from “Cloud” in Vision & listening models. Every request is listed in Settings › What was sent to AI with its size. A project set to “nothing leaves this computer” never sends anything.')),
      buttons: [{ label: 'Keep it on this computer', value: false, kind: 'ghost' }, { label: t && t.usd ? `Yes – up to about ${US.ai.fmtUSD(t.usd[1])}` : 'Yes, use the cloud', value: true, kind: 'primary' }] });
    if (ok) { US.ai.setDelivery(true); D().setWhere('cloud'); }
    return !!ok;
  }
  /** Listen now: on this computer straight away; in the cloud only after the estimate and a yes. */
  async function listenNow() {
    const s = D().settings();
    if (!s.on) return null;
    if (s.where === 'cloud') { if (!(await confirmCloud())) return null; }
    else if (D().plan().why === 'model') { ui.toast({ type: 'warn', title: 'No listening model on this computer yet', text: 'Download one first – nothing is downloaded until you press Download.', action: { label: 'Open the models', fn: () => US.tools.open('settings', { section: 'understand' }) } }); return null; }
    return US.jobs.run({ title: 'Listening to the delivery of the interviews', tool: 'story' }, job => D().runAll(job, { heavy: true }));
  }
  function addToOvernight() {
    const o = US.overnight ? US.overnight.settings() : Object.assign({ steps: [] }, US.settings.get('overnight', {}));
    if (!o.steps.includes('delivery')) { o.steps = o.steps.concat('delivery'); US.settings.set('overnight', o); }
    ui.toast({ type: 'ok', title: 'Added to Overnight prep', text: '“Listen to the delivery of the interviews” is ticked. Start Overnight prep on Home when you leave.', action: { label: 'Open Home', fn: () => US.tools.open('home') } });
  }

  /* ---------- the status line: a pill, a note, the buttons – it keeps itself up to date ---------- */
  const COLOR = { working: 'var(--accent-hi)', 'up-to-date': 'var(--ok)', paused: 'var(--text-2)', scheduled: 'var(--warn)', 'cloud-waiting': 'var(--warn)', 'needs-consent': 'var(--warn)', deaf: 'var(--warn)', 'needs-model': 'var(--text-2)', 'needs-key': 'var(--text-2)', offline: 'var(--text-2)', off: 'var(--text-3)', 'no-project': 'var(--text-3)', 'no-interviews': 'var(--text-3)' };
  function chip({ after = null } = {}) {
    const el = h('div.und-chip.dlv-chip');
    let shown = false;
    const done = p => Promise.resolve(p).catch(() => null).then(() => { if (after) after(); });
    function draw(st) {
      if (el.isConnected) shown = true; else if (shown) { off(); return; }   // taken off the screen: stop following
      st = st && st.state ? st : D().status();
      US.clear(el);
      el.dataset.state = st.state;
      const btns = (st.offers || []).map(o => o === 'now' ? ui.button('Listen now', { small: true, kind: 'primary', title: st.where === 'cloud' ? 'You’re shown what is sent and what it costs first' : 'On this computer – nothing leaves', onClick: () => done(listenNow()) })
        : o === 'overnight' ? ui.button('Do it in Overnight prep', { small: true, onClick: addToOvernight })
          : o === 'recheck' ? ui.button('Check again', { small: true, kind: 'ghost', title: 'Forget the hearing check for this model: it is made again the next time it listens', onClick: () => { D().forgetHearing(); if (after) after(); } })
          : o === 'models' ? ui.button('Open the models', { small: true, onClick: () => US.tools.open('settings', { section: 'understand' }) })
            : ui.button('Open Settings', { small: true, kind: 'ghost', onClick: () => US.tools.open('settings', { section: 'delivery' }) }));
      el.append(h('div.row', ui.pill(st.text, COLOR[st.state])));
      if (st.note) el.append(h('div.field-hint', st.note));
      if (btns.length) el.append(h('div.row', btns));
    }
    const off = US.bus.on('delivery', draw);
    draw();
    return el;
  }
  /** “This computer” or “Cloud” – the cloud only after its yes. */
  function whereControl(redraw) {
    const s = D().settings(), off = US.ai.projectOffline();
    return ui.segmented({ options: [{ value: 'local', label: 'This computer', title: 'Nothing leaves this computer' }, { value: 'cloud', label: 'Cloud', title: off ? 'This project is set to “nothing leaves this computer”' : 'The interviews’ sound is sent to Gemini – asked first, with the cost' }], value: s.where,
      onChange: async x => { if (x === 'cloud') { if (!(await confirmCloud())) { redraw(); return; } } else D().setWhere('local'); redraw(); } });
  }

  /* ---------- words it heard that Names and terms doesn't have: offered, not added ---------- */
  const dismissed = () => US.projectStore((US.ctx.project && (US.ctx.project.path || US.ctx.project.name)) || 'none');
  function offers() {
    const gone = new Set(dismissed().get('delivery.notTerms') || []), bare = US.storyGlossary ? US.storyGlossary.bare : x => String(x).toLowerCase();
    return D().heardTerms().filter(x => !gone.has(bare(x.right)));
  }
  /** Put one heard term into the project's Names and terms (only for the lines it was heard in) and correct those lines. */
  function addTerm(x) {
    const st = S().state(), G = US.storyGlossary;
    st.glossary = G.clean((st.glossary || []).concat([{ right: x.right, heard: x.heard, hide: false, lines: x.lines }]));
    S().reindex(); S().save();
  }
  function offersEl(render) {
    const list = offers();
    if (!list.length) return null;
    const bare = US.storyGlossary.bare;
    return ui.section('Words it heard', [
      h('div.field-hint', 'Words the listener is sure the transcript got wrong. Add one and its lines are corrected through Names and terms (only the lines it was heard in; remove it there to put them back). Nothing is added by itself – listen first if you’re not sure.'),
      h('div.list.dlv-terms', list.slice(0, 12).map(x => h('div.list-row',
        h('div.list-main',
          h('div.list-title', US.keep(x.said), x.right !== x.said ? h('span.dlv-tr', US.keep(' ' + x.right)) : null, x.lang ? ui.pill(x.lang) : null),
          h('div.list-sub', US.keep(`${x.meaning ? x.meaning + ' · ' : ''}the transcript had “${x.heard.join('”, “')}” · ${US.plural(x.lines.length, 'line')}`))),
        h('div.sel-right',
          ui.button('Play', { small: true, kind: 'ghost', icon: 'play', title: 'Hear the first line it was heard in', onClick: () => { const l = S().lineOf(x.lines[0]); if (l) S().cueLine(l); } }),
          ui.button('Add to Names and terms', { small: true, onClick: () => { addTerm(x); render(); } }),
          ui.button('Not this one', { small: true, kind: 'ghost', onClick: () => { const p = dismissed(); p.set('delivery.notTerms', (p.get('delivery.notTerms') || []).concat(bare(x.right)).slice(-400)); render(); } }))))),
      list.length > 12 ? h('div.field-hint', `…and ${list.length - 12} more, shown as you work through these.`) : null
    ], { open: true, hint: US.plural(list.length, 'word') + ' to check' });
  }

  /* ---------- Story › 1 Interviews ---------- */
  function card({ render }) {
    const box = h('div.card.dlv-card', { dataset: { card: 'delivery' } });
    function draw() {
      US.clear(box);
      if (!D()) return;
      const s = D().settings(), P = D().plan();
      US.append(box, [
        h('div.card-title', 'Listen to delivery'),
        h('div.muted', 'A transcript only has the words. Switch this on and Ultra Studio listens to your interviews as well: how each line is said – sure, warm, hesitant, flat, laughing, cut off – and the words the transcript got wrong or left out, such as Hebrew and Yiddish, names, a joke or sarcasm. Themes, Find, narratives and Ask then prefer the takes that are said well, and use the corrected words.'),
        ui.toggle({ label: 'Listen to how the lines are said', hint: 'Off until you switch it on, for this project only. When it’s off nothing is listened to, and nothing about delivery is sent with Story’s AI requests.', value: s.on, onChange: x => { D().setOn(x); draw(); render(); } }),
        s.on ? ui.field('Where', whereControl(() => { draw(); }), s.where === 'cloud'
          ? (P.kind === 'cloud' ? `Cloud is on for this project: ${P.label}. Sound is only sent when you press Listen now, or in Overnight prep within its limit.` : 'Cloud is chosen, but nothing is sent until you say yes on this computer.')
          : `Nothing leaves this computer${P.label ? `: ${P.label} listens, in the background when the computer is quiet` : ''}.`) : null,
        s.on ? chip({ after: render }) : null,
        s.on ? h('div.row', h('span.field-hint.grow', `Listening for ${D().langNames(s.langs).join(', ') || 'no other language in particular'}. ${HONEST}`), ui.button('All the choices', { small: true, kind: 'ghost', title: 'Models, languages, time and cost: Settings › Listening models for Story', onClick: () => US.tools.open('settings', { section: 'delivery' }) })) : null,
        s.on ? offersEl(() => { draw(); render(); }) : null
      ]);
    }
    draw();
    return box;
  }

  /* ---------- a line's pill and its corrected words (Story's lists, Pro View) ---------- */
  const scoreColor = n => (n >= 4 ? 'var(--ok)' : n && n <= 2 ? 'var(--warn)' : 'var(--text-2)');
  /** “4/5 – warm, laughs” */
  const WHY_UNHEARD = { model: 'The listener couldn’t hear this line being spoken', silent: 'The recording is silent here', words: 'Other words were heard here than the transcript has' };
  function short(e) { if (e && e.unheard) return 'couldn’t hear'; return e ? [e.score ? `${e.score}/5` : '', (e.notes || []).slice(0, 3).join(', ')].filter(Boolean).join(' – ') : ''; }
  function titleOf(e) {
    if (e.unheard) return `${WHY_UNHEARD[e.unheard] || WHY_UNHEARD.model} – so it has no delivery score.` + ((e.heard || []).length ? '\nHeard: ' + e.heard.map(D().heardText).join(' · ') : '');
    return ['How it’s said' + (e.score ? `: ${e.score} out of 5` : ''), (e.notes || []).join(', '), e.energy ? `${e.energy} energy` : '', e.in === false ? 'starts mid-word' : '', e.out === false ? 'ends cut off' : '', e.conf === 'unsure' ? 'the listener wasn’t sure' : '']
      .filter(Boolean).join(' · ') + ((e.heard || []).length ? '\nHeard: ' + e.heard.map(D().heardText).join(' · ') : '');
  }
  /** A small pill for a line that has been listened to (null otherwise, and when it is switched off). */
  function pill(l) {
    const e = D() ? D().forLine(l) : null;
    if (!e || !(e.unheard || e.score || (e.notes || []).length)) return null;
    const p = ui.pill(`♪ ${e.unheard ? 'couldn’t hear' : e.score ? e.score + '/5' : e.notes[0]}`, e.unheard ? 'var(--text-3)' : scoreColor(e.score));
    p.title = titleOf(e); p.classList.add('dlv-pill');
    return p;
  }
  /** The words the transcript got wrong, to show under a line, with a marker (null when there are none). */
  function heardEl(l, e = D() ? D().forLine(l) : null) {
    if (!e || !(e.heard || []).length) return null;
    return h('div.dlv-heard', { title: 'Heard when the interview was listened to – the transcript had something else here' }, h('span.dlv-mark', '◆'), ' heard: ', US.keep(e.heard.map(x => (x.conf === 'unsure' ? 'perhaps ' : '') + D().heardText(x)).join(' · ')));
  }

  /* ---------- Settings › Listen to delivery ---------- */
  function create() {
    const box = h('div.und-settings.dlv-settings');
    function draw() {
      US.clear(box);
      if (!D()) { box.append(ui.note('Listen to delivery isn’t available in this copy.', 'warn')); return; }
      if (!US.ctx.project) { box.append(ui.note('Open a project to choose – every choice here is per project.', 'info')); return; }
      const s = D().settings(), off = US.ai.projectOffline(), n = numbers(), t = n ? estimateText(n) : null, name = US.ctx.project.name || '';
      const pros = (title, good, bad, est) => h('div.und-route', h('div.list-title', title), h('ul', good.map(g => h('li.und-pro', g)), bad.map(b => h('li.und-con', b))), est ? h('div.field-hint', est) : null);
      const locals = D().localModels(), clouds = D().cloudModels(), hasKey = !!US.secrets.get('geminiKey');
      const langBox = L => h('label.row.dlv-lang', h('input', { type: 'checkbox', checked: !!s.langs[L.id], dataset: { lang: L.id }, onchange: e => { D().setLangs(Object.assign({}, D().settings().langs, { [L.id]: e.target.checked })); draw(); } }), ' ' + L.name);
      US.append(box, [
        h('div.field-hint', 'Where Story listens to your interviews, and with which model. Two things use it: Listen to delivery (how each line is said – switched on below, per project) and English translation › By listening (the words and their English made from the sound, when you ask for it on an interview). The cloud is one choice for both, asked with the cost every time.'),
        h('div.und-block', h('div.und-head', 'This project', name ? h('span.right', US.keep(name)) : null),
          h('div.field-hint', 'Story normally works from the transcript alone. With this on, Ultra Studio also listens to each interview and notes, line by line, how it is said (a score from 1 to 5, a few words, whether it starts and ends cleanly) and the words the transcript got wrong – other languages, names, a joke, sarcasm. Story’s AI is then told, briefly, on each line.'),
          ui.toggle({ label: 'Listen to how the lines are said', hint: 'Off until you switch it on. Per project.', value: s.on, onChange: x => { D().setOn(x); draw(); } }),
          ui.field('Where it happens', whereControl(draw), off ? 'This project is set to “nothing leaves this computer” (Settings › AI): the cloud can’t be chosen for it.' : s.where === 'cloud' && US.ai.deliveryOn() ? 'Cloud is on for this project. It never runs behind your back: only Listen now (after the estimate and your yes) or Overnight prep within its limit. Switch back any time.' : 'Cloud is off until you choose it here, and you’re shown the cost first. This is its own choice – separate from “Cloud” in Vision & listening models.'),
          h('div.grid2',
            pros('This computer', ['Nothing leaves this computer – right for client work under NDA', 'Free, and works offline', 'Works by itself in quiet moments, a little at a time'], ['Needs a listening model downloaded once (Gemma 4, a few GB)', 'Small models are noticeably weaker at Hebrew and Yiddish, and at telling sarcasm from sincerity', 'Slow: it hears 30 seconds at a time and uses this computer while it works – long interviews wait for Overnight prep'], t ? t.local : null),
            pros('Cloud', ['The better ear: Gemini follows Hebrew, Yiddish and mixed speech far better than a small local model', 'Quick, and this computer stays free for editing', 'Nothing to download'], ['The sound of your interviews and their transcript lines leave this computer (to Google)', 'Costs money beyond Google’s free allowance – and on the free allowance Google may use what’s sent', 'Needs the internet and your own Gemini key; Claude can’t hear'], t ? t.cloud : null)),
          h('div.field-hint', t ? `For this project: ${t.interviews}.` : 'The estimates need this project’s interviews: read the transcripts in Story › 1 Interviews first.'),
          ui.note(HONEST, 'warn')),
        h('div.und-block', h('div.und-head', 'Which model listens'),
          ui.field('On this computer', locals.some(m => m.installed)
            ? ui.select({ options: locals.filter(m => m.installed).map(m => ({ value: m.id, label: m.name })), value: s.localModel, onChange: x => { D().setModel('local', x); draw(); } })
            : h('div.row', h('span.field-hint.grow', locals.length ? `No listening model is on this computer yet. ${locals.map(m => m.name).join(' and ')} can listen.` : 'No listening model is available for this computer.'), ui.button('Open Vision & listening models', { small: true, onClick: () => US.tools.open('settings', { section: 'understand' }) })),
            (() => { const pl = D().plan(), h = pl.deaf || (pl.kind === 'helper' ? D().hearing()[pl.id] : null); return (h ? (h.ok ? 'Hearing check passed: given a silent clip and a tone with made-up lines, it scored none of them. ' : `${D().DEAF}: it isn’t used. `) : 'The first time a model listens it gets a hearing check (a few seconds): a silent clip and a tone with made-up lines – a model that scores them is reading the transcript, and isn’t used. ') + 'A model here first writes down what it hears without seeing the transcript; a line whose words it didn’t hear gets no score. Download or delete models in Settings › Vision & listening models – nothing is downloaded from this screen.'; })()),
          ui.field('In the cloud', clouds.length ? ui.select({ options: clouds.map(m => ({ value: m.id, label: `${m.name} – $${m.in.toFixed(2)} in / $${m.out.toFixed(2)} out per million tokens` })), value: s.cloudModel, onChange: x => { D().setModel('cloud', x); draw(); } }) : h('span.field-hint', 'No cloud listening models are known.'),
            `${hasKey ? 'Uses your Gemini key.' : 'Needs a Gemini key in Settings › AI.'} Claude can’t hear, so it isn’t offered. The dearer models hear nuance better; prices read on ${US.ai.MEDIA_PRICES.date}.`)),
        h('div.und-block', h('div.und-head', 'Languages to listen for'),
          h('div.field-hint', 'The listener is told to expect these besides English, so it writes them in their own script, says how to read them and what they mean. Other languages are still noted when heard.'),
          h('div.row.dlv-langs', D().LANGS.map(langBox)),
          ui.field('Other', ui.input({ value: s.langs.other, placeholder: 'e.g. Ladino, Aramaic, Hungarian', onInput: US.debounce(x => D().setLangs(Object.assign({}, D().settings().langs, { other: x })), 600) }), 'Commas between. Changing the languages means the interviews are listened to again.')),
        h('div.und-block', h('div.und-head', 'What it’s doing'), s.on ? chip({ after: draw }) : h('div.field-hint', 'Switched off for this project: nothing is listened to and nothing is sent.'),
          h('div.field-hint', 'On this computer it follows the two background switches in Vision & listening models (work in the background; let big jobs run too). What it finds is kept per media file and travels with the project in “– Delivery.json”. An interview is listened to again only when its transcript, the model or the languages change.'))
      ]);
    }
    draw();
    US.bus.on('context', () => { if (box.isConnected !== false) draw(); });
    US.bus.on('models', () => { if (box.isConnected) draw(); });
    return box;
  }

  US.storyDelivery = { card, pill, heardEl, short, titleOf, WHY_UNHEARD, scoreColor, chip, confirmCloud, listenNow, addToOvernight, numbers, estimateText, offers, addTerm, create, HONEST };
  // one place for the models that listen for Story: Listen to delivery, and Story › English translation › By listening
  US.settingsSections.register({ id: 'delivery', title: 'Listening models for Story', order: 36, create });

  /* Ask, recipes and the offline parser: “listen to the delivery of my interviews” */
  US.actions.register({
    id: 'delivery.run', tool: 'story', title: 'Listen to the delivery of the interviews', changes: false,
    describe: 'Listens to every interview not yet done and notes, per transcript line, how it is said (a score 1–5 and a few words) and the words the transcript got wrong (Hebrew, Yiddish, names, sarcasm). Only when Listen to delivery is switched on for the project (Story › 1 Interviews); on this computer, or in the cloud only when that was chosen for the project.',
    examples: ['listen to the delivery of my interviews', 'judge how the lines are delivered'],
    match: t => (/\b(listen to|judge|score|rate)\b.*\b(delivery|delivered|how .* (said|sound))\b/i.test(t) ? { _score: 2.6 } : null),
    run: async (p, job) => {
      if (!D().settings().on) throw new US.UserError('NOTHING_FOUND', { title: 'Listen to delivery is switched off for this project.', action: 'Switch it on in Story › 1 Interviews.' });
      // the cloud is never used without the estimate and a yes, whoever asks (and US.ai.media checks the project's consent itself)
      if (D().settings().where === 'cloud' && !(await confirmCloud())) throw new US.UserError('CANCELLED');
      return D().runAll(job, { heavy: true });
    }
  });
})();
