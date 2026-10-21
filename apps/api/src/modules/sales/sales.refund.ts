import { BadRequestException } from "@nestjs/common";
import { Prisma } from "@bisnismu/db";
import { roundMoney } from "./sales.pricing";

// Perhitungan refund — fungsi murni (tanpa DB), dipakai bersama oleh quote
// (pratinjau di dialog) dan refund sungguhan supaya angkanya selalu sama.

export interface RefundableLine {
  id: string;
  quantity: Prisma.Decimal;
  subtotal: Prisma.Decimal;
  /** Jumlah yang sudah di-refund sebelumnya (positif). */
  refundedQuantity: Prisma.Decimal;
}

export interface RefundableTransaction {
  subtotal: Prisma.Decimal;
  discount_total: Prisma.Decimal;
  tax_total: Prisma.Decimal;
  service_charge_total: Prisma.Decimal;
  delivery_fee: Prisma.Decimal;
  total: Prisma.Decimal;
  /** Total uang yang sudah dikembalikan oleh refund sebelumnya (positif). */
  refundedTotal: Prisma.Decimal;
}

export interface RefundSelection {
  lineId: string;
  quantity: Prisma.Decimal;
}

export interface RefundComputation {
  lines: Array<{ lineId: string; quantity: Prisma.Decimal; value: Prisma.Decimal }>;
  /** Komponen (positif) untuk dicatat negatif di transaksi refund. */
  subtotal: Prisma.Decimal;
  discount: Prisma.Decimal;
  tax: Prisma.Decimal;
  serviceCharge: Prisma.Decimal;
  rounding: Prisma.Decimal;
  /** Uang yang dikembalikan (positif). */
  amount: Prisma.Decimal;
  /** true = setelah refund ini semua item sudah habis di-refund. */
  isFinal: boolean;
}

/**
 * Jumlah refund = bagian dari (total − ongkir) sebanding nilai barang yang
 * dikembalikan terhadap subtotal — diskon, pajak, service charge & pembulatan
 * ikut prorata. Refund yang menghabiskan semua item mengembalikan SISA persis
 * (total − yang sudah dikembalikan, termasuk ongkir), jadi Σ refund = total.
 */
export function computeRefund(
  transaction: RefundableTransaction,
  lines: RefundableLine[],
  selection: RefundSelection[],
): RefundComputation {
  if (selection.length === 0) throw new BadRequestException("Pilih minimal satu item untuk di-refund");

  const selected: RefundComputation["lines"] = [];
  const requested = new Map<string, Prisma.Decimal>();
  for (const s of selection) {
    const line = lines.find((l) => l.id === s.lineId);
    if (!line) throw new BadRequestException("Item refund tidak ditemukan di transaksi ini");
    if (s.quantity.lessThanOrEqualTo(0)) throw new BadRequestException("Jumlah refund harus lebih dari 0");
    if (requested.has(line.id)) throw new BadRequestException("Item refund tidak boleh duplikat");

    const remaining = line.quantity.minus(line.refundedQuantity);
    if (s.quantity.greaterThan(remaining)) {
      throw new BadRequestException(`Jumlah refund melebihi sisa item (sisa ${remaining.toString()})`);
    }
    requested.set(line.id, s.quantity);
    selected.push({
      lineId: line.id,
      quantity: s.quantity,
      value: roundMoney(line.subtotal.times(s.quantity).dividedBy(line.quantity)),
    });
  }

  const isFinal = lines.every((l) => l.refundedQuantity.plus(requested.get(l.id) ?? 0).greaterThanOrEqualTo(l.quantity));
  const subtotal = selected.reduce((sum, l) => sum.plus(l.value), new Prisma.Decimal(0));
  const ratio = transaction.subtotal.isZero() ? new Prisma.Decimal(0) : subtotal.dividedBy(transaction.subtotal);
  const remainingMoney = Prisma.Decimal.max(transaction.total.minus(transaction.refundedTotal), 0);

  const prorated = roundMoney(transaction.total.minus(transaction.delivery_fee).times(ratio));
  const amount = isFinal ? remainingMoney : Prisma.Decimal.min(prorated, remainingMoney);

  const discount = roundMoney(transaction.discount_total.times(ratio));
  const tax = roundMoney(transaction.tax_total.times(ratio));
  const serviceCharge = roundMoney(transaction.service_charge_total.times(ratio));
  // Penyeimbang: komponen yang tercatat selalu menjumlah persis ke amount.
  const rounding = amount.minus(subtotal.minus(discount).plus(tax).plus(serviceCharge));

  return { lines: selected, subtotal, discount, tax, serviceCharge, rounding, amount, isFinal };
}

/**
 * Pembagian uang refund: bila penjualan asli dibayar (sebagian) dengan kasbon,
 * sisa piutang yang BELUM dibayar dikurangi lebih dulu — pelanggan tidak
 * menerima uang untuk barang yang belum ia bayar. Sisanya dibayarkan keluar.
 */
export function allocateRefund(
  amount: Prisma.Decimal,
  receivableUnpaid: Prisma.Decimal,
): { receivableReduction: Prisma.Decimal; paidOut: Prisma.Decimal } {
  const receivableReduction = Prisma.Decimal.min(amount, Prisma.Decimal.max(receivableUnpaid, 0));
  return { receivableReduction, paidOut: amount.minus(receivableReduction) };
}
