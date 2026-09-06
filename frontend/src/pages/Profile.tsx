import { useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import type { User } from '../lib/types';
import { Button, ErrorNotice, Field, Input, Loading } from '../components/ui';
import PageHeader from '../components/PageHeader';

/** UC-8 Update Profile */
export default function Profile() {
  const { refresh } = useAuth();

  const [form, setForm] = useState({ full_name: '', email: '', phone: '', company_name: '' });
  const [pw, setPw] = useState({ current_password: '', new_password: '' });
  const [loading, setLoading] = useState(true);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [pwError, setPwError] = useState('');
  const [pwSuccess, setPwSuccess] = useState('');
  const [busy, setBusy] = useState(false);
  const [pwBusy, setPwBusy] = useState(false);

  useEffect(() => {
    api
      .get<{ user: User }>('/api/profile')
      .then(({ user }) =>
        setForm({
          full_name: user.full_name,
          email: user.email,
          phone: user.phone ?? '',
          company_name: user.company_name ?? '',
        })
      )
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setFieldErrors({});
    setBusy(true);
    try {
      await api.put('/api/profile', form);
      await refresh();
      setSuccess('บันทึกข้อมูลส่วนตัวเรียบร้อยแล้ว');
    } catch (err) {
      if (err instanceof ApiError) {
        setFieldErrors(err.fieldErrors);
        if (Object.keys(err.fieldErrors).length === 0) setError(err.message);
      } else {
        setError('บันทึกไม่สำเร็จ กรุณาลองใหม่');
      }
    } finally {
      setBusy(false);
    }
  };

  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwError('');
    setPwSuccess('');
    setPwBusy(true);
    try {
      await api.post('/api/auth/change-password', pw);
      setPw({ current_password: '', new_password: '' });
      setPwSuccess('เปลี่ยนรหัสผ่านเรียบร้อยแล้ว');
    } catch (err) {
      setPwError(err instanceof ApiError ? err.message : 'เปลี่ยนรหัสผ่านไม่สำเร็จ');
    } finally {
      setPwBusy(false);
    }
  };

  if (loading) return <Loading />;

  return (
    <>
      <PageHeader title="ข้อมูลส่วนตัว" description="แก้ไขข้อมูลติดต่อและรหัสผ่านของบัญชีคุณ" />

      <div className="grid gap-5 lg:grid-cols-2">
        <form onSubmit={save} className="panel space-y-4 p-5">
          <h2 className="text-lg font-medium text-ink">ข้อมูลติดต่อ</h2>

          {error && <ErrorNotice message={error} />}
          {success && (
            <p className="rounded-md border border-green-200 bg-green-50 px-4 py-3 text-green-800" role="status">
              {success}
            </p>
          )}

          <Field label="ชื่อ-นามสกุล" htmlFor="full_name" required error={fieldErrors.full_name}>
            <Input id="full_name" required value={form.full_name} onChange={set('full_name')} autoComplete="name" />
          </Field>

          <Field label="อีเมล" htmlFor="email" required error={fieldErrors.email}>
            <Input id="email" type="email" required value={form.email} onChange={set('email')} autoComplete="email" />
          </Field>

          <Field label="เบอร์โทรศัพท์" htmlFor="phone" error={fieldErrors.phone}>
            <Input id="phone" type="tel" value={form.phone} onChange={set('phone')} autoComplete="tel" />
          </Field>

          <Field label="ชื่อบริษัท" htmlFor="company_name" error={fieldErrors.company_name}>
            <Input
              id="company_name"
              value={form.company_name}
              onChange={set('company_name')}
              autoComplete="organization"
            />
          </Field>

          <Button type="submit" loading={busy}>
            บันทึกข้อมูล
          </Button>
        </form>

        <form onSubmit={changePassword} className="panel h-fit space-y-4 p-5">
          <h2 className="text-lg font-medium text-ink">เปลี่ยนรหัสผ่าน</h2>

          {pwError && <ErrorNotice message={pwError} />}
          {pwSuccess && (
            <p className="rounded-md border border-green-200 bg-green-50 px-4 py-3 text-green-800" role="status">
              {pwSuccess}
            </p>
          )}

          <Field label="รหัสผ่านปัจจุบัน" htmlFor="current_password" required>
            <Input
              id="current_password"
              type="password"
              required
              value={pw.current_password}
              onChange={(e) => setPw((p) => ({ ...p, current_password: e.target.value }))}
              autoComplete="current-password"
            />
          </Field>

          <Field label="รหัสผ่านใหม่" htmlFor="new_password" required hint="อย่างน้อย 8 ตัวอักษร">
            <Input
              id="new_password"
              type="password"
              required
              minLength={8}
              value={pw.new_password}
              onChange={(e) => setPw((p) => ({ ...p, new_password: e.target.value }))}
              autoComplete="new-password"
            />
          </Field>

          <Button type="submit" variant="secondary" loading={pwBusy}>
            เปลี่ยนรหัสผ่าน
          </Button>
        </form>
      </div>
    </>
  );
}
