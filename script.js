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
 *  4. effectiveMinPrice() now falls back gracefully when product.price
 *     is undefined (Firebase products may not have a price yet).
 * ─────────────────────────────────────────────────────────────────
 */

// Import reviews functionality
import { initPublicReviews } from "./js/reviews.js";

// ===================================
// SHIRT GRADE / QUALITY TIERS
// Base fallback prices used when a product has no gradePrices saved.
// When a product HAS gradePrices, those override these per-product.
// ===================================
const SHIRT_GRADES = [
  { name: "Standard Pro 250 GSM",   price: 16000 },
  { name: "New Premium 320 GSM",    price: 22000 },
  { name: "Prime 350 GSM",          price: 28000 },
  { name: "Stone Wash 370 GSM",     price: 30000 },
];

// Return grade objects for a specific product, using stored gradePrices
// where available, falling back to SHIRT_GRADES defaults.
function getProductGrades(product) {
  if (product.category === "Caps") {
    return [{ name: "Fixed Price", price: 10000 }];
  }
  if (product.category === "Hoodies") {
    return [{ name: "Fixed Price", price: 30000 }];
  }
  const savedNames = Array.isArray(product.grades) && product.grades.length
    ? product.grades
    : (product.grade ? [product.grade] : SHIRT_GRADES.map(g => g.name));

  return SHIRT_GRADES
    .filter(g => savedNames.includes(g.name))
    .map(g => ({
      name:  g.name,
      price: (product.gradePrices && product.gradePrices[g.name])
             ? Number(product.gradePrices[g.name])
             : g.price
    }));
}

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
// CART
// ===================================
let cart = [];

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
  selectedGrade:  SHIRT_GRADES[0],
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
const formatPrice = (price) => `\u20a6${price.toLocaleString("en-NG")}`;

const contrastColor = (hex) => {
  if (!hex) return "#ffffff";
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.55 ? "#111111" : "#ffffff";
};

const buildSingleWaLink = (product, grade, color) => {
  const phone     = "2348134421763";
  const gradeInfo = product.type === "sleeveless"
    ? `Fixed Price: ${formatPrice(product.price || 0)}`
    : `Shirt Grade: ${grade.name} — ${formatPrice(grade.price)}`;
  const colorInfo  = color ? `Color: ${color.name}${color.isCustom ? " (custom — please specify)" : ""}` : "";
  const sleeveInfo = product.type !== "sleeveless" && state.selectedSleeve ? `Sleeve Style: ${state.selectedSleeve.name}` : "";
  const sizeInfo   = state.selectedSize ? `Size: ${state.selectedSize.label}` : "";
  const msg =
    `Hi SHGAdrip! I'd like to order:\n\n` +
    `Design: ${product.name}\n${gradeInfo}\n${sleeveInfo}\n${sizeInfo}\n${colorInfo}\n\n` +
    `Please confirm availability and delivery details. Thanks!`;
  return `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`;
};

const buildCartWaLink = () => {
  const phone = "2348134421763";
  const lines = cart.map((item, i) =>
    `${i + 1}. ${item.design}` +
    (item.shirtGrade  ? ` · ${item.shirtGrade} Grade`  : "") +
    (item.size        ? ` · Size ${item.size}`          : "") +
    (item.sleeveStyle ? ` · ${item.sleeveStyle}`        : "") +
    (item.color       ? ` · ${item.color}`              : "") +
    ` — ${formatPrice(item.price)} x ${item.quantity}`
  ).join("\n");
  const total = cart.reduce((s, i) => s + i.price * i.quantity, 0);
  const msg   = `Hi SHGAdrip! Here's my order:\n\n${lines}\n\nTotal: ${formatPrice(total)}\n\nPlease confirm details. Thanks!`;
  return `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`;
};

// FIX: guard against undefined price (Firestore product before price is set)
// Uses per-product gradePrices if available; falls back to SHIRT_GRADES defaults.
const effectiveMinPrice = (p) => {
  if (p.category === "Caps") return 10000;
  if (p.category === "Hoodies") return 30000;
  if (p.type === "sleeveless") return Number(p.price) || 0;
  const grades = getProductGrades(p);
  if (!grades.length) return SHIRT_GRADES[0].price;
  return Math.min(...grades.map(g => g.price));
};
const isFeaturedProduct = (product) => Boolean(product && product.isFeatured);

