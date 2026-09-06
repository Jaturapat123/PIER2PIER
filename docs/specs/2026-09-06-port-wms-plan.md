# Port WMS Implementation Plan

**Goal:** ระบบ Port WMS แบบ multi-tier ที่รัน local ได้ด้วย `docker compose up` และ deploy ขึ้น AWS ได้ด้วย `terraform apply` + `git push`

**Architecture:** React SPA (S3/CloudFront) → ALB → Express API บน EC2 ×2 คนละ AZ → RDS MySQL · CI/CD ผ่าน GitHub Actions → ECR → SSM

**Tech Stack:** Node 20 · Express 4 · mysql2 · JWT · zod · Jest+Supertest · React 18 · Vite 5 · TypeScript · Tailwind · Recharts · Terraform 1.6 · Docker

**Spec:** `docs/specs/2026-09-06-port-wms-design.md`

> **หมายเหตุการเบี่ยงจาก template:** plan นี้ไม่ฝังโค้ดเต็มในทุก step เพราะผู้เขียนแผนคือผู้ลงมือเอง
> ในเซสชันเดียวกัน (ไม่มี hand-off ให้ engineer ที่ไม่มี context) — แต่ละ task จึงระบุ
> **ไฟล์ · interface ที่ผลิต · คำสั่งตรวจ** ให้ครบพอที่จะรีวิวทีละ task ได้

## Global Constraints

- Node 20 · MySQL 8.0 · Terraform >= 1.6 · region `ap-southeast-1`
- ห้ามเก็บ state ใน memory ของ process — session = JWT, ตะกร้า = `bookings.status='pending'`
- ห้าม hardcode credential — ทุกค่าผ่าน `config/env.js` ที่ validate ตอน boot
- `GET /health` ต้อง query DB จริงก่อนคืน 200 · คืน `instance.availabilityZone` เสมอ
- UI copy ภาษาไทย คงศัพท์เทคนิคอังกฤษ
- ทุก response error รูปแบบเดียว: `{ error: { code, message, details? } }`

---

### Task 1: Backend skeleton + config + health

**Files:** `backend/package.json` · `src/config/env.js` · `src/db/pool.js` · `src/utils/instance.js` · `src/routes/health.js` · `src/app.js` · `src/server.js` · `tests/health.test.js`

**Produces:** `createApp()` · `pool.query()` · `pool.tx(fn)` · `getInstanceInfo()`

- [ ] เขียน test: `/health/live` → 200 · `/health` → 200 พร้อม `instance.hostname` · DB ล่ม → 503
- [ ] รัน → fail
- [ ] implement env/pool/instance/health/app/server + graceful SIGTERM
- [ ] `npm test` → pass

### Task 2: Schema + migration runner + seed

**Files:** `src/db/migrations/001_init.sql` · `002_seed_reference.sql` · `src/db/migrate.js` · `src/db/seed.js`

**Produces:** 11 ตารางตาม spec §4 · ผู้ใช้ demo `admin@pier2pier.test` / `customer@pier2pier.test`

- [ ] เขียน migration runner + ตาราง `schema_migrations`
- [ ] `npm run migrate && npm run seed` → ตารางครบ, seed ไม่ error เมื่อรันซ้ำ

### Task 3: Auth (UC-1, 2, 9) + middleware

**Files:** `src/middleware/{auth,validate,error,requestId}.js` · `src/routes/auth.js` · `src/services/audit.js` · `tests/auth.test.js`

**Produces:** `requireAuth` · `requireRole('admin')` · `validate(schema)` · `signToken(user)`

- [ ] test: สมัคร → login → `/auth/me` · อีเมลซ้ำ → 409 · รหัสผิด → 401 · บัญชี suspended → 403
- [ ] implement bcrypt + JWT + zod + error handler กลาง
- [ ] `npm test` → pass

### Task 4: Catalog (UC-3, 4)

**Files:** `src/routes/services.js` · `src/routes/schedules.js` · `tests/services.test.js`

**Produces:** `GET /api/services?q&type&origin&destination` · `GET /api/schedules?q&serviceId&from&to&status`

- [ ] test: ค้นหาเจอ · ค้นหาไม่เจอ → `{items:[],total:0}` (ไม่ใช่ 404) ตาม UC-4 Alternate Flow 1
- [ ] implement + pagination
- [ ] `npm test` → pass

### Task 5: Booking (UC-5, 6, 7) — หัวใจของระบบ

**Files:** `src/services/booking.service.js` · `src/routes/bookings.js` · `tests/booking.test.js`

**Produces:** `createBooking()` · `confirmBooking()` · `cancelBooking()` · booking_no `BK-YYYYMMDD-NNNN`

- [ ] test: จองสำเร็จ → status `pending` · **จองเกิน `capacity_teu` → 409 (UC-5 Alt Flow 1)** ·
      confirm → `confirmed` + สร้าง `shipment_orders` · confirm ซ้ำ → 409 ·
      ดู booking ของคนอื่น → 404 · booked_teu เพิ่มถูกต้องภายใต้ transaction
