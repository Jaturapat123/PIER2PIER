/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** ที่อยู่ของ API — ตอน build จริงชี้ไปที่ ALB ตอน dev ปล่อยว่างแล้วใช้ proxy ของ Vite */
  readonly VITE_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
