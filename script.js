/**
 * script.js  — SHGAdrip Main Website JS (FIXED)
 * ─────────────────────────────────────────────────────────────────
 * BUGS FIXED:
 *  1. Static products array replaced with window.products reference.
 *     products.js (Firebase loader) populates window.products from
 *     Firestore and calls window.renderProducts() when ready.
 *
 *  2. renderProducts() is now exposed as window.renderProducts so
 *     products.js can trigger it after Firestore data loads.
 *
 *  3. renderProducts() removed from inside init() to prevent the
 *     static call racing with (and overwriting) the Firebase response.
 *     The initial skeleton grid is shown by products.js instead.
 *
 *  4. Listing prices use product.price only; missing prices show as
 *     unavailable (shared helpers in js/utils/pricing.js).
 * ─────────────────────────────────────────────────────────────────
 */

// Import reviews functionality
import { initPublicReviews } from "./js/reviews.js";
import { CONFIG, onDiscountChange } from "./js/config.js";
import {
  applyDiscount,
  formatPrice,
  parseProductPrice,
  getGradePriceOptions,
  resolveLinePrice,
  pricePassesMaxFilter,
  buildStorefrontPriceHtml,
  isOthersProduct,
  buildOthersWhatsAppUrl,
  isDiscountActiveForProduct,
  getProductImages,
} from "./js/utils/pricing.js";

const hideOrShowPromoUi = () => {
  document.querySelectorAll(".promo-banner").forEach((el) => {
    el.style.display = CONFIG.discountEnabled ? "" : "none";
  });
};

// ===================================
// COLOR CATALOG
// ===================================
const SHIRT_COLORS = [
  { id: "white",       name: "White",       hex: "#FFFFFF", group: "Colors" },
  { id: "black",       name: "Black",       hex: "#000000", group: "Colors" },
  { id: "cream",       name: "Cream",       hex: "#FFFDD0", group: "Colors" },
  { id: "red",         name: "Red",         hex: "#CC2222", group: "Colors" },
  { id: "navy-blue",   name: "Navy Blue",   hex: "#0A1A3A", group: "Colors" },
  { id: "royal-blue",  name: "Royal Blue",  hex: "#4169E1", group: "Colors" },
  { id: "sky-blue",    name: "Sky Blue",    hex: "#87CEEB", group: "Colors" },
  { id: "yellow",      name: "Yellow",      hex: "#F5CC00", group: "Colors" },
  { id: "grey",        name: "Grey",        hex: "#9E9E9E", group: "Colors" },
  { id: "green",       name: "Green",       hex: "#22A34C", group: "Colors" },
  { id: "purple",      name: "Purple",      hex: "#6B2DB5", group: "Colors" },
];

const colorGroups = [...new Set(SHIRT_COLORS.map(c => c.group))];

// ===================================
// PRODUCT LIST
// FIX: Use window.products populated by products.js (Firestore).
// Falls back to [] so the site still works before data arrives.
// ===================================
window.products = window.products || [];
const products  = window.products;   // live reference — always reads the current array

// ===================================
// CART — delegated to shared cart.js (window.SHGACart)
// ===================================
// Use a proxy reference so all cart reads/writes go through SHGACart
const getCart = () => window.SHGACart ? window.SHGACart.getAll() : []; 

// ===================================
// SLEEVE STYLES
// ===================================
const SLEEVE_STYLES = [
  { id: "sleeved",    name: "With Sleeves",   icon: "fa-solid fa-shirt",          desc: "Classic full-sleeve tee"  },
  { id: "sleeveless", name: "Sleeveless",     icon: "fa-solid fa-person-running", desc: "Cut-off sleeveless style" },
];

// ===================================
// SHIRT SIZES
// ===================================
const SHIRT_SIZES = [
  { id: "M",   label: "M",   desc: "Medium"   },
  { id: "L",   label: "L",   desc: "Large"    },
  { id: "XL",  label: "XL",  desc: "X-Large"  },
  { id: "2XL", label: "2XL", desc: "2X-Large" },
  { id: "3XL", label: "3XL", desc: "3X-Large" },
];

const state = {
  activeCategory: "all",
  maxPrice:       50000,
  selectedGrade:  null,
  selectedColor:  SHIRT_COLORS[0],
  selectedSleeve: SLEEVE_STYLES[0],
  selectedSize:   SHIRT_SIZES[3],   // default: XL
  openProduct:    null,
};

