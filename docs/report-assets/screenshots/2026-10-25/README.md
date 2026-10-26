# ภาพประกอบรูปเล่ม Pier2Pier

**ชุดภาพจอกว้าง 16:9 ที่เห็นแท็บและแถบ URL:** เปิด [สารบัญภาพจอกว้าง](widescreen/README.md) มีภาพ AWS 33 ภาพและเว็บ Pier2Pier 19 ภาพ พร้อมภาพรวมสำหรับเลือกใช้ในรูปเล่ม

บันทึกภาพวันที่ **25 ตุลาคม 2569** จากระบบที่ deploy บน AWS Academy Learner Lab บัญชี `975143535471` ใน Region `us-east-1` และเว็บ `http://pier2pier-dev-web.s3-website-us-east-1.amazonaws.com/` ภาพทุกภาพใน `aws/` และ `web/` เป็นภาพจากหน้าจอจริงของรอบนี้ ส่วน `historical/` เป็นหลักฐานจากการทดสอบครั้งก่อน ระบุวันที่ในชื่อไฟล์ไว้แล้ว

ภาพที่ถ่ายผ่าน in-app browser บันทึกเฉพาะพื้นที่หน้าเว็บ จึงไม่มีแท็บและแถบ URL อยู่ในตัวภาพ ให้ใช้ URL ที่ระบุในสารบัญนี้ประกอบคำบรรยายรูป ภาพเก่าใน `historical/2026-10-20-home-chrome.png` เป็นตัวอย่างที่มีแท็บและแถบ URL ตามรูปแบบที่ต้องการ อย่านำเสนอภาพเก่าเป็นสถานะปัจจุบัน

## AWS

| ไฟล์ | คำบรรยายที่แนะนำ |
| --- | --- |
| [01-console-home.jpg](aws/01-console-home.jpg) | AWS Console Home ของบัญชีแล็บ |
| [02-ec2-instances.jpg](aws/02-ec2-instances.jpg) | EC2 Application Server สองเครื่องในสถานะ Running |
| [03-load-balancer.jpg](aws/03-load-balancer.jpg) | Application Load Balancer ของ Pier2Pier ในสถานะ Active |
| [04-alb-listener.jpg](aws/04-alb-listener.jpg) | Listener HTTP:80 ของ Application Load Balancer |
| [05-targets-healthy.jpg](aws/05-targets-healthy.jpg) | Target Group มี Application Server สองเครื่องในสถานะ Healthy |
| [06-rds-database.jpg](aws/06-rds-database.jpg) | Amazon RDS MySQL ในสถานะ Available |
| [07-rds-multi-az.jpg](aws/07-rds-multi-az.jpg) | การตั้งค่า RDS MySQL แบบ Multi-AZ |
| [08-vpc-list.jpg](aws/08-vpc-list.jpg) | VPC ของระบบ Pier2Pier |
| [09-vpc-details.jpg](aws/09-vpc-details.jpg) | รายละเอียด VPC และช่วง IPv4 CIDR |
| [09b-vpc-resource-map-left.jpg](aws/09b-vpc-resource-map-left.jpg) | Resource map: VPC และ Subnets สอง Availability Zones |
| [09c-vpc-resource-map-routes.jpg](aws/09c-vpc-resource-map-routes.jpg) | Resource map: Route Tables ของระบบ |
| [09d-vpc-resource-map-connections.jpg](aws/09d-vpc-resource-map-connections.jpg) | Resource map: Internet Gateway, NAT Gateways และ S3 Endpoint |
| [10-subnets.jpg](aws/10-subnets.jpg) | Subnets ของโปรเจกต์ 6 ชุด แยก public, application และ database |
| [11-route-tables.jpg](aws/11-route-tables.jpg) | Route Tables ของ VPC |
| [12-public-routes.jpg](aws/12-public-routes.jpg) | Public Route Table ออกอินเทอร์เน็ตผ่าน Internet Gateway |
| [13-private-routes.jpg](aws/13-private-routes.jpg) | Private Route Table ใช้ NAT Gateway และ S3 Gateway Endpoint |
| [14-nat-gateways.jpg](aws/14-nat-gateways.jpg) | NAT Gateways สอง Availability Zones |
| [15-s3-vpc-endpoint.jpg](aws/15-s3-vpc-endpoint.jpg) | S3 Gateway VPC Endpoint |
| [16-security-groups.jpg](aws/16-security-groups.jpg) | Security Groups สำหรับ ALB, application และ database |
| [17-internet-gateway.jpg](aws/17-internet-gateway.jpg) | Internet Gateway ที่ผูกกับ VPC |
| [18-s3-bucket.jpg](aws/18-s3-bucket.jpg) | S3 Bucket สำหรับโฮสต์หน้าเว็บ |
| [19-s3-objects.jpg](aws/19-s3-objects.jpg) | ไฟล์ `index.html` และโฟลเดอร์ `assets/` ใน S3 Bucket |
| [20-s3-website-config.jpg](aws/20-s3-website-config.jpg) | เปิดใช้ S3 Static Website Hosting พร้อม endpoint ของเว็บ |
| [21-ecr-repository.jpg](aws/21-ecr-repository.jpg) | ECR Repository สำหรับ API Container |
| [22-ecr-images.jpg](aws/22-ecr-images.jpg) | Container image ที่ใช้ deploy API |
| [23-cloudwatch-dashboard.jpg](aws/23-cloudwatch-dashboard.jpg) | CloudWatch Dashboard แสดงคำขอ, Healthy Hosts, latency และฐานข้อมูล |
| [24-cloudwatch-alarms.jpg](aws/24-cloudwatch-alarms.jpg) | CloudWatch Alarms ห้ารายการในสถานะ OK |
| [25-cloudwatch-log-groups.jpg](aws/25-cloudwatch-log-groups.jpg) | Log Group ของ application และ RDS |
| [26-ssm-parameters.jpg](aws/26-ssm-parameters.jpg) | ชื่อพารามิเตอร์ใน SSM Parameter Store; ไม่เปิดเผยค่า SecureString |
| [27-sns-topic.jpg](aws/27-sns-topic.jpg) | SNS Topic สำหรับการแจ้งเตือน |
| [28-ec2-instance-detail.jpg](aws/28-ec2-instance-detail.jpg) | รายละเอียด EC2 Application Server ใน private subnet |

