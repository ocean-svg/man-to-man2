-- ============================================================
--  MzansiMarket — Full Database Schema
--  Compatible with: MySQL 5.7+ / MariaDB 10.3+
--  XAMPP / phpMyAdmin setup
--  Run this file via phpMyAdmin > Import, or:
--  mysql -u root -p < mzansimarket.sql
-- ============================================================

CREATE DATABASE IF NOT EXISTS mzansimarket
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE mzansimarket;

-- ============================================================
--  USERS
-- ============================================================
CREATE TABLE users (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  uuid          VARCHAR(36)  NOT NULL UNIQUE DEFAULT (UUID()),
  first_name    VARCHAR(100) NOT NULL,
  last_name     VARCHAR(100) NOT NULL,
  email         VARCHAR(255) NOT NULL UNIQUE,
  phone         VARCHAR(20),
  password_hash VARCHAR(255) NOT NULL,
  role          ENUM('buyer','seller','admin') NOT NULL DEFAULT 'buyer',
  status        ENUM('active','suspended','pending','banned') NOT NULL DEFAULT 'pending',
  email_verified    TINYINT(1) NOT NULL DEFAULT 0,
  email_verify_token VARCHAR(100),
  reset_token        VARCHAR(100),
  reset_token_expires DATETIME,
  last_login    DATETIME,
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_email  (email),
  INDEX idx_role   (role),
  INDEX idx_status (status)
) ENGINE=InnoDB;

-- ============================================================
--  SELLER PROFILES
-- ============================================================
CREATE TABLE seller_profiles (
  id                  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id             INT UNSIGNED NOT NULL UNIQUE,
  shop_name           VARCHAR(200) NOT NULL,
  bio                 TEXT,
  province            VARCHAR(100),
  township            VARCHAR(100),
  language            VARCHAR(50)  NOT NULL DEFAULT 'English',
  profile_photo       VARCHAR(500),
  verification_status ENUM('unverified','pending','verified','rejected') NOT NULL DEFAULT 'unverified',
  verified_at         DATETIME,
  rating_avg          DECIMAL(3,2) NOT NULL DEFAULT 0.00,
  rating_count        INT UNSIGNED NOT NULL DEFAULT 0,
  total_sales         INT UNSIGNED NOT NULL DEFAULT 0,
  wallet_balance      DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  wallet_pending      DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  created_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_verification_status (verification_status),
  INDEX idx_province (province)
) ENGINE=InnoDB;

-- ============================================================
--  KYC / FICA VERIFICATIONS
-- ============================================================
CREATE TABLE verifications (
  id                   INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id              INT UNSIGNED NOT NULL UNIQUE,
  sa_id_number         VARCHAR(13),
  date_of_birth        DATE,
  id_front_path        VARCHAR(500),
  id_back_path         VARCHAR(500),
  selfie_path          VARCHAR(500),
  address_proof_path   VARCHAR(500),
  status               ENUM('pending','approved','rejected','flagged') NOT NULL DEFAULT 'pending',
  reviewed_by          INT UNSIGNED,
  reviewed_at          DATETIME,
  rejection_reason     TEXT,
  submitted_at         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at           TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id)      REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (reviewed_by)  REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_status       (status),
  INDEX idx_submitted_at (submitted_at)
) ENGINE=InnoDB;

-- ============================================================
--  CATEGORIES
-- ============================================================
CREATE TABLE categories (
  id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name       VARCHAR(100) NOT NULL,
  slug       VARCHAR(100) NOT NULL UNIQUE,
  icon       VARCHAR(10),
  sort_order INT NOT NULL DEFAULT 0,
  active     TINYINT(1) NOT NULL DEFAULT 1
) ENGINE=InnoDB;

