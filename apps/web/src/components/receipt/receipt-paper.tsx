import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { PublicReceipt } from "@/lib/types";

function negate(value: string): string {
  return value.startsWith("-") ? value.slice(1) : `-${value}`;
}

// Kertas struk — dipakai struk publik (/r/:token) dan struk cetak di aplikasi,
// jadi yang dicetak kasir sama persis dengan yang diterima pembeli via WhatsApp.
export function ReceiptPaper({ receipt, className }: { receipt: PublicReceipt; className?: string }) {
  const isRefund = receipt.transaction_type === "refund";
  const rows: Array<[string, string]> = [
    ["Subtotal", receipt.subtotal],
    // Diskon tampil sebagai potongan (tanda dibalik; di struk refund nilainya sudah negatif).
    ...(Number(receipt.discount_total) !== 0 ? [["Diskon", negate(receipt.discount_total)] as [string, string]] : []),
    ...(Number(receipt.tax_total) !== 0 ? [["Pajak", receipt.tax_total] as [string, string]] : []),
    ...(Number(receipt.service_charge_total) !== 0 ? [["Service charge", receipt.service_charge_total] as [string, string]] : []),
    ...(Number(receipt.delivery_fee) !== 0 ? [["Ongkir", receipt.delivery_fee] as [string, string]] : []),
    ...(Number(receipt.rounding_adjustment) !== 0 ? [["Pembulatan", receipt.rounding_adjustment] as [string, string]] : []),
  ];

  return (
    <article
      className={cn(
        "rounded-xl border border-border bg-card p-5 text-sm shadow-sm print:rounded-none print:border-0 print:p-0 print:shadow-none",
        className,
      )}
    >
      <header className="flex flex-col items-center gap-0.5 border-b border-dashed border-border pb-3 text-center">
        <h1 className="text-base font-semibold">{receipt.business_name}</h1>
        <p className="text-xs text-muted-foreground">{receipt.outlet.name}</p>
        {receipt.outlet.address && <p className="text-xs text-muted-foreground">{receipt.outlet.address}</p>}
        {receipt.outlet.phone && <p className="text-xs text-muted-foreground">{receipt.outlet.phone}</p>}
        {receipt.receipt_header && <p className="mt-1 whitespace-pre-line text-xs">{receipt.receipt_header}</p>}
      </header>

      <div className="flex flex-col gap-0.5 border-b border-dashed border-border py-3 text-xs">
        {isRefund && <p className="font-semibold">STRUK REFUND{receipt.reference_number && ` · untuk ${receipt.reference_number}`}</p>}
        {receipt.status === "void" && <p className="font-semibold text-destructive">DIBATALKAN</p>}
        {receipt.status === "refunded" && <p className="font-semibold">DIREFUND</p>}
        {receipt.status === "partially_refunded" && <p className="font-semibold">REFUND SEBAGIAN</p>}
        <p>{receipt.transaction_number}</p>
        <p className="text-muted-foreground">{new Date(receipt.date).toLocaleString("id-ID")}</p>
      </div>

      <ul className="flex flex-col gap-2 border-b border-dashed border-border py-3">
        {receipt.items.map((item, i) => (
          <li key={i}>
            <div className="flex justify-between gap-2">
              <span>
                {item.name}
                {item.variant && ` (${item.variant})`}
              </span>
              <span className="tabular-nums">{formatCurrency(item.subtotal)}</span>
            </div>
            <p className="text-xs text-muted-foreground">
              {item.quantity.replace(/^-/, "")} × {formatCurrency(item.unit_price)}
              {item.modifiers.length > 0 && ` · ${item.modifiers.join(", ")}`}
            </p>
          </li>
        ))}
      </ul>

      <dl className="flex flex-col gap-1 border-b border-dashed border-border py-3">
        {rows.map(([label, value]) => (
          <div key={label} className="flex justify-between text-muted-foreground">
            <dt>{label}</dt>
            <dd className="tabular-nums">{formatCurrency(value)}</dd>
          </div>
        ))}
        <div className="flex justify-between text-base font-semibold">
          <dt>Total</dt>
          <dd className="tabular-nums">{formatCurrency(receipt.total)}</dd>
        </div>
      </dl>

      <dl className="flex flex-col gap-1 py-3">
        {receipt.payments.map((p, i) => (
          <div key={i} className="flex justify-between">
            <dt className="text-muted-foreground">{p.method}</dt>
            <dd className="tabular-nums">{formatCurrency(p.amount)}</dd>
          </div>
        ))}
        {Number(receipt.change_due) > 0 && (
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Kembalian</dt>
            <dd className="tabular-nums">{formatCurrency(receipt.change_due)}</dd>
          </div>
        )}
      </dl>

      <footer className="border-t border-dashed border-border pt-3 text-center text-xs text-muted-foreground">
        {receipt.receipt_footer ? (
          <p className="whitespace-pre-line">{receipt.receipt_footer}</p>
        ) : (
          <p>Terima kasih atas kunjungan Anda</p>
        )}
      </footer>
    </article>  );
}
