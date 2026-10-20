# ขั้นตอน Deploy Pier2Pier บน AWS Academy Learner Lab

คู่มือนี้ใช้ **PowerShell บน Windows** โดยเริ่มคำสั่งจากโฟลเดอร์รากของ repository (`PIER2PIER`) และอ้างอิงการ deploy ที่ทำสำเร็จเมื่อ 14 ต.ค. 2569 ใน `us-east-1` ผลรอบนั้นอยู่ที่ [หลักฐานงานที่ 4](../results/task4/verification.md) ระบบรอบนั้นถูก `destroy` แล้ว URL ในหลักฐานจึงใช้ต่อไม่ได้

> แล็บมีค่าใช้จ่ายขณะเปิด EC2, RDS, ALB และ NAT Gateway ให้เตรียมเวลาทดสอบและเก็บภาพก่อน apply แล้ว destroy เมื่อจบ รอบที่ทดสอบหน้าแล็บแสดงวงเงิน $50 ให้ตรวจยอดและเวลาคงเหลือของ session ปัจจุบันเอง

## 1. เตรียมเครื่องและเริ่มแล็บ

ต้องมี Terraform, AWS CLI v2, Docker Desktop, Node.js/npm และ Git ลองเช็กก่อน:

```powershell
terraform version
aws --version
docker version
node --version
npm --version
```

1. เข้าหน้า **AWS Academy → Learner Lab** แล้วกด **Start Lab** รอให้สถานะเป็น **Ready**
2. เปิด **AWS Details → AWS CLI → Show** และคัดลอก credential block ที่มี `[default]`, access key, secret key และ session token
3. สร้างโฟลเดอร์ Terraform แล้วบันทึก block นั้นลงไฟล์ credential ชั่วคราวที่ถูก `.gitignore` ครอบไว้ **อย่าวาง AWS keys ในแชตหรือ commit ลง Git**

```powershell
terraform '-chdir=infra/terraform' init
notepad .\infra\terraform\.terraform\aws-lab-credentials
```

ใน PowerShell หน้าต่าง **เดียวกัน** ตั้งค่าให้ AWS CLI และ Terraform ใช้ credential ไฟล์นี้ แล้วตรวจบัญชี:

```powershell
$env:AWS_SHARED_CREDENTIALS_FILE = (Resolve-Path '.\infra\terraform\.terraform\aws-lab-credentials').Path
$env:AWS_PROFILE = 'default'
$env:AWS_DEFAULT_REGION = 'us-east-1'
aws sts get-caller-identity
```

ถ้าเปิด PowerShell ใหม่ ต้องตั้งตัวแปร `$env:` สามตัวนี้ใหม่ credential ของ Learner Lab หมดอายุเมื่อ session จบ และต้องคัดลอกชุดใหม่ในรอบถัดไป

## 2. ตั้งค่า Terraform สำหรับแล็บ

คัดลอกไฟล์ตัวอย่างถ้ายังไม่มี `terraform.tfvars` แล้วเปิดแก้:

```powershell
if (-not (Test-Path '.\infra\terraform\terraform.tfvars')) {
    Copy-Item '.\infra\terraform\terraform.tfvars.example' '.\infra\terraform\terraform.tfvars'
}
$ImageTag = (git rev-parse --short HEAD).Trim()
$Name = 'pier2pier-dev' # ต้องตรงกับ <project>-<environment> ใน terraform.tfvars
Write-Output "image_tag ที่ต้องใส่ใน tfvars: $ImageTag"
notepad .\infra\terraform\terraform.tfvars
```

ค่าที่ต้องตรวจใน `terraform.tfvars`:

| ค่า | ใช้ในแล็บ |
|---|---|
| `aws_region` | `"us-east-1"` |
| `project`, `environment` | `"pier2pier"`, `"dev"` ตามตัวอย่าง |
| `db_multi_az` | `true` สำหรับพิสูจน์ Multi-AZ |
| `db_password` | สุ่มเองและยาว **ไม่เกิน 41 ตัวอักษร**; รอบก่อนใช้ 32 ตัวอักษร |
| `jwt_secret` | สุ่มเองและไม่ใช้ซ้ำกับรหัสผ่าน DB |
| `image_tag` | ค่า `$ImageTag` จาก Git; ต้องตรงกับ tag ที่ push ไป ECR |
| `manage_frontend_bucket` | `false` สำหรับ Learner Lab นี้ เพราะ SCP ปฏิเสธ API ที่ Terraform ใช้อ่าน S3 Object Lock |
| `alarm_email` | `""` หากยังไม่ต้องการส่งอีเมลแจ้งเตือน |

