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

// file dialogs for the panel (US.app.pickFiles): answers the chosen paths, or [] when cancelled
ipcMain.on('ultra-studio:open-dialog', (e, opts) => {
  try { e.returnValue = dialog.showOpenDialogSync(win, opts) || []; } catch (err) { e.returnValue = []; }
});

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
