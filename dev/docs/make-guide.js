// Turns dev/docs/guide.md (+ tools.md) into "Read me first.html" – a self-contained, offline page shipped with the installer.
const fs = require('fs'), path = require('path');
const dir = __dirname;
let md = fs.readFileSync(path.join(dir, 'guide.md'), 'utf8');
// the Tools section: every "### Name – …" section from tools-*.md, in the order of the panel's rail (later files win)
const sections = {};
for (const f of ['tools-cut.md', 'tools-find.md', 'tools-finish.md', 'tools-story.md', 'tools-broll.md', 'tools-cameras.md', 'tools-colour.md', 'tools-ask.md']) {
  const text = fs.readFileSync(path.join(dir, f), 'utf8');
  for (const part of text.split(/^(?=### )/m)) { const m = /^### ([^–\n]+?) –/.exec(part); if (m) sections[m[1].trim()] = part.trim(); }
}
const ORDER = [[null, ['Story']], ['Selects & clips', ['Selects', 'Subclip Maker', 'MC Selects']], ['Find the good bits', ['Song Splitter']], ['Cut faster', ['Silence Cut', 'Beat Cut', 'B-roll', 'Camera Switch']],
  ['Finish & deliver', ['Colour', 'Safe Zones', 'Sound Check', 'Final Check', 'Deliver']], ['Ask', ['Assistant']]];
const tools = ORDER.map(([group, names]) => (group ? `**${group}**\n\n` : '') + names.map(n => { if (!sections[n]) throw new Error('No guide section for ' + n); return sections[n]; }).join('\n\n')).join('\n\n');
md = md.replace('{{TOOLS}}', tools);
const aiCosts = fs.existsSync(path.join(dir, 'ai-costs.md')) ? fs.readFileSync(path.join(dir, 'ai-costs.md'), 'utf8') : '';
md = md.replace('{{AICOSTS}}', aiCosts);
const whatsNew = fs.existsSync(path.join(dir, 'whats-new.md')) ? fs.readFileSync(path.join(dir, 'whats-new.md'), 'utf8') : '';
md = md.replace('{{WHATSNEW}}', whatsNew);
const version = (fs.readFileSync(path.join(dir, '..', '..', 'CSXS', 'manifest.xml'), 'utf8').match(/ExtensionBundleVersion="([^"]+)"/) || [])[1];

const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const inline = s => esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/(^|[^*\w])\*(?![\s*])([^*]+?)\*(?![*\w])/g, '$1<em>$2</em>').replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
const out = []; let list = null, para = [], table = null;
const cells = l => l.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim());
const flushTable = () => { if (!table) return; const [head, ...rows] = table; out.push(`<table><thead><tr>${head.map(c => `<th>${inline(c)}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${r.map(c => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`); table = null; };
const flush = () => { flushTable(); if (para.length) { out.push(`<p>${inline(para.join(' '))}</p>`); para = []; } if (list) { out.push(`<${list.t}>${list.items.map(i => `<li>${inline(i.text)}${i.sub ? `<ul>${i.sub.map(x => `<li>${inline(x)}</li>`).join('')}</ul>` : ''}</li>`).join('')}</${list.t}>`); list = null; } };
for (const line of md.split('\n')) {
  let m;
  if (/^\s*\|/.test(line)) { if (para.length || list) { const t = table; table = null; flush(); table = t; } if (/^\s*\|[\s:|-]+\|\s*$/.test(line)) continue; (table = table || []).push(cells(line)); continue; }
  if (table) flushTable();
  if (!line.trim()) { flush(); continue; }
  if ((m = /^(#{1,3})\s+(.*)$/.exec(line))) { flush(); const id = m[2].toLowerCase().replace(/[^a-z0-9]+/g, '-'); out.push(`<h${m[1].length} id="${id}">${inline(m[2])}</h${m[1].length}>`); continue; }
  // a bullet indented under a numbered step belongs to that step
  if (list && list.t === 'ol' && (m = /^\s{2,}[-*]\s+(.*)$/.exec(line))) { const last = list.items[list.items.length - 1]; (last.sub = last.sub || []).push(m[1]); continue; }
  if ((m = /^\s*[-*]\s+(.*)$/.exec(line))) { if (para.length) flush(); if (!list || list.t !== 'ul') { flush(); list = { t: 'ul', items: [] }; } list.items.push({ text: m[1] }); continue; }
  if ((m = /^\s*\d+\.\s+(.*)$/.exec(line))) { if (para.length) flush(); if (!list || list.t !== 'ol') { flush(); list = { t: 'ol', items: [] }; } list.items.push({ text: m[1] }); continue; }
  if (list && /^\s{2,}\S/.test(line)) { const last = list.items[list.items.length - 1]; if (last.sub) last.sub[last.sub.length - 1] += ' ' + line.trim(); else last.text += ' ' + line.trim(); continue; }
  if (list) flush();
  para.push(line.trim());
}
flush();
const toc = out.filter(x => x.startsWith('<h2')).map(x => { const m = /id="([^"]+)">(.*?)<\/h2>/.exec(x); return `<a href="#${m[1]}">${m[2]}</a>`; }).join('');
const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>JMG Ultra Studio – read me first</title>
<style>
:root { --bg:#fbfbfd; --text:#1c1c22; --muted:#5d5d6b; --accent:#6a5ae0; --card:#ffffff; --border:#e5e5ee; --code:#f1f0fb; }
@media (prefers-color-scheme: dark) { :root { --bg:#16161b; --text:#ececf1; --muted:#a3a3b2; --accent:#9b8cff; --card:#1f1f26; --border:#30303a; --code:#2a2840; } }
* { box-sizing: border-box; } body { margin:0; background:var(--bg); color:var(--text); font:16px/1.6 -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif; }
header { padding:40px 20px 28px; background:linear-gradient(135deg,#7c6cf0,#c45cff); color:#fff; }
header .wrap { max-width:820px; margin:0 auto; display:flex; gap:16px; align-items:center; }
.mark { width:56px; height:56px; border-radius:15px; background:rgba(255,255,255,.18); display:grid; place-items:center; font-weight:800; font-size:24px; flex:none; }
header h1 { margin:0; font-size:28px; } header p { margin:2px 0 0; opacity:.9; }
nav { max-width:820px; margin:18px auto 0; padding:0 20px; display:flex; flex-wrap:wrap; gap:6px; }
nav a { font-size:14px; padding:4px 10px; border:1px solid var(--border); border-radius:99px; color:var(--text); text-decoration:none; background:var(--card); }
main { max-width:820px; margin:0 auto; padding:10px 20px 60px; }
h2 { margin:38px 0 10px; font-size:22px; padding-top:6px; border-top:1px solid var(--border); }
h3 { margin:26px 0 6px; font-size:18px; color:var(--accent); }
p, li { color:var(--text); } ul, ol { padding-left:22px; } li { margin:4px 0; }
code { background:var(--code); padding:1px 6px; border-radius:5px; font-size:.9em; word-break:break-word; }
strong { font-weight:650; } a { color:var(--accent); }
table { border-collapse:collapse; width:100%; margin:12px 0; font-size:14px; } th, td { text-align:left; padding:7px 10px; border-bottom:1px solid var(--border); vertical-align:top; } th { color:var(--muted); font-weight:600; }
footer { color:var(--muted); font-size:13px; text-align:center; padding:20px; }
</style></head><body>
<header><div class="wrap"><div class="mark">JU</div><div><h1>JMG Ultra Studio</h1><p>Your editing tools inside Premiere Pro and DaVinci Resolve Studio · version ${version}</p></div></div></header>
<nav>${toc}</nav>
<main>${out.join('\n')}</main>
<footer>JMG Ultra Studio ${version} · works offline · nothing is uploaded</footer>
</body></html>`;
fs.writeFileSync(path.join(dir, 'Read me first.html'), html);
console.log('Wrote', path.join(dir, 'Read me first.html'), html.length, 'bytes');
