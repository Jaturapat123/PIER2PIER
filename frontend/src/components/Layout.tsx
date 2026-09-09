import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  Anchor,
  Boxes,
  CalendarClock,
  ClipboardList,
  Container,
  LayoutDashboard,
  LogOut,
  Menu,
  PackageSearch,
  Ship,
  UserCog,
  Users,
  Warehouse,
  X,
} from 'lucide-react';
import { useAuth } from '../lib/auth';
import { api } from '../lib/api';
import type { HealthResponse } from '../lib/types';

/**
 * โครงหน้าจอ: คอนโซลสีเข้มล้อมพื้นที่ทำงานสีสว่าง
 * อ้างอิงห้องควบคุมท่าเรือจริงที่มีแผงควบคุมมืดล้อมเอกสารที่ส่องไฟไว้
 */

type NavItem = { to: string; label: string; icon: typeof Ship };

const CUSTOMER_NAV: NavItem[] = [
  { to: '/app', label: 'ภาพรวม', icon: LayoutDashboard },
  { to: '/app/services', label: 'บริการและเที่ยวเรือ', icon: Ship },
  { to: '/app/bookings/new', label: 'สร้างการจอง', icon: CalendarClock },
  { to: '/app/bookings', label: 'การจองของฉัน', icon: ClipboardList },
  { to: '/app/profile', label: 'ข้อมูลส่วนตัว', icon: UserCog },
];

const ADMIN_NAV: NavItem[] = [
  { to: '/admin', label: 'ภาพรวมระบบ', icon: LayoutDashboard },
  { to: '/admin/bookings', label: 'รายการจอง', icon: ClipboardList },
  { to: '/admin/services', label: 'บริการ', icon: Anchor },
  { to: '/admin/schedules', label: 'ตารางเที่ยวเรือ', icon: Ship },
  { to: '/admin/containers', label: 'ประเภทตู้', icon: Container },
  { to: '/admin/stock', label: 'สินค้าคงคลัง', icon: Warehouse },
  { to: '/admin/reports', label: 'รายงาน', icon: PackageSearch },
  { to: '/admin/users', label: 'ผู้ใช้งาน', icon: Users },
  { to: '/admin/health', label: 'สถานะระบบ', icon: Boxes },
];

/**
 * ป้ายบอกว่า request ล่าสุดถูกเสิร์ฟจากเครื่องไหน
 *
 * เป็นตัวที่ทำให้ Load Balancer "มองเห็นได้" ระหว่างนำเสนอ — พอปิด EC2 เครื่องหนึ่ง
 * ป้ายนี้จะเปลี่ยนเป็นอีกเครื่องภายในไม่กี่วินาที
 *
 * แสดงเฉพาะพื้นที่ของผู้ดูแลระบบ จึงลิงก์ไปหน้าสถานะระบบได้เสมอ
 */
