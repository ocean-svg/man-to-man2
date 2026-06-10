<?php
// ============================================================
//  MzansiMarket — Database Configuration
//  File: config/db.php
//
//  XAMPP default credentials:
//    Host:     localhost
//    User:     root
//    Password: (empty by default)
//    Database: mzansimarket
//
//  Change these before going to production!
// ============================================================

define('DB_HOST',     'localhost');
define('DB_USER',     'root');
define('DB_PASS',     '');          // Change in production
define('DB_NAME',     'mzansimarket');
define('DB_PORT',     3306);
define('DB_CHARSET',  'utf8mb4');

// JWT secret — change this to a long random string in production
define('JWT_SECRET',  'mzansi_change_this_secret_in_production_2025');
define('JWT_EXPIRE',  86400);       // 24 hours in seconds

// App settings
define('APP_URL',     'http://localhost/mzansimarket');
define('APP_ENV',     'development'); // 'production' in live
define('UPLOAD_DIR',  __DIR__ . '/../uploads/');
define('UPLOAD_URL',  APP_URL . '/uploads/');
define('MAX_UPLOAD',  5 * 1024 * 1024); // 5MB

// Platform fees
define('FEE_STARTER',  0.04);  // 4% for free plan
define('FEE_HUSTLER',  0.025); // 2.5% for paid plan
define('FEE_ENTERPRISE', 0.02); // 2% for enterprise

// ============================================================
//  DATABASE CONNECTION (Singleton PDO)
// ============================================================
class DB {
    private static ?PDO $instance = null;

    public static function connect(): PDO {
        if (self::$instance === null) {
            $dsn = sprintf(
                'mysql:host=%s;port=%d;dbname=%s;charset=%s',
                DB_HOST, DB_PORT, DB_NAME, DB_CHARSET
            );
            try {
                self::$instance = new PDO($dsn, DB_USER, DB_PASS, [
                    PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
                    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                    PDO::ATTR_EMULATE_PREPARES   => false,
                    PDO::MYSQL_ATTR_FOUND_ROWS   => true,
                ]);
            } catch (PDOException $e) {
                if (APP_ENV === 'development') {
                    die(json_encode([
                        'success' => false,
                        'message' => 'Database connection failed: ' . $e->getMessage()
                    ]));
                } else {
                    die(json_encode([
                        'success' => false,
                        'message' => 'Service temporarily unavailable.'
                    ]));
                }
            }
        }
        return self::$instance;
    }

    // Convenience: run a prepared query and return statement
    public static function query(string $sql, array $params = []): PDOStatement {
        $stmt = self::connect()->prepare($sql);
        $stmt->execute($params);
        return $stmt;
    }

    // Convenience: fetch all rows
    public static function fetchAll(string $sql, array $params = []): array {
        return self::query($sql, $params)->fetchAll();
    }

    // Convenience: fetch single row
    public static function fetchOne(string $sql, array $params = []): ?array {
        $row = self::query($sql, $params)->fetch();
        return $row ?: null;
    }

    // Convenience: last insert id
    public static function lastId(): string {
        return self::connect()->lastInsertId();
    }
}
