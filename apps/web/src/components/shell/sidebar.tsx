"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  BarChart3,
  Boxes,
  Calculator,
  ChevronsUpDown,
  HelpCircle,
  History,
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
import { getUser } from "@/lib/auth";
import { logout } from "@/lib/session";
import { useActiveOutlet, useOutletStore } from "@/lib/stores/outlet-store";
import { ShiftPanel } from "@/components/shell/shift-panel";
import { useBusinessSettings } from "@/lib/stores/settings-store";

const MANAGEMENT_ROLES = ["owner", "admin", "manager"];

interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  managementOnly?: boolean;
  /** Nama menu bila fitur meja nonaktif (halaman tetap dipakai untuk order yang ditahan). */
  labelWithoutTables?: string;
  badge?: "open-orders" | "low-stock";
}

const NAV_ITEMS: NavItem[] = [
  { label: "Kasir", href: "/transactions", icon: Calculator },
  { label: "Riwayat", href: "/history", icon: History },
  {
    label: "Meja / Order",
    labelWithoutTables: "Hold Order",
    href: "/tables",
    icon: LayoutGrid,
    badge: "open-orders",
  },
  { label: "Produk", href: "/catalog", icon: Package, managementOnly: true },
  { label: "Stok", href: "/stock", icon: Boxes, managementOnly: true, badge: "low-stock" },
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

/**
 * `compact` = rail ikon 64px — dipakai di layar kasir supaya grid produk dapat
 * ruang lebih di tablet (Square: layar jualan tanpa menu lebar).
 */
export function Sidebar({
  openOrdersCount,
  lowStockCount,
  compact = false,
}: {
  openOrdersCount?: number;
  lowStockCount?: number;
  compact?: boolean;
}) {
  return (
    <aside className={cn("no-print fixed inset-y-0 left-0 z-40 hidden lg:block", compact ? "w-16" : "w-[210px]")}>
      <SidebarContent openOrdersCount={openOrdersCount} lowStockCount={lowStockCount} compact={compact} />
    </aside>
  );
}

export function SidebarContent({
  openOrdersCount,
  lowStockCount,
  onNavigate,
  compact = false,
}: {
  openOrdersCount?: number;
  lowStockCount?: number;
  onNavigate?: () => void;
  compact?: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const user = getUser();
  const settings = useBusinessSettings();
  const canManage = !!user && MANAGEMENT_ROLES.includes(user.role);

  async function handleLogout() {
    await logout();
    router.replace("/login");
  }

  const items = NAV_ITEMS.filter((item) => !item.managementOnly || canManage).map((item) =>
    item.labelWithoutTables && settings && !settings.enable_tables ? { ...item, label: item.labelWithoutTables } : item,
  );

  return (
    <div className="flex h-full flex-col overflow-y-auto border-r border-border bg-card text-muted-foreground">
      {/* Logo + outlet */}
      <div className={cn("flex items-center gap-2.5 py-4", compact ? "justify-center px-0" : "px-4")}>
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground"
          title={compact ? "BisnisMu" : undefined}
        >
          B
        </span>
        {!compact && (
          <div className="min-w-0 leading-tight">
            <p className="truncate text-sm font-semibold text-foreground">BisnisMu</p>
            <OutletSwitcher />
          </div>
        )}
      </div>

      {/* Navigasi */}
      <nav className={cn("flex flex-col gap-0.5", compact ? "items-center px-2" : "px-2.5")}>
        {items.map((item) => {
          const active = isNavActive(pathname, item.href);
          const Icon = item.icon;
          const badge =
            item.badge === "low-stock" && settings?.low_stock_alert
              ? lowStockCount
              : item.badge === "open-orders"
                ? openOrdersCount
                : 0;
          if (compact) {
            return (
              <Link
                key={item.label}
                href={item.href}
                onClick={onNavigate}
                aria-label={badge ? `${item.label} (${badge})` : item.label}
                aria-current={active ? "page" : undefined}
                title={item.label}
                className={cn(
                  "relative flex h-11 w-11 items-center justify-center rounded-lg transition-colors",
                  active ? "bg-primary/10 text-primary" : "hover:bg-muted hover:text-foreground",
                )}
              >
                <Icon className="h-5 w-5" />
                {!!badge && (
                  <span
                    className={cn(
                      "absolute right-1 top-1 flex h-4 min-w-[1rem] items-center justify-center rounded-full px-1 text-[10px] font-semibold",
                      item.badge === "low-stock" ? "bg-warning text-background" : "bg-primary text-primary-foreground",
                    )}
                  >
                    {badge}
                  </span>
                )}
              </Link>
            );
          }
          return (
            <Link
              key={item.label}
              href={item.href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                active ? "bg-primary/10 text-primary" : "hover:bg-muted hover:text-foreground",
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="flex-1 truncate">{item.label}</span>
              {item.badge === "low-stock" && settings?.low_stock_alert && !!lowStockCount && (
                <span
                  title={`${lowStockCount} produk menipis/habis`}
                  className="flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-warning/15 px-1.5 text-xs font-semibold tabular-nums text-warning"
                >
                  {lowStockCount}
                </span>
              )}
              {item.badge === "open-orders" && !!openOrdersCount && (
                <span className="flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-muted px-1.5 text-xs font-semibold tabular-nums text-foreground">
                  {openOrdersCount}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      <div className="flex-1" />

      {/* Kasir aktif + shift */}
      <ShiftPanel user={user} compact={compact} />

      {/* Bantuan & keluar */}
      {compact ? (
        <div className="flex flex-col items-center gap-0.5 border-t border-border px-2 py-3">
          <Link
            href="/help"
            aria-label="Bantuan"
            title="Bantuan"
            className="flex h-11 w-11 items-center justify-center rounded-lg transition-colors hover:bg-muted hover:text-foreground"
          >
            <HelpCircle className="h-5 w-5" />
          </Link>
          <button
            type="button"
            onClick={handleLogout}
            aria-label="Keluar"
            title="Keluar"
            className="flex h-11 w-11 items-center justify-center rounded-lg transition-colors hover:bg-muted hover:text-foreground"
          >
            <LogOut className="h-5 w-5" />
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-0.5 border-t border-border px-2.5 py-3">
          <Link
            href="/help"
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              pathname.startsWith("/help") ? "bg-primary/10 text-primary" : "hover:bg-muted hover:text-foreground",
            )}
          >
            <HelpCircle className="h-4 w-4" />
            Bantuan
          </Link>
          <button
            type="button"
            onClick={handleLogout}
            className="flex items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors hover:bg-muted hover:text-foreground"
          >
            <LogOut className="h-4 w-4" />
            Keluar
          </button>
        </div>
      )}
    </div>
  );
}

function OutletSwitcher() {
  const outlets = useOutletStore((s) => s.outlets);
  const setActiveOutlet = useOutletStore((s) => s.setActiveOutlet);
  const active = useActiveOutlet();

  if (outlets.length <= 1) {
    return <p className="truncate text-xs text-muted-foreground">{active?.name ?? "Outlet"}</p>;
  }

  return (
    <div className="relative">
      <select
        value={active?.id ?? ""}
        onChange={(e) => setActiveOutlet(e.target.value)}
        aria-label="Pilih outlet"
        className="w-full cursor-pointer appearance-none truncate bg-transparent pr-4 text-xs text-muted-foreground outline-none hover:text-foreground"
      >
        {outlets.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
      <ChevronsUpDown className="pointer-events-none absolute right-0 top-1/2 h-3 w-3 -translate-y-1/2" />
    </div>
  );
}
