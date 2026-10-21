// Cermin aturan SalesService.finalizePayment di server, supaya kasir tahu
// masalahnya sebelum menekan Simpan — bukan setelah transaksi ditolak:
// - kembalian hanya bisa diberikan dari uang tunai di laci, jadi non-tunai
//   (QRIS/transfer/kartu) + kasbon tidak boleh melebihi total;
// - kasbon hanya menutup SISA tagihan (tidak boleh ada kembalian bila ada kasbon).

export interface PaymentLine {
  channel_type: string;
  amount: number;
  is_receivable?: boolean;
}

export interface PaymentCheck {
  /** Total yang sudah ditutup semua metode (termasuk kasbon). */
  covered: number;
  /** Sisa tagihan yang belum tertutup. */
  remaining: number;
  /** Kembalian tunai (0 bila ada pelanggaran aturan). */
  change: number;
  error: string | null;
}

export function checkPayments(total: number, payments: PaymentLine[]): PaymentCheck {
  let cash = 0;
  let nonCash = 0;
  let receivable = 0;
  for (const p of payments) {
    if (p.is_receivable) receivable += p.amount;
    else if (p.channel_type === "cash") cash += p.amount;
    else nonCash += p.amount;
  }

  const covered = cash + nonCash + receivable;
  let error: string | null = null;
  if (nonCash + receivable > total) {
    error = "Pembayaran non-tunai/kasbon melebihi total — kembalian hanya bisa dari tunai.";
  } else if (receivable > 0 && covered > total) {
    error = "Kasbon harus pas sebesar sisa tagihan — kasbon tidak boleh menghasilkan kembalian.";
  }

  return {
    covered,
    remaining: Math.max(0, total - covered),
    change: error ? 0 : Math.max(0, covered - total),
    error,
  };
}
