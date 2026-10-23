"use client";

import { use, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ProductGrid } from "@/components/product-grid";
import { CartItemRow } from "@/components/cart-item-row";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { PageHeader } from "@/components/ui/page-header";
import { VoidDialog } from "@/components/pos/void-dialog";
import { LayoutGrid } from "lucide-react";
import { apiClient, ApiError } from "@/lib/api-client";
import { formatCurrency } from "@/lib/format";
import { useCheckoutQuote } from "@/lib/hooks/use-checkout-quote";
import { PERMISSIONS, usePermissions } from "@/lib/hooks/use-permissions";
import { toast } from "@/lib/stores/toast-store";
import { checkPayments } from "@/lib/payment-rules";
import { newClientRef } from "@/lib/utils";
import { cartSubtotal } from "@/lib/stores/cart-store";
import { addCartLine, setCartLineQuantity, toTransactionLine, type CartItem } from "@/lib/cart-lines";
import { ItemOptionsModal, needsOptions } from "@/components/pos/item-options-modal";
import { useActiveOutlet, useOutletStore } from "@/lib/stores/outlet-store";
import type { CatalogItem, DiningTable, OpenBillTransaction, PaymentChannel } from "@/lib/types";

interface BillResponse {
  transaction: { id: string };
  receipt_url: string;
}


