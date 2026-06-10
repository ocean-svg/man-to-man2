/* ================================================================
   MzansiMarket — Shared API Client
   app.js  —  include on EVERY page before page-specific scripts

   <script src="app.js"></script>
================================================================ */

/* ── Config ──────────────────────────────────────────────── */
const MZ = {
  API: 'http://localhost/man-to-man/api',

  /* ── Auth helpers ────────────────────────────────────── */
  auth: {
    token:     () => localStorage.getItem('mz_token'),
    user:      () => JSON.parse(localStorage.getItem('mz_user') || 'null'),
    isLoggedIn:() => !!localStorage.getItem('mz_token'),
    role:      () => (JSON.parse(localStorage.getItem('mz_user') || '{}'))?.role || null,

    headers() {
      const h = { 'Content-Type': 'application/json' };
      const t = this.token();
      if (t) h['Authorization'] = `Bearer ${t}`;
      return h;
    },

    save(token, user) {
      localStorage.setItem('mz_token', token);
      localStorage.setItem('mz_user', JSON.stringify(user));
    },

    clear() {
      localStorage.removeItem('mz_token');
      localStorage.removeItem('mz_user');
    },

    logout() {
      this.clear();
      window.location.href = 'auth.html';
    },

    /* Redirect to sign-in if not logged in */
    require(role = null) {
      if (!this.isLoggedIn()) {
        window.location.href = 'auth.html?login=1&redirect=' + encodeURIComponent(window.location.href);
        return false;
      }
      if (role && this.role() !== role && this.role() !== 'admin') {
        MZ.toast('⛔ Access denied — wrong account type.');
        setTimeout(() => window.location.href = 'listings.html', 1500);
        return false;
      }
      return true;
    },
  },

  /* ── Fetch wrapper ───────────────────────────────────── */
  async fetch(endpoint, options = {}) {
    const url    = endpoint.startsWith('http') ? endpoint : `${this.API}/${endpoint}`;
    const method = options.method || 'GET';
    const config = {
      method,
      headers: this.auth.headers(),
      ...options,
    };
    if (options.body && typeof options.body === 'object') {
      config.body = JSON.stringify(options.body);
    }

    try {
      const res  = await fetch(url, config);
      const json = await res.json();

      /* Token expired — force re-login */
      if (res.status === 401) {
        this.auth.clear();
        window.location.href = 'auth.html?login=1';
        return null;
      }
      return json;
    } catch (err) {
      console.error('[MZ] API error:', err);
      this.toast('⚠️ Cannot reach the server. Check XAMPP is running.', 'error');
      return null;
    }
  },

  /* ── GET shorthand ───────────────────────────────────── */
  async get(endpoint, params = {}) {
    const qs = new URLSearchParams(
      Object.fromEntries(Object.entries(params).filter(([,v]) => v !== '' && v !== null && v !== undefined))
    ).toString();
    const url = qs ? `${endpoint}${endpoint.includes('?') ? '&' : '?'}${qs}` : endpoint;
    return this.fetch(url);
  },

  /* ── POST shorthand ──────────────────────────────────── */
  async post(endpoint, body = {}) {
    return this.fetch(endpoint, { method: 'POST', body });
  },

  /* ── PUT shorthand ───────────────────────────────────── */
  async put(endpoint, body = {}) {
    return this.fetch(endpoint, { method: 'PUT', body });
  },

  /* ── DELETE shorthand ────────────────────────────────── */
  async del(endpoint) {
    return this.fetch(endpoint, { method: 'DELETE' });
  },

  /* ── Toast notification ──────────────────────────────── */
  _toastTimer: null,
  toast(msg, type = 'default') {
    let el = document.getElementById('mzToast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'mzToast';
      el.style.cssText = `
        position:fixed;bottom:1.5rem;left:50%;
        transform:translateX(-50%) translateY(60px);
        padding:.7rem 1.3rem;border-radius:8px;
        font-family:'Bricolage Grotesque',sans-serif;font-size:.82rem;font-weight:700;
        display:flex;align-items:center;gap:.5rem;white-space:nowrap;
        box-shadow:0 8px 24px rgba(0,0,0,.25);z-index:9999;pointer-events:none;
        transition:transform .3s cubic-bezier(.34,1.3,.64,1);
      `;
      document.body.appendChild(el);
    }
    const styles = {
      default: 'background:#0D2219;color:#FDFCF9;',
      success: 'background:#1A4D30;color:#7ED957;border:1px solid rgba(126,217,87,.3);',
      error:   'background:#4D1A1A;color:#F9A8A8;border:1px solid rgba(229,62,62,.3);',
      warn:    'background:#4D3A00;color:#F0B429;border:1px solid rgba(240,180,41,.3);',
    };
    el.style.cssText += styles[type] || styles.default;
    el.textContent = msg;
    el.style.transform = 'translateX(-50%) translateY(0)';
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => {
      el.style.transform = 'translateX(-50%) translateY(60px)';
    }, 2800);
  },

  /* ── Loader overlay ──────────────────────────────────── */
  showLoader(msg = 'Loading…') {
    let el = document.getElementById('mzLoader');
    if (!el) {
      el = document.createElement('div');
      el.id = 'mzLoader';
      el.innerHTML = `
        <div style="text-align:center;">
          <div style="width:32px;height:32px;border-radius:50%;border:3px solid rgba(126,217,87,.2);border-top-color:#7ED957;animation:mzSpin .7s linear infinite;margin:0 auto 1rem;"></div>
          <div id="mzLoaderMsg" style="font-family:'Bricolage Grotesque',sans-serif;font-size:.85rem;color:rgba(237,255,245,.7);">${msg}</div>
        </div>
        <style>@keyframes mzSpin{to{transform:rotate(360deg)}}</style>`;
      el.style.cssText = 'position:fixed;inset:0;background:rgba(13,34,25,.85);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;z-index:9998;';
      document.body.appendChild(el);
    } else {
      document.getElementById('mzLoaderMsg').textContent = msg;
      el.style.display = 'flex';
    }
  },
  hideLoader() {
    const el = document.getElementById('mzLoader');
    if (el) el.style.display = 'none';
  },

  /* ── Update nav after login ──────────────────────────── */
  updateNav() {
    const user = this.auth.user();
    if (!user) return;

    /* Replace every Sign In trigger with user name */
    document.querySelectorAll('.nav-login, [data-auth-signin]').forEach(el => {
      el.textContent = user.first_name || 'Account';
      if (el.tagName === 'A') el.href = user.role === 'seller' ? 'dashboard.html' : 'auth.html';
    });

    /* Show logout button if present */
    document.querySelectorAll('[data-auth-logout]').forEach(el => {
      el.style.display = '';
      el.addEventListener('click', () => MZ.auth.logout());
    });

    /* Show/hide role-gated elements */
    document.querySelectorAll('[data-role]').forEach(el => {
      const required = el.dataset.role.split(',').map(s => s.trim());
      el.style.display = required.includes(user.role) || required.includes('any') ? '' : 'none';
    });

    /* Update avatar initial if present */
    document.querySelectorAll('[data-user-initial]').forEach(el => {
      el.textContent = (user.first_name || 'U').charAt(0).toUpperCase();
    });
    document.querySelectorAll('[data-user-name]').forEach(el => {
      el.textContent = `${user.first_name} ${user.last_name}`;
    });
    document.querySelectorAll('[data-user-email]').forEach(el => {
      el.textContent = user.email;
    });
  },

  /* ── Handle post-login redirect ──────────────────────── */
  handleRedirect() {
    const params = new URLSearchParams(window.location.search);
    const dest   = params.get('redirect');
    if (dest && dest.startsWith(window.location.origin)) {
      window.location.href = dest;
    } else {
      const role = this.auth.role();
      window.location.href =
        role === 'seller' ? 'dashboard.html' :
        role === 'admin'  ? 'admin.html' :
        'listings.html';
    }
  },

  /* ── Format currency ─────────────────────────────────── */
  currency(amount) {
    return `R ${Number(amount).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  },

  /* ── Relative time ───────────────────────────────────── */
  timeAgo(dateStr) {
    const diff = (Date.now() - new Date(dateStr)) / 1000;
    if (diff < 60)   return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
    if (diff < 86400)return `${Math.floor(diff / 3600)} hr ago`;
    return `${Math.floor(diff / 86400)} days ago`;
  },

  /* ── Debounce ────────────────────────────────────────── */
  debounce(fn, delay = 400) {
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), delay); };
  },

  /* ── Open auth modal or redirect to auth page ─────────── */
  requireLoginThen(callback) {
    if (this.auth.isLoggedIn()) {
      callback();
      return;
    }
    /* Try modal first, fall back to page redirect */
    if (typeof openAuthModal === 'function') {
      openAuthModal('signin');
      /* Store the callback for post-login execution */
      window._mzPendingAction = callback;
    } else {
      window.location.href = 'auth.html?login=1';
    }
  },
};

/* ── Init on every page ──────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  MZ.updateNav();

  /* Wire all [data-auth-trigger] links to open modal */
  document.querySelectorAll('[data-auth-trigger], .nav-login').forEach(el => {
    if (!MZ.auth.isLoggedIn()) {
      el.style.cursor = 'pointer';
      el.addEventListener('click', e => {
        e.preventDefault();
        if (typeof openAuthModal === 'function') openAuthModal('signin');
        else window.location.href = 'auth.html?login=1';
      });
    }
  });

  /* Wire logout links */
  document.querySelectorAll('[data-logout]').forEach(el => {
    el.addEventListener('click', e => { e.preventDefault(); MZ.auth.logout(); });
  });

  /* Scroll-based nav shadow */
  const nav = document.getElementById('nav');
  if (nav) {
    window.addEventListener('scroll', () => nav.classList.toggle('scrolled', window.scrollY > 10), { passive: true });
  }
});
