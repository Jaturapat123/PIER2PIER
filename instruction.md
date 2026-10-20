# instruction.md — ย้ายโครงงานขึ้น AWS Academy Learner Lab

> บันทึกเมื่อ **14 ต.ค. 2569** · ทุกข้อในหัวข้อ 2 ตรวจจากบัญชี Learner Lab จริงด้วย console และ AWS CLI
> ไฟล์นี้คือแหล่งข้อมูลหลักของสถาปัตยกรรมปัจจุบัน ถ้าขัดกับ `CLAUDE.md` หรือ `HANDOFF.md` ให้ยึดไฟล์นี้

---

## 1. เกิดอะไรขึ้น

อาจารย์สั่งให้ implement บน **AWS Academy Learner Lab** แทนบัญชี AWS ปกติ และให้แก้สถาปัตยกรรม 3 เรื่อง

1. ให้ EC2 ต่อกับ RDS ใน AZ ของตัวเอง
2. ห้ามเก็บ username + password ไว้ใน cache
3. CloudFront ใช้ใน Learner Lab ไม่ได้ ให้เอาออก

ข้อ 3 ยืนยันแล้วว่าจริง · ข้อ 2 รับมาเป็นกฎของระบบ · **ข้อ 1 ทำตามตัวอักษรไม่ได้** เหตุผลอยู่ในหัวข้อ 5.1

---

## 2. ข้อเท็จจริงที่ยืนยันจากบัญชีจริง

### 2.1 CloudFront — ใช้ไม่ได้ ยืนยันแล้ว

เปิด CloudFront console ในบัญชีแล็บ ขึ้น error ตรงๆ

```
Failed to load distributions: User: arn:aws:sts::<account>:assumed-role/voclabs/user...@kmitl.ac.th
is not authorized to perform cloudfront:ListDistributions
because no identity-based policy allows the cloudfront:ListDistributions action
```

และรายการบริการใน readme ของแล็บ **ไม่มี CloudFront** (มีแต่ CloudShell, CloudTrail, CloudWatch)

### 2.2 บริการที่ยืนยันว่าใช้ได้

| บริการ | หลักฐาน |
|---|---|
| ElastiCache | console เปิดได้ ไม่มี error |
| WAF (regional) | console เปิดได้ Web ACL 0 ตัว |
| RDS | console ปกติ ยังไม่มี database |
| EC2 | console ปกติ ยังไม่มี instance |
| S3 · ECR · ELB · SSM · CloudWatch · SNS · VPC · Secrets Manager · ACM · Route 53 | อยู่ในรายการ readme |

### 2.3 RDS รองรับอะไรบ้าง

```
aws rds describe-orderable-db-instance-options --engine mysql \
  --db-instance-class db.t3.micro --region us-east-1 \
  --query "OrderableDBInstanceOptions[0].[EngineVersion,MultiAZCapable,ReadReplicaCapable]"

→ [ "5.7.44-rds.20250213", true, true ]
```

MySQL 8.0 ล่าสุดที่ใช้กับ `db.t3.micro` ได้: **8.0.46-rds.20260908**
→ `engine_version = "8.0"` ใน Terraform ใช้ได้ ไม่ต้องแก้

**Multi-AZ และ read replica รองรับทั้งคู่** (readme ฉบับเก่าปี 2021 เคยห้าม Multi-AZ แต่ฉบับปัจจุบันไม่มีบรรทัดนั้นแล้ว)

### 2.4 S3 — ทำ static website hosting ได้

Block Public Access ระดับบัญชี **ปิดอยู่ทั้ง 4 ข้อ** จึงตั้ง bucket policy ให้อ่านสาธารณะได้

### 2.5 IAM — สร้าง role เองไม่ได้ ยืนยันแล้ว

```
aws iam list-open-id-connect-providers
→ { "OpenIDConnectProviderList": [] }

aws iam get-instance-profile --instance-profile-name LabInstanceProfile
→ { "profile": "LabInstanceProfile", "roles": ["LabRole"] }

aws iam list-attached-role-policies --role-name LabRole
→ VocLabPolicy1 / VocLabPolicy2 / VocLabPolicy3
   AmazonSSMManagedInstanceCore
   AmazonEC2ContainerRegistryReadOnly
   AmazonEKSClusterPolicy
   AmazonEKSWorkerNodePolicy
```

