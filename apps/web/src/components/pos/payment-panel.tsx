"use client";

import { useState } from "react";
import { Plus, Trash2, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MoneyInput } from "@/components/ui/money-input";
import { cn } from "@/lib/utils";
import { CHANNEL_ICONS } from "@/lib/payment-channels";
import { formatCurrency } from "@/lib/format";
import { checkPayments } from "@/lib/payment-rules";
import { suggestCashAmounts } from "@/lib/quick-cash";
import { previewRounding, previewTaxes } from "@/lib/pos-pricing";
import { useCartStore } from "@/lib/stores/cart-store";
import type { CheckoutQuote, PaymentChannel, RoundingMode, Tax } from "@/lib/types";

const CHANNEL_COLORS: Record<string, string> = {
  cash: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400",
  qris: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400",
  e_wallet: "bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-400",
  bank_transfer: "bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-400",
  debit: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  credit: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
};

export function PaymentPanel({
  subtotal,
  taxes,
  rounding,
  quote,
  quoteLoading,
  quoteError,
  channels,
  kasbonEnabled,
  onOpenVoucher,
  onSubmit,
  submitting,
  error,
}: {
  subtotal: number;
  taxes: Tax[];
  rounding: RoundingMode;
  quote: CheckoutQuote | null;
  quoteLoading: boolean;
  quoteError: string | null;
  channels: PaymentChannel[];
  kasbonEnabled: boolean;
  onOpenVoucher: () => void;
  onSubmit: (action: "save" | "print" | "wa") => void;
  submitting: boolean;
  error: string | null;
}) {
  const customer = useCartStore((s) => s.customer);
  const voucherCode = useCartStore((s) => s.voucherCode);
  const payments = useCartStore((s) => s.payments);
  const addPayment = useCartStore((s) => s.addPayment);
  const addKasbon = useCartStore((s) => s.addKasbon);
  const updatePaymentAmount = useCartStore((s) => s.updatePaymentAmount);
  const removePayment = useCartStore((s) => s.removePayment);

  const [pickerOpen, setPickerOpen] = useState(false);

  // Angka final dari quote server (diskon otomatis, voucher, pajak, pembulatan);
  // pratinjau lokal hanya pengisi sementara selama quote dimuat.
  const preview = previewTaxes(subtotal, taxes);
  const { total: previewTotal } = previewRounding(subtotal + preview.taxTotal + preview.serviceChargeTotal, rounding);
  const totalFinal = quote ? Number(quote.total) : previewTotal;
  const discountTotal = quote ? Number(quote.discount_total) : 0;
  const taxDisplay = quote
    ? Number(quote.tax_total) + Number(quote.service_charge_total)
    : preview.taxTotal + preview.serviceChargeTotal;
  const discountNames = quote
    ? [...quote.discounts.map((d) => d.name), ...(quote.voucher ? [`Voucher ${quote.voucher.code}`] : [])].join(", ")
    : "";

  const check = checkPayments(totalFinal, payments);
  const totalDibayar = check.covered;
  const kembalian = check.change;
  const remaining = check.remaining;
  const blockingError = quoteError ?? (payments.length > 0 ? check.error : null);

  const canSubmit =
    payments.length > 0 && remaining === 0 && !blockingError && !quoteLoading && !submitting;

  const cashChannel = channels.find((c) => c.channel_type === "cash");
  const otherChannels = channels.filter((c) => c.channel_type !== "cash");

  // Nominal cepat mengisi baris tunai — atau membuatnya bila belum ada metode
  // apa pun: uang pas + pecahan yang lazim diberikan pembeli. Kasbon harus pas
  // sebesar sisa tagihan, jadi saat ada kasbon hanya uang pas yang ditawarkan.
  const cashPayment = payments.find((p) => p.channel_type === "cash" && !p.is_receivable);
  const paidByOthers = payments.reduce((sum, p) => (p === cashPayment ? sum : sum + p.amount), 0);
  const cashDue = Math.max(0, totalFinal - paidByOthers);
  const hasKasbon = payments.some((p) => p.is_receivable);
  const quickCash =
    cashChannel && cashDue > 0 && (payments.length === 0 || cashPayment)
      ? [cashDue, ...(hasKasbon ? [] : suggestCashAmounts(cashDue))]
      : [];

  function handleQuickCash(amount: number) {
    if (cashPayment) updatePaymentAmount(cashPayment.key, amount);
    else if (cashChannel) addPayment(cashChannel, amount);
  }

  function handleAddChannel(channel: PaymentChannel) {
    addPayment(channel, remaining);
    setPickerOpen(false);
  }

  function handleAddKasbon() {
    const kasbonChannel = cashChannel ?? channels[0];
    if (!kasbonChannel) return;
    addKasbon(kasbonChannel, remaining);
    setPickerOpen(false);
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="rounded-xl bg-success/10 px-4 py-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-success">Total Akhir</span>
          <span className="text-xl font-bold tabular-nums text-success">
            {formatCurrency(totalFinal)}
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-1.5 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Subtotal</span>
          <span className="tabular-nums">{formatCurrency(subtotal)}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            Diskon
            <button
              type="button"
              onClick={onOpenVoucher}
              className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary hover:bg-primary/20"
            >
              {voucherCode ? voucherCode : "+ Tambah"}
            </button>
          </span>
          {quote ? (
            <span className="tabular-nums" title={discountNames || undefined}>
              {discountTotal > 0 ? `− ${formatCurrency(discountTotal)}` : formatCurrency(0)}
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">{quoteLoading ? "Menghitung…" : "Dihitung saat simpan"}</span>
          )}
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Pajak</span>
          <span className="tabular-nums">{formatCurrency(taxDisplay)}</span>
        </div>
        <div className="flex justify-between border-t border-border pt-1.5 text-base font-semibold">
          <span>Total</span>
          <span className="tabular-nums">{formatCurrency(totalFinal)}</span>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium">Metode Pembayaran</p>
        </div>

        {payments.length === 0 && subtotal === 0 && (
          <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
            Tambahkan produk ke keranjang dulu.
          </p>
        )}

        {payments.map((p) => {
          const Icon = CHANNEL_ICONS[p.channel_type] ?? Wallet;
          return (
            <div key={p.key} className="flex items-center gap-2 rounded-lg border border-border px-3 py-2">
              <span
                className={cn(
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
                  p.is_receivable
                    ? "bg-warning/10 text-warning"
                    : (CHANNEL_COLORS[p.channel_type] ?? "bg-muted text-muted-foreground"),
                )}
              >
                <Icon className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{p.name}</p>
                <p className="text-xs text-muted-foreground">{p.is_receivable ? "Sisa Tagihan" : "Diterima"}</p>
              </div>
              <MoneyInput
                value={p.amount}
                onValueChange={(amount) => updatePaymentAmount(p.key, amount)}
                aria-label={`Nominal ${p.name}`}
                className="h-9 w-28 text-right tabular-nums"
                placeholder="0"
              />
              <button
                type="button"
                onClick={() => removePayment(p.key)}
                aria-label={`Hapus pembayaran ${p.name}`}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          );
        })}

        {quickCash.length > 0 && (
          <div className="flex flex-col gap-1.5">
            {!cashPayment && <p className="text-xs font-medium text-muted-foreground">Tunai — uang diterima</p>}
            <div className="grid grid-cols-3 gap-2">
              {quickCash.map((amount, i) => {
                const selected = cashPayment?.amount === amount;
                return (
                  <button
                    key={amount}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => handleQuickCash(amount)}
                    className={cn(
                      "h-10 rounded-lg border px-2 text-sm font-medium tabular-nums transition-colors",
                      selected ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-accent",
                    )}
                  >
                    {i === 0 ? "Uang Pas" : formatCurrency(amount)}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {payments.length === 0 && subtotal > 0 && (otherChannels.length > 0 || kasbonEnabled) && (
          <div className="flex flex-col gap-1.5">
            <p className="text-xs font-medium text-muted-foreground">Metode lain</p>
            <div className="flex flex-wrap gap-2">
              {otherChannels.map((c) => {
                const Icon = CHANNEL_ICONS[c.channel_type] ?? Wallet;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => handleAddChannel(c)}
                    className="flex h-10 items-center gap-2 rounded-lg border border-border px-3 text-sm font-medium transition-colors hover:bg-accent"
                  >
                    <Icon className="h-4 w-4 text-muted-foreground" />
                    {c.name}
                  </button>
                );
              })}
              {kasbonEnabled && (
                <button
                  type="button"
                  disabled={!customer}
                  title={!customer ? "Pilih pelanggan terlebih dahulu" : undefined}
                  onClick={handleAddKasbon}
                  className="flex h-10 items-center gap-2 rounded-lg border border-border px-3 text-sm font-medium transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Wallet className="h-4 w-4 text-warning" />
                  Kasbon
                </button>
              )}
            </div>
          </div>
        )}

        {payments.length > 0 && (
          <div className="relative">
            <button
              type="button"
              onClick={() => setPickerOpen((v) => !v)}
              className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-border py-2 text-sm font-medium text-primary hover:bg-primary/5"
            >
              <Plus className="h-4 w-4" />
              Tambah metode pembayaran
            </button>
            {pickerOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setPickerOpen(false)} />
                <div className="absolute bottom-full left-0 z-50 mb-2 w-full rounded-lg border border-border bg-card p-1.5 shadow-lg">
                  {channels.map((c) => {
                    const Icon = CHANNEL_ICONS[c.channel_type] ?? Wallet;
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => handleAddChannel(c)}
                        className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm hover:bg-accent"
                      >
                        <Icon className="h-4 w-4 text-muted-foreground" />
                        {c.name}
                      </button>
                    );
                  })}
                  {kasbonEnabled && (
                    <button
                      type="button"
                      disabled={!customer}
                      title={!customer ? "Pilih pelanggan terlebih dahulu" : undefined}
                      onClick={handleAddKasbon}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm",
                        customer ? "hover:bg-accent" : "cursor-not-allowed opacity-50",
                      )}
                    >
                      <Wallet className="h-4 w-4 text-warning" />
                      Kasbon / Piutang
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-1.5 border-t border-border pt-3 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Total Dibayar</span>
          <span className="font-semibold tabular-nums">{formatCurrency(totalDibayar)}</span>
        </div>
        <div className="flex min-h-7 items-center justify-between">
          <span className="text-muted-foreground">Kembalian</span>
          <span
            className={cn(
              "font-semibold tabular-nums",
              kembalian > 0 && "text-xl font-bold text-success",
            )}
          >
            {formatCurrency(kembalian)}
          </span>
        </div>
      </div>

      {blockingError && (
        <p className="rounded-lg bg-warning/10 px-3 py-2 text-sm text-warning">
          {blockingError}
        </p>
      )}
      {error && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}

      <Button size="lg" disabled={!canSubmit} onClick={() => onSubmit("save")}>
        {submitting ? "Memproses..." : "Simpan Transaksi"}
        {!submitting && <span className="ml-1 text-xs opacity-70">F9</span>}
      </Button>
      <div className="flex gap-2">
        <Button variant="outline" className="flex-1" disabled={!canSubmit} onClick={() => onSubmit("print")}>
          Simpan &amp; Cetak
        </Button>
        <Button variant="outline" className="flex-1" disabled={!canSubmit} onClick={() => onSubmit("wa")}>
          Simpan &amp; WA
        </Button>
      </div>
    </div>
  );
}
