// Builds the DaVinci Resolve Studio package (Mac or Windows): dist/JMG Ultra Studio for Resolve <version>/ and
// dist/JMG-Ultra-Studio-Resolve-<version>.zip. Inside: the plugin folder com.jmgphotography.ultrastudio/ (the same
// panel as Premiere's, plus resolve/host and the Electron shell from resolve/plugin), the installers for Mac and
// Windows and "Read me first.html". Resolve's own WorkflowIntegration.node is not shipped: the installer copies it
// from the person's Resolve Studio.
// Usage: node dev/resolve/build.js
'use strict';
const fs = require('fs'), path = require('path'), zlib = require('zlib'), { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..', '..');
const die = msg => { console.error(msg); process.exit(1); };
const rel = p => path.relative(ROOT, p);

const VER = (/ExtensionBundleVersion="([^"]+)"/.exec(fs.readFileSync(path.join(ROOT, 'CSXS', 'manifest.xml'), 'utf8')) || [])[1];
if (!VER) die('No ExtensionBundleVersion in CSXS/manifest.xml');
const PLUGIN_ID = 'com.jmgphotography.ultrastudio';
const NAME = `JMG Ultra Studio for Resolve ${VER}`, DIST = path.join(ROOT, 'dist'), OUT = path.join(DIST, NAME), PLUG = path.join(OUT, PLUGIN_ID);
const ZIP = path.join(DIST, `JMG-Ultra-Studio-Resolve-${VER}.zip`);
const node = (...a) => execFileSync(process.execPath, a, { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] }).toString();
const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
const jsIn = d => fs.readdirSync(path.join(ROOT, d)).filter(f => f.endsWith('.js') && f[0] !== '.').map(f => path.join(ROOT, d, f));

/* ---------- checks ---------- */
for (const f of [...jsIn('resolve/host'), ...jsIn('resolve/plugin')]) {
  try { execFileSync(process.execPath, ['--check', f], { stdio: ['ignore', 'pipe', 'pipe'] }); }
  catch (e) { die(`${rel(f)} has a syntax error – not building.\n${String(e.stderr || e.message)}`); }
}
// stray control characters (e.g. a \b that became a backspace) break regular expressions silently
const bad = ['js', 'css', 'resolve'].flatMap(d => walk(path.join(ROOT, d))).filter(f => /\.(js|css|html|json|xml)$/.test(f)).concat([path.join(ROOT, 'index.html')])
  .filter(f => /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(fs.readFileSync(f, 'latin1')));
if (bad.length) die(bad.map(rel).join('\n') + '\nControl characters in the files above – not building.');
try { node('dev/tests/run.js'); } catch (e) { die('Unit tests failed – not building.\n' + String(e.stdout).split('\n').filter(l => l.includes('✗')).join('\n')); }

