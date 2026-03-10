/**
 * reviews.js — SHGAdrip Screenshot Reviews
 * Admin uploads review screenshots via Cloudinary.
 * Public page displays them. No public submission form.
 */

import { db } from "../firebase-config.js";
import {
  collection, query, orderBy, onSnapshot,
  addDoc, deleteDoc, doc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const COLLECTION = "store_reviews";

/* ══════════════════════════════════════════════
   PUBLIC — display screenshots on homepage
══════════════════════════════════════════════ */
export function initPublicReviews() {
  const container = document.getElementById("reviewsContainer");
  if (!container) return;

  container.innerHTML = `<div class="reviews-loading"><i class="fa-solid fa-spinner fa-spin"></i></div>`;

  const q = query(collection(db, COLLECTION), orderBy("createdAt", "desc"));

  onSnapshot(q, snapshot => {
    const reviews = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));

    if (reviews.length === 0) {
      container.innerHTML = `
        <div class="reviews-empty">
          <i class="fa-solid fa-images"></i>
          <p>No reviews yet — check back soon!</p>
        </div>`;
      return;
    }

    container.innerHTML = `
      <div class="reviews-grid">
        ${reviews.map(r => `
          <div class="review-card">
            <img
              src="${r.imageUrl}"
              alt="${r.caption ? r.caption : 'Customer review'}"
              loading="lazy"
              decoding="async"
              onerror="this.closest('.review-card').style.display='none'"
            />
            ${r.caption ? `<p class="review-caption">${r.caption}</p>` : ""}
          </div>
        `).join("")}
      </div>`;
  }, err => {
    console.error("Reviews listener error:", err);
    container.innerHTML = `<p class="reviews-error">Could not load reviews.</p>`;
  });
}

/* ══════════════════════════════════════════════
   ADMIN — manage review screenshots
══════════════════════════════════════════════ */
export function initAdminReviews() {
  _listenAdminReviews();
  _initDeleteActions();
}

let _adminReviews = [];

function _listenAdminReviews() {
  const container = document.getElementById("adminReviewsContainer");
  if (!container) return;

  const q = query(collection(db, COLLECTION), orderBy("createdAt", "desc"));

  onSnapshot(q, snapshot => {
    _adminReviews = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    _renderAdminReviews(container);
  }, err => {
    console.error("Admin reviews listener error:", err);
  });
}

function _renderAdminReviews(container) {
  if (_adminReviews.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon"><i class="fa-solid fa-images"></i></div>
        <div class="empty-title">No reviews yet</div>
        <div class="empty-sub">Upload your first review screenshot above.</div>
      </div>`;
    return;
  }

  container.innerHTML = `
    <div class="admin-reviews-grid">
      ${_adminReviews.map(r => `
        <div class="admin-review-card" data-id="${r.id}">
          <div class="admin-review-img-wrap">
            <img src="${r.imageUrl}" alt="Review screenshot" loading="lazy"
              onerror="this.style.opacity='0.3'" />
          </div>
          ${r.caption ? `<p class="admin-review-caption">${r.caption}</p>` : ""}
          <button class="btn btn-danger-outline btn-sm review-del-btn" data-id="${r.id}">
            <i class="fa-solid fa-trash"></i> Delete
          </button>
        </div>
      `).join("")}
    </div>`;
}

function _initDeleteActions() {
  document.addEventListener("click", async e => {
    const btn = e.target.closest(".review-del-btn");
    if (!btn) return;
    const id = btn.dataset.id;
    if (!id) return;
    if (!confirm("Delete this review screenshot? This cannot be undone.")) return;
    try {
      await deleteDoc(doc(db, COLLECTION, id));
    } catch (err) {
      console.error("Delete review error:", err);
      alert("Failed to delete review. Please try again.");
    }
  });
}

/* ══════════════════════════════════════════════
   ADMIN — save a new review (called from admin.js)
══════════════════════════════════════════════ */
export async function saveAdminReview({ imageUrl, caption }) {
  if (!imageUrl) throw new Error("imageUrl is required");
  await addDoc(collection(db, COLLECTION), {
    imageUrl,
    caption: caption || "",
    createdAt: serverTimestamp()
  });
}
