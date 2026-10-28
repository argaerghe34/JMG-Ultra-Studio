// JMG Ultra Studio – Resolve side: connects to Resolve and gathers the commands from every resolve/host/*.js.
// Each module exports (R) => ({ commandName(args) { … } }) – the same names, arguments and results as jsx/ for
// Premiere. A command may be async. It throws R.err(CODE, detail) for plain errors (codes: js/core/host.js CATALOG).
'use strict';
const fs = require('fs'), path = require('path');
const makeBase = require('./base');

const PLUGIN_ID = 'com.jmgphotography.ultrastudio';

/** Resolve's own module ships with Resolve Studio; the installer copies it next to the plugin. */
function resolveApi(pluginDir) {
  const where = [path.join(pluginDir, 'WorkflowIntegration.node'), path.join(pluginDir, 'resolve', 'plugin', 'WorkflowIntegration.node')];
  const file = where.find(f => fs.existsSync(f));
  if (!file) throw Object.assign(new Error('WorkflowIntegration.node is missing'), { usCode: 'HOST_SCRIPT', usTitle: 'Ultra Studio isn’t fully installed in Resolve.', usAction: 'Run the installer again, then restart Resolve.' });
  const WI = require(file);
  if (!WI.Initialize(PLUGIN_ID)) throw Object.assign(new Error('WorkflowIntegration.Initialize failed'), { usCode: 'HOST_SCRIPT', usTitle: 'Resolve didn’t let Ultra Studio connect.', usAction: 'Open Ultra Studio from Workspace › Workflow Integrations in DaVinci Resolve Studio.' });
  const api = WI.GetResolve();
  if (!api) throw Object.assign(new Error('GetResolve returned nothing'), { usCode: 'HOST_SCRIPT' });
  return { api, cleanUp: () => { try { WI.CleanUp(); } catch (e) { /* closing */ } } };
}

/** Every command module in this folder (not base/index, not dot-files such as macOS ._ files). */
function modules(dir) {
  return fs.readdirSync(dir).filter(f => f.endsWith('.js') && f[0] !== '.' && f !== 'base.js' && f !== 'index.js').sort();
}

/**
 * connect({pluginDir}) in the panel, or connect({api}) with a stand-in Resolve for unit tests.
 * Returns {run(name, args) → Promise<{ok, data} | {ok:false, error}>, fns, modules, R}.
 */
function connect({ pluginDir, api } = {}) {
  let cleanUp = () => {};
  if (!api) ({ api, cleanUp } = resolveApi(pluginDir));
  const R = makeBase(api);
  const fns = {};
  const files = modules(__dirname);
  for (const f of files) {
    const add = require(path.join(__dirname, f))(R, fns);
    for (const [name, fn] of Object.entries(add || {})) {
      if (fns[name]) throw new Error(`Two Resolve commands are called ${name} (${f})`);
      fns[name] = fn;
    }
  }
  fns.listFns = () => Object.keys(fns).sort();

  // one command at a time, like ExtendScript
  let chain = Promise.resolve();
  function run(name, args) {
    const p = chain.then(async () => {
      try {
        const f = fns[name];
        if (!f) throw R.err('HOST_SCRIPT', 'Unknown Resolve command: ' + name);
        R.fresh();
        const data = await f(args || {});
        return { ok: true, data: data === undefined ? null : data };
      } catch (e) {
        return { ok: false, error: { code: e.usCode || 'UNKNOWN', title: e.usTitle, action: e.usAction, detail: String((e && (e.stack || e.message)) || e).slice(0, 2000) } };
      }
    });
    chain = p.catch(() => {});
    return p;
  }
  return { run, fns, modules: files.length + 1, R, cleanUp };
}

module.exports = { connect, PLUGIN_ID };
