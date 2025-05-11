window.addEventListener('DOMContentLoaded', () => {
    // Expose IPC renderer to the window
    window.ipcRenderer = require('electron').ipcRenderer;
  });