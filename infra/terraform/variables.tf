variable "project" {
  description = "ชื่อโครงงาน ใช้เป็นคำนำหน้าชื่อทรัพยากรทุกตัว"
  type        = string
  default     = "pier2pier"
}

variable "environment" {
  description = "สภาพแวดล้อม เช่น dev หรือ prod"
  type        = string
  default     = "dev"
}

variable "aws_region" {
  description = "ภูมิภาคที่ deploy — สิงคโปร์ใกล้ไทยที่สุดจึง latency ต่ำสุด"
  type        = string
  default     = "ap-southeast-1"
}

variable "vpc_cidr" {
  type    = string
  default = "10.0.0.0/16"
}

variable "availability_zones" {
  description = "ต้องมีอย่างน้อย 2 AZ ไม่งั้น ALB สร้างไม่ได้ และ HA ไม่มีความหมาย"
  type        = list(string)
  default     = ["ap-southeast-1a", "ap-southeast-1b"]

  validation {
    condition     = length(var.availability_zones) >= 2
    error_message = "ต้องระบุอย่างน้อย 2 Availability Zone เพื่อให้ระบบทนต่อการล่มของ AZ เดียว"
  }
}

variable "enable_nat" {
  description = "เปิด NAT Gateway (คิดเงินรายชั่วโมง) — ปิดได้แล้วใช้ VPC Endpoint แทนเพื่อประหยัด"
  type        = bool
  default     = true
}

variable "instance_type" {
  description = "t3.micro อยู่ใน Free Tier ช่วงปีแรก"
  type        = string
  default     = "t3.micro"
}

variable "instance_count" {
  description = "จำนวน EC2 — คงที่ตามขอบเขตโครงงาน ไม่ใช้ Auto Scaling"
  type        = number
  default     = 2

  validation {
    condition     = var.instance_count >= 2
    error_message = "ต้องมีอย่างน้อย 2 เครื่อง ไม่งั้นการทดสอบ Load Balancing ไม่มีความหมาย"
  }
}

variable "app_port" {
  type    = number
  default = 3000
}

variable "image_tag" {
  description = "แท็กของ Docker image ที่จะรัน ใช้ git SHA เพื่อให้ย้อนเวอร์ชันได้"
  type        = string
  default     = "latest"
}

variable "db_instance_class" {
  type    = string
  default = "db.t3.micro"
}

variable "db_allocated_storage" {
  type    = number
  default = 20
}

variable "db_multi_az" {
  description = "เปิดตอนสาธิต Stage 3 เท่านั้น เพราะคิดเงินเป็นสองเท่า"
  type        = bool
  default     = false
}

variable "db_name" {
  type    = string
  default = "pier2pier_wms"
}

variable "db_username" {
  type    = string
  default = "wmsadmin"
}

variable "db_password" {
  description = "ห้ามใส่ค่าจริงในไฟล์ที่ commit — ใช้ TF_VAR_db_password หรือ terraform.tfvars ที่อยู่ใน .gitignore"
  type        = string
  sensitive   = true
}

variable "jwt_secret" {
  description = "สร้างด้วย: openssl rand -base64 48"
  type        = string
  sensitive   = true
}

variable "alarm_email" {
  description = "อีเมลรับการแจ้งเตือนจาก CloudWatch เว้นว่างได้ถ้าไม่ต้องการ"
  type        = string
  default     = ""
}
