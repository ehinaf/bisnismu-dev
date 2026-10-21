"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, ShoppingCart } from "lucide-react";
import { ProductGrid } from "@/components/product-grid";
import { Modal } from "@/components/ui/modal";
import { PosToolbar } from "@/components/pos/pos-toolbar";
import { CategoryChips, CategorySidebar } from "@/components/pos/category-sidebar";
import { PosCart } from "@/components/pos/pos-cart";
import { PaymentPanel } from "@/components/pos/payment-panel";
import { PosActionBar } from "@/components/pos/pos-action-bar";
import { CustomerPickerModal } from "@/components/pos/customer-picker-modal";
import { TablePickerModal } from "@/components/pos/table-picker-modal";
import { VoucherModal } from "@/components/pos/voucher-modal";
import { apiClient, ApiError } from "@/lib/api-client";
import { formatCurrency } from "@/lib/format";
import { usePosHotkeys } from "@/lib/hooks/use-pos-hotkeys";
import { useCheckoutQuote } from "@/lib/hooks/use-checkout-quote";
import { useCashdrawer } from "@/lib/hooks/use-cashdrawer";
import { useOpenOrdersCount } from "@/lib/hooks/use-open-orders-count";
import { useOutletStore } from "@/lib/stores/outlet-store";
import { cartSubtotal, useCartStore } from "@/lib/stores/cart-store";
import { toast } from "@/lib/stores/toast-store";
import type { BusinessSettings, CatalogItem, Category, PaymentChannel, Tax } from "@/lib/types";

const PAGE_SIZE = 24;

interface CreateTransactionResponse {
  transaction: { id: string };
  receipt_url: string;
}

