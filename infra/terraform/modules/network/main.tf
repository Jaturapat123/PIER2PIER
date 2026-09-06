/**
 * เครือข่ายและกฎความปลอดภัย
 *
 * แบ่ง subnet เป็น 3 ชั้นตามสถาปัตยกรรม multi-tier:
 *   public     — เฉพาะ ALB เท่านั้นที่ออกอินเทอร์เน็ตได้โดยตรง
 *   private-app — EC2 ที่รัน API ไม่มี public IP เข้าถึงจากภายนอกไม่ได้
 *   private-db  — RDS ไม่มีเส้นทางออกอินเทอร์เน็ตเลย
 *
 * Security Group ต่อกันเป็นลูกโซ่ (ALB → app → db) แทนการเปิดตาม CIDR
 * ข้อดีคือถ้า IP ของ ALB เปลี่ยน กฎยังถูกต้องอยู่ และไม่มีทางเผลอเปิดกว้างเกิน
 */

variable "name" { type = string }
variable "vpc_cidr" { type = string }
variable "availability_zones" { type = list(string) }
variable "enable_nat" { type = bool }
variable "tags" { type = map(string) }

resource "aws_vpc" "this" {
  cidr_block           = var.vpc_cidr
  enable_dns_support   = true
  enable_dns_hostnames = true

  tags = merge(var.tags, { Name = "${var.name}-vpc" })
}

resource "aws_internet_gateway" "this" {
  vpc_id = aws_vpc.this.id
  tags   = merge(var.tags, { Name = "${var.name}-igw" })
}

# ── Subnet ──────────────────────────────────────────────────────────────

resource "aws_subnet" "public" {
  count = length(var.availability_zones)

  vpc_id                  = aws_vpc.this.id
  cidr_block              = cidrsubnet(var.vpc_cidr, 8, count.index)
  availability_zone       = var.availability_zones[count.index]
  map_public_ip_on_launch = true

  tags = merge(var.tags, {
    Name = "${var.name}-public-${var.availability_zones[count.index]}"
    Tier = "public"
  })
}

resource "aws_subnet" "private_app" {
  count = length(var.availability_zones)

  vpc_id            = aws_vpc.this.id
  cidr_block        = cidrsubnet(var.vpc_cidr, 8, count.index + 10)
  availability_zone = var.availability_zones[count.index]

  tags = merge(var.tags, {
    Name = "${var.name}-app-${var.availability_zones[count.index]}"
    Tier = "application"
  })
}

resource "aws_subnet" "private_db" {
  count = length(var.availability_zones)

  vpc_id            = aws_vpc.this.id
  cidr_block        = cidrsubnet(var.vpc_cidr, 8, count.index + 20)
  availability_zone = var.availability_zones[count.index]

  tags = merge(var.tags, {
    Name = "${var.name}-db-${var.availability_zones[count.index]}"
    Tier = "database"
  })
}

# ── NAT และเส้นทาง ──────────────────────────────────────────────────────

# NAT ตัวเดียวพอสำหรับโครงงานนี้ — ถ้าทำ production จริงควรมีตัวหนึ่งต่อ AZ
# เพราะถ้า AZ ที่มี NAT ล่ม EC2 ในอีก AZ จะออกเน็ตไม่ได้
resource "aws_eip" "nat" {
  count  = var.enable_nat ? 1 : 0
  domain = "vpc"
  tags   = merge(var.tags, { Name = "${var.name}-nat-eip" })
}

resource "aws_nat_gateway" "this" {
  count = var.enable_nat ? 1 : 0

  allocation_id = aws_eip.nat[0].id
  subnet_id     = aws_subnet.public[0].id
  tags          = merge(var.tags, { Name = "${var.name}-nat" })

  depends_on = [aws_internet_gateway.this]
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.this.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.this.id
  }

  tags = merge(var.tags, { Name = "${var.name}-rt-public" })
}

resource "aws_route_table" "private" {
  vpc_id = aws_vpc.this.id

  dynamic "route" {
    for_each = var.enable_nat ? [1] : []
    content {
      cidr_block     = "0.0.0.0/0"
      nat_gateway_id = aws_nat_gateway.this[0].id
    }
  }

  tags = merge(var.tags, { Name = "${var.name}-rt-private" })
}

