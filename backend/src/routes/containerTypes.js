'use strict';

const express = require('express');
const db = require('../db/pool');
const { asyncHandler } = require('../utils/httpError');

const router = express.Router();

/**
 * รายการประเภทตู้ที่เปิดใช้งาน — ใช้ตอนสร้างการจอง (UC-5)
 *
 * เปิดให้เรียกได้โดยไม่ต้องเข้าสู่ระบบ เพราะเป็นข้อมูลอ้างอิงสาธารณะ
 * เหมือนตารางเที่ยวเรือ ไม่ใช่ข้อมูลของผู้ใช้รายใด
 */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const items = await db.query(
      'SELECT * FROM container_types WHERE is_active = 1 ORDER BY size_ft, code'
    );
    res.json({ items });
  })
);

module.exports = router;
