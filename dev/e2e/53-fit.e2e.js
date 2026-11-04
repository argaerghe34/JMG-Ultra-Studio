// The panel at its real size in Premiere: nothing runs off the edge – the top bar, Home, Story, the Agent, Quick
// effects, Settings – and nothing is clipped sideways inside the view.
const notes = [`panel ${window.innerWidth}×${window.innerHeight}`];
const overflow = () => {
  const vw = document.documentElement.clientWidth, bad = [];
  if (document.documentElement.scrollWidth > vw + 1) bad.push('page ' + document.documentElement.scrollWidth + '>' + vw);
  for (const el of document.querySelectorAll('.header *')) { const r = el.getBoundingClientRect(); if (r.width && r.right > vw + 1) { bad.push('top bar: ' + el.className); break; } }
  const view = document.querySelector('.view'), vr = view.getBoundingClientRect().right;
  for (const el of view.querySelectorAll('*')) { if (el.closest('.hidden')) continue; const r = el.getBoundingClientRect(); if (r.width && r.right > vr + 1 && el.parentElement.getBoundingClientRect().right <= vr + 1) { bad.push(String(el.className || el.tagName)); if (bad.length > 4) break; } }
  return bad;
};
for (const tool of ['home', 'story', 'agent', 'quickfx', 'wiki', 'settings']) {
  US.tools.open(tool); await T.sleep(400);
  const b = overflow(); if (b.length) notes.push(`${tool}: ${b.join(', ')}`);
  T.assert(!b.length, `${tool}: nothing runs off the edge – ${b.join(', ')}`);
}
US.tools.open('home');
return notes;
