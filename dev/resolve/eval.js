// Development: run a snippet against Resolve inside the plugin (resolve/host/zz-dev.js). Usage: node dev/resolve/eval.js <file|->
// The snippet gets R (resolve/host/base.js) and require, and returns a JSON-able value.
const fs = require('fs'), path = require('path'), cp = require('child_process');
const code = fs.readFileSync(process.argv[2] === '-' || !process.argv[2] ? 0 : process.argv[2], 'utf8');
const tmp = path.join(require('os').tmpdir(), 'us-deveval.js');
fs.writeFileSync(tmp, `const r = await require('electron').ipcRenderer.invoke('ultra-studio:run', 'devEval', ${JSON.stringify({ code })}); return r;`);
process.stdout.write(cp.execFileSync(process.execPath, [path.join(__dirname, '..', 'cep.js'), '8892', 'js', tmp], { encoding: 'utf8' }));
