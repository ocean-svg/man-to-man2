/* ================================================================
   auth-modal-inject.js
   Injects the sign-in / register modal into ANY page with 1 tag.

   Usage — add before </body> on every page:
     <script src="app.js"></script>
     <script src="auth-modal-inject.js"></script>
================================================================ */
(function() {
  const html = `
<div id="authModal" style="display:none;position:fixed;inset:0;z-index:1000;align-items:center;justify-content:center;padding:1rem;background:rgba(8,14,10,.65);backdrop-filter:blur(6px);">
<div id="amCard" style="background:#FDFCF9;border-radius:16px;width:100%;max-width:440px;max-height:90vh;overflow-y:auto;box-shadow:0 32px 80px rgba(8,14,10,.35);position:relative;">
  <div style="display:flex;align-items:center;justify-content:space-between;padding:1.4rem 1.4rem 0;">
    <span style="font-family:'Bricolage Grotesque',sans-serif;font-weight:800;font-size:1.1rem;color:#0D2219;display:flex;align-items:center;gap:.35rem;"><span style="width:7px;height:7px;border-radius:50%;background:#7ED957;display:inline-block;"></span>MzansiMarket</span>
    <button onclick="closeAuthModal()" style="width:28px;height:28px;border-radius:50%;background:rgba(12,23,16,.06);border:none;cursor:pointer;font-size:.75rem;display:flex;align-items:center;justify-content:center;">✕</button>
  </div>
  <div style="display:flex;background:#EDF7F2;margin:.7rem 1.2rem 0;border-radius:8px;padding:3px;gap:2px;">
    <button id="amTabSignin"   onclick="switchAmTab('signin')"   style="flex:1;font-family:'Bricolage Grotesque',sans-serif;font-size:.78rem;font-weight:700;padding:.52rem;border:none;border-radius:6px;background:#FDFCF9;color:#0D2219;cursor:pointer;box-shadow:0 1px 4px rgba(12,23,16,.1);">Sign In</button>
    <button id="amTabRegister" onclick="switchAmTab('register')" style="flex:1;font-family:'Bricolage Grotesque',sans-serif;font-size:.78rem;font-weight:700;padding:.52rem;border:none;border-radius:6px;background:transparent;color:#687B6C;cursor:pointer;">Create Account</button>
  </div>
  <div style="padding:1.2rem 1.4rem 1.6rem;">
    <div id="amError" style="display:none;align-items:flex-start;gap:.6rem;background:rgba(217,64,64,.07);border:1px solid rgba(217,64,64,.2);border-radius:6px;padding:.8rem;margin-bottom:.9rem;font-size:.78rem;color:#D94040;"><span>⚠️</span><span id="amErrorText"></span></div>
    <!-- SIGN IN -->
    <div id="amViewSignin">
      <div style="font-family:'Bricolage Grotesque',sans-serif;font-size:1.5rem;font-weight:800;color:#0D2219;margin-bottom:.3rem;">Welcome back</div>
      <p style="font-size:.82rem;color:#687B6C;margin-bottom:1.1rem;">Sign in to buy, save listings, and track orders.</p>
      <div style="margin-bottom:.8rem;"><label style="font-family:'Bricolage Grotesque',sans-serif;font-size:.75rem;font-weight:700;color:#0C1710;display:block;margin-bottom:.3rem;">Email</label>
        <input id="amSiEmail" type="email" placeholder="you@email.com" autocomplete="email"
          style="width:100%;background:#F5F0E4;border:1.5px solid #E8DFCA;border-radius:3px;padding:.72rem .85rem;font-size:.9rem;color:#0C1710;outline:none;transition:border-color .2s;"/>
      </div>
      <div style="margin-bottom:.3rem;"><label style="font-family:'Bricolage Grotesque',sans-serif;font-size:.75rem;font-weight:700;color:#0C1710;display:block;margin-bottom:.3rem;">Password</label>
        <input id="amSiPw" type="password" placeholder="Your password" autocomplete="current-password"
          style="width:100%;background:#F5F0E4;border:1.5px solid #E8DFCA;border-radius:3px;padding:.72rem .85rem;font-size:.9rem;color:#0C1710;outline:none;transition:border-color .2s;"/>
      </div>
      <button onclick="switchAmView('forgot')" style="font-family:'Bricolage Grotesque',sans-serif;font-size:.72rem;font-weight:700;color:#3A9B5C;background:none;border:none;cursor:pointer;padding:0;display:block;text-align:right;width:100%;margin-bottom:.9rem;">Forgot password?</button>
      <button id="amSiBtn" onclick="amSignIn()" style="width:100%;background:#0D2219;color:#FDFCF9;border:none;border-radius:3px;padding:.9rem;font-family:'Bricolage Grotesque',sans-serif;font-weight:800;font-size:.9rem;cursor:pointer;margin-bottom:.9rem;transition:background .2s;">Sign In</button>
      <div style="background:#EDFFF5;border:1.5px solid rgba(58,155,92,.25);border-radius:8px;padding:.9rem;text-align:center;margin-bottom:.9rem;">
        <p style="font-size:.78rem;color:#1F5235;margin-bottom:.5rem;">Want to sell on MzansiMarket?</p>
        <a href="onboarding.html" style="font-family:'Bricolage Grotesque',sans-serif;font-size:.78rem;font-weight:700;color:#3A9B5C;text-decoration:none;">Register as a seller →</a>
      </div>
      <p style="text-align:center;font-size:.8rem;color:#687B6C;">No account? <button onclick="switchAmTab('register')" style="font-family:'Bricolage Grotesque',sans-serif;font-size:.8rem;font-weight:700;color:#3A9B5C;background:none;border:none;cursor:pointer;">Register free</button></p>
    </div>
    <!-- REGISTER -->
    <div id="amViewRegister" style="display:none;">
      <div style="font-family:'Bricolage Grotesque',sans-serif;font-size:1.5rem;font-weight:800;color:#0D2219;margin-bottom:.3rem;">Create account</div>
      <p style="font-size:.82rem;color:#687B6C;margin-bottom:1.1rem;">Buy from verified township sellers.</p>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:.6rem;margin-bottom:.8rem;">
        <div><label style="font-family:'Bricolage Grotesque',sans-serif;font-size:.75rem;font-weight:700;color:#0C1710;display:block;margin-bottom:.3rem;">First Name</label>
          <input id="amRFirst" type="text" placeholder="Thandi" style="width:100%;background:#F5F0E4;border:1.5px solid #E8DFCA;border-radius:3px;padding:.72rem .85rem;font-size:.9rem;color:#0C1710;outline:none;"/></div>
        <div><label style="font-family:'Bricolage Grotesque',sans-serif;font-size:.75rem;font-weight:700;color:#0C1710;display:block;margin-bottom:.3rem;">Last Name</label>
          <input id="amRLast" type="text" placeholder="Mokoena" style="width:100%;background:#F5F0E4;border:1.5px solid #E8DFCA;border-radius:3px;padding:.72rem .85rem;font-size:.9rem;color:#0C1710;outline:none;"/></div>
      </div>
      <div style="margin-bottom:.8rem;"><label style="font-family:'Bricolage Grotesque',sans-serif;font-size:.75rem;font-weight:700;color:#0C1710;display:block;margin-bottom:.3rem;">Email</label>
        <input id="amREmail" type="email" placeholder="you@email.com" style="width:100%;background:#F5F0E4;border:1.5px solid #E8DFCA;border-radius:3px;padding:.72rem .85rem;font-size:.9rem;color:#0C1710;outline:none;"/></div>
      <div style="margin-bottom:1rem;"><label style="font-family:'Bricolage Grotesque',sans-serif;font-size:.75rem;font-weight:700;color:#0C1710;display:block;margin-bottom:.3rem;">Password</label>
        <input id="amRPw" type="password" placeholder="Min 8 characters" style="width:100%;background:#F5F0E4;border:1.5px solid #E8DFCA;border-radius:3px;padding:.72rem .85rem;font-size:.9rem;color:#0C1710;outline:none;"/></div>
      <button id="amRBtn" onclick="amRegister()" style="width:100%;background:#0D2219;color:#FDFCF9;border:none;border-radius:3px;padding:.9rem;font-family:'Bricolage Grotesque',sans-serif;font-weight:800;font-size:.9rem;cursor:pointer;margin-bottom:.9rem;">Create Buyer Account</button>
      <p style="text-align:center;font-size:.8rem;color:#687B6C;">Have an account? <button onclick="switchAmTab('signin')" style="font-family:'Bricolage Grotesque',sans-serif;font-size:.8rem;font-weight:700;color:#3A9B5C;background:none;border:none;cursor:pointer;">Sign in</button></p>
    </div>
    <!-- FORGOT -->
    <div id="amViewForgot" style="display:none;">
      <div style="font-family:'Bricolage Grotesque',sans-serif;font-size:1.5rem;font-weight:800;color:#0D2219;margin-bottom:.3rem;">Reset password</div>
      <p style="font-size:.82rem;color:#687B6C;margin-bottom:1.1rem;">Enter your email and we'll send a reset link.</p>
      <div style="margin-bottom:.9rem;"><label style="font-family:'Bricolage Grotesque',sans-serif;font-size:.75rem;font-weight:700;color:#0C1710;display:block;margin-bottom:.3rem;">Email</label>
        <input id="amFpEmail" type="email" placeholder="you@email.com" style="width:100%;background:#F5F0E4;border:1.5px solid #E8DFCA;border-radius:3px;padding:.72rem .85rem;font-size:.9rem;color:#0C1710;outline:none;"/></div>
      <button onclick="amForgot()" style="width:100%;background:#0D2219;color:#FDFCF9;border:none;border-radius:3px;padding:.9rem;font-family:'Bricolage Grotesque',sans-serif;font-weight:800;font-size:.9rem;cursor:pointer;margin-bottom:.9rem;">Send Reset Link</button>
      <p style="text-align:center;font-size:.8rem;color:#687B6C;"><button onclick="switchAmView('signin')" style="font-family:'Bricolage Grotesque',sans-serif;font-size:.8rem;font-weight:700;color:#3A9B5C;background:none;border:none;cursor:pointer;">← Back to sign in</button></p>
    </div>
    <!-- SUCCESS -->
    <div id="amViewSuccess" style="display:none;text-align:center;padding:.5rem 0 1rem;">
      <div style="width:64px;height:64px;border-radius:50%;background:#EDFFF5;border:2px solid rgba(58,155,92,.2);display:flex;align-items:center;justify-content:center;font-size:1.8rem;margin:0 auto 1rem;">🎉</div>
      <div id="amSuccessTitle" style="font-family:'Bricolage Grotesque',sans-serif;font-size:1.4rem;font-weight:800;color:#0D2219;margin-bottom:.4rem;">You're in!</div>
      <p id="amSuccessMsg" style="font-size:.83rem;color:#687B6C;margin-bottom:1.2rem;max-width:28ch;margin-left:auto;margin-right:auto;"></p>
      <button id="amSuccessBtn" onclick="amRedirect()" style="background:#0D2219;color:#FDFCF9;border:none;border-radius:3px;padding:.85rem 2rem;font-family:'Bricolage Grotesque',sans-serif;font-weight:800;font-size:.88rem;cursor:pointer;">Continue →</button>
    </div>
  </div>
</div>
</div>`;

  document.body.insertAdjacentHTML('beforeend', html);

  // click-outside to close
  document.getElementById('authModal').addEventListener('click', function(e) {
    if (e.target === this) closeAuthModal();
  });
  // ESC key
  document.addEventListener('keydown', e => { if (e.key==='Escape') closeAuthModal(); });
  // auto-open from URL
  const p = new URLSearchParams(window.location.search);
  if (p.get('login'))    openAuthModal('signin');
  if (p.get('register')) openAuthModal('register');
  // run pending action after login
  if (window._mzPendingAction && MZ.auth.isLoggedIn()) {
    window._mzPendingAction();
    window._mzPendingAction = null;
  }
})();

