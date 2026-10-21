export function formatCurrency(amount: number | string): string {
  const value = typeof amount === "string" ? Number(amount) : amount;
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

/** Tarif persen dari API (string desimal, mis. "11.00") → "11%", "0,7%". */
export function formatPercent(rate: number | string): string {
  const value = typeof rate === "string" ? Number(rate) : rate;
  return `${new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 }).format(value)}%`;
}