// ===================================
// DOM REFS
// ===================================
const $  = (id)  => document.getElementById(id);
const $$ = (sel) => document.querySelectorAll(sel);

const productGrid  = $("productGrid");
const modal        = $("productModal");
const modalImg     = $("modalImg");
const modalCat     = $("modalCategory");
const modalTitle   = $("modalTitle");
const modalPrice   = $("modalPrice");
const modalDesc    = $("modalDesc");
const modalWaLink  = $("modalWaLink");
const priceFilter  = $("priceFilter");
const priceDisplay = $("priceDisplay");
const orderForm    = $("orderForm");
const navToggle    = $("navToggle");
const navMenu      = $("navMenu");
const navOverlay   = $("navOverlay");
const header       = $("header");
const cartBtn      = $("cartBtn");
const cartPanel    = $("cartPanel");
const cartOverlay  = $("cartOverlay");
const cartItems    = $("cartItems");
const cartCount    = $("cartCount");
const cartTotal    = $("cartTotal");
const cartWaBtn    = $("cartWaBtn");
const cartEmptyMsg = $("cartEmptyMsg");

// ===================================
// UTILS
// ===================================
const buildDiscountPriceHtml = (price, opts = {}, product = null) =>
  buildStorefrontPriceHtml(price, {
    ...opts,
    discountEnabled: isDiscountActiveForProduct(product, CONFIG.discountEnabled),
  });

const escapeHtml = (s) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const contrastColor = (hex) => {
  if (!hex) return "#ffffff";
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.55 ? "#111111" : "#ffffff";
};

const buildSingleWaLink = (product, grade, color) => {
  const phone      = "2348134421763";
  const basePrice  = resolveLinePrice(product, grade);
  const baseNum    = basePrice == null ? null : Number(basePrice);
  const promoOn    = isDiscountActiveForProduct(product, CONFIG.discountEnabled);
  const discountPrice = baseNum != null ? applyDiscount(baseNum, promoOn) : null;
  const priceLabel = baseNum == null ? "Price unavailable" : formatPrice(baseNum);
  const discLabel  = discountPrice != null ? formatPrice(discountPrice) : "";
  const gradeInfo  = (() => {
    if (baseNum == null) return "Price: unavailable — please confirm with seller";
    if (!promoOn) {
      return grade
        ? `Shirt Grade: ${grade.name} — ${priceLabel}`
        : `Price: ${priceLabel}`;
    }
    return grade
      ? `Shirt Grade: ${grade.name} — ${priceLabel} → ${discLabel} (10% OFF)`
      : `Price: ${priceLabel} → ${discLabel} (10% OFF)`;
  })();
  const colorInfo  = color ? `Color: ${color.name}${color.isCustom ? " (custom — please specify)" : ""}` : "";
  const sleeveInfo = product.type !== "sleeveless" && state.selectedSleeve ? `Sleeve Style: ${state.selectedSleeve.name}` : "";
  const sizeInfo   = (product.category !== "Caps" && state.selectedSize) ? `Size: ${state.selectedSize.label}` : "";
  const imageUrl   = product.imageUrl || product.image || "";
  const productPageUrl = `${window.location.origin}/product.html?id=${encodeURIComponent(product.id)}`;
  const msg =
    `Hi SHGAdrip! I'd like to order:\n\n` +
    `Design: ${product.name}\n${gradeInfo}\n${sleeveInfo}\n${sizeInfo}\n${colorInfo}\n` +
    (imageUrl ? `\n🖼 Product Image: ${imageUrl}` : "") +
    `\n🔗 Product Page: ${productPageUrl}` +
    `\n\nPlease confirm availability and delivery details. Thanks!`;
  return `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`;
};

const buildCartWaLink = () => window.SHGACart ? window.SHGACart.buildWaLink() : "#";

const isFeaturedProduct = (product) => Boolean(product && product.isFeatured);
const KNOWN_CATEGORIES = ["T-Shirts", "Hoodies", "Caps", "Sleeveless"];
const normalizeCategory = (cat) => {
  const raw = String(cat || "");
  const c = raw === "Unisex" ? "T-Shirts" : raw;
  if (!c) return "Others";
  return KNOWN_CATEGORIES.includes(c) ? c : "Others";
};

