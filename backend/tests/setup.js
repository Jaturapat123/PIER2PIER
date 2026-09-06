'use strict';

// ค่า default สำหรับรันเทสต์บนเครื่อง dev / GitHub Actions
// ตั้งก่อน require โมดูลอื่น เพราะ config/env.js ตรวจค่าตอน import ทันที
process.env.NODE_ENV = 'test';
process.env.DB_HOST = process.env.DB_HOST || '127.0.0.1';
process.env.DB_PORT = process.env.DB_PORT || '3307';
process.env.DB_USER = process.env.DB_USER || 'wms';
process.env.DB_PASSWORD = process.env.DB_PASSWORD || 'wmspass';
process.env.DB_NAME = process.env.DB_NAME || 'pier2pier_wms';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-do-not-use-in-production';
process.env.GIT_SHA = process.env.GIT_SHA || 'test-sha';
