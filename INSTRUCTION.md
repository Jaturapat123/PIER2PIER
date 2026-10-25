# INSTRUCTION — Pier2Pier Port WMS

> อัปเดต **25 ต.ค. 2569** · ไฟล์นี้คือแหล่งข้อมูลเดียวของโครงการ
> วิธีรันบนเครื่องและโครงสร้างโปรเจกต์อยู่ใน [`README.md`](README.md) · รายงานเชิงเนื้อหาอยู่ใน [`docs/AWS_Services_Report.md`](docs/AWS_Services_Report.md)

---

## 📌 TL;DR — อ่าน 30 วินาที

- **Pier2Pier (กลุ่ม J3K) = Port Warehouse Management System** — รับจองระวางเที่ยวเรือ + บริหารคลัง/ลานตู้ของท่าเรือ **ไม่ใช่ E-Commerce**
- **แก่นของโครงการคือ Cloud Architecture + CI/CD** ธุรกิจท่าเรือเป็นเพียง use case ที่นำมาประกอบ
- Stack: **React 18 + TS + Vite + Tailwind / Node.js 20 + Express 4 + mysql2 / MySQL 8 (InnoDB)** บน **EC2×2 + ALB + RDS Multi-AZ + S3 static website**
- Deploy บน **AWS Academy Learner Lab** region `us-east-1` — **ไม่มี CloudFront** เพราะแล็บไม่อนุญาต · **ทั้งระบบเป็น HTTP**
- CI/CD: **GitHub Actions → ECR → EC2 (ผ่าน SSM Run Command)** พร้อม rollback · IaC ด้วย **Terraform**
- **ตั้งใจไม่ใช้ Auto Scaling** (ขอบเขตโครงการ) — instance คงที่ 2 เครื่อง เพื่อโฟกัส Load Balancing + Health Check
- **`terraform apply` ขึ้น AWS จริงแล้ว** 14 ต.ค. · **เก็บผลทดลองบน AWS จริงครบ 4 ชุดแล้ว** 20 ต.ค. · destroy ครบทั้งสองรอบ
- **ElastiCache และ WAF ตัดออกจากโครงการแล้ว** (25 ต.ค.) — ไม่มีในโค้ด ไม่มีใน Terraform จึงเอาออกจากผังและเอกสารทั้งหมด

---

## 1. ข้อมูลโครงการ

| หัวข้อ | รายละเอียด |
|---|---|
| **ชื่อกลุ่ม** | Pier2Pier (J3K) |
| **ชื่อโครงการ** | Cloud-Based Multi-Tier Web Application with CI/CD Pipeline for Port Warehouse Management |
| **ระบบที่ทำ** | เว็บแอปรับจองระวางเที่ยวเรือและบริหารคลังสินค้าของท่าเรือ (Port WMS) บน AWS |
| **วิชา** | Cloud Computing · ภาคเรียน 1/2569 |
| **สถาบัน** | คณะเทคโนโลยีสารสนเทศ สจล. (KMITL) |
| **สมาชิก** | 6 คน · ระยะเวลา 3 เดือน |
| **GitHub** | https://github.com/Jaturapat123/PIER2PIER (public) |

**สมาชิกกลุ่ม**

| ชื่อ | รหัสนักศึกษา |
|---|---|
| นายจตุรภัทร กิติมาโภคิน | 67070017 |
| นายณัฐวุฒิ ทิพย์รัตน์ | 67070053 |
| นายประภัสร์พงษ์ ดาวประดับวงษ์ | 67070097 |
| นายวรวัส เทียมทัด | 67070156 |
| นายอาวิษกรณ์ ตั้งประดิษฐ์ชัย | 67070200 |
| นายณัฏฐ์พงศ์ พรหมแก้ว | 67070227 |

---

## 2. ปัญหาที่ระบบแก้ (Pain Points)

**ทุกการตัดสินใจทางเทคนิคต้องย้อนกลับมาตอบ 3 ข้อนี้ได้**

1. **Traffic Overload** — ผู้ใช้กระจุกตัวก่อนกำหนดปิดรับจองของแต่ละเที่ยวเรือ เซิร์ฟเวอร์เครื่องเดียวรับไม่ไหว
   → **แก้ด้วย** ALB กระจายโหลดไป EC2 หลายเครื่อง + Health Check
2. **Manual Deployment** — deploy ด้วยมือทีละเครื่อง ช้า เสี่ยง human error เวอร์ชันแต่ละเครื่องไม่ตรงกัน
   → **แก้ด้วย** CI/CD Pipeline + Docker image เดียวกันทุกเครื่อง
3. **Rollback ยาก** — เวอร์ชันใหม่มีบั๊กแล้วย้อนกลับไม่ทัน
   → **แก้ด้วย** เก็บ image ทุกเวอร์ชันใน ECR + deploy tag เดิมกลับได้ทันที

---

## 3. สถาปัตยกรรมปัจจุบัน

ไฟล์ผัง: `docs/diagrams/06_AWS_Architecture.drawio`

```
ผู้ใช้ ──→ S3 static website                       (หน้าเว็บ · HTTP)
ผู้ใช้ ──→ ALB ──┬─→ EC2 #1 (us-east-1a)           (/api/* · HTTP :80)
                  └─→ EC2 #2 (us-east-1b)
                           │
                ทั้งคู่ต่อ RDS endpoint เดียวกัน
                           ↓
           RDS MySQL primary (us-east-1a, private db subnet)
                ⇠ ⇠ synchronous replication ⇢ ⇢
           RDS standby (us-east-1b) — ไม่รับ query

EC2 #1 → NAT A (us-east-1a) → IGW        EC2 → S3 Gateway Endpoint (ฟรี)
EC2 #2 → NAT B (us-east-1b) → IGW        EC2 → SSM Parameter Store
EC2 → CloudWatch → SNS → อีเมลผู้ดูแล

Developer → GitHub → GitHub Actions ──┬─→ ECR ──→ EC2 (docker pull)
                                       ├─→ S3 (s3 sync หน้าเว็บ)
                                       └─→ SSM Run Command (สั่ง deploy บนเครื่อง)
LabRole + LabInstanceProfile → EC2
```

**Terraform สร้างจริง 7 modules:** `network` (VPC) · `alb` · `compute` (EC2) · `database` (RDS) · `frontend_web` (S3 static website) · `ecr` · `monitoring` (CloudWatch + SNS)

