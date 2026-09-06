'use strict';

const express = require('express');
const db = require('../db/pool');
const { getInstanceInfo, getRelease } = require('../utils/instance');

const router = express.Router();
const startedAt = Date.now();

/**
 * Health check 2 ระดับ ตามคำแนะนำ AWS เรื่อง shallow vs deep health check
 *
 * /health/live  — shallow: process ยังอยู่ไหม ไม่แตะ dependency
 * /health       — deep: query DB จริง ใช้เป็น health check ของ ALB target group
 *
 * ทำไม ALB ต้องใช้ตัว deep: ถ้า EC2 ยังตอบ HTTP ได้แต่ต่อ RDS ไม่ได้ เครื่องนั้น
 * ให้บริการจริงไม่ได้ ต้องถูกถอดออกจาก target group ไม่ใช่ปล่อยให้รับ traffic ต่อ
 */

router.get('/health/live', (req, res) => {
  res.json({ status: 'ok', uptimeSec: Math.floor((Date.now() - startedAt) / 1000) });
});

router.get('/health', async (req, res) => {
  const instance = await getInstanceInfo();
  const base = {
    instance,
    version: getRelease(),
    uptimeSec: Math.floor((Date.now() - startedAt) / 1000),
    checkedAt: new Date().toISOString(),
  };

  try {
    const latencyMs = await db.ping();
    res.json({ status: 'ok', ...base, db: { ok: true, latencyMs } });
  } catch (err) {
    // 503 คือสัญญาณให้ ALB ถอดเครื่องนี้ออกจาก target group
    res.status(503).json({
      status: 'degraded',
      ...base,
      db: { ok: false, error: err.code || 'DB_ERROR' },
    });
  }
});

module.exports = router;
