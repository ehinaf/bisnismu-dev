// Kontrak JSON API BisnisMu (respons & payload). Angka uang/qty dikirim sebagai
// string Decimal (serialisasi Prisma.Decimal) — jangan dihitung sebagai float.
// Dipakai apps/web; nanti juga SDK/aplikasi lain. Hanya tipe, tanpa kode runtime.

// Bentuk minimal respons API yang dipakai UI — tidak mencoba mencerminkan
// seluruh kolom tabel backend, hanya field yang benar-benar dirender/dipakai.

export interface CatalogItem {
  id: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  category_id: string | null;
  base_price: string;
  image_url: string | null;
  pricing_type: PricingType;
  // >0 → kasir harus memilih opsi lewat pemilih item sebelum masuk keranjang.
  variant_count: number;
  modifier_group_count: number;
}

// GET /catalog/items/:id/pos-options — pilihan untuk pemilih item di kasir.
export interface PosItemOptions {
  id: string;
  name: string;
  base_price: string;
  pricing_type: PricingType;
  variants: Array<{ id: string; name: string; price_adjustment: string }>;
  modifier_groups: Array<{
    id: string;
    name: string;
    selection_type: "single" | "multiple";
    is_required: boolean;
    min_select: number;
    max_select: number;
    modifiers: Array<{ id: string; name: string; price_adjustment: string }>;
  }>;
}

export type TaxKind = "tax" | "service_charge";

export interface Tax {
  id: string;
  name: string;
  rate: string;
  tax_kind: TaxKind;
}

export type RoundingMode =
  | "none"
  | "nearest_100"
  | "up_100"
  | "nearest_500"
  | "up_500"
  | "nearest_1000";

export interface BusinessSettings {
  default_tax_id: string | null;
  rounding: RoundingMode;
  enable_kasbon: boolean;
}

export type ItemType = "product" | "service" | "bundle" | "ingredient";
export type PricingType = "fixed" | "per_unit" | "per_duration" | "tiered" | "open";

export interface ItemDetail {
  id: string;
  name: string;
  category_id: string | null;
  unit_id: string | null;
  sku: string | null;
  barcode: string | null;
  description: string | null;
  item_type: ItemType;
  pricing_type: PricingType;
  base_price: string;
  cost_price: string;
  track_stock: boolean;
  use_recipe: boolean;
  image_url: string | null;
  is_active: boolean;
}

export interface Category {
  id: string;
  name: string;
  parent_id: string | null;
  sort_order: number;
}

export interface Unit {
  id: string;
  name: string;
  symbol: string;
  allow_decimal: boolean;
}

export interface Outlet {
  id: string;
  name: string;
}

export type TableStatus = "available" | "occupied" | "reserved" | "inactive";

export interface DiningTable {
  id: string;
  outlet_id: string;
  name: string;
  area: string | null;
  capacity: number | null;
  status: TableStatus;
}

export interface OpenBillTransaction {
  id: string;
  transaction_number: string;
  dining_table_id: string | null;
  status: string;
  guest_count: number | null;
  subtotal: string;
  total: string;
  items: TransactionItemDetail[];
}

export interface PaymentChannel {
  id: string;
  name: string;
  channel_type: string;
}

// Hasil POST /transactions/quote & /transactions/:id/quote — angka final dari
// server (diskon otomatis, voucher, pajak, pembulatan) sebelum pembayaran.
export interface CheckoutQuote {
  subtotal: string;
  discount_total: string;
  discounts: { name: string; amount: string }[];
  voucher: { code: string; amount: string } | null;
  tax_total: string;
  service_charge_total: string;
  delivery_fee: string;
  rounding_adjustment: string;
  total: string;
}

export interface TransactionItemDetail {
  id: string;
  item_name_snapshot: string;
  variant_name_snapshot: string | null;
  modifiers: Array<{ modifier_name_snapshot: string }>;
  quantity: string;
  unit_price: string;
  subtotal: string;
}

export interface PaymentDetail {
  id: string;
  channel_name_snapshot: string;
  amount: string;
}

export type TransactionStatus = "open" | "pending" | "completed" | "void" | "refunded" | "partially_refunded";

export type TransactionType = "sale" | "refund";