Trust policy ของ `LabRole` ยอมให้หลายสิบ service สวมบทบาทได้ (เห็น `ec2`, `s3`, `ssm`, `logs`, `cloudformation`, `apigateway`, `elasticbeanstalk`, `sagemaker`, `dynamodb` …)

**สองตัวที่โครงงานต้องใช้มีครบ** — `AmazonSSMManagedInstanceCore` (Session Manager + ดึง SSM parameter) และ `AmazonEC2ContainerRegistryReadOnly` (`docker pull` จาก ECR)

### 2.6 งบประมาณ

บัญชีที่ใช้ทำงานที่ 4 แสดงวงเงิน **US$50** บนหน้าแล็บ (ต่างจากตัวเลข $100 ใน readme); ตรวจยอดใช้จริงใหม่ทุก session

---

## 3. ข้อจำกัดของ Learner Lab ที่ต้องจำ

| เรื่อง | รายละเอียด |
|---|---|
| Region | **us-east-1 / us-west-2 เท่านั้น** เปิด console region อื่นจะขึ้น access error |
| EC2 | instance type nano–large · พร้อมกันไม่เกิน **9 เครื่อง** และไม่เกิน **32 vCPU** · **ถ้าถึง 20 เครื่อง บัญชีถูกปิดและลบของทั้งหมดทันที** |
| EC2 หลังจบ session | ถูก stop แล้ว **start ให้เองรอบหน้า** · public IP เปลี่ยนทุกครั้งถ้าไม่ผูก Elastic IP |
| RDS | type nano–medium (burstable) · gp2 ไม่เกิน 100 GB · **ต้องปิด enhanced monitoring** · **จบ session แล้วแล็บไม่หยุด RDS ให้** มันเดินกินงบต่อ |
| IAM | สร้าง user / group / role ไม่ได้ (ยกเว้น service-linked) · ใช้ `LabRole` + `LabInstanceProfile` ที่เตรียมไว้ |
| งบ | บัญชีที่ใช้ทำงานที่ 4 แสดงวงเงิน **$50**; ตรวจตัวเลขบนหน้าแล็บของบัญชีตนเองก่อน apply |
| ตัวกินงบ | readme ระบุเอง: EC2, RDS, **NAT Gateway**, SageMaker, EMR/ECS/EKS, Elastic Beanstalk |
| Reset lab | ลบทุกอย่างถาวร แต่ **ไม่ล้างงบ** |

---

## 4. ข้อมูลที่ยังไม่ได้ยืนยัน

- งานที่ 4 พิสูจน์แล้วว่า `terraform apply` สร้างระบบได้จริง, RDS `MultiAZ=true`, EC2 สอง AZ และหน้าเว็บล็อกอินผ่าน ALB ได้; destroy แล้ว — ดู `results/task4/verification.md`
- ไม่รู้ว่าแล็บยอมให้สร้าง ElastiCache node type ไหนบ้าง
- EC2 ดึง SSM Parameter ของโครงงานได้จริงระหว่างบูตทั้งสองเครื่อง
- **LabRole เขียน CloudWatch Logs ได้หรือไม่ — ยังไม่รู้ และเช็กล่วงหน้าไม่ได้**
  `user-data.sh:89-92` รัน container ด้วย `--log-driver awslogs` ซึ่งต้องมีสิทธิ์ `logs:CreateLogGroup` / `CreateLogStream` / `PutLogEvents`
  ของเดิมได้สิทธิ์นี้จาก `CloudWatchAgentServerPolicy` ที่แปะกับ role ของเราเอง แต่ตอนนี้ลบออกแล้วเพราะสร้าง role ไม่ได้
  policy ที่แปะกับ LabRole แบบมีชื่อ (SSMManagedInstanceCore, ECR ReadOnly, EKS ×2) **ไม่มีสิทธิ์ logs**
  เหลือความหวังที่ `VocLabPolicy1-3` แต่ **อ่านเนื้อ policy ไม่ได้** — `iam:GetPolicy` โดน explicit deny
  `user-data.sh` มี fallback ไป `json-file` ถ้า awslogs ใช้ไม่ได้; งานที่ 4 ยืนยันว่า container ขึ้นและ health ผ่าน แต่ยังไม่ได้ตรวจ log stream โดยตรง

---

## 5. การตัดสินใจที่ล็อกแล้ว

### 5.1 RDS → Multi-AZ · EC2 ทั้งสองต่อ endpoint เดียว

