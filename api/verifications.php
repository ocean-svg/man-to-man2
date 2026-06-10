<?php
// ============================================================
//  MzansiMarket — Verifications API
//  File: api/verifications.php
//
//  POST /api/verifications.php             — submit KYC docs (seller)
//  GET  /api/verifications.php             — get my verification status
//  PUT  /api/verifications.php?action=approve&id=1  — admin approve
//  PUT  /api/verifications.php?action=reject&id=1   — admin reject
//  GET  /api/verifications.php?action=queue         — admin: get queue
// ============================================================
require_once __DIR__ . '/../includes/helpers.php';
set_headers();

$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? '';
$id     = isset($_GET['id']) ? (int)$_GET['id'] : 0;

if ($method === 'GET') {
    if ($action === 'queue') verif_queue();
    else get_my_verif();
}
if ($method === 'POST') submit_verif();
if ($method === 'PUT') {
    if ($action === 'approve' && $id) approve_verif($id);
    elseif ($action === 'reject' && $id) reject_verif($id);
    else error('Unknown action.', 404);
}
error('Method not supported.', 405);

function submit_verif(): never {
    $auth = require_role(['seller']);
    $body = get_body();
    validate($body, [
        'sa_id_number'  => 'required',
        'date_of_birth' => 'required',
        'id_front_path' => 'required',
        'selfie_path'   => 'required',
    ]);

    if (!validate_sa_id($body['sa_id_number'])) error('Invalid SA ID number (Luhn check failed).');

    $existing = DB::fetchOne("SELECT id, status FROM verifications WHERE user_id = ?", [$auth['sub']]);
    if ($existing && in_array($existing['status'], ['pending','approved'])) {
        error('Verification already ' . $existing['status'] . '.', 409);
    }

    if ($existing) {
        DB::query(
            "UPDATE verifications SET sa_id_number=?, date_of_birth=?, id_front_path=?, id_back_path=?, selfie_path=?, address_proof_path=?, status='pending', submitted_at=NOW() WHERE user_id=?",
            [$body['sa_id_number'],$body['date_of_birth'],$body['id_front_path'],
             $body['id_back_path']??'',$body['selfie_path'],$body['address_proof_path']??'',$auth['sub']]
        );
    } else {
        DB::query(
            "INSERT INTO verifications (user_id,sa_id_number,date_of_birth,id_front_path,id_back_path,selfie_path,address_proof_path) VALUES (?,?,?,?,?,?,?)",
            [$auth['sub'],$body['sa_id_number'],$body['date_of_birth'],$body['id_front_path'],
             $body['id_back_path']??'',$body['selfie_path'],$body['address_proof_path']??'']
        );
    }
    DB::query("UPDATE seller_profiles SET verification_status='pending' WHERE user_id=?", [$auth['sub']]);
    notify($auth['sub'],'verif.submitted','KYC Submitted','Your identity documents are under review. We\'ll notify you within 24 hours.');
    audit($auth['sub'],'verif.submitted','verification',(int)DB::lastId());
    respond(['message'=>'KYC documents submitted. Review within 24 hours.'],201);
}

function get_my_verif(): never {
    $auth = require_auth();
    $v = DB::fetchOne("SELECT id,status,submitted_at,reviewed_at,rejection_reason FROM verifications WHERE user_id=?",[$auth['sub']]);
    respond($v ?? ['status'=>'not_submitted']);
}

function verif_queue(): never {
    require_role(['admin']);
    [$page,$per_page,$offset] = get_pagination();
    $status = $_GET['status'] ?? 'pending';
    $total  = (int)DB::fetchOne("SELECT COUNT(*) c FROM verifications WHERE status=?",[$status])['c'];
    $items  = DB::fetchAll(
        "SELECT v.*,CONCAT(u.first_name,' ',u.last_name) AS full_name,u.email,sp.shop_name,sp.province,sp.township
         FROM verifications v JOIN users u ON v.user_id=u.id LEFT JOIN seller_profiles sp ON u.id=sp.user_id
         WHERE v.status=? ORDER BY v.submitted_at ASC LIMIT $per_page OFFSET $offset",[$status]);
    respond_list($items,$total,$page,$per_page);
}

function approve_verif(int $id): never {
    $auth = require_role(['admin']);
    $v    = DB::fetchOne("SELECT * FROM verifications WHERE id=?",[$id]);
    if (!$v) error('Verification not found.',404);
    $db = DB::connect(); $db->beginTransaction();
    try {
        DB::query("UPDATE verifications SET status='approved',reviewed_by=?,reviewed_at=NOW() WHERE id=?",[$auth['sub'],$id]);
        DB::query("UPDATE seller_profiles SET verification_status='verified',verified_at=NOW() WHERE user_id=?",[$v['user_id']]);
        notify((int)$v['user_id'],'verif.approved','✅ Verified!','Your identity has been verified. Your trust badge is now live.');
        $db->commit();
    } catch(Exception $e){ $db->rollBack(); error('Failed: '.$e->getMessage(),500); }
    audit($auth['sub'],'verif.approved','verification',$id);
    respond(['message'=>'Seller verified successfully.']);
}

function reject_verif(int $id): never {
    $auth = require_role(['admin']);
    $body = get_body();
    $v    = DB::fetchOne("SELECT * FROM verifications WHERE id=?",[$id]);
    if (!$v) error('Verification not found.',404);
    DB::query("UPDATE verifications SET status='rejected',reviewed_by=?,reviewed_at=NOW(),rejection_reason=? WHERE id=?",
        [$auth['sub'],clean($body['reason']??'Documents unclear or incomplete'),$id]);
    DB::query("UPDATE seller_profiles SET verification_status='rejected' WHERE user_id=?",[$v['user_id']]);
    notify((int)$v['user_id'],'verif.rejected','KYC Rejected','Your verification was rejected. Reason: '.($body['reason']??'Documents unclear').' Please resubmit.');
    audit($auth['sub'],'verif.rejected','verification',$id);
    respond(['message'=>'Verification rejected.']);
}
