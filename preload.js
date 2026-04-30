const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('visualDataTransfer', {
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  prepareFolderData: (folderPath) => ipcRenderer.invoke('prepare-folder-data', folderPath),
  saveFolderData: (data, destinationPath) => ipcRenderer.invoke('save-folder-data', data, destinationPath)
});
