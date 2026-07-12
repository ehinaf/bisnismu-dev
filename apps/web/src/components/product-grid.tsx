import { PackageOpen } from "lucide-react";
import { ProductCard } from "@/components/product-card";
import type { CatalogItem } from "@/lib/types";

const GRID_CLASS = "grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5";

export function ProductGrid({
  items,
  onAdd,
  loading = false,
}: {
  items: CatalogItem[];
  onAdd: (item: CatalogItem) => void;
  loading?: boolean;
}) {
  if (loading) {
    return (
      <div className={GRID_CLASS}>
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
            <div className="aspect-square w-full animate-pulse bg-muted" />
            <div className="flex flex-col gap-2 p-3">
              <div className="h-3.5 w-3/4 animate-pulse rounded bg-muted" />
              <div className="h-3.5 w-1/2 animate-pulse rounded bg-muted" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border py-16 text-center">
        <PackageOpen className="h-10 w-10 text-muted-foreground/50" />
        <p className="text-sm text-muted-foreground">Tidak ada produk yang cocok.</p>
      </div>
    );
  }

  return (
    <div className={GRID_CLASS}>
      {items.map((item) => (
        <ProductCard key={item.id} item={item} onAdd={onAdd} />
      ))}
    </div>
  );
}
