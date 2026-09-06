import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../../lib/api';
import type { Paged, User } from '../../lib/types';
import { Button, EmptyState, ErrorNotice, Field, Input, Loading, Select } from '../../components/ui';
import Modal from '../../components/Modal';
import PageHeader from '../../components/PageHeader';
import { dateOnly, num } from '../../lib/format';

/** UC-10 Manage Users */
export default function AdminUsers() {
  const [items, setItems] = useState<User[]>([]);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [editing, setEditing] = useState<User | 'new' | null>(null);
  const [deleting, setDeleting] = useState<User | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setError('');
    api
      .get<Paged<User>>(`/api/admin/users?pageSize=100${q ? `&q=${encodeURIComponent(q)}` : ''}`)
      .then((r) => setItems(r.items))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [q]);

  useEffect(load, [load]);

  const openNew = () => {
    setForm({ username: '', full_name: '', email: '', phone: '', company_name: '', password: '', role: 'customer' });
    setFormError('');
    setFieldErrors({});
    setEditing('new');
  };

  const openEdit = (u: User) => {
    setForm({
      full_name: u.full_name,
      email: u.email,
      phone: u.phone ?? '',
      company_name: u.company_name ?? '',
      role: u.role,
      status: u.status,
      password: '',
    });
    setFormError('');
    setFieldErrors({});
    setEditing(u);
  };

  const save = async () => {
    setFormError('');
    setFieldErrors({});
    setBusy(true);
    try {
      if (editing === 'new') await api.post('/api/admin/users', form);
      else if (editing) await api.put(`/api/admin/users/${editing.id}`, form);
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
      await api.del(`/api/admin/users/${deleting.id}`);
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
        title="ผู้ใช้งาน"
        description="จัดการบัญชีผู้ใช้ กำหนดสิทธิ์ และระงับบัญชีที่มีปัญหา"
        actions={<Button onClick={openNew}>เพิ่มผู้ใช้</Button>}
      />

      <div className="panel mb-4 p-4">
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="ค้นหาจากชื่อ อีเมล ชื่อผู้ใช้ หรือชื่อบริษัท"
          aria-label="ค้นหาผู้ใช้"
        />
      </div>

      {loading ? (
        <Loading />
      ) : error ? (
        <ErrorNotice message={error} onRetry={load} />
      ) : items.length === 0 ? (
        <div className="panel">
          <EmptyState title="ไม่พบผู้ใช้ที่ตรงกับคำค้นหา" description="ลองใช้คำค้นที่สั้นลง หรือล้างช่องค้นหา" />
        </div>
      ) : (
        <div className="panel overflow-x-auto">
          <table className="w-full min-w-[860px] border-collapse">
            <thead>
              <tr className="table-head">
                <th className="px-4 py-2.5">ผู้ใช้</th>
                <th className="px-4 py-2.5">บริษัท</th>
                <th className="px-4 py-2.5">สิทธิ์</th>
                <th className="px-4 py-2.5">สถานะ</th>
                <th className="px-4 py-2.5 text-right">การจอง</th>
                <th className="px-4 py-2.5">สมัครเมื่อ</th>
                <th className="px-4 py-2.5 text-right">จัดการ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-steel-200">
              {items.map((u) => (
                <tr key={u.id} className="hover:bg-steel-50">
                  <td className="px-4 py-2.5">
                    <p className="text-steel-700">{u.full_name}</p>
                    <p className="text-sm text-steel-500">{u.email}</p>
                  </td>
                  <td className="px-4 py-2.5 text-sm text-steel-600">{u.company_name ?? '—'}</td>
                  <td className="px-4 py-2.5 text-sm text-steel-600">
                    {u.role === 'admin' ? 'ผู้ดูแลระบบ' : 'ลูกค้า'}
                  </td>
                  <td className="px-4 py-2.5">
                    <span
                      className={`rounded px-2 py-0.5 text-sm ring-1 ring-inset ${
                        u.status === 'active'
                          ? 'bg-green-50 text-green-800 ring-green-200'
                          : 'bg-red-50 text-red-800 ring-red-200'
                      }`}
                    >
                      {u.status === 'active' ? 'ใช้งานได้' : 'ถูกระงับ'}
                    </span>
                  </td>
                  <td className="tabular px-4 py-2.5 text-right text-steel-700">{num(u.booking_count ?? 0)}</td>
                  <td className="px-4 py-2.5 text-sm text-steel-600">{dateOnly(u.created_at)}</td>
                  <td className="px-4 py-2.5 text-right">
                    <Button variant="ghost" size="sm" onClick={() => openEdit(u)}>
                      แก้ไข
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setDeleting(u)} className="text-red-700">
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
        title={editing === 'new' ? 'เพิ่มผู้ใช้' : 'แก้ไขข้อมูลผู้ใช้'}
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

          {editing === 'new' && (
            <Field label="ชื่อผู้ใช้" htmlFor="u-username" required error={fieldErrors.username}>
              <Input id="u-username" value={form.username ?? ''} onChange={set('username')} />
            </Field>
          )}

          <Field label="ชื่อ-นามสกุล" htmlFor="u-name" required error={fieldErrors.full_name}>
            <Input id="u-name" value={form.full_name ?? ''} onChange={set('full_name')} />
          </Field>

          <Field label="อีเมล" htmlFor="u-email" required error={fieldErrors.email}>
            <Input id="u-email" type="email" value={form.email ?? ''} onChange={set('email')} />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="เบอร์โทรศัพท์" htmlFor="u-phone">
              <Input id="u-phone" value={form.phone ?? ''} onChange={set('phone')} />
            </Field>
            <Field label="ชื่อบริษัท" htmlFor="u-company">
              <Input id="u-company" value={form.company_name ?? ''} onChange={set('company_name')} />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="สิทธิ์การใช้งาน" htmlFor="u-role" required>
              <Select id="u-role" value={form.role ?? 'customer'} onChange={set('role')}>
                <option value="customer">ลูกค้า</option>
                <option value="admin">ผู้ดูแลระบบ</option>
              </Select>
            </Field>

            {editing !== 'new' && (
              <Field label="สถานะบัญชี" htmlFor="u-status" required>
                <Select id="u-status" value={form.status ?? 'active'} onChange={set('status')}>
                  <option value="active">ใช้งานได้</option>
                  <option value="suspended">ระงับการใช้งาน</option>
                </Select>
              </Field>
            )}
          </div>

          <Field
            label={editing === 'new' ? 'รหัสผ่าน' : 'รหัสผ่านใหม่'}
            htmlFor="u-password"
            required={editing === 'new'}
            hint={editing === 'new' ? 'อย่างน้อย 8 ตัวอักษร' : 'เว้นว่างไว้หากไม่ต้องการเปลี่ยน'}
            error={fieldErrors.password}
          >
            <Input id="u-password" type="password" value={form.password ?? ''} onChange={set('password')} />
          </Field>
        </div>
      </Modal>

      <Modal
        open={deleting !== null}
        title="ยืนยันการลบผู้ใช้"
        onClose={() => setDeleting(null)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleting(null)}>
              ยกเลิก
            </Button>
            <Button variant="danger" onClick={remove} loading={busy}>
              ลบผู้ใช้
            </Button>
          </>
        }
      >
        {formError && <ErrorNotice message={formError} />}
        <p className="mt-2 text-steel-600">
          ต้องการลบบัญชีของ <span className="font-medium text-ink">{deleting?.full_name}</span> ใช่หรือไม่
        </p>
        <p className="mt-2 text-steel-600">
          หากผู้ใช้รายนี้มีรายการจองอยู่ ระบบจะไม่อนุญาตให้ลบ เพื่อรักษาประวัติธุรกรรม — ให้ระงับบัญชีแทน
        </p>
      </Modal>
    </>
  );
}
