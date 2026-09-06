output "alb_dns_name" {
  description = "ที่อยู่ของ API — ใช้ตั้งค่า VITE_API_BASE_URL ของ frontend"
  value       = module.alb.dns_name
}

output "cloudfront_domain" {
  description = "ที่อยู่เว็บไซต์สำหรับผู้ใช้"
  value       = module.frontend_cdn.domain_name
}

output "frontend_bucket" {
  description = "S3 bucket ที่ CI/CD อัปโหลดไฟล์ frontend ขึ้นไป"
  value       = module.frontend_cdn.bucket_name
}

output "cloudfront_distribution_id" {
  description = "ใช้สั่ง invalidate cache หลัง deploy frontend"
  value       = module.frontend_cdn.distribution_id
}

output "ecr_repository_url" {
  value = module.ecr.repository_url
}

output "rds_endpoint" {
  value     = module.database.address
  sensitive = true
}

output "app_instance_ids" {
  description = "ใช้กับ SSM Send-Command ตอน deploy"
  value       = module.compute.instance_ids
}

output "health_check_url" {
  description = "เปิดดูได้ว่าตอนนี้ ALB ส่งไปเครื่องไหน"
  value       = "http://${module.alb.dns_name}/health"
}
