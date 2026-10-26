const view = document.querySelector('.view'); const W = view.clientWidth;
const out = { viewW: W, toolW: view.querySelector('.tool:not(.hidden)') && view.querySelector('.tool:not(.hidden)').getBoundingClientRect().width };
const wide = [];
view.querySelectorAll('*').forEach(el => { const r = el.getBoundingClientRect(); if (r.width > W + 1 && el.offsetParent) wide.push({ tag: el.tagName + '.' + el.className, w: Math.round(r.width) }); });
out.wide = wide.slice(-12);
return out;
