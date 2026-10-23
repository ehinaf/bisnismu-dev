import { formatCurrency } from "@/lib/format";
import { categoryColor } from "@/lib/category-colors";
import type { CatalogItem } from "@/lib/types";

// Tile produk ala Square: nama & harga yang mudah dibaca, tanpa blok gambar
// kosong. Garis kiri berwarna menandai kategori; foto tampil bila ada.
export function ProductCard({ item, onAdd }: { item: CatalogItem; onAdd: (item: CatalogItem) => void }) {
  const accent = categoryColor(item.category_id);
  const hasOptions = item.variant_count > 0 || item.modifier_group_count > 0;
  const openPrice = item.pricing_type === "open";

  return (
    <button
      type="button"
      onClick={() => onAdd(item)}
      className="relative flex min-h-[5.5rem] flex-col overflow-hidden rounded-lg border border-border bg-card text-left transition-colors hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:bg-muted"
    >
      {accent && <span aria-hidden className="absolute inset-y-0 left-0 w-1" style={{ backgroundColor: accent }} />}
      {item.image_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={item.image_url} alt="" className="aspect-[4/3] w-full border-b border-border object-cover" />
      )}
      <span className="flex flex-1 flex-col justify-between gap-2 py-2.5 pl-3.5 pr-3">
        <span className="line-clamp-2 text-sm font-medium leading-snug">{item.name}</span>
        <span className="flex items-baseline justify-between gap-2">
          <span className={openPrice ? "text-xs font-medium text-muted-foreground" : "text-sm font-semibold"}>
            {openPrice ? "Harga bebas" : formatCurrency(item.base_price)}
          </span>
          {hasOptions && <span className="text-[11px] font-medium text-muted-foreground">Pilihan</span>}
        </span>
      </span>
    </button>
  );
}
