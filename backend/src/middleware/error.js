'use strict';

const { HttpError } = require('../utils/httpError');

/**
 * Error handler กลาง — ทุก Use Case ใน spec ต้องรองรับ exception 2 แบบ
 * คือ "ข้อมูลไม่ถูกต้อง" และ "เชื่อมต่อฐานข้อมูลไม่ได้" จึงจัดการที่เดียวแทน
 * การเขียนซ้ำใน 15 route
 */

/** error code ของ mysql2 ที่แปลว่า "ติดต่อฐานข้อมูลไม่ได้" */
const DB_DOWN_CODES = new Set([
  'ECONNREFUSED',
  'PROTOCOL_CONNECTION_LOST',
  'ER_CON_COUNT_ERROR',
  'ETIMEDOUT',
  'ENOTFOUND',
  'EHOSTUNREACH',
  'ER_ACCESS_DENIED_ERROR',
]);

function notFoundHandler(req, res) {
  res.status(404).json({
    error: { code: 'NOT_FOUND', message: `ไม่พบเส้นทาง ${req.method} ${req.originalUrl}` },
    requestId: req.id,
  });
}

// eslint-disable-next-line no-unused-vars -- Express ระบุ error handler ด้วยจำนวน argument 4 ตัว
function errorHandler(err, req, res, next) {
  if (err instanceof HttpError) {
    return res.status(err.status).json({
      error: { code: err.code, message: err.message, details: err.details },
      requestId: req.id,
    });
  }

  if (DB_DOWN_CODES.has(err.code)) {
    console.error(`[${req.id}] database unavailable:`, err.code, err.message);
    return res.status(503).json({
      error: {
        code: 'SERVICE_UNAVAILABLE',
        message: 'เชื่อมต่อฐานข้อมูลไม่ได้ กรุณาลองใหม่อีกครั้ง',
      },
      requestId: req.id,
    });
  }

  if (err.code === 'ER_DUP_ENTRY') {
    return res.status(409).json({
      error: { code: 'CONFLICT', message: 'ข้อมูลนี้มีอยู่ในระบบแล้ว' },
      requestId: req.id,
    });
  }

  // error ที่ไม่ได้ตั้งใจ — log เต็ม แต่ไม่ส่งรายละเอียดออกไปข้างนอก
  console.error(`[${req.id}] unhandled error:`, err);
  return res.status(500).json({
    error: { code: 'INTERNAL_ERROR', message: 'เกิดข้อผิดพลาดภายในระบบ' },
    requestId: req.id,
  });
}

module.exports = { notFoundHandler, errorHandler };
