import { create } from "zustand";
import type { Outlet } from "@/lib/types";

const ACTIVE_OUTLET_KEY = "bisnismu-active-outlet";

interface OutletState {
  outlets: Outlet[];
  activeOutletId: string | null;
  loaded: boolean;
  setOutlets: (outlets: Outlet[]) => void;
  setActiveOutlet: (id: string) => void;
}

export const useOutletStore = create<OutletState>((set) => ({
  outlets: [],
  activeOutletId: null,
  loaded: false,

  // Pilihan tersimpan dipakai bila masih valid; kalau tidak, fallback ke outlet pertama.
  setOutlets: (outlets) =>
    set(() => {
      const saved = typeof window !== "undefined" ? localStorage.getItem(ACTIVE_OUTLET_KEY) : null;
      const active = outlets.find((o) => o.id === saved)?.id ?? outlets[0]?.id ?? null;
      return { outlets, activeOutletId: active, loaded: true };
    }),

  setActiveOutlet: (id) =>
    set(() => {
      if (typeof window !== "undefined") localStorage.setItem(ACTIVE_OUTLET_KEY, id);
      return { activeOutletId: id };
    }),
}));

export function useActiveOutlet(): Outlet | null {
  const outlets = useOutletStore((s) => s.outlets);
  const activeOutletId = useOutletStore((s) => s.activeOutletId);
  return outlets.find((o) => o.id === activeOutletId) ?? null;
}
