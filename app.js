// ── Estado ────────────────────────────────────────────────

// ── Función de hash para contraseñas ──────────────────────
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

// ── Auto-Update listener ──────────────────────────────────
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
    // También verificar con navigator.onLine
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
    // Sin internet → mostrar pantalla de error
    document.getElementById('updateScreen').style.display = 'none';
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('noInternetScreen').style.display = 'flex';
    return;
  }

  // Hay internet → continuar con verificación de updates
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
        msg.textContent = '🔍 Buscando actualizaciones...';
        detail.textContent = 'Espera un momento';
      } else if (data.status === 'downloading') {
        window._updateDescargando = true;
        msg.textContent = '⬇ Actualizando...';
        progress.style.display = 'block';
        progressFill.style.width = data.percent + '%';
        detail.textContent = data.percent + '% descargado';
      } else if (data.status === 'ready') {
        window._updateDescargando = true;
        msg.textContent = '✔ Actualización lista';
        progress.style.display = 'block';
        progressFill.style.width = '100%';
        detail.textContent = 'Reiniciando aplicación...';
      } else if (data.status === 'no-update' || data.status === 'error') {
        updateScreen.style.display = 'none';
        loginScreen.style.display = 'flex';
      }
    });

    // Si después de 30 segundos no hay respuesta del updater, mostrar login
    // PERO si está descargando, NO mostrar login hasta que termine
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

