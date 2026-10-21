// Baris keranjang (kasir & tambah pesanan meja). Satu item bisa muncul di
// beberapa baris bila pilihannya beda (varian, modifier, harga bebas, catatan);
// baris dengan pilihan identik digabung. Harga di sini hanya pratinjau —
// angka final selalu dari server (quote / simpan).

export interface CartItem {
  line_key: string;
  item_id: string;
  name: string;
  /** Ringkasan pilihan untuk ditampilkan, mis. "Besar · Pedas · Extra keju". */
  options_label: string | null;
  variant_id: string | null;
  modifier_ids: string[];
  /** Harga manual untuk item pricing_type='open'. */
  open_price: number | null;
  notes: string | null;
  unit_price: number;
  quantity: number;
}

export interface NewCartLine {
  item_id: string;
  name: string;
  unit_price: number;
  quantity?: number;
  variant_id?: string | null;
  variant_name?: string | null;
  modifier_ids?: string[];
  modifier_names?: string[];
  open_price?: number | null;
  notes?: string | null;
}

function lineKey(line: Pick<CartItem, "item_id" | "variant_id" | "modifier_ids" | "open_price" | "notes">): string {
  return [line.item_id, line.variant_id ?? "", [...line.modifier_ids].sort().join(","), line.open_price ?? "", line.notes ?? ""].join("|");
}

export function addCartLine(lines: CartItem[], line: NewCartLine): CartItem[] {
  const modifier_ids = line.modifier_ids ?? [];
  const notes = line.notes?.trim() || null;
  const candidate = {
    item_id: line.item_id,
    variant_id: line.variant_id ?? null,
    modifier_ids,
    open_price: line.open_price ?? null,
    notes,
  };
  const key = lineKey(candidate);
  const quantity = line.quantity ?? 1;

  if (lines.some((l) => l.line_key === key)) {
    return lines.map((l) => (l.line_key === key ? { ...l, quantity: l.quantity + quantity } : l));
  }
  const label = [line.variant_name, ...(line.modifier_names ?? []), notes].filter(Boolean).join(" · ");
  return [
    ...lines,
    { ...candidate, line_key: key, name: line.name, options_label: label || null, unit_price: line.unit_price, quantity },
  ];
}

export function setCartLineQuantity(lines: CartItem[], key: string, quantity: number): CartItem[] {
  if (quantity <= 0) return lines.filter((l) => l.line_key !== key);
  return lines.map((l) => (l.line_key === key ? { ...l, quantity } : l));
}

/** Bentuk baris untuk API (quote, simpan, hold, tambah pesanan) — harga dihitung server. */
export function toTransactionLine(line: CartItem) {
  return {
    item_id: line.item_id,
    quantity: line.quantity,
    ...(line.variant_id ? { variant_id: line.variant_id } : {}),
    ...(line.modifier_ids.length > 0 ? { modifier_ids: line.modifier_ids } : {}),
    ...(line.open_price !== null ? { unit_price: line.open_price } : {}),
    ...(line.notes ? { notes: line.notes } : {}),
  };
}
