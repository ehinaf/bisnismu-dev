"use client";

import { useEffect, useState } from "react";
import { CreditCard, Pencil, Plus, Wallet } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { MoneyInput } from "@/components/ui/money-input";
import { Select } from "@/components/ui/select";
import { apiClient, ApiError } from "@/lib/api-client";
import { formatCurrency, formatPercent } from "@/lib/format";
import { CHANNEL_ICONS, CHANNEL_TYPE_OPTIONS } from "@/lib/payment-channels";
import { toast } from "@/lib/stores/toast-store";
import type { PaymentChannel } from "@/lib/types";

interface FormState {
  id: string | null;
  name: string;
  channel_type: string;
  /** Teks apa adanya supaya "0,7" bisa diketik; diurai saat simpan. */
  fee_percentage: string;
  fee_fixed: number;
}

const EMPTY_FORM: FormState = { id: null, name: "", channel_type: "qris", fee_percentage: "", fee_fixed: 0 };

const typeLabel = (type: string) => CHANNEL_TYPE_OPTIONS.find((o) => o.value === type)?.label ?? type;

function feeSummary(c: PaymentChannel) {
  const parts = [];
  if (Number(c.fee_percentage) > 0) parts.push(formatPercent(c.fee_percentage));
  if (Number(c.fee_fixed) > 0) parts.push(formatCurrency(c.fee_fixed));
  return parts.length > 0 ? `Biaya ${parts.join(" + ")}` : "Tanpa biaya";
}

export function PaymentChannelsCard() {
  const [channels, setChannels] = useState<PaymentChannel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    apiClient
      .get<PaymentChannel[]>("/tenant/payment-channels?all=1")
      .then(setChannels)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Gagal memuat metode pembayaran."))
      .finally(() => setLoading(false));
  }, []);

  function replaceChannel(updated: PaymentChannel) {
    setChannels((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
  }

  function openCreate() {
    setFormError(null);
    setForm(EMPTY_FORM);
  }

  function openEdit(c: PaymentChannel) {
    setFormError(null);
    setForm({
      id: c.id,
      name: c.name,
      channel_type: c.channel_type,
      fee_percentage: Number(c.fee_percentage) > 0 ? c.fee_percentage.replace(".", ",") : "",
      fee_fixed: Number(c.fee_fixed),
    });
  }

  async function handleSubmit() {
    if (!form) return;
    setFormError(null);
    if (!form.name.trim()) return setFormError("Nama wajib diisi.");
    const percentText = form.fee_percentage.trim().replace(",", ".") || "0";
    if (!/^\d{1,3}(\.\d{1,3})?$/.test(percentText) || Number(percentText) > 100) {
      return setFormError("Biaya persen harus angka 0–100, maksimal 3 angka di belakang koma (mis. 0,7).");
    }

    const body = {
      name: form.name.trim(),
      channel_type: form.channel_type,
      fee_percentage: Number(percentText),
      fee_fixed: form.fee_fixed,
    };
    setSaving("form");
    try {
      if (form.id) {
        const updated = await apiClient.patch<PaymentChannel>(`/tenant/payment-channels/${form.id}`, body);
        replaceChannel(updated);
        toast.success(`${updated.name} diperbarui.`);
      } else {
        const created = await apiClient.post<PaymentChannel>("/tenant/payment-channels", body);
        setChannels((prev) => [...prev, created]);
        toast.success(`${created.name} ditambahkan ke pilihan pembayaran kasir.`);
      }
      setForm(null);
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Gagal menyimpan metode pembayaran.");
    } finally {
      setSaving(null);
    }
  }

  async function toggleActive(c: PaymentChannel) {
    setSaving(c.id);
    try {
      const updated = await apiClient.patch<PaymentChannel>(`/tenant/payment-channels/${c.id}`, {
        is_active: !c.is_active,
      });
      replaceChannel(updated);
      toast.success(updated.is_active ? `${updated.name} aktif di kasir.` : `${updated.name} disembunyikan dari kasir.`);
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
            <CreditCard className="h-4 w-4" /> Metode Pembayaran
          </CardTitle>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Pilihan bayar di kasir. Biaya (MDR) dicatat per pembayaran dan mengurangi laba di laporan.
          </p>
        </div>
        <Button size="sm" onClick={openCreate} className="shrink-0">
          <Plus className="h-4 w-4" /> Tambah
        </Button>
      </CardHeader>
      <CardContent className="p-0">
        {loading ? (
          <p className="px-4 pb-4 text-sm text-muted-foreground">Memuat metode pembayaran...</p>
        ) : error ? (
          <p className="mx-4 mb-4 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
        ) : (
          <ul className="divide-y divide-border border-t border-border">
            {channels.map((c) => {
              const Icon = CHANNEL_ICONS[c.channel_type] ?? Wallet;
              return (
                <li key={c.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:gap-3">
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                      <Icon className="h-4 w-4" />
                    </span>
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                        {c.name}
                        {!c.is_active && <Badge variant="muted">Nonaktif</Badge>}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {typeLabel(c.channel_type)} · {feeSummary(c)}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2 pl-12 sm:pl-0">
                    <Button size="sm" variant="outline" onClick={() => openEdit(c)} aria-label={`Ubah ${c.name}`}>
                      <Pencil className="h-3.5 w-3.5" /> Ubah
                    </Button>
                    <Button size="sm" variant="ghost" disabled={saving === c.id} onClick={() => toggleActive(c)}>
                      {c.is_active ? "Nonaktifkan" : "Aktifkan"}
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>

      <Modal
        open={form !== null}
        onClose={() => setForm(null)}
        title={form?.id ? "Ubah Metode Pembayaran" : "Tambah Metode Pembayaran"}
      >
        {form && (
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              handleSubmit();
            }}
          >
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="channel-name">Nama di kasir & struk</Label>
              <Input
                id="channel-name"
                autoFocus
                placeholder="mis. QRIS BCA, GoPay, Transfer BRI"
                maxLength={60}
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="channel-type">Jenis</Label>
              <Select
                id="channel-type"
                value={form.channel_type}
                onChange={(e) => setForm({ ...form, channel_type: e.target.value })}
              >
                {CHANNEL_TYPE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
              {form.channel_type === "cash" && (
                <p className="text-xs text-muted-foreground">Jenis Tunai masuk ke laci kas dan bisa memberi kembalian.</p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="channel-fee-pct">Biaya (%)</Label>
                <Input
                  id="channel-fee-pct"
                  inputMode="decimal"
                  placeholder="0"
                  value={form.fee_percentage}
                  onChange={(e) => setForm({ ...form, fee_percentage: e.target.value })}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="channel-fee-fixed">Biaya tetap (Rp)</Label>
                <MoneyInput
                  id="channel-fee-fixed"
                  placeholder="0"
                  value={form.fee_fixed}
                  onValueChange={(v) => setForm({ ...form, fee_fixed: v })}
                />
              </div>
            </div>
            <p className="-mt-2 text-xs text-muted-foreground">
              QRIS usaha mikro: 0% untuk transaksi sampai Rp500.000. Cek tarif dari bank/penyedia Anda.
            </p>
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
