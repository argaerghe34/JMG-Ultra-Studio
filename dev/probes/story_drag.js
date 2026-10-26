// Drag a card from column 1 to the top of column 2, then drag column 1 to the end – with pointer events, as a mouse would.
const st = US.story.loadState();
const before = st.wall.columns.map(c => c.name + ':' + c.cards.map(k => k.lineId).join(','));
US.tools.open('story', { tab: 'wall' });
await new Promise(r => setTimeout(r, 100));
const sleep = ms => new Promise(r => setTimeout(r, ms));
function fire(el, type, x, y) { el.dispatchEvent(new PointerEvent(type, { clientX: x, clientY: y, button: 0, buttons: type === 'pointerup' ? 0 : 1, bubbles: true, pointerId: 1, pointerType: 'mouse' })); }
const cols = () => Array.from(document.querySelectorAll('.wall-col'));
const c0 = cols()[0], c1 = cols()[1];
const card = c0.querySelector('.wall-card .wall-text');
const moving = c0.querySelector('.wall-card').dataset.line;
const r0 = card.getBoundingClientRect();
const target = c1.querySelector('.wall-card'); const rt = target.getBoundingClientRect();
fire(card, 'pointerdown', r0.left + 10, r0.top + 5);
for (let i = 1; i <= 8; i++) { fire(document, 'pointermove', r0.left + 10 + (rt.left + 20 - r0.left - 10) * i / 8, r0.top + 5 + (rt.top + 4 - r0.top - 5) * i / 8); await sleep(10); }
const ghost = !!document.querySelector('.wall-ghost'), marker = !!document.querySelector('.wall-drop');
fire(document, 'pointerup', rt.left + 20, rt.top + 4);
await sleep(50);
const afterCard = st.wall.columns.map(c => c.name + ':' + c.cards.map(k => k.lineId).join(','));
const okCard = st.wall.columns[1].cards[0].lineId === moving && !st.wall.columns[0].cards.some(k => k.lineId === moving);
// column drag: first column to the far right
const name0 = st.wall.columns[0].name;
const grip = cols()[0].querySelector('.wall-grip'); const rg = grip.getBoundingClientRect();
fire(grip, 'pointerdown', rg.left + 3, rg.top + 3);
const last = cols()[cols().length - 1].getBoundingClientRect();
for (let i = 1; i <= 6; i++) { fire(document, 'pointermove', rg.left + (last.right - 5 - rg.left) * i / 6, rg.top + 3); await sleep(10); }
fire(document, 'pointerup', last.right - 5, rg.top + 3);
await sleep(50);
const okCol = st.wall.columns[st.wall.columns.length - 1].name === name0 || st.wall.columns[st.wall.columns.length - 2].name === name0;
return { ghost, marker, okCard, okCol, order: st.wall.columns.map(c => c.name), saved: US.fsx.exists(require('path').join(US.fsx.dataDir, 'projects')) };
