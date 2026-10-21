"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { apiClient, ApiError } from "@/lib/api-client";
import { formatCurrency } from "@/lib/format";
import { newClientRef } from "@/lib/utils";
import type { PaymentChannel, RefundableLine, RefundQuote } from "@/lib/types";

// Refund sebagian/penuh. Semua angka uang dari server (quote) — client hanya
// mengirim pilihan item, tidak menghitung prorata pajak/diskon sendiri.
export function RefundDialog({
  open,
  transactionId,
  transactionNumber,
  onClose,
  onRefunded,
}: {
  open: boolean;
  transactionId: string;
  transactionNumber: string;
  onClose: () => void;
  onRefunded: (refundId: string) => void;
}) {
  const [lines, setLines] = useState<RefundableLine[]>([]);
  const [channels, setChannels] = useState<PaymentChannel[]>([]);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [restock, setRestock] = useState<Record<string, boolean>>({});
  const [channelId, setChannelId] = useState("");
  const [reason, setReason] = useState("");
  const [quote, setQuote] = useState<RefundQuote | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Satu idempotency key per dialog: retry setelah koneksi putus tidak me-refund dua kali.
  const clientRef = useRef<string>("");

  useEffect(() => {
    if (!open) return;
    clientRef.current = newClientRef();
    setLoading(true);
    setError(null);
    setQuantities({});
    setReason("");
    setQuote(null);
    Promise.all([
      apiClient.get<RefundableLine[]>(`/transactions/${transactionId}/refundable`),
      apiClient.get<PaymentChannel[]>("/tenant/payment-channels"),
    ])
      .then(([refundable, channelList]) => {
        setLines(refundable);
        setChannels(channelList);
        setRestock(Object.fromEntries(refundable.map((l) => [l.transaction_item_id, l.restockable])));
        setChannelId(channelList.find((c) => c.channel_type === "cash")?.id ?? channelList[0]?.id ?? "");
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Gagal memuat data refund."))
      .finally(() => setLoading(false));
  }, [open, transactionId]);

  const selected = useMemo(
    () =>
      Object.entries(quantities)
        .filter(([, q]) => q > 0)
        .map(([transaction_item_id, quantity]) => ({ transaction_item_id, quantity })),
    [quantities],
  );

  // Pratinjau angka refund dari server setiap pilihan berubah.
  useEffect(() => {
    if (!open || selected.length === 0) {
      setQuote(null);
      return;
    }
    const timer = setTimeout(() => {
      apiClient
        .post<RefundQuote>(`/transactions/${transactionId}/refund/quote`, { lines: selected })
        .then((q) => {
          setQuote(q);
          setError(null);
        })
        .catch((err) => setError(err instanceof ApiError ? err.message : "Gagal menghitung refund."));
    }, 250);
    return () => clearTimeout(timer);
  }, [open, selected, transactionId]);

  const channel = channels.find((c) => c.id === channelId);
  const canSubmit = !!quote && selected.length > 0 && reason.trim().length >= 3 && !!channelId && !submitting;

  function setQuantity(line: RefundableLine, next: number) {
    const max = Number(line.remaining_quantity);
    setQuantities((prev) => ({ ...prev, [line.transaction_item_id]: Math.min(Math.max(next, 0), max) }));
  }

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      const refund = await apiClient.post<{ id: string }>(`/transactions/${transactionId}/refund`, {
        client_ref: clientRef.current,
        lines: selected.map((l) => ({ ...l, restock: restock[l.transaction_item_id] ?? false })),
        payment_channel_id: channelId,
        reason: reason.trim(),
      });
      onRefunded(refund.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal memproses refund.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={`Refund ${transactionNumber}`} className="sm:max-w-lg">
      {loading ? (
        <p className="text-sm text-muted-foreground">Memuat item...</p>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col divide-y divide-border rounded-lg border border-border">
            {lines.map((line) => {
              const remaining = Number(line.remaining_quantity);
              const qty = quantities[line.transaction_item_id] ?? 0;
              return (
                <div key={line.transaction_item_id} className="flex flex-col gap-2 px-3 py-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{line.item_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {remaining > 0 ? `Sisa ${remaining} × ${formatCurrency(line.unit_price)}` : "Sudah di-refund semua"}
                      </p>
                    </div>
                    {remaining > 0 && (
                      <div className="inline-flex shrink-0 items-center rounded-lg border border-border">
                        <button
                          type="button"
                          aria-label={`Kurangi refund ${line.item_name}`}
                          onClick={() => setQuantity(line, qty - 1)}
                          className="flex h-8 w-8 items-center justify-center rounded-l-lg text-muted-foreground hover:bg-accent"
                        >
                          <Minus className="h-3.5 w-3.5" />
                        </button>
                        <span className="w-8 text-center text-sm font-medium tabular-nums">{qty}</span>
                        <button
                          type="button"
                          aria-label={`Tambah refund ${line.item_name}`}
                          onClick={() => setQuantity(line, qty + 1)}
                          className="flex h-8 w-8 items-center justify-center rounded-r-lg text-muted-foreground hover:bg-accent"
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                  {qty > 0 &&
                    (line.restockable ? (
                      <label className="flex items-center gap-2 text-xs">
                        <input
                          type="checkbox"
                          checked={restock[line.transaction_item_id] ?? false}
                          onChange={(e) => setRestock((prev) => ({ ...prev, [line.transaction_item_id]: e.target.checked }))}
                        />
                        Kembalikan ke stok
                      </label>
                    ) : (
                      <p className="text-xs text-muted-foreground">Menu resep/paket — tidak kembali ke stok.</p>
                    ))}
                </div>
              );
            })}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="refund-channel">Uang dikembalikan lewat</Label>
            <Select id="refund-channel" value={channelId} onChange={(e) => setChannelId(e.target.value)}>
              {channels.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
            {channel?.channel_type === "cash" && (
              <p className="text-xs text-muted-foreground">Tunai diambil dari laci shift yang sedang buka.</p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="refund-reason">Alasan refund</Label>
            <textarea
              id="refund-reason"
              rows={2}
              maxLength={200}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Mis. barang cacat, salah ukuran"
              className="w-full resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>

          {quote && (
            <div className="flex flex-col gap-1 rounded-lg bg-muted/50 px-3 py-2 text-sm" aria-live="polite">
              <div className="flex justify-between font-semibold">
                <span>Total refund</span>
                <span className="tabular-nums">{formatCurrency(quote.amount)}</span>
              </div>
              {Number(quote.receivable_reduction) > 0 && (
                <>
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Mengurangi sisa kasbon</span>
                    <span className="tabular-nums">{formatCurrency(quote.receivable_reduction)}</span>
                  </div>
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Dibayarkan ke pembeli</span>
                    <span className="tabular-nums">{formatCurrency(quote.paid_out)}</span>
                  </div>
                </>
              )}
            </div>
          )}

          {error && (
            <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>
              Batal
            </Button>
            <Button variant="destructive" disabled={!canSubmit} onClick={handleSubmit}>
              {submitting ? "Memproses..." : quote ? `Refund ${formatCurrency(quote.amount)}` : "Refund"}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
