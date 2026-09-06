# Design Spec — Pier2Pier Port WMS on AWS

> วันที่: 6 ก.ย. 2569 · สถานะ: อนุมัติแล้ว (brainstorming → design → spec)
> โดเมน: **Cloud-Based Multi-Tier Web Application with CI/CD Pipeline for Port Warehouse Management**

---

## 1. ขอบเขตและเป้าหมาย

สร้างระบบที่ **รันได้จริง** และ **พร้อม deploy ลง AWS** เพื่อใช้เป็นทั้ง (ก) mockup สาธิตตอนนำเสนอ
และ (ข) ระบบจริงที่เก็บหลักฐานการทดลอง Stage 3 ได้

เป้าหมายที่วัดผลได้:

| # | เป้าหมาย | วิธียืนยัน |
|---|---|---|
| G1 | ระบบรัน local ได้ด้วยคำสั่งเดียว | `docker compose up` แล้วเปิด `http://localhost:5173` ล็อกอินได้ |
| G2 | ครบ 15 Use Case ตาม Use-Case Spec | ตาราง UC → หน้าจอ → API ในหัวข้อ 7 ตรงทุกแถว |
| G3 | Stateless พิสูจน์ได้ | ไม่มี session store ใน memory · ปิด backend 1 ตัวแล้ว flow การจองยังต่อได้ |
| G4 | เห็นได้ว่า ALB ส่งไป EC2 เครื่องไหน | `GET /health` คืน hostname + AZ + instanceId · หน้า System Health poll แล้ว badge สลับ |
| G5 | Deploy + Rollback อัตโนมัติ | push → GitHub Actions → ECR → EC2 ทั้ง 2 เครื่อง · `rollback.yml` ระบุ tag เดิมกลับได้ |
| G6 | Infra สร้างใหม่ได้จากศูนย์ | `terraform apply` สร้าง VPC→ALB→EC2×2→RDS→S3/CloudFront ครบ |

**นอกขอบเขต (ตั้งใจไม่ทำ):** Auto Scaling, ECS/EKS, payment gateway จริง, mobile native app, ElastiCache

---

## 2. สถาปัตยกรรม

```
Users ──► CloudFront (OAC, HTTPS) ──► S3 (React build, private bucket)
   │
   └────► ALB (public subnet, 2 AZ, /health check)
              ├──► EC2-A (private, ap-southeast-1a) ─┐  Docker: Express API
              └──► EC2-B (private, ap-southeast-1b) ─┤
                                                     └──► RDS MySQL (private, Multi-AZ)

GitHub push → Actions → build+test → Docker image tag=<git-sha> → ECR
                                          └─► SSM Send-Command → EC2 A,B: docker pull + run

CloudWatch ◄── ALB metrics · EC2 logs (awslogs driver) · RDS metrics · Alarms
```

**กฎที่ห้ามละเมิด** (สืบทอดจาก CLAUDE.md):
1. EC2 สองเครื่องคนละ AZ
2. ไม่มี state ใน memory ของ EC2 — ทุก state อยู่ RDS หรือ JWT
3. EC2 + RDS อยู่ private subnet · ALB อยู่ public subnet
4. `GET /health` ต้องเช็ค DB จริงก่อนคืน 200
5. ไม่ hardcode credential — env var / SSM Parameter Store / GitHub Secrets

---

## 3. ทำไมต้อง Stateless และ "ตะกร้า" อยู่ที่ไหน

คำถามที่กรรมการถามบ่อยที่สุดคือ *"session เก็บที่ไหน"* เพราะมี EC2 2 เครื่องหลัง ALB
ถ้าเก็บใน memory ผู้ใช้ที่ถูก route ไปอีกเครื่องจะหลุด login ทันที

การออกแบบนี้ตอบได้ 2 ชั้น:

- **Session → JWT** (HS256, exp 8 ชม.) เซ็นด้วย secret ที่มาจาก env เหมือนกันทั้ง 2 เครื่อง
  เครื่องไหนก็ verify token เดียวกันได้ ไม่ต้อง share อะไรเลย
- **"ตะกร้า" → แถวใน RDS** — Booking ที่ยังไม่ยืนยันคือ `bookings.status = 'pending'`
  ตรงกับ UC-5 (Create Booking → Pending) และ UC-6 (Confirm Booking → Confirmed) พอดี
  ไม่ต้องประดิษฐ์ cart แยก และเป็นข้อมูลถาวรที่ Admin เห็นใน UC-13 ได้ด้วย

---

## 4. Data Model

