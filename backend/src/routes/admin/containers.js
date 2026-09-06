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
  code: z.string().trim().min(2, 'กรุณากรอกรหัสประเภทตู้').max(20),
  name: z.string().trim().min(1, 'กรุณากรอกชื่อประเภทตู้').max(100),
  size_ft: z.coerce.number().int().min(1).max(100),
  teu_factor: z.coerce.number().min(0.1).max(10),
  max_payload_kg: z.coerce.number().int().min(0).max(1000000).default(0),
  description: z.string().trim().max(255).optional().or(z.literal('')),
  is_active: z.coerce.boolean().default(true),
});

/** UC-12 Manage Container Types */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const items = await db.query(
      `SELECT ct.*,
              (SELECT COUNT(*) FROM booking_items bi WHERE bi.container_type_id = ct.id) AS usage_count
         FROM container_types ct
        ORDER BY ct.size_ft, ct.code`
    );
    res.json({ items, total: items.length });
  })
);

router.post(
  '/',
  validate({ body: bodySchema }),
  asyncHandler(async (req, res) => {
    const b = req.body;
    const dup = await db.queryOne('SELECT id FROM container_types WHERE code = ?', [b.code]);
    if (dup) throw conflict('รหัสประเภทตู้นี้ถูกใช้งานไปแล้ว');

    const result = await db.query(
      `INSERT INTO container_types (code, name, size_ft, teu_factor, max_payload_kg, description, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [b.code, b.name, b.size_ft, b.teu_factor, b.max_payload_kg, b.description || null, b.is_active ? 1 : 0]
    );
    await audit(req.user.id, 'create_container_type', 'container_type', result.insertId, { code: b.code });

    const item = await db.queryOne('SELECT * FROM container_types WHERE id = ?', [result.insertId]);
    res.status(201).json({ message: 'เพิ่มประเภทตู้คอนเทนเนอร์เรียบร้อยแล้ว', item });
  })
);

router.put(
  '/:id',
  validate({ params: idParam, body: bodySchema }),
  asyncHandler(async (req, res) => {
    const b = req.body;
    const existing = await db.queryOne('SELECT id FROM container_types WHERE id = ?', [req.params.id]);
    if (!existing) throw notFound('ไม่พบประเภทตู้ที่ต้องการแก้ไข');

    const dup = await db.queryOne('SELECT id FROM container_types WHERE code = ? AND id <> ?', [
      b.code,
      req.params.id,
    ]);
    if (dup) throw conflict('รหัสประเภทตู้นี้ถูกใช้งานไปแล้ว');

    await db.query(
      `UPDATE container_types SET code = ?, name = ?, size_ft = ?, teu_factor = ?, max_payload_kg = ?,
              description = ?, is_active = ? WHERE id = ?`,
      [b.code, b.name, b.size_ft, b.teu_factor, b.max_payload_kg, b.description || null, b.is_active ? 1 : 0, req.params.id]
    );
    await audit(req.user.id, 'update_container_type', 'container_type', req.params.id, { code: b.code });

    const item = await db.queryOne('SELECT * FROM container_types WHERE id = ?', [req.params.id]);
    res.json({ message: 'บันทึกการเปลี่ยนแปลงเรียบร้อยแล้ว', item });
  })
);

router.delete(
  '/:id',
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    const item = await db.queryOne('SELECT id, code FROM container_types WHERE id = ?', [req.params.id]);
    if (!item) throw notFound('ไม่พบประเภทตู้ที่ต้องการลบ');

    // UC-12 Alternate Flow 3: ประเภทตู้ที่ถูกใช้ใน Booking แล้วลบไม่ได้
    const [{ c }] = await db.query('SELECT COUNT(*) AS c FROM booking_items WHERE container_type_id = ?', [
      req.params.id,
    ]);
    if (c > 0) {
      throw conflict(
        `ไม่สามารถลบประเภทตู้นี้ได้ เนื่องจากถูกใช้ในรายการจองแล้ว ${c} รายการ — แนะนำให้ปิดการใช้งานแทน`
      );
    }

    await db.query('DELETE FROM container_types WHERE id = ?', [req.params.id]);
    await audit(req.user.id, 'delete_container_type', 'container_type', req.params.id, { code: item.code });
    res.json({ message: 'ลบประเภทตู้คอนเทนเนอร์เรียบร้อยแล้ว' });
  })
);

module.exports = router;
