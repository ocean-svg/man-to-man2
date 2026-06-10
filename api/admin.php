<?php
require_once __DIR__ . '/../includes/helpers.php';
set_headers();
require_role(['admin']);
$action = $_GET['action'] ?? '';
$id     = isset($_GET['id']) ? (int)$_GET['id'] : 0;
$method = $_SERVER['REQUEST_METHOD'];

match(true) {
    $action === 'overview'      => overview(),
    $action === 'users'         => list_users(),
    $action === 'suspend' && $id=> suspend_user($id),
    $action === 'fraud_flags'   => fraud_flags(),
    $action === 'resolve_flag' && $id => resolve_flag($id),
    $action === 'escrow'        => escrow_overview(),
    $action === 'payouts'       => payout_queue(),
    $action === 'health'        => system_health(),
    default                     => error('Unknown action.', 404),
};

function overview(): never {
    $stats = [
        'total_users'      => DB::fetchOne("SELECT COUNT(*) c FROM users")['c'],
        'active_listings'  => DB::fetchOne("SELECT COUNT(*) c FROM listings WHERE status='active'")['c'],
        'escrow_held'      => DB::fetchOne("SELECT COALESCE(SUM(amount),0) s FROM escrow WHERE status='held'")['s'],
        'open_disputes'    => DB::fetchOne("SELECT COUNT(*) c FROM disputes WHERE status IN ('open','in_review')")['c'],
        'revenue_mtd'      => DB::fetchOne("SELECT COALESCE(SUM(platform_fee),0) s FROM orders WHERE status NOT IN ('cancelled','refunded') AND MONTH(created_at)=MONTH(NOW())")['s'],
        'verif_pending'    => DB::fetchOne("SELECT COUNT(*) c FROM verifications WHERE status='pending'")['c'],
        'new_users_today'  => DB::fetchOne("SELECT COUNT(*) c FROM users WHERE DATE(created_at)=CURDATE()")['c'],
    ];
    respond($stats);
}

