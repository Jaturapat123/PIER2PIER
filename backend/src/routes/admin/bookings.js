'use strict';

const express = require('express');
const { z } = require('zod');

const db = require('../../db/pool');
const validate = require('../../middleware/validate');
const { asyncHandler, notFound, badRequest } = require('../../utils/httpError');
const bookingService = require('../../services/booking.service');
const audit = require('../../services/audit');

const router = express.Router();
const idParam = z.object({ id: z.coerce.number().int().positive() });

/**
 * ลำดับสถานะที่อนุญาต — ป้องกันการข้ามขั้น เช่นกระโดดจาก pending ไป completed
 * โดยไม่ผ่าน confirmed ซึ่งจะทำให้ไม่มี Shipment Order
 */
const ALLOWED_TRANSITIONS = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['in_progress', 'cancelled'],
  in_progress: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
};

/** UC-13 Manage Bookings */
router.get(
  '/',
  validate({
    query: z.object({
      q: z.string().trim().max(120).optional(),
      status: z.enum(['pending', 'confirmed', 'in_progress', 'completed', 'cancelled']).optional(),
      page: z.coerce.number().int().min(1).default(1),
      pageSize: z.coerce.number().int().min(1).max(100).default(20),
    }),
  }),
  asyncHandler(async (req, res) => {
    const result = await bookingService.listBookings(req.query);
    res.json(result);
  })
);

router.get(
  '/:id',
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    const booking = await bookingService.getBooking(req.params.id, { asAdmin: true });
    res.json({ booking });
  })
);

/** เปลี่ยนสถานะการจอง (UC-13 Normal Flow ข้อ 5) */
router.patch(
  '/:id/status',
  validate({
    params: idParam,
    body: z.object({
      status: z.enum(['pending', 'confirmed', 'in_progress', 'completed', 'cancelled']),
    }),
  }),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;

    const booking = await db.queryOne('SELECT * FROM bookings WHERE id = ?', [id]);
    if (!booking) throw notFound('ไม่พบรายการจองที่ต้องการ');

    if (!ALLOWED_TRANSITIONS[booking.status].includes(status)) {
      throw badRequest(
        `ไม่สามารถเปลี่ยนสถานะจาก "${booking.status}" เป็น "${status}" ได้`,
        [{ field: 'status', message: `สถานะที่เปลี่ยนได้: ${ALLOWED_TRANSITIONS[booking.status].join(', ') || 'ไม่มี'}` }]
      );
    }

    // ใช้ service เดิมเพื่อให้ side effect (สร้าง shipment order / คืน quota) เกิดครบเหมือนกัน
    if (status === 'confirmed') {
      await bookingService.confirmBooking(id, req.user.id, { asAdmin: true });
    } else if (status === 'cancelled') {
      await bookingService.cancelBooking(id, req.user.id, { asAdmin: true });
    } else {
      await db.query('UPDATE bookings SET status = ? WHERE id = ?', [status, id]);
    }

    await audit(req.user.id, 'update_booking_status', 'booking', id, { from: booking.status, to: status });
    const updated = await bookingService.getBooking(id, { asAdmin: true });
    res.json({ message: 'อัปเดตสถานะรายการจองเรียบร้อยแล้ว', booking: updated });
  })
);

/** อัปเดตความคืบหน้าของ Shipment Order — เป็นที่มาของ dwell time ในรายงาน */
router.patch(
  '/:id/shipment',
  validate({
    params: idParam,
    body: z.object({ status: z.enum(['created', 'gate_in', 'loaded', 'departed', 'delivered']) }),
  }),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;

    const order = await db.queryOne('SELECT * FROM shipment_orders WHERE booking_id = ?', [id]);
    if (!order) throw notFound('รายการจองนี้ยังไม่มี Shipment Order — ต้องยืนยันการจองก่อน');

    const timestampColumn = {
      gate_in: 'gate_in_at',
      loaded: 'loaded_at',
      departed: 'departed_at',
      delivered: 'delivered_at',
    }[status];

    const setClause = timestampColumn
      ? `status = ?, ${timestampColumn} = COALESCE(${timestampColumn}, NOW())`
      : 'status = ?';

    await db.query(`UPDATE shipment_orders SET ${setClause} WHERE id = ?`, [status, order.id]);
    await audit(req.user.id, 'update_shipment_status', 'shipment_order', order.id, {
      from: order.status,
      to: status,
    });

    const booking = await bookingService.getBooking(id, { asAdmin: true });
    res.json({ message: 'อัปเดตสถานะการขนส่งเรียบร้อยแล้ว', booking });
  })
);

module.exports = router;
