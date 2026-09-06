'use strict';

const db = require('../db/pool');

/**
 * บันทึกว่าใครทำอะไรกับข้อมูลของใคร
 *
 * ตั้งใจให้ล้มเหลวแบบเงียบ: ถ้าเขียน audit log ไม่ได้ ก็ไม่ควรทำให้การจอง
 * ของลูกค้าล้มไปด้วย — log สำคัญ แต่ไม่สำคัญกว่าธุรกรรมหลัก
 */
async function audit(userId, action, entity, entityId, meta = null) {
  try {
    await db.query(
      'INSERT INTO audit_logs (user_id, action, entity, entity_id, meta) VALUES (?, ?, ?, ?, ?)',
      [userId ?? null, action, entity, entityId != null ? String(entityId) : null, meta ? JSON.stringify(meta) : null]
    );
  } catch (err) {
    console.error('[audit] failed to write audit log:', err.message);
  }
}

module.exports = audit;