> **ตัดออกจากโครงการแล้ว** — ไม่มีในโค้ด ไม่มีใน Terraform ไม่มีในผัง ไม่มีในเอกสาร
> **CloudFront** (แล็บบล็อก) · **ElastiCache** · **AWS WAF** · **VPC Interface Endpoints** (แพงกว่า NAT)

### 3.1 ⚠️ กฎเหล็ก — ห้ามละเมิด

1. **EC2 สองเครื่องต้องอยู่คนละ Availability Zone** — ไม่งั้น HA ไม่มีความหมาย
2. **Session และ booking ที่ยังไม่ยืนยันต้อง stateless** — JWT + แถว `bookings status='pending'` ใน RDS
   ห้ามเก็บใน memory ของ process
3. **กันจองซ้อนต้องใช้ `SELECT ... FOR UPDATE` ใน transaction เสมอ** + เช็ค `booked_teu` ไม่เกิน `capacity_teu`
   > **หมายเหตุเรื่อง migration race:** `db/migrate.js` ใช้ `GET_LOCK` ของ MySQL กันสองกระบวนการรัน migration พร้อมกัน
   > อันนี้เป็นการป้องกันเชิงโครงสร้างที่มาจากการอ่านโค้ด **ยังทำให้ล้มเหลวจริงซ้ำไม่ได้** จึงห้ามเขียนว่าเป็นบั๊กที่ทำซ้ำได้
4. **RDS และ EC2 อยู่ private subnet** · ALB อยู่ public subnet · RDS ห้ามเปิด public
5. **`GET /health` ต้อง query ฐานข้อมูลจริงก่อนคืน 200** (`backend/src/db/pool.js`)
6. **ห้าม hardcode credentials** — ใช้ SSM Parameter Store และ GitHub Secrets เท่านั้น
7. **หน้าเว็บกับ API อยู่คนละ origin** — หน้าเว็บที่ S3 website endpoint · API ที่ ALB
   frontend build ด้วย `VITE_API_BASE_URL=http://<alb-dns>` · backend ตั้ง `CORS_ORIGINS` เป็น endpoint ของ S3
   (ไม่เกิด mixed content เพราะทั้งคู่เป็น HTTP — Learner Lab ออกใบรับรองไม่ได้)
8. **SPA routing ใช้ `ErrorDocument = index.html` ของ S3 website hosting**
   ผลข้างเคียง: deep link ได้ status **404** พร้อมเนื้อหา `index.html` หน้าเว็บทำงานได้ปกติ
9. **description ของ Security Group rule ใน Terraform ต้องเป็น ASCII** — AWS ปฏิเสธภาษาไทย
10. **`node-version: '20'` ที่ใช้รันเทสต์ห้ามอัป** — ต้องตรงกับ `node:20-alpine` ใน `backend/Dockerfile`

---

## 4. ข้อเท็จจริงของ Learner Lab (ยืนยันจากบัญชีจริง 14 ต.ค.)

ทุกข้อในหัวข้อนี้ตรวจจาก console และ AWS CLI ของบัญชีแล็บจริง

### 4.1 CloudFront — ใช้ไม่ได้ ยืนยันแล้ว

```
Failed to load distributions: User: arn:aws:sts::<account>:assumed-role/voclabs/user...@kmitl.ac.th
is not authorized to perform cloudfront:ListDistributions
because no identity-based policy allows the cloudfront:ListDistributions action
```

และรายการบริการใน readme ของแล็บ **ไม่มี CloudFront** (มีแต่ CloudShell, CloudTrail, CloudWatch)

### 4.2 RDS รองรับ Multi-AZ

```
aws rds describe-orderable-db-instance-options --engine mysql \
  --db-instance-class db.t3.micro --region us-east-1 \
  --query "OrderableDBInstanceOptions[0].[EngineVersion,MultiAZCapable,ReadReplicaCapable]"

→ [ "5.7.44-rds.20250213", true, true ]
```

MySQL 8.0 ล่าสุดที่ใช้กับ `db.t3.micro` ได้: **8.0.46-rds.20260908** → `engine_version = "8.0"` ใน Terraform ใช้ได้
(readme ฉบับเก่าปี 2021 เคยห้าม Multi-AZ แต่ฉบับปัจจุบันไม่มีบรรทัดนั้นแล้ว)

### 4.3 S3 — static website hosting ได้

Block Public Access ระดับบัญชี **ปิดอยู่ทั้ง 4 ข้อ** จึงตั้ง bucket policy ให้อ่านสาธารณะได้

### 4.4 IAM — สร้าง role เองไม่ได้ ยืนยันแล้ว

```
aws iam list-open-id-connect-providers      → { "OpenIDConnectProviderList": [] }
aws iam get-instance-profile --instance-profile-name LabInstanceProfile
                                            → { "roles": ["LabRole"] }
aws iam list-attached-role-policies --role-name LabRole
→ VocLabPolicy1 / VocLabPolicy2 / VocLabPolicy3
   AmazonSSMManagedInstanceCore · AmazonEC2ContainerRegistryReadOnly
   AmazonEKSClusterPolicy · AmazonEKSWorkerNodePolicy
```

**สองตัวที่โครงการต้องใช้มีครบ** — `AmazonSSMManagedInstanceCore` (Session Manager + ดึง SSM parameter) และ `AmazonEC2ContainerRegistryReadOnly` (`docker pull` จาก ECR)

### 4.5 ข้อจำกัดที่ต้องจำ

