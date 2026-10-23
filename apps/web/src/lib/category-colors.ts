// Aksen warna kategori untuk tile kasir (ala Square): rona redup yang tetap
// terbaca di mode terang & gelap. Hanya untuk garis penanda — teks tetap
// memakai token foreground, jadi kontras tidak bergantung pada warna ini.
const PALETTE = [
  "hsl(212 70% 55%)", // biru
  "hsl(152 45% 42%)", // hijau
  "hsl(28 80% 55%)", // jingga
  "hsl(268 45% 60%)", // ungu
  "hsl(350 60% 58%)", // merah muda
  "hsl(186 55% 42%)", // teal
  "hsl(45 85% 50%)", // kuning
  "hsl(220 12% 55%)", // abu kebiruan
];

/** Warna tetap per kategori (hash id) — sama di setiap perangkat & sesi. */
export function categoryColor(categoryId: string | null): string | null {
  if (!categoryId) return null;
  let hash = 0;
  for (let i = 0; i < categoryId.length; i++) hash = (hash * 31 + categoryId.charCodeAt(i)) >>> 0;
  return PALETTE[hash % PALETTE.length];
}