export interface TransactionDetail {
  id: string;
  transaction_number: string;
  receipt_token: string;
  transaction_type: TransactionType;
  status: TransactionStatus;
  void_reason: string | null;
  notes: string | null;
  // Struk refund → penjualan asli; penjualan asli → daftar refund-nya.
  reference_transaction: { id: string; transaction_number: string } | null;
  refund_transactions: Array<{ id: string; transaction_number: string; total: string; created_at: string }>;
  subtotal: string;
  tax_total: string;
  service_charge_total: string;
  rounding_adjustment: string;
  total: string;
  amount_paid: string;
  change_due: string;
  created_at: string;
  items: TransactionItemDetail[];
  payments: PaymentDetail[];
}

// Baris GET /transactions (halaman Riwayat) — penjualan & refund (total negatif).
export interface TransactionHistoryRow {
  id: string;
  transaction_number: string;
  transaction_type: TransactionType;
  status: TransactionStatus;
  reference_transaction: { transaction_number: string } | null;
  total: string;
  created_at: string;
  void_reason: string | null;
  customer: { name: string | null } | null;
  payments: Array<{ channel_name_snapshot: string; amount: string; is_receivable: boolean }>;
}

export interface DailySalesRow {
  sales_date: string;
  transaction_count: number;
  gross_sales: string;
  total_discounts: string;
  total_taxes: string;
  gross_profit: string;
}

export interface TopItemRow {
  item_id: string | null;
  item_name: string;
  total_qty: string;
  total_revenue: string;
}

export interface PaymentMethodRow {
  channel_name: string;
  transaction_count: number;
  total_amount: string;
}

export interface ProfitLossSummary {
  transaction_count: number;
  gross_sales: string;
  total_discounts: string;
  total_taxes: string;
  gross_profit: string;
  total_expenses: string;
  net_profit: string;
}

export interface Customer {
  id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  birthday: string | null;
  loyalty_points: number;
  total_spent: string;
  visit_count: number;
  credit_limit: string;
  notes: string | null;
}

export type CashFlowType = "cash_in" | "cash_out";

export interface CashDrawerMovement {
  id: string;
  flow_type: CashFlowType;
  amount: string;
  reason: string;
  created_at: string;
}

export interface CashDrawerSession {
  id: string;
  outlet_id: string;
  status: "open" | "closed";
  opening_balance: string;
  closing_balance: string | null;
  expected_balance: string | null;
  opened_at: string;
  closed_at: string | null;
  notes: string | null;
  movements?: CashDrawerMovement[];
}

export type ReceivableStatus = "outstanding" | "partially_paid" | "paid" | "written_off";

export interface ReceivablePayment {
  id: string;
  amount: string;
  payment_method: string;
  paid_at: string;
  notes: string | null;
}

export interface CustomerReceivable {
  id: string;
  transaction_id: string | null;
  amount: string;
  amount_paid: string;
  status: ReceivableStatus;
  due_date: string | null;
  created_at: string;
  payments: ReceivablePayment[];
}

// GET /transactions/:id/refundable — baris yang masih bisa di-refund.
export interface RefundableLine {
  transaction_item_id: string;
  item_name: string;
  quantity: string;
  refunded_quantity: string;
  remaining_quantity: string;
  unit_price: string;
  restockable: boolean;
}

// POST /transactions/:id/refund/quote — angka refund dari server.
export interface RefundQuote {
  amount: string;
  receivable_reduction: string;
  paid_out: string;
  is_final: boolean;
}

// GET /tenant/users — halaman Pengaturan (izin pengguna).
export interface BusinessUser {
  id: string;
  name: string;
  email: string | null;
  role: "owner" | "admin" | "manager" | "cashier" | "staff";
  is_active: boolean;
  permissions: string[];
}

// GET /public/receipts/:token — struk publik (tanpa data pelanggan/kasir).
export interface PublicReceipt {
  business_name: string;
  receipt_header: string | null;
  receipt_footer: string | null;
  outlet: { name: string; address: string | null; phone: string | null };
  transaction_number: string;
  transaction_type: TransactionType;
  status: TransactionStatus;
  date: string;
  reference_number: string | null;
  items: Array<{
    name: string;
    variant: string | null;
    modifiers: string[];
    quantity: string;
    unit_price: string;
    subtotal: string;
  }>;
  subtotal: string;
  discount_total: string;
  tax_total: string;
  service_charge_total: string;
  delivery_fee: string;
  rounding_adjustment: string;
  total: string;
  change_due: string;
  payments: Array<{ method: string; amount: string }>;
}
