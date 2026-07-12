"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ProductGrid } from "@/components/product-grid";
import { CartItemRow } from "@/components/cart-item-row";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { apiClient, ApiError } from "@/lib/api-client";
import { formatCurrency } from "@/lib/format";
import type { CartItem } from "@/lib/stores/cart-store";
import type { CatalogItem, DiningTable, OpenBillTransaction, Outlet, PaymentChannel } from "@/lib/types";

interface BillResponse {
  transaction: { id: string };
  receipt_url: string;
}

function addToPending(list: CartItem[], item: CatalogItem): CartItem[] {
  const existing = list.find((i) => i.item_id === item.id);
  if (existing) {
    return list.map((i) => (i.item_id === item.id ? { ...i, quantity: i.quantity + 1 } : i));
  }
  return [...list, { item_id: item.id, name: item.name, unit_price: Number(item.base_price), quantity: 1 }];
}

function updateQty(list: CartItem[], item_id: string, quantity: number): CartItem[] {
  if (quantity <= 0) return list.filter((i) => i.item_id !== item_id);
  return list.map((i) => (i.item_id === item_id ? { ...i, quantity } : i));
}

function pendingTotal(list: CartItem[]): number {
  return list.reduce((sum, i) => sum + i.unit_price * i.quantity, 0);
}

