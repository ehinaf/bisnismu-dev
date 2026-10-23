"use client";

import { create } from "zustand";
import { apiClient } from "@/lib/api-client";
import type { BusinessSettings } from "@/lib/types";

interface SettingsState {
  settings: BusinessSettings | null;
  load: () => Promise<void>;
  setSettings: (settings: BusinessSettings) => void;
}

// Feature flags & pengaturan usaha — dimuat sekali di layout aplikasi; halaman
// Pengaturan memanggil setSettings setelah menyimpan supaya sidebar langsung ikut.
export const useSettingsStore = create<SettingsState>((set) => ({
  settings: null,
  load: async () => {
    try {
      set({ settings: await apiClient.get<BusinessSettings>("/tenant/settings") });
    } catch {
      // Tanpa settings, menu memakai default aman (fitur opsional disembunyikan).
    }
  },
  setSettings: (settings) => set({ settings }),
}));

export function useBusinessSettings(): BusinessSettings | null {
  return useSettingsStore((s) => s.settings);
}