// Botón reintentar
document.getElementById('btnReintentar').addEventListener('click', () => {
  document.getElementById('noInternetScreen').style.display = 'none';
  document.getElementById('updateScreen').style.display = 'flex';
  document.getElementById('updateMsg').textContent = '🔍 Verificando conexión...';
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
  if (!confirm('¿Estás seguro de cerrar la aplicación?')) return;
  if (window.require) {
    const { ipcRenderer } = window.require('electron');
    ipcRenderer.send('ventana-cerrar');
  }
}

// ── Login ─────────────────────────────────────────────────
// Usuario admin por defecto si no existe
if (!usuarios.some(u => u.login === 'admin')) {
  usuarios.push({ nombre: 'Administrador', login: 'admin', password: 'admin123', rol: 'Admin', activo: true });
  localStorage.setItem('usuariosBodega', JSON.stringify(usuarios));
}

function verificarSesion() {
  // Recupera sesión temporal de localStorage (viene de limpiar/nueva orden)
  const sesionTemp = localStorage.getItem('sesionTemp');
  if (sesionTemp) {
    localStorage.removeItem('sesionTemp');
    localStorage.setItem('sesionActiva', sesionTemp);
  }
  const sesion = localStorage.getItem('sesionActiva');
  if (sesion) {
    const sesionGuardada = JSON.parse(sesion);
    // Siempre cargar permisos frescos desde la lista de usuarios actual
    const usuarioFresco = usuarios.find(u => u.login === sesionGuardada.login && u.activo);
    if (usuarioFresco) {
      usuarioActivo = usuarioFresco;
      localStorage.setItem('sesionActiva', JSON.stringify(usuarioFresco));
    } else {
      // Usuario no existe o fue desactivado — cerrar sesión
      localStorage.removeItem('sesionActiva');
      return;
    }
    // Solo mostrar app si no estamos en pantalla de actualización
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
  document.getElementById('headerUsuario').textContent = `👤 ${usuarioActivo.nombre} (${usuarioActivo.rol})`;

  // Mostrar fecha en formato "30 Abril 2026"
  const ahora = new Date();
  const opcFecha = { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Santiago' };
  document.getElementById('headerFecha').textContent = `📅 ${ahora.toLocaleDateString('es-CL', opcFecha)}`;

  // Actualizar número de salida desde Firebase
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

  // Mostrar versión automáticamente
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

  // Aplicar permisos y activar primera pestaña visible
  aplicarPermisos();

  // Sincronizar con Firebase después del login
  setTimeout(() => esperarFirebase(), 500);
  
  // Mostrar mensaje del admin si existe
  setTimeout(() => mostrarMensajeAdmin(), 3000);
  
  // Verificador de sesión desactivado — no es necesario con usuarios diferentes por PC
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
        showToast('Tu sesión fue cerrada porque otro dispositivo inició sesión con este usuario', true);
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
      errEl.textContent = 'Usuario o contraseña incorrectos';
      document.getElementById('loginClave').value = '';
      document.getElementById('btnLogin').textContent = 'Ingresar';
      document.getElementById('btnLogin').disabled = false;
      return;
    }

    // Migrar contraseña a hash si aún está en texto plano
    if (usuario.password === clave) {
      usuario.password = claveHash;
      localStorage.setItem('usuariosBodega', JSON.stringify(usuarios));
      if (window.fbListo) fbGuardar('usuarios', usuario.login, usuario);
    }

    errEl.style.display = 'none';
    usuarioActivo = usuario;
    diagInicioSesion = Date.now();
    localStorage.setItem('sesionActiva', JSON.stringify(usuario));
    
    // Registrar sesión activa en Firebase
    const sesionId = Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
    localStorage.setItem('sesionId', sesionId);
    if (window.fbListo) fbGuardar('sesiones', usuario.login, { sesionId, fecha: fechaHoraLocal() });
    
    document.getElementById('btnLogin').textContent = 'Ingresar';
    document.getElementById('btnLogin').disabled = false;
    mostrarApp();
    registrarActividad('Inicio de sesión', `${usuario.nombre} (${usuario.rol})`);
  } catch(e) {
    console.error('Error en login:', e);
    showToast('Error al iniciar sesión: ' + e.message, true);
    document.getElementById('btnLogin').textContent = 'Ingresar';
    document.getElementById('btnLogin').disabled = false;
  }
}

document.getElementById('btnLogout').addEventListener('click', () => {
  if (!confirm('¿Cerrar sesión?')) return;
  registrarActividad('Cierre de sesión', `${usuarioActivo ? usuarioActivo.nombre : ''}`);
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

// ── Elementos ─────────────────────────────────────────────
const form        = document.getElementById('salidaForm');
const tbodyProd   = document.getElementById('tbodyProductos');
const nroSalidaEl = document.getElementById('nroSalida');
const tbodyCat    = document.getElementById('tbodyCatalogo');
const inputBuscar = document.getElementById('inputBuscar');
const sugerencias = document.getElementById('sugerencias');
const solicitanteInput   = document.getElementById('solicitante');
const sugerenciasCliente = document.getElementById('sugerenciasCliente');

// ── Init ──────────────────────────────────────────────────
document.getElementById('fecha').value = fechaHoraLocal();
nroSalidaEl.value = generarNro(contador);

// Cargar datos desde Firebase si está disponible
let _unsubscribers = [];
async function cargarDesdeFirebase() {
  if (!window.fbListo) {
    setTimeout(cargarDesdeFirebase, 500);
    return;
  }
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

    showToast('✔ Conectado a la nube');

    // Cargar caja desde Firebase
    cargarCajaDesdeFirebase();

    // Cargar desde Firebase SOLO si localStorage está vacío (ahorra miles de lecturas)
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
      
      // Usar números de orden como clave para evitar duplicados
      const nrosNuevos = new Set(nuevos.map(n => n.nro));
      const nrosActuales = new Set(historial.map(h => h.nro));
      
      // Verificar si hay cambios reales (nuevas órdenes, eliminadas, o editadas)
      const hayNuevos = nuevos.some(n => !nrosActuales.has(n.nro));
      const hayEliminados = historial.some(h => !nrosNuevos.has(h.nro));
      // Detectar ediciones: comparar contenido de órdenes existentes
      const hayEditados = nuevos.some(n => {
        const actual = historial.find(h => h.nro === n.nro);
        if (!actual) return false;
        return JSON.stringify(actual) !== JSON.stringify(n);
      });
      
      if (hayNuevos || hayEliminados || hayEditados || nuevos.length !== historial.length) {
        // Detectar órdenes nuevas para notificar (solo después de la carga inicial)
        if (historialCargadoInicial) {
          const ordenesNuevas = nuevos.filter(n => !nrosActuales.has(n.nro));
          const ahora = new Date();
          ordenesNuevas.forEach(orden => {
            const fechaOrden = new Date(orden.fecha ? orden.fecha.replace('T', ' ') : 0);
            if ((ahora - fechaOrden) < 5 * 60 * 1000) {
              const quien = orden.rolCreador ? ` — Enviada por ${orden.rolCreador}` : '';
              mostrarNotificacion('📦 Nueva Orden', `Orden ${orden.nro} — Cliente: ${orden.solicitante || 'Sin nombre'}${quien}`, orden.nro);
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
    _unsubscribers.push(fbEscuchar('recepciones', (datos) => {
      const nuevos = datos.sort((a,b) => b.nro.localeCompare(a.nro));
      
      const nrosNuevos = new Set(nuevos.map(n => n.nro));
      const nrosActuales = new Set(recepciones.map(r => r.nro));
      const hayNuevos = nuevos.some(n => !nrosActuales.has(n.nro));
      const hayCambios = nuevos.length !== recepciones.length || hayNuevos;
      
      if (hayCambios) {
        // Detectar recepciones nuevas para notificar
        if (recepcionesCargadoInicial) {
          const recNuevas = nuevos.filter(n => !nrosActuales.has(n.nro));
          const ahora = new Date();
          recNuevas.forEach(rec => {
            // Solo notificar recepciones de los últimos 5 minutos
            const fechaRec = new Date(rec.fecha ? rec.fecha.replace('T', ' ') : 0);
            if ((ahora - fechaRec) < 5 * 60 * 1000) {
              mostrarNotificacion('📥 Orden Recibida por Bodega', `${rec.nro} — Orden ${rec.nroOrden} recibida por ${rec.recibidoPor}`, rec.nroOrden);
            }
          });
        }
        // Firebase es la fuente de verdad
        recepciones = nuevos;
        localStorage.setItem('recepcionesBodega', JSON.stringify(recepciones));
        // También recargar historial desde Firebase para mantener sincronizado
        fbCargar('historial').then(fbHist => {
          if (fbHist.length > 0) {
            historial = fbHist.sort((a,b) => b.nro.localeCompare(a.nro));
            localStorage.setItem('historialSalidas', JSON.stringify(historial));
          }
          renderRecepciones();
          renderOrdenesEmitidas();
          buscarOrdenAntigua();
          renderReportes();
        });
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
          showToast('📢 Admin: ' + msg.texto);
          if (window.require) {
            const { ipcRenderer } = window.require('electron');
            ipcRenderer.send('mostrar-notificacion', { titulo: '📢 Mensaje del Admin', mensaje: msg.texto });
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

        // Refrescar permisos del usuario activo si está logeado
        if (usuarioActivo) {
          const usuarioFresco = usuarios.find(u => u.login === usuarioActivo.login && u.activo);
          if (usuarioFresco) {
            usuarioActivo = usuarioFresco;
            localStorage.setItem('sesionActiva', JSON.stringify(usuarioFresco));
            // Reaplicar permisos en las pestañas
            aplicarPermisos();
          } else if (usuarioActivo.login !== 'admin') {
            // Usuario desactivado — cerrar sesión
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
  }
}

// Esperar a que Firebase esté listo con polling
function esperarFirebase() {
  if (window.fbListo) {
    cargarDesdeFirebase();
  } else {
    setTimeout(esperarFirebase, 300);
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

// ── Pestañas ──────────────────────────────────────────────
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

// ── Número de salida ──────────────────────────────────────
function generarNro(n) {
  return 'SAL-' + String(n).padStart(4, '0');
}

// Mostrar/ocultar N° documento según tipo
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

// ── Buscador autocomplete ─────────────────────────────────
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
        <strong>${p.nombre}</strong><span>${p.codigo} · ${p.unidad}</span>
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
    showToast('El catálogo de productos está vacío', true); return;
  }

  // Normaliza código quitando espacios y guiones para comparación flexible
  const norm = s => s.toLowerCase().replace(/[\s\-\.]/g, '');

  const encontrado = catalogo.find(p => norm(p.codigo) === norm(q))
                  || catalogo.find(p => norm(p.nombre)  === norm(q))
                  || catalogo.find(p => norm(p.codigo).includes(norm(q)))
                  || catalogo.find(p => norm(p.nombre).includes(norm(q)));

  if (encontrado) seleccionarProducto(catalogo.indexOf(encontrado));
  else showToast(`No se encontró "${inputBuscar.value}" en el catálogo`, true);
});

// Botón lupa para buscar producto — abre modal de búsqueda
function buscarProductoEnOrden() {
  const q = inputBuscar.value.trim().toLowerCase();
  if (!q) { showToast('Escribe un código o nombre para buscar', true); inputBuscar.focus(); return; }
  if (catalogo.length === 0) { showToast('El catálogo de productos está vacío', true); return; }
  const norm = s => s.toLowerCase().replace(/[\s\-\.]/g, '');
  const encontrado = catalogo.find(p => norm(p.codigo) === norm(q))
                  || catalogo.find(p => norm(p.nombre)  === norm(q))
                  || catalogo.find(p => norm(p.codigo).includes(norm(q)))
                  || catalogo.find(p => norm(p.nombre).includes(norm(q)));
  if (encontrado) seleccionarProducto(catalogo.indexOf(encontrado));
  else showToast(`No se encontró "${inputBuscar.value}" en el catálogo`, true);
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

// ── Modal buscar producto ─────────────────────────────────
document.getElementById('btnAbrirBuscador').addEventListener('click', () => {
  document.getElementById('modalBuscarProducto').style.display = 'flex';
  document.getElementById('buscadorProductoInput').value = '';
  document.getElementById('tbodyBuscadorProducto').innerHTML = '<tr><td colspan="4" class="empty-msg">Ingresa un código o nombre para buscar</td></tr>';
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
    tbody.innerHTML = '<tr><td colspan="4" class="empty-msg">El catálogo está vacío</td></tr>';
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

// ── Agregar producto a la salida ──────────────────────────
document.getElementById('btnAgregar').addEventListener('click', () => {
  // Validar que los datos generales estén llenos antes de agregar productos
  const tipoDoc = document.getElementById('tipoDocumento').value;
  const cliente = document.getElementById('solicitante').value.trim();
  if (!tipoDoc) { showToast('Primero selecciona el Tipo de Documento', true); document.getElementById('tipoDocumento').focus(); return; }
  const campoNroVisible = document.getElementById('campoNroDoc').style.display !== 'none';
  const nroDoc = document.getElementById('nroDocumento').value.trim();
  if (campoNroVisible && !nroDoc) { showToast('Primero ingresa el N° de Documento', true); document.getElementById('nroDocumento').focus(); return; }
  if (!cliente) { showToast('Primero ingresa el nombre del Cliente', true); document.getElementById('solicitante').focus(); return; }

  const codigo      = document.getElementById('inputCodigo').value.trim();
  const descripcion = document.getElementById('inputDescripcion').value.trim();
  const unidad      = document.getElementById('inputUnidad').value;
  const cantidad    = parseFloat(document.getElementById('inputCantidad').value);
  const cantPalabras = document.getElementById('inputCantidadPalabras').value;

  if (!descripcion) { showToast('Ingresa la descripción del producto', true); return; }
  if (!cantidad || cantidad <= 0) { showToast('Ingresa una cantidad válida', true); return; }

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
      <td><button class="btn-delete" onclick="eliminarProducto(${i})" title="Eliminar">✕</button></td>
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

// ── Submit salida ─────────────────────────────────────────
let registrando = false;
form.addEventListener('submit', async (e) => {
  e.preventDefault();

  // Evitar doble registro
  if (registrando) return;
  registrando = true;
  document.getElementById('btnRegistrar').disabled = true;
  document.getElementById('btnRegistrar').textContent = '⏳ Registrando...';

  const tipoDocumento = document.getElementById('tipoDocumento').value;
  const solicitante   = document.getElementById('solicitante').value.trim();

  if (!tipoDocumento) { showToast('Selecciona el Tipo de Documento', true); document.getElementById('tipoDocumento').focus(); registrando = false; document.getElementById('btnRegistrar').disabled = false; document.getElementById('btnRegistrar').textContent = '✔ Registrar Salida'; return; }

  const nroDocumento = document.getElementById('nroDocumento').value.trim();
  const campoNroVisible = document.getElementById('campoNroDoc').style.display !== 'none';
  if (campoNroVisible && !nroDocumento) {
    showToast('Ingresa el N° de Documento', true);
    document.getElementById('nroDocumento').focus();
    registrando = false; document.getElementById('btnRegistrar').disabled = false; document.getElementById('btnRegistrar').textContent = '✔ Registrar Salida'; return;
  }
  if (!solicitante) { showToast('Ingresa el nombre del Cliente', true); document.getElementById('solicitante').focus(); registrando = false; document.getElementById('btnRegistrar').disabled = false; document.getElementById('btnRegistrar').textContent = '✔ Registrar Salida'; return; }
  if (productos.length === 0) { showToast('Agrega al menos un producto', true); registrando = false; document.getElementById('btnRegistrar').disabled = false; document.getElementById('btnRegistrar').textContent = '✔ Registrar Salida'; return; }

  // ── Vista previa antes de confirmar ──
  const previewConfirmado = await mostrarVistaPrevia(tipoDocumento, nroDocumento, solicitante, productos, window._editandoOrden);
  if (!previewConfirmado) {
    registrando = false;
    document.getElementById('btnRegistrar').disabled = false;
    document.getElementById('btnRegistrar').textContent = window._editandoOrden ? '✔ Guardar Cambios' : '✔ Registrar Salida';
    return;
  }

  // ── Si estamos editando una orden existente ──
  if (window._editandoOrden) {
    const nroEdit = window._editandoOrden;
    const idx = historial.findIndex(o => o.nro === nroEdit);
    if (idx === -1) { showToast('Orden no encontrada', true); registrando = false; document.getElementById('btnRegistrar').disabled = false; document.getElementById('btnRegistrar').textContent = '✔ Registrar Salida'; return; }

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

    showToast(`✔ Orden ${nroEdit} actualizada correctamente`);
    registrarActividad('Orden editada', `${nroEdit} — Cliente: ${solicitante}`);
    window._editandoOrden = null;
    bloquearFormulario();
    buscarOrdenAntigua();
    renderReportes();
    renderOrdenesEmitidas();
    registrando = false;
    return;
  }

  // Obtener siguiente número de orden (transacción atómica - nunca se duplica)
  let nroOrden;
  document.getElementById('btnRegistrar').textContent = '⏳ Registrando...';
  if (window.fbListo && window.fbObtenerSiguienteNumero) {
    try {
      const nroDesdeFirebase = await fbObtenerSiguienteNumero();
      if (nroDesdeFirebase !== null) {
        nroOrden = generarNro(nroDesdeFirebase);
        contador = nroDesdeFirebase + 1;
        localStorage.setItem('contadorSalidas', contador);
      } else {
        // Firebase falló — reintentar una vez
        showToast('Reintentando conexión...', true);
        await new Promise(r => setTimeout(r, 1000));
        const reintento = await fbObtenerSiguienteNumero();
        if (reintento !== null) {
          nroOrden = generarNro(reintento);
          contador = reintento + 1;
          localStorage.setItem('contadorSalidas', contador);
        } else {
          showToast('Error de conexión. Intenta de nuevo.', true);
          registrando = false;
          document.getElementById('btnRegistrar').disabled = false;
          document.getElementById('btnRegistrar').textContent = '✔ Registrar Salida';
          return;
        }
      }
    } catch(e) {
      console.error('Error obteniendo número:', e);
      showToast('Error de conexión. Intenta de nuevo.', true);
      registrando = false;
      document.getElementById('btnRegistrar').disabled = false;
      document.getElementById('btnRegistrar').textContent = '✔ Registrar Salida';
      return;
    }
  } else {
    showToast('Sin conexión a Firebase. Intenta de nuevo.', true);
    registrando = false;
    document.getElementById('btnRegistrar').disabled = false;
    document.getElementById('btnRegistrar').textContent = '✔ Registrar Salida';
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

  showToast(`✔ Salida ${salida.nro} registrada correctamente`);
  registrarActividad('Orden creada', `${salida.nro} — Cliente: ${salida.solicitante} — ${salida.total} producto(s)`);
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
  document.getElementById('btnRegistrar').textContent = '✔ Registrar Salida';
  registrando = false;
  document.getElementById('btnImprimir').style.display = 'none';
  document.getElementById('btnNuevaOrden').style.display = 'none';
  document.getElementById('ordenRegistradaBanner').style.display = 'none';
  productos = [];
  renderTabla();
  document.getElementById('fecha').value = fechaHoraLocal();
  nroSalidaEl.value = generarNro(contador);
}

// ── Reportes ──────────────────────────────────────────────
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
    tbody.innerHTML = '<tr><td colspan="7" class="empty-msg">No hay órdenes que coincidan</td></tr>';
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

// ── Exportar reportes a Excel (CSV) ──────────────────────────
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

    // CSV de órdenes
    let csv = '\uFEFF'; // BOM para Excel
    csv += 'N° Salida;Fecha;Tipo Doc.;N° Documento;Cliente;Creada por;Rol;Estado;Productos\n';
    historial.forEach(s => {
      csv += `${s.nro};${formatFecha(s.fecha)};${s.tipoDocumento||'-'};${s.nroDocumento||'-'};${s.solicitante||'-'};${s.creadoPor||'-'};${s.rolCreador||'-'};${s.anulada?'Anulada':'Activa'};${s.total}\n`;
    });
    csv += '\n\nTop Productos Despachados\n';
    csv += '#;Código;Producto;Unidad;Total Despachado\n';
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
    showToast('✔ Reporte exportado a Excel (CSV)');
    registrarActividad('Exportar Excel', 'Reporte de órdenes exportado');
  } catch(e) {
    console.error('Error exportando:', e);
    showToast('Error al exportar: ' + e.message, true);
  }
});

// ── Exportar reportes a PDF ───────────────────────────────
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
      <h1>Bodega A&M — Reporte de Órdenes</h1>
      <p class="fecha">Generado el ${hoy}</p>
      <div class="stats">
        <div class="stat"><div class="stat-num">${historial.length}</div><div class="stat-label">Total Órdenes</div></div>
        <div class="stat"><div class="stat-num">${historial.filter(s=>s.fecha&&s.fecha.slice(0,10)===new Date().toISOString().slice(0,10)).length}</div><div class="stat-label">Órdenes Hoy</div></div>
        <div class="stat"><div class="stat-num">${historial.reduce((a,s)=>a+s.total,0)}</div><div class="stat-label">Ítems Despachados</div></div>
        <div class="stat"><div class="stat-num">${historial.filter(s=>s.fecha&&s.fecha.slice(0,7)===new Date().toISOString().slice(0,7)).length}</div><div class="stat-label">Órdenes este Mes</div></div>
      </div>
      <h2>Top 10 Productos Más Despachados</h2>
      <table>
        <thead><tr><th>#</th><th>Código</th><th>Producto</th><th>Unidad</th><th>Total</th></tr></thead>
        <tbody>${filasTop || '<tr><td colspan="5" style="text-align:center">Sin datos</td></tr>'}</tbody>
      </table>
      <h2>Historial de Órdenes</h2>
      <table>
        <thead><tr><th>N° Salida</th><th>Tipo Doc.</th><th>Fecha</th><th>Cliente</th><th>Creada por</th><th>Estado</th></tr></thead>
        <tbody>${filasOrdenes || '<tr><td colspan="6" style="text-align:center">Sin órdenes</td></tr>'}</tbody>
      </table>
    </body></html>`;

  if (window.require) {
    const { ipcRenderer } = window.require('electron');
    ipcRenderer.send('vistaPreviewPDF', html);
  }
  registrarActividad('Exportar PDF', 'Reporte de órdenes exportado');
});

document.getElementById('btnBuscarProductoFecha').addEventListener('click', buscarProductoFecha);
document.getElementById('buscarProductoFecha').addEventListener('keydown', e => {
  if (e.key === 'Enter') buscarProductoFecha();
});
// Exportar Producto Fecha a Excel
document.getElementById('btnExcelProductoFecha').addEventListener('click', () => {
  if (!window._productoFechaData) return;
  let csv = '\uFEFFFecha;N° Orden;Código;Producto;Unid.;Cant.;Cliente\n';
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
  showToast('✔ Excel exportado');
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
    <h1>Bodega A&M — Búsqueda de Salidas por Producto</h1>
    <table><thead><tr><th>Fecha</th><th>N° Orden</th><th>Código</th><th>Producto</th><th>Unid.</th><th>Cant.</th><th>Cliente</th></tr></thead>
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

// Filtros órdenes
document.getElementById('btnFiltrar').addEventListener('click', aplicarFiltro);

// Filtro ítems despachados por fecha
document.getElementById('btnFiltroItems').addEventListener('click', () => {
  const fecha = document.getElementById('filtroItemsFecha').value;
  if (!fecha) { showToast('Selecciona una fecha', true); return; }
  const items = historial.filter(s => s.fecha && s.fecha.slice(0,10) === fecha).reduce((a, s) => a + s.total, 0);
  document.getElementById('statItemsFecha').textContent = items + ' ítems el ' + fecha.split('-').reverse().join('/');
});

// ── Resumen Ejecutivo del Mes ─────────────────────────────
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
  let comparacion = '—';
  if (totalMesAnterior > 0) {
    const diff = Math.round(((totalMes - totalMesAnterior) / totalMesAnterior) * 100);
    comparacion = (diff >= 0 ? '+' : '') + diff + '%';
  }

  // Promedio por día
  const diasEnMes = new Date(anio, mesNum, 0).getDate();
  const promedio = totalMes > 0 ? (totalMes / diasEnMes).toFixed(1) : '0';

  // Día más activo
  const conteosDia = {};
  ordenesMes.forEach(s => {
    const dia = s.fecha.slice(0,10);
    conteosDia[dia] = (conteosDia[dia] || 0) + 1;
  });
  let diaMasActivo = '—';
  let maxDia = 0;
  Object.entries(conteosDia).forEach(([dia, count]) => {
    if (count > maxDia) { maxDia = count; diaMasActivo = dia.split('-').reverse().join('/') + ' (' + count + ')'; }
  });

  // Ítems despachados
  const itemsMes = ordenesMes.reduce((a, s) => a + (s.total || 0), 0);

  // Hora pico
  const conteosHora = {};
  ordenesMes.forEach(s => {
    if (s.fecha && s.fecha.length >= 16) {
      const hora = s.fecha.slice(11,13);
      conteosHora[hora] = (conteosHora[hora] || 0) + 1;
    }
  });
  let horaPico = '—';
  let maxHora = 0;
  Object.entries(conteosHora).forEach(([hora, count]) => {
    if (count > maxHora) { maxHora = count; horaPico = hora + ':00 (' + count + ' órdenes)'; }
  });

  // Recepciones del mes
  const recepcionesMes = recepciones.filter(r => r.fecha && r.fecha.slice(0,7) === mes).length;

  // Anuladas
  const anuladasMes = ordenesMes.filter(s => s.anulada).length;

  // Pendientes de recepción
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

  // Semana más activa
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
  let semanaActiva = '—';
  let maxSemana = 0;
  Object.entries(semanas).forEach(([sem, count]) => {
    if (count > maxSemana) { maxSemana = count; semanaActiva = sem + ' (' + count + ')'; }
  });
  document.getElementById('reSemanaActiva').textContent = semanaActiva;

  document.getElementById('reTopProductos').innerHTML = topProds.length > 0
    ? topProds.map((p, i) => `${i+1}. <strong>${p[0]}</strong> — ${p[1]} unid.`).join('<br>')
    : 'Sin datos';
  document.getElementById('reTopClientes').innerHTML = topClientes.length > 0
    ? topClientes.map((c, i) => `${i+1}. <strong>${c[0]}</strong> — ${c[1]} órdenes`).join('<br>')
    : 'Sin datos';

  // Récord histórico
  const conteoMeses = {};
  historial.forEach(s => {
    if (s.fecha) {
      const m = s.fecha.slice(0,7);
      conteoMeses[m] = (conteoMeses[m] || 0) + 1;
    }
  });
  let mejorMes = '—';
  let maxMes = 0;
  const meses = ['','Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  Object.entries(conteoMeses).forEach(([m, count]) => {
    if (count > maxMes) {
      maxMes = count;
      const [a, mn] = m.split('-');
      mejorMes = meses[parseInt(mn)] + ' ' + a + ' (' + count + ' órdenes)';
    }
  });
  document.getElementById('reRecord').textContent = '🏆 ' + mejorMes;
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
    <h1>Resumen Ejecutivo — ${titulo}</h1>
    <div class="grid">
      <div class="card"><div class="num">${document.getElementById('reTotal').textContent}</div><div class="label">Total Órdenes</div></div>
      <div class="card"><div class="num">${document.getElementById('reComparacion').textContent}</div><div class="label">vs Mes Anterior</div></div>
      <div class="card"><div class="num">${document.getElementById('rePromedioDia').textContent}</div><div class="label">Promedio/Día</div></div>
      <div class="card"><div class="num">${document.getElementById('reDiaMasActivo').textContent}</div><div class="label">Día Más Activo</div></div>
      <div class="card"><div class="num">${document.getElementById('reItemsMes').textContent}</div><div class="label">Ítems Despachados</div></div>
      <div class="card"><div class="num">${document.getElementById('reHoraPico').textContent}</div><div class="label">Hora Pico</div></div>
      <div class="card"><div class="num">${document.getElementById('reRecepciones').textContent}</div><div class="label">Recepciones</div></div>
      <div class="card"><div class="num">${document.getElementById('reAnuladas').textContent}</div><div class="label">Anuladas</div></div>
      <div class="card"><div class="num">${document.getElementById('reSemanaActiva').textContent}</div><div class="label">Semana Más Activa</div></div>
    </div>
    <div class="section"><h3>🏆 Top 3 Productos</h3><p>${document.getElementById('reTopProductos').innerHTML}</p></div>
    <div class="section"><h3>⭐ Top 3 Clientes</h3><p>${document.getElementById('reTopClientes').innerHTML}</p></div>
    <div class="section"><h3>🏅 Récord Histórico</h3><p>${document.getElementById('reRecord').textContent}</p></div>
    <p style="text-align:center;margin-top:30px;font-size:0.8rem;color:#888">Bodega A&M — Generado el ${new Date().toLocaleDateString('es-CL')}</p>
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
  csv += 'Total Órdenes;' + document.getElementById('reTotal').textContent + '\n';
  csv += 'vs Mes Anterior;' + document.getElementById('reComparacion').textContent + '\n';
  csv += 'Promedio/Día;' + document.getElementById('rePromedioDia').textContent + '\n';
  csv += 'Día Más Activo;' + document.getElementById('reDiaMasActivo').textContent + '\n';
  csv += 'Ítems Despachados;' + document.getElementById('reItemsMes').textContent + '\n';
  csv += 'Hora Pico;' + document.getElementById('reHoraPico').textContent + '\n';
  csv += 'Recepciones;' + document.getElementById('reRecepciones').textContent + '\n';
  csv += 'Anuladas;' + document.getElementById('reAnuladas').textContent + '\n';
  csv += 'Semana Más Activa;' + document.getElementById('reSemanaActiva').textContent + '\n';
  csv += 'Récord Histórico;' + document.getElementById('reRecord').textContent + '\n';
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Resumen_Ejecutivo_${mes}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('✔ Excel descargado');
});

document.getElementById('btnFiltroMes').addEventListener('click', () => {
  const mes = document.getElementById('filtroMes').value;
  renderTopMes(mes);
});

// ── Comparar 2 Meses ─────────────────────────────────────
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
    if (a === 0 && b === 0) return '—';
    const d = b - a;
    const pct = a > 0 ? Math.round((d / a) * 100) : '∞';
    const color = d > 0 ? '#065f46' : d < 0 ? '#c81e1e' : '#333';
    return `<span style="color:${color};font-weight:bold">${d >= 0 ? '+' : ''}${d} (${pct}%)</span>`;
  }

  document.getElementById('tbodyComparacion').innerHTML = `
    <tr><td>Total Órdenes</td><td>${ordenes1.length}</td><td>${ordenes2.length}</td><td>${diff(ordenes1.length, ordenes2.length)}</td></tr>
    <tr><td>Ítems Despachados</td><td>${items1}</td><td>${items2}</td><td>${diff(items1, items2)}</td></tr>
    <tr><td>Recepciones</td><td>${rec1}</td><td>${rec2}</td><td>${diff(rec1, rec2)}</td></tr>
    <tr><td>Anuladas</td><td>${anuladas1}</td><td>${anuladas2}</td><td>${diff(anuladas1, anuladas2)}</td></tr>
  `;
  document.getElementById('comparacionMeses').style.display = '';
}

// Exportar Top Mes a Excel
document.getElementById('btnExcelTopMes').addEventListener('click', () => {
  if (!window._topMesData) return;
  let csv = '\uFEFF#;Código;Producto;Unidad;Total Despachado\n';
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
  showToast('✔ Excel exportado');
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
    <h1>Bodega A&M — Productos Más Despachados (${window._topMesTitulo})</h1>
    <table><thead><tr><th>#</th><th>Código</th><th>Producto</th><th>Unidad</th><th>Total</th></tr></thead>
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
    tbody.innerHTML = '<tr><td colspan="5" class="empty-msg">No hay órdenes en ese mes</td></tr>';
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
  if (!confirm(`¿Eliminar la orden ${historial[i].nro}?`)) return;
  historial.splice(i, 1);
  localStorage.setItem('historialSalidas', JSON.stringify(historial));
  renderReportes();
  showToast('Orden eliminada');
}

// ── Modal detalle ─────────────────────────────────────────
function abrirModal(i) {
  const s = historial[i];
  ordenImpresion = s;
  document.getElementById('modalTitulo').textContent = `Orden ${s.nro}`;
  document.getElementById('modalBody').innerHTML = `
    <div class="detail-row"><strong>N° Salida:</strong> ${s.nro}</div>
    <div class="detail-row"><strong>Fecha:</strong> ${formatFecha(s.fecha)}</div>
    <div class="detail-row"><strong>Tipo Documento:</strong> ${s.tipoDocumento || '-'}</div>
    <div class="detail-row"><strong>N° Documento:</strong> ${s.nroDocumento || '-'}</div>
    <div class="detail-row"><strong>Cliente:</strong> ${s.solicitante}</div>
    ${s.creadoPor ? `<div class="detail-row"><strong>Creada por:</strong> ${s.creadoPor} (${s.rolCreador || '-'})</div>` : ''}
    ${s.observaciones ? `<div class="detail-row"><strong>Observaciones:</strong> ${s.observaciones}</div>` : ''}
    <table style="margin-top:14px">
      <thead><tr><th>#</th><th>Código</th><th>Descripción</th><th>Unidad</th><th>Cantidad</th></tr></thead>
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
        // Buscar la orden en el historial por número
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
          <h1>Salida de Mercadería</h1>
          <p>Bodega A&M</p>
        </div>
        <div class="row"><label>N° Salida:</label><span>${nro}</span></div>
        <div class="row"><label>Fecha:</label><span>${fecha}</span></div>
        <div class="row"><label>Tipo Doc.:</label><span>${tipodoc||'-'}</span></div>
        ${nrodoc ? `<div class="row"><label>N° Documento:</label><span>${nrodoc}</span></div>` : ''}
        <div class="row"><label>Cliente:</label><span>${cliente||'-'}</span></div>
        ${obs ? `<div class="row"><label>Observaciones:</label><span>${obs}</span></div>` : ''}
        ${creadoPor ? `<div class="row"><label>Creada por:</label><span>${creadoPor} (${rolCreador})</span></div>` : ''}
        <table>
          <thead><tr><th>#</th><th>Código</th><th>Descripción</th><th>Unid.</th><th>Cant.</th><th style="padding-left:6px">En Palabras</th></tr></thead>
          <tbody>${filasProductos}</tbody>
        </table>
        <div class="footer">
          <p style="font-weight:bold">Entregar comprobante a bodeguero</p>
          <p style="margin-top:8px">¡Gracias por su compra!</p>
          <p style="margin-top:10px;font-size:9px">Bodega A&M — Documento interno</p>
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

// ── Catálogo de productos ─────────────────────────────────
document.getElementById('btnGuardarProducto').addEventListener('click', () => {
  const codigo = document.getElementById('catCodigo').value.trim();
  const nombre = document.getElementById('catNombre').value.trim();
  const unidad = document.getElementById('catUnidad').value;

  if (!nombre) { showToast('Ingresa el nombre del producto', true); return; }
  if (codigo && catalogo.some(p => p.codigo === codigo)) {
    showToast('Ya existe un producto con ese código', true); return;
  }

  catalogo.push({ codigo, nombre, unidad });
  localStorage.setItem('catalogoProductos', JSON.stringify(catalogo));
  if (window.fbListo) fbGuardar('catalogo', codigo || nombre, { codigo, nombre, unidad });
  renderCatalogo();
  document.getElementById('catCodigo').value = '';
  document.getElementById('catNombre').value = '';
  document.getElementById('catUnidad').value = 'unidad';
  showToast('Producto guardado en catálogo');
});

function renderCatalogo(filtro = '') {
  if (catalogo.length === 0) {
    tbodyCat.innerHTML = '<tr><td colspan="5" class="empty-msg">No hay productos en el catálogo</td></tr>';
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
        <button class="btn-add" style="padding:3px 8px;font-size:0.78rem;margin-right:4px" onclick="editarProductoCatalogo(${idx})">✏</button>
        <button class="btn-delete" onclick="eliminarDelCatalogo(${idx})" title="Eliminar">✕</button>
      </td>
    </tr>`;
  }).join('');

  if (!filtro && catalogo.length > 50) {
    tbodyCat.innerHTML += `<tr><td colspan="5" style="text-align:center;color:#888;font-style:italic;padding:10px">
      Mostrando 50 de ${catalogo.length} productos. Usa el buscador para ver más.
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
      <div class="modal-header"><h3>✏ Editar Producto</h3><button class="modal-close" onclick="this.closest('.modal-overlay').remove()">✕</button></div>
      <div class="modal-body" style="padding:16px">
        <div class="field"><label>Código</label><input type="text" id="editProdCodigo" value="${p.codigo || ''}" /></div>
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
        <button class="btn-primary" id="btnGuardarEditProd">✔ Guardar</button>
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
    showToast('✔ Producto actualizado');
  });
}

function eliminarMasivoCatalogo() {
  const checks = document.querySelectorAll('.chk-catalogo:checked');
  if (checks.length === 0) { showToast('Selecciona al menos un producto', true); return; }
  if (!confirm(`¿Eliminar ${checks.length} producto(s) seleccionado(s)?`)) return;
  const indices = Array.from(checks).map(c => parseInt(c.dataset.idx)).sort((a,b) => b - a);
  indices.forEach(i => {
    const p = catalogo[i];
    if (window.fbListo) fbEliminar('catalogo', p.codigo || p.nombre);
    catalogo.splice(i, 1);
  });
  localStorage.setItem('catalogoProductos', JSON.stringify(catalogo));
  renderCatalogo();
  showToast(`✔ ${indices.length} producto(s) eliminado(s)`);
}

function eliminarDelCatalogo(i) {
  if (!confirm(`¿Eliminar "${catalogo[i].nombre}" del catálogo?`)) return;
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
        const codigo = String(row['Código'] || row['Codigo'] || row['codigo'] || row['CÓDIGO'] || '').trim();
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
      resultEl.innerHTML = `<span style="color:#03543f">✔ ${agregados} producto(s) importado(s)</span>` +
        (duplicados ? ` · <span style="color:#92400e">${duplicados} duplicado(s) omitido(s)</span>` : '') +
        (errores    ? ` · <span style="color:#e53e3e">${errores} fila(s) sin nombre ignorada(s)</span>` : '');
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
  const csv = 'Código;Nombre;Unidad\n001;Producto Ejemplo;unidad\n002;Otro Producto;kg\n';
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = 'plantilla_productos.csv';
  a.click();
  URL.revokeObjectURL(url);
});

// ── Botones formulario ────────────────────────────────────
document.getElementById('btnLimpiar').addEventListener('click', () => {
  if (confirm('¿Limpiar el formulario?')) limpiarFormularioCompleto();
});

document.getElementById('btnNuevaOrden').addEventListener('click', () => {
  limpiarFormularioCompleto();
});

function limpiarFormularioCompleto() {
  // Cancelar modo edición si estaba activo
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
  document.getElementById('btnRegistrar').textContent = '✔ Registrar Salida';
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
  // Reaplicar permisos de pestañas
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

  // Activar la primera pestaña visible
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

// ── Buscar y reimprimir orden antigua ─────────────────────
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
    tbody.innerHTML = '<tr><td colspan="7" class="empty-msg">No se encontraron órdenes</td></tr>';
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
        ${!anulada && !recibida ? `<button class="btn-secondary" style="padding:4px 10px;font-size:0.8rem;margin-right:4px" onclick="editarOrden('${s.nro}')">✏ Editar</button>` : ''}
        ${!anulada && !recibida ? `<button class="btn-add" style="padding:4px 10px;font-size:0.8rem" onclick="reimprimirOrden(this)" data-nro="${s.nro}">🖨 Reimprimir</button>` : ''}
        ${!anulada && !recibida ? `<button class="btn-delete" style="margin-left:4px" onclick="anularOrden(this)" data-nro="${s.nro}" title="Anular">🚫 Anular</button>` : ''}
        ${recibida ? `<button class="btn-add" style="padding:4px 10px;font-size:0.8rem" onclick="reimprimirOrden(this)" data-nro="${s.nro}">🖨 Reimprimir</button>` : ''}
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
  if (!confirm(`¿Está seguro de anular la orden ${nro}? Esta acción no se puede deshacer.`)) return;
  historial[idx].anulada = true;
  localStorage.setItem('historialSalidas', JSON.stringify(historial));
  // Sincronizar anulación con Firebase
  if (window.fbListo) fbGuardar('historial', nro, historial[idx]);
  showToast(`Orden ${nro} anulada`);
  registrarActividad('Orden anulada', `${nro}`);
  buscarOrdenAntigua();
}

// ── Editar orden existente (solo si no fue recibida ni anulada) ──
function editarOrden(nro) {
  const idx = historial.findIndex(o => o.nro === nro);
  if (idx === -1) { showToast('Orden no encontrada', true); return; }
  const s = historial[idx];
  if (s.anulada) { showToast('No se puede editar una orden anulada', true); return; }
  if (recepciones.some(r => r.nroOrden === nro)) { showToast('No se puede editar una orden ya recibida', true); return; }

  if (!confirm(`¿Deseas editar la orden ${nro}? Se cargará en el formulario para modificarla.`)) return;

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

  // Cambiar texto del botón
  document.getElementById('btnRegistrar').textContent = '✔ Guardar Cambios';

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

// ── Autocomplete clientes en campo solicitante ────────────

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

// ── Clientes ──────────────────────────────────────────────
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
        <button class="btn-add" style="padding:3px 8px;font-size:0.78rem;margin-right:4px" onclick="editarCliente(${idx})">✏</button>
        <button class="btn-delete" onclick="eliminarCliente(${idx})" title="Eliminar">✕</button>
      </td>
    </tr>`;
  }).join('');

  if (!filtro && clientes.length > 50) {
    tbody.innerHTML += `<tr><td colspan="6" style="text-align:center;color:#888;font-style:italic;padding:10px">
      Mostrando 50 de ${clientes.length} clientes. Usa el buscador para ver más.
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
      <div class="modal-header"><h3>✏ Editar Cliente</h3><button class="modal-close" onclick="this.closest('.modal-overlay').remove()">✕</button></div>
      <div class="modal-body" style="padding:16px">
        <div class="field"><label>RUT</label><input type="text" id="editCliRut" value="${c.rut || ''}" /></div>
        <div class="field" style="margin-top:10px"><label>Nombre / Razón Social</label><input type="text" id="editCliNombre" value="${c.nombre || ''}" /></div>
        <div class="field" style="margin-top:10px"><label>Teléfono</label><input type="text" id="editCliTelefono" value="${c.telefono || ''}" /></div>
        <div class="field" style="margin-top:10px"><label>Dirección</label><input type="text" id="editCliDireccion" value="${c.direccion || ''}" /></div>
      </div>
      <div class="modal-footer">
        <button class="btn-secondary" onclick="this.closest('.modal-overlay').remove()">Cancelar</button>
        <button class="btn-primary" id="btnGuardarEditCli">✔ Guardar</button>
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
    showToast('✔ Cliente actualizado');
  });
}

function eliminarMasivoClientes() {
  const checks = document.querySelectorAll('.chk-cliente:checked');
  if (checks.length === 0) { showToast('Selecciona al menos un cliente', true); return; }
  if (!confirm(`¿Eliminar ${checks.length} cliente(s) seleccionado(s)?`)) return;
  const indices = Array.from(checks).map(c => parseInt(c.dataset.idx)).sort((a,b) => b - a);
  indices.forEach(i => {
    const c = clientes[i];
    if (window.fbListo) fbEliminar('clientes', c.rut || c.nombre);
    clientes.splice(i, 1);
  });
  localStorage.setItem('clientesBodega', JSON.stringify(clientes));
  renderClientes();
  showToast(`✔ ${indices.length} cliente(s) eliminado(s)`);
}

function eliminarCliente(i) {
  if (!confirm(`¿Eliminar al cliente "${clientes[i].nombre}"?`)) return;
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
        const telefono  = String(row['Teléfono'] || row['Telefono'] || row['telefono'] || '').trim();
        const direccion = String(row['Dirección'] || row['Direccion'] || row['direccion'] || '').trim();

        if (!nombre) { errores++; return; }
        if (rut && clientes.some(c => c.rut === rut)) { duplicados++; return; }
        clientes.push({ rut, nombre, telefono, direccion });
        agregados++;
      });

      localStorage.setItem('clientesBodega', JSON.stringify(clientes));
      if (window.fbListo) clientes.forEach(c => fbGuardar('clientes', c.rut || c.nombre, c));
      renderClientes();
      document.getElementById('inputExcelClientes').value = '';
      resultEl.innerHTML = `<span style="color:#03543f">✔ ${agregados} cliente(s) importado(s)</span>` +
        (duplicados ? ` · <span style="color:#92400e">${duplicados} duplicado(s) omitido(s)</span>` : '') +
        (errores    ? ` · <span style="color:#e53e3e">${errores} fila(s) sin nombre ignorada(s)</span>` : '');
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
  const csv = 'RUT;Nombre;Teléfono;Dirección\n12.345.678-9;Ejemplo Cliente;+56912345678;Av. Ejemplo 123\n';
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = 'plantilla_clientes.csv';
  a.click();
  URL.revokeObjectURL(url);
});

// ── Usuarios ──────────────────────────────────────────────
let editandoUsuarioIdx = null;

document.getElementById('btnGuardarUsuario').addEventListener('click', async () => {
  const nombre   = document.getElementById('usuNombre').value.trim();
  const login    = document.getElementById('usuLogin').value.trim().toLowerCase();
  const password = document.getElementById('usuPassword').value;
  const rol      = document.getElementById('usuRol').value;

  if (!nombre)   { showToast('Ingresa el nombre del usuario', true); return; }
  if (!login)    { showToast('Ingresa el nombre de usuario', true); return; }
  if (!password && editandoUsuarioIdx === null) { showToast('Ingresa una contraseña', true); return; }

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
    registrarActividad('Usuario editado', `${nombre} (${login}) — Rol: ${rol}`);
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
    registrarActividad('Usuario creado', `${nombre} (${login}) — Rol: ${rol}`);
  }

  renderUsuarios();
  document.getElementById('usuNombre').value   = '';
  document.getElementById('usuLogin').value    = '';
  document.getElementById('usuPassword').value = '';
  document.getElementById('usuPassword').placeholder = '••••••';
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
  document.getElementById('usuPassword').placeholder = '(dejar vacío para mantener)';
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
  btn.textContent = '✔ Actualizar';
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
        <button class="btn-delete" onclick="eliminarUsuario(${i})" title="Eliminar">✕</button>
      </td>
    </tr>`;
  }).join('');
}

function toggleUsuario(i) {
  const u = usuarios[i];
  if (u.activo) {
    if (!confirm(`¿Está seguro de desactivar al usuario "${u.nombre}"?`)) return;
  }
  usuarios[i].activo = !usuarios[i].activo;
  localStorage.setItem('usuariosBodega', JSON.stringify(usuarios));
  if (window.fbListo) fbGuardar('usuarios', usuarios[i].login, usuarios[i]);
  renderUsuarios();
}

function eliminarUsuario(i) {
  if (!confirm(`¿Eliminar al usuario "${usuarios[i].login}"?`)) return;
  const loginEliminado = usuarios[i].login;
  usuarios.splice(i, 1);
  localStorage.setItem('usuariosBodega', JSON.stringify(usuarios));
  if (window.fbListo) fbEliminar('usuarios', loginEliminado);
  renderUsuarios();
}

document.getElementById('btnEliminarHistorial').addEventListener('click', async () => {
  if (!confirm('¿Eliminar TODO el historial de órdenes y recepciones? Esta acción no se puede deshacer.')) return;
  if (!confirm('¿Está completamente seguro? Se perderán todos los registros.')) return;

  // Eliminar de Firebase
  if (window.fbListo) {
    showToast('🔄 Eliminando de la nube...');
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
  registrarActividad('Historial eliminado', 'Se eliminaron todas las órdenes y recepciones');
});

// ── Recepciones ───────────────────────────────────────────
function generarNroRec(n) {
  return 'REC-' + String(n).padStart(4, '0');
}

// Render órdenes emitidas (pendientes y recibidas)
function renderOrdenesEmitidas(filtro = '') {
  const tbody = document.getElementById('tbodyOrdenesEmitidas');
  let datos = historial.filter(s => !s.anulada && !recepciones.some(r => r.nroOrden === s.nro));
  // Ordenar por fecha más reciente primero
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
    tbody.innerHTML = '<tr><td colspan="6" class="empty-msg">No hay órdenes pendientes</td></tr>';
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
        <button class="btn-add" style="padding:4px 12px;font-size:0.8rem" onclick="abrirModalRec(this)" data-nro="${s.nro}">📥 Recibir</button>
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

// Abrir modal para confirmar recepción de una orden
function verOrdenEmitida(btn) {
  const nroOrden = btn.dataset.nro;
  const s = historial.find(o => o.nro === nroOrden);
  if (!s) return;
  ordenImpresion = s;
  document.getElementById('modalTitulo').textContent = `Orden ${s.nro}`;
  document.getElementById('modalBody').innerHTML = `
    <div class="detail-row"><strong>N° Salida:</strong> ${s.nro}</div>
    <div class="detail-row"><strong>Fecha:</strong> ${formatFecha(s.fecha)}</div>
    <div class="detail-row"><strong>Tipo Documento:</strong> ${s.tipoDocumento || '-'}</div>
    <div class="detail-row"><strong>N° Documento:</strong> ${s.nroDocumento || '-'}</div>
    <div class="detail-row"><strong>Cliente:</strong> ${s.solicitante || '-'}</div>
    ${s.creadoPor ? `<div class="detail-row"><strong>Creada por:</strong> ${s.creadoPor} (${s.rolCreador || '-'})</div>` : ''}
    ${s.observaciones ? `<div class="detail-row"><strong>Observaciones:</strong> ${s.observaciones}</div>` : ''}
    <table style="margin-top:14px">
      <thead><tr><th>#</th><th>Código</th><th>Descripción</th><th>Unidad</th><th>Cantidad</th><th>En Palabras</th></tr></thead>
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
  // Luego los demás usuarios activos
  usuarios.filter(u => u.activo && u.login !== usuarioActivo.login).forEach(u => {
    opcionesUsuarios += `<option value="${u.nombre}">${u.nombre} (${u.rol})</option>`;
  });
  // Opción para escribir otro nombre manualmente
  opcionesUsuarios += `<option value="__otro__">✏ Otra persona...</option>`;
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
    <div class="detail-row"><strong>N° Orden:</strong> ${orden.nro}</div>
    <div class="detail-row"><strong>Fecha Emisión:</strong> ${formatFecha(orden.fecha)}</div>
    <div class="detail-row"><strong>Tipo Documento:</strong> ${orden.tipoDocumento || '-'}</div>
    <div class="detail-row"><strong>N° Documento:</strong> ${orden.nroDocumento || '-'}</div>
    <div class="detail-row"><strong>Cliente:</strong> ${orden.solicitante}</div>
    ${orden.creadoPor ? `<div class="detail-row"><strong>Creada por:</strong> ${orden.creadoPor} (${orden.rolCreador || '-'})</div>` : ''}
    <table style="margin-top:14px">
      <thead><tr><th>#</th><th>Código</th><th>Descripción</th><th>Unidad</th><th>Cantidad</th></tr></thead>
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
  // Si eligió "Otra persona", usar el input de texto
  if (recibidoPor === '__otro__') {
    const inputOtro = document.getElementById('inputRecOtroNombre');
    recibidoPor = inputOtro ? inputOtro.value.trim() : '';
  }
  if (!recibidoPor) { showToast('Ingresa quién recibe la orden', true); return; }

  // Verificar que no esté ya recibida (en local y en Firebase)
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

  // Verificar que no esté ya recibida
  if (recepciones.some(r => r.nroOrden === ordenEnRecepcion.nro)) {
    showToast('Esta orden ya fue recibida', true);
    cerrarModalRec();
    renderOrdenesEmitidas();
    return;
  }

  // Obtener siguiente número de recepción desde Firebase
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

  // Guardar en Firebase primero y esperar confirmación
  if (window.fbListo) {
    try {
      await fbGuardar('recepciones', recepcion.nro, recepcion);
    } catch(e) {
      showToast('Error al guardar recepción. Intenta de nuevo.', true);
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
  showToast(`✔ Recepción ${recepcion.nro} confirmada`);
  registrarActividad('Recepción confirmada', `${recepcion.nro} — Orden ${recepcion.nroOrden} — Recibido por: ${recepcion.recibidoPor}`);
}

function verRecepcion(i) {
  const r = recepciones[i];
  // Setear ordenImpresion con los datos de la recepción para poder imprimir
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
  document.getElementById('modalTitulo').textContent = `Recepción ${r.nro}`;
  document.getElementById('modalBody').innerHTML = `
    <div class="detail-row"><strong>N° Recepción:</strong> ${r.nro}</div>
    <div class="detail-row"><strong>N° Orden:</strong> ${r.nroOrden}</div>
    <div class="detail-row"><strong>Fecha Recepción:</strong> ${formatFecha(r.fecha)}</div>
    <div class="detail-row"><strong>Tipo Documento:</strong> ${ordenOriginal ? ordenOriginal.tipoDocumento || '-' : '-'}</div>
    <div class="detail-row"><strong>N° Documento:</strong> ${ordenOriginal ? ordenOriginal.nroDocumento || '-' : '-'}</div>
    <div class="detail-row"><strong>Cliente:</strong> ${r.solicitante || r.Cliente || '-'}</div>
    <div class="detail-row"><strong>Recibido por:</strong> ${r.recibidoPor}</div>
    ${ordenOriginal && ordenOriginal.creadoPor ? `<div class="detail-row"><strong>Orden creada por:</strong> ${ordenOriginal.creadoPor} (${ordenOriginal.rolCreador || '-'})</div>` : ''}
    ${r.observaciones ? `<div class="detail-row"><strong>Observaciones:</strong> ${r.observaciones}</div>` : ''}
    <table style="margin-top:14px">
      <thead><tr><th>#</th><th>Código</th><th>Descripción</th><th>Unidad</th><th>Cantidad</th></tr></thead>
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
  if (!confirm(`¿Eliminar la recepción ${recepciones[i].nro}?`)) return;
  recepciones.splice(i, 1);
  localStorage.setItem('recepcionesBodega', JSON.stringify(recepciones));
  renderRecepciones();
  renderOrdenesEmitidas();
  showToast('Recepción eliminada');
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

// Cerrar modal recepción al click fuera
document.getElementById('modalRecepcion').addEventListener('click', (e) => {
  if (e.target === document.getElementById('modalRecepcion')) cerrarModalRec();
});

// ── Número a palabras (español) ───────────────────────────
function numeroAPalabras(n) {
  if (n === 0) return 'cero';
  if (n < 0) return 'menos ' + numeroAPalabras(-n);

  // Manejar decimales: "1.5" → "uno punto cinco"
  if (n !== Math.floor(n)) {
    const partes = n.toString().split('.');
    const entera = parseInt(partes[0]);
    const decimalStr = partes[1];
    // Convertir cada dígito decimal individualmente
    const digitosDecimal = ['cero','uno','dos','tres','cuatro','cinco','seis','siete','ocho','nueve'];
    let decimalPalabras;
    const decimalNum = parseInt(decimalStr);
    if (decimalStr.length <= 2 && decimalNum > 0 && decimalNum < 100) {
      // Intentar convertir como número completo (ej: 25 → "veinticinco")
      decimalPalabras = numeroAPalabras(decimalNum);
    } else {
      // Dígito por dígito para decimales largos
      decimalPalabras = decimalStr.split('').map(d => digitosDecimal[parseInt(d)]).join(' ');
    }
    const enteraPalabras = entera === 0 ? 'cero' : numeroAPalabras(entera);
    return enteraPalabras + ' punto ' + decimalPalabras;
  }

  n = Math.floor(n);

  const unidades  = ['','uno','dos','tres','cuatro','cinco','seis','siete','ocho','nueve',
                     'diez','once','doce','trece','catorce','quince','dieciséis','diecisiete',
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

// ── Utilidades ────────────────────────────────────────────
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

// ── Log de Actividad ──────────────────────────────────────

// ── Log de Actividad (desactivado) ────────────────────────
function registrarActividad() {}

// ── Papelera de Reciclaje ─────────────────────────────────
function renderPapelera() {
  const tbody = document.getElementById('tbodyPapelera');
  if (!tbody) return;
  const anuladas = historial.filter(s => s.anulada === true);
  if (anuladas.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="empty-msg">No hay órdenes en la papelera</td></tr>';
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
        <button class="btn-add" style="padding:4px 10px;font-size:0.8rem;background:#16a34a" onclick="restaurarOrden(${idx})">♻ Restaurar</button>
        <button class="btn-delete" style="margin-left:4px" onclick="eliminarDefinitivo(${idx})" title="Eliminar definitivamente">✕ Eliminar</button>
      </td>
    </tr>`;
  }).join('');
}

function restaurarOrden(i) {
  if (!confirm(`¿Restaurar la orden ${historial[i].nro}? Volverá a aparecer como orden activa.`)) return;
  historial[i].anulada = false;
  localStorage.setItem('historialSalidas', JSON.stringify(historial));
  if (window.fbListo) fbGuardar('historial', historial[i].nro, historial[i]);
  registrarActividad('Orden restaurada', `${historial[i].nro}`);
  showToast(`✔ Orden ${historial[i].nro} restaurada`);
  renderPapelera();
  renderReportes();
  buscarOrdenAntigua();
  renderOrdenesEmitidas();
}

function eliminarDefinitivo(i) {
  if (!confirm(`¿Eliminar DEFINITIVAMENTE la orden ${historial[i].nro}? Esta acción no se puede deshacer.`)) return;
  if (!confirm('¿Estás completamente seguro?')) return;
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

// ── Mensaje del Admin ──────────────────────────────────────
function guardarMensajeAdmin() {
  const msg = document.getElementById('inputMensajeAdmin').value.trim();
  if (!msg) { showToast('Escribe un mensaje', true); return; }
  if (window.fbListo) {
    fbGuardar('config', 'mensajeAdmin', { texto: msg, fecha: fechaHoraLocal() });
    showToast('✔ Mensaje enviado a todos los usuarios');
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
        showToast('📢 Admin: ' + msg.texto);
      }, 2000);
      // Mostrar en el campo si es admin
      const el = document.getElementById('mensajeAdminActual');
      if (el) el.textContent = 'Mensaje actual: "' + msg.texto + '"';
    }
  });
}

// ── Notificaciones de escritorio ──────────────────────────
function mostrarNotificacion(titulo, mensaje, nroOrden) {
  // Enviar al proceso principal para notificación persistente
  if (window.require) {
    const { ipcRenderer } = window.require('electron');
    ipcRenderer.send('mostrar-notificacion', { titulo, mensaje, nroOrden });
  }
  // También mostrar toast en la app
  showToast(`${titulo}: ${mensaje}`);
}

// Listener para abrir orden desde notificación
if (window.require) {
  const { ipcRenderer } = window.require('electron');
  ipcRenderer.on('abrir-orden', (event, nroOrden) => {
    const idx = historial.findIndex(s => s.nro === nroOrden);
    if (idx !== -1) {
      // Ir a la pestaña de reportes y abrir el modal
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      document.querySelector('[data-tab="reportes"]').classList.add('active');
      document.getElementById('tab-reportes').classList.add('active');
      abrirModal(idx);
    }
  });
}

// ══════════════════════════════════════════════════════════════
// ── CAJA / VENTAS DEL DÍA ─────────────────────────────────────
// ══════════════════════════════════════════════════════════════

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
  if (!monto || monto <= 0) { showToast('Ingresa un monto válido', true); return; }
  if (!metodo) { showToast('Selecciona un método de pago', true); return; }
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
  showToast('✔ Venta registrada');
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
        <td><span class="badge" style="background:${v.metodo==='Efectivo'?'#d1fae5':v.metodo==='Débito'?'#dbeafe':v.metodo==='Crédito'?'#fef3c7':'#e0e7ff'};color:#333;padding:3px 8px;border-radius:4px;font-size:0.8rem">${v.metodo}</span></td>
        <td style="font-size:0.8rem">${v.tipoDoc || '-'}</td>
        <td><button class="btn-add" style="padding:2px 6px;font-size:0.75rem;margin-right:4px" onclick="editarVentaCaja('${v.id}')">✏</button><button class="btn-delete" onclick="eliminarVentaCaja('${v.id}')">✕</button></td>
      </tr>`).join('');
  }

  // Estadísticas
  const efectivo = ventasDia.filter(v => v.metodo === 'Efectivo').reduce((a, v) => a + v.monto, 0);
  const debito = ventasDia.filter(v => v.metodo === 'Débito').reduce((a, v) => a + v.monto, 0);
  const credito = ventasDia.filter(v => v.metodo === 'Crédito').reduce((a, v) => a + v.monto, 0);  const total = efectivo + debito + credito;
  const cEfectivo = ventasDia.filter(v => v.metodo === 'Efectivo').length;
  const cDebito = ventasDia.filter(v => v.metodo === 'Débito').length;
  const cCredito = ventasDia.filter(v => v.metodo === 'Crédito').length;
  document.getElementById('cajaEfectivo').innerHTML = '$' + efectivo.toLocaleString() + `<br><span style="font-size:0.7rem;opacity:0.7">${cEfectivo} venta${cEfectivo!==1?'s':''}</span>`;
  document.getElementById('cajaDebito').innerHTML = '$' + debito.toLocaleString() + `<br><span style="font-size:0.7rem;opacity:0.7">${cDebito} venta${cDebito!==1?'s':''}</span>`;
  document.getElementById('cajaCredito').innerHTML = '$' + credito.toLocaleString() + `<br><span style="font-size:0.7rem;opacity:0.7">${cCredito} venta${cCredito!==1?'s':''}</span>`;
  document.getElementById('cajaTotal').innerHTML = '$' + total.toLocaleString() + `<br><span style="font-size:0.7rem;opacity:0.7">${ventasDia.length} venta${ventasDia.length!==1?'s':''}</span>`;
}

function eliminarVentaCaja(id) {
  if (!confirm('¿Eliminar esta venta?')) return;
  const idx = ventasCaja.findIndex(v => v.id === id);
  if (idx !== -1) {
    ventasCaja.splice(idx, 1);
    localStorage.setItem('ventasCaja', JSON.stringify(ventasCaja));
    if (window.fbListo) fbEliminar('caja', id);
    renderCaja();
    showToast('✔ Venta eliminada');
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
      <div class="modal-header"><h3>✏ Editar Venta</h3><button class="modal-close" onclick="this.closest('.modal-overlay').remove()">✕</button></div>
      <div class="modal-body" style="padding:16px">
        <div class="field"><label>Monto ($)</label><input type="number" id="editVentaMonto" value="${v.monto}" min="1" /></div>
        <div class="field" style="margin-top:10px"><label>Método de Pago</label>
          <select id="editVentaMetodo">
            <option value="Efectivo" ${v.metodo==='Efectivo'?'selected':''}>Efectivo</option>
            <option value="Débito" ${v.metodo==='Débito'?'selected':''}>Débito</option>
            <option value="Crédito" ${v.metodo==='Crédito'?'selected':''}>Crédito</option>
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
        <button class="btn-primary" id="btnGuardarEditVenta">✔ Guardar</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.querySelector('#btnGuardarEditVenta').addEventListener('click', () => {
    const nuevoMonto = parseInt(document.getElementById('editVentaMonto').value);
    const nuevoMetodo = document.getElementById('editVentaMetodo').value;
    const nuevoTipoDoc = document.getElementById('editVentaTipoDoc').value;
    const nuevaFecha = document.getElementById('editVentaFecha').value;
    if (!nuevoMonto || nuevoMonto <= 0) { showToast('Monto inválido', true); return; }
    ventasCaja[idx].monto = nuevoMonto;
    ventasCaja[idx].metodo = nuevoMetodo;
    ventasCaja[idx].tipoDoc = nuevoTipoDoc;
    ventasCaja[idx].fecha = nuevaFecha || v.fecha;
    localStorage.setItem('ventasCaja', JSON.stringify(ventasCaja));
    if (window.fbListo) fbGuardar('caja', v.id, ventasCaja[idx]);
    overlay.remove();
    renderCaja();
    showToast('✔ Venta actualizada');
  });
}

// ── Retiros de Caja ──────────────────────────────────────────

function generarPDFRetiro(retiro) {
  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
    @page { size: letter; margin: 20mm; }
    * { font-family: 'Segoe UI', Arial, sans-serif; margin: 0; padding: 0; box-sizing: border-box; }
    body { padding: 30px; background: white; }
    .container { max-width: 500px; margin: 0 auto; border: 2px solid #1a56db; border-radius: 12px; overflow: hidden; }
    .header { background: linear-gradient(135deg, #1a56db, #3b82f6); color: white; padding: 24px; text-align: center; }
    .header h1 { font-size: 24px; margin-bottom: 4px; letter-spacing: 1px; }
    .header p { font-size: 13px; opacity: 0.9; }
    .badge { display: inline-block; background: #dc2626; color: white; font-size: 12px; font-weight: bold; padding: 4px 12px; border-radius: 20px; margin-top: 10px; letter-spacing: 0.5px; }
    .monto-box { text-align: center; padding: 24px; background: #fef2f2; border-bottom: 1px solid #fecaca; }
    .monto-box .monto { font-size: 36px; font-weight: bold; color: #dc2626; }
    .monto-box .label { font-size: 12px; color: #888; margin-top: 4px; }
    .detalles { padding: 20px 24px; }
    .detalle-row { display: flex; justify-content: space-between; align-items: center; padding: 12px 0; border-bottom: 1px solid #f1f5f9; }
    .detalle-row:last-child { border-bottom: none; }
    .detalle-row .icon { font-size: 18px; margin-right: 10px; }
    .detalle-row .info { display: flex; align-items: center; }
    .detalle-row .label { font-size: 13px; color: #64748b; }
    .detalle-row .value { font-size: 15px; font-weight: 600; color: #1e293b; }
    .firmas { display: flex; justify-content: space-between; padding: 30px 24px 20px; gap: 20px; }
    .firma-box { flex: 1; text-align: center; }
    .firma-linea { border-top: 2px solid #1a56db; margin-top: 50px; padding-top: 8px; }
    .firma-nombre { font-size: 13px; font-weight: 600; color: #1a56db; }
    .firma-rol { font-size: 10px; color: #888; }
    .footer { background: #f8fafc; padding: 12px; text-align: center; font-size: 10px; color: #94a3b8; border-top: 1px solid #e2e8f0; }
  </style></head><body>
    <div class="container">
      <div class="header">
        <h1>BODEGA A&amp;M</h1>
        <p>Comprobante de Retiro de Caja</p>
        <div class="badge">RETIRO</div>
      </div>
      <div class="monto-box">
        <div class="monto">-$${retiro.monto.toLocaleString()}</div>
        <div class="label">Monto retirado</div>
      </div>
      <div class="detalles">
        <div class="detalle-row">
          <div class="info"><span class="icon">📅</span><span class="label">Fecha</span></div>
          <span class="value">${retiro.fecha.split('-').reverse().join('/')}</span>
        </div>
        <div class="detalle-row">
          <div class="info"><span class="icon">🕒</span><span class="label">Hora</span></div>
          <span class="value">${retiro.hora}</span>
        </div>
        <div class="detalle-row">
          <div class="info"><span class="icon">👤</span><span class="label">Quien retira</span></div>
          <span class="value">${retiro.quienRetira || 'Jose Lee'}</span>
        </div>
        <div class="detalle-row">
          <div class="info"><span class="icon">📨</span><span class="label">Entregar a</span></div>
          <span class="value">${retiro.destinatario}</span>
        </div>
        <div class="detalle-row">
          <div class="info"><span class="icon">📝</span><span class="label">Nota</span></div>
          <span class="value">${retiro.nota || 'Sin nota'}</span>
        </div>
      </div>
      <div class="firmas">
        <div class="firma-box">
          <div class="firma-linea">
            <div class="firma-nombre">${retiro.quienRetira || 'Jose Lee'}</div>
            <div class="firma-rol">Retira</div>
          </div>
        </div>
        <div class="firma-box">
          <div class="firma-linea">
            <div class="firma-nombre">${retiro.destinatario}</div>
            <div class="firma-rol">Recibe</div>
          </div>
        </div>
      </div>
      <div class="footer">
        Documento interno &mdash; Bodega A&amp;M &mdash; Generado el ${new Date().toLocaleDateString('es-CL')} a las ${new Date().toTimeString().slice(0,5)}
      </div>
    </div>
  </body></html>`;

  if (window.require) {
    const { ipcRenderer } = window.require('electron');
    ipcRenderer.send('vistaPreviewPDF', html);
  }
}

function registrarRetiro() {
  const monto = parseInt(document.getElementById('retiroMonto').value);
  const destinatario = document.getElementById('retiroDestinatario').value;
  const nota = document.getElementById('retiroNota').value.trim();

  if (!monto || monto <= 0) { showToast('Ingresa un monto válido', true); return; }
  if (!destinatario) { showToast('Selecciona a quién se entrega', true); return; }

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
  showToast('✔ Retiro de $' + monto.toLocaleString() + ' registrado');
  generarPDFRetiro(retiro);
  registrarActividad('Retiro de Caja', 'Retiro de $' + monto.toLocaleString() + ' a ' + destinatario);
}

function eliminarRetiro(id) {
  if (!confirm('¿Eliminar este retiro?')) return;
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
        <h3 style="margin-bottom:16px">✏️ Editar Retiro</h3>
        <div class="field"><label>Monto ($)</label><input type="number" id="editRetiroMonto" value="${r.monto}" min="1" /></div>
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

  if (!monto || monto <= 0) { showToast('Monto inválido', true); return; }
  if (!destinatario) { showToast('Selecciona destinatario', true); return; }

  const idx = retirosCaja.findIndex(r => r.id === id);
  if (idx === -1) return;

  retirosCaja[idx].monto = monto;
  retirosCaja[idx].destinatario = destinatario;
  retirosCaja[idx].nota = nota;
  retirosCaja[idx].quienRetira = quienRetira;

  localStorage.setItem('retirosCaja', JSON.stringify(retirosCaja));
  if (window.fbGuardar) fbGuardar('retirosCaja', id, retirosCaja[idx]).catch(() => {});

  document.getElementById('modalEditRetiro').remove();
  renderRetiros();
  actualizarSaldoCaja();
  showToast('✔ Retiro actualizado');
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
    <td><button class="btn-add" style="padding:2px 8px;font-size:0.75rem;margin-right:4px" onclick="generarPDFRetiro(retirosCaja.find(x=>x.id==='${r.id}'))">🖨</button><button class="btn-secondary" style="padding:2px 8px;font-size:0.75rem;margin-right:4px" onclick="editarRetiro('${r.id}')">✏</button><button class="btn-delete" onclick="eliminarRetiro('${r.id}')" title="Eliminar">🗑</button></td>
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
  let csv = '\uFEFF#;Hora;Monto;Método\n';
  ventasDia.forEach((v, i) => { csv += `${i+1};${v.hora};${v.monto};${v.metodo}\n`; });
  const efectivo = ventasDia.filter(v => v.metodo === 'Efectivo').reduce((a, v) => a + v.monto, 0);
  const debito = ventasDia.filter(v => v.metodo === 'Débito').reduce((a, v) => a + v.monto, 0);
  const credito = ventasDia.filter(v => v.metodo === 'Crédito').reduce((a, v) => a + v.monto, 0);
  csv += `\n;TOTALES;;\n;Efectivo;${efectivo};\n;Débito;${debito};\n;Crédito;${credito};\n;Transferencia;${transferencia};\n;TOTAL;${efectivo+debito+credito+transferencia};\n`;
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Caja_${cajaFechaActual}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('✔ Excel descargado');
});

// Exportar Caja a PDF
document.getElementById('btnCajaPDF').addEventListener('click', () => {
  const ventasDia = ventasCaja.filter(v => v.fecha === cajaFechaActual);
  if (ventasDia.length === 0) { showToast('No hay ventas para exportar', true); return; }
  const efectivo = ventasDia.filter(v => v.metodo === 'Efectivo').reduce((a, v) => a + v.monto, 0);
  const debito = ventasDia.filter(v => v.metodo === 'Débito').reduce((a, v) => a + v.monto, 0);
  const credito = ventasDia.filter(v => v.metodo === 'Crédito').reduce((a, v) => a + v.monto, 0);
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
    <h1>💰 Caja — ${cajaFechaActual.split('-').reverse().join('/')}</h1>
    <table><thead><tr><th>#</th><th>Hora</th><th>Monto</th><th>Método</th></tr></thead><tbody>${filas}</tbody></table>
    <div class="totales">
      <div>Efectivo: $${efectivo.toLocaleString()}</div>
      <div>Débito: $${debito.toLocaleString()}</div>
      <div>Crédito: $${credito.toLocaleString()}</div>
      <div class="total-final">TOTAL: $${total.toLocaleString()}</div>
    </div>
    <p style="text-align:center;margin-top:30px;font-size:0.8rem;color:#888">Bodega A&M — ${new Date().toLocaleDateString('es-CL')}</p>
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
  const debito = ventasMes.filter(v => v.metodo === 'Débito').reduce((a, v) => a + v.monto, 0);
  const credito = ventasMes.filter(v => v.metodo === 'Crédito').reduce((a, v) => a + v.monto, 0);
  const total = efectivo + debito + credito ;
  const cEfectivo = ventasMes.filter(v => v.metodo === 'Efectivo').length;
  const cDebito = ventasMes.filter(v => v.metodo === 'Débito').length;
  const cCredito = ventasMes.filter(v => v.metodo === 'Crédito').length;
  const totalVentas = ventasMes.length;
  const pctEfectivo = totalVentas > 0 ? Math.round((cEfectivo / totalVentas) * 100) : 0;
  const pctDebito = totalVentas > 0 ? Math.round((cDebito / totalVentas) * 100) : 0;
  const pctCredito = totalVentas > 0 ? Math.round((cCredito / totalVentas) * 100) : 0;

  document.getElementById('cajaMesEfectivo').innerHTML = '$' + efectivo.toLocaleString() + `<br><span style="font-size:0.7rem;opacity:0.7">${cEfectivo} venta${cEfectivo!==1?'s':''} (${pctEfectivo}%)</span>`;
  document.getElementById('cajaMesDebito').innerHTML = '$' + debito.toLocaleString() + `<br><span style="font-size:0.7rem;opacity:0.7">${cDebito} venta${cDebito!==1?'s':''} (${pctDebito}%)</span>`;
  document.getElementById('cajaMesCredito').innerHTML = '$' + credito.toLocaleString() + `<br><span style="font-size:0.7rem;opacity:0.7">${cCredito} venta${cCredito!==1?'s':''} (${pctCredito}%)</span>`;
  document.getElementById('cajaMesTotal').innerHTML = '$' + total.toLocaleString() + `<br><span style="font-size:0.7rem;opacity:0.7">${totalVentas} venta${totalVentas!==1?'s':''} total</span>`;

  // Estadísticas extra
  // Venta más alta
  const ventaAlta = ventasMes.length > 0 ? Math.max(...ventasMes.map(v => v.monto)) : 0;
  document.getElementById('cajaMesVentaAlta').textContent = '$' + ventaAlta.toLocaleString();

  // Mejor día (más ingresos)
  const porDia = {};
  ventasMes.forEach(v => { porDia[v.fecha] = (porDia[v.fecha] || 0) + v.monto; });
  let mejorDia = '—';
  let maxDia = 0;
  Object.entries(porDia).forEach(([dia, monto]) => {
    if (monto > maxDia) { maxDia = monto; mejorDia = dia.slice(8,10) + '/' + dia.slice(5,7) + ' ($' + monto.toLocaleString() + ')'; }
  });
  document.getElementById('cajaMesMejorDia').textContent = mejorDia;

  // Promedio diario
  const diasConVentas = Object.keys(porDia).length;
  const promDiario = diasConVentas > 0 ? Math.round(total / diasConVentas) : 0;
  document.getElementById('cajaMesPromDiario').textContent = '$' + promDiario.toLocaleString();

  // Días trabajados
  document.getElementById('cajaMesDiasTrabajados').textContent = diasConVentas + ' días';

  // Método más usado
  const metodos = { Efectivo: cEfectivo, 'Débito': cDebito, 'Crédito': cCredito, Transferencia: cTransferencia };
  let metodoTop = '—';
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

// ── Ingresos y Egresos ──────────────────────────────────────────
function registrarMovimiento() {
  const tipo = document.getElementById('movTipo').value;
  const monto = parseInt(document.getElementById('movMonto').value);
  const motivo = document.getElementById('movMotivo').value.trim();
  const quien = document.getElementById('movQuien').value.trim();
  const fechaInput = document.getElementById('movFecha').value;

  if (!monto || monto <= 0) { showToast('Ingresa un monto válido', true); return; }
  if (!motivo) { showToast('Ingresa un motivo', true); return; }
  if (!quien) { showToast('Ingresa quién realiza el movimiento', true); return; }

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
  showToast('✔ ' + tipo + ' de $' + monto.toLocaleString() + ' registrado');
  registrarActividad(tipo + ' de Caja', tipo + ' de $' + monto.toLocaleString() + ' - ' + motivo);
}

function eliminarMovimiento(id) {
  if (!confirm('¿Eliminar este movimiento?')) return;
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
      <td><button class="btn-delete" onclick="eliminarMovimiento('${m.id}')" title="Eliminar">🗑</button></td>
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
    const pct = a > 0 ? Math.round((d / a) * 100) : (b > 0 ? '∞' : 0);
    const color = d > 0 ? '#065f46' : d < 0 ? '#c81e1e' : '#333';
    return `<span style="color:${color};font-weight:bold">${d >= 0 ? '+' : ''}${typeof d === 'number' && d > 999 ? '$'+d.toLocaleString() : d} (${pct}%)</span>`;
  }

  document.getElementById('tbodyCompSemanas').innerHTML = `
    <tr><td>Total Ventas</td><td>$${totalAnt.toLocaleString()}</td><td>$${totalEsta.toLocaleString()}</td><td>${diff(totalAnt, totalEsta)}</td></tr>
    <tr><td>Cantidad</td><td>${cantAnt}</td><td>${cantEsta}</td><td>${diff(cantAnt, cantEsta)}</td></tr>
    <tr><td>Efectivo</td><td>$${ventasAnt.filter(v=>v.metodo==='Efectivo').reduce((a,v)=>a+v.monto,0).toLocaleString()}</td><td>$${ventasEsta.filter(v=>v.metodo==='Efectivo').reduce((a,v)=>a+v.monto,0).toLocaleString()}</td><td></td></tr>
    <tr><td>Débito</td><td>$${ventasAnt.filter(v=>v.metodo==='Débito').reduce((a,v)=>a+v.monto,0).toLocaleString()}</td><td>$${ventasEsta.filter(v=>v.metodo==='Débito').reduce((a,v)=>a+v.monto,0).toLocaleString()}</td><td></td></tr>
    <tr><td>Crédito</td><td>$${ventasAnt.filter(v=>v.metodo==='Crédito').reduce((a,v)=>a+v.monto,0).toLocaleString()}</td><td>$${ventasEsta.filter(v=>v.metodo==='Crédito').reduce((a,v)=>a+v.monto,0).toLocaleString()}</td><td></td></tr>
    
  `;
  document.getElementById('comparacionSemanas').style.display = '';
});

// Gráficos de Caja
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

  // 1. Barras horizontales por día
  const porDia = {};
  ventas.forEach(v => {
    const dia = parseInt(v.fecha.slice(8, 10));
    porDia[dia] = (porDia[dia] || 0) + v.monto;
  });
  const maxDia = Math.max(...Object.values(porDia));
  let barrasH = '<h3 style="margin-bottom:8px">📊 Ventas por Día (Barras Horizontales)</h3>';
  const diasOrdenados = Object.keys(porDia).map(Number).sort((a, b) => a - b);
  diasOrdenados.forEach(dia => {
    const monto = porDia[dia];
    const pct = maxDia > 0 ? (monto / maxDia) * 100 : 0;
    barrasH += '<div class="chart-bar-h"><span class="label">' + dia + '</span><div class="bar" style="width:' + pct + '%"></div><span class="amount">$' + monto.toLocaleString() + '</span></div>';
  });

  // 2. Torta por método de pago
  const colores = { Efectivo: '#10b981', 'Débito': '#3b82f6', 'Crédito': '#f59e0b', Transferencia: '#8b5cf6' };
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
  let torta = '<h3 style="margin:20px 0 8px">🥧 Distribución por Método de Pago</h3>';
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
  let barrasV = '<h3 style="margin:20px 0 8px">📈 Total por Semana (Barras Verticales)</h3>';
  barrasV += '<div class="chart-vertical">';
  semanas.forEach((total, i) => {
    const pctH = maxSem > 0 ? (total / maxSem) * 100 : 0;
    barrasV += '<div class="vbar" style="height:' + Math.max(pctH, 2) + '%"><div style="margin-top:auto;padding:4px 2px;font-size:0.65rem">$' + total.toLocaleString() + '</div><div style="font-size:0.7rem;padding-bottom:2px">S' + (i + 1) + '</div></div>';
  });
  barrasV += '</div>';

  // 4. Barra de progreso apilada
  let apilada = '<h3 style="margin:20px 0 8px">🔋 Barra Apilada por Método</h3>';
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

  // 5. Barras por día de la semana
  const diasSemana = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
  const porDiaSemana = [0, 0, 0, 0, 0, 0, 0];
  ventas.forEach(v => {
    const d = new Date(v.fecha + 'T12:00:00');
    const dia = d.getDay(); // 0=dom
    porDiaSemana[dia === 0 ? 6 : dia - 1] += v.monto;
  });
  const maxDS = Math.max(...porDiaSemana);
  let barrasDiaSemana = '<h3 style="margin:20px 0 8px">📅 Ventas por Día de la Semana</h3>';
  barrasDiaSemana += '<div class="chart-vertical" style="height:130px">';
  diasSemana.forEach((nombre, i) => {
    const pctH = maxDS > 0 ? (porDiaSemana[i] / maxDS) * 100 : 0;
    const color = porDiaSemana[i] === maxDS && maxDS > 0 ? '#065f46' : '#3b82f6';
    barrasDiaSemana += '<div class="vbar" style="height:' + Math.max(pctH, 3) + '%;background:' + color + ';width:40px"><div style="margin-top:auto;padding:2px;font-size:0.6rem">$' + (porDiaSemana[i]/1000).toFixed(0) + 'k</div><div style="font-size:0.7rem;padding-bottom:2px">' + nombre + '</div></div>';
  });
  barrasDiaSemana += '</div>';

  // 6. Mini sparkline últimos 7 días
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
  let sparkline = '<h3 style="margin:20px 0 8px">📈 Tendencia Últimos 7 Días</h3>';
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
    const pct = a > 0 ? Math.round((d/a)*100) : (b > 0 ? '∞' : 0);
    const color = d > 0 ? '#065f46' : d < 0 ? '#c81e1e' : '#333';
    return `<span style="color:${color};font-weight:bold">${d>=0?'+':''}$${d.toLocaleString()} (${pct}%)</span>`;
  }
  function diffN(a, b) {
    const d = b - a;
    const pct = a > 0 ? Math.round((d/a)*100) : (b > 0 ? '∞' : 0);
    const color = d > 0 ? '#065f46' : d < 0 ? '#c81e1e' : '#333';
    return `<span style="color:${color};font-weight:bold">${d>=0?'+':''}${d} (${pct}%)</span>`;
  }
  document.getElementById('tbodyCajaCompMeses').innerHTML = `
    <tr><td>Total</td><td>$${t1.toLocaleString()}</td><td>$${t2.toLocaleString()}</td><td>${diff(t1,t2)}</td></tr>
    <tr><td>Cantidad ventas</td><td>${v1.length}</td><td>${v2.length}</td><td>${diffN(v1.length,v2.length)}</td></tr>
    <tr><td>Efectivo</td><td>$${v1.filter(v=>v.metodo==='Efectivo').reduce((a,v)=>a+v.monto,0).toLocaleString()}</td><td>$${v2.filter(v=>v.metodo==='Efectivo').reduce((a,v)=>a+v.monto,0).toLocaleString()}</td><td></td></tr>
    <tr><td>Débito</td><td>$${v1.filter(v=>v.metodo==='Débito').reduce((a,v)=>a+v.monto,0).toLocaleString()}</td><td>$${v2.filter(v=>v.metodo==='Débito').reduce((a,v)=>a+v.monto,0).toLocaleString()}</td><td></td></tr>
    <tr><td>Crédito</td><td>$${v1.filter(v=>v.metodo==='Crédito').reduce((a,v)=>a+v.monto,0).toLocaleString()}</td><td>$${v2.filter(v=>v.metodo==='Crédito').reduce((a,v)=>a+v.monto,0).toLocaleString()}</td><td></td></tr>
    
  `;
  document.getElementById('cajaCompMeses').style.display = '';
});

// Día más lento
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
  document.getElementById('cajaDiaLentoResult').textContent = '📉 ' + peorDia.split('-').reverse().join('/') + ' — $' + minMonto.toLocaleString() + ' (día más lento)';
});