// ===================================
// RENDER PRODUCT GRID
// FIX: reads window.products dynamically so Firebase updates reflect immediately.
// FIX: exposed as window.renderProducts so products.js can call it.
// ===================================
const renderProducts = () => {
  // Always read from the live window.products array
  const source   = (window.products || [])
    .map((p) => (p ? { ...p, category: normalizeCategory(p.category) } : p))
    .filter(isFeaturedProduct)
    .slice(0, 12);
  const filtered = source.filter((p) => {
    const catMatch   = state.activeCategory === "all" || p.category === state.activeCategory;
    const priceMatch = pricePassesMaxFilter(p, state.maxPrice);
    return catMatch && priceMatch;
  });

  productGrid.innerHTML = "";

  if (filtered.length === 0) {
    productGrid.innerHTML = `
      <div style="grid-column:1/-1;text-align:center;padding:4rem 1rem;">
        <p style="font-family:var(--font-heading);font-size:1.5rem;letter-spacing:3px;text-transform:uppercase;color:var(--white-dim);">
          No featured items found
        </p>
      </div>`;
    return;
  }

  const frag = document.createDocumentFragment();
  filtered.forEach((product, i) => {
    const card = document.createElement("div");
    card.className = "product-card";
    card.style.animationDelay = `${i * 0.05}s`;
    card.setAttribute("role",     "button");
    card.setAttribute("tabindex", "0");
    card.setAttribute("aria-label", `View ${product.name}`);

    const listPrice = parseProductPrice(product);
    const priceLabel = buildDiscountPriceHtml(listPrice, {}, product);

    const others = isOthersProduct(product);
    const outOfStock = !others && Number(product.stock) === 0;
    const stockBadge = outOfStock
      ? `<span class="card-out-of-stock-badge">Out of Stock</span>`
      : "";

    const othersColorsLine =
      others &&
      Array.isArray(product.colors) &&
      product.colors.length
        ? product.colors.map((c) => escapeHtml(c)).join(" · ")
        : "";

    const ctaText = others
      ? "Order via WhatsApp"
      : (outOfStock ? "Unavailable" : "Choose Grade &amp; Color");

    const images = getProductImages(product);
    const primaryImage = images[0] || "";
    const sliderAttr = escapeHtml(JSON.stringify(images));
    const dotsHtml = images.length > 1
      ? `<div class="card-slider-dots">${images.map((_, idx) => `<button class="card-slider-dot${idx === 0 ? " active" : ""}" data-slide="${idx}" aria-label="View image ${idx + 1}"></button>`).join("")}</div>`
      : "";
    card.innerHTML = `
      <div class="card-image card-image-slider" data-images="${sliderAttr}">
        <img src="${primaryImage}" alt="${product.name}" loading="lazy"
             onerror="this.parentElement.style.background='var(--black-3)'; this.style.display='none'">
        ${stockBadge}
        ${dotsHtml}
      </div>
      <div class="card-body">
        <p class="card-cat">${product.category}</p>
        <h3 class="card-name">${product.name}</h3>
        ${
          othersColorsLine
            ? `<p class="card-others-colors">${othersColorsLine}</p>`
            : ""
        }
        <p class="card-price">${priceLabel}</p>
        <span class="card-cta">${ctaText}</span>
      </div>`;

    if (!outOfStock) {
      card.addEventListener("click",   () => openModal(product));
      card.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") openModal(product); });
    } else {
      card.style.opacity = "0.55";
      card.style.cursor  = "default";
    }

    frag.appendChild(card);
  });
  productGrid.appendChild(frag);
  initCardImageSliders(productGrid);
};

function initCardImageSliders(root) {
  root.querySelectorAll(".card-image-slider").forEach((el) => {
    let images = [];
    try {
      images = JSON.parse(el.dataset.images || "[]");
    } catch {
      images = [];
    }
    if (!Array.isArray(images) || images.length <= 1) return;
    const img = el.querySelector("img");
    const dots = Array.from(el.querySelectorAll(".card-slider-dot"));
    let idx = 0;
    const setActive = (next) => {
      idx = (next + images.length) % images.length;
      if (img) img.src = images[idx];
      dots.forEach((d, i) => d.classList.toggle("active", i === idx));
    };
    dots.forEach((dot) => {
      dot.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        setActive(Number(dot.dataset.slide || 0));
      });
    });
    let timer = window.setInterval(() => setActive(idx + 1), 2600);
    el.addEventListener("mouseenter", () => {
      window.clearInterval(timer);
    });
    el.addEventListener("mouseleave", () => {
      timer = window.setInterval(() => setActive(idx + 1), 2600);
    });
  });
}