คำสั่งอาจารย์ "ให้ EC2 ต่อ RDS ใน AZ ตัวเอง" **ทำตามตัวอักษรไม่ได้** เพราะ standby ของ RDS Multi-AZ แบบปกติ **เชื่อมต่อไม่ได้เลย ทั้งอ่านและเขียน** มันเป็นสำเนาระดับ storage ที่รอสลับเท่านั้น

ทางเลือกที่พิจารณา

| | ผล | ตัดสิน |
|---|---|---|
| Multi-AZ + ต่อ endpoint เดียว | ได้ HA + ได้ผลทดลอง DB failover เพิ่ม | **เลือก** |
| Single-AZ + read replica ที่ AZ-b | ตรงตัวอักษรที่สุด แต่ต้องแก้ `db/pool.js` และทุกจุดที่อ่าน DB | ไม่เลือก — เวลาไม่พอ เก็บเป็นข้อเสนอในบทสรุป |
| Single-AZ เฉยๆ | ถูกสุด แต่ไม่ตอบอะไรเลย | ไม่เลือก |

**หลักการ "อยู่ AZ ตัวเอง" ของอาจารย์เอาไปใช้กับ NAT Gateway แทน** ซึ่งเป็นจุดที่มันใช้ได้จริง

### 5.2 ทางเข้าเว็บ → S3 static website hosting

CloudFront หายไป จึงใช้ S3 static website hosting ตรงๆ

- Index document `index.html` · **Error document `index.html`** ← แทน CloudFront Function ที่ทำ SPA routing
- endpoint: `http://<bucket>.s3-website-us-east-1.amazonaws.com`
- **S3 website endpoint ไม่รองรับ HTTPS** เอกสาร AWS แนะนำให้ใช้ CloudFront ถ้าต้องการ ซึ่งเราใช้ไม่ได้ → **ทั้งระบบเป็น HTTP**
- ErrorDocument คืน **HTTP 404** พร้อมเนื้อหา `index.html` หน้าเว็บทำงานได้แต่ status code ไม่ใช่ 200 ต้องเขียนตามจริงในรายงาน

ที่ไม่เลือก: ให้ Express เสิร์ฟ static เอง — ต้องแก้ backend + Dockerfile + ยุบ job deploy-frontend และ S3 จะหลุดจากสถาปัตยกรรม

### 5.3 หน้าเว็บรู้ที่อยู่ API ยังไง → ฝังตอน build

`deploy.yml` ส่ง `VITE_API_BASE_URL=http://<alb-dns>` ตอน `npm run build` ไม่ต้องแตะโค้ดแอป
ผลพ่วง: ต้องตั้ง `CORS_ORIGINS` เป็น endpoint ของ S3 เพราะคนละ hostname แล้ว

### 5.4 NAT Gateway → 2 ตัว ตัวละ AZ

เอกสาร AWS ระบุให้สร้าง NAT ในทุก AZ แล้ว route ให้ทรัพยากรใช้ NAT ใน AZ ตัวเอง ถ้าใช้ตัวเดียวข้าม AZ เมื่อ AZ นั้นล่ม เครื่องในอีก AZ จะออกอินเทอร์เน็ตไม่ได้

### 5.5 ElastiCache → สร้างจริง node เดียว

เงื่อนไขที่ต้องทำให้ครบ ไม่งั้นอย่าสร้าง

1. ต้องมี cache-aside จริง: `GET /services`, `GET /schedules`, และ `report.service.js` · invalidate เมื่อ admin แก้ข้อมูล
2. **ต้อง fail-open** — node เดียวคือ single point of failure ใหม่ ถ้า Redis ล่มแล้วระบบล่มตามคือทำสถาปัตยกรรมแย่ลง
3. **ห้ามเก็บ JWT / รหัสผ่าน / session** ตามคำสั่งอาจารย์ และตรงกับกฎ stateless เดิม

ของแถม: วัด latency ก่อน/หลังเปิด cache → ได้ผลการทดลองชิ้นที่สาม

### 5.6 VPC Interface Endpoints → ตัดทิ้ง

6 endpoint × 2 AZ × ~$0.01/ชม. ≈ $86/เดือน **แพงกว่า NAT ทั้งสองตัวรวมกัน** และซ้ำซ้อนเมื่อมี NAT ครบทุก AZ
เก็บไว้แค่ **S3 Gateway Endpoint ซึ่งไม่คิดเงิน** และตัด traffic ก้อนใหญ่สุด (image layer ของ ECR ที่เก็บบน S3) ออกจากค่า data processing ของ NAT

### 5.7 วิธีใช้งบ

