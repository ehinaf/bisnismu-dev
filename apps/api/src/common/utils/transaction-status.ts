import type { transaction_status } from "@bisnismu/db";

/**
 * Status transaksi yang uangnya nyata terjadi dan ikut dihitung di laci &
 * laporan. Penjualan yang (sebagian) di-refund tetap dihitung; transaksi
 * refund (status 'completed', nilai NEGATIF) mengurangi totalnya.
 */
export const COUNTED_STATUSES: transaction_status[] = ["completed", "refunded", "partially_refunded"];
