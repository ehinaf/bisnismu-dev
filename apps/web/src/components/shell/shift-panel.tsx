"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import type { AuthUser } from "@/lib/auth";
import { useCashdrawer } from "@/lib/hooks/use-cashdrawer";
import { CloseShiftDialog, OpenShiftDialog } from "@/components/shell/shift-dialogs";

// Panel "Kasir Aktif" + status shift (sesi kas/laci) di bagian bawah sidebar.
export function ShiftPanel({ user }: { user: AuthUser | null }) {
  const { session } = useCashdrawer();
  const [dialog, setDialog] = useState<"open" | "close" | null>(null);

  if (!user) return null;

  const isOpen = session?.status === "open";
  const openedTime = isOpen
    ? new Date(session.opened_at).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })
    : null;

  return (
    <div className="border-t border-border px-4 py-3">
      <p className="text-xs text-muted-foreground">Kasir aktif</p>
      <p className="truncate text-sm font-semibold text-foreground">{user.name}</p>

      <div className="mt-2 flex items-center gap-2 text-xs">
        <span className={cn("h-2 w-2 shrink-0 rounded-full", isOpen ? "bg-success" : "bg-muted-foreground/40")} />
        <span className="truncate text-muted-foreground">{isOpen ? `Shift buka sejak ${openedTime}` : "Shift belum dibuka"}</span>
      </div>

      {isOpen ? (
        <button
          type="button"
          onClick={() => setDialog("close")}
          className="mt-3 w-full rounded-lg border border-border py-2 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10"
        >
          Tutup Shift
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setDialog("open")}
          className="mt-3 w-full rounded-lg border border-border py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
        >
          Buka Shift
        </button>
      )}

      <OpenShiftDialog open={dialog === "open"} onClose={() => setDialog(null)} />
      <CloseShiftDialog open={dialog === "close"} onClose={() => setDialog(null)} />
    </div>
  );
}
