<?php
// ============================================================
//  MzansiMarket — Listings API
//  File: api/listings.php
//
//  GET    /api/listings.php               — browse / search
//  GET    /api/listings.php?action=get&id=1
//  POST   /api/listings.php               — create (seller auth)
//  PUT    /api/listings.php?id=1          — update (seller auth)
//  DELETE /api/listings.php?id=1          — delete (seller auth)
//  POST   /api/listings.php?action=save   — save to wishlist
//  POST   /api/listings.php?action=view   — increment view count
// ============================================================

require_once __DIR__ . '/../includes/helpers.php';
set_headers();

$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? '';
$id     = isset($_GET['id']) ? (int)$_GET['id'] : 0;

if ($method === 'GET') {
    if ($action === 'get' && $id) get_listing($id);
    else browse_listings();
}

if ($method === 'POST') {
    if ($action === 'save') save_listing();
    elseif ($action === 'view') increment_view();
    else create_listing();
}

if ($method === 'PUT'    && $id) update_listing($id);
if ($method === 'DELETE' && $id) delete_listing($id);

error('Method or action not supported.', 405);

// ── BROWSE / SEARCH ───────────────────────────────────────────
function browse_listings(): never {
    [$page, $per_page, $offset] = get_pagination();
    $q        = $_GET;
    $where    = ["l.status = 'active'", "u.status = 'active'"];
    $params   = [];

    // Full-text search
    if (!empty($q['search'])) {
        $where[]  = "MATCH(l.title, l.description) AGAINST(? IN BOOLEAN MODE)";
        $params[] = $q['search'] . '*';
    }

    // Category filter
    if (!empty($q['category'])) {
        $where[]  = "c.slug = ?";
        $params[] = $q['category'];
    }

    // Province filter
    if (!empty($q['province'])) {
        $where[]  = "l.province = ?";
        $params[] = $q['province'];
    }

    // Verified sellers only
    if (!empty($q['verified_only']) && $q['verified_only'] === '1') {
        $where[] = "sp.verification_status = 'verified'";
    }

    // Price range
    if (!empty($q['price_min']) && is_numeric($q['price_min'])) {
        $where[]  = "l.price >= ?";
        $params[] = (float) $q['price_min'];
    }
    if (!empty($q['price_max']) && is_numeric($q['price_max'])) {
        $where[]  = "l.price <= ?";
        $params[] = (float) $q['price_max'];
    }

    // Condition filter
    if (!empty($q['condition']) && in_array($q['condition'], ['New','Good','Fair'])) {
        $where[]  = "l.`condition` = ?";
        $params[] = $q['condition'];
    }

    // Delivery filter
    if (!empty($q['delivery']) && in_array($q['delivery'], ['courier','pickup','both'])) {
        $where[]  = "(l.delivery_option = ? OR l.delivery_option = 'both')";
        $params[] = $q['delivery'];
    }

    $where_sql = 'WHERE ' . implode(' AND ', $where);

    // Sorting
    $sort = match($q['sort'] ?? 'recent') {
        'price_asc'  => 'l.price ASC',
        'price_desc' => 'l.price DESC',
        'trusted'    => "sp.verification_status = 'verified' DESC, l.created_at DESC",
        'popular'    => 'l.views DESC',
        default      => 'l.created_at DESC',
    };

    // Count total
    $total = (int) DB::fetchOne(
        "SELECT COUNT(*) AS cnt
         FROM listings l
         JOIN categories c  ON l.category_id = c.id
         JOIN users u        ON l.seller_id   = u.id
         JOIN seller_profiles sp ON u.id     = sp.user_id
         $where_sql",
        $params
    )['cnt'];

    // Fetch listings
    $items = DB::fetchAll(
        "SELECT
           l.id, l.uuid, l.title, l.price, l.`condition`,
           l.delivery_option, l.province, l.township,
           l.image_1, l.image_2, l.image_3,
           l.views, l.saves, l.created_at,
           c.name AS category_name, c.slug AS category_slug, c.icon AS category_icon,
           sp.shop_name, sp.verification_status, sp.rating_avg, sp.rating_count,
           u.id AS seller_id
         FROM listings l
         JOIN categories c       ON l.category_id = c.id
         JOIN users u            ON l.seller_id   = u.id
         JOIN seller_profiles sp ON u.id          = sp.user_id
         $where_sql
         ORDER BY $sort
         LIMIT $per_page OFFSET $offset",
        $params
    );

    respond_list($items, $total, $page, $per_page);
}

// ── GET SINGLE LISTING ────────────────────────────────────────
function get_listing(int $id): never {
    $listing = DB::fetchOne(
        "SELECT
           l.*,
           c.name AS category_name, c.slug AS category_slug, c.icon AS category_icon,
           u.id AS seller_user_id,
           sp.shop_name, sp.bio AS seller_bio, sp.province AS seller_province,
           sp.township AS seller_township, sp.profile_photo AS seller_photo,
           sp.verification_status, sp.rating_avg, sp.rating_count, sp.total_sales
         FROM listings l
         JOIN categories c       ON l.category_id = c.id
         JOIN users u            ON l.seller_id   = u.id
         JOIN seller_profiles sp ON u.id          = sp.user_id
         WHERE l.id = ? AND l.status = 'active'",
        [$id]
    );
    if (!$listing) error('Listing not found.', 404);

    // Recent reviews for this seller (latest 5)
    $reviews = DB::fetchAll(
        "SELECT r.rating, r.comment, r.created_at,
                CONCAT(u.first_name, ' ', LEFT(u.last_name,1), '.') AS reviewer
         FROM reviews r JOIN users u ON r.reviewer_id = u.id
         WHERE r.seller_id = ? ORDER BY r.created_at DESC LIMIT 5",
        [$listing['seller_user_id']]
    );
    $listing['recent_reviews'] = $reviews;

    respond($listing);
}