- [ ] implement ด้วย `pool.tx()` + `SELECT ... FOR UPDATE` กัน race
- [ ] `npm test` → pass

### Task 6: Profile (UC-8) + Admin CRUD (UC-10, 11, 12, 13)

**Files:** `src/routes/profile.js` · `src/routes/admin/{users,services,schedules,containers,bookings}.js` · `tests/admin.test.js`

**Produces:** REST CRUD ครบ 5 resource + guard `requireRole('admin')` + เขียน `audit_logs` ทุก mutation

- [ ] test: customer เรียก admin API → 403 · ลบ container type ที่มี booking อ้างอยู่ → 409 (UC-12 Alt Flow 3) ·
      ลบ user ที่มี booking → 409 (UC-10)
- [ ] implement
- [ ] `npm test` → pass

### Task 7: Stock (UC-14) + Reports (UC-15)

**Files:** `src/routes/admin/stock.js` · `src/routes/admin/reports.js` · `src/services/report.service.js` · `tests/stock.test.js`

**Produces:** `POST /stock/:id/adjust` (บันทึก `stock_transactions` เสมอ) · `reports/{summary,bookings,stock,revenue}` + `?format=csv`

- [ ] test: adjust แล้ว qty เปลี่ยน + มี transaction 1 แถว · adjust จน qty ติดลบ → 400 · report คืนช่วงวันที่ถูก
- [ ] implement
- [ ] `npm test` → pass

### Task 8: Dockerfile + docker-compose + smoke script

**Files:** `backend/Dockerfile` · `docker-compose.yml` · `.env.example` · `scripts/smoke.sh`

- [ ] `docker compose up -d` → `curl localhost:3000/health` คืน 200 และ `db.ok=true`

### Task 9: Frontend base — design system + auth + layout

**Files:** `frontend/{package.json,vite.config.ts,tailwind.config.js,index.html}` · `src/styles/index.css` · `src/lib/{api.ts,auth.tsx,format.ts}` · `src/components/{Layout,StatusBadge,DataTable,Field,Button,Toast}.tsx` · `src/pages/{Landing,Login,Register}.tsx`

**Produces:** token/สี/สเปซตาม spec §6 · `api.get/post/put/del` แนบ JWT อัตโนมัติ · `useAuth()`

- [ ] `npm run build` ผ่าน · login จริงกับ backend แล้วเด้งเข้า dashboard ตาม role

### Task 10: Frontend customer — services, booking wizard, bookings

**Files:** `src/pages/{Services,ServiceDetail,NewBooking,Bookings,BookingDetail,Profile,Dashboard}.tsx`

- [ ] flow ครบ: ค้นหา → เลือกเที่ยวเรือ → กรอกตู้/สินค้า → สร้าง → ยืนยัน → เห็น timeline

### Task 11: Frontend admin — 7 หน้า + System Health

**Files:** `src/pages/admin/{Overview,Users,Services,Schedules,Containers,Bookings,Stock,Reports,SystemHealth}.tsx`

- [ ] CRUD ทุกหน้าใช้ได้ · Reports มีกราฟ + ปุ่ม export CSV
- [ ] SystemHealth poll `/health` ทุก 2 วิ แสดง hostname/AZ/gitSha + ประวัติ 30 ครั้งล่าสุด

### Task 12: Terraform 7 modules

**Files:** `infra/terraform/{main,variables,outputs,providers}.tf` · `modules/*/{main,variables,outputs}.tf` · `user-data.sh` · `terraform.tfvars.example`

- [ ] `terraform init && terraform validate && terraform plan` ผ่านไม่มี error

### Task 13: CI/CD 3 workflows

**Files:** `.github/workflows/{ci,deploy,rollback}.yml`

- [ ] YAML ผ่าน validate · deploy ไล่ทีละเครื่อง + รอ target healthy ก่อนไปเครื่องถัดไป

### Task 14: Test scripts + README + AWS report

**Files:** `scripts/{loadtest.sh,failover-test.sh}` · `README.md` · `docs/AWS_Services_Report.md`

- [ ] loadtest นับ response แยกตาม instanceId ได้ · report ครบทุกหัวข้อที่สั่ง

---

## Self-Review

- **Spec coverage:** §2 infra → T12 · §3 stateless → T3,T5 · §4 schema → T2 · §5 backend → T1,T3–T7 ·
  §6 frontend → T9–T11 · §7 UC mapping → T3–T7 + T10,T11 · §8 → T12 · §9 → T13 · §10 testing → ทุก task + T14
- **Placeholder scan:** ไม่มี TBD/TODO
- **Type consistency:** `pool.query/tx` · `createApp` · `getInstanceInfo` · `requireAuth/requireRole` ใช้ชื่อเดียวกันทุก task
