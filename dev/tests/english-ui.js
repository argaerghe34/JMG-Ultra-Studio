// Headless check of Story › 1 Interviews › English translation (jsdom, a stand-in Premiere, Story with the three test
// interviews, all in English): the card says there's nothing to translate and offers no Translate button; with a Hebrew
// interview added it opens, names the language, offers Translate (for that one, and for “all interviews not in
// English”), and after a stand-in translation offers the transcript, the subtitles, “Show English under each line” and
// the subtitles for the open sequence – with the AI-translation warning. No AI, no network.
// Run on its own (node dev/tests/english-ui.js) or through story-english.test.js. Prints JSON on the last line.
const { w, US, $$, tick, boot, loadStory, errors } = require('./panel-dom');
(async () => {
  const out = { errors };
  try {
    await boot(); await loadStory();
    const E = US.storyEnglish, S = US.story;
    const card = () => $$('.section', w.document).find(s => /^English translation/.test((s.querySelector('.section-head') || {}).textContent || ''));
    const open = async () => { US.tools.open('home'); await tick(); US.tools.open('story', { tab: 'transcripts' }); await tick(); await tick(); };
    const buttons = () => $$('button', card()).map(b => b.textContent.trim());
    await open();
    let c = card();
    out.english = { there: !!c, closed: c ? c.classList.contains('closed') : null, says: c ? /All your interviews are in English/.test(c.textContent) : false, rows: c ? $$('.eng-row', c).length : 0, translate: c ? buttons().filter(t => /^Translate/.test(t)) : null, toggle: c ? /Show English under each line/.test(c.textContent) : null };

    // a Hebrew interview joins
    const t = S.addTranscript({ name: 'Savta', path: '/media/Savta.mp4', source: 'file', segments: [{ start: 1, end: 5, speaker: 'Savta', text: 'שמי רות ואני גדלתי בדירה קטנה' }, { start: 6, end: 11, speaker: 'Savta', text: 'כל יום שישי השולחן היה מלא' }] });
    await open();
    c = card();
    const row = c.querySelector(`.eng-row[data-english="${t.key}"]`);
    out.hebrew = { open: !c.classList.contains('closed'), hint: (c.querySelector('.section-head') || {}).textContent, pill: row ? (row.querySelector('.pill') || {}).textContent : '', sub: row ? row.querySelector('.list-sub').textContent : '', rowButtons: row ? $$('button', row).map(b => b.textContent.trim()) : [], all: buttons().find(x => /^Translate all interviews not in English/.test(x)) || '', langs: row ? Array.from(row.querySelector('select').options).map(o => o.textContent).slice(0, 3) : [] };

    // a stand-in translation: what is then offered
    const real = US.ai;
    US.ai = Object.assign({}, real, { available: () => true, provider: () => 'claude', label: () => 'Stand-in', estimateFor: () => ({ usd: 0 }), approveTotal: async () => {}, json: async req => ({ lines: req.user.split('\nLINES (id<TAB>speaker<TAB>text):\n')[1].split('\nCONTEXT')[0].split('\n').map(r => ({ id: r.split('\t')[0], en: 'English of ' + r.split('\t')[0] })) }) });
    try { await E.translate(US.jobs.testJob(), { keys: [t.key] }); } finally { US.ai = real; }
    await open();
    c = card();
    const row2 = c.querySelector(`.eng-row[data-english="${t.key}"]`);
    out.translated = { sub: row2.querySelector('.list-sub').textContent, rowButtons: $$('button', row2).map(b => b.textContent.trim()), warn: /AI translation – check before publishing\. A machine made these translations/.test(c.textContent), show: /Show English under each line/.test(c.textContent), sequence: buttons().includes('Add English subtitles to the open sequence'), formats: $$('select', c).map(s => Array.from(s.options).map(o => o.value).join()).filter(x => /docx|srt/.test(x)) };
    // “Show English under each line”
    out.lineOff = !!E.lineEl(t.lines[0]);
    E.setShow(true);
    const el = E.lineEl(t.lines[0]);
    out.lineOn = el ? el.textContent : '';
    E.setShow(false);
  } catch (e) { out.errors.push(String(e && e.stack || e)); }
  console.log(JSON.stringify(out));
  process.exit(0);
})();
