# Pier2Pier — Full Project Context

> **สำหรับ Claude Code:** ไฟล์นี้รวม context ทั้งหมดของโครงงาน อ่านให้ครบก่อนเริ่มงาน
> อัปเดตล่าสุด: **14 ต.ค. 2569** · สถานะ: ส่ง Stage 2 แล้ว · **ย้ายเป้าหมาย deploy ไป AWS Academy Learner Lab**
>
> ⚠️ **อ่าน [`instruction.md`](instruction.md) ก่อนเสมอ** — สถาปัตยกรรมเปลี่ยนไปจากไฟล์นี้หลายจุดเพราะข้อจำกัดของ Learner Lab
> ถ้าสองไฟล์ขัดกัน **ให้ยึด `instruction.md`** ไฟล์นั้นมีหลักฐานจากบัญชีจริงกำกับทุกข้อ

---

## 📌 TL;DR — อ่าน 30 วินาที

- **Pier2Pier (กลุ่ม J3K) = ระบบ Port Warehouse Management** — รับจองระวางเที่ยวเรือ + บริหารคลัง/พื้นที่จัดเก็บของท่าเรือ
  **ไม่ใช่ E-Commerce** (ไฟล์เวอร์ชันเก่าเคยเขียนว่าเป็นร้านค้าออนไลน์ — ข้อมูลนั้นล้าสมัยแล้ว ยึดตามไฟล์นี้)
- **แก่นของโครงงานคือ Cloud Architecture + CI/CD** ธุรกิจท่าเรือเป็นเพียง use case ที่นำมาประกอบ
- Stack จริงตามโค้ด: **React 18 + TypeScript + Vite + Tailwind / Node.js 20 + Express 4 + mysql2 / MySQL 8 (InnoDB)** บน **EC2×2 + ALB + RDS Multi-AZ + S3 static website**
- **deploy ลง AWS Academy Learner Lab** (region `us-east-1`) — **ไม่มี CloudFront** เพราะแล็บไม่อนุญาต · ทั้งระบบเป็น HTTP
- CI/CD: **GitHub Actions → ECR → EC2** พร้อม rollback · IaC ด้วย **Terraform**
- **ตั้งใจไม่ใช้ Auto Scaling** (ขอบเขตโครงงาน) — instance คงที่ 2 เครื่อง เพื่อโฟกัส Load Balancing + Health Check
- **ยังไม่เคย `terraform apply` ขึ้น AWS จริง** — ห้ามเขียน/พูดว่า deploy แล้ว
- Stage 3 กำหนดส่ง **10 ต.ค. 2569 (เลยมาแล้ว)** · นำเสนอ **20–25 ต.ค. 2569**

---

## 1. ข้อมูลโครงงาน

| หัวข้อ | รายละเอียด |
|---|---|
| **ชื่อกลุ่ม** | Pier2Pier (J3K) |
| **ชื่อโครงงาน** | Cloud-Based Multi-Tier Web Application with CI/CD Pipeline for Port Warehouse Management |
| **ระบบที่ทำ** | เว็บแอปพลิเคชันรับจองระวางเที่ยวเรือและบริหารคลังสินค้าของท่าเรือ (Port WMS) บน AWS |
| **วิชา** | Cloud Computing · ภาคเรียน 1/2569 |
| **สถาบัน** | คณะเทคโนโลยีสารสนเทศ สจล. (KMITL) |
| **สมาชิก** | 6 คน · ระยะเวลา 3 เดือน |
| **คะแนน** | 30 คะแนน จาก 100 |
| **GitHub** | https://github.com/Jaturapat123/PIER2PIER (public) |

**สมาชิกกลุ่ม:**

| ชื่อ | รหัสนักศึกษา |
|---|---|
| นายจตุรภัทร กิติมาโภคิน | 67070017 |
| นายณัฐวุฒิ ทิพย์รัตน์ | 67070053 |
| นายประภัสร์พงษ์ ดาวประดับวงษ์ | 67070097 |
| นายวรวัส เทียมทัด | 67070156 |
| นายอาวิษกรณ์ ตั้งประดิษฐ์ชัย | 67070200 |
| นายณัฏฐ์พงศ์ พรหมแก้ว | 67070227 |

