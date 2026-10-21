import type { RoundingMode, Tax } from "@/lib/types";

// Pratinjau instan di client selama quote server (POST /transactions/quote —
// sumber angka final, termasuk diskon otomatis & voucher) belum datang.
// Aturan pembulatan sama dengan server (sales.pricing.ts roundMoney): setiap
// komponen dibulatkan ke rupiah penuh, half-up.

/** Subtotal satu baris keranjang, dibulatkan ke rupiah (mis. harga/kg × 0,333 kg). */
export function lineSubtotal(unitPrice: number, quantity: number): number {
  return Math.round(unitPrice * quantity);
}

export function previewTaxes(subtotal: number, taxes: Tax[]): { taxTotal: number; serviceChargeTotal: number } {
  let taxTotal = 0;
  let serviceChargeTotal = 0;
  for (const t of taxes) {
    // Tarif tersimpan 2 desimal → hitung dalam basis poin (bilangan bulat) supaya
    // kasus tepat .5 tidak meleset ke bawah karena galat float (mis. 0,7%).
    const rateBasisPoints = Math.round(Number(t.rate) * 100);
    const amount = Math.round((subtotal * rateBasisPoints) / 10000);
    if (t.tax_kind === "service_charge") serviceChargeTotal += amount;
    else taxTotal += amount;
  }
  return { taxTotal, serviceChargeTotal };
}

export function previewRounding(rawTotal: number, mode: RoundingMode): { total: number; adjustment: number } {
  const step =
    mode === "nearest_100" || mode === "up_100"
      ? 100
      : mode === "nearest_500" || mode === "up_500"
        ? 500
        : mode === "nearest_1000"
          ? 1000
          : null;

  if (!step) return { total: rawTotal, adjustment: 0 };

  const isUp = mode === "up_100" || mode === "up_500";
  const divided = rawTotal / step;
  const roundedSteps = isUp ? Math.ceil(divided) : Math.round(divided);
  const total = roundedSteps * step;
  return { total, adjustment: total - rawTotal };
}
