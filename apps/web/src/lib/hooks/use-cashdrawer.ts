"use client";

import { useEffect } from "react";
import { create } from "zustand";
import { apiClient } from "@/lib/api-client";
import { useOutletStore } from "@/lib/stores/outlet-store";
import type { CashDrawerSession, CashFlowType } from "@/lib/types";

const POLL_INTERVAL_MS = 60_000;

interface CashdrawerState {
  session: CashDrawerSession | null;
  loading: boolean;
  outletId: string | null;
  refresh: (outletId: string) => Promise<void>;
  openDrawer: (outletId: string, openingBalance: number) => Promise<void>;
  closeDrawer: (closingBalance: number, notes?: string) => Promise<void>;
  addMovement: (flowType: CashFlowType, amount: number, reason: string) => Promise<void>;
}

export const useCashdrawerStore = create<CashdrawerState>((set, get) => ({
  session: null,
  loading: false,
  outletId: null,

  refresh: async (outletId) => {
    set({ loading: true, outletId });
    try {
      const session = await apiClient.get<CashDrawerSession | null>(
        `/cashdrawer/current?outlet_id=${outletId}`,
      );
      // Abaikan respons usang bila outlet aktif sudah berganti.
      if (get().outletId === outletId) set({ session, loading: false });
    } catch {
      if (get().outletId === outletId) set({ session: null, loading: false });
    }
  },

  openDrawer: async (outletId, openingBalance) => {
    await apiClient.post("/cashdrawer/open", { outlet_id: outletId, opening_balance: openingBalance });
    await get().refresh(outletId);
  },

  closeDrawer: async (closingBalance, notes) => {
    const { session, outletId } = get();
    if (!session) return;
    await apiClient.post(`/cashdrawer/${session.id}/close`, {
      closing_balance: closingBalance,
      ...(notes ? { notes } : {}),
    });
    if (outletId) await get().refresh(outletId);
  },

  addMovement: async (flowType, amount, reason) => {
    const { session, outletId } = get();
    if (!session) return;
    await apiClient.post(`/cashdrawer/${session.id}/movements`, {
      flow_type: flowType,
      amount,
      reason,
    });
    if (outletId) await get().refresh(outletId);
  },
}));

// Satu interval polling dibagi semua konsumen hook (sidebar, topbar, POS, halaman Kas & Laci).
let pollTimer: ReturnType<typeof setInterval> | null = null;
let subscriberCount = 0;

export function useCashdrawer() {
  const activeOutletId = useOutletStore((s) => s.activeOutletId);
  const session = useCashdrawerStore((s) => s.session);
  const loading = useCashdrawerStore((s) => s.loading);
  const refresh = useCashdrawerStore((s) => s.refresh);
  const openDrawer = useCashdrawerStore((s) => s.openDrawer);
  const closeDrawer = useCashdrawerStore((s) => s.closeDrawer);
  const addMovement = useCashdrawerStore((s) => s.addMovement);

  useEffect(() => {
    if (!activeOutletId) return;
    subscriberCount += 1;
    if (useCashdrawerStore.getState().outletId !== activeOutletId) {
      void refresh(activeOutletId);
    }
    if (!pollTimer) {
      pollTimer = setInterval(() => {
        const outletId = useOutletStore.getState().activeOutletId;
        if (outletId) void useCashdrawerStore.getState().refresh(outletId);
      }, POLL_INTERVAL_MS);
    }
    return () => {
      subscriberCount -= 1;
      if (subscriberCount === 0 && pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
      }
    };
  }, [activeOutletId, refresh]);

  return { session, loading, openDrawer, closeDrawer, addMovement, refresh };
}
