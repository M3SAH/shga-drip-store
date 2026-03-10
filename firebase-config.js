/**
 * firebase-config.js
 * Single source of truth for Firebase initialisation.
 * All other files import { db, storage, auth } from here.
 *
 * FIX: Downgraded SDK version from 12.10.0 → 10.12.2 to match
 *      every other file in the project (admin.js, products.js,
 *      admin-login.html all used 10.12.2). Mixing versions causes
 *      "duplicate app" errors and module resolution failures.
 */

import { initializeApp }  from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore }   from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getStorage }     from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";
import { getAuth }        from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

const firebaseConfig = {
  apiKey:            "AIzaSyCEkEEx62I5Ehw8cl-zkk9Puyc7x1rh8d0",
  authDomain:        "shgadrip-store.firebaseapp.com",
  projectId:         "shgadrip-store",
  storageBucket:     "shgadrip-store.firebasestorage.app",
  messagingSenderId: "200271910162",
  appId:             "1:200271910162:web:90f7a0a94582c732c68fcb"
};

export const app     = initializeApp(firebaseConfig);
export const db      = getFirestore(app);
export const storage = getStorage(app);
export const auth    = getAuth(app);
