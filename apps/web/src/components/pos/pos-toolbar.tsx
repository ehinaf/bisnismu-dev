"use client";

import { useRef, useState } from "react";
import { Barcode, Search, StickyNote, User, Users } from "lucide-react";
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
  const orderNotes = useCartStore((s) => s.orderNotes);
  const searchRef = useRef<HTMLInputElement>(null);
  const [notesOpen, setNotesOpen] = useState(false);

  return (
    <div className="sticky top-14 z-20 flex flex-wrap items-center gap-2 border-b border-border bg-background/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="relative min-w-[240px] flex-1">
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

      <div className="relative">
        <ToolbarButton
          icon={StickyNote}
          label="Catatan"
          active={!!orderNotes.trim()}
          onClick={() => setNotesOpen((v) => !v)}
        />
        {notesOpen && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setNotesOpen(false)} />
            <div className="absolute right-0 top-full z-50 mt-2 w-72 rounded-lg border border-border bg-card p-3 shadow-lg">
              <NotesTextarea onDone={() => setNotesOpen(false)} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function NotesTextarea({ onDone }: { onDone: () => void }) {
  const orderNotes = useCartStore((s) => s.orderNotes);
  const setOrderNotes = useCartStore((s) => s.setOrderNotes);

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor="order-notes" className="text-xs font-medium text-muted-foreground">
        Catatan untuk pesanan ini
      </label>
      <textarea
        id="order-notes"
        rows={3}
        autoFocus
        value={orderNotes}
        onChange={(e) => setOrderNotes(e.target.value)}
        placeholder="Mis. tidak pedas, tanpa es..."
        className="w-full resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
      <button
        type="button"
        onClick={onDone}
        className="self-end rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90"
      >
        Selesai
      </button>
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
      className={cn(
        "flex h-10 items-center gap-2 whitespace-nowrap rounded-lg border px-3 text-sm font-medium transition-colors",
        active ? "border-primary/40 bg-primary/10 text-primary" : "border-border hover:bg-accent",
      )}
    >
      <Icon className="h-4 w-4" />
      <span className="max-w-[8rem] truncate">{active && activeLabel ? activeLabel : label}</span>
    </button>
  );
}
