// â”€â”€ Estado â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

// â”€â”€ FunciÃ³n de hash para contraseÃ±as â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function hashPasswordSync(password) {
  if (window.require) {
    try {
      const crypto = window.require('crypto');
      return crypto.createHash('sha256').update(password).digest('hex');
    } catch(e) {}
  }
  // Fallback simple
  let hash = 0;
  for (let i = 0; i < password.length; i++) {
    const char = password.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return 'hash_' + Math.abs(hash).toString(16);
}
async function hashPassword(password) {
  return hashPasswordSync(password);
}

// â”€â”€ Auto-Update listener â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function verificarInternet() {
  return new Promise((resolve) => {
    let resuelto = false;
    const resolver = (val) => { if (!resuelto) { resuelto = true; resolve(val); } };
    // Intentar varios sitios
    const urls = [
      'https://www.google.com/favicon.ico',
      'https://www.cloudflare.com/favicon.ico',
      'https://firestore.googleapis.com'
    ];
    urls.forEach(url => {
      fetch(url, { mode: 'no-cors', cache: 'no-store' })
        .then(() => resolver(true))
        .catch(() => {});
    });
    // TambiÃ©n verificar con navigator.onLine
    if (navigator.onLine) {
      setTimeout(() => resolver(true), 2000);
    }
    // Timeout de 10 segundos
    setTimeout(() => resolver(false), 10000);
  });
}

async function iniciarApp() {
  const hayInternet = await verificarInternet();

  if (!hayInternet) {
    // Sin internet â†’ mostrar pantalla de error
    document.getElementById('updateScreen').style.display = 'none';
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('noInternetScreen').style.display = 'flex';
    return;
  }

  // Hay internet â†’ continuar con verificaciÃ³n de updates
  if (window.require) {
    const { ipcRenderer } = window.require('electron');

    document.getElementById('updateScreen').style.display = 'flex';
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('noInternetScreen').style.display = 'none';

    ipcRenderer.on('update-status', (event, data) => {
      const updateScreen = document.getElementById('updateScreen');
      const loginScreen  = document.getElementById('loginScreen');
      const msg          = document.getElementById('updateMsg');
      const progress     = document.getElementById('updateProgress');
      const progressFill = document.getElementById('updateProgressFill');
      const detail       = document.getElementById('updateDetail');

      window._updateDescargando = false;

      if (data.status === 'checking') {
        msg.textContent = 'ðŸ” Buscando actualizaciones...';
        detail.textContent = 'Espera un momento';
      } else if (data.status === 'downloading') {
        window._updateDescargando = true;
        msg.textContent = 'â¬‡ Actualizando...';
        progress.style.display = 'block';
        progressFill.style.width = data.percent + '%';
        detail.textContent = data.percent + '% descargado';
      } else if (data.status === 'ready') {
        window._updateDescargando = true;
        msg.textContent = 'âœ” ActualizaciÃ³n lista';
        progress.style.display = 'block';
        progressFill.style.width = '100%';
        detail.textContent = 'Reiniciando aplicaciÃ³n...';
      } else if (data.status === 'no-update' || data.status === 'error') {
        updateScreen.style.display = 'none';
        loginScreen.style.display = 'flex';
      }
    });

    // Si despuÃ©s de 30 segundos no hay respuesta del updater, mostrar login
    // PERO si estÃ¡ descargando, NO mostrar login hasta que termine
    setTimeout(() => {
      const updateScreen = document.getElementById('updateScreen');
      if (updateScreen.style.display !== 'none' && !window._updateDescargando) {
        updateScreen.style.display = 'none';
        document.getElementById('loginScreen').style.display = 'flex';
      }
    }, 30000);

  } else {
    document.getElementById('loginScreen').style.display = 'flex';
  }
}

// BotÃ³n reintentar
document.getElementById('btnReintentar').addEventListener('click', () => {
  document.getElementById('noInternetScreen').style.display = 'none';
  document.getElementById('updateScreen').style.display = 'flex';
  document.getElementById('updateMsg').textContent = 'ðŸ” Verificando conexiÃ³n...';
  iniciarApp();
});

// Iniciar
iniciarApp();

// Registrar listeners de login inmediatamente
document.getElementById('btnLogin').addEventListener('click', hacerLogin);
document.getElementById('loginClave').addEventListener('keydown', e => {
  if (e.key === 'Enter') hacerLogin();
});

let productos = [];
let historial    = JSON.parse(localStorage.getItem('historialSalidas')    || '[]');
let catalogo     = JSON.parse(localStorage.getItem('catalogoProductos')   || '[]');
let usuarios     = JSON.parse(localStorage.getItem('usuariosBodega')      || '[]');
let clientes     = JSON.parse(localStorage.getItem('clientesBodega')      || '[]');
let recepciones  = JSON.parse(localStorage.getItem('recepcionesBodega')   || '[]');
let contador     = parseInt(localStorage.getItem('contadorSalidas')       || '1');
let contadorRec  = parseInt(localStorage.getItem('contadorRecepciones')   || '1');
let usuarioActivo    = null;
let ordenImpresion   = null;
let ordenEnRecepcion = null;
let logActividad     = [];

function winMinimizar() {
  if (window.require) {
    const { ipcRenderer } = window.require('electron');
    ipcRenderer.send('ventana-minimizar');
  }
}
function winMaximizar() {
  if (window.require) {
    const { ipcRenderer } = window.require('electron');
    ipcRenderer.send('ventana-maximizar');
  }
}
function winCerrar() {
  if (!confirm('Â¿EstÃ¡s seguro de cerrar la aplicaciÃ³n?')) return;
  if (window.require) {
    const { ipcRenderer } = window.require('electron');
    ipcRenderer.send('ventana-cerrar');
  }
}

// â”€â”€ Login â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Usuario admin por defecto si no existe
if (!usuarios.some(u => u.login === 'admin')) {
  usuarios.push({ nombre: 'Administrador', login: 'admin', password: 'admin123', rol: 'Admin', activo: true });
  localStorage.setItem('usuariosBodega', JSON.stringify(usuarios));
}

function verificarSesion() {
  // Recupera sesiÃ³n temporal de localStorage (viene de limpiar/nueva orden)
  const sesionTemp = localStorage.getItem('sesionTemp');
  if (sesionTemp) {
    localStorage.removeItem('sesionTemp');
    localStorage.setItem('sesionActiva', sesionTemp);
  }
  const sesion = localStorage.getItem('sesionActiva');
  if (sesion) {
    const sesionGuardada = JSON.parse(sesion);
    // Si la lista de usuarios estÃ¡ vacÃ­a, usar la sesiÃ³n guardada directamente (aÃºn no cargÃ³ Firebase)
    if (usuarios.length === 0) {
      usuarioActivo = sesionGuardada;
    } else {
      // Siempre cargar permisos frescos desde la lista de usuarios actual
      const usuarioFresco = usuarios.find(u => u.login === sesionGuardada.login && u.activo);
      if (usuarioFresco) {
        usuarioActivo = usuarioFresco;
        localStorage.setItem('sesionActiva', JSON.stringify(usuarioFresco));
      } else {
        // Usuario no existe o fue desactivado â€” cerrar sesiÃ³n
        localStorage.removeItem('sesionActiva');
        return;
      }
    }
    // Solo mostrar app si no estamos en pantalla de actualizaciÃ³n
    const updateScreen = document.getElementById('updateScreen');
    if (!updateScreen || updateScreen.style.display === 'none') {
      mostrarApp();
    } else {
      const checkInterval = setInterval(() => {
        if (updateScreen.style.display === 'none') {
          clearInterval(checkInterval);
          mostrarApp();
        }
      }, 500);
    }
  }
}

function mostrarApp() {
  try {
  document.getElementById('loginScreen').style.display = 'none';
  document.getElementById('updateScreen').style.display = 'none';
  document.getElementById('noInternetScreen').style.display = 'none';
  document.getElementById('appMain').style.display = 'block';
  document.getElementById('headerUsuario').textContent = `ðŸ‘¤ ${usuarioActivo.nombre} (${usuarioActivo.rol})`;

  // Mostrar fecha en formato "30 Abril 2026"
  const ahora = new Date();
  const opcFecha = { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Santiago' };
  document.getElementById('headerFecha').textContent = `ðŸ“… ${ahora.toLocaleDateString('es-CL', opcFecha)}`;

  // Actualizar nÃºmero de salida desde Firebase
  if (window.fbListo) {
    fbCargar('config').then(datos => {
      const cfg = datos.find(c => c.valor !== undefined);
      if (cfg) {
        contador = cfg.valor;
        localStorage.setItem('contadorSalidas', contador);
        nroSalidaEl.value = generarNro(contador);
      }
    });
  }

  // Mostrar versiÃ³n automÃ¡ticamente
  try {
    if (window.require) {
      const { ipcRenderer } = window.require('electron');
      ipcRenderer.send('get-version');
      ipcRenderer.once('app-version', (event, version) => {
        document.getElementById('appVersion').textContent = 'v' + version;
      });
    }
  } catch(e) {}

  const p = usuarioActivo.permisos || {};
  const esAdmin = usuarioActivo.rol === 'Admin';
  window._puedeEliminarReporte = esAdmin || p.eliminarReporte;

  // Aplicar permisos y activar primera pestaÃ±a visible
  aplicarPermisos();

  // Sincronizar con Firebase despuÃ©s del login
  setTimeout(() => esperarFirebase(), 500);
  
  // Mostrar mensaje del admin si existe
  setTimeout(() => mostrarMensajeAdmin(), 3000);
  
  // Verificador de sesiÃ³n desactivado â€” no es necesario con usuarios diferentes por PC
  // Si en el futuro necesitas reactivarlo, descomentar el bloque de abajo
  /*
  if (window._checkSesionInterval) clearInterval(window._checkSesionInterval);
  window._checkSesionInterval = setInterval(async () => {
    if (!usuarioActivo || !window.fbListo) return;
    const miSesion = localStorage.getItem('sesionId');
    if (!miSesion) return;
    try {
      const sesiones = await fbCargar('sesiones');
      if (!sesiones || sesiones.length === 0) return;
      const encontrada = sesiones.find(s => s.sesionId === miSesion);
      if (!encontrada) {
        const miUsuarioSesion = sesiones.find(s => s.sesionId && s.sesionId !== miSesion);
        if (!miUsuarioSesion) return;
        showToast('Tu sesiÃ³n fue cerrada porque otro dispositivo iniciÃ³ sesiÃ³n con este usuario', true);
        setTimeout(() => {
          localStorage.removeItem('sesionActiva');
          localStorage.removeItem('sesionId');
          usuarioActivo = null;
          if (window.require) {
            const { ipcRenderer } = window.require('electron');
            ipcRenderer.send('recargar');
          } else {
            window.location.reload();
          }
        }, 3000);
      }
    } catch(e) {}
  }, 60000);
  */
  } catch(e) {
    console.error('Error en mostrarApp:', e);
  }
}

function hacerLogin() {
  try {
    const login = document.getElementById('loginUsuario').value.trim().toLowerCase();
    const clave = document.getElementById('loginClave').value;
    const errEl = document.getElementById('loginError');
    
    document.getElementById('btnLogin').textContent = 'Ingresando...';
    document.getElementById('btnLogin').disabled = true;

    if (!login || !clave) {
      errEl.style.display = 'block';
      document.getElementById('btnLogin').textContent = 'Ingresar';
      document.getElementById('btnLogin').disabled = false;
      return;
    }

    const claveHash = hashPasswordSync(clave);
    const usuario = usuarios.find(u => {
      if (u.login !== login || !u.activo) return false;
      if (u.password === claveHash) return true;
      if (u.password === clave) return true;
      return false;
    });
    if (!usuario) {
      errEl.style.display = 'block';
      errEl.textContent = 'Usuario o contraseÃ±a incorrectos';
      document.getElementById('loginClave').value = '';
      document.getElementById('btnLogin').textContent = 'Ingresar';
      document.getElementById('btnLogin').disabled = false;
      return;
    }

    // Migrar contraseÃ±a a hash si aÃºn estÃ¡ en texto plano
    if (usuario.password === clave) {
      usuario.password = claveHash;
      localStorage.setItem('usuariosBodega', JSON.stringify(usuarios));
      if (window.fbListo) fbGuardar('usuarios', usuario.login, usuario);
    }

    errEl.style.display = 'none';
    usuarioActivo = usuario;
    diagInicioSesion = Date.now();
    localStorage.setItem('sesionActiva', JSON.stringify(usuario));
    
    // Registrar sesiÃ³n activa en Firebase
    const sesionId = Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
    localStorage.setItem('sesionId', sesionId);
    if (window.fbListo) fbGuardar('sesiones', usuario.login, { sesionId, fecha: fechaHoraLocal() });
    
    document.getElementById('btnLogin').textContent = 'Ingresar';
    document.getElementById('btnLogin').disabled = false;
    mostrarApp();
    registrarActividad('Inicio de sesiÃ³n', `${usuario.nombre} (${usuario.rol})`);
  } catch(e) {
    console.error('Error en login:', e);
    showToast('Error al iniciar sesiÃ³n: ' + e.message, true);
    document.getElementById('btnLogin').textContent = 'Ingresar';
    document.getElementById('btnLogin').disabled = false;
  }
}

document.getElementById('btnLogout').addEventListener('click', () => {
  if (!confirm('Â¿Cerrar sesiÃ³n?')) return;
  registrarActividad('Cierre de sesiÃ³n', `${usuarioActivo ? usuarioActivo.nombre : ''}`);
  localStorage.removeItem('sesionActiva');
  usuarioActivo = null;
  if (window.require) {
    const { ipcRenderer } = window.require('electron');
    ipcRenderer.send('recargar');
  } else {
    window.location.reload();
  }
});

verificarSesion();

// â”€â”€ Elementos â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const form        = document.getElementById('salidaForm');
const tbodyProd   = document.getElementById('tbodyProductos');
const nroSalidaEl = document.getElementById('nroSalida');
const tbodyCat    = document.getElementById('tbodyCatalogo');
const inputBuscar = document.getElementById('inputBuscar');
const sugerencias = document.getElementById('sugerencias');
const solicitanteInput   = document.getElementById('solicitante');
const sugerenciasCliente = document.getElementById('sugerenciasCliente');

// â”€â”€ Init â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
document.getElementById('fecha').value = fechaHoraLocal();
nroSalidaEl.value = generarNro(contador);

// Cargar datos desde Firebase si estÃ¡ disponible
let _unsubscribers = [];
let _cargandoDesdeFirebase = false;
async function cargarDesdeFirebase() {
  if (_cargandoDesdeFirebase) return; // Debounce: ignorar si ya estÃ¡ cargando
  if (!window.fbListo) {
    setTimeout(cargarDesdeFirebase, 500);
    return;
  }
  _cargandoDesdeFirebase = true;
  // Limpiar listeners anteriores para evitar duplicados
  _unsubscribers.forEach(unsub => { try { unsub(); } catch(e) {} });
  _unsubscribers = [];
  try {
    // Cargar contador desde Firebase - siempre usar el valor de la nube
    const fbContador = await fbCargar('config');
    const configContador = fbContador.find(c => c.valor !== undefined);
    if (configContador) {
      contador = configContador.valor;
      localStorage.setItem('contadorSalidas', contador);
      nroSalidaEl.value = generarNro(contador);
    }

    // Cargar usuarios desde Firebase y hacer merge con locales
    const fbUsuarios = await fbCargar('usuarios');
    if (fbUsuarios.length > 0) {
      fbUsuarios.forEach(fbUser => {
        const idx = usuarios.findIndex(u => u.login === fbUser.login);
        if (idx === -1) usuarios.push(fbUser);
        else usuarios[idx] = fbUser;
      });
      localStorage.setItem('usuariosBodega', JSON.stringify(usuarios));
      renderUsuarios();
    }

    showToast('âœ” Conectado a la nube');

    // Cargar caja desde Firebase
    cargarCajaDesdeFirebase();

    // Cargar desde Firebase SOLO si localStorage estÃ¡ vacÃ­o (ahorra miles de lecturas)
    // Si ya hay datos locales, los listeners en tiempo real se encargan de mantenerlos actualizados
    if (historial.length === 0) {
      const fbHistorial = await fbCargar('historial');
      if (fbHistorial.length > 0) {
        historial = fbHistorial.sort((a,b) => b.nro.localeCompare(a.nro));
        localStorage.setItem('historialSalidas', JSON.stringify(historial));
      }
    }
    
    if (recepciones.length === 0) {
      const fbRecepciones = await fbCargar('recepciones');
      if (fbRecepciones.length >= 0) {
        recepciones = fbRecepciones.sort((a,b) => b.nro.localeCompare(a.nro));
        localStorage.setItem('recepcionesBodega', JSON.stringify(recepciones));
      }
    }
    
    renderReportes();
    renderRecepciones();
    renderOrdenesEmitidas();
    buscarOrdenAntigua();

    // Sincronizar contador con el historial real
    if (window.fbSincronizarContador) {
      const contadorReal = await fbSincronizarContador();
      if (contadorReal) {
        contador = contadorReal;
        localStorage.setItem('contadorSalidas', contador);
        nroSalidaEl.value = generarNro(contador);
      }
    }

    // Escuchar cambios en tiempo real - solo se activa cuando hay cambios
    let historialCargadoInicial = false;
    _unsubscribers.push(fbEscuchar('historial', (datos) => {
      const nuevos = datos.sort((a,b) => b.nro.localeCompare(a.nro));
      
      // Usar nÃºmeros de orden como clave para evitar duplicados
      const nrosNuevos = new Set(nuevos.map(n => n.nro));
      const nrosActuales = new Set(historial.map(h => h.nro));
      
      // Verificar si hay cambios reales (nuevas Ã³rdenes, eliminadas, o editadas)
      const hayNuevos = nuevos.some(n => !nrosActuales.has(n.nro));
      const hayEliminados = historial.some(h => !nrosNuevos.has(h.nro));
      // Detectar ediciones: comparar contenido de Ã³rdenes existentes
      const hayEditados = nuevos.some(n => {
        const actual = historial.find(h => h.nro === n.nro);
        if (!actual) return false;
        return JSON.stringify(actual) !== JSON.stringify(n);
      });
      
      if (hayNuevos || hayEliminados || hayEditados || nuevos.length !== historial.length) {
        // Detectar Ã³rdenes nuevas para notificar (solo despuÃ©s de la carga inicial)
        if (historialCargadoInicial) {
          const ordenesNuevas = nuevos.filter(n => !nrosActuales.has(n.nro));
          const ahora = new Date();
          ordenesNuevas.forEach(orden => {
            const fechaOrden = new Date(orden.fecha ? orden.fecha.replace('T', ' ') : 0);
            if ((ahora - fechaOrden) < 5 * 60 * 1000) {
              const quien = orden.rolCreador ? ` â€” Enviada por ${orden.rolCreador}` : '';
              mostrarNotificacion('ðŸ“¦ Nueva Orden', `Orden ${orden.nro} â€” Cliente: ${orden.solicitante || 'Sin nombre'}${quien}`, orden.nro);
            }
          });
        }
        historial = nuevos;
        localStorage.setItem('historialSalidas', JSON.stringify(historial));
        renderReportes();
        renderOrdenesEmitidas();
        buscarOrdenAntigua();
      }
      historialCargadoInicial = true;
    }));

    let recepcionesCargadoInicial = false;
    const recepcionesNotificadas = new Set(JSON.parse(localStorage.getItem('recepcionesNotificadas') || '[]'));
    _unsubscribers.push(fbEscuchar('recepciones', (datos) => {
      const nuevos = datos.sort((a,b) => b.nro.localeCompare(a.nro));
      
      const nrosNuevos = new Set(nuevos.map(n => n.nro));
      const nrosActuales = new Set(recepciones.map(r => r.nro));
      const hayNuevos = nuevos.some(n => !nrosActuales.has(n.nro));
      const hayCambios = nuevos.length !== recepciones.length || hayNuevos;
      
      if (hayCambios) {
        // Detectar recepciones nuevas para notificar
        if (recepcionesCargadoInicial) {
          const recNuevas = nuevos.filter(n => !nrosActuales.has(n.nro) && !recepcionesNotificadas.has(n.nro));
          const ahora = new Date();
          recNuevas.forEach(rec => {
            // Solo notificar recepciones de los Ãºltimos 5 minutos que no se hayan notificado antes
            const fechaRec = new Date(rec.fecha ? rec.fecha.replace('T', ' ') : 0);
            if ((ahora - fechaRec) < 5 * 60 * 1000) {
              mostrarNotificacion('ðŸ“¥ Orden Recibida por Bodega', `${rec.nro} â€” Orden ${rec.nroOrden} recibida por ${rec.recibidoPor}`, rec.nroOrden);
              recepcionesNotificadas.add(rec.nro);
            }
          });
          // Guardar notificadas (mantener solo las Ãºltimas 100)
          const arrNotif = [...recepcionesNotificadas].slice(-100);
          localStorage.setItem('recepcionesNotificadas', JSON.stringify(arrNotif));
        } else {
          // En la primera carga, marcar todas las existentes como ya notificadas
          nuevos.forEach(r => recepcionesNotificadas.add(r.nro));
          localStorage.setItem('recepcionesNotificadas', JSON.stringify([...recepcionesNotificadas].slice(-100)));
        }
        // Firebase es la fuente de verdad
        recepciones = nuevos;
        localStorage.setItem('recepcionesBodega', JSON.stringify(recepciones));
        // Ya NO recargamos historial aquÃ­ â€” el listener de historial lo mantiene actualizado
        renderRecepciones();
        renderOrdenesEmitidas();
        buscarOrdenAntigua();
        renderReportes();
      }
      recepcionesCargadoInicial = true;
    }));

    _unsubscribers.push(fbEscuchar('catalogo', (datos) => {
      if (datos.length !== catalogo.length) {
        catalogo = datos;
        localStorage.setItem('catalogoProductos', JSON.stringify(catalogo));
        renderCatalogo();
      }
    }));

    _unsubscribers.push(fbEscuchar('clientes', (datos) => {
      if (datos.length !== clientes.length) {
        clientes = datos;
        localStorage.setItem('clientesBodega', JSON.stringify(clientes));
        renderClientes();
      }
    }));

    // Escuchar cambios en el contador en tiempo real
    _unsubscribers.push(fbEscuchar('config', (datos) => {
      const cfg = datos.find(c => c.valor !== undefined);
      if (cfg && cfg.valor !== contador) {
        contador = cfg.valor;
        localStorage.setItem('contadorSalidas', contador);
        nroSalidaEl.value = generarNro(contador);
      }
      // Detectar mensaje nuevo del admin en tiempo real
      const msg = datos.find(c => c.texto !== undefined);
      if (msg && msg.texto) {
        const ultimoMsgVisto = localStorage.getItem('ultimoMsgAdmin') || '';
        if (msg.texto !== ultimoMsgVisto) {
          localStorage.setItem('ultimoMsgAdmin', msg.texto);
          showToast('ðŸ“¢ Admin: ' + msg.texto);
          if (window.require) {
            const { ipcRenderer } = window.require('electron');
            ipcRenderer.send('mostrar-notificacion', { titulo: 'ðŸ“¢ Mensaje del Admin', mensaje: msg.texto });
          }
        }
        const el = document.getElementById('mensajeAdminActual');
        if (el) el.textContent = 'Mensaje actual: "' + msg.texto + '"';
      }
    }));

    // Escuchar cambios en usuarios - reemplaza lista completa
    _unsubscribers.push(fbEscuchar('usuarios', (datos) => {
      if (datos.length >= 0) {
        const adminLocal = usuarios.find(u => u.login === 'admin');
        usuarios = datos;
        if (adminLocal && !usuarios.some(u => u.login === 'admin')) {
          usuarios.push(adminLocal);
        }
        localStorage.setItem('usuariosBodega', JSON.stringify(usuarios));
        renderUsuarios();

        // Refrescar permisos del usuario activo si estÃ¡ logeado
        if (usuarioActivo) {
          const usuarioFresco = usuarios.find(u => u.login === usuarioActivo.login && u.activo);
          if (usuarioFresco) {
            usuarioActivo = usuarioFresco;
            localStorage.setItem('sesionActiva', JSON.stringify(usuarioFresco));
            // Reaplicar permisos en las pestaÃ±as
            aplicarPermisos();
          } else if (usuarioActivo.login === 'admin' || usuarioActivo.rol === 'Admin') {
            // Nunca cerrar sesiÃ³n del admin
            aplicarPermisos();
          } else {
            // Usuario desactivado â€” cerrar sesiÃ³n
            localStorage.removeItem('sesionActiva');
            usuarioActivo = null;
            document.getElementById('appMain').style.display = 'none';
            document.getElementById('loginScreen').style.display = 'flex';
            showToast('Tu cuenta fue desactivada', true);
          }
        }
      }
    }));

  } catch(e) {
    console.error('Error Firebase:', e);
  } finally {
    _cargandoDesdeFirebase = false;
  }
}

// Esperar a que Firebase estÃ© listo con polling
function esperarFirebase() {
  if (window.fbListo) {
    cargarDesdeFirebase();
  } else {
    setTimeout(esperarFirebase, 5000);
  }
}

// Actualiza la hora cada minuto
setInterval(() => {
  const campo = document.getElementById('fecha');
  if (!campo.disabled) campo.value = fechaHoraLocal();
}, 60000);
renderCatalogo();
renderReportes();
renderUsuarios();
renderClientes();
buscarOrdenAntigua();

// â”€â”€ PestaÃ±as â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
document.querySelectorAll('.tab').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
    if (btn.dataset.tab === 'reportes') {
      renderReportes();
      const mesActual = new Date().toISOString().slice(0, 7);
      document.getElementById('filtroMes').value = mesActual;
      renderTopMes(mesActual);
    }
    if (btn.dataset.tab === 'recepciones') { renderOrdenesEmitidas(); renderRecepciones(); }
    if (btn.dataset.tab === 'papelera') { renderPapelera(); }
    if (btn.dataset.tab === 'diagnosticos') { diagnosticosRefresh(); diagIniciarIntervalos(); }
    if (btn.dataset.tab !== 'diagnosticos') { diagDetenerIntervalos(); }
  });
});

// â”€â”€ NÃºmero de salida â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function generarNro(n) {
  return 'SAL-' + String(n).padStart(4, '0');
}

// Mostrar/ocultar NÂ° documento segÃºn tipo
document.getElementById('tipoDocumento').addEventListener('change', function () {
  const campo = document.getElementById('campoNroDoc');
  const input = document.getElementById('nroDocumento');
  if (this.value === '') {
    campo.style.display = 'none';
    input.removeAttribute('required');
    input.value = '';
  } else {
    campo.style.display = '';
    input.setAttribute('required', 'required');
  }
});
// Estado inicial oculto
document.getElementById('campoNroDoc').style.display = 'none';

// â”€â”€ Buscador autocomplete â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
let _buscarTimeout = null;
inputBuscar.addEventListener('input', () => {
  if (_buscarTimeout) clearTimeout(_buscarTimeout);
  _buscarTimeout = setTimeout(() => {
    const q = inputBuscar.value.trim().toLowerCase();
    if (!q || q.length < 2 || catalogo.length === 0) { cerrarSugerencias(); return; }
    const filtrados = [];
    for (let i = 0; i < catalogo.length && filtrados.length < 15; i++) {
      const p = catalogo[i];
      if (p.nombre.toLowerCase().includes(q) || p.codigo.toLowerCase().includes(q)) {
        filtrados.push(p);
      }
    }
    if (filtrados.length === 0) { cerrarSugerencias(); return; }
    sugerencias.innerHTML = filtrados.map(p =>
      `<li onclick="seleccionarProducto(${catalogo.indexOf(p)})">
        <strong>${p.nombre}</strong><span>${p.codigo} Â· ${p.unidad}</span>
      </li>`
    ).join('');
    sugerencias.classList.add('visible');
  }, 150);
});

inputBuscar.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return;
  e.preventDefault();
  const q = inputBuscar.value.trim().toLowerCase();
  if (!q) return;

  if (catalogo.length === 0) {
    showToast('El catÃ¡logo de productos estÃ¡ vacÃ­o', true); return;
  }

  // Normaliza cÃ³digo quitando espacios y guiones para comparaciÃ³n flexible
  const norm = s => s.toLowerCase().replace(/[\s\-\.]/g, '');

  const encontrado = catalogo.find(p => norm(p.codigo) === norm(q))
                  || catalogo.find(p => norm(p.nombre)  === norm(q))
                  || catalogo.find(p => norm(p.codigo).includes(norm(q)))
                  || catalogo.find(p => norm(p.nombre).includes(norm(q)));

  if (encontrado) seleccionarProducto(catalogo.indexOf(encontrado));
  else showToast(`No se encontrÃ³ "${inputBuscar.value}" en el catÃ¡logo`, true);
});

// BotÃ³n lupa para buscar producto â€” abre modal de bÃºsqueda
function buscarProductoEnOrden() {
  const q = inputBuscar.value.trim().toLowerCase();
  if (!q) { showToast('Escribe un cÃ³digo o nombre para buscar', true); inputBuscar.focus(); return; }
  if (catalogo.length === 0) { showToast('El catÃ¡logo de productos estÃ¡ vacÃ­o', true); return; }
  const norm = s => s.toLowerCase().replace(/[\s\-\.]/g, '');
  const encontrado = catalogo.find(p => norm(p.codigo) === norm(q))
                  || catalogo.find(p => norm(p.nombre)  === norm(q))
                  || catalogo.find(p => norm(p.codigo).includes(norm(q)))
                  || catalogo.find(p => norm(p.nombre).includes(norm(q)));
  if (encontrado) seleccionarProducto(catalogo.indexOf(encontrado));
  else showToast(`No se encontrÃ³ "${inputBuscar.value}" en el catÃ¡logo`, true);
}

document.getElementById('inputCantidad').addEventListener('input', (e) => {
  const n = parseFloat(e.target.value);
  document.getElementById('inputCantidadPalabras').value = n > 0 ? numeroAPalabras(n) : '';
});

document.getElementById('inputCantidad').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    document.getElementById('btnAgregar').click();
    inputBuscar.focus();
  }
});

function seleccionarProducto(i) {
  const p = catalogo[i];
  document.getElementById('inputCodigo').value      = p.codigo;
  document.getElementById('inputDescripcion').value = p.nombre;
  document.getElementById('inputUnidad').value      = p.unidad;
  inputBuscar.value = '';
  cerrarSugerencias();
  cerrarBuscadorProducto();
  document.getElementById('inputCantidad').focus();
}

// â”€â”€ Modal buscar producto â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
document.getElementById('btnAbrirBuscador').addEventListener('click', () => {
  document.getElementById('modalBuscarProducto').style.display = 'flex';
  document.getElementById('buscadorProductoInput').value = '';
  document.getElementById('tbodyBuscadorProducto').innerHTML = '<tr><td colspan="4" class="empty-msg">Ingresa un cÃ³digo o nombre para buscar</td></tr>';
  setTimeout(() => document.getElementById('buscadorProductoInput').focus(), 200);
});

function cerrarBuscadorProducto() {
  document.getElementById('modalBuscarProducto').style.display = 'none';
}

document.getElementById('modalBuscarProducto').addEventListener('click', (e) => {
  if (e.target === document.getElementById('modalBuscarProducto')) cerrarBuscadorProducto();
});

function ejecutarBusquedaProducto() {
  const q = document.getElementById('buscadorProductoInput').value.trim().toLowerCase();
  const tbody = document.getElementById('tbodyBuscadorProducto');
  if (!q || q.length < 2) {
    tbody.innerHTML = '<tr><td colspan="4" class="empty-msg">Ingresa al menos 2 caracteres para buscar</td></tr>';
    return;
  }
  if (catalogo.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" class="empty-msg">El catÃ¡logo estÃ¡ vacÃ­o</td></tr>';
    return;
  }
  const resultados = [];
  for (let i = 0; i < catalogo.length && resultados.length < 30; i++) {
    const p = catalogo[i];
    if (p.nombre.toLowerCase().includes(q) || (p.codigo && p.codigo.toLowerCase().includes(q))) {
      resultados.push(p);
    }
  }
  if (resultados.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" class="empty-msg">No se encontraron productos</td></tr>';
    return;
  }
  tbody.innerHTML = resultados.map(p => `
    <tr>
      <td>${p.codigo || '-'}</td>
      <td>${p.nombre}</td>
      <td>${p.unidad}</td>
      <td><button class="btn-add" style="padding:4px 12px;font-size:0.8rem" onclick="seleccionarProducto(${catalogo.indexOf(p)})">Seleccionar</button></td>
    </tr>`).join('');
}

let _buscarModalTimeout = null;
document.getElementById('btnEjecutarBusqueda').addEventListener('click', ejecutarBusquedaProducto);
document.getElementById('buscadorProductoInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') ejecutarBusquedaProducto();
});
document.getElementById('buscadorProductoInput').addEventListener('input', () => {
  if (_buscarModalTimeout) clearTimeout(_buscarModalTimeout);
  _buscarModalTimeout = setTimeout(ejecutarBusquedaProducto, 150);
});

function cerrarSugerencias() {
  sugerencias.innerHTML = '';
  sugerencias.classList.remove('visible');
}

document.addEventListener('click', (e) => {
  if (!e.target.closest('.add-product-row')) cerrarSugerencias();
});

// â”€â”€ Agregar producto a la salida â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
document.getElementById('btnAgregar').addEventListener('click', () => {
  // Validar que los datos generales estÃ©n llenos antes de agregar productos
  const tipoDoc = document.getElementById('tipoDocumento').value;
  const cliente = document.getElementById('solicitante').value.trim();
  if (!tipoDoc) { showToast('Primero selecciona el Tipo de Documento', true); document.getElementById('tipoDocumento').focus(); return; }
  const campoNroVisible = document.getElementById('campoNroDoc').style.display !== 'none';
  const nroDoc = document.getElementById('nroDocumento').value.trim();
  if (campoNroVisible && !nroDoc) { showToast('Primero ingresa el NÂ° de Documento', true); document.getElementById('nroDocumento').focus(); return; }
  if (!cliente) { showToast('Primero ingresa el nombre del Cliente', true); document.getElementById('solicitante').focus(); return; }

  const codigo      = document.getElementById('inputCodigo').value.trim();
  const descripcion = document.getElementById('inputDescripcion').value.trim();
  const unidad      = document.getElementById('inputUnidad').value;
  const cantidad    = parseFloat(document.getElementById('inputCantidad').value);
  const cantPalabras = document.getElementById('inputCantidadPalabras').value;

  if (!descripcion) { showToast('Ingresa la descripciÃ³n del producto', true); return; }
  if (!cantidad || cantidad <= 0) { showToast('Ingresa una cantidad vÃ¡lida', true); return; }

  productos.push({ codigo, descripcion, unidad, cantidad, cantPalabras });
  renderTabla();
  limpiarInputsProducto();
});

function renderTabla() {
  if (productos.length === 0) {
    tbodyProd.innerHTML = '<tr><td colspan="6" class="empty-msg">No hay productos agregados</td></tr>';
    return;
  }
  tbodyProd.innerHTML = productos.map((p, i) => `
    <tr>
      <td>${i + 1}</td>
      <td>${p.codigo || '-'}</td>
      <td>${p.descripcion}</td>
      <td>${p.unidad}</td>
      <td>${p.cantidad}</td>
      <td>${p.cantPalabras || '-'}</td>
      <td><button class="btn-delete" onclick="eliminarProducto(${i})" title="Eliminar">âœ•</button></td>
    </tr>`).join('');
}

function eliminarProducto(i) {
  productos.splice(i, 1);
  renderTabla();
}

function limpiarInputsProducto() {
  ['inputBuscar','inputCodigo','inputDescripcion','inputCantidad','inputCantidadPalabras'].forEach(id => {
    document.getElementById(id).value = '';
  });
  document.getElementById('inputUnidad').value = 'unidad';
}

