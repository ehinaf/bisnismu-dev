"use client";

import { useCallback, useEffect, useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { MoneyInput } from "@/components/ui/money-input";
import { apiClient, ApiError } from "@/lib/api-client";
import { formatCurrency } from "@/lib/format";
import { toast } from "@/lib/stores/toast-store";
import type { ItemVariant } from "@/lib/types";

interface FormState {
  id: string | null;
  name: string;
  /** Harga jual varian (rupiah bulat); API menyimpan selisihnya dari harga dasar. */
  price: number;
  barcode: string;
  sku_suffix: string;
}

// Varian = pilihan ukuran/rasa/warna dengan harga & stok sendiri. Kasir wajib
// memilih varian saat menjual item ini; stok varian diisi di menu Stok.
export function VariantsSection({ itemId, basePrice, trackStock }: { itemId: string; basePrice: number; trackStock: boolean }) {
  const [variants, setVariants] = useState<ItemVariant[] | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<ItemVariant | null>(null);

  const load = useCallback(async () => {
    try {
      setVariants(await apiClient.get<ItemVariant[]>(`/catalog/items/${itemId}/variants`));
    } catch {
      setVariants([]);
    }
  }, [itemId]);

  useEffect(() => {
    void load();
  }, [load]);

  const priceOf = (v: ItemVariant) => basePrice + Number(v.price_adjustment);

  function openCreate() {
    setFormError(null);
    setForm({ id: null, name: "", price: basePrice, barcode: "", sku_suffix: "" });
  }

  function openEdit(v: ItemVariant) {
    setFormError(null);
    setForm({ id: v.id, name: v.name, price: priceOf(v), barcode: v.barcode ?? "", sku_suffix: v.sku_suffix ?? "" });
  }

  async function handleSubmit() {
    if (!form) return;
    setFormError(null);
    if (!form.name.trim()) return setFormError("Nama varian wajib diisi.");
    const body = {
      name: form.name.trim(),
      price_adjustment: form.price - basePrice,
      barcode: form.barcode.trim() || undefined,
      sku_suffix: form.sku_suffix.trim() || undefined,
    };
    setSaving(true);
    try {
      if (form.id) await apiClient.patch(`/catalog/items/${itemId}/variants/${form.id}`, body);
      else await apiClient.post(`/catalog/items/${itemId}/variants`, body);
      toast.success(form.id ? `Varian ${body.name} diperbarui.` : `Varian ${body.name} ditambahkan.`);
      setForm(null);
      await load();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Gagal menyimpan varian.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!pendingDelete) return;
    setSaving(true);
    try {
      await apiClient.delete(`/catalog/items/${itemId}/variants/${pendingDelete.id}`);
      toast.success(`Varian ${pendingDelete.name} dihapus.`);
      setPendingDelete(null);
      await load();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Gagal menghapus varian.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section id="variants" className="flex flex-col gap-3 border-t border-border pt-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">Varian</h3>
          <p className="text-xs text-muted-foreground">
            Ukuran, rasa, atau warna dengan harga sendiri — kasir memilih varian saat menjual.
            {trackStock && " Stok tiap varian diisi di menu Stok."}
          </p>
        </div>
        <Button type="button" size="sm" variant="outline" onClick={openCreate} className="shrink-0">
          <Plus className="h-4 w-4" /> Varian
        </Button>
      </div>

      {variants === null ? (
        <p className="text-sm text-muted-foreground">Memuat varian...</p>
      ) : variants.length === 0 ? (
        <p className="text-sm text-muted-foreground">Belum ada varian — produk dijual dengan harga dasar.</p>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {variants.map((v) => (
            <li key={v.id} className="flex items-center gap-3 px-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{v.name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {formatCurrency(priceOf(v))}
                  {v.barcode && ` · Barcode ${v.barcode}`}
                </p>
              </div>
              <Button type="button" size="sm" variant="ghost" onClick={() => openEdit(v)} aria-label={`Ubah varian ${v.name}`}>
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setPendingDelete(v)} aria-label={`Hapus varian ${v.name}`}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <Modal open={form !== null} onClose={() => setForm(null)} title={form?.id ? "Ubah Varian" : "Tambah Varian"}>
        {form && (
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              handleSubmit();
            }}
          >
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="variant-name">Nama varian</Label>
              <Input
                id="variant-name"
                autoFocus
                maxLength={100}
                placeholder="mis. Besar, Pedas, Merah, 1 Liter"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="variant-price">Harga jual varian (Rp)</Label>
              <MoneyInput id="variant-price" value={form.price} onValueChange={(v) => setForm({ ...form, price: v })} />
              <p className="text-xs text-muted-foreground">
                Harga dasar produk {formatCurrency(basePrice)}
                {form.price !== basePrice &&
                  ` · selisih ${form.price > basePrice ? "+" : "−"}${formatCurrency(Math.abs(form.price - basePrice))}`}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="variant-barcode">Barcode (opsional)</Label>
                <Input
                  id="variant-barcode"
                  inputMode="numeric"
                  maxLength={60}
                  value={form.barcode}
                  onChange={(e) => setForm({ ...form, barcode: e.target.value })}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="variant-sku">Akhiran SKU (opsional)</Label>
                <Input
                  id="variant-sku"
                  maxLength={30}
                  placeholder="mis. -L"
                  value={form.sku_suffix}
                  onChange={(e) => setForm({ ...form, sku_suffix: e.target.value })}
                />
              </div>
            </div>
            {formError && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{formError}</p>}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setForm(null)}>
                Batal
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? "Menyimpan..." : "Simpan"}
              </Button>
            </div>
          </form>
        )}
      </Modal>

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Hapus varian?"
        description={`Varian ${pendingDelete?.name ?? ""} tidak bisa dipilih lagi di kasir. Riwayat penjualannya tetap tersimpan.`}
        confirmLabel="Hapus"
        destructive
        busy={saving}
        onConfirm={handleDelete}
        onClose={() => setPendingDelete(null)}
      />
    </section>
  );
}
