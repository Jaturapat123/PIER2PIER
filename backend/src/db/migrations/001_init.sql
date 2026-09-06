-- Pier2Pier Port WMS — schema เริ่มต้น
-- ทุกตารางใช้ InnoDB (รองรับ transaction + foreign key) และ utf8mb4 (ชื่อไทย/emoji)

CREATE TABLE IF NOT EXISTS users (
  id            INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  username      VARCHAR(50)     NOT NULL,
  full_name     VARCHAR(150)    NOT NULL,
  email         VARCHAR(150)    NOT NULL,
  phone         VARCHAR(30)     NULL,
  company_name  VARCHAR(150)    NULL,
  password_hash VARCHAR(255)    NOT NULL,
  role          ENUM('customer','admin') NOT NULL DEFAULT 'customer',
  status        ENUM('active','suspended') NOT NULL DEFAULT 'active',
  created_at    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_email (email),
  UNIQUE KEY uq_users_username (username),
  KEY idx_users_role_status (role, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS services (
  id               INT UNSIGNED NOT NULL AUTO_INCREMENT,
  code             VARCHAR(30)  NOT NULL,
  name             VARCHAR(150) NOT NULL,
  service_type     ENUM('import','export','transshipment','storage') NOT NULL,
  origin_port      VARCHAR(100) NOT NULL,
  destination_port VARCHAR(100) NOT NULL,
  transit_days     SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  base_price       DECIMAL(12,2) NOT NULL DEFAULT 0,
  description      TEXT         NULL,
  status           ENUM('active','inactive') NOT NULL DEFAULT 'active',
  created_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_services_code (code),
  KEY idx_services_type_status (service_type, status),
  -- UC-4 ค้นหาด้วยคำค้นอิสระบนชื่อ/ต้นทาง/ปลายทาง
  FULLTEXT KEY ft_services_search (name, origin_port, destination_port, description)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS vessels (
  id           INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name         VARCHAR(120) NOT NULL,
  imo_number   VARCHAR(20)  NOT NULL,
  operator     VARCHAR(120) NULL,
  capacity_teu INT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE KEY uq_vessels_imo (imo_number)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- เที่ยวเรือ: หน่วยที่ลูกค้าจองจริง
-- capacity_teu / booked_teu คือ quota ต่อเที่ยว ทำให้ UC-5 Alternate Flow 1
-- ("ระบบรับการจองไม่ได้") มีเงื่อนไขจริงให้ตรวจสอบ
CREATE TABLE IF NOT EXISTS vessel_schedules (
  id           INT UNSIGNED NOT NULL AUTO_INCREMENT,
  service_id   INT UNSIGNED NOT NULL,
  vessel_id    INT UNSIGNED NOT NULL,
  voyage_no    VARCHAR(40)  NOT NULL,
  etd          DATETIME     NOT NULL,
  eta          DATETIME     NOT NULL,
  berth        VARCHAR(40)  NULL,
  cutoff_at    DATETIME     NOT NULL,
  capacity_teu INT UNSIGNED NOT NULL,
  booked_teu   INT UNSIGNED NOT NULL DEFAULT 0,
  status       ENUM('open','closing','closed','departed') NOT NULL DEFAULT 'open',
  created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_schedule_voyage (vessel_id, voyage_no),
  KEY idx_schedule_service_etd (service_id, etd),
  KEY idx_schedule_status_etd (status, etd),
  CONSTRAINT fk_schedule_service FOREIGN KEY (service_id) REFERENCES services (id),
  CONSTRAINT fk_schedule_vessel  FOREIGN KEY (vessel_id)  REFERENCES vessels (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS container_types (
  id             INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  code           VARCHAR(20)   NOT NULL,
  name           VARCHAR(100)  NOT NULL,
  size_ft        SMALLINT UNSIGNED NOT NULL,
  teu_factor     DECIMAL(4,2)  NOT NULL DEFAULT 1.00,
  max_payload_kg INT UNSIGNED  NOT NULL DEFAULT 0,
  description    VARCHAR(255)  NULL,
  is_active      TINYINT(1)    NOT NULL DEFAULT 1,
  PRIMARY KEY (id),
  UNIQUE KEY uq_container_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- "ตะกร้า" ของระบบนี้ = แถวที่ status='pending'
-- เก็บใน RDS ไม่ใช่ memory จึงใช้ได้กับ EC2 หลายเครื่องหลัง ALB
CREATE TABLE IF NOT EXISTS bookings (
  id              INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  booking_no      VARCHAR(30)   NOT NULL,
  user_id         INT UNSIGNED  NOT NULL,
  schedule_id     INT UNSIGNED  NOT NULL,
  service_id      INT UNSIGNED  NOT NULL,
  cargo_type      VARCHAR(120)  NOT NULL,
  cargo_weight_kg INT UNSIGNED  NOT NULL DEFAULT 0,
  pickup_location VARCHAR(255)  NULL,
  notes           TEXT          NULL,
  total_teu       DECIMAL(8,2)  NOT NULL DEFAULT 0,
  total_price     DECIMAL(12,2) NOT NULL DEFAULT 0,
  status          ENUM('pending','confirmed','in_progress','completed','cancelled')
                    NOT NULL DEFAULT 'pending',
  created_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  confirmed_at    DATETIME      NULL,
  updated_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_bookings_no (booking_no),
  KEY idx_bookings_user_created (user_id, created_at DESC),
  KEY idx_bookings_status (status),
  KEY idx_bookings_schedule (schedule_id),
  CONSTRAINT fk_bookings_user     FOREIGN KEY (user_id)     REFERENCES users (id),
  CONSTRAINT fk_bookings_schedule FOREIGN KEY (schedule_id) REFERENCES vessel_schedules (id),
  CONSTRAINT fk_bookings_service  FOREIGN KEY (service_id)  REFERENCES services (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- 1 booking จองได้หลายประเภทตู้ (เช่น 20GP 2 ตู้ + 40HC 1 ตู้)
CREATE TABLE IF NOT EXISTS booking_items (
  id                INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  booking_id        INT UNSIGNED  NOT NULL,
  container_type_id INT UNSIGNED  NOT NULL,
  qty               SMALLINT UNSIGNED NOT NULL,
  unit_price        DECIMAL(12,2) NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  KEY idx_items_booking (booking_id),
  KEY idx_items_container (container_type_id),
  CONSTRAINT fk_items_booking   FOREIGN KEY (booking_id) REFERENCES bookings (id) ON DELETE CASCADE,
  CONSTRAINT fk_items_container FOREIGN KEY (container_type_id) REFERENCES container_types (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- UC-6 ระบุว่าเมื่อยืนยัน Booking แล้วระบบต้องสร้าง/อัปเดต Shipment Order
CREATE TABLE IF NOT EXISTS shipment_orders (
  id           INT UNSIGNED NOT NULL AUTO_INCREMENT,
  order_no     VARCHAR(30)  NOT NULL,
  booking_id   INT UNSIGNED NOT NULL,
  status       ENUM('created','gate_in','loaded','departed','delivered') NOT NULL DEFAULT 'created',
  gate_in_at   DATETIME     NULL,
  loaded_at    DATETIME     NULL,
  departed_at  DATETIME     NULL,
  delivered_at DATETIME     NULL,
  created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_shipment_no (order_no),
  UNIQUE KEY uq_shipment_booking (booking_id),
  CONSTRAINT fk_shipment_booking FOREIGN KEY (booking_id) REFERENCES bookings (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- คลังสินค้าในเขตท่าเรือ (UC-14)
-- warehouse_zone + reorder_level เป็นมาตรฐาน WMS สำหรับ yard management และแจ้งเตือนของใกล้หมด
CREATE TABLE IF NOT EXISTS stock_items (
  id             INT UNSIGNED NOT NULL AUTO_INCREMENT,
  sku            VARCHAR(40)  NOT NULL,
  name           VARCHAR(150) NOT NULL,
  category       VARCHAR(80)  NULL,
  unit           VARCHAR(20)  NOT NULL DEFAULT 'ชิ้น',
  warehouse_zone VARCHAR(40)  NULL,
  qty_on_hand    INT          NOT NULL DEFAULT 0,
  reorder_level  INT          NOT NULL DEFAULT 0,
  is_active      TINYINT(1)   NOT NULL DEFAULT 1,
  created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_stock_sku (sku),
  KEY idx_stock_zone (warehouse_zone)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS stock_transactions (
  id             INT UNSIGNED NOT NULL AUTO_INCREMENT,
  stock_item_id  INT UNSIGNED NOT NULL,
  change_qty     INT          NOT NULL,
  type           ENUM('in','out','adjust') NOT NULL,
  reason         VARCHAR(255) NULL,
  ref_booking_id INT UNSIGNED NULL,
  admin_id       INT UNSIGNED NOT NULL,
  created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_stocktx_item_created (stock_item_id, created_at DESC),
  CONSTRAINT fk_stocktx_item  FOREIGN KEY (stock_item_id) REFERENCES stock_items (id),
  CONSTRAINT fk_stocktx_admin FOREIGN KEY (admin_id)      REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- UC-10/13/14 ให้ Admin แก้ข้อมูลของผู้อื่นได้ จึงต้องสาวกลับได้ว่าใครทำอะไรเมื่อไหร่
CREATE TABLE IF NOT EXISTS audit_logs (
  id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id    INT UNSIGNED NULL,
  action     VARCHAR(60)  NOT NULL,
  entity     VARCHAR(60)  NOT NULL,
  entity_id  VARCHAR(60)  NULL,
  meta       JSON         NULL,
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_audit_created (created_at DESC),
  KEY idx_audit_entity (entity, entity_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
