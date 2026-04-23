import { db } from "../firebase-config.js";
import {
  doc,
  onSnapshot,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// Config is now empty since discount functionality is removed
export const CONFIG = {};

let syncStarted = false;

function startRemoteConfigSync() {
  if (syncStarted) return;
  syncStarted = true;
  // Keep the sync for potential future config, but no discount handling
  onSnapshot(doc(db, "settings", "storefront"), (snap) => {
    // Handle any future config changes here
  }, (err) => {
    console.error("Failed to sync storefront settings:", err);
  });
}

try {
  startRemoteConfigSync();
} catch {
  // ignore
}

