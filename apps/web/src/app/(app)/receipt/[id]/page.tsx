"use client";

import { use, useEffect, useState } from "react";
import { Printer, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiClient, ApiError } from "@/lib/api-client";
import { formatCurrency } from "@/lib/format";
import type { TransactionDetail } from "@/lib/types";

export default function ReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [transaction, setTransaction] = useState<TransactionDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiClient
      .get<TransactionDetail>(`/transactions/${id}`)
      .then(setTransaction)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Gagal memuat struk."));
  }, [id]);

  function handleShareWhatsApp() {
    if (!transaction) return;
    const text = `Struk ${transaction.transaction_number}\nTotal: ${formatCurrency(transaction.total)}\n${window.location.href}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
  }

  if (error) return <p className="p-4 text-sm text-destructive">{error}</p>;
  if (!transaction) return <p className="p-4 text-sm text-muted-foreground">Memuat struk...</p>;

  return (
    <div className="mx-auto flex max-w-md flex-col gap-4 p-4">
      <Card>
        <CardHeader>
          <CardTitle>Struk {transaction.transaction_number}</CardTitle>
          <p className="text-xs text-muted-foreground">{new Date(transaction.created_at).toLocaleString("id-ID")}</p>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-col gap-1 border-b border-border pb-3">
            {transaction.items.map((item) => (
              <div key={item.id} className="flex justify-between text-sm">
                <span>
                  {item.item_name_snapshot} x{item.quantity}
                </span>
                <span>{formatCurrency(item.subtotal)}</span>
              </div>
            ))}
          </div>

          <div className="flex flex-col gap-1 border-b border-border pb-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Subtotal</span>
              <span>{formatCurrency(transaction.subtotal)}</span>
            </div>
            {Number(transaction.tax_total) > 0 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Pajak</span>
                <span>{formatCurrency(transaction.tax_total)}</span>
              </div>
            )}
            {Number(transaction.service_charge_total) > 0 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Service Charge</span>
                <span>{formatCurrency(transaction.service_charge_total)}</span>
              </div>
            )}
            {Number(transaction.rounding_adjustment) !== 0 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Pembulatan</span>
                <span>{formatCurrency(transaction.rounding_adjustment)}</span>
              </div>
            )}
            <div className="flex justify-between font-semibold">
              <span>Total</span>
              <span>{formatCurrency(transaction.total)}</span>
            </div>
          </div>

          <div className="flex flex-col gap-1 text-sm">
            {transaction.payments.map((p) => (
              <div key={p.id} className="flex justify-between">
                <span className="text-muted-foreground">{p.channel_name_snapshot}</span>
                <span>{formatCurrency(p.amount)}</span>
              </div>
            ))}
            <div className="flex justify-between">
              <span className="text-muted-foreground">Kembalian</span>
              <span>{formatCurrency(transaction.change_due)}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="no-print flex gap-2">
        <Button variant="outline" className="flex-1" onClick={() => window.print()}>
          <Printer className="h-4 w-4" />
          Cetak
        </Button>
        <Button variant="outline" className="flex-1" onClick={handleShareWhatsApp}>
          <Share2 className="h-4 w-4" />
          WhatsApp
        </Button>
      </div>
    </div>
  );
}
