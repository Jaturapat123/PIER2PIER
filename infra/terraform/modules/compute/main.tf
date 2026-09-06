/**
 * EC2 ที่รัน API — กระจายทีละเครื่องต่อ Availability Zone
 *
 * ไม่ใช้ Auto Scaling Group ตามขอบเขตโครงงาน: ต้องการให้จำนวนเครื่องคงที่
 * เพื่อให้ผลการทดลอง Load Balancing อ่านได้ชัดว่าเสถียรเพราะการกระจายโหลด
 * ไม่ใช่เพราะระบบเพิ่มเครื่องให้เอง
 */

variable "name" { type = string }
variable "subnet_ids" { type = list(string) }
variable "security_group_id" { type = string }
variable "target_group_arn" { type = string }
variable "instance_type" { type = string }
variable "instance_count" { type = number }
variable "app_port" { type = number }
variable "ecr_repository_url" { type = string }
variable "image_tag" { type = string }
variable "ssm_parameter_path" { type = string }
variable "db_host" { type = string }
variable "db_name" { type = string }
variable "db_username" { type = string }
variable "cors_origins" { type = string }
variable "aws_region" { type = string }
variable "tags" { type = map(string) }

data "aws_ami" "al2023" {
  most_recent = true
  owners      = ["amazon"]

  filter {
    name   = "name"
    values = ["al2023-ami-2023.*-x86_64"]
  }
}

# ── สิทธิ์ของเครื่อง ─────────────────────────────────────────────────────

resource "aws_iam_role" "instance" {
  name = "${var.name}-instance-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "ec2.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })

  tags = var.tags
}

# ดึง image จาก ECR ได้ แต่ push ไม่ได้ — เครื่อง production ไม่มีเหตุผลต้อง push
resource "aws_iam_role_policy_attachment" "ecr_readonly" {
  role       = aws_iam_role.instance.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryReadOnly"
}

# ใช้ SSM Session Manager แทน SSH — ไม่ต้องเปิดพอร์ต 22 และไม่ต้องเก็บ key ที่ไหนเลย
resource "aws_iam_role_policy_attachment" "ssm" {
  role       = aws_iam_role.instance.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

resource "aws_iam_role_policy_attachment" "cloudwatch" {
  role       = aws_iam_role.instance.name
  policy_arn = "arn:aws:iam::aws:policy/CloudWatchAgentServerPolicy"
}

# อ่านความลับได้เฉพาะของโครงงานนี้เท่านั้น ไม่ใช่ทุก parameter ในบัญชี
resource "aws_iam_role_policy" "ssm_params" {
  name = "${var.name}-read-parameters"
  role = aws_iam_role.instance.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["ssm:GetParameter", "ssm:GetParameters"]
      Resource = "arn:aws:ssm:${var.aws_region}:*:parameter/${var.name}/*"
    }]
  })
}

resource "aws_iam_instance_profile" "this" {
  name = "${var.name}-instance-profile"
  role = aws_iam_role.instance.name
}

# ── เครื่อง ─────────────────────────────────────────────────────────────

resource "aws_instance" "app" {
  count = var.instance_count

  ami           = data.aws_ami.al2023.id
  instance_type = var.instance_type
  # กระจายเครื่องวนไปตาม subnet ที่ให้มา — subnet แต่ละอันอยู่คนละ AZ
  # เครื่องที่ 0 จึงอยู่ AZ-a และเครื่องที่ 1 อยู่ AZ-b เสมอ
  subnet_id              = var.subnet_ids[count.index % length(var.subnet_ids)]
  vpc_security_group_ids = [var.security_group_id]
  iam_instance_profile   = aws_iam_instance_profile.this.name

  user_data = templatefile("${path.module}/user-data.sh", {
    aws_region         = var.aws_region
    ecr_repository_url = var.ecr_repository_url
    image_tag          = var.image_tag
    app_port           = var.app_port
    db_host            = var.db_host
    db_name            = var.db_name
    db_username        = var.db_username
    ssm_password_path  = var.ssm_parameter_path
    ssm_jwt_path       = "/${var.name}/app/jwt-secret"
    cors_origins       = var.cors_origins
    log_group          = "/${var.name}/app"
  })

  # เปลี่ยน user-data แล้วให้สร้างเครื่องใหม่ ไม่ใช่แก้เครื่องเดิม
  # (เครื่องอ่าน user-data แค่ตอน boot ครั้งแรก)
  user_data_replace_on_change = true

  metadata_options {
    http_endpoint = "enabled"
    http_tokens   = "required" # บังคับ IMDSv2 — กัน SSRF ที่พยายามอ่าน credential ผ่านแอป
  }

  root_block_device {
    volume_size = 20
    volume_type = "gp3"
    encrypted   = true
  }

  tags = merge(var.tags, {
    Name = "${var.name}-app-${count.index + 1}"
    Role = "application"
  })
}

resource "aws_lb_target_group_attachment" "app" {
  count = var.instance_count

  target_group_arn = var.target_group_arn
  target_id        = aws_instance.app[count.index].id
  port             = var.app_port
}

output "instance_ids" { value = aws_instance.app[*].id }
output "private_ips" { value = aws_instance.app[*].private_ip }
