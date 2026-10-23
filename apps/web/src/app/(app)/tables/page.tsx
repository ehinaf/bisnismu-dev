"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/ui/page-header";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ChevronRight, LayoutGrid, Plus, ReceiptText, Users } from "lucide-react";
import { apiClient, ApiError } from "@/lib/api-client";
import { getUser } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/format";
import { useActiveOutlet, useOutletStore } from "@/lib/stores/outlet-store";
import { useBusinessSettings } from "@/lib/stores/settings-store";
import type { DiningTable, OpenBillTransaction } from "@/lib/types";

const MANAGEMENT_ROLES = ["owner", "admin", "manager"];

const STATUS_ACCENT: Record<string, string> = {
  available: "before:bg-success",
  occupied: "before:bg-warning",
  reserved: "before:bg-info",
  inactive: "before:bg-muted-foreground/40",
};

const STATUS_VARIANT: Record<string, BadgeProps["variant"]> = {
  available: "success",
  occupied: "warning",
  reserved: "info",
  inactive: "muted",
};

const STATUS_LABEL: Record<string, string> = {
  available: "Tersedia",
  occupied: "Terisi",
  reserved: "Dipesan",
  inactive: "Nonaktif",
};

export default function TablesPage() {
  const router = useRouter();
  const [canManage, setCanManage] = useState(false);

  // Outlet yang dipilih di sidebar (diisi layout); halaman dimuat ulang saat diganti.
  const outlet = useActiveOutlet();
  const outletsLoaded = useOutletStore((s) => s.loaded);
  // Usaha tanpa fitur meja tetap butuh halaman ini: order yang ditahan (F8) di
  // kasir dilanjutkan dari sini — hanya denah mejanya yang disembunyikan.
  const tablesEnabled = !!useBusinessSettings()?.enable_tables;
  const [tables, setTables] = useState<DiningTable[]>([]);
  const [openBills, setOpenBills] = useState<OpenBillTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [newTable, setNewTable] = useState({ name: "", area: "", capacity: "" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const user = getUser();
    setCanManage(!!user && MANAGEMENT_ROLES.includes(user.role));
  }, []);

  async function loadAll() {
    if (!outlet) return;
    setLoading(true);
    setError(null);
    try {
      const [tableList, bills] = await Promise.all([
        apiClient.get<DiningTable[]>(`/tenant/outlets/${outlet.id}/tables`),
        apiClient.get<OpenBillTransaction[]>(`/transactions/open?outlet_id=${outlet.id}`),
      ]);
      setTables(tableList);
      setOpenBills(bills);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal memuat meja.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (outlet) loadAll();
    else if (outletsLoaded) setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [outlet?.id, outletsLoaded]);

  const walkInBills = openBills.filter((b) => !b.dining_table_id);

  function billForTable(tableId: string) {
    return openBills.find((b) => b.dining_table_id === tableId);
  }

  async function handleAddTable() {
    if (!outlet || !newTable.name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await apiClient.post(`/tenant/outlets/${outlet.id}/tables`, {
        name: newTable.name.trim(),
        area: newTable.area.trim() || undefined,
        capacity: newTable.capacity ? Number(newTable.capacity) : undefined,
      });
      setNewTable({ name: "", area: "", capacity: "" });
      setFormOpen(false);
      await loadAll();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal menambah meja.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-5 p-4 sm:p-6">
      <PageHeader
        icon={LayoutGrid}
        title={tablesEnabled ? "Meja & Order" : "Hold Order"}
        description={tablesEnabled ? "Denah meja, open bill dine-in, dan order yang ditahan" : "Order yang ditahan di kasir (F8) — lanjutkan, tambah item, atau bayar"}
        action={
          canManage &&
          tablesEnabled && (
            <Button onClick={() => setFormOpen((v) => !v)}>
              <Plus className="h-4 w-4" /> Meja Baru
            </Button>
          )
        }
      />

      {error && <p className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</p>}

      {formOpen && tablesEnabled && (
        <Card>
          <CardHeader>
            <CardTitle>Meja Baru</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="table-name">Nama</Label>
              <Input
                id="table-name"
                value={newTable.name}
                onChange={(e) => setNewTable((s) => ({ ...s, name: e.target.value }))}
                className="w-40"
                placeholder="Meja 5"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="table-area">Area</Label>
              <Input
                id="table-area"
                value={newTable.area}
                onChange={(e) => setNewTable((s) => ({ ...s, area: e.target.value }))}
                className="w-32"
                placeholder="Indoor"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="table-capacity">Kapasitas</Label>
              <Input
                id="table-capacity"
                type="number"
                min={1}
                value={newTable.capacity}
                onChange={(e) => setNewTable((s) => ({ ...s, capacity: e.target.value }))}
                className="w-24"
              />
            </div>
            <Button disabled={saving} onClick={handleAddTable}>
              {saving ? "Menyimpan..." : "Simpan"}
            </Button>
          </CardContent>
        </Card>
      )}

      {loading ? (
        <p className="text-sm text-muted-foreground">Memuat...</p>
      ) : (
        <>
          {(walkInBills.length > 0 || !tablesEnabled) && (
            <section className="flex flex-col gap-2">
              {tablesEnabled && <h2 className="text-sm font-semibold">Order tanpa meja</h2>}
              {walkInBills.length === 0 ? (
                <EmptyState
                  icon={ReceiptText}
                  title="Belum ada order yang ditahan"
                  description="Tekan Hold Order (F8) di kasir untuk menahan pesanan dan membayarnya nanti."
                />
              ) : (
                <Card>
                  <CardContent className="divide-y divide-border p-0">
                    {walkInBills.map((bill) => (
                      <button
                        key={bill.id}
                        type="button"
                        onClick={() => router.push(`/tables/order-${bill.id}`)}
                        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/40"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{bill.transaction_number}</p>
                          <p className="truncate text-xs text-muted-foreground">
                            {bill.items.map((i) => `${i.item_name_snapshot} x${i.quantity}`).join(", ")}
                          </p>
                        </div>
                        <span className="text-sm font-bold tabular-nums text-primary">{formatCurrency(bill.total)}</span>
                        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                      </button>
                    ))}
                  </CardContent>
                </Card>
              )}
            </section>
          )}

          {tablesEnabled &&
            (tables.length === 0 ? (
              <EmptyState
                icon={LayoutGrid}
                title="Belum ada meja"
                description={canManage ? "Tambahkan meja pertama untuk mulai." : "Hubungi admin untuk menambah meja."}
                action={
                  canManage ? (
                    <Button size="sm" onClick={() => setFormOpen(true)}>
                      <Plus className="h-4 w-4" /> Meja Baru
                    </Button>
                  ) : undefined
                }
              />
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {tables.map((table) => {
                  const bill = billForTable(table.id);
                  const disabled = table.status === "inactive";
                  return (
                    <button
                      key={table.id}
                      type="button"
                      disabled={disabled}
                      onClick={() => !disabled && router.push(`/tables/${table.id}`)}
                      className={cn(
                        "group relative flex flex-col gap-2 overflow-hidden rounded-xl border border-border bg-card p-4 text-left shadow-sm transition-all",
                        "before:absolute before:inset-y-0 before:left-0 before:w-1",
                        STATUS_ACCENT[table.status] ?? "before:bg-border",
                        disabled
                          ? "cursor-not-allowed opacity-60"
                          : "hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:translate-y-0",
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-base font-semibold">{table.name}</span>
                        <Badge variant={STATUS_VARIANT[table.status] ?? "muted"}>
                          {STATUS_LABEL[table.status] ?? table.status}
                        </Badge>
                      </div>
                      <div className="flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                        {table.area && <span>{table.area}</span>}
                        {table.capacity && (
                          <span className="inline-flex items-center gap-1">
                            <Users className="h-3 w-3" /> {table.capacity}
                          </span>
                        )}
                      </div>
                      {bill && (
                        <span className="mt-1 text-sm font-bold tabular-nums text-primary">{formatCurrency(bill.total)}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            ))}
        </>
      )}
    </div>
  );
}
