'use strict';

const { app, db, request, prepareDatabase, DEMO_PASSWORD, asCustomer } = require('./helpers');

describe('UC-1 Register / UC-2 Login / UC-9 Logout', () => {
  const unique = Date.now();
  const newUser = {
    username: `tester${unique}`,
    full_name: 'ผู้ทดสอบ ระบบ',
    email: `tester${unique}@pier2pier.test`,
    password: 'TestPass!2569',
    confirm_password: 'TestPass!2569',
  };

  beforeAll(prepareDatabase);
  afterAll(async () => {
    await db.query('DELETE FROM audit_logs WHERE user_id IN (SELECT id FROM users WHERE email LIKE ?)', [
      `tester%@pier2pier.test`,
    ]);
    await db.query('DELETE FROM users WHERE email LIKE ?', ['tester%@pier2pier.test']);
    await db.close();
  });

  it('สมัครสมาชิกสำเร็จและได้ token กลับมาทันที', async () => {
    const res = await request(app).post('/api/auth/register').send(newUser);
    expect(res.status).toBe(201);
    expect(res.body.user.email).toBe(newUser.email);
    expect(res.body.user.role).toBe('customer');
    expect(res.body.token).toBeTruthy();
    expect(res.body.user.password_hash).toBeUndefined();
  });

  it('UC-1 Alternate Flow 2: รหัสผ่านไม่ตรงกับยืนยันรหัสผ่าน → 400', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ ...newUser, username: `x${unique}`, email: `x${unique}@pier2pier.test`, confirm_password: 'ไม่ตรงกัน' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details.some((d) => d.field === 'confirm_password')).toBe(true);
  });

  it('UC-1 Alternate Flow 3: อีเมลซ้ำ → 409', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ ...newUser, username: `dup${unique}` });

    expect(res.status).toBe(409);
    expect(res.body.error.message).toContain('อีเมลนี้ถูกใช้งานไปแล้ว');
  });

  it('UC-2: เข้าสู่ระบบสำเร็จ', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'customer@pier2pier.test', password: DEMO_PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
  });

  it('UC-2 Alternate Flow 1: รหัสผ่านผิด → 401', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'customer@pier2pier.test', password: 'wrong-password' });

    expect(res.status).toBe(401);
    expect(res.body.error.message).toBe('อีเมลหรือรหัสผ่านไม่ถูกต้อง');
  });

  it('UC-2 Alternate Flow 2: บัญชีถูกระงับ → 403', async () => {
    await db.query("UPDATE users SET status = 'suspended' WHERE email = ?", [newUser.email]);
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: newUser.email, password: newUser.password });

    expect(res.status).toBe(403);
    expect(res.body.error.message).toContain('ถูกระงับ');
    await db.query("UPDATE users SET status = 'active' WHERE email = ?", [newUser.email]);
  });

  it('เรียก endpoint ที่ต้อง auth โดยไม่มี token → 401', async () => {
    const res = await request(app).get('/api/bookings');
    expect(res.status).toBe(401);
  });

  it('UC-9: logout สำเร็จเมื่อมี token', async () => {
    const token = await asCustomer();
    const res = await request(app).post('/api/auth/logout').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Logout successful.');
  });
});