export default function TableBillPage({ params }: { params: Promise<{ tableId: string }> }) {
  const { tableId } = use(params);
  const router = useRouter();
  // "/tables/order-<id>" = order yang ditahan tanpa meja (F8 di kasir).
  const walkInBillId = tableId.startsWith("order-") ? tableId.slice("order-".length) : null;

  const outlet = useActiveOutlet();
  const outletsLoaded = useOutletStore((s) => s.loaded);
  const [table, setTable] = useState<DiningTable | null>(null);
  const [bill, setBill] = useState<OpenBillTransaction | null>(null);
  const [catalogItems, setCatalogItems] = useState<CatalogItem[]>([]);
  const [channels, setChannels] = useState<PaymentChannel[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [guestCount, setGuestCount] = useState("2");
  const [pending, setPending] = useState<CartItem[]>([]);
  const [optionsItem, setOptionsItem] = useState<CatalogItem | null>(null);

  // Sama dengan layar kasir: item bervarian/bermodifier/harga bebas → pemilih opsi dulu.
  function handleAddPending(item: CatalogItem) {
    if (needsOptions(item)) setOptionsItem(item);
    else setPending((p) => addCartLine(p, { item_id: item.id, name: item.name, unit_price: Number(item.base_price) }));
  }
  const [addingItems, setAddingItems] = useState(false);

  const [payingOpen, setPayingOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const permissions = usePermissions();
  const [channelId, setChannelId] = useState("");
  const [amountPaid, setAmountPaid] = useState("");
  // Idempotency key buka meja — dipakai ulang bila request diulang setelah gagal/putus.
  const openBillRef = useRef<string | null>(null);

  // Total bila bill ditutup SEKARANG (diskon otomatis/promo jam dievaluasi saat ini).
  const {
    quote: closeQuote,
    loading: quoteLoading,
    error: quoteError,
  } = useCheckoutQuote(payingOpen && bill ? `/transactions/${bill.id}/quote` : null, {});

  async function loadAll() {
    if (!outlet) return;
    setLoading(true);
    setError(null);
    try {
      const [tables, bills, items, paymentChannels] = await Promise.all([
        apiClient.get<DiningTable[]>(`/tenant/outlets/${outlet.id}/tables`),
        apiClient.get<OpenBillTransaction[]>(`/transactions/open?outlet_id=${outlet.id}`),
        apiClient.get<CatalogItem[]>("/catalog/items"),
        apiClient.get<PaymentChannel[]>("/tenant/payment-channels"),
      ]);
      setTable(walkInBillId ? null : (tables.find((t) => t.id === tableId) ?? null));
      setBill(
        bills.find((b) => (walkInBillId ? b.id === walkInBillId : b.dining_table_id === tableId)) ?? null,
      );
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
    if (outlet) loadAll();
    else if (outletsLoaded) setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tableId, outlet?.id, outletsLoaded]);

  async function handleOpenBill() {
    if (!outlet || pending.length === 0) return;
    setSubmitting(true);
    setError(null);
    try {
      openBillRef.current ??= newClientRef();
      await apiClient.post("/transactions/open", {
        client_ref: openBillRef.current,
        outlet_id: outlet.id,
        dining_table_id: tableId,
        guest_count: guestCount ? Number(guestCount) : undefined,
        items: pending.map(toTransactionLine),
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
        items: pending.map(toTransactionLine),
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

  const billTotal = closeQuote ? Number(closeQuote.total) : bill ? Number(bill.total) : 0;
  const billDiscount = closeQuote ? Number(closeQuote.discount_total) : 0;
  const paidNumber = Number(amountPaid) || 0;
  const selectedChannel = channels.find((c) => c.id === channelId);
  const payCheck = checkPayments(
    billTotal,
    selectedChannel ? [{ channel_type: selectedChannel.channel_type, amount: paidNumber }] : [],
  );
  const change = payCheck.change;
  const payBlocker = quoteError ?? (paidNumber > 0 ? payCheck.error : null);
  const canPay =
    !submitting && !!channelId && !quoteLoading && !payBlocker && paidNumber > 0 && payCheck.remaining === 0;

  if (loading) return <p className="p-4 text-sm text-muted-foreground">Memuat...</p>;
  if (walkInBillId && !bill) {
    return <p className="p-4 text-sm text-muted-foreground">Order sudah dibayar/dibatalkan atau tidak ditemukan.</p>;
  }
  if (!walkInBillId && !table) return <p className="p-4 text-sm text-destructive">Meja tidak ditemukan.</p>;

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-5 p-4 sm:p-6">
      <PageHeader
        icon={LayoutGrid}
        title={table?.name ?? `Order ${bill?.transaction_number ?? ""}`}
        description={table ? (table.area ?? undefined) : "Order tanpa meja"}
        backHref="/tables"
        backLabel={table ? "Kembali ke Meja" : "Kembali ke Order"}
      />

      {error && <p className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</p>}

      {!bill ? (
        <div className="flex flex-1 flex-col gap-4 lg:flex-row">
          <div className="flex-1">
            <ProductGrid items={catalogItems} onAdd={handleAddPending} />
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
                    key={item.line_key}
                    item={item}
                    onIncrease={() => setPending((p) => setCartLineQuantity(p, item.line_key, item.quantity + 1))}
                    onDecrease={() => setPending((p) => setCartLineQuantity(p, item.line_key, item.quantity - 1))}
                    onRemove={() => setPending((p) => setCartLineQuantity(p, item.line_key, 0))}
                  />
                ))}
              </div>
            )}
            <div className="flex items-center justify-between border-t border-border pt-3 text-sm font-semibold">
              <span>Subtotal</span>
              <span>{formatCurrency(cartSubtotal(pending))}</span>
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
                <ProductGrid items={catalogItems} onAdd={handleAddPending} />
                {pending.length > 0 && (
                  <div className="flex flex-col divide-y divide-border border-t border-border">
                    {pending.map((item) => (
                      <CartItemRow
                        key={item.line_key}
                        item={item}
                        onIncrease={() => setPending((p) => setCartLineQuantity(p, item.line_key, item.quantity + 1))}
                        onDecrease={() => setPending((p) => setCartLineQuantity(p, item.line_key, item.quantity - 1))}
                        onRemove={() => setPending((p) => setCartLineQuantity(p, item.line_key, 0))}
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
            <div className="flex flex-col gap-2">
              <Button size="lg" onClick={() => setPayingOpen(true)}>
                Bayar
              </Button>
              {bill && permissions?.includes(PERMISSIONS.VOID_TRANSACTION) && (
                <>
                  <Button
                    variant="outline"
                    className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => setCancelOpen(true)}
                  >
                    Batalkan Bill
                  </Button>
                  <VoidDialog
                    open={cancelOpen}
                    transactionId={bill.id}
                    title={table ? "Batalkan bill meja ini?" : "Batalkan order ini?"}
                    description={
                      table
                        ? "Semua pesanan di bill ini dibatalkan, stoknya dikembalikan, dan meja kembali tersedia."
                        : "Semua pesanan di order ini dibatalkan dan stoknya dikembalikan."
                    }
                    confirmLabel="Batalkan Bill"
                    onClose={() => setCancelOpen(false)}
                    onVoided={() => {
                      toast.success(table ? `Bill ${table.name} dibatalkan.` : "Bill dibatalkan.");
                      router.replace("/tables");
                    }}
                  />
                </>
              )}
            </div>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>Pembayaran</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <div className="flex flex-col gap-1 text-sm">
                  {billDiscount > 0 && (
                    <div className="flex justify-between text-muted-foreground">
                      <span>Diskon</span>
                      <span className="tabular-nums">− {formatCurrency(billDiscount)}</span>
                    </div>
                  )}
                  <div className="flex justify-between font-semibold">
                    <span>Total Bayar</span>
                    <span className="tabular-nums">{quoteLoading ? "Menghitung…" : formatCurrency(billTotal)}</span>
                  </div>
                </div>
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
                  <MoneyInput
                    id="amount"
                    value={Number(amountPaid) || 0}
                    onValueChange={(v) => setAmountPaid(v ? String(v) : "")}
                    placeholder={billTotal.toLocaleString("id-ID")}
                  />
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Kembalian</span>
                  <span className="font-semibold">{formatCurrency(change)}</span>
                </div>
                {payBlocker && (
                  <p className="rounded-lg bg-warning/10 px-3 py-2 text-sm text-warning">
                    {payBlocker}
                  </p>
                )}
                <div className="flex gap-2">
                  <Button size="lg" className="flex-1" disabled={!canPay} onClick={handleClose}>
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
      <ItemOptionsModal
        item={optionsItem}
        onClose={() => setOptionsItem(null)}
        onAdd={(line) => {
          setPending((p) => addCartLine(p, line));
          setOptionsItem(null);
        }}
      />
    </div>
  );
}
