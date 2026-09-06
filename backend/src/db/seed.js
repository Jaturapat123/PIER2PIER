'use strict';

const bcrypt = require('bcryptjs');
const db = require('./pool');

/**
 * ข้อมูลสาธิตสำหรับการนำเสนอ — อ้างอิงท่าเรือและเส้นทางจริงในภูมิภาค
 * เพื่อให้หน้าจอตอนสาธิตดูสมจริง ไม่ใช่ "Product A / Product B"
 *
 * รันซ้ำได้ (idempotent) ด้วย INSERT ... ON DUPLICATE KEY UPDATE
 * เพราะ CI/CD อาจรัน seed หลายรอบ และ EC2 2 เครื่องอาจรันพร้อมกัน
 */

const DEMO_PASSWORD = process.env.SEED_PASSWORD || 'Pier2Pier!2569';

const users = [
  ['admin', 'ณัฐวุฒิ ทิพย์รัตน์', 'admin@pier2pier.test', '02-111-2222', 'Pier2Pier Port Authority', 'admin'],
  ['portstaff', 'วรวัส เทียมทัด', 'staff@pier2pier.test', '02-111-2233', 'Pier2Pier Port Authority', 'admin'],
  ['siamlogistics', 'จตุรภัทร กิติมาโภคิน', 'customer@pier2pier.test', '081-234-5678', 'สยามโลจิสติกส์ จำกัด', 'customer'],
  ['thaifreight', 'ประภัสร์พงษ์ ดาวประดับวงษ์', 'agent@pier2pier.test', '089-876-5432', 'ไทยเฟรท เอเยนซี่ จำกัด', 'customer'],
];

const services = [
  ['SVC-EXP-SIN', 'Export Service — แหลมฉบัง → สิงคโปร์', 'export', 'แหลมฉบัง (THLCH)', 'สิงคโปร์ (SGSIN)', 3, 18500, 'บริการส่งออกตู้สินค้าไปท่าเรือสิงคโปร์ เที่ยวประจำสัปดาห์ละ 2 เที่ยว'],
  ['SVC-EXP-HKG', 'Export Service — แหลมฉบัง → ฮ่องกง', 'export', 'แหลมฉบัง (THLCH)', 'ฮ่องกง (HKHKG)', 5, 24000, 'บริการส่งออกตู้สินค้าไปฮ่องกง เหมาะกับสินค้าอิเล็กทรอนิกส์และชิ้นส่วน'],
  ['SVC-IMP-SHA', 'Import Service — เซี่ยงไฮ้ → แหลมฉบัง', 'import', 'เซี่ยงไฮ้ (CNSHA)', 'แหลมฉบัง (THLCH)', 7, 26500, 'บริการนำเข้าตู้สินค้าจากเซี่ยงไฮ้ รวมพิธีการศุลกากรขาเข้า'],
  ['SVC-IMP-PKG', 'Import Service — พอร์ตกลัง → กรุงเทพ', 'import', 'พอร์ตกลัง (MYPKG)', 'ท่าเรือกรุงเทพ (THBKK)', 4, 16800, 'บริการนำเข้าจากมาเลเซีย เหมาะกับตู้ขนาดเล็กและสินค้าเร่งด่วน'],
  ['SVC-TRS-LCH', 'Transshipment Hub — แหลมฉบัง', 'transshipment', 'แหลมฉบัง (THLCH)', 'แหลมฉบัง (THLCH)', 2, 9800, 'บริการถ่ายลำตู้สินค้าที่ท่าเรือแหลมฉบัง รวมค่ายกตู้ขึ้น-ลง'],
  ['SVC-STO-CY', 'Container Yard Storage', 'storage', 'แหลมฉบัง (THLCH)', 'แหลมฉบัง (THLCH)', 0, 4500, 'บริการฝากตู้ในลานตู้ คิดค่าบริการรายวันต่อตู้'],
];

