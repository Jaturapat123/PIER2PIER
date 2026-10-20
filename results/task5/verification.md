# งานที่ 5: ผลทดสอบ AWS Academy (20 ต.ค. 2026)

ทดสอบกับ `pier2pier-dev` ใน `us-east-1` โดยมี ALB, EC2 สองเครื่องคนละ AZ, RDS MySQL Multi-AZ, ECR และเว็บ S3 ชั่วคราว ภาพ PNG ทุกภาพเป็นภาพหน้าต่าง Chrome จริงที่เห็นแท็บและแถบ URL ชื่อ DNS/instance ในภาพเป็นของรอบแล็บนี้และใช้ไม่ได้หลังทำลายทรัพยากร

## 1. Load balancing

- [ก่อนทดสอบ: `/health`](02-before-loadtest-health.png)
- [ผลสคริปต์ใน Chrome](03-loadtest-result.png) · [ข้อความผล](../loadtest-20261020-160618.txt) · [ข้อมูลดิบ](../loadtest-20261020-160618.raw)
- [หลังทดสอบ: `/health`](04-after-loadtest-health.png)
- `scripts/loadtest.sh` ยิง 200 คำขอ พร้อมกันครั้งละ 10: HTTP 200 ทั้งหมด, EC2 ใน `us-east-1a` 100 คำขอและ `us-east-1b` 100 คำขอ, เวลาตอบเฉลี่ย 0.510 วินาที

## 2. EC2 failover

- [ก่อนหยุด EC2](05-before-ec2-failover.png)
- หยุด `i-071fc62804df7bd1f` ระหว่าง probe; [HTTP 504 ที่ Chrome พบ](06-during-ec2-failover.png) แล้ว [EC2 ที่เหลือตอบ 200](07-ec2-survivor-health.png)
- [ผลสคริปต์ใน Chrome](08-ec2-failover-result.png) · [ข้อความผล](../failover-20261020-160850.txt) · [ข้อมูลดิบ](../failover-20261020-160850.raw) · [หลังเปิดเครื่องกลับ](09-after-ec2-failover.png)
- 113 คำขอ ล้มเหลว 10 คำขอ, ความพร้อมใช้งาน 91.15%; เวลาจาก failure แรกถึงสุดท้าย 39.9 วินาที สคริปต์เปิด EC2 กลับ และตรวจ ALB `healthy` ทั้งสองเครื่องแล้ว ผลนี้แสดงว่า **การหยุดเครื่องแบบทันทีมีช่วงสะดุดจริง**

## 3. RDS Multi-AZ failover

- [ก่อนสั่ง failover: primary `us-east-1b`](10-before-rds-failover.png)
- `scripts/rds-failover-test.ps1` เรียก `reboot-db-instance --force-failover` และ probe `/health` พร้อมกัน: [ผลใน Chrome](12-rds-failover-result.png) · [ข้อความผล](rds-failover-25691020-161356.txt) · [ข้อมูลดิบ](rds-failover-25691020-161356.csv)
- [ภาพคำขอที่ยังตอบ 200 ระหว่างช่วง failover](11-during-rds-failover.png); ภาพหนึ่งคำขอไม่แสดง failure ทั้งหมด จึงใช้ CSV ข้างต้นเป็นหลักฐานการวัด
- [หลังสลับ: primary `us-east-1a`](13-after-rds-failover.png)
- 149 คำขอ, DB health ล้มเหลว 3 ครั้ง, ช่วงสะดุดที่สังเกตได้ 14 วินาที แล้ว health ฟื้นต่อเนื่อง; ALB กลับมา `healthy` ทั้งสองเครื่อง

## 4. CI/CD deploy และ rollback

- Deploy run [#39399832137](https://github.com/Jaturapat123/PIER2PIER/actions/runs/39399832137): [ก่อน](14-before-deploy-actions.png) · [ขณะ rolling deploy](15-deploy-in-progress.png) · [สำเร็จครบ 4 jobs](16-deploy-success.png)
- ตรวจ `/health` ผ่าน ALB 20 ครั้งหลัง deploy: [ผลทั้งสองเครื่อง](18-deploy-both-hosts.png) · [ข้อมูลดิบ](deploy-health-samples.csv) ทุกครั้งเป็น `818feb0`, `dbOk=true` ([หน้า health](17-after-deploy-health.png))
- Rollback run [#39400465065](https://github.com/Jaturapat123/PIER2PIER/actions/runs/39400465065): [ก่อน](19-before-rollback-actions.png) · [สำเร็จ](20-rollback-success.png)
- ตรวจ `/health` ผ่าน ALB 20 ครั้งหลัง rollback: [ผลทั้งสองเครื่อง](22-rollback-both-hosts.png) · [ข้อมูลดิบ](rollback-health-samples.csv) ทุกครั้งเป็น `05e193b`, `dbOk=true` ([หน้า health](21-after-rollback-health.png))
- Deploy ใช้ 2 นาที 52 วินาที; rollback ใช้ 33 วินาที รอบนี้ commit `818feb0` เปลี่ยนเฉพาะสคริปต์ทดสอบ จึงยืนยันกลไก build/deploy/rollback และ version tag แต่ไม่ได้พิสูจน์ความต่างด้านพฤติกรรมของ backend สองเวอร์ชัน

## การทำลายทรัพยากร

- `terraform destroy -auto-approve` สำเร็จ: ลบ 55 resources; Terraform managed state เหลือ 0
- ลบ S3 object versions/delete markers 11 รายการ แล้วลบ bucket `pier2pier-dev-web` ที่อยู่นอก Terraform state
- [ภาพผลตรวจหลังทำลาย](23-cleanup-verified.png) · [ข้อความผลตรวจ](cleanup-verification.txt): RDS, ALB, ECR, S3 และ EIP ไม่เหลือ; EC2 ทั้งสองเครื่องเป็น `terminated`; NAT สองรายการเป็น `deleted`
- `docker logout` จาก ECR แล้ว ลบ credential ชั่วคราวของ AWS Academy และไฟล์ `terraform.tfstate`/`terraform.tfstate.backup` ในเครื่องหลังยืนยันว่า state ว่าง
