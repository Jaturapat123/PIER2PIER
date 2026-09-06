import { useCallback, useEffect, useState } from 'react';
import { Download } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api } from '../../lib/api';
import { Button, ErrorNotice, Loading, StatCard } from '../../components/ui';
import PageHeader from '../../components/PageHeader';
import { baht, dateOnly, num } from '../../lib/format';

type Summary = {
  period: { from: string; to: string };
  bookings: Record<string, number>;
  customers: { total_customers: number; active_customers: number };
  stock: { total_items: number; low_stock_items: number };
  schedules: { open_schedules: number; avg_utilization_pct: number };
  operations: { avg_dwell_hours: number | null; measured_shipments: number };
  trend: Array<{ date: string; bookings: number; revenue: string; teu: string }>;
  topServices: Array<{ code: string; name: string; service_type: string; booking_count: number; total_teu: string; revenue: string }>;
};

type StockReport = {
  items: Array<{ sku: string; name: string; warehouse_zone: string | null; qty_on_hand: number; reorder_level: number; is_low: 0 | 1; unit: string }>;
  byZone: Array<{ zone: string; item_count: number; total_qty: number }>;
};

const CHART_AXIS = { stroke: '#7E8FA0', fontSize: 12 };
const today = () => new Date().toISOString().slice(0, 10);
const daysAgo = (n: number) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);

