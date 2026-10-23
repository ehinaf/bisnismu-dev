// Tanggal kalender LOKAL (YYYY-MM-DD) — toISOString() memberi tanggal UTC, yang di
// WIB antara 00:00–07:00 masih "kemarin".
export function localIsoDate(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function todayIso() {
  return localIsoDate(new Date());
}

export function daysAgoIso(days: number) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return localIsoDate(d);
}

export function monthStartIso() {
  const d = new Date();
  return localIsoDate(new Date(d.getFullYear(), d.getMonth(), 1));
}
