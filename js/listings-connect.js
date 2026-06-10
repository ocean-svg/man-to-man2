/* ================================================================
   MzansiMarket — Listings Page API Connection
   listings-connect.js

   HOW TO ADD:
   In listings.html, find the closing </body> tag and add:
     <script src="app.js"></script>
     <script src="listings-connect.js"></script>
   Then DELETE the hardcoded `const LISTINGS = [...]` array
   and DELETE the old `renderListings()` call at the bottom.
================================================================ */

/* ── State ───────────────────────────────────────────────── */
const state = {
  search:       '',
  category:     'All',
  province:     'All',
  verifiedOnly: true,
  priceMax:     10000,
  sort:         'recent',
  view:         'grid',
  savedIds:     new Set(),
  page:         1,
  perPage:      12,
  total:        0,
  loading:      false,
};

/* Map display category names to API slugs */
const CAT_SLUG = {
  'All':'', 'Clothing':'clothing', 'Electronics':'electronics',
  'Handmade':'handmade', 'Home':'home', 'Food':'food',
  'Shoes':'shoes', 'Tools':'tools', 'Books':'books', 'Kids':'kids',
};

let searchDebounced;

/* ── Boot ────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  searchDebounced = MZ.debounce(handleSearch, 450);

  /* Re-wire search input to debounced handler */
  const si = document.getElementById('searchInput');
  if (si) {
    si.oninput = null;
    si.addEventListener('input', () => searchDebounced());
  }

  loadListings(true);
  loadSavedIds();
});

/* ── Load saved IDs for the logged-in user ───────────────── */
async function loadSavedIds() {
  if (!MZ.auth.isLoggedIn()) return;
  const res = await MZ.get('listings.php', { saved: 1 });
  if (res?.success && Array.isArray(res.data)) {
    res.data.forEach(l => state.savedIds.add(l.id));
  }
}

/* ── Main fetch ──────────────────────────────────────────── */
async function loadListings(reset = false) {
  if (state.loading) return;
  state.loading = true;
  if (reset) state.page = 1;

  /* Show skeleton on first load */
  if (reset) showSkeleton();

  const params = {
    page:          state.page,
    per_page:      state.perPage,
    search:        state.search || undefined,
    category:      CAT_SLUG[state.category] || undefined,
    province:      state.province !== 'All' ? state.province : undefined,
    verified_only: state.verifiedOnly ? '1' : '0',
    price_max:     state.priceMax < 10000 ? state.priceMax : undefined,
    sort:          state.sort,
  };

  const res = await MZ.get('listings.php', params);
  state.loading = false;

  if (!res?.success) {
    showError();
    return;
  }

  state.total = res.pagination?.total ?? res.data.length;
  renderListings(res.data, reset);
  updateResultsCount(res.pagination);
}

/* ── Render cards ────────────────────────────────────────── */
function renderListings(listings, reset = false) {
  const grid  = document.getElementById('listingsGrid');
  const empty = document.getElementById('emptyState');
  if (!grid) return;

  if (reset) grid.querySelectorAll('.listing-card').forEach(el => el.remove());
  empty?.classList.toggle('show', listings.length === 0 && reset);

  listings.forEach((l, i) => {
    const card = buildCard(l, i);
    grid.appendChild(card);
  });

  /* Show/hide load more */
  const btn = document.querySelector('.load-more-btn');
  if (btn) {
    btn.style.display = (state.page * state.perPage) < state.total ? '' : 'none';
  }
}