```sql
users(id, username, full_name, email UNIQUE, phone, company_name,
      password_hash, role ENUM('customer','admin'), status ENUM('active','suspended'),
      created_at, updated_at)

services(id, code UNIQUE, name, service_type ENUM('import','export','transshipment','storage'),
         origin_port, destination_port, transit_days, base_price, description,
         status ENUM('active','inactive'), created_at, updated_at)

vessels(id, name, imo_number UNIQUE, operator, capacity_teu)

vessel_schedules(id, service_id FK, vessel_id FK, voyage_no,
                 etd DATETIME, eta DATETIME, berth, cutoff_at DATETIME,
                 capacity_teu, booked_teu,
                 status ENUM('open','closing','closed','departed'), created_at)

container_types(id, code UNIQUE, name, size_ft, teu_factor, max_payload_kg,
                description, is_active)

bookings(id, booking_no UNIQUE, user_id FK, schedule_id FK, service_id FK,
         cargo_type, cargo_weight_kg, pickup_location, notes,
         total_teu, total_price,
         status ENUM('pending','confirmed','in_progress','completed','cancelled'),
         created_at, confirmed_at, updated_at)

booking_items(id, booking_id FK, container_type_id FK, qty, unit_price)

shipment_orders(id, order_no UNIQUE, booking_id FK,
                status ENUM('created','gate_in','loaded','departed','delivered'),
                gate_in_at, loaded_at, departed_at, delivered_at, updated_at)

stock_items(id, sku UNIQUE, name, category, unit, warehouse_zone,
            qty_on_hand, reorder_level, is_active, created_at, updated_at)

stock_transactions(id, stock_item_id FK, change_qty, type ENUM('in','out','adjust'),
                   reason, ref_booking_id, admin_id FK, created_at)

audit_logs(id, user_id FK, action, entity, entity_id, meta JSON, created_at)
```

**เหตุผลของตารางที่ "เกิน" Use-Case Spec:**

- `vessel_schedules.capacity_teu / booked_teu` — ทำให้ UC-5 Alternate Flow 1
  ("ระบบรับ booking ไม่ได้") มีเงื่อนไขจริงให้ตรวจ ไม่ใช่กิ่งที่ไม่มีวันเกิด
  ตรงกับ VBS จริงที่คุม quota ต่อ slot เพื่อลดความแออัดหน้าท่า
- `shipment_orders` — UC-6 ระบุตรง ๆ ว่า "ระบบสร้าง/อัปเดตข้อมูล Shipment Order"
  และ UC-7 ให้ดู "Booking / Shipment Orders"
- `booking_items` — 1 booking จองหลายประเภทตู้ได้ (20GP + 40HC) ตามจริง
- `audit_logs` — UC-10/13/14 ให้ Admin แก้ข้อมูลของคนอื่น ต้องสาวกลับได้ว่าใครแก้

---

## 5. Backend

**Stack:** Node.js 20 + Express 4 + `mysql2/promise` (connection pool) + `jsonwebtoken` + `bcryptjs` + `zod`
ไม่ใช้ ORM — เขียน SQL ตรง ๆ เพื่อให้อธิบายกลไกได้ทุกบรรทัดตอนตอบกรรมการ

**โครงสร้าง**
```
src/
  server.js        bootstrap + graceful shutdown (SIGTERM → หยุดรับ conn → ปิด pool)
  app.js           express app (CORS, helmet, json, requestId, routes, error handler)
  config/env.js    อ่าน+validate env ทั้งหมดที่จุดเดียว ถ้าขาด → ตายทันทีตอน start
  db/pool.js       mysql2 pool + query() + tx() helper
  db/migrate.js    รัน .sql ใน migrations/ ตามลำดับ พร้อมตาราง schema_migrations
  db/seed.js       ข้อมูลสาธิต (ท่าเรือไทย, เที่ยวเรือ, ตู้, สินค้าคลัง, ผู้ใช้)
  middleware/      auth.js (JWT+role) · validate.js (zod) · error.js · requestId.js
  routes/          health · auth · services · schedules · bookings · profile
                   admin/{users,services,schedules,containers,bookings,stock,reports}
  services/        booking.service.js (logic การจอง+quota) · report.service.js · audit.js
  utils/           instance.js (อ่าน EC2 metadata) · asyncHandler.js · httpError.js
```

**Health check 2 ระดับ** (ตามคำแนะนำ AWS เรื่อง deep vs shallow health check):

| Endpoint | ใช้โดย | ทำอะไร |
|---|---|---|
| `GET /health/live` | container / debug | คืน 200 ถ้า process ยังอยู่ ไม่แตะ DB |
| `GET /health` | **ALB target group** | `SELECT 1` จริง · ถ้า DB ล่ม → 503 → ALB ถอดเครื่องนี้ออก |

