import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Search } from 'lucide-react';
import { api } from '../lib/api';
import type { Paged, Schedule } from '../lib/types';
import { Button, CapacityMeter, EmptyState, ErrorNotice, Loading, Select, StatusBadge } from '../components/ui';
import PageHeader from '../components/PageHeader';
import { SERVICE_TYPE_LABEL, baht, dateTime, relativeDays } from '../lib/format';

/**
 * UC-3 View Services + UC-4 Search Services
 *
 * แสดงเป็น "เที่ยวเรือ" ไม่ใช่ "บริการ" เพราะสิ่งที่ลูกค้าจองจริงคือเที่ยวเรือ
 * ที่มีวันออกเดินทางและพื้นที่คงเหลือ ไม่ใช่ตัวบริการลอย ๆ
 */
export default function Services() {
  const [items, setItems] = useState<Schedule[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [q, setQ] = useState('');
  const [type, setType] = useState('');
  const [availableOnly, setAvailableOnly] = useState(true);
  const [submitted, setSubmitted] = useState({ q: '', type: '', availableOnly: true });

  useEffect(() => {
    const params = new URLSearchParams({ pageSize: '30' });
    if (submitted.q) params.set('q', submitted.q);
    if (submitted.type) params.set('serviceType', submitted.type);
    if (submitted.availableOnly) params.set('availableOnly', 'true');

    setLoading(true);
    setError('');
    api
      .get<Paged<Schedule>>(`/api/schedules?${params}`)
      .then((r) => {
        setItems(r.items);
        setTotal(r.total);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [submitted]);

  const search = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted({ q, type, availableOnly });
  };

  return (
    <>
      <PageHeader
        title="บริการและเที่ยวเรือ"
        description="ค้นหาเที่ยวเรือที่ตรงกับเส้นทางและวันที่ที่ต้องการ แล้วสร้างรายการจอง"
      />

      <form onSubmit={search} className="panel mb-5 flex flex-wrap items-end gap-3 p-4">
        <div className="min-w-[240px] flex-1">
          <label className="field-label" htmlFor="q">
            คำค้นหา
          </label>
          <div className="relative">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-steel-400" aria-hidden />
            <input
              id="q"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="ชื่อเรือ เลขเที่ยว ท่าเรือต้นทางหรือปลายทาง"
              className="field-input pl-10"
            />
          </div>
        </div>

        <div className="w-full sm:w-48">
          <label className="field-label" htmlFor="type">
            ประเภทบริการ
          </label>
          <Select id="type" value={type} onChange={(e) => setType(e.target.value)}>
            <option value="">ทุกประเภท</option>
            {Object.entries(SERVICE_TYPE_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </Select>
        </div>

        <label className="flex min-h-[44px] cursor-pointer items-center gap-2.5 px-1 text-steel-600">
          <input
            type="checkbox"
            checked={availableOnly}
            onChange={(e) => setAvailableOnly(e.target.checked)}
            className="h-4 w-4 rounded border-steel-300 text-sea focus:ring-sea"
          />
          เฉพาะที่ยังมีพื้นที่ว่าง
        </label>

        <Button type="submit">ค้นหา</Button>
      </form>

      {loading ? (
        <Loading />
      ) : error ? (
        <ErrorNotice message={error} onRetry={() => setSubmitted({ ...submitted })} />
      ) : items.length === 0 ? (
        <div className="panel">
          <EmptyState
            title="ไม่พบเที่ยวเรือที่ตรงกับเงื่อนไข"
            description="ลองลดเงื่อนไขการค้นหา เช่น เอาตัวกรองประเภทบริการออก หรือรวมเที่ยวที่เต็มแล้วด้วย"
            action={
              <Button variant="secondary" onClick={() => setSubmitted({ q: '', type: '', availableOnly: false })}>
                ล้างตัวกรองทั้งหมด
              </Button>
            }
          />
        </div>
      ) : (
        <>
          <p className="mb-3 text-sm text-steel-500">
            พบ <span className="tabular">{total}</span> เที่ยวเรือ
          </p>

          <ul className="grid gap-4 lg:grid-cols-2">
            {items.map((s) => (
              <li key={s.id} className="panel flex flex-col p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="truncate text-lg font-medium text-ink">{s.vessel_name}</h2>
                    <p className="tabular text-sm text-steel-500">
                      {s.voyage_no} · IMO {s.imo_number}
                    </p>
                  </div>
                  <StatusBadge status={s.status} kind="schedule" />
                </div>

                <dl className="mt-4 grid grid-cols-2 gap-y-2.5 text-sm">
                  <div>
                    <dt className="text-steel-500">เส้นทาง</dt>
                    <dd className="text-steel-700">
                      {s.origin_port} → {s.destination_port}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-steel-500">บริการ</dt>
                    <dd className="text-steel-700">
                      {SERVICE_TYPE_LABEL[s.service_type ?? 'export']} · {s.service_name}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-steel-500">ออกเดินทาง</dt>
                    <dd className="text-steel-700">{dateTime(s.etd)}</dd>
                  </div>
                  <div>
                    <dt className="text-steel-500">ถึงปลายทาง</dt>
                    <dd className="text-steel-700">{dateTime(s.eta)}</dd>
                  </div>
                  <div>
                    <dt className="text-steel-500">ปิดรับการจอง</dt>
                    <dd className="text-steel-700">{relativeDays(s.cutoff_at)}</dd>
                  </div>
                  <div>
                    <dt className="text-steel-500">ราคาเริ่มต้น</dt>
                    <dd className="tabular text-steel-700">{baht(s.base_price ?? 0)} / TEU</dd>
                  </div>
                </dl>

                <div className="mt-4">
                  <CapacityMeter booked={s.booked_teu} capacity={s.capacity_teu} />
                </div>

                <div className="mt-5 flex justify-end">
                  {s.available_teu > 0 && ['open', 'closing'].includes(s.status) ? (
                    <Link
                      to={`/app/bookings/new?scheduleId=${s.id}`}
                      className="inline-flex min-h-[44px] items-center rounded-md bg-hivis px-4 font-medium text-white
                                 transition-colors duration-150 hover:bg-amber-700"
                    >
                      จองเที่ยวเรือนี้
                    </Link>
                  ) : (
                    <span className="text-sm text-steel-500">เที่ยวนี้ปิดรับการจองแล้ว</span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}
