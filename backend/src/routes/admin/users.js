'use strict';

const express = require('express');
const bcrypt = require('bcryptjs');
const { z } = require('zod');

const db = require('../../db/pool');
const validate = require('../../middleware/validate');
const { asyncHandler, notFound, conflict, badRequest } = require('../../utils/httpError');
const audit = require('../../services/audit');

const router = express.Router();

const FIELDS = 'id, username, full_name, email, phone, company_name, role, status, created_at, updated_at';
const idParam = z.object({ id: z.coerce.number().int().positive() });

/** UC-10 Manage Users */
router.get(
  '/',
  validate({
    query: z.object({
      q: z.string().trim().max(120).optional(),
      role: z.enum(['customer', 'admin']).optional(),
      status: z.enum(['active', 'suspended']).optional(),
      page: z.coerce.number().int().min(1).default(1),
      pageSize: z.coerce.number().int().min(1).max(100).default(20),
    }),
  }),
  asyncHandler(async (req, res) => {
    const { q, role, status, page, pageSize } = req.query;
    const where = [];
    const params = [];

    if (q) {
      where.push('(full_name LIKE ? OR email LIKE ? OR username LIKE ? OR company_name LIKE ?)');
      const like = `%${q}%`;
      params.push(like, like, like, like);
    }
    if (role) {
      where.push('role = ?');
      params.push(role);
    }
    if (status) {
      where.push('status = ?');
      params.push(status);
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const offset = (page - 1) * pageSize;

    const [{ total }] = await db.query(`SELECT COUNT(*) AS total FROM users ${whereSql}`, params);
    const items = await db.query(
      `SELECT ${FIELDS},
              (SELECT COUNT(*) FROM bookings b WHERE b.user_id = users.id) AS booking_count
         FROM users ${whereSql}
        ORDER BY created_at DESC LIMIT ${pageSize} OFFSET ${offset}`,
      params
    );

    res.json({ items, total, page, pageSize });
  })
);

router.post(
  '/',
  validate({
    body: z.object({
      username: z.string().trim().min(3).max(50),
      full_name: z.string().trim().min(1).max(150),
      email: z.string().trim().toLowerCase().email('รูปแบบอีเมลไม่ถูกต้อง').max(150),
      phone: z.string().trim().max(30).optional().or(z.literal('')),
      company_name: z.string().trim().max(150).optional().or(z.literal('')),
      password: z.string().min(8, 'รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร').max(72),
      role: z.enum(['customer', 'admin']).default('customer'),
    }),
  }),
  asyncHandler(async (req, res) => {
    const { username, full_name, email, phone, company_name, password, role } = req.body;

    const existing = await db.queryOne('SELECT id FROM users WHERE email = ? OR username = ?', [email, username]);
    if (existing) throw conflict('อีเมลหรือชื่อผู้ใช้นี้ถูกใช้งานไปแล้ว');

    const hash = await bcrypt.hash(password, 10);
    const result = await db.query(
      `INSERT INTO users (username, full_name, email, phone, company_name, password_hash, role)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [username, full_name, email, phone || null, company_name || null, hash, role]
    );
    await audit(req.user.id, 'admin_create_user', 'user', result.insertId, { email, role });

    const user = await db.queryOne(`SELECT ${FIELDS} FROM users WHERE id = ?`, [result.insertId]);
    res.status(201).json({ message: 'เพิ่มผู้ใช้เรียบร้อยแล้ว', user });
  })
);

router.put(
  '/:id',
  validate({
    params: idParam,
    body: z.object({
      full_name: z.string().trim().min(1).max(150),
      email: z.string().trim().toLowerCase().email('รูปแบบอีเมลไม่ถูกต้อง').max(150),
      phone: z.string().trim().max(30).optional().or(z.literal('')),
      company_name: z.string().trim().max(150).optional().or(z.literal('')),
      role: z.enum(['customer', 'admin']),
      status: z.enum(['active', 'suspended']),
      password: z.string().min(8).max(72).optional().or(z.literal('')),
    }),
  }),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const target = await db.queryOne('SELECT id, role FROM users WHERE id = ?', [id]);
    if (!target) throw notFound('ไม่พบผู้ใช้ที่ต้องการแก้ไข');

    // กันไม่ให้ admin ลดสิทธิ์หรือระงับบัญชีตัวเองจนล็อกตัวเองออกจากระบบ
    if (target.id === req.user.id && (req.body.role !== 'admin' || req.body.status !== 'active')) {
      throw badRequest('ไม่สามารถลดสิทธิ์หรือระงับบัญชีของตัวเองได้');
    }

    const taken = await db.queryOne('SELECT id FROM users WHERE email = ? AND id <> ?', [req.body.email, id]);
    if (taken) throw conflict('อีเมลนี้ถูกใช้งานไปแล้ว กรุณาใช้อีเมลอื่น');

    await db.query(
      'UPDATE users SET full_name = ?, email = ?, phone = ?, company_name = ?, role = ?, status = ? WHERE id = ?',
      [
        req.body.full_name,
        req.body.email,
        req.body.phone || null,
        req.body.company_name || null,
        req.body.role,
        req.body.status,
        id,
      ]
    );

    if (req.body.password) {
      const hash = await bcrypt.hash(req.body.password, 10);
      await db.query('UPDATE users SET password_hash = ? WHERE id = ?', [hash, id]);
    }

    await audit(req.user.id, 'admin_update_user', 'user', id, { role: req.body.role, status: req.body.status });
    const user = await db.queryOne(`SELECT ${FIELDS} FROM users WHERE id = ?`, [id]);
    res.json({ message: 'บันทึกการเปลี่ยนแปลงเรียบร้อยแล้ว', user });
  })
);

router.delete(
  '/:id',
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    if (Number(id) === req.user.id) throw badRequest('ไม่สามารถลบบัญชีของตัวเองได้');

    const user = await db.queryOne('SELECT id, email FROM users WHERE id = ?', [id]);
    if (!user) throw notFound('ไม่พบผู้ใช้ที่ต้องการลบ');

    // UC-10: ห้ามลบผู้ใช้ที่มีธุรกรรมผูกอยู่ — ให้ระงับบัญชีแทนเพื่อรักษาประวัติการจอง
    const [{ c }] = await db.query('SELECT COUNT(*) AS c FROM bookings WHERE user_id = ?', [id]);
    if (c > 0) {
      throw conflict(
        `ไม่สามารถลบผู้ใช้รายนี้ได้ เนื่องจากมีรายการจองผูกอยู่ ${c} รายการ — แนะนำให้ระงับบัญชีแทน`
      );
    }

    await db.query('DELETE FROM users WHERE id = ?', [id]);
    await audit(req.user.id, 'admin_delete_user', 'user', id, { email: user.email });
    res.json({ message: 'ลบผู้ใช้เรียบร้อยแล้ว' });
  })
);

module.exports = router;
