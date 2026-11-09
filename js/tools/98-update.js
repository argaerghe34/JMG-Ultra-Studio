/* JMG Ultra Studio – updates: find the newest GitHub Release and install it into this copy, with one button
   (Settings › Updates). Premiere: the panel's own folder (in your user folder) is updated, then the panel reloads.
   Resolve: the plugin folder is shared by everyone on the computer, so the Mac asks for your password (Windows asks
   "Yes"); the panel then reloads, or asks you to restart Resolve when the part Resolve itself starts has changed.
   The previous version is copied aside first and put back if anything goes wrong. A development copy is never touched. */
(function () {
  'use strict';
  const US = window.US, fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');
  const REPO = 'argaerghe34/JMG-Ultra-Studio';
  const RES = US.app.is('resolve'), isWin = process.platform === 'win32';
  const PLUGIN_ID = 'com.jmgphotography.ultrastudio';

  /** "1.3.29.10" vs "1.3.30" -> -1 / 0 / 1 (missing parts count as 0) */
  function compare(a, b) {
    const x = String(a || '').replace(/^v/i, '').split('.').map(n => parseInt(n, 10) || 0), y = String(b || '').replace(/^v/i, '').split('.').map(n => parseInt(n, 10) || 0);
    for (let i = 0; i < Math.max(x.length, y.length); i++) { const d = (x[i] || 0) - (y[i] || 0); if (d) return d < 0 ? -1 : 1; }
    return 0;
  }
  const assetName = (ver, resolve = RES) => `JMG-Ultra-Studio-${resolve ? 'Resolve-' : ''}${ver}.zip`;

  /* ---------- signing in to GitHub (only needed if the repository is private) ---------- */
  /** A token saved in Settings, else the GitHub CLI's own sign-in on this computer, else none. */
  function token() {
    const saved = US.secrets.get('githubToken');
    if (saved) return { token: saved, from: 'settings' };
    const home = os.homedir();
    const ghs = isWin
      ? [path.join(process.env.ProgramFiles || 'C:\\Program Files', 'GitHub CLI', 'gh.exe'), path.join(process.env.LOCALAPPDATA || '', 'Programs', 'GitHub CLI', 'gh.exe')]
      : [path.join(home, '.local', 'bin', 'gh'), '/opt/homebrew/bin/gh', '/usr/local/bin/gh', '/usr/bin/gh'];
    for (const gh of ghs) {
      try {
        if (!fs.existsSync(gh)) continue;
        const t = String(cp.execFileSync(gh, ['auth', 'token'], { timeout: 8000, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }) || '').trim();
        if (t) return { token: t, from: 'gh' };
      } catch (e) { /* not signed in */ }
    }
    return { token: '', from: '' };
  }

  /* ---------- talking to GitHub ---------- */
  function request(url, { headers = {}, auth = '', file = null, progress = null, job = null } = {}, hops = 0) {
    return new Promise((resolve, reject) => {
      const u = new URL(url), h = Object.assign({ 'User-Agent': 'JMG-Ultra-Studio', 'X-GitHub-Api-Version': '2022-11-28' }, headers);
      if (auth && u.hostname === 'api.github.com') h.Authorization = 'Bearer ' + auth;   // never sent on to the download server
      const req = require('https').get(url, { headers: h }, res => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && hops < 8) { res.resume(); resolve(request(new URL(res.headers.location, url).toString(), { headers: file ? {} : headers, auth, file, progress, job }, hops + 1)); return; }
        if (res.statusCode !== 200) {
          let body = ''; res.on('data', d => { if (body.length < 2000) body += d; });
          res.on('end', () => { const e = new Error(`GitHub answered ${res.statusCode}`); e.status = res.statusCode; e.body = body; reject(e); });
          return;
        }
        if (!file) { let body = ''; res.setEncoding('utf8'); res.on('data', d => { body += d; }); res.on('end', () => { try { resolve(JSON.parse(body)); } catch (e) { reject(e); } }); return; }
        const total = +res.headers['content-length'] || 0, out = fs.createWriteStream(file + '.part');
        let got = 0;
        res.on('data', d => { got += d.length; if (total && progress) progress(got / total); if (job && job.cancelled) req.destroy(new Error('cancelled')); });
        res.pipe(out);
        out.on('finish', () => out.close(() => { try { fs.renameSync(file + '.part', file); resolve(file); } catch (e) { reject(e); } }));
        res.on('error', reject); out.on('error', reject);
      });
      req.on('error', e => reject(job && job.cancelled ? new US.UserError('CANCELLED') : e));
      req.setTimeout(60000, () => req.destroy(new Error('GitHub didn’t answer in time')));
    });
  }
  const io = {
    latest: auth => request(`https://api.github.com/repos/${REPO}/releases/latest`, { headers: { Accept: 'application/vnd.github+json' }, auth }),
    download: (asset, auth, file, progress, job) => request(asset.url, { headers: { Accept: 'application/octet-stream' }, auth, file, progress, job })
  };

  function gitHubError(e, signedIn) {
    if (e instanceof US.UserError) return e;
    if (e.status === 404 || e.status === 401 || e.status === 403) {
      if (e.status === 403 && /rate limit/i.test(e.body || '')) return new US.UserError('UPDATE', { title: 'GitHub says to wait a little.', action: 'Too many checks from this computer in the last hour – try again later, or add a GitHub token in Settings › Updates.' });
      return new US.UserError('UPDATE', signedIn
        ? { title: 'GitHub didn’t accept the sign-in for the releases.', action: 'The token in Settings › Updates may have expired or can’t read the JMG-Ultra-Studio repository. Make a new one (github.com › Settings › Developer settings › Fine-grained tokens, Contents: read-only) and paste it there.' }
        : { title: 'GitHub didn’t show the releases – the repository may be private.', action: 'Paste a GitHub token in Settings › Updates (github.com › Settings › Developer settings › Fine-grained tokens, access to JMG-Ultra-Studio, Contents: read-only) – or sign in with the GitHub CLI on this computer (gh auth login).' });
    }
    return new US.UserError('UPDATE', { title: 'Couldn’t reach GitHub.', action: 'Check the internet connection and try again.', detail: e.message });
  }

  /** -> {current, latest, newer, release, asset, notes, published} */
  async function check() {
    const t = token();
    let rel;
    try { rel = await io.latest(t.token); } catch (e) { throw gitHubError(e, !!t.token); }
    const latest = String(rel.tag_name || '').replace(/^v/i, ''), current = US.version;
    const asset = (rel.assets || []).find(a => a.name === assetName(latest));
    return { current, latest, newer: compare(latest, current) > 0, release: rel, asset, notes: String(rel.body || ''), published: rel.published_at || '', url: rel.html_url || '' };
  }

  /* ---------- this copy ---------- */
  /** The folder this panel runs from, and whether it may be replaced. -> {dir, dev, why} */
  function target(dir = US.app.pluginDir()) {
    const out = { dir, dev: false, why: '' };
    try {
      if (fs.lstatSync(dir).isSymbolicLink() || fs.realpathSync(dir) !== path.join(fs.realpathSync(path.dirname(dir)), path.basename(dir))) out.why = 'it’s linked to a development folder';
      else if (fs.existsSync(path.join(dir, '.git')) || fs.existsSync(path.join(dir, 'dev', 'build.sh'))) out.why = 'it’s the development copy';
      else if (RES && fs.existsSync(path.join(dir, 'debug'))) out.why = 'it’s set up for development';
      else if (RES ? !fs.existsSync(path.join(dir, 'manifest.xml')) || !new RegExp(`<Id>${PLUGIN_ID}</Id>`).test(fs.readFileSync(path.join(dir, 'manifest.xml'), 'utf8')) : !fs.existsSync(path.join(dir, 'CSXS', 'manifest.xml'))) out.why = 'it isn’t an installed copy';
    } catch (e) { out.why = 'its folder can’t be read'; }
    out.dev = !!out.why;
    return out;
  }

  /* ---------- copying ---------- */
  const run = (cmd, args, opts = {}) => new Promise((resolve, reject) => cp.execFile(cmd, args, Object.assign({ maxBuffer: 1 << 24 }, opts), (e, so, se) => (e ? reject(Object.assign(e, { stderr: String(se || '') })) : resolve(String(so || '')))));
  async function unzip(zip, dir) {
    fs.mkdirSync(dir, { recursive: true });
    if (isWin) { try { await run('tar', ['-xf', zip, '-C', dir]); } catch (e) { await run('powershell', ['-NoProfile', '-Command', `Expand-Archive -LiteralPath '${zip.replace(/'/g, "''")}' -DestinationPath '${dir.replace(/'/g, "''")}' -Force`]); } }
    else await run('/usr/bin/ditto', ['-x', '-k', zip, dir]);
  }
  /** The new copy inside the unzipped release: Premiere's "JMG Ultra Studio extension", Resolve's plugin folder. */
  function newCopy(dir, ver) {
    const top = fs.readdirSync(dir).map(n => path.join(dir, n)).find(p => fs.statSync(p).isDirectory()) || dir;
    const src = path.join(top, RES ? PLUGIN_ID : 'JMG Ultra Studio extension');
    const man = path.join(src, 'CSXS', 'manifest.xml');
    if (!fs.existsSync(path.join(src, 'index.html')) || !fs.existsSync(man)) throw new US.UserError('UPDATE', { title: 'The download isn’t a complete copy of JMG Ultra Studio.', action: 'Nothing was changed. Try again; if it happens again, install from the release page.' });
    const got = (/ExtensionBundleVersion="([^"]+)"/.exec(fs.readFileSync(man, 'utf8')) || [])[1];
    if (got !== ver) throw new US.UserError('UPDATE', { title: `The download says it’s version ${got || '?'}, not ${ver}.`, action: 'Nothing was changed. Install from the release page instead.' });
    if (RES && !fs.existsSync(path.join(src, 'main.js'))) throw new US.UserError('UPDATE', { title: 'The download is missing part of the Resolve plugin.', action: 'Nothing was changed. Install from the release page instead.' });
    return src;
  }
  /** Copy src over dest exactly (files no longer in src removed), keeping Resolve's own WorkflowIntegration.node. */
  async function mirror(src, dest, { admin = false } = {}) {
    if (isWin) {
      const args = [src, dest, '/MIR', '/XF', 'WorkflowIntegration.node', 'debug', '/R:2', '/W:1', '/NFL', '/NDL', '/NJH', '/NJS', '/NP'];
      if (!admin) {
        try { await run('robocopy', args); } catch (e) { if (!(e.code >= 0 && e.code < 8)) throw e; }   // robocopy: below 8 is success
        return;
      }
      const done = path.join(os.tmpdir(), `us-update-${Date.now()}.txt`), ps1 = done.replace(/\.txt$/, '.ps1');
      const q = s => "'" + String(s).replace(/'/g, "''") + "'";
      fs.writeFileSync(ps1, `robocopy ${args.map(q).join(' ')}\r\nSet-Content -LiteralPath ${q(done)} -Value $LASTEXITCODE\r\n`);
      try { await run('powershell', ['-NoProfile', '-Command', `$p = ${q(ps1)}; Start-Process powershell -Verb RunAs -Wait -WindowStyle Hidden -ArgumentList ('-NoProfile -ExecutionPolicy Bypass -File "' + $p + '"')`]); }
      catch (e) { throw new US.UserError('UPDATE', { title: 'Windows didn’t give permission to update Resolve’s plugin folder.', action: 'Press the button again and click Yes when Windows asks.' }); }
      const code = fs.existsSync(done) ? parseInt(fs.readFileSync(done, 'utf8'), 10) : NaN;
      try { fs.unlinkSync(done); fs.unlinkSync(ps1); } catch (e) { /* temp */ }
      if (!(code >= 0 && code < 8)) throw new Error('copying into Resolve’s plugin folder failed (robocopy ' + code + ')');
      return;
    }
    const sh = path.join(os.tmpdir(), `us-update-${Date.now()}.sh`);
    fs.writeFileSync(sh, [
      'set -e',
      'rsync -a --delete --exclude WorkflowIntegration.node --exclude debug "$1/" "$2/"',
      'find "$2" -name "._*" -delete 2>/dev/null || true',
      'xattr -dr com.apple.quarantine "$2" 2>/dev/null || true',
      'chmod -R a+rX "$2"'
    ].join('\n') + '\n');
    try {
      if (!admin) { await run('/bin/bash', [sh, src, dest]); return; }
      await run('/usr/bin/osascript', ['-e', 'on run argv', '-e',
        'do shell script "/bin/bash " & quoted form of (item 1 of argv) & " " & quoted form of (item 2 of argv) & " " & quoted form of (item 3 of argv) with prompt "JMG Ultra Studio needs your Mac password to update itself in Resolve’s plugin folder." with administrator privileges',
        '-e', 'end run', sh, src, dest]);
    } catch (e) {
      if (/-128|cancel/i.test(e.stderr || e.message)) throw new US.UserError('UPDATE', { title: 'The update was cancelled – nothing was changed.', action: 'Press the button again and type your Mac password when asked.' });
      throw e;
    } finally { try { fs.unlinkSync(sh); } catch (e) { /* temp */ } }
  }
  /** Can this user write to every file in dir (no password needed)? */
  function writable(dir) {
    try {
      fs.accessSync(dir, fs.constants.W_OK);
      for (const n of fs.readdirSync(dir)) { const p = path.join(dir, n), st = fs.lstatSync(p); if (st.isDirectory() ? !writable(p) : (fs.accessSync(p, fs.constants.W_OK), false)) return false; }
      return true;
    } catch (e) { return false; }
  }
  const same = (a, b) => { try { return fs.readFileSync(a).equals(fs.readFileSync(b)); } catch (e) { return false; } };
  const stripVer = f => { try { return fs.readFileSync(f, 'utf8').replace(/Version="[^"]*"|<Version>[^<]*<\/Version>/g, ''); } catch (e) { return null; } };

  /**
   * Download the release and put it in place of this copy. -> {version, restart} (restart: the editor must be
   * restarted for all of it to take effect; otherwise reloading the panel is enough).
   */
  async function install(info, job, { dir } = {}) {
    const t = target(dir);
    if (t.dev) throw new US.UserError('UPDATE', { title: `This copy isn’t updated here – ${t.why}.`, action: 'Update the development copy with git, or install the release from its page.' });
    if (!info.asset) throw new US.UserError('UPDATE', { title: `Version ${info.latest} has no ${RES ? 'Resolve' : 'Premiere'} download.`, action: 'Install it from the release page instead.' });
    const work = US.fsx.ensureDir(path.join(US.fsx.dataDir, 'updates')), stamp = String(Date.now());
    for (const n of fs.readdirSync(work)) { try { fs.rmSync(path.join(work, n), { recursive: true, force: true }); } catch (e) { /* earlier leftovers */ } }
    const zip = path.join(work, info.asset.name), un = path.join(work, 'new-' + stamp), keep = path.join(work, 'previous-' + US.version);
    job.set({ who: 'computer', msg: `Downloading version ${info.latest}` });
    try { await io.download(info.asset, token().token, zip, p => job.progress(p * 0.6, `Downloading version ${info.latest}`), job); } catch (e) { throw gitHubError(e, !!token().token); }
    if (info.asset.size && fs.statSync(zip).size !== info.asset.size) throw new US.UserError('UPDATE', { title: 'The download was incomplete.', action: 'Nothing was changed. Try again.' });
    job.check(); job.progress(0.65, 'Unpacking');
    await unzip(zip, un);
    const src = newCopy(un, info.latest);
    // what needs a restart: Resolve starts main.js and preload.js itself; Premiere reads the manifest when it starts
    const restart = RES ? !(same(path.join(src, 'main.js'), path.join(t.dir, 'main.js')) && same(path.join(src, 'preload.js'), path.join(t.dir, 'preload.js')) && stripVer(path.join(src, 'manifest.xml')) === stripVer(path.join(t.dir, 'manifest.xml')))
      : stripVer(path.join(src, 'CSXS', 'manifest.xml')) !== stripVer(path.join(t.dir, 'CSXS', 'manifest.xml'));
    job.progress(0.75, 'Keeping a copy of this version');
    fs.cpSync ? fs.cpSync(t.dir, keep, { recursive: true }) : await run(isWin ? 'robocopy' : '/bin/cp', isWin ? [t.dir, keep, '/E', '/NFL', '/NDL', '/NJH', '/NJS', '/NP'] : ['-R', t.dir, keep]).catch(e => { if (!(isWin && e.code < 8)) throw e; });
    job.check();
    const admin = !writable(t.dir);
    job.set({ who: admin ? 'You' : 'computer', msg: admin ? (isWin ? 'Click Yes when Windows asks – Resolve’s plugin folder is shared by everyone on this PC' : 'Type your Mac password when asked – Resolve’s plugin folder is shared by everyone on this Mac') : 'Putting the new version in place' }).progress(0.8);
    try { await mirror(src, t.dir, { admin }); }
    catch (e) {
      try { await mirror(keep, t.dir, { admin }); } catch (e2) { /* the message below says how to recover */ }
      if (e instanceof US.UserError) throw e;
      throw new US.UserError('UPDATE', { title: 'Couldn’t put the new version in place – the previous one was put back.', action: `Install ${info.latest} from the release page instead.`, detail: e.message });
    }
    US.log('info', `Updated to ${info.latest}`, `from ${US.version}${restart ? ' – restart needed' : ''}`, 'update');
    try { fs.rmSync(un, { recursive: true, force: true }); fs.rmSync(zip, { force: true }); } catch (e) { /* tidy later */ }
    US.settings.set('update.lastInstalled', { from: US.version, to: info.latest, at: Date.now(), restart });
    return { version: info.latest, restart };
  }

  /** Settings' button: check, and if there's a newer version say what's in it and install it on OK. */
  async function checkAndInstall() {
    const ui = US.ui, h = US.h;
    let info;
    const ok = await US.jobs.run({ title: 'Checking for updates', tool: 'settings' }, async job => { job.set({ who: 'computer', msg: 'Asking GitHub for the newest version' }); info = await check(); return { summary: info.newer ? `${info.latest} is available` : 'up to date' }; });
    if (!ok || !info) return null;
    if (!info.newer) { ui.toast({ type: 'ok', title: `You have the newest version (${info.current}).` }); return info; }
    const t = target();
    if (t.dev) { ui.toast({ type: 'info', title: `Version ${info.latest} is available.`, text: `This copy isn’t updated from here – ${t.why}.` }); return info; }
    const when = info.published ? new Date(info.published).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
    const notes = h('div.update-notes', { style: { maxHeight: '260px', overflow: 'auto', whiteSpace: 'pre-wrap' } }, info.notes.replace(/^#+\s*/gm, '').replace(/\*\*|\*/g, '').trim() || 'No notes.');
    const go = await ui.modal({ title: `Install version ${info.latest}?`, wide: true,
      body: h('div', h('p.muted', `You have ${info.current}.${when ? ` ${info.latest} came out on ${when}.` : ''} ${RES ? (isWin ? 'Windows may ask you to click Yes' : 'Your Mac may ask for your password') + ' – Resolve’s plugin folder is shared by everyone on this computer.' : ''} Your settings and Story work are kept.`), notes),
      buttons: [{ label: 'Not now', value: false, kind: 'ghost' }, { label: `Install ${info.latest}`, value: true, kind: 'primary' }] });
    if (!go) return info;
    let res;
    const done = await US.jobs.run({ title: `Updating to ${info.latest}`, tool: 'settings' }, async job => { res = await install(info, job); return { summary: `version ${res.version} installed` }; });
    if (!done || !res) return info;
    if (res.restart) {
      await ui.modal({ title: `Version ${res.version} is installed`, body: h('p', `Quit ${US.app.full} and open it again to finish – this update changes the part ${US.app.name} starts itself.${RES ? ' Then Workspace › Workflow Integrations › JMG Ultra Studio.' : ''}`), buttons: [{ label: 'OK', value: true, kind: 'primary' }] });
    } else {
      ui.toast({ type: 'ok', title: `Version ${res.version} is installed – reloading.` });
      US.settings.flush();
      setTimeout(() => location.reload(), 1200);
    }
    return info;
  }

  US.update = { compare, assetName, token, check, target, install, checkAndInstall, io, REPO };
})();