const vessels = [
  ['MV Bangkok Express', 'IMO9876541', 'Thai Ocean Line', 8500],
  ['MV Andaman Star', 'IMO9876542', 'Andaman Shipping', 6200],
  ['MV Siam Pioneer', 'IMO9876543', 'Siam Marine', 11000],
  ['MV Gulf Trader', 'IMO9876544', 'Gulf Container Line', 4800],
];

const containerTypes = [
  ['20GP', 'ตู้แห้งมาตรฐาน 20 ฟุต', 20, 1.0, 28200, 'ตู้ทั่วไปสำหรับสินค้าแห้งน้ำหนักมาก'],
  ['40GP', 'ตู้แห้งมาตรฐาน 40 ฟุต', 40, 2.0, 26700, 'ตู้ทั่วไปสำหรับสินค้าปริมาตรมาก'],
  ['40HC', 'ตู้สูงพิเศษ 40 ฟุต', 40, 2.0, 26500, 'สูงกว่า 40GP หนึ่งฟุต เหมาะกับสินค้าเบาแต่กินพื้นที่'],
  ['20RF', 'ตู้ห้องเย็น 20 ฟุต', 20, 1.0, 21500, 'ควบคุมอุณหภูมิ ต้องเสียบไฟตลอดเวลาที่อยู่ในลาน'],
  ['40RF', 'ตู้ห้องเย็น 40 ฟุต', 40, 2.0, 27700, 'สำหรับสินค้าเกษตรและอาหารแช่แข็ง'],
  ['20OT', 'ตู้เปิดหลังคา 20 ฟุต', 20, 1.0, 28000, 'สำหรับสินค้าที่ยกลงจากด้านบน เช่น เครื่องจักร'],
];

const stockItems = [
  ['SKU-PLT-001', 'พาเลทไม้ 1.2×1.0 ม.', 'อุปกรณ์คลัง', 'อัน', 'Zone A', 480, 100],
  ['SKU-PLT-002', 'พาเลทพลาสติก 1.2×1.0 ม.', 'อุปกรณ์คลัง', 'อัน', 'Zone A', 320, 80],
  ['SKU-SEA-001', 'ซีลตู้คอนเทนเนอร์ (Bolt Seal)', 'อุปกรณ์ความปลอดภัย', 'ชิ้น', 'Zone B', 1500, 300],
  ['SKU-LSH-001', 'สายรัดตู้ (Lashing Belt) 5 ตัน', 'อุปกรณ์ยึดตรึง', 'เส้น', 'Zone B', 210, 50],
  ['SKU-DUN-001', 'ถุงลมกันกระแทก (Dunnage Bag)', 'วัสดุกันกระแทก', 'ใบ', 'Zone C', 65, 120],
  ['SKU-FRK-001', 'น้ำมันไฮดรอลิกรถโฟล์คลิฟท์', 'อะไหล่/เชื้อเพลิง', 'ลิตร', 'Zone D', 90, 60],
  ['SKU-DES-001', 'สารดูดความชื้น (Desiccant)', 'วัสดุกันชื้น', 'ห่อ', 'Zone C', 740, 150],
  ['SKU-LBL-001', 'ป้ายสินค้าอันตราย (IMDG Label)', 'ป้าย/ฉลาก', 'แผ่น', 'Zone B', 38, 100],
];

async function seedUsers() {
  const hash = await bcrypt.hash(DEMO_PASSWORD, 10);
  for (const [username, fullName, email, phone, company, role] of users) {
    await db.query(
      `INSERT INTO users (username, full_name, email, phone, company_name, password_hash, role)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE full_name = VALUES(full_name), company_name = VALUES(company_name)`,
      [username, fullName, email, phone, company, hash, role]
    );
  }
}

async function seedServices() {
  for (const s of services) {
    await db.query(
      `INSERT INTO services (code, name, service_type, origin_port, destination_port, transit_days, base_price, description)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE name = VALUES(name), base_price = VALUES(base_price)`,
      s
    );
  }
}

