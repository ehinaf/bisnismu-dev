"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Boxes, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { Page } from "@/components/ui/page";
import { StockAdjustDialog } from "@/components/stock/stock-adjust-dialog";
import { apiClient, ApiError } from "@/lib/api-client";
import { getUser } from "@/lib/auth";
import { useLowStockCount } from "@/lib/hooks/use-low-stock-count";
import { formatQuantity, stockStatus, STOCK_STATUS } from "@/lib/stock";
import { useActiveOutlet } from "@/lib/stores/outlet-store";
import { cn } from "@/lib/utils";
import type { InventoryRow } from "@/lib/types";

const MANAGEMENT_ROLES = ["owner", "admin", "manager"];

type Filter = "all" | "low";

export default function StockPage() {
  const router = useRouter();
  const outlet = useActiveOutlet();
  const { refresh: refreshLowStock } = useLowStockCount();
  const [ready, setReady] = useState(false);
  const [rows, setRows] = useState<InventoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [selected, setSelected] = useState<InventoryRow | null>(null);

  useEffect(() => {
    const user = getUser();
    if (!user || !MANAGEMENT_ROLES.includes(user.role)) {
      router.replace("/transactions");
      return;
    }
    setReady(true);
  }, [router]);

  const load = useCallback(async () => {
    if (!outlet) return;
    setError(null);
    try {
      setRows(await apiClient.get<InventoryRow[]>(`/inventory?outlet_id=${outlet.id}`));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal memuat stok.");
    } finally {
      setLoading(false);
    }
  }, [outlet]);

  useEffect(() => {
    if (!ready) return;
    setLoading(true);
    void load();
  }, [ready, load]);

  const lowCount = useMemo(() => rows.filter((r) => stockStatus(r) !== "ok").length, [rows]);
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (filter === "low" && stockStatus(r) === "ok") return false;
      if (!q) return true;
      return [r.item_name, r.variant_name, r.sku].some((v) => v?.toLowerCase().includes(q));
    });
  }, [rows, query, filter]);

  if (!ready) return null;

  return (
    <Page width="wide">
      <PageHeader
        title="Stok"
        description={`Stok per outlet${outlet ? ` · ${outlet.name}` : ""} — isi stok awal, catat barang masuk, dan koreksi hasil hitung`}
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            aria-label="Cari produk"
            placeholder="Cari nama / SKU..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex gap-2" role="group" aria-label="Filter stok">
          {(
            [
              ["all", `Semua (${rows.length})`],
              ["low", `Menipis/habis (${lowCount})`],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={filter === value}
              onClick={() => setFilter(value)}
              className={cn(
                "h-10 rounded-full border px-4 text-sm font-medium transition-colors",
                filter === value
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card hover:bg-accent",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</p>}

      {loading ? (
        <p className="text-sm text-muted-foreground">Memuat stok...</p>
      ) : rows.length === 0 && !error ? (
        <EmptyState
          icon={Boxes}
          title="Belum ada produk yang melacak stok"
          description="Tambahkan produk di menu Produk dengan pilihan lacak stok aktif."
        />
      ) : visible.length === 0 ? (
        <EmptyState
          icon={Search}
          title={filter === "low" ? "Semua stok aman" : "Tidak ditemukan"}
          description={filter === "low" ? "Tidak ada produk yang menipis atau habis." : "Coba kata kunci lain."}
        />
      ) : (
        <Card>
          <CardContent className="divide-y divide-border p-0">
            {visible.map((r) => {
              const status = STOCK_STATUS[stockStatus(r)];
              const unit = r.unit_symbol ? ` ${r.unit_symbol}` : "";
              return (
                <div key={r.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {r.item_name}
                      {r.variant_name && <span className="text-muted-foreground"> · {r.variant_name}</span>}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {r.sku ? `${r.sku} · ` : ""}Batas minimum {formatQuantity(r.reorder_level)}
                      {unit}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className="text-sm font-semibold tabular-nums">
                      {formatQuantity(r.quantity_on_hand)}
                      {unit}
                    </span>
                    <Badge variant={status.variant}>{status.label}</Badge>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => setSelected(r)} aria-label={`Sesuaikan stok ${r.item_name}${r.variant_name ? ` ${r.variant_name}` : ""}`}>
                    Sesuaikan
                  </Button>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {outlet && (
        <StockAdjustDialog
          row={selected}
          outletId={outlet.id}
          onClose={() => setSelected(null)}
          onSaved={() => {
            setSelected(null);
            void load();
            void refreshLowStock();
          }}
        />
      )}
    </Page>
  );
}
