'use strict';

const express = require('express');
const { requireAuth, requireRole } = require('../../middleware/auth');

const router = express.Router();

// ทุกเส้นทางใต้ /api/admin ต้องเป็น admin เท่านั้น — บังคับที่จุดเดียว
// ปลอดภัยกว่าการไปแปะ requireRole ทีละ route แล้วลืมสักอัน
router.use(requireAuth, requireRole('admin'));

router.use('/users', require('./users'));
router.use('/services', require('./services'));
router.use('/schedules', require('./schedules'));
router.use('/container-types', require('./containers'));
router.use('/bookings', require('./bookings'));
router.use('/stock', require('./stock'));
router.use('/reports', require('./reports'));
router.use('/audit-logs', require('./audit'));

module.exports = router;
