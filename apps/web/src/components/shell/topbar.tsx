"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ChevronDown, LogOut, Menu } from "lucide-react";
import { cn } from "@/lib/utils";
import { clearAuth, getUser } from "@/lib/auth";
import { ThemeToggle } from "@/components/theme-toggle";
import { DrawerStatusPill } from "@/components/shell/drawer-status-pill";

const PAGE_TITLES: Array<{ prefix: string; title: string; subtitle?: string }> = [
  { prefix: "/dashboard", title: "Transaksi Penjualan", subtitle: "Kasir" },
  { prefix: "/transactions", title: "Transaksi Penjualan", subtitle: "Kasir" },
  { prefix: "/checkout", title: "Pembayaran", subtitle: "Kasir" },
  { prefix: "/tables", title: "Meja / Order" },
  { prefix: "/catalog", title: "Kelola Produk" },
  { prefix: "/stock", title: "Stok" },
  { prefix: "/customers", title: "Pelanggan" },
  { prefix: "/cashdrawer", title: "Kas & Laci" },
  { prefix: "/reports", title: "Laporan" },
  { prefix: "/expenses", title: "Pengeluaran" },
  { prefix: "/promotions", title: "Promo / Diskon" },
  { prefix: "/settings", title: "Pengaturan" },
  { prefix: "/help", title: "Bantuan" },
  { prefix: "/receipt", title: "Struk" },
];

const ROLE_LABELS: Record<string, string> = {
  owner: "Pemilik",
  admin: "Admin",
  manager: "Manajer",
  cashier: "Kasir",
  staff: "Staf",
};

export function Topbar({ onOpenMenu }: { onOpenMenu: () => void }) {
  const pathname = usePathname();
  const page = PAGE_TITLES.find((p) => pathname.startsWith(p.prefix));

  return (
    <header className="no-print sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border bg-card/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-card/80">
      <button
        type="button"
        onClick={onOpenMenu}
        aria-label="Buka menu"
        className="rounded-lg p-2 text-muted-foreground hover:bg-accent hover:text-accent-foreground lg:hidden"
      >
        <Menu className="h-5 w-5" />
      </button>

      <div className="min-w-0 leading-tight">
        <h1 className="truncate text-sm font-semibold sm:text-base">{page?.title ?? "BisnisMu"}</h1>
        {page?.subtitle && <p className="text-xs text-muted-foreground">{page.subtitle}</p>}
      </div>

      <div className="hidden items-center gap-3 border-l border-border pl-3 sm:flex">
        <DrawerStatusPill />
        <LiveClock />
      </div>

      <div className="flex-1" />

      <div className="flex items-center gap-1">
        <ThemeToggle />
        <UserMenu />
      </div>
    </header>
  );
}

function LiveClock() {
  const [now, setNow] = useState<Date | null>(null);

  // Jam dirender hanya di client untuk menghindari hydration mismatch.
  useEffect(() => {
    setNow(new Date());
    const timer = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(timer);
  }, []);

  if (!now) return null;

  const date = now.toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
  const time = now.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
  return (
    <p className="whitespace-nowrap text-sm text-muted-foreground">
      {date} <span className="mx-1">•</span> {time}
    </p>
  );
}

function UserMenu() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const user = getUser();

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  if (!user) return null;

  const initials = user.name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-accent"
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
          {initials}
        </span>
        <span className="hidden text-left leading-tight md:block">
          <span className="block max-w-[8rem] truncate text-sm font-medium">{user.name}</span>
          <span className="block text-xs text-muted-foreground">{ROLE_LABELS[user.role] ?? user.role}</span>
        </span>
        <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 w-48 rounded-lg border border-border bg-card py-1 shadow-lg">
          <div className="border-b border-border px-3 py-2 md:hidden">
            <p className="truncate text-sm font-medium">{user.name}</p>
            <p className="text-xs text-muted-foreground">{ROLE_LABELS[user.role] ?? user.role}</p>
          </div>
          <button
            type="button"
            onClick={() => {
              clearAuth();
              router.replace("/login");
            }}
            className="flex w-full items-center gap-2 px-3 py-2 text-sm text-destructive hover:bg-accent"
          >
            <LogOut className="h-4 w-4" />
            Keluar
          </button>
        </div>
      )}
    </div>
  );
}
