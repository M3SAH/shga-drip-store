export const PRICE_UNAVAILABLE_TEXT = "Price unavailable";

const WA_PHONE = "2348134421763";
const MAX_PRODUCT_IMAGES = 10;

export function getProductImages(product) {
  const candidates = [];
  if (Array.isArray(product?.images)) {
    candidates.push(...product.images);
  }
  if (product?.imageUrl) candidates.push(product.imageUrl);
  if (product?.image) candidates.push(product.image);
  const out = [];
  const seen = new Set();
  for (const raw of candidates) {
    const url = String(raw || "").trim();
    if (!url || seen.has(url)) continue;
    seen.add(url);
    out.push(url);
    if (out.length >= MAX_PRODUCT_IMAGES) break;
  }
  return out;
}

/** Simple advertised items (socks, accessories, etc.) — no sizes/grades/stock. */
export function isOthersProduct(product) {
  return Boolean(product && String(product.category) === "Others");
}

/** WhatsApp deep link: product name + list price (Others only). */
export function buildOthersWhatsAppUrl(product, selectedColorName) {
  const p = parseProductPrice(product);
  const priceTxt = p != null ? formatPrice(p) : "price on request";
  const name = String(product?.name || "item").trim() || "item";
  const color = String(selectedColorName || "").trim();
  const colorPart = color ? ` — Color: ${color}` : "";
  const msg = `Hi SHGAdrip! I'd like to order: ${name}${colorPart} — ${priceTxt}`;
  return `https://wa.me/${WA_PHONE}?text=${encodeURIComponent(msg)}`;
}

export function formatPrice(price) {
  const base = Number(price) || 0;
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
  }).format(base);
}

/**
 * Parsed list price from Firestore `product.price`.
 * Returns null when missing or invalid (no numeric fallback).
 */
export function parseProductPrice(product) {
  if (!product) return null;
  const raw = product.price;
  if (raw == null || raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

export function hasGradePricesMap(product) {
  if (isOthersProduct(product)) return false;
  const gp = product?.gradePrices;
  return (
    gp != null &&
    typeof gp === "object" &&
    !Array.isArray(gp) &&
    Object.keys(gp).length > 0
  );
}

/**
 * Options for grade UI: only from `product.gradePrices` (and optional `product.grades` order).
 */
export function getGradePriceOptions(product) {
  if (isOthersProduct(product)) return [];
  if (!hasGradePricesMap(product)) return [];
  const gp = product.gradePrices;
  const order =
    Array.isArray(product.grades) && product.grades.length
      ? product.grades
      : Object.keys(gp);
  const seen = new Set();
  const out = [];
  for (const name of order) {
    if (!name || seen.has(name)) continue;
    seen.add(name);
    const p = Number(gp[name]);
    if (!Number.isFinite(p)) continue;
    out.push({ name, price: p });
  }
  for (const name of Object.keys(gp)) {
    if (seen.has(name)) continue;
    const p = Number(gp[name]);
    if (!Number.isFinite(p)) continue;
    out.push({ name, price: p });
  }
  return out;
}

/**
 * Line-item / cart price: selected grade from gradePrices, else product.price.
 */
export function resolveLinePrice(product, selectedGrade) {
  if (isOthersProduct(product)) return parseProductPrice(product);
  if (
    selectedGrade &&
    Number.isFinite(Number(selectedGrade.price))
  ) {
    return Number(selectedGrade.price);
  }
  return parseProductPrice(product);
}

/**
 * For max-price filters: null/unknown prices still pass the filter.
 */
export function pricePassesMaxFilter(product, maxPrice) {
  const n = parseProductPrice(product);
  if (n === null) return true;
  return n <= maxPrice;
}

/**
 * Storefront price HTML (optional prefix). Uses formatPrice (₦).
 */
export function buildStorefrontPriceHtml(
  priceValue,
  { prefix = "", suffix = "" } = {},
) {
  if (priceValue == null || priceValue === "") {
    return `<span class="price-unavailable">${PRICE_UNAVAILABLE_TEXT}</span>`;
  }
  const base = Number(priceValue);
  if (!Number.isFinite(base)) {
    return `<span class="price-unavailable">${PRICE_UNAVAILABLE_TEXT}</span>`;
  }
  const prefixHtml = prefix
    ? `<span class="price-prefix">${prefix}</span> `
    : "";
  return `${prefixHtml}<span class="price-current">${formatPrice(base)}${suffix}</span>`;
}
