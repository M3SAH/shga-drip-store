/**
 * admin.js  — SHGAdrip Admin Dashboard
 * ─────────────────────────────────────────────────────────────────
 * CLOUDINARY INTEGRATION:
 *  - Cloud name:    dwfporhit
 *  - Upload preset: product_uploads  (unsigned — no API secret used)
 *  - Folder:        products
 *
 *  Two widgets are created: one for Add Product, one for Edit Product.
 *  On successful upload the widget callback:
 *    1. Captures result.info.secure_url
 *    2. Stores it in the hidden URL input (a-image-url / e-image-url)
 *    3. Shows a live preview below the upload button
 *  When saving to Firestore both `imageUrl` and `image` fields are
 *  written so products.js (reads imageUrl) and script.js (reads
 *  image || imageUrl) always display the correct photo.
 *
 * AUTH GUARD:
 *  onAuthStateChanged fires before any DOM interaction. Unauthenticated
 *  visitors are redirected to admin-login.html immediately.
 * ─────────────────────────────────────────────────────────────────
 */

// ── Import shared Firebase services (no re-initialisation) ──────
import { auth, db }
  from "../firebase-config.js";          // ← single source of truth

import {
  onAuthStateChanged,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  collection, addDoc, doc,
  updateDoc, deleteDoc, query, orderBy,
  serverTimestamp, onSnapshot, limit
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// Import reviews functionality
import { initAdminReviews, saveAdminReview } from "../js/reviews.js";

// NOTE: Firebase Storage is intentionally NOT used here.
// Product images are hosted on Cloudinary and referenced by HTTPS URLs
// stored in Firestore. Admins paste the Cloudinary URL directly.

/* ══════════════════════════════════════════════
   STATE
══════════════════════════════════════════════ */
const state = {
  products:   [],
  filtered:   [],
  page:       1,
  perPage:    10,
  search:     "",
  catFilter:  "",
  editId:     null,
  editImgUrl: null,
  deleteId:   null,
  deleteImg:  null,
};

// Cloudinary widget configuration
const CLOUDINARY_CONFIG = {
  cloudName:    "dwfporhit",        // Cloud name from Cloudinary dashboard
  uploadPreset: "product_uploads",  // Unsigned upload preset — no API secret needed
};

/* ══════════════════════════════════════════════
   AUTH GUARD  — everything starts here
══════════════════════════════════════════════ */
onAuthStateChanged(auth, user => {
  if (!user) {
    window.location.href = "admin-login.html";
    return;
  }
  // DOM is guaranteed ready by the time the auth callback fires
  document.getElementById("adminEmail").textContent = user.email;
  initAdminUI();          // attach all event listeners
  initRealtimeListener(); // start Firestore subscription
});

function requireAuth() {
  const user = auth.currentUser;
  if (!user) {
    toast("You must be signed in to perform this action.", "error");
    setTimeout(() => { window.location.href = "admin-login.html"; }, 1500);
    return false;
  }
  return true;
}

/* ══════════════════════════════════════════════
   DOM SETUP  — called only after auth confirmed
══════════════════════════════════════════════ */
function initAdminUI() {

  /* ── Logout ── */
  document.getElementById("logoutBtn").addEventListener("click", async () => {
    await signOut(auth);
    window.location.href = "admin-login.html";
  });

  /* ── Navigation ── */
  document.querySelectorAll(".nav-item[data-view]").forEach(el =>
    el.addEventListener("click", e => { e.preventDefault(); switchView(el.dataset.view); })
  );
  document.querySelectorAll("[data-goto]").forEach(el =>
    el.addEventListener("click", () => switchView(el.dataset.goto))
  );

  /* ── Mobile sidebar ── */
  const sidebar        = document.getElementById("sidebar");
  const sidebarOverlay = document.getElementById("sidebarOverlay");

  document.getElementById("hamburger").addEventListener("click", () => {
    sidebar.classList.add("open");
    sidebarOverlay.classList.add("active");
  });
  sidebarOverlay.addEventListener("click", closeSidebar);

  /* ── Search + filter ── */
  document.getElementById("searchInput").addEventListener("input", e => {
    state.search = e.target.value.toLowerCase().trim();
    state.page   = 1;
    applyFilter();
  });
  document.getElementById("catFilter").addEventListener("change", e => {
    state.catFilter = e.target.value;
    state.page      = 1;
    applyFilter();
  });

  /* ── Add product form ── */
  initChips("a-grades");
  initChips("a-sizes");
  initChips("a-colors");
  initImageUrlPreview("a-image-url", "a-preview", "a-preview-wrap");
  initGradePriceInputs("a-grades", "a-grade-prices");
  initSleevelessChip("a-sleeveless");
  initFeaturedChip("a-featured");
  initAddFormCategoryToggle();
  document.getElementById("addBtn").addEventListener("click",   handleAdd);
  document.getElementById("resetBtn").addEventListener("click", resetAddForm);

  /* ── Edit modal ── */
  initChips("e-grades");
  initChips("e-sizes");
  initChips("e-colors");
  initImageUrlPreview("e-image-url", "e-preview", "e-preview-wrap");
  initGradePriceInputs("e-grades", "e-grade-prices");
  initSleevelessChip("e-sleeveless");
  initFeaturedChip("e-featured");
  initEditFormCategoryToggle();

  const editOverlay = document.getElementById("editOverlay");
  document.getElementById("editClose").addEventListener("click",  closeEditModal);
  document.getElementById("editCancel").addEventListener("click", closeEditModal);
  editOverlay.addEventListener("click", e => { if (e.target === editOverlay) closeEditModal(); });
  document.getElementById("editSave").addEventListener("click",   handleSaveEdit);

  /* ── Cloudinary upload widgets ── */
  initCloudinaryUploadWidgets();

  /* ── Reviews upload widget ── */
  initReviewsUpload();
  initAdminReviews();

  /* ── Delete confirm ── */
  const delOverlay = document.getElementById("delOverlay");
  document.getElementById("delCancel").addEventListener("click",  closeDeleteConfirm);
  delOverlay.addEventListener("click", e => { if (e.target === delOverlay) closeDeleteConfirm(); });
  document.getElementById("delConfirm").addEventListener("click", handleDeleteConfirm);

  /* ── Keyboard shortcuts ── */
  document.addEventListener("keydown", e => {
    if (e.key === "Escape") {
      closeEditModal();
      closeDeleteConfirm();
    }
  });
}

/* ══════════════════════════════════════════════
   NAVIGATION
══════════════════════════════════════════════ */
const VIEWS = {
  dashboard: { title: "Dashboard",       crumb: "Overview" },
  add:       { title: "Add Product",     crumb: "Create a new product" },
  manage:    { title: "Manage Stock",    crumb: "Edit or delete products" },
  reviews:   { title: "Reviews",         crumb: "Upload review screenshots" },
};

function switchView(key) {
  if (!VIEWS[key]) return;
  Object.keys(VIEWS).forEach(k => {
    document.getElementById(`view-${k}`).classList.toggle("active", k === key);
    document.querySelectorAll(`.nav-item[data-view="${k}"]`).forEach(el =>
      el.classList.toggle("active", k === key)
    );
  });
  document.getElementById("topTitle").textContent = VIEWS[key].title;
  document.getElementById("topCrumb").textContent = VIEWS[key].crumb;
  closeSidebar();
}

function closeSidebar() {
  document.getElementById("sidebar").classList.remove("open");
  document.getElementById("sidebarOverlay").classList.remove("active");
}

/* ══════════════════════════════════════════════
   REALTIME FIRESTORE LISTENER
══════════════════════════════════════════════ */
function initRealtimeListener() {
  const q = query(collection(db, "products"), orderBy("createdAt", "desc"), limit(1000));

  onSnapshot(q, snapshot => {
    state.products = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    applyFilter();         // updates manage table
    renderStats();         // updates dashboard cards
    renderRecentTable();   // updates dashboard recent list
  }, err => {
    console.error("Firestore error:", err);
    toast("Could not load products. Check Firestore rules and connection.", "error");
  });
}

/* ══════════════════════════════════════════════
   STATS CARDS
══════════════════════════════════════════════ */
function renderStats() {
  const p       = state.products;
  const total   = p.length;
  const inStock = p.filter(x => (x.stock || 0) > 5).length;
  const low     = p.filter(x => (x.stock || 0) > 0 && (x.stock || 0) <= 5).length;
  const out     = p.filter(x => (x.stock || 0) === 0).length;

  const cards = [
    { cls: "gold",   icon: "fa-boxes-stacked",        val: total,   lbl: "Total Products" },
    { cls: "green",  icon: "fa-circle-check",          val: inStock, lbl: "In Stock" },
    { cls: "orange", icon: "fa-triangle-exclamation",  val: low,     lbl: "Low Stock (≤5)" },
    { cls: "red",    icon: "fa-circle-xmark",          val: out,     lbl: "Out of Stock" },
  ];

  document.getElementById("statsRow").innerHTML = cards.map(c => `
    <div class="stat-card ${c.cls}">
      <div class="stat-icon"><i class="fa-solid ${c.icon}"></i></div>
      <div class="stat-val">${c.val}</div>
      <div class="stat-lbl">${c.lbl}</div>
    </div>`).join("");
}

/* ══════════════════════════════════════════════
   SEARCH + FILTER
══════════════════════════════════════════════ */
function applyFilter() {
  state.filtered = state.products.filter(p => {
    const matchSearch = !state.search ||
      (p.name     || "").toLowerCase().includes(state.search) ||
      (p.category || "").toLowerCase().includes(state.search);
    const matchCat = !state.catFilter || p.category === state.catFilter;
    return matchSearch && matchCat;
  });
  renderManageTable();
}

/* ══════════════════════════════════════════════
   RECENT TABLE (Dashboard)
══════════════════════════════════════════════ */
function renderRecentTable() {
  const el     = document.getElementById("recentWrap");
  const recent = state.products.slice(0, 5);

  if (recent.length === 0) {
    el.innerHTML = emptyState("fa-boxes-stacked", "No products yet", "Add your first product to see it here.");
    return;
  }

  el.innerHTML = `<div class="table-scroll">${buildTable(recent)}</div>`;
  attachTableActions(el);
}

/* ══════════════════════════════════════════════
   MANAGE TABLE + PAGINATION
══════════════════════════════════════════════ */
function renderManageTable() {
  const countEl = document.getElementById("prodCount");
  const tableEl = document.getElementById("tableBody");
  const pageEl  = document.getElementById("pagination");
  const total   = state.filtered.length;

  countEl.textContent = `${total} product${total !== 1 ? "s" : ""}`;

  if (total === 0) {
    tableEl.innerHTML = emptyState(
      "fa-magnifying-glass",
      state.search || state.catFilter ? "No results found" : "No products yet",
      state.search || state.catFilter ? "Try a different search or filter." : "Add your first product above."
    );
    pageEl.style.display = "none";
    return;
  }

  const totalPages = Math.ceil(total / state.perPage);
  state.page       = Math.min(state.page, totalPages);
  const start      = (state.page - 1) * state.perPage;
  const pageItems  = state.filtered.slice(start, start + state.perPage);

  tableEl.innerHTML = `<div class="table-scroll">${buildTable(pageItems)}</div>`;
  attachTableActions(tableEl);

  if (totalPages <= 1) { pageEl.style.display = "none"; return; }

  pageEl.style.display = "flex";
  const from = start + 1;
  const to   = Math.min(start + state.perPage, total);

  let pageNums = "";
  for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i === totalPages || Math.abs(i - state.page) <= 1) {
      pageNums += `<button class="page-btn${i === state.page ? " active" : ""}" data-p="${i}">${i}</button>`;
    } else if (Math.abs(i - state.page) === 2) {
      pageNums += `<span style="color:var(--dim);padding:0 .2rem">…</span>`;
    }
  }

  pageEl.innerHTML = `
    <span class="page-info">Showing ${from}–${to} of ${total}</span>
    <div class="page-btns">
      <button class="page-btn" data-p="${state.page - 1}" ${state.page === 1 ? "disabled" : ""}>
        <i class="fa-solid fa-chevron-left"></i>
      </button>
      ${pageNums}
      <button class="page-btn" data-p="${state.page + 1}" ${state.page === totalPages ? "disabled" : ""}>
        <i class="fa-solid fa-chevron-right"></i>
      </button>
    </div>`;

  pageEl.querySelectorAll(".page-btn[data-p]").forEach(btn => {
    btn.addEventListener("click", () => {
      const p = parseInt(btn.dataset.p);
      if (!isNaN(p) && p >= 1 && p <= totalPages) {
        state.page = p;
        renderManageTable();
      }
    });
  });
}