`GET /health` คืน
```json
{ "status":"ok",
  "instance":{"hostname":"ip-10-0-11-23","availabilityZone":"ap-southeast-1a","instanceId":"i-0abc"},
  "version":{"gitSha":"a1b2c3d","imageTag":"a1b2c3d"},
  "db":{"ok":true,"latencyMs":3},
  "uptimeSec":842 }
```
นี่คือหลักฐาน Stage 3 — หน้า System Health poll ทุก 2 วินาที เห็นเลยว่า ALB สลับเครื่องเมื่อไหร่

**Graceful shutdown:** รับ SIGTERM → `server.close()` → รอ in-flight request จบ → `pool.end()` → exit
ตั้ง ALB `deregistration_delay = 30s` ให้สอดคล้อง (ค่าที่แนะนำสำหรับ service ทั่วไปคือ 30–60 วิ)
ถ้าไม่ทำข้อนี้ ตอน rolling deploy ผู้ใช้จะเจอ 502 กลางคัน

**API (ย่อ)**
```
POST   /api/auth/register | /login | /logout          GET /api/auth/me
GET    /api/services      ?q&type&origin&destination  GET /api/services/:id
GET    /api/schedules     ?q&serviceId&from&to&status GET /api/schedules/:id
POST   /api/bookings                                  GET /api/bookings  ?status
GET    /api/bookings/:id      POST /api/bookings/:id/confirm    POST /api/bookings/:id/cancel
GET    /api/profile           PUT  /api/profile
ADMIN  /api/admin/users · services · schedules · container-types · bookings
       /api/admin/stock  (+ POST /api/admin/stock/:id/adjust)
       /api/admin/reports/summary | bookings | stock | revenue   ?from&to&format=csv
```

---

## 6. Frontend

**Stack:** React 18 + Vite 5 + TypeScript + Tailwind CSS + React Router 6 + Recharts

**Design direction — "Port Operations Console"**
- ฐาน navy/steel (`#0B1F33` → `#1B2C3F`) พื้นผิว slate อ่อน · accent amber `#F59E0B` (สีเครน/สีเสื้อกั๊กท่าเรือ)
- status เป็นสีคงที่ทั้งระบบ: pending=amber · confirmed=teal · in_progress=blue · completed=green · cancelled=slate
- ตัวเลข/รหัส (Booking No, IMO, container) ใช้ monospace เสมอ — สแกนสายตาง่ายในตารางยาว
- ตารางแบบ data-dense: แถวสูง 40px, sticky header, ไม่มีเงาฟุ้ง
- ฟอนต์: `IBM Plex Sans Thai` (ไทย) + `JetBrains Mono` (ตัวเลข/รหัส)

**หน้าจอ**

| กลุ่ม | หน้า |
|---|---|
| Public | Landing · Services & Schedules (ค้นหา+ฟิลเตอร์) · Service Detail · Login · Register |
| Customer | Dashboard · New Booking (wizard 3 ขั้น) · My Bookings · Booking Detail (+Confirm/Cancel + timeline) · Profile |
| Admin | Overview (KPI+กราฟ) · Users · Services & Schedules · Container Types · Bookings · Stock (+adjust modal+log) · Reports (กราฟ+export CSV) · **System Health** |

**ภาษา:** ไทยเป็นหลัก คงศัพท์เทคนิคอังกฤษ (Booking, Container, Vessel Schedule, Health Check)

---

## 7. Mapping: Use Case → หน้าจอ → API

| UC | ชื่อ | หน้าจอ | API |
|---|---|---|---|
| 1 | Register | `/register` | `POST /api/auth/register` |
| 2 | Login | `/login` | `POST /api/auth/login` |
| 3 | View Services | `/services`, `/services/:id` | `GET /api/services`, `/api/schedules` |
| 4 | Search Services | `/services` (แถบค้นหา) | `GET /api/services?q=&type=&origin=` |
| 5 | Create Booking | `/bookings/new` | `POST /api/bookings` |
| 6 | Confirm Booking | `/bookings/:id` | `POST /api/bookings/:id/confirm` |
| 7 | View Bookings | `/bookings`, `/bookings/:id` | `GET /api/bookings` |
| 8 | Update Profile | `/profile` | `PUT /api/profile` |
| 9 | Logout | ทุกหน้า (เมนูบน) | `POST /api/auth/logout` |
| 10 | Manage Users | `/admin/users` | `/api/admin/users` |
| 11 | Manage Services | `/admin/services`, `/admin/schedules` | `/api/admin/services`, `/schedules` |
| 12 | Manage Container | `/admin/containers` | `/api/admin/container-types` |
| 13 | Manage Bookings | `/admin/bookings` | `/api/admin/bookings` |
| 14 | Manage Stock | `/admin/stock` | `/api/admin/stock`, `/stock/:id/adjust` |
| 15 | View Reports | `/admin/reports` | `/api/admin/reports/*` |

