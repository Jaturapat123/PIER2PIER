# Pier2Pier — Port Warehouse Management System

ระบบรับจองระวางเที่ยวเรือและบริหารคลังสินค้าของท่าเรือ บนสถาปัตยกรรม Multi-Tier ของ AWS
พร้อม Load Balancing และ CI/CD Pipeline

โครงงานรายวิชา Cloud Computing ภาคเรียนที่ 1/2569
คณะเทคโนโลยีสารสนเทศ สถาบันเทคโนโลยีพระจอมเกล้าเจ้าคุณทหารลาดกระบัง

> 📖 **รายละเอียดทั้งหมดของโครงการอยู่ใน [`INSTRUCTION.md`](INSTRUCTION.md)** — สถาปัตยกรรม · ข้อจำกัดของ AWS Academy Learner Lab · การตัดสินใจทางเทคนิค · runbook การ deploy

---

## เริ่มใช้งานบนเครื่องตัวเอง

ต้องมี Docker Desktop และ Node.js 20 ขึ้นไป · ต้องเปิด **สองหน้าต่าง** เพราะ nginx ที่พอร์ต 8080 เป็น API อย่างเดียว ไม่ได้เสิร์ฟหน้าเว็บ

```bash
# หน้าต่างที่ 1 — ฐานข้อมูล + API สองเครื่อง + Load Balancer
docker compose up -d --build

# หน้าต่างที่ 2 — หน้าเว็บ (vite proxy /api และ /health ไปที่ 8080 ให้เอง)
cd frontend && npm install && npm run dev
```

เปิด http://localhost:5173

| บทบาท | อีเมล | รหัสผ่าน |
|---|---|---|
| ผู้ดูแลระบบ | `admin@pier2pier.test` | `Pier2Pier!2569` |
| ลูกค้า / ตัวแทนขนส่ง | `customer@pier2pier.test` | `Pier2Pier!2569` |
| ตัวแทน | `agent@pier2pier.test` | `Pier2Pier!2569` |

`docker compose` จำลองสภาพแวดล้อมจริง: `api-a` และ `api-b` แทน EC2 สองเครื่องคนละ AZ
โดยมี nginx ที่พอร์ต 8080 ทำหน้าที่แทน ALB — ทดสอบการกระจายโหลดและ failover ได้ตั้งแต่บนโน้ตบุ๊ก

| ปลายทาง | พอร์ต |
|---|---|
| หน้าเว็บ (Vite dev) | 5173 |
| API ผ่าน Load Balancer | 8080 |
| `api-a` ตรง · `api-b` ตรง | 3000 · 3001 |
| MySQL | **3307** |

> **พอร์ต DB เป็น `3307:3306`** เพราะเครื่องผู้พัฒนามี MySQL รันบน 3306 อยู่แล้ว
> `backend/tests/setup.js` จึง default `DB_PORT=3307` — ถ้าย้ายเครื่องอาจต้องแก้

ปิดด้วย `docker compose down`

---

## โครงสร้างโปรเจกต์

```
jekcloud/
├── backend/                Node.js + Express + MySQL (mysql2)
│   ├── src/
│   │   ├── config/env.js       อ่านและตรวจ env ทั้งหมดที่จุดเดียว
│   │   ├── db/                 connection pool · migration · seed
│   │   ├── middleware/         auth (JWT) · validate (zod) · error handler
│   │   ├── routes/             health · auth · services · schedules · bookings · admin/*
│   │   └── services/           booking.service.js (โควตา) · report.service.js
│   ├── tests/                  Jest + Supertest (31 เทสต์)
│   └── Dockerfile
│
├── frontend/               React 18 + Vite + TypeScript + Tailwind
│   └── src/
│       ├── components/         ui.tsx · Layout.tsx · Modal.tsx
│       ├── lib/                api.ts · auth.tsx · format.ts · types.ts
│       └── pages/              หน้าลูกค้า + pages/admin/ (9 หน้า)
│
├── infra/terraform/        7 modules — network · alb · compute · database
│   └── modules/              · frontend_web (S3 static website) · ecr · monitoring
│
├── .github/workflows/      ci.yml · deploy.yml · rollback.yml
│
├── scripts/                smoke.sh · loadtest.sh · failover-test.sh
├── docs/
│   ├── AWS_Services_Report.md   รายงานเชิงเนื้อหา: บริการ AWS + ฟีเจอร์ + ผลการทดลอง
│   └── diagrams/                ไดอะแกรม .drawio 13 ไฟล์
├── results/                หลักฐานผลการทดลองบน AWS จริง (task4 · task5)
├── INSTRUCTION.md          คู่มือเล่มเดียวของโครงงาน
└── docker-compose.yml
```

