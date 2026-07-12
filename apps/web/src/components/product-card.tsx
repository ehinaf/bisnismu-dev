import { Card, CardContent } from "@/components/ui/card";
import { formatCurrency } from "@/lib/format";
import type { CatalogItem } from "@/lib/types";

export function ProductCard({ item, onAdd }: { item: CatalogItem; onAdd: (item: CatalogItem) => void }) {
  return (
    <Card
      role="button"
      tabIndex={0}
      onClick={() => onAdd(item)}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onAdd(item)}
      className="cursor-pointer select-none transition-colors hover:bg-accent active:scale-[0.98]"
    >
      <CardContent className="flex flex-col gap-1 p-3">
        <span className="line-clamp-2 min-h-[2.5rem] text-sm font-medium">{item.name}</span>
        <span className="text-sm font-semibold text-primary">{formatCurrency(item.base_price)}</span>
      </CardContent>
    </Card>
  );
}
