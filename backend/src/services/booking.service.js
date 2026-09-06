'use strict';

const db = require('../db/pool');
const { notFound, conflict, badRequest } = require('../utils/httpError');

/**
 * ตรรกะการจอง — UC-5 (Create), UC-6 (Confirm), UC-7 (View)
 *
 * แยกออกจาก route เพราะเป็นส่วนเดียวของระบบที่มีกฎธุรกิจจริง
 * (quota ต่อเที่ยวเรือ, การเปลี่ยนสถานะ, การสร้าง shipment order)
 * และเป็นส่วนที่ต้องมีเทสต์ครอบให้แน่นที่สุด
 */

/** สร้างเลขที่เอกสารรูปแบบ BK-20260906-0042 — อ่านออกและเรียงตามเวลาได้ */
function makeDocNo(prefix, seq) {
  const d = new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  return `${prefix}-${ymd}-${String(seq).padStart(4, '0')}`;
}

const BOOKING_SELECT = `
  SELECT b.*,
         s.code AS service_code, s.name AS service_name, s.service_type,
         s.origin_port, s.destination_port,
         vs.voyage_no, vs.etd, vs.eta, vs.berth, vs.cutoff_at, vs.status AS schedule_status,
         v.name AS vessel_name, v.imo_number,
         u.full_name AS customer_name, u.email AS customer_email, u.company_name AS customer_company,
         so.order_no AS shipment_order_no, so.status AS shipment_status,
         so.gate_in_at, so.loaded_at, so.departed_at, so.delivered_at
    FROM bookings b
    JOIN services s          ON s.id  = b.service_id
    JOIN vessel_schedules vs ON vs.id = b.schedule_id
    JOIN vessels v           ON v.id  = vs.vessel_id
    JOIN users u             ON u.id  = b.user_id
    LEFT JOIN shipment_orders so ON so.booking_id = b.id`;

async function getItems(bookingId) {
  return db.query(
    `SELECT bi.*, ct.code AS container_code, ct.name AS container_name,
            ct.size_ft, ct.teu_factor
       FROM booking_items bi
       JOIN container_types ct ON ct.id = bi.container_type_id
      WHERE bi.booking_id = ?
      ORDER BY ct.size_ft, ct.code`,
    [bookingId]
  );
}

/**
 * UC-5 Create Booking
 *
 * ทุกขั้นอยู่ใน transaction เดียว และล็อกแถวเที่ยวเรือด้วย SELECT ... FOR UPDATE
 * เหตุผล: มี EC2 2 เครื่องรับ request พร้อมกันได้ ถ้าสองคนจองที่นั่งสุดท้ายพร้อมกัน
 * โดยไม่ล็อก ทั้งคู่จะอ่าน booked_teu ค่าเดิมแล้วจองผ่านทั้งคู่ → เที่ยวเรือเกิน quota
 * นี่คือบั๊กที่มองไม่เห็นตอนรันเครื่องเดียว แต่โผล่ทันทีเมื่ออยู่หลัง Load Balancer
 */
