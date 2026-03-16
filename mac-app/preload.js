const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getConfig: () => ipcRenderer.invoke('get-config'),
  setConfig: (cfg) => ipcRenderer.invoke('set-config', cfg),
  checkControlUI: (url) => ipcRenderer.invoke('check-control-ui', url),
  openMainWindow: (url) => ipcRenderer.invoke('open-main-window', url),
  getGatewayToken: () => ipcRenderer.invoke('get-gateway-token'),
  setGatewayToken: (token) => ipcRenderer.invoke('set-gateway-token', token),
  startOpenclaw: () => ipcRenderer.invoke('start-openclaw'),
});