/** UC-15 View Reports */
export default function AdminReports() {
  const [from, setFrom] = useState(daysAgo(30));
  const [to, setTo] = useState(today());
  const [tab, setTab] = useState<'bookings' | 'services' | 'stock'>('bookings');

  const [summary, setSummary] = useState<Summary | null>(null);
  const [stock, setStock] = useState<StockReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [downloading, setDownloading] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setError('');
    Promise.all([
      api.get<Summary>(`/api/admin/reports/summary?from=${from}&to=${to}`),
      api.get<StockReport>('/api/admin/reports/stock'),
    ])
      .then(([s, st]) => {
        setSummary(s);
        setStock(st);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [from, to]);

  useEffect(load, [load]);

  const exportCsv = async () => {
    setDownloading(true);
    try {
      const path =
        tab === 'stock'
          ? '/api/admin/reports/stock?format=csv'
          : `/api/admin/reports/${tab}?from=${from}&to=${to}&format=csv`;
      await api.download(path, `pier2pier-${tab}-${from}-ถึง-${to}.csv`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'ดาวน์โหลดไม่สำเร็จ');
    } finally {
      setDownloading(false);
    }
  };

  if (loading) return <Loading />;
  if (error) return <ErrorNotice message={error} onRetry={load} />;
  if (!summary || !stock) return null;

  const trend = summary.trend.map((t) => ({
    date: dateOnly(t.date),
    bookings: Number(t.bookings),
    revenue: Number(t.revenue),
    teu: Number(t.teu),
  }));

  return (
    <>
      <PageHeader
        title="รายงาน"
        description="สรุปยอดการจอง รายได้ บริการที่ได้รับความนิยม และสถานะสินค้าคงคลัง"
        actions={
          <Button onClick={exportCsv} loading={downloading} variant="secondary">
            <Download size={16} aria-hidden />
            ส่งออก CSV
          </Button>
        }
      />

      <div className="panel mb-5 flex flex-wrap items-end gap-3 p-4">
        <div>
          <label className="field-label" htmlFor="from">
            ตั้งแต่วันที่
          </label>
          <input id="from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="field-input" />
        </div>
        <div>
          <label className="field-label" htmlFor="to">
            ถึงวันที่
          </label>
          <input id="to" type="date" value={to} onChange={(e) => setTo(e.target.value)} className="field-input" />
        </div>
        <Button variant="secondary" onClick={load}>
          ปรับช่วงเวลา
        </Button>
      </div>

      <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="รายการจอง" value={num(summary.bookings.total_bookings ?? 0)} sub={`ยกเลิก ${num(summary.bookings.cancelled_bookings ?? 0)} รายการ`} />
        <StatCard label="รายได้รวม" value={baht(summary.bookings.revenue ?? 0)} sub="ไม่รวมรายการที่ยกเลิก" />
        <StatCard label="พื้นที่ที่จอง" value={`${num(summary.bookings.total_teu ?? 0, 1)} TEU`} />
        <StatCard
          label="ลูกค้าที่ใช้งานอยู่"
          value={num(summary.customers.active_customers ?? 0)}
          sub={`จากทั้งหมด ${num(summary.customers.total_customers ?? 0)} ราย`}
        />
      </div>

      <div className="mb-4 flex flex-wrap gap-1.5">
        {[
          { value: 'bookings' as const, label: 'ยอดการจอง' },
          { value: 'services' as const, label: 'บริการยอดนิยม' },
          { value: 'stock' as const, label: 'สินค้าคงคลัง' },
        ].map((t) => (
          <button
            key={t.value}
            onClick={() => setTab(t.value)}
            className={`min-h-[38px] rounded-md px-3 text-sm transition-colors duration-150
              ${tab === t.value ? 'bg-ink font-medium text-white' : 'bg-white text-steel-600 hover:bg-steel-50'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'bookings' && (
        <section className="panel p-5">
          <h2 className="mb-4 text-lg font-medium text-ink">ยอดการจองและรายได้รายวัน</h2>
          {trend.length === 0 ? (
            <p className="py-16 text-center text-steel-500">
              ไม่มีข้อมูลการจองในช่วงวันที่ที่เลือก ลองขยายช่วงเวลาให้กว้างขึ้น
            </p>
          ) : (
            <ResponsiveContainer width="100%" height={320}>
              <LineChart data={trend} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
                <CartesianGrid stroke="#D3DBE3" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="date" tick={CHART_AXIS} tickLine={false} />
                <YAxis yAxisId="left" tick={CHART_AXIS} tickLine={false} axisLine={false} allowDecimals={false} />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  tick={CHART_AXIS}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => `${v / 1000}k`}
                />
                <Tooltip
                  formatter={(v: number, name: string) =>
                    name === 'รายได้' ? [baht(v), name] : [`${num(v)} รายการ`, name]
                  }
                />
                <Legend />
                <Line yAxisId="left" type="monotone" dataKey="bookings" name="การจอง" stroke="#0E7490" strokeWidth={2} dot={false} />
                <Line yAxisId="right" type="monotone" dataKey="revenue" name="รายได้" stroke="#D97706" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </section>
      )}

      {tab === 'services' && (
        <section className="panel p-5">
          <h2 className="mb-4 text-lg font-medium text-ink">บริการที่สร้างรายได้สูงสุด</h2>
          {summary.topServices.length === 0 ? (
            <p className="py-16 text-center text-steel-500">ไม่มีข้อมูลรายได้ในช่วงวันที่ที่เลือก</p>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart
                  data={summary.topServices.map((s) => ({ code: s.code, revenue: Number(s.revenue) }))}
                  margin={{ top: 5, right: 10, bottom: 5, left: 0 }}
                >
                  <CartesianGrid stroke="#D3DBE3" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="code" tick={CHART_AXIS} tickLine={false} />
                  <YAxis tick={CHART_AXIS} tickLine={false} axisLine={false} tickFormatter={(v) => `${v / 1000}k`} />
                  <Tooltip formatter={(v: number) => [baht(v), 'รายได้']} />
                  <Bar dataKey="revenue" fill="#D97706" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>

              <div className="mt-5 overflow-x-auto">
                <table className="w-full min-w-[640px] border-collapse">
                  <thead>
                    <tr className="table-head">
                      <th className="px-4 py-2.5">บริการ</th>
                      <th className="px-4 py-2.5 text-right">จำนวนการจอง</th>
                      <th className="px-4 py-2.5 text-right">TEU</th>
                      <th className="px-4 py-2.5 text-right">รายได้</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-steel-200">
                    {summary.topServices.map((s) => (
                      <tr key={s.code}>
                        <td className="px-4 py-2.5">
                          <p className="tabular text-sm text-steel-500">{s.code}</p>
                          <p className="text-steel-700">{s.name}</p>
                        </td>
                        <td className="tabular px-4 py-2.5 text-right text-steel-700">{num(s.booking_count)}</td>
                        <td className="tabular px-4 py-2.5 text-right text-steel-700">{num(s.total_teu, 1)}</td>
                        <td className="tabular px-4 py-2.5 text-right text-steel-700">{baht(s.revenue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>
      )}

      {tab === 'stock' && (
        <div className="space-y-5">
          <section className="panel p-5">
            <h2 className="mb-4 text-lg font-medium text-ink">ปริมาณสินค้าตามโซนจัดเก็บ</h2>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart
                data={stock.byZone.map((z) => ({ zone: z.zone, qty: Number(z.total_qty) }))}
                margin={{ top: 5, right: 10, bottom: 5, left: 0 }}
              >
                <CartesianGrid stroke="#D3DBE3" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="zone" tick={CHART_AXIS} tickLine={false} />
                <YAxis tick={CHART_AXIS} tickLine={false} axisLine={false} />
                <Tooltip formatter={(v: number) => [num(v), 'จำนวนรวม']} />
                <Bar dataKey="qty" fill="#0E7490" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </section>

          <section className="panel overflow-x-auto">
            <h2 className="border-b border-steel-200 px-5 py-4 text-lg font-medium text-ink">
              รายการสินค้าคงคลัง ({num(stock.items.filter((i) => i.is_low).length)} รายการต่ำกว่าจุดสั่งซื้อ)
            </h2>
            <table className="w-full min-w-[720px] border-collapse">
              <thead>
                <tr className="table-head">
                  <th className="px-4 py-2.5">สินค้า</th>
                  <th className="px-4 py-2.5">โซน</th>
                  <th className="px-4 py-2.5 text-right">คงเหลือ</th>
                  <th className="px-4 py-2.5 text-right">จุดสั่งซื้อ</th>
                  <th className="px-4 py-2.5">สถานะ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-steel-200">
                {stock.items.map((i) => (
                  <tr key={i.sku} className={i.is_low ? 'bg-amber-50/60' : ''}>
                    <td className="px-4 py-2.5">
                      <p className="tabular text-sm text-steel-500">{i.sku}</p>
                      <p className="text-steel-700">{i.name}</p>
                    </td>
                    <td className="tabular px-4 py-2.5 text-sm text-steel-600">{i.warehouse_zone ?? '—'}</td>
                    <td className="tabular px-4 py-2.5 text-right text-steel-700">
                      {num(i.qty_on_hand)} {i.unit}
                    </td>
                    <td className="tabular px-4 py-2.5 text-right text-steel-600">{num(i.reorder_level)}</td>
                    <td className="px-4 py-2.5 text-sm">
                      <span className={i.is_low ? 'text-amber-800' : 'text-green-700'}>
                        {i.is_low ? 'ต่ำกว่าจุดสั่งซื้อ' : 'ปกติ'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </div>
      )}
    </>
  );
}
