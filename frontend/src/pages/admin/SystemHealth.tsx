import { useEffect, useRef, useState } from 'react';
import { api } from '../../lib/api';
import type { HealthResponse } from '../../lib/types';
import { StatCard } from '../../components/ui';
import PageHeader from '../../components/PageHeader';
import { num } from '../../lib/format';

/**
 * หน้าสำหรับเก็บหลักฐานการทดลอง Stage 3
 *
 * เรียก /health ทุก 2 วินาทีผ่าน Load Balancer แล้วบันทึกว่าแต่ละครั้ง
 * เครื่องไหนเป็นคนตอบ ระหว่างนำเสนอให้ปิด EC2 เครื่องหนึ่ง — จะเห็นสัดส่วน
 * เปลี่ยนไปอยู่ที่อีกเครื่องทั้งหมดภายในเวลาไม่กี่วินาที และเห็นว่ามีคำขอ
 * ที่ล้มเหลวระหว่างสลับกี่ครั้ง (ซึ่งควรเป็นศูนย์ถ้า health check ตั้งถูก)
 */

const POLL_MS = 2000;
const HISTORY_LIMIT = 60;

type Sample = {
  at: number;
  ok: boolean;
  hostname: string;
  az: string;
  gitSha: string;
  latencyMs: number | null;
};

