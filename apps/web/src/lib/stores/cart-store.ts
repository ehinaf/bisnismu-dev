import { create } from "zustand";

export interface CartItem {
  item_id: string;
  name: string;
  unit_price: number;
  quantity: number;
}

interface CartState {
  items: CartItem[];
  addItem: (item: { id: string; name: string; base_price: string | number }) => void;
  removeItem: (item_id: string) => void;
  updateQuantity: (item_id: string, quantity: number) => void;
  clear: () => void;
}

export const useCartStore = create<CartState>((set) => ({
  items: [],

  addItem: (item) =>
    set((state) => {
      const unitPrice = typeof item.base_price === "string" ? Number(item.base_price) : item.base_price;
      const existing = state.items.find((i) => i.item_id === item.id);
      if (existing) {
        return {
          items: state.items.map((i) => (i.item_id === item.id ? { ...i, quantity: i.quantity + 1 } : i)),
        };
      }
      return {
        items: [...state.items, { item_id: item.id, name: item.name, unit_price: unitPrice, quantity: 1 }],
      };
    }),

  removeItem: (item_id) => set((state) => ({ items: state.items.filter((i) => i.item_id !== item_id) })),

  updateQuantity: (item_id, quantity) =>
    set((state) => ({
      items:
        quantity <= 0
          ? state.items.filter((i) => i.item_id !== item_id)
          : state.items.map((i) => (i.item_id === item_id ? { ...i, quantity } : i)),
    })),

  clear: () => set({ items: [] }),
}));

export function cartSubtotal(items: CartItem[]): number {
  return items.reduce((sum, i) => sum + i.unit_price * i.quantity, 0);
}