// ===================================
// RENDER PRODUCT GRID
// FIX: reads window.products dynamically so Firebase updates reflect immediately.
// FIX: exposed as window.renderProducts so products.js can call it.
// ===================================
const renderProducts = () => {
  // Always read from the live window.products array
  const source   = (window.products || []).filter(isFeaturedProduct);
  const filtered = source.filter((p) => {
    const catMatch   = state.activeCategory === "all" || p.category === state.activeCategory;
    const priceMatch = effectiveMinPrice(p) <= state.maxPrice;
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

    const priceLabel = (product.category === "Caps" || product.category === "Hoodies" || product.type === "sleeveless")
      ? formatPrice(effectiveMinPrice(product))
      : `From ${formatPrice(effectiveMinPrice(product))}`;

    // Out-of-stock badge
    const outOfStock = Number(product.stock) === 0;
    const stockBadge = outOfStock
      ? `<span class="card-out-of-stock-badge">Out of Stock</span>`
      : "";

    card.innerHTML = `
      <div class="card-image">
        <img src="${product.image || product.imageUrl || ''}" alt="${product.name}" loading="lazy"
             onerror="this.parentElement.style.background='var(--black-3)'; this.style.display='none'">
        ${stockBadge}
      </div>
      <div class="card-body">
        <p class="card-cat">${product.category}</p>
        <h3 class="card-name">${product.name}</h3>
        <p class="card-price">${priceLabel}</p>
        <span class="card-cta">${outOfStock ? "Unavailable" : "Choose Grade &amp; Color"}</span>
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
};

// FIX: expose globally so products.js can call it after Firebase loads
window.renderProducts = renderProducts;

// ===================================
// MODAL – Grade Selector
// Only shows grades the admin enabled for this product.
// Each grade button displays the price the admin set for that grade.
// Falls back to SHIRT_GRADES defaults for legacy products.
// ===================================
const renderGradeSelector = (product) => {
  const wrap = $("gradeSelector");
  if (!wrap) return;

  if (product.type === "sleeveless") {
    wrap.innerHTML = `
      <div class="grade-fixed-notice">
        <i class="fa-solid fa-tag"></i>
        Fixed price — no grade selection needed
      </div>`;
    return;
  }

  // Get grades with per-product prices
  const grades = getProductGrades(product);
  const toShow  = grades.length ? grades : SHIRT_GRADES;

  state.selectedGrade = toShow[0];

  wrap.innerHTML = toShow.map((g, idx) => `
    <button class="grade-btn${idx === 0 ? " active" : ""}"
            data-grade-name="${g.name}" aria-pressed="${idx === 0}">
      <span class="grade-btn-name">${g.name}</span>
      <span class="grade-btn-price">${formatPrice(g.price)}</span>
    </button>`
  ).join("");

  $("modalAddToCart").dataset.gradeIdx = idx_of(toShow[0], toShow);

  wrap.querySelectorAll(".grade-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const grade = toShow.find(g => g.name === btn.dataset.gradeName);
      if (!grade) return;
      state.selectedGrade = grade;
      wrap.querySelectorAll(".grade-btn").forEach((b) => { b.classList.remove("active"); b.setAttribute("aria-pressed", "false"); });
      btn.classList.add("active");
      btn.setAttribute("aria-pressed", "true");
      $("modalPrice").textContent = formatPrice(grade.price);
      $("modalWaLink").href = buildSingleWaLink(product, grade, state.selectedColor);
      $("modalAddToCart").dataset.gradeIdx = idx_of(grade, toShow);
    });
  });
};

// helper: index in array by name
function idx_of(grade, arr) { return arr.findIndex(g => g.name === grade.name); }

// ===================================
// MODAL – Size Selector
// Only shows sizes the admin enabled for this product.
// Falls back to all sizes for legacy products.
// ===================================
const renderSizeSelector = (product) => {
  const wrap = $("sizeSelector");
  if (!wrap) return;

  const normalize = (s) => {
    const v = String(s || "").toUpperCase().trim();
    if (v === "XXL") return "2XL";
    if (v === "XXXL") return "3XL";
    return v;
  };

  const savedLabels = Array.isArray(product.sizes) && product.sizes.length
    ? product.sizes.map(normalize)
    : SHIRT_SIZES.map(s => s.label);
  const toShow = SHIRT_SIZES.filter(s => savedLabels.includes(s.label));
  const sizes  = toShow.length ? toShow : SHIRT_SIZES;

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

  // Show sleeve selector if product has sleeveless option
  const showSleeve = product.hasSleeveless || product.type === "sleeveless";

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
// Only shows colors the admin enabled for this product.
// Falls back to all colors for legacy products.
// ===================================
const renderColorSelector = (product) => {
  const container = $("colorSelectorWrap");
  if (!container) return;

  const savedNames = Array.isArray(product.colors) && product.colors.length
    ? product.colors : SHIRT_COLORS.map(c => c.name);
  const toShow = SHIRT_COLORS.filter(c => savedNames.includes(c.name));
  const colors = toShow.length ? toShow : SHIRT_COLORS;

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
      $("modalWaLink").href = buildSingleWaLink(product, state.selectedGrade, state.selectedColor);
    });
  });
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
const openModal = (product) => {
  state.openProduct = product;

  // Resolve the first grade available for this specific product (with its price)
  const available = getProductGrades(product);
  state.selectedGrade = (available.length ? available : SHIRT_GRADES)[0];

  modalImg.src           = product.image || product.imageUrl || "";
  modalImg.alt           = product.name;
  modalCat.textContent   = product.category;
  modalTitle.textContent = product.name;
  modalDesc.textContent  = product.description || "";
  modalPrice.textContent = product.type === "sleeveless"
    ? formatPrice(product.price || 0)
    : formatPrice(state.selectedGrade.price);

  renderGradeSelector(product);
  renderSizeSelector(product);
  renderSleeveSelector(product);
  renderColorSelector(product);

  $("modalAddToCart").dataset.productId = product.id;
  $("modalAddToCart").dataset.gradeIdx  = 0;
  $("modalWaLink").href = buildSingleWaLink(product, state.selectedGrade, state.selectedColor);

  modal.classList.add("active");
  document.body.style.overflow = "hidden";
};

const closeModal = () => {
  modal.classList.remove("active");
  document.body.style.overflow = "";
  state.openProduct = null;
};

// ===================================
// CART
// ===================================
const updateCartUI = () => {
  const total = cart.reduce((s, i) => s + i.quantity, 0);
  if (total > 0) {
    cartCount.textContent = total;
    cartCount.style.display = "flex";
  } else {
    cartCount.style.display = "none";
  }
  const totalPrice = cart.reduce((s, i) => s + i.price * i.quantity, 0);
  cartTotal.textContent = formatPrice(totalPrice);
  cartEmptyMsg.style.display = cart.length === 0 ? "block" : "none";
  cartWaBtn.style.display    = cart.length > 0  ? "block" : "none";
};

const addToCart = (productId, gradeIdx) => {
  const source  = window.products || [];
  const product = source.find(p => String(p.id) === String(productId));
  if (!product) return;

  const productGrades = getProductGrades(product);
  const grade = product.type === "sleeveless" ? null : (productGrades[gradeIdx] || productGrades[0]);
  const price = product.type === "sleeveless" ? (product.price || 0) : (grade ? grade.price : 0);

  const item = {
    productId,
    design:     product.name,
    shirtGrade: grade ? grade.name : null,
    price,
    size:        state.selectedSize   ? state.selectedSize.label   : null,
    sleeveStyle: state.selectedSleeve ? state.selectedSleeve.name  : null,
    color:       state.selectedColor  ? state.selectedColor.name   : null,
    quantity:    1,
  };

  const key = `${productId}-${item.shirtGrade}-${item.size}-${item.sleeveStyle}-${item.color}`;
  const existing = cart.find(c =>
    `${c.productId}-${c.shirtGrade}-${c.size}-${c.sleeveStyle}-${c.color}` === key
  );

  if (existing) {
    existing.quantity++;
  } else {
    cart.push(item);
  }

  updateCartUI();
  showCartToast(product.name, item.shirtGrade, item.size, item.sleeveStyle, item.color, price);
};

window.changeQty = (idx, delta) => {
  cart[idx].quantity += delta;
  if (cart[idx].quantity <= 0) cart.splice(idx, 1);
  updateCartUI();
  renderCartItems();
};

window.removeFromCart = (idx) => {
  cart.splice(idx, 1);
  updateCartUI();
  renderCartItems();
};

const renderCartItems = () => {
  if (cart.length === 0) { cartItems.innerHTML = ""; return; }
  cartItems.innerHTML = cart.map((item, idx) => {
    const colorObj   = SHIRT_COLORS.find(c => c.name === item.color);
    const swatchStyle = colorObj
      ? `background:${colorObj.hex};`
      : "background:var(--grey);";

    return `
    <div class="cart-item">
      <div class="cart-item-info">
        <p class="cart-item-name">${item.design}</p>
        <div class="cart-item-meta">
          ${item.shirtGrade ? `<span class="cart-meta-badge">${item.shirtGrade}</span>` : `<span class="cart-meta-badge">Fixed</span>`}
          ${item.size        ? `<span class="cart-meta-badge cart-meta-badge--size">${item.size}</span>` : ""}
          ${item.sleeveStyle ? `<span class="cart-meta-badge cart-meta-badge--sleeve"><i class="${item.sleeveStyle === 'Sleeveless' ? 'fa-solid fa-person-running' : 'fa-solid fa-shirt'}"></i> ${item.sleeveStyle}</span>` : ""}
          <span class="cart-color-dot" style="${swatchStyle}" title="${item.color}"></span>
          <span class="cart-item-color-name">${item.color || ""}</span>
        </div>
        <p class="cart-item-price">${formatPrice(item.price)}</p>
      </div>
      <div class="cart-item-controls">
        <button class="cart-qty-btn" onclick="changeQty(${idx},-1)">−</button>
        <span class="cart-qty-num">${item.quantity}</span>
        <button class="cart-qty-btn" onclick="changeQty(${idx},1)">+</button>
        <button class="cart-remove-btn" onclick="removeFromCart(${idx})" aria-label="Remove">
          <i class="fa-solid fa-xmark"></i>
        </button>
      </div>
    </div>`;
  }).join("");
};

const showCartToast = (name, grade, size, sleeve, color, price) => {
  const existing = document.querySelector(".cart-toast");
  if (existing) existing.remove();
  const toast = document.createElement("div");
  toast.className = "cart-toast";
  toast.innerHTML = `
    <i class="fa-solid fa-circle-check"></i>
    <span><strong>${name}</strong>${grade ? ` · ${grade}` : ""}${size ? ` · ${size}` : ""}${sleeve ? ` · ${sleeve}` : ""}${color ? ` · ${color}` : ""} — ${formatPrice(price)}</span>`;
  document.body.appendChild(toast);
  setTimeout(() => toast.classList.add("visible"), 10);
  setTimeout(() => { toast.classList.remove("visible"); setTimeout(() => toast.remove(), 300); }, 2800);
};

// ===================================
// CART PANEL
// ===================================
const openCart = () => {
  renderCartItems();
  cartPanel.classList.add("open");
  cartOverlay.classList.add("active");
  document.body.style.overflow = "hidden";
};

const closeCart = () => {
  cartPanel.classList.remove("open");
  cartOverlay.classList.remove("active");
  document.body.style.overflow = "";
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
      renderProducts();
    });
  });

  priceFilter.addEventListener("input", () => {
    state.maxPrice = parseInt(priceFilter.value, 10);
    priceDisplay.textContent = formatPrice(state.maxPrice);
    renderProducts();
  });

  modal.querySelector(".modal-close").addEventListener("click", closeModal);
  modal.addEventListener("click", (e) => { if (e.target === modal) closeModal(); });

  $("modalAddToCart").addEventListener("click", () => {
    const productId = $("modalAddToCart").dataset.productId; // keep as string (Firebase doc ID)
    const gradeIdx  = parseInt($("modalAddToCart").dataset.gradeIdx || "0", 10);
    addToCart(productId, gradeIdx);
    closeModal();
  });

  cartBtn.addEventListener("click", openCart);
  cartOverlay.addEventListener("click", closeCart);
  $("cartClose").addEventListener("click", closeCart);
  cartWaBtn.addEventListener("click", () => {
    if (cart.length === 0) return;
    window.open(buildCartWaLink(), "_blank", "noopener");
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      if (modal.classList.contains("active")) closeModal();
      if (navMenu.classList.contains("open")) closeNav();
      if (cartPanel.classList.contains("open")) closeCart();
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
