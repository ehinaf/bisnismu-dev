"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getToken } from "@/lib/auth";
import { apiClient } from "@/lib/api-client";
import { useOutletStore } from "@/lib/stores/outlet-store";
import { Sidebar } from "@/components/shell/sidebar";
import { Topbar } from "@/components/shell/topbar";
import { MobileSidebar } from "@/components/shell/mobile-sidebar";
import type { Outlet } from "@/lib/types";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const setOutlets = useOutletStore((s) => s.setOutlets);

  useEffect(() => {
    if (!getToken()) {
      router.replace("/login");
      return;
    }
    setReady(true);
    apiClient
      .get<Outlet[]>("/tenant/outlets")
      .then(setOutlets)
      .catch(() => {
        // Gagal memuat outlet tidak boleh memblokir seluruh app; halaman yang
        // membutuhkannya menampilkan error masing-masing.
      });
  }, [router, setOutlets]);

  if (!ready) return null;

  return (
    <div className="min-h-screen lg:pl-[210px]">
      <Sidebar />
      <MobileSidebar open={menuOpen} onClose={() => setMenuOpen(false)} />
      <div className="flex min-h-screen flex-col">
        <Topbar onOpenMenu={() => setMenuOpen(true)} />
        <main className="flex flex-1 flex-col">{children}</main>
      </div>
    </div>
  );
}
