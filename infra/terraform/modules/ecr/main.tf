/**
 * ECR — คลังเก็บ Docker image ทุกเวอร์ชัน
 *
 * เหตุผลที่ต้องมี: rollback ทำได้ก็ต่อเมื่อ image ของเวอร์ชันเก่ายังอยู่
 * ถ้าเก็บแค่ latest จะย้อนกลับไม่ได้เลย
 */

variable "name" { type = string }
variable "tags" { type = map(string) }

resource "aws_ecr_repository" "this" {
  name                 = "${var.name}-api"
  image_tag_mutability = "MUTABLE" # ต้อง MUTABLE เพราะ tag "latest" ถูกเขียนทับทุกครั้ง

  image_scanning_configuration {
    scan_on_push = true # สแกนช่องโหว่ของ image ทุกครั้งที่ push
  }

  encryption_configuration {
    encryption_type = "AES256"
  }

  tags = merge(var.tags, { Name = "${var.name}-api" })
}

# เก็บ 10 เวอร์ชันล่าสุดพอ — เก่ากว่านั้นไม่มีใครย้อนกลับไปแล้ว และ ECR คิดเงินตามพื้นที่
resource "aws_ecr_lifecycle_policy" "this" {
  repository = aws_ecr_repository.this.name

  policy = jsonencode({
    rules = [{
      rulePriority = 1
      # เก็บเฉพาะ 10 image ล่าสุด
      description = "Keep only the 10 most recent images"
      selection = {
        tagStatus   = "any"
        countType   = "imageCountMoreThan"
        countNumber = 10
      }
      action = { type = "expire" }
    }]
  })
}

output "repository_url" { value = aws_ecr_repository.this.repository_url }
output "repository_name" { value = aws_ecr_repository.this.name }