INSERT INTO categories (name, slug, icon, sort_order) VALUES
  ('Clothing & Fashion', 'clothing',   '👕', 1),
  ('Electronics',        'electronics','📱', 2),
  ('Handmade & Crafts',  'handmade',   '🪡', 3),
  ('Home & Furniture',   'home',       '🏠', 4),
  ('Food & Groceries',   'food',       '🍱', 5),
  ('Shoes',              'shoes',      '👟', 6),
  ('Tools & Equipment',  'tools',      '🔧', 7),
  ('Books & Education',  'books',      '📚', 8),
  ('Kids & Baby',        'kids',       '🧸', 9),
  ('Beauty & Health',    'beauty',     '🧴', 10),
  ('Sport & Fitness',    'sport',      '🏋️', 11),
  ('Other',              'other',      '📦', 12);

-- ============================================================
--  LISTINGS
-- ============================================================
CREATE TABLE listings (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  uuid            VARCHAR(36)  NOT NULL UNIQUE DEFAULT (UUID()),
  seller_id       INT UNSIGNED NOT NULL,
  category_id     INT UNSIGNED NOT NULL,
  title           VARCHAR(300) NOT NULL,
  description     TEXT,
  price           DECIMAL(10,2) NOT NULL,
  `condition`     ENUM('New','Good','Fair') NOT NULL,
  delivery_option ENUM('courier','pickup','both') NOT NULL DEFAULT 'both',
  province        VARCHAR(100),
  township        VARCHAR(100),
  status          ENUM('active','paused','sold','removed','flagged') NOT NULL DEFAULT 'active',
  views           INT UNSIGNED NOT NULL DEFAULT 0,
  saves           INT UNSIGNED NOT NULL DEFAULT 0,
  image_1         VARCHAR(500),
  image_2         VARCHAR(500),
  image_3         VARCHAR(500),
  featured        TINYINT(1) NOT NULL DEFAULT 0,
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (seller_id)   REFERENCES users(id)       ON DELETE CASCADE,
  FOREIGN KEY (category_id) REFERENCES categories(id)  ON DELETE RESTRICT,
  INDEX idx_seller_id   (seller_id),
  INDEX idx_category_id (category_id),
  INDEX idx_status      (status),
  INDEX idx_province    (province),
  INDEX idx_price       (price),
  FULLTEXT INDEX ft_search (title, description)
) ENGINE=InnoDB;

-- ============================================================
--  ORDERS
-- ============================================================
CREATE TABLE orders (
  id                   INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  order_number         VARCHAR(20) NOT NULL UNIQUE,
  listing_id           INT UNSIGNED NOT NULL,
  buyer_id             INT UNSIGNED NOT NULL,
  seller_id            INT UNSIGNED NOT NULL,
  amount               DECIMAL(10,2) NOT NULL,
  platform_fee         DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  seller_payout        DECIMAL(10,2) NOT NULL,
  delivery_option      ENUM('courier','pickup') NOT NULL,
  delivery_address     TEXT,
  courier_tracking     VARCHAR(200),
  status               ENUM(
                         'pending_payment',
                         'paid',
                         'dispatched',
                         'delivered',
                         'confirmed',
                         'disputed',
                         'cancelled',
                         'refunded'
                       ) NOT NULL DEFAULT 'pending_payment',
  paid_at              DATETIME,
  dispatched_at        DATETIME,
  delivered_at         DATETIME,
  confirmed_at         DATETIME,
  cancelled_at         DATETIME,
  cancel_reason        TEXT,
  created_at           TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at           TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (listing_id) REFERENCES listings(id) ON DELETE RESTRICT,
  FOREIGN KEY (buyer_id)   REFERENCES users(id)    ON DELETE RESTRICT,
  FOREIGN KEY (seller_id)  REFERENCES users(id)    ON DELETE RESTRICT,
  INDEX idx_buyer_id   (buyer_id),
  INDEX idx_seller_id  (seller_id),
  INDEX idx_status     (status),
  INDEX idx_created_at (created_at)
) ENGINE=InnoDB;

