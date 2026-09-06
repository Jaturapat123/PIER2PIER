import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { X } from 'lucide-react';

/**
 * กล่องโต้ตอบสำหรับเพิ่ม/แก้ไขข้อมูล
 *
 * ต้องปิดด้วย Esc ได้เสมอ และโฟกัสต้องกระโดดเข้ามาในกล่องเมื่อเปิด
 * ไม่งั้นผู้ใช้คีย์บอร์ดจะยังอยู่หลังฉากแล้วหาทางออกไม่เจอ
 */
export default function Modal({
  open,
  title,
  onClose,
  children,
  footer,
  wide = false,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    panelRef.current?.focus();

    // กันหน้าหลังเลื่อนตามขณะกล่องเปิดอยู่
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4">
      {/* ฉากหลังทึบพอให้เนื้อหาข้างหลังไม่แย่งสายตา */}
      <div className="absolute inset-0 bg-ink/55" onClick={onClose} aria-hidden />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={`relative flex max-h-[90dvh] w-full flex-col overflow-hidden rounded-t-xl bg-white
                    shadow-float sm:rounded-xl ${wide ? 'sm:max-w-3xl' : 'sm:max-w-lg'}`}
      >
        <div className="flex items-start justify-between gap-4 border-b border-steel-200 px-5 py-4">
          <h2 className="text-lg font-semibold text-ink">{title}</h2>
          <button
            onClick={onClose}
            className="-mr-1.5 -mt-1 flex h-11 w-11 items-center justify-center rounded-md text-steel-500 hover:bg-steel-100"
            aria-label="ปิด"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>

        {footer && (
          <div className="flex justify-end gap-2 border-t border-steel-200 bg-steel-50 px-5 py-3.5">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
