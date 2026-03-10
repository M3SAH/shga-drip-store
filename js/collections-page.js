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
  const PAGE_SIZE = 24;

  // -----------------------------
  // Helpers
  // -----------------------------
  const $ = (id) => document.getElementById(id);
  const $$ = (sel) => document.querySelectorAll(sel);
  const formatPrice = (price) => `\u20a6${Number(price || 0).toLocaleString("en-NG")}`;

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
    rendered: 0,
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
  const loadMoreBtn = $("loadMoreBtn");
  const countEl = $("collectionsCount");
  const sentinel = $("loadMoreSentinel");

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

  function updateCountUI(total) {
    if (!countEl) return;
    if (total === 0) {
      countEl.textContent = "No products found.";
      return;
    }
    const shown = Math.min(state.rendered, total);
    countEl.textContent = `Showing ${shown.toLocaleString("en-NG")} of ${total.toLocaleString("en-NG")} products`;
  }

  function setLoadMoreVisible(total) {
    const hasMore = state.rendered < total;
    if (loadMoreBtn) loadMoreBtn.style.display = hasMore ? "inline-flex" : "none";
    if (sentinel) sentinel.style.display = hasMore ? "block" : "none";
  }

  function clearAndPrime(list) {
    grid.innerHTML = "";
    state.currentList = list;
    state.rendered = 0;
    appendNextChunk();
  }

  function appendNextChunk() {
    const list = state.currentList || [];
    if (state.rendered >= list.length) {
      setLoadMoreVisible(list.length);
      updateCountUI(list.length);
      return;
    }

    const next = list.slice(state.rendered, state.rendered + PAGE_SIZE);
    const frag = document.createDocumentFragment();

    for (const product of next) {
      const a = document.createElement("a");
      a.className = "product-card product-card-link";
      a.href = buildProductUrl(product);
      a.setAttribute("aria-label", `View ${product.name}`);

      const outOfStock = Number(product.stock) === 0;
      const isFixedPrice =
        ["Caps", "Hoodies", "Sleeveless"].includes(product.category) ||
        product.type === "sleeveless";
      const priceLabel = isFixedPrice
        ? formatPrice(getMinPrice(product))
        : `From ${formatPrice(getMinPrice(product))}`;

      const stockBadge = outOfStock
        ? `<span class="card-out-of-stock-badge">Out of Stock</span>`
        : "";

      a.innerHTML = `
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
          <span class="card-cta">${outOfStock ? "View details" : "View Product"}</span>
        </div>
      `;

      frag.appendChild(a);
    }

    grid.appendChild(frag);
    state.rendered += next.length;
    setLoadMoreVisible(list.length);
    updateCountUI(list.length);
  }

  // Exposed callback — products.js calls this when Firestore data arrives/updates
  window.renderProducts = () => {
    const list = computeFiltered();
    clearAndPrime(list);
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

    if (loadMoreBtn) {
      loadMoreBtn.addEventListener("click", appendNextChunk);
    }

    // Infinite scroll sentinel (optional enhancement)
    if (sentinel && "IntersectionObserver" in window) {
      const io = new IntersectionObserver((entries) => {
        if (entries.some(e => e.isIntersecting)) appendNextChunk();
      }, { rootMargin: "600px 0px" });
      io.observe(sentinel);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initEvents);
  } else {
    initEvents();
  }
})();