-- ============================================================
--  ESCROW
-- ============================================================
CREATE TABLE escrow (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  order_id     INT UNSIGNED NOT NULL UNIQUE,
  amount       DECIMAL(10,2) NOT NULL,
  status       ENUM('held','released','refunded','disputed') NOT NULL DEFAULT 'held',
  held_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  released_at  DATETIME,
  release_trigger ENUM('buyer_confirmation','admin_override','auto_timeout'),
  released_by  INT UNSIGNED,
  notes        TEXT,
  FOREIGN KEY (order_id)    REFERENCES orders(id) ON DELETE CASCADE,
  FOREIGN KEY (released_by) REFERENCES users(id)  ON DELETE SET NULL,
  INDEX idx_status (status)
) ENGINE=InnoDB;

-- ============================================================
--  WALLET TRANSACTIONS
-- ============================================================
CREATE TABLE wallet_transactions (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id       INT UNSIGNED NOT NULL,
  order_id      INT UNSIGNED,
  type          ENUM('credit','debit','withdrawal','fee','refund','escrow_hold','escrow_release') NOT NULL,
  amount        DECIMAL(10,2) NOT NULL,
  balance_after DECIMAL(12,2) NOT NULL,
  description   VARCHAR(500),
  status        ENUM('pending','completed','failed') NOT NULL DEFAULT 'completed',
  reference     VARCHAR(100),
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id)  REFERENCES users(id)  ON DELETE CASCADE,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL,
  INDEX idx_user_id    (user_id),
  INDEX idx_type       (type),
  INDEX idx_created_at (created_at)
) ENGINE=InnoDB;

-- ============================================================
--  DISPUTES
-- ============================================================
CREATE TABLE disputes (
  id               INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  dispute_number   VARCHAR(20) NOT NULL UNIQUE,
  order_id         INT UNSIGNED NOT NULL,
  raised_by        INT UNSIGNED NOT NULL,
  reason           ENUM(
                     'not_delivered',
                     'not_as_described',
                     'fake_item',
                     'seller_unresponsive',
                     'payment_issue',
                     'other'
                   ) NOT NULL,
  description      TEXT,
  status           ENUM('open','in_review','resolved_buyer','resolved_seller','escalated','closed') NOT NULL DEFAULT 'open',
  resolved_by      INT UNSIGNED,
  resolution_notes TEXT,
  opened_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_at      DATETIME,
  updated_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (order_id)    REFERENCES orders(id) ON DELETE RESTRICT,
  FOREIGN KEY (raised_by)   REFERENCES users(id)  ON DELETE RESTRICT,
  FOREIGN KEY (resolved_by) REFERENCES users(id)  ON DELETE SET NULL,
  INDEX idx_status  (status),
  INDEX idx_order   (order_id)
) ENGINE=InnoDB;

-- ============================================================
--  REVIEWS
-- ============================================================
CREATE TABLE reviews (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  order_id    INT UNSIGNED NOT NULL UNIQUE,
  reviewer_id INT UNSIGNED NOT NULL,
  seller_id   INT UNSIGNED NOT NULL,
  rating      TINYINT UNSIGNED NOT NULL,
  comment     TEXT,
  verified    TINYINT(1) NOT NULL DEFAULT 1,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (order_id)    REFERENCES orders(id) ON DELETE CASCADE,
  FOREIGN KEY (reviewer_id) REFERENCES users(id)  ON DELETE CASCADE,
  FOREIGN KEY (seller_id)   REFERENCES users(id)  ON DELETE CASCADE,
  INDEX idx_seller_id (seller_id),
  CONSTRAINT chk_rating CHECK (rating BETWEEN 1 AND 5)
) ENGINE=InnoDB;

-- ============================================================
--  MESSAGES
-- ============================================================
CREATE TABLE messages (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  listing_id  INT UNSIGNED NOT NULL,
  sender_id   INT UNSIGNED NOT NULL,
  receiver_id INT UNSIGNED NOT NULL,
  message     TEXT NOT NULL,
  read_at     DATETIME,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (listing_id)  REFERENCES listings(id) ON DELETE CASCADE,
  FOREIGN KEY (sender_id)   REFERENCES users(id)    ON DELETE CASCADE,
  FOREIGN KEY (receiver_id) REFERENCES users(id)    ON DELETE CASCADE,
  INDEX idx_receiver (receiver_id),
  INDEX idx_sender   (sender_id)
) ENGINE=InnoDB;

