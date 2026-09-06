/**
 * ตัวกลางเรียก API ตัวเดียวของทั้งแอป
 *
 * รวมไว้ที่เดียวเพราะทุก request ต้องแนบ JWT เหมือนกัน และต้องแปล error
 * จากรูปแบบ { error: { code, message, details } } ของ backend ให้เป็น
 * ข้อความที่แสดงต่อผู้ใช้ได้ทันที
 */

const TOKEN_KEY = 'pier2pier.token';

// ตอน dev ใช้ proxy ของ Vite ตอน build จริงชี้ไปที่ ALB ผ่านตัวแปรตอน build
const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';

export type FieldError = { field: string; message: string };

export class ApiError extends Error {
  code: string;
  status: number;
  details?: FieldError[] | Record<string, unknown>;

  constructor(status: number, code: string, message: string, details?: ApiError['details']) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }

  /** คืน error รายฟิลด์ให้ฟอร์มไปแสดงใต้ช่องที่ผิด */
  get fieldErrors(): Record<string, string> {
    if (!Array.isArray(this.details)) return {};
    return Object.fromEntries(this.details.map((d) => [d.field, d.message]));
  }
}

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (token: string) => localStorage.setItem(TOKEN_KEY, token);
export const clearToken = () => localStorage.removeItem(TOKEN_KEY);

/**
 * แจ้งทั้งแอปว่าเซสชันใช้ไม่ได้แล้ว
 *
 * ใช้ event ของเบราว์เซอร์แทนการ import สถานะผู้ใช้เข้ามาตรง ๆ
 * เพราะ auth.tsx เรียกใช้ไฟล์นี้อยู่แล้ว ถ้า import กลับไปจะเกิดวงจรพึ่งพากัน
 */
export const SESSION_EXPIRED_EVENT = 'pier2pier:session-expired';

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const token = getToken();

  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: {
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'NETWORK_ERROR', 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาตรวจสอบการเชื่อมต่อแล้วลองใหม่');
  }

  if (res.status === 204) return undefined as T;

  const payload = await res.json().catch(() => null);

  if (!res.ok) {
    const err = payload?.error;
    // token หมดอายุหรือใช้ไม่ได้ — ล้างทิ้งแล้วบอกให้ทั้งแอปรู้
    // ถ้าล้างเฉย ๆ โดยไม่แจ้ง ผู้ใช้จะค้างอยู่หน้าเดิมและเห็นแต่ข้อความผิดพลาด
    // โดยไม่รู้ว่าต้องเข้าสู่ระบบใหม่
    if (res.status === 401) {
      clearToken();
      window.dispatchEvent(new CustomEvent(SESSION_EXPIRED_EVENT));
    }
    throw new ApiError(
      res.status,
      err?.code ?? 'UNKNOWN',
      err?.message ?? 'เกิดข้อผิดพลาดที่ไม่คาดคิด',
      err?.details
    );
  }

  return payload as T;
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, body),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body),
  del: <T>(path: string) => request<T>('DELETE', path),

  /** ดาวน์โหลดไฟล์รายงาน CSV — ต้องแนบ token เองเพราะ <a download> แนบ header ไม่ได้ */
  async download(path: string, filename: string) {
    const res = await fetch(`${BASE_URL}${path}`, {
      headers: { Authorization: `Bearer ${getToken() ?? ''}` },
    });
    if (!res.ok) throw new ApiError(res.status, 'DOWNLOAD_FAILED', 'ดาวน์โหลดรายงานไม่สำเร็จ');

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  },
};
