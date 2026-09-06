'use strict';

const { app, db, request, prepareDatabase } = require('./helpers');

describe('Health check', () => {
  beforeAll(prepareDatabase);
  afterAll(() => db.close());

  it('GET /health/live คืน 200 โดยไม่แตะฐานข้อมูล', async () => {
    const res = await request(app).get('/health/live');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  it('GET /health คืนข้อมูล instance และผลตรวจฐานข้อมูล', async () => {
    const res = await request(app).get('/health');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.db.ok).toBe(true);
    expect(typeof res.body.db.latencyMs).toBe('number');

    // ฟิลด์ชุดนี้คือสิ่งที่ใช้พิสูจน์ว่า ALB ส่ง request ไปเครื่องไหน
    expect(res.body.instance).toHaveProperty('hostname');
    expect(res.body.instance).toHaveProperty('availabilityZone');
    expect(res.body.instance).toHaveProperty('instanceId');
    expect(res.body.version.gitSha).toBe('test-sha');
  });

  it('ตอบ 404 พร้อมรูปแบบ error มาตรฐานเมื่อเรียกเส้นทางที่ไม่มี', async () => {
    const res = await request(app).get('/api/not-a-real-route');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});