ลิงก์คอนโซลหลัก: [EC2](https://us-east-1.console.aws.amazon.com/ec2/home?region=us-east-1), [RDS](https://us-east-1.console.aws.amazon.com/rds/home?region=us-east-1), [VPC](https://us-east-1.console.aws.amazon.com/vpcconsole/home?region=us-east-1), [S3](https://us-east-1.console.aws.amazon.com/s3/home?region=us-east-1), [ECR](https://us-east-1.console.aws.amazon.com/ecr/home?region=us-east-1), [CloudWatch](https://us-east-1.console.aws.amazon.com/cloudwatch/home?region=us-east-1), [Systems Manager](https://us-east-1.console.aws.amazon.com/systems-manager/home?region=us-east-1), [SNS](https://us-east-1.console.aws.amazon.com/sns/v3/home?region=us-east-1)

## เว็บ Pier2Pier

| ไฟล์ | URL path | คำบรรยายที่แนะนำ |
| --- | --- | --- |
| [01-home.jpg](web/01-home.jpg) | `/` | หน้าแรกและเที่ยวเรือที่เปิดรับการจอง |
| [02-login.jpg](web/02-login.jpg) | `/login` | หน้าเข้าสู่ระบบ |
| [03-register.jpg](web/03-register.jpg) | `/register` | หน้าสมัครสมาชิก |
| [04-customer-dashboard.jpg](web/04-customer-dashboard.jpg) | `/app` | ภาพรวมบัญชีลูกค้า |
| [05-services.jpg](web/05-services.jpg) | `/app/services` | ค้นหาบริการและเที่ยวเรือ |
| [06-new-booking.jpg](web/06-new-booking.jpg) | `/app/bookings/new?scheduleId=1` | เลือกประเภทตู้และรายละเอียดสินค้า |
| [07-booking-review.jpg](web/07-booking-review.jpg) | `/app/bookings/new?scheduleId=1` | ตรวจทานการจองก่อนบันทึก; ยังไม่สร้างรายการ |
| [08-customer-bookings.jpg](web/08-customer-bookings.jpg) | `/app/bookings` | รายการจองของลูกค้าก่อนสร้างรายการตัวอย่าง |
| [09-customer-profile.jpg](web/09-customer-profile.jpg) | `/app/profile` | ข้อมูลส่วนตัวของบัญชีสาธิต |
| [10-admin-dashboard.jpg](web/10-admin-dashboard.jpg) | `/admin` | ภาพรวมระบบสำหรับผู้ดูแล |
| [11-admin-bookings.jpg](web/11-admin-bookings.jpg) | `/admin/bookings` | รายการจองฝั่งผู้ดูแลก่อนสร้างรายการตัวอย่าง |
| [12-admin-services.jpg](web/12-admin-services.jpg) | `/admin/services` | จัดการบริการของท่าเรือ |
| [13-admin-schedules.jpg](web/13-admin-schedules.jpg) | `/admin/schedules` | จัดการตารางเที่ยวเรือ |
| [14-admin-containers.jpg](web/14-admin-containers.jpg) | `/admin/containers` | ประเภทตู้คอนเทนเนอร์ |
| [15-admin-stock.jpg](web/15-admin-stock.jpg) | `/admin/stock` | สินค้าคงคลังและรายการใกล้หมด |
| [16-admin-reports.jpg](web/16-admin-reports.jpg) | `/admin/reports` | รายงานยอดการจอง รายได้ และสินค้าคงคลัง |
| [17-admin-users.jpg](web/17-admin-users.jpg) | `/admin/users` | รายชื่อผู้ใช้งานและสิทธิ์ |
| [18-admin-health.jpg](web/18-admin-health.jpg) | `/admin/health` | สถานะระบบและเครื่อง API ที่ตอบคำขอ |
| [19-booking-detail-pending.jpg](web/19-booking-detail-pending.jpg) | `/app/bookings/1` | รายละเอียดการจองสาธิตขณะรอยืนยัน |
| [20-booking-detail-cancelled.jpg](web/20-booking-detail-cancelled.jpg) | `/app/bookings/1` | รายละเอียดรายการจองสาธิตหลังยกเลิก |
| [21-customer-bookings-cancelled.jpg](web/21-customer-bookings-cancelled.jpg) | `/app/bookings` | รายการจองของลูกค้าแสดงสถานะยกเลิก |
| [22-schedule-capacity-restored.jpg](web/22-schedule-capacity-restored.jpg) | `/app/services` | เที่ยวเรือ BKX-2601E กลับมามีพื้นที่ว่าง 780 TEU หลังคืนพื้นที่ 1 TEU |

URL ของเว็บทุกหน้าใช้โดเมน `http://pier2pier-dev-web.s3-website-us-east-1.amazonaws.com` นำหน้า path ในตาราง ภาพเป็นจอขนาดที่ in-app browser แสดงขณะจับภาพ จึงเห็นบางตารางในรูปแบบแคบและต้องเลื่อนในหน้าจอเมื่อดูข้อมูลคอลัมน์อื่น

รายการจองสาธิต `BK-20261025-0001` ใช้ตรวจขั้นตอนสร้างและยกเลิกการจองในวันที่ 25 ต.ค. 2569 โดยยกเลิกแล้วและคืนพื้นที่ 1 TEU ให้เที่ยวเรือ `BKX-2601E` ภาพก่อนและหลังอยู่ในรายการ 19–22

## ภาพจากรอบทดสอบก่อนหน้า

| ไฟล์ | วันที่ต้นฉบับ | หมายเหตุ |
| --- | --- | --- |
| [2026-10-20-home-chrome.png](historical/2026-10-20-home-chrome.png) | 20 ต.ค. 2569 | หน้าแรกผ่าน Chrome มีแท็บและแถบ URL |
| [2026-10-14-customer-dashboard.jpg](historical/2026-10-14-customer-dashboard.jpg) | 14 ต.ค. 2569 | หน้าแรกบัญชีลูกค้าแบบจอกว้าง |

ภาพในโฟลเดอร์นี้ไม่มี AWS access key, secret key, session token หรือค่ารหัสผ่านจาก SSM Parameter Store