// FIX: expose globally so products.js can call it after Firebase loads
window.renderProducts = renderProducts;

// ===================================
// MODAL – Grade Selector
// Only when product.gradePrices exists (per-grade prices from admin).
// ===================================
const renderGradeSelector = (product) => {
  const wrap = $("gradeSelector");
  const section = document.querySelector("#productModal .grade-selector-section");
  if (!wrap) return;

  if (isOthersProduct(product)) {
    if (section) section.style.display = "none";
    state.selectedGrade = null;
    wrap.innerHTML = "";
    return;
  }

  if (product.type === "sleeveless") {
    if (section) section.style.display = "none";
    state.selectedGrade = null;
    return;
  }

  const toShow = getGradePriceOptions(product);
  if (!toShow.length) {
    if (section) section.style.display = "none";
    state.selectedGrade = null;
    wrap.innerHTML = "";
    return;
  }

  if (section) section.style.display = "block";
  state.selectedGrade = toShow[0];

  wrap.innerHTML = toShow.map((g, idx) => `
    <button class="grade-btn${idx === 0 ? " active" : ""}"
            data-grade-name="${g.name}" aria-pressed="${idx === 0}">
      <span class="grade-btn-name">${g.name}</span>
      <span class="grade-btn-price">${formatPrice(g.price)}</span>
    </button>`
  ).join("");

  $("modalAddToCart").dataset.gradeIdx = String(idx_of(toShow[0], toShow));

  wrap.querySelectorAll(".grade-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const grade = toShow.find(g => g.name === btn.dataset.gradeName);
      if (!grade) return;
      state.selectedGrade = grade;
      wrap.querySelectorAll(".grade-btn").forEach((b) => { b.classList.remove("active"); b.setAttribute("aria-pressed", "false"); });
      btn.classList.add("active");
      btn.setAttribute("aria-pressed", "true");
      const line = resolveLinePrice(product, grade);
      $("modalPrice").innerHTML = buildDiscountPriceHtml(line, { suffix: " / shirt" }, product);
      $("modalWaLink").href = buildSingleWaLink(product, grade, state.selectedColor);
      $("modalAddToCart").dataset.gradeIdx = String(idx_of(grade, toShow));
    });
  });
};

// helper: index in array by name
function idx_of(grade, arr) { return arr.findIndex(g => g.name === grade.name); }

// ===================================
// MODAL – Size Selector
// Only shows sizes from product.sizes; hidden when none (except Caps).
// ===================================
const renderSizeSelector = (product) => {
  const wrap = $("sizeSelector");
  if (!wrap) return;

  const section = wrap.closest(".size-selector-section");
  if (isOthersProduct(product)) {
    if (section) section.style.display = "none";
    state.selectedSize = null;
    return;
  }
  if (product.category === "Caps") {
    if (section) section.style.display = "none";
    state.selectedSize = null;
    return;
  }
  if (section) section.style.display = "block";

  const normalize = (s) => {
    const v = String(s || "").toUpperCase().trim();
    if (v === "XXL") return "2XL";
    if (v === "XXXL") return "3XL";
    return v;
  };

  const savedLabels = Array.isArray(product.sizes) && product.sizes.length
    ? product.sizes.map(normalize)
    : [];
  if (!savedLabels.length) {
    if (section) section.style.display = "none";
    state.selectedSize = null;
    return;
  }
  const toShow = SHIRT_SIZES.filter(s => savedLabels.includes(s.label));
  const sizes  = toShow.length ? toShow : [];
  if (!sizes.length) {
    if (section) section.style.display = "none";
    state.selectedSize = null;
    return;
  }

  state.selectedSize = sizes[0];

  wrap.innerHTML = sizes.map((s, idx) => `
    <button class="size-select-btn${idx === 0 ? " active" : ""}"
            data-size-label="${s.label}" aria-pressed="${idx === 0}" title="${s.desc}">
      <span class="size-select-label">${s.label}</span>
      <span class="size-select-desc">${s.desc}</span>
    </button>`
  ).join("");

  wrap.querySelectorAll(".size-select-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const size = SHIRT_SIZES.find(s => s.label === btn.dataset.sizeLabel);
      if (!size) return;
      state.selectedSize = size;
      wrap.querySelectorAll(".size-select-btn").forEach((b) => { b.classList.remove("active"); b.setAttribute("aria-pressed", "false"); });
      btn.classList.add("active");
      btn.setAttribute("aria-pressed", "true");
      $("modalWaLink").href = buildSingleWaLink(product, state.selectedGrade, state.selectedColor);
    });
  });
};

