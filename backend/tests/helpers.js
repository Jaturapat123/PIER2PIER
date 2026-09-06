'use strict';

const request = require('supertest');
const createApp = require('../src/app');
const db = require('../src/db/pool');
const migrate = require('../src/db/migrate');
const seed = require('../src/db/seed');

const app = createApp();
const DEMO_PASSWORD = process.env.SEED_PASSWORD || 'Pier2Pier!2569';

/** เตรียมฐานข้อมูลให้พร้อมก่อนรันเทสต์ทั้งไฟล์ */
async function prepareDatabase() {
  await migrate();
  await seed();
}

async function login(email, password = DEMO_PASSWORD) {
  const res = await request(app).post('/api/auth/login').send({ email, password });
  if (res.status !== 200) {
    throw new Error(`login failed for ${email}: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return res.body.token;
}

const asAdmin = () => login('admin@pier2pier.test');
const asCustomer = () => login('customer@pier2pier.test');

/** หาเที่ยวเรือที่ยังมีที่ว่างสำหรับใช้ทดสอบการจอง */
async function findOpenSchedule() {
  return db.queryOne(
    `SELECT * FROM vessel_schedules
      WHERE status IN ('open','closing') AND booked_teu < capacity_teu AND cutoff_at > NOW()
      ORDER BY (capacity_teu - booked_teu) DESC LIMIT 1`
  );
}

async function containerTypeByCode(code) {
  return db.queryOne('SELECT * FROM container_types WHERE code = ?', [code]);
}

module.exports = {
  app,
  db,
  request,
  DEMO_PASSWORD,
  prepareDatabase,
  login,
  asAdmin,
  asCustomer,
  findOpenSchedule,
  containerTypeByCode,
};
