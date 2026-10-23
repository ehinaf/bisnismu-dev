"use client";

import { useEffect, useState } from "react";
import { Pencil, Percent, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { apiClient, ApiError } from "@/lib/api-client";
import { formatPercent } from "@/lib/format";
import { toast } from "@/lib/stores/toast-store";
import type { Tax, TaxKind } from "@/lib/types";

const KIND_LABEL: Record<TaxKind, string> = { tax: "Pajak", service_charge: "Service charge" };

interface FormState {
  id: string | null;
  name: string;
  /** Teks apa adanya supaya "11" atau "2,5" bisa diketik; diurai saat simpan. */
  rate: string;
  tax_kind: TaxKind;
}

const EMPTY_FORM: FormState = { id: null, name: "", rate: "", tax_kind: "tax" };

// Semua pajak/service charge AKTIF dikenakan atas subtotal setiap transaksi.
export function TaxesCard() {
  const [taxes, setTaxes] = useState<Tax[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    apiClient
      .get<Tax[]>("/tenant/taxes?all=1")
      .then(setTaxes)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Gagal memuat pajak."))
      .finally(() => setLoading(false));
  }, []);

  function replaceTax(updated: Tax) {
    setTaxes((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
  }

  function openCreate() {
    setFormError(null);
    setForm(EMPTY_FORM);
  }

  function openEdit(t: Tax) {
    setFormError(null);
    setForm({ id: t.id, name: t.name, rate: String(Number(t.rate)).replace(".", ","), tax_kind: t.tax_kind });
  }

  async function handleSubmit() {
    if (!form) return;
    setFormError(null);
    if (!form.name.trim()) return setFormError("Nama wajib diisi.");
    const rateText = form.rate.trim().replace(",", ".");
    if (!/^\d{1,3}(\.\d{1,2})?$/.test(rateText) || Number(rateText) > 100) {
      return setFormError("Tarif harus angka 0–100, maksimal 2 angka di belakang koma (mis. 11 atau 2,5).");
    }
    const body = { name: form.name.trim(), rate: Number(rateText), tax_kind: form.tax_kind };
    setSaving("form");
    try {
      if (form.id) {
        replaceTax(await apiClient.patch<Tax>(`/tenant/taxes/${form.id}`, body));
        toast.success(`${body.name} diperbarui — berlaku untuk transaksi berikutnya.`);
      } else {
        const created = await apiClient.post<Tax>("/tenant/taxes", body);
        setTaxes((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
        toast.success(`${created.name} aktif — dikenakan di setiap transaksi berikutnya.`);
      }
      setForm(null);
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Gagal menyimpan pajak.");
    } finally {
      setSaving(null);
    }
  }

  async function toggleActive(t: Tax) {
    setSaving(t.id);
    try {
      const updated = await apiClient.patch<Tax>(`/tenant/taxes/${t.id}`, { is_active: !t.is_active });
      replaceTax(updated);
      toast.success(updated.is_active ? `${updated.name} dikenakan lagi.` : `${updated.name} tidak dikenakan lagi.`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Gagal mengubah status.");
    } finally {
      setSaving(null);
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Percent className="h-4 w-4" /> Pajak & Service Charge
          </CardTitle>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Semua yang aktif dikenakan atas subtotal setiap transaksi (di luar harga produk).
          </p>
        </div>
        <Button size="sm" onClick={openCreate} className="shrink-0">
          <Plus className="h-4 w-4" /> Tambah
        </Button>
      </CardHeader>
      <CardContent className="p-0">
        {loading ? (
          <p className="px-4 pb-4 text-sm text-muted-foreground">Memuat pajak...</p>
        ) : error ? (
          <p className="mx-4 mb-4 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
        ) : taxes.length === 0 ? (
          <p className="border-t border-border px-4 py-3 text-sm text-muted-foreground">
            Belum ada pajak — harga di kasir tanpa PPN atau service charge.
          </p>
        ) : (
          <ul className="divide-y divide-border border-t border-border">
            {taxes.map((t) => (
              <li key={t.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:gap-3">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                    {t.name}
                    {!t.is_active && <Badge variant="muted">Nonaktif</Badge>}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {KIND_LABEL[t.tax_kind]} · {formatPercent(t.rate)}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => openEdit(t)} aria-label={`Ubah ${t.name}`}>
                    <Pencil className="h-3.5 w-3.5" /> Ubah
                  </Button>
                  <Button size="sm" variant="ghost" disabled={saving === t.id} onClick={() => toggleActive(t)}>
                    {t.is_active ? "Nonaktifkan" : "Aktifkan"}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      <Modal open={form !== null} onClose={() => setForm(null)} title={form?.id ? "Ubah Pajak" : "Tambah Pajak"}>
        {form && (
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              handleSubmit();
            }}
          >
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="tax-name">Nama di struk</Label>
              <Input
                id="tax-name"
                autoFocus
                maxLength={100}
                placeholder="mis. PPN 11%, PB1 10%, Service 5%"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="tax-kind">Jenis</Label>
                <Select
                  id="tax-kind"
                  value={form.tax_kind}
                  onChange={(e) => setForm({ ...form, tax_kind: e.target.value as TaxKind })}
                >
                  <option value="tax">Pajak</option>
                  <option value="service_charge">Service charge</option>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="tax-rate">Tarif (%)</Label>
                <Input
                  id="tax-rate"
                  inputMode="decimal"
                  placeholder="11"
                  value={form.rate}
                  onChange={(e) => setForm({ ...form, rate: e.target.value })}
                />
              </div>
            </div>
            {formError && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{formError}</p>}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setForm(null)}>
                Batal
              </Button>
              <Button type="submit" disabled={saving === "form"}>
                {saving === "form" ? "Menyimpan..." : "Simpan"}
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </Card>
  );
}
