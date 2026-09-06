'use strict';

const express = require('express');
const { z } = require('zod');

const validate = require('../../middleware/validate');
const { asyncHandler } = require('../../utils/httpError');
const reports = require('../../services/report.service');
const audit = require('../../services/audit');

const router = express.Router();

/** ค่าเริ่มต้น 30 วันย้อนหลัง — ช่วงที่ผู้ดูแลระบบดูบ่อยที่สุด */
const rangeQuery = z.object({
  from: z.string().trim().optional(),
  to: z.string().trim().optional(),
  format: z.enum(['json', 'csv']).default('json'),
});

function resolveRange({ from, to }) {
  const end = to ? `${to} 23:59:59` : new Date().toISOString().slice(0, 10) + ' 23:59:59';
  const startDate = from
    ? from
    : new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  return [`${startDate} 00:00:00`, end];
}

/** ส่งเป็นไฟล์ CSV เมื่อขอ format=csv ไม่งั้นส่ง JSON ให้ frontend วาดกราฟ */
function respond(res, rows, filename, format) {
  if (format === 'csv') {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}.csv"`);
    // BOM ทำให้ Excel บน Windows อ่านภาษาไทยได้ถูกต้อง ไม่งั้นจะเป็นตัวยึกยือ
    return res.send('﻿' + reports.toCsv(rows));
  }
  return res.json({ items: rows });
}

router.get(
  '/summary',
  validate({ query: rangeQuery }),
  asyncHandler(async (req, res) => {
    const [from, to] = resolveRange(req.query);
    const [data, trend, top, utilization] = await Promise.all([
      reports.summary(from, to),
      reports.bookingTrend(from, to),
      reports.topServices(from, to),
      reports.scheduleUtilization(),
    ]);
    res.json({ ...data, trend, topServices: top, scheduleUtilization: utilization });
  })
);

router.get(
  '/bookings',
  validate({ query: rangeQuery }),
  asyncHandler(async (req, res) => {
    const [from, to] = resolveRange(req.query);
    const rows = await reports.bookingTrend(from, to);
    if (req.query.format === 'csv') await audit(req.user.id, 'export_report', 'report', 'bookings');
    respond(res, rows, 'booking-report', req.query.format);
  })
);

router.get(
  '/services',
  validate({ query: rangeQuery }),
  asyncHandler(async (req, res) => {
    const [from, to] = resolveRange(req.query);
    const rows = await reports.topServices(from, to, 100);
    if (req.query.format === 'csv') await audit(req.user.id, 'export_report', 'report', 'services');
    respond(res, rows, 'service-report', req.query.format);
  })
);

router.get(
  '/stock',
  validate({ query: rangeQuery }),
  asyncHandler(async (req, res) => {
    const data = await reports.stockReport();
    if (req.query.format === 'csv') {
      await audit(req.user.id, 'export_report', 'report', 'stock');
      return respond(res, data.items, 'stock-report', 'csv');
    }
    res.json(data);
  })
);

module.exports = router;