function InstanceBadge() {
  const [health, setHealth] = useState<HealthResponse | null>(null);

  useEffect(() => {
    let alive = true;
    const poll = async () => {
      try {
        const res = await api.get<HealthResponse>('/health');
        if (alive) setHealth(res);
      } catch {
        if (alive) setHealth(null);
      }
    };
    void poll();
    const timer = setInterval(poll, 5000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);

  if (!health) {
    return <span className="text-sm text-steel-400">ไม่ทราบสถานะเซิร์ฟเวอร์</span>;
  }

  const content = (
    <>
      <span
        className={`h-2 w-2 shrink-0 rounded-full ${health.db.ok ? 'bg-green-400' : 'bg-red-400'}`}
        aria-hidden
      />
      <span className="tabular">{health.instance.availabilityZone}</span>
      <span className="hidden text-steel-500 sm:inline">·</span>
      <span className="tabular hidden text-steel-400 sm:inline">{health.instance.hostname}</span>
    </>
  );

  return (
    <Link
      to="/admin/health"
      className="flex items-center gap-2 rounded px-2 py-1 text-sm text-steel-300 hover:bg-deck"
      title="เครื่องที่ให้บริการคำขอล่าสุด"
    >
      {content}
    </Link>
  );
}

export default function Layout({ area }: { area: 'customer' | 'admin' }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  const nav = area === 'admin' ? ADMIN_NAV : CUSTOMER_NAV;

  // ปิดเมนูมือถือทุกครั้งที่เปลี่ยนหน้า ไม่งั้นเมนูจะค้างทับเนื้อหา
  useEffect(() => setMenuOpen(false), [location.pathname]);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className="console flex min-h-dvh flex-col bg-steel-100 lg:flex-row">
      {/* แถบด้านข้าง — คอนโซล */}
      {/* flex-col จำเป็นเพื่อให้ mt-auto ดันส่วนออกจากระบบไปติดขอบล่างได้จริง
          และ h-dvh + sticky ทำให้แถบนี้อยู่กับที่ขณะเลื่อนเนื้อหาหลัก */}
      <aside
        className={`flex-col bg-ink text-steel-200 lg:sticky lg:top-0 lg:flex lg:h-dvh lg:w-64
                    lg:shrink-0 ${menuOpen ? 'flex' : 'hidden'}`}
      >
        <div className="flex h-16 items-center gap-2.5 border-b border-deck px-5">
          <Ship size={22} className="text-hivis" aria-hidden />
          <div>
            <p className="font-semibold leading-tight text-white">Pier2Pier</p>
            <p className="text-2xs leading-tight text-steel-400">
              {area === 'admin' ? 'ระบบผู้ดูแลท่าเรือ' : 'ระบบจองบริการท่าเรือ'}
            </p>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto p-3" aria-label="เมนูหลัก">
          <ul className="space-y-0.5">
            {nav.map(({ to, label, icon: Icon }) => (
              <li key={to}>
                <NavLink
                  to={to}
                  end={to === '/app' || to === '/admin'}
                  className={({ isActive }) =>
                    `flex min-h-[44px] items-center gap-3 rounded-md px-3 text-sm transition-colors duration-150
                     ${isActive ? 'bg-hivis/15 font-medium text-white' : 'text-steel-300 hover:bg-deck'}`
                  }
                >
                  <Icon size={18} aria-hidden />
                  {label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        {/* ออกจากระบบแยกจากเมนูนำทางอย่างชัดเจน กันกดพลาด */}
        <div className="mt-auto shrink-0 border-t border-deck p-3">
          <div className="px-3 py-2">
            <p className="truncate text-sm font-medium text-white">{user?.full_name}</p>
            <p className="truncate text-2xs text-steel-400">{user?.company_name ?? user?.email}</p>
          </div>
          <button
            onClick={handleLogout}
            className="flex min-h-[44px] w-full items-center gap-3 rounded-md px-3 text-sm text-steel-300 hover:bg-deck"
          >
            <LogOut size={18} aria-hidden />
            ออกจากระบบ
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* ฝั่งลูกค้าไม่มีป้ายเซิร์ฟเวอร์แล้ว จอใหญ่จึงไม่เหลืออะไรในแถบนี้ — ซ่อนทั้งแถบ
            ไม่งั้นจะเป็นแถบว่างสูง 64px คาดอยู่เหนือทุกหน้า */}
        <header
          className={`flex h-16 items-center justify-between gap-3 border-b border-deck bg-ink px-4 lg:px-6
                      ${area === 'customer' ? 'lg:hidden' : ''}`}
        >
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="flex h-11 w-11 items-center justify-center rounded-md text-steel-200 hover:bg-deck lg:hidden"
            aria-label={menuOpen ? 'ปิดเมนู' : 'เปิดเมนู'}
            aria-expanded={menuOpen}
          >
            {menuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>

          {/* เฉพาะฝั่งผู้ดูแลระบบ — ลูกค้าไม่ต้องรับรู้ว่าเบื้องหลังมีเซิร์ฟเวอร์กี่เครื่องชื่ออะไร
              ml-auto จำเป็น เพราะบนจอใหญ่ปุ่มเมนูถูกซ่อน เหลือ badge เป็นลูกตัวเดียว */}
          {area === 'admin' && (
            <div className="ml-auto">
              <InstanceBadge />
            </div>
          )}
        </header>

        <main className="flex-1 px-4 py-6 lg:px-8">
          <div className="mx-auto max-w-6xl">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
