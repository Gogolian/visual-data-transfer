const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const { scanFolder, recreateFolder } = require('./folder-transfer');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  mainWindow.loadFile('index.html');
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});

// IPC handlers for folder selection
ipcMain.handle('select-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory']
  });
  
  if (!result.canceled) {
    return result.filePaths[0];
  }
  return null;
});

// Handle folder scanning and data preparation
ipcMain.handle('prepare-folder-data', async (_event, folderPath) => {
  try {
    if (typeof folderPath !== 'string') {
      throw new Error('Invalid folder path.');
    }

    const folderData = await scanFolder(folderPath);
    return JSON.stringify(folderData);
  } catch (error) {
    console.error('Error preparing folder data:', error);
    return null;
  }
});

// Handle saving folder data on receiver end
ipcMain.handle('save-folder-data', async (_event, data, destinationPath) => {
  try {
    if (typeof data !== 'string' || typeof destinationPath !== 'string') {
      throw new Error('Invalid save request.');
    }

    const folderData = JSON.parse(data);
    await recreateFolder(folderData, destinationPath);
    return true;
  } catch (error) {
    console.error('Error saving folder data:', error);
    return false;
  }
});
