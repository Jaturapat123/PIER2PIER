'use strict';

const express = require('express');
const { z } = require('zod');

const validate = require('../middleware/validate');
const { requireAuth } = require('../middleware/auth');
const { asyncHandler } = require('../utils/httpError');
const bookingService = require('../services/booking.service');
const audit = require('../services/audit');

const router = express.Router();

router.use(requireAuth);

const createSchema = z.object({
  schedule_id: z.coerce.number().int().positive(),
  cargo_type: z.string().trim().min(1, 'กรุณาระบุประเภทสินค้า').max(120),
  cargo_weight_kg: z.coerce.number().int().min(0).max(100000000).optional(),
  pickup_location: z.string().trim().max(255).optional().or(z.literal('')),
  notes: z.string().trim().max(2000).optional().or(z.literal('')),
  items: z
    .array(
      z.object({
        container_type_id: z.coerce.number().int().positive(),
        qty: z.coerce.number().int().min(1, 'จำนวนตู้ต้องอย่างน้อย 1 ตู้').max(500),
      })
    )
    .min(1, 'กรุณาเลือกประเภทตู้อย่างน้อย 1 รายการ'),
});

const idParam = z.object({ id: z.coerce.number().int().positive() });

/** UC-5 Create Booking */
router.post(
  '/',
  validate({ body: createSchema }),
  asyncHandler(async (req, res) => {
    const created = await bookingService.createBooking(req.user.id, req.body);
    await audit(req.user.id, 'create_booking', 'booking', created.id, { booking_no: created.booking_no });

    const booking = await bookingService.getBooking(created.id, { userId: req.user.id });
    res.status(201).json({ message: 'สร้างรายการจองเรียบร้อยแล้ว', booking });
  })
);

/** UC-7 View Bookings */
router.get(
  '/',
  validate({
    query: z.object({
      status: z.enum(['pending', 'confirmed', 'in_progress', 'completed', 'cancelled']).optional(),
      page: z.coerce.number().int().min(1).default(1),
      pageSize: z.coerce.number().int().min(1).max(100).default(20),
    }),
  }),
  asyncHandler(async (req, res) => {
    const result = await bookingService.listBookings({ userId: req.user.id, ...req.query });
    res.json(result);
  })
);

router.get(
  '/:id',
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    const booking = await bookingService.getBooking(req.params.id, { userId: req.user.id });
    res.json({ booking });
  })
);

/** UC-6 Confirm Booking */
router.post(
  '/:id/confirm',
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    const result = await bookingService.confirmBooking(req.params.id, req.user.id);
    await audit(req.user.id, 'confirm_booking', 'booking', req.params.id, result);

    const booking = await bookingService.getBooking(req.params.id, { userId: req.user.id });
    res.json({ message: 'ยืนยันการจองเรียบร้อยแล้ว', booking });
  })
);

router.post(
  '/:id/cancel',
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    const result = await bookingService.cancelBooking(req.params.id, req.user.id);
    await audit(req.user.id, 'cancel_booking', 'booking', req.params.id, result);

    const booking = await bookingService.getBooking(req.params.id, { userId: req.user.id });
    res.json({ message: 'ยกเลิกการจองเรียบร้อยแล้ว', booking });
  })
);

module.exports = router;