/* ── Build a single listing card ─────────────────────────── */
function buildCard(l, idx) {
  const saved    = state.savedIds.has(l.id);
  const verified = l.verification_status === 'verified';
  const card     = document.createElement('div');
  card.className = 'listing-card';
  card.style.animationDelay = `${Math.min(idx, 8) * 0.04}s`;

  const condClass = { New: 'cond-new', Good: 'cond-good', Fair: 'cond-fair' }[l.condition] || 'cond-good';
  const delivery  = l.delivery_option === 'courier' ? '🚚 Courier' :
                    l.delivery_option === 'pickup'  ? '📍 Pickup only' : '🚚 Courier & pickup';
  const emoji     = l.category_icon || '📦';
  const initials  = (l.shop_name || 'S').charAt(0).toUpperCase();
  const posted    = l.created_at ? MZ.timeAgo(l.created_at) : '';

  card.innerHTML = `
    <div class="card-img">
      ${l.image_1
        ? `<img src="${l.image_1}" alt="${l.title}" style="width:100%;height:100%;object-fit:cover;">`
        : `<span class="card-img-emoji">${emoji}</span>`}
      <span class="condition-badge ${condClass}">${l.condition}</span>
      <button class="card-save${saved?' saved':''}"
        onclick="event.stopPropagation();toggleSave(${l.id},this)"
        title="${saved?'Remove from wishlist':'Save to wishlist'}">
        <span>${saved?'❤️':'🤍'}</span>
      </button>
      ${verified ? `<div class="verified-ribbon"><span class="verified-dot"></span>Verified</div>` : ''}
    </div>
    <div class="card-body">
      <div class="card-category">${l.category_name || ''}</div>
      <div class="card-title">${l.title}</div>
      <div class="card-location">📍 ${l.township || ''}${l.province ? ', ' + l.province : ''}</div>
      <div class="card-footer">
        <div>
          <div class="card-price">${MZ.currency(l.price)}</div>
          <div class="card-price-sub">${delivery}</div>
        </div>
        <div class="card-seller">
          <div class="seller-avatar" style="background:#1F5235">${initials}</div>
          <div>
            <div class="seller-name">${l.shop_name || 'Seller'}</div>
            <div class="seller-stars">${'★'.repeat(Math.floor(l.rating_avg || 0))}</div>
          </div>
        </div>
      </div>
    </div>
    <button class="card-buy-btn"
      onclick="event.stopPropagation();handleBuy(${l.id})">
      🔒 Buy Securely
    </button>`;

  card.addEventListener('click', () => openListingModal(l.id));
  return card;
}

/* ── Skeleton loader ─────────────────────────────────────── */
function showSkeleton() {
  const grid = document.getElementById('listingsGrid');
  if (!grid) return;
  grid.querySelectorAll('.listing-card, .skeleton-card').forEach(el => el.remove());
  for (let i = 0; i < 8; i++) {
    const sk = document.createElement('div');
    sk.className = 'skeleton-card';
    sk.style.cssText = `background:var(--white);border:1.5px solid var(--parch);border-radius:14px;overflow:hidden;`;
    sk.innerHTML = `
      <div style="height:200px;background:linear-gradient(90deg,#eee 25%,#f5f5f5 50%,#eee 75%);background-size:200%;animation:shimmer 1.4s infinite;">
      </div>
      <div style="padding:.9rem;">
        <div style="height:10px;background:#eee;border-radius:4px;margin-bottom:.5rem;width:60%;"></div>
        <div style="height:14px;background:#eee;border-radius:4px;margin-bottom:.35rem;"></div>
        <div style="height:14px;background:#eee;border-radius:4px;width:80%;"></div>
      </div>
      <style>@keyframes shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}</style>`;
    grid.appendChild(sk);
  }
}

function showError() {
  const grid = document.getElementById('listingsGrid');
  if (!grid) return;
  grid.querySelectorAll('.listing-card, .skeleton-card').forEach(el => el.remove());
  const err = document.createElement('div');
  err.style.cssText = 'grid-column:1/-1;text-align:center;padding:3rem;color:var(--muted);';
  err.innerHTML = `<div style="font-size:2.5rem;margin-bottom:.8rem;">⚠️</div>
    <div style="font-family:Bricolage Grotesque,sans-serif;font-weight:700;margin-bottom:.4rem;">Could not load listings</div>
    <div style="font-size:.85rem;">Check that XAMPP is running, then <a href="javascript:loadListings(true)" style="color:var(--leaf)">try again</a>.</div>`;
  grid.appendChild(err);
}

/* ── Results count ───────────────────────────────────────── */
function updateResultsCount(pagination) {
  const el = document.getElementById('resultsCount');
  if (!el) return;
  const showing = Math.min((state.page * state.perPage), state.total);
  el.innerHTML = `Showing <strong>${showing}</strong> of <strong>${state.total}</strong> listings <span>${state.category !== 'All' ? 'in ' + state.category : 'across South Africa'}</span>`;
}

