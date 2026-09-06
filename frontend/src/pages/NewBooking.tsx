import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Check, Minus, Plus } from 'lucide-react';
import { api, ApiError } from '../lib/api';
import type { Booking, ContainerType, Paged, Schedule } from '../lib/types';
import {
  Button,
  CapacityMeter,
  EmptyState,
  ErrorNotice,
  Field,
  Input,
  Loading,
  StatusBadge,
} from '../components/ui';
import PageHeader from '../components/PageHeader';
import { SERVICE_TYPE_LABEL, baht, dateTime, num, relativeDays } from '../lib/format';

/**
 * UC-5 Create Booking — ขั้นตอนการจอง 3 ขั้น
 *
 * ใช้ตัวเลขกำกับขั้นตอนเพราะนี่เป็นลำดับจริงที่ต้องทำตามลำดับ
 * (เลือกเที่ยวเรือ → ระบุตู้และสินค้า → ตรวจทานก่อนสร้าง)
 * ไม่ใช่การตกแต่ง
 */

const STEPS = ['เลือกเที่ยวเรือ', 'ระบุตู้และสินค้า', 'ตรวจทานและสร้าง'];

type Selection = Record<number, number>; // container_type_id -> qty

export default function NewBooking() {
  const [params] = useSearchParams();
  const navigate = useNavigate();

  const [step, setStep] = useState(0);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [containerTypes, setContainerTypes] = useState<ContainerType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [unavailableNotice, setUnavailableNotice] = useState('');

  const [scheduleId, setScheduleId] = useState<number | null>(
    params.get('scheduleId') ? Number(params.get('scheduleId')) : null
  );
  const [selection, setSelection] = useState<Selection>({});
  const [cargoType, setCargoType] = useState('');
  const [cargoWeight, setCargoWeight] = useState('');
  const [pickup, setPickup] = useState('');
  const [notes, setNotes] = useState('');

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    Promise.all([
      api.get<Paged<Schedule>>('/api/schedules?availableOnly=true&pageSize=50'),
      api.get<{ items: ContainerType[] }>('/api/container-types'),
    ])
      .then(async ([scheduleRes, typeRes]) => {
        setContainerTypes(typeRes.items);

        const requested = params.get('scheduleId');
        if (!requested) {
          setSchedules(scheduleRes.items);
          return;
        }

        /**
         * ลิงก์ที่ระบุเที่ยวเรือมาอาจชี้ไปเที่ยวที่ไม่อยู่ในรายการที่เปิดจอง
         * เช่น ผู้ใช้เปิดหน้าค้างไว้แล้วเที่ยวนั้นเต็มพอดี หรือกดจากลิงก์เก่า
         *
         * ถ้าไม่ดึงเที่ยวนั้นมาตรงและปล่อยให้หาไม่เจอ หน้าจะว่างเปล่า
         * เพราะขั้นที่ 1 ต้องมีข้อมูลเที่ยวเรือจึงจะเรนเดอร์ได้
         */
        const inList = scheduleRes.items.some((s) => s.id === Number(requested));
        if (inList) {
          setSchedules(scheduleRes.items);
          setStep(1);
          return;
        }

        try {
          const { schedule } = await api.get<{ schedule: Schedule }>(`/api/schedules/${requested}`);
          const bookable = ['open', 'closing'].includes(schedule.status) && schedule.available_teu > 0;

          setSchedules(bookable ? [schedule, ...scheduleRes.items] : scheduleRes.items);
          if (bookable) {
            setStep(1);
          } else {
            // อยู่ขั้นเลือกเที่ยวเรือต่อไป พร้อมบอกเหตุผลว่าทำไมเที่ยวที่กดมาถึงเลือกไม่ได้
            setScheduleId(null);
            setUnavailableNotice(
              `เที่ยวเรือ ${schedule.voyage_no} ไม่เปิดรับการจองแล้ว กรุณาเลือกเที่ยวอื่นจากรายการด้านล่าง`
            );
          }
        } catch {
          setSchedules(scheduleRes.items);
          setScheduleId(null);
          setUnavailableNotice('ไม่พบเที่ยวเรือที่ระบุในลิงก์ กรุณาเลือกเที่ยวเรือจากรายการด้านล่าง');
        }
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
    // ตั้งใจให้ทำงานครั้งเดียวตอนเปิดหน้า
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const schedule = useMemo(() => schedules.find((s) => s.id === scheduleId) ?? null, [schedules, scheduleId]);

  const chosen = useMemo(
    () =>
      Object.entries(selection)
        .filter(([, qty]) => qty > 0)
        .map(([id, qty]) => {
          const type = containerTypes.find((c) => c.id === Number(id))!;
          return { type, qty };
        }),
    [selection, containerTypes]
  );

  const totalTeu = chosen.reduce((sum, c) => sum + Number(c.type.teu_factor) * c.qty, 0);
  const totalPrice = chosen.reduce(
    (sum, c) => sum + Number(schedule?.base_price ?? 0) * Number(c.type.teu_factor) * c.qty,
    0
  );
  const overCapacity = schedule ? totalTeu > schedule.available_teu : false;

  const setQty = (id: number, delta: number) =>
    setSelection((s) => ({ ...s, [id]: Math.max((s[id] ?? 0) + delta, 0) }));

  const submit = async () => {
    setSubmitError('');
    setFieldErrors({});
    setBusy(true);
    try {
      const res = await api.post<{ booking: Booking }>('/api/bookings', {
        schedule_id: scheduleId,
        cargo_type: cargoType,
        cargo_weight_kg: cargoWeight ? Number(cargoWeight) : 0,
        pickup_location: pickup,
        notes,
        items: chosen.map((c) => ({ container_type_id: c.type.id, qty: c.qty })),
      });
      navigate(`/app/bookings/${res.booking.id}`);
    } catch (err) {
      if (err instanceof ApiError) {
        setFieldErrors(err.fieldErrors);
        setSubmitError(err.message);
      } else {
        setSubmitError('สร้างรายการจองไม่สำเร็จ กรุณาลองใหม่');
      }
      setBusy(false);
    }
  };

  if (loading) return <Loading />;
  if (error) return <ErrorNotice message={error} onRetry={() => window.location.reload()} />;

  return (
    <>
      <PageHeader title="สร้างการจอง" description="เลือกเที่ยวเรือ ระบุตู้และสินค้า แล้วตรวจทานก่อนสร้างรายการ" />

      {/* ตัวบอกขั้นตอน */}
      <ol className="mb-6 flex flex-wrap items-center gap-x-2 gap-y-2">
        {STEPS.map((label, i) => (
          <li key={label} className="flex items-center gap-2">
            <span
              className={`flex h-7 w-7 items-center justify-center rounded-full text-sm font-medium
                ${i < step ? 'bg-sea text-white' : i === step ? 'bg-hivis text-white' : 'bg-steel-200 text-steel-500'}`}
              aria-hidden
            >
              {i < step ? <Check size={15} /> : i + 1}
            </span>
            <span className={`text-sm ${i === step ? 'font-medium text-ink' : 'text-steel-500'}`}>{label}</span>
            {i < STEPS.length - 1 && <span className="mx-1 h-px w-6 bg-steel-300" aria-hidden />}
          </li>
        ))}
      </ol>

      {/* ── ขั้นที่ 1: เลือกเที่ยวเรือ ── */}
      {step === 0 && (
        <div className="panel p-5">
          {unavailableNotice && (
            <div className="mb-4">
              <ErrorNotice message={unavailableNotice} />
            </div>
          )}
          <h2 className="mb-4 text-lg font-medium text-ink">เที่ยวเรือที่เปิดรับการจอง</h2>

          {schedules.length === 0 ? (
            <EmptyState
              title="ยังไม่มีเที่ยวเรือที่เปิดรับการจอง"
              description="กรุณาติดต่อเจ้าหน้าที่ท่าเรือ หรือกลับมาตรวจสอบใหม่ภายหลัง"
            />
          ) : (
            <ul className="space-y-2.5">
              {schedules.map((s) => (
                <li key={s.id}>
                  <button
                    onClick={() => {
                      setScheduleId(s.id);
                      setStep(1);
                    }}
                    className={`w-full rounded-md border p-4 text-left transition-colors duration-150
                      ${scheduleId === s.id ? 'border-hivis bg-amber-50/60' : 'border-steel-200 hover:bg-steel-50'}`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="font-medium text-ink">
                          {s.vessel_name} <span className="tabular text-steel-500">{s.voyage_no}</span>
                        </p>
                        <p className="mt-0.5 text-sm text-steel-600">
                          {s.origin_port} → {s.destination_port} ·{' '}
                          {SERVICE_TYPE_LABEL[s.service_type ?? 'export']}
                        </p>
                        <p className="mt-0.5 text-sm text-steel-500">
                          ออกเดินทาง {dateTime(s.etd)} · ปิดรับ {relativeDays(s.cutoff_at)}
                        </p>
                      </div>
                      <StatusBadge status={s.status} kind="schedule" />
                    </div>
                    <div className="mt-3">
                      <CapacityMeter booked={s.booked_teu} capacity={s.capacity_teu} />
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* ── ขั้นที่ 2: ระบุตู้และสินค้า ── */}
      {step === 1 && schedule && (
        <div className="grid gap-5 lg:grid-cols-3">
          <div className="space-y-5 lg:col-span-2">
            <div className="panel p-5">
              <h2 className="mb-4 text-lg font-medium text-ink">เลือกประเภทและจำนวนตู้</h2>

              <ul className="divide-y divide-steel-200">
                {containerTypes.map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-4 py-3">
                    <div className="min-w-0">
                      <p className="font-medium text-ink">
                        <span className="tabular">{c.code}</span> · {c.name}
                      </p>
                      <p className="text-sm text-steel-500">
                        {c.size_ft} ฟุต · {num(c.teu_factor, 1)} TEU/ตู้ · รับน้ำหนักได้{' '}
                        <span className="tabular">{num(c.max_payload_kg)}</span> กก.
                      </p>
                    </div>

                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        onClick={() => setQty(c.id, -1)}
                        disabled={!selection[c.id]}
                        className="flex h-11 w-11 items-center justify-center rounded-md border border-steel-300
                                   text-steel-600 hover:bg-steel-50 disabled:opacity-40"
                        aria-label={`ลดจำนวนตู้ ${c.code}`}
                      >
                        <Minus size={16} />
                      </button>
                      <span className="tabular w-10 text-center text-lg text-ink" aria-live="polite">
                        {selection[c.id] ?? 0}
                      </span>
                      <button
                        onClick={() => setQty(c.id, 1)}
                        className="flex h-11 w-11 items-center justify-center rounded-md border border-steel-300
                                   text-steel-600 hover:bg-steel-50"
                        aria-label={`เพิ่มจำนวนตู้ ${c.code}`}
                      >
                        <Plus size={16} />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>

            <div className="panel space-y-4 p-5">
              <h2 className="text-lg font-medium text-ink">รายละเอียดสินค้า</h2>

              <Field label="ประเภทสินค้า" htmlFor="cargo" required error={fieldErrors.cargo_type}>
                <Input
                  id="cargo"
                  value={cargoType}
                  onChange={(e) => setCargoType(e.target.value)}
                  placeholder="เช่น ข้าวหอมมะลิบรรจุถุง"
                />
              </Field>

              <Field
                label="น้ำหนักรวม (กิโลกรัม)"
                htmlFor="weight"
                hint="ใช้ตรวจสอบว่าน้ำหนักไม่เกินพิกัดของตู้ที่เลือก"
                error={fieldErrors.cargo_weight_kg}
              >
                <Input
                  id="weight"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  value={cargoWeight}
                  onChange={(e) => setCargoWeight(e.target.value)}
                />
              </Field>

              <Field label="สถานที่รับตู้" htmlFor="pickup" error={fieldErrors.pickup_location}>
                <Input
                  id="pickup"
                  value={pickup}
                  onChange={(e) => setPickup(e.target.value)}
                  placeholder="เช่น คลังสินค้า A ลาดกระบัง"
                />
              </Field>

              <Field label="หมายเหตุถึงเจ้าหน้าที่" htmlFor="notes">
                <textarea
                  id="notes"
                  rows={3}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="field-input"
                />
              </Field>
            </div>
          </div>

          {/* สรุปการเลือก — ติดขอบบนไว้เพื่อให้เห็นพื้นที่คงเหลือตลอดเวลาที่กำลังเลือก */}
          <aside className="lg:sticky lg:top-6 lg:self-start">
            <div className="panel p-5">
              <h2 className="text-lg font-medium text-ink">{schedule.vessel_name}</h2>
              <p className="tabular text-sm text-steel-500">{schedule.voyage_no}</p>

              <div className="mt-4">
                <CapacityMeter
                  booked={schedule.booked_teu + totalTeu}
                  capacity={schedule.capacity_teu}
                  showNumbers={false}
                />
                <p className="mt-2 text-sm text-steel-500">
                  เลือกไปแล้ว <span className="tabular text-steel-700">{num(totalTeu, 1)}</span> TEU จากที่ว่าง{' '}
                  <span className="tabular text-steel-700">{num(schedule.available_teu)}</span> TEU
                </p>
              </div>

              {overCapacity && (
                <div className="mt-3">
                  <ErrorNotice message="จำนวนตู้ที่เลือกเกินพื้นที่ที่เหลือของเที่ยวเรือนี้ กรุณาลดจำนวนตู้ หรือเลือกเที่ยวเรืออื่น" />
                </div>
              )}

              <dl className="mt-4 space-y-1.5 border-t border-steel-200 pt-4 text-sm">
                {chosen.map(({ type, qty }) => (
                  <div key={type.id} className="flex justify-between gap-3">
                    <dt className="text-steel-600">
                      <span className="tabular">{type.code}</span> × {qty}
                    </dt>
                    <dd className="tabular text-steel-700">
                      {baht(Number(schedule.base_price ?? 0) * Number(type.teu_factor) * qty)}
                    </dd>
                  </div>
                ))}
                {chosen.length === 0 && <p className="text-steel-500">ยังไม่ได้เลือกตู้</p>}
              </dl>

              <div className="mt-3 flex justify-between border-t border-steel-200 pt-3">
                <span className="font-medium text-ink">ราคาประมาณการ</span>
                <span className="tabular text-lg font-semibold text-ink">{baht(totalPrice)}</span>
              </div>

              <div className="mt-5 flex gap-2">
                <Button variant="secondary" onClick={() => setStep(0)} className="flex-1">
                  ย้อนกลับ
                </Button>
                <Button
                  onClick={() => setStep(2)}
                  disabled={chosen.length === 0 || !cargoType || overCapacity}
                  className="flex-1"
                >
                  ตรวจทาน
                </Button>
              </div>
            </div>
          </aside>
        </div>
      )}

      {/* ── ขั้นที่ 3: ตรวจทาน ── */}
      {step === 2 && schedule && (
        <div className="panel mx-auto max-w-2xl p-5">
          <h2 className="text-lg font-medium text-ink">ตรวจทานรายการจอง</h2>
          <p className="mt-1 text-sm text-steel-500">
            เมื่อสร้างแล้วรายการจะอยู่ในสถานะ &ldquo;รอยืนยัน&rdquo; และกันพื้นที่บนเที่ยวเรือให้ทันที
            คุณยืนยันหรือยกเลิกได้ในหน้าถัดไป
          </p>

          {submitError && (
            <div className="mt-4">
              <ErrorNotice message={submitError} />
            </div>
          )}

          <dl className="mt-5 divide-y divide-steel-200 text-sm">
            {[
              ['เที่ยวเรือ', `${schedule.vessel_name} · ${schedule.voyage_no}`],
              ['เส้นทาง', `${schedule.origin_port} → ${schedule.destination_port}`],
              ['ออกเดินทาง', dateTime(schedule.etd)],
              ['ถึงปลายทาง', dateTime(schedule.eta)],
              ['ประเภทสินค้า', cargoType],
              ['น้ำหนักรวม', cargoWeight ? `${num(cargoWeight)} กก.` : '—'],
              ['สถานที่รับตู้', pickup || '—'],
              ['ตู้ที่จอง', chosen.map((c) => `${c.type.code} × ${c.qty}`).join(', ')],
              ['พื้นที่ที่ใช้', `${num(totalTeu, 1)} TEU`],
            ].map(([label, value]) => (
              <div key={label} className="flex justify-between gap-4 py-2.5">
                <dt className="text-steel-500">{label}</dt>
                <dd className="text-right text-steel-700">{value}</dd>
              </div>
            ))}
            <div className="flex justify-between gap-4 py-3">
              <dt className="font-medium text-ink">ราคาประมาณการ</dt>
              <dd className="tabular text-lg font-semibold text-ink">{baht(totalPrice)}</dd>
            </div>
          </dl>

          <div className="mt-5 flex gap-2">
            <Button variant="secondary" onClick={() => setStep(1)} className="flex-1">
              กลับไปแก้ไข
            </Button>
            <Button onClick={submit} loading={busy} className="flex-1">
              สร้างการจอง
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
