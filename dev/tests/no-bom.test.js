// Files that ship carry no byte-order mark: a manifest or script saved on Windows with one (PowerShell's
// Set-Content -Encoding UTF8 adds it) made the Mac installer and the updater think the manifest had changed, so they
// asked for Premiere to be quit (found in 1.3.35). Save as UTF-8 without BOM.
const assert = require('assert');
const fs = require('fs'), path = require('path');
const { test } = require('./harness');
const ROOT = path.join(__dirname, '..', '..');

function walk(dir, out) {
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, f.name);
    if (f.isDirectory()) { if (f.name !== 'node_modules' && !f.name.startsWith('.')) walk(p, out); } else if (/\.(js|jsx|json|xml|html|css|md|command|bat|ps1|sh)$/i.test(f.name)) out.push(p);
  }
  return out;
}

test('no shipped file starts with a byte-order mark', () => {
  const files = ['CSXS', 'js', 'jsx', 'css', 'resolve', 'dev/installer', 'dev/resolve/installer', 'dev/docs'].flatMap(d => walk(path.join(ROOT, d), [])).concat([path.join(ROOT, 'index.html')]);
  assert.ok(files.length > 50, 'files found: ' + files.length);
  const bom = files.filter(f => { const b = fs.readFileSync(f); return b[0] === 0xEF && b[1] === 0xBB && b[2] === 0xBF; }).map(f => path.relative(ROOT, f));
  assert.deepStrictEqual(bom, [], 'save these as UTF-8 without BOM: ' + bom.join(', '));
});

test('the updater sees a manifest saved with a BOM and Windows line endings as unchanged', () => {
  const src = fs.readFileSync(path.join(ROOT, 'js/tools/98-update.js'), 'utf8');
  const m = /const stripVer = f => \{ try \{ return (fs\.readFileSync\(f, 'utf8'\)[^;]*); \}/.exec(src);
  assert.ok(m, 'stripVer found');
  const stripVer = new Function('fs', 'f', 'return ' + m[1] + ';');
  const os = require('os'), dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bom-'));
  const a = path.join(dir, 'a.xml'), b = path.join(dir, 'b.xml');
  fs.writeFileSync(a, '<x ExtensionBundleVersion="1.3.34">\n<y/>\n</x>\n');
  fs.writeFileSync(b, '﻿<x ExtensionBundleVersion="1.3.35">\r\n<y/>\r\n</x>\r\n');
  assert.strictEqual(stripVer(fs, a), stripVer(fs, b));
});