`terraform.tfvars` ถูก ignore อยู่แล้ว แต่ยังเก็บความลับไว้ในเครื่อง ตรวจด้วย `git status --short` ว่าไฟล์นี้ไม่ถูกเสนอให้ commit

```powershell
terraform '-chdir=infra/terraform' fmt -recursive -check
terraform '-chdir=infra/terraform' validate
```

## 3. สร้าง S3 bucket และ ECR image ก่อน apply ทั้งระบบ

S3 bucket ของค่าตัวอย่างชื่อ `pier2pier-dev-web` ต้องสร้างด้วย AWS CLI ก่อน เพราะ Terraform provider อ่าน `s3:GetBucketObjectLockConfiguration` แล้วถูก SCP ของแล็บปฏิเสธ เมื่อ `manage_frontend_bucket=false` Terraform จะจัดการ **การตั้งค่าเว็บไซต์** แต่จะไม่สร้างหรือลบตัว bucket

```powershell
$Bucket = "${Name}-web"
aws s3api create-bucket --bucket $Bucket --region us-east-1
aws s3api head-bucket --bucket $Bucket
```

ชื่อ bucket ใช้ร่วมกันทั่ว AWS ถ้าชื่อนี้มีเจ้าของอื่น ให้เปลี่ยน `project` หรือ `environment` ใน `terraform.tfvars` และแก้ `$Name` ให้ตรงก่อนสร้าง ห้ามใช้ bucket ของบัญชีอื่น

สร้าง ECR ก่อน แล้ว build และ push API image ที่ EC2 จะดึงตอนบูต:

```powershell
terraform '-chdir=infra/terraform' apply '-target=module.ecr'
$EcrRepo = (terraform '-chdir=infra/terraform' output -raw ecr_repository_url).Trim()
$EcrRegistry = $EcrRepo.Split('/')[0]

docker build --platform linux/amd64 -t "pier2pier-api:$ImageTag" .\backend
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin $EcrRegistry
docker tag "pier2pier-api:$ImageTag" "${EcrRepo}:$ImageTag"
docker push "${EcrRepo}:$ImageTag"
aws ecr describe-images --repository-name "${Name}-api" --image-ids "imageTag=$ImageTag" --query 'imageDetails[0].imageDigest' --output text
```

คำสั่งสุดท้ายต้องแสดง digest `sha256:...` ถ้า push หลุดกลางทาง ให้ push tag เดิมซ้ำและรอจนมี digest ก่อน apply ขั้นต่อไป

## 4. Apply และเผยแพร่ frontend

```powershell
terraform '-chdir=infra/terraform' plan
terraform '-chdir=infra/terraform' apply

$AlbDns = (terraform '-chdir=infra/terraform' output -raw alb_dns_name).Trim()
$WebUrl = (terraform '-chdir=infra/terraform' output -raw web_endpoint).Trim()
$Bucket = (terraform '-chdir=infra/terraform' output -raw frontend_bucket).Trim()
$Instances = @(terraform '-chdir=infra/terraform' output -json app_instance_ids | ConvertFrom-Json)
Write-Output "ALB: http://$AlbDns"
Write-Output "Web: $WebUrl"
Write-Output "ECR: $EcrRepo"
```

RDS Multi-AZ อาจใช้เวลาประมาณ 15–20 นาที รอบที่ทดสอบใช้เกือบ 16 นาที หาก apply หยุดกลางทาง ให้แก้ข้อผิดพลาดแล้วรัน `apply` ซ้ำจาก state เดิม **อย่าลบ state ขณะยังมี resource อยู่**

สร้าง frontend โดยฝัง URL ของ ALB แล้วอัปโหลดขึ้น S3:

```powershell
Push-Location .\frontend
$env:VITE_API_BASE_URL = "http://$AlbDns"
npm ci
npm run build
Pop-Location

aws s3 sync '.\frontend\dist\' "s3://$Bucket/" --delete --exclude 'index.html' --cache-control 'public,max-age=31536000,immutable'
aws s3 cp '.\frontend\dist\index.html' "s3://$Bucket/index.html" --content-type 'text/html; charset=utf-8' --cache-control 'no-cache, no-store, must-revalidate'
```

S3 website endpoint และ ALB ของแล็บเป็น **HTTP**; ใช้ URL ที่ Terraform แสดงจริงในแต่ละรอบ เพราะชื่อ DNS ของ ALB เปลี่ยนหลัง destroy/apply ใหม่

## 5. ตรวจระบบและเติมข้อมูลสาธิต

ตรวจว่า RDS เปิด Multi-AZ, ALB มี target สองเครื่องเป็น `healthy` และ API ต่อ DB ได้:

