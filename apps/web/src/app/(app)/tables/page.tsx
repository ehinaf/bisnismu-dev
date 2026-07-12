"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiClient, ApiError } from "@/lib/api-client";
import { getUser } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/format";
import type { DiningTable, OpenBillTransaction, Outlet } from "@/lib/types";

const MANAGEMENT_ROLES = ["owner", "admin", "manager"];

const STATUS_STYLE: Record<string, string> = {
  available: "border-green-300 bg-green-50 dark:border-green-800 dark:bg-green-950",
  occupied: "border-orange-300 bg-orange-50 dark:border-orange-800 dark:bg-orange-950",
  reserved: "border-blue-300 bg-blue-50 dark:border-blue-800 dark:bg-blue-950",
  inactive: "border-border bg-muted opacity-60",
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

  const [outlet, setOutlet] = useState<Outlet | null>(null);
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
    setLoading(true);
    setError(null);
    try {
      const outlets = await apiClient.get<Outlet[]>("/tenant/outlets");
      const firstOutlet = outlets[0] ?? null;
      setOutlet(firstOutlet);
      if (!firstOutlet) return;
      const [tableList, bills] = await Promise.all([
        apiClient.get<DiningTable[]>(`/tenant/outlets/${firstOutlet.id}/tables`),
        apiClient.get<OpenBillTransaction[]>(`/transactions/open?outlet_id=${firstOutlet.id}`),
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
    loadAll();
  }, []);

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
    <div className="mx-auto flex max-w-5xl flex-col gap-4 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Meja</h1>
        {canManage && <Button onClick={() => setFormOpen((v) => !v)}>+ Meja Baru</Button>}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {formOpen && (
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
        <p className="text-sm text-muted-foreground">Memuat meja...</p>
      ) : tables.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Belum ada meja. {canManage ? 'Klik "+ Meja Baru" untuk mulai.' : "Hubungi admin untuk menambah meja."}
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {tables.map((table) => {
            const bill = billForTable(table.id);
            return (
              <Card
                key={table.id}
                role="button"
                tabIndex={0}
                onClick={() => table.status !== "inactive" && router.push(`/tables/${table.id}`)}
                onKeyDown={(e) => {
                  if ((e.key === "Enter" || e.key === " ") && table.status !== "inactive") {
                    router.push(`/tables/${table.id}`);
                  }
                }}
                className={cn(
                  "cursor-pointer select-none border-2 transition-colors",
                  STATUS_STYLE[table.status] ?? "",
                  table.status === "inactive" && "cursor-not-allowed",
                )}
              >
                <CardContent className="flex flex-col gap-1 p-4">
                  <span className="text-base font-semibold">{table.name}</span>
                  {table.area && <span className="text-xs text-muted-foreground">{table.area}</span>}
                  {table.capacity && <span className="text-xs text-muted-foreground">Kapasitas {table.capacity}</span>}
                  <span className="mt-1 text-xs font-medium">{STATUS_LABEL[table.status] ?? table.status}</span>
                  {bill && (
                    <span className="text-sm font-semibold text-primary">{formatCurrency(bill.total)}</span>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
