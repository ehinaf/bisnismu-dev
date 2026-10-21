import { Prisma, rounding_mode } from "@bisnismu/db";

/** Rupiah tidak memakai sen — setiap komponen uang dibulatkan ke rupiah penuh. */
export const MONEY_SCALE = 0;

/**
 * Bulatkan satu komponen uang (subtotal baris, diskon, pajak, service charge)
 * ke rupiah penuh, half-up. Dibulatkan PER KOMPONEN supaya total = jumlah angka
 * yang tercetak di struk, dan sama persis dengan pratinjau di layar kasir
 * (apps/web/src/lib/pos-pricing.ts memakai aturan yang sama).
 */
export function roundMoney(value: Prisma.Decimal): Prisma.Decimal {
  return value.toDecimalPlaces(MONEY_SCALE, Prisma.Decimal.ROUND_HALF_UP);
}

/**
 * Menghitung TOTAL setelah pembulatan sesuai business_settings.rounding, dan
 * mengembalikan besaran adjustment-nya secara terpisah (schema menyimpan
 * `total` = angka final, `rounding_adjustment` = selisihnya).
 */
export function applyRounding(
  rawTotal: Prisma.Decimal,
  mode: rounding_mode,
): { total: Prisma.Decimal; rounding_adjustment: Prisma.Decimal } {
  const step =
    mode === "nearest_100" || mode === "up_100"
      ? 100
      : mode === "nearest_500" || mode === "up_500"
        ? 500
        : mode === "nearest_1000"
          ? 1000
          : null;

  if (!step) {
    return { total: rawTotal, rounding_adjustment: new Prisma.Decimal(0) };
  }

  const stepDecimal = new Prisma.Decimal(step);
  const isUp = mode === "up_100" || mode === "up_500";
  const divided = rawTotal.dividedBy(stepDecimal);
  const roundedSteps = isUp ? divided.ceil() : divided.toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP);
  const total = roundedSteps.times(stepDecimal);

  return { total, rounding_adjustment: total.minus(rawTotal) };
}
