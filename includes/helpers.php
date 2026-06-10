<?php
// ============================================================
//  MzansiMarket — Shared Helpers & Middleware
//  File: includes/helpers.php
// ============================================================

require_once __DIR__ . '/../config/db.php';

// ── CORS & JSON headers ──────────────────────────────────────
function set_headers(): void {
    header('Content-Type: application/json; charset=UTF-8');
    header('Access-Control-Allow-Origin: *');
    header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type, Authorization');
    if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
        http_response_code(204);
        exit;
    }
}

// ── Response helpers ─────────────────────────────────────────
function respond(mixed $data, int $code = 200): never {
    http_response_code($code);
    echo json_encode(['success' => true, 'data' => $data], JSON_UNESCAPED_UNICODE);
    exit;
}

function respond_list(array $items, int $total, int $page, int $per_page): never {
    http_response_code(200);
    echo json_encode([
        'success'    => true,
        'data'       => $items,
        'pagination' => [
            'total'    => $total,
            'page'     => $page,
            'per_page' => $per_page,
            'pages'    => (int) ceil($total / $per_page),
        ]
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

function error(string $message, int $code = 400, array $errors = []): never {
    http_response_code($code);
    $body = ['success' => false, 'message' => $message];
    if (!empty($errors)) $body['errors'] = $errors;
    echo json_encode($body, JSON_UNESCAPED_UNICODE);
    exit;
}

// ── Request body ─────────────────────────────────────────────
function get_body(): array {
    $raw = file_get_contents('php://input');
    return json_decode($raw, true) ?? [];
}

function get_query(): array {
    return $_GET;
}

// ── JWT ──────────────────────────────────────────────────────
function jwt_encode(array $payload): string {
    $header  = base64url_encode(json_encode(['alg' => 'HS256', 'typ' => 'JWT']));
    $payload['iat'] = time();
    $payload['exp'] = time() + JWT_EXPIRE;
    $pl      = base64url_encode(json_encode($payload));
    $sig     = base64url_encode(hash_hmac('sha256', "$header.$pl", JWT_SECRET, true));
    return "$header.$pl.$sig";
}

function jwt_decode(string $token): ?array {
    $parts = explode('.', $token);
    if (count($parts) !== 3) return null;
    [$header, $payload, $sig] = $parts;
    $expected = base64url_encode(hash_hmac('sha256', "$header.$payload", JWT_SECRET, true));
    if (!hash_equals($expected, $sig)) return null;
    $data = json_decode(base64url_decode($payload), true);
    if (!$data || $data['exp'] < time()) return null;
    return $data;
}

function base64url_encode(string $data): string {
    return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
}
function base64url_decode(string $data): string {
    return base64_decode(strtr($data, '-_', '+/') . str_repeat('=', (4 - strlen($data) % 4) % 4));
}

// ── Auth middleware ───────────────────────────────────────────
function require_auth(): array {
    $auth = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
    if (!preg_match('/Bearer\s+(.+)/i', $auth, $m)) {
        error('Authentication required.', 401);
    }
    $payload = jwt_decode($m[1]);
    if (!$payload) error('Invalid or expired token.', 401);
    return $payload;
}

function require_role(array $allowed_roles): array {
    $auth = require_auth();
    if (!in_array($auth['role'], $allowed_roles)) {
        error('Insufficient permissions.', 403);
    }
    return $auth;
}

function optional_auth(): ?array {
    $auth = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
    if (!preg_match('/Bearer\s+(.+)/i', $auth, $m)) return null;
    return jwt_decode($m[1]);
}

// ── Validation ────────────────────────────────────────────────
function validate(array $data, array $rules): array {
    $errors = [];
    foreach ($rules as $field => $rule_str) {
        $rules_list = explode('|', $rule_str);
        $value = $data[$field] ?? null;
        foreach ($rules_list as $rule) {
            if ($rule === 'required' && ($value === null || $value === '')) {
                $errors[$field] = "$field is required.";
                break;
            }
            if ($rule === 'email' && $value && !filter_var($value, FILTER_VALIDATE_EMAIL)) {
                $errors[$field] = "$field must be a valid email.";
                break;
            }
            if (str_starts_with($rule, 'min:')) {
                $min = (int) substr($rule, 4);
                if ($value && strlen((string)$value) < $min)
                    $errors[$field] = "$field must be at least $min characters.";
            }
            if (str_starts_with($rule, 'max:')) {
                $max = (int) substr($rule, 4);
                if ($value && strlen((string)$value) > $max)
                    $errors[$field] = "$field must not exceed $max characters.";
            }
            if ($rule === 'numeric' && $value !== null && !is_numeric($value)) {
                $errors[$field] = "$field must be a number.";
            }
            if (str_starts_with($rule, 'in:')) {
                $options = explode(',', substr($rule, 3));
                if ($value && !in_array($value, $options))
                    $errors[$field] = "$field must be one of: " . implode(', ', $options);
            }
        }
    }
    if (!empty($errors)) error('Validation failed.', 422, $errors);
    return $data;
}

// ── Pagination ────────────────────────────────────────────────
function get_pagination(): array {
    $page     = max(1, (int)($_GET['page'] ?? 1));
    $per_page = min(100, max(1, (int)($_GET['per_page'] ?? 20)));
    $offset   = ($page - 1) * $per_page;
    return [$page, $per_page, $offset];
}

// ── Password ──────────────────────────────────────────────────
function hash_password(string $pw): string {
    return password_hash($pw, PASSWORD_BCRYPT, ['cost' => 12]);
}
function verify_password(string $pw, string $hash): bool {
    return password_verify($pw, $hash);
}

// ── Sanitize ──────────────────────────────────────────────────
function clean(string $str): string {
    return htmlspecialchars(strip_tags(trim($str)), ENT_QUOTES, 'UTF-8');
}

// ── SA ID number validation ───────────────────────────────────
function validate_sa_id(string $id): bool {
    if (!preg_match('/^\d{13}$/', $id)) return false;
    // Luhn check
    $sum = 0;
    for ($i = 0; $i < 13; $i++) {
        $d = (int)$id[$i];
        if ($i % 2 === 0) $sum += $d;
        else { $d *= 2; $sum += $d > 9 ? $d - 9 : $d; }
    }
    return $sum % 10 === 0;
}

// ── Audit log helper ─────────────────────────────────────────
function audit(int $user_id, string $action, string $target_type = '', int $target_id = 0, array $old = [], array $new = []): void {
    try {
        DB::query(
            "INSERT INTO audit_log (user_id, action, target_type, target_id, old_value, new_value, ip_address, user_agent)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            [
                $user_id, $action, $target_type, $target_id ?: null,
                $old ? json_encode($old) : null,
                $new  ? json_encode($new)  : null,
                $_SERVER['REMOTE_ADDR'] ?? null,
                $_SERVER['HTTP_USER_AGENT'] ?? null,
            ]
        );
    } catch (Exception) {
        // Non-fatal — never break the main flow
    }
}

// ── Notify user ───────────────────────────────────────────────
function notify(int $user_id, string $type, string $title, string $message, array $data = []): void {
    try {
        DB::query(
            "INSERT INTO notifications (user_id, type, title, message, data)
             VALUES (?, ?, ?, ?, ?)",
            [$user_id, $type, $title, $message, $data ? json_encode($data) : null]
        );
    } catch (Exception) {}
}
