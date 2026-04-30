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
  enviarEstadoUpdate('Buscando actualizaciones...');
});

autoUpdater.on('update-available', (info) => {
  enviarEstadoUpdate(`Nueva versión ${info.version} disponible. Descargando...`);
});

autoUpdater.on('update-not-available', () => {
  enviarEstadoUpdate('La aplicación está actualizada.');
});

autoUpdater.on('download-progress', (progress) => {
  enviarEstadoUpdate(`Descargando actualización: ${Math.round(progress.percent)}%`);
});

autoUpdater.on('update-downloaded', (info) => {
  // Notificar al usuario y reiniciar
  if (win && !win.isDestroyed()) {
    dialog.showMessageBox(win, {
      type: 'info',
      title: 'Actualización lista',
      message: `La versión ${info.version} se descargó correctamente.`,
      detail: 'La aplicación se reiniciará para aplicar la actualización.',
      buttons: ['Reiniciar ahora', 'Más tarde']
    }).then((result) => {
      if (result.response === 0) {
        autoUpdater.quitAndInstall();
      }
    });
  }
});

autoUpdater.on('error', (err) => {
  enviarEstadoUpdate('');
  console.error('Error en auto-updater:', err);
});

function enviarEstadoUpdate(msg) {
  if (win && !win.isDestroyed()) {
    win.webContents.send('update-status', msg);
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

  // Buscar actualizaciones al iniciar (después de 5 segundos)
  setTimeout(() => {
    autoUpdater.checkForUpdatesAndNotify();
  }, 5000);

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
    show: true,
    title: 'Imprimir - Bodega A&M',
    alwaysOnTop: true,
    webPreferences: { nodeIntegration: false, contextIsolation: true }
  });

  printWin.setMenuBarVisibility(false);
  printWin.loadFile(tmpHtml);

  printWin.webContents.on('did-finish-load', () => {
    // Abre el diálogo de impresión del sistema con Ctrl+P
    printWin.webContents.executeJavaScript(`
      setTimeout(() => {
        window.print();
      }, 500);
    `);
    try { event.reply('impresion-terminada'); } catch(e) {}
  });

  printWin.on('closed', () => {
    try { fs.unlinkSync(tmpHtml); } catch(e) {}
    if (win && !win.isDestroyed()) win.focus();
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
