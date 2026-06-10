<?php
// ============================================================
//  MzansiMarket — Orders API
//  File: api/orders.php
//
//  POST /api/orders.php               — place order (buyer)
//  GET  /api/orders.php               — list my orders
//  GET  /api/orders.php?action=get&id=1
//  PUT  /api/orders.php?action=dispatch&id=1   — seller confirms dispatch
//  PUT  /api/orders.php?action=confirm&id=1    — buyer confirms receipt
//  PUT  /api/orders.php?action=cancel&id=1     — cancel order
// ============================================================

require_once __DIR__ . '/../includes/helpers.php';
set_headers();

$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? '';
$id     = isset($_GET['id']) ? (int)$_GET['id'] : 0;

if ($method === 'GET') {
    if ($action === 'get' && $id) get_order($id);
    else list_orders();
}
if ($method === 'POST') place_order();
if ($method === 'PUT') {
    if ($action === 'dispatch' && $id) dispatch_order($id);
    elseif ($action === 'confirm' && $id) confirm_order($id);
    elseif ($action === 'cancel'  && $id) cancel_order($id);
    else error('Unknown action.', 404);
}
error('Method not supported.', 405);

// ── LIST MY ORDERS ────────────────────────────────────────────
function list_orders(): never {
    $auth = require_auth();
    [$page, $per_page, $offset] = get_pagination();
    $type = $_GET['type'] ?? 'buyer'; // buyer | seller

    $col    = $type === 'seller' ? 'o.seller_id' : 'o.buyer_id';
    $total  = (int) DB::fetchOne("SELECT COUNT(*) AS c FROM orders o WHERE $col = ?", [$auth['sub']])['c'];
    $orders = DB::fetchAll(
        "SELECT o.id, o.order_number, o.amount, o.status,
                o.delivery_option, o.created_at, o.confirmed_at,
                l.title AS listing_title, l.image_1 AS listing_image,
                e.status AS escrow_status,
                CONCAT(buyer.first_name,' ',buyer.last_name)  AS buyer_name,
                CONCAT(seller.first_name,' ',seller.last_name) AS seller_name,
                sp.shop_name
         FROM orders o
         JOIN listings l       ON o.listing_id = l.id
         JOIN users buyer      ON o.buyer_id   = buyer.id
         JOIN users seller     ON o.seller_id  = seller.id
         JOIN seller_profiles sp ON seller.id  = sp.user_id
         LEFT JOIN escrow e    ON o.id          = e.order_id
         WHERE $col = ?
         ORDER BY o.created_at DESC
         LIMIT $per_page OFFSET $offset",
        [$auth['sub']]
    );
    respond_list($orders, $total, $page, $per_page);
}

// ── GET SINGLE ORDER ─────────────────────────────────────────
function get_order(int $id): never {
    $auth  = require_auth();
    $order = DB::fetchOne(
        "SELECT o.*, l.title AS listing_title, l.image_1,
                e.status AS escrow_status, e.held_at, e.released_at,
                CONCAT(b.first_name,' ',b.last_name) AS buyer_name, b.phone AS buyer_phone,
                CONCAT(s.first_name,' ',s.last_name) AS seller_name,
                sp.shop_name
         FROM orders o
         JOIN listings l       ON o.listing_id = l.id
         JOIN users b          ON o.buyer_id   = b.id
         JOIN users s          ON o.seller_id  = s.id
         JOIN seller_profiles sp ON s.id       = sp.user_id
         LEFT JOIN escrow e    ON o.id          = e.order_id
         WHERE o.id = ?",
        [$id]
    );
    if (!$order) error('Order not found.', 404);

    // Ensure user is buyer, seller, or admin
    if (!in_array($auth['role'], ['admin']) &&
        (int)$order['buyer_id'] !== $auth['sub'] &&
        (int)$order['seller_id'] !== $auth['sub']) {
        error('Access denied.', 403);
    }
    respond($order);
}

// ── PLACE ORDER ───────────────────────────────────────────────
function place_order(): never {
    $auth = require_role(['buyer', 'seller', 'admin']);
    $body = get_body();
    validate($body, [
        'listing_id'      => 'required|numeric',
        'delivery_option' => 'required|in:courier,pickup',
    ]);

    $listing_id = (int)$body['listing_id'];
    $listing    = DB::fetchOne(
        "SELECT l.*, u.status AS seller_status FROM listings l JOIN users u ON l.seller_id = u.id WHERE l.id = ? AND l.status = 'active'",
        [$listing_id]
    );
    if (!$listing) error('Listing not found or not available.', 404);
    if ((int)$listing['seller_id'] === $auth['sub']) error('You cannot buy your own listing.', 422);

    $fee    = $listing['price'] * FEE_STARTER;
    $payout = $listing['price'] - $fee;

    // Generate order number
    $order_num = 'ORD-' . strtoupper(substr(md5(uniqid()), 0, 6));

    $db = DB::connect();
    $db->beginTransaction();
    try {
        DB::query(
            "INSERT INTO orders (order_number, listing_id, buyer_id, seller_id, amount, platform_fee, seller_payout,
              delivery_option, delivery_address, status, paid_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'paid', NOW())",
            [
                $order_num,
                $listing_id,
                $auth['sub'],
                (int)$listing['seller_id'],
                $listing['price'],
                $fee,
                $payout,
                $body['delivery_option'],
                clean($body['delivery_address'] ?? ''),
            ]
        );
        $order_id = (int) DB::lastId();

        // Create escrow record
        DB::query(
            "INSERT INTO escrow (order_id, amount, status) VALUES (?, ?, 'held')",
            [$order_id, $listing['price']]
        );

        // Hold pending in seller wallet
        DB::query(
            "UPDATE seller_profiles SET wallet_pending = wallet_pending + ? WHERE user_id = ?",
            [$payout, (int)$listing['seller_id']]
        );

        // Mark listing as sold
        DB::query("UPDATE listings SET status = 'sold' WHERE id = ?", [$listing_id]);

        // Wallet transaction — escrow hold
        DB::query(
            "INSERT INTO wallet_transactions (user_id, order_id, type, amount, balance_after, description, status)
             SELECT ?, ?, 'escrow_hold', ?, wallet_balance, CONCAT('Escrow hold — ', ?), 'completed'
             FROM seller_profiles WHERE user_id = ?",
            [(int)$listing['seller_id'], $order_id, $payout, $order_num, (int)$listing['seller_id']]
        );

        // Notify seller
        notify((int)$listing['seller_id'], 'order.new', 'New Order!',
            "You have a new order for \"{$listing['title']}\" — R" . number_format($listing['price'], 2),
            ['order_id' => $order_id, 'order_number' => $order_num]);

        $db->commit();
    } catch (Exception $e) {
        $db->rollBack();
        error('Failed to place order: ' . $e->getMessage(), 500);
    }

    audit($auth['sub'], 'order.placed', 'order', $order_id);
    respond(['order_id' => $order_id, 'order_number' => $order_num, 'escrow_amount' => $listing['price']], 201);
}

