#!/usr/bin/env bash
#
# ทดสอบการกระจายโหลด — หลักฐานสำหรับ Stage 3
#
# ยิงคำขอต่อเนื่องผ่าน Load Balancer แล้วนับว่าแต่ละเครื่องรับไปกี่คำขอ
# ถ้า ALB ทำงานถูกต้อง สัดส่วนควรใกล้เคียงกันระหว่างเครื่องทั้งหมด
#
# วิธีใช้:
#   ./scripts/loadtest.sh http://<alb-dns-name> 200 10
#   ./scripts/loadtest.sh http://localhost:8080 200 10     # ทดสอบบนเครื่องตัวเอง
#
# เก็บผลไว้ที่ results/loadtest-<เวลา>.txt เพื่อแนบในรายงาน

set -euo pipefail

BASE_URL="${1:-http://localhost:8080}"
TOTAL="${2:-200}"
CONCURRENCY="${3:-10}"

OUT_DIR="$(dirname "$0")/../results"
mkdir -p "$OUT_DIR"
STAMP=$(date +%Y%m%d-%H%M%S)
RAW="$OUT_DIR/loadtest-$STAMP.raw"
REPORT="$OUT_DIR/loadtest-$STAMP.txt"

echo "ทดสอบการกระจายโหลด"
echo "  ปลายทาง : $BASE_URL/health"
echo "  จำนวน   : $TOTAL คำขอ พร้อมกันครั้งละ $CONCURRENCY"
echo ""

: > "$RAW"
START=$(date +%s)

# ยิงเป็นชุด ชุดละ $CONCURRENCY ตัวพร้อมกัน
for ((batch = 0; batch < TOTAL; batch += CONCURRENCY)); do
  for ((i = 0; i < CONCURRENCY && batch + i < TOTAL; i++)); do
    {
      body=$(curl -sS -m 5 -w '\n%{http_code} %{time_total}' "$BASE_URL/health" 2>/dev/null) || {
        echo "ERROR - -" >> "$RAW"
        exit 0
      }
      meta=$(echo "$body" | tail -1)
      json=$(echo "$body" | head -n -1)

      host=$(echo "$json" | grep -o '"hostname":"[^"]*"' | cut -d'"' -f4)
      az=$(echo "$json" | grep -o '"availabilityZone":"[^"]*"' | cut -d'"' -f4)
      code=$(echo "$meta" | cut -d' ' -f1)
      secs=$(echo "$meta" | cut -d' ' -f2)

      echo "${host:-UNKNOWN} ${az:-UNKNOWN} $code $secs" >> "$RAW"
    } &
  done
  wait
  printf '\r  ส่งไปแล้ว %d/%d คำขอ' "$((batch + CONCURRENCY < TOTAL ? batch + CONCURRENCY : TOTAL))" "$TOTAL"
done

END=$(date +%s)
ELAPSED=$((END - START))
printf '\n\n'

{
  echo "ผลการทดสอบการกระจายโหลด"
  echo "========================================"
  echo "เวลาที่ทดสอบ : $(date -Is)"
  echo "ปลายทาง      : $BASE_URL"
  echo "จำนวนคำขอ    : $TOTAL (พร้อมกันครั้งละ $CONCURRENCY)"
  echo "ใช้เวลารวม   : ${ELAPSED} วินาที"
  echo ""
  echo "การกระจายคำขอไปยังแต่ละเครื่อง"
  echo "----------------------------------------"
  awk '{print $1, $2}' "$RAW" | sort | uniq -c | sort -rn \
    | awk -v total="$TOTAL" '{printf "  %6d คำขอ (%5.1f%%)  %s  [%s]\n", $1, $1/total*100, $2, $3}'
  echo ""
  echo "สถานะที่ได้รับ"
  echo "----------------------------------------"
  awk '{print $3}' "$RAW" | sort | uniq -c \
    | awk '{printf "  %6d ครั้ง  HTTP %s\n", $1, $2}'
  echo ""
  echo "เวลาตอบสนอง (วินาที)"
  echo "----------------------------------------"
  awk '$4 != "-" {s+=$4; n++; if($4>max)max=$4; if(min==""||$4<min)min=$4}
       END {if(n>0) printf "  เฉลี่ย %.3f  ต่ำสุด %.3f  สูงสุด %.3f\n", s/n, min, max}' "$RAW"
  echo ""
  echo "สรุป"
  echo "----------------------------------------"
  hosts=$(awk '{print $1}' "$RAW" | grep -v ERROR | sort -u | wc -l)
  errors=$(grep -c ERROR "$RAW" || true)
  echo "  จำนวนเครื่องที่ตอบ : $hosts"
  echo "  คำขอที่ล้มเหลว     : $errors"
  if [ "$hosts" -ge 2 ] && [ "$errors" -eq 0 ]; then
    echo "  ผลลัพธ์: ผ่าน — Load Balancer กระจายคำขอไปหลายเครื่องโดยไม่มีคำขอใดล้มเหลว"
  elif [ "$hosts" -lt 2 ]; then
    echo "  ผลลัพธ์: ต้องตรวจสอบ — มีเครื่องตอบเพียงเครื่องเดียว"
  else
    echo "  ผลลัพธ์: ต้องตรวจสอบ — มีคำขอที่ล้มเหลว $errors ครั้ง"
  fi
} | tee "$REPORT"

echo ""
echo "บันทึกผลไว้ที่ $REPORT"
