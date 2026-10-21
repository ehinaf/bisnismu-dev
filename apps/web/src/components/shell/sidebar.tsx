"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  BarChart3,
  Boxes,
  Calculator,
  ChevronsUpDown,
  HelpCircle,
  LayoutGrid,
  LogOut,
  Package,
  Percent,
  ReceiptText,
  Settings,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { clearAuth, getUser } from "@/lib/auth";
import { useActiveOutlet, useOutletStore } from "@/lib/stores/outlet-store";
import { ShiftPanel } from "@/components/shell/shift-panel";

const MANAGEMENT_ROLES = ["owner", "admin", "manager"];

interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  managementOnly?: boolean;
  badge?: "open-orders";
}

const NAV_ITEMS: NavItem[] = [
  { label: "Kasir", href: "/transactions", icon: Calculator },
  { label: "Meja / Order", href: "/tables", icon: LayoutGrid, badge: "open-orders" },
  { label: "Produk", href: "/catalog", icon: Package, managementOnly: true },
  { label: "Stok", href: "/stock", icon: Boxes, managementOnly: true },
  { label: "Pelanggan", href: "/customers", icon: Users, managementOnly: true },
  { label: "Kas & Laci", href: "/cashdrawer", icon: Wallet },
  { label: "Laporan", href: "/reports", icon: BarChart3, managementOnly: true },
  { label: "Pengeluaran", href: "/expenses", icon: ReceiptText, managementOnly: true },
  { label: "Promo / Diskon", href: "/promotions", icon: Percent, managementOnly: true },
  { label: "Pengaturan", href: "/settings", icon: Settings, managementOnly: true },
];

function navPath(href: string): string {
  return href.split("?")[0];
}

export function isNavActive(pathname: string, href: string): boolean {
  // Item ber-query (mis. tab riwayat) tidak dianggap aktif dari pathname saja.
  if (href.includes("?")) return false;
  const path = navPath(href);
  return path === "/transactions" ? pathname === path : pathname.startsWith(path);
}

export function Sidebar({ openOrdersCount }: { openOrdersCount?: number }) {
  return (
    <aside className="no-print fixed inset-y-0 left-0 z-40 hidden w-[210px] lg:block">
      <SidebarContent openOrdersCount={openOrdersCount} />
    </aside>
  );
}

export function SidebarContent({
  openOrdersCount,
  onNavigate,
}: {
  openOrdersCount?: number;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const user = getUser();
  const canManage = !!user && MANAGEMENT_ROLES.includes(user.role);

  function handleLogout() {
    clearAuth();
    router.replace("/login");
  }

  const items = NAV_ITEMS.filter((item) => !item.managementOnly || canManage);

  return (
    <div className="flex h-full flex-col overflow-y-auto bg-zinc-950 text-zinc-400">
      {/* Logo + outlet */}
      <div className="flex items-center gap-2.5 px-4 py-4">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-sm font-bold text-white">
          B
        </span>
        <div className="min-w-0 leading-tight">
          <p className="truncate text-sm font-semibold text-white">BisnisMu</p>
          <OutletSwitcher />
        </div>
      </div>

      {/* Navigasi */}
      <nav className="flex flex-col gap-0.5 px-2.5">
        {items.map((item) => {
          const active = isNavActive(pathname, item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.label}
              href={item.href}
              onClick={onNavigate}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                active ? "bg-blue-600 text-white" : "hover:bg-zinc-900 hover:text-zinc-200",
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="flex-1 truncate">{item.label}</span>
              {item.badge === "open-orders" && !!openOrdersCount && (
                <span className="flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-zinc-800 px-1.5 text-xs font-semibold text-zinc-200">
                  {openOrdersCount}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      <div className="flex-1" />

      {/* Kasir aktif + shift */}
      <ShiftPanel user={user} />

      {/* Bantuan & keluar */}
      <div className="flex flex-col gap-0.5 border-t border-zinc-800 px-2.5 py-3">
        <Link
          href="/help"
          onClick={onNavigate}
          className={cn(
            "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
            pathname.startsWith("/help") ? "bg-blue-600 text-white" : "hover:bg-zinc-900 hover:text-zinc-200",
          )}
        >
          <HelpCircle className="h-4 w-4" />
          Bantuan
        </Link>
        <button
          type="button"
          onClick={handleLogout}
          className="flex items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors hover:bg-zinc-900 hover:text-zinc-200"
        >
          <LogOut className="h-4 w-4" />
          Keluar
        </button>
      </div>
    </div>
  );
}

function OutletSwitcher() {
  const outlets = useOutletStore((s) => s.outlets);
  const setActiveOutlet = useOutletStore((s) => s.setActiveOutlet);
  const active = useActiveOutlet();

  if (outlets.length <= 1) {
    return <p className="truncate text-xs text-zinc-400">{active?.name ?? "Outlet"}</p>;
  }

  return (
    <div className="relative">
      <select
        value={active?.id ?? ""}
        onChange={(e) => setActiveOutlet(e.target.value)}
        aria-label="Pilih outlet"
        className="w-full cursor-pointer appearance-none truncate bg-transparent pr-4 text-xs text-zinc-400 outline-none hover:text-zinc-300"
      >
        {outlets.map((o) => (
          <option key={o.id} value={o.id} className="bg-zinc-950 text-zinc-200">
            {o.name}
          </option>
        ))}
      </select>
      <ChevronsUpDown className="pointer-events-none absolute right-0 top-1/2 h-3 w-3 -translate-y-1/2" />
    </div>
  );
}
