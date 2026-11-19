// JMG Ultra Studio – the window Resolve opens from Workspace › Workflow Integrations › JMG Ultra Studio.
// The panel is the same one Premiere uses (index.html, js/, css/); it needs Node in the page, so this follows
// Blackmagic's "compatibility mode" sample (nodeIntegration on, contextIsolation off).
const { app, BrowserWindow, ipcMain, dialog, shell, nativeImage, systemPreferences } = require('electron');
const path = require('path'), fs = require('fs');

// Development: with a file called "debug" next to this one, the panel can be driven by dev/cep.js on port 8892.
if (fs.existsSync(path.join(__dirname, 'debug'))) app.commandLine.appendSwitch('remote-debugging-port', '8892');

let win = null;
function createWindow() {
  win = new BrowserWindow({
    width: 440, height: 900, minWidth: 340, minHeight: 500, useContentSize: true,
    title: 'JMG Ultra Studio', backgroundColor: '#1e1e1e', autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), nodeIntegration: true, contextIsolation: false, sandbox: false, backgroundThrottling: false }
  });
  win.setMenu(null);
  win.on('close', () => app.quit());
  // links open in the person's browser, never inside the panel
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
  win.loadFile(path.join(__dirname, 'index.html'));
}

// Ask › dictation: may the microphone be used? (Electron lets this window's own page open it; no permission handler is
// set, so nothing else about permissions changes.) On a Mac the system is asked once – but only when this window's app
// says why it wants the microphone (without that line macOS closes an app that asks), else 'unavailable'.
// -> 'granted' | 'denied' | 'unavailable'
ipcMain.handle('ultra-studio:mic', async () => {
  try {
    if (process.platform !== 'darwin' || !systemPreferences || !systemPreferences.getMediaAccessStatus) return 'granted';
    const st = systemPreferences.getMediaAccessStatus('microphone');
    if (st === 'granted') return 'granted';
    if (st === 'denied' || st === 'restricted') return 'denied';
    let plist = '';
    try { plist = fs.readFileSync(path.join(path.dirname(process.execPath), '..', 'Info.plist')).toString('latin1'); } catch (e) { plist = ''; }
    if (!/NSMicrophoneUsageDescription/.test(plist)) return 'unavailable';
    return (await systemPreferences.askForMediaAccess('microphone')) ? 'granted' : 'denied';
  } catch (e) { return 'unavailable'; }
});

/*
 * The Resolve commands (resolve/host) run here, in the main process, which keeps the single connection to Resolve:
 * connecting again from a reloaded page hangs Resolve 21. The page sends each command over IPC
 * (js/core/host.js); "load" re-reads the command files (so development reloads pick up changes) and keeps the
 * connection.
 */
let host = null, cleanUp = null;
function hostDir() { const d = path.join(__dirname, 'resolve', 'host'); try { return fs.realpathSync(d); } catch (e) { return d; } }
ipcMain.handle('ultra-studio:load', () => {
  try {
    const dir = hostDir();
    for (const k of Object.keys(require.cache)) if (k.startsWith(dir)) delete require.cache[k];
    const H = require(path.join(dir, 'index.js'));
    host = host ? H.connect({ api: host.R.api }) : H.connect({ pluginDir: __dirname, onQuit: resolveQuitting });
    if (!cleanUp) cleanUp = host.cleanUp;
    return { ok: true, modules: host.modules };
  } catch (e) {
    return { ok: false, error: { code: e.usCode || 'HOST_SCRIPT', title: e.usTitle, action: e.usAction, detail: String((e && (e.stack || e.message)) || e).slice(0, 2000) } };
  }
});
ipcMain.handle('ultra-studio:run', (e, name, args) => (host ? host.run(name, args) : { ok: false, error: { code: 'HOST_SCRIPT', detail: 'The Resolve commands aren’t loaded.' } }));
app.on('will-quit', () => { if (cleanUp && !resolveGone) cleanUp(); });
// Resolve is quitting: close the panel so Resolve can finish (it waits for its plugins). Resolve's connection is going
// away, so don't wait on it; and if anything still holds the panel open, leave anyway after a moment.
let resolveGone = false;
function resolveQuitting() {
  resolveGone = true;
  setTimeout(() => app.exit(0), 3000);
  app.quit();
}

// file dialogs for the panel (US.app.pickFiles): answers the chosen paths, or [] when cancelled
ipcMain.on('ultra-studio:open-dialog', (e, opts) => {
  try { e.returnValue = dialog.showOpenDialogSync(win, opts) || []; } catch (err) { e.returnValue = []; }
});

// dragging a line out of the panel (Story › Find): a real file drag, so Resolve's timeline takes the drop
ipcMain.on('ultra-studio:start-drag', (e, file) => {
  try {
    let icon = nativeImage.createFromPath(path.join(__dirname, 'assets', 'icon-dark.png'));
    icon = icon.isEmpty() ? nativeImage.createFromDataURL('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==') : icon.resize({ width: 32, height: 32 });
    e.sender.startDrag({ file, icon });
  } catch (err) { /* the drag just doesn't start */ }
});

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
