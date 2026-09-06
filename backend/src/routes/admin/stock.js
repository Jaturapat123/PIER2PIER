'use strict';

const express = require('express');
const { z } = require('zod');

const db = require('../../db/pool');
const validate = require('../../middleware/validate');
const { asyncHandler, notFound, conflict, badRequest } = require('../../utils/httpError');
const audit = require('../../services/audit');

const router = express.Router();
const idParam = z.object({ id: z.coerce.number().int().positive() });

const bodySchema = z.object({
  sku: z.string().trim().min(2, 'กรุณากรอกรหัสสินค้า (SKU)').max(40),
  name: z.string().trim().min(1, 'กรุณากรอกชื่อสินค้า').max(150),
  category: z.string().trim().max(80).optional().or(z.literal('')),
  unit: z.string().trim().min(1).max(20).default('ชิ้น'),
  warehouse_zone: z.string().trim().max(40).optional().or(z.literal('')),
  reorder_level: z.coerce.number().int().min(0).max(1000000).default(0),
  is_active: z.coerce.boolean().default(true),
});

/** UC-14 Manage Stock */
router.get(
  '/',
  validate({
    query: z.object({
      q: z.string().trim().max(120).optional(),
      zone: z.string().trim().max(40).optional(),
      lowOnly: z.coerce.boolean().optional(),
      page: z.coerce.number().int().min(1).default(1),
      pageSize: z.coerce.number().int().min(1).max(100).default(50),
    }),
  }),
  asyncHandler(async (req, res) => {
    const { q, zone, lowOnly, page, pageSize } = req.query;
    const where = [];
    const params = [];

    if (q) {
      where.push('(name LIKE ? OR sku LIKE ? OR category LIKE ?)');
      const like = `%${q}%`;
      params.push(like, like, like);
    }
    if (zone) {
      where.push('warehouse_zone = ?');
      params.push(zone);
    }
    // แจ้งเตือนของใกล้หมด: มาตรฐาน WMS ที่ใช้กันจริงในการเฝ้าระดับสต็อก
    if (lowOnly) where.push('qty_on_hand <= reorder_level');

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const offset = (page - 1) * pageSize;

    const [{ total }] = await db.query(`SELECT COUNT(*) AS total FROM stock_items ${whereSql}`, params);
    const items = await db.query(
      `SELECT *, (qty_on_hand <= reorder_level) AS is_low
         FROM stock_items ${whereSql}
        ORDER BY (qty_on_hand <= reorder_level) DESC, warehouse_zone, name
        LIMIT ${pageSize} OFFSET ${offset}`,
      params
    );

    const zones = await db.query(
      'SELECT DISTINCT warehouse_zone FROM stock_items WHERE warehouse_zone IS NOT NULL ORDER BY warehouse_zone'
    );

    res.json({ items, total, page, pageSize, zones: zones.map((z) => z.warehouse_zone) });
  })
);

router.post(
  '/',
  validate({ body: bodySchema }),
  asyncHandler(async (req, res) => {
    const b = req.body;
    const dup = await db.queryOne('SELECT id FROM stock_items WHERE sku = ?', [b.sku]);
    if (dup) throw conflict('รหัสสินค้า (SKU) นี้ถูกใช้งานไปแล้ว');

    const result = await db.query(
      `INSERT INTO stock_items (sku, name, category, unit, warehouse_zone, qty_on_hand, reorder_level, is_active)
       VALUES (?, ?, ?, ?, ?, 0, ?, ?)`,
      [b.sku, b.name, b.category || null, b.unit, b.warehouse_zone || null, b.reorder_level, b.is_active ? 1 : 0]
    );
    await audit(req.user.id, 'create_stock_item', 'stock_item', result.insertId, { sku: b.sku });

    const item = await db.queryOne('SELECT * FROM stock_items WHERE id = ?', [result.insertId]);
    res.status(201).json({ message: 'เพิ่มสินค้าเรียบร้อยแล้ว', item });
  })
);

router.put(
  '/:id',
  validate({ params: idParam, body: bodySchema }),
  asyncHandler(async (req, res) => {
    const b = req.body;
    const existing = await db.queryOne('SELECT id FROM stock_items WHERE id = ?', [req.params.id]);
    if (!existing) throw notFound('ไม่พบสินค้าที่ต้องการแก้ไข');

    const dup = await db.queryOne('SELECT id FROM stock_items WHERE sku = ? AND id <> ?', [b.sku, req.params.id]);
    if (dup) throw conflict('รหัสสินค้า (SKU) นี้ถูกใช้งานไปแล้ว');

    await db.query(
      `UPDATE stock_items SET sku = ?, name = ?, category = ?, unit = ?, warehouse_zone = ?,
              reorder_level = ?, is_active = ? WHERE id = ?`,
      [b.sku, b.name, b.category || null, b.unit, b.warehouse_zone || null, b.reorder_level, b.is_active ? 1 : 0, req.params.id]
    );
    await audit(req.user.id, 'update_stock_item', 'stock_item', req.params.id, { sku: b.sku });

    const item = await db.queryOne('SELECT * FROM stock_items WHERE id = ?', [req.params.id]);
    res.json({ message: 'บันทึกการเปลี่ยนแปลงเรียบร้อยแล้ว', item });
  })
);

