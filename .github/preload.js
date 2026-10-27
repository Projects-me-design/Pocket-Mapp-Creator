// Pocket-Mapp-Creator — preload bridge
// Copyright (c) 2026 project-tech-me — MIT Licence
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('mapp', {
  saveProject: (data, filePath) => ipcRenderer.invoke('save-project', { data, filePath }),
  openProject: () => ipcRenderer.invoke('open-project'),
  exportImage: (dataUrl, ext) => ipcRenderer.invoke('export-image', { dataUrl, ext }),
  importAssets: () => ipcRenderer.invoke('import-assets'),
  confirm: (message, detail) => ipcRenderer.invoke('confirm', { message, detail }),
  testCapture: (p) => ipcRenderer.invoke('test-capture', p),
  testWrite: (outPath, dataUrl) => ipcRenderer.invoke('test-write', { outPath, dataUrl }),
  testMode: process.env.MAPP_TEST || '',
  onMenu: (fn) => ipcRenderer.on('menu', (_e, cmd) => fn(cmd))
});
