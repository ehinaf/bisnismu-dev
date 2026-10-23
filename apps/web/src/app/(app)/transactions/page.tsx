"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { PauseCircle, ShoppingCart, Wallet } from "lucide-react";
import { ProductGrid } from "@/components/product-grid";
import { Modal } from "@/components/ui/modal";
import { Kbd } from "@/components/ui/kbd";
import { PosToolbar } from "@/components/pos/pos-toolbar";
import { CategoryChips } from "@/components/pos/category-chips";
import { OpenShiftDialog } from "@/components/shell/shift-dialogs";
import { PosCart } from "@/components/pos/pos-cart";
import { PaymentPanel } from "@/components/pos/payment-panel";
import { PosActionBar } from "@/components/pos/pos-action-bar";
import { CustomerPickerModal } from "@/components/pos/customer-picker-modal";
import { TablePickerModal } from "@/components/pos/table-picker-modal";
import { VoucherModal } from "@/components/pos/voucher-modal";
import { ItemOptionsModal, needsOptions } from "@/components/pos/item-options-modal";
import { apiClient, ApiError } from "@/lib/api-client";
import { formatCurrency } from "@/lib/format";
import { usePosHotkeys } from "@/lib/hooks/use-pos-hotkeys";
import { useCheckoutQuote } from "@/lib/hooks/use-checkout-quote";
import { useCashdrawer } from "@/lib/hooks/use-cashdrawer";
import { useOpenOrdersCount } from "@/lib/hooks/use-open-orders-count";
import { useOutletStore } from "@/lib/stores/outlet-store";
import { cartSubtotal, useCartStore } from "@/lib/stores/cart-store";
import { toTransactionLine } from "@/lib/cart-lines";
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
  const addLine = useCartStore((s) => s.addLine);
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
  const [shiftDialogOpen, setShiftDialogOpen] = useState(false);
  // Alur dua langkah ala Square: keranjang → panel Bayar (metode, kembalian, Simpan).
  const [payOpen, setPayOpen] = useState(false);
  const [voucherModalOpen, setVoucherModalOpen] = useState(false);
  const [mobileCartOpen, setMobileCartOpen] = useState(false);
  const [optionsItem, setOptionsItem] = useState<CatalogItem | null>(null);
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
        (i.barcode ?? "").toLowerCase().includes(q) ||
        i.variant_barcodes.some((v) => v.barcode.toLowerCase().includes(q))
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
            items: items.map(toTransactionLine),
          }
        : null,
    [activeOutletId, items, customer, voucherCode],
  );
  const {
    quote,
    loading: quoteLoading,
    error: quoteError,
  } = useCheckoutQuote(quoteBody ? "/transactions/quote" : null, quoteBody);

  // Item bervarian / bermodifier / harga bebas → pemilih opsi dulu; lainnya langsung masuk.
  function handleAdd(item: CatalogItem) {
    if (needsOptions(item)) setOptionsItem(item);
    else addLine({ item_id: item.id, name: item.name, unit_price: Number(item.base_price) });
  }

  // Enter di kolom cari: barcode/SKU persis → tambah; satu-satunya produk yang
  // tampil → tambah juga. false = tidak ada yang cocok (teks dipilih ulang).
  function handleSearchSubmit(): boolean {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    // Barcode varian → langsung varian itu (kecuali masih ada modifier yang harus dipilih).
    for (const item of catalogItems) {
      const variant = item.variant_barcodes.find((v) => v.barcode.toLowerCase() === q);
      if (!variant) continue;
      if (item.modifier_group_count > 0 || item.pricing_type === "open") setOptionsItem(item);
      else {
        addLine({
          item_id: item.id,
          name: item.name,
          unit_price: Number(item.base_price) + Number(variant.price_adjustment),
          variant_id: variant.id,
          variant_name: variant.name,
        });
      }
      setQuery("");
      return true;
    }
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
        items: items.map(toTransactionLine),
      });
      const label = table ? `Order ${table.name}` : "Order";
      clearAll();
      await refreshOpenOrders();
      toast.success(`${label} ditahan — lanjutkan dari menu ${settings?.enable_tables ? "Meja / Order" : "Hold Order"}.`);
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
      // Baris Rp 0 wajar sebagai keadaan sementara (mis. metode kedua ditambah
      // setelah tagihan tertutup) — tidak dikirim, server menolak nominal 0.
      const filledPayments = payments.filter((p) => p.amount > 0);
      if (filledPayments.length === 0) {
        // Hanya bisa terjadi lewat F9 — tombol Simpan nonaktif selama tagihan belum tertutup.
        toast.info(payments.length === 0 ? "Pilih metode pembayaran dulu." : "Isi nominal pembayaran dulu.");
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
          items: items.map(toTransactionLine),
          payments: filledPayments.map((p) => ({
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
    enabled: !customerModalOpen && !tableModalOpen && !voucherModalOpen && !optionsItem,
    onVoucher: () => setVoucherModalOpen(true),
    onTax: () => setTaxPopoverOpen((v) => !v),
    onHoldOrder: handleHoldOrder,
    // F9: buka panel Bayar; di dalam panel Bayar, F9 menyimpan transaksi.
    onSubmit: () => {
      if (payOpen) void handleSubmit("save");
      else if (items.length > 0) setPayOpen(true);
    },
  });

  const paymentProps = {
    subtotal,
    taxes,
    rounding: settings?.rounding ?? "none",
    quote,
    quoteLoading,
    quoteError,
    channels,
    kasbonEnabled: !!settings?.enable_kasbon,
    onOpenVoucher: () => setVoucherModalOpen(true),
    onSubmit: handleSubmit,
    submitting,
    error: submitError,
  } as const;
  const totalForButton = quote ? Number(quote.total) : subtotal;
  // Sama dengan judul "Keranjang (n)": jumlah barang, bukan jumlah baris.
  const itemCount = items.reduce((n, i) => n + i.quantity, 0);

  if (loadError) {
    return <p className="p-4 text-sm text-destructive">{loadError}</p>;
  }

  return (
    // pb-20 menyisakan ruang untuk bar "Bayar" yang menempel di bawah layar ponsel.
    // Desktop: tinggi layar dikunci (di bawah topbar 3.5rem) supaya grid produk dan
    // keranjang menggulung sendiri-sendiri — grid tidak hilang saat keranjang panjang.
    <div className="flex flex-1 flex-col pb-20 lg:h-[calc(100dvh-3.5rem)] lg:flex-none lg:overflow-hidden lg:pb-0">
      {!drawerSession && (
        <div className="no-print flex items-center gap-3 border-b border-warning/20 bg-warning/10 px-4 py-2 text-sm text-warning">
          <Wallet className="h-4 w-4 shrink-0" />
          <span className="flex-1">Laci belum dibuka — uang tunai belum tercatat ke laci.</span>
          <button
            type="button"
            onClick={() => setShiftDialogOpen(true)}
            className="shrink-0 rounded-md border border-warning/40 px-3 py-1 text-sm font-medium hover:bg-warning/10"
          >
            Buka Shift
          </button>
        </div>
      )}

      <PosToolbar
        query={query}
        onQueryChange={setQuery}
        onSubmitQuery={handleSearchSubmit}
        onOpenCustomer={() => setCustomerModalOpen(true)}
        onOpenTable={settings?.enable_tables ? () => setTableModalOpen(true) : undefined}
      />

      <CategoryChips categories={categories} activeCategoryId={activeCategoryId} onSelect={setActiveCategoryId} />

      <div className="flex min-h-0 flex-1">
        <div className="min-w-0 flex-1 px-4 pb-4 pt-3 lg:overflow-y-auto">
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

        {/* Kolom kanan — desktop: keranjang + ringkasan, tombol Bayar selalu di dasar */}
        <div className="hidden w-[340px] shrink-0 flex-col border-l border-border bg-card lg:flex xl:w-[380px]">
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
            <PosCart />
            <PaymentPanel section="summary" {...paymentProps} />
          </div>
          <div className="shrink-0 border-t border-border p-4">
            <PayButton total={totalForButton} disabled={!canTransact} onClick={() => setPayOpen(true)} />
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
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card p-3 lg:hidden">
        <button
          type="button"
          disabled={!canTransact}
          onClick={() => setMobileCartOpen(true)}
          className="flex w-full items-center justify-between rounded-lg bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-50"
        >
          <span className="flex items-center gap-2">
            <ShoppingCart className="h-4 w-4" />
            {itemCount > 0 ? `${itemCount} barang` : "Keranjang kosong"}
          </span>
          <span className="tabular-nums">{formatCurrency(totalForButton)}</span>
        </button>
      </div>

      {/* Keranjang + bayar — ponsel/tablet kecil (bottom sheet dari Modal: focus trap, Escape, kunci scroll) */}
      <Modal
        open={mobileCartOpen}
        onClose={() => setMobileCartOpen(false)}
        title="Keranjang"
        className="max-h-[92dvh]"
        bodyClassName="p-0"
      >
        <PosCart />
        <PaymentPanel section="summary" {...paymentProps} />
        <div className="px-4 pb-2">
          <PayButton
            total={totalForButton}
            disabled={!canTransact}
            onClick={() => {
              setMobileCartOpen(false);
              setPayOpen(true);
            }}
          />
        </div>
        {/* Ponsel: bar aksi bawah disembunyikan — Hold Order dipindah ke sini (voucher ada di panel bayar). */}
        {items.length > 0 && (
          <div className="border-t border-border p-4">
            <button
              type="button"
              disabled={holding}
              onClick={() => {
                setMobileCartOpen(false);
                void handleHoldOrder();
              }}
              className="flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-border text-sm font-medium hover:bg-muted disabled:opacity-50"
            >
              <PauseCircle className="h-4 w-4" />
              {holding ? "Menahan..." : "Hold Order"}
            </button>
          </div>
        )}
      </Modal>
      <Modal open={payOpen} onClose={() => setPayOpen(false)} title="Pembayaran" className="sm:max-w-lg" bodyClassName="p-0">
        <PaymentPanel section="payment" {...paymentProps} />
      </Modal>
      <OpenShiftDialog open={shiftDialogOpen} onClose={() => setShiftDialogOpen(false)} />

      <CustomerPickerModal open={customerModalOpen} onClose={() => setCustomerModalOpen(false)} />
      <TablePickerModal open={tableModalOpen} onClose={() => setTableModalOpen(false)} />
      <VoucherModal open={voucherModalOpen} onClose={() => setVoucherModalOpen(false)} />
      <ItemOptionsModal
        item={optionsItem}
        onClose={() => setOptionsItem(null)}
        onAdd={(line) => {
          addLine(line);
          setOptionsItem(null);
        }}
      />
    </div>
  );
}

// Tombol utama kolom keranjang (ala "Charge" Square): total selalu terlihat.
function PayButton({ total, disabled, onClick }: { total: number; disabled: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="flex h-14 w-full items-center justify-between rounded-lg bg-primary px-5 text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
    >
      <span className="flex items-center gap-2 text-base font-semibold">
        Bayar
        <Kbd className="border-primary-foreground/30 bg-primary-foreground/10 text-primary-foreground">F9</Kbd>
      </span>
      <span className="text-xl font-bold">{formatCurrency(total)}</span>
    </button>
  );
}
