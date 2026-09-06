import type { BookingStatus, ScheduleStatus, ServiceType, ShipmentStatus } from './types';

/** จัดรูปแบบตัวเลข/วันที่แบบไทยที่เดียว เพื่อให้ทุกหน้าแสดงเหมือนกัน */

export const baht = (v: string | number) =>
  new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB', maximumFractionDigits: 0 }).format(
    Number(v)
  );

export const num = (v: string | number, digits = 0) =>
  new Intl.NumberFormat('th-TH', { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(
    Number(v)
  );

export const dateTime = (v: string | null) =>
  v
    ? new Intl.DateTimeFormat('th-TH', {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(new Date(v))
    : '—';

export const dateOnly = (v: string | null) =>
  v ? new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium' }).format(new Date(v)) : '—';

/** "อีก 3 วัน" / "เลยกำหนดแล้ว" — อ่านง่ายกว่าวันที่ดิบเมื่อดูว่ายังจองทันไหม */
export function relativeDays(v: string): string {
  const diff = Math.ceil((new Date(v).getTime() - Date.now()) / 86400000);
  if (diff < 0) return 'เลยกำหนดแล้ว';
  if (diff === 0) return 'วันนี้';
  if (diff === 1) return 'พรุ่งนี้';
  return `อีก ${diff} วัน`;
}

export const SERVICE_TYPE_LABEL: Record<ServiceType, string> = {
  import: 'นำเข้า',
  export: 'ส่งออก',
  transshipment: 'ถ่ายลำ',
  storage: 'ฝากตู้',
};

export const BOOKING_STATUS_LABEL: Record<BookingStatus, string> = {
  pending: 'รอยืนยัน',
  confirmed: 'ยืนยันแล้ว',
  in_progress: 'กำลังดำเนินการ',
  completed: 'เสร็จสิ้น',
  cancelled: 'ยกเลิก',
};

export const SCHEDULE_STATUS_LABEL: Record<ScheduleStatus, string> = {
  open: 'เปิดจอง',
  closing: 'ใกล้ปิดรับ',
  closed: 'ปิดรับแล้ว',
  departed: 'ออกเดินทางแล้ว',
};

export const SHIPMENT_STATUS_LABEL: Record<ShipmentStatus, string> = {
  created: 'สร้างคำสั่งแล้ว',
  gate_in: 'ตู้เข้าประตูท่า',
  loaded: 'ขึ้นเรือแล้ว',
  departed: 'เรือออกจากท่า',
  delivered: 'ส่งถึงปลายทาง',
};

export const SHIPMENT_STEPS: ShipmentStatus[] = ['created', 'gate_in', 'loaded', 'departed', 'delivered'];
