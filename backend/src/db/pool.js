'use strict';

const mysql = require('mysql2/promise');
const env = require('../config/env');

/**
 * Connection pool เดียวต่อ process
 *
 * ทำไมต้อง pool: EC2 แต่ละเครื่องเปิด connection ค้างไว้ใช้ซ้ำ ไม่ต้อง handshake ใหม่ทุก request
 * และจำกัดจำนวน connection ไม่ให้ RDS โดนถล่มเมื่อมี EC2 หลายเครื่อง
 * (จำนวน connection สูงสุดที่ RDS เห็น = DB_POOL_SIZE × จำนวน EC2)
 */
const pool = mysql.createPool({
  host: env.db.host,
  port: env.db.port,
  user: env.db.user,
  password: env.db.password,
  database: env.db.database,
  waitForConnections: true,
  connectionLimit: env.db.connectionLimit,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 10000,
  timezone: 'Z',
  dateStrings: ['DATE'],
  charset: 'utf8mb4_general_ci',
});

async function query(sql, params = []) {
  const [rows] = await pool.execute(sql, params);
  return rows;
}

/** คืนแถวแรกหรือ null — ใช้กับ query ที่คาดว่าได้ 0 หรือ 1 แถว */
async function queryOne(sql, params = []) {
  const rows = await query(sql, params);
  return rows.length > 0 ? rows[0] : null;
}

/**
 * รัน callback ใน transaction เดียว commit/rollback ให้อัตโนมัติ
 *
 * ใช้ตอนสร้าง booking: ต้องเขียน bookings + booking_items + บวก booked_teu
 * พร้อมกันทั้งหมด ถ้าขั้นไหนพังต้องย้อนหมด ไม่งั้น quota เที่ยวเรือจะเพี้ยน
 */
async function tx(fn) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

/** ping DB จริงสำหรับ health check พร้อมวัด latency */
async function ping() {
  const start = Date.now();
  await pool.query('SELECT 1');
  return Date.now() - start;
}

async function close() {
  await pool.end();
}

module.exports = { pool, query, queryOne, tx, ping, close };
