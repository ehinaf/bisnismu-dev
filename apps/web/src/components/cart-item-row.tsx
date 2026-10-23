import { Minus, Plus, Trash2 } from "lucide-react";
import { formatCurrency } from "@/lib/format";
import type { CartItem } from "@/lib/stores/cart-store";

export function CartItemRow({
  item,
  onIncrease,
  onDecrease,
  onRemove,
}: {
  item: CartItem;
  onIncrease: () => void;
  onDecrease: () => void;
  onRemove: () => void;
}) {
  const lineTotal = item.unit_price * item.quantity;

  return (
    <div className="flex items-start gap-3 py-3">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{item.name}</p>
        {item.options_label && <p className="truncate text-xs text-primary">{item.options_label}</p>}
        <p className="mt-0.5 text-xs text-muted-foreground">{formatCurrency(item.unit_price)} / item</p>

        <div className="mt-2 inline-flex items-center rounded-lg border border-border bg-card">
          <button
            type="button"
            onClick={onDecrease}
            aria-label="Kurangi"
            className="flex h-8 w-8 items-center justify-center rounded-l-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <Minus className="h-3.5 w-3.5" />
          </button>
          <span className="w-8 text-center text-sm font-medium tabular-nums">{item.quantity}</span>
          <button
            type="button"
            onClick={onIncrease}
            aria-label="Tambah"
            className="flex h-8 w-8 items-center justify-center rounded-r-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="flex flex-col items-end gap-2">
        <span className="text-sm font-semibold tabular-nums">{formatCurrency(lineTotal)}</span>
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Hapus ${item.name}`}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
