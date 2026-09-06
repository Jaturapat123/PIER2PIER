'use strict';

const createApp = require('./app');
const env = require('./config/env');
const db = require('./db/pool');
const { getInstanceInfo } = require('./utils/instance');

const app = createApp();
const server = app.listen(env.port, async () => {
  const instance = await getInstanceInfo();
  console.log(
    `[startup] Pier2Pier WMS API listening on :${env.port} ` +
      `| env=${env.nodeEnv} | host=${instance.hostname} | az=${instance.availabilityZone} ` +
      `| sha=${env.release.gitSha}`
  );
});

/**
 * Graceful shutdown — จำเป็นมากตอน rolling deploy
 *
 * ลำดับที่เกิดขึ้นจริงตอน deploy เครื่อง A:
 *   1. ALB เริ่ม deregister เครื่อง A → เข้าโหมด draining (deregistration_delay = 30s)
 *   2. docker ส่ง SIGTERM ให้ process นี้
 *   3. เราหยุดรับ connection ใหม่ แต่ปล่อยให้ request ที่ค้างอยู่ทำงานจนจบ
 *   4. ปิด connection pool แล้วค่อย exit
 *
 * ถ้าข้ามขั้น 3 ผู้ใช้ที่กำลังกดยืนยัน booking อยู่จะเจอ 502 กลางคัน
 */
let shuttingDown = false;

function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[shutdown] received ${signal}, draining connections...`);

  const forceExit = setTimeout(() => {
    console.error('[shutdown] timeout reached, forcing exit');
    process.exit(1);
  }, env.shutdownTimeoutMs);
  forceExit.unref();

  server.close(async () => {
    try {
      await db.close();
      console.log('[shutdown] db pool closed, exiting cleanly');
      process.exit(0);
    } catch (err) {
      console.error('[shutdown] error while closing db pool:', err);
      process.exit(1);
    }
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

process.on('unhandledRejection', (reason) => {
  console.error('[fatal] unhandled promise rejection:', reason);
  shutdown('unhandledRejection');
});

module.exports = server;
