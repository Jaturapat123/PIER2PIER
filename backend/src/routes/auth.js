'use strict';

const express = require('express');
const bcrypt = require('bcryptjs');
const { z } = require('zod');

const db = require('../db/pool');
const validate = require('../middleware/validate');
const { signToken, requireAuth } = require('../middleware/auth');
const { asyncHandler, conflict, unauthorized, forbidden, badRequest } = require('../utils/httpError');
const audit = require('../services/audit');

const router = express.Router();

const PUBLIC_USER_FIELDS =
  'id, username, full_name, email, phone, company_name, role, status, created_at';

const registerSchema = z
  .object({
    username: z.string().trim().min(3, 'ชื่อผู้ใช้ต้องมีอย่างน้อย 3 ตัวอักษร').max(50),
    full_name: z.string().trim().min(1, 'กรุณากรอกชื่อ-นามสกุล').max(150),
    email: z.string().trim().toLowerCase().email('รูปแบบอีเมลไม่ถูกต้อง').max(150),
    phone: z.string().trim().max(30).optional().or(z.literal('')),
    company_name: z.string().trim().max(150).optional().or(z.literal('')),
    password: z.string().min(8, 'รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร').max(72),
    confirm_password: z.string(),
  })
  // UC-1 Alternate Flow 2: รหัสผ่านไม่ตรงกับยืนยันรหัสผ่าน
  .refine((d) => d.password === d.confirm_password, {
    message: 'รหัสผ่านและยืนยันรหัสผ่านไม่ตรงกัน',
    path: ['confirm_password'],
  });

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('รูปแบบอีเมลไม่ถูกต้อง'),
  password: z.string().min(1, 'กรุณากรอกรหัสผ่าน'),
});

/** UC-1 Register */
router.post(
  '/register',
  validate({ body: registerSchema }),
  asyncHandler(async (req, res) => {
    const { username, full_name, email, phone, company_name, password } = req.body;

    // UC-1 Alternate Flow 3: อีเมลนี้ถูกใช้งานไปแล้ว
    const existing = await db.queryOne('SELECT id, email, username FROM users WHERE email = ? OR username = ?', [
      email,
      username,
    ]);
    if (existing) {
      throw conflict(
        existing.email === email
          ? 'อีเมลนี้ถูกใช้งานไปแล้ว กรุณาใช้อีเมลอื่น'
          : 'ชื่อผู้ใช้นี้ถูกใช้งานไปแล้ว กรุณาใช้ชื่ออื่น'
      );
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const result = await db.query(
      `INSERT INTO users (username, full_name, email, phone, company_name, password_hash, role)
       VALUES (?, ?, ?, ?, ?, ?, 'customer')`,
      [username, full_name, email, phone || null, company_name || null, passwordHash]
    );

    const user = await db.queryOne(`SELECT ${PUBLIC_USER_FIELDS} FROM users WHERE id = ?`, [result.insertId]);
    await audit(user.id, 'register', 'user', user.id);

    res.status(201).json({ user, token: signToken(user) });
  })
);

/** UC-2 Login */
router.post(
  '/login',
  validate({ body: loginSchema }),
  asyncHandler(async (req, res) => {
    const { email, password } = req.body;
    const user = await db.queryOne('SELECT * FROM users WHERE email = ?', [email]);

    // UC-2 Alternate Flow 1 — ข้อความเดียวกันไม่ว่าอีเมลไม่มีหรือรหัสผิด
    // เพื่อไม่บอกใบ้ผู้โจมตีว่าอีเมลไหนมีอยู่ในระบบ
    const ok = user ? await bcrypt.compare(password, user.password_hash) : false;
    if (!ok) throw unauthorized('อีเมลหรือรหัสผ่านไม่ถูกต้อง');

    // UC-2 Alternate Flow 2: บัญชีถูกระงับการใช้งาน
    if (user.status === 'suspended') {
      throw forbidden('บัญชีนี้ถูกระงับการใช้งาน กรุณาติดต่อผู้ดูแลระบบ');
    }

    await audit(user.id, 'login', 'user', user.id);
    const publicUser = await db.queryOne(`SELECT ${PUBLIC_USER_FIELDS} FROM users WHERE id = ?`, [user.id]);
    res.json({ user: publicUser, token: signToken(publicUser) });
  })
);

/**
 * UC-9 Logout
 *
 * ระบบเป็น stateless ฝั่งเซิร์ฟเวอร์จึงไม่มี session ให้ทำลาย — client ทิ้ง token
 * endpoint นี้มีไว้บันทึก audit log และให้ flow ตรงกับ Use-Case Spec
 */
router.post(
  '/logout',
  requireAuth,
  asyncHandler(async (req, res) => {
    await audit(req.user.id, 'logout', 'user', req.user.id);
    res.json({ message: 'Logout successful.' });
  })
);

router.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await db.queryOne(`SELECT ${PUBLIC_USER_FIELDS} FROM users WHERE id = ?`, [req.user.id]);
    if (!user) throw unauthorized('ไม่พบบัญชีผู้ใช้');
    if (user.status === 'suspended') throw forbidden('บัญชีนี้ถูกระงับการใช้งาน');
    res.json({ user });
  })
);

/** เปลี่ยนรหัสผ่าน (ส่วนหนึ่งของ UC-8) */
router.post(
  '/change-password',
  requireAuth,
  validate({
    body: z.object({
      current_password: z.string().min(1, 'กรุณากรอกรหัสผ่านปัจจุบัน'),
      new_password: z.string().min(8, 'รหัสผ่านใหม่ต้องมีอย่างน้อย 8 ตัวอักษร').max(72),
    }),
  }),
  asyncHandler(async (req, res) => {
    const user = await db.queryOne('SELECT id, password_hash FROM users WHERE id = ?', [req.user.id]);
    const ok = await bcrypt.compare(req.body.current_password, user.password_hash);
    if (!ok) throw badRequest('รหัสผ่านปัจจุบันไม่ถูกต้อง');

    const hash = await bcrypt.hash(req.body.new_password, 10);
    await db.query('UPDATE users SET password_hash = ? WHERE id = ?', [hash, user.id]);
    await audit(user.id, 'change_password', 'user', user.id);

    res.json({ message: 'เปลี่ยนรหัสผ่านเรียบร้อยแล้ว' });
  })
);

module.exports = router;
module.exports.PUBLIC_USER_FIELDS = PUBLIC_USER_FIELDS;
