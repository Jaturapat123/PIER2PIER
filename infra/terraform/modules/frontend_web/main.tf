/**
 * S3 Static Website Hosting สำหรับ frontend
 *
 * เดิมโมดูลนี้ชื่อ frontend_cdn และเป็น S3 (private ทั้งก้อน) + CloudFront + Origin Access Control
 * AWS Academy Learner Lab ไม่อนุญาตให้ใช้ CloudFront — นโยบายของ role voclabs ปฏิเสธ
 * cloudfront:* ตรง ๆ (ยืนยันจากบัญชีจริง ดู instruction.md §2.1) จึงต้องเสิร์ฟไฟล์
 * จาก S3 website endpoint โดยตรง
 *
 * สิ่งที่เสียไปจากการไม่มี CloudFront — ต้องเขียนเป็นข้อจำกัดในรายงาน:
 *   1. ไม่มี HTTPS — S3 website endpoint รองรับเฉพาะ HTTP ทั้งระบบจึงเป็น HTTP
 *      (เอกสาร AWS แนะนำให้ใช้ CloudFront ถ้าต้องการ HTTPS ซึ่งเราใช้ไม่ได้)
 *   2. bucket ต้องเปิดให้อ่านแบบ public ปิดสนิทแบบตอนมี OAC ไม่ได้
 *   3. ไม่มี edge cache และไม่มีการบีบอัดอัตโนมัติ ผู้ใช้โหลดจาก us-east-1 ทุกคน
 *   4. หน้าเว็บกับ API อยู่คนละ origin จึงต้องตั้ง CORS ที่ backend
 *      (ตอนมี CloudFront เป็นทางเข้าเดียวจึงเป็น same-origin และไม่ต้องตั้ง CORS เลย)
 */

variable "name" { type = string }
variable "tags" { type = map(string) }

resource "aws_s3_bucket" "web" {
  bucket        = "${var.name}-web"
  force_destroy = true # โครงงานลบทิ้งบ่อย ระบบจริงต้องเป็น false

  tags = merge(var.tags, { Name = "${var.name}-web" })
}

/**
 * ต้องปลด Block Public Access ทั้งสี่ข้อ
 *
 * website endpoint ให้บริการคำขอที่ไม่มี credential ติดมาเลย สิทธิ์จึงต้องมาจาก
 * bucket policy ที่อนุญาต Principal = "*" ถ้า block_public_policy ยังเปิดอยู่
 * S3 จะปฏิเสธ bucket policy ด้านล่างทันทีตอน apply
 *
 * ยืนยันแล้วว่าบัญชีแล็บปิด Block Public Access ระดับบัญชีไว้ทั้งสี่ข้อ (instruction.md §2.4)
 * ถ้าระดับบัญชีเปิดอยู่ การตั้งค่าระดับ bucket จะถูกทับและทำ website hosting ไม่ได้เลย
 */
resource "aws_s3_bucket_public_access_block" "web" {
  bucket = aws_s3_bucket.web.id

  block_public_acls       = false
  block_public_policy     = false
  ignore_public_acls      = false
  restrict_public_buckets = false
}

# ปิดการใช้ ACL ทั้งหมด ให้สิทธิ์มาจาก bucket policy ที่เดียว
# ตรวจสอบง่ายกว่าตอนรายงาน และกันกรณี CI อัปโหลดไฟล์มาด้วย ACL ที่ไม่ตรงกัน
resource "aws_s3_bucket_ownership_controls" "web" {
  bucket = aws_s3_bucket.web.id

  rule { object_ownership = "BucketOwnerEnforced" }
}

/**
 * SPA routing ด้วย ErrorDocument
 *
 * React Router จัดการเส้นทางที่ฝั่งเบราว์เซอร์ ใน bucket จึงไม่มีไฟล์ชื่อ /app/bookings อยู่จริง
 * เมื่อผู้ใช้กด refresh หรือเปิดลิงก์ตรง S3 หาไฟล์ไม่เจอแล้วส่ง error document กลับไป
 * ซึ่งก็คือ index.html ตัวเดิม React Router จึงอ่าน URL จากเบราว์เซอร์เองว่าต้องแสดงหน้าไหน
 *
 * ผลข้างเคียงที่ยอมรับและต้องเขียนในรายงาน: deep link ได้ HTTP status 404
 * พร้อมเนื้อหา index.html — หน้าเว็บทำงานถูกต้องแต่สถานะไม่ใช่ 200
 * S3 เปลี่ยน status code ไม่ได้ ต่างจาก CloudFront Function เดิมที่ rewrite URI
 * ก่อนคำขอถึง origin จึงได้ 200
 */
resource "aws_s3_bucket_website_configuration" "web" {
  bucket = aws_s3_bucket.web.id

  index_document { suffix = "index.html" }
  error_document { key = "index.html" }
}

# เก็บเวอร์ชันเก่าไว้ — ถ้า deploy frontend ผิดพลาด ย้อนไฟล์กลับได้โดยไม่ต้อง build ใหม่
resource "aws_s3_bucket_versioning" "web" {
  bucket = aws_s3_bucket.web.id
  versioning_configuration { status = "Enabled" }
}

# SSE-S3 ทำงานโปร่งใสต่อผู้อ่าน — ไฟล์ถูกเข้ารหัสตอนเก็บ
# แต่ผู้ใช้ที่ไม่มี credential ยังโหลดผ่าน website endpoint ได้ปกติ
resource "aws_s3_bucket_server_side_encryption_configuration" "web" {
  bucket = aws_s3_bucket.web.id

  rule {
    apply_server_side_encryption_by_default { sse_algorithm = "AES256" }
  }
}

/**
 * เปิดให้ทุกคนอ่านไฟล์ในนี้ได้
 *
 * ต้องมี ListBucket ด้วย ไม่ใช่แค่ GetObject — ถ้าไม่มี S3 จะตอบ 403 เมื่อหาไฟล์ไม่เจอ
 * เพื่อไม่เปิดเผยว่าไฟล์นั้นมีอยู่หรือไม่ ซึ่งทำให้ ErrorDocument ไม่ถูกส่งกลับอย่างที่ควร
 * และ SPA routing พังทั้งหมด เมื่อมี ListBucket S3 จะตอบ 404 แล้วส่ง index.html กลับให้
 *
 * ข้อแลกเปลี่ยนที่ยอมรับ: ใคร ๆ ก็เรียกดูรายชื่อไฟล์ใน bucket ได้
 * ซึ่งทั้งหมดเป็นผลลัพธ์ build ของ frontend ที่เป็นข้อมูลสาธารณะอยู่แล้ว
 * ห้ามเอาไฟล์ที่ไม่ควรเปิดเผยมาวางใน bucket นี้เด็ดขาด
 */
resource "aws_s3_bucket_policy" "web" {
  bucket = aws_s3_bucket.web.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid       = "PublicReadForStaticWebsiteHosting"
      Effect    = "Allow"
      Principal = "*"
      Action    = ["s3:GetObject", "s3:ListBucket"]
      Resource  = [aws_s3_bucket.web.arn, "${aws_s3_bucket.web.arn}/*"]
    }]
  })

  # ต้องปลด Block Public Access ให้เสร็จก่อน ไม่งั้น S3 ปฏิเสธนโยบายนี้
  depends_on = [aws_s3_bucket_public_access_block.web]
}

output "bucket_name" { value = aws_s3_bucket.web.id }

# รูปแบบ: <bucket>.s3-website-us-east-1.amazonaws.com (ไม่มี scheme นำหน้า)
output "website_endpoint" { value = aws_s3_bucket_website_configuration.web.website_endpoint }
