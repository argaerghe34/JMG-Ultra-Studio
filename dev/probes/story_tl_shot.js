US.tools.open('story', { tab: 'timeline' });
await new Promise(r => setTimeout(r, 400));
const btn = Array.from(document.querySelectorAll('.story-pane:not(.hidden) .btn.primary')).find(b => /Make/.test(b.textContent));
btn.click();
await new Promise(r => setTimeout(r, 300));
for (let i = 0; i < 50 && US.jobs.current; i++) await new Promise(r => setTimeout(r, 200));
document.querySelector('.view').scrollTop = SCROLL;
await new Promise(r => setTimeout(r, 250));
return document.querySelectorAll('.story-tl-row').length;
