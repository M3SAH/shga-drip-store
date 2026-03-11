/**
 * collections-page.js
 * Lightweight renderer for /collections (handles hundreds of products).
 * - Renders in chunks (pagination / infinite "load more")
 * - Avoids expensive full reflows by appending with DocumentFragment
 * - Uses native lazy-loading images
 */

(() => {
  // -----------------------------
  // Config
  // -----------------------------
  const PAGE_SIZE = 20;

  // -----------------------------
  // Helpers
  // -----------------------------
  const $ = (id) => document.getElementById(id);
  const $$ = (sel) => document.querySelectorAll(sel);
  const formatPrice = (price) => `\u20a6${Number(price || 0).toLocaleString("en-NG")}`;

  const DISCOUNT_RATE = 0.10;
  const applyDiscount = (price) => {
    const base = Number(price) || 0;
    return Math.round(base * (1 - DISCOUNT_RATE));
  };

  const buildDiscountPriceHtml = (price, { prefix = "", suffix = "" } = {}) => {
    const base = Number(price) || 0;
    if (!base) return formatPrice(0);
    const discounted = applyDiscount(base);
    const prefixHtml = prefix ? `<span class="price-prefix">${prefix}</span> ` : "";
    return (
      `${prefixHtml}<span class="price-original">${formatPrice(base)}</span>` +
      `<span class="price-discounted">${formatPrice(discounted)}${suffix}</span>`
    );
  };

  const DEFAULT_GRADES = [
    { name: "Standard Pro 250 GSM", price: 16000 },
    { name: "New Premium 320 GSM", price: 22000 },
    { name: "Prime 350 GSM", price: 28000 },
    { name: "Stone Wash 370 GSM", price: 30000 },
  ];

  function getMinPrice(product) {
    if (!product) return 0;
    if (product.category === "Caps")
      return Number(product.price) || 10000;
    if (product.category === "Hoodies")
      return Number(product.price) || 30000;
    if (product.category === "Sleeveless" || product.type === "sleeveless")
      return Number(product.price) || 0;
    const gradePrices = product.gradePrices || {};
    const enabled =
      Array.isArray(product.grades) && product.grades.length
        ? product.grades
        : DEFAULT_GRADES.map((g) => g.name);
    const prices = DEFAULT_GRADES
      .filter((g) => enabled.includes(g.name))
      .map((g) =>
        gradePrices[g.name] ? Number(gradePrices[g.name]) : g.price,
      );
    return prices.length ? Math.min(...prices) : DEFAULT_GRADES[0].price;
  }

  function normalizeText(s) {
    return String(s || "").toLowerCase().trim();
  }

  function buildProductUrl(product) {
    // Keep it simple + static-host friendly
    return `../product.html?id=${encodeURIComponent(product.id)}`;
  }

  // -----------------------------
  // State
  // -----------------------------
  const state = {
    activeCategory: "all",
    maxPrice: 50000,
    search: "",
    sort: "recent",
    currentPage: 1,
    currentList: [],
  };

  // -----------------------------
  // DOM
  // -----------------------------
  const grid = $("productGrid");
  const priceFilter = $("priceFilter");
  const priceDisplay = $("priceDisplay");
  const searchInput = $("collectionsSearch");
  const sortSelect = $("collectionsSort");
  const countEl = $("collectionsCount");
  const paginationContainer = $("paginationContainer");

  if (!grid) return;

  // -----------------------------
  // Render
  // -----------------------------
  function computeFiltered() {
    const source = window.products || [];
    const q = normalizeText(state.search);

    const filtered = source.filter((p) => {
      const catMatch = state.activeCategory === "all" || p.category === state.activeCategory;
      const priceMatch = getMinPrice(p) <= state.maxPrice;
      const searchMatch = !q || normalizeText(p.name).includes(q) || normalizeText(p.description).includes(q);
      return catMatch && priceMatch && searchMatch;
    });
    filtered.sort((a, b) => {
      const aTime = Number(a.createdAtMs) || 0;
      const bTime = Number(b.createdAtMs) || 0;
      if (state.sort === "oldest") return aTime - bTime;
      return bTime - aTime;
    });
    return filtered;
  }

  function updateCountUI(total, pageNum) {
    if (!countEl) return;
    if (total === 0) {
      countEl.textContent = "No products found.";
      return;
    }
    const page = pageNum || state.currentPage || 1;
    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    const start =
      total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
    const end = Math.min(total, page * PAGE_SIZE);
    countEl.textContent =
      total === 0
        ? "No products found."
        : `Showing ${start.toLocaleString(
            "en-NG",
          )}\u2013${end.toLocaleString(
            "en-NG",
          )} of ${total.toLocaleString("en-NG")} products (Page ${page} of ${totalPages})`;
  }

  function renderPage(pageNum) {
    const list = state.currentList || [];
    const total = list.length;
    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    const page = Math.min(Math.max(pageNum, 1), totalPages);
    state.currentPage = page;

    grid.innerHTML = "";
    if (total === 0) {
      updateCountUI(0, 1);
      return;
    }

    const startIdx = (page - 1) * PAGE_SIZE;
    const next = list.slice(startIdx, startIdx + PAGE_SIZE);
    const frag = document.createDocumentFragment();

    for (const product of next) {
      const card = document.createElement("div");
      card.className = "product-card product-card--collections";

      const outOfStock = Number(product.stock) === 0;
      const isFixedPrice =
        ["Caps", "Hoodies", "Sleeveless"].includes(product.category) ||
        product.type === "sleeveless";
      const minPrice = getMinPrice(product);
      const priceLabel = isFixedPrice
        ? buildDiscountPriceHtml(minPrice)
        : buildDiscountPriceHtml(minPrice, { prefix: "From" });

      const stockBadge = outOfStock
        ? `<span class="card-out-of-stock-badge">Out of Stock</span>`
        : "";

      const href = buildProductUrl(product);

      card.innerHTML = `
        <a
          class="product-card-link"
          href="${href}"
          aria-label="View ${product.name}"
        >
          <div class="card-image">
            <img
              src="${product.image || product.imageUrl || ""}"
              alt="${product.name}"
              loading="lazy"
              decoding="async"
              onerror="this.parentElement.style.background='var(--black-3)'; this.style.display='none'"
            />
            ${stockBadge}
          </div>
          <div class="card-body">
            <p class="card-cat">${product.category || ""}</p>
            <h3 class="card-name">${product.name || ""}</h3>
            <p class="card-price">${priceLabel}</p>
          </div>
        </a>
        ${
          !outOfStock
            ? `<button
                class="card-add-to-cart-btn"
                data-product-id="${product.id}"
                aria-label="Add ${product.name} to cart"
                title="Add to cart"
              >
                <i class="fa-solid fa-cart-plus"></i>
              </button>`
            : ""
        }
      `;

      frag.appendChild(card);
    }

    grid.appendChild(frag);
    updateCountUI(total, page);

    grid.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function renderPagination(totalItems) {
    if (!paginationContainer) return;
    const total = totalItems || 0;
    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

    if (totalPages <= 1) {
      paginationContainer.innerHTML = "";
      return;
    }

    const current = state.currentPage || 1;
    const btn = (label, page, disabled = false, extraClass = "") =>
      `<button type="button" class="${extraClass}" data-page="${page}"${
        disabled ? " disabled" : ""
      }>${label}</button>`;

    const parts = [];

    // Prev
    parts.push(
      btn(
        "Prev",
        Math.max(1, current - 1),
        current === 1,
        "pagination-prev",
      ),
    );

    const pages = [];
    if (totalPages <= 7) {
      for (let p = 1; p <= totalPages; p++) pages.push(p);
    } else {
      if (current <= 4) {
        pages.push(1, 2, 3, 4, 5, "...", totalPages);
      } else if (current >= totalPages - 3) {
        pages.push(1, "...", totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages);
      } else {
        pages.push(1, "...", current - 1, current, current + 1, "...", totalPages);
      }
    }

    pages.forEach((p) => {
      if (p === "...") {
        parts.push('<span class="ellipsis">…</span>');
      } else {
        const isActive = p === current;
        parts.push(
          btn(
            String(p),
            p,
            false,
            `pagination-page${isActive ? " active" : ""}`,
          ),
        );
      }
    });

    // Next
    parts.push(
      btn(
        "Next",
        Math.min(totalPages, current + 1),
        current === totalPages,
        "pagination-next",
      ),
    );

    paginationContainer.innerHTML = `<div class="pagination">${parts.join("")}</div>`;

    paginationContainer.querySelectorAll("button[data-page]").forEach((el) => {
      el.addEventListener("click", () => {
        const page = parseInt(el.getAttribute("data-page") || "1", 10);
        if (!Number.isFinite(page)) return;
        renderPage(page);
        renderPagination(total);
      });
    });
  }

  // Exposed callback — products.js calls this when Firestore data arrives/updates
  window.renderProducts = () => {
    const list = computeFiltered();
    state.currentList = list;
    state.currentPage = 1;
    renderPage(1);
    renderPagination(list.length);
  };

    // ── Add-to-cart: delegated click on the product grid ──
    if (grid) {
      grid.addEventListener("click", (e) => {
        const btn = e.target.closest(".card-add-to-cart-btn");
        if (!btn || !window.SHGACart) return;
        e.preventDefault();

        const productId = btn.dataset.productId;
        const source    = window.products || [];
        const product   = source.find(p => String(p.id) === String(productId));
        if (!product) return;

        const DEFAULT_GRADES_LOCAL = [
          { name: "Standard Pro 250 GSM", price: 16000 },
          { name: "New Premium 320 GSM",  price: 22000 },
          { name: "Prime 350 GSM",        price: 28000 },
          { name: "Stone Wash 370 GSM",   price: 30000 },
        ];
        const isCap        = product.category === "Caps";
        const isHoodie     = product.category === "Hoodies";
        const isSleeveless = product.type === "sleeveless" || product.category === "Sleeveless";

        let grade = null;
        let price = 0;
        if (isCap)          { price = Number(product.price) || 10000; }
        else if (isHoodie)  { price = Number(product.price) || 30000; }
        else if (isSleeveless){ price = Number(product.price) || 0; }
        else {
          const enabledNames = Array.isArray(product.grades) && product.grades.length
            ? product.grades : DEFAULT_GRADES_LOCAL.map(g => g.name);
          const gradePrices  = product.gradePrices || {};
          const firstGrade   = DEFAULT_GRADES_LOCAL.find(g => enabledNames.includes(g.name));
          grade = firstGrade
            ? { name: firstGrade.name, price: gradePrices[firstGrade.name] ? Number(gradePrices[firstGrade.name]) : firstGrade.price }
            : DEFAULT_GRADES_LOCAL[0];
          price = grade.price;
        }

        const defaultSize  = (Array.isArray(product.sizes)  && product.sizes.length)  ? product.sizes[0]  : "L";
        const defaultColor = (Array.isArray(product.colors) && product.colors.length) ? product.colors[0] : "White";

        window.SHGACart.add({
          productId:  product.id,
          design:     product.name,
          imageUrl:   product.imageUrl || product.image || "",
          shirtGrade: grade ? grade.name : null,
          price,
          size:        isCap ? null : defaultSize,
          sleeveStyle: isSleeveless ? "Sleeveless" : "With Sleeves",
          color:       defaultColor,
        });

        // Visual feedback on button
        if (typeof window.syncCartFromCollections === "function") {
          window.syncCartFromCollections();
        }

        // Quick visual feedback on button
        btn.innerHTML = `<i class="fa-solid fa-check"></i>`;
        btn.classList.add("added");
        setTimeout(() => {
          btn.innerHTML = `<i class="fa-solid fa-cart-plus"></i>`;
          btn.classList.remove("added");
        }, 1400);
      });
    }

cts = () => {
    const list = computeFiltered();
    state.currentList = list;
    state.currentPage = 1;
    renderPage(1);
    renderPagination(list.length);
  };

  // -----------------------------
  // Events
  // -----------------------------
  function initEvents() {
    // Mobile nav (shared behavior)
    const navToggle = $("navToggle");
    const navMenu = $("navMenu");
    const navOverlay = $("navOverlay");
    const header = $("header");

    const openNav = () => {
      if (!navMenu || !navToggle || !navOverlay) return;
      navMenu.classList.add("open");
      navToggle.classList.add("open");
      navOverlay.classList.add("active");
      document.body.style.overflow = "hidden";
    };
    const closeNav = () => {
      if (!navMenu || !navToggle || !navOverlay) return;
      navMenu.classList.remove("open");
      navToggle.classList.remove("open");
      navOverlay.classList.remove("active");
      document.body.style.overflow = "";
    };

    if (navToggle && navMenu) {
      navToggle.addEventListener("click", () => {
        navMenu.classList.contains("open") ? closeNav() : openNav();
      });
    }
    if (navOverlay) navOverlay.addEventListener("click", closeNav);
    $$(".nav-link").forEach((link) => link.addEventListener("click", closeNav));
    window.addEventListener("scroll", () => {
      if (header) header.classList.toggle("scrolled", window.scrollY > 60);
    }, { passive: true });

    // Filters
    $$(".filter-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        $$(".filter-btn").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        state.activeCategory = btn.dataset.filter || "all";
        window.renderProducts();
      });
    });

    if (priceFilter && priceDisplay) {
      priceFilter.addEventListener("input", () => {
        state.maxPrice = parseInt(priceFilter.value, 10) || 0;
        priceDisplay.textContent = formatPrice(state.maxPrice);
        window.renderProducts();
      });
    }

    if (searchInput) {
      let t = null;
      searchInput.addEventListener("input", () => {
        // simple debounce to avoid re-rendering on every keystroke with large lists
        window.clearTimeout(t);
        t = window.setTimeout(() => {
          state.search = searchInput.value || "";
          window.renderProducts();
        }, 120);
      });
    }

    if (sortSelect) {
      sortSelect.addEventListener("change", () => {
        state.sort = sortSelect.value === "oldest" ? "oldest" : "recent";
        window.renderProducts();
      });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initEvents);
  } else {
    initEvents();
  }
})();
