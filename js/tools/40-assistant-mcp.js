/* JMG Ultra Studio – Ask with the Premiere MCP (prototype, 23 Nov 2026).
   When the editor has the Premiere Pro MCP installed (npm premiere-pro-mcp, set up for Claude Code or in Settings),
   every Ask chat gets two more tools, so the AI can reach the ~400 things that server can do in Premiere – the ones
   Ultra Studio's own commands don't cover (Premiere's own transcripts, effects and keyframes, scene edits, timeline
   checks, guarded slips and slides…):
   - mcp.find: which MCP tools fit a job, with their arguments (from the server's own list – free, nothing changes);
   - mcp.call: run one. One that only reads (the server marks each) runs at once; one that changes anything shows the
     approval card first, like every other change in Ask, and the journal says it can't be undone from here.
   What goes back to the AI is text only (US.mcp.asText): pictures and sound in an answer are left out, and the tools
   that would send footage anywhere (capture_frame, transcribe_audio, Adobe's cloud transcription) are never offered.
   Premiere only: Resolve 21.1 has its own MCP server (File › Setup AI Assistants) – a later step. */
(function () {
  'use strict';
  const US = window.US;
  if (!US) return;
  const clip = (s, n) => { s = String(s == null ? '' : s); return s.length > n ? s.slice(0, n) + '…' : s; };
  const M = () => US.mcp;
  const inPremiere = () => !(US.app && US.app.is && US.app.is('resolve'));
  const known = new Map();   // name -> tool (from the server's list), for risk and the card
  // only the tools that can run here: the MCP has a UXP plugin and a CEP panel, and the editor may have installed one
  async function list() { const ts = await M().tools(); for (const t of ts) known.set(t.name, t); return M().usable(); }
  const T = {};

  T['mcp.find'] = {
    available: () => inPremiere() && !!M() && M().configured(),
    hands: false,
    desc: 'Find tools of the Premiere Pro MCP (installed by the editor; ~400 Premiere operations Ultra Studio’s own tools don’t have: Premiere’s own transcripts, effects and keyframes, scene edits, track and clip details, timeline checks, slips/slides/rolls, captions tracks…): args {"query":"a few keywords, e.g. transcript search"}. Lists the best matches with their arguments (* = required) and whether each only reads. Free; nothing changes. Then run one with mcp.call.',
    risk: 'read', title: a => `Look for Premiere MCP tools: “${clip(a.query, 40)}”`,
    run: async (a, x) => {
      const ts = await list(), hits = M().rank(ts, a.query, 10);
      x.note(`${hits.length} MCP tool${hits.length === 1 ? '' : 's'} for “${clip(a.query, 30)}”`);
      if (!hits.length) return `No Premiere MCP tool matches “${a.query}”. Try other words (the server has ${ts.length}).`;
      return `Premiere MCP tools for “${a.query}” (name – reads only / CHANGES – what it does – args):\n` + hits.map(t => `${t.name} – ${M().readsOnly(t) ? 'reads only' : 'CHANGES the project'} – ${clip((t.description || '').replace(/\s+/g, ' '), 260)} – args: ${M().argsLine(t) || '(none)'}`).join('\n') +
        '\nUse times and ids exactly as the tools return them; inspect before you change anything.';
    }
  };

  T['mcp.call'] = {
    available: () => inPremiere() && !!M() && M().configured(),
    hands: false,
    desc: 'Run one Premiere Pro MCP tool you found with mcp.find: args {"tool":"inspect_sequence_structure_uxp","args":{…its arguments…}}. A tool that only reads runs at once; one that changes the project is shown to the editor to approve first. The answer comes back as text (pictures and sound are left out).',
    risk: a => { const t = known.get(String(a && a.tool)); return t && M().readsOnly(t) ? 'read' : 'own'; },
    title: a => `Premiere MCP: ${clip(a.tool, 50)}`,
    detail: a => `Runs “${a.tool}” in the Premiere Pro MCP with ${clip(JSON.stringify(a.args || {}), 300)}. Ultra Studio can’t undo it – use Premiere’s Edit › Undo.`,
    before: async a => {
      const name = String(a.tool || '');
      if (!name) return { error: 'ERROR: give "tool" (find one with mcp.find).' };
      if (M().NEVER.test(name)) return { error: `ERROR: Ultra Studio doesn’t run “${name}” (it would open or close projects, run code, or send footage off this computer).` };
      if (!known.size) await list();
      if (!known.has(name)) return { error: `ERROR: the Premiere MCP has no tool “${name}” – find one with mcp.find.` };
      { const r = await M().reachable(); if (!M().canRun(r.backends.get(name), r.live)) return { error: `ERROR: “${name}” needs the MCP’s ${(r.backends.get(name) || []).includes('cep') ? 'CEP panel' : 'UXP plugin'}, which isn’t connected in this Premiere – find another tool with mcp.find (it lists only ones that can run).` }; }
      if (a.args != null && typeof a.args !== 'object') return { error: 'ERROR: "args" must be an object.' };
      return { state: { name } };
    },
    run: async (a, x) => {
      const t = known.get(a.tool), r = await M().call(a.tool, a.args || {});
      if (!M().readsOnly(t) && x.journal) x.journal({ kind: 'cant', text: `Premiere MCP “${a.tool}” changed the project (undo it in Premiere with Edit › Undo)` });
      x.note(`${a.tool}${r.isError ? ' – failed' : ''} (${r.ms} ms)`);
      return `${r.isError ? 'ERROR from ' : ''}${a.tool}:\n${r.text || '(no text)'}`;
    }
  };

  US.chatTools = Object.assign(US.chatTools || {}, T);
  US.chatMcp = { tools: T, known };
})();
