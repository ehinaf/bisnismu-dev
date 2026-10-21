import { create } from "zustand";

export type ToastVariant = "success" | "error" | "info";

export interface ToastItem {
  id: number;
  message: string;
  variant: ToastVariant;
}

interface ToastState {
  toasts: ToastItem[];
  show: (message: string, variant?: ToastVariant) => void;
  dismiss: (id: number) => void;
}

const MAX_VISIBLE = 3;
// Pesan singkat hilang sendiri; error diberi waktu baca sedikit lebih lama.
const DURATION_MS: Record<ToastVariant, number> = { success: 3500, info: 3500, error: 5000 };

let toastSeq = 0;

export const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],

  show: (message, variant = "info") => {
    toastSeq += 1;
    const id = toastSeq;
    // Pesan yang sama (mis. scan barcode tak dikenal berulang) menggantikan yang lama, tidak menumpuk.
    set((state) => ({
      toasts: [...state.toasts.filter((t) => t.message !== message), { id, message, variant }].slice(-MAX_VISIBLE),
    }));
    setTimeout(() => get().dismiss(id), DURATION_MS[variant]);
  },

  dismiss: (id) => set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),
}));

// Bisa dipanggil dari mana saja (event handler, setelah request API) tanpa hook.
export const toast = {
  success: (message: string) => useToastStore.getState().show(message, "success"),
  error: (message: string) => useToastStore.getState().show(message, "error"),
  info: (message: string) => useToastStore.getState().show(message, "info"),
};
