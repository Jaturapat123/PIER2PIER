import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Check } from 'lucide-react';
import { api, ApiError } from '../lib/api';
import type { Booking } from '../lib/types';
import { Button, ErrorNotice, Loading, StatusBadge } from '../components/ui';
import Modal from '../components/Modal';
import { SHIPMENT_STATUS_LABEL, SHIPMENT_STEPS, baht, dateTime, num } from '../lib/format';

/**
 * UC-6 Confirm Booking + UC-7 View Booking (รายละเอียด)
 *
 * แสดงเส้นเวลาสถานะขนส่งเพราะสิ่งที่ลูกค้าอยากรู้หลังจองแล้วคือ
 * "ตอนนี้ตู้ของฉันอยู่ขั้นไหน" ไม่ใช่แค่ว่ามีรายการจองอยู่
 */
export default function BookingDetail() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [booking, setBooking] = useState<Booking | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setError('');
    api
      .get<{ booking: Booking }>(`/api/bookings/${id}`)
      .then((r) => setBooking(r.booking))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(load, [load]);

  const act = async (action: 'confirm' | 'cancel') => {
    setActionError('');
    setBusy(true);
    try {
      const res = await api.post<{ booking: Booking }>(`/api/bookings/${id}/${action}`);
      setBooking(res.booking);
      setConfirmCancel(false);
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'ดำเนินการไม่สำเร็จ กรุณาลองใหม่');
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <Loading />;
  if (error) return <ErrorNotice message={error} onRetry={load} />;
  if (!booking) return null;

  const currentStep = booking.shipment_status ? SHIPMENT_STEPS.indexOf(booking.shipment_status) : -1;

  return (
    <>
      <button
        onClick={() => navigate('/app/bookings')}
        className="mb-4 inline-flex min-h-[44px] items-center gap-1.5 text-sm text-steel-600 hover:text-ink"
      >
        <ArrowLeft size={16} aria-hidden />
        กลับไปรายการจอง
      </button>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="tabular text-2xl font-semibold text-ink">{booking.booking_no}</h1>
          <p className="mt-1 text-steel-500">สร้างเมื่อ {dateTime(booking.created_at)}</p>
        </div>
        <StatusBadge status={booking.status} />
      </div>

      {actionError && (
        <div className="mb-4">
          <ErrorNotice message={actionError} />
        </div>
      )}

      {/* UC-6: ปุ่มยืนยันจะขึ้นเฉพาะตอนสถานะ pending เท่านั้น */}
      {booking.status === 'pending' && (
        <div className="panel mb-5 flex flex-wrap items-center justify-between gap-4 border-l-4 border-hivis p-5">
          <div>
            <p className="font-medium text-ink">รายการนี้รอการยืนยันจากคุณ</p>
            <p className="mt-0.5 text-sm text-steel-500">
              พื้นที่บนเที่ยวเรือถูกกันไว้ให้แล้ว โปรดยืนยันก่อนกำหนดปิดรับ {dateTime(booking.cutoff_at)}
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setConfirmCancel(true)}>
              ยกเลิกการจอง
            </Button>
            <Button onClick={() => act('confirm')} loading={busy}>
              ยืนยันการจอง
            </Button>
          </div>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          {/* เส้นเวลาสถานะขนส่ง */}
          {booking.shipment_order_no && (
            <section className="panel p-5">
              <div className="mb-4 flex items-baseline justify-between gap-3">
                <h2 className="text-lg font-medium text-ink">สถานะการขนส่ง</h2>
                <span className="tabular text-sm text-steel-500">{booking.shipment_order_no}</span>
              </div>

              <ol className="space-y-0">
                {SHIPMENT_STEPS.map((step, i) => {
                  const done = i <= currentStep;
                  const timestamp = {
                    created: booking.confirmed_at,
                    gate_in: booking.gate_in_at,
                    loaded: booking.loaded_at,
                    departed: booking.departed_at,
                    delivered: booking.delivered_at,
                  }[step];

                  return (
                    <li key={step} className="flex gap-3">
                      <div className="flex flex-col items-center">
                        <span
                          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full
                            ${done ? 'bg-sea text-white' : 'border-2 border-steel-300 bg-white'}`}
                          aria-hidden
                        >
                          {done && <Check size={13} />}
                        </span>
                        {i < SHIPMENT_STEPS.length - 1 && (
                          <span className={`h-8 w-0.5 ${i < currentStep ? 'bg-sea' : 'bg-steel-200'}`} aria-hidden />
                        )}
                      </div>
                      <div className="pb-2">
                        <p className={done ? 'font-medium text-ink' : 'text-steel-500'}>
                          {SHIPMENT_STATUS_LABEL[step]}
                        </p>
                        {done && timestamp && <p className="text-sm text-steel-500">{dateTime(timestamp)}</p>}
                      </div>
                    </li>
                  );
                })}
              </ol>
            </section>
          )}

          <section className="panel p-5">
            <h2 className="mb-4 text-lg font-medium text-ink">ตู้คอนเทนเนอร์ที่จอง</h2>
            <table className="w-full border-collapse">
              <thead>
                <tr className="table-head">
                  <th className="px-3 py-2">ประเภทตู้</th>
                  <th className="px-3 py-2 text-right">จำนวน</th>
                  <th className="px-3 py-2 text-right">ราคาต่อตู้</th>
                  <th className="px-3 py-2 text-right">รวม</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-steel-200">
                {booking.items?.map((item) => (
                  <tr key={item.id}>
                    <td className="px-3 py-2.5">
                      <span className="tabular font-medium text-ink">{item.container_code}</span>
                      <p className="text-sm text-steel-500">{item.container_name}</p>
                    </td>
                    <td className="tabular px-3 py-2.5 text-right text-steel-700">{item.qty}</td>
                    <td className="tabular px-3 py-2.5 text-right text-steel-700">{baht(item.unit_price)}</td>
                    <td className="tabular px-3 py-2.5 text-right text-steel-700">
                      {baht(Number(item.unit_price) * item.qty)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-steel-300">
                  <td colSpan={3} className="px-3 py-3 text-right font-medium text-ink">
                    รวมทั้งสิ้น ({num(booking.total_teu, 1)} TEU)
                  </td>
                  <td className="tabular px-3 py-3 text-right text-lg font-semibold text-ink">
                    {baht(booking.total_price)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </section>
        </div>

        <aside className="space-y-5">
          <section className="panel p-5">
            <h2 className="mb-3 text-lg font-medium text-ink">เที่ยวเรือ</h2>
            <dl className="space-y-2.5 text-sm">
              {[
                ['เรือ', booking.vessel_name],
                ['เลขเที่ยว', booking.voyage_no],
                ['IMO', booking.imo_number],
                ['ท่าเทียบ', booking.berth ?? '—'],
                ['เส้นทาง', `${booking.origin_port} → ${booking.destination_port}`],
                ['ออกเดินทาง', dateTime(booking.etd)],
                ['ถึงปลายทาง', dateTime(booking.eta)],
              ].map(([k, v]) => (
                <div key={k}>
                  <dt className="text-steel-500">{k}</dt>
                  <dd className="text-steel-700">{v}</dd>
                </div>
              ))}
            </dl>
          </section>

          <section className="panel p-5">
            <h2 className="mb-3 text-lg font-medium text-ink">สินค้า</h2>
            <dl className="space-y-2.5 text-sm">
              {[
                ['ประเภทสินค้า', booking.cargo_type],
                ['น้ำหนักรวม', booking.cargo_weight_kg ? `${num(booking.cargo_weight_kg)} กก.` : '—'],
                ['สถานที่รับตู้', booking.pickup_location ?? '—'],
                ['หมายเหตุ', booking.notes ?? '—'],
              ].map(([k, v]) => (
                <div key={k}>
                  <dt className="text-steel-500">{k}</dt>
                  <dd className="text-steel-700">{v}</dd>
                </div>
              ))}
            </dl>
          </section>

          {booking.status === 'confirmed' && (
            <Button variant="secondary" onClick={() => setConfirmCancel(true)} className="w-full">
              ขอยกเลิกการจอง
            </Button>
          )}
        </aside>
      </div>

      <Modal
        open={confirmCancel}
        title="ยืนยันการยกเลิก"
        onClose={() => setConfirmCancel(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmCancel(false)}>
              ไม่ยกเลิก
            </Button>
            <Button variant="danger" onClick={() => act('cancel')} loading={busy}>
              ยกเลิกการจอง
            </Button>
          </>
        }
      >
        <p className="text-steel-600">
          การยกเลิกจะคืนพื้นที่ <span className="tabular">{num(booking.total_teu, 1)}</span> TEU
          ให้เที่ยวเรือ <span className="tabular">{booking.voyage_no}</span> และไม่สามารถกู้รายการนี้กลับมาได้
        </p>
        <p className="mt-3 text-steel-600">
          หากต้องการจองใหม่ ต้องสร้างรายการใหม่และอาจไม่มีพื้นที่เหลือแล้ว
        </p>
      </Modal>

      <p className="mt-6 text-sm text-steel-500">
        ต้องการความช่วยเหลือ?{' '}
        <Link to="/app/profile" className="text-sea underline-offset-2 hover:underline">
          ตรวจสอบข้อมูลติดต่อของคุณ
        </Link>
      </p>
    </>
  );
}
