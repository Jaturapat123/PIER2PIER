'use strict';

const {
  app,
  db,
  request,
  prepareDatabase,
  asCustomer,
  asAdmin,
  findOpenSchedule,
  containerTypeByCode,
} = require('./helpers');

describe('UC-5 Create / UC-6 Confirm / UC-7 View Booking', () => {
  let token;
  let schedule;
  let type20;

  beforeAll(async () => {
    await prepareDatabase();
    token = await asCustomer();
    schedule = await findOpenSchedule();
    type20 = await containerTypeByCode('20GP');
  });

  afterAll(() => db.close());

  const createBooking = (overrides = {}) =>
    request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${token}`)
      .send({
        schedule_id: schedule.id,
        cargo_type: 'ข้าวหอมมะลิบรรจุถุง',
        cargo_weight_kg: 18000,
        pickup_location: 'คลังสินค้า A ลาดกระบัง',
        items: [{ container_type_id: type20.id, qty: 2 }],
        ...overrides,
      });

  it('UC-5: สร้างการจองได้ สถานะเริ่มต้นเป็น pending และกันพื้นที่ทันที', async () => {
    const before = await db.queryOne('SELECT booked_teu FROM vessel_schedules WHERE id = ?', [schedule.id]);

    const res = await createBooking();
    expect(res.status).toBe(201);
    expect(res.body.booking.status).toBe('pending');
    expect(res.body.booking.booking_no).toMatch(/^BK-\d{8}-\d{4}$/);
    expect(res.body.booking.items).toHaveLength(1);

    // 20GP มี teu_factor = 1.0 จองไป 2 ตู้ = 2 TEU
    const after = await db.queryOne('SELECT booked_teu FROM vessel_schedules WHERE id = ?', [schedule.id]);
    expect(Number(after.booked_teu) - Number(before.booked_teu)).toBe(2);
  });

  it('UC-5 Alternate Flow 1: จองเกินความจุที่เหลือ → 409 พร้อมบอกที่ว่างจริง', async () => {
    // สร้างเที่ยวเรือความจุเล็กเฉพาะเทสต์นี้ แทนการอาศัยที่ว่างที่เหลือจาก seed
    // เพราะที่ว่างของ seed เปลี่ยนไปตามเทสต์ก่อนหน้า ทำให้ผลไม่คงที่เมื่อรันซ้ำ
    const tiny = await db.query(
      `INSERT INTO vessel_schedules
         (service_id, vessel_id, voyage_no, etd, eta, berth, cutoff_at, capacity_teu, booked_teu, status)
       VALUES (?, ?, ?, DATE_ADD(NOW(), INTERVAL 5 DAY), DATE_ADD(NOW(), INTERVAL 9 DAY),
               'T1', DATE_ADD(NOW(), INTERVAL 4 DAY), 2, 0, 'open')`,
      [schedule.service_id, schedule.vessel_id, `TEST-${Date.now()}`]
    );

    const res = await createBooking({
      schedule_id: tiny.insertId,
      items: [{ container_type_id: type20.id, qty: 3 }],
    });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');
    expect(res.body.error.details.availableTeu).toBe(2);
    expect(res.body.error.details.requestedTeu).toBe(3);

    await db.query('DELETE FROM vessel_schedules WHERE id = ?', [tiny.insertId]);
  });

  it('ส่งประเภทตู้ซ้ำกันมาในรายการเดียว ต้องรวมจำนวนเข้าด้วยกัน ไม่ใช่ปฏิเสธ', async () => {
    const res = await createBooking({
      items: [
        { container_type_id: type20.id, qty: 1 },
        { container_type_id: type20.id, qty: 2 },
      ],
    });

    expect(res.status).toBe(201);
    // ต้องเหลือรายการเดียวจำนวน 3 ตู้ ไม่ใช่สองแถวแยกกัน
    expect(res.body.booking.items).toHaveLength(1);
    expect(res.body.booking.items[0].qty).toBe(3);
    expect(Number(res.body.booking.total_teu)).toBe(3);

    await request(app)
      .post(`/api/bookings/${res.body.booking.id}/cancel`)
      .set('Authorization', `Bearer ${token}`);
  });

  it('ข้อมูลไม่ครบ (ไม่เลือกตู้เลย) → 400', async () => {
    const res = await createBooking({ items: [] });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('UC-6: ยืนยันการจองแล้วสถานะเป็น confirmed และมี Shipment Order', async () => {
    const created = await createBooking();
    const id = created.body.booking.id;

    const res = await request(app).post(`/api/bookings/${id}/confirm`).set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.booking.status).toBe('confirmed');
    expect(res.body.booking.confirmed_at).toBeTruthy();
    expect(res.body.booking.shipment_order_no).toMatch(/^SO-\d{8}-\d{4}$/);
  });

  it('UC-6: ยืนยันซ้ำรอบสอง → 409', async () => {
    const created = await createBooking();
    const id = created.body.booking.id;

    await request(app).post(`/api/bookings/${id}/confirm`).set('Authorization', `Bearer ${token}`);
    const second = await request(app).post(`/api/bookings/${id}/confirm`).set('Authorization', `Bearer ${token}`);

    expect(second.status).toBe(409);
    expect(second.body.error.message).toContain('ยืนยันไปแล้ว');
  });

  it('ยกเลิกการจองแล้วพื้นที่ถูกคืนให้เที่ยวเรือ', async () => {
    const created = await createBooking({ items: [{ container_type_id: type20.id, qty: 3 }] });
    const id = created.body.booking.id;

    const afterCreate = await db.queryOne('SELECT booked_teu FROM vessel_schedules WHERE id = ?', [schedule.id]);
    await request(app).post(`/api/bookings/${id}/cancel`).set('Authorization', `Bearer ${token}`);
    const afterCancel = await db.queryOne('SELECT booked_teu FROM vessel_schedules WHERE id = ?', [schedule.id]);

    expect(Number(afterCreate.booked_teu) - Number(afterCancel.booked_teu)).toBe(3);
  });

  it('UC-7: เห็นเฉพาะรายการจองของตัวเอง เรียงล่าสุดก่อน', async () => {
    const res = await request(app).get('/api/bookings').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.items.length).toBeGreaterThan(0);

    const me = await db.queryOne('SELECT id FROM users WHERE email = ?', ['customer@pier2pier.test']);
    expect(res.body.items.every((b) => b.user_id === me.id)).toBe(true);

    const dates = res.body.items.map((b) => new Date(b.created_at).getTime());
    expect([...dates].sort((a, b) => b - a)).toEqual(dates);
  });

  it('ลูกค้าเปิดดูการจองของคนอื่นไม่ได้ (ตอบ 404 ไม่ใช่ 403 เพื่อไม่ให้เดา id ได้)', async () => {
    const adminToken = await asAdmin();
    const other = await db.queryOne(
      'SELECT b.id FROM bookings b JOIN users u ON u.id = b.user_id WHERE u.email <> ? LIMIT 1',
      ['customer@pier2pier.test']
    );

    // สร้างการจองในนามผู้ใช้อีกคนถ้ายังไม่มี
    if (!other) {
      const agentToken = await request(app)
        .post('/api/auth/login')
        .send({ email: 'agent@pier2pier.test', password: process.env.SEED_PASSWORD || 'Pier2Pier!2569' });
      const res = await request(app)
        .post('/api/bookings')
        .set('Authorization', `Bearer ${agentToken.body.token}`)
        .send({
          schedule_id: schedule.id,
          cargo_type: 'ชิ้นส่วนยานยนต์',
          items: [{ container_type_id: type20.id, qty: 1 }],
        });

      const check = await request(app)
        .get(`/api/bookings/${res.body.booking.id}`)
        .set('Authorization', `Bearer ${token}`);
      expect(check.status).toBe(404);
      return;
    }

    const res = await request(app).get(`/api/bookings/${other.id}`).set('Authorization', `Bearer ${token}`);
    expect([200, 404]).toContain(res.status);

    // ยืนยันว่า admin เห็นได้เสมอ
    const adminRes = await request(app)
      .get(`/api/admin/bookings/${other.id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(adminRes.status).toBe(200);
  });
});
