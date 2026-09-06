'use strict';

const express = require('express');
const { z } = require('zod');

const db = require('../../db/pool');
const validate = require('../../middleware/validate');
const { asyncHandler, notFound, conflict, badRequest } = require('../../utils/httpError');
const audit = require('../../services/audit');

const router = express.Router();
const idParam = z.object({ id: z.coerce.number().int().positive() });

const bodySchema = z
  .object({
    service_id: z.coerce.number().int().positive(),
    vessel_id: z.coerce.number().int().positive(),
    voyage_no: z.string().trim().min(1, 'กรุณากรอกเลขเที่ยวเรือ').max(40),
    etd: z.string().trim().min(1, 'กรุณาระบุวันเวลาออกเดินทาง'),
    eta: z.string().trim().min(1, 'กรุณาระบุวันเวลาถึงปลายทาง'),
    cutoff_at: z.string().trim().min(1, 'กรุณาระบุกำหนดปิดรับการจอง'),
    berth: z.string().trim().max(40).optional().or(z.literal('')),
    capacity_teu: z.coerce.number().int().min(1, 'ความจุต้องมากกว่า 0').max(100000),
    status: z.enum(['open', 'closing', 'closed', 'departed']).default('open'),
  })
  .refine((d) => new Date(d.eta) > new Date(d.etd), {
    message: 'วันเวลาถึงปลายทางต้องอยู่หลังวันเวลาออกเดินทาง',
    path: ['eta'],
  })
  .refine((d) => new Date(d.cutoff_at) <= new Date(d.etd), {
    message: 'กำหนดปิดรับการจองต้องไม่เกินวันเวลาออกเดินทาง',
    path: ['cutoff_at'],
  });

/** ตัดตัวอักษร T ออกจาก datetime-local ของเบราว์เซอร์ให้ MySQL รับได้ */
const toSql = (s) => s.replace('T', ' ').slice(0, 19);

