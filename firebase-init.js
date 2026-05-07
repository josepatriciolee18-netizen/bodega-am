// Firebase init para Electron usando require
(async function() {
  try {
    const { initializeApp } = require('firebase/app');
    const { getFirestore, collection, doc, setDoc, getDocs, onSnapshot, deleteDoc, getDoc, runTransaction } = require('firebase/firestore');

    const firebaseConfig = {
      apiKey: "AIzaSyCAhkMvXqzljcMJZaTBsxMTBucuDDM7srg",
      authDomain: "bodega-am.firebaseapp.com",
      projectId: "bodega-am",
      storageBucket: "bodega-am.firebasestorage.app",
      messagingSenderId: "745836673567",
      appId: "1:745836673567:web:fac41f15ee7c47c85a732a"
    };

    const fireApp = initializeApp(firebaseConfig);
    const db = getFirestore(fireApp);

    window.fbGuardar  = async (col, id, data) => {
      try { await setDoc(doc(db, col, id), data); } catch(e) { console.error('fbGuardar:', e); }
    };
    window.fbEliminar = async (col, id) => {
      try { await deleteDoc(doc(db, col, id)); } catch(e) { console.error('fbEliminar:', e); }
    };

    // ── Contador de lecturas diarias ──────────────────────────
    const hoyKey = new Date().toISOString().slice(0, 10);
    const contadorGuardado = JSON.parse(localStorage.getItem('fbContadorLecturas') || '{}');
    if (contadorGuardado.fecha !== hoyKey) {
      window._fbLecturas = { fecha: hoyKey, count: 0 };
    } else {
      window._fbLecturas = contadorGuardado;
    }
    function _fbSumarLecturas(n) {
      window._fbLecturas.count += n;
      localStorage.setItem('fbContadorLecturas', JSON.stringify(window._fbLecturas));
      // Alerta al 80% del límite (40,000 de 50,000)
      if (window._fbLecturas.count >= 40000 && !window._fbAlertaMostrada) {
        window._fbAlertaMostrada = true;
        if (typeof showToast === 'function') showToast('⚠️ Llevas ~' + window._fbLecturas.count.toLocaleString() + ' lecturas hoy. Cerca del límite diario (50,000)', true);
      }
    }

    window.fbCargar = async (col) => {
      try {
        const s = await getDocs(collection(db, col));
        _fbSumarLecturas(s.docs.length || 1);
        return s.docs.map(d => d.data());
      } catch(e) { console.error('fbCargar:', e); return []; }
    };
    window.fbEscuchar = (col, cb) => {
      return onSnapshot(collection(db, col), s => {
        _fbSumarLecturas(s.docs.length || 1);
        cb(s.docs.map(d => d.data()));
      });
    };

    // Obtener siguiente número de orden — atómico con transacción
    window.fbObtenerSiguienteNumero = async () => {
      try {
        const contadorRef = doc(db, 'config', 'contador');
        
        // Primero sincronizar contador con historial real
        const historialSnap = await getDocs(collection(db, 'historial'));
        let maxNro = 0;
        historialSnap.docs.forEach(d => {
          const data = d.data();
          if (data.nro) {
            const num = parseInt(data.nro.replace('SAL-', ''));
            if (!isNaN(num) && num > maxNro) maxNro = num;
          }
        });

        // Transacción atómica para incrementar
        const resultado = await runTransaction(db, async (transaction) => {
          const contadorSnap = await transaction.get(contadorRef);
          const contadorActual = contadorSnap.exists() ? contadorSnap.data().valor : 1;
          const siguiente = Math.max(maxNro + 1, contadorActual);
          transaction.set(contadorRef, { valor: siguiente + 1 });
          return siguiente;
        });
        return resultado;
      } catch(e) {
        console.error('fbObtenerSiguienteNumero error:', e.message);
        // Fallback: leer historial y usar siguiente sin transacción
        try {
          const historialSnap = await getDocs(collection(db, 'historial'));
          let maxNro = 0;
          historialSnap.docs.forEach(d => {
            const data = d.data();
            if (data.nro) {
              const num = parseInt(data.nro.replace('SAL-', ''));
              if (!isNaN(num) && num > maxNro) maxNro = num;
            }
          });
          const siguiente = maxNro + 1;
          await setDoc(doc(db, 'config', 'contador'), { valor: siguiente + 1 });
          return siguiente;
        } catch(e2) {
          console.error('fbObtenerSiguienteNumero fallback error:', e2.message);
          return null;
        }
      }
    };

    // Sincronizar contador con el historial real
    window.fbSincronizarContador = async () => {
      try {
        const historialSnap = await getDocs(collection(db, 'historial'));
        let maxNro = 0;
        historialSnap.docs.forEach(d => {
          const data = d.data();
          if (data.nro) {
            const num = parseInt(data.nro.replace('SAL-', ''));
            if (!isNaN(num) && num > maxNro) maxNro = num;
          }
        });
        const contadorRef = doc(db, 'config', 'contador');
        const snap = await getDoc(contadorRef);
        const contadorActual = snap.exists() ? snap.data().valor : 1;
        if (maxNro + 1 > contadorActual) {
          await setDoc(contadorRef, { valor: maxNro + 1 });
          return maxNro + 1;
        }
        return contadorActual;
      } catch(e) {
        console.error('fbSincronizarContador:', e);
        return null;
      }
    };

    window.fbListo = true;
    console.log('✔ Firebase conectado correctamente');
  } catch(e) {
    console.error('Error iniciando Firebase:', e);
    window.fbListo = false;
  }
})();
