# ภาพจอกว้างสำหรับรูปเล่ม Pier2Pier

ภาพถ่ายวันที่ **25 ตุลาคม 2569** จาก Chrome ขนาด **1536 × 864 พิกเซล (16:9)** ทุกภาพในรายการนี้แสดงแท็บและแถบ URL ภาพ AWS ถ่ายจากบัญชี AWS Academy Learner Lab ใน `us-east-1` และภาพเว็บถ่ายจาก Pier2Pier ที่ deploy บน S3

เปิด [ภาพรวม AWS](aws/contact-sheet.png) หรือ [ภาพรวมเว็บ](web/contact-sheet.png) เพื่อเลือกภาพก่อนนำไปจัดรูปเล่ม ไฟล์ PNG ที่พร้อมใช้อยู่ใน `aws/` และ `web/` ตรวจและลบภาพต้นฉบับที่ติดเคอร์เซอร์ออกจากชุดนี้แล้ว

## AWS — 33 ภาพ

| บริการ | ภาพพร้อมใช้ |
| --- | --- |
| Console | [หน้าแรก](aws/01-console-home.png) |
| EC2 | [Dashboard](aws/02-ec2-dashboard.png), [Instances สองเครื่อง](aws/02-ec2-instances.png), [รายละเอียดเครื่องแอปใน private subnet](aws/28-ec2-instance-detail.png) |
| Application Load Balancer | [Load Balancer](aws/03-load-balancer.png), [HTTP listener](aws/04-alb-listener.png), [Targets healthy](aws/05-targets-healthy.png) |
| RDS MySQL | [Dashboard](aws/06-rds-dashboard.png), [Database](aws/06-rds-database.png), [Multi-AZ](aws/07-rds-multi-az.png) |
| VPC | [Dashboard](aws/08-vpc-dashboard.png), [VPC list](aws/08-vpc-list.png), [VPC details](aws/09-vpc-details.png), [Resource map: subnets และ routes](aws/09b-vpc-resource-map-left.png), [Resource map: network connections](aws/09c-vpc-resource-map-connections.png) |
| เครือข่าย | [Subnets](aws/10-subnets.png), [Route tables](aws/11-route-tables.png), [Public routes](aws/12-public-routes.png), [Private routes](aws/13-private-routes.png), [NAT gateways](aws/14-nat-gateways.png), [S3 VPC endpoint](aws/15-s3-vpc-endpoint.png), [Security groups](aws/16-security-groups.png), [Internet gateway](aws/17-internet-gateway.png) |
| S3 | [Bucket](aws/18-s3-bucket.png), [ไฟล์เว็บ](aws/19-s3-objects.png), [Static Website Hosting และ endpoint](aws/20-s3-website-config.png) |
| ECR | [Repository](aws/21-ecr-repository.png), [Container images](aws/22-ecr-images.png) |
| CloudWatch | [Dashboard](aws/23-cloudwatch-dashboard.png), [Alarms](aws/24-cloudwatch-alarms.png), [Log groups](aws/25-cloudwatch-log-groups.png) |
| Systems Manager | [ชื่อพารามิเตอร์ใน Parameter Store](aws/26-ssm-parameters.png) — ไม่เปิดค่า SecureString |
| SNS | [Topics](aws/27-sns-topic.png) |

## เว็บ Pier2Pier — 19 ภาพ

| ส่วน | ภาพพร้อมใช้ |
| --- | --- |
| ผู้เยี่ยมชม | [หน้าแรก](web/01-home.png), [เข้าสู่ระบบ](web/02-login.png), [สมัครสมาชิก](web/03-register.png) |
| ลูกค้า | [Dashboard](web/04-customer-dashboard.png), [ค้นหาบริการ](web/05-services.png), [เริ่มจอง](web/06-new-booking.png), [ตรวจทานก่อนจอง](web/07-booking-review.png), [โปรไฟล์](web/09-customer-profile.png), [รายละเอียดการจองที่ยกเลิก](web/20-booking-detail-cancelled.png), [รายการจองหลังยกเลิก](web/21-customer-bookings-cancelled.png) |
| ผู้ดูแล | [Dashboard](web/10-admin-dashboard.png), [รายการจอง](web/11-admin-bookings.png), [บริการ](web/12-admin-services.png), [ตารางเที่ยวเรือ](web/13-admin-schedules.png), [ประเภทตู้](web/14-admin-containers.png), [สินค้าคงคลัง](web/15-admin-stock.png), [รายงาน](web/16-admin-reports.png), [ผู้ใช้](web/17-admin-users.png), [สถานะระบบ](web/18-admin-health.png) |

ภาพสถานะชั่วคราวก่อนสร้างรายการจอง (`08`), ระหว่างรอยืนยัน (`19`) และหลังคืนพื้นที่ (`22`) มีเฉพาะ [ชุดภาพเดิมที่จับเฉพาะหน้าเว็บ](../README.md) เนื่องจากสถานะเหล่านั้นผ่านไปแล้ว ภาพจอกว้างชุดนี้จึงใช้สถานะปัจจุบันหลังยกเลิกเป็นหลักฐานแทน

ภาพเป็นหลักฐานของเวลาที่ถ่าย ไม่ได้ยืนยันสถานะของแล็บในภายหลัง
