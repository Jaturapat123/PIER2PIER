# HANDOFF — สถานะโครงงาน jekcloud (Port WMS)

> อัปเดต: 14 ต.ค. 2569 · อ่านไฟล์นี้ก่อนทำงานต่อ
>
> ⚠️ **สถาปัตยกรรมเปลี่ยนแล้ว** — ย้ายไป deploy บน AWS Academy Learner Lab · ไม่มี CloudFront · RDS เป็น Multi-AZ
> รายละเอียดทั้งหมดและแผนงานอยู่ใน [`instruction.md`](instruction.md) ถ้าขัดกับไฟล์นี้ให้ยึดไฟล์นั้น

---

## 0. 🤝 รับงานต่อ — อ่านตรงนี้ก่อน

### 0.1 ลำดับการอ่าน (สำหรับคนและสำหรับ Claude)

```
1. HANDOFF.md §0 (ไฟล์นี้)   — สถานะล่าสุด ทำอะไรไปแล้ว เหลืออะไร
2. instruction.md             — ข้อเท็จจริงจากบัญชีแล็บจริง + การตัดสินใจ + แผนงาน §9
3. CLAUDE.md                  — context ของโครงงานทั้งหมด + กฎเหล็ก
```

**ถ้าสามไฟล์ขัดกัน ให้ยึด `instruction.md`** ไฟล์นั้นมีหลักฐานจากบัญชีจริงกำกับทุกข้อ

### 0.2 ตอนนี้อยู่ตรงไหนของแผน

แผนงานเต็มอยู่ใน `instruction.md` §9 มี 6 งาน — **ทำเสร็จแล้ว 4 งาน**

| งาน | สถานะ | ตรวจด้วยอะไร |
|---|---|---|
| 1. Terraform: NAT 2 ตัว · route table ต่อ AZ · LabInstanceProfile · us-east-1 · Multi-AZ | ✅ | `terraform fmt -check` exit 0 · `terraform validate` Success |
| 2. Terraform: รื้อ CloudFront → `frontend_web` (S3 website hosting) | ✅ | `terraform validate` Success · ไม่มี resource CloudFront เหลือ |
| 3. GitHub Actions: เลิก OIDC → access key+session token · `VITE_API_BASE_URL` · ลบ step ล้าง cache | ✅ | YAML parse ผ่าน 3 ไฟล์ · build จริงแล้วเจอ URL ฝังใน `dist/assets/index-*.js` |
| 4. `terraform apply` จริงในแล็บ | ✅ | Multi-AZ · ALB healthy 2 เครื่อง · ล็อกอินผ่าน S3/ALB · ภาพใน `results/task4/` · destroy แล้ว |
| 5. เก็บผลทดลอง 4 ชุดบน AWS จริง | ⬜ | |
| 6. ElastiCache ในโค้ดแอป (ตัดได้ถ้าเวลาไม่พอ) | ⬜ | |

### 0.3 ⚠️ เส้นแบ่งระหว่าง "ตรวจแล้ว" กับ "ยังไม่ได้พิสูจน์"

**อย่าเขียนหรือพูดเกินนี้ในรายงานและตอนนำเสนอ**

ตรวจแล้วด้วยการรันจริง
- Terraform ผ่าน `fmt -check` และ `validate` (Terraform v1.16.5 บนเครื่องผู้ส่งมอบ)
- `VITE_API_BASE_URL` ถูกฝังลงไฟล์ JS ตอน build จริง
- Backend 31 เทสต์ผ่านบน GitHub Actions (job 1 ของ Deploy รอบ 6 ก.ย.)
- Load balancing 50/50 และ failover 100% — **บน docker-compose ไม่ใช่บน AWS**

ผลจาก AWS จริงและข้อที่ยังไม่ได้พิสูจน์
- `terraform apply` สำเร็จจริงใน AWS Academy วันที่ 14 ต.ค. และ destroy แล้ว — ดู `results/task4/verification.md`
- `LabInstanceProfile` มีอยู่จริง; EC2 สองเครื่องรันในคนละ AZ และ ALB รายงาน healthy ทั้งคู่ก่อน destroy
- **ไม่รู้ว่า LabRole มีสิทธิ์ `logs:CreateLogStream` และ `logs:PutLogEvents` ไหม**
  ถ้าไม่มี log จะไม่เข้า CloudWatch แต่**ระบบยังขึ้นได้** — `user-data.sh` ถอยไปใช้
  `--log-driver json-file` ให้เองแล้วพิมพ์คำเตือนใน `/var/log/user-data.log`
  ถ้าเจอคำเตือนนั้นให้เขียนเป็นข้อจำกัดในรายงานว่า log ไม่ได้รวมศูนย์
