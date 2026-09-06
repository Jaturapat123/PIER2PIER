#!/usr/bin/env bash
#
# ตรวจสอบว่าระบบใช้งานได้จริงหลัง deploy
#
# ไล่ตามเส้นทางที่ผู้ใช้ทำจริง: เข้าสู่ระบบ → ค้นหาเที่ยวเรือ → สร้างการจอง
# → ยืนยัน → ยกเลิก (เพื่อคืนพื้นที่ ไม่ทิ้งขยะไว้ในระบบ)
#
# วิธีใช้:
#   ./scripts/smoke.sh http://<alb-dns-name>
#   ./scripts/smoke.sh http://localhost:8080

set -euo pipefail

BASE="${1:-http://localhost:8080}"
EMAIL="${SMOKE_EMAIL:-customer@pier2pier.test}"
PASSWORD="${SMOKE_PASSWORD:-Pier2Pier!2569}"

pass=0
fail=0

check() {
  local label="$1" expected="$2" actual="$3"
  if [ "$expected" = "$actual" ]; then
    echo "  ผ่าน   $label (ได้ $actual)"
    pass=$((pass + 1))
  else
    echo "  ไม่ผ่าน $label (คาดว่า $expected แต่ได้ $actual)"
    fail=$((fail + 1))
  fi
}

status_of() { echo "$1" | tail -1; }
body_of() { echo "$1" | head -n -1; }

call() {
  local method="$1" path="$2" data="${3:-}" token="${4:-}"
  local args=(-sS -m 10 -X "$method" -w '\n%{http_code}')
  [ -n "$data" ] && args+=(-H 'Content-Type: application/json' -d "$data")
  [ -n "$token" ] && args+=(-H "Authorization: Bearer $token")
  curl "${args[@]}" "$BASE$path"
}

echo "ตรวจสอบระบบที่ $BASE"
echo ""

echo "1. สถานะเซิร์ฟเวอร์"
r=$(call GET /health)
check "health check ตอบ 200" 200 "$(status_of "$r")"
SHA=$(body_of "$r" | grep -o '"gitSha":"[^"]*"' | cut -d'"' -f4)
HOST=$(body_of "$r" | grep -o '"hostname":"[^"]*"' | cut -d'"' -f4)
echo "         เวอร์ชัน $SHA จากเครื่อง $HOST"

echo ""
echo "2. ข้อมูลสาธารณะ (ไม่ต้องเข้าสู่ระบบ)"
check "ดูรายการบริการได้" 200 "$(status_of "$(call GET /api/services)")"
check "ค้นหาเที่ยวเรือได้" 200 "$(status_of "$(call GET '/api/schedules?availableOnly=true')")"
check "ดูประเภทตู้ได้" 200 "$(status_of "$(call GET /api/container-types)")"
check "เรียก API ที่ต้องล็อกอินโดยไม่มี token ถูกปฏิเสธ" 401 "$(status_of "$(call GET /api/bookings)")"

echo ""
echo "3. เข้าสู่ระบบ"
r=$(call POST /api/auth/login "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}")
check "เข้าสู่ระบบสำเร็จ" 200 "$(status_of "$r")"
TOKEN=$(body_of "$r" | grep -o '"token":"[^"]*"' | cut -d'"' -f4)

r=$(call POST /api/auth/login "{\"email\":\"$EMAIL\",\"password\":\"wrong\"}")
check "รหัสผ่านผิดถูกปฏิเสธ" 401 "$(status_of "$r")"

if [ -z "$TOKEN" ]; then
  echo ""
  echo "หยุดการตรวจสอบ: เข้าสู่ระบบไม่สำเร็จจึงทดสอบขั้นถัดไปไม่ได้"
  exit 1
fi

echo ""
echo "4. เส้นทางการจอง"
SCHEDULE_ID=$(body_of "$(call GET '/api/schedules?availableOnly=true&pageSize=1')" \
  | grep -o '"id":[0-9]*' | head -1 | cut -d: -f2)
TYPE_ID=$(body_of "$(call GET /api/container-types)" \
  | grep -o '"id":[0-9]*' | head -1 | cut -d: -f2)

if [ -z "$SCHEDULE_ID" ] || [ -z "$TYPE_ID" ]; then
  echo "  ข้าม — ไม่มีเที่ยวเรือที่เปิดจองหรือไม่มีประเภทตู้ในระบบ"
else
  PAYLOAD="{\"schedule_id\":$SCHEDULE_ID,\"cargo_type\":\"smoke test\",\"items\":[{\"container_type_id\":$TYPE_ID,\"qty\":1}]}"
  r=$(call POST /api/bookings "$PAYLOAD" "$TOKEN")
  check "สร้างการจองได้" 201 "$(status_of "$r")"
  BOOKING_ID=$(body_of "$r" | grep -o '"id":[0-9]*' | head -1 | cut -d: -f2)

  if [ -n "$BOOKING_ID" ]; then
    check "ยืนยันการจองได้" 200 "$(status_of "$(call POST "/api/bookings/$BOOKING_ID/confirm" '' "$TOKEN")")"
    check "ยืนยันซ้ำถูกปฏิเสธ" 409 "$(status_of "$(call POST "/api/bookings/$BOOKING_ID/confirm" '' "$TOKEN")")"
    # ยกเลิกเพื่อคืนพื้นที่ ไม่ทิ้งรายการทดสอบค้างไว้ในระบบจริง
    check "ยกเลิกการจองได้ (คืนพื้นที่)" 200 "$(status_of "$(call POST "/api/bookings/$BOOKING_ID/cancel" '' "$TOKEN")")"
  fi
fi

echo ""
echo "5. การควบคุมสิทธิ์"
check "ลูกค้าเรียก API ผู้ดูแลระบบไม่ได้" 403 "$(status_of "$(call GET /api/admin/users '' "$TOKEN")")"

echo ""
echo "========================================"
echo "ผ่าน $pass รายการ · ไม่ผ่าน $fail รายการ"

[ "$fail" -eq 0 ] || exit 1
echo "ระบบพร้อมใช้งาน"
