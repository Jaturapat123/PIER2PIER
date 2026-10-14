output "alb_dns_name" {
  description = "ที่อยู่ของ API — ใช้ตั้งค่า VITE_API_BASE_URL ของ frontend"
  value       = module.alb.dns_name
}

output "web_endpoint" {
  description = "ที่อยู่เว็บไซต์สำหรับผู้ใช้ — HTTP เท่านั้น S3 website endpoint ไม่รองรับ HTTPS"
  value       = "http://${module.frontend_web.website_endpoint}"
}

output "frontend_bucket" {
  description = "S3 bucket ที่ CI/CD อัปโหลดไฟล์ frontend ขึ้นไป"
  value       = module.frontend_web.bucket_name
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