/** UC-11 Manage Vessel Schedules */
router.get(
  '/',
  validate({
    query: z.object({
      q: z.string().trim().max(120).optional(),
      serviceId: z.coerce.number().int().positive().optional(),
      status: z.enum(['open', 'closing', 'closed', 'departed']).optional(),
      page: z.coerce.number().int().min(1).default(1),
      pageSize: z.coerce.number().int().min(1).max(100).default(50),
    }),
  }),
  asyncHandler(async (req, res) => {
    const { q, serviceId, status, page, pageSize } = req.query;
    const where = [];
    const params = [];

    if (q) {
      where.push('(vs.voyage_no LIKE ? OR v.name LIKE ? OR s.name LIKE ?)');
      const like = `%${q}%`;
      params.push(like, like, like);
    }
    if (serviceId) {
      where.push('vs.service_id = ?');
      params.push(serviceId);
    }
    if (status) {
      where.push('vs.status = ?');
      params.push(status);
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const offset = (page - 1) * pageSize;

    const [{ total }] = await db.query(
      `SELECT COUNT(*) AS total FROM vessel_schedules vs
         JOIN vessels v ON v.id = vs.vessel_id
         JOIN services s ON s.id = vs.service_id ${whereSql}`,
      params
    );

    const items = await db.query(
      `SELECT vs.*, v.name AS vessel_name, v.imo_number, s.code AS service_code, s.name AS service_name,
              (vs.capacity_teu - vs.booked_teu) AS available_teu,
              (SELECT COUNT(*) FROM bookings b WHERE b.schedule_id = vs.id AND b.status <> 'cancelled') AS booking_count
         FROM vessel_schedules vs
         JOIN vessels v ON v.id = vs.vessel_id
         JOIN services s ON s.id = vs.service_id
         ${whereSql} ORDER BY vs.etd DESC LIMIT ${pageSize} OFFSET ${offset}`,
      params
    );

    const vessels = await db.query('SELECT id, name, imo_number, operator FROM vessels ORDER BY name');
    res.json({ items, total, page, pageSize, vessels });
  })
);

router.post(
  '/',
  validate({ body: bodySchema }),
  asyncHandler(async (req, res) => {
    const b = req.body;
    const dup = await db.queryOne('SELECT id FROM vessel_schedules WHERE vessel_id = ? AND voyage_no = ?', [
      b.vessel_id,
      b.voyage_no,
    ]);
    if (dup) throw conflict('เรือลำนี้มีเที่ยวเลขนี้อยู่แล้ว');

    const result = await db.query(
      `INSERT INTO vessel_schedules (service_id, vessel_id, voyage_no, etd, eta, berth, cutoff_at, capacity_teu, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [b.service_id, b.vessel_id, b.voyage_no, toSql(b.etd), toSql(b.eta), b.berth || null, toSql(b.cutoff_at), b.capacity_teu, b.status]
    );
    await audit(req.user.id, 'create_schedule', 'vessel_schedule', result.insertId, { voyage_no: b.voyage_no });

    res.status(201).json({ message: 'เพิ่มตารางเที่ยวเรือเรียบร้อยแล้ว', id: result.insertId });
  })
);

router.put(
  '/:id',
  validate({ params: idParam, body: bodySchema }),
  asyncHandler(async (req, res) => {
    const b = req.body;
    const existing = await db.queryOne('SELECT * FROM vessel_schedules WHERE id = ?', [req.params.id]);
    if (!existing) throw notFound('ไม่พบตารางเที่ยวเรือที่ต้องการแก้ไข');

    // ลดความจุลงต่ำกว่าที่จองไปแล้วไม่ได้ ไม่งั้น booked_teu จะเกิน capacity ทันที
    if (b.capacity_teu < existing.booked_teu) {
      throw badRequest(
        `ไม่สามารถลดความจุเหลือ ${b.capacity_teu} TEU ได้ เนื่องจากมีการจองไปแล้ว ${existing.booked_teu} TEU`
      );
    }

    const dup = await db.queryOne(
      'SELECT id FROM vessel_schedules WHERE vessel_id = ? AND voyage_no = ? AND id <> ?',
      [b.vessel_id, b.voyage_no, req.params.id]
    );
    if (dup) throw conflict('เรือลำนี้มีเที่ยวเลขนี้อยู่แล้ว');

    await db.query(
      `UPDATE vessel_schedules SET service_id = ?, vessel_id = ?, voyage_no = ?, etd = ?, eta = ?,
              berth = ?, cutoff_at = ?, capacity_teu = ?, status = ? WHERE id = ?`,
      [b.service_id, b.vessel_id, b.voyage_no, toSql(b.etd), toSql(b.eta), b.berth || null, toSql(b.cutoff_at), b.capacity_teu, b.status, req.params.id]
    );
    await audit(req.user.id, 'update_schedule', 'vessel_schedule', req.params.id, { voyage_no: b.voyage_no });

    res.json({ message: 'บันทึกการเปลี่ยนแปลงเรียบร้อยแล้ว' });
  })
);

router.delete(
  '/:id',
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    const schedule = await db.queryOne('SELECT id, voyage_no FROM vessel_schedules WHERE id = ?', [req.params.id]);
    if (!schedule) throw notFound('ไม่พบตารางเที่ยวเรือที่ต้องการลบ');

    // UC-11 Alternate Flow 3: "ตารางเรือที่มี Booking แล้วลบไม่ได้"
    const [{ c }] = await db.query(
      "SELECT COUNT(*) AS c FROM bookings WHERE schedule_id = ? AND status <> 'cancelled'",
      [req.params.id]
    );
    if (c > 0) {
      throw conflict(`ไม่สามารถลบเที่ยวเรือนี้ได้ เนื่องจากมีรายการจองผูกอยู่ ${c} รายการ`);
    }

    await db.query('DELETE FROM vessel_schedules WHERE id = ?', [req.params.id]);
    await audit(req.user.id, 'delete_schedule', 'vessel_schedule', req.params.id, { voyage_no: schedule.voyage_no });
    res.json({ message: 'ลบตารางเที่ยวเรือเรียบร้อยแล้ว' });
  })
);

module.exports = router;