**ไม่เปิดทิ้งไว้** เปิดเฉพาะตอนทำงานและตอนเก็บผลการทดลอง แล้ว `terraform destroy`
ตั้งใจจะ **reset lab แล้ว config ใหม่ช่วงใกล้วันนำเสนอ** → ต้องเผื่อเวลาตั้ง GitHub Secrets ใหม่ด้วย (ดู 6.3)

---

## 6. สถาปัตยกรรมปัจจุบัน

ไฟล์ผัง: `jekcloud/docs/diagrams/06_AWS_Architecture.drawio`

```
ผู้ใช้ ──→ S3 static website                       (หน้าเว็บ · HTTP)
ผู้ใช้ ──→ WAF ──→ ALB ──┬─→ EC2 #1 (us-east-1a)   (/api/* · HTTP :80)
                          └─→ EC2 #2 (us-east-1b)
                                   │
                        ทั้งคู่ต่อ RDS endpoint เดียวกัน
                                   ↓
                   RDS MySQL primary (us-east-1a, private db subnet)
                        ⇠ ⇠ dashed: synchronous replication ⇢ ⇢
                   RDS standby (us-east-1b) — ไม่รับ query

EC2 #1 → NAT A (us-east-1a) → IGW        EC2 #1, #2 → ElastiCache (node เดียว)
EC2 #2 → NAT B (us-east-1b) → IGW        EC2 → S3 Gateway Endpoint (ฟรี)
EC2 → CloudWatch → SNS → อีเมลผู้ดูแล    EC2 → SSM Parameter Store

Developer → GitHub → GitHub Actions → ECR → EC2 (ผ่าน SSM Send Command)
LabRole + LabInstanceProfile → EC2
```

### 6.1 endpoint ของ RDS คืออะไร

เป็น **ชื่อ DNS** ที่ RDS ออกให้ เช่น `pier2pier-mysql.c9xk2mabcd.us-east-1.rds.amazonaws.com`
ไม่ใช่ IP และไม่ใช่เครื่องใดเครื่องหนึ่ง แต่เป็นป้ายชื่อที่ชี้ไปยังเครื่องที่เป็น primary อยู่ขณะนั้น

Terraform มี output สองตัวที่สับสนง่าย (`modules/database/main.tf:102-103`)

| output | ค่า |
|---|---|
| `.address` | `...rds.amazonaws.com` — host ล้วน ✅ โค้ดเราใช้ตัวนี้ |
| `.endpoint` | `...rds.amazonaws.com:3306` — มีพอร์ตติดมา ❌ ถ้าใช้ตัวนี้แอปจะต่อ DB ไม่ได้ |

### 6.2 failover ทำงานยังไง

**อัตโนมัติทั้งหมด RDS ทำเอง ไม่มีโค้ดส่วนไหนสั่ง** Terraform เกี่ยวข้องแค่บรรทัดเดียวตอนสร้าง คือ `multi_az = var.multi_az` (`modules/database/main.tf:82`) ซึ่งรับค่ามาจาก `db_multi_az`

```
T+0s      primary ใน us-east-1a ตาย (หรือสั่ง Reboot with failover)
T+0–5s    connection ใน pool ขาดทั้งหมด · request ที่ค้าง error · tx() rollback
T+0–120s  RDS เลื่อน standby เป็น primary แล้วแก้ DNS ของ endpoint
          ระหว่างนี้ /health ของ EC2 ทั้งสองเครื่องไม่ผ่านพร้อมกัน (ใช้ DB ตัวเดียวกัน)
          → ALB ไม่เหลือ target ที่ healthy → ตอบ 503
T+60–120s DNS ชื่อเดิมชี้ไปเครื่องใน us-east-1b · pool สร้าง connection ใหม่
          /health ผ่าน → ALB คืน target เข้า rotation → ระบบกลับมา
ต่อจากนั้น AWS ทำให้คู่ Multi-AZ กลับมาครบเอง
```

เวลา 60–120 วินาทีมาจากเอกสาร AWS · **เวลาจริงต้องวัดเอง เป็นหลักฐานของ Stage 3**

สิ่งที่ต้องรู้ก่อนสาธิต: ช่วง failover ระบบ **ดับทั้งระบบ** ถึงจะมี EC2 สองเครื่อง เพราะ `/health` ต้อง query DB ตามกฎเหล็กข้อ 5 (`backend/src/db/pool.js:62`) — ไม่ใช่บั๊ก Multi-AZ ทำ HA ให้ฐานข้อมูล ไม่ได้ทำ zero-downtime ให้ทั้งระบบ

