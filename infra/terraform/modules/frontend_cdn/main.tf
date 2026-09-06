/**
 * S3 + CloudFront สำหรับ frontend
 *
 * bucket เป็นแบบ private ทั้งหมด — CloudFront เข้าถึงผ่าน Origin Access Control (OAC)
 * ซึ่งเป็นวิธีที่ AWS แนะนำแทน Origin Access Identity (OAI) แบบเดิม
 * ผลคือไม่มีใครเปิดไฟล์ตรงจาก URL ของ S3 ได้ ต้องผ่าน CloudFront เท่านั้น
 */

variable "name" { type = string }
variable "alb_domain_name" {
  description = "ที่อยู่ของ ALB — ใช้เป็น origin ที่สองสำหรับเส้นทาง /api และ /health"
  type        = string
}
variable "tags" { type = map(string) }

resource "aws_s3_bucket" "web" {
  bucket        = "${var.name}-web"
  force_destroy = true # โครงงานลบทิ้งบ่อย ระบบจริงต้องเป็น false

  tags = merge(var.tags, { Name = "${var.name}-web" })
}

resource "aws_s3_bucket_public_access_block" "web" {
  bucket = aws_s3_bucket.web.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# เก็บเวอร์ชันเก่าไว้ — ถ้า deploy frontend ผิดพลาด ย้อนไฟล์กลับได้โดยไม่ต้อง build ใหม่
resource "aws_s3_bucket_versioning" "web" {
  bucket = aws_s3_bucket.web.id
  versioning_configuration { status = "Enabled" }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "web" {
  bucket = aws_s3_bucket.web.id

  rule {
    apply_server_side_encryption_by_default { sse_algorithm = "AES256" }
  }
}

resource "aws_cloudfront_origin_access_control" "web" {
  name = "${var.name}-oac"
  # ให้ CloudFront อ่าน S3 ที่เป็น private ได้
  description                       = "Lets CloudFront read the private S3 bucket"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

/**
 * แก้ปัญหาเส้นทางของ Single Page Application ที่ต้นทาง
 *
 * React Router จัดการเส้นทางที่ฝั่งเบราว์เซอร์ แต่ S3 ไม่รู้จัก /app/bookings
 * เพราะไม่มีไฟล์ชื่อนั้นอยู่จริง เมื่อผู้ใช้กด refresh หรือเปิดลิงก์ตรง จะได้ 404
 *
 * ฟังก์ชันนี้ทำงานก่อนที่คำขอจะไปถึง S3 และทำงานเฉพาะกับ behavior ของไฟล์เว็บเท่านั้น
 * คำขอที่ไปยัง /api/* ไม่ผ่านฟังก์ชันนี้ จึงยังคืนสถานะจริงจาก API ได้ถูกต้อง
 */
resource "aws_cloudfront_function" "spa_router" {
  name    = "${var.name}-spa-router"
  runtime = "cloudfront-js-2.0"
  comment = "Rewrites SPA routes to /index.html"
  publish = true

  code = <<-JS
    function handler(event) {
      var request = event.request;
      var uri = request.uri;

      // เส้นทางที่ลงท้ายด้วยนามสกุลไฟล์คือไฟล์จริงใน S3 ปล่อยผ่านไปตามปกติ
      if (uri.indexOf('.') !== -1) {
        return request;
      }

      // ที่เหลือคือเส้นทางของ React Router ให้ส่ง index.html ไปแทน
      // แล้วให้ React Router อ่าน URL เดิมจากเบราว์เซอร์เองว่าต้องแสดงหน้าไหน
      request.uri = '/index.html';
      return request;
    }
  JS
}

resource "aws_cloudfront_distribution" "web" {
  enabled             = true
  is_ipv6_enabled     = true
  default_root_object = "index.html"
  comment             = "${var.name} frontend"
  price_class         = "PriceClass_200" # ครอบคลุมเอเชียโดยไม่จ่ายค่า edge ทั่วโลก

  origin {
    domain_name              = aws_s3_bucket.web.bucket_regional_domain_name
    origin_id                = "s3-web"
    origin_access_control_id = aws_cloudfront_origin_access_control.web.id
  }

  /**
   * ALB เป็น origin ที่สอง — เหตุผลสำคัญ
   *
   * ถ้าให้เบราว์เซอร์เรียก API ไปที่ ALB ตรง ๆ จะเจอสองปัญหาพร้อมกัน:
   *   1. หน้าเว็บเสิร์ฟผ่าน HTTPS จาก CloudFront แต่ ALB เป็น HTTP
   *      เบราว์เซอร์จะบล็อกทุกคำขอด้วยกฎ mixed content — ระบบใช้งานไม่ได้เลย
   *   2. คนละโดเมนกัน จึงต้องตั้ง CORS ให้ถูกต้องอีกชั้น
   *
   * การให้ CloudFront เป็นทางเข้าเดียวแก้ทั้งสองข้อพร้อมกัน: ผู้ใช้คุยกับโดเมนเดียว
   * ผ่าน HTTPS ตลอด กลายเป็น same-origin จึงไม่ต้องมี CORS เลย
   * และไม่ต้องซื้อใบรับรอง เพราะ CloudFront มีใบรับรองของตัวเองให้ฟรี
   */
  origin {
    domain_name = var.alb_domain_name
    origin_id   = "alb-api"

    custom_origin_config {
      http_port  = 80
      https_port = 443
      # ALB ยังไม่มีใบรับรอง ACM ช่วงนี้ CloudFront จึงคุยกับ ALB ด้วย HTTP
      # ข้อจำกัด: การรับส่งระหว่าง CloudFront กับ ALB ยังไม่ถูกเข้ารหัส
      # (อยู่ในเครือข่ายของ AWS) เมื่อมีใบรับรองแล้วให้เปลี่ยนเป็น https-only
      origin_protocol_policy = "http-only"
      origin_ssl_protocols   = ["TLSv1.2"]
    }
  }

  default_cache_behavior {
    target_origin_id       = "s3-web"
    viewer_protocol_policy = "redirect-to-https" # บังคับ HTTPS ทุกคำขอ
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD"]
    compress               = true

    # CachingOptimized — นโยบายสำเร็จรูปของ AWS สำหรับไฟล์ static
    cache_policy_id = "658327ea-f89d-4fab-a63d-7e88639e58f6"

    function_association {
      event_type   = "viewer-request"
      function_arn = aws_cloudfront_function.spa_router.arn
    }
  }

  # เส้นทาง API ส่งต่อไปที่ ALB โดยไม่แคชเลย
  # ข้อมูลการจองต้องสดเสมอ ถ้าแคชผู้ใช้จะเห็นพื้นที่คงเหลือที่ล้าสมัย
  ordered_cache_behavior {
    path_pattern           = "/api/*"
    target_origin_id       = "alb-api"
    viewer_protocol_policy = "https-only"
    allowed_methods        = ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"]
    cached_methods         = ["GET", "HEAD"]
    compress               = true

    # CachingDisabled
    cache_policy_id = "4135ea2d-6df8-44a3-9df3-4b5a84be39ad"
    # AllViewerExceptHostHeader — ส่ง header Authorization ต่อไปให้ ALB
    # ถ้าไม่ส่งต่อ JWT จะหายกลางทางและทุกคำขอจะได้ 401
    origin_request_policy_id = "b689b0a8-53d0-40ab-baf2-68738e2966ac"
  }

  # health check เปิดให้เรียกผ่านโดเมนเดียวกันได้ ใช้กับหน้า "สถานะระบบ"
  ordered_cache_behavior {
    path_pattern             = "/health*"
    target_origin_id         = "alb-api"
    viewer_protocol_policy   = "https-only"
    allowed_methods          = ["GET", "HEAD", "OPTIONS"]
    cached_methods           = ["GET", "HEAD"]
    cache_policy_id          = "4135ea2d-6df8-44a3-9df3-4b5a84be39ad"
    origin_request_policy_id = "b689b0a8-53d0-40ab-baf2-68738e2966ac"
  }

  /**
   * ตั้งใจไม่ใช้ custom_error_response สำหรับ 403/404
   *
   * วิธีที่พบบ่อยคือให้ CloudFront เจอ 403/404 แล้วส่ง index.html กลับพร้อมสถานะ 200
   * แต่ custom_error_response มีผลกับ "ทั้ง distribution" ไม่แยกตาม behavior
   * เมื่อ API อยู่ใต้โดเมนเดียวกัน คำขออย่าง GET /api/bookings/999 ที่ควรได้ 404
   * จะถูกแทนที่ด้วย index.html และสถานะ 200 ทำให้หน้าเว็บแยกไม่ออกว่าเกิดอะไรขึ้น
   * และการจัดการข้อผิดพลาดทั้งระบบพังทันที
   *
   * จึงแก้ที่ต้นทางแทนด้วย CloudFront Function ที่ทำงานเฉพาะ behavior ของไฟล์เว็บ
   * (ดูฟังก์ชัน spa_router ด้านล่าง)
   */

  restrictions {
    geo_restriction { restriction_type = "none" }
  }

  viewer_certificate {
    cloudfront_default_certificate = true # ใบรับรองฟรีของ CloudFront (*.cloudfront.net)
  }

  tags = merge(var.tags, { Name = "${var.name}-cdn" })
}

# อนุญาตเฉพาะ CloudFront distribution ตัวนี้ตัวเดียวให้อ่าน bucket
resource "aws_s3_bucket_policy" "web" {
  bucket = aws_s3_bucket.web.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid       = "AllowCloudFrontServicePrincipal"
      Effect    = "Allow"
      Principal = { Service = "cloudfront.amazonaws.com" }
      # ต้องมี ListBucket ด้วย ไม่งั้น S3 จะตอบ 403 แทน 404 เมื่อไม่พบไฟล์
      # ซึ่งทำให้แยกไม่ออกระหว่าง "ไม่มีสิทธิ์" กับ "ไม่มีไฟล์"
      Action   = ["s3:GetObject", "s3:ListBucket"]
      Resource = [aws_s3_bucket.web.arn, "${aws_s3_bucket.web.arn}/*"]
      Condition = {
        StringEquals = {
          "AWS:SourceArn" = aws_cloudfront_distribution.web.arn
        }
      }
    }]
  })

  depends_on = [aws_s3_bucket_public_access_block.web]
}

output "bucket_name" { value = aws_s3_bucket.web.id }
output "domain_name" { value = aws_cloudfront_distribution.web.domain_name }
output "distribution_id" { value = aws_cloudfront_distribution.web.id }