/**
 * ปรับสต็อก — UC-14 Normal Flow ข้อ 4-7
 *
 * ทำใน transaction เดียวกับการเขียน stock_transactions เสมอ เพราะจำนวนคงเหลือ
 * ต้องอธิบายได้ด้วยประวัติการเคลื่อนไหวเสมอ ถ้าเขียนแค่ทางเดียวตัวเลขจะสาวกลับไม่ได้
 */
router.post(
  '/:id/adjust',
  validate({
    params: idParam,
    body: z.object({
      type: z.enum(['in', 'out', 'adjust']),
      qty: z.coerce.number().int().refine((n) => n !== 0, 'จำนวนต้องไม่เป็นศูนย์'),
      reason: z.string().trim().max(255).optional().or(z.literal('')),
    }),
  }),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { type, qty, reason } = req.body;

    // 'in' บวกเสมอ, 'out' ลบเสมอ, 'adjust' ใช้เครื่องหมายตามที่ผู้ใช้กรอก
    const delta = type === 'in' ? Math.abs(qty) : type === 'out' ? -Math.abs(qty) : qty;

    const result = await db.tx(async (conn) => {
      const [rows] = await conn.execute('SELECT * FROM stock_items WHERE id = ? FOR UPDATE', [id]);
      if (rows.length === 0) throw notFound('ไม่พบสินค้าที่ต้องการปรับสต็อก');
      const item = rows[0];

      // UC-14 Alternate Flow: จำนวนคงเหลือติดลบไม่ได้
      const newQty = item.qty_on_hand + delta;
      if (newQty < 0) {
        throw badRequest(
          `ปรับสต็อกไม่ได้ — คงเหลือปัจจุบัน ${item.qty_on_hand} ${item.unit} ไม่พอสำหรับการตัดออก ${Math.abs(delta)} ${item.unit}`
        );
      }

      await conn.execute('UPDATE stock_items SET qty_on_hand = ? WHERE id = ?', [newQty, id]);
      await conn.execute(
        'INSERT INTO stock_transactions (stock_item_id, change_qty, type, reason, admin_id) VALUES (?, ?, ?, ?, ?)',
        [id, delta, type, reason || null, req.user.id]
      );

      return { previousQty: item.qty_on_hand, newQty, delta };
    });

    await audit(req.user.id, 'adjust_stock', 'stock_item', id, result);
    const item = await db.queryOne('SELECT * FROM stock_items WHERE id = ?', [id]);
    res.json({ message: 'ปรับปรุงสต็อกเรียบร้อยแล้ว', item, ...result });
  })
);

/** ประวัติการเคลื่อนไหวสต็อก (Stock Transaction Log) */
router.get(
  '/:id/transactions',
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    const items = await db.query(
      `SELECT st.*, u.full_name AS admin_name
         FROM stock_transactions st
         JOIN users u ON u.id = st.admin_id
        WHERE st.stock_item_id = ?
        ORDER BY st.created_at DESC LIMIT 100`,
      [req.params.id]
    );
    res.json({ items });
  })
);

router.delete(
  '/:id',
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    const item = await db.queryOne('SELECT id, sku FROM stock_items WHERE id = ?', [req.params.id]);
    if (!item) throw notFound('ไม่พบสินค้าที่ต้องการลบ');

    const [{ c }] = await db.query('SELECT COUNT(*) AS c FROM stock_transactions WHERE stock_item_id = ?', [
      req.params.id,
    ]);
    if (c > 0) {
      throw conflict(
        `ไม่สามารถลบสินค้านี้ได้ เนื่องจากมีประวัติการเคลื่อนไหว ${c} รายการ — แนะนำให้ปิดการใช้งานแทน`
      );
    }

    await db.query('DELETE FROM stock_items WHERE id = ?', [req.params.id]);
    await audit(req.user.id, 'delete_stock_item', 'stock_item', req.params.id, { sku: item.sku });
    res.json({ message: 'ลบสินค้าเรียบร้อยแล้ว' });
  })
);

module.exports = router;
