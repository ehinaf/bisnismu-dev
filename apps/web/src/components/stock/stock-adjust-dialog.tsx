"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { apiClient, ApiError } from "@/lib/api-client";
import { formatQuantity, MOVEMENT_LABELS, parseQuantity } from "@/lib/stock";
import { toast } from "@/lib/stores/toast-store";
import { cn } from "@/lib/utils";
import type { InventoryRow, StockMovementRow } from "@/lib/types";

// "in"/"out" mengirim delta (dihitung server di bawah kunci baris — penjualan
// yang terjadi bersamaan tidak tertimpa); "count" mengirim jumlah akhir hasil hitung.
type Mode = "in" | "out" | "count";

const MODES: Array<{ value: Mode; label: string; reasons: string[] }> = [
  { value: "in", label: "Barang masuk", reasons: ["Pembelian", "Stok awal", "Retur dari pembeli"] },
  { value: "out", label: "Barang keluar", reasons: ["Rusak", "Kedaluwarsa", "Hilang", "Dipakai sendiri"] },
  { value: "count", label: "Hitung ulang", reasons: ["Hasil hitung fisik", "Stok awal", "Koreksi salah input"] },
];

export function StockAdjustDialog({
  row,
  outletId,
  onClose,
  onSaved,
}: {
  row: InventoryRow | null;
  outletId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [mode, setMode] = useState<Mode>("in");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("Pembelian");
  const [reorder, setReorder] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [movements, setMovements] = useState<StockMovementRow[] | null>(null);

  useEffect(() => {
    if (!row) return;
    setMode(Number(row.quantity_on_hand) === 0 ? "count" : "in");
    setReason(Number(row.quantity_on_hand) === 0 ? "Stok awal" : "Pembelian");
    setAmount("");
    setReorder(formatQuantity(row.reorder_level).replace(/\./g, ""));
    setError(null);
    setMovements(null);
    apiClient
      .get<StockMovementRow[]>(`/inventory/movements?outlet_id=${outletId}&item_id=${row.item_id}`)
      .then((all) => setMovements(all.filter((m) => m.inventory_id === row.id).slice(0, 8)))
      .catch(() => setMovements([]));
  }, [row, outletId]);

  if (!row) return null;

  const current = Number(row.quantity_on_hand);
  const unit = row.unit_symbol ? ` ${row.unit_symbol}` : "";
  const parsed = amount.trim() ? parseQuantity(amount) : Number.NaN;
  const preview = Number.isNaN(parsed)
    ? null
    : mode === "in"
      ? current + parsed
      : mode === "out"
        ? current - parsed
        : parsed;

  function chooseMode(next: Mode) {
    setMode(next);
    setReason(MODES.find((m) => m.value === next)!.reasons[0]);
    setError(null);
  }

  async function handleSave() {
    if (!row) return;
    setError(null);
    const reorderValue = parseQuantity(reorder || "0");
    const stockChanged = amount.trim() !== "";
    const reorderChanged = !Number.isNaN(reorderValue) && reorderValue !== Number(row.reorder_level);

    if (stockChanged) {
      if (Number.isNaN(parsed)) return setError("Jumlah harus angka, maksimal 3 angka di belakang koma.");
      if (!row.allow_decimal && !Number.isInteger(parsed)) {
        return setError(`Satuan ${row.unit_symbol ?? "ini"} tidak boleh pecahan.`);
      }
      if (mode !== "count" && parsed === 0) return setError("Jumlah harus lebih dari 0.");
      if (preview !== null && preview < 0) return setError("Stok tidak boleh minus.");
      if (!reason.trim()) return setError("Alasan wajib diisi.");
    }
    if (Number.isNaN(reorderValue)) return setError("Batas minimum harus angka.");
    if (!stockChanged && !reorderChanged) return setError("Belum ada yang diubah.");

    setSaving(true);
    try {
      const target = { outlet_id: outletId, item_id: row.item_id, variant_id: row.variant_id ?? undefined };
      if (stockChanged) {
        await apiClient.post("/inventory/adjust", {
          ...target,
          ...(mode === "count" ? { new_quantity: parsed } : { delta: mode === "in" ? parsed : -parsed }),
          reason: reason.trim(),
        });
      }
      if (reorderChanged) {
        await apiClient.patch("/inventory/reorder-level", { ...target, reorder_level: reorderValue });
      }
      toast.success(`Stok ${row.item_name}${row.variant_name ? ` (${row.variant_name})` : ""} disimpan.`);
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal menyimpan stok.");
    } finally {
      setSaving(false);
    }
  }

  const reasons = MODES.find((m) => m.value === mode)!.reasons;

  return (
    <Modal open onClose={onClose} title="Sesuaikan Stok">
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          handleSave();
        }}
      >
        <div className="rounded-lg bg-muted px-3 py-2 text-sm">
          <p className="font-medium">
            {row.item_name}
            {row.variant_name && <span className="text-muted-foreground"> · {row.variant_name}</span>}
          </p>
          <p className="text-muted-foreground">
            Stok sekarang <span className="font-semibold tabular-nums text-foreground">{formatQuantity(current)}{unit}</span>
          </p>
        </div>

        <div className="grid grid-cols-3 gap-1 rounded-lg bg-muted p-1" role="group" aria-label="Jenis penyesuaian">
          {MODES.map((m) => (
            <button
              key={m.value}
              type="button"
              aria-pressed={mode === m.value}
              onClick={() => chooseMode(m.value)}
              className={cn(
                "h-9 rounded-md text-sm font-medium transition-colors",
                mode === m.value ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {m.label}
            </button>
          ))}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="stock-amount">
            {mode === "count" ? "Jumlah hasil hitung" : mode === "in" ? "Jumlah masuk" : "Jumlah keluar"}
            {unit && ` (${row.unit_symbol})`}
          </Label>
          <Input
            id="stock-amount"
            inputMode={row.allow_decimal ? "decimal" : "numeric"}
            autoFocus
            placeholder="0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
          {preview !== null && preview >= 0 && (
            <p className="text-xs text-muted-foreground">
              Stok menjadi <span className="font-semibold tabular-nums text-foreground">{formatQuantity(preview)}{unit}</span>
            </p>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="stock-reason">Alasan</Label>
          <div className="flex flex-wrap gap-1.5">
            {reasons.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setReason(r)}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                  reason === r ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-accent",
                )}
              >
                {r}
              </button>
            ))}
          </div>
          <Input id="stock-reason" value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="stock-reorder">Batas minimum{unit && ` (${row.unit_symbol})`}</Label>
          <Input
            id="stock-reorder"
            inputMode={row.allow_decimal ? "decimal" : "numeric"}
            value={reorder}
            onChange={(e) => setReorder(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">Stok di bawah atau sama dengan angka ini ditandai Menipis.</p>
        </div>

        {error && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Batal
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? "Menyimpan..." : "Simpan"}
          </Button>
        </div>

        <div className="flex flex-col gap-2 border-t border-border pt-3">
          <p className="text-xs font-medium text-muted-foreground">Riwayat terakhir</p>
          {movements === null ? (
            <p className="text-xs text-muted-foreground">Memuat...</p>
          ) : movements.length === 0 ? (
            <p className="text-xs text-muted-foreground">Belum ada pergerakan stok.</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {movements.map((m) => {
                const qty = Number(m.quantity);
                return (
                  <li key={m.id} className="flex items-start justify-between gap-3 text-xs">
                    <span className="min-w-0">
                      <span className="font-medium">{MOVEMENT_LABELS[m.movement_type] ?? m.movement_type}</span>
                      {m.notes && <span className="text-muted-foreground"> · {m.notes}</span>}
                      <span className="block text-muted-foreground">
                        {new Date(m.created_at).toLocaleString("id-ID", { dateStyle: "short", timeStyle: "short" })}
                        {m.creator && ` · ${m.creator.name}`}
                      </span>
                    </span>
                    <span className={cn("shrink-0 font-semibold tabular-nums", qty < 0 ? "text-destructive" : "text-success")}>
                      {qty > 0 ? "+" : ""}
                      {formatQuantity(qty)}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </form>
    </Modal>
  );
}