function openAuthModal(view='signin') {
  const m=document.getElementById('authModal'); if(!m) return;
  m.style.display='flex';
  document.body.style.overflow='hidden';
  switchAmTab(view==='register'?'register':'signin');
  if(view==='forgot') switchAmView('forgot');
  document.getElementById('amError')?.style.setProperty('display','none');
}
function closeAuthModal() {
  const m=document.getElementById('authModal'); if(!m) return;
  m.style.display='none'; document.body.style.overflow='';
}
function switchAmTab(tab) {
  const si=document.getElementById('amTabSignin'), re=document.getElementById('amTabRegister');
  const baseStyle='flex:1;font-family:\'Bricolage Grotesque\',sans-serif;font-size:.78rem;font-weight:700;padding:.52rem;border:none;border-radius:6px;cursor:pointer;';
  si.style.cssText=baseStyle+(tab==='signin'?'background:#FDFCF9;color:#0D2219;box-shadow:0 1px 4px rgba(12,23,16,.1);':'background:transparent;color:#687B6C;');
  re.style.cssText=baseStyle+(tab==='register'?'background:#FDFCF9;color:#0D2219;box-shadow:0 1px 4px rgba(12,23,16,.1);':'background:transparent;color:#687B6C;');
  switchAmView(tab);
}
function switchAmView(view) {
  ['signin','register','forgot','success'].forEach(v=>{
    const el=document.getElementById('amView'+v.charAt(0).toUpperCase()+v.slice(1));
    if(el) el.style.display=v===view?'block':'none';
  });
  document.getElementById('amError')?.style.setProperty('display','none');
}
function amShowError(msg) {
  const e=document.getElementById('amError'),t=document.getElementById('amErrorText');
  if(e&&t){t.textContent=msg;e.style.display='flex';}
}
async function amSignIn() {
  const email=document.getElementById('amSiEmail')?.value.trim();
  const pw=document.getElementById('amSiPw')?.value;
  if(!email||!pw){amShowError('Please fill in all fields.');return;}
  const btn=document.getElementById('amSiBtn'); btn.textContent='Signing in…'; btn.disabled=true;
  const res=await MZ.post('auth.php?action=login',{email,password:pw});
  btn.textContent='Sign In'; btn.disabled=false;
  if(res?.success){
    MZ.auth.save(res.data.token,res.data.user); MZ.updateNav();
    const role=res.data.user.role;
    document.getElementById('amSuccessTitle').textContent='You\'re in!';
    document.getElementById('amSuccessMsg').textContent=role==='seller'?'Your dashboard is ready.':role==='admin'?'Going to admin console.':'Browse and buy securely.';
    document.getElementById('amSuccessBtn').querySelector&&(document.getElementById('amSuccessBtn').textContent=(role==='seller'?'Dashboard →':role==='admin'?'Admin Console →':'Browse Listings →'));
    switchAmView('success');
    if(window._mzPendingAction){setTimeout(()=>{closeAuthModal();window._mzPendingAction();window._mzPendingAction=null;},800);}
  } else amShowError(res?.message||'Invalid email or password.');
}
async function amRegister() {
  const first=document.getElementById('amRFirst')?.value.trim();
  const last=document.getElementById('amRLast')?.value.trim();
  const email=document.getElementById('amREmail')?.value.trim();
  const pw=document.getElementById('amRPw')?.value;
  if(!first||!last||!email||!pw){amShowError('Please fill in all fields.');return;}
  if(pw.length<8){amShowError('Password must be at least 8 characters.');return;}
  const btn=document.getElementById('amRBtn'); btn.textContent='Creating account…'; btn.disabled=true;
  const res=await MZ.post('auth.php?action=register',{first_name:first,last_name:last,email,password:pw,role:'buyer'});
  btn.textContent='Create Buyer Account'; btn.disabled=false;
  if(res?.success){
    if(res.data?.verify_token){await MZ.post('auth.php?action=verify_email',{token:res.data.verify_token});}
    document.getElementById('amSiEmail').value=email; document.getElementById('amSiPw').value=pw;
    await amSignIn();
  } else amShowError(res?.message||'Registration failed.');
}
async function amForgot() {
  const email=document.getElementById('amFpEmail')?.value.trim();
  if(!email){amShowError('Enter your email address.');return;}
  await MZ.post('auth.php?action=forgot_password',{email});
  document.getElementById('amSuccessTitle').textContent='Check your inbox';
  document.getElementById('amSuccessMsg').textContent='A reset link is on its way to your email.';
  document.getElementById('amSuccessBtn').textContent='Done';
  document.getElementById('amSuccessBtn').onclick=closeAuthModal;
  switchAmView('success');
}
function amRedirect() {
  closeAuthModal();
  const role=MZ.auth.role();
  if(role==='seller') window.location.href='dashboard.html';
  else if(role==='admin') window.location.href='admin.html';
  else window.location.reload();
}
