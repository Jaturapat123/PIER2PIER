import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Ship } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { ApiError } from '../lib/api';
import { Button, ErrorNotice, Field, Input } from '../components/ui';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const user = await login(email, password);
      navigate(user.role === 'admin' ? '/admin' : '/app');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'เข้าสู่ระบบไม่สำเร็จ กรุณาลองใหม่');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-dvh flex-col justify-center bg-ink px-4 py-10">
      <div className="mx-auto w-full max-w-sm">
        <Link to="/" className="mb-7 flex items-center justify-center gap-2.5">
          <Ship size={24} className="text-hivis" aria-hidden />
          <span className="text-lg font-semibold text-white">Pier2Pier</span>
        </Link>

        <div className="rounded-lg bg-white p-6 shadow-float">
          <h1 className="text-xl font-semibold text-ink">เข้าสู่ระบบ</h1>
          <p className="mt-1 text-sm text-steel-500">
            สำหรับตัวแทนขนส่ง ลูกค้า และเจ้าหน้าที่ท่าเรือ
          </p>

          <form onSubmit={submit} className="mt-5 space-y-4">
            {error && <ErrorNotice message={error} />}

            <Field label="อีเมล" htmlFor="email" required>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.co.th"
              />
            </Field>

            <Field label="รหัสผ่าน" htmlFor="password" required>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </Field>

            <Button type="submit" loading={busy} className="w-full">
              เข้าสู่ระบบ
            </Button>
          </form>

          <p className="mt-5 text-center text-sm text-steel-500">
            ยังไม่มีบัญชี?{' '}
            <Link to="/register" className="font-medium text-sea underline-offset-2 hover:underline">
              สมัครใช้งาน
            </Link>
          </p>
        </div>

        {/* บัญชีสาธิตสำหรับการนำเสนอ — ในระบบจริงส่วนนี้จะถูกถอดออก */}
        <div className="mt-4 rounded-md border border-deck bg-hull px-4 py-3 text-sm text-steel-300">
          <p className="font-medium text-steel-200">บัญชีสำหรับสาธิต</p>
          <p className="tabular mt-1">ผู้ดูแล admin@pier2pier.test</p>
          <p className="tabular">ลูกค้า customer@pier2pier.test</p>
          <p className="tabular">รหัสผ่าน Pier2Pier!2569</p>
        </div>
      </div>
    </div>
  );
}
