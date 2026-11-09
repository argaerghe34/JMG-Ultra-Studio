// Settings › Updates: version order, which copies may be replaced, and a whole install from a release zip into a
// stand-in installed Premiere copy (GitHub is not contacted: the download is a local zip).
const assert = require('assert'), fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');
const { load, test } = require('./harness');
const US = load(['ai', 'js/tools/98-update.js']);
const U = US.update;

test('update: versions compare part by part, four parts and a v prefix', () => {
  assert.strictEqual(U.compare('1.3.29.10', '1.3.29.9'), 1);
  assert.strictEqual(U.compare('1.3.30', '1.3.29.10'), 1);
  assert.strictEqual(U.compare('v1.3.29', '1.3.29.0'), 0);
  assert.strictEqual(U.compare('1.3.29.2', '1.3.29.10'), -1);
  assert.strictEqual(U.assetName('1.4', false), 'JMG-Ultra-Studio-1.4.zip');
  assert.strictEqual(U.assetName('1.4', true), 'JMG-Ultra-Studio-Resolve-1.4.zip');
});

function installed(ver, extra = {}) {
  const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'us-upd-')), 'JMGUltraStudio');
  fs.mkdirSync(path.join(dir, 'CSXS'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'CSXS', 'manifest.xml'), `<ExtensionManifest ExtensionBundleVersion="${ver}" Version="7.0"><Host/></ExtensionManifest>`);
  fs.writeFileSync(path.join(dir, 'index.html'), 'old');
  fs.writeFileSync(path.join(dir, 'old.js'), 'gone after the update');
  for (const [f, v] of Object.entries(extra)) { fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true }); fs.writeFileSync(path.join(dir, f), v); }
  return dir;
}
function releaseZip(ver, manVer = ver, host = '<Host/>') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'us-rel-')), top = path.join(root, `JMG Ultra Studio ${ver}`), ext = path.join(top, 'JMG Ultra Studio extension');
  fs.mkdirSync(path.join(ext, 'CSXS'), { recursive: true });
  fs.writeFileSync(path.join(ext, 'CSXS', 'manifest.xml'), `<ExtensionManifest ExtensionBundleVersion="${manVer}" Version="7.0">${host}</ExtensionManifest>`);
  fs.writeFileSync(path.join(ext, 'index.html'), 'new ' + ver);
  fs.writeFileSync(path.join(ext, 'new.js'), 'added');
  const zip = path.join(root, U.assetName(ver, false));
  if (process.platform === 'win32') cp.execFileSync('tar', ['-a', '-cf', zip, '-C', root, path.basename(top)]);
  else cp.execFileSync('/usr/bin/ditto', ['-c', '-k', '--keepParent', top, zip]);
  return zip;
}
async function installFrom(zip, dir, ver) {
  const keep = U.io.download;
  U.io.download = async (asset, auth, file) => { fs.copyFileSync(zip, file); return file; };
  try { return await U.install({ latest: ver, asset: { name: path.basename(zip), size: fs.statSync(zip).size } }, US.jobs.testJob(), { dir }); }
  finally { U.io.download = keep; }
}

test('update: a development copy is never replaced', async () => {
  const dir = installed(US.version, { '.git/HEAD': 'ref' });
  assert.ok(U.target(dir).dev);
  await assert.rejects(() => installFrom(releaseZip('99.0.0'), dir, '99.0.0'), /development copy/);
  assert.strictEqual(fs.readFileSync(path.join(dir, 'index.html'), 'utf8'), 'old');
  const link = path.join(path.dirname(dir), 'linked');
  fs.symlinkSync(installed(US.version), link, process.platform === 'win32' ? 'junction' : 'dir');
  assert.ok(U.target(link).dev, 'a linked copy counts as development');
});

test('update: installs the release over the installed copy – new files in, old ones out, panel reload is enough', async () => {
  const dir = installed(US.version);
  assert.ok(!U.target(dir).dev);
  const r = await installFrom(releaseZip('99.0.0'), dir, '99.0.0');
  assert.deepStrictEqual(r, { version: '99.0.0', restart: false });
  assert.strictEqual(fs.readFileSync(path.join(dir, 'index.html'), 'utf8'), 'new 99.0.0');
  assert.ok(fs.existsSync(path.join(dir, 'new.js')) && !fs.existsSync(path.join(dir, 'old.js')));
  assert.ok(fs.existsSync(path.join(US.fsx.dataDir, 'updates', 'previous-' + US.version, 'old.js')), 'the previous version is kept aside');
});

test('update: a changed manifest asks for a restart; a download with the wrong version changes nothing', async () => {
  const dir = installed(US.version);
  assert.strictEqual((await installFrom(releaseZip('99.0.1', '99.0.1', '<Host Name="PPRO"/>'), dir, '99.0.1')).restart, true);
  const dir2 = installed(US.version);
  await assert.rejects(() => installFrom(releaseZip('99.0.2', '99.0.0'), dir2, '99.0.2'), /says it’s version 99\.0\.0/);
  assert.strictEqual(fs.readFileSync(path.join(dir2, 'index.html'), 'utf8'), 'old');
});