- deep link บน S3 website endpoint ได้ HTTP 404 พร้อม `index.html` ตามที่ทดสอบจริง
- RDS Multi-AZ สร้างสำเร็จ โดย primary อยู่ `us-east-1b` และ standby อยู่ `us-east-1a`
- ยังไม่ได้รัน workflow deploy/rollback บน GitHub เลยหลังแก้งานที่ 3

### 0.4 ขั้นตอนเมื่อเริ่มแล็บรอบใหม่

| ลำดับ | ต้องทำ | หมายเหตุ |
|---|---|---|
| 1 | ติดตั้ง Terraform | `winget install --id Hashicorp.Terraform -e` (Windows) · ต้อง `-e` ไม่งั้นไม่เจอ package |
| 2 | กด **Start Lab** ในหน้า AWS Academy | RDS **ไม่ถูกหยุดอัตโนมัติ** ตอนจบ session ต้องปิดเอง |
| 3 | เปิด **AWS Details** → คัดลอก 3 ค่าไปใส่ GitHub Secrets | `AWS_ACCESS_KEY_ID` · `AWS_SECRET_ACCESS_KEY` · `AWS_SESSION_TOKEN` — **หมดอายุทุกครั้งที่ปิดแล็บ ต้องใส่ใหม่ทุก session** |
| 4 | สร้าง `infra/terraform/terraform.tfvars` จาก `.example` | ใส่ `db_password` และ `jwt_secret` (`openssl rand -base64 48`) · ไฟล์นี้อยู่ใน `.gitignore` **ห้าม commit** |
| 5 | กด `terraform apply` เอง | สร้างของจริงและเสียเงินจริง ~$0.21/ชม. ถ้าเปิดทุกอย่าง |
| 6 | `terraform destroy` ทันทีที่เก็บหลักฐานพอ | บัญชีนี้มีงบ $50; ตรวจยอดล่าสุดบนหน้าแล็บทุกครั้ง |
| 7 | export PNG จาก `.drawio` 11 ไฟล์ | เจ้าของงานชอบ export เอง — อย่าส่ง PNG ให้ถ้าไม่สั่ง |
| 8 | แก้ `.docx` ใน Word แล้ว `Ctrl+A → F9` | รีเฟรชสารบัญ 3 ชุด · **Claude ยังไม่ได้รับอนุญาตให้แตะไฟล์ `.docx`** |

> ⚠️ **บัญชี Learner Lab เป็นของใครของมัน** — ข้อเท็จจริงเรื่องบัญชีใน `instruction.md` §2
> (บัญชีที่ใช้ทำงานที่ 4 แสดงวงเงิน $50 · destroy ทรัพยากรแล้ว · Block Public Access ปิดทั้ง 4 ข้อ)
> เป็นของบัญชีผู้ส่งมอบ **ไม่ใช่ของคุณ** ถ้าคุณใช้แล็บของตัวเอง ต้องตรวจซ้ำเองด้วยคำสั่งที่
> `instruction.md` §2 แนบไว้ให้ทุกข้อ — อย่าเชื่อตัวเลขงบและสถานะ resource ตรง ๆ

### 0.5 กฎที่ Claude ต้องทำตามในโครงงานนี้

1. **ห้ามสร้าง/แก้/ลบอะไรบน AWS ก่อนได้รับอนุญาตจากคนเป็นครั้ง ๆ ไป** — read-only เท่านั้น
2. **ห้ามเคลมว่า "เสร็จ/ผ่าน/ใช้งานได้" โดยไม่ได้รันคำสั่งตรวจจริง** และต้องแนบผลที่ได้
3. **ห้ามแก้ไฟล์ `.docx`** ยังไม่ได้รับอนุญาต · แก้ได้แค่ `.md`
4. ไดอะแกรมส่งเป็น `.drawio` เท่านั้น ไม่ต้อง export PNG ให้
5. กฎเหล็กของโค้ดอยู่ใน §8 ของไฟล์นี้ และ `CLAUDE.md` §3.2 — อ่านก่อนแก้โค้ด

### 0.6 ไฟล์ที่เปลี่ยนในรอบนี้ (14 ต.ค.)

