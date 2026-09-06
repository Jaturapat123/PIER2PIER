'use strict';

const express = require('express');
const { z } = require('zod');

const db = require('../../db/pool');
const validate = require('../../middleware/validate');
const { asyncHandler } = require('../../utils/httpError');

const router = express.Router();

/** ประวัติการดำเนินการของผู้ใช้ในระบบ — ใช้สาวกลับว่าใครแก้อะไรเมื่อไหร่ */
router.get(
  '/',
  validate({
    query: z.object({
      entity: z.string().trim().max(60).optional(),
      action: z.string().trim().max(60).optional(),
      page: z.coerce.number().int().min(1).default(1),
      pageSize: z.coerce.number().int().min(1).max(100).default(50),
    }),
  }),
  asyncHandler(async (req, res) => {
    const { entity, action, page, pageSize } = req.query;
    const where = [];
    const params = [];

    if (entity) {
      where.push('a.entity = ?');
      params.push(entity);
    }
    if (action) {
      where.push('a.action = ?');
      params.push(action);
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const offset = (page - 1) * pageSize;

    const [{ total }] = await db.query(`SELECT COUNT(*) AS total FROM audit_logs a ${whereSql}`, params);
    const items = await db.query(
      `SELECT a.*, u.full_name AS user_name, u.email AS user_email
         FROM audit_logs a
         LEFT JOIN users u ON u.id = a.user_id
         ${whereSql} ORDER BY a.created_at DESC LIMIT ${pageSize} OFFSET ${offset}`,
      params
    );

    res.json({ items, total, page, pageSize });
  })
);

module.exports = router;