export default function TableBillPage({ params }: { params: Promise<{ tableId: string }> }) {
  const { tableId } = use(params);
  const router = useRouter();

  const [outlet, setOutlet] = useState<Outlet | null>(null);
  const [table, setTable] = useState<DiningTable | null>(null);
  const [bill, setBill] = useState<OpenBillTransaction | null>(null);
  const [catalogItems, setCatalogItems] = useState<CatalogItem[]>([]);
  const [channels, setChannels] = useState<PaymentChannel[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [guestCount, setGuestCount] = useState("2");
  const [pending, setPending] = useState<CartItem[]>([]);
  const [addingItems, setAddingItems] = useState(false);

  const [payingOpen, setPayingOpen] = useState(false);
  const [channelId, setChannelId] = useState("");
  const [amountPaid, setAmountPaid] = useState("");

  async function loadAll() {
    setLoading(true);
    setError(null);
    try {
      const outlets = await apiClient.get<Outlet[]>("/tenant/outlets");
      const firstOutlet = outlets[0] ?? null;
      setOutlet(firstOutlet);
      if (!firstOutlet) return;

      const [tables, bills, items, paymentChannels] = await Promise.all([
        apiClient.get<DiningTable[]>(`/tenant/outlets/${firstOutlet.id}/tables`),
        apiClient.get<OpenBillTransaction[]>(`/transactions/open?outlet_id=${firstOutlet.id}`),
        apiClient.get<CatalogItem[]>("/catalog/items"),
        apiClient.get<PaymentChannel[]>("/tenant/payment-channels"),
      ]);
      setTable(tables.find((t) => t.id === tableId) ?? null);
      setBill(bills.find((b) => b.dining_table_id === tableId) ?? null);
      setCatalogItems(items);
      setChannels(paymentChannels);
      setChannelId((prev) => prev || paymentChannels[0]?.id || "");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal memuat data meja.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tableId]);

  async function handleOpenBill() {
    if (!outlet || pending.length === 0) return;
    setSubmitting(true);
    setError(null);
    try {
      await apiClient.post("/transactions/open", {
        outlet_id: outlet.id,
        dining_table_id: tableId,
        guest_count: guestCount ? Number(guestCount) : undefined,
        items: pending.map((i) => ({ item_id: i.item_id, quantity: i.quantity })),
      });
      setPending([]);
      await loadAll();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal membuka meja.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleAddItems() {
    if (!bill || pending.length === 0) return;
    setSubmitting(true);
    setError(null);
    try {
      await apiClient.post(`/transactions/${bill.id}/items`, {
        items: pending.map((i) => ({ item_id: i.item_id, quantity: i.quantity })),
      });
      setPending([]);
      setAddingItems(false);
      await loadAll();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal menambah item.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleClose() {
    if (!bill || !channelId) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await apiClient.post<BillResponse>(`/transactions/${bill.id}/close`, {
        payments: [{ payment_channel_id: channelId, amount: paidNumber }],
      });
      router.replace(`/receipt/${result.transaction.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal menutup & membayar bill.");
    } finally {
      setSubmitting(false);
    }
  }

  const billTotal = bill ? Number(bill.total) : 0;
  const paidNumber = Number(amountPaid) || 0;
  const change = paidNumber > billTotal ? paidNumber - billTotal : 0;

  if (loading) return <p className="p-4 text-sm text-muted-foreground">Memuat...</p>;
  if (!table) return <p className="p-4 text-sm text-destructive">Meja tidak ditemukan.</p>;

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4 p-4">
      <div className="flex items-center justify-between">
        <div>
          <Button variant="ghost" size="sm" onClick={() => router.push("/tables")}>
            ← Kembali ke Meja
          </Button>
          <h1 className="text-lg font-semibold">{table.name}</h1>
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {!bill ? (
        <div className="flex flex-1 flex-col gap-4 lg:flex-row">
          <div className="flex-1">
            <ProductGrid items={catalogItems} onAdd={(item) => setPending((p) => addToPending(p, item))} />
          </div>
          <aside className="flex w-full flex-col gap-3 border-t border-border bg-card p-4 lg:w-80 lg:border-l lg:border-t-0">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="guest_count">Jumlah Tamu</Label>
              <Input id="guest_count" type="number" min={1} value={guestCount} onChange={(e) => setGuestCount(e.target.value)} />
            </div>
            <h2 className="text-sm font-semibold">Pesanan Awal</h2>
            {pending.length === 0 ? (
              <p className="text-sm text-muted-foreground">Pilih menu untuk buka meja ini.</p>
            ) : (
              <div className="flex-1 divide-y divide-border overflow-y-auto">
                {pending.map((item) => (
                  <CartItemRow
                    key={item.item_id}
                    item={item}
                    onIncrease={() => setPending((p) => updateQty(p, item.item_id, item.quantity + 1))}
                    onDecrease={() => setPending((p) => updateQty(p, item.item_id, item.quantity - 1))}
                    onRemove={() => setPending((p) => updateQty(p, item.item_id, 0))}
                  />
                ))}
              </div>
            )}
            <div className="flex items-center justify-between border-t border-border pt-3 text-sm font-semibold">
              <span>Subtotal</span>
              <span>{formatCurrency(pendingTotal(pending))}</span>
            </div>
            <Button size="lg" disabled={pending.length === 0 || submitting} onClick={handleOpenBill}>
              {submitting ? "Membuka..." : "Buka Meja"}
            </Button>
          </aside>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Bill {bill.transaction_number}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {bill.items.map((item) => (
                <div key={item.id} className="flex justify-between text-sm">
                  <span>
                    {item.item_name_snapshot} x{item.quantity}
                  </span>
                  <span>{formatCurrency(item.subtotal)}</span>
                </div>
              ))}
              <div className="flex justify-between border-t border-border pt-2 text-sm font-semibold">
                <span>Total</span>
                <span>{formatCurrency(bill.total)}</span>
              </div>
            </CardContent>
          </Card>

          {!addingItems ? (
            <Button variant="outline" onClick={() => setAddingItems(true)}>
              + Tambah Item
            </Button>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>Tambah Item ke Bill</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <ProductGrid items={catalogItems} onAdd={(item) => setPending((p) => addToPending(p, item))} />
                {pending.length > 0 && (
                  <div className="flex flex-col divide-y divide-border border-t border-border">
                    {pending.map((item) => (
                      <CartItemRow
                        key={item.item_id}
                        item={item}
                        onIncrease={() => setPending((p) => updateQty(p, item.item_id, item.quantity + 1))}
                        onDecrease={() => setPending((p) => updateQty(p, item.item_id, item.quantity - 1))}
                        onRemove={() => setPending((p) => updateQty(p, item.item_id, 0))}
                      />
                    ))}
                  </div>
                )}
                <div className="flex gap-2">
                  <Button disabled={pending.length === 0 || submitting} onClick={handleAddItems}>
                    {submitting ? "Menyimpan..." : "Tambah ke Bill"}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setAddingItems(false);
                      setPending([]);
                    }}
                  >
                    Batal
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {!payingOpen ? (
            <Button size="lg" onClick={() => setPayingOpen(true)}>
              Bayar
            </Button>
          ) : (
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
                    value={amountPaid}
                    onChange={(e) => setAmountPaid(e.target.value)}
                    placeholder={String(billTotal)}
                  />
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Kembalian</span>
                  <span className="font-semibold">{formatCurrency(change)}</span>
                </div>
                <div className="flex gap-2">
                  <Button size="lg" className="flex-1" disabled={submitting || !channelId} onClick={handleClose}>
                    {submitting ? "Memproses..." : "Bayar & Tutup"}
                  </Button>
                  <Button variant="outline" onClick={() => setPayingOpen(false)}>
                    Batal
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