| เรื่อง | รายละเอียด |
|---|---|
| Region | **us-east-1 / us-west-2 เท่านั้น** region อื่นขึ้น access error |
| EC2 | type nano–large · พร้อมกันไม่เกิน **9 เครื่อง** และไม่เกิน **32 vCPU** · **ถ้าถึง 20 เครื่อง บัญชีถูกปิดและลบของทั้งหมดทันที** |
| EC2 หลังจบ session | ถูก stop แล้ว **start ให้เองรอบหน้า** · public IP เปลี่ยนทุกครั้งถ้าไม่ผูก Elastic IP |
| RDS | type nano–medium (burstable) · gp2 ไม่เกิน 100 GB · **ต้องปิด enhanced monitoring** · **จบ session แล้วแล็บไม่หยุด RDS ให้** มันเดินกินงบต่อ |
| IAM | สร้าง user / group / role ไม่ได้ (ยกเว้น service-linked) · ใช้ `LabRole` + `LabInstanceProfile` |
| S3 | SCP ปฏิเสธ `s3:GetBucketObjectLockConfiguration` → ต้องสร้าง bucket ด้วย AWS CLI เองและตั้ง `manage_frontend_bucket = false` |
| งบ | บัญชีที่ใช้ทดสอบแสดงวงเงิน **$50** (readme เขียน $100) · **ตรวจตัวเลขบนหน้าแล็บของบัญชีตนเองก่อน apply** |
| ตัวกินงบ | readme ระบุเอง: EC2, RDS, **NAT Gateway**, SageMaker, EMR/ECS/EKS, Elastic Beanstalk |
| Reset lab | ลบทุกอย่างถาวร แต่ **ไม่ล้างงบ** |

> ⚠️ **บัญชี Learner Lab เป็นของใครของมัน** — ตัวเลขงบและสถานะ resource ข้างบนเป็นของบัญชีที่ใช้ทดสอบ
> ถ้าใช้แล็บของตัวเอง ต้องรันคำสั่งในหัวข้อนี้ตรวจซ้ำเองทุกข้อ

---

## 5. การตัดสินใจที่ล็อกแล้ว

### 5.1 RDS → Multi-AZ · EC2 ทั้งสองต่อ endpoint เดียว

ข้อกำหนด "ให้ EC2 ต่อ RDS ใน AZ ตัวเอง" **ทำตามตัวอักษรไม่ได้** เพราะ standby ของ RDS Multi-AZ แบบปกติ **เชื่อมต่อไม่ได้เลย ทั้งอ่านและเขียน** มันเป็นสำเนาระดับ storage ที่รอสลับเท่านั้น

| ทางเลือก | ผล | ตัดสิน |
|---|---|---|
| Multi-AZ + ต่อ endpoint เดียว | ได้ HA + ได้ผลทดลอง DB failover เพิ่ม | **เลือก** |
| Single-AZ + read replica ที่ AZ-b | ตรงตัวอักษรที่สุด แต่ต้องแก้ `db/pool.js` และทุกจุดที่อ่าน DB | ไม่เลือก — เวลาไม่พอ เก็บเป็นข้อเสนอในบทสรุป |
| Single-AZ เฉย ๆ | ถูกสุด แต่ไม่ตอบอะไรเลย | ไม่เลือก |

**หลักการ "อยู่ AZ ตัวเอง" เอาไปใช้กับ NAT Gateway แทน** ซึ่งเป็นจุดที่มันใช้ได้จริง

### 5.2 ทางเข้าเว็บ → S3 static website hosting

- Index document `index.html` · **Error document `index.html`** ← แทน CloudFront Function ที่ทำ SPA routing
- endpoint: `http://<bucket>.s3-website-us-east-1.amazonaws.com`
- **S3 website endpoint ไม่รองรับ HTTPS** เอกสาร AWS แนะนำให้ใช้ CloudFront ถ้าต้องการ ซึ่งเราใช้ไม่ได้ → **ทั้งระบบเป็น HTTP**
- ErrorDocument คืน **HTTP 404** พร้อมเนื้อหา `index.html` — ยืนยันกับ bucket จริงแล้ว

ที่ไม่เลือก: ให้ Express เสิร์ฟ static เอง — ต้องแก้ backend + Dockerfile + ยุบ job `deploy-frontend` และ S3 จะหลุดจากสถาปัตยกรรม

**bucket policy ให้ `s3:ListBucket` แบบ public ด้วย** ไม่ใช่แค่ `s3:GetObject` เพื่อให้ได้ status 404 ไม่ใช่ 403
ข้อแลกเปลี่ยน: ใคร ๆ ก็เรียกดูรายชื่อไฟล์ใน bucket ได้ — **ห้ามเอาไฟล์ที่ไม่ควรเปิดเผยไปวางใน bucket นี้**
เพิ่ม `aws_s3_bucket_ownership_controls = BucketOwnerEnforced` ปิด ACL ทั้งหมด ให้สิทธิ์มาจาก bucket policy ที่เดียว

> หมายเหตุความถูกต้อง: `ListBucket` มีผลต่อ **เลข status เท่านั้น** ไม่ใช่ตัวตัดสินว่าได้ `index.html` หรือไม่
> เอกสาร AWS ระบุว่า custom error document ถูกส่งกลับสำหรับ **4XX ทั้งคลาส ซึ่งรวม 403**
> https://docs.aws.amazon.com/AmazonS3/latest/userguide/CustomErrorDocSupport.html

### 5.3 หน้าเว็บรู้ที่อยู่ API ยังไง → ฝังตอน build

`deploy.yml` ส่ง `VITE_API_BASE_URL=http://<alb-dns>` ตอน `npm run build` ไม่ต้องแตะโค้ดแอป
**เปลี่ยนที่อยู่ API ทีหลังโดยไม่ build ใหม่ไม่ได้** (พิสูจน์แล้ว — ค้นใน `dist/assets/index-*.js` พบค่าฝังอยู่)
ผลพ่วง: ต้องตั้ง `CORS_ORIGINS` เป็น endpoint ของ S3 เพราะคนละ hostname แล้ว

`deploy.yml` อ่าน ALB DNS จาก `aws elbv2 describe-load-balancers` สด ๆ ตอน deploy ไม่ได้อ่านจาก Terraform output เพราะ CI ไม่มี state — และวิธีนี้ทนต่อการ destroy/apply ใหม่ซึ่งทำบ่อยในแล็บ (DNS ของ ALB เปลี่ยนทุกครั้ง)

### 5.4 NAT Gateway → 2 ตัว ตัวละ AZ

เอกสาร AWS ระบุให้สร้าง NAT ในทุก AZ แล้ว route ให้ทรัพยากรใช้ NAT ใน AZ ตัวเอง ถ้าใช้ตัวเดียวข้าม AZ เมื่อ AZ นั้นล่ม เครื่องในอีก AZ จะออกอินเทอร์เน็ตไม่ได้

### 5.5 ElastiCache และ WAF → **ตัดทิ้ง** (25 ต.ค.)

