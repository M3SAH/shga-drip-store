export const CONFIG = {
  discountEnabled: true,
};

const LS_KEY = "discountEnabled";

export function loadConfigFromStorage() {
  const raw = localStorage.getItem(LS_KEY);
  if (raw === null) return;
  CONFIG.discountEnabled = raw === "true";
}

export function setDiscountEnabled(enabled, { persist = true } = {}) {
  CONFIG.discountEnabled = Boolean(enabled);
  if (persist) {
    try {
      localStorage.setItem(LS_KEY, String(CONFIG.discountEnabled));
    } catch {
      // ignore
    }
  }
}

// On import: hydrate from localStorage if present
try {
  loadConfigFromStorage();
} catch {
  // ignore
}