// ── Informe Mensual Completo PDF ──────────────────────────────
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
  const tendencia = diffPct >= 0 ? 'se registró un crecimiento del ' + diffPct + '% en ingresos, indicando una tendencia positiva.' : 'se observó una disminución del ' + Math.abs(diffPct) + '% en ingresos. Se recomienda evaluar acciones correctivas.';
  const conclusiones = [
    '<p><strong>Resumen:</strong> El mes de ' + nombreMes + ' cerró con $' + total.toLocaleString() + ' en ' + ventas.length + ' ventas durante ' + diasConVentas + ' días. Promedio diario: $' + promDiario.toLocaleString() + '.</p><p><strong>Pagos:</strong> ' + metodoTop.n + ' fue el método principal con ' + metodoTop.c + ' operaciones (' + pctMetodo + '%).</p><p><strong>Documentos:</strong> ' + boletas.length + ' boletas (' + pctBoletas + '%), ' + facturas.length + ' facturas (' + pctFacturas + '%), ' + 0 + ' sin documento (' + pctSinDoc + '%).</p><p><strong>Rendimiento:</strong> Mejor día: ' + mejorDia.split("-").reverse().join("/") + ' ($' + mejorMonto.toLocaleString() + '). Peor día: ' + peorDia.split("-").reverse().join("/") + ' ($' + peorMonto.toLocaleString() + '). Diferencia: $' + diffMonto + '.</p><p><strong>Tendencia:</strong> ' + tendencia + '</p><p><strong>Patrones:</strong> ' + diaSemNombre + ' es el día más activo. Semana más fuerte: $' + maxSem + '.</p><p><strong>Recomendaciones:</strong></p><ul style="margin-left:20px;line-height:2"><li>Mantener registro consistente de todas las transacciones.</li><li>Incentivar pagos electrónicos para mayor seguridad.</li><li>Implementar promociones en días de baja actividad.</li><li>Establecer metas mensuales basadas en datos históricos.</li><li>Realizar seguimiento semanal de indicadores clave.</li><li>Capacitar personal para días de alta demanda.</li></ul><p><strong>Nota:</strong> Informe generado automáticamente por Bodega A&M.</p>',
    '<p><strong>Análisis Final:</strong> Durante ' + nombreMes + ', se procesaron ' + ventas.length + ' ventas por $' + total.toLocaleString() + ' en ' + diasConVentas + ' días operativos. Promedio: $' + promDiario.toLocaleString() + '/día.</p><p><strong>Comportamiento:</strong> Los clientes prefirieron ' + metodoTop.n + ' (' + metodoTop.c + ' ops, ' + pctMetodo + '%). Esto es relevante para la gestión de caja.</p><p><strong>Variabilidad:</strong> La brecha entre mejor día (' + mejorDia.split("-").reverse().join("/") + ': $' + mejorMonto.toLocaleString() + ') y peor (' + peorDia.split("-").reverse().join("/") + ': $' + peorMonto.toLocaleString() + ') fue de $' + diffMonto + '.</p><p><strong>Evolución:</strong> ' + tendencia + '</p><p><strong>Distribución:</strong> ' + diaSemNombre + ' concentra mayor actividad. Semana top: $' + maxSem + '.</p><p><strong>Tributario:</strong> ' + boletas.length + ' boletas, ' + facturas.length + ' facturas, ' + 0 + ' sin documento. Meta: reducir operaciones sin respaldo.</p><p><strong>Plan de Acción:</strong></p><ul style="margin-left:20px;line-height:2"><li>Definir meta del próximo mes basada en promedio actual +10%.</li><li>Reducir ventas sin documento a menos del 5%.</li><li>Evaluar horarios según patrones de demanda.</li><li>Considerar alianzas con proveedores de medios de pago.</li><li>Implementar incentivos para personal en días peak.</li><li>Programar revisiones semanales de KPIs.</li></ul><p><strong>Cierre:</strong> Este informe es base sólida para decisiones. Se recomienda revisión mensual sistemática.</p>',
    '<p><strong>Conclusiones:</strong> ' + nombreMes + ' registró ' + ventas.length + ' transacciones por $' + total.toLocaleString() + '. Operación en ' + diasConVentas + ' días con promedio de $' + promDiario.toLocaleString() + ' diarios.</p><p><strong>Perfil de Pagos:</strong> ' + metodoTop.n + ' lidera con ' + metodoTop.c + ' operaciones (' + pctMetodo + '%). Información valiosa para planificar flujo de caja.</p><p><strong>Días Destacados:</strong> Mejor: ' + mejorDia.split("-").reverse().join("/") + ' ($' + mejorMonto.toLocaleString() + '). Peor: ' + peorDia.split("-").reverse().join("/") + ' ($' + peorMonto.toLocaleString() + '). Brecha: $' + diffMonto + '.</p><p><strong>Histórico:</strong> ' + tendencia + '</p><p><strong>Ritmo:</strong> ' + diaSemNombre + ' es el día estrella. Semana más productiva: $' + maxSem + '. Estos patrones deben guiar la planificación operativa.</p><p><strong>Cumplimiento:</strong> ' + pctBoletas + '% boletas, ' + pctFacturas + '% facturas, ' + pctSinDoc + '% sin documento. Mejorar progresivamente la formalización.</p><p><strong>Líneas de Acción:</strong></p><ul style="margin-left:20px;line-height:2"><li>Fortalecer atención en días de mayor demanda.</li><li>Desarrollar estrategias de fidelización de clientes.</li><li>Explorar oportunidades de venta cruzada.</li><li>Automatizar generación de reportes para seguimiento ágil.</li><li>Establecer alertas tempranas para caídas en ventas.</li><li>Documentar mejores prácticas de días exitosos.</li></ul><p><strong>Observación:</strong> La consistencia en registro y análisis es base para crecimiento sostenido.</p>'
  ];
  return conclusiones[Math.floor(Math.random() * conclusiones.length)];
}

