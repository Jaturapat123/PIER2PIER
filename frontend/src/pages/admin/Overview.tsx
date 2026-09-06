import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api } from '../../lib/api';
import { CapacityMeter, ErrorNotice, Loading, StatCard } from '../../components/ui';
import PageHeader from '../../components/PageHeader';
import { baht, dateOnly, num } from '../../lib/format';

type Summary = {
  bookings: Record<string, number>;
  customers: { total_customers: number; active_customers: number };
  stock: { total_items: number; low_stock_items: number };
  schedules: { open_schedules: number; avg_utilization_pct: number };
  operations: { avg_dwell_hours: number | null; measured_shipments: number };
  trend: Array<{ date: string; bookings: number; revenue: string; teu: string }>;
  topServices: Array<{ code: string; name: string; booking_count: number; revenue: string }>;
  scheduleUtilization: Array<{
    voyage_no: string;
    vessel_name: string;
    service_name: string;
    capacity_teu: number;
    booked_teu: number;
    utilization_pct: number;
  }>;
};

const CHART_AXIS = { stroke: '#7E8FA0', fontSize: 12 };

export default function AdminOverview() {
  const [data, setData] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .get<Summary>('/api/admin/reports/summary')
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <Loading />;
  if (error) return <ErrorNotice message={error} onRetry={() => window.location.reload()} />;
  if (!data) return null;

  const trend = data.trend.map((t) => ({
    date: dateOnly(t.date),
    bookings: Number(t.bookings),
    revenue: Number(t.revenue),
  }));

  return (
    <>
      <PageHeader title="ภาพรวมระบบ" description="สรุปการดำเนินงานย้อนหลัง 30 วัน" />

      <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="รายการจองทั้งหมด"
          value={num(data.bookings.total_bookings ?? 0)}
          sub={`รอยืนยัน ${num(data.bookings.pending_bookings ?? 0)} รายการ`}
          tone={Number(data.bookings.pending_bookings) > 0 ? 'warn' : 'default'}
        />
        <StatCard label="รายได้" value={baht(data.bookings.revenue ?? 0)} sub="ไม่รวมรายการที่ยกเลิก" />
        <StatCard
          label="การใช้พื้นที่เฉลี่ย"
          value={`${num(data.schedules.avg_utilization_pct ?? 0, 1)}%`}
          sub={`จากเที่ยวเรือที่เปิดจอง ${num(data.schedules.open_schedules ?? 0)} เที่ยว`}
        />
        <StatCard
          label="สินค้าต่ำกว่าจุดสั่งซื้อ"
          value={num(data.stock.low_stock_items ?? 0)}
          sub={`จากทั้งหมด ${num(data.stock.total_items ?? 0)} รายการ`}
          tone={Number(data.stock.low_stock_items) > 0 ? 'warn' : 'default'}
        />
      </div>

      <div className="mb-5 grid gap-5 lg:grid-cols-2">
        <section className="panel p-5">
          <h2 className="mb-4 text-lg font-medium text-ink">จำนวนการจองรายวัน</h2>
          {trend.length === 0 ? (
            <p className="py-12 text-center text-steel-500">ยังไม่มีข้อมูลการจองในช่วงเวลานี้</p>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={trend} margin={{ top: 5, right: 5, bottom: 5, left: -20 }}>
                <CartesianGrid stroke="#D3DBE3" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="date" tick={CHART_AXIS} tickLine={false} />
                <YAxis tick={CHART_AXIS} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip formatter={(v: number) => [`${num(v)} รายการ`, 'การจอง']} />
                <Line type="monotone" dataKey="bookings" stroke="#0E7490" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </section>

        <section className="panel p-5">
          <h2 className="mb-4 text-lg font-medium text-ink">บริการที่มีรายได้สูงสุด</h2>
          {data.topServices.length === 0 ? (
            <p className="py-12 text-center text-steel-500">ยังไม่มีข้อมูลรายได้ในช่วงเวลานี้</p>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart
                data={data.topServices.slice(0, 6).map((s) => ({ code: s.code, revenue: Number(s.revenue) }))}
                margin={{ top: 5, right: 5, bottom: 5, left: -10 }}
              >
                <CartesianGrid stroke="#D3DBE3" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="code" tick={CHART_AXIS} tickLine={false} />
                <YAxis tick={CHART_AXIS} tickLine={false} axisLine={false} tickFormatter={(v) => `${v / 1000}k`} />
                <Tooltip formatter={(v: number) => [baht(v), 'รายได้']} />
                <Bar dataKey="revenue" fill="#D97706" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </section>
      </div>

      <section className="panel p-5">
        <div className="mb-4 flex items-baseline justify-between gap-3">
          <h2 className="text-lg font-medium text-ink">การใช้พื้นที่ของเที่ยวเรือที่เปิดจอง</h2>
          <Link to="/admin/schedules" className="text-sm font-medium text-sea underline-offset-2 hover:underline">
            จัดการตารางเที่ยวเรือ
          </Link>
        </div>

        {data.scheduleUtilization.length === 0 ? (
          <p className="py-8 text-center text-steel-500">ยังไม่มีเที่ยวเรือที่เปิดรับการจอง</p>
        ) : (
          <ul className="space-y-3.5">
            {data.scheduleUtilization.slice(0, 8).map((s) => (
              <li key={s.voyage_no}>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-steel-700">
                    <span className="tabular font-medium">{s.voyage_no}</span> · {s.vessel_name}
                  </p>
                  <p className="tabular text-sm text-steel-500">{num(s.utilization_pct, 1)}%</p>
                </div>
                <div className="mt-1.5">
                  <CapacityMeter booked={s.booked_teu} capacity={s.capacity_teu} showNumbers={false} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {data.operations.measured_shipments > 0 && (
        <section className="panel mt-5 p-5">
          <h2 className="text-lg font-medium text-ink">ระยะเวลาตู้อยู่ในเขตท่า (Dwell Time)</h2>
          <p className="mt-1 text-sm text-steel-500">
            เวลาเฉลี่ยตั้งแต่ตู้เข้าประตูท่าจนขึ้นเรือ ใช้หาคอขวดของการดำเนินงาน
          </p>
          <p className="tabular mt-3 text-3xl font-semibold text-ink">
            {num(data.operations.avg_dwell_hours ?? 0, 1)} ชั่วโมง
          </p>
          <p className="mt-1 text-sm text-steel-500">
            วัดจาก <span className="tabular">{num(data.operations.measured_shipments)}</span> คำสั่งขนส่ง
          </p>
        </section>
      )}
    </>
  );
}