---

## คำสั่งที่ใช้บ่อย

```bash
# Backend
cd backend
npm run migrate      # สร้างตาราง
npm run seed         # ใส่ข้อมูลสาธิต (รันซ้ำได้)
npm test             # รันเทสต์ทั้งหมด 31 ตัว (ต้องมี MySQL อยู่)
npm run dev          # รันแบบ hot reload

# Frontend
cd frontend
npm run dev          # เซิร์ฟเวอร์พัฒนา
npm run build        # build เป็นไฟล์ static สำหรับขึ้น S3
npm run lint         # ตรวจ TypeScript

# ทดสอบระบบ
./scripts/smoke.sh http://localhost:8080              # ตรวจว่าใช้งานได้จริง 12 รายการ
./scripts/loadtest.sh http://localhost:8080 200 10    # ทดสอบการกระจายโหลด
./scripts/failover-test.sh local http://localhost:8080 wms-api-a
```

---

## Deploy ขึ้น AWS

**ขั้นตอนทีละคำสั่งอยู่ใน [`INSTRUCTION.md` หัวข้อ 8 (Runbook)](INSTRUCTION.md#8-runbook--deploy-บน-learner-lab-ทีละขั้น)** — ตั้งแต่กด Start Lab จนถึง destroy และตรวจว่าไม่เหลือทรัพยากร

สรุปสั้น

```bash
cd infra/terraform
cp terraform.tfvars.example terraform.tfvars   # ใส่ db_password และ jwt_secret

terraform init
terraform apply -target=module.ecr   # สร้าง repository ก่อน push image
# สร้าง S3 bucket ด้วย AWS CLI และ push API image ไป ECR ด้วยแท็กใน terraform.tfvars
terraform plan
terraform apply
```

Terraform จะแสดง `alb_dns_name`, `web_endpoint` และ `ecr_repository_url`

ข้อควรรู้เฉพาะของ AWS Academy Learner Lab

- ต้องสร้าง S3 bucket ด้วย AWS CLI เองแล้วตั้ง `manage_frontend_bucket = false` เพราะ SCP ปฏิเสธ API ที่ Terraform ใช้อ่าน S3 Object Lock
- `db_password` ยาวไม่เกิน **41 ตัวอักษร**
- `web_endpoint` รูปแบบ `http://pier2pier-dev-web.s3-website-us-east-1.amazonaws.com` · **เป็น HTTP เท่านั้น** เพราะ S3 website endpoint ไม่รองรับ HTTPS และแล็บใช้ CloudFront ไม่ได้
- หลัง destroy ต้องลบไฟล์ทุก version ใน S3 แล้วลบ bucket ด้วย AWS CLI เอง

### ตั้งค่า GitHub

Learner Lab สร้าง IAM role สำหรับ GitHub OIDC ไม่ได้ ให้ใช้ credential ชั่วคราวจาก **AWS Details** เป็น GitHub Secrets

| Secret | ค่า |
|---|---|
| `AWS_ACCESS_KEY_ID` | Access key ชั่วคราวจาก AWS Details |
| `AWS_SECRET_ACCESS_KEY` | Secret key ชั่วคราวจาก AWS Details |
| `AWS_SESSION_TOKEN` | Session token ชั่วคราวจาก AWS Details |

**ทั้งสามค่าหมดอายุทุกครั้งที่ปิดแล็บ ต้องใส่ใหม่ทุก session** · อย่า commit ค่าเหล่านี้ลง repository

### หลังจากนั้น

```bash
git push origin main     # CI ทดสอบ → build → push ECR → deploy ทีละเครื่อง → s3 sync หน้าเว็บ
```

### เมื่อต้อง rollback

เปิด GitHub → Actions → Rollback → Run workflow แล้วใส่ git SHA ของเวอร์ชันที่ต้องการย้อนกลับไปพร้อมเหตุผล
ระบบตรวจก่อนว่ามี image แท็กนั้นใน ECR จริง แล้วจึง deploy ทีละเครื่องพร้อมรอ health check — ไม่ build ใหม่

---

## ประหยัดค่าใช้จ่ายระหว่างพัฒนา

ALB และ NAT Gateway คิดเงินตลอดเวลาที่เปิดอยู่แม้ไม่มีใครใช้

```bash
# ปิดเฉพาะส่วนที่แพง แต่เก็บ VPC และ RDS ไว้
terraform destroy -target=module.alb -target=module.compute

# เปิดกลับเมื่อจะทดลอง
terraform apply
```

ตั้ง AWS Budgets พร้อม Billing Alarm ที่ 50%, 80% และ 100% ของงบไว้ตั้งแต่วันแรก
**RDS ไม่ถูกหยุดอัตโนมัติตอนจบ lab session — ต้องปิดเอง ไม่งั้นเดินกินงบต่อ**

---

## กฎที่ห้ามละเมิด

1. **EC2 สองเครื่องต้องอยู่คนละ Availability Zone** — ไม่งั้น HA ไม่มีความหมาย
2. **ห้ามเก็บ state ใน memory ของ process** — session ใช้ JWT · การจองที่ยังไม่ยืนยันเก็บใน RDS
3. **กันจองซ้อนต้องใช้ `SELECT ... FOR UPDATE` ใน transaction เสมอ**
4. **RDS และ EC2 อยู่ private subnet** · ALB อยู่ public subnet · RDS ห้ามเปิดสาธารณะ
5. **`GET /health` ต้อง query ฐานข้อมูลจริงก่อนคืน 200**
6. **ห้าม hardcode credential** — ใช้ SSM Parameter Store และ GitHub Secrets เท่านั้น
7. **หน้าเว็บกับ API อยู่คนละ origin** — frontend build ด้วย `VITE_API_BASE_URL` · backend ตั้ง `CORS_ORIGINS`

กฎฉบับเต็ม 10 ข้อพร้อมเหตุผลอยู่ใน [`INSTRUCTION.md` หัวข้อ 3.1](INSTRUCTION.md)

---

## เอกสาร

| ไฟล์ | เนื้อหา |
|---|---|
| [`INSTRUCTION.md`](INSTRUCTION.md) | **แหล่งข้อมูลเดียวของโครงการ** — สถาปัตยกรรม · ข้อจำกัดแล็บ · การตัดสินใจทางเทคนิค · กลไกการทำงาน · runbook |
| [`docs/AWS_Services_Report.md`](docs/AWS_Services_Report.md) | รายงานเชิงเนื้อหา — บริการ AWS ทุกตัวพร้อมเหตุผล ฟีเจอร์ระบบ ผลการทดลอง ค่าใช้จ่าย |
| [`results/task4/verification.md`](results/task4/verification.md) | หลักฐาน `terraform apply` จริงบน AWS Academy |
| [`results/task5/verification.md`](results/task5/verification.md) | หลักฐานผลการทดลอง 4 ชุดบน AWS จริง |