/* ── Open listing modal (fetches full detail) ────────────── */
async function openListingModal(id) {
  /* Increment view count */
  MZ.post('listings.php?action=view', { listing_id: id });

  const res = await MZ.get(`listings.php?action=get&id=${id}`);
  if (!res?.success) { MZ.toast('Could not load listing.', 'error'); return; }
  const l = res.data;

  /* Populate modal (same elements as before, now with real data) */
  const setText = (elId, text) => { const el = document.getElementById(elId); if (el) el.textContent = text; };
  const setHTML = (elId, html) => { const el = document.getElementById(elId); if (el) el.innerHTML = html; };

  setText('modalCategory', l.category_name || '');
  setText('modalTitle',    l.title);
  setHTML('modalPrice',    `<sup>R</sup>${Number(l.price).toLocaleString()}`);
  setText('modalDesc',     l.description || '');

  const el = document.getElementById('modalEmoji');
  if (el) {
    if (l.image_1) {
      el.innerHTML = `<img src="${l.image_1}" alt="${l.title}" style="width:100%;height:100%;object-fit:cover;border-radius:8px;">`;
    } else {
      el.textContent = l.category_icon || '📦';
    }
  }

  setHTML('modalBadges', `
    ${l.verification_status === 'verified' ? `<span class="modal-badge badge-verified">✓ Verified</span>` : ''}
    <span class="modal-badge badge-escrow">🔒 Escrow</span>
    <span class="modal-badge badge-cond">${l.condition}</span>
  `);

  setHTML('modalSeller', `
    <div class="modal-seller-av" style="background:#1F5235">${(l.shop_name||'S').charAt(0)}</div>
    <div>
      <div class="modal-seller-name">${l.shop_name || 'Seller'}${l.verification_status==='verified'?' ✓':''}</div>
      <div class="modal-seller-meta">
        <span class="modal-seller-stars">${'★'.repeat(Math.floor(l.rating_avg||0))}</span>
        ${l.rating_avg||''} · ${l.rating_count||0} reviews
      </div>
    </div>
  `);

  const loc  = [l.township, l.province].filter(Boolean).join(', ');
  const delv = l.delivery_option === 'courier' ? '🚚 Courier' :
               l.delivery_option === 'pickup'  ? '📍 Pickup only' : '🚚 Courier & pickup';
  setHTML('modalLocation', `📍 <strong>${loc}</strong> &nbsp;·&nbsp; ${delv}`);

  /* Save button state */
  const saveBtn = document.getElementById('modalSaveBtn');
  if (saveBtn) saveBtn.textContent = state.savedIds.has(l.id) ? '❤️' : '🤍';

  /* Store current listing id for buy/save buttons */
  window._mzCurrentListing = l;

  document.getElementById('modalOverlay')?.classList.add('open');
  document.body.style.overflow = 'hidden';
}

/* ── Toggle save / wishlist ──────────────────────────────── */
async function toggleSave(id, btn) {
  if (!MZ.auth.isLoggedIn()) {
    MZ.requireLoginThen(() => toggleSave(id, btn));
    return;
  }
  const res = await MZ.post('listings.php?action=save', { listing_id: id });
  if (!res?.success) { MZ.toast('Could not update wishlist.', 'error'); return; }

  const added = res.data?.saved;
  if (added) state.savedIds.add(id); else state.savedIds.delete(id);
  if (btn) {
    btn.classList.toggle('saved', added);
    btn.querySelector('span').textContent = added ? '❤️' : '🤍';
  }
  MZ.toast(added ? '❤️ Saved to wishlist' : '🗑️ Removed from wishlist');
}

function toggleModalSave() {
  const l = window._mzCurrentListing;
  if (!l) return;
  const btn = document.getElementById('modalSaveBtn');
  toggleSave(l.id, null);
  state.savedIds.has(l.id)
    ? (state.savedIds.delete(l.id), btn && (btn.textContent = '🤍'))
    : (state.savedIds.add(l.id),   btn && (btn.textContent = '❤️'));
}

/* ── Handle buy button ───────────────────────────────────── */
function handleBuy(id) {
  MZ.requireLoginThen(() => {
    window.location.href = `checkout.html?listing_id=${id}`;
  });
}

/* ── Filter / sort handlers (replace old onclick fns) ─────── */
function handleSearch() {
  state.search = document.getElementById('searchInput')?.value || '';
  updateChips();
  loadListings(true);
}

function filterCategory(el, cat) {
  document.querySelectorAll('.cat-item').forEach(c => c.classList.remove('active'));
  el?.classList.add('active');
  state.category = cat;
  updateChips();
  loadListings(true);
}

function filterProvince(el, prov) {
  document.querySelectorAll('.province-item').forEach(p => p.classList.remove('selected'));
  el?.classList.add('selected');
  state.province = prov;
  updateChips();
  loadListings(true);
}

