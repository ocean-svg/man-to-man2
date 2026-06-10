# MzansiMarket — Wiring Guide
## Add these exact lines to each HTML page

---

### EVERY page — paste before </body>
```html
<script src="js/app.js"></script>
<script src="js/auth-modal-inject.js"></script>
```
Then update the Sign In link in the nav to:
```html
<a class="nav-login" href="javascript:openAuthModal('signin')">Sign In</a>
```

---

### mzansimarket.html
No extra wiring needed. auth-modal-inject.js handles sign in.

---

### listings.html
Replace the `const LISTINGS = [...]` array and the old `renderListings()` call at
the bottom with:
```html
<script src="js/app.js"></script>
<script src="js/listings-connect.js"></script>
<script src="js/auth-modal-inject.js"></script>
```

---

### onboarding.html
Add before `</body>`:
```html
<script src="js/app.js"></script>
<script src="js/onboarding-connect.js"></script>
```

---

### dashboard.html
Add before `</body>` (REMOVE old renderOrders/renderListings calls first):
```html
<script src="js/app.js"></script>
<script src="js/dashboard-connect.js"></script>
<script src="js/auth-modal-inject.js"></script>
```

---

### admin.html
Add before `</body>`:
```html
<script src="js/app.js"></script>
<script src="js/admin-connect.js"></script>
```

---

### auth.html
Already fully wired — no changes needed.

---

### checkout.html + buyer-profile.html
Already fully wired — no changes needed.

---

## File Structure in htdocs

```
C:\xampp\htdocs\mzansimarket\
├── api/
│   ├── auth.php
│   ├── listings.php
│   ├── orders.php
│   ├── verifications.php
│   ├── wallet.php
│   ├── disputes.php
│   ├── admin.php
│   ├── upload.php
│   └── reviews.php
├── config/
│   └── db.php          ← edit DB_PASS if needed
├── includes/
│   └── helpers.php
├── js/
│   ├── app.js
│   ├── auth-modal-inject.js
│   ├── listings-connect.js
│   ├── dashboard-connect.js
│   ├── onboarding-connect.js
│   └── admin-connect.js
├── uploads/            ← must be writable
├── mzansimarket.html
├── listings.html
├── dashboard.html
├── admin.html
├── onboarding.html
├── auth.html
├── checkout.html
├── buyer-profile.html
└── styles.css
```

## Quick Test Checklist

1. http://localhost/mzansimarket/api/listings.php  → JSON
2. http://localhost/mzansimarket/listings.html     → Cards load from DB
3. Register at auth.html → lands on listings.html
4. Sign in as admin@mzansimarket.co.za / Admin@1234
5. Seller: sign in → dashboard.html shows real data
6. Buy a listing → checkout → order appears in buyer-profile.html