// ===================================
// MODAL – Sleeve Style Selector
// Shows if admin enabled hasSleeveless OR product.type === "sleeveless"
// ===================================
const renderSleeveSelector = (product) => {
  const wrap = $("sleeveSelector");
  if (!wrap) return;

  const section = wrap.closest(".sleeve-selector-section");

  if (isOthersProduct(product)) {
    if (section) section.style.display = "none";
    state.selectedSleeve = SLEEVE_STYLES[0];
    return;
  }

  // Show sleeve selector if product has sleeveless option
  const showSleeve = product.category !== "Caps" && (product.hasSleeveless || product.type === "sleeveless");

  if (!showSleeve) {
    if (section) section.style.display = "none";
    state.selectedSleeve = SLEEVE_STYLES[0]; // default: with sleeves
    return;
  }

  if (section) section.style.display = "block";
  state.selectedSleeve = SLEEVE_STYLES[0];

  wrap.innerHTML = SLEEVE_STYLES.map((s, idx) => `
    <button class="sleeve-btn${idx === 0 ? " active" : ""}"
            data-sleeve-idx="${idx}" aria-pressed="${idx === 0}">
      <i class="${s.icon} sleeve-btn-icon"></i>
      <span class="sleeve-btn-name">${s.name}</span>
      <span class="sleeve-btn-desc">${s.desc}</span>
    </button>`
  ).join("");

  wrap.querySelectorAll(".sleeve-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const idx = parseInt(btn.dataset.sleeveIdx, 10);
      state.selectedSleeve = SLEEVE_STYLES[idx];
      wrap.querySelectorAll(".sleeve-btn").forEach((b) => { b.classList.remove("active"); b.setAttribute("aria-pressed", "false"); });
      btn.classList.add("active");
      btn.setAttribute("aria-pressed", "true");
      $("modalWaLink").href = buildSingleWaLink(product, state.selectedGrade, state.selectedColor);
    });
  });
};

