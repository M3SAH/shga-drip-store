/**
 * products.js  — SHGAdrip Firebase Product Loader (FIXED)
 * ─────────────────────────────────────────────────────────────────
 * BUGS FIXED:
 *  1. Removed duplicate Firebase initialisation with placeholder keys.
 *     Was: const app = initializeApp({ apiKey: "YOUR_API_KEY", … })
 *     Fix: Import { db } from firebase-config.js — single init only.
 *
 *  2. SDK version was 10.12.2 but firebase-config.js was on 12.10.0.
 *     Now both use 10.12.2 (firebase-config.js also fixed).
 *
 *  3. Re-render guard added: only calls renderProducts() if products
 *     actually changed (by comparing JSON snapshots), preventing
 *     unnecessary full re-renders on unrelated Firestore events.
 *
 * HOW TO WIRE UP index.html:
 * ─────────────────────────────────────────────────────────────────
 *  In index.html, add BEFORE script.js (note type="module"):
 *    <script type="module" src="js/products.js"></script>
 *    <script src="script.js"></script>
 *
 *  In script.js make two small changes:
 *
 *  CHANGE 1 – replace the static products array:
 *    // OLD:
 *    const products = [ { id:1, name:"...", ... }, ... ];
 *    // NEW:
 *    window.products = window.products || [];
 *    const products = window.products;
 *
 *  CHANGE 2 – expose renderProducts globally (add after its definition):
 *    window.renderProducts = renderProducts;
 *
 *  CHANGE 3 – remove renderProducts() from inside init() so the static
 *    call doesn't race with the Firestore response. products.js will
 *    call it once data arrives.
 * ─────────────────────────────────────────────────────────────────
 */

import { db } from "../firebase-config.js";   // ← shared instance, no re-init

import { collection, query, orderBy, onSnapshot, limit }
  from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

/* ── Map Firestore doc → shape script.js expects ─── */
function toProduct(docSnap) {
  const d = docSnap.data();
  const createdAtMs =
    d.createdAt && typeof d.createdAt.toMillis === "function"
      ? d.createdAt.toMillis()
      : Number(d.createdAt) || 0;
  // Support both field names: `imageUrl` (admin panel) and `image` (alias)
  const resolvedImageUrl = d.imageUrl || d.image || "";
  return {
    id:          docSnap.id,
    name:        d.name        || "Untitled",
    description: d.description || "",
    category:    d.category    || "Unisex",
    price:       Number(d.price)  || 0,
    stock:       Number(d.stock)  || 0,
    gsm:         d.gsm        || "",
    grade:       d.grade       || "Premium",
    grades:      Array.isArray(d.grades) ? d.grades : [],
    gradePrices: d.gradePrices || {},       // per-grade prices set by admin
    hasSleeveless: d.hasSleeveless || false, // admin-enabled sleeveless option
    sizes:       Array.isArray(d.sizes)  ? d.sizes  : ["S","M","L","XL","2XL","3XL"],
    colors:      Array.isArray(d.colors) ? d.colors : ["White","Black"],
    isFeatured:  Boolean(d.isFeatured || d.featured),
    createdAtMs,
    image:       resolvedImageUrl,
    imageUrl:    resolvedImageUrl,
    type:
      d.category === "Sleeveless" || d.type === "sleeveless"
        ? "sleeveless"
        : d.category === "Hoodies"
        ? "hoodie"
        : d.category === "Caps"
        ? "cap"
        : "design",
  };
}

/* ── Lightweight skeleton grid while Firestore loads ─── */
function showSkeleton() {
  const grid = document.getElementById("productGrid");
  if (!grid) return;

  if (!document.getElementById("shimmer-style")) {
    const s = document.createElement("style");
    s.id = "shimmer-style";
    s.textContent = `
      @keyframes shimmer { to { background-position: -200% 0; } }
      .skel-card {
        background: #1a1a1a;
        border: 1px solid #222;
        border-radius: 4px;
        aspect-ratio: 3/4;
        background-image: linear-gradient(90deg,#1a1a1a 25%,#252525 50%,#1a1a1a 75%);
        background-size: 200% 100%;
        animation: shimmer 1.4s infinite;
      }`;
    document.head.appendChild(s);
  }

  grid.innerHTML = Array.from({ length: 6 }).map(() =>
    `<div class="skel-card"></div>`
  ).join("");
}

/* ── Re-render guard: avoid redundant renders ─── */
let _lastSnapshot = "";

function start() {
  showSkeleton();

  const q = query(collection(db, "products"), orderBy("createdAt", "desc"), limit(1000));

  onSnapshot(q, snapshot => {
    const fresh = snapshot.docs.map(toProduct);

    // Skip re-render if data is identical (e.g. metadata-only Firestore updates)
    const fingerprint = JSON.stringify(fresh.map(p => ({
      id: p.id,
      stock: p.stock,
      name: p.name,
      isFeatured: p.isFeatured,
      createdAtMs: p.createdAtMs,
      price: p.price
    })));
    if (fingerprint === _lastSnapshot) return;
    _lastSnapshot = fingerprint;

    window.products = fresh;

    if (typeof window.renderProducts === "function") {
      window.renderProducts();
    }
  }, err => {
    console.error("SHGAdrip products.js: Firestore error →", err.code, err.message);
    // Fallback: keep existing products (or empty) and re-render
    window.products = window.products || [];
    if (typeof window.renderProducts === "function") {
      window.renderProducts();
    }
  });
}

/* ── Boot ─── */
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", start);
} else {
  start();
}