เงื่อนไขที่เคยตั้งไว้สำหรับ ElastiCache คือต้องมี cache-aside จริงที่ `GET /services`, `GET /schedules`, `report.service.js` + invalidate เมื่อ admin แก้ข้อมูล + **fail-open** + **ห้ามเก็บ JWT/รหัสผ่าน/session**

**ไม่ได้ทำและตัดสินใจตัดทิ้ง** — โค้ดไม่มี `redis`/`elasticache` เลย และ Terraform ไม่มี module ของทั้ง ElastiCache และ WAF
จึง **เอาออกจากผัง ตารางค่าใช้จ่าย และเอกสารทุกไฟล์** ไม่ปล่อยให้มีกล่องที่ตอบไม่ได้ว่าเก็บอะไร
ทั้งสองยังอยู่ในหัวข้อ "ทางเลือกที่พิจารณาแล้วไม่เลือก" และ "ข้อจำกัดของระบบ" ของรายงาน พร้อมเหตุผล

### 5.6 VPC Interface Endpoints → ตัดทิ้ง

6 endpoint × 2 AZ × ~$0.01/ชม. ≈ **$86/เดือน แพงกว่า NAT ทั้งสองตัวรวมกัน** และซ้ำซ้อนเมื่อมี NAT ครบทุก AZ
เก็บไว้แค่ **S3 Gateway Endpoint ซึ่งไม่คิดเงิน** และตัด traffic ก้อนใหญ่สุด (image layer ของ ECR ที่เก็บบน S3) ออกจากค่า data processing ของ NAT

### 5.7 วิธีใช้งบ

**ไม่เปิดทิ้งไว้** เปิดเฉพาะตอนทำงานและตอนเก็บผลการทดลอง แล้ว `terraform destroy`
ถ้าจะ reset lab ต้องเผื่อเวลาตั้ง GitHub Secrets ใหม่ด้วย

---

## 6. กลไกทางเทคนิคที่ต้องเข้าใจ

### 6.1 endpoint ของ RDS คืออะไร

เป็น **ชื่อ DNS** ที่ RDS ออกให้ เช่น `pier2pier-mysql.c9xk2mabcd.us-east-1.rds.amazonaws.com`
ไม่ใช่ IP และไม่ใช่เครื่องใดเครื่องหนึ่ง แต่เป็นป้ายชื่อที่ชี้ไปยังเครื่องที่เป็น primary อยู่ขณะนั้น

Terraform มี output สองตัวที่สับสนง่าย (`modules/database/main.tf`)

| output | ค่า |
|---|---|
| `.address` | `...rds.amazonaws.com` — host ล้วน ✅ โค้ดเราใช้ตัวนี้ |
| `.endpoint` | `...rds.amazonaws.com:3306` — มีพอร์ตติดมา ❌ ถ้าใช้ตัวนี้แอปจะต่อ DB ไม่ได้ |

### 6.2 RDS failover ทำงานยังไง

**อัตโนมัติทั้งหมด RDS ทำเอง ไม่มีโค้ดส่วนไหนสั่ง** Terraform เกี่ยวข้องแค่บรรทัดเดียวคือ `multi_az = var.multi_az`

```
T+0s      primary ใน us-east-1a ตาย (หรือสั่ง Reboot with failover)
T+0–5s    connection ใน pool ขาดทั้งหมด · request ที่ค้าง error · tx() rollback
T+0–120s  RDS เลื่อน standby เป็น primary แล้วแก้ DNS ของ endpoint
          ระหว่างนี้ /health ของ EC2 ทั้งสองเครื่องไม่ผ่านพร้อมกัน (ใช้ DB ตัวเดียวกัน)
          → ALB ไม่เหลือ target ที่ healthy → ตอบ 503
T+60–120s DNS ชื่อเดิมชี้ไปเครื่องใน us-east-1b · pool สร้าง connection ใหม่
          /health ผ่าน → ALB คืน target เข้า rotation → ระบบกลับมา
```

เวลา 60–120 วินาทีมาจากเอกสาร AWS · **เวลาจริงที่วัดได้คือ 14 วินาที** (ผลการทดลองอยู่ใน `docs/AWS_Services_Report.md` §9 และ `results/task5/verification.md`)

**ข้อสังเกตสำคัญ:** ช่วง RDS failover ระบบ **ดับทั้งระบบ** ถึงจะมี EC2 สองเครื่อง เพราะ `/health` ต้อง query DB ตามกฎเหล็กข้อ 5 — **ไม่ใช่บั๊ก** Multi-AZ ทำ HA ให้ฐานข้อมูล ไม่ได้ทำ zero-downtime ให้ทั้งระบบ

### 6.3 LabRole กับ LabInstanceProfile ทำงานยังไง

- **IAM Role** = ชุดสิทธิ์ + trust policy
- **Instance Profile** = ภาชนะที่ห่อ role ไว้ 1 ตัว เพื่อให้แปะกับ EC2 ได้ — **EC2 แปะ role ตรง ๆ ไม่ได้ ต้องผ่าน instance profile เสมอ**

ลำดับการทำงานตอน EC2 บูต

```
1. launch EC2 พร้อม iam_instance_profile = LabInstanceProfile
2. EC2 ถาม metadata service 169.254.169.254 → ได้ credential ชั่วคราวของ LabRole (AWS หมุนให้เอง)
3. user-data.sh  aws ssm get-parameter --with-decryption → DB_PASSWORD, JWT_SECRET
                 เขียนลง /etc/pier2pier.env แล้ว chmod 600
4. user-data.sh  aws ecr get-login-password | docker login → docker pull <ecr>:<git-sha>
5. docker run --env-file /etc/pier2pier.env   แอปฟังพอร์ต 3000
6. ALB ยิง GET /health → ping() ยิง SELECT 1 ไป RDS → 200 → ALB ส่ง traffic เข้า
```

ขั้นที่ 2 คือเหตุผลที่กฎ "ห้าม hardcode credentials" ทำได้จริง — SDK หา credential ตามลำดับ env → `~/.aws` → metadata service

**สิ่งที่เสียไป:** ของเดิมมี `aws_iam_role_policy` จำกัดให้อ่านได้เฉพาะ parameter ภายใต้ path ของโครงการ (least privilege) ใช้ LabRole แล้วทำไม่ได้ **ต้องเขียนเป็นข้อจำกัดในรายงาน** ว่าระบบจริงจะสร้าง role เฉพาะกิจแทน

