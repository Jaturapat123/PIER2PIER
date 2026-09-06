terraform {
  required_version = ">= 1.6"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.60"
    }
  }

  # เมื่อทำงานเป็นทีม 6 คน ให้เปิด backend นี้เพื่อให้ state อยู่ที่เดียวกัน
  # ไม่งั้นแต่ละคนจะมี state คนละชุดแล้วสร้างทรัพยากรซ้ำกัน
  # backend "s3" {
  #   bucket         = "pier2pier-tfstate"
  #   key            = "wms/terraform.tfstate"
  #   region         = "ap-southeast-1"
  #   dynamodb_table = "pier2pier-tflock"
  #   encrypt        = true
  # }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project = var.project
    }
  }
}
