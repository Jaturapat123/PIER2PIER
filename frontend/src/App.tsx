import { Navigate, Route, Routes } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuth } from './lib/auth';
import { Loading } from './components/ui';
import Layout from './components/Layout';

import Landing from './pages/Landing';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import Services from './pages/Services';
import NewBooking from './pages/NewBooking';
import Bookings from './pages/Bookings';
import BookingDetail from './pages/BookingDetail';
import Profile from './pages/Profile';

import AdminOverview from './pages/admin/Overview';
import AdminBookings from './pages/admin/Bookings';
import AdminServices from './pages/admin/Services';
import AdminSchedules from './pages/admin/Schedules';
import AdminContainers from './pages/admin/Containers';
import AdminStock from './pages/admin/Stock';
import AdminReports from './pages/admin/Reports';
import AdminUsers from './pages/admin/Users';
import SystemHealth from './pages/admin/SystemHealth';

/** ป้องกันเส้นทางที่ต้องเข้าสู่ระบบ และแยกพื้นที่ของผู้ดูแลระบบออกจากลูกค้า */
function Protected({ role, children }: { role?: 'admin'; children: ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) return <Loading label="กำลังตรวจสอบสิทธิ์การเข้าใช้งาน" />;
  if (!user) return <Navigate to="/login" replace />;
  if (role === 'admin' && user.role !== 'admin') return <Navigate to="/app" replace />;

  return <>{children}</>;
}

export default function App() {
  const { user } = useAuth();

  return (
    <Routes>
      <Route path="/" element={user ? <Navigate to={user.role === 'admin' ? '/admin' : '/app'} replace /> : <Landing />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />

      <Route
        path="/app"
        element={
          <Protected>
            <Layout area="customer" />
          </Protected>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="services" element={<Services />} />
        <Route path="bookings" element={<Bookings />} />
        <Route path="bookings/new" element={<NewBooking />} />
        <Route path="bookings/:id" element={<BookingDetail />} />
        <Route path="profile" element={<Profile />} />
      </Route>

      <Route
        path="/admin"
        element={
          <Protected role="admin">
            <Layout area="admin" />
          </Protected>
        }
      >
        <Route index element={<AdminOverview />} />
        <Route path="bookings" element={<AdminBookings />} />
        <Route path="services" element={<AdminServices />} />
        <Route path="schedules" element={<AdminSchedules />} />
        <Route path="containers" element={<AdminContainers />} />
        <Route path="stock" element={<AdminStock />} />
        <Route path="reports" element={<AdminReports />} />
        <Route path="users" element={<AdminUsers />} />
        <Route path="health" element={<SystemHealth />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
