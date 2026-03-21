/**
 * product-page.js
 * Renders product.html?id=<firestoreDocId>
 */

import { CONFIG } from "./config.js";
import {
  parseProductPrice,
  buildStorefrontPriceHtml,
  resolveLinePrice,
  getGradePriceOptions,
  formatPrice,
  applyDiscount,
  isOthersProduct,
  buildOthersWhatsAppUrl,
  isDiscountActiveForProduct,
} from "./utils/pricing.js";

(() => {
  const BUSINESS_WA = "2348134421763";

  const $ = (id) => document.getElementById(id);
  const $$ = (sel) => document.querySelectorAll(sel);

  const buildDiscountPriceHtml = (price, opts = {}, product = null) =>
    buildStorefrontPriceHtml(price, {
      ...opts,
      discountEnabled: isDiscountActiveForProduct(product, CONFIG.discountEnabled),
    });

  const SLEEVE_STYLES = [
    { id: "sleeved", name: "With Sleeves" },
    { id: "sleeveless", name: "Sleeveless" },
  ];

  const CANON_SIZES = ["M", "L", "XL", "2XL", "3XL"];
  const normalizeSize = (s) => {
    const v = String(s || "").toUpperCase().trim();
    if (v === "XXL") return "2XL";
    if (v === "XXXL") return "3XL";
    return v;
  };

  function productIdFromUrl() {
    const sp = new URLSearchParams(window.location.search);
    return sp.get("id") || "";
  }

  function buildWaLink({ product, grade, sleeve, size, color }) {
    const basePrice = resolveLinePrice(product, grade);
    const baseNum = basePrice == null ? null : Number(basePrice);
    const promoOn = isDiscountActiveForProduct(product, CONFIG.discountEnabled);
    const discountPrice = baseNum != null ? applyDiscount(baseNum, promoOn) : null;
    const priceLabel = baseNum == null ? "Price unavailable" : formatPrice(baseNum);
    const discLabel = discountPrice != null ? formatPrice(discountPrice) : "";

    const gradeInfo = (() => {
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

    const imageUrl = product.imageUrl || product.image || "";
    const productPageUrl = `${window.location.origin}/product.html?id=${encodeURIComponent(product.id)}`;

    const msg =
      `Hi SHGAdrip! I'd like to order:\n\n` +
      `Design: ${product.name}\n` +
      `${gradeInfo}\n` +
      `${sleeve ? `Sleeve Style: ${sleeve}\n` : ""}` +
      `${size ? `Size: ${size}\n` : ""}` +
      `${color ? `Color: ${color}\n` : ""}` +
      (imageUrl ? `\n🖼 Product Image: ${imageUrl}` : "") +
      `\n🔗 Product Page: ${productPageUrl}` +
      `\nPlease confirm availability and delivery details. Thanks!`;

    return `https://wa.me/${BUSINESS_WA}?text=${encodeURIComponent(msg)}`;
  }

  function setStateMessage(html) {
    const el = $("productState");
    if (el) el.innerHTML = html;
  }

  function initNav() {
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
  }

  function renderProductPage() {
    document.querySelectorAll(".promo-banner").forEach((el) => {
      el.style.display = CONFIG.discountEnabled ? "" : "none";
    });
    const id = productIdFromUrl();
    const shell = $("productShell");

    if (!id) {
      if (shell) shell.style.display = "none";
      setStateMessage(`
        <div class="product-empty">
          <h2>Product not found</h2>
          <p>Missing product id.</p>
          <a class="btn btn-primary" href="./collections/">Go to Collections</a>
        </div>
      `);
      return;
    }

    const list = window.products || [];
    const product = list.find(p => String(p.id) === String(id));

    if (!product) {
      if (shell) shell.style.display = "none";
      setStateMessage(`
        <div class="product-empty">
          <h2>Loading product…</h2>
          <p>If this takes too long, try opening from the Collections page.</p>
        </div>
      `);
      return;
    }

    const img = $("productImg");
    const name = $("productName");
    const cat = $("productCategory");
    const priceEl = $("productPrice");
    const desc = $("productDesc");

    if (img) {
      img.src = product.image || product.imageUrl || "";
      img.alt = product.name || "Product image";
    }
    if (name) name.textContent = product.name || "Untitled";
    if (cat) cat.textContent = product.category || "";
    if (desc) desc.textContent = product.description != null ? String(product.description) : "";

    const selectorsRoot = shell?.querySelector(".product-selectors");
    const addToCartBtn = $("productAddToCart");

    if (isOthersProduct(product)) {
      const gradeSelect = $("gradeSelect");
      const sleeveSelect = $("sleeveSelect");
      const sizeSelect = $("sizeSelect");
      const colorSelect = $("colorSelect");
      const gradeWrap = gradeSelect?.closest(".product-select");
      const sleeveWrap = sleeveSelect?.closest(".product-select");
      const sizeWrap = sizeSelect?.closest(".product-select");
      const colorWrap = colorSelect?.closest(".product-select");

      const savedColors = Array.isArray(product.colors) && product.colors.length
        ? product.colors
        : [];

      if (selectorsRoot) {
        if (savedColors.length) {
          selectorsRoot.style.display = "";
          if (gradeWrap) gradeWrap.style.display = "none";
          if (sleeveWrap) sleeveWrap.style.display = "none";
          if (sizeWrap) sizeWrap.style.display = "none";
          if (colorWrap) colorWrap.style.display = "";
          if (colorSelect) {
            colorSelect.disabled = false;
            colorSelect.innerHTML = savedColors.map((c) => `<option value="${c}">${c}</option>`).join("");
          }
        } else {
          selectorsRoot.style.display = "none";
        }
      }

      if (priceEl) priceEl.innerHTML = buildDiscountPriceHtml(parseProductPrice(product), {}, product);
      const waSimple = $("waOrderBtn");
      const othersColor = savedColors.length && colorSelect ? colorSelect.value : "";
      if (waSimple) {
        waSimple.href = buildOthersWhatsAppUrl(product, othersColor || null);
        waSimple.innerHTML = `<i class="fa-brands fa-whatsapp"></i> Order via WhatsApp`;
        waSimple.style.removeProperty("pointer-events");
        waSimple.style.removeProperty("opacity");
        waSimple.setAttribute("aria-disabled", "false");
      }
      if (colorSelect && savedColors.length) {
        colorSelect.onchange = () => {
          if (waSimple) {
            waSimple.href = buildOthersWhatsAppUrl(product, colorSelect.value || null);
          }
        };
      }
      if (addToCartBtn) addToCartBtn.style.display = "none";
      setStateMessage("");
      if (shell) shell.style.display = "grid";
      document.title = `${product.name || "Product"} | SHGAdrip`;
      return;
    }

    if (selectorsRoot) selectorsRoot.style.display = "";
    if (addToCartBtn) addToCartBtn.style.display = "";

    const gradeSelect = $("gradeSelect");
    const sleeveSelect = $("sleeveSelect");
    const sizeSelect = $("sizeSelect");
    const colorSelect = $("colorSelect");
    const waBtn = $("waOrderBtn");

    const gradeWrap = gradeSelect?.closest(".product-select");
    const grades = getGradePriceOptions(product);
    const outOfStock = Number(product.stock) === 0;

    if (product.type === "sleeveless" || !grades.length) {
      if (gradeWrap) gradeWrap.style.display = "none";
    } else {
      if (gradeWrap) gradeWrap.style.display = "";
      if (gradeSelect) {
        gradeSelect.disabled = false;
        gradeSelect.innerHTML = grades.map((g) =>
          `<option value="${encodeURIComponent(g.name)}">${g.name} — ${formatPrice(g.price)}</option>`,
        ).join("");
      }
    }

    const showSleeves = Boolean(product.hasSleeveless) || product.type === "sleeveless";
    if (sleeveSelect) {
      sleeveSelect.disabled = !showSleeves;
      sleeveSelect.innerHTML = (showSleeves ? SLEEVE_STYLES : [SLEEVE_STYLES[0]]).map((s) =>
        `<option value="${s.id}">${s.name}</option>`,
      ).join("");
      if (product.type === "sleeveless") sleeveSelect.value = "sleeveless";
    }

    const sizeWrap = sizeSelect?.closest(".product-select");
    if (product.category === "Caps") {
      if (sizeWrap) sizeWrap.style.display = "none";
    } else {
      const savedSizes = Array.isArray(product.sizes) && product.sizes.length
        ? product.sizes.map(normalizeSize)
        : [];
      const allowed = CANON_SIZES.filter(s => savedSizes.includes(s));
      if (!allowed.length) {
        if (sizeWrap) sizeWrap.style.display = "none";
      } else {
        if (sizeWrap) sizeWrap.style.display = "";
        if (sizeSelect) {
          sizeSelect.disabled = false;
          sizeSelect.innerHTML = allowed.map((s) => `<option value="${s}">${s}</option>`).join("");
        }
      }
    }

    const colorWrap = colorSelect?.closest(".product-select");
    const savedColors = Array.isArray(product.colors) && product.colors.length
      ? product.colors
      : [];
    if (!savedColors.length) {
      if (colorWrap) colorWrap.style.display = "none";
    } else {
      if (colorWrap) colorWrap.style.display = "";
      if (colorSelect) {
        colorSelect.disabled = false;
        colorSelect.innerHTML = savedColors.map((c) => `<option value="${c}">${c}</option>`).join("");
      }
    }

    function selectedGradeFromUi() {
      if (!grades.length || product.type === "sleeveless") return null;
      const gradeName = gradeSelect ? decodeURIComponent(gradeSelect.value || "") : "";
      return grades.find(g => g.name === gradeName) || grades[0] || null;
    }

    function updatePriceAndLink() {
      const sleeve = sleeveSelect ? sleeveSelect.value : "sleeved";
      const sleeveName = sleeve === "sleeveless" ? "Sleeveless" : "With Sleeves";
      const caps = product.category === "Caps";
      const sizeHidden = caps || (sizeSelect?.closest(".product-select")?.style.display === "none");
      const sizeVal = sizeHidden ? "" : (sizeSelect ? sizeSelect.value : "");
      const colorHidden = colorSelect?.closest(".product-select")?.style.display === "none";
      const colorVal = colorHidden ? "" : (colorSelect ? colorSelect.value : "");

      const selectedGrade = selectedGradeFromUi();
      const priceVal = resolveLinePrice(product, selectedGrade);

      if (priceEl) {
        const suffix = product.type === "sleeveless" ? "" : " / shirt";
        let html = buildDiscountPriceHtml(priceVal, { suffix }, product);
        if (outOfStock) {
          html += `<br><span class="price-unavailable" style="display:inline-block;margin-top:0.35rem">Out of stock</span>`;
        }
        priceEl.innerHTML = html;
      }

      const lineOk = priceVal != null && !outOfStock;
      if (waBtn) {
        waBtn.href = lineOk ? buildWaLink({
          product,
          grade: selectedGrade,
          sleeve: caps ? "" : (showSleeves ? sleeveName : ""),
          size: sizeVal,
          color: colorVal,
        }) : "#";
        waBtn.setAttribute("aria-disabled", lineOk ? "false" : "true");
        waBtn.style.pointerEvents = lineOk ? "" : "none";
        waBtn.style.opacity = lineOk ? "" : "0.5";
      }

      if (addToCartBtn) {
        addToCartBtn.disabled = !lineOk;
        addToCartBtn.style.opacity = lineOk ? "" : "0.5";
        addToCartBtn.onclick = lineOk && window.SHGACart
          ? () => {
              window.SHGACart.add({
                productId: product.id,
                design: product.name,
                imageUrl: product.imageUrl || product.image || "",
                productPageUrl: `${window.location.origin}/product.html?id=${encodeURIComponent(product.id)}`,
                shirtGrade: selectedGrade ? selectedGrade.name : null,
                price: priceVal,
                category: product.category || null,
                size: sizeVal || null,
                sleeveStyle: caps ? null : sleeveName,
                color: colorVal || null,
              });
            }
          : null;
      }
    }

    const onCh = () => updatePriceAndLink();
    if (gradeSelect) gradeSelect.onchange = onCh;
    if (sleeveSelect) sleeveSelect.onchange = onCh;
    if (sizeSelect) sizeSelect.onchange = onCh;
    if (colorSelect) colorSelect.onchange = onCh;

    updatePriceAndLink();

    setStateMessage("");
    if (shell) shell.style.display = "grid";
    document.title = `${product.name || "Product"} | SHGAdrip`;
  }

  window.renderProducts = renderProductPage;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      initNav();
      renderProductPage();
    });
  } else {
    initNav();
    renderProductPage();
  }
})();