async function createBooking(userId, input) {
  return db.tx(async (conn) => {
    const [scheduleRows] = await conn.execute(
      `SELECT vs.*, s.base_price
         FROM vessel_schedules vs
         JOIN services s ON s.id = vs.service_id
        WHERE vs.id = ? FOR UPDATE`,
      [input.schedule_id]
    );
    if (scheduleRows.length === 0) throw notFound('ไม่พบเที่ยวเรือที่ต้องการจอง');
    const schedule = scheduleRows[0];

    // UC-5 Precondition: บริการ/เที่ยวเรือที่เลือกต้องเปิดอยู่
    if (!['open', 'closing'].includes(schedule.status)) {
      throw conflict('เที่ยวเรือนี้ปิดรับการจองแล้ว กรุณาเลือกเที่ยวอื่น');
    }
    if (new Date(schedule.cutoff_at) < new Date()) {
      throw conflict('เลยกำหนดปิดรับการจอง (cut-off) ของเที่ยวเรือนี้แล้ว');
    }

    /**
     * รวมรายการที่เป็นตู้ประเภทเดียวกันเข้าด้วยกันก่อน
     *
     * ถ้าไม่รวม การส่ง [{id:1,qty:2},{id:1,qty:3}] จะทำให้ typeIds มีสองตัว
     * แต่ query คืนมาแถวเดียว แล้วการเทียบจำนวนด้านล่างจะสรุปผิดว่า
     * "มีประเภทตู้ที่เลือกไม่ถูกต้อง" ทั้งที่ตู้นั้นถูกต้อง เป็นการบอกเหตุผลที่ผิด
     * และยังทำให้เกิด booking_items สองแถวของตู้ประเภทเดียวกันโดยไม่จำเป็น
     */
    const mergedItems = [...
      input.items
        .reduce((acc, item) => {
          const current = acc.get(item.container_type_id) ?? 0;
          acc.set(item.container_type_id, current + item.qty);
          return acc;
        }, new Map())
    ].map(([container_type_id, qty]) => ({ container_type_id, qty }));

    // คิด TEU และราคาจากตู้ที่เลือก
    const typeIds = mergedItems.map((i) => i.container_type_id);
    const placeholders = typeIds.map(() => '?').join(',');
    const [typeRows] = await conn.execute(
      `SELECT * FROM container_types WHERE id IN (${placeholders}) AND is_active = 1`,
      typeIds
    );
    if (typeRows.length !== typeIds.length) {
      throw badRequest('มีประเภทตู้คอนเทนเนอร์ที่เลือกไม่ถูกต้องหรือถูกปิดใช้งานแล้ว');
    }
    const typeById = new Map(typeRows.map((t) => [t.id, t]));

    let totalTeu = 0;
    let totalPrice = 0;
    const priced = mergedItems.map((item) => {
      const type = typeById.get(item.container_type_id);
      const unitPrice = Number(schedule.base_price) * Number(type.teu_factor);
      totalTeu += Number(type.teu_factor) * item.qty;
      totalPrice += unitPrice * item.qty;
      return { ...item, unit_price: unitPrice };
    });

    // UC-5 Alternate Flow 1: ระบบรับการจองไม่ได้เพราะพื้นที่ไม่พอ
    const available = schedule.capacity_teu - schedule.booked_teu;
    if (totalTeu > available) {
      throw conflict('เที่ยวเรือนี้มีพื้นที่ไม่เพียงพอสำหรับจำนวนตู้ที่ต้องการ', {
        requestedTeu: totalTeu,
        availableTeu: available,
        capacityTeu: schedule.capacity_teu,
      });
    }

    const [seqRow] = await conn.execute(
      'SELECT COUNT(*) AS c FROM bookings WHERE DATE(created_at) = CURDATE()'
    );
    const bookingNo = makeDocNo('BK', seqRow[0].c + 1);

    const [result] = await conn.execute(
      `INSERT INTO bookings
         (booking_no, user_id, schedule_id, service_id, cargo_type, cargo_weight_kg,
          pickup_location, notes, total_teu, total_price, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
      [
        bookingNo,
        userId,
        schedule.id,
        schedule.service_id,
        input.cargo_type,
        input.cargo_weight_kg ?? 0,
        input.pickup_location ?? null,
        input.notes ?? null,
        totalTeu,
        totalPrice,
      ]
    );

    for (const item of priced) {
      await conn.execute(
        'INSERT INTO booking_items (booking_id, container_type_id, qty, unit_price) VALUES (?, ?, ?, ?)',
        [result.insertId, item.container_type_id, item.qty, item.unit_price]
      );
    }

    // กันที่ไว้ทันทีตั้งแต่ pending — ไม่งั้นลูกค้าหลายรายจะจองที่เดียวกันซ้อนกัน
    await conn.execute('UPDATE vessel_schedules SET booked_teu = booked_teu + ? WHERE id = ?', [
      totalTeu,
      schedule.id,
    ]);

    return { id: result.insertId, booking_no: bookingNo };
  });
}

/**
 * UC-6 Confirm Booking
 * เปลี่ยน pending → confirmed แล้วสร้าง Shipment Order ตามที่ Normal Flow ข้อ 8 ระบุ
 */
async function confirmBooking(bookingId, userId, { asAdmin = false } = {}) {
  return db.tx(async (conn) => {
    const [rows] = await conn.execute('SELECT * FROM bookings WHERE id = ? FOR UPDATE', [bookingId]);
    if (rows.length === 0) throw notFound('ไม่พบรายการจองที่ต้องการ');
    const booking = rows[0];

    if (!asAdmin && booking.user_id !== userId) throw notFound('ไม่พบรายการจองที่ต้องการ');

    // UC-6 Precondition: ต้องอยู่ในสถานะ pending เท่านั้น
    if (booking.status !== 'pending') {
      throw conflict(
        booking.status === 'cancelled'
          ? 'รายการจองนี้ถูกยกเลิกไปแล้ว ไม่สามารถยืนยันได้'
          : 'รายการจองนี้ได้รับการยืนยันไปแล้ว'
      );
    }

    const [scheduleRows] = await conn.execute('SELECT * FROM vessel_schedules WHERE id = ? FOR UPDATE', [
      booking.schedule_id,
    ]);
    if (!['open', 'closing'].includes(scheduleRows[0].status)) {
      throw conflict('เที่ยวเรือนี้ปิดรับแล้ว ไม่สามารถยืนยันการจองได้');
    }

    await conn.execute("UPDATE bookings SET status = 'confirmed', confirmed_at = NOW() WHERE id = ?", [
      bookingId,
    ]);

    const [seqRow] = await conn.execute(
      'SELECT COUNT(*) AS c FROM shipment_orders WHERE DATE(created_at) = CURDATE()'
    );
    const orderNo = makeDocNo('SO', seqRow[0].c + 1);
    await conn.execute(
      "INSERT INTO shipment_orders (order_no, booking_id, status) VALUES (?, ?, 'created')",
      [orderNo, bookingId]
    );

    return { booking_no: booking.booking_no, shipment_order_no: orderNo };
  });
}

/** ยกเลิกการจอง — คืน quota ให้เที่ยวเรือ ไม่งั้นที่ว่างจะหายไปเฉย ๆ */
async function cancelBooking(bookingId, userId, { asAdmin = false } = {}) {
  return db.tx(async (conn) => {
    const [rows] = await conn.execute('SELECT * FROM bookings WHERE id = ? FOR UPDATE', [bookingId]);
    if (rows.length === 0) throw notFound('ไม่พบรายการจองที่ต้องการ');
    const booking = rows[0];

    if (!asAdmin && booking.user_id !== userId) throw notFound('ไม่พบรายการจองที่ต้องการ');
    if (['cancelled', 'completed'].includes(booking.status)) {
      throw conflict('รายการจองนี้ไม่สามารถยกเลิกได้แล้ว');
    }

    await conn.execute("UPDATE bookings SET status = 'cancelled' WHERE id = ?", [bookingId]);
    await conn.execute('UPDATE vessel_schedules SET booked_teu = GREATEST(booked_teu - ?, 0) WHERE id = ?', [
      booking.total_teu,
      booking.schedule_id,
    ]);

    return { booking_no: booking.booking_no };
  });
}

/** UC-7 View Bookings — เรียงรายการล่าสุดขึ้นก่อนตาม Normal Flow ข้อ 3 */
async function listBookings({ userId = null, status = null, q = null, page = 1, pageSize = 20 }) {
  const where = [];
  const params = [];

  if (userId) {
    where.push('b.user_id = ?');
    params.push(userId);
  }
  if (status) {
    where.push('b.status = ?');
    params.push(status);
  }
  if (q) {
    where.push('(b.booking_no LIKE ? OR u.full_name LIKE ? OR u.company_name LIKE ? OR vs.voyage_no LIKE ?)');
    const like = `%${q}%`;
    params.push(like, like, like, like);
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const offset = (page - 1) * pageSize;

  const [{ total }] = await db.query(
    `SELECT COUNT(*) AS total
       FROM bookings b
       JOIN users u ON u.id = b.user_id
       JOIN vessel_schedules vs ON vs.id = b.schedule_id
       ${whereSql}`,
    params
  );

  const items = await db.query(
    `${BOOKING_SELECT} ${whereSql} ORDER BY b.created_at DESC LIMIT ${pageSize} OFFSET ${offset}`,
    params
  );

  return { items, total, page, pageSize };
}

async function getBooking(bookingId, { userId = null, asAdmin = false } = {}) {
  const rows = await db.query(`${BOOKING_SELECT} WHERE b.id = ?`, [bookingId]);
  if (rows.length === 0) throw notFound('ไม่พบรายการจองที่ต้องการ');

  const booking = rows[0];
  // ลูกค้าเห็นได้เฉพาะของตัวเอง — ตอบ 404 ไม่ใช่ 403 เพื่อไม่ให้เดาได้ว่ามี id นี้อยู่จริง
  if (!asAdmin && booking.user_id !== userId) throw notFound('ไม่พบรายการจองที่ต้องการ');

  booking.items = await getItems(booking.id);
  return booking;
}

module.exports = {
  createBooking,
  confirmBooking,
  cancelBooking,
  listBookings,
  getBooking,
  makeDocNo,
};
