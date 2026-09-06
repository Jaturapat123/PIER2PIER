/**
 * RDS MySQL — ฐานข้อมูลกลางที่ EC2 ทุกเครื่องใช้ร่วมกัน
 *
 * นี่คือเหตุผลที่แอปเป็น stateless ได้: state ทั้งหมดอยู่ที่นี่ที่เดียว
 * ไม่ว่า ALB จะส่ง request ไปเครื่องไหน ก็อ่านเขียนข้อมูลชุดเดียวกัน
 */

variable "name" { type = string }
variable "subnet_ids" { type = list(string) }
variable "security_group_ids" { type = list(string) }
variable "instance_class" { type = string }
variable "allocated_storage" { type = number }
variable "multi_az" { type = bool }
variable "db_name" { type = string }
variable "db_username" { type = string }
variable "db_password" {
  type      = string
  sensitive = true
}
variable "tags" { type = map(string) }

resource "aws_db_subnet_group" "this" {
  name       = "${var.name}-db-subnet-group"
  subnet_ids = var.subnet_ids

  tags = merge(var.tags, { Name = "${var.name}-db-subnet-group" })
}

resource "aws_db_parameter_group" "this" {
  name   = "${var.name}-mysql8"
  family = "mysql8.0"

  parameter {
    name  = "character_set_server"
    value = "utf8mb4"
  }

  parameter {
    name  = "collation_server"
    value = "utf8mb4_general_ci"
  }

  # บันทึก query ที่ช้ากว่า 1 วินาที ไว้หาคอขวดตอนทดสอบโหลด
  parameter {
    name  = "slow_query_log"
    value = "1"
  }

  parameter {
    name  = "long_query_time"
    value = "1"
  }

  tags = var.tags
}

resource "aws_db_instance" "this" {
  identifier     = "${var.name}-mysql"
  engine         = "mysql"
  engine_version = "8.0"
  instance_class = var.instance_class

  allocated_storage     = var.allocated_storage
  max_allocated_storage = var.allocated_storage * 2 # ขยายอัตโนมัติเมื่อพื้นที่ใกล้เต็ม
  storage_type          = "gp3"
  storage_encrypted     = true

  db_name  = var.db_name
  username = var.db_username
  password = var.db_password
  port     = 3306

  db_subnet_group_name   = aws_db_subnet_group.this.name
  vpc_security_group_ids = var.security_group_ids
  parameter_group_name   = aws_db_parameter_group.this.name

  # ห้ามเปิดเด็ดขาด — ฐานข้อมูลต้องเข้าถึงได้จากใน VPC เท่านั้น
  publicly_accessible = false

  # Multi-AZ สร้าง standby ในอีก AZ แล้วสลับให้อัตโนมัติเมื่อ primary ล่ม
  # ปิดไว้ช่วงพัฒนาเพราะคิดเงินเป็นสองเท่า เปิดตอนสาธิต Stage 3
  multi_az = var.multi_az

  backup_retention_period = 7
  backup_window           = "17:00-18:00" # ตรงกับตี 12-1 เวลาไทย ช่วงที่ไม่มีคนใช้
  maintenance_window      = "sun:18:00-sun:19:00"

  # ส่ง log ของ MySQL เข้า CloudWatch เพื่อดูย้อนหลังได้แม้ instance ถูกแทนที่
  enabled_cloudwatch_logs_exports = ["error", "slowquery"]

  # โครงงานนี้ลบทิ้งบ่อยเพื่อประหยัดค่าใช้จ่าย จึงไม่บังคับ snapshot ตอนลบ
  # ระบบจริงต้องตั้งเป็น false และระบุ final_snapshot_identifier
  skip_final_snapshot = true
  deletion_protection = false

  # AWS อาจแพตช์เวอร์ชันย่อยเอง ไม่ให้ terraform มองว่าเป็นความเปลี่ยนแปลงที่ต้องแก้กลับ
  auto_minor_version_upgrade = true

  tags = merge(var.tags, { Name = "${var.name}-mysql" })
}

output "address" { value = aws_db_instance.this.address }
output "endpoint" { value = aws_db_instance.this.endpoint }
output "instance_id" { value = aws_db_instance.this.identifier }
