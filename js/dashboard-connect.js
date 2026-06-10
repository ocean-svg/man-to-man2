/* dashboard-connect.js — wire dashboard.html to live API */
document.addEventListener('DOMContentLoaded', async () => {
  if (!MZ.auth.require('seller')) return;
  await loadDashboard();
});
async function loadDashboard() {
  MZ.showLoader('Loading your dashboard…');
  const [meRes, ordersRes, listingsRes] = await Promise.all([
    MZ.get('auth.php?action=me'),
    MZ.get('orders.php', { type:'seller', per_page:20 }),
    MZ.get('listings.php', { seller_own:1, per_page:50 }),
  ]);
  MZ.hideLoader();
  if (meRes?.success)       hydrateSeller(meRes.data);
  if (ordersRes?.success)   window._orders   = ordersRes.data;
  if (listingsRes?.success) window._listings = listingsRes.data;
  renderOverview();
}
function hydrateSeller(u) {
  const $ = (sel,val) => document.querySelectorAll(sel).forEach(el=>el&&(el.textContent=val));
  $('.seller-id-name', u.shop_name||u.first_name);
  $('.seller-id-badge', u.verification_status==='verified'?'Verified Seller':'Pending Verification');
  $('#pageSub', `Good morning, ${u.first_name} 👋`);
  $('#kpi-revenue', MZ.currency(u.wallet_balance||0));
  $('#kpi-sold',    u.total_sales||0);
  $('#kpi-rating',  u.rating_avg||'—');
}
function renderOverview() {
  const orders=(window._orders||[]), listings=(window._listings||[]);
  const revenue=orders.filter(o=>o.status==='confirmed').reduce((s,o)=>s+Number(o.amount),0);
  const sold=orders.filter(o=>o.status==='confirmed').length;
  const views=listings.reduce((s,l)=>s+(l.views||0),0);
  const set=(id,v)=>{const e=document.getElementById(id);if(e)e.textContent=v;};
  set('kpi-revenue',MZ.currency(revenue)); set('kpi-sold',sold); set('kpi-views',views.toLocaleString());
  renderOrders('recentOrders',orders.slice(0,3));
}
function renderOrders(targetId,data) {
  const wrap=document.getElementById(targetId); if(!wrap) return;
  if(!data.length){wrap.innerHTML='<div style="padding:2rem;text-align:center;color:var(--muted);">No orders yet.</div>';return;}
  const actions={
    paid:    o=>`<button class="order-action confirm" onclick="dispatchOrder(${o.id})">Confirm Dispatch</button>`,
    dispatched:()=>`<button class="order-action ship">Awaiting Buyer</button>`,
    confirmed: ()=>`<button class="order-action done">Completed ✓</button>`,
  };
  wrap.innerHTML=data.map(o=>`
    <div class="order-item">
      <div style="font-size:1.3rem">📦</div>
      <div><div class="order-info-name">${o.listing_title||'Order'}</div>
        <div class="order-info-meta">${o.order_number} · ${o.buyer_name||'—'} · ${MZ.timeAgo(o.created_at)}</div></div>
      <div><div class="order-price">${MZ.currency(o.amount)}</div>
        <div class="order-price-sub">🔒 Escrow</div></div>
      ${(actions[o.status]||(() =>`<span class="status-pill status-${o.status}">${o.status}</span>`))(o)}
    </div>`).join('');
}
async function dispatchOrder(id) {
  const tracking=prompt('Courier tracking number (optional):')||'';
  const res=await MZ.put(`orders.php?action=dispatch&id=${id}`,{tracking});
  if(res?.success){MZ.toast('✅ Dispatched! Buyer notified.');refreshOrders();}
  else MZ.toast(res?.message||'Failed.','error');
}
async function refreshOrders() {
  const res=await MZ.get('orders.php',{type:'seller',per_page:20});
  if(res?.success){window._orders=res.data;renderOrders('recentOrders',res.data.slice(0,3));renderOrders('ordersListFull',res.data);}
}
function renderListingsTable(data,filter) {
  const wrap=document.getElementById('listingsTableWrap'); if(!wrap) return;
  const rows=filter==='all'?data:data.filter(l=>l.status===filter);
  if(!rows.length){wrap.innerHTML='<div style="padding:2rem;text-align:center;color:var(--muted);">No listings.</div>';return;}
  wrap.innerHTML=`<table><thead><tr><th>Listing</th><th>Price</th><th>Status</th><th>Views</th><th>Date</th><th>Actions</th></tr></thead><tbody>
    ${rows.map(l=>`<tr>
      <td><div class="listing-row-info">
        <div class="listing-row-thumb">${l.category_icon||'📦'}</div>
        <div><div class="listing-row-title">${l.title}</div><div class="listing-row-cat">${l.category_name||''}</div></div>
      </div></td>
      <td><div class="listing-price">${MZ.currency(l.price)}</div></td>
      <td><span class="status-pill status-${l.status}">${l.status}</span></td>
      <td><span class="listing-views">👁 ${l.views||0}</span></td>
      <td><span class="listing-date">${l.created_at?new Date(l.created_at).toLocaleDateString('en-ZA'):''}</span></td>
      <td><div class="row-actions">
        <button class="row-btn" onclick="MZ.toast('✏️ Editor coming soon')">✏️</button>
        <button class="row-btn" onclick="toggleStatus(${l.id},'${l.status}')">⏸</button>
        <button class="row-btn danger" onclick="deleteListing(${l.id})">🗑</button>
      </div></td>
    </tr>`).join('')}
  </tbody></table>`;
}
async function toggleStatus(id,s) {
  const ns=s==='active'?'paused':'active';
  const r=await MZ.put(`listings.php?id=${id}`,{status:ns});
  if(r?.success){MZ.toast(ns==='active'?'▶️ Activated':'⏸ Paused');
    const lr=await MZ.get('listings.php',{seller_own:1,per_page:50});
    if(lr?.success){window._listings=lr.data;renderListingsTable(lr.data,'all');}}
  else MZ.toast('Failed.','error');
}
async function deleteListing(id) {
  if(!confirm('Remove this listing?')) return;
  const r=await MZ.del(`listings.php?id=${id}`);
  if(r?.success){MZ.toast('🗑️ Removed');window._listings=(window._listings||[]).filter(l=>l.id!==id);renderListingsTable(window._listings,'all');}
  else MZ.toast('Failed.','error');
}
function filterListings(el,f){
  document.querySelectorAll('.lst-tab').forEach(t=>t.classList.remove('active'));
  el?.classList.add('active'); renderListingsTable(window._listings||[],f);
}
async function renderWalletView() {
  const r=await MZ.get('wallet.php'); if(!r?.success) return;
  const {balance,pending,transactions}=r.data;
  const wb=document.querySelector('.wallet-balance'); if(wb) wb.innerHTML=`<sup>R</sup> ${Number(balance||0).toLocaleString()}`;
  const wp=document.querySelector('.wallet-pending'); if(wp) wp.textContent=`+ R${Number(pending||0).toLocaleString()} pending escrow release`;
  renderTxList('txListFull',transactions||[],5);
}
function renderTxList(id,data,limit) {
  const wrap=document.getElementById(id); if(!wrap) return;
  const rows=limit?data.slice(0,limit):data;
  if(!rows.length){wrap.innerHTML='<div style="padding:1rem;color:var(--muted);font-size:.82rem;">No transactions yet.</div>';return;}
  wrap.innerHTML=rows.map(t=>`
    <div class="tx-item">
      <div class="tx-icon ${t.type}">${Number(t.amount)>0?'💰':'💸'}</div>
      <div class="tx-info"><div class="tx-name">${t.description||t.type}</div>
        <div class="tx-date">${t.created_at?new Date(t.created_at).toLocaleDateString('en-ZA'):''}</div></div>
      <div><div class="tx-amount ${Number(t.amount)>0?'credit':'debit'}">${Number(t.amount)>0?'+':''}${MZ.currency(Math.abs(t.amount))}</div>
        <div class="tx-status">${t.status}</div></div>
    </div>`).join('');
}
async function withdrawFunds(){const a=prompt('Amount to withdraw (R):');if(!a||isNaN(a))return;const r=await MZ.post('wallet.php?action=withdraw',{amount:parseFloat(a)});r?.success?MZ.toast(`✅ Withdrawal initiated`):MZ.toast(r?.message||'Failed.','error');}
function newListing(){MZ.toast('✏️ New listing form coming soon!');}
function showView(name) {
  document.querySelectorAll('[id^="view-"]').forEach(v=>v.style.display='none');
  const el=document.getElementById('view-'+name); if(el) el.style.display='block';
  document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active'));
  document.querySelector(`[onclick*="'${name}'"]`)?.classList.add('active');
  const titles={overview:'Dashboard Overview',listings:'My Listings',orders:'Orders',wallet:'Digital Wallet',analytics:'Analytics',messages:'Messages',reviews:'Reviews',settings:'Settings'};
  const subs={overview:`Good morning, ${MZ.auth.user()?.first_name||''}  👋`,listings:'Manage your listings',orders:'Orders needing action',wallet:'Your earnings and payouts',analytics:'Performance insights',messages:'Your conversations',reviews:'Buyer reviews',settings:'Account settings'};
  const pt=document.getElementById('pageTitle'); if(pt) pt.textContent=titles[name]||name;
  const ps=document.getElementById('pageSub');   if(ps) ps.textContent=subs[name]||'';
  if(name==='overview')  renderOverview();
  if(name==='listings')  renderListingsTable(window._listings||[],'all');
  if(name==='orders')    renderOrders('ordersListFull',window._orders||[]);
  if(name==='wallet')    renderWalletView();
  if(name==='analytics') {setTimeout(()=>{if(typeof drawViewsChart==='function')drawViewsChart();},50);}
  document.getElementById('sidebar')?.classList.remove('open');
}
function toggleSidebar(){document.getElementById('sidebar')?.classList.toggle('open');}
