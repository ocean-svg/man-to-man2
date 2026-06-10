/* onboarding-connect.js — wire onboarding.html form to API */
document.addEventListener('DOMContentLoaded', () => {
  // Override the submitForm function defined in onboarding.html
  window.submitForm = submitSellerForm;
});

async function submitSellerForm() {
  const g = id => (document.getElementById(id)||{}).value||'';
  const payload = {
    first_name: g('firstName'),
    last_name:  g('lastName'),
    email:      g('email'),
    password:   g('password'),
    phone:      g('phone'),
    role:       'seller',
    shop_name:  g('shopName'),
    province:   g('province'),
    township:   g('township'),
    language:   (document.querySelector('.lang-pill.selected')||{}).textContent || 'English',
    bio:        g('bio'),
  };

  const btn = document.querySelector('.btn-submit');
  if (btn) btn.classList.add('loading');

  // Step 1: Register
  const regRes = await MZ.post('auth.php?action=register', payload);
  if (!regRes?.success) {
    if (btn) btn.classList.remove('loading');
    alert(regRes?.message || 'Registration failed. Please try again.');
    return;
  }

  // Step 2: Dev mode — auto verify email
  if (regRes.data?.verify_token) {
    await MZ.post('auth.php?action=verify_email', { token: regRes.data.verify_token });
  }

  // Step 3: Auto login to get token
  const loginRes = await MZ.post('auth.php?action=login', {
    email:    payload.email,
    password: payload.password,
  });
  if (loginRes?.success) {
    MZ.auth.save(loginRes.data.token, loginRes.data.user);
  }

  // Step 4: Submit KYC if files were uploaded
  const idNum = g('idNumber');
  const dob   = g('dob');
  if (idNum && dob) {
    await MZ.post('verifications.php', {
      sa_id_number:  idNum,
      date_of_birth: dob,
      id_front_path: 'pending_upload',
      selfie_path:   'pending_upload',
    });
  }

  // Step 5: Show success screen
  if (btn) btn.classList.remove('loading');
  document.getElementById('step5')?.classList.remove('active');
  document.getElementById('step6')?.classList.add('active');
  document.getElementById('progressFill').style.width = '100%';
  document.getElementById('progressLabel').textContent = 'Application submitted!';
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