// â”€â”€ Submit salida â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
let registrando = false;
form.addEventListener('submit', async (e) => {
  e.preventDefault();

  // Evitar doble registro
  if (registrando) return;
  registrando = true;
  document.getElementById('btnRegistrar').disabled = true;
  document.getElementById('btnRegistrar').textContent = 'â³ Registrando...';

  const tipoDocumento = document.getElementById('tipoDocumento').value;
  const solicitante   = document.getElementById('solicitante').value.trim();

  if (!tipoDocumento) { showToast('Selecciona el Tipo de Documento', true); document.getElementById('tipoDocumento').focus(); registrando = false; document.getElementById('btnRegistrar').disabled = false; document.getElementById('btnRegistrar').textContent = 'âœ” Registrar Salida'; return; }

  const nroDocumento = document.getElementById('nroDocumento').value.trim();
  const campoNroVisible = document.getElementById('campoNroDoc').style.display !== 'none';
  if (campoNroVisible && !nroDocumento) {
    showToast('Ingresa el NÂ° de Documento', true);
    document.getElementById('nroDocumento').focus();
    registrando = false; document.getElementById('btnRegistrar').disabled = false; document.getElementById('btnRegistrar').textContent = 'âœ” Registrar Salida'; return;
  }
  if (!solicitante) { showToast('Ingresa el nombre del Cliente', true); document.getElementById('solicitante').focus(); registrando = false; document.getElementById('btnRegistrar').disabled = false; document.getElementById('btnRegistrar').textContent = 'âœ” Registrar Salida'; return; }
  if (productos.length === 0) { showToast('Agrega al menos un producto', true); registrando = false; document.getElementById('btnRegistrar').disabled = false; document.getElementById('btnRegistrar').textContent = 'âœ” Registrar Salida'; return; }

  // â”€â”€ Vista previa antes de confirmar â”€â”€
  const previewConfirmado = await mostrarVistaPrevia(tipoDocumento, nroDocumento, solicitante, productos, window._editandoOrden);
  if (!previewConfirmado) {
    registrando = false;
    document.getElementById('btnRegistrar').disabled = false;
    document.getElementById('btnRegistrar').textContent = window._editandoOrden ? 'âœ” Guardar Cambios' : 'âœ” Registrar Salida';
    return;
  }

  // â”€â”€ Si estamos editando una orden existente â”€â”€
  if (window._editandoOrden) {
    const nroEdit = window._editandoOrden;
    const idx = historial.findIndex(o => o.nro === nroEdit);
    if (idx === -1) { showToast('Orden no encontrada', true); registrando = false; document.getElementById('btnRegistrar').disabled = false; document.getElementById('btnRegistrar').textContent = 'âœ” Registrar Salida'; return; }

    // Actualizar la orden
    historial[idx].fecha         = document.getElementById('fecha').value;
    historial[idx].tipoDocumento = tipoDocumento;
    historial[idx].nroDocumento  = nroDocumento;
    historial[idx].solicitante   = solicitante;
    historial[idx].observaciones = document.getElementById('observaciones').value;
    historial[idx].productos     = [...productos];
    historial[idx].total         = productos.length;
    historial[idx].editadoPor    = usuarioActivo ? usuarioActivo.nombre : '';
    historial[idx].fechaEdicion  = new Date().toISOString().slice(0,16);

    localStorage.setItem('historialSalidas', JSON.stringify(historial));
    if (window.fbListo) fbGuardar('historial', nroEdit, historial[idx]);

    showToast(`âœ” Orden ${nroEdit} actualizada correctamente`);
    registrarActividad('Orden editada', `${nroEdit} â€” Cliente: ${solicitante}`);
    window._editandoOrden = null;
    bloquearFormulario();
    buscarOrdenAntigua();
    renderReportes();
    renderOrdenesEmitidas();
    registrando = false;
    return;
  }

  // Obtener siguiente nÃºmero de orden (transacciÃ³n atÃ³mica - nunca se duplica)
  let nroOrden;
  document.getElementById('btnRegistrar').textContent = 'â³ Registrando...';
  if (window.fbListo && window.fbObtenerSiguienteNumero) {
    try {
      const nroDesdeFirebase = await fbObtenerSiguienteNumero();
      if (nroDesdeFirebase !== null) {
        nroOrden = generarNro(nroDesdeFirebase);
        contador = nroDesdeFirebase + 1;
        localStorage.setItem('contadorSalidas', contador);
      } else {
        // Firebase fallÃ³ â€” reintentar una vez
        showToast('Reintentando conexiÃ³n...', true);
        await new Promise(r => setTimeout(r, 1000));
        const reintento = await fbObtenerSiguienteNumero();
        if (reintento !== null) {
          nroOrden = generarNro(reintento);
          contador = reintento + 1;
          localStorage.setItem('contadorSalidas', contador);
        } else {
          showToast('Error de conexiÃ³n. Intenta de nuevo.', true);
          registrando = false;
          document.getElementById('btnRegistrar').disabled = false;
          document.getElementById('btnRegistrar').textContent = 'âœ” Registrar Salida';
          return;
        }
      }
    } catch(e) {
      console.error('Error obteniendo nÃºmero:', e);
      showToast('Error de conexiÃ³n. Intenta de nuevo.', true);
      registrando = false;
      document.getElementById('btnRegistrar').disabled = false;
      document.getElementById('btnRegistrar').textContent = 'âœ” Registrar Salida';
      return;
    }
  } else {
    showToast('Sin conexiÃ³n a Firebase. Intenta de nuevo.', true);
    registrando = false;
    document.getElementById('btnRegistrar').disabled = false;
    document.getElementById('btnRegistrar').textContent = 'âœ” Registrar Salida';
    return;
  }

  const salida = {
    nro:           nroOrden,
    fecha:         document.getElementById('fecha').value,
    tipoDocumento: document.getElementById('tipoDocumento').value,
    nroDocumento:  document.getElementById('nroDocumento').value.trim(),
    solicitante:   document.getElementById('solicitante').value,
    responsable:   '',
    observaciones: document.getElementById('observaciones').value,
    productos:     [...productos],
    total:         productos.length,
    creadoPor:     usuarioActivo ? usuarioActivo.nombre : '',
    rolCreador:    usuarioActivo ? usuarioActivo.rol : ''
  };

  nroSalidaEl.value = salida.nro;
  if (!historial.some(h => h.nro === salida.nro)) {
    historial.unshift(salida);
  }
  ordenImpresion = salida;
  localStorage.setItem('historialSalidas', JSON.stringify(historial));
  // Sincronizar con Firebase
  if (window.fbListo) {
    fbGuardar('historial', salida.nro, salida);
  }

  showToast(`âœ” Salida ${salida.nro} registrada correctamente`);
  registrarActividad('Orden creada', `${salida.nro} â€” Cliente: ${salida.solicitante} â€” ${salida.total} producto(s)`);
  bloquearFormulario();
  buscarOrdenAntigua();
  registrando = false;
});

function bloquearFormulario() {
  ['tipoDocumento','nroDocumento','solicitante','observaciones','fecha',
   'inputBuscar','inputCodigo','inputDescripcion','inputCantidad','inputCantidadPalabras','inputUnidad'
  ].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.disabled = true;
  });
  document.getElementById('btnAgregar').disabled = true;
  document.getElementById('btnRegistrar').style.display = 'none';
  document.getElementById('btnImprimir').style.display = '';
  document.getElementById('btnNuevaOrden').style.display = '';
  document.getElementById('ordenRegistradaBanner').style.display = '';
}

function resetForm() {
  form.classList.remove('form-bloqueado');
  // Forzar que todos los campos sean interactivos
  form.querySelectorAll('input, select, textarea').forEach(el => {
    el.disabled = false;
    el.style.pointerEvents = '';
    el.style.background = '';
    el.style.color = '';
  });
  document.getElementById('tipoDocumento').value  = '';
  document.getElementById('solicitante').value    = '';
  document.getElementById('observaciones').value  = '';
  document.getElementById('campoNroDoc').style.display = 'none';
  document.getElementById('nroDocumento').value   = '';
  document.getElementById('sugerenciasCliente').classList.remove('visible');
  document.getElementById('btnAgregar').disabled  = false;
  document.getElementById('btnRegistrar').disabled = false;
  document.getElementById('btnRegistrar').style.display = '';
  document.getElementById('btnRegistrar').textContent = 'âœ” Registrar Salida';
  registrando = false;
  document.getElementById('btnImprimir').style.display = 'none';
  document.getElementById('btnNuevaOrden').style.display = 'none';
  document.getElementById('ordenRegistradaBanner').style.display = 'none';
  productos = [];
  renderTabla();
  document.getElementById('fecha').value = fechaHoraLocal();
  nroSalidaEl.value = generarNro(contador);
}

// â”€â”€ Reportes â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function renderReportes(filtro = null) {
  const datos = filtro !== null ? filtro : historial.slice(0, 10);
  const hoy   = new Date().toISOString().slice(0, 10);
  const mes   = hoy.slice(0, 7);

  document.getElementById('statTotal').textContent = historial.length;
  document.getElementById('statHoy').textContent   = historial.filter(s => s.fecha && s.fecha.slice(0,10) === hoy).length;
  document.getElementById('statItems').textContent = historial.filter(s => s.fecha && s.fecha.slice(0,10) === hoy).reduce((a, s) => a + s.total, 0);
  document.getElementById('statMes').textContent   = historial.filter(s => s.fecha && s.fecha.slice(0,7) === mes).length;

  // Top productos
  const conteo = {};
  historial.forEach(s => {
    s.productos.forEach(p => {
      const key = p.codigo || p.descripcion;
      if (!conteo[key]) conteo[key] = { codigo: p.codigo || '-', descripcion: p.descripcion, unidad: p.unidad, total: 0 };
      conteo[key].total += parseFloat(p.cantidad) || 0;
    });
  });
  const top = Object.values(conteo).sort((a, b) => b.total - a.total).slice(0, 10);
  const tbodyTop = document.getElementById('tbodyTopProductos');
  if (top.length === 0) {
    tbodyTop.innerHTML = '<tr><td colspan="5" class="empty-msg">No hay datos</td></tr>';
  } else {
    tbodyTop.innerHTML = top.map((p, i) => `
      <tr>
        <td>${i + 1}</td>
        <td>${p.codigo}</td>
        <td>${p.descripcion}</td>
        <td>${p.unidad}</td>
        <td><strong>${p.total}</strong></td>
      </tr>`).join('');
  }

  const tbody = document.getElementById('tbodyReportes');
  if (datos.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="empty-msg">No hay Ã³rdenes que coincidan</td></tr>';
    return;
  }
  tbody.innerHTML = datos.map((s, i) => `
    <tr style="${s.anulada ? 'opacity:0.5' : ''}">
      <td><strong>${s.nro}</strong>${s.anulada ? ' <span class="badge badge-anulada">Anulada</span>' : ''}</td>
      <td>${s.tipoDocumento || '-'}</td>
      <td>${formatFecha(s.fecha)}</td>
      <td>${s.solicitante}</td>
      
      <td>
        <button class="btn-ver" onclick="abrirModal(${historial.indexOf(s)})">Ver</button>
      </td>
    </tr>`).join('');
}

// â”€â”€ Exportar reportes a Excel (CSV) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
document.getElementById('btnExportarExcel').addEventListener('click', () => {
  try {
    const conteo = {};
    historial.forEach(s => {
      s.productos.forEach(p => {
        const key = p.codigo || p.descripcion;
        if (!conteo[key]) conteo[key] = { codigo: p.codigo||'-', descripcion: p.descripcion, unidad: p.unidad, total: 0 };
        conteo[key].total += parseFloat(p.cantidad) || 0;
      });
    });

    // CSV de Ã³rdenes
    let csv = '\uFEFF'; // BOM para Excel
    csv += 'NÂ° Salida;Fecha;Tipo Doc.;NÂ° Documento;Cliente;Creada por;Rol;Estado;Productos\n';
    historial.forEach(s => {
      csv += `${s.nro};${formatFecha(s.fecha)};${s.tipoDocumento||'-'};${s.nroDocumento||'-'};${s.solicitante||'-'};${s.creadoPor||'-'};${s.rolCreador||'-'};${s.anulada?'Anulada':'Activa'};${s.total}\n`;
    });
    csv += '\n\nTop Productos Despachados\n';
    csv += '#;CÃ³digo;Producto;Unidad;Total Despachado\n';
    const topProductos = Object.values(conteo).sort((a,b) => b.total - a.total);
    topProductos.forEach((p, i) => {
      csv += `${i+1};${p.codigo};${p.descripcion};${p.unidad};${p.total}\n`;
    });

    const hoy = fechaHoraLocal().slice(0, 10);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Reporte_BodegaAM_${hoy}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('âœ” Reporte exportado a Excel (CSV)');
    registrarActividad('Exportar Excel', 'Reporte de Ã³rdenes exportado');
  } catch(e) {
    console.error('Error exportando:', e);
    showToast('Error al exportar: ' + e.message, true);
  }
});

