<?php
require_once __DIR__ . '/../includes/helpers.php';
set_headers();
$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? '';
if ($method === 'GET')  list_reviews();
if ($method === 'POST') submit_review();
error('Not supported.', 405);
function list_reviews(): never {
    $sid = isset($_GET['seller_id']) ? (int)$_GET['seller_id'] : 0;
    if (!$sid) error('seller_id required.');
    [$page,$per_page,$offset] = get_pagination();
    $total = (int)DB::fetchOne("SELECT COUNT(*) c FROM reviews WHERE seller_id=?",[$sid])['c'];
    $items = DB::fetchAll("SELECT r.id,r.rating,r.comment,r.created_at,CONCAT(u.first_name,' ',LEFT(u.last_name,1),'.') AS reviewer FROM reviews r JOIN users u ON r.reviewer_id=u.id WHERE r.seller_id=? ORDER BY r.created_at DESC LIMIT $per_page OFFSET $offset",[$sid]);
    respond_list($items,$total,$page,$per_page);
}
function submit_review(): never {
    $auth = require_role(['buyer']);
    $body = get_body();
    validate($body,['order_id'=>'required|numeric','rating'=>'required|numeric']);
    $rating = max(1,min(5,(int)$body['rating']));
    $order  = DB::fetchOne("SELECT * FROM orders WHERE id=? AND buyer_id=? AND status='confirmed'",[(int)$body['order_id'],$auth['sub']]);
    if (!$order) error('Order not found or not yet confirmed.',404);
    if (DB::fetchOne("SELECT id FROM reviews WHERE order_id=?",[(int)$body['order_id']])) error('Review already submitted for this order.',409);
    DB::query("INSERT INTO reviews (order_id,reviewer_id,seller_id,rating,comment) VALUES (?,?,?,?,?)",
        [$body['order_id'],$auth['sub'],$order['seller_id'],$rating,clean($body['comment']??'')]);
    DB::query("CALL update_seller_rating(?)",[$order['seller_id']]);
    audit($auth['sub'],'review.submitted','review',(int)DB::lastId());
    respond(['message'=>'Review submitted. Thank you!'],201);
}
