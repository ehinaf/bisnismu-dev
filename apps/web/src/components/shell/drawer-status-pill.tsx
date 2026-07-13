"use client";

import { cn } from "@/lib/utils";
import { useCashdrawer } from "@/lib/hooks/use-cashdrawer";

// Pill status laci di topbar, dari GET /cashdrawer/current.
export function DrawerStatusPill() {
  const { session } = useCashdrawer();
  const isOpen = session?.status === "open";

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium",
        isOpen
          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400"
          : "bg-muted text-muted-foreground",
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", isOpen ? "bg-emerald-500" : "bg-zinc-400")} />
      {isOpen ? "Laci • Terbuka" : "Laci • Tertutup"}
    </span>
  );
}
