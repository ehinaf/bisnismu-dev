"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getToken, getUser } from "@/lib/auth";
import { ThemeToggle } from "@/components/theme-toggle";
import { LogoutButton } from "@/components/logout-button";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [userName, setUserName] = useState<string | null>(null);

  useEffect(() => {
    if (!getToken()) {
      router.replace("/login");
      return;
    }
    setUserName(getUser()?.name ?? null);
    setReady(true);
  }, [router]);

  if (!ready) return null;

  return (
    <div className="flex min-h-screen flex-col">
      <header className="no-print flex items-center justify-between border-b border-border bg-card px-4 py-3">
        <div className="flex flex-col">
          <span className="font-semibold">BisnisMu</span>
          {userName && <span className="text-xs text-muted-foreground">{userName}</span>}
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