**อาจารย์ที่ปรึกษา (3 ท่าน):** ผศ. ดร. พัฒนพงษ์ ฉันทมิตรโอภาส · ผศ. ดร. ลภัส ประดิษฐ์ทัศนีย์ · ดร. ธนานพ ทองถาวร

---

## 2. ปัญหาที่ระบบแก้ไข (Pain Points)

โครงงานนี้ตั้งต้นจาก 3 ปัญหา — **ทุกการตัดสินใจทางเทคนิคต้องย้อนกลับมาตอบ 3 ข้อนี้ได้**

1. **Traffic Overload** — ผู้ใช้กระจุกตัวก่อนกำหนดปิดรับจองของแต่ละเที่ยวเรือ เซิร์ฟเวอร์เครื่องเดียวรับไม่ไหว
   → **แก้ด้วย:** ALB กระจายโหลดไป EC2 หลายเครื่อง + Health Check
2. **Manual Deployment** — deploy ด้วยมือทีละเครื่อง ช้า เสี่ยง human error เวอร์ชันแต่ละเครื่องไม่ตรงกัน
   → **แก้ด้วย:** CI/CD Pipeline + Docker image เดียวกันทุกเครื่อง
3. **Rollback ยาก** — เวอร์ชันใหม่มีบั๊กแล้วย้อนกลับไม่ทัน
   → **แก้ด้วย:** เก็บ image ทุกเวอร์ชันใน ECR + deploy tag เดิมกลับได้ทันที

---

## 3. สถาปัตยกรรม

### 3.1 สิ่งที่ Terraform สร้างจริงตอนนี้ (7 modules)

VPC · ALB · EC2 (Compute) · RDS · S3 static website · ECR · CloudWatch

> ✅ **14 ต.ค.** — รื้อ CloudFront ออกแล้ว โมดูลเปลี่ยนชื่อจาก `frontend_cdn` เป็น **`frontend_web`**
> ใช้ `aws_s3_bucket_website_configuration` + bucket policy แบบ public read · ผ่าน `terraform validate`

```
Users → S3 static website (หน้าเว็บ · HTTP)
Users → WAF → ALB (/api/* · HTTP :80)
                                        ↓
┌─ VPC ──────────────────────────────────────────────────────┐
│  Public Subnet   : ALB (Health Check) · NAT Gateway ×2     │
│  Private App     : EC2 A (us-east-1a) · EC2 B (us-east-1b) │
│                    Docker + Express · ElastiCache          │
│  Private DB      : RDS MySQL primary + standby (Multi-AZ)  │
└────────────────────────────────────────────────────────────┘
CI/CD: Dev → git push → GitHub Actions → build+test → ECR → deploy EC2 A & B
CloudWatch เก็บ Logs/Metrics จาก ALB + EC2 + RDS
```

### 3.2 ⚠️ ส่วนที่เป็น "การออกแบบ" แต่ Terraform ยังไม่ได้สร้าง

รูปสถาปัตยกรรมล่าสุด (`diagrams/06_AWS_Architecture.drawio` และรูปที่ 3.1 ในรายงาน) มีบริการเพิ่มอีก 5 อย่าง
ที่ **ยังไม่มีใน `infra/terraform`** — ถ้าจะเขียนหรือพูดถึง ต้องระบุว่าเป็นการออกแบบ ไม่ใช่ของที่สร้างแล้ว

| บริการ | สถานะ | หมายเหตุ |
|---|---|---|
| AWS WAF | ออกแบบไว้ · **ใช้ได้ในแล็บ** | ย้ายมาแปะกับ **ALB** แล้ว (ของเดิมแปะกับ CloudFront ที่ไม่มีแล้ว) |
| Amazon ElastiCache | ออกแบบไว้ · **ใช้ได้ในแล็บ** · ตกลงว่าจะสร้างจริง node เดียว | **cache ข้อมูลอ่านบ่อยเท่านั้น ห้ามเก็บ session / รหัสผ่าน** · ต้อง fail-open |
| VPC Interface Endpoints (ECR/SSM/Logs) | **ตัดทิ้งแล้ว** | ~$86/เดือน แพงกว่า NAT ทั้งสองตัว · เหลือแค่ S3 Gateway Endpoint ซึ่งฟรีและมีใน Terraform แล้ว |
| NAT Gateway ตัวที่ 2 | ✅ **มีในโค้ดแล้ว** (14 ต.ค.) | `aws_nat_gateway.this` ใช้ `count` ตามจำนวน AZ · private route table แยกเป็น AZ ละใบ |
| RDS Multi-AZ | **ตกลงว่าจะเปิด** (`db_multi_az = true`) | API ยืนยัน `MultiAZCapable = true` · standby **ไม่รับ query** EC2 ทั้งสองต่อ endpoint เดียวกัน |

