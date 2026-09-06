/**
 * CloudWatch — Log, Metric และ Alarm ของทุกชั้น
 *
 * ตั้ง alarm ไว้เฉพาะสิ่งที่ "ต้องมีคนลุกมาดู" จริง ๆ ไม่ตั้งเยอะจนคนเลิกสนใจ
 */

variable "name" { type = string }
variable "alb_arn_suffix" { type = string }
variable "target_group_arn_suffix" { type = string }
variable "db_instance_id" { type = string }
variable "alarm_email" { type = string }
variable "tags" { type = map(string) }

resource "aws_cloudwatch_log_group" "app" {
  name              = "/${var.name}/app"
  retention_in_days = 14 # เก็บพอสำหรับหาต้นเหตุย้อนหลัง โดยไม่จ่ายค่าเก็บ log นานเกินจำเป็น

  tags = merge(var.tags, { Name = "${var.name}-app-logs" })
}

resource "aws_sns_topic" "alerts" {
  name = "${var.name}-alerts"
  tags = var.tags
}

resource "aws_sns_topic_subscription" "email" {
  count = var.alarm_email == "" ? 0 : 1

  topic_arn = aws_sns_topic.alerts.arn
  protocol  = "email"
  endpoint  = var.alarm_email
}

/**
 * สัญญาณสำคัญที่สุด: มีเครื่องที่ ALB ถือว่าใช้งานไม่ได้
 *
 * ถ้าเหลือเครื่องเดียว ระบบยังให้บริการได้ แต่ไม่มี HA แล้ว — ต้องรีบแก้ก่อนเครื่องที่สองล่ม
 */
resource "aws_cloudwatch_metric_alarm" "unhealthy_hosts" {
  alarm_name          = "${var.name}-unhealthy-hosts"
  alarm_description   = "มีเซิร์ฟเวอร์ที่ไม่ผ่าน health check — ระบบเหลือเครื่องเดียวและไม่มี HA แล้ว"
  namespace           = "AWS/ApplicationELB"
  metric_name         = "UnHealthyHostCount"
  statistic           = "Maximum"
  period              = 60
  evaluation_periods  = 2
  threshold           = 0
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"

  dimensions = {
    LoadBalancer = var.alb_arn_suffix
    TargetGroup  = var.target_group_arn_suffix
  }

  alarm_actions = [aws_sns_topic.alerts.arn]
  tags          = var.tags
}

resource "aws_cloudwatch_metric_alarm" "alb_5xx" {
  alarm_name          = "${var.name}-alb-5xx"
  alarm_description   = "แอปคืน error 5xx จำนวนมากผิดปกติ"
  namespace           = "AWS/ApplicationELB"
  metric_name         = "HTTPCode_Target_5XX_Count"
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 1
  threshold           = 10
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"

  dimensions = { LoadBalancer = var.alb_arn_suffix }

  alarm_actions = [aws_sns_topic.alerts.arn]
  tags          = var.tags
}

resource "aws_cloudwatch_metric_alarm" "alb_latency" {
  alarm_name          = "${var.name}-alb-latency"
  alarm_description   = "เวลาตอบสนองที่ percentile 99 เกิน 2 วินาที"
  namespace           = "AWS/ApplicationELB"
  metric_name         = "TargetResponseTime"
  extended_statistic  = "p99"
  period              = 300
  evaluation_periods  = 2
  threshold           = 2
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"

  dimensions = { LoadBalancer = var.alb_arn_suffix }

  alarm_actions = [aws_sns_topic.alerts.arn]
  tags          = var.tags
}

resource "aws_cloudwatch_metric_alarm" "rds_cpu" {
  alarm_name          = "${var.name}-rds-cpu"
  alarm_description   = "CPU ของฐานข้อมูลสูงเกิน 80% ต่อเนื่อง"
  namespace           = "AWS/RDS"
  metric_name         = "CPUUtilization"
  statistic           = "Average"
  period              = 300
  evaluation_periods  = 2
  threshold           = 80
  comparison_operator = "GreaterThanThreshold"

  dimensions = { DBInstanceIdentifier = var.db_instance_id }

  alarm_actions = [aws_sns_topic.alerts.arn]
  tags          = var.tags
}

resource "aws_cloudwatch_metric_alarm" "rds_storage" {
  alarm_name          = "${var.name}-rds-storage"
  alarm_description   = "พื้นที่ว่างของฐานข้อมูลเหลือน้อยกว่า 2 GB"
  namespace           = "AWS/RDS"
  metric_name         = "FreeStorageSpace"
  statistic           = "Average"
  period              = 300
  evaluation_periods  = 1
  threshold           = 2147483648
  comparison_operator = "LessThanThreshold"

  dimensions = { DBInstanceIdentifier = var.db_instance_id }

  alarm_actions = [aws_sns_topic.alerts.arn]
  tags          = var.tags
}

# แดชบอร์ดรวมทุกชั้นไว้หน้าเดียว ใช้จับภาพประกอบผลการทดลอง
resource "aws_cloudwatch_dashboard" "main" {
  dashboard_name = "${var.name}-overview"

  dashboard_body = jsonencode({
    widgets = [
      {
        type = "metric", x = 0, y = 0, width = 12, height = 6
        properties = {
          title  = "จำนวนคำขอและ error ที่ Load Balancer"
          region = data.aws_region.current.name
          metrics = [
            ["AWS/ApplicationELB", "RequestCount", "LoadBalancer", var.alb_arn_suffix],
            [".", "HTTPCode_Target_5XX_Count", ".", "."],
            [".", "HTTPCode_Target_2XX_Count", ".", "."]
          ]
          period = 60, stat = "Sum"
        }
      },
      {
        type = "metric", x = 12, y = 0, width = 12, height = 6
        properties = {
          title  = "จำนวนเซิร์ฟเวอร์ที่ให้บริการได้"
          region = data.aws_region.current.name
          metrics = [
            ["AWS/ApplicationELB", "HealthyHostCount", "LoadBalancer", var.alb_arn_suffix, "TargetGroup", var.target_group_arn_suffix],
            [".", "UnHealthyHostCount", ".", ".", ".", "."]
          ]
          period = 60, stat = "Average"
        }
      },
      {
        type = "metric", x = 0, y = 6, width = 12, height = 6
        properties = {
          title  = "เวลาตอบสนอง"
          region = data.aws_region.current.name
          metrics = [
            ["AWS/ApplicationELB", "TargetResponseTime", "LoadBalancer", var.alb_arn_suffix, { stat = "p50" }],
            ["...", { stat = "p99" }]
          ]
          period = 60
        }
      },
      {
        type = "metric", x = 12, y = 6, width = 12, height = 6
        properties = {
          title  = "ฐานข้อมูล"
          region = data.aws_region.current.name
          metrics = [
            ["AWS/RDS", "CPUUtilization", "DBInstanceIdentifier", var.db_instance_id],
            [".", "DatabaseConnections", ".", "."]
          ]
          period = 60, stat = "Average"
        }
      }
    ]
  })
}

data "aws_region" "current" {}

output "log_group_name" { value = aws_cloudwatch_log_group.app.name }
output "sns_topic_arn" { value = aws_sns_topic.alerts.arn }
