import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { api, clearToken, getToken, setToken, SESSION_EXPIRED_EVENT } from './api';
import type { User } from './types';

/**
 * สถานะการเข้าสู่ระบบของทั้งแอป
 *
 * เก็บ token ใน localStorage แล้วถาม /api/auth/me ตอนเปิดแอปทุกครั้ง
 * เพื่อยืนยันว่า token ยังใช้ได้จริงและบัญชียังไม่ถูกระงับ — ไม่เชื่อข้อมูล
 * ที่อยู่ในเครื่องผู้ใช้ฝ่ายเดียว
 */

type AuthState = {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<User>;
  register: (payload: Record<string, string>) => Promise<User>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!getToken()) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      const { user: me } = await api.get<{ user: User }>('/api/auth/me');
      setUser(me);
    } catch {
      clearToken();
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // เมื่อ API ตอบ 401 ที่ไหนก็ตาม ให้ล้างผู้ใช้ออกจากสถานะของแอปด้วย
  // React Router จะพาไปหน้าเข้าสู่ระบบเองผ่านตัวป้องกันเส้นทาง
  useEffect(() => {
    const onExpired = () => setUser(null);
    window.addEventListener(SESSION_EXPIRED_EVENT, onExpired);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const res = await api.post<{ user: User; token: string }>('/api/auth/login', { email, password });
    setToken(res.token);
    setUser(res.user);
    return res.user;
  }, []);

  const register = useCallback(async (payload: Record<string, string>) => {
    const res = await api.post<{ user: User; token: string }>('/api/auth/register', payload);
    setToken(res.token);
    setUser(res.user);
    return res.user;
  }, []);

  const logout = useCallback(async () => {
    // เรียก backend เพื่อบันทึกประวัติ แต่ต่อให้ล้มเหลวก็ต้องออกจากระบบฝั่งนี้ให้ได้
    try {
      await api.post('/api/auth/logout');
    } catch {
      /* ไม่มีผลต่อการออกจากระบบ */
    }
    clearToken();
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, loading, login, register, logout, refresh }),
    [user, loading, login, register, logout, refresh]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth ต้องอยู่ภายใน AuthProvider');
  return ctx;
}
