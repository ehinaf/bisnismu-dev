"use client";

import { useEffect, useState } from "react";
import { ProductGrid } from "@/components/product-grid";
import { CartPanel } from "@/components/cart-panel";
import { apiClient, ApiError } from "@/lib/api-client";
import { useCartStore } from "@/lib/stores/cart-store";
import type { CatalogItem } from "@/lib/types";

export default function DashboardPage() {
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const addItem = useCartStore((s) => s.addItem);

  useEffect(() => {
    apiClient
      .get<CatalogItem[]>("/catalog/items")
      .then(setItems)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Gagal memuat produk."))
      .finally(() => setLoading(false));
  }, []);

  function handleAdd(item: CatalogItem) {
    addItem({ id: item.id, name: item.name, base_price: item.base_price });
  }

  return (
    <div className="flex flex-1 flex-col lg:flex-row">
      <div className="flex-1">
        {loading && <p className="p-4 text-sm text-muted-foreground">Memuat produk...</p>}
        {error && <p className="p-4 text-sm text-destructive">{error}</p>}
        {!loading && !error && <ProductGrid items={items} onAdd={handleAdd} />}
      </div>
      <CartPanel />
    </div>
  );
}
