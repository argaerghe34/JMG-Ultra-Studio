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
      if (M().level() === 'look' && !M().readsOnly(known.get(name))) return { error: `ERROR: the Premiere MCP is set to look only (Settings › Premiere MCP), so “${name}” can’t change anything – use Ultra Studio’s own tools, or tell the editor.` };
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

  /* ---------- the MCP's checks on Ask's own edits ----------
     Ask › Edit runs its plan on a copy and reads it back. With the Premiere MCP it also gets a second, independent
     opinion: what exactly changed on the timeline (diff_sequence_snapshots), any NEW problem the edit made – flash
     frames, gaps, overlaps, picture without sound (audit_timeline_health, before and after) – and, with the MCP's CEP
     panel, its exact tick-level checks: predict_timeline_edit before a delete or cut, and verify_timeline_postconditions
     afterwards (for edits that shouldn't move any clip – effects, transitions, volume, names – the timeline must be
     unchanged). All of it reads only, and nothing here goes to an AI except as text in Ask's own check. */
  const MOVES = /^(remove|razor|speed|text|append|move|insert|sequence|trim|extend|freeze)$/;
  const parse = r => (r && r.data && (r.data.result || r.data.data || r.data)) || null;
  async function uxpSnapshot(seqId) {
    let r = seqId ? await M().callJSON('inspect_sequence_structure_uxp', { sequence_id: String(seqId), include_source_project_items: true }) : null;
    if (!r || !r.ok) r = await M().callJSON('inspect_sequence_structure_uxp', { include_source_project_items: true });
    const d = parse(r);
    if (!r.ok || !d || !Array.isArray(d.tracks)) throw new Error('the MCP didn’t read the sequence: ' + String(r.text || '').slice(0, 160));
    const sq = d.sequence || {};
    let fps; try { fps = seqId ? (await US.host.call('sequenceInfo', { seqId })).fps : undefined; } catch (e) { fps = undefined; }
    return Object.assign({ sequence_id: String(sq.id || d.sequenceId || seqId || 'seq'), name: String(sq.name || d.name || ''), tracks: d.tracks }, fps > 0 && fps <= 240 ? { frame_rate: Math.round(fps * 1000) / 1000 } : {});
  }
  async function cepSnapshot(seqId) {
    const r = await M().callJSON('inspect_timeline_snapshot', { sequence_id: String(seqId) }), d = parse(r);
    const snap = d && (d.snapshot || (Array.isArray(d.clips) && Array.isArray(d.tracks) ? d : null));
    return r.ok && snap ? snap : null;
  }
  /** Ask's timeline targets → the MCP's typed operations on the exact snapshot (removes and cuts only), or null. */
  function operationsFor(snap, steps) {
    const ops = [], tps = Number((snap.time_base || {}).ticks_per_second) || 254016000000;
    const sec = t => Number(t) / tps;
    for (const st of steps) {
      if (st.op !== 'remove' && st.op !== 'razor') continue;
      for (const t of st.targets || []) {
        const tr = (snap.tracks || []).find(k => k.type === t.kind && Number(k.index) === Number(t.track));
        if (!tr) return null;
        if (st.op === 'remove') {
          const c = (snap.clips || []).find(x => x.track_id === tr.id && Math.abs(sec(x.start_ticks) - t.start) < 0.05);
          if (!c) return null;
          ops.push({ type: 'remove', clip_id: c.id, ripple: !!(st.params && st.params.ripple), scope: 'track' });
        } else for (const at of [t.start, t.end]) {
          const c = (snap.clips || []).find(x => x.track_id === tr.id && sec(x.start_ticks) < at - 0.01 && sec(x.end_ticks) > at + 0.01);
          if (c) ops.push({ type: 'split', clip_id: c.id, at_ticks: String(Math.round(at * tps)), right_id: c.id + ':r' + ops.length });
        }
      }
    }
    return ops.length ? ops : null;
  }
  /** The MCP's refusal to predict, in plain words. */
  const whyNot = t => { t = String(t || ''); return /LINKED_EDIT_REQUIRES_GROUP/.test(t) ? 'picture and sound are linked, and its prediction doesn’t cover linked clips yet' : /STRADDLING|SPLIT_SEMANTICS|MINIMUM_VISIBLE/.test(t) ? 'the cut lands where its prediction can’t follow (a speed change, an effect, or less than a frame)' : t.replace(/^Error:\s*/, '').slice(0, 160); };
  const findingsOf = d => { const x = d && (d.findings || d.issues || (d.audit && d.audit.findings)); return Array.isArray(x) ? x : []; };
  const fKey = f => `${f.type || f.kind || f.code || f.category || '?'}@${f.timecode || f.start_timecode || f.at || f.start_seconds || ''}@${f.track || f.track_index || ''}`;
  const fName = f => String(f.type || f.kind || f.code || f.category || 'problem').replace(/_/g, ' ');

  async function canCheck() {
    if (!M() || !inPremiere() || !M().configured() || US.settings.get('mcp.checkEdits', true) === false) return null;
    try { const r = await M().reachable(); return r.live.uxp || r.live.cep ? r.live : null; } catch (e) { return null; }
  }
  /** Before Ask's edits run on seqId: the timeline as it is (and, with CEP, the MCP's prediction). -> state or null */
  async function before(seqId, steps) {
    const live = await canCheck(); if (!live) return null;
    const t0 = Date.now(), pre = { seqId, steps, live, moves: steps.some(s => MOVES.test(s.op)) };
    pre.errors = [];
    try { if (live.uxp) pre.snap = await uxpSnapshot(seqId); } catch (e) { pre.snap = null; pre.errors.push('snapshot: ' + (e.message || e)); }
    if (live.cep) {
      try {
        pre.canon = await cepSnapshot(seqId);
        const ops = pre.canon && operationsFor(pre.canon, steps);
        if (ops) {
          const p = await M().callJSON('predict_timeline_edit', { snapshot: pre.canon, operations: ops }), d = parse(p);
          if (p.ok && d && (d.predicted || d.snapshot || d.expected)) pre.predicted = d.predicted || d.snapshot || d.expected;
          else pre.predictWhy = whyNot((d && typeof d === 'object' && (d.error || d.message)) || p.text);
        }
      } catch (e) { pre.predictWhy = whyNot(e.message || e); }
    }
    pre.ms = Date.now() - t0;
    return pre.snap || pre.canon ? pre : null;
  }
  /** After: what changed, new problems, and the exact check. -> {text (for Ask's own check), problems, unexpected, log} */
  async function after(pre) {
    if (!pre) return null;
    const out = { lines: [], problems: [], unexpected: [], t0: Date.now() };
    try {
      if (pre.snap) {
        const now = await uxpSnapshot(pre.seqId);
        if (!now) out.lines.push('(The MCP couldn’t read the timeline after the edit.)');
        if (now) {
          const d = parse(await M().callJSON('diff_sequence_snapshots', { before: pre.snap, after: now }));
          const ch = d && (d.changes || d.clipChanges || []), counts = {};
          if (d && d.summary && typeof d.summary === 'object') { for (const [k, n] of Object.entries(d.summary)) if (n > 0 && !/^(unchanged|changed_clips)$/.test(k)) counts[k.replace(/_/g, ' ')] = n; }
          else if (Array.isArray(ch)) for (const c of ch) { const k = c.type || c.kind || c.change || 'changed'; counts[k] = (counts[k] || 0) + 1; }
          out.changes = counts; if (d && Array.isArray(d.edl_like_lines)) out.edl = d.edl_like_lines.slice(0, 20);
          const said = Object.entries(counts).map(([k, n]) => `${n} ${k}`).join(', ');
          out.lines.push(`What changed on the timeline (the Premiere MCP compared it before and after): ${said || 'no clip was added, removed, moved or trimmed'}.`);
          if (!pre.moves && Object.keys(counts).some(k => /add|remov|mov|trim|retim/i.test(k))) out.unexpected.push(`clips ${Object.keys(counts).join(', ')} although the plan shouldn’t move any`);
          const [a0, a1] = await Promise.all([M().callJSON('audit_timeline_health', { snapshot: pre.snap }), M().callJSON('audit_timeline_health', { snapshot: now })]);
          const had = new Set(findingsOf(parse(a0)).map(fKey)), fresh = findingsOf(parse(a1)).filter(f => !had.has(fKey(f)));
          out.problems = fresh.filter(f => f.severity !== 'info').map(f => f.message ? String(f.message).slice(0, 160) : `${fName(f)}${f.timecode ? ' at ' + f.timecode : ''}`).slice(0, 12);
          const sc = parse(a1); if (sc && sc.score != null) out.score = sc.score;
          out.lines.push(out.problems.length ? `New problems the edit made (the MCP's timeline check): ${out.problems.join('; ')}.` : 'The MCP’s timeline check found no new problem (flash frames, gaps, overlaps, picture without sound).');
        }
      }
      if (pre.canon) {
        const expected = pre.predicted || (!pre.moves ? pre.canon : null);
        if (expected) {
          const now = await cepSnapshot(pre.seqId);
          if (now) {
            const v = await M().callJSON('verify_timeline_postconditions', { expected, actual: now }), d = parse(v);
            const disc = d && (d.discrepancies || d.mismatches || []);
            out.verified = v.ok && !!d && d.verified === true && Array.isArray(disc) && !disc.length;
            if (Array.isArray(disc) && disc.length) out.unexpected.push(...disc.slice(0, 6).map(x => String(x.message || x.code || x.kind || JSON.stringify(x)).slice(0, 140)));
            out.lines.push(out.verified ? `The MCP’s exact check: the timeline is as ${pre.predicted ? 'predicted' : 'before – no clip moved'}.` : `The MCP’s exact check found differences: ${out.unexpected.join('; ') || (v.text || '').slice(0, 200)}.`);
          }
        } else if (pre.predictWhy) out.lines.push(`(The MCP couldn’t predict these cuts exactly: ${pre.predictWhy})`);
      }
    } catch (e) { out.lines.push(`(The Premiere MCP’s check didn’t finish: ${String(e.message || e).slice(0, 160)})`); }
    if (pre.errors.length) out.lines.push(`(${pre.errors.join('; ').slice(0, 200)})`);
    out.ms = pre.ms + (Date.now() - out.t0);
    out.text = out.lines.join('\n');
    US.log(out.problems.length || out.unexpected.length ? 'warn' : 'ok', `Ask › Edit: the Premiere MCP checked the result (${(out.ms / 1000).toFixed(1)} s)`, out.text, 'assistant');
    return out;
  }
  US.mcpCheck = { before, after, operationsFor, MOVES };

  /* ---------- Settings › Premiere MCP ---------- */
  function settingsSection() {
    const ui = US.ui, h = US.h, box = h('div.mcp-settings');
    const set = (k, v) => { US.settings.set('mcp.' + k, v); };
    const restart = () => { if (M()) M().stop(); known.clear(); };
    let st = null, busy = false;
    async function look(force) {
      busy = true; draw();
      try { st = await M().status({ force }); } catch (e) { st = { error: String(e.message || e) }; }
      busy = false; draw();
    }
    function line(label, ok, text) { return h('div.row', h('span', { style: { width: '1.2em', color: ok ? 'var(--ok, #3a3)' : 'var(--warn, #c80)' } }, ok ? '✓' : '•'), h('b', label + ': '), h('span.grow', text)); }
    function draw() {
      US.clear(box);
      if (!M()) { box.append(ui.note('The Premiere MCP connection isn’t in this copy.', 'warn')); return; }
      const cfg = M().config(), cep = M().cepInstalled();
      box.append(h('div.field-hint', 'The Premiere Pro MCP (npm premiere-pro-mcp) lets Ask reach about 400 things Premiere can do that Ultra Studio’s own commands don’t: Premiere’s own transcripts, effects and keyframes, marker colours, scene edits, exact timeline checks. Ultra Studio starts its own copy of it. Only text goes to the AI; the tools that would send pictures or sound anywhere are never offered.'));
      if (!cfg) { box.append(ui.note('No Premiere MCP is set up on this computer. Install it (npm install -g premiere-pro-mcp) and add it to Claude Code; Ultra Studio then finds it by itself.', 'info')); return; }
      box.append(
        ui.toggle({ label: 'Use the Premiere MCP', hint: 'Off: Ask, Story and the edit checks work without it, as before.', value: M().enabled(), onChange: x => { set('enabled', x); restart(); look(true); } }),
        ui.field('What it may do', ui.segmented({ options: [{ value: 'look', label: 'Look only', title: 'Read the project and timeline; nothing is changed through the MCP' }, { value: 'edit', label: 'Look and edit', title: 'Changes are shown to you to approve first, every time' }], value: M().level(), onChange: x => { set('level', x); restart(); look(true); } }),
          'Look and edit: every change through the MCP is shown on Ask’s approval card first. Ultra Studio can’t undo those – use Premiere’s Edit › Undo.'),
        ui.toggle({ label: 'Check Ask’s edits with it', hint: 'After Ask › Edit runs, the MCP compares the timeline before and after and looks for new flash frames, gaps or picture without sound. Reads only.', value: US.settings.get('mcp.checkEdits', true) !== false, onChange: x => set('checkEdits', x) }),
        ui.toggle({ label: 'Story reads Premiere’s transcripts through it', hint: 'Live, with the speaker names – the project isn’t saved for it. Off: Story saves the project and reads the transcripts from the file.', value: US.settings.get('mcp.storyTranscripts', true) !== false, onChange: x => set('storyTranscripts', x) }));
      if (!M().enabled()) return;
      const s = st || {};
      box.append(h('div.field-label', 'Status'),
        line('Found', true, `set up ${cfg.from === 'Settings' ? 'in Settings' : 'for Claude Code'}${s.version ? ` · version ${s.version}` : ''}`),
        busy ? h('div.field-hint', 'Looking…') : null,
        st && !busy ? line('UXP plugin', !!(s.live && s.live.uxp), s.live && s.live.uxp ? 'connected' : 'not answering – in Premiere, Window › UXP Plugins › MCP for Adobe Premiere Pro') : null,
        st && !busy ? line('CEP panel', !!(s.live && s.live.cep), s.live && s.live.cep ? 'connected' : cep ? 'installed, not answering – restart Premiere' : 'not installed – about 300 of its tools need it') : null,
        st && !busy && !s.error ? line('Tools', s.usable > 0, `${s.usable} of ${s.tools} can run here`) : null,
        s.error && !busy ? ui.note('It didn’t start: ' + s.error, 'warn') : null,
        h('div.row', h('span.grow'),
          !cep ? ui.button('Install the CEP panel…', { small: true, onClick: installCep }) : null,
          ui.button(busy ? 'Testing…' : 'Test', { small: true, kind: 'primary', disabled: busy, onClick: () => look(true) })));
    }
    async function installCep() {
      const ok = await US.ui.confirm({ title: 'Install the MCP’s CEP panel?', text: 'This runs the MCP’s own installer (premiere-pro-mcp --install-cep): it adds a panel to Premiere (Window › Extensions › MCP for Adobe Premiere Pro) and switches on Adobe’s setting that lets panels like Ultra Studio run. It unlocks about 300 more of the MCP’s tools. Premiere needs restarting afterwards.', ok: 'Install' });
      if (!ok) return;
      busy = true; draw();
      const r = await M().installCep();
      busy = false;
      US.log(r.ok ? 'ok' : 'warn', r.ok ? 'Installed the Premiere MCP’s CEP panel' : 'The Premiere MCP’s CEP panel didn’t install', r.text, 'settings');
      US.ui.toast(r.ok ? { type: 'ok', title: 'The CEP panel is installed', text: 'Restart Premiere to use it.' } : { type: 'warn', title: 'The CEP panel didn’t install', text: 'The activity log (☰) has what the installer said.' });
      draw();
    }
    draw();
    if (M() && M().config() && M().enabled()) look(false);
    return box;
  }
  if (inPremiere() && US.settingsSections) US.settingsSections.register({ id: 'mcp', title: 'Premiere MCP', order: 37, create: settingsSection });
})();
