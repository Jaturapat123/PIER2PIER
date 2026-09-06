'use strict';

require('dotenv').config();

/**
 * อ่านและตรวจ environment variable ทั้งหมดที่จุดเดียว
 *
 * เหตุผลที่ตรวจตอน boot แทนที่จะตรวจตอนใช้: ถ้า config ผิด เราอยากให้ container
 * ตายตั้งแต่วินาทีแรก แล้ว ALB health check ไม่ผ่าน → deploy หยุดที่เครื่องแรก
 * ดีกว่าปล่อยให้ขึ้นไปแล้วพังตอนมีคนใช้จริง
 */

function required(name) {
  const value = process.env[name];
  if (!value || value.trim() === '') {
    throw new Error(
      `Missing required environment variable: ${name}. ` +
        'ดู .env.example ประกอบ — ห้าม hardcode ค่าลงในโค้ด'
    );
  }
  return value.trim();
}

function optional(name, fallback) {
  const value = process.env[name];
  return value === undefined || value.trim() === '' ? fallback : value.trim();
}

function toInt(value, name) {
  const n = Number.parseInt(value, 10);
  if (Number.isNaN(n)) throw new Error(`Environment variable ${name} must be an integer, got "${value}"`);
  return n;
}

const env = {
  nodeEnv: optional('NODE_ENV', 'development'),
  port: toInt(optional('PORT', '3000'), 'PORT'),

  db: {
    host: required('DB_HOST'),
    port: toInt(optional('DB_PORT', '3306'), 'DB_PORT'),
    user: required('DB_USER'),
    password: required('DB_PASSWORD'),
    database: required('DB_NAME'),
    connectionLimit: toInt(optional('DB_POOL_SIZE', '10'), 'DB_POOL_SIZE'),
  },

  jwt: {
    secret: required('JWT_SECRET'),
    expiresIn: optional('JWT_EXPIRES_IN', '8h'),
  },

  // Frontend อยู่คนละ domain (CloudFront) จึงต้องระบุ origin ที่อนุญาตอย่างชัดเจน
  corsOrigins: optional('CORS_ORIGINS', 'http://localhost:5173')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean),

  // ค่าที่ CI/CD ฉีดเข้ามาตอน build image — ใช้พิสูจน์ว่าเครื่องไหนรันเวอร์ชันอะไร
  release: {
    gitSha: optional('GIT_SHA', 'local'),
    imageTag: optional('IMAGE_TAG', 'local'),
  },

  // ระยะรอปิด server ตอนได้ SIGTERM ต้องน้อยกว่า deregistration_delay ของ ALB (30s)
  shutdownTimeoutMs: toInt(optional('SHUTDOWN_TIMEOUT_MS', '20000'), 'SHUTDOWN_TIMEOUT_MS'),
};

module.exports = env;