/* ---------- the package ---------- */
fs.rmSync(OUT, { recursive: true, force: true }); fs.rmSync(ZIP, { force: true });
fs.mkdirSync(PLUG, { recursive: true });
// nothing development-only: no dot-files (.debug, .DS_Store, macOS ._ files), no "debug" switch, no Resolve's own .node
const skip = name => name[0] === '.' || name === 'debug' || name === 'Thumbs.db' || name === 'desktop.ini' || /\.node$/.test(name);
function copy(from, to) {
  const st = fs.statSync(from);
  if (st.isDirectory()) { fs.mkdirSync(to, { recursive: true }); for (const n of fs.readdirSync(from)) if (!skip(n)) copy(path.join(from, n), path.join(to, n)); }
  else fs.copyFileSync(from, to);
}
// the shared panel (CSXS/manifest.xml too: the panel reads its version from it)
for (const f of ['index.html', 'CSXS', 'js', 'css', 'assets']) copy(path.join(ROOT, f), path.join(PLUG, f));
copy(path.join(ROOT, 'resolve', 'host'), path.join(PLUG, 'resolve', 'host'));
// the Electron shell Resolve opens, with the version filled in
for (const f of ['main.js', 'preload.js']) copy(path.join(ROOT, 'resolve', 'plugin', f), path.join(PLUG, f));
for (const f of ['manifest.xml', 'package.json']) fs.writeFileSync(path.join(PLUG, f), fs.readFileSync(path.join(ROOT, 'resolve', 'plugin', f), 'utf8').replace(/__VERSION__/g, VER));
// the guide (Home › Guide opens docs/guide.html) and "Read me first" next to the installers
node('dev/docs/make-guide.js');
fs.mkdirSync(path.join(PLUG, 'docs'));
fs.copyFileSync(path.join(ROOT, 'dev', 'docs', 'Read me first.html'), path.join(PLUG, 'docs', 'guide.html'));
fs.copyFileSync(path.join(ROOT, 'dev', 'docs', 'Read me first.html'), path.join(OUT, 'Read me first.html'));
const INST = path.join(ROOT, 'dev', 'resolve', 'installer');
for (const f of fs.readdirSync(INST)) if (/\.(command|bat)$/.test(f)) {
  fs.copyFileSync(path.join(INST, f), path.join(OUT, f));
  if (f.endsWith('.command')) fs.chmodSync(path.join(OUT, f), 0o755);
}

/* ---------- sanity: everything the plugin and the panel point at is there, and nothing that shouldn't be ---------- */
const must = ['manifest.xml', 'package.json', 'main.js', 'preload.js', 'index.html', 'CSXS/manifest.xml', 'css/app.css', 'assets/icon-dark.png', 'resolve/host/index.js', 'resolve/host/base.js', 'js/core/platform.js', 'docs/guide.html'];
for (const f of must) if (!fs.existsSync(path.join(PLUG, f))) die('Missing ' + f);
const manifest = fs.readFileSync(path.join(PLUG, 'manifest.xml'), 'utf8');
if (!manifest.includes(`<Id>${PLUGIN_ID}</Id>`) || !manifest.includes(`<Version>${VER}</Version>`) || !manifest.includes('<FilePath>main.js</FilePath>')) die('manifest.xml lost its id, version or main.js');
const pkg = JSON.parse(fs.readFileSync(path.join(PLUG, 'package.json'), 'utf8'));
if (pkg.version !== VER || pkg.main !== 'main.js') die('package.json has the wrong version or main');
for (const m of fs.readFileSync(path.join(PLUG, 'index.html'), 'utf8').matchAll(/(?:src|href)="([^"]+)"/g)) if (!fs.existsSync(path.join(PLUG, m[1]))) die('index.html points at a missing ' + m[1]);
const files = walk(PLUG).map(f => path.relative(PLUG, f).split(path.sep).join('/'));
const stray = files.filter(f => /^(jsx|dev)\//.test(f) || f.split('/').some(skip) || f === 'resolve/plugin' || f.startsWith('resolve/plugin/'));
if (stray.length) die('Development files got into the package: ' + stray.join(', '));
if (!fs.readFileSync(path.join(OUT, 'Read me first.html'), 'utf8').includes(`version ${VER}`)) die(`Read me first.html doesn't say version ${VER}`);

/* ---------- the zip: "JMG Ultra Studio for Resolve <ver>/…" ---------- */
if (process.platform === 'darwin') {
  try { execFileSync('xattr', ['-cr', OUT]); } catch (e) { /* nothing to clear */ }
  for (const f of walk(OUT)) if (path.basename(f).startsWith('._')) fs.rmSync(f);
  execFileSync('ditto', ['-c', '-k', '--norsrc', '--noextattr', '--keepParent', NAME, path.basename(ZIP)], { cwd: DIST });
} else if (zlib.crc32) {
  // our own writer (as dev/win/build.js): it records Unix modes, so "Install on Mac.command" stays executable on a Mac
  writeZip(OUT, NAME, ZIP);
} else if (process.platform === 'win32') {
  console.log('Note: Node 22+ keeps the Mac installer executable in the zip; with this Node, Mac users must run it with Terminal.');
  execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `Compress-Archive -LiteralPath '${OUT.replace(/'/g, "''")}' -DestinationPath '${ZIP.replace(/'/g, "''")}' -Force`], { stdio: 'inherit' });
} else die('Needs Node 22 or later to make the zip here.');

