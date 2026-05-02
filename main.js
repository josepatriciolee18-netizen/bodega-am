const { app, BrowserWindow, ipcMain, dialog, Notification } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

let win;
let autoUpdater;

// ── Auto-Updater (con protección contra errores) ──────────
try {
  autoUpdater = require('electron-updater').autoUpdater;
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
    setTimeout(() => {
      autoUpdater.autoInstallOnAppQuit = true;
      app.isQuiting = true;
      autoUpdater.quitAndInstall(false, true);
    }, 2000);
  });

  autoUpdater.on('error', (err) => {
    enviarEstadoUpdate('error', '', 0);
    console.error('Error en auto-updater:', err);
  });
} catch(e) {
  console.error('Auto-updater no disponible:', e);
}

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
  // Forzar foco en cada carga de página (incluyendo reloads por logout)
  win.webContents.on('did-finish-load', () => {
    win.webContents.executeJavaScript('document.body.style.zoom = "1"');
    win.focus();
    win.webContents.focus();
  });

  // Buscar actualizaciones inmediatamente al iniciar
  win.webContents.once('did-finish-load', () => {
    if (autoUpdater) {
      try { autoUpdater.checkForUpdates(); } catch(e) { console.error('Update check failed:', e); }
    }
  });

  // Revisar cada 30 minutos
  setInterval(() => {
    if (autoUpdater) {
      try { autoUpdater.checkForUpdatesAndNotify(); } catch(e) {}
    }
  }, 30 * 60 * 1000);
}

app.whenReady().then(createWindow);

// Permitir que el renderer pida buscar actualizaciones manualmente
ipcMain.on('check-for-updates', () => {
  if (autoUpdater) {
    try { autoUpdater.checkForUpdatesAndNotify(); } catch(e) {}
  }
});

// Enviar versión de la app al renderer
ipcMain.on('get-version', (event) => {
  event.reply('app-version', app.getVersion());
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin' || app.isQuiting) app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });

ipcMain.on('recargar', () => {
  // Destruir ventana actual y crear una nueva (soluciona bug de foco)
  const bounds = win.getBounds();
  const wasMaximized = win.isMaximized();
  win.destroy();
  win = new BrowserWindow({
    width: bounds.width,
    height: bounds.height,
    x: bounds.x,
    y: bounds.y,
    minWidth: 800,
    minHeight: 600,
    title: 'Bodega A&M',
    show: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      webSecurity: false,
      allowRunningInsecureContent: true
    }
  });
  win.loadFile('index.html');
  win.setMenuBarVisibility(false);
  if (wasMaximized) win.maximize();
  win.show();
  win.webContents.on('did-finish-load', () => {
    win.webContents.executeJavaScript('document.body.style.zoom = "1"');
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

// Notificaciones persistentes de Windows
ipcMain.on('mostrar-notificacion', (event, { titulo, mensaje, nroOrden }) => {
  const notif = new Notification({
    title: titulo,
    body: mensaje,
    silent: false,
    urgency: 'critical',
    timeoutType: 'never'
  });
  notif.on('click', () => {
    if (win && !win.isDestroyed()) {
      win.show();
      win.focus();
    }
  });
  notif.show();
});

// Impresión térmica - muestra ventana con contenido
ipcMain.on('imprimir', (event, htmlContent) => {
  const tmpHtml = path.join(os.tmpdir(), 'bodega_termica.html');
  // Quitar el script de window.print() del HTML porque lo manejamos desde aquí
  const htmlLimpio = htmlContent.replace(/<script>.*?<\/script>/gs, '');
  fs.writeFileSync(tmpHtml, htmlLimpio, 'utf-8');

  const printWin = new BrowserWindow({
    width: 350,
    height: 600,
    show: true,
    title: 'Imprimir - Bodega A&M',
    alwaysOnTop: true,
    webPreferences: { nodeIntegration: false, contextIsolation: true }
  });

  printWin.setMenuBarVisibility(false);
  printWin.loadURL('file:///' + tmpHtml.replace(/\\/g, '/'));

  let printDialogOpen = false;

  printWin.on('blur', () => {
    printDialogOpen = true;
  });

  printWin.on('focus', () => {
    if (printDialogOpen) {
      setTimeout(() => {
        if (!printWin.isDestroyed()) printWin.close();
      }, 300);
    }
  });

  printWin.webContents.on('did-finish-load', () => {
    setTimeout(() => {
      printWin.webContents.executeJavaScript('window.print()');
    }, 800);
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
