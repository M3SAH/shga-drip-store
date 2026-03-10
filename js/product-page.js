/**
 * product-page.js
 * Renders a single product page: product.html?id=<firestoreDocId>
 */

(() => {
  const BUSINESS_WA = "2348134421763";

  const $ = (id) => document.getElementById(id);
  const $$ = (sel) => document.querySelectorAll(sel);
  const formatPrice = (price) => `\u20a6${Number(price || 0).toLocaleString("en-NG")}`;

  const DEFAULT_GRADES = [
    { name: "Standard Pro 250 GSM", price: 16000 },
    { name: "New Premium 320 GSM", price: 22000 },
    { name: "Prime 350 GSM", price: 28000 },
    { name: "Stone Wash 370 GSM", price: 30000 },
  ];

  const SLEEVE_STYLES = [
    { id: "sleeved", name: "With Sleeves" },
    { id: "sleeveless", name: "Sleeveless" },
  ];

  // Canonical size list (meets requirement: includes 3XL)
  // Also accepts legacy "XXL" values from older products.
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

  function getProductGrades(product) {
    if (!product) return [];
    if (product.category === "Caps") return [{ name: "Fixed Price", price: 10000 }];
    if (product.category === "Hoodies") return [{ name: "Fixed Price", price: 30000 }];
    if (product.type === "sleeveless") return [];
    const enabled = Array.isArray(product.grades) && product.grades.length
      ? product.grades
      : DEFAULT_GRADES.map(g => g.name);
    const gradePrices = product.gradePrices || {};
    return DEFAULT_GRADES
      .filter(g => enabled.includes(g.name))
      .map(g => ({
        name: g.name,
        price: gradePrices[g.name] ? Number(gradePrices[g.name]) : g.price,
      }));
  }

  function buildWaLink({ product, grade, sleeve, size, color }) {
    const gradeInfo = (product.category === "Caps" || product.category === "Hoodies" || product.type === "sleeveless")
      ? `Fixed Price: ${formatPrice(grade?.price || product.price || 0)}`
      : `Shirt Grade: ${grade?.name || DEFAULT_GRADES[0].name} — ${formatPrice(grade?.price || DEFAULT_GRADES[0].price)}`;

    const msg =
      `Hi SHGAdrip! I'd like to order:\n\n` +
      `Design: ${product.name}\n` +
      `${gradeInfo}\n` +
      `${sleeve ? `Sleeve Style: ${sleeve}\n` : ""}` +
      `${size ? `Size: ${size}\n` : ""}` +
      `${color ? `Color: ${color}\n` : ""}` +
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
    const price = $("productPrice");
    const desc = $("productDesc");

    if (img) {
      img.src = product.image || product.imageUrl || "";
      img.alt = product.name || "Product image";
    }
    if (name) name.textContent = product.name || "Untitled";
    if (cat) cat.textContent = product.category || "";
    if (desc) desc.textContent = product.description || "";

    const gradeSelect = $("gradeSelect");
    const sleeveSelect = $("sleeveSelect");
    const sizeSelect = $("sizeSelect");
    const colorSelect = $("colorSelect");
    const waBtn = $("waOrderBtn");

    const grades = getProductGrades(product);

    const isFixedPrice =
      product.category === "Caps" || product.category === "Hoodies";

    if (isFixedPrice) {
      const gradeWrap = gradeSelect && gradeSelect.closest(".product-select");
      const sleeveWrap =
        sleeveSelect && sleeveSelect.closest(".product-select");
      if (gradeWrap) gradeWrap.style.display = "none";
      if (sleeveWrap) sleeveWrap.style.display = "none";
    }

    // Grade selector
    if (gradeSelect) {
      if (product.type === "sleeveless") {
        gradeSelect.innerHTML = `<option value="fixed">Fixed price</option>`;
        gradeSelect.disabled = true;
      } else {
        const toShow = grades.length ? grades : DEFAULT_GRADES;
        gradeSelect.disabled = false;
        gradeSelect.innerHTML = toShow.map((g) =>
          `<option value="${encodeURIComponent(g.name)}">${g.name} — ${formatPrice(g.price)}</option>`
        ).join("");
      }
    }

    // Sleeve selector
    const showSleeves = Boolean(product.hasSleeveless) || product.type === "sleeveless";
    if (sleeveSelect) {
      sleeveSelect.disabled = !showSleeves;
      sleeveSelect.innerHTML = (showSleeves ? SLEEVE_STYLES : [SLEEVE_STYLES[0]]).map((s) =>
        `<option value="${s.id}">${s.name}</option>`
      ).join("");
      if (product.type === "sleeveless") sleeveSelect.value = "sleeveless";
    }

    // Size selector (includes 3XL)
    const savedSizes = Array.isArray(product.sizes) && product.sizes.length
      ? product.sizes.map(normalizeSize)
      : CANON_SIZES;
    const allowedSizes = CANON_SIZES.filter(s => savedSizes.includes(s));
    const sizes = allowedSizes.length ? allowedSizes : CANON_SIZES;
    if (sizeSelect) {
      sizeSelect.disabled = false;
      sizeSelect.innerHTML = sizes.map((s) => `<option value="${s}">${s}</option>`).join("");
    }

    // Color selector
    const savedColors = Array.isArray(product.colors) && product.colors.length
      ? product.colors
      : ["White", "Black"];
    if (colorSelect) {
      colorSelect.disabled = false;
      colorSelect.innerHTML = savedColors.map((c) => `<option value="${c}">${c}</option>`).join("");
    }

    function updatePriceAndLink() {
      const sleeve = sleeveSelect ? sleeveSelect.value : "sleeved";
      const sleeveName = sleeve === "sleeveless" ? "Sleeveless" : "With Sleeves";
      const sizeVal = sizeSelect ? sizeSelect.value : "";
      const colorVal = colorSelect ? colorSelect.value : "";

      let selectedGrade = null;
      if (product.type !== "sleeveless") {
        const gradeName = gradeSelect ? decodeURIComponent(gradeSelect.value || "") : "";
        selectedGrade = (grades.length ? grades : DEFAULT_GRADES).find(g => g.name === gradeName) || (grades[0] || DEFAULT_GRADES[0]);
      }

      const priceVal = product.type === "sleeveless"
        ? Number(product.price) || 0
        : Number(selectedGrade?.price || 0);

      if (price) {
        price.textContent = product.type === "sleeveless"
          ? formatPrice(priceVal)
          : `${formatPrice(priceVal)} / shirt`;
      }

      if (waBtn) {
        waBtn.href = buildWaLink({
          product,
          grade: selectedGrade,
          sleeve: showSleeves ? sleeveName : "",
          size: sizeVal,
          color: colorVal,
        });
      }
    }

    [gradeSelect, sleeveSelect, sizeSelect, colorSelect].forEach((el) => {
      if (!el) return;
      el.addEventListener("change", updatePriceAndLink);
    });

    updatePriceAndLink();

    // Show shell and clear loading state
    setStateMessage("");
    if (shell) shell.style.display = "grid";
    document.title = `${product.name || "Product"} | SHGAdrip`;
  }

  // products.js calls this when Firestore arrives/updates
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

