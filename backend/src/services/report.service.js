'use strict';

const db = require('../db/pool');

/**
 * UC-15 View Reports
 *
 * ทุกฟังก์ชันรับช่วงวันที่เป็น [from, to] แล้วคืนข้อมูลดิบให้ frontend วาดกราฟเอง
 * เหตุผลที่คำนวณใน SQL ไม่ใช่ใน JS: ข้อมูลอยู่ที่ RDS อยู่แล้ว การดึงทุกแถวมานับ
 * ในแอปคือการย้ายข้อมูลข้าม network โดยไม่จำเป็น และจะช้าลงเรื่อย ๆ ตามจำนวนแถว
 */

/** KPI สรุปหน้าแรกของหน้ารายงานและ Dashboard ผู้ดูแลระบบ */
async function summary(from, to) {
  const [totals] = await db.query(
    `SELECT
       COUNT(*)                                                    AS total_bookings,
       SUM(status = 'pending')                                     AS pending_bookings,
       SUM(status = 'confirmed')                                   AS confirmed_bookings,
       SUM(status = 'completed')                                   AS completed_bookings,
       SUM(status = 'cancelled')                                   AS cancelled_bookings,
       COALESCE(SUM(CASE WHEN status <> 'cancelled' THEN total_price END), 0) AS revenue,
       COALESCE(SUM(CASE WHEN status <> 'cancelled' THEN total_teu   END), 0) AS total_teu
     FROM bookings
     WHERE created_at BETWEEN ? AND ?`,
    [from, to]
  );

  const [customers] = await db.query(
    "SELECT COUNT(*) AS total_customers, SUM(status = 'active') AS active_customers FROM users WHERE role = 'customer'"
  );

  const [stock] = await db.query(
    `SELECT COUNT(*) AS total_items,
            SUM(qty_on_hand <= reorder_level) AS low_stock_items
       FROM stock_items WHERE is_active = 1`
  );

  const [schedules] = await db.query(
    `SELECT COUNT(*) AS open_schedules,
            COALESCE(ROUND(AVG(booked_teu / NULLIF(capacity_teu, 0) * 100), 1), 0) AS avg_utilization_pct
       FROM vessel_schedules WHERE status IN ('open','closing')`
  );

  /**
   * Dwell time = เวลาเฉลี่ยตั้งแต่ตู้เข้าประตูท่าจนขึ้นเรือ (ชั่วโมง)
   * เป็น KPI มาตรฐานของ WMS/ท่าเรือที่ใช้หาคอขวดของการดำเนินงาน
   */
  const [dwell] = await db.query(
    `SELECT ROUND(AVG(TIMESTAMPDIFF(MINUTE, gate_in_at, loaded_at)) / 60, 1) AS avg_dwell_hours,
            COUNT(*) AS measured_shipments
       FROM shipment_orders
      WHERE gate_in_at IS NOT NULL AND loaded_at IS NOT NULL
        AND gate_in_at BETWEEN ? AND ?`,
    [from, to]
  );

  return {
    period: { from, to },
    bookings: totals,
    customers,
    stock,
    schedules,
    operations: dwell,
  };
}

/** ยอดจอง/รายได้รายวัน — ใช้วาดกราฟเส้นในหน้ารายงาน */
async function bookingTrend(from, to) {
  return db.query(
    `SELECT DATE(created_at) AS date,
            COUNT(*) AS bookings,
            COALESCE(SUM(CASE WHEN status <> 'cancelled' THEN total_price END), 0) AS revenue,
            COALESCE(SUM(CASE WHEN status <> 'cancelled' THEN total_teu   END), 0) AS teu
       FROM bookings
      WHERE created_at BETWEEN ? AND ?
      GROUP BY DATE(created_at)
      ORDER BY date`,
    [from, to]
  );
}

/** บริการขายดี — ตอบข้อ "สินค้า/บริการขายดี" ใน UC-15 */
async function topServices(from, to, limit = 10) {
  return db.query(
    `SELECT s.code, s.name, s.service_type,
            COUNT(b.id) AS booking_count,
            COALESCE(SUM(b.total_teu), 0)   AS total_teu,
            COALESCE(SUM(b.total_price), 0) AS revenue
       FROM bookings b
       JOIN services s ON s.id = b.service_id
      WHERE b.created_at BETWEEN ? AND ? AND b.status <> 'cancelled'
      GROUP BY s.id
      ORDER BY revenue DESC
      LIMIT ${Number(limit)}`,
    [from, to]
  );
}

/** การใช้พื้นที่ของแต่ละเที่ยวเรือ — ชี้ว่าเที่ยวไหนใกล้เต็ม */
async function scheduleUtilization() {
  return db.query(
    `SELECT vs.voyage_no, v.name AS vessel_name, s.name AS service_name,
            vs.etd, vs.capacity_teu, vs.booked_teu, vs.status,
            ROUND(vs.booked_teu / NULLIF(vs.capacity_teu, 0) * 100, 1) AS utilization_pct
       FROM vessel_schedules vs
       JOIN vessels v  ON v.id = vs.vessel_id
       JOIN services s ON s.id = vs.service_id
      WHERE vs.status IN ('open','closing')
      ORDER BY utilization_pct DESC, vs.etd ASC
      LIMIT 20`
  );
}

/** รายงานสินค้าคงคลัง + รายการที่ต่ำกว่าจุดสั่งซื้อ */
async function stockReport() {
  const items = await db.query(
    `SELECT sku, name, category, unit, warehouse_zone, qty_on_hand, reorder_level,
            (qty_on_hand <= reorder_level) AS is_low
       FROM stock_items WHERE is_active = 1
      ORDER BY (qty_on_hand <= reorder_level) DESC, warehouse_zone, name`
  );

  const byZone = await db.query(
    `SELECT COALESCE(warehouse_zone, 'ไม่ระบุโซน') AS zone,
            COUNT(*) AS item_count, SUM(qty_on_hand) AS total_qty
       FROM stock_items WHERE is_active = 1
      GROUP BY warehouse_zone ORDER BY zone`
  );

  return { items, byZone };
}

/** แปลงเป็น CSV ให้ Admin กด Export ได้ตาม UC-15 Normal Flow ข้อ 5 */
function toCsv(rows) {
  if (!rows || rows.length === 0) return '';
  const headers = Object.keys(rows[0]);
  const escape = (v) => {
    if (v === null || v === undefined) return '';
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers.join(','), ...rows.map((r) => headers.map((h) => escape(r[h])).join(','))].join('\n');
}

module.exports = {
  summary,
  bookingTrend,
  topServices,
  scheduleUtilization,
  stockReport,
  toCsv,
};
