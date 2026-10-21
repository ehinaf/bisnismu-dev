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
          ? "bg-success/10 text-success"
          : "bg-muted text-muted-foreground",
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", isOpen ? "bg-success" : "bg-zinc-400")} />
      {isOpen ? "Laci • Terbuka" : "Laci • Tertutup"}
    </span>
  );
}