> **ประเด็นค้าง:** ตารางที่ 3.4 (ค่าใช้จ่าย) ในรายงานยังไม่ได้รวม WAF / ElastiCache / VPC Endpoints
> ถ้าคงบริการเหล่านี้ไว้ในรูป ต้องเพิ่มเข้าตารางค่าใช้จ่ายให้ตรงกัน

### ⚠️ กฎเหล็กที่ห้ามละเมิด

1. **EC2 สองเครื่องต้องอยู่คนละ Availability Zone** — ไม่งั้น HA ไม่มีความหมาย
2. **Session/Booking ที่ยังไม่ยืนยันต้อง stateless** — JWT + แถว `bookings status='pending'` ใน RDS
   ห้ามเก็บใน memory ของ process → *นี่คือคำถามที่กรรมการถามบ่อยที่สุด*
3. **กันจองซ้อนต้องใช้ `SELECT ... FOR UPDATE` ใน transaction เสมอ**
4. **RDS และ EC2 อยู่ Private Subnet** · ALB อยู่ Public Subnet · RDS ห้ามเปิด public
5. **`GET /health` ต้อง query ฐานข้อมูลจริงก่อนคืน 200**
6. **ห้าม hardcode credentials** — ใช้ SSM Parameter Store และ GitHub Secrets เท่านั้น
7. **หน้าเว็บกับ API อยู่คนละ origin** — หน้าเว็บอยู่ที่ S3 website endpoint · API อยู่ที่ ALB
   frontend ต้อง build ด้วย `VITE_API_BASE_URL=http://<alb-dns>` และ backend ต้องตั้ง `CORS_ORIGINS` เป็น endpoint ของ S3
   (ไม่เกิด mixed content เพราะทั้งคู่เป็น HTTP — Learner Lab ออกใบรับรองไม่ได้)
8. **SPA routing ใช้ `ErrorDocument = index.html` ของ S3 website hosting** (CloudFront Function ใช้ไม่ได้แล้ว)
   ผลข้างเคียงที่ต้องเขียนในรายงาน: deep link จะได้ status 404 พร้อมเนื้อหา index.html หน้าเว็บทำงานได้ปกติ
9. **description ของ Security Group rule ใน Terraform ต้องเป็น ASCII** — AWS ปฏิเสธภาษาไทย

---

## 4. Tech Stack ตามโค้ดจริง

| ส่วน | เทคโนโลยี |
|---|---|
| Frontend | React 18 + TypeScript 5 · Vite 5 · Tailwind CSS 3 · React Router 6 · Recharts |
| Backend | Node.js 20 · Express 4 · mysql2 (connection pool) · Zod (validate) · jsonwebtoken · bcryptjs · Helmet · CORS · Morgan |
| Database | MySQL 8.0 (InnoDB) — 11 ตาราง |
| Test | Jest + Supertest · ESLint |
| Container | Docker / Docker Compose · Nginx (จำลอง ALB ตอน dev) |
| Infra | Terraform · Git / GitHub · GitHub Actions |

> **จำนวนเทสต์ = 31** นับจากไฟล์จริงใน `backend/tests/` (auth 8 · booking 9 · health 3 · admin 11)
> `README.md` และ `docs/AWS_Services_Report.md` เคยเขียน 30 — แก้แล้ว 14 ต.ค. · ยังควรรัน `npm test` ยืนยันอีกครั้งก่อนส่ง

### ทางเลือกที่พิจารณาแล้ว "ไม่เลือก" (ไว้ตอบกรรมการ)

