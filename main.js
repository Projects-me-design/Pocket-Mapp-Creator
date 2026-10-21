// Pocket-Mapp-Creator — main process
// Copyright (c) 2026 project-tech-me <project-tech-me@protonmail.com> — MIT Licence
const { app, BrowserWindow, ipcMain, dialog, Menu, shell } = require('electron');
const path = require('path');
const fs = require('fs');

let win;

function createWindow() {
  win = new BrowserWindow({
    width: 1500,
    height: 940,
    minWidth: 1100,
    minHeight: 700,
    title: 'Pocket-Mapp-Creator',
    backgroundColor: '#1e1a16',
    icon: path.join(__dirname, 'build', process.platform === 'win32' ? 'icon.ico' : 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  win.loadFile(path.join(__dirname, 'src', 'index.html'));
  buildMenu();
  if (process.env.MAPP_TEST) {
    win.webContents.on('console-message', (e) => console.log('[renderer]', e.message || ''));
    win.on('page-title-updated', (_e, title) => {
      if (title.startsWith('TESTDONE')) { console.log(title); setTimeout(() => app.quit(), 300); }
    });
  }
}

function send(cmd) { if (win) win.webContents.send('menu', cmd); }

function buildMenu() {
  const isMac = process.platform === 'darwin';
  const template = [
    ...(isMac ? [{ role: 'appMenu' }] : []),
    {
      label: 'File',
      submenu: [
        { label: 'New Map…', accelerator: 'CmdOrCtrl+N', click: () => send('new') },
        { label: 'Open Map…', accelerator: 'CmdOrCtrl+O', click: () => send('open') },
        { label: 'Save', accelerator: 'CmdOrCtrl+S', click: () => send('save') },
        { label: 'Save As…', accelerator: 'CmdOrCtrl+Shift+S', click: () => send('saveAs') },
        { type: 'separator' },
        { label: 'Export PNG…', accelerator: 'CmdOrCtrl+E', click: () => send('exportPng') },
        { label: 'Export JPG…', accelerator: 'CmdOrCtrl+Shift+E', click: () => send('exportJpg') },
        { type: 'separator' },
        { label: 'Import Custom Asset…', click: () => send('importAsset') },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { label: 'Undo', accelerator: 'CmdOrCtrl+Z', click: () => send('undo') },
        { label: 'Redo', accelerator: 'CmdOrCtrl+Y', click: () => send('redo') },
        { type: 'separator' },
        { label: 'Duplicate', accelerator: 'CmdOrCtrl+D', click: () => send('duplicate') },
        { label: 'Select All Objects', accelerator: 'CmdOrCtrl+A', click: () => send('selectAll') },
        { label: 'Map Size…', click: () => send('resize') }
      ]
    },
    {
      label: 'View',
      submenu: [
        { label: 'Zoom In', accelerator: 'CmdOrCtrl+=', click: () => send('zoomIn') },
        { label: 'Zoom Out', accelerator: 'CmdOrCtrl+-', click: () => send('zoomOut') },
        { label: 'Fit to Window', accelerator: 'CmdOrCtrl+0', click: () => send('zoomFit') },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        { role: 'toggleDevTools' }
      ]
    },
    {
      label: 'Help',
      submenu: [
        { label: 'Asset & Font Licences', click: () => send('credits') },
        { label: 'Keyboard Shortcuts', click: () => send('shortcuts') },
        { label: 'Find More Free Assets (Kenney.nl, CC0)', click: () => shell.openExternal('https://kenney.nl/assets') },
        { label: 'Find More Free Icons (game-icons.net, CC BY 3.0)', click: () => shell.openExternal('https://game-icons.net') }
      ]
    }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ---------- IPC: file dialogs ----------
ipcMain.handle('save-project', async (_e, { data, filePath }) => {
  let target = filePath;
  if (!target) {
    const r = await dialog.showSaveDialog(win, {
      title: 'Save Map',
      defaultPath: 'my-map.mapp',
      filters: [{ name: 'Pocket-Mapp-Creator Map', extensions: ['mapp'] }]
    });
    if (r.canceled || !r.filePath) return null;
    target = r.filePath;
  }
  fs.writeFileSync(target, data, 'utf8');
  return target;
});

ipcMain.handle('open-project', async () => {
  const r = await dialog.showOpenDialog(win, {
    title: 'Open Map',
    properties: ['openFile'],
    filters: [{ name: 'Pocket-Mapp-Creator Map', extensions: ['mapp', 'json'] }]
  });
  if (r.canceled || !r.filePaths.length) return null;
  return { filePath: r.filePaths[0], data: fs.readFileSync(r.filePaths[0], 'utf8') };
});

ipcMain.handle('export-image', async (_e, { dataUrl, ext }) => {
  const r = await dialog.showSaveDialog(win, {
    title: 'Export Map',
    defaultPath: `my-map.${ext}`,
    filters: [{ name: ext.toUpperCase(), extensions: [ext] }]
  });
  if (r.canceled || !r.filePath) return null;
  const b64 = dataUrl.split(',')[1];
  fs.writeFileSync(r.filePath, Buffer.from(b64, 'base64'));
  return r.filePath;
});

ipcMain.handle('import-assets', async () => {
  const r = await dialog.showOpenDialog(win, {
    title: 'Import Custom Assets',
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'Images', extensions: ['png', 'svg', 'jpg', 'jpeg', 'webp'] }]
  });
  if (r.canceled) return [];
  return r.filePaths.map((p) => {
    const ext = path.extname(p).slice(1).toLowerCase();
    const mime = ext === 'svg' ? 'image/svg+xml' : ext === 'jpg' ? 'image/jpeg' : `image/${ext}`;
    return {
      name: path.basename(p, path.extname(p)),
      dataUrl: `data:${mime};base64,${fs.readFileSync(p).toString('base64')}`
    };
  });
});

ipcMain.handle('confirm', async (_e, { message, detail }) => {
  const r = await dialog.showMessageBox(win, {
    type: 'question', buttons: ['Yes', 'Cancel'], defaultId: 0, cancelId: 1, message, detail
  });
  return r.response === 0;
});

// Headless screenshot hook used for automated testing only
ipcMain.handle('test-capture', async (_e, outPath) => {
  const img = await win.webContents.capturePage();
  fs.writeFileSync(outPath, img.toPNG());
  return true;
});

ipcMain.handle('test-write', async (_e, { outPath, dataUrl }) => {
  if (!process.env.MAPP_TEST) return false;
  fs.writeFileSync(outPath, Buffer.from(dataUrl.split(',')[1], 'base64'));
  return true;
});

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
