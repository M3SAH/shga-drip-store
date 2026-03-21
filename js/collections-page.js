/**
 * collections-page.js
 * Renderer for /collections — pagination, filters, shared pricing helpers.
 */

import { CONFIG } from "./config.js";
import {
  parseProductPrice,
  buildStorefrontPriceHtml,
  resolveLinePrice,
  getGradePriceOptions,
  formatPrice,
  isOthersProduct,
  buildOthersWhatsAppUrl,
  isDiscountActiveForProduct,
} from "./utils/pricing.js";

const PAGE_SIZE = 20;
const KNOWN_CATEGORIES = ["T-Shirts", "Hoodies", "Caps", "Sleeveless"];

const $ = (id) => document.getElementById(id);
const $$ = (sel) => document.querySelectorAll(sel);

const buildDiscountPriceHtml = (price, opts = {}, product = null) =>
  buildStorefrontPriceHtml(price, {
    ...opts,
    discountEnabled: isDiscountActiveForProduct(product, CONFIG.discountEnabled),
  });

function normalizeText(s) {
  return String(s || "").toLowerCase().trim();
}

function buildProductUrl(product) {
  return `../product.html?id=${encodeURIComponent(product.id)}`;
}

function pricePassesMaxFilter(product, maxPrice) {
  const n = parseProductPrice(product);
  if (n === null) return true;
  return n <= maxPrice;
}

const state = {
  activeCategory: "all",
  maxPrice: 50000,
  search: "",
  sort: "recent",
  currentPage: 1,
  currentList: [],
};

const grid = $("productGrid");
const priceFilter = $("priceFilter");
const priceDisplay = $("priceDisplay");
const searchInput = $("collectionsSearch");
const sortSelect = $("collectionsSort");
const countEl = $("collectionsCount");
const paginationContainer = $("paginationContainer");


function computeFiltered() {
  const source = window.products || [];
  const q = normalizeText(state.search);

  const filtered = source.filter((p) => {
    const rawCat = String(p?.category || "");
    const normalizedCat = rawCat === "Unisex" ? "T-Shirts" : (KNOWN_CATEGORIES.includes(rawCat) ? rawCat : "Others");
    if (p && p.category !== normalizedCat) p.category = normalizedCat;

    const catMatch = state.activeCategory === "all" || normalizedCat === state.activeCategory;
    const priceMatch = pricePassesMaxFilter(p, state.maxPrice);
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

    const others = isOthersProduct(product);
    const outOfStock = !others && Number(product.stock) === 0;
    const listPrice = parseProductPrice(product);
    const priceLabel = buildDiscountPriceHtml(listPrice, {}, product);
    const othersColorsLine =
      others &&
      Array.isArray(product.colors) &&
      product.colors.length
        ? product.colors
            .map((c) =>
              String(c || "")
                .replace(/&/g, "&amp;")
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;"),
            )
            .join(" · ")
        : "";

    const stockBadge = outOfStock
      ? `<span class="card-out-of-stock-badge">Out of Stock</span>`
      : "";

    const href = buildProductUrl(product);
    const canQuickAdd = !others && !outOfStock && listPrice != null;
    const othersWa = others ? buildOthersWhatsAppUrl(product) : null;

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
            ${
              othersColorsLine
                ? `<p class="card-others-colors">${othersColorsLine}</p>`
                : ""
            }
            <p class="card-price">${priceLabel}</p>
          </div>
        </a>
        ${
          others
            ? `<a
                class="card-others-wa-btn"
                href="${othersWa}"
                target="_blank"
                rel="noopener"
                aria-label="Order ${product.name} via WhatsApp"
                title="Order via WhatsApp"
              >
                <i class="fa-brands fa-whatsapp"></i>
              </a>`
            : canQuickAdd
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

if (grid) {
  document.querySelectorAll(".promo-banner").forEach((el) => {
    el.style.display = CONFIG.discountEnabled ? "" : "none";
  });

  window.renderProducts = () => {
    const list = computeFiltered();
    state.currentList = list;
    state.currentPage = 1;
    renderPage(1);
    renderPagination(list.length);
  };

  grid.addEventListener("click", (e) => {
    if (e.target.closest("a.card-others-wa-btn")) return;
    const btn = e.target.closest(".card-add-to-cart-btn");
    if (!btn || !window.SHGACart) return;
    e.preventDefault();

    const productId = btn.dataset.productId;
    const source = window.products || [];
    const product = source.find((p) => String(p.id) === String(productId));
    if (!product) return;
    if (Number(product.stock) === 0) return;

    const listPrice = parseProductPrice(product);
    if (listPrice == null) return;

    const grades = getGradePriceOptions(product);
    const grade = grades[0] || null;
    const price = resolveLinePrice(product, grade);
    if (price == null) return;

    const isCap = product.category === "Caps";
    const isSleeveless = product.type === "sleeveless" || product.category === "Sleeveless";

    const defaultSize =
      !isCap && Array.isArray(product.sizes) && product.sizes.length
        ? product.sizes[0]
        : null;
    const defaultColor =
      Array.isArray(product.colors) && product.colors.length ? product.colors[0] : null;

    const baseUrl = window.location.origin;
    const productPageUrl = `${baseUrl}/product.html?id=${encodeURIComponent(product.id)}`;

    window.SHGACart.add({
      productId: product.id,
      design: product.name,
      imageUrl: product.imageUrl || product.image || "",
      productPageUrl,
      shirtGrade: grade ? grade.name : null,
      price,
      category: product.category || null,
      size: defaultSize,
      sleeveStyle: isSleeveless ? "Sleeveless" : (isCap ? null : "With Sleeves"),
      color: defaultColor,
    });

    if (typeof window.syncCartFromCollections === "function") {
      window.syncCartFromCollections();
    }

    btn.innerHTML = `<i class="fa-solid fa-check"></i>`;
    btn.classList.add("added");
    setTimeout(() => {
      btn.innerHTML = `<i class="fa-solid fa-cart-plus"></i>`;
      btn.classList.remove("added");
    }, 1400);
  });
} else {
  window.renderProducts = () => {};
}

function initEvents() {
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
