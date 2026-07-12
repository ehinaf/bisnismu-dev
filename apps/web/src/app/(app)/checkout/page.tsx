"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { apiClient, ApiError } from "@/lib/api-client";
import { formatCurrency } from "@/lib/format";
import { cartSubtotal, useCartStore } from "@/lib/stores/cart-store";
import type { Outlet, PaymentChannel } from "@/lib/types";

interface CreateTransactionResponse {
  transaction: { id: string };
  receipt_url: string;
}

export default function CheckoutPage() {
  const router = useRouter();
  const items = useCartStore((s) => s.items);
  const clearCart = useCartStore((s) => s.clear);
  const subtotal = cartSubtotal(items);

  const [outlet, setOutlet] = useState<Outlet | null>(null);
  const [channels, setChannels] = useState<PaymentChannel[]>([]);
  const [channelId, setChannelId] = useState("");
  const [amountPaid, setAmountPaid] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (items.length === 0) {
      router.replace("/dashboard");
      return;
    }
    Promise.all([apiClient.get<Outlet[]>("/tenant/outlets"), apiClient.get<PaymentChannel[]>("/tenant/payment-channels")])
      .then(([outlets, paymentChannels]) => {
        setOutlet(outlets[0] ?? null);
        setChannels(paymentChannels);
        setChannelId(paymentChannels[0]?.id ?? "");
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Gagal memuat data checkout."))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const paidNumber = Number(amountPaid) || 0;
  const change = paidNumber > subtotal ? paidNumber - subtotal : 0;

  async function handleSubmit() {
    if (!outlet || !channelId) return;
    setError(null);
    setSubmitting(true);
    try {
      const result = await apiClient.post<CreateTransactionResponse>("/transactions", {
        outlet_id: outlet.id,
        items: items.map((i) => ({ item_id: i.item_id, quantity: i.quantity })),
        payments: [{ payment_channel_id: channelId, amount: paidNumber }],
      });
      clearCart();
      router.replace(`/receipt/${result.transaction.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal menyimpan transaksi.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <p className="p-4 text-sm text-muted-foreground">Memuat...</p>;

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-4 p-4">
      <Card>
        <CardHeader>
          <CardTitle>Review Pesanan</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {items.map((item) => (
            <div key={item.item_id} className="flex justify-between text-sm">
              <span>
                {item.name} x{item.quantity}
              </span>
              <span>{formatCurrency(item.unit_price * item.quantity)}</span>
            </div>
          ))}
          <div className="flex justify-between border-t border-border pt-2 text-sm font-semibold">
            <span>Total</span>
            <span>{formatCurrency(subtotal)}</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Pembayaran</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="channel">Metode Bayar</Label>
            <Select id="channel" value={channelId} onChange={(e) => setChannelId(e.target.value)}>
              {channels.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="amount">Jumlah Bayar</Label>
            <Input
              id="amount"
              type="number"
              min={0}
              inputMode="numeric"
              value={amountPaid}
              onChange={(e) => setAmountPaid(e.target.value)}
              placeholder={String(subtotal)}
            />
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Kembalian</span>
            <span className="font-semibold">{formatCurrency(change)}</span>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <Button size="lg" disabled={submitting || !channelId} onClick={handleSubmit}>
            {submitting ? "Memproses..." : "Bayar & Simpan"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