// ===================================
// MODAL – Color Selector
// Only shows colors from product.colors; section hidden when empty.
// "Others" uses the same swatches when names match the catalog; otherwise a simple text list.
// ===================================
const renderColorSelector = (product) => {
  const container = $("colorSelectorWrap");
  const section = container?.closest(".color-selector-section");
  if (!container) return;

  const savedNames = Array.isArray(product.colors) && product.colors.length
    ? product.colors
    : [];
  if (!savedNames.length) {
    if (section) section.style.display = "none";
    state.selectedColor = null;
    container.innerHTML = "";
    return;
  }
  if (section) section.style.display = "block";

  const toShow = SHIRT_COLORS.filter(c => savedNames.includes(c.name));
  let colors = toShow.length ? toShow : [];

  if (!colors.length) {
    if (isOthersProduct(product)) {
      container.innerHTML = `
        <div class="color-group">
          <p class="color-group-label">Colors</p>
          <p class="others-colors-text">${savedNames.map(escapeHtml).join(", ")}</p>
        </div>`;
      state.selectedColor = {
        id: "others-text",
        name: savedNames[0],
        hex: "#666666",
        group: "Colors",
      };
      updateColorDisplay();
      const wa = $("modalWaLink");
      if (wa) wa.href = buildOthersWhatsAppUrl(product, savedNames[0]);
      return;
    }
    if (section) section.style.display = "none";
    state.selectedColor = null;
    container.innerHTML = "";
    return;
  }

  state.selectedColor = colors[0];

  // Only render groups that have at least one available color
  const groups = [...new Set(colors.map(c => c.group))];

  let html = "";
  groups.forEach((group) => {
    const groupColors = colors.filter(c => c.group === group);
    html += `<div class="color-group"><p class="color-group-label">${group}</p><div class="color-swatches">`;
    groupColors.forEach((color) => {
      const isFirst = color === colors[0];
      const border  = color.hex === "#FFFFFF" ? "1px solid #444" : "none";
      html += `
        <button class="color-swatch${isFirst ? " active" : ""}"
                data-color-id="${color.id}"
                style="background:${color.hex};border:${border};"
                title="${color.name}" aria-label="${color.name}" aria-pressed="${isFirst}">
          <span class="swatch-check" style="color:${contrastColor(color.hex)}">
            <i class="fa-solid fa-check"></i>
          </span>
        </button>`;
    });
    html += `</div></div>`;
  });

  container.innerHTML = html;
  updateColorDisplay();

  container.querySelectorAll(".color-swatch").forEach((swatch) => {
    swatch.addEventListener("click", () => {
      const color = SHIRT_COLORS.find(c => c.id === swatch.dataset.colorId);
      if (!color) return;
      state.selectedColor = color;
      container.querySelectorAll(".color-swatch").forEach((s) => { s.classList.remove("active"); s.setAttribute("aria-pressed","false"); });
      swatch.classList.add("active");
      swatch.setAttribute("aria-pressed","true");
      updateColorDisplay();
      const wa = $("modalWaLink");
      if (!wa) return;
      wa.href = isOthersProduct(product)
        ? buildOthersWhatsAppUrl(product, color.name)
        : buildSingleWaLink(product, state.selectedGrade, state.selectedColor);
    });
  });

  const wa = $("modalWaLink");
  if (wa) {
    wa.href = isOthersProduct(product)
      ? buildOthersWhatsAppUrl(product, state.selectedColor?.name || null)
      : buildSingleWaLink(product, state.selectedGrade, state.selectedColor);
  }
};

function updateColorDisplay() {
  const display = $("selectedColorDisplay");
  if (!display || !state.selectedColor) return;
  display.textContent = state.selectedColor.name;
  display.style.background   = state.selectedColor.hex;
  display.style.color        = contrastColor(state.selectedColor.hex);
  display.style.borderColor  = state.selectedColor.hex === "#FFFFFF" ? "#555" : state.selectedColor.hex;
}

// ===================================
// MODAL OPEN / CLOSE
// ===================================
function resetProductModalChrome() {
  [".grade-selector-section", ".size-selector-section", ".sleeve-selector-section", ".color-selector-section"].forEach((sel) => {
    const el = document.querySelector(`#productModal ${sel}`);
    if (el) el.style.removeProperty("display");
  });
  const addBtn = $("modalAddToCart");
  if (addBtn) {
    addBtn.style.display = "";
    addBtn.disabled = false;
    addBtn.style.removeProperty("opacity");
  }
  const wa = $("modalWaLink");
  if (wa) {
    wa.innerHTML = `<i class="fa-brands fa-whatsapp"></i> Order Now`;
    wa.style.removeProperty("pointer-events");
    wa.style.removeProperty("opacity");
  }
}

function openOthersModal(product) {
  state.selectedGrade = null;
  state.selectedSize = null;
  state.selectedColor = null;
  state.selectedSleeve = SLEEVE_STYLES[0];

  [".grade-selector-section", ".size-selector-section", ".sleeve-selector-section"].forEach((sel) => {
    const el = document.querySelector(`#productModal ${sel}`);
    if (el) el.style.display = "none";
  });

  renderColorSelector(product);

  const listPrice = parseProductPrice(product);
  $("modalPrice").innerHTML = buildDiscountPriceHtml(listPrice, {}, product);

  const wa = $("modalWaLink");
  if (wa) {
    wa.href = buildOthersWhatsAppUrl(product, state.selectedColor?.name || null);
    wa.innerHTML = `<i class="fa-brands fa-whatsapp"></i> Order via WhatsApp`;
    wa.style.removeProperty("pointer-events");
    wa.style.removeProperty("opacity");
  }

  const addBtn = $("modalAddToCart");
  if (addBtn) {
    addBtn.style.display = "none";
    addBtn.disabled = true;
  }
}

