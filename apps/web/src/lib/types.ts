// Bentuk minimal respons API yang dipakai UI — tidak mencoba mencerminkan
// seluruh kolom tabel backend, hanya field yang benar-benar dirender/dipakai.

export interface CatalogItem {
  id: string;
  name: string;
  sku: string | null;
  base_price: string;
  image_url: string | null;
}

export interface Outlet {
  id: string;
  name: string;
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