### 6.3 LabRole กับ LabInstanceProfile ทำงานยังไง

- **IAM Role** = ชุดสิทธิ์ + trust policy
- **Instance Profile** = ภาชนะที่ห่อ role ไว้ 1 ตัว เพื่อให้แปะกับ EC2 ได้ — **EC2 แปะ role ตรงๆ ไม่ได้ ต้องผ่าน instance profile เสมอ** (console สร้างให้อัตโนมัติจนมองไม่เห็น แต่ Terraform ต้องทำเอง)

ลำดับการทำงานตอน EC2 บูต

```
1. launch EC2 พร้อม iam_instance_profile = LabInstanceProfile
2. EC2 ถาม metadata service 169.254.169.254 → ได้ credential ชั่วคราวของ LabRole (AWS หมุนให้เอง)
3. user-data.sh:27  aws ssm get-parameter --with-decryption  → DB_PASSWORD, JWT_SECRET
                    เขียนลง /etc/pier2pier.env แล้ว chmod 600
4. user-data.sh:56  aws ecr get-login-password | docker login → docker pull <ecr>:<git-sha>
5. docker run --env-file /etc/pier2pier.env   แอปฟังพอร์ต 3000
6. ALB ยิง GET /health → ping() ยิง SELECT 1 ไป RDS → 200 → ALB ส่ง traffic เข้า
```

ขั้นที่ 2 คือเหตุผลที่กฎ "ห้าม hardcode credentials" ทำได้จริง — SDK หา credential ตามลำดับ env → `~/.aws` → metadata service

**สิ่งที่เสียไป:** ของเดิมมี `aws_iam_role_policy` จำกัดให้อ่านได้เฉพาะ parameter ภายใต้ path ของโครงงาน (least privilege) ใช้ LabRole แล้วทำไม่ได้ ต้องเขียนเป็นข้อจำกัดในรายงานว่าระบบจริงจะสร้าง role เฉพาะกิจแทน

### 6.4 ทำไม GitHub Actions OIDC ใช้ไม่ได้

OIDC ต้องการสองอย่างใน IAM

1. สร้าง **OIDC identity provider** ของ `token.actions.githubusercontent.com`
2. สร้าง **IAM role** ที่ trust provider นั้น แล้ว workflow เรียก `sts:AssumeRoleWithWebIdentity`

Learner Lab บล็อกทั้งคู่ และ `list-open-id-connect-providers` คืนค่าว่าง

**ใช้แทน:** กด `AWS Details` บนหน้าแล็บ → ได้ `aws_access_key_id`, `aws_secret_access_key`, `aws_session_token` → ใส่ GitHub Secrets 3 ตัว
**หมดอายุทุกครั้งที่ session จบ ต้องแปะใหม่ก่อนสาธิตเสมอ**

---

## 7. ค่าใช้จ่าย

อัตรา us-east-1 · คิดที่ 264 ชั่วโมง (11 วันแบบเปิด 24/7) เพื่อดูเพดานที่แย่ที่สุด

| รายการ | อัตรา | 11 วัน 24/7 |
|---|---|---|
| NAT Gateway ×2 | $0.045/ชม./ตัว + $0.045/GB | $23.8 |
| ALB | $0.0225/ชม. + LCU | ~$6.5 |
| RDS Multi-AZ db.t3.micro | $0.017/ชม. ×2 + storage | ~$10.7 |
| EC2 t3.micro ×2 | $0.0104/ชม. ×2 | ~$6.1 |
| ElastiCache cache.t3.micro | $0.017/ชม. | $4.5 |
| WAF | $5/เดือน/web ACL + $1/rule + $0.60/ล้าน request | ~$3 |
| S3 · ECR · CloudWatch | | ~$1 |
| **รวม** | | **~$56** |

เปิดจริงแค่ตอนทำงานประมาณวันละ 6 ชม. → ประมาณ **$14 ทั้งงาน**
ตัวเลขชุดนี้ใช้ทำตารางที่ 3.4/3.5 และ screenshot จาก AWS Pricing Calculator ที่ Stage 3 ต้องการได้เลย

---

## 8. กฎเหล็กที่ต้องเขียนใหม่

`CLAUDE.md` §3 และ `HANDOFF.md` §8 มีกฎที่ใช้ไม่ได้แล้ว