const openModal = (product) => {
  resetProductModalChrome();
  state.openProduct = product;

  modalImg.src           = product.image || product.imageUrl || "";
  modalImg.alt           = product.name;
  modalCat.textContent   = product.category;
  modalTitle.textContent = product.name;
  modalDesc.textContent  = product.description || "";

  if (isOthersProduct(product)) {
    openOthersModal(product);
    modal.classList.add("active");
    document.body.style.overflow = "hidden";
    return;
  }

  renderGradeSelector(product);
  renderSizeSelector(product);
  renderSleeveSelector(product);
  renderColorSelector(product);

  const gradeOpts = getGradePriceOptions(product);
  const linePrice = resolveLinePrice(product, state.selectedGrade);
  $("modalPrice").innerHTML = buildDiscountPriceHtml(linePrice, {
    suffix: product.type === "sleeveless" ? "" : " / shirt",
  }, product);

  $("modalAddToCart").dataset.productId = product.id;
  $("modalAddToCart").dataset.gradeIdx  = state.selectedGrade ? String(idx_of(state.selectedGrade, gradeOpts)) : "0";
  $("modalWaLink").href = buildSingleWaLink(product, state.selectedGrade, state.selectedColor);

  const addBtn = $("modalAddToCart");
  const oos = Number(product.stock) === 0;
  const noPrice = linePrice == null;
  if (addBtn) {
    addBtn.disabled = oos || noPrice;
    addBtn.style.opacity = oos || noPrice ? "0.5" : "";
  }

  modal.classList.add("active");
  document.body.style.overflow = "hidden";
};

const closeModal = () => {
  modal.classList.remove("active");
  document.body.style.overflow = "";
  state.openProduct = null;
  resetProductModalChrome();
};

// ===================================
// CART
// ===================================
// ===================================
// CART UI — all delegated to cart.js
// ===================================
const updateCartUI = () => {
  if (window.SHGACart) window.SHGACart.updateBadge();
};

const addToCart = (productId, gradeIdx) => {
  if (!window.SHGACart) return;
  const source  = window.products || [];
  const product = source.find(p => String(p.id) === String(productId));
  if (!product) return;
  if (isOthersProduct(product)) return;
  if (Number(product.stock) === 0) return;

  const productGrades = getGradePriceOptions(product);
  const grade = product.type === "sleeveless"
    ? null
    : (productGrades[gradeIdx] || productGrades[0] || null);
  const price = resolveLinePrice(product, grade);
  if (price == null) return;

  const baseUrl = window.location.origin;
  const imageUrl = product.imageUrl || product.image || "";
  const productPageUrl = `${baseUrl}/product.html?id=${encodeURIComponent(product.id)}`;

  window.SHGACart.add({
    productId,
    design:     product.name,
    imageUrl,
    productPageUrl,
    shirtGrade: grade ? grade.name : null,
    price,
    category:   product.category || null,
    size:        state.selectedSize   ? state.selectedSize.label   : null,
    sleeveStyle: state.selectedSleeve ? state.selectedSleeve.name  : null,
    color:       state.selectedColor  ? state.selectedColor.name   : null,
  });
};

window.changeQty = (idx, delta) => {
  if (window.SHGACart) window.SHGACart.changeQty(idx, delta);
};

window.removeFromCart = (idx) => {
  if (window.SHGACart) window.SHGACart.remove(idx);
};

const renderCartItems = () => {
  if (window.SHGACart) window.SHGACart.renderItems();
};

// ===================================
// MOBILE NAV
// ===================================
const openNav = () => {
  navMenu.classList.add("open");
  navToggle.classList.add("open");
  navOverlay.classList.add("active");
  document.body.style.overflow = "hidden";
};
const closeNav = () => {
  navMenu.classList.remove("open");
  navToggle.classList.remove("open");
  navOverlay.classList.remove("active");
  document.body.style.overflow = "";
};

// ===================================
// ORDER FORM
// ===================================
const handleOrderSubmit = (e) => {
  e.preventDefault();
  const name    = $("clientName").value.trim();
  const phone   = $("clientPhone").value.trim();
  const size    = $("shirtSize").value;
  const quality = $("shirtQuality").value;
  const color   = $("shirtColor").value.trim()  || "Not specified";
  const design  = $("designDesc").value.trim()  || "Not specified";
  const msg =
    `Hi SHGAdrip! I'd like to place an order:\n\n` +
    `Name: ${name}\nPhone: ${phone}\nSize: ${size}\n` +
    `Quality/Grade: ${quality}\nColor: ${color}\nDesign: ${design}\n\n` +
    (CONFIG.discountEnabled ? `Note: 10% OFF promo applies to eligible items.\n\n` : "") +
    `Please confirm details. Thanks!`;
  window.open(`https://wa.me/2348134421763?text=${encodeURIComponent(msg)}`, "_blank", "noopener");
  orderForm.reset();
};

