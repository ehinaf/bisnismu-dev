"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { getToken, getUser } from "@/lib/auth";
import { ThemeToggle } from "@/components/theme-toggle";
import { LogoutButton } from "@/components/logout-button";

const MANAGEMENT_ROLES = ["owner", "admin", "manager"];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [ready, setReady] = useState(false);
  const [userName, setUserName] = useState<string | null>(null);
  const [canViewReports, setCanViewReports] = useState(false);

  useEffect(() => {
    if (!getToken()) {
      router.replace("/login");
      return;
    }
    const user = getUser();
    setUserName(user?.name ?? null);
    setCanViewReports(!!user && MANAGEMENT_ROLES.includes(user.role));
    setReady(true);
  }, [router]);

  if (!ready) return null;

  return (
    <div className="flex min-h-screen flex-col">
      <header className="no-print flex items-center justify-between gap-4 border-b border-border bg-card px-4 py-3">
        <div className="flex items-center gap-6">
          <div className="flex flex-col">
            <span className="font-semibold">BisnisMu</span>
            {userName && <span className="text-xs text-muted-foreground">{userName}</span>}
          </div>
          <nav className="flex items-center gap-1">
            <NavLink href="/dashboard" active={pathname === "/dashboard"}>
              Kasir
            </NavLink>
            {canViewReports && (
              <NavLink href="/reports" active={pathname === "/reports"}>
                Laporan
              </NavLink>
            )}
          </nav>
        </div>
        <div className="flex items-center gap-1">
          <ThemeToggle />
          <LogoutButton />
        </div>
      </header>
      <main className="flex-1">{children}</main>
    </div>
  );
}

function NavLink({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className={cn(
        "rounded-md px-3 py-1.5 text-sm font-medium transition-colors hover:bg-accent",
        active ? "bg-accent text-accent-foreground" : "text-muted-foreground",
      )}
    >
      {children}
    </Link>
  );
}