| ไม่เลือก | เหตุผล |
|---|---|
| AWS Lambda | ซ่อนกลไกเซิร์ฟเวอร์ ไม่ได้เรียน Load Balancing |
| ECS / EKS | จัดการ container ให้อัตโนมัติ มองไม่เห็นกลไกที่ต้องการศึกษา |
| **Auto Scaling** | **ตั้งใจไม่ใช้ตามขอบเขต** — ถ้าใส่จะแยกไม่ออกว่าเสถียรเพราะ LB หรือ scaling |
| MySQL บน EC2 เอง | ต้องดูแล backup/patch/failover เอง |
| DynamoDB | ข้อมูลมีความสัมพันธ์ชัดเจน เหมาะกับ RDBMS |
| Network Load Balancer | ทำงาน Layer 4 ตรวจสุขภาพได้แค่ระดับพอร์ต |
| Docker Hub | มีข้อจำกัดจำนวนครั้งที่ดึง image ต่อชั่วโมง |
| Bastion Host + SSH | ต้องดูแลเครื่องเพิ่มและมีค่าใช้จ่าย — ใช้ SSM Session Manager แทน |

---

## 5. ฟีเจอร์ระบบ — 15 Use Cases

**Actors:** Guest · Customer (ตัวแทนขนส่ง) · Admin (ผู้ดูแลระบบท่าเรือ)

| # | Use Case | Actor |
|---|---|---|
| 1 | Register | Guest |
| 2 | Login | Registered User |
| 3 | View Services | Guest, Customer |
| 4 | Search Services | Guest, Customer |
| 5 | Create Booking | Customer |
| 6 | Confirm Booking | Customer |
| 7 | View Booking | Customer |
| 8 | Update Profile | Customer, Admin |
| 9 | Logout | Customer, Admin |
| 10 | Manage Users | Admin |
| 11 | Manage Services | Admin |
| 12 | Manage Container | Admin |
| 13 | Manage Booking | Admin |
| 14 | Manage Stock | Admin |
| 15 | View Reports | Admin |

> ทุก UC ที่แตะ DB ต้องมี exception: **validation error** และ **"เชื่อมต่อฐานข้อมูลไม่ได้"**
> Use-Case Specification ฉบับเต็ม 15 ตารางอยู่ในรายงานหัวข้อ 3.2.3

### Data Model — 11 ตาราง (ตามโค้ดจริง)

```
users              email/username (unique), password_hash, role, status
services           code (unique), service_type (import/export/transship)
vessels            imo_number (unique), name, operator, capacity_teu
vessel_schedules   voyage_no, etd, eta, cutoff_at, capacity_teu, booked_teu
container_types    code (unique), size_ft, teu_factor, max_payload_kg
bookings           booking_no (unique), cargo_type, total_teu, total_price, status
booking_items      qty, unit_price                    → รายละเอียดตู้ในแต่ละ booking
shipment_orders    order_no (unique), status (created/gate_in/loaded/departed/...)
stock_items        sku (unique), category, warehouse_zone, qty_on_hand
stock_transactions change_qty, type (in/out/adjust), reason, ref_booking
audit_logs         action, entity, entity_id, meta (JSON)
```

---

## 6. ค่าใช้จ่าย

ตัวกินเงินหลัก: **ALB (~$24/เดือน คิดตลอดเวลาที่เปิด ไม่มี Free Tier)** · **NAT Gateway** · **RDS Multi-AZ (คูณ 2)**

**วิธีประหยัดระหว่างพัฒนา:**

```bash
# ปิดเฉพาะส่วนที่แพง แต่เก็บ VPC และ RDS ไว้
terraform destroy -target=module.alb -target=module.compute
terraform apply   # เปิดกลับเมื่อจะทดลอง
```

ตั้ง AWS Budgets + Billing Alarm ที่ 50% / 80% / 100% ตั้งแต่วันแรก