// â”€â”€ Exportar reportes a PDF â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
document.getElementById('btnExportarPDF').addEventListener('click', () => {
  const hoy = new Date().toLocaleDateString('es-CL');

  const conteo = {};
  historial.forEach(s => {
    s.productos.forEach(p => {
      const key = p.codigo || p.descripcion;
      if (!conteo[key]) conteo[key] = { codigo: p.codigo||'-', descripcion: p.descripcion, unidad: p.unidad, total: 0 };
      conteo[key].total += parseFloat(p.cantidad) || 0;
    });
  });
  const top = Object.values(conteo).sort((a,b) => b.total - a.total).slice(0,10);
  const filasTop = top.map((p,i) => `
    <tr><td>${i+1}</td><td>${p.codigo}</td><td>${p.descripcion}</td><td>${p.unidad}</td><td>${p.total}</td></tr>`).join('');

  const filasOrdenes = historial.map(s => `
    <tr>
      <td>${s.nro}</td>
      <td>${s.tipoDocumento || '-'}</td>
      <td>${formatFecha(s.fecha)}</td>
      <td>${s.solicitante || '-'}</td>
      <td>${s.creadoPor || '-'}</td>
      <td>${s.anulada ? 'Anulada' : 'Activa'}</td>
    </tr>`).join('');

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
    <style>
      @page { size: letter; margin: 15mm; }
      * { font-family: Arial, sans-serif; font-size: 11px; color: #000; margin:0; padding:0; box-sizing:border-box; }
      body { padding: 10px; }
      h1 { font-size: 18px; text-align:center; margin-bottom: 4px; }
      h2 { font-size: 13px; margin: 16px 0 6px; border-bottom: 1px solid #333; padding-bottom: 3px; }
      .fecha { text-align:center; font-size:10px; color:#555; margin-bottom:12px; }
      .stats { display:flex; gap:10px; margin-bottom:12px; }
      .stat { flex:1; border:1px solid #ccc; border-radius:4px; padding:8px; text-align:center; }
      .stat-num { font-size:20px; font-weight:bold; }
      .stat-label { font-size:9px; color:#555; }
      table { width:100%; border-collapse:collapse; margin-bottom:16px; }
      thead th { background:#333; color:#fff; padding:5px 8px; text-align:left; }
      tbody td { padding:4px 8px; border-bottom:1px solid #ddd; }
      tbody tr:nth-child(even) { background:#f5f5f5; }
    </style></head>
    <body>
      <h1>Bodega A&M â€” Reporte de Ã“rdenes</h1>
      <p class="fecha">Generado el ${hoy}</p>
      <div class="stats">
        <div class="stat"><div class="stat-num">${historial.length}</div><div class="stat-label">Total Ã“rdenes</div></div>
        <div class="stat"><div class="stat-num">${historial.filter(s=>s.fecha&&s.fecha.slice(0,10)===new Date().toISOString().slice(0,10)).length}</div><div class="stat-label">Ã“rdenes Hoy</div></div>
        <div class="stat"><div class="stat-num">${historial.reduce((a,s)=>a+s.total,0)}</div><div class="stat-label">Ãtems Despachados</div></div>
        <div class="stat"><div class="stat-num">${historial.filter(s=>s.fecha&&s.fecha.slice(0,7)===new Date().toISOString().slice(0,7)).length}</div><div class="stat-label">Ã“rdenes este Mes</div></div>
      </div>
      <h2>Top 10 Productos MÃ¡s Despachados</h2>
      <table>
        <thead><tr><th>#</th><th>CÃ³digo</th><th>Producto</th><th>Unidad</th><th>Total</th></tr></thead>
        <tbody>${filasTop || '<tr><td colspan="5" style="text-align:center">Sin datos</td></tr>'}</tbody>
      </table>
      <h2>Historial de Ã“rdenes</h2>
      <table>
        <thead><tr><th>NÂ° Salida</th><th>Tipo Doc.</th><th>Fecha</th><th>Cliente</th><th>Creada por</th><th>Estado</th></tr></thead>
        <tbody>${filasOrdenes || '<tr><td colspan="6" style="text-align:center">Sin Ã³rdenes</td></tr>'}</tbody>
      </table>
    </body></html>`;

  if (window.require) {
    const { ipcRenderer } = window.require('electron');
    ipcRenderer.send('vistaPreviewPDF', html);
  }
  registrarActividad('Exportar PDF', 'Reporte de Ã³rdenes exportado');
});

document.getElementById('btnBuscarProductoFecha').addEventListener('click', buscarProductoFecha);
document.getElementById('buscarProductoFecha').addEventListener('keydown', e => {
  if (e.key === 'Enter') buscarProductoFecha();
});
// Exportar Producto Fecha a Excel
document.getElementById('btnExcelProductoFecha').addEventListener('click', () => {
  if (!window._productoFechaData) return;
  let csv = '\uFEFFFecha;NÂ° Orden;CÃ³digo;Producto;Unid.;Cant.;Cliente\n';
  window._productoFechaData.forEach(r => {
    csv += `${formatFecha(r.fecha)};${r.nro};${r.codigo};${r.descripcion};${r.unidad};${r.cantidad};${r.cliente||'-'}\n`;
  });
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `BusquedaProducto_${fechaHoraLocal().slice(0,10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('âœ” Excel exportado');
});

// Exportar Producto Fecha a PDF
document.getElementById('btnPdfProductoFecha').addEventListener('click', () => {
  if (!window._productoFechaData) return;
  const filas = window._productoFechaData.map(r => `<tr><td>${formatFecha(r.fecha)}</td><td>${r.nro}</td><td>${r.codigo}</td><td>${r.descripcion}</td><td>${r.unidad}</td><td>${r.cantidad}</td><td>${r.cliente||'-'}</td></tr>`).join('');
  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
    @page{size:letter;margin:15mm}*{font-family:Arial,sans-serif;font-size:11px;color:#000;margin:0;padding:0}
    body{padding:10px}h1{font-size:16px;text-align:center;margin-bottom:12px}
    table{width:100%;border-collapse:collapse}thead th{background:#333;color:#fff;padding:5px 8px;text-align:left}
    tbody td{padding:4px 8px;border-bottom:1px solid #ddd}tbody tr:nth-child(even){background:#f5f5f5}
  </style></head><body>
    <h1>Bodega A&M â€” BÃºsqueda de Salidas por Producto</h1>
    <table><thead><tr><th>Fecha</th><th>NÂ° Orden</th><th>CÃ³digo</th><th>Producto</th><th>Unid.</th><th>Cant.</th><th>Cliente</th></tr></thead>
    <tbody>${filas}</tbody></table></body></html>`;
  if (window.require) {
    const { ipcRenderer } = window.require('electron');
    ipcRenderer.send('vistaPreviewPDF', html);
  }
});

function buscarProductoFecha() {
  const q      = document.getElementById('buscarProductoFecha').value.trim().toLowerCase();
  const desde  = document.getElementById('prodFechaDesde').value;
  const hasta  = document.getElementById('prodFechaHasta').value;
  const tabla  = document.getElementById('tablaProductoFechas');
  const tbody  = document.getElementById('tbodyProductoFechas');
  const btnExcel = document.getElementById('btnExcelProductoFecha');
  const btnPdf = document.getElementById('btnPdfProductoFecha');

  if (!q && !desde && !hasta) { tabla.style.display = 'none'; btnExcel.style.display = 'none'; btnPdf.style.display = 'none'; return; }

  const resultados = [];
  historial.forEach(s => {
    if (s.anulada) return;
    const fechaOrden = s.fecha ? s.fecha.slice(0, 10) : '';
    if (desde && fechaOrden < desde) return;
    if (hasta && fechaOrden > hasta) return;
    s.productos.forEach(p => {
      if (!q ||
        p.descripcion.toLowerCase().includes(q) ||
        (p.codigo && p.codigo.toLowerCase().includes(q))
      ) {
        resultados.push({
          fecha:       s.fecha,
          nro:         s.nro,
          codigo:      p.codigo || '-',
          descripcion: p.descripcion,
          unidad:      p.unidad,
          cantidad:    p.cantidad,
          cliente:     s.solicitante
        });
      }
    });
  });

  tabla.style.display = 'table';

  if (resultados.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="empty-msg">No se encontraron salidas</td></tr>';
    btnExcel.style.display = 'none';
    btnPdf.style.display = 'none';
    return;
  }

  tbody.innerHTML = resultados.map(r => `
    <tr>
      <td>${formatFecha(r.fecha)}</td>
      <td><strong>${r.nro}</strong></td>
      <td>${r.codigo}</td>
      <td>${r.descripcion}</td>
      <td>${r.unidad}</td>
      <td>${r.cantidad}</td>
      <td>${r.cliente || '-'}</td>
    </tr>`).join('');

  btnExcel.style.display = '';
  btnPdf.style.display = '';
  window._productoFechaData = resultados;
}

// Filtros Ã³rdenes
document.getElementById('btnFiltrar').addEventListener('click', aplicarFiltro);

// Filtro Ã­tems despachados por fecha
document.getElementById('btnFiltroItems').addEventListener('click', () => {
  const fecha = document.getElementById('filtroItemsFecha').value;
  if (!fecha) { showToast('Selecciona una fecha', true); return; }
  const items = historial.filter(s => s.fecha && s.fecha.slice(0,10) === fecha).reduce((a, s) => a + s.total, 0);
  document.getElementById('statItemsFecha').textContent = items + ' Ã­tems el ' + fecha.split('-').reverse().join('/');
});

// â”€â”€ Resumen Ejecutivo del Mes â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
document.getElementById('btnResumenMes').addEventListener('click', () => {
  const mes = document.getElementById('filtroResumenMes').value;
  if (!mes) { showToast('Selecciona un mes', true); return; }
  renderResumenEjecutivo(mes);
  document.getElementById('btnResumenPDF').style.display = '';
  document.getElementById('btnResumenExcel').style.display = '';
});

function renderResumenEjecutivo(mes) {
  const ordenesMes = historial.filter(s => s.fecha && s.fecha.slice(0,7) === mes);
  const totalMes = ordenesMes.length;

  // Mes anterior
  const [anio, mesNum] = mes.split('-').map(Number);
  const mesAnterior = mesNum === 1 ? `${anio-1}-12` : `${anio}-${String(mesNum-1).padStart(2,'0')}`;
  const totalMesAnterior = historial.filter(s => s.fecha && s.fecha.slice(0,7) === mesAnterior).length;
  let comparacion = 'â€”';
  if (totalMesAnterior > 0) {
    const diff = Math.round(((totalMes - totalMesAnterior) / totalMesAnterior) * 100);
    comparacion = (diff >= 0 ? '+' : '') + diff + '%';
  }

  // Promedio por dÃ­a
  const diasEnMes = new Date(anio, mesNum, 0).getDate();
  const promedio = totalMes > 0 ? (totalMes / diasEnMes).toFixed(1) : '0';

  // DÃ­a mÃ¡s activo
  const conteosDia = {};
  ordenesMes.forEach(s => {
    const dia = s.fecha.slice(0,10);
    conteosDia[dia] = (conteosDia[dia] || 0) + 1;
  });
  let diaMasActivo = 'â€”';
  let maxDia = 0;
  Object.entries(conteosDia).forEach(([dia, count]) => {
    if (count > maxDia) { maxDia = count; diaMasActivo = dia.split('-').reverse().join('/') + ' (' + count + ')'; }
  });

  // Ãtems despachados
  const itemsMes = ordenesMes.reduce((a, s) => a + (s.total || 0), 0);

  // Hora pico
  const conteosHora = {};
  ordenesMes.forEach(s => {
    if (s.fecha && s.fecha.length >= 16) {
      const hora = s.fecha.slice(11,13);
      conteosHora[hora] = (conteosHora[hora] || 0) + 1;
    }
  });
  let horaPico = 'â€”';
  let maxHora = 0;
  Object.entries(conteosHora).forEach(([hora, count]) => {
    if (count > maxHora) { maxHora = count; horaPico = hora + ':00 (' + count + ' Ã³rdenes)'; }
  });

  // Recepciones del mes
  const recepcionesMes = recepciones.filter(r => r.fecha && r.fecha.slice(0,7) === mes).length;

  // Anuladas
  const anuladasMes = ordenesMes.filter(s => s.anulada).length;

  // Pendientes de recepciÃ³n
  const pendientes = ordenesMes.filter(s => !s.anulada && !recepciones.some(r => r.nroOrden === s.nro)).length;

  // Top 3 productos
  const conteoProds = {};
  ordenesMes.forEach(s => {
    if (s.productos) s.productos.forEach(p => {
      const key = p.descripcion || p.codigo;
      conteoProds[key] = (conteoProds[key] || 0) + (parseFloat(p.cantidad) || 0);
    });
  });
  const topProds = Object.entries(conteoProds).sort((a,b) => b[1] - a[1]).slice(0,3);

  // Top 3 clientes
  const conteoClientes = {};
  ordenesMes.forEach(s => {
    if (s.solicitante) conteoClientes[s.solicitante] = (conteoClientes[s.solicitante] || 0) + 1;
  });
  const topClientes = Object.entries(conteoClientes).sort((a,b) => b[1] - a[1]).slice(0,3);

  // Renderizar
  document.getElementById('reTotal').textContent = totalMes;
  document.getElementById('reComparacion').textContent = comparacion;
  document.getElementById('reComparacion').style.color = comparacion.startsWith('+') ? '#065f46' : comparacion.startsWith('-') ? '#c81e1e' : '';
  document.getElementById('rePromedioDia').textContent = promedio;
  document.getElementById('reDiaMasActivo').textContent = diaMasActivo;
  document.getElementById('reItemsMes').textContent = itemsMes.toLocaleString();
  document.getElementById('reHoraPico').textContent = horaPico;
  document.getElementById('reRecepciones').textContent = recepcionesMes;
  document.getElementById('reAnuladas').textContent = anuladasMes;
  document.getElementById('rePendientes').textContent = pendientes;

  // Semana mÃ¡s activa
  const semanas = { 'Semana 1': 0, 'Semana 2': 0, 'Semana 3': 0, 'Semana 4': 0, 'Semana 5': 0 };
  ordenesMes.forEach(s => {
    if (s.fecha) {
      const dia = parseInt(s.fecha.slice(8,10));
      if (dia <= 7) semanas['Semana 1']++;
      else if (dia <= 14) semanas['Semana 2']++;
      else if (dia <= 21) semanas['Semana 3']++;
      else if (dia <= 28) semanas['Semana 4']++;
      else semanas['Semana 5']++;
    }
  });
  let semanaActiva = 'â€”';
  let maxSemana = 0;
  Object.entries(semanas).forEach(([sem, count]) => {
    if (count > maxSemana) { maxSemana = count; semanaActiva = sem + ' (' + count + ')'; }
  });
  document.getElementById('reSemanaActiva').textContent = semanaActiva;

  document.getElementById('reTopProductos').innerHTML = topProds.length > 0
    ? topProds.map((p, i) => `${i+1}. <strong>${p[0]}</strong> â€” ${p[1]} unid.`).join('<br>')
    : 'Sin datos';
  document.getElementById('reTopClientes').innerHTML = topClientes.length > 0
    ? topClientes.map((c, i) => `${i+1}. <strong>${c[0]}</strong> â€” ${c[1]} Ã³rdenes`).join('<br>')
    : 'Sin datos';

  // RÃ©cord histÃ³rico
  const conteoMeses = {};
  historial.forEach(s => {
    if (s.fecha) {
      const m = s.fecha.slice(0,7);
      conteoMeses[m] = (conteoMeses[m] || 0) + 1;
    }
  });
  let mejorMes = 'â€”';
  let maxMes = 0;
  const meses = ['','Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  Object.entries(conteoMeses).forEach(([m, count]) => {
    if (count > maxMes) {
      maxMes = count;
      const [a, mn] = m.split('-');
      mejorMes = meses[parseInt(mn)] + ' ' + a + ' (' + count + ' Ã³rdenes)';
    }
  });
  document.getElementById('reRecord').textContent = 'ðŸ† ' + mejorMes;
}

// Exportar Resumen Ejecutivo a PDF
document.getElementById('btnResumenPDF').addEventListener('click', () => {
  const mes = document.getElementById('filtroResumenMes').value;
  if (!mes) return;
  const meses = ['','Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  const [a, mn] = mes.split('-');
  const titulo = meses[parseInt(mn)] + ' ' + a;
  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
    body{font-family:Arial,sans-serif;padding:30px;color:#333}
    h1{text-align:center;color:#1a56db;margin-bottom:20px}
    .grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:20px}
    .card{border:1px solid #e5e7eb;border-radius:8px;padding:14px;text-align:center}
    .card .num{font-size:1.5rem;font-weight:bold;color:#1a56db}
    .card .label{font-size:0.8rem;color:#666;margin-top:4px}
    .section{margin-top:16px}
    .section h3{font-size:0.95rem;margin-bottom:6px}
  </style></head><body>
    <h1>Resumen Ejecutivo â€” ${titulo}</h1>
    <div class="grid">
      <div class="card"><div class="num">${document.getElementById('reTotal').textContent}</div><div class="label">Total Ã“rdenes</div></div>
      <div class="card"><div class="num">${document.getElementById('reComparacion').textContent}</div><div class="label">vs Mes Anterior</div></div>
      <div class="card"><div class="num">${document.getElementById('rePromedioDia').textContent}</div><div class="label">Promedio/DÃ­a</div></div>
      <div class="card"><div class="num">${document.getElementById('reDiaMasActivo').textContent}</div><div class="label">DÃ­a MÃ¡s Activo</div></div>
      <div class="card"><div class="num">${document.getElementById('reItemsMes').textContent}</div><div class="label">Ãtems Despachados</div></div>
      <div class="card"><div class="num">${document.getElementById('reHoraPico').textContent}</div><div class="label">Hora Pico</div></div>
      <div class="card"><div class="num">${document.getElementById('reRecepciones').textContent}</div><div class="label">Recepciones</div></div>
      <div class="card"><div class="num">${document.getElementById('reAnuladas').textContent}</div><div class="label">Anuladas</div></div>
      <div class="card"><div class="num">${document.getElementById('reSemanaActiva').textContent}</div><div class="label">Semana MÃ¡s Activa</div></div>
    </div>
    <div class="section"><h3>ðŸ† Top 3 Productos</h3><p>${document.getElementById('reTopProductos').innerHTML}</p></div>
    <div class="section"><h3>â­ Top 3 Clientes</h3><p>${document.getElementById('reTopClientes').innerHTML}</p></div>
    <div class="section"><h3>ðŸ… RÃ©cord HistÃ³rico</h3><p>${document.getElementById('reRecord').textContent}</p></div>
    <p style="text-align:center;margin-top:30px;font-size:0.8rem;color:#888">Bodega A&M â€” Generado el ${new Date().toLocaleDateString('es-CL')}</p>
  </body></html>`;
  if (window.require) {
    const { ipcRenderer } = window.require('electron');
    ipcRenderer.send('vistaPreviewPDF', html);
  }
});

// Exportar Resumen Ejecutivo a Excel
document.getElementById('btnResumenExcel').addEventListener('click', () => {
  const mes = document.getElementById('filtroResumenMes').value;
  if (!mes) return;
  let csv = '\uFEFF';
  csv += 'Resumen Ejecutivo - ' + mes + '\n\n';
  csv += 'Indicador;Valor\n';
  csv += 'Total Ã“rdenes;' + document.getElementById('reTotal').textContent + '\n';
  csv += 'vs Mes Anterior;' + document.getElementById('reComparacion').textContent + '\n';
  csv += 'Promedio/DÃ­a;' + document.getElementById('rePromedioDia').textContent + '\n';
  csv += 'DÃ­a MÃ¡s Activo;' + document.getElementById('reDiaMasActivo').textContent + '\n';
  csv += 'Ãtems Despachados;' + document.getElementById('reItemsMes').textContent + '\n';
  csv += 'Hora Pico;' + document.getElementById('reHoraPico').textContent + '\n';
  csv += 'Recepciones;' + document.getElementById('reRecepciones').textContent + '\n';
  csv += 'Anuladas;' + document.getElementById('reAnuladas').textContent + '\n';
  csv += 'Semana MÃ¡s Activa;' + document.getElementById('reSemanaActiva').textContent + '\n';
  csv += 'RÃ©cord HistÃ³rico;' + document.getElementById('reRecord').textContent + '\n';
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Resumen_Ejecutivo_${mes}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('âœ” Excel descargado');
});

document.getElementById('btnFiltroMes').addEventListener('click', () => {
  const mes = document.getElementById('filtroMes').value;
  renderTopMes(mes);
});

// â”€â”€ Comparar 2 Meses â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
document.getElementById('btnCompararMeses').addEventListener('click', () => {
  const mes1 = document.getElementById('compararMes1').value;
  const mes2 = document.getElementById('compararMes2').value;
  if (!mes1 || !mes2) { showToast('Selecciona ambos meses', true); return; }
  compararMeses(mes1, mes2);
});

function compararMeses(mes1, mes2) {
  const ordenes1 = historial.filter(s => s.fecha && s.fecha.slice(0,7) === mes1);
  const ordenes2 = historial.filter(s => s.fecha && s.fecha.slice(0,7) === mes2);
  const items1 = ordenes1.reduce((a, s) => a + (s.total || 0), 0);
  const items2 = ordenes2.reduce((a, s) => a + (s.total || 0), 0);
  const anuladas1 = ordenes1.filter(s => s.anulada).length;
  const anuladas2 = ordenes2.filter(s => s.anulada).length;
  const rec1 = recepciones.filter(r => r.fecha && r.fecha.slice(0,7) === mes1).length;
  const rec2 = recepciones.filter(r => r.fecha && r.fecha.slice(0,7) === mes2).length;

  const mesesNombres = ['','Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  const nombre1 = mesesNombres[parseInt(mes1.split('-')[1])] + ' ' + mes1.split('-')[0];
  const nombre2 = mesesNombres[parseInt(mes2.split('-')[1])] + ' ' + mes2.split('-')[0];

  document.getElementById('compTitulo1').textContent = nombre1;
  document.getElementById('compTitulo2').textContent = nombre2;

  function diff(a, b) {
    if (a === 0 && b === 0) return 'â€”';
    const d = b - a;
    const pct = a > 0 ? Math.round((d / a) * 100) : 'âˆž';
    const color = d > 0 ? '#065f46' : d < 0 ? '#c81e1e' : '#333';
    return `<span style="color:${color};font-weight:bold">${d >= 0 ? '+' : ''}${d} (${pct}%)</span>`;
  }

  document.getElementById('tbodyComparacion').innerHTML = `
    <tr><td>Total Ã“rdenes</td><td>${ordenes1.length}</td><td>${ordenes2.length}</td><td>${diff(ordenes1.length, ordenes2.length)}</td></tr>
    <tr><td>Ãtems Despachados</td><td>${items1}</td><td>${items2}</td><td>${diff(items1, items2)}</td></tr>
    <tr><td>Recepciones</td><td>${rec1}</td><td>${rec2}</td><td>${diff(rec1, rec2)}</td></tr>
    <tr><td>Anuladas</td><td>${anuladas1}</td><td>${anuladas2}</td><td>${diff(anuladas1, anuladas2)}</td></tr>
  `;
  document.getElementById('comparacionMeses').style.display = '';
}

// Exportar Top Mes a Excel
document.getElementById('btnExcelTopMes').addEventListener('click', () => {
  if (!window._topMesData) return;
  let csv = '\uFEFF#;CÃ³digo;Producto;Unidad;Total Despachado\n';
  window._topMesData.forEach((p, i) => {
    csv += `${i+1};${p.codigo};${p.descripcion};${p.unidad};${p.total}\n`;
  });
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `TopProductos_${window._topMesTitulo}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('âœ” Excel exportado');
});

// Exportar Top Mes a PDF
document.getElementById('btnPdfTopMes').addEventListener('click', () => {
  if (!window._topMesData) return;
  const filas = window._topMesData.map((p, i) => `<tr><td>${i+1}</td><td>${p.codigo}</td><td>${p.descripcion}</td><td>${p.unidad}</td><td>${p.total}</td></tr>`).join('');
  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
    @page{size:letter;margin:15mm}*{font-family:Arial,sans-serif;font-size:11px;color:#000;margin:0;padding:0}
    body{padding:10px}h1{font-size:16px;text-align:center;margin-bottom:12px}
    table{width:100%;border-collapse:collapse}thead th{background:#333;color:#fff;padding:5px 8px;text-align:left}
    tbody td{padding:4px 8px;border-bottom:1px solid #ddd}tbody tr:nth-child(even){background:#f5f5f5}
  </style></head><body>
    <h1>Bodega A&M â€” Productos MÃ¡s Despachados (${window._topMesTitulo})</h1>
    <table><thead><tr><th>#</th><th>CÃ³digo</th><th>Producto</th><th>Unidad</th><th>Total</th></tr></thead>
    <tbody>${filas}</tbody></table></body></html>`;
  if (window.require) {
    const { ipcRenderer } = window.require('electron');
    ipcRenderer.send('vistaPreviewPDF', html);
  }
});

function renderTopMes(mes) {
  const tbody  = document.getElementById('tbodyTopMes');
  const btnExcel = document.getElementById('btnExcelTopMes');
  const btnPdf = document.getElementById('btnPdfTopMes');
  if (!mes) {
    tbody.innerHTML = '<tr><td colspan="5" class="empty-msg">Selecciona un mes para ver los datos</td></tr>';
    btnExcel.style.display = 'none';
    btnPdf.style.display = 'none';
    return;
  }
  const ordenesMes = historial.filter(s => s.fecha && s.fecha.slice(0, 7) === mes);
  if (ordenesMes.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="empty-msg">No hay Ã³rdenes en ese mes</td></tr>';
    btnExcel.style.display = 'none';
    btnPdf.style.display = 'none';
    return;
  }
  const conteo = {};
  ordenesMes.forEach(s => {
    s.productos.forEach(p => {
      const key = p.codigo || p.descripcion;
      if (!conteo[key]) conteo[key] = { codigo: p.codigo || '-', descripcion: p.descripcion, unidad: p.unidad, total: 0 };
      conteo[key].total += parseFloat(p.cantidad) || 0;
    });
  });
  const top = Object.values(conteo).sort((a, b) => b.total - a.total);
  tbody.innerHTML = top.map((p, i) => `
    <tr>
      <td>${i + 1}</td>
      <td>${p.codigo}</td>
      <td>${p.descripcion}</td>
      <td>${p.unidad}</td>
      <td><strong>${p.total}</strong></td>
    </tr>`).join('');
  btnExcel.style.display = '';
  btnPdf.style.display = '';
  window._topMesData = top;
  window._topMesTitulo = mes;
}
document.getElementById('btnLimpiarFiltro').addEventListener('click', () => {
  document.getElementById('filtroNroSalida').value  = '';
  document.getElementById('filtroDesde').value      = '';
  document.getElementById('filtroHasta').value      = '';
  document.getElementById('filtroTipo').value       = '';
  document.getElementById('filtroCliente').value    = '';
  renderReportes();
});

function aplicarFiltro() {
  const nroSalida  = document.getElementById('filtroNroSalida').value.trim().toLowerCase();
  const desde      = document.getElementById('filtroDesde').value;
  const hasta      = document.getElementById('filtroHasta').value;
  const tipo       = document.getElementById('filtroTipo').value;
  const Cliente    = document.getElementById('filtroCliente').value.toLowerCase();

  const resultado = historial.filter(s => {
    if (nroSalida && !s.nro.toLowerCase().includes(nroSalida)) return false;
    if (desde && s.fecha.slice(0,10) < desde) return false;
    if (hasta && s.fecha.slice(0,10) > hasta) return false;
    if (tipo && s.tipoDocumento !== tipo) return false;
    if (Cliente && !(s.solicitante || '').toLowerCase().includes(Cliente)) return false;
    return true;
  });
  renderReportes(resultado);
}

function eliminarOrden(i) {
  if (!confirm(`Â¿Eliminar la orden ${historial[i].nro}?`)) return;
  historial.splice(i, 1);
  localStorage.setItem('historialSalidas', JSON.stringify(historial));
  renderReportes();
  showToast('Orden eliminada');
}

// â”€â”€ Modal detalle â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function abrirModal(i) {
  const s = historial[i];
  ordenImpresion = s;
  document.getElementById('modalTitulo').textContent = `Orden ${s.nro}`;
  document.getElementById('modalBody').innerHTML = `
    <div class="detail-row"><strong>NÂ° Salida:</strong> ${s.nro}</div>
    <div class="detail-row"><strong>Fecha:</strong> ${formatFecha(s.fecha)}</div>
    <div class="detail-row"><strong>Tipo Documento:</strong> ${s.tipoDocumento || '-'}</div>
    <div class="detail-row"><strong>NÂ° Documento:</strong> ${s.nroDocumento || '-'}</div>
    <div class="detail-row"><strong>Cliente:</strong> ${s.solicitante}</div>
    ${s.creadoPor ? `<div class="detail-row"><strong>Creada por:</strong> ${s.creadoPor} (${s.rolCreador || '-'})</div>` : ''}
    ${s.observaciones ? `<div class="detail-row"><strong>Observaciones:</strong> ${s.observaciones}</div>` : ''}
    <table style="margin-top:14px">
      <thead><tr><th>#</th><th>CÃ³digo</th><th>DescripciÃ³n</th><th>Unidad</th><th>Cantidad</th></tr></thead>
      <tbody>
        ${s.productos.map((p, j) => `
          <tr>
            <td>${j+1}</td>
            <td>${p.codigo || '-'}</td>
            <td>${p.descripcion}</td>
            <td>${p.unidad}</td>
            <td>${p.cantidad}</td>
          </tr>`).join('')}
      </tbody>
    </table>`;
  document.getElementById('modalOverlay').style.display = 'flex';
}

function imprimirOrden() {
  if (!ordenImpresion) { imprimirPagina(); return; }
  const s = ordenImpresion;
  document.getElementById('nroSalida').value     = s.nro;
  document.getElementById('fecha').value         = s.fecha;
  document.getElementById('tipoDocumento').value = s.tipoDocumento || '';
  document.getElementById('nroDocumento').value  = s.nroDocumento || '';
  document.getElementById('solicitante').value   = s.solicitante || '';
  document.getElementById('observaciones').value = s.observaciones || '';
  document.getElementById('campoNroDoc').style.display = s.tipoDocumento ? '' : 'none';
  productos = [...s.productos];
  renderTabla();
  // Guardar referencia antes de cerrar modal (cerrarModal pone ordenImpresion = null)
  const ordenParaImprimir = s;
  cerrarModal();
  ordenImpresion = ordenParaImprimir;
  setTimeout(() => { imprimirPagina(); ordenImpresion = null; resetForm(); }, 300);
}

function cerrarModal() {
  document.getElementById('modalOverlay').style.display = 'none';
  ordenImpresion = null;
}

document.getElementById('modalOverlay').addEventListener('click', (e) => {
  if (e.target === document.getElementById('modalOverlay')) cerrarModal();
});

async function imprimirPagina() {
  if (window.require) {
    try {
      const { ipcRenderer } = window.require('electron');

      // Lee valores reales del formulario
      const nro      = document.getElementById('nroSalida').value;
      const fecha    = formatFecha(document.getElementById('fecha').value);
      const tipodoc  = document.getElementById('tipoDocumento').value;
      const nrodoc   = document.getElementById('nroDocumento').value;
      const cliente  = document.getElementById('solicitante').value;
      const obs      = document.getElementById('observaciones').value;

      // Obtener creador de la orden
      let creadoPor = '';
      let rolCreador = '';
      if (ordenImpresion && ordenImpresion.creadoPor) {
        creadoPor = ordenImpresion.creadoPor;
        rolCreador = ordenImpresion.rolCreador || '';
      } else if (usuarioActivo) {
        // Buscar la orden en el historial por nÃºmero
        const ordenEnHistorial = historial.find(s => s.nro === nro);
        if (ordenEnHistorial && ordenEnHistorial.creadoPor) {
          creadoPor = ordenEnHistorial.creadoPor;
          rolCreador = ordenEnHistorial.rolCreador || '';
        }
      }

      // Construye filas de productos
      const filasProductos = productos.map((p, i) => `
        <tr>
          <td>${i+1}</td>
          <td>${p.codigo||'-'}</td>
          <td>${p.descripcion}</td>
          <td>${p.unidad}</td>
          <td style="text-align:center">${p.cantidad}</td>
          <td class="palabras">${p.cantPalabras||'-'}</td>
        </tr>`).join('');

      const estiloTermico = `
        @page { size: 80mm auto; margin: 0; }
        * { font-family: Arial, sans-serif; font-size: 16px; font-weight: bold; color: #000; margin:0; padding:0; box-sizing:border-box; }
        html { background: #ccc; }
        body { width: 76mm; margin: 0 auto; padding: 3mm; background:white; box-shadow: 0 0 10px rgba(0,0,0,0.3); }
        .header { text-align:center; border-bottom:2px dashed #000; padding-bottom:6px; margin-bottom:6px; }
        .header h1 { font-size:18px; font-weight:bold; text-transform:uppercase; }
        .header p  { font-size:16px; font-weight:bold; }
        .row { display:flex; gap:4px; margin-bottom:4px; font-size:14px; }
        .row label { font-weight:bold; min-width:95px; }
        table { width:100%; border-collapse:collapse; margin-top:6px; border-top:2px dashed #000; border-bottom:2px dashed #000; }
        thead th { font-weight:bold; font-size:13px; padding:4px 2px; border-bottom:1px solid #000; text-align:left; }
        tbody td { font-size:13px; font-weight:bold; padding:3px 2px; border:none; }
        tbody td.palabras { font-size:10px; padding-left:6px; font-style:italic; }
        .footer { margin-top:12px; border-top:2px dashed #000; padding-top:6px; text-align:center; font-size:14px; font-weight:bold; }
        @media print {
          html { background: white; }
          body { box-shadow: none; margin: 0 auto; }
        }
      `;

      const urlOrden = `https://bodega-am.web.app/orden.html?nro=${encodeURIComponent(nro)}`;

      // Generar QR
      let qrDataUrl = '';
      try {
        const QRCode = require('qrcode');
        qrDataUrl = await QRCode.toDataURL(urlOrden, { width: 200, margin: 2, errorCorrectionLevel: 'H' });
      } catch(e) { console.error('QR error:', e); }

      const qrHtml = qrDataUrl ? `
        <div class="footer" style="text-align:center; margin-top:12px; border-top:1px dashed #000; padding-top:8px;">
          <img src="${qrDataUrl}" style="width:130px; height:130px;" />
          <p style="font-size:9px; margin-top:4px;">${nro}</p>
        </div>` : '';

      const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
        <style>${estiloTermico}</style></head><body>
        <div class="header">
          <h1>Salida de MercaderÃ­a</h1>
          <p>Bodega A&M</p>
        </div>
        <div class="row"><label>NÂ° Salida:</label><span>${nro}</span></div>
        <div class="row"><label>Fecha:</label><span>${fecha}</span></div>
        <div class="row"><label>Tipo Doc.:</label><span>${tipodoc||'-'}</span></div>
        ${nrodoc ? `<div class="row"><label>NÂ° Documento:</label><span>${nrodoc}</span></div>` : ''}
        <div class="row"><label>Cliente:</label><span>${cliente||'-'}</span></div>
        ${obs ? `<div class="row"><label>Observaciones:</label><span>${obs}</span></div>` : ''}
        ${creadoPor ? `<div class="row"><label>Creada por:</label><span>${creadoPor} (${rolCreador})</span></div>` : ''}
        <table>
          <thead><tr><th>#</th><th>CÃ³digo</th><th>DescripciÃ³n</th><th>Unid.</th><th>Cant.</th><th style="padding-left:6px">En Palabras</th></tr></thead>
          <tbody>${filasProductos}</tbody>
        </table>
        <div class="footer">
          <p style="font-weight:bold">Entregar comprobante a bodeguero</p>
          <p style="margin-top:8px">Â¡Gracias por su compra!</p>
          <p style="margin-top:10px;font-size:9px">Bodega A&M â€” Documento interno</p>
        </div>
        ${qrHtml}
        <script>window.onload=function(){setTimeout(function(){window.print();},300);};<\/script>
      </body></html>`;

      ipcRenderer.send('imprimir', html);
      ipcRenderer.once('impresion-terminada', () => {});
    } catch(e) {
      window.print();
    }
  } else {
    window.print();
  }
}

// â”€â”€ CatÃ¡logo de productos â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
document.getElementById('btnGuardarProducto').addEventListener('click', () => {
  const codigo = document.getElementById('catCodigo').value.trim();
  const nombre = document.getElementById('catNombre').value.trim();
  const unidad = document.getElementById('catUnidad').value;

  if (!nombre) { showToast('Ingresa el nombre del producto', true); return; }
  if (codigo && catalogo.some(p => p.codigo === codigo)) {
    showToast('Ya existe un producto con ese cÃ³digo', true); return;
  }

  catalogo.push({ codigo, nombre, unidad });
  localStorage.setItem('catalogoProductos', JSON.stringify(catalogo));
  if (window.fbListo) fbGuardar('catalogo', codigo || nombre, { codigo, nombre, unidad });
  renderCatalogo();
  document.getElementById('catCodigo').value = '';
  document.getElementById('catNombre').value = '';
  document.getElementById('catUnidad').value = 'unidad';
  showToast('Producto guardado en catÃ¡logo');
});

function renderCatalogo(filtro = '') {
  if (catalogo.length === 0) {
    tbodyCat.innerHTML = '<tr><td colspan="5" class="empty-msg">No hay productos en el catÃ¡logo</td></tr>';
    return;
  }
  const datos = filtro
    ? catalogo.filter(p =>
        p.nombre.toLowerCase().includes(filtro.toLowerCase()) ||
        (p.codigo && p.codigo.toLowerCase().includes(filtro.toLowerCase())))
    : catalogo.slice(0, 50);

  tbodyCat.innerHTML = datos.map((p) => {
    const idx = catalogo.indexOf(p);
    return `<tr>
      <td><input type="checkbox" class="chk-catalogo" data-idx="${idx}" /></td>
      <td>${p.codigo || '-'}</td>
      <td>${p.nombre}</td>
      <td>${p.unidad}</td>
      <td>
        <button class="btn-add" style="padding:3px 8px;font-size:0.78rem;margin-right:4px" onclick="editarProductoCatalogo(${idx})">âœ</button>
        <button class="btn-delete" onclick="eliminarDelCatalogo(${idx})" title="Eliminar">âœ•</button>
      </td>
    </tr>`;
  }).join('');

  if (!filtro && catalogo.length > 50) {
    tbodyCat.innerHTML += `<tr><td colspan="5" style="text-align:center;color:#888;font-style:italic;padding:10px">
      Mostrando 50 de ${catalogo.length} productos. Usa el buscador para ver mÃ¡s.
    </td></tr>`;
  }
}

function editarProductoCatalogo(i) {
  const p = catalogo[i];
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.style.display = 'flex';
  overlay.innerHTML = `
    <div class="modal" style="max-width:400px">
      <div class="modal-header"><h3>âœ Editar Producto</h3><button class="modal-close" onclick="this.closest('.modal-overlay').remove()">âœ•</button></div>
      <div class="modal-body" style="padding:16px">
        <div class="field"><label>CÃ³digo</label><input type="text" id="editProdCodigo" value="${p.codigo || ''}" /></div>
        <div class="field" style="margin-top:10px"><label>Nombre</label><input type="text" id="editProdNombre" value="${p.nombre || ''}" /></div>
        <div class="field" style="margin-top:10px"><label>Unidad</label>
          <select id="editProdUnidad">
            <option value="unidad" ${p.unidad==='unidad'?'selected':''}>Unidad</option>
            <option value="kg" ${p.unidad==='kg'?'selected':''}>Kg</option>
            <option value="litro" ${p.unidad==='litro'?'selected':''}>Litro</option>
            <option value="caja" ${p.unidad==='caja'?'selected':''}>Caja</option>
            <option value="metro" ${p.unidad==='metro'?'selected':''}>Metro</option>
          </select>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn-secondary" onclick="this.closest('.modal-overlay').remove()">Cancelar</button>
        <button class="btn-primary" id="btnGuardarEditProd">âœ” Guardar</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.querySelector('#btnGuardarEditProd').addEventListener('click', () => {
    const nuevoCodigo = document.getElementById('editProdCodigo').value.trim();
    const nuevoNombre = document.getElementById('editProdNombre').value.trim();
    const nuevaUnidad = document.getElementById('editProdUnidad').value;
    if (!nuevoNombre) { showToast('El nombre es obligatorio', true); return; }
    if (window.fbListo && p.codigo !== nuevoCodigo) {
      fbEliminar('catalogo', p.codigo || p.nombre);
    }
    catalogo[i] = { codigo: nuevoCodigo, nombre: nuevoNombre, unidad: nuevaUnidad };
    localStorage.setItem('catalogoProductos', JSON.stringify(catalogo));
    if (window.fbListo) fbGuardar('catalogo', catalogo[i].codigo || catalogo[i].nombre, catalogo[i]);
    overlay.remove();
    renderCatalogo();
    showToast('âœ” Producto actualizado');
  });
}

function eliminarMasivoCatalogo() {
  const checks = document.querySelectorAll('.chk-catalogo:checked');
  if (checks.length === 0) { showToast('Selecciona al menos un producto', true); return; }
  if (!confirm(`Â¿Eliminar ${checks.length} producto(s) seleccionado(s)?`)) return;
  const indices = Array.from(checks).map(c => parseInt(c.dataset.idx)).sort((a,b) => b - a);
  indices.forEach(i => {
    const p = catalogo[i];
    if (window.fbListo) fbEliminar('catalogo', p.codigo || p.nombre);
    catalogo.splice(i, 1);
  });
  localStorage.setItem('catalogoProductos', JSON.stringify(catalogo));
  renderCatalogo();
  showToast(`âœ” ${indices.length} producto(s) eliminado(s)`);
}

function eliminarDelCatalogo(i) {
  if (!confirm(`Â¿Eliminar "${catalogo[i].nombre}" del catÃ¡logo?`)) return;
  const producto = catalogo[i];
  if (window.fbListo) fbEliminar('catalogo', producto.codigo || producto.nombre);
  catalogo.splice(i, 1);
  localStorage.setItem('catalogoProductos', JSON.stringify(catalogo));
  renderCatalogo();
}

document.getElementById('btnBuscarCatalogo').addEventListener('click', () => {
  renderCatalogo(document.getElementById('buscarCatalogo').value.trim());
});
document.getElementById('buscarCatalogo').addEventListener('keydown', e => {
  if (e.key === 'Enter') renderCatalogo(document.getElementById('buscarCatalogo').value.trim());
});
document.getElementById('btnMostrarTodosCatalogo').addEventListener('click', () => {
  document.getElementById('buscarCatalogo').value = '';
  renderCatalogo();
});

// Importar productos desde Excel/CSV
document.getElementById('btnImportarProductos').addEventListener('click', () => {
  const file = document.getElementById('inputExcelProductos').files[0];
  const resultEl = document.getElementById('importResultProductos');
  if (!file) { resultEl.innerHTML = '<span style="color:#e53e3e">Selecciona un archivo primero</span>'; return; }

  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      let rows = [];
      const fileName = file.name.toLowerCase();

      if (fileName.endsWith('.csv')) {
        // Leer CSV como texto y detectar separador
        const text = new TextDecoder('utf-8').decode(new Uint8Array(e.target.result));
        const sep = text.includes(';') ? ';' : ',';
        const lines = text.split(/\r?\n/).filter(l => l.trim());
        const headers = lines[0].split(sep).map(h => h.trim().replace(/^\uFEFF/, ''));
        rows = lines.slice(1).map(line => {
          const vals = line.split(sep);
          const obj = {};
          headers.forEach((h, i) => obj[h] = (vals[i] || '').trim());
          return obj;
        });
      } else {
        // Excel .xlsx/.xls
        const data = new Uint8Array(e.target.result);
        const wb   = XLSX.read(data, { type: 'array' });
        const ws   = wb.Sheets[wb.SheetNames[0]];
        rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
      }

      let agregados = 0, duplicados = 0, errores = 0;
      rows.forEach(row => {
        const codigo = String(row['CÃ³digo'] || row['Codigo'] || row['codigo'] || row['CÃ“DIGO'] || '').trim();
        const nombre = String(row['Nombre'] || row['nombre'] || row['NOMBRE'] || '').trim();
        const unidad = String(row['Unidad'] || row['unidad'] || row['UNIDAD'] || 'unidad').trim().toLowerCase() || 'unidad';

        if (!nombre) { errores++; return; }
        if (codigo && catalogo.some(p => p.codigo === codigo)) { duplicados++; return; }
        catalogo.push({ codigo, nombre, unidad });
        agregados++;
      });

      localStorage.setItem('catalogoProductos', JSON.stringify(catalogo));
      if (window.fbListo) catalogo.forEach(p => fbGuardar('catalogo', p.codigo || p.nombre, p));
      renderCatalogo();
      document.getElementById('inputExcelProductos').value = '';
      resultEl.innerHTML = `<span style="color:#03543f">âœ” ${agregados} producto(s) importado(s)</span>` +
        (duplicados ? ` Â· <span style="color:#92400e">${duplicados} duplicado(s) omitido(s)</span>` : '') +
        (errores    ? ` Â· <span style="color:#e53e3e">${errores} fila(s) sin nombre ignorada(s)</span>` : '');
    } catch (err) {
      console.error(err);
      resultEl.innerHTML = '<span style="color:#e53e3e">Error al leer el archivo. Verifica el formato.</span>';
    }
  };
  reader.readAsArrayBuffer(file);
});

// Descargar plantilla productos
document.getElementById('btnDescargarPlantillaProductos').addEventListener('click', (e) => {
  e.preventDefault();
  const csv = 'CÃ³digo;Nombre;Unidad\n001;Producto Ejemplo;unidad\n002;Otro Producto;kg\n';
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = 'plantilla_productos.csv';
  a.click();
  URL.revokeObjectURL(url);
});

// â”€â”€ Botones formulario â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
document.getElementById('btnLimpiar').addEventListener('click', () => {
  if (confirm('Â¿Limpiar el formulario?')) limpiarFormularioCompleto();
});

document.getElementById('btnNuevaOrden').addEventListener('click', () => {
  limpiarFormularioCompleto();
});

function limpiarFormularioCompleto() {
  // Cancelar modo ediciÃ³n si estaba activo
  window._editandoOrden = null;

  // Habilitar y limpiar todos los campos
  ['tipoDocumento','nroDocumento','solicitante','observaciones','fecha',
   'inputBuscar','inputCodigo','inputDescripcion','inputCantidad','inputCantidadPalabras'
  ].forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.disabled = false; el.value = ''; el.style.pointerEvents = ''; el.style.background = ''; }
  });
  document.getElementById('inputUnidad').value = 'unidad';
  document.getElementById('inputUnidad').disabled = false;
  document.getElementById('campoNroDoc').style.display = 'none';
  document.getElementById('sugerenciasCliente').classList.remove('visible');
  form.classList.remove('form-bloqueado');
  document.getElementById('btnAgregar').disabled = false;
  document.getElementById('btnRegistrar').disabled = false;
  document.getElementById('btnRegistrar').style.display = '';
  document.getElementById('btnRegistrar').textContent = 'âœ” Registrar Salida';
  registrando = false;
  document.getElementById('btnImprimir').style.display = 'none';
  document.getElementById('btnNuevaOrden').style.display = 'none';
  document.getElementById('ordenRegistradaBanner').style.display = 'none';
  productos = [];
  renderTabla();
  document.getElementById('fecha').value = fechaHoraLocal();
  nroSalidaEl.value = generarNro(contador);
  setTimeout(() => {
    document.getElementById('tipoDocumento').focus();
    if (window.require) {
      const { ipcRenderer } = window.require('electron');
      ipcRenderer.send('forzarFoco');
    }
  }, 150);
  // Reaplicar permisos de pestaÃ±as
  aplicarPermisos();
}

function aplicarPermisos() {
  if (!usuarioActivo) return;
  const p = usuarioActivo.permisos || {};
  const esAdmin = usuarioActivo.rol === 'Admin';

  document.querySelector('[data-tab="formulario"]').style.display  = (esAdmin || p.crearOrden)   ? '' : 'none';
  document.querySelector('[data-tab="reportes"]').style.display    = (esAdmin || p.reportes)     ? '' : 'none';
  document.querySelector('[data-tab="productos"]').style.display   = (esAdmin || p.productos)    ? '' : 'none';
  document.querySelector('[data-tab="clientes"]').style.display    = (esAdmin || p.clientes)     ? '' : 'none';
  document.querySelector('[data-tab="recepciones"]').style.display = (esAdmin || p.recepciones)  ? '' : 'none';
  document.querySelector('[data-tab="usuarios"]').style.display    = (esAdmin || p.usuarios)     ? '' : 'none';
  document.querySelector('[data-tab="caja"]').style.display        = (esAdmin || p.caja)         ? '' : 'none';

  document.querySelector('[data-tab="papelera"]').style.display    = esAdmin ? '' : 'none';
  document.querySelector('[data-tab="diagnosticos"]').style.display = esAdmin ? '' : 'none';

  // Activar la primera pestaÃ±a visible
  const tabs = document.querySelectorAll('.tab');
  const contents = document.querySelectorAll('.tab-content');
  let primeraVisible = null;
  tabs.forEach(t => {
    if (t.style.display !== 'none' && !primeraVisible) primeraVisible = t;
  });
  if (primeraVisible) {
    tabs.forEach(t => t.classList.remove('active'));
    contents.forEach(c => c.classList.remove('active'));
    primeraVisible.classList.add('active');
    const tabId = 'tab-' + primeraVisible.dataset.tab;
    const tabContent = document.getElementById(tabId);
    if (tabContent) tabContent.classList.add('active');
  }
}

document.getElementById('btnImprimir').addEventListener('click', () => imprimirPagina());

// â”€â”€ Buscar y reimprimir orden antigua â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
document.getElementById('btnBuscarOrden').addEventListener('click', buscarOrdenAntigua);
document.getElementById('buscarOrdenAntigua').addEventListener('keydown', e => {
  if (e.key === 'Enter') buscarOrdenAntigua();
});

function buscarOrdenAntigua() {
  const q = document.getElementById('buscarOrdenAntigua').value.trim().toLowerCase();
  const tabla = document.getElementById('tablaOrdenesAntiguas');
  const tbody = document.getElementById('tbodyOrdenesAntiguas');

  const datos = q
    ? historial.filter(s =>
        s.nro.toLowerCase().includes(q) ||
        (s.solicitante && s.solicitante.toLowerCase().includes(q)) ||
        (s.nroDocumento && s.nroDocumento.toLowerCase().includes(q))
      )
    : historial.slice(0, 6);

  tabla.style.display = historial.length === 0 ? 'none' : 'table';

  if (datos.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="empty-msg">No se encontraron Ã³rdenes</td></tr>';
    return;
  }

  tbody.innerHTML = datos.map(s => {
    const anulada  = s.anulada === true;
    const recibida = recepciones.some(r => r.nroOrden === s.nro);
    const estado   = anulada
      ? '<span class="badge badge-anulada">Anulada</span>'
      : recibida
        ? '<span class="badge badge-recibida">Recibida</span>'
        : '<span class="badge badge-pendiente">Pendiente</span>';
    return `<tr style="${anulada ? 'opacity:0.5' : ''}">
      <td><strong>${s.nro}</strong></td>
      <td>${formatFecha(s.fecha)}</td>
      <td>${s.tipoDocumento || '-'}</td>
      <td>${s.nroDocumento || '-'}</td>
      <td>${s.solicitante || '-'}</td>
      <td>${estado}</td>
      <td>
        <button class="btn-ver" onclick="verOrdenAntigua('${s.nro}')" style="margin-right:4px">Ver</button>
        ${!anulada && !recibida ? `<button class="btn-secondary" style="padding:4px 10px;font-size:0.8rem;margin-right:4px" onclick="editarOrden('${s.nro}')">âœ Editar</button>` : ''}
        ${!anulada && !recibida ? `<button class="btn-add" style="padding:4px 10px;font-size:0.8rem" onclick="reimprimirOrden(this)" data-nro="${s.nro}">ðŸ–¨ Reimprimir</button>` : ''}
        ${!anulada && !recibida ? `<button class="btn-delete" style="margin-left:4px" onclick="anularOrden(this)" data-nro="${s.nro}" title="Anular">ðŸš« Anular</button>` : ''}
        ${recibida ? `<button class="btn-add" style="padding:4px 10px;font-size:0.8rem" onclick="reimprimirOrden(this)" data-nro="${s.nro}">ðŸ–¨ Reimprimir</button>` : ''}
      </td>
    </tr>`;
  }).join('');
}

function verOrdenAntigua(nro) {
  const idx = historial.findIndex(s => s.nro === nro);
  if (idx !== -1) abrirModal(idx);
}

function anularOrden(btn) {
  const nro = btn.dataset.nro;
  const idx = historial.findIndex(o => o.nro === nro);
  if (idx === -1) return;
  // No permitir anular si ya fue recibida
  if (recepciones.some(r => r.nroOrden === nro)) {
    showToast('No se puede anular una orden ya recibida', true); return;
  }
  if (!confirm(`Â¿EstÃ¡ seguro de anular la orden ${nro}? Esta acciÃ³n no se puede deshacer.`)) return;
  historial[idx].anulada = true;
  localStorage.setItem('historialSalidas', JSON.stringify(historial));
  // Sincronizar anulaciÃ³n con Firebase
  if (window.fbListo) fbGuardar('historial', nro, historial[idx]);
  showToast(`Orden ${nro} anulada`);
  registrarActividad('Orden anulada', `${nro}`);
  buscarOrdenAntigua();
}

// â”€â”€ Editar orden existente (solo si no fue recibida ni anulada) â”€â”€
function editarOrden(nro) {
  const idx = historial.findIndex(o => o.nro === nro);
  if (idx === -1) { showToast('Orden no encontrada', true); return; }
  const s = historial[idx];
  if (s.anulada) { showToast('No se puede editar una orden anulada', true); return; }
  if (recepciones.some(r => r.nroOrden === nro)) { showToast('No se puede editar una orden ya recibida', true); return; }

  if (!confirm(`Â¿Deseas editar la orden ${nro}? Se cargarÃ¡ en el formulario para modificarla.`)) return;

  // Cargar datos en el formulario
  resetForm();
  document.getElementById('nroSalida').value      = s.nro;
  document.getElementById('fecha').value          = s.fecha;
  document.getElementById('tipoDocumento').value  = s.tipoDocumento || '';
  document.getElementById('nroDocumento').value   = s.nroDocumento || '';
  document.getElementById('solicitante').value    = s.solicitante || '';
  document.getElementById('observaciones').value  = s.observaciones || '';
  document.getElementById('campoNroDoc').style.display = (!s.tipoDocumento) ? 'none' : '';
  productos = [...s.productos];
  renderTabla();

  // Marcar que estamos editando (no crear nueva orden)
  window._editandoOrden = nro;

  // Cambiar texto del botÃ³n
  document.getElementById('btnRegistrar').textContent = 'âœ” Guardar Cambios';

  // Scroll al formulario
  document.getElementById('tab-formulario').scrollTo({ top: 0, behavior: 'smooth' });
  window.scrollTo({ top: 0, behavior: 'smooth' });

  showToast(`Editando orden ${nro}. Modifica y presiona "Guardar Cambios".`);
  registrarActividad('Editando orden', `${nro}`);
}

function reimprimirOrden(btn) {
  const nro = btn.dataset.nro;
  const s = historial.find(o => o.nro === nro);
  if (!s) return;
  document.getElementById('nroSalida').value      = s.nro;
  document.getElementById('fecha').value          = s.fecha;
  document.getElementById('tipoDocumento').value  = s.tipoDocumento || '';
  document.getElementById('nroDocumento').value   = s.nroDocumento || '';
  document.getElementById('solicitante').value    = s.solicitante;
  document.getElementById('observaciones').value  = s.observaciones || '';
  document.getElementById('campoNroDoc').style.display = s.tipoDocumento ? '' : 'none';
  productos = [...s.productos];
  renderTabla();
  setTimeout(() => { imprimirPagina(); resetForm(); }, 300);
}

// â”€â”€ Autocomplete clientes en campo solicitante â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function buscarClienteAutoComplete() {
  const input = document.getElementById('solicitante');
  const lista = document.getElementById('sugerenciasCliente');
  const q = input.value.trim().toLowerCase();
  if (!q || clientes.length === 0) { lista.classList.remove('visible'); return; }
  const filtrados = clientes.filter(c =>
    c.nombre.toLowerCase().includes(q) || (c.rut && c.rut.toLowerCase().includes(q))
  );
  if (filtrados.length === 0) { lista.classList.remove('visible'); return; }
  lista.innerHTML = filtrados.map(c =>
    `<li onclick="seleccionarCliente('${c.nombre.replace(/'/g,"\\'")}')">
      <strong>${c.nombre}</strong><span>${c.rut || ''}</span>
    </li>`
  ).join('');
  lista.classList.add('visible');
}

solicitanteInput.addEventListener('input', buscarClienteAutoComplete);

function seleccionarCliente(nombre) {
  solicitanteInput.value = nombre;
  sugerenciasCliente.classList.remove('visible');
}

document.addEventListener('click', (e) => {
  if (!e.target.closest('#solicitante') && !e.target.closest('#sugerenciasCliente'))
    sugerenciasCliente.classList.remove('visible');
});

// â”€â”€ Clientes â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
document.getElementById('btnGuardarCliente').addEventListener('click', () => {
  const rut       = document.getElementById('cliRut').value.trim();
  const nombre    = document.getElementById('cliNombre').value.trim();
  const telefono  = document.getElementById('cliTelefono').value.trim();
  const direccion = document.getElementById('cliDireccion').value.trim();

  if (!nombre) { showToast('Ingresa el nombre del cliente', true); return; }
  if (rut && clientes.some(c => c.rut === rut)) {
    showToast('Ya existe un cliente con ese RUT', true); return;
  }

  clientes.push({ rut, nombre, telefono, direccion });
  localStorage.setItem('clientesBodega', JSON.stringify(clientes));
  if (window.fbListo) fbGuardar('clientes', rut || nombre, { rut, nombre, telefono, direccion });
  renderClientes();
  document.getElementById('cliRut').value       = '';
  document.getElementById('cliNombre').value    = '';
  document.getElementById('cliTelefono').value  = '';
  document.getElementById('cliDireccion').value = '';
  showToast('Cliente guardado');
});

function renderClientes(filtro = '') {
  const tbody = document.getElementById('tbodyClientes');
  if (clientes.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="empty-msg">No hay clientes registrados</td></tr>';
    return;
  }
  const datos = filtro
    ? clientes.filter(c =>
        c.nombre.toLowerCase().includes(filtro.toLowerCase()) ||
        (c.rut && c.rut.toLowerCase().includes(filtro.toLowerCase())))
    : clientes.slice(0, 50);

  tbody.innerHTML = datos.map((c) => {
    const idx = clientes.indexOf(c);
    return `<tr>
      <td><input type="checkbox" class="chk-cliente" data-idx="${idx}" /></td>
      <td>${c.rut || '-'}</td>
      <td>${c.nombre}</td>
      <td>${c.telefono || '-'}</td>
      <td>${c.direccion || '-'}</td>
      <td>
        <button class="btn-add" style="padding:3px 8px;font-size:0.78rem;margin-right:4px" onclick="editarCliente(${idx})">âœ</button>
        <button class="btn-delete" onclick="eliminarCliente(${idx})" title="Eliminar">âœ•</button>
      </td>
    </tr>`;
  }).join('');

  if (!filtro && clientes.length > 50) {
    tbody.innerHTML += `<tr><td colspan="6" style="text-align:center;color:#888;font-style:italic;padding:10px">
      Mostrando 50 de ${clientes.length} clientes. Usa el buscador para ver mÃ¡s.
    </td></tr>`;
  }
}

function editarCliente(i) {
  const c = clientes[i];
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.style.display = 'flex';
  overlay.innerHTML = `
    <div class="modal" style="max-width:450px">
      <div class="modal-header"><h3>âœ Editar Cliente</h3><button class="modal-close" onclick="this.closest('.modal-overlay').remove()">âœ•</button></div>
      <div class="modal-body" style="padding:16px">
        <div class="field"><label>RUT</label><input type="text" id="editCliRut" value="${c.rut || ''}" /></div>
        <div class="field" style="margin-top:10px"><label>Nombre / RazÃ³n Social</label><input type="text" id="editCliNombre" value="${c.nombre || ''}" /></div>
        <div class="field" style="margin-top:10px"><label>TelÃ©fono</label><input type="text" id="editCliTelefono" value="${c.telefono || ''}" /></div>
        <div class="field" style="margin-top:10px"><label>DirecciÃ³n</label><input type="text" id="editCliDireccion" value="${c.direccion || ''}" /></div>
      </div>
      <div class="modal-footer">
        <button class="btn-secondary" onclick="this.closest('.modal-overlay').remove()">Cancelar</button>
        <button class="btn-primary" id="btnGuardarEditCli">âœ” Guardar</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.querySelector('#btnGuardarEditCli').addEventListener('click', () => {
    const nuevoRut = document.getElementById('editCliRut').value.trim();
    const nuevoNombre = document.getElementById('editCliNombre').value.trim();
    const nuevoTelefono = document.getElementById('editCliTelefono').value.trim();
    const nuevaDireccion = document.getElementById('editCliDireccion').value.trim();
    if (!nuevoNombre) { showToast('El nombre es obligatorio', true); return; }
    if (window.fbListo && (c.rut || c.nombre) !== (nuevoRut || nuevoNombre)) {
      fbEliminar('clientes', c.rut || c.nombre);
    }
    clientes[i] = { rut: nuevoRut, nombre: nuevoNombre, telefono: nuevoTelefono, direccion: nuevaDireccion };
    localStorage.setItem('clientesBodega', JSON.stringify(clientes));
    if (window.fbListo) fbGuardar('clientes', clientes[i].rut || clientes[i].nombre, clientes[i]);
    overlay.remove();
    renderClientes();
    showToast('âœ” Cliente actualizado');
  });
}

function eliminarMasivoClientes() {
  const checks = document.querySelectorAll('.chk-cliente:checked');
  if (checks.length === 0) { showToast('Selecciona al menos un cliente', true); return; }
  if (!confirm(`Â¿Eliminar ${checks.length} cliente(s) seleccionado(s)?`)) return;
  const indices = Array.from(checks).map(c => parseInt(c.dataset.idx)).sort((a,b) => b - a);
  indices.forEach(i => {
    const c = clientes[i];
    if (window.fbListo) fbEliminar('clientes', c.rut || c.nombre);
    clientes.splice(i, 1);
  });
  localStorage.setItem('clientesBodega', JSON.stringify(clientes));
  renderClientes();
  showToast(`âœ” ${indices.length} cliente(s) eliminado(s)`);
}

function eliminarCliente(i) {
  if (!confirm(`Â¿Eliminar al cliente "${clientes[i].nombre}"?`)) return;
  const cliente = clientes[i];
  if (window.fbListo) fbEliminar('clientes', cliente.rut || cliente.nombre);
  clientes.splice(i, 1);
  localStorage.setItem('clientesBodega', JSON.stringify(clientes));
  renderClientes();
}

document.getElementById('btnBuscarClienteLista').addEventListener('click', () => {
  renderClientes(document.getElementById('buscarClienteLista').value.trim());
});
document.getElementById('buscarClienteLista').addEventListener('keydown', e => {
  if (e.key === 'Enter') renderClientes(document.getElementById('buscarClienteLista').value.trim());
});
document.getElementById('btnMostrarTodosClientes').addEventListener('click', () => {
  document.getElementById('buscarClienteLista').value = '';
  renderClientes();
});

// Importar clientes desde Excel/CSV
document.getElementById('btnImportarClientes').addEventListener('click', () => {
  const file = document.getElementById('inputExcelClientes').files[0];
  const resultEl = document.getElementById('importResult');
  if (!file) { resultEl.innerHTML = '<span style="color:#e53e3e">Selecciona un archivo primero</span>'; return; }

  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      let rows = [];
      const fileName = file.name.toLowerCase();

      if (fileName.endsWith('.csv')) {
        const text = new TextDecoder('utf-8').decode(new Uint8Array(e.target.result));
        const sep = text.includes(';') ? ';' : ',';
        const lines = text.split(/\r?\n/).filter(l => l.trim());
        const headers = lines[0].split(sep).map(h => h.trim().replace(/^\uFEFF/, ''));
        rows = lines.slice(1).map(line => {
          const vals = line.split(sep);
          const obj = {};
          headers.forEach((h, i) => obj[h] = (vals[i] || '').trim());
          return obj;
        });
      } else {
        const data = new Uint8Array(e.target.result);
        const wb   = XLSX.read(data, { type: 'array' });
        const ws   = wb.Sheets[wb.SheetNames[0]];
        rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
      }

      let agregados = 0, duplicados = 0, errores = 0;
      rows.forEach(row => {
        const rut       = String(row['RUT'] || row['rut'] || '').trim();
        const nombre    = String(row['Nombre'] || row['nombre'] || row['NOMBRE'] || '').trim();
        const telefono  = String(row['TelÃ©fono'] || row['Telefono'] || row['telefono'] || '').trim();
        const direccion = String(row['DirecciÃ³n'] || row['Direccion'] || row['direccion'] || '').trim();

        if (!nombre) { errores++; return; }
        if (rut && clientes.some(c => c.rut === rut)) { duplicados++; return; }
        clientes.push({ rut, nombre, telefono, direccion });
        agregados++;
      });

      localStorage.setItem('clientesBodega', JSON.stringify(clientes));
      if (window.fbListo) clientes.forEach(c => fbGuardar('clientes', c.rut || c.nombre, c));
      renderClientes();
      document.getElementById('inputExcelClientes').value = '';
      resultEl.innerHTML = `<span style="color:#03543f">âœ” ${agregados} cliente(s) importado(s)</span>` +
        (duplicados ? ` Â· <span style="color:#92400e">${duplicados} duplicado(s) omitido(s)</span>` : '') +
        (errores    ? ` Â· <span style="color:#e53e3e">${errores} fila(s) sin nombre ignorada(s)</span>` : '');
    } catch (err) {
      console.error(err);
      resultEl.innerHTML = '<span style="color:#e53e3e">Error al leer el archivo. Verifica el formato.</span>';
    }
  };
  reader.readAsArrayBuffer(file);
});

// Descargar plantilla CSV
document.getElementById('btnDescargarPlantilla').addEventListener('click', (e) => {
  e.preventDefault();
  const csv = 'RUT;Nombre;TelÃ©fono;DirecciÃ³n\n12.345.678-9;Ejemplo Cliente;+56912345678;Av. Ejemplo 123\n';
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = 'plantilla_clientes.csv';
  a.click();
  URL.revokeObjectURL(url);
});

// â”€â”€ Usuarios â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
let editandoUsuarioIdx = null;

document.getElementById('btnGuardarUsuario').addEventListener('click', async () => {
  const nombre   = document.getElementById('usuNombre').value.trim();
  const login    = document.getElementById('usuLogin').value.trim().toLowerCase();
  const password = document.getElementById('usuPassword').value;
  const rol      = document.getElementById('usuRol').value;

  if (!nombre)   { showToast('Ingresa el nombre del usuario', true); return; }
  if (!login)    { showToast('Ingresa el nombre de usuario', true); return; }
  if (!password && editandoUsuarioIdx === null) { showToast('Ingresa una contraseÃ±a', true); return; }

  let passwordHash;
  if (password) {
    passwordHash = await hashPassword(password);
  } else if (editandoUsuarioIdx !== null) {
    passwordHash = usuarios[editandoUsuarioIdx].password;
  }

  const permisos = {
    crearOrden:       document.getElementById('permCrearOrden').checked,
    reportes:         document.getElementById('permReportes').checked,
    eliminarReporte:  document.getElementById('permEliminarReporte').checked,
    productos:        document.getElementById('permProductos').checked,
    clientes:         document.getElementById('permClientes').checked,
    recepciones:      document.getElementById('permRecepciones').checked,
    caja:             document.getElementById('permCaja').checked,

    usuarios:         document.getElementById('permUsuarios').checked,
  };

  if (editandoUsuarioIdx !== null) {
    const loginExiste = usuarios.some((u, i) => u.login === login && i !== editandoUsuarioIdx);
    if (loginExiste) { showToast('Ya existe un usuario con ese nombre', true); return; }
    usuarios[editandoUsuarioIdx] = { ...usuarios[editandoUsuarioIdx], nombre, login, password: passwordHash, rol, permisos };
    localStorage.setItem('usuariosBodega', JSON.stringify(usuarios));
    if (window.fbListo) fbGuardar('usuarios', login, usuarios[editandoUsuarioIdx]);
    showToast(`Usuario "${login}" actualizado`);
    registrarActividad('Usuario editado', `${nombre} (${login}) â€” Rol: ${rol}`);
    editandoUsuarioIdx = null;
    const btn = document.getElementById('btnGuardarUsuario');
    btn.textContent = '+ Agregar';
    btn.style.background = '';
  } else {
    if (usuarios.some(u => u.login === login)) { showToast('Ya existe un usuario con ese nombre', true); return; }
    usuarios.push({ nombre, login, password: passwordHash, rol, activo: true, permisos });
    localStorage.setItem('usuariosBodega', JSON.stringify(usuarios));
    const guardarUsuarioFb = () => {
      if (window.fbListo) fbGuardar('usuarios', login, { nombre, login, password: passwordHash, rol, activo: true, permisos });
      else setTimeout(guardarUsuarioFb, 500);
    };
    guardarUsuarioFb();
    showToast(`Usuario "${login}" creado correctamente`);
    registrarActividad('Usuario creado', `${nombre} (${login}) â€” Rol: ${rol}`);
  }

  renderUsuarios();
  document.getElementById('usuNombre').value   = '';
  document.getElementById('usuLogin').value    = '';
  document.getElementById('usuPassword').value = '';
  document.getElementById('usuPassword').placeholder = 'â€¢â€¢â€¢â€¢â€¢â€¢';
  document.getElementById('usuRol').value      = 'Bodeguero';
  document.getElementById('permCrearOrden').checked      = true;
  document.getElementById('permReportes').checked        = true;
  document.getElementById('permEliminarReporte').checked = false;
  document.getElementById('permProductos').checked       = true;
  document.getElementById('permClientes').checked        = true;
  document.getElementById('permRecepciones').checked     = true;
  document.getElementById('permCaja').checked            = true;
  document.getElementById('permUsuarios').checked        = false;
});

function editarUsuario(i) {
  const u = usuarios[i];
  editandoUsuarioIdx = i;
  document.getElementById('usuNombre').value   = u.nombre;
  document.getElementById('usuLogin').value    = u.login;
  document.getElementById('usuPassword').value = '';
  document.getElementById('usuPassword').placeholder = '(dejar vacÃ­o para mantener)';
  document.getElementById('usuRol').value      = u.rol;
  const p = u.permisos || {};
  document.getElementById('permCrearOrden').checked      = p.crearOrden      ?? true;
  document.getElementById('permReportes').checked        = p.reportes        ?? true;
  document.getElementById('permEliminarReporte').checked = p.eliminarReporte ?? false;
  document.getElementById('permProductos').checked       = p.productos       ?? true;
  document.getElementById('permClientes').checked        = p.clientes        ?? true;
  document.getElementById('permRecepciones').checked     = p.recepciones     ?? true;
  document.getElementById('permCaja').checked            = p.caja            ?? true;
  document.getElementById('permUsuarios').checked        = p.usuarios        ?? false;
  const btn = document.getElementById('btnGuardarUsuario');
  btn.textContent = 'âœ” Actualizar';
  btn.style.background = '#16a34a';
  document.querySelector('#tab-usuarios .add-product-row').scrollIntoView({ behavior: 'smooth' });
}

function renderUsuarios() {
  const tbody = document.getElementById('tbodyUsuarios');
  document.querySelector('#tab-usuarios .add-product-row').style.display = 'flex';

  if (usuarios.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="empty-msg">No hay usuarios registrados</td></tr>';
    return;
  }
  tbody.innerHTML = usuarios.map((u, i) => {
    const p = u.permisos;
    const permTexto = u.rol === 'Admin'
      ? '<span class="badge badge-admin">Todos los permisos</span>'
      : (p ? [
          p.crearOrden      ? '<span class="badge badge-bodeguero">Crear Orden</span>' : '',
          p.reportes        ? '<span class="badge badge-bodeguero">Reportes</span>' : '',
          p.eliminarReporte ? '<span class="badge badge-supervisor">Elim. Reporte</span>' : '',
          p.productos       ? '<span class="badge badge-bodeguero">Productos</span>' : '',
          p.clientes        ? '<span class="badge badge-bodeguero">Clientes</span>' : '',
          p.recepciones     ? '<span class="badge badge-bodeguero">Recepciones</span>' : '',
          p.usuarios        ? '<span class="badge badge-supervisor">Usuarios</span>' : '',
        ].filter(Boolean).join(' ') || '<span class="badge badge-inactivo">Sin permisos</span>'
        : '<span class="badge badge-inactivo">Sin permisos</span>');
    return `<tr>
      <td>${u.nombre}</td>
      <td>${u.login}</td>
      <td><span class="badge badge-${u.rol.toLowerCase().replace(/\s+/g,'-').normalize('NFD').replace(/[\u0300-\u036f]/g,'')}">${u.rol}</span></td>
      <td style="font-size:0.8rem">${permTexto}</td>
      <td><span class="badge ${u.activo ? 'badge-activo' : 'badge-inactivo'}">${u.activo ? 'Activo' : 'Inactivo'}</span></td>
      <td>
        <button class="btn-toggle" onclick="toggleUsuario(${i})">${u.activo ? 'Desactivar' : 'Activar'}</button>
        <button class="btn-ver" onclick="editarUsuario(${i})">Editar</button>
        <button class="btn-delete" onclick="eliminarUsuario(${i})" title="Eliminar">âœ•</button>
      </td>
    </tr>`;
  }).join('');
}

function toggleUsuario(i) {
  const u = usuarios[i];
  if (u.activo) {
    if (!confirm(`Â¿EstÃ¡ seguro de desactivar al usuario "${u.nombre}"?`)) return;
  }
  usuarios[i].activo = !usuarios[i].activo;
  localStorage.setItem('usuariosBodega', JSON.stringify(usuarios));
  if (window.fbListo) fbGuardar('usuarios', usuarios[i].login, usuarios[i]);
  renderUsuarios();
}

function eliminarUsuario(i) {
  if (!confirm(`Â¿Eliminar al usuario "${usuarios[i].login}"?`)) return;
  const loginEliminado = usuarios[i].login;
  usuarios.splice(i, 1);
  localStorage.setItem('usuariosBodega', JSON.stringify(usuarios));
  if (window.fbListo) fbEliminar('usuarios', loginEliminado);
  renderUsuarios();
}

document.getElementById('btnEliminarHistorial').addEventListener('click', async () => {
  if (!confirm('Â¿Eliminar TODO el historial de Ã³rdenes y recepciones? Esta acciÃ³n no se puede deshacer.')) return;
  if (!confirm('Â¿EstÃ¡ completamente seguro? Se perderÃ¡n todos los registros.')) return;

  // Eliminar de Firebase
  if (window.fbListo) {
    showToast('ðŸ”„ Eliminando de la nube...');
    const [fbHistorial, fbRecepciones, fbConfig] = await Promise.all([
      fbCargar('historial'),
      fbCargar('recepciones'),
      fbCargar('config')
    ]);
    await Promise.all([
      ...fbHistorial.map(s => fbEliminar('historial', s.nro)),
      ...fbRecepciones.map(r => fbEliminar('recepciones', r.nro)),
      ...fbConfig.map(c => fbEliminar('config', 'contador'))
    ]);
  }

  historial   = [];
  recepciones = [];
  contador    = 1;
  contadorRec = 1;
  localStorage.removeItem('historialSalidas');
  localStorage.removeItem('contadorSalidas');
  localStorage.removeItem('recepcionesBodega');
  localStorage.removeItem('contadorRecepciones');
  nroSalidaEl.value = generarNro(contador);
  renderReportes();
  renderRecepciones();
  renderOrdenesEmitidas();
  buscarOrdenAntigua();
  showToast('Historial eliminado y contador reiniciado');
  registrarActividad('Historial eliminado', 'Se eliminaron todas las Ã³rdenes y recepciones');
});

// â”€â”€ Recepciones â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function generarNroRec(n) {
  return 'REC-' + String(n).padStart(4, '0');
}

// Render Ã³rdenes emitidas (pendientes y recibidas)
function renderOrdenesEmitidas(filtro = '') {
  const tbody = document.getElementById('tbodyOrdenesEmitidas');
  let datos = historial.filter(s => !s.anulada && !recepciones.some(r => r.nroOrden === s.nro));
  // Ordenar por fecha mÃ¡s reciente primero
  datos.sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));
  if (filtro) {
    const q = filtro.toLowerCase();
    datos = datos.filter(s =>
      s.nro.toLowerCase().includes(q) ||
      ((s.solicitante || s.Cliente || '').toLowerCase().includes(q))
    );
  } else {
    datos = datos.slice(0, 20);
  }
  if (datos.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="empty-msg">No hay Ã³rdenes pendientes</td></tr>';
    return;
  }
  tbody.innerHTML = datos.map(s => {
    return `<tr>
      <td><strong>${s.nro}</strong></td>
      <td>${s.tipoDocumento || '-'}</td>
      <td>${formatFecha(s.fecha)}</td>
      <td>${s.solicitante || s.Cliente || '-'}</td>
      <td><span class="badge badge-pendiente">Pendiente</span></td>
      <td>
        <button class="btn-add" style="padding:4px 12px;font-size:0.8rem" onclick="abrirModalRec(this)" data-nro="${s.nro}">ðŸ“¥ Recibir</button>
        <button class="btn-ver" onclick="verOrdenEmitida(this)" data-nro="${s.nro}">Ver</button>
      </td>
    </tr>`;
  }).join('');
}

function renderRecepciones(filtro = '') {
  const tbody = document.getElementById('tbodyRecepciones');
  // Eliminar duplicados por nroOrden
  const vistos = new Set();
  recepciones = recepciones.filter(r => {
    if (vistos.has(r.nroOrden)) return false;
    vistos.add(r.nroOrden);
    return true;
  });
  let datos = recepciones;
  if (filtro) {
    const q = filtro.toLowerCase();
    datos = recepciones.filter(r =>
      r.nro.toLowerCase().includes(q) ||
      r.nroOrden.toLowerCase().includes(q) ||
      (r.solicitante || r.Cliente || '').toLowerCase().includes(q) ||
      r.recibidoPor.toLowerCase().includes(q)
    );
  } else {
    datos = recepciones.slice(0, 12);
  }
  if (datos.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="empty-msg">No hay recepciones que coincidan</td></tr>';
    return;
  }
  tbody.innerHTML = datos.map((r, i) => `
    <tr>
      <td><strong>${r.nro}</strong></td>
      <td>${r.nroOrden}</td>
      <td>${formatFecha(r.fecha)}</td>
      <td>${r.solicitante || r.Cliente || '-'}</td>
      <td>${r.recibidoPor}</td>
      <td><span class="badge badge-recibida">Recibida</span></td>
      <td>
        <button class="btn-ver" onclick="verRecepcion(${recepciones.indexOf(r)})">Ver</button>
      </td>
    </tr>`).join('');
}

// Abrir modal para confirmar recepciÃ³n de una orden
function verOrdenEmitida(btn) {
  const nroOrden = btn.dataset.nro;
  const s = historial.find(o => o.nro === nroOrden);
  if (!s) return;
  ordenImpresion = s;
  document.getElementById('modalTitulo').textContent = `Orden ${s.nro}`;
  document.getElementById('modalBody').innerHTML = `
    <div class="detail-row"><strong>NÂ° Salida:</strong> ${s.nro}</div>
    <div class="detail-row"><strong>Fecha:</strong> ${formatFecha(s.fecha)}</div>
    <div class="detail-row"><strong>Tipo Documento:</strong> ${s.tipoDocumento || '-'}</div>
    <div class="detail-row"><strong>NÂ° Documento:</strong> ${s.nroDocumento || '-'}</div>
    <div class="detail-row"><strong>Cliente:</strong> ${s.solicitante || '-'}</div>
    ${s.creadoPor ? `<div class="detail-row"><strong>Creada por:</strong> ${s.creadoPor} (${s.rolCreador || '-'})</div>` : ''}
    ${s.observaciones ? `<div class="detail-row"><strong>Observaciones:</strong> ${s.observaciones}</div>` : ''}
    <table style="margin-top:14px">
      <thead><tr><th>#</th><th>CÃ³digo</th><th>DescripciÃ³n</th><th>Unidad</th><th>Cantidad</th><th>En Palabras</th></tr></thead>
      <tbody>
        ${s.productos.map((p, j) => `
          <tr>
            <td>${j+1}</td><td>${p.codigo||'-'}</td><td>${p.descripcion}</td>
            <td>${p.unidad}</td><td>${p.cantidad}</td><td>${p.cantPalabras||'-'}</td>
          </tr>`).join('')}
      </tbody>
    </table>`;
  document.getElementById('modalOverlay').style.display = 'flex';
}

function abrirModalRec(btn) {
  const nroOrden = btn.dataset.nro;
  const orden = historial.find(s => s.nro === nroOrden);
  if (!orden) return;
  ordenEnRecepcion = orden;
  document.getElementById('modalRecTitulo').textContent = `Recibir Orden ${nroOrden}`;
  const selectRec = document.getElementById('recibidoPor');
  // Mostrar todos los usuarios activos para que cualquiera pueda recibir
  let opcionesUsuarios = '<option value="">-- Seleccionar --</option>';
  // Primero el usuario activo (preseleccionado arriba)
  opcionesUsuarios += `<option value="${usuarioActivo.nombre}">${usuarioActivo.nombre} (${usuarioActivo.rol})</option>`;
  // Luego los demÃ¡s usuarios activos
  usuarios.filter(u => u.activo && u.login !== usuarioActivo.login).forEach(u => {
    opcionesUsuarios += `<option value="${u.nombre}">${u.nombre} (${u.rol})</option>`;
  });
  // OpciÃ³n para escribir otro nombre manualmente
  opcionesUsuarios += `<option value="__otro__">âœ Otra persona...</option>`;
  selectRec.innerHTML = opcionesUsuarios;
  selectRec.value = '';
  // Crear/mostrar input para nombre manual
  let inputOtro = document.getElementById('inputRecOtroNombre');
  if (!inputOtro) {
    inputOtro = document.createElement('input');
    inputOtro.type = 'text';
    inputOtro.id = 'inputRecOtroNombre';
    inputOtro.placeholder = 'Escribe el nombre...';
    inputOtro.style.cssText = 'margin-top:8px; display:none; width:100%;';
    selectRec.parentNode.appendChild(inputOtro);
  }
  inputOtro.style.display = 'none';
  inputOtro.value = '';
  // Listener para "Otra persona"
  selectRec.onchange = function() {
    if (this.value === '__otro__') {
      inputOtro.style.display = '';
      inputOtro.focus();
    } else {
      inputOtro.style.display = 'none';
    }
  };
  document.getElementById('modalRecBody').innerHTML = `
    <div class="detail-row"><strong>NÂ° Orden:</strong> ${orden.nro}</div>
    <div class="detail-row"><strong>Fecha EmisiÃ³n:</strong> ${formatFecha(orden.fecha)}</div>
    <div class="detail-row"><strong>Tipo Documento:</strong> ${orden.tipoDocumento || '-'}</div>
    <div class="detail-row"><strong>NÂ° Documento:</strong> ${orden.nroDocumento || '-'}</div>
    <div class="detail-row"><strong>Cliente:</strong> ${orden.solicitante}</div>
    ${orden.creadoPor ? `<div class="detail-row"><strong>Creada por:</strong> ${orden.creadoPor} (${orden.rolCreador || '-'})</div>` : ''}
    <table style="margin-top:14px">
      <thead><tr><th>#</th><th>CÃ³digo</th><th>DescripciÃ³n</th><th>Unidad</th><th>Cantidad</th></tr></thead>
      <tbody>
        ${orden.productos.map((p, j) => `
          <tr>
            <td>${j+1}</td><td>${p.codigo||'-'}</td><td>${p.descripcion}</td>
            <td>${p.unidad}</td><td>${p.cantidad}</td>
          </tr>`).join('')}
      </tbody>
    </table>`;
  document.getElementById('modalRecepcion').style.display = 'flex';
}

function cerrarModalRec() {
  document.getElementById('modalRecepcion').style.display = 'none';
  ordenEnRecepcion = null;
}

async function confirmarRecepcion() {
  let recibidoPor = document.getElementById('recibidoPor').value.trim();
  // Si eligiÃ³ "Otra persona", usar el input de texto
  if (recibidoPor === '__otro__') {
    const inputOtro = document.getElementById('inputRecOtroNombre');
    recibidoPor = inputOtro ? inputOtro.value.trim() : '';
  }
  if (!recibidoPor) { showToast('Ingresa quiÃ©n recibe la orden', true); return; }

  // Verificar que no estÃ© ya recibida (en local y en Firebase)
  if (recepciones.some(r => r.nroOrden === ordenEnRecepcion.nro)) {
    showToast('Esta orden ya fue recibida', true);
    cerrarModalRec();
    renderOrdenesEmitidas();
    return;
  }
  if (window.fbListo) {
    const fbRecs = await fbCargar('recepciones');
    if (fbRecs.some(r => r.nroOrden === ordenEnRecepcion.nro)) {
      showToast('Esta orden ya fue recibida por otro usuario', true);
      recepciones = fbRecs.sort((a,b) => b.nro.localeCompare(a.nro));
      localStorage.setItem('recepcionesBodega', JSON.stringify(recepciones));
      cerrarModalRec();
      renderOrdenesEmitidas();
      renderRecepciones();
      return;
    }
  }

  // Verificar que no estÃ© ya recibida
  if (recepciones.some(r => r.nroOrden === ordenEnRecepcion.nro)) {
    showToast('Esta orden ya fue recibida', true);
    cerrarModalRec();
    renderOrdenesEmitidas();
    return;
  }

  // Obtener siguiente nÃºmero de recepciÃ³n desde Firebase
  let nroRec;
  if (window.fbListo) {
    try {
      const todasRec = await fbCargar('recepciones');
      let maxRec = 0;
      todasRec.forEach(r => {
        if (r.nro) {
          const num = parseInt(r.nro.replace('REC-', ''));
          if (!isNaN(num) && num > maxRec) maxRec = num;
        }
      });
      nroRec = 'REC-' + String(maxRec + 1).padStart(4, '0');
      contadorRec = maxRec + 2;
      localStorage.setItem('contadorRecepciones', contadorRec);
    } catch(e) {
      nroRec = 'REC-' + String(contadorRec).padStart(4, '0');
      contadorRec++;
      localStorage.setItem('contadorRecepciones', contadorRec);
    }
  } else {
    nroRec = 'REC-' + String(contadorRec).padStart(4, '0');
    contadorRec++;
    localStorage.setItem('contadorRecepciones', contadorRec);
  }

  const recepcion = {
    nro:         nroRec,
    nroOrden:    ordenEnRecepcion.nro,
    fecha:       fechaHoraLocal(),
    solicitante: ordenEnRecepcion.solicitante,
    recibidoPor,
    productos:   ordenEnRecepcion.productos,
    total:       ordenEnRecepcion.total
  };

  // Guardar en Firebase primero y esperar confirmaciÃ³n
  if (window.fbListo) {
    try {
      await fbGuardar('recepciones', recepcion.nro, recepcion);
    } catch(e) {
      showToast('Error al guardar recepciÃ³n. Intenta de nuevo.', true);
      return;
    }
  }

  if (!recepciones.some(r => r.nro === recepcion.nro)) {
    recepciones.unshift(recepcion);
  }
  localStorage.setItem('recepcionesBodega', JSON.stringify(recepciones));

  cerrarModalRec();
  renderOrdenesEmitidas();
  renderRecepciones();
  buscarOrdenAntigua();
  showToast(`âœ” RecepciÃ³n ${recepcion.nro} confirmada`);
  registrarActividad('RecepciÃ³n confirmada', `${recepcion.nro} â€” Orden ${recepcion.nroOrden} â€” Recibido por: ${recepcion.recibidoPor}`);
}

function verRecepcion(i) {
  const r = recepciones[i];
  // Setear ordenImpresion con los datos de la recepciÃ³n para poder imprimir
  ordenImpresion = {
    nro: r.nroOrden,
    fecha: r.fecha,
    tipoDocumento: '',
    nroDocumento: '',
    solicitante: r.solicitante || r.Cliente || '',
    observaciones: r.observaciones || '',
    productos: r.productos || [],
    _esRecepcion: true,
    _nroRecepcion: r.nro,
    _recibidoPor: r.recibidoPor
  };
  // Buscar datos originales de la orden
  const ordenOriginal = historial.find(s => s.nro === r.nroOrden);
  if (ordenOriginal) {
    ordenImpresion.tipoDocumento = ordenOriginal.tipoDocumento || '';
    ordenImpresion.nroDocumento = ordenOriginal.nroDocumento || '';
    ordenImpresion.solicitante = ordenOriginal.solicitante || r.solicitante || '';
    ordenImpresion.observaciones = ordenOriginal.observaciones || '';
  }
  document.getElementById('modalTitulo').textContent = `RecepciÃ³n ${r.nro}`;
  document.getElementById('modalBody').innerHTML = `
    <div class="detail-row"><strong>NÂ° RecepciÃ³n:</strong> ${r.nro}</div>
    <div class="detail-row"><strong>NÂ° Orden:</strong> ${r.nroOrden}</div>
    <div class="detail-row"><strong>Fecha RecepciÃ³n:</strong> ${formatFecha(r.fecha)}</div>
    <div class="detail-row"><strong>Tipo Documento:</strong> ${ordenOriginal ? ordenOriginal.tipoDocumento || '-' : '-'}</div>
    <div class="detail-row"><strong>NÂ° Documento:</strong> ${ordenOriginal ? ordenOriginal.nroDocumento || '-' : '-'}</div>
    <div class="detail-row"><strong>Cliente:</strong> ${r.solicitante || r.Cliente || '-'}</div>
    <div class="detail-row"><strong>Recibido por:</strong> ${r.recibidoPor}</div>
    ${ordenOriginal && ordenOriginal.creadoPor ? `<div class="detail-row"><strong>Orden creada por:</strong> ${ordenOriginal.creadoPor} (${ordenOriginal.rolCreador || '-'})</div>` : ''}
    ${r.observaciones ? `<div class="detail-row"><strong>Observaciones:</strong> ${r.observaciones}</div>` : ''}
    <table style="margin-top:14px">
      <thead><tr><th>#</th><th>CÃ³digo</th><th>DescripciÃ³n</th><th>Unidad</th><th>Cantidad</th></tr></thead>
      <tbody>
        ${r.productos.map((p, j) => `
          <tr>
            <td>${j+1}</td><td>${p.codigo||'-'}</td><td>${p.descripcion}</td>
            <td>${p.unidad}</td><td>${p.cantidad}</td>
          </tr>`).join('')}
      </tbody>
    </table>`;
  document.getElementById('modalOverlay').style.display = 'flex';
}

function eliminarRecepcion(i) {
  if (!confirm(`Â¿Eliminar la recepciÃ³n ${recepciones[i].nro}?`)) return;
  recepciones.splice(i, 1);
  localStorage.setItem('recepcionesBodega', JSON.stringify(recepciones));
  renderRecepciones();
  renderOrdenesEmitidas();
  showToast('RecepciÃ³n eliminada');
}

// Filtros recepciones
document.getElementById('recBtnFiltrar').addEventListener('click', () => {
  renderOrdenesEmitidas(document.getElementById('recFiltro').value.trim());
});
document.getElementById('recBtnMostrarTodas').addEventListener('click', () => {
  document.getElementById('recFiltro').value = '';
  renderOrdenesEmitidas();
});
document.getElementById('recFiltro').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') renderOrdenesEmitidas(document.getElementById('recFiltro').value.trim());
});

document.getElementById('btnBuscarRecepcion').addEventListener('click', () => {
  renderRecepciones(document.getElementById('buscarRecepcion').value.trim());
});
document.getElementById('btnLimpiarRecepcion').addEventListener('click', () => {
  document.getElementById('buscarRecepcion').value = '';
  renderRecepciones();
});
document.getElementById('buscarRecepcion').addEventListener('keydown', e => {
  if (e.key === 'Enter') renderRecepciones(document.getElementById('buscarRecepcion').value.trim());
});

// Cerrar modal recepciÃ³n al click fuera
document.getElementById('modalRecepcion').addEventListener('click', (e) => {
  if (e.target === document.getElementById('modalRecepcion')) cerrarModalRec();
});

// â”€â”€ NÃºmero a palabras (espaÃ±ol) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function numeroAPalabras(n) {
  if (n === 0) return 'cero';
  if (n < 0) return 'menos ' + numeroAPalabras(-n);

  // Manejar decimales: "1.5" â†’ "uno punto cinco"
  if (n !== Math.floor(n)) {
    const partes = n.toString().split('.');
    const entera = parseInt(partes[0]);
    const decimalStr = partes[1];
    // Convertir cada dÃ­gito decimal individualmente
    const digitosDecimal = ['cero','uno','dos','tres','cuatro','cinco','seis','siete','ocho','nueve'];
    let decimalPalabras;
    const decimalNum = parseInt(decimalStr);
    if (decimalStr.length <= 2 && decimalNum > 0 && decimalNum < 100) {
      // Intentar convertir como nÃºmero completo (ej: 25 â†’ "veinticinco")
      decimalPalabras = numeroAPalabras(decimalNum);
    } else {
      // DÃ­gito por dÃ­gito para decimales largos
      decimalPalabras = decimalStr.split('').map(d => digitosDecimal[parseInt(d)]).join(' ');
    }
    const enteraPalabras = entera === 0 ? 'cero' : numeroAPalabras(entera);
    return enteraPalabras + ' punto ' + decimalPalabras;
  }

  n = Math.floor(n);

  const unidades  = ['','uno','dos','tres','cuatro','cinco','seis','siete','ocho','nueve',
                     'diez','once','doce','trece','catorce','quince','diecisÃ©is','diecisiete',
                     'dieciocho','diecinueve'];
  const decenas   = ['','','veinte','treinta','cuarenta','cincuenta','sesenta','setenta','ochenta','noventa'];
  const centenas  = ['','ciento','doscientos','trescientos','cuatrocientos','quinientos',
                     'seiscientos','setecientos','ochocientos','novecientos'];

  if (n < 20) return unidades[n];
  if (n < 100) {
    const d = Math.floor(n / 10), u = n % 10;
    return u === 0 ? decenas[d] : (d === 2 ? 'veinti' + unidades[u] : decenas[d] + ' y ' + unidades[u]);
  }
  if (n === 100) return 'cien';
  if (n < 1000) {
    const c = Math.floor(n / 100), resto = n % 100;
    return centenas[c] + (resto ? ' ' + numeroAPalabras(resto) : '');
  }
  if (n < 2000) return 'mil' + (n % 1000 ? ' ' + numeroAPalabras(n % 1000) : '');
  if (n < 1000000) {
    const miles = Math.floor(n / 1000), resto = n % 1000;
    return numeroAPalabras(miles) + ' mil' + (resto ? ' ' + numeroAPalabras(resto) : '');
  }
  return n.toString();
}

// â”€â”€ Utilidades â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function fechaHoraLocal() {
  const now = new Date();
  const opciones = { timeZone: 'America/Santiago', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false };
  const partes = new Intl.DateTimeFormat('sv-SE', opciones).formatToParts(now);
  const get = (type) => partes.find(p => p.type === type).value;
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`;
}

function formatFecha(f) {
  if (!f) return '';
  // Soporta tanto "YYYY-MM-DD" como "YYYY-MM-DDTHH:MM"
  if (f.includes('T')) {
    const [fecha, hora] = f.split('T');
    const [y, m, d] = fecha.split('-');
    return `${d}/${m}/${y} ${hora}`;
  }
  const [y, m, d] = f.split('-');
  return `${d}/${m}/${y}`;
}

// â”€â”€ Log de Actividad â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

// â”€â”€ Log de Actividad (desactivado) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function registrarActividad() {}

// â”€â”€ Papelera de Reciclaje â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function renderPapelera() {
  const tbody = document.getElementById('tbodyPapelera');
  if (!tbody) return;
  const anuladas = historial.filter(s => s.anulada === true);
  if (anuladas.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="empty-msg">No hay Ã³rdenes en la papelera</td></tr>';
    return;
  }
  tbody.innerHTML = anuladas.map(s => {
    const idx = historial.indexOf(s);
    return `<tr>
      <td><strong>${s.nro}</strong></td>
      <td>${formatFecha(s.fecha)}</td>
      <td>${s.tipoDocumento || '-'}</td>
      <td>${s.solicitante || '-'}</td>
      <td>${s.creadoPor ? `${s.creadoPor} (${s.rolCreador || '-'})` : '-'}</td>
      <td>
        <button class="btn-ver" onclick="verOrdenAntigua('${s.nro}')">Ver</button>
        <button class="btn-add" style="padding:4px 10px;font-size:0.8rem;background:#16a34a" onclick="restaurarOrden(${idx})">â™» Restaurar</button>
        <button class="btn-delete" style="margin-left:4px" onclick="eliminarDefinitivo(${idx})" title="Eliminar definitivamente">âœ• Eliminar</button>
      </td>
    </tr>`;
  }).join('');
}

function restaurarOrden(i) {
  if (!confirm(`Â¿Restaurar la orden ${historial[i].nro}? VolverÃ¡ a aparecer como orden activa.`)) return;
  historial[i].anulada = false;
  localStorage.setItem('historialSalidas', JSON.stringify(historial));
  if (window.fbListo) fbGuardar('historial', historial[i].nro, historial[i]);
  registrarActividad('Orden restaurada', `${historial[i].nro}`);
  showToast(`âœ” Orden ${historial[i].nro} restaurada`);
  renderPapelera();
  renderReportes();
  buscarOrdenAntigua();
  renderOrdenesEmitidas();
}

function eliminarDefinitivo(i) {
  if (!confirm(`Â¿Eliminar DEFINITIVAMENTE la orden ${historial[i].nro}? Esta acciÃ³n no se puede deshacer.`)) return;
  if (!confirm('Â¿EstÃ¡s completamente seguro?')) return;
  const nro = historial[i].nro;
  historial.splice(i, 1);
  localStorage.setItem('historialSalidas', JSON.stringify(historial));
  if (window.fbListo) fbEliminar('historial', nro);
  registrarActividad('Orden eliminada definitivamente', nro);
  showToast(`Orden ${nro} eliminada definitivamente`);
  renderPapelera();
  renderReportes();
  buscarOrdenAntigua();
}

function showToast(msg, error = false) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast show' + (error ? ' error' : '');
  setTimeout(() => { t.className = 'toast'; }, 3000);
}

// â”€â”€ Mensaje del Admin â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function guardarMensajeAdmin() {
  const msg = document.getElementById('inputMensajeAdmin').value.trim();
  if (!msg) { showToast('Escribe un mensaje', true); return; }
  if (window.fbListo) {
    fbGuardar('config', 'mensajeAdmin', { texto: msg, fecha: fechaHoraLocal() });
    showToast('âœ” Mensaje enviado a todos los usuarios');
    document.getElementById('mensajeAdminActual').textContent = 'Mensaje actual: "' + msg + '"';
    document.getElementById('inputMensajeAdmin').value = '';
  }
}

function borrarMensajeAdmin() {
  if (window.fbListo) {
    fbGuardar('config', 'mensajeAdmin', { texto: '', fecha: '' });
    showToast('Mensaje borrado');
    document.getElementById('mensajeAdminActual').textContent = '';
    document.getElementById('inputMensajeAdmin').value = '';
  }
}

function mostrarMensajeAdmin() {
  if (!window.fbListo) return;
  fbCargar('config').then(datos => {
    const msg = datos.find(c => c.texto !== undefined);
    if (msg && msg.texto) {
      // Mostrar como alerta al usuario
      setTimeout(() => {
        showToast('ðŸ“¢ Admin: ' + msg.texto);
      }, 2000);
      // Mostrar en el campo si es admin
      const el = document.getElementById('mensajeAdminActual');
      if (el) el.textContent = 'Mensaje actual: "' + msg.texto + '"';
    }
  });
}

// â”€â”€ Notificaciones de escritorio â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function mostrarNotificacion(titulo, mensaje, nroOrden) {
  // Enviar al proceso principal para notificaciÃ³n persistente
  if (window.require) {
    const { ipcRenderer } = window.require('electron');
    ipcRenderer.send('mostrar-notificacion', { titulo, mensaje, nroOrden });
  }
  // TambiÃ©n mostrar toast en la app
  showToast(`${titulo}: ${mensaje}`);
}

// Listener para abrir orden desde notificaciÃ³n
if (window.require) {
  const { ipcRenderer } = window.require('electron');
  ipcRenderer.on('abrir-orden', (event, nroOrden) => {
    const idx = historial.findIndex(s => s.nro === nroOrden);
    if (idx !== -1) {
      // Ir a la pestaÃ±a de reportes y abrir el modal
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      document.querySelector('[data-tab="reportes"]').classList.add('active');
      document.getElementById('tab-reportes').classList.add('active');
      abrirModal(idx);
    }
  });
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// â”€â”€ CAJA / VENTAS DEL DÃA â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

let ventasCaja = JSON.parse(localStorage.getItem('ventasCaja') || '[]');
let retirosCaja = JSON.parse(localStorage.getItem('retirosCaja') || '[]');
let movimientosCaja = JSON.parse(localStorage.getItem('movimientosCaja') || '[]');
function obtenerFechaLocalChile() {
  const ahora = new Date();
  const offset = ahora.getTimezoneOffset();
  const local = new Date(ahora.getTime() - offset * 60000);
  return local.toISOString().slice(0, 10);
}
let cajaFechaActual = obtenerFechaLocalChile();

document.getElementById('btnRegistrarVenta').addEventListener('click', () => {
  const monto = parseInt(document.getElementById('cajaMonto').value);
  const metodo = document.getElementById('cajaMetodo').value;
  const tipoDoc = document.getElementById('cajaTipoDoc').value;
  const fechaInput = document.getElementById('cajaFechaRegistro').value;
  if (!monto || monto <= 0) { showToast('Ingresa un monto vÃ¡lido', true); return; }
  if (!metodo) { showToast('Selecciona un mÃ©todo de pago', true); return; }
  if (!tipoDoc) { showToast('Selecciona el tipo de documento', true); return; }

  const fechaVenta = fechaInput || obtenerFechaLocalChile();

  const venta = {
    id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
    fecha: fechaVenta,
    hora: new Date().toTimeString().slice(0, 5),
    monto: monto,
    metodo: metodo,
    tipoDoc: tipoDoc,
    usuario: usuarioActivo ? usuarioActivo.nombre : ''
  };

  ventasCaja.unshift(venta);
  localStorage.setItem('ventasCaja', JSON.stringify(ventasCaja));
  if (window.fbListo) fbGuardar('caja', venta.id, venta);

  document.getElementById('cajaMonto').value = '';
  document.getElementById('cajaMetodo').value = '';
  document.getElementById('cajaTipoDoc').value = '';
  renderCaja();
renderRetiros();
renderMovimientos();
actualizarSaldoCaja();
  showToast('âœ” Venta registrada');
});

document.getElementById('btnCajaFiltrar').addEventListener('click', () => {
  const fecha = document.getElementById('cajaFiltroFecha').value;
  if (!fecha) { showToast('Selecciona una fecha', true); return; }
  cajaFechaActual = fecha;
  renderCaja();
});

document.getElementById('btnCajaHoy').addEventListener('click', () => { renderRetiros(); actualizarSaldoCaja();
  cajaFechaActual = obtenerFechaLocalChile();
  document.getElementById('cajaFiltroFecha').value = '';
  renderCaja();
});

function renderCaja() {
  const tbody = document.getElementById('tbodyCaja');
  const ventasDia = ventasCaja.filter(v => v.fecha === cajaFechaActual);

  if (ventasDia.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="empty-msg">No hay ventas registradas</td></tr>';
  } else {
    tbody.innerHTML = ventasDia.map((v, i) => `
      <tr>
        <td>${i + 1}</td>
        <td>${v.hora}</td>
        <td>$${v.monto.toLocaleString()}</td>
        <td><span class="badge" style="background:${v.metodo==='Efectivo'?'#d1fae5':v.metodo==='DÃ©bito'?'#dbeafe':v.metodo==='CrÃ©dito'?'#fef3c7':'#e0e7ff'};color:#333;padding:3px 8px;border-radius:4px;font-size:0.8rem">${v.metodo}</span></td>
        <td style="font-size:0.8rem">${v.tipoDoc || '-'}</td>
        <td><button class="btn-add" style="padding:2px 6px;font-size:0.75rem;margin-right:4px" onclick="editarVentaCaja('${v.id}')">âœ</button><button class="btn-delete" onclick="eliminarVentaCaja('${v.id}')">âœ•</button></td>
      </tr>`).join('');
  }

  // EstadÃ­sticas
  const efectivo = ventasDia.filter(v => v.metodo === 'Efectivo').reduce((a, v) => a + v.monto, 0);
  const debito = ventasDia.filter(v => v.metodo === 'DÃ©bito').reduce((a, v) => a + v.monto, 0);
  const credito = ventasDia.filter(v => v.metodo === 'CrÃ©dito').reduce((a, v) => a + v.monto, 0);  const total = efectivo + debito + credito;
  const cEfectivo = ventasDia.filter(v => v.metodo === 'Efectivo').length;
  const cDebito = ventasDia.filter(v => v.metodo === 'DÃ©bito').length;
  const cCredito = ventasDia.filter(v => v.metodo === 'CrÃ©dito').length;
  document.getElementById('cajaEfectivo').innerHTML = '$' + efectivo.toLocaleString() + `<br><span style="font-size:0.7rem;opacity:0.7">${cEfectivo} venta${cEfectivo!==1?'s':''}</span>`;
  document.getElementById('cajaDebito').innerHTML = '$' + debito.toLocaleString() + `<br><span style="font-size:0.7rem;opacity:0.7">${cDebito} venta${cDebito!==1?'s':''}</span>`;
  document.getElementById('cajaCredito').innerHTML = '$' + credito.toLocaleString() + `<br><span style="font-size:0.7rem;opacity:0.7">${cCredito} venta${cCredito!==1?'s':''}</span>`;
  document.getElementById('cajaTotal').innerHTML = '$' + total.toLocaleString() + `<br><span style="font-size:0.7rem;opacity:0.7">${ventasDia.length} venta${ventasDia.length!==1?'s':''}</span>`;
}

function eliminarVentaCaja(id) {
  if (!confirm('Â¿Eliminar esta venta?')) return;
  const idx = ventasCaja.findIndex(v => v.id === id);
  if (idx !== -1) {
    ventasCaja.splice(idx, 1);
    localStorage.setItem('ventasCaja', JSON.stringify(ventasCaja));
    if (window.fbListo) fbEliminar('caja', id);
    renderCaja();
    showToast('âœ” Venta eliminada');
  }
}

function editarVentaCaja(id) {
  const idx = ventasCaja.findIndex(v => v.id === id);
  if (idx === -1) return;
  const v = ventasCaja[idx];
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.style.display = 'flex';
  overlay.innerHTML = `
    <div class="modal" style="max-width:380px">
      <div class="modal-header"><h3>âœ Editar Venta</h3><button class="modal-close" onclick="this.closest('.modal-overlay').remove()">âœ•</button></div>
      <div class="modal-body" style="padding:16px">
        <div class="field"><label>Monto ($)</label><input type="number" id="editVentaMonto" value="${v.monto}" min="1" /></div>
        <div class="field" style="margin-top:10px"><label>MÃ©todo de Pago</label>
          <select id="editVentaMetodo">
            <option value="Efectivo" ${v.metodo==='Efectivo'?'selected':''}>Efectivo</option>
            <option value="DÃ©bito" ${v.metodo==='DÃ©bito'?'selected':''}>DÃ©bito</option>
            <option value="CrÃ©dito" ${v.metodo==='CrÃ©dito'?'selected':''}>CrÃ©dito</option>
            <option value="Transferencia" ${v.metodo==='Transferencia'?'selected':''}>Transferencia</option>
          </select>
        </div>
        <div class="field" style="margin-top:10px"><label>Tipo Documento</label>
          <select id="editVentaTipoDoc">
            <option value="Boleta" ${v.tipoDoc==='Boleta'?'selected':''}>Boleta</option>
            <option value="Factura" ${v.tipoDoc==='Factura'?'selected':''}>Factura</option>
            
          </select>
        </div>
        <div class="field" style="margin-top:10px"><label>Fecha</label><input type="date" id="editVentaFecha" value="${v.fecha}" /></div>
      </div>
      <div class="modal-footer">
        <button class="btn-secondary" onclick="this.closest('.modal-overlay').remove()">Cancelar</button>
        <button class="btn-primary" id="btnGuardarEditVenta">âœ” Guardar</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.querySelector('#btnGuardarEditVenta').addEventListener('click', () => {
    const nuevoMonto = parseInt(document.getElementById('editVentaMonto').value);
    const nuevoMetodo = document.getElementById('editVentaMetodo').value;
    const nuevoTipoDoc = document.getElementById('editVentaTipoDoc').value;
    const nuevaFecha = document.getElementById('editVentaFecha').value;
    if (!nuevoMonto || nuevoMonto <= 0) { showToast('Monto invÃ¡lido', true); return; }
    ventasCaja[idx].monto = nuevoMonto;
    ventasCaja[idx].metodo = nuevoMetodo;
    ventasCaja[idx].tipoDoc = nuevoTipoDoc;
    ventasCaja[idx].fecha = nuevaFecha || v.fecha;
    localStorage.setItem('ventasCaja', JSON.stringify(ventasCaja));
    if (window.fbListo) fbGuardar('caja', v.id, ventasCaja[idx]);
    overlay.remove();
    renderCaja();
    showToast('âœ” Venta actualizada');
  });
}

// â”€â”€ Retiros de Caja â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function generarPDFRetiro(retiro) {
  // Generar nÃºmero correlativo basado en total histÃ³rico de retiros
  const nroComprobante = String(retirosCaja.length).padStart(4, '0');

  const montoEnPalabras = convertirMontoAPalabras(retiro.monto);

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
    @page { size: letter; margin: 15mm; }
    * { font-family: 'Times New Roman', serif; margin: 0; padding: 0; box-sizing: border-box; }
    body { padding: 20px 40px; color: #000; line-height: 1.5; }
    .encabezado { text-align: center; border-bottom: 3px double #000; padding-bottom: 10px; margin-bottom: 14px; }
    .encabezado h1 { font-size: 24px; font-weight: bold; letter-spacing: 2px; text-transform: uppercase; }
    .encabezado p { font-size: 13px; color: #444; margin-top: 2px; }
    .titulo-doc { text-align: center; margin: 14px 0; }
    .titulo-doc h2 { font-size: 18px; text-transform: uppercase; letter-spacing: 1px; border: 2px solid #000; display: inline-block; padding: 6px 24px; }
    .nro-comprobante { text-align: right; font-size: 14px; margin-bottom: 10px; }
    .nro-comprobante span { font-weight: bold; font-size: 16px; }
    .datos-tabla { width: 100%; border-collapse: collapse; margin: 20px 0; }
    .datos-tabla td { padding: 8px 12px; border: 1px solid #000; font-size: 14px; }
    .datos-tabla td.label { background: #f5f5f5; font-weight: bold; width: 35%; }
    .monto-grande { text-align: center; margin: 16px 0; padding: 14px; border: 2px solid #000; }
    .monto-grande .cifra { font-size: 30px; font-weight: bold; }
    .monto-grande .palabras { font-size: 13px; font-style: italic; margin-top: 4px; color: #333; }
    .declaracion { margin: 16px 0; font-size: 13px; text-align: justify; padding: 12px; border: 1px solid #ccc; background: #fafafa; }
    .firmas { display: flex; justify-content: space-between; margin-top: 40px; padding: 0 20px; }
    .firma-box { text-align: center; width: 40%; }
    .firma-linea { border-top: 1px solid #000; padding-top: 6px; margin-top: 40px; }
    .firma-nombre { font-size: 14px; font-weight: bold; }
    .firma-cargo { font-size: 12px; color: #555; }
    .pie { margin-top: 30px; text-align: center; font-size: 10px; color: #888; border-top: 1px solid #ccc; padding-top: 8px; }
    .fecha-lugar { display: flex; justify-content: space-between; font-size: 13px; margin-bottom: 10px; }
  </style></head><body>

    <div class="encabezado">
      <h1>Bodega A&amp;M</h1>
      <p>Comercializadora de Productos</p>
    </div>

    <div class="titulo-doc">
      <h2>Comprobante de Egreso de Caja</h2>
    </div>

    <div class="nro-comprobante">
      NÂ° Comprobante: <span>${nroComprobante}</span>
    </div>

    <div class="fecha-lugar">
      <span>Fecha: ${retiro.fecha.split('-').reverse().join('/')}</span>
      <span>Hora: ${retiro.hora}</span>
    </div>

    <table class="datos-tabla">
      <tr><td class="label">Monto</td><td>$ ${retiro.monto.toLocaleString()}.-</td></tr>
      <tr><td class="label">Monto en palabras</td><td>${montoEnPalabras}</td></tr>
      <tr><td class="label">Beneficiario</td><td>${retiro.destinatario}</td></tr>
      <tr><td class="label">Entregado por</td><td>${retiro.quienRetira || 'Jose Lee'}</td></tr>
      <tr><td class="label">Concepto</td><td>${retiro.nota || 'Retiro de caja'}</td></tr>
    </table>

    <div class="monto-grande">
      <div class="cifra">$ ${retiro.monto.toLocaleString()}.-</div>
      <div class="palabras">(${montoEnPalabras})</div>
    </div>

    <div class="declaracion">
      Declaro haber recibido de parte de <strong>${retiro.quienRetira || 'Jose Lee'}</strong>, en representaciÃ³n de Bodega A&amp;M, la suma de <strong>$ ${retiro.monto.toLocaleString()}.-</strong> (${montoEnPalabras}), correspondiente a: <strong>${retiro.nota || 'retiro de caja'}</strong>. El presente comprobante se extiende como constancia de la entrega y recepciÃ³n conforme del monto indicado.
    </div>

    <div class="firmas">
      <div class="firma-box">
        <div class="firma-linea">
          <div class="firma-nombre">${retiro.quienRetira || 'Jose Lee'}</div>
          <div class="firma-cargo">Entrega</div>
        </div>
      </div>
      <div class="firma-box">
        <div class="firma-linea">
          <div class="firma-nombre">${retiro.destinatario}</div>
          <div class="firma-cargo">Recibe Conforme</div>
        </div>
      </div>
    </div>

    <div class="pie">
      Documento interno â€” Bodega A&amp;M â€” Comprobante generado el ${new Date().toLocaleDateString('es-CL')} a las ${new Date().toTimeString().slice(0,5)}<br>
      Este documento no tiene valor tributario. Solo para control interno.
    </div>

  </body></html>`;

  if (window.require) {
    const { ipcRenderer } = window.require('electron');
    ipcRenderer.send('vistaPreviewPDF', html);
  }
}

// Convertir monto a palabras
function convertirMontoAPalabras(monto) {
  const unidades = ['', 'un', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve'];
  const decenas = ['', 'diez', 'veinte', 'treinta', 'cuarenta', 'cincuenta', 'sesenta', 'setenta', 'ochenta', 'noventa'];
  const especiales = ['diez', 'once', 'doce', 'trece', 'catorce', 'quince', 'diecisÃ©is', 'diecisiete', 'dieciocho', 'diecinueve'];
  const centenas = ['', 'ciento', 'doscientos', 'trescientos', 'cuatrocientos', 'quinientos', 'seiscientos', 'setecientos', 'ochocientos', 'novecientos'];

  if (monto === 0) return 'cero pesos';
  if (monto === 100) return 'cien pesos';

  let resultado = '';

  if (monto >= 1000000) {
    const millones = Math.floor(monto / 1000000);
    resultado += (millones === 1 ? 'un millÃ³n ' : convertirGrupo(millones, unidades, decenas, especiales, centenas) + ' millones ');
    monto %= 1000000;
  }

  if (monto >= 1000) {
    const miles = Math.floor(monto / 1000);
    resultado += (miles === 1 ? 'mil ' : convertirGrupo(miles, unidades, decenas, especiales, centenas) + ' mil ');
    monto %= 1000;
  }

  if (monto > 0) {
    resultado += convertirGrupo(monto, unidades, decenas, especiales, centenas);
  }

  return resultado.trim() + ' pesos';
}

function convertirGrupo(n, unidades, decenas, especiales, centenas) {
  if (n === 0) return '';
  if (n === 100) return 'cien';
  let r = '';
  if (n >= 100) { r += centenas[Math.floor(n / 100)] + ' '; n %= 100; }
  if (n >= 10 && n < 20) { r += especiales[n - 10]; return r.trim(); }
  if (n >= 20) {
    r += decenas[Math.floor(n / 10)];
    if (n % 10 !== 0) r += ' y ' + unidades[n % 10];
    return r.trim();
  }
  if (n > 0) r += unidades[n];
  return r.trim();
}

function registrarRetiro() {
  const monto = parseInt(document.getElementById('retiroMonto').value);
  const destinatario = document.getElementById('retiroDestinatario').value;
  const nota = document.getElementById('retiroNota').value.trim();

  if (!monto || monto <= 0) { showToast('Ingresa un monto vÃ¡lido', true); return; }
  if (!destinatario) { showToast('Selecciona a quiÃ©n se entrega', true); return; }

  const ahora = new Date();
  const retiro = {
    id: Date.now().toString(36),
    monto: monto,
    destinatario: destinatario,
    nota: nota,
    fecha: ahora.toISOString().slice(0, 10),
    hora: ahora.toTimeString().slice(0, 5),
    operador: usuarioActivo ? usuarioActivo.nombre : 'Sistema'
  };

  retirosCaja.unshift(retiro);
  localStorage.setItem('retirosCaja', JSON.stringify(retirosCaja));

  // Sync to Firebase
  if (window.fbGuardar) {
    fbGuardar('retirosCaja', retiro.id, retiro).catch(() => {});
  }

  document.getElementById('retiroMonto').value = '';
  document.getElementById('retiroDestinatario').value = '';
  document.getElementById('retiroNota').value = '';
  document.getElementById('retiroQuienRetira').value = '';

  renderRetiros();
  actualizarSaldoCaja();
  showToast('âœ” Retiro de $' + monto.toLocaleString() + ' registrado');
  generarPDFRetiro(retiro);
  registrarActividad('Retiro de Caja', 'Retiro de $' + monto.toLocaleString() + ' a ' + destinatario);
}

function eliminarRetiro(id) {
  if (!confirm('Â¿Eliminar este retiro?')) return;
  retirosCaja = retirosCaja.filter(r => r.id !== id);
  localStorage.setItem('retirosCaja', JSON.stringify(retirosCaja));
  if (window.fbEliminar) fbEliminar('retirosCaja', id).catch(() => {});
  renderRetiros();
  actualizarSaldoCaja();
  showToast('Retiro eliminado');
}

function editarRetiro(id) {
  const r = retirosCaja.find(x => x.id === id);
  if (!r) return;

  const modalHtml = `
    <div id="modalEditRetiro" style="position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:9999">
      <div style="background:white;border-radius:12px;padding:24px;width:400px;max-width:90%">
        <h3 style="margin-bottom:16px">âœï¸ Editar Retiro</h3>
        <div class="field"><label>Monto ($)</label><input type="number" id="editRetiroMonto" value="${r.monto}" min="1" /></div>
        <div class="field" style="margin-top:10px"><label>Fecha</label><input type="date" id="editRetiroFecha" value="${r.fecha}" /></div>
        <div class="field" style="margin-top:10px"><label>Hora</label><input type="time" id="editRetiroHora" value="${r.hora}" /></div>
        <div class="field" style="margin-top:10px"><label>Entregar a</label>
          <select id="editRetiroDestinatario">
            <option value="Gloria Almonacid" ${r.destinatario==='Gloria Almonacid'?'selected':''}>Gloria Almonacid</option>
            <option value="Pedro Almonacid" ${r.destinatario==='Pedro Almonacid'?'selected':''}>Pedro Almonacid</option>
          </select>
        </div>
        <div class="field" style="margin-top:10px"><label>Quien retira</label>
          <select id="editRetiroQuienRetira">
            <option value="Jose Lee" ${r.quienRetira==='Jose Lee'?'selected':''}>Jose Lee</option>
          </select>
        </div>
        <div class="field" style="margin-top:10px"><label>Nota</label><input type="text" id="editRetiroNota" value="${r.nota || ''}" /></div>
        <div style="display:flex;gap:10px;margin-top:16px;justify-content:flex-end">
          <button class="btn-secondary" onclick="document.getElementById('modalEditRetiro').remove()">Cancelar</button>
          <button class="btn-primary" onclick="guardarEdicionRetiro('${r.id}')">Guardar</button>
        </div>
      </div>
    </div>`;

  document.body.insertAdjacentHTML('beforeend', modalHtml);
}

function guardarEdicionRetiro(id) {
  const monto = parseInt(document.getElementById('editRetiroMonto').value);
  const destinatario = document.getElementById('editRetiroDestinatario').value;
  const nota = document.getElementById('editRetiroNota').value.trim();
  const quienRetira = document.getElementById('editRetiroQuienRetira').value;
  const fecha = document.getElementById('editRetiroFecha').value;
  const hora = document.getElementById('editRetiroHora').value;

  if (!monto || monto <= 0) { showToast('Monto invÃ¡lido', true); return; }
  if (!destinatario) { showToast('Selecciona destinatario', true); return; }

  const idx = retirosCaja.findIndex(r => r.id === id);
  if (idx === -1) return;

  retirosCaja[idx].monto = monto;
  retirosCaja[idx].destinatario = destinatario;
  retirosCaja[idx].nota = nota;
  retirosCaja[idx].quienRetira = quienRetira;
  if (fecha) retirosCaja[idx].fecha = fecha;
  if (hora) retirosCaja[idx].hora = hora;

  localStorage.setItem('retirosCaja', JSON.stringify(retirosCaja));
  if (window.fbGuardar) fbGuardar('retirosCaja', id, retirosCaja[idx]).catch(() => {});

  document.getElementById('modalEditRetiro').remove();
  renderRetiros();
  renderHistRetiros('todos');
  actualizarSaldoCaja();
  showToast('âœ” Retiro actualizado');
}

function renderRetiros() {
  const hoy = document.getElementById('cajaFiltroFecha') ? document.getElementById('cajaFiltroFecha').value || new Date().toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10);
  const retirosHoy = retirosCaja.filter(r => r.fecha === hoy);
  const tbody = document.getElementById('tbodyRetiros');
  if (!tbody) return;

  if (retirosHoy.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" class="empty-msg">No hay retiros registrados hoy</td></tr>';
    return;
  }

  tbody.innerHTML = retirosHoy.map((r, i) => `<tr>
    <td>${i + 1}</td>
    <td>${r.fecha.split('-').reverse().join('/')}</td>
    <td>${r.hora}</td>
    <td style="color:#c81e1e;font-weight:bold">-$${r.monto.toLocaleString()}</td>
    <td>${r.destinatario}</td>
    <td>${r.operador}</td>
    <td>${r.nota || '-'}</td>
    <td><button class="btn-add" style="padding:2px 8px;font-size:0.75rem;margin-right:4px" onclick="generarPDFRetiro(retirosCaja.find(x=>x.id==='${r.id}'))">ðŸ–¨</button><button class="btn-secondary" style="padding:2px 8px;font-size:0.75rem;margin-right:4px" onclick="editarRetiro('${r.id}')">âœ</button><button class="btn-delete" onclick="eliminarRetiro('${r.id}')" title="Eliminar">ðŸ—‘</button></td>
  </tr>`).join('');
}

function actualizarSaldoCaja() {
  const hoy = document.getElementById('cajaFiltroFecha') ? document.getElementById('cajaFiltroFecha').value || new Date().toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10);
  const ventasHoy = ventasCaja.filter(v => v.fecha === hoy);
  const retirosHoy = retirosCaja.filter(r => r.fecha === hoy);

  const totalVentas = ventasHoy.reduce((a, v) => a + v.monto, 0);
  const totalRetiros = retirosHoy.reduce((a, r) => a + r.monto, 0);
  const saldo = totalVentas - totalRetiros;

  const elSaldo = document.getElementById('cajaSaldo');
  const elVentas = document.getElementById('cajaSaldoVentas');
  const elRetiros = document.getElementById('cajaSaldoRetiros');

  if (elSaldo) {
    elSaldo.textContent = '$' + saldo.toLocaleString();
    elSaldo.style.color = saldo >= 0 ? '#065f46' : '#c81e1e';
  }
  if (elVentas) elVentas.textContent = '$' + totalVentas.toLocaleString();
  if (elRetiros) elRetiros.textContent = '$' + totalRetiros.toLocaleString();
}

document.getElementById('btnRegistrarRetiro').addEventListener('click', registrarRetiro);


// Exportar Caja a Excel
document.getElementById('btnCajaExcel').addEventListener('click', () => {
  const ventasDia = ventasCaja.filter(v => v.fecha === cajaFechaActual);
  if (ventasDia.length === 0) { showToast('No hay ventas para exportar', true); return; }
  let csv = '\uFEFF#;Hora;Monto;MÃ©todo\n';
  ventasDia.forEach((v, i) => { csv += `${i+1};${v.hora};${v.monto};${v.metodo}\n`; });
  const efectivo = ventasDia.filter(v => v.metodo === 'Efectivo').reduce((a, v) => a + v.monto, 0);
  const debito = ventasDia.filter(v => v.metodo === 'DÃ©bito').reduce((a, v) => a + v.monto, 0);
  const credito = ventasDia.filter(v => v.metodo === 'CrÃ©dito').reduce((a, v) => a + v.monto, 0);
  csv += `\n;TOTALES;;\n;Efectivo;${efectivo};\n;DÃ©bito;${debito};\n;CrÃ©dito;${credito};\n;Transferencia;${transferencia};\n;TOTAL;${efectivo+debito+credito+transferencia};\n`;
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Caja_${cajaFechaActual}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('âœ” Excel descargado');
});

// Exportar Caja a PDF
document.getElementById('btnCajaPDF').addEventListener('click', () => {
  const ventasDia = ventasCaja.filter(v => v.fecha === cajaFechaActual);
  if (ventasDia.length === 0) { showToast('No hay ventas para exportar', true); return; }
  const efectivo = ventasDia.filter(v => v.metodo === 'Efectivo').reduce((a, v) => a + v.monto, 0);
  const debito = ventasDia.filter(v => v.metodo === 'DÃ©bito').reduce((a, v) => a + v.monto, 0);
  const credito = ventasDia.filter(v => v.metodo === 'CrÃ©dito').reduce((a, v) => a + v.monto, 0);
  const total = efectivo + debito + credito ;
  const filas = ventasDia.map((v, i) => `<tr><td>${i+1}</td><td>${v.hora}</td><td>$${v.monto.toLocaleString()}</td><td>${v.metodo}</td></tr>`).join('');
  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
    body{font-family:Arial,sans-serif;padding:30px;color:#333}
    h1{text-align:center;color:#1a56db}
    table{width:100%;border-collapse:collapse;margin-top:16px}
    th{background:#1a56db;color:white;padding:8px;text-align:left}
    td{padding:8px;border-bottom:1px solid #eee}
    .totales{margin-top:20px;font-size:1.1rem}
    .totales div{margin:4px 0}
    .total-final{font-size:1.3rem;font-weight:bold;color:#1a56db;margin-top:12px}
  </style></head><body>
    <h1>ðŸ’° Caja â€” ${cajaFechaActual.split('-').reverse().join('/')}</h1>
    <table><thead><tr><th>#</th><th>Hora</th><th>Monto</th><th>MÃ©todo</th></tr></thead><tbody>${filas}</tbody></table>
    <div class="totales">
      <div>Efectivo: $${efectivo.toLocaleString()}</div>
      <div>DÃ©bito: $${debito.toLocaleString()}</div>
      <div>CrÃ©dito: $${credito.toLocaleString()}</div>
      <div class="total-final">TOTAL: $${total.toLocaleString()}</div>
    </div>
    <p style="text-align:center;margin-top:30px;font-size:0.8rem;color:#888">Bodega A&M â€” ${new Date().toLocaleDateString('es-CL')}</p>
  </body></html>`;
  if (window.require) {
    const { ipcRenderer } = window.require('electron');
    ipcRenderer.send('vistaPreviewPDF', html);
  }
});

// Resumen mensual de caja
document.getElementById('btnCajaMes').addEventListener('click', () => {
  const mes = document.getElementById('cajaMesFiltro').value;
  if (!mes) { showToast('Selecciona un mes', true); return; }
  renderCajaMes(mes);
});

function renderCajaMes(mes) {
  const ventasMes = ventasCaja.filter(v => v.fecha && v.fecha.slice(0, 7) === mes);
  const efectivo = ventasMes.filter(v => v.metodo === 'Efectivo').reduce((a, v) => a + v.monto, 0);
  const debito = ventasMes.filter(v => v.metodo === 'DÃ©bito').reduce((a, v) => a + v.monto, 0);
  const credito = ventasMes.filter(v => v.metodo === 'CrÃ©dito').reduce((a, v) => a + v.monto, 0);
  const total = efectivo + debito + credito ;
  const cEfectivo = ventasMes.filter(v => v.metodo === 'Efectivo').length;
  const cDebito = ventasMes.filter(v => v.metodo === 'DÃ©bito').length;
  const cCredito = ventasMes.filter(v => v.metodo === 'CrÃ©dito').length;
  const totalVentas = ventasMes.length;
  const pctEfectivo = totalVentas > 0 ? Math.round((cEfectivo / totalVentas) * 100) : 0;
  const pctDebito = totalVentas > 0 ? Math.round((cDebito / totalVentas) * 100) : 0;
  const pctCredito = totalVentas > 0 ? Math.round((cCredito / totalVentas) * 100) : 0;

  document.getElementById('cajaMesEfectivo').innerHTML = '$' + efectivo.toLocaleString() + `<br><span style="font-size:0.7rem;opacity:0.7">${cEfectivo} venta${cEfectivo!==1?'s':''} (${pctEfectivo}%)</span>`;
  document.getElementById('cajaMesDebito').innerHTML = '$' + debito.toLocaleString() + `<br><span style="font-size:0.7rem;opacity:0.7">${cDebito} venta${cDebito!==1?'s':''} (${pctDebito}%)</span>`;
  document.getElementById('cajaMesCredito').innerHTML = '$' + credito.toLocaleString() + `<br><span style="font-size:0.7rem;opacity:0.7">${cCredito} venta${cCredito!==1?'s':''} (${pctCredito}%)</span>`;
  document.getElementById('cajaMesTotal').innerHTML = '$' + total.toLocaleString() + `<br><span style="font-size:0.7rem;opacity:0.7">${totalVentas} venta${totalVentas!==1?'s':''} total</span>`;

  // EstadÃ­sticas extra
  // Venta mÃ¡s alta
  const ventaAlta = ventasMes.length > 0 ? Math.max(...ventasMes.map(v => v.monto)) : 0;
  document.getElementById('cajaMesVentaAlta').textContent = '$' + ventaAlta.toLocaleString();

  // Mejor dÃ­a (mÃ¡s ingresos)
  const porDia = {};
  ventasMes.forEach(v => { porDia[v.fecha] = (porDia[v.fecha] || 0) + v.monto; });
  let mejorDia = 'â€”';
  let maxDia = 0;
  Object.entries(porDia).forEach(([dia, monto]) => {
    if (monto > maxDia) { maxDia = monto; mejorDia = dia.slice(8,10) + '/' + dia.slice(5,7) + ' ($' + monto.toLocaleString() + ')'; }
  });
  document.getElementById('cajaMesMejorDia').textContent = mejorDia;

  // Promedio diario
  const diasConVentas = Object.keys(porDia).length;
  const promDiario = diasConVentas > 0 ? Math.round(total / diasConVentas) : 0;
  document.getElementById('cajaMesPromDiario').textContent = '$' + promDiario.toLocaleString();

  // DÃ­as trabajados
  document.getElementById('cajaMesDiasTrabajados').textContent = diasConVentas + ' dÃ­as';

  // MÃ©todo mÃ¡s usado
  const metodos = { Efectivo: cEfectivo, 'DÃ©bito': cDebito, 'CrÃ©dito': cCredito };
  let metodoTop = 'â€”';
  let maxMetodo = 0;
  Object.entries(metodos).forEach(([m, c]) => {
    if (c > maxMetodo) { maxMetodo = c; metodoTop = m + ' (' + (totalVentas > 0 ? Math.round((c/totalVentas)*100) : 0) + '%)'; }
  });
  document.getElementById('cajaMesMetodoTop').textContent = metodoTop;
}

// Sincronizar caja desde Firebase
function cargarCajaDesdeFirebase() {
  if (!window.fbListo) return;
  fbCargar('caja').then(datos => {
    if (datos.length > 0) {
      ventasCaja = datos.sort((a, b) => (b.fecha + b.hora).localeCompare(a.fecha + a.hora));
      localStorage.setItem('ventasCaja', JSON.stringify(ventasCaja));
      renderCaja();
    }
  });
}

renderCaja();

// â”€â”€ Historial de Retiros â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function renderHistRetiros(filtro) {
  let datos = retirosCaja;
  if (filtro === 'mes') {
    const mes = document.getElementById('histRetirosMes').value;
    if (!mes) { showToast('Selecciona un mes', true); return; }
    datos = retirosCaja.filter(r => r.fecha && r.fecha.slice(0, 7) === mes);
  }

  // Sort by date descending
  datos = [...datos].sort((a, b) => (b.fecha + b.hora).localeCompare(a.fecha + a.hora));

  const tbody = document.getElementById('tbodyHistRetiros');
  const totalMonto = datos.reduce((a, r) => a + r.monto, 0);

  document.getElementById('histRetirosMonto').textContent = '$' + totalMonto.toLocaleString();
  document.getElementById('histRetirosCant').textContent = datos.length;

  if (datos.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" class="empty-msg">No hay retiros en este perÃ­odo</td></tr>';
    return;
  }

  tbody.innerHTML = datos.map((r, i) => `<tr>
    <td>${i + 1}</td>
    <td>${r.fecha.split('-').reverse().join('/')}</td>
    <td>${r.hora}</td>
    <td style="color:#c81e1e;font-weight:bold">-$${r.monto.toLocaleString()}</td>
    <td>${r.destinatario}</td>
    <td>${r.quienRetira || '-'}</td>
    <td>${r.nota || '-'}</td>
    <td><button class="btn-secondary" style="padding:2px 8px;font-size:0.75rem;margin-right:4px" onclick="editarRetiro('${r.id}')">âœ</button><button class="btn-add" style="padding:2px 8px;font-size:0.75rem" onclick="generarPDFRetiro(retirosCaja.find(x=>x.id==='${r.id}'))">ðŸ–¨</button></td>
  </tr>`).join('');
}

document.getElementById('btnHistRetiros').addEventListener('click', () => renderHistRetiros('mes'));
document.getElementById('btnHistRetirosTodos').addEventListener('click', () => renderHistRetiros('todos'));

// Set default month
(function() {
  const el = document.getElementById('histRetirosMes');
  if (el) el.value = new Date().toISOString().slice(0, 7);
})();

// â”€â”€ Ingresos y Egresos â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function registrarMovimiento() {
  const tipo = document.getElementById('movTipo').value;
  const monto = parseInt(document.getElementById('movMonto').value);
  const motivo = document.getElementById('movMotivo').value.trim();
  const quien = document.getElementById('movQuien').value.trim();
  const fechaInput = document.getElementById('movFecha').value;

  if (!monto || monto <= 0) { showToast('Ingresa un monto vÃ¡lido', true); return; }
  if (!motivo) { showToast('Ingresa un motivo', true); return; }
  if (!quien) { showToast('Ingresa quiÃ©n realiza el movimiento', true); return; }

  const ahora = new Date();
  const mov = {
    id: Date.now().toString(36),
    tipo: tipo,
    monto: monto,
    motivo: motivo,
    quien: quien,
    fecha: fechaInput || ahora.toISOString().slice(0, 10),
    hora: ahora.toTimeString().slice(0, 5)
  };

  movimientosCaja.unshift(mov);
  localStorage.setItem('movimientosCaja', JSON.stringify(movimientosCaja));
  if (window.fbGuardar) fbGuardar('movimientosCaja', mov.id, mov).catch(() => {});

  document.getElementById('movMonto').value = '';
  document.getElementById('movMotivo').value = '';
  document.getElementById('movQuien').value = '';

  renderMovimientos();
  showToast('âœ” ' + tipo + ' de $' + monto.toLocaleString() + ' registrado');
  registrarActividad(tipo + ' de Caja', tipo + ' de $' + monto.toLocaleString() + ' - ' + motivo);
}

function eliminarMovimiento(id) {
  if (!confirm('Â¿Eliminar este movimiento?')) return;
  movimientosCaja = movimientosCaja.filter(m => m.id !== id);
  localStorage.setItem('movimientosCaja', JSON.stringify(movimientosCaja));
  if (window.fbEliminar) fbEliminar('movimientosCaja', id).catch(() => {});
  renderMovimientos();
  showToast('Movimiento eliminado');
}

function renderMovimientos() {
  const tbody = document.getElementById('tbodyMovimientos');
  if (!tbody) return;

  const datos = movimientosCaja.slice(0, 50);

  if (datos.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="empty-msg">No hay movimientos registrados</td></tr>';
  } else {
    tbody.innerHTML = datos.map((m, i) => `<tr>
      <td>${i + 1}</td>
      <td><span style="display:inline-block;padding:2px 8px;border-radius:10px;font-size:0.75rem;font-weight:bold;background:${m.tipo==='Ingreso'?'#d1fae5':'#fee2e2'};color:${m.tipo==='Ingreso'?'#065f46':'#c81e1e'}">${m.tipo}</span></td>
      <td>${m.fecha.split('-').reverse().join('/')}</td>
      <td style="font-weight:bold;color:${m.tipo==='Ingreso'?'#065f46':'#c81e1e'}">${m.tipo==='Ingreso'?'+':'-'}$${m.monto.toLocaleString()}</td>
      <td>${m.motivo}</td>
      <td>${m.quien}</td>
      <td><button class="btn-delete" onclick="eliminarMovimiento('${m.id}')" title="Eliminar">ðŸ—‘</button></td>
    </tr>`).join('');
  }

  // Update totals
  const ingresos = movimientosCaja.filter(m => m.tipo === 'Ingreso').reduce((a, m) => a + m.monto, 0);
  const egresos = movimientosCaja.filter(m => m.tipo === 'Egreso').reduce((a, m) => a + m.monto, 0);
  const balance = ingresos - egresos;

  const elIng = document.getElementById('movTotalIngresos');
  const elEgr = document.getElementById('movTotalEgresos');
  const elBal = document.getElementById('movBalance');

  if (elIng) elIng.textContent = '$' + ingresos.toLocaleString();
  if (elEgr) elEgr.textContent = '$' + egresos.toLocaleString();
  if (elBal) {
    elBal.textContent = '$' + balance.toLocaleString();
    elBal.style.color = balance >= 0 ? '#065f46' : '#c81e1e';
  }
}

// Set default date for movimientos
(function() {
  const el = document.getElementById('movFecha');
  if (el) el.value = new Date().toISOString().slice(0, 10);
})();

document.getElementById('btnRegistrarMov').addEventListener('click', registrarMovimiento);

// Comparar semanas
document.getElementById('btnCompararSemanas').addEventListener('click', () => {
  const hoy = new Date();
  const diaSemana = hoy.getDay() || 7; // 1=lun, 7=dom
  const inicioEstaSemana = new Date(hoy);
  inicioEstaSemana.setDate(hoy.getDate() - diaSemana + 1);
  const finEstaSemana = new Date(inicioEstaSemana);
  finEstaSemana.setDate(inicioEstaSemana.getDate() + 6);
  const inicioSemanaAnt = new Date(inicioEstaSemana);
  inicioSemanaAnt.setDate(inicioEstaSemana.getDate() - 7);
  const finSemanaAnt = new Date(inicioEstaSemana);
  finSemanaAnt.setDate(inicioEstaSemana.getDate() - 1);

  const formato = d => d.toISOString().slice(0, 10);
  const ventasEsta = ventasCaja.filter(v => v.fecha >= formato(inicioEstaSemana) && v.fecha <= formato(finEstaSemana));
  const ventasAnt = ventasCaja.filter(v => v.fecha >= formato(inicioSemanaAnt) && v.fecha <= formato(finSemanaAnt));

  const totalEsta = ventasEsta.reduce((a, v) => a + v.monto, 0);
  const totalAnt = ventasAnt.reduce((a, v) => a + v.monto, 0);
  const cantEsta = ventasEsta.length;
  const cantAnt = ventasAnt.length;

  function diff(a, b) {
    const d = b - a;
    const pct = a > 0 ? Math.round((d / a) * 100) : (b > 0 ? 'âˆž' : 0);
    const color = d > 0 ? '#065f46' : d < 0 ? '#c81e1e' : '#333';
    return `<span style="color:${color};font-weight:bold">${d >= 0 ? '+' : ''}${typeof d === 'number' && d > 999 ? '$'+d.toLocaleString() : d} (${pct}%)</span>`;
  }

  document.getElementById('tbodyCompSemanas').innerHTML = `
    <tr><td>Total Ventas</td><td>$${totalAnt.toLocaleString()}</td><td>$${totalEsta.toLocaleString()}</td><td>${diff(totalAnt, totalEsta)}</td></tr>
    <tr><td>Cantidad</td><td>${cantAnt}</td><td>${cantEsta}</td><td>${diff(cantAnt, cantEsta)}</td></tr>
    <tr><td>Efectivo</td><td>$${ventasAnt.filter(v=>v.metodo==='Efectivo').reduce((a,v)=>a+v.monto,0).toLocaleString()}</td><td>$${ventasEsta.filter(v=>v.metodo==='Efectivo').reduce((a,v)=>a+v.monto,0).toLocaleString()}</td><td></td></tr>
    <tr><td>DÃ©bito</td><td>$${ventasAnt.filter(v=>v.metodo==='DÃ©bito').reduce((a,v)=>a+v.monto,0).toLocaleString()}</td><td>$${ventasEsta.filter(v=>v.metodo==='DÃ©bito').reduce((a,v)=>a+v.monto,0).toLocaleString()}</td><td></td></tr>
    <tr><td>CrÃ©dito</td><td>$${ventasAnt.filter(v=>v.metodo==='CrÃ©dito').reduce((a,v)=>a+v.monto,0).toLocaleString()}</td><td>$${ventasEsta.filter(v=>v.metodo==='CrÃ©dito').reduce((a,v)=>a+v.monto,0).toLocaleString()}</td><td></td></tr>
    
  `;
  document.getElementById('comparacionSemanas').style.display = '';
});

// GrÃ¡ficos de Caja
document.getElementById('btnCajaGraficos').addEventListener('click', () => {
  const mes = document.getElementById('cajaGraficosMes').value;
  if (!mes) { showToast('Selecciona un mes', true); return; }
  renderCajaGraficos(mes);
});

function renderCajaGraficos(mes) {
  const ventas = ventasCaja.filter(v => v.fecha && v.fecha.slice(0, 7) === mes);
  if (ventas.length === 0) {
    document.getElementById('cajaGraficosContainer').innerHTML = '<p style="color:#888;text-align:center">No hay ventas en este mes.</p>';
    return;
  }

  // 1. Barras horizontales por dÃ­a
  const porDia = {};
  ventas.forEach(v => {
    const dia = parseInt(v.fecha.slice(8, 10));
    porDia[dia] = (porDia[dia] || 0) + v.monto;
  });
  const maxDia = Math.max(...Object.values(porDia));
  let barrasH = '<h3 style="margin-bottom:8px">ðŸ“Š Ventas por DÃ­a (Barras Horizontales)</h3>';
  const diasOrdenados = Object.keys(porDia).map(Number).sort((a, b) => a - b);
  diasOrdenados.forEach(dia => {
    const monto = porDia[dia];
    const pct = maxDia > 0 ? (monto / maxDia) * 100 : 0;
    barrasH += '<div class="chart-bar-h"><span class="label">' + dia + '</span><div class="bar" style="width:' + pct + '%"></div><span class="amount">$' + monto.toLocaleString() + '</span></div>';
  });

  // 2. Torta por mÃ©todo de pago
  const colores = { Efectivo: '#10b981', 'DÃ©bito': '#3b82f6', 'CrÃ©dito': '#f59e0b', Transferencia: '#8b5cf6' };
  const porMetodo = {};
  ventas.forEach(v => {
    porMetodo[v.metodo] = (porMetodo[v.metodo] || 0) + v.monto;
  });
  const totalMetodos = Object.values(porMetodo).reduce((a, b) => a + b, 0);
  let gradParts = [];
  let acum = 0;
  Object.keys(colores).forEach(m => {
    if (porMetodo[m]) {
      const pct = (porMetodo[m] / totalMetodos) * 100;
      gradParts.push((colores[m] || '#999') + ' ' + acum + '% ' + (acum + pct) + '%');
      acum += pct;
    }
  });
  const gradiente = gradParts.length > 0 ? gradParts.join(', ') : '#e5e7eb 0% 100%';
  let torta = '<h3 style="margin:20px 0 8px">ðŸ¥§ DistribuciÃ³n por MÃ©todo de Pago</h3>';
  torta += '<div class="chart-torta" style="background:conic-gradient(' + gradiente + ')"></div>';
  torta += '<div class="chart-legend">';
  Object.keys(colores).forEach(m => {
    if (porMetodo[m]) {
      const pct = ((porMetodo[m] / totalMetodos) * 100).toFixed(1);
      torta += '<span><span class="dot" style="background:' + colores[m] + '"></span>' + m + ' ' + pct + '%</span>';
    }
  });
  torta += '</div>';

  // 3. Barras verticales por semana
  const semanas = [0, 0, 0, 0];
  ventas.forEach(v => {
    const dia = parseInt(v.fecha.slice(8, 10));
    const semIdx = Math.min(Math.floor((dia - 1) / 7), 3);
    semanas[semIdx] += v.monto;
  });
  const maxSem = Math.max(...semanas);
  let barrasV = '<h3 style="margin:20px 0 8px">ðŸ“ˆ Total por Semana (Barras Verticales)</h3>';
  barrasV += '<div class="chart-vertical">';
  semanas.forEach((total, i) => {
    const pctH = maxSem > 0 ? (total / maxSem) * 100 : 0;
    barrasV += '<div class="vbar" style="height:' + Math.max(pctH, 2) + '%"><div style="margin-top:auto;padding:4px 2px;font-size:0.65rem">$' + total.toLocaleString() + '</div><div style="font-size:0.7rem;padding-bottom:2px">S' + (i + 1) + '</div></div>';
  });
  barrasV += '</div>';

  // 4. Barra de progreso apilada
  let apilada = '<h3 style="margin:20px 0 8px">ðŸ”‹ Barra Apilada por MÃ©todo</h3>';
  apilada += '<div class="chart-stacked">';
  Object.keys(colores).forEach(m => {
    if (porMetodo[m]) {
      const pct = (porMetodo[m] / totalMetodos) * 100;
      apilada += '<div class="seg" style="width:' + pct + '%;background:' + colores[m] + '">' + (pct >= 8 ? pct.toFixed(0) + '%' : '') + '</div>';
    }
  });
  apilada += '</div>';
  apilada += '<div class="chart-legend" style="margin-top:6px">';
  Object.keys(colores).forEach(m => {
    if (porMetodo[m]) {
      apilada += '<span><span class="dot" style="background:' + colores[m] + '"></span>' + m + ': $' + porMetodo[m].toLocaleString() + '</span>';
    }
  });
  apilada += '</div>';

  // 5. Barras por dÃ­a de la semana
  const diasSemana = ['Lun', 'Mar', 'MiÃ©', 'Jue', 'Vie', 'SÃ¡b', 'Dom'];
  const porDiaSemana = [0, 0, 0, 0, 0, 0, 0];
  ventas.forEach(v => {
    const d = new Date(v.fecha + 'T12:00:00');
    const dia = d.getDay(); // 0=dom
    porDiaSemana[dia === 0 ? 6 : dia - 1] += v.monto;
  });
  const maxDS = Math.max(...porDiaSemana);
  let barrasDiaSemana = '<h3 style="margin:20px 0 8px">ðŸ“… Ventas por DÃ­a de la Semana</h3>';
  barrasDiaSemana += '<div class="chart-vertical" style="height:130px">';
  diasSemana.forEach((nombre, i) => {
    const pctH = maxDS > 0 ? (porDiaSemana[i] / maxDS) * 100 : 0;
    const color = porDiaSemana[i] === maxDS && maxDS > 0 ? '#065f46' : '#3b82f6';
    barrasDiaSemana += '<div class="vbar" style="height:' + Math.max(pctH, 3) + '%;background:' + color + ';width:40px"><div style="margin-top:auto;padding:2px;font-size:0.6rem">$' + (porDiaSemana[i]/1000).toFixed(0) + 'k</div><div style="font-size:0.7rem;padding-bottom:2px">' + nombre + '</div></div>';
  });
  barrasDiaSemana += '</div>';

  // 6. Mini sparkline Ãºltimos 7 dÃ­as
  const hoy = obtenerFechaLocalChile();
  const ultimos7 = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const fecha = d.toISOString().slice(0, 10);
    const total = ventasCaja.filter(v => v.fecha === fecha).reduce((a, v) => a + v.monto, 0);
    ultimos7.push({ fecha: fecha.slice(8, 10) + '/' + fecha.slice(5, 7), total });
  }
  const maxSpk = Math.max(...ultimos7.map(d => d.total), 1);
  let sparkline = '<h3 style="margin:20px 0 8px">ðŸ“ˆ Tendencia Ãšltimos 7 DÃ­as</h3>';
  sparkline += '<div style="display:flex;align-items:flex-end;height:80px;gap:4px;border-bottom:1px solid #e5e7eb;padding-bottom:4px">';
  ultimos7.forEach(d => {
    const pct = (d.total / maxSpk) * 100;
    sparkline += '<div style="flex:1;display:flex;flex-direction:column;align-items:center"><div style="width:100%;background:#1a56db;border-radius:3px 3px 0 0;height:' + Math.max(pct, 2) + '%" title="$' + d.total.toLocaleString() + '"></div></div>';
  });
  sparkline += '</div>';
  sparkline += '<div style="display:flex;gap:4px;margin-top:4px">';
  ultimos7.forEach(d => {
    sparkline += '<div style="flex:1;text-align:center;font-size:0.65rem;color:#888">' + d.fecha + '</div>';
  });
  sparkline += '</div>';

  document.getElementById('cajaGraficosContainer').innerHTML = barrasH + torta + barrasV + apilada + barrasDiaSemana + sparkline;
}

// Comparar meses de caja
document.getElementById('btnCajaCompararMeses').addEventListener('click', () => {
  const mes1 = document.getElementById('cajaCmpMes1').value;
  const mes2 = document.getElementById('cajaCmpMes2').value;
  if (!mes1 || !mes2) { showToast('Selecciona ambos meses', true); return; }
  const v1 = ventasCaja.filter(v => v.fecha && v.fecha.slice(0,7) === mes1);
  const v2 = ventasCaja.filter(v => v.fecha && v.fecha.slice(0,7) === mes2);
  const t1 = v1.reduce((a,v) => a + v.monto, 0);
  const t2 = v2.reduce((a,v) => a + v.monto, 0);
  const mesesNombres = ['','Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  document.getElementById('cajaCmpTit1').textContent = mesesNombres[parseInt(mes1.split('-')[1])] + ' ' + mes1.split('-')[0];
  document.getElementById('cajaCmpTit2').textContent = mesesNombres[parseInt(mes2.split('-')[1])] + ' ' + mes2.split('-')[0];
  function diff(a, b) {
    const d = b - a;
    const pct = a > 0 ? Math.round((d/a)*100) : (b > 0 ? 'âˆž' : 0);
    const color = d > 0 ? '#065f46' : d < 0 ? '#c81e1e' : '#333';
    return `<span style="color:${color};font-weight:bold">${d>=0?'+':''}$${d.toLocaleString()} (${pct}%)</span>`;
  }
  function diffN(a, b) {
    const d = b - a;
    const pct = a > 0 ? Math.round((d/a)*100) : (b > 0 ? 'âˆž' : 0);
    const color = d > 0 ? '#065f46' : d < 0 ? '#c81e1e' : '#333';
    return `<span style="color:${color};font-weight:bold">${d>=0?'+':''}${d} (${pct}%)</span>`;
  }
  document.getElementById('tbodyCajaCompMeses').innerHTML = `
    <tr><td>Total</td><td>$${t1.toLocaleString()}</td><td>$${t2.toLocaleString()}</td><td>${diff(t1,t2)}</td></tr>
    <tr><td>Cantidad ventas</td><td>${v1.length}</td><td>${v2.length}</td><td>${diffN(v1.length,v2.length)}</td></tr>
    <tr><td>Efectivo</td><td>$${v1.filter(v=>v.metodo==='Efectivo').reduce((a,v)=>a+v.monto,0).toLocaleString()}</td><td>$${v2.filter(v=>v.metodo==='Efectivo').reduce((a,v)=>a+v.monto,0).toLocaleString()}</td><td></td></tr>
    <tr><td>DÃ©bito</td><td>$${v1.filter(v=>v.metodo==='DÃ©bito').reduce((a,v)=>a+v.monto,0).toLocaleString()}</td><td>$${v2.filter(v=>v.metodo==='DÃ©bito').reduce((a,v)=>a+v.monto,0).toLocaleString()}</td><td></td></tr>
    <tr><td>CrÃ©dito</td><td>$${v1.filter(v=>v.metodo==='CrÃ©dito').reduce((a,v)=>a+v.monto,0).toLocaleString()}</td><td>$${v2.filter(v=>v.metodo==='CrÃ©dito').reduce((a,v)=>a+v.monto,0).toLocaleString()}</td><td></td></tr>
    
  `;
  document.getElementById('cajaCompMeses').style.display = '';
});

// DÃ­a mÃ¡s lento
document.getElementById('btnCajaDiaLento').addEventListener('click', () => {
  const mes = document.getElementById('cajaDiaLentoMes').value;
  if (!mes) { showToast('Selecciona un mes', true); return; }
  const ventasMes = ventasCaja.filter(v => v.fecha && v.fecha.slice(0,7) === mes);
  if (ventasMes.length === 0) { document.getElementById('cajaDiaLentoResult').textContent = 'Sin ventas en este mes'; return; }
  const porDia = {};
  ventasMes.forEach(v => { porDia[v.fecha] = (porDia[v.fecha] || 0) + v.monto; });
  let peorDia = '';
  let minMonto = Infinity;
  Object.entries(porDia).forEach(([dia, monto]) => {
    if (monto < minMonto) { minMonto = monto; peorDia = dia; }
  });
  document.getElementById('cajaDiaLentoResult').textContent = 'ðŸ“‰ ' + peorDia.split('-').reverse().join('/') + ' â€” $' + minMonto.toLocaleString() + ' (dÃ­a mÃ¡s lento)';
});

// â”€â”€ Informe Mensual Completo PDF â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// â”€â”€ Estacionalidad Anual â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
document.getElementById('cajaEstacionalidadAnio').value = new Date().getFullYear();
document.getElementById('btnCajaEstacionalidad').addEventListener('click', () => {
  const anio = document.getElementById('cajaEstacionalidadAnio').value;
  if (!anio) { showToast('Ingresa un aÃ±o', true); return; }

  const mesesNombres = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  const datos = [];
  let maxMonto = 0;

  for (let m = 1; m <= 12; m++) {
    const mesStr = anio + '-' + String(m).padStart(2, '0');
    const ventasMes = ventasCaja.filter(v => v.fecha && v.fecha.slice(0, 7) === mesStr);
    const total = ventasMes.reduce((a, v) => a + v.monto, 0);
    const cantidad = ventasMes.length;
    datos.push({ mes: mesesNombres[m-1], total, cantidad });
    if (total > maxMonto) maxMonto = total;
  }

  const totalAnual = datos.reduce((a, d) => a + d.total, 0);
  const promMensual = totalAnual > 0 ? Math.round(totalAnual / datos.filter(d => d.total > 0).length) : 0;

  // Find best and worst months (with data)
  const conDatos = datos.filter(d => d.total > 0);
  let mejorMes = 'â€”', peorMes = 'â€”';
  if (conDatos.length > 0) {
    const mejor = conDatos.reduce((a, b) => a.total > b.total ? a : b);
    const peor = conDatos.reduce((a, b) => a.total < b.total ? a : b);
    mejorMes = mejor.mes + ' ($' + mejor.total.toLocaleString() + ')';
    peorMes = peor.mes + ' ($' + peor.total.toLocaleString() + ')';
  }

  const container = document.getElementById('cajaEstacionalidadResult');
  container.innerHTML = `
    <div style="display:flex;gap:12px;margin-bottom:16px;flex-wrap:wrap">
      <div style="padding:8px 14px;background:#d1fae5;border-radius:6px;font-size:0.9rem"><strong>Total ${anio}:</strong> $${totalAnual.toLocaleString()}</div>
      <div style="padding:8px 14px;background:#e0e7ff;border-radius:6px;font-size:0.9rem"><strong>Promedio mensual:</strong> $${promMensual.toLocaleString()}</div>
      <div style="padding:8px 14px;background:#d1fae5;border-radius:6px;font-size:0.9rem"><strong>Mejor mes:</strong> ${mejorMes}</div>
      <div style="padding:8px 14px;background:#fee2e2;border-radius:6px;font-size:0.9rem"><strong>Peor mes:</strong> ${peorMes}</div>
    </div>
    <div style="display:flex;align-items:flex-end;gap:4px;height:200px;border-bottom:2px solid #333;padding-bottom:4px;margin-bottom:8px">
      ${datos.map(d => {
        const pct = maxMonto > 0 ? Math.round((d.total / maxMonto) * 100) : 0;
        const color = d.total >= promMensual ? '#1a56db' : (d.total > 0 ? '#93c5fd' : '#e5e7eb');
        return '<div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;height:100%"><div style="width:100%;background:' + color + ';border-radius:4px 4px 0 0;height:' + pct + '%;min-height:' + (d.total > 0 ? '4px' : '2px') + '" title="' + d.mes + ': $' + d.total.toLocaleString() + '"></div><span style="font-size:0.7rem;margin-top:4px;font-weight:600">' + d.mes + '</span></div>';
      }).join('')}
    </div>
    <div style="display:flex;align-items:center;gap:12px;font-size:0.75rem;color:#555">
      <div><span style="display:inline-block;width:12px;height:12px;background:#1a56db;border-radius:2px;vertical-align:middle;margin-right:4px"></span>Sobre promedio</div>
      <div><span style="display:inline-block;width:12px;height:12px;background:#93c5fd;border-radius:2px;vertical-align:middle;margin-right:4px"></span>Bajo promedio</div>
      <div><span style="display:inline-block;width:12px;height:12px;background:#e5e7eb;border-radius:2px;vertical-align:middle;margin-right:4px"></span>Sin datos</div>
      <div>Promedio: $${promMensual.toLocaleString()}/mes</div>
    </div>
    <table style="margin-top:16px;width:100%;font-size:0.9rem">
      <thead><tr><th>Mes</th><th>Monto</th><th>Ventas</th><th>vs Promedio</th></tr></thead>
      <tbody>${datos.map(d => {
        const diff = promMensual > 0 ? Math.round(((d.total - promMensual) / promMensual) * 100) : 0;
        const color = d.total >= promMensual ? '#065f46' : '#c81e1e';
        return '<tr><td>' + d.mes + '</td><td>$' + d.total.toLocaleString() + '</td><td>' + d.cantidad + '</td><td style="color:' + color + ';font-weight:bold">' + (d.total > 0 ? (diff >= 0 ? '+' : '') + diff + '%' : 'â€”') + '</td></tr>';
      }).join('')}</tbody>
    </table>
  `;
});

document.getElementById('btnCajaInforme').addEventListener('click', () => {
  const mes = document.getElementById('cajaInformeMes').value;
  if (!mes) { showToast('Selecciona un mes', true); return; }
  const mes2 = document.getElementById('cajaInformeMes2').value || null;
  generarInformeCaja(mes, mes2);
});

document.getElementById('btnCajaInformeGuardar').addEventListener('click', () => {
  const mes = document.getElementById('cajaInformeMes').value;
  if (!mes) { showToast('Selecciona un mes', true); return; }
  const mes2 = document.getElementById('cajaInformeMes2').value || null;
  generarInformeCaja(mes, mes2, true);
});

function generarConclusionAleatoria(nombreMes, total, ventas, metodoTop, mejorDia, mejorMonto, peorDia, peorMonto, promDiario, diasConVentas, diffPct, diaSemNombre, semanas, boletas, facturas, efectivo, debito, credito) {
  const pctMetodo = Math.round((metodoTop.c/ventas.length)*100);
  const pctBoletas = Math.round((boletas.length/ventas.length)*100);
  const pctFacturas = Math.round((facturas.length/ventas.length)*100);
  const pctSinDoc = Math.round((0/ventas.length)*100);
  const diffMonto = (mejorMonto - peorMonto).toLocaleString();
  const maxSem = Math.max(...semanas).toLocaleString();
  const tendencia = diffPct >= 0 ? 'se registrÃ³ un crecimiento del ' + diffPct + '% en ingresos, indicando una tendencia positiva.' : 'se observÃ³ una disminuciÃ³n del ' + Math.abs(diffPct) + '% en ingresos. Se recomienda evaluar acciones correctivas.';
  const conclusiones = [
    '<p><strong>Resumen:</strong> El mes de ' + nombreMes + ' cerrÃ³ con $' + total.toLocaleString() + ' en ' + ventas.length + ' ventas durante ' + diasConVentas + ' dÃ­as. Promedio diario: $' + promDiario.toLocaleString() + '.</p><p><strong>Pagos:</strong> ' + metodoTop.n + ' fue el mÃ©todo principal con ' + metodoTop.c + ' operaciones (' + pctMetodo + '%).</p><p><strong>Documentos:</strong> ' + boletas.length + ' boletas (' + pctBoletas + '%), ' + facturas.length + ' facturas (' + pctFacturas + '%), ' + 0 + ' sin documento (' + pctSinDoc + '%).</p><p><strong>Rendimiento:</strong> Mejor dÃ­a: ' + mejorDia.split("-").reverse().join("/") + ' ($' + mejorMonto.toLocaleString() + '). Peor dÃ­a: ' + peorDia.split("-").reverse().join("/") + ' ($' + peorMonto.toLocaleString() + '). Diferencia: $' + diffMonto + '.</p><p><strong>Tendencia:</strong> ' + tendencia + '</p><p><strong>Patrones:</strong> ' + diaSemNombre + ' es el dÃ­a mÃ¡s activo. Semana mÃ¡s fuerte: $' + maxSem + '.</p><p><strong>Recomendaciones:</strong></p><ul style="margin-left:20px;line-height:2"><li>Mantener registro consistente de todas las transacciones.</li><li>Incentivar pagos electrÃ³nicos para mayor seguridad.</li><li>Implementar promociones en dÃ­as de baja actividad.</li><li>Establecer metas mensuales basadas en datos histÃ³ricos.</li><li>Realizar seguimiento semanal de indicadores clave.</li><li>Capacitar personal para dÃ­as de alta demanda.</li></ul><p><strong>Nota:</strong> Informe generado automÃ¡ticamente por Bodega A&M.</p>',
    '<p><strong>AnÃ¡lisis Final:</strong> Durante ' + nombreMes + ', se procesaron ' + ventas.length + ' ventas por $' + total.toLocaleString() + ' en ' + diasConVentas + ' dÃ­as operativos. Promedio: $' + promDiario.toLocaleString() + '/dÃ­a.</p><p><strong>Comportamiento:</strong> Los clientes prefirieron ' + metodoTop.n + ' (' + metodoTop.c + ' ops, ' + pctMetodo + '%). Esto es relevante para la gestiÃ³n de caja.</p><p><strong>Variabilidad:</strong> La brecha entre mejor dÃ­a (' + mejorDia.split("-").reverse().join("/") + ': $' + mejorMonto.toLocaleString() + ') y peor (' + peorDia.split("-").reverse().join("/") + ': $' + peorMonto.toLocaleString() + ') fue de $' + diffMonto + '.</p><p><strong>EvoluciÃ³n:</strong> ' + tendencia + '</p><p><strong>DistribuciÃ³n:</strong> ' + diaSemNombre + ' concentra mayor actividad. Semana top: $' + maxSem + '.</p><p><strong>Tributario:</strong> ' + boletas.length + ' boletas, ' + facturas.length + ' facturas, ' + 0 + ' sin documento. Meta: reducir operaciones sin respaldo.</p><p><strong>Plan de AcciÃ³n:</strong></p><ul style="margin-left:20px;line-height:2"><li>Definir meta del prÃ³ximo mes basada en promedio actual +10%.</li><li>Reducir ventas sin documento a menos del 5%.</li><li>Evaluar horarios segÃºn patrones de demanda.</li><li>Considerar alianzas con proveedores de medios de pago.</li><li>Implementar incentivos para personal en dÃ­as peak.</li><li>Programar revisiones semanales de KPIs.</li></ul><p><strong>Cierre:</strong> Este informe es base sÃ³lida para decisiones. Se recomienda revisiÃ³n mensual sistemÃ¡tica.</p>',
    '<p><strong>Conclusiones:</strong> ' + nombreMes + ' registrÃ³ ' + ventas.length + ' transacciones por $' + total.toLocaleString() + '. OperaciÃ³n en ' + diasConVentas + ' dÃ­as con promedio de $' + promDiario.toLocaleString() + ' diarios.</p><p><strong>Perfil de Pagos:</strong> ' + metodoTop.n + ' lidera con ' + metodoTop.c + ' operaciones (' + pctMetodo + '%). InformaciÃ³n valiosa para planificar flujo de caja.</p><p><strong>DÃ­as Destacados:</strong> Mejor: ' + mejorDia.split("-").reverse().join("/") + ' ($' + mejorMonto.toLocaleString() + '). Peor: ' + peorDia.split("-").reverse().join("/") + ' ($' + peorMonto.toLocaleString() + '). Brecha: $' + diffMonto + '.</p><p><strong>HistÃ³rico:</strong> ' + tendencia + '</p><p><strong>Ritmo:</strong> ' + diaSemNombre + ' es el dÃ­a estrella. Semana mÃ¡s productiva: $' + maxSem + '. Estos patrones deben guiar la planificaciÃ³n operativa.</p><p><strong>Cumplimiento:</strong> ' + pctBoletas + '% boletas, ' + pctFacturas + '% facturas, ' + pctSinDoc + '% sin documento. Mejorar progresivamente la formalizaciÃ³n.</p><p><strong>LÃ­neas de AcciÃ³n:</strong></p><ul style="margin-left:20px;line-height:2"><li>Fortalecer atenciÃ³n en dÃ­as de mayor demanda.</li><li>Desarrollar estrategias de fidelizaciÃ³n de clientes.</li><li>Explorar oportunidades de venta cruzada.</li><li>Automatizar generaciÃ³n de reportes para seguimiento Ã¡gil.</li><li>Establecer alertas tempranas para caÃ­das en ventas.</li><li>Documentar mejores prÃ¡cticas de dÃ­as exitosos.</li></ul><p><strong>ObservaciÃ³n:</strong> La consistencia en registro y anÃ¡lisis es base para crecimiento sostenido.</p>'
  ];
  return conclusiones[Math.floor(Math.random() * conclusiones.length)];
}

function generarInformeCaja(mes, mes2, guardarEnEscritorio) {
  const ventas = ventasCaja.filter(v => v.fecha && v.fecha.slice(0,7) === mes);
  if (ventas.length === 0) { showToast('No hay ventas en este mes', true); return; }

  const mesesNombres = ['','Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  const [anio, mesNum] = mes.split('-');
  const nombreMes = mesesNombres[parseInt(mesNum)] + ' ' + anio;

  // CÃ¡lculos
  const total = ventas.reduce((a,v) => a + v.monto, 0);
  const efectivo = ventas.filter(v => v.metodo==='Efectivo');
  const debito = ventas.filter(v => v.metodo==='DÃ©bito');
  const credito = ventas.filter(v => v.metodo==='CrÃ©dito');
  const boletas = ventas.filter(v => v.tipoDoc==='Boleta');
  const facturas = ventas.filter(v => v.tipoDoc==='Factura');
  
  // Por dÃ­a
  const porDia = {};
  ventas.forEach(v => { porDia[v.fecha] = (porDia[v.fecha] || 0) + v.monto; });
  const diasOrdenados = Object.entries(porDia).sort((a,b) => a[0].localeCompare(b[0]));
  let mejorDia = '', mejorMonto = 0, peorDia = '', peorMonto = Infinity;
  diasOrdenados.forEach(([dia, monto]) => {
    if (monto > mejorMonto) { mejorMonto = monto; mejorDia = dia; }
    if (monto < peorMonto) { peorMonto = monto; peorDia = dia; }
  });

  // Por semana
  const semanas = [0,0,0,0];
  ventas.forEach(v => { const d = parseInt(v.fecha.slice(8,10)); semanas[Math.min(Math.floor((d-1)/7),3)] += v.monto; });

  // Por dÃ­a de semana
  const diasSemNombres = ['Domingo','Lunes','Martes','MiÃ©rcoles','Jueves','Viernes','SÃ¡bado'];
  const porDiaSem = [0,0,0,0,0,0,0];
  ventas.forEach(v => { const d = new Date(v.fecha+'T12:00:00').getDay(); porDiaSem[d] += v.monto; });
  let diaSemMax = 0, diaSemNombre = '';
  porDiaSem.forEach((m,i) => { if (m > diaSemMax) { diaSemMax = m; diaSemNombre = diasSemNombres[i]; } });

  // Mes anterior
  const mesAnt = parseInt(mesNum) === 1 ? `${parseInt(anio)-1}-12` : `${anio}-${String(parseInt(mesNum)-1).padStart(2,'0')}`;
  const ventasAnt = ventasCaja.filter(v => v.fecha && v.fecha.slice(0,7) === mesAnt);
  const totalAnt = ventasAnt.reduce((a,v) => a + v.monto, 0);
  const diffPct = totalAnt > 0 ? Math.round(((total - totalAnt) / totalAnt) * 100) : 0;

  // Promedio diario
  const diasConVentas = Object.keys(porDia).length;
  const promDiario = diasConVentas > 0 ? Math.round(total / diasConVentas) : 0;

  // MÃ©todo mÃ¡s usado
  const metodos = [{n:'Efectivo',c:efectivo.length},{n:'DÃ©bito',c:debito.length},{n:'CrÃ©dito',c:credito.length}];
  metodos.sort((a,b) => b.c - a.c);
  const metodoTop = metodos[0];

  // Retiros del mes
  const retirosMes = retirosCaja.filter(r => r.fecha && r.fecha.slice(0,7) === mes);
  const totalRetirosMes = retirosMes.reduce((a, r) => a + r.monto, 0);

  // Por hora del dÃ­a
  const porHora = Array(24).fill(0);
  const ventasPorHora = Array(24).fill(0);
  ventas.forEach(v => {
    if (v.hora) {
      const h = parseInt(v.hora.split(':')[0]);
      if (h >= 0 && h < 24) { porHora[h] += v.monto; ventasPorHora[h]++; }
    }
  });
  let horaPico = 0, horaMax = 0;
  porHora.forEach((m, i) => { if (m > horaMax) { horaMax = m; horaPico = i; } });

  const fechaGen = new Date().toLocaleDateString('es-CL');

  
  // ComparaciÃ³n con mes2 (si se seleccionÃ³)
  let mes2Data = null;
  if (mes2) {
    const ventas2 = ventasCaja.filter(v => v.fecha && v.fecha.slice(0,7) === mes2);
    const [anio2, mesNum2] = mes2.split('-');
    const nombreMes2 = mesesNombres[parseInt(mesNum2)] + ' ' + anio2;
    const total2 = ventas2.reduce((a,v) => a + v.monto, 0);
    const efectivo2 = ventas2.filter(v => v.metodo==='Efectivo');
    const debito2 = ventas2.filter(v => v.metodo==='DÃ©bito');
    const credito2 = ventas2.filter(v => v.metodo==='CrÃ©dito');
    const boletas2 = ventas2.filter(v => v.tipoDoc==='Boleta');
    const facturas2 = ventas2.filter(v => v.tipoDoc==='Factura');
    const porDia2 = {};
    ventas2.forEach(v => { porDia2[v.fecha] = (porDia2[v.fecha] || 0) + v.monto; });
    const diasConVentas2 = Object.keys(porDia2).length;
    const promDiario2 = diasConVentas2 > 0 ? Math.round(total2 / diasConVentas2) : 0;
    const diffTotal = total > 0 || total2 > 0 ? Math.round(((total - total2) / (total2 || 1)) * 100) : 0;
    mes2Data = { nombreMes2, total2, ventas2, efectivo2, debito2, credito2, boletas2, facturas2, diasConVentas2, promDiario2, diffTotal };
  }

const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
    @page { size: letter; margin: 20mm; }
    body { font-family: 'Segoe UI', Arial, sans-serif; color: #333; line-height: 1.5; }
    .portada { text-align: center; padding-top: 120px; page-break-after: always; }
    .portada h1 { font-size: 2.2rem; color: #1a56db; margin-bottom: 10px; }
    .portada h2 { font-size: 1.5rem; color: #555; font-weight: normal; }
    .portada .fecha { margin-top: 60px; color: #888; }
    .indice { page-break-after: always; }
    .indice h2 { color: #1a56db; border-bottom: 2px solid #1a56db; padding-bottom: 8px; }
    .indice ul { list-style: none; padding: 0; }
    .indice li { padding: 8px 0; border-bottom: 1px dotted #ccc; font-size: 1.1rem; }
    .seccion { page-break-before: always; page-break-inside: avoid; }
    .seccion h2 { color: #1a56db; border-bottom: 2px solid #e5e7eb; padding-bottom: 8px; margin-bottom: 16px; }
    table { width: 100%; border-collapse: collapse; margin: 12px 0; font-size: 0.9rem; page-break-inside: auto; }
    tr { page-break-inside: avoid; }
    th { background: #1a56db; color: white; padding: 8px 10px; text-align: left; }
    td { padding: 7px 10px; border-bottom: 1px solid #eee; }
    tr:nth-child(even) { background: #f8fafc; }
    .kpi-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; margin: 16px 0; }
    .kpi { background: #f0f4ff; border-radius: 8px; padding: 14px; text-align: center; }
    .kpi .num { font-size: 1.4rem; font-weight: bold; color: #1a56db; }
    .kpi .label { font-size: 0.8rem; color: #666; margin-top: 4px; }
    .conclusion { background: #f0fdf4; border-left: 4px solid #10b981; padding: 16px; border-radius: 8px; margin-top: 16px; }
    .footer { text-align: center; margin-top: 40px; font-size: 0.8rem; color: #888; border-top: 1px solid #eee; padding-top: 10px; }
    @media print {
      .seccion { page-break-before: always !important; }
      .portada { page-break-after: always !important; }
      .indice { page-break-after: always !important; }
      table { page-break-inside: auto !important; }
      tr { page-break-inside: avoid !important; page-break-after: auto !important; }
      thead { display: table-header-group; }
      .conclusion { page-break-inside: avoid !important; }
    }
  </style></head><body>

  <!-- PORTADA -->
  <div class="portada">
    <h1>ðŸ“¦ Bodega A&amp;M</h1>
    <h2>Informe Mensual de Caja</h2>
    <h2 style="color:#1a56db;font-weight:bold">${nombreMes}</h2>
    <p class="fecha">Generado el ${fechaGen}</p>
  </div>

  <!-- ÃNDICE -->
  <div class="indice">
    <h2>Ãndice</h2>
    <ul>
      <li>1. IntroducciÃ³n</li>
      <li>2. Resumen Ejecutivo</li>
      <li>3. Desglose por MÃ©todo de Pago</li>
      <li>4. Desglose por Tipo de Documento</li>
      <li>5. AnÃ¡lisis por Semana</li>
      <li>6. AnÃ¡lisis por DÃ­a de la Semana</li>
      <li>7. Mejor y Peor DÃ­a del Mes</li>
      <li>8. ComparaciÃ³n con Mes Anterior</li>
      <li>9. Retiros de Caja</li>
      <li>10. Horarios Pico de Ventas</li>
      <li>11. GrÃ¡fico de Tendencia Diaria</li>
      <li>12. Detalle Diario Resumido</li>
      <li>13. Detalle Completo de Ventas</li>
      <li>14. ConclusiÃ³n y Recomendaciones</li>
    </ul>
  </div>

  <!-- 1. INTRODUCCIÃ“N -->
  <div class="seccion">
    <h2>1. IntroducciÃ³n</h2>
    <p>El presente informe tiene como objetivo proporcionar un anÃ¡lisis detallado y completo de las operaciones de caja realizadas durante el mes de <strong>${nombreMes}</strong> en Bodega A&M.</p>
    <p>Este documento recopila toda la informaciÃ³n financiera registrada en el sistema de caja, incluyendo los ingresos por ventas, los mÃ©todos de pago utilizados por los clientes, la distribuciÃ³n por tipo de documento tributario, y el comportamiento de las transacciones a lo largo del perÃ­odo analizado.</p>
    <p>El anÃ¡lisis abarca mÃºltiples dimensiones: desde el comportamiento diario y semanal de las ventas, hasta la comparaciÃ³n con perÃ­odos anteriores, permitiendo identificar tendencias, patrones de consumo y oportunidades de mejora en la gestiÃ³n financiera del negocio.</p>
    <p>La informaciÃ³n contenida en este informe es de carÃ¡cter interno y confidencial, destinada exclusivamente a facilitar la toma de decisiones estratÃ©gicas por parte de la administraciÃ³n de Bodega A&M.</p>
    <p>Los datos presentados fueron extraÃ­dos directamente del sistema de registro de caja digital, garantizando la precisiÃ³n y confiabilidad de las cifras reportadas. Cada transacciÃ³n fue registrada en tiempo real durante las operaciones diarias del establecimiento, asegurando la integridad de la informaciÃ³n.</p>
    <p>Se recomienda utilizar este informe como herramienta de referencia para evaluar el desempeÃ±o financiero del mes, identificar los dÃ­as y mÃ©todos de pago mÃ¡s relevantes, y planificar estrategias comerciales para los perÃ­odos siguientes.</p>
    <p>El documento se estructura en secciones que van desde un resumen ejecutivo con los indicadores clave, pasando por anÃ¡lisis detallados por mÃ©todo de pago, tipo de documento, comportamiento semanal y diario, hasta llegar a una conclusiÃ³n con recomendaciones concretas para la mejora continua del negocio.</p>
    <p>Este informe fue generado de forma automÃ¡tica por el sistema de gestiÃ³n de Bodega A&M el dÃ­a ${fechaGen}, y corresponde al perÃ­odo comprendido entre el 1 y el Ãºltimo dÃ­a del mes de ${nombreMes}.</p>
  </div>

  <!-- 2. RESUMEN EJECUTIVO -->
  <div class="seccion" style="page-break-inside:auto">
    <h2>2. Resumen Ejecutivo</h2>
    <p style="font-size:0.82rem;color:#555;margin-bottom:10px;line-height:1.5">
      Esta secciÃ³n presenta los indicadores clave de rendimiento (KPI) del mes de ${nombreMes}.<br>
      Se muestra el ingreso total, cantidad de ventas, promedio diario, dÃ­as operativos, mÃ©todo preferido y variaciÃ³n vs mes anterior.<br>
      Estos indicadores ofrecen una fotografÃ­a rÃ¡pida del desempeÃ±o financiero mensual.
    </p>
    <div class="kpi-grid">
      <div class="kpi"><div class="num">${total.toLocaleString()}</div><div class="label">Total del Mes</div></div>
      <div class="kpi"><div class="num">${ventas.length}</div><div class="label">Total Ventas</div></div>
      <div class="kpi"><div class="num">${promDiario.toLocaleString()}</div><div class="label">Promedio Diario</div></div>
      <div class="kpi"><div class="num">${diasConVentas}</div><div class="label">DÃ­as con Ventas</div></div>
      <div class="kpi"><div class="num">${metodoTop.n}</div><div class="label">MÃ©todo MÃ¡s Usado</div></div>
      <div class="kpi"><div class="num">${diffPct >= 0 ? '+' : ''}${diffPct}%</div><div class="label">vs Mes Anterior</div></div>
    </div>
    <div style="margin-top:12px;padding:12px 14px;background:#f0f4ff;border-radius:6px;font-size:0.82rem;color:#444;border-left:3px solid #1a56db;line-height:1.6">
      <strong>ConclusiÃ³n de esta secciÃ³n:</strong><br>
      Durante ${nombreMes} se procesaron ${ventas.length} transacciones que generaron ingresos por $${total.toLocaleString()}.<br>
      El promedio diario de ventas fue de $${promDiario.toLocaleString()}, calculado sobre ${diasConVentas} dÃ­as con actividad comercial registrada.<br>
      El mÃ©todo de pago preferido por los clientes fue ${metodoTop.n}, concentrando ${metodoTop.c} operaciones del total.<br>
      ${diffPct >= 0 ? 'Se observa un crecimiento del ' + diffPct + '% respecto al mes anterior, indicando tendencia positiva.' : 'Se registrÃ³ una caÃ­da del ' + Math.abs(diffPct) + '% respecto al mes anterior, lo que requiere atenciÃ³n.'}<br>
      Estos nÃºmeros reflejan el pulso general del negocio y sirven como base para decisiones estratÃ©gicas.<br>
      Se recomienda revisar las secciones siguientes para entender el comportamiento detrÃ¡s de estos indicadores.<br>
      El anÃ¡lisis por mÃ©todo de pago y tipo de documento complementa esta visiÃ³n general.
    </div>
  </div>

  <!-- 2. DESGLOSE POR MÃ‰TODO -->
  <div class="seccion">
    <h2>3. Desglose por MÃ©todo de Pago</h2>
    <p style="font-size:0.85rem;color:#555;margin-bottom:14px;line-height:1.6">
      En esta secciÃ³n se analiza cÃ³mo se distribuyeron los pagos segÃºn el medio utilizado por los clientes.<br>
      Se presentan los cuatro mÃ©todos disponibles: Efectivo, DÃ©bito, CrÃ©dito y Transferencia bancaria.<br>
      Para cada mÃ©todo se muestra el monto total recaudado, la cantidad de transacciones y su porcentaje.<br>
      El grÃ¡fico circular permite visualizar rÃ¡pidamente quÃ© mÃ©todo predomina en cantidad de operaciones.<br>
      Las barras de distribuciÃ³n por monto muestran quÃ© mÃ©todo concentra mayor volumen de dinero.<br>
      Esta informaciÃ³n es Ãºtil para evaluar si conviene incentivar algÃºn medio de pago especÃ­fico.<br>
      TambiÃ©n permite anticipar necesidades de cambio en efectivo o verificar comisiones por tarjeta.
    </p>
    <table>
      <tr><th>MÃ©todo</th><th>Monto</th><th>Ventas</th><th>%</th></tr>
      <tr><td>Efectivo</td><td>$${efectivo.reduce((a,v)=>a+v.monto,0).toLocaleString()}</td><td>${efectivo.length}</td><td>${ventas.length>0?Math.round((efectivo.length/ventas.length)*100):0}%</td></tr>
      <tr><td>DÃ©bito</td><td>$${debito.reduce((a,v)=>a+v.monto,0).toLocaleString()}</td><td>${debito.length}</td><td>${ventas.length>0?Math.round((debito.length/ventas.length)*100):0}%</td></tr>
      <tr><td>CrÃ©dito</td><td>$${credito.reduce((a,v)=>a+v.monto,0).toLocaleString()}</td><td>${credito.length}</td><td>${ventas.length>0?Math.round((credito.length/ventas.length)*100):0}%</td></tr>
      
      <tr style="font-weight:bold;background:#e0e7ff"><td>TOTAL</td><td>$${total.toLocaleString()}</td><td>${ventas.length}</td><td>100%</td></tr>
    </table>
    <div style="display:flex;align-items:center;justify-content:space-around;margin-top:20px;flex-wrap:wrap">
      <div style="width:160px;height:160px;border-radius:50%;background:conic-gradient(#10b981 0% ${ventas.length>0?Math.round((efectivo.length/ventas.length)*100):0}%, #3b82f6 ${ventas.length>0?Math.round((efectivo.length/ventas.length)*100):0}% ${ventas.length>0?Math.round(((efectivo.length+debito.length)/ventas.length)*100):0}%, #f59e0b ${ventas.length>0?Math.round(((efectivo.length+debito.length)/ventas.length)*100):0}% ${ventas.length>0?Math.round(((efectivo.length+debito.length+credito.length)/ventas.length)*100):0}%)"></div>
      <div style="font-size:0.85rem">
        <div style="margin:6px 0"><span style="display:inline-block;width:14px;height:14px;background:#10b981;border-radius:50%;vertical-align:middle;margin-right:6px"></span>Efectivo: ${ventas.length>0?Math.round((efectivo.length/ventas.length)*100):0}%</div>
        <div style="margin:6px 0"><span style="display:inline-block;width:14px;height:14px;background:#3b82f6;border-radius:50%;vertical-align:middle;margin-right:6px"></span>DÃ©bito: ${ventas.length>0?Math.round((debito.length/ventas.length)*100):0}%</div>
        <div style="margin:6px 0"><span style="display:inline-block;width:14px;height:14px;background:#f59e0b;border-radius:50%;vertical-align:middle;margin-right:6px"></span>CrÃ©dito: ${ventas.length>0?Math.round((credito.length/ventas.length)*100):0}%</div>
        <div style="margin:6px 0"><span style="display:inline-block;width:14px;height:14px;background:#8b5cf6;border-radius:50%;vertical-align:middle;margin-right:6px"></span>Transferencia: ${ventas.length>0?Math.round((0/ventas.length)*100):0}%</div>
      </div>
    </div>
    <div style="margin-top:20px">
      <p style="font-weight:600;margin-bottom:8px">DistribuciÃ³n por Monto:</p>
      <div style="display:flex;align-items:center;margin:4px 0"><span style="width:100px;font-size:0.8rem">Efectivo</span><div style="height:20px;background:#10b981;border-radius:3px;width:${total>0?Math.round((efectivo.reduce((a,v)=>a+v.monto,0)/total)*100):0}%"></div><span style="margin-left:6px;font-size:0.8rem">${total>0?Math.round((efectivo.reduce((a,v)=>a+v.monto,0)/total)*100):0}%</span></div>
      <div style="display:flex;align-items:center;margin:4px 0"><span style="width:100px;font-size:0.8rem">DÃ©bito</span><div style="height:20px;background:#3b82f6;border-radius:3px;width:${total>0?Math.round((debito.reduce((a,v)=>a+v.monto,0)/total)*100):0}%"></div><span style="margin-left:6px;font-size:0.8rem">${total>0?Math.round((debito.reduce((a,v)=>a+v.monto,0)/total)*100):0}%</span></div>
      <div style="display:flex;align-items:center;margin:4px 0"><span style="width:100px;font-size:0.8rem">CrÃ©dito</span><div style="height:20px;background:#f59e0b;border-radius:3px;width:${total>0?Math.round((credito.reduce((a,v)=>a+v.monto,0)/total)*100):0}%"></div><span style="margin-left:6px;font-size:0.8rem">${total>0?Math.round((credito.reduce((a,v)=>a+v.monto,0)/total)*100):0}%</span></div>
      <div style="display:flex;align-items:center;margin:4px 0"><span style="width:100px;font-size:0.8rem">Transferencia</span><div style="height:20px;background:#8b5cf6;border-radius:3px;width:${total>0?Math.round((0/total)*100):0}%"></div><span style="margin-left:6px;font-size:0.8rem">${total>0?Math.round((0/total)*100):0}%</span></div>
    </div>

    <div style="margin-top:16px;padding:12px 14px;background:#f0f4ff;border-radius:6px;font-size:0.82rem;color:#444;border-left:3px solid #1a56db;line-height:1.6">
      <strong>ConclusiÃ³n de esta secciÃ³n:</strong><br>
      El mÃ©todo de pago dominante en ${nombreMes} fue ${metodoTop.n} con ${metodoTop.c} transacciones (${ventas.length>0?Math.round((metodoTop.c/ventas.length)*100):0}% del total).<br>
      En tÃ©rminos de monto, Efectivo representÃ³ ${efectivo.reduce((a,v)=>a+v.monto,0).toLocaleString()}, DÃ©bito ${debito.reduce((a,v)=>a+v.monto,0).toLocaleString()}, CrÃ©dito ${credito.reduce((a,v)=>a+v.monto,0).toLocaleString()}<br>
      La distribuciÃ³n muestra las preferencias de los clientes y permite anticipar necesidades operativas.<br>
      Si el efectivo predomina, es importante mantener fondo de caja suficiente para dar cambio.<br>
      Las transferencias bancarias reducen el riesgo de manejo de efectivo aunque demoran en confirmarse.<br>
      Se sugiere monitorear mes a mes si algÃºn mÃ©todo crece o decrece para adaptar la infraestructura.<br>
      Considere ofrecer incentivos en mÃ©todos que desee promover segÃºn conveniencia del negocio.
    </div>
  </div>

  <!-- 3. DESGLOSE POR TIPO DOCUMENTO -->
  <div class="seccion">
    <h2>4. Desglose por Tipo de Documento</h2>
    <p style="font-size:0.85rem;color:#555;margin-bottom:14px;line-height:1.6">
      Esta secciÃ³n muestra la distribuciÃ³n de ventas segÃºn el tipo de documento tributario emitido.<br>
      Se clasifican en Boleta y Factura, indicando monto, cantidad y porcentaje de cada tipo.<br>
      Las boletas corresponden a ventas a consumidor final, mientras que las facturas se emiten a empresas.<br>
            Este anÃ¡lisis permite verificar el cumplimiento de obligaciones tributarias del negocio.<br>
            Utilice estos datos para preparar declaraciones de impuestos y auditorÃ­as internas.
    </p>
    <table>
      <tr><th>Tipo</th><th>Monto</th><th>Cantidad</th><th>%</th></tr>
      <tr><td>Boleta</td><td>$${boletas.reduce((a,v)=>a+v.monto,0).toLocaleString()}</td><td>${boletas.length}</td><td>${ventas.length>0?Math.round((boletas.length/ventas.length)*100):0}%</td></tr>
      <tr><td>Factura</td><td>$${facturas.reduce((a,v)=>a+v.monto,0).toLocaleString()}</td><td>${facturas.length}</td><td>${ventas.length>0?Math.round((facturas.length/ventas.length)*100):0}%</td></tr>
      
    </table>

    <div style="margin-top:16px;padding:12px 14px;background:#f0f4ff;border-radius:6px;font-size:0.82rem;color:#444;border-left:3px solid #1a56db;line-height:1.6">
      <strong>ConclusiÃ³n de esta secciÃ³n:</strong><br>
      Del total de ${ventas.length} ventas, se emitieron ${boletas.length} boletas (${ventas.length>0?Math.round((boletas.length/ventas.length)*100):0}%), ${facturas.length} facturas (${ventas.length>0?Math.round((facturas.length/ventas.length)*100):0}%) y ${0} sin documento (${ventas.length>0?Math.round((0/ventas.length)*100):0}%).<br>
      Las boletas generaron ${boletas.reduce((a,v)=>a+v.monto,0).toLocaleString()} y las facturas ${facturas.reduce((a,v)=>a+v.monto,0).toLocaleString()} en ingresos documentados.<br>
      ${0 > 0 ? 'Existen ' + 0 + ' ventas sin respaldo tributario, lo cual debe reducirse progresivamente.' : 'Todas las ventas cuentan con respaldo tributario, lo cual es Ã³ptimo.'}<br>
      El cumplimiento tributario es fundamental para evitar sanciones del SII y mantener la formalidad.<br>
      Se recomienda que toda venta, sin importar el monto, cuente con al menos una boleta como respaldo.<br>
      Las facturas son relevantes para clientes empresa y permiten recuperar IVA en compras corporativas.<br>
      Mantenga el registro formal de todas las ventas para cumplimiento tributario.
    </div>
  </div>

  <!-- 4. ANÃLISIS POR SEMANA -->
  <div class="seccion">
    <h2>5. AnÃ¡lisis por Semana</h2>
    <p style="font-size:0.85rem;color:#555;margin-bottom:14px;line-height:1.6">
      AquÃ­ se divide el mes en cuatro semanas para identificar en quÃ© perÃ­odo se concentran las ventas.<br>
      La Semana 1 comprende los dÃ­as 1 al 7, la Semana 2 del 8 al 14, la Semana 3 del 15 al 21 y la Semana 4 del 22 en adelante.<br>
      Para cada semana se muestra el monto total recaudado y su porcentaje respecto al ingreso mensual.<br>
      Este anÃ¡lisis permite detectar si las ventas se concentran a inicio, mitad o fin de mes.<br>
      Patrones como mayor venta en la primera semana pueden indicar compras post-sueldo de los clientes.<br>
      Identificar semanas dÃ©biles ayuda a planificar promociones o acciones comerciales especÃ­ficas.<br>
      Compare estos datos mes a mes para confirmar si los patrones semanales son consistentes.
    </p>
    <table>
      <tr><th>Semana</th><th>PerÃ­odo</th><th>Monto</th><th>% del Total</th></tr>
      <tr><td>Semana 1</td><td>DÃ­as 1-7</td><td>$${semanas[0].toLocaleString()}</td><td>${total>0?Math.round((semanas[0]/total)*100):0}%</td></tr>
      <tr><td>Semana 2</td><td>DÃ­as 8-14</td><td>$${semanas[1].toLocaleString()}</td><td>${total>0?Math.round((semanas[1]/total)*100):0}%</td></tr>
      <tr><td>Semana 3</td><td>DÃ­as 15-21</td><td>$${semanas[2].toLocaleString()}</td><td>${total>0?Math.round((semanas[2]/total)*100):0}%</td></tr>
      <tr><td>Semana 4</td><td>DÃ­as 22+</td><td>$${semanas[3].toLocaleString()}</td><td>${total>0?Math.round((semanas[3]/total)*100):0}%</td></tr>
    </table>

    <div style="margin-top:16px;padding:12px 14px;background:#f0f4ff;border-radius:6px;font-size:0.82rem;color:#444;border-left:3px solid #1a56db;line-height:1.6">
      <strong>ConclusiÃ³n de esta secciÃ³n:</strong><br>
      La semana con mayor recaudaciÃ³n alcanzÃ³ ${Math.max(...semanas).toLocaleString()}, representando ${total>0?Math.round((Math.max(...semanas)/total)*100):0}% del ingreso total.<br>
      DistribuciÃ³n: Semana 1 (${semanas[0].toLocaleString()}), Semana 2 (${semanas[1].toLocaleString()}), Semana 3 (${semanas[2].toLocaleString()}) y Semana 4 (${semanas[3].toLocaleString()}).<br>
      ${semanas[0] > semanas[3] ? 'Las ventas se concentran al inicio del mes, posiblemente por el ciclo de pago de sueldos.' : 'Las ventas se concentran hacia fin de mes, lo que puede indicar compras de reposiciÃ³n.'}<br>
      Una distribuciÃ³n equilibrada entre semanas indica estabilidad en la demanda del negocio.<br>
      Si alguna semana es significativamente baja, considere implementar promociones en ese perÃ­odo.<br>
      Monitorear este patrÃ³n mes a mes permite confirmar si es comportamiento estacional o puntual.<br>
      Use esta informaciÃ³n para planificar compras a proveedores y gestionar el flujo de caja semanal.
    </div>
  </div>

  <!-- 5. ANÃLISIS POR DÃA DE LA SEMANA -->
  <div class="seccion">
    <h2>6. AnÃ¡lisis por DÃ­a de la Semana</h2>
    <p style="font-size:0.85rem;color:#555;margin-bottom:14px;line-height:1.6">
      Esta secciÃ³n agrupa todas las ventas del mes segÃºn el dÃ­a de la semana en que se realizaron.<br>
      Se muestra el monto acumulado para cada dÃ­a (Lunes a Domingo) y su porcentaje del total mensual.<br>
      El dÃ­a con mayor recaudaciÃ³n se resalta en verde para identificarlo rÃ¡pidamente.<br>
      Este anÃ¡lisis revela los dÃ­as de mayor y menor actividad comercial de la bodega.<br>
      Conocer los dÃ­as fuertes permite optimizar la dotaciÃ³n de personal y el stock disponible.<br>
      Los dÃ­as dÃ©biles pueden aprovecharse para tareas administrativas, reposiciÃ³n o promociones.<br>
      Si un dÃ­a especÃ­fico es consistentemente bajo, considere ajustar horarios u ofertas especiales.
    </p>
    <table>
      <tr><th>DÃ­a</th><th>Monto Total</th><th>% del Total</th></tr>
      ${diasSemNombres.map((n,i) => `<tr${porDiaSem[i]===diaSemMax?' style="background:#d1fae5;font-weight:bold"':''}><td>${n}</td><td>$${porDiaSem[i].toLocaleString()}</td><td>${total>0?Math.round((porDiaSem[i]/total)*100):0}%</td></tr>`).join('')}
    </table>
    <p style="margin-top:8px"><strong>DÃ­a mÃ¡s activo:</strong> ${diaSemNombre}</p>

    <div style="margin-top:16px;padding:12px 14px;background:#f0f4ff;border-radius:6px;font-size:0.82rem;color:#444;border-left:3px solid #1a56db;line-height:1.6">
      <strong>ConclusiÃ³n de esta secciÃ³n:</strong><br>
      El dÃ­a de la semana con mayor actividad fue ${diaSemNombre}, acumulando ${diaSemMax.toLocaleString()} (${total>0?Math.round((diaSemMax/total)*100):0}% del total).<br>
      Este patrÃ³n indica que los clientes tienden a realizar sus compras principalmente los dÃ­as ${diaSemNombre}.<br>
      Los dÃ­as con menor recaudaciÃ³n representan oportunidades para implementar estrategias de atracciÃ³n.<br>
      Se recomienda reforzar el personal y el stock disponible en los dÃ­as de mayor demanda identificados.<br>
      En los dÃ­as mÃ¡s tranquilos, aproveche para realizar inventarios, limpieza y tareas administrativas.<br>
      Si este patrÃ³n se repite mes a mes, puede considerarse ajustar horarios de apertura segÃºn demanda.<br>
      Compare con meses anteriores para confirmar si ${diaSemNombre} es consistentemente el dÃ­a mÃ¡s fuerte.
    </div>
  </div>

  <!-- 6. MEJOR Y PEOR DÃA -->
  <div class="seccion">
    <h2>7. Mejor y Peor DÃ­a del Mes</h2>
    <p style="font-size:0.85rem;color:#555;margin-bottom:14px;line-height:1.6">
      Se identifican los dos dÃ­as extremos del mes: el de mayor y menor recaudaciÃ³n.<br>
      El mejor dÃ­a representa la jornada con mÃ¡s ingresos, posiblemente por eventos o demanda estacional.<br>
      El peor dÃ­a muestra la jornada con menor actividad, Ãºtil para investigar causas (feriados, clima).<br>
      La diferencia entre ambos indica la variabilidad de las ventas durante el mes.<br>
      Si la brecha es muy grande, el negocio depende de dÃ­as puntuales y deberÃ­a buscar mayor estabilidad.<br>
      Analizar quÃ© ocurriÃ³ en el mejor dÃ­a puede ayudar a replicar esas condiciones en el futuro.<br>
      Entender el peor dÃ­a permite tomar medidas preventivas para evitar jornadas improductivas.
    </p>
    <div class="kpi-grid" style="grid-template-columns:1fr 1fr">
      <div class="kpi" style="background:#d1fae5"><div class="num">$${mejorMonto.toLocaleString()}</div><div class="label">ðŸ† Mejor DÃ­a: ${mejorDia.split('-').reverse().join('/')}</div></div>
      <div class="kpi" style="background:#fee2e2"><div class="num">$${peorMonto.toLocaleString()}</div><div class="label">ðŸ“‰ Peor DÃ­a: ${peorDia.split('-').reverse().join('/')}</div></div>
    </div>

    <div style="margin-top:16px;padding:12px 14px;background:#f0f4ff;border-radius:6px;font-size:0.82rem;color:#444;border-left:3px solid #1a56db;line-height:1.6">
      <strong>ConclusiÃ³n de esta secciÃ³n:</strong><br>
      El mejor dÃ­a del mes fue el ${mejorDia.split('-').reverse().join('/')} con ${mejorMonto.toLocaleString()}, y el peor fue el ${peorDia.split('-').reverse().join('/')} con ${peorMonto.toLocaleString()}.<br>
      La diferencia entre ambos extremos es de ${(mejorMonto - peorMonto).toLocaleString()}, reflejando la variabilidad de ventas.<br>
      ${(mejorMonto - peorMonto) > promDiario * 2 ? 'La brecha es significativa, indicando dependencia de dÃ­as puntuales de alta demanda.' : 'La brecha es moderada, sugiriendo una demanda relativamente estable.'}<br>
      Investigue quÃ© factores contribuyeron al Ã©xito del mejor dÃ­a para intentar replicarlos.<br>
      Analice si el peor dÃ­a coincidiÃ³ con feriados, mal clima u otros factores externos.<br>
      El objetivo es reducir esta brecha logrando ventas mÃ¡s consistentes a lo largo del mes.<br>
      Establezca un piso mÃ­nimo de ventas diarias como meta y actÃºe cuando un dÃ­a caiga por debajo.
    </div>
  </div>

  <!-- 7. COMPARACIÃ“N CON MES ANTERIOR -->
  <div class="seccion">
    <h2>8. ComparaciÃ³n con Mes Anterior</h2>
    <p style="font-size:0.85rem;color:#555;margin-bottom:14px;line-height:1.6">
      Esta secciÃ³n compara el rendimiento del mes actual con el mes inmediatamente anterior.<br>
      Se contrastan el monto total recaudado y la cantidad de ventas realizadas en ambos perÃ­odos.<br>
      La columna de diferencia muestra el crecimiento o decrecimiento en porcentaje y unidades.<br>
      Un valor positivo (verde) indica mejora respecto al mes anterior; negativo (rojo) indica retroceso.<br>
      Esta comparaciÃ³n es fundamental para evaluar la tendencia del negocio mes a mes.<br>
      CaÃ­das significativas deben investigarse: pueden deberse a estacionalidad o competencia.<br>
      Crecimientos sostenidos confirman que las estrategias comerciales estÃ¡n funcionando correctamente.
    </p>
    <table>
      <tr><th>Indicador</th><th>${nombreMes}</th><th>Mes Anterior</th><th>Diferencia</th></tr>
      <tr><td>Total</td><td>$${total.toLocaleString()}</td><td>$${totalAnt.toLocaleString()}</td><td style="color:${diffPct>=0?'#065f46':'#c81e1e'};font-weight:bold">${diffPct>=0?'+':''}${diffPct}%</td></tr>
      <tr><td>Cantidad Ventas</td><td>${ventas.length}</td><td>${ventasAnt.length}</td><td>${ventas.length - ventasAnt.length >= 0 ? '+' : ''}${ventas.length - ventasAnt.length}</td></tr>
    </table>

    <div style="margin-top:16px;padding:12px 14px;background:#f0f4ff;border-radius:6px;font-size:0.82rem;color:#444;border-left:3px solid #1a56db;line-height:1.6">
      <strong>ConclusiÃ³n de esta secciÃ³n:</strong><br>
      ${diffPct >= 0 ? 'El mes de ' + nombreMes + ' mostrÃ³ un crecimiento del ' + diffPct + '% en ingresos respecto al mes anterior.' : 'El mes de ' + nombreMes + ' mostrÃ³ una caÃ­da del ' + Math.abs(diffPct) + '% en ingresos respecto al mes anterior.'}<br>
      En cantidad de transacciones, se pasÃ³ de ${ventasAnt.length} a ${ventas.length} ventas (${ventas.length - ventasAnt.length >= 0 ? '+' : ''}${ventas.length - ventasAnt.length} operaciones).<br>
      ${diffPct >= 0 ? 'Esta tendencia positiva debe mantenerse y potenciarse con las estrategias actuales.' : 'Se recomienda investigar las causas de la disminuciÃ³n y tomar medidas correctivas.'}<br>
      Factores como estacionalidad, dÃ­as hÃ¡biles y eventos especiales pueden influir en estas variaciones.<br>
      Compare al menos 3 meses consecutivos para identificar si es una tendencia o un evento aislado.<br>
      Establezca metas mensuales basadas en el promedio de los Ãºltimos 3 meses mÃ¡s un % de crecimiento.<br>
      El seguimiento mensual constante es la base para una gestiÃ³n financiera efectiva del negocio.
    </div>
  </div>

  ${mes2Data ? `
  <!-- COMPARACIÃ“N CON MES SELECCIONADO -->
  <div class="seccion" style="page-break-inside:auto">
    <h2>ComparaciÃ³n: ${nombreMes} vs ${mes2Data.nombreMes2}</h2>
    <p style="font-size:0.85rem;color:#555;margin-bottom:14px;line-height:1.6">
      Esta secciÃ³n compara el rendimiento entre los dos meses seleccionados.<br>
      Se contrastan los principales indicadores financieros para evaluar la evoluciÃ³n del negocio.<br>
      Los valores positivos (verde) indican mejora del mes principal respecto al mes comparado.<br>
      Los valores negativos (rojo) indican que el mes comparado tuvo mejor desempeÃ±o.<br>
      Esta comparaciÃ³n permite identificar tendencias y tomar decisiones informadas.<br>
      Analice las diferencias en cada indicador para entender quÃ© factores influyeron.<br>
      Use esta informaciÃ³n para establecer metas realistas para los prÃ³ximos meses.
    </p>
    <table>
      <tr><th>Indicador</th><th>${nombreMes}</th><th>${mes2Data.nombreMes2}</th><th>Diferencia</th></tr>
      <tr><td>Total Ingresos</td><td>$${total.toLocaleString()}</td><td>$${mes2Data.total2.toLocaleString()}</td><td style="color:${total >= mes2Data.total2 ? '#065f46' : '#c81e1e'};font-weight:bold">${total >= mes2Data.total2 ? '+' : ''}${mes2Data.diffTotal}%</td></tr>
      <tr><td>Cantidad de Ventas</td><td>${ventas.length}</td><td>${mes2Data.ventas2.length}</td><td style="color:${ventas.length >= mes2Data.ventas2.length ? '#065f46' : '#c81e1e'};font-weight:bold">${ventas.length >= mes2Data.ventas2.length ? '+' : ''}${ventas.length - mes2Data.ventas2.length}</td></tr>
      <tr><td>Promedio Diario</td><td>$${promDiario.toLocaleString()}</td><td>$${mes2Data.promDiario2.toLocaleString()}</td><td style="color:${promDiario >= mes2Data.promDiario2 ? '#065f46' : '#c81e1e'};font-weight:bold">${promDiario >= mes2Data.promDiario2 ? '+' : ''}$${(promDiario - mes2Data.promDiario2).toLocaleString()}</td></tr>
      <tr><td>DÃ­as con Ventas</td><td>${diasConVentas}</td><td>${mes2Data.diasConVentas2}</td><td>${diasConVentas - mes2Data.diasConVentas2 >= 0 ? '+' : ''}${diasConVentas - mes2Data.diasConVentas2}</td></tr>
      <tr><td>Ventas Efectivo</td><td>${efectivo.length}</td><td>${mes2Data.efectivo2.length}</td><td>${efectivo.length - mes2Data.efectivo2.length >= 0 ? '+' : ''}${efectivo.length - mes2Data.efectivo2.length}</td></tr>
      <tr><td>Ventas DÃ©bito</td><td>${debito.length}</td><td>${mes2Data.debito2.length}</td><td>${debito.length - mes2Data.debito2.length >= 0 ? '+' : ''}${debito.length - mes2Data.debito2.length}</td></tr>
      <tr><td>Ventas CrÃ©dito</td><td>${credito.length}</td><td>${mes2Data.credito2.length}</td><td>${credito.length - mes2Data.credito2.length >= 0 ? '+' : ''}${credito.length - mes2Data.credito2.length}</td></tr>
      <tr><td>Boletas</td><td>${boletas.length}</td><td>${mes2Data.boletas2.length}</td><td>${boletas.length - mes2Data.boletas2.length >= 0 ? '+' : ''}${boletas.length - mes2Data.boletas2.length}</td></tr>
      <tr><td>Facturas</td><td>${facturas.length}</td><td>${mes2Data.facturas2.length}</td><td>${facturas.length - mes2Data.facturas2.length >= 0 ? '+' : ''}${facturas.length - mes2Data.facturas2.length}</td></tr>
    </table>
    <div style="margin-top:12px;padding:12px 14px;background:#f0f4ff;border-radius:6px;font-size:0.82rem;color:#444;border-left:3px solid #1a56db;line-height:1.6">
      <strong>ConclusiÃ³n de esta secciÃ³n:</strong><br>
      ${mes2Data.diffTotal >= 0 ? nombreMes + ' superÃ³ a ' + mes2Data.nombreMes2 + ' en un ' + mes2Data.diffTotal + '% en ingresos totales.' : mes2Data.nombreMes2 + ' superÃ³ a ' + nombreMes + ' en un ' + Math.abs(mes2Data.diffTotal) + '% en ingresos totales.'}<br>
      En cantidad de operaciones, ${nombreMes} tuvo ${ventas.length} ventas vs ${mes2Data.ventas2.length} de ${mes2Data.nombreMes2}.<br>
      El promedio diario pasÃ³ de $${mes2Data.promDiario2.toLocaleString()} a $${promDiario.toLocaleString()} (${promDiario >= mes2Data.promDiario2 ? 'mejora' : 'retroceso'}).<br>
      ${diasConVentas >= mes2Data.diasConVentas2 ? 'Se trabajÃ³ mÃ¡s dÃ­as en ' + nombreMes + ', lo que contribuyÃ³ al resultado.' : 'Se trabajÃ³ menos dÃ­as en ' + nombreMes + ', lo que pudo afectar el resultado.'}<br>
      Analice los factores externos (estacionalidad, feriados, clima) que pudieron influir en las diferencias.<br>
      Use esta comparaciÃ³n para establecer metas realistas y estrategias de mejora continua.<br>
      Se recomienda comparar al menos 3 perÃ­odos para identificar tendencias confiables.
    </div>
  </div>
  ` : ''}

  <!-- RETIROS DE CAJA -->
  <div class="seccion" style="page-break-inside:auto">
    <h2>9. Retiros de Caja</h2>
    <p style="font-size:0.85rem;color:#555;margin-bottom:14px;line-height:1.6">
      Registro de todos los retiros de efectivo realizados durante el mes.<br>
      Los retiros corresponden a entregas de dinero desde la caja hacia los propietarios del negocio.<br>
      Se detalla el monto, destinatario, fecha, hora y operador que realizÃ³ cada retiro.<br>
      Esta informaciÃ³n permite llevar un control preciso del efectivo que sale de la caja.<br>
      El saldo neto (ventas - retiros) indica cuÃ¡nto dinero deberÃ­a quedar fÃ­sicamente en caja.<br>
      Mantenga un registro consistente de retiros para evitar descuadres al cierre del dÃ­a.<br>
      Compare el total de retiros con el total de ventas en efectivo para verificar coherencia.
    </p>
    <div class="kpi-grid" style="grid-template-columns:1fr 1fr 1fr;margin-bottom:16px">
      <div class="kpi"><div class="num">${retirosMes.length}</div><div class="label">Total Retiros</div></div>
      <div class="kpi"><div class="num">$${totalRetirosMes.toLocaleString()}</div><div class="label">Monto Retirado</div></div>
      <div class="kpi"><div class="num">$${(total - totalRetirosMes).toLocaleString()}</div><div class="label">Ingreso Neto</div></div>
    </div>
    ${retirosMes.length > 0 ? '<table><tr><th>#</th><th>Fecha</th><th>Hora</th><th>Monto</th><th>Entregar a</th><th>Quien retira</th><th>Nota</th></tr>' + retirosMes.map((r,i) => '<tr><td>' + (i+1) + '</td><td>' + r.fecha.split('-').reverse().join('/') + '</td><td>' + r.hora + '</td><td style="color:#c81e1e;font-weight:bold">-$' + r.monto.toLocaleString() + '</td><td>' + r.destinatario + '</td><td>' + (r.quienRetira||r.operador) + '</td><td>' + (r.nota||'-') + '</td></tr>').join('') + '</table>' : '<p style="text-align:center;color:#888">No se registraron retiros en este mes</p>'}
    <div style="margin-top:12px;padding:12px 14px;background:#f0f4ff;border-radius:6px;font-size:0.82rem;color:#444;border-left:3px solid #1a56db;line-height:1.6">
      <strong>ConclusiÃ³n de esta secciÃ³n:</strong><br>
      Durante ${nombreMes} se realizaron ${retirosMes.length} retiros de caja por un total de $${totalRetirosMes.toLocaleString()}.<br>
      El ingreso neto del mes (ventas menos retiros) fue de $${(total - totalRetirosMes).toLocaleString()}.<br>
      ${retirosMes.length > 0 ? 'El retiro promedio fue de $' + Math.round(totalRetirosMes / retirosMes.length).toLocaleString() + ' por operaciÃ³n.' : 'No se registraron retiros durante este perÃ­odo.'}<br>
      Los retiros representan el ${total > 0 ? Math.round((totalRetirosMes/total)*100) : 0}% del total de ventas del mes.<br>
      Es importante que cada retiro quede documentado para mantener la trazabilidad del efectivo.<br>
      Verifique que el saldo fÃ­sico en caja coincida con el saldo calculado por el sistema.<br>
      Un control riguroso de retiros previene descuadres y facilita la rendiciÃ³n de cuentas.
    </div>
  </div>

  <!-- 9. HORARIOS PICO -->
  <div class="seccion" style="page-break-inside:auto">
    <h2>10. Horarios Pico de Ventas</h2>
    <p style="font-size:0.85rem;color:#555;margin-bottom:14px;line-height:1.6">
      Esta secciÃ³n analiza en quÃ© horas del dÃ­a se concentran las ventas del mes.<br>
      Se muestra el monto acumulado y la cantidad de transacciones para cada franja horaria.<br>
      Identificar los horarios pico permite optimizar la atenciÃ³n al cliente y la dotaciÃ³n de personal.<br>
      Las horas con baja actividad pueden aprovecharse para tareas administrativas o reposiciÃ³n.<br>
      El grÃ¡fico de barras visualiza rÃ¡pidamente las horas de mayor y menor movimiento.<br>
      Esta informaciÃ³n es clave para definir horarios de apertura y cierre Ã³ptimos.<br>
      Compare con meses anteriores para confirmar si los patrones horarios son consistentes.
    </p>
    <table>
      <tr><th>Hora</th><th>Monto</th><th>Ventas</th><th>Barra</th></tr>
      ${porHora.map((m, i) => {
        if (ventasPorHora[i] === 0) return '';
        const pct = horaMax > 0 ? Math.round((m / horaMax) * 100) : 0;
        return '<tr' + (i === horaPico ? ' style="background:#d1fae5;font-weight:bold"' : '') + '><td>' + String(i).padStart(2,'0') + ':00 - ' + String(i).padStart(2,'0') + ':59</td><td>$' + m.toLocaleString() + '</td><td>' + ventasPorHora[i] + '</td><td><div style="height:14px;background:#1a56db;border-radius:3px;width:' + pct + '%"></div></td></tr>';
      }).filter(r => r).join('')}
    </table>
    <p style="margin-top:8px"><strong>Hora pico:</strong> ${String(horaPico).padStart(2,'0')}:00 - ${String(horaPico).padStart(2,'0')}:59 con $${horaMax.toLocaleString()} en ventas</p>
    <div style="margin-top:12px;padding:12px 14px;background:#f0f4ff;border-radius:6px;font-size:0.82rem;color:#444;border-left:3px solid #1a56db;line-height:1.6">
      <strong>ConclusiÃ³n de esta secciÃ³n:</strong><br>
      La hora con mayor actividad fue las ${String(horaPico).padStart(2,'0')}:00, acumulando $${horaMax.toLocaleString()} en ventas.<br>
      ${ventasPorHora[horaPico]} transacciones se realizaron en esa franja horaria durante todo el mes.<br>
      Los horarios con mayor movimiento deben contar con personal suficiente para atender la demanda.<br>
      Las horas sin ventas registradas indican perÃ­odos donde el local podrÃ­a estar cerrado o sin clientes.<br>
      Si hay ventas concentradas en pocas horas, considere extender horarios o crear incentivos fuera de pico.<br>
      Conocer los horarios pico tambiÃ©n ayuda a planificar los horarios de colaciÃ³n del personal.<br>
      Use esta informaciÃ³n para decidir si conviene abrir mÃ¡s temprano o cerrar mÃ¡s tarde segÃºn la demanda real.
    </div>
  </div>

  <!-- 10. GRÃFICO DE TENDENCIA DIARIA -->
  <div class="seccion" style="page-break-inside:auto">
    <h2>11. GrÃ¡fico de Tendencia Diaria</h2>
    <p style="font-size:0.85rem;color:#555;margin-bottom:14px;line-height:1.6">
      VisualizaciÃ³n grÃ¡fica de la evoluciÃ³n de ventas dÃ­a a dÃ­a durante el mes.<br>
      Cada barra representa el monto total vendido en un dÃ­a especÃ­fico del mes.<br>
      La lÃ­nea punteada indica el promedio diario como referencia visual.<br>
      Los dÃ­as por encima del promedio se muestran en azul oscuro, los que estÃ¡n por debajo en azul claro.<br>
      Este grÃ¡fico permite identificar rÃ¡pidamente tendencias, picos y caÃ­das en las ventas.<br>
      Es Ãºtil para detectar patrones como caÃ­das de fin de semana o picos a inicio de mes.<br>
      Compare visualmente con el grÃ¡fico del mes anterior para evaluar la evoluciÃ³n del negocio.
    </p>
    <div style="display:flex;align-items:flex-end;gap:2px;height:180px;border-bottom:2px solid #333;padding-bottom:4px;margin-bottom:8px">
      ${diasOrdenados.map(([dia, monto]) => {
        const pct = mejorMonto > 0 ? Math.round((monto / mejorMonto) * 100) : 0;
        const color = monto >= promDiario ? '#1a56db' : '#93c5fd';
        const d = dia.slice(8,10);
        return '<div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;height:100%"><div style="width:100%;background:' + color + ';border-radius:3px 3px 0 0;height:' + pct + '%;min-height:2px" title="' + dia + ': $' + monto.toLocaleString() + '"></div><span style="font-size:7px;margin-top:2px">' + d + '</span></div>';
      }).join('')}
    </div>
    <div style="display:flex;align-items:center;gap:12px;font-size:0.75rem;color:#555;margin-top:4px">
      <div><span style="display:inline-block;width:12px;height:12px;background:#1a56db;border-radius:2px;vertical-align:middle;margin-right:4px"></span>Sobre promedio</div>
      <div><span style="display:inline-block;width:12px;height:12px;background:#93c5fd;border-radius:2px;vertical-align:middle;margin-right:4px"></span>Bajo promedio</div>
      <div>Promedio diario: $${promDiario.toLocaleString()}</div>
    </div>
    <div style="margin-top:12px;padding:12px 14px;background:#f0f4ff;border-radius:6px;font-size:0.82rem;color:#444;border-left:3px solid #1a56db;line-height:1.6">
      <strong>ConclusiÃ³n de esta secciÃ³n:</strong><br>
      El grÃ¡fico muestra la evoluciÃ³n de ventas durante los ${diasConVentas} dÃ­as operativos del mes.<br>
      El promedio diario fue de $${promDiario.toLocaleString()}, representado como lÃ­nea de referencia.<br>
      ${diasOrdenados.filter(([,m]) => m >= promDiario).length} dÃ­as superaron el promedio (barras azul oscuro) y ${diasOrdenados.filter(([,m]) => m < promDiario).length} quedaron por debajo (azul claro).<br>
      El dÃ­a mÃ¡s alto alcanzÃ³ $${mejorMonto.toLocaleString()} y el mÃ¡s bajo $${peorMonto.toLocaleString()}.<br>
      Una tendencia ascendente indica crecimiento progresivo; descendente sugiere pÃ©rdida de impulso.<br>
      Los picos aislados pueden corresponder a eventos especiales, promociones o dÃ­as de alta demanda estacional.<br>
      Utilice este grÃ¡fico para planificar acciones comerciales en los perÃ­odos de menor actividad.
    </div>
  </div>

    <!-- 11. DETALLE DIARIO RESUMIDO -->
  <div class="seccion">
    <h2>12. Detalle Diario Resumido</h2>
    <p style="font-size:0.85rem;color:#555;margin-bottom:14px;line-height:1.6">
      Tabla con el resumen de ventas dÃ­a por dÃ­a durante todo el mes analizado.<br>
      Para cada fecha se muestra el monto total recaudado y la cantidad de transacciones realizadas.<br>
      Los dÃ­as sin registro no aparecen en la tabla, indicando jornadas sin actividad comercial.<br>
      Este detalle permite identificar patrones diarios, dÃ­as atÃ­picos o irregularidades en el registro.<br>
      Es Ãºtil para cruzar informaciÃ³n con otros registros como inventario o asistencia del personal.<br>
      Los dÃ­as con montos inusualmente altos o bajos merecen revisiÃ³n para entender sus causas.<br>
      Utilice esta tabla como respaldo para conciliaciones bancarias y cuadraturas de caja diarias.
    </p>
    <table>
      <tr><th>Fecha</th><th>Monto</th><th>Ventas</th></tr>
      ${diasOrdenados.map(([dia, monto]) => {
        const cantDia = ventas.filter(v => v.fecha === dia).length;
        return `<tr><td>${dia.split('-').reverse().join('/')}</td><td>$${monto.toLocaleString()}</td><td>${cantDia}</td></tr>`;
      }).join('')}
    </table>

    <div style="margin-top:16px;padding:12px 14px;background:#f0f4ff;border-radius:6px;font-size:0.82rem;color:#444;border-left:3px solid #1a56db;line-height:1.6">
      <strong>ConclusiÃ³n de esta secciÃ³n:</strong><br>
      Se registraron ventas en ${diasConVentas} dÃ­as del mes, con ingreso total de ${total.toLocaleString()} y promedio de ${promDiario.toLocaleString()} por dÃ­a.<br>
      El dÃ­a mÃ¡s productivo generÃ³ ${mejorMonto.toLocaleString()} y el menos productivo ${peorMonto.toLocaleString()}.<br>
      ${diasConVentas < 25 ? 'Hubo ' + (30 - diasConVentas) + ' dÃ­as sin ventas, lo que podrÃ­a indicar dÃ­as de cierre o falta de registro.' : 'La cobertura de dÃ­as con ventas es alta, indicando operaciÃ³n regular del negocio.'}<br>
      Los dÃ­as con montos superiores al promedio representan oportunidades para entender quÃ© genera mayor demanda.<br>
      Los dÃ­as por debajo del promedio deben analizarse para identificar si son patrones o situaciones puntuales.<br>
      Esta tabla es Ãºtil para la cuadratura diaria de caja y para detectar posibles omisiones en el registro.<br>
      Mantenga un registro consistente todos los dÃ­as para que este anÃ¡lisis sea cada vez mÃ¡s preciso.
    </div>
  </div>

  <!-- 12. DETALLE COMPLETO -->
  <div class="seccion">
    <h2>13. Detalle Completo de Ventas</h2>
    <p style="font-size:0.85rem;color:#555;margin-bottom:14px;line-height:1.6">
      Listado exhaustivo de cada transacciÃ³n individual registrada durante el mes.<br>
      Cada fila incluye: nÃºmero correlativo, fecha, hora, monto, mÃ©todo de pago y tipo de documento.<br>
      Este es el registro mÃ¡s detallado disponible y sirve como respaldo documental completo.<br>
      Permite verificar transacciones especÃ­ficas en caso de reclamos, devoluciones o auditorÃ­as.<br>
      La hora de registro ayuda a identificar los horarios de mayor actividad durante el dÃ­a.<br>
      Si detecta registros duplicados o montos incorrectos, puede corregirlos desde el mÃ³dulo de caja.<br>
      Este detalle es equivalente al libro de ventas diario y puede usarse para fines contables y tributarios.
    </p>
    <table>
      <tr><th>#</th><th>Fecha</th><th>Hora</th><th>Monto</th><th>MÃ©todo</th><th>Documento</th></tr>
      ${ventas.map((v,i) => `<tr><td>${i+1}</td><td>${v.fecha.split('-').reverse().join('/')}</td><td>${v.hora||'-'}</td><td>$${v.monto.toLocaleString()}</td><td>${v.metodo}</td><td>${v.tipoDoc||'-'}</td></tr>`).join('')}
    </table>

    <div style="margin-top:16px;padding:12px 14px;background:#f0f4ff;border-radius:6px;font-size:0.82rem;color:#444;border-left:3px solid #1a56db;line-height:1.6">
      <strong>ConclusiÃ³n de esta secciÃ³n:</strong><br>
      Se registraron ${ventas.length} transacciones individuales durante ${nombreMes} por un total de ${total.toLocaleString()}.<br>
      El monto promedio por transacciÃ³n fue de ${ventas.length > 0 ? Math.round(total/ventas.length).toLocaleString() : 0}, reflejando el ticket promedio del negocio.<br>
      El mÃ©todo de pago mÃ¡s frecuente fue ${metodoTop.n} con ${metodoTop.c} operaciones registradas.<br>
      Este listado constituye el respaldo completo de todas las operaciones y tiene valor legal y contable.<br>
      En caso de discrepancias con el banco o con clientes, este detalle permite rastrear cada transacciÃ³n.<br>
      Se recomienda verificar que todas las ventas tengan hora registrada para un control mÃ¡s preciso.<br>
      Conserve este informe como archivo histÃ³rico para futuras auditorÃ­as o consultas administrativas.
    </div>
  </div>

  <!-- 13. CONCLUSIÃ“N -->
  <div class="seccion">
    <h2>14. ConclusiÃ³n y Recomendaciones</h2>
    <div class="conclusion">
      ${generarConclusionAleatoria(nombreMes, total, ventas, metodoTop, mejorDia, mejorMonto, peorDia, peorMonto, promDiario, diasConVentas, diffPct, diaSemNombre, semanas, boletas, facturas, efectivo, debito, credito)}
    </div>
    ${mes2Data ? `
    <div style="margin-top:20px;padding:16px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px">
      <h3 style="color:#1a56db;margin-bottom:10px;font-size:1rem">ConclusiÃ³n Comparativa: ${nombreMes} vs ${mes2Data.nombreMes2}</h3>
      <p style="font-size:0.9rem;line-height:1.7">
        ${mes2Data.diffTotal >= 0 
          ? 'El mes de ' + nombreMes + ' superÃ³ a ' + mes2Data.nombreMes2 + ' en un <strong>' + mes2Data.diffTotal + '%</strong> en ingresos totales, pasando de $' + mes2Data.total2.toLocaleString() + ' a $' + total.toLocaleString() + '.'
          : 'El mes de ' + mes2Data.nombreMes2 + ' fue superior a ' + nombreMes + ' en un <strong>' + Math.abs(mes2Data.diffTotal) + '%</strong> en ingresos, con $' + mes2Data.total2.toLocaleString() + ' vs $' + total.toLocaleString() + '.'}<br>
        En volumen de operaciones, ${nombreMes} registrÃ³ ${ventas.length} ventas mientras que ${mes2Data.nombreMes2} tuvo ${mes2Data.ventas2.length} (diferencia de ${ventas.length - mes2Data.ventas2.length >= 0 ? '+' : ''}${ventas.length - mes2Data.ventas2.length}).<br>
        El promedio diario ${promDiario >= mes2Data.promDiario2 ? 'mejorÃ³' : 'disminuyÃ³'}, pasando de $${mes2Data.promDiario2.toLocaleString()} a $${promDiario.toLocaleString()} por dÃ­a.<br>
        ${diasConVentas >= mes2Data.diasConVentas2 ? 'Se operÃ³ mÃ¡s dÃ­as en ' + nombreMes + ' (' + diasConVentas + ' vs ' + mes2Data.diasConVentas2 + '), lo que contribuyÃ³ al resultado.' : 'Se operÃ³ menos dÃ­as en ' + nombreMes + ' (' + diasConVentas + ' vs ' + mes2Data.diasConVentas2 + '), lo que pudo afectar negativamente.'}<br>
        <strong>RecomendaciÃ³n:</strong> ${mes2Data.diffTotal >= 0 ? 'Mantener las estrategias que generaron el crecimiento y buscar consolidar la tendencia positiva en los prÃ³ximos meses.' : 'Investigar las causas de la caÃ­da (estacionalidad, competencia, dÃ­as no operativos) y definir acciones correctivas para recuperar el nivel de ' + mes2Data.nombreMes2 + '.'}
      </p>
    </div>
    ` : ''}
  </div>

  <div class="footer">Bodega A&amp;M â€” Informe generado automÃ¡ticamente el ${fechaGen}</div>
  </body></html>`;

  if (window.require) {
    const { ipcRenderer } = window.require('electron');
    if (guardarEnEscritorio) {
      ipcRenderer.send('guardarInformePDF', html);
      ipcRenderer.once('informe-guardado', (event, ruta) => {
        showToast('âœ” Informe guardado en: ' + ruta);
      });
      ipcRenderer.once('informe-error', (event, err) => {
        showToast('Error al guardar: ' + err, true);
      });
    } else {
      ipcRenderer.send('vistaPreviewPDF', html);
    }
  }
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// â”€â”€ Pegar desde Laudus â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function procesarPegadoLaudus() {
  const texto = document.getElementById('laudusTexto').value.trim();
  if (!texto) { showToast('Pega el texto de Laudus primero', true); return; }

  // Parse tab-separated text from Laudus
  const lineas = texto.split('\n').filter(l => l.trim());
  
  // Skip header line if present
  let inicio = 0;
  if (lineas[0] && (lineas[0].includes('PRODUCTO') || lineas[0].includes('DESCRIPCI'))) {
    inicio = 1;
  }

  let productosAgregados = 0;
  let noEncontrados = [];

  for (let i = inicio; i < lineas.length; i++) {
    const cols = lineas[i].split('\t');
    if (cols.length < 3) continue;

    const codigoLaudus = cols[0].trim();
    const descripcion = cols[1].trim();
    const cantidadStr = cols[2].trim().replace(',', '.');
    const cantidad = parseFloat(cantidadStr) || 1;

    // Buscar en catÃ¡logo ignorando ceros a la izquierda
    const codigoSinCeros = codigoLaudus.replace(/^0+/, '');
    const encontrado = catalogo.find(p => {
      const codCat = p.codigo.replace(/^0+/, '');
      return p.codigo === codigoLaudus || codCat === codigoSinCeros || p.codigo === codigoSinCeros;
    });

    if (encontrado) {
      productos.push({
        codigo: encontrado.codigo,
        descripcion: encontrado.nombre,
        unidad: encontrado.unidad || 'unidad',
        cantidad: cantidad,
        cantPalabras: numeroAPalabras(cantidad)
      });
      productosAgregados++;
    } else {
      // Agregar con datos de Laudus directamente
      productos.push({
        codigo: codigoLaudus,
        descripcion: descripcion,
        unidad: 'unidad',
        cantidad: cantidad,
        cantPalabras: numeroAPalabras(cantidad)
      });
      productosAgregados++;
      noEncontrados.push(codigoLaudus + ' - ' + descripcion);
    }
  }

  renderTabla();
  document.getElementById('modalPegarLaudus').style.display = 'none';
  document.getElementById('laudusTexto').value = '';

  if (productosAgregados > 0) {
    let msg = 'âœ” ' + productosAgregados + ' productos cargados desde Laudus';
    if (noEncontrados.length > 0) {
      msg += ' (' + noEncontrados.length + ' no estaban en catÃ¡logo)';
    }
    showToast(msg);
  } else {
    showToast('No se pudieron cargar productos. Verifica el formato.', true);
  }
}

// Fix modal display
document.getElementById('btnPegarLaudus').addEventListener('click', () => {
  navigator.clipboard.readText().then(text => {
    if (!text || !text.trim()) { showToast('No hay texto en el portapapeles', true); return; }
    document.getElementById('laudusTexto').value = text;
    procesarPegadoLaudus();
  }).catch(() => {
    // Fallback: abrir modal si no se puede leer portapapeles
    document.getElementById('modalPegarLaudus').style.display = 'flex';
    document.getElementById('laudusTexto').value = '';
    showToast('Pega con Ctrl+V y presiona Cargar', true);
  });
});


// â”€â”€ PANEL DE DIAGNÃ“STICOS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

// â”€â”€ Vista Previa antes de registrar â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function mostrarVistaPrevia(tipoDoc, nroDoc, cliente, prods, esEdicion) {
  return new Promise((resolve) => {
    const listaProds = prods.map((p, i) => `<tr><td>${i+1}</td><td>${p.codigo||'-'}</td><td>${p.descripcion}</td><td>${p.unidad}</td><td>${p.cantidad}</td></tr>`).join('');
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.style.display = 'flex';
    overlay.innerHTML = `
      <div class="modal" style="max-width:500px">
        <div class="modal-header">
          <h3>${esEdicion ? 'Â¿Guardar cambios?' : 'Â¿Confirmar esta orden?'}</h3>
          <button class="modal-close" id="prevCerrar">âœ•</button>
        </div>
        <div class="modal-body" style="padding:16px">
          <div class="detail-row"><strong>Cliente:</strong> ${cliente}</div>
          <div class="detail-row"><strong>Tipo Doc.:</strong> ${tipoDoc || '-'}</div>
          ${nroDoc ? `<div class="detail-row"><strong>NÂ° Doc.:</strong> ${nroDoc}</div>` : ''}
          <div class="detail-row" style="margin-top:12px"><strong>Productos (${prods.length}):</strong></div>
          <table style="margin-top:8px;font-size:0.85rem">
            <thead><tr><th>#</th><th>CÃ³digo</th><th>DescripciÃ³n</th><th>Unid.</th><th>Cant.</th></tr></thead>
            <tbody>${listaProds}</tbody>
          </table>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" id="prevCancelar">Cancelar</button>
          <button class="btn-primary" id="prevConfirmar">âœ” ${esEdicion ? 'Guardar' : 'Confirmar'}</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    overlay.querySelector('#prevConfirmar').addEventListener('click', () => { overlay.remove(); resolve(true); });
    overlay.querySelector('#prevCancelar').addEventListener('click', () => { overlay.remove(); resolve(false); });
    overlay.querySelector('#prevCerrar').addEventListener('click', () => { overlay.remove(); resolve(false); });
    overlay.addEventListener('click', (e) => { if (e.target === overlay) { overlay.remove(); resolve(false); } });
  });
}

// â”€â”€ Error Logger â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
let diagErrores = [];
const DIAG_MAX_ERRORES = 50;

function diagRegistrarError(mensaje, tipo = 'general') {
  const error = {
    timestamp: Date.now(),
    mensaje: mensaje,
    tipo: tipo,
    resuelto: false
  };
  diagErrores.unshift(error);
  if (diagErrores.length > DIAG_MAX_ERRORES) {
    diagErrores.pop();
  }
}

function diagLimpiarErrores() {
  diagErrores = [];
}

function diagMarcarResueltos(tipo) {
  diagErrores.forEach(e => {
    if (e.tipo === tipo && !e.resuelto) e.resuelto = true;
  });
}

// â”€â”€ Firebase Connection Monitor â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
let diagUltimaSync = null;
let diagConectado = navigator.onLine;

function diagMedirLatencia() {
  const inicio = performance.now();
  return fbCargar('config').then(() => {
    const fin = performance.now();
    diagUltimaSync = Date.now();
    diagConectado = true;
    diagMarcarResueltos('network');
    return Math.round(fin - inicio);
  }).catch(err => {
    diagConectado = false;
    diagRegistrarError('Error de conexiÃ³n: ' + err.message, 'network');
    return null;
  });
}

async function diagActualizarConexion() {
  const estadoEl = document.getElementById('diagConexionEstado');
  const latenciaEl = document.getElementById('diagLatencia');
  const syncEl = document.getElementById('diagUltimaSync');
  if (!estadoEl) return;

  const latencia = await diagMedirLatencia();
  if (latencia !== null) {
    estadoEl.textContent = 'Conectado';
    estadoEl.style.background = '#d1fae5';
    estadoEl.style.color = '#065f46';
    latenciaEl.textContent = latencia + ' ms';
  } else {
    estadoEl.textContent = 'Desconectado';
    estadoEl.style.background = '#fee2e2';
    estadoEl.style.color = '#991b1b';
    latenciaEl.textContent = 'â€”';
  }
  if (diagUltimaSync) {
    syncEl.textContent = diagFormatearFecha(diagUltimaSync);
  }
}

// â”€â”€ Storage Calculator â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const DIAG_TAMANO_PROMEDIO = {
  historial: 2048,
  catalogo: 512,
  clientes: 256,
  recepciones: 1024,
  usuarios: 384
};

async function diagCalcularAlmacenamiento() {
  const colecciones = ['historial', 'catalogo', 'clientes', 'recepciones', 'usuarios'];
  const resultados = {};
  let totalBytes = 0;

  for (const col of colecciones) {
    try {
      const docs = await fbCargar(col);
      const count = docs.length;
      const estimatedBytes = count * (DIAG_TAMANO_PROMEDIO[col] || 512);
      resultados[col] = { count, estimatedBytes };
      totalBytes += estimatedBytes;
    } catch (e) {
      resultados[col] = { count: 0, estimatedBytes: 0, error: true };
    }
  }

  const totalMB = totalBytes / (1024 * 1024);
  const porcentaje = Math.min((totalMB / 1024) * 100, 100);

  return { colecciones: resultados, totalMB, porcentaje };
}

async function diagActualizarStorage() {
  const gridEl = document.getElementById('diagStorageGrid');
  const fillEl = document.getElementById('diagProgressFill');
  const textEl = document.getElementById('diagStorageText');
  const warnEl = document.getElementById('diagStorageWarning');
  if (!gridEl) return;

  try {
    const datos = await diagCalcularAlmacenamiento();

    // Render grid
    let html = '';
    for (const [col, info] of Object.entries(datos.colecciones)) {
      const kb = (info.estimatedBytes / 1024).toFixed(1);
      const estado = info.error ? '<span style="color:#e53e3e">Error</span>' : `${info.count} docs (~${kb} KB)`;
      html += `<div class="field"><label>${col}</label><span>${estado}</span></div>`;
    }
    gridEl.innerHTML = html;

    // Progress bar
    fillEl.style.width = datos.porcentaje.toFixed(1) + '%';
    if (datos.porcentaje > 80) {
      fillEl.style.background = '#e53e3e';
    } else if (datos.porcentaje > 60) {
      fillEl.style.background = '#f59e0b';
    } else {
      fillEl.style.background = '#1a56db';
    }
    textEl.textContent = datos.totalMB.toFixed(2) + ' MB / 1024 MB (' + datos.porcentaje.toFixed(1) + '%)';

    // Warning
    warnEl.style.display = datos.porcentaje > 80 ? '' : 'none';
  } catch (e) {
    gridEl.innerHTML = '<p class="empty-msg">Error al calcular almacenamiento</p>';
  }
}

// â”€â”€ System Info â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
async function diagObtenerInfoSistema() {
  if (window.require) {
    try {
      const { ipcRenderer } = window.require('electron');
      return await ipcRenderer.invoke('get-system-info');
    } catch (e) {
      return null;
    }
  }
  return null;
}

async function diagActualizarSistema() {
  const versionEl = document.getElementById('diagVersion');
  const osEl = document.getElementById('diagOS');
  const usuarioEl = document.getElementById('diagUsuario');
  const memoriaEl = document.getElementById('diagMemoria');
  if (!versionEl) return;

  // VersiÃ³n
  const verEl = document.getElementById('appVersion');
  versionEl.textContent = verEl ? verEl.textContent || 'N/A' : 'N/A';

  // Usuario activo
  usuarioEl.textContent = usuarioActivo ? `${usuarioActivo.nombre} (${usuarioActivo.rol})` : 'N/A';

  // Info del sistema via IPC
  const info = await diagObtenerInfoSistema();
  if (info) {
    osEl.textContent = `${info.platform} ${info.release}`;
    memoriaEl.textContent = info.memoryUsage + ' MB';
  } else {
    osEl.textContent = 'No disponible';
    memoriaEl.textContent = 'No disponible';
  }
}

// â”€â”€ Session Duration â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
let diagInicioSesion = null;

function diagCalcularDuracionSesion(inicioTimestamp, ahoraTimestamp) {
  const diffMs = ahoraTimestamp - inicioTimestamp;
  const totalMinutos = Math.floor(diffMs / 60000);
  const horas = Math.floor(totalMinutos / 60);
  const minutos = totalMinutos % 60;
  return { horas, minutos, texto: `${horas}h ${minutos}m` };
}

function diagActualizarSesion() {
  const sesionEl = document.getElementById('diagSesion');
  if (!sesionEl) return;
  if (diagInicioSesion) {
    const duracion = diagCalcularDuracionSesion(diagInicioSesion, Date.now());
    sesionEl.textContent = duracion.texto;
  } else {
    sesionEl.textContent = 'â€”';
  }
}

// â”€â”€ Timestamp Formatter â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function diagFormatearFecha(timestamp) {
  const d = new Date(timestamp);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${dd}/${mm}/${yyyy} ${hh}:${min}:${ss}`;
}

// â”€â”€ Periodic Refresh Controller â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
let diagIntervalConexion = null;
let diagIntervalStorage = null;
let diagIntervalSesion = null;

function diagIniciarIntervalos() {
  diagDetenerIntervalos();
  diagIntervalConexion = setInterval(diagActualizarConexion, 30000);
  diagIntervalStorage = setInterval(diagActualizarStorage, 300000);
  diagIntervalSesion = setInterval(diagActualizarSesion, 60000);
}

function diagDetenerIntervalos() {
  if (diagIntervalConexion) { clearInterval(diagIntervalConexion); diagIntervalConexion = null; }
  if (diagIntervalStorage) { clearInterval(diagIntervalStorage); diagIntervalStorage = null; }
  if (diagIntervalSesion) { clearInterval(diagIntervalSesion); diagIntervalSesion = null; }
}

// â”€â”€ Main Refresh Orchestrator â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
async function diagnosticosRefresh() {
  try {
    await diagActualizarConexion();
  } catch (e) {}
  try {
    await diagActualizarStorage();
  } catch (e) {}
  try {
    await diagActualizarSistema();
  } catch (e) {}
  diagActualizarSesion();
  diagRenderErrores();
}

function diagRenderErrores() {
  const listEl = document.getElementById('diagErrorList');
  if (!listEl) return;

  if (diagErrores.length === 0) {
    listEl.innerHTML = '<p class="empty-msg">Sin errores registrados</p>';
    return;
  }

  listEl.innerHTML = diagErrores.map(e => {
    const fecha = diagFormatearFecha(e.timestamp);
    const resueltoCls = e.resuelto ? ' style="opacity:0.5"' : '';
    return `<div class="diag-error-item"${resueltoCls}>
      <div class="diag-error-time">${fecha}</div>
      <div class="diag-error-tipo">${e.tipo}</div>
      <div>${e.mensaje}</div>
    </div>`;
  }).join('');
}

// â”€â”€ Button Event Listeners â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
document.getElementById('btnLimpiarErrores').addEventListener('click', () => {
  diagLimpiarErrores();
  diagRenderErrores();
});

document.getElementById('btnActualizarDiag').addEventListener('click', () => {
  diagnosticosRefresh();
});

// â”€â”€ Global Error Interception â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
window.addEventListener('unhandledrejection', (event) => {
  diagRegistrarError('Promise: ' + event.reason, 'general');
});

// Wrap Firebase functions for error capture
(function() {
  if (typeof window.fbCargar === 'function') {
    const originalFbCargar = window.fbCargar;
    window.fbCargar = async function(col) {
      try {
        return await originalFbCargar(col);
      } catch(e) {
        diagRegistrarError('Firebase fbCargar(' + col + '): ' + e.message, 'firebase');
        throw e;
      }
    };
  }

  if (typeof window.fbGuardar === 'function') {
    const originalFbGuardar = window.fbGuardar;
    window.fbGuardar = async function(col, id, data) {
      try {
        return await originalFbGuardar(col, id, data);
      } catch(e) {
        diagRegistrarError('Firebase fbGuardar(' + col + '): ' + e.message, 'firebase');
        throw e;
      }
    };
  }

  if (typeof window.fbEliminar === 'function') {
    const originalFbEliminar = window.fbEliminar;
    window.fbEliminar = async function(col, id) {
      try {
        return await originalFbEliminar(col, id);
      } catch(e) {
        diagRegistrarError('Firebase fbEliminar(' + col + '): ' + e.message, 'firebase');
        throw e;
      }
    };
  }
})();
