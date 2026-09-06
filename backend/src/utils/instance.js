'use strict';

const os = require('os');
const env = require('../config/env');

/**
 * ระบุว่า "ตอนนี้คุณกำลังคุยกับเครื่องไหน"
 *
 * นี่คือหัวใจของการเก็บหลักฐาน Stage 3: ทุก response ของ /health บอก hostname,
 * Availability Zone และ instance id ทำให้พิสูจน์ได้ว่า ALB กระจาย traffic จริง
 * และตอนปิด EC2-A ระบบสลับไป EC2-B เมื่อไหร่
 *
 * ค่ามาจาก IMDSv2 (Instance Metadata Service) ซึ่งเรียกได้เฉพาะจากภายใน EC2
 * ตอนรัน local จะ timeout แล้ว fallback เป็น "local" ซึ่งถูกต้องแล้ว
 */

const IMDS_BASE = 'http://169.254.169.254/latest';
const IMDS_TIMEOUT_MS = 500;

let cached = null;

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), IMDS_TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function loadFromImds() {
  // IMDSv2 บังคับให้ขอ token ก่อน — กัน SSRF ที่อ่าน metadata ผ่านแอปเรา
  const tokenRes = await fetchWithTimeout(`${IMDS_BASE}/api/token`, {
    method: 'PUT',
    headers: { 'x-aws-ec2-metadata-token-ttl-seconds': '60' },
  });
  if (!tokenRes.ok) throw new Error(`IMDS token request failed: ${tokenRes.status}`);
  const token = await tokenRes.text();
  const headers = { 'x-aws-ec2-metadata-token': token };

  const [instanceId, availabilityZone] = await Promise.all([
    fetchWithTimeout(`${IMDS_BASE}/meta-data/instance-id`, { headers }).then((r) => r.text()),
    fetchWithTimeout(`${IMDS_BASE}/meta-data/placement/availability-zone`, { headers }).then((r) => r.text()),
  ]);

  return { instanceId, availabilityZone };
}

/**
 * @returns {Promise<{hostname: string, instanceId: string, availabilityZone: string}>}
 */
async function getInstanceInfo() {
  if (cached) return cached;

  let meta = {
    // FAKE_* ใช้เฉพาะตอนรัน docker compose บนเครื่องตัวเอง เพื่อจำลองว่ามี 2 เครื่อง
    // คนละ AZ ทำให้ทดสอบหน้า System Health และสคริปต์ทดลองได้ก่อนขึ้น AWS จริง
    instanceId: process.env.FAKE_INSTANCE_ID || os.hostname(),
    availabilityZone: process.env.FAKE_AZ || 'local',
  };
  try {
    meta = await loadFromImds();
  } catch {
    // ไม่ได้รันบน EC2 (local / CI) — ไม่ใช่ error ปล่อยใช้ค่า fallback
  }

  cached = {
    hostname: os.hostname(),
    instanceId: meta.instanceId,
    availabilityZone: meta.availabilityZone,
  };
  return cached;
}

function getRelease() {
  return { gitSha: env.release.gitSha, imageTag: env.release.imageTag };
}

module.exports = { getInstanceInfo, getRelease };
