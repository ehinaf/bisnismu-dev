import { create } from "zustand";
import { lineSubtotal } from "@/lib/pos-pricing";
import { newClientRef } from "@/lib/utils";
import { addCartLine, setCartLineQuantity, type CartItem, type NewCartLine } from "@/lib/cart-lines";

export type { CartItem } from "@/lib/cart-lines";

export interface PosCustomer {
  id: string;
  name: string;
}

export interface PosTable {
  id: string;
  name: string;
}

export interface PosPayment {
  key: string;
  payment_channel_id: string;
  name: string;
  channel_type: string;
  amount: number;
  is_receivable?: boolean;
}

interface CartState {
  items: CartItem[];
  customer: PosCustomer | null;
  table: PosTable | null;
  orderNotes: string;
  voucherCode: string | null;
  payments: PosPayment[];
  // Idempotency key (client_ref) percobaan simpan saat ini, per jenis aksi.
  clientRefs: Partial<Record<ClientRefKind, string>>;

  addLine: (line: NewCartLine) => void;
  removeItem: (line_key: string) => void;
  updateQuantity: (line_key: string, quantity: number) => void;
  clear: () => void;

  setCustomer: (customer: PosCustomer | null) => void;
  setTable: (table: PosTable | null) => void;
  setOrderNotes: (notes: string) => void;
  setVoucherCode: (code: string | null) => void;

  addPayment: (channel: { id: string; name: string; channel_type: string }, amount?: number) => void;
  updatePaymentAmount: (key: string, amount: number) => void;
  removePayment: (key: string) => void;
  addKasbon: (channel: { id: string; name: string; channel_type: string }, amount: number) => void;

  // Dibuat sekali lalu dipakai ulang untuk setiap retry (koneksi putus, tombol
  // ditekan lagi) sampai keranjang dikosongkan setelah sukses — server
  // mengembalikan transaksi yang sama untuk client_ref yang sama, jadi retry
  // tidak pernah membuat transaksi ganda.
  ensureClientRef: (kind: ClientRefKind) => string;

  clearAll: () => void;
}

export type ClientRefKind = "sale" | "hold";

let paymentKeySeq = 0;
function nextPaymentKey(): string {
  paymentKeySeq += 1;
  return `pay-${paymentKeySeq}`;
}

export const useCartStore = create<CartState>((set, get) => ({
  items: [],
  customer: null,
  table: null,
  orderNotes: "",
  voucherCode: null,
  payments: [],
  clientRefs: {},

  addLine: (line) => set((state) => ({ items: addCartLine(state.items, line) })),

  removeItem: (line_key) => set((state) => ({ items: setCartLineQuantity(state.items, line_key, 0) })),

  updateQuantity: (line_key, quantity) => set((state) => ({ items: setCartLineQuantity(state.items, line_key, quantity) })),

  clear: () => set({ items: [] }),

  setCustomer: (customer) => set({ customer }),
  setTable: (table) => set({ table }),
  setOrderNotes: (orderNotes) => set({ orderNotes }),
  setVoucherCode: (voucherCode) => set({ voucherCode }),

  addPayment: (channel, amount = 0) =>
    set((state) => ({
      payments: [
        ...state.payments,
        {
          key: nextPaymentKey(),
          payment_channel_id: channel.id,
          name: channel.name,
          channel_type: channel.channel_type,
          amount: Math.round(amount),
        },
      ],
    })),

  updatePaymentAmount: (key, amount) =>
    set((state) => ({
      payments: state.payments.map((p) => (p.key === key ? { ...p, amount: Math.max(0, Math.round(amount)) } : p)),
    })),

  removePayment: (key) => set((state) => ({ payments: state.payments.filter((p) => p.key !== key) })),

  // Kasbon bukan channel tersendiri di backend — ditandai lewat is_receivable
  // pada payment row yang memakai channel yang dipilih (biasanya Tunai).
  addKasbon: (channel, amount) =>
    set((state) => ({
      payments: [
        ...state.payments,
        {
          key: nextPaymentKey(),
          payment_channel_id: channel.id,
          name: "Kasbon / Piutang",
          channel_type: channel.channel_type,
          amount: Math.round(amount),
          is_receivable: true,
        },
      ],
    })),

  ensureClientRef: (kind) => {
    const existing = get().clientRefs[kind];
    if (existing) return existing;
    const ref = newClientRef();
    set((state) => ({ clientRefs: { ...state.clientRefs, [kind]: ref } }));
    return ref;
  },

  clearAll: () =>
    set({
      items: [],
      customer: null,
      table: null,
      orderNotes: "",
      voucherCode: null,
      payments: [],
      clientRefs: {},
    }),
}));

export function cartSubtotal(items: CartItem[]): number {
  return items.reduce((sum, i) => sum + lineSubtotal(i.unit_price, i.quantity), 0);
}
