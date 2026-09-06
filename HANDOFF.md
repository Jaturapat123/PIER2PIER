# HANDOFF — สถานะโครงงาน jekcloud (Port WMS)

> อัปเดต: 6 ก.ย. 2569 · อ่านไฟล์นี้ก่อนทำงานต่อ

## 1. งานนี้คืออะไร

ระบบ **Port Warehouse Management System (WMS)** ของกลุ่ม Pier2Pier (J3K) — เว็บ multi-tier
พร้อม deploy ลง AWS สำหรับวิชา Cloud Computing 1/2569

โจทย์เดิมจากผู้ใช้ (ครบทุกข้อ ทำเสร็จหมดแล้ว):
1. mockup หน้าเว็บสำหรับนำเสนอ → ทำเป็น **แอปรันได้จริง** ไม่ใช่ภาพนิ่ง
2. report `.md` ว่าใช้ AWS service อะไร ทำไม + feature ที่จำเป็น → `docs/AWS_Services_Report.md`
3. use case จาก `Copy of ส่งหัวข้อโครงงาน - September 1, 12_35 PM.docx` → 15 UC ครบ
4. หาข้อมูลจากเน็ตมาสนับสนุนว่าควรปรับ feature ตรงไหน → §7 ของรายงาน (7 ข้อ มีอ้างอิง)
5. source code อยู่ใน folder `jekcloud` · พร้อม deploy ลง AWS

## 2. ⚠️ โดเมนไม่ตรงกับ CLAUDE.md — อ่านให้ดี

`cloud/CLAUDE.md` §9 บอกว่า "ปัจจุบันยึด **E-Commerce** ตาม docx"
แต่ **โค้ดใน jekcloud ทั้งหมดเป็น Port WMS** (จองเที่ยวเรือ / ตู้คอนเทนเนอร์ / ลานตู้)
เพราะไฟล์ use case ที่ผู้ใช้ชี้ให้ใช้ (`Copy of ส่งหัวข้อโครงงาน...docx`) เป็นธุรกิจท่าเรือ

การแมป UC ยังตรงกัน 1:1 — Product→Service/Schedule, Cart→Booking(pending), Order→Shipment Order
**ถ้าจะแก้ CLAUDE.md ให้ตรงกับของจริง ต้องถามผู้ใช้ก่อน**

## 3. สถานะ: เสร็จแล้ว ✅

| ส่วน | สถานะ |
|---|---|
| Backend (Express + mysql2 + JWT) | 15 UC ครบ · 31 เทสต์ผ่าน |
| Frontend (React+Vite+TS+Tailwind) | 20+ หน้า · tsc + build ผ่าน |
| DB (MySQL 8, 11 ตาราง) | migration + seed idempotent |
| Terraform (7 modules) | `fmt` + `validate` ผ่าน |
| GitHub Actions | ci.yml · deploy.yml · rollback.yml |
| docker-compose (2 API + nginx LB) | จำลอง ALB ได้ ทดสอบ failover ได้ |
| รายงาน | `docs/AWS_Services_Report.md` 13 หัวข้อ + 14 อ้างอิง |

**บั๊กที่ /scrutinize เจอ 11 ข้อ (2 รอบ) แก้ครบแล้ว** — รายละเอียดใน รายงาน §9.6

## 4. ❌ สิ่งที่ยังไม่ได้ทำ / ยังไม่ได้พิสูจน์

1. **`terraform apply` ยังไม่เคยรันกับ AWS จริง** — เครื่องนี้ไม่มี credential
   ตรวจแค่ `fmt` + `validate` เท่านั้น อย่าเคลมว่า deploy ได้แล้ว
2. ก่อน deploy ต้องทำ 2 อย่าง:
   - สร้าง IAM role ที่ trust GitHub OIDC provider (`token.actions.githubusercontent.com`)
   - ตั้ง GitHub secret `AWS_DEPLOY_ROLE_ARN`
3. **บั๊กข้อ 6 (migration race)** — ยืนยันจากการอ่านโค้ดเท่านั้น รันสองกระบวนการพร้อมกันแล้ว
   ทำให้ล้มเหลวจริงไม่ได้ ล็อก `GET_LOCK` ที่ใส่ไปเป็นการป้องกันเชิงโครงสร้าง
   **ห้ามเขียนในรายงานว่าเป็นบั๊กที่ทำซ้ำได้**
4. ยังไม่มี screenshot จาก AWS Pricing Calculator (Stage 3 ต้องใช้ 10 คะแนน)

## 5. ข้อเสนอที่ผู้ใช้ยังไม่ตอบ (อย่าเริ่มเองถ้าไม่สั่ง)

- เขียนสคริปต์พูดสำหรับสาธิต 4 ฉาก
- ไล่ขั้นตอน `terraform apply` ขึ้น AWS จริง

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
3. CloudFront เป็น **ทางเข้าเดียว** ทั้ง web และ API — frontend เรียก API ด้วย relative path
   (ถ้ากลับไป build ด้วย `VITE_API_BASE_URL=http://<ALB>` จะเกิด mixed content ระบบพังทั้งระบบ)
4. SPA routing ใช้ **CloudFront Function** ห้ามใช้ `custom_error_response` (มันครอบทั้ง distribution
   ทำให้ API 404 กลายเป็น index.html)
5. description ของ Security Group rule ใน Terraform **ต้องเป็น ASCII** — AWS ปฏิเสธภาษาไทย
