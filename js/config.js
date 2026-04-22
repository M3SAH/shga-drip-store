import { db } from "../firebase-config.js";
import {
  doc,
  onSnapshot,
  setDoc,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

export const CONFIG = {
  discountEnabled: true,
};

const LS_KEY = "discountEnabled";
const SETTINGS_DOC = doc(db, "settings", "storefront");
const listeners = new Set();
let syncStarted = false;

function notifyDiscountChanged() {
  listeners.forEach((cb) => {
    try {
      cb(CONFIG.discountEnabled);
    } catch (err) {
      console.warn("Discount listener error:", err);
    }
  });
  try {
    window.dispatchEvent(new CustomEvent("shgadrip:discount-changed", {
      detail: { discountEnabled: CONFIG.discountEnabled },
    }));
  } catch {
    // ignore
  }
}

function persistDiscountToStorage() {
  try {
    localStorage.setItem(LS_KEY, String(CONFIG.discountEnabled));
  } catch {
    // ignore
  }
}

export function loadConfigFromStorage() {
  const raw = localStorage.getItem(LS_KEY);
  if (raw === null) return;
  CONFIG.discountEnabled = raw === "true";
}

export function onDiscountChange(callback) {
  if (typeof callback !== "function") return () => {};
  listeners.add(callback);
  return () => listeners.delete(callback);
}

export function setDiscountEnabled(
  enabled,
  { persist = true, persistRemote = false } = {},
) {
  CONFIG.discountEnabled = Boolean(enabled);
  if (persist) persistDiscountToStorage();
  notifyDiscountChanged();
  if (persistRemote) {
    setDoc(SETTINGS_DOC, { discountEnabled: CONFIG.discountEnabled }, { merge: true }).catch((err) => {
      console.error("Failed to persist discount setting:", err);
    });
  }
}

function startRemoteConfigSync() {
  if (syncStarted) return;
  syncStarted = true;
  onSnapshot(SETTINGS_DOC, (snap) => {
    const data = snap.data() || {};
    if (typeof data.discountEnabled !== "boolean") return;
    const next = data.discountEnabled;
    if (next === CONFIG.discountEnabled) return;
    setDiscountEnabled(next, { persist: true, persistRemote: false });
  }, (err) => {
    console.error("Failed to sync storefront settings:", err);
  });
}

try {
  loadConfigFromStorage();
  startRemoteConfigSync();
} catch {
  // ignore
}

