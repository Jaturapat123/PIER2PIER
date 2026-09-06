import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import type { Booking, BookingStatus, Paged } from '../lib/types';
import { Button, EmptyState, ErrorNotice, Loading, StatusBadge } from '../components/ui';
import PageHeader from '../components/PageHeader';
import { BOOKING_STATUS_LABEL, baht, dateOnly, dateTime, num } from '../lib/format';

const FILTERS: Array<{ value: '' | BookingStatus; label: string }> = [
  { value: '', label: 'ทั้งหมด' },
  { value: 'pending', label: BOOKING_STATUS_LABEL.pending },
  { value: 'confirmed', label: BOOKING_STATUS_LABEL.confirmed },
  { value: 'in_progress', label: BOOKING_STATUS_LABEL.in_progress },
  { value: 'completed', label: BOOKING_STATUS_LABEL.completed },
  { value: 'cancelled', label: BOOKING_STATUS_LABEL.cancelled },
];

/** UC-7 View Bookings */
export default function Bookings() {
  const [items, setItems] = useState<Booking[]>([]);
  const [status, setStatus] = useState<'' | BookingStatus>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    setError('');
    api
      .get<Paged<Booking>>(`/api/bookings?pageSize=50${status ? `&status=${status}` : ''}`)
      .then((r) => setItems(r.items))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [status]);

  return (
    <>
      <PageHeader
        title="การจองของฉัน"
        description="รายการจองและคำสั่งขนส่งทั้งหมด เรียงจากรายการล่าสุด"
        actions={
          <Link
            to="/app/bookings/new"
            className="inline-flex min-h-[44px] items-center rounded-md bg-hivis px-4 font-medium text-white
                       transition-colors duration-150 hover:bg-amber-700"
          >
            สร้างการจอง
          </Link>
        }
      />

      <div className="mb-4 flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setStatus(f.value)}
            className={`min-h-[38px] rounded-md px-3 text-sm transition-colors duration-150
              ${status === f.value ? 'bg-ink font-medium text-white' : 'bg-white text-steel-600 hover:bg-steel-50'}`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <Loading />
      ) : error ? (
        <ErrorNotice message={error} onRetry={() => setStatus(status)} />
      ) : items.length === 0 ? (
        <div className="panel">
          <EmptyState
            title={status ? 'ไม่มีรายการจองในสถานะนี้' : 'ยังไม่มีรายการจอง'}
            description="เริ่มจากเลือกเที่ยวเรือที่ตรงกับเส้นทางของคุณ แล้วระบุจำนวนตู้ที่ต้องการ"
            action={
              <Link to="/app/bookings/new">
                <Button>สร้างการจองแรก</Button>
              </Link>
            }
          />
        </div>
      ) : (
        <div className="panel overflow-x-auto">
          <table className="w-full min-w-[820px] border-collapse">
            <thead>
              <tr className="table-head">
                <th className="px-4 py-2.5">เลขที่การจอง</th>
                <th className="px-4 py-2.5">เที่ยวเรือ</th>
                <th className="px-4 py-2.5">เส้นทาง</th>
                <th className="px-4 py-2.5">ออกเดินทาง</th>
                <th className="px-4 py-2.5 text-right">TEU</th>
                <th className="px-4 py-2.5 text-right">ราคา</th>
                <th className="px-4 py-2.5">สถานะ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-steel-200">
              {items.map((b) => (
                <tr key={b.id} className="hover:bg-steel-50">
                  <td className="px-4 py-2.5">
                    <Link
                      to={`/app/bookings/${b.id}`}
                      className="tabular font-medium text-sea underline-offset-2 hover:underline"
                    >
                      {b.booking_no}
                    </Link>
                    <p className="text-sm text-steel-500">{dateOnly(b.created_at)}</p>
                  </td>
                  <td className="px-4 py-2.5">
                    <p className="text-steel-700">{b.vessel_name}</p>
                    <p className="tabular text-sm text-steel-500">{b.voyage_no}</p>
                  </td>
                  <td className="px-4 py-2.5 text-sm text-steel-600">
                    {b.origin_port} → {b.destination_port}
                  </td>
                  <td className="px-4 py-2.5 text-sm text-steel-600">{dateTime(b.etd)}</td>
                  <td className="tabular px-4 py-2.5 text-right text-steel-700">{num(b.total_teu, 1)}</td>
                  <td className="tabular px-4 py-2.5 text-right text-steel-700">{baht(b.total_price)}</td>
                  <td className="px-4 py-2.5">
                    <StatusBadge status={b.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
