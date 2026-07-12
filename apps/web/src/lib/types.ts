// Bentuk minimal respons API yang dipakai UI — tidak mencoba mencerminkan
// seluruh kolom tabel backend, hanya field yang benar-benar dirender/dipakai.

export interface CatalogItem {
  id: string;
  name: string;
  sku: string | null;
  base_price: string;
  image_url: string | null;
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

export interface TransactionItemDetail {
  id: string;
  item_name_snapshot: string;
  variant_name_snapshot: string | null;
  quantity: string;
  unit_price: string;
  subtotal: string;
}

export interface PaymentDetail {
  id: string;
  channel_name_snapshot: string;
  amount: string;
}

export interface TransactionDetail {
  id: string;
  transaction_number: string;
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
