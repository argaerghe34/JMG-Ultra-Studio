/* JMG Ultra Studio – Advanced: a home for the niche tools (US.ADVANCED_TOOLS), so the rail stays short, and an
   "In development" folder with the tools still being made (US.PAUSED_TOOLS). Each opens from here; the tool's screen
   has a "‹ Advanced" link back (js/core/app.js). */
(function () {
  'use strict';
  const US = window.US, h = US.h, ui = US.ui;

  const card = d => h('button.tile', { onclick: () => US.tools.open(d.id), dataset: { tool: d.id } },
    h('div.tool-icon', US.icon(d.icon, 17)), h('div', h('div.tile-name', d.name), h('div.tile-blurb', d.blurb || '')));

  US.tools.register({
    id: 'advanced', name: 'Advanced', icon: 'folder', order: 38,
    blurb: 'More tools for particular jobs – Selects, subclips, takes, songs, podcasts – and the ones still in development.',
    create() {
      const v = ui.toolView({ icon: 'folder', title: 'Advanced', blurb: 'More tools for particular jobs. Open one here; its screen has a link back.' });
      const body = h('div');
      v.body.appendChild(body);
      function draw() {
        US.clear(body);
        const tools = US.ADVANCED_TOOLS.map(id => US.tools.get(id)).filter(Boolean);
        body.appendChild(tools.length ? h('div.tiles', tools.map(card)) : ui.empty({ icon: 'info', title: 'Nothing here yet.' }));
        const dev = US.PAUSED_TOOLS.map(id => US.tools.get(id)).filter(Boolean);
        if (dev.length) body.appendChild(h('div', { dataset: { section: 'in-development' } }, ui.section('In development', [
          ui.note('These are still being made: some parts may not work yet, and the Assistant doesn’t use them. Try them on a copy.', 'warn'),
          h('div.tiles', dev.map(card))
        ], { open: false, hint: dev.map(d => d.name).join(', ') })));
      }
      draw();
      return { el: v.el, onShow: draw };
    }
  });
})();
