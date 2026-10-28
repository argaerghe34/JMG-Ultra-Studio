// Development only: devEval runs a snippet against Resolve with R, to probe what Resolve really does. It exists only
// when the plugin was started from the dev link (a "debug" file next to main.js – dev/resolve/link-dev.sh); the
// shipped plugin has no debug file, so it has no such command.
'use strict';
const fs = require('fs'), path = require('path');
module.exports = (R) => {
  // the plugin's main.js: Resolve starts Electron with it as the first argument
  const mains = [require.main && require.main.filename, process.argv[1]].filter(Boolean);
  if (!mains.some(m => fs.existsSync(path.join(path.dirname(m), 'debug')))) return {};
  return { devEval: async a => new Function('R', 'require', `return (async () => { ${a.code} })()`)(R, require) };
};
