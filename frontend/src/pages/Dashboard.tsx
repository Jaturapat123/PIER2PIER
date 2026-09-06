import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import type { Booking, Paged, Schedule } from '../lib/types';
import { CapacityMeter, EmptyState, ErrorNotice, Loading, StatCard, StatusBadge } from '../components/ui';
import PageHeader from '../components/PageHeader';
import { baht, dateTime, num, relativeDays } from '../lib/format';

/** หน้าแรกหลังเข้าสู่ระบบของลูกค้า — ตอบว่า "มีอะไรต้องทำต่อ" ก่อนอย่างอื่น */
export default function Dashboard() {
  const { user } = useAuth();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    setError('');
    Promise.all([
      api.get<Paged<Booking>>('/api/bookings?pageSize=5'),
      api.get<Paged<Schedule>>('/api/schedules?availableOnly=true&pageSize=3'),
    ])
      .then(([b, s]) => {
        setBookings(b.items);
        setSchedules(s.items);
      })
      // ถ้ากลืน error ทิ้ง หน้าจะแสดง "ยังไม่มีรายการจอง" ทั้งที่จริงคือโหลดไม่สำเร็จ
      // ผู้ใช้จะเข้าใจผิดว่าข้อมูลของตัวเองหายไป
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  if (loading) return <Loading />;
  if (error) return <ErrorNotice message={error} onRetry={load} />;

  const pending = bookings.filter((b) => b.status === 'pending');
  const active = bookings.filter((b) => ['confirmed', 'in_progress'].includes(b.status));
  const totalTeu = bookings
    .filter((b) => b.status !== 'cancelled')
    .reduce((sum, b) => sum + Number(b.total_teu), 0);

  return (
    <>
      <PageHeader
        title={`สวัสดี ${user?.full_name ?? ''}`}
        description={user?.company_name ? `เข้าใช้งานในนาม ${user.company_name}` : undefined}
      />

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="รอยืนยัน"
          value={num(pending.length)}
          sub={pending.length > 0 ? 'ต้องดำเนินการ' : 'ไม่มีรายการค้าง'}
          tone={pending.length > 0 ? 'warn' : 'default'}
        />
        <StatCard label="กำลังดำเนินการ" value={num(active.length)} sub="ยืนยันแล้วและอยู่ระหว่างขนส่ง" />
        <StatCard label="พื้นที่ที่จองไว้" value={`${num(totalTeu, 1)} TEU`} sub="จากรายการล่าสุด" />
        <StatCard
          label="มูลค่ารวม"
          value={baht(bookings.filter((b) => b.status !== 'cancelled').reduce((s, b) => s + Number(b.total_price), 0))}
          sub="จากรายการล่าสุด"
        />
      </div>

      {pending.length > 0 && (
        <section className="panel mb-6 border-l-4 border-hivis p-5">
          <h2 className="text-lg font-medium text-ink">รายการที่รอการยืนยัน</h2>
          <p className="mt-0.5 text-sm text-steel-500">
            พื้นที่ถูกกันไว้แล้ว แต่จะยังไม่ออกคำสั่งขนส่งจนกว่าคุณจะยืนยัน
          </p>
          <ul className="mt-3.5 space-y-2">
            {pending.map((b) => (
              <li key={b.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-steel-50 px-4 py-3">
                <div>
                  <Link to={`/app/bookings/${b.id}`} className="tabular font-medium text-sea underline-offset-2 hover:underline">
                    {b.booking_no}
                  </Link>
                  <p className="text-sm text-steel-500">
                    {b.vessel_name} · ปิดรับ {relativeDays(b.cutoff_at)}
                  </p>
                </div>
                <Link
                  to={`/app/bookings/${b.id}`}
                  className="inline-flex min-h-[38px] items-center rounded-md bg-hivis px-3 text-sm font-medium text-white hover:bg-amber-700"
                >
                  ตรวจสอบและยืนยัน
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="panel p-5">
          <div className="mb-4 flex items-baseline justify-between gap-3">
            <h2 className="text-lg font-medium text-ink">การจองล่าสุด</h2>
            <Link to="/app/bookings" className="text-sm font-medium text-sea underline-offset-2 hover:underline">
              ดูทั้งหมด
            </Link>
          </div>

          {bookings.length === 0 ? (
            <EmptyState
              title="ยังไม่มีรายการจอง"
              description="เริ่มจากเลือกเที่ยวเรือที่ตรงกับเส้นทางของคุณ"
              action={
                <Link
                  to="/app/bookings/new"
                  className="inline-flex min-h-[44px] items-center rounded-md bg-hivis px-4 font-medium text-white hover:bg-amber-700"
                >
                  สร้างการจอง
                </Link>
              }
            />
          ) : (
            <ul className="divide-y divide-steel-200">
              {bookings.map((b) => (
                <li key={b.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <Link to={`/app/bookings/${b.id}`} className="tabular font-medium text-sea underline-offset-2 hover:underline">
                      {b.booking_no}
                    </Link>
                    <p className="truncate text-sm text-steel-500">
                      {b.vessel_name} · {b.origin_port} → {b.destination_port}
                    </p>
                  </div>
                  <StatusBadge status={b.status} />
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="panel p-5">
          <div className="mb-4 flex items-baseline justify-between gap-3">
            <h2 className="text-lg font-medium text-ink">เที่ยวเรือที่เปิดจอง</h2>
            <Link to="/app/services" className="text-sm font-medium text-sea underline-offset-2 hover:underline">
              ค้นหาเพิ่มเติม
            </Link>
          </div>

          <ul className="space-y-4">
            {schedules.map((s) => (
              <li key={s.id}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-ink">{s.vessel_name}</p>
                    <p className="text-sm text-steel-500">
                      {s.origin_port} → {s.destination_port} · {dateTime(s.etd)}
                    </p>
                  </div>
                  <Link
                    to={`/app/bookings/new?scheduleId=${s.id}`}
                    className="shrink-0 text-sm font-medium text-sea underline-offset-2 hover:underline"
                  >
                    จอง
                  </Link>
                </div>
                <div className="mt-2">
                  <CapacityMeter booked={s.booked_teu} capacity={s.capacity_teu} />
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </>
  );
}
