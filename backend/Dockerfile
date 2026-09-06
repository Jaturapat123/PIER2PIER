# Multi-stage build — ชั้นแรกลง dependency ทั้งหมด ชั้นสุดท้ายเอาเฉพาะ production
# ทำให้ image เล็กลงมาก ซึ่งสำคัญเพราะ EC2 ต้อง docker pull ทุกครั้งที่ deploy
FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

FROM node:20-alpine AS runtime

# tini เป็น PID 1 ที่ส่งต่อ SIGTERM ให้ node ได้ถูกต้อง
# ถ้าไม่มี node จะเป็น PID 1 เองแล้วไม่ได้รับสัญญาณ → graceful shutdown ไม่ทำงาน
# → ตอน rolling deploy ผู้ใช้จะเจอ connection ถูกตัดกลางคัน
RUN apk add --no-cache tini curl

WORKDIR /app
ENV NODE_ENV=production

COPY --from=deps /app/node_modules ./node_modules
COPY package*.json ./
COPY src ./src

# ไม่รันด้วย root — ถ้ามีช่องโหว่ในแอป ผู้โจมตีจะไม่ได้สิทธิ์เต็มใน container
USER node

EXPOSE 3000

# ให้ Docker รู้สถานะ container ด้วย (คนละชั้นกับ health check ของ ALB)
HEALTHCHECK --interval=15s --timeout=3s --start-period=20s --retries=3 \
  CMD curl -fsS http://localhost:3000/health/live || exit 1

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "src/server.js"]