// ── CREATE LISTING ────────────────────────────────────────────
function create_listing(): never {
    $auth = require_role(['seller', 'admin']);
    $body = get_body();

    validate($body, [
        'category_id'     => 'required|numeric',
        'title'           => 'required|min:5|max:300',
        'price'           => 'required|numeric',
        'condition'       => 'required|in:New,Good,Fair',
        'delivery_option' => 'required|in:courier,pickup,both',
    ]);

    // Verify seller profile exists
    $seller = DB::fetchOne("SELECT id FROM seller_profiles WHERE user_id = ?", [$auth['sub']]);
    if (!$seller && $auth['role'] !== 'admin') error('Seller profile not found.', 403);

    // Verify category exists
    $cat = DB::fetchOne("SELECT id FROM categories WHERE id = ? AND active = 1", [$body['category_id']]);
    if (!$cat) error('Invalid category.', 422);

    $uuid = sprintf('%04x%04x-%04x-%04x-%04x-%04x%04x%04x',
        mt_rand(0,0xffff), mt_rand(0,0xffff), mt_rand(0,0xffff),
        mt_rand(0,0x0fff)|0x4000, mt_rand(0,0x3fff)|0x8000,
        mt_rand(0,0xffff), mt_rand(0,0xffff), mt_rand(0,0xffff)
    );

    DB::query(
        "INSERT INTO listings (uuid, seller_id, category_id, title, description, price,
          `condition`, delivery_option, province, township, image_1, image_2, image_3)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [
            $uuid,
            $auth['sub'],
            (int) $body['category_id'],
            clean($body['title']),
            clean($body['description'] ?? ''),
            (float) $body['price'],
            $body['condition'],
            $body['delivery_option'],
            clean($body['province']  ?? ''),
            clean($body['township']  ?? ''),
            clean($body['image_1']   ?? ''),
            clean($body['image_2']   ?? ''),
            clean($body['image_3']   ?? ''),
        ]
    );
    $new_id = (int) DB::lastId();

    audit($auth['sub'], 'listing.created', 'listing', $new_id, [], $body);
    respond(['id' => $new_id, 'uuid' => $uuid, 'message' => 'Listing created successfully.'], 201);
}

// ── UPDATE LISTING ────────────────────────────────────────────
function update_listing(int $id): never {
    $auth    = require_role(['seller', 'admin']);
    $listing = DB::fetchOne("SELECT * FROM listings WHERE id = ?", [$id]);
    if (!$listing) error('Listing not found.', 404);

    // Sellers can only edit their own
    if ($auth['role'] !== 'admin' && (int)$listing['seller_id'] !== $auth['sub']) {
        error('You do not have permission to edit this listing.', 403);
    }

    $body   = get_body();
    $fields = [];
    $params = [];

    $allowed = ['title','description','price','condition','delivery_option','province','township','image_1','image_2','image_3','status'];
    foreach ($allowed as $f) {
        if (isset($body[$f])) {
            $fields[] = "`$f` = ?";
            $params[] = in_array($f, ['price']) ? (float)$body[$f] : clean((string)$body[$f]);
        }
    }
    if (empty($fields)) error('No fields to update.');

    $params[] = $id;
    DB::query("UPDATE listings SET " . implode(', ', $fields) . " WHERE id = ?", $params);

    audit($auth['sub'], 'listing.updated', 'listing', $id, $listing, $body);
    respond(['message' => 'Listing updated successfully.']);
}

// ── DELETE LISTING ────────────────────────────────────────────
function delete_listing(int $id): never {
    $auth    = require_role(['seller', 'admin']);
    $listing = DB::fetchOne("SELECT seller_id FROM listings WHERE id = ?", [$id]);
    if (!$listing) error('Listing not found.', 404);

    if ($auth['role'] !== 'admin' && (int)$listing['seller_id'] !== $auth['sub']) {
        error('Permission denied.', 403);
    }

    DB::query("UPDATE listings SET status = 'removed' WHERE id = ?", [$id]);
    audit($auth['sub'], 'listing.removed', 'listing', $id);
    respond(['message' => 'Listing removed.']);
}

// ── SAVE TO WISHLIST ──────────────────────────────────────────
function save_listing(): never {
    $auth = require_auth();
    $body = get_body();
    $lid  = (int)($body['listing_id'] ?? 0);
    if (!$lid) error('listing_id required.');

    $existing = DB::fetchOne(
        "SELECT id FROM saved_listings WHERE user_id = ? AND listing_id = ?",
        [$auth['sub'], $lid]
    );

    if ($existing) {
        DB::query("DELETE FROM saved_listings WHERE user_id = ? AND listing_id = ?", [$auth['sub'], $lid]);
        DB::query("UPDATE listings SET saves = GREATEST(0, saves - 1) WHERE id = ?", [$lid]);
        respond(['saved' => false, 'message' => 'Removed from wishlist.']);
    } else {
        DB::query("INSERT INTO saved_listings (user_id, listing_id) VALUES (?, ?)", [$auth['sub'], $lid]);
        DB::query("UPDATE listings SET saves = saves + 1 WHERE id = ?", [$lid]);
        respond(['saved' => true, 'message' => 'Added to wishlist.']);
    }
}

// ── INCREMENT VIEW ────────────────────────────────────────────
function increment_view(): never {
    $body = get_body();
    $lid  = (int)($body['listing_id'] ?? 0);
    if (!$lid) error('listing_id required.');
    DB::query("UPDATE listings SET views = views + 1 WHERE id = ? AND status = 'active'", [$lid]);
    respond(['message' => 'View recorded.']);
}
