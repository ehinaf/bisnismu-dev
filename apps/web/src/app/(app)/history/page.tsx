"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronRight, History } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/ui/page-header";
import { Page } from "@/components/ui/page";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { apiClient, ApiError } from "@/lib/api-client";
import { todayIso } from "@/lib/dates";
import { formatCurrency } from "@/lib/format";
import { useActiveOutlet } from "@/lib/stores/outlet-store";
import type { TransactionHistoryRow, TransactionStatus } from "@/lib/types";

const STATUS_LABEL: Partial<Record<TransactionStatus, string>> = {
  completed: "Selesai",
  void: "Dibatalkan",
  refunded: "Refund",
  partially_refunded: "Refund sebagian",
};

const COUNTED_STATUSES: TransactionStatus[] = ["completed", "refunded", "partially_refunded"];

const STATUS_VARIANT: Partial<Record<TransactionStatus, BadgeProps["variant"]>> = {
  completed: "success",
  void: "danger",
  refunded: "warning",
  partially_refunded: "warning",
};

export default function HistoryPage() {
  const outlet = useActiveOutlet();
  const [date, setDate] = useState(todayIso());
  const [rows, setRows] = useState<TransactionHistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!outlet || !date) return;
    setLoading(true);
    setError(null);
    apiClient
      .get<TransactionHistoryRow[]>(`/transactions?outlet_id=${outlet.id}&date=${date}`)
      .then(setRows)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Gagal memuat riwayat transaksi."))
      .finally(() => setLoading(false));
  }, [outlet, date]);

  // Sama dengan laporan: penjualan yang (sebagian) di-refund tetap dihitung,
  // transaksi refund (total negatif) mengurangi → total bersih hari itu.
  const counted = rows.filter((r) => COUNTED_STATUSES.includes(r.status));
  const saleCount = counted.filter((r) => r.transaction_type === "sale").length;
  const netTotal = counted.reduce((sum, r) => sum + Number(r.total), 0);

  return (
    <Page width="wide">
      <PageHeader title="Riwayat Transaksi" description="Penjualan & refund per hari — buka struk untuk cetak ulang, refund, atau membatalkan" />

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="history-date">Tanggal</Label>
          <Input
            id="history-date"
            type="date"
            value={date}
            max={todayIso()}
            onChange={(e) => setDate(e.target.value)}
            className="w-44"
          />
        </div>
        {!loading && !error && (
          <p className="text-sm text-muted-foreground">
            {saleCount} penjualan · bersih{" "}
            <span className="font-semibold tabular-nums text-foreground">{formatCurrency(netTotal)}</span>
          </p>
        )}
      </div>

      {error && <p className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</p>}

      {loading ? (
        <p className="text-sm text-muted-foreground">Memuat riwayat...</p>
      ) : rows.length === 0 && !error ? (
        <EmptyState icon={History} title="Belum ada transaksi" description="Tidak ada penjualan pada tanggal ini." />
      ) : (
        <Card>
          <CardContent className="divide-y divide-border p-0">
            {rows.map((r) => {
              const voided = r.status === "void";
              const isRefund = r.transaction_type === "refund";
              const methods = r.payments.map((p) => (p.is_receivable ? "Kasbon" : p.channel_name_snapshot)).join(", ");
              return (
                <Link
                  key={r.id}
                  href={`/receipt/${r.id}`}
                  className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/40"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{r.transaction_number}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {new Date(r.created_at).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}
                      {methods && ` · ${methods}`}
                      {r.customer?.name && ` · ${r.customer.name}`}
                      {isRefund && r.reference_transaction && ` · untuk ${r.reference_transaction.transaction_number}`}
                    </p>
                    {voided && r.void_reason && (
                      <p className="truncate text-xs text-destructive">Alasan: {r.void_reason}</p>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className={voided ? "text-sm tabular-nums text-muted-foreground line-through" : "text-sm font-semibold tabular-nums"}>
                      {formatCurrency(r.total)}
                    </span>
                    {isRefund ? (
                      <Badge variant="warning">Refund</Badge>
                    ) : (
                      <Badge variant={STATUS_VARIANT[r.status] ?? "muted"}>{STATUS_LABEL[r.status] ?? r.status}</Badge>
                    )}
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                </Link>
              );
            })}
          </CardContent>
        </Card>
      )}
    </Page>
  );
}
