import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../../lib/api';
import type { ContainerType } from '../../lib/types';
import { Button, EmptyState, ErrorNotice, Field, Input, Loading, Select } from '../../components/ui';
import Modal from '../../components/Modal';
import PageHeader from '../../components/PageHeader';
import { num } from '../../lib/format';

const EMPTY = {
  code: '',
  name: '',
  size_ft: '20',
  teu_factor: '1',
  max_payload_kg: '0',
  description: '',
  is_active: 'true',
};

/** UC-12 Manage Container Types */
export default function AdminContainers() {
  const [items, setItems] = useState<ContainerType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [editing, setEditing] = useState<ContainerType | 'new' | null>(null);
  const [deleting, setDeleting] = useState<ContainerType | null>(null);
  const [form, setForm] = useState<Record<string, string>>(EMPTY);
  const [formError, setFormError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setError('');
    api
      .get<{ items: ContainerType[] }>('/api/admin/container-types')
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

  const openEdit = (c: ContainerType) => {
    setForm({
      code: c.code,
      name: c.name,
      size_ft: String(c.size_ft),
      teu_factor: String(c.teu_factor),
      max_payload_kg: String(c.max_payload_kg),
      description: c.description ?? '',
      is_active: c.is_active ? 'true' : 'false',
    });
    setFormError('');
    setFieldErrors({});
    setEditing(c);
  };

  const save = async () => {
    setFormError('');
    setFieldErrors({});
    setBusy(true);
    try {
      if (editing === 'new') await api.post('/api/admin/container-types', form);
      else if (editing) await api.put(`/api/admin/container-types/${editing.id}`, form);
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
      await api.del(`/api/admin/container-types/${deleting.id}`);
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
        title="ประเภทตู้คอนเทนเนอร์"
        description="กำหนดขนาด ค่าเทียบ TEU และพิกัดน้ำหนักของตู้แต่ละประเภทที่เปิดให้จอง"
        actions={<Button onClick={openNew}>เพิ่มประเภทตู้</Button>}
      />

      {loading ? (
        <Loading />
      ) : error ? (
        <ErrorNotice message={error} onRetry={load} />
      ) : items.length === 0 ? (
        <div className="panel">
          <EmptyState
            title="ยังไม่มีประเภทตู้ในระบบ"
            description="เพิ่มประเภทตู้เพื่อให้ลูกค้าเลือกได้ตอนสร้างการจอง"
            action={<Button onClick={openNew}>เพิ่มประเภทตู้</Button>}
          />
        </div>
      ) : (
        <div className="panel overflow-x-auto">
          <table className="w-full min-w-[820px] border-collapse">
            <thead>
              <tr className="table-head">
                <th className="px-4 py-2.5">รหัส / ชื่อ</th>
                <th className="px-4 py-2.5 text-right">ขนาด</th>
                <th className="px-4 py-2.5 text-right">ค่าเทียบ TEU</th>
                <th className="px-4 py-2.5 text-right">พิกัดน้ำหนัก</th>
                <th className="px-4 py-2.5 text-right">ถูกใช้ในการจอง</th>
                <th className="px-4 py-2.5">สถานะ</th>
                <th className="px-4 py-2.5 text-right">จัดการ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-steel-200">
              {items.map((c) => (
                <tr key={c.id} className="hover:bg-steel-50">
                  <td className="px-4 py-2.5">
                    <p className="tabular font-medium text-ink">{c.code}</p>
                    <p className="text-sm text-steel-500">{c.name}</p>
                  </td>
                  <td className="tabular px-4 py-2.5 text-right text-steel-700">{c.size_ft} ฟุต</td>
                  <td className="tabular px-4 py-2.5 text-right text-steel-700">{num(c.teu_factor, 1)}</td>
                  <td className="tabular px-4 py-2.5 text-right text-steel-700">{num(c.max_payload_kg)} กก.</td>
                  <td className="tabular px-4 py-2.5 text-right text-steel-600">{num(c.usage_count ?? 0)}</td>
                  <td className="px-4 py-2.5 text-sm text-steel-600">{c.is_active ? 'เปิดใช้งาน' : 'ปิดใช้งาน'}</td>
                  <td className="px-4 py-2.5 text-right">
                    <Button variant="ghost" size="sm" onClick={() => openEdit(c)}>
                      แก้ไข
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setDeleting(c)} className="text-red-700">
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
        title={editing === 'new' ? 'เพิ่มประเภทตู้' : 'แก้ไขประเภทตู้'}
        onClose={() => setEditing(null)}
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
            <Field label="รหัสประเภทตู้" htmlFor="c-code" required error={fieldErrors.code}>
              <Input id="c-code" value={form.code} onChange={set('code')} placeholder="40HC" />
            </Field>
            <Field label="ขนาด (ฟุต)" htmlFor="c-size" required error={fieldErrors.size_ft}>
              <Input id="c-size" type="number" min={1} value={form.size_ft} onChange={set('size_ft')} />
            </Field>
          </div>

          <Field label="ชื่อประเภทตู้" htmlFor="c-name" required error={fieldErrors.name}>
            <Input id="c-name" value={form.name} onChange={set('name')} placeholder="ตู้สูงพิเศษ 40 ฟุต" />
          </Field>

          <div className="grid gap-4 sm:grid-cols-3">
            <Field
              label="ค่าเทียบ TEU"
              htmlFor="c-teu"
              required
              hint="ตู้ 20 ฟุต = 1.0"
              error={fieldErrors.teu_factor}
            >
              <Input id="c-teu" type="number" step="0.1" min={0.1} value={form.teu_factor} onChange={set('teu_factor')} />
            </Field>
            <Field label="พิกัดน้ำหนัก (กก.)" htmlFor="c-payload" error={fieldErrors.max_payload_kg}>
              <Input
                id="c-payload"
                type="number"
                min={0}
                value={form.max_payload_kg}
                onChange={set('max_payload_kg')}
              />
            </Field>
            <Field label="สถานะ" htmlFor="c-active" required>
              <Select id="c-active" value={form.is_active} onChange={set('is_active')}>
                <option value="true">เปิดใช้งาน</option>
                <option value="false">ปิดใช้งาน</option>
              </Select>
            </Field>
          </div>

          <Field label="รายละเอียด" htmlFor="c-desc">
            <textarea id="c-desc" rows={2} value={form.description} onChange={set('description')} className="field-input" />
          </Field>
        </div>
      </Modal>

      <Modal
        open={deleting !== null}
        title="ยืนยันการลบประเภทตู้"
        onClose={() => setDeleting(null)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleting(null)}>
              ยกเลิก
            </Button>
            <Button variant="danger" onClick={remove} loading={busy}>
              ลบประเภทตู้
            </Button>
          </>
        }
      >
        {formError && <ErrorNotice message={formError} />}
        <p className="mt-2 text-steel-600">
          ต้องการลบประเภทตู้ <span className="tabular font-medium text-ink">{deleting?.code}</span> ใช่หรือไม่
        </p>
        <p className="mt-2 text-steel-600">
          หากประเภทตู้นี้เคยถูกใช้ในการจอง ระบบจะไม่อนุญาตให้ลบ — ให้ปิดการใช้งานแทน
        </p>
      </Modal>
    </>
  );
}