const names = zipNames(ZIP);
if (names.some(n => n.split(/[\\/]/).some(p => p.startsWith('._')))) die('The zip still has ._ files – not shipping it.');
if (!names.some(n => n.replace(/\\/g, '/').endsWith(`${PLUGIN_ID}/manifest.xml`))) die('The zip has no plugin manifest – not shipping it.');

console.log(`Built ${OUT}`);
console.log(`Zip:  ${ZIP} (${(fs.statSync(ZIP).size / 1048576).toFixed(1)} MB, ${names.length} entries)`);
console.log(`Files in the plugin: ${files.length}`);

/** The names inside a zip (reads its central directory). */
function zipNames(file) {
  const b = fs.readFileSync(file);
  let e = b.length - 22; while (e > 0 && b.readUInt32LE(e) !== 0x06054b50) e--;
  if (e <= 0) die('Not a zip: ' + file);
  const out = [];
  for (let o = b.readUInt32LE(e + 16), n = b.readUInt16LE(e + 10); n-- > 0;) {
    const len = b.readUInt16LE(o + 28);
    out.push(b.toString('utf8', o + 46, o + 46 + len));
    o += 46 + len + b.readUInt16LE(o + 30) + b.readUInt16LE(o + 32);
  }
  return out;
}

/** A zip of folder `dir` as "<top>/…", with Unix modes (made by Unix) so .command files stay executable. */
function writeZip(dir, top, zipPath) {
  const d = new Date(), time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1), date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  const entries = [];
  (function add(p, r) {
    entries.push({ name: r + '/', dir: true });
    for (const e of fs.readdirSync(p, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (e.isDirectory()) add(path.join(p, e.name), r + '/' + e.name); else entries.push({ name: r + '/' + e.name, file: path.join(p, e.name) });
    }
  })(dir, top);
  const parts = [], central = []; let offset = 0;
  for (const e of entries) {
    const name = Buffer.from(e.name, 'utf8'), raw = e.dir ? Buffer.alloc(0) : fs.readFileSync(e.file);
    const data = e.dir ? raw : zlib.deflateRawSync(raw, { level: 9 }), crc = e.dir ? 0 : zlib.crc32(raw);
    const mode = e.dir ? 0o40755 : /\.command$/.test(e.name) ? 0o100755 : 0o100644;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x0800, 6); local.writeUInt16LE(e.dir ? 0 : 8, 8);
    local.writeUInt16LE(time, 10); local.writeUInt16LE(date, 12); local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18); local.writeUInt32LE(raw.length, 22); local.writeUInt16LE(name.length, 26); local.writeUInt16LE(0, 28);
    const cen = Buffer.alloc(46);
    cen.writeUInt32LE(0x02014b50, 0); cen.writeUInt16LE((3 << 8) | 20, 4); cen.writeUInt16LE(20, 6); cen.writeUInt16LE(0x0800, 8); cen.writeUInt16LE(e.dir ? 0 : 8, 10);
    cen.writeUInt16LE(time, 12); cen.writeUInt16LE(date, 14); cen.writeUInt32LE(crc, 16); cen.writeUInt32LE(data.length, 20); cen.writeUInt32LE(raw.length, 24);
    cen.writeUInt16LE(name.length, 28); cen.writeUInt32LE(((mode << 16) | (e.dir ? 0x10 : 0)) >>> 0, 38); cen.writeUInt32LE(offset, 42);
    parts.push(local, name, data); central.push(cen, name);
    offset += local.length + name.length + data.length;
  }
  const cenBuf = Buffer.concat(central), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cenBuf.length, 12); end.writeUInt32LE(offset, 16);
  fs.writeFileSync(zipPath, Buffer.concat([...parts, cenBuf, end]));
}
