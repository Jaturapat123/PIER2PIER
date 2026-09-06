import { Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { Ship } from 'lucide-react';
import { api } from '../lib/api';
import type { Paged, Schedule } from '../lib/types';
import { CapacityMeter } from '../components/ui';
import { SERVICE_TYPE_LABEL, dateTime, relativeDays } from '../lib/format';

/**
 * หน้าแรกสำหรับผู้ที่ยังไม่เข้าสู่ระบบ
 *
 * สิ่งแรกที่เห็นคือตารางเที่ยวเรือที่เปิดจองอยู่จริงพร้อมพื้นที่คงเหลือ
 * ไม่ใช่คำโฆษณา — เพราะคำถามแรกของตัวแทนขนส่งที่เข้ามาคือ
 * "เที่ยวไหนยังจองได้ และเหลือที่เท่าไหร่"
 */
export default function Landing() {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get<Paged<Schedule>>('/api/schedules?availableOnly=true&pageSize=6')
      .then((r) => setSchedules(r.items))
      .catch(() => setSchedules([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-dvh bg-steel-100">
      <header className="bg-ink">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 lg:px-6">
          <div className="flex items-center gap-2.5">
            <Ship size={22} className="text-hivis" aria-hidden />
            <span className="font-semibold text-white">Pier2Pier</span>
          </div>
          <div className="flex items-center gap-2">
            <Link
              to="/login"
              className="flex min-h-[44px] items-center rounded-md px-4 text-sm text-steel-200 hover:bg-deck"
            >
              เข้าสู่ระบบ
            </Link>
            <Link
              to="/register"
              className="flex min-h-[44px] items-center rounded-md bg-hivis px-4 text-sm font-medium text-white hover:bg-amber-700"
            >
              สมัครใช้งาน
            </Link>
          </div>
        </div>
      </header>

      <section className="bg-ink pb-14 pt-10 lg:pb-20 lg:pt-14">
        <div className="mx-auto max-w-6xl px-4 lg:px-6">
          <h1 className="max-w-3xl text-3xl font-semibold leading-tight text-white lg:text-4xl">
            จองระวางเรือ จัดการตู้คอนเทนเนอร์ และติดตามสินค้าในคลัง จากที่เดียว
          </h1>
          <p className="mt-4 max-w-2xl text-steel-300">
            ระบบจัดการคลังสินค้าและพื้นที่จัดเก็บของท่าเรือ สำหรับตัวแทนขนส่งและเจ้าหน้าที่ท่าเรือ
            เห็นพื้นที่ระวางที่เหลือจริงก่อนจอง และติดตามสถานะตู้ได้ตลอดเส้นทาง
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-16 lg:px-6">
        <div className="-mt-8 rounded-lg bg-white p-5 shadow-panel lg:p-6">
          <div className="mb-4 flex items-baseline justify-between gap-4">
            <h2 className="text-lg font-semibold text-ink">เที่ยวเรือที่เปิดรับการจอง</h2>
            <Link to="/login" className="text-sm font-medium text-sea underline-offset-2 hover:underline">
              ดูทั้งหมด
            </Link>
          </div>

          {loading ? (
            <p className="py-10 text-center text-steel-500">กำลังโหลดตารางเที่ยวเรือ</p>
          ) : schedules.length === 0 ? (
            <p className="py-10 text-center text-steel-500">
              ยังไม่มีเที่ยวเรือที่เปิดรับการจองในขณะนี้ กรุณากลับมาตรวจสอบใหม่อีกครั้ง
            </p>
          ) : (
            <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {schedules.map((s) => (
                <li key={s.id} className="rounded-md border border-steel-200 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-ink">{s.vessel_name}</p>
                      <p className="tabular text-sm text-steel-500">{s.voyage_no}</p>
                    </div>
                    <span className="shrink-0 rounded bg-steel-100 px-2 py-0.5 text-sm text-steel-600">
                      {SERVICE_TYPE_LABEL[s.service_type ?? 'export']}
                    </span>
                  </div>

                  <p className="mt-3 text-sm text-steel-600">
                    {s.origin_port} → {s.destination_port}
                  </p>
                  <p className="mt-0.5 text-sm text-steel-500">
                    ออกเดินทาง {dateTime(s.etd)} · ปิดรับ {relativeDays(s.cutoff_at)}
                  </p>

                  <div className="mt-3.5">
                    <CapacityMeter booked={s.booked_teu} capacity={s.capacity_teu} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <footer className="border-t border-steel-200 bg-white py-6">
        <div className="mx-auto max-w-6xl px-4 text-sm text-steel-500 lg:px-6">
          Pier2Pier (J3K) · โครงงานรายวิชา Cloud Computing · คณะเทคโนโลยีสารสนเทศ สจล.
        </div>
      </footer>
    </div>
  );
}
