"use client";

import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { ProductGrid } from "@/components/product-grid";
import { CartPanel } from "@/components/cart-panel";
import { Input } from "@/components/ui/input";
import { apiClient, ApiError } from "@/lib/api-client";
import { useCartStore } from "@/lib/stores/cart-store";
import type { CatalogItem } from "@/lib/types";

export default function DashboardPage() {
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const addItem = useCartStore((s) => s.addItem);

  useEffect(() => {
    apiClient
      .get<CatalogItem[]>("/catalog/items")
      .then(setItems)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Gagal memuat produk."))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (i) => i.name.toLowerCase().includes(q) || (i.sku ?? "").toLowerCase().includes(q),
    );
  }, [items, query]);

  function handleAdd(item: CatalogItem) {
    addItem({ id: item.id, name: item.name, base_price: item.base_price });
  }

  return (
    <div className="flex flex-1 flex-col lg:flex-row">
      <div className="flex min-w-0 flex-1 flex-col pb-24 lg:pb-0">
        {/* Toolbar */}
        <div className="sticky top-16 z-20 border-b border-border bg-background/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/80">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-lg font-semibold">Kasir</h1>
              <p className="text-xs text-muted-foreground">
                {loading ? "Memuat produk…" : `${filtered.length} produk`}
              </p>
            </div>
            <div className="relative w-full sm:max-w-xs">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Cari produk atau SKU…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>
        </div>

        {/* Produk */}
        <div className="p-4">
          {error ? (
            <p className="rounded-lg bg-destructive/10 p-4 text-sm text-destructive">{error}</p>
          ) : (
            <ProductGrid items={filtered} onAdd={handleAdd} loading={loading} />
          )}
        </div>
      </div>

      <CartPanel />
    </div>
  );
}