> ⚠️ **ยังไม่รู้ว่า LabRole มีสิทธิ์ `logs:CreateLogStream` และ `logs:PutLogEvents` หรือไม่**
> `user-data.sh` รัน container ด้วย `--log-driver awslogs` ซึ่งต้องการสิทธิ์เหล่านี้ · policy ที่แปะกับ LabRole
> แบบมีชื่อ (SSMManagedInstanceCore, ECR ReadOnly, EKS ×2) **ไม่มีสิทธิ์ `logs`** เหลือความหวังที่
> `VocLabPolicy1-3` แต่ **อ่านเนื้อ policy ไม่ได้** เพราะ `iam:GetPolicy` โดน explicit deny
> `user-data.sh` มี fallback ไป `--log-driver json-file` ให้เองแล้วพิมพ์คำเตือนใน `/var/log/user-data.log`
> **ถ้าเจอคำเตือนนั้น ให้เขียนเป็นข้อจำกัดในรายงานว่า log ไม่ได้รวมศูนย์**

### 6.4 ทำไม GitHub Actions OIDC ใช้ไม่ได้

OIDC ต้องการสองอย่างใน IAM: (1) สร้าง **OIDC identity provider** ของ `token.actions.githubusercontent.com` (2) สร้าง **IAM role** ที่ trust provider นั้น แล้ว workflow เรียก `sts:AssumeRoleWithWebIdentity`

Learner Lab บล็อกทั้งคู่ และ `list-open-id-connect-providers` คืนค่าว่าง

**ใช้แทน:** กด `AWS Details` บนหน้าแล็บ → ได้ `aws_access_key_id`, `aws_secret_access_key`, `aws_session_token` → ใส่ GitHub Secrets 3 ตัว
**หมดอายุทุกครั้งที่ session จบ ต้องแปะใหม่ทุกครั้งที่เริ่มแล็บรอบใหม่** · ถ้าใส่แค่สองค่าแรกทุกคำสั่ง `aws` จะได้ `InvalidClientTokenId`

### 6.5 CI/CD เดินยังไง

`deploy.yml` ทำงานเมื่อ push เข้า `main` (หรือเรียกเองจากหน้า Actions) มี 4 job

| job | ทำอะไร |
|---|---|
| 1. test | MySQL 8 จริงเป็น service → `migrate` + `seed` + **31 เทสต์** |
| 2. build | tag = `${GITHUB_SHA::7}` → `docker build` → `docker push` ทั้ง `:$TAG` และ `:latest` ไป ECR |
| 3. deploy-api | หา instance ด้วย tag `Project`/`Role` → **`aws ssm send-command`** รัน `deploy-app.sh` **ทีละเครื่อง** → รอ ALB ยืนยัน `healthy` ก่อนไปเครื่องถัดไป → ยิง `/health` 10 ครั้งเทียบ `gitSha` |
| 4. deploy-frontend | อ่าน ALB DNS สด → build ด้วย `VITE_API_BASE_URL` → `aws s3 sync dist/` (asset cache 1 ปี · `index.html` no-cache) |

`concurrency: deploy-production` + `cancel-in-progress: false` — ห้าม deploy ซ้อนกัน ไม่งั้นสองงานแย่งกันเปลี่ยน container บนเครื่องเดียวกัน

`rollback.yml` เรียกเองจากหน้า Actions ใส่ git SHA + เหตุผล → ตรวจว่ามี image tag นั้นใน ECR จริง → `ssm send-command` deploy tag เดิมกลับทีละเครื่อง **ไม่ build ใหม่** จึงเร็วกว่า deploy ปกติมาก — นี่คือคำตอบของ Pain Point ข้อ 3

`ci.yml` ทำงานกับทุก PR และทุก push ที่ไม่ใช่ `main` → backend test · frontend typecheck+build · `terraform fmt -check` + `validate` (Terraform 1.16.5) · **ไม่ deploy อะไรทั้งสิ้น**

---

## 7. Tech Stack · ฟีเจอร์ · Data Model

| ส่วน | เทคโนโลยี |
|---|---|
| Frontend | React 18 + TypeScript 5 · Vite 5 · Tailwind CSS 3 · React Router 6 · Recharts |
| Backend | Node.js 20 · Express 4 · mysql2 (connection pool) · Zod · jsonwebtoken · bcryptjs · Helmet · CORS · Morgan |
| Database | MySQL 8.0 (InnoDB) — 11 ตาราง |
| Test | Jest + Supertest · ESLint — **31 เทสต์** (auth 8 · booking 9 · health 3 · admin 11) |
| Container | Docker / Docker Compose · Nginx (จำลอง ALB ตอน dev) |
| Infra | Terraform 1.16.5 · Git / GitHub · GitHub Actions |

### 7.1 ทางเลือกที่พิจารณาแล้ว "ไม่เลือก"

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
| **ElastiCache** | ตัดเพราะทำไม่ทันและไม่อยากให้ผังมีกล่องที่ IaC ไม่มี — ยังเป็นข้อเสนอพัฒนาต่อ |
| **AWS WAF** | ตัดพร้อม ElastiCache · ไม่มีใน Terraform จึงไม่อ้างว่ามี |
| CloudFront | **แล็บบล็อก** `cloudfront:*` ไม่ใช่ตัวเลือก (ดู 4.1) |

### 7.2 ฟีเจอร์ — 15 Use Cases

**Actors:** Guest · Customer (ตัวแทนขนส่ง) · Admin (ผู้ดูแลระบบท่าเรือ)

| # | Use Case | Actor | | # | Use Case | Actor |
|---|---|---|---|---|---|---|
| 1 | Register | Guest | | 9 | Logout | Customer, Admin |
| 2 | Login | Registered User | | 10 | Manage Users | Admin |
| 3 | View Services | Guest, Customer | | 11 | Manage Services | Admin |
| 4 | Search Services | Guest, Customer | | 12 | Manage Container | Admin |
| 5 | Create Booking | Customer | | 13 | Manage Booking | Admin |
| 6 | Confirm Booking | Customer | | 14 | Manage Stock | Admin |
| 7 | View Booking | Customer | | 15 | View Reports | Admin |
| 8 | Update Profile | Customer, Admin | | | | |

