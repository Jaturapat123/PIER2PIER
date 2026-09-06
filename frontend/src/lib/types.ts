export type Role = 'customer' | 'admin';

export type User = {
  id: number;
  username: string;
  full_name: string;
  email: string;
  phone: string | null;
  company_name: string | null;
  role: Role;
  status: 'active' | 'suspended';
  created_at: string;
  booking_count?: number;
};

export type ServiceType = 'import' | 'export' | 'transshipment' | 'storage';

export type Service = {
  id: number;
  code: string;
  name: string;
  service_type: ServiceType;
  origin_port: string;
  destination_port: string;
  transit_days: number;
  base_price: string;
  description: string | null;
  status: 'active' | 'inactive';
  open_schedules?: number;
  schedule_count?: number;
};

export type ScheduleStatus = 'open' | 'closing' | 'closed' | 'departed';

export type Schedule = {
  id: number;
  service_id: number;
  vessel_id: number;
  voyage_no: string;
  etd: string;
  eta: string;
  berth: string | null;
  cutoff_at: string;
  capacity_teu: number;
  booked_teu: number;
  available_teu: number;
  status: ScheduleStatus;
  vessel_name: string;
  imo_number: string;
  operator: string | null;
  service_code?: string;
  service_name?: string;
  service_type?: ServiceType;
  origin_port?: string;
  destination_port?: string;
  base_price?: string;
  booking_count?: number;
  utilization_pct?: number;
};

export type ContainerType = {
  id: number;
  code: string;
  name: string;
  size_ft: number;
  teu_factor: string;
  max_payload_kg: number;
  description: string | null;
  is_active: 0 | 1;
  usage_count?: number;
};

export type BookingStatus = 'pending' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled';
export type ShipmentStatus = 'created' | 'gate_in' | 'loaded' | 'departed' | 'delivered';

export type BookingItem = {
  id: number;
  container_type_id: number;
  qty: number;
  unit_price: string;
  container_code: string;
  container_name: string;
  size_ft: number;
  teu_factor: string;
};

export type Booking = {
  id: number;
  booking_no: string;
  user_id: number;
  schedule_id: number;
  service_id: number;
  cargo_type: string;
  cargo_weight_kg: number;
  pickup_location: string | null;
  notes: string | null;
  total_teu: string;
  total_price: string;
  status: BookingStatus;
  created_at: string;
  confirmed_at: string | null;
  service_code: string;
  service_name: string;
  service_type: ServiceType;
  origin_port: string;
  destination_port: string;
  voyage_no: string;
  etd: string;
  eta: string;
  berth: string | null;
  cutoff_at: string;
  vessel_name: string;
  imo_number: string;
  customer_name: string;
  customer_email: string;
  customer_company: string | null;
  shipment_order_no: string | null;
  shipment_status: ShipmentStatus | null;
  gate_in_at: string | null;
  loaded_at: string | null;
  departed_at: string | null;
  delivered_at: string | null;
  items?: BookingItem[];
};

export type StockItem = {
  id: number;
  sku: string;
  name: string;
  category: string | null;
  unit: string;
  warehouse_zone: string | null;
  qty_on_hand: number;
  reorder_level: number;
  is_active: 0 | 1;
  is_low?: 0 | 1;
};

export type StockTransaction = {
  id: number;
  stock_item_id: number;
  change_qty: number;
  type: 'in' | 'out' | 'adjust';
  reason: string | null;
  admin_id: number;
  admin_name: string;
  created_at: string;
};

export type HealthResponse = {
  status: 'ok' | 'degraded';
  instance: { hostname: string; instanceId: string; availabilityZone: string };
  version: { gitSha: string; imageTag: string };
  db: { ok: boolean; latencyMs?: number; error?: string };
  uptimeSec: number;
  checkedAt: string;
};

export type Paged<T> = { items: T[]; total: number; page: number; pageSize: number };
