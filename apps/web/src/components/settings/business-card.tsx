"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { apiClient, ApiError } from "@/lib/api-client";
import { useSettingsStore } from "@/lib/stores/settings-store";
import { toast } from "@/lib/stores/toast-store";
import type { Business, BusinessSettings, RoundingMode } from "@/lib/types";

const ROUNDING_OPTIONS: Array<{ value: RoundingMode; label: string }> = [
  { value: "none", label: "Tanpa pembulatan" },
  { value: "nearest_100", label: "Ke Rp100 terdekat" },
  { value: "nearest_500", label: "Ke Rp500 terdekat" },
  { value: "nearest_1000", label: "Ke Rp1.000 terdekat" },
  { value: "up_100", label: "Naik ke kelipatan Rp100" },
  { value: "up_500", label: "Naik ke kelipatan Rp500" },
];

const TEXTAREA_CLASS =
  "min-h-[4.5rem] w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

interface FormState {
  name: string;
  receipt_header: string;
  receipt_footer: string;
  rounding: RoundingMode;
}

export function BusinessCard() {
  const settings = useSettingsStore((s) => s.settings);
  const setSettings = useSettingsStore((s) => s.setSettings);
  const [business, setBusiness] = useState<Business | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiClient
      .get<Business>("/tenant/business")
      .then(setBusiness)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Gagal memuat data usaha."));
  }, []);

  useEffect(() => {
    if (business && settings && !form) {
      setForm({
        name: business.name,
        receipt_header: settings.receipt_header ?? "",
        receipt_footer: settings.receipt_footer ?? "",
        rounding: settings.rounding,
      });
    }
  }, [business, settings, form]);

  async function handleSave() {
    if (!form || !business) return;
    setError(null);
    if (!form.name.trim()) return setError("Nama usaha wajib diisi.");
    setSaving(true);
    try {
      const [updatedBusiness, updatedSettings] = await Promise.all([
        form.name.trim() !== business.name
          ? apiClient.patch<Business>("/tenant/business", { name: form.name.trim() })
          : Promise.resolve(business),
        apiClient.patch<BusinessSettings>("/tenant/settings", {
          receipt_header: form.receipt_header.trim(),
          receipt_footer: form.receipt_footer.trim(),
          rounding: form.rounding,
        }),
      ]);
      setBusiness(updatedBusiness);
      setSettings(updatedSettings);
      toast.success("Data usaha & struk disimpan.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal menyimpan.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card id="usaha" className="scroll-mt-20">
      <CardHeader>
        <CardTitle>Usaha & Struk</CardTitle>
        <p className="text-sm text-muted-foreground">Nama usaha dan teks tambahan tampil di setiap struk.</p>
      </CardHeader>
      <CardContent>
        {!form ? (
          error ? (
            <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
          ) : (
            <p className="text-sm text-muted-foreground">Memuat...</p>
          )
        ) : (
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              handleSave();
            }}
          >
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="business-name">Nama usaha</Label>
              <Input
                id="business-name"
                maxLength={150}
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="receipt-header">Teks atas struk</Label>
                <textarea
                  id="receipt-header"
                  className={TEXTAREA_CLASS}
                  placeholder="mis. Buka 07.00–21.00 · IG @warungku"
                  value={form.receipt_header}
                  onChange={(e) => setForm({ ...form, receipt_header: e.target.value })}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="receipt-footer">Teks bawah struk</Label>
                <textarea
                  id="receipt-footer"
                  className={TEXTAREA_CLASS}
                  placeholder="Terima kasih atas kunjungan Anda"
                  value={form.receipt_footer}
                  onChange={(e) => setForm({ ...form, receipt_footer: e.target.value })}
                />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="rounding">Pembulatan total</Label>
              <Select
                id="rounding"
                value={form.rounding}
                onChange={(e) => setForm({ ...form, rounding: e.target.value as RoundingMode })}
              >
                {ROUNDING_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
              <p className="text-xs text-muted-foreground">Berlaku untuk transaksi berikutnya; selisihnya tampil di struk.</p>
            </div>
            {error && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
            <div className="flex justify-end">
              <Button type="submit" disabled={saving}>
                {saving ? "Menyimpan..." : "Simpan"}
              </Button>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
