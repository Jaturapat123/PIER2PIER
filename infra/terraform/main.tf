/**
 * Pier2Pier Port WMS — โครงสร้างพื้นฐานทั้งหมดบน AWS
 *
 * แบ่งเป็นโมดูลตามชั้นของสถาปัตยกรรม เพื่อให้ terraform destroy เฉพาะส่วนที่
 * คิดเงินรายชั่วโมง (alb, compute) ได้ตอนไม่ได้ใช้ โดยไม่ต้องรื้อ VPC และ RDS ทิ้ง
 */

locals {
  name = "${var.project}-${var.environment}"

  tags = {
    Project     = var.project
    Environment = var.environment
    ManagedBy   = "terraform"
    Course      = "Cloud Computing 1/2569"
    Team        = "Pier2Pier (J3K)"
  }
}

module "network" {
  source = "./modules/network"

  name               = local.name
  vpc_cidr           = var.vpc_cidr
  availability_zones = var.availability_zones
  enable_nat         = var.enable_nat
  tags               = local.tags
}

module "ecr" {
  source = "./modules/ecr"

  name = local.name
  tags = local.tags
}

module "database" {
  source = "./modules/database"

  name               = local.name
  subnet_ids         = module.network.private_db_subnet_ids
  security_group_ids = [module.network.db_security_group_id]
  instance_class     = var.db_instance_class
  allocated_storage  = var.db_allocated_storage
  multi_az           = var.db_multi_az
  db_name            = var.db_name
  db_username        = var.db_username
  db_password        = var.db_password
  tags               = local.tags
}

module "alb" {
  source = "./modules/alb"

  name              = local.name
  vpc_id            = module.network.vpc_id
  subnet_ids        = module.network.public_subnet_ids
  security_group_id = module.network.alb_security_group_id
  app_port          = var.app_port
  tags              = local.tags
}

module "compute" {
  source = "./modules/compute"

  name              = local.name
  subnet_ids        = module.network.private_app_subnet_ids
  security_group_id = module.network.app_security_group_id
  target_group_arn  = module.alb.target_group_arn
  instance_type     = var.instance_type
  instance_count    = var.instance_count
  app_port          = var.app_port

  ecr_repository_url = module.ecr.repository_url
  image_tag          = var.image_tag
  ssm_parameter_path = aws_ssm_parameter.db_password.name
  db_host            = module.database.address
  db_name            = var.db_name
  db_username        = var.db_username
  # ผู้ใช้เรียก API ผ่านโดเมนของ CloudFront ซึ่งเป็นโดเมนเดียวกับหน้าเว็บ
  # จึงเป็น same-origin และไม่เกิดคำขอแบบ cross-origin เลย
  # ค่านี้ตั้งไว้เผื่อกรณีที่มีใครยิงตรงมาที่ ALB เท่านั้น
  cors_origins = "https://${module.frontend_cdn.domain_name}"
  aws_region   = var.aws_region

  tags = local.tags
}

module "frontend_cdn" {
  source = "./modules/frontend_cdn"

  name = local.name
  # CloudFront เป็นทางเข้าเดียวของทั้งเว็บและ API เพื่อให้ผู้ใช้คุยกับโดเมนเดียว
  # ผ่าน HTTPS ตลอด — ไม่มี mixed content และไม่ต้องตั้ง CORS
  alb_domain_name = module.alb.dns_name
  tags            = local.tags
}

module "monitoring" {
  source = "./modules/monitoring"

  name                    = local.name
  alb_arn_suffix          = module.alb.arn_suffix
  target_group_arn_suffix = module.alb.target_group_arn_suffix
  db_instance_id          = module.database.instance_id
  alarm_email             = var.alarm_email
  tags                    = local.tags
}

/**
 * ความลับเก็บใน SSM Parameter Store แบบเข้ารหัส ไม่ใช่ใน user-data ที่อ่านได้จาก console
 * EC2 ดึงค่าตอน boot ผ่าน IAM role จึงไม่ต้องมี credential ฝังอยู่บนเครื่องเลย
 */
resource "aws_ssm_parameter" "db_password" {
  name  = "/${local.name}/db/password"
  type  = "SecureString"
  value = var.db_password
  tags  = local.tags
}

resource "aws_ssm_parameter" "jwt_secret" {
  name  = "/${local.name}/app/jwt-secret"
  type  = "SecureString"
  value = var.jwt_secret
  # ต้องเป็นค่าเดียวกันทุก EC2 ไม่งั้น token ข้ามเครื่องไม่ได้
  description = "Shared JWT signing secret - must be identical on every app server"
  tags        = local.tags
}
