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

function normalizePriceField(raw) {
  if (raw == null || raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function normalizeSizes(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((s) => String(s || "").trim())
    .filter(Boolean);
}

function normalizeImages(rawImages, fallbackImageUrl) {
  const out = [];
  const seen = new Set();
  const list = Array.isArray(rawImages) ? rawImages : [];
  for (const raw of list) {
    const url = String(raw || "").trim();
    if (!url || seen.has(url)) continue;
    seen.add(url);
    out.push(url);
    if (out.length >= 10) break;
  }
  const fallback = String(fallbackImageUrl || "").trim();
  if (fallback && !seen.has(fallback) && out.length < 10) out.push(fallback);
  return out;
}

/* ── Map Firestore doc → shape storefront scripts expect ─── */
function toProduct(docSnap) {
  const d = docSnap.data();
  const createdAtMs =
    d.createdAt && typeof d.createdAt.toMillis === "function"
      ? d.createdAt.toMillis()
      : Number(d.createdAt) || 0;
  const resolvedImageUrl = String(d.imageUrl || d.image || "").trim();
  const images = normalizeImages(d.images, resolvedImageUrl);
  const rawCategory = d.category || "T-Shirts";
  const normalizedCategory = rawCategory === "Unisex" ? "T-Shirts" : rawCategory;
  const KNOWN_CATEGORIES = ["T-Shirts", "Hoodies", "Caps", "Sleeveless"];
  const category = KNOWN_CATEGORIES.includes(normalizedCategory) ? normalizedCategory : "Others";

  if (category === "Others") {
    const colors = Array.isArray(d.colors)
      ? d.colors.map((c) => String(c || "").trim()).filter(Boolean)
      : [];
    return {
      id: docSnap.id,
      name: String(d.name || "").trim() || "Untitled",
      description: String(d.description || "").trim(),
      price: normalizePriceField(d.price),
      imageUrl: resolvedImageUrl,
      image: resolvedImageUrl,
      images,
      category: "Others",
      colors,
      createdAtMs,
    };
  }

  const sizes = normalizeSizes(d.sizes);
  const colors = Array.isArray(d.colors)
    ? d.colors.map((c) => String(c || "").trim()).filter(Boolean)
    : [];
  const gradePrices =
    d.gradePrices != null && typeof d.gradePrices === "object" && !Array.isArray(d.gradePrices)
      ? d.gradePrices
      : {};

  return {
    id: docSnap.id,
    name: String(d.name || "").trim() || "Untitled",
    description: String(d.description || "").trim(),
    category,
    price: normalizePriceField(d.price),
    stock: Number.isFinite(Number(d.stock)) ? Math.max(0, Math.floor(Number(d.stock))) : 0,
    gsm: d.gsm || "",
    grade: d.grade || "",
    grades: Array.isArray(d.grades) ? d.grades : [],
    gradePrices,
    hasSleeveless: Boolean(d.hasSleeveless),
    sizes,
    colors,
    isFeatured: Boolean(d.isFeatured || d.featured),
    createdAtMs,
    image: resolvedImageUrl,
    imageUrl: resolvedImageUrl,
    images,
    type:
      category === "Sleeveless" || d.type === "sleeveless"
        ? "sleeveless"
        : category === "Hoodies"
        ? "hoodie"
        : category === "Caps"
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

    const fingerprint = JSON.stringify(fresh.map(p => {
      if (p.category === "Others") {
        return {
          id: p.id,
          name: p.name,
          description: p.description,
          price: p.price,
          imageUrl: p.imageUrl,
          category: p.category,
          colors: p.colors,
          createdAtMs: p.createdAtMs,
        };
      }
      return {
        id: p.id,
        stock: p.stock,
        name: p.name,
        description: p.description,
        isFeatured: p.isFeatured,
        createdAtMs: p.createdAtMs,
        price: p.price,
        sizes: p.sizes,
      };
    }));
    if (fingerprint === _lastSnapshot) return;
    _lastSnapshot = fingerprint;

    window.products = fresh;

    if (typeof window.renderProducts === "function") {
      window.renderProducts();
    }
  }, err => {
    console.error("SHGAdrip products.js: Firestore error →", err.code, err.message);
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
