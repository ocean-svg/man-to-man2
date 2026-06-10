<?php
require_once __DIR__ . '/../includes/helpers.php';
set_headers();
$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? '';
$id     = isset($_GET['id']) ? (int)$_GET['id'] : 0;
if ($method === 'GET')                       list_disputes();
if ($method === 'POST')                      open_dispute();
if ($method === 'PUT' && $action === 'resolve' && $id) resolve_dispute($id);
error('Not supported.', 405);

function list_disputes(): never {
    $auth   = require_auth();
    $status = $_GET['status'] ?? 'open';
    [$page, $per_page, $offset] = get_pagination();
    $where  = $auth['role'] === 'admin' ? "WHERE d.status = ?" : "WHERE d.status = ? AND (o.buyer_id = ? OR o.seller_id = ?)";
    $params = $auth['role'] === 'admin' ? [$status] : [$status, $auth['sub'], $auth['sub']];
    $total  = (int)DB::fetchOne("SELECT COUNT(*) c FROM disputes d JOIN orders o ON d.order_id=o.id $where", $params)['c'];
    $items  = DB::fetchAll(
        "SELECT d.id, d.dispute_number, d.reason, d.status, d.opened_at,
                o.order_number, o.amount, l.title AS listing_title,
                CONCAT(bu.first_name,' ',bu.last_name) AS buyer_name,
                CONCAT(su.first_name,' ',su.last_name) AS seller_name,
                sp.shop_name
         FROM disputes d
         JOIN orders o ON d.order_id=o.id
         JOIN listings l ON o.listing_id=l.id
         JOIN users bu ON o.buyer_id=bu.id
         JOIN users su ON o.seller_id=su.id
         JOIN seller_profiles sp ON su.id=sp.user_id
         $where ORDER BY d.opened_at DESC LIMIT $per_page OFFSET $offset", $params);
    respond_list($items, $total, $page, $per_page);
}

function open_dispute(): never {
    $auth = require_role(['buyer', 'admin']);
    $body = get_body();
    validate($body, ['order_id' => 'required|numeric', 'reason' => 'required']);
    $order = DB::fetchOne("SELECT * FROM orders WHERE id = ?", [(int)$body['order_id']]);
    if (!$order) error('Order not found.', 404);
    if ($auth['role'] !== 'admin' && (int)$order['buyer_id'] !== $auth['sub']) error('Access denied.', 403);
    if ($order['status'] === 'disputed') error('Dispute already open for this order.');
    $num = 'DIS-'.strtoupper(substr(md5(uniqid()),0,6));
    DB::query("INSERT INTO disputes (dispute_number, order_id, raised_by, reason, description) VALUES (?,?,?,?,?)",
        [$num, $body['order_id'], $auth['sub'], $body['reason'], clean($body['description']??'')]);
    DB::query("UPDATE orders SET status='disputed' WHERE id=?", [$body['order_id']]);
    $new_id = (int)DB::lastId();
    notify((int)$order['seller_id'],'dispute.opened','Dispute opened',"A dispute was raised on order {$order['order_number']}.");
    audit($auth['sub'],'dispute.opened','dispute',$new_id);
    respond(['dispute_number' => $num, 'id' => $new_id], 201);
}

function resolve_dispute(int $id): never {
    $auth   = require_role(['admin']);
    $body   = get_body();
    $favour = $body['favour'] ?? 'buyer';
    $notes  = clean($body['notes'] ?? '');
    $d = DB::fetchOne("SELECT * FROM disputes WHERE id=?", [$id]);
    if (!$d) error('Dispute not found.', 404);
    $order = DB::fetchOne("SELECT * FROM orders WHERE id=?", [$d['order_id']]);
    $status = $favour === 'seller' ? 'resolved_seller' : 'resolved_buyer';
    $db = DB::connect(); $db->beginTransaction();
    try {
        DB::query("UPDATE disputes SET status=?,resolved_by=?,resolution_notes=?,resolved_at=NOW() WHERE id=?",
            [$status, $auth['sub'], $notes, $id]);
        if ($favour === 'seller') {
            DB::query("CALL release_escrow(?,?)", [$d['order_id'], $auth['sub']]);
            DB::query("UPDATE orders SET status='confirmed',confirmed_at=NOW() WHERE id=?", [$d['order_id']]);
        } else {
            DB::query("UPDATE escrow SET status='refunded' WHERE order_id=?", [$d['order_id']]);
            DB::query("UPDATE orders SET status='refunded' WHERE id=?", [$d['order_id']]);
            DB::query("UPDATE seller_profiles SET wallet_pending=GREATEST(0,wallet_pending-?) WHERE user_id=?",
                [$order['seller_payout'], $order['seller_id']]);
        }
        $db->commit();
    } catch(Exception $e) { $db->rollBack(); error('Resolve failed: '.$e->getMessage(), 500); }
    notify((int)$order['buyer_id'], 'dispute.resolved', 'Dispute resolved', "Your dispute has been resolved in favour of the $favour.");
    notify((int)$order['seller_id'],'dispute.resolved', 'Dispute resolved', "Dispute resolved in favour of the $favour.");
    audit($auth['sub'], 'dispute.resolved', 'dispute', $id);
    respond(['message' => "Resolved in favour of $favour."]);
}
