import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../../lib/api';
import type { Booking, BookingStatus, Paged, ShipmentStatus } from '../../lib/types';
import { Button, EmptyState, ErrorNotice, Field, Input, Loading, Select, StatusBadge } from '../../components/ui';
import Modal from '../../components/Modal';
import PageHeader from '../../components/PageHeader';
import {
  BOOKING_STATUS_LABEL,
  SHIPMENT_STATUS_LABEL,
  baht,
  dateOnly,
  dateTime,
  num,
} from '../../lib/format';

/** ลำดับสถานะที่เปลี่ยนได้ ต้องตรงกับกฎฝั่ง backend ไม่งั้นผู้ใช้จะเลือกแล้วโดนปฏิเสธ */
const ALLOWED: Record<BookingStatus, BookingStatus[]> = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['in_progress', 'cancelled'],
  in_progress: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
};

const FILTERS: Array<{ value: '' | BookingStatus; label: string }> = [
  { value: '', label: 'ทั้งหมด' },
  ...(Object.keys(BOOKING_STATUS_LABEL) as BookingStatus[]).map((k) => ({
    value: k,
    label: BOOKING_STATUS_LABEL[k],
  })),
];

/** UC-13 Manage Bookings */
export default function AdminBookings() {
  const [items, setItems] = useState<Booking[]>([]);
  const [status, setStatus] = useState<'' | BookingStatus>('');
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [detail, setDetail] = useState<Booking | null>(null);
  const [nextStatus, setNextStatus] = useState<BookingStatus | ''>('');
  const [nextShipment, setNextShipment] = useState<ShipmentStatus | ''>('');
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setError('');
    const params = new URLSearchParams({ pageSize: '100' });
    if (status) params.set('status', status);
    if (q) params.set('q', q);

    api
      .get<Paged<Booking>>(`/api/admin/bookings?${params}`)
      .then((r) => setItems(r.items))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [status, q]);

  useEffect(load, [load]);

  const openDetail = async (b: Booking) => {
    setFormError('');
    setNextStatus('');
    setNextShipment('');
    try {
      const r = await api.get<{ booking: Booking }>(`/api/admin/bookings/${b.id}`);
      setDetail(r.booking);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'โหลดรายละเอียดไม่สำเร็จ');
    }
  };

  const applyStatus = async () => {
    if (!detail || !nextStatus) return;
    setFormError('');
    setBusy(true);
    try {
      const r = await api.patch<{ booking: Booking }>(`/api/admin/bookings/${detail.id}/status`, {
        status: nextStatus,
      });
      setDetail(r.booking);
      setNextStatus('');
      load();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'อัปเดตสถานะไม่สำเร็จ');
    } finally {
      setBusy(false);
    }
  };

  const applyShipment = async () => {
    if (!detail || !nextShipment) return;
    setFormError('');
    setBusy(true);
    try {
      const r = await api.patch<{ booking: Booking }>(`/api/admin/bookings/${detail.id}/shipment`, {
        status: nextShipment,
      });
      setDetail(r.booking);
      setNextShipment('');
      load();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'อัปเดตสถานะการขนส่งไม่สำเร็จ');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader
        title="รายการจอง"
        description="ตรวจสอบและอัปเดตสถานะการจองและคำสั่งขนส่งของลูกค้าทุกราย"
      />

      <div className="panel mb-4 flex flex-wrap items-center gap-3 p-4">
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="ค้นหาจากเลขที่การจอง ชื่อลูกค้า บริษัท หรือเลขเที่ยวเรือ"
          aria-label="ค้นหารายการจอง"
          className="min-w-[260px] flex-1"
        />
      </div>

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
        <ErrorNotice message={error} onRetry={load} />
      ) : items.length === 0 ? (
        <div className="panel">
          <EmptyState
            title="ไม่พบรายการจองตามเงื่อนไข"
            description="ลองเปลี่ยนตัวกรองสถานะ หรือล้างคำค้นหา"
            action={
              <Button
                variant="secondary"
                onClick={() => {
                  setStatus('');
                  setQ('');
                }}
              >
                ล้างตัวกรอง
              </Button>
            }
          />
        </div>
      ) : (
        <div className="panel overflow-x-auto">
          <table className="w-full min-w-[980px] border-collapse">
            <thead>
              <tr className="table-head">
                <th className="px-4 py-2.5">เลขที่การจอง</th>
                <th className="px-4 py-2.5">ลูกค้า</th>
                <th className="px-4 py-2.5">เที่ยวเรือ</th>
                <th className="px-4 py-2.5 text-right">TEU</th>
                <th className="px-4 py-2.5 text-right">ราคา</th>
                <th className="px-4 py-2.5">สถานะจอง</th>
                <th className="px-4 py-2.5">สถานะขนส่ง</th>
                <th className="px-4 py-2.5 text-right">จัดการ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-steel-200">
              {items.map((b) => (
                <tr key={b.id} className="hover:bg-steel-50">
                  <td className="px-4 py-2.5">
                    <p className="tabular font-medium text-ink">{b.booking_no}</p>
                    <p className="text-sm text-steel-500">{dateOnly(b.created_at)}</p>
                  </td>
                  <td className="px-4 py-2.5">
                    <p className="text-steel-700">{b.customer_name}</p>
                    <p className="text-sm text-steel-500">{b.customer_company ?? b.customer_email}</p>
                  </td>
                  <td className="px-4 py-2.5">
                    <p className="text-sm text-steel-700">{b.vessel_name}</p>
                    <p className="tabular text-sm text-steel-500">{b.voyage_no}</p>
                  </td>
                  <td className="tabular px-4 py-2.5 text-right text-steel-700">{num(b.total_teu, 1)}</td>
                  <td className="tabular px-4 py-2.5 text-right text-steel-700">{baht(b.total_price)}</td>
                  <td className="px-4 py-2.5">
                    <StatusBadge status={b.status} />
                  </td>
                  <td className="px-4 py-2.5 text-sm text-steel-600">
                    {b.shipment_status ? SHIPMENT_STATUS_LABEL[b.shipment_status] : '—'}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <Button variant="ghost" size="sm" onClick={() => openDetail(b)}>
                      จัดการ
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        open={detail !== null}
        title={`รายการจอง ${detail?.booking_no ?? ''}`}
        onClose={() => setDetail(null)}
        wide
        footer={
          <Button variant="secondary" onClick={() => setDetail(null)}>
            ปิด
          </Button>
        }
      >
        {detail && (
          <div className="space-y-5">
            {formError && <ErrorNotice message={formError} />}

            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                <h3 className="mb-2 font-medium text-ink">ลูกค้า</h3>
                <dl className="space-y-1.5 text-sm">
                  {[
                    ['ชื่อ', detail.customer_name],
                    ['บริษัท', detail.customer_company ?? '—'],
                    ['อีเมล', detail.customer_email],
                  ].map(([k, v]) => (
                    <div key={k} className="flex justify-between gap-3">
                      <dt className="text-steel-500">{k}</dt>
                      <dd className="text-right text-steel-700">{v}</dd>
                    </div>
                  ))}
                </dl>
              </div>

              <div>
                <h3 className="mb-2 font-medium text-ink">เที่ยวเรือ</h3>
                <dl className="space-y-1.5 text-sm">
                  {[
                    ['เรือ', detail.vessel_name],
                    ['เลขเที่ยว', detail.voyage_no],
                    ['ออกเดินทาง', dateTime(detail.etd)],
                    ['เส้นทาง', `${detail.origin_port} → ${detail.destination_port}`],
                  ].map(([k, v]) => (
                    <div key={k} className="flex justify-between gap-3">
                      <dt className="text-steel-500">{k}</dt>
                      <dd className="text-right text-steel-700">{v}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            </div>

            <div>
              <h3 className="mb-2 font-medium text-ink">ตู้และสินค้า</h3>
              <ul className="divide-y divide-steel-200 rounded-md border border-steel-200">
                {detail.items?.map((i) => (
                  <li key={i.id} className="flex justify-between gap-3 px-3 py-2 text-sm">
                    <span className="text-steel-700">
                      <span className="tabular">{i.container_code}</span> · {i.container_name}
                    </span>
                    <span className="tabular text-steel-600">
                      × {i.qty} · {baht(Number(i.unit_price) * i.qty)}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-sm text-steel-600">
                สินค้า: {detail.cargo_type} · น้ำหนัก{' '}
                <span className="tabular">{num(detail.cargo_weight_kg)}</span> กก. · รวม{' '}
                <span className="tabular">{num(detail.total_teu, 1)}</span> TEU ·{' '}
                <span className="tabular font-medium text-ink">{baht(detail.total_price)}</span>
              </p>
            </div>

            <div className="grid gap-5 border-t border-steel-200 pt-5 sm:grid-cols-2">
              <div>
                <h3 className="mb-2 font-medium text-ink">เปลี่ยนสถานะการจอง</h3>
                <p className="mb-2.5 text-sm text-steel-500">
                  ปัจจุบัน: {BOOKING_STATUS_LABEL[detail.status]}
                </p>

                {ALLOWED[detail.status].length === 0 ? (
                  <p className="text-sm text-steel-500">รายการนี้อยู่ในสถานะสุดท้ายแล้ว ไม่สามารถเปลี่ยนได้</p>
                ) : (
                  <div className="flex gap-2">
                    <Select
                      value={nextStatus}
                      onChange={(e) => setNextStatus(e.target.value as BookingStatus)}
                      aria-label="สถานะการจองใหม่"
                    >
                      <option value="">เลือกสถานะ</option>
                      {ALLOWED[detail.status].map((s) => (
                        <option key={s} value={s}>
                          {BOOKING_STATUS_LABEL[s]}
                        </option>
                      ))}
                    </Select>
                    <Button onClick={applyStatus} loading={busy} disabled={!nextStatus}>
                      บันทึก
                    </Button>
                  </div>
                )}
              </div>

              <div>
                <h3 className="mb-2 font-medium text-ink">เปลี่ยนสถานะการขนส่ง</h3>
                <p className="mb-2.5 text-sm text-steel-500">
                  ปัจจุบัน: {detail.shipment_status ? SHIPMENT_STATUS_LABEL[detail.shipment_status] : 'ยังไม่มีคำสั่งขนส่ง'}
                </p>

                {!detail.shipment_order_no ? (
                  <p className="text-sm text-steel-500">
                    คำสั่งขนส่งจะถูกสร้างเมื่อการจองได้รับการยืนยัน
                  </p>
                ) : (
                  <div className="flex gap-2">
                    <Select
                      value={nextShipment}
                      onChange={(e) => setNextShipment(e.target.value as ShipmentStatus)}
                      aria-label="สถานะการขนส่งใหม่"
                    >
                      <option value="">เลือกสถานะ</option>
                      {(Object.keys(SHIPMENT_STATUS_LABEL) as ShipmentStatus[]).map((s) => (
                        <option key={s} value={s}>
                          {SHIPMENT_STATUS_LABEL[s]}
                        </option>
                      ))}
                    </Select>
                    <Button onClick={applyShipment} loading={busy} disabled={!nextShipment}>
                      บันทึก
                    </Button>
                  </div>
                )}
              </div>
            </div>

            <Field label="หมายเหตุจากลูกค้า" htmlFor="b-notes">
              <textarea id="b-notes" rows={2} readOnly value={detail.notes ?? '—'} className="field-input bg-steel-50" />
            </Field>
          </div>
        )}
      </Modal>
    </>
  );
}
