// Util CSV kecil — escaping standar RFC 4180 (bungkus dengan tanda kutip
// jika field mengandung koma/kutip/baris baru, kutip ganda di-escape jadi "").
function escapeCsvField(value: unknown): string {
  if (value === null || value === undefined) return "";
  const str = String(value);
  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const lines = [
    headers.join(","),
    ...rows.map((row) => headers.map((h) => escapeCsvField(row[h])).join(",")),
  ];
  return lines.join("\n");
}
