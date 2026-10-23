"use client";

import { useRef } from "react";
import { Barcode, Search, User, Users } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useCartStore } from "@/lib/stores/cart-store";

export function PosToolbar({
  query,
  onQueryChange,
  onSubmitQuery,
  onOpenCustomer,
  onOpenTable,
}: {
  query: string;
  onQueryChange: (value: string) => void;
  onSubmitQuery: () => boolean;
  onOpenCustomer: () => void;
  /** Tidak diisi bila fitur meja nonaktif — tombolnya disembunyikan. */
  onOpenTable?: () => void;
}) {
  const customer = useCartStore((s) => s.customer);
  const table = useCartStore((s) => s.table);
  const searchRef = useRef<HTMLInputElement>(null);

  return (
    <div className="sticky top-14 z-20 flex items-center gap-2 border-b border-border bg-card px-4 py-3 lg:static">
      <div className="relative min-w-0 flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          ref={searchRef}
          type="search"
          placeholder="Cari produk / scan barcode..."
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== "Enter") return;
            // Tidak ada yang cocok → teks dipilih supaya scan berikutnya langsung menimpanya.
            if (onSubmitQuery()) searchRef.current?.focus();
            else searchRef.current?.select();
          }}
          className="pl-9 pr-9"
        />
        <Barcode className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      </div>

      <ToolbarButton icon={User} label="Pelanggan" active={!!customer} activeLabel={customer?.name} onClick={onOpenCustomer} />
      {onOpenTable && (
        <ToolbarButton icon={Users} label="Meja / Order" active={!!table} activeLabel={table?.name} onClick={onOpenTable} />
      )}
    </div>
  );
}

function ToolbarButton({
  icon: Icon,
  label,
  active,
  activeLabel,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  active?: boolean;
  activeLabel?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      className={cn(
        "flex h-10 shrink-0 items-center gap-2 whitespace-nowrap rounded-lg border px-3 text-sm font-medium transition-colors",
        active ? "border-primary/40 bg-primary/10 text-primary" : "border-border bg-card hover:bg-muted",
      )}
    >
      <Icon className="h-4 w-4" />
      {/* Ponsel: ikon saja; nama tetap terbaca pembaca layar. */}
      <span className="sr-only max-w-[8rem] truncate sm:not-sr-only">{active && activeLabel ? activeLabel : label}</span>
    </button>
  );
}
