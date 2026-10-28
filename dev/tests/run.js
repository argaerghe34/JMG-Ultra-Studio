// Runs every dev/tests/*.test.js (or the ones named on the command line). Exit code 1 if any test fails.
const fs = require('fs'), path = require('path');
const H = require('./harness');
const only = process.argv.slice(2);
const files = fs.readdirSync(__dirname).filter(f => f.endsWith('.test.js') && (!only.length || only.some(o => f.includes(o))));
(async () => {
  let pass = 0, fail = 0;
  for (const f of files) {
    const before = H.tests.length;
    require(path.join(__dirname, f));
    for (const t of H.tests.slice(before)) {
      const t0 = Date.now();
      // the stand-in Resolve saw a value that could abort real Resolve (even if the host code caught the throw)
      const aborts = () => { const fake = require.cache[require.resolve('./resolve-fake')]; return fake ? fake.exports.crashes.splice(0) : []; };
      aborts();
      try {
        await t.fn();
        const bad = aborts();
        if (bad.length) throw new Error('Sent to Resolve, would abort it: ' + bad.slice(0, 5).join(' | '));
        pass++; console.log(`  ✓ ${f.replace('.test.js', '')} › ${t.name} (${Date.now() - t0} ms)`); }
      catch (e) { fail++; console.log(`  ✗ ${f.replace('.test.js', '')} › ${t.name}\n      ${String(e && e.stack || e).split('\n').slice(0, 4).join('\n      ')}`); }
    }
  }
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
