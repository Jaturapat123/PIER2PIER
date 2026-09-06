#!/usr/bin/env bash
#
# ทดสอบความทนทานเมื่อเซิร์ฟเวอร์เครื่องหนึ่งล่ม — หลักฐานสำคัญที่สุดของ Stage 3
#
# ยิงคำขอต่อเนื่อง แล้วปิดเซิร์ฟเวอร์เครื่องหนึ่งระหว่างนั้น
# วัดว่า (ก) ระบบยังให้บริการต่อได้ไหม (ข) มีคำขอที่ล้มเหลวกี่คำขอ
#     (ค) ใช้เวลากี่วินาทีจึงกลับมาให้บริการได้ 100%
#
# วิธีใช้:
#   ./scripts/failover-test.sh local                          # ทดสอบบน docker compose
#   ./scripts/failover-test.sh aws http://<alb-dns> i-0abc123 # ทดสอบบน AWS จริง
#
# ⚠️ โหมด aws จะสั่ง stop EC2 จริง ต้องแน่ใจว่าเป็นเครื่องของโครงงานเท่านั้น

set -euo pipefail

MODE="${1:-local}"
BASE_URL="${2:-http://localhost:8080}"
TARGET="${3:-wms-api-a}"

OUT_DIR="$(dirname "$0")/../results"
mkdir -p "$OUT_DIR"
STAMP=$(date +%Y%m%d-%H%M%S)
RAW="$OUT_DIR/failover-$STAMP.raw"
REPORT="$OUT_DIR/failover-$STAMP.txt"

echo "ทดสอบ Failover"
echo "  โหมด     : $MODE"
echo "  ปลายทาง  : $BASE_URL"
echo "  เป้าหมาย : $TARGET"
echo ""

stop_target() {
  if [ "$MODE" = "aws" ]; then
    aws ec2 stop-instances --instance-ids "$TARGET" > /dev/null
  else
    docker stop "$TARGET" > /dev/null
  fi
}

start_target() {
  if [ "$MODE" = "aws" ]; then
    aws ec2 start-instances --instance-ids "$TARGET" > /dev/null
  else
    docker start "$TARGET" > /dev/null
  fi
}

: > "$RAW"

# ยิงคำขอทุก 0.2 วินาทีตลอดการทดสอบ
poll() {
  while :; do
    now=$(date +%s.%N)
    if body=$(curl -sS -m 3 "$BASE_URL/health" 2>/dev/null); then
      host=$(echo "$body" | grep -o '"hostname":"[^"]*"' | cut -d'"' -f4)
      echo "$now OK ${host:-UNKNOWN}" >> "$RAW"
    else
      echo "$now FAIL -" >> "$RAW"
    fi
    sleep 0.2
  done
}

poll & POLL_PID=$!
trap 'kill $POLL_PID 2>/dev/null || true' EXIT

echo "ระยะที่ 1: เก็บข้อมูลตอนระบบปกติ (10 วินาที)"
sleep 10
BEFORE=$(wc -l < "$RAW")

echo "ระยะที่ 2: ปิดเซิร์ฟเวอร์ $TARGET"
CUT_TIME=$(date +%s.%N)
stop_target
echo "  ปิดแล้วเมื่อ $(date -Is) — เฝ้าดูต่ออีก 30 วินาที"
sleep 30
AFTER_STOP=$(wc -l < "$RAW")

echo "ระยะที่ 3: เปิดเซิร์ฟเวอร์กลับ"
start_target
echo "  รอให้ ALB ตรวจสุขภาพผ่านและส่งคำขอกลับมา (60 วินาที)"
sleep 60

kill $POLL_PID 2>/dev/null || true
wait $POLL_PID 2>/dev/null || true

{
  echo "ผลการทดสอบ Failover"
  echo "========================================"
  echo "เวลาที่ทดสอบ  : $(date -Is)"
  echo "ปลายทาง       : $BASE_URL"
  echo "เครื่องที่ปิด : $TARGET"
  echo ""
  echo "ระยะที่ 1 — ก่อนปิดเครื่อง"
  echo "----------------------------------------"
  head -n "$BEFORE" "$RAW" | awk '{print $3}' | sort | uniq -c \
    | awk '{printf "  %5d คำขอ  %s\n", $1, $2}'
  echo ""
  echo "ระยะที่ 2 — หลังปิดเครื่อง"
  echo "----------------------------------------"
  sed -n "$((BEFORE + 1)),${AFTER_STOP}p" "$RAW" | awk '{print $3}' | sort | uniq -c \
    | awk '{printf "  %5d คำขอ  %s\n", $1, $2}'
  echo ""
  echo "ระยะที่ 3 — หลังเปิดเครื่องกลับ"
  echo "----------------------------------------"
  sed -n "$((AFTER_STOP + 1)),\$p" "$RAW" | awk '{print $3}' | sort | uniq -c \
    | awk '{printf "  %5d คำขอ  %s\n", $1, $2}'
  echo ""
  echo "ตัวชี้วัดความต่อเนื่องของบริการ"
  echo "----------------------------------------"
  TOTAL=$(wc -l < "$RAW")
  FAILS=$(grep -c ' FAIL ' "$RAW" || true)
  echo "  คำขอทั้งหมด    : $TOTAL"
  echo "  คำขอที่ล้มเหลว : $FAILS"
  awk -v t="$TOTAL" -v f="$FAILS" 'BEGIN {printf "  ความพร้อมใช้งาน: %.2f%%\n", (t-f)/t*100}'

  # คำนวณว่าขาดช่วงบริการนานเท่าไร (ถ้ามี)
  FIRST_FAIL=$(grep -n ' FAIL ' "$RAW" | head -1 | cut -d: -f1 || true)
  LAST_FAIL=$(grep -n ' FAIL ' "$RAW" | tail -1 | cut -d: -f1 || true)
  if [ -n "$FIRST_FAIL" ]; then
    T1=$(sed -n "${FIRST_FAIL}p" "$RAW" | cut -d' ' -f1)
    T2=$(sed -n "${LAST_FAIL}p" "$RAW" | cut -d' ' -f1)
    awk -v a="$T1" -v b="$T2" 'BEGIN {printf "  ช่วงที่ขาดบริการ: %.1f วินาที\n", b-a}'
  else
    echo "  ช่วงที่ขาดบริการ: ไม่มีเลย"
  fi
  echo ""
  echo "สรุป"
  echo "----------------------------------------"
  if [ "$FAILS" -eq 0 ]; then
    echo "  ผ่าน — ระบบให้บริการต่อเนื่องตลอดช่วงที่เซิร์ฟเวอร์เครื่องหนึ่งหยุดทำงาน"
    echo "  Load Balancer ย้ายคำขอทั้งหมดไปเครื่องที่เหลือโดยผู้ใช้ไม่รับรู้"
  else
    echo "  มีคำขอล้มเหลว $FAILS ครั้ง — ตรวจสอบค่า health check interval"
    echo "  และ deregistration delay ของ target group"
  fi
} | tee "$REPORT"

echo ""
echo "บันทึกผลไว้ที่ $REPORT"