function generarInformeCaja(mes, mes2, guardarEnEscritorio) {
  const ventas = ventasCaja.filter(v => v.fecha && v.fecha.slice(0,7) === mes);
  if (ventas.length === 0) { showToast('No hay ventas en este mes', true); return; }

  const mesesNombres = ['','Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  const [anio, mesNum] = mes.split('-');
  const nombreMes = mesesNombres[parseInt(mesNum)] + ' ' + anio;

  // Cálculos
  const total = ventas.reduce((a,v) => a + v.monto, 0);
  const efectivo = ventas.filter(v => v.metodo==='Efectivo');
  const debito = ventas.filter(v => v.metodo==='Débito');
  const credito = ventas.filter(v => v.metodo==='Crédito');
  const boletas = ventas.filter(v => v.tipoDoc==='Boleta');
  const facturas = ventas.filter(v => v.tipoDoc==='Factura');
  
  // Por día
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

  // Por día de semana
  const diasSemNombres = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
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

  // Método más usado
  const metodos = [{n:'Efectivo',c:efectivo.length},{n:'Débito',c:debito.length},{n:'Crédito',c:credito.length}];
  metodos.sort((a,b) => b.c - a.c);
  const metodoTop = metodos[0];

  // Retiros del mes
  const retirosMes = retirosCaja.filter(r => r.fecha && r.fecha.slice(0,7) === mes);
  const totalRetirosMes = retirosMes.reduce((a, r) => a + r.monto, 0);

  // Por hora del día
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
    <h1>📦 Bodega A&amp;M</h1>
    <h2>Informe Mensual de Caja</h2>
    <h2 style="color:#1a56db;font-weight:bold">${nombreMes}</h2>
    <p class="fecha">Generado el ${fechaGen}</p>
  </div>

  <!-- ÍNDICE -->
  <div class="indice">
    <h2>Índice</h2>
    <ul>
      <li>1. Introducción</li>
      <li>2. Resumen Ejecutivo</li>
      <li>3. Desglose por Método de Pago</li>
      <li>4. Desglose por Tipo de Documento</li>
      <li>5. Análisis por Semana</li>
      <li>6. Análisis por Día de la Semana</li>
      <li>7. Mejor y Peor Día del Mes</li>
      <li>8. Comparación con Mes Anterior</li>
      <li>9. Retiros de Caja</li>
      <li>10. Horarios Pico de Ventas</li>
      <li>11. Gráfico de Tendencia Diaria</li>
      <li>12. Detalle Diario Resumido</li>
      <li>13. Detalle Completo de Ventas</li>
      <li>14. Conclusión y Recomendaciones</li>
    </ul>
  </div>

  <!-- 1. INTRODUCCIÓN -->
  <div class="seccion">
    <h2>1. Introducción</h2>
    <p>El presente informe tiene como objetivo proporcionar un análisis detallado y completo de las operaciones de caja realizadas durante el mes de <strong>${nombreMes}</strong> en Bodega A&M.</p>
    <p>Este documento recopila toda la información financiera registrada en el sistema de caja, incluyendo los ingresos por ventas, los métodos de pago utilizados por los clientes, la distribución por tipo de documento tributario, y el comportamiento de las transacciones a lo largo del período analizado.</p>
    <p>El análisis abarca múltiples dimensiones: desde el comportamiento diario y semanal de las ventas, hasta la comparación con períodos anteriores, permitiendo identificar tendencias, patrones de consumo y oportunidades de mejora en la gestión financiera del negocio.</p>
    <p>La información contenida en este informe es de carácter interno y confidencial, destinada exclusivamente a facilitar la toma de decisiones estratégicas por parte de la administración de Bodega A&M.</p>
    <p>Los datos presentados fueron extraídos directamente del sistema de registro de caja digital, garantizando la precisión y confiabilidad de las cifras reportadas. Cada transacción fue registrada en tiempo real durante las operaciones diarias del establecimiento, asegurando la integridad de la información.</p>
    <p>Se recomienda utilizar este informe como herramienta de referencia para evaluar el desempeño financiero del mes, identificar los días y métodos de pago más relevantes, y planificar estrategias comerciales para los períodos siguientes.</p>
    <p>El documento se estructura en secciones que van desde un resumen ejecutivo con los indicadores clave, pasando por análisis detallados por método de pago, tipo de documento, comportamiento semanal y diario, hasta llegar a una conclusión con recomendaciones concretas para la mejora continua del negocio.</p>
    <p>Este informe fue generado de forma automática por el sistema de gestión de Bodega A&M el día ${fechaGen}, y corresponde al período comprendido entre el 1 y el último día del mes de ${nombreMes}.</p>
  </div>

  <!-- 2. RESUMEN EJECUTIVO -->
  <div class="seccion" style="page-break-inside:auto">
    <h2>2. Resumen Ejecutivo</h2>
    <p style="font-size:0.82rem;color:#555;margin-bottom:10px;line-height:1.5">
      Esta sección presenta los indicadores clave de rendimiento (KPI) del mes de ${nombreMes}.<br>
      Se muestra el ingreso total, cantidad de ventas, promedio diario, días operativos, método preferido y variación vs mes anterior.<br>
      Estos indicadores ofrecen una fotografía rápida del desempeño financiero mensual.
    </p>
    <div class="kpi-grid">
      <div class="kpi"><div class="num">${total.toLocaleString()}</div><div class="label">Total del Mes</div></div>
      <div class="kpi"><div class="num">${ventas.length}</div><div class="label">Total Ventas</div></div>
      <div class="kpi"><div class="num">${promDiario.toLocaleString()}</div><div class="label">Promedio Diario</div></div>
      <div class="kpi"><div class="num">${diasConVentas}</div><div class="label">Días con Ventas</div></div>
      <div class="kpi"><div class="num">${metodoTop.n}</div><div class="label">Método Más Usado</div></div>
      <div class="kpi"><div class="num">${diffPct >= 0 ? '+' : ''}${diffPct}%</div><div class="label">vs Mes Anterior</div></div>
    </div>
    <div style="margin-top:12px;padding:12px 14px;background:#f0f4ff;border-radius:6px;font-size:0.82rem;color:#444;border-left:3px solid #1a56db;line-height:1.6">
      <strong>Conclusión de esta sección:</strong><br>
      Durante ${nombreMes} se procesaron ${ventas.length} transacciones que generaron ingresos por $${total.toLocaleString()}.<br>
      El promedio diario de ventas fue de $${promDiario.toLocaleString()}, calculado sobre ${diasConVentas} días con actividad comercial registrada.<br>
      El método de pago preferido por los clientes fue ${metodoTop.n}, concentrando ${metodoTop.c} operaciones del total.<br>
      ${diffPct >= 0 ? 'Se observa un crecimiento del ' + diffPct + '% respecto al mes anterior, indicando tendencia positiva.' : 'Se registró una caída del ' + Math.abs(diffPct) + '% respecto al mes anterior, lo que requiere atención.'}<br>
      Estos números reflejan el pulso general del negocio y sirven como base para decisiones estratégicas.<br>
      Se recomienda revisar las secciones siguientes para entender el comportamiento detrás de estos indicadores.<br>
      El análisis por método de pago y tipo de documento complementa esta visión general.
    </div>
  </div>

  <!-- 2. DESGLOSE POR MÉTODO -->
  <div class="seccion">
    <h2>3. Desglose por Método de Pago</h2>
    <p style="font-size:0.85rem;color:#555;margin-bottom:14px;line-height:1.6">
      En esta sección se analiza cómo se distribuyeron los pagos según el medio utilizado por los clientes.<br>
      Se presentan los cuatro métodos disponibles: Efectivo, Débito, Crédito y Transferencia bancaria.<br>
      Para cada método se muestra el monto total recaudado, la cantidad de transacciones y su porcentaje.<br>
      El gráfico circular permite visualizar rápidamente qué método predomina en cantidad de operaciones.<br>
      Las barras de distribución por monto muestran qué método concentra mayor volumen de dinero.<br>
      Esta información es útil para evaluar si conviene incentivar algún medio de pago específico.<br>
      También permite anticipar necesidades de cambio en efectivo o verificar comisiones por tarjeta.
    </p>
    <table>
      <tr><th>Método</th><th>Monto</th><th>Ventas</th><th>%</th></tr>
      <tr><td>Efectivo</td><td>$${efectivo.reduce((a,v)=>a+v.monto,0).toLocaleString()}</td><td>${efectivo.length}</td><td>${ventas.length>0?Math.round((efectivo.length/ventas.length)*100):0}%</td></tr>
      <tr><td>Débito</td><td>$${debito.reduce((a,v)=>a+v.monto,0).toLocaleString()}</td><td>${debito.length}</td><td>${ventas.length>0?Math.round((debito.length/ventas.length)*100):0}%</td></tr>
      <tr><td>Crédito</td><td>$${credito.reduce((a,v)=>a+v.monto,0).toLocaleString()}</td><td>${credito.length}</td><td>${ventas.length>0?Math.round((credito.length/ventas.length)*100):0}%</td></tr>
      
      <tr style="font-weight:bold;background:#e0e7ff"><td>TOTAL</td><td>$${total.toLocaleString()}</td><td>${ventas.length}</td><td>100%</td></tr>
    </table>
    <div style="display:flex;align-items:center;justify-content:space-around;margin-top:20px;flex-wrap:wrap">
      <div style="width:160px;height:160px;border-radius:50%;background:conic-gradient(#10b981 0% ${ventas.length>0?Math.round((efectivo.length/ventas.length)*100):0}%, #3b82f6 ${ventas.length>0?Math.round((efectivo.length/ventas.length)*100):0}% ${ventas.length>0?Math.round(((efectivo.length+debito.length)/ventas.length)*100):0}%, #f59e0b ${ventas.length>0?Math.round(((efectivo.length+debito.length)/ventas.length)*100):0}% ${ventas.length>0?Math.round(((efectivo.length+debito.length+credito.length)/ventas.length)*100):0}%)"></div>
      <div style="font-size:0.85rem">
        <div style="margin:6px 0"><span style="display:inline-block;width:14px;height:14px;background:#10b981;border-radius:50%;vertical-align:middle;margin-right:6px"></span>Efectivo: ${ventas.length>0?Math.round((efectivo.length/ventas.length)*100):0}%</div>
        <div style="margin:6px 0"><span style="display:inline-block;width:14px;height:14px;background:#3b82f6;border-radius:50%;vertical-align:middle;margin-right:6px"></span>Débito: ${ventas.length>0?Math.round((debito.length/ventas.length)*100):0}%</div>
        <div style="margin:6px 0"><span style="display:inline-block;width:14px;height:14px;background:#f59e0b;border-radius:50%;vertical-align:middle;margin-right:6px"></span>Crédito: ${ventas.length>0?Math.round((credito.length/ventas.length)*100):0}%</div>
        <div style="margin:6px 0"><span style="display:inline-block;width:14px;height:14px;background:#8b5cf6;border-radius:50%;vertical-align:middle;margin-right:6px"></span>Transferencia: ${ventas.length>0?Math.round((0/ventas.length)*100):0}%</div>
      </div>
    </div>
    <div style="margin-top:20px">
      <p style="font-weight:600;margin-bottom:8px">Distribución por Monto:</p>
      <div style="display:flex;align-items:center;margin:4px 0"><span style="width:100px;font-size:0.8rem">Efectivo</span><div style="height:20px;background:#10b981;border-radius:3px;width:${total>0?Math.round((efectivo.reduce((a,v)=>a+v.monto,0)/total)*100):0}%"></div><span style="margin-left:6px;font-size:0.8rem">${total>0?Math.round((efectivo.reduce((a,v)=>a+v.monto,0)/total)*100):0}%</span></div>
      <div style="display:flex;align-items:center;margin:4px 0"><span style="width:100px;font-size:0.8rem">Débito</span><div style="height:20px;background:#3b82f6;border-radius:3px;width:${total>0?Math.round((debito.reduce((a,v)=>a+v.monto,0)/total)*100):0}%"></div><span style="margin-left:6px;font-size:0.8rem">${total>0?Math.round((debito.reduce((a,v)=>a+v.monto,0)/total)*100):0}%</span></div>
      <div style="display:flex;align-items:center;margin:4px 0"><span style="width:100px;font-size:0.8rem">Crédito</span><div style="height:20px;background:#f59e0b;border-radius:3px;width:${total>0?Math.round((credito.reduce((a,v)=>a+v.monto,0)/total)*100):0}%"></div><span style="margin-left:6px;font-size:0.8rem">${total>0?Math.round((credito.reduce((a,v)=>a+v.monto,0)/total)*100):0}%</span></div>
      <div style="display:flex;align-items:center;margin:4px 0"><span style="width:100px;font-size:0.8rem">Transferencia</span><div style="height:20px;background:#8b5cf6;border-radius:3px;width:${total>0?Math.round((0/total)*100):0}%"></div><span style="margin-left:6px;font-size:0.8rem">${total>0?Math.round((0/total)*100):0}%</span></div>
    </div>

    <div style="margin-top:16px;padding:12px 14px;background:#f0f4ff;border-radius:6px;font-size:0.82rem;color:#444;border-left:3px solid #1a56db;line-height:1.6">
      <strong>Conclusión de esta sección:</strong><br>
      El método de pago dominante en ${nombreMes} fue ${metodoTop.n} con ${metodoTop.c} transacciones (${ventas.length>0?Math.round((metodoTop.c/ventas.length)*100):0}% del total).<br>
      En términos de monto, Efectivo representó ${efectivo.reduce((a,v)=>a+v.monto,0).toLocaleString()}, Débito ${debito.reduce((a,v)=>a+v.monto,0).toLocaleString()}, Crédito ${credito.reduce((a,v)=>a+v.monto,0).toLocaleString()}<br>
      La distribución muestra las preferencias de los clientes y permite anticipar necesidades operativas.<br>
      Si el efectivo predomina, es importante mantener fondo de caja suficiente para dar cambio.<br>
      Las transferencias bancarias reducen el riesgo de manejo de efectivo aunque demoran en confirmarse.<br>
      Se sugiere monitorear mes a mes si algún método crece o decrece para adaptar la infraestructura.<br>
      Considere ofrecer incentivos en métodos que desee promover según conveniencia del negocio.
    </div>
  </div>

  <!-- 3. DESGLOSE POR TIPO DOCUMENTO -->
  <div class="seccion">
    <h2>4. Desglose por Tipo de Documento</h2>
    <p style="font-size:0.85rem;color:#555;margin-bottom:14px;line-height:1.6">
      Esta sección muestra la distribución de ventas según el tipo de documento tributario emitido.<br>
      Se clasifican en Boleta y Factura, indicando monto, cantidad y porcentaje de cada tipo.<br>
      Las boletas corresponden a ventas a consumidor final, mientras que las facturas se emiten a empresas.<br>
            Este análisis permite verificar el cumplimiento de obligaciones tributarias del negocio.<br>
            Utilice estos datos para preparar declaraciones de impuestos y auditorías internas.
    </p>
    <table>
      <tr><th>Tipo</th><th>Monto</th><th>Cantidad</th><th>%</th></tr>
      <tr><td>Boleta</td><td>$${boletas.reduce((a,v)=>a+v.monto,0).toLocaleString()}</td><td>${boletas.length}</td><td>${ventas.length>0?Math.round((boletas.length/ventas.length)*100):0}%</td></tr>
      <tr><td>Factura</td><td>$${facturas.reduce((a,v)=>a+v.monto,0).toLocaleString()}</td><td>${facturas.length}</td><td>${ventas.length>0?Math.round((facturas.length/ventas.length)*100):0}%</td></tr>
      
    </table>

    <div style="margin-top:16px;padding:12px 14px;background:#f0f4ff;border-radius:6px;font-size:0.82rem;color:#444;border-left:3px solid #1a56db;line-height:1.6">
      <strong>Conclusión de esta sección:</strong><br>
      Del total de ${ventas.length} ventas, se emitieron ${boletas.length} boletas (${ventas.length>0?Math.round((boletas.length/ventas.length)*100):0}%), ${facturas.length} facturas (${ventas.length>0?Math.round((facturas.length/ventas.length)*100):0}%) y ${0} sin documento (${ventas.length>0?Math.round((0/ventas.length)*100):0}%).<br>
      Las boletas generaron ${boletas.reduce((a,v)=>a+v.monto,0).toLocaleString()} y las facturas ${facturas.reduce((a,v)=>a+v.monto,0).toLocaleString()} en ingresos documentados.<br>
      ${0 > 0 ? 'Existen ' + 0 + ' ventas sin respaldo tributario, lo cual debe reducirse progresivamente.' : 'Todas las ventas cuentan con respaldo tributario, lo cual es óptimo.'}<br>
      El cumplimiento tributario es fundamental para evitar sanciones del SII y mantener la formalidad.<br>
      Se recomienda que toda venta, sin importar el monto, cuente con al menos una boleta como respaldo.<br>
      Las facturas son relevantes para clientes empresa y permiten recuperar IVA en compras corporativas.<br>
      Mantenga el registro formal de todas las ventas para cumplimiento tributario.
    </div>
  </div>

  <!-- 4. ANÁLISIS POR SEMANA -->
  <div class="seccion">
    <h2>5. Análisis por Semana</h2>
    <p style="font-size:0.85rem;color:#555;margin-bottom:14px;line-height:1.6">
      Aquí se divide el mes en cuatro semanas para identificar en qué período se concentran las ventas.<br>
      La Semana 1 comprende los días 1 al 7, la Semana 2 del 8 al 14, la Semana 3 del 15 al 21 y la Semana 4 del 22 en adelante.<br>
      Para cada semana se muestra el monto total recaudado y su porcentaje respecto al ingreso mensual.<br>
      Este análisis permite detectar si las ventas se concentran a inicio, mitad o fin de mes.<br>
      Patrones como mayor venta en la primera semana pueden indicar compras post-sueldo de los clientes.<br>
      Identificar semanas débiles ayuda a planificar promociones o acciones comerciales específicas.<br>
      Compare estos datos mes a mes para confirmar si los patrones semanales son consistentes.
    </p>
    <table>
      <tr><th>Semana</th><th>Período</th><th>Monto</th><th>% del Total</th></tr>
      <tr><td>Semana 1</td><td>Días 1-7</td><td>$${semanas[0].toLocaleString()}</td><td>${total>0?Math.round((semanas[0]/total)*100):0}%</td></tr>
      <tr><td>Semana 2</td><td>Días 8-14</td><td>$${semanas[1].toLocaleString()}</td><td>${total>0?Math.round((semanas[1]/total)*100):0}%</td></tr>
      <tr><td>Semana 3</td><td>Días 15-21</td><td>$${semanas[2].toLocaleString()}</td><td>${total>0?Math.round((semanas[2]/total)*100):0}%</td></tr>
      <tr><td>Semana 4</td><td>Días 22+</td><td>$${semanas[3].toLocaleString()}</td><td>${total>0?Math.round((semanas[3]/total)*100):0}%</td></tr>
    </table>

    <div style="margin-top:16px;padding:12px 14px;background:#f0f4ff;border-radius:6px;font-size:0.82rem;color:#444;border-left:3px solid #1a56db;line-height:1.6">
      <strong>Conclusión de esta sección:</strong><br>
      La semana con mayor recaudación alcanzó ${Math.max(...semanas).toLocaleString()}, representando ${total>0?Math.round((Math.max(...semanas)/total)*100):0}% del ingreso total.<br>
      Distribución: Semana 1 (${semanas[0].toLocaleString()}), Semana 2 (${semanas[1].toLocaleString()}), Semana 3 (${semanas[2].toLocaleString()}) y Semana 4 (${semanas[3].toLocaleString()}).<br>
      ${semanas[0] > semanas[3] ? 'Las ventas se concentran al inicio del mes, posiblemente por el ciclo de pago de sueldos.' : 'Las ventas se concentran hacia fin de mes, lo que puede indicar compras de reposición.'}<br>
      Una distribución equilibrada entre semanas indica estabilidad en la demanda del negocio.<br>
      Si alguna semana es significativamente baja, considere implementar promociones en ese período.<br>
      Monitorear este patrón mes a mes permite confirmar si es comportamiento estacional o puntual.<br>
      Use esta información para planificar compras a proveedores y gestionar el flujo de caja semanal.
    </div>
  </div>

  <!-- 5. ANÁLISIS POR DÍA DE LA SEMANA -->
  <div class="seccion">
    <h2>6. Análisis por Día de la Semana</h2>
    <p style="font-size:0.85rem;color:#555;margin-bottom:14px;line-height:1.6">
      Esta sección agrupa todas las ventas del mes según el día de la semana en que se realizaron.<br>
      Se muestra el monto acumulado para cada día (Lunes a Domingo) y su porcentaje del total mensual.<br>
      El día con mayor recaudación se resalta en verde para identificarlo rápidamente.<br>
      Este análisis revela los días de mayor y menor actividad comercial de la bodega.<br>
      Conocer los días fuertes permite optimizar la dotación de personal y el stock disponible.<br>
      Los días débiles pueden aprovecharse para tareas administrativas, reposición o promociones.<br>
      Si un día específico es consistentemente bajo, considere ajustar horarios u ofertas especiales.
    </p>
    <table>
      <tr><th>Día</th><th>Monto Total</th><th>% del Total</th></tr>
      ${diasSemNombres.map((n,i) => `<tr${porDiaSem[i]===diaSemMax?' style="background:#d1fae5;font-weight:bold"':''}><td>${n}</td><td>$${porDiaSem[i].toLocaleString()}</td><td>${total>0?Math.round((porDiaSem[i]/total)*100):0}%</td></tr>`).join('')}
    </table>
    <p style="margin-top:8px"><strong>Día más activo:</strong> ${diaSemNombre}</p>

    <div style="margin-top:16px;padding:12px 14px;background:#f0f4ff;border-radius:6px;font-size:0.82rem;color:#444;border-left:3px solid #1a56db;line-height:1.6">
      <strong>Conclusión de esta sección:</strong><br>
      El día de la semana con mayor actividad fue ${diaSemNombre}, acumulando ${diaSemMax.toLocaleString()} (${total>0?Math.round((diaSemMax/total)*100):0}% del total).<br>
      Este patrón indica que los clientes tienden a realizar sus compras principalmente los días ${diaSemNombre}.<br>
      Los días con menor recaudación representan oportunidades para implementar estrategias de atracción.<br>
      Se recomienda reforzar el personal y el stock disponible en los días de mayor demanda identificados.<br>
      En los días más tranquilos, aproveche para realizar inventarios, limpieza y tareas administrativas.<br>
      Si este patrón se repite mes a mes, puede considerarse ajustar horarios de apertura según demanda.<br>
      Compare con meses anteriores para confirmar si ${diaSemNombre} es consistentemente el día más fuerte.
    </div>
  </div>

  <!-- 6. MEJOR Y PEOR DÍA -->
  <div class="seccion">
    <h2>7. Mejor y Peor Día del Mes</h2>
    <p style="font-size:0.85rem;color:#555;margin-bottom:14px;line-height:1.6">
      Se identifican los dos días extremos del mes: el de mayor y menor recaudación.<br>
      El mejor día representa la jornada con más ingresos, posiblemente por eventos o demanda estacional.<br>
      El peor día muestra la jornada con menor actividad, útil para investigar causas (feriados, clima).<br>
      La diferencia entre ambos indica la variabilidad de las ventas durante el mes.<br>
      Si la brecha es muy grande, el negocio depende de días puntuales y debería buscar mayor estabilidad.<br>
      Analizar qué ocurrió en el mejor día puede ayudar a replicar esas condiciones en el futuro.<br>
      Entender el peor día permite tomar medidas preventivas para evitar jornadas improductivas.
    </p>
    <div class="kpi-grid" style="grid-template-columns:1fr 1fr">
      <div class="kpi" style="background:#d1fae5"><div class="num">$${mejorMonto.toLocaleString()}</div><div class="label">🏆 Mejor Día: ${mejorDia.split('-').reverse().join('/')}</div></div>
      <div class="kpi" style="background:#fee2e2"><div class="num">$${peorMonto.toLocaleString()}</div><div class="label">📉 Peor Día: ${peorDia.split('-').reverse().join('/')}</div></div>
    </div>

    <div style="margin-top:16px;padding:12px 14px;background:#f0f4ff;border-radius:6px;font-size:0.82rem;color:#444;border-left:3px solid #1a56db;line-height:1.6">
      <strong>Conclusión de esta sección:</strong><br>
      El mejor día del mes fue el ${mejorDia.split('-').reverse().join('/')} con ${mejorMonto.toLocaleString()}, y el peor fue el ${peorDia.split('-').reverse().join('/')} con ${peorMonto.toLocaleString()}.<br>
      La diferencia entre ambos extremos es de ${(mejorMonto - peorMonto).toLocaleString()}, reflejando la variabilidad de ventas.<br>
      ${(mejorMonto - peorMonto) > promDiario * 2 ? 'La brecha es significativa, indicando dependencia de días puntuales de alta demanda.' : 'La brecha es moderada, sugiriendo una demanda relativamente estable.'}<br>
      Investigue qué factores contribuyeron al éxito del mejor día para intentar replicarlos.<br>
      Analice si el peor día coincidió con feriados, mal clima u otros factores externos.<br>
      El objetivo es reducir esta brecha logrando ventas más consistentes a lo largo del mes.<br>
      Establezca un piso mínimo de ventas diarias como meta y actúe cuando un día caiga por debajo.
    </div>
  </div>

  <!-- 7. COMPARACIÓN CON MES ANTERIOR -->
  <div class="seccion">
    <h2>8. Comparación con Mes Anterior</h2>
    <p style="font-size:0.85rem;color:#555;margin-bottom:14px;line-height:1.6">
      Esta sección compara el rendimiento del mes actual con el mes inmediatamente anterior.<br>
      Se contrastan el monto total recaudado y la cantidad de ventas realizadas en ambos períodos.<br>
      La columna de diferencia muestra el crecimiento o decrecimiento en porcentaje y unidades.<br>
      Un valor positivo (verde) indica mejora respecto al mes anterior; negativo (rojo) indica retroceso.<br>
      Esta comparación es fundamental para evaluar la tendencia del negocio mes a mes.<br>
      Caídas significativas deben investigarse: pueden deberse a estacionalidad o competencia.<br>
      Crecimientos sostenidos confirman que las estrategias comerciales están funcionando correctamente.
    </p>
    <table>
      <tr><th>Indicador</th><th>${nombreMes}</th><th>Mes Anterior</th><th>Diferencia</th></tr>
      <tr><td>Total</td><td>$${total.toLocaleString()}</td><td>$${totalAnt.toLocaleString()}</td><td style="color:${diffPct>=0?'#065f46':'#c81e1e'};font-weight:bold">${diffPct>=0?'+':''}${diffPct}%</td></tr>
      <tr><td>Cantidad Ventas</td><td>${ventas.length}</td><td>${ventasAnt.length}</td><td>${ventas.length - ventasAnt.length >= 0 ? '+' : ''}${ventas.length - ventasAnt.length}</td></tr>
    </table>

    <div style="margin-top:16px;padding:12px 14px;background:#f0f4ff;border-radius:6px;font-size:0.82rem;color:#444;border-left:3px solid #1a56db;line-height:1.6">
      <strong>Conclusión de esta sección:</strong><br>
      ${diffPct >= 0 ? 'El mes de ' + nombreMes + ' mostró un crecimiento del ' + diffPct + '% en ingresos respecto al mes anterior.' : 'El mes de ' + nombreMes + ' mostró una caída del ' + Math.abs(diffPct) + '% en ingresos respecto al mes anterior.'}<br>
      En cantidad de transacciones, se pasó de ${ventasAnt.length} a ${ventas.length} ventas (${ventas.length - ventasAnt.length >= 0 ? '+' : ''}${ventas.length - ventasAnt.length} operaciones).<br>
      ${diffPct >= 0 ? 'Esta tendencia positiva debe mantenerse y potenciarse con las estrategias actuales.' : 'Se recomienda investigar las causas de la disminución y tomar medidas correctivas.'}<br>
      Factores como estacionalidad, días hábiles y eventos especiales pueden influir en estas variaciones.<br>
      Compare al menos 3 meses consecutivos para identificar si es una tendencia o un evento aislado.<br>
      Establezca metas mensuales basadas en el promedio de los últimos 3 meses más un % de crecimiento.<br>
      El seguimiento mensual constante es la base para una gestión financiera efectiva del negocio.
    </div>
  </div>

  <!-- RETIROS DE CAJA -->
  <div class="seccion" style="page-break-inside:auto">
    <h2>9. Retiros de Caja</h2>
    <p style="font-size:0.85rem;color:#555;margin-bottom:14px;line-height:1.6">
      Registro de todos los retiros de efectivo realizados durante el mes.<br>
      Los retiros corresponden a entregas de dinero desde la caja hacia los propietarios del negocio.<br>
      Se detalla el monto, destinatario, fecha, hora y operador que realizó cada retiro.<br>
      Esta información permite llevar un control preciso del efectivo que sale de la caja.<br>
      El saldo neto (ventas - retiros) indica cuánto dinero debería quedar físicamente en caja.<br>
      Mantenga un registro consistente de retiros para evitar descuadres al cierre del día.<br>
      Compare el total de retiros con el total de ventas en efectivo para verificar coherencia.
    </p>
    <div class="kpi-grid" style="grid-template-columns:1fr 1fr 1fr;margin-bottom:16px">
      <div class="kpi"><div class="num">${retirosMes.length}</div><div class="label">Total Retiros</div></div>
      <div class="kpi"><div class="num">$${totalRetirosMes.toLocaleString()}</div><div class="label">Monto Retirado</div></div>
      <div class="kpi"><div class="num">$${(total - totalRetirosMes).toLocaleString()}</div><div class="label">Ingreso Neto</div></div>
    </div>
    ${retirosMes.length > 0 ? '<table><tr><th>#</th><th>Fecha</th><th>Hora</th><th>Monto</th><th>Entregar a</th><th>Quien retira</th><th>Nota</th></tr>' + retirosMes.map((r,i) => '<tr><td>' + (i+1) + '</td><td>' + r.fecha.split('-').reverse().join('/') + '</td><td>' + r.hora + '</td><td style="color:#c81e1e;font-weight:bold">-$' + r.monto.toLocaleString() + '</td><td>' + r.destinatario + '</td><td>' + (r.quienRetira||r.operador) + '</td><td>' + (r.nota||'-') + '</td></tr>').join('') + '</table>' : '<p style="text-align:center;color:#888">No se registraron retiros en este mes</p>'}
    <div style="margin-top:12px;padding:12px 14px;background:#f0f4ff;border-radius:6px;font-size:0.82rem;color:#444;border-left:3px solid #1a56db;line-height:1.6">
      <strong>Conclusión de esta sección:</strong><br>
      Durante ${nombreMes} se realizaron ${retirosMes.length} retiros de caja por un total de $${totalRetirosMes.toLocaleString()}.<br>
      El ingreso neto del mes (ventas menos retiros) fue de $${(total - totalRetirosMes).toLocaleString()}.<br>
      ${retirosMes.length > 0 ? 'El retiro promedio fue de $' + Math.round(totalRetirosMes / retirosMes.length).toLocaleString() + ' por operación.' : 'No se registraron retiros durante este período.'}<br>
      Los retiros representan el ${total > 0 ? Math.round((totalRetirosMes/total)*100) : 0}% del total de ventas del mes.<br>
      Es importante que cada retiro quede documentado para mantener la trazabilidad del efectivo.<br>
      Verifique que el saldo físico en caja coincida con el saldo calculado por el sistema.<br>
      Un control riguroso de retiros previene descuadres y facilita la rendición de cuentas.
    </div>
  </div>

  <!-- 9. HORARIOS PICO -->
  <div class="seccion" style="page-break-inside:auto">
    <h2>10. Horarios Pico de Ventas</h2>
    <p style="font-size:0.85rem;color:#555;margin-bottom:14px;line-height:1.6">
      Esta sección analiza en qué horas del día se concentran las ventas del mes.<br>
      Se muestra el monto acumulado y la cantidad de transacciones para cada franja horaria.<br>
      Identificar los horarios pico permite optimizar la atención al cliente y la dotación de personal.<br>
      Las horas con baja actividad pueden aprovecharse para tareas administrativas o reposición.<br>
      El gráfico de barras visualiza rápidamente las horas de mayor y menor movimiento.<br>
      Esta información es clave para definir horarios de apertura y cierre óptimos.<br>
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
      <strong>Conclusión de esta sección:</strong><br>
      La hora con mayor actividad fue las ${String(horaPico).padStart(2,'0')}:00, acumulando $${horaMax.toLocaleString()} en ventas.<br>
      ${ventasPorHora[horaPico]} transacciones se realizaron en esa franja horaria durante todo el mes.<br>
      Los horarios con mayor movimiento deben contar con personal suficiente para atender la demanda.<br>
      Las horas sin ventas registradas indican períodos donde el local podría estar cerrado o sin clientes.<br>
      Si hay ventas concentradas en pocas horas, considere extender horarios o crear incentivos fuera de pico.<br>
      Conocer los horarios pico también ayuda a planificar los horarios de colación del personal.<br>
      Use esta información para decidir si conviene abrir más temprano o cerrar más tarde según la demanda real.
    </div>
  </div>

  <!-- 10. GRÁFICO DE TENDENCIA DIARIA -->
  <div class="seccion" style="page-break-inside:auto">
    <h2>11. Gráfico de Tendencia Diaria</h2>
    <p style="font-size:0.85rem;color:#555;margin-bottom:14px;line-height:1.6">
      Visualización gráfica de la evolución de ventas día a día durante el mes.<br>
      Cada barra representa el monto total vendido en un día específico del mes.<br>
      La línea punteada indica el promedio diario como referencia visual.<br>
      Los días por encima del promedio se muestran en azul oscuro, los que están por debajo en azul claro.<br>
      Este gráfico permite identificar rápidamente tendencias, picos y caídas en las ventas.<br>
      Es útil para detectar patrones como caídas de fin de semana o picos a inicio de mes.<br>
      Compare visualmente con el gráfico del mes anterior para evaluar la evolución del negocio.
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
      <strong>Conclusión de esta sección:</strong><br>
      El gráfico muestra la evolución de ventas durante los ${diasConVentas} días operativos del mes.<br>
      El promedio diario fue de $${promDiario.toLocaleString()}, representado como línea de referencia.<br>
      ${diasOrdenados.filter(([,m]) => m >= promDiario).length} días superaron el promedio (barras azul oscuro) y ${diasOrdenados.filter(([,m]) => m < promDiario).length} quedaron por debajo (azul claro).<br>
      El día más alto alcanzó $${mejorMonto.toLocaleString()} y el más bajo $${peorMonto.toLocaleString()}.<br>
      Una tendencia ascendente indica crecimiento progresivo; descendente sugiere pérdida de impulso.<br>
      Los picos aislados pueden corresponder a eventos especiales, promociones o días de alta demanda estacional.<br>
      Utilice este gráfico para planificar acciones comerciales en los períodos de menor actividad.
    </div>
  </div>

    <!-- 11. DETALLE DIARIO RESUMIDO -->
  <div class="seccion">
    <h2>12. Detalle Diario Resumido</h2>
    <p style="font-size:0.85rem;color:#555;margin-bottom:14px;line-height:1.6">
      Tabla con el resumen de ventas día por día durante todo el mes analizado.<br>
      Para cada fecha se muestra el monto total recaudado y la cantidad de transacciones realizadas.<br>
      Los días sin registro no aparecen en la tabla, indicando jornadas sin actividad comercial.<br>
      Este detalle permite identificar patrones diarios, días atípicos o irregularidades en el registro.<br>
      Es útil para cruzar información con otros registros como inventario o asistencia del personal.<br>
      Los días con montos inusualmente altos o bajos merecen revisión para entender sus causas.<br>
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
      <strong>Conclusión de esta sección:</strong><br>
      Se registraron ventas en ${diasConVentas} días del mes, con ingreso total de ${total.toLocaleString()} y promedio de ${promDiario.toLocaleString()} por día.<br>
      El día más productivo generó ${mejorMonto.toLocaleString()} y el menos productivo ${peorMonto.toLocaleString()}.<br>
      ${diasConVentas < 25 ? 'Hubo ' + (30 - diasConVentas) + ' días sin ventas, lo que podría indicar días de cierre o falta de registro.' : 'La cobertura de días con ventas es alta, indicando operación regular del negocio.'}<br>
      Los días con montos superiores al promedio representan oportunidades para entender qué genera mayor demanda.<br>
      Los días por debajo del promedio deben analizarse para identificar si son patrones o situaciones puntuales.<br>
      Esta tabla es útil para la cuadratura diaria de caja y para detectar posibles omisiones en el registro.<br>
      Mantenga un registro consistente todos los días para que este análisis sea cada vez más preciso.
    </div>
  </div>

  <!-- 12. DETALLE COMPLETO -->
  <div class="seccion">
    <h2>13. Detalle Completo de Ventas</h2>
    <p style="font-size:0.85rem;color:#555;margin-bottom:14px;line-height:1.6">
      Listado exhaustivo de cada transacción individual registrada durante el mes.<br>
      Cada fila incluye: número correlativo, fecha, hora, monto, método de pago y tipo de documento.<br>
      Este es el registro más detallado disponible y sirve como respaldo documental completo.<br>
      Permite verificar transacciones específicas en caso de reclamos, devoluciones o auditorías.<br>
      La hora de registro ayuda a identificar los horarios de mayor actividad durante el día.<br>
      Si detecta registros duplicados o montos incorrectos, puede corregirlos desde el módulo de caja.<br>
      Este detalle es equivalente al libro de ventas diario y puede usarse para fines contables y tributarios.
    </p>
    <table>
      <tr><th>#</th><th>Fecha</th><th>Hora</th><th>Monto</th><th>Método</th><th>Documento</th></tr>
      ${ventas.map((v,i) => `<tr><td>${i+1}</td><td>${v.fecha.split('-').reverse().join('/')}</td><td>${v.hora||'-'}</td><td>$${v.monto.toLocaleString()}</td><td>${v.metodo}</td><td>${v.tipoDoc||'-'}</td></tr>`).join('')}
    </table>

    <div style="margin-top:16px;padding:12px 14px;background:#f0f4ff;border-radius:6px;font-size:0.82rem;color:#444;border-left:3px solid #1a56db;line-height:1.6">
      <strong>Conclusión de esta sección:</strong><br>
      Se registraron ${ventas.length} transacciones individuales durante ${nombreMes} por un total de ${total.toLocaleString()}.<br>
      El monto promedio por transacción fue de ${ventas.length > 0 ? Math.round(total/ventas.length).toLocaleString() : 0}, reflejando el ticket promedio del negocio.<br>
      El método de pago más frecuente fue ${metodoTop.n} con ${metodoTop.c} operaciones registradas.<br>
      Este listado constituye el respaldo completo de todas las operaciones y tiene valor legal y contable.<br>
      En caso de discrepancias con el banco o con clientes, este detalle permite rastrear cada transacción.<br>
      Se recomienda verificar que todas las ventas tengan hora registrada para un control más preciso.<br>
      Conserve este informe como archivo histórico para futuras auditorías o consultas administrativas.
    </div>
  </div>

  <!-- 13. CONCLUSIÓN -->
  <div class="seccion">
    <h2>14. Conclusión y Recomendaciones</h2>
    <div class="conclusion">
      ${generarConclusionAleatoria(nombreMes, total, ventas, metodoTop, mejorDia, mejorMonto, peorDia, peorMonto, promDiario, diasConVentas, diffPct, diaSemNombre, semanas, boletas, facturas, sinDoc, efectivo, debito, credito)}
    </div>
  </div>

  <div class="footer">Bodega A&amp;M — Informe generado automáticamente el ${fechaGen}</div>
  </body></html>`;

  if (window.require) {
    const { ipcRenderer } = window.require('electron');
    if (guardarEnEscritorio) {
      ipcRenderer.send('guardarInformePDF', html);
      ipcRenderer.once('informe-guardado', (event, ruta) => {
        showToast('✔ Informe guardado en: ' + ruta);
      });
      ipcRenderer.once('informe-error', (event, err) => {
        showToast('Error al guardar: ' + err, true);
      });
    } else {
      ipcRenderer.send('vistaPreviewPDF', html);
    }
  }
}

// ══════════════════════════════════════════════════════════════
// ── PANEL DE DIAGNÓSTICOS ─────────────────────────────────────
// ══════════════════════════════════════════════════════════════

// ── Vista Previa antes de registrar ───────────────────────────
function mostrarVistaPrevia(tipoDoc, nroDoc, cliente, prods, esEdicion) {
  return new Promise((resolve) => {
    const listaProds = prods.map((p, i) => `<tr><td>${i+1}</td><td>${p.codigo||'-'}</td><td>${p.descripcion}</td><td>${p.unidad}</td><td>${p.cantidad}</td></tr>`).join('');
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.style.display = 'flex';
    overlay.innerHTML = `
      <div class="modal" style="max-width:500px">
        <div class="modal-header">
          <h3>${esEdicion ? '¿Guardar cambios?' : '¿Confirmar esta orden?'}</h3>
          <button class="modal-close" id="prevCerrar">✕</button>
        </div>
        <div class="modal-body" style="padding:16px">
          <div class="detail-row"><strong>Cliente:</strong> ${cliente}</div>
          <div class="detail-row"><strong>Tipo Doc.:</strong> ${tipoDoc || '-'}</div>
          ${nroDoc ? `<div class="detail-row"><strong>N° Doc.:</strong> ${nroDoc}</div>` : ''}
          <div class="detail-row" style="margin-top:12px"><strong>Productos (${prods.length}):</strong></div>
          <table style="margin-top:8px;font-size:0.85rem">
            <thead><tr><th>#</th><th>Código</th><th>Descripción</th><th>Unid.</th><th>Cant.</th></tr></thead>
            <tbody>${listaProds}</tbody>
          </table>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" id="prevCancelar">Cancelar</button>
          <button class="btn-primary" id="prevConfirmar">✔ ${esEdicion ? 'Guardar' : 'Confirmar'}</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    overlay.querySelector('#prevConfirmar').addEventListener('click', () => { overlay.remove(); resolve(true); });
    overlay.querySelector('#prevCancelar').addEventListener('click', () => { overlay.remove(); resolve(false); });
    overlay.querySelector('#prevCerrar').addEventListener('click', () => { overlay.remove(); resolve(false); });
    overlay.addEventListener('click', (e) => { if (e.target === overlay) { overlay.remove(); resolve(false); } });
  });
}

// ── Error Logger ──────────────────────────────────────────────
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

// ── Firebase Connection Monitor ───────────────────────────────
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
    diagRegistrarError('Error de conexión: ' + err.message, 'network');
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
    latenciaEl.textContent = '—';
  }
  if (diagUltimaSync) {
    syncEl.textContent = diagFormatearFecha(diagUltimaSync);
  }
}

// ── Storage Calculator ────────────────────────────────────────
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

// ── System Info ───────────────────────────────────────────────
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

  // Versión
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

// ── Session Duration ──────────────────────────────────────────
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
    sesionEl.textContent = '—';
  }
}

// ── Timestamp Formatter ───────────────────────────────────────
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

// ── Periodic Refresh Controller ───────────────────────────────
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

// ── Main Refresh Orchestrator ─────────────────────────────────
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

// ── Button Event Listeners ────────────────────────────────────
document.getElementById('btnLimpiarErrores').addEventListener('click', () => {
  diagLimpiarErrores();
  diagRenderErrores();
});

document.getElementById('btnActualizarDiag').addEventListener('click', () => {
  diagnosticosRefresh();
});

// ── Global Error Interception ─────────────────────────────────
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
