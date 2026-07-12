import { ProductCard } from "@/components/product-card";
import type { CatalogItem } from "@/lib/types";

export function ProductGrid({ items, onAdd }: { items: CatalogItem[]; onAdd: (item: CatalogItem) => void }) {
  if (items.length === 0) {
    return <p className="p-4 text-sm text-muted-foreground">Belum ada produk.</p>;
  }

  return (
    <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 lg:grid-cols-4">
      {items.map((item) => (
        <ProductCard key={item.id} item={item} onAdd={onAdd} />
      ))}
    </div>
  );
}
