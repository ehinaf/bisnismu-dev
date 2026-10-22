/**
 * Nilai `trust proxy` Express dari env TRUST_PROXY, supaya di balik Caddy /
 * Cloudflare Tunnel `req.ip` (throttle per IP, audit_logs.ip_address) adalah
 * IP klien asli dari X-Forwarded-For, bukan IP proxy.
 * - kosong/"false" → mati (default dev: tidak ada proxy, header bisa dipalsukan)
 * - angka → jumlah hop proxy yang dipercaya
 * - selain itu → daftar subnet/kata kunci proxy-addr, mis. "loopback,uniquelocal"
 */
export function parseTrustProxy(value: string | undefined): number | string | undefined {
  const raw = value?.trim();
  if (!raw || raw === "false" || raw === "0") return undefined;
  if (/^\d+$/.test(raw)) return Number(raw);
  return raw
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .join(",");
}
