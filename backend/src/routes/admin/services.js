'use strict';

const express = require('express');
const { z } = require('zod');

const db = require('../../db/pool');
const validate = require('../../middleware/validate');
const { asyncHandler, notFound, conflict } = require('../../utils/httpError');
const audit = require('../../services/audit');

const router = express.Router();
const idParam = z.object({ id: z.coerce.number().int().positive() });

const bodySchema = z.object({
  code: z.string().trim().min(2, 'กรุณากรอกรหัสบริการ').max(30),
  name: z.string().trim().min(1, 'กรุณากรอกชื่อบริการ').max(150),
  service_type: z.enum(['import', 'export', 'transshipment', 'storage']),
  origin_port: z.string().trim().min(1, 'กรุณากรอกท่าเรือต้นทาง').max(100),
  destination_port: z.string().trim().min(1, 'กรุณากรอกท่าเรือปลายทาง').max(100),
  transit_days: z.coerce.number().int().min(0).max(365).default(0),
  base_price: z.coerce.number().min(0).max(99999999),
  description: z.string().trim().max(2000).optional().or(z.literal('')),
  status: z.enum(['active', 'inactive']).default('active'),
});

/** UC-11 Manage Services */
router.get(
  '/',
  validate({
    query: z.object({
      q: z.string().trim().max(120).optional(),
      status: z.enum(['active', 'inactive']).optional(),
      page: z.coerce.number().int().min(1).default(1),
      pageSize: z.coerce.number().int().min(1).max(100).default(50),
    }),
  }),
  asyncHandler(async (req, res) => {
    const { q, status, page, pageSize } = req.query;
    const where = [];
    const params = [];

    if (q) {
      where.push('(name LIKE ? OR code LIKE ? OR origin_port LIKE ? OR destination_port LIKE ?)');
      const like = `%${q}%`;
      params.push(like, like, like, like);
    }
    if (status) {
      where.push('status = ?');
      params.push(status);
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const offset = (page - 1) * pageSize;

    const [{ total }] = await db.query(`SELECT COUNT(*) AS total FROM services ${whereSql}`, params);
    const items = await db.query(
      `SELECT s.*,
              (SELECT COUNT(*) FROM vessel_schedules vs WHERE vs.service_id = s.id) AS schedule_count
         FROM services s ${whereSql}
        ORDER BY s.service_type, s.name LIMIT ${pageSize} OFFSET ${offset}`,
      params
    );

    res.json({ items, total, page, pageSize });
  })
);

router.post(
  '/',
  validate({ body: bodySchema }),
  asyncHandler(async (req, res) => {
    const b = req.body;
    const dup = await db.queryOne('SELECT id FROM services WHERE code = ?', [b.code]);
    if (dup) throw conflict('รหัสบริการนี้ถูกใช้งานไปแล้ว');

    const result = await db.query(
      `INSERT INTO services (code, name, service_type, origin_port, destination_port, transit_days, base_price, description, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [b.code, b.name, b.service_type, b.origin_port, b.destination_port, b.transit_days, b.base_price, b.description || null, b.status]
    );
    await audit(req.user.id, 'create_service', 'service', result.insertId, { code: b.code });

    const service = await db.queryOne('SELECT * FROM services WHERE id = ?', [result.insertId]);
    res.status(201).json({ message: 'เพิ่มบริการเรียบร้อยแล้ว', service });
  })
);

router.put(
  '/:id',
  validate({ params: idParam, body: bodySchema }),
  asyncHandler(async (req, res) => {
    const b = req.body;
    const existing = await db.queryOne('SELECT id FROM services WHERE id = ?', [req.params.id]);
    if (!existing) throw notFound('ไม่พบบริการที่ต้องการแก้ไข');

    const dup = await db.queryOne('SELECT id FROM services WHERE code = ? AND id <> ?', [b.code, req.params.id]);
    if (dup) throw conflict('รหัสบริการนี้ถูกใช้งานไปแล้ว');

    await db.query(
      `UPDATE services SET code = ?, name = ?, service_type = ?, origin_port = ?, destination_port = ?,
              transit_days = ?, base_price = ?, description = ?, status = ? WHERE id = ?`,
      [b.code, b.name, b.service_type, b.origin_port, b.destination_port, b.transit_days, b.base_price, b.description || null, b.status, req.params.id]
    );
    await audit(req.user.id, 'update_service', 'service', req.params.id, { code: b.code });

    const service = await db.queryOne('SELECT * FROM services WHERE id = ?', [req.params.id]);
    res.json({ message: 'บันทึกการเปลี่ยนแปลงเรียบร้อยแล้ว', service });
  })
);

router.delete(
  '/:id',
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    const service = await db.queryOne('SELECT id, code FROM services WHERE id = ?', [req.params.id]);
    if (!service) throw notFound('ไม่พบบริการที่ต้องการลบ');

    // UC-11 Alternate Flow 3: ห้ามลบข้อมูลที่ยังถูกอ้างถึงอยู่
    const [{ c }] = await db.query('SELECT COUNT(*) AS c FROM vessel_schedules WHERE service_id = ?', [
      req.params.id,
    ]);
    if (c > 0) {
      throw conflict(
        `ไม่สามารถลบบริการนี้ได้ เนื่องจากมีตารางเที่ยวเรือผูกอยู่ ${c} รายการ — แนะนำให้เปลี่ยนสถานะเป็น inactive แทน`
      );
    }

    await db.query('DELETE FROM services WHERE id = ?', [req.params.id]);
    await audit(req.user.id, 'delete_service', 'service', req.params.id, { code: service.code });
    res.json({ message: 'ลบบริการเรียบร้อยแล้ว' });
  })
);

module.exports = router;