// ── DISPATCH ORDER (seller) ───────────────────────────────────
function dispatch_order(int $id): never {
    $auth  = require_role(['seller','admin']);
    $order = DB::fetchOne("SELECT * FROM orders WHERE id = ? AND seller_id = ?", [$id, $auth['sub']]);
    if (!$order && $auth['role'] !== 'admin') error('Order not found.', 404);
    if (!$order) $order = DB::fetchOne("SELECT * FROM orders WHERE id = ?", [$id]);
    if (!$order) error('Order not found.', 404);
    if ($order['status'] !== 'paid') error('Order cannot be dispatched in its current state.');

    $body = get_body();
    DB::query(
        "UPDATE orders SET status = 'dispatched', dispatched_at = NOW(), courier_tracking = ? WHERE id = ?",
        [clean($body['tracking'] ?? ''), $id]
    );
    notify((int)$order['buyer_id'], 'order.dispatched', 'Your order is on its way!',
        "Your order #{$order['order_number']} has been dispatched.",
        ['order_id' => $id]);

    audit($auth['sub'], 'order.dispatched', 'order', $id);
    respond(['message' => 'Order marked as dispatched.']);
}

// ── CONFIRM RECEIPT (buyer) ───────────────────────────────────
function confirm_order(int $id): never {
    $auth  = require_role(['buyer','admin']);
    $order = DB::fetchOne("SELECT * FROM orders WHERE id = ?", [$id]);
    if (!$order) error('Order not found.', 404);
    if ($auth['role'] !== 'admin' && (int)$order['buyer_id'] !== $auth['sub']) error('Access denied.', 403);
    if (!in_array($order['status'], ['dispatched','delivered'])) error('Order is not ready for confirmation.');

    $db = DB::connect();
    $db->beginTransaction();
    try {
        // Release escrow
        DB::query("CALL release_escrow(?, ?)", [$id, null]);
        notify((int)$order['seller_id'], 'escrow.released', 'Payment released!',
            "Buyer confirmed receipt. R" . number_format($order['seller_payout'], 2) . " added to your wallet.",
            ['order_id' => $id]);
        $db->commit();
    } catch (Exception $e) {
        $db->rollBack();
        error('Failed to confirm order: ' . $e->getMessage(), 500);
    }

    audit($auth['sub'], 'order.confirmed', 'order', $id);
    respond(['message' => 'Receipt confirmed. Seller payment released.']);
}

// ── CANCEL ORDER ─────────────────────────────────────────────
function cancel_order(int $id): never {
    $auth  = require_auth();
    $order = DB::fetchOne("SELECT * FROM orders WHERE id = ?", [$id]);
    if (!$order) error('Order not found.', 404);
    if ($auth['role'] !== 'admin' &&
        (int)$order['buyer_id'] !== $auth['sub'] &&
        (int)$order['seller_id'] !== $auth['sub']) {
        error('Access denied.', 403);
    }
    if (!in_array($order['status'], ['pending_payment','paid'])) error('Order cannot be cancelled at this stage.');

    $body = get_body();
    $db   = DB::connect();
    $db->beginTransaction();
    try {
        DB::query("UPDATE orders SET status = 'cancelled', cancelled_at = NOW(), cancel_reason = ? WHERE id = ?",
            [clean($body['reason'] ?? ''), $id]);
        DB::query("UPDATE escrow SET status = 'refunded' WHERE order_id = ?", [$id]);
        DB::query("UPDATE listings SET status = 'active' WHERE id = ?", [$order['listing_id']]);
        DB::query("UPDATE seller_profiles SET wallet_pending = GREATEST(0, wallet_pending - ?) WHERE user_id = ?",
            [$order['seller_payout'], $order['seller_id']]);
        $db->commit();
    } catch (Exception $e) {
        $db->rollBack();
        error('Cancellation failed: ' . $e->getMessage(), 500);
    }

    audit($auth['sub'], 'order.cancelled', 'order', $id);
    respond(['message' => 'Order cancelled and escrow refunded.']);
}
