'use strict';

const crypto = require('crypto');

/**
 * ติด id ให้ทุก request แล้วส่งกลับใน header + body ของ error
 *
 * มี EC2 2 เครื่องส่ง log เข้า CloudWatch คนละ stream — ถ้าผู้ใช้แจ้งว่าเจอ error
 * เราต้องหาให้เจอว่าเกิดที่เครื่องไหน request ไหน id นี้คือตัวเชื่อม
 * ถ้า ALB ส่ง X-Amzn-Trace-Id มาก็ใช้ค่านั้นต่อเพื่อให้ trace ข้ามชั้นได้
 */
function requestId(req, res, next) {
  req.id = req.get('x-amzn-trace-id') || req.get('x-request-id') || crypto.randomUUID();
  res.setHeader('x-request-id', req.id);
  next();
}

module.exports = requestId;