-- ============================================================
--  SAVED / WISHLIST
-- ============================================================
CREATE TABLE saved_listings (
  id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id    INT UNSIGNED NOT NULL,
  listing_id INT UNSIGNED NOT NULL,
  saved_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_user_listing (user_id, listing_id),
  FOREIGN KEY (user_id)    REFERENCES users(id)    ON DELETE CASCADE,
  FOREIGN KEY (listing_id) REFERENCES listings(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ============================================================
--  BANK ACCOUNTS (payout details)
-- ============================================================
CREATE TABLE bank_accounts (
  id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id        INT UNSIGNED NOT NULL,
  account_holder VARCHAR(200) NOT NULL,
  bank_name      VARCHAR(100) NOT NULL,
  account_number VARCHAR(255) NOT NULL,   -- AES_ENCRYPT in production
  branch_code    VARCHAR(20),
  account_type   ENUM('cheque','savings','transmission') NOT NULL DEFAULT 'savings',
  is_primary     TINYINT(1) NOT NULL DEFAULT 1,
  verified       TINYINT(1) NOT NULL DEFAULT 0,
  created_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_user (user_id)
) ENGINE=InnoDB;

-- ============================================================
--  FRAUD FLAGS
-- ============================================================
CREATE TABLE fraud_flags (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  flagged_type    ENUM('listing','user','transaction','order') NOT NULL,
  flagged_id      INT UNSIGNED NOT NULL,
  reason          VARCHAR(500),
  severity        ENUM('low','medium','high','critical') NOT NULL DEFAULT 'medium',
  flagged_by      ENUM('system','admin','user') NOT NULL DEFAULT 'system',
  flagged_by_user INT UNSIGNED,
  status          ENUM('open','investigating','resolved','dismissed') NOT NULL DEFAULT 'open',
  notes           TEXT,
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_at     DATETIME,
  resolved_by     INT UNSIGNED,
  FOREIGN KEY (flagged_by_user) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (resolved_by)     REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_type   (flagged_type),
  INDEX idx_status (status)
) ENGINE=InnoDB;

-- ============================================================
--  NOTIFICATIONS
-- ============================================================
CREATE TABLE notifications (
  id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id    INT UNSIGNED NOT NULL,
  type       VARCHAR(100) NOT NULL,
  title      VARCHAR(300),
  message    TEXT,
  data       JSON,
  read_at    DATETIME,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_user_id    (user_id),
  INDEX idx_read_at    (read_at),
  INDEX idx_created_at (created_at)
) ENGINE=InnoDB;

-- ============================================================
--  AUDIT LOG
-- ============================================================
CREATE TABLE audit_log (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id     INT UNSIGNED,
  action      VARCHAR(200) NOT NULL,
  target_type VARCHAR(100),
  target_id   INT UNSIGNED,
  old_value   JSON,
  new_value   JSON,
  ip_address  VARCHAR(45),
  user_agent  VARCHAR(500),
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_user_id    (user_id),
  INDEX idx_action     (action),
  INDEX idx_created_at (created_at)
) ENGINE=InnoDB;

-- ============================================================
--  SESSIONS (optional - alternative to JWT)
-- ============================================================
CREATE TABLE sessions (
  id         VARCHAR(128) PRIMARY KEY,
  user_id    INT UNSIGNED NOT NULL,
  ip_address VARCHAR(45),
  user_agent VARCHAR(500),
  payload    TEXT,
  expires_at DATETIME NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_user_id    (user_id),
  INDEX idx_expires_at (expires_at)
) ENGINE=InnoDB;

-- ============================================================
--  SEED DATA — Admin user + sample sellers
-- ============================================================

-- Admin user (password: Admin@1234)
INSERT INTO users (uuid, first_name, last_name, email, phone, password_hash, role, status, email_verified)
VALUES (
  UUID(),
  'Super', 'Admin',
  'admin@mzansimarket.co.za',
  '0800000001',
  '$2y$12$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', -- Admin@1234
  'admin', 'active', 1
);

-- Sample seller: Thandi
INSERT INTO users (uuid, first_name, last_name, email, phone, password_hash, role, status, email_verified)
VALUES (UUID(), 'Thandi', 'Mokoena', 'thandi@example.co.za', '0712345678',
  '$2y$12$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'seller', 'active', 1);

INSERT INTO seller_profiles (user_id, shop_name, bio, province, township, language, verification_status, verified_at, rating_avg, rating_count, total_sales)
VALUES (LAST_INSERT_ID(), 'Thandi\'s Closet', 'Selling quality pre-loved and new clothing from Soweto.', 'Gauteng', 'Soweto', 'English', 'verified', NOW(), 4.80, 28, 34);

-- Sample seller: Sipho
INSERT INTO users (uuid, first_name, last_name, email, phone, password_hash, role, status, email_verified)
VALUES (UUID(), 'Sipho', 'Ndlovu', 'sipho@example.co.za', '0823456789',
  '$2y$12$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'seller', 'active', 1);

INSERT INTO seller_profiles (user_id, shop_name, bio, province, township, language, verification_status, verified_at, rating_avg, rating_count, total_sales)
VALUES (LAST_INSERT_ID(), 'Sipho Electronics', 'Trusted electronics reseller from Khayelitsha.', 'Western Cape', 'Khayelitsha', 'isiZulu', 'verified', NOW(), 4.90, 41, 89);

-- Sample buyer: Lerato
INSERT INTO users (uuid, first_name, last_name, email, phone, password_hash, role, status, email_verified)
VALUES (UUID(), 'Lerato', 'Khumalo', 'lerato@example.co.za', '0734567890',
  '$2y$12$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'buyer', 'active', 1);

-- Sample listings (linked to seller user IDs 2 and 3)
INSERT INTO listings (uuid, seller_id, category_id, title, description, price, `condition`, delivery_option, province, township, status, views)
VALUES
  (UUID(), 2, 1, 'Vintage Denim Jacket — Size M', 'Classic Levi\'s denim jacket, size medium. Very good condition.', 290.00, 'Good', 'pickup', 'Western Cape', 'Mitchells Plain', 'active', 84),
  (UUID(), 2, 6, 'Nike Air Force 1 — Size 10', 'Clean pair, worn a few times. Original box included.', 680.00, 'Good', 'courier', 'Gauteng', 'Soweto', 'active', 110),
  (UUID(), 3, 2, 'Samsung Galaxy A14 — Good Condition', '6 months old. 128GB storage, original charger included.', 2100.00, 'Good', 'both', 'Western Cape', 'Khayelitsha', 'active', 198),
  (UUID(), 3, 2, 'Lenovo IdeaPad Core i5', '2021 model, Windows 11, 256GB SSD, 8GB RAM.', 4800.00, 'Good', 'both', 'Gauteng', 'Johannesburg CBD', 'active', 74);

-- ============================================================
--  STORED PROCEDURES
-- ============================================================

DELIMITER $$

-- Generate unique order number
CREATE PROCEDURE generate_order_number(OUT order_num VARCHAR(20))
BEGIN
  SET order_num = CONCAT('ORD-', LPAD(FLOOR(RAND() * 99999) + 10000, 5, '0'));
END$$

-- Release escrow to seller wallet
CREATE PROCEDURE release_escrow(IN p_order_id INT UNSIGNED, IN p_admin_id INT UNSIGNED)
BEGIN
  DECLARE v_seller_id INT UNSIGNED;
  DECLARE v_payout    DECIMAL(10,2);
  DECLARE v_balance   DECIMAL(12,2);

  SELECT seller_id, seller_payout INTO v_seller_id, v_payout
  FROM orders WHERE id = p_order_id;

  SELECT wallet_balance INTO v_balance
  FROM seller_profiles WHERE user_id = v_seller_id;

  -- Update escrow record
  UPDATE escrow
  SET status = 'released',
      released_at = NOW(),
      release_trigger = IF(p_admin_id IS NULL, 'buyer_confirmation', 'admin_override'),
      released_by = p_admin_id
  WHERE order_id = p_order_id;

  -- Credit seller wallet
  UPDATE seller_profiles
  SET wallet_balance = wallet_balance + v_payout,
      wallet_pending = GREATEST(0, wallet_pending - v_payout)
  WHERE user_id = v_seller_id;

  -- Log wallet transaction
  INSERT INTO wallet_transactions (user_id, order_id, type, amount, balance_after, description, status)
  VALUES (v_seller_id, p_order_id, 'escrow_release', v_payout, v_balance + v_payout,
    CONCAT('Escrow released for order ORD-', p_order_id), 'completed');

  -- Update order status
  UPDATE orders SET status = 'confirmed', confirmed_at = NOW()
  WHERE id = p_order_id;
END$$

-- Update seller rating after review
CREATE PROCEDURE update_seller_rating(IN p_seller_id INT UNSIGNED)
BEGIN
  UPDATE seller_profiles sp
  SET sp.rating_avg = (
    SELECT ROUND(AVG(r.rating), 2) FROM reviews r WHERE r.seller_id = p_seller_id
  ),
  sp.rating_count = (
    SELECT COUNT(*) FROM reviews r WHERE r.seller_id = p_seller_id
  )
  WHERE sp.user_id = p_seller_id;
END$$

DELIMITER ;

-- ============================================================
--  VIEWS
-- ============================================================

-- Active listings with seller info
CREATE VIEW vw_active_listings AS
SELECT
  l.id, l.uuid, l.title, l.description, l.price, l.`condition`,
  l.delivery_option, l.province, l.township,
  l.image_1, l.image_2, l.image_3,
  l.views, l.saves, l.created_at,
  c.name AS category_name, c.slug AS category_slug, c.icon AS category_icon,
  u.id AS seller_user_id,
  sp.shop_name, sp.verification_status, sp.rating_avg, sp.rating_count
FROM listings l
JOIN categories c ON l.category_id = c.id
JOIN users u ON l.seller_id = u.id
JOIN seller_profiles sp ON u.id = sp.user_id
WHERE l.status = 'active' AND u.status = 'active';

-- Open disputes with details
CREATE VIEW vw_open_disputes AS
SELECT
  d.id, d.dispute_number, d.reason, d.description, d.status, d.opened_at,
  o.order_number, o.amount,
  l.title AS listing_title,
  CONCAT(buyer.first_name, ' ', buyer.last_name) AS buyer_name,
  CONCAT(seller.first_name, ' ', seller.last_name) AS seller_name,
  sp.shop_name
FROM disputes d
JOIN orders o ON d.order_id = o.id
JOIN listings l ON o.listing_id = l.id
JOIN users buyer ON o.buyer_id = buyer.id
JOIN users seller ON o.seller_id = seller.id
JOIN seller_profiles sp ON seller.id = sp.user_id
WHERE d.status IN ('open','in_review');

-- Verification queue
CREATE VIEW vw_verification_queue AS
SELECT
  v.id, v.status, v.submitted_at,
  CONCAT(u.first_name, ' ', u.last_name) AS full_name,
  u.email, u.phone,
  sp.shop_name, sp.province, sp.township,
  v.id_front_path, v.id_back_path, v.selfie_path, v.address_proof_path
FROM verifications v
JOIN users u ON v.user_id = u.id
LEFT JOIN seller_profiles sp ON u.id = sp.user_id
WHERE v.status IN ('pending','flagged')
ORDER BY v.submitted_at ASC;

-- Platform revenue summary
CREATE VIEW vw_revenue_summary AS
SELECT
  DATE(o.created_at) AS sale_date,
  COUNT(*)            AS total_orders,
  SUM(o.amount)       AS gross_revenue,
  SUM(o.platform_fee) AS platform_revenue,
  SUM(o.seller_payout)AS seller_payouts
FROM orders o
WHERE o.status NOT IN ('cancelled','refunded')
GROUP BY DATE(o.created_at);
