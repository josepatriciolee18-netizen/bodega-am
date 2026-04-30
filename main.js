const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const fs = require('fs');
const os = require('os');

let win;

// ── Auto-Updater ──────────────────────────────────────────
autoUpdater.autoDownload = true;
autoUpdater.autoInstallOnAppQuit = true;

autoUpdater.on('checking-for-update', () => {
  enviarEstadoUpdate('checking', 'Buscando actualizaciones...', 0);
});

autoUpdater.on('update-available', (info) => {
  enviarEstadoUpdate('downloading', `Descargando versión ${info.version}...`, 0);
});

autoUpdater.on('update-not-available', () => {
  enviarEstadoUpdate('no-update', 'Aplicación actualizada', 0);
});

autoUpdater.on('download-progress', (progress) => {
  enviarEstadoUpdate('downloading', `Descargando actualización...`, Math.round(progress.percent));
});

autoUpdater.on('update-downloaded', (info) => {
  enviarEstadoUpdate('ready', `Versión ${info.version} lista. Reiniciando...`, 100);
  // Reiniciar automáticamente después de 2 segundos
  setTimeout(() => {
    autoUpdater.quitAndInstall();
  }, 2000);
});

autoUpdater.on('error', (err) => {
  enviarEstadoUpdate('error', '', 0);
  console.error('Error en auto-updater:', err);
});

function enviarEstadoUpdate(status, msg, percent) {
  if (win && !win.isDestroyed()) {
    win.webContents.send('update-status', { status, msg, percent });
  }
}

// ── Ventana principal ─────────────────────────────────────
function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: 'Bodega A&M',
    show: false,
    fullscreen: false,
    maximizable: true,
    minimizable: true,
    closable: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      webSecurity: false,
      allowRunningInsecureContent: true
    }
  });

  win.loadFile('index.html');
  win.setMenuBarVisibility(false);
  win.maximize();
  win.show();
  // Forzar repintado para que los estilos carguen correctamente
  win.webContents.once('did-finish-load', () => {
    win.webContents.executeJavaScript('document.body.style.zoom = "1"');
  });

  // Buscar actualizaciones inmediatamente al iniciar
  win.webContents.once('did-finish-load', () => {
    autoUpdater.checkForUpdates();
  });

  // Revisar cada 30 minutos
  setInterval(() => {
    autoUpdater.checkForUpdatesAndNotify();
  }, 30 * 60 * 1000);
}

app.whenReady().then(createWindow);

// Permitir que el renderer pida buscar actualizaciones manualmente
ipcMain.on('check-for-updates', () => {
  autoUpdater.checkForUpdatesAndNotify();
});

// Enviar versión de la app al renderer
ipcMain.on('get-version', (event) => {
  event.reply('app-version', app.getVersion());
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });

ipcMain.on('recargar', () => {
  win.webContents.reload();
  win.webContents.once('did-finish-load', () => {
    win.focus();
    win.webContents.focus();
  });
});

ipcMain.on('ventana-minimizar', () => win.minimize());
ipcMain.on('ventana-maximizar', () => { win.isFullScreen() ? win.setFullScreen(false) : win.setFullScreen(true); });
ipcMain.on('ventana-cerrar', () => win.close());

ipcMain.on('forzarFoco', () => {
  win.focus();
  win.webContents.focus();
});

// Impresión térmica - muestra ventana con contenido
ipcMain.on('imprimir', (event, htmlContent) => {
  const tmpHtml = path.join(os.tmpdir(), 'bodega_termica.html');
  fs.writeFileSync(tmpHtml, htmlContent, 'utf-8');

  const printWin = new BrowserWindow({
    width: 350,
    height: 600,
    show: false,
    title: 'Imprimir - Bodega A&M',
    alwaysOnTop: true,
    webPreferences: { nodeIntegration: false, contextIsolation: true }
  });

  printWin.setMenuBarVisibility(false);
  printWin.loadFile(tmpHtml);

  printWin.webContents.on('did-finish-load', () => {
    printWin.webContents.print(
      { silent: false, printBackground: true, color: false },
      (success, failureReason) => {
        setTimeout(() => {
          if (!printWin.isDestroyed()) printWin.close();
          try { fs.unlinkSync(tmpHtml); } catch(e) {}
          if (win && !win.isDestroyed()) win.focus();
        }, 300);
        try { event.reply('impresion-terminada'); } catch(e) {}
      }
    );
  });
});

// Impresión carta - usa ventana Electron directamente
ipcMain.on('imprimirCarta', (event, htmlContent) => {
  const tmpFile = path.join(os.tmpdir(), 'bodega_reporte.html');
  fs.writeFileSync(tmpFile, htmlContent, 'utf-8');

  const printWin = new BrowserWindow({
    width: 800,
    height: 600,
    show: false,
    webPreferences: { nodeIntegration: false, contextIsolation: true }
  });

  printWin.loadFile(tmpFile);
  printWin.webContents.on('did-finish-load', () => {
    printWin.webContents.print(
      { silent: false, printBackground: false, color: false },
      (success) => {
        setTimeout(() => {
          printWin.close();
          try { fs.unlinkSync(tmpFile); } catch(e) {}
          if (win && !win.isDestroyed()) win.focus();
        }, 500);
      }
    );
  });
});