/* ══════════════════════════════════════════════
   TABLE HTML BUILDER
══════════════════════════════════════════════ */
function buildTable(items) {
  const rows = items.map(p => {
    const imgSrc = p.imageUrl || p.image || "";
    const thumb = imgSrc
      ? `<img class="thumb" src="${esc(imgSrc)}" alt="${esc(p.name)}" loading="lazy"/>`
      : `<div class="thumb-placeholder"><i class="fa-solid fa-shirt"></i></div>`;

    const price  = p.price ? `₦${Number(p.price).toLocaleString("en-NG")}` : "—";
    const badge  = stockBadge(p.stock);
    const featuredTag = (p.isFeatured || p.featured)
      ? `<span class="tag">Featured</span>`
      : "";

    return `<tr>
      <td>${thumb}</td>
      <td>
        <div class="prod-name">${esc(p.name || "—")}</div>
        <div class="prod-cat">${esc(p.category || "")}</div>
        <div class="tag-wrap" style="margin-top:0.3rem">${featuredTag}</div>
      </td>
      <td><span class="price-cell">${price}</span></td>
      <td>${badge}</td>
      <td>
        <div class="action-cell">
          <button class="btn btn-ghost btn-sm edit-btn" data-id="${p.id}">
            <i class="fa-solid fa-pen"></i> Edit
          </button>
          <button class="btn btn-danger-outline btn-sm del-btn"
            data-id="${p.id}"
            data-name="${esc(p.name)}"
            data-img="${esc(p.imageUrl || p.image || '')}">
            <i class="fa-solid fa-trash"></i>
          </button>
        </div>
      </td>
    </tr>`;
  }).join("");

  return `<table>
    <thead><tr>
      <th>Image</th><th>Product</th><th>Price</th>
      <th>Stock</th><th>Actions</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

function stockBadge(stock) {
  const n = Number(stock) || 0;
  if (n === 0) return `<span class="badge out-stock"><i class="fa-solid fa-circle-xmark"></i> Out of Stock</span>`;
  if (n <= 5)  return `<span class="badge low-stock"><i class="fa-solid fa-triangle-exclamation"></i> Low (${n})</span>`;
  return             `<span class="badge in-stock"><i class="fa-solid fa-circle-check"></i> In Stock (${n})</span>`;
}

function attachTableActions(container) {
  container.querySelectorAll(".edit-btn").forEach(btn =>
    btn.addEventListener("click", () => openEditModal(btn.dataset.id))
  );
  container.querySelectorAll(".del-btn").forEach(btn =>
    btn.addEventListener("click", () => openDeleteConfirm(btn.dataset.id, btn.dataset.name, btn.dataset.img))
  );
}

function emptyState(icon, title, sub) {
  return `<div class="empty-state">
    <div class="empty-icon"><i class="fa-solid ${icon}"></i></div>
    <div class="empty-title">${title}</div>
    <div class="empty-sub">${sub}</div>
  </div>`;
}

/* ══════════════════════════════════════════════
   ADD PRODUCT
══════════════════════════════════════════════ */
async function handleAdd() {
  if (!requireAuth()) return;

  const name  = val("a-name");
  const desc  = val("a-desc");
  const cat   = val("a-cat");
  const stock = parseInt(val("a-stock"))   || 0;
  let grades   = getChecked("a-grades");
  const sizes    = getChecked("a-sizes");
  const colors   = getChecked("a-colors");
  const imageUrl = val("a-image-url").trim();
  const hasSleeveless = document.getElementById("a-sleeveless")?.checked || false;
  const isFeatured = document.getElementById("a-featured")?.checked || false;

  const isFixedPriceCat = FIXED_PRICE_CATS.includes(cat);

  if (!name)           return toast("Product name is required.", "error");
  if (!cat)            return toast("Please select a category.", "error");
  if (!sizes.length)   return toast("Please select at least one size.", "error");
  if (!colors.length)  return toast("Please select at least one color.", "error");
  if (!imageUrl)       return toast("Please upload a product image using the Upload Image button.", "error");
  if (!isCloudinaryUrl(imageUrl)) {
    return toast("Image URL must be a valid Cloudinary URL (https://res.cloudinary.com/…)", "error");
  }

  let gradePrices = {};
  let minPrice = 0;

  if (isFixedPriceCat) {
    const fixedPrice = parseFloat(val("a-fixed-price")) || 0;
    if (fixedPrice <= 0) return toast("Please enter a price for Caps/Hoodies.", "error");
    grades = ["Fixed Price"];
    gradePrices = { "Fixed Price": fixedPrice };
    minPrice = fixedPrice;
  } else {
    gradePrices = getGradePrices("a-grade-prices", grades);
    if (!grades.length)  return toast("Please select at least one grade.", "error");
    for (const grade of grades) {
      if (!gradePrices[grade] || gradePrices[grade] <= 0) {
        return toast(`Please enter a price for the "${grade}" grade.`, "error");
      }
    }
    minPrice = Math.min(...grades.map(g => gradePrices[g] || 0));
  }

  const btn = document.getElementById("addBtn");
  setBtnLoading(btn, true);

  try {
    await addDoc(collection(db, "products"), {
      name,
      description: desc,
      category:    cat,
      grades,
      grade:       grades[0],
      gradePrices,          // e.g. { Standard: 16000, Premium: 22000 }
      price:       minPrice, // lowest — used for card display & filtering
      stock,
      sizes,
      colors,
      hasSleeveless,
      isFeatured,
      imageUrl,
      image: imageUrl,
      createdAt: serverTimestamp()
    });

    toast(`"${name}" added successfully!`, "success");
    resetAddForm();
    switchView("manage");

  } catch (err) {
    console.error(err);
    toast(`Failed to add product: ${err.message}`, "error");
  } finally {
    setBtnLoading(btn, false, '<i class="fa-solid fa-plus"></i> Add Product');
  }
}

function resetAddForm() {
  ["a-name","a-desc","a-stock","a-fixed-price"].forEach(id => set(id, ""));
  set("a-cat", "");
  set("a-image-url", "");
  togglePricingUI("add");

  // Grades — default New Premium 320 GSM only
  document.querySelectorAll("#a-grades .chip input[type=checkbox]").forEach(cb => {
    cb.checked = cb.value === "New Premium 320 GSM";
    cb.closest(".chip").classList.toggle("checked", cb.checked);
  });
  syncAllChip("a-grades");
  renderGradePriceInputs("a-grades", "a-grade-prices", {});

  // Sizes — default M, L, XL, 2XL
  document.querySelectorAll("#a-sizes .chip input[type=checkbox]").forEach(cb => {
    cb.checked = ["M","L","XL","2XL"].includes(cb.value);
    cb.closest(".chip").classList.toggle("checked", cb.checked);
  });
  syncAllChip("a-sizes");

  // Colors — default White, Black
  document.querySelectorAll("#a-colors .chip input[type=checkbox]").forEach(cb => {
    cb.checked = ["White","Black"].includes(cb.value);
    cb.closest(".chip").classList.toggle("checked", cb.checked);
  });
  syncAllChip("a-colors");

  // Sleeveless — default off
  const slv = document.getElementById("a-sleeveless");
  if (slv) { slv.checked = false; slv.closest(".chip").classList.remove("checked"); }

  // Featured — default off
  const feat = document.getElementById("a-featured");
  if (feat) { feat.checked = false; feat.closest(".chip").classList.remove("checked"); }

  updateImageUrlPreview("a-image-url", "a-preview", "a-preview-wrap");
}

/* ══════════════════════════════════════════════
   EDIT MODAL
══════════════════════════════════════════════ */
function openEditModal(docId) {
  const p = state.products.find(x => x.id === docId);
  if (!p) return;

  state.editId     = docId;
  state.editImgUrl = p.imageUrl || p.image || null;

  set("e-name",  p.name        || "");
  set("e-desc",  p.description || "");
  set("e-price", p.price       || "");
  set("e-stock", p.stock       || "");
  set("e-cat",   p.category    || "Unisex");
  set("e-image-url", p.imageUrl || p.image || "");
  set("e-fixed-price", p.price || "");

  const isFixedPriceCat = FIXED_PRICE_CATS.includes(p.category || "");
  if (!isFixedPriceCat) {
    const savedGrades = Array.isArray(p.grades) && p.grades.length
      ? p.grades
      : (p.grade ? [p.grade] : ["New Premium 320 GSM"]);
    document.querySelectorAll("#e-grades .chip input[type=checkbox]").forEach(cb => {
      cb.checked = savedGrades.includes(cb.value);
      cb.closest(".chip").classList.toggle("checked", cb.checked);
    });
    syncAllChip("e-grades");
    renderGradePriceInputs("e-grades", "e-grade-prices", p.gradePrices || {});
  }
  togglePricingUI("edit");

  const normalizedSizes = (p.sizes || []).map(s => {
    const v = String(s || "").toUpperCase().trim();
    if (v === "XXL") return "2XL";
    if (v === "XXXL") return "3XL";
    return v;
  });
  document.querySelectorAll("#e-sizes .chip input[type=checkbox]").forEach(cb => {
    cb.checked = normalizedSizes.includes(String(cb.value || "").toUpperCase().trim());
    cb.closest(".chip").classList.toggle("checked", cb.checked);
  });
  syncAllChip("e-sizes");

  document.querySelectorAll("#e-colors .chip input[type=checkbox]").forEach(cb => {
    cb.checked = (p.colors || []).includes(cb.value);
    cb.closest(".chip").classList.toggle("checked", cb.checked);
  });
  syncAllChip("e-colors");

  // Sleeveless
  const eSlv = document.getElementById("e-sleeveless");
  if (eSlv) {
    eSlv.checked = p.hasSleeveless || false;
    eSlv.closest(".chip").classList.toggle("checked", eSlv.checked);
  }

  // Featured
  const eFeat = document.getElementById("e-featured");
  if (eFeat) {
    eFeat.checked = p.isFeatured || false;
    eFeat.closest(".chip").classList.toggle("checked", eFeat.checked);
  }

  updateImageUrlPreview("e-image-url", "e-preview", "e-preview-wrap");

  document.getElementById("editOverlay").classList.add("open");
  document.body.style.overflow = "hidden";
}

function closeEditModal() {
  state.editId = null;
  document.getElementById("editOverlay").classList.remove("open");
  document.body.style.overflow = "";
}

async function handleSaveEdit() {
  if (!requireAuth()) return;
  if (!state.editId) return;

  const name  = val("e-name");
  const desc  = val("e-desc");
  const cat   = val("e-cat");
  const stock = parseInt(val("e-stock"))   || 0;
  let grades   = getChecked("e-grades");
  const sizes    = getChecked("e-sizes");
  const colors   = getChecked("e-colors");
  const newUrl   = val("e-image-url").trim();
  const hasSleeveless = document.getElementById("e-sleeveless")?.checked || false;
  const isFeatured = document.getElementById("e-featured")?.checked || false;

  const isFixedPriceCat = FIXED_PRICE_CATS.includes(cat);
  let gradePrices = {};
  let minPrice = 0;

  if (isFixedPriceCat) {
    const fixedPrice = parseFloat(val("e-fixed-price")) || 0;
    if (fixedPrice <= 0) return toast("Please enter a price for Caps/Hoodies.", "error");
    grades = ["Fixed Price"];
    gradePrices = { "Fixed Price": fixedPrice };
    minPrice = fixedPrice;
  } else {
    gradePrices = getGradePrices("e-grade-prices", grades);
    if (!grades.length) return toast("Please select at least one grade.", "error");
    for (const grade of grades) {
      if (!gradePrices[grade] || gradePrices[grade] <= 0) {
        return toast(`Please enter a price for the "${grade}" grade.`, "error");
      }
    }
    minPrice = Math.min(...grades.map(g => gradePrices[g] || 0));
  }

  if (!name)          return toast("Product name is required.", "error");
  if (!sizes.length)  return toast("Please select at least one size.", "error");
  if (!colors.length) return toast("Please select at least one color.", "error");
  if (newUrl && !isCloudinaryUrl(newUrl)) {
    return toast("Image URL must be a valid Cloudinary URL (https://res.cloudinary.com/…)", "error");
  }

  const btn = document.getElementById("editSave");
  setBtnLoading(btn, true);

  try {
    const updates = {
      name,
      description: desc,
      category: cat,
      grades,
      grade: grades[0],
      gradePrices,
      price: minPrice,
      stock,
      sizes,
      colors,
      hasSleeveless,
      isFeatured
    };

    if (newUrl) {
      updates.imageUrl = newUrl;
      updates.image    = newUrl;
    }

    await updateDoc(doc(db, "products", state.editId), updates);
    toast("Product updated successfully!", "success");
    closeEditModal();

  } catch (err) {
    console.error(err);
    toast(`Failed to save changes: ${err.message}`, "error");
  } finally {
    setBtnLoading(btn, false, '<i class="fa-solid fa-floppy-disk"></i> Save Changes');
  }
}

/* ══════════════════════════════════════════════
   DELETE CONFIRM
══════════════════════════════════════════════ */
function openDeleteConfirm(docId, name, imgUrl) {
  state.deleteId  = docId;
  state.deleteImg = imgUrl || null;
  document.getElementById("delBody").textContent =
    `"${name}" will be permanently removed from your store. This cannot be undone.`;
  document.getElementById("delOverlay").classList.add("open");
  document.body.style.overflow = "hidden";
}

function closeDeleteConfirm() {
  state.deleteId  = null;
  state.deleteImg = null;
  document.getElementById("delOverlay").classList.remove("open");
  document.body.style.overflow = "";
  setBtnLoading(document.getElementById("delConfirm"), false, '<i class="fa-solid fa-trash"></i> Delete');
}

async function handleDeleteConfirm() {
  if (!requireAuth()) return;
  if (!state.deleteId) return;

  const btn = document.getElementById("delConfirm");
  setBtnLoading(btn, true);

  try {
    await deleteDoc(doc(db, "products", state.deleteId));
    toast("Product deleted.", "success");
    closeDeleteConfirm();

  } catch (err) {
    console.error(err);
    toast(`Delete failed: ${err.message}`, "error");
    setBtnLoading(btn, false, '<i class="fa-solid fa-trash"></i> Delete');
  }
}

/* ══════════════════════════════════════════════
   IMAGE URL HELPERS (Cloudinary)
══════════════════════════════════════════════ */
function isCloudinaryUrl(url) {
  if (!url) return false;
  try {
    const u = new URL(url);
    return u.protocol === "https:" && u.hostname.includes("res.cloudinary.com");
  } catch {
    return false;
  }
}

function initImageUrlPreview(inputId, previewId, wrapId) {
  const input   = document.getElementById(inputId);
  const preview = document.getElementById(previewId);
  const wrap    = document.getElementById(wrapId);
  if (!input || !preview || !wrap) return;

  const sync = () => updateImageUrlPreview(inputId, previewId, wrapId);
  input.addEventListener("input", sync);
  input.addEventListener("blur", sync);
}

function updateImageUrlPreview(inputId, previewId, wrapId) {
  const input   = document.getElementById(inputId);
  const preview = document.getElementById(previewId);
  const wrap    = document.getElementById(wrapId);
  if (!input || !preview || !wrap) return;

  const url = input.value.trim();
  if (!url) {
    preview.src        = "";
    wrap.style.display = "none";
    return;
  }

  preview.src        = url;
  wrap.style.display = "block";
}

/* ══════════════════════════════════════════════
   CLOUDINARY UPLOAD WIDGET (Add / Edit)
══════════════════════════════════════════════ */
function initCloudinaryUploadWidgets() {
  const addBtn  = document.getElementById("a-upload-btn");
  const editBtn = document.getElementById("e-upload-btn");

  if (!addBtn && !editBtn) return;

  if (!window.cloudinary || !CLOUDINARY_CONFIG.cloudName || !CLOUDINARY_CONFIG.uploadPreset) {
    console.warn("Cloudinary upload widget not fully configured. Set CLOUDINARY_CONFIG in admin.js.");
    const warn = () => toast("Image upload is not configured yet. Please contact the developer.", "warning");
    if (addBtn)  addBtn.addEventListener("click", warn);
    if (editBtn) editBtn.addEventListener("click", warn);
    return;
  }

  const baseOptions = {
    cloudName: CLOUDINARY_CONFIG.cloudName,
    uploadPreset: CLOUDINARY_CONFIG.uploadPreset,
    sources: ["local", "url", "camera"],
    cropping: false,
    multiple: false,
    maxFiles: 1,
    resourceType: "image",
    clientAllowedFormats: ["png", "jpg", "jpeg", "webp"],
    maxFileSize: 5 * 1024 * 1024, // 5MB
    folder: "products",
  };

  const addWidget = window.cloudinary.createUploadWidget(
    baseOptions,
    (error, result) => {
      if (error) {
        console.error("Cloudinary (add) error:", error);
        toast("Upload failed. Please try again.", "error");
        return;
      }
      if (result && result.event === "success") {
        const url = result.info.secure_url;
        set("a-image-url", url);
        updateImageUrlPreview("a-image-url", "a-preview", "a-preview-wrap");
        toast("Image uploaded successfully.", "success");
      }
    }
  );

  const editWidget = window.cloudinary.createUploadWidget(
    baseOptions,
    (error, result) => {
      if (error) {
        console.error("Cloudinary (edit) error:", error);
        toast("Upload failed. Please try again.", "error");
        return;
      }
      if (result && result.event === "success") {
        const url = result.info.secure_url;
        set("e-image-url", url);
        updateImageUrlPreview("e-image-url", "e-preview", "e-preview-wrap");
        toast("Image uploaded successfully.", "success");
      }
    }
  );

  if (addBtn) {
    addBtn.addEventListener("click", () => {
      if (!requireAuth()) return;
      addWidget.open();
    });
  }
  if (editBtn) {
    editBtn.addEventListener("click", () => {
      if (!requireAuth()) return;
      editWidget.open();
    });
  }
}

/* ══════════════════════════════════════════════
   REVIEWS UPLOAD WIDGET
══════════════════════════════════════════════ */
function initReviewsUpload() {
  const uploadBtn = document.getElementById("rv-upload-btn");
  const saveBtn   = document.getElementById("rv-save-btn");
  const urlInput  = document.getElementById("rv-image-url");
  const preview   = document.getElementById("rv-preview");
  const previewWrap = document.getElementById("rv-preview-wrap");
  const captionInput = document.getElementById("rv-caption");

  if (!uploadBtn || !saveBtn) return;

  if (!window.cloudinary || !CLOUDINARY_CONFIG.cloudName || !CLOUDINARY_CONFIG.uploadPreset) {
    uploadBtn.addEventListener("click", () =>
      toast("Image upload is not configured. Contact the developer.", "warning")
    );
    return;
  }

  const reviewWidget = window.cloudinary.createUploadWidget(
    {
      cloudName:    CLOUDINARY_CONFIG.cloudName,
      uploadPreset: CLOUDINARY_CONFIG.uploadPreset,
      sources:      ["local", "url", "camera"],
      multiple:     false,
      maxFiles:     1,
      resourceType: "image",
      clientAllowedFormats: ["png", "jpg", "jpeg", "webp"],
      maxFileSize:  8 * 1024 * 1024,   // 8MB — screenshots can be larger
      folder:       "reviews",          // separate Cloudinary folder
      cropping:     false,
    },
    (error, result) => {
      if (error) {
        console.error("Cloudinary (review) error:", error);
        toast("Upload failed. Please try again.", "error");
        return;
      }
      if (result && result.event === "success") {
        const url = result.info.secure_url;
        urlInput.value = url;
        preview.src = url;
        previewWrap.style.display = "block";
        toast("Screenshot uploaded. Click Save Review to publish.", "success");
      }
    }
  );

  uploadBtn.addEventListener("click", () => {
    if (!requireAuth()) return;
    reviewWidget.open();
  });

  saveBtn.addEventListener("click", async () => {
    if (!requireAuth()) return;
    const imageUrl = urlInput.value.trim();
    const caption  = captionInput ? captionInput.value.trim() : "";

    if (!imageUrl) {
      toast("Please upload a screenshot first.", "error");
      return;
    }

    setBtnLoading(saveBtn, true);
    try {
      await saveAdminReview({ imageUrl, caption });
      toast("Review published successfully!", "success");
      // Reset form
      urlInput.value = "";
      if (captionInput) captionInput.value = "";
      preview.src = "";
      previewWrap.style.display = "none";
    } catch (err) {
      console.error("Save review error:", err);
      toast(`Failed to save review: ${err.message}`, "error");
    } finally {
      setBtnLoading(saveBtn, false, '<i class="fa-solid fa-floppy-disk"></i> Save Review');
    }
  });
}

/* ══════════════════════════════════════════════
   CATEGORY TOGGLE — show shirt grades vs fixed price (Caps/Hoodies)
══════════════════════════════════════════════ */
const FIXED_PRICE_CATS = ["Caps", "Hoodies"];

function togglePricingUI(form) {
  const isAdd = form === "add";
  const cat = val(isAdd ? "a-cat" : "e-cat");
  const useFixed = FIXED_PRICE_CATS.includes(cat);

  const fixedWrap = document.getElementById(isAdd ? "a-fixed-price-wrap" : "e-fixed-price-wrap");
  const gradesWrap = document.getElementById(isAdd ? "a-grades-wrap" : "e-grades-wrap");
  const gradePricesWrap = document.getElementById(isAdd ? "a-grade-prices-wrap" : "e-grade-prices-wrap");

  if (fixedWrap) fixedWrap.style.display = useFixed ? "block" : "none";
  if (gradesWrap) gradesWrap.style.display = useFixed ? "none" : "block";
  if (gradePricesWrap) gradePricesWrap.style.display = useFixed ? "none" : "block";
}

function initAddFormCategoryToggle() {
  const catSelect = document.getElementById("a-cat");
  if (!catSelect) return;
  catSelect.addEventListener("change", () => togglePricingUI("add"));
}

function initEditFormCategoryToggle() {
  const catSelect = document.getElementById("e-cat");
  if (!catSelect) return;
  catSelect.addEventListener("change", () => togglePricingUI("edit"));
}

/* ══════════════════════════════════════════════
   GRADE PRICE INPUTS
   Renders a price-per-grade input row whenever the grade chip
   selection changes. Also watches on first call.
══════════════════════════════════════════════ */

const GRADE_ORDER = ["Standard Pro 250 GSM", "New Premium 320 GSM", "Prime 350 GSM", "Stone Wash 370 GSM"];

function renderGradePriceInputs(gradesContainerId, priceContainerId, existingPrices = {}) {
  const container  = document.getElementById(priceContainerId);
  if (!container) return;

  const selectedGrades = getChecked(gradesContainerId);
  if (selectedGrades.length === 0) {
    container.innerHTML = `<p style="font-size:0.78rem;color:var(--muted);">Select at least one grade above to set prices.</p>`;
    return;
  }

  container.innerHTML = selectedGrades.map(grade => {
    const existing = existingPrices[grade] || "";
    return `
      <div class="grade-price-item">
        <label>${grade} (₦)</label>
        <input
          type="number"
          data-grade="${grade}"
          class="grade-price-input"
          placeholder="e.g. ${GRADE_ORDER.indexOf(grade) === 0 ? 16000 : GRADE_ORDER.indexOf(grade) === 1 ? 22000 : GRADE_ORDER.indexOf(grade) === 2 ? 28000 : 30000}"
          min="0"
          value="${existing}"
        />
      </div>`;
  }).join("");
}

function initGradePriceInputs(gradesContainerId, priceContainerId) {
  const gradesContainer = document.getElementById(gradesContainerId);
  if (!gradesContainer) return;

  // Initial render
  renderGradePriceInputs(gradesContainerId, priceContainerId, {});

  // Re-render when any chip changes
  gradesContainer.addEventListener("click", () => {
    // Defer slightly so getChecked() reads the updated state
    setTimeout(() => {
      const existing = getGradePrices(priceContainerId, getChecked(gradesContainerId));
      renderGradePriceInputs(gradesContainerId, priceContainerId, existing);
    }, 0);
  });
}

function getGradePrices(priceContainerId, grades) {
  const container = document.getElementById(priceContainerId);
  const prices    = {};
  if (!container) return prices;
  container.querySelectorAll(".grade-price-input").forEach(input => {
    const grade = input.dataset.grade;
    const val   = parseFloat(input.value) || 0;
    if (grade) prices[grade] = val;
  });
  return prices;
}

/* ══════════════════════════════════════════════
   SLEEVELESS CHIP
══════════════════════════════════════════════ */
function initSleevelessChip(checkboxId) {
  const cb   = document.getElementById(checkboxId);
  if (!cb)   return;
  const chip = cb.closest(".chip");
  if (!chip) return;

  // Sync visual on click
  chip.addEventListener("click", () => {
    // browser has already toggled cb.checked
    chip.classList.toggle("checked", cb.checked);
  });
}

/* ══════════════════════════════════════════════
   FEATURED CHIP
══════════════════════════════════════════════ */
function initFeaturedChip(checkboxId) {
  const cb   = document.getElementById(checkboxId);
  if (!cb)   return;
  const chip = cb.closest(".chip");
  if (!chip) return;

  // Sync visual on click
  chip.addEventListener("click", () => {
    // browser has already toggled cb.checked
    chip.classList.toggle("checked", cb.checked);
  });
}

/* ══════════════════════════════════════════════
   CHIP CHECKBOXES  (supports an "All" chip)
   The chip with value="__all__" is the select-all toggle.
   • Clicking All (unchecked→checked): checks every sibling chip.
   • Clicking All (checked→unchecked): unchecks every sibling chip.
   • Clicking any individual chip: updates it, then auto-syncs All
     (All becomes checked only when every individual chip is checked).
   getChecked() filters out "__all__" so it's never saved to Firestore.
══════════════════════════════════════════════ */
function initChips(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;

  container.querySelectorAll(".chip").forEach(chip => {
    const cb = chip.querySelector("input[type=checkbox]");
    if (!cb) return;
    // Sync visual state to initial checked state
    chip.classList.toggle("checked", cb.checked);

    chip.addEventListener("click", () => {
      // After a click the browser has already toggled cb.checked
      const isAll = cb.value === "__all__";

      if (isAll) {
        // Propagate All's new state to every sibling
        const nowChecked = cb.checked;
        container.querySelectorAll(".chip").forEach(c => {
          const ccb = c.querySelector("input[type=checkbox]");
          if (!ccb) return;
          ccb.checked = nowChecked;
          c.classList.toggle("checked", nowChecked);
        });
      } else {
        // Sync this chip's visual state
        chip.classList.toggle("checked", cb.checked);
        // Sync All chip: checked only if every individual chip is checked
        const allChip  = container.querySelector(".chip input[value='__all__']");
        if (allChip) {
          const individuals = Array.from(
            container.querySelectorAll(".chip input[type=checkbox]")
          ).filter(i => i.value !== "__all__");
          const allTicked = individuals.every(i => i.checked);
          allChip.checked = allTicked;
          allChip.closest(".chip").classList.toggle("checked", allTicked);
        }
      }
    });
  });
}

/* Sync the All chip visual state without firing events — used after
   programmatically setting checkboxes (e.g. openEditModal, resetAddForm). */
function syncAllChip(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const allInput = container.querySelector("input[value='__all__']");
  if (!allInput) return;
  const individuals = Array.from(
    container.querySelectorAll("input[type=checkbox]")
  ).filter(i => i.value !== "__all__");
  const allTicked = individuals.length > 0 && individuals.every(i => i.checked);
  allInput.checked = allTicked;
  allInput.closest(".chip").classList.toggle("checked", allTicked);
}

function getChecked(containerId) {
  return Array.from(
    document.querySelectorAll(`#${containerId} input[type=checkbox]:checked`)
  )
    .map(cb => cb.value)
    .filter(v => v !== "__all__");   // never save the meta-value to Firestore
}

