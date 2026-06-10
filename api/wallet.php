<?php
require_once __DIR__ . '/../includes/helpers.php';
set_headers();
$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? '';
if ($method === 'GET') get_wallet();
if ($method === 'POST' && $action === 'withdraw') withdraw();
error('Method not supported.', 405);

function get_wallet(): never {
    $auth = require_auth();
    $sp = DB::fetchOne("SELECT wallet_balance, wallet_pending FROM seller_profiles WHERE user_id = ?", [$auth['sub']]);
    if (!$sp) error('Wallet not found.', 404);
    $txns = DB::fetchAll(
        "SELECT id, type, amount, balance_after, description, status, reference, created_at
         FROM wallet_transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT 50",
        [$auth['sub']]
    );
    respond(['balance' => $sp['wallet_balance'], 'pending' => $sp['wallet_pending'], 'transactions' => $txns]);
}

function withdraw(): never {
    $auth = require_role(['seller']);
    $body = get_body();
    $amt  = (float)($body['amount'] ?? 0);
    if ($amt <= 0) error('Invalid amount.');
    $sp = DB::fetchOne("SELECT wallet_balance FROM seller_profiles WHERE user_id = ?", [$auth['sub']]);
    if (!$sp || $sp['wallet_balance'] < $amt) error('Insufficient balance.');
    $db = DB::connect(); $db->beginTransaction();
    try {
        DB::query("UPDATE seller_profiles SET wallet_balance = wallet_balance - ? WHERE user_id = ?", [$amt, $auth['sub']]);
        $newBal = $sp['wallet_balance'] - $amt;
        DB::query("INSERT INTO wallet_transactions (user_id, type, amount, balance_after, description, status) VALUES (?, 'withdrawal', ?, ?, 'Withdrawal to bank account', 'completed')",
            [$auth['sub'], -$amt, $newBal]);
        $db->commit();
    } catch (Exception $e) { $db->rollBack(); error('Withdrawal failed: '.$e->getMessage(), 500); }
    audit($auth['sub'], 'wallet.withdrawal', 'user', $auth['sub']);
    respond(['message' => 'Withdrawal initiated. Arrives in 1-2 business days.', 'new_balance' => $newBal]);
}
