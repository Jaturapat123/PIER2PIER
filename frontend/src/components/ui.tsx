import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react';
import { AlertCircle, Loader2 } from 'lucide-react';
import type { BookingStatus, ScheduleStatus } from '../lib/types';
import { BOOKING_STATUS_LABEL, SCHEDULE_STATUS_LABEL, num } from '../lib/format';

/* ── ปุ่ม ─────────────────────────────────────────────────────────────── */

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md';
  loading?: boolean;
};

const BUTTON_VARIANTS = {
  primary: 'bg-hivis text-white hover:bg-amber-700 active:bg-amber-800',
  secondary: 'border border-steel-300 bg-white text-steel-700 hover:bg-steel-50 active:bg-steel-100',
  ghost: 'text-steel-600 hover:bg-steel-100 active:bg-steel-200',
  danger: 'bg-red-700 text-white hover:bg-red-800 active:bg-red-900',
};

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled,
  children,
  className = '',
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      // ปิดปุ่มระหว่างรอผลเสมอ ไม่งั้นผู้ใช้กดยืนยันการจองซ้ำได้
      disabled={disabled || loading}
      className={`inline-flex min-h-[44px] items-center justify-center gap-2 rounded-md font-medium
        transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-45
        ${size === 'sm' ? 'min-h-[38px] px-3 text-sm' : 'px-4'}
        ${BUTTON_VARIANTS[variant]} ${className}`}
    >
      {loading && <Loader2 size={16} className="animate-spin" aria-hidden />}
      {children}
    </button>
  );
}

/* ── ฟอร์ม ────────────────────────────────────────────────────────────── */

type FieldProps = {
  label: string;
  error?: string;
  hint?: string;
  required?: boolean;
  children: ReactNode;
  htmlFor?: string;
};

export function Field({ label, error, hint, required, children, htmlFor }: FieldProps) {
  return (
    <div>
      <label className="field-label" htmlFor={htmlFor}>
        {label}
        {required && (
          <span className="ml-1 text-red-700" aria-label="จำเป็นต้องกรอก">
            *
          </span>
        )}
      </label>
      {children}
      {/* ข้อความช่วยเหลืออยู่ใต้ช่องเสมอ ไม่ซ่อนไว้ใน placeholder ที่หายไปตอนพิมพ์ */}
      {hint && !error && <p className="mt-1.5 text-sm text-steel-500">{hint}</p>}
      {error && (
        <p className="field-error" role="alert">
          <AlertCircle size={16} className="mt-0.5 shrink-0" aria-hidden />
          {error}
        </p>
      )}
    </div>
  );
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`field-input ${props.className ?? ''}`} />;
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`field-input ${props.className ?? ''}`} />;
}

/* ── สถานะ ────────────────────────────────────────────────────────────── */

const BOOKING_TONE: Record<BookingStatus, string> = {
  pending: 'bg-amber-50 text-amber-800 ring-amber-200',
  confirmed: 'bg-cyan-50 text-cyan-800 ring-cyan-200',
  in_progress: 'bg-blue-50 text-blue-800 ring-blue-200',
  completed: 'bg-green-50 text-green-800 ring-green-200',
  cancelled: 'bg-steel-100 text-steel-500 ring-steel-200',
};

const SCHEDULE_TONE: Record<ScheduleStatus, string> = {
  open: 'bg-green-50 text-green-800 ring-green-200',
  closing: 'bg-amber-50 text-amber-800 ring-amber-200',
  closed: 'bg-steel-100 text-steel-500 ring-steel-200',
  departed: 'bg-steel-100 text-steel-500 ring-steel-200',
};

/**
 * ป้ายสถานะ — มีทั้งสีและข้อความเสมอ
 * ผู้ใช้ที่แยกสีไม่ได้ต้องอ่านสถานะออกจากคำ ไม่ใช่จากสีอย่างเดียว
 */