/* ══════════════════════════════════════════════
   TOAST NOTIFICATIONS
══════════════════════════════════════════════ */
const TOAST_ICONS = {
  success: "fa-circle-check",
  error:   "fa-triangle-exclamation",
  warning: "fa-triangle-exclamation",
  info:    "fa-circle-info"
};

function toast(message, type = "info", duration = 3800) {
  const container = document.getElementById("toasts");
  const el        = document.createElement("div");
  el.className    = `toast ${type}`;
  el.innerHTML    = `<i class="toast-icon fa-solid ${TOAST_ICONS[type] || TOAST_ICONS.info}"></i><span>${esc(message)}</span>`;
  container.appendChild(el);
  setTimeout(() => {
    el.classList.add("out");
    setTimeout(() => el.remove(), 280);
  }, duration);
}

/* ══════════════════════════════════════════════
   HELPERS
══════════════════════════════════════════════ */
const val = id => document.getElementById(id)?.value ?? "";
const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };

function esc(str) {
  return String(str || "")
    .replace(/&/g,"&amp;").replace(/</g,"&lt;")
    .replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

function setBtnLoading(btn, loading, htmlWhenDone = "") {
  if (loading) {
    btn.disabled  = true;
    btn.innerHTML = `<span style="display:inline-block;width:13px;height:13px;border:2px solid rgba(0,0,0,.25);border-top-color:#000;border-radius:50%;animation:spin .55s linear infinite;vertical-align:middle"></span> Loading…`;
  } else {
    btn.disabled  = false;
    btn.innerHTML = htmlWhenDone;
  }
}