```
แก้ไข    .gitignore                              ให้ commit .terraform.lock.hcl ได้
แก้ไข    infra/terraform/main.tf                 cors_origins · module frontend_web
แก้ไข    infra/terraform/outputs.tf              web_endpoint แทน cloudfront_domain
แก้ไข    infra/terraform/variables.tf            region + AZ เป็น us-east-1
แก้ไข    infra/terraform/providers.tf            region ใน backend comment
แก้ไข    infra/terraform/terraform.tfvars.example  db_multi_az = true
แก้ไข    infra/terraform/modules/network/main.tf   NAT 2 ตัว + route table ต่อ AZ
แก้ไข    infra/terraform/modules/compute/main.tf   LabInstanceProfile แทน IAM role เอง
ลบ       infra/terraform/modules/frontend_cdn/     (ทั้งโฟลเดอร์)
ใหม่     infra/terraform/modules/frontend_web/     S3 static website hosting
ใหม่     infra/terraform/.terraform.lock.hcl       ตรึง provider aws 5.100.0
แก้ไข    .github/workflows/deploy.yml            access key+session token · VITE_API_BASE_URL
แก้ไข    .github/workflows/rollback.yml          access key+session token · us-east-1
แก้ไข    .github/workflows/ci.yml                terraform 1.9.8 → 1.16.5
ใหม่     instruction.md                          ข้อเท็จจริงจากแล็บ + แผนงาน (สำคัญที่สุด)
ใหม่     CLAUDE.md                               context โครงงาน
ใหม่     docs/diagrams/06_AWS_Architecture.drawio  ผังที่แก้ตามข้อจำกัดแล็บแล้ว
แก้ไข    README.md · HANDOFF.md · docs/AWS_Services_Report.md
```

**ยังไม่ได้แก้และรู้ตัวอยู่:** `docs/AWS_Services_Report.md` ยังเขียนถึง CloudFront อยู่ 21 จุด
รวมหัวข้อ 4.5 ทั้งหัวข้อ — ตั้งใจเลื่อนไว้ ต้องรื้อเขียนใหม่ก่อนส่ง

---

## 1. งานนี้คืออะไร

ระบบ **Port Warehouse Management System (WMS)** ของกลุ่ม Pier2Pier (J3K) — เว็บ multi-tier
พร้อม deploy ลง AWS สำหรับวิชา Cloud Computing 1/2569

โจทย์เดิมจากผู้ใช้ (ครบทุกข้อ ทำเสร็จหมดแล้ว):
1. mockup หน้าเว็บสำหรับนำเสนอ → ทำเป็น **แอปรันได้จริง** ไม่ใช่ภาพนิ่ง
2. report `.md` ว่าใช้ AWS service อะไร ทำไม + feature ที่จำเป็น → `docs/AWS_Services_Report.md`
3. use case จาก `Copy of ส่งหัวข้อโครงงาน - September 1, 12_35 PM.docx` → 15 UC ครบ
4. หาข้อมูลจากเน็ตมาสนับสนุนว่าควรปรับ feature ตรงไหน → §7 ของรายงาน (7 ข้อ มีอ้างอิง)
5. source code อยู่ใน folder `jekcloud` · พร้อม deploy ลง AWS

## 2. โดเมน — เคลียร์แล้ว

เคยมีประเด็นว่า `cloud/CLAUDE.md` เขียนว่าเป็น E-Commerce ขัดกับโค้ดที่เป็น Port WMS
ตอนนี้ **ไฟล์นั้นไม่มีแล้ว** และ `jekcloud/CLAUDE.md` ระบุชัดว่าเป็น **Port Warehouse Management System**
(จองระวางเที่ยวเรือ / ตู้คอนเทนเนอร์ / ลานตู้) ตามไฟล์ use case `Copy of ส่งหัวข้อโครงงาน...docx` — ไม่มีอะไรค้างแล้ว

## 3. สถานะ: เสร็จแล้ว ✅

| ส่วน | สถานะ |
|---|---|
| Backend (Express + mysql2 + JWT) | 15 UC ครบ · 31 เทสต์ผ่าน |
| Frontend (React+Vite+TS+Tailwind) | 20+ หน้า · tsc + build ผ่าน |
| DB (MySQL 8, 11 ตาราง) | migration + seed idempotent |
| Terraform (7 modules) | `fmt` + `validate` ผ่าน — รันจริงด้วย Terraform v1.16.5 เมื่อ 14 ต.ค. |
| GitHub Actions | ci.yml · deploy.yml · rollback.yml — แก้เป็น credential ของแล็บแล้ว ยังไม่ได้รันจริง |
| docker-compose (2 API + nginx LB) | จำลอง ALB ได้ ทดสอบ failover ได้ |
| รายงาน | `docs/AWS_Services_Report.md` 13 หัวข้อ + 14 อ้างอิง |

