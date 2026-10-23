"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/ui/page-header";
import { Page } from "@/components/ui/page";
import { StatCard } from "@/components/ui/stat-card";
import { Download } from "lucide-react";
import { apiClient, ApiError } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { getUser } from "@/lib/auth";
import { daysAgoIso, todayIso } from "@/lib/dates";
import { formatCurrency } from "@/lib/format";
import { useActiveOutlet } from "@/lib/stores/outlet-store";
import type { DailySalesRow, PaymentMethodRow, ProfitLossSummary, TopItemRow } from "@/lib/types";

const PRESETS = [
  { days: 0, label: "Hari ini" },
  { days: 7, label: "7 hari" },
  { days: 30, label: "30 hari" },
];

const presetFrom = (days: number) => (days === 0 ? todayIso() : daysAgoIso(days));

export default function ReportsPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  const outlet = useActiveOutlet();
  const [from, setFrom] = useState(todayIso());
  const [to, setTo] = useState(todayIso());

  const [profitLoss, setProfitLoss] = useState<ProfitLossSummary | null>(null);
  const [dailySales, setDailySales] = useState<DailySalesRow[]>([]);
  const [topItems, setTopItems] = useState<TopItemRow[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodRow[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    const user = getUser();
    if (!user || !["owner", "admin", "manager"].includes(user.role)) {
      router.replace("/transactions");
      return;
    }
    setReady(true);
  }, [router]);

  useEffect(() => {
    if (!ready || !outlet) return;
    setLoading(true);
    setError(null);
    const qs = `outlet_id=${outlet.id}&from=${from}&to=${to}`;
    Promise.all([
      apiClient.get<ProfitLossSummary>(`/reports/profit-loss?${qs}`),
      apiClient.get<DailySalesRow[]>(`/reports/daily-sales?${qs}`),
      apiClient.get<TopItemRow[]>(`/reports/top-items?${qs}&limit=10`),
      apiClient.get<PaymentMethodRow[]>(`/reports/payment-methods?${qs}`),
    ])
      .then(([pl, ds, ti, pm]) => {
        setProfitLoss(pl);
        setDailySales(ds);
        setTopItems(ti);
        setPaymentMethods(pm);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Gagal memuat laporan."))
      .finally(() => setLoading(false));
  }, [ready, outlet, from, to]);

  function applyPreset(days: number) {
    setFrom(presetFrom(days));
    setTo(todayIso());
  }

  async function handleExportCsv() {
    if (!outlet) return;
    setExporting(true);
    try {
      const blob = await apiClient.download(`/reports/daily-sales/export?outlet_id=${outlet.id}&from=${from}&to=${to}`);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `laporan-penjualan-${from}_${to}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal mengekspor CSV.");
    } finally {
      setExporting(false);
    }
  }

  if (!ready) return null;

  return (
    <Page width="wide">
      <PageHeader
        title="Laporan"
        description="Ringkasan penjualan, laba, dan performa"
        action={
          <Button variant="outline" disabled={!outlet || exporting} onClick={handleExportCsv}>
            <Download className="h-4 w-4" />
            {exporting ? "Mengekspor..." : "Ekspor CSV"}
          </Button>
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-lg border border-border bg-card p-0.5" role="group" aria-label="Rentang cepat">
          {PRESETS.map((preset) => {
            const active = from === presetFrom(preset.days) && to === todayIso();
            return (
              <button
                key={preset.days}
                type="button"
                aria-pressed={active}
                onClick={() => applyPreset(preset.days)}
                className={cn(
                  "h-8 rounded-md px-3 text-sm font-medium transition-colors",
                  active ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {preset.label}
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-2 text-sm">
          <Label htmlFor="from" className="sr-only">
            Dari
          </Label>
          <Input id="from" type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className="h-9 w-40" />
          <span className="text-muted-foreground">–</span>
          <Label htmlFor="to" className="sr-only">
            Sampai
          </Label>
          <Input id="to" type="date" value={to} min={from} max={todayIso()} onChange={(e) => setTo(e.target.value)} className="h-9 w-40" />
        </div>
      </div>

      {error && <p className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</p>}
      {loading && <p className="text-sm text-muted-foreground">Memuat laporan...</p>}

      {!loading && profitLoss && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard label="Penjualan Kotor" value={formatCurrency(profitLoss.gross_sales)} />
            <StatCard label="Pengeluaran" value={formatCurrency(profitLoss.total_expenses)} />
            <StatCard
              label="Laba Bersih"
              value={formatCurrency(profitLoss.net_profit)}
              accent={Number(profitLoss.net_profit) >= 0 ? "positive" : "negative"}
            />
            <StatCard label="Jumlah Transaksi" value={String(profitLoss.transaction_count)} />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Produk Terlaris</CardTitle>
              </CardHeader>
              <CardContent>
                {topItems.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Belum ada penjualan pada rentang ini.</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                        <th className="pb-2 font-medium">Produk</th>
                        <th className="pb-2 font-medium">Qty</th>
                        <th className="pb-2 text-right font-medium">Omzet</th>
                      </tr>
                    </thead>
                    <tbody>
                      {topItems.map((item) => (
                        <tr key={item.item_id ?? item.item_name} className="border-b border-border transition-colors last:border-0 hover:bg-muted/40">
                          <td className="py-1.5">{item.item_name}</td>
                          <td className="py-1.5">{item.total_qty}</td>
                          <td className="py-1.5 text-right">{formatCurrency(item.total_revenue)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Metode Pembayaran</CardTitle>
              </CardHeader>
              <CardContent>
                {paymentMethods.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Belum ada penjualan pada rentang ini.</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                        <th className="pb-2 font-medium">Metode</th>
                        <th className="pb-2 font-medium">Transaksi</th>
                        <th className="pb-2 text-right font-medium">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paymentMethods.map((pm) => (
                        <tr key={pm.channel_name} className="border-b border-border transition-colors last:border-0 hover:bg-muted/40">
                          <td className="py-1.5">{pm.channel_name}</td>
                          <td className="py-1.5">{pm.transaction_count}</td>
                          <td className="py-1.5 text-right">{formatCurrency(pm.total_amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Penjualan Harian</CardTitle>
            </CardHeader>
            <CardContent>
              {dailySales.length === 0 ? (
                <p className="text-sm text-muted-foreground">Belum ada penjualan pada rentang ini.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                        <th className="pb-2 font-medium">Tanggal</th>
                        <th className="pb-2 font-medium">Transaksi</th>
                        <th className="pb-2 text-right font-medium">Penjualan Kotor</th>
                        <th className="pb-2 text-right font-medium">Diskon</th>
                        <th className="pb-2 text-right font-medium">Pajak</th>
                        <th className="pb-2 text-right font-medium">Laba Kotor</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dailySales.map((row) => (
                        <tr key={row.sales_date} className="border-b border-border transition-colors last:border-0 hover:bg-muted/40">
                          <td className="py-1.5">{new Date(row.sales_date).toLocaleDateString("id-ID")}</td>
                          <td className="py-1.5">{row.transaction_count}</td>
                          <td className="py-1.5 text-right">{formatCurrency(row.gross_sales)}</td>
                          <td className="py-1.5 text-right">{formatCurrency(row.total_discounts)}</td>
                          <td className="py-1.5 text-right">{formatCurrency(row.total_taxes)}</td>
                          <td className="py-1.5 text-right">{formatCurrency(row.gross_profit)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </Page>
  );
}