export default function SystemHealth() {
  const [samples, setSamples] = useState<Sample[]>([]);
  const [running, setRunning] = useState(true);
  const runningRef = useRef(running);
  runningRef.current = running;

  useEffect(() => {
    let alive = true;

    const poll = async () => {
      if (!runningRef.current) return;
      const started = Date.now();
      try {
        const res = await api.get<HealthResponse>('/health');
        if (!alive) return;
        setSamples((prev) =>
          [
            {
              at: started,
              ok: res.db.ok,
              hostname: res.instance.hostname,
              az: res.instance.availabilityZone,
              gitSha: res.version.gitSha,
              latencyMs: Date.now() - started,
            },
            ...prev,
          ].slice(0, HISTORY_LIMIT)
        );
      } catch {
        if (!alive) return;
        setSamples((prev) =>
          [
            { at: started, ok: false, hostname: '—', az: '—', gitSha: '—', latencyMs: null },
            ...prev,
          ].slice(0, HISTORY_LIMIT)
        );
      }
    };

    void poll();
    const timer = setInterval(poll, POLL_MS);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);

  // นับว่าแต่ละเครื่องรับ request ไปกี่ครั้ง — นี่คือหลักฐานว่า ALB กระจายจริง
  const byHost = samples.reduce<Record<string, { count: number; az: string; sha: string }>>((acc, s) => {
    if (!s.ok && s.hostname === '—') return acc;
    acc[s.hostname] = { count: (acc[s.hostname]?.count ?? 0) + 1, az: s.az, sha: s.gitSha };
    return acc;
  }, {});

  const failures = samples.filter((s) => !s.ok).length;
  const latencies = samples.filter((s) => s.latencyMs !== null).map((s) => s.latencyMs!);
  const avgLatency = latencies.length ? latencies.reduce((a, b) => a + b, 0) / latencies.length : 0;

  return (
    <>
      <PageHeader
        title="สถานะระบบ"
        description="ตรวจสอบว่า Load Balancer กระจายคำขอไปยังเซิร์ฟเวอร์เครื่องใดบ้าง และระบบยังให้บริการได้ต่อเนื่องหรือไม่"
        actions={
          <button
            onClick={() => setRunning((v) => !v)}
            className={`inline-flex min-h-[44px] items-center rounded-md px-4 font-medium transition-colors duration-150
              ${running ? 'border border-steel-300 bg-white text-steel-700 hover:bg-steel-50' : 'bg-hivis text-white hover:bg-amber-700'}`}
          >
            {running ? 'หยุดการตรวจสอบ' : 'เริ่มการตรวจสอบ'}
          </button>
        }
      />

      <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="จำนวนคำขอที่ตรวจ" value={num(samples.length)} sub={`ทุก ${POLL_MS / 1000} วินาที`} />
        <StatCard label="เซิร์ฟเวอร์ที่ตอบ" value={num(Object.keys(byHost).length)} sub="เครื่องที่ยังให้บริการอยู่" />
        <StatCard
          label="คำขอที่ล้มเหลว"
          value={num(failures)}
          sub={failures === 0 ? 'ไม่มีการหยุดให้บริการ' : 'ตรวจสอบสถานะเซิร์ฟเวอร์'}
          tone={failures > 0 ? 'warn' : 'default'}
        />
        <StatCard label="เวลาตอบสนองเฉลี่ย" value={`${num(avgLatency)} ms`} sub="วัดจากฝั่งเบราว์เซอร์" />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="panel p-5">
          <h2 className="mb-1 text-lg font-medium text-ink">สัดส่วนคำขอต่อเซิร์ฟเวอร์</h2>
          <p className="mb-4 text-sm text-steel-500">
            ถ้าปิดเซิร์ฟเวอร์เครื่องหนึ่ง สัดส่วนจะย้ายไปอยู่ที่เครื่องที่เหลือทั้งหมดภายในไม่กี่วินาที
          </p>

          {Object.keys(byHost).length === 0 ? (
            <p className="py-8 text-center text-steel-500">กำลังรอผลการตรวจสอบครั้งแรก</p>
          ) : (
            <ul className="space-y-4">
              {Object.entries(byHost).map(([host, info]) => {
                const pct = (info.count / samples.length) * 100;
                return (
                  <li key={host}>
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <p className="tabular text-steel-700">{host}</p>
                      <p className="text-sm text-steel-500">
                        <span className="tabular">{info.az}</span> · เวอร์ชัน{' '}
                        <span className="tabular">{info.sha}</span>
                      </p>
                    </div>
                    <div className="mt-1.5 h-2.5 w-full overflow-hidden rounded-full bg-steel-200">
                      <div className="h-full bg-sea transition-[width] duration-300" style={{ width: `${pct}%` }} />
                    </div>
                    <p className="mt-1 text-sm text-steel-500">
                      <span className="tabular">{info.count}</span> คำขอ ({num(pct, 1)}%)
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="panel overflow-hidden p-0">
          <h2 className="border-b border-steel-200 px-5 py-4 text-lg font-medium text-ink">
            บันทึกการตรวจสอบล่าสุด
          </h2>
          <div className="max-h-[420px] overflow-y-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="table-head">
                  <th className="px-4 py-2">เวลา</th>
                  <th className="px-4 py-2">เซิร์ฟเวอร์</th>
                  <th className="px-4 py-2">AZ</th>
                  <th className="px-4 py-2 text-right">หน่วงเวลา</th>
                  <th className="px-4 py-2">ผล</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-steel-200">
                {samples.map((s) => (
                  <tr key={s.at} className={s.ok ? '' : 'bg-red-50'}>
                    <td className="tabular px-4 py-2 text-sm text-steel-600">
                      {new Date(s.at).toLocaleTimeString('th-TH')}
                    </td>
                    <td className="tabular px-4 py-2 text-sm text-steel-700">{s.hostname}</td>
                    <td className="tabular px-4 py-2 text-sm text-steel-600">{s.az}</td>
                    <td className="tabular px-4 py-2 text-right text-sm text-steel-600">
                      {s.latencyMs !== null ? `${s.latencyMs} ms` : '—'}
                    </td>
                    <td className="px-4 py-2 text-sm">
                      <span className={s.ok ? 'text-green-700' : 'text-red-700'}>
                        {s.ok ? 'ปกติ' : 'ล้มเหลว'}
                      </span>
                    </td>
                  </tr>
                ))}
                {samples.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-10 text-center text-steel-500">
                      กำลังรอผลการตรวจสอบครั้งแรก
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </>
  );
}