export function StatusBadge({ status, kind = 'booking' }: { status: string; kind?: 'booking' | 'schedule' }) {
  const tone =
    kind === 'booking'
      ? (BOOKING_TONE[status as BookingStatus] ?? BOOKING_TONE.cancelled)
      : (SCHEDULE_TONE[status as ScheduleStatus] ?? SCHEDULE_TONE.closed);
  const label =
    kind === 'booking'
      ? (BOOKING_STATUS_LABEL[status as BookingStatus] ?? status)
      : (SCHEDULE_STATUS_LABEL[status as ScheduleStatus] ?? status);

  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded px-2 py-0.5 text-sm font-medium ring-1 ring-inset ${tone}`}
    >
      {label}
    </span>
  );
}

/* ── มาตรวัดพื้นที่เที่ยวเรือ ───────────────────────────────────────────── */

/**
 * องค์ประกอบหลักที่บ่งบอกตัวตนของระบบนี้ — เกจบอกพื้นที่ระวางที่ถูกจองไปแล้ว
 *
 * ใช้ซ้ำในหน้าค้นหาเที่ยวเรือ ขั้นตอนการจอง และรายงาน เพื่อให้ "ที่ว่างเหลือเท่าไหร่"
 * เป็นข้อมูลชิ้นเดียวที่ผู้ใช้จำได้ทั้งระบบ
 * เมื่อใกล้เต็ม (>= 90%) จะขึ้นลายทางเฉียงแบบแถบเตือนในเขตท่าเรือ
 */
export function CapacityMeter({
  booked,
  capacity,
  showNumbers = true,
}: {
  booked: number;
  capacity: number;
  showNumbers?: boolean;
}) {
  const pct = capacity > 0 ? Math.min((booked / capacity) * 100, 100) : 0;
  const available = Math.max(capacity - booked, 0);
  const nearlyFull = pct >= 90;

  return (
    <div>
      <div
        className="relative h-2.5 w-full overflow-hidden rounded-full bg-steel-200"
        role="meter"
        aria-valuenow={Math.round(pct)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`ใช้พื้นที่ไปแล้ว ${Math.round(pct)} เปอร์เซ็นต์ เหลือ ${available} TEU`}
      >
        <div
          className={`h-full transition-[width] duration-300 ${nearlyFull ? '' : 'bg-sea'}`}
          style={{
            width: `${pct}%`,
            ...(nearlyFull
              ? {
                  backgroundImage:
                    'repeating-linear-gradient(45deg, #B45309 0 6px, #D97706 6px 12px)',
                }
              : {}),
          }}
        />
      </div>
      {showNumbers && (
        <p className="mt-1.5 text-sm text-steel-500">
          จองแล้ว <span className="tabular text-steel-700">{num(booked)}</span> จาก{' '}
          <span className="tabular text-steel-700">{num(capacity)}</span> TEU
          {available > 0 ? (
            <>
              {' · '}
              <span className={nearlyFull ? 'font-medium text-amber-800' : ''}>
                เหลือ <span className="tabular">{num(available)}</span> TEU
              </span>
            </>
          ) : (
            <span className="font-medium text-amber-800">{' · '}เต็มแล้ว</span>
          )}
        </p>
      )}
    </div>
  );
}

/* ── สถานะว่าง / โหลด / ผิดพลาด ───────────────────────────────────────── */

export function EmptyState({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
      <p className="text-lg font-medium text-steel-700">{title}</p>
      {description && <p className="mt-1.5 max-w-md text-steel-500">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Loading({ label = 'กำลังโหลดข้อมูล' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2.5 py-16 text-steel-500">
      <Loader2 size={18} className="animate-spin" aria-hidden />
      <span>{label}</span>
    </div>
  );
}

/** แสดง error พร้อมทางออกเสมอ ไม่ปล่อยให้ผู้ใช้ตัน */
export function ErrorNotice({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex items-start gap-3 rounded-md border border-red-200 bg-red-50 px-4 py-3" role="alert">
      <AlertCircle size={18} className="mt-0.5 shrink-0 text-red-700" aria-hidden />
      <div className="flex-1">
        <p className="text-red-800">{message}</p>
        {onRetry && (
          <button onClick={onRetry} className="mt-1.5 font-medium text-red-800 underline underline-offset-2">
            ลองใหม่อีกครั้ง
          </button>
        )}
      </div>
    </div>
  );
}

/* ── การ์ดสถิติ ───────────────────────────────────────────────────────── */

export function StatCard({
  label,
  value,
  sub,
  tone = 'default',
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: 'default' | 'warn';
}) {
  return (
    <div className="panel px-4 py-3.5">
      <p className="text-sm text-steel-500">{label}</p>
      <p className={`tabular mt-1 text-2xl font-semibold ${tone === 'warn' ? 'text-amber-800' : 'text-ink'}`}>
        {value}
      </p>
      {sub && <p className="mt-0.5 text-sm text-steel-500">{sub}</p>}
    </div>
  );
}
