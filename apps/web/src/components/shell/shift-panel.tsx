"use client";

import { useState } from "react";
import { Wallet } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AuthUser } from "@/lib/auth";
import { useCashdrawer } from "@/lib/hooks/use-cashdrawer";
import { CloseShiftDialog, OpenShiftDialog } from "@/components/shell/shift-dialogs";

// Panel "Kasir Aktif" + status shift (sesi kas/laci) di bagian bawah sidebar.
export function ShiftPanel({ user, compact = false }: { user: AuthUser | null; compact?: boolean }) {
  const { session } = useCashdrawer();
  const [dialog, setDialog] = useState<"open" | "close" | null>(null);

  if (!user) return null;

  const isOpen = session?.status === "open";
  const openedTime = isOpen
    ? new Date(session.opened_at).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })
    : null;

  const dialogs = (
    <>
      <OpenShiftDialog open={dialog === "open"} onClose={() => setDialog(null)} />
      <CloseShiftDialog open={dialog === "close"} onClose={() => setDialog(null)} />
    </>
  );

  // Rail kasir: satu tombol laci dengan titik status; nama kasir ada di topbar.
  if (compact) {
    const label = isOpen ? "Tutup Shift" : "Buka Shift";
    return (
      <div className="flex justify-center border-t border-border px-2 py-3">
        <button
          type="button"
          onClick={() => setDialog(isOpen ? "close" : "open")}
          aria-label={label}
          title={isOpen ? `Shift buka sejak ${openedTime} — ${label}` : `Shift belum dibuka — ${label}`}
          className="relative flex h-11 w-11 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <Wallet className="h-5 w-5" />
          <span
            className={cn(
              "absolute right-2 top-2 h-2.5 w-2.5 rounded-full ring-2 ring-card",
              isOpen ? "bg-success" : "bg-muted-foreground/50",
            )}
          />
        </button>
        {dialogs}
      </div>
    );
  }

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

      {dialogs}
    </div>
  );
}
