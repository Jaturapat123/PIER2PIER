'use strict';

const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const env = require('../config/env');

/**
 * Migration runner แบบง่ายที่สุดที่ยังถูกต้อง
 *
 * ทำไมไม่ใช้ไลบรารี: มี migration ไม่กี่ไฟล์ และเราต้องอธิบายกลไกได้ทุกบรรทัด
 * ตอนตอบกรรมการ ไลบรารีจะกลายเป็นกล่องดำที่อธิบายไม่ได้
 *
 * ทำไมต้องมีตาราง schema_migrations: EC2 2 เครื่องอาจรัน migrate พร้อมกันตอน deploy
 * ตารางนี้ทำให้ไฟล์ที่รันแล้วไม่ถูกรันซ้ำ
 */

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

async function connect() {
  return mysql.createConnection({
    host: env.db.host,
    port: env.db.port,
    user: env.db.user,
    password: env.db.password,
    database: env.db.database,
    multipleStatements: true,
  });
}

async function ensureMigrationsTable(conn) {
  await conn.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename   VARCHAR(255) NOT NULL,
      applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (filename)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
}

/** ชื่อล็อกระดับฐานข้อมูล ใช้ร่วมกันทุกเครื่องที่ต่อฐานข้อมูลเดียวกัน */
const LOCK_NAME = 'pier2pier_migrate';
const LOCK_TIMEOUT_SEC = 60;

async function run() {
  const conn = await connect();
  try {
    /**
     * ขอล็อกก่อนเสมอ เพราะ EC2 ทั้งสองเครื่องรัน migrate พร้อมกันตอน boot
     *
     * ถ้าไม่ล็อก ทั้งคู่จะอ่าน schema_migrations เห็นว่ายังไม่มีไฟล์ไหนถูก apply
     * แล้วรัน SQL ชุดเดียวกันพร้อมกัน เครื่องที่เขียน schema_migrations ทีหลัง
     * จะชน primary key แล้ว migration ที่เหลือของเครื่องนั้นไม่ถูกรัน
     *
     * GET_LOCK เป็นล็อกของ MySQL เอง ไม่ต้องมีตารางหรือบริการเพิ่ม
     * เครื่องที่สองจะรอจนเครื่องแรกทำเสร็จ แล้วเห็นว่าทุกไฟล์ apply แล้วจึงข้ามไป
     */
    const [[lock]] = await conn.query('SELECT GET_LOCK(?, ?) AS acquired', [LOCK_NAME, LOCK_TIMEOUT_SEC]);
    if (lock.acquired !== 1) {
      throw new Error(`ขอล็อกสำหรับรัน migration ไม่สำเร็จภายใน ${LOCK_TIMEOUT_SEC} วินาที`);
    }

    await ensureMigrationsTable(conn);

    const [applied] = await conn.query('SELECT filename FROM schema_migrations');
    const done = new Set(applied.map((r) => r.filename));

    const files = fs
      .readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    let count = 0;
    for (const file of files) {
      if (done.has(file)) {
        console.log(`[migrate] skip   ${file} (applied already)`);
        continue;
      }
      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
      console.log(`[migrate] apply  ${file}`);
      await conn.query(sql);
      await conn.query('INSERT INTO schema_migrations (filename) VALUES (?)', [file]);
      count += 1;
    }

    console.log(`[migrate] done — applied ${count} migration(s), ${files.length} total`);
  } finally {
    // ปล่อยล็อกก่อนปิด connection เสมอ แม้ migration จะล้มเหลวกลางคัน
    // ไม่งั้นเครื่องอีกเครื่องจะรอจนหมดเวลา 60 วินาทีโดยไม่จำเป็น
    await conn.query('SELECT RELEASE_LOCK(?)', [LOCK_NAME]).catch(() => {});
    await conn.end();
  }
}

if (require.main === module) {
  run().catch((err) => {
    console.error('[migrate] failed:', err.message);
    process.exit(1);
  });
}

module.exports = run;
