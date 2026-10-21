"use client";

import { Suspense, use, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Ban, ChevronLeft, Printer, Share2, Undo2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { VoidDialog } from "@/components/pos/void-dialog";
import { RefundDialog } from "@/components/pos/refund-dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiClient, ApiError } from "@/lib/api-client";
import { formatCurrency } from "@/lib/format";
import { PERMISSIONS, usePermissions } from "@/lib/hooks/use-permissions";
import { toast } from "@/lib/stores/toast-store";
import type { TransactionDetail } from "@/lib/types";

export default function ReceiptPage(props: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<p className="p-4 text-sm text-muted-foreground">Memuat struk...</p>}>
      <ReceiptPageContent {...props} />
    </Suspense>
  );
}

function ReceiptPageContent({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const searchParams = useSearchParams();
  const router = useRouter();
  const [transaction, setTransaction] = useState<TransactionDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const autoActionDone = useRef(false);
  const permissions = usePermissions();
  const [voidOpen, setVoidOpen] = useState(false);
  const [refundOpen, setRefundOpen] = useState(false);

  function loadTransaction() {
    apiClient
      .get<TransactionDetail>(`/transactions/${id}`)
      .then(setTransaction)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Gagal memuat struk."));
  }

  useEffect(() => {
    loadTransaction();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  function handleShareWhatsApp() {
    if (!transaction) return;
    const text = `Struk ${transaction.transaction_number}\nTotal: ${formatCurrency(transaction.total)}\n${window.location.href}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
  }

  // Dipicu dari tombol "Simpan & Cetak" / "Simpan & WA" di kasir.
  useEffect(() => {
    if (!transaction || autoActionDone.current) return;
    autoActionDone.current = true;
    if (searchParams.get("print") === "1") window.print();
    else if (searchParams.get("share") === "wa") handleShareWhatsApp();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transaction]);

  if (error) return <p className="p-4 text-sm text-destructive">{error}</p>;
  if (!transaction) return <p className="p-4 text-sm text-muted-foreground">Memuat struk...</p>;

  const isRefund = transaction.transaction_type === "refund";
  const canRefund =
    !isRefund &&
    (transaction.status === "completed" || transaction.status === "partially_refunded") &&
    !!permissions?.includes(PERMISSIONS.REFUND_TRANSACTION);

  return (
    <div className="mx-auto flex max-w-md flex-col gap-4 p-4 sm:p-6">
      <Link
        href="/transactions"
        className="no-print inline-flex w-fit items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" /> Transaksi baru
      </Link>
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-2">
            <CardTitle>
              {isRefund ? "Struk Refund" : "Struk"} {transaction.transaction_number}
            </CardTitle>
            {transaction.status === "void" && <Badge variant="danger">DIBATALKAN</Badge>}
            {transaction.status === "refunded" && <Badge variant="warning">DIREFUND</Badge>}
            {transaction.status === "partially_refunded" && <Badge variant="warning">REFUND SEBAGIAN</Badge>}
          </div>
          <p className="text-xs text-muted-foreground">{new Date(transaction.created_at).toLocaleString("id-ID")}</p>
          {isRefund && transaction.reference_transaction && (
            <p className="text-xs text-muted-foreground">
              Refund untuk{" "}
              <Link href={`/receipt/${transaction.reference_transaction.id}`} className="font-medium text-primary underline underline-offset-2">
                {transaction.reference_transaction.transaction_number}
              </Link>
              {transaction.notes && ` · Alasan: ${transaction.notes}`}
            </p>
          )}
          {transaction.status === "void" && transaction.void_reason && (
            <p className="text-xs text-destructive">Alasan: {transaction.void_reason}</p>
          )}
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-col gap-1 border-b border-border pb-3">
            {transaction.items.map((item) => (
              <div key={item.id} className="flex justify-between text-sm">
                <span>
                  {/* Struk refund: qty tercatat negatif — tanda minus cukup di nominal. */}
                  {item.item_name_snapshot} x{isRefund ? item.quantity.replace(/^-/, "") : item.quantity}
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
            <div className="flex justify-between text-base font-semibold">
              <span>Total</span>
              <span className="tabular-nums">{formatCurrency(transaction.total)}</span>
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

          {transaction.refund_transactions.length > 0 && (
            <div className="flex flex-col gap-1 border-t border-border pt-3 text-sm">
              <p className="text-xs font-medium text-muted-foreground">Refund</p>
              {transaction.refund_transactions.map((r) => (
                <Link key={r.id} href={`/receipt/${r.id}`} className="flex justify-between hover:underline">
                  <span>
                    {r.transaction_number} · {new Date(r.created_at).toLocaleDateString("id-ID")}
                  </span>
                  <span className="tabular-nums">{formatCurrency(r.total)}</span>
                </Link>
              ))}
            </div>
          )}
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

      {canRefund && (
        <>
          <Button variant="outline" className="no-print" onClick={() => setRefundOpen(true)}>
            <Undo2 className="h-4 w-4" />
            Refund
          </Button>
          <RefundDialog
            open={refundOpen}
            transactionId={transaction.id}
            transactionNumber={transaction.transaction_number}
            onClose={() => setRefundOpen(false)}
            onRefunded={(refundId) => {
              setRefundOpen(false);
              toast.success("Refund tersimpan.");
              router.push(`/receipt/${refundId}`);
            }}
          />
        </>
      )}

      {!isRefund && transaction.status === "completed" && permissions?.includes(PERMISSIONS.VOID_TRANSACTION) && (
        <>
          <Button
            variant="outline"
            className="no-print border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={() => setVoidOpen(true)}
          >
            <Ban className="h-4 w-4" />
            Batalkan Transaksi
          </Button>
          <VoidDialog
            open={voidOpen}
            transactionId={transaction.id}
            title="Batalkan transaksi?"
            description={`Stok, poin pelanggan, dan kuota voucher dari ${transaction.transaction_number} dikembalikan. Kembalikan pembayaran ${formatCurrency(transaction.total)} ke pembeli lewat metode yang sama.`}
            confirmLabel="Batalkan Transaksi"
            onClose={() => setVoidOpen(false)}
            onVoided={() => {
              setVoidOpen(false);
              toast.success(`Transaksi ${transaction.transaction_number} dibatalkan.`);
              loadTransaction();
            }}
          />
        </>
      )}
    </div>
  );
}