async function seedVessels() {
  for (const v of vessels) {
    await db.query(
      `INSERT INTO vessels (name, imo_number, operator, capacity_teu) VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE name = VALUES(name), operator = VALUES(operator)`,
      v
    );
  }
}

async function seedContainerTypes() {
  for (const c of containerTypes) {
    await db.query(
      `INSERT INTO container_types (code, name, size_ft, teu_factor, max_payload_kg, description)
       VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE name = VALUES(name), description = VALUES(description)`,
      c
    );
  }
}

/**
 * สร้างเที่ยวเรือรอบ ๆ วันนี้ เพื่อให้หน้าจอมีข้อมูลใช้งานได้เสมอไม่ว่าจะสาธิตวันไหน
 * มีเที่ยวที่เกือบเต็ม 1 เที่ยวไว้สาธิต UC-5 Alternate Flow 1 (จองเกิน quota)
 */
async function seedSchedules() {
  const serviceRows = await db.query('SELECT id, code FROM services');
  const vesselRows = await db.query('SELECT id, name FROM vessels');
  const svc = Object.fromEntries(serviceRows.map((r) => [r.code, r.id]));
  const vsl = Object.fromEntries(vesselRows.map((r) => [r.name, r.id]));

  const day = (n) => {
    const d = new Date();
    d.setUTCHours(8, 0, 0, 0);
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 19).replace('T', ' ');
  };

  const rows = [
    [svc['SVC-EXP-SIN'], vsl['MV Bangkok Express'], 'BKX-2601E', day(3), day(6), 'B1', day(2), 900, 120, 'open'],
    [svc['SVC-EXP-SIN'], vsl['MV Siam Pioneer'], 'SPN-2604E', day(10), day(13), 'B2', day(9), 1200, 340, 'open'],
    [svc['SVC-EXP-HKG'], vsl['MV Andaman Star'], 'ADS-2611E', day(5), day(10), 'C1', day(4), 700, 690, 'closing'],
    [svc['SVC-IMP-SHA'], vsl['MV Siam Pioneer'], 'SPN-2605I', day(8), day(15), 'A3', day(7), 1100, 260, 'open'],
    [svc['SVC-IMP-PKG'], vsl['MV Gulf Trader'], 'GFT-2620I', day(4), day(8), 'A1', day(3), 500, 95, 'open'],
    [svc['SVC-TRS-LCH'], vsl['MV Gulf Trader'], 'GFT-2621T', day(6), day(8), 'D2', day(5), 400, 400, 'closed'],
    [svc['SVC-EXP-SIN'], vsl['MV Andaman Star'], 'ADS-2612E', day(-6), day(-3), 'B1', day(-7), 800, 800, 'departed'],
  ];

  for (const r of rows) {
    await db.query(
      `INSERT INTO vessel_schedules
         (service_id, vessel_id, voyage_no, etd, eta, berth, cutoff_at, capacity_teu, booked_teu, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE etd = VALUES(etd), eta = VALUES(eta), status = VALUES(status)`,
      r
    );
  }
}

async function seedStock() {
  for (const s of stockItems) {
    await db.query(
      `INSERT INTO stock_items (sku, name, category, unit, warehouse_zone, qty_on_hand, reorder_level)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE name = VALUES(name), reorder_level = VALUES(reorder_level)`,
      s
    );
  }
}

async function run() {
  await seedUsers();
  await seedServices();
  await seedVessels();
  await seedContainerTypes();
  await seedSchedules();
  await seedStock();
  console.log('[seed] done');
  console.log(`[seed] admin    : admin@pier2pier.test / ${DEMO_PASSWORD}`);
  console.log(`[seed] customer : customer@pier2pier.test / ${DEMO_PASSWORD}`);
}

if (require.main === module) {
  run()
    .then(() => db.close())
    .catch(async (err) => {
      console.error('[seed] failed:', err.message);
      await db.close();
      process.exit(1);
    });
}

module.exports = run;