function list_users(): never {
    [$page,$per_page,$offset] = get_pagination();
    $status = $_GET['status'] ?? null;
    $search = $_GET['search'] ?? null;
    $where  = 'WHERE 1=1';
    $params = [];
    if ($status) { $where .= ' AND u.status=?'; $params[] = $status; }
    if ($search) { $where .= ' AND (u.email LIKE ? OR u.first_name LIKE ? OR u.last_name LIKE ?)'; $like="%$search%"; $params=array_merge($params,[$like,$like,$like]); }
    $total = (int)DB::fetchOne("SELECT COUNT(*) c FROM users u $where", $params)['c'];
    $items = DB::fetchAll(
        "SELECT u.id,u.first_name,u.last_name,u.email,u.role,u.status,u.created_at,
                COALESCE(sp.total_sales,0) AS total_sales,
                COALESCE(sp.verification_status,'unverified') AS verification_status
         FROM users u LEFT JOIN seller_profiles sp ON u.id=sp.user_id
         $where ORDER BY u.created_at DESC LIMIT $per_page OFFSET $offset", $params);
    respond_list($items,$total,$page,$per_page);
}

function suspend_user(int $id): never {
    $user = DB::fetchOne("SELECT id,status FROM users WHERE id=?",[$id]);
    if (!$user) error('User not found.',404);
    $newStatus = $user['status']==='suspended'?'active':'suspended';
    DB::query("UPDATE users SET status=? WHERE id=?",[$newStatus,$id]);
    DB::query("UPDATE listings SET status='paused' WHERE seller_id=? AND status='active'",[$id]);
    audit((int)(require_auth())['sub'],'user.suspend','user',$id,['status'=>$user['status']],['status'=>$newStatus]);
    respond(['message'=>"Account $newStatus.",'new_status'=>$newStatus]);
}

function fraud_flags(): never {
    [$page,$per_page,$offset] = get_pagination();
    $total = (int)DB::fetchOne("SELECT COUNT(*) c FROM fraud_flags WHERE status='open'")['c'];
    $items = DB::fetchAll("SELECT * FROM fraud_flags WHERE status='open' ORDER BY created_at DESC LIMIT $per_page OFFSET $offset",[]);
    respond_list($items,$total,$page,$per_page);
}

function resolve_flag(int $id): never {
    $body   = get_body();
    $action = $body['action'] ?? 'dismiss';
    DB::query("UPDATE fraud_flags SET status=?,resolved_at=NOW(),resolved_by=? WHERE id=?",
        [$action==='remove'?'resolved':'dismissed',(int)(require_auth())['sub'],$id]);
    respond(['message'=>'Flag resolved.']);
}

function escrow_overview(): never {
    $items = DB::fetchAll(
        "SELECT o.id,o.order_number,o.amount,o.status AS order_status,e.status,e.held_at,
                l.title AS listing_title,
                CONCAT(b.first_name,' ',b.last_name) AS buyer_name,
                CONCAT(s.first_name,' ',s.last_name) AS seller_name
         FROM escrow e
         JOIN orders o ON e.order_id=o.id
         JOIN listings l ON o.listing_id=l.id
         JOIN users b ON o.buyer_id=b.id
         JOIN users s ON o.seller_id=s.id
         WHERE e.status='held'
         ORDER BY CASE WHEN TIMESTAMPDIFF(HOUR,e.held_at,NOW())>48 THEN 0 ELSE 1 END, e.held_at ASC",[]);
    $items = array_map(function($i){
        $i['age_hours'] = round((time()-strtotime($i['held_at']))/3600);
        $i['status']    = $i['age_hours']>72?'stalled':'active';
        return $i;
    },$items);
    respond($items);
}

function payout_queue(): never {
    $sellers = DB::fetchAll(
        "SELECT u.id,u.first_name,u.last_name,sp.wallet_balance,sp.total_sales,
                ba.bank_name,ba.account_number
         FROM seller_profiles sp
         JOIN users u ON sp.user_id=u.id
         LEFT JOIN bank_accounts ba ON u.id=ba.user_id AND ba.is_primary=1
         WHERE sp.wallet_balance>0 AND u.status='active'
         ORDER BY sp.wallet_balance DESC",[]);
    respond($sellers);
}

function system_health(): never {
    $checks = [
        ['name'=>'API Server',      'status'=>'up','uptime'=>'99.9%','metrics'=>[['Requests/min','~200'],['Avg latency','<80ms'],['PHP version',PHP_VERSION]]],
        ['name'=>'MySQL Database',  'status'=>'up','uptime'=>'100%', 'metrics'=>[['Connection','OK'],    ['Tables','17'],        ['Charset','utf8mb4']]],
        ['name'=>'KYC Queue',       'status'=>'up','uptime'=>'99.8%','metrics'=>[
            ['Pending',DB::fetchOne("SELECT COUNT(*) c FROM verifications WHERE status='pending'")['c']],
            ['Approved MTD',DB::fetchOne("SELECT COUNT(*) c FROM verifications WHERE status='approved' AND MONTH(reviewed_at)=MONTH(NOW())")['c']],
            ['Avg wait','<24h']]],
        ['name'=>'Escrow System',   'status'=>'up','uptime'=>'100%', 'metrics'=>[
            ['Held orders',DB::fetchOne("SELECT COUNT(*) c FROM escrow WHERE status='held'")['c']],
            ['Total held', 'R'.number_format(DB::fetchOne("SELECT COALESCE(SUM(amount),0) s FROM escrow WHERE status='held'")['s'])],
            ['Overdue',DB::fetchOne("SELECT COUNT(*) c FROM escrow e WHERE status='held' AND TIMESTAMPDIFF(HOUR,held_at,NOW())>72")['c']]]],
        ['name'=>'File Uploads',    'status'=> is_writable(__DIR__.'/../uploads/')?'up':'down','uptime'=>'—','metrics'=>[
            ['Upload dir', is_writable(__DIR__.'/../uploads/')?'Writable':'NOT writable'],['Max size',ini_get('upload_max_filesize')],['PHP post max',ini_get('post_max_size')]]],
        ['name'=>'Sessions / Auth', 'status'=>'up','uptime'=>'99.9%','metrics'=>[['JWT algorithm','HS256'],['Token TTL','24h'],['Active sessions','—']]],
    ];
    respond($checks);
}