// ===================================
// EVENTS
// ===================================
const initEvents = () => {
  $$(".filter-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      $$(".filter-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      state.activeCategory = btn.dataset.filter;
      window.renderProducts();
    });
  });

  priceFilter.addEventListener("input", () => {
    state.maxPrice = parseInt(priceFilter.value, 10);
    priceDisplay.textContent = formatPrice(state.maxPrice);
    window.renderProducts();
  });

  modal.querySelector(".modal-close").addEventListener("click", closeModal);
  modal.addEventListener("click", (e) => { if (e.target === modal) closeModal(); });

  $("modalAddToCart").addEventListener("click", () => {
    const addBtn = $("modalAddToCart");
    if (addBtn?.disabled) return;
    const productId = addBtn.dataset.productId;
    const gradeIdx  = parseInt(addBtn.dataset.gradeIdx || "0", 10);
    addToCart(productId, gradeIdx);
    closeModal();
  });

  if (window.SHGACart) {
    cartBtn.addEventListener("click", window.SHGACart.open);
    cartOverlay.addEventListener("click", window.SHGACart.close);
    $("cartClose").addEventListener("click", window.SHGACart.close);
    cartWaBtn.addEventListener("click", () => {
      if (window.SHGACart && window.SHGACart.getCount() === 0) return;
      window.open(window.SHGACart.buildWaLink(), "_blank", "noopener");
    });
  }

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      if (modal.classList.contains("active")) closeModal();
      if (navMenu.classList.contains("open")) closeNav();
      if (cartPanel.classList.contains("open") && window.SHGACart) window.SHGACart.close();
    }
  });

  navToggle.addEventListener("click", () => {
    navMenu.classList.contains("open") ? closeNav() : openNav();
  });
  navOverlay.addEventListener("click", () => { if (navMenu.classList.contains("open")) closeNav(); });
  $$(".nav-link").forEach((link) => {
    link.addEventListener("click", () => { if (navMenu.classList.contains("open")) closeNav(); });
  });

  orderForm.addEventListener("submit", handleOrderSubmit);

  window.addEventListener("scroll", () => {
    header.classList.toggle("scrolled", window.scrollY > 60);
  }, { passive: true });

  $$('a[href^="#"]').forEach((a) => {
    a.addEventListener("click", (e) => {
      const href = a.getAttribute("href");
      if (href.length > 1) {
        const target = document.querySelector(href);
        if (target) { e.preventDefault(); target.scrollIntoView({ behavior: "smooth", block: "start" }); }
      }
    });
  });
};

// ===================================
// INTERSECTION OBSERVER
// ===================================
const initObserver = () => {
  const io = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.style.opacity   = "1";
        entry.target.style.transform = "translateY(0)";
        io.unobserve(entry.target);
      }
    });
  }, { threshold: 0.08 });

  const animateOnScroll = (selector) => {
    $$(selector).forEach((el, i) => {
      el.style.opacity    = "0";
      el.style.transform  = "translateY(24px)";
      el.style.transition = `opacity 0.5s ease ${i * 0.07}s, transform 0.5s ease ${i * 0.07}s`;
      io.observe(el);
    });
  };
  animateOnScroll(".feature");
  animateOnScroll(".stat");
  animateOnScroll(".size-card");
};

// ===================================
// INIT
// FIX: renderProducts() removed from here.
//      products.js shows a skeleton grid immediately and calls
//      window.renderProducts() once Firestore data arrives.
//      Calling it here too would overwrite the skeleton with an
//      empty grid before Firebase responds.
// ===================================
const init = () => {
  hideOrShowPromoUi();
  onDiscountChange(() => {
    hideOrShowPromoUi();
    if (typeof window.renderProducts === "function") window.renderProducts();
    if (window.SHGACart?.renderItems) window.SHGACart.renderItems();
  });
  updateCartUI();
  initEvents();
  initObserver();
  initPublicReviews();
};

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
