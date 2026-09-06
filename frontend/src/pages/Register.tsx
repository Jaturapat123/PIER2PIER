import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Ship } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { ApiError } from '../lib/api';
import { Button, ErrorNotice, Field, Input } from '../components/ui';

const EMPTY = {
  username: '',
  full_name: '',
  email: '',
  phone: '',
  company_name: '',
  password: '',
  confirm_password: '',
};

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState(EMPTY);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const set = (key: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setFieldErrors({});
    setBusy(true);
    try {
      await register(form);
      navigate('/app');
    } catch (err) {
      if (err instanceof ApiError) {
        setFieldErrors(err.fieldErrors);
        // แสดงข้อความรวมเฉพาะตอนที่ไม่ใช่ error รายฟิลด์ ไม่งั้นผู้ใช้เห็นข้อความซ้ำสองที่
        if (Object.keys(err.fieldErrors).length === 0) setError(err.message);
      } else {
        setError('สมัครสมาชิกไม่สำเร็จ กรุณาลองใหม่');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-dvh flex-col justify-center bg-ink px-4 py-10">
      <div className="mx-auto w-full max-w-lg">
        <Link to="/" className="mb-7 flex items-center justify-center gap-2.5">
          <Ship size={24} className="text-hivis" aria-hidden />
          <span className="text-lg font-semibold text-white">Pier2Pier</span>
        </Link>

        <div className="rounded-lg bg-white p-6 shadow-float">
          <h1 className="text-xl font-semibold text-ink">สมัครใช้งาน</h1>
          <p className="mt-1 text-sm text-steel-500">
            สร้างบัญชีเพื่อจองบริการท่าเรือและติดตามสถานะตู้สินค้าของคุณ
          </p>

          <form onSubmit={submit} className="mt-5 space-y-4">
            {error && <ErrorNotice message={error} />}

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="ชื่อผู้ใช้" htmlFor="username" required error={fieldErrors.username}>
                <Input id="username" required value={form.username} onChange={set('username')} autoComplete="username" />
              </Field>

              <Field label="ชื่อ-นามสกุล" htmlFor="full_name" required error={fieldErrors.full_name}>
                <Input id="full_name" required value={form.full_name} onChange={set('full_name')} autoComplete="name" />
              </Field>
            </div>

            <Field label="อีเมล" htmlFor="email" required error={fieldErrors.email}>
              <Input id="email" type="email" required value={form.email} onChange={set('email')} autoComplete="email" />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
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
            </div>

            <Field
              label="รหัสผ่าน"
              htmlFor="password"
              required
              hint="อย่างน้อย 8 ตัวอักษร"
              error={fieldErrors.password}
            >
              <Input
                id="password"
                type="password"
                required
                minLength={8}
                value={form.password}
                onChange={set('password')}
                autoComplete="new-password"
              />
            </Field>

            <Field label="ยืนยันรหัสผ่าน" htmlFor="confirm_password" required error={fieldErrors.confirm_password}>
              <Input
                id="confirm_password"
                type="password"
                required
                value={form.confirm_password}
                onChange={set('confirm_password')}
                autoComplete="new-password"
              />
            </Field>

            <Button type="submit" loading={busy} className="w-full">
              สร้างบัญชี
            </Button>
          </form>

          <p className="mt-5 text-center text-sm text-steel-500">
            มีบัญชีอยู่แล้ว?{' '}
            <Link to="/login" className="font-medium text-sea underline-offset-2 hover:underline">
              เข้าสู่ระบบ
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