| กฎเดิม | ต้องเปลี่ยนเป็น |
|---|---|
| CloudFront เป็นทางเข้าเดียวทั้ง web และ API · frontend เรียก API ด้วย relative path | ไม่มี CloudFront · หน้าเว็บอยู่ที่ S3 website endpoint · API อยู่ที่ ALB · frontend ฝัง `VITE_API_BASE_URL` ตอน build · ต้องตั้ง CORS |
| SPA routing ใช้ CloudFront Function ห้ามใช้ custom_error_response | SPA routing ใช้ **ErrorDocument = index.html** ของ S3 website hosting |
| ระวัง mixed content ถ้า build ด้วย `VITE_API_BASE_URL=http://<ALB>` | ไม่มีปัญหานี้แล้วเพราะทั้งระบบเป็น HTTP — แต่ต้องเขียนในรายงานว่าไม่มี HTTPS เป็นข้อจำกัด |

กฎที่ยังใช้ได้เหมือนเดิม: stateless (JWT + DB) · `SELECT ... FOR UPDATE` กันจองซ้อน · `/health` ต้อง query DB · ห้าม hardcode credentials · SG description ต้องเป็น ASCII · EC2 ต้องคนละ AZ

---

## 9. แผนงานหลังจากนี้

เรียงตามลำดับที่ต้องทำ งานหลังต้องรองานก่อน

### ✅ งานที่ 1 — Terraform: network + สิทธิ์ + region (เสร็จ 14 ต.ค.)

- `modules/network` : NAT 2 ตัว (`count = length(var.availability_zones)`) · แยก `aws_route_table.private` เป็นใบละ AZ · ผูก `private_app[i]` และ `private_db[i]` เข้ากับ route table ของ AZ ตัวเอง · S3 endpoint ผูกกับ route table ทุกใบ
- `modules/compute` : ลบ `aws_iam_role.instance`, `aws_iam_role_policy_attachment` ×3, `aws_iam_role_policy.ssm_params`, `aws_iam_instance_profile.this` → ใช้ `data "aws_iam_instance_profile" "lab" { name = "LabInstanceProfile" }`
- `variables.tf` : `aws_region` → `us-east-1` · `availability_zones` → `["us-east-1a","us-east-1b"]`
- `terraform.tfvars.example` : `db_multi_az = true`

**เสร็จเมื่อ** `terraform fmt -check` และ `terraform validate` ผ่าน และ `terraform plan` ไม่มี resource `aws_iam_*` เหลืออยู่

**ผลจริง** ติดตั้ง Terraform v1.16.5 (`winget install --id Hashicorp.Terraform -e`) แล้วรันเมื่อ 14 ต.ค.
`terraform fmt -recursive -check` → exit 0 · `terraform validate` → `Success! The configuration is valid.`
ส่วน `terraform plan` ยังรันไม่ได้เพราะต้องมี credential ของแล็บ — ตรวจแทนด้วยการค้นคำว่า
`resource "aws_iam` ใน `infra/` แล้วไม่พบเหลือ

### ✅ งานที่ 2 — Terraform: เปลี่ยน CloudFront เป็น S3 website (เสร็จ 14 ต.ค.)

- `modules/frontend_cdn` : ลบ `aws_cloudfront_distribution`, `aws_cloudfront_origin_access_control`, `aws_cloudfront_function` → เหลือ `aws_s3_bucket` + `aws_s3_bucket_website_configuration` (index + error = `index.html`) + bucket policy แบบ public read + ปิด block public access ของ bucket
- เปลี่ยนชื่อ module เป็น `frontend_web`
- `main.tf` : `cors_origins` → endpoint ของ S3 website
- `outputs.tf` : ลบ `cloudfront_domain`, `cloudfront_distribution_id` → เพิ่ม `web_endpoint`

**เสร็จเมื่อ** `terraform validate` ผ่าน และไม่มีคำว่า `cloudfront` เหลือใน `infra/`

**ผลจริง** `terraform validate` → `Success!` · ไม่มี resource/data ของ CloudFront เหลือใน `infra/`
(คำว่า CloudFront ที่ยังค้นเจอเป็นคอมเมนต์อธิบายว่าทำไมต้องเอาออก ซึ่งตั้งใจเก็บไว้ใช้เขียนรายงาน)

**เพิ่มเติมที่ไม่ได้อยู่ในแผนเดิม** bucket policy ให้ `s3:ListBucket` แบบ public ด้วย ไม่ใช่แค่ `s3:GetObject`
เพื่อให้ได้ status **404** ไม่ใช่ 403 ตอนหาไฟล์ไม่เจอ (ไม่มี ListBucket S3 จะตอบ 403
เพื่อไม่เปิดเผยว่าไฟล์นั้นมีอยู่จริงหรือไม่)

