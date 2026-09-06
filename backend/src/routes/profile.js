'use strict';

const express = require('express');
const { z } = require('zod');

const db = require('../db/pool');
const validate = require('../middleware/validate');
const { requireAuth } = require('../middleware/auth');
const { asyncHandler, conflict, notFound } = require('../utils/httpError');
const audit = require('../services/audit');
const { PUBLIC_USER_FIELDS } = require('./auth');

const router = express.Router();
router.use(requireAuth);

/** UC-8 Update Profile */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const user = await db.queryOne(`SELECT ${PUBLIC_USER_FIELDS} FROM users WHERE id = ?`, [req.user.id]);
    if (!user) throw notFound('ไม่พบข้อมูลผู้ใช้');
    res.json({ user });
  })
);

router.put(
  '/',
  validate({
    body: z.object({
      full_name: z.string().trim().min(1, 'กรุณากรอกชื่อ-นามสกุล').max(150),
      email: z.string().trim().toLowerCase().email('รูปแบบอีเมลไม่ถูกต้อง').max(150),
      phone: z.string().trim().max(30).optional().or(z.literal('')),
      company_name: z.string().trim().max(150).optional().or(z.literal('')),
    }),
  }),
  asyncHandler(async (req, res) => {
    const { full_name, email, phone, company_name } = req.body;

    // UC-8 Alternate Flow: อีเมลซ้ำกับผู้ใช้รายอื่น
    const taken = await db.queryOne('SELECT id FROM users WHERE email = ? AND id <> ?', [email, req.user.id]);
    if (taken) throw conflict('อีเมลนี้ถูกใช้งานไปแล้ว กรุณาใช้อีเมลอื่น');

    await db.query(
      'UPDATE users SET full_name = ?, email = ?, phone = ?, company_name = ? WHERE id = ?',
      [full_name, email, phone || null, company_name || null, req.user.id]
    );
    await audit(req.user.id, 'update_profile', 'user', req.user.id);

    const user = await db.queryOne(`SELECT ${PUBLIC_USER_FIELDS} FROM users WHERE id = ?`, [req.user.id]);
    res.json({ message: 'อัปเดตข้อมูลส่วนตัวเรียบร้อยแล้ว', user });
  })
);

module.exports = router;
