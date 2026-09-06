import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../../lib/api';
import type { Paged, Schedule, Service } from '../../lib/types';
import { Button, CapacityMeter, EmptyState, ErrorNotice, Field, Input, Loading, Select, StatusBadge } from '../../components/ui';
import Modal from '../../components/Modal';
import PageHeader from '../../components/PageHeader';
import { SCHEDULE_STATUS_LABEL, dateTime, num } from '../../lib/format';

type Vessel = { id: number; name: string; imo_number: string; operator: string | null };

/** แปลงค่าจาก MySQL ให้ input[type=datetime-local] อ่านได้ */
const toLocalInput = (v: string) => new Date(v).toISOString().slice(0, 16);

const EMPTY = {
  service_id: '',
  vessel_id: '',
  voyage_no: '',
  etd: '',
  eta: '',
  cutoff_at: '',
  berth: '',
  capacity_teu: '500',
  status: 'open',
};

/** UC-11 Manage Vessel Schedules */
export default function AdminSchedules() {
  const [items, setItems] = useState<Schedule[]>([]);
  const [vessels, setVessels] = useState<Vessel[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [editing, setEditing] = useState<Schedule | 'new' | null>(null);
  const [deleting, setDeleting] = useState<Schedule | null>(null);
  const [form, setForm] = useState<Record<string, string>>(EMPTY);
  const [formError, setFormError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setError('');
    Promise.all([
      api.get<Paged<Schedule> & { vessels: Vessel[] }>('/api/admin/schedules?pageSize=100'),
      api.get<Paged<Service>>('/api/admin/services?pageSize=100'),
    ])
      .then(([s, sv]) => {
        setItems(s.items);
        setVessels(s.vessels);
        setServices(sv.items);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  const openNew = () => {
    setForm({ ...EMPTY, service_id: String(services[0]?.id ?? ''), vessel_id: String(vessels[0]?.id ?? '') });
    setFormError('');
    setFieldErrors({});
    setEditing('new');
  };

  const openEdit = (s: Schedule) => {
    setForm({
      service_id: String(s.service_id),
      vessel_id: String(s.vessel_id),
      voyage_no: s.voyage_no,
      etd: toLocalInput(s.etd),
      eta: toLocalInput(s.eta),
      cutoff_at: toLocalInput(s.cutoff_at),
      berth: s.berth ?? '',
      capacity_teu: String(s.capacity_teu),
      status: s.status,
    });
    setFormError('');
    setFieldErrors({});
    setEditing(s);
  };

  const save = async () => {
    setFormError('');
    setFieldErrors({});
    setBusy(true);
    try {
      if (editing === 'new') await api.post('/api/admin/schedules', form);
      else if (editing) await api.put(`/api/admin/schedules/${editing.id}`, form);
      setEditing(null);
      load();
    } catch (err) {
      if (err instanceof ApiError) {
        setFieldErrors(err.fieldErrors);
        setFormError(err.message);
      } else setFormError('บันทึกไม่สำเร็จ');
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!deleting) return;
    setFormError('');
    setBusy(true);
    try {
      await api.del(`/api/admin/schedules/${deleting.id}`);
      setDeleting(null);
      load();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'ลบไม่สำเร็จ');
    } finally {
      setBusy(false);
    }
  };

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <>
      <PageHeader
        title="ตารางเที่ยวเรือ"
        description="กำหนดเที่ยวเรือ ความจุระวาง และกำหนดปิดรับการจองของแต่ละเที่ยว"
        actions={
          <Button onClick={openNew} disabled={services.length === 0 || vessels.length === 0}>
            เพิ่มเที่ยวเรือ
          </Button>
        }
      />

      {loading ? (
        <Loading />
      ) : error ? (
        <ErrorNotice message={error} onRetry={load} />
      ) : items.length === 0 ? (
        <div className="panel">
          <EmptyState
            title="ยังไม่มีตารางเที่ยวเรือ"
            description="เพิ่มเที่ยวเรือเพื่อเปิดรับการจองจากลูกค้า"
            action={<Button onClick={openNew}>เพิ่มเที่ยวเรือ</Button>}
          />
        </div>
      ) : (
        <div className="panel overflow-x-auto">
          <table className="w-full min-w-[980px] border-collapse">
            <thead>
              <tr className="table-head">
                <th className="px-4 py-2.5">เที่ยวเรือ</th>
                <th className="px-4 py-2.5">บริการ</th>
                <th className="px-4 py-2.5">ออกเดินทาง</th>
                <th className="px-4 py-2.5">ปิดรับ</th>
                <th className="w-52 px-4 py-2.5">การใช้พื้นที่</th>
                <th className="px-4 py-2.5">สถานะ</th>
                <th className="px-4 py-2.5 text-right">จัดการ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-steel-200">
              {items.map((s) => (
                <tr key={s.id} className="hover:bg-steel-50">
                  <td className="px-4 py-2.5">
                    <p className="text-steel-700">{s.vessel_name}</p>
                    <p className="tabular text-sm text-steel-500">{s.voyage_no}</p>
                  </td>
                  <td className="px-4 py-2.5 text-sm text-steel-600">{s.service_name}</td>
                  <td className="px-4 py-2.5 text-sm text-steel-600">{dateTime(s.etd)}</td>
                  <td className="px-4 py-2.5 text-sm text-steel-600">{dateTime(s.cutoff_at)}</td>
                  <td className="px-4 py-2.5">
                    <CapacityMeter booked={s.booked_teu} capacity={s.capacity_teu} showNumbers={false} />
                    <p className="tabular mt-1 text-sm text-steel-500">
                      {num(s.booked_teu)} / {num(s.capacity_teu)} TEU · {num(s.booking_count ?? 0)} การจอง
                    </p>
                  </td>
                  <td className="px-4 py-2.5">
                    <StatusBadge status={s.status} kind="schedule" />
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <Button variant="ghost" size="sm" onClick={() => openEdit(s)}>
                      แก้ไข
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setDeleting(s)} className="text-red-700">
                      ลบ
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        open={editing !== null}
        title={editing === 'new' ? 'เพิ่มเที่ยวเรือ' : 'แก้ไขเที่ยวเรือ'}
        onClose={() => setEditing(null)}
        wide
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditing(null)}>
              ยกเลิก
            </Button>
            <Button onClick={save} loading={busy}>
              บันทึก
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {formError && <ErrorNotice message={formError} />}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="บริการ" htmlFor="sc-service" required>
              <Select id="sc-service" value={form.service_id} onChange={set('service_id')}>
                {services.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.code} · {s.name}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="เรือ" htmlFor="sc-vessel" required>
              <Select id="sc-vessel" value={form.vessel_id} onChange={set('vessel_id')}>
                {vessels.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name} · IMO {v.imo_number}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="เลขเที่ยวเรือ" htmlFor="sc-voyage" required error={fieldErrors.voyage_no}>
              <Input id="sc-voyage" value={form.voyage_no} onChange={set('voyage_no')} placeholder="BKX-2601E" />
            </Field>
            <Field label="ท่าเทียบ" htmlFor="sc-berth">
              <Input id="sc-berth" value={form.berth} onChange={set('berth')} placeholder="B1" />
            </Field>
            <Field
              label="ความจุ (TEU)"
              htmlFor="sc-capacity"
              required
              error={fieldErrors.capacity_teu}
              hint="ลดต่ำกว่าที่จองไปแล้วไม่ได้"
            >
              <Input id="sc-capacity" type="number" min={1} value={form.capacity_teu} onChange={set('capacity_teu')} />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="ออกเดินทาง (ETD)" htmlFor="sc-etd" required error={fieldErrors.etd}>
              <Input id="sc-etd" type="datetime-local" value={form.etd} onChange={set('etd')} />
            </Field>
            <Field label="ถึงปลายทาง (ETA)" htmlFor="sc-eta" required error={fieldErrors.eta}>
              <Input id="sc-eta" type="datetime-local" value={form.eta} onChange={set('eta')} />
            </Field>
            <Field label="ปิดรับการจอง" htmlFor="sc-cutoff" required error={fieldErrors.cutoff_at}>
              <Input id="sc-cutoff" type="datetime-local" value={form.cutoff_at} onChange={set('cutoff_at')} />
            </Field>
          </div>

          <Field label="สถานะ" htmlFor="sc-status" required>
            <Select id="sc-status" value={form.status} onChange={set('status')}>
              {Object.entries(SCHEDULE_STATUS_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </Modal>

      <Modal
        open={deleting !== null}
        title="ยืนยันการลบเที่ยวเรือ"
        onClose={() => setDeleting(null)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleting(null)}>
              ยกเลิก
            </Button>
            <Button variant="danger" onClick={remove} loading={busy}>
              ลบเที่ยวเรือ
            </Button>
          </>
        }
      >
        {formError && <ErrorNotice message={formError} />}
        <p className="mt-2 text-steel-600">
          ต้องการลบเที่ยวเรือ <span className="tabular font-medium text-ink">{deleting?.voyage_no}</span> ใช่หรือไม่
        </p>
        <p className="mt-2 text-steel-600">
          หากเที่ยวเรือนี้มีรายการจองอยู่ ระบบจะไม่อนุญาตให้ลบ — ให้เปลี่ยนสถานะเป็นปิดรับแทน
        </p>
      </Modal>
    </>
  );
}
