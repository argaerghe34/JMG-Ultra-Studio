// Colour tab screenshots: run with the step name as COLOUR_STEP (looks | luts | grade | match | log). Dev only.
const step = (typeof process !== 'undefined' && process.env.COLOUR_STEP) || window.__colourStep || 'looks';
const seq = (await US.host.call('listSequences')).find(s => s.name === 'E2E Colour');
await US.host.call('openSequence', { seqId: seq.id }); await US.host.call('setPlayhead', { seqId: seq.id, seconds: 2 }); await US.refreshContext();
await US.host.rawEval(`(function(){ var t=UStudio.needSeq(${JSON.stringify(seq.id)}).videoTracks[0]; t.clips[0].setSelected(false, true); t.clips[1].setSelected(true, true); return 1; })()`);
US.tools.open('colour');
const root = document.querySelector('.tool:not(.hidden)') || document;
const btn = text => [...root.querySelectorAll('button')].find(b => b.textContent.trim() === text && b.offsetParent);
const until = async () => { await new Promise(r => setTimeout(r, 300)); while (US.jobs.current) await new Promise(r => setTimeout(r, 300)); await new Promise(r => setTimeout(r, 400)); };
const tab = label => [...root.querySelectorAll('.segmented .seg')].find(b => b.textContent.trim() === label).click();
if (step === 'looks') { tab('Looks'); btn('Preview on this frame').click(); await until(); const t = [...root.querySelectorAll('.colour-thumb')][3]; t && t.click(); }
if (step === 'luts') { tab('LUTs'); btn('Preview on this frame').click(); await until(); }
if (step === 'grade') { tab('Grade'); [...root.querySelectorAll('button')].find(b => b.textContent.trim() === 'Moody').click(); await new Promise(r => setTimeout(r, 4000)); }
if (step === 'match') { tab('Match'); btn('Match selected clips to the shot at the playhead').click(); await until(); }
if (step === 'log') { tab('Log'); btn('Check these clips').click(); await until(); }
root.querySelector('.tool-body') && root.querySelector('.tool-body').scrollTo(0, 0);
const overflow = document.documentElement.scrollWidth > document.documentElement.clientWidth || [...root.querySelectorAll('*')].some(e => e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).overflowX === 'visible' && e.clientWidth > 0 && !e.closest('.colour-grid'));
return { step, width: innerWidth, overflow };
