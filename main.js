const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: true,
      contextIsolation: false
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
ipcMain.handle('select-folder', async (event) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory']
  });
  
  if (!result.canceled) {
    return result.filePaths[0];
  }
  return null;
});

// Handle folder scanning and data preparation
ipcMain.handle('prepare-folder-data', async (event, folderPath) => {
  try {
    const folderData = await scanFolder(folderPath);
    const serializedData = JSON.stringify(folderData);
    return serializedData;
  } catch (error) {
    console.error('Error preparing folder data:', error);
    return null;
  }
});

// Handle saving folder data on receiver end
ipcMain.handle('save-folder-data', async (event, data, destinationPath) => {
  try {
    const folderData = JSON.parse(data);
    await recreateFolder(folderData, destinationPath);
    return true;
  } catch (error) {
    console.error('Error saving folder data:', error);
    return false;
  }
});

// Function to scan folder and build a data structure
async function scanFolder(rootPath, relativePath = '') {
  const folderData = {
    name: path.basename(rootPath),
    type: 'folder',
    path: relativePath,
    children: []
  };
  
  const entries = fs.readdirSync(rootPath, { withFileTypes: true });
  
  for (const entry of entries) {
    const entryPath = path.join(rootPath, entry.name);
    const entryRelativePath = path.join(relativePath, entry.name);
    
    if (entry.isDirectory()) {
      const subFolderData = await scanFolder(entryPath, entryRelativePath);
      folderData.children.push(subFolderData);
    } else if (entry.isFile()) {
      const fileContent = fs.readFileSync(entryPath);
      const fileHash = crypto.createHash('md5').update(fileContent).digest('hex');
      
      folderData.children.push({
        name: entry.name,
        type: 'file',
        path: entryRelativePath,
        content: fileContent.toString('base64'),
        hash: fileHash,
        size: fileContent.length
      });
    }
  }
  
  return folderData;
}

// Function to recreate folder structure and files
async function recreateFolder(folderData, rootPath) {
  const folderPath = path.join(rootPath, folderData.name);
  
  // Create the folder
  if (!fs.existsSync(folderPath)) {
    fs.mkdirSync(folderPath, { recursive: true });
  }
  
  // Process all children
  for (const child of folderData.children) {
    const childPath = path.join(folderPath, child.name);
    
    if (child.type === 'folder') {
      await recreateFolder(child, folderPath);
    } else if (child.type === 'file') {
      const fileContent = Buffer.from(child.content, 'base64');
      fs.writeFileSync(childPath, fileContent);
      
      // Verify file hash
      const writtenFileContent = fs.readFileSync(childPath);
      const writtenFileHash = crypto.createHash('md5').update(writtenFileContent).digest('hex');
      
      if (writtenFileHash !== child.hash) {
        console.error(`File integrity check failed for ${childPath}`);
      }
    }
  }
}