export default function TransactionsPage() {
  const router = useRouter();
  const activeOutletId = useOutletStore((s) => s.activeOutletId);
  const { session: drawerSession } = useCashdrawer();
  const { refresh: refreshOpenOrders } = useOpenOrdersCount();

  const items = useCartStore((s) => s.items);
  const addItem = useCartStore((s) => s.addItem);
  const customer = useCartStore((s) => s.customer);
  const table = useCartStore((s) => s.table);
  const orderNotes = useCartStore((s) => s.orderNotes);
  const voucherCode = useCartStore((s) => s.voucherCode);
  const payments = useCartStore((s) => s.payments);
  const clearAll = useCartStore((s) => s.clearAll);
  const ensureClientRef = useCartStore((s) => s.ensureClientRef);

  const [catalogItems, setCatalogItems] = useState<CatalogItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [channels, setChannels] = useState<PaymentChannel[]>([]);
  const [settings, setSettings] = useState<BusinessSettings | null>(null);
  const [taxes, setTaxes] = useState<Tax[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [query, setQuery] = useState("");
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const [customerModalOpen, setCustomerModalOpen] = useState(false);
  const [tableModalOpen, setTableModalOpen] = useState(false);
  const [voucherModalOpen, setVoucherModalOpen] = useState(false);
  const [mobileCartOpen, setMobileCartOpen] = useState(false);
  const [taxPopoverOpen, setTaxPopoverOpen] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [holding, setHolding] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      apiClient.get<CatalogItem[]>("/catalog/items"),
      apiClient.get<Category[]>("/catalog/categories"),
      apiClient.get<PaymentChannel[]>("/tenant/payment-channels"),
      apiClient.get<BusinessSettings>("/tenant/settings"),
      apiClient.get<Tax[]>("/tenant/taxes"),
    ])
      .then(([itemsRes, categoriesRes, channelsRes, settingsRes, taxesRes]) => {
        setCatalogItems(itemsRes);
        setCategories(categoriesRes);
        setChannels(channelsRes);
        setSettings(settingsRes);
        setTaxes(taxesRes);
      })
      .catch((err) => setLoadError(err instanceof ApiError ? err.message : "Gagal memuat data kasir."))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return catalogItems.filter((i) => {
      if (activeCategoryId && i.category_id !== activeCategoryId) return false;
      if (!q) return true;
      return (
        i.name.toLowerCase().includes(q) ||
        (i.sku ?? "").toLowerCase().includes(q) ||
        (i.barcode ?? "").toLowerCase().includes(q)
      );
    });
  }, [catalogItems, query, activeCategoryId]);

  const visibleItems = filtered.slice(0, visibleCount);
  const subtotal = cartSubtotal(items);

  // Total final (diskon otomatis, voucher, pajak, pembulatan) dihitung server
  // dengan aturan yang sama seperti saat simpan — ditampilkan sebelum bayar.
  const quoteBody = useMemo(
    () =>
      activeOutletId && items.length > 0
        ? {
            outlet_id: activeOutletId,
            customer_id: customer?.id,
            voucher_code: voucherCode ?? undefined,
            items: items.map((i) => ({ item_id: i.item_id, quantity: i.quantity })),
          }
        : null,
    [activeOutletId, items, customer, voucherCode],
  );
  const {
    quote,
    loading: quoteLoading,
    error: quoteError,
  } = useCheckoutQuote(quoteBody ? "/transactions/quote" : null, quoteBody);

  function handleAdd(item: CatalogItem) {
    addItem({ id: item.id, name: item.name, base_price: item.base_price });
  }

  // Enter di kolom cari: barcode/SKU persis → tambah; satu-satunya produk yang
  // tampil → tambah juga. false = tidak ada yang cocok (teks dipilih ulang).
  function handleSearchSubmit(): boolean {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    const exact = catalogItems.find((i) => i.sku?.toLowerCase() === q || i.barcode?.toLowerCase() === q);
    const match = exact ?? (filtered.length === 1 ? filtered[0] : null);
    if (match) {
      handleAdd(match);
      setQuery("");
      return true;
    }
    if (filtered.length === 0) {
      toast.error(`Produk "${query.trim()}" tidak ditemukan.`);
      return false;
    }
    toast.info(`${filtered.length} produk cocok — pilih salah satu dari daftar.`);
    return true;
  }

  const canTransact = items.length > 0 && !!activeOutletId;

  async function handleHoldOrder() {
    if (!activeOutletId || items.length === 0) return;
    setHolding(true);
    setSubmitError(null);
    try {
      await apiClient.post("/transactions/open", {
        client_ref: ensureClientRef("hold"),
        outlet_id: activeOutletId,
        customer_id: customer?.id,
        dining_table_id: table?.id,
        notes: orderNotes.trim() || undefined,
        items: items.map((i) => ({ item_id: i.item_id, quantity: i.quantity })),
      });
      const label = table ? `Order ${table.name}` : "Order";
      clearAll();
      await refreshOpenOrders();
      toast.success(`${label} ditahan — lanjutkan dari menu Meja / Order.`);
    } catch (err) {
      // Toast, bukan error di panel bayar: di ponsel panel itu tertutup saat F8/Hold ditekan.
      toast.error(err instanceof ApiError ? err.message : "Gagal menahan order.");
    } finally {
      setHolding(false);
    }
  }

  const handleSubmit = useCallback(
    async (action: "save" | "print" | "wa") => {
      if (!activeOutletId || items.length === 0) return;
      if (payments.length === 0) {
        // Hanya bisa terjadi lewat F9 — tombol Simpan nonaktif tanpa metode bayar.
        toast.info("Pilih metode pembayaran dulu.");
        return;
      }
      setSubmitting(true);
      setSubmitError(null);
      try {
        const result = await apiClient.post<CreateTransactionResponse>("/transactions", {
          // Sama untuk setiap retry percobaan ini → server tidak membuat transaksi ganda.
          client_ref: ensureClientRef("sale"),
          outlet_id: activeOutletId,
          customer_id: customer?.id,
          dining_table_id: table?.id,
          notes: orderNotes.trim() || undefined,
          voucher_code: voucherCode ?? undefined,
          items: items.map((i) => ({ item_id: i.item_id, quantity: i.quantity })),
          payments: payments.map((p) => ({
            payment_channel_id: p.payment_channel_id,
            amount: p.amount,
            is_receivable: p.is_receivable,
          })),
        });
        clearAll();
        await refreshOpenOrders();
        const suffix = action === "print" ? "?print=1" : action === "wa" ? "?share=wa" : "";
        router.push(`/receipt/${result.transaction.id}${suffix}`);
      } catch (err) {
        setSubmitError(err instanceof ApiError ? err.message : "Gagal menyimpan transaksi.");
      } finally {
        setSubmitting(false);
      }
    },
    [
      activeOutletId,
      items,
      payments,
      customer,
      table,
      orderNotes,
      voucherCode,
      clearAll,
      ensureClientRef,
      refreshOpenOrders,
      router,
    ],
  );

  usePosHotkeys({
    enabled: !customerModalOpen && !tableModalOpen && !voucherModalOpen,
    onVoucher: () => setVoucherModalOpen(true),
    onTax: () => setTaxPopoverOpen((v) => !v),
    onHoldOrder: handleHoldOrder,
    onSubmit: () => void handleSubmit("save"),
  });

  if (loadError) {
    return <p className="p-4 text-sm text-destructive">{loadError}</p>;
  }

  return (
    // pb-20 menyisakan ruang untuk bar "Bayar" yang menempel di bawah layar ponsel.
    <div className="flex flex-1 flex-col pb-20 lg:pb-0">
      {!drawerSession && (
        <div className="no-print flex items-center gap-2 bg-warning/10 px-4 py-2 text-xs text-warning">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          Laci belum dibuka — transaksi tetap bisa disimpan, tapi buka shift dari sidebar untuk pelacakan kas yang akurat.
        </div>
      )}

      <PosToolbar
        query={query}
        onQueryChange={setQuery}
        onSubmitQuery={handleSearchSubmit}
        onOpenCustomer={() => setCustomerModalOpen(true)}
        onOpenTable={() => setTableModalOpen(true)}
      />

      <CategoryChips categories={categories} activeCategoryId={activeCategoryId} onSelect={setActiveCategoryId} />

      <div className="flex flex-1">
        <CategorySidebar categories={categories} activeCategoryId={activeCategoryId} onSelect={setActiveCategoryId} />

        <div className="min-w-0 flex-1 p-4">
          <ProductGrid items={visibleItems} onAdd={handleAdd} loading={loading} />
          {!loading && visibleCount < filtered.length && (
            <button
              type="button"
              onClick={() => setVisibleCount((v) => v + PAGE_SIZE)}
              className="mx-auto mt-4 block rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-accent"
            >
              Tampilkan lebih banyak
            </button>
          )}
        </div>

        {/* Kolom kanan — desktop */}
        <div className="hidden w-[380px] shrink-0 flex-col border-l border-border bg-card lg:flex">
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
            <PosCart />
            <PaymentPanel
              subtotal={subtotal}
              taxes={taxes}
              rounding={settings?.rounding ?? "none"}
              quote={quote}
              quoteLoading={quoteLoading}
              quoteError={quoteError}
              channels={channels}
              kasbonEnabled={!!settings?.enable_kasbon}
              onOpenVoucher={() => setVoucherModalOpen(true)}
              onSubmit={handleSubmit}
              submitting={submitting}
              error={submitError}
            />
          </div>
        </div>
      </div>

      <PosActionBar
        taxes={taxes}
        taxPopoverOpen={taxPopoverOpen}
        onTaxPopoverChange={setTaxPopoverOpen}
        onOpenVoucher={() => setVoucherModalOpen(true)}
        onHoldOrder={handleHoldOrder}
        holding={holding}
      />

      {/* Tombol Bayar — mobile */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card/95 p-3 backdrop-blur lg:hidden">
        <button
          type="button"
          disabled={!canTransact}
          onClick={() => setMobileCartOpen(true)}
          className="flex w-full items-center justify-between rounded-lg bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-50"
        >
          <span className="flex items-center gap-2">
            <ShoppingCart className="h-4 w-4" />
            {items.length > 0 ? `${items.length} item` : "Keranjang kosong"}
          </span>
          <span className="tabular-nums">{formatCurrency(quote ? Number(quote.total) : subtotal)}</span>
        </button>
      </div>

      {/* Keranjang + bayar — ponsel/tablet kecil (bottom sheet dari Modal: focus trap, Escape, kunci scroll) */}
      <Modal
        open={mobileCartOpen}
        onClose={() => setMobileCartOpen(false)}
        title="Keranjang & Pembayaran"
        className="max-h-[92dvh]"
        bodyClassName="p-0"
      >
        <PosCart />
        <PaymentPanel
          subtotal={subtotal}
          taxes={taxes}
          rounding={settings?.rounding ?? "none"}
          quote={quote}
          quoteLoading={quoteLoading}
          quoteError={quoteError}
          channels={channels}
          kasbonEnabled={!!settings?.enable_kasbon}
          onOpenVoucher={() => setVoucherModalOpen(true)}
          onSubmit={handleSubmit}
          submitting={submitting}
          error={submitError}
        />
      </Modal>

      <CustomerPickerModal open={customerModalOpen} onClose={() => setCustomerModalOpen(false)} />
      <TablePickerModal open={tableModalOpen} onClose={() => setTableModalOpen(false)} />
      <VoucherModal open={voucherModalOpen} onClose={() => setVoucherModalOpen(false)} />
    </div>
  );
}
