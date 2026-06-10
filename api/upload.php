<?php
require_once __DIR__ . '/../includes/helpers.php';
set_headers();
require_auth();

$type    = $_GET['type'] ?? 'listing'; // listing | kyc | profile
$allowed = ['image/jpeg','image/png','image/webp','application/pdf'];
$maxSize = MAX_UPLOAD;

if ($_SERVER['REQUEST_METHOD'] !== 'POST') error('POST required.', 405);
if (empty($_FILES['file'])) error('No file uploaded.');

$file = $_FILES['file'];
if ($file['error'] !== UPLOAD_ERR_OK) error('Upload error code: '.$file['error']);
if ($file['size'] > $maxSize) error('File too large. Max '.($maxSize/1024/1024).'MB.');
if (!in_array(mime_content_type($file['tmp_name']), $allowed)) error('File type not allowed. Use JPG, PNG, WEBP, or PDF.');

$ext      = pathinfo($file['name'], PATHINFO_EXTENSION);
$safeName = $type.'_'.uniqid().'.'.$ext;
$subDir   = match($type) {
    'kyc'     => UPLOAD_DIR.'kyc/',
    'profile' => UPLOAD_DIR.'profiles/',
    default   => UPLOAD_DIR.'listings/',
};

if (!is_dir($subDir)) mkdir($subDir, 0755, true);
$dest = $subDir.$safeName;

if (!move_uploaded_file($file['tmp_name'], $dest)) error('Could not save file.', 500);

$url = UPLOAD_URL.str_replace(UPLOAD_DIR,'',realpath($dest));
respond(['url' => $url, 'filename' => $safeName, 'type' => $type], 201);