**บั๊กที่ /scrutinize เจอ 11 ข้อ (2 รอบ) แก้ครบแล้ว** — รายละเอียดใน รายงาน §9.6

## 4. ❌ สิ่งที่ยังไม่ได้ทำ / ยังไม่ได้พิสูจน์

1. ✅ **งานที่ 4 ใน `instruction.md` §9 เสร็จแล้ว** — apply บน AWS จริง, ล็อกอินหน้าเว็บผ่าน ALB, ยืนยัน RDS Multi-AZ แล้ว destroy ครบ ดู `results/task4/verification.md`
2. ✅ **งานที่ 1–3 ใน `instruction.md` §9 ทำเสร็จแล้ว** (14 ต.ค.) — Terraform และ workflow พร้อมแล้ว
   **GitHub OIDC ใช้ไม่ได้ใน Learner Lab** (สร้าง IAM role ไม่ได้) workflow เปลี่ยนไปใช้
   access key + secret + **session token** จากหน้า `AWS Details` แล้ว ซึ่งหมดอายุทุกครั้งที่ session จบ
   — แต่**ยังไม่ได้ตั้ง GitHub Secrets และยังไม่ได้รัน workflow จริงเลย**
3. **บั๊กข้อ 6 (migration race)** — ยืนยันจากการอ่านโค้ดเท่านั้น รันสองกระบวนการพร้อมกันแล้ว
   ทำให้ล้มเหลวจริงไม่ได้ ล็อก `GET_LOCK` ที่ใส่ไปเป็นการป้องกันเชิงโครงสร้าง
   **ห้ามเขียนในรายงานว่าเป็นบั๊กที่ทำซ้ำได้**
4. ยังไม่มี screenshot จาก AWS Pricing Calculator (Stage 3 ต้องใช้ 10 คะแนน)

## 4.5 GitHub — push แล้ว (6 ก.ย. 2569)

repo: **https://github.com/Jaturapat123/PIER2PIER** (public) · push ในนาม `buildsudtae`
`gh` ล็อกอินค้างไว้แล้วบนเครื่องนี้ · **4 commit บน `main`** (ล่าสุด `f211744 update ui` 9 ก.ย.)
ยังมีไฟล์ที่ยังไม่ได้ commit — รายการเต็มอยู่ใน §0.6 ของไฟล์นี้ (งานที่ 1–3 ทั้งหมด + `CLAUDE.md` +
`instruction.md` + ผลทดลองรอบ 9 ก.ย. ใน `results/` + ผังที่ย้ายมาใหม่)

**ผลรัน GitHub Actions (Deploy):**

| Job | ผล |
|---|---|
| 1. ทดสอบก่อน deploy | ✅ ผ่าน (MySQL 8 จริง + migrate + seed + 31 เทสต์) |
| 2. Build และ push image | ❌ ล้มที่ `configure-aws-credentials` |
| 3-4. Deploy | ⏭️ ข้าม |

สาเหตุ: `secrets.AWS_DEPLOY_ROLE_ARN` ว่าง → `Could not load credentials from any providers`
**ไม่ใช่บั๊ก** — ยังไม่มี AWS account ต่ออยู่ pipeline หยุดตัวเองถูกต้องแล้ว

> ⚠️ **ผลรันข้างบนเป็นของรอบ 6 ก.ย. ซึ่งล้าสมัยแล้ว** — `AWS_DEPLOY_ROLE_ARN` ถูกลบออกจาก workflow
> เมื่อ 14 ต.ค. ตอนนี้ใช้ `AWS_ACCESS_KEY_ID` + `AWS_SECRET_ACCESS_KEY` + `AWS_SESSION_TOKEN`
> เมื่อตั้ง secrets แล้วต้องรันใหม่และเก็บผลรอบใหม่มาแทนตารางนี้

