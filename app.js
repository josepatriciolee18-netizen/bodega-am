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

      if (data.status === 'checking') {
        msg.textContent = '🔍 Buscando actualizaciones...';
        detail.textContent = 'Espera un momento';
      } else if (data.status === 'downloading') {
        msg.textContent = '⬇ Actualizando...';
        progress.style.display = 'block';
        progressFill.style.width = data.percent + '%';
        detail.textContent = data.percent + '% descargado';
      } else if (data.status === 'ready') {
        msg.textContent = '✔ Actualización lista';
        progress.style.display = 'block';
        progressFill.style.width = '100%';
        detail.textContent = 'Reiniciando aplicación...';
      } else if (data.status === 'no-update' || data.status === 'error') {
        updateScreen.style.display = 'none';
        loginScreen.style.display = 'flex';
      }
    });

    // Si después de 10 segundos no hay respuesta del updater, mostrar login
    setTimeout(() => {
      const updateScreen = document.getElementById('updateScreen');
      if (updateScreen.style.display !== 'none') {
        updateScreen.style.display = 'none';
        document.getElementById('loginScreen').style.display = 'flex';
      }
    }, 10000);

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
    sessionStorage.setItem('sesionActiva', sesionTemp);
  }
  const sesion = sessionStorage.getItem('sesionActiva');
  if (sesion) {
    const sesionGuardada = JSON.parse(sesion);
    // Siempre cargar permisos frescos desde la lista de usuarios actual
    const usuarioFresco = usuarios.find(u => u.login === sesionGuardada.login && u.activo);
    if (usuarioFresco) {
      usuarioActivo = usuarioFresco;
      sessionStorage.setItem('sesionActiva', JSON.stringify(usuarioFresco));
    } else {
      // Usuario no existe o fue desactivado — cerrar sesión
      sessionStorage.removeItem('sesionActiva');
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
  
  // Verificar cada 15 segundos si mi sesión sigue activa
  if (window._checkSesionInterval) clearInterval(window._checkSesionInterval);
  window._checkSesionInterval = setInterval(async () => {
    if (!usuarioActivo || !window.fbListo) return;
    const miSesion = sessionStorage.getItem('sesionId');
    if (!miSesion) return;
    try {
      const sesiones = await fbCargar('sesiones');
      const miSesionFb = sesiones.find(s => s.sesionId);
      // Buscar por login - fbGuardar usa login como ID
      // fbCargar devuelve todos los docs, necesitamos filtrar
      // Como guardamos con login como ID, el doc tiene sesionId
      const encontrada = sesiones.find(s => s.sesionId === miSesion);
      if (!encontrada && sesiones.length > 0) {
        // Mi sesión fue reemplazada por otra
        showToast('Tu sesión fue cerrada porque otro dispositivo inició sesión con este usuario', true);
        setTimeout(() => {
          sessionStorage.removeItem('sesionActiva');
          sessionStorage.removeItem('sesionId');
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
  }, 15000);
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
    sessionStorage.setItem('sesionActiva', JSON.stringify(usuario));
    
    // Registrar sesión activa en Firebase
    const sesionId = Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
    sessionStorage.setItem('sesionId', sesionId);
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
  sessionStorage.removeItem('sesionActiva');
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

    // Cargar TODO desde Firebase al conectar
    const fbHistorial = await fbCargar('historial');
    if (fbHistorial.length > 0) {
      historial = fbHistorial.sort((a,b) => b.nro.localeCompare(a.nro));
      localStorage.setItem('historialSalidas', JSON.stringify(historial));
    }
    
    const fbRecepciones = await fbCargar('recepciones');
    if (fbRecepciones.length >= 0) {
      recepciones = fbRecepciones.sort((a,b) => b.nro.localeCompare(a.nro));
      localStorage.setItem('recepcionesBodega', JSON.stringify(recepciones));
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
      
      // Verificar si hay cambios reales (nuevas órdenes o diferente cantidad)
      const hayNuevos = nuevos.some(n => !nrosActuales.has(n.nro));
      const hayEliminados = historial.some(h => !nrosNuevos.has(h.nro));
      
      if (hayNuevos || hayEliminados || nuevos.length !== historial.length) {
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
            sessionStorage.setItem('sesionActiva', JSON.stringify(usuarioFresco));
            // Reaplicar permisos en las pestañas
            aplicarPermisos();
          } else if (usuarioActivo.login !== 'admin') {
            // Usuario desactivado — cerrar sesión
            sessionStorage.removeItem('sesionActiva');
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
  if (this.value === 'Sin Documento' || this.value === '') {
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
inputBuscar.addEventListener('input', () => {
  const q = inputBuscar.value.trim().toLowerCase();
  if (!q || catalogo.length === 0) { cerrarSugerencias(); return; }
  const filtrados = catalogo.filter(p =>
    p.nombre.toLowerCase().includes(q) || p.codigo.toLowerCase().includes(q)
  );
  if (filtrados.length === 0) { cerrarSugerencias(); return; }
  sugerencias.innerHTML = filtrados.map(p =>
    `<li onclick="seleccionarProducto(${catalogo.indexOf(p)})">
      <strong>${p.nombre}</strong><span>${p.codigo} · ${p.unidad}</span>
    </li>`
  ).join('');
  sugerencias.classList.add('visible');
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
  if (!q) {
    tbody.innerHTML = '<tr><td colspan="4" class="empty-msg">Ingresa un código o nombre para buscar</td></tr>';
    return;
  }
  if (catalogo.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" class="empty-msg">El catálogo está vacío</td></tr>';
    return;
  }
  const resultados = catalogo.filter(p =>
    p.nombre.toLowerCase().includes(q) ||
    (p.codigo && p.codigo.toLowerCase().includes(q))
  );
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

document.getElementById('btnEjecutarBusqueda').addEventListener('click', ejecutarBusquedaProducto);
document.getElementById('buscadorProductoInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') ejecutarBusquedaProducto();
});
document.getElementById('buscadorProductoInput').addEventListener('input', ejecutarBusquedaProducto);

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
  if (tipoDoc !== 'Sin Documento' && campoNroVisible && !nroDoc) { showToast('Primero ingresa el N° de Documento', true); document.getElementById('nroDocumento').focus(); return; }
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
  if (tipoDocumento !== 'Sin Documento' && campoNroVisible && !nroDocumento) {
    showToast('Ingresa el N° de Documento', true);
    document.getElementById('nroDocumento').focus();
    registrando = false; document.getElementById('btnRegistrar').disabled = false; document.getElementById('btnRegistrar').textContent = '✔ Registrar Salida'; return;
  }
  if (!solicitante) { showToast('Ingresa el nombre del Cliente', true); document.getElementById('solicitante').focus(); registrando = false; document.getElementById('btnRegistrar').disabled = false; document.getElementById('btnRegistrar').textContent = '✔ Registrar Salida'; return; }
  if (productos.length === 0) { showToast('Agrega al menos un producto', true); registrando = false; document.getElementById('btnRegistrar').disabled = false; document.getElementById('btnRegistrar').textContent = '✔ Registrar Salida'; return; }

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
  document.getElementById('statItems').textContent = historial.reduce((a, s) => a + s.total, 0);
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

document.getElementById('btnFiltroMes').addEventListener('click', () => {
  const mes = document.getElementById('filtroMes').value;
  renderTopMes(mes);
});

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
  document.getElementById('campoNroDoc').style.display = s.tipoDocumento === 'Sin Documento' ? 'none' : '';
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
    tbodyCat.innerHTML = '<tr><td colspan="4" class="empty-msg">No hay productos en el catálogo</td></tr>';
    return;
  }
  const datos = filtro
    ? catalogo.filter(p =>
        p.nombre.toLowerCase().includes(filtro.toLowerCase()) ||
        (p.codigo && p.codigo.toLowerCase().includes(filtro.toLowerCase())))
    : catalogo.slice(0, 50);

  tbodyCat.innerHTML = datos.map((p) => `
    <tr>
      <td>${p.codigo || '-'}</td>
      <td>${p.nombre}</td>
      <td>${p.unidad}</td>
      <td><button class="btn-delete" onclick="eliminarDelCatalogo(${catalogo.indexOf(p)})" title="Eliminar">✕</button></td>
    </tr>`).join('');

  if (!filtro && catalogo.length > 50) {
    tbodyCat.innerHTML += `<tr><td colspan="4" style="text-align:center;color:#888;font-style:italic;padding:10px">
      Mostrando 50 de ${catalogo.length} productos. Usa el buscador para ver más.
    </td></tr>`;
  }
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
  document.getElementById('campoNroDoc').style.display = (s.tipoDocumento === 'Sin Documento' || !s.tipoDocumento) ? 'none' : '';
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
  document.getElementById('campoNroDoc').style.display = s.tipoDocumento === 'Sin Documento' ? 'none' : '';
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
    tbody.innerHTML = '<tr><td colspan="5" class="empty-msg">No hay clientes registrados</td></tr>';
    return;
  }
  const datos = filtro
    ? clientes.filter(c =>
        c.nombre.toLowerCase().includes(filtro.toLowerCase()) ||
        (c.rut && c.rut.toLowerCase().includes(filtro.toLowerCase())))
    : clientes.slice(0, 50);

  tbody.innerHTML = datos.map((c) => `
    <tr>
      <td>${c.rut || '-'}</td>
      <td>${c.nombre}</td>
      <td>${c.telefono || '-'}</td>
      <td>${c.direccion || '-'}</td>
      <td><button class="btn-delete" onclick="eliminarCliente(${clientes.indexOf(c)})" title="Eliminar">✕</button></td>
    </tr>`).join('');

  if (!filtro && clientes.length > 50) {
    tbody.innerHTML += `<tr><td colspan="5" style="text-align:center;color:#888;font-style:italic;padding:10px">
      Mostrando 50 de ${clientes.length} clientes. Usa el buscador para ver más.
    </td></tr>`;
  }
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
  selectRec.innerHTML = `<option value="">-- Seleccionar --</option><option value="${usuarioActivo.nombre}">${usuarioActivo.nombre} (${usuarioActivo.rol})</option>`;
  selectRec.value = '';
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
  const recibidoPor = document.getElementById('recibidoPor').value.trim();
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
// ── PANEL DE DIAGNÓSTICOS ─────────────────────────────────────
// ══════════════════════════════════════════════════════════════

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