> Stage 3 มีเกณฑ์ประมาณการค่าใช้จ่าย → **ต้องยืนยันด้วย [AWS Pricing Calculator](https://calculator.aws/) + แนบ screenshot (ยังไม่ได้ทำ)**

---

## 7. Timeline & เกณฑ์การให้คะแนน

| Stage | กำหนดส่ง | เกณฑ์ | คะแนน | สถานะ |
|---|---|---|---|---|
| **Stage 1** | 22 ก.ค. · 27–31 ก.ค. | ความเป็นไปได้ ประโยชน์ ความคิดสร้างสรรค์ คุณภาพเนื้อหา | 5 | ✅ |
| **Stage 2** | **10 ก.ย.** · นำเสนอ 22–26 ก.ย. | ทฤษฎี 2% · ความคิดสร้างสรรค์ 2% · อธิบายเชิงเทคนิค 3% · วิเคราะห์/ออกแบบตามหลัก Cloud+SE 5% | 10 | ✅ ส่งแล้ว |
| **Stage 3** | **10 ต.ค.** · นำเสนอ 20–25 ต.ค. | ออกแบบตามหลัก Cloud 5 · **ทดลอง+ผลการทดลอง+ประมาณการค่าใช้จ่าย 10** · ความสมบูรณ์ 2 · สื่อสาร 1 · อ้างอิง 1 · ถามตอบ 1 | 15 | ⏳ |

**สิ่งที่ Stage 3 ต้องมีหลักฐาน (10 คะแนน — สำคัญที่สุด):**

- ✅ ทดสอบ Load Balancing — **มีผลจาก docker-compose แล้ว 50.0%/50.0% ล้มเหลว 0** (ยังต้องทำซ้ำบน AWS จริง)
- ✅ ทดสอบ Failover — **ปิด api-a ระหว่างยิง ความพร้อมใช้งาน 100.00%** (ผลอยู่ใน `jekcloud/results/`)
- ⏳ ทดสอบ CI/CD บน AWS จริง — deploy จริง + **rollback จริง**
- ⏳ ตาราง cost estimate + screenshot จาก Pricing Calculator
- ✅ ข้อจำกัดของระบบ — เขียนไว้แล้วในรายงานหัวข้อ 1.3.5
- 📸 **เก็บ screenshot/log ทุกการทดลอง**

---

## 8. รายงานฉบับรูปเล่ม (บท 1–3)

**ไฟล์ปัจจุบัน:** `รายงาน Cloud final.docx` (10 ก.ย. 2569 — ใหม่สุดในโฟลเดอร์ `cloud/`)
(ต่อยอดจาก `รายงาน Cloud - เล่มรวม บท 1-3.docx` ← `รายงาน Cloud (อัปเดต).docx` ← `รายงาน Cloud.docx`)

- ฟอนต์ **TH SarabunPSK** เนื้อหา 16pt · คำบรรยายรูป/ตาราง 14pt ชิดซ้าย
- ใช้ `G21_รูปเล่มรายงาน.pdf` เป็นตัวอย่างรูปแบบรูปเล่ม (เอาเฉพาะโครงหัวข้อกับสำนวน ไม่แตะฟอนต์)
- **เปิดใน Word แล้วกด Ctrl+A → F9 ทุกครั้งหลังแก้** เพื่อรีเฟรชสารบัญ 3 ชุด

**โครงหัวข้อปัจจุบัน**

```
บทคัดย่อ · คำนำ · กิตติกรรมประกาศ · สารบัญ/สารบัญรูป/สารบัญตาราง
บทที่ 1 บทนำ
  1.1 ความเป็นมาของปัญหา · 1.2 วัตถุประสงค์
  1.3 ขอบเขตของระบบ  → 1.3.1 ฟังก์ชัน · 1.3.2 สถาปัตยกรรม · 1.3.3 กระบวนการพัฒนา
                        1.3.4 ความปลอดภัย · 1.3.5 ข้อจำกัดของระบบ
  1.4 ประโยชน์ที่คาดว่าจะได้รับ (1.4.1 ต่อท่าเรือ · 1.4.2 ต่อผู้จัดทำ) · 1.5 โครงสร้างของรายงาน
บทที่ 2 ทฤษฎีและเทคโนโลยีที่เกี่ยวข้อง
  2.1 ทฤษฎีที่เกี่ยวข้อง (2.1.1 WMS → 2.1.8 Cloud & Monitoring · 2.1.7 = Auth/RBAC)
  2.2 สถาปัตยกรรมคลาวด์ที่ใช้ในระบบ (2.2.5 = บริการสนับสนุน ECR/SSM/SNS/IAM)
  2.3 สถาปัตยกรรมเครือข่าย · 2.4 สถาปัตยกรรมฐานข้อมูล
  2.5 เทคโนโลยีที่ใช้ในการพัฒนา (บรรยายทีละตัว + โลโก้ + ตารางสรุป)
  2.6 การเลือกใช้บริการ Cloud และเหตุผลในการเลือก
บทที่ 3 ขั้นตอนการดำเนินงานของโครงงาน
  3.1 วิเคราะห์ความต้องการ (FR/NFR)
  3.2 การวิเคราะห์และออกแบบระบบ (3.2.1 ออกแบบสถาปัตยกรรมบนคลาวด์ · 3.2.2 Use-Case Diagram · 3.2.3 Use-Case Spec)
  3.3 หลักการทำงานของระบบ (ERD · traceability · sequence · multi-tier · CI/CD)
  3.4 ผลการออกแบบส่วนติดต่อผู้ใช้งานและลำดับการใช้งาน
  3.5 การประมาณการค่าใช้จ่ายของระบบบนคลาวด์
```

**เลขรูป/ตารางปัจจุบัน:** รูปที่ 2.1–2.25 · รูปที่ 3.1–3.30 · ตารางที่ 2.1–2.3 · ตารางที่ 3.1–3.5 (ไล่ครบไม่มีกระโดด)

### ไดอะแกรมในโฟลเดอร์ `diagrams/`

| ไฟล์ | ใช้เป็นรูปที่ | สถานะ |
|---|---|---|
| `01_ER_Diagram.drawio` | 3.3 | ⏳ ยังไม่ได้ export PNG แทรกเข้าเล่ม |
| `02_Sequence_Login.drawio` | 3.4 | ⏳ |
| `03_Sequence_Booking.drawio` | 3.5 | ⏳ |
| `04_CICD_Pipeline.drawio` | 3.6 | ⏳ |
| `05_Network_Topology.drawio` | — | สำรอง |
| `06_AWS_Architecture.drawio` | 3.1 | ✅ แทรกแล้ว |
| `07_WMS_Port_Concept` … `13_RBAC` (7 ไฟล์) | บทที่ 2 หัวข้อ 2.1.x | ⏳ ยังไม่ได้ export PNG แทรกเข้าเล่ม |

> **ผู้ใช้ชอบให้ส่งไดอะแกรมเป็น `.drawio` แล้ว export PNG เอง** — อย่าส่งเป็น PNG เว้นแต่จะสั่ง

---

## 9. ⚠️ ประเด็นค้างที่ต้องแก้

1. **export PNG จาก .drawio 11 ไฟล์แล้วแทรกเข้ารายงาน** (4 รูปบท 3 + 7 รูปบท 2) — ตอนนี้รูปที่ 3.3–3.6 มีคำบรรยายแต่ไม่มีภาพ
2. **ตารางที่ 3.4/3.5 (ค่าใช้จ่าย) ยังไม่รวม WAF / ElastiCache / VPC Endpoints** ที่ปรากฏในรูปที่ 3.1
3. **Terraform ยังไม่มี module สำหรับ WAF / ElastiCache** — รูปกับ IaC ยังไม่ตรงกันสองบริการนี้ (NAT 2 ตัวแก้แล้ว 14 ต.ค.)
4. **จำนวนเทสต์ 30 vs 31** — นับจากไฟล์เทสต์จริงได้ **31** (auth 8 · booking 9 · health 3 · admin 11) README กับรายงานเขียน 30 ต้องแก้
5. **ยังไม่เคย `terraform apply` ขึ้น AWS จริง** — workflow แก้เป็น access key + session token แล้ว (14 ต.ค.)
   แต่**ยังไม่ได้ตั้ง GitHub Secrets และยังไม่ได้รัน workflow จริงเลย** · ต้องหยิบค่าใหม่จากหน้า AWS Details **ทุกครั้งที่เริ่ม session ใหม่** เพราะ credential หมดอายุเมื่อปิดแล็บ (ดู `instruction.md` §6.4)
6. **ยังไม่มี screenshot จาก AWS Pricing Calculator** (Stage 3 ต้องใช้)
7. **commit มี trailer `Co-Authored-By: Claude`** ทำให้ Claude ขึ้นเป็น contributor — ผู้ใช้ยังไม่ตัดสินว่าจะลบไหม
8. บทที่ 4 และ 5 ยังไม่มีตัวตน — 1.5 ประกาศไว้แล้วว่าจะมี · เมื่อทำเล่มสมบูรณ์ควรย้าย 3.4 → บทที่ 4 และ 3.5 → บทที่ 5 ตามแบบแผน

---

## 10. 🚀 งานลำดับถัดไป

**แผนงานฉบับเต็มพร้อมเกณฑ์ว่า "เสร็จ" แปลว่าอะไร อยู่ใน [`instruction.md`](instruction.md) §9** สรุปลำดับ

```
1. ✅ Terraform: NAT 2 ตัว + route table แยกต่อ AZ · LabInstanceProfile · region us-east-1 · db_multi_az = true
2. ✅ Terraform: รื้อ frontend_cdn → frontend_web (S3 website hosting) · แก้ cors_origins และ outputs
3. ✅ GitHub Actions: เลิกใช้ OIDC → access key + session token · ใส่ VITE_API_BASE_URL · ลบ step ล้าง cache CloudFront
4. terraform apply จริงในแล็บ → เก็บ output + screenshot → destroy ทันทีที่พอ
5. เก็บผลการทดลอง 4 ชุด: load balancing · EC2 failover · RDS failover · CI/CD + rollback
6. ElastiCache ในโค้ดแอป (ทำท้ายสุด ตัดทิ้งได้ถ้าเวลาไม่พอ)
```

งานเอกสารที่ยังค้าง: export PNG ไดอะแกรม · อัปเดตตารางค่าใช้จ่าย · เขียนบทที่ 4–5

### ข้อควรระวังตอนเขียนโค้ด

| ประเด็น | ต้องทำ |
|---|---|
| **Stateless** | Session/booking ที่ยังไม่ยืนยันเก็บใน DB หรือ JWT **ห้ามเก็บใน memory** |
| **Health endpoint** | `GET /health` ต้อง query DB จริงก่อนคืน 200 |
| **Credentials** | env var / GitHub Secrets / SSM **ห้าม hardcode** |
| **DB connection** | connection pool · handle reconnect |
| **Docker image tag** | tag ด้วย git SHA เพื่อให้ rollback ได้ |
| **Node version** | `node-version: '20'` ที่ใช้รันเทสต์ต้องตรงกับ `node:20-alpine` ใน Dockerfile — **อย่าอัป** |
| **Graceful shutdown** | รับ SIGTERM แล้วปิด connection ให้เรียบร้อย |

### รันบนเครื่องตัวเอง

```bash
cd jekcloud
docker compose up -d --build     # db + api-a + api-b + nginx lb (พอร์ต 8080)
cd frontend && npm run dev        # หน้าเว็บ http://localhost:5173
bash scripts/smoke.sh             # ตรวจ 12 รายการ
bash scripts/loadtest.sh          # ดูการกระจายโหลด
bash scripts/failover-test.sh     # ปิด api-a ระหว่างยิง วัดความพร้อมใช้งาน
```

บัญชีทดสอบ: `admin@pier2pier.test` · `customer@pier2pier.test` · `agent@pier2pier.test` · รหัสผ่าน `Pier2Pier!2569`
**พอร์ต DB map เป็น `3307:3306`** เพราะเครื่องนี้มี MySQL บน 3306 อยู่แล้ว

---

## 11. คำถามที่กรรมการถามบ่อย (เตรียมไว้)

| คำถาม | คำตอบสั้น |
|---|---|
| ทำไมไม่ใช้ Auto Scaling? | ตั้งใจกำหนดขอบเขตให้ instance คงที่ เพื่อศึกษา Load Balancing + Health Check ให้ลึก |
| ทำไมไม่ใช้ ECS/EKS ในเมื่อใช้ Docker? | ECS/EKS ซ่อน orchestration ทำให้เรียนรู้กลไกน้อยลง · EC2+ALB เห็นทุกขั้นตอน |
| EC2 2 เครื่องอยู่ AZ เดียวกันได้ไหม? | ไม่ควร — ต้องคนละ AZ ไม่งั้น AZ ล่ม = ระบบดับหมด |
| ถ้า EC2 ล่มทั้ง 2 เครื่อง? | ระบบ down — เป็นข้อจำกัดที่ยอมรับในขอบเขตนี้ (เขียนไว้ในรายงาน 1.3.5) |
| **Session เก็บที่ไหน?** | **JWT + DB ไม่เก็บใน memory** — ถามบ่อยที่สุด |
| ใส่ ElastiCache แล้วเก็บ session ไหม? | ไม่ — ใช้ cache ข้อมูลอ่านบ่อยเท่านั้น session ยังเป็น JWT ไร้สถานะ |
| Rollback ทำงานยังไง? | เก็บ image ทุกเวอร์ชันใน ECR พร้อม tag → deploy tag เดิมกลับ |
| กันจองซ้อนยังไง? | `SELECT ... FOR UPDATE` ใน transaction + เช็ค `booked_teu` ไม่เกิน `capacity_teu` |
| Deploy ขึ้น AWS จริงแล้วหรือยัง? | **ยัง** — Terraform ผ่านแค่ `fmt`/`validate` · ผลทดลองที่มีมาจาก docker-compose |

---

## 12. แหล่งอ้างอิงหลัก

1. AWS. *Elastic Load Balancing features*. https://aws.amazon.com/elasticloadbalancing/features/
2. AWS. *Health checks for ALB target groups*. https://docs.aws.amazon.com/elasticloadbalancing/latest/application/target-group-health-checks.html
3. AWS. *Amazon RDS Features*. https://aws.amazon.com/rds/features/
4. AWS. *Amazon RDS for MySQL pricing*. https://aws.amazon.com/rds/mysql/pricing/
5. AWS. *EC2 On-Demand Pricing*. https://aws.amazon.com/ec2/pricing/on-demand/
6. AWS. *Common use cases in Amazon ECR*. https://docs.aws.amazon.com/AmazonECR/latest/userguide/ecr-use-cases.html
7. GitHub. *Pricing changes for GitHub Actions (2026)*. https://github.com/resources/insights/2026-pricing-changes-for-github-actions
8. CloudZero. *Amazon ECR Unpacked*. https://www.cloudzero.com/blog/amazon-ecr/
9. CloudZero. *AWS ALB Pricing 2026*. https://www.cloudzero.com/blog/aws-alb-pricing/
10. Rapydo. *AWS RDS vs. Self-Managed Databases*. https://www.rapydo.io/blog/aws-rds-vs-self-managed-databases-a-comprehensive-comparison

> อาจารย์กำหนดว่าต้องมีทั้ง **In-text reference** และ **Reference list** ตามคู่มือการเขียนโครงงาน (มี 1 คะแนน)

---

## 13. เอกสารอื่นในโปรเจกต์

| ไฟล์ | เนื้อหา |
|---|---|
| `jekcloud/instruction.md` | **อ่านก่อนเสมอ** — ข้อจำกัด Learner Lab ที่ยืนยันจากบัญชีจริง · การตัดสินใจทั้งหมด · แผนงาน |
| `jekcloud/docs/diagrams/06_AWS_Architecture.drawio` | ผังสถาปัตยกรรมตัวจริง (ย้ายมาจาก `cloud/diagrams/` เมื่อ 14 ต.ค.) |
| `jekcloud/README.md` | วิธีรัน · โครงสร้างโปรเจกต์ · วิธี deploy |
| `jekcloud/HANDOFF.md` | สถานะล่าสุดของโค้ด · สิ่งที่ยังไม่ได้พิสูจน์ · กฎเหล็กของโค้ด |
| `jekcloud/docs/AWS_Services_Report.md` | รายงาน .md — บริการ AWS ทุกตัวพร้อมเหตุผล ฟีเจอร์ ผลการทดลอง ค่าใช้จ่าย |
| `jekcloud/docs/specs/` | เอกสารออกแบบระบบ + แผนการพัฒนา 14 งานย่อย |
| `jekcloud/results/` | ผลทดลอง load balancing และ failover (รัน 3 รอบ ผลตรงกัน) |
| `02_Tech_Stack_Guide.md` · `03_AWS_Architecture_Review.md` | เอกสารประกอบจาก session ก่อน |
