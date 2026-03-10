/*
 * cart.js — SHGAdrip Shared Cart
 * ─────────────────────────────────────────────────────────────────
 * Single source of truth for the cart across ALL pages.
 * - Persists to localStorage so cart survives page refreshes/navigation
 * - Exposes window.SHGACart API used by script.js, collections-page.js,
 *   and product-page.js
 * - Renders the cart panel + badge wherever the #cartBtn / #cartPanel
 *   HTML exists in the page
 */

(() => {
  const STORAGE_KEY = "shgadrip_cart_v1";

  const SHIRT_COLORS = [
    { id: "white",      name: "White",      hex: "#FFFFFF" },
    { id: "black",      name: "Black",      hex: "#000000" },
    { id: "cream",      name: "Cream",      hex: "#FFFDD0" },
    { id: "red",        name: "Red",        hex: "#CC2222" },
    { id: "navy-blue",  name: "Navy Blue",  hex: "#0A1A3A" },
    { id: "royal-blue", name: "Royal Blue", hex: "#4169E1" },
    { id: "sky-blue",   name: "Sky Blue",   hex: "#87CEEB" },
    { id: "yellow",     name: "Yellow",     hex: "#F5CC00" },
    { id: "grey",       name: "Grey",       hex: "#9E9E9E" },
    { id: "green",      name: "Green",      hex: "#22A34C" },
    { id: "purple",     name: "Purple",     hex: "#6B2DB5" },
  ];

  const fmt = (price) => `\u20a6${Number(price || 0).toLocaleString("en-NG")}`;

  // ── Persistence ────────────────────────────────────────────────
  function load() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    } catch {
      return [];
    }
  }

  function save(cart) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(cart));
    } catch {/* storage full — ignore */}
  }

  // ── State ──────────────────────────────────────────────────────
  let cart = load();

  // ── DOM helpers ────────────────────────────────────────────────
  const $ = (id) => document.getElementById(id);

  // ── Badge update (works on every page that has #cartCount) ─────
  function updateBadge() {
    const badge = $("cartCount");
    if (!badge) return;
    const total = cart.reduce((s, i) => s + i.quantity, 0);
    badge.textContent = total;
    badge.style.display = total > 0 ? "flex" : "none";
  }

  // ── Render cart items panel ────────────────────────────────────
  function renderCartItems() {
    const cartItems = $("cartItems");
    const cartTotal = $("cartTotal");
    const cartEmptyMsg = $("cartEmptyMsg");
    const cartWaBtn = $("cartWaBtn");
    if (!cartItems) return;

    if (cart.length === 0) {
      cartItems.innerHTML = "";
      if (cartEmptyMsg) cartEmptyMsg.style.display = "block";
      if (cartWaBtn)    cartWaBtn.style.display    = "none";
      if (cartTotal)    cartTotal.textContent       = fmt(0);
      return;
    }

    if (cartEmptyMsg) cartEmptyMsg.style.display = "none";
    if (cartWaBtn)    cartWaBtn.style.display    = "block";

    const totalPrice = cart.reduce((s, i) => s + i.price * i.quantity, 0);
    if (cartTotal) cartTotal.textContent = fmt(totalPrice);

    cartItems.innerHTML = cart.map((item, idx) => {
      const colorObj    = SHIRT_COLORS.find(c => c.name === item.color);
      const swatchStyle = colorObj ? `background:${colorObj.hex};` : "background:var(--grey);";

      return `
      <div class="cart-item">
        <div class="cart-item-thumb">
          ${item.imageUrl
            ? `<img src="${item.imageUrl}" alt="${item.design}" loading="lazy" onerror="this.style.display='none'">`
            : `<div class="cart-item-thumb-placeholder"><i class="fa-solid fa-shirt"></i></div>`}
        </div>
        <div class="cart-item-info">
          <p class="cart-item-name">${item.design}</p>
          <div class="cart-item-meta">
            ${item.shirtGrade
              ? `<span class="cart-meta-badge">${item.shirtGrade}</span>`
              : `<span class="cart-meta-badge">Fixed</span>`}
            ${item.size        ? `<span class="cart-meta-badge cart-meta-badge--size">${item.size}</span>` : ""}
            ${item.sleeveStyle ? `<span class="cart-meta-badge cart-meta-badge--sleeve"><i class="${item.sleeveStyle === "Sleeveless" ? "fa-solid fa-person-running" : "fa-solid fa-shirt"}"></i> ${item.sleeveStyle}</span>` : ""}
            <span class="cart-color-dot" style="${swatchStyle}" title="${item.color || ""}"></span>
            <span class="cart-item-color-name">${item.color || ""}</span>
          </div>
          <p class="cart-item-price">${fmt(item.price)}</p>
        </div>
        <div class="cart-item-right">
          <button class="cart-remove-btn" onclick="window.SHGACart.remove(${idx})" aria-label="Remove">
            <i class="fa-solid fa-xmark"></i>
          </button>
          <div class="cart-item-controls">
            <button class="cart-qty-btn" onclick="window.SHGACart.changeQty(${idx},-1)">−</button>
            <span class="cart-qty-num">${item.quantity}</span>
            <button class="cart-qty-btn" onclick="window.SHGACart.changeQty(${idx},1)">+</button>
          </div>
        </div>
      </div>`;
    }).join("");
  }

  // ── Toast ──────────────────────────────────────────────────────
  function showToast(name, grade, size, sleeve, color, price) {
    const existing = document.querySelector(".cart-toast");
    if (existing) existing.remove();
    const toast = document.createElement("div");
    toast.className = "cart-toast";
    toast.innerHTML =
      `<i class="fa-solid fa-circle-check"></i>` +
      `<span><strong>${name}</strong>` +
      `${grade  ? ` · ${grade}`  : ""}` +
      `${size   ? ` · ${size}`   : ""}` +
      `${sleeve ? ` · ${sleeve}` : ""}` +
      `${color  ? ` · ${color}`  : ""}` +
      ` — ${fmt(price)}</span>`;
    document.body.appendChild(toast);
    setTimeout(() => toast.classList.add("visible"), 10);
    setTimeout(() => {
      toast.classList.remove("visible");
      setTimeout(() => toast.remove(), 300);
    }, 2800);
  }

  // ── WhatsApp link ──────────────────────────────────────────────
  function buildCartWaLink() {
    const phone = "2348134421763";
    const baseUrl = window.location.origin;
    const lines = cart.map((item, i) => {
      const productPageUrl = `${baseUrl}/product.html?id=${encodeURIComponent(item.productId)}`;
      // always send something under the "Image" label; fall back to product page
      const imgLink = item.imageUrl ? item.imageUrl : productPageUrl;
      return (
        `${i + 1}. ${item.design}` +
        (item.shirtGrade  ? ` · ${item.shirtGrade} Grade`  : "") +
        (item.size        ? ` · Size ${item.size}`          : "") +
        (item.sleeveStyle ? ` · ${item.sleeveStyle}`        : "") +
        (item.color       ? ` · ${item.color}`              : "") +
        ` — ${fmt(item.price)} x ${item.quantity}` +
        `\n   🖼 Image: ${imgLink}` +
        `\n   🔗 View: ${productPageUrl}`
      );
    }).join("\n\n");
    const total = cart.reduce((s, i) => s + i.price * i.quantity, 0);
    const msg = `Hi SHGAdrip! Here's my order:

${lines}

Total: ${fmt(total)}

Please confirm details. Thanks!`;
    return `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`;
  }

  // ── Cart panel open/close ──────────────────────────────────────
  function openCart() {
    renderCartItems();
    const panel   = $("cartPanel");
    const overlay = $("cartOverlay");
    if (panel)   panel.classList.add("open");
    if (overlay) overlay.classList.add("active");
    document.body.style.overflow = "hidden";
  }

  function closeCart() {
    const panel   = $("cartPanel");
    const overlay = $("cartOverlay");
    if (panel)   panel.classList.remove("open");
    if (overlay) overlay.classList.remove("active");
    document.body.style.overflow = "";
  }

  // ── Public API ─────────────────────────────────────────────────
  window.SHGACart = {

    /** Add item to cart. item = { productId, design, imageUrl, shirtGrade, price, size, sleeveStyle, color } */
    add(item) {
      const key = `${item.productId}-${item.shirtGrade}-${item.size}-${item.sleeveStyle}-${item.color}`;
      const existing = cart.find(c =>
        `${c.productId}-${c.shirtGrade}-${c.size}-${c.sleeveStyle}-${c.color}` === key
      );
      if (existing) {
        existing.quantity++;
      } else {
        cart.push({ ...item, quantity: 1 });
      }
      save(cart);
      updateBadge();
      showToast(item.design, item.shirtGrade, item.size, item.sleeveStyle, item.color, item.price);
    },

    changeQty(idx, delta) {
      if (!cart[idx]) return;
      cart[idx].quantity += delta;
      if (cart[idx].quantity <= 0) cart.splice(idx, 1);
      save(cart);
      updateBadge();
      renderCartItems();
    },

    remove(idx) {
      cart.splice(idx, 1);
      save(cart);
      updateBadge();
      renderCartItems();
    },

    getAll()    { return cart; },
    getCount()  { return cart.reduce((s, i) => s + i.quantity, 0); },
    buildWaLink: buildCartWaLink,
    open:  openCart,
    close: closeCart,
    renderItems: renderCartItems,
    updateBadge,
  };

  // ── Wire up cart panel events once DOM is ready ────────────────
  function initCartEvents() {
    const cartBtn     = $("cartBtn");
    const cartClose   = $("cartClose");
    const cartOverlay = $("cartOverlay");
    const cartWaBtn   = $("cartWaBtn");

    if (cartBtn)     cartBtn.addEventListener("click", openCart);
    if (cartClose)   cartClose.addEventListener("click", closeCart);
    if (cartOverlay) cartOverlay.addEventListener("click", closeCart);
    if (cartWaBtn)   cartWaBtn.addEventListener("click", () => {
      if (cart.length === 0) return;
      window.open(buildCartWaLink(), "_blank", "noopener");
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        const panel = $("cartPanel");
        if (panel && panel.classList.contains("open")) closeCart();
      }
    });

    // Hydrate badge on load
    updateBadge();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initCartEvents);
  } else {
    initCartEvents();
  }

})();
