/* JMG Ultra Studio – the quick start guide in the panel (the user's note 57, 19 Nov 2026).
   One source: QUICKSTART.md at the repository root – the same page GitHub shows. The packages copy it to
   docs/QUICKSTART.md (dev/build.sh, dev/win/build.js, dev/resolve/build.js); the development copy reads it from the root.
   It is read when opened and shown as simple HTML in a modal (US.ui), in Premiere and in Resolve alike. The text is
   written for both editors, so it is shown as it is (US.keep), never put in Resolve's words.
   Opened from Settings › Quick start (99-settings.js) and from Search (⌘K). dev/tests/quickstart.test.js checks that
   every tab and button it names still exists. */
(function () {
  'use strict';
  const US = window.US, h = US.h, ui = US.ui;
  const K = t => US.keep(t);

  /** Where the guide is: the package's docs folder, else the development copy's root. -> path or null */
  function file() {
    try {
      const path = require('path'), fs = require('fs'), dir = US.host.extensionDir();
      const list = [path.join(dir, 'docs', 'QUICKSTART.md'), path.join(dir, 'QUICKSTART.md')];
      // Resolve's development link has only links to the repository's folders (dev/ among them): the root is dev/'s parent
      try { list.push(path.join(path.dirname(fs.realpathSync(path.join(dir, 'dev'))), 'QUICKSTART.md')); } catch (e) { /* a package: no dev/ */ }
      return list.find(f => fs.existsSync(f)) || null;
    } catch (e) { return null; }
  }
  function read() { const f = file(); return f ? require('fs').readFileSync(f, 'utf8') : ''; }

  /** **bold**, `code` and [text](url) in a line -> nodes. */
  function inline(text) {
    const out = [], re = /\*\*(.+?)\*\*|`([^`]+)`|\[([^\]]+)\]\(([^)]+)\)/g;
    let last = 0, m;
    while ((m = re.exec(text))) {
      if (m.index > last) out.push(K(text.slice(last, m.index)));
      if (m[1] != null) out.push(h('b', inline(m[1])));
      else if (m[2] != null) out.push(h('span.mono', K(m[2])));
      else { const url = m[4]; out.push(h('a', { href: '#', onclick: e => { e.preventDefault(); US.app.openUrl(url); } }, K(m[3]))); }
      last = re.lastIndex;
    }
    if (last < text.length) out.push(K(text.slice(last)));
    return out;
  }
  /** The guide's Markdown (headings, paragraphs, - and 1. lists) -> one element. */
  function render(md) {
    const root = h('div.quickstart'), lines = String(md || '').replace(/\r/g, '').split('\n');
    let list = null, para = [];
    const flush = () => {
      if (para.length) { root.appendChild(h('p', inline(para.join(' ')))); para = []; }
      list = null;
    };
    for (const line of lines) {
      let m;
      if (!line.trim()) { flush(); continue; }
      if ((m = /^(#{1,3})\s+(.*)$/.exec(line))) { flush(); if (m[1].length > 1) root.appendChild(h('div.card-title', inline(m[2]))); continue; }   // the page's own # title is the modal's
      if ((m = /^\s*(?:([-*])|\d+\.)\s+(.*)$/.exec(line))) {
        if (para.length) { root.appendChild(h('p', inline(para.join(' ')))); para = []; }
        const tag = m[1] ? 'ul' : 'ol';
        if (!list || list.tagName.toLowerCase() !== tag) { list = h(tag); root.appendChild(list); }
        list.appendChild(h('li', inline(m[2])));
        continue;
      }
      if (list && /^\s{2,}\S/.test(line)) { list.lastChild.append(' ', ...inline(line.trim())); continue; }
      list = null;
      para.push(line.trim());
    }
    flush();
    return root;
  }
  /** Show the guide in a modal. -> the promise of the modal (resolves when it's closed) */
  function open() {
    const md = read();
    const body = md ? render(md) : ui.note('The quick start guide isn’t in this copy. It’s QUICKSTART.md on the GitHub page.', 'warn');
    return ui.modal({ title: 'Quick start', body, wide: true, buttons: [{ label: 'Close', value: true, kind: 'primary' }] });
  }
  /** The card at the top of Settings. */
  function card() {
    return h('div', { dataset: { section: 'quickstart' } }, ui.card(h('div.card-title', 'Quick start'),
      h('div.muted', 'New here? Five minutes: install, open the panel, the first five things to try, and what stays on this computer.'),
      h('div.row', ui.button('Open the quick start', { kind: 'primary', icon: 'info', onClick: open }))));
  }

  US.quickstart = { file, read, render, open, card };

  // Search (⌘K)
  if (US.search) US.search.add(() => [{ kind: 'help', id: 'help:quickstart', title: 'Quick start', detail: 'Five minutes: install, open, the first things to try', icon: 'info', words: 'help guide start begin getting started new quickstart install', boost: 45, run: open }]);
})();
