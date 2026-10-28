// JMG Ultra Studio – the window Resolve opens from Workspace › Workflow Integrations › JMG Ultra Studio.
// The panel is the same one Premiere uses (index.html, js/, css/); it needs Node in the page, so this follows
// Blackmagic's "compatibility mode" sample (nodeIntegration on, contextIsolation off).
const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
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
    host = host ? H.connect({ api: host.R.api }) : H.connect({ pluginDir: __dirname });
    if (!cleanUp) cleanUp = host.cleanUp;
    return { ok: true, modules: host.modules };
  } catch (e) {
    return { ok: false, error: { code: e.usCode || 'HOST_SCRIPT', title: e.usTitle, action: e.usAction, detail: String((e && (e.stack || e.message)) || e).slice(0, 2000) } };
  }
});
ipcMain.handle('ultra-studio:run', (e, name, args) => (host ? host.run(name, args) : { ok: false, error: { code: 'HOST_SCRIPT', detail: 'The Resolve commands aren’t loaded.' } }));
app.on('will-quit', () => { if (cleanUp) cleanUp(); });

// file dialogs for the panel (US.app.pickFiles): answers the chosen paths, or [] when cancelled
ipcMain.on('ultra-studio:open-dialog', (e, opts) => {
  try { e.returnValue = dialog.showOpenDialogSync(win, opts) || []; } catch (err) { e.returnValue = []; }
});

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
