"use client";

import { useCallback, useEffect } from "react";
import { create } from "zustand";
import { apiClient } from "@/lib/api-client";
import { useOutletStore } from "@/lib/stores/outlet-store";
import type { OpenBillTransaction } from "@/lib/types";

interface OpenOrdersState {
  count: number;
  setCount: (count: number) => void;
}

const useOpenOrdersStore = create<OpenOrdersState>((set) => ({
  count: 0,
  setCount: (count) => set({ count }),
}));

// Badge jumlah open bill di menu "Meja / Order". refresh() dipanggil setelah
// hold order / tutup bill supaya angkanya langsung menyesuaikan.
export function useOpenOrdersCount() {
  const activeOutletId = useOutletStore((s) => s.activeOutletId);
  const count = useOpenOrdersStore((s) => s.count);
  const setCount = useOpenOrdersStore((s) => s.setCount);

  const refresh = useCallback(async () => {
    if (!activeOutletId) return;
    try {
      const bills = await apiClient.get<OpenBillTransaction[]>(`/transactions/open?outlet_id=${activeOutletId}`);
      setCount(bills.length);
    } catch {
      // Badge bukan data kritis; biarkan angka lama bila gagal.
    }
  }, [activeOutletId, setCount]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { count, refresh };
}