> ⚠️ **แก้ข้อความเดิมที่อ้างเกินหลักฐาน (พบตอน scrutinize 14 ต.ค.)**
> เดิมเขียนว่า "ถ้าไม่มี ListBucket → ErrorDocument ไม่ถูกส่งกลับ → SPA routing พังทั้งหมด" — **ไม่จริง**
> เอกสาร AWS ระบุว่า custom error document ถูกส่งกลับสำหรับ **4XX ทั้งคลาส ซึ่งรวม 403**
> `ListBucket` จึงมีผลต่อ **เลข status เท่านั้น** ไม่ใช่ตัวตัดสินว่าได้ `index.html` หรือไม่
> https://docs.aws.amazon.com/AmazonS3/latest/userguide/CustomErrorDocSupport.html

**ยืนยันกับ bucket จริงในงานที่ 4 แล้ว** — deep route ได้ HTTP 404 และเนื้อหา `index.html`

```bash
curl -i http://<web_endpoint>/route/ที่ไม่มีไฟล์จริง
```

ถ้าได้ 403 พร้อมเนื้อ `index.html` → **ถอด `s3:ListBucket` ออกได้** ได้ least privilege กลับมา
และไม่ต้องเปิดให้คนทั่วไป list ไฟล์ใน bucket

ข้อแลกเปลี่ยนของการคงไว้: ใคร ๆ ก็เรียกดูรายชื่อไฟล์ใน bucket ได้ — ห้ามเอาไฟล์ที่ไม่ควรเปิดเผยไปวางใน bucket นี้

**เพิ่ม `aws_s3_bucket_ownership_controls` = `BucketOwnerEnforced`** ปิด ACL ทั้งหมด ให้สิทธิ์มาจาก bucket policy ที่เดียว

### ✅ งานที่ 3 — GitHub Actions (เสร็จ 14 ต.ค.)

- `deploy.yml` และ `rollback.yml` : เปลี่ยน `role-to-assume` เป็น `aws-access-key-id` + `aws-secret-access-key` + `aws-session-token`
- `deploy.yml` job build frontend : ใส่ `VITE_API_BASE_URL` จาก output ของ Terraform
- ลบ step `ล้าง cache ของ CloudFront`
- `AWS_REGION` : `ap-southeast-1` → `us-east-1`

**เสร็จเมื่อ** workflow ผ่าน job ทดสอบ และ job build หยุดที่ขั้นตอน AWS อย่างมีเหตุผล (ยังไม่ได้ตั้ง secrets)

**ผลจริง — ตรวจได้เท่านี้ยังไม่ได้รัน workflow**

- YAML ทั้งสามไฟล์ parse ผ่าน (`yaml.safe_load`) · deploy 4 job · rollback 1 job · ci 3 job
- `secrets.*` ที่อ้างถึงเหลือสามตัวพอดี: `AWS_ACCESS_KEY_ID` `AWS_SECRET_ACCESS_KEY` `AWS_SESSION_TOKEN`
- ไม่มี `role-to-assume` / `AWS_DEPLOY_ROLE_ARN` / `permissions: id-token` / `ap-southeast` เหลือ
- **พิสูจน์กลไก `VITE_API_BASE_URL` แล้ว** — build ด้วย
  `VITE_API_BASE_URL=http://verify-alb-probe...` แล้วค้นใน `dist/assets/index-*.js` พบค่านั้นฝังอยู่ 1 จุด
  ยืนยันว่า Vite แทนค่าตอน build จริง และ**เปลี่ยนที่อยู่ API ทีหลังโดยไม่ build ใหม่ไม่ได้**
  (build ใหม่แบบไม่ใส่ตัวแปรเพื่อล้างค่า probe ออกแล้ว)
- **ยังไม่ได้รัน workflow บน GitHub** — ต้องใส่ credential ของ lab session ใหม่ใน GitHub Secrets แล้วทดสอบในงานที่ 5

**ไม่ได้อยู่ในแผนเดิมแต่แก้ไปด้วย**

- `ci.yml` : `terraform_version` `1.9.8` → `1.16.5` ให้ตรงกับที่ติดตั้งบนเครื่อง
  ไม่งั้น `terraform fmt -check` อาจผ่านบนเครื่องแต่ fail ใน CI เพราะกฎจัดรูปแบบต่างเวอร์ชันกัน
