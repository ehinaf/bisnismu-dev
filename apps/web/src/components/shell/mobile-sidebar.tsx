"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { X } from "lucide-react";
import { SidebarContent } from "@/components/shell/sidebar";

export function MobileSidebar({
  open,
  onClose,
  openOrdersCount,
  lowStockCount,
}: {
  open: boolean;
  onClose: () => void;
  openOrdersCount?: number;
  lowStockCount?: number;
}) {
  const pathname = usePathname();

  // Tutup drawer setiap pindah halaman.
  useEffect(() => {
    onClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  if (!open) return null;

  return (
    <div className="no-print fixed inset-0 z-50 lg:hidden">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="absolute inset-y-0 left-0 w-[240px] shadow-2xl">
        <button
          type="button"
          onClick={onClose}
          aria-label="Tutup menu"
          className="absolute right-2 top-4 z-10 rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <X className="h-5 w-5" />
        </button>
        <SidebarContent openOrdersCount={openOrdersCount} lowStockCount={lowStockCount} onNavigate={onClose} />
      </div>
    </div>
  );
}
