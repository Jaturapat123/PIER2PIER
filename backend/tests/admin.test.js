'use strict';

const { app, db, request, prepareDatabase, asAdmin, asCustomer } = require('./helpers');

describe('UC-10..15 Admin — สิทธิ์ การลบที่ถูกอ้างถึง สต็อก และรายงาน', () => {
  let adminToken;
  let customerToken;

  beforeAll(async () => {
    await prepareDatabase();
    adminToken = await asAdmin();
    customerToken = await asCustomer();
  });

  afterAll(() => db.close());

  const auth = (t) => ({ Authorization: `Bearer ${t}` });

  it('ลูกค้าเรียก API ฝั่ง admin ไม่ได้ → 403', async () => {
    const res = await request(app).get('/api/admin/users').set(auth(customerToken));
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('UC-10: admin ดูรายชื่อผู้ใช้ได้ พร้อมจำนวนการจองของแต่ละคน', async () => {
    const res = await request(app).get('/api/admin/users').set(auth(adminToken));
    expect(res.status).toBe(200);
    expect(res.body.items.length).toBeGreaterThan(0);
    expect(res.body.items[0]).toHaveProperty('booking_count');
  });

  it('UC-10: ลบผู้ใช้ที่มีรายการจองผูกอยู่ไม่ได้ → 409', async () => {
    const user = await db.queryOne(
      'SELECT u.id FROM users u JOIN bookings b ON b.user_id = u.id GROUP BY u.id LIMIT 1'
    );
    if (!user) return; // ยังไม่มีข้อมูลจอง — ข้ามเคสนี้

    const res = await request(app).delete(`/api/admin/users/${user.id}`).set(auth(adminToken));
    expect(res.status).toBe(409);
    expect(res.body.error.message).toContain('มีรายการจองผูกอยู่');
  });

  it('admin ลดสิทธิ์บัญชีตัวเองไม่ได้ (กันล็อกตัวเองออกจากระบบ)', async () => {
    const me = await db.queryOne('SELECT * FROM users WHERE email = ?', ['admin@pier2pier.test']);
    const res = await request(app)
      .put(`/api/admin/users/${me.id}`)
      .set(auth(adminToken))
      .send({
        full_name: me.full_name,
        email: me.email,
        role: 'customer',
        status: 'active',
      });

    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain('ตัวเอง');
  });

  it('UC-11: ลบบริการที่มีตารางเที่ยวเรือผูกอยู่ไม่ได้ → 409', async () => {
    const service = await db.queryOne(
      'SELECT s.id FROM services s JOIN vessel_schedules vs ON vs.service_id = s.id GROUP BY s.id LIMIT 1'
    );
    const res = await request(app).delete(`/api/admin/services/${service.id}`).set(auth(adminToken));
    expect(res.status).toBe(409);
    expect(res.body.error.message).toContain('ตารางเที่ยวเรือ');
  });

  it('UC-12: เพิ่ม แก้ไข แล้วลบประเภทตู้ที่ยังไม่ถูกใช้งานได้', async () => {
    const code = `TST${Date.now() % 100000}`;

    const created = await request(app)
      .post('/api/admin/container-types')
      .set(auth(adminToken))
      .send({ code, name: 'ตู้ทดสอบ', size_ft: 20, teu_factor: 1, max_payload_kg: 20000 });
    expect(created.status).toBe(201);

    const id = created.body.item.id;
    const updated = await request(app)
      .put(`/api/admin/container-types/${id}`)
      .set(auth(adminToken))
      .send({ code, name: 'ตู้ทดสอบ (แก้ไข)', size_ft: 20, teu_factor: 1, max_payload_kg: 21000 });
    expect(updated.body.item.name).toBe('ตู้ทดสอบ (แก้ไข)');

    const removed = await request(app).delete(`/api/admin/container-types/${id}`).set(auth(adminToken));
    expect(removed.status).toBe(200);
  });

  it('UC-12 Alternate Flow 3: ลบประเภทตู้ที่ถูกใช้ใน booking ไม่ได้ → 409', async () => {
    const used = await db.queryOne(
      'SELECT container_type_id AS id FROM booking_items GROUP BY container_type_id LIMIT 1'
    );
    if (!used) return;

    const res = await request(app).delete(`/api/admin/container-types/${used.id}`).set(auth(adminToken));
    expect(res.status).toBe(409);
    expect(res.body.error.message).toContain('ถูกใช้ในรายการจอง');
  });

  it('UC-14: ปรับสต็อกแล้วจำนวนเปลี่ยนและมีบันทึกการเคลื่อนไหว', async () => {
    const item = await db.queryOne('SELECT * FROM stock_items LIMIT 1');

    const res = await request(app)
      .post(`/api/admin/stock/${item.id}/adjust`)
      .set(auth(adminToken))
      .send({ type: 'in', qty: 25, reason: 'รับเข้าจากผู้ขาย' });

    expect(res.status).toBe(200);
    expect(res.body.newQty).toBe(item.qty_on_hand + 25);

    const log = await request(app).get(`/api/admin/stock/${item.id}/transactions`).set(auth(adminToken));
    expect(log.body.items[0].change_qty).toBe(25);
    expect(log.body.items[0].type).toBe('in');
  });

  it('UC-14: ตัดสต็อกจนติดลบไม่ได้ → 400', async () => {
    const item = await db.queryOne('SELECT * FROM stock_items LIMIT 1');

    const res = await request(app)
      .post(`/api/admin/stock/${item.id}/adjust`)
      .set(auth(adminToken))
      .send({ type: 'out', qty: item.qty_on_hand + 9999, reason: 'ทดสอบตัดเกิน' });

    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain('ไม่พอ');
  });

  it('UC-15: รายงานสรุปคืน KPI ครบทุกกลุ่ม', async () => {
    const res = await request(app).get('/api/admin/reports/summary').set(auth(adminToken));

    expect(res.status).toBe(200);
    expect(res.body.bookings).toHaveProperty('total_bookings');
    expect(res.body.stock).toHaveProperty('low_stock_items');
    expect(res.body.schedules).toHaveProperty('avg_utilization_pct');
    expect(Array.isArray(res.body.trend)).toBe(true);
    expect(Array.isArray(res.body.topServices)).toBe(true);
  });

  it('UC-15: export CSV ได้และมี BOM สำหรับ Excel ภาษาไทย', async () => {
    const res = await request(app).get('/api/admin/reports/stock?format=csv').set(auth(adminToken));

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.text.charCodeAt(0)).toBe(0xfeff);
    expect(res.text).toContain('sku');
  });
});
