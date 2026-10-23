"use client";

import { useCallback, useEffect } from "react";
import { create } from "zustand";
import { apiClient } from "@/lib/api-client";
import { getUser } from "@/lib/auth";
import { useOutletStore } from "@/lib/stores/outlet-store";
import type { InventoryRow } from "@/lib/types";

interface LowStockState {
  count: number;
  setCount: (count: number) => void;
}

const useLowStockStore = create<LowStockState>((set) => ({
  count: 0,
  setCount: (count) => set({ count }),
}));

const MANAGEMENT_ROLES = ["owner", "admin", "manager"];

// Badge jumlah produk menipis/habis di menu "Stok" (hanya untuk yang bisa membuka
// halaman Stok). refresh() dipanggil halaman Stok setelah stok disesuaikan.
export function useLowStockCount() {
  const activeOutletId = useOutletStore((s) => s.activeOutletId);
  const count = useLowStockStore((s) => s.count);
  const setCount = useLowStockStore((s) => s.setCount);

  const refresh = useCallback(async () => {
    const role = getUser()?.role;
    if (!activeOutletId || !role || !MANAGEMENT_ROLES.includes(role)) return;
    try {
      const rows = await apiClient.get<InventoryRow[]>(`/inventory/low-stock?outlet_id=${activeOutletId}`);
      setCount(rows.length);
    } catch {
      // Badge bukan data kritis; biarkan angka lama bila gagal.
    }
  }, [activeOutletId, setCount]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { count, refresh };
}
