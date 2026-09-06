#!/bin/bash
set -euo pipefail

# สคริปต์นี้รันครั้งเดียวตอนเครื่อง boot ครั้งแรก
# หน้าที่: ติดตั้ง Docker แล้วเอาแอปขึ้นมารัน โดยดึงความลับจาก SSM ไม่ใช่ฝังไว้ในไฟล์นี้
# (user-data อ่านได้จาก EC2 console ใครที่เห็นก็เห็นทุกอย่างในนี้)

exec > >(tee /var/log/user-data.log) 2>&1
echo "[user-data] เริ่มตั้งค่าเครื่องเมื่อ $(date -Is)"

# Amazon Linux 2023 มี AWS CLI v2 ติดตั้งมาให้แล้วในชื่อคำสั่ง aws
# และไม่มีแพ็กเกจชื่อ awscli ในคลัง ถ้าสั่งติดตั้งจะล้มเหลว
# แล้ว set -e จะหยุดสคริปต์ทั้งไฟล์ ทำให้เครื่องไม่ได้ติดตั้งแอปเลย
dnf update -y
dnf install -y docker
systemctl enable --now docker

# ยืนยันว่าเครื่องมือที่จำเป็นใช้ได้จริงก่อนไปต่อ
command -v aws > /dev/null || { echo "[user-data] ไม่พบคำสั่ง aws บนเครื่อง"; exit 1; }
command -v curl > /dev/null || dnf install -y curl-minimal

# CloudWatch agent เป็นของเสริม — log ของ container ส่งผ่าน awslogs driver อยู่แล้ว
# ถ้าติดตั้งไม่ได้ก็ไม่ควรทำให้ทั้งเครื่องใช้งานไม่ได้
dnf install -y amazon-cloudwatch-agent || echo "[user-data] ข้ามการติดตั้ง CloudWatch agent"

# ── ดึงความลับจาก SSM Parameter Store ──────────────────────────────────
DB_PASSWORD=$(aws ssm get-parameter \
  --name "${ssm_password_path}" --with-decryption \
  --region "${aws_region}" --query Parameter.Value --output text)

JWT_SECRET=$(aws ssm get-parameter \
  --name "${ssm_jwt_path}" --with-decryption \
  --region "${aws_region}" --query Parameter.Value --output text)

# เก็บ env ไว้ในไฟล์ที่อ่านได้เฉพาะ root
cat > /etc/pier2pier.env <<ENVFILE
NODE_ENV=production
PORT=${app_port}
DB_HOST=${db_host}
DB_PORT=3306
DB_USER=${db_username}
DB_PASSWORD=$DB_PASSWORD
DB_NAME=${db_name}
DB_POOL_SIZE=10
JWT_SECRET=$JWT_SECRET
JWT_EXPIRES_IN=8h
CORS_ORIGINS=${cors_origins}
IMAGE_TAG=${image_tag}
GIT_SHA=${image_tag}
SHUTDOWN_TIMEOUT_MS=20000
ENVFILE
chmod 600 /etc/pier2pier.env

# ── ล็อกอิน ECR แล้วดึง image ──────────────────────────────────────────
aws ecr get-login-password --region "${aws_region}" \
  | docker login --username AWS --password-stdin "${ecr_repository_url}"

docker pull "${ecr_repository_url}:${image_tag}"

# ── สร้างสคริปต์ deploy ที่ CI/CD จะเรียกซ้ำผ่าน SSM ───────────────────
cat > /usr/local/bin/deploy-app.sh <<'DEPLOYSCRIPT'
#!/bin/bash
# ใช้ทั้งตอน deploy เวอร์ชันใหม่และตอน rollback — ต่างกันแค่ tag ที่ส่งเข้ามา
set -euo pipefail

REGION="$1"
REPO="$2"
TAG="$3"

echo "[deploy] กำลัง deploy tag: $TAG"

aws ecr get-login-password --region "$REGION" | docker login --username AWS --password-stdin "$REPO"
docker pull "$REPO:$TAG"

# บันทึก tag ปัจจุบันไว้ใน env เพื่อให้ /health รายงานเวอร์ชันได้ถูกต้อง
sed -i "s|^IMAGE_TAG=.*|IMAGE_TAG=$TAG|" /etc/pier2pier.env
sed -i "s|^GIT_SHA=.*|GIT_SHA=$TAG|" /etc/pier2pier.env

# docker stop ส่ง SIGTERM ก่อน แล้วรอ 30 วินาที ให้ request ที่ค้างอยู่ทำงานจบ
# ค่านี้ต้องมากกว่า SHUTDOWN_TIMEOUT_MS ของแอป (20 วินาที)
docker stop --time 30 pier2pier-api 2>/dev/null || true
docker rm pier2pier-api 2>/dev/null || true

docker run -d \
  --name pier2pier-api \
  --restart unless-stopped \
  --env-file /etc/pier2pier.env \
  -p 3000:3000 \
  --log-driver awslogs \
  --log-opt awslogs-region="$REGION" \
  --log-opt awslogs-group="${log_group}" \
  --log-opt awslogs-create-group=true \
  "$REPO:$TAG"

# รอให้แอปพร้อมจริงก่อนคืนค่า ไม่งั้น CI/CD จะไป deploy เครื่องถัดไปทั้งที่เครื่องนี้ยังไม่ขึ้น
for i in $(seq 1 30); do
  if curl -fsS "http://localhost:3000/health" > /dev/null 2>&1; then
    echo "[deploy] เครื่องพร้อมให้บริการแล้ว (รอไป $i วินาที)"
    exit 0
  fi
  sleep 1
done

echo "[deploy] ผิดพลาด: แอปไม่ตอบ health check ภายใน 30 วินาที"
docker logs --tail 50 pier2pier-api
exit 1
DEPLOYSCRIPT

chmod +x /usr/local/bin/deploy-app.sh

# ── รัน migration จากเครื่องแรกเท่านั้น ─────────────────────────────────
# ทั้งสองเครื่องรันคำสั่งนี้พร้อมกัน แต่ตาราง schema_migrations กันการรันซ้ำอยู่แล้ว
docker run --rm --env-file /etc/pier2pier.env \
  "${ecr_repository_url}:${image_tag}" node src/db/migrate.js || true

/usr/local/bin/deploy-app.sh "${aws_region}" "${ecr_repository_url}" "${image_tag}"

echo "[user-data] ตั้งค่าเครื่องเสร็จเมื่อ $(date -Is)"