resource "aws_route_table_association" "public" {
  count          = length(aws_subnet.public)
  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public.id
}

resource "aws_route_table_association" "private_app" {
  count          = length(aws_subnet.private_app)
  subnet_id      = aws_subnet.private_app[count.index].id
  route_table_id = aws_route_table.private.id
}

resource "aws_route_table_association" "private_db" {
  count          = length(aws_subnet.private_db)
  subnet_id      = aws_subnet.private_db[count.index].id
  route_table_id = aws_route_table.private.id
}

# ── VPC Endpoint (ใช้แทน NAT เพื่อประหยัด) ──────────────────────────────

# S3 Gateway Endpoint ไม่คิดเงิน และ ECR ดึง image layer จาก S3
# จึงคุ้มที่จะเปิดไว้เสมอไม่ว่าจะใช้ NAT หรือไม่
resource "aws_vpc_endpoint" "s3" {
  vpc_id            = aws_vpc.this.id
  service_name      = "com.amazonaws.${data.aws_region.current.name}.s3"
  vpc_endpoint_type = "Gateway"
  route_table_ids   = [aws_route_table.private.id]

  tags = merge(var.tags, { Name = "${var.name}-vpce-s3" })
}

data "aws_region" "current" {}

# ── Security Group ──────────────────────────────────────────────────────

# อนุญาต HTTP/HTTPS จากอินเทอร์เน็ตเข้าสู่ Load Balancer
# คำอธิบายของ AWS รับเฉพาะอักขระ ASCII จึงเขียนภาษาไทยไว้ในคอมเมนต์แทน
resource "aws_security_group" "alb" {
  name        = "${var.name}-alb-sg"
  description = "Allows HTTP/HTTPS from the internet into the load balancer"
  vpc_id      = aws_vpc.this.id

  ingress {
    # HTTP จากผู้ใช้ทั่วไป
    description = "HTTP from public internet"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    # HTTPS จากผู้ใช้ทั่วไป
    description = "HTTPS from public internet"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(var.tags, { Name = "${var.name}-alb-sg" })
}

resource "aws_security_group" "app" {
  name        = "${var.name}-app-sg"
  description = "Application servers, reachable only from the load balancer"
  vpc_id      = aws_vpc.this.id

  # จุดสำคัญ: อ้างถึง security group ของ ALB ไม่ใช่ช่วง IP
  # ทำให้ไม่มีใครนอกจาก ALB ยิงเข้าพอร์ตนี้ได้แม้จะอยู่ใน VPC เดียวกัน
  ingress {
    # พอร์ตแอปพลิเคชัน รับจาก ALB เท่านั้น
    description     = "Application port, from ALB security group only"
    from_port       = 3000
    to_port         = 3000
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
  }

  egress {
    # ออกไปดึง Docker image จาก ECR และส่ง log เข้า CloudWatch
    description = "Outbound for ECR image pulls and CloudWatch logs"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(var.tags, { Name = "${var.name}-app-sg" })
}

resource "aws_security_group" "db" {
  name        = "${var.name}-db-sg"
  description = "Database, reachable only from the application tier"
  vpc_id      = aws_vpc.this.id

  ingress {
    # MySQL จากเครื่องที่รันแอปเท่านั้น
    description     = "MySQL from application servers only"
    from_port       = 3306
    to_port         = 3306
    protocol        = "tcp"
    security_groups = [aws_security_group.app.id]
  }

  # ไม่มี egress rule ออกอินเทอร์เน็ต — ฐานข้อมูลไม่มีเหตุผลต้องเรียกออกไปข้างนอก
  tags = merge(var.tags, { Name = "${var.name}-db-sg" })
}

# ── Output ──────────────────────────────────────────────────────────────

output "vpc_id" { value = aws_vpc.this.id }
output "public_subnet_ids" { value = aws_subnet.public[*].id }
output "private_app_subnet_ids" { value = aws_subnet.private_app[*].id }
output "private_db_subnet_ids" { value = aws_subnet.private_db[*].id }
output "alb_security_group_id" { value = aws_security_group.alb.id }
output "app_security_group_id" { value = aws_security_group.app.id }
output "db_security_group_id" { value = aws_security_group.db.id }
