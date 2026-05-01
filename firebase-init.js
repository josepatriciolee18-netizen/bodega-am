// Firebase init para Electron usando require
(async function() {
  try {
    const { initializeApp } = require('firebase/app');
    const { getFirestore, collection, doc, setDoc, getDocs, onSnapshot, deleteDoc, runTransaction, getDoc } = require('firebase/firestore');

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

    // Incremento atómico del contador — evita números duplicados
    // Busca el número más alto en el historial y usa el siguiente
    window.fbIncrementarContador = async () => {
      try {
        const contadorRef = doc(db, 'config', 'contador');
        
        // También verificar el historial para obtener el número más alto real
        const historialSnap = await getDocs(collection(db, 'historial'));
        let maxNro = 0;
        historialSnap.docs.forEach(d => {
          const data = d.data();
          if (data.nro) {
            const num = parseInt(data.nro.replace('SAL-', ''));
            if (!isNaN(num) && num > maxNro) maxNro = num;
          }
        });

        const nuevoValor = await runTransaction(db, async (transaction) => {
          const snap = await transaction.get(contadorRef);
          const contadorActual = snap.exists() ? snap.data().valor : 1;
          // Usar el mayor entre el contador guardado y el máximo del historial + 1
          const valorReal = Math.max(contadorActual, maxNro + 1);
          const nuevo = valorReal + 1;
          transaction.set(contadorRef, { valor: nuevo });
          return valorReal;
        });
        return nuevoValor;
      } catch(e) {
        console.error('fbIncrementarContador:', e);
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
