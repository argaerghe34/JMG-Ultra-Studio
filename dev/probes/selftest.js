US.tools.open('home');
document.querySelector('.hero .btn.primary').click();
await new Promise(r => setTimeout(r, 300));
for (let i = 0; i < 240 && US.jobs.current; i++) await new Promise(r => setTimeout(r, 500));
return US.log.entries().slice(-3).map(e => e.level + ': ' + e.text + ' | ' + e.detail);
