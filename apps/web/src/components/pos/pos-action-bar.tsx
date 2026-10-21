"use client";

import { useState } from "react";
import { Ticket, ReceiptText, PauseCircle } from "lucide-react";
import { Kbd } from "@/components/ui/kbd";
import { cn } from "@/lib/utils";
import { formatPercent } from "@/lib/format";
import type { Tax } from "@/lib/types";

function ActionButton({
  icon: Icon,
  label,
  shortcut,
  disabled,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  shortcut: string;
  disabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium transition-colors",
        disabled ? "cursor-not-allowed opacity-40" : "hover:bg-accent",
      )}
    >
      <Icon className="h-4 w-4" />
      {label}
      <Kbd>{shortcut}</Kbd>
    </button>
  );
}

export function PosActionBar({
  taxes,
  onOpenVoucher,
  onHoldOrder,
  holding,
}: {
  taxes: Tax[];
  onOpenVoucher: () => void;
  onHoldOrder: () => void;
  holding: boolean;
}) {
  const [taxPopoverOpen, setTaxPopoverOpen] = useState(false);

  return (
    <div className="no-print flex flex-wrap items-center gap-2 border-t border-border bg-card px-4 py-3">
      <ActionButton icon={Ticket} label="Voucher" shortcut="F5" onClick={onOpenVoucher} />

      <div className="relative">
        <ActionButton
          icon={ReceiptText}
          label="Pajak"
          shortcut="F6"
          onClick={() => setTaxPopoverOpen((v) => !v)}
        />
        {taxPopoverOpen && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setTaxPopoverOpen(false)} />
            <div className="absolute bottom-full left-0 z-50 mb-2 w-56 rounded-lg border border-border bg-card p-3 text-sm shadow-lg">
              <p className="mb-2 text-xs font-medium text-muted-foreground">Pajak &amp; biaya aktif</p>
              {taxes.length === 0 ? (
                <p className="text-xs text-muted-foreground">Tidak ada pajak aktif.</p>
              ) : (
                <ul className="flex flex-col gap-1">
                  {taxes.map((t) => (
                    <li key={t.id} className="flex justify-between">
                      <span>{t.name}</span>
                      <span className="tabular-nums">{formatPercent(t.rate)}</span>
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-2 text-xs text-muted-foreground">Dihitung otomatis saat transaksi disimpan.</p>
            </div>
          </>
        )}
      </div>

      <ActionButton
        icon={PauseCircle}
        label={holding ? "Menahan..." : "Hold Order"}
        shortcut="F8"
        disabled={holding}
        onClick={onHoldOrder}
      />

      <p className="ml-auto hidden text-xs text-muted-foreground sm:block">
        Tip: scan barcode atau ketik nama produk lalu tekan Enter untuk menambah ke keranjang.
      </p>
    </div>
  );
}
