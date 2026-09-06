'use strict';

const jwt = require('jsonwebtoken');
const env = require('../config/env');
const { unauthorized, forbidden } = require('../utils/httpError');

/**
 * Authentication แบบ stateless ด้วย JWT
 *
 * นี่คือคำตอบของคำถาม "session เก็บที่ไหน" — ไม่เก็บที่ไหนเลย
 * token ถูกเซ็นด้วย JWT_SECRET เดียวกันทั้ง EC2-A และ EC2-B ดังนั้นไม่ว่า ALB
 * จะส่ง request ไปเครื่องไหน เครื่องนั้น verify ได้เองโดยไม่ต้องคุยกับเครื่องอื่น
 * และไม่ต้องมี sticky session
 */

function signToken(user) {
  return jwt.sign(
    { sub: user.id, email: user.email, role: user.role, name: user.full_name },
    env.jwt.secret,
    { expiresIn: env.jwt.expiresIn }
  );
}

function readToken(req) {
  const header = req.get('authorization') || '';
  if (!header.startsWith('Bearer ')) return null;
  return header.slice(7).trim() || null;
}

function requireAuth(req, res, next) {
  const token = readToken(req);
  if (!token) return next(unauthorized());

  try {
    const payload = jwt.verify(token, env.jwt.secret);
    req.user = { id: payload.sub, email: payload.email, role: payload.role, name: payload.name };
    return next();
  } catch (err) {
    const message =
      err.name === 'TokenExpiredError' ? 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่' : 'โทเคนไม่ถูกต้อง';
    return next(unauthorized(message));
  }
}

/** ใช้ต่อจาก requireAuth เสมอ — จำกัดเฉพาะ role ที่ระบุ */
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return next(unauthorized());
    if (!roles.includes(req.user.role)) return next(forbidden());
    return next();
  };
}

/** อ่าน user ถ้ามี token แต่ไม่บังคับ — ใช้กับหน้าที่ Guest ก็ดูได้ (UC-3, UC-4) */
function optionalAuth(req, res, next) {
  const token = readToken(req);
  if (!token) return next();
  try {
    const payload = jwt.verify(token, env.jwt.secret);
    req.user = { id: payload.sub, email: payload.email, role: payload.role, name: payload.name };
  } catch {
    // token เสีย/หมดอายุ ให้ถือว่าเป็น Guest ต่อไป ไม่ต้อง error
  }
  return next();
}

module.exports = { signToken, requireAuth, requireRole, optionalAuth };