```powershell
aws rds describe-db-instances --db-instance-identifier "${Name}-mysql" --query 'DBInstances[0].[DBInstanceStatus,MultiAZ,AvailabilityZone,SecondaryAvailabilityZone]' --output table
$TargetGroupArn = (aws elbv2 describe-target-groups --names "${Name}-tg" --query 'TargetGroups[0].TargetGroupArn' --output text).Trim()
aws elbv2 describe-target-health --target-group-arn $TargetGroupArn --query 'TargetHealthDescriptions[].{id:Target.Id,state:TargetHealth.State}' --output table
Invoke-RestMethod "http://$AlbDns/health" | ConvertTo-Json -Depth 5
```

หลัง EC2 พร้อม ให้รัน seed **ครั้งเดียว** ผ่าน SSM บนเครื่องแรก ข้อมูลสาธิตจะอยู่ใน RDS ที่ทั้งสองเครื่องใช้ร่วมกัน:

```powershell
$SeedCommand = "sudo docker run --rm --env-file /etc/pier2pier.env ${EcrRepo}:$ImageTag node src/db/seed.js"
$Parameters = @{ commands = @($SeedCommand) } | ConvertTo-Json -Compress
$CommandId = (aws ssm send-command --document-name AWS-RunShellScript --instance-ids $Instances[0] --parameters $Parameters --query 'Command.CommandId' --output text).Trim()
aws ssm get-command-invocation --command-id $CommandId --instance-id $Instances[0] --query '[Status,ResponseCode]' --output json
```

หากสถานะยังเป็น `Pending` ให้ตรวจคำสั่งสุดท้ายซ้ำจนเป็น `Success` และ `ResponseCode` เท่ากับ `0` จากนั้นเปิด `$WebUrl` ในเบราว์เซอร์ หน้าแรกต้องแสดงเที่ยวเรือ และใช้ **บัญชีสาธิตที่แสดงบนหน้าล็อกอิน** เข้าสู่ระบบให้เห็น dashboard ตรวจหน้าเว็บและ API ก่อนถ่าย screenshot ลง `results/` หากเปิด deep link ตรง ๆ แล้ว S3 ตอบ HTTP 404 พร้อม `index.html` เป็นพฤติกรรมที่พบจริงในรอบทดสอบ

## 6. หลังเก็บหลักฐาน: Destroy และตรวจว่าไม่เหลือทรัพยากร

เมื่อบันทึก output, screenshot และผลทดสอบครบแล้ว:

```powershell
terraform '-chdir=infra/terraform' destroy
```

`manage_frontend_bucket=false` ทำให้ bucket ไม่อยู่ใน Terraform state ต้องลบไฟล์ **ทุก version รวม delete marker** แล้วลบ bucket เอง:

```powershell
$Listing = aws s3api list-object-versions --bucket $Bucket --output json | ConvertFrom-Json
$Objects = @($Listing.Versions) + @($Listing.DeleteMarkers) | Where-Object { $_ -and $_.Key -and $_.VersionId }
foreach ($Object in $Objects) {
    aws s3api delete-object --bucket $Bucket --key $Object.Key --version-id $Object.VersionId | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "ลบ S3 object version ไม่สำเร็จ: $($Object.Key)" }
}
aws s3api delete-bucket --bucket $Bucket
```

ถ้า Terraform หยุดเพราะ ECR repository ยังมี image ให้ตรวจว่าโค้ด `modules/ecr/main.tf` มี `force_delete = true`; หากจำเป็น ลบด้วย `aws ecr delete-repository --repository-name "${Name}-api" --force` แล้วรัน `terraform destroy` ซ้ำเพื่อปรับ state

ตรวจผลสุดท้าย: `terraform '-chdir=infra/terraform' state list` ต้องไม่มี **managed resource**; RDS, ALB, ECR, S3 ต้องไม่เหลือ และ EC2/NAT ต้องอยู่สถานะ `terminated`/`deleted` จากนั้นลบ credential ชั่วคราวและ Docker login:

```powershell
docker logout $EcrRegistry
Remove-Item -LiteralPath '.\infra\terraform\.terraform\aws-lab-credentials' -Force
```

เมื่อยืนยันแล้วว่า destroy ครบ ค่อยลบไฟล์ `terraform.tfstate*` ในเครื่องหากไม่ต้องเก็บ เพราะ state backup อาจมีรหัสผ่าน DB/JWT ส่วน `terraform.tfvars` ก็มีความลับและถูก ignore อยู่ ต้องไม่ส่งให้ผู้อื่นหรือ commit

## งานต่อจากนี้

การตั้ง GitHub Secrets (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_SESSION_TOKEN`) และทดสอบ workflow deploy/rollback จริงอยู่ใน **งานที่ 5**; credential ทั้งสามหมดอายุเมื่อ lab session จบ จึงต้องอัปเดตก่อนรัน workflow รอบใหม่
