import type { BadgeProps } from "@/components/ui/badge";
import type { InventoryRow, StockMovementType } from "@/lib/types";

// Jumlah stok (NUMERIC 14,3) untuk tampilan: "1.250,5" — bukan uang.
const quantityFormat = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 3 });

export function formatQuantity(value: string | number): string {
  return quantityFormat.format(typeof value === "string" ? Number(value) : value);
}

export type StockStatus = "out" | "low" | "ok";

/** Sama dengan GET /inventory/low-stock: stok ≤ batas minimum dianggap menipis. */
export function stockStatus(row: Pick<InventoryRow, "quantity_on_hand" | "reorder_level">): StockStatus {
  const qty = Number(row.quantity_on_hand);
  if (qty <= 0) return "out";
  if (qty <= Number(row.reorder_level)) return "low";
  return "ok";
}

export const STOCK_STATUS: Record<StockStatus, { label: string; variant: BadgeProps["variant"] }> = {
  out: { label: "Habis", variant: "danger" },
  low: { label: "Menipis", variant: "warning" },
  ok: { label: "Aman", variant: "success" },
};

export const MOVEMENT_LABELS: Record<StockMovementType, string> = {
  purchase_in: "Pembelian",
  sale_out: "Terjual",
  recipe_out: "Dipakai resep",
  adjustment: "Penyesuaian",
  return_in: "Kembali (batal/refund)",
  return_out: "Retur ke pemasok",
  transfer_in: "Transfer masuk",
  transfer_out: "Transfer keluar",
  waste: "Rusak/terbuang",
  production_in: "Produksi",
};

/** Angka stok dari input pengguna: koma atau titik sebagai desimal ("2,5" = "2.5"). NaN bila tidak valid. */
export function parseQuantity(text: string): number {
  const cleaned = text.trim().replace(",", ".");
  if (!/^\d+(\.\d{1,3})?$/.test(cleaned)) return Number.NaN;
  return Number(cleaned);
}
