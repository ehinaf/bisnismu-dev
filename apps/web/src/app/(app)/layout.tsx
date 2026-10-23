"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getToken } from "@/lib/auth";
import { apiClient } from "@/lib/api-client";
import { useOutletStore } from "@/lib/stores/outlet-store";
import { useOpenOrdersCount } from "@/lib/hooks/use-open-orders-count";
import { useLowStockCount } from "@/lib/hooks/use-low-stock-count";
import { useSettingsStore } from "@/lib/stores/settings-store";
import { Sidebar } from "@/components/shell/sidebar";
import { Topbar } from "@/components/shell/topbar";
import { MobileSidebar } from "@/components/shell/mobile-sidebar";
import type { Outlet } from "@/lib/types";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const setOutlets = useOutletStore((s) => s.setOutlets);
  const loadSettings = useSettingsStore((s) => s.load);
  const { count: openOrdersCount } = useOpenOrdersCount();
  const { count: lowStockCount } = useLowStockCount();

  useEffect(() => {
    if (!getToken()) {
      router.replace("/login");
      return;
    }
    setReady(true);
    void loadSettings();
    apiClient
      .get<Outlet[]>("/tenant/outlets")
      .then(setOutlets)
      .catch(() => {
        // Gagal memuat outlet tidak boleh memblokir seluruh app; halaman yang
        // membutuhkannya menampilkan error masing-masing.
      });
  }, [router, setOutlets, loadSettings]);

  if (!ready) return null;

  return (
    <div className="min-h-screen lg:pl-[210px] print:pl-0">
      <Sidebar openOrdersCount={openOrdersCount} lowStockCount={lowStockCount} />
      <MobileSidebar
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        openOrdersCount={openOrdersCount}
        lowStockCount={lowStockCount}
      />
      <div className="flex min-h-screen flex-col">
        <Topbar onOpenMenu={() => setMenuOpen(true)} />
        <main className="flex flex-1 flex-col">{children}</main>
      </div>
    </div>
  );
}
