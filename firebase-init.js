// Firebase init para Electron usando require
(async function() {
  try {
    const { initializeApp } = require('firebase/app');
    const { getFirestore, collection, doc, setDoc, getDocs, onSnapshot, deleteDoc, getDoc } = require('firebase/firestore');

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
    window.fbCargar   = async (col) => {
      try { const s = await getDocs(collection(db, col)); return s.docs.map(d => d.data()); } catch(e) { console.error('fbCargar:', e); return []; }
    };
    window.fbEscuchar = (col, cb) => {
      return onSnapshot(collection(db, col), s => cb(s.docs.map(d => d.data())));
    };

    // Obtener siguiente número de orden — lee historial real y usa el siguiente
    window.fbObtenerSiguienteNumero = async () => {
      try {
        // Leer todas las órdenes y encontrar el número más alto
        const historialSnap = await getDocs(collection(db, 'historial'));
        let maxNro = 0;
        historialSnap.docs.forEach(d => {
          const data = d.data();
          if (data.nro) {
            const num = parseInt(data.nro.replace('SAL-', ''));
            if (!isNaN(num) && num > maxNro) maxNro = num;
          }
        });
        // También verificar el contador guardado
        const contadorRef = doc(db, 'config', 'contador');
        const contadorSnap = await getDoc(contadorRef);
        const contadorActual = contadorSnap.exists() ? contadorSnap.data().valor : 1;
        // Usar el mayor
        const siguiente = Math.max(maxNro + 1, contadorActual);
        // Guardar el nuevo contador
        await setDoc(contadorRef, { valor: siguiente + 1 });
        return siguiente;
      } catch(e) {
        console.error('fbObtenerSiguienteNumero:', e);
        return null;
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