- `deploy.yml` : เพิ่ม step `สรุปที่อยู่หน้าเว็บ` แทนที่ step ล้าง cache ที่ลบไป
  ให้ job summary บอกที่อยู่หน้าเว็บและที่อยู่ API ที่ฝังไว้ — ใช้เป็นหลักฐาน Stage 3 ได้เลย
- `deploy.yml` : `VITE_API_BASE_URL` อ่านจาก `aws elbv2 describe-load-balancers` สด ๆ ตอน deploy
  ไม่ได้อ่านจาก Terraform output ตามที่แผนเขียนไว้ เพราะ CI ไม่มี state ของ Terraform
  ค่าที่ได้เหมือนกัน แต่วิธีนี้ทนต่อการ destroy/apply ใหม่ซึ่งทำบ่อยในแล็บ (DNS ของ ALB เปลี่ยนทุกครั้ง)

### ✅ งานที่ 4 — apply จริงครั้งแรก (เสร็จ 14 ต.ค.)

- `terraform apply` ในแล็บ → เก็บ `alb_dns_name`, `web_endpoint`, `ecr_repository_url`
- ตรวจว่า Multi-AZ สร้างได้จริง (ข้อที่ยังไม่ยืนยันในหัวข้อ 4)
- `terraform destroy` ทันทีที่เก็บหลักฐานพอ

**เสร็จเมื่อ** เปิดหน้าเว็บจาก S3 endpoint แล้วล็อกอินผ่าน ALB ได้จริง และมี screenshot

**ผลจริง:** `terraform apply` สำเร็จ; RDS Multi-AZ ใช้งานได้; ALB มี target healthy 2 เครื่อง; เว็บ S3 แสดงข้อมูลจาก API และล็อกอินลูกค้าจนเห็น dashboard ได้ จากนั้น `terraform destroy` และลบ bucket ที่ต้องจัดการด้วย AWS CLI สำเร็จ หลักฐานและภาพอยู่ใน [`results/task4/verification.md`](results/task4/verification.md)

### งานที่ 5 — เก็บผลการทดลอง

1. Load balancing — `scripts/loadtest.sh` ชี้ไป ALB จริง
2. Failover ของ EC2 — ปิดเครื่องหนึ่งระหว่างยิง
3. **Failover ของ RDS** — `Reboot with failover` แล้ววัด downtime จริง (ของใหม่ที่ได้จาก Multi-AZ)
4. CI/CD — deploy จริง 1 รอบ และ rollback จริง 1 รอบ

**เสร็จเมื่อ** มีไฟล์ผลใน `results/` และ screenshot ครบทั้ง 4 รายการ

### งานที่ 6 — ElastiCache ในโค้ดแอป (ทำท้ายสุด)

- เพิ่ม cache-aside ที่ `GET /services`, `GET /schedules`, `report.service.js`
- invalidate เมื่อ admin เขียนข้อมูล
- **fail-open** : cache ล่มต้องไปอ่าน DB ต่อได้
- วัด latency เทียบก่อน/หลัง

**เสร็จเมื่อ** เทสต์เดิมทั้งหมดยังผ่าน และมีตัวเลข latency เทียบให้เห็น

> ถ้าเวลาไม่พอ ตัดงานที่ 6 ทิ้งได้โดยไม่กระทบคะแนนหลัก — แต่ต้องเอา ElastiCache ออกจากผังด้วย ไม่ใช่ปล่อยให้มีกล่องที่ตอบไม่ได้ว่าเก็บอะไร

---

## 10. งานเอกสารที่ยังไม่ได้ทำ

ยังไม่แตะไฟล์ `.docx` ทั้งหมด เพราะต้องเปิดใน Word แล้วกด `Ctrl+A → F9` รีเฟรชสารบัญเอง

ต้องแก้ในรายงานรูปเล่ม

- รูปที่ 3.1 — export ใหม่จาก `docs/diagrams/06_AWS_Architecture.drawio`
- หัวข้อสถาปัตยกรรม — ตัด CloudFront ออก เพิ่มเหตุผลว่า Learner Lab ไม่อนุญาต
- ตารางที่ 3.4/3.5 — ใช้ตัวเลขจากหัวข้อ 7 ของไฟล์นี้
- ข้อจำกัดของระบบ (1.3.5) — เพิ่ม ไม่มี HTTPS · ไม่มี least privilege · ระบบดับช่วง DB failover
