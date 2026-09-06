/**
 * Application Load Balancer — หัวใจของโครงงานนี้
 *
 * ค่าที่ตั้งไว้ตอบโจทย์ทั้งการกระจายโหลดและการ deploy แบบไม่มี downtime
 */

variable "name" { type = string }
variable "vpc_id" { type = string }
variable "subnet_ids" { type = list(string) }
variable "security_group_id" { type = string }
variable "app_port" { type = number }
variable "tags" { type = map(string) }

resource "aws_lb" "this" {
  name               = "${var.name}-alb"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [var.security_group_id]
  subnets            = var.subnet_ids

  # กันการลบโดยไม่ตั้งใจ — ปิดไว้ในโครงงานเพราะต้อง destroy บ่อยเพื่อประหยัดค่าใช้จ่าย
  enable_deletion_protection = false

  # ต้องมากกว่าเวลาที่ request หนักที่สุดใช้ (รายงานที่ query ช่วงยาว)
  idle_timeout = 60

  tags = merge(var.tags, { Name = "${var.name}-alb" })
}

resource "aws_lb_target_group" "this" {
  name        = "${var.name}-tg"
  port        = var.app_port
  protocol    = "HTTP"
  vpc_id      = var.vpc_id
  target_type = "instance"

  health_check {
    enabled = true
    path    = "/health" # endpoint นี้ query ฐานข้อมูลจริงก่อนตอบ 200
    matcher = "200"

    # ตรวจทุก 15 วินาที ผ่าน 2 ครั้งติดถือว่าพร้อม ล้มเหลว 3 ครั้งติดถึงถอดออก
    # ตั้งให้ไวพอจะจับเครื่องที่ล่มได้ใน ~45 วินาที แต่ไม่ไวจนถอดเครื่องที่แค่ช้าชั่วคราว
    interval            = 15
    timeout             = 5
    healthy_threshold   = 2
    unhealthy_threshold = 3
  }

  # ค่านี้คือเหตุผลที่แอปต้องรองรับ SIGTERM
  # ตอน deploy ALB จะหยุดส่ง request ใหม่แล้วรอ 30 วินาทีให้ request ที่ค้างอยู่ทำงานจบ
  # ถ้าตั้งเป็น 0 ผู้ใช้ที่กำลังกดยืนยันการจองจะเจอ connection ถูกตัดกลางคัน
  deregistration_delay = 30

  # ไม่เปิด stickiness เพราะแอปเป็น stateless — ทุกเครื่องรับ request ไหนก็ได้
  # ถ้าเปิดจะกลบข้อบกพร่องของ session ที่เก็บใน memory ไว้แทนที่จะแก้ที่ต้นเหตุ
  stickiness {
    type    = "lb_cookie"
    enabled = false
  }

  tags = merge(var.tags, { Name = "${var.name}-tg" })

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.this.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.this.arn
  }
}

# เมื่อมีใบรับรอง ACM แล้วให้เปิดสองบล็อกนี้ แล้วเปลี่ยน listener :80 เป็น redirect ไป :443
# resource "aws_lb_listener" "https" {
#   load_balancer_arn = aws_lb.this.arn
#   port              = 443
#   protocol          = "HTTPS"
#   ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"
#   certificate_arn   = var.certificate_arn
#   default_action {
#     type             = "forward"
#     target_group_arn = aws_lb_target_group.this.arn
#   }
# }

output "dns_name" { value = aws_lb.this.dns_name }
output "arn_suffix" { value = aws_lb.this.arn_suffix }
output "target_group_arn" { value = aws_lb_target_group.this.arn }
output "target_group_arn_suffix" { value = aws_lb_target_group.this.arn_suffix }
