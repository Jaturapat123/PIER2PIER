'use strict';

const express = require('express');
const { z } = require('zod');

const db = require('../db/pool');
const validate = require('../middleware/validate');
const { asyncHandler, notFound } = require('../utils/httpError');

const router = express.Router();

const listQuery = z.object({
  q: z.string().trim().max(120).optional(),
  serviceId: z.coerce.number().int().positive().optional(),
  serviceType: z.enum(['import', 'export', 'transshipment', 'storage']).optional(),
  from: z.string().trim().optional(),
  to: z.string().trim().optional(),
  status: z.enum(['open', 'closing', 'closed', 'departed']).optional(),
  availableOnly: z.coerce.boolean().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

const SELECT_SCHEDULE = `
  SELECT vs.*, v.name AS vessel_name, v.imo_number, v.operator,
         s.code AS service_code, s.name AS service_name, s.service_type,
         s.origin_port, s.destination_port, s.base_price,
         (vs.capacity_teu - vs.booked_teu) AS available_teu
    FROM vessel_schedules vs
    JOIN vessels  v ON v.id = vs.vessel_id
    JOIN services s ON s.id = vs.service_id`;

/** UC-3 / UC-4 — ค้นหาเที่ยวเรือ ซึ่งเป็นหน่วยที่ลูกค้าจองจริง */
router.get(
  '/',
  validate({ query: listQuery }),
  asyncHandler(async (req, res) => {
    const { q, serviceId, serviceType, from, to, status, availableOnly, page, pageSize } = req.query;

    const where = [];
    const params = [];

    if (q) {
      where.push('(v.name LIKE ? OR vs.voyage_no LIKE ? OR s.name LIKE ? OR s.origin_port LIKE ? OR s.destination_port LIKE ?)');
      const like = `%${q}%`;
      params.push(like, like, like, like, like);
    }
    if (serviceId) {
      where.push('vs.service_id = ?');
      params.push(serviceId);
    }
    // กรองที่ฐานข้อมูล ไม่ใช่กรองหลังดึงมาแล้ว ไม่งั้นจะได้ผลเฉพาะที่อยู่ในหน้าปัจจุบัน
    // และตัวเลข "พบกี่รายการ" ที่แสดงบนหน้าจอจะไม่ตรงกับความจริง
    if (serviceType) {
      where.push('s.service_type = ?');
      params.push(serviceType);
    }
    if (from) {
      where.push('vs.etd >= ?');
      params.push(from);
    }
    if (to) {
      where.push('vs.etd <= ?');
      params.push(to);
    }
    if (status) {
      where.push('vs.status = ?');
      params.push(status);
    }
    if (availableOnly) {
      where.push("vs.status IN ('open','closing') AND vs.booked_teu < vs.capacity_teu");
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const offset = (page - 1) * pageSize;

    const [{ total }] = await db.query(
      `SELECT COUNT(*) AS total
         FROM vessel_schedules vs
         JOIN vessels v ON v.id = vs.vessel_id
         JOIN services s ON s.id = vs.service_id
         ${whereSql}`,
      params
    );

    const items = await db.query(
      `${SELECT_SCHEDULE} ${whereSql} ORDER BY vs.etd ASC LIMIT ${pageSize} OFFSET ${offset}`,
      params
    );

    res.json({ items, total, page, pageSize });
  })
);

router.get(
  '/:id',
  validate({ params: z.object({ id: z.coerce.number().int().positive() }) }),
  asyncHandler(async (req, res) => {
    const rows = await db.query(`${SELECT_SCHEDULE} WHERE vs.id = ?`, [req.params.id]);
    if (rows.length === 0) throw notFound('ไม่พบเที่ยวเรือที่ต้องการ');

    const containerTypes = await db.query(
      'SELECT * FROM container_types WHERE is_active = 1 ORDER BY size_ft, code'
    );

    res.json({ schedule: rows[0], containerTypes });
  })
);

module.exports = router;