> ทุก UC ที่แตะ DB มี exception 2 แบบ: **validation error (400)** และ **DB ล่ม (503)** จัดการรวมที่ `middleware/error.js` ที่เดียว
> ตารางเชื่อมโยง UC → หน้าจอ → API อยู่ใน `docs/AWS_Services_Report.md` §6.1

### 7.3 Data Model — 11 ตาราง

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

## 8. Runbook — deploy บน Learner Lab ทีละขั้น

คู่มือนี้ใช้ **PowerShell บน Windows** เริ่มคำสั่งจากโฟลเดอร์รากของ repository
อ้างอิงการ deploy ที่ทำสำเร็จ 14 ต.ค. 2569 ใน `us-east-1` — ระบบรอบนั้น `destroy` แล้ว URL ในหลักฐานใช้ต่อไม่ได้

### 8.1 เตรียมเครื่องและเริ่มแล็บ

```powershell
terraform version ; aws --version ; docker version ; node --version
```

1. เข้า **AWS Academy → Learner Lab** กด **Start Lab** รอสถานะ **Ready**
2. เปิด **AWS Details → AWS CLI → Show** คัดลอก credential block ที่มี `[default]`, access key, secret key, session token
3. บันทึก block นั้นลงไฟล์ credential ชั่วคราวที่ `.gitignore` ครอบไว้ — **อย่าวาง AWS keys ในที่สาธารณะหรือ commit ลง Git**

```powershell
terraform '-chdir=infra/terraform' init
notepad .\infra\terraform\.terraform\aws-lab-credentials
```

ใน PowerShell หน้าต่าง **เดียวกัน**

```powershell
$env:AWS_SHARED_CREDENTIALS_FILE = (Resolve-Path '.\infra\terraform\.terraform\aws-lab-credentials').Path
$env:AWS_PROFILE = 'default'
$env:AWS_DEFAULT_REGION = 'us-east-1'
aws sts get-caller-identity
```

เปิด PowerShell ใหม่ต้องตั้งตัวแปร `$env:` สามตัวนี้ใหม่ · credential หมดอายุเมื่อ session จบ

### 8.2 ตั้งค่า Terraform

```powershell
if (-not (Test-Path '.\infra\terraform\terraform.tfvars')) {
    Copy-Item '.\infra\terraform\terraform.tfvars.example' '.\infra\terraform\terraform.tfvars'
}
$ImageTag = (git rev-parse --short HEAD).Trim()
$Name = 'pier2pier-dev'   # ต้องตรงกับ <project>-<environment> ใน terraform.tfvars
Write-Output "image_tag ที่ต้องใส่ใน tfvars: $ImageTag"
notepad .\infra\terraform\terraform.tfvars
```

| ค่า | ใช้ในแล็บ |
|---|---|
| `aws_region` | `"us-east-1"` |
| `project`, `environment` | `"pier2pier"`, `"dev"` |
| `db_multi_az` | `true` สำหรับพิสูจน์ Multi-AZ |
| `db_password` | สุ่มเองและยาว **ไม่เกิน 41 ตัวอักษร** (รอบก่อนใช้ 32) |
| `jwt_secret` | สุ่มเอง (`openssl rand -base64 48`) ไม่ซ้ำกับรหัสผ่าน DB |
| `image_tag` | ค่า `$ImageTag` จาก Git · ต้องตรงกับ tag ที่ push ไป ECR |
| `manage_frontend_bucket` | **`false`** — SCP ของแล็บปฏิเสธ API ที่ Terraform ใช้อ่าน S3 Object Lock |
| `alarm_email` | `""` ถ้าไม่ต้องการอีเมลแจ้งเตือน |

`terraform.tfvars` อยู่ใน `.gitignore` แล้ว · ตรวจด้วย `git status --short` ว่าไม่ถูกเสนอให้ commit

```powershell
terraform '-chdir=infra/terraform' fmt -recursive -check
terraform '-chdir=infra/terraform' validate
```

### 8.3 สร้าง S3 bucket และ ECR image ก่อน apply ทั้งระบบ

```powershell
$Bucket = "${Name}-web"
aws s3api create-bucket --bucket $Bucket --region us-east-1
aws s3api head-bucket --bucket $Bucket
```

ชื่อ bucket ใช้ร่วมกันทั่ว AWS — ถ้าชื่อนี้มีเจ้าของอื่น เปลี่ยน `project`/`environment` แล้วแก้ `$Name` ให้ตรง **ห้ามใช้ bucket ของบัญชีอื่น**

```powershell
terraform '-chdir=infra/terraform' apply '-target=module.ecr'
$EcrRepo = (terraform '-chdir=infra/terraform' output -raw ecr_repository_url).Trim()
$EcrRegistry = $EcrRepo.Split('/')[0]

docker build --platform linux/amd64 -t "pier2pier-api:$ImageTag" .\backend
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin $EcrRegistry
docker tag "pier2pier-api:$ImageTag" "${EcrRepo}:$ImageTag"
docker push "${EcrRepo}:$ImageTag"
aws ecr describe-images --repository-name "${Name}-api" --image-ids "imageTag=$ImageTag" --query 'imageDetails[0].imageDigest' --output text
```

คำสั่งสุดท้ายต้องแสดง digest `sha256:...` ถ้า push หลุดกลางทางให้ push tag เดิมซ้ำจนมี digest ก่อนไปขั้นต่อไป

### 8.4 Apply และเผยแพร่ frontend

```powershell
terraform '-chdir=infra/terraform' plan
terraform '-chdir=infra/terraform' apply

$AlbDns   = (terraform '-chdir=infra/terraform' output -raw alb_dns_name).Trim()
$WebUrl   = (terraform '-chdir=infra/terraform' output -raw web_endpoint).Trim()
$Bucket   = (terraform '-chdir=infra/terraform' output -raw frontend_bucket).Trim()
$Instances = @(terraform '-chdir=infra/terraform' output -json app_instance_ids | ConvertFrom-Json)
Write-Output "ALB: http://$AlbDns" ; Write-Output "Web: $WebUrl"
```

**RDS Multi-AZ ใช้เวลา 15–20 นาที** (รอบที่ทดสอบเกือบ 16 นาที) ถ้า apply หยุดกลางทางให้แก้แล้ว `apply` ซ้ำจาก state เดิม — **อย่าลบ state ขณะยังมี resource อยู่**

