import { Minus, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
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
  return (
    <div className="flex items-center justify-between gap-2 py-2">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{item.name}</p>
        <p className="text-xs text-muted-foreground">{formatCurrency(item.unit_price)} / item</p>
      </div>
      <div className="flex items-center gap-1">
        <Button variant="outline" size="icon" className="h-7 w-7" onClick={onDecrease} aria-label="Kurangi">
          <Minus className="h-3 w-3" />
        </Button>
        <span className="w-6 text-center text-sm">{item.quantity}</span>
        <Button variant="outline" size="icon" className="h-7 w-7" onClick={onIncrease} aria-label="Tambah">
          <Plus className="h-3 w-3" />
        </Button>
        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={onRemove} aria-label="Hapus">
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