แก้ไปแล้วระหว่างทาง: อัป action ทุกตัวให้รันบน Node 24 (checkout v4→v7, setup-node v4→v7,
configure-aws-credentials v4→v6, setup-terraform v3→v4) คำเตือน Node 20 หายหมด
**อย่าอัป `node-version: '20'` ที่ใช้รันเทสต์** — ต้องตรงกับ `node:20-alpine` ใน backend/Dockerfile

⚠️ **ค้างอยู่ ยังไม่ได้ตอบ:** commit มี trailer `Co-Authored-By: Claude` ทำให้ Claude ขึ้นเป็น
contributor บน GitHub ผู้ใช้ถามแล้วแต่ยังไม่ได้สั่งว่าจะลบไหม ถ้าจะลบใช้ `git rebase` แก้ทั้ง 2 commit
แล้ว force-push (repo ยังไม่มีใคร clone)

---

## 5. ข้อเสนอที่ผู้ใช้ยังไม่ตอบ (อย่าเริ่มเองถ้าไม่สั่ง)

- ลบ `Co-Authored-By: Claude` ออกจาก commit history ไหม (ถามแล้ว ยังไม่ตอบ)
- เขียนสคริปต์พูดสำหรับสาธิต 4 ฉาก
- แก้ `.gitignore` ให้ `.terraform.lock.hcl` commit ได้ — **ทำแล้ว 14 ต.ค.**
- รื้อ CloudFront 21 จุดใน `docs/AWS_Services_Report.md` (รู้ว่าต้องทำ ยังไม่ได้ทำ)

## 6. รันยังไง

ต้องเปิด **สองอย่าง** — nginx บน 8080 เป็น API อย่างเดียว ไม่ได้เสิร์ฟหน้าเว็บ

```bash
# หน้าต่างที่ 1 — backend + DB + load balancer
cd jekcloud
docker compose up -d --build     # db + api-a + api-b + nginx lb

# หน้าต่างที่ 2 — หน้าเว็บ (vite proxy /api และ /health ไปที่ 8080 ให้เอง)
cd jekcloud/frontend && npm run dev

# เปิดเว็บ: http://localhost:5173
# API ผ่าน LB: http://localhost:8080
# api-a ตรง: 3000 · api-b ตรง: 3001 · db: 3307
bash scripts/smoke.sh            # ตรวจ 12 รายการ
bash scripts/loadtest.sh         # ดูการกระจายโหลด
bash scripts/failover-test.sh    # ปิด api-a ระหว่างยิง วัดความพร้อมใช้งาน
docker compose down              # ปิด
```

**หมายเหตุพอร์ต:** DB map เป็น `3307:3306` เพราะเครื่องนี้มี MySQL รันบน 3306 อยู่แล้ว
`backend/tests/setup.js` จึง default `DB_PORT=3307` — ถ้าย้ายเครื่องอาจต้องแก้

บัญชีทดสอบ (จาก seed): `admin@pier2pier.test` · `customer@pier2pier.test` ·
`agent@pier2pier.test` · รหัสผ่าน `Pier2Pier!2569`

## 7. ผลทดลองที่เก็บไว้แล้ว (ใช้ส่ง Stage 3 ได้)

อยู่ใน `results/` — รัน 3 รอบ ผลตรงกันทุกรอบ

- Load balancing: 50.0% / 50.0% · ล้มเหลว 0
- Failover (ปิด api-a ระหว่างยิง): ความพร้อมใช้งาน **100.00%** · ไม่มีช่วงขาดบริการ

## 8. กฎเหล็กของโค้ดนี้ (อย่าละเมิด)

1. Session/cart **stateless** — JWT + แถว `bookings status='pending'` ใน DB ห้ามเก็บใน memory
2. กันจองซ้อน ต้องใช้ `SELECT ... FOR UPDATE` ใน transaction เสมอ
3. **หน้าเว็บกับ API อยู่คนละ origin** — หน้าเว็บที่ S3 website endpoint · API ที่ ALB
   frontend build ด้วย `VITE_API_BASE_URL=http://<alb-dns>` และ backend ตั้ง `CORS_ORIGINS` เป็น endpoint ของ S3
   (ไม่มี mixed content เพราะทั้งคู่เป็น HTTP — Learner Lab ออกใบรับรองไม่ได้)
4. SPA routing ใช้ **`ErrorDocument = index.html`** ของ S3 website hosting (CloudFront Function ใช้ไม่ได้แล้ว)
5. description ของ Security Group rule ใน Terraform **ต้องเป็น ASCII** — AWS ปฏิเสธภาษาไทย
