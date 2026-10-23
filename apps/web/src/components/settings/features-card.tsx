"use client";

import { useState } from "react";
import { ToggleRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiClient, ApiError } from "@/lib/api-client";
import { useSettingsStore } from "@/lib/stores/settings-store";
import { toast } from "@/lib/stores/toast-store";
import type { BusinessSettings } from "@/lib/types";

type FeatureKey = "enable_tables" | "enable_kasbon" | "low_stock_alert";

// Hanya fitur yang sudah ada layarnya; booking/loyalty/komisi menyusul.
const FEATURES: Array<{ key: FeatureKey; label: string; hint: string }> = [
  {
    key: "enable_tables",
    label: "Meja & open bill",
    hint: "Untuk warung makan/kafe: denah meja, pesanan per meja, bayar belakangan.",
  },
  {
    key: "enable_kasbon",
    label: "Kasbon pelanggan",
    hint: "Pelanggan boleh berutang sesuai batas kredit, dibayar dicicil.",
  },
  {
    key: "low_stock_alert",
    label: "Peringatan stok menipis",
    hint: "Tanda jumlah produk menipis/habis di menu Stok.",
  },
];

export function FeaturesCard() {
  const settings = useSettingsStore((s) => s.settings);
  const setSettings = useSettingsStore((s) => s.setSettings);
  const [saving, setSaving] = useState<FeatureKey | null>(null);

  async function toggle(key: FeatureKey) {
    if (!settings) return;
    const previous = settings;
    // Optimistis: sakelar (dan menu sidebar) langsung berubah, dikembalikan bila gagal.
    setSettings({ ...settings, [key]: !settings[key] });
    setSaving(key);
    try {
      setSettings(await apiClient.patch<BusinessSettings>("/tenant/settings", { [key]: !previous[key] }));
    } catch (err) {
      setSettings(previous);
      toast.error(err instanceof ApiError ? err.message : "Gagal menyimpan pengaturan fitur.");
    } finally {
      setSaving(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ToggleRight className="h-4 w-4" /> Fitur
        </CardTitle>
        <p className="text-sm text-muted-foreground">Nyalakan hanya yang dipakai usaha Anda supaya kasir tetap ringkas.</p>
      </CardHeader>
      <CardContent className="p-0">
        {!settings ? (
          <p className="px-4 pb-4 text-sm text-muted-foreground">Memuat...</p>
        ) : (
          <ul className="divide-y divide-border border-t border-border">
            {FEATURES.map((f) => {
              const id = `feature-${f.key}`;
              const on = settings[f.key];
              return (
                <li key={f.key} className="flex items-center justify-between gap-4 px-4 py-3">
                  <label htmlFor={id} className="min-w-0 cursor-pointer">
                    <span className="block text-sm font-medium">{f.label}</span>
                    <span className="block text-xs text-muted-foreground">{f.hint}</span>
                  </label>
                  <button
                    id={id}
                    type="button"
                    role="switch"
                    aria-checked={on}
                    disabled={saving === f.key}
                    onClick={() => toggle(f.key)}
                    className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60 ${
                      on ? "bg-primary" : "bg-muted-foreground/30"
                    }`}
                  >
                    <span
                      className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${
                        on ? "translate-x-5" : "translate-x-0.5"
                      }`}
                    />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
