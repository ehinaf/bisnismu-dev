import { Plus } from "lucide-react";
import { formatCurrency } from "@/lib/format";
import type { CatalogItem } from "@/lib/types";

export function ProductCard({ item, onAdd }: { item: CatalogItem; onAdd: (item: CatalogItem) => void }) {
  const initials = item.name.trim().slice(0, 2).toUpperCase();

  return (
    <button
      type="button"
      onClick={() => onAdd(item)}
      className="group relative flex flex-col overflow-hidden rounded-xl border border-border bg-card text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:translate-y-0 active:scale-[0.98]"
    >
      <div className="relative aspect-square w-full overflow-hidden bg-muted">
        {item.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.image_url} alt={item.name} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-secondary to-muted">
            <span className="text-2xl font-bold text-muted-foreground/50">{initials}</span>
          </div>
        )}
        <span className="absolute bottom-2 right-2 flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md transition-all group-hover:scale-110 lg:opacity-0 lg:group-hover:opacity-100">
          <Plus className="h-4 w-4" />
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-1 p-3">
        <span className="line-clamp-2 text-sm font-medium leading-snug">{item.name}</span>
        <span className="mt-auto pt-1 text-sm font-bold">{formatCurrency(item.base_price)}</span>
      </div>
    </button>
  );
}
