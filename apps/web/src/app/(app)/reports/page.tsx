"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiClient, ApiError } from "@/lib/api-client";
import { getUser } from "@/lib/auth";
import { formatCurrency } from "@/lib/format";
import type { DailySalesRow, Outlet, PaymentMethodRow, ProfitLossSummary, TopItemRow } from "@/lib/types";

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function daysAgoIso(days: number) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

export default function ReportsPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  const [outlet, setOutlet] = useState<Outlet | null>(null);
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
      router.replace("/dashboard");
      return;
    }
    setReady(true);
  }, [router]);

  useEffect(() => {
    if (!ready) return;
    apiClient
      .get<Outlet[]>("/tenant/outlets")
      .then((outlets) => setOutlet(outlets[0] ?? null))
      .catch((err) => setError(err instanceof ApiError ? err.message : "Gagal memuat outlet."));
  }, [ready]);

  useEffect(() => {
    if (!outlet) return;
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
  }, [outlet, from, to]);

  function applyPreset(days: number) {
    setFrom(days === 0 ? todayIso() : daysAgoIso(days));
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
    <div className="mx-auto flex max-w-5xl flex-col gap-4 p-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-lg font-semibold">Laporan</h1>
        <div className="flex flex-wrap items-end gap-2">
          <Button size="sm" variant="outline" onClick={() => applyPreset(0)}>
            Hari Ini
          </Button>
          <Button size="sm" variant="outline" onClick={() => applyPreset(7)}>
            7 Hari
          </Button>
          <Button size="sm" variant="outline" onClick={() => applyPreset(30)}>
            30 Hari
          </Button>
          <div className="flex flex-col gap-1">
            <Label htmlFor="from" className="text-xs">
              Dari
            </Label>
            <Input id="from" type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className="h-9 w-36" />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="to" className="text-xs">
              Sampai
            </Label>
            <Input id="to" type="date" value={to} min={from} max={todayIso()} onChange={(e) => setTo(e.target.value)} className="h-9 w-36" />
          </div>
          <Button size="sm" variant="outline" disabled={!outlet || exporting} onClick={handleExportCsv}>
            {exporting ? "Mengekspor..." : "Ekspor CSV"}
          </Button>
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {loading && <p className="text-sm text-muted-foreground">Memuat laporan...</p>}

      {!loading && profitLoss && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <KpiCard label="Penjualan Kotor" value={formatCurrency(profitLoss.gross_sales)} />
            <KpiCard label="Pengeluaran" value={formatCurrency(profitLoss.total_expenses)} />
            <KpiCard
              label="Laba Bersih"
              value={formatCurrency(profitLoss.net_profit)}
              accent={Number(profitLoss.net_profit) >= 0 ? "positive" : "negative"}
            />
            <KpiCard label="Jumlah Transaksi" value={String(profitLoss.transaction_count)} />
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
                      <tr className="border-b border-border text-left text-xs text-muted-foreground">
                        <th className="pb-2 font-medium">Produk</th>
                        <th className="pb-2 font-medium">Qty</th>
                        <th className="pb-2 text-right font-medium">Omzet</th>
                      </tr>
                    </thead>
                    <tbody>
                      {topItems.map((item) => (
                        <tr key={item.item_id ?? item.item_name} className="border-b border-border last:border-0">
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
                      <tr className="border-b border-border text-left text-xs text-muted-foreground">
                        <th className="pb-2 font-medium">Metode</th>
                        <th className="pb-2 font-medium">Transaksi</th>
                        <th className="pb-2 text-right font-medium">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paymentMethods.map((pm) => (
                        <tr key={pm.channel_name} className="border-b border-border last:border-0">
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
                      <tr className="border-b border-border text-left text-xs text-muted-foreground">
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
                        <tr key={row.sales_date} className="border-b border-border last:border-0">
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
    </div>
  );
}

function KpiCard({ label, value, accent }: { label: string; value: string; accent?: "positive" | "negative" }) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-1 p-4">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span
          className={
            accent === "positive"
              ? "text-lg font-semibold text-green-600 dark:text-green-400"
              : accent === "negative"
                ? "text-lg font-semibold text-destructive"
                : "text-lg font-semibold"
          }
        >
          {value}
        </span>
      </CardContent>
    </Card>
  );
}
