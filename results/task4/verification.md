# Task 4: AWS Academy apply verification (2026-10-14)

Region: `us-east-1`; account: `975143535471`; Terraform image tag: `76a0442`.

## Terraform outputs

- `alb_dns_name`: `pier2pier-dev-alb-915363844.us-east-1.elb.amazonaws.com`
- `web_endpoint`: `http://pier2pier-dev-web.s3-website-us-east-1.amazonaws.com`
- `ecr_repository_url`: `975143535471.dkr.ecr.us-east-1.amazonaws.com/pier2pier-dev-api`
- EC2: `i-020b5a37d2ce3c5cc` in `us-east-1a`, `i-0bb4d7aed59725692` in `us-east-1b`

## Live checks

- Terraform apply completed with 54 resources after the initial ECR target apply.
- RDS `pier2pier-dev-mysql`: `MultiAZ=true`, primary `us-east-1b`, standby `us-east-1a`, `db.t3.micro`, `gp2`.
- ALB target health: both instances `healthy`.
- `GET /health` via ALB: HTTP 200, `status=ok`, `db.ok=true`, image tag `76a0442`.
- S3 website root: HTTP 200; frontend loads seeded vessel schedules through the ALB API.
- Demo customer login from S3 website succeeded and opened `/app` with customer dashboard data.
- S3 SPA deep route test returned HTTP 404 with `index.html` as the response body, as expected for S3 website error documents.

## Lab-specific adjustments

- RDS rejected a generated password longer than 41 characters; the ignored local `terraform.tfvars` now uses a 32-character password.
- RDS storage changed from `gp3` to `gp2`, as supported by this Learner Lab.
- ECR rejected parentheses in the `Team` tag; the tag is now `Pier2Pier J3K`.
- The lab SCP denies `s3:GetBucketObjectLockConfiguration`, which the Terraform AWS provider calls automatically when reading `aws_s3_bucket`. The S3 bucket was created and verified, then removed from Terraform state; Terraform manages its website settings while the bucket itself is managed by AWS CLI for this lab. `manage_frontend_bucket=false` is set only in the ignored local tfvars.
- EC2 user-data logs in to the ECR registry hostname, then pulls the tagged repository image.

## Screenshots

- [S3 landing page](s3-home.jpg)
- [Customer dashboard after login](customer-dashboard.jpg)

All URLs above are temporary Learner Lab endpoints and will stop working after the required teardown.

## Teardown

- `terraform destroy` completed; a second run reconciled the ECR repository that had an untagged image.
- The lab-only S3 bucket was emptied of all 5 object versions and deleted with AWS CLI.
- Final Terraform managed-resource state count: `0`.
- RDS, ALB, ECR repository and S3 bucket: absent.
- Both EC2 instances: `terminated`; both NAT gateways: `deleted`; no project Elastic IP remains.
- Temporary AWS credential file, local Terraform state files, and Docker ECR login token were removed after teardown. The ignored local `terraform.tfvars` remains for a future lab session.
