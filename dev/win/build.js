// Builds the shippable package on Windows (or anywhere with Node 22+): dist/JMG Ultra Studio <version>/ and a zip.
// Same output as dev/build.sh, which needs the Mac's ditto/xattr. The zip records Unix permissions, so
// "Install on Mac.command" is still executable when the zip is opened on a Mac.
// Usage: node dev/win/build.js
const fs = require('fs'), path = require('path'), zlib = require('zlib'), { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..', '..');
const die = msg => { console.error(msg); process.exit(1); };
if (!zlib.crc32) die('Needs Node 22 or later (zlib.crc32).');

const VER = /ExtensionBundleVersion="([^"]+)"/.exec(fs.readFileSync(path.join(ROOT, 'CSXS', 'manifest.xml'), 'utf8'))[1];
const NAME = `JMG Ultra Studio ${VER}`, DIST = path.join(ROOT, 'dist'), OUT = path.join(DIST, NAME), EXT = path.join(OUT, 'JMG Ultra Studio extension');
const ZIP = path.join(DIST, `JMG-Ultra-Studio-${VER}.zip`);
const node = (...a) => execFileSync(process.execPath, a, { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] }).toString();
const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);

// checks, as dev/build.sh
process.stdout.write(node('dev/check-jsx.js'));
// stray control characters (e.g. a \b that became a backspace) break regular expressions silently
const bad = ['js', 'jsx', 'css'].flatMap(d => walk(path.join(ROOT, d))).concat([path.join(ROOT, 'index.html')])
  .filter(f => /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(fs.readFileSync(f, 'latin1')));
if (bad.length) die(bad.join('\n') + '\nControl characters in the files above – not building.');
try { node('dev/tests/run.js'); } catch (e) { die('Unit tests failed – not building.\n' + String(e.stdout).split('\n').filter(l => l.includes('✗')).join('\n')); }

// the package: only the extension's own files (no dev tools, test media, debug ports or test project)
fs.rmSync(OUT, { recursive: true, force: true }); fs.rmSync(ZIP, { force: true });
fs.mkdirSync(EXT, { recursive: true });
for (const f of ['CSXS', 'css', 'js', 'jsx', 'assets', 'index.html']) fs.cpSync(path.join(ROOT, f), path.join(EXT, f), { recursive: true });
for (const f of walk(EXT)) if (/^(\.DS_Store|\.debug|\._.*)$/.test(path.basename(f))) fs.rmSync(f);
for (const f of fs.readdirSync(path.join(ROOT, 'dev', 'installer'))) if (/\.(command|bat)$/.test(f)) fs.copyFileSync(path.join(ROOT, 'dev', 'installer', f), path.join(OUT, f));
node('dev/docs/make-guide.js');
fs.copyFileSync(path.join(ROOT, 'dev', 'docs', 'Read me first.html'), path.join(OUT, 'Read me first.html'));
fs.mkdirSync(path.join(EXT, 'docs'), { recursive: true });
fs.copyFileSync(path.join(ROOT, 'dev', 'docs', 'Read me first.html'), path.join(EXT, 'docs', 'guide.html')); // Home › Guide opens it

// sanity: everything index.html and the manifest point at exists
for (const f of ['index.html', 'jsx/host.jsx', 'css/app.css', 'assets/icon-dark.png']) if (!fs.existsSync(path.join(EXT, f))) die('Missing ' + f);
if (!fs.readFileSync(path.join(EXT, 'CSXS', 'manifest.xml'), 'utf8').includes('enable-nodejs')) die('manifest lost --enable-nodejs');
if (!fs.readFileSync(path.join(OUT, 'Read me first.html'), 'utf8').includes(`version ${VER}`)) die(`Read me first.html doesn't say version ${VER}`);

// the zip: "JMG Ultra Studio <ver>/…" with Unix modes (made by Unix), .command files executable
function dosTime(d) { return { time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1), date: ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate() }; }
const entries = [];
(function add(dir, rel) {
  entries.push({ name: rel + '/', dir: true });
  for (const e of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const p = path.join(dir, e.name), r = rel + '/' + e.name;
    if (e.isDirectory()) add(p, r); else entries.push({ name: r, file: p });
  }
})(OUT, NAME);
const parts = [], central = []; let offset = 0;
const { time, date } = dosTime(new Date());
for (const e of entries) {
  const name = Buffer.from(e.name, 'utf8');
  const raw = e.dir ? Buffer.alloc(0) : fs.readFileSync(e.file);
  const data = e.dir ? raw : zlib.deflateRawSync(raw, { level: 9 });
  const crc = e.dir ? 0 : zlib.crc32(raw);
  const mode = e.dir ? 0o40755 : /\.command$/.test(e.name) ? 0o100755 : 0o100644;
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x0800, 6); local.writeUInt16LE(e.dir ? 0 : 8, 8);
  local.writeUInt16LE(time, 10); local.writeUInt16LE(date, 12); local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(data.length, 18); local.writeUInt32LE(raw.length, 22); local.writeUInt16LE(name.length, 26); local.writeUInt16LE(0, 28);
  const cen = Buffer.alloc(46);
  cen.writeUInt32LE(0x02014b50, 0); cen.writeUInt16LE((3 << 8) | 20, 4); cen.writeUInt16LE(20, 6); cen.writeUInt16LE(0x0800, 8); cen.writeUInt16LE(e.dir ? 0 : 8, 10);
  cen.writeUInt16LE(time, 12); cen.writeUInt16LE(date, 14); cen.writeUInt32LE(crc, 16); cen.writeUInt32LE(data.length, 20); cen.writeUInt32LE(raw.length, 24);
  cen.writeUInt16LE(name.length, 28); cen.writeUInt16LE(0, 30); cen.writeUInt16LE(0, 32); cen.writeUInt16LE(0, 34); cen.writeUInt16LE(0, 36);
  cen.writeUInt32LE(((mode << 16) | (e.dir ? 0x10 : 0)) >>> 0, 38); cen.writeUInt32LE(offset, 42);
  parts.push(local, name, data); central.push(cen, name);
  offset += local.length + name.length + data.length;
}
const cenBuf = Buffer.concat(central), end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
end.writeUInt32LE(cenBuf.length, 12); end.writeUInt32LE(offset, 16);
fs.writeFileSync(ZIP, Buffer.concat([...parts, cenBuf, end]));

const files = walk(EXT).length;
console.log(`Built ${OUT}`);
console.log(`Zip:  ${ZIP} (${(fs.statSync(ZIP).size / 1048576).toFixed(1)} MB, ${entries.length} entries)`);
console.log(`Files in extension: ${files}`);
