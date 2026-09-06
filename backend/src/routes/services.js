'use strict';

const express = require('express');
const { z } = require('zod');

const db = require('../db/pool');
const validate = require('../middleware/validate');
const { asyncHandler, notFound } = require('../utils/httpError');

const router = express.Router();

const listQuery = z.object({
  q: z.string().trim().max(120).optional(),
  type: z.enum(['import', 'export', 'transshipment', 'storage']).optional(),
  origin: z.string().trim().max(100).optional(),
  destination: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

/**
 * UC-3 View Services + UC-4 Search Services
 *
 * ทั้งสอง Use Case ใช้ endpoint เดียวกัน ต่างกันแค่มี query string หรือไม่
 * ตาม UC-4 Alternate Flow 1 "ไม่พบข้อมูล" ต้องคืน 200 พร้อมรายการว่าง
 * ไม่ใช่ 404 — เพราะการค้นหาที่ไม่เจอไม่ใช่ error ของระบบ
 */
router.get(
  '/',
  validate({ query: listQuery }),
  asyncHandler(async (req, res) => {
    const { q, type, origin, destination, page, pageSize } = req.query;

    const where = ["s.status = 'active'"];
    const params = [];

    if (q) {
      where.push('(s.name LIKE ? OR s.code LIKE ? OR s.origin_port LIKE ? OR s.destination_port LIKE ?)');
      const like = `%${q}%`;
      params.push(like, like, like, like);
    }
    if (type) {
      where.push('s.service_type = ?');
      params.push(type);
    }
    if (origin) {
      where.push('s.origin_port LIKE ?');
      params.push(`%${origin}%`);
    }
    if (destination) {
      where.push('s.destination_port LIKE ?');
      params.push(`%${destination}%`);
    }

    const whereSql = `WHERE ${where.join(' AND ')}`;
    const offset = (page - 1) * pageSize;

    const [{ total }] = await db.query(`SELECT COUNT(*) AS total FROM services s ${whereSql}`, params);

    // นับเที่ยวเรือที่ยังเปิดจองอยู่มาด้วย เพื่อให้การ์ดบริการบอกได้ทันทีว่าจองได้ไหม
    const items = await db.query(
      `SELECT s.*,
              (SELECT COUNT(*) FROM vessel_schedules vs
                WHERE vs.service_id = s.id AND vs.status IN ('open','closing') AND vs.etd > NOW()
              ) AS open_schedules
         FROM services s
         ${whereSql}
         ORDER BY s.service_type, s.name
         LIMIT ${pageSize} OFFSET ${offset}`,
      params
    );

    res.json({ items, total, page, pageSize });
  })
);

router.get(
  '/:id',
  validate({ params: z.object({ id: z.coerce.number().int().positive() }) }),
  asyncHandler(async (req, res) => {
    const service = await db.queryOne('SELECT * FROM services WHERE id = ?', [req.params.id]);
    if (!service) throw notFound('ไม่พบบริการที่ต้องการ');

    const schedules = await db.query(
      `SELECT vs.*, v.name AS vessel_name, v.imo_number, v.operator,
              (vs.capacity_teu - vs.booked_teu) AS available_teu
         FROM vessel_schedules vs
         JOIN vessels v ON v.id = vs.vessel_id
        WHERE vs.service_id = ?
        ORDER BY vs.etd ASC`,
      [service.id]
    );

    res.json({ service, schedules });
  })
);

module.exports = router;
