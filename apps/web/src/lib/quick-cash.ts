// Pecahan uang kertas yang lazim dibayarkan pembeli.
const NOTE_STEPS = [5_000, 10_000, 20_000, 50_000, 100_000];

/**
 * Saran nominal tunai untuk tagihan `due`: tagihan dibulatkan ke atas ke
 * kelipatan tiap pecahan, harus lebih besar dari tagihan, tanpa duplikat.
 * Mis. 37.500 → [40.000, 50.000, 100.000]; 8.000 → [10.000, 20.000, 50.000, 100.000].
 */
export function suggestCashAmounts(due: number, max = 4): number[] {
  const amounts = new Set<number>();
  for (const step of NOTE_STEPS) {
    const rounded = Math.ceil(due / step) * step;
    if (rounded > due) amounts.add(rounded);
  }
  return [...amounts].sort((a, b) => a - b).slice(0, max);
}