function toggleVerified() {
  state.verifiedOnly = !state.verifiedOnly;
  document.getElementById('verifiedToggle')?.classList.toggle('on', state.verifiedOnly);
  document.getElementById('verifiedSwitch')?.classList.toggle('on', state.verifiedOnly);
  updateChips();
  loadListings(true);
}

function updatePriceRange(val) {
  state.priceMax = parseInt(val);
  const el = document.getElementById('priceMax');
  if (el) el.value = val;
  loadListings(true);
}

function applyFilters() {
  state.priceMax = parseInt(document.getElementById('priceMax')?.value) || 10000;
  loadListings(true);
}

function applySort(val) {
  state.sort = val;
  loadListings(true);
}

function toggleCheckbox(el) {
  el.classList.toggle('checked');
  const box = el.querySelector('.checkbox-box');
  if (box) box.textContent = el.classList.contains('checked') ? '✓' : '';
}

function clearAllFilters() {
  Object.assign(state, { search:'', category:'All', province:'All', verifiedOnly:false, priceMax:10000, page:1 });
  const si = document.getElementById('searchInput'); if (si) si.value = '';
  const pm = document.getElementById('priceMax');    if (pm) pm.value = '';
  const pr = document.getElementById('priceRange');  if (pr) pr.value = 10000;
  document.querySelectorAll('.cat-item').forEach((c,i) => c.classList.toggle('active', i===0));
  document.querySelectorAll('.province-item').forEach((p,i) => p.classList.toggle('selected', i===0));
  document.getElementById('verifiedToggle')?.classList.remove('on');
  document.getElementById('verifiedSwitch')?.classList.remove('on');
  document.querySelectorAll('.checkbox-item').forEach(c => { c.classList.remove('checked'); const b = c.querySelector('.checkbox-box'); if (b) b.textContent=''; });
  updateChips();
  loadListings(true);
}

function removeFilter(type) {
  if (type==='verified') { state.verifiedOnly=false; document.getElementById('verifiedToggle')?.classList.remove('on'); document.getElementById('verifiedSwitch')?.classList.remove('on'); }
  updateChips(); loadListings(true);
}
function removeFilterCat()  { state.category='All'; document.querySelectorAll('.cat-item').forEach((c,i)=>c.classList.toggle('active',i===0)); updateChips(); loadListings(true); }
function removeFilterProv() { state.province='All'; document.querySelectorAll('.province-item').forEach((p,i)=>p.classList.toggle('selected',i===0)); updateChips(); loadListings(true); }
function removeFilterSearch(){ state.search=''; const si=document.getElementById('searchInput'); if(si)si.value=''; updateChips(); loadListings(true); }

function updateChips() {
  let h='';
  if (state.verifiedOnly) h+=`<div class="filter-chip">✅ Verified Only <button class="chip-remove" onclick="removeFilter('verified')">✕</button></div>`;
  if (state.category!=='All') h+=`<div class="filter-chip">${state.category} <button class="chip-remove" onclick="removeFilterCat()">✕</button></div>`;
  if (state.province!=='All') h+=`<div class="filter-chip">📍 ${state.province} <button class="chip-remove" onclick="removeFilterProv()">✕</button></div>`;
  if (state.search) h+=`<div class="filter-chip">🔍 "${state.search}" <button class="chip-remove" onclick="removeFilterSearch()">✕</button></div>`;
  const af = document.getElementById('activeFilters');
  if (af) af.innerHTML = h;
}

function setView(v) {
  state.view = v;
  document.getElementById('listingsGrid')?.classList.toggle('list-view', v==='list');
  document.getElementById('gridBtn')?.classList.toggle('active', v==='grid');
  document.getElementById('listBtn')?.classList.toggle('active', v==='list');
}

function loadMore() {
  state.page++;
  loadListings(false);
}

function openSidebar()  { document.getElementById('sidebar')?.classList.add('mobile-open'); document.getElementById('sidebarOverlay')?.classList.add('show'); document.body.style.overflow='hidden'; }
function closeSidebar() { document.getElementById('sidebar')?.classList.remove('mobile-open'); document.getElementById('sidebarOverlay')?.classList.remove('show'); document.body.style.overflow=''; }

function closeModalDirect() { document.getElementById('modalOverlay')?.classList.remove('open'); document.body.style.overflow=''; }
function closeModal(e)      { if (e.target===document.getElementById('modalOverlay')) closeModalDirect(); }

document.addEventListener('keydown', e => {
  if (e.key==='Escape') closeModalDirect();
});
