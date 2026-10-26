// Overnight prep in real Premiere: themes, moments, the interview log and Selects analysis of all the footage, one after
// another, with a report.
const before = US.settings.get('overnight.report');
const r = await US.overnight.run(US.jobs.testJob('overnight'), { steps: ['themes', 'moments', 'log', 'selects'], useAI: false, footage: 'concert' });
const rep = r.report;
T.assert(rep.steps.length === 4, 'four steps ran: ' + JSON.stringify(rep.steps));
const byId = Object.fromEntries(rep.steps.map(s => [s.id, s]));
T.assert(byId.selects.ok && /select/i.test(byId.selects.summary), 'Selects analysed the footage: ' + byId.selects.summary);
T.assert(byId.themes.ok || /no (transcripts|lines)/i.test(byId.themes.summary), 'themes: ' + byId.themes.summary);
T.assert(byId.log.ok && byId.log.file && require('fs').existsSync(byId.log.file), 'interview log written: ' + byId.log.summary);
T.assert(US.selects.state.sourceLabel === 'All footage (overnight)', 'Selects shows the overnight result');
T.assert(!US.selects.state.clips.some(c => /^JMG Ultra Studio/.test(c.item.bin || '')), 'Ultra Studio’s own bins were left out');
T.assert(US.settings.get('overnight.report').finished === rep.finished, 'report kept for Home');
await T.sleep(300);
T.assert(document.querySelector('.tool:not(.hidden)') && /Overnight prep/.test(document.querySelector('.tool:not(.hidden)').innerText), 'Home shows the report');
const home = document.querySelector('.tool:not(.hidden)').innerText;
T.assert(home.includes(US.basename(byId.log.file)), 'Home offers the log to open');
require('fs').unlinkSync(byId.log.file);
if (before) US.settings.set('overnight.report', before); else US.settings.set('overnight.report', Object.assign({}, rep, { dismissed: true }));
return { summary: r.summary, steps: rep.steps.map(s => `${s.id}: ${s.summary} (${s.secs.toFixed(1)} s)`) };
