'use strict';

/**
 * Error ที่ตั้งใจส่งให้ client เห็น (ต่างจาก error ที่หลุดมาโดยไม่ตั้งใจ
 * ซึ่ง error handler จะกลบเป็น 500 เสมอเพื่อไม่ให้ stack trace รั่ว)
 */
class HttpError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
    this.details = details;
    this.expose = true;
  }
}

const badRequest = (message, details) => new HttpError(400, 'VALIDATION_ERROR', message, details);
const unauthorized = (message = 'กรุณาเข้าสู่ระบบ') => new HttpError(401, 'UNAUTHORIZED', message);
const forbidden = (message = 'ไม่มีสิทธิ์เข้าถึงส่วนนี้') => new HttpError(403, 'FORBIDDEN', message);
const notFound = (message = 'ไม่พบข้อมูลที่ต้องการ') => new HttpError(404, 'NOT_FOUND', message);
const conflict = (message, details) => new HttpError(409, 'CONFLICT', message, details);
const unavailable = (message = 'เชื่อมต่อฐานข้อมูลไม่ได้ กรุณาลองใหม่อีกครั้ง') =>
  new HttpError(503, 'SERVICE_UNAVAILABLE', message);

/** ครอบ async route handler ให้ error เด้งเข้า error middleware แทนที่จะค้างเป็น unhandled rejection */
const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

module.exports = {
  HttpError,
  badRequest,
  unauthorized,
  forbidden,
  notFound,
  conflict,
  unavailable,
  asyncHandler,
};