```powershell
Push-Location .\frontend
$env:VITE_API_BASE_URL = "http://$AlbDns"
npm ci ; npm run build
Pop-Location

aws s3 sync '.\frontend\dist\' "s3://$Bucket/" --delete --exclude 'index.html' --cache-control 'public,max-age=31536000,immutable'
aws s3 cp '.\frontend\dist\index.html' "s3://$Bucket/index.html" --content-type 'text/html; charset=utf-8' --cache-control 'no-cache, no-store, must-revalidate'
```

ใช้ URL ที่ Terraform แสดงจริงในแต่ละรอบ — DNS ของ ALB เปลี่ยนหลัง destroy/apply ใหม่

### 8.5 ตรวจระบบและเติมข้อมูลตัวอย่าง

```powershell
aws rds describe-db-instances --db-instance-identifier "${Name}-mysql" --query 'DBInstances[0].[DBInstanceStatus,MultiAZ,AvailabilityZone,SecondaryAvailabilityZone]' --output table
$TargetGroupArn = (aws elbv2 describe-target-groups --names "${Name}-tg" --query 'TargetGroups[0].TargetGroupArn' --output text).Trim()
aws elbv2 describe-target-health --target-group-arn $TargetGroupArn --query 'TargetHealthDescriptions[].{id:Target.Id,state:TargetHealth.State}' --output table
Invoke-RestMethod "http://$AlbDns/health" | ConvertTo-Json -Depth 5
```

รัน seed **ครั้งเดียว** ผ่าน SSM บนเครื่องแรก (ข้อมูลอยู่ใน RDS ที่ทั้งสองเครื่องใช้ร่วมกัน)

```powershell
$SeedCommand = "sudo docker run --rm --env-file /etc/pier2pier.env ${EcrRepo}:$ImageTag node src/db/seed.js"
$Parameters = @{ commands = @($SeedCommand) } | ConvertTo-Json -Compress
$CommandId = (aws ssm send-command --document-name AWS-RunShellScript --instance-ids $Instances[0] --parameters $Parameters --query 'Command.CommandId' --output text).Trim()
aws ssm get-command-invocation --command-id $CommandId --instance-id $Instances[0] --query '[Status,ResponseCode]' --output json
```

รอจนสถานะเป็น `Success` และ `ResponseCode = 0` แล้วเปิด `$WebUrl` — หน้าแรกต้องแสดงเที่ยวเรือ และล็อกอินด้วยบัญชีตัวอย่างให้เห็น dashboard ได้

### 8.6 Destroy และตรวจว่าไม่เหลือทรัพยากร

```powershell
terraform '-chdir=infra/terraform' destroy
```

`manage_frontend_bucket=false` ทำให้ bucket ไม่อยู่ใน state ต้องลบไฟล์ **ทุก version รวม delete marker** แล้วลบ bucket เอง

```powershell
$Listing = aws s3api list-object-versions --bucket $Bucket --output json | ConvertFrom-Json
$Objects = @($Listing.Versions) + @($Listing.DeleteMarkers) | Where-Object { $_ -and $_.Key -and $_.VersionId }
foreach ($Object in $Objects) {
    aws s3api delete-object --bucket $Bucket --key $Object.Key --version-id $Object.VersionId | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "ลบ S3 object version ไม่สำเร็จ: $($Object.Key)" }
}
aws s3api delete-bucket --bucket $Bucket
```

ถ้า Terraform หยุดเพราะ ECR ยังมี image ให้ตรวจว่า `modules/ecr/main.tf` มี `force_delete = true` · ถ้าจำเป็นลบด้วย `aws ecr delete-repository --repository-name "${Name}-api" --force` แล้ว `destroy` ซ้ำ

ตรวจผลสุดท้าย: `terraform state list` ต้องไม่มี managed resource · RDS/ALB/ECR/S3 ไม่เหลือ · EC2/NAT อยู่สถานะ `terminated`/`deleted`

```powershell
docker logout $EcrRegistry
Remove-Item -LiteralPath '.\infra\terraform\.terraform\aws-lab-credentials' -Force
```

ลบ `terraform.tfstate*` ได้หลังยืนยันว่า destroy ครบ เพราะ state backup อาจมีรหัสผ่าน DB/JWT · `terraform.tfvars` ก็มีความลับ **ห้ามส่งต่อหรือ commit**

### 8.7 Checklist เมื่อเริ่มแล็บรอบใหม่

| ลำดับ | ต้องทำ | หมายเหตุ |
|---|---|---|
| 1 | ติดตั้ง Terraform | `winget install --id Hashicorp.Terraform -e` · ต้องมี `-e` ไม่งั้นไม่เจอ package |
| 2 | กด **Start Lab** | **RDS ไม่ถูกหยุดอัตโนมัติ** ตอนจบ session ต้องปิดเอง |
| 3 | **AWS Details** → ใส่ GitHub Secrets 3 ตัว | `AWS_ACCESS_KEY_ID` · `AWS_SECRET_ACCESS_KEY` · `AWS_SESSION_TOKEN` — หมดอายุทุก session |
| 4 | สร้าง `terraform.tfvars` จาก `.example` | ใส่ `db_password` + `jwt_secret` · ไฟล์นี้อยู่ใน `.gitignore` **ห้าม commit** |
| 5 | `terraform apply` | ของจริง เสียเงินจริง ~$0.21/ชม. ถ้าเปิดทุกอย่าง |
| 6 | `terraform destroy` ทันทีที่เก็บหลักฐานพอ | ตรวจยอดงบบนหน้าแล็บทุกครั้ง |

---

## 9. โครงรายงานฉบับรูปเล่ม

**ไฟล์ปัจจุบัน:** `รายงาน Cloud final.docx` (อยู่ในโฟลเดอร์ `cloud/` ชั้นนอก)

- ฟอนต์ **TH SarabunPSK** เนื้อหา 16pt · คำบรรยายรูป/ตาราง 14pt ชิดซ้าย
- ใช้ `G21_รูปเล่มรายงาน.pdf` เป็นตัวอย่างรูปแบบ (เอาเฉพาะโครงหัวข้อกับสำนวน ไม่แตะฟอนต์)
- **เปิดใน Word แล้วกด Ctrl+A → F9 ทุกครั้งหลังแก้** เพื่อรีเฟรชสารบัญ 3 ชุด

