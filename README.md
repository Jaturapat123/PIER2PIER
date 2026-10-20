# Pier2Pier — Port Warehouse Management System

ระบบจัดการคลังสินค้าและพื้นที่จัดเก็บของท่าเรือ บนสถาปัตยกรรม Multi-Tier ของ AWS
พร้อม Load Balancing และ CI/CD Pipeline

โครงงานรายวิชา Cloud Computing ภาคเรียนที่ 1/2569
คณะเทคโนโลยีสารสนเทศ สถาบันเทคโนโลยีพระจอมเกล้าเจ้าคุณทหารลาดกระบัง

---

## เริ่มใช้งานบนเครื่องตัวเอง

ต้องมี Docker Desktop และ Node.js 20 ขึ้นไป

```bash
# 1. เปิดฐานข้อมูล + API สองเครื่อง + Load Balancer
docker compose up -d --build

# 2. เปิดหน้าเว็บ
cd frontend && npm install && npm run dev
```

เปิด http://localhost:5173

| บทบาท | อีเมล | รหัสผ่าน |
|---|---|---|
| ผู้ดูแลระบบ | `admin@pier2pier.test` | `Pier2Pier!2569` |
| ลูกค้า / ตัวแทนขนส่ง | `customer@pier2pier.test` | `Pier2Pier!2569` |

`docker compose` จำลองสภาพแวดล้อมจริง: `api-a` และ `api-b` แทน EC2 สองเครื่องคนละ AZ
โดยมี nginx ที่พอร์ต 8080 ทำหน้าที่แทน ALB — ทดสอบการกระจายโหลดและ failover
ได้ตั้งแต่บนโน้ตบุ๊กก่อนขึ้น AWS

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
├── infra/terraform/        VPC · ALB · EC2 · RDS · S3 static website · ECR · CloudWatch
│   └── modules/
│
├── .github/workflows/      ci.yml · deploy.yml · rollback.yml
│
├── scripts/                smoke.sh · loadtest.sh · failover-test.sh
├── docs/
│   ├── AWS_Services_Report.md        รายงานหลัก: บริการ AWS + ฟีเจอร์ระบบ
│   └── specs/                        เอกสารออกแบบและแผนการพัฒนา
└── docker-compose.yml
```

---

## คำสั่งที่ใช้บ่อย

```bash
# Backend
cd backend
npm run migrate      # สร้างตาราง
npm run seed         # ใส่ข้อมูลสาธิต (รันซ้ำได้)
npm test             # รันเทสต์ทั้งหมด (ต้องมี MySQL อยู่)
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

### ครั้งแรก

ทำตาม [คู่มือ AWS Academy แบบทีละขั้น](docs/AWS_ACADEMY_STEPS.md) สำหรับคำสั่ง PowerShell ตั้งแต่เริ่มแล็บจนถึง destroy

สำหรับ AWS Academy Learner Lab ที่ทดสอบจริง ดู [ผล apply และข้อจำกัดของแล็บ](results/task4/verification.md):
ต้องสร้าง S3 bucket ด้วย AWS CLI แล้วตั้ง `manage_frontend_bucket = false` เพราะ SCP ปฏิเสธการอ่าน Object Lock ของ Terraform;
ใช้ `db_password` ไม่เกิน 41 ตัวอักษร และกำหนด `image_tag` เป็นแท็กที่จะ push ไป ECR

```bash
cd infra/terraform
cp terraform.tfvars.example terraform.tfvars   # ใส่ db_password และ jwt_secret

terraform init
terraform apply -target=module.ecr  # สร้าง repository ก่อน push image
# สร้าง S3 bucket และ push API image ไป ECR ด้วยแท็กที่กำหนดใน terraform.tfvars
terraform plan       # ตรวจดูว่าจะสร้างอะไรบ้างก่อนกด apply
terraform apply
```

หลัง destroy ต้องลบทุก version ของไฟล์ใน S3 แล้วลบ bucket ด้วย AWS CLI ด้วย

Terraform จะแสดง `alb_dns_name`, `web_endpoint` และ `ecr_repository_url`

> `web_endpoint` คือที่อยู่หน้าเว็บ รูปแบบ `http://pier2pier-dev-web.s3-website-us-east-1.amazonaws.com`
> **เป็น HTTP เท่านั้น** — S3 website endpoint ไม่รองรับ HTTPS และ Learner Lab ใช้ CloudFront ไม่ได้
เมื่อสร้างเสร็จ

### ตั้งค่า GitHub

Learner Lab สร้าง IAM role สำหรับ GitHub OIDC ไม่ได้ ให้ใช้ access key, secret key และ session token จาก AWS Details เป็น GitHub Secrets (ต้องอัปเดตทุก session):

| Secret | ค่า |
|---|---|
| `AWS_ACCESS_KEY_ID` | Access key ชั่วคราวจาก AWS Details |
| `AWS_SECRET_ACCESS_KEY` | Secret key ชั่วคราวจาก AWS Details |
| `AWS_SESSION_TOKEN` | Session token ชั่วคราวจาก AWS Details |

อย่า commit ค่าเหล่านี้ลง repository และต้องอัปเดตเมื่อเริ่ม lab session ใหม่

### หลังจากนั้น

```bash
git push origin main     # CI ทดสอบ → build → push ECR → deploy ทีละเครื่อง
```

### เมื่อต้อง rollback

เปิด GitHub → Actions → Rollback → Run workflow
ใส่แท็ก git SHA ของเวอร์ชันที่ต้องการย้อนกลับไป และเหตุผล

ระบบตรวจก่อนว่ามี image แท็กนั้นใน ECR จริง แล้วจึง deploy ทีละเครื่องพร้อมรอ health check

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

---

## กฎที่ห้ามละเมิด

1. **EC2 สองเครื่องต้องอยู่คนละ Availability Zone** — ไม่งั้น HA ไม่มีความหมาย
2. **ห้ามเก็บ state ใน memory ของ process** — session ใช้ JWT · การจองที่ยังไม่ยืนยันเก็บใน RDS
3. **RDS และ EC2 อยู่ private subnet** · ALB อยู่ public subnet · RDS ห้ามเปิดสาธารณะ
4. **`GET /health` ต้อง query ฐานข้อมูลจริงก่อนคืน 200**
5. **ห้าม hardcode credential** — ใช้ SSM Parameter Store และ GitHub Secrets เท่านั้น

---

## เอกสาร

| ไฟล์ | เนื้อหา |
|---|---|
| [`docs/AWS_Services_Report.md`](docs/AWS_Services_Report.md) | รายงานหลัก — บริการ AWS ทุกตัวพร้อมเหตุผล ฟีเจอร์ระบบ ผลการทดลอง ค่าใช้จ่าย |
| [`docs/AWS_ACADEMY_STEPS.md`](docs/AWS_ACADEMY_STEPS.md) | ขั้นตอน deploy และ destroy ใน AWS Academy Learner Lab |
| [`docs/specs/2026-09-06-port-wms-design.md`](docs/specs/2026-09-06-port-wms-design.md) | เอกสารออกแบบระบบ |
| [`docs/specs/2026-09-06-port-wms-plan.md`](docs/specs/2026-09-06-port-wms-plan.md) | แผนการพัฒนาแบ่งเป็น 14 งานย่อย |