ทุก UC ที่แตะ DB มี exception 2 แบบตาม spec: **validation error (400)** และ **DB ล่ม (503)**
จัดการรวมที่ `middleware/error.js` ที่เดียว

---

## 8. Infrastructure (Terraform)

| Module | สร้างอะไร |
|---|---|
| `network` | VPC 10.0.0.0/16 · public subnet ×2 · private-app ×2 · private-db ×2 · IGW · NAT ×1 · route tables · SG 4 ตัว (alb/app/db/endpoint) |
| `ecr` | ECR repo + lifecycle policy เก็บ 10 image ล่าสุด |
| `alb` | ALB (public) · target group (`/health`, interval 15s, healthy 2, unhealthy 3, deregistration_delay 30s) · listener :80 |
| `compute` | EC2 ×2 คนละ AZ · IAM role (ECR pull + SSM + CloudWatch Logs) · user-data ติดตั้ง docker แล้ว pull image |
| `database` | RDS MySQL 8 · private subnet group · ปิด public access · backup 7 วัน · ตัวแปร `multi_az` สลับ dev/prod ได้ |
| `frontend_cdn` | S3 (private, versioning) · CloudFront + OAC · custom error 403/404 → `/index.html` (จำเป็นสำหรับ SPA routing ไม่งั้น refresh หน้า `/bookings` จะ 403) |
| `monitoring` | CloudWatch log group · alarm: ALB 5xx, UnHealthyHostCount, RDS CPU/FreeStorage · dashboard รวม |

**Security:** SG แบบ chain — ALB รับ 0.0.0.0/0:80 → app SG รับ 3000 จาก ALB SG เท่านั้น → db SG รับ 3306 จาก app SG เท่านั้น
Secret (DB password, JWT secret) เก็บใน **SSM Parameter Store (SecureString)** EC2 ดึงตอน boot

---

## 9. CI/CD

```
ci.yml       PR → npm ci → lint → test (backend jest+supertest) → build frontend
deploy.yml   push main → test → docker build tag=<git-sha> + latest → push ECR
                        → SSM Send-Command ไล่ทีละเครื่อง (A เสร็จค่อย B)
                        → รอ target healthy ก่อนไปเครื่องถัดไป → smoke test ผ่าน ALB
rollback.yml workflow_dispatch(image_tag) → SSM deploy tag ที่ระบุ → smoke test
```

**ทำไม SSM แทน SSH:** ไม่ต้องเก็บ private key เป็น GitHub Secret และ EC2 อยู่ private subnet ไม่มี public IP อยู่แล้ว
**ทำไม tag ด้วย git SHA:** `latest` ย้อนกลับไม่ได้ · SHA ทำให้ rollback = deploy tag เดิม ตรงกับ Pain Point #3

---

## 10. Testing

| ชั้น | เครื่องมือ | ครอบคลุม |
|---|---|---|
| Backend unit/integration | Jest + Supertest (DB จริงใน docker) | auth flow, booking + quota เต็ม, confirm ซ้ำ, role guard, health 503 ตอน DB ล่ม |
| Smoke (หลัง deploy) | `scripts/smoke.sh` | `/health` ผ่าน ALB คืน 200 และ gitSha ตรงกับที่เพิ่ง deploy |
| Load / HA | `scripts/loadtest.sh` | ยิงต่อเนื่อง นับ response แยกตาม instanceId → พิสูจน์ว่ากระจายจริง |
| Failover | `scripts/failover-test.sh` | หยุด container เครื่อง A ระหว่างยิงโหลด → บันทึกว่ามี error กี่ตัว, กี่วินาทีจึงกลับมา 100% |

---

## 11. ความเสี่ยงที่รู้ตัว

| ความเสี่ยง | การรับมือ |
|---|---|
| ALB เก็บเงินตลอดเวลาที่เปิด (~$24/เดือน ไม่มี Free Tier) | ตั้ง Billing Alarm · `terraform destroy` โมดูล alb+compute เมื่อไม่ทดลอง |
| NAT Gateway ก็เก็บรายชั่วโมงเช่นกัน | ตัวเลือก `enable_nat = false` แล้วใช้ VPC Endpoint (ECR/S3/SSM/Logs) แทน |
| EC2 ล่มทั้ง 2 เครื่อง = ระบบดับ | ยอมรับตามขอบเขต (ไม่ใช้ Auto Scaling) — ระบุไว้ในหัวข้อข้อจำกัดของรายงาน |
| RDS Single-AZ ช่วง dev = ไม่มี failover จริง | ตัวแปร `multi_az` เปิดตอนสาธิต Stage 3 เท่านั้น |
