<?php
// ============================================================
//  MzansiMarket — Auth API
//  File: api/auth.php
//
//  POST /api/auth.php?action=register
//  POST /api/auth.php?action=login
//  POST /api/auth.php?action=verify_email
//  POST /api/auth.php?action=forgot_password
//  POST /api/auth.php?action=reset_password
//  GET  /api/auth.php?action=me
// ============================================================

require_once __DIR__ . '/../includes/helpers.php';
set_headers();

$action = $_GET['action'] ?? '';

match($action) {
    'register'       => register(),
    'login'          => login(),
    'verify_email'   => verify_email(),
    'forgot_password'=> forgot_password(),
    'reset_password' => reset_password(),
    'me'             => me(),
    default          => error('Unknown action.', 404),
};

// ── REGISTER ─────────────────────────────────────────────────
function register(): never {
    $body = get_body();
    validate($body, [
        'first_name' => 'required|min:2|max:100',
        'last_name'  => 'required|min:2|max:100',
        'email'      => 'required|email',
        'password'   => 'required|min:8',
        'role'       => 'required|in:buyer,seller',
    ]);

    $email = strtolower(trim($body['email']));

    // Check duplicate email
    if (DB::fetchOne("SELECT id FROM users WHERE email = ?", [$email])) {
        error('An account with this email already exists.', 409);
    }

    $uuid  = sprintf('%04x%04x-%04x-%04x-%04x-%04x%04x%04x',
        mt_rand(0,0xffff), mt_rand(0,0xffff), mt_rand(0,0xffff),
        mt_rand(0,0x0fff)|0x4000, mt_rand(0,0x3fff)|0x8000,
        mt_rand(0,0xffff), mt_rand(0,0xffff), mt_rand(0,0xffff)
    );
    $verify_token = bin2hex(random_bytes(32));

    DB::query(
        "INSERT INTO users (uuid, first_name, last_name, email, phone, password_hash, role, status, email_verify_token)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?)",
        [
            $uuid,
            clean($body['first_name']),
            clean($body['last_name']),
            $email,
            clean($body['phone'] ?? ''),
            hash_password($body['password']),
            $body['role'],
            $verify_token,
        ]
    );
    $user_id = (int) DB::lastId();

    // Create seller profile if registering as seller
    if ($body['role'] === 'seller') {
        DB::query(
            "INSERT INTO seller_profiles (user_id, shop_name, province, township, language)
             VALUES (?, ?, ?, ?, ?)",
            [
                $user_id,
                clean($body['shop_name'] ?? ($body['first_name'] . '\'s Shop')),
                clean($body['province']  ?? ''),
                clean($body['township']  ?? ''),
                clean($body['language']  ?? 'English'),
            ]
        );
    }

    // In production: send verify_token by email
    // For dev: return it in response so you can test
    $response = ['user_id' => $user_id, 'email' => $email, 'role' => $body['role']];
    if (APP_ENV === 'development') {
        $response['verify_token'] = $verify_token;
        $response['dev_note'] = 'In production this token would be emailed. Use it with ?action=verify_email';
    }

    audit($user_id, 'user.registered', 'user', $user_id);
    respond($response, 201);
}

// ── LOGIN ─────────────────────────────────────────────────────
function login(): never {
    $body = get_body();
    validate($body, [
        'email'    => 'required|email',
        'password' => 'required',
    ]);

    $email = strtolower(trim($body['email']));
    $user  = DB::fetchOne(
        "SELECT u.*, sp.shop_name, sp.verification_status, sp.wallet_balance, sp.rating_avg
         FROM users u
         LEFT JOIN seller_profiles sp ON u.id = sp.user_id
         WHERE u.email = ?",
        [$email]
    );

    if (!$user || !verify_password($body['password'], $user['password_hash'])) {
        error('Invalid email or password.', 401);
    }
    if ($user['status'] === 'suspended') error('Your account has been suspended. Contact support.', 403);
    if ($user['status'] === 'banned')    error('Your account has been permanently banned.', 403);

    // Update last login
    DB::query("UPDATE users SET last_login = NOW() WHERE id = ?", [$user['id']]);

    // Remove sensitive fields
    unset($user['password_hash'], $user['email_verify_token'], $user['reset_token']);

    $token = jwt_encode([
        'sub'   => $user['id'],
        'uuid'  => $user['uuid'],
        'email' => $user['email'],
        'role'  => $user['role'],
    ]);

    audit((int)$user['id'], 'user.login', 'user', (int)$user['id']);
    respond(['token' => $token, 'user' => $user]);
}

// ── VERIFY EMAIL ──────────────────────────────────────────────
function verify_email(): never {
    $body = get_body();
    if (empty($body['token'])) error('Verification token required.');

    $user = DB::fetchOne(
        "SELECT id FROM users WHERE email_verify_token = ? AND email_verified = 0",
        [$body['token']]
    );
    if (!$user) error('Invalid or already used verification token.', 404);

    DB::query(
        "UPDATE users SET email_verified = 1, email_verify_token = NULL, status = 'active' WHERE id = ?",
        [$user['id']]
    );

    audit((int)$user['id'], 'user.email_verified', 'user', (int)$user['id']);
    respond(['message' => 'Email verified successfully. You can now log in.']);
}

// ── FORGOT PASSWORD ───────────────────────────────────────────
function forgot_password(): never {
    $body  = get_body();
    $email = strtolower(trim($body['email'] ?? ''));
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) error('Valid email required.');

    $user = DB::fetchOne("SELECT id FROM users WHERE email = ?", [$email]);
    // Always respond OK to prevent email enumeration
    if ($user) {
        $token = bin2hex(random_bytes(32));
        DB::query(
            "UPDATE users SET reset_token = ?, reset_token_expires = DATE_ADD(NOW(), INTERVAL 1 HOUR) WHERE id = ?",
            [$token, $user['id']]
        );
        // In production: email the reset link
        if (APP_ENV === 'development') {
            respond(['reset_token' => $token, 'dev_note' => 'Use with ?action=reset_password']);
        }
    }
    respond(['message' => 'If an account exists, a reset link has been sent.']);
}

// ── RESET PASSWORD ────────────────────────────────────────────
function reset_password(): never {
    $body = get_body();
    validate($body, ['token' => 'required', 'password' => 'required|min:8']);

    $user = DB::fetchOne(
        "SELECT id FROM users WHERE reset_token = ? AND reset_token_expires > NOW()",
        [$body['token']]
    );
    if (!$user) error('Invalid or expired reset token.', 404);

    DB::query(
        "UPDATE users SET password_hash = ?, reset_token = NULL, reset_token_expires = NULL WHERE id = ?",
        [hash_password($body['password']), $user['id']]
    );

    audit((int)$user['id'], 'user.password_reset', 'user', (int)$user['id']);
    respond(['message' => 'Password updated successfully.']);
}

// ── ME (get current user) ─────────────────────────────────────
function me(): never {
    $auth = require_auth();
    $user = DB::fetchOne(
        "SELECT u.id, u.uuid, u.first_name, u.last_name, u.email, u.phone,
                u.role, u.status, u.email_verified, u.last_login, u.created_at,
                sp.shop_name, sp.bio, sp.province, sp.township, sp.language,
                sp.profile_photo, sp.verification_status, sp.wallet_balance,
                sp.wallet_pending, sp.rating_avg, sp.rating_count, sp.total_sales
         FROM users u
         LEFT JOIN seller_profiles sp ON u.id = sp.user_id
         WHERE u.id = ?",
        [$auth['sub']]
    );
    if (!$user) error('User not found.', 404);
    respond($user);
}
