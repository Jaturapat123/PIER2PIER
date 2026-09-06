import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../../lib/api';
import type { Paged, Service } from '../../lib/types';
import { Button, EmptyState, ErrorNotice, Field, Input, Loading, Select } from '../../components/ui';
import Modal from '../../components/Modal';
import PageHeader from '../../components/PageHeader';
import { SERVICE_TYPE_LABEL, baht, num } from '../../lib/format';

const EMPTY = {
  code: '',
  name: '',
  service_type: 'export',
  origin_port: '',
  destination_port: '',
  transit_days: '0',
  base_price: '0',
  description: '',
  status: 'active',
};

/** UC-11 Manage Services */
export default function AdminServices() {
  const [items, setItems] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [editing, setEditing] = useState<Service | 'new' | null>(null);
  const [deleting, setDeleting] = useState<Service | null>(null);
  const [form, setForm] = useState<Record<string, string>>(EMPTY);
  const [formError, setFormError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setError('');
    api
      .get<Paged<Service>>('/api/admin/services?pageSize=100')
      .then((r) => setItems(r.items))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  const openNew = () => {
    setForm(EMPTY);
    setFormError('');
    setFieldErrors({});
    setEditing('new');
  };

  const openEdit = (s: Service) => {
    setForm({
      code: s.code,
      name: s.name,
      service_type: s.service_type,
      origin_port: s.origin_port,
      destination_port: s.destination_port,
      transit_days: String(s.transit_days),
      base_price: String(s.base_price),
      description: s.description ?? '',
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
      if (editing === 'new') await api.post('/api/admin/services', form);
      else if (editing) await api.put(`/api/admin/services/${editing.id}`, form);
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
      await api.del(`/api/admin/services/${deleting.id}`);
      setDeleting(null);
      load();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'ลบไม่สำเร็จ');
    } finally {
      setBusy(false);
    }
  };

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <>
      <PageHeader
        title="บริการ"
        description="จัดการรายการบริการของท่าเรือ เช่น เส้นทางนำเข้า ส่งออก ถ่ายลำ และฝากตู้"
        actions={<Button onClick={openNew}>เพิ่มบริการ</Button>}
      />

      {loading ? (
        <Loading />
      ) : error ? (
        <ErrorNotice message={error} onRetry={load} />
      ) : items.length === 0 ? (
        <div className="panel">
          <EmptyState
            title="ยังไม่มีบริการในระบบ"
            description="เพิ่มบริการแรกเพื่อให้สามารถสร้างตารางเที่ยวเรือและเปิดรับการจองได้"
            action={<Button onClick={openNew}>เพิ่มบริการ</Button>}
          />
        </div>
      ) : (
        <div className="panel overflow-x-auto">
          <table className="w-full min-w-[900px] border-collapse">
            <thead>
              <tr className="table-head">
                <th className="px-4 py-2.5">รหัส / ชื่อบริการ</th>
                <th className="px-4 py-2.5">ประเภท</th>
                <th className="px-4 py-2.5">เส้นทาง</th>
                <th className="px-4 py-2.5 text-right">ระยะเวลา</th>
                <th className="px-4 py-2.5 text-right">ราคาเริ่มต้น</th>
                <th className="px-4 py-2.5 text-right">เที่ยวเรือ</th>
                <th className="px-4 py-2.5">สถานะ</th>
                <th className="px-4 py-2.5 text-right">จัดการ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-steel-200">
              {items.map((s) => (
                <tr key={s.id} className="hover:bg-steel-50">
                  <td className="px-4 py-2.5">
                    <p className="tabular text-sm text-steel-500">{s.code}</p>
                    <p className="text-steel-700">{s.name}</p>
                  </td>
                  <td className="px-4 py-2.5 text-sm text-steel-600">{SERVICE_TYPE_LABEL[s.service_type]}</td>
                  <td className="px-4 py-2.5 text-sm text-steel-600">
                    {s.origin_port} → {s.destination_port}
                  </td>
                  <td className="tabular px-4 py-2.5 text-right text-sm text-steel-600">{s.transit_days} วัน</td>
                  <td className="tabular px-4 py-2.5 text-right text-steel-700">{baht(s.base_price)}</td>
                  <td className="tabular px-4 py-2.5 text-right text-steel-600">{num(s.schedule_count ?? 0)}</td>
                  <td className="px-4 py-2.5 text-sm text-steel-600">
                    {s.status === 'active' ? 'เปิดใช้งาน' : 'ปิดใช้งาน'}
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
        title={editing === 'new' ? 'เพิ่มบริการ' : 'แก้ไขบริการ'}
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
            <Field label="รหัสบริการ" htmlFor="s-code" required error={fieldErrors.code}>
              <Input id="s-code" value={form.code} onChange={set('code')} placeholder="SVC-EXP-SIN" />
            </Field>
            <Field label="ประเภทบริการ" htmlFor="s-type" required>
              <Select id="s-type" value={form.service_type} onChange={set('service_type')}>
                {Object.entries(SERVICE_TYPE_LABEL).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <Field label="ชื่อบริการ" htmlFor="s-name" required error={fieldErrors.name}>
            <Input id="s-name" value={form.name} onChange={set('name')} />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="ท่าเรือต้นทาง" htmlFor="s-origin" required error={fieldErrors.origin_port}>
              <Input id="s-origin" value={form.origin_port} onChange={set('origin_port')} placeholder="แหลมฉบัง (THLCH)" />
            </Field>
            <Field label="ท่าเรือปลายทาง" htmlFor="s-dest" required error={fieldErrors.destination_port}>
              <Input
                id="s-dest"
                value={form.destination_port}
                onChange={set('destination_port')}
                placeholder="สิงคโปร์ (SGSIN)"
              />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="ระยะเวลาขนส่ง (วัน)" htmlFor="s-transit" error={fieldErrors.transit_days}>
              <Input id="s-transit" type="number" min={0} value={form.transit_days} onChange={set('transit_days')} />
            </Field>
            <Field label="ราคาเริ่มต้นต่อ TEU" htmlFor="s-price" required error={fieldErrors.base_price}>
              <Input id="s-price" type="number" min={0} value={form.base_price} onChange={set('base_price')} />
            </Field>
            <Field label="สถานะ" htmlFor="s-status" required>
              <Select id="s-status" value={form.status} onChange={set('status')}>
                <option value="active">เปิดใช้งาน</option>
                <option value="inactive">ปิดใช้งาน</option>
              </Select>
            </Field>
          </div>

          <Field label="รายละเอียด" htmlFor="s-desc">
            <textarea id="s-desc" rows={3} value={form.description} onChange={set('description')} className="field-input" />
          </Field>
        </div>
      </Modal>

      <Modal
        open={deleting !== null}
        title="ยืนยันการลบบริการ"
        onClose={() => setDeleting(null)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleting(null)}>
              ยกเลิก
            </Button>
            <Button variant="danger" onClick={remove} loading={busy}>
              ลบบริการ
            </Button>
          </>
        }
      >
        {formError && <ErrorNotice message={formError} />}
        <p className="mt-2 text-steel-600">
          ต้องการลบบริการ <span className="font-medium text-ink">{deleting?.name}</span> ใช่หรือไม่
        </p>
        <p className="mt-2 text-steel-600">
          หากบริการนี้มีตารางเที่ยวเรือผูกอยู่ ระบบจะไม่อนุญาตให้ลบ — ให้เปลี่ยนสถานะเป็นปิดใช้งานแทน
        </p>
      </Modal>
    </>
  );
}
