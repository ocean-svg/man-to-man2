/* admin-connect.js — wire admin.html to live API */
document.addEventListener('DOMContentLoaded', async () => {
  if (!MZ.auth.require('admin')) return;
  await loadAdminOverview();
});

async function loadAdminOverview() {
  const r = await MZ.get('admin.php?action=overview');
  if (!r?.success) return;
  const d = r.data;
  const set = (id,v) => { const e=document.getElementById(id); if(e) e.textContent=v; };
  set('kpi-users',    Number(d.total_users||0).toLocaleString());
  set('kpi-listings', Number(d.active_listings||0).toLocaleString());
  set('kpi-escrow',   `R ${Number(d.escrow_held||0).toLocaleString()}`);
  set('kpi-disputes', d.open_disputes||0);
  set('kpi-revenue',  `R ${Number(d.revenue_mtd||0).toLocaleString()}`);
}

/* Override nav() from admin.html */
function nav(el, viewName) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById('view-'+viewName)?.classList.add('active');
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  if (el) el.classList.add('active');
  document.getElementById('bcCur').textContent = viewName.charAt(0).toUpperCase()+viewName.slice(1).replace('-',' ');

  const loaders = {
    verification: loadVerifQueue,
    disputes:     loadDisputes,
    users:        loadUsers,
    fraud:        loadFlagged,
    escrow:       loadEscrow,
    payouts:      loadPayouts,
    health:       loadHealth,
  };
  if (loaders[viewName]) loaders[viewName]();
  document.getElementById('sidebar')?.classList.remove('open');
}

async function loadVerifQueue() {
  const res = await MZ.get('verifications.php?action=queue', { status:'pending', per_page:20 });
  const wrap = document.getElementById('verifListFull') || document.getElementById('verifListPreview');
  if (!wrap || !res?.success) return;
  if (!res.data.length) { wrap.innerHTML = '<div style="padding:2rem;text-align:center;color:var(--muted);">No pending verifications.</div>'; return; }
  wrap.innerHTML = res.data.map(v => `
    <div class="verif-item">
      <div class="verif-av" style="background:#1A3826">${(v.full_name||'?').charAt(0)}</div>
      <div>
        <div class="verif-name">${v.full_name} <span style="color:var(--dim);font-size:.6rem;">${v.id}</span></div>
        <div class="verif-meta">${v.province||''} · ${v.email}</div>
        <div class="verif-docs">
          <span class="doc-chip ${v.id_front_path?'ok':''}">ID Front ${v.id_front_path?'✓':'—'}</span>
          <span class="doc-chip ${v.selfie_path?'ok':''}">Selfie ${v.selfie_path?'✓':'—'}</span>
          <span class="doc-chip ${v.address_proof_path?'ok':''}">Address ${v.address_proof_path?'✓':'—'}</span>
        </div>
      </div>
      <div class="verif-actions">
        <div class="verif-time">${v.submitted_at ? MZ.timeAgo(v.submitted_at) : ''}</div>
        <button class="va-approve" onclick="approveVerif(this,${v.id},'${v.full_name}')">Approve ✓</button>
        <button class="va-reject"  onclick="rejectVerif(this,${v.id},'${v.full_name}')">Reject</button>
      </div>
    </div>`).join('');
}

async function approveVerif(btn, id, name) {
  btn.closest('.verif-item').style.opacity = '.4';
  btn.disabled = true;
  const res = await MZ.put(`verifications.php?action=approve&id=${id}`);
  res?.success ? MZ.toast(`✅ ${name} approved — badge activated`) : MZ.toast('Failed.','error');
}
async function rejectVerif(btn, id, name) {
  const reason = prompt('Rejection reason:') || 'Documents unclear';
  btn.closest('.verif-item').style.opacity = '.4';
  const res = await MZ.put(`verifications.php?action=reject&id=${id}`, { reason });
  res?.success ? MZ.toast(`✕ ${name} rejected`) : MZ.toast('Failed.','error');
}

async function loadDisputes() {
  const res = await MZ.get('disputes.php', { status:'open', per_page:20 });
  const wrap = document.getElementById('disputesList'); if (!wrap || !res?.success) return;
  if (!res.data.length) { wrap.innerHTML = '<div style="padding:2rem;text-align:center;color:var(--muted);">No open disputes.</div>'; return; }
  wrap.innerHTML = res.data.map(d => `
    <div class="dispute-item">
      <div style="display:flex;align-items:center;gap:.5rem;"><span style="font-size:1.1rem">⚖️</span><span class="dispute-id">${d.dispute_number}</span></div>
      <div><div class="dispute-info-title">${d.listing_title||'Dispute'}</div>
        <div class="dispute-info-meta">Buyer: ${d.buyer_name} · Seller: ${d.seller_name}</div></div>
      <div class="dispute-amount">${MZ.currency(d.amount)}</div>
      <div class="dispute-age">${d.opened_at ? MZ.timeAgo(d.opened_at) : ''}</div>
      <div class="dispute-actions">
        <button class="da-btn da-buyer"  onclick="resolveDispute(${d.id},'buyer')">Buyer ✓</button>
        <button class="da-btn da-seller" onclick="resolveDispute(${d.id},'seller')">Seller ✓</button>
      </div>
    </div>`).join('');
}

async function resolveDispute(id, favour) {
  const notes = prompt(`Ruling in favour of ${favour}. Add notes (optional):`) || '';
  const res = await MZ.put(`disputes.php?action=resolve&id=${id}`, { favour, notes });
  res?.success ? (MZ.toast(`✅ Resolved in favour of ${favour}`), loadDisputes()) : MZ.toast('Failed.','error');
}

