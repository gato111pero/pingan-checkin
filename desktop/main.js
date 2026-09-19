const { app, BrowserWindow, shell } = require('electron');
const path = require('path');
const { startServer } = require('./server');

const PORT = 3377;
let mainWindow = null;

async function createWindow() {
  const { url } = await startServer(PORT);

  mainWindow = new BrowserWindow({
    width: 440,
    height: 840,
    minWidth: 380,
    minHeight: 600,
    title: '平安签到',
    autoHideMenuBar: true,
    backgroundColor: '#f4f7f6',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadURL(url);

  // 外部链接用系统浏览器打开
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
