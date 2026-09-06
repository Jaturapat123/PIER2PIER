import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import type { Paged, StockItem, StockTransaction } from '../../lib/types';
import { Button, EmptyState, ErrorNotice, Field, Input, Loading, Select } from '../../components/ui';
import Modal from '../../components/Modal';
import PageHeader from '../../components/PageHeader';
import { dateTime, num } from '../../lib/format';

const EMPTY = { sku: '', name: '', category: '', unit: 'ชิ้น', warehouse_zone: '', reorder_level: '0', is_active: 'true' };

/** UC-14 Manage Stock */
export default function AdminStock() {
  const [items, setItems] = useState<StockItem[]>([]);
  const [zones, setZones] = useState<string[]>([]);
  const [q, setQ] = useState('');
  const [lowOnly, setLowOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [editing, setEditing] = useState<StockItem | 'new' | null>(null);
  const [adjusting, setAdjusting] = useState<StockItem | null>(null);
  const [history, setHistory] = useState<StockTransaction[]>([]);
  const [form, setForm] = useState<Record<string, string>>(EMPTY);
  const [adjustForm, setAdjustForm] = useState({ type: 'in', qty: '', reason: '' });
  const [formError, setFormError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setError('');
    const params = new URLSearchParams({ pageSize: '100' });
    if (q) params.set('q', q);
    if (lowOnly) params.set('lowOnly', 'true');

    api
      .get<Paged<StockItem> & { zones: string[] }>(`/api/admin/stock?${params}`)
      .then((r) => {
        setItems(r.items);
        setZones(r.zones);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [q, lowOnly]);

  useEffect(load, [load]);

  const openNew = () => {
    setForm(EMPTY);
    setFormError('');
    setFieldErrors({});
    setEditing('new');
  };

  const openEdit = (s: StockItem) => {
    setForm({
      sku: s.sku,
      name: s.name,
      category: s.category ?? '',
      unit: s.unit,
      warehouse_zone: s.warehouse_zone ?? '',
      reorder_level: String(s.reorder_level),
      is_active: s.is_active ? 'true' : 'false',
    });
    setFormError('');
    setFieldErrors({});
    setEditing(s);
  };

  const openAdjust = async (s: StockItem) => {
    setAdjustForm({ type: 'in', qty: '', reason: '' });
    setFormError('');
    setAdjusting(s);
    try {
      const r = await api.get<{ items: StockTransaction[] }>(`/api/admin/stock/${s.id}/transactions`);
      setHistory(r.items);
    } catch {
      setHistory([]);
    }
  };

  const save = async () => {
    setFormError('');
    setFieldErrors({});
    setBusy(true);
    try {
      if (editing === 'new') await api.post('/api/admin/stock', form);
      else if (editing) await api.put(`/api/admin/stock/${editing.id}`, form);
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

  const adjust = async () => {
    if (!adjusting) return;
    setFormError('');
    setBusy(true);
    try {
      await api.post(`/api/admin/stock/${adjusting.id}/adjust`, {
        type: adjustForm.type,
        qty: Number(adjustForm.qty),
        reason: adjustForm.reason,
      });
      setAdjusting(null);
      load();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'ปรับสต็อกไม่สำเร็จ');
    } finally {
      setBusy(false);
    }
  };

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const lowCount = items.filter((i) => i.qty_on_hand <= i.reorder_level).length;

  return (
    <>
      <PageHeader
        title="สินค้าคงคลัง"
        description="จัดการวัสดุและอุปกรณ์ในคลังของท่าเรือ พร้อมบันทึกประวัติการเคลื่อนไหวทุกครั้ง"
        actions={<Button onClick={openNew}>เพิ่มสินค้า</Button>}
      />

      {lowCount > 0 && !lowOnly && (
        <div className="mb-4 flex items-start gap-3 rounded-md border border-amber-200 bg-amber-50 px-4 py-3">
          <AlertTriangle size={18} className="mt-0.5 shrink-0 text-amber-700" aria-hidden />
          <div className="flex-1">
            <p className="text-amber-900">
              มีสินค้า <span className="tabular">{lowCount}</span> รายการที่คงเหลือต่ำกว่าหรือเท่ากับจุดสั่งซื้อ
            </p>
            <button
              onClick={() => setLowOnly(true)}
              className="mt-1 font-medium text-amber-900 underline underline-offset-2"
            >
              ดูเฉพาะรายการที่ใกล้หมด
            </button>
          </div>
        </div>
      )}

      <div className="panel mb-4 flex flex-wrap items-center gap-3 p-4">
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="ค้นหาจากชื่อสินค้า รหัส SKU หรือหมวดหมู่"
          aria-label="ค้นหาสินค้า"
          className="min-w-[240px] flex-1"
        />
        <label className="flex min-h-[44px] cursor-pointer items-center gap-2.5 px-1 text-steel-600">
          <input
            type="checkbox"
            checked={lowOnly}
            onChange={(e) => setLowOnly(e.target.checked)}
            className="h-4 w-4 rounded border-steel-300 text-sea focus:ring-sea"
          />
          เฉพาะที่ต่ำกว่าจุดสั่งซื้อ
        </label>
      </div>

      {loading ? (
        <Loading />
      ) : error ? (
        <ErrorNotice message={error} onRetry={load} />
      ) : items.length === 0 ? (
        <div className="panel">
          <EmptyState
            title={lowOnly ? 'ไม่มีสินค้าที่ต่ำกว่าจุดสั่งซื้อ' : 'ยังไม่มีสินค้าในคลัง'}
            description={lowOnly ? 'ระดับสต็อกทุกรายการอยู่ในเกณฑ์ปกติ' : 'เพิ่มสินค้าเพื่อเริ่มติดตามจำนวนคงเหลือ'}
            action={lowOnly ? <Button variant="secondary" onClick={() => setLowOnly(false)}>ดูทั้งหมด</Button> : <Button onClick={openNew}>เพิ่มสินค้า</Button>}
          />
        </div>
      ) : (
        <div className="panel overflow-x-auto">
          <table className="w-full min-w-[900px] border-collapse">
            <thead>
              <tr className="table-head">
                <th className="px-4 py-2.5">สินค้า</th>
                <th className="px-4 py-2.5">หมวดหมู่</th>
                <th className="px-4 py-2.5">โซนจัดเก็บ</th>
                <th className="px-4 py-2.5 text-right">คงเหลือ</th>
                <th className="px-4 py-2.5 text-right">จุดสั่งซื้อ</th>
                <th className="px-4 py-2.5 text-right">จัดการ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-steel-200">
              {items.map((s) => {
                const low = s.qty_on_hand <= s.reorder_level;
                return (
                  <tr key={s.id} className={low ? 'bg-amber-50/60' : 'hover:bg-steel-50'}>
                    <td className="px-4 py-2.5">
                      <p className="tabular text-sm text-steel-500">{s.sku}</p>
                      <p className="text-steel-700">{s.name}</p>
                    </td>
                    <td className="px-4 py-2.5 text-sm text-steel-600">{s.category ?? '—'}</td>
                    <td className="tabular px-4 py-2.5 text-sm text-steel-600">{s.warehouse_zone ?? '—'}</td>
                    <td className="px-4 py-2.5 text-right">
                      <span className={`tabular ${low ? 'font-medium text-amber-800' : 'text-steel-700'}`}>
                        {num(s.qty_on_hand)} {s.unit}
                      </span>
                      {low && <p className="text-sm text-amber-800">ต่ำกว่าจุดสั่งซื้อ</p>}
                    </td>
                    <td className="tabular px-4 py-2.5 text-right text-steel-600">{num(s.reorder_level)}</td>
                    <td className="px-4 py-2.5 text-right">
                      <Button variant="ghost" size="sm" onClick={() => openAdjust(s)}>
                        ปรับสต็อก
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => openEdit(s)}>
                        แก้ไข
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        open={editing !== null}
        title={editing === 'new' ? 'เพิ่มสินค้า' : 'แก้ไขข้อมูลสินค้า'}
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
            <Field label="รหัสสินค้า (SKU)" htmlFor="st-sku" required error={fieldErrors.sku}>
              <Input id="st-sku" value={form.sku} onChange={set('sku')} placeholder="SKU-PLT-001" />
            </Field>
            <Field label="หน่วยนับ" htmlFor="st-unit" required error={fieldErrors.unit}>
              <Input id="st-unit" value={form.unit} onChange={set('unit')} placeholder="ชิ้น" />
            </Field>
          </div>

          <Field label="ชื่อสินค้า" htmlFor="st-name" required error={fieldErrors.name}>
            <Input id="st-name" value={form.name} onChange={set('name')} />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="หมวดหมู่" htmlFor="st-cat">
              <Input id="st-cat" value={form.category} onChange={set('category')} list="stock-categories" />
            </Field>
            <Field label="โซนจัดเก็บ" htmlFor="st-zone" hint="เช่น Zone A, Zone B">
              <Input id="st-zone" value={form.warehouse_zone} onChange={set('warehouse_zone')} list="stock-zones" />
              <datalist id="stock-zones">
                {zones.map((z) => (
                  <option key={z} value={z} />
                ))}
              </datalist>
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="จุดสั่งซื้อ"
              htmlFor="st-reorder"
              hint="ระบบจะเตือนเมื่อคงเหลือถึงระดับนี้"
              error={fieldErrors.reorder_level}
            >
              <Input
                id="st-reorder"
                type="number"
                min={0}
                value={form.reorder_level}
                onChange={set('reorder_level')}
              />
            </Field>
            <Field label="สถานะ" htmlFor="st-active" required>
              <Select id="st-active" value={form.is_active} onChange={set('is_active')}>
                <option value="true">เปิดใช้งาน</option>
                <option value="false">ปิดใช้งาน</option>
              </Select>
            </Field>
          </div>

          {editing === 'new' && (
            <p className="rounded-md bg-steel-50 px-4 py-3 text-sm text-steel-600">
              สินค้าใหม่จะเริ่มต้นที่จำนวนคงเหลือ 0 — ใช้ปุ่ม &ldquo;ปรับสต็อก&rdquo; เพื่อรับสินค้าเข้าคลัง
              ระบบจะบันทึกประวัติการเคลื่อนไหวให้อัตโนมัติ
            </p>
          )}
        </div>
      </Modal>

      <Modal
        open={adjusting !== null}
        title={`ปรับสต็อก · ${adjusting?.name ?? ''}`}
        onClose={() => setAdjusting(null)}
        wide
        footer={
          <>
            <Button variant="secondary" onClick={() => setAdjusting(null)}>
              ยกเลิก
            </Button>
            <Button onClick={adjust} loading={busy} disabled={!adjustForm.qty}>
              บันทึกการปรับสต็อก
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {formError && <ErrorNotice message={formError} />}

          <p className="text-steel-600">
            คงเหลือปัจจุบัน{' '}
            <span className="tabular font-medium text-ink">
              {num(adjusting?.qty_on_hand ?? 0)} {adjusting?.unit}
            </span>
          </p>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="ประเภทการปรับ" htmlFor="ad-type" required>
              <Select
                id="ad-type"
                value={adjustForm.type}
                onChange={(e) => setAdjustForm((f) => ({ ...f, type: e.target.value }))}
              >
                <option value="in">รับเข้า (เพิ่มจำนวน)</option>
                <option value="out">ตัดออก (ลดจำนวน)</option>
                <option value="adjust">ปรับยอดตามการตรวจนับ</option>
              </Select>
            </Field>

            <Field
              label="จำนวน"
              htmlFor="ad-qty"
              required
              hint={adjustForm.type === 'adjust' ? 'ใส่ค่าติดลบได้ เช่น -5' : undefined}
            >
              <Input
                id="ad-qty"
                type="number"
                value={adjustForm.qty}
                onChange={(e) => setAdjustForm((f) => ({ ...f, qty: e.target.value }))}
              />
            </Field>
          </div>

          <Field label="เหตุผล" htmlFor="ad-reason" hint="บันทึกไว้ในประวัติเพื่อให้ตรวจสอบย้อนหลังได้">
            <Input
              id="ad-reason"
              value={adjustForm.reason}
              onChange={(e) => setAdjustForm((f) => ({ ...f, reason: e.target.value }))}
              placeholder="เช่น รับเข้าจากผู้ขาย / เบิกใช้งานหน้าท่า"
            />
          </Field>

          <div>
            <h3 className="mb-2 font-medium text-ink">ประวัติการเคลื่อนไหว</h3>
            {history.length === 0 ? (
              <p className="rounded-md bg-steel-50 px-4 py-6 text-center text-sm text-steel-500">
                ยังไม่มีประวัติการเคลื่อนไหวของสินค้ารายการนี้
              </p>
            ) : (
              <div className="max-h-56 overflow-y-auto rounded-md border border-steel-200">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="table-head">
                      <th className="px-3 py-2">เวลา</th>
                      <th className="px-3 py-2 text-right">เปลี่ยนแปลง</th>
                      <th className="px-3 py-2">เหตุผล</th>
                      <th className="px-3 py-2">ผู้ดำเนินการ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-steel-200">
                    {history.map((t) => (
                      <tr key={t.id}>
                        <td className="px-3 py-2 text-sm text-steel-600">{dateTime(t.created_at)}</td>
                        <td
                          className={`tabular px-3 py-2 text-right text-sm ${
                            t.change_qty > 0 ? 'text-green-700' : 'text-red-700'
                          }`}
                        >
                          {t.change_qty > 0 ? '+' : ''}
                          {num(t.change_qty)}
                        </td>
                        <td className="px-3 py-2 text-sm text-steel-600">{t.reason ?? '—'}</td>
                        <td className="px-3 py-2 text-sm text-steel-600">{t.admin_name}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </Modal>

      <datalist id="stock-categories">
        {[...new Set(items.map((i) => i.category).filter(Boolean))].map((c) => (
          <option key={c} value={c!} />
        ))}
      </datalist>
    </>
  );
}