async function loadUsers() {
  const res = await MZ.get('admin.php?action=users', { per_page:30 });
  const wrap = document.getElementById('usersList'); if (!wrap || !res?.success) return;
  wrap.innerHTML = res.data.map(u => `
    <div class="user-item">
      <div class="user-av-sm" style="background:#1F5235">${(u.first_name||'?').charAt(0)}</div>
      <div><div class="user-name">${u.first_name} ${u.last_name}</div>
        <div class="user-meta">${u.email} · Joined ${MZ.timeAgo(u.created_at)}</div></div>
      <div class="user-stats"><div class="user-stat-val">${u.total_sales||0}</div><div>sales</div></div>
      <span class="status-badge sb-${u.status}">${u.status}</span>
      <div class="user-actions">
        <button class="ua-btn" title="View" onclick="MZ.toast('Profile view coming soon')">👁</button>
        <button class="ua-btn danger" title="Suspend" onclick="suspendUser(${u.id})">🚫</button>
      </div>
    </div>`).join('');
}

async function suspendUser(id) {
  if (!confirm('Suspend this account?')) return;
  const res = await MZ.put(`admin.php?action=suspend&id=${id}`);
  res?.success ? (MZ.toast('🚫 Account suspended'), loadUsers()) : MZ.toast('Failed.','error');
}

async function loadFlagged() {
  const res = await MZ.get('admin.php?action=fraud_flags');
  const wrap = document.getElementById('flaggedList'); if (!wrap || !res?.success) return;
  wrap.innerHTML = res.data.map(f => `
    <div class="flagged-item">
      <span class="flag-icon">🚩</span>
      <div><div class="flag-title">${f.reason||'Flagged item'}</div>
        <div class="flag-reason">${f.flagged_type} ID ${f.flagged_id}</div></div>
      <div class="flag-actions">
        <button class="fa-btn fa-keep" onclick="resolveFlag(${f.id},'dismiss')">Dismiss</button>
        <button class="fa-btn fa-remove" onclick="resolveFlag(${f.id},'remove')">Remove</button>
      </div>
    </div>`).join('');
}

async function resolveFlag(id, action) {
  const res = await MZ.put(`admin.php?action=resolve_flag&id=${id}`, { action });
  res?.success ? (MZ.toast(action==='remove'?'🗑️ Removed':'✓ Dismissed'), loadFlagged()) : MZ.toast('Failed.','error');
}

async function loadEscrow() {
  const res = await MZ.get('admin.php?action=escrow');
  const wrap = document.getElementById('escrowList'); if (!wrap || !res?.success) return;
  wrap.innerHTML = res.data.map(o => `
    <div class="dispute-item">
      <span style="font-size:1.1rem">🔒</span>
      <div><div class="dispute-info-title">${o.listing_title||'Order'}</div>
        <div class="dispute-info-meta">${o.order_number} · Buyer: ${o.buyer_name} · Seller: ${o.seller_name}</div></div>
      <div class="dispute-amount">${MZ.currency(o.amount)}</div>
      <span class="status-badge ${o.status==='stalled'?'sb-flagged':'sb-verified'}">${o.status}</span>
      <div class="dispute-actions">
        ${o.status==='stalled'?`<button class="da-btn da-buyer" onclick="forceRelease(${o.id})">Force Release</button>`:''}
      </div>
    </div>`).join('');
}

async function forceRelease(orderId) {
  if (!confirm('Force-release escrow to seller?')) return;
  const res = await MZ.put(`orders.php?action=confirm&id=${orderId}`);
  res?.success ? (MZ.toast('✅ Escrow released'), loadEscrow()) : MZ.toast('Failed.','error');
}

async function loadPayouts() {
  const res = await MZ.get('admin.php?action=payouts');
  const wrap = document.getElementById('payoutsList'); if (!wrap || !res?.success) return;
  wrap.innerHTML = res.data.map(p => `
    <div class="dispute-item">
      <div class="user-av-sm" style="background:#1F5235;width:28px;height:28px;">${(p.first_name||'?').charAt(0)}</div>
      <div><div class="dispute-info-title">${p.first_name} ${p.last_name}</div>
        <div class="dispute-info-meta">${p.bank_name||'Bank'} · ${p.total_sales||0} sales</div></div>
      <div class="dispute-amount">${MZ.currency(p.wallet_balance)}</div>
      <span class="status-badge sb-verified">Ready</span>
      <div class="dispute-actions">
        <button class="da-btn da-seller" onclick="MZ.toast('💸 Payout initiated for ${p.first_name}')">Pay Out</button>
      </div>
    </div>`).join('');
}

async function loadHealth() {
  const res = await MZ.get('admin.php?action=health');
  if (!res?.success) return;
  const wrap = document.getElementById('healthGrid'); if (!wrap) return;
  wrap.innerHTML = res.data.map(s => `
    <div class="health-card">
      <div class="health-service">
        <div class="health-pip" style="background:${s.status==='up'?'var(--go)':'var(--danger)'}"></div>
        <span class="health-svc-name">${s.name}</span>
        <span class="health-uptime">${s.uptime||'—'}</span>
      </div>
      <div class="health-metrics">
        ${(s.metrics||[]).map(m=>`<div class="hm-row"><span class="hm-label">${m[0]}</span><span class="hm-val">${m[1]}</span></div>`).join('')}
      </div>
    </div>`).join('');
}
function toggleSidebar(){document.getElementById('sidebar')?.classList.toggle('open');}
function handleSearch(q){if(q.length>2)MZ.toast(`🔍 Searching: "${q}"...`);}