```
บทคัดย่อ · คำนำ · กิตติกรรมประกาศ · สารบัญ/สารบัญรูป/สารบัญตาราง
บทที่ 1 บทนำ
  1.1 ความเป็นมาของปัญหา · 1.2 วัตถุประสงค์
  1.3 ขอบเขตของระบบ → 1.3.1 ฟังก์ชัน · 1.3.2 สถาปัตยกรรม · 1.3.3 กระบวนการพัฒนา
                       1.3.4 ความปลอดภัย · 1.3.5 ข้อจำกัดของระบบ
  1.4 ประโยชน์ที่คาดว่าจะได้รับ · 1.5 โครงสร้างของรายงาน
บทที่ 2 ทฤษฎีและเทคโนโลยีที่เกี่ยวข้อง
  2.1 ทฤษฎีที่เกี่ยวข้อง (2.1.1 WMS → 2.1.8 Cloud & Monitoring · 2.1.7 = Auth/RBAC)
  2.2 สถาปัตยกรรมคลาวด์ที่ใช้ในระบบ (2.2.5 = บริการสนับสนุน ECR/SSM/SNS/IAM)
  2.3 สถาปัตยกรรมเครือข่าย · 2.4 สถาปัตยกรรมฐานข้อมูล
  2.5 เทคโนโลยีที่ใช้ในการพัฒนา · 2.6 การเลือกใช้บริการ Cloud และเหตุผล
บทที่ 3 ขั้นตอนการดำเนินงานของโครงงาน
  3.1 วิเคราะห์ความต้องการ (FR/NFR)
  3.2 การวิเคราะห์และออกแบบระบบ (3.2.1 สถาปัตยกรรมบนคลาวด์ · 3.2.2 Use-Case Diagram · 3.2.3 Use-Case Spec)
  3.3 หลักการทำงานของระบบ (ERD · traceability · sequence · multi-tier · CI/CD)
  3.4 ผลการออกแบบส่วนติดต่อผู้ใช้งานและลำดับการใช้งาน
  3.5 การประมาณการค่าใช้จ่ายของระบบบนคลาวด์
```

**เลขรูป/ตารางปัจจุบัน:** รูปที่ 2.1–2.25 · รูปที่ 3.1–3.30 · ตารางที่ 2.1–2.3 · ตารางที่ 3.1–3.5

### 9.1 ไดอะแกรมในโฟลเดอร์ `docs/diagrams/`

| ไฟล์ | ใช้เป็นรูปที่ |
|---|---|
| `01_ER_Diagram.drawio` | 3.3 |
| `02_Sequence_Login.drawio` | 3.4 |
| `03_Sequence_Booking.drawio` | 3.5 |
| `04_CICD_Pipeline.drawio` | 3.6 |
| `05_Network_Topology.drawio` | — (สำรอง) |
| `06_AWS_Architecture.drawio` | 3.1 |
| `07_WMS_Port_Concept` … `13_RBAC` (7 ไฟล์) | บทที่ 2 หัวข้อ 2.1.x |

---

## 10. แหล่งอ้างอิงหลัก

1. AWS. *Elastic Load Balancing features*. https://aws.amazon.com/elasticloadbalancing/features/
2. AWS. *Health checks for ALB target groups*. https://docs.aws.amazon.com/elasticloadbalancing/latest/application/target-group-health-checks.html
3. AWS. *Amazon RDS Features*. https://aws.amazon.com/rds/features/
4. AWS. *Amazon RDS for MySQL pricing*. https://aws.amazon.com/rds/mysql/pricing/
5. AWS. *EC2 On-Demand Pricing*. https://aws.amazon.com/ec2/pricing/on-demand/
6. AWS. *Common use cases in Amazon ECR*. https://docs.aws.amazon.com/AmazonECR/latest/userguide/ecr-use-cases.html
7. AWS. *Custom error document support* (S3 website hosting). https://docs.aws.amazon.com/AmazonS3/latest/userguide/CustomErrorDocSupport.html
8. GitHub. *Pricing changes for GitHub Actions (2026)*. https://github.com/resources/insights/2026-pricing-changes-for-github-actions
9. CloudZero. *Amazon ECR Unpacked*. https://www.cloudzero.com/blog/amazon-ecr/
10. CloudZero. *AWS ALB Pricing 2026*. https://www.cloudzero.com/blog/aws-alb-pricing/
11. Rapydo. *AWS RDS vs. Self-Managed Databases*. https://www.rapydo.io/blog/aws-rds-vs-self-managed-databases-a-comprehensive-comparison

> รายการอ้างอิงฉบับเต็มของรายงานอยู่ใน `docs/AWS_Services_Report.md` §13

---

## 11. เอกสารในโปรเจกต์

| ไฟล์ | เนื้อหา |
|---|---|
| [`README.md`](README.md) | วิธีรันบนเครื่อง · โครงสร้างโปรเจกต์ · คำสั่งที่ใช้บ่อย |
| **`INSTRUCTION.md`** (ไฟล์นี้) | **แหล่งข้อมูลเดียว** — สถาปัตยกรรม · ข้อจำกัดแล็บ · การตัดสินใจ · กลไกทางเทคนิค · runbook |
| [`docs/AWS_Services_Report.md`](docs/AWS_Services_Report.md) | รายงานเชิงเนื้อหา — บริการ AWS ทุกตัวพร้อมเหตุผล ฟีเจอร์ ผลการทดลอง ค่าใช้จ่าย อ้างอิง |
| `docs/diagrams/*.drawio` | ไดอะแกรม 13 ไฟล์ (ดู 9.1) |
| [`results/task4/verification.md`](results/task4/verification.md) | หลักฐาน `terraform apply` จริง 14 ต.ค. |
| [`results/task5/verification.md`](results/task5/verification.md) | หลักฐานผลการทดลอง 4 ชุด 20 ต.ค. + 23 ภาพ |
| `results/*.txt` `*.raw` | ผลดิบ loadtest/failover จาก docker-compose (ของเก่า — **ห้ามใช้ในรายงาน** ให้ใช้ผล AWS จริงใน `docs/AWS_Services_Report.md` §9) |
