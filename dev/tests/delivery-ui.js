// Headless check of Story › Listen to delivery (jsdom, a stand-in Premiere, Story with the three test interviews): the
// card in 1 Interviews is off until switched on; on this computer with no listening model it says so and offers the
// models (nothing downloads); choosing Cloud asks first with the estimate, “no” leaves everything here, “yes” is for
// delivery only; a project kept on this computer can't choose the cloud; Settings › Listen to delivery has every
// choice; a listened-to line shows its pill and corrected words. No model, no network.
// Run on its own (node dev/tests/delivery-ui.js) or through delivery.test.js. Prints JSON on the last line.
const { w, US, $$, tick, boot, loadStory, errors } = require('./panel-dom');
(async () => {
  const out = { errors };
  try {
    await boot(); await loadStory();
    const D = US.delivery, card = () => w.document.querySelector('.dlv-card');
    const openStory = async () => { US.tools.open('story', { tab: 'transcripts' }); await tick(); await tick(); };
    const seg = label => $$('.segmented .seg', card()).find(b => b.textContent.trim() === label);
    const chipButtons = () => $$('.dlv-chip button', card()).map(b => b.textContent.trim());
    await openStory();
    let c = card();
    out.card = { there: !!c, title: c ? (c.querySelector('.card-title') || {}).textContent : '', toggle: c ? c.querySelector('.toggle input').checked : null, where: c ? !!c.querySelector('.segmented') : null, buttons: c ? $$('button', c).map(b => b.textContent.trim()) : null };

    // switched on: this computer, no listening model here
    const t = c.querySelector('.toggle input'); t.checked = true; t.dispatchEvent(new w.Event('change')); await tick(); await tick();
    c = card();
    out.on = { toggle: c.querySelector('.toggle input').checked, where: $$('.segmented .seg', c).map(b => b.textContent.trim()), state: (c.querySelector('.dlv-chip') || { dataset: {} }).dataset.state, offers: chipButtons(), honest: /weaker at Hebrew and Yiddish/.test(c.textContent) && /tested on real footage/.test(c.textContent), langs: /Listening for Hebrew, Yiddish\./.test(c.textContent) };

    // Cloud asks first, with the estimate; “keep it on this computer” leaves it off
    US.secrets.set('geminiKey', 'g-test');
    seg('Cloud').click(); await tick(); await tick();
    let modal = w.document.querySelector('.modal');
    out.confirm = modal ? { title: modal.querySelector('.modal-title').textContent, says: /plain 16 kHz audio/.test(modal.textContent) && /3 interviews, /.test(modal.textContent) && /Cost at Google’s paid rate/.test(modal.textContent) && /No picture is sent/.test(modal.textContent), separate: /separate from “Cloud” in Vision & listening models/.test(modal.textContent) && /What was sent to AI/.test(modal.textContent), buttons: $$('button', modal).map(b => b.textContent.trim()) } : null;
    if (modal) { $$('button', modal).find(b => /Keep it on this computer/.test(b.textContent)).click(); await tick(); await tick(); }
    out.afterNo = { where: D.settings().where, deliveryOn: US.ai.deliveryOn(), mediaOn: US.ai.mediaOn() };
    // yes: for delivery only
    seg('Cloud').click(); await tick(); await tick();
    modal = w.document.querySelector('.modal');
    if (modal) { $$('button', modal).find(b => /^Yes/.test(b.textContent.trim())).click(); await tick(); await tick(); }
    out.afterYes = { where: D.settings().where, deliveryOn: US.ai.deliveryOn(), mediaOn: US.ai.mediaOn(), state: (card().querySelector('.dlv-chip') || { dataset: {} }).dataset.state, offers: chipButtons() };

    // Settings › Listen to delivery
    US.tools.open('settings'); await tick();
    const inSettings = w.document.querySelector('.settings-extra > [data-section="delivery"]');
    const sec = US.settingsSections.list().find(s => s.id === 'delivery'), el = sec.create(); w.document.body.appendChild(el); await tick();
    const text = el.textContent;
    out.settings = { inSettings: inSettings ? { title: (inSettings.querySelector('.section-head') || {}).textContent || '', closed: !!inSettings.querySelector('.section.closed') } : null,
      prosCons: { pros: $$('.und-pro', el).length, cons: $$('.und-con', el).length },
      langs: $$('input[data-lang]', el).map(i => `${i.dataset.lang}:${i.checked}`),
      cloudModels: Math.max(0, ...$$('select', el).map(s => Array.from(s.options).filter(o => /Gemini/.test(o.textContent)).length)),
      claude: /Claude can’t hear/.test(text), honest: /weaker at Hebrew and Yiddish/.test(text), estimate: /For this project: 3 interviews, /.test(text) && /prices read on 19 Nov 2026/.test(text) && /Cost: nothing/.test(text),
      noDownload: !$$('button', el).some(b => /^Download/.test(b.textContent.trim())) && /nothing is downloaded from this screen/.test(text) };
    el.remove();

    // a project set to “nothing leaves this computer”: the cloud can't be chosen
    D.setWhere('local'); US.ai.setProjectOffline(true);
    await openStory();
    seg('Cloud').click(); await tick(); await tick();
    out.offline = { cloudRefused: !w.document.querySelector('.modal'), where: D.settings().where, deliveryOn: US.ai.deliveryOn() };
    US.ai.setProjectOffline(false);

    // a line that has been listened to: its pill and its corrected words; neither when switched off
    const keep = Object.assign({}, D.routes);
    D.routes.sound = async () => ({ data: new Float32Array(16000 * 30), sr: 16000, duration: 30, how: 'ffmpeg' });
    D.routes.listen = async (P, req) => ({ lines: Array.from(req.user[0].matchAll(/^(\S+)\t[\d.]+–[\d.]+\t/gm)).map(m => ({ id: m[1], score: 5, notes: ['warm'], energy: 'high', cleanStart: true, cleanEnd: true, confidence: 'sure', heard: [{ said: 'בעזרת השם', transliteration: 'b’ezrat Hashem', language: 'Hebrew', meaning: 'with God’s help', transcriptHad: 'bizarre a sham', kind: 'religious', confidence: 'sure' }] })), missed: [] });
    const iv = D.interviews()[0];
    await D.analyse(iv, { job: US.jobs.testJob(), plan: { on: true, where: 'local', kind: 'helper', id: 'test@1', label: 'Test listener', langs: D.settings().langs, chunkSec: 30, model: { id: 'test', name: 'Test listener', version: '1' } } });
    Object.assign(D.routes, keep);
    const line = iv.lines[0], pill = US.storyDelivery.pill(line);
    out.lines = { pill: pill ? pill.textContent : '', heard: !!US.storyDelivery.heardEl(line) && /בעזרת השם/.test(US.storyDelivery.heardEl(line).textContent) };
    D.setOn(false);
    out.lines.pillOff = !!US.storyDelivery.pill(line);
  } catch (e) { out.errors.push(String(e && e.stack || e)); }
  console.log(JSON.stringify(out));
  process.exit(0);
})();
